// The Masters' motion layer v2 (#183: models/bossAnim.ts) and the blend kit
// every animated body shares (models/spring.ts), asserted headless on the
// REAL boss AI. What it replaced: one wind-up crouch and one two-arm thrust
// for every attack, a strike that snapped from the wind-up in one frame, a
// linear 0.25 s recovery, a stiff landing, a blink that popped. Now each
// pattern has its own wind-up, held pose and release accent, every weight is
// a spring, and the layer only ever READS the fight (hit timing unchanged).

import { describe, expect, it, vi } from 'vitest'

vi.mock('@/game/fx/markers', async () => {
  const { Mesh, Group } = await import('three')
  return { makeBlobShadow: () => new Mesh(), makeTeleRing: () => new Group(), setTeleRing: () => {} }
})

import { Quaternion, Vector3 } from 'three'
import { createBoss, startBossIntro, updateBoss, syncBossVisual } from '@/game/sim/bosses'
import { BOSSES } from '@/game/data/bosses'
import type { BossId } from '@/game/models/bosses'
import { newMotion } from '@/game/models/motion'
import {
  ATTACK_STYLE, HEAD_RATE, HEAD_REACH, newBossAnim, stepBossAnim, styleKeys, styleOf, windCurve, type BossStyle
} from '@/game/models/bossAnim'
import {
  newSpring, springTo, kickSpring, kickPeak, stepResponse, springPulse, newPulse, firePulse, stepPulse, turnToward
} from '@/game/models/spring'
import { createNav } from '@/game/world/nav'
import { armKickAt } from '@/game/sim/grandMaster'
import type { MapData } from '@/game/world/levelGen'
import type { Enemy, World } from '@/game/sim/world'

const HUMANOIDS: BossId[] = ['scrapper', 'blazeMaster', 'frostMaster', 'voltMaster', 'galeMaster', 'magnetMaster', 'drillMaster', 'tideMaster', 'neonMaster', 'rotorMaster']
const DT = 1 / 60

const rng = (seed: number) => () => {
  seed = (Math.imul(seed ^ (seed >>> 15), 2246822507) + 0x9e3779b9) >>> 0
  seed ^= seed >>> 13
  return (seed >>> 0) / 4294967296
}

interface Log { emits: number }

const openWorld = (enemies: Enemy[], log: Log = { emits: 0 }): World => {
  const W = 40
  const map = { w: W, h: W, cell: new Uint8Array(W * W).fill(1), pillars: [], room: new Int16Array(W * W), rooms: [] } as unknown as MapData
  const noop = (): void => {}
  return {
    map, nav: createNav(map), time: 0,
    player: { x: 60, z: 36, yaw: Math.PI, pitch: 0 },
    combat: { iframes: 1e9 } as World['combat'],
    enemies,
    fx: { sparks: noop, emit: () => { log.emits++ }, orbBurst: noop, riseRing: noop } as unknown as World['fx'],
    markers: { spawn: noop } as unknown as World['markers'],
    shocks: { spawn: noop } as unknown as World['shocks'],
    fireEnemyShot: noop, lobShell: noop, spawnWave: noop, spawnRing: noop, fireOrb: noop, pull: noop,
    hitPlayer: () => 'miss', shake: noop, sfx: noop
  } as unknown as World
}

/** Boss `id` past its entrance, only ever picking `attack`. */
const forced = (id: BossId, attack: string, log?: Log): { w: World; e: Enemy } => {
  const e = createBoss(id, 1, 60, 30, 0)
  e.mo = newMotion(31, 'brute')
  e.def = { ...e.def, patterns: [attack], patterns2: [] } as typeof e.def
  const w = openWorld([e], log)
  startBossIntro(e)
  for (let i = 0; i < 600 && e.state !== 'engage'; i++) tick(w, e)
  e.cd = 0.05
  return { w, e }
}

