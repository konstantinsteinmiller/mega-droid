// Meltdown Descent (`world/stages/blaze.ts`): the blaze sector's story stage,
// down a burning refinery stack from +21 m to the Blaze Master at y = 0 —
// and its flame vents (`sim/stages/vents.ts`).
//
// Like the climb, a section the verbs cannot reach is a mission nobody can
// finish: every seed's stack is walked with exactly the player's verbs (walk
// up a step, drop down any ledge, ladders, lifts, and the dash leap over a
// one-cell gap between equal floors — where the level says so), and the
// objective trail must find its way from the pad to the boss shutter. A vent
// must leave a cold cell in every column of its walkway at every moment, and
// it must hurt only whoever stands in its jet, once a burst.

import { describe, expect, it, vi } from 'vitest'

vi.mock('@/use/useAds', () => ({ showMidgameAd: async () => {} }))
vi.mock('@/use/useAdGate', () => ({ canShowInterstitial: () => false, markInterstitialShown: () => {} }))
vi.mock('@/use/useCrazyGames', () => ({ triggerHappytime: () => {} }))
vi.mock('@/game/engine/app', () => ({ app: { setMode: () => {}, setWanted: () => {} } }))
vi.mock('@/game/fx/markers', async () => {
  const { Mesh } = await import('three')
  return { makeBlobShadow: () => new Mesh() }
})

import { Group, Scene } from 'three'
import { CELL, Cell, cellCenter, type MapData, type VentSpec } from '@/game/world/levelGen'
import { createNav, edgeHeight, findPath, groundAt, STEP_UP } from '@/game/world/nav'
import { generateMeltdown } from '@/game/world/stages/blaze'
import { generateClimb } from '@/game/world/climbGen'
import { Builder, finish, YAW_PX } from '@/game/world/stages/builder'
import { THEMES } from '@/game/world/themes'
import { SECTOR_BY_ID } from '@/game/data/regions'
import { ClimbRun, type ClimbBody, type ClimbHost } from '@/game/sim/climb'
import { buildStageFeatures } from '@/game/sim/stageFeatures'
import { VentFeature, FIRE_STYLE, VENT_WARN, inJet, ventStage } from '@/game/sim/stages/vents'
import { meltdownCues } from '@/game/sim/stages/meltdown'
import type { AtlasLine } from '@/game/sim/atlas'

const SEEDS = Array.from({ length: 48 }, (_, i) => (i * 2654435761 + 1013904223) >>> 0)
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
 * Every cell reachable from the pad with the player's verbs, from the map
 * data alone: walk (up a step, down any drop), ladders, lifts, and the
 * level's leap links — each checked here to BE a leap (one pit cell between
 * two equal floors in a straight line), so a link cannot paper over a gap
 * the slide would not carry.
 */
const reach = (m: MapData, leaps = true): Set<number> => {
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
  if (leaps) {
    for (const l of t.links ?? []) {
      if (l.kind !== 'leap') continue
      const [ai, aj] = l.from
      const [bi, bj] = l.to
      const mi = (ai + bi) / 2
      const mj = (aj + bj) / 2
      expect(Math.abs(bi - ai) + Math.abs(bj - aj)).toBe(2)
      expect(ai === bi || aj === bj).toBe(true)
      expect(t.pit[mj * m.w + mi]).toBe(1)
      expect(t.floor[aj * m.w + ai]).toBe(t.floor[bj * m.w + bi])
      hop(aj * m.w + ai, bj * m.w + bi)
    }
  }
  // A secret alcove is walled off until solved: not a place the verbs reach.
  const shut = new Set((t.secrets ?? []).flatMap(x => x.cells))
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
      if (!standable(m, nk) || shut.has(nk)) continue
      if (edgeHeight(m, i + di, j + dj, -di, -dj) - edgeHeight(m, i, j, di, dj) > STEP_UP) continue
      stack.push(nk)
    }
    for (const nk of hops.get(k) ?? []) stack.push(nk)
  }
  return seen
}

