// @vitest-environment jsdom
// The tutorial walkthrough (src/game/sim/walkthrough.ts): every door on the
// path from the pad to the Scrapper starts locked, and each room's door out
// opens only once its lesson is DONE — the drone popped, the Hardhat down and
// the crate broken, the Trooper down and a block, the Stomper down and a
// slide, the chest open. Driven on the real tutorial map with a fake mission
// around it, so the gating order, each gate's condition, the stand-in
// teachers and the resume are pinned without a GPU.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { generateMap, roomCenter, cellCenter, CELL, type MapData } from '@/game/world/levelGen'
import { createNav, hasLineOfSight, isSolidAt } from '@/game/world/nav'
import { tutorialQuest } from '@/game/data/quests'
import { profile, writeSnapshot, type MissionSnapshot } from '@/game/state/profile'
import { flushPersist } from '@/use/useGameState'
import { Coach, type CoachContext } from '@/game/sim/coach'
import type { Enemy } from '@/game/sim/world'

// The real rigs bake canvas textures jsdom cannot draw: a plain record is all
// the walkthrough and the spawner need from a machine.
vi.mock('@/game/sim/enemies', () => ({
  createEnemy: (kind: string, level: number, x: number, z: number, room: number, opts: { elite?: boolean } = {}) => ({
    id: Math.random(), kind, level, x, z, y: 0, room, elite: !!opts.elite, hp: 30, maxHp: 30, state: 'idle',
    awake: false, boss: false, yaw: 0, def: { aimY: 0, hitR: 0.5 }
  })
}))

const { Walkthrough, planWalkthrough, stepsFor, doorwayOf, helperSpot, SETTLE, GEL_DELAY, GEL_FORCE_AFTER } = await import('@/game/sim/walkthrough')
const { corridorCells } = await import('@/game/sim/traps')
const { spawnTutorial } = await import('@/game/sim/spawn')
const { roomAt } = await import('@/game/sim/lessons')
type Host = import('@/game/sim/walkthrough').WalkHost
type Walk = InstanceType<typeof Walkthrough>

const tutorialMap = (): MapData => {
  const q = tutorialQuest()
  return generateMap({ seed: q.seed, rooms: q.rooms, boss: true })
}

/** The mission's objective on the tutorial: the boss shutter, from the
 *  corridor side (what `MissionObjects.target` answers there). */
const shutterOf = (map: MapData): { x: number; z: number } => {
  const d = map.doors.find(x => x.boss)!
  return { x: cellCenter(d.i), z: cellCenter(d.j) }
}

/** A fake mission: doors as a map of states, a drone flag, a crate flag, one
 *  chest — and, with `gel`, the Repair Gel corridor's hooks (a host without
 *  them skips the corridor, as every case above the gel ones does). */
const makeWalk = (map: MapData = tutorialMap(), opts: { gel?: boolean } = {}) => {
  const plan = planWalkthrough(map)
  const doors = new Map<number, 'held' | 'open'>()
  // The drone hovers a few metres ahead of the pad; a lit crate sits beside
  // the middle of its room.
  const drone = { x: map.start.x - Math.sin(map.start.yaw) * 5, z: map.start.z - Math.cos(map.start.yaw) * 5 }
  const s = {
    droneUp: true, drone, crateBroken: false, crate: null as { x: number; z: number } | null,
    crateRooms: [] as number[], brought: [] as string[], saves: 0,
    spot: { x: 0, z: 0, on: false },
    gelSafe: true, sprung: 0, gelStarts: 0, gelOver: false
  }
  const chests = [{ opened: false }]
  const enemies: Enemy[] = []
  const shutter = shutterOf(map)
  const host: Host = {
    time: 0,
    map,
    player: { x: map.start.x, z: map.start.z },
    enemies,
    lessons: {
      get droneUp() { return s.droneUp },
      get droneAt() { return s.droneUp ? s.drone : null },
      get crateBroken() { return s.crateBroken },
      get crateAt() { return s.crateBroken ? null : s.crate },
      startCrate: (room) => {
        s.crateRooms.push(room)
        const [x, z] = roomCenter(map.rooms[room]!)
        s.crate = { x: x + 1.5, z }
        return true
      },
      spotlight: (x, z, on) => { s.spot = { x, z, on } }
    },
    objects: { chests, target: () => shutter },
    holdDoor: (id) => { doors.set(id, 'held') },
    releaseDoor: (id) => { doors.set(id, 'open') },
    bringIn: (kind, room) => {
      const [x, z] = roomCenter(map.rooms[room]!)
      enemies.push({ kind, room, x, z, state: 'engage', awake: true, boss: false } as Enemy)
      s.brought.push(kind)
      return true
    },
    checkpoint: () => { s.saves++ }
  }
  if (opts.gel) {
    host.gelSafe = () => s.gelSafe
    // The mission slams the door ahead: held again.
    host.springGel = (g) => { s.sprung++; doors.set(g.door, 'held') }
    host.startGel = () => { s.gelStarts++; return true }
    host.gelOver = () => s.gelOver
  }
  const gate = (k: number) => plan.gates[k]!
  const [cx, cz] = roomCenter(map.rooms[plan.gates.find(g => g.steps.includes('chest'))!.room]!)
  const chest = { id: 0, x: cx, z: cz }
  const walk = new Walkthrough(host, plan, chest)
  return { map, plan, doors, s, chests, chest, enemies, host, walk, gate }
}

type Rig = ReturnType<typeof makeWalk>

/** Step the walkthrough for `secs` of game time. */
const run = (r: Rig, secs: number, fighting = false) => {
  for (let t = 0; t < secs; t += 1 / 30) {
    r.host.time += 1 / 30
    r.walk.update(true, fighting)
  }
}

/** Stand in the middle of a room. */
const enter = (r: Rig, room: number) => {
  const [x, z] = roomCenter(r.map.rooms[room]!)
  r.host.player.x = x
  r.host.player.z = z
}

/** A machine of `room`, standing (asleep, in the middle of the room). */
const machine = (r: Rig, room: number, kind = 'hardhat'): Enemy => {
  const [x, z] = roomCenter(r.map.rooms[room]!)
  const e = { kind, room, x, z, state: 'engage', awake: false, boss: false } as Enemy
  r.enemies.push(e)
  return e
}

const held = (r: Rig): number[] => [...r.doors].filter(([, v]) => v === 'held').map(([k]) => k).sort((a, b) => a - b)
const isOpen = (r: Rig, k: number): boolean => r.doors.get(r.gate(k).door) === 'open'

/** Pass the first `n` gates the honest way. */
const passTo = (r: Rig, n: number) => {
  if (n > 0) {
    r.s.droneUp = false
    run(r, 1)
  }
  if (n > 1) {
    enter(r, r.gate(1).room)
    run(r, 1.5)
    r.s.crateBroken = true
    run(r, 1)
  }
  if (n > 2) {
    r.walk.noteBlock()
    enter(r, r.gate(2).room)
    run(r, 1)
  }
  if (n > 3) {
    r.walk.noteSlide()
    enter(r, r.gate(3).room)
    run(r, 1)
  }
  expect(r.walk.passed).toBe(n)
}

beforeEach(() => {
  profile.tips = {}
})

// Snapshots and learned lessons are saved through useGameState's debounced
// write: flush it before the next case's storage exists
// (tests/stubs/drainPersist.ts). This file never resets modules, so the static
// import is the instance in use.
afterEach(() => flushPersist())

