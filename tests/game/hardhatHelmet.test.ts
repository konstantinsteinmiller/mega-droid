// A Hardhat under its helmet (#124): a charge shot or a special weapon
// breaks the guard but does only 30 % of its damage; other guards keep 70 %.
// Weak spots (data/weakspots.ts, sim/combat.ts): every machine and every
// Core Master has one; a shot fired with the crosshair on it lands there for
// ×1.5 and the amber KRANCK!, while a shot the auto-aim steered never does,
// however close it passes. A back, a tail or a core is only open from behind.

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
import { createEnemy } from '@/game/sim/enemies'
import { CombatSystem, GUARD_BROKEN, HARDHAT_COVERED, type CombatHost } from '@/game/sim/combat'
import { createNav } from '@/game/world/nav'
import type { MapData } from '@/game/world/levelGen'
import { THEMES } from '@/game/world/themes'
import { hudEvents } from '@/game/state/hud'
import type { Enemy, World } from '@/game/sim/world'
import type { EnemyKind } from '@/game/models/enemies'

const DT = 1 / 60
const noop = (): void => {}

beforeEach(() => {
  let seed = 11
  const dice = vi.spyOn(Math, 'random').mockImplementation(() => ((seed = (seed * 16807) % 2147483647) / 2147483647))
  hudEvents.length = 0
  return () => dice.mockRestore()
})

// ─── In combat ───────────────────────────────────────────────────────────────

const W = 20
const openMap = (): MapData => {
  const cell = new Uint8Array(W * W).fill(1)
  return { w: W, h: W, cell, pillars: [], room: new Int16Array(W * W), rooms: [], doors: [] } as unknown as MapData
}

/** A turret (it never moves, its core on its back) at (30, 30), a real CombatSystem. */
const setup = (kind: EnemyKind): { sys: CombatSystem; e: Enemy } => {
  const map = openMap()
  const e = createEnemy(kind, 1, 30, 30, 0, { theme: THEMES.scrapyard })
  e.hp = e.maxHp = 1e6
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
    hitPlayer: () => 'miss', shake: noop, sfx: vi.fn()
  } as unknown as World & CombatHost
  return { sys: new CombatSystem(w), e }
}


const hit = (kind: EnemyKind, o: { charge: number; special?: boolean }): number => {
  const { sys, e } = setup(kind)
  e.guard = 1
  e.yaw = 0
  e.awake = true
  const hp0 = e.hp
  sys.damageEnemy(e, 40, { crit: false, fromX: 30, fromZ: 38, x: 30, y: 1, z: 30, color: '#fff', ...o })
  return (hp0 - e.hp) / (40 * e.def.armor)
}

describe('a guard broken by a charge shot or a special weapon', () => {
  it('a Hardhat under its helmet takes 30 %', () => {
    expect(hit('hardhat', { charge: 2 })).toBeCloseTo(HARDHAT_COVERED, 1)
    expect(hit('hardhat', { charge: 0, special: true })).toBeCloseTo(HARDHAT_COVERED, 1)
  })
  it('a Trooper behind its shield still takes 70 %', () => {
    expect(hit('trooper', { charge: 2 })).toBeCloseTo(GUARD_BROKEN, 1)
  })
})
