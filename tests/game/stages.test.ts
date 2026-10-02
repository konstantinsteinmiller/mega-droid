// @vitest-environment jsdom
// The platform stages' foundation (`world/stages/`, `sim/stageFeatures.ts`,
// the terrain extensions): what the four hand-built levels will stand on.
//
// A stage is designed around the verbs, so the verbs are pinned here with
// numbers: the dash leap crosses a one-cell gap and never a two-cell one.
// The rest is plumbing a level worker must be able to trust: story quests
// route to their stage, the builder's new lists survive the mirror, links
// carry the objective trail over what the floors cannot tell it, chests sit
// on the ledges and answer only from their own floor, a secret stays shut
// until it is opened, lava costs twice a plain fall (spikes: the plain one), and a
// feature's friction, push and carry reach the body.

import { describe, expect, it, vi } from 'vitest'

vi.mock('@/use/useAds', () => ({ showMidgameAd: async () => {} }))
vi.mock('@/use/useAdGate', () => ({ canShowInterstitial: () => false, markInterstitialShown: () => {} }))
vi.mock('@/use/useCrazyGames', () => ({ triggerHappytime: () => {} }))
vi.mock('@/game/engine/app', () => ({ app: { setMode: () => {}, setWanted: () => {} } }))
// The chest's lock lamp and the blob shadows draw canvas textures (no 2D
// canvas under jsdom); a plain mesh stands in for the shadow.
vi.mock('@/game/fx/markers', async () => {
  const { Mesh } = await import('three')
  return { makeBlobShadow: () => new Mesh() }
})

import { Group, Scene } from 'three'
import { CELL, cellCenter, pitKindOf, type MapData } from '@/game/world/levelGen'
import { createNav, findPath, groundAt, moveBody, type Nav } from '@/game/world/nav'
import { generateClimb } from '@/game/world/climbGen'
import { Builder, finish, mirrorX, secretDoorFace, YAW_PX } from '@/game/world/stages/builder'
import { generateStage, STAGE_LENGTH } from '@/game/world/stages'
import { generateMeltdown } from '@/game/world/stages/blaze'
import { generateGlacier } from '@/game/world/stages/cryo'
import { generateRailRush } from '@/game/world/stages/volt'
import { generateSkyDocks } from '@/game/world/stages/gale'
import { THEMES } from '@/game/world/themes'
import { storyQuest, climbJob } from '@/game/data/quests'
import { SECTOR_BY_ID } from '@/game/data/regions'
import { ClimbRun, PIT_COST, walkBlend, type ClimbBody, type ClimbHost } from '@/game/sim/climb'
import { AtlasCue, cueFeature, type StageFeature } from '@/game/sim/stageFeatures'
import { SecretsFeature } from '@/game/sim/secrets'
import { MissionObjects, CHEST_DY, type ObjectiveHost } from '@/game/sim/objectives'
import { setupFromQuest } from '@/game/sim/mission'
import { AtlasDirector, type AtlasLine } from '@/game/sim/atlas'
import { ACCEL, PLAYER_R, WALK_SPEED } from '@/game/sim/constants'

const SEEDS = Array.from({ length: 24 }, (_, i) => (i * 2654435761 + 1013904223) >>> 0)
const DT = 1 / 60

// ─── Fixtures ────────────────────────────────────────────────────────────────

/** One flat room 12 × 3 cells at y = 0 with a pit `gap` cells wide across
 *  it at i = 4.., its pits holding `pit`. */
const gapMap = (gap: number, pit: 'void' | 'spikes' | 'lava' = 'void'): MapData => {
  const b = new Builder(12, 3)
  b.addRoom(0, 0, 12, 3, 'start', 'hall', 0)
  b.pits(4, 0, 3 + gap, 2)
  if (pit !== 'void') b.pitKind(0, pit)
  return finish(b, { x: cellCenter(1), z: cellCenter(1), yaw: YAW_PX }, 1)
}

