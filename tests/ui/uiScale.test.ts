// The menus' scale on small screens (src/use/useUiScale.ts): an old phone sees
// the whole Lab and every modal, drawn smaller, instead of a clipped layout.
import { describe, expect, it } from 'vitest'
import { UI_MIN, uiScaleFor } from '@/use/useUiScale'

describe('UI scale for small screens', () => {
  it('leaves a phone of today and anything bigger at 1', () => {
    for (const [w, h] of [[844, 390], [915, 412], [1280, 720], [390, 844], [412, 915], [1920, 1080]]) expect(uiScaleFor(w, h), `${w}x${h}`).toBe(1)
  })

  it('draws the menus smaller on an old or small phone, by its short side', () => {
    expect(uiScaleFor(568, 320)).toBeCloseTo(0.821, 2)// iPhone SE (1st gen) on its side
    expect(uiScaleFor(640, 360)).toBeCloseTo(0.923, 2)
    expect(uiScaleFor(320, 568)).toBeCloseTo(0.853) // the same phone upright: its width
  })

  it('never shrinks text below readable', () => {
    expect(uiScaleFor(480, 240)).toBe(UI_MIN)
    expect(uiScaleFor(240, 400)).toBe(UI_MIN)
  })
})
