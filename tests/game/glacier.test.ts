// Glacier Run (`world/stages/cryo.ts`): the cryo sector's story stage, and
// its mechanics (`sim/stages/ice.ts`, `frost.ts`, `icePillars.ts`,
// `icicles.ts`).
//
// Like the Tower Run, a section the verbs cannot reach is a mission nobody
// can finish, so every seed's stage is walked with the player's verbs (walk
// up steps, drop down any ledge, ladders, lifts, the dash leaps its links
// name) and the objective trail's own search must find the boss door. The
// ice has to be fair: it runs over spikes only where the walk goes straight.
// The mechanics are pinned with numbers: a let-go stick glides on ice and
// stops, a frost blast costs a tenth and slows Flux for two seconds, an
// icicle hits only who stands under it when it lands.

import { describe, expect, it, vi } from 'vitest'

vi.mock('@/use/useAds', () => ({ showMidgameAd: async () => {} }))
vi.mock('@/use/useAdGate', () => ({ canShowInterstitial: () => false, markInterstitialShown: () => {} }))
vi.mock('@/use/useCrazyGames', () => ({ triggerHappytime: () => {} }))
vi.mock('@/game/engine/app', () => ({ app: { setMode: () => {}, setWanted: () => {} } }))

import { Group, Scene } from 'three'
import { CELL, Cell, cellCenter, type MapData } from '@/game/world/levelGen'
import { createNav, edgeHeight, findPath, groundAt, STEP_UP, type Nav } from '@/game/world/nav'
import { Builder, finish, YAW_PX } from '@/game/world/stages/builder'
import { generateGlacier } from '@/game/world/stages/cryo'
import { STAGE_LENGTH } from '@/game/world/stages'
import { THEMES } from '@/game/world/themes'
import { SECTOR_BY_ID } from '@/game/data/regions'
import { ClimbRun, walkBlend, type ClimbBody, type ClimbHost } from '@/game/sim/climb'
import { IceFeature, ICE_FRICTION } from '@/game/sim/stages/ice'
import { FrostThrowers, FROST_COST, FROST_SLOW, FROST_WARN, SLOW_TIME } from '@/game/sim/stages/frost'
import { IcePillars, PILLAR_R } from '@/game/sim/stages/icePillars'
import { Icicles, ICICLE_COST, ICICLE_FALL, ICICLE_WARN } from '@/game/sim/stages/icicles'
import type { AtlasLine } from '@/game/sim/atlas'
import { WALK_SPEED } from '@/game/sim/constants'

const SEEDS = Array.from({ length: 48 }, (_, i) => (i * 2654435761 + 1013904223) >>> 0)
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const
const DT = 1 / 60

const idx = (m: MapData, x: number, z: number) => Math.floor(z / CELL) * m.w + Math.floor(x / CELL)
const standable = (m: MapData, k: number) => m.cell[k] !== Cell.Void && !m.terrain!.pit[k] && m.navBlock[k] !== 1

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
 * Every cell reachable from the pad with the player's verbs: walk up a step
 * at most, drop any ledge, ladders both ways, lifts between their stops,
 * and the dash leaps the level names (`Terrain.links`) — written from the
 * map data alone, not with the game's A*. Pillars are in the way; secret
 * alcoves are not counted (they stay shut).
 */
