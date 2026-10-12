// Sky Docks (`world/stages/gale.ts`): the gale sector's story stage —
// floating islands over a sea of clouds, dash leaps, shuttles, bobbing
// platforms and a wind tunnel (`sim/stages/wind.ts`).
//
// The route is walked here with exactly the player's verbs (walk up a step,
// drop down anything, ladders, lifts between their stops, and a dash leap
// over a ONE-cell gap between equal floors — never two), so a section the
// verbs cannot reach fails the build. The wind's rules are pinned with
// numbers: it pushes only while it blows, along its direction, never in a
// pillar's lee, and it whistles before it blows.

import { describe, expect, it, vi } from 'vitest'

vi.mock('@/use/useAds', () => ({ showMidgameAd: async () => {} }))
vi.mock('@/use/useAdGate', () => ({ canShowInterstitial: () => false, markInterstitialShown: () => {} }))
vi.mock('@/use/useCrazyGames', () => ({ triggerHappytime: () => {} }))
vi.mock('@/game/engine/app', () => ({ app: { setMode: () => {}, setWanted: () => {} } }))

import { Group, Scene } from 'three'
import { CELL, Cell, cellCenter, type MapData, type WindZone } from '@/game/world/levelGen'
import { createNav, edgeHeight, findPath, groundAt, STEP_UP, type Nav } from '@/game/world/nav'
import { generateSkyDocks } from '@/game/world/stages/gale'
import { STAGE_LENGTH } from '@/game/world/stages'
import { Builder, finish, secretDoorFace, YAW_PX } from '@/game/world/stages/builder'
import { THEMES } from '@/game/world/themes'
import { SECTOR_BY_ID } from '@/game/data/regions'
import { ClimbRun, type ClimbBody, type ClimbHost } from '@/game/sim/climb'
import { WindFeature, gustShare, gustWarning, windPush, windShelter, GUST_WARN } from '@/game/sim/stages/wind'
import type { AtlasLine } from '@/game/sim/atlas'

const SEEDS = Array.from({ length: 32 }, (_, i) => (i * 2654435761 + 1013904223) >>> 0)
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const
const DT = 1 / 60

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

/** A leap the dash can make: two cells apart along an axis, a pit between,
 *  both ends standing at the same (flat) floor. */
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

/**
 * Every cell reachable from the pad with the player's verbs, from the map
 * data alone (not the game's A*): walks, drops, ladders, lifts, and the
 * dash leap over any one-cell gap between equal floors (not only the
 * linked ones — the physics does not read links).
 */
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
    nav: createNav(map), map, theme: THEMES.gale,
    combat: { maxHp: 100 } as ClimbHost['combat'],
    fx: { sparks: noop, riseRing: noop, emit: noop } as unknown as ClimbHost['fx'],
    markers: { spawn: noop } as unknown as ClimbHost['markers'],
    shocks: { spawn: noop } as unknown as ClimbHost['shocks'],
    hitPlayer: () => 'hit', sfx: (n: string) => { sfx.push(n) }, shake: noop, onPickup: noop, propParent: () => scene,
    scene, time: 0, level: { root: new Group(), rooms: [], sky: null as never, bounds: [], owner: new Int16Array(0) },
    enemyLevel: 1, encounters: SECTOR_BY_ID.gale.encounters, addEnemy: noop,
    say: (l) => { said.push(l) }
  }
}

// ─── The level ───────────────────────────────────────────────────────────────

