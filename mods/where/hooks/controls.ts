import type { Activity, Folds } from '../types'

/** How long a first press on Compact waits for the second. */
export const CONFIRM_MS = 5_000

export const OPEN_FOLDS: Folds = { files: false, activity: false }

export type FoldSection = keyof Folds

/** The buttons as one draw shows them: their labels, and what a press does. */
export type PanelControls = {
  isCompactArmed: boolean
  onCompact: () => void
  onFold: (section: FoldSection) => void
}

/** What a press on Compact does. */
export type CompactStep =
  /** Claude is working: say so, change nothing; compaction runs between turns only. */
  | { kind: 'busy' }
  /** A first press: wait for the second. */
  | { kind: 'arm'; armedAt: number }
  /** A second press in time: compact. */
  | { kind: 'compact' }

/** A press on Compact, given when it was armed (null if not) and whether Claude is working. */
export function compactPress(armedAt: number | null, now: number, isBusy: boolean): CompactStep {
  if (isBusy) return { kind: 'busy' }
  if (isArmed(armedAt, now)) return { kind: 'compact' }

  return { kind: 'arm', armedAt: now }
}

/** Whether Compact still waits for its second press. */
export function isArmed(armedAt: number | null, now: number): boolean {
  return armedAt !== null && now - armedAt < CONFIRM_MS
}

/** Whether any agent is working, or the main loop is in a turn: compaction must wait. */
export function isBusy(activity: Activity | null): boolean {
  if (activity === null) return false

  return activity.isTurnActive || activity.lanes.some(lane => lane.running.length > 0)
}

export function toggleFold(folds: Folds, section: FoldSection): Folds {
  return { ...folds, [section]: !folds[section] }
}

/** Folds as the store kept them; anything else reads as all open. */
export function asFolds(value: unknown): Folds {
  if (typeof value !== 'object' || value === null) return OPEN_FOLDS

  const kept = value as Record<string, unknown>

  return { files: kept.files === true, activity: kept.activity === true }
}
