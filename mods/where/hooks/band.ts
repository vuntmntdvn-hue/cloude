import type { Color } from 'claude-code'

import type { Activity, ContextReading, Where } from '../types'
import { money, percent, tokenCount } from './copy'
import type { FrameLine, Segment } from './frame'
import { linesLabel, splitPath, tildify } from './view'

/** What the band shows, worked out from the panel's own data. */
export type BandData = {
  folder: string
  isWorktree: boolean
  /** Null outside a git repository. */
  branch: { label: string; ahead: number; behind: number; hasUpstream: boolean } | null
  /** Null outside a git repository. */
  changes: { files: number; staged: number; added: number; deleted: number } | null
  /** Null until the first reading. */
  context: { percent: number | null; tokens: number | null; window: number } | null
  /** Null until a response reports any. */
  tokens: { input: number; output: number; usd: number | null } | null
}

// The band's parts, by how long they stay as the width shrinks: the lowest
// go first. The folder and branch are never dropped, only cut.
const KEEP = 5
const MAIN = 4
const LINES = 3
const DETAIL = 2
const BAR = 1
const TOKENS = 0

const BAR_CELLS = 10
const SEPARATOR = ' │ '
// Context fill at which the bar turns from green to amber, and from amber to red.
const CONTEXT_WARN = 50
const CONTEXT_ALERT = 80

type Part = { priority: number; segments: Segment[] }
type Group = Part[]

export function bandData(
  where: Where | null,
  activity: Activity | null,
  context: ContextReading | null,
  home: string | undefined,
): BandData {
  const files = where?.git?.files ?? []
  const branch = where?.git?.branch
  const used = activity?.tokens
  const hasTokens = used !== undefined && used.input + used.output + used.cacheRead + used.cacheWrite > 0
  const usd = activity?.meter?.usd ?? null

  return {
    folder: where === null ? '…' : splitPath(tildify(where.cwd, home)).name,
    isWorktree: where?.worktreeOf != null,
    branch:
      branch === undefined
        ? null
        : {
            label: branch.head ?? (branch.oid === null ? 'detached' : branch.oid.slice(0, 7)),
            ahead: branch.ahead,
            behind: branch.behind,
            hasUpstream: branch.upstream !== null,
          },
    changes:
      where?.git == null
        ? null
        : {
            files: new Set(files.map(file => file.path)).size,
            staged: files.filter(file => file.group === 'staged').length,
            added: files.reduce((sum, file) => sum + (typeof file.lines === 'object' ? file.lines.added : 0), 0),
            deleted: files.reduce((sum, file) => sum + (typeof file.lines === 'object' ? file.lines.deleted : 0), 0),
          },
    context:
      context === null ? null : { percent: context.percent, tokens: context.tokens, window: context.window },
    tokens:
      !hasTokens && usd === null
        ? null
        : {
            input: used === undefined ? 0 : used.input + used.cacheWrite,
            output: used?.output ?? 0,
            usd,
          },
  }
}

/**
 * The band as one line no wider than `width`: folder and branch, the changes,
 * the context, the tokens. As the width shrinks the tokens go first, then the
 * context bar, then the staged count and context amount, then the line counts;
 * what is still too wide is cut with `…`.
 */
export function buildBand(data: BandData, width: number): FrameLine {
  let groups = bandGroups(data)

  for (const priority of [TOKENS, BAR, DETAIL, LINES]) {
    if (length(render(groups)) <= width) break
    groups = groups.map(group => group.filter(part => part.priority > priority)).filter(group => group.length > 0)
  }

  return cut(render(groups), width)
}

function bandGroups(data: BandData): Group[] {
  return [placeGroup(data), changesGroup(data), contextGroup(data), tokensGroup(data)].filter(
    (group): group is Group => group !== null && group.length > 0,
  )
}

