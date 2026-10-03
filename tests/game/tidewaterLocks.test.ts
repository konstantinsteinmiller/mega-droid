// Tidewater Locks (`world/stages/tide.ts`): the tide sector's story stage —
// up with the tide to the lock gates, down the spillway to the arena. Its
// water (`sim/stages/water.ts`) slows a wading Flux and hurts over his
// chest; the tide rises on the clock, a lock drains when its valve is shot,
// a canal's current pushes.

import { describe, expect, it, vi } from 'vitest'

vi.mock('@/use/useAds', () => ({ showMidgameAd: async () => {} }))
vi.mock('@/use/useAdGate', () => ({ canShowInterstitial: () => false, markInterstitialShown: () => {} }))
vi.mock('@/use/useCrazyGames', () => ({ triggerHappytime: () => {} }))
vi.mock('@/game/engine/app', () => ({ app: { setMode: () => {}, setWanted: () => {} } }))

import { Group, Scene } from 'three'
import { CELL, Cell, cellCenter, type MapData, type WaterZone } from '@/game/world/levelGen'
import { createNav, edgeHeight, STEP_UP, type Nav } from '@/game/world/nav'
import { generateTidewaterLocks } from '@/game/world/stages/tide'
import { STAGE_LENGTH } from '@/game/world/stages'
import { mirrorX, YAW_PX } from '@/game/world/stages/builder'
import { THEMES } from '@/game/world/themes'
import { SECTOR_BY_ID } from '@/game/data/regions'
import type { ClimbBody, ClimbHost } from '@/game/sim/climb'
import { WaterFeature, levelAt, wadeSpeed, DEEP, DROWN_TICK } from '@/game/sim/stages/water'
import type { MoveMod } from '@/game/sim/stageFeatures'
import type { Shot } from '@/game/sim/world'
import type { AtlasLine } from '@/game/sim/atlas'

const SEEDS = Array.from({ length: 32 }, (_, i) => (i * 2654435761 + 1013904223) >>> 0)
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const
const idx = (m: MapData, x: number, z: number) => Math.floor(z / CELL) * m.w + Math.floor(x / CELL)
const standable = (m: MapData, k: number) => m.cell[k] !== Cell.Void && !m.terrain!.pit[k] && !m.navBlock[k]

const reach = (m: MapData): Set<number> => {
  const t = m.terrain!
  const hops = new Map<number, number[]>()
  const hop = (a: number, b: number) => { hops.set(a, [...(hops.get(a) ?? []), b]) }
  const besideStop = (x: number, y: number, z: number): number[] => {
    const out: number[] = []
    const si = Math.floor(x / CELL)
    const sj = Math.floor(z / CELL)
    for (const [di, dj] of DIRS) {
      const k = (sj + dj) * m.w + si + di
      if (!standable(m, k)) continue
      if (Math.abs(edgeHeight(m, si + di, sj + dj, -di, -dj) - y) < 0.3) out.push(k)
    }
    return out
  }
  for (const lf of t.lifts) for (const a of besideStop(lf.ax, lf.ay, lf.az)) for (const b of besideStop(lf.bx, lf.by, lf.bz)) { hop(a, b); hop(b, a) }
  const leapOk = (a: [number, number], b: [number, number]): boolean => {
    const di = b[0] - a[0]
    const dj = b[1] - a[1]
    const ka = a[1] * m.w + a[0]
    const kb = b[1] * m.w + b[0]
    const mid = (a[1] + dj / 2) * m.w + a[0] + di / 2
    return standable(m, ka) && standable(m, kb) && !!t.pit[mid] && m.cell[mid] !== Cell.Void && !t.ramp[ka] && !t.ramp[kb] && t.floor[ka] === t.floor[kb]
  }
  const seen = new Set<number>()
  const stack = [idx(m, m.start.x, m.start.z)]
  while (stack.length) {
    const k = stack.pop()!
    if (seen.has(k)) continue
    seen.add(k)
    const i = k % m.w
    const j = (k - i) / m.w
    for (const [di, dj] of DIRS) {
      const nk = (j + dj) * m.w + i + di
      if (standable(m, nk) && edgeHeight(m, i + di, j + dj, -di, -dj) - edgeHeight(m, i, j, di, dj) <= STEP_UP) stack.push(nk)
      if (leapOk([i, j], [i + 2 * di, j + 2 * dj])) stack.push((j + 2 * dj) * m.w + i + 2 * di)
    }
    for (const nk of hops.get(k) ?? []) stack.push(nk)
  }
  return seen
}

const body = (x: number, z: number, y = 0): ClimbBody => ({
  x, z, y, vx: 0, vz: 0, vy: 0, yaw: YAW_PX, ground: true, ladder: -1, plat: -1, air: 0, safeY: y, mantle: 0, mx: 0, mz: 0, path: null
})

