// The scene lessons (src/game/sim/lessons.ts): the charge drone after the
// first beam-in, the crate in the second room once it is quiet, and the row
// of sleeping drones for the special weapon. Driven on a real tutorial map
// with a fake mission around it, so the rules — when each lesson starts,
// what counts as learned, what a wrong try does — are pinned without a GPU.
// (In the tutorial the walkthrough schedules the drone and the crate: see
// walkthrough.test.ts.)

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Group, Scene } from 'three'
import { generateMap, roomCenter, type MapData } from '@/game/world/levelGen'
import { generateClimb } from '@/game/world/climbGen'
import { createNav, hasLineOfSight, isSolidAt, groundAt } from '@/game/world/nav'
import { profile } from '@/game/state/profile'
import { flushPersist } from '@/use/useGameState'
import { tutorialQuest } from '@/game/data/quests'
import type { Enemy, Shot } from '@/game/sim/world'
import type { Crate } from '@/game/sim/objectives'

// The real rig bakes canvas textures jsdom cannot draw: a plain record is
// all the director needs from a drone.
vi.mock('@/game/sim/enemies', () => ({
  createEnemy: (kind: string, level: number, x: number, z: number, room: number) => ({
    id: Math.random(), kind, level, x, z, y: 1.5, room, hp: 40, maxHp: 40, state: 'idle', awake: false,
    boss: false, yaw: 0, def: { aimY: 0, hitR: 0.5 }
  })
}))

const { LessonDirector, lessonDone, roomAt, roomClear, droneRow } = await import('@/game/sim/lessons')
type Host = import('@/game/sim/lessons').LessonHost
type Tick = import('@/game/sim/lessons').LessonTick

const TUTORIAL = { seed: tutorialQuest().seed, rooms: tutorialQuest().rooms, boss: true }

const makeHost = (tutorial: boolean, climbSeed = -1) => {
  const map: MapData = climbSeed >= 0 ? generateClimb(climbSeed) : generateMap(TUTORIAL)
  const nav = createNav(map)
  const scene = new Scene()
  const crates: Crate[] = []
  const enemies: Enemy[] = []
  const noop = () => {}
  const host: Host = {
    time: 0, map, nav, scene,
    player: { x: map.start.x, z: map.start.z, yaw: map.start.yaw },
    enemies,
    fx: { sparks: noop, orbBurst: noop, flash: noop, riseRing: noop } as unknown as Host['fx'],
    shocks: { spawn: noop } as unknown as Host['shocks'],
    combat: { we: 0, maxWe: 28 },
    setup: { tutorial, enemyLevel: 1 },
    propParent: () => scene,
    sfx: noop,
    shake: noop,
    crates: () => crates,
    addCrate: (x, z) => {
      const c = { id: crates.length, x, z, kind: 'crate', mesh: { root: new Group(), body: null, glow: null }, hp: 12, broken: false, navIdx: 0, hitT: 0 } as Crate
      crates.push(c)
      return c
    },
    addEnemy: (e) => { enemies.push(e) },
    spawnPickup: noop,
    weaponCost: () => 2,
    weaponDamage: () => 15
  }
  return { host, map, crates, enemies }
}

/** Step the director for `secs` of game time. */
const run = (d: InstanceType<typeof LessonDirector>, h: Host, secs: number, over: Partial<Tick> = {}) => {
  const o: Tick = { playing: true, combat: false, controls: false, ...over }
  for (let t = 0; t < secs; t += 1 / 30) {
    h.time += 1 / 30
    d.update(1 / 30, o)
  }
}

const shotAt = (x: number, y: number, z: number, kind: Shot['kind']): Shot =>
  ({ x, y, z, radius: 0.1, kind } as Shot)

/** A room other than the start one, and a floor spot inside it. */
const otherRoom = (map: MapData) => {
  const start = roomAt(map, map.start.x, map.start.z)
  const room = map.rooms.find(r => r.id !== start && r.role !== 'boss')!
  const [cx, cz] = roomCenter(room)
  return { room, cx, cz }
}

beforeEach(() => {
  profile.tips = {}
  profile.hero.slots = ['', '']
})

