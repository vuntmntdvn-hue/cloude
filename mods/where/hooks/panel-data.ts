import type { Activity, ContextReading, FileGroup, FileLines, Folds, LineCounts, Where } from '../types'
import { sumLines } from './line-counts'
import { branchLabel, folderTree, groupCounts, splitPath, syncTag, tildify } from './view'
import type { Tag } from './view'

/** One file row, as plain data the console module can take: no field is left undefined. */
export type PanelRow = {
  path: string
  name: string
  groups: FileGroup[]
  lines: FileLines | null
  isDeleted: boolean
  isNew: boolean
}

export type PanelFolder = { folder: string; rows: PanelRow[] }

export type PanelChanges = {
  counts: Record<FileGroup, number>
  totals: LineCounts
  /** Cut to the row limit; `hiddenRows` says how many were left out. */
  tree: PanelFolder[]
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
  activity: Activity | null
  /** Null until the first reading. */
  context: ContextReading | null
  folds: Folds
}

const READING: PanelData['folder'] = { name: '…', under: 'reading the folder' }

export function panelData(
  where: Where | null,
  activity: Activity | null,
  context: ContextReading | null,
  folds: Folds,
  home: string | undefined,
  maxRows: number,
): PanelData {
  if (where === null) {
    return { folder: READING, branch: null, error: null, changes: null, activity, context, folds }
  }

  const place = splitPath(tildify(where.cwd, home))
  const under = where.worktreeOf === null ? place.folder : `worktree of ${tildify(where.worktreeOf, home)}`
  const files = where.git?.files ?? []

  return {
    folder: { name: place.name, under },
    branch:
      where.git === null
        ? null
        : { label: branchLabel(where.git.branch), sync: syncTag(where.git.branch) },
    error: where.error,
    changes:
      files.length === 0
        ? null
        : {
            counts: groupCounts(files),
            totals: sumLines(files),
            ...cutTree(folderTree(files), maxRows),
          },
    activity,
    context,
    folds,
  }
}

function cutTree(
  tree: ReturnType<typeof folderTree>,
  maxRows: number,
): { tree: PanelFolder[]; hiddenRows: number } {
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
        })),
      })
    }
  }

  return { tree: kept, hiddenRows }
}
