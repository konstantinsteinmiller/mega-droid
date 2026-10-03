// The interact reach (src/game/sim/objectives.ts `nearestInteractable`):
// what answers [E], the prompt button and a tap. Playtest S3: "[E] Open only
// showed from one spot". A chest stands 0.55 m back toward its wall and its
// collision keeps the player 1.4 m off its middle, so a 2.9 m reach left only
// a thin crescent in front of it; the reach is now the boss shutter's 3.4 m,
// and up close the grid sight test is taken on trust.

import { describe, expect, it, vi } from 'vitest'

// The worker-bot's blob shadow draws a canvas texture (no 2D canvas under
// jsdom); a plain mesh stands in.
vi.mock('@/game/fx/markers', async () => {
  const { Mesh } = await import('three')
  return { makeBlobShadow: () => new Mesh() }
})

import { Scene } from 'three'
import { generateMap } from '@/game/world/levelGen'
import { createNav, hasLineOfSight, resolveCircle, type Nav } from '@/game/world/nav'
import { THEMES } from '@/game/world/themes'
import { tutorialQuest, type Quest } from '@/game/data/quests'
import { MissionObjects, type Chest, type Npc, type ObjectiveHost } from '@/game/sim/objectives'
import { planWalkthrough, doorwayOf } from '@/game/sim/walkthrough'
import { roomAt } from '@/game/sim/lessons'
import { INTERACT_DIST, INTERACT_NEAR, PLAYER_R } from '@/game/sim/constants'

const build = (q: Quest) => {
  const map = generateMap({ seed: q.seed, rooms: q.rooms, boss: true })
  const scene = new Scene()
  const noop = () => {}
  const host = {
    scene, map, nav: createNav(map), theme: THEMES.scrapyard, propParent: () => scene,
    fx: { sparks: noop, emit: noop, orbBurst: noop, flash: noop, riseRing: noop },
    shocks: { spawn: noop }, shake: noop, sfx: noop, explode: noop,
    onCrateBroken: noop, onChestOpened: noop, onCoreTaken: noop, onObjectiveDone: noop
  }
  return { objs: new MissionObjects(host as unknown as ObjectiveHost, q), map, nav: host.nav }
}

/** A job on a generated sector map: a supply run (four chests on top of the
 *  treasure rooms' own) or a rescue. */
const job = (seed: number, template: 'supply' | 'rescue' = 'supply'): Quest =>
  ({ ...tutorialQuest(), kind: 'job', template, seed, rooms: 8, count: template === 'supply' ? 4 : 1 })

/** Job maps that have a corridor running past a chest room's corner. */
const JOB_SEEDS = [2, 3, 6, 7, 9, 12].map(k => k * 7919)

/** The tutorial's last room and its chest, placed as the mission does
 *  (`Mission.walkChest`): against a wall, in plain view of the door. */
const tutorialChest = () => {
  const w = build(tutorialQuest())
  const plan = planWalkthrough(w.map)
  const room = w.map.rooms[plan.gates.find(g => g.steps.includes('chest'))!.room]!
  const [dx, dz] = doorwayOf(w.map, room.id)
  const chest = w.objs.chests.find(k => roomAt(w.map, k.x, k.z) === room.id) ?? w.objs.placeChest(room, dx, dz)!
  return { ...w, chest }
}

/** A spot in a chest's frame: `a` m to its side, `b` m out from its middle
 *  (its front face is at b = 0.5, its sides at a = ±0.78). */
const at = (c: Chest, a: number, b: number): [number, number] => {
  const s = Math.sin(c.yaw)
  const k = Math.cos(c.yaw)
  return [c.x + k * a + s * b, c.z - s * a + k * b]
}

/** The player's body fits there: no wall, pillar or prop pushes it off (and
 *  it is not dead on a pillar's or a prop's middle, which nothing pushes). */
const standable = (nav: Nav, x: number, z: number): boolean => {
  const [rx, rz] = resolveCircle(nav, x, z, PLAYER_R)
  if (Math.abs(rx - x) > 1e-6 || Math.abs(rz - z) > 1e-6) return false
  const clear = (p: { x: number; z: number; r: number }) => Math.hypot(p.x - x, p.z - z) >= p.r + PLAYER_R
  return nav.map.pillars.every(clear) && nav.props.every(p => !p.active || clear(p))
}

/** The yaw that looks from (px, pz) at (x, z) (forward is −sin, −cos). */
const facing = (px: number, pz: number, x: number, z: number): number => Math.atan2(-(x - px), -(z - pz))

/** How far (x, z) is from a chest's body (1.56 m × 1.0 m). */
const fromBox = (c: Chest, x: number, z: number): number => {
  const s = Math.sin(c.yaw)
  const k = Math.cos(c.yaw)
  const a = (x - c.x) * k - (z - c.z) * s
  const b = (x - c.x) * s + (z - c.z) * k
  return Math.hypot(Math.max(0, Math.abs(a) - 0.78), Math.max(0, Math.abs(b) - 0.5))
}

