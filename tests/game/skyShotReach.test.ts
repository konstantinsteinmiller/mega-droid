// @vitest-environment jsdom
// Player shots out of the level reach the sky traffic (#181 follow-up): in
// the Blaze Master's level a charged shot met an invisible wall (the level's
// highest roof was the test, so over a low room's walls the cell test still
// stopped it), and in the Scrapyard the taxis, out on the farther lanes,
// were past a shot's reach. On every stage, a charged shot from the edge of
// the playfield at a taxi and at a parcel drone downs it, through a real
// CombatSystem.
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/game/world/textures', async (orig) => {
  const { Texture } = await import('three')
  return { ...(await orig<object>()), levelAtlas: () => new Texture(), glowTexture: () => new Texture() }
})

import { Scene, Vector3 } from 'three'
import { CombatSystem, overWalls, wallTopAt, type CombatHost } from '@/game/sim/combat'
import { createNav, floorAt, hasLineOfSight, type Nav } from '@/game/world/nav'
import { CELL, generateMap, type MapData } from '@/game/world/levelGen'
import { generateStage } from '@/game/world/stages'
import { THEMES, type SectorId } from '@/game/world/themes'
import { buildCityscape, type Cityscape } from '@/game/world/cityscape'
import type { Shot, World } from '@/game/sim/world'

const noop = () => {}
const DT = 1 / 60
const SECTORS: SectorId[] = ['scrapyard', 'blaze', 'cryo', 'volt', 'gale', 'magnet', 'drill', 'tide', 'neon', 'rotor', 'fortress']

const host = (map: MapData, city: Cityscape, downs: { n: number }) => {
  const w = {
    scene: new Scene(), map, nav: createNav(map), time: 0,
    player: { x: 0, z: 0, yaw: 0, pitch: 0 },
    combat: { iframes: 0, charging: false, charge: 0 } as unknown as World['combat'],
    enemies: [],
    fx: { sparks: noop, emit: noop, orbBurst: noop, flash: noop, riseRing: noop },
    markers: { spawn: noop },
    shocks: { spawn: noop, spawnLinear: noop },
    stats: { critChance: 0, critMul: 1.5, piercing: false, boltMul: 1, magnetMul: 1, parryBonus: 0, busterDmg: 10, chargeTimeMul: 1 },
    hitStop: 0,
    onEnemyKilled: noop, onPickup: noop, onPlayerHurt: noop, onPlayerDown: noop,
    shake: noop, sfx: noop,
    // As the mission wires them.
    lureSky: (s: Shot) => { city.lure(s.x, s.y, s.z, s.vx, s.vy, s.vz, s.life * Math.hypot(s.vx, s.vy, s.vz)) },
    shotHitsSky: (s: Shot) => {
      const hit = city.shotHits(s.x, s.y, s.z, s.radius, new Vector3())
      if (hit) downs.n++
      return hit
    }
  } as unknown as World & CombatHost
  return w
}

/** True if a straight line from a to b meets nothing visible of the level:
 *  never under a floor, never through a wall below its top. */
const visiblyClear = (nav: Nav, a: Vector3, b: Vector3): boolean => {
  const n = Math.ceil(a.distanceTo(b) / 0.5)
  const p = new Vector3()
  const q = new Vector3()
  for (let k = 1; k <= n; k++) {
    q.copy(p.lerpVectors(a, b, (k - 1) / n))
    p.lerpVectors(a, b, k / n)
    if (p.y <= floorAt(nav, p.x, p.z) + 0.05) return false
    if (!overWalls(nav, q.x, q.z, p.x, p.z, p.y)) return false
  }
  return true
}

