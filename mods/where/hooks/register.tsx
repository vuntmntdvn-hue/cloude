import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Activity, Look } from '../types'
import { asFolds, CONFIRM_MS, compactPress, isArmed, isBusy, OPEN_FOLDS, toggleFold } from './controls'
import type { FoldSection, PanelControls } from './controls'
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
import { contextReading } from './context'
import type { ContextUsage } from './context'
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
// The `$.store` key the folded sections are kept under, across sessions.
const FOLDS_KEY = 'folds'

// Change a tag when its value's fields change: it declines what an earlier
// version stored, which outlives a reload.
const where = atom({ plugin: 'where', key: 'where' } as const, null, { shape: 'where-2' })
const activity = atom({ plugin: 'where', key: 'activity' } as const, null, { shape: 'activity-2' })
const context = atom({ plugin: 'where', key: 'context' } as const, null, { shape: 'context-1' })
const look = atom({ plugin: 'where', key: 'look' } as const, 'auto')
const folds = atom({ plugin: 'where', key: 'folds' } as const, OPEN_FOLDS)
const compactArmedAt = atom({ plugin: 'where', key: 'compactArmedAt' } as const, null)

// The module's own variables start over on a reload; the stored values stay.
let home: string | undefined
let isReading = false
let isQueued = false
let lastRead = ''
// Activity and context changes are written one after another, so none is
// lost to a race.
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

/** Queues a state write; the caller does not wait for it. */
function enqueue($: EngineInterface, write: () => Promise<unknown>): void {
  recording = recording
    .then(async () => {
      await write()
    })
    .catch(failure => $.ui.log(`where: state not written: ${String(failure)}`, { to: 'debug' }))
}

/** Queues an activity change. */
function record($: EngineInterface, change: (current: Activity) => Activity): void {
  enqueue($, () => update($, activity, current => change(current ?? newActivity(Date.now()))))
}

/** Queues a context reading, merged with the last one. */
function recordContext($: EngineInterface, usage: ContextUsage): void {
  enqueue($, () => update($, context, previous => contextReading(usage, previous)))
}

/**
 * After each response: the context fill and the cost, from the free usage
 * call. The breakdown by category is read at turn ends (`readBreakdown`).
 */
async function readMeter($: EngineInterface): Promise<void> {
  try {
    const usage = await $.session.usage()

    record($, current =>
      meterRead(current, {
        contextPercent: usage.context.percent ?? null,
        usd: usage.cost?.usd ?? null,
      }),
    )
    recordContext($, usage)
  } catch (failure) {
    $.ui.log(`where: session usage not read: ${String(failure)}`, { to: 'debug' })
  }
}

/** The context by category, as /context shows it: estimated locally, no API request. */
async function readBreakdown($: EngineInterface): Promise<void> {
  try {
    recordContext($, await $.session.usage({ breakdown: 'summary' }))
  } catch (failure) {
    $.ui.log(`where: context breakdown not read: ${String(failure)}`, { to: 'debug' })
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

/**
 * Compact: a first press arms it for 5 seconds, a second one in that time
 * compacts, as `/compact` does. While Claude works it only says so.
 */
async function pressCompact($: EngineInterface): Promise<void> {
  const [armedAt, ops] = await Promise.all([read($, compactArmedAt), read($, activity)])
  const step = compactPress(armedAt, Date.now(), isBusy(ops))

  switch (step.kind) {
    case 'busy':
      $.ui.toast('Claude is working: compact after this turn')
      return
    case 'arm':
      await update($, compactArmedAt, () => step.armedAt)
      $.clock.after(CONFIRM_MS, () => void disarm($, step.armedAt))
      return
    case 'compact':
      await update($, compactArmedAt, () => null)
      await compactNow($)
  }
}

async function compactNow($: EngineInterface): Promise<void> {
  try {
    const result = await $.session.compact()

    $.ui.toast('skip' in result && typeof result.skip === 'string' ? `Compact skipped: ${result.skip}` : 'Conversation compacted')
  } catch (failure) {
    $.ui.toast(`Compact failed: ${String(failure)}`)
  }
}

/** Takes Compact back to its first step, unless a newer press armed it since. */
async function disarm($: EngineInterface, armedAt: number): Promise<void> {
  await update($, compactArmedAt, current => (current === armedAt ? null : current))
}

/** Folds or unfolds a section, and keeps the choice for the next sessions. */
async function pressFold($: EngineInterface, section: FoldSection): Promise<void> {
  const next = toggleFold(await read($, folds), section)

  await update($, folds, () => next)
  await $.store.set(FOLDS_KEY, next)
}

/** The buttons for one draw: what they show, and the presses, each run in this module. */
function controlsFor($: EngineInterface, armedAt: number | null): PanelControls {
  return {
    isCompactArmed: isArmed(armedAt, Date.now()),
    onCompact: () => void pressCompact($),
    onFold: section => void pressFold($, section),
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)

    home = (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE'))
    record($, current => resetRunning(current, Date.now()))

    const kept = asLook(await $.store.get(LOOK_KEY))
    const keptFolds = asFolds(await $.store.get(FOLDS_KEY))

    if (kept !== null) await update($, look, () => kept)
    await update($, folds, () => keptFolds)
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
    void readBreakdown($)

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
    if (e.agentId === undefined) {
      record($, turnEnded)
      void readBreakdown($)
    }

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
    const [now, ops, filled, chosen, folded, armedAt] = await Promise.all([
      read($, where),
      read($, activity),
      read($, context),
      read($, look),
      read($, folds),
      read($, compactArmedAt),
    ])
    const ui = $.ui.resolve(e)
    const data = panelData(now, ops, filled, folded, home, MAX_TREE_ROWS)
    // Each surface asks for its own drawing: under `auto` the terminal gets
    // the Mainframe console and every other surface the desktop look.
    const isMainframe = chosen === 'mainframe' || (chosen === 'auto' && e.surface === 'terminal')
    const controls = controlsFor($, armedAt)

    return isMainframe
      ? drawMainframe(ui, data, e.props.bodyColumns, controls)
      : drawNativePanel(ui, data, Date.now(), controls)
  })
}
