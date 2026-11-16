import { expect, test } from 'claude-code/testing'

import { countNewFileLines } from './new-file-lines'
import type { Disk } from './new-file-lines'

// Each test counts under its own root: the module keeps what it counted between
// calls, by absolute path.
type FakeFile = { text: string; mtimeMs?: number; size?: number }

/** A disk of the given files, recording each read. */
function fakeDisk(files: Record<string, FakeFile>): Disk & { reads: string[] } {
  const reads: string[] = []

  return {
    reads,
    stat: async path => {
      const found = files[path]

      if (found === undefined) throw new Error(`ENOENT: ${path}`)

      return { kind: 'file', size: found.size ?? found.text.length, mtimeMs: found.mtimeMs ?? 1 }
    },
    read: async path => {
      reads.push(path)

      return files[path]?.text ?? ''
    },
  }
}

test('a new file is counted whole; a folder git lists whole is left out', async () => {
  const disk = fakeDisk({ '/r1/a.txt': { text: 'one\ntwo\n' } })

  const counts = await countNewFileLines(disk, '/r1', ['a.txt', 'notes/'])

  expect([...counts]).toEqual([['a.txt', { added: 2, deleted: 0 }]])
  expect(disk.reads).toEqual(['/r1/a.txt'])
})

test('a file with a NUL byte is binary', async () => {
  const disk = fakeDisk({ '/r2/logo.png': { text: 'PNG\0\u0001' } })

  const counts = await countNewFileLines(disk, '/r2', ['logo.png'])

  expect(counts.get('logo.png')).toBe('binary')
})

test('a file over 1 MB is left uncounted and unread', async () => {
  const disk = fakeDisk({ '/r3/big.log': { text: 'x', size: 2_000_000 } })

  const counts = await countNewFileLines(disk, '/r3', ['big.log'])

  expect(counts.size).toBe(0)
  expect(disk.reads).toHaveLength(0)
})

test('an unchanged file is read once; a changed one is read again', async () => {
  const files: Record<string, FakeFile> = { '/r4/a.txt': { text: 'one\n', mtimeMs: 1 } }
  const disk = fakeDisk(files)

  await countNewFileLines(disk, '/r4', ['a.txt'])
  await countNewFileLines(disk, '/r4', ['a.txt'])
  expect(disk.reads).toHaveLength(1)

  files['/r4/a.txt'] = { text: 'one\ntwo\n', mtimeMs: 2 }
  const counts = await countNewFileLines(disk, '/r4', ['a.txt'])

  expect(disk.reads).toHaveLength(2)
  expect(counts.get('a.txt')).toEqual({ added: 2, deleted: 0 })
})

test('a file gone since git listed it is left out', async () => {
  const counts = await countNewFileLines(fakeDisk({}), '/r5', ['gone.txt'])

  expect(counts.size).toBe(0)
})

test('something other than a file is left out', async () => {
  const disk: Disk = {
    stat: async () => ({ kind: 'dir', size: 0, mtimeMs: 1 }),
    read: async () => '',
  }

  expect((await countNewFileLines(disk, '/r6', ['link'])).size).toBe(0)
})
