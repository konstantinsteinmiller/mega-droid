// The Gear Roller's wind-up and lunge, against the REAL sim. Playtest: during
// the wind-up the wheel snapped left-right every frame and the body jittered
// in place (the pack's spacing nudged it a few mm, and the steer followed the
// direction of that nudge). And the lunge: a short back-rev, then a burst that
// speeds up toward Flux on a low hop, landing where the floor allows.
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/game/fx/markers', async () => {
  const { Mesh, Group } = await import('three')
  return { makeBlobShadow: () => new Mesh(), makeTeleRing: () => new Group(), setTeleRing: () => {} }
})

import {
  createEnemy, updateEnemy, syncEnemyVisual, ROLLER_LUNGE_HOP, ROLLER_LUNGE_TIME, ROLLER_LUNGE_TELE
} from '@/game/sim/enemies'
import { newMotion } from '@/game/models/motion'
import { createNav } from '@/game/world/nav'
import type { MapData } from '@/game/world/levelGen'
import type { Enemy, World } from '@/game/sim/world'

const DT = 1 / 60

const world = (enemies: Enemy[], hits: number[]): World => {
  const W = 40
  const map = { w: W, h: W, cell: new Uint8Array(W * W).fill(1), pillars: [], room: new Int16Array(W * W), rooms: [] } as unknown as MapData
  const noop = (): void => {}
  return {
    map, nav: createNav(map), time: 0,
    player: { x: 60, z: 35, yaw: 0, pitch: 0 },
    combat: { iframes: 1e9 } as World['combat'],
    enemies,
    fx: { sparks: noop, emit: noop, orbBurst: noop } as unknown as World['fx'],
    markers: { spawn: noop } as unknown as World['markers'],
    shocks: { spawn: noop } as unknown as World['shocks'],
    fireEnemyShot: noop, lobShell: noop, spawnWave: noop, spawnRing: noop, fireOrb: noop,
    hitPlayer: (_e: Enemy, dmg: number) => { hits.push(dmg); return 'hit' }, shake: noop, sfx: noop
  } as unknown as World
}

const roller = (x = 60, z = 30): Enemy => {
  const e = createEnemy('roller', 1, x, z, 0)
  e.yaw = 0
  e.mo = newMotion(777, 'roller')
  e.mo.pyaw = 0
  e.state = 'engage'
  e.awake = true
  e.cd = 999
  return e
}

const tick = (w: World, e: Enemy): void => {
  w.time += DT
  updateEnemy(w, e, DT)
  syncEnemyVisual(e, 1, w.time)
}

beforeEach(() => {
  let s = 0x5eed
  const dice = vi.spyOn(Math, 'random').mockImplementation(() => {
    s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9) >>> 0
    return (s >>> 0) / 4294967296
  })
  return () => dice.mockRestore()
})

describe('Gear Roller wind-up', () => {
  it('holds its wheel straight: no left-right steer flip while it winds up, even jostled', () => {
    const hits: number[] = []
    const e = roller()
    // A pack-mate pressed against it: the spacing pushes it a little each tick
    const mate = roller(60.9, 30.2)
    mate.state = 'idle'
    mate.awake = false
    const w = world([e, mate], hits)
    for (const attack of ['charge', 'lunge']) {
      e.state = 'tele'
      e.st = 0
      e.attack = attack
      e.teleDur = 0.7
      let flips = 0
      let prev = e.mo.heading
      let worst = 0
      for (let i = 0; i < 40; i++) {
        // and jitter of its own, both ways, a few mm
        e.x += (i % 2 ? 1 : -1) * 0.004
        tick(w, e)
        if (e.state !== 'tele') break
        if (Math.sign(e.mo.heading) !== Math.sign(prev) && Math.abs(e.mo.heading - prev) > 0.02) flips++
        worst = Math.max(worst, Math.abs(e.mo.heading))
        prev = e.mo.heading
      }
      expect(flips, attack).toBe(0)
      expect(worst, attack).toBeLessThan(0.1)
    }
  })

  it('still rolls by distance across a strafe without flipping the wheel round', () => {
    const e = roller()
    const w = world([e], [])
    let prev = e.mo.heading
    let jumps = 0
    for (let i = 0; i < 120; i++) {
      e.x += 2 * DT // straight across its facing: psi sits at 90°
      e.yaw = 0
      tick(w, e)
      if (Math.abs(e.mo.heading - prev) > 0.5) jumps++
      prev = e.mo.heading
    }
    expect(jumps).toBe(0)
  })
})

describe('Gear Roller lunge', () => {
  it('picks the lunge up close, winds up briefly, accelerates forward on a hop, lands and hits once', () => {
    const hits: number[] = []
    const e = roller()
    const w = world([e], hits)
    w.player.z = 34.5 // 4.5 m ahead
    e.cd = 0
    let sawLunge = false
    for (let i = 0; i < 600 && !(e.state === 'tele' && e.attack === 'lunge'); i++) {
      tick(w, e)
      w.player.x = 60
      w.player.z = e.z + 4.5
      if (e.state === 'recover' || (e.state === 'tele' && e.attack !== 'lunge')) { e.state = 'engage'; e.cd = 0 }
    }
    sawLunge = e.state === 'tele' && e.attack === 'lunge'
    expect(sawLunge).toBe(true)
    expect(e.teleDur).toBe(ROLLER_LUNGE_TELE)
    const z0 = e.z
    w.player.z = z0 + 4.5
    while (e.state === 'tele') {
      tick(w, e)
      expect(e.y).toBe(0)
    }
    expect(e.state).toBe('act')
    const speeds: number[] = []
    let peak = 0
    let pz = e.z
    while (e.state === 'act') {
      tick(w, e)
      speeds.push((e.z - pz) / DT)
      pz = e.z
      peak = Math.max(peak, e.y)
    }
    // Forward, and faster late than early
    expect(speeds.every(s => s >= 0)).toBe(true)
    const top = Math.max(...speeds)
    expect(top).toBeGreaterThan(speeds[0]! * 2)
    expect(speeds.indexOf(top)).toBeGreaterThan(speeds.length / 3)
    expect(e.z - z0).toBeGreaterThan(3)
    // Rises, then lands
    expect(peak).toBeGreaterThan(ROLLER_LUNGE_HOP * 0.8)
    expect(peak).toBeLessThanOrEqual(ROLLER_LUNGE_HOP + 1e-6)
    expect(e.y).toBe(0)
    expect(speeds.length * DT).toBeLessThan(ROLLER_LUNGE_TIME + 0.05)
    expect(e.state).toBe('recover')
    expect(hits).toEqual([e.dmg])
  })

  it('stops at a wall instead of lunging through it', () => {
    const e = roller()
    const w = world([e], [])
    // A wall row 2 m ahead
    const W = w.map.w
    for (let i = 0; i < W; i++) (w.map.cell as Uint8Array)[11 * W + i] = 0
    w.nav = createNav(w.map)
    w.player.z = 40
    e.state = 'tele'
    e.st = 0
    e.attack = 'lunge'
    e.teleDur = ROLLER_LUNGE_TELE
    for (let i = 0; i < 90; i++) tick(w, e)
    expect(e.z).toBeLessThan(11 * 3) // never past the wall row
    expect(e.y).toBe(0)
  })
})
