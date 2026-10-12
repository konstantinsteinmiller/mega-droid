// The humanoid bosses' motion layer (models/bosses.ts: poseBoss with a motion
// record; sim: stepMotion after every updateBoss tick), asserted headless on
// the REAL boss AI. What it replaced: the Masters and the Scrapper stood with
// their arms 18° out to the sides (an A-pose) whenever they were not
// attacking — through their entrance, their walk and after every attack — and
// walked on a clock-driven leg swing that skated 93 % of the distance.
// The act poses (the telegraph wind-up, the strike, airborne, dizzy) must stay
// exactly as they were, and without the motion record (ModelLab, store art)
// `poseBoss` must render byte-for-byte as before.

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/game/fx/markers', async () => {
  const { Mesh, Group } = await import('three')
  return { makeBlobShadow: () => new Mesh(), makeTeleRing: () => new Group(), setTeleRing: () => {} }
})

import { Matrix4, Vector3 } from 'three'
import { createBoss, startBossIntro, updateBoss, syncBossVisual } from '@/game/sim/bosses'
import { stepMotion } from '@/game/sim/enemies'
import { buildBossRig, poseBoss, type BossId, type BossAct } from '@/game/models/bosses'
import { poseVex } from '@/game/models/vexMk1'
import { newMotion, BOSS_FIDGET_LEN, BOSS_GAIT, cycleLen, swingA, frac, TAU, type EnemyMotion } from '@/game/models/motion'
import { pose, nudge, scaleBone, type Rig } from '@/game/models/kit'
import { createNav } from '@/game/world/nav'
import type { MapData } from '@/game/world/levelGen'
import type { Enemy, World } from '@/game/sim/world'

const HUMANOIDS: BossId[] = ['scrapper', 'blazeMaster', 'frostMaster', 'voltMaster', 'galeMaster', 'magnetMaster', 'drillMaster', 'tideMaster', 'neonMaster', 'rotorMaster']
const ACTS: BossAct[] = ['idle', 'walk', 'tele', 'attack', 'stun', 'air']
const DT = 1 / 60
const DEG = 180 / Math.PI

/** HEAD's poseBoss for the humanoid bosses, verbatim: the oracle for the
 *  no-motion path and the act poses. (Dr. Vex's own pose: vexRig.test.ts.) */
const legacyPoseBoss = (rig: Rig, id: BossId, t: number, act: BossAct, k: number): void => {
  const walk = act === 'walk' ? 1 : 0
  const w = Math.sin(t * 7) * walk
  pose(rig, 'hipL', w * 0.5, 0, 0)
  pose(rig, 'hipR', -w * 0.5, 0, 0)
  pose(rig, 'kneeL', Math.max(0, -w) * 0.6, 0, 0)
  pose(rig, 'kneeR', Math.max(0, w) * 0.6, 0, 0)
  const bob = Math.sin(t * 2.2) * 0.012
  if (act === 'tele') {
    nudge(rig, 'hips', 0, -0.08 * k + bob, 0)
    pose(rig, 'shoulderL', 0.8 * k, 0, -0.4 * k)
    pose(rig, 'shoulderR', 0.8 * k, 0, 0.4 * k)
    pose(rig, 'elbowL', -0.8 * k, 0, 0)
    pose(rig, 'elbowR', -0.8 * k, 0, 0)
    pose(rig, 'chest', 0.2 * k, 0, 0)
    pose(rig, 'head', -0.15 * k, 0, 0)
  } else if (act === 'attack') {
    const e = 1 - k
    nudge(rig, 'hips', 0, bob, 0)
    pose(rig, 'shoulderL', -1.5 * e, 0, -0.1)
    pose(rig, 'shoulderR', -1.5 * e, 0, 0.1)
    pose(rig, 'elbowL', -0.1, 0, 0)
    pose(rig, 'elbowR', -0.1, 0, 0)
    pose(rig, 'chest', -0.12 * e, 0, 0)
    pose(rig, 'head', 0, 0, 0)
  } else if (act === 'air') {
    nudge(rig, 'hips', 0, bob, 0)
    pose(rig, 'shoulderL', -2.6, 0, -0.3)
    pose(rig, 'shoulderR', -2.6, 0, 0.3)
    pose(rig, 'kneeL', 0.9, 0, 0)
    pose(rig, 'kneeR', 0.9, 0, 0)
    pose(rig, 'hipL', -0.6, 0, 0)
    pose(rig, 'hipR', -0.6, 0, 0)
  } else if (act === 'stun') {
    nudge(rig, 'hips', 0, -0.05, 0)
    pose(rig, 'chest', 0.35, Math.sin(t * 8) * 0.2, 0)
    pose(rig, 'head', 0.3, Math.sin(t * 9) * 0.4, 0)
    pose(rig, 'shoulderL', 0.3, 0, -0.6)
    pose(rig, 'shoulderR', 0.3, 0, 0.6)
  } else {
    nudge(rig, 'hips', 0, bob, 0)
    pose(rig, 'chest', 0, Math.sin(t * 0.8) * 0.1, 0)
    pose(rig, 'head', 0, Math.sin(t * 0.8) * 0.15, 0)
    pose(rig, 'shoulderL', 0.1, 0, -0.35 + Math.sin(t * 2) * 0.05)
    pose(rig, 'shoulderR', 0.1, 0, 0.35 - Math.sin(t * 2) * 0.05)
    pose(rig, 'elbowL', -0.5, 0, 0)
    pose(rig, 'elbowR', -0.5, 0, 0)
  }
}

