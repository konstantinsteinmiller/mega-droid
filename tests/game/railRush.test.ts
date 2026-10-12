// Rail Rush (`world/stages/volt.ts`): the volt sector's story stage — on foot
// over electrified panels and up a coil tower, a long maglev cart ride under
// waves of drones, then down to the Volt Master's arena at y = 0.
//
// The route is walked with exactly the player's verbs (steps up, any drop
// down, ladders, lifts, the dash leap over one cell) plus the ride itself,
// and the objective trail's own search must find the way to the boss door
// through the rail link. The cart (`sim/stages/rail.ts`) is ridden step by
// step as the mission drives it; the waves (`sim/stages/waves.ts`) come
// only while it rides and never beyond their total; the shock panels
// (`sim/stages/shock.ts`) bite only while live.

import { describe, expect, it, vi } from 'vitest'

vi.mock('@/use/useAds', () => ({ showMidgameAd: async () => {} }))
vi.mock('@/use/useAdGate', () => ({ canShowInterstitial: () => false, markInterstitialShown: () => {} }))
vi.mock('@/use/useCrazyGames', () => ({ triggerHappytime: () => {} }))
vi.mock('@/game/engine/app', () => ({ app: { setMode: () => {}, setWanted: () => {} } }))
// The drones' shadows and warning rings draw canvas textures (no 2D canvas
// under jsdom): plain objects stand in.
vi.mock('@/game/fx/markers', async () => {
  const { Mesh, Group } = await import('three')
  return { makeBlobShadow: () => new Mesh(), makeTeleRing: () => new Group(), setTeleRing: () => {} }
})

import { Group, Scene } from 'three'
import { CELL, Cell, cellCenter, type MapData } from '@/game/world/levelGen'
import { createNav, edgeHeight, findPath, groundAt, STEP_UP, type Nav } from '@/game/world/nav'
import { generateRailRush, railCourse } from '@/game/world/stages/volt'
import { STAGE_LENGTH } from '@/game/world/stages'
import { THEMES } from '@/game/world/themes'
import { SECTOR_BY_ID } from '@/game/data/regions'
import { ClimbRun, type ClimbBody, type ClimbHost } from '@/game/sim/climb'
import { RailFeature, BOARD_BEAT, type RailPoint } from '@/game/sim/stages/rail'
import { WaveFeature } from '@/game/sim/stages/waves'
import { ShockFeature, SHOCK_COST } from '@/game/sim/stages/shock'
import type { AtlasLine } from '@/game/sim/atlas'
import type { Enemy } from '@/game/sim/world'

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

/**
 * Every cell reachable from the pad with the verbs: walk (up a step, down
 * any drop), ladders both ways, lifts between their stops, and the stage's
 * own links (the dash leap, the ride) — optionally without the ride. From
 * the map data alone, not the game's A*.
 */
const reach = (m: MapData, ride = true): Set<number> => {
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
  for (const l of t.links ?? []) if (ride || l.kind !== 'rail') hop(l.from[1] * m.w + l.from[0], l.to[1] * m.w + l.to[0])
  const seen = new Set<number>()
  const stack = [idx(m, m.start.x, m.start.z)]
  while (stack.length) {
    const k = stack.pop()!
    if (seen.has(k)) continue
    seen.add(k)
    const i = k % m.w
    const j = (k - i) / m.w
    for (const [di, dj] of DIRS) {
      if (i + di < 0 || j + dj < 0 || i + di >= m.w || j + dj >= m.h) continue
      const nk = (j + dj) * m.w + i + di
      if (!standable(m, nk)) continue
      if (edgeHeight(m, i + di, j + dj, -di, -dj) - edgeHeight(m, i, j, di, dj) > STEP_UP) continue
      stack.push(nk)
    }
    for (const nk of hops.get(k) ?? []) stack.push(nk)
  }
  return seen
}

const body = (x: number, z: number, y = 0): ClimbBody => ({
  x, z, y, vx: 0, vz: 0, vy: 0, yaw: 0, ground: true, ladder: -1, plat: -1, air: 0, safeY: y, mantle: 0, mx: 0, mz: 0, path: null
})

