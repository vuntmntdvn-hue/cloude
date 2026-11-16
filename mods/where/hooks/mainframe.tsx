import type { Elements, JsonValue, RenderSurface } from 'claude-code'

import type { PanelControls } from './controls'
import { buildFrame } from './frame'
import { drawLines } from './lines-view'
import type { PanelData } from './panel-data'

type Ui = Elements[RenderSurface]

/**
 * The Mainframe look: the console module where the surface runs one (the desktop app
 * and the terminal), animated on the surface's clock; elsewhere (VS Code,
 * mobile) the same frame, still. The buttons sit under it, drawn here, so a
 * press runs in the hooks module whichever surface draws the console.
 */
export function drawMainframe(ui: Ui, data: PanelData, columns: number, controls: PanelControls) {
  const { Box } = ui

  return (
    <Box flexDirection="column" gap="xs">
      {'Client' in ui ? (
        <ui.Client key="console" module="./console.tsx" props={data as unknown as JsonValue} width="100%" />
      ) : (
        drawLines(ui, buildFrame(data, 0, columns, Date.now()))
      )}
      {buttonRow(ui, data, controls)}
    </Box>
  )
}

/** `[ Compact ] [ Hide files ] [ Hide activity ]`, each with its key. */
function buttonRow(ui: Ui, data: PanelData, controls: PanelControls) {
  const { Box, Button } = ui
  const { files, activity } = data.folds

  return (
    <Box flexDirection="row" flexWrap="wrap" gap="xs">
      <Button
        key="compact"
        label={controls.isCompactArmed ? 'Confirm compact' : 'Compact'}
        variant={controls.isCompactArmed ? 'primary' : 'secondary'}
        hotkey="c"
        onPress={controls.onCompact}
      />
      <Button key="fold-files" label={files ? 'Show files' : 'Hide files'} hotkey="f" onPress={() => controls.onFold('files')} />
      <Button
        key="fold-activity"
        label={activity ? 'Show activity' : 'Hide activity'}
        hotkey="a"
        onPress={() => controls.onFold('activity')}
      />
    </Box>
  )
}