const body = (x: number, z: number, y = 0): ClimbBody => ({
  x, z, y, vx: 0, vz: 0, vy: 0, yaw: YAW_PX, ground: true, ladder: -1, plat: -1, air: 0, safeY: y, mantle: 0, mx: 0, mz: 0, path: null
})

/** A ClimbHost with nothing behind it but the map. */
const hostFor = (map: MapData, said: AtlasLine[] = []): ClimbHost & { nav: Nav } => {
  const scene = new Scene()
  const noop = () => {}
  return {
    nav: createNav(map), map, theme: THEMES.scrapyard,
    combat: { maxHp: 100 } as ClimbHost['combat'],
    fx: { sparks: noop, riseRing: noop, emit: noop } as unknown as ClimbHost['fx'],
    markers: { spawn: noop } as unknown as ClimbHost['markers'],
    shocks: { spawn: noop } as unknown as ClimbHost['shocks'],
    hitPlayer: () => 'hit', sfx: noop, shake: noop, onPickup: noop, propParent: () => scene,
    scene, time: 0, level: { root: new Group(), rooms: [], sky: null as never, bounds: [], owner: new Int16Array(0) },
    enemyLevel: 1, encounters: SECTOR_BY_ID.scrapyard.encounters, addEnemy: noop,
    say: (l) => { said.push(l) }
  }
}

/**
 * Run the mission's walk and slide rules (`Mission.updatePlayer`) on a
 * ClimbRun: a slide toward +X from `x0`, the stick then held ahead (or let
 * go), until Flux lands past the gap or falls into it.
 */
const slideAt = (gap: number, x0: number, stick: boolean): 'across' | 'fell' => {
  const map = gapMap(gap)
  const run = new ClimbRun(hostFor(map), 1)
  const p = body(x0, cellCenter(1))
  const far = (4 + gap) * CELL
  let slideT = 0.28
  const out: [number, number] = [0, 0]
  for (let n = 0; n < 240; n++) {
    const air = !p.ground && p.ladder < 0 && p.mantle <= 0
    let tx = 0
    let tz = 0
    if (slideT > 0) {
      slideT -= DT
      tx = 15
    } else if (stick) {
      tx = WALK_SPEED
    } else if (air) {
      tx = p.vx
      tz = p.vz
    }
    const k = walkBlend(DT, slideT > 0, air, run.moveMod(p).friction)
    p.vx += (tx - p.vx) * k
    p.vz += (tz - p.vz) * k
    run.stepBody(p, out, stick ? 1 : 0, 0, DT, slideT > 0)
    if (run.leapt) slideT = 0
    p.x = out[0]
    p.z = out[1]
    if (run.pitted) return 'fell'
    if (p.ground && p.x > far && Math.abs(p.y) < 1e-6) return 'across'
    // Stopped short of the edge: never took off.
    if (p.ground && slideT <= 0 && !stick && Math.hypot(p.vx, p.vz) < 0.05) return 'fell'
  }
  return 'fell'
}

// ─── Story routing ───────────────────────────────────────────────────────────

