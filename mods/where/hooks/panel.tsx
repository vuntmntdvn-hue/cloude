import type { Color, Elements, RenderSurface } from 'claude-code'

import type { ChangedFile, FileGroup, FileLines, GitBranch, Where } from '../types'
import { BRANCH_ICON, CHECK_ICON, FOLDER_ICON, ratioBar } from './icons'
import { sumLines } from './line-counts'
import {
  branchLabel,
  folderTree,
  GROUP_NAME,
  GROUP_ORDER,
  GROUP_TONE,
  groupCounts,
  linesLabel,
  splitPath,
  syncTag,
  tildify,
} from './view'
import type { Tone, TreeRow } from './view'

/** What the panel needs besides the read itself. */
export type PanelContext = {
  home: string | undefined
  /** At most this many file rows, then a `+N more` line. */
  maxFileRows: number
}

type Ui = Elements[RenderSurface]

const ICON_SIZE = 14
const DOT = '●'

// A tone's text color.
const TONE_COLOR: Readonly<Record<Tone, Color>> = {
  good: 'success',
  attention: 'warning',
  info: 'suggestion',
  danger: 'error',
  quiet: 'subtle',
}

// The faint grey behind a count tile, translucent so it sits on light and dark
// themes alike. The terminal draws no tint.
const TILE_TINT = 'rgba(128, 128, 128, 0.12)'

/** The panel: where you are and the branch, the counts, then the files by folder. */
export function drawPanel(ui: Ui, where: Where, context: PanelContext) {
  const { Box, Text } = ui
  const files = where.git?.files ?? []

  return (
    <Box flexDirection="column" gap="md">
      {header(ui, where, context.home)}
      {where.error !== null && (
        <Text size="caption" color="error">
          {where.error}
        </Text>
      )}
      {where.git !== null && files.length === 0 && cleanLine(ui)}
      {files.length > 0 && counts(ui, files)}
      {files.length > 0 && tree(ui, files, context.maxFileRows)}
    </Box>
  )
}

/** The folder on the left, the branch and where it stands on the right. */
function header(ui: Ui, where: Where, home: string | undefined) {
  const { Box, Text } = ui
  const place = splitPath(tildify(where.cwd, home))
  const under =
    where.worktreeOf === null ? place.folder : `worktree of ${tildify(where.worktreeOf, home)}`

  return (
    <Box flexDirection="row" justifyContent="space-between" gap="sm">
      <Box flexDirection="column" flexShrink={1} minWidth={0}>
        <Text size="heading" weight="semibold" wrap="truncate-end">
          {place.name}
        </Text>
        {under !== '' && (
          <Text size="caption" dimColor wrap="truncate-start">
            {under}
          </Text>
        )}
      </Box>
      {where.git === null ? (
        <Text size="caption" dimColor>
          Not a git repository
        </Text>
      ) : (
        branchStanding(ui, where.git.branch)
      )}
    </Box>
  )
}

