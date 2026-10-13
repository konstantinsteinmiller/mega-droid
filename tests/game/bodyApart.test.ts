// Flux and a machine's body never overlap (#148). Playtests: the Blaze
// Master's leap-slam landed on Flux's spot and stayed there (distance 0.00
// for 15 s and more), the tutorial's Scrapper did after he walked into it,
// and the Cryo challenge mini-boss stood on him — the old push-apart had no
// "away" at distance 0 and skipped it, so the first-person camera sat inside
// the mesh and the screen was one colour. A dead Puffer Matriarch and a
// sleeping crate golem did the same to the camera. Now every body on the
// floor steps out to the rim (through the wall test; what a wall leaves
// moves Flux, never into a wall), and a model the eye is inside is not drawn.

import { describe, expect, it, vi } from 'vitest'

vi.mock('@/game/fx/markers', async () => {
  const { Mesh, Group } = await import('three')
  return { makeBlobShadow: () => new Mesh(), makeTeleRing: () => new Group(), setTeleRing: () => {} }
})
vi.mock('@/game/world/textures', async (orig) => {
  const { Texture } = await import('three')
  return { ...(await orig<object>()), levelAtlas: () => new Texture(), glowTexture: () => new Texture(), ringTexture: () => new Texture() }
})

import { createBoss, startBossIntro, updateBoss } from '@/game/sim/bosses'
import { createEnemy, keepOffPlayer, keepBigOffPlayer, updateEnemy } from '@/game/sim/enemies'
import { createMiniBoss, startMiniBoss, updateMiniBoss } from '@/game/sim/miniBosses'
import { MINI_BOSSES } from '@/game/sim/miniBoss/registry'
import { eyeInBody, nearCut } from '@/game/fx/nearCut'
import { PLAYER_R, EYE_H } from '@/game/sim/constants'
import { createNav, resolveCircle, groundAt, moveCircle } from '@/game/world/nav'
import { generateVexFortress } from '@/game/world/stages/fortress'
import { BOSSES } from '@/game/data/bosses'
import type { BossId } from '@/game/models/bosses'
import { CELL, cellCenter, generateMap, type MapData, type Room } from '@/game/world/levelGen'
import { THEMES } from '@/game/world/themes'
import type { Enemy, World } from '@/game/sim/world'

const DT = 1 / 60
const noop = (): void => {}

/** An open floor 40 cells square; `wallAt` cells across are solid (column). */
const openWorld = (enemies: Enemy[], wallAt = -1): World & { hits: string[] } => {
  const W = 40
  const cell = new Uint8Array(W * W).fill(1)
  if (wallAt >= 0) for (let j = 0; j < W; j++) cell[j * W + wallAt] = 0
  const map = { w: W, h: W, cell, pillars: [], room: new Int16Array(W * W), rooms: [] } as unknown as MapData
  const hits: string[] = []
  return {
    map, nav: createNav(map), time: 0,
    player: { x: 60, z: 37, yaw: Math.PI, pitch: 0 },
    combat: { iframes: 1e9 } as World['combat'],
    enemies,
    fx: { sparks: noop, emit: noop, orbBurst: noop, riseRing: noop } as unknown as World['fx'],
    markers: { spawn: noop } as unknown as World['markers'],
    shocks: { spawn: noop } as unknown as World['shocks'],
    fireEnemyShot: noop, lobShell: noop, spawnWave: noop, spawnRing: noop, fireOrb: noop,
    hitPlayer: (e: Enemy | null) => { hits.push(e?.attack ?? ''); return 'hit' as const },
    shake: noop, sfx: noop, hits
  }
}

const gap = (w: World, e: Enemy): number => Math.hypot(w.player.x - e.x, w.player.z - e.z)
const inWall = (w: World, x: number, z: number, r: number): boolean => {
  const [rx, rz] = resolveCircle(w.nav, x, z, r)
  return Math.hypot(rx - x, rz - z) > 1e-6
}