// A learned lesson is saved through useGameState's debounced write: flush it
// before the next case's storage exists (tests/stubs/drainPersist.ts). This
// file never resets modules, so the static import is the instance in use.
afterEach(() => flushPersist())

describe('the charge lesson (first beam-in)', () => {
  /** A tutorial director with its drone up, the glyph already in. */
  const withDrone = () => {
    const h = makeHost(true)
    const d = new LessonDirector(h.host, { guided: true })
    d.placeTarget()
    run(d, h.host, 0.1, { controls: true })
    const buf = new Float32Array(9)
    d.anchors(buf)
    return { ...h, d, buf }
  }

  it('hovers a training drone in the start room, in sight of the pad', () => {
    const { host, map, d, buf } = withDrone()
    expect(d.droneUp).toBe(true)
    expect(d.view()?.id).toBe('charge')
    expect(d.anchors(buf)).toBe(1)
    const [x, , z] = buf
    expect(roomAt(map, x!, z!)).toBe(roomAt(map, map.start.x, map.start.z))
    expect(hasLineOfSight(host.nav, map.start.x, map.start.z, x!, z!)).toBe(true)
  })

  it('its glyph waits for the coach\'s move and look, then comes onto the drone', () => {
    const { host } = makeHost(true)
    const d = new LessonDirector(host, { guided: true })
    d.placeTarget()
    run(d, host, 3)
    expect(d.view()).toBeNull()
    // Waiting, it keeps the coach free: the thumbs' glyphs are what shows.
    expect(d.focus(host.player.x, host.player.z, host.player.yaw)).toBe(false)
    // …but a press on the drone is already a shot, not a look or a walk.
    expect(d.inSights(host.player.x, host.player.z, host.player.yaw)).toBe(true)
    run(d, host, 0.1, { controls: true })
    expect(d.view()?.id).toBe('charge')
    expect(d.focus(host.player.x, host.player.z, host.player.yaw)).toBe(true)
  })

  it('…or comes in anyway after a while', () => {
    const { host } = makeHost(true)
    const d = new LessonDirector(host, { guided: true })
    d.placeTarget()
    run(d, host, 8)
    expect(d.view()).toBeNull()
    run(d, host, 2.5)
    expect(d.view()?.id).toBe('charge')
  })

  it('a quick shot off the bubble brings the glyph in at once, shaking', () => {
    // Where the drone hovers (the placement is deterministic)…
    const { buf } = withDrone()
    // …shot at before its glyph came in.
    const { host } = makeHost(true)
    const d = new LessonDirector(host, { guided: true })
    d.placeTarget()
    run(d, host, 0.1)
    expect(d.view()).toBeNull()
    expect(d.shotHits(shotAt(buf[0]!, buf[1]!, buf[2]!, 'pellet'))).toBe('deflect')
    expect(d.view()).toMatchObject({ id: 'charge', nudge: 1, done: false })
  })

  it('turns quick shots away (a nudge each) and pops to a charged one', () => {
    const { host, d, buf } = withDrone()
    expect(d.shotHits(shotAt(buf[0]!, buf[1]!, buf[2]!, 'pellet'))).toBe('deflect')
    expect(d.shotHits(shotAt(buf[0]!, buf[1]!, buf[2]!, 'pellet'))).toBe('deflect')
    expect(d.view()?.nudge).toBe(2)
    expect(lessonDone('charge')).toBe(false)
    expect(d.shotHits(shotAt(buf[0]!, buf[1]!, buf[2]!, 'charge1'))).toBe('hit')
    expect(lessonDone('charge')).toBe(true)
    expect(d.droneUp).toBe(false)
    // The check stays a moment, then the lesson is gone for good.
    expect(d.view()?.done).toBe(true)
    run(d, host, 1.5)
    expect(d.view()).toBeNull()
  })

  it('a hold let go too soon at the drone shakes the glyph; away from it, nothing', () => {
    const { host, d } = withDrone()
    const p = host.player
    d.earlyRelease(p.x, p.z, p.yaw)
    expect(d.view()?.nudge).toBe(1)
    d.earlyRelease(p.x, p.z, p.yaw + Math.PI)
    expect(d.view()?.nudge).toBe(1)
  })

  it('a miss is a miss', () => {
    const { d } = withDrone()
    expect(d.shotHits(shotAt(-50, 1, -50, 'charge2'))).toBeNull()
  })

  it('only in the tutorial — and again in a replayed one, whatever the flag says', () => {
    const a = makeHost(false)
    const d = new LessonDirector(a.host)
    d.placeTarget()
    run(d, a.host, 0.2, { controls: true })
    expect(d.droneUp).toBe(false)
    expect(d.view()).toBeNull()
    profile.tips['lesson:charge'] = true
    const b = makeHost(true)
    const d2 = new LessonDirector(b.host, { guided: true })
    d2.placeTarget()
    run(d2, b.host, 0.2, { controls: true })
    expect(d2.view()?.id).toBe('charge')
  })

  it('its off-screen bubble belongs to the start room only', () => {
    const { host, map, d } = withDrone()
    expect(d.inRoom(host.player.x, host.player.z)).toBe(true)
    const { cx, cz } = otherRoom(map)
    expect(d.inRoom(cx, cz)).toBe(false)
    // A corridor is no room at all.
    const door = map.doors[0]!
    expect(d.inRoom((door.i + 0.5) * 3, (door.j + 0.5) * 3)).toBe(false)
  })
})

