import type { Color } from 'claude-code'

import type { Activity, ContextReading, Lane, LineCounts, LogEntry, Outcome, TokenCounts } from '../types'
import { freshTokens } from './activity'
import { contextBar, contextLegend } from './context'
import type { BarRun } from './context'
import { money, percent, tokenCount } from './copy'
import { laneStyle, OP_COLOR, TONE_COLOR } from './palette'
import type { PanelChanges, PanelData, PanelFiles, PanelRow } from './panel-data'
import { GROUP_NAME, GROUP_ORDER, GROUP_TONE, linesLabel } from './view'

/** A run of text in one style. Colors are theme keys, so they follow light and dark mode. */
export type Segment = {
  text: string
  color?: Color
  isDim?: boolean
  isBold?: boolean
  isItalic?: boolean
  isStruck?: boolean
}

export type FrameLine = Segment[]

// The frame keeps to this width range, in character cells.
const MIN_WIDTH = 40
const MAX_WIDTH = 72
const SPINNER = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
const IDLE_MARK = '·'
const BAR_CELLS = 9
const LOG_ROWS = 4
// How many parts of the context the legend names.
const LEGEND_PARTS = 3
// Frames per blink of the cursor and the markers on files being worked on.
const BLINK_FRAMES = 4
const OP_WIDTH = 7
const LABEL_WIDTH = 6

/**
 * The whole panel as lines of styled text: the WHERE box over the OPS box.
 * `frame` counts animation steps; `now` is the clock, for the session time.
 */
export function buildFrame(data: PanelData, frame: number, columns: number, now: number): FrameLine[] {
  const width = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.floor(columns)))

  return [
    ...whereBox(data, frame, width),
    ...opsBox(data.activity, data.context, data.folds.activity, frame, width, now),
  ]
}

function whereBox(data: PanelData, frame: number, width: number): FrameLine[] {
  const branch: Segment[] =
    data.branch === null
      ? [dim('not a git repo')]
      : [
          { text: data.branch.label, color: 'claude', isBold: true },
          plain(' '),
          { text: data.branch.sync.text, color: TONE_COLOR[data.branch.sync.tone] },
        ]
  const lines = [
    rule(width, '┌', '┐', [bold('WHERE')], branch),
    row(width, [bold(data.folder.name)], [dim(data.folder.under)]),
  ]

  if (data.error !== null) lines.push(row(width, [{ text: data.error, color: 'error' }]))
  if (data.branch === null) return lines

  const summary =
    data.changes === null
      ? [row(width, [{ text: '✓ ', color: 'success' }, plain('nothing to commit')])]
      : changeLines(data.changes, width)

  if (data.folds.files) return [...lines, ...summary]

  return [...lines, ...summary, ...fileLines(data.files, data.activity, frame, width)]
}

/** The group counts and the totals bar. */
function changeLines(changes: PanelChanges, width: number): FrameLine[] {
  const counts = GROUP_ORDER.filter(group => group !== 'conflicted' || changes.counts.conflicted > 0)
    .flatMap(group => [
      { text: '● ', color: TONE_COLOR[GROUP_TONE[group]] },
      dim(`${GROUP_NAME[group]} ${changes.counts[group]}  `),
    ])
  const lines = [row(width, counts)]
  const { added, deleted } = changes.totals

  if (added + deleted > 0) lines.push(row(width, totalsBar(changes.totals, width)))

  return lines
}

/** The files by folder, files in use among them. */
function fileLines(files: PanelFiles, activity: Activity | null, frame: number, width: number): FrameLine[] {
  const lines: FrameLine[] = []

  for (const { folder, rows } of files.tree) {
    lines.push(row(width, [dim(folder)]))

    for (const file of rows) {
      lines.push(row(width, fileLeft(file, activity, frame), fileRight(file)))
    }
  }

  if (files.hiddenRows > 0) lines.push(row(width, [dim(`+${files.hiddenRows} more`)]))

  return lines
}