describe('the story routes four sectors to their platform stage', () => {
  it('storyQuest: a stage for Blaze, Cryo, Volt and Gale, the labyrinth for the Scrapyard replay', () => {
    for (const id of ['blaze', 'cryo', 'volt', 'gale'] as const) {
      const q = storyQuest(SECTOR_BY_ID[id], 10, 0)
      expect(q.template).toBe('stage')
      expect(q.kind).toBe('story')
      expect(q.rooms).toBe(STAGE_LENGTH[id] + 1)
      expect(q.reward.guaranteed).toBe('prototype')
      const setup = setupFromQuest(q, null)
      expect(setup.climb).toBe(true)
      expect(setup.stage).toBe(id)
      expect(setup.boss).toBe(false)
    }
    // The Fortress is a stage too now (its labyrinth was the old finale).
    const f = storyQuest(SECTOR_BY_ID.fortress, 10, 0)
    expect(f.template).toBe('stage')
    expect(setupFromQuest(f, null).stage).toBe('fortress')
    // The Scrapyard's replay is still the labyrinth.
    const s = storyQuest(SECTOR_BY_ID.scrapyard, 3, 0)
    expect(s.template).toBe('boss')
    expect(setupFromQuest(s, null).stage).toBeUndefined()
    // A climb job is not a stage.
    expect(setupFromQuest(climbJob(5, ['blaze'], 8), null).stage).toBeUndefined()
  })

  it('each story level is about a tenth longer than the one before', () => {
    const n = [STAGE_LENGTH.blaze, STAGE_LENGTH.cryo, STAGE_LENGTH.volt, STAGE_LENGTH.gale]
    for (let i = 1; i < n.length; i++) expect(n[i]).toBeGreaterThanOrEqual(n[i - 1]!)
    expect(n[3]! / n[0]!).toBeGreaterThan(1.2)
    expect(n[3]! / n[0]!).toBeLessThan(1.45)
  })

  it('generateStage dispatches to the sector\'s generator (the Tower Run for a sector without one)', () => {
    for (const seed of [0, 7, 4242]) {
      expect(generateStage('blaze', seed)).toEqual(generateMeltdown(seed))
      expect(generateStage('cryo', seed)).toEqual(generateGlacier(seed))
      expect(generateStage('volt', seed)).toEqual(generateRailRush(seed))
      expect(generateStage('gale', seed)).toEqual(generateSkyDocks(seed))
      expect(generateStage('scrapyard', seed)).toEqual(generateClimb(seed))
      for (const s of ['blaze', 'cryo', 'volt', 'gale'] as const) {
        const m = generateStage(s, seed)
        expect(m.terrain).toBeDefined()
        expect(m.rooms.filter(r => r.role === 'boss')).toHaveLength(1)
      }
    }
  })
})

// ─── The dash leap ───────────────────────────────────────────────────────────

describe('the dash leap', () => {
  it('a slide started up to a metre from the edge crosses a one-cell gap, stick held or not', () => {
    for (const off of [0.2, 0.5, 0.8, 1.0]) {
      for (const stick of [true, false]) expect(slideAt(1, 4 * CELL - off, stick), `${off} m, stick ${stick}`).toBe('across')
    }
  })

  it('never crosses a two-cell gap', () => {
    for (const off of [0.1, 0.3, 0.5, 1.0, 2.0, 3.5]) {
      for (const stick of [true, false]) expect(slideAt(2, 4 * CELL - off, stick), `${off} m, stick ${stick}`).toBe('fell')
    }
  })

  // The edge-leap: there is no jump button, an edge IS the jump — walked
  // into a gap with a floor in reach, Flux leaps for it; into one too wide,
  // there is nothing to reach and he falls.
  const walkOff = (gap: number) => {
    const run = new ClimbRun(hostFor(gapMap(gap)), 1)
    const p = body(4 * CELL - 0.3, cellCenter(1))
    const out: [number, number] = [0, 0]
    let edge = false
    for (let n = 0; n < 200 && !run.pitted; n++) {
      // The walk pushes on the ground; a leap flies on its own speed.
      if (p.ground) p.vx = WALK_SPEED
      run.stepBody(p, out, 1, 0, DT, false)
      edge ||= run.edgeLeapt
      p.x = out[0]
      p.z = out[1]
    }
    return { edge, pitted: run.pitted, x: p.x }
  }

  it('a walk into a one-cell gap leaps it (the edge-leap)', () => {
    const r = walkOff(1)
    expect(r.edge).toBe(true)
    expect(r.pitted).toBe(false)
    expect(r.x).toBeGreaterThan(5 * CELL)
  })

  it('a walk into a gap too wide to reach falls', () => {
    const r = walkOff(2)
    expect(r.edge).toBe(false)
    expect(r.pitted).toBe(true)
  })

  it('air control is a quarter of the ground\'s; a slide sets the speed at once; friction scales the blend', () => {
    expect(walkBlend(DT, true, false)).toBe(1)
    expect(walkBlend(DT, false, false)).toBeCloseTo(DT * ACCEL)
    expect(walkBlend(DT, false, true)).toBeCloseTo(DT * ACCEL * 0.25)
    expect(walkBlend(DT, false, false, 0.2)).toBeCloseTo(DT * ACCEL * 0.2)
  })
})