interface TestHost extends ClimbHost {
  nav: Nav
  said: AtlasLine[]
  added: Enemy[]
  shots: number
  hits: number[]
}

const hostFor = (map: MapData): TestHost => {
  const scene = new Scene()
  const noop = () => {}
  const h: TestHost = {
    nav: createNav(map), map, theme: THEMES.volt,
    combat: { maxHp: 100 } as ClimbHost['combat'],
    fx: { sparks: noop, riseRing: noop, emit: noop } as unknown as ClimbHost['fx'],
    markers: { spawn: noop } as unknown as ClimbHost['markers'],
    shocks: { spawn: noop } as unknown as ClimbHost['shocks'],
    hitPlayer: (_e, dmg) => { h.hits.push(dmg); return 'hit' }, sfx: noop, shake: noop, onPickup: noop, propParent: () => scene,
    scene, time: 0, level: { root: new Group(), rooms: [], sky: null as never, bounds: [], owner: new Int16Array(0) },
    enemyLevel: 10, encounters: SECTOR_BY_ID.volt.encounters,
    addEnemy: (e) => { h.added.push(e) },
    fireEnemyShot: () => { h.shots++ },
    say: (l) => { h.said.push(l) },
    said: [], added: [], shots: 0, hits: []
  }
  return h
}

const railOf = (run: ClimbRun) => run.features.find((f): f is RailFeature => f instanceof RailFeature)!
const wavesOf = (run: ClimbRun) => run.features.find((f): f is WaveFeature => f instanceof WaveFeature)!

/** One step as the mission takes it: the stage first, then the body (the
 *  stick let go). */
const step = (run: ClimbRun, p: ClimbBody, time: number, playing = true): void => {
  run.update(DT, time, p, playing)
  if (!playing) return
  const out: [number, number] = [0, 0]
  if (!run.locksMove()) { p.vx = 0; p.vz = 0 }
  run.stepBody(p, out, 0, 0, DT, false)
  p.x = out[0]
  p.z = out[1]
}

/** Flux on the cart's slot on the boarding platform. */
const onBoard = (m: MapData): ClimbBody => {
  const r = m.terrain!.rails![0]!
  const x = cellCenter(r.boardAt.i)
  const z = cellCenter(r.boardAt.j)
  return body(x, z, groundAt(m, x, z))
}

// ─── The map ─────────────────────────────────────────────────────────────────