/** `+548 −115  ▓▓▓▓▓▓▓▓▓▓▓▓`: the bar split by the share added and removed. */
function totalsBar(totals: LineCounts, width: number): Segment[] {
  const counts = lineCounts(totals)
  const cells = Math.max(0, inner(width) - length(counts) - 2)
  const green = Math.round((cells * totals.added) / (totals.added + totals.deleted))

  return [
    ...counts,
    plain('  '),
    { text: '▓'.repeat(green), color: 'success' },
    { text: '▓'.repeat(cells - green), color: 'error' },
  ]
}

/** A dot per state, or a hollow one for an unchanged file in use; the name; the agent's marker. */
function fileLeft(file: PanelRow, activity: Activity | null, frame: number): Segment[] {
  const dots: Segment[] = file.isInUse
    ? [dim('○')]
    : file.groups.map(group => ({ text: '●', color: TONE_COLOR[GROUP_TONE[group]] }))
  const name: Segment = {
    text: file.name,
    ...(file.isDeleted ? { isDim: true, isStruck: true } : {}),
    ...(file.isInUse ? { isDim: true } : {}),
    ...(file.isNew ? { isItalic: true } : {}),
  }

  return [plain(' '), ...dots, plain(' '), name, ...marker(file, activity, frame)]
}

/** A blinking `◀ main` beside a file an agent is reading or editing right now. */
function marker(file: PanelRow, activity: Activity | null, frame: number): Segment[] {
  const index = activity?.lanes.findIndex(lane =>
    lane.running.some(call => call.filePath?.endsWith(`/${file.path}`) ?? false),
  )

  if (activity === null || index === undefined || index < 0) return []

  const lane = activity.lanes[index] as Lane
  const text = ` ◀ ${lane.label}`

  return isBlinkOn(frame) ? [{ text, color: laneColor(index) }] : [plain(' '.repeat(text.length))]
}

function fileRight(file: PanelRow): Segment[] {
  if (file.lines === null) return []
  if (file.lines === 'binary') return [dim('binary')]

  return lineCounts(file.lines)
}

function opsBox(
  activity: Activity | null,
  context: ContextReading | null,
  isFolded: boolean,
  frame: number,
  width: number,
  now: number,
): FrameLine[] {
  if (activity === null) {
    return [rule(width, '├', '┤', [bold('OPS')], [dim(`${IDLE_MARK} IDLE`)]), rule(width, '└', '┘', [], [])]
  }

  const isWorking = activity.lanes.some(lane => lane.running.length > 0)
  const status: Segment = isWorking
    ? { text: `${SPINNER[frame % SPINNER.length]} WORKING`, color: 'warning' }
    : activity.isTurnActive
      ? { text: `${SPINNER[frame % SPINNER.length]} THINKING`, color: 'suggestion' }
      : dim(`${IDLE_MARK} IDLE`)
  const { reads, edits, calls } = activity.counters

  // Folded, the lanes and the log give way; the context and token rows stay.
  const work = isFolded
    ? []
    : [
        ...activity.lanes.map((lane, index) =>
          laneRow(lane, index, activity.isTurnActive, activity.tokensByLabel[lane.label], frame, width),
        ),
        [dim(`├${'─'.repeat(width - 2)}┤`)],
        ...logRows(activity.log, width),
        row(width, [dim('> '), isBlinkOn(frame) ? { text: '█', color: 'suggestion' } : plain(' ')]),
      ]

  return [
    rule(width, '├', '┤', [bold('OPS')], [status, dim(`  ${clock(now - activity.startedAt)}`)]),
    ...work,
    ...(context === null ? [] : contextRows(context, width)),
    ...tokenRow(activity, width),
    rule(
      width,
      '└',
      '┘',
      [dim(`R:${reads} E:${edits} CALLS:${calls}`)],
      lineCounts({ added: activity.counters.added, deleted: activity.counters.deleted }),
    ),
  ]
}

