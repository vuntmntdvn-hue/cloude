import type { EngineInterface } from 'claude-code'

import type { ChangedFile, FileGroup, FileLines, Where } from '../types'
import { parseNumstat, parseStatus, parseWorktreeOf, rootOf } from './git-status'
import { withLineCounts } from './line-counts'
import { countNewFileLines } from './new-file-lines'
import type { Disk } from './new-file-lines'

const GIT_TIMEOUT_MS = 10_000
const NOT_A_REPO = 'not a git repository'
const NONE: ReadonlyMap<string, FileLines> = new Map()

/**
 * Reads the session's folder and, inside a repository, its branch and changed
 * files with their line counts. Never rejects: a failure comes back as
 * `error`, for the panel to show.
 */
export async function readWhere($: EngineInterface): Promise<Where> {
  const cwd = await $.session.cwd()
  const outside: Where = { cwd, root: null, worktreeOf: null, git: null, error: null }

  try {
    const top = await git($, cwd, [
      'rev-parse',
      '--path-format=absolute',
      '--show-toplevel',
      '--git-common-dir',
    ])

    if (top.exitCode !== 0) {
      return top.stderr.includes(NOT_A_REPO) ? outside : { ...outside, error: firstLine(top.stderr) }
    }

    // No optional locks, so a refresh never holds `index.lock` while Claude or
    // you run git in the same checkout.
    const status = await git($, cwd, ['--no-optional-locks', 'status', '--porcelain=v2', '--branch', '-z'])

    if (status.exitCode !== 0) {
      return { ...outside, error: firstLine(status.stderr) }
    }

    const parsed = parseStatus(status.stdout)
    const root = rootOf(top.stdout)
    const files = await withCounts($, cwd, root, parsed.files)

    return {
      cwd,
      root,
      worktreeOf: parseWorktreeOf(top.stdout),
      git: { ...parsed, files },
      error: null,
    }
  } catch (failure) {
    return { ...outside, error: `git did not run: ${String(failure)}` }
  }
}

/**
 * Adds line counts, asking only for the sides that have files: a clean tree
 * runs nothing more. A count that fails leaves its rows uncounted.
 */
async function withCounts(
  $: EngineInterface,
  cwd: string,
  root: string | null,
  files: readonly ChangedFile[],
): Promise<ChangedFile[]> {
  const pathsIn = (group: FileGroup) =>
    files.filter(file => file.group === group).map(file => file.path)
  const newPaths = pathsIn('untracked')

  const [staged, notStaged, newFiles] = await Promise.all([
    pathsIn('staged').length > 0 ? numstat($, cwd, ['--cached']) : NONE,
    pathsIn('changed').length > 0 ? numstat($, cwd, []) : NONE,
    newPaths.length > 0 && root !== null ? countNewFileLines(diskOf($), root, newPaths) : NONE,
  ])

  return withLineCounts(files, { staged, notStaged, newFiles })
}

async function numstat(
  $: EngineInterface,
  cwd: string,
  args: readonly string[],
): Promise<ReadonlyMap<string, FileLines>> {
  // `--no-relative` keeps paths from the repository root, as status gives them,
  // whatever `diff.relative` says.
  const result = await git($, cwd, [
    '--no-optional-locks',
    'diff',
    '--numstat',
    '--no-relative',
    '-z',
    ...args,
  ])

  return result.exitCode === 0 ? parseNumstat(result.stdout) : NONE
}

/** `$.fs` as the new-file counting reads it. */
function diskOf($: EngineInterface): Disk {
  return {
    stat: path => $.fs.stat(path),
    read: async path => {
      const text = await $.fs.read(path)

      if (typeof text !== 'string') throw new Error(`${path} did not read as text`)

      return text
    },
  }
}

function git($: EngineInterface, cwd: string, args: readonly string[]) {
  return $.process.run(['git', ...args], { cwd, timeoutMs: GIT_TIMEOUT_MS })
}

function firstLine(text: string): string {
  return text.trim().split('\n')[0] ?? ''
}