describe('generateRailRush', () => {
  it('is deterministic for a seed (a resume rebuilds the same stage)', () => {
    const a = generateRailRush(4242)
    const b = generateRailRush(4242)
    expect(JSON.stringify(a.rooms)).toBe(JSON.stringify(b.rooms))
    expect(Array.from(a.cell)).toEqual(Array.from(b.cell))
    expect(Array.from(a.terrain!.floor)).toEqual(Array.from(b.terrain!.floor))
    const { floor: _f, ramp: _r, rise: _s, pit: _p, ...restA } = a.terrain!
    const { floor: _f2, ramp: _r2, rise: _s2, pit: _p2, ...restB } = b.terrain!
    expect(JSON.stringify(restA)).toBe(JSON.stringify(restB))
    expect(a.start).toEqual(b.start)
  })

  it('has its sections, on a grid within bounds; the seed mirrors it but never changes the route', () => {
    const mirrored = new Set<boolean>()
    for (const seed of SEEDS) {
      const m = generateRailRush(seed)
      expect(m.w).toBeLessThanOrEqual(48)
      // (42: the rows under the exit station hold the challenge room.)
      expect(m.h).toBeLessThanOrEqual(42)
      expect(m.terrain!.sections.slice(0, (m.beam ? -1 : 0) + (m.exit ? -1 : 0) + (m.challenge ? -1 : 0) || undefined)).toEqual(['hall', 'vents', 'ladder', 'lift', 'rail', 'rail', 'cart', 'descent', 'arena'])
      expect(m.rooms.length - ((m.beam ? 1 : 0) + (m.exit ? 1 : 0) + (m.challenge ? 1 : 0))).toBe(STAGE_LENGTH.volt + 1)
      mirrored.add(m.start.x > m.w * CELL / 2)
    }
    expect(mirrored.size).toBe(2)
  })

  it('ends at a 7 × 7 arena at y = 0 behind the one boss shutter', () => {
    for (const seed of SEEDS) {
      const m = generateRailRush(seed)
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

  it('everything is reachable with the verbs and the ride — and the boss only by riding', () => {
    for (const seed of SEEDS) {
      const m = generateRailRush(seed)
      const t = m.terrain!
      const got = reach(m)
      const where = `seed ${seed}`
      for (const r of m.rooms) {
        if (t.sections[r.id] === 'rail') continue
        let any = false
        for (let j = r.z0; j < r.z0 + r.h && !any; j++) for (let i = r.x0; i < r.x0 + r.w; i++) if (got.has(j * m.w + i)) { any = true; break }
        expect(any, `${where}: room ${r.id} (${t.sections[r.id]})`).toBe(true)
      }
      for (const [n, c] of t.checkpoints.entries()) {
        for (const k of c.cells) expect(got.has(k), `${where}: checkpoint ${n} cell ${k}`).toBe(true)
      }
      for (const [n, r] of t.rewards.entries()) expect(got.has(idx(m, r.x, r.z)), `${where}: reward ${n}`).toBe(true)
      for (const [n, c] of t.chests!.entries()) expect(got.has(idx(m, c.x, c.z)), `${where}: chest ${n}`).toBe(true)
      // The secret's false wall faces a cell Flux can stand on, and its
      // buttons hang in rooms he reaches.
      const s = t.secrets![0]!
      const face = s.door.axis === 'x'
        ? [s.door.i - 1, s.door.i + 1].map(i => s.door.j * m.w + i)
        : [s.door.j - 1, s.door.j + 1].map(j => j * m.w + s.door.i)
      expect(face.some(k => got.has(k) && !s.cells.includes(k)), where).toBe(true)
      const bossDoor = m.doors.find(d => d.boss)!
      expect(got.has(bossDoor.j * m.w + bossDoor.i), `${where}: boss door`).toBe(true)
      // Without the ride, the boss door is out of reach.
      expect(reach(m, false).has(bossDoor.j * m.w + bossDoor.i), `${where}: no ride`).toBe(false)
    }
  })

  it('the objective trail finds the way from the pad to the boss door, over the rail', () => {
    for (const seed of SEEDS) {
      const m = generateRailRush(seed)
      const nav = createNav(m)
      const d = m.doors.find(x => x.boss)!
      const r = m.terrain!.rails![0]!
      // As `fx/objectiveTrail.ts` asks it: the node budget, links on.
      const path = findPath(nav, m.start.x, m.start.z, cellCenter(d.i), cellCenter(d.j), 1400, 1, true)
      expect(path, `seed ${seed}`).not.toBeNull()
      const cells = path!.map(([x, z]) => idx(m, x, z))
      expect(cells).toContain(r.exitAt.j * m.w + r.exitAt.i)
      // And from the boarding platform, where a restart mid-ride puts Flux.
      const cp = m.terrain!.checkpoints.find(c => c.cells.includes(r.boardAt.j * m.w + r.boardAt.i))!
      expect(findPath(nav, cp.x, cp.z, cellCenter(d.i), cellCenter(d.j), 1400, 1, true)).not.toBeNull()
    }
  })

  it('a checkpoint for every section on foot; the boarding platform holds the one for the ride', () => {
    for (const seed of SEEDS.slice(0, 8)) {
      const m = generateRailRush(seed)
      const t = m.terrain!
      for (const r of m.rooms) {
        const kind = t.sections[r.id]
        if (kind === 'hall' || kind === 'rail' || kind === 'arena') continue
        expect(t.checkpoints.some(c => c.room === r.id), `room ${r.id} (${kind})`).toBe(true)
      }
      const rail = t.rails![0]!
      const board = rail.boardAt.j * m.w + rail.boardAt.i
      expect(t.checkpoints.filter(c => c.cells.includes(board))).toHaveLength(1)
      // None on the rail rooms: the ride restarts from the platform.
      for (const c of t.checkpoints) expect(t.sections[c.room]).not.toBe('rail')
      for (const c of t.checkpoints) expect(groundAt(m, c.x, c.z)).toBe(c.y)
    }
  })

  it('the stage\'s contents: chests, ledges, one borrowed weapon, a secret, machines, waves, panels', () => {
    for (const seed of SEEDS) {
      const m = generateRailRush(seed)
      const t = m.terrain!
      expect(t.chests!.length).toBeGreaterThanOrEqual(2)
      expect(t.rewards.filter(r => r.kind === 'weapon')).toHaveLength(1)
      expect(t.rewards.length).toBeGreaterThanOrEqual(3)
      expect(t.secrets).toHaveLength(1)
      expect(t.foes.length).toBeGreaterThanOrEqual(16)
      expect(t.foes.length).toBeLessThanOrEqual(20)
      for (const f of t.foes) {
        expect(standable(m, idx(m, f.x, f.z))).toBe(true)
        expect(groundAt(m, f.x, f.z)).toBe(f.y)
      }
      for (const c of t.chests!) {
        expect(standable(m, idx(m, c.x, c.z))).toBe(true)
        expect(groundAt(m, c.x, c.z)).toBe(c.y)
      }
      expect(t.waves!.every(w => w.trigger === 'rail' && w.kind === 'heli' && t.sections[w.room] === 'rail')).toBe(true)
      const shock = t.vents!.filter(v => v.kind === 'shock')
      expect(shock.length).toBeGreaterThanOrEqual(6)
      for (const v of shock) expect(groundAt(m, cellCenter(v.i), cellCenter(v.j))).toBe(v.y)
      // The weapon ledge is only reached by the dash leap.
      const w = t.rewards.find(r => r.kind === 'weapon')!
      const noLeap = { ...m, terrain: { ...t, links: t.links!.filter(l => l.kind !== 'leap') } }
      expect(reach(noLeap).has(idx(m, w.x, w.z))).toBe(false)
      // Walls stand over every floor with room for Flux's head.
      for (const r of m.rooms) {
        for (let j = r.z0; j < r.z0 + r.h; j++) {
          for (let i = r.x0; i < r.x0 + r.w; i++) {
            const k = j * m.w + i
            if (!t.pit[k]) expect(t.wallTop[r.id]!).toBeGreaterThan(t.floor[k]! + t.rise[k]! + 3.5)
          }
        }
      }
    }
  })

  it('the rail runs from the boarding slot to the exit slot inside the walls, with a climb and a dip', () => {
    for (const seed of SEEDS) {
      const m = generateRailRush(seed)
      const t = m.terrain!
      const r = t.rails![0]!
      const P = r.points
      const first = P[0]!
      const last = P[P.length - 1]!
      expect([first.x, first.z]).toEqual([cellCenter(r.boardAt.i), cellCenter(r.boardAt.j)])
      expect(first.y).toBe(groundAt(m, first.x, first.z))
      expect([last.x, last.z]).toEqual([cellCenter(r.exitAt.i), cellCenter(r.exitAt.j)])
      expect(last.y).toBe(groundAt(m, last.x, last.z))
      let len = 0
      for (let n = 1; n < P.length; n++) {
        const a = P[n - 1]!
        const b = P[n]!
        const d = Math.hypot(b.x - a.x, b.z - a.z)
        len += d
        expect(d).toBeLessThan(2.25)
        // Smooth: no step in height between two samples.
        expect(Math.abs(b.y - a.y)).toBeLessThan(0.8)
      }
      // About half the stage: a long ride.
      expect(len).toBeGreaterThan(180)
      for (const q of P) {
        const k = idx(m, q.x, q.z)
        expect(m.cell[k], `(${q.x}, ${q.z})`).not.toBe(Cell.Void)
        const room = m.room[k]!
        if (room >= 0) {
          // Room for Flux's head under the wall tops; the pits' bottom well under.
          expect(q.y + 3.5).toBeLessThan(t.wallTop[room]!)
          expect(q.y).toBeGreaterThan(t.pitBottom[room]! + 3)
        }
      }
      const ys = P.map(q => q.y)
      expect(Math.max(...ys)).toBeGreaterThan(first.y + 3)
      expect(Math.min(...ys)).toBeLessThan(last.y + 0.01)
    }
  })

  it('railCourse rounds corners and eases the heights between waypoints', () => {
    const P = railCourse([[0, 0, 0], [0, 6, 0], [6, 6, 6]])
    expect(P[0]).toEqual({ x: cellCenter(0), y: 0, z: cellCenter(0) })
    expect(P[P.length - 1]).toEqual({ x: cellCenter(6), y: 6, z: cellCenter(6) })
    // The corner itself is never on the course: it is cut by the arc.
    expect(P.some(q => q.x === cellCenter(0) && q.z === cellCenter(6))).toBe(false)
    for (let n = 1; n < P.length; n++) expect(P[n]!.y).toBeGreaterThanOrEqual(P[n - 1]!.y - 1e-9)
  })
})

// ─── The cart ────────────────────────────────────────────────────────────────

describe('the rail cart', () => {
  const setup = (seed = SEEDS[1]!) => {
    const map = generateRailRush(seed)
    const host = hostFor(map)
    const run = new ClimbRun(host, 10)
    return { map, host, run, rail: railOf(run), waves: wavesOf(run) }
  }

  it('the stage builds its features in a fixed order: rail, waves, panels, secret, crumbling slab', () => {
    const { run } = setup()
    expect(run.features.map(f => f.constructor.name)).toEqual(['RailFeature', 'WaveFeature', 'ShockFeature', 'SecretsFeature', 'CrumbleFeature'])
  })

  it('stepping onto it starts the ride after a beat; stepping off before that does not', () => {
    const { map, run, rail, host } = setup()
    const p = onBoard(map)
    let time = 0
    for (let n = 0; n < Math.floor(BOARD_BEAT / DT) - 3; n++) step(run, p, (time += DT))
    expect(rail.state).toBe('board')
    expect(run.locksMove()).toBe(false)
    // Off the slot: the beat starts over.
    p.x += CELL
    step(run, p, (time += DT))
    expect(rail.state).toBe('wait')
    p.x -= CELL
    for (let n = 0; n < Math.ceil(BOARD_BEAT / DT) + 2; n++) step(run, p, (time += DT))
    expect(rail.state).toBe('ride')
    expect(run.locksMove()).toBe(true)
    expect(host.said).toContain('hint.volt.board')
  })

  it('carries Flux along the polyline, height and all, and lets go in the exit slot', () => {
    const { map, run, rail, host } = setup()
    const r = map.terrain!.rails![0]!
    const p = onBoard(map)
    let time = 0
    for (let n = 0; n < 60 && rail.state !== 'ride'; n++) step(run, p, (time += DT))
    expect(rail.state).toBe('ride')
    const q: RailPoint = { x: 0, y: 0, z: 0, dx: 0, dz: 1, pitch: 0 }
    let maxV = 0
    let lastS = 0
    let steps = 0
    while (rail.state === 'ride' && steps++ < 60 * 90) {
      step(run, p, (time += DT))
      if (rail.state !== 'ride') break
      rail.sample(rail.s, q)
      // On the cart: its floor, its spot (after the short slide onto it).
      expect(p.y).toBeCloseTo(q.y, 6)
      if (steps > 40) {
        expect(Math.hypot(p.x - q.x, p.z - q.z)).toBeLessThan(1e-6)
      }
      expect(p.ground).toBe(false)
      expect(run.locksMove()).toBe(true)
      expect(rail.s).toBeGreaterThanOrEqual(lastS)
      maxV = Math.max(maxV, rail.v)
      lastS = rail.s
    }
    expect(rail.state).toBe('done')
    // Eased: it got up to speed, and it took a while (a long ride).
    expect(maxV).toBeCloseTo(r.speed, 3)
    expect(steps * DT).toBeGreaterThan(20)
    expect(run.locksMove()).toBe(false)
    expect(p.ground).toBe(true)
    expect(Math.floor(p.x / CELL)).toBe(r.exitAt.i)
    expect(Math.floor(p.z / CELL)).toBe(r.exitAt.j)
    expect(p.y).toBe(groundAt(map, p.x, p.z))
    expect(host.said).toContain('hint.volt.board')
    // Off it now: the walk is his again, and the exit's checkpoint is taken.
    step(run, p, (time += DT))
    const exitK = r.exitAt.j * map.w + r.exitAt.i
    expect(map.terrain!.checkpoints[run.cp]!.cells).toContain(exitK)
    // It stays: standing on the old slot again does nothing.
    const back = onBoard(map)
    for (let n = 0; n < 90; n++) step(run, back, (time += DT))
    expect(rail.state).toBe('done')
    expect(run.save().feat![0]).toBe(1)
  })

  it('a restore mid-ride puts the cart back in its boarding slot; a finished ride stays finished', () => {
    const { map, run, rail } = setup()
    const p = onBoard(map)
    let time = 0
    for (let n = 0; n < 60 * 8; n++) step(run, p, (time += DT))
    expect(rail.state).toBe('ride')
    expect(rail.s).toBeGreaterThan(20)
    const mid = run.save()
    expect(mid.feat![0]).toBe(0)

    const again = setup()
    again.run.restore(mid)
    expect(again.rail.state).toBe('wait')
    expect(again.rail.s).toBe(0)
    const r = map.terrain!.rails![0]!
    expect([again.rail.x, again.rail.z]).toEqual([cellCenter(r.boardAt.i), cellCenter(r.boardAt.j)])
    // The restart spot is the boarding platform.
    expect(map.terrain!.checkpoints[again.run.cp]!.cells).toContain(r.boardAt.j * map.w + r.boardAt.i)

    const done = setup()
    done.run.restore({ ...mid, feat: [1, [3, 3], 0] })
    expect(done.rail.state).toBe('done')
    expect(done.rail.s).toBeCloseTo(done.rail.length)
  })

  it('Flux taken off the cart mid-ride (a restart on the checkpoint) sends it home', () => {
    const { map, run, rail } = setup()
    const p = onBoard(map)
    let time = 0
    for (let n = 0; n < 60 * 5; n++) step(run, p, (time += DT))
    expect(rail.state).toBe('ride')
    const cp = map.terrain!.checkpoints[run.cp]!
    p.x = cp.x
    p.z = cp.z
    p.y = cp.y
    p.ground = true
    step(run, p, (time += DT))
    expect(rail.state).toBe('wait')
    expect(rail.s).toBe(0)
  })

  it('a death on the cart halts it; the reboot rides on', () => {
    const { map, run, rail } = setup()
    const p = onBoard(map)
    let time = 0
    for (let n = 0; n < 60 * 4; n++) step(run, p, (time += DT))
    const s = rail.s
    for (let n = 0; n < 60; n++) step(run, p, (time += DT), false)
    expect(rail.s).toBe(s)
    step(run, p, (time += DT))
    expect(rail.s).toBeGreaterThan(s)
    expect(rail.state).toBe('ride')
  })
})

// ─── The waves ───────────────────────────────────────────────────────────────

describe('waves of drones on the ride', () => {
  it('come only while the cart rides, at its height, and never beyond their total', () => {
    for (const seed of SEEDS.slice(0, 4)) {
      const map = generateRailRush(seed)
      const host = hostFor(map)
      const run = new ClimbRun(host, 10)
      const rail = railOf(run)
      const waves = wavesOf(run)
      const specs = map.terrain!.waves!
      const total = specs.reduce((n, w) => n + w.total, 0)
      const most = specs.reduce((n, w) => n + w.total * w.count, 0)
      // Standing about near the station: nothing comes.
      const p = body(cellCenter(map.terrain!.rails![0]!.boardAt.i) + CELL, cellCenter(map.terrain!.rails![0]!.boardAt.j), 12)
      let time = 0
      for (let n = 0; n < 60 * 10; n++) step(run, p, (time += DT))
      expect(host.added).toHaveLength(0)
      const q = onBoard(map)
      Object.assign(p, q)
      while (rail.state !== 'done' && time < 200) step(run, p, (time += DT))
      expect(rail.state).toBe('done')
      expect(waves.sent).toBe(total)
      expect(host.added.length).toBeGreaterThanOrEqual(total)
      expect(host.added.length).toBeLessThanOrEqual(most)
      const lo = Math.min(...map.terrain!.rails![0]!.points.map(x => x.y))
      const hi = Math.max(...map.terrain!.rails![0]!.points.map(x => x.y))
      for (const e of host.added) {
        expect(e.kind).toBe('heli')
        expect(e.awake).toBe(true)
        expect(e.floor!).toBeGreaterThanOrEqual(lo - 1e-6)
        expect(e.floor!).toBeLessThanOrEqual(hi + 1e-6)
        expect(e.hover).toBeDefined()
        expect(e.leash).toBeDefined()
        expect(specs.some(w => w.room === e.room)).toBe(true)
      }
      // Left behind by the cart, they went quietly (no kill, no wreck).
      expect(host.added.some(e => e.offstage && e.state === 'dead')).toBe(true)
      // After the ride: no more.
      const n = host.added.length
      for (let k = 0; k < 60 * 20; k++) step(run, p, (time += DT))
      expect(host.added.length).toBe(n)
      expect(waves.sent).toBe(total)
    }
  })

  it('a new ride (after a restart on the platform) runs them again; a finished one keeps them spent', () => {
    const map = generateRailRush(SEEDS[2]!)
    const host = hostFor(map)
    const run = new ClimbRun(host, 10)
    const rail = railOf(run)
    const waves = wavesOf(run)
    const p = onBoard(map)
    let time = 0
    for (let n = 0; n < 60 * 9; n++) step(run, p, (time += DT))
    expect(waves.sent).toBeGreaterThan(0)
    run.restore(run.save())
    expect(rail.state).toBe('wait')
    expect(waves.sent).toBe(0)
  })
})

// ─── The shock panels ────────────────────────────────────────────────────────

describe('electrified floor panels', () => {
  it('jolt Flux once a pulse while live, never while dark; Atlas warns once as he comes up', () => {
    const map = generateRailRush(SEEDS[0]!)
    const host = hostFor(map)
    const run = new ClimbRun(host, 10)
    const v = map.terrain!.vents!.find(x => x.kind === 'shock')!
    const p = body(cellCenter(v.i), cellCenter(v.j), v.y)
    // Step through two whole periods standing on it.
    let live = 0
    for (let t = 0; t < v.period * 2; t += DT) {
      host.hits.length = 0
      run.update(DT, t, p, true)
      const on = ShockFeature.live(v, t)
      if (!on) expect(host.hits).toHaveLength(0)
      live += host.hits.length
      for (const d of host.hits) expect(d).toBe(Math.round(100 * SHOCK_COST))
    }
    expect(live).toBeGreaterThanOrEqual(2)
    expect(live).toBeLessThanOrEqual(3)
    expect(host.said.filter(l => l === 'hint.volt.panels')).toHaveLength(1)
    // On the dark row beside it: nothing, ever.
    host.hits.length = 0
    const safe = body(cellCenter(v.i + 1), cellCenter(v.j), v.y)
    for (let t = 0; t < v.period * 2; t += DT) run.update(DT, t, safe, true)
    expect(host.hits).toHaveLength(0)
  })

  it('a free row always exists: the rows never all go live at once', () => {
    for (const seed of SEEDS) {
      const vs = generateRailRush(seed).terrain!.vents!.filter(x => x.kind === 'shock')
      const p = vs[0]!.period
      for (let t = 0; t < p; t += 0.05) expect(vs.some(v => !ShockFeature.live(v, t))).toBe(true)
      // Each row stays dark long enough to walk across it.
      for (const v of vs) expect(v.period - v.on).toBeGreaterThan(1.4)
    }
  })
})
