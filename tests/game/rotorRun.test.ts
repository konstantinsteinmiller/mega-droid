// Rotor Run (`world/stages/rotor.ts`): the rotor sector's story stage — a sky
// airfield round a quadcopter flight (the Rail Rush's ride on this theme:
// no track, a quadcopter for a cart, hornets in waves), with crosswinds,
// shuttle drones, bobbing drones and a wind tunnel.

import { describe, expect, it, vi } from 'vitest'

vi.mock('@/use/useAds', () => ({ showMidgameAd: async () => {} }))
vi.mock('@/use/useAdGate', () => ({ canShowInterstitial: () => false, markInterstitialShown: () => {} }))
vi.mock('@/use/useCrazyGames', () => ({ triggerHappytime: () => {} }))
vi.mock('@/game/engine/app', () => ({ app: { setMode: () => {}, setWanted: () => {} } }))

import { Group, Scene } from 'three'
import { CELL, Cell, type MapData } from '@/game/world/levelGen'
import { createNav, edgeHeight, STEP_UP, type Nav } from '@/game/world/nav'
import { generateRotorRun } from '@/game/world/stages/rotor'
import { STAGE_LENGTH } from '@/game/world/stages'
import { THEMES } from '@/game/world/themes'
import { SECTOR_BY_ID } from '@/game/data/regions'
import type { ClimbHost } from '@/game/sim/climb'
import { RailFeature } from '@/game/sim/stages/rail'
import type { AtlasLine } from '@/game/sim/atlas'

const SEEDS = Array.from({ length: 32 }, (_, i) => (i * 2654435761 + 1013904223) >>> 0)
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const
const idx = (m: MapData, x: number, z: number) => Math.floor(z / CELL) * m.w + Math.floor(x / CELL)
const standable = (m: MapData, k: number) => m.cell[k] !== Cell.Void && !m.terrain!.pit[k] && !m.navBlock[k]

/** The route with the verbs, the lifts and the flight (its link is a hop). */
const reach = (m: MapData, o: { lifts?: boolean; rail?: boolean } = {}): Set<number> => {
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
  if (o.lifts !== false) for (const lf of t.lifts) for (const a of besideStop(lf.ax, lf.ay, lf.az)) for (const b of besideStop(lf.bx, lf.by, lf.bz)) { hop(a, b); hop(b, a) }
  if (o.rail !== false) for (const r of t.rails ?? []) hop(r.boardAt.j * m.w + r.boardAt.i, r.exitAt.j * m.w + r.exitAt.i)
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

const hostFor = (map: MapData, said: AtlasLine[] = []): ClimbHost & { nav: Nav } => {
  const scene = new Scene()
  const noop = () => {}
  return {
    nav: createNav(map), map, theme: THEMES.rotor,
    combat: { maxHp: 100 } as ClimbHost['combat'],
    fx: { sparks: noop, riseRing: noop, emit: noop } as unknown as ClimbHost['fx'],
    markers: { spawn: noop } as unknown as ClimbHost['markers'],
    shocks: { spawn: noop } as unknown as ClimbHost['shocks'],
    hitPlayer: () => 'hit', sfx: noop, shake: noop, onPickup: noop, propParent: () => scene,
    scene, time: 0, level: { root: new Group(), rooms: [], sky: null as never, bounds: [], owner: new Int16Array(0) },
    enemyLevel: 1, encounters: SECTOR_BY_ID.rotor.encounters, addEnemy: noop,
    say: (l) => { said.push(l) }
  }
}

describe('generateRotorRun', () => {
  it('is deterministic for a seed', () => {
    for (const seed of [0, 4242, SEEDS[5]!]) {
      const a = generateRotorRun(seed)
      const b = generateRotorRun(seed)
      expect(JSON.stringify(a.rooms)).toBe(JSON.stringify(b.rooms))
      expect(JSON.stringify(a.terrain!.rails)).toBe(JSON.stringify(b.terrain!.rails))
    }
  })

  it('thirteen sections and the arena over open sky; the seed varies the hand and the timing', () => {
    const mirrored = new Set<boolean>()
    const pace = new Set<number>()
    for (const seed of SEEDS) {
      const m = generateRotorRun(seed)
      const t = m.terrain!
      expect(t.sections.slice(0, (m.beam ? -1 : 0) + (m.exit ? -1 : 0) || undefined)).toEqual(
        ['dock', 'islands', 'shuttle', 'hall', 'lift', 'cart', 'rail', 'wind', 'hall', 'islands', 'descent', 'hall', 'hall', 'arena'])
      expect(t.sections.length - 1 - ((m.beam ? 1 : 0) + (m.exit ? 1 : 0))).toBe(STAGE_LENGTH.rotor)
      expect(t.clouds).toBe(true)
      expect(t.waves!.every(w => w.kind === 'hornet')).toBe(true)
      mirrored.add(m.start.x > m.w * CELL / 2)
      pace.add(Math.round(t.rails![0]!.speed * 100))
      const arena = m.rooms.find(r => r.role === 'boss')!
      expect([arena.w, arena.h]).toEqual([7, 7])
    }
    expect(mirrored.size).toBe(2)
    expect(pace.size).toBeGreaterThan(4)
  })

  it('the flight, the shuttles and the drones carry the route to the boss shutter; the weapon on a side leap', () => {
    for (const seed of SEEDS.slice(0, 8)) {
      const m = generateRotorRun(seed)
      const t = m.terrain!
      const door = m.doors.find(d => d.boss)!
      const dk = door.j * m.w + door.i
      const got = reach(m)
      expect(got.has(dk), `seed ${seed}: boss door`).toBe(true)
      for (const c of t.checkpoints) expect(got.has(idx(m, c.x, c.z)), `seed ${seed}: checkpoint`).toBe(true)
      const weapon = t.rewards.find(r => r.kind === 'weapon')!
      expect(got.has(idx(m, weapon.x, weapon.z))).toBe(true)
      expect(reach(m, { rail: false }).has(dk)).toBe(false)
      expect(reach(m, { lifts: false }).has(dk)).toBe(false)
    }
  })

  it('the flight stays inside its open span (the quadcopter never brushes a wall)', () => {
    for (const seed of SEEDS.slice(0, 8)) {
      const m = generateRotorRun(seed)
      const r = m.terrain!.rails![0]!
      const span = m.rooms[r.room]!
      for (const p of r.points) {
        expect(p.x - span.x0 * CELL, `seed ${seed}`).toBeGreaterThan(2.9)
        expect((span.x0 + span.w) * CELL - p.x).toBeGreaterThan(2.9)
        expect(p.z - span.z0 * CELL).toBeGreaterThan(1.4)
        expect((span.z0 + span.h) * CELL - p.z).toBeGreaterThan(2.9)
      }
    }
  })
})

describe('the quadcopter', () => {
  it('on the rotor theme the ride has no track, four rotors and its own lines', () => {
    const map = generateRotorRun(0)
    const said: AtlasLine[] = []
    const f = new RailFeature(hostFor(map, said), map.terrain!.rails![0]!)
    const rail = (f as unknown as { rail: { root: Group } }).rail
    const cart = (f as unknown as { cart: { rotors?: Group[] } }).cart
    expect(rail.root.visible).toBe(false)
    expect(cart.rotors?.length).toBe(4)
  })
})