describe('a chest answers [E] from where a player stands (playtest S3)', () => {
  it('the tutorial chest: from anywhere up to 2 m in front of it or beside it, facing it', () => {
    const { objs, nav, chest } = tutorialChest()
    const spots: Array<[number, number]> = []
    // 1–2 m out from its front face, up to 2 m either side of its middle…
    for (const b of [1.5, 2, 2.5]) for (const a of [-2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2]) spots.push([a, b])
    // …and 1–2 m out from either side.
    for (const b of [0, 0.5, 1]) for (const a of [1.8, 2.3, 2.8]) spots.push([a, b], [-a, b])
    const missed: string[] = []
    let stood = 0
    for (const [a, b] of spots) {
      const [x, z] = at(chest, a, b)
      if (!standable(nav, x, z)) continue
      stood++
      if (objs.nearestInteractable(x, z, facing(x, z, chest.x, chest.z))?.ref !== chest) missed.push(`(${a}, ${b})`)
    }
    // It stands in a corner: one side is wall, the rest is open floor.
    expect(stood).toBeGreaterThanOrEqual(24)
    expect(missed).toEqual([])
  })

  it('job maps: every chest, from anywhere within 2 m of it (unless another chest is nearer)', () => {
    const missed: string[] = []
    let stood = 0
    for (const seed of JOB_SEEDS) {
      const { objs, nav } = build(job(seed))
      for (const c of objs.chests) {
        for (let a = -3; a <= 3; a += 0.1) for (let b = -0.6; b <= 2.6; b += 0.1) {
          const [x, z] = at(c, a, b)
          if (fromBox(c, x, z) > 2 || !standable(nav, x, z)) continue
          stood++
          const got = objs.nearestInteractable(x, z, facing(x, z, c.x, c.z))?.ref as Chest | undefined
          const d = Math.hypot(c.x - x, c.z - z)
          if (got !== c && !(got && Math.hypot(got.x - x, got.z - z) <= d)) missed.push(`${seed} #${c.id} (${a.toFixed(1)}, ${b.toFixed(1)})`)
        }
      }
    }
    expect(stood).toBeGreaterThan(1000)
    expect(missed).toEqual([])
  })

  it('up close it needs no sight line; further out it does, and the reach ends at INTERACT_DIST', () => {
    const { objs, nav, chest } = tutorialChest()
    const [x, z] = at(chest, 0, 1.6)
    expect(standable(nav, x, z)).toBe(true)
    const yaw = facing(x, z, chest.x, chest.z)
    expect(objs.nearestInteractable(x, z, yaw)?.ref).toBe(chest)
    // Straight out in front: in reach to just short of INTERACT_DIST, not past it.
    const [nx, nz] = at(chest, 0, INTERACT_DIST - 0.05)
    const [fx, fz] = at(chest, 0, INTERACT_DIST + 0.05)
    expect(standable(nav, nx, nz) && standable(nav, fx, fz)).toBe(true)
    expect(objs.nearestInteractable(nx, nz, yaw)?.ref).toBe(chest)
    expect(objs.nearestInteractable(fx, fz, yaw)).toBeNull()
    // Opened, it is done.
    objs.openChest(chest)
    expect(objs.nearestInteractable(x, z, yaw)).toBeNull()
  })

  it('a shot opens a shut chest (any hit by Flux), and stops on an open one', () => {
    const { objs, chest } = tutorialChest()
    expect(chest.opened).toBe(false)
    // A pellet flying into its side, at chest height.
    expect(objs.shotHitsChest(chest.x, chest.y + 0.5, chest.z, 0.2)).toBe(true)
    expect(chest.opened).toBe(true)
    // Already open: the shot still stops on it, nothing opens twice.
    expect(objs.shotHitsChest(chest.x, chest.y + 0.5, chest.z, 0.2)).toBe(true)
    expect(chest.opened).toBe(true)
  })
})