describe('player shots reach the sky traffic from every stage', () => {
  const maps: Array<[string, MapData]> = [
    ...SECTORS.map(s => [s, generateStage(s, 1)] as [string, MapData]),
    ['flat', generateMap({ seed: 5, rooms: 8, boss: true })]
  ]
  for (const [name, map] of maps) {
    it(`${name}: a charged shot from the playfield's edge downs a taxi and a parcel drone`, async () => {
      const city = await buildCityscape(map, THEMES[(SECTORS.includes(name as SectorId) ? name : 'volt') as SectorId], undefined, 'full')
      city.stream(Infinity)
      const downs = { n: 0 }
      const w = host(map, city, downs)
      const nav = w.nav
      const sys = new CombatSystem(w)
      // Walkable, floored cells (the shooter's spots).
      const spots: Vector3[] = []
      for (let j = 0; j < map.h; j++) {
        for (let i = 0; i < map.w; i++) {
          const k = j * map.w + i
          if (nav.solid[k] === 1 || map.terrain?.pit[k]) continue
          const x = (i + 0.5) * CELL, z = (j + 0.5) * CELL
          spots.push(new Vector3(x, floorAt(nav, x, z) + 1.5, z))
        }
      }
      let t = 30
      for (const kind of ['taxi', 'drone'] as const) {
        let done = false
        const why: string[] = []
        // Try vehicles of this kind in turn until one has a visibly clear
        // line from the edge (the shot itself is the thing under test).
        for (let attempt = 0; attempt < 40 && !done; attempt++) {
          t += 3.1
          const now: Vector3[] = []
          city.update(t)
          city.probe(t, (x, y, z, _r, _b, k) => { if (k === kind) now.push(new Vector3(x, y, z)) })
          const vi = attempt % Math.max(1, now.length)
          const v = now[vi]
          if (!v) continue
          // The edge spot nearest it.
          spots.sort((a, b) => Math.hypot(a.x - v.x, a.z - v.z) - Math.hypot(b.x - v.x, b.z - v.z))
          // Lead it: where it will be when a 28 m/s shot gets there; from
          // the nearest edge spot with a visibly clear line to it.
          let from: Vector3 | null = null
          let aim: Vector3 | null = null
          for (const sp of spots.slice(0, 60)) {
            const tof = sp.distanceTo(v) / 28
            const later: Vector3[] = []
            city.probe(t + tof, (x, y, z, _r, _b, k) => { if (k === kind) later.push(new Vector3(x, y, z)) })
            if (later[vi] && visiblyClear(nav, sp, later[vi]!)) {
              from = sp
              aim = later[vi]!
              break
            }
          }
          city.update(t)
          if (!from || !aim) { why.push(`${now.length} ${v.toArray().map(c => c.toFixed(0))}`); continue }
          const d = aim.clone().sub(from).normalize()
          const before = downs.n
          w.time = t
          w.player.x = from.x
          w.player.z = from.z
          const shot = sys.spawnPlayerShot('charge3', from.x, from.y, from.z, d.x, d.y, d.z, 10, false, null)
          let last = ''
          for (let n = 0; n < 60 * 12 && downs.n === before; n++) {
            t += DT
            w.time = t
            city.update(t)
            if (shot.active) last = `${[shot.x, shot.y, shot.z].map(c => c.toFixed(0))} sky ${!!shot.sky} life ${shot.life.toFixed(2)}`
            sys.update(DT)
          }
          expect(downs.n, `${name}: the ${kind} at ${aim.toArray().map(c => c.toFixed(0))} from ${from.toArray().map(c => c.toFixed(0))}, shot last ${last}`).toBe(before + 1)
          done = true
        }
        expect(done, `${name}: no ${kind} with a clear line ${why.slice(0, 4).join(' | ')}`).toBe(true)
      }
      city.dispose()
    }, 60_000)
  }

  it('no invisible wall: a shot over a low wall at the level edge is over it; under its top it is not', () => {
    const map = generateStage('blaze', 1)
    const nav = createNav(map)
    // Every solid cell next to the map's edge: a shot just over its visible
    // top passes, one just under it is stopped.
    let checked = 0
    for (let i = 1; i < map.w - 1; i++) {
      const j = 0
      const top = wallTopAt(nav, i, j)
      if (!Number.isFinite(top)) continue
      const x = (i + 0.5) * CELL
      expect(overWalls(nav, x, CELL * 1.5, x, -CELL, top + 0.5, true)).toBe(true)
      expect(overWalls(nav, x, CELL * 1.5, x, -CELL, top - 0.5, true)).toBe(false)
      expect(hasLineOfSight(nav, x, CELL * 1.5, x, -CELL)).toBe(false)
      checked++
    }
    expect(checked).toBeGreaterThan(0)
  })
})
