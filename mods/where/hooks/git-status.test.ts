import { expect, test } from 'claude-code/testing'

import { parseStatus, parseWorktreeOf } from './git-status'

// Records as `git status --porcelain=v2 --branch -z` writes them, captured
// from a real repository.
const OID = '11fa86e42f75ea21b00bdd0c18eca4730a094123'
const MODES = '100644 100644 100644'
const HASHES = 'f2ad6c76f0115a6ba5b00456a849810e7ec0af20 18ebd85217ed7d6247ddcd003017d9f9dd02eb57'
const UNMERGED_HASHES = `${HASHES} 0cfbf08886fca9a91cb753ec8734c84fcbe52c9f`

const porcelain = (...records: string[]): string => `${records.join('\0')}\0`

test('reads the branch, its upstream and how far apart they are', () => {
  const status = parseStatus(
    porcelain(
      `# branch.oid ${OID}`,
      '# branch.head feature/login',
      '# branch.upstream origin/feature/login',
      '# branch.ab +2 -3',
    ),
  )

  expect(status.branch).toEqual({
    head: 'feature/login',
    oid: OID,
    upstream: 'origin/feature/login',
    ahead: 2,
    behind: 3,
  })
  expect(status.files).toHaveLength(0)
})

test('a branch with no upstream has no counts', () => {
  const { branch } = parseStatus(porcelain(`# branch.oid ${OID}`, '# branch.head feature/wt'))

  expect(branch).toEqual({ head: 'feature/wt', oid: OID, upstream: null, ahead: 0, behind: 0 })
})

test('a detached HEAD has no branch name but keeps its commit', () => {
  const { branch } = parseStatus(porcelain(`# branch.oid ${OID}`, '# branch.head (detached)'))

  expect(branch.head).toBeNull()
  expect(branch.oid).toBe(OID)
})

test('a repository before its first commit has no commit', () => {
  const { branch } = parseStatus(porcelain('# branch.oid (initial)', '# branch.head main'))

  expect(branch.oid).toBeNull()
  expect(branch.head).toBe('main')
})

test('a file staged and then changed again is listed in both groups', () => {
  const { files } = parseStatus(porcelain(`1 MM N... ${MODES} ${HASHES} both.txt`))

  expect(files).toEqual([
    { group: 'staged', code: 'M', path: 'both.txt' },
    { group: 'changed', code: 'M', path: 'both.txt' },
  ])
})

test('a file changed but not staged is listed once', () => {
  const { files } = parseStatus(porcelain(`1 .D N... ${MODES} ${HASHES} gone.txt`))

  expect(files).toEqual([{ group: 'changed', code: 'D', path: 'gone.txt' }])
})

test('a rename keeps its old path, and paths keep their spaces', () => {
  const { files } = parseStatus(
    porcelain(`2 R. N... ${MODES} ${HASHES} R100 new name.txt`, 'old name.txt'),
  )

  expect(files).toEqual([
    { group: 'staged', code: 'R', path: 'new name.txt', from: 'old name.txt' },
  ])
})

test('a rename does not swallow the record after its old path', () => {
  const { files } = parseStatus(
    porcelain(`2 R. N... ${MODES} ${HASHES} R100 b.txt`, 'a.txt', '? new file.txt'),
  )

  expect(files).toHaveLength(2)
  expect(files[1]).toEqual({ group: 'untracked', code: '?', path: 'new file.txt' })
})

test('untracked and conflicted files get their own groups', () => {
  const { files } = parseStatus(
    porcelain(`u UU N... ${MODES} 100644 ${UNMERGED_HASHES} f.txt`, '? notes/todo.md'),
  )

  expect(files).toEqual([
    { group: 'conflicted', code: 'U', path: 'f.txt' },
    { group: 'untracked', code: '?', path: 'notes/todo.md' },
  ])
})

test('a clean tree has no files', () => {
  expect(parseStatus(porcelain(`# branch.oid ${OID}`, '# branch.head main')).files).toHaveLength(0)
  expect(parseStatus('').files).toHaveLength(0)
})

test('a linked worktree names its main checkout', () => {
  const stdout = '/Users/me/Dev/app/.claude/worktrees/fix\n/Users/me/Dev/app/.git\n'

  expect(parseWorktreeOf(stdout)).toBe('/Users/me/Dev/app')
})

test('the main checkout is no worktree', () => {
  expect(parseWorktreeOf('/Users/me/Dev/app\n/Users/me/Dev/app/.git\n')).toBeNull()
})

test('a git folder kept elsewhere tells nothing, so it is no worktree', () => {
  expect(parseWorktreeOf('/Users/me/Dev/app\n/Users/me/git-dirs/app\n')).toBeNull()
  expect(parseWorktreeOf('')).toBeNull()
})