describe('the crate lesson (second room, once quiet)', () => {
  beforeEach(() => { profile.tips = { 'lesson:charge': true } })

  it('waits for the room to be cleared, then lights a crate there', () => {
    const { host, map, enemies } = makeHost(false)
    const d = new LessonDirector(host)
    run(d, host, 0.1) // the pad: room one
    const { room, cx, cz } = otherRoom(map)
    const guard = { room: room.id, state: 'engage', boss: false } as Enemy
    enemies.push(guard)
    host.player.x = cx
    host.player.z = cz
    run(d, host, 2, { playing: true, combat: true })
    expect(d.view()).toBeNull()
    guard.state = 'dead'
    run(d, host, 0.5)
    expect(d.view()).toBeNull() // settling
    run(d, host, 1)
    expect(d.view()?.id).toBe('crate')
    expect(d.lessonRoom).toBe(room.id)
  })

  it('uses a crate of that room, or brings one in where there is none', () => {
    const { host, map, crates } = makeHost(false)
    const d = new LessonDirector(host)
    run(d, host, 0.1)
    const { room, cx, cz } = otherRoom(map)
    host.player.x = cx
    host.player.z = cz
    run(d, host, 1.5)
    expect(crates).toHaveLength(1)
    const c = crates[0]!
    expect(roomAt(map, c.x, c.z)).toBe(room.id)
    expect(isSolidAt(host.nav, c.x, c.z)).toBe(false)
    const buf = new Float32Array(9)
    expect(d.anchors(buf)).toBe(1)
    expect(buf[0]).toBeCloseTo(c.x)
    // A quick shot off it nudges, and so does a hold let go too soon at it;
    // breaking it (a charge) is learning it.
    d.crateDeflected(c)
    expect(d.view()?.nudge).toBe(1)
    host.player.yaw = Math.atan2(-(c.x - cx), -(c.z - cz))
    d.earlyRelease(cx, cz, host.player.yaw)
    expect(d.view()?.nudge).toBe(2)
    c.broken = true
    run(d, host, 0.1)
    expect(lessonDone('crate')).toBe(true)
    expect(d.crateBroken).toBe(true)
    expect(d.view()?.done).toBe(true)
  })

  it('in the tutorial it waits for the walkthrough, which names the room', () => {
    const { host, map, crates } = makeHost(true)
    const d = new LessonDirector(host, { guided: true })
    run(d, host, 0.1)
    const { room, cx, cz } = otherRoom(map)
    host.player.x = cx
    host.player.z = cz
    run(d, host, 3)
    expect(d.view()).toBeNull()
    expect(crates).toHaveLength(0)
    expect(d.startCrate(room.id)).toBe(true)
    expect(d.view()?.id).toBe('crate')
    expect(d.inRoom(cx, cz)).toBe(true)
    expect(d.crateBroken).toBe(false)
    crates[0]!.broken = true
    run(d, host, 0.1)
    expect(d.crateBroken).toBe(true)
  })

  it('in the tutorial a crate broken before the lesson lit counts (no second crate beamed in)', () => {
    const { host, map, crates } = makeHost(true)
    const d = new LessonDirector(host, { guided: true })
    run(d, host, 0.1)
    const { room, cx, cz } = otherRoom(map)
    host.player.x = cx
    host.player.z = cz
    // A charged shot broke the room's crate on the way in.
    crates.push({ kind: 'crate', x: cx, y: 0, z: cz, broken: true } as unknown as (typeof crates)[number])
    expect(d.startCrate(room.id)).toBe(true)
    run(d, host, 0.1)
    expect(d.crateBroken).toBe(true)
    expect(crates.filter(c => !c.broken)).toHaveLength(0)
  })

  it('in the tutorial it is taught again, even to a player who learned it before', () => {
    profile.tips['lesson:crate'] = true
    const { host, map } = makeHost(true)
    const d = new LessonDirector(host, { guided: true })
    const { room, cx, cz } = otherRoom(map)
    host.player.x = cx
    host.player.z = cz
    run(d, host, 0.1)
    expect(d.startCrate(room.id)).toBe(true)
    expect(d.view()?.id).toBe('crate')
  })
})

