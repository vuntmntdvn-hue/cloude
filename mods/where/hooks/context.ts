import type { ContextPart, ContextReading } from '../types'

/** The part of `$.session.usage()` the context meter reads. */
export type ContextUsage = {
  context: {
    tokens?: number
    window: number
    percent?: number
    breakdown?: {
      categories: readonly {
        name: string
        tokens: number
        color: string
        kind: 'used' | 'free' | 'buffer' | 'deferred'
      }[]
      rawMaxTokens: number
      autoCompactThreshold?: number
    }
  }
}

/** A run of the bar: `cells` squares in one part's color. */
export type BarRun = { cells: number; name: string; color: string; kind: ContextPart['kind'] }

/**
 * The context as the meter shows it. A reading without a breakdown (the free
 * one taken after each response) keeps the parts of the last one that had it.
 */
export function contextReading(usage: ContextUsage, previous: ContextReading | null): ContextReading {
  const { tokens, window, percent, breakdown } = usage.context

  if (breakdown === undefined) {
    return {
      tokens: tokens ?? null,
      window,
      percent: percent ?? null,
      parts: previous?.parts ?? [],
      measuredAgainst: previous?.measuredAgainst ?? null,
      compactAt: previous?.compactAt ?? null,
    }
  }

  return {
    tokens: tokens ?? null,
    window,
    percent: percent ?? null,
    // Tool schemas loaded on demand sit outside the window: the bar leaves them out.
    parts: breakdown.categories.flatMap(({ name, tokens: partTokens, color, kind }) =>
      kind === 'deferred' ? [] : [{ name, tokens: partTokens, color, kind }],
    ),
    measuredAgainst: breakdown.rawMaxTokens,
    compactAt: breakdown.autoCompactThreshold ?? null,
  }
}

/**
 * Splits `cells` squares among the parts by their tokens, in their order. The
 * squares always add up to `cells`, and a used part with any tokens keeps at
 * least one, so a small part never vanishes from the bar.
 */
export function contextBar(parts: readonly ContextPart[], cells: number): BarRun[] {
  const shown = parts.filter(part => part.tokens > 0)
  const total = shown.reduce((sum, part) => sum + part.tokens, 0)

  if (total === 0 || cells <= 0) return []

  const exact = shown.map(part => (part.tokens / total) * cells)
  const counts = exact.map((share, index) =>
    Math.max(shown[index]?.kind === 'used' ? 1 : 0, Math.floor(share)),
  )
  let left = cells - counts.reduce((sum, count) => sum + count, 0)

  // Hand the squares still free to the largest remainders; take any extra back
  // from the largest runs.
  const byRemainder = exact
    .map((share, index) => ({ index, remainder: share - Math.floor(share) }))
    .sort((a, b) => b.remainder - a.remainder)

  for (let i = 0; left > 0; i = (i + 1) % byRemainder.length, left -= 1) {
    const index = byRemainder[i]?.index ?? 0

    counts[index] = (counts[index] ?? 0) + 1
  }

  while (left < 0) {
    const largest = counts.indexOf(Math.max(...counts))

    counts[largest] = (counts[largest] ?? 0) - 1
    left += 1
  }

  return shown
    .map((part, index) => ({ cells: counts[index] ?? 0, name: part.name, color: part.color, kind: part.kind }))
    .filter(run => run.cells > 0)
}

/** The largest used parts, for the legend, and how many more there are. */
export function contextLegend(
  parts: readonly ContextPart[],
  max: number,
): { shown: ContextPart[]; more: number } {
  const used = parts.filter(part => part.kind === 'used' && part.tokens > 0).sort((a, b) => b.tokens - a.tokens)

  return { shown: used.slice(0, max), more: Math.max(0, used.length - max) }
}
