// @vitest-environment jsdom
// The sky shoot (#178, `sim/skyShoot.ts`): eight blue drones circle over the
// Blaze stage's roof, the first room past the beam-in. They are harmless
// targets built for the charge shot (a half charge takes one, a quick shot
// does a third of its damage). The first one down starts an 18 s clock; all
// eight in time pays a bonus once, too slow brings a fresh ring back for
// another go, and the drones themselves pay nothing (no farm).

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/game/world/textures', async (orig) => {
  const { Texture } = await import('three')
  return { ...(await orig<object>()), levelAtlas: () => new Texture(), glowTexture: () => new Texture(), ringTexture: () => new Texture() }
})

import { SKY_DRONES, SKY_HIGH, SKY_TIME, SkyShoot, skyBonus, skyHp, slot, type SkyHost } from '@/game/sim/skyShoot'
import { SKY_PELLET } from '@/game/sim/combat'
import { generateMeltdown } from '@/game/world/stages/blaze'
import { CELL } from '@/game/world/levelGen'
import { EYE_H, PITCH_MAX } from '@/game/sim/constants'
import { baseStats } from '@/game/sim/stats'
import { hud } from '@/game/state/hud'
import { ENEMIES } from '@/game/data/enemies'
import type { Enemy } from '@/game/sim/world'

const spec = { room: 0, x: 15, z: 13.5, y: 21, r: 5.2 }

const fakeHost = () => {
  const added: Enemy[] = []
  const pickups: Array<{ kind: string; value: number }> = []
  const xp: number[] = []
  const sounds: string[] = []
  const host: SkyHost = {
    player: { x: 15, z: 22 },
    level: 6,
    stats: () => baseStats(),
    addEnemy: (e) => { added.push(e) },
    fx: { riseRing: () => {}, flash: () => {}, sparks: () => {} },
    sfx: (n) => { sounds.push(n) },
    spawnPickup: (kind, value) => { pickups.push({ kind, value }) },
    reward: (n) => { xp.push(n) }
  }
  return { host, added, pickups, xp, sounds }
}

/** Shoot drone `e` down (as the combat does: dead, then reported). */
const down = (sky: SkyShoot, e: Enemy) => {
  e.state = 'dead'
  e.hp = 0
  sky.onKilled(e)
}

beforeEach(() => {
  hud.skyT = -1
  hud.skyLeft = 0
})

describe('the ring', () => {
  it('eight harmless blue drones over the roof, never awake', () => {
    const { host, added } = fakeHost()
    const sky = new SkyShoot(host, spec)
    sky.update(0, false)
    expect(added).toHaveLength(SKY_DRONES)
    for (const e of added) {
      expect(e.sky).toBe(true)
      expect(e.awake).toBe(false)
      expect(e.kind).toBe('heli')
      expect(e.floor).toBe(spec.y)
    }
  })

  it('stays inside the roof, clear of the chimney, and within the view\'s tilt from under its middle', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const map = generateMeltdown(seed)
      const s = map.skyShoot!
      expect(s).toBeTruthy()
      const room = map.rooms[s.room]!
      for (let t = 0; t < 40; t += 0.37) {
        for (let k = 0; k < SKY_DRONES; k++) {
          const [x, z, y] = slot(s, k, t * 0.4, t)
          expect(x).toBeGreaterThan(room.x0 * CELL + 1)
          expect(x).toBeLessThan((room.x0 + room.w) * CELL - 1)
          expect(z).toBeGreaterThan(room.z0 * CELL + 1)
          expect(z).toBeLessThan((room.z0 + room.h) * CELL - 1)
          // From the ring's middle, the eye still tilts up to it.
          const up = Math.atan2(y - EYE_H, Math.hypot(x - s.x, z - s.z))
          expect(up).toBeLessThan(PITCH_MAX)
          expect(y).toBeLessThanOrEqual(SKY_HIGH + 0.3)
        }
      }
    }
  })
})

describe('built for the charge shot', () => {
  it('one half charge takes a drone; quick shots need about six', () => {
    const s = baseStats()
    const armor = ENEMIES.heli.armor
    const hp = skyHp(s, armor)
    const half = Math.round(s.busterDmg * 2.2 * s.chargeDmgMul) * armor
    expect(half).toBeGreaterThanOrEqual(hp)
    const pellet = Math.max(1, Math.round(s.busterDmg * s.pelletMul * armor * SKY_PELLET))
    expect(Math.ceil(hp / pellet)).toBeGreaterThanOrEqual(5)
    expect(Math.ceil(hp / pellet)).toBeLessThanOrEqual(8)
  })
})

