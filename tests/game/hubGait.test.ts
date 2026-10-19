// @vitest-environment jsdom
// Flux's jog through the walkable lab (#173): a playtest saw him "hopple",
// bumping up and down as he walked. The walk's planted-foot gait vaults the
// hips over the stance leg (lowest at each step's change, highest mid-step);
// at the hub's jog that was ~10 cm, ten times a second. The hub keeps the
// legs but only a quarter of that rise and fall: a level body.

import { describe, expect, it, vi } from 'vitest'

vi.mock('@/game/world/textures', async (orig) => {
  const { Texture } = await import('three')
  return { ...(await orig<object>()), levelAtlas: () => new Texture(), glowTexture: () => new Texture(), ringTexture: () => new Texture() }
})

import { HUB_BOB, HUB_GAIT } from '@/game/sim/hub'
import { heroHipDrop } from '@/game/models/hero'
import { gaitLegs } from '@/game/models/gait'
import { gaitAmp, newMotion } from '@/game/models/motion'

/** The hips' highest and lowest over a whole stride cycle at full jog. */
const range = (bob: number): number => {
  const m = newMotion(7)
  m.walk = 1
  m.fwd = 1
  m.side = 0
  let lo = Infinity
  let hi = -Infinity
  for (let k = 0; k <= 200; k++) {
    m.phase = (k / 200) * Math.PI * 2
    gaitLegs(HUB_GAIT, m, gaitAmp(m.walk))
    const y = -heroHipDrop(HUB_GAIT, bob)
    lo = Math.min(lo, y)
    hi = Math.max(hi, y)
  }
  return hi - lo
}

describe('the hub jog keeps him level', () => {
  it('the hips rise and fall under 3 cm a step (the full vault was ~10 cm)', () => {
    expect(range(1)).toBeGreaterThan(0.08)
    expect(range(HUB_BOB)).toBeLessThan(0.03)
  })
})
