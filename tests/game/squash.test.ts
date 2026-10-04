// A press or a rolling barrel flattens Flux like a cartoon (#116): flat in a
// blink, a beat flat, then he springs back up past his size and settles.
import { describe, expect, it } from 'vitest'
import { squashSpring, squashY } from '@/game/sim/squash'

describe('the cartoon squash', () => {
  it('flattens him in under a tenth of a second and holds him flat', () => {
    expect(squashY(0)).toBe(1)
    expect(squashY(0.08)).toBeCloseTo(0.22, 2)
    expect(squashY(0.5)).toBeCloseTo(0.22, 2)
  })
  it('springs back past his full size, then settles at it', () => {
    const peak = Math.max(...Array.from({ length: 50 }, (_, n) => squashSpring(n / 49)))
    expect(peak).toBeGreaterThan(1.1)
    expect(peak).toBeLessThan(1.35)
    expect(squashY(1.25)).toBeCloseTo(1, 1)
    expect(squashSpring(0)).toBe(0)
  })
})
