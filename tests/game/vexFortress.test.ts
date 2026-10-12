// @vitest-environment jsdom
// Vex Fortress (`world/stages/fortress.ts`): the last story stage — three
// acts, two mini-boss guard halls (the way out of each held until its
// guards are down), a checkpoint before each of them and before Vex, every
// Master's trick once more, and the reactor hall's cycling hazards round Vex.

import { describe, expect, it, vi } from 'vitest'

vi.mock('@/use/useAds', () => ({ showMidgameAd: async () => {} }))
vi.mock('@/use/useAdGate', () => ({ canShowInterstitial: () => false, markInterstitialShown: () => {} }))
vi.mock('@/use/useCrazyGames', () => ({ triggerHappytime: () => {} }))
vi.mock('@/game/engine/app', () => ({ app: { setMode: () => {}, setWanted: () => {} } }))

import { CELL, Cell, type MapData } from '@/game/world/levelGen'
import { edgeHeight, STEP_UP } from '@/game/world/nav'
import { generateVexFortress } from '@/game/world/stages/fortress'
import { STAGE_LENGTH } from '@/game/world/stages'
import { storyQuest } from '@/game/data/quests'
import { SECTOR_BY_ID } from '@/game/data/regions'
import { setupFromQuest } from '@/game/sim/mission'

const SEEDS = Array.from({ length: 24 }, (_, i) => (i * 2654435761 + 1013904223) >>> 0)
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const
const idx = (m: MapData, x: number, z: number) => Math.floor(z / CELL) * m.w + Math.floor(x / CELL)

/** The route with the player's verbs, ladders, lifts and lit bridges of
 *  light; boulders standing (a cracked one's cell only if `open`). */
const reach = (m: MapData, o: { lifts?: boolean; open?: boolean } = {}): Set<number> => {
  const t = m.terrain!
  const bridge = new Map<number, number>()
  for (const n of t.neon ?? []) for (let j = n.j; j < n.j + n.d; j++) for (let i = n.i; i < n.i + n.w; i++) bridge.set(j * m.w + i, n.y)
  const cracked = new Set((t.icePillars ?? []).filter(p => p.cracked).map(p => p.j * m.w + p.i))
  const standable = (k: number) => m.cell[k] !== Cell.Void && (!t.pit[k] || bridge.has(k)) && (!m.navBlock[k] || (o.open && cracked.has(k)))
  const floorOf = (i: number, j: number, di: number, dj: number) => bridge.get(j * m.w + i) ?? edgeHeight(m, i, j, di, dj)
  const hops = new Map<number, number[]>()
  const hop = (a: number, b: number) => { hops.set(a, [...(hops.get(a) ?? []), b]) }
  for (const L of t.ladders) { const f = L.j * m.w + L.i; const top = (L.j + L.dj) * m.w + L.i + L.di; hop(f, top); hop(top, f) }
  const besideStop = (x: number, y: number, z: number): number[] => {
    const out: number[] = []
    const si = Math.floor(x / CELL)
    const sj = Math.floor(z / CELL)
    for (const [di, dj] of DIRS) {
      const k = (sj + dj) * m.w + si + di
      if (!standable(k)) continue
      if (Math.abs(edgeHeight(m, si + di, sj + dj, -di, -dj) - y) < 0.3) out.push(k)
    }
    return out
  }
  if (o.lifts !== false) for (const lf of t.lifts) for (const a of besideStop(lf.ax, lf.ay, lf.az)) for (const b of besideStop(lf.bx, lf.by, lf.bz)) { hop(a, b); hop(b, a) }
  const leapOk = (a: [number, number], b: [number, number]): boolean => {
    const di = b[0] - a[0]
    const dj = b[1] - a[1]
    const ka = a[1] * m.w + a[0]
    const kb = b[1] * m.w + b[0]
    const mid = (a[1] + dj / 2) * m.w + a[0] + di / 2
    return standable(ka) && standable(kb) && !!t.pit[mid] && !bridge.has(mid) && t.floor[ka] === t.floor[kb] && !t.ramp[ka] && !t.ramp[kb]
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
      if (standable(nk) && floorOf(i + di, j + dj, -di, -dj) - floorOf(i, j, di, dj) <= STEP_UP) stack.push(nk)
      if (leapOk([i, j], [i + 2 * di, j + 2 * dj])) stack.push((j + 2 * dj) * m.w + i + 2 * di)
    }
    for (const nk of hops.get(k) ?? []) stack.push(nk)
  }
  return seen
}

