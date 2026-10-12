import { Color, Euler, Quaternion, Vector3 } from 'three'
import { RigBuilder, sph, ell, cap, torus, rcyl, rcone, rbox, dome, pose, nudge, scaleBone, type Rig, type V3 } from '../kit'

/**
 * ─── The Arc Spider (the Volt Grid's challenge mini-boss) ────────────────────
 *
 * A spider drone the size of a car: a low armoured thorax in hazard yellow
 * and gunmetal, a head with a cluster of glowing eyes and two pincer fangs,
 * six long jointed legs that rise high over the body and come down to
 * needle feet, and behind it the abdomen — a glowing electric coil wound in
 * copper rings, its spinneret at the tail. Nothing of the Volt Master's
 * android: it hugs the walls, rears up, spits and skitters.
 *
 * One skinned rig (`models/kit.ts`): each leg is three bones (hip, knee,
 * foot), so the pose can swing, lift and fold it. It walks on two tripods
 * (front and rear of one side with the middle of the other), the way a real
 * spider does. The pose (`SpiderPose`) takes the AI's tells, every one BIG:
 * rearing up on its hind legs with the coil curled under (pylons), sinking
 * low with the fangs wide and the coil pumping (web), the legs drumming the
 * floor (the skitter dash); the coil glows brighter through each (`heat`).
 *
 * Proportions at scale 1: body ~0.85 m off the floor, ~3.5 m leg tip to tip.
 */

export const SPIDER_COLORS = {
  shell: '#2b3142',
  plate: '#f2c62e',
  copper: '#c9772f',
  joint: '#5d6680',
  coil: '#86ecff',
  eye: '#d2fbff',
  fang: '#e9edf5'
}

/** Drawn this much over its build size (hit volume, weak spot at this size). */
export const SPIDER_SCALE = 1.25

export interface SpiderPose {
  /** Locomotion: how much it is running, and its gait phase (radians). */
  run: number
  phase: number
  /** Rearing up on its hind legs, the coil curled under (the pylon throw). */
  rear: number
  /** Sunk low, fangs wide, coil pumping (the web spit's wind-up). */
  crouch: number
  /** The spit itself: head thrown forward. */
  spit: number
  /** The legs drumming before a dash (0..1), and the dash itself. */
  drum: number
  dash: number
  /** The coil's glow: 1 at rest, up to ~2.4 at a tell's peak. */
  heat: number
  dying: number
  time: number
}

export const newSpiderPose = (): SpiderPose => ({ run: 0, phase: 0, rear: 0, crouch: 0, spit: 0, drum: 0, dash: 0, heat: 1, dying: 0, time: 0 })

const BODY_Y = 0.85
/** The legs: where each hip sits on the thorax (z) and how far it fans
 *  forward (+) or back (−) from straight out (rad). */
const LEGS: ReadonlyArray<{ z: number; fan: number }> = [
  { z: 0.3, fan: 0.75 },
  { z: 0.02, fan: 0.08 },
  { z: -0.26, fan: -0.65 }
]
/** Hip → knee (up and out) and knee → foot (down and out), in the leg's frame. */
const FEMUR: V3 = [0.62, 0.52, 0]
const TIBIA: V3 = [0.78, -1.37, 0]

/** Which tripod each leg walks in (front and rear of one side with the
 *  middle of the other). */
export const tripodOf = (i: number, side: -1 | 1): 0 | 1 => ((i % 2 === 1) === (side > 0) ? 0 : 1)

const _q = new Quaternion()
const _e = new Euler()
const _a = new Vector3()
const _b = new Vector3()
const UP = new Vector3(0, 1, 0)

/** A capsule from `from` to `to` (bone space), as a part's p and r. */
const along = (from: V3, to: V3): { p: V3; r: V3; len: number } => {
  _a.set(from[0], from[1], from[2])
  _b.set(to[0], to[1], to[2]).sub(_a)
  const len = _b.length()
  _q.setFromUnitVectors(UP, _b.normalize())
  _e.setFromQuaternion(_q)
  return { p: [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2], r: [_e.x, _e.y, _e.z], len }
}

const seg = (b: RigBuilder, bone: string, from: V3, to: V3, r: number, color: string): void => {
  const a = along(from, to)
  b.part(bone, cap(r, Math.max(0.01, a.len - 2 * r), 8, 2), color, { p: a.p, r: a.r })
}

export const buildArcSpider = (c = SPIDER_COLORS): Rig => {
  const rig = arcSpiderParts(c).build({ outline: 0.02, height: 1.35 * SPIDER_SCALE })
  rig.root.scale.setScalar(SPIDER_SCALE)
  return rig
}