// ─── Pits ────────────────────────────────────────────────────────────────────

describe('pit kinds', () => {
  const fall = (pit: 'void' | 'spikes' | 'lava'): number => {
    const run = new ClimbRun(hostFor(gapMap(2, pit)), 1)
    const p = body(4 * CELL - 0.3, cellCenter(1))
    const out: [number, number] = [0, 0]
    for (let n = 0; n < 300 && !run.pitted; n++) {
      p.vx = WALK_SPEED
      run.stepBody(p, out, 1, 0, DT, false)
      p.x = out[0]
      p.z = out[1]
    }
    expect(run.pitted).toBe(true)
    return run.pitCost
  }

  it('lava costs twice a plain fall; spikes are the plain fall made visible', () => {
    expect(fall('void')).toBe(PIT_COST)
    expect(fall('spikes')).toBe(PIT_COST)
    expect(fall('lava')).toBe(PIT_COST * 2)
  })

  it('the terrain lists them per room, and a map without any has none', () => {
    expect(gapMap(1, 'lava').terrain!.pitKind).toEqual(['lava'])
    expect(gapMap(1).terrain!.pitKind).toBeUndefined()
  })

  // Playtest: "I fell through the ground instead of hitting spikes and getting
  // rescued", in three stages. Each of these was a way to fall for ever.
  it('a room with no kind of its own holds spikes, even beside a lava room (it was written out as a bottomless void)', () => {
    const b = new Builder(12, 7)
    b.addRoom(0, 0, 12, 3, 'start', 'hall', 0)
    b.addRoom(0, 4, 12, 3, 'combat', 'hall', 0)
    b.pits(4, 0, 5, 2)
    b.pits(4, 4, 5, 6)
    b.pitKind(1, 'lava')
    const t = finish(b, { x: cellCenter(1), z: cellCenter(1), yaw: YAW_PX }, 1).terrain!
    expect(pitKindOf(t, 0)).toBe('spikes')
    expect(pitKindOf(t, 1)).toBe('lava')
    // Only a map open to the sky keeps a bottomless pit.
    expect(pitKindOf({ ...t, clouds: true }, 0)).toBe('void')
  })

  it('the pit\'s floor is solid: Flux lands ON the spikes, never under them', () => {
    const map = gapMap(2, 'spikes')
    const run = new ClimbRun(hostFor(map), 1)
    const bed = run.pitFloor(cellCenter(4), cellCenter(1))
    expect(bed).toBeLessThan(-2)
    const p = body(4 * CELL - 0.3, cellCenter(1))
    const out: [number, number] = [0, 0]
    for (let n = 0; n < 400 && !run.pitted; n++) {
      p.vx = WALK_SPEED
      run.stepBody(p, out, 1, 0, DT, false)
      p.x = out[0]
      p.z = out[1]
    }
    expect(run.pitted).toBe(true)
    expect(p.y).toBe(bed)
  })

  it('the gap a crumbled slab left is a pit (the slab waits far below the level, and is no floor)', () => {
    for (const pit of ['spikes', 'void'] as const) {
      const map = gapMap(3, pit)
      if (pit === 'void') map.terrain!.clouds = true
      const host = hostFor(map)
      const run = new ClimbRun(host, 1)
      // As `CrumbleFeature` leaves a slab that fell: still in the nav, 10 km down.
      host.nav.plats = [{ x0: 4 * CELL, z0: 0, x1: 7 * CELL, z1: 3 * CELL, top: -1e4, dx: 0, dz: 0 }]
      const p = body(4 * CELL - 0.3, cellCenter(1))
      const out: [number, number] = [0, 0]
      let steps = 0
      for (; steps < 600 && !run.pitted; steps++) {
        if (p.ground) p.vx = WALK_SPEED
        run.stepBody(p, out, 1, 0, DT, false)
        p.x = out[0]
        p.z = out[1]
      }
      expect(run.pitted, pit).toBe(true)
      // Seconds, not for ever; and on the spikes where the pit has them.
      expect(steps, pit).toBeLessThan(240)
      if (pit === 'spikes') expect(p.y).toBe(run.pitFloor(p.x, p.z))
      else expect(p.y).toBeGreaterThan(-12)
    }
  })
})