/** `⠹ main  EDIT   login.dart   120k ▓▓▓▓░░░░░`; a lane running several calls shows `READ×3`. */
function laneRow(
  lane: Lane,
  index: number,
  isTurnActive: boolean,
  tokens: TokenCounts | undefined,
  frame: number,
  width: number,
): FrameLine {
  const color = laneColor(index)
  const call = lane.running[lane.running.length - 1]
  const isThinking = call === undefined && lane.agentId === null && isTurnActive
  const isActive = call !== undefined || isThinking
  const op = call === undefined ? (isThinking ? 'THINK' : 'IDLE') : `${call.op}${lane.running.length > 1 ? `×${lane.running.length}` : ''}`
  const opColor: Color | undefined = call === undefined ? (isThinking ? 'suggestion' : undefined) : OP_COLOR[call.op]
  const filled = isActive ? (frame + index * 7) % (BAR_CELLS + 1) : 0
  const used = tokens === undefined ? 0 : freshTokens(tokens)

  return row(
    width,
    [
      { text: `${isActive ? SPINNER[(frame + index * 3) % SPINNER.length] : IDLE_MARK} `, color },
      plain(fit(lane.label, LABEL_WIDTH)),
      opColor === undefined ? dim(fit(op, OP_WIDTH)) : { text: fit(op, OP_WIDTH), color: opColor },
      dim(call?.target ?? ''),
    ],
    [
      ...(used > 0 ? [dim(` ${tokenCount(used)} `)] : []),
      { text: '▓'.repeat(filled), color },
      dim('░'.repeat(BAR_CELLS - filled)),
    ],
  )
}

/**
 * `CTX ████████░░░░░░▒▒▒  92k/200k 46%`, the bar split by what fills the
 * window in /context's colors, then the largest parts and where it compacts.
 */
function contextRows(context: ContextReading, width: number): FrameLine[] {
  const { tokens, window, percent: filled, parts, compactAt } = context
  const amount: Segment[] =
    tokens === null
      ? [dim(' waiting')]
      : [
          plain(` ${tokenCount(tokens)}/${tokenCount(window)}`),
          ...(filled === null ? [] : [plain(' '), { text: percent(filled), color: 'warning' as const }]),
        ]
  const cells = Math.max(0, inner(width) - 4 - length(amount))
  const bar = contextBar(parts, cells).map(run => barSegment(run))
  const legend = contextLegend(parts, LEGEND_PARTS)
  const named = legend.shown.flatMap(part => [
    { text: '●', color: part.color },
    dim(` ${part.name} ${tokenCount(part.tokens)}  `),
  ])

  return [
    row(width, [dim('CTX '), ...(bar.length > 0 ? bar : [dim('░'.repeat(cells))])], amount),
    ...(named.length === 0
      ? []
      : [
          row(
            width,
            [plain('    '), ...named, ...(legend.more > 0 ? [dim(`+${legend.more}`)] : [])],
            compactAt === null ? [] : [dim(`compact @${tokenCount(compactAt)}`)],
          ),
        ]),
  ]
}

function barSegment(run: BarRun): Segment {
  if (run.kind === 'used') return { text: '█'.repeat(run.cells), color: run.color }
  if (run.kind === 'free') return dim('░'.repeat(run.cells))

  return { text: '▒'.repeat(run.cells), color: 'subtle' }
}

/** `TOK in 182k out 24k cache 1.2M  $1.24`; nothing until something is reported. */
function tokenRow(activity: Activity, width: number): FrameLine[] {
  const { input, output, cacheRead, cacheWrite } = activity.tokens
  const meter = activity.meter
  const segments: Segment[] = []

  if (input + output + cacheRead + cacheWrite > 0) {
    segments.push(
      dim('TOK in '),
      { text: tokenCount(input + cacheWrite), color: 'suggestion' },
      dim(' out '),
      { text: tokenCount(output), color: 'suggestion' },
      dim(' cache '),
      { text: tokenCount(cacheRead), color: 'subtle' },
    )
  }
  if (meter?.usd != null) segments.push(dim('  '), { text: money(meter.usd), color: 'success' })

  return segments.length === 0 ? [] : [row(width, segments)]
}

/** The last few finished calls, newest at the bottom, padded so the box keeps its height. */
function logRows(log: readonly LogEntry[], width: number): FrameLine[] {
  const shown = log.slice(-LOG_ROWS).map(entry => logRow(entry, width))
  const padding = Array.from({ length: LOG_ROWS - shown.length }, () => row(width, []))

  return [...padding, ...shown]
}