const tick = (w: World, e: Enemy, n = 1): void => {
  for (let i = 0; i < n; i++) {
    w.time += DT
    updateBoss(w, e, DT, null)
    syncBossVisual(e, 1)
  }
}

/** One tick's rotation as a vector (axis × angle, rad). */
const angularStep = (from: Quaternion, to: Quaternion): Vector3 => {
  const d = from.clone().invert().multiply(to)
  if (d.w < 0) d.set(-d.x, -d.y, -d.z, -d.w)
  const ang = 2 * Math.acos(Math.min(1, d.w))
  const s = Math.sqrt(Math.max(0, 1 - d.w * d.w))
  return s < 1e-9 ? new Vector3() : new Vector3(d.x / s, d.y / s, d.z / s).multiplyScalar(ang)
}

describe('the blend kit (models/spring.ts)', () => {
  it('springTo is the exact solution: one 1/30 s step lands where two 1/60 s steps do', () => {
    for (const [hz, z] of [[2, 0.4], [5, 0.72], [9, 1], [3, 1.4]] as const) {
      const a = { x: 0.3, v: -2 }
      const b = { x: 0.3, v: -2 }
      springTo(a, 1, hz, z, 1 / 30)
      springTo(b, 1, hz, z, 1 / 60)
      springTo(b, 1, hz, z, 1 / 60)
      expect(a.x, `${hz} ${z}`).toBeCloseTo(b.x, 9)
      expect(a.v, `${hz} ${z}`).toBeCloseTo(b.v, 7)
    }
  })

  it('arrives without overshoot critically damped, and overshoots by the damping ratio below it', () => {
    const peak = (z: number): number => {
      const s = newSpring()
      let top = 0
      for (let i = 0; i < 600; i++) top = Math.max(top, springTo(s, 1, 4, z, DT))
      expect(s.x, `settles (zeta ${z})`).toBeCloseTo(1, 4)
      return top
    }
    expect(peak(1)).toBeLessThanOrEqual(1 + 1e-9)
    for (const z of [0.4, 0.6]) {
      const want = 1 + Math.exp(-Math.PI * z / Math.sqrt(1 - z * z))
      expect(peak(z), `zeta ${z}`).toBeCloseTo(want, 2)
    }
  })

  it('a kick peaks where kickPeak says, and rings back to rest', () => {
    const s = newSpring()
    kickSpring(s, 5)
    let top = 0
    for (let i = 0; i < 4000; i++) top = Math.max(top, springTo(s, 0, 3, 0.5, 1 / 2000))
    expect(top).toBeCloseTo(kickPeak(5, 3, 0.5), 3)
    expect(Math.abs(s.x)).toBeLessThan(1e-3)
  })

  it('stepResponse starts at rest (no jump, no kink), overshoots under-damped, and settles at 1', () => {
    expect(stepResponse(0, 5, 0.5)).toBe(0)
    expect(stepResponse(-1, 5, 0.5)).toBe(0)
    // Zero slope at the start: a millisecond in, it has barely moved
    expect(stepResponse(0.001, 5, 0.5)).toBeLessThan(0.001)
    let top = 0
    for (let t = 0; t < 2; t += 0.001) top = Math.max(top, stepResponse(t, 5, 0.5))
    expect(top).toBeGreaterThan(1.1)
    expect(stepResponse(3, 5, 0.5)).toBeCloseTo(1, 6)
    expect(stepResponse(3, 5, 1)).toBeCloseTo(1, 6)
    // The analytic curve is the stateful spring's own answer to a step
    const s = newSpring()
    for (let i = 1; i <= 30; i++) expect(springTo(s, 1, 5, 0.5, DT)).toBeCloseTo(stepResponse(i * DT, 5, 0.5), 9)
    // A push, filtered: 0 before and after, a smooth peak, a dip past 0
    expect(springPulse(0, 0.06, 6, 0.45)).toBe(0)
    expect(Math.abs(springPulse(3, 0.06, 6, 0.45))).toBeLessThan(1e-6)
    let lo = 0
    for (let t = 0; t < 1; t += 0.002) lo = Math.min(lo, springPulse(t, 0.06, 6, 0.45))
    expect(lo).toBeLessThan(-0.01)
  })

  it('a fired pulse swells from rest (never a frame-one jump), peaks at its amplitude and settles', () => {
    const p = newPulse(6, 0.45, 0.06)
    firePulse(p, 1)
    const xs: number[] = []
    for (let i = 0; i < 90; i++) xs.push(stepPulse(p, DT))
    // The first tick moves less than the next: it accelerates into it
    expect(xs[0]!).toBeLessThan(xs[1]! - xs[0]!)
    expect(Math.max(...xs)).toBeCloseTo(1, 1)
    expect(Math.abs(xs[89]!)).toBeLessThan(0.01)
    // Fired again mid-ring it goes on from where it is
    const q = newPulse(6, 0.45, 0.06)
    firePulse(q)
    for (let i = 0; i < 4; i++) stepPulse(q, DT)
    const at = q.x
    firePulse(q)
    expect(Math.abs(stepPulse(q, DT) - at)).toBeLessThan(0.35)
  })

  it('turnToward turns at no more than its rate, the short way round', () => {
    expect(turnToward(0, 1, 2, 0.1)).toBeCloseTo(0.2, 9)
    expect(turnToward(0, 0.05, 2, 0.1)).toBeCloseTo(0.05, 9)
    // From just under +π to just over −π: forward through π, not back through 0
    expect(turnToward(3.1, -3.1, 1, 0.05)).toBeGreaterThan(3.1)
  })
})