describe('generateSkyDocks', () => {
  it('is deterministic for a seed (a resumed stage rebuilds the same docks)', () => {
    for (const seed of [0, 4242, SEEDS[5]!]) {
      const a = generateSkyDocks(seed)
      const b = generateSkyDocks(seed)
      expect(JSON.stringify(a.rooms)).toBe(JSON.stringify(b.rooms))
      expect(JSON.stringify(a.doors)).toBe(JSON.stringify(b.doors))
      expect(Array.from(a.cell)).toEqual(Array.from(b.cell))
      expect(Array.from(a.terrain!.floor)).toEqual(Array.from(b.terrain!.floor))
      expect(Array.from(a.terrain!.pit)).toEqual(Array.from(b.terrain!.pit))
      const { floor: _f, ramp: _r, rise: _s, pit: _p, ...restA } = a.terrain!
      const { floor: _f2, ramp: _r2, rise: _s2, pit: _p2, ...restB } = b.terrain!
      expect(JSON.stringify(restA)).toBe(JSON.stringify(restB))
      expect(a.start).toEqual(b.start)
    }
  })

  it('nine sections and the arena; the seed varies the hand and the timing, never the route', () => {
    const mirrored = new Set<boolean>()
    const gusts = new Set<number>()
    for (const seed of SEEDS) {
      const m = generateSkyDocks(seed)
      const t = m.terrain!
      expect(t.sections.slice(0, (m.beam ? -1 : 0) + (m.exit ? -1 : 0) + (m.challenge ? -1 : 0) || undefined)).toEqual(['dock', 'islands', 'shuttle', 'wind', 'lift', 'ladder', 'islands', 'descent', 'hall', 'arena'])
      expect(t.sections.length - 1 - ((m.beam ? 1 : 0) + (m.exit ? 1 : 0) + (m.challenge ? 1 : 0))).toBe(STAGE_LENGTH.gale)
      expect(m.w).toBeLessThanOrEqual(48)
      expect(m.h).toBeLessThanOrEqual(40)
      mirrored.add(m.start.x > m.w * CELL / 2)
      gusts.add(Math.round(t.wind![0]!.on * 100))
      // Open sky under the islands: void pits over a cloud sea.
      expect(t.clouds).toBe(true)
      expect(t.pitKind).toBeUndefined()
    }
    expect(mirrored.size).toBe(2)
    expect(gusts.size).toBeGreaterThan(4)
  })

  it('ends at a 7 × 7 arena at y = 0 behind the one boss shutter', () => {
    for (const seed of SEEDS) {
      const m = generateSkyDocks(seed)
      const t = m.terrain!
      const arena = m.rooms.find(r => r.role === 'boss')!
      expect(t.sections[arena.id]).toBe('arena')
      expect([arena.w, arena.h]).toEqual([7, 7])
      for (let j = arena.z0; j < arena.z0 + arena.h; j++) {
        for (let i = arena.x0; i < arena.x0 + arena.w; i++) {
          const k = j * m.w + i
          expect(t.floor[k]).toBe(0)
          expect(t.ramp[k]).toBe(0)
          expect(t.pit[k]).toBe(0)
        }
      }
      const doors = m.doors.filter(d => d.boss)
      expect(doors.length).toBe(1)
      expect(doors[0]!.to).toBe(arena.id)
      expect(t.floor[doors[0]!.j * m.w + doors[0]!.i]).toBe(0)
      expect(t.wallTop[arena.id]).toBeCloseTo(4.2)
    }
  })

  it('every leap gap is exactly one cell between equal floors', () => {
    for (const seed of SEEDS) {
      const m = generateSkyDocks(seed)
      const leaps = m.terrain!.links!.filter(l => l.kind === 'leap')
      expect(leaps.length).toBeGreaterThanOrEqual(8)
      for (const l of leaps) expect(leapOk(m, l.from, l.to), `seed ${seed}: ${l.from} → ${l.to}`).toBe(true)
    }
  })

  it('each linked leap is made by a real slide (the mission\'s rules), landing on its island, never past it', () => {
    for (const seed of [SEEDS[0]!, SEEDS[1]!]) {
      const m = generateSkyDocks(seed)
      const t = m.terrain!
      for (const l of t.links!.filter(x => x.kind === 'leap')) {
        const di = Math.sign(l.to[0] - l.from[0])
        const dj = Math.sign(l.to[1] - l.from[1])
        const y = t.floor[l.from[1] * m.w + l.from[0]]!
        for (const back of [0.2, 1]) {
          for (const stick of [true, false]) {
            const run = new ClimbRun(hostFor(m), 1)
            const p = body(cellCenter(l.from[0]) + di * (1.5 - back), cellCenter(l.from[1]) + dj * (1.5 - back), y)
            const out: [number, number] = [0, 0]
            let slideT = 0.28
            for (let n = 0; n < 240 && !run.pitted; n++) {
              const air = !p.ground && p.ladder < 0 && p.mantle <= 0
              let tx = 0
              let tz = 0
              if (slideT > 0) { slideT -= DT; tx = di * 15; tz = dj * 15 } else if (stick && air) { tx = di * 4.7; tz = dj * 4.7 } else if (air) { tx = p.vx; tz = p.vz }
              const k = slideT > 0 ? 1 : Math.min(1, DT * 16 * (air ? 0.25 : 1))
              p.vx += (tx - p.vx) * k
              p.vz += (tz - p.vz) * k
              run.stepBody(p, out, 0, 0, DT, slideT > 0)
              if (run.leapt) slideT = 0
              p.x = out[0]
              p.z = out[1]
            }
            const where = `seed ${seed} ${l.from} → ${l.to}, ${back} m back, stick ${stick}`
            expect(run.pitted, where).toBe(false)
            expect(p.ground, where).toBe(true)
            expect(p.y, where).toBe(y)
            // Across the gap, on the landing island (the stick lets go on landing).
            const along = (p.x - cellCenter(l.from[0])) * di + (p.z - cellCenter(l.from[1])) * dj
            expect(along, where).toBeGreaterThan(CELL * 1.5)
          }
        }
      }
    }
  })

  it('no gap on the way is two cells or more unless a shuttle or a bobbing platform spans it', () => {
    // The route needs the lifts: without them the walk and the leaps stop
    // at the first shuttle.
    const m = generateSkyDocks(SEEDS[2]!)
    const t = m.terrain!
    const lifts = t.lifts
    t.lifts = []
    const got = reach(m)
    t.lifts = lifts
    const bossDoor = m.doors.find(d => d.boss)!
    expect(got.has(bossDoor.j * m.w + bossDoor.i)).toBe(false)
    const shuttleRoom = t.sections.indexOf('shuttle')
    const r = m.rooms[shuttleRoom]!
    // The first island of the shuttle hall, yes; its far pier, no.
    let near = 0
    let far = 0
    for (let j = r.z0; j < r.z0 + r.h; j++) {
      for (let i = r.x0; i < r.x0 + r.w; i++) {
        const k = j * m.w + i
        if (!standable(m, k)) continue
        if (got.has(k)) near++
        else far++
      }
    }
    expect(near).toBeGreaterThan(0)
    expect(far).toBeGreaterThan(0)
  })

  it('every section, checkpoint, reward, chest and secret is reachable with the verbs', () => {
    for (const seed of SEEDS) {
      const m = generateSkyDocks(seed)
      const t = m.terrain!
      const got = reach(m)
      const where = `seed ${seed}`
      for (const r of m.rooms) {
        let any = false
        for (let j = r.z0; j < r.z0 + r.h && !any; j++) for (let i = r.x0; i < r.x0 + r.w; i++) if (got.has(j * m.w + i)) { any = true; break }
        expect(any, `${where}: room ${r.id} (${t.sections[r.id]})`).toBe(true)
      }
      for (const [n, c] of t.checkpoints.entries()) {
        for (const k of c.cells) expect(got.has(k), `${where}: checkpoint ${n} cell ${k}`).toBe(true)
        expect(groundAt(m, c.x, c.z)).toBe(c.y)
      }
      for (const [n, r] of t.rewards.entries()) {
        expect(got.has(idx(m, r.x, r.z)), `${where}: reward ${n}`).toBe(true)
        expect(groundAt(m, r.x, r.z)).toBe(r.y)
      }
      for (const c of t.chests!) {
        expect(got.has(idx(m, c.x, c.z)), `${where}: chest`).toBe(true)
        expect(groundAt(m, c.x, c.z)).toBe(c.y)
      }
      for (const s of t.secrets!) {
        // The room cell in front of the false wall, and every button's cell.
        const f = secretDoorFace(m, s)
        expect(got.has((f.j + f.dj) * m.w + f.i + f.di), `${where}: secret door`).toBe(true)
        for (const bt of s.buttons) expect(got.has(idx(m, bt.x + bt.nx * CELL / 2, bt.z + bt.nz * CELL / 2)), `${where}: button`).toBe(true)
      }
      for (const f of t.foes) {
        expect(standable(m, idx(m, f.x, f.z))).toBe(true)
        expect(groundAt(m, f.x, f.z)).toBe(f.y)
      }
    }
  })

  it('the objective trail finds the way from the pad to the boss shutter (leaps, shuttles, bobs, ladder)', () => {
    for (const seed of SEEDS) {
      const m = generateSkyDocks(seed)
      const nav = createNav(m)
      const d = m.doors.find(x => x.boss)!
      const path = findPath(nav, m.start.x, m.start.z, cellCenter(d.i), cellCenter(d.j), 1400, 2, true)
      expect(path, `seed ${seed}`).not.toBeNull()
      // Without the links (the leaps), no way: the islands need the dash.
      const bare = { ...m, terrain: { ...m.terrain!, links: undefined } }
      expect(findPath(createNav(bare), m.start.x, m.start.z, cellCenter(d.i), cellCenter(d.j), 1400, 2, true), `seed ${seed}`).toBeNull()
    }
  })

  it('its content: checkpoints in every section, 2+ chests, one weapon ledge, a secret, ~18 machines', () => {
    for (const seed of SEEDS.slice(0, 8)) {
      const m = generateSkyDocks(seed)
      const t = m.terrain!
      for (let r = 0; r < t.sections.length; r++) {
        if (t.sections[r] === 'arena' || m.rooms[r]!.role === 'challenge') continue
        expect(t.checkpoints.some(c => c.room === r), `section ${r}`).toBe(true)
      }
      expect(t.chests!.length).toBeGreaterThanOrEqual(2)
      expect(t.rewards.filter(r => r.kind === 'weapon')).toHaveLength(1)
      expect(t.secrets).toHaveLength(1)
      expect(t.foes.length).toBeGreaterThanOrEqual(16)
      expect(t.foes.length).toBeLessThanOrEqual(22)
      expect(t.lifts.filter(l => l.kind === 'h')).toHaveLength(2)
      expect(t.lifts.filter(l => l.loop)).toHaveLength(2)
      // The tunnel, and the arena's occasional gust.
      expect(t.wind).toHaveLength(2)
    }
  })

  it('the weapon ledge is off the route: the way to the boss never needs it', () => {
    const m = generateSkyDocks(SEEDS[1]!)
    const t = m.terrain!
    const w = t.rewards.find(r => r.kind === 'weapon')!
    const nav = createNav(m)
    const d = m.doors.find(x => x.boss)!
    const path = findPath(nav, m.start.x, m.start.z, cellCenter(d.i), cellCenter(d.j), 1400, 2, true)!
    const wk = idx(m, w.x, w.z)
    expect(path.some(([x, z]) => idx(m, x, z) === wk)).toBe(false)
  })

  it('the wind tunnel is walled and solid: no pit anywhere the gust can push toward', () => {
    for (const seed of SEEDS) {
      const m = generateSkyDocks(seed)
      const t = m.terrain!
      // (The arena's gust is its own: a flat, walled 7 × 7.)
      for (const z of t.wind!.filter(w => m.rooms[w.room]?.role !== 'boss')) {
        expect(Math.abs(z.dx) + Math.abs(z.dz)).toBe(1)
        expect(z.strength).toBeGreaterThanOrEqual(3.5)
        expect(z.strength).toBeLessThanOrEqual(5)
        const r = m.rooms[z.room]!
        // The whole tunnel room: no pit in it at all.
        for (let j = r.z0; j < r.z0 + r.h; j++) for (let i = r.x0; i < r.x0 + r.w; i++) expect(t.pit[j * m.w + i]).toBe(0)
        // Downwind of the zone: the tunnel's own floor, then its entrance.
        const pi = z.dx > 0 ? z.i1 + 1 : z.dx < 0 ? z.i0 - 1 : -1
        const pj = z.dz > 0 ? z.j1 + 1 : z.dz < 0 ? z.j0 - 1 : -1
        if (pj >= 0) for (let i = z.i0; i <= z.i1; i++) expect(standable(m, pj * m.w + i) || m.cell[pj * m.w + i] === Cell.Void).toBe(true)
        if (pi >= 0) for (let j = z.j0; j <= z.j1; j++) expect(standable(m, j * m.w + pi) || m.cell[j * m.w + pi] === Cell.Void).toBe(true)
      }
    }
  })
})

