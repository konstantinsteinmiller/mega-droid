// @vitest-environment jsdom
// The challenge mini-bosses' motion (#183): every pose channel of every
// module eases on a damped spring (`miniBoss/kit.ts` `sprung`), the framework
// adds a whole-body layer on the rig's root (`models/bodyDyn.ts`: a lean into
// each acceleration, a bank into turns, a flinch on a hit, a squash on a
// landing), and the oscillators whose rate changes (fins, wings, rotors, a
// top's wobble) run on integrated phases. Before, `sin(t · rate)` jumped by
// t · Δrate whenever a tell changed the rate (a Storm Hornet Queen's wings
// 2.5 rad in a tick, the Saw Gyro's gimbal half a turn), and a Steel Hound
// trotted its legs at 14 m/s through its lunge.

import { describe, expect, it, vi } from 'vitest'

vi.mock('@/game/world/textures', async (orig) => {
  const { Texture } = await import('three')
  return { ...(await orig<object>()), glowTexture: () => new Texture(), ringTexture: () => new Texture() }
})

import { Quaternion, Vector3 } from 'three'
import { generateMap, cellCenter, CELL } from '@/game/world/levelGen'
import { createNav } from '@/game/world/nav'
import { createMiniBoss, startMiniBoss, updateMiniBoss, syncMiniBoss } from '@/game/sim/miniBosses'
import { MINI_BOSSES } from '@/game/sim/miniBoss/registry'
import { sprung, ease } from '@/game/sim/miniBoss/kit'
import { newBodyDyn, stepBodyDyn, WALKER } from '@/game/models/bodyDyn'
import { newPhase, phaseAt } from '@/game/models/spring'
import type { Enemy, World } from '@/game/sim/world'

const DT = 1 / 60

const rng = (seed: number) => () => {
  seed = (Math.imul(seed ^ (seed >>> 15), 2246822507) + 0x9e3779b9) >>> 0
  seed ^= seed >>> 13
  return (seed >>> 0) / 4294967296
}

const angularStep = (from: Quaternion, to: Quaternion): Vector3 => {
  const d = from.clone().invert().multiply(to)
  if (d.w < 0) d.set(-d.x, -d.y, -d.z, -d.w)
  const ang = 2 * Math.acos(Math.min(1, d.w))
  const s = Math.sqrt(Math.max(0, 1 - d.w * d.w))
  return s < 1e-9 ? new Vector3() : new Vector3(d.x / s, d.y / s, d.z / s).multiplyScalar(ang)
}

/** A mini-boss in a supply run's challenge room, Flux circling 3 m out. */
const arena = (spec: (typeof MINI_BOSSES)[keyof typeof MINI_BOSSES]) => {
  const map = generateMap({ seed: 4242, rooms: 9, boss: false, challenge: true })
  const ch = map.challenge!
  const room = map.rooms[ch.room]!
  const e = createMiniBoss(spec, 8, cellCenter(ch.at[0]), cellCenter(ch.at[1]), room)
  const cx = (room.x0 + room.w / 2) * CELL
  const cz = (room.z0 + room.h / 2) * CELL
  const stub = () => {}
  const w = {
    map, nav: createNav(map), time: 0, player: { x: cx + 3, z: cz, yaw: 0, pitch: 0 }, combat: {}, enemies: [e],
    fx: { emit: stub, sparks: stub, orbBurst: stub, flash: stub, riseRing: stub },
    markers: { spawn: stub, release: stub }, shocks: { spawn: stub, spawnLinear: stub },
    hitPlayer: () => 'hit', slowPlayer: stub, pull: stub, addEnemy: (d: Enemy) => { w.enemies.push(d) },
    shake: stub, sfx: stub, fireEnemyShot: stub, lobShell: stub, spawnWave: stub, spawnRing: stub, fireOrb: stub
  } as unknown as World & { enemies: Enemy[] }
  let t = 0
  const tick = () => {
    t += DT
    w.time = t
    w.player.x = cx + Math.cos(t * 0.6) * 3
    w.player.z = cz + Math.sin(t * 0.6) * 3
    updateMiniBoss(w, e, DT)
    syncMiniBoss(e, 1, t)
  }
  startMiniBoss(e)
  return { e, w, tick }
}