describe('the tutorial map', () => {
  it('has four rooms between the pad and the Scrapper, one lesson each', () => {
    const map = tutorialMap()
    const { path, gates } = planWalkthrough(map)
    expect(path).toHaveLength(5)
    expect(map.rooms[path[0]!]!.role).toBe('start')
    expect(gates.map(g => g.steps)).toEqual([['charge'], ['crate'], ['block'], ['slide'], ['chest']])
    // Each gate's door leads on along the path; the last is the boss shutter.
    gates.forEach((g, k) => {
      const d = map.doors[g.door]!
      expect(d.from).toBe(g.room)
      if (k + 1 < gates.length) expect(d.to).toBe(gates[k + 1]!.room)
    })
    expect(map.doors[gates[4]!.door]!.boss).toBe(true)
    expect(map.rooms[map.doors[gates[4]!.door]!.to]!.role).toBe('boss')
  })

  it('starts in a one-door room, facing that door', () => {
    const map = tutorialMap()
    const out = map.doors.filter(d => d.from === 0 || d.to === 0)
    expect(out).toHaveLength(1)
    const d = out[0]!
    const want = Math.atan2(-((d.i + 0.5) * 3 - map.start.x), -((d.j + 0.5) * 3 - map.start.z))
    expect(map.start.yaw).toBeCloseTo(want, 5)
  })

  it('folds lessons together on a shorter path, and pads a longer one', () => {
    expect(stepsFor(4)).toEqual([['charge'], ['crate'], ['block'], ['slide', 'chest']])
    expect(stepsFor(3)).toEqual([['charge'], ['crate', 'block'], ['slide', 'chest']])
    expect(stepsFor(2)).toEqual([['charge'], ['crate', 'block', 'slide', 'chest']])
    expect(stepsFor(1)).toEqual([['charge', 'crate', 'block', 'slide', 'chest']])
    // The chest always opens the boss shutter; extra rooms only need clearing.
    expect(stepsFor(7)).toEqual([['charge'], ['crate'], ['block'], ['slide'], ['clear'], ['clear'], ['chest']])
    // Every lesson is taught exactly once, whatever the length.
    for (let n = 1; n <= 9; n++) {
      const all = stepsFor(n).flat().filter(s => s !== 'clear').sort()
      expect(all).toEqual(['block', 'charge', 'chest', 'crate', 'slide'])
    }
  })

  it('a map with no boss room has no walkthrough', () => {
    const map = generateMap({ seed: 7, rooms: 6, boss: false })
    expect(planWalkthrough(map).gates).toHaveLength(0)
  })
})

describe('door gating', () => {
  it('locks every door on the path at the start, and nothing else', () => {
    const r = makeWalk()
    r.walk.start()
    expect(held(r)).toEqual(r.plan.gates.map(g => g.door).sort((a, b) => a - b))
    expect(r.walk.active).toBe(true)
  })

  it('opens them one at a time, in path order, each only when its room is done', () => {
    const r = makeWalk()
    r.walk.start()
    for (let n = 0; n < 5; n++) {
      // Everything past the gate being taught stays shut.
      for (let k = n; k < 5; k++) expect(isOpen(r, k)).toBe(false)
      if (n < 4) passTo(r, n + 1)
    }
  })

  it('opens a moment after the lesson, not on the same frame', () => {
    const r = makeWalk()
    r.walk.start()
    r.s.droneUp = false
    run(r, 0.5)
    expect(isOpen(r, 0)).toBe(false)
    run(r, 0.5)
    expect(isOpen(r, 0)).toBe(true)
    expect(r.s.saves).toBeGreaterThan(0)
  })

  it('never while the game is not playing (a modal, the beam-in)', () => {
    const r = makeWalk()
    r.walk.start()
    r.s.droneUp = false
    for (let t = 0; t < 3; t += 1 / 30) {
      r.host.time += 1 / 30
      r.walk.update(false, false)
    }
    expect(isOpen(r, 0)).toBe(false)
  })
})