// ─── Bobbing platforms ───────────────────────────────────────────────────────

describe('bobbing platforms (a looping v lift)', () => {
  it('ride up and down on the clock, stood on or not', () => {
    const m = generateSkyDocks(7)
    const host = hostFor(m)
    const run = new ClimbRun(host, 1)
    const t = m.terrain!
    const n = t.lifts.findIndex(l => l.loop)
    const def = t.lifts[n]!
    // The platform is the lift's own entry in nav.plats, in lift order.
    const plat = host.nav.plats![n]!
    const p = body(0, 0, -100)
    const tops: number[] = []
    const period = (def.travel + def.wait) * 2
    for (let time = 0; time < period * 2; time += DT) {
      run.update(DT, time, p, true)
      tops.push(plat.top)
    }
    expect(Math.min(...tops)).toBeCloseTo(def.ay, 3)
    expect(Math.max(...tops)).toBeCloseTo(def.by, 3)
    // Both stops come round twice in two periods (it loops, it does not wait
    // for a rider at the bottom).
    let ups = 0
    for (let s = 1; s < tops.length; s++) if (tops[s - 1]! < def.by - 0.01 && tops[s]! >= def.by - 0.01) ups++
    expect(ups).toBeGreaterThanOrEqual(2)
    // The same moment of the clock puts it at the same height.
    run.update(DT, 3.3, p, true)
    const a = plat.top
    run.update(DT, 3.3 + period, p, true)
    expect(plat.top).toBeCloseTo(a, 6)
  })

  it('a rider stood on it is carried up to the upper island', () => {
    const m = generateSkyDocks(7)
    const host = hostFor(m)
    const run = new ClimbRun(host, 1)
    const t = m.terrain!
    const def = t.lifts.find(l => l.loop)!
    const n = t.lifts.indexOf(def)
    // Wait for it at its lower stop, stand on it, ride.
    let time = 0
    const p = body(def.ax, def.az, def.ay)
    const out: [number, number] = [0, 0]
    for (; time < 30; time += DT) {
      run.update(DT, time, p, true)
      if (Math.abs(host.nav.plats![n]!.top - def.ay) < 1e-6) break
    }
    p.plat = n
    let top = p.y
    for (let s = 0; s < 60 * 8; s++) {
      time += DT
      run.update(DT, time, p, true)
      run.stepBody(p, out, 0, 0, DT, false)
      p.x = out[0]
      p.z = out[1]
      top = Math.max(top, p.y)
    }
    expect(top).toBeCloseTo(def.by, 2)
    expect(run.pitted).toBe(false)
  })
})

