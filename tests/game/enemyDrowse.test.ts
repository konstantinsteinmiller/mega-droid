// Machines left far behind go back to sleep (#161). A playtest woke five rooms
// of Magnet one after another and frame time crept from 17 to 21-36 ms with
// hitches; a fresh load ran the same rooms at 60 fps. Every room woken and
// left kept its machines chasing Flux across the map: an A* that runs out of
// budget and fails, from scratch every 0.7 s per machine, and sight rays the
// length of the map. Here Flux tours a mission's rooms the way the playtest
// did, waking each room's cast and moving on; the machines behind him must
// fall asleep, and the A* work per second must not grow with the rooms woken.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ paths: 0 }))

vi.mock('@/game/fx/markers', async () => {
  const { Mesh, Group } = await import('three')
  return { makeBlobShadow: () => new Mesh(), makeTeleRing: () => new Group(), setTeleRing: () => {} }
})
vi.mock('@/game/world/textures', async (orig) => {
  const { Texture } = await import('three')
  return { ...(await orig<object>()), levelAtlas: () => new Texture(), glowTexture: () => new Texture(), ringTexture: () => new Texture() }
})
vi.mock('@/game/world/nav', async (orig) => {
  const m = await orig<typeof import('@/game/world/nav')>()
  return { ...m, findPath: (...a: Parameters<typeof m.findPath>) => { h.paths++; return m.findPath(...a) } }
})

import { updateEnemy, wake, drowse, DROWSE_R, DROWSE_AFTER } from '@/game/sim/enemies'
import { spawnEncounters } from '@/game/sim/spawn'
import { createNav, hasLineOfSight } from '@/game/world/nav'
import { generateMap, CELL, type MapData } from '@/game/world/levelGen'
import { SECTOR_BY_ID } from '@/game/data/regions'
import type { Enemy, World } from '@/game/sim/world'

const DT = 1 / 60
const noop = (): void => {}

/** Seeded [0, 1) stream: the AI rolls Math.random, the tour replays one run. */
const rng = (seed: number) => () => {
  seed = (Math.imul(seed ^ (seed >>> 15), 2246822507) + 0x9e3779b9) >>> 0
  seed ^= seed >>> 13
  return (seed >>> 0) / 4294967296
}
beforeEach(() => {
  h.paths = 0
  const dice = vi.spyOn(Math, 'random').mockImplementation(rng(0x161))
  return () => dice.mockRestore()
})

const worldOf = (map: MapData, enemies: Enemy[]): World => ({
  map, nav: createNav(map), time: 0,
  player: { x: map.start.x, z: map.start.z, yaw: 0, pitch: 0 },
  combat: { iframes: 1e9, charging: false, charge: 0 } as unknown as World['combat'],
  enemies,
  fx: { sparks: noop, emit: noop, orbBurst: noop, flash: noop, riseRing: noop } as unknown as World['fx'],
  markers: { spawn: noop } as unknown as World['markers'],
  shocks: { spawn: noop, spawnLinear: noop } as unknown as World['shocks'],
  fireEnemyShot: noop, lobShell: noop, spawnWave: noop, spawnRing: noop, fireOrb: noop,
  pull: noop, slowPlayer: noop,
  hitPlayer: () => 'miss', shake: noop, sfx: noop
})

/** Seconds Flux spends in each room. */
const STAY_S = 8

/** Awake, far behind Flux and out of his sight: what `drowse` is for. */
const farBehind = (w: World, e: Enemy): boolean =>
  Math.hypot(e.x - w.player.x, e.z - w.player.z) >= DROWSE_R && !hasLineOfSight(w.nav, e.x, e.z, w.player.x, w.player.z)
const awake = (cast: Enemy[]): Enemy[] => cast.filter(e => e.awake && e.state !== 'dead')

/**
 * Flux's tour: every room's middle in turn, its cast woken on arrival (as a
 * shot or a look would), STAY_S there. The mission's own order: `drowse`,
 * then `updateEnemy`. Per room on leaving: machines awake, those of them
 * far behind, and the A* searches of that stay.
 */
