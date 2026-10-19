// Drops land inside the room (`sim/pickupToss.ts`): a bolt, a capsule or a
// gel tossed out of a kill, a chest, a crate or a broken decor piece against
// a wall or in a corner comes down on reachable floor in the same room, on
// every stage, the climbs and the labyrinth maps; only a plain bolt shed
// over a pit may fall into it.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { planToss, tossStep } from '@/game/sim/pickupToss'
import { createNav, floorAt, groundAt, hasLineOfSight, isSolidCell, STEP_UP, type Nav } from '@/game/world/nav'
import { CELL, Cell, generateMap, type MapData } from '@/game/world/levelGen'
import { generateStage } from '@/game/world/stages'
import { generateClimb } from '@/game/world/climbGen'
import { generateWakeUpCall } from '@/game/world/stages/tutorial'
import { mulberry32 } from '@/game/world/rng'
import type { Pickup, PickupKind } from '@/game/sim/world'

const SECTORS = ['blaze', 'cryo', 'volt', 'gale', 'magnet', 'drill', 'tide', 'neon', 'rotor', 'fortress'] as const
const KINDS: PickupKind[] = ['bolt', 'hp', 'weBig', 'core']
const DIRS: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]]

const maps = (): Array<[string, MapData]> => [
  ...SECTORS.map(s => [s, generateStage(s, 1)] as [string, MapData]),
  ['tutorial', generateWakeUpCall(1)],
  ['climb', generateClimb(4)],
  ['climb-scrapyard', generateClimb(9, false)],
  ['labyrinth', generateMap({ seed: 5, rooms: 8, boss: true })]
]

const toss = (nav: Nav, kind: PickupKind, x: number, y: number, z: number, player: { x: number; z: number; feet: number }, rand: () => number): Pickup => {
  const p = { active: true, kind, value: 1, x, y, z, vx: 0, vy: 0, vz: 0, t: 0, root: null as never, magnet: false, hx: x, hz: z, ref: 0 } as Pickup
  planToss(nav, kind, x, y, z, player, rand, p)
  for (let t = 0; t < 3; t += 1 / 60) tossStep(nav, p, 1 / 60)
  return p
}

/** Spots against a wall (0.5 m off it) and in corners, one per wall side. */
const wallSpots = (map: MapData, nav: Nav): Array<[number, number]> => {
  const out: Array<[number, number]> = []
  for (let j = 0; j < map.h; j++) {
    for (let i = 0; i < map.w; i++) {
      if (map.cell[j * map.w + i] === Cell.Void || isSolidCell(nav, i, j)) continue
      const g = groundAt(map, (i + 0.5) * CELL, (j + 0.5) * CELL)
      if (g === -Infinity) continue
      let ox = 0
      let oz = 0
      for (const [di, dj] of DIRS) {
        if (isSolidCell(nav, i + di, j + dj)) { ox += di; oz += dj }
      }
      if (!ox && !oz) continue
      out.push([(i + 0.5 + Math.sign(ox) * 0.33) * CELL, (j + 0.5 + Math.sign(oz) * 0.33) * CELL])
    }
  }
  return out
}

describe('a tossed drop', () => {
  it('lands on reachable floor in the source\'s room, from walls and corners, on every map', () => {
    const rand = mulberry32(7)
    const bad: string[] = []
    let n = 0
    for (const [name, map] of maps()) {
      const nav = createNav(map)
      const spots = wallSpots(map, nav)
      for (let s = 0; s < spots.length; s += Math.max(1, Math.floor(spots.length / 60))) {
        const [x, z] = spots[s]!
        const feet = floorAt(nav, x, z)
        if (feet === -Infinity) continue
        const room = map.room[Math.floor(z / CELL) * map.w + Math.floor(x / CELL)]
        for (let k = 0; k < 6; k++) {
          const kind = KINDS[k % KINDS.length]!
          // Flux anywhere around (even behind the wall)
          const player = { x: x + (rand() - 0.5) * 12, z: z + (rand() - 0.5) * 12, feet }
          const p = toss(nav, kind, x, feet + 0.8 + rand() * 1.5, z, player, rand)
          n++
          const i = Math.floor(p.x / CELL)
          const j = Math.floor(p.z / CELL)
          const g = floorAt(nav, p.x, p.z)
          const why = isSolidCell(nav, i, j) ? 'in a wall'
            : map.room[j * map.w + i] !== room ? 'in another room'
              : g === -Infinity ? 'in a pit'
                : Math.abs(g - feet) > STEP_UP ? 'on another level'
                  : !hasLineOfSight(nav, x, z, p.x, p.z) ? 'behind a wall'
                    : Math.abs(p.y - g) > 0.5 || Math.hypot(p.vx, p.vz) > 0.05 ? 'not at rest' : ''
          if (why) bad.push(`${name} ${kind} from (${x.toFixed(1)}, ${z.toFixed(1)}) → (${p.x.toFixed(1)}, ${p.z.toFixed(1)}): ${why}`)
        }
      }
    }
    expect(n).toBeGreaterThan(1000)
    expect(bad).toEqual([])
  })

  it('hops a little, not a teleport: it lands within a couple of metres', () => {
    const map = generateStage('blaze', 1)
    const nav = createNav(map)
    const rand = mulberry32(3)
    for (const [x, z] of wallSpots(map, nav).slice(0, 40)) {
      const p = toss(nav, 'bolt', x, 1, z, { x, z, feet: 0 }, rand)
      expect(Math.hypot(p.x - x, p.z - z)).toBeLessThan(3)
    }
  })

  it('a plain bolt shed over a pit falls into it; a capsule from there reaches the floor', () => {
    const map = generateClimb(4)
    const t = map.terrain!
    const k = t.pit.findIndex((v, q) => v === 1 && map.cell[q] !== Cell.Void)
    expect(k).toBeGreaterThanOrEqual(0)
    const nav = createNav(map)
    const x = (k % map.w + 0.5) * CELL
    const z = (Math.floor(k / map.w) + 0.5) * CELL
    const rand = mulberry32(11)
    let fell = 0
    for (let n = 0; n < 20; n++) {
      const bolt = toss(nav, 'bolt', x, 6, z, { x: x + 6, z, feet: 0 }, rand)
      if (floorAt(nav, bolt.x, bolt.z) === -Infinity) fell++
      const cap = toss(nav, 'hpBig', x, 6, z, { x: x + 6, z, feet: 0 }, rand)
      expect(floorAt(nav, cap.x, cap.z)).toBeGreaterThan(-Infinity)
      expect(cap.y).toBeGreaterThan(-5)
    }
    expect(fell).toBeGreaterThan(0)
  })

  it('the hub drops nothing: it has no pickups and no nav grid (add it to the maps above if it ever does)', () => {
    for (const f of ['hub.ts', 'hubWalk.ts', 'hubPlaces.ts']) {
      const src = readFileSync(resolve(__dirname, '../../src/game/sim', f), 'utf8')
      expect(src).not.toMatch(/spawnPickup|CombatSystem|createNav/)
    }
  })
})
