import type { BoxProps, ElementConstructor, TextProps } from 'claude-code'

import type { FrameLine } from './frame'

// Spaces in the frame are drawn as no-break spaces, so a surface that folds
// runs of spaces still keeps the columns lined up.
const NO_BREAK_SPACE = ' '

export type LineElements = {
  Box: ElementConstructor<BoxProps>
  Text: ElementConstructor<TextProps>
}

/** Draws frame lines in the monospaced face, one Text per line, a nested Text per styled run. */
export function drawLines({ Box, Text }: LineElements, lines: readonly FrameLine[]) {
  return (
    <Box flexDirection="column">
      {lines.map(line => (
        <Text mono wrap="truncate-end">
          {line.map(segment => (
            <Text
              {...(segment.color === undefined ? {} : { color: segment.color })}
              dimColor={segment.isDim === true}
              bold={segment.isBold === true}
              italic={segment.isItalic === true}
              strikethrough={segment.isStruck === true}
            >
              {segment.text.replace(/ /g, NO_BREAK_SPACE)}
            </Text>
          ))}
        </Text>
      ))}
    </Box>
  )
}