const rigs = new Map<BossId, [Rig, Rig]>()
/** Two fresh rigs of a boss, reset to their bind pose. */
const pair = (id: BossId): [Rig, Rig] => {
  let rs = rigs.get(id)
  if (!rs) {
    rs = [buildBossRig(id), buildBossRig(id)]
    rigs.set(id, rs)
  }
  for (const r of rs) {
    for (const n of Object.keys(r.bones)) {
      pose(r, n)
      nudge(r, n)
      scaleBone(r, n, 1)
    }
  }
  return rs
}

const snap = (rig: Rig): number[] => {
  const out: number[] = []
  for (const b of Object.values(rig.bones)) {
    out.push(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w, b.position.x, b.position.y, b.position.z, b.scale.x, b.scale.y, b.scale.z)
  }
  return out
}

const rng = (seed: number) => () => {
  seed = (Math.imul(seed ^ (seed >>> 15), 2246822507) + 0x9e3779b9) >>> 0
  seed ^= seed >>> 13
  return (seed >>> 0) / 4294967296
}

/** A motion record mid-life: walking some, maybe mid-taunt, looking about. */
const randomMotion = (id: BossId, r: () => number): EnemyMotion => {
  const m = newMotion(Math.floor(r() * 1e6))
  const n = BOSS_FIDGET_LEN[id].length
  m.walk = r()
  m.stride = r() * 1e4
  m.phase = r() * 1e4
  m.fwd = r() * 2 - 1
  m.side = r() * 2 - 1
  m.turn = (r() * 2 - 1) * 6
  m.calm = r()
  m.dash = r() < 0.2 ? r() : 0
  m.fid = n ? Math.floor(r() * (n + 1)) : 0
  m.fidT = m.fid ? r() * BOSS_FIDGET_LEN[id][m.fid - 1]! : 0
  return m
}

const openWorld = (enemies: Enemy[]): World => {
  const W = 40
  const map = { w: W, h: W, cell: new Uint8Array(W * W).fill(1), pillars: [], room: new Int16Array(W * W), rooms: [] } as unknown as MapData
  const noop = (): void => {}
  return {
    map, nav: createNav(map), time: 0,
    player: { x: 60, z: 37, yaw: Math.PI, pitch: 0 },
    combat: { iframes: 1e9 } as World['combat'],
    enemies,
    fx: { sparks: noop, emit: noop, orbBurst: noop, riseRing: noop } as unknown as World['fx'],
    markers: { spawn: noop } as unknown as World['markers'],
    shocks: { spawn: noop } as unknown as World['shocks'],
    fireEnemyShot: noop, lobShell: noop, spawnWave: noop, spawnRing: noop, fireOrb: noop,
    hitPlayer: () => 'miss', shake: noop, sfx: noop
  }
}

/** A boss dropped into an open field (entrance done), facing the player. */
const arena = (id: BossId, seed = 11): { w: World; e: Enemy } => {
  const e = createBoss(id, 1, 60, 30, 0)
  e.mo = newMotion(seed, 'brute')
  const w = openWorld([e])
  startBossIntro(e)
  return { w, e }
}

const tick = (w: World, e: Enemy, n = 1): void => {
  for (let i = 0; i < n; i++) {
    w.time += DT
    updateBoss(w, e, DT, null)
    syncBossVisual(e, 1)
  }
}

