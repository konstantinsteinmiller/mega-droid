// Every Master's weapon can finish its own lesson (playtest 2026-10-18: after
// the Blaze Master, the Flame Wave lesson's drones hung at 2.1 m on the
// stage's terrain map — the climb's hover band lifted their sunk floor back
// onto the ground — and the wave rolled under all three). For each weapon the
// lesson's row is beamed in on a flat map and on climb maps, then the REAL
// WeaponSystem fires it from Flux's spot, aimed at each drone's centre the way
// the camera aims, and the shots it spawns are flown until one meets the
// drone (the combat's own sphere test: hitR + shot radius).

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Scene } from 'three'
import { generateMap, roomCenter, type MapData } from '@/game/world/levelGen'
import { generateClimb } from '@/game/world/climbGen'
import { createNav, groundAt, hasLineOfSight } from '@/game/world/nav'
import { profile } from '@/game/state/profile'
import { tutorialQuest } from '@/game/data/quests'
import { WEAPON_IDS, type WeaponId } from '@/game/data/weapons'
import { SHOT_LOOK } from '@/game/fx/chargedShot'
import { EYE_H } from '@/game/sim/constants'
import type { Enemy, Shot } from '@/game/sim/world'

// The real rig bakes canvas textures jsdom cannot draw: the real heli's
// numbers on a plain record.
vi.mock('@/game/sim/enemies', async () => {
  const { ENEMIES } = await import('@/game/data/enemies')
  return {
    createEnemy: (kind: 'heli', level: number, x: number, z: number, room: number) => {
      const def = ENEMIES[kind]
      return { id: Math.random(), kind, level, x, z, y: def.fly, py: def.fly, room, hp: 40, maxHp: 40, state: 'idle', boss: false, yaw: 0, def }
    }
  }
})

const { LessonDirector, roomAt } = await import('@/game/sim/lessons')
const { WeaponSystem } = await import('@/game/sim/weapons')
type Host = import('@/game/sim/lessons').LessonHost

const noop = () => {}

const makeHost = (map: MapData) => {
  const enemies: Enemy[] = []
  const scene = new Scene()
  const host: Host = {
    time: 0, map, nav: createNav(map), scene,
    player: { x: map.start.x, z: map.start.z, yaw: map.start.yaw },
    enemies,
    fx: { sparks: noop, orbBurst: noop, flash: noop, riseRing: noop } as unknown as Host['fx'],
    shocks: { spawn: noop } as unknown as Host['shocks'],
    combat: { we: 0, maxWe: 28 },
    setup: { tutorial: false, enemyLevel: 1 },
    propParent: () => scene,
    sfx: noop,
    shake: noop,
    crates: () => [],
    addCrate: () => null,
    addEnemy: (e) => { enemies.push(e) },
    spawnPickup: noop,
    weaponCost: () => 2,
    weaponDamage: () => 15
  }
  return { host, enemies }
}

/** The drone's centre, as the combat's hit test sees it. */
const centre = (e: Enemy): [number, number, number] => [e.x, e.y + (e.floor ?? 0) + e.def.aimY, e.z]

/**
 * Fire `id` from the player at drone `e` (aimed at its centre) and fly what
 * comes out. True when a shot meets it, or the weapon strikes it outright.
 */
const fireAt = (id: WeaponId, host: Host, enemies: Enemy[], e: Enemy): boolean => {
  const struck = new Set<Enemy>()
  const shots = firedShots(id, host, enemies, e, struck)
  if (struck.has(e)) return true
  const [cx, cy, cz] = centre(e)
  const dt = 1 / 120
  for (const s of shots) {
    for (let t = 0; t < s.life; t += dt) {
      if (s.homing) {
        const [hx, hy, hz] = centre(s.homing)
        const ax = hx - s.x
        const ay = hy - s.y
        const az = hz - s.z
        const al = Math.hypot(ax, ay, az) || 1
        const sp = Math.hypot(s.vx, s.vy, s.vz)
        const k = Math.min(1, s.turn * dt)
        s.vx += ((ax / al) * sp - s.vx) * k
        s.vy += ((ay / al) * sp - s.vy) * k
        s.vz += ((az / al) * sp - s.vz) * k
      }
      s.x += s.vx * dt
      s.y += s.vy * dt
      s.z += s.vz * dt
      if (Math.hypot(s.x - cx, s.y - cy, s.z - cz) < e.def.hitR + s.radius) return true
    }
  }
  return false
}