const body = (x: number, z: number, y = 0): ClimbBody => ({
  x, z, y, vx: 0, vz: 0, vy: 0, yaw: YAW_PX, ground: true, ladder: -1, plat: -1, air: 0, safeY: y, mantle: 0, mx: 0, mz: 0, path: null
})

const hostFor = (map: MapData, o: { said?: AtlasLine[]; hits?: number[]; rings?: number[]; theme?: keyof typeof THEMES } = {}): ClimbHost => {
  const scene = new Scene()
  const noop = () => {}
  return {
    nav: createNav(map), map, theme: THEMES[o.theme ?? 'blaze'],
    combat: { maxHp: 100 } as ClimbHost['combat'],
    fx: { sparks: noop, riseRing: noop, emit: noop } as unknown as ClimbHost['fx'],
    markers: { spawn: (x: number) => { o.rings?.push(x) } } as unknown as ClimbHost['markers'],
    shocks: { spawn: noop } as unknown as ClimbHost['shocks'],
    hitPlayer: (_e, dmg) => { o.hits?.push(dmg); return 'hit' }, sfx: noop, shake: noop, onPickup: noop, propParent: () => scene,
    scene, time: 0, level: { root: new Group(), rooms: [], sky: null as never, bounds: [], owner: new Int16Array(0) },
    enemyLevel: 1, encounters: SECTOR_BY_ID.blaze.encounters, addEnemy: noop,
    say: (l) => { o.said?.push(l) }
  }
}

