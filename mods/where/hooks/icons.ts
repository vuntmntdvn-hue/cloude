// Pictures for the surfaces that draw Svg (desktop, mobile, VS Code). An Svg is
// drawn as an image and cannot take the text's color, so it uses a mid grey, a
// green and a red that read on light and dark themes alike.
const GREY = '#8a8a8a'
const GREEN = '#2ea043'
const HAIRLINE = 'rgba(128, 128, 128, 0.28)'
const FONT = '-apple-system, Segoe UI, sans-serif'

// A strip in drawing units: wide and thin, so the surface scales it to the
// panel's width at 6 to 8 pixels tall, with a hair of gap between its parts.
const BAR_WIDTH = 1000
const BAR_HEIGHT = 22
const BAR_GAP = 8

/** One part of a strip: its share of the whole and its color. */
export type BarPart = { share: number; fill: string }

/** A rounded strip split into its parts by share; a part with no share is left out. */
export function segmentedBar(parts: readonly BarPart[]): string {
  const shown = parts.filter(part => part.share > 0)
  const total = shown.reduce((sum, part) => sum + part.share, 0)
  const room = BAR_WIDTH - BAR_GAP * Math.max(0, shown.length - 1)
  let x = 0

  const rects = shown.map((part, index) => {
    const width = index === shown.length - 1 ? BAR_WIDTH - x : (room * part.share) / total
    const rect = `<rect x="${x.toFixed(1)}" width="${Math.max(0, width).toFixed(1)}" height="${BAR_HEIGHT}" fill="${part.fill}"/>`

    x += width + BAR_GAP

    return rect
  })

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BAR_WIDTH} ${BAR_HEIGHT}" width="${BAR_WIDTH}" height="${BAR_HEIGHT}">` +
    `<clipPath id="strip"><rect width="${BAR_WIDTH}" height="${BAR_HEIGHT}" rx="${BAR_HEIGHT / 2}"/></clipPath>` +
    `<g clip-path="url(#strip)">${rects.join('')}</g></svg>`
  )
}

/** A full-width line a pixel thick: the rule between parts of a card. */
export const HAIRLINE_RULE =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BAR_WIDTH} 3" width="${BAR_WIDTH}" height="3">` +
  `<rect width="${BAR_WIDTH}" height="3" fill="${HAIRLINE}"/></svg>`

/** A round dot in `fill`: a legend's key. */
export function dot(fill: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="5" fill="${fill}"/></svg>`
}

/** A slim rounded bar in `fill` left of a file row; dashed and hollow for a file only in use. */
export function stateBar(fill: string, isHollow: boolean): string {
  const shape = isHollow
    ? `<rect x="0.75" y="0.75" width="2.5" height="14.5" rx="1.25" fill="none" stroke="${fill}" stroke-width="1" stroke-dasharray="2 2"/>`
    : `<rect width="4" height="16" rx="2" fill="${fill}"/>`

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 16">${shape}</svg>`
}

// A pill's size in pixels: its height, its side padding, an estimate of one
// character's width at 11 pixels, and the room a leading dot takes.
const CHIP_HEIGHT = 18
const CHIP_PADDING = 8
const CHIP_CHAR = 6.4
const CHIP_DOT = 10

/** A rounded pill: `label` in `text` on `ground`, after a breathing dot in `pulse` when given. */
export function chip(
  label: string,
  text: string,
  ground: string,
  pulse?: string,
): { source: string; width: number; height: number } {
  const lead = pulse === undefined ? 0 : CHIP_DOT
  const width = Math.ceil(CHIP_PADDING * 2 + lead + label.length * CHIP_CHAR)
  const breath =
    pulse === undefined
      ? ''
      : `<circle cx="${CHIP_PADDING + 3}" cy="${CHIP_HEIGHT / 2}" r="3" fill="${pulse}">` +
        '<animate attributeName="opacity" values="1;0.3;1" dur="1.4s" repeatCount="indefinite"/></circle>'

  return {
    source:
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${CHIP_HEIGHT}">` +
      `<rect width="${width}" height="${CHIP_HEIGHT}" rx="${CHIP_HEIGHT / 2}" fill="${ground}"/>${breath}` +
      `<text x="${CHIP_PADDING + lead}" y="12.6" font-family="${FONT}" font-size="11" fill="${text}">${escapeXml(label)}</text></svg>`,
    width,
    height: CHIP_HEIGHT,
  }
}

function icon(body: string, stroke: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`
}

export const FOLDER_ICON = icon(
  '<path d="M5 4h4l3 3h7a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-11a2 2 0 0 1 2 -2"/>',
  GREY,
)

export const BRANCH_ICON = icon(
  '<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="7" r="2"/><path d="M6 7v10"/><path d="M18 9c0 4 -4 6 -12 6"/>',
  GREY,
)

export const CHECK_ICON = icon('<circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.5 2.5l5 -5"/>', GREEN)

// An arc turning on a faint ring. Animated in the picture itself (SMIL), so it
// spins with no redraw; drawn as an interactive Svg, where SMIL is sure to run.
export const SPINNER_ICON =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${GREY}" stroke-width="2.5" stroke-linecap="round">` +
  '<circle cx="12" cy="12" r="9" opacity="0.3"/>' +
  '<path d="M12 3a9 9 0 0 1 9 9"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.9s" repeatCount="indefinite"/></path>' +
  '</svg>'

// The ring's radius and stroke, in a 36-unit square.
const RING_RADIUS = 15
const RING_STROKE = 3.5
const RING_TRACK = 'rgba(128, 128, 128, 0.22)'

/** A ring filled to `percent` in `fill`, the percentage written bold in its middle in the same color. */
export function ring(percent: number, fill: string): string {
  const shown = Math.max(0, Math.min(100, percent))
  const circumference = 2 * Math.PI * RING_RADIUS
  const arc = (circumference * shown) / 100

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36">` +
    `<circle cx="18" cy="18" r="${RING_RADIUS}" fill="none" stroke="${RING_TRACK}" stroke-width="${RING_STROKE}"/>` +
    `<circle cx="18" cy="18" r="${RING_RADIUS}" fill="none" stroke="${fill}" stroke-width="${RING_STROKE}" stroke-linecap="round" ` +
    `stroke-dasharray="${arc.toFixed(2)} ${circumference.toFixed(2)}" transform="rotate(-90 18 18)"/>` +
    `<text x="18" y="21.4" text-anchor="middle" font-family="${FONT}" font-size="9.5" font-weight="700" fill="${fill}">${Math.round(shown)}%</text>` +
    '</svg>'
  )
}

/** A round avatar in an agent's fill: Claude's carries a four-point spark, a subagent's its label. */
export function avatar(fill: string, label: string | null): string {
  const mark =
    label === null
      ? '<path d="M12 5l1.6 5.4L19 12l-5.4 1.6L12 19l-1.6-5.4L5 12l5.4-1.6z" fill="#ffffff"/>'
      : `<text x="12" y="16.2" text-anchor="middle" font-family="${FONT}" font-size="12" font-weight="600" fill="#ffffff">${escapeXml(label)}</text>`

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="12" fill="${fill}"/>${mark}</svg>`
}

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