/** The shots `id` spawns, fired from the player at `e`'s centre with the
 *  camera's aim (eye to target); what it strikes outright goes in `struck`. */
const firedShots = (id: WeaponId, host: Host, enemies: Enemy[], e: Enemy, struck = new Set<Enemy>()): Shot[] => {
  const shots: Shot[] = []
  const system = {
    spawnPlayerShot: (kind: 'pellet' | 'charge1' | 'charge2' | 'charge3', x: number, y: number, z: number, dx: number, dy: number, dz: number, _dmg: number, _crit: boolean, target: Enemy | null) => {
      const speed = kind === 'pellet' ? 34 : kind === 'charge1' ? 30 : 28
      const s = {
        x, y, z, vx: dx * speed, vy: dy * speed, vz: dz * speed, life: 1.4, homing: target, turn: kind === 'pellet' ? 4 : 2.5,
        radius: SHOT_LOOK[kind]!.r * (kind === 'pellet' ? 1 : 1.8),
        sprite: { material: { color: { set: noop } } }, core: { material: { color: { set: noop } } }
      } as unknown as Shot
      shots.push(s)
      return s
    },
    setShotStyle: noop,
    damageEnemy: (t: Enemy) => { struck.add(t) }
  }
  const p = host.player as { x: number; z: number; yaw: number; y?: number }
  const feet = p.y ?? 0
  const eye: [number, number, number] = [p.x, feet + EYE_H, p.z]
  const [cx, cy, cz] = centre(e)
  const l = Math.hypot(cx - eye[0], cy - eye[1], cz - eye[2])
  const aim: [number, number, number, Enemy | null] = [(cx - eye[0]) / l, (cy - eye[1]) / l, (cz - eye[2]) / l, e]
  p.yaw = Math.atan2(-(cx - p.x), -(cz - p.z))
  const ws = new WeaponSystem({
    nav: host.nav, fx: { emit: noop, flash: noop, sparks: noop } as never, system: system as never, enemies,
    stats: { busterDmg: 10, specialMul: 1, weCostMul: 1 } as never,
    player: p, combat: { we: 99, target: e }, time: 0, sfx: noop, shake: noop
  }, {})
  const muzzle: [number, number, number] = [p.x - Math.sin(p.yaw) * 0.4, feet + EYE_H - 0.25, p.z - Math.cos(p.yaw) * 0.4]
  expect(ws.use(0, id, muzzle, aim)).toBe('ok')
  // Gale Guard: the leaves orbit first; the second press throws them.
  if (id === 'galeGuard') {
    ws.cooldown[0] = 0
    expect(ws.use(0, id, muzzle, aim)).toBe('ok')
  }
  return shots
}

/** The lesson's row for `id`, with Flux standing at (x, z, y) facing `yaw`. */
const lessonRow = (map: MapData, x: number, z: number, yaw: number, y: number | undefined, id: WeaponId) => {
  const h = makeHost(map)
  const d = new LessonDirector(h.host)
  d.update(0.1, { playing: true, combat: false, controls: false })
  Object.assign(h.host.player, { x, z, yaw, y })
  for (let t = 0; t < 1.5; t += 1 / 30) d.update(1 / 30, { playing: true, combat: false, controls: false })
  d.teachWeapon(roomAt(map, x, z), id)
  // The climb's hover band each step (`climb.ts`): never under the ground.
  for (const e of h.enemies) {
    if (e.hover) e.floor = Math.max(e.floor ?? 0, groundAt(map, e.x, e.z))
  }
  return h
}

beforeEach(() => {
  profile.tips = { 'lesson:charge': true, 'lesson:crate': true }
})