describe('the toughening of the cast never reaches the ring (#199)', () => {
  it('a host that toughens every machine it takes in still gets drones one half charge takes', () => {
    const { host, added } = fakeHost()
    // What the mission does in `addEnemy`: progress, run and stage multipliers.
    const toughening: SkyHost = { ...host, addEnemy: (e) => { e.hp = e.maxHp = Math.round(e.maxHp * 3.4); host.addEnemy(e) } }
    const sky = new SkyShoot(toughening, spec)
    sky.update(0, true)
    const want = skyHp(baseStats(), ENEMIES.heli.armor)
    expect(added).toHaveLength(SKY_DRONES)
    for (const e of added) {
      expect(e.hp).toBe(want)
      expect(e.maxHp).toBe(want)
    }
    // A failed round's fresh ring is the same.
    down(sky, added[0]!)
    for (let i = 0; i < (SKY_TIME + 0.2) * 60 + 120; i++) sky.update(1 / 60, true)
    expect(added).toHaveLength(SKY_DRONES * 2)
    for (const e of added.slice(SKY_DRONES)) expect(e.hp).toBe(want)
  })
})

describe('the clock', () => {
  it('starts with the first drone down, on screen', () => {
    const { host, added, sounds } = fakeHost()
    const sky = new SkyShoot(host, spec)
    sky.update(0, true)
    for (let i = 0; i < 120; i++) sky.update(1 / 60, true)
    expect(sky.state).toBe('ready')
    expect(hud.skyT).toBe(-1)
    down(sky, added[0]!)
    sky.update(1 / 60, true)
    expect(sky.state).toBe('run')
    expect(hud.skyT).toBeGreaterThan(SKY_TIME - 0.2)
    expect(hud.skyLeft).toBe(SKY_DRONES - 1)
    expect(sounds).toContain('alert')
  })

  it('all eight in time: the bonus, once, and the ring is gone for good', () => {
    const { host, added, pickups, xp } = fakeHost()
    const sky = new SkyShoot(host, spec)
    sky.update(0, true)
    for (const e of added) {
      down(sky, e)
      for (let i = 0; i < 60; i++) sky.update(1 / 60, true)
    }
    expect(sky.state).toBe('won')
    expect(sky.won).toBe(true)
    const bonus = skyBonus(host.level)
    expect(pickups.filter(p => p.kind === 'bolt').reduce((a, p) => a + p.value, 0)).toBe(bonus.bolts)
    expect(pickups.some(p => p.kind === 'hpBig')).toBe(true)
    expect(xp).toEqual([bonus.xp])
    expect(hud.skyT).toBe(-1)
    for (let i = 0; i < 600; i++) sky.update(1 / 60, true)
    expect(added).toHaveLength(SKY_DRONES)
  })

  it('too slow: the survivors fly off, the clock goes, a fresh ring comes down', () => {
    const { host, added, pickups, xp } = fakeHost()
    const sky = new SkyShoot(host, spec)
    sky.update(0, true)
    down(sky, added[0]!)
    down(sky, added[1]!)
    for (let i = 0; i < (SKY_TIME + 0.2) * 60; i++) sky.update(1 / 60, true)
    expect(sky.state).toBe('leave')
    expect(hud.skyT).toBe(-1)
    for (let i = 0; i < 120; i++) sky.update(1 / 60, true)
    expect(sky.state).toBe('ready')
    expect(added).toHaveLength(SKY_DRONES * 2)
    expect(sky.left).toBe(SKY_DRONES)
    // The first ring's survivors are gone, quietly: nothing paid for them.
    expect(added.slice(0, SKY_DRONES).every(e => e.state === 'dead')).toBe(true)
    expect(pickups).toHaveLength(0)
    expect(xp).toHaveLength(0)
  })

  it('stands still while play does not run (a menu, a film)', () => {
    const { host, added } = fakeHost()
    const sky = new SkyShoot(host, spec)
    sky.update(0, true)
    down(sky, added[0]!)
    sky.update(1 / 60, true)
    const t = sky.clock
    for (let i = 0; i < 300; i++) sky.update(1 / 60, false)
    expect(sky.clock).toBeCloseTo(t, 5)
  })

  it('a resume after the win brings no ring back', () => {
    const { host, added } = fakeHost()
    const sky = new SkyShoot(host, spec)
    sky.markWon()
    sky.update(1 / 60, true)
    expect(added).toHaveLength(0)
  })
})