describe('each room', () => {
  it('start: the door waits for the drone to pop, however long the player looks around', () => {
    const r = makeWalk()
    r.walk.start()
    expect(r.walk.needsDrone).toBe(true)
    run(r, 30)
    expect(isOpen(r, 0)).toBe(false)
    r.s.droneUp = false
    run(r, 1)
    expect(isOpen(r, 0)).toBe(true)
    expect(r.walk.needsDrone).toBe(false)
  })

  it('second: the Hardhat down, then the crate lesson in that room; the crate opens the door', () => {
    const r = makeWalk()
    r.walk.start()
    passTo(r, 1)
    const room = r.gate(1).room
    const hardhat = machine(r, room)
    enter(r, room)
    run(r, 3, true)
    expect(r.s.crateRooms).toEqual([])
    hardhat.state = 'dead'
    run(r, 0.6)
    expect(r.s.crateRooms).toEqual([]) // the room settles first
    run(r, 1)
    expect(r.s.crateRooms).toEqual([room])
    run(r, 3)
    expect(isOpen(r, 1)).toBe(false)
    r.s.crateBroken = true
    run(r, 1)
    expect(isOpen(r, 1)).toBe(true)
  })

  it('second: the crate waits until the player is in the room', () => {
    const r = makeWalk()
    r.walk.start()
    passTo(r, 1)
    run(r, 3) // still in the start room
    expect(r.s.crateRooms).toEqual([])
    enter(r, r.gate(1).room)
    run(r, 1.5)
    expect(r.s.crateRooms).toEqual([r.gate(1).room])
  })

  // A playtester learned the slide and the door stayed shut: the shield and
  // slide rooms open the moment the move is learned, the teacher standing or not.
  it('third: a block opens it, the Trooper still standing', () => {
    const r = makeWalk()
    r.walk.start()
    passTo(r, 2)
    const room = r.gate(2).room
    machine(r, room, 'trooper')
    enter(r, room)
    run(r, 2, true)
    expect(isOpen(r, 2)).toBe(false)
    r.walk.noteBlock()
    run(r, 1, true)
    expect(isOpen(r, 2)).toBe(true)
    expect(r.s.brought).toEqual([])
  })

  it('third: a Trooper felled before any block brings in a Rotor Drone to block', () => {
    const r = makeWalk()
    r.walk.start()
    passTo(r, 2)
    const room = r.gate(2).room
    machine(r, room, 'trooper').state = 'dead'
    enter(r, room)
    run(r, 2)
    expect(r.s.brought).toEqual(['heli'])
    expect(isOpen(r, 2)).toBe(false)
    // The ram is blocked, the drone goes down: the door opens.
    r.walk.noteBlock()
    r.enemies[r.enemies.length - 1]!.state = 'dead'
    run(r, 1)
    expect(isOpen(r, 2)).toBe(true)
    expect(r.s.brought).toEqual(['heli'])
  })

  it('third: never opens without a block, however many stand-ins fall — one at a time, a beat apart', () => {
    const r = makeWalk()
    r.walk.start()
    passTo(r, 2)
    const room = r.gate(2).room
    machine(r, room, 'trooper').state = 'dead'
    enter(r, room)
    const standing = () => r.enemies.filter(e => e.room === room && e.state !== 'dead').length
    let fellAt = -1
    for (let k = 0; k < 12; k++) {
      // Frame by frame until the next one beams in: never two at once.
      const before = r.s.brought.length
      for (let t = 0; t < 5 && r.s.brought.length === before; t += 1 / 30) {
        r.host.time += 1 / 30
        r.walk.update(true, false)
        expect(standing()).toBeLessThanOrEqual(1)
      }
      expect(r.s.brought).toHaveLength(before + 1)
      // A beat after the last one fell, never on its heels.
      if (fellAt >= 0) expect(r.host.time - fellAt).toBeGreaterThanOrEqual(SETTLE)
      // While it stands, no second one comes, and the door stays shut.
      run(r, 3)
      expect(r.s.brought).toHaveLength(before + 1)
      expect(isOpen(r, 2)).toBe(false)
      r.enemies[r.enemies.length - 1]!.state = 'dead'
      fellAt = r.host.time
    }
    expect(r.s.brought.every(k => k === 'heli')).toBe(true)
    run(r, 5)
    expect(isOpen(r, 2)).toBe(false)
    expect(r.walk.needAt(r.gate(2).door)).toBe('block')
    // The block, at last: the door opens.
    r.walk.noteBlock()
    for (const e of r.enemies) e.state = 'dead'
    run(r, 2)
    expect(isOpen(r, 2)).toBe(true)
  })

  it('fourth: never opens without a slide, however many Stompers fall', () => {
    const r = makeWalk()
    r.walk.start()
    passTo(r, 3)
    const room = r.gate(3).room
    machine(r, room, 'hopper').state = 'dead'
    enter(r, room)
    for (let k = 0; k < 8; k++) {
      run(r, 2)
      expect(isOpen(r, 3)).toBe(false)
      for (const e of r.enemies) e.state = 'dead'
    }
    expect(r.s.brought).toHaveLength(8)
    expect(r.s.brought.every(k => k === 'hopper')).toBe(true)
    run(r, 5)
    expect(isOpen(r, 3)).toBe(false)
    r.walk.noteSlide()
    for (const e of r.enemies) e.state = 'dead'
    run(r, 2)
    expect(isOpen(r, 3)).toBe(true)
  })

  it('fourth: the Stomper down AND a slide; felled first, another Stomper comes', () => {
    const r = makeWalk()
    r.walk.start()
    passTo(r, 3)
    const room = r.gate(3).room
    machine(r, room, 'hopper').state = 'dead'
    enter(r, room)
    run(r, 2)
    expect(r.s.brought).toEqual(['hopper'])
    // The newcomer still stands: the slide alone opens the door.
    r.walk.noteSlide()
    run(r, 1)
    expect(isOpen(r, 3)).toBe(true)
  })

  it('fifth: the chest glows until it is opened, and opens the boss shutter', () => {
    const r = makeWalk()
    r.walk.start()
    passTo(r, 4)
    run(r, 0.1)
    expect(r.s.spot.on).toBe(true)
    run(r, 5)
    expect(isOpen(r, 4)).toBe(false)
    expect(r.walk.active).toBe(true)
    r.chests[0]!.opened = true
    run(r, 1)
    expect(r.s.spot.on).toBe(false)
    expect(isOpen(r, 4)).toBe(true)
    expect(r.walk.active).toBe(false)
  })

  it('a folded path teaches two lessons in one room, in order', () => {
    // The old tutorial map: only two rooms between the pad and the boss.
    const r = makeWalk(generateMap({ seed: 20260923, rooms: 7, boss: true }))
    expect(r.plan.gates.map(g => g.steps)).toEqual([['charge'], ['crate', 'block'], ['slide', 'chest']])
    r.walk.start()
    passTo(r, 1)
    const room = r.gate(1).room
    machine(r, room).state = 'dead'
    enter(r, room)
    run(r, 2)
    // The crate first; no stand-in while it is being taught…
    expect(r.s.crateRooms).toEqual([room])
    expect(r.s.brought).toEqual([])
    r.s.crateBroken = true
    run(r, 2)
    // …then the block, which nobody has done yet: a Rotor Drone.
    expect(r.s.brought).toEqual(['heli'])
    r.walk.noteBlock()
    r.enemies[r.enemies.length - 1]!.state = 'dead'
    run(r, 1)
    expect(isOpen(r, 1)).toBe(true)
    // The last room: the chest glows while the Stomper is still to beat.
    enter(r, r.gate(2).room)
    run(r, 0.1)
    expect(r.s.spot.on).toBe(true)
  })

  it('a folded path skips nothing either: the crate done, the block still holds its door', () => {
    const r = makeWalk(generateMap({ seed: 20260923, rooms: 7, boss: true }))
    r.walk.start()
    passTo(r, 1)
    const room = r.gate(1).room
    machine(r, room).state = 'dead'
    enter(r, room)
    run(r, 2)
    r.s.crateBroken = true
    for (let k = 0; k < 6; k++) {
      run(r, 2)
      for (const e of r.enemies) e.state = 'dead'
    }
    run(r, 3)
    expect(r.s.brought.length).toBeGreaterThanOrEqual(6)
    expect(isOpen(r, 1)).toBe(false)
    expect(r.walk.needAt(r.gate(1).door)).toBe('block')
    // …and the last room's slide and chest the same: the chest open, no slide.
    r.walk.noteBlock()
    for (const e of r.enemies) e.state = 'dead'
    run(r, 2)
    expect(isOpen(r, 1)).toBe(true)
    enter(r, r.gate(2).room)
    r.chests[0]!.opened = true
    for (let k = 0; k < 4; k++) {
      run(r, 2)
      for (const e of r.enemies) e.state = 'dead'
    }
    expect(isOpen(r, 2)).toBe(false)
    expect(r.walk.needAt(r.gate(2).door)).toBe('slide')
  })

  // A fight next door (machines that saw Flux through the doorway) used to
  // hold the gate shut until he walked away: only this room's machines count.
  it('a fight in another room never holds the gate', () => {
    const r = makeWalk()
    r.walk.start()
    passTo(r, 1)
    enter(r, r.gate(1).room)
    run(r, 1.5, true)
    r.s.crateBroken = true
    run(r, 1, true)
    expect(isOpen(r, 1)).toBe(true)
  })
})

