import type { Activity, ContextReading, FileGroup, FileLines, Folds, LineCounts, Where } from '../types'
import { sumLines } from './line-counts'
import { branchLabel, folderTree, groupCounts, splitPath, syncTag, tildify } from './view'
import type { Tag } from './view'

/** One file row, as plain data the console module can take: no field is left undefined. */
export type PanelRow = {
  path: string
  name: string
  /** Empty for a file in use that has no changes. */
  groups: FileGroup[]
  lines: FileLines | null
  isDeleted: boolean
  isNew: boolean
  /** An unchanged file shown only because an agent is reading or editing it now. */
  isInUse: boolean
}

export type PanelFolder = { folder: string; rows: PanelRow[] }

/** The counts and totals of the uncommitted changes. */
export type PanelChanges = {
  counts: Record<FileGroup, number>
  totals: LineCounts
}

/** The changed files, cut to the row limit, with the unchanged files in use added. */
export type PanelFiles = {
  tree: PanelFolder[]
  /** Changed files left out by the row limit; files in use are never left out. */
  hiddenRows: number
}

/** Everything the frame draws, worked out once in the hooks module. */
export type PanelData = {
  folder: { name: string; under: string }
  /** Null outside a git repository. */
  branch: { label: string; sync: Tag } | null
  error: string | null
  /** Null when there is nothing uncommitted, or no repository. */
  changes: PanelChanges | null
  files: PanelFiles
  activity: Activity | null
  /** Null until the first reading. */
  context: ContextReading | null
  folds: Folds
}

const READING: PanelData['folder'] = { name: '…', under: 'reading the folder' }
const NO_FILES: PanelFiles = { tree: [], hiddenRows: 0 }
// The repository's own top level, as a folder in the tree.
const TOP_LEVEL = './'

export function panelData(
  where: Where | null,
  activity: Activity | null,
  context: ContextReading | null,
  folds: Folds,
  home: string | undefined,
  maxRows: number,
): PanelData {
  if (where === null) {
    return { folder: READING, branch: null, error: null, changes: null, files: NO_FILES, activity, context, folds }
  }

  const place = splitPath(tildify(where.cwd, home))
  const under = where.worktreeOf === null ? place.folder : `worktree of ${tildify(where.worktreeOf, home)}`
  const changed = where.git?.files ?? []
  const cut = cutTree(folderTree(changed), maxRows)
  const inUse = inUseRows(where.root, activity, new Set(changed.map(file => file.path)))

  return {
    folder: { name: place.name, under },
    branch:
      where.git === null
        ? null
        : { label: branchLabel(where.git.branch), sync: syncTag(where.git.branch) },
    error: where.error,
    changes: changed.length === 0 ? null : { counts: groupCounts(changed), totals: sumLines(changed) },
    files: { tree: withRows(cut.tree, inUse), hiddenRows: cut.hiddenRows },
    activity,
    context,
    folds,
  }
}

/** The path of a file under the repository root, `lib/a.dart`; null for one outside it. */
export function repoPath(root: string, absolutePath: string): string | null {
  const slashedRoot = root.replace(/\\/g, '/').replace(/\/$/, '')
  const slashedPath = absolutePath.replace(/\\/g, '/')

  return slashedPath.startsWith(`${slashedRoot}/`) ? slashedPath.slice(slashedRoot.length + 1) : null
}

/**
 * Unchanged files under the root that an agent is reading or editing right
 * now, once each; a file with changes already has its row.
 */
export function inUseRows(
  root: string | null,
  activity: Activity | null,
  changed: ReadonlySet<string>,
): PanelRow[] {
  if (root === null || activity === null) return []

  const paths = new Set<string>()

  for (const lane of activity.lanes) {
    for (const call of lane.running) {
      const path = call.filePath === null ? null : repoPath(root, call.filePath)

      if (path !== null && !changed.has(path)) paths.add(path)
    }
  }

  return [...paths].map(path => ({
    path,
    name: splitPath(path).name,
    groups: [],
    lines: null,
    isDeleted: false,
    isNew: false,
    isInUse: true,
  }))
}

/** Adds rows to their folders, making a folder where there is none; folders stay in path order. */
function withRows(tree: readonly PanelFolder[], rows: readonly PanelRow[]): PanelFolder[] {
  const folders = new Map(tree.map(({ folder, rows: inFolder }) => [folder, [...inFolder]]))

  for (const row of rows) {
    const folder = splitPath(row.path).folder || TOP_LEVEL

    folders.set(folder, [...(folders.get(folder) ?? []), row])
  }

  return [...folders.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([folder, inFolder]) => ({ folder, rows: inFolder }))
}

function cutTree(tree: ReturnType<typeof folderTree>, maxRows: number): PanelFiles {
  let room = maxRows
  let hiddenRows = 0
  const kept: PanelFolder[] = []

  for (const { folder, rows } of tree) {
    const shown = rows.slice(0, Math.max(0, room))

    room -= shown.length
    hiddenRows += rows.length - shown.length

    if (shown.length > 0) {
      kept.push({
        folder,
        rows: shown.map(row => ({
          path: row.path,
          name: row.name,
          groups: row.groups,
          lines: row.lines ?? null,
          isDeleted: row.isDeleted,
          isNew: row.isNew,
          isInUse: false,
        })),
      })
    }
  }

  return { tree: kept, hiddenRows }
}
