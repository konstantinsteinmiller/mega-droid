// The Shield Trooper's in-game acting (models/trooperAct.ts, shared with the
// intro's showcase): the sim's real hit and shot events set view-only fields
// on its EnemyMotion (`noteHit` in combat.ts, `noteShot` in its burst), and
// animateTrooper layers the reactions over gait/guard/aim. A hit moves the
// pose, a settled one leaves exactly the baseline, a crouch keeps the feet on
// the ground, and the hot path allocates nothing.

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/game/fx/markers', async () => {
  const { Mesh, Group } = await import('three')
  return { makeBlobShadow: () => new Mesh(), makeTeleRing: () => new Group(), setTeleRing: () => {} }
})
vi.mock('@/game/world/textures', async (orig) => {
  const { Texture } = await import('three')
  return { ...(await orig<object>()), glowTexture: () => new Texture(), ringTexture: () => new Texture() }
})

import { Scene, Vector3 } from 'three'
import { createEnemy, updateEnemy } from '@/game/sim/enemies'
import { CombatSystem, type CombatHost } from '@/game/sim/combat'
import { buildTrooper, poseTrooper } from '@/game/models/enemies'
import { newMotion } from '@/game/models/motion'
import {
  actBlock, actHit, actShot, actSlam, applyTrooperAct, newTrooperAct, resetTrooperAct, TROOPER_HIT_LEN
} from '@/game/models/trooperAct'
import type { Rig } from '@/game/models/kit'
import { createNav } from '@/game/world/nav'
import type { MapData } from '@/game/world/levelGen'
import { THEMES } from '@/game/world/themes'
import { hudEvents } from '@/game/state/hud'
import type { Enemy, World } from '@/game/sim/world'

const noop = (): void => {}

beforeEach(() => {
  let seed = 7
  const dice = vi.spyOn(Math, 'random').mockImplementation(() => ((seed = (seed * 16807) % 2147483647) / 2147483647))
  hudEvents.length = 0
  return () => dice.mockRestore()
})

const W = 20
const setup = (): { sys: CombatSystem; e: Enemy; w: World & CombatHost } => {
  const cell = new Uint8Array(W * W).fill(1)
  const map = { w: W, h: W, cell, pillars: [], room: new Int16Array(W * W), rooms: [], doors: [] } as unknown as MapData
  const e = createEnemy('trooper', 1, 30, 30, 0, { theme: THEMES.scrapyard })
  e.hp = e.maxHp = 1e6
  e.yaw = 0
  e.awake = true
  const w = {
    scene: new Scene(), map, nav: createNav(map), time: 0,
    player: { x: 30, z: 40, yaw: Math.PI, pitch: 0 },
    combat: { iframes: 1e9, charging: false, charge: 0 } as unknown as World['combat'],
    enemies: [e],
    fx: { sparks: noop, emit: noop, orbBurst: noop, flash: noop, riseRing: noop },
    markers: { spawn: noop }, shocks: { spawn: noop, spawnLinear: noop },
    stats: { critChance: 0, critMul: 1.5, piercing: false, boltMul: 1, magnetMul: 1, parryBonus: 0, busterDmg: 10, chargeTimeMul: 1 },
    hitStop: 0,
    onEnemyKilled: noop, onPickup: noop, onPlayerHurt: noop, onPlayerDown: noop,
    fireEnemyShot: vi.fn(), lobShell: noop, spawnWave: noop, spawnRing: noop, fireOrb: noop,
    hitPlayer: () => 'miss', shake: noop, sfx: noop
  } as unknown as World & CombatHost
  return { sys: new CombatSystem(w), e, w }
}

const shot = (fromX: number, fromZ: number, charge: number) =>
  ({ crit: false, charge, fromX, fromZ, x: 30, y: 1, z: 30, color: '#fff' })

describe('the sim sets the motion events', () => {
  it('a chip shot from its +X side: small, from +X, not blocked', () => {
    const { sys, e } = setup()
    e.guard = 0
    e.anim = 12.5
    sys.damageEnemy(e, 10, shot(38, 30, 0))
    expect(e.mo.hitT).toBe(12.5)
    expect(e.mo.hitK).toBeCloseTo(0.3)
    expect(e.mo.hitSide).toBeGreaterThan(0.95)
    expect(e.mo.hitBlock).toBe(0)
  })
  it('a full charge hits full force, from the −X side', () => {
    const { sys, e } = setup()
    e.guard = 0
    sys.damageEnemy(e, 10, shot(22, 30, 2))
    expect(e.mo.hitK).toBe(1)
    expect(e.mo.hitSide).toBeLessThan(-0.95)
  })
  it('a quick shot into the raised shield is a block', () => {
    const { sys, e } = setup()
    e.guard = 1
    const hp = e.hp
    sys.damageEnemy(e, 10, shot(30, 38, 0))
    expect(e.hp).toBe(hp)
    expect(e.mo.hitBlock).toBe(1)
    expect(Math.abs(e.mo.hitSide)).toBeLessThan(0.05)
  })
  it('each round of its burst stamps the shot clock', () => {
    const { e, w } = setup()
    e.state = 'act'
    e.st = 0
    e.step = 0
    updateEnemy(w, e, 1 / 60)
    expect(w.fireEnemyShot).toHaveBeenCalledTimes(1)
    expect(e.mo.shotT).toBe(e.anim)
  })
})

