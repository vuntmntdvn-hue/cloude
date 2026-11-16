import { expect, test } from 'claude-code/testing'

import type { ContextPart } from '../types'
import { contextBar, contextLegend, contextReading } from './context'
import type { ContextUsage } from './context'

const part = (name: string, tokens: number, kind: ContextPart['kind'] = 'used', color = 'text'): ContextPart => ({
  name,
  tokens,
  color,
  kind,
})

const WITH_BREAKDOWN: ContextUsage = {
  context: {
    tokens: 92_000,
    window: 200_000,
    percent: 46,
    breakdown: {
      categories: [
        { name: 'System prompt', tokens: 3_100, color: 'promptBorder', kind: 'used' },
        { name: 'MCP tools', tokens: 9_000, color: 'permission', kind: 'deferred' },
        { name: 'Messages', tokens: 72_000, color: 'claude', kind: 'used' },
        { name: 'Free space', tokens: 84_000, color: 'inactive', kind: 'free' },
        { name: 'Autocompact buffer', tokens: 33_000, color: 'subtle', kind: 'buffer' },
      ],
      rawMaxTokens: 200_000,
      autoCompactThreshold: 167_000,
    },
  },
}

test('a reading with a breakdown keeps its rows, leaving out on-demand tool schemas', () => {
  const reading = contextReading(WITH_BREAKDOWN, null)

  expect(reading).toEqual({
    tokens: 92_000,
    window: 200_000,
    percent: 46,
    parts: [
      part('System prompt', 3_100, 'used', 'promptBorder'),
      part('Messages', 72_000, 'used', 'claude'),
      part('Free space', 84_000, 'free', 'inactive'),
      part('Autocompact buffer', 33_000, 'buffer', 'subtle'),
    ],
    measuredAgainst: 200_000,
    compactAt: 167_000,
  })
})

test('a reading without a breakdown updates the numbers and keeps the last rows', () => {
  const first = contextReading(WITH_BREAKDOWN, null)
  const next = contextReading({ context: { tokens: 95_000, window: 200_000, percent: 48 } }, first)

  expect(next.tokens).toBe(95_000)
  expect(next.percent).toBe(48)
  expect(next.parts).toEqual(first.parts)
  expect(next.compactAt).toBe(167_000)
})

test('before any response the numbers are null and there are no rows', () => {
  expect(contextReading({ context: { window: 200_000 } }, null)).toEqual({
    tokens: null,
    window: 200_000,
    percent: null,
    parts: [],
    measuredAgainst: null,
    compactAt: null,
  })
})

test('auto-compaction turned off reads as no threshold', () => {
  const usage: ContextUsage = {
    context: { ...WITH_BREAKDOWN.context, breakdown: { categories: [], rawMaxTokens: 200_000 } },
  }

  expect(contextReading(usage, null).compactAt).toBeNull()
})

test('the bar splits its squares by tokens and always fills its width', () => {
  const runs = contextBar([part('a', 50), part('b', 25), part('free', 25, 'free')], 20)

  expect(runs.map(run => run.cells)).toEqual([10, 5, 5])
})

test('a small used part keeps one square; the squares still add up', () => {
  const runs = contextBar([part('tiny', 10), part('big', 9_990), part('free', 10_000, 'free')], 40)

  expect(runs[0]?.cells).toBe(1)
  expect(runs.reduce((sum, run) => sum + run.cells, 0)).toBe(40)
})

test('odd shares round so the total is exact', () => {
  const runs = contextBar([part('a', 1), part('b', 1), part('c', 1)], 10)

  expect(runs.reduce((sum, run) => sum + run.cells, 0)).toBe(10)
})

test('nothing to draw makes an empty bar', () => {
  expect(contextBar([], 40)).toEqual([])
  expect(contextBar([part('a', 0)], 40)).toEqual([])
  expect(contextBar([part('a', 5)], 0)).toEqual([])
})

test('the legend lists the largest used parts and counts the rest', () => {
  const parts = [part('System prompt', 3_100), part('Messages', 72_000), part('Free', 84_000, 'free'), part('Tools', 14_000), part('Memory', 2_400)]

  expect(contextLegend(parts, 2)).toEqual({ shown: [part('Messages', 72_000), part('Tools', 14_000)], more: 2 })
})
