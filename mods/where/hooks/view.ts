import type { ChangedFile, FileGroup, GitBranch } from '../types'

const SHORT_OID_LENGTH = 7

/** The order the panel lists the groups in: what blocks you first. */
export const GROUP_ORDER: readonly FileGroup[] = ['conflicted', 'staged', 'changed', 'untracked']

export const GROUP_LABEL: Readonly<Record<FileGroup, string>> = {
  conflicted: 'Conflicts',
  staged: 'Staged',
  changed: 'Changed',
  untracked: 'Untracked',
}

/** Shows a path under the home folder as `~/…`; any other path as it is. */
export function tildify(path: string, home: string | undefined): string {
  if (home === undefined || home === '') return path

  const slashedPath = path.replace(/\\/g, '/')
  const slashedHome = home.replace(/\\/g, '/').replace(/\/$/, '')

  if (slashedPath === slashedHome) return '~'

  return slashedPath.startsWith(`${slashedHome}/`) ? `~${slashedPath.slice(slashedHome.length)}` : path
}

/** The branch's name, or the commit a detached HEAD sits on. */
export function branchLabel(branch: GitBranch): string {
  if (branch.head !== null) return branch.head

  return branch.oid === null ? 'detached' : `detached at ${branch.oid.slice(0, SHORT_OID_LENGTH)}`
}

/** How far the branch is from the branch it tracks, never from main. */
export function trackingLabel(branch: GitBranch): string {
  if (branch.upstream === null) return 'no upstream'

  const ahead = branch.ahead > 0 ? [`↑${branch.ahead}`] : []
  const behind = branch.behind > 0 ? [`↓${branch.behind}`] : []
  const apart = [...ahead, ...behind].join(' ')

  return `${apart === '' ? 'in sync' : apart} · ${branch.upstream}`
}

/** `2 staged · 1 untracked`, or `clean`. */
export function summary(files: readonly ChangedFile[]): string {
  const parts = GROUP_ORDER.map(group => ({
    group,
    count: files.filter(file => file.group === group).length,
  }))
    .filter(({ count }) => count > 0)
    .map(({ group, count }) => `${count} ${group}`)

  return parts.length === 0 ? 'clean' : parts.join(' · ')
}

/** The files in the panel's group order, git's path order kept within a group. */
export function inPanelOrder(files: readonly ChangedFile[]): ChangedFile[] {
  return GROUP_ORDER.flatMap(group => files.filter(file => file.group === group))
}

export function fileLabel(file: ChangedFile): string {
  return file.from === undefined ? file.path : `${file.from} → ${file.path}`
}