// ─── Links ───────────────────────────────────────────────────────────────────

describe('links carry the objective trail where the floors cannot', () => {
  const linked = (link: boolean): MapData => {
    const b = new Builder(12, 3)
    b.addRoom(0, 0, 12, 3, 'start', 'hall', 0)
    b.pits(4, 0, 4, 2)
    if (link) b.link([3, 1], [5, 1], 'leap')
    return finish(b, { x: cellCenter(1), z: cellCenter(1), yaw: YAW_PX }, 1)
  }

  it('findPath (with links) crosses a leap gap only by its link, one way', () => {
    const goal: [number, number] = [cellCenter(10), cellCenter(1)]
    const from: [number, number] = [cellCenter(1), cellCenter(1)]
    expect(findPath(createNav(linked(false)), ...from, ...goal, 1400, 0, true)).toBeNull()
    const nav = createNav(linked(true))
    const path = findPath(nav, ...from, ...goal, 1400, 0, true)
    expect(path).not.toBeNull()
    expect(path!.some(([x, z]) => Math.floor(x / CELL) === 5 && Math.floor(z / CELL) === 1)).toBe(true)
    // One way: no path back over it, and the tap-to-move never takes it.
    expect(findPath(nav, ...goal, ...from, 1400, 0, true)).toBeNull()
    expect(findPath(nav, ...from, ...goal, 1400, 0, false)).toBeNull()
  })

  it('survive the mirror', () => {
    const m = mirrorX(linked(true))
    expect(m.terrain!.links).toEqual([{ from: [8, 1], to: [6, 1], kind: 'leap' }])
    const path = findPath(createNav(m), cellCenter(10), cellCenter(1), cellCenter(1), cellCenter(1), 1400, 0, true)
    expect(path).not.toBeNull()
  })
})

// ─── Chests ──────────────────────────────────────────────────────────────────

describe('chests on the climb', () => {
  const objects = (map: MapData) => {
    const scene = new Scene()
    const noop = () => {}
    const host = {
      scene, map, nav: createNav(map), theme: THEMES.scrapyard, propParent: () => scene,
      fx: { sparks: noop, emit: noop, orbBurst: noop, flash: noop, riseRing: noop },
      shocks: { spawn: noop }, shake: noop, sfx: noop, explode: noop,
      onCrateBroken: noop, onChestOpened: noop, onCoreTaken: noop, onObjectiveDone: noop
    }
    return { objs: new MissionObjects(host as unknown as ObjectiveHost, climbJob(3, ['blaze'], 6)), nav: host.nav }
  }

  it('two chests on ledges off the route, reachable, on their cell\'s floor', () => {
    for (const seed of SEEDS) {
      const m = generateClimb(seed)
      const t = m.terrain!
      expect(t.chests).toHaveLength(2)
      const nav = createNav(m)
      const doorCells = new Set(m.doors.map(d => d.j * m.w + d.i))
      const ladderCells = new Set(t.ladders.flatMap(L => [L.j * m.w + L.i, (L.j + L.dj) * m.w + L.i + L.di]))
      for (const c of t.chests!) {
        const k = Math.floor(c.z / CELL) * m.w + Math.floor(c.x / CELL)
        expect(c.y).toBeGreaterThan(0)
        expect(groundAt(m, c.x, c.z)).toBe(c.y)
        expect(t.pit[k]).toBe(0)
        expect(doorCells.has(k)).toBe(false)
        expect(ladderCells.has(k)).toBe(false)
        expect(findPath(nav, m.start.x, m.start.z, c.x, c.z, 4000, 0, true), `seed ${seed}`).not.toBeNull()
      }
    }
  })

  it('the mission places them at their ledge\'s height, and one opens only from its own floor', () => {
    const m = generateClimb(SEEDS[3]!)
    const { objs } = objects(m)
    expect(objs.chests).toHaveLength(2)
    for (const c of objs.chests) {
      const spot = m.terrain!.chests!.find(s => Math.hypot(s.x - c.x, s.z - c.z) < 1)!
      expect(c.y).toBe(spot.y)
      expect(c.mesh.root.position.y).toBe(spot.y)
      // In front of it, on its floor: in reach.
      const fx = c.x + Math.sin(c.yaw) * 1.5
      const fz = c.z + Math.cos(c.yaw) * 1.5
      expect(objs.nearestInteractable(fx, fz, 0, c.y)?.ref).toBe(c)
      // The same spot a storey below (or above): not.
      expect(objs.nearestInteractable(fx, fz, 0, c.y - 3)).toBeNull()
      expect(objs.nearestInteractable(fx, fz, 0, c.y + CHEST_DY + 0.01)).toBeNull()
      expect(objs.nearestInteractable(fx, fz, 0, c.y + CHEST_DY - 0.1)?.ref).toBe(c)
    }
  })
})

