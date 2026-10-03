// Deep Mine (`world/stages/drill.ts`): the drill sector's story stage — from
// the headframe down terraces, a mine elevator and a rockfall tunnel to the
// arena. Boulders are walls; cracked ones give way to a full charge or a
// Drill Bomb (the ice pillars in stone), stalactites drop on a rhythm (the
// icicles in stone).
//
// The route is walked with the player's verbs, boulders standing (their
// cells are out of every path); the caches behind cracked rock are reached
// only once it is broken.

import { describe, expect, it, vi } from 'vitest'

vi.mock('@/use/useAds', () => ({ showMidgameAd: async () => {} }))
vi.mock('@/use/useAdGate', () => ({ canShowInterstitial: () => false, markInterstitialShown: () => {} }))
vi.mock('@/use/useCrazyGames', () => ({ triggerHappytime: () => {} }))
vi.mock('@/game/engine/app', () => ({ app: { setMode: () => {}, setWanted: () => {} } }))

import { Group, Scene } from 'three'
import { CELL, Cell, type MapData } from '@/game/world/levelGen'
import { createNav, edgeHeight, STEP_UP, type Nav } from '@/game/world/nav'
import { generateDeepMine } from '@/game/world/stages/drill'
import { STAGE_LENGTH } from '@/game/world/stages'
import { THEMES } from '@/game/world/themes'
import { SECTOR_BY_ID } from '@/game/data/regions'
import type { ClimbHost } from '@/game/sim/climb'
import { IcePillars } from '@/game/sim/stages/icePillars'
import { Icicles } from '@/game/sim/stages/icicles'
import type { AtlasLine } from '@/game/sim/atlas'

const SEEDS = Array.from({ length: 32 }, (_, i) => (i * 2654435761 + 1013904223) >>> 0)
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const

const idx = (m: MapData, x: number, z: number) => Math.floor(z / CELL) * m.w + Math.floor(x / CELL)

/** Standable: a room cell, no pit, and no boulder standing in it (`open`:
 *  the cracked ones' cells, already broken). */
const standableWith = (open: Set<number>) => (m: MapData, k: number) =>
  m.cell[k] !== Cell.Void && !m.terrain!.pit[k] && (!m.navBlock[k] || open.has(k))