describe('a boss on Flux\'s spot', () => {
  it('a leap-slam aimed at his feet lands on the rim, its slam still hits, and it never stands in him after', () => {
    const e = createBoss('blazeMaster', 1, 60, 30, 0)
    const w = openWorld([e])
    startBossIntro(e)
    for (let k = 0; k < 4 / DT; k++) updateBoss(w, e, DT, null)
    // The leap: from where it stands onto Flux, who does not move.
    e.state = 'act'
    e.attack = 'leapSlam'
    e.st = 0
    e.step = 0
    e.sx = e.x
    e.sz = e.z
    e.tx = w.player.x
    e.tz = w.player.z
    const rr = e.def.radius + PLAYER_R
    let landed = false
    let least = Infinity
    for (let k = 0; k < 16 / DT; k++) {
      w.time += DT
      updateBoss(w, e, DT, null)
      if (e.step === 1) landed = true
      if (landed) least = Math.min(least, gap(w, e))
    }
    expect(landed).toBe(true)
    expect(w.hits).toContain('leapSlam')
    expect(least).toBeGreaterThanOrEqual(rr - 1e-6)
  })

  it('dead centre with nowhere it came from: out behind its own facing, to the rim', () => {
    const e = createBoss('scrapper', 1, 60, 37, 0)
    const w = openWorld([e])
    startBossIntro(e)
    e.state = 'recover'
    e.st = 0
    e.yaw = 0
    e.x = e.px = w.player.x
    e.z = e.pz = w.player.z
    updateBoss(w, e, DT, null)
    expect(gap(w, e)).toBeGreaterThanOrEqual(e.def.radius + PLAYER_R - 1e-6)
    // Behind its facing (+z ahead): it went to −z of Flux.
    expect(e.z).toBeLessThan(w.player.z)
  })
})

