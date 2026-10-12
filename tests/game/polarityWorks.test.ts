// Polarity Works (`world/stages/magnet.ts`): the magnet sector's story stage —
// magnet rails (`sim/stages/magnet.ts`) that drag Flux along, polarity
// panels that flip them, rails that flip on the clock, and the leaps,
// shuttles and crumbling slabs of the earlier stages.
//
// The route is walked with the player's verbs (walk up a step, drop down,
// ladders, lifts between their stops, a leap over a ONE-cell gap between
// equal floors), so a section the verbs cannot reach fails the build. The
// rails' rules are pinned with numbers.

import { describe, expect, it, vi } from 'vitest'

vi.mock('@/use/useAds', () => ({ showMidgameAd: async () => {} }))
vi.mock('@/use/useAdGate', () => ({ canShowInterstitial: () => false, markInterstitialShown: () => {} }))
vi.mock('@/use/useCrazyGames', () => ({ triggerHappytime: () => {} }))
vi.mock('@/game/engine/app', () => ({ app: { setMode: () => {}, setWanted: () => {} } }))

import { Group, Scene } from 'three'
import { CELL, Cell, cellCenter, type MapData } from '@/game/world/levelGen'
import { createNav, edgeHeight, STEP_UP, type Nav } from '@/game/world/nav'
import { generatePolarityWorks } from '@/game/world/stages/magnet'
import { STAGE_LENGTH } from '@/game/world/stages'
import { mirrorX, YAW_PX } from '@/game/world/stages/builder'
import { THEMES } from '@/game/world/themes'
import { SECTOR_BY_ID } from '@/game/data/regions'
import type { ClimbBody, ClimbHost } from '@/game/sim/climb'
import { MagnetFeature, clockSign, flipSoon, FLIP_WARN } from '@/game/sim/stages/magnet'
import type { MoveMod } from '@/game/sim/stageFeatures'
import type { Shot } from '@/game/sim/world'
import type { AtlasLine } from '@/game/sim/atlas'

const SEEDS = Array.from({ length: 32 }, (_, i) => (i * 2654435761 + 1013904223) >>> 0)
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const

const idx = (m: MapData, x: number, z: number) => Math.floor(z / CELL) * m.w + Math.floor(x / CELL)
const standable = (m: MapData, k: number) => m.cell[k] !== Cell.Void && !m.terrain!.pit[k]