const hostFor = (map: MapData, said: AtlasLine[] = [], sfx: string[] = [], hits: number[] = []): ClimbHost & { nav: Nav } => {
  const scene = new Scene()
  const noop = () => {}
  return {
    nav: createNav(map), map, theme: THEMES.tide,
    combat: { maxHp: 100 } as ClimbHost['combat'],
    fx: { sparks: noop, riseRing: noop, emit: noop } as unknown as ClimbHost['fx'],
    markers: { spawn: noop } as unknown as ClimbHost['markers'],
    shocks: { spawn: noop } as unknown as ClimbHost['shocks'],
    hitPlayer: (_e, dmg) => { hits.push(dmg); return 'hit' }, sfx: (n: string) => { sfx.push(n) }, shake: noop, onPickup: noop, propParent: () => scene,
    scene, time: 0, level: { root: new Group(), rooms: [], sky: null as never, bounds: [], owner: new Int16Array(0) },
    enemyLevel: 1, encounters: SECTOR_BY_ID.tide.encounters, addEnemy: noop,
    say: (l) => { said.push(l) }
  }
}

describe('generateTidewaterLocks', () => {
  it('is deterministic for a seed', () => {
    for (const seed of [0, 4242, SEEDS[5]!]) {
      const a = generateTidewaterLocks(seed)
      const b = generateTidewaterLocks(seed)
      expect(JSON.stringify(a.rooms)).toBe(JSON.stringify(b.rooms))
      expect(Array.from(a.terrain!.floor)).toEqual(Array.from(b.terrain!.floor))
      expect(JSON.stringify(a.terrain!.water)).toBe(JSON.stringify(b.terrain!.water))
    }
  })

  it('twelve sections and the arena; the seed varies the hand and the tide, never the route', () => {
    const mirrored = new Set<boolean>()
    const tides = new Set<number>()
    for (const seed of SEEDS) {
      const m = generateTidewaterLocks(seed)
      const t = m.terrain!
      expect(t.sections.slice(0, (m.beam ? -1 : 0) + (m.exit ? -1 : 0) || undefined)).toEqual(
        ['dock', 'water', 'water', 'lift', 'water', 'islands', 'conveyor', 'hall', 'islands', 'descent', 'hall', 'hall', 'arena'])
      expect(t.sections.length - 1 - ((m.beam ? 1 : 0) + (m.exit ? 1 : 0))).toBe(STAGE_LENGTH.tide)
      mirrored.add(m.start.x > m.w * CELL / 2)
      tides.add(Math.round(t.water!.find(z => z.period && z.room === 2)!.period! * 100))
      expect(t.water!.filter(z => z.valve).length).toBe(1)
      expect(t.water!.filter(z => z.strength).length).toBeGreaterThanOrEqual(5)
    }
    expect(mirrored.size).toBe(2)
    expect(tides.size).toBeGreaterThan(4)
  })

  it('ends at a 7 × 7 arena at y = 0 behind the one boss shutter, a shallow tide in it', () => {
    for (const seed of SEEDS.slice(0, 8)) {
      const m = generateTidewaterLocks(seed)
      const arena = m.rooms.find(r => r.role === 'boss')!
      expect([arena.w, arena.h]).toEqual([7, 7])
      for (let j = arena.z0; j < arena.z0 + arena.h; j++) for (let i = arena.x0; i < arena.x0 + arena.w; i++) expect(m.terrain!.floor[j * m.w + i]).toBe(0)
      expect(m.doors.filter(d => d.boss).length).toBe(1)
      const z = m.terrain!.water!.find(w => w.room === arena.id)!
      expect(z.hi).toBeLessThan(DEEP)
    }
  })

  it('the verbs (and the buoys) reach the boss shutter, the weapon and every checkpoint', () => {
    for (const seed of SEEDS.slice(0, 8)) {
      const m = generateTidewaterLocks(seed)
      const t = m.terrain!
      const got = reach(m)
      const door = m.doors.find(d => d.boss)!
      expect(got.has(door.j * m.w + door.i), `seed ${seed}: boss door`).toBe(true)
      const weapon = t.rewards.find(r => r.kind === 'weapon')!
      expect(got.has(idx(m, weapon.x, weapon.z))).toBe(true)
      for (const c of t.checkpoints) expect(got.has(idx(m, c.x, c.z)), `seed ${seed}: checkpoint`).toBe(true)
      const lifts = t.lifts
      t.lifts = []
      expect(reach(m).has(door.j * m.w + door.i)).toBe(false)
      t.lifts = lifts
    }
  })

  it('every leap gap is one cell between equal floors', () => {
    for (const seed of SEEDS.slice(0, 8)) {
      const m = generateTidewaterLocks(seed)
      const t = m.terrain!
      for (const l of t.links!.filter(x => x.kind === 'leap')) {
        const ka = l.from[1] * m.w + l.from[0]
        const kb = l.to[1] * m.w + l.to[0]
        const di = l.to[0] - l.from[0]
        const dj = l.to[1] - l.from[1]
        expect(Math.abs(di) + Math.abs(dj)).toBe(2)
        expect(t.floor[ka]).toBe(t.floor[kb])
        expect(t.pit[(l.from[1] + dj / 2) * m.w + l.from[0] + di / 2]).toBe(1)
      }
    }
  })
})

