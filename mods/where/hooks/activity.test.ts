import { expect, test } from 'claude-code/testing'

import type { Activity } from '../types'
import {
  callEnded,
  callStarted,
  describeCall,
  freshTokens,
  meterRead,
  newActivity,
  resetRunning,
  responseUsed,
  turnEnded,
  turnStarted,
} from './activity'
import type { CallStart } from './activity'

const T0 = 1_000_000

const read = (callId: string, path: string, agentId: string | null = null, now = T0): CallStart => ({
  callId,
  agentId,
  tool: 'Read',
  input: { file_path: path },
  now,
})

const lane = (activity: Activity, label: string) => activity.lanes.find(one => one.label === label)

test('a new session has an idle main lane and nothing counted', () => {
  const activity = newActivity(T0)

  expect(activity.lanes).toEqual([{ agentId: null, label: 'main', running: [], lastActiveAt: T0 }])
  expect(activity.counters).toEqual({ reads: 0, edits: 0, calls: 0, added: 0, deleted: 0 })
  expect(activity.log).toHaveLength(0)
})

test('file tools name the file and keep its path', () => {
  expect(describeCall('Read', { file_path: '/repo/lib/a.dart' })).toEqual({
    op: 'READ',
    target: 'a.dart',
    filePath: '/repo/lib/a.dart',
  })
  expect(describeCall('Edit', { file_path: '/repo/b.ts' }).op).toBe('EDIT')
  expect(describeCall('Write', { file_path: '/repo/c.ts' }).op).toBe('EDIT')
  expect(describeCall('NotebookEdit', { notebook_path: '/repo/n.ipynb' }).target).toBe('n.ipynb')
})

test('other tools get a short target', () => {
  expect(describeCall('Grep', { pattern: 'LoginError' })).toEqual({
    op: 'GREP',
    target: '"LoginError"',
    filePath: null,
  })
  expect(describeCall('Glob', { pattern: '**/*.ts' }).target).toBe('**/*.ts')
  expect(describeCall('WebFetch', { url: 'https://example.com/a?b=1' }).target).toBe('example.com')
  expect(describeCall('WebFetch', { url: 'not a url' }).target).toBe('not a url')
  expect(describeCall('Agent', { description: 'Find callers' })).toEqual({
    op: 'SPAWN',
    target: 'Find callers',
    filePath: null,
  })
})

test('a command is named by its program, past variables and folders', () => {
  expect(describeCall('Bash', { command: 'git status --short' }).target).toBe('git')
  expect(describeCall('Bash', { command: 'CI=1 /usr/bin/flutter test' }).target).toBe('flutter')
})

test('a quoted assignment with spaces is skipped whole, and a command of only assignments too', () => {
  const command = 'C="/Users/me/Library/Application Support/Claude/claude"; cd /repo && "$C" plugin test'

  expect(describeCall('Bash', { command }).target).toBe('cd')
})

test('a quoted program keeps its name without its quotes', () => {
  expect(describeCall('Bash', { command: '"$C" plugin test mods/where' }).target).toBe('$C')
  expect(describeCall('Bash', { command: "'/opt/my tools/run' --fast" }).target).toBe('run')
})

test('separators and escapes split a command line as a shell would', () => {
  expect(describeCall('Bash', { command: 'X=1 Y=2 && npm test' }).target).toBe('npm')
  expect(describeCall('Bash', { command: 'A=1 | grep x' }).target).toBe('grep')
  expect(describeCall('Bash', { command: 'my\\ tool --run' }).target).toBe('my tool')
  expect(describeCall('Bash', { command: '' }).target).toBe('')
})

test('an unknown or MCP tool is a CALL by its short name', () => {
  expect(describeCall('mcp__figma__get_screenshot', {})).toEqual({
    op: 'CALL',
    target: 'get_screenshot',
    filePath: null,
  })
  expect(describeCall('TodoWrite', {}).target).toBe('TodoWrite')
})