describe('resume', () => {
  it('restores the gates passed, locks only the rest, and needs no drone', () => {
    const a = makeWalk()
    a.walk.start()
    passTo(a, 3)
    const saved = JSON.parse(JSON.stringify(a.walk.save())) as ReturnType<Walk['save']>
    // `gel`: the Repair Gel corridor's trap has not gone off (see below).
    expect(saved).toEqual({ gate: 3, crate: true, block: true, slide: false, leap: false, gel: false, gelDone: false })
    const b = makeWalk()
    b.walk.restore(saved)
    b.walk.start()
    expect(b.walk.passed).toBe(3)
    expect(b.walk.needsDrone).toBe(false)
    expect(held(b)).toEqual([b.gate(3).door, b.gate(4).door].sort((x, y) => x - y))
    // …and carries on from there: the slide still has to happen.
    machine(b, b.gate(3).room, 'hopper').state = 'dead'
    enter(b, b.gate(3).room)
    run(b, 2)
    expect(b.s.brought).toEqual(['hopper'])
  })

  it('a block, a slide or a broken crate survive a resume mid-room', () => {
    const a = makeWalk()
    a.walk.start()
    passTo(a, 1)
    enter(a, a.gate(1).room)
    run(a, 1.5)
    a.s.crateBroken = true
    a.walk.noteSlide()
    // Saved on the frame the crate broke: before the door had its moment.
    run(a, 0.1)
    const saved = a.walk.save()
    expect(saved).toMatchObject({ gate: 1, crate: true, slide: true })
    const b = makeWalk()
    b.walk.restore(saved)
    b.walk.start()
    enter(b, b.gate(1).room)
    run(b, 1)
    expect(isOpen(b, 1)).toBe(true)
  })

  it('reads a malformed or missing save as a fresh start', () => {
    const r = makeWalk()
    r.walk.restore(undefined)
    expect(r.walk.passed).toBe(0)
    r.walk.restore({ gate: 'x', crate: 1, block: 'yes', slide: null, gel: 'yes', gelDone: 1 } as unknown as ReturnType<Walk['save']>)
    expect(r.walk.save()).toEqual({ gate: 0, crate: false, block: false, slide: false, leap: false, gel: false, gelDone: false })
    r.walk.restore({ gate: 99, crate: false, block: false, slide: false })
    expect(r.walk.passed).toBe(5)
    expect(r.walk.active).toBe(false)
  })

  it('an older save without the gel field resumes as "not gone off yet"', () => {
    // Written before the Repair Gel corridor existed: four fields only.
    const old = { gate: 4, crate: true, block: true, slide: true }
    const r = makeWalk()
    r.walk.restore(old)
    r.walk.start()
    expect(r.walk.passed).toBe(4)
    expect(r.walk.gelFired).toBe(false)
    expect(r.walk.save()).toEqual({ ...old, leap: false, gel: false, gelDone: false })
    expect(held(r)).toEqual([r.gate(4).door])
  })

  it('a resume never opens a gate its save has not earned, however many stand-ins fall', () => {
    const b = makeWalk()
    b.walk.restore({ gate: 2, crate: true, block: false, slide: true })
    b.walk.start()
    const room = b.gate(2).room
    machine(b, room, 'trooper').state = 'dead'
    enter(b, room)
    for (let k = 0; k < 5; k++) {
      run(b, 2)
      for (const e of b.enemies) e.state = 'dead'
    }
    run(b, 3)
    expect(b.s.brought.length).toBeGreaterThanOrEqual(5)
    expect(isOpen(b, 2)).toBe(false)
    expect(held(b)).toContain(b.gate(2).door)
  })

  it('a malformed save claiming the gel trap before its gate cannot open that gate', () => {
    const r = makeWalk(tutorialMap(), { gel: true })
    const gelGate = r.plan.gel!.gate
    r.walk.restore({ gate: 1, crate: false, block: false, slide: false, gel: true })
    r.walk.start()
    expect(r.walk.gelPending).toBe(false)
    r.s.droneUp = false
    r.s.gelOver = true
    enter(r, r.gate(gelGate).room)
    run(r, 5)
    expect(isOpen(r, gelGate)).toBe(false)
    expect(r.s.gelStarts).toBe(0)
  })
})

// #270: the door the player came in by shuts behind him, one way forward.
describe('doors shut behind', () => {
  it('shuts the door in to each gate once the player is well inside the next room, never before', () => {
    const r = makeWalk()
    r.host.shutDoor = (id) => { r.doors.set(id, 'held') }
    r.walk.start()
    passTo(r, 1)
    // Gate 0's door opened; standing in the start room it stays open.
    expect(isOpen(r, 0)).toBe(true)
    enter(r, r.gate(1).room)
    run(r, 0.2)
    expect(r.doors.get(r.gate(0).door)).toBe('held')
    // The next one too, once through it.
    run(r, 1.5)
    r.s.crateBroken = true
    run(r, 1)
    expect(isOpen(r, 1)).toBe(true)
    enter(r, r.gate(2).room)
    run(r, 0.2)
    expect(r.doors.get(r.gate(1).door)).toBe('held')
  })

  it('a host without the hook leaves the way back open', () => {
    const r = makeWalk()
    r.walk.start()
    passTo(r, 2)
    expect(isOpen(r, 0)).toBe(true)
    expect(isOpen(r, 1)).toBe(true)
  })
})

// The built tutorial's breather before the boss (#D29): its door, the boss
// shutter, waits for the Repair Gel lesson, so the lesson never fires while
// the player is already at the boss door.
describe('the breather waits for the gel', () => {
  it('holds the boss shutter until the gel lesson is over, and names the gel', async () => {
    const { generateWakeUpCall } = await import('@/game/world/stages/tutorial')
    const r = makeWalk(generateWakeUpCall(1), { gel: true })
    const last = r.plan.gates.length - 1
    expect(r.gate(last).steps).toEqual(['rest'])
    // Resumed in the breather with the plate never stepped on.
    r.walk.restore({ gate: last, crate: true, block: true, slide: true, leap: true })
    r.walk.start()
    enter(r, r.gate(last).room)
    run(r, 3)
    expect(r.walk.passed).toBe(last)
    expect(r.walk.needAt(r.gate(last).door)).toBe('gel')
    // The plate, the lesson, the gel used: the shutter's gate passes.
    r.host.player.x = r.plan.gel!.spot.x
    r.host.player.z = r.plan.gel!.spot.z
    run(r, GEL_DELAY + 0.5)
    r.s.gelOver = true
    run(r, 0.2)
    enter(r, r.gate(last).room)
    run(r, 2)
    expect(r.walk.passed).toBe(last + 1)
  })
})