describe('never through a wall', () => {
  it('a corridor running past the chest room\'s corner gets no prompt, and no such spot comes up close', () => {
    const leaks: string[] = []
    let behind = 0
    let nearest = Infinity
    for (const seed of JOB_SEEDS) {
      const { objs, nav } = build(job(seed))
      for (const c of objs.chests) {
        for (let dx = -INTERACT_DIST; dx <= INTERACT_DIST; dx += 0.2) for (let dz = -INTERACT_DIST; dz <= INTERACT_DIST; dz += 0.2) {
          const x = c.x + dx
          const z = c.z + dz
          const d = Math.hypot(dx, dz)
          if (d >= INTERACT_DIST || !standable(nav, x, z) || hasLineOfSight(nav, x, z, c.x, c.z)) continue
          behind++
          nearest = Math.min(nearest, d)
          if (objs.nearestInteractable(x, z, facing(x, z, c.x, c.z))?.ref === c) leaks.push(`${seed} #${c.id} (${x.toFixed(1)}, ${z.toFixed(1)})`)
        }
      }
    }
    expect(behind).toBeGreaterThan(0)
    expect(leaks).toEqual([])
    // A wall cell is 3 m thick: nobody behind one gets within the up-close trust.
    expect(nearest).toBeGreaterThan(INTERACT_NEAR)
  })

  it('a thin wall (a closed door) between still hides it at the longer reach', () => {
    const { objs, nav, chest } = tutorialChest()
    const [x, z] = at(chest, 0, 3.1)
    expect(standable(nav, x, z)).toBe(true)
    const yaw = facing(x, z, chest.x, chest.z)
    expect(objs.nearestInteractable(x, z, yaw)?.ref).toBe(chest)
    // A 0.2 m panel across the room, 2 m out from the chest's middle.
    const [ax, az] = at(chest, -4, 1.9)
    const [bx, bz] = at(chest, 4, 2.1)
    const door = { minX: Math.min(ax, bx), maxX: Math.max(ax, bx), minZ: Math.min(az, bz), maxZ: Math.max(az, bz), active: true }
    nav.slabs.push(door)
    expect(objs.nearestInteractable(x, z, yaw)).toBeNull()
    door.active = false
    expect(objs.nearestInteractable(x, z, yaw)?.ref).toBe(chest)
  })
})

describe('the worker-bot (rescue jobs) keeps its rules', () => {
  it('answers across its room — the chest reach plus its 0.4 m head start — not through a door, not once rescued', () => {
    const { objs, nav, map } = build(job(JOB_SEEDS[0]!, 'rescue'))
    const n = objs.npc!
    const room = roomAt(map, n.x, n.z)
    const ok = (x: number, z: number) => standable(nav, x, z) && roomAt(map, x, z) === room
    let stood = 0
    for (const [ux, uz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      for (const d of [1.2, 2.2, 3.2, INTERACT_DIST + 0.3, INTERACT_DIST + 0.5]) {
        const x = n.x + ux * d
        const z = n.z + uz * d
        if (!ok(x, z)) continue
        stood++
        const got = objs.nearestInteractable(x, z, facing(x, z, n.x, n.z))
        expect(got?.ref ?? null).toBe(d < INTERACT_DIST + 0.4 ? n : null)
      }
    }
    expect(stood).toBeGreaterThanOrEqual(8)
    // A closed door across the room between the player (3 m off) and the bot.
    const [ux, uz] = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const).find(([ux, uz]) => ok(n.x + ux * 3, n.z + uz * 3))!
    const [x, z] = [n.x + ux * 3, n.z + uz * 3]
    expect(objs.nearestInteractable(x, z, 0)?.ref).toBe(n)
    const door = ux !== 0
      ? { minX: n.x + ux * 1.9 - 0.1, maxX: n.x + ux * 1.9 + 0.1, minZ: n.z - 4, maxZ: n.z + 4, active: true }
      : { minX: n.x - 4, maxX: n.x + 4, minZ: n.z + uz * 1.9 - 0.1, maxZ: n.z + uz * 1.9 + 0.1, active: true }
    nav.slabs.push(door)
    expect(objs.nearestInteractable(x, z, 0)).toBeNull()
    door.active = false
    objs.rescue(n)
    expect(objs.nearestInteractable(x, z, 0)).toBeNull()
  })

  it('wins a near-tie with a chest (within 0.4 m), not a clear loss', () => {
    const { objs, nav, chest } = tutorialChest()
    const [px, pz] = at(chest, 0, 1.5)
    expect(standable(nav, px, pz)).toBe(true)
    const bot = (b: number): Npc => {
      const [x, z] = at(chest, 0, b)
      return { x, z, rescued: false } as unknown as Npc
    }
    objs.npc = bot(3.2) // 1.7 m off: 0.2 m further than the chest
    expect(objs.nearestInteractable(px, pz, 0)?.ref).toBe(objs.npc)
    objs.npc = bot(3.5) // 2.0 m off: 0.5 m further
    expect(objs.nearestInteractable(px, pz, 0)?.ref).toBe(chest)
  })
})

describe('touch: a tap on the chest', () => {
  it('walks the player up close enough to open it with the next tap (Mission.handleTaps stops 1.6 m out)', () => {
    const { objs, nav, chest } = tutorialChest()
    // From across the room, from either side, from along its wall.
    for (const [a, b] of [[0, 7], [-3, 4], [3, 4], [2.6, 0.3], [-2.6, 0.3]] as const) {
      const [sx, sz] = at(chest, a, b)
      const dx = sx - chest.x
      const dz = sz - chest.z
      const d = Math.hypot(dx, dz)
      const [x, z] = resolveCircle(nav, chest.x + (dx / d) * 1.6, chest.z + (dz / d) * 1.6, PLAYER_R)
      expect(objs.nearestInteractable(x, z, facing(x, z, chest.x, chest.z))?.ref).toBe(chest)
    }
  })
})
