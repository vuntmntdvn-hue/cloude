import type { Elements, RenderChildren, RenderSurface } from 'claude-code'

import type { Activity, ContextReading, FileGroup, Lane, LineCounts, LogEntry, TokenCounts } from '../types'
import { freshTokens } from './activity'
import { contextBar, contextLegend } from './context'
import type { FoldSection, PanelControls } from './controls'
import { agentName, ago, did, doing, money, onFile, timeOfDay, tokenCount } from './copy'
import {
  avatar,
  BRANCH_ICON,
  CHECK_ICON,
  chip,
  dot,
  FOLDER_ICON,
  HAIRLINE_RULE,
  ring,
  segmentedBar,
  SPINNER_ICON,
  stateBar,
} from './icons'
import { categoryColor, laneStyle, TONE_COLOR, TONE_FILL, TONE_TINT } from './palette'
import type { PanelData, PanelRow } from './panel-data'
import { GROUP_ORDER, GROUP_TONE, linesLabel } from './view'
import type { Tag } from './view'

type Ui = Elements[RenderSurface]

const RECENT_ROWS = 4
// The context bar splits its width in this many shares, so every used part
// keeps at least one; and how many parts its legend names.
const BAR_SHARES = 200
const LEGEND_PARTS = 3

// The big numbers' labels, as the design names them.
const STAT_LABEL: Readonly<Record<FileGroup, string>> = {
  conflicted: 'conflicts',
  staged: 'staged',
  changed: 'modified',
  untracked: 'new',
}

// Translucent fills that sit on light and dark themes alike: a card's ground
// and the folder's icon tile. A card's edge is its ground's own color: the
// border gives the round corners and draws no outline.
const CARD_TINT = 'rgba(128, 128, 128, 0.05)'
const CARD_EDGE = CARD_TINT
const TILE_TINT = 'rgba(128, 128, 128, 0.12)'
// Claude's clay, for the context ring: a picture takes no theme key.
const CLAY = '#D97757'

const ICON_SIZE = 14
const TILE_ICON_SIZE = 18
const AVATAR_SIZE = 24
const RING_SIZE = 64
const LEGEND_DOT_SIZE = 8
const STATE_BAR_SIZE = { width: 4, height: 16 }

/**
 * The panel in a modern desktop look: the workspace on top, then cards for
 * the changes, the context and the activity. `now` is the clock, for the
 * "1m" times.
 */
export function drawNativePanel(ui: Ui, data: PanelData, now: number, controls: PanelControls) {
  const { Box, Text } = ui

  return (
    <Box flexDirection="column" gap="md">
      {workspace(ui, data)}
      {data.error !== null && (
        <Text size="caption" color="error">
          {data.error}
        </Text>
      )}
      {data.branch !== null && changesCard(ui, data, controls)}
      {data.context !== null && contextCard(ui, data.context, controls)}
      {data.activity !== null && activityCard(ui, data.activity, now, data.folds.activity, controls)}
    </Box>
  )
}

/** The folder in an icon tile with its path, and the branch over how it stands. */
function workspace(ui: Ui, data: PanelData) {
  const { Box, Text } = ui

  return (
    <Box flexDirection="row" alignItems="center" gap="sm">
      <Box padding="xs" {...tint(ui, TILE_TINT)} {...rounded(ui)}>
        {picture(ui, FOLDER_ICON, 'Folder', TILE_ICON_SIZE)}
      </Box>
      <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0}>
        <Text size="heading" weight="semibold" wrap="truncate-end">
          {data.folder.name}
        </Text>
        {data.folder.under !== '' && (
          <Text size="caption" dimColor wrap="truncate-start">
            {data.folder.under}
          </Text>
        )}
      </Box>
      {data.branch === null ? (
        <Text size="caption" dimColor>
          Not a git repository
        </Text>
      ) : (
        <Box flexDirection="column" alignItems="flex-end" gap="xs" flexShrink={1} minWidth={0}>
          <Box flexDirection="row" alignItems="center" gap="xs">
            {picture(ui, BRANCH_ICON, 'Branch', ICON_SIZE)}
            <Text weight="semibold" wrap="truncate-start">
              {data.branch.label}
            </Text>
          </Box>
          {pill(ui, data.branch.sync)}
        </Box>
      )}
    </Box>
  )
}