const besideStop = (m: MapData, x: number, y: number, z: number): number[] => {
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

const leapOk = (m: MapData, a: [number, number], b: [number, number]): boolean => {
  const t = m.terrain!
  const di = b[0] - a[0]
  const dj = b[1] - a[1]
  if (!((Math.abs(di) === 2 && dj === 0) || (Math.abs(dj) === 2 && di === 0))) return false
  const ka = a[1] * m.w + a[0]
  const kb = b[1] * m.w + b[0]
  const mid = (a[1] + dj / 2) * m.w + a[0] + di / 2
  return standable(m, ka) && standable(m, kb) && !!t.pit[mid] && m.cell[mid] !== Cell.Void &&
    !t.ramp[ka] && !t.ramp[kb] && t.floor[ka] === t.floor[kb]
}

/** Every cell reachable from the pad with the player's verbs (the map data
 *  alone): walks, drops, ladders, lifts and one-cell leaps. */
const reach = (m: MapData, from = idx(m, m.start.x, m.start.z)): Set<number> => {
  const t = m.terrain!
  const hops = new Map<number, number[]>()
  const hop = (a: number, b: number) => { hops.set(a, [...(hops.get(a) ?? []), b]) }
  for (const L of t.ladders) {
    const foot = L.j * m.w + L.i
    const top = (L.j + L.dj) * m.w + L.i + L.di
    hop(foot, top)
    hop(top, foot)
  }
  for (const lf of t.lifts) {
    for (const a of besideStop(m, lf.ax, lf.ay, lf.az)) {
      for (const b of besideStop(m, lf.bx, lf.by, lf.bz)) { hop(a, b); hop(b, a) }
    }
  }
  const seen = new Set<number>()
  const stack = [from]
  while (stack.length) {
    const k = stack.pop()!
    if (seen.has(k)) continue
    seen.add(k)
    const i = k % m.w
    const j = (k - i) / m.w
    for (const [di, dj] of DIRS) {
      const nk = (j + dj) * m.w + i + di
      if (standable(m, nk) && edgeHeight(m, i + di, j + dj, -di, -dj) - edgeHeight(m, i, j, di, dj) <= STEP_UP) stack.push(nk)
      if (leapOk(m, [i, j], [i + 2 * di, j + 2 * dj])) stack.push((j + 2 * dj) * m.w + i + 2 * di)
    }
    for (const nk of hops.get(k) ?? []) stack.push(nk)
  }
  return seen
}

const body = (x: number, z: number, y = 0): ClimbBody => ({
  x, z, y, vx: 0, vz: 0, vy: 0, yaw: YAW_PX, ground: true, ladder: -1, plat: -1, air: 0, safeY: y, mantle: 0, mx: 0, mz: 0, path: null
})

const hostFor = (map: MapData, said: AtlasLine[] = [], sfx: string[] = []): ClimbHost & { nav: Nav } => {
  const scene = new Scene()
  const noop = () => {}
  return {
    nav: createNav(map), map, theme: THEMES.magnet,
    combat: { maxHp: 100 } as ClimbHost['combat'],
    fx: { sparks: noop, riseRing: noop, emit: noop } as unknown as ClimbHost['fx'],
    markers: { spawn: noop } as unknown as ClimbHost['markers'],
    shocks: { spawn: noop } as unknown as ClimbHost['shocks'],
    hitPlayer: () => 'hit', sfx: (n: string) => { sfx.push(n) }, shake: noop, onPickup: noop, propParent: () => scene,
    scene, time: 0, level: { root: new Group(), rooms: [], sky: null as never, bounds: [], owner: new Int16Array(0) },
    enemyLevel: 1, encounters: SECTOR_BY_ID.magnet.encounters, addEnemy: noop,
    say: (l) => { said.push(l) }
  }
}

const mod = (): MoveMod => ({ friction: 1, pushX: 0, pushZ: 0 })

// ─── The level ───────────────────────────────────────────────────────────────

describe('generatePolarityWorks', () => {
  it('is deterministic for a seed (a resumed stage rebuilds the same works)', () => {
    for (const seed of [0, 4242, SEEDS[5]!]) {
      const a = generatePolarityWorks(seed)
      const b = generatePolarityWorks(seed)
      expect(JSON.stringify(a.rooms)).toBe(JSON.stringify(b.rooms))
      expect(Array.from(a.terrain!.floor)).toEqual(Array.from(b.terrain!.floor))
      expect(Array.from(a.terrain!.pit)).toEqual(Array.from(b.terrain!.pit))
      expect(JSON.stringify(a.terrain!.magnets)).toBe(JSON.stringify(b.terrain!.magnets))
      expect(a.start).toEqual(b.start)
    }
  })

  it('ten sections and the arena; the seed varies the hand and the clock rails, never the route', () => {
    const mirrored = new Set<boolean>()
    const clocks = new Set<number>()
    for (const seed of SEEDS) {
      const m = generatePolarityWorks(seed)
      const t = m.terrain!
      expect(t.sections.slice(0, (m.beam ? -1 : 0) + (m.exit ? -1 : 0) + (m.challenge ? -1 : 0) || undefined)).toEqual(
        ['dock', 'magnet', 'islands', 'conveyor', 'hall', 'shuttle', 'magnet', 'islands', 'descent', 'hall', 'arena'])
      expect(t.sections.length - 1 - ((m.beam ? 1 : 0) + (m.exit ? 1 : 0) + (m.challenge ? 1 : 0))).toBe(STAGE_LENGTH.magnet)
      mirrored.add(m.start.x > m.w * CELL / 2)
      clocks.add(Math.round(t.magnets!.find(r => r.every && r.room === 3)!.every! * 100))
      // Panels on three rails; the arena's two flip on the clock.
      expect(t.magnets!.filter(r => r.panel).length).toBe(3)
      const arena = m.rooms.find(r => r.role === 'boss')!
      expect(t.magnets!.filter(r => r.room === arena.id && r.every).length).toBe(2)
    }
    expect(mirrored.size).toBe(2)
    expect(clocks.size).toBeGreaterThan(4)
  })

  it('ends at a 7 × 7 arena at y = 0 behind the one boss shutter', () => {
    for (const seed of SEEDS.slice(0, 8)) {
      const m = generatePolarityWorks(seed)
      const t = m.terrain!
      const arena = m.rooms.find(r => r.role === 'boss')!
      expect([arena.w, arena.h]).toEqual([7, 7])
      for (let j = arena.z0; j < arena.z0 + arena.h; j++) {
        for (let i = arena.x0; i < arena.x0 + arena.w; i++) {
          const k = j * m.w + i
          expect(t.floor[k]).toBe(0)
          expect(t.pit[k]).toBe(0)
        }
      }
      const doors = m.doors.filter(d => d.boss)
      expect(doors.length).toBe(1)
      expect(doors[0]!.to).toBe(arena.id)
    }
  })

  it('every leap gap is exactly one cell between equal floors', () => {
    for (const seed of SEEDS) {
      const m = generatePolarityWorks(seed)
      const leaps = m.terrain!.links!.filter(l => l.kind === 'leap')
      expect(leaps.length).toBeGreaterThanOrEqual(12)
      for (const l of leaps) expect(leapOk(m, l.from, l.to), `seed ${seed}: ${l.from} → ${l.to}`).toBe(true)
    }
  })

  it('the verbs reach the boss shutter, the borrowed weapon and a cell of every room', () => {
    for (const seed of SEEDS.slice(0, 8)) {
      const m = generatePolarityWorks(seed)
      const t = m.terrain!
      const got = reach(m)
      const door = m.doors.find(d => d.boss)!
      expect(got.has(door.j * m.w + door.i), `seed ${seed}: boss door`).toBe(true)
      const weapon = t.rewards.find(r => r.kind === 'weapon')!
      expect(got.has(idx(m, weapon.x, weapon.z)), `seed ${seed}: weapon`).toBe(true)
      for (const r of m.rooms) {
        let any = false
        for (let j = r.z0; j < r.z0 + r.h && !any; j++) for (let i = r.x0; i < r.x0 + r.w && !any; i++) any = got.has(j * m.w + i)
        expect(any, `seed ${seed}: room ${r.id}`).toBe(true)
      }
      // Every checkpoint stands on reachable floor.
      for (const c of t.checkpoints) expect(got.has(idx(m, c.x, c.z)), `seed ${seed}: checkpoint`).toBe(true)
    }
  })

  it('the shuttles carry the route: without them the boss shutter is out of reach', () => {
    const m = generatePolarityWorks(SEEDS[2]!)
    const t = m.terrain!
    const lifts = t.lifts
    t.lifts = []
    const got = reach(m)
    t.lifts = lifts
    const door = m.doors.find(d => d.boss)!
    expect(got.has(door.j * m.w + door.i)).toBe(false)
  })
})

// ─── The rails ───────────────────────────────────────────────────────────────

describe('magnet rails', () => {
  const map = generatePolarityWorks(0)
  const t = map.terrain!
  const first = t.magnets![0]!
  const onRail = (r = first) => {
    const i = Math.floor((r.i0 + r.i1) / 2)
    const j = Math.floor((r.j0 + r.j1) / 2)
    return body(cellCenter(i), cellCenter(j), t.floor[j * map.w + i]!)
  }

  it('drag along the rail at its strength, nothing off it or off its floor', () => {
    const f = new MagnetFeature(hostFor(map), t)
    const m = mod()
    f.move(onRail(), m)
    expect(m.pushX).toBeCloseTo(first.dx * first.strength)
    expect(m.pushZ).toBeCloseTo(first.dz * first.strength)
    const off = mod()
    f.move(body(map.start.x, map.start.z, 0), off)
    expect(off.pushX).toBe(0)
    const above = onRail()
    above.y += 3
    const up = mod()
    f.move(above, up)
    expect(up.pushX).toBe(0)
  })

  it('a shot on the panel flips the pull (from the room\'s side only); the state rides in the save', () => {
    const sfx: string[] = []
    const f = new MagnetFeature(hostFor(map, [], sfx), t)
    const p = first.panel!
    const sides = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] } as const
    const [sx, sz] = sides[p.side]
    const px = cellCenter(p.i) + sx * (CELL / 2 - 0.08)
    const pz = cellCenter(p.j) + sz * (CELL / 2 - 0.08)
    const py = t.floor[p.j * map.w + p.i]! + 1.6
    const shot = (fromX: number, fromZ: number) => ({ px: fromX, py, pz: fromZ, x: px, y: py, z: pz, radius: 0.15 }) as unknown as Shot
    // From behind the wall: nothing.
    expect(f.shot(shot(px + sx * 2, pz + sz * 2))).toBe(false)
    expect(f.pullOf(0)).toBe(1)
    // From the room.
    expect(f.shot(shot(px - sx * 4, pz - sz * 4))).toBe(true)
    expect(f.pullOf(0)).toBe(-1)
    const m = mod()
    f.move(onRail(), m)
    expect(m.pushX).toBeCloseTo(-first.dx * first.strength)
    expect(sfx).toContain('energy')
    const saved = f.save()
    const g = new MagnetFeature(hostFor(map), t)
    g.restore(saved)
    expect(g.pullOf(0)).toBe(-1)
  })

  it('a clock rail flips every `every` s, flickering FLIP_WARN before', () => {
    const r = t.magnets!.find(x => x.every)!
    const e = r.every!
    const ph = r.phase ?? 0
    const t0 = e * 4 - ph
    expect(clockSign(r, t0 + 0.01)).toBe(1)
    expect(clockSign(r, t0 + e + 0.01)).toBe(-1)
    expect(flipSoon(r, t0 + e - FLIP_WARN / 2)).toBe(true)
    expect(flipSoon(r, t0 + e / 2 - FLIP_WARN)).toBe(false)
    // The feature follows it (and hums the flip).
    const sfx: string[] = []
    const f = new MagnetFeature(hostFor(map, [], sfx), t)
    const n = t.magnets!.indexOf(r)
    f.update(1 / 60, t0 + 0.01, body(0, 0))
    const a = f.pullOf(n)
    f.update(1 / 60, t0 + e + 0.01, body(0, 0))
    expect(f.pullOf(n)).toBe(-a)
    expect(sfx).toContain('energy')
  })

  it('the mirror flips each rail\'s pull and its panel\'s wall with it', () => {
    const m = mirrorX(map)
    m.terrain!.magnets!.forEach((r, n) => {
      const o = t.magnets![n]!
      expect(r.dx).toBe(-o.dx)
      expect(r.i0).toBe(map.w - 1 - o.i1)
      if (o.panel) {
        expect(r.panel!.i).toBe(map.w - 1 - o.panel.i)
        expect(r.panel!.side).toBe(o.panel.side === 'e' ? 'w' : o.panel.side === 'w' ? 'e' : o.panel.side)
      }
    })
  })
})
