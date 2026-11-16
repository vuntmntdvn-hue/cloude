import type { ChangedFile, FileGroup, FileLines, GitBranch, GitStatus } from '../types'

// The space-separated fields before the path in each porcelain v2 entry.
const ORDINARY_FIELDS = 8
const RENAMED_FIELDS = 9
const UNMERGED_FIELDS = 10

const UNCHANGED = '.'
const GIT_DIR_SUFFIX = '/.git'
// What `--numstat` writes in place of counts for a binary file.
const NUMSTAT_BINARY = '-'

/**
 * Reads `git diff --numstat -z` into line counts by path, a rename's by its
 * new path. A binary file has no line counts.
 */
export function parseNumstat(stdout: string): Map<string, FileLines> {
  const counts = new Map<string, FileLines>()
  const records = stdout.split('\0')

  for (let i = 0; i < records.length; i += 1) {
    const record = records[i] ?? ''

    if (record === '') continue

    const [added = '', deleted = '', ...rest] = record.split('\t')
    let path = rest.join('\t')

    // A rename leaves its path empty: its old and new paths are the next two records.
    if (path === '') {
      path = records[i + 2] ?? ''
      i += 2
    }

    counts.set(
      path,
      added === NUMSTAT_BINARY ? 'binary' : { added: Number(added), deleted: Number(deleted) },
    )
  }

  return counts
}

/** Reads the working tree's root, the first line of `git rev-parse --show-toplevel …`. */
export function rootOf(stdout: string): string | null {
  const root = stdout.trim().split('\n')[0] ?? ''

  return root === '' ? null : root
}

/**
 * Reads `git status --porcelain=v2 --branch -z` into the branch and the
 * changed files. A file both staged and changed again yields one row per group.
 */
export function parseStatus(stdout: string): GitStatus {
  const branch: GitBranch = { head: null, oid: null, upstream: null, ahead: 0, behind: 0 }
  const files: ChangedFile[] = []
  const records = stdout.split('\0')

  for (let i = 0; i < records.length; i += 1) {
    const record = records[i] ?? ''

    switch (record[0]) {
      case '#':
        readHeader(record, branch)
        break
      case '1':
        files.push(...trackedRows(record, ORDINARY_FIELDS))
        break
      case '2':
        // Under -z a rename's old path is the record after it.
        i += 1
        files.push(...trackedRows(record, RENAMED_FIELDS, records[i]))
        break
      case 'u':
        files.push({ group: 'conflicted', code: 'U', path: pathAfter(record, UNMERGED_FIELDS) })
        break
      case '?':
        files.push({ group: 'untracked', code: '?', path: record.slice(2) })
        break
    }
  }

  return { branch, files }
}

/**
 * Reads `git rev-parse --path-format=absolute --show-toplevel --git-common-dir`
 * into the main checkout's folder when the working tree is a linked worktree,
 * and null when it is the main checkout itself (or has no `.git` folder to tell).
 */
export function parseWorktreeOf(stdout: string): string | null {
  const [root, commonDir] = stdout.trim().split('\n')

  if (root === undefined || commonDir === undefined || !commonDir.endsWith(GIT_DIR_SUFFIX)) {
    return null
  }

  const mainRoot = commonDir.slice(0, -GIT_DIR_SUFFIX.length)

  return mainRoot === root ? null : mainRoot
}

function readHeader(record: string, branch: GitBranch): void {
  const [, key, ...values] = record.split(' ')
  const value = values.join(' ')

  switch (key) {
    case 'branch.oid':
      branch.oid = value === '(initial)' ? null : value
      break
    case 'branch.head':
      branch.head = value === '(detached)' ? null : value
      break
    case 'branch.upstream':
      branch.upstream = value
      break
    case 'branch.ab':
      // `+<ahead> -<behind>`
      branch.ahead = Number(values[0]?.slice(1) ?? 0)
      branch.behind = Number(values[1]?.slice(1) ?? 0)
      break
  }
}

function trackedRows(record: string, fields: number, from?: string): ChangedFile[] {
  // The two letters after `1 ` or `2 `: the index's, then the working tree's.
  const staged = record.charAt(2)
  const changed = record.charAt(3)
  const path = pathAfter(record, fields)
  const rows: ChangedFile[] = []

  if (staged !== UNCHANGED) rows.push(row('staged', staged, path, from))
  if (changed !== UNCHANGED) rows.push(row('changed', changed, path, from))

  return rows
}

function row(group: FileGroup, code: string, path: string, from?: string): ChangedFile {
  const isMove = code === 'R' || code === 'C'

  return isMove && from !== undefined ? { group, code, path, from } : { group, code, path }
}

/** The path may hold spaces, so it is everything after the entry's fixed fields. */
function pathAfter(record: string, fields: number): string {
  let at = 0

  for (let field = 0; field < fields; field += 1) {
    at = record.indexOf(' ', at) + 1
  }

  return record.slice(at)
}
