// @vitest-environment jsdom
// #182: the Stomper had to hop right up to Flux before it was any threat
// (a 7 m leap from 8 m), and the slide lesson's Stomper was shot down before
// it ever leapt. Its leap now reaches over three times as far, its landing
// ring sits where it lands, it never leaps through a wall, and the lesson's
// Stomper takes nothing until its leap has been held over Flux.
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/game/audio/sfx', () => ({ sfx: () => {} }))
vi.mock('@/use/useAds', () => ({ showMidgameAd: async () => {} }))
vi.mock('@/use/useAdGate', () => ({ canShowInterstitial: () => false, markInterstitialShown: () => {} }))
vi.mock('@/use/useCrazyGames', () => ({ triggerHappytime: () => {} }))
vi.mock('@/game/engine/app', () => ({ app: { setMode: () => {}, setWanted: () => {} } }))
vi.mock('@/game/fx/markers', async () => {
  const { Mesh, Group } = await import('three')
  return { makeBlobShadow: () => new Mesh(), makeTeleRing: () => new Group(), setTeleRing: () => {}, ShockRings: class {}, TargetArrow: class {} }
})
vi.mock('@/game/world/textures', async (orig) => {
  const { Texture } = await import('three')
  return { ...(await orig<object>()), glowTexture: () => new Texture(), ringTexture: () => new Texture() }
})

import { createEnemy, updateEnemy, hopperLanding, HOPPER_LEAP_MAX, HOPPER_LEAP_R, HOPPER_LEAP_RING } from '@/game/sim/enemies'
import { Mission } from '@/game/sim/mission'
import { Training } from '@/game/sim/training'
import { createNav } from '@/game/world/nav'
import { CELL, type MapData, type Room } from '@/game/world/levelGen'
import type { Enemy, World } from '@/game/sim/world'

const DT = 1 / 60
const W = 40
const ROOM = { id: 0, x0: 2, z0: 2, w: 36, h: 36, depth: 0, parent: -1, children: [], role: 'fight', door: -1, cells: [] } as unknown as Room
const stubs = (): unknown => new Proxy({}, { get: () => () => {} })
const OLD_LEAP = 7

const world = (wallAtI = -1) => {
  const cell = new Uint8Array(W * W).fill(1)
  // A wall across the room at column `wallAtI`
  if (wallAtI >= 0) for (let j = 0; j < W; j++) cell[j * W + wallAtI] = 0
  const map = { w: W, h: W, cell, pillars: [], room: new Int16Array(W * W), navBlock: new Uint8Array(W * W), rooms: [ROOM] } as unknown as MapData
  const spawn = vi.fn()
  const noop = (): void => {}
  const w = {
    map, nav: createNav(map), time: 0,
    player: { x: 20 * CELL, z: 20 * CELL, y: 0, yaw: 0, pitch: 0 },
    combat: { iframes: 1e9 } as World['combat'],
    enemies: [] as Enemy[],
    fx: stubs(), markers: { spawn }, shocks: stubs(),
    fireEnemyShot: noop, lobShell: noop, spawnWave: noop, spawnRing: noop, fireOrb: noop, pull: noop, slowPlayer: noop,
    spawnEnemy: noop, hitPlayer: () => 'hit', shake: noop, sfx: noop
  } as unknown as World
  return { w, spawn }
}

const stomper = (w: World, x: number, z: number): Enemy => {
  const e = createEnemy('hopper', 1, x, z, 0)
  e.awake = true
  e.state = 'engage'
  e.cd = 0
  w.enemies.push(e)
  return e
}

/** Run until it takes off and lands; where it took off and came down. */
const leap = (w: World, e: Enemy) => {
  let from: [number, number] | null = null
  for (let k = 0; k < 600; k++) {
    w.time += DT
    const was = e.state
    updateEnemy(w, e, DT)
    if (was === 'tele' && e.state === 'act') from = [e.x, e.z]
    if (was === 'act' && e.state === 'recover') return { from: from!, to: [e.x, e.z] as [number, number] }
  }
  return null
}

