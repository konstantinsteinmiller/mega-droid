// The puzzle rule (saved for every future puzzle build): a secret's hint
// panel and buttons must be readable and reachable where they hang —
// on a real wall, facing a floor the player can stand on, at eye height,
// in plain sight from that floor, and clear of any decor. A Sky Docks pipe
// once covered a blue button and a hint read from nowhere; this pins it for
// every stage, every seed and both mirror sides (the seed flips the map).
// The later kinds (#143) besides: a sequence's icons all different and its
// order playable, a mirror puzzle's beam lamp hung by the same rule and its
// beam never through a wall in any turn of the mirrors, a tiles puzzle's
// plates flat on the room's floor and lit in one walk.

import { describe, expect, it } from 'vitest'
import { generateStage } from '@/game/world/stages'
import { generateClimb } from '@/game/world/climbGen'
import { secretWallFaces } from '@/game/world/climbMesh'
import { CELL, type MapData } from '@/game/world/levelGen'
import { createNav, findPath, floorAt, hasLineOfSight } from '@/game/world/nav'
import { initialState, panelColors, plateMap, press, pressCount, solved, targetOf, traceBeam } from '@/game/sim/secrets'
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
    if (s.kind === 'lights' || s.kind === 'color' || s.kind === 'cycle') {
      expect(s.buttons.some((_b, i) => targetOf(s, i) !== initialState(s)[i]), `${sec}: some button to change`).toBe(true)
    }
    if (s.kind === 'sequence') {
      // Each button its own colour and icon; the order playable as shown.
      expect(new Set(s.buttons.map(b => b.color)).size, `${sec}: every button its own icon`).toBe(s.buttons.length)
      expect(s.target.every(n => s.buttons[n]), `${sec}: the order names real buttons`).toBe(true)
      expect(s.target.length, `${sec}: an order a kid can hold`).toBeLessThanOrEqual(6)
      const st = initialState(s)
      for (const n of s.target) press(s, st, n)
      expect(solved(s, st), `${sec}: played in order, it opens`).toBe(true)
    }
    if (s.kind === 'mirror') {
      // Every way the mirrors can stand: the beam never crosses a wall.
      const pts: number[] = []
      const k = pressCount(s)
      let opens = 0
      for (let bits = 0; bits < 1 << k; bits++) {
        const st = Array.from({ length: k }, (_v, i) => (bits >> i) & 1)
        if (traceBeam(s, st, pts)) opens++
        for (let c = 0; c + 3 < pts.length; c += 2) {
          expect(hasLineOfSight(nav, pts[c]!, pts[c + 1]!, pts[c + 2]!, pts[c + 3]!), `${sec}: the beam's leg ${c / 2} through a wall (${bits})`).toBe(true)
        }
      }
      expect(opens, `${sec}: some turn of the mirrors reaches the target`).toBeGreaterThan(0)
      // Each mirror on the room's open floor, out of the alcove, a body's width from a wall.
      for (const [n, mm] of (s.mirrors ?? []).entries()) {
        const i = Math.floor(mm.x / CELL)
        const j = Math.floor(mm.z / CELL)
        expect(standable(m, i, j) && m.room[j * m.w + i] === s.room && !s.cells.includes(j * m.w + i), `${sec}: mirror ${n} on the room's floor`).toBe(true)
        expect(m.doors.some(d => Math.abs(d.i - i) + Math.abs(d.j - j) <= 1), `${sec}: mirror ${n} off a doorway`).toBe(false)
      }
    }
    if (s.kind === 'tiles') {
      const y0 = s.tiles![0]!.y
      for (const [n, p] of s.tiles!.entries()) {
        const i = Math.floor(p.x / CELL)
        const j = Math.floor(p.z / CELL)
        const k = j * m.w + i
        expect(standable(m, i, j) && m.room[k] === s.room && !t.ramp[k] && !s.cells.includes(k), `${sec}: plate ${n} on the room's floor`).toBe(true)
        expect(t.floor[k], `${sec}: plate ${n} level with the rest`).toBe(y0)
      }
      // Off the way through: the path between any two of the room's doors
      // never sets foot on a plate (a passer-by never lights one and hears
      // the reset buzz). A body's centre, with a hand's breadth to spare.
      const plates = new Set(s.tiles!.map(p => Math.floor(p.z / CELL) * m.w + Math.floor(p.x / CELL)))
      // The room's ways in: its cells with an open neighbour outside it (a
      // corridor or the next room).
      const ends: Array<[number, number]> = []
      for (let j = 0; j < m.h; j++) {
        for (let i = 0; i < m.w; i++) {
          if (m.room[j * m.w + i] !== s.room || !standable(m, i, j) || s.cells.includes(j * m.w + i)) continue
          const out = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const).some(([di, dj]) => {
            const k = (j + dj) * m.w + i + di
            return m.cell[k] !== 0 && m.room[k] !== s.room && !t.pit[k]
          })
          if (out) ends.push([cellCenterOf(i), cellCenterOf(j)])
        }
      }
      expect(ends.length, `${sec}: the room has two ways in`).toBeGreaterThanOrEqual(2)
      for (let a = 0; a < ends.length; a++) {
        for (let b = a + 1; b < ends.length; b++) {
          const path = findPath(nav, ...ends[a]!, ...ends[b]!, 4000)
          expect(path, `${sec}: a way between doors ${a} and ${b}`).not.toBeNull()
          let [px, pz] = ends[a]!
          for (const [qx, qz] of path!) {
            const n = Math.ceil(Math.hypot(qx - px, qz - pz) / 0.25)
            for (let k = 0; k <= n; k++) {
              const x = px + (qx - px) * k / Math.max(1, n)
              const z = pz + (qz - pz) * k / Math.max(1, n)
              for (const [ox, oz] of [[0, 0], [0.3, 0], [-0.3, 0], [0, 0.3], [0, -0.3]] as const) {
                const c = Math.floor((z + oz) / CELL) * m.w + Math.floor((x + ox) / CELL)
                expect(plates.has(c), `${sec}: the way between doors ${a} and ${b} crosses a plate at (${x.toFixed(1)}, ${z.toFixed(1)})`).toBe(false)
              }
            }
            px = qx
            pz = qz
          }
        }
      }
      const map = plateMap(s)
      expect(map.cols * map.rows, `${sec}: the panel's map fits`).toBeLessThanOrEqual(12)
      expect(map.cols, `${sec}: the panel's map fits`).toBeLessThanOrEqual(4)
    }
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
    const mounts = [
      ...s.buttons.map((b, n) => ({ ...b, what: `button ${n}` })), { ...s.panel, what: 'hint panel' },
      ...(s.emitter ? [{ ...s.emitter, what: 'beam lamp' }] : [])
    ]
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
