import { atom, read, update } from 'claude-code'
import type { Color, EngineInterface, Register } from 'claude-code'

import type { ChangedFile, FileGroup } from '../types'
import { readWhere } from './read-where'
import {
  branchLabel,
  fileLabel,
  GROUP_LABEL,
  GROUP_ORDER,
  inPanelOrder,
  summary,
  tildify,
  trackingLabel,
} from './view'

const PANE = 'where'
const TITLE = 'Where'
const COMMAND = 'where'
const REFRESH_MS = 5_000
// The most file rows the expanded panel draws before a `+N more` line.
const MAX_FILE_ROWS = 200
// The rows a widget keeps for the folder, worktree, branch and summary lines.
const WIDGET_HEADER_ROWS = 4

const GROUP_COLOR: Readonly<Record<FileGroup, Color>> = {
  conflicted: 'error',
  staged: 'success',
  changed: 'warning',
  untracked: 'subtle',
}

// Change the tag when `Where`'s fields change: it declines what an earlier
// version stored, which outlives a reload.
const where = atom({ plugin: 'where', key: 'where' } as const, null, { shape: 'where-1' })

// The module's own variables start over on a reload; the stored read stays.
let home: string | undefined
let isReading = false
let isQueued = false
let lastRead = ''

/** One read at a time: calls that come during a read fold into one more read. */
async function refresh($: EngineInterface): Promise<void> {
  if (isReading) {
    isQueued = true
    return
  }

  isReading = true

  try {
    const now = await readWhere($)
    const serialized = JSON.stringify(now)

    // An unchanged read writes nothing, so the panel redraws only on a change.
    if (serialized !== lastRead) {
      lastRead = serialized
      await update($, where, () => now)
    }
  } catch (failure) {
    $.ui.log(`where: refresh failed: ${String(failure)}`, { to: 'debug' })
  } finally {
    isReading = false
  }

  if (isQueued) {
    isQueued = false
    void refresh($)
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)

    home = (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE'))
    await $.command.register({
      name: COMMAND,
      description: 'Show the session folder and its git status',
    })
    // A widget is the panel's small form on the desktop app, which you can drag
    // into a corner; other surfaces open it as a normal pane.
    void $.ui.open({ id: PANE, title: TITLE, placement: 'widget' })
    $.clock.every(REFRESH_MS, () => void refresh($))
    void refresh($)

    return started
  })

  on('command.run', { command: COMMAND }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE, placement: 'widget' })
    void refresh($)

    return { text: 'Where panel opened.' }
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)

    // A subagent's hook reads that subagent's own folder, so only the session's
    // own calls refresh at once; the timer picks up the rest.
    if (e.agentId === undefined) void refresh($)

    return ran
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const now = await read($, where)

    if (now === null) return <Text dimColor>Reading the folder…</Text>

    const isWidget = e.props.placement === 'widget'
    const files = now.git === null ? [] : inPanelOrder(now.git.files)
    const room = isWidget
      ? Math.max(0, e.props.scroll.bodyRows - WIDGET_HEADER_ROWS - 1)
      : MAX_FILE_ROWS
    const shown = files.slice(0, room)
    const hidden = files.length - shown.length

    const fileRow = (file: ChangedFile) => (
      <Box flexDirection="row" gap={1}>
        <Text color={GROUP_COLOR[file.group]} mono>
          {file.code}
        </Text>
        <Text wrap="truncate-start">{fileLabel(file)}</Text>
      </Box>
    )

    // The widget lists files flat to save rows; its colors still tell the groups.
    const fileRows = isWidget
      ? shown.map(fileRow)
      : GROUP_ORDER.flatMap(group => {
          const inGroup = shown.filter(file => file.group === group)

          return inGroup.length === 0
            ? []
            : [
                <Text color={GROUP_COLOR[group]} bold>
                  {GROUP_LABEL[group]}
                </Text>,
                ...inGroup.map(fileRow),
              ]
        })

    return (
      <Box flexDirection="column">
        <Text bold wrap="truncate-start">
          {tildify(now.cwd, home)}
        </Text>
        {now.worktreeOf !== null && (
          <Text dimColor wrap="truncate-start">
            worktree of {tildify(now.worktreeOf, home)}
          </Text>
        )}
        {now.git === null ? (
          <Text dimColor>not a git repo</Text>
        ) : (
          <Box flexDirection="row" gap={1}>
            <Text color="claude" bold wrap="truncate-end">
              {branchLabel(now.git.branch)}
            </Text>
            <Text dimColor wrap="truncate-end">
              {trackingLabel(now.git.branch)}
            </Text>
          </Box>
        )}
        {now.error !== null && <Text color="error">{now.error}</Text>}
        {now.git !== null && <Text dimColor>{summary(files)}</Text>}
        {fileRows}
        {hidden > 0 && <Text dimColor>+{hidden} more</Text>}
      </Box>
    )
  })
}