describe('water', () => {
  const zone = (o: Partial<WaterZone> = {}): WaterZone => ({ i0: 0, j0: 0, i1: 3, j1: 3, lo: 0, hi: 2, room: 0, ...o })

  it('the tide rises, holds high, falls and holds low over its period; a lock is high until drained', () => {
    const z = zone({ period: 10 })
    expect(levelAt(z, 0)).toBeCloseTo(0)
    expect(levelAt(z, 3.5)).toBeCloseTo(2)
    expect(levelAt(z, 4.5)).toBeCloseTo(2)
    expect(levelAt(z, 9.5)).toBeCloseTo(0)
    expect(levelAt(z, 6.5)).toBeGreaterThan(0)
    expect(levelAt(z, 6.5)).toBeLessThan(2)
    const lock = zone({ valve: { i: 0, j: 0, side: 'n' } })
    expect(levelAt(lock, 5)).toBe(2)
    expect(levelAt(lock, 5, true)).toBe(0)
    expect(levelAt(zone(), 7)).toBe(0)
  })

  it('wading slows the walk with depth, never below half', () => {
    expect(wadeSpeed(0.1)).toBe(1)
    expect(wadeSpeed(0.6)).toBeLessThan(1)
    expect(wadeSpeed(0.6)).toBeGreaterThan(wadeSpeed(1.0))
    expect(wadeSpeed(3)).toBeCloseTo(0.5)
  })

  const map = generateTidewaterLocks(0)
  const t = map.terrain!

  it('reaches the walk where Flux wades (and the current pushes), and hurts out of his depth on a tick', () => {
    const hits: number[] = []
    const said: AtlasLine[] = []
    const f = new WaterFeature(hostFor(map, said, [], hits), t)
    const canal = t.water!.find(z => z.strength && z.dx)!
    const y = t.floor[canal.j0 * map.w + canal.i0]!
    const p = body(cellCenter(Math.round((canal.i0 + canal.i1) / 2)), cellCenter(canal.j0), y)
    f.update(1 / 60, 0, p, true)
    const m: MoveMod = { friction: 1, pushX: 0, pushZ: 0, speed: 1 }
    f.move(p, m)
    expect(m.speed!).toBeLessThan(1)
    expect(m.pushX).toBeCloseTo(canal.dx! * canal.strength!)
    expect(hits.length).toBe(0)
    // The lock, flooded: out of his depth.
    const lock = t.water!.find(z => z.valve)!
    const ci = Math.round((lock.i0 + lock.i1) / 2)
    const cj = Math.round((lock.j0 + lock.j1) / 2)
    const deep = body(cellCenter(ci), cellCenter(cj), t.floor[cj * map.w + ci]!)
    for (let n = 0; n < Math.ceil((DROWN_TICK * 2.5) * 60); n++) f.update(1 / 60, n / 60, deep, true)
    expect(hits.length).toBeGreaterThanOrEqual(2)
    expect(said).toContain('hint.tide.deep')
  })

  it('a shot on the valve drains the lock for good (from the room\'s side); it rides in the save', () => {
    const sfx: string[] = []
    const f = new WaterFeature(hostFor(map, [], sfx), t)
    const z = f.zones.find(r => r.def.valve)!
    const shot = (fromX: number, fromZ: number) => ({ px: fromX, py: z.vy, pz: fromZ, x: z.vx, y: z.vy, z: z.vz, radius: 0.15 }) as unknown as Shot
    expect(f.shot(shot(z.vx - z.nx * 2, z.vz - z.nz * 2))).toBe(false)
    expect(f.shot(shot(z.vx + z.nx * 4, z.vz + z.nz * 4))).toBe(true)
    for (let n = 0; n < 600; n++) f.update(1 / 60, n / 60, body(0, 0), true)
    expect(z.level).toBeCloseTo(z.def.lo)
    const g = new WaterFeature(hostFor(map), t)
    g.restore(f.save())
    expect(g.zones.find(r => r.def.valve)!.level).toBeCloseTo(z.def.lo)
    expect(sfx).toContain('door')
  })

  it('the mirror flips the current and the valve\'s wall', () => {
    const m = mirrorX(map)
    m.terrain!.water!.forEach((z, n) => {
      const o = t.water![n]!
      expect(z.i0).toBe(map.w - 1 - o.i1)
      if (o.dx) expect(z.dx).toBe(-o.dx)
      if (o.valve) expect(z.valve!.side).toBe(o.valve.side === 'e' ? 'w' : o.valve.side === 'w' ? 'e' : o.valve.side)
    })
  })
})
