import { Vector3, type Object3D } from 'three'
import { animateHeroWalk } from '../models/hero'
import { HERO_GAIT, cycleLen, type EnemyMotion, type GaitSpec } from '../models/motion'
import { poseToward, poseAdd, type Rig } from '../models/kit'
import { dashPose } from '../models/dash'
import { stepResponse, springPulse, pulsePeak } from '../models/spring'
import {
  ramp, STREET_RELEASE, SHOW_GUARD_UP, SHOW_GUARD_DOWN, SHOW_TROOP_SHOTS, SHOW_TROOP_FLIGHT, SHOW_SHIELD_UP, SHOW_SHIELD_DOWN,
  SHOW_ANSWER, SHOW_ANSWER_HIT, SHOW_SLIDE_FROM, SHOW_SLIDE_TO, SHOW_GEL, SHOW_GEL_BURST, SHOW_FLEE_FROM, SHOW_FLEE_TO,
  SHOW_OVER_FIRE, SHOW_OVER_HIT, SHOW_DIVE, SHOW_PARRY, SHOW_VOLLEY, SHOW_ORB_FLIGHT, SHOW_SLAM, SHOW_FINISH,
  SHOW_BIG_DROP, SHOW_BIG_LAND
} from './introScript'

/**
 * ─── Flux on the intro's street: his body, on the action clock ──────────────
 *
 * Every joint and the root, as a pure function of the street's action clock
 * (`streetTime`), so a test can step it without a GPU: the run in, the slide
 * under the Trooper's swing, the plant and the charge, then the showcase (the
 * parries, the shield, the slide under the ring, the dash away from the big
 * Guardroid, the Overload, the Repair Gel and the hero pose the end holds).
 *
 * Two rules keep him from twitching. His legs only stride while his root
 * travels, at the cadence that keeps the planted foot planted (he used to
 * mark time at 57 % of a stride through the whole showcase, standing still,
 * and the run skated at a quarter of its pace). And every move is a weighted
 * layer that turns the joints from where the layer below left them
 * (`poseToward`), never laid on from rest as its weight leaves 0: no joint
 * jumps as a move begins or ends.
 *
 * And he moves like an android now (#183), all still pure functions of the
 * clock: each arm move comes in on a spring's step answer (`settle`: it
 * starts at rest, goes a little past its mark and settles back) instead of
 * a smoothstep's glide; every shot kicks the cannon arm and rocks him back,
 * every block shoves the shield arm in; and his head works like a servo,
 * snapping to each threat a beat before his body follows (`GAZE`).
 */

/** The street's two slides (action s): under the Trooper's swing, and under
 *  its shock ring. */
export const DASH_RUN: readonly [number, number] = [1.1, 1.6]
/** How far Flux's dash away from the big Guardroid carries him (m, toward the camera). */
export const FLEE = 2.8
/** Drone 2's post for its volley, where the answer shot meets it (street space). */
export const D1_AT = new Vector3(1.4, 3.0, -8.2)

/** The run in (m/s along +z) until he drops into the slide. */
export const RUN_SPEED = 6.8
/** His sprint: a longer swing than the walk's, with a flight phase (a foot
 *  planted 40 % of the cycle). */
export const RUN_GAIT: GaitSpec = { ...HERO_GAIT, A: 0.75, beta: 0.4 }
/** Phase rate (rad / action s) at which the stance foot keeps pace with the
 *  ground: two steps cover one cycle length. */
export const RUN_CADENCE = (2 * Math.PI * RUN_SPEED) / cycleLen(RUN_GAIT, RUN_GAIT.A)
/** The stride fades out over these action seconds, into the slide's crouch. */
export const RUN_EASE: readonly [number, number] = [0.9, 1.15]

/** A spring's damping for his moves: about 10 % past the mark, then settled. */
const SETTLE_Z = 0.6

/**
 * `ramp`'s springy cousin: 0 before `a`, crossing 1 at `b` (the spring's rise
 * time fitted to the window), a little past, settling back to 1. Starts with
 * zero slope like the smoothstep it replaces, so nothing jumps.
 */