describe('each weapon lesson can be finished with the weapon it teaches', () => {
  for (const id of WEAPON_IDS) {
    it(`${id}: from Flux's spot every drone is hit, on a flat map and on a climb`, () => {
      profile.hero.slots = [id, '']
      let rows = 0
      // A flat stage: its first non-start room.
      const flat = generateMap({ seed: tutorialQuest().seed, rooms: tutorialQuest().rooms, boss: true })
      const start = roomAt(flat, flat.start.x, flat.start.z)
      for (const room of flat.rooms.filter(r => r.id !== start && r.role !== 'boss').slice(0, 3)) {
        const [cx, cz] = roomCenter(room)
        const { host, enemies } = lessonRow(flat, cx, cz, flat.start.yaw, undefined, id)
        if (!enemies.length) continue
        rows++
        for (const e of enemies) expect(fireAt(id, host, enemies, e), `flat room ${room.id}`).toBe(true)
      }
      // Terrain maps (the stage the Blaze lesson ran on).
      for (const seed of [1, 2, 4242]) {
        const probe = generateClimb(seed)
        for (const cp of probe.terrain!.checkpoints) {
          if (probe.rooms[cp.room]!.role === 'start') continue
          const { host, enemies } = lessonRow(generateClimb(seed), cp.x, cp.z, cp.yaw, cp.y, id)
          if (!enemies.length) continue
          rows++
          for (const e of enemies) {
            expect(fireAt(id, host, enemies, e), `seed ${seed} cp ${cp.room} drone at ${centre(e)[1].toFixed(2)} m over feet ${cp.y}`).toBe(true)
          }
        }
      }
      expect(rows).toBeGreaterThan(3)
    })
  }
})

describe('the floor weapons follow the aim pitch', () => {
  const FLOOR = ['flameWave', 'bubbleLance', 'galeGuard'] as const
  const flatHost = () => {
    const map = generateMap({ seed: tutorialQuest().seed, rooms: tutorialQuest().rooms, boss: true })
    return makeHost(map)
  }
  /** A drone parked at `y` m, `d` m ahead of Flux along his view. */
  const droneAhead = (host: Host, enemies: Enemy[], d: number, y: number): Enemy => {
    const p = host.player
    const e = {
      id: 1, kind: 'heli', x: p.x - Math.sin(p.yaw) * d, z: p.z - Math.cos(p.yaw) * d, y, py: y, floor: 0,
      room: 0, hp: 40, maxHp: 40, state: 'idle', boss: false, yaw: 0, def: { aimY: 0, hitR: 0.6, radius: 0.5, fly: 2.1 }
    } as unknown as Enemy
    enemies.push(e)
    return e
  }
  /** A line of sight 8 m long from somewhere on the flat map. */
  const openSpot = (host: Host) => {
    const { map, nav } = host
    for (const r of map.rooms) {
      const [cx, cz] = roomCenter(r)
      for (let yaw = 0; yaw < Math.PI * 2; yaw += 0.4) {
        const x = cx - Math.sin(yaw) * 8
        const z = cz - Math.cos(yaw) * 8
        if (hasLineOfSight(nav, cx, cz, x, z)) return { x: cx, z: cz, yaw }
      }
    }
    throw new Error('no 8 m line of sight on the map')
  }

  for (const id of FLOOR) {
    it(`${id}: aimed up it reaches a target 3 m high, 8 m out`, () => {
      const { host, enemies } = flatHost()
      Object.assign(host.player, openSpot(host))
      const e = droneAhead(host, enemies, 8, 3)
      expect(fireAt(id, host, enemies, e)).toBe(true)
    })

    it(`${id}: aimed level it stays down at its floor height`, () => {
      const { host, enemies } = flatHost()
      Object.assign(host.player, openSpot(host))
      // A target at eye height: the aim is level, the shot does not climb.
      const e = droneAhead(host, enemies, 8, EYE_H)
      const shots = firedShots(id, host, enemies, e)
      expect(shots.length).toBeGreaterThan(0)
      for (const s of shots) {
        expect(s.vy).toBe(0)
        expect(s.y).toBeLessThanOrEqual(EYE_H)
      }
      if (id === 'flameWave') expect(shots[0]!.y).toBeCloseTo(0.45, 5)
      if (id === 'bubbleLance') expect(shots[0]!.y).toBeCloseTo(0.7, 5)
    })
  }
})
