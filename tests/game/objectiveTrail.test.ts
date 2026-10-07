// The objective trail (src/game/fx/objectiveTrail.ts) and where it leads
// (`MissionObjects.target` / `objectiveTarget`, src/game/sim/objectives.ts):
// small yellow chevrons on the floor toward the mission's main objective.
// These pin the spot each mission template picks, the chevrons' layout
// (spacing, count, where they start and stop, that they stay put while the
// player walks), the hide rules, the search rate, and the walk through shut
// doors up to the locked boss shutter — on real sector maps, without a GPU.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Matrix4, Scene, Vector3 } from 'three'
import { generateMap, cellCenter, CELL, Cell, type MapData } from '@/game/world/levelGen'
import { createNav, findPath, type Nav } from '@/game/world/nav'
import { THEMES } from '@/game/world/themes'
import { tutorialQuest } from '@/game/data/quests'
import {
  MissionObjects, objectiveTarget, BOSS_DOOR_STANDOFF, type ObjectiveHost, type TargetSource, type TargetEnemy
} from '@/game/sim/objectives'
import {
  ObjectiveTrail, buildTrailPath, closeToTarget, createTrailPath, layoutTrail, layoutTurn, setTrailPath,
  TURN_AHEAD, TURN_N, TURN_R, TRAIL_END, TRAIL_GAP, TRAIL_HIDE_NEAR, TRAIL_MAX, TRAIL_SPACING, TRAIL_START, TRAIL_STRIDE,
  type TrailInput, type TrailPath
} from '@/game/fx/objectiveTrail'

// The real A*, counted: the trail may search at most every 0.35 s.
vi.mock('@/game/world/nav', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/game/world/nav')>()
  return { ...real, findPath: vi.fn(real.findPath) }
})

const TUTORIAL = { seed: 20260923, rooms: 7, boss: true }

/** Doors as `Mission.build` sets them up: shut (a slab and path block 1),
 *  the boss shutter locked (2). */
const shutDoors = (map: MapData): Nav => {
  const nav = createNav(map)
  for (const d of map.doors) {
    const fx = cellCenter(d.i) + (d.axis === 'x' ? d.dir * CELL / 2 : 0)
    const fz = cellCenter(d.j) + (d.axis === 'z' ? d.dir * CELL / 2 : 0)
    nav.slabs.push(d.axis === 'x'
      ? { minX: fx - 0.22, maxX: fx + 0.22, minZ: fz - CELL / 2, maxZ: fz + CELL / 2, active: true }
      : { minX: fx - CELL / 2, maxX: fx + CELL / 2, minZ: fz - 0.22, maxZ: fz + 0.22, active: true })
    nav.pathBlock[d.j * map.w + d.i] = d.boss ? 2 : 1
  }
  return nav
}

const frameOf = (d: MapData['doors'][number]): [number, number] => [
  cellCenter(d.i) + (d.axis === 'x' ? d.dir * CELL / 2 : 0),
  cellCenter(d.j) + (d.axis === 'z' ? d.dir * CELL / 2 : 0)
]

const bossDoor = (map: MapData) => map.doors.find(d => d.boss)!

const cellOf = (map: MapData, x: number, z: number): number => Math.floor(z / CELL) * map.w + Math.floor(x / CELL)

/** A plain objective source (what a `MissionObjects` exposes). */
const source = (template: TargetSource['objective']['template'], over: Partial<TargetSource> = {}): TargetSource => ({
  objective: { template, done: false },
  quest: { target: null },
  eliteId: -1,
  cores: [],
  chests: [],
  npc: null,
  ...over
})

const enemy = (id: number, kind: TargetEnemy['kind'], x: number, z: number, over: Partial<TargetEnemy> = {}): TargetEnemy =>
  ({ id, kind, state: 'idle', x, z, hold: false, ...over })

const JOB_MAP = generateMap({ seed: 777, rooms: 6, boss: false })

const pick = (src: TargetSource, enemies: TargetEnemy[], px = 0, pz = 0) => {
  const t = objectiveTarget(src, JOB_MAP, enemies, px, pz)
  return t ? [t.x, t.z] : null
}