/** `cloude ⑂ ⎇ main ✓`. */
function placeGroup(data: BandData): Group {
  const place: Segment[] = [{ text: data.folder, isBold: true }, ...(data.isWorktree ? [dim(' ⑂')] : [])]

  if (data.branch === null) return [{ priority: KEEP, segments: [...place, dim('  no git')] }]

  return [
    {
      priority: KEEP,
      segments: [...place, dim(' ⎇ '), { text: data.branch.label, color: 'claude', isBold: true }, plain(' '), sync(data.branch)],
    },
  ]
}

/** `✓` in step with its upstream, `↑2` to push, `↓1` to pull, both when it has diverged, `·` with no upstream. */
function sync(branch: NonNullable<BandData['branch']>): Segment {
  const { ahead, behind, hasUpstream } = branch

  if (!hasUpstream) return dim('·')
  if (ahead > 0 && behind > 0) return { text: `↑${ahead}↓${behind}`, color: 'error' }
  if (ahead > 0) return { text: `↑${ahead}`, color: 'warning' }
  if (behind > 0) return { text: `↓${behind}`, color: 'suggestion' }

  return { text: '✓', color: 'success' }
}

/** `13 files (2 staged) +692 −297`, or `clean`. */
function changesGroup(data: BandData): Group | null {
  if (data.changes === null) return null

  const { files, staged, added, deleted } = data.changes

  if (files === 0) return [{ priority: MAIN, segments: [{ text: 'clean', color: 'success' }] }]

  const label = linesLabel({ added, deleted })
  const lines: Segment[] = [
    ...(label.added === null ? [] : [plain(' '), { text: label.added, color: 'success' as Color }]),
    ...(label.deleted === null ? [] : [plain(' '), { text: label.deleted, color: 'error' as Color }]),
  ]

  return [
    { priority: MAIN, segments: [plain(`${files} ${files === 1 ? 'file' : 'files'}`)] },
    { priority: DETAIL, segments: staged === 0 ? [] : [dim(` (${staged} staged)`)] },
    { priority: LINES, segments: lines },
  ].filter(part => part.segments.length > 0)
}

/** `ctx ███████░░░ 77% 772k/1M`. */
function contextGroup(data: BandData): Group | null {
  if (data.context === null || data.context.percent === null) return null

  const { percent: filled, tokens, window } = data.context
  const color = filled >= CONTEXT_ALERT ? 'error' : filled >= CONTEXT_WARN ? 'warning' : 'success'
  const cells = Math.max(0, Math.min(BAR_CELLS, Math.round(filled / (100 / BAR_CELLS))))

  return [
    { priority: MAIN, segments: [dim('ctx')] },
    { priority: BAR, segments: [plain(' '), { text: '█'.repeat(cells), color }, dim('░'.repeat(BAR_CELLS - cells))] },
    { priority: MAIN, segments: [plain(' '), { text: percent(filled), color }] },
    { priority: DETAIL, segments: tokens === null ? [] : [dim(` ${tokenCount(tokens)}/${tokenCount(window)}`)] },
  ].filter(part => part.segments.length > 0)
}

/** `199k in · 161k out · $46.45`. */
function tokensGroup(data: BandData): Group | null {
  if (data.tokens === null) return null

  const { input, output, usd } = data.tokens
  const counts = input + output > 0 ? [dim(`${tokenCount(input)} in · ${tokenCount(output)} out`)] : []
  const cost = usd === null ? [] : [...(counts.length > 0 ? [dim(' · ')] : []), { text: money(usd), color: 'success' as Color }]

  return [{ priority: TOKENS, segments: [...counts, ...cost] }].filter(part => part.segments.length > 0)
}

function render(groups: readonly Group[]): Segment[] {
  return groups.flatMap((group, index) => [
    ...(index === 0 ? [] : [dim(SEPARATOR)]),
    ...group.flatMap(part => part.segments),
  ])
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

function length(segments: readonly Segment[]): number {
  return segments.reduce((sum, segment) => sum + segment.text.length, 0)
}

function plain(text: string): Segment {
  return { text }
}

function dim(text: string): Segment {
  return { text, isDim: true }
}
