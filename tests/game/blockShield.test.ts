// @vitest-environment jsdom
// The block room's Trooper shot down from across the room before its first
// shot ever came: nothing was left to block, and the door (the shield raised,
// the Trooper down) stayed shut. Until the perfect block is learned, the
// Trooper takes nothing from Flux; its parried shots finish it after.

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

import { Scene } from 'three'
import { createEnemy } from '@/game/sim/enemies'
import { CombatSystem, type CombatHost } from '@/game/sim/combat'
import { Mission } from '@/game/sim/mission'
import { Training } from '@/game/sim/training'
import { createNav } from '@/game/world/nav'
import type { MapData } from '@/game/world/levelGen'
import { THEMES } from '@/game/world/themes'
import type { Enemy, World } from '@/game/sim/world'

const noop = (): void => {}
const W = 20

const combatWith = (e: Enemy, shield: (e: Enemy) => boolean): CombatSystem => {
  const cell = new Uint8Array(W * W).fill(1)
  const map = { w: W, h: W, cell, pillars: [], room: new Int16Array(W * W), rooms: [], doors: [] } as unknown as MapData
  const w = {
    scene: new Scene(), map, nav: createNav(map), time: 0,
    player: { x: 30, z: 40, yaw: Math.PI, pitch: 0 },
    combat: { iframes: 1e9, charging: false, charge: 0 } as unknown as World['combat'],
    enemies: [e],
    fx: { sparks: vi.fn(), emit: noop, orbBurst: vi.fn(), flash: noop, riseRing: noop },
    markers: { spawn: noop }, shocks: { spawn: noop, spawnLinear: noop },
    stats: { critChance: 0, critMul: 1.5, piercing: false, boltMul: 1, magnetMul: 1, parryBonus: 0, busterDmg: 10, chargeTimeMul: 1 },
    hitStop: 0,
    onEnemyKilled: vi.fn(), onPickup: noop, onPlayerHurt: noop, onPlayerDown: noop,
    fireEnemyShot: vi.fn(), lobShell: vi.fn(), spawnWave: noop, spawnRing: noop, fireOrb: noop,
    hitPlayer: () => 'miss', shake: noop, sfx: vi.fn(), lessonShield: shield
  } as unknown as World & CombatHost
  return new CombatSystem(w)
}

const trooper = (room = 2): Enemy => {
  const e = createEnemy('trooper', 1, 30, 30, room, { theme: THEMES.scrapyard })
  e.awake = true
  e.guard = 0
  return e
}

const fakeMission = (blockLearned: boolean, steps = ['block'], room = 2) => {
  const m = Object.create(Mission.prototype) as Record<string, unknown>
  const tr = new Training({ say: () => {} })
  if (blockLearned) tr.done.add('block')
  Object.assign(m, { training: tr, walk: { active: true, current: { room, steps } } })
  return m as unknown as { lessonShield(e: Enemy): boolean }
}

describe('the block room Trooper', () => {
  it('takes nothing while the lesson shields it, damage as usual otherwise', () => {
    const e = trooper()
    const hp0 = e.hp
    combatWith(e, () => true).damageEnemy(e, e.maxHp * 10, { crit: false, charge: 3, fromX: 30, fromZ: 38, x: 30, y: 1, z: 30, color: '#fff' })
    expect(e.hp).toBe(hp0)
    expect(e.state).not.toBe('dead')
    combatWith(e, () => false).damageEnemy(e, 5, { crit: false, charge: 0, fromX: 30, fromZ: 38, x: 30, y: 1, z: 30, color: '#fff' })
    expect(e.hp).toBeLessThan(hp0)
  })

  it('is shielded in its room until the perfect block is learned', () => {
    expect(fakeMission(false).lessonShield(trooper())).toBe(true)
    expect(fakeMission(true).lessonShield(trooper())).toBe(false)
    // Another room's Trooper, another lesson, or another machine: no shield.
    expect(fakeMission(false).lessonShield(trooper(5))).toBe(false)
    expect(fakeMission(false, ['slide']).lessonShield(trooper())).toBe(false)
    expect(fakeMission(false).lessonShield(createEnemy('heli', 1, 30, 30, 2, { theme: THEMES.scrapyard }))).toBe(false)
  })
})