describe('generateMeltdown', () => {
  it('is deterministic for a seed (a resumed stage rebuilds the same stack)', () => {
    const a = generateMeltdown(4242)
    const b = generateMeltdown(4242)
    expect(JSON.stringify(a.rooms)).toBe(JSON.stringify(b.rooms))
    expect(JSON.stringify(a.doors)).toBe(JSON.stringify(b.doors))
    expect(Array.from(a.cell)).toEqual(Array.from(b.cell))
    expect(Array.from(a.terrain!.floor)).toEqual(Array.from(b.terrain!.floor))
    const { floor: _f, ramp: _r, rise: _s, pit: _p, ...restA } = a.terrain!
    const { floor: _f2, ramp: _r2, rise: _s2, pit: _p2, ...restB } = b.terrain!
    expect(JSON.stringify(restA)).toBe(JSON.stringify(restB))
    expect(a.start).toEqual(b.start)
  })

  it('seven sections and the arena; the seed varies the details, never the route', () => {
    const mirrored = new Set<boolean>()
    const hammers = new Set<number>()
    const barrelSide = new Set<number>()
    for (const seed of SEEDS) {
      const m = generateMeltdown(seed)
      const t = m.terrain!
      // (The beam-in room, off the chain, comes last.)
      expect(t.sections.slice(0, m.beam ? -1 : undefined)).toEqual(['hall', 'lava', 'vents', 'rolling', 'hammer', 'drop', 'lift', 'arena'])
      expect(m.w).toBeLessThanOrEqual(48)
      expect(m.h).toBeLessThanOrEqual(40)
      mirrored.add(m.start.x > m.w * CELL / 2)
      hammers.add(t.crushers.length)
      barrelSide.add(t.lanes[0]!.dz)
    }
    expect(mirrored.size).toBe(2)
    expect(hammers.size).toBe(2)
    expect(barrelSide.size).toBe(2)
  })

  it('starts high on the roof and ends at a 7 × 7 arena at y = 0 behind the boss shutter', () => {
    for (const seed of SEEDS) {
      const m = generateMeltdown(seed)
      const t = m.terrain!
      expect(groundAt(m, m.start.x, m.start.z)).toBe(21)
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
      expect(doors).toHaveLength(1)
      expect(doors[0]!.to).toBe(arena.id)
      expect(t.floor[doors[0]!.j * m.w + doors[0]!.i]).toBe(0)
      expect(t.wallTop[arena.id]).toBeCloseTo(4.2)
      // Lava under the catwalks and the hammers.
      expect(t.pitKind?.filter(p => p === 'lava').length).toBeGreaterThanOrEqual(2)
    }
  })

  it('every section, checkpoint, reward, chest and the secret\'s room are reachable with the verbs', () => {
    for (const seed of SEEDS) {
      const m = generateMeltdown(seed)
      const t = m.terrain!
      const got = reach(m)
      const where = `seed ${seed}`
      for (const r of m.rooms) {
        let any = false
        for (let j = r.z0; j < r.z0 + r.h && !any; j++) for (let i = r.x0; i < r.x0 + r.w; i++) if (got.has(j * m.w + i)) { any = true; break }
        expect(any, `${where}: room ${r.id} (${t.sections[r.id]})`).toBe(true)
      }
      for (const [n, c] of t.checkpoints.entries()) {
        expect(got.has(idx(m, c.x, c.z)), `${where}: checkpoint ${n}`).toBe(true)
        for (const k of c.cells) expect(got.has(k), `${where}: checkpoint ${n} cell ${k}`).toBe(true)
        expect(groundAt(m, c.x, c.z)).toBe(c.y)
      }
      for (const [n, r] of t.rewards.entries()) {
        expect(got.has(idx(m, r.x, r.z)), `${where}: reward ${n}`).toBe(true)
        expect(groundAt(m, r.x, r.z)).toBe(r.y)
      }
      for (const [n, c] of (t.chests ?? []).entries()) {
        expect(got.has(idx(m, c.x, c.z)), `${where}: chest ${n}`).toBe(true)
        expect(groundAt(m, c.x, c.z)).toBe(c.y)
      }
      const bossDoor = m.doors.find(d => d.boss)!
      expect(got.has(bossDoor.j * m.w + bossDoor.i), `${where}: boss door`).toBe(true)
    }
  })

  it('the leap gaps are real: without the dash leap the boss is out of reach', () => {
    const m = generateMeltdown(99)
    const got = reach(m, false)
    const bossDoor = m.doors.find(d => d.boss)!
    expect(got.has(bossDoor.j * m.w + bossDoor.i)).toBe(false)
    // …and the weapon ledge is reachable only by a leap too.
    const w = m.terrain!.rewards.find(r => r.kind === 'weapon')!
    expect(got.has(idx(m, w.x, w.z))).toBe(false)
  })

  it('the objective trail finds the way from the pad to the boss shutter', () => {
    for (const seed of SEEDS) {
      const m = generateMeltdown(seed)
      const nav = createNav(m)
      const d = m.doors.find(x => x.boss)!
      const path = findPath(nav, m.start.x, m.start.z, cellCenter(d.i), cellCenter(d.j), 6000, 0, true)
      expect(path, `seed ${seed}`).not.toBeNull()
      // It never needs the secret: the alcove is shut to paths.
      const cells = new Set(m.terrain!.secrets![0]!.cells)
      expect(path!.some(([x, z]) => cells.has(idx(m, x, z)))).toBe(false)
    }
  })

  it('a checkpoint starts every section; the checkpoints run in route order, downhill', () => {
    for (const seed of SEEDS.slice(0, 16)) {
      const m = generateMeltdown(seed)
      const t = m.terrain!
      for (const r of m.rooms) {
        if (t.sections[r.id] === 'arena') continue
        expect(t.checkpoints.some(c => c.room === r.id), `room ${r.id}`).toBe(true)
      }
      // (The beam-in room's checkpoint leads the list; it is off the chain.)
      for (let n = m.beam ? 2 : 1; n < t.checkpoints.length; n++) {
        expect(t.checkpoints[n]!.room).toBeGreaterThanOrEqual(t.checkpoints[n - 1]!.room)
        expect(t.checkpoints[n]!.y).toBeLessThanOrEqual(t.checkpoints[n - 1]!.y)
      }
    }
  })

  it('chests, reward ledges (one borrowed weapon), machines and a secret with a prize', () => {
    for (const seed of SEEDS.slice(0, 16)) {
      const m = generateMeltdown(seed)
      const t = m.terrain!
      expect(t.chests!.length).toBeGreaterThanOrEqual(2)
      expect(t.rewards.filter(r => r.kind === 'weapon')).toHaveLength(1)
      expect(t.rewards.length).toBeGreaterThanOrEqual(4)
      expect(t.foes.length).toBeGreaterThanOrEqual(15)
      for (const f of t.foes) {
        expect(standable(m, idx(m, f.x, f.z))).toBe(true)
        expect(groundAt(m, f.x, f.z)).toBe(f.y)
        expect(f.x).toBeGreaterThanOrEqual(f.leash[0])
        expect(f.x).toBeLessThanOrEqual(f.leash[2])
      }
      const doorCells = new Set(m.doors.map(d => d.j * m.w + d.i))
      for (const c of t.chests!) expect(doorCells.has(idx(m, c.x, c.z))).toBe(false)
      expect(t.secrets).toHaveLength(1)
      const s = t.secrets![0]!
      expect(['tank', 'power']).toContain(s.prize)
      // Off the route: in a room of its own cells at that room's floor, and
      // the floor in front of its false wall is one Flux reaches.
      const got = reach(m)
      for (const k of s.cells) {
        expect(m.room[k]).toBe(s.room)
        expect(t.floor[k]).toBe(s.prizeAt.y)
        expect(got.has(k)).toBe(false)
      }
      const face = s.door
      const front = [[1, 0], [-1, 0], [0, 1], [0, -1]]
        .map(([di, dj]) => (face.j + dj!) * m.w + face.i + di!)
        .find(k => m.room[k] === s.room && !s.cells.includes(k))!
      expect(got.has(front)).toBe(true)
      expect(t.floor[front]).toBe(s.prizeAt.y)
      for (const b of s.buttons) expect(got.has(idx(m, b.x + b.nx * 0.5, b.z + b.nz * 0.5))).toBe(true)
      expect(s.target.some(v => v === 1)).toBe(true)
    }
  })

  it('its props agree with their floors: vents on walls, barrels on flat steps, hammers on the walkway', () => {
    for (const seed of SEEDS.slice(0, 16)) {
      const m = generateMeltdown(seed)
      const t = m.terrain!
      expect(t.vents!.length).toBeGreaterThanOrEqual(5)
      for (const v of t.vents!) {
        const k = v.j * m.w + v.i
        expect(standable(m, k)).toBe(true)
        expect(v.kind).toBe('fire')
        if (v.dx || v.dz) {
          // A wall behind the nozzle, the mouth over the floor.
          expect(m.cell[(v.j - v.dz) * m.w + v.i - v.dx]).toBe(Cell.Void)
          expect(v.y).toBeGreaterThan(t.floor[k]!)
        } else {
          expect(v.y).toBe(t.floor[k])
        }
        expect(v.period).toBeGreaterThan(VENT_WARN + v.on + 0.5)
      }
      for (const ln of t.lanes) {
        const y0 = groundAt(m, ln.x, ln.z)
        for (let s = 0; s <= ln.len + 0.5; s += 0.5) expect(groundAt(m, ln.x + ln.dx * s, ln.z + ln.dz * s)).toBe(y0)
      }
      for (const c of t.crushers) {
        const k = c.j * m.w + c.i
        expect(t.pit[k]).toBe(0)
        expect(t.floor[k]).toBe(c.y)
      }
      for (const lf of t.lifts) {
        expect(besideStop(m, lf.ax, lf.ay, lf.az).length).toBeGreaterThan(0)
        expect(besideStop(m, lf.bx, lf.by, lf.bz).length).toBeGreaterThan(0)
      }
    }
  })

  it('the vent walkway always has a cold cell in every column', () => {
    for (const seed of SEEDS.slice(0, 16)) {
      const m = generateMeltdown(seed)
      const t = m.terrain!
      const vents = t.vents!
      const room = m.rooms[vents[0]!.room]!
      const period = Math.max(...vents.map(v => v.period))
      for (let time = 0; time < period * 2; time += 0.05) {
        const burning = vents.filter(v => ventStage(v, time) === 'burn')
        for (let i = room.x0; i < room.x0 + room.w; i++) {
          let cold = false
          for (let j = room.z0; j < room.z0 + room.h && !cold; j++) {
            const y = t.floor[j * m.w + i]!
            cold = !burning.some(v => inJet(v, cellCenter(i), y, cellCenter(j)))
          }
          expect(cold, `seed ${seed}, t ${time.toFixed(2)}, column ${i}`).toBe(true)
        }
      }
    }
  })

  it('the blaze stage builds its vents and Atlas\'s six tips, each said once at its spot', () => {
    const m = generateMeltdown(7)
    const host = hostFor(m)
    // The secrets' feature opens walls through the run: a stand-in will do.
    const run = { openSecret: () => {}, secretOpen: () => false }
    const feats = buildStageFeatures(host, m.terrain!, run)
    expect(feats[0]).toBeInstanceOf(VentFeature)
    // Vents, Atlas's tips, the secret room's puzzle, the catwalk's
    // crumbling slabs.
    expect(feats).toHaveLength(4)
    // A Tower Run in the same sector builds neither: only its secret and its
    // crumbling path.
    expect(buildStageFeatures(host, generateClimb(7).terrain!, run)).toHaveLength(2)
    const said: AtlasLine[] = []
    const cues = meltdownCues(hostFor(m, { said }), m.terrain!)
    const t = m.terrain!
    const spots = [...t.checkpoints.map(c => [c.x, c.y, c.z]), ...(t.links ?? []).map(l => [cellCenter(l.from[0]), t.floor[l.from[1] * m.w + l.from[0]]!, cellCenter(l.from[1])])]
    for (const [x, y, z] of spots) cues.update(DT, 0, body(x!, z!, y!), true)
    for (const [x, y, z] of spots) cues.update(DT, 0, body(x!, z!, y!), true)
    expect(new Set(said)).toEqual(new Set(['hint.blaze.lava', 'hint.blaze.leap', 'hint.blaze.vents', 'hint.blaze.barrels', 'hint.blaze.hammers']))
    expect(said).toHaveLength(5)
    expect(cues.save!()).toEqual([1, 1, 1, 1, 1])
  })

  it('runs under ClimbRun: the features ride in its save', () => {
    const m = generateMeltdown(11)
    const run = new ClimbRun(hostFor(m), 3)
    // Vents, Atlas's tips, the secret room's puzzle, the crumbling slabs.
    expect(run.features).toHaveLength(4)
    const p = body(m.start.x, m.start.z, 21)
    for (let n = 0; n < 30; n++) run.update(DT, n * DT, p, true)
    expect(run.save().feat).toHaveLength(4)
  })
})