// ─── Wind ────────────────────────────────────────────────────────────────────

/** A 3 × 8 tunnel at y = 0 blowing −X over i = 0..7, a pillar at (3, 1). */
const tunnel = () => {
  const b = new Builder(10, 5)
  b.addRoom(1, 1, 8, 3, 'start', 'wind', 0)
  b.level(4, 2, 4, 2, 4)
  const zone: WindZone = { i0: 1, j0: 1, i1: 8, j1: 3, dx: -1, dz: 0, strength: 4, on: 3, off: 2, phase: 0, room: 0 }
  b.wind.push(zone)
  return { map: finish(b, { x: cellCenter(1), z: cellCenter(2), yaw: YAW_PX }, 1), zone }
}

describe('the wind tunnel', () => {
  it('blows only in its gust, eased in and out, and never in the calm', () => {
    const { zone } = tunnel()
    expect(gustShare(zone, 0)).toBe(0)
    expect(gustShare(zone, 0.15)).toBeCloseTo(0.5)
    expect(gustShare(zone, 1.5)).toBe(1)
    expect(gustShare(zone, 2.85)).toBeCloseTo(0.5)
    for (let time = 3; time < 5; time += 0.05) expect(gustShare(zone, time)).toBe(0)
    // On the clock: a period later, the same.
    expect(gustShare(zone, 6.5)).toBe(1)
    // The phase shifts the cycle: 3 s on, the clock starts in the calm.
    const late = { ...zone, phase: 3 }
    expect(gustShare(late, 0)).toBe(0)
    expect(gustShare(late, 1.9)).toBe(0)
    expect(gustShare(late, 3.5)).toBe(1)
  })

  it('whistles GUST_WARN before each gust: the telegraph comes first', () => {
    const { zone } = tunnel()
    const period = zone.on + zone.off
    for (let k = 1; k < 4; k++) {
      const gust = k * period
      expect(gustWarning(zone, gust - GUST_WARN - 0.05)).toBe(false)
      expect(gustWarning(zone, gust - GUST_WARN + 0.05)).toBe(true)
      expect(gustShare(zone, gust - 0.05)).toBe(0)
      expect(gustWarning(zone, gust + 0.05)).toBe(false)
      expect(gustShare(zone, gust + 0.2)).toBeGreaterThan(0)
    }
    // The feature sounds it once per gust, near the tunnel.
    const { map } = tunnel()
    const sfx: string[] = []
    const f = new WindFeature(hostFor(map, [], sfx), map.terrain!)
    const p = body(cellCenter(6), cellCenter(2))
    for (let time = 0; time < period * 3; time += DT) f.update(DT, time, p, true)
    expect(sfx.filter(s => s === 'gust')).toHaveLength(3)
  })

  it('pushes along its direction, in the zone and on its floor only', () => {
    const { map, zone } = tunnel()
    const shelter = windShelter(map, zone)
    const out = { friction: 1, pushX: 0, pushZ: 0 }
    windPush(map, zone, shelter, 1, body(cellCenter(6), cellCenter(1)), out)
    expect(out).toEqual({ friction: 1, pushX: -4, pushZ: 0 })
    out.pushX = 0
    windPush(map, zone, shelter, 0.5, body(cellCenter(6), cellCenter(1)), out)
    expect(out.pushX).toBeCloseTo(-2)
    out.pushX = 0
    // In the calm, out of the zone, or a storey off its floor: nothing.
    windPush(map, zone, shelter, 0, body(cellCenter(6), cellCenter(1)), out)
    windPush(map, zone, shelter, 1, body(cellCenter(9) + 1, cellCenter(1)), out)
    windPush(map, zone, shelter, 1, body(cellCenter(6), cellCenter(1), 3), out)
    expect(out.pushX).toBe(0)
    expect(out.pushZ).toBe(0)
  })

  it('shelters the lee of a pillar (downwind of it, two cells) and nowhere else', () => {
    const { map, zone } = tunnel()
    const shelter = windShelter(map, zone)
    const at = (i: number, j: number) => shelter[(j - zone.j0) * (zone.i1 - zone.i0 + 1) + (i - zone.i0)]
    // The pillar at (4, 2), the wind toward −X: its lee is (3, 2) and (2, 2).
    expect(at(3, 2)).toBe(1)
    expect(at(2, 2)).toBe(1)
    expect(at(1, 2)).toBe(0)
    expect(at(5, 2)).toBe(0)
    expect(at(3, 1)).toBe(0)
    expect(at(3, 3)).toBe(0)
    const out = { friction: 1, pushX: 0, pushZ: 0 }
    windPush(map, zone, shelter, 1, body(cellCenter(3), cellCenter(2)), out)
    expect(out.pushX).toBe(0)
  })

  it('in a gust Flux still inches forward against it; in the calm he walks; the lee holds him still', () => {
    const { map } = tunnel()
    const host = hostFor(map)
    const run = new ClimbRun(host, 1)
    const wind = run.features.find(f => f instanceof WindFeature) as WindFeature
    expect(wind).toBeTruthy()
    const walk = (x0: number, z0: number, time: number, vx: number): number => {
      const p = body(x0, z0)
      const out: [number, number] = [0, 0]
      run.update(DT, time, p, true)
      p.vx = vx
      run.stepBody(p, out, 0, 0, 0.25, false)
      return out[0] - x0
    }
    // Walking +X (into the wind) at 4.7 m/s, in the middle of a gust.
    const gusty = walk(cellCenter(6), cellCenter(1), 1.5, 4.7)
    expect(gusty).toBeGreaterThan(0)
    expect(gusty).toBeLessThan(0.25 * 1.5)
    // Calm: the full walk.
    expect(walk(cellCenter(6), cellCenter(1), 4, 4.7)).toBeCloseTo(0.25 * 4.7, 3)
    // Standing still in a gust: pushed back; in the lee: not.
    expect(walk(cellCenter(6), cellCenter(1), 1.5, 0)).toBeLessThan(-0.5)
    expect(walk(cellCenter(3), cellCenter(2), 1.5, 0)).toBe(0)
  })

  it('the streaks come from a fixed pool: many in a gust, a few in the calm', () => {
    const { map } = tunnel()
    const host = hostFor(map)
    const f = new WindFeature(host, map.terrain!)
    const mesh = host.scene.getObjectByName('windStreaks') as unknown as { count: number }
    const p = body(cellCenter(6), cellCenter(2))
    for (let time = 0; time < 1.5; time += DT) f.update(DT, time, p, true)
    const gust = mesh.count
    for (let time = 3; time < 4.1; time += DT) f.update(DT, time, p, true)
    const calm = mesh.count
    expect(gust).toBeGreaterThan(calm * 3)
    expect(calm).toBeGreaterThan(0)
    f.dispose()
    expect(host.scene.getObjectByName('windStreaks')).toBeUndefined()
  })
})

