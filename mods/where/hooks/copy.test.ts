import { expect, test } from 'claude-code/testing'

import { agentName, ago, did, doing, money, onFile, percent, timeOfDay, tokenCount } from './copy'

test('each operation reads as a present-tense phrase', () => {
  expect(doing('READ', 'view.ts')).toBe('Reading view.ts')
  expect(doing('EDIT', 'view.ts')).toBe('Editing view.ts')
  expect(doing('GREP', '"drawPanel"')).toBe('Searching for "drawPanel"')
  expect(doing('FIND', '**/*.ts')).toBe('Finding **/*.ts')
  expect(doing('RUN', 'git')).toBe('Running git')
  expect(doing('NET', 'example.com')).toBe('Fetching example.com')
  expect(doing('SPAWN', 'Find callers')).toBe('Starting Find callers')
  expect(doing('CALL', 'get_screenshot')).toBe('Using get_screenshot')
})

test('each operation reads as a past-tense phrase', () => {
  expect(did('READ', 'a.ts')).toBe('Read a.ts')
  expect(did('EDIT', 'a.ts')).toBe('Edited a.ts')
  expect(did('GREP', '"x"')).toBe('Searched for "x"')
  expect(did('RUN', 'git')).toBe('Ran git')
})

test('an operation with no target is the verb alone', () => {
  expect(doing('RUN', '')).toBe('Running')
  expect(did('CALL', '')).toBe('Used')
})

test("a file chip says in one word what the agent does to it", () => {
  expect(onFile('READ')).toBe('reading')
  expect(onFile('EDIT')).toBe('editing')
  expect(onFile('GREP')).toBe('working')
})

test('the main loop is Claude, the rest are subagents by their label', () => {
  expect(agentName('main')).toBe('Claude')
  expect(agentName('α')).toBe('Subagent α')
})

test('how long ago reads short, in the largest whole unit', () => {
  expect(ago(400)).toBe('now')
  expect(ago(5_900)).toBe('5s')
  expect(ago(3 * 60_000 + 10)).toBe('3m')
  expect(ago(2 * 3_600_000)).toBe('2h')
  expect(ago(26 * 3_600_000)).toBe('1d')
})

test('token counts read short, with one decimal only while it says something', () => {
  expect(tokenCount(0)).toBe('0')
  expect(tokenCount(950)).toBe('950')
  expect(tokenCount(1_000)).toBe('1k')
  expect(tokenCount(4_230)).toBe('4.2k')
  expect(tokenCount(182_400)).toBe('182k')
  expect(tokenCount(1_240_000)).toBe('1.2M')
  expect(tokenCount(34_000_000)).toBe('34M')
})

test('a count just under a million rounds up into millions, not to 1000k', () => {
  expect(tokenCount(999_600)).toBe('1M')
})

test('cost reads in dollars and cents, context as a whole percent', () => {
  expect(money(1.237)).toBe('$1.24')
  expect(money(0)).toBe('$0.00')
  expect(percent(45.6)).toBe('46%')
})

test('the time of day has two-digit hours and minutes', () => {
  expect(timeOfDay(new Date(2026, 10, 16, 9, 5).getTime())).toBe('09:05')
  expect(timeOfDay(new Date(2026, 10, 16, 23, 41).getTime())).toBe('23:41')
})