describe('the special-weapon lesson (sleeping drones)', () => {
  beforeEach(() => {
    profile.tips = { 'lesson:charge': true, 'lesson:crate': true }
    profile.hero.slots = ['scrapBurst', '']
  })

  const intoQuietRoom = () => {
    const h = makeHost(false)
    const d = new LessonDirector(h.host)
    run(d, h.host, 0.1)
    const { cx, cz } = otherRoom(h.map)
    h.host.player.x = cx
    h.host.player.z = cz
    run(d, h.host, 1.5)
    return { ...h, d }
  }

  it('beams in three sleeping drones, one spread-angle apart, with energy to spare', () => {
    const { d, host, enemies } = intoQuietRoom()
    expect(d.view()?.id).toBe('weapon')
    expect(d.view()?.slot).toBe(1)
    expect(enemies).toHaveLength(3)
    expect(enemies.every(e => e.hold && e.hp <= 15)).toBe(true)
    expect(host.combat.we).toBeGreaterThanOrEqual(6)
    const p = host.player
    // Bearings relative to the middle drone (wrapped: the fan may straddle ±π).
    const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))
    const raw = enemies.map(e => Math.atan2(e.x - p.x, e.z - p.z))
    const bearings = raw.map(a => wrap(a - raw[1]!)).sort((a, b) => a - b)
    expect(bearings[1]! - bearings[0]!).toBeCloseTo(0.21, 2)
    expect(bearings[2]! - bearings[1]!).toBeCloseTo(0.21, 2)
  })

  it('is learned by using the weapon on them', () => {
    const { d, host, enemies } = intoQuietRoom()
    // While it runs the mission keeps the Weapon Energy full (#125).
    expect(d.weaponLive).toBe(true)
    d.weaponFired()
    for (const e of enemies) e.state = 'dead'
    run(d, host, 0.1)
    expect(lessonDone('weapon')).toBe(true)
    expect(d.weaponLive).toBe(false)
  })

  it('shot down with the buster is not learned: it tries again later, then gives up', () => {
    const { d, host, enemies } = intoQuietRoom()
    for (const e of enemies) e.state = 'dead'
    run(d, host, 2)
    expect(lessonDone('weapon')).toBe(false)
    // Not again in the same room.
    expect(enemies).toHaveLength(3)
    expect(d.view()).toBeNull()
  })

  it('never without a slotted weapon', () => {
    profile.hero.slots = ['', '']
    const { d, enemies } = intoQuietRoom()
    expect(d.view()).toBeNull()
    expect(enemies).toHaveLength(0)
  })

  it('on a terrain map (the climb) the drones hover over Flux\'s own floor, never a pit or another level', () => {
    let rows = 0
    for (const seed of [1, 2, 3, 4242, 99999]) {
      const probe = generateClimb(seed)
      for (const cp of probe.terrain!.checkpoints) {
        if (probe.rooms[cp.room]!.role === 'start') continue
        const h = makeHost(false, seed)
        const d = new LessonDirector(h.host)
        run(d, h.host, 0.1)
        Object.assign(h.host.player, { x: cp.x, z: cp.z, yaw: cp.yaw, y: cp.y })
        run(d, h.host, 1.5)
        if (!h.enemies.length) continue
        rows++
        expect(h.enemies).toHaveLength(3)
        for (const e of h.enemies) {
          const f = groundAt(h.map, e.x, e.z)
          expect(Math.abs(f - cp.y), `seed ${seed} cp ${cp.room}`).toBeLessThanOrEqual(0.6)
          expect(e.floor).toBe(f)
          expect(e.hover).toEqual([f, f])
        }
      }
    }
    // Enough ledges fit a row that the rule is exercised, not just avoided.
    expect(rows).toBeGreaterThan(3)
  })

  it('never in the tutorial (the weapon is won at its end)', () => {
    const h = makeHost(true)
    const d = new LessonDirector(h.host)
    run(d, h.host, 0.1)
    const { cx, cz } = otherRoom(h.map)
    h.host.player.x = cx
    h.host.player.z = cz
    run(d, h.host, 1.5)
    expect(d.view()).toBeNull()
    expect(h.enemies).toHaveLength(0)
  })
})

