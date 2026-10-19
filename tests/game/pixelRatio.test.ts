// The canvas's pixel ratio is never below the display's own (render-sharpness
// rule): a 3× phone draws 3×, on every device class. Drawing at 2 there gave a
// 780 px buffer for 1170 device px and a soft picture.

import { describe, expect, it } from 'vitest'
import { pixelRatioFor } from '@/game/engine/renderer'

describe('the pixel ratio', () => {
  it('is never below the device ratio, on any tier', () => {
    for (const d of [1, 1.25, 1.5, 1.6, 1.75, 2, 2.625, 3, 3.5, 4]) {
      for (const weak of [false, true]) expect(pixelRatioFor(d, weak)).toBeGreaterThanOrEqual(d)
    }
  })
  it('a 3× phone draws at 3, weak or not', () => {
    expect(pixelRatioFor(3, false)).toBe(3)
    expect(pixelRatioFor(3, true)).toBe(3)
  })
  it('never below 1', () => {
    expect(pixelRatioFor(0.5, false)).toBe(1)
    expect(pixelRatioFor(0, true)).toBe(1)
  })
})