export const settle = (a: number, b: number, x: number): number => {
  const rd = Math.sqrt(1 - SETTLE_Z * SETTLE_Z)
  const hz = (Math.PI - Math.atan2(rd, SETTLE_Z)) / ((b - a) * rd * 2 * Math.PI)
  return stepResponse(x - a, hz, SETTLE_Z)
}

/** A recoil or a shove `t` s after its moment: swells in a few frames to 1,
 *  dips a little past rest and settles (0 before it). */
const KICK: readonly [number, number, number] = [0.05, 6, 0.42]
const KICK_PEAK = pulsePeak(KICK[1], KICK[2], KICK[0])
export const kickAt = (t: number): number => springPulse(t, KICK[0], KICK[1], KICK[2]) / KICK_PEAK

/** His shots (action s) and how hard each kicks: the charged shot, the
 *  answer, the point-blank full charge, the Overload. */
export const SHOTS: ReadonlyArray<readonly [number, number]> = [
  [STREET_RELEASE, 1], [SHOW_ANSWER, 0.6], [SHOW_FINISH, 1], [SHOW_OVER_FIRE, 1.5]
]
/** What his shield takes (action s) and how hard: the parry, the Trooper's
 *  two shots, drone 2's three orbs. */
export const BLOCKS: ReadonlyArray<readonly [number, number]> = [
  [SHOW_PARRY, 1],
  ...SHOW_TROOP_SHOTS.map(v => [v + SHOW_TROOP_FLIGHT, 0.7] as const),
  ...SHOW_VOLLEY.map(v => [v + SHOW_ORB_FLIGHT, 0.55] as const)
]

/**
 * Where his head points (action s, then yaw toward his +X and pitch, minus is
 * up, in his own frame): each key is a servo move, sprung, a beat before his
 * body. The turn to the Trooper led by the head; drone 1 high on one side as
 * it dives, followed down and away; drone 2 up on the other for its volley;
 * the big Guardroid's drop (a startle, up); over his shoulder as he dashes
 * away; up at its head for the Overload; the flask; chin up to end on.
 */
export const GAZE: ReadonlyArray<readonly [number, number, number]> = [
  [-99, 0, 0.05],
  [1.42, 0.55, 0],
  [1.82, 0.05, 0.05],
  [SHOW_DIVE - 0.2, 0.32, -0.45],
  [SHOW_PARRY - 0.12, 0.06, -0.05],
  [SHOW_PARRY + 0.22, 0.36, -0.08],
  [SHOW_TROOP_SHOTS[0]! - 0.4, -0.04, 0.02],
  [SHOW_SHIELD_UP - 0.45, -0.24, -0.34],
  [SHOW_ANSWER_HIT + 0.12, -0.32, -0.08],
  [SHOW_SLAM - 0.5, -0.04, 0.04],
  [SHOW_BIG_DROP - 0.05, 0.12, -0.36],
  [SHOW_BIG_LAND + 0.05, 0.04, -0.2],
  [SHOW_FLEE_FROM + 0.05, 0.62, -0.12],
  [SHOW_FLEE_TO + 0.25, 0, -0.3],
  [SHOW_OVER_HIT + 0.35, 0.02, -0.1],
  [SHOW_GEL - 0.15, -0.34, -0.24],
  [SHOW_GEL_BURST + 0.3, 0.14, -0.13]
]
/** The head's servo: quick, a hair past, exact. */
const GAZE_HZ = 3.4
const GAZE_Z = 0.62

/** His gaze at action time `st` (into `out`). */
export const gazeAt = (st: number, out: { yaw: number; pitch: number }): { yaw: number; pitch: number } => {
  let yaw = GAZE[0]![1]
  let pitch = GAZE[0]![2]
  for (let i = 1; i < GAZE.length; i++) {
    const [t, y, p] = GAZE[i]!
    if (st <= t) break
    const k = stepResponse(st - t, GAZE_HZ, GAZE_Z)
    yaw += (y - GAZE[i - 1]![1]) * k
    pitch += (p - GAZE[i - 1]![2]) * k
  }
  out.yaw = yaw
  out.pitch = pitch
  return out
}
const _gaze = { yaw: 0, pitch: 0 }

