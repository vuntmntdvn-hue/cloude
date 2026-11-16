import type { Elements, RenderSurface } from 'claude-code'

import type { Activity, ContextReading, Lane, LineCounts, LogEntry, TokenCounts } from '../types'
import { freshTokens } from './activity'
import { contextBar, contextLegend } from './context'
import type { BarRun } from './context'
import { agentName, ago, did, doing, money, percent, timeOfDay, tokenCount } from './copy'
import { avatar, BRANCH_ICON, CHECK_ICON, FOLDER_ICON, pulseDot, ratioBar, SPINNER_ICON } from './icons'
import { laneStyle, TONE_COLOR, TONE_TINT } from './palette'
import type { PanelChanges, PanelData, PanelRow } from './panel-data'
import { GROUP_NAME, GROUP_ORDER, GROUP_TONE, linesLabel } from './view'
import type { Tag } from './view'
import type { FoldSection, PanelControls } from './controls'

type Ui = Elements[RenderSurface]

// Keys that press the buttons while the panel has the focus.
const COMPACT_KEY = 'c'
const FOLD_KEYS: Readonly<Record<FoldSection, string>> = { files: 'f', activity: 'a' }

const RECENT_ROWS = 4
// The context bar splits its width in this many shares, so every used part
// keeps at least one; and how many parts its legend names.
const BAR_SHARES = 100
const LEGEND_PARTS = 4
// Translucent greys for the window left and the compaction reserve, on light
// and dark themes alike.
const FREE_TINT = 'rgba(128, 128, 128, 0.16)'
const BUFFER_TINT = 'rgba(128, 128, 128, 0.34)'
// One caption line of height: what each bar segment holds.
const NO_BREAK_SPACE = '\u00a0'
const ICON_SIZE = 14
const AVATAR_SIZE = 20
const DOT_SIZE = 7

/**
 * The panel in the desktop app's own look: the folder and branch, the
 * changes by folder, then each agent's activity and the latest actions.
 * `now` is the clock, for the "2s ago" times.
 */
export function drawNativePanel(ui: Ui, data: PanelData, now: number, controls: PanelControls) {
  const { Box, Text } = ui

  return (
    <Box flexDirection="column" gap="md">
      {header(ui, data, controls)}
      {data.error !== null && (
        <Text size="caption" color="error">
          {data.error}
        </Text>
      )}
      {data.branch !== null &&
        (data.changes === null
          ? cleanLine(ui)
          : changes(ui, data.changes, data.activity, data.folds.files, controls))}
      {data.context !== null && contextMeter(ui, data.context, controls)}
      {data.activity !== null && activity(ui, data.activity, now, data.folds.activity, controls)}
    </Box>
  )
}

/** A quiet text button: secondary, drawn dim until the pointer or focus is on it. */
function quietButton(ui: Ui, key: string, label: string, onPress: () => void, hotkey?: string) {
  const { Button } = ui

  return <Button key={key} label={label} dimColor plain onPress={onPress} {...(hotkey === undefined ? {} : { hotkey })} />
}

/** `Hide` or `Show` for a section; the section's heading row stays either way. */
function foldButton(ui: Ui, section: FoldSection, isFolded: boolean, controls: PanelControls) {
  return quietButton(ui, `fold-${section}`, isFolded ? 'Show' : 'Hide', () => controls.onFold(section), FOLD_KEYS[section])
}

