// Machines answer from anywhere in their room (a playtest note: in a big
// room they watched Flux shoot them from just past their range and never
// fired back). A machine that sees Flux in its own room notices him and may
// fire from there; outside its room its own range still rules.

import { describe, expect, it, vi } from 'vitest'

// The blob shadow and the telegraph ring draw canvas textures; plain objects stand in.
vi.mock('@/game/fx/markers', async () => {
  const { Mesh, Group } = await import('three')
  return { makeBlobShadow: () => new Mesh(), makeTeleRing: () => new Group(), setTeleRing: () => {} }
})
vi.mock('@/game/world/textures', async (orig) => {
  const { Texture } = await import('three')
  return { ...(await orig<object>()), glowTexture: () => new Texture(), ringTexture: () => new Texture() }
})

import { Scene } from 'three'
import { createEnemy, updateEnemy, inReach, ROOM_REACH } from '@/game/sim/enemies'
import { createNav } from '@/game/world/nav'
import { CELL, type MapData } from '@/game/world/levelGen'
import type { Enemy, World } from '@/game/sim/world'

const noop = () => {}
const W = 30

/** An open field; the cells from column `split` on are another room. */
const field = (split = W): MapData => {
  const room = new Int16Array(W * W)
  for (let j = 0; j < W; j++) for (let i = split; i < W; i++) room[j * W + i] = 1
  return { w: W, h: W, cell: new Uint8Array(W * W).fill(1), pillars: [], room, rooms: [] } as unknown as MapData
}

const rig = (dist: number, split = W) => {
  const map = field(split)
  const e = createEnemy('trooper', 1, 2 * CELL, 10 * CELL, 0)
  const w = {
    scene: new Scene(), map, nav: createNav(map), time: 0,
    player: { x: 2 * CELL + dist, z: 10 * CELL, yaw: 0, pitch: 0, y: 0 },
    combat: { iframes: 1e9 } as unknown as World['combat'], enemies: [e],
    fx: { sparks: noop, emit: noop, orbBurst: noop, flash: noop, riseRing: noop },
    markers: { spawn: noop }, shocks: { spawn: noop, spawnLinear: noop },
    fireEnemyShot: noop, lobShell: noop, spawnWave: noop, spawnRing: noop, fireOrb: noop,
    hitPlayer: () => 'miss', shake: noop, sfx: noop, onEnemyKilled: noop
  } as unknown as World
  return { w, e }
}

const run = (w: World, e: Enemy, s: number) => {
  for (let t = 0; t < s; t += 1 / 60) { w.time += 1 / 60; updateEnemy(w, e, 1 / 60) }
}

describe('a machine and its room', () => {
  it('in its own room it is in reach anywhere (up to ROOM_REACH), outside only within its range', () => {
    const same = rig(26)
    expect(inReach(same.w, same.e, 26, 16)).toBe(true)
    expect(inReach(same.w, same.e, ROOM_REACH + 1, 16)).toBe(false)
    const other = rig(26, 6) // Flux stands in the next room
    expect(inReach(other.w, other.e, 26, 16)).toBe(false)
    expect(inReach(other.w, other.e, 10, 16)).toBe(true)
  })

  it('a Trooper that sees Flux across its big room wakes and opens fire', () => {
    const { w, e } = rig(26) // past its aggro radius and its 16 m range
    run(w, e, 3)
    expect(e.state === 'tele' || e.state === 'act' || e.state === 'recover').toBe(true)
  })

  it('the same distance into the next room: it does not notice him', () => {
    const { w, e } = rig(26, 6)
    run(w, e, 3)
    expect(e.state).toBe('idle')
  })
})