// ─── Secrets ─────────────────────────────────────────────────────────────────

describe('a secret alcove', () => {
  /** A room of 6 × 4 cells, and a 2 × 2 alcove carved east of it whose
   *  false wall faces cell (5, 1). */
  const secretMap = () => {
    const b = new Builder(10, 5)
    b.addRoom(0, 0, 6, 4, 'start', 'hall', 3)
    const s = b.secret(0, 'lights', [6, 1, 7, 2], { i: 6, j: 1, axis: 'x' }, [[0, 0, 'n'], [1, 0, 'n', 2], [2, 0, 'n']], [1, 0, 1], 'tank')
    return { map: finish(b, { x: cellCenter(1), z: cellCenter(2), yaw: YAW_PX }, 1), s }
  }

  it('the builder carves it at the room\'s floor and places buttons, panel and prize from the cells', () => {
    const { map, s } = secretMap()
    expect(map.terrain!.secrets).toEqual([s])
    expect(s.cells.sort((a, b) => a - b)).toEqual([16, 17, 26, 27])
    for (const k of s.cells) {
      expect(map.room[k]).toBe(0)
      expect(map.terrain!.floor[k]).toBe(3)
    }
    // Buttons on the north walls, facing into the room (+Z), at button height.
    expect(s.buttons.map(b => [b.x, b.nx, b.nz, b.color])).toEqual([[1.5, 0, 1, 0], [4.5, 0, 1, 2], [7.5, 0, 1, 2]])
    for (const b of s.buttons) expect(b.z).toBeCloseTo(0.06)
    expect(s.buttons.every(b => b.y === 3 + 1.6)).toBe(true)
    // The panel on the wall beside the false wall (x = 18), facing −X.
    expect(s.panel.nx).toBe(-1)
    expect(s.panel.x).toBeCloseTo(18 - 0.06)
    expect(Math.floor(s.panel.z / CELL)).toBe(2)
    // The prize in the far corner.
    expect(s.prizeAt).toEqual({ x: cellCenter(7), y: 3, z: cellCenter(2) })
    expect(secretDoorFace(map, s)).toEqual({ i: 6, j: 1, di: -1, dj: 0 })
  })

  it('a colour puzzle derives its target from the key', () => {
    const b = new Builder(10, 5)
    b.addRoom(0, 0, 6, 4, 'start', 'hall', 0)
    const s = b.secret(0, 'color', [6, 1, 6, 1], { i: 6, j: 1, axis: 'x' }, [[0, 0, 'n', 1], [1, 0, 'n', 0], [2, 0, 'n', 1]], [], 'hp', 1)
    expect(s.target).toEqual([1, 0, 1])
    expect(s.key).toBe(1)
  })

  it('stays shut to bodies and paths until opened; its state rides in the save', () => {
    const { map } = secretMap()
    const host = hostFor(map)
    const run = new ClimbRun(host, 1)
    const nav = host.nav
    const inside: [number, number] = [cellCenter(6), cellCenter(1)]
    const from: [number, number] = [cellCenter(4), cellCenter(1)]
    expect(findPath(nav, ...from, ...inside, 1400, 0, true)).toBeNull()
    const out: [number, number] = [0, 0]
    moveBody(nav, from[0], from[1], 3, 6, 0, PLAYER_R, out)
    expect(out[0]).toBeLessThan(18 - PLAYER_R + 0.01)
    // The rest of the rim is wall for good: along row 2 too.
    moveBody(nav, cellCenter(4), cellCenter(2), 3, 6, 0, PLAYER_R, out)
    expect(out[0]).toBeLessThan(18)
    expect(run.secretOpen(0)).toBe(false)
    expect(run.save().open).toEqual([])

    run.openSecret(0)
    expect(run.secretOpen(0)).toBe(true)
    expect(findPath(nav, ...from, ...inside, 1400, 0, true)).not.toBeNull()
    moveBody(nav, from[0], from[1], 3, 6, 0, PLAYER_R, out)
    expect(out[0]).toBeGreaterThan(19)
    moveBody(nav, cellCenter(4), cellCenter(2), 3, 6, 0, PLAYER_R, out)
    expect(out[0]).toBeLessThan(18)
    expect(run.save().open).toEqual([0])

    // A resumed stage: open again.
    const host2 = hostFor(map)
    const run2 = new ClimbRun(host2, 1)
    run2.restore(run.save())
    expect(run2.secretOpen(0)).toBe(true)
    expect(findPath(host2.nav, ...from, ...inside, 1400, 0, true)).not.toBeNull()
  })

  it('survives the mirror', () => {
    const { map, s } = secretMap()
    const m = mirrorX(map)
    const ms = m.terrain!.secrets![0]!
    expect(ms.door.i).toBe(10 - 1 - 6)
    expect(ms.buttons[0]!.x).toBeCloseTo(30 - 1.5)
    expect(ms.panel.nx).toBe(1)
    expect(ms.prizeAt.x).toBeCloseTo(30 - s.prizeAt.x)
    for (const k of ms.cells) expect(m.room[k]).toBe(0)
    expect(secretDoorFace(m, ms)).toEqual({ i: 3, j: 1, di: 1, dj: 0 })
  })
})

