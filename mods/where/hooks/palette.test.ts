import { expect, test } from 'claude-code/testing'

import { categoryColor } from './palette'

test('each known category gets its own color', () => {
  expect(categoryColor('Messages', 'used')).toBe('#7F77DD')
  expect(categoryColor('MCP tools', 'used')).toBe('#378ADD')
  expect(categoryColor('System prompt', 'used')).toBe('#888780')
  expect(categoryColor('System tools', 'used')).toBe('#1D9E75')
  expect(categoryColor('Memory files', 'used')).toBe('#BA7517')
  expect(categoryColor('Skills', 'used')).toBe('#D4537E')
  expect(categoryColor('Custom agents', 'used')).toBe('#D85A30')
  expect(categoryColor('Slash commands', 'used')).toBe('#639922')
})

test('MCP tools are MCP before they are tools, the system prompt a prompt before it is system', () => {
  expect(categoryColor('MCP tools', 'used')).not.toBe(categoryColor('System tools', 'used'))
  expect(categoryColor('System prompt', 'used')).not.toBe(categoryColor('System tools', 'used'))
})

test('an unknown used category is grey', () => {
  expect(categoryColor('Something new', 'used')).toBe('#B4B2A9')
})

test('free space and the compaction reserve are greys, whatever their names', () => {
  expect(categoryColor('Free space', 'free')).toBe('rgba(128, 128, 128, 0.18)')
  expect(categoryColor('Autocompact buffer', 'buffer')).toBe('rgba(128, 128, 128, 0.42)')
  expect(categoryColor('Messages', 'free')).toBe('rgba(128, 128, 128, 0.18)')
})