/** A card: a faint ground with a soft round edge, its title row on top. */
function card(ui: Ui, title: string, extras: RenderChildren[], body: RenderChildren[]) {
  const { Box, Text } = ui

  return (
    <Box flexDirection="column" gap="md" paddingX="md" paddingY="md" {...tint(ui, CARD_TINT)} {...rounded(ui)}>
      <Box flexDirection="row" alignItems="center" gap="sm">
        <Text size="footnote" weight="semibold" dimColor>
          {title}
        </Text>
        <Box flexGrow={1} />
        {extras}
      </Box>
      {body}
    </Box>
  )
}

/** The counts as large numbers, the split strip, then the files by folder; folded, the title row alone. */
function changesCard(ui: Ui, data: PanelData, controls: PanelControls) {
  const { Box, Text } = ui
  const isFolded = data.folds.files
  const extras = [
    data.changes === null ? null : lineCounts(ui, data.changes.totals),
    foldButton(ui, 'files', isFolded, controls),
  ]

  if (isFolded) return card(ui, 'Changes', extras, [])

  const added = data.changes?.totals.added ?? 0
  const deleted = data.changes?.totals.deleted ?? 0

  return card(ui, 'Changes', extras, [
    data.changes === null ? cleanLine(ui) : stats(ui, data.changes.counts),
    added + deleted > 0 &&
      picture(
        ui,
        segmentedBar([
          { share: added, fill: TONE_FILL.good },
          { share: deleted, fill: TONE_FILL.danger },
        ]),
        `${added} lines added, ${deleted} removed`,
      ),
    ...data.files.tree.map(({ folder, rows }) => (
      <Box flexDirection="column">
        <Text size="caption" dimColor wrap="truncate-start">
          {folder}
        </Text>
        {rows.map(row => fileRow(ui, row, data.activity))}
      </Box>
    )),
    data.files.hiddenRows > 0 && (
      <Text size="caption" dimColor>
        {`+${data.files.hiddenRows} more`}
      </Text>
    ),
  ])
}

function cleanLine(ui: Ui) {
  const { Box, Text } = ui

  return (
    <Box flexDirection="row" alignItems="center" gap="xs">
      {picture(ui, CHECK_ICON, 'Clean', ICON_SIZE)}
      <Text color="success">Nothing to commit</Text>
    </Box>
  )
}

/** A large number per group over its name: staged, modified, new, and conflicts when there are any. */
function stats(ui: Ui, counts: Record<FileGroup, number>) {
  const { Box, Text } = ui
  const groups = GROUP_ORDER.filter(group => group !== 'conflicted' || counts.conflicted > 0)

  return (
    <Box flexDirection="row" gap="sm">
      {groups.map(group => (
        <Box flexDirection="column" flexGrow={1} width={0}>
          <Text
            size="title"
            weight="semibold"
            tabular
            {...(group === 'untracked' || counts[group] === 0 ? {} : { color: TONE_COLOR[GROUP_TONE[group]] })}
          >
            {String(counts[group])}
          </Text>
          <Text size="caption" dimColor wrap="truncate-end">
            {STAT_LABEL[group]}
          </Text>
        </Box>
      ))}
    </Box>
  )
}