function header(ui: Ui, data: PanelData, controls: PanelControls) {
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

/** The group pills and totals, then (unless folded) the split bar and the files under their folders. */
function changes(
  ui: Ui,
  data: PanelChanges,
  activity: Activity | null,
  isFolded: boolean,
  controls: PanelControls,
) {
  const { Box, Text } = ui
  const groups = GROUP_ORDER.filter(group => group !== 'conflicted' || data.counts.conflicted > 0)
  const { added, deleted } = data.totals
  const summary = (
    <Box flexDirection="row" alignItems="center" gap="xs">
      {groups.map(group =>
        pill(ui, { text: `${data.counts[group]} ${GROUP_NAME[group]}`, tone: GROUP_TONE[group] }),
      )}
      <Box flexGrow={1} />
      {lineCounts(ui, data.totals)}
      {foldButton(ui, 'files', isFolded, controls)}
    </Box>
  )

  if (isFolded) return summary

  return (
    <Box flexDirection="column" gap="sm">
      {summary}
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

/**
 * `Context  92k of 200k · 46%`, a bar split by what fills the window (in the
 * colors /context uses), the largest parts, and how far auto-compaction is.
 */
function contextMeter(ui: Ui, reading: ContextReading, controls: PanelControls) {
  const { Box, Text } = ui
  const { tokens, window, percent: filled, parts, compactAt } = reading
  const amount =
    tokens === null
      ? 'counting from the first response'
      : `${tokenCount(tokens)} of ${tokenCount(window)}${filled === null ? '' : ` · ${percent(filled)}`}`
  const legend = contextLegend(parts, LEGEND_PARTS)

  return (
    <Box flexDirection="column" gap="xs">
      <Box flexDirection="row" alignItems="center" gap="sm">
        <Text size="footnote" weight="semibold" dimColor>
          Context
        </Text>
        <Box flexGrow={1} flexShrink={1} minWidth={0} alignItems="flex-end">
          <Text size="caption" dimColor tabular wrap="truncate-end">
            {amount}
          </Text>
        </Box>
        {compactButton(ui, controls)}
      </Box>
      {parts.length > 0 && (
        <Box flexDirection="row">
          {contextBar(parts, BAR_SHARES).map(run => (
            <Box width={0} flexGrow={run.cells} backgroundColor={segmentColor(run)}>
              <Text size="caption">{NO_BREAK_SPACE}</Text>
            </Box>
          ))}
        </Box>
      )}
      {legend.shown.length > 0 && (
        <Box flexDirection="row" flexWrap="wrap" columnGap="sm">
          {legend.shown.map(part => (
            <Box flexDirection="row" gap="xs">
              <Text size="caption" color={part.color}>
                ●
              </Text>
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
      )}
      {compactAt !== null && tokens !== null && (
        <Text size="caption" dimColor>
          {`Compacts at ${tokenCount(compactAt)} · ${tokenCount(Math.max(0, compactAt - tokens))} to go`}
        </Text>
      )}
    </Box>
  )
}

/** `Compact`, then for 5 seconds `Confirm compact`, drawn as the main action while it waits. */
function compactButton(ui: Ui, controls: PanelControls) {
  const { Button } = ui

  return controls.isCompactArmed ? (
    <Button key="compact" label="Confirm compact" variant="primary" hotkey={COMPACT_KEY} onPress={controls.onCompact} />
  ) : (
    <Button key="compact" label="Compact" variant="secondary" hotkey={COMPACT_KEY} onPress={controls.onCompact} />
  )
}

/** A used part fills with its own theme color; free space and the compaction reserve with greys. */
function segmentColor(run: BarRun): string {
  if (run.kind === 'used') return run.color

  return run.kind === 'free' ? FREE_TINT : BUFFER_TINT
}

/** The agents and what each is doing, then the latest actions and the session's totals; folded, the heading alone. */
function activity(ui: Ui, data: Activity, now: number, isFolded: boolean, controls: PanelControls) {
  const { Box, Text } = ui
  const isWorking = data.lanes.some(lane => lane.running.length > 0)
  const status = isWorking ? 'Working' : data.isTurnActive ? 'Thinking' : 'Idle'
  const recent = data.log.slice(-RECENT_ROWS).reverse()
  const { reads, edits, calls } = data.counters
  const heading = (
    <Box flexDirection="row" alignItems="center" gap="sm">
      <Text size="footnote" weight="semibold" dimColor>
        Activity
      </Text>
      <Box flexGrow={1} flexShrink={1} minWidth={0} alignItems="flex-end">
        <Text size="caption" dimColor wrap="truncate-end">
          {`${status} · since ${timeOfDay(data.startedAt)}`}
        </Text>
      </Box>
      {foldButton(ui, 'activity', isFolded, controls)}
    </Box>
  )

  if (isFolded) return heading

  return (
    <Box flexDirection="column" gap="sm">
      {heading}
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

/** `Tokens 182k in · 24k out · 1.2M cached · $1.24`; what is not reported is left out. */
function tokenLine(ui: Ui, data: Activity) {
  const { Text } = ui
  const { input, output, cacheRead, cacheWrite } = data.tokens
  const parts = [
    ...(input + cacheWrite + output + cacheRead > 0
      ? [`${tokenCount(input + cacheWrite)} in`, `${tokenCount(output)} out`, `${tokenCount(cacheRead)} cached`]
      : []),
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