// ─── Where it leads ──────────────────────────────────────────────────────────

describe('objective target', () => {
  it('tutorial / boss: the boss shutter, from the corridor side, until the fight starts', () => {
    const map = generateMap(TUTORIAL)
    const scene = new Scene()
    const noop = () => {}
    const host = {
      scene, map, nav: createNav(map), theme: THEMES.scrapyard, propParent: () => scene,
      fx: { sparks: noop, emit: noop, orbBurst: noop, flash: noop, riseRing: noop },
      shocks: { spawn: noop }, shake: noop, sfx: noop, explode: noop,
      onCrateBroken: noop, onChestOpened: noop, onCoreTaken: noop, onObjectiveDone: noop
    }
    const objs = new MissionObjects(host as unknown as ObjectiveHost, tutorialQuest())
    const d = bossDoor(map)
    const [fx, fz] = frameOf(d)

    const t = objs.target(map.start.x, map.start.z, [])!
    expect(t).not.toBeNull()
    // In the shutter's own cell (the corridor's last), a step in front of the panel.
    expect(cellOf(map, t.x, t.z)).toBe(d.j * map.w + d.i)
    expect(map.room[cellOf(map, t.x, t.z)]).toBe(-1)
    expect(Math.hypot(t.x - fx, t.z - fz)).toBeCloseTo(BOSS_DOOR_STANDOFF, 5)

    // Across the threshold the Core Master's fight is on: nothing to lead to.
    const room = map.rooms[d.to]!
    expect(objs.target(cellCenter(room.x0 + 3), cellCenter(room.z0 + 3), [])).toBeNull()

    objs.objective.done = true
    expect(objs.target(map.start.x, map.start.z, [])).toBeNull()
  })

  it('a boss mission whose map fit no boss room: the Core Master itself', () => {
    const boss = enemy(100000, 'brute', 30, 40)
    expect(pick(source('boss', { eliteId: 100000 }), [enemy(1, 'hardhat', 1, 1), boss])).toEqual([30, 40])
    boss.state = 'dead'
    expect(pick(source('boss', { eliteId: 100000 }), [boss])).toBeNull()
  })

  it('elite: the living elite, wherever it stands', () => {
    const src = source('elite', { eliteId: 7 })
    const elite = enemy(7, 'brute', 12, -4)
    expect(pick(src, [enemy(1, 'brute', 1, 1), elite])).toEqual([12, -4])
    elite.state = 'dead'
    expect(pick(src, [enemy(1, 'brute', 1, 1), elite])).toBeNull()
  })

  it('kill: the nearest living machine of the wanted kind', () => {
    const src = source('kill', { quest: { target: 'hardhat' } })
    const list = [
      enemy(1, 'trooper', 1, 0),
      enemy(2, 'hardhat', 2, 0, { state: 'dead' }),
      enemy(3, 'hardhat', 9, 0),
      enemy(4, 'hardhat', 0, 6)
    ]
    expect(pick(src, list)).toEqual([0, 6])
    expect(pick(source('kill', { quest: { target: 'turret' } }), list)).toBeNull()
  })

  it("purge: the nearest living machine; a lesson's sleeping drones only once nothing else is left", () => {
    const drone = enemy(9, 'heli', 1, 1, { hold: true })
    const list = [drone, enemy(1, 'roller', 10, 0), enemy(2, 'brute', 4, 0, { state: 'dead' })]
    expect(pick(source('purge'), list)).toEqual([10, 0])
    list[1]!.state = 'dead'
    expect(pick(source('purge'), list)).toEqual([1, 1])
    drone.state = 'dead'
    expect(pick(source('purge'), list)).toBeNull()
  })

  it('collect: the nearest data core not yet taken', () => {
    const cores = [{ x: 2, z: 0, taken: true }, { x: 8, z: 0, taken: false }, { x: 0, z: -5, taken: false }]
    expect(pick(source('collect', { cores }), [])).toEqual([0, -5])
    cores[2]!.taken = true
    expect(pick(source('collect', { cores }), [])).toEqual([8, 0])
    cores[1]!.taken = true
    expect(pick(source('collect', { cores }), [])).toBeNull()
  })

  it('supply: the nearest unopened SUPPLY chest (a bonus chest is not the job)', () => {
    const chests = [
      { x: 1, z: 0, supply: false, opened: false },
      { x: 6, z: 0, supply: true, opened: true },
      { x: 0, z: 9, supply: true, opened: false },
      { x: 12, z: 0, supply: true, opened: false }
    ]
    expect(pick(source('supply', { chests }), [])).toEqual([0, 9])
    chests[2]!.opened = true
    expect(pick(source('supply', { chests }), [])).toEqual([12, 0])
  })

  it('rescue: the worker-bot until it is rescued', () => {
    const npc = { x: 20, z: 21, rescued: false }
    expect(pick(source('rescue', { npc }), [])).toEqual([20, 21])
    npc.rescued = true
    expect(pick(source('rescue', { npc }), [])).toBeNull()
  })

  it('a finished objective leads nowhere, whatever the template', () => {
    const everything: Partial<TargetSource> = {
      eliteId: 1, quest: { target: 'brute' }, cores: [{ x: 3, z: 3, taken: false }],
      chests: [{ x: 4, z: 4, supply: true, opened: false }], npc: { x: 5, z: 5, rescued: false }
    }
    for (const tpl of ['boss', 'elite', 'kill', 'purge', 'collect', 'supply', 'rescue'] as const) {
      const src = source(tpl, everything)
      expect(pick(src, [enemy(1, 'brute', 2, 2)]), tpl).not.toBeNull()
      src.objective.done = true
      expect(pick(src, [enemy(1, 'brute', 2, 2)]), tpl).toBeNull()
    }
  })

  it('a near-tie does not flip the target as the player walks; a clearly nearer one takes over', () => {
    const cores = [{ x: 10, z: 0, taken: false }, { x: 0, z: 10.5, taken: false }]
    const src = source('collect', { cores })
    expect(pick(src, [], 0, 0)).toEqual([10, 0])
    // The other core is now ~7 % nearer: not enough to switch.
    expect(pick(src, [], -0.6, 0.6)).toEqual([10, 0])
    // ~40 % nearer: it takes over.
    expect(pick(src, [], -3, 3)).toEqual([0, 10.5])
  })
})