describe('the Repair Gel lesson', () => {
  const hurt = { hp01: 0.25, tanks: 1 }

  it('the walkthrough lights it: the subject is the HUD button, so it has the eyes wherever they look', () => {
    const h = makeHost(true)
    const d = new LessonDirector(h.host, { guided: true })
    expect(d.startGel()).toBe(true)
    run(d, h.host, 0.5, hurt)
    expect(d.view()?.id).toBe('gel')
    expect(d.gelLive).toBe(true)
    expect(d.active).toBe(true)
    // Any direction: the coach keeps to survival and the thumbs meanwhile.
    for (const yaw of [0, 1.5, 3, 4.5]) expect(d.focus(h.host.player.x, h.host.player.z, yaw)).toBe(true)
    // No world point to pin to; no press means "fire" because of it.
    expect(d.anchors(new Float32Array(9))).toBe(0)
    expect(d.inSights(h.host.player.x, h.host.player.z, 0)).toBe(false)
    expect(d.inRoom(h.host.player.x, h.host.player.z)).toBe(false)
  })

  it('using a gel pops the check and learns it for good', () => {
    const h = makeHost(true)
    const d = new LessonDirector(h.host, { guided: true })
    d.startGel()
    run(d, h.host, 0.5, hurt)
    expect(d.gelEnded).toBe(false)
    d.gelUsed()
    expect(d.view()).toMatchObject({ id: 'gel', done: true })
    expect(d.gelEnded).toBe(true)
    expect(lessonDone('gel')).toBe(true)
    run(d, h.host, 1.5, { hp01: 1, tanks: 0 })
    expect(d.view()).toBeNull()
  })

  it('in the tutorial, health back some other way changes nothing: its door waits for a gel used', () => {
    const h = makeHost(true)
    const d = new LessonDirector(h.host, { guided: true })
    d.startGel()
    run(d, h.host, 0.5, hurt)
    run(d, h.host, 5, { hp01: 1, tanks: 1 })
    expect(d.view()?.id).toBe('gel')
    expect(d.gelLive).toBe(true)
    expect(d.gelEnded).toBe(false)
    d.gelUsed()
    expect(d.gelEnded).toBe(true)
    expect(lessonDone('gel')).toBe(true)
  })

  it('elsewhere, health back some other way: it steps aside unlearned', () => {
    const h = makeHost(false)
    const d = new LessonDirector(h.host)
    d.startGel()
    run(d, h.host, 0.5, hurt)
    run(d, h.host, 0.1, { hp01: 1, tanks: 1 })
    expect(d.view()).toBeNull()
    expect(d.gelEnded).toBe(true)
    expect(lessonDone('gel')).toBe(false)
  })

  it('never shoulders another lesson aside', () => {
    const h = makeHost(true)
    const d = new LessonDirector(h.host, { guided: true })
    d.placeTarget()
    run(d, h.host, 0.1, { controls: true })
    expect(d.view()?.id).toBe('charge')
    expect(d.startGel()).toBe(false)
    expect(d.view()?.id).toBe('charge')
  })

  it('is never shouldered aside either: a training drone still up does not take the stage from it', () => {
    const h = makeHost(true)
    const d = new LessonDirector(h.host, { guided: true })
    // The charge room's drone is still hovering (its door was passed another
    // way), and the gel lesson is lit: the drone must wait.
    d.placeTarget()
    d.startGel()
    run(d, h.host, 0.5, { ...hurt, controls: true })
    expect(d.view()?.id).toBe('gel')
    expect(d.gelLive).toBe(true)
    d.gelUsed()
    expect(d.gelEnded).toBe(true)
  })

  it('outside the tutorial: the first calm moment under half health with a gel carried', () => {
    const h = makeHost(false)
    const d = new LessonDirector(h.host)
    run(d, h.host, 3, { hp01: 0.6, tanks: 1 })
    expect(d.view()).toBeNull()
    run(d, h.host, 3, { hp01: 0.3, tanks: 0 })
    expect(d.view()).toBeNull()
    run(d, h.host, 3, { hp01: 0.3, tanks: 1, combat: true })
    expect(d.view()).toBeNull()
    run(d, h.host, 0.8, hurt)
    expect(d.view()).toBeNull() // it settles first
    run(d, h.host, 0.6, hurt)
    expect(d.view()?.id).toBe('gel')
  })

  it('…but never once learned, and never in the tutorial on its own', () => {
    profile.tips['lesson:gel'] = true
    const a = makeHost(false)
    const learned = new LessonDirector(a.host)
    run(learned, a.host, 3, hurt)
    expect(learned.view()).toBeNull()
    profile.tips = {}
    const b = makeHost(true)
    const guided = new LessonDirector(b.host, { guided: true })
    run(guided, b.host, 3, hurt)
    expect(guided.view()).toBeNull()
  })
})

