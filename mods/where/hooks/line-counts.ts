import type { ChangedFile, FileGroup, FileLines, LineCounts } from '../types'

/** The line counts of each side of a change, by repository path. */
export type LineSources = {
  /** The index against the last commit. */
  staged: ReadonlyMap<string, FileLines>
  /** The working tree against the index. */
  notStaged: ReadonlyMap<string, FileLines>
  /** New files, counted whole. */
  newFiles: ReadonlyMap<string, FileLines>
}

/** How many lines a text has; a last line without a newline still counts. */
export function countLines(text: string): number {
  if (text === '') return 0

  const breaks = text.split('\n').length - 1

  return text.endsWith('\n') ? breaks : breaks + 1
}

/**
 * Gives each row the counts of its own side, so a file staged and changed
 * again carries each side's counts on its own row. Conflicts stay uncounted.
 */
export function withLineCounts(files: readonly ChangedFile[], sources: LineSources): ChangedFile[] {
  return files.map(file => {
    const lines = sourceOf(file.group, sources)?.get(file.path)

    return lines === undefined ? file : { ...file, lines }
  })
}

/** Lines added and removed across rows; binary and uncounted rows add nothing. */
export function sumLines(rows: readonly { lines?: FileLines }[]): LineCounts {
  return rows.reduce<LineCounts>(
    (total, { lines }) =>
      lines === undefined || lines === 'binary'
        ? total
        : { added: total.added + lines.added, deleted: total.deleted + lines.deleted },
    { added: 0, deleted: 0 },
  )
}

/** Two counts of one file as one: binary wins, and a missing side adds nothing. */
export function mergeLines(a: FileLines | undefined, b: FileLines | undefined): FileLines | undefined {
  if (a === undefined) return b
  if (b === undefined) return a
  if (a === 'binary' || b === 'binary') return 'binary'

  return { added: a.added + b.added, deleted: a.deleted + b.deleted }
}

function sourceOf(group: FileGroup, sources: LineSources): ReadonlyMap<string, FileLines> | undefined {
  switch (group) {
    case 'staged':
      return sources.staged
    case 'changed':
      return sources.notStaged
    case 'untracked':
      return sources.newFiles
    case 'conflicted':
      return undefined
  }
}