// ─── Layout ──────────────────────────────────────────────────────────────────

const straight = (len: number): TrailPath => {
  const p = createTrailPath()
  setTrailPath(p, 0, 0, [[0, len]])
  return p
}

const lay = (p: TrailPath, px: number, pz: number, max = TRAIL_MAX) => {
  const out = new Float32Array(TRAIL_MAX * TRAIL_STRIDE)
  const n = layoutTrail(p, px, pz, out, max)
  return Array.from({ length: n }, (_, i) => {
    const b = i * TRAIL_STRIDE
    return { x: out[b]!, z: out[b + 1]!, yaw: out[b + 2]!, fade: out[b + 3]!, toGo: out[b + 4]! }
  })
}

describe('trail layout', () => {
  it('chevrons 1.1 m apart from 1.5 m ahead to 8 m out, six at most, pointing along the path', () => {
    const cs = lay(straight(20), 0, 0)
    expect(cs.length).toBe(TRAIL_MAX)
    expect(TRAIL_MAX).toBeLessThanOrEqual(6)
    expect(cs[0]!.z).toBeGreaterThanOrEqual(TRAIL_START - 1e-6)
    expect(cs[cs.length - 1]!.z).toBeLessThanOrEqual(TRAIL_END + 1e-6)
    for (let i = 1; i < cs.length; i++) expect(cs[i]!.z - cs[i - 1]!.z).toBeCloseTo(TRAIL_SPACING, 4)
    for (const c of cs) {
      expect(c.x).toBeCloseTo(0, 6)
      // rotation.y = 0 turns local +Z (the chevron's tip) down the path.
      expect(c.yaw).toBeCloseTo(0, 6)
      expect(c.fade).toBeGreaterThanOrEqual(0)
      expect(c.fade).toBeLessThanOrEqual(1)
    }
    // Faded in at the near end, out toward the far end, full in between.
    expect(cs[0]!.fade).toBeLessThan(0.5)
    expect(cs[cs.length - 1]!.fade).toBeLessThan(0.7)
    expect(cs[2]!.fade).toBe(1)
    // A capped layout keeps the nearest.
    expect(lay(straight(20), 0, 0, 3).map(c => c.z)).toEqual(cs.slice(0, 3).map(c => c.z))
  })

  it('the chevrons stay put on the floor while the player walks (spaced back from the target)', () => {
    const p = straight(20)
    const a = lay(p, 0, 0)
    const b = lay(p, 0, 0.5)
    const c = lay(p, 0.4, 3.3) // walked on, a little off the line
    for (const later of [b, c]) {
      for (const ch of later) {
        const ahead = ch.z - (later === b ? 0.5 : 3.3)
        expect(ahead).toBeGreaterThanOrEqual(TRAIL_START - 1e-6)
        // Same 1.1 m grid, measured back from the target end.
        const k = (20 - TRAIL_GAP - ch.z) / TRAIL_SPACING
        expect(Math.abs(k - Math.round(k))).toBeLessThan(1e-4)
      }
    }
    // Every chevron still inside the window after half a metre is where it was.
    for (const ch of b) {
      if (ch.z <= a[a.length - 1]!.z) expect(a.some(o => Math.abs(o.z - ch.z) < 1e-4)).toBe(true)
    }
  })

  it('never past the target: the last one stops short of it, and a close target gets fewer', () => {
    const cs = lay(straight(5), 0, 0)
    expect(cs.map(c => +c.z.toFixed(4))).toEqual([2, 3.1, 4.2])
    expect(5 - cs[cs.length - 1]!.z).toBeCloseTo(TRAIL_GAP, 4)
    expect(cs[cs.length - 1]!.toGo).toBeCloseTo(TRAIL_GAP, 4)
    // Target closer than the first slot + the gap: nothing to lay.
    expect(lay(straight(TRAIL_START + TRAIL_GAP - 0.05), 0, 0)).toEqual([])
  })

  it('follows a corner, turning the chevrons through it', () => {
    const p = createTrailPath()
    setTrailPath(p, 0, 0, [[0, 4], [6, 4]])
    expect(p.len).toBeCloseTo(10, 6)
    const cs = lay(p, 0, 0)
    expect(cs.length).toBeGreaterThanOrEqual(5)
    for (const c of cs) {
      // On the polyline: the first leg (x = 0) or the second (z = 4).
      expect(Math.min(Math.abs(c.x), Math.abs(c.z - 4))).toBeLessThan(1e-4)
    }
    const first = cs.find(c => c.z < 3)!
    const lastLeg = cs.find(c => c.x > 1)!
    expect(first.yaw).toBeCloseTo(0, 4)
    expect(lastLeg.yaw).toBeCloseTo(Math.PI / 2, 4)
    // Near the corner the heading is part-way round, not snapped.
    const turning = cs.find(c => c.yaw > 0.02 && c.yaw < Math.PI / 2 - 0.02)
    expect(turning).toBeDefined()
  })
})