const snap = (r: Rig): number[] => {
  const out: number[] = []
  for (const b of Object.values(r.bones)) out.push(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w, b.position.y)
  return out
}
const maxDiff = (a: number[], b: number[]): number => a.reduce((m, v, i) => Math.max(m, Math.abs(v - b[i]!)), 0)

describe('animateTrooper plays the reactions', () => {
  const T0 = 20
  const at = (t: number, set?: (m: ReturnType<typeof newMotion>) => void): number[] => {
    const r = buildTrooper()
    const m = newMotion(3, 'trooper')
    m.calm = 0
    set?.(m)
    poseTrooper(r, 0.5, 0, t, 0, m)
    return snap(r)
  }
  it('a hit moves the pose, and it settles back to exactly the baseline', () => {
    const hitAt = (m: ReturnType<typeof newMotion>): void => { m.hitT = T0; m.hitK = 1; m.hitTwist = 0.5 }
    expect(maxDiff(at(T0 + 0.12, hitAt), at(T0 + 0.12))).toBeGreaterThan(0.1)
    expect(maxDiff(at(T0 + TROOPER_HIT_LEN + 0.1, hitAt), at(T0 + TROOPER_HIT_LEN + 0.1))).toBe(0)
  })
  it('a head-on hit still twists the chest, alternating sides, and settles', () => {
    const { sys, e } = setup()
    e.guard = 0
    sys.damageEnemy(e, 10, shot(30, 38, 2))
    const t1 = e.mo.hitTwist
    sys.damageEnemy(e, 10, shot(30, 38, 2))
    expect(Math.abs(t1)).toBeGreaterThan(0.3)
    expect(Math.sign(e.mo.hitTwist)).toBe(-Math.sign(t1))
    const r = buildTrooper()
    const m = newMotion(3, 'trooper')
    Object.assign(m, { calm: 0, hitT: T0, hitK: 1, hitTwist: t1 })
    poseTrooper(r, 0.5, 0, T0 + 0.12, 0, m)
    const chest = r.bones.chest!.quaternion.y
    m.hitTwist = 0
    poseTrooper(r, 0.5, 0, T0 + 0.12, 0, m)
    expect(Math.abs(chest - r.bones.chest!.quaternion.y)).toBeGreaterThan(0.03)
    const twisted = (mm: ReturnType<typeof newMotion>): void => { mm.hitT = T0; mm.hitK = 1; mm.hitTwist = t1 }
    expect(maxDiff(at(T0 + TROOPER_HIT_LEN + 0.1, twisted), at(T0 + TROOPER_HIT_LEN + 0.1))).toBe(0)
  })
  it('a chip shot moves it less than a charge; a block less than a full hit', () => {
    const base = at(T0 + 0.1)
    const big = maxDiff(at(T0 + 0.1, (m) => { m.hitT = T0; m.hitK = 1 }), base)
    const chip = maxDiff(at(T0 + 0.1, (m) => { m.hitT = T0; m.hitK = 0.3 }), base)
    const block = maxDiff(at(T0 + 0.1, (m) => { m.hitT = T0; m.hitK = 1; m.hitBlock = 1 }), base)
    expect(chip).toBeGreaterThan(0)
    expect(chip).toBeLessThan(big)
    expect(block).toBeGreaterThan(0)
    expect(block).toBeLessThan(big)
  })
  it('a shot kicks the gun arm, then settles', () => {
    const fired = (m: ReturnType<typeof newMotion>): void => { m.shotT = T0 }
    expect(maxDiff(at(T0 + 0.06, fired), at(T0 + 0.06))).toBeGreaterThan(0.05)
    expect(maxDiff(at(T0 + 1.2, fired), at(T0 + 1.2))).toBe(0)
  })
})

describe('the crouch keeps the feet planted', () => {
  const ankles = (r: Rig): Vector3[] => {
    r.root.updateMatrixWorld(true)
    return ['kneeL', 'kneeR'].map((n) => r.bones[n]!.localToWorld(new Vector3(0, -0.3, 0)))
  }
  it('within 2 cm at every crouch depth', () => {
    const r = buildTrooper()
    const m = newMotion(3, 'trooper')
    poseTrooper(r, 1, 0, 5, 0, m)
    const base = ankles(r)
    for (const c of [0.3, 0.75, 1.2]) {
      poseTrooper(r, 1, 0, 5, 0, m)
      const a = resetTrooperAct(newTrooperAct())
      a.crouch = c
      applyTrooperAct(r, a)
      const now = ankles(r)
      for (let i = 0; i < 2; i++) expect(Math.abs(now[i]!.y - base[i]!.y)).toBeLessThan(0.02)
    }
  })
})

describe('the hot path', () => {
  it('allocates nothing (no `new`, no object or array literals)', () => {
    for (const f of [actHit, actBlock, actShot, actSlam, applyTrooperAct, resetTrooperAct]) {
      expect(f.toString()).not.toMatch(/\bnew\b|\(\{|\[\s*\]/)
    }
  })
})
