import { expect, test } from 'claude-code/testing'

import { newActivity, turnStarted, callStarted } from './activity'
import { asFolds, CONFIRM_MS, compactPress, isArmed, isBusy, OPEN_FOLDS, toggleFold } from './controls'

const T0 = 1_000_000

test('a first press on Compact arms it and waits for the second', () => {
  expect(compactPress(null, T0, false)).toEqual({ kind: 'arm', armedAt: T0 })
})

test('a second press within 5 seconds compacts', () => {
  expect(compactPress(T0, T0 + CONFIRM_MS - 1, false)).toEqual({ kind: 'compact' })
})

test('a second press too late arms it again instead', () => {
  expect(compactPress(T0, T0 + CONFIRM_MS, false)).toEqual({ kind: 'arm', armedAt: T0 + CONFIRM_MS })
})

test('while Claude works a press does nothing but say so, armed or not', () => {
  expect(compactPress(null, T0, true)).toEqual({ kind: 'busy' })
  expect(compactPress(T0, T0 + 1, true)).toEqual({ kind: 'busy' })
})

test('Compact stays armed for 5 seconds', () => {
  expect(isArmed(null, T0)).toBe(false)
  expect(isArmed(T0, T0 + CONFIRM_MS - 1)).toBe(true)
  expect(isArmed(T0, T0 + CONFIRM_MS)).toBe(false)
})

test('Claude is busy in a turn or while any agent runs a call', () => {
  expect(isBusy(null)).toBe(false)
  expect(isBusy(newActivity(T0))).toBe(false)
  expect(isBusy(turnStarted(newActivity(T0), T0))).toBe(true)
  expect(
    isBusy(
      callStarted(newActivity(T0), {
        callId: 'a',
        agentId: 'agent-a',
        tool: 'Read',
        input: { file_path: '/r/a.ts' },
        now: T0,
      }),
    ),
  ).toBe(true)
})

test('a fold button flips its own section only', () => {
  const folded = toggleFold(OPEN_FOLDS, 'files')

  expect(folded).toEqual({ files: true, activity: false })
  expect(toggleFold(folded, 'files')).toEqual(OPEN_FOLDS)
})

test('folds read back from the store; anything malformed reads as all open', () => {
  expect(asFolds({ files: true, activity: false })).toEqual({ files: true, activity: false })
  expect(asFolds({ files: 'yes' })).toEqual(OPEN_FOLDS)
  expect(asFolds(undefined)).toEqual(OPEN_FOLDS)
  expect(asFolds('files')).toEqual(OPEN_FOLDS)
})
