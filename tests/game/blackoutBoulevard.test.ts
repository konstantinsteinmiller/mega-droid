// Blackout Boulevard (`world/stages/neon.ts`): the neon sector's story stage —
// rooftops at night joined by bridges of light (`sim/stages/neon.ts`): floor
// only while lit; some blink on the clock, some answer a switch. And a
// wall-kick shaft up to the borrowed weapon.

import { describe, expect, it, vi } from 'vitest'

vi.mock('@/use/useAds', () => ({ showMidgameAd: async () => {} }))
vi.mock('@/use/useAdGate', () => ({ canShowInterstitial: () => false, markInterstitialShown: () => {} }))
vi.mock('@/use/useCrazyGames', () => ({ triggerHappytime: () => {} }))
vi.mock('@/game/engine/app', () => ({ app: { setMode: () => {}, setWanted: () => {} } }))

import { Group, Scene } from 'three'
import { CELL, Cell, cellCenter, type MapData } from '@/game/world/levelGen'
import { createNav, edgeHeight, STEP_UP, type Nav } from '@/game/world/nav'
import { generateBlackoutBoulevard } from '@/game/world/stages/neon'
import { STAGE_LENGTH } from '@/game/world/stages'
import { mirrorX, YAW_PX } from '@/game/world/stages/builder'
import { THEMES } from '@/game/world/themes'
import { SECTOR_BY_ID } from '@/game/data/regions'
import { ClimbRun, KICK_UP, type ClimbBody, type ClimbHost } from '@/game/sim/climb'
import { NeonFeature, clockLit, clockFlicker, FLICKER } from '@/game/sim/stages/neon'
import { BLACKOUT, lightWindow } from '@/game/sim/lightPulse'
import { WALK_SPEED } from '@/game/sim/constants'
import type { Shot } from '@/game/sim/world'
import type { AtlasLine } from '@/game/sim/atlas'

const SEEDS = Array.from({ length: 32 }, (_, i) => (i * 2654435761 + 1013904223) >>> 0)
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const
const idx = (m: MapData, x: number, z: number) => Math.floor(z / CELL) * m.w + Math.floor(x / CELL)

/** Standable for the route: a floor cell, or a pit cell under a bridge of
 *  light (lit at some point: every bridge is). */
