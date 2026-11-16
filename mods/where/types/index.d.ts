/** The groups of `git status`, in the order the panel lists them. */
export type FileGroup = 'conflicted' | 'staged' | 'changed' | 'untracked'

/** Lines a change adds and removes. */
export type LineCounts = { added: number; deleted: number }

/** A file's line counts, or `binary` where it has no lines to count. */
export type FileLines = LineCounts | 'binary'

/** One row of the file list: a path under one group, with git's letter for it. */
export type ChangedFile = {
  group: FileGroup
  /** Git's status letter for this group: M, A, D, R, C, T, U or ?. */
  code: string
  /** Relative to the repository root. */
  path: string
  /** The old path of a rename or copy. */
  from?: string
  /**
   * This group's side of the change: staged against the last commit, not
   * staged against the staged copy, a new file whole. Absent where nothing was
   * counted: a conflict, a new folder listed whole, a new file over 1 MB.
   */
  lines?: FileLines
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
  /** The working tree's root, absolute; null outside a git repository. */
  root: string | null
  /** The main checkout's folder when `cwd` is in a linked worktree; null otherwise. */
  worktreeOf: string | null
  /** Null outside a git repository. */
  git: GitStatus | null
  /** Why the last read failed, when it did. */
  error: string | null
}

/** What an agent is doing, as the console names it. */
export type OpKind = 'READ' | 'EDIT' | 'GREP' | 'FIND' | 'RUN' | 'NET' | 'SPAWN' | 'CALL'

/** One tool call still running. */
export type RunningCall = {
  callId: string
  op: OpKind
  /** A short name for what it works on: a file's name, a pattern, a command. */
  target: string
  /** The absolute path of the file it reads or edits; null for other calls. */
  filePath: string | null
  startedAt: number
}

/** One agent's lane: the main loop's, or a subagent's by its id. */
export type Lane = {
  /** Null for the main loop. */
  agentId: string | null
  label: string
  running: RunningCall[]
  lastActiveAt: number
}

export type Outcome =
  | { kind: 'ok' }
  | { kind: 'lines'; added: number; deleted: number }
  | { kind: 'denied' }
  | { kind: 'failed' }

/** One finished call in the console's log. */
export type LogEntry = { at: number; label: string; op: OpKind; target: string; outcome: Outcome }

export type Counters = {
  reads: number
  edits: number
  calls: number
  added: number
  deleted: number
}

/** Tokens as the API reports them for each model response, added up. */
export type TokenCounts = {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

/** The session's context fill and cost, as last read; null where not reported. */
export type SessionMeter = { contextPercent: number | null; usd: number | null }

/** One row of the context breakdown, as /context lists it; `color` is a theme key. */
export type ContextPart = {
  name: string
  tokens: number
  color: string
  kind: 'used' | 'free' | 'buffer'
}

/** What fills the context window, as last read. */
export type ContextReading = {
  /** Input tokens the last response was answered over; null before one. */
  tokens: number | null
  /** The model's context window, in tokens. */
  window: number
  percent: number | null
  /** The breakdown's rows, deferred tool schemas left out; empty until one is read. */
  parts: ContextPart[]
  /** The window the breakdown is measured against, which compaction may make smaller. */
  measuredAgainst: number | null
  /** The token count auto-compaction runs at; null when it is off or not yet read. */
  compactAt: number | null
}

/** What the agents have done this session, as the console shows it. */
export type Activity = {
  startedAt: number
  /** Whether the main loop is in a turn. */
  isTurnActive: boolean
  /** The main loop's lane first, then subagents' in the order they appeared. */
  lanes: Lane[]
  /** Oldest first. */
  log: LogEntry[]
  counters: Counters
  /** Each subagent's label, by its id, kept after its lane leaves. */
  labels: Record<string, string>
  /** Every agent's responses together. */
  tokens: TokenCounts
  /** Each agent's own, by label (`main`, `α` …), kept after its lane leaves. */
  tokensByLabel: Record<string, TokenCounts>
  meter: SessionMeter | null
}

/**
 * Which look the panel draws: `auto` picks by surface (Mainframe in the
 * terminal, the desktop look elsewhere); the others hold on every surface.
 */
export type Look = 'auto' | 'desktop' | 'mainframe'

/** Which sections are folded to their one-line summary. */
export type Folds = { files: boolean; activity: boolean }

declare module 'claude-code' {
  interface PluginState {
    where: {
      where: Shaped<Where | null>
      activity: Shaped<Activity | null>
      context: Shaped<ContextReading | null>
      look: Look
      folds: Folds
      /** When Compact was first pressed and waits for the second; null when it does not. */
      compactArmedAt: number | null
      /** Whether the band above the chat box (`where-mini`) is drawn. */
      isMiniShown: boolean
    }
  }
}