/** Where he stands along the street before the showcase (z, street space). */
export const runZ = (st: number): number => {
  if (st < DASH_RUN[0]) return -16 + RUN_SPEED * st
  if (st < DASH_RUN[1]) return -8.52 + (1 - Math.pow(1 - (st - DASH_RUN[0]) / 0.5, 2)) * 4.92
  return -3.6
}

export interface StreetFlux {
  /** How far into a dash (0..1): the intro's dust. */
  dashOn: number
  /** The shield's weight (0..1): up for each block. */
  guard: number
}

export const newStreetFlux = (): StreetFlux => ({ dashOn: 0, guard: 0 })

/** Pose Flux (`R`, on root `F`) at action time `st`. */
export const poseStreetFlux = (R: Rig, F: Object3D, m: EnemyMotion, st: number, out: StreetFlux): StreetFlux => {
  // ── The run in, the slide, the plant ──
  const z = runZ(st)
  const turn = ramp(1.6, 1.9, st)
  // The answer shot: he turns and raises the cannon at drone 2, up and to
  // the right (it used to leave straight ahead and bend to the drone).
  const ans = ramp(SHOW_ANSWER - 0.35, SHOW_ANSWER - 0.05, st) * (1 - ramp(SHOW_ANSWER_HIT + 0.2, SHOW_ANSWER_HIT + 0.6, st))
  const ry = Math.PI * turn + ans * (Math.atan2(D1_AT.x, D1_AT.z - z) - Math.PI)
  // A stride only while he travels; standing, the walk layer is his stance
  // and breath.
  m.walk = 1 - ramp(RUN_EASE[0], RUN_EASE[1], st)
  m.phase = st * RUN_CADENCE
  m.stride = m.phase
  animateHeroWalk(R, m, st, RUN_GAIT)
  const dash = dashPose(R, st, DASH_RUN[0], DASH_RUN[1])
  F.position.set(0, -dash.drop, z)
  F.rotation.set(dash.lean + 0.18 * m.walk * (1 - dash.on), ry, 0)
  F.scale.set(1, 1 - dash.stretch * 0.5, 1 + dash.stretch)
  out.dashOn = dash.on
  // Planted and turned: the cannon up at the Trooper, the stance wide.
  // (The arm snaps up on a spring; the legs plant on the ramp: a stance
  // that settled with a wobble would read as marking time.)
  const aim = ramp(1.75, 2.0, st)
  const aimS = settle(1.72, 1.95, st)
  poseToward(R, 'shoulderR', -1.5 - 0.38 * ans, 0, 0.12, aimS)
  poseToward(R, 'elbowR', -0.05, 0, 0, aimS)
  poseToward(R, 'hipL', -0.35, 0, -0.08, aim)
  poseToward(R, 'hipR', 0.3, 0, 0.08, aim)
  poseToward(R, 'kneeL', 0.35, 0, 0, aim)
  poseToward(R, 'chest', 0.05, 0.2, 0, aimS)
  if (st <= STREET_RELEASE) {
    out.guard = 0
    layerAndroid(R, st)
    return out
  }

  // ── The showcase ──
  // The dash under the ring carries him forward; he settles after. Then the
  // Overload (#137): he turns his back on the big Guardroid, dashes away from
  // it, and turns back to it, charging all the while.
  const fz = -3.6 - 1.4 * ramp(SHOW_SLIDE_FROM, SHOW_SLIDE_TO, st) + FLEE * ramp(SHOW_FLEE_FROM, SHOW_FLEE_TO, st)
  const flee = st > (SHOW_SLIDE_TO + SHOW_FLEE_FROM) / 2
  const d2 = flee ? dashPose(R, st, SHOW_FLEE_FROM, SHOW_FLEE_TO) : dashPose(R, st, SHOW_SLIDE_FROM, SHOW_SLIDE_TO)
  F.position.set(0, -d2.drop, fz)
  F.rotation.x = d2.lean
  F.scale.set(1, 1 - d2.stretch * 0.5, 1 + d2.stretch)
  out.dashOn = Math.max(out.dashOn, d2.on)
  const away = ramp(SHOW_FLEE_FROM - 0.25, SHOW_FLEE_FROM, st) * (1 - ramp(SHOW_FLEE_TO + 0.1, SHOW_FLEE_TO + 0.45, st))
  F.rotation.y += Math.PI * away
  // The shield: up for the parry and for the volley (each a sprung snap up
  // and a sprung drop: the arm overshoots a hair and settles, both ways).
  let guard = settle(SHOW_GUARD_UP, SHOW_GUARD_UP + 0.1, st) * (1 - settle(SHOW_GUARD_DOWN - 0.1, SHOW_GUARD_DOWN, st))
  // The Trooper's two shots: up just before each lands — a perfect block.
  for (const v of SHOW_TROOP_SHOTS) {
    guard = Math.max(guard, settle(v + SHOW_TROOP_FLIGHT - 0.2, v + SHOW_TROOP_FLIGHT - 0.04, st) *
      (1 - settle(v + SHOW_TROOP_FLIGHT + 0.15, v + SHOW_TROOP_FLIGHT + 0.3, st)))
  }
  guard = Math.max(guard, settle(SHOW_SHIELD_UP, SHOW_SHIELD_UP + 0.15, st) * (1 - settle(SHOW_SHIELD_DOWN - 0.15, SHOW_SHIELD_DOWN, st)))
  out.guard = Math.max(0, Math.min(1, guard))
  poseToward(R, 'shoulderL', -1.35, 0, 0.35, guard)
  poseToward(R, 'elbowL', -0.5, 0, 0, guard)
  // The Repair Gel: the flask up in his left hand.
  const gel = settle(SHOW_GEL, SHOW_GEL + 0.35, st) * (1 - settle(SHOW_GEL_BURST, SHOW_GEL_BURST + 0.45, st))
  poseToward(R, 'shoulderL', -2.5, 0, 0.25, gel)
  poseToward(R, 'elbowL', -0.9, 0, 0, gel)
  // The hero pose after the gel: chin up, the cannon held across.
  const hero = settle(SHOW_GEL_BURST + 0.3, SHOW_GEL_BURST + 0.9, st)
  poseToward(R, 'shoulderR', -0.6, 0, 0.62, hero)
  poseToward(R, 'elbowR', -0.95, 0, 0, hero)
  poseToward(R, 'chest', 0.05, -0.1, 0, hero)
  // The Overload: the cannon up at the Guardroid's head (its release's kick
  // is the shots' own, below).
  const up = settle(SHOW_FLEE_TO + 0.3, SHOW_FLEE_TO + 0.6, st) * (1 - settle(SHOW_OVER_HIT + 0.4, SHOW_OVER_HIT + 0.9, st))
  poseToward(R, 'shoulderR', -1.8, 0, 0.12, up)
  poseToward(R, 'chest', 0.05, 0.2, 0, up)
  layerAndroid(R, st)
  return out
}

