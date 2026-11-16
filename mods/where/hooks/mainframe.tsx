import type { Elements, JsonValue, RenderSurface } from 'claude-code'

import { buildFrame } from './frame'
import { drawLines } from './lines-view'
import type { PanelData } from './panel-data'

type Ui = Elements[RenderSurface]

/**
 * The Mainframe look: the console module where the surface runs one (the desktop app
 * and the terminal), animated on the surface's clock; elsewhere (VS Code,
 * mobile) the same frame, still.
 */
export function drawMainframe(ui: Ui, data: PanelData, columns: number) {
  if ('Client' in ui) {
    const { Client } = ui

    return <Client key="console" module="./console.tsx" props={data as unknown as JsonValue} width="100%" />
  }

  return drawLines(ui, buildFrame(data, 0, columns, Date.now()))
}