const reach = (m: MapData): Set<number> => {
  const t = m.terrain!
  const hidden = new Set((t.secrets ?? []).flatMap(s => s.cells))
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
  for (const l of t.links ?? []) hop(l.from[1] * m.w + l.from[0], l.to[1] * m.w + l.to[0])
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
      if (!standable(m, nk) || hidden.has(nk)) continue
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

interface Spy {
  said: AtlasLine[]
  hits: Array<{ dmg: number; kind: string; blockable: boolean }>
  marks: number
  sfx: string[]
}

/** A ClimbHost with nothing behind it but the map, recording what the
 *  features do to it. */
const hostFor = (map: MapData, spy: Spy = { said: [], hits: [], marks: 0, sfx: [] }): ClimbHost & { nav: Nav } => {
  const scene = new Scene()
  const noop = () => {}
  return {
    nav: createNav(map), map, theme: THEMES.cryo,
    combat: { maxHp: 100 } as ClimbHost['combat'],
    fx: { sparks: noop, riseRing: noop, emit: noop } as unknown as ClimbHost['fx'],
    markers: { spawn: () => { spy.marks++ } } as unknown as ClimbHost['markers'],
    shocks: { spawn: noop } as unknown as ClimbHost['shocks'],
    hitPlayer: (_e, dmg, o) => { spy.hits.push({ dmg, kind: o.kind, blockable: o.blockable }); return 'hit' },
    sfx: (n) => { spy.sfx.push(n) }, shake: noop, onPickup: noop, propParent: () => scene,
    scene, time: 0, level: { root: new Group(), rooms: [], sky: null as never, bounds: [], owner: new Int16Array(0) },
    enemyLevel: 1, encounters: SECTOR_BY_ID.cryo.encounters, addEnemy: noop,
    say: (l) => { spy.said.push(l) }
  }
}

const SECTIONS = ['hall', 'spikes', 'frost', 'ice', 'icicles', 'lift', 'ladder', 'descent', 'arena']

// ─── The level ───────────────────────────────────────────────────────────────

describe('generateGlacier', () => {
  it('is deterministic for a seed (a resumed stage rebuilds the same glacier)', () => {
    for (const seed of [0, 4242, SEEDS[5]!]) {
      const a = generateGlacier(seed)
      const b = generateGlacier(seed)
      expect(JSON.stringify(a.rooms)).toBe(JSON.stringify(b.rooms))
      expect(JSON.stringify(a.doors)).toBe(JSON.stringify(b.doors))
      expect(Array.from(a.cell)).toEqual(Array.from(b.cell))
      expect(Array.from(a.navBlock)).toEqual(Array.from(b.navBlock))
      expect(Array.from(a.terrain!.floor)).toEqual(Array.from(b.terrain!.floor))
      expect(Array.from(a.terrain!.ice!)).toEqual(Array.from(b.terrain!.ice!))
      const { floor: _f, ramp: _r, rise: _s, pit: _p, ice: _i, ...restA } = a.terrain!
      const { floor: _f2, ramp: _r2, rise: _s2, pit: _p2, ice: _i2, ...restB } = b.terrain!
      expect(JSON.stringify(restA)).toBe(JSON.stringify(restB))
      expect(a.start).toEqual(b.start)
    }
  })

  it('the seed varies the details (mirror, cracked pillar, secret) but never the route', () => {
    const mirrored = new Set<boolean>()
    const cracked = new Set<number>()
    const kinds = new Set<string>()
    for (const seed of SEEDS) {
      const m = generateGlacier(seed)
      mirrored.add(m.start.x > m.w * CELL / 2)
      cracked.add(m.terrain!.icePillars!.find(p => p.cracked)!.j)
      kinds.add(m.terrain!.secrets![0]!.kind)
      expect(m.terrain!.sections.slice(0, m.beam ? -1 : undefined)).toEqual(SECTIONS)
      expect(m.w).toBeLessThanOrEqual(48)
      expect(m.h).toBeLessThanOrEqual(40)
    }
    expect(SECTIONS.length).toBe(STAGE_LENGTH.cryo + 1)
    expect(mirrored.size).toBe(2)
    expect(cracked.size).toBeGreaterThan(1)
    expect(kinds.size).toBe(3)
  })

  it('ends at a 7 × 7 arena at y = 0 behind the boss door', () => {
    for (const seed of SEEDS) {
      const m = generateGlacier(seed)
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
          // (The Frost Master's arena has its own two ice sheets.)
        }
      }
      const doors = m.doors.filter(d => d.boss)
      expect(doors).toHaveLength(1)
      expect(doors[0]!.to).toBe(arena.id)
      expect(t.floor[doors[0]!.j * m.w + doors[0]!.i]).toBe(0)
      expect(t.wallTop[arena.id]).toBeCloseTo(4.2)
    }
  })

  it('the objective trail finds the boss door from the pad, over the leap by its link', () => {
    for (const seed of SEEDS) {
      const m = generateGlacier(seed)
      const d = m.doors.find(x => x.boss)!
      const nav = createNav(m)
      const path = findPath(nav, m.start.x, m.start.z, cellCenter(d.i), cellCenter(d.j), 6000, 1, true)
      expect(path, `seed ${seed}`).not.toBeNull()
      // Never through a pillar.
      for (const [x, z] of path!) expect(m.navBlock[idx(m, x, z)]).toBe(0)
      // The tap-to-move alone (no links) cannot: the route needs the verbs.
      expect(findPath(nav, m.start.x, m.start.z, cellCenter(d.i), cellCenter(d.j), 6000, 1, false)).toBeNull()
    }
  })

  it('every section, checkpoint, reward, chest and the secret\'s buttons are reachable with the verbs', () => {
    for (const seed of SEEDS) {
      const m = generateGlacier(seed)
      const t = m.terrain!
      const got = reach(m)
      const where = `seed ${seed}`
      for (const r of m.rooms) {
        let any = false
        for (let j = r.z0; j < r.z0 + r.h && !any; j++) for (let i = r.x0; i < r.x0 + r.w; i++) if (got.has(j * m.w + i)) { any = true; break }
        expect(any, `${where}: room ${r.id}`).toBe(true)
      }
      for (const [n, c] of t.checkpoints.entries()) {
        for (const k of c.cells) expect(got.has(k), `${where}: checkpoint ${n} cell ${k}`).toBe(true)
      }
      for (const [n, r] of t.rewards.entries()) expect(got.has(idx(m, r.x, r.z)), `${where}: reward ${n} (${r.kind})`).toBe(true)
      for (const [n, c] of t.chests!.entries()) expect(got.has(idx(m, c.x, c.z)), `${where}: chest ${n}`).toBe(true)
      const s = t.secrets![0]!
      for (const b of s.buttons) {
        // The cell in front of each button, on its floor.
        expect(got.has(idx(m, b.x + b.nx * 1, b.z + b.nz * 1)), `${where}: button`).toBe(true)
      }
      const bossDoor = m.doors.find(d => d.boss)!
      expect(got.has(bossDoor.j * m.w + bossDoor.i), `${where}: boss door`).toBe(true)
    }
  })

  it('the weapon ledge needs its dash leap; the rest of the level does not hide behind one', () => {
    const m = generateGlacier(SEEDS[2]!)
    const t = m.terrain!
    const weapon = t.rewards.find(r => r.kind === 'weapon')!
    const links = t.links!
    t.links = links.filter(l => l.to[1] !== Math.floor(weapon.z / CELL))
    expect(reach(m).has(idx(m, weapon.x, weapon.z))).toBe(false)
    t.links = links
    expect(reach(m).has(idx(m, weapon.x, weapon.z))).toBe(true)
  })

  it('a checkpoint where every section starts; chests, rewards, one weapon ledge, one secret, its machines', () => {
    for (const seed of SEEDS) {
      const m = generateGlacier(seed)
      const t = m.terrain!
      for (const r of m.rooms) {
        if (r.role === 'boss') continue
        expect(t.checkpoints.some(c => c.room === r.id), `seed ${seed}: room ${r.id}`).toBe(true)
      }
      // In the order of the rooms: the section's first checkpoint comes first.
      // (The beam-in room's checkpoint leads the list; it is off the chain.)
      const rooms = t.checkpoints.map(c => c.room).filter(r => r !== m.beam?.room)
      expect([...rooms].sort((a, b) => a - b)).toEqual(rooms)
      expect(t.chests!.length).toBeGreaterThanOrEqual(2)
      expect(t.rewards.filter(r => r.kind === 'weapon')).toHaveLength(1)
      expect(t.rewards.filter(r => r.kind !== 'weapon').length).toBeGreaterThanOrEqual(2)
      expect(t.secrets).toHaveLength(1)
      expect(t.secrets![0]!.prize).toBe('tank')
      expect(t.foes.length).toBeGreaterThanOrEqual(15)
      expect(t.foes.length).toBeLessThanOrEqual(20)
    }
  })

  it('its props agree with the floors they stand on', () => {
    for (const seed of SEEDS.slice(0, 12)) {
      const m = generateGlacier(seed)
      const t = m.terrain!
      for (const L of t.ladders) {
        expect(t.floor[L.j * m.w + L.i]).toBe(L.y0)
        expect(t.floor[(L.j + L.dj) * m.w + L.i + L.di]).toBe(L.y1)
      }
      for (const lf of t.lifts) {
        expect(besideStop(m, lf.ax, lf.ay, lf.az).length).toBeGreaterThan(0)
        expect(besideStop(m, lf.bx, lf.by, lf.bz).length).toBeGreaterThan(0)
      }
      for (const f of t.foes) {
        expect(standable(m, idx(m, f.x, f.z))).toBe(true)
        expect(groundAt(m, f.x, f.z)).toBe(f.y)
      }
      for (const c of t.checkpoints) expect(groundAt(m, c.x, c.z)).toBe(c.y)
      for (const r of t.rewards) expect(groundAt(m, r.x, r.z)).toBe(r.y)
      for (const c of t.chests!) expect(groundAt(m, c.x, c.z)).toBe(c.y)
      for (const v of t.vents!) {
        expect(v.kind).toBe('frost')
        expect(t.floor[v.j * m.w + v.i]! + 1).toBe(v.y)
        // The nozzle's wall: no floor behind it.
        expect(m.cell[(v.j - v.dz) * m.w + v.i - v.dx]).toBe(Cell.Void)
      }
      for (const c of t.icicles!) expect(t.floor[c.j * m.w + c.i]).toBe(c.y)
      for (const p of t.icePillars!) {
        const k = p.j * m.w + p.i
        expect(m.navBlock[k]).toBe(1)
        expect(t.pit[k]).toBe(0)
      }
      expect(t.icePillars!.filter(p => p.cracked)).toHaveLength(1)
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

  it('ice: present, over spikes at the bridge and the stairs, and walled (no pit) in the lobby and the pillar hall', () => {
    for (const seed of SEEDS.slice(0, 12)) {
      const m = generateGlacier(seed)
      const t = m.terrain!
      const ice = t.ice!
      let cells = 0
      let overSpikes = 0
      const pitRoomsByIce = new Set<number>()
      for (let k = 0; k < ice.length; k++) {
        if (!ice[k]) continue
        cells++
        expect(t.pit[k]).toBe(0)
        const i = k % m.w
        const j = (k - i) / m.w
        for (const [di, dj] of DIRS) {
          const nk = (j + dj) * m.w + i + di
          if (!t.pit[nk]) continue
          expect(t.pitKind![m.room[nk]!]).toBe('spikes')
          overSpikes++
          pitRoomsByIce.add(m.room[k]!)
        }
      }
      expect(cells).toBeGreaterThan(30)
      expect(overSpikes).toBeGreaterThan(4)
      expect([...pitRoomsByIce].map(r => t.sections[r]).sort()).toEqual(['lift', 'spikes'])
      // Ice ends before every leap: the take-off cell is plain floor.
      for (const l of t.links!) expect(ice[l.from[1] * m.w + l.from[0]]).toBe(0)
      // The stairs are ice.
      expect(t.ramp.some((r, k) => r > 0 && ice[k] === 1)).toBe(true)
    }
  })
})

// ─── Ice ─────────────────────────────────────────────────────────────────────

describe('ice', () => {
  /** A long room at y = 0, all ice (or none). */
  const rink = (iced: boolean): MapData => {
    const b = new Builder(16, 3)
    b.addRoom(0, 0, 16, 3, 'start', 'hall', 0)
    if (iced) b.ice(0, 0, 15, 2)
    return finish(b, { x: cellCenter(1), z: cellCenter(1), yaw: YAW_PX }, 1)
  }

  /** The mission's walk rules: the stick held toward +X for `hold` s, then
   *  let go; how far Flux goes after letting go before he stops. */
  const glide = (iced: boolean, hold = 2): { after: number; top: number; stopped: boolean } => {
    const map = rink(iced)
    const run = new ClimbRun(hostFor(map), 1)
    const p = body(cellCenter(1), cellCenter(1))
    const out: [number, number] = [0, 0]
    let top = 0
    let x0 = 0
    for (let n = 0; n < 60 * 12; n++) {
      const t = n * DT
      const held = t < hold
      if (!held && x0 === 0) x0 = p.x
      const k = walkBlend(DT, false, false, run.moveMod(p).friction)
      p.vx += ((held ? WALK_SPEED : 0) - p.vx) * k
      p.vz += (0 - p.vz) * k
      top = Math.max(top, Math.hypot(p.vx, p.vz))
      run.stepBody(p, out, held ? 1 : 0, 0, DT, false)
      p.x = out[0]
      p.z = out[1]
      if (!held && Math.hypot(p.vx, p.vz) < 0.05) return { after: p.x - x0, top, stopped: true }
    }
    return { after: p.x - x0, top, stopped: false }
  }

  it('the Glacier builds its features in a fixed order; the Tower Run none', () => {
    const run = new ClimbRun(hostFor(generateGlacier(3)), 1)
    expect(run.features.map(f => f.constructor.name)).toEqual(['IceFeature', 'FrostThrowers', 'IcePillars', 'Icicles', 'SecretsFeature', 'CrumbleFeature'])
  })

  it('friction on ice cells only, on the ground only', () => {
    const map = rink(true)
    const f = new IceFeature(hostFor(map), map.terrain!)
    const mod = { friction: 1, pushX: 0, pushZ: 0 }
    const p = body(cellCenter(3), cellCenter(1))
    f.move(p, mod)
    expect(mod.friction).toBeCloseTo(ICE_FRICTION)
    mod.friction = 1
    p.ground = false
    f.move(p, mod)
    expect(mod.friction).toBe(1)
    const plain = rink(false)
    const g = new IceFeature(hostFor(plain), { ...plain.terrain!, ice: new Uint8Array(plain.w * plain.h) })
    p.ground = true
    g.move(p, mod)
    expect(mod.friction).toBe(1)
  })

  it('a let-go stick keeps sliding on ice and stops within a bounded distance; the walking speed is the same', () => {
    const ice = glide(true)
    const floor = glide(false)
    expect(floor.stopped).toBe(true)
    expect(floor.after).toBeLessThan(0.5)
    expect(ice.stopped).toBe(true)
    expect(ice.after).toBeGreaterThan(1.5)
    expect(ice.after).toBeLessThan(4)
    expect(ice.top).toBeLessThanOrEqual(WALK_SPEED + 1e-9)
    expect(ice.top).toBeGreaterThan(WALK_SPEED * 0.95)
  })

  it('Atlas: the first ice, ice by spikes and ice stairs, each once, and the save keeps them', () => {
    const m = generateGlacier(0)
    const said: AtlasLine[] = []
    const host = hostFor(m, { said, hits: [], marks: 0, sfx: [] })
    const f = new IceFeature(host, m.terrain!)
    // Everywhere on the level, on each floor.
    for (let k = 0; k < m.cell.length; k++) {
      if (m.cell[k] === Cell.Void || m.terrain!.pit[k]) continue
      const i = k % m.w
      const j = (k - i) / m.w
      f.update(DT, 0, body(cellCenter(i), cellCenter(j), m.terrain!.floor[k]! + m.terrain!.rise[k]!), true)
    }
    expect(said.sort()).toEqual(['hint.cryo.ice', 'hint.cryo.spikes', 'hint.cryo.stairs'])
    const g = new IceFeature(hostFor(m), m.terrain!)
    g.restore(f.save())
    expect(g.save()).toEqual([1, 1, 1])
  })
})

// ─── Frost throwers ──────────────────────────────────────────────────────────

describe('frost throwers', () => {
  /** A lane 3 cells across (z) at y = 3, a nozzle on its north wall at
   *  column 2 blasting +Z. */
  const lane = () => {
    const b = new Builder(8, 5)
    b.addRoom(1, 1, 6, 3, 'start', 'frost', 3)
    b.vents.push({ i: 2, j: 1, dx: 0, dz: 1, y: 4, period: 3, phase: 0, on: 1, room: 0, kind: 'frost' })
    return finish(b, { x: cellCenter(1), z: cellCenter(2), yaw: YAW_PX }, 1)
  }

  const run = (at: [number, number], seconds: number) => {
    const map = lane()
    const spy: Spy = { said: [], hits: [], marks: 0, sfx: [] }
    const f = new FrostThrowers(hostFor(map, spy), map.terrain!)
    const p = body(at[0], at[1], 3)
    const log: Array<{ t: number; hits: number; slow: number }> = []
    for (let n = 0; n * DT < seconds; n++) {
      f.update(DT, n * DT, p, true)
      log.push({ t: n * DT, hits: spy.hits.length, slow: f.slowT })
    }
    return { f, spy, p, log }
  }

  it('telegraphs (hiss, lane marked) before it blasts; a blast costs a tenth, not blockable, once per blast', () => {
    const { spy, log } = run([cellCenter(2), cellCenter(3)], 6.2)
    expect(spy.sfx).toContain('trapHiss')
    expect(spy.marks).toBeGreaterThanOrEqual(3)
    // Nothing during the warning.
    expect(log.find(l => l.hits > 0)!.t).toBeGreaterThanOrEqual(FROST_WARN - 1e-9)
    // Two cycles, two hits.
    expect(spy.hits).toHaveLength(2)
    for (const h of spy.hits) {
      expect(h.dmg).toBe(100 * FROST_COST)
      expect(h.blockable).toBe(false)
    }
  })

  it('misses a body in the next column, or on another floor', () => {
    expect(run([cellCenter(4), cellCenter(3)], 3.5).spy.hits).toHaveLength(0)
    const map = lane()
    const spy: Spy = { said: [], hits: [], marks: 0, sfx: [] }
    const f = new FrostThrowers(hostFor(map, spy), map.terrain!)
    for (let n = 0; n * DT < 3; n++) f.update(DT, n * DT, body(cellCenter(2), cellCenter(3), 6), true)
    expect(spy.hits).toHaveLength(0)
  })

  it('a hit slows Flux by FROST_SLOW for SLOW_TIME s, on the ground', () => {
    const { f, log } = run([cellCenter(2), cellCenter(3)], 2.5)
    const hitAt = log.find(l => l.hits > 0)!.t
    expect(log.find(l => l.hits > 0)!.slow).toBeCloseTo(SLOW_TIME, 1)
    const p = body(cellCenter(5), cellCenter(2), 3)
    p.vx = 4
    p.vz = -2
    const mod = { friction: 1, pushX: 0, pushZ: 0 }
    f.move(p, mod)
    // The step's walk: (v + push) = (1 − FROST_SLOW) v.
    expect(p.vx + mod.pushX).toBeCloseTo(4 * (1 - FROST_SLOW))
    expect(p.vz + mod.pushZ).toBeCloseTo(-2 * (1 - FROST_SLOW))
    // Not in the air (a leap is never cut short).
    const q = { ...p, ground: false }
    const m2 = { friction: 1, pushX: 0, pushZ: 0 }
    f.move(q, m2)
    expect(m2.pushX).toBe(0)
    // Gone after SLOW_TIME (away from the lane).
    const t0 = 2.5
    for (let n = 0; (n * DT) < SLOW_TIME - (t0 - hitAt) + 0.05; n++) f.update(DT, t0 + n * DT, body(cellCenter(5), cellCenter(2), 3), true)
    expect(f.slowT).toBe(0)
    const m3 = { friction: 1, pushX: 0, pushZ: 0 }
    f.move(p, m3)
    expect(m3.pushX).toBe(0)
  })

  it('the slow reaches the body through the climb\'s walk', () => {
    const map = lane()
    const host = hostFor(map)
    const r = new ClimbRun(host, 1)
    const f = r.features[0] as FrostThrowers
    f.slowT = 1
    const p = body(cellCenter(5), cellCenter(2), 3)
    p.vx = 3
    const out: [number, number] = [0, 0]
    r.stepBody(p, out, 0, 0, 0.1, false)
    expect(out[0] - p.x).toBeCloseTo(0.3 * (1 - FROST_SLOW))
  })
})

// ─── Icicles ─────────────────────────────────────────────────────────────────

describe('icicles', () => {
  const hall = () => {
    const b = new Builder(8, 5)
    b.addRoom(1, 1, 6, 3, 'start', 'icicles', 9)
    b.icicles.push({ i: 3, j: 2, y: 9, period: 3, phase: 0, room: 0 })
    return finish(b, { x: cellCenter(1), z: cellCenter(2), yaw: YAW_PX }, 1)
  }

  const run = (at: [number, number], seconds: number) => {
    const map = hall()
    const spy: Spy = { said: [], hits: [], marks: 0, sfx: [] }
    const f = new Icicles(hostFor(map, spy), map.terrain!)
    const times: number[] = []
    for (let n = 0; n * DT < seconds; n++) {
      const before = spy.hits.length
      f.update(DT, n * DT, body(at[0], at[1], 9), true)
      if (spy.hits.length > before) times.push(n * DT)
    }
    return { f, spy, times }
  }

  it('a ring grows first; it hits who stands under it when it lands, once a drop, not blockable', () => {
    const { spy, times, f } = run([cellCenter(3) + 0.6, cellCenter(2)], 6.5)
    expect(spy.marks).toBe(3)
    expect(times).toHaveLength(2)
    expect(times[0]).toBeGreaterThanOrEqual(ICICLE_WARN + ICICLE_FALL - DT)
    expect(times[0]).toBeLessThan(ICICLE_WARN + ICICLE_FALL + 2 * DT)
    expect(times[1]! - times[0]!).toBeCloseTo(3, 1)
    expect(spy.hits[0]).toEqual({ dmg: 100 * ICICLE_COST, kind: 'aoe', blockable: false })
    // Hanging again (grown back) before the next warning ends.
    expect(f.icicles[0]!.mesh.visible).toBe(true)
  })

  // Playtest: "the icicles spawn from a ceiling where there is no ceiling".
  it('the hall has a roof at the icicles\' roots, over the whole room; the real Icicle hall too', () => {
    const { f } = run([cellCenter(1), cellCenter(2)], 0.1)
    expect(f.roofs).toHaveLength(1)
    const r = f.roofs[0]!
    // Over the room (cells 1..6 × 1..3), just above the root (9 + 4.6 m).
    expect([r.x, r.z, r.w, r.d]).toEqual([4 * CELL, 2.5 * CELL, 6 * CELL, 3 * CELL])
    expect(r.y).toBeGreaterThan(9 + 4.6)
    expect(r.y).toBeLessThan(9 + 4.6 + 0.3)
    expect(f.icicles[0]!.mesh.position.y).toBeLessThan(r.y)

    for (const seed of SEEDS.slice(0, 4)) {
      const map = generateGlacier(seed)
      const spy: Spy = { said: [], hits: [], marks: 0, sfx: [] }
      const g = new Icicles(hostFor(map, spy), map.terrain!)
      const rooms = new Set(g.icicles.map(c => map.room[c.def.j * map.w + c.def.i]))
      expect(g.roofs.map(q => q.room).sort()).toEqual([...rooms].sort())
    }
  })

  it('misses a body a cell away, or a floor below', () => {
    expect(run([cellCenter(4), cellCenter(2)], 3.5).spy.hits).toHaveLength(0)
    const map = hall()
    const spy: Spy = { said: [], hits: [], marks: 0, sfx: [] }
    const f = new Icicles(hostFor(map, spy), map.terrain!)
    for (let n = 0; n * DT < 3; n++) f.update(DT, n * DT, body(cellCenter(3), cellCenter(2), 6), true)
    expect(spy.hits).toHaveLength(0)
  })
})

// ─── Ice pillars ─────────────────────────────────────────────────────────────

describe('ice pillars', () => {
  it('solid to bodies and shots; a cracked one shot down opens its cell, and stays down in the save', () => {
    const m = generateGlacier(11)
    const host = hostFor(m)
    const r = new ClimbRun(host, 1)
    const f = r.features.find(x => x instanceof IcePillars) as IcePillars
    const cracked = f.pillars.find(p => p.def.cracked)!
    const whole = f.pillars.find(p => !p.def.cracked)!
    expect(host.nav.props.filter(p => p.r === PILLAR_R && p.active)).toHaveLength(f.pillars.length)
    // A whole pillar stops shots and never breaks.
    for (let n = 0; n < 10; n++) expect(r.shotHits(whole.x, whole.y + 1.5, whole.z + PILLAR_R, 0.1, 3)).toBe(true)
    expect(whole.broken).toBe(false)
    // Over it, or beside it: no hit.
    expect(r.shotHits(whole.x, whole.y + 8, whole.z, 0.1, 0)).toBe(false)
    expect(r.shotHits(whole.x + PILLAR_R + 0.5, whole.y + 1, whole.z, 0.1, 0)).toBe(false)
    // The cracked one: three quick shots.
    expect(r.shotHits(cracked.x, cracked.y + 1.5, cracked.z, 0.1, 0)).toBe(true)
    expect(r.shotHits(cracked.x, cracked.y + 1.5, cracked.z, 0.1, 0)).toBe(true)
    expect(cracked.broken).toBe(false)
    expect(m.navBlock[cracked.k]).toBe(1)
    expect(r.shotHits(cracked.x, cracked.y + 1.5, cracked.z, 0.1, 0)).toBe(true)
    expect(cracked.broken).toBe(true)
    expect(cracked.prop.active).toBe(false)
    expect(m.navBlock[cracked.k]).toBe(0)
    // Shots pass where it stood.
    expect(r.shotHits(cracked.x, cracked.y + 1.5, cracked.z, 0.1, 0)).toBe(false)
    // A resumed stage: still down.
    const m2 = generateGlacier(11)
    const host2 = hostFor(m2)
    const r2 = new ClimbRun(host2, 1)
    r2.restore(r.save())
    const f2 = r2.features.find(x => x instanceof IcePillars) as IcePillars
    expect(f2.pillars.find(p => p.def.cracked)!.broken).toBe(true)
    expect(m2.navBlock[cracked.k]).toBe(0)
  })

  it('a charged shot breaks a cracked pillar at once; the shortcut shortens the trail', () => {
    const m = generateGlacier(11)
    const host = hostFor(m)
    const r = new ClimbRun(host, 1)
    const f = r.features.find(x => x instanceof IcePillars) as IcePillars
    const cracked = f.pillars.find(p => p.def.cracked)!
    const hall = m.rooms[3]!
    // From the hall's entry to its exit.
    const cp = m.terrain!.checkpoints.find(c => c.room === 3)!
    const exit = m.doors.find(d => d.from === 3)!
    const before = findPath(host.nav, cp.x, cp.z, cellCenter(exit.i), cellCenter(exit.j), 4000, 1)!
    r.shotHits(cracked.x, cracked.y + 1, cracked.z, 0.2, 1)
    expect(cracked.broken).toBe(true)
    const after = findPath(host.nav, cp.x, cp.z, cellCenter(exit.i), cellCenter(exit.j), 4000, 1)!
    expect(after.length).toBeLessThan(before.length)
    expect(hall.w * hall.h).toBeGreaterThan(0)
  })
})
