/** The groups of `git status`, in the order the panel lists them. */
export type FileGroup = 'conflicted' | 'staged' | 'changed' | 'untracked'

/** One row of the file list: a path under one group, with git's letter for it. */
export type ChangedFile = {
  group: FileGroup
  /** Git's status letter for this group: M, A, D, R, C, T, U or ?. */
  code: string
  /** Relative to the repository root. */
  path: string
  /** The old path of a rename or copy. */
  from?: string
}

export type GitBranch = {
  /** The branch name; null on a detached HEAD. */
  head: string | null
  /** The commit HEAD points at; null before the first commit. */
  oid: string | null
  /** The branch it tracks, such as `origin/feature/x`; null when it has none. */
  upstream: string | null
  ahead: number
  behind: number
}

export type GitStatus = { branch: GitBranch; files: ChangedFile[] }

/** What the panel draws: the session's folder and, inside a repository, its status. */
export type Where = {
  cwd: string
  /** The main checkout's folder when `cwd` is in a linked worktree; null otherwise. */
  worktreeOf: string | null
  /** Null outside a git repository. */
  git: GitStatus | null
  /** Why the last read failed, when it did. */
  error: string | null
}

declare module 'claude-code' {
  interface PluginState {
    where: { where: Shaped<Where | null> }
  }
}
