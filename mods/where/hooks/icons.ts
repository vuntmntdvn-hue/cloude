// Pictures for the surfaces that draw Svg (desktop, mobile, VS Code). An Svg is
// drawn as an image and cannot take the text's color, so it uses a mid grey, a
// green and a red that read on light and dark themes alike.
const GREY = '#8a8a8a'
const GREEN = '#2ea043'
const RED = '#e5484d'

// The lines bar in drawing units: wide and thin, so the surface scales it to
// the panel's width at a few pixels tall.
const BAR_WIDTH = 1000
const BAR_HEIGHT = 12

/** A rounded bar split green and red by the share of lines added and removed. */
export function ratioBar(added: number, deleted: number): string {
  const total = added + deleted
  const green = total === 0 ? 0 : Math.round((added / total) * BAR_WIDTH)

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BAR_WIDTH} ${BAR_HEIGHT}" width="${BAR_WIDTH}" height="${BAR_HEIGHT}">` +
    `<clipPath id="bar"><rect width="${BAR_WIDTH}" height="${BAR_HEIGHT}" rx="${BAR_HEIGHT / 2}"/></clipPath>` +
    `<g clip-path="url(#bar)"><rect width="${green}" height="${BAR_HEIGHT}" fill="${GREEN}"/>` +
    `<rect x="${green}" width="${BAR_WIDTH - green}" height="${BAR_HEIGHT}" fill="${RED}"/></g></svg>`
  )
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
