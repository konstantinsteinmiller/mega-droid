// @vitest-environment jsdom
// ─── The stasis capsule's lever ──────────────────────────────────────────────
//
// The lever's housing sits right against the glass, not out in the air beside
// it (a playtest saw it floating next to the open capsule in the lab), yet
// clear of the glass's rim as the glass slides down past it.

import { describe, expect, it } from 'vitest'
import { Box3, Mesh } from 'three'
import { buildStasisCapsule, LEVER_X } from '@/game/models/stasis'

const GLASS_R = 0.62
const RIM_TUBE = 0.025

describe('the stasis capsule', () => {
  it('its lever housing stands against the glass, a few cm off it', () => {
    const inner = LEVER_X - 0.11
    expect(inner - (GLASS_R + RIM_TUBE)).toBeGreaterThan(0)
    expect(inner - GLASS_R).toBeLessThan(0.05)
  })

  it('the lever pivots on the housing and swings clear of the glass', () => {
    const c = buildStasisCapsule()
    for (const k of [0, 0.5, 1]) {
      c.setLever(k)
      c.root.updateMatrixWorld(true)
      const box = new Box3()
      c.lever.traverse(o => { if ((o as Mesh).isMesh) box.expandByObject(o) })
      expect(box.min.x, `lever at ${k}`).toBeGreaterThan(GLASS_R + RIM_TUBE)
      expect(box.min.x).toBeLessThan(LEVER_X + 0.11)
    }
  })
})
