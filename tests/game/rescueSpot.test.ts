// @vitest-environment jsdom
// Where a pit rescue sets Flux down (`sim/rescueSpot.ts`). It used to be the
// newest footing a bare 1.6 m from the fall: run off a ledge's lip and that
// was 0.3 m from the same lip, facing the pit, and a held "forward" dropped
// him again a second later (Tower Run, the lift hall's ledge). Every lip of
// every tower is run up to and off here: the landing must stand well clear
// of any drop when the trail had such a spot, and face away from the pit.

import { describe, expect, it, vi } from 'vitest'
import { generateClimb } from '@/game/world/climbGen'
import { CELL, Cell, type MapData } from '@/game/world/levelGen'
import { createNav, floorAt, groundAt, STEP_UP, type Nav } from '@/game/world/nav'
import { rescueLanding, RESCUE_EDGE } from '@/game/sim/rescueSpot'

vi.mock('@/use/useAds', () => ({ showMidgameAd: async () => {} }))
vi.mock('@/use/useAdGate', () => ({ canShowInterstitial: () => false, markInterstitialShown: () => {} }))
vi.mock('@/use/useCrazyGames', () => ({ triggerHappytime: () => {} }))
vi.mock('@/game/engine/app', () => ({ app: { setMode: () => {}, setWanted: () => {} } }))

const SEEDS = [3, ...Array.from({ length: 11 }, (_, i) => (i * 2654435761 + 1013904223) >>> 0)]
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const

/** A pit Flux would fall into at (x, z), feet at y — written apart from the
 *  helper: a pit cell with no platform there to stand on. */
const isDrop = (nav: Nav, x: number, z: number, y: number): boolean => {
  const m = nav.map
  const i = Math.floor(x / CELL)
  const j = Math.floor(z / CELL)
  if (i < 0 || j < 0 || i >= m.w || j >= m.h) return false
  const k = j * m.w + i
  return m.cell[k] !== Cell.Void && !!m.terrain!.pit[k] && floorAt(nav, x, z, y) < y - STEP_UP
}

/** The nearest drop to (x, z), searched on a fine grid out to 2 m. */
const nearestDrop = (nav: Nav, x: number, z: number, y: number): number => {
  let best = Infinity
  for (let dx = -2; dx <= 2; dx += 0.1) {
    for (let dz = -2; dz <= 2; dz += 0.1) {
      const d = Math.hypot(dx, dz)
      if (d < best && d <= 2 && isDrop(nav, x + dx, z + dz, y)) best = d
    }
  }
  return best
}

type Foot = [number, number, number, number]

/** Every lip: a ground cell beside a pit cell, run up to from three cells
 *  back along its middle, the trail ending 0.3 m short of the edge, facing
 *  the pit; the fall 1 m past the lip. */
const lips = (m: MapData) => {
  const t = m.terrain!
  const out: Array<{ trail: Foot[]; fx: number; fz: number; di: number; dj: number }> = []
  for (let j = 1; j < m.h - 1; j++) {
    for (let i = 1; i < m.w - 1; i++) {
      const k = j * m.w + i
      if (m.cell[k] === Cell.Void || t.pit[k] || t.ramp[k]) continue
      for (const [di, dj] of DIRS) {
        const pk = (j + dj) * m.w + i + di
        if (m.cell[pk] === Cell.Void || !t.pit[pk]) continue
        const y = t.floor[k]!
        // The lip: the shared edge's middle.
        const lx = (i + 0.5 + di * 0.5) * CELL
        const lz = (j + 0.5 + dj * 0.5) * CELL
        const yaw = Math.atan2(-di, -dj)
        const trail: Foot[] = []
        for (let s = 3 * CELL; s >= 0.3; s -= 0.5) {
          const x = lx - di * s
          const z = lz - dj * s
          if (Math.abs(groundAt(m, x, z) - y) > 1e-6) continue
          trail.push([x, z, y, yaw])
        }
        trail.push([lx - di * 0.3, lz - dj * 0.3, y, yaw])
        out.push({ trail, fx: lx + di, fz: lz + dj, di, dj })
      }
    }
  }
  return out
}

describe('the pit rescue lands clear of the edge', () => {
  it('every lip of every tower: well back from any drop when the trail allows, facing away from the pit', () => {
    let cases = 0
    let clearCases = 0
    for (const seed of SEEDS) {
      const m = generateClimb(seed)
      const nav = createNav(m)
      for (const L of lips(m)) {
        const to = rescueLanding(nav, L.trail, L.fx, L.fz)
        expect(to).not.toBeNull()
        cases++
        // Facing: his forward (−sin yaw, −cos yaw) points away from the pit.
        const fwd = -Math.sin(to!.yaw) * L.di - Math.cos(to!.yaw) * L.dj
        expect(fwd, `seed ${seed} lip (${L.fx.toFixed(1)}, ${L.fz.toFixed(1)}) faces the pit`).toBeLessThan(0)
        // Clearance: when any spot on the trail stood RESCUE_EDGE from every
        // drop, the landing does too; never the 0.3 m spot at the lip.
        const could = L.trail.some(f => nearestDrop(nav, f[0], f[1], f[2]) > RESCUE_EDGE + 0.15)
        const got = nearestDrop(nav, to!.x, to!.z, to!.y)
        expect(got, `seed ${seed} lip (${L.fx.toFixed(1)}, ${L.fz.toFixed(1)})`).toBeGreaterThan(0.3 + 0.2)
        if (could) {
          clearCases++
          expect(got, `seed ${seed} lip (${L.fx.toFixed(1)}, ${L.fz.toFixed(1)})`).toBeGreaterThan(RESCUE_EDGE - 0.1)
        }
      }
    }
    // Not vacuous: the towers have plenty of lips, most with room to stand back.
    expect(cases).toBeGreaterThan(40)
    expect(clearCases).toBeGreaterThan(cases / 3)
  })

  it('no footing clear of the fall: none, and the checkpoint takes it', () => {
    const m = generateClimb(3)
    const nav = createNav(m)
    expect(rescueLanding(nav, [[10, 10, 0, 0]], 10.5, 10)).toBeNull()
  })
})
