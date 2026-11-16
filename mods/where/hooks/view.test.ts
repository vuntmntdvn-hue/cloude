import { expect, test } from 'claude-code/testing'

import type { ChangedFile, GitBranch } from '../types'
import {
  branchLabel,
  folderTree,
  groupCounts,
  linesLabel,
  splitPath,
  syncTag,
  tildify,
  treeName,
} from './view'

const OID = '11fa86e42f75ea21b00bdd0c18eca4730a094123'
const BRANCH: GitBranch = { head: 'main', oid: OID, upstream: null, ahead: 0, behind: 0 }
const TRACKED: GitBranch = { ...BRANCH, head: 'feature/x', upstream: 'origin/feature/x' }

const file = (group: ChangedFile['group'], path: string, extra: Partial<ChangedFile> = {}): ChangedFile => ({
  group,
  code: group === 'untracked' ? '?' : 'M',
  path,
  ...extra,
})

test('a path under home starts with ~', () => {
  expect(tildify('/Users/me/Dev/app', '/Users/me')).toBe('~/Dev/app')
  expect(tildify('/Users/me', '/Users/me')).toBe('~')
})

test('a home with a trailing slash still matches', () => {
  expect(tildify('/Users/me/Dev/app', '/Users/me/')).toBe('~/Dev/app')
})

test('a path outside home, or a sibling sharing its prefix, stays as it is', () => {
  expect(tildify('/opt/app', '/Users/me')).toBe('/opt/app')
  expect(tildify('/Users/meg/app', '/Users/me')).toBe('/Users/meg/app')
})

test('without a home folder the path stays as it is', () => {
  expect(tildify('/Users/me/app', undefined)).toBe('/Users/me/app')
  expect(tildify('/Users/me/app', '')).toBe('/Users/me/app')
})

test('a Windows path under home starts with ~ and uses forward slashes', () => {
  expect(tildify('C:\\Users\\me\\Dev\\app', 'C:\\Users\\me')).toBe('~/Dev/app')
})

test('a branch shows its name, a detached HEAD its short commit', () => {
  expect(branchLabel(BRANCH)).toBe('main')
  expect(branchLabel({ ...BRANCH, head: null })).toBe('detached at 11fa86e')
  expect(branchLabel({ ...BRANCH, head: null, oid: null })).toBe('detached')
})

test('a branch level with its upstream is in sync', () => {
  expect(syncTag(TRACKED)).toEqual({ text: 'in sync', tone: 'good' })
})

test('commits ahead are to push, commits behind are to pull', () => {
  expect(syncTag({ ...TRACKED, ahead: 2 })).toEqual({ text: '↑2 to push', tone: 'attention' })
  expect(syncTag({ ...TRACKED, behind: 1 })).toEqual({ text: '↓1 to pull', tone: 'info' })
})

test('a branch both ahead and behind has diverged', () => {
  expect(syncTag({ ...TRACKED, ahead: 2, behind: 1 })).toEqual({ text: '↑2 ↓1', tone: 'danger' })
})

test('a branch with no upstream is not on the remote', () => {
  expect(syncTag(BRANCH)).toEqual({ text: 'not on remote', tone: 'quiet' })
})

test('a path splits into its name and its folder', () => {
  expect(splitPath('lib/auth/login.dart')).toEqual({ name: 'login.dart', folder: 'lib/auth' })
  expect(splitPath('README.md')).toEqual({ name: 'README.md', folder: '' })
})

test('a new folder git lists whole keeps its trailing slash', () => {
  expect(splitPath('notes/')).toEqual({ name: 'notes/', folder: '' })
  expect(splitPath('docs/drafts/')).toEqual({ name: 'drafts/', folder: 'docs' })
})

test('each group is counted, a file in two groups in both', () => {
  const files = [
    file('staged', 'a.txt'),
    file('changed', 'a.txt'),
    file('changed', 'b.txt'),
    file('untracked', 'c.txt'),
  ]

  expect(groupCounts(files)).toEqual({ conflicted: 0, staged: 1, changed: 2, untracked: 1 })
})

test('line counts read as +n and −n, a zero side left out', () => {
  expect(linesLabel({ added: 12, deleted: 3 })).toEqual({ added: '+12', deleted: '−3' })
  expect(linesLabel({ added: 30, deleted: 0 })).toEqual({ added: '+30', deleted: null })
  expect(linesLabel({ added: 0, deleted: 40 })).toEqual({ added: null, deleted: '−40' })
  expect(linesLabel({ added: 0, deleted: 0 })).toEqual({ added: null, deleted: null })
})

test('a row is named by its file, a rename by its old and new names', () => {
  expect(treeName(file('changed', 'lib/api.dart'))).toBe('api.dart')
  expect(treeName(file('staged', 'lib/new.dart', { code: 'R', from: 'lib/old.dart' }))).toBe(
    'old.dart → new.dart',
  )
})

test('a file moved between folders names where it came from', () => {
  expect(treeName(file('staged', 'b/x.ts', { code: 'R', from: 'a/x.ts' }))).toBe('a/x.ts → x.ts')
})

test('the tree puts files under their folders, in path order, the top level as ./', () => {
  const tree = folderTree([
    file('staged', 'lib/auth/login.dart'),
    file('changed', 'README.md'),
    file('untracked', 'test/login_test.dart'),
    file('changed', 'lib/api.dart'),
  ])

  expect(tree.map(({ folder, rows }) => [folder, rows.map(row => row.name)])).toEqual([
    ['./', ['README.md']],
    ['lib', ['api.dart']],
    ['lib/auth', ['login.dart']],
    ['test', ['login_test.dart']],
  ])
})

test('a file staged and changed again is one row with both dots and its counts added up', () => {
  const [folder] = folderTree([
    file('changed', 'a.txt', { lines: { added: 2, deleted: 0 } }),
    file('staged', 'a.txt', { lines: { added: 3, deleted: 1 } }),
  ])

  expect(folder?.rows).toEqual([
    {
      path: 'a.txt',
      name: 'a.txt',
      groups: ['staged', 'changed'],
      lines: { added: 5, deleted: 1 },
      isDeleted: false,
      isNew: false,
    },
  ])
})

test('a deleted file is marked deleted, an added or new file new', () => {
  const [folder] = folderTree([
    file('changed', 'gone.txt', { code: 'D' }),
    file('staged', 'added.txt', { code: 'A' }),
    file('untracked', 'fresh.txt'),
  ])
  const flags = folder?.rows.map(row => [row.name, row.isDeleted, row.isNew])

  expect(flags).toEqual([
    ['gone.txt', true, false],
    ['added.txt', false, true],
    ['fresh.txt', false, true],
  ])
})

test('a binary side makes the row binary; an uncounted row has no lines', () => {
  const [folder] = folderTree([
    file('staged', 'logo.png', { lines: 'binary' }),
    file('changed', 'logo.png', { lines: { added: 1, deleted: 0 } }),
    file('conflicted', 'merge.txt', { code: 'U' }),
  ])

  expect(folder?.rows[0]?.lines).toBe('binary')
  expect(folder?.rows[1]?.lines).toBeUndefined()
})