/** A slim bar per state (dashed and hollow for a file only in use), the name, the agent on it, the counts. */
function fileRow(ui: Ui, row: PanelRow, activity: Activity | null) {
  const { Box, Text } = ui

  return (
    <Box flexDirection="row" alignItems="center" gap="sm">
      {row.isInUse
        ? picture(ui, stateBar(TONE_FILL.quiet, true), 'In use', STATE_BAR_SIZE)
        : row.groups.map(group =>
            picture(ui, stateBar(TONE_FILL[GROUP_TONE[group]], false), STAT_LABEL[group], STATE_BAR_SIZE),
          )}
      <Box flexGrow={1} flexShrink={1} minWidth={0}>
        <Text
          wrap="truncate-end"
          strikethrough={row.isDeleted}
          dimColor={row.isDeleted || row.isInUse}
          italic={row.isNew}
        >
          {row.name}
        </Text>
      </Box>
      {agentChip(ui, row, activity)}
      {row.lines === 'binary' ? (
        <Text size="caption" dimColor>
          binary
        </Text>
      ) : (
        row.lines !== null && lineCounts(ui, row.lines)
      )}
    </Box>
  )
}

/** A rounded, breathing pill naming the agent on this file and what it does: `Claude · editing`. */
function agentChip(ui: Ui, row: PanelRow, activity: Activity | null) {
  const { Text } = ui
  const index =
    activity?.lanes.findIndex(lane =>
      lane.running.some(call => call.filePath?.endsWith(`/${row.path}`) ?? false),
    ) ?? -1

  if (activity === null || index < 0) return null

  const lane = activity.lanes[index] as Lane
  const call = lane.running.find(one => one.filePath?.endsWith(`/${row.path}`) ?? false)
  const style = laneStyle(index)
  const label = `${index === 0 ? 'Claude' : lane.label}${call === undefined ? '' : ` · ${onFile(call.op)}`}`

  if (!isGraphical(ui)) {
    return (
      <Text size="caption" color={style.text}>
        {label}
      </Text>
    )
  }

  const pill = chip(label, style.fill, style.tint, style.fill)

  return picture(ui, pill.source, label, pill, true)
}

/** The ring and the amount, the strip split by what fills the window, the largest parts. */
function contextCard(ui: Ui, reading: ContextReading, controls: PanelControls) {
  const { Box, Text } = ui
  const { tokens, window, percent: filled, parts, compactAt } = reading
  const legend = contextLegend(parts, LEGEND_PARTS)
  const left = compactAt === null || tokens === null ? null : Math.max(0, compactAt - tokens)
  const runs = contextBar(parts, BAR_SHARES)

  return card(ui, 'Context', [compactButton(ui, controls)], [
    <Box flexDirection="row" alignItems="center" gap="md">
      {filled !== null && picture(ui, ring(filled, CLAY), `${Math.round(filled)}% of the context used`, RING_SIZE)}
      <Box flexDirection="column" flexShrink={1} minWidth={0}>
        {tokens === null ? (
          <Text dimColor>Counting from the first response</Text>
        ) : (
          <Box flexDirection="row" alignItems="flex-end" gap="xs">
            <Text size="heading" weight="semibold" tabular>
              {tokenCount(tokens)}
            </Text>
            <Text dimColor>{`of ${tokenCount(window)}`}</Text>
          </Box>
        )}
        <Text size="caption" dimColor wrap="truncate-end">
          {left === null ? (compactAt === null ? 'Auto-compact is off' : '') : `${tokenCount(left)} until auto-compact`}
        </Text>
      </Box>
    </Box>,
    runs.length > 0 &&
      picture(
        ui,
        segmentedBar(runs.map(run => ({ share: run.cells, fill: categoryColor(run.name, run.kind) }))),
        'What fills the context window',
      ),
    legend.shown.length > 0 && (
      <Box flexDirection="row" flexWrap="wrap" columnGap="md" rowGap="xs">
        {legend.shown.map(part => (
          <Box flexDirection="row" alignItems="center" gap="xs">
            {isGraphical(ui) ? (
              picture(ui, dot(categoryColor(part.name, part.kind)), part.name, LEGEND_DOT_SIZE)
            ) : (
              <Text size="caption" color={part.color}>
                ●
              </Text>
            )}
            <Text size="caption" dimColor>
              {`${part.name} ${tokenCount(part.tokens)}`}
            </Text>
          </Box>
        ))}
        {legend.more > 0 && (
          <Text size="caption" dimColor>
            {`+${legend.more} more`}
          </Text>
        )}
      </Box>
    ),
  ])
}

