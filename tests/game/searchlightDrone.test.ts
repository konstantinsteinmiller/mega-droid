// The Searchlight Drone (#142, sim/enemies.ts "Searchlight Drone",
// models/enemies.ts buildSpotter, fx/searchBeam.ts): it sweeps a pool of light
// after Flux, slower than he walks (faster in the dark); caught, it locks for
// a red wind-up he can walk out of, then calls a strike down on the pool — a
// red marker first, the blast after. The strike is called in: it lands even
// if the drone is dazed or shot down. Its lamp is its weak spot: a shot on it
// puts the light out. While it lights him, its room-mates attack sooner. It
// is the Blackout Boulevard's second machine: met alone first, then over the
// Stalkers; and it is in the neon sector's job table and its Tower Run drones.

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/game/fx/markers', async () => {
  const { Mesh, Group } = await import('three')
  return { makeBlobShadow: () => new Mesh(), makeTeleRing: () => new Group(), setTeleRing: () => {} }
})
vi.mock('@/game/world/textures', async (orig) => {
  const { Texture } = await import('three')
  return { ...(await orig<object>()), glowTexture: () => new Texture(), ringTexture: () => new Texture() }
})

import { Scene } from 'three'
import {
  createEnemy, updateEnemy, syncEnemyVisual, smashLamp, spotlit,
  SPOT_LOCK, SPOT_FUSE, SPOT_SWEEP, SPOT_DARK, SPOT_TRACK, SPOT_BLIND, SPOT_RUSH, SPOT_STRIKE_R, SPOT_SLIP
} from '@/game/sim/enemies'
import { CombatSystem, type CombatHost } from '@/game/sim/combat'
import { spawnClimb } from '@/game/sim/climbSpawn'
import { spawnEncounters } from '@/game/sim/spawn'
import { spotterParts } from '@/game/models/enemies'
import { createNav } from '@/game/world/nav'
import { CELL, type MapData } from '@/game/world/levelGen'
import { generateBlackoutBoulevard } from '@/game/world/stages/neon'
import { generateClimb } from '@/game/world/climbGen'
import { generateMap } from '@/game/world/levelGen'
import { SECTOR_BY_ID, SECTORS } from '@/game/data/regions'
import { ENEMIES } from '@/game/data/enemies'
import { ENEMY_WEAK, weakSpotFacing } from '@/game/data/weakspots'
import { WALK_SPEED } from '@/game/sim/constants'
import type { Enemy, World } from '@/game/sim/world'
import { coplanarOverlaps } from './coplanar'

const DT = 1 / 60
const noop = (): void => {}

const rng = (seed: number) => () => {
  seed = (Math.imul(seed ^ (seed >>> 15), 2246822507) + 0x9e3779b9) >>> 0
  seed ^= seed >>> 13
  return (seed >>> 0) / 4294967296
}
beforeEach(() => {
  const dice = vi.spyOn(Math, 'random').mockImplementation(rng(0x5b07))
  return () => dice.mockRestore()
})

// ─── Harness ────────────────────────────────────────────────────────────────

/** A 120 m open field (one room); `wallX`: a wall of solid cells down x = wallX. */
const field = (wallX?: number): MapData => {
  const W = 40
  const cell = new Uint8Array(W * W).fill(1)
  if (wallX !== undefined) for (let j = 0; j < W; j++) cell[j * W + wallX] = 0
  return { w: W, h: W, cell, pillars: [], room: new Int16Array(W * W), rooms: [], navBlock: new Uint8Array(W * W) } as unknown as MapData
}

interface Log { hits: Array<{ t: number; blockable: boolean; kind: string; x: number; z: number }>; marks: Array<{ t: number; x: number; z: number; r: number; dur: number }> }

/** A drone at (61.5, 31.5) facing +Z (cell middles: a sight line along a
 *  cell edge flickers), a real CombatSystem, Flux `dist` m up +Z. */