describe('the Repair Gel corridor', () => {
  /** Stand on the gel plate's cell. */
  const onPlate = (r: Rig) => {
    r.host.player.x = r.plan.gel!.spot.x
    r.host.player.z = r.plan.gel!.spot.z
  }

  it('is the corridor out of the Stomper\'s room, its plate one cell before the door', () => {
    const { map, plan } = makeWalk()
    const gel = plan.gel!
    expect(gel).not.toBeNull()
    expect(plan.gates[gel.gate]!.steps).toContain('slide')
    expect(gel.door).toBe(plan.gates[gel.gate]!.door)
    expect(map.doors[gel.door]!.boss).toBe(false)
    const cells = corridorCells(map, map.doors[gel.door]!)
    const at = cells.findIndex(([i, j]) => i === gel.spot.i && j === gel.spot.j)
    expect(at).toBe(cells.length - 2)
    expect(gel.spot.plate).toBe(true)
    expect(gel.spot.room).toBe(plan.gates[gel.gate]!.room)
  })

  it('never takes the boss shutter\'s corridor, even on a folded path', () => {
    const map = generateMap({ seed: 20260923, rooms: 7, boss: true })
    const plan = planWalkthrough(map)
    // [charge] [crate, block] [slide, chest]: the Stomper room opens on the boss.
    const gel = plan.gel
    if (gel) {
      expect(map.doors[gel.door]!.boss).toBe(false)
      expect(gel.gate).toBeGreaterThanOrEqual(1)
    }
  })

  // Every playtester of 2026-10-06 cut the corner: from the cell beside the
  // plate straight into the doorway. The plate stayed armed, the gel lesson
  // never came, and the boss shutter (it waits for the gel) stayed shut.
  it('goes off when Flux cuts the corner past the plate: in the doorway, or already through it', () => {
    for (const where of ['doorway', 'beyond'] as const) {
      const r = makeWalk(tutorialMap(), { gel: true })
      r.walk.start()
      passTo(r, 4)
      const gel = r.plan.gel!
      if (where === 'doorway') {
        const d = r.map.doors[gel.door]!
        r.host.player.x = cellCenter(d.i)
        r.host.player.z = cellCenter(d.j)
      } else enter(r, r.plan.gates[gel.gate + 1]!.room)
      run(r, 0.1)
      expect(r.s.sprung, where).toBe(1)
      run(r, GEL_DELAY + 0.1)
      expect(r.s.gelStarts, where).toBe(1)
    }
  })

  it('goes off anyway when something awake nearby will not come: never a tutorial shut for good', () => {
    const r = makeWalk(tutorialMap(), { gel: true })
    r.walk.start()
    passTo(r, 4)
    r.s.gelSafe = false
    onPlate(r)
    run(r, GEL_FORCE_AFTER - 1)
    expect(r.s.sprung).toBe(0)
    run(r, 1.2)
    expect(r.s.sprung).toBe(1)
  })

  it('is armed once the Stomper\'s gate is passed, and not before', () => {
    const r = makeWalk(tutorialMap(), { gel: true })
    r.walk.start()
    passTo(r, 3)
    onPlate(r)
    run(r, 1)
    expect(r.s.sprung).toBe(0)
  })

  it('goes off on the plate: the door ahead held again, the lesson after a beat, the door back once it is over', () => {
    const r = makeWalk(tutorialMap(), { gel: true })
    r.walk.start()
    passTo(r, 4)
    const door = r.plan.gel!.door
    expect(r.doors.get(door)).toBe('open')
    onPlate(r)
    run(r, 0.1)
    expect(r.s.sprung).toBe(1)
    expect(r.doors.get(door)).toBe('held')
    expect(r.walk.gelFired).toBe(true)
    expect(r.walk.gelPending).toBe(true)
    // The burst reads first: no lesson yet.
    expect(r.s.gelStarts).toBe(0)
    run(r, GEL_DELAY + 0.1)
    expect(r.s.gelStarts).toBe(1)
    // However long the gel waits, the door waits with it.
    run(r, 20)
    expect(r.doors.get(door)).toBe('held')
    expect(r.s.gelStarts).toBe(1)
    r.s.gelOver = true
    run(r, 0.1)
    expect(r.doors.get(door)).toBe('open')
    expect(r.walk.gelPending).toBe(false)
    // Once only.
    onPlate(r)
    run(r, 2)
    expect(r.s.sprung).toBe(1)
  })

  it('holds its fire during a fight or with a machine awake near Flux', () => {
    const r = makeWalk(tutorialMap(), { gel: true })
    r.walk.start()
    passTo(r, 4)
    onPlate(r)
    run(r, 1, true)
    expect(r.s.sprung).toBe(0)
    r.s.gelSafe = false
    run(r, 1)
    expect(r.s.sprung).toBe(0)
    r.s.gelSafe = true
    run(r, 0.1)
    expect(r.s.sprung).toBe(1)
  })

  it('never goes off twice across a resume — and a resume before a gel was used teaches it again', () => {
    const a = makeWalk(tutorialMap(), { gel: true })
    a.walk.start()
    passTo(a, 4)
    onPlate(a)
    run(a, 0.1)
    const saved = JSON.parse(JSON.stringify(a.walk.save())) as ReturnType<Walk['save']>
    expect(saved).toMatchObject({ gel: true, gelDone: false })
    const b = makeWalk(tutorialMap(), { gel: true })
    b.walk.restore(saved)
    b.walk.start()
    const door = b.plan.gel!.door
    // Its door is shut again, and the lesson comes back after a beat…
    expect(held(b)).toEqual([door, b.gate(4).door].sort((x, y) => x - y))
    expect(b.walk.gelPending).toBe(true)
    expect(b.walk.needAt(door)).toBe('gel')
    onPlate(b)
    run(b, GEL_DELAY + 0.2)
    expect(b.s.gelStarts).toBe(1)
    // …but the plate stays spent.
    expect(b.s.sprung).toBe(0)
    run(b, 10)
    expect(b.doors.get(door)).toBe('held')
    b.s.gelOver = true
    run(b, 0.1)
    expect(b.doors.get(door)).toBe('open')
    expect(b.walk.needAt(door)).toBeNull()
  })

  it('a resume after the gel was used keeps its door open', () => {
    const a = makeWalk(tutorialMap(), { gel: true })
    a.walk.start()
    passTo(a, 4)
    onPlate(a)
    run(a, GEL_DELAY + 0.2)
    a.s.gelOver = true
    run(a, 0.1)
    const saved = JSON.parse(JSON.stringify(a.walk.save())) as ReturnType<Walk['save']>
    expect(saved).toMatchObject({ gel: true, gelDone: true })
    const b = makeWalk(tutorialMap(), { gel: true })
    b.walk.restore(saved)
    b.walk.start()
    expect(held(b)).toEqual([b.gate(4).door])
    run(b, 3)
    expect(b.s.gelStarts).toBe(0)
    expect(b.s.sprung).toBe(0)
  })

  it('a resume past its gate, before it went off, arms it again', () => {
    const b = makeWalk(tutorialMap(), { gel: true })
    b.walk.restore({ gate: 4, crate: true, block: true, slide: true, gel: false })
    b.walk.start()
    onPlate(b)
    run(b, 0.1)
    expect(b.s.sprung).toBe(1)
  })
})

describe('the coach during the gel lesson', () => {
  const ctx = (time: number, over: Partial<CoachContext> = {}): CoachContext => ({
    time, family: 'mouse', playing: true, combat: false, aimCandidate: false, teleBlock: false, teleRed: false,
    hp01: 0.25, tanks: 1, hasWeapon: false, canInteract: false, quiet: true, ...over
  })

  it('drops its own tank glyph while the lesson owns the gel button, and brings it back after', () => {
    const c = new Coach()
    for (let t = 0; t < 2; t += 1 / 15) c.update(ctx(t))
    expect(c.views().map(h => h.id)).toContain('tank')
    // The lesson comes on: the glyph goes at once, no linger.
    c.update(ctx(2, { gelLesson: true }))
    expect(c.views().map(h => h.id)).not.toContain('tank')
    for (let t = 2; t < 6; t += 1 / 15) c.update(ctx(t, { gelLesson: true }))
    expect(c.views().map(h => h.id)).not.toContain('tank')
    // Over without a gel used (health back another way): the coach's rule again.
    c.update(ctx(6.1, { gelLesson: false }))
    expect(c.views().map(h => h.id)).toContain('tank')
  })
})

describe('walkthroughActive', () => {
  it('is true until the chest room\'s door opens, then false for good', () => {
    const r = makeWalk()
    r.walk.start()
    const seen: boolean[] = []
    for (let n = 1; n <= 4; n++) {
      passTo(r, n)
      seen.push(r.walk.active)
    }
    r.chests[0]!.opened = true
    run(r, 1)
    seen.push(r.walk.active)
    run(r, 10)
    seen.push(r.walk.active)
    expect(seen).toEqual([true, true, true, true, false, false])
  })
})