const armAngles = (rig: Rig, side: 'L' | 'R'): { outward: number; forward: number } => {
  rig.root.updateMatrixWorld(true)
  const inv = new Matrix4().copy(rig.root.matrixWorld).invert()
  const s = rig.bones[`shoulder${side}`]!.getWorldPosition(new Vector3()).applyMatrix4(inv)
  const el = rig.bones[`elbow${side}`]!.getWorldPosition(new Vector3()).applyMatrix4(inv)
  const up = el.sub(s).normalize()
  const sgn = side === 'L' ? -1 : 1
  return { outward: Math.atan2(up.x * sgn, -up.y) * DEG, forward: Math.atan2(up.z, -up.y) * DEG }
}

describe('boss motion: poses', () => {
  it('without the motion record render byte-for-byte as before (ModelLab, store art)', () => {
    for (const id of HUMANOIDS) {
      for (const act of ACTS) {
        for (const [t, k] of [[0, 0], [1.3, 0.4], [7.9, 1], [33.3, 0.75]] as const) {
          const [a, b] = pair(id)
          legacyPoseBoss(a, id, t, act, k)
          poseBoss(b, id, t, act, k)
          expect(snap(b), `${id} ${act} ${t} ${k}`).toEqual(snap(a))
        }
      }
    }
  })

  it('Dr. Vex keeps his own hover even with a motion record', () => {
    const r = rng(3)
    for (const act of ACTS) {
      const [a, b] = pair('vexMk1')
      const m = randomMotion('vexMk1', r)
      poseVex(a, 4.2, act, 0.6, m)
      poseBoss(b, 'vexMk1', 4.2, act, 0.6, m)
      expect(snap(b), act).toEqual(snap(a))
    }
  })

  it('the telegraph, strike, airborne and dizzy key poses are exactly the old ones', () => {
    const r = rng(77)
    const BONES = ['hips', 'hipL', 'hipR', 'kneeL', 'kneeR', 'chest', 'head', 'shoulderL', 'shoulderR', 'elbowL', 'elbowR', 'spine']
    for (const id of HUMANOIDS) {
      for (let i = 0; i < 12; i++) {
        const t = r() * 50
        const cases: Array<[BossAct, number, number, number, string[]]> = [
          // [act, k, air, daze, bones the old act sets]
          ['tele', 1, 0, 0, BONES],
          ['attack', 0, 0, 0, BONES],
          ['air', 1, 1, 0, ['hips', 'hipL', 'hipR', 'kneeL', 'kneeR', 'shoulderL', 'shoulderR']],
          ['stun', 0, 0, 1, ['hips', 'hipL', 'hipR', 'kneeL', 'kneeR', 'chest', 'head', 'shoulderL', 'shoulderR']]
        ]
        for (const [act, k, air, daze, bones] of cases) {
          const [a, b] = pair(id)
          legacyPoseBoss(a, id, t, act, k)
          const m = randomMotion(id, r)
          m.air = air
          m.daze = daze
          poseBoss(b, id, t, act, k, m)
          for (const n of bones) {
            const ba = a.bones[n]
            const bb = b.bones[n]
            if (!ba || !bb) continue // the Scrapper has no spine
            expect(bb.quaternion.angleTo(ba.quaternion), `${id} ${act} ${n}`).toBeLessThan(1e-6)
            expect(bb.position.distanceTo(ba.position), `${id} ${act} ${n}`).toBeLessThan(1e-9)
          }
        }
      }
    }
  })

  it('no humanoid boss stands in the A-pose any more (the old idle was 18° out)', () => {
    const r = rng(5)
    for (const id of HUMANOIDS) {
      const [, b] = pair(id)
      for (let i = 0; i < 40; i++) {
        const m = newMotion(i, 'brute')
        m.calm = r()
        poseBoss(b, id, r() * 60, r() < 0.5 ? 'idle' : 'walk', 0, m)
        for (const side of ['L', 'R'] as const) {
          const a = armAngles(b, side)
          // Arms carried forward (≈33°), barely out (≈6°): the old idle held
          // them 18° out and 5° back
          expect(a.outward, `${id} ${side} outward`).toBeLessThanOrEqual(8)
          expect(a.forward, `${id} ${side} forward`).toBeGreaterThanOrEqual(20)
        }
      }
      // The old idle, for the record
      const [a] = pair(id)
      legacyPoseBoss(a, id, 0, 'idle', 0)
      expect(armAngles(a, 'L').outward).toBeGreaterThan(15)
    }
  })

  it('every taunt starts and ends exactly at the no-taunt pose, and moves in between', () => {
    const r = rng(8)
    for (const id of HUMANOIDS) {
      const lens = BOSS_FIDGET_LEN[id]
      for (let fid = 1; fid <= lens.length; fid++) {
        const [a, b] = pair(id)
        const base = newMotion(fid * 31, 'brute')
        Object.assign(base, { calm: 1, walk: 0, fid: 0, fidT: 0 })
        const t = r() * 40
        poseBoss(a, id, t, 'idle', 0, base)
        const ref = snap(a)
        for (const at of [0, lens[fid - 1]!]) {
          poseBoss(b, id, t, 'idle', 0, { ...base, fid, fidT: at })
          const got = snap(b)
          for (let j = 0; j < ref.length; j++) expect(got[j]!, `${id} taunt ${fid} at ${at}`).toBeCloseTo(ref[j]!, 12)
        }
        let most = 0
        for (const q of [0.25, 0.5, 0.7]) {
          poseBoss(b, id, t, 'idle', 0, { ...base, fid, fidT: lens[fid - 1]! * q })
          most = Math.max(most, ...snap(b).map((v, j) => Math.abs(v - ref[j]!)))
        }
        expect(most, `${id} taunt ${fid} moves`).toBeGreaterThan(1e-3)
      }
    }
  })
})