const setup = (dist = 8, map = field()) => {
  const e = createEnemy('spotter', 1, 61.5, 31.5, 0)
  e.yaw = 0
  const log: Log = { hits: [], marks: [] }
  const w = {
    scene: new Scene(), map, nav: createNav(map), time: 0,
    player: { x: 61.5, z: 31.5 + dist, yaw: Math.PI, pitch: 0 },
    combat: { iframes: 0, charging: false, charge: 0 } as unknown as World['combat'],
    enemies: [e] as Enemy[],
    fx: { sparks: noop, emit: noop, orbBurst: noop, flash: noop, riseRing: noop },
    markers: { spawn: (x: number, z: number, r: number, dur: number) => { log.marks.push({ t: w.time, x, z, r, dur }) } },
    shocks: { spawn: noop, spawnLinear: noop },
    stats: { critChance: 0, critMul: 1.5, piercing: false, boltMul: 1, magnetMul: 1, parryBonus: 0, busterDmg: 10, chargeTimeMul: 1 },
    hitStop: 0,
    onEnemyKilled: vi.fn(), onPickup: noop, onPlayerHurt: noop, onPlayerDown: noop,
    fireEnemyShot: vi.fn(), lobShell: vi.fn(), spawnWave: noop, spawnRing: noop, fireOrb: noop,
    hitPlayer: (_e: Enemy | null, _d: number, o: { blockable: boolean; kind: string }) => {
      log.hits.push({ t: w.time, blockable: o.blockable, kind: o.kind, x: w.player.x, z: w.player.z })
      return 'hit'
    },
    shake: noop, sfx: noop
  } as unknown as World & CombatHost
  const sys = new CombatSystem(w)
  return { w, e, sys, log }
}

const tick = (w: World, e: Enemy, n = 1, each?: () => void): void => {
  for (let i = 0; i < n; i++) {
    w.time += DT
    each?.()
    for (const o of w.enemies) updateEnemy(w, o, DT)
    syncEnemyVisual(e, 1, w.time)
  }
}

/** Run until `until` holds (or `max` s pass); returns whether it did. */
const runUntil = (w: World, e: Enemy, until: () => boolean, max = 15, each?: () => void): boolean => {
  for (let i = 0; i < max / DT; i++) {
    if (until()) return true
    tick(w, e, 1, each)
  }
  return until()
}

// ─── The model ──────────────────────────────────────────────────────────────

describe('the Searchlight Drone\'s model', () => {
  it('no two of its parts lie in one plane (no z-fighting)', () => {
    const b = spotterParts()
    b.build()
    expect(coplanarOverlaps(b.partGeometries)).toBe(0)
  })

  it('its lamp is its weak spot, seen from the front (where it shines), not from behind', () => {
    const w = ENEMY_WEAK.spotter
    expect(w.fwd).toBeGreaterThan(0.3)
    const body = { x: 0, y: 3.3, z: 0, yaw: 0, elite: false, boss: false, kind: 'spotter' as const, def: { aimY: 0 } }
    expect(weakSpotFacing(body, 0, 8)).toBe(true)
    expect(weakSpotFacing(body, 0, -8)).toBe(false)
  })
})

// ─── Its light and its strike ───────────────────────────────────────────────

