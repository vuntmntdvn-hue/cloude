import type { FileLines } from '../types'
import { countLines } from './line-counts'

/**
 * The file reads counting needs. The mod hands in `$.fs`; a test hands in a
 * fake, since a test's `$` is the engine's and not the plugin's.
 */
export type Disk = {
  stat: (path: string) => Promise<{ kind: string; size: number; mtimeMs: number }>
  /** The file's text; rejects when it is gone or unreadable. */
  read: (path: string) => Promise<string>
}

// A bigger new file stays uncounted, so a refresh never reads a log or a build output.
const MAX_BYTES = 1_000_000
// At most this many new files are counted in one refresh; the rest stay uncounted.
const MAX_FILES = 200

type Counted = { size: number; mtimeMs: number; lines: FileLines }

// Kept between refreshes, by absolute path, so an unchanged file is read once.
// A reload starts it over.
const counted = new Map<string, Counted>()

/**
 * Counts the lines of new files by their repository path. A folder git lists
 * whole (`notes/`), a file over 1 MB and a file gone since git listed it are
 * left out. A file is read again only when its size or modified time changed.
 */
export async function countNewFileLines(
  disk: Disk,
  root: string,
  paths: readonly string[],
): Promise<Map<string, FileLines>> {
  const files = paths.filter(path => !path.endsWith('/')).slice(0, MAX_FILES)
  const results = await Promise.all(files.map(path => countFile(disk, `${root}/${path}`)))
  const counts = new Map<string, FileLines>()

  files.forEach((path, index) => {
    const lines = results[index]

    if (lines !== undefined) counts.set(path, lines)
  })
  forgetOthers(new Set(files.map(path => `${root}/${path}`)), root)

  return counts
}

async function countFile(disk: Disk, absolutePath: string): Promise<FileLines | undefined> {
  try {
    const stat = await disk.stat(absolutePath)

    if (stat.kind !== 'file' || stat.size > MAX_BYTES) return undefined

    const known = counted.get(absolutePath)

    if (known !== undefined && known.size === stat.size && known.mtimeMs === stat.mtimeMs) {
      return known.lines
    }

    const text = await disk.read(absolutePath)
    const lines: FileLines = text.includes('\0') ? 'binary' : { added: countLines(text), deleted: 0 }

    counted.set(absolutePath, { size: stat.size, mtimeMs: stat.mtimeMs, lines })

    return lines
  } catch {
    // Gone or unreadable since git listed it: left uncounted.
    return undefined
  }
}

/** Drops what was counted under this root and is no longer a new file. */
function forgetOthers(current: ReadonlySet<string>, root: string): void {
  for (const absolutePath of counted.keys()) {
    if (absolutePath.startsWith(`${root}/`) && !current.has(absolutePath)) {
      counted.delete(absolutePath)
    }
  }
}