const reach = (m: MapData, open = new Set<number>()): Set<number> => {
  const standable = standableWith(open)
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
  for (const lf of t.lifts) {
    for (const a of besideStop(lf.ax, lf.ay, lf.az)) for (const b of besideStop(lf.bx, lf.by, lf.bz)) { hop(a, b); hop(b, a) }
  }
  const leapOk = (a: [number, number], b: [number, number]): boolean => {
    const di = b[0] - a[0]
    const dj = b[1] - a[1]
    const ka = a[1] * m.w + a[0]
    const kb = b[1] * m.w + b[0]
    const mid = (a[1] + dj / 2) * m.w + a[0] + di / 2
    return standable(m, ka) && standable(m, kb) && !!t.pit[mid] && m.cell[mid] !== Cell.Void &&
      !t.ramp[ka] && !t.ramp[kb] && t.floor[ka] === t.floor[kb]
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

const hostFor = (map: MapData, said: AtlasLine[] = [], sfx: string[] = []): ClimbHost & { nav: Nav } => {
  const scene = new Scene()
  const noop = () => {}
  return {
    nav: createNav(map), map, theme: THEMES.drill,
    combat: { maxHp: 100 } as ClimbHost['combat'],
    fx: { sparks: noop, riseRing: noop, emit: noop } as unknown as ClimbHost['fx'],
    markers: { spawn: noop } as unknown as ClimbHost['markers'],
    shocks: { spawn: noop } as unknown as ClimbHost['shocks'],
    hitPlayer: () => 'hit', sfx: (n: string) => { sfx.push(n) }, shake: noop, onPickup: noop, propParent: () => scene,
    scene, time: 0, level: { root: new Group(), rooms: [], sky: null as never, bounds: [], owner: new Int16Array(0) },
    enemyLevel: 1, encounters: SECTOR_BY_ID.drill.encounters, addEnemy: noop,
    say: (l) => { said.push(l) }
  }
}

describe('generateDeepMine', () => {
  it('is deterministic for a seed', () => {
    for (const seed of [0, 4242, SEEDS[5]!]) {
      const a = generateDeepMine(seed)
      const b = generateDeepMine(seed)
      expect(JSON.stringify(a.rooms)).toBe(JSON.stringify(b.rooms))
      expect(Array.from(a.terrain!.floor)).toEqual(Array.from(b.terrain!.floor))
      expect(JSON.stringify(a.terrain!.icicles)).toBe(JSON.stringify(b.terrain!.icicles))
      expect(a.start).toEqual(b.start)
    }
  })

  it('eleven sections and the arena, from the headframe down to y = 0; the seed varies the hand and the rhythm', () => {
    const mirrored = new Set<boolean>()
    const beats = new Set<number>()
    for (const seed of SEEDS) {
      const m = generateDeepMine(seed)
      const t = m.terrain!
      expect(t.sections.slice(0, (m.beam ? -1 : 0) + (m.exit ? -1 : 0) || undefined)).toEqual(
        ['dock', 'hall', 'descent', 'lift', 'icicles', 'islands', 'hall', 'hall', 'descent', 'hall', 'hall', 'arena'])
      expect(t.sections.length - 1 - ((m.beam ? 1 : 0) + (m.exit ? 1 : 0))).toBe(STAGE_LENGTH.drill)
      mirrored.add(m.start.x > m.w * CELL / 2)
      beats.add(Math.round(t.icicles![0]!.period * 100))
      const start = t.floor[idx(m, m.start.x, m.start.z)]!
      expect(start).toBe(18)
      expect(t.icePillars!.filter(p => p.cracked).length).toBe(6)
    }
    expect(mirrored.size).toBe(2)
    expect(beats.size).toBeGreaterThan(4)
  })

  it('ends at a 7 × 7 arena at y = 0 behind the one boss shutter, rock falling in it', () => {
    for (const seed of SEEDS.slice(0, 8)) {
      const m = generateDeepMine(seed)
      const arena = m.rooms.find(r => r.role === 'boss')!
      expect([arena.w, arena.h]).toEqual([7, 7])
      for (let j = arena.z0; j < arena.z0 + arena.h; j++) for (let i = arena.x0; i < arena.x0 + arena.w; i++) expect(m.terrain!.floor[j * m.w + i]).toBe(0)
      expect(m.doors.filter(d => d.boss).length).toBe(1)
      expect(m.terrain!.icicles!.filter(c => c.room === arena.id).length).toBe(3)
    }
  })

  it('the route reaches the boss with every boulder standing; the cache and the weapon cave only past cracked rock', () => {
    for (const seed of SEEDS.slice(0, 8)) {
      const m = generateDeepMine(seed)
      const t = m.terrain!
      const got = reach(m)
      const door = m.doors.find(d => d.boss)!
      expect(got.has(door.j * m.w + door.i), `seed ${seed}: boss door`).toBe(true)
      for (const c of t.checkpoints) expect(got.has(idx(m, c.x, c.z)), `seed ${seed}: checkpoint`).toBe(true)
      const weapon = t.rewards.find(r => r.kind === 'weapon')!
      const cache = t.rewards.find(r => r.kind === 'we')!
      expect(got.has(idx(m, weapon.x, weapon.z)), 'weapon sealed').toBe(false)
      expect(got.has(idx(m, cache.x, cache.z)), 'cache sealed').toBe(false)
      const open = new Set(t.icePillars!.filter(p => p.cracked).map(p => p.j * m.w + p.i))
      const broken = reach(m, open)
      expect(broken.has(idx(m, weapon.x, weapon.z)), 'weapon past the rock').toBe(true)
      expect(broken.has(idx(m, cache.x, cache.z)), 'cache past the rock').toBe(true)
    }
  })

  it('the cages carry the route: without them the boss shutter is out of reach', () => {
    const m = generateDeepMine(SEEDS[2]!)
    const lifts = m.terrain!.lifts
    m.terrain!.lifts = []
    const got = reach(m)
    m.terrain!.lifts = lifts
    const door = m.doors.find(d => d.boss)!
    expect(got.has(door.j * m.w + door.i)).toBe(false)
  })

  it('every leap gap is one cell between equal floors', () => {
    for (const seed of SEEDS.slice(0, 8)) {
      const m = generateDeepMine(seed)
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

describe('the mine\'s rock', () => {
  const map = generateDeepMine(0)
  const t = map.terrain!

  it('a cracked boulder chips under quick and level-1 shots and breaks under a full charge; a plain one never', () => {
    const sfx: string[] = []
    const said: AtlasLine[] = []
    const f = new IcePillars(hostFor(map, said, sfx), t)
    const cracked = f.pillars.find(p => p.def.cracked)!
    const plain = f.pillars.find(p => !p.def.cracked)!
    const at = (p: typeof cracked) => [p.x, p.y + 1.2, p.z] as const
    for (const charge of [0, 0, 0, 1, 1]) {
      expect(f.shotHits(...at(cracked), 0.2, charge)).toBe(true)
      expect(cracked.broken).toBe(false)
    }
    expect(f.shotHits(...at(cracked), 0.2, 2)).toBe(true)
    expect(cracked.broken).toBe(true)
    expect(map.navBlock[cracked.k]).toBe(0)
    for (const charge of [0, 1, 2, 3]) f.shotHits(...at(plain), 0.2, charge)
    expect(plain.broken).toBe(false)
    expect(sfx).toContain('guardBreak')
  })

  it('stalactites fall on the drill theme, with the mine\'s own hint', () => {
    const said: AtlasLine[] = []
    const f = new Icicles(hostFor(map, said), t)
    const c = f.icicles[0]!
    f.update(1 / 60, 0, { x: c.x, z: c.z, y: c.def.y } as never, true)
    expect(said).toContain('hint.drill.drop')
  })
})

// ─── The mine cart (#111) ────────────────────────────────────────────────────

import { cellCenter } from '@/game/world/levelGen'
import { groundAt } from '@/game/world/nav'
import { ClimbRun, type ClimbBody } from '@/game/sim/climb'
import { RailFeature } from '@/game/sim/stages/rail'

describe('the mine cart', () => {
  const DT = 1 / 60
  const body = (x: number, z: number, y = 0): ClimbBody => ({
    x, z, y, vx: 0, vz: 0, vy: 0, yaw: 0, ground: true, ladder: -1, plat: -1, air: 0, safeY: y, mantle: 0, mx: 0, mz: 0, path: null
  })
  const step = (run: ClimbRun, p: ClimbBody, time: number): void => {
    run.update(DT, time, p, true)
    const out: [number, number] = [0, 0]
    if (!run.locksMove()) { p.vx = 0; p.vz = 0 }
    run.stepBody(p, out, 0, 0, DT, false)
    p.x = out[0]
    p.z = out[1]
  }

  it('waits where the corridor comes into the chasm, linked to the warren\'s west door, mirror and all', () => {
    for (const seed of SEEDS.slice(0, 8)) {
      const m = generateDeepMine(seed)
      const r = m.terrain!.rails![0]!
      const first = r.points[0]!
      const last = r.points[r.points.length - 1]!
      expect([first.x, first.z]).toEqual([cellCenter(r.boardAt.i), cellCenter(r.boardAt.j)])
      expect([last.x, last.z]).toEqual([cellCenter(r.exitAt.i), cellCenter(r.exitAt.j)])
      expect(m.terrain!.links!.some(l => l.kind === 'rail')).toBe(true)
      // A trestle over the chasm: it climbs, then takes a steep drop.
      expect(Math.max(...r.points.map(p => p.y))).toBeGreaterThan(first.y + 2)
    }
  })

  it('its slot comes after every older one, so old Deep Mine saves keep theirs', () => {
    const m = generateDeepMine(SEEDS[1]!)
    const run = new ClimbRun(hostFor(m), 1)
    expect(run.features.map(f => f.constructor.name)).toEqual(['IcePillars', 'Icicles', 'SecretsFeature', 'CrumbleFeature', 'RailFeature'])
  })

  it('an ore tub on a sleepered track carries Flux to the warren\'s west door, with the mine\'s own lines', () => {
    const m = generateDeepMine(SEEDS[3]!)
    const said: AtlasLine[] = []
    const run = new ClimbRun(hostFor(m, said), 1)
    const rail = run.features.find((f): f is RailFeature => f instanceof RailFeature)!
    const r = m.terrain!.rails![0]!
    const x = cellCenter(r.boardAt.i)
    const z = cellCenter(r.boardAt.j)
    const p = body(x, z, groundAt(m, x, z))
    let time = 0
    let steps = 0
    while (rail.state !== 'done' && steps++ < 60 * 60) step(run, p, (time += DT))
    expect(rail.state).toBe('done')
    expect(steps * DT).toBeGreaterThan(12)
    expect(Math.floor(p.x / CELL)).toBe(r.exitAt.i)
    expect(Math.floor(p.z / CELL)).toBe(r.exitAt.j)
    expect(said).toContain('hint.drill.board')
  })
})
