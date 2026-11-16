import type { Elements, RenderSurface } from 'claude-code'

import type { Activity, Lane, LineCounts, LogEntry, TokenCounts } from '../types'
import { freshTokens } from './activity'
import { agentName, ago, did, doing, money, percent, timeOfDay, tokenCount } from './copy'
import { avatar, BRANCH_ICON, CHECK_ICON, FOLDER_ICON, pulseDot, ratioBar, SPINNER_ICON } from './icons'
import { laneStyle, TONE_COLOR, TONE_TINT } from './palette'
import type { PanelChanges, PanelData, PanelRow } from './panel-data'
import { GROUP_NAME, GROUP_ORDER, GROUP_TONE, linesLabel } from './view'
import type { Tag } from './view'

type Ui = Elements[RenderSurface]

const RECENT_ROWS = 4
const ICON_SIZE = 14
const AVATAR_SIZE = 20
const DOT_SIZE = 7

/**
 * The panel in the desktop app's own look: the folder and branch, the
 * changes by folder, then each agent's activity and the latest actions.
 * `now` is the clock, for the "2s ago" times.
 */
export function drawNativePanel(ui: Ui, data: PanelData, now: number) {
  const { Box, Text } = ui

  return (
    <Box flexDirection="column" gap="md">
      {header(ui, data)}
      {data.error !== null && (
        <Text size="caption" color="error">
          {data.error}
        </Text>
      )}
      {data.branch !== null &&
        (data.changes === null ? cleanLine(ui) : changes(ui, data.changes, data.activity))}
      {data.activity !== null && activity(ui, data.activity, now)}
    </Box>
  )
}