describe('boss motion v2: styles', () => {
  it('every pattern a Master, the Scrapper or Dr. Vex can pick has a style (and the roar)', () => {
    for (const def of Object.values(BOSSES)) {
      for (const p of [...def.patterns, ...def.patterns2]) expect(ATTACK_STYLE[p], `${def.id} ${p}`).toBeDefined()
    }
    expect(styleOf('roar')).toBe('nova')
  })

  it('each style winds up into a pose of its own (no two alike)', () => {
    const styles = [...new Set(Object.values(ATTACK_STYLE))] as BossStyle[]
    expect(styles.length).toBeGreaterThanOrEqual(10)
    for (let i = 0; i < styles.length; i++) {
      for (let j = i + 1; j < styles.length; j++) {
        const a = styleKeys(styles[i]!).wind
        const b = styleKeys(styles[j]!).wind
        let most = 0
        for (let c = 0; c < a.length; c++) most = Math.max(most, Math.abs(a[c]! - b[c]!))
        expect(most, `${styles[i]} vs ${styles[j]}`).toBeGreaterThan(0.35)
      }
    }
  })

  it('the wind-up builds early (the read) and deepens to the release', () => {
    expect(windCurve(0)).toBe(0)
    expect(windCurve(0.42)).toBeCloseTo(0.82, 6)
    expect(windCurve(1)).toBeCloseTo(1, 6)
    for (let k = 0; k < 1; k += 0.01) expect(windCurve(k + 0.01)).toBeGreaterThanOrEqual(windCurve(k))
  })
})