describe('boss motion: in the fight', () => {
  // The boss AI rolls Math.random (its attack picks, its cooldowns): every
  // test here replays ONE fixed fight, so a result never depends on the run.
  beforeEach(() => {
    const dice = vi.spyOn(Math, 'random').mockImplementation(rng(0x5eed))
    return () => dice.mockRestore()
  })

  it("walks on its OWN legs: the stride per metre uses the boss leg and scale, not the Guardroid's", () => {
    for (const id of ['blazeMaster', 'scrapper'] as const) {
      // A scripted straight walk at the boss's speed, through the real stepMotion
      const e = createBoss(id, 1, 60, 30, 0)
      e.state = 'engage'
      e.yaw = 0
      const v = e.def.speed
      const walk = (n: number) => {
        for (let i = 0; i < n; i++) {
          e.px = e.x
          e.pz = e.z
          e.mo.pyaw = e.yaw
          e.z += v * DT
          stepMotion(e, DT)
        }
      }
      walk(90)
      const s0 = e.mo.stride
      const z0 = e.z
      walk(180)
      const got = (e.mo.stride - s0) / (e.z - z0)
      const g = BOSS_GAIT[id]!
      const want = TAU / (cycleLen(g, swingA(g, 1, 0)) * e.rig.root.scale.x)
      expect(got / want, id).toBeCloseTo(1, 2)
      // …in floor metres: a Master's rig is drawn ×1.35 (unscaled legs would
      // step 35 % too often and skate)
      if (id !== 'scrapper') {
        const unscaled = TAU / cycleLen(g, swingA(g, 1, 0))
        expect(Math.abs(got / unscaled - 1), `${id} uses its drawn size`).toBeGreaterThan(0.2)
      }
    }
  })

  // It circles the player facing it (≈0.35–0.43 rad/s at 7 m), which swings
  // a planted foot round the body's centre — 4–6 % of slip for the Scrapper's
  // wide stance that no gait removes without foot IK — and its strafe flips
  // direction on a timer. Scripted, a straight or sideways walk slips 1–2 %.
  it('planted feet while it strafes: the stance sole slips < 12 % of the ground covered (was 93 %)', () => {
    for (const id of ['blazeMaster', 'scrapper'] as const) {
      const { w, e } = arena(id)
      for (let i = 0; i < 400 && e.state !== 'engage'; i++) tick(w, e)
      e.cd = 999
      tick(w, e, 60)
      const g = BOSS_GAIT[id]!
      const sole: [number, number, number] = id === 'scrapper' ? [0, -0.62, 0.06] : [0, -0.335, 0.045]
      let slip = 0
      let travel = 0
      let prev: { leg: string; x: number; z: number } | null = null
      let bx = e.x
      let bz = e.z
      for (let i = 0; i < 150; i++) {
        tick(w, e)
        travel += Math.hypot(e.x - bx, e.z - bz)
        bx = e.x
        bz = e.z
        const u = frac(e.mo.phase / TAU)
        const leg = u < g.beta ? 'kneeL' : 'kneeR'
        e.root.updateMatrixWorld(true)
        const s = e.rig.bones[leg]!.localToWorld(new Vector3(...sole))
        if (prev && prev.leg === leg) slip += Math.hypot(s.x - prev.x, s.z - prev.z)
        prev = { leg, x: s.x, z: s.z }
      }
      expect(travel).toBeGreaterThan(3)
      expect(slip / travel, id).toBeLessThan(0.12)
    }
  })

  // 0.25 rad in one tick is a visible snap (the machines' old heli tilt
  // jumped 0.33). The legs get their own ceiling: a Master strafing at full
  // speed runs its stride at the per-tick cap (0.55 rad of phase, stepMotion),
  // and its hip then sweeps up to A·0.55 / (2·(1 − β)) = 0.275 rad in a tick BY
  // DESIGN — 300 random fights peaked at 0.265, the upper body at 0.18. A leg
  // that snaps across its stride jumps ≥ 2·A ≈ 1 rad.
  const SNAP = 0.25
  const LEG_SNAP = 0.35
  const LEG = /^(hip|knee)[LR]$/
  it.each(HUMANOIDS)('%s: no pops from the entrance through telegraphs, attacks and recoveries', (id) => {
    const { w, e } = arena(id, 23)
    tick(w, e) // the first frame poses the rig out of its bind pose
    const bones = Object.values(e.rig.bones)
    let pq = bones.map(b => b.quaternion.clone())
    let pp = bones.map(b => b.position.clone())
    let worstR = { v: 0, at: '' }
    let worstLeg = { v: 0, at: '' }
    let worstP = { v: 0, at: '' }
    const states = new Set<string>()
    let prev = e.state
    for (let i = 0; i < 60 * 16; i++) {
      tick(w, e)
      states.add(e.state)
      // The strike's first frame snaps from the wind-up by design (as before)
      const strike = e.state === 'act' && prev !== 'act'
      if (!strike) {
        bones.forEach((b, j) => {
          const dr = b.quaternion.angleTo(pq[j]!)
          const dp = b.position.distanceTo(pp[j]!)
          const at = `${b.name} ${prev}→${e.state} ${e.attack} st ${e.st.toFixed(2)}`
          if (LEG.test(b.name)) {
            if (dr > worstLeg.v) worstLeg = { v: dr, at }
          } else if (dr > worstR.v) worstR = { v: dr, at }
          if (dp > worstP.v) worstP = { v: dp, at }
        })
      }
      pq = bones.map(b => b.quaternion.clone())
      pp = bones.map(b => b.position.clone())
      prev = e.state
    }
    for (const s of ['alert', 'engage', 'tele', 'act', 'recover']) expect(states.has(s), `${id} reached ${s}`).toBe(true)
    expect(worstR.v, `${id} rotation per tick: ${worstR.at}`).toBeLessThan(SNAP)
    expect(worstLeg.v, `${id} leg rotation per tick: ${worstLeg.at}`).toBeLessThan(LEG_SNAP)
    expect(worstP.v, `${id} offset per tick: ${worstP.at}`).toBeLessThan(0.08)
  })

  it('taunts play only in the recovery after an attack — never in the entrance, a telegraph or an attack', () => {
    let played = 0
    for (const id of HUMANOIDS) {
      const { w, e } = arena(id, 5)
      for (let i = 0; i < 60 * 25; i++) {
        tick(w, e)
        if (e.mo.fid) {
          expect(['recover', 'engage'], `${id} taunting in ${e.state}`).toContain(e.state)
          if (e.state === 'recover') played++
        }
        if (e.state === 'alert') {
          // The entrance (the name card's moment): the plain ready stance
          expect(e.mo.fid).toBe(0)
        }
      }
    }
    expect(played, 'some taunt played').toBeGreaterThan(0)
  })

  it('the entrance shows the ready stance, not the A-pose', () => {
    for (const id of HUMANOIDS) {
      const { w, e } = arena(id)
      tick(w, e, Math.round(1.6 / DT)) // landed, name card up
      expect(e.state).toBe('alert')
      for (const side of ['L', 'R'] as const) {
        expect(armAngles(e.rig, side).outward, `${id} ${side}`).toBeLessThanOrEqual(8)
        expect(armAngles(e.rig, side).forward, `${id} ${side}`).toBeGreaterThanOrEqual(20)
      }
    }
  })
})