describe('flame vents', () => {
  /** A 6 × 3 room at y = 0: a wall vent at (2, 0) jetting +Z across its own
   *  cell from the north wall, and a floor vent at (4, 1). */
  const ventMap = (): { map: MapData; wall: VentSpec; floor: VentSpec } => {
    const b = new Builder(6, 3)
    b.addRoom(0, 0, 6, 3, 'start', 'vents', 0)
    const wall: VentSpec = { i: 2, j: 0, dx: 0, dz: 1, y: 1, period: 3, phase: 0, on: 1, room: 0, kind: 'fire' }
    const floor: VentSpec = { i: 4, j: 1, dx: 0, dz: 0, y: 0, period: 3, phase: 1.5, on: 1, room: 0, kind: 'fire' }
    b.vents.push(wall, floor)
    return { map: finish(b, { x: cellCenter(0), z: cellCenter(1), yaw: YAW_PX }, 1), wall, floor }
  }

  const run = (at: [number, number, number], seconds: number) => {
    const { map } = ventMap()
    const hits: number[] = []
    const rings: number[] = []
    const f = new VentFeature(hostFor(map, { hits, rings }), map.terrain!, 'fire', FIRE_STYLE)
    const p = body(at[0], at[2], at[1])
    const hitTimes: number[] = []
    for (let n = 0; n * DT < seconds; n++) {
      const before = hits.length
      f.update(DT, n * DT, p, true)
      if (hits.length > before) hitTimes.push(n * DT)
    }
    return { hits, rings, hitTimes }
  }

  it('the jet\'s shape: a wall jet across its cell at its height, a floor column over its grate', () => {
    const { wall, floor } = ventMap()
    expect(inJet(wall, cellCenter(2), 0, cellCenter(0))).toBe(true)
    expect(inJet(wall, cellCenter(2), 0, cellCenter(1))).toBe(false)
    expect(inJet(wall, cellCenter(3), 0, cellCenter(0))).toBe(false)
    expect(inJet(wall, cellCenter(2), 3, cellCenter(0))).toBe(false)
    expect(inJet(floor, cellCenter(4), 0, cellCenter(1))).toBe(true)
    expect(inJet(floor, cellCenter(4) + 1.6, 0, cellCenter(1))).toBe(false)
    expect(inJet(floor, cellCenter(4), 3.5, cellCenter(1))).toBe(false)
    expect(ventStage(wall, 0.1)).toBe('warn')
    expect(ventStage(wall, VENT_WARN + 0.5)).toBe('burn')
    expect(ventStage(wall, VENT_WARN + 1.2)).toBe('idle')
  })

  it('telegraphs first, then hurts whoever stands in the jet once a burst, not blockable', () => {
    const { hits, rings, hitTimes } = run([cellCenter(2), 0, cellCenter(0)], 6.5)
    // Two bursts in 6.5 s (at 0.8 and 3.8), one hit each, never in the warning.
    expect(hits).toEqual([15, 15])
    for (const t of hitTimes) expect(t % 3).toBeGreaterThanOrEqual(VENT_WARN)
    expect(hitTimes[0]!).toBeLessThan(VENT_WARN + 0.2)
    // The rings went down before the hits: both vents, each cycle.
    expect(rings.length).toBeGreaterThanOrEqual(3)
  })

  it('the cell beside the jet, and the floor a storey above, stay cold', () => {
    expect(run([cellCenter(2), 0, cellCenter(1)], 6.5).hits).toEqual([])
    expect(run([cellCenter(3), 0, cellCenter(0)], 6.5).hits).toEqual([])
    expect(run([cellCenter(2), 3, cellCenter(0)], 6.5).hits).toEqual([])
  })

  it('the floor column burns on its own beat', () => {
    const { hitTimes } = run([cellCenter(4), 0, cellCenter(1)], 6.5)
    // Its phase is half a period on: at t = 0 it is mid-burst (a hit at
    // once), and its next bursts start at 3 − 1.5 + 0.8 = 2.3 and 5.3.
    expect(hitTimes).toHaveLength(3)
    expect(hitTimes[0]).toBe(0)
    expect(hitTimes[1]!).toBeGreaterThanOrEqual(1.5 + VENT_WARN - 1e-9)
    expect(hitTimes[1]!).toBeLessThan(1.5 + VENT_WARN + 0.2)
  })

  it('a feature drives only its own kind', () => {
    const { map } = ventMap()
    map.terrain!.vents![1]!.kind = 'frost'
    const hits: number[] = []
    const f = new VentFeature(hostFor(map, { hits }), map.terrain!, 'fire', FIRE_STYLE)
    const p = body(cellCenter(4), cellCenter(1), 0)
    for (let n = 0; n * DT < 6; n++) f.update(DT, n * DT, p, true)
    expect(hits).toEqual([])
  })
})
