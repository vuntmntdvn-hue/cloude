import type { ChangedFile, FileGroup, FileLines, GitBranch, LineCounts } from '../types'
import { mergeLines } from './line-counts'

const SHORT_OID_LENGTH = 7
// The repository's own top level, as a folder in the tree.
const TOP_LEVEL = './'
const MINUS = '−'

/** What a color stands for in the panel; the drawing picks the colors. */
export type Tone = 'good' | 'attention' | 'info' | 'danger' | 'quiet'

/** A short colored label. */
export type Tag = { text: string; tone: Tone }

/** One file in the tree, its groups merged: a file staged and changed again is one row. */
export type TreeRow = {
  path: string
  name: string
  /** In panel order; one dot each. */
  groups: FileGroup[]
  /** Both sides' counts added up. */
  lines?: FileLines
  isDeleted: boolean
  isNew: boolean
}

export type TreeFolder = { folder: string; rows: TreeRow[] }

/** The order the panel shows the groups in: what blocks you first. */
export const GROUP_ORDER: readonly FileGroup[] = ['conflicted', 'staged', 'changed', 'untracked']

/** A group's name under its count. */
export const GROUP_NAME: Readonly<Record<FileGroup, string>> = {
  conflicted: 'conflicts',
  staged: 'staged',
  changed: 'not staged',
  untracked: 'new',
}

export const GROUP_TONE: Readonly<Record<FileGroup, Tone>> = {
  conflicted: 'danger',
  staged: 'good',
  changed: 'attention',
  untracked: 'quiet',
}

/** Shows a path under the home folder as `~/…`; any other path as it is. */
export function tildify(path: string, home: string | undefined): string {
  if (home === undefined || home === '') return path

  const slashedPath = path.replace(/\\/g, '/')
  const slashedHome = home.replace(/\\/g, '/').replace(/\/$/, '')

  if (slashedPath === slashedHome) return '~'

  return slashedPath.startsWith(`${slashedHome}/`) ? `~${slashedPath.slice(slashedHome.length)}` : path
}

/**
 * Splits a path into its last part and the folder before it. A folder git
 * lists whole (`notes/`, all of it new) keeps its trailing slash in the name.
 */
export function splitPath(path: string): { name: string; folder: string } {
  const trimmed = path.endsWith('/') ? path.slice(0, -1) : path
  const slash = trimmed.lastIndexOf('/')

  return slash === -1
    ? { name: path, folder: '' }
    : { name: path.slice(slash + 1), folder: path.slice(0, slash) }
}

/** The branch's name, or the commit a detached HEAD sits on. */
export function branchLabel(branch: GitBranch): string {
  if (branch.head !== null) return branch.head

  return branch.oid === null ? 'detached' : `detached at ${branch.oid.slice(0, SHORT_OID_LENGTH)}`
}

/** Where the branch stands against the branch it tracks, never against main. */
export function syncTag(branch: GitBranch): Tag {
  const { upstream, ahead, behind } = branch

  if (upstream === null) return { text: 'not on remote', tone: 'quiet' }
  if (ahead > 0 && behind > 0) return { text: `↑${ahead} ↓${behind}`, tone: 'danger' }
  if (ahead > 0) return { text: `↑${ahead} to push`, tone: 'attention' }
  if (behind > 0) return { text: `↓${behind} to pull`, tone: 'info' }

  return { text: 'in sync', tone: 'good' }
}

/** How many rows each group has; a file staged and changed again counts in both. */
export function groupCounts(files: readonly ChangedFile[]): Record<FileGroup, number> {
  const counts: Record<FileGroup, number> = { conflicted: 0, staged: 0, changed: 0, untracked: 0 }

  for (const file of files) counts[file.group] += 1

  return counts
}

/** `+12` and `−3`, each null when zero. */
export function linesLabel(lines: LineCounts): { added: string | null; deleted: string | null } {
  return {
    added: lines.added > 0 ? `+${lines.added}` : null,
    deleted: lines.deleted > 0 ? `${MINUS}${lines.deleted}` : null,
  }
}

/**
 * The files under their folders, folders in path order, the top level as
 * `./`. One row per path: its groups in panel order and its counts added up.
 */
export function folderTree(files: readonly ChangedFile[]): TreeFolder[] {
  const rows = new Map<string, TreeRow>()

  for (const file of files) {
    const row = rows.get(file.path)

    rows.set(file.path, row === undefined ? newRow(file) : mergeRow(row, file))
  }

  const folders = new Map<string, TreeRow[]>()

  for (const row of rows.values()) {
    const folder = splitPath(row.path).folder || TOP_LEVEL

    folders.set(folder, [...(folders.get(folder) ?? []), row])
  }

  return [...folders.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([folder, inFolder]) => ({ folder, rows: inFolder }))
}

/** A row's name; a rename shows the old name, or the old path when it moved folders. */
export function treeName(file: ChangedFile): string {
  const now = splitPath(file.path)

  if (file.from === undefined) return now.name

  const before = splitPath(file.from)

  if (before.folder !== now.folder) return `${file.from} → ${now.name}`

  return before.name === now.name ? now.name : `${before.name} → ${now.name}`
}

function newRow(file: ChangedFile): TreeRow {
  return {
    path: file.path,
    name: treeName(file),
    groups: [file.group],
    ...(file.lines === undefined ? {} : { lines: file.lines }),
    isDeleted: file.code === 'D',
    isNew: file.group === 'untracked' || file.code === 'A',
  }
}

function mergeRow(row: TreeRow, file: ChangedFile): TreeRow {
  const groups = GROUP_ORDER.filter(group => row.groups.includes(group) || group === file.group)
  const lines = mergeLines(row.lines, file.lines)

  return {
    ...row,
    // A rename's row carries the old name; keep it over a plain one.
    name: file.from === undefined ? row.name : treeName(file),
    groups,
    ...(lines === undefined ? {} : { lines }),
    isDeleted: row.isDeleted || file.code === 'D',
    isNew: row.isNew || file.code === 'A',
  }
}
