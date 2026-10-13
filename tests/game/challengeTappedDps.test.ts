// @vitest-environment jsdom
// Every challenge mini-boss can be worn down by tapped shots alone (#153): no
// shield, burrow, blink or spin may hold off plain buster taps for long. A
// real CombatSystem fires a tap every 0.2 s from Flux at its body (the aim
// assist's homing, no weak-spot aim) for 20 s of its fight, Flux standing in
// front of it or circling it.

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/game/world/textures', async (orig) => {
  const { Texture } = await import('three')
  return { ...(await orig<object>()), glowTexture: () => new Texture(), ringTexture: () => new Texture() }
})
import { Scene } from 'three'
import { generateMap, cellCenter, CELL } from '@/game/world/levelGen'
import { createNav } from '@/game/world/nav'
import { createMiniBoss, startMiniBoss, updateMiniBoss } from '@/game/sim/miniBosses'
import { MINI_BOSSES } from '@/game/sim/miniBoss/registry'
import type { MiniBossSpec } from '@/game/sim/miniBoss/types'
import { CombatSystem, type CombatHost } from '@/game/sim/combat'
import { EYE_H } from '@/game/sim/constants'
import type { Enemy, World } from '@/game/sim/world'
import { ICEBREAKER_BRUTE } from '@/game/sim/miniBoss/icebreakerBrute'
import en from '@/i18n/locales/en'

beforeEach(() => {
  let seed = 7
  const dice = vi.spyOn(Math, 'random').mockImplementation(() => ((seed = (seed * 16807) % 2147483647) / 2147483647))
  return () => dice.mockRestore()
})

/** The longest stretch tapped fire may do nothing to it (s). */
const MAX_IMMUNE = 7

/**
 * Tap at `spec` for `secs` after its entrance: Flux `orbit` m from the
 * room's middle, circling at `speed` rad/s (0: standing still). Returns the
 * damage dealt and the longest stretch without any.
 */
const tapFight = (spec: MiniBossSpec, secs: number, o: { orbit: number; speed: number; seed?: number }) => {
  const map = generateMap({ seed: o.seed ?? 4242, rooms: 9, boss: false, challenge: true })
  const ch = map.challenge!
  const room = map.rooms[ch.room]!
  const e = createMiniBoss(spec, 8, cellCenter(ch.at[0]), cellCenter(ch.at[1]), room)
  const cx = (room.x0 + room.w / 2) * CELL
  const cz = (room.z0 + room.h / 2) * CELL
  const stub = (): void => {}
  const w = {
    scene: new Scene(), map, nav: createNav(map), time: 0,
    player: { x: cx + o.orbit, z: cz, y: 0, yaw: 0, pitch: 0 },
    combat: { iframes: 1e9, charging: false, charge: 0 }, enemies: [e],
    fx: { emit: stub, sparks: stub, orbBurst: stub, flash: stub, riseRing: stub },
    markers: { spawn: stub }, shocks: { spawn: stub, spawnLinear: stub },
    stats: { critChance: 0, critMul: 1.5, piercing: false, boltMul: 1, magnetMul: 1, parryBonus: 0, busterDmg: 10, chargeTimeMul: 1 },
    hitStop: 0,
    onEnemyKilled: stub, onPickup: stub, onPlayerHurt: stub, onPlayerDown: stub,
    hitPlayer: () => 'hit', slowPlayer: stub, pull: stub,
    addEnemy: (d: Enemy) => { w.enemies.push(d) },
    shake: stub, sfx: stub, fireEnemyShot: stub, lobShell: stub, spawnWave: stub, spawnRing: stub, fireOrb: stub
  } as unknown as World & CombatHost & { enemies: Enemy[] }
  const sys = new CombatSystem(w)
  startMiniBoss(e)
  const dt = 1 / 60
  let t = 0
  // Through its entrance first (hits only TINK off it then).
  while (e.state === 'alert' && t < 10) { updateMiniBoss(w, e, dt); t += dt }
  e.hp = e.maxHp = 1e6
  let since = 0
  let longest = 0
  let fireIn = 0
  for (let k = 0; k < secs / dt; k++) {
    t += dt
    w.time = t
    if (o.speed) {
      w.player.x = cx + Math.cos(t * o.speed) * o.orbit
      w.player.z = cz + Math.sin(t * o.speed) * o.orbit
    }
    updateMiniBoss(w, e, dt)
    fireIn -= dt
    if (fireIn <= 0 && !e.offstage) {
      fireIn = 0.2
      const ey = e.y + (e.floor ?? 0) + e.def.aimY
      const dx = e.x - w.player.x
      const dy = ey - EYE_H
      const dz = e.z - w.player.z
      const l = Math.hypot(dx, dy, dz) || 1
      sys.spawnPlayerShot('pellet', w.player.x + (dx / l) * 0.6, EYE_H, w.player.z + (dz / l) * 0.6, dx / l, dy / l, dz / l, 10, false, e)
    }
    const hp = e.hp
    sys.update(dt)
    since = e.hp < hp ? 0 : since + dt
    longest = Math.max(longest, since)
  }
  return { dealt: e.maxHp - e.hp, longest }
}