/** `> EDIT panel.tsx ........ +12`; a subagent's entry names it: `> α READ api.dart … ok`. */
function logRow(entry: LogEntry, width: number): FrameLine {
  const left: Segment[] = [
    dim('> '),
    ...(entry.label === 'main' ? [] : [dim(`${entry.label} `)]),
    { text: `${entry.op} `, color: OP_COLOR[entry.op] },
    dim(`${entry.target} `),
  ]
  const right = outcome(entry.outcome)
  const dots = Math.max(0, inner(width) - length(left) - length(right) - 1)

  return row(width, [...left, dim('.'.repeat(dots))], [plain(' '), ...right])
}

function outcome(result: Outcome): Segment[] {
  switch (result.kind) {
    case 'ok':
      return [plain('ok')]
    case 'denied':
    case 'failed':
      return [{ text: result.kind, color: 'error' }]
    case 'lines': {
      const counts = lineCounts(result)

      return counts.length === 0 ? [plain('ok')] : counts
    }
  }
}

/** `+12 −3` in green and red; a zero side is left out. */
function lineCounts(lines: LineCounts): Segment[] {
  const label = linesLabel(lines)
  const segments: Segment[] = []

  if (label.added !== null) segments.push({ text: label.added, color: 'success' })
  if (label.added !== null && label.deleted !== null) segments.push(plain(' '))
  if (label.deleted !== null) segments.push({ text: label.deleted, color: 'error' })

  return segments
}

/** `┌─ TITLE ───────── right ─┐`; with nothing on the right, the dashes run to the corner. */
function rule(width: number, left: string, right: string, title: Segment[], tail: Segment[]): FrameLine {
  if (tail.length === 0) {
    const dashes = Math.max(1, width - 5 - length(title))

    return [dim(`${left}─ `), ...title, dim(` ${'─'.repeat(dashes)}${right}`)]
  }

  const room = Math.max(0, width - 9 - length(title))
  const cutTail = cut(tail, room)
  const dashes = Math.max(1, width - 8 - length(title) - length(cutTail))

  return [dim(`${left}─ `), ...title, dim(` ${'─'.repeat(dashes)} `), ...cutTail, dim(` ─${right}`)]
}

/** `│ left ……… right │`: the left side is cut first when both do not fit. */
function row(width: number, left: Segment[], right: Segment[] = []): FrameLine {
  const room = inner(width)
  const cutLeft = cut(left, Math.max(0, room - length(right)))
  const gap = Math.max(0, room - length(cutLeft) - length(right))

  return [dim('│ '), ...cutLeft, plain(' '.repeat(gap)), ...right, dim(' │')]
}

/** Cuts the segments to `max` characters, ending with `…` when it cut. */
function cut(segments: Segment[], max: number): Segment[] {
  if (length(segments) <= max) return segments

  const kept: Segment[] = []
  let left = Math.max(0, max - 1)

  for (const segment of segments) {
    if (left <= 0) break

    kept.push({ ...segment, text: segment.text.slice(0, left) })
    left -= Math.min(left, segment.text.length)
  }

  return max > 0 ? [...kept, dim('…')] : kept
}

function inner(width: number): number {
  return width - 4
}

function length(segments: readonly Segment[]): number {
  return segments.reduce((sum, segment) => sum + segment.text.length, 0)
}

/** The text in a column of `width`, cut with `…` so at least one space follows it. */
function fit(text: string, width: number): string {
  const shown = text.length > width - 1 ? `${text.slice(0, width - 2)}…` : text

  return shown.padEnd(width)
}

function clock(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  const parts = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]

  return parts.map(part => String(part).padStart(2, '0')).join(':')
}

function isBlinkOn(frame: number): boolean {
  return Math.floor(frame / BLINK_FRAMES) % 2 === 0
}

function laneColor(index: number): Color {
  return laneStyle(index).text
}

function plain(text: string): Segment {
  return { text }
}

function dim(text: string): Segment {
  return { text, isDim: true }
}

function bold(text: string): Segment {
  return { text, isBold: true }
}