describe('the Stomper leap (#182)', () => {
  it('reaches at least 3x as far as the old 7 m, and winds up from its full reach', () => {
    expect(HOPPER_LEAP_MAX).toBeGreaterThanOrEqual(3 * OLD_LEAP)
    const { w } = world()
    const e = stomper(w, w.player.x - 23, w.player.z)
    const r = leap(w, e)!
    expect(r).not.toBeNull()
    expect(Math.hypot(r.to[0] - r.from[0], r.to[1] - r.from[1])).toBeGreaterThan(3 * OLD_LEAP)
    // It came down on Flux
    expect(Math.hypot(r.to[0] - w.player.x, r.to[1] - w.player.z)).toBeLessThan(HOPPER_LEAP_RING)
    expect(HOPPER_LEAP_R).toBeLessThanOrEqual(HOPPER_LEAP_MAX + HOPPER_LEAP_RING)
  })

  it('marks its landing ring where it lands, owned by it', () => {
    const { w, spawn } = world()
    const e = stomper(w, w.player.x - 18, w.player.z + 6)
    const r = leap(w, e)!
    expect(spawn).toHaveBeenCalledTimes(1)
    const [x, z, rad, , owner] = spawn.mock.calls[0]!
    expect(owner).toBe(e)
    expect(rad).toBe(HOPPER_LEAP_RING)
    // The ring is the leap's own target, and it comes down inside it
    expect(Math.hypot(x - e.tx, z - e.tz)).toBeLessThan(1e-6)
    expect(Math.hypot(x - r.to[0], z - r.to[1])).toBeLessThan(HOPPER_LEAP_RING)
  })

  it('never leaps through a wall: it lands short, on its own side, clear of it', () => {
    const { w, spawn } = world(20)
    const wallX = 20 * CELL
    const e = stomper(w, wallX - 10, w.player.z)
    // Flux past the wall: the landing pulls back to its own side
    const at = hopperLanding(w, e, wallX + CELL + 4, w.player.z, [0, 0])!
    expect(at).not.toBeNull()
    expect(at[0]).toBeLessThan(wallX - e.def.radius)
    // Wall right in its face: no leap at all
    const boxed = stomper(w, wallX - 1, w.player.z)
    expect(hopperLanding(w, boxed, wallX + 6, w.player.z, [0, 0])).toBeNull()
    // And the sim never takes it through (it does not see him there either)
    w.player.x = wallX + CELL + 4
    for (let k = 0; k < 300; k++) {
      w.time += DT
      updateEnemy(w, e, DT)
      expect(e.x).toBeLessThan(wallX)
    }
    for (const c of spawn.mock.calls) expect(c[0]).toBeLessThan(wallX)
  })
})

describe('the slide lesson Stomper (#182)', () => {
  const fakeMission = (o: { cueDone?: boolean; learned?: boolean; steps?: string[]; room?: number } = {}) => {
    const m = Object.create(Mission.prototype) as Record<string, unknown>
    const tr = new Training({ say: () => {} })
    if (o.learned) tr.done.add('slide')
    Object.assign(m, { training: tr, slideCueDone: !!o.cueDone, walk: { active: true, current: { room: o.room ?? 0, steps: o.steps ?? ['slide'] } } })
    return m as unknown as { lessonShield(e: Enemy): boolean }
  }

  it('cannot be shot down before its leap has been held over Flux', () => {
    const { w } = world()
    const e = stomper(w, w.player.x - 20, w.player.z)
    expect(fakeMission().lessonShield(e)).toBe(true)
    // Its leap was held and answered, or the slide is learned: it falls as usual
    expect(fakeMission({ cueDone: true }).lessonShield(e)).toBe(false)
    expect(fakeMission({ learned: true }).lessonShield(e)).toBe(false)
    // Another room or another lesson: no shield
    expect(fakeMission({ steps: ['block'] }).lessonShield(e)).toBe(false)
    expect(fakeMission({ room: 3 }).lessonShield(e)).toBe(false)
  })

  it('leaps at Flux from across the room soon after it wakes', () => {
    const { w } = world()
    const e = stomper(w, w.player.x - 20, w.player.z)
    e.cd = 1.4 // the longest a wake holds it
    let t = 0
    while (e.state !== 'act' && t < 4) {
      w.time += DT
      t += DT
      updateEnemy(w, e, DT)
    }
    expect(e.state).toBe('act')
    expect(t).toBeLessThan(3)
  })
})