// Dr. Vex hovers (def.fly 1.6), and every flier was let through: on the Core
// ring he sat at distance 0.00 from Flux for seconds, and Flux walked through
// him in his entrance (playtest 2026-10-13).
describe('Dr. Vex on Flux\'s spot', () => {
  const ring = () => {
    const map = generateVexFortress(3)
    const stages = map.terrain!.bossStages!
    return { map, room: map.rooms[stages[stages.length - 1]!]! }
  }

  it('on the Core ring, landing on Flux at the pit\'s edge, he is put off him — and Flux never into the lava', () => {
    const r = ring()
    const e = createBoss('vexMk1', 1, 0, 0, r.room.id)
    const w = openWorld([e])
    w.map = r.map
    w.nav = createNav(r.map)
    startBossIntro(e)
    e.state = 'recover'
    e.st = 0
    e.y = e.py = e.def.fly
    // Flux on the south walkway, his toes at the pit's edge (pit rows 48…50).
    w.player.x = (r.room.x0 + r.room.w / 2) * CELL
    w.player.z = 51 * CELL + PLAYER_R + 0.05
    ;(w.player as { y?: number }).y = 0
    const rr = e.def.radius + PLAYER_R
    for (let k = 0; k < 6 / DT; k++) {
      // Every half second he comes down on Flux's spot from the outer wall's
      // side, so the way he came pushes Flux toward the pit.
      if (k % 30 === 0) {
        e.px = w.player.x
        e.pz = w.player.z + 1
        e.x = w.player.x
        e.z = w.player.z
      }
      w.time += DT
      updateBoss(w, e, DT, null)
      expect(gap(w, e)).toBeGreaterThanOrEqual(rr - 0.02)
      expect(groundAt(w.map, w.player.x, w.player.z)).toBeGreaterThan(-1)
      expect(inWall(w, w.player.x, w.player.z, PLAYER_R)).toBe(false)
    }
  })

  it('held in place over Flux at the pit\'s edge, he moves Flux along the ring, not over the edge', () => {
    const r = ring()
    const e = createBoss('vexMk1', 1, 0, 0, r.room.id)
    const w = openWorld([e])
    w.map = r.map
    w.nav = createNav(r.map)
    startBossIntro(e)
    e.state = 'recover'
    e.y = e.py = e.def.fly
    e.rooted = true
    w.player.x = (r.room.x0 + r.room.w / 2) * CELL
    w.player.z = 51 * CELL + PLAYER_R + 0.05
    ;(w.player as { y?: number }).y = 0
    // On him, come from the wall's side: straight apart is Flux into the pit.
    e.x = w.player.x
    e.z = w.player.z + 0.2
    e.px = e.x
    e.pz = e.z + 1
    updateBoss(w, e, DT, null)
    expect(gap(w, e)).toBeGreaterThanOrEqual(e.def.radius + PLAYER_R - 0.02)
    expect(groundAt(w.map, w.player.x, w.player.z)).toBeGreaterThan(-1)
    expect(inWall(w, w.player.x, w.player.z, PLAYER_R)).toBe(false)
  })

  it('on a walkway as wide as he is, pinned across it, they part along it', () => {
    // One cell (3 m) wide, walls either side; Vex is 2.6 m across.
    const e = createBoss('vexMk1', 1, 0, 0, 0)
    const w = openWorld([e])
    const W = 40
    const cell = new Uint8Array(W * W)
    for (let j = 0; j < W; j++) cell[j * W + 20] = 1
    w.map = { w: W, h: W, cell, pillars: [], room: new Int16Array(W * W), rooms: [] } as unknown as MapData
    w.nav = createNav(w.map)
    startBossIntro(e)
    e.state = 'recover'
    e.st = 0
    e.y = e.py = e.def.fly
    w.player.x = 61.5
    w.player.z = 60
    // Across the walkway from him: the straight push only meets the walls.
    e.x = e.px = 61.4
    e.z = e.pz = 60
    updateBoss(w, e, DT, null)
    expect(gap(w, e)).toBeGreaterThanOrEqual(e.def.radius + PLAYER_R - 0.02)
    expect(inWall(w, e.x, e.z, e.def.radius)).toBe(false)
    expect(inWall(w, w.player.x, w.player.z, PLAYER_R)).toBe(false)
  })

  it('a hovering boss mesh the eye stands in is cut; at the rim it is drawn', () => {
    const e = createBoss('vexMk1', 1, 60, 37, 0)
    e.root.position.set(60, e.def.fly, 37)
    expect(eyeInBody(e, 60.1, EYE_H, 37)).toBe(true)
    nearCut(e, 60.1, EYE_H, 37)
    expect(e.rig.mesh.visible).toBe(false)
    nearCut(e, 60 + e.def.radius + PLAYER_R, EYE_H, 37)
    expect(e.rig.mesh.visible).toBe(true)
  })
})

describe('a boss\'s entrance', () => {
  it('once it is down, Flux walking straight through it is held at its rim — every boss', () => {
    for (const id of Object.keys(BOSSES) as BossId[]) {
      const e = createBoss(id, 1, 60, 37, 0)
      const w = openWorld([e])
      w.player.x = 54
      w.player.z = 37
      startBossIntro(e)
      const rr = e.def.radius + PLAYER_R
      let down = false
      for (let k = 0; k < 2.2 / DT && e.state === 'alert'; k++) {
        // Flux walks east through its spot, 4 m/s.
        w.player.x += 4 * DT
        w.time += DT
        updateBoss(w, e, DT, null)
        if (e.y <= e.def.fly + 0.05) down = true
        if (down) expect(gap(w, e), id).toBeGreaterThanOrEqual(rr - 0.02)
      }
      expect(down, id).toBe(true)
    }
  })
})