const reach = (m: MapData, ladders = true): Set<number> => {
  const t = m.terrain!
  const bridge = new Map<number, number>()
  for (const n of t.neon ?? []) for (let j = n.j; j < n.j + n.d; j++) for (let i = n.i; i < n.i + n.w; i++) bridge.set(j * m.w + i, n.y)
  const standable = (k: number) => m.cell[k] !== Cell.Void && (!t.pit[k] || bridge.has(k)) && !m.navBlock[k]
  const floorOf = (i: number, j: number, di: number, dj: number) => bridge.get(j * m.w + i) ?? edgeHeight(m, i, j, di, dj)
  const hops = new Map<number, number[]>()
  const hop = (a: number, b: number) => { hops.set(a, [...(hops.get(a) ?? []), b]) }
  if (ladders) for (const L of t.ladders) { const f = L.j * m.w + L.i; const top = (L.j + L.dj) * m.w + L.i + L.di; hop(f, top); hop(top, f) }
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

const body = (x: number, z: number, y = 0, yaw = YAW_PX): ClimbBody => ({
  x, z, y, vx: 0, vz: 0, vy: 0, yaw, ground: true, ladder: -1, plat: -1, air: 0, safeY: y, mantle: 0, mx: 0, mz: 0, path: null
})

const hostFor = (map: MapData, said: AtlasLine[] = [], sfx: string[] = []): ClimbHost & { nav: Nav } => {
  const scene = new Scene()
  const noop = () => {}
  return {
    nav: createNav(map), map, theme: THEMES.neon,
    combat: { maxHp: 100 } as ClimbHost['combat'],
    fx: { sparks: noop, riseRing: noop, emit: noop } as unknown as ClimbHost['fx'],
    markers: { spawn: noop } as unknown as ClimbHost['markers'],
    shocks: { spawn: noop } as unknown as ClimbHost['shocks'],
    hitPlayer: () => 'hit', sfx: (n: string) => { sfx.push(n) }, shake: noop, onPickup: noop, propParent: () => scene,
    scene, time: 0, level: { root: new Group(), rooms: [], sky: null as never, bounds: [], owner: new Int16Array(0) },
    enemyLevel: 1, encounters: SECTOR_BY_ID.neon.encounters, addEnemy: noop,
    say: (l) => { said.push(l) }
  }
}

describe('generateBlackoutBoulevard', () => {
  it('is deterministic for a seed', () => {
    for (const seed of [0, 4242, SEEDS[5]!]) {
      const a = generateBlackoutBoulevard(seed)
      const b = generateBlackoutBoulevard(seed)
      expect(JSON.stringify(a.rooms)).toBe(JSON.stringify(b.rooms))
      expect(JSON.stringify(a.terrain!.neon)).toBe(JSON.stringify(b.terrain!.neon))
    }
  })

  it('thirteen sections and the arena over open air; the seed varies the hand and the blink', () => {
    const mirrored = new Set<boolean>()
    const blinks = new Set<number>()
    for (const seed of SEEDS) {
      const m = generateBlackoutBoulevard(seed)
      const t = m.terrain!
      expect(t.sections.slice(0, (m.beam ? -1 : 0) + (m.exit ? -1 : 0) + (m.challenge ? -1 : 0) || undefined)).toEqual(
        ['dock', 'islands', 'hall', 'islands', 'descent', 'hall', 'islands', 'hall', 'islands', 'descent', 'islands', 'hall', 'hall', 'arena'])
      expect(t.sections.length - 1 - ((m.beam ? 1 : 0) + (m.exit ? 1 : 0) + (m.challenge ? 1 : 0))).toBe(STAGE_LENGTH.neon)
      expect(t.clouds).toBe(true)
      mirrored.add(m.start.x > m.w * CELL / 2)
      blinks.add(Math.round(t.neon!.find(n => n.period)!.period! * 100))
      expect(t.neonSwitches!.length).toBe(2)
      expect(t.ladders.filter(l => l.kick).length).toBe(1)
    }
    expect(mirrored.size).toBe(2)
    expect(blinks.size).toBeGreaterThan(4)
  })

  it('the verbs and the bridges reach the boss shutter; the weapon only up the wall-kick shaft', () => {
    for (const seed of SEEDS.slice(0, 8)) {
      const m = generateBlackoutBoulevard(seed)
      const t = m.terrain!
      const got = reach(m)
      const door = m.doors.find(d => d.boss)!
      expect(got.has(door.j * m.w + door.i), `seed ${seed}: boss door`).toBe(true)
      for (const c of t.checkpoints) expect(got.has(idx(m, c.x, c.z)), `seed ${seed}: checkpoint`).toBe(true)
      const weapon = t.rewards.find(r => r.kind === 'weapon')!
      expect(got.has(idx(m, weapon.x, weapon.z))).toBe(true)
      expect(reach(m, false).has(idx(m, weapon.x, weapon.z))).toBe(false)
      const arena = m.rooms.find(r => r.role === 'boss')!
      expect([arena.w, arena.h]).toEqual([7, 7])
    }
  })
})

describe('bridges of light', () => {
  const map = generateBlackoutBoulevard(0)
  const t = map.terrain!

  it('a clock bridge is lit `on` s of its period and flickers FLICKER s before it goes dark', () => {
    const b = { i: 0, j: 0, w: 1, d: 1, y: 0, period: 4, phase: 0, on: 2.5, room: 0 }
    expect(clockLit(b, 0.1)).toBe(true)
    expect(clockLit(b, 3)).toBe(false)
    expect(clockFlicker(b, 2.5 - FLICKER / 2)).toBe(true)
    expect(clockFlicker(b, 1)).toBe(false)
  })

  it('a switch swaps which group is lit, from the room\'s side only; its state rides in the save', () => {
    const sfx: string[] = []
    const f = new NeonFeature(hostFor(map, [], sfx), t)
    const s = f.switches[0]!
    const room = s.def.room
    const g0 = f.bridges.filter(b => b.def.room === room && b.def.group === 0)
    const g1 = f.bridges.filter(b => b.def.room === room && b.def.group === 1)
    expect(g0.every(b => b.plat.top > -100) && g1.every(b => b.plat.top < -100)).toBe(true)
    const shot = (fromX: number, fromZ: number) => ({ px: fromX, py: s.y, pz: fromZ, x: s.x, y: s.y, z: s.z, radius: 0.15 }) as unknown as Shot
    expect(f.shot(shot(s.x - s.nx * 2, s.z - s.nz * 2))).toBe(false)
    expect(f.shot(shot(s.x + s.nx * 4, s.z + s.nz * 4))).toBe(true)
    f.update(1 / 60, 0, body(0, 0), true)
    expect(g0.every(b => b.plat.top < -100) && g1.every(b => b.plat.top > -100)).toBe(true)
    const g = new NeonFeature(hostFor(map), t)
    g.restore(f.save())
    expect(g.group.get(room)).toBe(1)
  })

  it('the mirror keeps every bridge over its pit cells and turns the switches\' walls', () => {
    const m = mirrorX(map)
    m.terrain!.neon!.forEach(n => {
      for (let j = n.j; j < n.j + n.d; j++) for (let i = n.i; i < n.i + n.w; i++) expect(m.terrain!.pit[j * m.w + i]).toBe(1)
    })
    m.terrain!.neonSwitches!.forEach((s, n) => {
      const o = t.neonSwitches![n]!
      expect(s.side).toBe(o.side === 'e' ? 'w' : o.side === 'w' ? 'e' : o.side)
    })
  })
})

describe('the blackout (#110)', () => {
  const map = generateBlackoutBoulevard(0)
  const t = map.terrain!
  const pulse = t.neon!.filter(n => n.pulse)
  // Mid-dark and mid-light of the cycle.
  const DARK = BLACKOUT.warn + BLACKOUT.dark / 2
  const LIGHT = BLACKOUT.warn + BLACKOUT.dark + 2

  it('runs the BLACKOUT clock, kept by the mirror; the Blink Run has two pulse bridges', () => {
    expect(t.blackout).toEqual(BLACKOUT)
    expect(mirrorX(map).terrain!.blackout).toEqual(BLACKOUT)
    expect(pulse).toHaveLength(2)
    expect(pulse.every(n => n.period === undefined && n.group === undefined)).toBe(true)
  })

  it('a pulse bridge goes out with the dark and back with the light; the stage dims, with a whine first', () => {
    const sfx: string[] = []
    const dark: number[] = []
    const host = { ...hostFor(map, [], sfx), stageDark: (k: number) => { dark.push(k) } }
    const f = new NeonFeature(host, t)
    const pb = f.bridges.filter(b => b.def.pulse)
    const at = (time: number) => { dark.length = 0; f.update(1 / 60, time, body(map.start.x, map.start.z), true) }
    at(0.1)
    expect(sfx).toContain('relayOut')
    at(DARK)
    expect(pb.every(b => b.plat.top < -100)).toBe(true)
    expect(Math.max(...dark)).toBe(1)
    at(LIGHT)
    expect(pb.every(b => b.plat.top > -100)).toBe(true)
    expect(Math.max(...dark)).toBe(0)
  })

  it('the boss arena keeps its lights', () => {
    const dark: number[] = []
    const host = { ...hostFor(map), stageDark: (k: number) => { dark.push(k) } }
    const f = new NeonFeature(host, t)
    const arena = map.rooms.find(r => r.role === 'boss')!
    f.update(1 / 60, DARK, body((arena.x0 + 3) * CELL, (arena.z0 + 3) * CELL), true)
    expect(dark).toHaveLength(0)
  })

  it('every pulse bridge is crossed at a walk in well under half the light', () => {
    for (const n of pulse) {
      const span = Math.max(n.w, n.d) * CELL + CELL
      expect(span / WALK_SPEED).toBeLessThan(lightWindow() / 2)
    }
  })
})

describe('the wall-kick shaft', () => {
  it('a slide at its foot facing the wall kicks Flux up; kicks again take him to the top and onto the ledge', () => {
    const map = generateBlackoutBoulevard(0)
    const t = map.terrain!
    const L = t.ladders.find(l => l.kick)!
    const run = new ClimbRun(hostFor(map), 1)
    // At the foot, facing the wall (yaw: forward = (−sin, −cos)).
    const yaw = Math.atan2(-L.di, -L.dj)
    const p = body(cellCenter(L.i) + L.di * 0.8, cellCenter(L.j) + L.dj * 0.8, L.y0, yaw)
    // Not facing it: no kick.
    expect(run.kick({ ...p, yaw: yaw + Math.PI })).toBe(false)
    expect(run.kick(p)).toBe(true)
    expect(p.ladder).toBeGreaterThanOrEqual(0)
    const out: [number, number] = [0, 0]
    let kicks = 1
    for (let n = 0; n < 600 && p.ladder >= 0; n++) {
      if (n % 20 === 19) { run.kick(p); kicks++ }
      run.stepBody(p, out, 0, 0, 1 / 60, false)
      p.x = out[0]
      p.z = out[1]
    }
    expect(p.ladder).toBe(-1)
    expect(p.y).toBeCloseTo(L.y1, 1)
    expect(kicks).toBeGreaterThanOrEqual(Math.ceil((L.y1 - L.y0) / KICK_UP))
  })

  it('left alone on the wall, Flux slips back down to the foot', () => {
    const map = generateBlackoutBoulevard(0)
    const L = map.terrain!.ladders.find(l => l.kick)!
    const run = new ClimbRun(hostFor(map), 1)
    const p = body(cellCenter(L.i) + L.di * 0.8, cellCenter(L.j) + L.dj * 0.8, L.y0, Math.atan2(-L.di, -L.dj))
    run.kick(p)
    const out: [number, number] = [0, 0]
    for (let n = 0; n < 600 && p.ladder >= 0; n++) {
      run.stepBody(p, out, 0, 0, 1 / 60, false)
      p.x = out[0]
      p.z = out[1]
    }
    expect(p.ladder).toBe(-1)
    expect(p.y).toBeCloseTo(L.y0, 1)
  })
})
