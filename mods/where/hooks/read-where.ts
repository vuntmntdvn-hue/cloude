import type { EngineInterface } from 'claude-code'

import type { Where } from '../types'
import { parseStatus, parseWorktreeOf } from './git-status'

const GIT_TIMEOUT_MS = 10_000
const NOT_A_REPO = 'not a git repository'

/**
 * Reads the session's folder and, inside a repository, its branch and changed
 * files. Never rejects: a failure comes back as `error`, for the panel to show.
 */
export async function readWhere($: EngineInterface): Promise<Where> {
  const cwd = await $.session.cwd()
  const outside: Where = { cwd, worktreeOf: null, git: null, error: null }

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

    return {
      cwd,
      worktreeOf: parseWorktreeOf(top.stdout),
      git: parseStatus(status.stdout),
      error: null,
    }
  } catch (failure) {
    return { ...outside, error: `git did not run: ${String(failure)}` }
  }
}

function git($: EngineInterface, cwd: string, args: readonly string[]) {
  return $.process.run(['git', ...args], { cwd, timeoutMs: GIT_TIMEOUT_MS })
}

function firstLine(text: string): string {
  return text.trim().split('\n')[0] ?? ''
}