/** `Compact`, then for 5 seconds `Confirm compact`, drawn as the main action while it waits. */
function compactButton(ui: Ui, controls: PanelControls) {
  const { Button } = ui

  return controls.isCompactArmed ? (
    <Button key="compact" label="Confirm compact" variant="primary" onPress={controls.onCompact} />
  ) : (
    <Button key="compact" label="Compact" variant="secondary" onPress={controls.onCompact} />
  )
}

/** The agents, a rule, the latest actions, a rule, one quiet line of totals; folded, the title row alone. */
function activityCard(ui: Ui, data: Activity, now: number, isFolded: boolean, controls: PanelControls) {
  const { Box, Text } = ui
  const isWorking = data.lanes.some(lane => lane.running.length > 0)
  const status = isWorking ? 'Working' : data.isTurnActive ? 'Thinking' : 'Idle'
  const extras = [
    <Text size="caption" dimColor wrap="truncate-end">
      {`${status} · since ${timeOfDay(data.startedAt)}`}
    </Text>,
    foldButton(ui, 'activity', isFolded, controls),
  ]

  if (isFolded) return card(ui, 'Activity', extras, [])

  const recent = data.log.slice(-RECENT_ROWS).reverse()

  return card(ui, 'Activity', extras, [
    ...data.lanes.map((lane, index) => laneRow(ui, lane, index, data.isTurnActive, data.tokensByLabel[lane.label])),
    recent.length > 0 && rule(ui),
    recent.length > 0 && <Box flexDirection="column">{recent.map(entry => recentRow(ui, entry, now))}</Box>,
    rule(ui),
    totalsLine(ui, data),
  ])
}

/** A hairline across the card. */
function rule(ui: Ui) {
  return picture(ui, HAIRLINE_RULE, '')
}

/** An avatar, the agent's name over what it does, its tokens, a spinner while it works. */
function laneRow(ui: Ui, lane: Lane, index: number, isTurnActive: boolean, tokens: TokenCounts | undefined) {
  const { Box, Text } = ui
  const call = lane.running[lane.running.length - 1]
  const isThinking = call === undefined && lane.agentId === null && isTurnActive
  const more = lane.running.length > 1 ? ` · ${lane.running.length} running` : ''
  const what = call === undefined ? (isThinking ? 'Thinking…' : 'Idle') : `${doing(call.op, call.target)}${more}`
  const used = tokens === undefined ? 0 : freshTokens(tokens)

  return (
    <Box flexDirection="row" alignItems="center" gap="sm">
      {picture(ui, avatar(laneStyle(index).fill, index === 0 ? null : lane.label), agentName(lane.label), AVATAR_SIZE)}
      <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0}>
        <Text weight="semibold" wrap="truncate-end">
          {agentName(lane.label)}
        </Text>
        <Text size="caption" dimColor wrap="truncate-end">
          {what}
        </Text>
      </Box>
      {used > 0 && (
        <Text size="caption" dimColor tabular>
          {tokenCount(used)}
        </Text>
      )}
      {(call !== undefined || isThinking) && picture(ui, SPINNER_ICON, 'Working', ICON_SIZE, true)}
    </Box>
  )
}

/** `✓ Edited panel.tsx  +3 −1  1m`; a subagent's action names it, a refused one says so. */
function recentRow(ui: Ui, entry: LogEntry, now: number) {
  const { Box, Text } = ui
  const isRefused = entry.outcome.kind === 'denied' || entry.outcome.kind === 'failed'
  const who = entry.label === 'main' ? '' : `${entry.label} · `
  const why = isRefused ? ` · ${entry.outcome.kind}` : ''

  return (
    <Box flexDirection="row" alignItems="center" gap="xs">
      <Text color={isRefused ? 'error' : 'success'}>{isRefused ? '✗' : '✓'}</Text>
      <Box flexGrow={1} flexShrink={1} minWidth={0}>
        <Text wrap="truncate-end">{`${who}${did(entry.op, entry.target)}${why}`}</Text>
      </Box>
      {entry.outcome.kind === 'lines' && lineCounts(ui, entry.outcome)}
      <Text size="caption" dimColor tabular>
        {ago(now - entry.at)}
      </Text>
    </Box>
  )
}