// ─── The walk ────────────────────────────────────────────────────────────────

/** Walk the path in 0.25 m steps and report the cells it crosses. */
const cellsAlong = (map: MapData, p: TrailPath): number[] => {
  const cells: number[] = []
  for (let i = 1; i < p.n; i++) {
    const ax = p.x[i - 1]!
    const az = p.z[i - 1]!
    const l = p.s[i]! - p.s[i - 1]!
    for (let s = 0; s < l; s += 0.25) {
      const t = s / l
      cells.push(cellOf(map, ax + (p.x[i]! - ax) * t, az + (p.z[i]! - az) * t))
    }
  }
  cells.push(cellOf(map, p.x[p.n - 1]!, p.z[p.n - 1]!))
  return cells
}

const bossTarget = (map: MapData): [number, number] => {
  const t = objectiveTarget(source('boss'), map, [], map.start.x, map.start.z)!
  return [t.x, t.z]
}

describe('trail path', () => {
  it('walks through shut doors and ends at the locked boss shutter', () => {
    const map = generateMap(TUTORIAL)
    const nav = shutDoors(map)
    const [tx, tz] = bossTarget(map)
    const p = createTrailPath()
    expect(buildTrailPath(nav, map.start.x, map.start.z, tx, tz, p)).toBe(true)
    expect(p.x[p.n - 1]).toBeCloseTo(tx, 4)
    expect(p.z[p.n - 1]).toBeCloseTo(tz, 4)
    const cells = cellsAlong(map, p)
    // Never over the void, and through at least one shut (openable) door.
    for (const k of cells) expect(map.cell[k]).not.toBe(Cell.Void)
    expect(cells.some(k => nav.pathBlock[k] === 1)).toBe(true)
    // Its last cell is the shutter's; it never crosses into the boss room.
    const bd = bossDoor(map)
    expect(cells[cells.length - 1]).toBe(bd.j * map.w + bd.i)
    expect(cells.some(k => map.room[k] === bd.to)).toBe(false)
  })

  it('never leads THROUGH the locked shutter', () => {
    const map = generateMap(TUTORIAL)
    const nav = shutDoors(map)
    const room = map.rooms[bossDoor(map).to]!
    const p = createTrailPath()
    expect(buildTrailPath(nav, map.start.x, map.start.z, cellCenter(room.x0 + 3), cellCenter(room.z0 + 3), p)).toBe(false)
    expect(p.n).toBe(0)
  })

  it('on every boss map, the start pad has a walk to the boss shutter', () => {
    const p = createTrailPath()
    for (let k = 0; k < 60; k++) {
      const map = generateMap({ seed: (k * 2654435761 + 11) >>> 0, rooms: 9, boss: true })
      if (!map.doors.some(d => d.boss)) continue
      const [tx, tz] = bossTarget(map)
      expect(buildTrailPath(shutDoors(map), map.start.x, map.start.z, tx, tz, p), `seed #${k}`).toBe(true)
      expect(Math.hypot(p.x[p.n - 1]! - tx, p.z[p.n - 1]! - tz), `seed #${k}`).toBeLessThan(1e-3)
    }
  })
})

