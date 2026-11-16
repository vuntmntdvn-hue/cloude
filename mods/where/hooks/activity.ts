import type { Activity, Counters, Lane, OpKind, Outcome, SessionMeter, TokenCounts } from '../types'
import { countLines } from './line-counts'

const MAIN_LABEL = 'main'
// Subagents are labeled in the order they first act; past the list, by number.
const GREEK = ['α', 'β', 'γ', 'δ', 'ε', 'ζ', 'η', 'θ', 'ι', 'κ']
const LOG_LIMIT = 30
// A subagent's lane stays this long after its last call ends, then leaves.
const LANE_LINGER_MS = 20_000

const NO_COUNTS: Counters = { reads: 0, edits: 0, calls: 0, added: 0, deleted: 0 }
const NO_TOKENS: TokenCounts = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }

/** One model response's tokens, from the agent that made it (null for the main loop). */
export type ResponseUsage = { agentId: string | null; tokens: TokenCounts }

/** A tool call as the hooks see it start. */
export type CallStart = {
  callId: string
  /** Null for the main loop. */
  agentId: string | null
  tool: string
  input: Readonly<Record<string, unknown>>
  now: number
}

export type CallEnd = CallStart & { result: 'ok' | 'denied' | 'failed' }

export type CallSummary = { op: OpKind; target: string; filePath: string | null }

export function newActivity(now: number): Activity {
  return {
    startedAt: now,
    isTurnActive: false,
    lanes: [mainLane(now)],
    log: [],
    counters: NO_COUNTS,
    labels: {},
    tokens: NO_TOKENS,
    tokensByLabel: {},
    meter: null,
  }
}

/** Adds a response's tokens to the session's and to its agent's. */
export function responseUsed(activity: Activity, used: ResponseUsage): Activity {
  const { labels, label } = labelFor(activity, used.agentId)

  return {
    ...activity,
    labels,
    tokens: addTokens(activity.tokens, used.tokens),
    tokensByLabel: {
      ...activity.tokensByLabel,
      [label]: addTokens(activity.tokensByLabel[label] ?? NO_TOKENS, used.tokens),
    },
  }
}

export function meterRead(activity: Activity, meter: SessionMeter): Activity {
  return { ...activity, meter }
}

/** Tokens the model worked through fresh: input, cache writes and output; cache reads are not. */
export function freshTokens(tokens: TokenCounts): number {
  return tokens.input + tokens.cacheWrite + tokens.output
}

/** After a reload: the counts and log stay, nothing is running. */
export function resetRunning(activity: Activity, now: number): Activity {
  return { ...activity, isTurnActive: false, lanes: [mainLane(now)] }
}

/** What a tool call is doing, in the console's words. */
export function describeCall(tool: string, input: Readonly<Record<string, unknown>>): CallSummary {
  switch (tool) {
    case 'Read':
      return onFile('READ', input.file_path)
    case 'Edit':
    case 'Write':
      return onFile('EDIT', input.file_path)
    case 'NotebookEdit':
      return onFile('EDIT', input.notebook_path)
    case 'Grep':
      return other('GREP', `"${text(input.pattern)}"`)
    case 'Glob':
      return other('FIND', text(input.pattern))
    case 'Bash':
      return other('RUN', commandName(text(input.command)))
    case 'WebFetch':
      return other('NET', hostOf(text(input.url)))
    case 'WebSearch':
      return other('NET', text(input.query))
    case 'Agent':
    case 'Task':
      return other('SPAWN', text(input.description) || text(input.subagent_type))
    default:
      return other('CALL', shortToolName(tool))
  }
}

export function callStarted(activity: Activity, start: CallStart): Activity {
  const { labels, lane } = laneFor(activity, start.agentId, start.now)
  const call = { callId: start.callId, ...describeCall(start.tool, start.input), startedAt: start.now }
  const started: Lane = { ...lane, running: [...lane.running, call], lastActiveAt: start.now }

  return {
    ...activity,
    labels,
    lanes: prune(withLane(activity.lanes, started), start.now),
    counters: { ...activity.counters, calls: activity.counters.calls + 1 },
  }
}

export function callEnded(activity: Activity, end: CallEnd): Activity {
  const { labels, lane } = laneFor(activity, end.agentId, end.now)
  const { op, target } = describeCall(end.tool, end.input)
  const outcome = outcomeOf(end)
  const finished: Lane = {
    ...lane,
    running: lane.running.filter(call => call.callId !== end.callId),
    lastActiveAt: end.now,
  }

  return {
    ...activity,
    labels,
    lanes: prune(withLane(activity.lanes, finished), end.now),
    log: [...activity.log, { at: end.now, label: lane.label, op, target, outcome }].slice(-LOG_LIMIT),
    counters: counted(activity.counters, op, outcome),
  }
}