/** `4 reads · 26 edits · 56 calls` on the left, `44k in · 34k out · $29.62` on the right. */
function totalsLine(ui: Ui, data: Activity) {
  const { Box, Text } = ui
  const { reads, edits, calls } = data.counters
  const { input, output, cacheRead, cacheWrite } = data.tokens
  const tokens = [
    ...(input + cacheWrite + output + cacheRead > 0
      ? [`${tokenCount(input + cacheWrite)} in`, `${tokenCount(output)} out`]
      : []),
    ...(data.meter?.usd == null ? [] : [money(data.meter.usd)]),
  ]

  return (
    <Box flexDirection="row" flexWrap="wrap" columnGap="md">
      <Text size="caption" dimColor>
        {`${reads} reads · ${edits} edits · ${calls} calls`}
      </Text>
      <Box flexGrow={1} />
      {tokens.length > 0 && (
        <Text size="caption" dimColor>
          {tokens.join(' · ')}
        </Text>
      )}
    </Box>
  )
}

/** `+12 −3` in green and red; a zero side is left out. */
function lineCounts(ui: Ui, lines: LineCounts) {
  const { Box, Text } = ui
  const label = linesLabel(lines)

  return (
    <Box flexDirection="row" gap="xs">
      {label.added !== null && (
        <Text size="caption" color="success" tabular>
          {label.added}
        </Text>
      )}
      {label.deleted !== null && (
        <Text size="caption" color="error" tabular>
          {label.deleted}
        </Text>
      )}
    </Box>
  )
}

/** `Hide` or `Show` for a card, as quiet text: dim until the pointer or focus is on it. */
function foldButton(ui: Ui, section: FoldSection, isFolded: boolean, controls: PanelControls) {
  const { Button } = ui

  return (
    <Button key={`fold-${section}`} label={isFolded ? 'Show' : 'Hide'} dimColor plain onPress={() => controls.onFold(section)} />
  )
}

/** A rounded pill in the tone's colors; where pictures are not drawn, the label in the tone's color. */
function pill(ui: Ui, { text, tone }: Tag) {
  const { Text } = ui

  if (!isGraphical(ui)) {
    return (
      <Text size="caption" color={TONE_COLOR[tone]}>
        {text}
      </Text>
    )
  }

  const shape = chip(text, TONE_FILL[tone], TONE_TINT[tone])

  return picture(ui, shape.source, text, shape)
}

/** A background tint where the surface draws one; the terminal goes without. */
function tint(ui: Ui, color: string): { backgroundColor?: string } {
  return isGraphical(ui) ? { backgroundColor: color } : {}
}

/**
 * A soft round edge, for cards and the icon tile only: on small things the
 * border adds height. The terminal would draw it as lines, so it goes without.
 */
function rounded(ui: Ui): { borderStyle?: string; borderColor?: string } {
  return isGraphical(ui) ? { borderStyle: 'round', borderColor: CARD_EDGE } : {}
}

/**
 * A picture where the surface draws Svg; the terminal goes without. Sized by
 * a number (a square) or a width and height; unsized, it fills the width. An
 * animated one is drawn interactive, where SMIL runs.
 */
function picture(
  ui: Ui,
  source: string,
  alt: string,
  size?: number | { width: number; height: number },
  isAnimated = false,
) {
  if (!isGraphical(ui)) return null

  const { Svg } = ui
  const animated = isAnimated ? { isInteractive: true } : {}

  if (size === undefined) return <Svg source={source} alt={alt} {...animated} />

  const { width, height } = typeof size === 'number' ? { width: size, height: size } : size

  return <Svg source={source} alt={alt} width={width} height={height} {...animated} />
}

/** Whether the surface draws pictures (desktop, mobile, VS Code), not cells. */
function isGraphical(ui: Ui): ui is Extract<Ui, { Svg: unknown }> {
  return 'Svg' in ui
}