describe('tapped shots against every challenge mini-boss (#153)', () => {
  for (const [sector, spec] of Object.entries(MINI_BOSSES)) {
    it(`${sector}: ${spec.id} takes damage from taps, never shut out for long`, () => {
      for (const o of [{ orbit: 4, speed: 0 }, { orbit: 4, speed: 0.6 }, { orbit: 6, speed: -0.4, seed: 777 }]) {
        const r = tapFight(spec, 20, o)
        expect(r.dealt / 20, `${spec.id} dps ${JSON.stringify(o)}`).toBeGreaterThan(0)
        expect(r.longest, `${spec.id} longest immune ${JSON.stringify(o)}`).toBeLessThan(MAX_IMMUNE)
      }
    })
  }
})

describe('a mini-boss guard tells the player (#153)', () => {
  it('every guard has a one-time hint in the locale, saying what gets through', () => {
    const guard = (en as unknown as { miniboss: { guard: Record<string, string> } }).miniboss.guard
    for (const spec of Object.values(MINI_BOSSES)) {
      if (!spec.behaviour.guarded) continue
      expect(spec.guardHint, spec.id).toBe(`miniboss.guard.${spec.id}`)
      expect(guard[spec.id], spec.id).toMatch(/charge/)
    }
  })

  it("a tap off the Icebreaker's shield flares in its colour and names it to the hint", () => {
    const map = generateMap({ seed: 4242, rooms: 9, boss: false, challenge: true })
    const room = map.rooms[map.challenge!.room]!
    const e = createMiniBoss(ICEBREAKER_BRUTE as MiniBossSpec, 8, 30, 30, room)
    startMiniBoss(e)
    e.state = 'act'
    e.yaw = 0
    ;(e.challenge!.mem as { shieldUp: boolean }).shieldUp = true
    const flash = vi.fn()
    const onDeflect = vi.fn()
    const stub = (): void => {}
    const w = {
      scene: new Scene(), map, nav: createNav(map), time: 0, player: { x: 30, z: 34, y: 0 }, enemies: [e],
      fx: { emit: stub, sparks: stub, orbBurst: stub, flash, riseRing: stub },
      stats: { critChance: 0, critMul: 1.5, piercing: false }, hitStop: 0, sfx: stub, shake: stub, onDeflect
    } as unknown as World & CombatHost
    const sys = new CombatSystem(w)
    const hp = e.hp
    sys.damageEnemy(e, 10, { crit: false, charge: 0, fromX: 30, fromZ: 34, x: 30, y: 1.9, z: 31, color: '#fff' })
    expect(e.hp).toBe(hp)
    expect(onDeflect).toHaveBeenCalledWith(e)
    expect(flash).toHaveBeenCalledWith(30, 1.9, 31, ICEBREAKER_BRUTE.def.color, expect.any(Number), expect.any(Number))
    // From behind, the same tap lands.
    sys.damageEnemy(e, 10, { crit: false, charge: 0, fromX: 30, fromZ: 26, x: 30, y: 1.9, z: 29, color: '#fff' })
    expect(e.hp).toBeLessThan(hp)
  })
})