describe('goal: where the floor trail leads next', () => {
  type Spot = { kind: string; x: number; z: number }
  const goal = (r: Rig): Spot | null => {
    const g = r.walk.goal()
    return g ? { kind: g.kind, x: g.x, z: g.z } : null
  }
  const at = (kind: string, p: { x: number; z: number }): Spot => ({ kind, x: p.x, z: p.z })
  /** Gate k's room from outside: just inside the door leading in. */
  const entry = (r: Rig, k: number): Spot => {
    const [x, z] = doorwayOf(r.map, r.gate(k).room)
    return { kind: 'room', x, z }
  }
  /** Gate k's door out: its cell. */
  const exit = (r: Rig, k: number): Spot => {
    const d = r.map.doors[r.gate(k).door]!
    return { kind: 'door', x: cellCenter(d.i), z: cellCenter(d.j) }
  }
  const standAt = (r: Rig, p: { x: number; z: number }) => {
    r.host.player.x = p.x
    r.host.player.z = p.z
  }

  it('walks the tutorial in order: drone, Hardhat, crate, door, Trooper, Stomper, gel plate, chest, boss shutter', () => {
    const r = makeWalk(tutorialMap(), { gel: true })
    r.walk.start()
    const [c1, c2, c3] = [1, 2, 3].map(k => r.gate(k).room) as [number, number, number]
    const hardhat = machine(r, c1)
    const trooper = machine(r, c2, 'trooper')
    const stomper = machine(r, c3, 'hopper')
    // On the pad, from the first frame: the training drone, however long it hovers.
    expect(goal(r)).toEqual(at('drone', r.s.drone))
    run(r, 5)
    expect(goal(r)).toEqual(at('drone', r.s.drone))
    // Popped: the door out while it takes its beat, then — open — the next
    // room, one cell on (the trail runs on instead of starting over).
    r.s.droneUp = false
    run(r, 0.1)
    expect(goal(r)).toEqual(exit(r, 0))
    run(r, 1)
    expect(isOpen(r, 0)).toBe(true)
    expect(goal(r)).toEqual(entry(r, 1))
    expect(Math.hypot(entry(r, 1).x - exit(r, 0).x, entry(r, 1).z - exit(r, 0).z)).toBeCloseTo(CELL)
    // The Hardhat: its room from outside while it sleeps; awake, the Hardhat.
    hardhat.awake = true
    expect(goal(r)).toEqual(at('machine', hardhat))
    hardhat.awake = false
    enter(r, c1)
    expect(goal(r)).toEqual(at('machine', hardhat))
    // Down: nowhere to walk while the crate lesson moves in…
    hardhat.state = 'dead'
    run(r, 0.1)
    expect(goal(r)).toBeNull()
    run(r, 1.5)
    expect(r.s.crateRooms).toEqual([c1])
    // …then the crate, from wherever the player has wandered.
    expect(goal(r)).toEqual(at('crate', r.s.crate!))
    standAt(r, r.map.start)
    expect(goal(r)).toEqual(at('crate', r.s.crate!))
    enter(r, c1)
    r.s.crateBroken = true
    run(r, 0.1)
    expect(goal(r)).toEqual(exit(r, 1))
    run(r, 1)
    // The Trooper; its door once it is down and a block happened.
    expect(goal(r)).toEqual(entry(r, 2))
    enter(r, c2)
    expect(goal(r)).toEqual(at('machine', trooper))
    r.walk.noteBlock()
    trooper.state = 'dead'
    run(r, 0.1)
    expect(goal(r)).toEqual(exit(r, 2))
    run(r, 1)
    // The Stomper; its door once it is down and a slide happened.
    expect(goal(r)).toEqual(entry(r, 3))
    enter(r, c3)
    expect(goal(r)).toEqual(at('machine', stomper))
    r.walk.noteSlide()
    stomper.state = 'dead'
    run(r, 0.1)
    expect(goal(r)).toEqual(exit(r, 3))
    run(r, 1)
    // Out of the Stomper's room: the gel corridor's plate comes first.
    expect(goal(r)).toEqual(at('plate', r.plan.gel!.spot))
    standAt(r, r.plan.gel!.spot)
    run(r, 0.1)
    expect(r.s.sprung).toBe(1)
    // The gel lesson has the moment: nowhere to walk until a gel is used.
    expect(goal(r)).toBeNull()
    run(r, GEL_DELAY + 0.5)
    expect(goal(r)).toBeNull()
    r.s.gelOver = true
    run(r, 0.1)
    // The chest; once open, the boss shutter's cell, then the mission's objective.
    expect(goal(r)).toEqual(at('chest', r.chest))
    r.chests[0]!.opened = true
    run(r, 0.1)
    expect(goal(r)).toEqual(exit(r, 4))
    run(r, 1)
    expect(r.walk.active).toBe(false)
    expect(goal(r)).toEqual(at('objective', shutterOf(r.map)))
  })

  it('a stand-in teacher is the goal while it stands', () => {
    const r = makeWalk()
    r.walk.start()
    passTo(r, 2)
    const room = r.gate(2).room
    machine(r, room, 'trooper').state = 'dead'
    enter(r, room)
    // Down before a single block: quiet, the player in the room — the
    // stand-in beams in to him, nothing to walk to meanwhile.
    expect(goal(r)).toBeNull()
    run(r, 2)
    expect(r.s.brought).toEqual(['heli'])
    const heli = r.enemies[r.enemies.length - 1]!
    expect(goal(r)).toEqual(at('machine', heli))
    // From outside the room (it rams, he backs out): still the drone, awake.
    standAt(r, r.map.start)
    expect(goal(r)).toEqual(at('machine', heli))
  })

  it('a folded path: two lessons in one room, each subject in turn', () => {
    const r = makeWalk(generateMap({ seed: 20260923, rooms: 7, boss: true }))
    expect(r.plan.gates.map(g => g.steps)).toEqual([['charge'], ['crate', 'block'], ['slide', 'chest']])
    r.walk.start()
    expect(goal(r)).toEqual(at('drone', r.s.drone))
    passTo(r, 1)
    const room = r.gate(1).room
    const hardhat = machine(r, room)
    expect(goal(r)).toEqual(entry(r, 1))
    enter(r, room)
    expect(goal(r)).toEqual(at('machine', hardhat))
    hardhat.state = 'dead'
    run(r, 1.5)
    expect(goal(r)).toEqual(at('crate', r.s.crate!))
    // The crate broken, the block is next: a Rotor Drone beams in, and it is the goal.
    r.s.crateBroken = true
    run(r, 0.5)
    expect(r.s.brought).toEqual(['heli'])
    const heli = r.enemies[r.enemies.length - 1]!
    expect(goal(r)).toEqual(at('machine', heli))
    r.walk.noteBlock()
    heli.state = 'dead'
    run(r, 0.1)
    expect(goal(r)).toEqual(exit(r, 1))
    run(r, 1)
    // The last room: the Stomper, then the chest in the same room.
    const last = r.gate(2).room
    const stomper = machine(r, last, 'hopper')
    expect(goal(r)).toEqual(entry(r, 2))
    enter(r, last)
    expect(goal(r)).toEqual(at('machine', stomper))
    r.walk.noteSlide()
    stomper.state = 'dead'
    expect(goal(r)).toEqual(at('chest', r.chest))
    r.chests[0]!.opened = true
    run(r, 0.1)
    expect(goal(r)).toEqual(exit(r, 2))
    run(r, 1)
    expect(goal(r)).toEqual(at('objective', shutterOf(r.map)))
  })

  it('a long path: a plain "clear it" room leads to its machines, then on to the chest', () => {
    const r = makeWalk(generateMap({ seed: 32, rooms: 7, boss: true }))
    expect(r.plan.gates.map(g => g.steps)).toEqual([['charge'], ['crate'], ['block'], ['slide'], ['clear'], ['chest']])
    r.walk.start()
    passTo(r, 4)
    const room = r.gate(4).room
    const guard = machine(r, room)
    // From the Stomper's room: the next room, then its machine once inside.
    expect(goal(r)).toEqual(entry(r, 4))
    enter(r, room)
    expect(goal(r)).toEqual(at('machine', guard))
    guard.state = 'dead'
    run(r, 0.1)
    expect(goal(r)).toEqual(exit(r, 4))
    run(r, 1)
    expect(r.walk.passed).toBe(5)
    expect(goal(r)).toEqual(at('chest', r.chest))
  })

  it('after a resume: from the restored gate on, the plate first while its corridor is armed', () => {
    // Saved mid-walk, restored on a fresh mission: the same goal from the same spot.
    const a = makeWalk(tutorialMap(), { gel: true })
    a.walk.start()
    passTo(a, 2)
    const saved = JSON.parse(JSON.stringify(a.walk.save())) as ReturnType<Walk['save']>
    const b = makeWalk(tutorialMap(), { gel: true })
    b.walk.restore(saved)
    b.walk.start()
    machine(a, a.gate(2).room, 'trooper')
    machine(b, b.gate(2).room, 'trooper')
    standAt(b, a.host.player)
    expect(goal(b)).toEqual(entry(b, 2))
    expect(goal(b)).toEqual(goal(a))
    // Past the Stomper, the plate not gone off yet: the plate.
    const c = makeWalk(tutorialMap(), { gel: true })
    c.walk.restore({ gate: 4, crate: true, block: true, slide: true, gel: false })
    c.walk.start()
    expect(goal(c)).toEqual(at('plate', c.plan.gel!.spot))
    // …gone off and a gel used before the save: straight on to the chest.
    const d = makeWalk(tutorialMap(), { gel: true })
    d.walk.restore({ gate: 4, crate: true, block: true, slide: true, gel: true, gelDone: true })
    d.walk.start()
    expect(goal(d)).toEqual(at('chest', d.chest))
    // …gone off, no gel used yet: the gel lesson has the moment again.
    const f = makeWalk(tutorialMap(), { gel: true })
    f.walk.restore({ gate: 4, crate: true, block: true, slide: true, gel: true })
    f.walk.start()
    expect(goal(f)).toBeNull()
    // Every gate passed: the boss shutter.
    const e = makeWalk()
    e.walk.restore({ gate: 5, crate: true, block: true, slide: true, gel: true })
    e.walk.start()
    expect(goal(e)).toEqual(at('objective', shutterOf(e.map)))
  })

  it('only reads: asking changes no progress and saves nothing, one shared answer', () => {
    const r = makeWalk(tutorialMap(), { gel: true })
    r.walk.start()
    passTo(r, 1)
    enter(r, r.gate(1).room)
    run(r, 1.5)
    // The crate breaks; no step has seen it yet.
    r.s.crateBroken = true
    const save = r.walk.save()
    const saves = r.s.saves
    const first = r.walk.goal()
    const again = r.walk.goal()
    expect(again).toBe(first)
    expect(first?.kind).toBe('door')
    expect(r.walk.save()).toEqual(save)
    expect(r.s.saves).toBe(saves)
  })
})