describe('a challenge mini-boss on Flux\'s spot', () => {
  const room = (): { map: MapData; room: Room; x: number; z: number } => {
    const map = generateMap({ seed: 4242, rooms: 9, boss: false, challenge: true })
    const ch = map.challenge!
    return { map, room: map.rooms[ch.room]!, x: cellCenter(ch.at[0]), z: cellCenter(ch.at[1]) }
  }

  it('the Cryo mini-boss stood on by Flux for 15 s never shares his spot, nor stands in a wall', () => {
    const r = room()
    const e = createMiniBoss(MINI_BOSSES.cryo, 8, r.x, r.z, r.room)
    const w = openWorld([e])
    w.map = r.map
    w.nav = createNav(r.map)
    w.player.x = (r.room.x0 + r.room.w / 2) * CELL
    w.player.z = (r.room.z0 + r.room.h / 2) * CELL
    startMiniBoss(e)
    for (let k = 0; k < 3 / DT; k++) updateMiniBoss(w, e, DT)
    const rr = e.def.radius + PLAYER_R
    let least = Infinity
    for (let k = 0; k < 15 / DT; k++) {
      // Flux walks into it every tick: onto its exact spot.
      if (k % 30 === 0) {
        w.player.x = e.x
        w.player.z = e.z
      }
      w.time += DT
      updateMiniBoss(w, e, DT)
      if (e.state !== 'dead' && e.def.fly === 0) least = Math.min(least, gap(w, e))
      expect(inWall(w, e.x, e.z, e.def.radius)).toBe(false)
      expect(inWall(w, w.player.x, w.player.z, PLAYER_R)).toBe(false)
    }
    expect(least).toBeGreaterThanOrEqual(rr - 0.02)
  })
})

// Playtest: the Frost Master sampled 1.19 m off Flux mid-dashSlash, under its
// 1.52 m rim. Every boss's own tick ends with it held off him, dashes and
// charges included; the machines ticked after it (adds in a corridor with
// him) pushed him back into it. The step now ends with the big bodies held
// off him once everything has moved (`keepBigOffPlayer`).
describe('a boss with adds round Flux in a corridor', () => {
  it('ends every step at its rim, through its dashes and charges: every boss', () => {
    const W = 40
    const cell = new Uint8Array(W * W).fill(1)
    // A corridor one cell (3 m) wide along x, at z 36 to 39.
    for (let i = 0; i < W; i++) { cell[11 * W + i] = 0; cell[13 * W + i] = 0 }
    const map = { w: W, h: W, cell, pillars: [], room: new Int16Array(W * W), navBlock: new Uint8Array(W * W), rooms: [] } as unknown as MapData
    const out: [number, number] = [0, 0]
    let pushedIn = 0
    for (const id of Object.keys(BOSSES) as BossId[]) {
      const e = createBoss(id, 1, 48, 37.5, 0)
      const adds = [0, 1, 2].map(k => createEnemy('brute', 5, 57 + k * 2, 35.5, 0, { theme: THEMES.scrapyard }))
      for (const a of adds) { a.awake = true; a.state = 'engage' }
      const w = openWorld([e, ...adds])
      w.map = map
      w.nav = createNav(map)
      startBossIntro(e)
      const rr = e.def.radius + PLAYER_R
      const seen = new Set<string>()
      for (let k = 0; k < 30 / DT; k++) {
        // Flux runs at it half the time (as a lock-on run does), before it ticks.
        const dx = e.x - w.player.x
        const dz = e.z - w.player.z
        const l = Math.hypot(dx, dz) || 1
        if (k % 240 < 120) {
          moveCircle(w.nav, w.player.x, w.player.z, (dx / l) * 4.7 * DT, (dz / l) * 4.7 * DT, PLAYER_R, out)
          w.player.x = out[0]
          w.player.z = out[1]
        }
        w.time += DT
        // The mission's order: the boss, then the rest, then the big bodies again.
        updateBoss(w, e, DT, null)
        for (const a of adds) updateEnemy(w, a, DT)
        if (e.state === 'dead' || e.offstage || e.y > e.def.fly + 0.3) continue
        if (gap(w, e) < rr - 0.05) pushedIn++
        keepBigOffPlayer(w, w.enemies)
        if (e.state === 'act') seen.add(e.attack)
        expect(gap(w, e), `${id} ${e.state}/${e.attack}`).toBeGreaterThanOrEqual(rr - 0.02)
      }
      expect(seen.size, id).toBeGreaterThan(0)
    }
    // The adds did push him into it: the last pass is what holds the rim.
    expect(pushedIn).toBeGreaterThan(0)
  })
})

