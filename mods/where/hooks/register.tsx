import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Activity, Look } from '../types'
import {
  callEnded,
  callStarted,
  meterRead,
  newActivity,
  resetRunning,
  responseUsed,
  turnEnded,
  turnStarted,
} from './activity'
import type { CallEnd, CallStart } from './activity'
import { drawMainframe } from './mainframe'
import { drawNativePanel } from './native-panel'
import { panelData } from './panel-data'
import { readWhere } from './read-where'

const PANE = 'where'
const TITLE = 'Where'
const COMMAND = 'where'
const REFRESH_MS = 5_000
// The most file rows the panel lists before a `+N more` line.
const MAX_TREE_ROWS = 14
// The `$.store` key the chosen look is kept under, across sessions.
const LOOK_KEY = 'look'
const LOOKS: readonly Look[] = ['auto', 'desktop', 'mainframe']
const LOOK_USAGE = 'Usage: /where look auto|desktop|mainframe'

// Change a tag when its value's fields change: it declines what an earlier
// version stored, which outlives a reload.
const where = atom({ plugin: 'where', key: 'where' } as const, null, { shape: 'where-2' })
const activity = atom({ plugin: 'where', key: 'activity' } as const, null, { shape: 'activity-2' })
const look = atom({ plugin: 'where', key: 'look' } as const, 'auto')

// The module's own variables start over on a reload; the stored values stay.
let home: string | undefined
let isReading = false
let isQueued = false
let lastRead = ''
// Activity changes are written one after another, so none is lost to a race.
let recording: Promise<void> = Promise.resolve()

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

/** Queues an activity change; the caller does not wait for it. */
function record($: EngineInterface, change: (current: Activity) => Activity): void {
  recording = recording
    .then(async () => {
      await update($, activity, current => change(current ?? newActivity(Date.now())))
    })
    .catch(failure => $.ui.log(`where: activity not recorded: ${String(failure)}`, { to: 'debug' }))
}

/** Reads the session's context fill and cost (a free call) into the activity. */
async function readMeter($: EngineInterface): Promise<void> {
  try {
    const usage = await $.session.usage()

    record($, current =>
      meterRead(current, {
        contextPercent: usage.context.percent ?? null,
        usd: usage.cost?.usd ?? null,
      }),
    )
  } catch (failure) {
    $.ui.log(`where: session usage not read: ${String(failure)}`, { to: 'debug' })
  }
}

function asLook(value: unknown): Look | null {
  return LOOKS.find(one => one === value) ?? null
}

/** `/where look <name>`: keeps the look for this session and the next ones. */
async function chooseLook($: EngineInterface, name: string | undefined): Promise<string> {
  const chosen = asLook(name)

  if (chosen === null) return LOOK_USAGE

  await update($, look, () => chosen)
  await $.store.set(LOOK_KEY, chosen)

  return `Where look: ${chosen}.`
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)

    home = (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE'))
    record($, current => resetRunning(current, Date.now()))

    const kept = asLook(await $.store.get(LOOK_KEY))

    if (kept !== null) await update($, look, () => kept)
    await $.command.register({
      name: COMMAND,
      description: 'Show the session folder, its git status and what Claude is doing',
      argumentHint: '[look auto|desktop|mainframe]',
    })
    // A widget is the panel's small form on the desktop app, which you can drag
    // into a corner; other surfaces open it as a normal pane.
    void $.ui.open({ id: PANE, title: TITLE, placement: 'widget' })
    $.clock.every(REFRESH_MS, () => void refresh($))
    void refresh($)

    return started
  })

  on('command.run', { command: COMMAND }, async ($, e) => {
    const [verb, name] = e.args.trim().split(/\s+/)

    if (verb === 'look') return { text: await chooseLook($, name) }
    if (verb !== undefined && verb !== '') return { text: LOOK_USAGE }

    await $.ui.open({ id: PANE, title: TITLE, placement: 'widget' })
    void refresh($)

    return { text: 'Where panel opened.' }
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) record($, current => turnStarted(current, Date.now()))

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) record($, turnEnded)

    return next(e)
  })

  // Each model response, main loop's or a subagent's: every piece is passed on
  // unchanged by `yield*`; only once the response is whole are its tokens
  // queued and the meter read, neither awaited.
  on('turn.step', async function* ($, e, next) {
    const response = yield* next(e)
    const usage = response.usage

    if (usage !== null) {
      const tokens = {
        input: usage.input_tokens,
        output: usage.output_tokens,
        cacheRead: usage.cache_read_input_tokens,
        cacheWrite: usage.cache_creation_input_tokens,
      }

      record($, current => responseUsed(current, { agentId: e.agentId ?? null, tokens }))
    }
    void readMeter($)

    return response
  })

  on('tool.call', async ($, e, next) => {
    const start: CallStart = {
      callId: e.tool_use_id,
      agentId: e.agentId ?? null,
      tool: e.tool,
      input: e as unknown as Readonly<Record<string, unknown>>,
      now: Date.now(),
    }
    const finish = (result: CallEnd['result']) =>
      record($, current => callEnded(current, { ...start, now: Date.now(), result }))

    record($, current => callStarted(current, start))

    try {
      const ran = await next(e)

      finish(ran.deny !== undefined ? 'denied' : ran.isError === true ? 'failed' : 'ok')

      // A subagent's hook reads that subagent's own folder, so only the
      // session's own calls refresh at once; the timer picks up the rest.
      if (e.agentId === undefined) void refresh($)

      return ran
    } catch (failure) {
      finish('failed')
      throw failure
    }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const [now, ops, chosen] = await Promise.all([read($, where), read($, activity), read($, look)])
    const ui = $.ui.resolve(e)
    const data = panelData(now, ops, home, MAX_TREE_ROWS)
    // Each surface asks for its own drawing: under `auto` the terminal gets
    // the Mainframe console and every other surface the desktop look.
    const isMainframe = chosen === 'mainframe' || (chosen === 'auto' && e.surface === 'terminal')

    return isMainframe
      ? drawMainframe(ui, data, e.props.bodyColumns)
      : drawNativePanel(ui, data, Date.now())
  })
}