// ─── Hide rules and the trail itself ─────────────────────────────────────────

describe('trail visibility', () => {
  const map = generateMap(TUTORIAL)
  const door = map.doors.find(d => !d.boss)!
  const [fx, fz] = frameOf(door)
  // Unit step through the door, from the parent's side into the child's.
  const ux = door.axis === 'x' ? door.dir : 0
  const uz = door.axis === 'z' ? door.dir : 0

  it('hides once the target is within ~4 m AND in plain sight', () => {
    const nav = shutDoors(map)
    const sx = map.start.x
    const sz = map.start.z
    // Across the start room: 3 m in the open hides, 5 m does not.
    expect(closeToTarget(nav, sx, sz, sx + 3, sz)).toBe(true)
    expect(closeToTarget(nav, sx, sz, sx + TRAIL_HIDE_NEAR + 1, sz)).toBe(false)
    // Hysteresis: once hidden it takes a little more distance to come back.
    expect(closeToTarget(nav, sx, sz, sx + TRAIL_HIDE_NEAR + 0.4, sz, false)).toBe(false)
    expect(closeToTarget(nav, sx, sz, sx + TRAIL_HIDE_NEAR + 0.4, sz, true)).toBe(true)
    // 3 m away but behind a shut door: still worth pointing at.
    const ax = fx - ux * 1.5
    const az = fz - uz * 1.5
    const bx = fx + ux * 1.5
    const bz = fz + uz * 1.5
    expect(closeToTarget(nav, ax, az, bx, bz)).toBe(false)
    nav.slabs.forEach(s => { s.active = false })
    expect(closeToTarget(nav, ax, az, bx, bz)).toBe(true)
  })

  const run = (trail: ObjectiveTrail, seconds: number, input: TrailInput) => {
    const dt = 1 / 60
    for (let t = 0; t < seconds - 1e-9; t += dt) {
      input.time += dt
      trail.update(dt, input)
    }
  }

  const alphas = (trail: ObjectiveTrail): number[] => {
    const a = trail.mesh.geometry.getAttribute('aAlpha').array as Float32Array
    return Array.from(a.slice(0, trail.mesh.count))
  }

  let scene: Scene
  let nav: Nav
  let target: { x: number; z: number }
  beforeEach(() => {
    scene = new Scene()
    nav = shutDoors(map)
    const [tx, tz] = bossTarget(map)
    target = { x: tx, z: tz }
    vi.mocked(findPath).mockClear()
  })

  it('fades in over ~0.4 s at the scene root, bold and on the floor', () => {
    const trail = new ObjectiveTrail(scene, nav)
    expect(trail.mesh.parent).toBe(scene)
    const input = { enabled: true, px: map.start.x, pz: map.start.z, target, time: 0 }
    run(trail, 0.1, input)
    expect(trail.mesh.visible).toBe(true)
    const early = Math.max(...alphas(trail))
    // A quarter of the way into the 0.4 s fade: a quarter of the peak at most.
    expect(early).toBeGreaterThan(0)
    expect(early).toBeLessThanOrEqual(0.25 * 1 + 1e-3)
    run(trail, 0.5, input)
    const n = trail.mesh.count
    expect(n).toBeGreaterThanOrEqual(3)
    expect(n).toBeLessThanOrEqual(TRAIL_MAX)
    const full = alphas(trail)
    expect(Math.max(...full)).toBeGreaterThan(early)
    for (const a of full) expect(a).toBeLessThanOrEqual(1 + 1e-6)
    // Bold, not a whisper: playtesters (2026-10-07) never saw the old 0.17–0.45.
    expect(Math.max(...full)).toBeGreaterThanOrEqual(0.6)
    const m = new Matrix4()
    const pos = new Vector3()
    for (let i = 0; i < n; i++) {
      trail.mesh.getMatrixAt(i, m)
      pos.setFromMatrixPosition(m)
      expect(pos.y).toBeGreaterThanOrEqual(0.03)
      expect(pos.y).toBeLessThanOrEqual(0.05)
      const d = Math.hypot(pos.x - map.start.x, pos.z - map.start.z)
      expect(d).toBeGreaterThan(TRAIL_START - 0.3)
      expect(d).toBeLessThan(TRAIL_END + 0.3)
    }
    trail.dispose()
    expect(scene.children).not.toContain(trail.mesh)
  })

  it('the goal behind: a small U-turn of chevrons on the floor AHEAD, toward it (#131)', () => {
    const trail = new ObjectiveTrail(scene, nav)
    const input: TrailInput = { enabled: true, px: map.start.x, pz: map.start.z, target, time: 0, yaw: 0 }
    run(trail, 0.6, input)
    // Which way the walk sets off: the mean direction of the laid chevrons.
    const m = new Matrix4()
    const pos = new Vector3()
    let wx = 0
    let wz = 0
    for (let i = 0; i < trail.mesh.count; i++) {
      trail.mesh.getMatrixAt(i, m)
      pos.setFromMatrixPosition(m)
      wx += pos.x - map.start.x
      wz += pos.z - map.start.z
    }
    // Facing the walk (forward = (−sin, −cos)): only the trail.
    const toward = Math.atan2(-wx, -wz)
    input.yaw = toward
    run(trail, 1, input)
    const base = trail.mesh.count
    expect(base).toBeGreaterThan(0)
    expect(base).toBeLessThanOrEqual(TRAIL_MAX)
    expect(trail.turnMesh.count).toBe(0)
    // Turned round: the turn-around joins it, in front of the view, drawn
    // over whatever stands on the floor there.
    input.yaw = toward + Math.PI
    run(trail, 1, input)
    expect(trail.mesh.count).toBe(base)
    expect(trail.turnMesh.count).toBe(TURN_N)
    expect(trail.turnMesh.visible).toBe(true)
    expect((trail.turnMesh.material as { depthTest: boolean }).depthTest).toBe(false)
    const fx = -Math.sin(input.yaw)
    const fz = -Math.cos(input.yaw)
    for (let i = 0; i < TURN_N; i++) {
      trail.turnMesh.getMatrixAt(i, m)
      pos.setFromMatrixPosition(m)
      const ahead = (pos.x - map.start.x) * fx + (pos.z - map.start.z) * fz
      expect(ahead).toBeGreaterThan(2.2 - 0.01)
      expect(ahead).toBeLessThan(TURN_AHEAD + TURN_R + 0.01)
    }
    // Facing it again: gone.
    input.yaw = toward
    run(trail, 1, input)
    expect(trail.turnMesh.count).toBe(0)
    expect(trail.mesh.count).toBe(base)
    trail.dispose()
  })

  it('hides when the mission says no, when there is no target, and next to the target', () => {
    // 3 m back down the boss corridor from the trail's end: close and in plain sight.
    const bd = bossDoor(map)
    const backX = bd.axis === 'x' ? -bd.dir * 3 : 0
    const backZ = bd.axis === 'z' ? -bd.dir * 3 : 0
    const hides: Array<(i: TrailInput) => void> = [
      i => { i.enabled = false },
      i => { i.target = null },
      i => {
        i.px = target.x + backX
        i.pz = target.z + backZ
      }
    ]
    for (const hide of hides) {
      const trail = new ObjectiveTrail(scene, nav)
      const input: TrailInput = { enabled: true, px: map.start.x, pz: map.start.z, target, time: 0 }
      run(trail, 0.6, input)
      expect(trail.mesh.visible).toBe(true)
      hide(input)
      run(trail, 0.2, input)
      // Fading, not popped: half-way down after half the 0.4 s.
      expect(trail.mesh.visible).toBe(true)
      expect(Math.max(...alphas(trail))).toBeLessThanOrEqual(0.5 * 1 + 1e-3)
      run(trail, 0.3, input)
      expect(trail.mesh.visible).toBe(false)
      trail.dispose()
    }
  })

  it('searches at most every 0.35 s, and not at all while nothing moves', () => {
    const trail = new ObjectiveTrail(scene, nav)
    const input = { enabled: true, px: map.start.x, pz: map.start.z, target, time: 0 }
    run(trail, 1.5, input)
    // One search for the first path, none while the player stands still.
    expect(vi.mocked(findPath).mock.calls.length).toBe(1)
    // Now a player dashing 3 m/s around the start room for 1.4 s.
    vi.mocked(findPath).mockClear()
    const dt = 1 / 60
    for (let t = 0; t < 1.4; t += dt) {
      input.px = map.start.x + Math.sin(t * 2) * 3
      input.pz = map.start.z + Math.cos(t * 2) * 3
      input.time += dt
      trail.update(dt, input)
    }
    const calls = vi.mocked(findPath).mock.calls.length
    expect(calls).toBeGreaterThanOrEqual(2)
    expect(calls).toBeLessThanOrEqual(Math.ceil(1.4 / 0.35) + 1)
    trail.dispose()
  })
})

describe('the turn-around (#131)', () => {
  it("curves from straight ahead to the walk's way, on the side the walk leaves from", () => {
    const out = new Float32Array(TURN_N * TRAIL_STRIDE)
    // Facing −z (yaw 0); the walk sets off to the right and back (yaw −2.5).
    expect(layoutTurn(0, 0, 0, -2.5, out)).toBe(TURN_N)
    let prev = Infinity
    for (let k = 0; k < TURN_N; k++) {
      const o = k * TRAIL_STRIDE
      // Ahead of the view, all of it.
      expect(out[o + 1]!).toBeLessThan(-TURN_AHEAD + 0.01)
      // On the right (+x) side.
      expect(out[o]!).toBeGreaterThan(-1e-6)
      // Each chevron turned further than the last: rotation.y falls toward the walk.
      const r = out[o + 2]!
      expect(r).toBeLessThan(prev)
      prev = r
    }
    // The last one points back toward the player's side (+z travel).
    expect(Math.cos(out[(TURN_N - 1) * TRAIL_STRIDE + 2]!)).toBeGreaterThan(0)
  })
})
