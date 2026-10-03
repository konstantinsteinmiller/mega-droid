// @vitest-environment jsdom
// Hazards and feel (#279, #280): a rolling barrel flattens Flux like a
// cartoon for FLAT_FOR — the eye slaps down to the floor and springs back
// with an overshoot, a boing, no shake — and a crumbling slab rattles as he
// comes near, then shakes a full second before it drops.

import { describe, expect, it, vi } from 'vitest'

vi.mock('@/game/audio/sfx', () => ({ sfx: () => {} }))
vi.mock('@/use/useAds', () => ({ showMidgameAd: async () => {} }))
vi.mock('@/use/useAdGate', () => ({ canShowInterstitial: () => false, markInterstitialShown: () => {} }))
vi.mock('@/use/useCrazyGames', () => ({ triggerHappytime: () => {} }))
vi.mock('@/game/engine/app', () => ({ app: { setMode: () => {}, setWanted: () => {} } }))

import { FLAT_FOR, flatEye } from '@/game/sim/mission'
import { EYE_H } from '@/game/sim/constants'
import { barkFor } from '@/game/audio/barks'
import { CR_SHAKE, CR_RATTLE_R, rattles } from '@/game/sim/stages/crumble'
import { lavaCell, lavaMaterial, tickLava } from '@/game/models/lava'

describe('flattened by a barrel', () => {
  it('lasts a second: the eye drops to the floor at once and stays down', () => {
    expect(FLAT_FOR).toBe(1)
    expect(flatEye(FLAT_FOR)).toBeCloseTo(EYE_H, 5)
    expect(flatEye(FLAT_FOR - 0.1)).toBeLessThan(0.6)
    expect(flatEye(0.5)).toBeLessThan(0.6)
  })

  it('springs back up with an overshoot (the boing) and ends at eye height', () => {
    let peak = 0
    for (let left = 0.3; left >= 0; left -= 0.01) peak = Math.max(peak, flatEye(left))
    expect(peak).toBeGreaterThan(EYE_H)
    expect(flatEye(0)).toBeCloseTo(EYE_H, 5)
  })

  it('yelps like a crush', () => {
    expect(barkFor({ hazard: 'barrel' })).toBe(barkFor({ hazard: 'crush' }))
  })
})

describe('crumbling slabs', () => {
  it('shake a full second before they drop', () => {
    expect(CR_SHAKE).toBeGreaterThanOrEqual(1)
  })

  it('rattle while Flux is near and about level, not from across the room or a storey off', () => {
    expect(rattles(0, 0, 4, { x: CR_RATTLE_R - 0.5, y: 4, z: 0 })).toBe(true)
    expect(rattles(0, 0, 4, { x: CR_RATTLE_R + 0.5, y: 4, z: 0 })).toBe(false)
    expect(rattles(0, 0, 4, { x: 1, y: 10, z: 0 })).toBe(false)
  })
})

describe('lava', () => {
  it('is one shared material whose texture flows and whose glow breathes', () => {
    const m = lavaMaterial()
    expect(lavaMaterial()).toBe(m)
    tickLava(0)
    const a = m.map!.offset.clone()
    const b0 = m.color.r
    tickLava(3)
    expect(m.map!.offset.equals(a)).toBe(false)
    expect(m.color.r).not.toBe(b0)
  })

  it('a cell is a flat plane over the pit, its UVs in world space so the flow runs on unbroken', () => {
    const g = lavaCell(30, 60, 3, -7.64)
    const pos = g.attributes.position!
    const uv = g.attributes.uv!
    for (let k = 0; k < pos.count; k++) {
      expect(pos.getY(k)).toBeCloseTo(-7.64, 5)
      expect(uv.getX(k) / pos.getX(k)).toBeCloseTo(uv.getX(0) / pos.getX(0), 5)
    }
  })
})