test('calls started together run side by side in one lane, each counted', () => {
  let activity = newActivity(T0)

  for (const id of ['a', 'b', 'c']) activity = callStarted(activity, read(id, `/r/${id}.ts`))

  expect(lane(activity, 'main')?.running.map(call => call.target)).toEqual(['a.ts', 'b.ts', 'c.ts'])
  expect(activity.counters.calls).toBe(3)
})

test('subagents get Greek labels in the order they first act, and keep them', () => {
  let activity = newActivity(T0)

  activity = callStarted(activity, read('1', '/r/x.ts', 'agent-b'))
  activity = callStarted(activity, read('2', '/r/y.ts', 'agent-a'))
  activity = callStarted(activity, read('3', '/r/z.ts', 'agent-b'))

  expect(activity.lanes.map(one => one.label)).toEqual(['main', 'α', 'β'])
  expect(lane(activity, 'α')?.running).toHaveLength(2)
})

test('an ended call leaves its lane and goes into the log', () => {
  let activity = callStarted(newActivity(T0), read('a', '/r/a.ts'))

  activity = callEnded(activity, { ...read('a', '/r/a.ts', null, T0 + 5), result: 'ok' })

  expect(lane(activity, 'main')?.running).toHaveLength(0)
  expect(activity.log).toEqual([
    { at: T0 + 5, label: 'main', op: 'READ', target: 'a.ts', outcome: { kind: 'ok' } },
  ])
  expect(activity.counters.reads).toBe(1)
})

test('an edit counts its lines from the old and new text, a write from its content', () => {
  let activity = newActivity(T0)

  activity = callEnded(activity, {
    callId: 'e',
    agentId: null,
    tool: 'Edit',
    input: { file_path: '/r/a.ts', old_string: 'one\n', new_string: 'one\ntwo\nthree\n' },
    now: T0,
    result: 'ok',
  })
  activity = callEnded(activity, {
    callId: 'w',
    agentId: null,
    tool: 'Write',
    input: { file_path: '/r/b.ts', content: 'a\nb' },
    now: T0,
    result: 'ok',
  })

  expect(activity.log.map(entry => entry.outcome)).toEqual([
    { kind: 'lines', added: 3, deleted: 1 },
    { kind: 'lines', added: 2, deleted: 0 },
  ])
  expect(activity.counters).toEqual({ reads: 0, edits: 2, calls: 0, added: 5, deleted: 1 })
})

test('a denied or failed call is logged but not counted as a read or edit', () => {
  let activity = newActivity(T0)

  activity = callEnded(activity, { ...read('a', '/r/.env'), result: 'denied' })
  activity = callEnded(activity, {
    callId: 'e',
    agentId: null,
    tool: 'Edit',
    input: { file_path: '/r/a.ts', old_string: 'x', new_string: 'y' },
    now: T0,
    result: 'failed',
  })

  expect(activity.log.map(entry => entry.outcome.kind)).toEqual(['denied', 'failed'])
  expect(activity.counters).toEqual({ reads: 0, edits: 0, calls: 0, added: 0, deleted: 0 })
})

test('the log keeps the last 30 entries', () => {
  let activity = newActivity(T0)

  for (let i = 0; i < 35; i += 1) {
    activity = callEnded(activity, { ...read(String(i), `/r/${i}.ts`), result: 'ok' })
  }

  expect(activity.log).toHaveLength(30)
  expect(activity.log[0]?.target).toBe('5.ts')
})

test('a subagent lane leaves 20 s after its last call; main stays', () => {
  let activity = callStarted(newActivity(T0), read('1', '/r/a.ts', 'agent-a'))

  activity = callEnded(activity, { ...read('1', '/r/a.ts', 'agent-a', T0 + 1_000), result: 'ok' })
  activity = callStarted(activity, read('2', '/r/b.ts', null, T0 + 10_000))
  expect(activity.lanes.map(one => one.label)).toEqual(['main', 'α'])

  activity = callStarted(activity, read('3', '/r/c.ts', null, T0 + 22_000))
  expect(activity.lanes.map(one => one.label)).toEqual(['main'])
})

