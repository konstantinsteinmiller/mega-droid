/**
 * A wind-up's floor marker goes with a machine that will never strike: a
 * wall cannon killed (or stunned) before its shell leaves takes its red
 * landing ring with it (a short fade) and fires nothing; a shell already in
 * the air keeps its ring to the landing.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/game/fx/markers', async (orig) => {
  const { Mesh, Group } = await import('three')
  const real = await orig<typeof import('@/game/fx/markers')>()
  return { ...real, makeBlobShadow: () => new Mesh(), makeTeleRing: () => new Group(), setTeleRing: () => {} }
})
import { FloorMarkers, MARKER_FADE } from '@/game/fx/markers'
import { createEnemy, updateEnemy, markerOwnerGone } from '@/game/sim/enemies'
import { createNav } from '@/game/world/nav'
import { CELL, type MapData, type Room } from '@/game/world/levelGen'
import type { Enemy, World } from '@/game/sim/world'

const DT = 1 / 60
const W = 20
const ROOM = { id: 0, x0: 1, z0: 1, w: 18, h: 18, depth: 0, parent: -1, children: [], role: 'fight', door: -1, cells: [] } as unknown as Room
const MID = 10 * CELL

const stubs = (): unknown => new Proxy({}, { get: () => () => {} })

const setup = (): { w: World; e: Enemy; markers: FloorMarkers; shells: number[] } => {
  const map = { w: W, h: W, cell: new Uint8Array(W * W).fill(1), pillars: [], room: new Int16Array(W * W), rooms: [ROOM] } as unknown as MapData
  const markers = new FloorMarkers()
  const shells: number[] = []
  const e = createEnemy('turret', 1, MID, MID - 8, 0)
  const noop = (): void => {}
  const w = {
    map, nav: createNav(map), time: 0,
    player: { x: MID, z: MID, y: 0, yaw: 0, pitch: 0 },
    combat: { iframes: 1e9 } as World['combat'],
    enemies: [e],
    fx: stubs(), markers, shocks: stubs(),
    fireEnemyShot: noop, spawnWave: noop, spawnRing: noop, fireOrb: noop, pull: noop, slowPlayer: noop,
    // As the mission does: the shell in the air takes its marker over.
    lobShell: (o: Enemy, tx: number, tz: number, dur: number) => { shells.push(dur); markers.release(o, tx, tz) },
    spawnEnemy: noop, hitPlayer: () => 'hit', shake: noop, sfx: noop
  } as unknown as World
  e.awake = true
  e.state = 'engage'
  e.cd = 0
  return { w, e, markers, shells }
}

/** One mission frame: the machine, then the markers (as `Mission.update`). */
const tick = (s: ReturnType<typeof setup>): void => {
  s.w.time += DT
  if (s.e.hp > 0 && s.e.state !== 'dead') updateEnemy(s.w, s.e, DT)
  s.markers.cancelIf(markerOwnerGone)
  s.markers.update(DT, s.w.time)
}

const windUp = (s: ReturnType<typeof setup>): void => {
  for (let k = 0; k < 120 && s.e.state !== 'tele'; k++) tick(s)
  expect(s.e.state).toBe('tele')
  expect(s.markers.live).toBe(1)
}

describe('wind-up markers follow their machine', () => {
  it('a cannon killed mid wind-up: its ring fades out and no shell flies', () => {
    const s = setup()
    windUp(s)
    s.e.hp = 0
    s.e.state = 'dead'
    tick(s)
    expect(s.markers.live).toBe(1) // fading, not snapped away
    for (let t = 0; t < MARKER_FADE + 0.05; t += DT) tick(s)
    expect(s.markers.live).toBe(0)
    for (let k = 0; k < 180; k++) tick(s)
    expect(s.shells).toHaveLength(0)
  })

  it('a cannon stunned mid wind-up loses its ring too', () => {
    const s = setup()
    windUp(s)
    s.e.state = 'stun'
    s.e.stunT = 2
    for (let t = 0; t < MARKER_FADE + 0.05; t += DT) tick(s)
    expect(s.markers.live).toBe(0)
  })

  it('a cannon killed after it fired: the ring stays until the shell lands', () => {
    const s = setup()
    windUp(s)
    for (let k = 0; k < 300 && s.shells.length === 0; k++) tick(s)
    expect(s.shells).toHaveLength(1)
    s.e.hp = 0
    s.e.state = 'dead'
    // Most of the flight later, the ring is still down.
    for (let t = 0; t < s.shells[0]! * 0.8; t += DT) tick(s)
    expect(s.markers.live).toBe(1)
    for (let t = 0; t < 1.5; t += DT) tick(s)
    expect(s.markers.live).toBe(0)
  })
})