describe('the Searchlight Drone: light, lock, strike', () => {
  it('sweeps slower than Flux walks — faster in the dark, still slower', () => {
    expect(SPOT_SWEEP).toBeLessThan(WALK_SPEED)
    expect(SPOT_SWEEP * SPOT_DARK).toBeLessThan(WALK_SPEED)
    expect(SPOT_TRACK).toBeLessThan(WALK_SPEED)
    const speed = (gloom: number): number => {
      const r = setup(30)
      r.w.gloom = gloom
      r.e.awake = true
      r.e.state = 'engage'
      r.e.cd = 999
      tick(r.w, r.e)
      const s = r.e.spot!
      const x0 = s.x
      const z0 = s.z
      tick(r.w, r.e, 30)
      return Math.hypot(s.x - x0, s.z - z0) / (30 * DT)
    }
    const lit = speed(0)
    const dark = speed(1)
    expect(lit).toBeLessThanOrEqual(SPOT_SWEEP + 1e-6)
    expect(lit).toBeCloseTo(SPOT_SWEEP, 2)
    expect(dark).toBeLessThanOrEqual(SPOT_SWEEP * SPOT_DARK + 1e-6)
    expect(dark / lit).toBeCloseTo(SPOT_DARK, 2)
  })

  it('a Flux who stands in its light: a red lock of SPOT_LOCK, then a marker, then the blast — never a hit before', () => {
    const r = setup(8)
    expect(SPOT_LOCK).toBeGreaterThanOrEqual(0.6)
    expect(ENEMIES.spotter.unblockable).toBe(true)
    let teleFrom = -1
    let teleLen = 0
    runUntil(r.w, r.e, () => r.log.hits.length > 0, 20, () => {
      if (r.e.state === 'tele' && teleFrom < 0) teleFrom = r.w.time
      if (r.e.state === 'act' && teleFrom >= 0 && !teleLen) teleLen = r.w.time - teleFrom
    })
    expect(r.log.hits.length).toBe(1)
    expect(r.e.attack).toBe('lock')
    expect(r.e.teleRed).toBe(true)
    expect(teleLen).toBeGreaterThanOrEqual(SPOT_LOCK - 0.05)
    // The marker went down where the light was, SPOT_FUSE before the blast
    expect(r.log.marks.length).toBe(1)
    const m = r.log.marks[0]!
    expect(m.dur).toBe(SPOT_FUSE)
    expect(m.r).toBe(SPOT_STRIKE_R)
    expect(Math.hypot(m.x - r.w.player.x, m.z - r.w.player.z)).toBeLessThan(SPOT_STRIKE_R)
    const h = r.log.hits[0]!
    expect(h.t - m.t).toBeGreaterThanOrEqual(SPOT_FUSE - 0.02)
    expect(h.t - teleFrom).toBeGreaterThanOrEqual(SPOT_LOCK + SPOT_FUSE - 0.05)
    expect(h.blockable).toBe(false)
    expect(h.kind).toBe('aoe')
  })

  it('walking out of the light during the lock loses it, even from its middle: no marker, no strike', () => {
    expect(SPOT_SLIP / (WALK_SPEED - SPOT_TRACK)).toBeLessThan(SPOT_LOCK - 0.25)
    const r = setup(8)
    expect(runUntil(r.w, r.e, () => r.e.state === 'tele')).toBe(true)
    // Caught dead in its middle (the worst case)
    r.e.spot!.x = r.w.player.x
    r.e.spot!.z = r.w.player.z
    // Flux walks off sideways at his walking pace
    runUntil(r.w, r.e, () => r.e.state !== 'tele', 2, () => { r.w.player.x += WALK_SPEED * DT })
    expect(r.e.attack).toBe('lost')
    tick(r.w, r.e, Math.round(2 / DT), () => { r.w.player.x += WALK_SPEED * DT })
    expect(r.log.marks.length).toBe(0)
    expect(r.log.hits.length).toBe(0)
  })

  it('stepping out of its sight (behind a wall) during the lock loses it too', () => {
    // A wall down x = 21 (63–66 m): the drone at x 61.5, Flux steps to x 67.5
    const r = setup(8, field(21))
    expect(runUntil(r.w, r.e, () => r.e.state === 'tele')).toBe(true)
    r.w.player.x = 67.5
    // Hold its light on him, so only the sight line decides
    r.e.spot!.x = r.w.player.x
    r.e.spot!.z = r.w.player.z
    tick(r.w, r.e, 2)
    expect(r.e.state).not.toBe('tele')
    expect(r.e.attack).toBe('lost')
    expect(r.log.marks.length).toBe(0)
  })

  it('a strike called in lands even when the drone is shot down meanwhile', () => {
    const r = setup(8)
    expect(runUntil(r.w, r.e, () => r.log.marks.length > 0)).toBe(true)
    r.e.hp = 0
    r.e.state = 'dead'
    tick(r.w, r.e, Math.ceil(SPOT_FUSE / DT) + 2)
    expect(r.log.hits.length).toBe(1)
    // …and only where it was called: a Flux who stepped out takes nothing
    const r2 = setup(8)
    expect(runUntil(r2.w, r2.e, () => r2.log.marks.length > 0)).toBe(true)
    r2.w.player.x += SPOT_STRIKE_R + 1
    tick(r2.w, r2.e, Math.ceil(SPOT_FUSE / DT) + 2)
    expect(r2.log.hits.length).toBe(0)
  })

  it('a shot on its lamp (the weak spot) puts the light out and dazes it: no lock while it is out', () => {
    const r = setup(8)
    expect(runUntil(r.w, r.e, () => r.e.state === 'tele')).toBe(true)
    r.sys.damageEnemy(r.e, 10, { crit: false, charge: 0, fromX: r.w.player.x, fromZ: r.w.player.z, x: r.e.x, y: 3.2, z: r.e.z + 0.4, color: '#fff', weakSpot: true })
    expect(r.e.state).toBe('stun')
    expect(r.e.spot!.blind).toBeCloseTo(SPOT_BLIND, 5)
    // While the light is out: nothing locks, nothing is called down
    tick(r.w, r.e, Math.floor((SPOT_BLIND - 0.1) / DT))
    expect(r.e.spot!.lit).toBe(false)
    expect(r.log.marks.length).toBe(0)
    expect(r.log.hits.length).toBe(0)
    // Not again while it is out (no daze-lock)
    expect(smashLamp(r.w, r.e)).toBe(false)
    // A body shot does not put it out
    const r2 = setup(8)
    r2.sys.damageEnemy(r2.e, 10, { crit: false, charge: 0, fromX: r2.w.player.x, fromZ: r2.w.player.z, x: r2.e.x, y: 3.3, z: r2.e.z, color: '#fff' })
    expect(r2.e.spot!.blind).toBe(0)
  })

  it('an unaware drone whose light finds Flux wakes (even where it cannot see him)', () => {
    // Flux behind a wall (x = 21: 63–66 m) the drone at x 61.5 cannot see past
    const r = setup(8, field(21))
    r.w.player.x = 70
    tick(r.w, r.e, 30)
    expect(r.e.awake).toBe(false)
    r.e.spot!.x = r.w.player.x
    r.e.spot!.z = r.w.player.z
    tick(r.w, r.e)
    expect(r.e.awake).toBe(true)
  })

  it('while it lights Flux, the other machines of its room attack sooner', () => {
    const r = setup(8)
    const st = createEnemy('stalker', 1, 50, 30, 0)
    st.awake = true
    st.state = 'engage'
    st.cd = 10
    r.w.enemies.push(st)
    r.e.spot!.lit = true
    expect(spotlit(r.w, st)).toBe(true)
    expect(spotlit(r.w, r.e)).toBe(false)
    // One engage tick of the stalker alone: its clock runs SPOT_RUSH fast
    r.e.state = 'stun'
    r.e.stunT = 99
    const before = st.cd
    r.w.player.x = 200 // out of its sight: it only counts down
    r.e.spot!.x = 200
    r.e.spot!.z = 30 + 8
    updateEnemy(r.w, st, DT)
    expect(before - st.cd).toBeCloseTo(DT * SPOT_RUSH, 5)
  })
})