/** The spider's rig, not yet built (the z-fighting test reads its parts). */
export const arcSpiderParts = (c = SPIDER_COLORS): RigBuilder => {
  const b = new RigBuilder()
  b.bone('root', null, [0, 0, 0])
    .bone('body', 'root', [0, BODY_Y, 0])
    .bone('head', 'body', [0, 0.02, 0.42])
    .bone('abdomen', 'body', [0, 0.1, -0.42])
  b.mirror((s, t) => {
    b.bone(`fang${t}`, 'head', [s * 0.1, -0.1, 0.22])
    LEGS.forEach((l, i) => {
      b.bone(`hip${i}${t}`, 'body', [s * 0.36, -0.02, l.z], [0, -s * l.fan, 0])
        .bone(`knee${i}${t}`, `hip${i}${t}`, [s * FEMUR[0], FEMUR[1], 0])
        .bone(`foot${i}${t}`, `knee${i}${t}`, [s * TIBIA[0], TIBIA[1], 0])
    })
  })

  // ── The thorax: a low armoured shell, hazard plates on top ──
  b.part('body', rbox(0.78, 0.32, 0.86, 0.45), c.shell)
  b.part('body', ell(0.3, 0.09, 0.34), c.plate, { p: [0, 0.16, 0.02] })
  b.part('body', ell(0.34, 0.12, 0.36), c.joint, { p: [0, -0.15, 0] })
  // The hip ring the legs plug into.
  b.part('body', torus(0.42, 0.045, 6, 24), c.copper, { p: [0, -0.02, 0], r: [Math.PI / 2, 0, 0], s: [1, 1.12, 1] })

  // ── The head: an eye cluster and two fangs ──
  b.part('head', ell(0.28, 0.22, 0.26), c.shell, { p: [0, 0.02, 0.06] })
  b.part('head', ell(0.2, 0.06, 0.18), c.plate, { p: [0, 0.2, 0.05], r: [0.2, 0, 0] })
  b.mirror((s) => {
    b.part('head', sph(0.075, 10, 8), c.eye, { p: [s * 0.1, 0.09, 0.27], glow: true, outline: false })
    b.part('head', sph(0.042, 8, 6), c.eye, { p: [s * 0.2, 0.06, 0.2], glow: true, outline: false })
    b.part('head', sph(0.035, 8, 6), c.eye, { p: [s * 0.06, 0.17, 0.25], glow: true, outline: false })
  })
  b.mirror((_s, t) => {
    b.part(`fang${t}`, cap(0.05, 0.08, 8, 2), c.joint, { p: [0, -0.02, 0.03], r: [1.2, 0, 0] })
    b.part(`fang${t}`, rcone(0.045, 0.006, 0.2, 0.01, 8), c.fang, { p: [0, -0.1, 0.1], r: [2.3, 0, 0] })
  })

  // ── The abdomen: a glowing coil wound in copper, the spinneret at its tail ──
  b.part('abdomen', ell(0.36, 0.32, 0.52), c.coil, { p: [0, 0.06, -0.42], glow: true, outline: false })
  for (let k = 0; k < 5; k++) {
    const z = -0.42 + (k - 2) * 0.17
    const f = Math.sqrt(Math.max(0.05, 1 - ((z + 0.42) / 0.52) ** 2))
    b.part('abdomen', torus(0.36 * f + 0.005, 0.04, 6, 22), c.copper, { p: [0, 0.06, z], s: [1, 0.89, 1] })
  }
  b.part('abdomen', rbox(0.14, 0.07, 0.86, 0.45), c.shell, { p: [0, 0.38, -0.42] })
  b.part('abdomen', dome(0.2, Math.PI / 2, 14, 6), c.shell, { p: [0, 0.06, 0.02], r: [Math.PI / 2, 0, 0] })
  b.part('abdomen', rcone(0.13, 0.05, 0.18, 0.02, 10), c.joint, { p: [0, 0.04, -0.98], r: [-Math.PI / 2, 0, 0] })
  b.part('abdomen', sph(0.06, 8, 6), c.coil, { p: [0, 0.04, -1.08], glow: true, outline: false })

  // ── The legs: copper hips, long femurs, knee joints, needle shins ──
  b.mirror((s, t) => {
    LEGS.forEach((_l, i) => {
      const knee: V3 = [s * FEMUR[0], FEMUR[1], 0]
      b.part(`hip${i}${t}`, sph(0.1, 10, 8), c.copper)
      seg(b, `hip${i}${t}`, [s * 0.04, 0.03, 0], [knee[0] * 0.94, knee[1] * 0.94, 0], 0.065, c.shell)
      b.part(`hip${i}${t}`, ell(0.12, 0.05, 0.07), c.plate, { p: [s * 0.33, 0.27, 0], r: [0, 0, s * 0.6] })
      b.part(`knee${i}${t}`, sph(0.08, 10, 8), c.joint)
      seg(b, `knee${i}${t}`, [s * 0.03, -0.05, 0], [s * TIBIA[0] * 0.92, TIBIA[1] * 0.92, 0], 0.05, c.shell)
      const band = along([s * 0.31, -0.55, 0], [s * 0.4, -0.7, 0])
      b.part(`knee${i}${t}`, rcyl(0.055, 0.12, 0.015, 8), c.copper, { p: band.p, r: band.r })
      b.part(`foot${i}${t}`, rcone(0.045, 0.006, 0.16, 0.01, 8), c.joint, { p: [0, 0.05, 0], r: [Math.PI, 0, 0] })
    })
  })
  return b
}