test('an end with no start is still logged', () => {
  const activity = callEnded(newActivity(T0), { ...read('x', '/r/x.ts', 'agent-z'), result: 'ok' })

  expect(activity.log[0]?.label).toBe('α')
})

test('turns flag the main loop; a turn end drops idle subagent lanes', () => {
  let activity = turnStarted(newActivity(T0), T0)

  activity = callStarted(activity, read('1', '/r/a.ts', 'agent-a'))
  activity = callStarted(activity, read('2', '/r/b.ts', 'agent-b'))
  activity = callEnded(activity, { ...read('1', '/r/a.ts', 'agent-a'), result: 'ok' })
  expect(activity.isTurnActive).toBe(true)

  activity = turnEnded(activity)

  expect(activity.isTurnActive).toBe(false)
  expect(activity.lanes.map(one => one.label)).toEqual(['main', 'β'])
})

test('a reload keeps the counts and log and clears what was running', () => {
  let activity = callStarted(turnStarted(newActivity(T0), T0), read('a', '/r/a.ts'))

  activity = callEnded(activity, { ...read('a', '/r/a.ts'), result: 'ok' })
  activity = callStarted(activity, read('b', '/r/b.ts', 'agent-a'))

  const reloaded = resetRunning(activity, T0 + 50)

  expect(reloaded.isTurnActive).toBe(false)
  expect(reloaded.lanes).toEqual([{ agentId: null, label: 'main', running: [], lastActiveAt: T0 + 50 }])
  expect(reloaded.log).toEqual(activity.log)
  expect(reloaded.counters).toEqual(activity.counters)
})

const tokens = (input: number, output: number, cacheRead = 0, cacheWrite = 0) => ({
  input,
  output,
  cacheRead,
  cacheWrite,
})

test('a new session has no tokens and no meter', () => {
  const activity = newActivity(T0)

  expect(activity.tokens).toEqual(tokens(0, 0))
  expect(activity.tokensByLabel).toEqual({})
  expect(activity.meter).toBeNull()
})

test("each response's tokens add to the session's and to its agent's", () => {
  let activity = newActivity(T0)

  activity = responseUsed(activity, { agentId: null, tokens: tokens(100, 20, 5_000, 300) })
  activity = responseUsed(activity, { agentId: null, tokens: tokens(50, 10, 6_000, 0) })
  activity = responseUsed(activity, { agentId: 'agent-a', tokens: tokens(40, 8, 1_000, 200) })

  expect(activity.tokens).toEqual(tokens(190, 38, 12_000, 500))
  expect(activity.tokensByLabel).toEqual({
    main: tokens(150, 30, 11_000, 300),
    α: tokens(40, 8, 1_000, 200),
  })
})

test("a subagent's first response labels it, and its first call keeps that label", () => {
  let activity = responseUsed(newActivity(T0), { agentId: 'agent-b', tokens: tokens(1, 1) })

  activity = callStarted(activity, read('1', '/r/a.ts', 'agent-a'))
  activity = callStarted(activity, read('2', '/r/b.ts', 'agent-b'))

  expect(activity.lanes.map(one => one.label)).toEqual(['main', 'β', 'α'])
})

test('fresh tokens leave out cache reads', () => {
  expect(freshTokens(tokens(100, 20, 5_000, 300))).toBe(420)
})

test('the meter keeps the last reading; a reload keeps tokens and meter', () => {
  let activity = meterRead(newActivity(T0), { contextPercent: 46, usd: 1.24 })

  activity = responseUsed(activity, { agentId: null, tokens: tokens(10, 2) })
  activity = meterRead(activity, { contextPercent: 47, usd: null })

  const reloaded = resetRunning(activity, T0 + 1)

  expect(reloaded.meter).toEqual({ contextPercent: 47, usd: null })
  expect(reloaded.tokens).toEqual(tokens(10, 2))
})