// ─── Where it is met ────────────────────────────────────────────────────────

const SEEDS = Array.from({ length: 16 }, (_, i) => (i * 2654435761 + 1013904223) >>> 0)

describe('the Searchlight Drone in the Blackout Boulevard', () => {
  it('is met alone first (the Billboard Drop), then in three later rooms with the Stalkers, never in the arena', () => {
    for (const seed of SEEDS) {
      const m = generateBlackoutBoulevard(seed)
      const foes = m.terrain!.foes
      const drones = foes.filter(f => f.kind === 'spotter')
      expect(drones.length, `seed ${seed}`).toBe(4)
      const rooms = drones.map(d => d.room)
      expect(new Set(rooms).size).toBe(4)
      // Room order is the route's order: the first drone comes before the others
      const first = Math.min(...rooms)
      const firstRoom = m.rooms[first]!
      expect(m.terrain!.sections[first]).toBe('descent')
      // Its first room: the only flyer or cannon there, and the Stalker below it keeps to a lower floor
      const mates = foes.filter(f => f.room === first && f.kind !== 'spotter')
      expect(mates.every(f => f.role === 'ground'), `seed ${seed}`).toBe(true)
      const d0 = drones.find(d => d.room === first)!
      for (const f of mates) expect(f.y, `seed ${seed}`).toBeLessThan(d0.y)
      expect(firstRoom.role).not.toBe('boss')
      // Every later one flies with the stage's own machine, the Glow Stalker
      for (const r of rooms.filter(x => x !== first)) {
        expect(m.rooms[r]!.role).not.toBe('boss')
        expect(foes.some(f => f.room === r && f.kind === 'stalker'), `seed ${seed} room ${r}`).toBe(true)
      }
      // Each hovers inside its own room, over its floor band
      for (const d of drones) {
        const i = Math.floor(d.x / CELL)
        const j = Math.floor(d.z / CELL)
        expect(m.room[j * m.w + i]).toBe(d.room)
        expect(d.fly).toBeTruthy()
        expect(d.leash[0]).toBeLessThan(d.leash[2])
        expect(d.leash[1]).toBeLessThan(d.leash[3])
      }
    }
  })

  it('the stage\'s cast builds them as drones; its unnamed flyer posts stay Rotor Drones', async () => {
    const m = generateBlackoutBoulevard(SEEDS[3]!)
    const cast = await spawnClimb(m, SECTOR_BY_ID.neon.encounters, 25)
    expect(cast.filter(e => e.kind === 'spotter').length).toBe(4)
    const flyers = m.terrain!.foes.map((f, n) => [f, cast[n]!] as const).filter(([f]) => f.role === 'flyer' && !f.kind)
    expect(flyers.length).toBeGreaterThan(0)
    for (const [, e] of flyers) expect(e.kind).toBe('heli')
  })
})