describe('helpers', () => {
  it('a room is clear when its own machines are down and nothing fights', () => {
    const e = [{ room: 2, state: 'idle', boss: false }, { room: 3, state: 'dead', boss: false }] as Enemy[]
    expect(roomClear(e, 3, false)).toBe(true)
    expect(roomClear(e, 2, false)).toBe(false)
    expect(roomClear(e, 3, true)).toBe(false)
  })

  it('a line layout stacks the drones along the view for piercing weapons', () => {
    const map = generateMap(TUTORIAL)
    const nav = createNav(map)
    for (const r of map.rooms) {
      const [cx, cz] = roomCenter(r)
      for (let yaw = 0; yaw < Math.PI * 2; yaw += 0.5) {
        const row = droneRow(nav, map, cx, cz, yaw, 'line')
        if (!row) continue
        const b = row.map(([x, z]) => Math.atan2(x - cx, z - cz))
        expect(Math.abs(b[0]! - b[2]!)).toBeLessThan(1e-6)
        return
      }
    }
    throw new Error('no room fits a line of drones')
  })

  it('on a terrain map a row only ever stands over floor at the player\'s height', () => {
    const map = generateClimb(31337)
    const nav = createNav(map)
    for (const cp of map.terrain!.checkpoints) {
      for (let yaw = 0; yaw < Math.PI * 2; yaw += 0.5) {
        for (const layout of ['fan', 'line'] as const) {
          const row = droneRow(nav, map, cp.x, cp.z, yaw, layout, cp.y)
          for (const [x, z] of row ?? []) expect(Math.abs(groundAt(map, x, z) - cp.y)).toBeLessThanOrEqual(0.6)
        }
      }
    }
  })
})
