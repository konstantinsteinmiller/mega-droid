// The Guardroid (sim/enemies.ts, kind 'brute'): besides its punches and slam up
// close it RUSHES from range behind a red ring (a straight line, locked at the
// end of the wind-up; into a wall it staggers), and an elite also fires its arm
// cannon in fans (orange, blockable). It used to be melee only — a Flux two
// steps away had nothing to fear.

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/game/fx/markers', async () => {
  const { Mesh, Group } = await import('three')
  return { makeBlobShadow: () => new Mesh(), makeTeleRing: () => new Group(), setTeleRing: () => {} }
})
vi.mock('@/game/world/textures', async (orig) => {
  const { Texture } = await import('three')
  return { ...(await orig<object>()), glowTexture: () => new Texture(), ringTexture: () => new Texture() }
})

import { Scene } from 'three'
import {
  createEnemy, updateEnemy, syncEnemyVisual, BRUTE_RUSH_MIN, BRUTE_RUSH_MAX, BRUTE_RUSH_TIME, BRUTE_WALL_STUN
} from '@/game/sim/enemies'
import { shotBlockable } from '@/game/sim/combat'
import { createNav } from '@/game/world/nav'
import { THEMES } from '@/game/world/themes'
import type { MapData } from '@/game/world/levelGen'
import type { Enemy, World } from '@/game/sim/world'

const DT = 1 / 60
const noop = (): void => {}

const rng = (seed: number) => () => {
  seed = (Math.imul(seed ^ (seed >>> 15), 2246822507) + 0x9e3779b9) >>> 0
  seed ^= seed >>> 13
  return (seed >>> 0) / 4294967296
}
beforeEach(() => {
  const dice = vi.spyOn(Math, 'random').mockImplementation(rng(0xb07e))
  return () => dice.mockRestore()
})

/** A 120 m open field; `wallRow` fills one row of cells (a wall across z). */
const field = (wallRow?: number): MapData => {
  const W = 40
  const cell = new Uint8Array(W * W).fill(1)
  if (wallRow !== undefined) for (let i = 0; i < W; i++) cell[wallRow * W + i] = 0
  return { w: W, h: W, cell, pillars: [], room: new Int16Array(W * W), rooms: [], navBlock: new Uint8Array(W * W) } as unknown as MapData
}

/** A Guardroid at (60, 30) facing +Z, awake and ready, Flux `dist` m up +Z. */
const setup = (dist: number, elite = false, map = field()) => {
  const e = createEnemy('brute', 3, 60, 30, 0, { elite, theme: THEMES.scrapyard })
  e.yaw = 0
  e.awake = true
  e.state = 'engage'
  e.cd = 0
  const hitPlayer = vi.fn(() => 'hit')
  const fireEnemyShot = vi.fn()
  const w = {
    scene: new Scene(), map, nav: createNav(map), time: 0,
    player: { x: 60, z: 30 + dist, yaw: 0, pitch: 0 },
    combat: { iframes: 0, charging: false, charge: 0 } as unknown as World['combat'],
    enemies: [e],
    fx: { sparks: noop, emit: noop, orbBurst: noop, flash: noop, riseRing: noop },
    markers: { spawn: noop }, shocks: { spawn: noop, spawnLinear: noop },
    hitStop: 0, fireEnemyShot, lobShell: vi.fn(), hitPlayer, shake: noop, sfx: vi.fn()
  } as unknown as World
  return { w, e, hitPlayer, fireEnemyShot }
}

const tick = (w: World, e: Enemy, n = 1): void => {
  for (let i = 0; i < n; i++) {
    w.time += DT
    updateEnemy(w, e, DT)
    syncEnemyVisual(e, 1, w.time)
  }
}

/** Step until the Guardroid starts a telegraph (or give up). */
const untilTele = (w: World, e: Enemy, max = 600): void => {
  for (let i = 0; i < max && e.state !== 'tele'; i++) tick(w, e)
}

describe('the rush', () => {
  it('from range it winds up a RED (unblockable) rush', () => {
    const { w, e } = setup(9)
    untilTele(w, e)
    expect(e.attack).toBe('rush')
    expect(e.teleRed).toBe(true)
  })

  it('charges along the line locked at the wind-up, and a hit is unblockable', () => {
    const { w, e, hitPlayer } = setup(9)
    untilTele(w, e)
    tick(w, e, Math.ceil(e.teleDur / DT) + Math.ceil(BRUTE_RUSH_TIME / DT))
    expect(hitPlayer).toHaveBeenCalledTimes(1)
    const opts = (hitPlayer.mock.calls[0] as unknown[])[2] as { blockable: boolean }
    expect(opts.blockable).toBe(false)
  })

  it('a step aside after the lock is a clean dodge: the rush runs past', () => {
    const { w, e, hitPlayer } = setup(9)
    untilTele(w, e)
    tick(w, e, Math.ceil(e.teleDur / DT) + 1)
    expect(e.state).toBe('act')
    w.player.x += 3 // sidestep, too late for it to turn
    tick(w, e, Math.ceil(BRUTE_RUSH_TIME / DT) + 2)
    expect(hitPlayer).not.toHaveBeenCalled()
    expect(e.z).toBeGreaterThan(30 + 6) // it really went
  })

  it('into a wall it staggers', () => {
    // Flux behind a wall row at z 36..39 (row 12): the charge meets the wall.
    const { w, e } = setup(9, false, field(12))
    e.z = 32
    w.player.z = 41
    untilTele(w, e)
    // The wall blocks sight, so force the wind-up the AI would do in the open.
    if (e.state !== 'tele') { e.attack = 'rush'; e.teleDur = 0.8; e.teleRed = true; e.state = 'tele'; e.st = 0 }
    tick(w, e, Math.ceil(e.teleDur / DT) + 30)
    expect(e.state).toBe('stun')
    expect(e.stunT).toBeGreaterThan(BRUTE_WALL_STUN - 0.6)
  })

  it('never rushes from point-blank or from beyond its reach', () => {
    for (const dist of [2, BRUTE_RUSH_MAX + 4]) {
      const { w, e } = setup(dist)
      untilTele(w, e, 30)
      expect(e.attack).not.toBe('rush')
    }
    expect(BRUTE_RUSH_MIN).toBeGreaterThan(3.2) // above the punch range
  })
})

describe('the elite arm cannon', () => {
  it('an elite fires blockable fans of shots from range', () => {
    // Try several seeds of the dice: the elite picks rush or volley.
    let fired = 0
    for (let k = 0; k < 8 && !fired; k++) {
      const { w, e, fireEnemyShot } = setup(14, true)
      tick(w, e, 60 * 6)
      fired = fireEnemyShot.mock.calls.length
      if (fired) {
        expect(fired % 3).toBe(0)
        // Straight bullets (no world-height arc): blockable by the rule.
        expect(fireEnemyShot.mock.calls.every(c => c[9] === undefined)).toBe(true)
        expect(shotBlockable('enemy')).toBe(true)
      }
    }
    expect(fired).toBeGreaterThanOrEqual(3)
  })

  it('a normal Guardroid never shoots', () => {
    const { w, e, fireEnemyShot } = setup(14)
    tick(w, e, 60 * 8)
    expect(fireEnemyShot).not.toHaveBeenCalled()
  })
})
