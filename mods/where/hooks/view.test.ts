import { expect, test } from 'claude-code/testing'

import type { ChangedFile, GitBranch } from '../types'
import {
  branchLabel,
  fileLabel,
  inPanelOrder,
  summary,
  tildify,
  trackingLabel,
} from './view'

const OID = '11fa86e42f75ea21b00bdd0c18eca4730a094123'
const BRANCH: GitBranch = { head: 'main', oid: OID, upstream: null, ahead: 0, behind: 0 }

const file = (group: ChangedFile['group'], path: string): ChangedFile => ({
  group,
  code: group === 'untracked' ? '?' : 'M',
  path,
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

test('a branch shows its name', () => {
  expect(branchLabel(BRANCH)).toBe('main')
})

test('a detached HEAD shows its short commit', () => {
  expect(branchLabel({ ...BRANCH, head: null })).toBe('detached at 11fa86e')
  expect(branchLabel({ ...BRANCH, head: null, oid: null })).toBe('detached')
})

test('the tracking line compares with the upstream, not main', () => {
  const tracked = { ...BRANCH, head: 'feature/x', upstream: 'origin/feature/x' }

  expect(trackingLabel(tracked)).toBe('in sync · origin/feature/x')
  expect(trackingLabel({ ...tracked, ahead: 2 })).toBe('↑2 · origin/feature/x')
  expect(trackingLabel({ ...tracked, behind: 1 })).toBe('↓1 · origin/feature/x')
  expect(trackingLabel({ ...tracked, ahead: 2, behind: 1 })).toBe('↑2 ↓1 · origin/feature/x')
})

test('a branch with no upstream says so', () => {
  expect(trackingLabel(BRANCH)).toBe('no upstream')
})

test('the summary counts each group in panel order, or says clean', () => {
  const files = [
    file('untracked', 'c.txt'),
    file('staged', 'a.txt'),
    file('staged', 'b.txt'),
    file('conflicted', 'd.txt'),
  ]

  expect(summary(files)).toBe('1 conflicted · 2 staged · 1 untracked')
  expect(summary([])).toBe('clean')
})

test('files are ordered by group, keeping git order within one', () => {
  const files = [
    file('untracked', 'u.txt'),
    file('changed', 'z.txt'),
    file('staged', 's.txt'),
    file('changed', 'a.txt'),
    file('conflicted', 'c.txt'),
  ]

  expect(inPanelOrder(files).map(one => one.path)).toEqual([
    'c.txt',
    's.txt',
    'z.txt',
    'a.txt',
    'u.txt',
  ])
})

test('a rename shows where it came from', () => {
  expect(fileLabel({ group: 'staged', code: 'R', path: 'new.txt', from: 'old.txt' })).toBe(
    'old.txt → new.txt',
  )
  expect(fileLabel(file('changed', 'a.txt'))).toBe('a.txt')
})