describe('Atlas on the Sky Docks', () => {
  it('says each gale hint once, near its spot', () => {
    const m = generateSkyDocks(0)
    const said: AtlasLine[] = []
    const run = new ClimbRun(hostFor(m, said), 1)
    const t = m.terrain!
    const leap = t.links!.find(l => l.kind === 'leap')!
    const at = (i: number, j: number) => body(cellCenter(i), cellCenter(j), t.floor[j * m.w + i]!)
    const visit = (p: ClimbBody) => { for (let n = 0; n < 3; n++) run.update(DT, 100, p, true) }
    visit(at(...leap.from))
    visit(at(...leap.to))
    const sh = t.lifts.find(l => l.kind === 'h')!
    visit(body(sh.ax, sh.az, sh.ay))
    const bob = t.lifts.find(l => l.loop)!
    visit(body(bob.ax, bob.az, bob.ay))
    const z = t.wind![0]!
    visit(body((z.i0 + z.i1 + 1) / 2 * CELL, z.dz < 0 ? z.j0 * CELL + 0.5 : (z.j1 + 1) * CELL - 0.5, t.floor[z.j0 * m.w + z.i0]!))
    // (The climb also cues the story's first-ever pit warning at the shuttle; the mission drops it
    // on the Sky Docks, where the shuttles are plain to see.)
    expect(said.filter(l => l.startsWith('hint.')).sort()).toEqual(['hint.gale.leap', 'hint.gale.wind'])
  })
})