const _glow = new Color()

/** Pose the spider for this frame (the AI hands over eased channels). */
export const poseArcSpider = (rig: Rig, p: SpiderPose): void => {
  const T = p.time
  const run = Math.max(p.run, p.dash)
  const low = Math.max(p.crouch, p.drum * 0.6, p.dash * 0.5) * (1 - p.rear)
  // The body: a hum at rest, a bob at the run, sunk low or reared up.
  const bob = Math.sin(T * 3.1) * 0.02 * (1 - run) + Math.abs(Math.sin(p.phase)) * 0.04 * run
  nudge(rig, 'body', 0, bob - 0.3 * low + 0.32 * p.rear - 0.45 * p.dying, -0.15 * p.rear)
  pose(rig, 'body', -0.7 * p.rear + 0.1 * p.spit + 0.15 * p.dying, Math.sin(T * 0.7) * 0.05 * (1 - run), Math.sin(T * 26) * 0.06 * p.dying)
  pose(rig, 'head', -0.25 * p.crouch + 0.35 * p.spit + 0.2 * p.rear, Math.sin(T * 1.3) * 0.1 * (1 - run - p.crouch), 0)
  // The coil: curled under the body to rear, cocked up to spit, pumping.
  const pump = 1 + 0.08 * Math.sin(T * 14) * Math.max(p.crouch, p.rear)
  scaleBone(rig, 'abdomen', pump, pump, 1)
  pose(rig, 'abdomen', 0.9 * p.rear - 0.35 * p.crouch + 0.2 * p.spit - 0.2 * p.dying + Math.sin(T * 2) * 0.04, 0, 0)
  // The fangs: a twitch at rest, wide for the spit.
  const open = Math.max(0.08 + 0.06 * Math.sin(T * 7), 0.9 * p.crouch, 0.5 * p.spit)
  pose(rig, 'fangL', 0, 0, -open)
  pose(rig, 'fangR', 0, 0, open)
  // The legs: two tripods; a step swings the leg along the body and lifts it.
  for (const [s, t] of [[-1, 'L'], [1, 'R']] as const) {
    for (let i = 0; i < 3; i++) {
      const tri = tripodOf(i, s)
      const ph = p.phase + tri * Math.PI
      const swing = Math.sin(ph) * 0.38 * run
      const lift = Math.max(0, Math.cos(ph)) * 0.45 * run
      // Drumming: fast small taps, the tripods in turn.
      const tap = Math.max(0, Math.sin(T * 26 + tri * Math.PI)) * 0.3 * p.drum
      // Rearing: the front legs reach up and out, the rear ones brace.
      const rearLift = (i === 0 ? 1.1 : i === 1 ? 0.35 : -0.25) * p.rear
      // Sinking low: the femurs flatten out, the knees fold in.
      const sink = 0.35 * low
      const idle = Math.sin(T * 1.7 + i * 1.9 + (s > 0 ? 0.8 : 0)) * 0.04 * (1 - run)
      const curl = 0.9 * p.dying
      pose(rig, `hip${i}${t}`, 0, -s * swing, s * (lift + tap + rearLift - sink + idle + curl))
      pose(rig, `knee${i}${t}`, 0, 0, s * (-0.25 * lift + 0.45 * sink - 0.35 * rearLift * (i === 0 ? 1 : 0) - 0.6 * curl))
      pose(rig, `foot${i}${t}`, 0, 0, s * (0.15 * lift - 0.4 * curl))
    }
  }
  // The coil's glow: brightens with `heat`, crackles at a tell's peak.
  const crackle = Math.random() < 0.15 * Math.min(1, p.heat - 1) ? 1.35 : 1
  const k = Math.max(0.25, p.heat * crackle * (1 - 0.7 * p.dying))
  _glow.setRGB(k * 0.95, k, k)
  rig.glowMaterial.color.copy(_glow)
}