describe('the held door\'s prompt: what a door waits on, who teaches', () => {
  it('needAt names the gate being taught\'s first step not done — nothing once its room is done', () => {
    const r = makeWalk()
    r.walk.start()
    expect(r.walk.needAt(r.gate(0).door)).toBe('charge')
    // A later gate's door is not the one being taught.
    expect(r.walk.needAt(r.gate(1).door)).toBeNull()
    r.s.droneUp = false
    // Done: its door opens in a moment, nothing to prompt.
    expect(r.walk.needAt(r.gate(0).door)).toBeNull()
    passTo(r, 1)
    const hardhat = machine(r, r.gate(1).room)
    expect(r.walk.needAt(r.gate(1).door)).toBe('crate')
    hardhat.state = 'dead'
    passTo(r, 2)
    expect(r.walk.needAt(r.gate(2).door)).toBe('block')
    // Blocked: done, the Trooper standing or not.
    machine(r, r.gate(2).room, 'trooper')
    r.walk.noteBlock()
    expect(r.walk.needAt(r.gate(2).door)).toBeNull()
    passTo(r, 3)
    expect(r.walk.needAt(r.gate(3).door)).toBe('slide')
    passTo(r, 4)
    expect(r.walk.needAt(r.gate(4).door)).toBe('chest')
    // Only reads: nothing saved, nothing passed.
    expect(r.walk.passed).toBe(4)
  })

  it('needAt on a folded path: the room\'s steps in turn', () => {
    const r = makeWalk(generateMap({ seed: 20260923, rooms: 7, boss: true }))
    r.walk.start()
    passTo(r, 1)
    const room = r.gate(1).room
    enter(r, room)
    expect(r.walk.needAt(r.gate(1).door)).toBe('crate')
    run(r, 1.5)
    r.s.crateBroken = true
    run(r, 0.1)
    expect(r.walk.needAt(r.gate(1).door)).toBe('block')
  })

  it('teacher: the room\'s machine standing nearest the player — a stand-in too', () => {
    const r = makeWalk()
    r.walk.start()
    passTo(r, 2)
    const room = r.gate(2).room
    expect(r.walk.teacher()).toBeNull()
    const trooper = machine(r, room, 'trooper')
    expect(r.walk.teacher()).toBe(trooper)
    trooper.state = 'dead'
    expect(r.walk.teacher()).toBeNull()
    enter(r, room)
    run(r, 2)
    expect(r.walk.teacher()).toBe(r.enemies[r.enemies.length - 1])
  })

  it('only the dev cheat opens a door without its lesson', () => {
    const r = makeWalk(tutorialMap(), { gel: true })
    r.walk.start()
    run(r, 30)
    expect(isOpen(r, 0)).toBe(false)
    r.walk.devPass()
    expect(isOpen(r, 0)).toBe(true)
    expect(r.walk.passed).toBe(1)
    // The gel corridor's door too, while it waits for a gel.
    passTo(r, 4)
    r.host.player.x = r.plan.gel!.spot.x
    r.host.player.z = r.plan.gel!.spot.z
    run(r, 0.1)
    expect(r.doors.get(r.plan.gel!.door)).toBe('held')
    r.walk.devPass()
    expect(r.doors.get(r.plan.gel!.door)).toBe('open')
    expect(r.walk.gelPending).toBe(false)
  })
})

describe('the coach, with the drone\'s lesson in focus', () => {
  const ctx = (time: number, over: Partial<CoachContext> = {}): CoachContext => ({
    time, family: 'touch', playing: true, combat: false, aimCandidate: false, teleBlock: false, teleRed: false,
    hp01: 1, tanks: 1, hasWeapon: false, canInteract: false, quiet: true, ...over
  })

  it('wants the stick on the very first frame on a phone (the ∞ stands for the camera)', () => {
    const c = new Coach()
    c.update(ctx(0))
    const v = c.views()
    expect(v.map(h => h.id)).toEqual(['move'])
    expect(v.every(h => h.family === 'touch')).toBe(true)
  })

  it('keeps it through the whole lesson until it is learned', () => {
    const c = new Coach()
    for (let t = 0; t < 40; t += 1 / 15) c.update(ctx(t, { aimCandidate: true }))
    const ids = c.views().map(h => h.id)
    expect(ids).toContain('move')
    expect(ids).not.toContain('look')
    expect(ids).not.toContain('fire')
  })
})

