// Ground machines follow Flux through a stage's corridors (#196). A post used
// to leash its machine to a rectangle of its own platform, so leaving the room
// was a full escape, above all from the slow Guardroid. A machine now keeps to
// the flat, connected floor it stands on: it takes the corridor to the next
// patch, but never a pit, a ledge or a staircase.

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/game/fx/markers', async () => {
  const { Mesh, Group } = await import('three')
  return { makeBlobShadow: () => new Mesh(), makeTeleRing: () => new Group(), setTeleRing: () => {} }
})
vi.mock('@/game/world/textures', async (orig) => {
  const { Texture } = await import('three')
  return { ...(await orig<object>()), levelAtlas: () => new Texture(), glowTexture: () => new Texture(), ringTexture: () => new Texture() }
})

import { createEnemy, updateEnemy, wake, keepClear } from '@/game/sim/enemies'
import { keepOnRegion, onRegion, roamRegions, roams } from '@/game/sim/roam'
import { createNav, findPath } from '@/game/world/nav'
import { generateStage, isStageSector } from '@/game/world/stages'
import { CELL, type MapData } from '@/game/world/levelGen'
import type { Enemy, World } from '@/game/sim/world'
import type { SectorId } from '@/game/world/themes'

const DT = 1 / 60
const noop = (): void => {}

beforeEach(() => {
  let seed = 0x196
  const dice = vi.spyOn(Math, 'random').mockImplementation(() => {
    seed = (Math.imul(seed ^ (seed >>> 15), 2246822507) + 0x9e3779b9) >>> 0
    return seed / 4294967296
  })
  return () => dice.mockRestore()
})

const worldOf = (map: MapData, e: Enemy, px: number, pz: number): World => ({
  map, nav: createNav(map), time: 0,
  player: { x: px, z: pz, y: 0, yaw: 0, pitch: 0 },
  combat: { iframes: 1e9, charging: false, charge: 0 } as unknown as World['combat'],
  enemies: [e],
  fx: { sparks: noop, emit: noop, orbBurst: noop, flash: noop, riseRing: noop } as unknown as World['fx'],
  markers: { spawn: noop } as unknown as World['markers'],
  shocks: { spawn: noop, spawnLinear: noop } as unknown as World['shocks'],
  fireEnemyShot: noop, lobShell: noop, spawnWave: noop, spawnRing: noop, fireOrb: noop,
  pull: noop, slowPlayer: noop,
  hitPlayer: () => 'miss', shake: noop, sfx: noop
})

const SECTORS: SectorId[] = ['blaze', 'cryo', 'volt', 'gale', 'magnet', 'drill', 'tide', 'neon', 'rotor']

/** A ground post's machine, the way `spawnClimb` places it. */
const machineAt = (map: MapData, n: number, kind: 'brute' | 'hardhat' | 'trooper'): Enemy => {
  const f = map.terrain!.foes.filter(o => o.role === 'ground')[n]!
  const e = createEnemy(kind, 1, f.x, f.z, f.room)
  e.floor = f.y
  e.leash = f.leash
  return e
}

/** Further than `by` metres from the post's rectangle. */
const outside = (e: Enemy, x: number, z: number, by = 6): boolean => {
  const l = e.leash!
  return Math.hypot(Math.max(l[0] - x, 0, x - l[2]), Math.max(l[1] - z, 0, z - l[3])) > by
}

describe('which machines roam', () => {
  it('walkers do; turrets, flyers, crates and rooted posts keep their rectangle', () => {
    const map = generateStage('blaze', 1)
    const e = machineAt(map, 0, 'brute')
    expect(roams(e)).toBe(true)
    expect(roams({ ...e, hover: [1, 2] } as Enemy)).toBe(false)
    expect(roams(createEnemy('turret', 1, e.x, e.z, e.room, {}) as Enemy)).toBe(false)
    expect(roams({ ...e, rooted: true } as Enemy)).toBe(false)
  })
})