describe('the Searchlight Drone in the neon sector\'s spawn mix', () => {
  it('is in the neon table only, beside the Glow Stalker', () => {
    const neon = SECTOR_BY_ID.neon.encounters.kinds.map(([k]) => k)
    expect(neon).toContain('spotter')
    expect(neon).toContain('stalker')
    for (const s of SECTORS) if (s.id !== 'neon') expect(s.encounters.kinds.some(([k]) => k === 'spotter'), s.id).toBe(false)
  })

  it('turns up in neon jobs', async () => {
    let n = 0
    for (const seed of SEEDS.slice(0, 6)) {
      const map = generateMap({ seed, rooms: 11, boss: false, challenge: false })
      const cast = await spawnEncounters(map, SECTOR_BY_ID.neon.encounters, 25)
      n += cast.filter(e => e.kind === 'spotter').length
    }
    expect(n).toBeGreaterThan(0)
  })

  it('a neon Tower Run rolls it for some flyer posts; another sector\'s never', async () => {
    let neon = 0
    let heli = 0
    for (const seed of SEEDS.slice(0, 8)) {
      const m = generateClimb(seed, false)
      const cast = await spawnClimb(m, SECTOR_BY_ID.neon.encounters, 25, { tower: true })
      neon += cast.filter(e => e.kind === 'spotter').length
      heli += cast.filter(e => e.kind === 'heli').length
      const rotor = await spawnClimb(m, SECTOR_BY_ID.rotor.encounters, 25, { tower: true })
      expect(rotor.some(e => e.kind === 'spotter')).toBe(false)
    }
    expect(neon).toBeGreaterThan(0)
    expect(heli).toBeGreaterThan(0)
  })
})

// ─── Its name and Atlas's line ──────────────────────────────────────────────

const locales = import.meta.glob('@/i18n/locales/*.ts', { eager: true }) as Record<string, { default: Record<string, unknown> }>
const at = (o: unknown, key: string): unknown => key.split('.').reduce<unknown>((x, k) => (x as Record<string, unknown> | undefined)?.[k], o)

describe('the Searchlight Drone in every language', () => {
  it('has its name, its plural and Atlas\'s first-sight line in every locale', () => {
    const files = Object.entries(locales)
    expect(files.length).toBeGreaterThan(30)
    for (const [file, mod] of files) {
      const l = mod.default
      for (const k of ['enemy.spotter', 'enemyPlural.spotter', 'atlas.scan.spotter']) {
        expect(typeof at(l, k), `${file} ${k}`).toBe('string')
        expect((at(l, k) as string).length, `${file} ${k}`).toBeGreaterThan(0)
      }
      expect(at(l, 'enemyPlural.spotter') as string, file).toContain('|')
      expect(at(l, 'atlas.scan.spotter') as string, file).toContain('{enemy}')
    }
  })
})
