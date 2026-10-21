// @vitest-environment jsdom
// The Puffer Matriarch's spines stay rooted in her skin, each pointing
// straight out along the skin's normal, whatever she does: they ride the
// body rigidly (tumbling with her roll) and only grow out along that normal
// as she swells. Her bounce's roll advances with the ground she covers, and
// rolling into Flux still lands.

import { describe, expect, it, vi } from 'vitest'

vi.mock('@/game/world/textures', async (orig) => {
  const { Texture } = await import('three')
  return { ...(await orig<object>()), glowTexture: () => new Texture(), ringTexture: () => new Texture() }
})
import { Matrix4, Vector3 } from 'three'
import {
  buildPufferMatriarch, newPufferPose, posePufferMatriarch, MATRIARCH_SPINES, MATRIARCH_R, MATRIARCH_SCALE, MATRIARCH_SPINE_TIP
} from '@/game/models/miniBoss/pufferMatriarch'
import { generateMap, cellCenter } from '@/game/world/levelGen'
import { createNav } from '@/game/world/nav'
import { createMiniBoss, startMiniBoss, updateMiniBoss, syncMiniBoss } from '@/game/sim/miniBosses'
import type { MiniBossSpec } from '@/game/sim/miniBoss/types'
import { PUFFER_MATRIARCH, BOUNCE_HIT_R, type PufferMem } from '@/game/sim/miniBoss/pufferMatriarch'
import type { World } from '@/game/sim/world'
import { mulberry32 } from '@/game/world/rng'
import { PLAYER_R } from '@/game/sim/constants'

/** Each spine's root and axis in the BODY bone's frame (unit axis). */
const spinesInBody = (rig: ReturnType<typeof buildPufferMatriarch>) => {
  rig.root.updateMatrixWorld(true)
  const inv = new Matrix4().copy(rig.bones.body!.matrixWorld).invert()
  const out: Array<{ root: Vector3; axis: Vector3; len: number }> = []
  for (let i = 0; i < MATRIARCH_SPINES; i++) {
    const m = new Matrix4().multiplyMatrices(inv, rig.bones[`sp${i}`]!.matrixWorld)
    const root = new Vector3().setFromMatrixPosition(m)
    const tip = new Vector3(0, 1, 0).applyMatrix4(m)
    const axis = tip.clone().sub(root)
    out.push({ root, axis: axis.clone().normalize(), len: axis.length() })
  }
  return out
}

describe('the Puffer Matriarch\'s spines', () => {
  it('point straight out of her skin, fixed to the body, through swell and roll', () => {
    const rig = buildPufferMatriarch()
    const p = newPufferPose()
    const rest = spinesInBody(rig)
    expect(rest.length).toBeGreaterThan(20)
    for (const s of rest) {
      // The axis is the skin's outward normal at the root (a sphere's: the
      // root's own direction), the root just inside the skin.
      expect(s.axis.dot(s.root.clone().normalize())).toBeGreaterThan(0.999)
      expect(s.root.length()).toBeGreaterThan(MATRIARCH_R * 0.85)
      expect(s.root.length()).toBeLessThan(MATRIARCH_R)
    }
    // Not all aimed one way (the old bug: every spine along the facing).
    const mean = rest.reduce((a, s) => a.add(s.axis), new Vector3()).divideScalar(rest.length)
    expect(mean.length()).toBeLessThan(0.4)

    let lastWorld: Vector3 | null = null
    for (const [swell, roll] of [[0, 0], [1, 0.7], [1, 2.4], [0.5, 5.1], [1, 9.3]] as const) {
      p.swell = swell
      p.roll = roll
      p.time = roll
      posePufferMatriarch(rig, p)
      const now = spinesInBody(rig)
      for (let i = 0; i < now.length; i++) {
        expect(now[i]!.axis.dot(rest[i]!.axis)).toBeGreaterThan(0.999)
        expect(now[i]!.root.distanceTo(rest[i]!.root)).toBeLessThan(1e-6)
        // The swell only grows it out of its root.
        expect(now[i]!.len).toBeCloseTo(1 + 0.35 * swell, 5)
      }
      // ...while in the world it tumbles with her roll.
      const wd = new Vector3(0, 1, 0).transformDirection(rig.bones.sp0!.matrixWorld)
      if (lastWorld) expect(wd.dot(lastWorld)).toBeLessThan(0.999)
      lastWorld = wd
    }
  })
})

