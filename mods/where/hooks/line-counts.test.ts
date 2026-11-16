import { expect, test } from 'claude-code/testing'

import type { ChangedFile, FileLines } from '../types'
import { countLines, mergeLines, sumLines, withLineCounts } from './line-counts'

const NONE = new Map<string, FileLines>()

test('an empty file has no lines', () => {
  expect(countLines('')).toBe(0)
})

test('lines are counted with or without a newline at the end', () => {
  expect(countLines('a\n')).toBe(1)
  expect(countLines('a\nb\n')).toBe(2)
  expect(countLines('a\nb')).toBe(2)
  expect(countLines('\n')).toBe(1)
})

test('Windows line endings count once each', () => {
  expect(countLines('a\r\nb\r\n')).toBe(2)
})

test('each row takes the counts of its own side', () => {
  const files: ChangedFile[] = [
    { group: 'staged', code: 'M', path: 'a.txt' },
    { group: 'changed', code: 'M', path: 'a.txt' },
    { group: 'untracked', code: '?', path: 'new.txt' },
  ]

  const counted = withLineCounts(files, {
    staged: new Map([['a.txt', { added: 3, deleted: 1 }]]),
    notStaged: new Map([['a.txt', { added: 2, deleted: 0 }]]),
    newFiles: new Map([['new.txt', { added: 7, deleted: 0 }]]),
  })

  expect(counted.map(file => file.lines)).toEqual([
    { added: 3, deleted: 1 },
    { added: 2, deleted: 0 },
    { added: 7, deleted: 0 },
  ])
})

test('a conflict, or a path no side counted, stays uncounted', () => {
  const files: ChangedFile[] = [
    { group: 'conflicted', code: 'U', path: 'a.txt' },
    { group: 'changed', code: 'M', path: 'b.txt' },
  ]

  const counted = withLineCounts(files, {
    staged: NONE,
    notStaged: new Map([['a.txt', { added: 1, deleted: 1 }]]),
    newFiles: NONE,
  })

  expect(counted).toEqual(files)
})

test('totals add up counted rows and skip binary and uncounted ones', () => {
  const rows = [
    { lines: { added: 24, deleted: 6 } },
    { lines: 'binary' as const },
    {},
    { lines: { added: 3, deleted: 41 } },
  ]

  expect(sumLines(rows)).toEqual({ added: 27, deleted: 47 })
  expect(sumLines([])).toEqual({ added: 0, deleted: 0 })
})

test('two sides of one file merge, binary winning and a missing side adding nothing', () => {
  expect(mergeLines({ added: 1, deleted: 2 }, { added: 3, deleted: 4 })).toEqual({
    added: 4,
    deleted: 6,
  })
  expect(mergeLines(undefined, { added: 1, deleted: 0 })).toEqual({ added: 1, deleted: 0 })
  expect(mergeLines({ added: 1, deleted: 0 }, 'binary')).toBe('binary')
  expect(mergeLines(undefined, undefined)).toBeUndefined()
})