/**
 * On top of every move: each shot's recoil (the muzzle climbs, the forearm
 * flips up, the chest rocks back on the cannon's side), each block's shove
 * (the shield arm driven in, the chest rocked on its side) and the servo
 * gaze. Turned in each joint's own frame (`poseAdd`), so they ride whatever
 * the moves below set.
 */
const layerAndroid = (R: Rig, st: number): void => {
  let kick = 0
  for (const [t, k] of SHOTS) if (st > t && st < t + 1) kick += k * kickAt(st - t)
  let shove = 0
  for (const [t, k] of BLOCKS) if (st > t && st < t + 1) shove += k * kickAt(st - t)
  poseAdd(R, 'shoulderR', -0.16 * kick, 0, 0)
  poseAdd(R, 'elbowR', -0.12 * kick, 0, 0)
  poseAdd(R, 'shoulderL', 0.2 * shove, 0, 0)
  poseAdd(R, 'elbowL', -0.12 * shove, 0, 0)
  poseAdd(R, 'chest', -0.06 * kick - 0.08 * shove, 0.05 * kick - 0.06 * shove, 0)
  const g = gazeAt(st, _gaze)
  poseAdd(R, 'head', g.pitch - 0.04 * kick - 0.06 * shove, g.yaw, 0)
}