describe('boss motion v2: in the fight', () => {
  const ARM = /^(shoulder|elbow)[LR]$/
  const LEG = /^(hip|knee)[LR]$/
  const LIMIT = { arm: [0.75, 0.4], leg: [0.5, 0.35], body: [0.35, 0.2] } as const

  // Every pattern each humanoid has, forced one after another: the wind-up,
  // the release, the held pose, the recovery, and back to the stance.
  it.each(HUMANOIDS)('%s: every attack winds up, releases and recovers without a pop', (id) => {
    const dice = vi.spyOn(Math, 'random').mockImplementation(rng(0xa11))
    try {
      const def = BOSSES[id]
      for (const attack of [...def.patterns, ...def.patterns2]) {
        const { w, e } = forced(id, attack)
        tick(w, e)
        const bones = Object.values(e.rig.bones)
        let pq = bones.map(b => b.quaternion.clone())
        let pv = bones.map(() => new Vector3())
        let ps = e.root.scale.clone()
        let pRoot = { y: e.rig.root.position.y, x: e.rig.root.rotation.x }
        const seen = new Set<string>()
        let worst = { arm: [0, 0, ''], leg: [0, 0, ''], body: [0, 0, ''] } as Record<keyof typeof LIMIT, [number, number, string]>
        let scale = 0
        let pitch = 0
        let back = 0
        for (let i = 0; i < 60 * 6; i++) {
          tick(w, e)
          seen.add(e.state)
          if (e.state === 'act') back = 0
          else if (seen.has('act')) back++
          bones.forEach((b, j) => {
            const v = angularStep(pq[j]!, b.quaternion)
            const cls = ARM.test(b.name) ? 'arm' : LEG.test(b.name) ? 'leg' : 'body'
            const wv = worst[cls]
            const at = `${b.name} ${e.state} st ${e.st.toFixed(2)}`
            if (v.length() > wv[0]) { wv[0] = v.length(); wv[2] = at }
            wv[1] = Math.max(wv[1], v.distanceTo(pv[j]!))
            pv[j] = v
          })
          scale = Math.max(scale, e.root.scale.distanceTo(ps))
          pitch = Math.max(pitch, Math.abs(e.rig.root.rotation.x - pRoot.x))
          ps = e.root.scale.clone()
          pRoot = { y: e.rig.root.position.y, x: e.rig.root.rotation.x }
          pq = bones.map(b => b.quaternion.clone())
          // Once it has been back on its feet a second, this pattern is done
          if (back > 60) break
        }
        for (const s of ['tele', 'act', 'recover']) expect(seen.has(s), `${id} ${attack} reached ${s}`).toBe(true)
        for (const cls of ['arm', 'leg', 'body'] as const) {
          expect(worst[cls][0], `${id} ${attack} ${cls} per tick: ${worst[cls][2]}`).toBeLessThan(LIMIT[cls][0])
          expect(worst[cls][1], `${id} ${attack} ${cls} jump in turn rate`).toBeLessThan(LIMIT[cls][1])
        }
        // The body's own squash, stretch and pitch ease too (a blink thins
        // it fastest: a beam of light in a few frames)
        expect(scale, `${id} ${attack} root scale per tick`).toBeLessThan(0.22)
        expect(pitch, `${id} ${attack} dive pitch per tick`).toBeLessThan(0.15)
        // And it is back in its stance: every weight let go
        const a = e.mo.boss!
        for (const k of ['wind', 'hold', 'strike', 'air'] as const) expect(Math.abs(a[k].x), `${id} ${attack} ${k} let go`).toBeLessThan(0.05)
        worst = { arm: [0, 0, ''], leg: [0, 0, ''], body: [0, 0, ''] }
      }
    } finally {
      dice.mockRestore()
    }
  })

  it('the layer only reads the fight: stepping it and drawing it leave every sim field as it was', () => {
    const r = rng(9)
    const FIELDS = ['x', 'z', 'y', 'px', 'pz', 'py', 'yaw', 'vx', 'vz', 'hp', 'state', 'st', 'cd', 'attack', 'step', 'teleDur',
      'stunT', 'flash', 'deathT', 'buried', 'tx', 'tz', 'sx', 'sz', 'a', 'b', 'hitPlayer', 'phase2', 'walk', 'anim'] as const
    const STATES = ['engage', 'tele', 'act', 'recover', 'stun', 'dead', 'alert']
    const ATTACKS = Object.keys(ATTACK_STYLE)
    for (const id of [...HUMANOIDS, 'vexMk1'] as BossId[]) {
      const e = createBoss(id, 1, 60, 30, 0)
      const a = newBossAnim(4)
      for (let i = 0; i < 200; i++) {
        e.state = STATES[Math.floor(r() * STATES.length)] as Enemy['state']
        e.attack = ATTACKS[Math.floor(r() * ATTACKS.length)]!
        e.st = r() * 2
        e.step = Math.floor(r() * 4)
        e.x += (r() - 0.5) * 0.3
        e.y = r() < 0.3 ? r() * 4 : 0
        e.flash = r() < 0.2 ? 1 : 0
        e.buried = r() < 0.1
        e.mo.walk = r()
        e.mo.stride += r()
        const before = FIELDS.map(f => (e as unknown as Record<string, unknown>)[f])
        stepBossAnim(a, e, e.mo, e.def.fly, 2, 60 + r() * 5, 36, DT)
        e.mo.boss = a
        syncBossVisual(e, r())
        const after = FIELDS.map(f => (e as unknown as Record<string, unknown>)[f])
        expect(after, `${id} ${e.state} ${e.attack}`).toEqual(before)
      }
    }
  })

  it('a leap lands with a squash (the whole body, from its feet) and dust, then stands up out of it', () => {
    const dice = vi.spyOn(Math, 'random').mockImplementation(rng(5))
    try {
      for (const id of ['blazeMaster', 'scrapper'] as const) {
        const log = { emits: 0 }
        const { w, e } = forced(id, id === 'scrapper' ? 'stomp' : 'leapSlam', log)
        let landed = -1
        let low = 1
        let airborne = false
        for (let i = 0; i < 400; i++) {
          const before = log.emits
          tick(w, e)
          if (e.y > 1) airborne = true
          if (airborne && landed < 0 && e.y <= 0.01) {
            landed = i
            // The dust ring went out on the landing tick
            expect(log.emits - before, `${id} dust`).toBeGreaterThanOrEqual(12)
          }
          if (landed >= 0 && i - landed < 20) low = Math.min(low, e.root.scale.y)
          if (landed >= 0 && i - landed > 80) break
        }
        expect(landed, `${id} landed`).toBeGreaterThan(0)
        expect(low, `${id} squashed`).toBeLessThan(0.95)
        expect(e.root.scale.y, `${id} stood back up`).toBeCloseTo(1, 1)
        // …on its feet: the sole of the lower leg on the floor through it
        expect(e.mo.boss!.land.x).toBeLessThan(0.1)
      }
    } finally {
      dice.mockRestore()
    }
  })

  it('a blink folds in and phases out before the swap, is never seen at the swap, and forms again', () => {
    const dice = vi.spyOn(Math, 'random').mockImplementation(rng(12))
    try {
      const { w, e } = forced('voltMaster', 'blink')
      // Cells round it (3 m each): somewhere 5–10 m from Flux to land on
      const room = { x0: 17, z0: 8, w: 8, h: 8 }
      let swapAt = -1
      let thinBefore = 1
      let seenAtSwap = false
      for (let i = 0; i < 300; i++) {
        const x0 = e.x
        const z0 = e.z
        w.time += DT
        updateBoss(w, e, DT, room as never)
        syncBossVisual(e, 1)
        if (e.state === 'tele') thinBefore = Math.min(thinBefore, e.root.scale.x)
        if (swapAt < 0 && Math.hypot(e.x - x0, e.z - z0) > 1) {
          swapAt = i
          if (e.rig.root.visible) seenAtSwap = true
        }
        if (swapAt >= 0 && i === swapAt - 1 && e.rig.root.visible) seenAtSwap = true
        if (swapAt >= 0 && i - swapAt > 50) break
      }
      expect(swapAt, 'it blinked').toBeGreaterThan(0)
      expect(thinBefore, 'thinned to a line before it went').toBeLessThan(0.2)
      expect(seenAtSwap, 'drawn at the swap').toBe(false)
      expect(e.rig.root.visible).toBe(true)
      expect(e.root.scale.x).toBeCloseTo(1, 1)
    } finally {
      dice.mockRestore()
    }
  })

  it('the gaze leads: Flux steps to its side, the head turns to him first, at a servo’s capped rate', () => {
    const dice = vi.spyOn(Math, 'random').mockImplementation(rng(2))
    try {
      const { w, e } = forced('frostMaster', 'iceVolley')
      e.cd = 99
      e.def = { ...e.def, speed: 0 } as typeof e.def
      tick(w, e, 120)
      const a = e.mo.boss!
      const yaw0 = e.yaw
      // Flux jumps 80° round to its right
      const ang = e.yaw - 1.4
      w.player.x = e.x + Math.sin(ang) * 6
      w.player.z = e.z + Math.cos(ang) * 6
      let most = 0
      const head0 = a.headY.x
      tick(w, e, 6)
      let prev = a.look
      // After a tenth of a second the head has turned toward him more than the body
      expect(Math.sign(a.headY.x - head0)).toBe(-1)
      expect(Math.abs(a.headY.x - head0)).toBeGreaterThan(Math.abs(e.yaw - yaw0) * 0.5)
      for (let i = 0; i < 60; i++) {
        tick(w, e)
        most = Math.max(most, Math.abs(a.look - prev))
        prev = a.look
      }
      expect(most).toBeLessThanOrEqual(HEAD_RATE * DT + 1e-9)
      expect(Math.abs(a.look)).toBeLessThanOrEqual(HEAD_REACH + 1e-9)
    } finally {
      dice.mockRestore()
    }
  })

  it('Dr. Vex rides the same springs: no pops through any of his patterns', () => {
    const dice = vi.spyOn(Math, 'random').mockImplementation(rng(77))
    try {
      // (His hidden spark and the hologram's glitch frames jump on purpose.)
      const SKIP = new Set(['spark', 'pilot'])
      for (const attack of [...BOSSES.vexMk1.patterns, ...BOSSES.vexMk1.patterns2]) {
        const { w, e } = forced('vexMk1', attack)
        tick(w, e)
        const bones = Object.values(e.rig.bones).filter(b => !SKIP.has(b.name))
        let pq = bones.map(b => b.quaternion.clone())
        let pv = bones.map(() => new Vector3())
        let most = 0
        let jerk = 0
        let at = ''
        let back = 0
        for (let i = 0; i < 60 * 6 && back < 60; i++) {
          tick(w, e)
          if (e.state === 'recover' || (e.state === 'engage' && back > 0)) back++
          bones.forEach((b, j) => {
            const v = angularStep(pq[j]!, b.quaternion)
            if (v.length() > most) { most = v.length(); at = `${b.name} ${e.state} ${e.st.toFixed(2)}` }
            jerk = Math.max(jerk, v.distanceTo(pv[j]!))
            pv[j] = v
          })
          pq = bones.map(b => b.quaternion.clone())
        }
        expect(most, `vex ${attack}: ${at}`).toBeLessThan(0.35)
        expect(jerk, `vex ${attack} jerk`).toBeLessThan(0.25)
      }
    } finally {
      dice.mockRestore()
    }
  })
})

describe('the Grand Master: an arm’s recoil', () => {
  it('kicks up in a few frames (it snapped to full in one), swings past its rest and is still long before that arm fires again', () => {
    expect(armKickAt(-1)).toBe(0)
    expect(armKickAt(0)).toBe(0)
    expect(armKickAt(1 / 60)).toBeLessThan(0.35)
    let top = 0
    let low = 0
    let prev = 0
    let step = 0
    for (let t = 0; t < 1; t += 1 / 60) {
      const k = armKickAt(t)
      top = Math.max(top, k)
      low = Math.min(low, k)
      step = Math.max(step, Math.abs(k - prev))
      prev = k
    }
    expect(top).toBeGreaterThan(0.85)
    expect(low).toBeLessThan(-0.05)
    expect(step).toBeLessThan(0.5)
    // Still by 0.6 s: an arm fires every 2.2 s, so its muzzle is where it was
    expect(armKickAt(0.6)).toBe(0)
    expect(armKickAt(2.2)).toBe(0)
  })
})