// ─── Feature hooks ───────────────────────────────────────────────────────────

describe('stage features', () => {
  const withFeature = (f: StageFeature) => {
    const map = gapMap(1)
    const host = hostFor(map)
    const run = new ClimbRun(host, 1)
    run.features.push(f)
    return { run, host }
  }

  it('the climb builds only its secret\'s and its crumbling path (no sector mechanic)', () => {
    const map = generateClimb(7)
    const f = new ClimbRun(hostFor(map), 1).features
    expect(f.map(x => x.constructor.name)).toEqual(['SecretsFeature', 'CrumbleFeature'])
    expect(f[0]).toBeInstanceOf(SecretsFeature)
  })

  it('every old stage and the Tower hold 1-3 crumbling slabs, each over a gap that stays crossable without it', () => {
    const maps = [generateMeltdown(5), generateGlacier(5), generateRailRush(5), generateSkyDocks(5), generateClimb(5)]
    for (const m of maps) {
      const t = m.terrain!
      expect(t.crumbles?.length, m.terrain!.sections[0]?.kind).toBeGreaterThanOrEqual(1)
      for (const c of t.crumbles!) {
        const k = c.j * m.w + c.i
        expect(t.pit[k], `slab at ${c.i},${c.j}`).toBe(1)
        // A leap link spans the slab's cell, or (the Tower) a lift crosses
        // the same pit: the slab is a shortcut, never the only way.
        const leapOver = (t.links ?? []).some(l => l.kind === 'leap' && (l.from[0] + l.to[0]) / 2 === c.i && (l.from[1] + l.to[1]) / 2 === c.j)
        const shuttle = t.lifts.some(lf => lf.kind === 'h')
        expect(leapOver || shuttle, `slab at ${c.i},${c.j}`).toBe(true)
      }
    }
  })

  it('friction and push reach the walk; update runs each step', () => {
    const update = vi.fn()
    const { run } = withFeature({
      update,
      move: (_p, out) => { out.friction *= 0.3; out.pushX += 2; out.pushZ -= 1 }
    })
    const p = body(cellCenter(1), cellCenter(1))
    expect(run.moveMod(p)).toEqual({ friction: 0.3, pushX: 2, pushZ: -1, speed: 1 })
    // Pushed: 2 m/s along X, 1 m/s against Z with no walk of its own.
    const out: [number, number] = [0, 0]
    run.stepBody(p, out, 0, 0, 0.5, false)
    expect(out[0] - p.x).toBeCloseTo(1)
    expect(out[1] - p.z).toBeCloseTo(-0.5)
    run.update(DT, 1, p, true)
    expect(update).toHaveBeenCalledWith(DT, 1, p, true)
  })

  it('carry takes the body over and locksMove idles the stick; save and restore by place', () => {
    let riding = true
    let restored: unknown = null
    const { run } = withFeature({
      update: () => {},
      carry: (p, out) => {
        if (!riding) return false
        out[0] = 20
        out[1] = 4
        p.y = 7
        return true
      },
      locksMove: () => riding,
      save: () => ({ at: 3 }),
      restore: (s) => { restored = s }
    })
    const p = body(cellCenter(1), cellCenter(1))
    const out: [number, number] = [0, 0]
    p.vx = 5
    run.stepBody(p, out, 1, 0, DT, false)
    expect(out).toEqual([20, 4])
    expect(p.y).toBe(7)
    expect(run.locksMove()).toBe(true)
    riding = false
    expect(run.locksMove()).toBe(false)
    const s = run.save()
    expect(s.feat).toEqual([{ at: 3 }])
    run.restore(s)
    expect(restored).toEqual({ at: 3 })
  })

  it('an Atlas cue speaks once, near its spot and on its floor only', () => {
    const said: AtlasLine[] = []
    const cue = new AtlasCue({ say: l => { said.push(l) } }, 'hint.gap', 10, 10, 3, 4)
    expect(cue.update(body(10, 10, 0), true)).toBe(false) // a storey below
    expect(cue.update(body(20, 10, 3), true)).toBe(false) // too far
    expect(cue.update(body(12, 10, 3), false)).toBe(false) // not in play
    expect(cue.update(body(12, 10, 3), true)).toBe(true)
    expect(cue.update(body(11, 10, 3), true)).toBe(false)
    expect(said).toEqual(['hint.gap'])
    // As a feature: its save is which cues spoke.
    const f = cueFeature({ say: l => { said.push(l) } }, [{ line: 'secret.panel', x: 0, y: 0, z: 0 }, { line: 'hint.ice', x: 50, y: 0, z: 0 }])
    f.update(DT, 0, body(1, 1, 0), true)
    expect(f.save!()).toEqual([1, 0])
    const g = cueFeature({ say: l => { said.push(l) } }, [{ line: 'secret.panel', x: 0, y: 0, z: 0 }])
    g.restore!([1])
    g.update(DT, 0, body(1, 1, 0), true)
    expect(said).toEqual(['hint.gap', 'secret.panel'])
  })

  it('Atlas takes a stage\'s hint and secret lines: a hint as urgent as a trap, each once a mission', () => {
    const a = new AtlasDirector({ tutorial: false, kind: 'story', template: 'stage', sector: 'cryo', freed: 2 })
    const k = { playing: true, combat: false, hp01: 1, tanks: 1, we01: -1, level: 3, objectiveDone: false, trapNear: -1, plateNear: false }
    a.update(DT, k)
    a.say('secret.panel')
    a.say('hint.ice')
    const said: string[] = []
    for (let t = 0; t < 20; t += DT) {
      const before = a.line
      a.update(DT, k)
      if (a.line && a.line !== before) said.push(a.line.id)
      a.say('hint.ice')
    }
    expect(said).toEqual(['hint.ice', 'secret.panel'])
  })
})
