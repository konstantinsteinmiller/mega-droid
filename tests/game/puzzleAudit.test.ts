// The puzzle rule (saved for every future puzzle build): a secret's hint
// panel and buttons must be readable and reachable where they hang —
// on a real wall, facing a floor the player can stand on, at eye height,
// in plain sight from that floor, and clear of any decor. A Sky Docks pipe
// once covered a blue button and a hint read from nowhere; this pins it for
// every stage, every seed and both mirror sides (the seed flips the map).

import { describe, expect, it } from 'vitest'
import { generateStage } from '@/game/world/stages'
import { generateClimb } from '@/game/world/climbGen'
import { secretWallFaces } from '@/game/world/climbMesh'
import { CELL, type MapData } from '@/game/world/levelGen'
import { createNav, floorAt, hasLineOfSight } from '@/game/world/nav'
import { initialState, panelColors, solved, targetOf } from '@/game/sim/secrets'
import type { SectorId } from '@/game/world/themes'

const STAGES: SectorId[] = ['blaze', 'cryo', 'volt', 'gale', 'magnet', 'drill', 'tide', 'neon', 'rotor', 'fortress']

/** A cell Flux can stand on (a room or corridor cell with a floor). */
const standable = (m: MapData, i: number, j: number): boolean => {
  if (i < 0 || j < 0 || i >= m.w || j >= m.h) return false
  const k = j * m.w + i
  return m.room[k]! >= 0 && !m.terrain!.pit[k]
}

const audit = (m: MapData, label: string): void => {
  const t = m.terrain!
  const faces = secretWallFaces(t, m.w)
  const nav = createNav(m)
  for (const [n, s] of (t.secrets ?? []).entries()) {
    const sec = `${label} secret ${n}`
    // Solvable (#123): it asks for something, and for nothing the room lacks.
    expect(solved(s, initialState(s)), `${sec}: not solved before a shot`).toBe(false)
    expect(s.buttons.some((_b, i) => targetOf(s, i) !== initialState(s)[i]), `${sec}: some button to change`).toBe(true)
    if (s.kind === 'color') {
      const inRoom = new Set(s.buttons.map(b => b.color))
      expect(inRoom.has(s.key!), `${sec}: a button in the key colour`).toBe(true)
      // The panel shows the room's colours only (it once showed a yellow lamp in a room with no yellow).
      expect(panelColors(s).every(c => inRoom.has(c)), `${sec}: the panel shows only colours in the room`).toBe(true)
      expect(panelColors(s), `${sec}: the key is on the panel`).toContain(s.key)
    }
    // The panel clear of the wall posts: in the middle third of its wall face
    // (a post stands 0.3 m proud on each cell corner and covered its first lamp).
    const along = s.panel.nx ? s.panel.z : s.panel.x
    const off = Math.abs((along / CELL) % 1 - 0.5) * CELL
    const onFalseWall = s.cells.includes(Math.floor((s.panel.z - s.panel.nz * 0.5) / CELL) * m.w + Math.floor((s.panel.x - s.panel.nx * 0.5) / CELL))
    if (!onFalseWall) expect(off, `${sec}: the panel in the middle of its wall face`).toBeLessThan(0.3)
    const mounts = [...s.buttons.map((b, n) => ({ ...b, what: `button ${n}` })), { ...s.panel, what: 'hint panel' }]
    for (const b of mounts) {
      const i = Math.floor((b.x + b.nx * 0.5) / CELL)
      const j = Math.floor((b.z + b.nz * 0.5) / CELL)
      const at = `${label} ${b.what}`
      // In front: a floor to stand on.
      expect(standable(m, i, j), `${at}: a floor in front`).toBe(true)
      // Behind: a wall, not open floor at the same height.
      const bi = Math.floor((b.x - b.nx * 0.5) / CELL)
      const bj = Math.floor((b.z - b.nz * 0.5) / CELL)
      const floor = t.floor[j * m.w + i]!
      // (The secret's own alcove, hidden until solved, is wall until then.)
      if (standable(m, bi, bj) && !s.cells.includes(bj * m.w + bi)) {
        expect(t.floor[bj * m.w + bi]! - floor, `${at}: on a wall`).toBeGreaterThan(1)
      }
      // At a height the eye meets and the shot reaches from that floor.
      const above = b.y - floorAt(nav, cellCenterOf(i), cellCenterOf(j))
      expect(above, `${at}: height over its floor`).toBeGreaterThan(0.6)
      expect(above, `${at}: height over its floor`).toBeLessThan(3.2)
      // Clear of decor: the mesh keeps its wall face bare.
      expect(faces.has(`${j * m.w + i}:${-b.nx},${-b.nz}`), `${at}: bare wall face`).toBe(true)
      // In sight: from some floor up to three cells out in front.
      let seen = false
      for (let d = 1; d <= 3 && !seen; d++) {
        const x = b.x + b.nx * CELL * d
        const z = b.z + b.nz * CELL * d
        const ci = Math.floor(x / CELL)
        const cj = Math.floor(z / CELL)
        if (standable(m, ci, cj) && hasLineOfSight(nav, x, z, b.x + b.nx * 0.3, b.z + b.nz * 0.3)) seen = true
      }
      expect(seen, `${at}: in sight from the floor`).toBe(true)
    }
  }
}
const cellCenterOf = (i: number): number => (i + 0.5) * CELL

describe('puzzle audit: hints and buttons hang where they can be read and hit', () => {
  for (const sector of STAGES) {
    it(`${sector}: every seed`, () => {
      for (let seed = 0; seed < 24; seed++) audit(generateStage(sector, seed), `${sector} #${seed}`)
    })
  }
  it('the Tower Run', () => {
    for (let seed = 0; seed < 24; seed++) audit(generateClimb(seed), `climb #${seed}`)
  })
})
