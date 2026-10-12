// Each level's set dressing (#114): where it stands (`world/decor.ts`) and
// what it is (`models/decorProps.ts`). Never in the way, never on anything a
// level uses, some rooms and not all, every level its own set — and no prop
// ever lays a face in another's plane (no z-fighting: the wall's face, the
// floor's, or one of its own parts).
import { describe, expect, it } from 'vitest'
import { generateStage } from '@/game/world/stages'
import { generateWakeUpCall } from '@/game/world/stages/tutorial'
import { mirrorX } from '@/game/world/stages/builder'
import { planDecor, reservedCells, TUTORIAL_CRANE_ROOMS, TUTORIAL_FREE_ROOMS } from '@/game/world/decor'
import { CELL, Cell, type MapData } from '@/game/world/levelGen'
import { secretWallFaces } from '@/game/world/climbMesh'
import { DECOR, SECTOR_DECOR, SINK, WALL_GAP, type DecorKind } from '@/game/models/decorProps'
import type { SectorId } from '@/game/world/themes'
import { coplanarOverlaps, tris } from './coplanar'

const STAGES: SectorId[] = ['blaze', 'cryo', 'volt', 'gale', 'magnet', 'drill', 'tide', 'neon', 'rotor', 'fortress']
const SEEDS = [1, 2, 7, 51940, 99991]
const maps = (): Array<{ sector: SectorId; map: MapData; where: string }> => {
  const out: Array<{ sector: SectorId; map: MapData; where: string }> = []
  for (const s of STAGES) for (const seed of SEEDS) {
    const m = generateStage(s, seed)
    out.push({ sector: s, map: m, where: `${s} ${seed}` })
    out.push({ sector: s, map: mirrorX(m), where: `${s} ${seed} mirrored` })
  }
  out.push({ sector: 'scrapyard', map: generateWakeUpCall(1), where: 'tutorial' })
  return out
}
const ALL = maps()

describe('the set dressing plan', () => {
  it('is the same plan every time for a map', () => {
    for (const { sector, map } of ALL.slice(0, 6)) expect(planDecor(map, sector)).toEqual(planDecor(map, sector))
  })

  it('stands nowhere a level uses, and a floor prop only in an open corner on a plain flat cell', () => {
    for (const { sector, map, where } of ALL) {
      const t = map.terrain!
      // The tutorial's fighting rooms keep their lesson spots only off the corners.
      const reserved = reservedCells(map, sector === 'scrapyard' ? TUTORIAL_FREE_ROOMS : [])
      const plan = planDecor(map, sector)
      for (const p of plan.props.filter(p => p.r > 0)) {
        const i = Math.floor(p.x / CELL)
        const j = Math.floor(p.z / CELL)
        const k = j * map.w + i
        expect(reserved.has(k), `${where}: ${p.kind} on a used cell`).toBe(false)
        expect(map.cell[k], `${where}: ${p.kind}`).toBe(Cell.Room)
        expect(t.pit[k] || t.ramp[k], `${where}: ${p.kind} on a pit or ramp`).toBeFalsy()
        // Its body stays inside its own cell, clear of both walls.
        const ox = Math.abs(p.x - (i + 0.5) * CELL)
        const oz = Math.abs(p.z - (j + 0.5) * CELL)
        expect(ox + p.r, `${where}: ${p.kind}`).toBeLessThanOrEqual(CELL / 2)
        expect(oz + p.r, `${where}: ${p.kind}`).toBeLessThanOrEqual(CELL / 2)
      }
    }
  })

  it('a wall prop hangs on a real wall, never on a puzzle\'s button or panel face', () => {
    for (const { sector, map, where } of ALL) {
      const busy = secretWallFaces(map.terrain!, map.w)
      for (const p of planDecor(map, sector).props.filter(p => p.face)) {
        expect(busy.has(p.face!), `${where}: ${p.kind} on ${p.face}`).toBe(false)
        const [k, d] = p.face!.split(':')
        const [di, dj] = d!.split(',').map(Number)
        const i = Number(k) % map.w
        const j = Math.floor(Number(k) / map.w)
        const ni = i + di!
        const nj = j + dj!
        const wall = ni < 0 || nj < 0 || ni >= map.w || nj >= map.h || map.cell[nj * map.w + ni] === Cell.Void
        expect(wall, `${where}: ${p.kind} not on a wall`).toBe(true)
      }
    }
  })

  it('dresses some rooms and leaves others bare, with each level\'s own set', () => {
    for (const s of STAGES) {
      const kinds = new Set<DecorKind>()
      for (const seed of SEEDS) {
        const m = generateStage(s, seed)
        const plan = planDecor(m, s)
        const dressed = new Set(plan.props.map(p => p.room))
        expect(dressed.size, `${s} ${seed}`).toBeGreaterThan(0)
        expect(dressed.size, `${s} ${seed}`).toBeLessThan(m.rooms.length)
        for (const p of plan.props) kinds.add(p.kind)
      }
      const set = SECTOR_DECOR[s]
      for (const k of kinds) expect([...set.floor, ...set.wall], s).toContain(k)
      expect(kinds.size, s).toBeGreaterThanOrEqual(2)
    }
  })

  it('the Blaze Master\'s arena has its forge in a corner', () => {
    for (const seed of SEEDS) {
      const m = generateStage('blaze', seed)
      const arena = m.terrain!.sections.indexOf('arena')
      const plan = planDecor(m, 'blaze')
      expect(plan.props.some(p => p.room === arena && p.kind === 'forge'), `seed ${seed}`).toBe(true)
    }
  })

  it('the tutorial\'s crate and golem rooms have their cranes, over the walls\' tops', () => {
    const m = generateWakeUpCall(1)
    const plan = planDecor(m, 'scrapyard')
    for (const r of TUTORIAL_CRANE_ROOMS) {
      const c = plan.cranes.find(x => x.room === r)
      expect(c, `room ${r}`).toBeDefined()
      expect(c!.y).toBeGreaterThan(m.terrain!.wallTop[r]!)
    }
  })
})

// ─── The props themselves ─────────────────────────────────────────────────────


describe('the set dressing props', () => {
  const kinds = Object.keys(DECOR) as DecorKind[]

  it('a wall prop keeps off the wall\'s plane; a floor prop sinks into the floor', () => {
    for (const k of kinds) {
      const d = DECOR[k]
      const parts = d.build()
      let minZ = Infinity
      let minY = Infinity
      for (const g of [...parts.toon, ...parts.glow]) {
        g.computeBoundingBox()
        minZ = Math.min(minZ, g.boundingBox!.min.z)
        minY = Math.min(minY, g.boundingBox!.min.y)
      }
      if (d.mount === 'wall') expect(minZ, k).toBeGreaterThanOrEqual(WALL_GAP - 1e-6)
      else {
        expect(minY, k).toBeLessThan(0)
        expect(minY, k).toBeGreaterThan(-SINK - 0.15)
      }
    }
  })

  it('no two of a prop\'s parts lay a flat face in one plane (no z-fighting)', () => {
    for (const k of kinds) {
      const parts = DECOR[k].build()
      expect(coplanarOverlaps([...parts.toon, ...parts.glow]), k).toBe(0)
    }
  })

  it('stays light: a prop is a few thousand triangles at most', () => {
    for (const k of kinds) {
      const parts = DECOR[k].build()
      const n = [...parts.toon, ...parts.glow].reduce((s, g) => s + tris(g).length, 0)
      expect(n, k).toBeLessThan(9000)
    }
  })
})