describe('the floor a walker may stand on', () => {
  it.each(SECTORS.filter(isStageSector))('%s: never a pit, a ramp, a wall or another height', (sector) => {
    const map = generateStage(sector, 3)
    const t = map.terrain!
    const ids = roamRegions(map)
    for (let k = 0; k < ids.length; k++) {
      if (ids[k]! < 0) continue
      expect(t.pit[k]).toBe(0)
      expect(t.ramp[k]).toBe(0)
    }
  })
})

/** Chase every sector's first few ground posts to a spot past their rectangle; how many got there. */
const chase = (sector: SectorId, leashed: boolean): { tried: number; reached: number } => {
    const map = generateStage(sector, 3)
    const ids = roamRegions(map)
    const posts = map.terrain!.foes.filter(f => f.role === 'ground')
    let tried = 0
    let reached = 0
    for (let n = 0; n < posts.length && tried < 4; n++) {
      const e = machineAt(map, n, 'brute')
      const nav = createNav(map)
      const k0 = Math.floor(e.z / CELL) * map.w + Math.floor(e.x / CELL)
      const reg = ids[k0]!
      if (reg < 0) continue
      // A spot of the same floor, outside the post's rectangle, with a walk to it.
      let goal: [number, number] | null = null
      for (let k = 0; k < ids.length && !goal; k++) {
        if (ids[k] !== reg) continue
        const x = ((k % map.w) + 0.5) * CELL
        const z = (Math.floor(k / map.w) + 0.5) * CELL
        if (!outside(e, x, z) || Math.hypot(x - e.x, z - e.z) < 12 || Math.hypot(x - e.x, z - e.z) > 30) continue
        if (findPath(nav, e.x, e.z, x, z, 1400)) goal = [x, z]
      }
      if (!goal) continue
      tried++
      const w = worldOf(map, e, goal[0], goal[1])
      wake(w, e, false)
      for (let t = 0; t < 60 * 120; t++) {
        w.time += DT
        updateEnemy(w, e, DT)
        if (leashed) {
          e.x = Math.max(e.leash![0], Math.min(e.leash![2], e.x))
          e.z = Math.max(e.leash![1], Math.min(e.leash![3], e.z))
        } else keepOnRegion(map, e)
        keepClear(w, e)
        // Never off the floor it is joined to
        if (!leashed && e.roam! >= 0) expect(onRegion(map, e.roam!, e.x, e.z, 0)).toBe(true)
      }
      if (Math.hypot(e.x - w.player.x, e.z - w.player.z) < 4) reached++
    }
  return { tried, reached }
}

describe('the chase', () => {
  it('with the old rectangle leash no machine ever got to Flux; now they do, and never leave the floor', () => {
    let tried = 0
    let now = 0
    let old = 0
    for (const sector of SECTORS.filter(isStageSector)) {
      const a = chase(sector, false)
      const b = chase(sector, true)
      tried += a.tried
      now += a.reached
      old += b.reached
    }
    expect(tried).toBeGreaterThan(8)
    expect(old).toBe(0)
    expect(now).toBeGreaterThanOrEqual(Math.ceil(tried * 0.6))
  }, 300_000)

  it('across the stages, some posts really do reach past their old rectangle', () => {
    let beyond = 0
    for (const sector of SECTORS.filter(isStageSector)) {
      const map = generateStage(sector, 3)
      const ids = roamRegions(map)
      for (const f of map.terrain!.foes) {
        if (f.role !== 'ground') continue
        const reg = ids[Math.floor(f.z / CELL) * map.w + Math.floor(f.x / CELL)]!
        if (reg < 0) continue
        for (let k = 0; k < ids.length; k++) {
          if (ids[k] !== reg) continue
          const x = ((k % map.w) + 0.5) * CELL
          const z = (Math.floor(k / map.w) + 0.5) * CELL
          if (x < f.leash[0] || x > f.leash[2] || z < f.leash[1] || z > f.leash[3]) { beyond++; break }
        }
      }
    }
    expect(beyond).toBeGreaterThan(10)
  })
})