const tour = async (seed: number, sleepy: boolean) => {
  const map = generateMap({ seed, rooms: 18, boss: false })
  const cast = await spawnEncounters(map, SECTOR_BY_ID.magnet.encounters, 19)
  const w = worldOf(map, cast)
  const rows: Array<{ awake: number; farAwake: number; paths: number }> = []
  map.rooms.forEach((room, i) => {
    w.player.x = (room.x0 + room.w / 2) * CELL
    w.player.z = (room.z0 + room.h / 2) * CELL
    for (const e of cast) if (e.room === i && !e.hold && !e.dormant) wake(w, e)
    const paths0 = h.paths
    for (let t = 0; t < Math.round(STAY_S / DT); t++) {
      w.time += DT
      for (const e of cast) {
        if (sleepy) drowse(w, e, DT)
        updateEnemy(w, e, DT)
      }
    }
    const up = awake(cast)
    rows.push({ awake: up.length, farAwake: up.filter(e => farBehind(w, e)).length, paths: h.paths - paths0 })
  })
  return { rows, cast, w }
}

const sum = <K extends 'paths' | 'farAwake'>(rows: Array<Record<K, number>>, k: K): number => rows.reduce((s, r) => s + r[k], 0)

describe('machines left far behind go back to sleep', () => {
  it.each([1611, 77])('mission %i: the machines behind doze off, and the work stays flat as rooms are woken', async (seed) => {
    const control = (await tour(seed, false)).rows
    const { rows } = await tour(seed, true)
    // Control: without it, every room woken stays awake, much of it far
    // behind, chasing from across the map.
    expect(control.at(-1)!.awake).toBeGreaterThan(30)
    expect(Math.max(...control.map(r => r.farAwake))).toBeGreaterThan(15)
    expect(sum(control, 'farAwake')).toBeGreaterThan(100)
    // With it, next to none stays awake far behind and out of sight (one
    // that fell behind less than DROWSE_AFTER ago may)…
    expect(sum(rows, 'farAwake')).toBeLessThanOrEqual(2)
    // …what is awake is what is near, not everything ever woken…
    expect(Math.max(...rows.map(r => r.awake))).toBeLessThan(20)
    // …and the A* searches of the second half of the tour are a fraction of
    // the control's (they grew with every room woken there).
    const half = Math.floor(rows.length / 2)
    expect(sum(rows.slice(half), 'paths')).toBeLessThan(sum(control.slice(half), 'paths') / 2)
  }, 120_000)

  it('a dozing machine wakes again when Flux comes back', async () => {
    const { cast, w } = await tour(1611, true)
    const asleep = cast.find(e => !e.awake && e.state === 'idle' && !e.hold && !e.dormant && !e.golem && !e.spot && e.room >= 0)!
    expect(asleep).toBeDefined()
    // Flux walks up to it: within its aggro, in sight.
    w.player.x = asleep.x
    w.player.z = asleep.z
    for (let t = 0; t < 30; t++) {
      drowse(w, asleep, DT)
      updateEnemy(w, asleep, DT)
    }
    expect(asleep.awake).toBe(true)
  }, 120_000)

  it('sleeps only after DROWSE_AFTER, never in sight, never a boss or a golem', async () => {
    const map = generateMap({ seed: 1611, rooms: 18, boss: false })
    const cast = await spawnEncounters(map, SECTOR_BY_ID.magnet.encounters, 19)
    const w = worldOf(map, cast)
    const e = cast.find(o => !o.golem && !o.spot && !o.dormant)!
    wake(w, e, false)
    e.state = 'engage'
    // Flux far off, in a room it cannot see.
    const spot = map.rooms.map(r => [(r.x0 + r.w / 2) * CELL, (r.z0 + r.h / 2) * CELL] as const)
      .find(([x, z]) => Math.hypot(x - e.x, z - e.z) > DROWSE_R + 5 && !hasLineOfSight(w.nav, e.x, e.z, x, z))!
    expect(spot).toBeDefined()
    ;[w.player.x, w.player.z] = spot
    let t = 0
    while (!drowse(w, e, DT) && t < 10) t += DT
    expect(t).toBeGreaterThanOrEqual(DROWSE_AFTER - DT)
    expect(e.awake).toBe(false)
    expect(e.state).toBe('idle')
    // A boss or a golem is left alone, however far.
    for (const kind of ['boss', 'golem'] as const) {
      const o = { ...e, awake: true, state: 'engage' as const, drowseT: 0, boss: kind === 'boss', golem: kind === 'golem' ? ({} as Enemy['golem']) : undefined }
      for (let i = 0; i < Math.ceil((DROWSE_AFTER + 1) / DT); i++) drowse(w, o, DT)
      expect(o.awake).toBe(true)
    }
  })
})
