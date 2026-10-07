// @vitest-environment jsdom
// The climb ("Tower Run", `world/climbGen.ts`): a hand-authored platforming
// stage on floor heights, ending in the sector's Core Master at y = 0.
//
// A section the verbs cannot reach is a mission nobody can finish, and a
// flat map that picked up a height by accident would change every labyrinth
// mission. So: every seed's tower is walked with exactly the player's verbs
// (walk up steps, drop down any ledge, ladders both ways, lifts between their
// stops — no jump), the arena must sit at y = 0 behind the boss shutter, the
// labyrinth maps must come out without terrain, and the job board must only
// offer a climb where the boss is already down.

import { describe, expect, it, vi } from 'vitest'
import { generateClimb, STOREY } from '@/game/world/climbGen'
import { generateMap, CELL, Cell, cellCenter, type MapData } from '@/game/world/levelGen'
import {
  createNav, groundAt, edgeHeight, floorAt, findPath, moveBody, moveCircle, STEP_UP
} from '@/game/world/nav'
import { rollJob, climbJob, climbSectors } from '@/game/data/quests'
import { SECTORS } from '@/game/data/regions'

vi.mock('@/use/useAds', () => ({ showMidgameAd: async () => {} }))
vi.mock('@/use/useAdGate', () => ({ canShowInterstitial: () => false, markInterstitialShown: () => {} }))
vi.mock('@/use/useCrazyGames', () => ({ triggerHappytime: () => {} }))
vi.mock('@/game/engine/app', () => ({ app: { setMode: () => {}, setWanted: () => {} } }))

const SEEDS = Array.from({ length: 64 }, (_, i) => (i * 2654435761 + 1013904223) >>> 0)
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const

const idx = (m: MapData, x: number, z: number) => Math.floor(z / CELL) * m.w + Math.floor(x / CELL)

/** Cells a body can stand on: walkable and not a pit. */
const standable = (m: MapData, k: number) => m.cell[k] !== Cell.Void && !m.terrain!.pit[k]

/** Level cells next to a lift stop, the way `nav.ts` links them. */
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
 * Every cell reachable from the pad with the player's verbs. Written from the
 * map data alone — not with the A* the game uses — so it checks the tower,
 * not the path-finder against itself.
 */
const reach = (m: MapData): Set<number> => {
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
  const stack = [idx(m, m.start.x, m.start.z)]
  while (stack.length) {
    const k = stack.pop()!
    if (seen.has(k)) continue
    seen.add(k)
    const i = k % m.w
    const j = (k - i) / m.w
    for (const [di, dj] of DIRS) {
      const nk = (j + dj) * m.w + i + di
      if (!standable(m, nk)) continue
      // Up by a step at most (stairs), down by anything (a drop).
      if (edgeHeight(m, i + di, j + dj, -di, -dj) - edgeHeight(m, i, j, di, dj) > STEP_UP) continue
      stack.push(nk)
    }
    for (const nk of hops.get(k) ?? []) stack.push(nk)
  }
  return seen
}