describe('generateVexFortress', () => {
  it('is the Fortress\'s story stage now, and deterministic for a seed', () => {
    const q = storyQuest(SECTOR_BY_ID.fortress, 31, 0)
    expect(q.template).toBe('stage')
    expect(setupFromQuest(q, null).stage).toBe('fortress')
    for (const seed of [0, 4242]) {
      const a = generateVexFortress(seed)
      const b = generateVexFortress(seed)
      expect(JSON.stringify(a.rooms)).toBe(JSON.stringify(b.rooms))
      expect(JSON.stringify(a.terrain!.foes)).toBe(JSON.stringify(b.terrain!.foes))
    }
  })

  it('seventeen sections and the three-stage arena, the longest stage; both hands', () => {
    const mirrored = new Set<boolean>()
    for (const seed of SEEDS) {
      const m = generateVexFortress(seed)
      const t = m.terrain!
      // The Core Descent (#109): roof, reactor hall, Core ring.
      expect(t.bossStages).toHaveLength(3)
      expect(t.bossStages!.map(id => t.sections[id])).toEqual(['arena', 'arena', 'arena'])
      expect(m.rooms[t.bossStages![0]!]!.role).toBe('boss')
      expect(t.sections.length - 3 - (m.beam ? 1 : 0) - (m.challenge ? 1 : 0)).toBe(STAGE_LENGTH.fortress)
      expect(STAGE_LENGTH.fortress).toBe(Math.max(...Object.values(STAGE_LENGTH)))
      mirrored.add(m.start.x > m.w * CELL / 2)
    }
    expect(mirrored.size).toBe(2)
  })

  it('two guard halls: a Gatekeeper, then the Twin Masters, each with a checkpoint and a way out held', () => {
    const m = generateVexFortress(0)
    const t = m.terrain!
    expect(t.guards!.length).toBe(2)
    const [g1, g2] = t.guards!
    const in1 = t.foes.filter(f => f.room === g1)
    const in2 = t.foes.filter(f => f.room === g2)
    expect(in1.map(f => f.kind)).toEqual(['gatekeeper'])
    expect(in2.map(f => [f.kind, f.echo])).toEqual([['echo', 'blazeMaster'], ['echo', 'frostMaster']])
    for (const g of t.guards!) {
      expect(t.checkpoints.some(c => m.room[idx(m, c.x, c.z)] === g), `checkpoint in hall ${g}`).toBe(true)
      expect(m.doors.some(d => d.from === g && !d.boss), `a way out of hall ${g}`).toBe(true)
    }
    // A checkpoint before Vex: in the room the boss shutter leads out of.
    const shutter = m.doors.find(d => d.boss)!
    expect(t.checkpoints.some(c => m.room[idx(m, c.x, c.z)] === shutter.from)).toBe(true)
  })

  it('the route reaches the boss shutter with the boulders standing; the lifts carry it', () => {
    for (const seed of SEEDS.slice(0, 6)) {
      const m = generateVexFortress(seed)
      const t = m.terrain!
      const door = m.doors.find(d => d.boss)!
      const dk = door.j * m.w + door.i
      const got = reach(m)
      expect(got.has(dk), `seed ${seed}`).toBe(true)
      for (const c of t.checkpoints) expect(got.has(idx(m, c.x, c.z)), `seed ${seed}: checkpoint`).toBe(true)
      expect(reach(m, { lifts: false }).has(dk)).toBe(false)
      // The rockfall's cache only past its cracked rock.
      const cache = t.rewards.find(r => r.kind === 'hp' && t.icePillars!.some(p => p.cracked && Math.abs(p.i * CELL - r.x) < 5 && Math.abs(p.j * CELL - r.z) < 5))!
      expect(got.has(idx(m, cache.x, cache.z))).toBe(false)
      expect(reach(m, { open: true }).has(idx(m, cache.x, cache.z))).toBe(true)
    }
  })

  it('every Master\'s trick appears once more, and the arena cycles fire, shock and gusts round Vex', () => {
    const m = generateVexFortress(0)
    const t = m.terrain!
    expect(t.magnets!.length).toBeGreaterThanOrEqual(3)
    expect(t.neon!.length).toBe(2)
    expect(t.neonSwitches!.length).toBe(1)
    expect(t.water!.some(z => z.valve)).toBe(true)
    expect(t.icicles!.length).toBeGreaterThanOrEqual(3)
    expect(t.icePillars!.some(p => p.cracked)).toBe(true)
    expect(t.wind!.length).toBe(2)
    expect(t.crumbles!.length).toBeGreaterThanOrEqual(1)
    expect(t.foes.filter(f => f.kind === 'warden').length).toBeGreaterThanOrEqual(5)
    const arena = m.rooms.find(r => r.role === 'boss')!
    expect([arena.w, arena.h]).toEqual([7, 7])
    // The hazards cycle in the second stage, the reactor hall.
    const hall = m.rooms[t.bossStages![1]!]!
    expect([hall.w, hall.h]).toEqual([7, 7])
    const av = t.vents!.filter(v => v.room === hall.id)
    expect(av.some(v => v.kind === 'fire') && av.some(v => v.kind === 'shock')).toBe(true)
    expect(t.wind!.some(w => w.room === hall.id)).toBe(true)
    // One clock, three hazards in turn: their live windows never overlap.
    const fire = av.find(v => v.kind === 'fire')!
    const shock = av.find(v => v.kind === 'shock')!
    const gust = t.wind!.find(w => w.room === hall.id)!
    const on = (period: number, phase: number, len: number, time: number) => ((((time + phase) % period) + period) % period) < len
    for (let s = 0; s < fire.period; s += 0.1) {
      const live = [on(fire.period, fire.phase, fire.on, s), on(shock.period, shock.phase, shock.on, s), on(gust.on + gust.off, gust.phase, gust.on, s)]
      expect(live.filter(Boolean).length, `t = ${s.toFixed(1)}`).toBeLessThanOrEqual(1)
    }
  })
})