describe('mini-boss motion: the helpers', () => {
  it('sprung arrives about when ease does, but starts gently and swings a little past', () => {
    let a = 0
    let b = 0
    const vel = {}
    const xs: number[] = []
    for (let i = 0; i < 60; i++) {
      a = ease(a, 1, 12, DT)
      b = sprung(b, vel, 'k', 1, 12, DT)
      xs.push(b)
    }
    // The first tick: ease jumps 20 % of the way at once; the spring eases in
    expect(xs[0]!).toBeLessThan(0.1)
    expect(Math.max(...xs)).toBeGreaterThan(1.02)
    expect(b).toBeCloseTo(1, 2)
    expect(a).toBeCloseTo(1, 2)
  })

  it('an integrated phase never jumps when its rate does (sin(t · rate) did, by t · Δrate)', () => {
    const p = newPhase()
    let prev = phaseAt(p, 20, 7)
    for (let i = 1; i <= 120; i++) {
      const rate = i < 60 ? 7 : 11 // the fins beat faster: the swell
      const ph = phaseAt(p, 20 + i * DT, rate)
      expect(ph - prev).toBeCloseTo(rate * DT, 9)
      prev = ph
    }
    // The old way: a 4 rad/s faster beat at t = 20 s moved the fin 80 rad
    expect(Math.abs(20 * 11 - 20 * 7)).toBeGreaterThan(50)
  })

  it('the body layer leans into a start, rocks back on a stop, flinches on a hit and squashes on a landing', () => {
    const b = newBodyDyn(1.2)
    const body = { x: 0, z: 0, px: 0, pz: 0, y: 0, yaw: 0, flash: 0, state: 'engage' }
    const step = (vz: number, n: number): number[] => {
      const out: number[] = []
      for (let i = 0; i < n; i++) {
        body.px = body.x
        body.pz = body.z
        body.z += vz * DT
        stepBodyDyn(b, body, WALKER, DT)
        out.push(b.pitch)
      }
      return out
    }
    expect(Math.max(...step(10, 30))).toBeGreaterThan(0.03)
    expect(Math.min(...step(0, 30))).toBeLessThan(-0.03)
    step(0, 120)
    expect(Math.abs(b.pitch)).toBeLessThan(0.005)
    body.flash = 1
    const hit = step(0, 20)
    expect(Math.min(...hit)).toBeLessThan(-0.04)
    body.flash = 0
    body.y = 2
    step(0, 5)
    body.y = 0
    let low = 0
    for (let i = 0; i < 20; i++) {
      step(0, 1)
      low = Math.min(low, b.sq)
    }
    expect(low).toBeLessThan(-0.05)
    step(0, 120)
    expect(Math.abs(b.sq)).toBeLessThan(0.002)
  })
})

describe('mini-boss motion: in the fight', () => {
  // Parts that SPIN (rotors, a top's skirt and gimbal, a drill bit) turn fast by design;
  // the Burrow Wyrm's segments and the Puffer Matriarch's escorts are laid
  // where the sim's path puts them (re-laid underground, released as mines).
  const SPIN = /^(rotor[LR]|gimbal|spin|skirt|drill|seg\d+|esc\d+|wheel)$/
  it.each(Object.keys(MINI_BOSSES))('%s: no pops in its pose or its body through 25 s of fight', (sector) => {
    const dice = vi.spyOn(Math, 'random').mockImplementation(rng(0x5eed))
    try {
      const spec = MINI_BOSSES[sector as keyof typeof MINI_BOSSES]
      const { e, tick } = arena(spec)
      tick()
      const bones = Object.values(e.rig.bones).filter(b => !SPIN.test(b.name))
      let pq = bones.map(b => b.quaternion.clone())
      let pv = bones.map(() => new Vector3())
      let prq = e.rig.root.quaternion.clone()
      let ps = e.rig.root.scale.clone()
      let worst = 0
      let jerk = 0
      let at = ''
      let root = 0
      let scale = 0
      const states = new Set<string>()
      for (let i = 0; i < 60 * 25; i++) {
        tick()
        states.add(e.state)
        // Hit now and then (the flinch), never killed
        if (i % 240 === 120) e.flash = 1
        bones.forEach((b, j) => {
          const v = angularStep(pq[j]!, b.quaternion)
          if (v.length() > worst) { worst = v.length(); at = `${b.name} ${e.state} ${e.attack} st ${e.st.toFixed(2)}` }
          jerk = Math.max(jerk, v.distanceTo(pv[j]!))
          pv[j] = v
        })
        root = Math.max(root, angularStep(prq, e.rig.root.quaternion).length())
        scale = Math.max(scale, e.rig.root.scale.distanceTo(ps))
        prq = e.rig.root.quaternion.clone()
        ps = e.rig.root.scale.clone()
        pq = bones.map(b => b.quaternion.clone())
      }
      for (const s of ['engage', 'tele', 'act']) expect(states.has(s), `${sector} reached ${s}`).toBe(true)
      expect(worst, `${sector} per tick: ${at}`).toBeLessThan(0.6)
      expect(jerk, `${sector} jump in turn rate`).toBeLessThan(0.6)
      // The whole-body layer: weight, never a cut
      expect(root, `${sector} body tilt per tick`).toBeLessThan(0.06)
      expect(scale, `${sector} body squash per tick`).toBeLessThan(0.04)
    } finally {
      dice.mockRestore()
    }
  })

  it('the Steel Hound leans into its lunge, and holds its legs out through it instead of trotting', () => {
    const dice = vi.spyOn(Math, 'random').mockImplementation(rng(3))
    try {
      const { e, tick } = arena(MINI_BOSSES.blaze)
      let lean = 0
      let lunges = 0
      let was = e.state
      for (let i = 0; i < 60 * 30 && lunges < 2; i++) {
        tick()
        if (e.state === 'act' && e.attack === 'lunge') lean = Math.max(lean, e.mo.body!.pitch)
        if (was === 'act' && e.state !== 'act' && e.attack === 'lunge') lunges++
        was = e.state
      }
      expect(lunges).toBeGreaterThan(0)
      expect(lean).toBeGreaterThan(0.02)
    } finally {
      dice.mockRestore()
    }
  })
})
