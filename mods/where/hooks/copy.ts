import type { OpKind } from '../types'

const MAIN_LABEL = 'main'

const DOING: Readonly<Record<OpKind, string>> = {
  READ: 'Reading',
  EDIT: 'Editing',
  GREP: 'Searching for',
  FIND: 'Finding',
  RUN: 'Running',
  NET: 'Fetching',
  SPAWN: 'Starting',
  CALL: 'Using',
}

const DID: Readonly<Record<OpKind, string>> = {
  READ: 'Read',
  EDIT: 'Edited',
  GREP: 'Searched for',
  FIND: 'Found',
  RUN: 'Ran',
  NET: 'Fetched',
  SPAWN: 'Started',
  CALL: 'Used',
}

const SECOND = 1_000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** What an agent is doing, in plain words: `Editing view.ts`. */
export function doing(op: OpKind, target: string): string {
  return target === '' ? DOING[op] : `${DOING[op]} ${target}`
}

/** What an agent did: `Edited view.ts`. */
export function did(op: OpKind, target: string): string {
  return target === '' ? DID[op] : `${DID[op]} ${target}`
}

/** `Claude` for the main loop, `Subagent α` for the rest. */
export function agentName(label: string): string {
  return label === MAIN_LABEL ? 'Claude' : `Subagent ${label}`
}

/** How long ago, short: `now`, `5s`, `3m`, `2h`, `1d`. */
export function ago(elapsedMs: number): string {
  if (elapsedMs < SECOND) return 'now'
  if (elapsedMs < MINUTE) return `${Math.floor(elapsedMs / SECOND)}s`
  if (elapsedMs < HOUR) return `${Math.floor(elapsedMs / MINUTE)}m`
  if (elapsedMs < DAY) return `${Math.floor(elapsedMs / HOUR)}h`

  return `${Math.floor(elapsedMs / DAY)}d`
}

/** A token count, short: `950`, `4.2k`, `182k`, `1.2M`, `34M`. */
export function tokenCount(count: number): string {
  if (count < 1_000) return String(count)
  if (count < 10_000) return `${trimZero((count / 1_000).toFixed(1))}k`
  if (Math.round(count / 1_000) < 1_000) return `${Math.round(count / 1_000)}k`
  if (count < 10_000_000) return `${trimZero((count / 1_000_000).toFixed(1))}M`

  return `${Math.round(count / 1_000_000)}M`
}

/** `$1.24`. */
export function money(usd: number): string {
  return `$${usd.toFixed(2)}`
}

/** `46%`. */
export function percent(value: number): string {
  return `${Math.round(value)}%`
}

function trimZero(fixed: string): string {
  return fixed.endsWith('.0') ? fixed.slice(0, -2) : fixed
}

/** The local time of day, `09:12`. */
export function timeOfDay(epochMs: number): string {
  const date = new Date(epochMs)

  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}
