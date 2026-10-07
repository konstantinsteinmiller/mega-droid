// The canvas's pixel ratio (#121): 1 or 2, never anything between and never
// below 1. A weak device gets 1; a screen of 1.5× and up gets 2.

import { describe, expect, it } from 'vitest'
import { pixelRatioFor } from '@/game/engine/renderer'

describe('the pixel ratio', () => {
  it('is 1 or 2 for every screen', () => {
    for (const d of [0.5, 1, 1.25, 1.5, 1.75, 2, 2.625, 3, 4]) {
      for (const weak of [false, true]) expect([1, 2]).toContain(pixelRatioFor(d, weak))
    }
  })
  it('2 from 1.5× up, 1 below; a weak device 1', () => {
    expect(pixelRatioFor(1, false)).toBe(1)
    expect(pixelRatioFor(1.25, false)).toBe(1)
    expect(pixelRatioFor(1.5, false)).toBe(2)
    expect(pixelRatioFor(3, false)).toBe(2)
    expect(pixelRatioFor(3, true)).toBe(1)
  })
})