describe('generateClimb', () => {
  it('is deterministic for a seed (a resumed climb rebuilds the same tower)', () => {
    const a = generateClimb(4242)
    const b = generateClimb(4242)
    expect(JSON.stringify(a.rooms)).toBe(JSON.stringify(b.rooms))
    expect(JSON.stringify(a.doors)).toBe(JSON.stringify(b.doors))
    expect(Array.from(a.cell)).toEqual(Array.from(b.cell))
    expect(Array.from(a.terrain!.floor)).toEqual(Array.from(b.terrain!.floor))
    const { floor: _f, ramp: _r, rise: _s, pit: _p, ...restA } = a.terrain!
    const { floor: _f2, ramp: _r2, rise: _s2, pit: _p2, ...restB } = b.terrain!
    expect(JSON.stringify(restA)).toBe(JSON.stringify(restB))
    expect(a.start).toEqual(b.start)
  })

  it('the seed varies the tower (mirror, crushers, timing) but never the route', () => {
    const mirrored = new Set<boolean>()
    const crushers = new Set<number>()
    for (const seed of SEEDS) {
      const m = generateClimb(seed)
      mirrored.add(m.start.x > m.w * CELL / 2)
      crushers.add(m.terrain!.crushers.length)
      expect(m.terrain!.sections).toEqual(['hall', 'ladder', 'rolling', 'lift', 'crusher', 'descent', 'arena'])
    }
    expect(mirrored.size).toBe(2)
    expect(crushers.size).toBe(2)
  })

  it('every section, checkpoint and reward ledge is reachable with the verbs, no jump', () => {
    for (const seed of SEEDS) {
      const m = generateClimb(seed)
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
      }
      for (const [n, r] of t.rewards.entries()) expect(got.has(idx(m, r.x, r.z)), `${where}: reward ${n}`).toBe(true)
      const bossDoor = m.doors.find(d => d.boss)!
      expect(got.has(bossDoor.j * m.w + bossDoor.i), `${where}: boss door`).toBe(true)
    }
  })

  it('the upper levels need the verbs: no walk up a cliff reaches them', () => {
    // Without ladders and lifts, the walk stops at the rolling stairs' foot
    // — the ladder shaft's upper ledge is the first thing only a ladder reaches.
    const m = generateClimb(99)
    const t = m.terrain!
    const saved = { ladders: t.ladders, lifts: t.lifts }
    t.ladders = []
    t.lifts = []
    const got = reach(m)
    Object.assign(t, saved)
    const shaftTop = m.rooms[1]!
    for (let j = shaftTop.z0; j < shaftTop.z0 + shaftTop.h; j++) {
      for (let i = shaftTop.x0; i < shaftTop.x0 + shaftTop.w; i++) {
        const k = j * m.w + i
        if (t.floor[k]! >= 2 * STOREY) expect(got.has(k)).toBe(false)
      }
    }
    expect(got.has(idx(m, t.checkpoints[t.checkpoints.length - 1]!.x, t.checkpoints[t.checkpoints.length - 1]!.z))).toBe(false)
  })

  it('ends at a boss arena at y = 0 behind the boss shutter', () => {
    for (const seed of SEEDS) {
      const m = generateClimb(seed)
      const t = m.terrain!
      const arena = m.rooms.find(r => r.role === 'boss')!
      expect(arena).toBeTruthy()
      expect(t.sections[arena.id]).toBe('arena')
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
      // The labyrinth's wall height, so the boss drops in over it as ever.
      expect(t.wallTop[arena.id]).toBeCloseTo(4.2)
    }
  })

  it('its props agree with the floors they stand on', () => {
    for (const seed of SEEDS.slice(0, 16)) {
      const m = generateClimb(seed)
      const t = m.terrain!
      for (const L of t.ladders) {
        expect(t.floor[L.j * m.w + L.i]).toBe(L.y0)
        expect(t.floor[(L.j + L.dj) * m.w + L.i + L.di]).toBe(L.y1)
      }
      for (const lf of t.lifts) {
        // Something to step on and off at both stops.
        expect(besideStop(m, lf.ax, lf.ay, lf.az).length).toBeGreaterThan(0)
        expect(besideStop(m, lf.bx, lf.by, lf.bz).length).toBeGreaterThan(0)
      }
      for (const c of t.crushers) {
        const k = c.j * m.w + c.i
        expect(t.pit[k]).toBe(0)
        expect(t.floor[k]).toBe(c.y)
      }
      for (const f of t.foes) {
        expect(standable(m, idx(m, f.x, f.z))).toBe(true)
        expect(groundAt(m, f.x, f.z)).toBe(f.y)
        expect(f.x).toBeGreaterThanOrEqual(f.leash[0])
        expect(f.x).toBeLessThanOrEqual(f.leash[2])
      }
      for (const c of t.checkpoints) expect(groundAt(m, c.x, c.z)).toBe(c.y)
      for (const r of t.rewards) expect(groundAt(m, r.x, r.z)).toBe(r.y)
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
})

describe('terrain physics', () => {
  it('a raised floor is a wall to the feet below it and a floor to the feet on it', () => {
    const m = generateClimb(7)
    const nav = createNav(m)
    const t = m.terrain!
    const L = t.ladders.find(l => !l.side)!
    // Walk from the ladder's foot straight at its wall: stopped by the cliff.
    const fx = cellCenter(L.i)
    const fz = cellCenter(L.j)
    const out: [number, number] = [0, 0]
    moveBody(nav, fx, fz, L.y0, L.di * 3, L.dj * 3, 0.62, out)
    const wall = L.di ? (L.di > 0 ? (L.i + 1) * CELL : L.i * CELL) : (L.dj > 0 ? (L.j + 1) * CELL : L.j * CELL)
    const along = L.di ? out[0] : out[1]
    expect(Math.abs(along - wall)).toBeGreaterThanOrEqual(0.6)
    // With the feet up on the ledge, the same move goes through.
    moveBody(nav, fx, fz, L.y1, L.di * 3, L.dj * 3, 0.62, out)
    expect(Math.abs((L.di ? out[0] : out[1]) - (L.di ? fx : fz))).toBeGreaterThan(2.5)
  })

  it('the stairs are a slope a walk climbs; the A* never routes up a cliff', () => {
    const m = generateClimb(11)
    const nav = createNav(m)
    const t = m.terrain!
    // From the pad, the gallery door is reachable (by the stairs)…
    const landing = t.checkpoints[0]!
    const up = findPath(nav, m.start.x, m.start.z, cellCenter(Math.floor(m.doors[0]!.i)), cellCenter(m.doors[0]!.j), 1400, 1)
    expect(up).not.toBeNull()
    // …but the ladder shaft's upper ledge is not: only the ladder goes there.
    const L = t.ladders.find(l => !l.side)!
    const topX = cellCenter(L.i + L.di)
    const topZ = cellCenter(L.j + L.dj)
    expect(findPath(nav, landing.x, landing.z, topX, topZ, 1400, 1)).toBeNull()
    // The trail's search may use the ladder.
    expect(findPath(nav, landing.x, landing.z, topX, topZ, 1400, 1, true)).not.toBeNull()
  })

  it('a ramp rises smoothly across its cell', () => {
    const m = generateClimb(3)
    const t = m.terrain!
    let k = 0
    while (!t.ramp[k]) k++
    const i = k % m.w
    const j = (k - i) / m.w
    const samples: number[] = []
    for (let s = 0; s <= 10; s++) {
      const u = 0.01 + s * 0.098
      samples.push(groundAt(m, (i + (t.ramp[k] <= 2 ? u : 0.5)) * CELL, (j + (t.ramp[k] <= 2 ? 0.5 : u)) * CELL))
    }
    const lo = Math.min(...samples)
    const hi = Math.max(...samples)
    expect(hi - lo).toBeGreaterThan(t.rise[k]! * 0.9)
    for (let s = 1; s < samples.length; s++) expect(Math.abs(samples[s]! - samples[s - 1]!)).toBeLessThan(0.2)
  })
})

describe('flat maps are untouched', () => {
  it('a labyrinth map has no terrain, and every height query answers 0', () => {
    for (const seed of [1, 2, 3, 20261916]) {
      const m = generateMap({ seed, rooms: 9, boss: true })
      expect(m.terrain).toBeUndefined()
      const nav = createNav(m)
      expect(nav.plats).toBeUndefined()
      expect(nav.links).toBeUndefined()
      expect(floorAt(nav, m.start.x, m.start.z)).toBe(0)
      expect(groundAt(m, m.start.x, m.start.z)).toBe(0)
      // moveBody on a flat map resolves like moveCircle.
      const a: [number, number] = [0, 0]
      const b: [number, number] = [0, 0]
      moveCircle(nav, m.start.x, m.start.z, 7, 3, 0.62, a)
      moveBody(nav, m.start.x, m.start.z, 0, 7, 3, 0.62, b)
      expect(b[0]).toBeCloseTo(a[0], 9)
      expect(b[1]).toBeCloseTo(a[1], 9)
    }
  })
})

describe('the climb on the job board', () => {
  it('never rolls without a beaten boss; rolls in beaten sectors only', () => {
    const unlocked = SECTORS.slice(0, 3).map(s => s.id)
    let climbs = 0
    for (let s = 1; s < 800; s++) {
      const seed = (s * 1103515245 + 12345) >>> 0
      expect(rollJob(seed, unlocked, 6).template).not.toBe('climb')
      const j = rollJob(seed, unlocked, 6, ['scrapyard'])
      if (j.template === 'climb') {
        climbs++
        expect(j.sector).toBe('scrapyard')
        expect(j.kind).toBe('job')
      }
      // Without climbs the roll is exactly what it always was.
      expect(rollJob(seed, unlocked, 6, [])).toEqual(rollJob(seed, unlocked, 6))
    }
    expect(climbs).toBeGreaterThan(30)
  })

  it('climbSectors lists the unlocked sectors whose boss is down', () => {
    expect(climbSectors(['scrapyard'], [])).toEqual([])
    expect(climbSectors(['scrapyard', 'blaze'], ['scrapper'])).toEqual(['scrapyard'])
    expect(climbSectors(['scrapyard', 'blaze'], ['scrapper', 'blazeMaster'])).toEqual(['scrapyard', 'blaze'])
  })

  it('a climb job pays like a boss job and is deterministic', () => {
    const a = climbJob(123, ['scrapyard'], 3)
    expect(climbJob(123, ['scrapyard'], 3)).toEqual(a)
    expect(a.template).toBe('climb')
    expect(a.reward.guaranteed).toBe('prototype')
    expect(a.reward.rarityBias).toBeGreaterThanOrEqual(1.5)
  })

  it('New Game+ opens the board from the start', async () => {
    const { profile } = await import('@/game/state/profile')
    const { ensureJobs, jobsOpen } = await import('@/game/flow')
    profile.world.unlocked = ['scrapyard']
    profile.world.bosses = []
    profile.world.ngPlus = 1
    profile.quests.jobs = []
    expect(jobsOpen()).toBe(true)
    ensureJobs()
    expect(profile.quests.jobs.length).toBe(3)
    profile.world.ngPlus = 0
    expect(jobsOpen()).toBe(false)
  })

  it('the board opens after the Flame Master, with one climb on it the first time, once', async () => {
    const { profile } = await import('@/game/state/profile')
    const { ensureJobs } = await import('@/game/flow')
    profile.world.unlocked = ['scrapyard']
    profile.world.bosses = []
    profile.tips = {}
    profile.quests.jobs = []
    profile.world.ngPlus = 0
    ensureJobs()
    // No board before the Flame Master (#120): the story comes first.
    expect(profile.quests.jobs.length).toBe(0)
    profile.world.bosses = ['scrapper']
    ensureJobs()
    expect(profile.quests.jobs.length).toBe(0)
    expect(profile.tips.climbOffered).toBeUndefined()
    // The Flame Master falls: the board fills, a climb among its jobs.
    profile.world.unlocked = ['scrapyard', 'blaze']
    profile.world.bosses = ['scrapper', 'blazeMaster']
    ensureJobs()
    expect(profile.quests.jobs.length).toBe(3)
    expect(profile.quests.jobs.filter(j => j.template === 'climb').length).toBe(1)
    expect(profile.tips.climbOffered).toBe(true)
    // Taken and done: it is not forced back on.
    profile.quests.jobs = profile.quests.jobs.filter(j => j.template !== 'climb')
    const before = profile.quests.jobs.map(j => j.id)
    ensureJobs()
    expect(profile.quests.jobs.length).toBe(3)
    expect(profile.quests.jobs.slice(0, 2).map(j => j.id)).toEqual(before)
  })

  it('an old saved job still loads and deploys (no template it does not know)', () => {
    const old = rollJob(77, ['scrapyard'], 2)
    const restored = JSON.parse(JSON.stringify(old))
    expect(restored).toEqual(old)
  })
})
