import type { ClientModule, JsonValue } from 'claude-code'

import { buildFrame } from './frame'
import { drawLines } from './lines-view'
import type { PanelData } from './panel-data'

// About 8 frames a second: enough for the spinners and bars to move smoothly.
const FRAME_MS = 125
// The region reads 0 cells wide until it is first laid out.
const DEFAULT_COLUMNS = 48

type ConsoleState = { frame: number }

/**
 * The panel's surface module: it redraws the frame on the surface's own clock,
 * so spinners, bars and the cursor move with no work in the engine. New data
 * arrives as props whenever the hooks module redraws.
 */
const Console: ClientModule<JsonValue, ConsoleState> = (props, surface) => {
  if (surface.state === undefined) {
    let frame = 0

    surface.every(FRAME_MS, () => {
      frame += 1
      surface.setState({ frame })
    })
    surface.setState({ frame })
  }

  const data = props as unknown as PanelData
  const columns = surface.columns > 0 ? surface.columns : DEFAULT_COLUMNS

  return drawLines(surface.elements, buildFrame(data, surface.state?.frame ?? 0, columns, Date.now()))
}

export default Console