describe('the push-apart against a wall', () => {
  it('a machine with a wall at its back stays out of the wall; Flux takes the rest, short of the other wall', () => {
    // Solid column at cell 21 (x 63…66): the machine's back is to it.
    const e = createEnemy('brute', 5, 0, 0, 0, { theme: THEMES.scrapyard })
    const w = openWorld([e], 21)
    e.x = e.px = 63 - e.def.radius - 0.001
    e.z = e.pz = 37
    w.player.x = e.x - 0.2
    w.player.z = 37
    keepOffPlayer(w, e)
    expect(gap(w, e)).toBeGreaterThanOrEqual(e.def.radius + PLAYER_R - 0.02)
    expect(inWall(w, e.x, e.z, e.def.radius)).toBe(false)
    expect(w.player.x).toBeLessThan(e.x)
  })

  it('Flux is never pushed into a wall', () => {
    const e = createEnemy('brute', 5, 0, 0, 0, { theme: THEMES.scrapyard })
    e.rooted = true
    const w = openWorld([e], 21)
    // Flux against the wall, the rooted machine on him from the open side.
    w.player.x = 63 - PLAYER_R - 0.001
    w.player.z = 37
    e.x = e.px = w.player.x - 0.3
    e.z = e.pz = 37
    keepOffPlayer(w, e)
    expect(inWall(w, w.player.x, w.player.z, PLAYER_R)).toBe(false)
    expect(w.player.x).toBeLessThanOrEqual(63 - PLAYER_R + 1e-6)
  })

  it('a sleeping crate golem is not moved: Flux is', () => {
    const e = createEnemy('golem', 5, 60, 37, 0, { theme: THEMES.scrapyard })
    const w = openWorld([e])
    w.player.x = 60.1
    w.player.z = 37
    keepOffPlayer(w, e)
    expect([e.x, e.z]).toEqual([60, 37])
    expect(gap(w, e)).toBeGreaterThanOrEqual(e.def.radius + PLAYER_R - 0.02)
  })
})

describe('the near cut', () => {
  it('a corpse the eye stands in is not drawn; it comes back once the eye is out', () => {
    const e = createMiniBoss(MINI_BOSSES.tide, 8, 60, 37, { id: 0 } as Room)
    e.state = 'dead'
    e.root.position.set(60, 0, 37)
    e.rig.outline && (e.rig.outline.visible = true)
    expect(eyeInBody(e, 60.2, EYE_H * 0.5, 37)).toBe(true)
    nearCut(e, 60.2, EYE_H * 0.5, 37)
    expect(e.rig.mesh.visible).toBe(false)
    expect(e.rig.outline?.visible ?? false).toBe(false)
    nearCut(e, 80, EYE_H, 37)
    expect(e.rig.mesh.visible).toBe(true)
    expect(e.rig.outline?.visible ?? false).toBe(!!e.rig.outline)
  })

  it('a live boss held at the rim is drawn whole: a point-blank fight keeps its foe', () => {
    for (const id of ['scrapper', 'blazeMaster', 'frostMaster'] as const) {
      const e = createBoss(id, 1, 60, 37, 0)
      e.root.position.set(60, 0, 37)
      const rim = e.def.radius + PLAYER_R
      expect(eyeInBody(e, 60 + rim, EYE_H, 37), id).toBe(false)
      expect(eyeInBody(e, 60, EYE_H, 37), id).toBe(true)
    }
  })
})