function branchStanding(ui: Ui, branch: GitBranch) {
  const { Box, Text } = ui
  const sync = syncTag(branch)

  return (
    <Box flexDirection="column" alignItems="flex-end" flexShrink={1} minWidth={0}>
      <Box flexDirection="row" alignItems="center" gap="xs">
        {picture(ui, BRANCH_ICON, 'Branch', ICON_SIZE)}
        <Text weight="semibold" wrap="truncate-start">
          {branchLabel(branch)}
        </Text>
      </Box>
      <Text size="caption" color={TONE_COLOR[sync.tone]} wrap="truncate-end">
        {branch.upstream === null ? sync.text : `${sync.text} · ${branch.upstream}`}
      </Text>
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

/** One tile per group (conflicts only when there are any), then the lines bar. */
function counts(ui: Ui, files: readonly ChangedFile[]) {
  const { Box } = ui
  const perGroup = groupCounts(files)
  const groups = GROUP_ORDER.filter(group => group !== 'conflicted' || perGroup.conflicted > 0)

  return (
    <Box flexDirection="column" gap="sm">
      <Box flexDirection="row" gap="xs">
        {groups.map(group => tile(ui, group, perGroup[group]))}
      </Box>
      {linesBar(ui, files)}
    </Box>
  )
}

/** A group's count over its dot and name: the dot is the key to the tree's dots. */
function tile(ui: Ui, group: FileGroup, count: number) {
  const { Box, Text } = ui
  const color = TONE_COLOR[GROUP_TONE[group]]

  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      width={0}
      paddingX="sm"
      paddingY="xs"
      {...(isGraphical(ui) ? { backgroundColor: TILE_TINT } : {})}
    >
      <Text size="heading" weight="semibold" tabular color={count === 0 ? 'subtle' : color}>
        {String(count)}
      </Text>
      <Box flexDirection="row" gap="xs">
        <Text size="caption" color={color}>
          {DOT}
        </Text>
        <Text size="caption" dimColor wrap="truncate-end">
          {GROUP_NAME[group]}
        </Text>
      </Box>
    </Box>
  )
}

function linesBar(ui: Ui, files: readonly ChangedFile[]) {
  const { Box, Text } = ui
  const total = sumLines(files)
  const hasLines = total.added + total.deleted > 0

  return (
    <Box flexDirection="column" gap="xs">
      <Box flexDirection="row" justifyContent="space-between">
        <Text size="caption" dimColor>
          Lines changed
        </Text>
        {hasLines ? (
          lineCounts(ui, total)
        ) : (
          <Text size="caption" dimColor>
            none counted
          </Text>
        )}
      </Box>
      {hasLines &&
        picture(
          ui,
          ratioBar(total.added, total.deleted),
          `${total.added} lines added, ${total.deleted} removed`,
        )}
    </Box>
  )
}

/** The files under their folders; past `maxRows` files, a `+N more` line. */
function tree(ui: Ui, files: readonly ChangedFile[], maxRows: number) {
  const { Box, Text } = ui
  const folders = folderTree(files)
  const total = folders.reduce((sum, { rows }) => sum + rows.length, 0)
  let room = maxRows

  const blocks = folders.flatMap(({ folder, rows }) => {
    const shown = rows.slice(0, Math.max(0, room))

    room -= shown.length

    if (shown.length === 0) return []

    return [
      <Box flexDirection="column">
        <Box flexDirection="row" alignItems="center" gap="xs">
          {picture(ui, FOLDER_ICON, 'Folder', ICON_SIZE)}
          <Text size="caption" dimColor wrap="truncate-start">
            {folder}
          </Text>
        </Box>
        {shown.map(row => treeRow(ui, row))}
      </Box>,
    ]
  })
  const hidden = total - Math.min(total, maxRows)

  return (
    <Box flexDirection="column" gap="sm">
      {blocks}
      {hidden > 0 && (
        <Text size="caption" dimColor>
          {`+${hidden} more`}
        </Text>
      )}
    </Box>
  )
}

/** A file: a dot per group it is in, its name (struck if deleted, slanted if new), its counts. */
function treeRow(ui: Ui, row: TreeRow) {
  const { Box, Text } = ui

  return (
    <Box flexDirection="row" gap="xs" paddingLeft="md">
      {row.groups.map(group => (
        <Text color={TONE_COLOR[GROUP_TONE[group]]}>{DOT}</Text>
      ))}
      <Box flexGrow={1} flexShrink={1} minWidth={0}>
        <Text
          wrap="truncate-end"
          strikethrough={row.isDeleted}
          dimColor={row.isDeleted}
          italic={row.isNew}
        >
          {row.name}
        </Text>
      </Box>
      {row.lines !== undefined && fileLines(ui, row.lines)}
    </Box>
  )
}

function fileLines(ui: Ui, lines: FileLines) {
  const { Text } = ui

  if (lines === 'binary') {
    return (
      <Text size="caption" dimColor>
        binary
      </Text>
    )
  }

  return lineCounts(ui, lines)
}

/** `+12 −3` in green and red; a zero side is left out. */
function lineCounts(ui: Ui, lines: { added: number; deleted: number }) {
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

/** A picture where the surface draws Svg; the terminal goes without. Without a size it fills the width. */
function picture(ui: Ui, source: string, alt: string, size?: number) {
  if (!isGraphical(ui)) return null

  const { Svg } = ui

  return size === undefined ? (
    <Svg source={source} alt={alt} />
  ) : (
    <Svg source={source} alt={alt} width={size} height={size} />
  )
}

/** Whether the surface draws pictures (desktop, mobile, VS Code), not cells. */
function isGraphical(ui: Ui): ui is Extract<Ui, { Svg: unknown }> {
  return 'Svg' in ui
}