describe('her bounce', () => {
  it('rolls with the ground she covers and still hits Flux on contact', () => {
    const roll = vi.spyOn(Math, 'random').mockImplementation(mulberry32(2))
    const map = generateMap({ seed: 4242, rooms: 9, boss: false, challenge: true })
    const ch = map.challenge!
    const room = map.rooms[ch.room]!
    const e = createMiniBoss(PUFFER_MATRIARCH as MiniBossSpec, 8, cellCenter(ch.at[0]), cellCenter(ch.at[1]), room)
    const stub = () => {}
    let contact = 0
    const hitAt: number[] = []
    const markR: number[] = []
    let maxTurn = 0
    const w = {
      map, nav: createNav(map), time: 0,
      player: { x: e.x, z: e.z, yaw: 0, pitch: 0 },
      combat: {}, enemies: [e],
      fx: { emit: stub, sparks: stub, orbBurst: stub, flash: stub, riseRing: stub },
      markers: { spawn: (_x: number, _z: number, r: number) => { if (e.state === 'tele' && e.attack === 'bounce') markR.push(r) } }, shocks: { spawn: stub, spawnLinear: stub },
      hitPlayer: (_s: unknown, _d: number, h: { parryable?: boolean; kind?: string }) => {
        if (e.state === 'act' && e.attack === 'bounce' && h.kind === 'melee') {
          contact++
          hitAt.push(Math.hypot(w.player.x - e.x, w.player.z - e.z))
          expect(h.parryable).toBe(true)
        }
        return 'hit'
      },
      pull: stub, fireEnemyShot: stub, spawnRing: stub,
      shake: stub, sfx: stub, lobShell: stub, spawnWave: stub, fireOrb: stub
    } as unknown as World
    startMiniBoss(e)
    const swollen = MATRIARCH_R * 1.5 * MATRIARCH_SCALE
    let rolled = 0
    const dt = 1 / 60
    for (let k = 0; k < 90 / dt; k++) {
      const m = e.challenge!.mem as PufferMem
      const bouncing = e.state === 'act' && e.attack === 'bounce'
      const [r0, run0, y0] = [m.pose.roll, m.run, e.yaw]
      // Flux stands just ahead of her on the route while she winds up a bounce.
      if (e.state === 'tele' && e.attack === 'bounce' && m.route.length >= 4) {
        w.player.x = m.route[2]!
        w.player.z = m.route[3]!
      }
      updateMiniBoss(w, e, dt)
      syncMiniBoss(e, 1, k * dt)
      if (bouncing && e.state === 'act') {
        expect(m.pose.roll - r0).toBeCloseTo((m.run - run0) / swollen, 6)
        rolled += m.pose.roll - r0
        maxTurn = Math.max(maxTurn, Math.abs(Math.atan2(Math.sin(e.yaw - y0), Math.cos(e.yaw - y0))))
      }
    }
    roll.mockRestore()
    expect(rolled).toBeGreaterThan(1)
    expect(contact).toBeGreaterThan(0)
    // Her contact reaches most of the way out along her swollen spines...
    const swollenTip = MATRIARCH_SPINE_TIP * 1.5 * MATRIARCH_SCALE
    expect(BOUNCE_HIT_R).toBeGreaterThan(swollen + 0.7 * (swollenTip - swollen))
    expect(BOUNCE_HIT_R).toBeLessThan(swollenTip)
    for (const d of hitAt) expect(d).toBeLessThan(BOUNCE_HIT_R + PLAYER_R + 0.2)
    // ...and her route's floor marks are drawn that wide (the warning matches).
    expect(markR.length).toBeGreaterThan(0)
    for (const r of markR) expect(r).toBe(BOUNCE_HIT_R)
    // Her heading swings onto each new leg in a short turn, never one snap.
    expect(maxTurn).toBeGreaterThan(0)
    expect(maxTurn).toBeLessThanOrEqual(12 / 60 + 1e-9)
  })
})