describe('the scripted cast', () => {
  const cast = async () => {
    const map = tutorialMap()
    const nav = createNav(map)
    const plan = planWalkthrough(map)
    const side = map.rooms.filter(r => r.role !== 'start' && r.role !== 'boss' && !plan.path.includes(r.id))
    const chestRooms = new Set([side[0]!.id])
    const enemies = await spawnTutorial(map, nav, plan, 1, { chestRooms })
    return { map, nav, plan, side, chestRooms, enemies }
  }

  it('names each gate\'s lesson on its door, in every language ("Finish first: Shield Tutorial")', async () => {
    const { LESSON_OF } = await import('@/game/sim/walkthrough')
    const en = (await import('@/i18n/locales/en')).default as unknown as { train: { name: Record<string, string> }; walk: Record<string, string> }
    const de = (await import('@/i18n/locales/de')).default as unknown as { train: { name: Record<string, string> }; walk: Record<string, string> }
    for (const [need, id] of Object.entries(LESSON_OF)) {
      expect(typeof en.train.name[id!], need).toBe('string')
      expect(typeof de.train.name[id!], need).toBe('string')
    }
    expect(en.walk.finishLessonNamed).toContain('{lesson}')
    expect(de.walk.finishLessonNamed).toContain('{lesson}')
    // Steps that are not lessons keep the plain label.
    expect(LESSON_OF.clear).toBeUndefined()
    expect(LESSON_OF.chest).toBeUndefined()
  })

  it('the built tutorial casts its fighting rooms itself: two rotor drones, a wheel and a Trooper, a crate golem', async () => {
    const { generateWakeUpCall } = await import('@/game/world/stages/tutorial')
    const map = generateWakeUpCall(1)
    const plan = planWalkthrough(map)
    const enemies = await spawnTutorial(map, createNav(map), plan, 1)
    const kinds = (k: number) => enemies.filter(e => e.room === plan.gates[k]!.room).map(e => e.kind).sort()
    expect(kinds(6)).toEqual(['heli', 'heli'])
    expect(kinds(7)).toEqual(['roller', 'trooper'])
    expect(kinds(8)).toEqual(['golem'])
    expect(kinds(9)).toEqual([])
    // The block lesson's Trooper keeps its spot (#270); nothing else is rooted.
    const rooted = enemies.filter(e => e.rooted)
    expect(rooted.map(e => e.kind)).toEqual(['trooper'])
    expect(rooted[0]!.room).toBe(plan.gates.find(g => g.steps.includes('block'))!.room)
  })

  it('holds every machine in its own room (one wandered back and kept a gate shut)', async () => {
    const { map, enemies } = await cast()
    expect(enemies.length).toBeGreaterThan(0)
    for (const e of enemies) {
      const r = map.rooms[e.room]!
      const [x0, z0, x1, z1] = e.leash!
      expect(x0, e.kind).toBeGreaterThanOrEqual(r.x0 * CELL)
      expect(z0, e.kind).toBeGreaterThanOrEqual(r.z0 * CELL)
      expect(x1, e.kind).toBeLessThanOrEqual((r.x0 + r.w) * CELL)
      expect(z1, e.kind).toBeLessThanOrEqual((r.z0 + r.h) * CELL)
      expect(e.x >= x0 && e.x <= x1 && e.z >= z0 && e.z <= z1, e.kind).toBe(true)
    }
  })

  it('puts exactly the teaching machine in each walkthrough room', async () => {
    const { plan, enemies } = await cast()
    const kinds = (room: number) => enemies.filter(e => e.room === room).map(e => e.kind)
    expect(kinds(plan.gates[0]!.room)).toEqual([])
    expect(kinds(plan.gates[1]!.room)).toEqual(['hardhat'])
    expect(kinds(plan.gates[2]!.room)).toEqual(['trooper'])
    expect(kinds(plan.gates[3]!.room)).toEqual(['hopper'])
    expect(kinds(plan.gates[4]!.room)).toEqual([])
  })

  it('side rooms: a Hardhat or two, or nothing where a chest waits; never a Guardroid or an elite', async () => {
    const { side, chestRooms, enemies } = await cast()
    for (const r of side) {
      const kinds = enemies.filter(e => e.room === r.id).map(e => e.kind)
      if (chestRooms.has(r.id)) expect(kinds).toEqual([])
      else {
        expect(kinds.length).toBeGreaterThanOrEqual(1)
        expect(kinds.length).toBeLessThanOrEqual(2)
        expect(kinds.every(k => k === 'hardhat')).toBe(true)
      }
    }
    expect(enemies.some(e => e.kind === 'brute' || e.elite)).toBe(false)
  })

  it('each teacher stands in sight of the door the player comes in by, and the same every time', async () => {
    const a = await cast()
    for (const g of a.plan.gates.slice(1, 4)) {
      const e = a.enemies.find(x => x.room === g.room)!
      const [dx, dz] = doorwayOf(a.map, g.room)
      expect(roomAt(a.map, dx, dz)).toBe(g.room)
      expect(hasLineOfSight(a.nav, dx, dz, e.x, e.z)).toBe(true)
      expect(isSolidAt(a.nav, e.x, e.z)).toBe(false)
    }
    const b = await cast()
    expect(b.enemies.map(e => [e.kind, e.room, e.x, e.z])).toEqual(a.enemies.map(e => [e.kind, e.room, e.x, e.z]))
  })

  it('a stand-in beams in inside the room, in sight, a few metres out', () => {
    const map = tutorialMap()
    const nav = createNav(map)
    const room = planWalkthrough(map).gates[2]!.room
    const [px, pz] = doorwayOf(map, room)
    const at = helperSpot(nav, map, room, px, pz, 0)!
    expect(at).not.toBeNull()
    expect(roomAt(map, at[0], at[1])).toBe(room)
    expect(hasLineOfSight(nav, px, pz, at[0], at[1])).toBe(true)
    const d = Math.hypot(at[0] - px, at[1] - pz)
    expect(d).toBeGreaterThanOrEqual(4)
    expect(d).toBeLessThanOrEqual(11)
  })
})

describe('flow', () => {
  beforeEach(() => {
    profile.world.tutorialDone = false
    profile.world.unlocked = ['scrapyard']
    profile.world.bosses = []
    writeSnapshot(null)
  })

  it('the Scrapyard story card replays the tutorial until it is done', async () => {
    const { storyFor } = await import('@/game/flow')
    expect(storyFor('scrapyard')?.template).toBe('tutorial')
    profile.world.tutorialDone = true
    profile.world.bosses = ['scrapper']
    expect(storyFor('scrapyard')).toBeNull()
  })

  it('a tutorial snapshot from before the walkthrough starts the tutorial over; a new one resumes', async () => {
    const { bootTarget } = await import('@/game/flow')
    const snap: MissionSnapshot = {
      quest: { ...tutorialQuest(), seed: 20260923 }, killed: [1], opened: [], doors: [0], collected: [], progress: 0,
      x: 10, z: 10, yaw: 0, hp: 50, we: 10, bolts: 5, xp: 12, kills: 1, t: 60, done: false
    }
    writeSnapshot(snap)
    const old = bootTarget()
    expect(old.kind === 'mission' && old.snapshot).toBeNull()
    expect(old.kind === 'mission' && old.quest.seed).toBe(tutorialQuest().seed)
    writeSnapshot({ ...snap, quest: tutorialQuest(), walk: { gate: 2, crate: true, block: false, slide: false } })
    const cur = bootTarget()
    expect(cur.kind === 'mission' && cur.snapshot?.walk?.gate).toBe(2)
  })
})