function header(ui: Ui, data: PanelData) {
  const { Box, Text } = ui

  return (
    <Box flexDirection="row" justifyContent="space-between" gap="sm">
      <Box flexDirection="column" flexShrink={1} minWidth={0}>
        <Box flexDirection="row" alignItems="center" gap="xs">
          {picture(ui, FOLDER_ICON, 'Folder', ICON_SIZE + 2)}
          <Text size="heading" weight="semibold" wrap="truncate-end">
            {data.folder.name}
          </Text>
        </Box>
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

function cleanLine(ui: Ui) {
  const { Box, Text } = ui

  return (
    <Box flexDirection="row" alignItems="center" gap="xs">
      {picture(ui, CHECK_ICON, 'Clean', ICON_SIZE)}
      <Text color="success">Nothing to commit</Text>
    </Box>
  )
}

/** The group pills and totals, the split bar, then the files under their folders. */
function changes(ui: Ui, data: PanelChanges, activity: Activity | null) {
  const { Box, Text } = ui
  const groups = GROUP_ORDER.filter(group => group !== 'conflicted' || data.counts.conflicted > 0)
  const { added, deleted } = data.totals

  return (
    <Box flexDirection="column" gap="sm">
      <Box flexDirection="row" alignItems="center" gap="xs">
        {groups.map(group =>
          pill(ui, { text: `${data.counts[group]} ${GROUP_NAME[group]}`, tone: GROUP_TONE[group] }),
        )}
        <Box flexGrow={1} />
        {lineCounts(ui, data.totals)}
      </Box>
      {added + deleted > 0 &&
        picture(ui, ratioBar(added, deleted), `${added} lines added, ${deleted} removed`)}
      {data.tree.map(({ folder, rows }) => (
        <Box flexDirection="column">
          <Text size="caption" dimColor wrap="truncate-start">
            {folder}
          </Text>
          {rows.map(row => fileRow(ui, row, activity))}
        </Box>
      ))}
      {data.hiddenRows > 0 && (
        <Text size="caption" dimColor>
          {`+${data.hiddenRows} more`}
        </Text>
      )}
    </Box>
  )
}

function fileRow(ui: Ui, row: PanelRow, activity: Activity | null) {
  const { Box, Text } = ui

  return (
    <Box flexDirection="row" alignItems="center" gap="xs">
      {row.groups.map(group => (
        <Text size="caption" color={TONE_COLOR[GROUP_TONE[group]]}>
          ●
        </Text>
      ))}
      <Box flexGrow={1} flexShrink={1} minWidth={0}>
        <Text wrap="truncate-end" strikethrough={row.isDeleted} dimColor={row.isDeleted} italic={row.isNew}>
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

/** A breathing chip naming the agent at work on this file right now. */
function agentChip(ui: Ui, row: PanelRow, activity: Activity | null) {
  const { Box, Text } = ui
  const index =
    activity?.lanes.findIndex(lane =>
      lane.running.some(call => call.filePath?.endsWith(`/${row.path}`) ?? false),
    ) ?? -1

  if (activity === null || index < 0) return null

  const lane = activity.lanes[index] as Lane
  const style = laneStyle(index)

  return (
    <Box flexDirection="row" alignItems="center" gap="xs" paddingX="xs" {...tint(ui, style.tint)}>
      {picture(ui, pulseDot(style.fill), 'At work', DOT_SIZE, true)}
      <Text size="caption" color={style.text}>
        {index === 0 ? 'Claude' : lane.label}
      </Text>
    </Box>
  )
}

/** The agents and what each is doing, then the latest actions and the session's totals. */
function activity(ui: Ui, data: Activity, now: number) {
  const { Box, Text } = ui
  const isWorking = data.lanes.some(lane => lane.running.length > 0)
  const status = isWorking ? 'Working' : data.isTurnActive ? 'Thinking' : 'Idle'
  const recent = data.log.slice(-RECENT_ROWS).reverse()
  const { reads, edits, calls } = data.counters

  return (
    <Box flexDirection="column" gap="sm">
      <Box flexDirection="row" justifyContent="space-between">
        <Text size="footnote" weight="semibold" dimColor>
          Activity
        </Text>
        <Text size="caption" dimColor>
          {`${status} · since ${timeOfDay(data.startedAt)}`}
        </Text>
      </Box>
      {data.lanes.map((lane, index) =>
        laneRow(ui, lane, index, data.isTurnActive, data.tokensByLabel[lane.label]),
      )}
      {recent.length > 0 && (
        <Box flexDirection="column">
          <Text size="footnote" weight="semibold" dimColor>
            Recent
          </Text>
          {recent.map(entry => recentRow(ui, entry, now))}
        </Box>
      )}
      <Box flexDirection="column">
        <Box flexDirection="row" gap="xs">
          <Text size="caption" dimColor>
            {`${reads} reads · ${edits} edits · ${calls} tool calls`}
          </Text>
          {lineCounts(ui, data.counters)}
        </Box>
        {tokenLine(ui, data)}
      </Box>
    </Box>
  )
}

/** `Tokens 182k in · 24k out · 1.2M cached · context 46% · $1.24`; what is not reported is left out. */
function tokenLine(ui: Ui, data: Activity) {
  const { Text } = ui
  const { input, output, cacheRead, cacheWrite } = data.tokens
  const parts = [
    ...(input + cacheWrite + output + cacheRead > 0
      ? [`${tokenCount(input + cacheWrite)} in`, `${tokenCount(output)} out`, `${tokenCount(cacheRead)} cached`]
      : []),
    ...(data.meter?.contextPercent == null ? [] : [`context ${percent(data.meter.contextPercent)}`]),
    ...(data.meter?.usd == null ? [] : [money(data.meter.usd)]),
  ]

  if (parts.length === 0) return null

  return (
    <Text size="caption" dimColor wrap="truncate-end">
      {`Tokens ${parts.join(' · ')}`}
    </Text>
  )
}

/** `Claude  Editing view.ts · 2 running  120k` with a spinner while it works. */
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
      <Text weight="semibold">{agentName(lane.label)}</Text>
      <Box flexGrow={1} flexShrink={1} minWidth={0}>
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

/** `✓ Edited panel.tsx  +3 −1  2s`; a subagent's action names it, a refused one says so. */
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

/** A tinted pill with its label in the tone's color. */
function pill(ui: Ui, { text, tone }: Tag) {
  const { Box, Text } = ui

  return (
    <Box paddingX="xs" {...tint(ui, TONE_TINT[tone])}>
      <Text size="caption" color={TONE_COLOR[tone]}>
        {text}
      </Text>
    </Box>
  )
}

/** A background tint where the surface draws one; the terminal goes without. */
function tint(ui: Ui, color: string): { backgroundColor?: string } {
  return isGraphical(ui) ? { backgroundColor: color } : {}
}

/**
 * A picture where the surface draws Svg; the terminal goes without. Without a
 * size it fills the width. An animated one is drawn interactive, where SMIL runs.
 */
function picture(ui: Ui, source: string, alt: string, size?: number, isAnimated = false) {
  if (!isGraphical(ui)) return null

  const { Svg } = ui
  const animated = isAnimated ? { isInteractive: true } : {}

  return size === undefined ? (
    <Svg source={source} alt={alt} {...animated} />
  ) : (
    <Svg source={source} alt={alt} width={size} height={size} {...animated} />
  )
}

/** Whether the surface draws pictures (desktop, mobile, VS Code), not cells. */
function isGraphical(ui: Ui): ui is Extract<Ui, { Svg: unknown }> {
  return 'Svg' in ui
}
