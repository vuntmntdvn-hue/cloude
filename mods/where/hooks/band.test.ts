import { expect, test } from 'claude-code/testing'

import type { Activity, ChangedFile, ContextReading, Where } from '../types'
import { bandData, buildBand } from './band'
import type { BandData } from './band'
import { meterRead, newActivity, responseUsed } from './activity'

const FULL: BandData = {
  folder: 'cloude',
  isWorktree: false,
  branch: { label: 'main', ahead: 0, behind: 0, hasUpstream: true },
  changes: { files: 13, staged: 2, added: 692, deleted: 297 },
  context: { percent: 77, tokens: 772_000, window: 1_000_000 },
  tokens: { input: 199_000, output: 161_000, usd: 46.45 },
}

const text = (data: BandData, width = 200) =>
  buildBand(data, width)
    .map(segment => segment.text)
    .join('')

test('with room, the band shows every part', () => {
  expect(text(FULL)).toBe(
    'cloude ⎇ main ✓ │ 13 files (2 staged) +692 −297 │ ctx ████████░░ 77% 772k/1M │ 199k in · 161k out · $46.45',
  )
})

test('as the width shrinks, the tokens go first, then the context bar', () => {
  expect(text(FULL, 90)).toBe('cloude ⎇ main ✓ │ 13 files (2 staged) +692 −297 │ ctx ████████░░ 77% 772k/1M')
  expect(text(FULL, 65)).toBe('cloude ⎇ main ✓ │ 13 files (2 staged) +692 −297 │ ctx 77% 772k/1M')
})

test('then the staged count and context amount, then the line counts', () => {
  expect(text(FULL, 50)).toBe('cloude ⎇ main ✓ │ 13 files +692 −297 │ ctx 77%')
  expect(text(FULL, 40)).toBe('cloude ⎇ main ✓ │ 13 files │ ctx 77%')
})

test('what is still too wide is cut with an ellipsis', () => {
  expect(text(FULL, 20)).toBe('cloude ⎇ main ✓ │ 1…')
  expect(text(FULL, 20)).toHaveLength(20)
})

test('the branch shows where it stands against its upstream', () => {
  const branch = FULL.branch as NonNullable<BandData['branch']>

  expect(text({ ...FULL, branch: { ...branch, ahead: 2 } }, 40)).toContain('main ↑2 │')
  expect(text({ ...FULL, branch: { ...branch, behind: 1 } }, 40)).toContain('main ↓1 │')
  expect(text({ ...FULL, branch: { ...branch, ahead: 2, behind: 1 } }, 40)).toContain('main ↑2↓1 │')
  expect(text({ ...FULL, branch: { ...branch, hasUpstream: false } }, 40)).toContain('main · │')
})

test('a clean tree says clean; nothing staged leaves the count out', () => {
  expect(text({ ...FULL, changes: { files: 0, staged: 0, added: 0, deleted: 0 }, tokens: null })).toBe(
    'cloude ⎇ main ✓ │ clean │ ctx ████████░░ 77% 772k/1M',
  )
  expect(text({ ...FULL, changes: { files: 1, staged: 0, added: 3, deleted: 0 }, tokens: null }, 40)).toBe(
    'cloude ⎇ main ✓ │ 1 file +3 │ ctx 77%',
  )
})

test('a worktree is marked; outside a repository there is no branch or changes', () => {
  expect(text({ ...FULL, isWorktree: true, context: null, tokens: null, changes: null })).toBe(
    'cloude ⑂ ⎇ main ✓',
  )
  expect(text({ ...FULL, branch: null, changes: null, context: null, tokens: null })).toBe('cloude  no git')
})

test('before any reading the context and tokens are left out', () => {
  expect(text({ ...FULL, context: null, tokens: null })).toBe('cloude ⎇ main ✓ │ 13 files (2 staged) +692 −297')
})

test('the context bar turns amber past half and red past four fifths', () => {
  const colorAt = (percent: number) =>
    buildBand({ ...FULL, context: { percent, tokens: 1, window: 2 } }, 200).find(segment => segment.text.startsWith('█'))
      ?.color

  expect(colorAt(30)).toBe('success')
  expect(colorAt(50)).toBe('warning')
  expect(colorAt(80)).toBe('error')
})

const ROOT = '/Users/me/Dev/cloude'

const where = (files: ChangedFile[]): Where => ({
  cwd: ROOT,
  root: ROOT,
  worktreeOf: null,
  git: { branch: { head: 'main', oid: 'abc', upstream: 'origin/main', ahead: 1, behind: 0 }, files },
  error: null,
})

test('the data counts each changed file once, its staged entries, and all its lines', () => {
  const files: ChangedFile[] = [
    { group: 'staged', code: 'M', path: 'a.ts', lines: { added: 3, deleted: 1 } },
    { group: 'changed', code: 'M', path: 'a.ts', lines: { added: 2, deleted: 0 } },
    { group: 'untracked', code: '?', path: 'b.ts', lines: { added: 5, deleted: 0 } },
    { group: 'changed', code: 'M', path: 'logo.png', lines: 'binary' },
  ]

  expect(bandData(where(files), null, null, '/Users/me').changes).toEqual({
    files: 3,
    staged: 1,
    added: 10,
    deleted: 1,
  })
})

test('the data names the folder, the branch, the context and the tokens', () => {
  let activity: Activity = responseUsed(newActivity(0), {
    agentId: null,
    tokens: { input: 100, output: 20, cacheRead: 5_000, cacheWrite: 300 },
  })

  activity = meterRead(activity, { contextPercent: 46, usd: 1.2 })

  const context: ContextReading = {
    tokens: 92_000,
    window: 200_000,
    percent: 46,
    parts: [],
    measuredAgainst: null,
    compactAt: null,
  }

  expect(bandData({ ...where([]), worktreeOf: '/Users/me/Dev/main' }, activity, context, '/Users/me')).toEqual({
    folder: 'cloude',
    isWorktree: true,
    branch: { label: 'main', ahead: 1, behind: 0, hasUpstream: true },
    changes: { files: 0, staged: 0, added: 0, deleted: 0 },
    context: { percent: 46, tokens: 92_000, window: 200_000 },
    tokens: { input: 400, output: 20, usd: 1.2 },
  })
})

test('outside a repository, or before anything is read, the data says so', () => {
  const outside: Where = { cwd: ROOT, root: null, worktreeOf: null, git: null, error: null }

  expect(bandData(outside, null, null, undefined)).toEqual({
    folder: 'cloude',
    isWorktree: false,
    branch: null,
    changes: null,
    context: null,
    tokens: null,
  })
  expect(bandData(null, null, null, undefined).folder).toBe('…')
})
