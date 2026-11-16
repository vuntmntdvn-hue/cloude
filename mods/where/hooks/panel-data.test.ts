import { expect, test } from 'claude-code/testing'

import type { Activity, ChangedFile, Where } from '../types'
import { callStarted, newActivity } from './activity'
import { inUseRows, panelData, repoPath } from './panel-data'
import { OPEN_FOLDS } from './controls'

const ROOT = '/Users/me/Dev/app'
const T0 = 1_000_000

const reading = (activity: Activity, callId: string, path: string, agentId: string | null = null) =>
  callStarted(activity, { callId, agentId, tool: 'Read', input: { file_path: path }, now: T0 })

const where = (files: ChangedFile[]): Where => ({
  cwd: ROOT,
  root: ROOT,
  worktreeOf: null,
  git: { branch: { head: 'main', oid: 'abc', upstream: null, ahead: 0, behind: 0 }, files },
  error: null,
})

test('a path under the root reads relative to it', () => {
  expect(repoPath(ROOT, `${ROOT}/lib/main.dart`)).toBe('lib/main.dart')
  expect(repoPath(`${ROOT}/`, `${ROOT}/README.md`)).toBe('README.md')
})

test('a path outside the root, or the root itself, or a sibling sharing its prefix, is none', () => {
  expect(repoPath(ROOT, '/Users/me/.claude/CLAUDE.md')).toBeNull()
  expect(repoPath(ROOT, ROOT)).toBeNull()
  expect(repoPath(ROOT, '/Users/me/Dev/app2/lib/a.dart')).toBeNull()
})

test('Windows paths compare with forward slashes', () => {
  expect(repoPath('C:/Users/me/app', 'C:\\Users\\me\\app\\lib\\a.dart')).toBe('lib/a.dart')
})

test('an unchanged file being read becomes one in-use row, however many read it', () => {
  let activity = reading(newActivity(T0), '1', `${ROOT}/lib/main.dart`)

  activity = reading(activity, '2', `${ROOT}/lib/main.dart`, 'agent-a')

  expect(inUseRows(ROOT, activity, new Set())).toEqual([
    {
      path: 'lib/main.dart',
      name: 'main.dart',
      groups: [],
      lines: null,
      isDeleted: false,
      isNew: false,
      isInUse: true,
    },
  ])
})

test('a changed file in use is not added twice, and one outside the repo not at all', () => {
  let activity = reading(newActivity(T0), '1', `${ROOT}/lib/changed.dart`)

  activity = reading(activity, '2', '/Users/me/.claude/CLAUDE.md')
  activity = callStarted(activity, { callId: '3', agentId: null, tool: 'Grep', input: { pattern: 'x' }, now: T0 })

  expect(inUseRows(ROOT, activity, new Set(['lib/changed.dart']))).toEqual([])
})

test('with no repository or no activity there is nothing in use', () => {
  const activity = reading(newActivity(T0), '1', `${ROOT}/a.ts`)

  expect(inUseRows(null, activity, new Set())).toEqual([])
  expect(inUseRows(ROOT, null, new Set())).toEqual([])
})

test('a clean repository still lists the files in use, under their folders', () => {
  const activity = reading(reading(newActivity(T0), '1', `${ROOT}/test/a_test.dart`), '2', `${ROOT}/README.md`)
  const data = panelData(where([]), activity, null, OPEN_FOLDS, '/Users/me', 14)

  expect(data.changes).toBeNull()
  expect(data.files.tree.map(({ folder, rows }) => [folder, rows.map(row => row.name)])).toEqual([
    ['./', ['README.md']],
    ['test', ['a_test.dart']],
  ])
})

test('files in use join the changed ones in their folder and are never cut by the row limit', () => {
  const changed: ChangedFile[] = [
    { group: 'changed', code: 'M', path: 'lib/a.dart' },
    { group: 'changed', code: 'M', path: 'lib/b.dart' },
  ]
  const activity = reading(newActivity(T0), '1', `${ROOT}/lib/c.dart`)
  const data = panelData(where(changed), activity, null, OPEN_FOLDS, '/Users/me', 1)

  expect(data.files.tree).toEqual([
    {
      folder: 'lib',
      rows: [
        expect.objectContaining({ name: 'a.dart', isInUse: false }),
        expect.objectContaining({ name: 'c.dart', isInUse: true }),
      ],
    },
  ])
  expect(data.files.hiddenRows).toBe(1)
})
