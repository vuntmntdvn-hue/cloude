import type { Color } from 'claude-code'

import type { OpKind } from '../types'
import type { Tone } from './view'

/** One agent's colors: a theme key for text, and for pictures (which take no theme) a fill and a tint. */
export type LaneStyle = { text: Color; fill: string; tint: string }

// Theme keys follow light and dark mode. Pictures and tints can't take a theme
// key, so they use mid-tone fills and translucent tints that read on both.
export const TONE_COLOR: Readonly<Record<Tone, Color>> = {
  good: 'success',
  attention: 'warning',
  info: 'suggestion',
  danger: 'error',
  quiet: 'subtle',
}

export const TONE_TINT: Readonly<Record<Tone, string>> = {
  good: 'rgba(46, 160, 67, 0.16)',
  attention: 'rgba(212, 167, 44, 0.18)',
  info: 'rgba(56, 132, 255, 0.16)',
  danger: 'rgba(229, 72, 77, 0.16)',
  quiet: 'rgba(128, 128, 128, 0.14)',
}

/** A tone's color for pictures: a mid-tone that reads on light and dark grounds. */
export const TONE_FILL: Readonly<Record<Tone, string>> = {
  good: '#2E9E5B',
  attention: '#C2861A',
  info: '#3D8BDB',
  danger: '#E5484D',
  quiet: '#9A9A9A',
}

// The context bar's colors for what fills the window; a picture takes no theme key.
const FREE_FILL = 'rgba(128, 128, 128, 0.18)'
const BUFFER_FILL = 'rgba(128, 128, 128, 0.42)'
const OTHER_FILL = '#B4B2A9'
// Looked up in order, so `MCP tools` is MCP before it is tools, and
// `System prompt` a prompt before it is system.
const CATEGORY_FILLS: readonly { match: RegExp; fill: string }[] = [
  { match: /message/i, fill: '#7F77DD' },
  { match: /mcp/i, fill: '#378ADD' },
  { match: /prompt/i, fill: '#888780' },
  { match: /tool/i, fill: '#1D9E75' },
  { match: /memory/i, fill: '#BA7517' },
  { match: /skill/i, fill: '#D4537E' },
  { match: /agent/i, fill: '#D85A30' },
  { match: /command/i, fill: '#639922' },
]

/**
 * A context category's color by its kind and, for a used part, its name as
 * /context prints it: messages violet, MCP tools blue, the system prompt
 * slate, other tools teal, memory amber, skills pink, agents coral, slash
 * commands green; any other used part grey. Cosmetic only: nothing else reads
 * a category's name.
 */
export function categoryColor(name: string, kind: 'used' | 'free' | 'buffer'): string {
  if (kind === 'free') return FREE_FILL
  if (kind === 'buffer') return BUFFER_FILL

  return CATEGORY_FILLS.find(({ match }) => match.test(name))?.fill ?? OTHER_FILL
}

// Lanes in order: Claude (the main loop), then each subagent.
const LANE_STYLES: readonly LaneStyle[] = [
  { text: 'claude', fill: '#D97757', tint: 'rgba(217, 119, 87, 0.16)' },
  { text: 'suggestion', fill: '#378ADD', tint: 'rgba(55, 138, 221, 0.16)' },
  { text: 'merged', fill: '#7F77DD', tint: 'rgba(127, 119, 221, 0.18)' },
  { text: 'planMode', fill: '#1D9E75', tint: 'rgba(29, 158, 117, 0.16)' },
  { text: 'autoAccept', fill: '#D4537E', tint: 'rgba(212, 83, 126, 0.16)' },
  { text: 'ide', fill: '#BA7517', tint: 'rgba(186, 117, 23, 0.18)' },
]

export const OP_COLOR: Readonly<Record<OpKind, Color>> = {
  READ: 'success',
  EDIT: 'warning',
  GREP: 'suggestion',
  FIND: 'suggestion',
  RUN: 'merged',
  NET: 'planMode',
  SPAWN: 'claude',
  CALL: 'subtle',
}

export function laneStyle(index: number): LaneStyle {
  return LANE_STYLES[index % LANE_STYLES.length] ?? (LANE_STYLES[0] as LaneStyle)
}
