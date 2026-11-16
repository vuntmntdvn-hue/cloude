import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { drawPanel } from './panel'
import { readWhere } from './read-where'

const PANE = 'where'
const TITLE = 'Where'
const COMMAND = 'where'
const REFRESH_MS = 5_000
// The most file rows the docked panel draws before a `+N more` line.
const MAX_FILE_ROWS = 200
// The rows a widget keeps for the header, the count tiles, the lines bar and a folder heading.
const WIDGET_HEADER_ROWS = 10

// Change the tag when `Where`'s fields change: it declines what an earlier
// version stored, which outlives a reload.
const where = atom({ plugin: 'where', key: 'where' } as const, null, { shape: 'where-2' })

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
    const ui = $.ui.resolve(e)
    const now = await read($, where)

    if (now === null) {
      return (
        <ui.Text size="caption" dimColor>
          Reading the folder…
        </ui.Text>
      )
    }

    // A widget shows what fits at a glance; the docked panel scrolls.
    const maxFileRows =
      e.props.placement === 'widget'
        ? Math.max(0, e.props.scroll.bodyRows - WIDGET_HEADER_ROWS)
        : MAX_FILE_ROWS

    return drawPanel(ui, now, { home, maxFileRows })
  })
}