/** Only the main loop's turns: a subagent's run is a turn of its own. */
export function turnStarted(activity: Activity, now: number): Activity {
  return { ...activity, isTurnActive: true, lanes: prune(activity.lanes, now) }
}

/** The main loop's turn ended; subagent lanes with nothing running leave. */
export function turnEnded(activity: Activity): Activity {
  return {
    ...activity,
    isTurnActive: false,
    lanes: activity.lanes.filter(lane => lane.agentId === null || lane.running.length > 0),
  }
}

function mainLane(now: number): Lane {
  return { agentId: null, label: MAIN_LABEL, running: [], lastActiveAt: now }
}

/** The agent's lane, made and labeled on its first call. */
function laneFor(
  activity: Activity,
  agentId: string | null,
  now: number,
): { labels: Record<string, string>; lane: Lane } {
  const found = activity.lanes.find(lane => lane.agentId === agentId)

  if (found !== undefined) return { labels: activity.labels, lane: found }
  if (agentId === null) return { labels: activity.labels, lane: mainLane(now) }

  const { labels, label } = labelFor(activity, agentId)

  return { labels, lane: { agentId, label, running: [], lastActiveAt: now } }
}

/** The agent's label, given on first sight: `main`, then α, β … in order. */
function labelFor(activity: Activity, agentId: string | null): { labels: Record<string, string>; label: string } {
  if (agentId === null) return { labels: activity.labels, label: MAIN_LABEL }

  const known = activity.labels[agentId]

  if (known !== undefined) return { labels: activity.labels, label: known }

  const seen = Object.keys(activity.labels).length
  const label = GREEK[seen] ?? `#${seen + 1}`

  return { labels: { ...activity.labels, [agentId]: label }, label }
}

function addTokens(a: TokenCounts, b: TokenCounts): TokenCounts {
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    cacheRead: a.cacheRead + b.cacheRead,
    cacheWrite: a.cacheWrite + b.cacheWrite,
  }
}

/** Replaces the lane with the same agent in its place, or adds it: main first, a new subagent last. */
function withLane(lanes: readonly Lane[], lane: Lane): Lane[] {
  if (lanes.some(one => one.agentId === lane.agentId)) {
    return lanes.map(one => (one.agentId === lane.agentId ? lane : one))
  }

  return lane.agentId === null ? [lane, ...lanes] : [...lanes, lane]
}

/** Drops subagent lanes idle longer than the linger time; main always stays. */
function prune(lanes: readonly Lane[], now: number): Lane[] {
  return lanes.filter(
    lane =>
      lane.agentId === null || lane.running.length > 0 || now - lane.lastActiveAt < LANE_LINGER_MS,
  )
}

function outcomeOf(end: CallEnd): Outcome {
  if (end.result !== 'ok') return { kind: end.result }

  switch (end.tool) {
    case 'Edit':
      return {
        kind: 'lines',
        added: countLines(text(end.input.new_string)),
        deleted: countLines(text(end.input.old_string)),
      }
    case 'Write':
      return { kind: 'lines', added: countLines(text(end.input.content)), deleted: 0 }
    default:
      return { kind: 'ok' }
  }
}

function counted(counters: Counters, op: OpKind, outcome: Outcome): Counters {
  if (outcome.kind === 'denied' || outcome.kind === 'failed') return counters

  return {
    ...counters,
    reads: counters.reads + (op === 'READ' ? 1 : 0),
    edits: counters.edits + (op === 'EDIT' ? 1 : 0),
    added: counters.added + (outcome.kind === 'lines' ? outcome.added : 0),
    deleted: counters.deleted + (outcome.kind === 'lines' ? outcome.deleted : 0),
  }
}

function onFile(op: OpKind, path: unknown): CallSummary {
  const filePath = text(path)

  return { op, target: filePath.split('/').pop() || filePath, filePath: filePath || null }
}

function other(op: OpKind, target: string): CallSummary {
  return { op, target, filePath: null }
}

/** The program a command runs: its first word that is not a `NAME=value`, without its folder. */
function commandName(command: string): string {
  const word = command.trim().split(/\s+/).find(part => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(part)) ?? ''

  return word.split('/').pop() ?? word
}

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

/** `mcp__server__tool` is `tool`; any other name stays. */
function shortToolName(tool: string): string {
  return tool.startsWith('mcp__') ? (tool.split('__').pop() ?? tool) : tool
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}
