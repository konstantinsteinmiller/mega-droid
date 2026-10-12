import { Color, Euler, Quaternion } from 'three'
import {
  RigBuilder, sph, ell, cap, torus, rcyl, rcone, dome, paintBy, xform, type Rig, pose, nudge, scaleBone,
  rbox, rboxSplit, rock
} from './kit'
import { PAL } from './palette'
import {
  GAIT, TAU, HOP_H, bump, frac, fidgetEnv, fidgetP, gaitAmp, smoothstep, type EnemyMotion
} from './motion'
import { legL, legR, gaitDir, gaitLegs, stanceDrop, poseLegs } from './gait'

/**
 * ─── Machine enemies ─────────────────────────────────────────────────────────
 *
 * Original designs built on the archetypes of the sprite era: the helmet-hider,
 * the shield trooper, the heli drone, the one-eyed stomper, the gear roller,
 * the heavy brute and the wall cannon. Each is ONE skinned rig (3 draw calls)
 * with a signature colour, big readable eyes and a silhouette that tells you
 * how it fights before it moves.
 *
 * Every builder takes a colour set so sector variants (blaze / cryo / volt)
 * and elites (gold trim) reuse the same rig.
 */

/** `miniboss`: a challenge room's mini-boss (`sim/miniBosses.ts`); its rig,
 *  stats and AI are its registry entry's, like an `echo`'s are its Master's. */
export type EnemyKind = 'hardhat' | 'trooper' | 'heli' | 'hopper' | 'roller' | 'brute' | 'turret' | 'golem' | 'polar' | 'mole' | 'puffer' | 'stalker' | 'spotter' | 'hornet' | 'warden' | 'gatekeeper' | 'echo' | 'miniboss'

export interface EnemyColors {
  main: string
  deep: string
  accent: string
  eye: string
  metal: string
}

export const BASE_COLORS: Record<EnemyKind, EnemyColors> = {
  hardhat: { main: PAL.hardhat, deep: PAL.hardhatDeep, accent: '#ff7a1f', eye: PAL.glowRed, metal: '#4a5570' },
  trooper: { main: PAL.trooper, deep: PAL.trooperDeep, accent: '#b8f06a', eye: PAL.glowPink, metal: '#7f8ba3' },
  heli: { main: PAL.heli, deep: PAL.heliDeep, accent: '#ffd23a', eye: PAL.glowYellow, metal: '#7f8ba3' },
  hopper: { main: PAL.hopper, deep: PAL.hopperDeep, accent: '#ffd23a', eye: PAL.glowRed, metal: '#8a93a8' },
  roller: { main: PAL.roller, deep: PAL.rollerDeep, accent: '#ffe14a', eye: PAL.glowCyan, metal: '#6f7a90' },
  brute: { main: PAL.brute, deep: PAL.bruteDeep, accent: '#ff8a2a', eye: PAL.glowRed, metal: '#3b4458' },
  turret: { main: PAL.turret, deep: '#2c7a72', accent: '#ffcf3a', eye: PAL.glowRed, metal: '#5d6a82' },
  // The crate golem wears its sector's crate (sim/enemies.ts golemColors):
  // main = the crate's wood, deep = its trim, eye = the theme accent (the
  // crate's nubs, its visor and core), accent = the iron bands on its limbs
  // (an elite's gold), metal = its stone. This is the Scrapyard's crate.
  golem: { main: '#c68a3e', deep: '#5f4630', accent: '#646b7a', eye: '#ffcf5a', metal: '#8e877b' },
  // The Polar Pup: blue shells (south, closed) round a red core (north).
  polar: { main: '#3f6bff', deep: '#22306e', accent: '#ff4a5e', eye: '#ff4a5e', metal: '#9aa3b8' },
  // The Mole Driller: rust-brown body, steel drill, a miner's lamp.
  mole: { main: '#b07a4a', deep: '#5a3d2a', accent: '#ffd23a', eye: '#ff6a2a', metal: '#a7afc4' },
  // The Puffer Mine: a buoy-yellow pufferfish of a mine, red spikes.
  puffer: { main: '#ffc94a', deep: '#a8661a', accent: '#ff5a3a', eye: '#2a3a5a', metal: '#d8dde8' },
  // The Glow Stalker: near-black plating, magenta seams, eyes that burn.
  stalker: { main: '#22223a', deep: '#14141f', accent: '#ff3fd2', eye: '#3ff4ff', metal: '#3a3a52' },
  // The Searchlight Drone: a violet hull, a magenta radio tip, a warm lamp.
  spotter: { main: '#4a3a78', deep: '#1c1830', accent: '#ff3f9e', eye: '#fff1b0', metal: '#8a92b0' },
  // The Hornet Rotor: wasp stripes, a stinger, twin rotors.
  hornet: { main: '#ffd23a', deep: '#22232e', accent: '#ff4a3a', eye: '#ff2a2a', metal: '#c8ccd6' },
  // The Fortress's machines: Vex's black-and-red.
  warden: { main: '#3a3e4c', deep: '#1c1e26', accent: '#ff3f5f', eye: '#ff3f5f', metal: '#8a8f9e' },
  gatekeeper: { main: '#454a5a', deep: '#22252e', accent: '#ff3f5f', eye: '#ffcf3a', metal: '#8a8f9e' },
  // A Master's echo wears its Master's rig (`buildEnemyRig` with a boss id).
  echo: { main: '#ff3f5f', deep: '#22252e', accent: '#ff3f5f', eye: '#ff3f5f', metal: '#8a8f9e' },
  // A challenge mini-boss's breakup colours (its rig is its own): amber.
  miniboss: { main: '#ffb03a', deep: '#3b3434', accent: '#ffd24a', eye: '#fff06a', metal: '#6b4a3a' }
}

// ─── Motion layer (idle, walk, eased attacks) ────────────────────────────────
//
// Every pose function below takes an optional last `m: EnemyMotion` (see
// models/motion.ts). WITHOUT it the function is byte-for-byte the old pose, so
// the dev bench and the store-art shots in ModelLab render exactly as before.
// WITH it (the game, via syncEnemyVisual) the machine breathes, shifts its
// weight, glances around, fidgets while unaware, walks on a distance-driven
// planted-foot gait, and eases out of its attacks. The attack key poses
// (a full wind-up, the aim arm, a full peek, the hop crouch) are reached
// exactly as before, so every telegraph reads the same.

const mix = (a: number, b: number, k: number): number => a + (b - a) * k
const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x)

const _eYX = new Euler(0, 0, 0, 'YXZ')
const _qYX = new Quaternion()
/** Like kit.pose, but the yaw comes FIRST (a heading), then the pitch about
 *  the turned axle — the roller's wheel steering into its travel. */
const poseYX = (rig: Rig, name: string, rx: number, ry: number): void => {
  const b = rig.bones[name]
  const r = rig.rest[name]
  if (!b || !r) return
  _eYX.set(rx, ry, 0, 'YXZ')
  _qYX.setFromEuler(_eYX)
  b.quaternion.copy(r.q).multiply(_qYX)
}

/** Eye: white, iris, pupil, highlight — the thing that makes a machine cute. */
const eye = (b: RigBuilder, bone: string, p: [number, number, number], r: number, iris: string, facingY = 0, glowIris = false) => {
  b.part(bone, ell(r, r * 1.15, r * 0.55), PAL.eyeWhite, { p, r: [0, facingY, 0] })
  const fx = Math.sin(facingY)
  const fz = Math.cos(facingY)
  b.part(bone, ell(r * 0.6, r * 0.7, r * 0.3), iris, { p: [p[0] + fx * r * 0.35, p[1] - r * 0.1, p[2] + fz * r * 0.35], r: [0, facingY, 0], glow: glowIris, outline: false })
  b.part(bone, ell(r * 0.32, r * 0.38, r * 0.2), PAL.pupil, { p: [p[0] + fx * r * 0.5, p[1] - r * 0.12, p[2] + fz * r * 0.5], r: [0, facingY, 0], outline: false })
  b.part(bone, sph(r * 0.16, 8, 6), '#ffffff', { p: [p[0] + fx * r * 0.52 - r * 0.22, p[1] + r * 0.28, p[2] + fz * r * 0.52], glow: true, outline: false })
}

// ─── Hardhat ─────────────────────────────────────────────────────────────────

export const buildHardhat = (c: EnemyColors = BASE_COLORS.hardhat): Rig => {
  const b = new RigBuilder()
  b.bone('root', null, [0, 0, 0])
    .bone('body', 'root', [0, 0.26, 0])
    .bone('helmet', 'root', [0, 0.3, 0])
    .bone('footL', 'root', [-0.16, 0.07, 0.04])
    .bone('footR', 'root', [0.16, 0.07, 0.04])
  b.part('body', ell(0.3, 0.24, 0.28, 16, 12), c.metal, { p: [0, 0, 0] })
  b.part('body', rcyl(0.07, 0.1, 0.03, 12), '#2a3042', { p: [0, -0.08, 0.26], r: [Math.PI / 2, 0, 0] })
  b.part('body', torus(0.07, 0.022, 6, 14), c.accent, { p: [0, -0.08, 0.3] })
  eye(b, 'body', [-0.1, 0.07, 0.22], 0.075, PAL.pupil, -0.2)
  eye(b, 'body', [0.1, 0.07, 0.22], 0.075, PAL.pupil, 0.2)
  const helm = paintBy(dome(0.44, Math.PI * 0.5, 22, 10), (x, y, z) =>
    (Math.abs(x) < 0.07 || (Math.abs(z) < 0.07 && y > 0.18) ? c.deep : c.main))
  b.painted('helmet', helm, { p: [0, 0, 0] })
  b.part('helmet', torus(0.43, 0.055, 8, 28), c.deep, { p: [0, 0, 0], r: [Math.PI / 2, 0, 0] })
  b.part('helmet', sph(0.07, 10, 8), c.deep, { p: [0, 0.44, 0] })
  b.mirror((s, t) => {
    b.part(`foot${t}`, ell(0.12, 0.075, 0.16), c.accent, { p: [0, 0, 0.02] })
  })
  return b.build({ outline: 0.016, height: 0.78 })
}

/** The idle peek-look lifts the helmet only this far: `combat.ts` deflects
 *  shots while guard > 0.55 (peek < 0.45), so the look never promises an
 *  opening the rules do not give. */
export const HARDHAT_IDLE_PEEK = 0.35
/** Walking hidden, helmet and body rise together (eyes stay under the dome)
 *  so the little feet show under the brim: the brim's rolled edge must clear
 *  a lifted foot (0.2 m), or from the player's eye height it still glides. */
export const HARDHAT_WALK_LIFT = 0.17

const animateHardhat = (rig: Rig, peek: number, t: number, m: EnemyMotion): void => {
  const T = t * m.tempo
  const calm = m.calm
  const g = GAIT.hardhat!
  const wk = gaitAmp(m.walk)
  const still = 1 - wk
  const p = fidgetP(m, 'hardhat')
  const fe = m.fid ? fidgetEnv(p) * calm : 0
  let fPeek = 0
  let fYaw = 0
  let fRoll = 0
  let fHop = 0
  let fTapL = 0
  let fTapR = 0
  let fTurn = 0
  if (m.fid === 1) {
    // Peek-look: eyes up under the brim, glance left, right, duck
    fPeek = HARDHAT_IDLE_PEEK
    fYaw = -0.5 * Math.sin(TAU * p)
  } else if (m.fid === 2) {
    // Helmet settle: a shimmy and a hop
    fRoll = 0.1 * Math.sin(3 * TAU * p)
    fHop = 0.04 * Math.sin(Math.PI * p)
  } else if (m.fid === 3) {
    // Shuffle-turn: four taps, a little turn and back
    const s = Math.sin(2 * TAU * p)
    fTapL = 0.03 * Math.max(0, s)
    fTapR = 0.03 * Math.max(0, -s)
    fTurn = 0.2 * Math.sin(TAU * p)
  }
  const k = clamp(Math.max(peek, fPeek * fe), 0, 1)
  gaitLegs(g, m, wk)
  const u = frac(m.phase / TAU)
  // Foot-only rig: L = 1, so sin(th) is the fore-aft offset (m)
  const dL = g.L * Math.sin(legL.th)
  const dR = g.L * Math.sin(legR.th)
  const out = g.L * Math.sin(gaitDir.bias)
  const br = Math.sin(T * 2.1)
  const sh = Math.sin(T * 0.55 + 1.3)
  const bob = 0.0075 * wk * (1 - Math.cos(2 * TAU * u))
  const lift = HARDHAT_WALK_LIFT * wk + 0.012 * br * still + bob + fHop * fe + 0.05 * m.startle
  // Rock toward the planted foot (the L side while u < 0.5), a slow weight rock at rest
  const rock = (0.02 + 0.015 * calm) * sh * still + 0.06 * wk * Math.sin(TAU * u) + fRoll * fe
  nudge(rig, 'helmet', 0, -0.26 * (1 - k) + 0.12 * k + lift, -0.04 * k)
  pose(rig, 'helmet', -0.35 * k + 0.08 * wk * gaitDir.f, fTurn * fe, rock)
  scaleBone(rig, 'body', 1, 0.45 + 0.55 * k, 1)
  nudge(rig, 'body', 0, -0.12 * (1 - k) + lift, 0)
  pose(rig, 'body', 0, fYaw * fe, 0)
  nudge(rig, 'footL', dL * gaitDir.s - out, legL.knee + fTapL * fe, dL * gaitDir.f)
  nudge(rig, 'footR', dR * gaitDir.s + out, legR.knee + fTapR * fe, dR * gaitDir.f)
}

/** 0 = fully hidden under the helmet, 1 = peeking. With `m`, the motion layer. */
export const poseHardhat = (rig: Rig, peek: number, t: number, walk: number, m?: EnemyMotion): void => {
  if (m) {
    animateHardhat(rig, peek, t, m)
    return
  }
  const k = Math.max(0, Math.min(1, peek))
  nudge(rig, 'helmet', 0, -0.26 * (1 - k) + 0.12 * k, -0.04 * k)
  pose(rig, 'helmet', -0.35 * k, 0, Math.sin(t * 9) * 0.04 * walk)
  scaleBone(rig, 'body', 1, 0.45 + 0.55 * k, 1)
  nudge(rig, 'body', 0, -0.12 * (1 - k), 0)
  const w = Math.sin(t * 12) * walk
  nudge(rig, 'footL', 0, Math.max(0, w) * 0.05, 0)
  nudge(rig, 'footR', 0, Math.max(0, -w) * 0.05, 0)
}

// ─── Shield Trooper ──────────────────────────────────────────────────────────

export const buildTrooper = (c: EnemyColors = BASE_COLORS.trooper): Rig => {
  const b = new RigBuilder()
  b.bone('hips', null, [0, 0.72, 0])
    .bone('chest', 'hips', [0, 0.26, 0])
    .bone('head', 'chest', [0, 0.28, 0])
    .bone('shoulderL', 'chest', [-0.3, 0.12, 0])
    .bone('elbowL', 'shoulderL', [0, -0.24, 0])
    .bone('shoulderR', 'chest', [0.3, 0.12, 0])
    .bone('elbowR', 'shoulderR', [0, -0.24, 0])
    .bone('hipL', 'hips', [-0.13, -0.06, 0])
    .bone('kneeL', 'hipL', [0, -0.3, 0])
    .bone('hipR', 'hips', [0.13, -0.06, 0])
    .bone('kneeR', 'hipR', [0, -0.3, 0])
  b.part('hips', ell(0.22, 0.14, 0.17), c.deep)
  b.part('chest', ell(0.27, 0.24, 0.2, 16, 12), c.main, { p: [0, 0.02, 0] })
  b.part('chest', ell(0.17, 0.1, 0.06), c.deep, { p: [0, -0.06, 0.18] })
  b.part('chest', sph(0.05, 10, 8), c.eye, { p: [0, 0.08, 0.2], glow: true, outline: false })
  // Helmet with a dark visor band and a single glowing eye
  b.part('head', sph(0.2, 18, 12), c.main, { p: [0, 0.12, 0] })
  b.part('head', ell(0.18, 0.07, 0.1), '#1d2438', { p: [0, 0.1, 0.12] })
  b.part('head', ell(0.05, 0.045, 0.03), c.eye, { p: [0.03, 0.1, 0.205], glow: true, outline: false })
  b.part('head', rcone(0.08, 0.02, 0.18, 0.02, 10), c.accent, { p: [0, 0.35, -0.02] })
  b.part('head', torus(0.2, 0.03, 6, 20), c.deep, { p: [0, 0.07, 0], r: [Math.PI / 2, 0, 0] })
  b.mirror((s, t) => {
    b.part(`shoulder${t}`, sph(0.11, 12, 8), c.deep)
    b.part(`shoulder${t}`, cap(0.07, 0.12), c.main, { p: [0, -0.11, 0] })
    b.part(`hip${t}`, cap(0.08, 0.16), c.main, { p: [0, -0.14, 0] })
    b.part(`knee${t}`, cap(0.075, 0.12), c.main, { p: [0, -0.1, 0] })
    b.part(`knee${t}`, ell(0.13, 0.1, 0.19), c.deep, { p: [0, -0.3, 0.04] })
  })
  // Left: the big round shield
  b.part('elbowL', cap(0.08, 0.1), c.deep, { p: [0, -0.08, 0] })
  b.part('elbowL', rcyl(0.44, 0.1, 0.04, 26), '#aeb8cc', { p: [0.02, -0.18, 0.2], r: [Math.PI / 2, 0, 0] })
  b.part('elbowL', torus(0.44, 0.045, 8, 28), c.deep, { p: [0.02, -0.18, 0.25] })
  b.part('elbowL', ell(0.16, 0.16, 0.05), c.main, { p: [0.02, -0.18, 0.28] })
  b.part('elbowL', ell(0.07, 0.07, 0.03), c.accent, { p: [0.02, -0.18, 0.31], glow: true, outline: false })
  // Right: arm gun
  b.part('elbowR', rcyl(0.08, 0.3, 0.03, 14), c.metal, { p: [0, -0.12, 0] })
  b.part('elbowR', torus(0.07, 0.02, 6, 14), c.accent, { p: [0, -0.27, 0], r: [Math.PI / 2, 0, 0] })
  return b.build({ outline: 0.018, height: 1.62 })
}

/** Arm angles [shoulder rx, ry, rz] + elbow rx. */
interface ArmPose { x: number; y: number; z: number; elbow: number }

/**
 * The shield RAISED (guard 1): upper arm forward, forearm hanging, so the
 * disc (its face is the forearm's +Z) stands upright IN FRONT of the torso,
 * facing the player — it reads as blocking frontal shots, the visor peeking
 * over its rim. (The old pose, still drawn by the legacy path, laid it flat
 * over the head like an umbrella.) Purely visual: `combat.ts` decides a block
 * from `guard` and the shot's angle, never from the shield's geometry.
 */
export const TROOPER_SHIELD_UP: Readonly<ArmPose> = { x: -1.1, y: 0.2, z: 0.2, elbow: 1.0 }
/** The shield LOWERED to fire (guard 0): carried at the side, arm close in
 *  (not the old 14°-outward A-arm) and the disc turned edge-on to the front,
 *  so the opening reads at a glance — a disc hanging IN FRONT of the hips
 *  looked half-guarded while front shots already land. */
export const TROOPER_SHIELD_DOWN: Readonly<ArmPose> = { x: 0.05, y: -1.45, z: -0.12, elbow: -0.2 }
/** The gun arm at rest: low ready, forward-down and close to the body. */
export const TROOPER_GUN_REST: Readonly<ArmPose> = { x: -0.25, y: -0.1, z: 0.08, elbow: -0.55 }
/** The gun arm at aim 1: exactly the old aim pose (the burst telegraph). */
const TROOPER_GUN_AIM: Readonly<ArmPose> = { x: -1.55, y: 0, z: 0.03, elbow: -0.15 }

const animateTrooper = (rig: Rig, guard: number, aim: number, t: number, m: EnemyMotion): void => {
  const T = t * m.tempo
  const calm = m.calm
  const g = GAIT.trooper!
  const wk = gaitAmp(m.walk)
  const still = 1 - wk
  gaitLegs(g, m, wk)
  poseLegs(rig)
  const u = frac(m.phase / TAU)
  const br = Math.sin(T * 2.4)
  const sh = Math.sin(T * 0.55 + 1.3)
  nudge(rig, 'hips', 0, -stanceDrop(g) + 0.008 * br * still + 0.05 * m.startle, 0)
  const p = fidgetP(m, 'trooper')
  const fe = m.fid ? fidgetEnv(p) * calm : 0
  let hX = 0
  let hY = 0
  let hZ = 0
  let cY = 0
  let cZ = 0
  let gX = 0
  let gY = 0
  let gE = 0
  let sX = 0
  if (m.fid === 1) {
    // Look-around: head left, hold, right, hold (the chest follows a little)
    hY = 0.7 * clamp(1.6 * Math.sin(TAU * p), -1, 1)
    cY = 0.25 * hY
  } else if (m.fid === 2) {
    // Check gun: bring it up across the chest, look down at it, give it a shake
    gX = -0.75
    gY = -0.4
    gE = -0.95 + 0.1 * Math.sin(6 * TAU * p)
    hX = 0.25
    hY = 0.2
  } else if (m.fid === 3) {
    // Shield shrug: shoulders roll twice, the shield bobs (still in front)
    cZ = 0.06 * Math.sin(2 * TAU * p)
    sX = 0.12 * Math.sin(Math.PI * p)
  } else if (m.fid === 4) {
    // Antenna twitch
    hZ = 0.12 * Math.sin(2 * TAU * p)
  }
  const look = m.look * calm
  // Weight on the chest, never on the hips (a sway on the hips drags the
  // planted foot); walking, it rides over the stance leg (L side while u < ½)
  const shiftX = 0.015 * sh * still - 0.018 * Math.sin(TAU * u) * wk
  const twist = ((legL.th - legR.th) * 0.5 * 0.1 / g.A) * wk * gaitDir.f
  nudge(rig, 'chest', shiftX, 0, 0)
  pose(rig, 'chest', 0.05 * guard + 0.1 * wk * gaitDir.f + 0.025 * br * still, 0.15 * aim - twist + 0.15 * look + cY * fe, -1.5 * shiftX + cZ * fe)
  pose(rig, 'head', -0.1 * aim - 0.015 * br * still + hX * fe - 0.1 * m.startle, clamp(0.6 * look + hY * fe, -1.1, 1.1), hZ * fe)
  // Gun arm: low ready + counter-swing (with the L leg) + fidget → the aim pose by `aim`
  const swing = -(legL.th / g.A) * 0.38 * wk * gaitDir.f
  const R = TROOPER_GUN_REST
  const A = TROOPER_GUN_AIM
  pose(rig, 'shoulderR', mix(R.x + swing + gX * fe - 0.2 * m.startle, A.x, aim), mix(R.y + gY * fe, A.y, aim), mix(R.z, A.z, aim))
  pose(rig, 'elbowR', mix(R.elbow + gE * fe, A.elbow, aim), 0, 0)
  // Shield: the low carry (guard 0) … raised (guard 1); breath and steps bob it
  const D = TROOPER_SHIELD_DOWN
  const U = TROOPER_SHIELD_UP
  const bobS = (0.03 * br * still + 0.04 * wk * Math.abs(Math.sin(TAU * u)) + sX * fe) * guard
  pose(rig, 'shoulderL', mix(D.x, U.x, guard) + bobS, mix(D.y, U.y, guard), mix(D.z, U.z, guard))
  pose(rig, 'elbowL', mix(D.elbow, U.elbow, guard), 0, 0)
}

/** guard: 1 = shield raised in front. aim: 1 = gun arm raised to fire. With `m`, the motion layer. */
export const poseTrooper = (rig: Rig, guard: number, aim: number, t: number, walk: number, m?: EnemyMotion): void => {
  if (m) {
    animateTrooper(rig, guard, aim, t, m)
    return
  }
  const w = Math.sin(t * 8) * walk
  pose(rig, 'hipL', w * 0.5, 0, 0)
  pose(rig, 'hipR', -w * 0.5, 0, 0)
  pose(rig, 'kneeL', Math.max(0, -w) * 0.6, 0, 0)
  pose(rig, 'kneeR', Math.max(0, w) * 0.6, 0, 0)
  nudge(rig, 'hips', 0, Math.abs(w) * 0.03 + Math.sin(t * 2) * 0.008, 0)
  pose(rig, 'shoulderL', -1.35 * guard - 0.1, 0.35 * guard, -0.25 + 0.45 * guard)
  pose(rig, 'elbowL', -0.4 * guard, 0, 0)
  pose(rig, 'shoulderR', -1.5 * aim - 0.05, 0, 0.18 - 0.15 * aim)
  pose(rig, 'elbowR', -0.15 * aim - 0.2 * (1 - aim), 0, 0)
  pose(rig, 'head', -0.1 * aim, 0, 0)
  pose(rig, 'chest', 0.05 * guard, 0.15 * aim, 0)
}

// ─── Rotor Drone ─────────────────────────────────────────────────────────────

export const buildHeli = (c: EnemyColors = BASE_COLORS.heli): Rig => {
  const b = new RigBuilder()
  b.bone('body', null, [0, 0, 0])
    .bone('rotor', 'body', [0, 0.38, 0])
    .bone('clawL', 'body', [-0.16, -0.24, 0.02])
    .bone('clawR', 'body', [0.16, -0.24, 0.02])
  b.part('body', ell(0.36, 0.3, 0.34, 18, 12), c.main)
  b.part('body', ell(0.3, 0.14, 0.28), c.metal, { p: [0, -0.2, 0] })
  b.part('body', torus(0.34, 0.035, 6, 24), c.deep, { p: [0, -0.04, 0], r: [Math.PI / 2, 0, 0] })
  eye(b, 'body', [0, 0.04, 0.27], 0.13, c.eye, 0, true)
  b.part('body', rcyl(0.05, 0.14, 0.02, 10), c.metal, { p: [0, 0.32, 0] })
  b.part('rotor', sph(0.07, 10, 8), c.accent)
  b.part('rotor', ell(0.62, 0.025, 0.08), c.accent, { p: [0, 0.02, 0] })
  b.part('rotor', ell(0.08, 0.025, 0.62), c.accent, { p: [0, 0.02, 0] })
  b.mirror((s, t) => {
    b.part(`claw${t}`, cap(0.04, 0.1), c.metal, { p: [0, -0.06, 0] })
    b.part(`claw${t}`, ell(0.06, 0.04, 0.08), c.deep, { p: [s * 0.02, -0.14, 0.03] })
  })
  return b.build({ outline: 0.015, height: 0.8 })
}

const animateHeli = (rig: Rig, t: number, tilt: number, spin: number, m: EnemyMotion): void => {
  const T = t * m.tempo
  const calm = m.calm
  const w = m.walk
  // The smoothed direction as is (not normalised): it passes through zero
  // when the drone reverses, so bank and trail fade through level
  const cf = m.fwd
  const sf = m.side
  const p = fidgetP(m, 'heli')
  const fe = m.fid ? fidgetEnv(p) * calm : 0
  let clack = 0
  let dip = 0
  let yaw = 0
  if (m.fid === 1) clack = 0.35 * Math.max(0, Math.sin(2 * TAU * p)) // claw snap ×2
  else if (m.fid === 2) dip = p < 0.5 ? -0.12 * Math.sin(TAU * p) : 0.04 * Math.sin(TAU * (p - 0.5)) // hiccup
  else if (m.fid === 3) yaw = 0.9 * Math.sin(TAU * p) // spin check
  // Hover bob (view-only: the sim's height bob only runs in engage)
  nudge(rig, 'body', 0, 0.06 * Math.sin(T * 1.6) * (1 - 0.5 * w) + 0.15 * m.startle + dip * fe, 0)
  pose(rig, 'rotor', 0, spin, 0)
  // Bank into the travel and into turns (a negative roll lifts the −X side)
  const roll = Math.sin(T * 2.3) * 0.08 - clamp(0.35 * sf * w + 0.15 * m.turn, -0.5, 0.5)
  pose(rig, 'body', tilt + 0.04 * Math.sin(T * 1.3) * (1 - w), 0.4 * m.look * calm + yaw * fe, roll)
  // Claws hang under the tilt and trail behind with airspeed
  const trail = 0.3 * w * cf
  pose(rig, 'clawL', Math.sin(T * 3) * 0.2 - tilt * 0.8 + trail, 0, -0.2 + clack * fe)
  pose(rig, 'clawR', Math.sin(T * 3 + 1) * 0.2 - tilt * 0.8 + trail, 0, 0.2 - clack * fe)
}

export const poseHeli = (rig: Rig, t: number, tilt: number, spin: number, m?: EnemyMotion): void => {
  if (m) {
    animateHeli(rig, t, tilt, spin, m)
    return
  }
  pose(rig, 'rotor', 0, spin, 0)
  pose(rig, 'body', tilt, 0, Math.sin(t * 2.3) * 0.08)
  pose(rig, 'clawL', Math.sin(t * 3) * 0.2 - tilt * 0.8, 0, -0.2)
  pose(rig, 'clawR', Math.sin(t * 3 + 1) * 0.2 - tilt * 0.8, 0, 0.2)
}

// ─── Polar Pup ───────────────────────────────────────────────────────────────

/**
 * A floating magnet orb (the Polarity Works): two blue half-shells hinged at
 * its crown close over a red core. Closed, the shells repel shots (TINK);
 * open, the core shows and it fires. `open` 0..1 swings the shells apart.
 */
export const buildPolar = (c: EnemyColors = BASE_COLORS.polar): Rig => {
  const b = new RigBuilder()
  b.bone('body', null, [0, 0, 0])
    .bone('shellL', 'body', [0, 0.3, 0])
    .bone('shellR', 'body', [0, 0.3, 0])
  // The core: a red ball with a white-hot eye and a steel equator.
  b.part('body', sph(0.24, 16, 12), c.accent)
  eye(b, 'body', [0, 0.02, 0.2], 0.11, '#ffffff', 0, true)
  b.part('body', torus(0.26, 0.03, 6, 22), c.metal, { r: [Math.PI / 2, 0, 0] })
  // Fins under it (the magnet's legs), and a pole stud on top.
  b.mirror((s) => {
    b.part('body', rcone(0.06, 0.02, 0.22, 0.02, 8), c.metal, { p: [s * 0.14, -0.34, 0], r: [0, 0, s * 0.35] })
  })
  b.part('body', sph(0.06, 10, 8), c.accent, { p: [0, 0.38, 0], glow: true, outline: false })
  // The shells: half-domes facing −X and +X, hung from the crown hinge.
  // Each a quarter-sphere deep, so shut they meet at the front seam and
  // open they lift like a clam's halves, never wider than the body.
  b.part('shellL', dome(0.3, Math.PI / 2, 18, 8), c.main, { p: [0, -0.3, 0], r: [0, 0, Math.PI / 2] })
  b.part('shellR', dome(0.3, Math.PI / 2, 18, 8), c.main, { p: [0, -0.3, 0], r: [0, 0, -Math.PI / 2] })
  return b.build({ outline: 0.015, height: 0.8 })
}

/** `open`: 0 shut (blue), 1 wide open (the red core bare). */
export const posePolar = (rig: Rig, open: number, t: number, m?: EnemyMotion): void => {
  const bob = m ? 0.05 * Math.sin(t * m.tempo * 1.7) : 0.05 * Math.sin(t * 1.7)
  nudge(rig, 'body', 0, bob, 0)
  pose(rig, 'body', 0.06 * Math.sin(t * 1.1), m ? 0.3 * m.look * m.calm : 0, 0.05 * Math.sin(t * 1.4))
  // The shells swing up about the crown; a shiver while they are shut.
  const shiver = (1 - open) * 0.03 * Math.sin(t * 23)
  pose(rig, 'shellL', 0, 0, open * 0.62 + shiver)
  pose(rig, 'shellR', 0, 0, -open * 0.62 - shiver)
}

// ─── Mole Driller ────────────────────────────────────────────────────────────

/**
 * A digging robot (the Deep Mine): a squat body with a steel drill for a
 * nose, two shovel paws and a miner's lamp. It travels under the floor and
 * bursts up where Flux stands; `rise` 0..1 lifts it out of the ground (0:
 * below the floor, the drill tip last to go).
 */
export const buildMole = (c: EnemyColors = BASE_COLORS.mole): Rig => {
  const b = new RigBuilder()
  b.bone('body', null, [0, 0, 0])
    .bone('drill', 'body', [0, 0.46, 0.42])
    .bone('pawL', 'body', [-0.3, 0.22, 0.28])
    .bone('pawR', 'body', [0.3, 0.22, 0.28])
  b.part('body', ell(0.44, 0.36, 0.5, 18, 12), c.main, { p: [0, 0.42, 0] })
  b.part('body', ell(0.36, 0.16, 0.42), c.deep, { p: [0, 0.14, 0] })
  eye(b, 'body', [-0.14, 0.58, 0.36], 0.08, c.eye, 0, true)
  eye(b, 'body', [0.14, 0.58, 0.36], 0.08, c.eye, 0, true)
  // The miner's lamp on its crown.
  b.part('body', rcyl(0.09, 0.08, 0.02, 12), c.metal, { p: [0, 0.8, 0.1] })
  b.part('body', sph(0.07, 10, 8), c.accent, { p: [0, 0.82, 0.18], glow: true, outline: false })
  // The engine on its back (its weak spot).
  b.part('body', rbox(0.3, 0.2, 0.18, 0.3), c.metal, { p: [0, 0.6, -0.42] })
  // The drill: a banded steel cone along +Z.
  b.part('drill', rcone(0.2, 0.02, 0.6, 0.02, 12), c.metal, { p: [0, 0, 0.28], r: [Math.PI / 2, 0, 0] })
  for (let k = 0; k < 3; k++) b.part('drill', torus(0.17 - k * 0.05, 0.02, 6, 16), c.deep, { p: [0, 0, 0.1 + k * 0.16] })
  b.mirror((s, t) => {
    b.part(`paw${t}`, ell(0.13, 0.05, 0.16), c.metal, { p: [s * 0.04, -0.1, 0.06] })
  })
  return b.build({ outline: 0.015, height: 0.9 })
}

export const poseMole = (rig: Rig, rise: number, spin: number, t: number, m?: EnemyMotion): void => {
  const sink = -1.0 * (1 - rise)
  nudge(rig, 'body', 0, sink + 0.03 * Math.sin(t * 3), 0)
  pose(rig, 'body', 0.35 * (1 - rise) + 0.04 * Math.sin(t * 2), m ? 0.3 * m.look * m.calm : 0, 0)
  pose(rig, 'drill', 0, 0, spin)
  const dig = Math.sin(t * 9) * 0.5 * (1 - rise)
  pose(rig, 'pawL', -0.3 + dig, 0, 0.2)
  pose(rig, 'pawR', -0.3 - dig, 0, -0.2)
}

// ─── Puffer Mine ─────────────────────────────────────────────────────────────

/**
 * A floating mine shaped like a pufferfish (the Tidewater Locks): a round
 * body ringed with spikes, two fins, big eyes. It drifts at Flux and swells
 * (`swell` 0..1: the body grows, the spikes stand out) before it bursts in a
 * ring of water. Pop it early from range, or block the ring.
 */
const PUFFER_SPIKES: Array<[number, number]> = []
for (let a = 0; a < 3; a++) for (let k = 0; k < 8; k++) PUFFER_SPIKES.push([(k / 8) * Math.PI * 2 + a * 0.4, (a - 1) * 0.6])

export const buildPuffer = (c: EnemyColors = BASE_COLORS.puffer): Rig => {
  const b = new RigBuilder()
  b.bone('body', null, [0, 0, 0])
    .bone('spikes', 'body', [0, 0, 0])
    .bone('finL', 'body', [-0.36, -0.02, -0.05])
    .bone('finR', 'body', [0.36, -0.02, -0.05])
  b.part('body', sph(0.36, 18, 14), c.main)
  b.part('body', ell(0.3, 0.16, 0.3), c.deep, { p: [0, -0.18, 0] })
  eye(b, 'body', [-0.13, 0.08, 0.3], 0.09, c.eye, 0, false)
  eye(b, 'body', [0.13, 0.08, 0.3], 0.09, c.eye, 0, false)
  b.part('body', ell(0.07, 0.04, 0.05), c.accent, { p: [0, -0.06, 0.34] })
  for (const [yaw, pitch] of PUFFER_SPIKES) {
    const x = Math.sin(yaw) * Math.cos(pitch) * 0.36
    const y = Math.sin(pitch) * 0.36
    const z = Math.cos(yaw) * Math.cos(pitch) * 0.36
    b.part('spikes', rcone(0.035, 0.005, 0.14, 0.005, 6), c.accent, { p: [x, y, z], r: [Math.PI / 2 - pitch, yaw, 0] })
  }
  b.mirror((s, t) => b.part(`fin${t}`, ell(0.03, 0.1, 0.13), c.deep, { p: [s * 0.04, 0, 0] }))
  return b.build({ outline: 0.015, height: 0.8 })
}

export const posePuffer = (rig: Rig, swell: number, t: number, m?: EnemyMotion): void => {
  const T = m ? t * m.tempo : t
  scaleBone(rig, 'body', 1 + 0.55 * swell)
  scaleBone(rig, 'spikes', 1 + 0.4 * swell)
  nudge(rig, 'body', 0, 0.06 * Math.sin(T * 1.9), 0)
  pose(rig, 'body', 0.05 * Math.sin(T * 1.2), m ? 0.25 * m.look * m.calm : 0, 0.08 * Math.sin(T * 1.6) + (swell > 0 ? 0.05 * Math.sin(T * 30) * swell : 0))
  const flap = Math.sin(T * 7) * 0.5
  pose(rig, 'finL', 0, 0.3 + flap, 0)
  pose(rig, 'finR', 0, -0.3 - flap, 0)
}

// ─── Glow Stalker ────────────────────────────────────────────────────────────

/**
 * A night hunter (the Blackout Boulevard): a lean dark machine that skates
 * low on one wheel, two blade arms, and eyes that are all a player sees of
 * it in the dark. It whines and its seams flare before it lunges (`flare`
 * 0..1); a parry stops it cold.
 */
export const buildStalker = (c: EnemyColors = BASE_COLORS.stalker): Rig => {
  const b = new RigBuilder()
  b.bone('body', null, [0, 0, 0])
    .bone('head', 'body', [0, 1.05, 0.15])
    .bone('armL', 'body', [-0.3, 0.85, 0])
    .bone('armR', 'body', [0.3, 0.85, 0])
    .bone('wheel', 'body', [0, 0.22, 0])
  b.part('body', cap(0.24, 0.5, 12, 4), c.main, { p: [0, 0.7, 0], r: [0.35, 0, 0] })
  b.part('body', ell(0.26, 0.12, 0.3), c.deep, { p: [0, 0.4, 0] })
  b.part('body', rbox(0.06, 0.5, 0.06, 0.3), c.accent, { p: [0, 0.72, 0.22], r: [0.35, 0, 0], glow: true, outline: false })
  b.part('head', ell(0.2, 0.16, 0.22), c.main)
  eye(b, 'head', [-0.08, 0.02, 0.18], 0.06, c.eye, 0, true)
  eye(b, 'head', [0.08, 0.02, 0.18], 0.06, c.eye, 0, true)
  b.part('wheel', torus(0.2, 0.06, 8, 18), c.metal, { r: [0, Math.PI / 2, 0] })
  b.mirror((s, t) => {
    b.part(`arm${t}`, cap(0.06, 0.3), c.deep, { p: [0, -0.18, 0.04] })
    b.part(`arm${t}`, rbox(0.04, 0.5, 0.12, 0.2), c.accent, { p: [s * 0.02, -0.5, 0.12], r: [0.3, 0, 0], glow: true, outline: false })
  })
  return b.build({ outline: 0.015, height: 1.3 })
}

export const poseStalker = (rig: Rig, flare: number, lunge: number, t: number, m?: EnemyMotion): void => {
  const T = m ? t * m.tempo : t
  nudge(rig, 'body', 0, 0.04 * Math.sin(T * 2.2), 0)
  pose(rig, 'body', 0.15 + 0.4 * lunge, m ? 0.3 * m.look * m.calm : 0, 0.05 * Math.sin(T * 1.7))
  pose(rig, 'head', -0.2 * lunge + 0.1 * flare, 0, 0)
  const up = -1.6 * Math.max(flare, lunge)
  pose(rig, 'armL', up + 0.2 * Math.sin(T * 2), 0.2, -0.2)
  pose(rig, 'armR', up + 0.2 * Math.sin(T * 2 + 1), -0.2, 0.2)
  pose(rig, 'wheel', T * 6 * (0.3 + lunge), 0, 0)
  scaleBone(rig, 'head', 1 + 0.06 * flare * Math.sin(T * 40))
}

// ─── Searchlight Drone ───────────────────────────────────────────────────────

/** Where the lamp's lens sits on the rig (rig units, the body's frame): the
 *  beam (`fx/searchBeam.ts`) starts here. */
export const SPOTTER_LENS = { y: -0.13, z: 0.42 } as const

/**
 * A rooftop searchlight that learned to fly (the Blackout Boulevard): a
 * stubby violet hull on two ducted fans, a big lamp slung under its nose (the
 * eye a player sees in the dark, and its weak spot), a radio mast whose tip
 * blinks while it calls a strike in. `lock` 0..1 leans it into its lamp and
 * sets the mast blinking; `lamp` 1 lit … 0 shot out (it droops and shivers).
 */
export const buildSpotter = (c: EnemyColors = BASE_COLORS.spotter): Rig => spotterParts(c).build({ outline: 0.016, height: 0.9 })

/** The Searchlight Drone's rig, not yet built (the z-fighting test reads its parts). */
export const spotterParts = (c: EnemyColors = BASE_COLORS.spotter): RigBuilder => {
  const b = new RigBuilder()
  b.bone('body', null, [0, 0, 0])
    .bone('lamp', 'body', [0, SPOTTER_LENS.y, 0.2])
    .bone('fanL', 'body', [-0.5, 0.04, -0.04])
    .bone('fanR', 'body', [0.5, 0.04, -0.04])
    .bone('tip', 'body', [0, 0.5, -0.14])
  // The hull: a rounded pod, a dark keel under it, a tail fin.
  b.part('body', ell(0.34, 0.25, 0.42, 18, 12), c.main, { p: [0, 0.06, 0] })
  b.part('body', ell(0.26, 0.1, 0.34, 16, 8), c.deep, { p: [0, -0.13, -0.04] })
  b.part('body', rbox(0.05, 0.22, 0.2, 0.4), c.deep, { p: [0, 0.27, -0.33], r: [-0.35, 0, 0] })
  // Two small eyes over the lamp, and a glowing brow between them.
  eye(b, 'body', [-0.12, 0.15, 0.33], 0.065, c.accent, 0, true)
  eye(b, 'body', [0.12, 0.15, 0.33], 0.065, c.accent, 0, true)
  b.part('body', cap(0.022, 0.16, 8, 2), c.accent, { p: [0, 0.27, 0.27], r: [0, 0, Math.PI / 2], glow: true, outline: false })
  // The mast; its tip (its own bone) blinks while it calls a strike.
  b.part('body', cap(0.018, 0.2, 8, 2), c.metal, { p: [0, 0.38, -0.14] })
  b.part('tip', sph(0.045, 10, 8), c.accent, { glow: true, outline: false })
  // The struts out to the fans.
  b.mirror((s) => {
    b.part('body', rbox(0.3, 0.06, 0.09, 0.3), c.deep, { p: [s * 0.33, 0.04, -0.04] })
  })
  // The fans: a duct ring, a hub, two crossed blades (they spin).
  b.mirror((_s, t) => {
    b.part(`fan${t}`, torus(0.2, 0.045, 8, 22), c.metal, { r: [Math.PI / 2, 0, 0] })
    b.part(`fan${t}`, sph(0.045, 10, 8), c.accent)
    b.part(`fan${t}`, ell(0.17, 0.012, 0.045), c.deep, { p: [0, 0.01, 0] })
    b.part(`fan${t}`, ell(0.045, 0.012, 0.17), c.deep, { p: [0, -0.01, 0] })
  })
  // The lamp: a barrel along +Z on a neck, a rim, the lens (glowing, bulged).
  b.part('body', cap(0.05, 0.06, 8, 2), c.metal, { p: [0, -0.06, 0.18] })
  b.part('lamp', rcyl(0.17, 0.26, 0.04, 18), c.metal, { p: [0, 0, 0.08], r: [Math.PI / 2, 0, 0] })
  b.part('lamp', torus(0.165, 0.028, 8, 22), c.deep, { p: [0, 0, 0.215] })
  b.part('lamp', ell(0.15, 0.15, 0.05, 18, 10), c.eye, { p: [0, 0, 0.215], glow: true, outline: false })
  return b
}

/** `aim`: the lamp's pitch down toward its spot (rad). */
export const poseSpotter = (rig: Rig, aim: number, lock: number, lamp: number, t: number, m?: EnemyMotion): void => {
  const T = m ? t * m.tempo : t
  const out = 1 - lamp
  nudge(rig, 'body', 0, 0.05 * Math.sin(T * 2.1) - 0.08 * out, 0)
  pose(rig, 'body', 0.1 + 0.18 * lock + 0.05 * out * Math.sin(T * 23), m ? 0.25 * m.look * m.calm : 0, 0.06 * Math.sin(T * 1.5) + 0.12 * out * Math.sin(T * 9))
  // The body leans 0.1–0.28 itself; the lamp makes up the rest of the pitch.
  pose(rig, 'lamp', clamp(aim - 0.1 - 0.18 * lock, -0.3, 1.25) + 0.5 * out, 0, 0)
  const spin = T * (26 + 16 * lock)
  pose(rig, 'fanL', 0, spin, 0)
  pose(rig, 'fanR', 0, -spin, 0)
  scaleBone(rig, 'tip', 1 + 0.7 * lock * (Math.sin(T * 24) > 0 ? 1 : 0))
}

// ─── Hornet Rotor ────────────────────────────────────────────────────────────

/**
 * A wasp of a drone (the Rotor Run): a striped body, a stinger, twin
 * rotors. It hovers at range, spins its rotors up red (`spin` 0..1, the
 * telegraph) and dives in a straight line that does not turn: sidestep, or
 * parry and it crashes.
 */
export const buildHornet = (c: EnemyColors = BASE_COLORS.hornet): Rig => hornetParts(c).build({ outline: 0.015, height: 0.8 })

/** The Hornet Rotor's rig, not yet built (the Storm Hornet Queen,
 *  `models/miniBoss/stormHornetQueen.ts`, builds on it). */
export const hornetParts = (c: EnemyColors = BASE_COLORS.hornet): RigBuilder => {
  const b = new RigBuilder()
  b.bone('body', null, [0, 0, 0])
    .bone('rotorL', 'body', [-0.32, 0.3, 0])
    .bone('rotorR', 'body', [0.32, 0.3, 0])
  b.part('body', ell(0.26, 0.24, 0.42, 16, 12), c.main)
  for (let k = 0; k < 3; k++) b.part('body', torus(0.24 - Math.abs(k - 1) * 0.04, 0.03, 6, 18), c.deep, { p: [0, 0, -0.12 + k * 0.12] })
  b.part('body', rcone(0.1, 0.01, 0.3, 0.01, 8), c.deep, { p: [0, -0.02, -0.5], r: [-Math.PI / 2, 0, 0] })
  eye(b, 'body', [-0.1, 0.06, 0.34], 0.07, c.eye, 0, true)
  eye(b, 'body', [0.1, 0.06, 0.34], 0.07, c.eye, 0, true)
  b.mirror((s, t) => {
    b.part('body', rbox(0.3, 0.05, 0.06, 0.3), c.metal, { p: [s * 0.18, 0.22, 0] })
    b.part(`rotor${t}`, sph(0.04, 8, 6), c.accent)
    b.part(`rotor${t}`, ell(0.3, 0.015, 0.05), c.metal, { p: [0, 0.02, 0] })
    b.part(`rotor${t}`, ell(0.05, 0.015, 0.3), c.metal, { p: [0, 0.02, 0] })
  })
  return b
}

export const poseHornet = (rig: Rig, spin: number, dive: number, t: number, m?: EnemyMotion): void => {
  const T = m ? t * m.tempo : t
  nudge(rig, 'body', 0, 0.05 * Math.sin(T * 3) * (1 - dive), 0)
  pose(rig, 'body', 0.6 * dive - 0.15 * spin, m ? 0.3 * m.look * m.calm : 0, 0.06 * Math.sin(T * 2.4))
  const r = T * (20 + 40 * spin)
  pose(rig, 'rotorL', 0, r, 0)
  pose(rig, 'rotorR', 0, -r, 0)
}

// ─── Warden ──────────────────────────────────────────────────────────────────

/**
 * The Fortress's sentry: an armoured dome on three legs with a cannon. Its
 * shell turns every shot; its two front shutters slide open only after it
 * fires (`open` 0..1), the red core bare — that is the moment.
 */
export const buildWarden = (c: EnemyColors = BASE_COLORS.warden): Rig => {
  const b = new RigBuilder()
  b.bone('body', null, [0, 0.9, 0])
    .bone('shutL', 'body', [-0.02, 0, 0.3])
    .bone('shutR', 'body', [0.02, 0, 0.3])
    .bone('gun', 'body', [0, 0.32, 0.2])
  b.part('body', dome(0.62, Math.PI / 2, 20, 10), c.main, { p: [0, -0.1, 0] })
  b.part('body', rcyl(0.62, 0.22, 0.05, 20), c.deep, { p: [0, -0.18, 0] })
  b.part('body', sph(0.3, 14, 10), c.accent, { p: [0, 0.05, 0.18], glow: true, outline: false })
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + Math.PI / 6
    b.part('body', cap(0.07, 0.6), c.metal, { p: [Math.sin(a) * 0.45, -0.55, Math.cos(a) * 0.45], r: [Math.cos(a) * 0.4, 0, -Math.sin(a) * 0.4] })
    b.part('body', ell(0.14, 0.06, 0.14), c.deep, { p: [Math.sin(a) * 0.62, -0.88, Math.cos(a) * 0.62] })
  }
  b.mirror((s, t) => b.part(`shut${t}`, rbox(0.34, 0.5, 0.08, 0.3), c.main, { p: [s * 0.17, 0.05, 0.38], r: [0, s * 0.35, 0] }))
  b.part('gun', rcyl(0.08, 0.5, 0.02, 10), c.metal, { p: [0, 0.05, 0.25], r: [Math.PI / 2, 0, 0] })
  eye(b, 'body', [0, 0.35, 0.5], 0.08, c.eye, 0, true)
  return b.build({ outline: 0.02, height: 1.6 })
}

export const poseWarden = (rig: Rig, open: number, charge: number, t: number, m?: EnemyMotion): void => {
  const T = m ? t * m.tempo : t
  nudge(rig, 'body', 0, 0.02 * Math.sin(T * 2), 0)
  pose(rig, 'body', 0, m ? 0.25 * m.look * m.calm : 0, 0)
  // The shutters slide apart (and swing out) to bare the core.
  nudge(rig, 'shutL', -0.3 * open, 0, 0)
  nudge(rig, 'shutR', 0.3 * open, 0, 0)
  pose(rig, 'shutL', 0, -0.6 * open, 0)
  pose(rig, 'shutR', 0, 0.6 * open, 0)
  pose(rig, 'gun', -0.1 * charge + 0.04 * Math.sin(T * 30) * charge, 0, 0)
}

// ─── Gatekeeper ──────────────────────────────────────────────────────────────

/**
 * The Fortress's first mini-boss: a four-legged tank walker with a turret.
 * Its armour turns shots from the front; the reactor on its back is open,
 * and after a barrage the hatch on its chest opens (`open`) for a while.
 */
export const buildGatekeeper = (c: EnemyColors = BASE_COLORS.gatekeeper): Rig => {
  const b = new RigBuilder()
  b.bone('body', null, [0, 1.3, 0])
    .bone('turret', 'body', [0, 0.55, 0])
    .bone('hatch', 'body', [0, 0.1, 0.92])
  b.part('body', rbox(1.8, 0.8, 2.1, 0.25), c.main)
  b.part('body', rbox(1.6, 0.25, 1.9, 0.2), c.deep, { p: [0, -0.45, 0] })
  b.part('body', rbox(0.7, 0.5, 0.3, 0.3), c.accent, { p: [0, 0.1, -1.05], glow: true, outline: false })
  b.part('body', sph(0.32, 14, 10), c.accent, { p: [0, 0.1, 0.78], glow: true, outline: false })
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    b.part('body', cap(0.16, 0.9), c.metal, { p: [sx * 0.95, -0.75, sz * 0.8], r: [sz * 0.25, 0, -sx * 0.25] })
    b.part('body', rbox(0.42, 0.18, 0.5, 0.3), c.deep, { p: [sx * 1.1, -1.22, sz * 0.92] })
  }
  b.part('turret', rcyl(0.6, 0.4, 0.08, 18), c.main)
  b.mirror((s) => b.part('turret', rcyl(0.1, 1.1, 0.03, 10), c.metal, { p: [s * 0.22, 0.05, 0.75], r: [Math.PI / 2, 0, 0] }))
  eye(b, 'turret', [0, 0.12, 0.55], 0.12, c.eye, 0, true)
  b.part('hatch', rbox(0.9, 0.5, 0.12, 0.3), c.main, { p: [0, 0, 0.06] })
  return b.build({ outline: 0.03, height: 2.6 })
}

export const poseGatekeeper = (rig: Rig, open: number, aim: number, step: number, t: number, m?: EnemyMotion): void => {
  const T = m ? t * m.tempo : t
  nudge(rig, 'body', 0, 0.06 * Math.abs(Math.sin(step * Math.PI)) + 0.02 * Math.sin(T * 1.5), 0)
  pose(rig, 'body', 0.03 * Math.sin(step * Math.PI * 2), 0, 0.04 * Math.sin(step * Math.PI))
  pose(rig, 'turret', -0.2 * aim, m ? 0.2 * m.look : 0, 0)
  // The chest hatch swings up on its top edge.
  pose(rig, 'hatch', -1.3 * open, 0, 0)
}

// ─── Stomper ─────────────────────────────────────────────────────────────────

export const buildHopper = (c: EnemyColors = BASE_COLORS.hopper): Rig => {
  const b = new RigBuilder()
  b.bone('hips', null, [0, 0.95, 0])
    .bone('body', 'hips', [0, 0.1, 0])
    .bone('legL', 'hips', [-0.26, -0.1, 0])
    .bone('footL', 'legL', [0, -0.62, 0])
    .bone('legR', 'hips', [0.26, -0.1, 0])
    .bone('footR', 'legR', [0, -0.62, 0])
  b.part('body', ell(0.52, 0.56, 0.48, 20, 14), c.main, { p: [0, 0.3, 0] })
  b.part('body', ell(0.44, 0.2, 0.4), c.deep, { p: [0, -0.02, 0] })
  eye(b, 'body', [0, 0.42, 0.36], 0.21, c.eye, 0, true)
  b.part('body', rcone(0.07, 0.02, 0.3, 0.02, 10), c.accent, { p: [0, 0.94, -0.05] })
  b.part('body', sph(0.06, 10, 8), c.accent, { p: [0, 1.1, -0.05], glow: true, outline: false })
  b.mirror((s) => {
    b.part('body', ell(0.14, 0.1, 0.12), c.deep, { p: [s * 0.5, 0.3, 0] })
  })
  b.mirror((s, t) => {
    // Coil-spring legs: stacked tori read as springs at any angle
    for (let k = 0; k < 4; k++) b.part(`leg${t}`, torus(0.11, 0.035, 6, 16), c.metal, { p: [0, -0.1 - k * 0.13, 0], r: [Math.PI / 2, 0, 0] })
    b.part(`foot${t}`, ell(0.2, 0.1, 0.28), c.deep, { p: [0, -0.02, 0.06] })
    b.part(`foot${t}`, ell(0.19, 0.04, 0.26), c.accent, { p: [0, -0.1, 0.06], outline: false })
  })
  return b.build({ outline: 0.02, height: 2.0 })
}

const animateHopper = (rig: Rig, squash: number, t: number, m: EnemyMotion): void => {
  const T = t * m.tempo
  const calm = m.calm
  const p = fidgetP(m, 'hopper')
  const fe = m.fid ? fidgetEnv(p) * calm : 0
  let crouch = 0
  let hopF = 0
  let lift = 0
  let shake = 0
  let yaw = 0
  let roll = 0
  if (m.fid === 1) {
    // Bounce-bounce: two small hops, each after a SHALLOW crouch (the leap's
    // telegraph is a full crouch with a red ring and a floor marker)
    const q = frac(p * 2)
    crouch = -0.2 * bump(q, 0, 0.3)
    hopF = 0.1 * bump(q, 0.3, 0.9)
  } else if (m.fid === 2) {
    // Leg shake: one coil draws up and shakes
    lift = 1
    shake = 0.15 * Math.sin(4 * TAU * p)
  } else if (m.fid === 3) {
    // Eye roll
    yaw = 0.6 * Math.sin(TAU * p)
    roll = 0.08 * Math.sin(2 * TAU * p)
  }
  // Breathing fades out under an attack squash, so its key poses are exact
  const quiet = 1 - Math.min(1, Math.abs(squash))
  const s = clamp(squash + 0.06 * Math.sin(T * 2.2) * quiet + crouch * fe, -1, 1)
  scaleBone(rig, 'legL', 1, (1 + s * 0.35) * (1 - 0.3 * lift * fe), 1)
  scaleBone(rig, 'legR', 1, 1 + s * 0.35, 1)
  pose(rig, 'legL', 0, 0, shake * fe)
  pose(rig, 'legR', 0, 0, 0)
  scaleBone(rig, 'body', 1 - s * 0.08, 1 + s * 0.1, 1 - s * 0.08)
  // m.hop: the engage hop arc (view-only), so the feet leave the floor for
  // every metre the stomper covers; it leans into the hop
  nudge(rig, 'hips', 0, s * 0.22 + Math.sin(T * 2.5) * 0.01 + m.hop + hopF * fe + 0.06 * m.startle, 0)
  pose(rig, 'body', 0.15 * (m.hop / HOP_H), 0.35 * m.look * calm + yaw * fe, 0.04 * Math.sin(T * 0.7) * calm + roll * fe)
}

/** squash: -1 crouch … 0 rest … 1 stretched (air). With `m`, the motion layer. */
export const poseHopper = (rig: Rig, squash: number, t: number, m?: EnemyMotion): void => {
  if (m) {
    animateHopper(rig, squash, t, m)
    return
  }
  const s = Math.max(-1, Math.min(1, squash))
  scaleBone(rig, 'legL', 1, 1 + s * 0.35, 1)
  scaleBone(rig, 'legR', 1, 1 + s * 0.35, 1)
  scaleBone(rig, 'body', 1 - s * 0.08, 1 + s * 0.1, 1 - s * 0.08)
  nudge(rig, 'hips', 0, s * 0.22 + Math.sin(t * 2.5) * 0.01, 0)
}

// ─── Gear Roller ─────────────────────────────────────────────────────────────

export const buildRoller = (c: EnemyColors = BASE_COLORS.roller): Rig => {
  const b = new RigBuilder()
  b.bone('root', null, [0, 0.7, 0])
    .bone('wheel', 'root', [0, 0, 0])
    .bone('driver', 'root', [0, 0.9, 0])
  b.part('wheel', torus(0.52, 0.16, 10, 28), c.main, { r: [0, Math.PI / 2, 0] })
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2
    b.part('wheel', sph(0.1, 10, 8), c.deep, { p: [0, Math.cos(a) * 0.68, Math.sin(a) * 0.68] })
  }
  b.part('wheel', rcyl(0.24, 0.3, 0.08, 16), c.metal, { r: [0, 0, Math.PI / 2] })
  b.part('wheel', rcyl(0.1, 0.36, 0.04, 12), c.accent, { r: [0, 0, Math.PI / 2] })
  // The little driver bot on the axle
  b.part('driver', sph(0.2, 16, 12), c.accent, { p: [0, 0.1, 0] })
  b.part('driver', ell(0.22, 0.06, 0.22), c.deep, { p: [0, 0.22, 0] })
  eye(b, 'driver', [0, 0.1, 0.17], 0.09, c.eye, 0, true)
  b.mirror((s) => {
    b.part('driver', cap(0.035, 0.1), c.metal, { p: [s * 0.2, -0.02, 0.06], r: [0.6, 0, s * 0.8] })
    // Little feet balancing on the rim
    b.part('driver', ell(0.06, 0.04, 0.08), c.deep, { p: [s * 0.09, -0.12, 0.02] })
  })
  return b.build({ outline: 0.018, height: 1.8 })
}

const animateRoller = (rig: Rig, wheelAngle: number, t: number, lean: number, m: EnemyMotion): void => {
  const T = t * m.tempo
  const calm = m.calm
  const w = m.walk
  const still = 1 - Math.min(1, w * 3)
  const p = fidgetP(m, 'roller')
  const fe = m.fid ? fidgetEnv(p) * calm : 0
  let fLook = 0
  let fTilt = 0
  let fBlip = 0
  let fHop = 0
  let fTop = 0
  if (m.fid === 1) {
    // Look-around with a head tilt
    fLook = 0.9 * Math.sin(TAU * p)
    fTilt = 0.15 * Math.sin(2 * TAU * p)
  } else if (m.fid === 2) {
    // Rev blip: a small forward-and-back twitch (the charge telegraph is a
    // continuous 30 rad/s rev with a red ring)
    fBlip = 0.9 * Math.sin(Math.PI * p)
    fHop = 0.05 * Math.sin(Math.PI * p)
  } else if (m.fid === 3) {
    // Near-topple, the driver counter-leaning
    fTop = 0.1 * Math.sin(3 * TAU * p) * (1 - p)
    fTilt = -1.2 * fTop
  }
  // Balancing rock at rest; rolling, the wheel angle comes from DISTANCE
  // (m.roll) plus the telegraph revs (wheelAngle = e.a), steered into the travel
  const rock = 0.08 * Math.sin(T * 0.9) * still
  poseYX(rig, 'wheel', wheelAngle + m.roll + rock + fBlip * fe, m.heading)
  const bank = clamp(-0.12 * m.turn * w, -0.25, 0.25)
  pose(rig, 'root', 0, 0, bank + 0.05 * w * Math.sin(m.roll * 0.5) + 0.03 * Math.sin(T * 0.9 + 0.7) * still + fTop * fe)
  pose(rig, 'driver', lean * 0.35 - 1.2 * rock, 0.6 * m.look * calm + fLook * fe, Math.sin(T * 6) * 0.05 + fTilt * fe)
  // The driver bounces with the WHEEL, not the clock
  nudge(rig, 'driver', 0, Math.abs(Math.sin(m.roll)) * 0.03 * w + Math.abs(Math.sin(T * 10)) * 0.006 * still + 0.06 * m.startle + fHop * fe, 0)
}

export const poseRoller = (rig: Rig, wheelAngle: number, t: number, lean: number, m?: EnemyMotion): void => {
  if (m) {
    animateRoller(rig, wheelAngle, t, lean, m)
    return
  }
  pose(rig, 'wheel', wheelAngle, 0, 0)
  pose(rig, 'driver', lean * 0.35, 0, Math.sin(t * 6) * 0.05)
  nudge(rig, 'driver', 0, Math.abs(Math.sin(t * 10)) * 0.03 * Math.min(1, Math.abs(lean) + 0.2), 0)
}

// ─── Guardroid (brute) ───────────────────────────────────────────────────────

export const buildBrute = (c: EnemyColors = BASE_COLORS.brute): Rig => bruteParts(c).build({ outline: 0.024, height: 2.45 })

/** The Guardroid's rig, not yet built (the Icebreaker Brute,
 *  `models/miniBoss/icebreakerBrute.ts`, builds on it). */
export const bruteParts = (c: EnemyColors = BASE_COLORS.brute): RigBuilder => {
  const b = new RigBuilder()
  b.bone('hips', null, [0, 1.0, 0])
    .bone('chest', 'hips', [0, 0.38, 0])
    .bone('head', 'chest', [0, 0.48, 0.06])
    .bone('shoulderL', 'chest', [-0.62, 0.22, 0])
    .bone('elbowL', 'shoulderL', [0, -0.42, 0])
    .bone('shoulderR', 'chest', [0.62, 0.22, 0])
    .bone('elbowR', 'shoulderR', [0, -0.42, 0])
    .bone('hipL', 'hips', [-0.22, -0.08, 0])
    .bone('kneeL', 'hipL', [0, -0.42, 0])
    .bone('hipR', 'hips', [0.22, -0.08, 0])
    .bone('kneeR', 'hipR', [0, -0.42, 0])
  b.part('hips', ell(0.36, 0.2, 0.28), c.deep)
  b.part('chest', ell(0.52, 0.42, 0.38, 20, 14), c.main, { p: [0, 0.08, 0] })
  b.part('chest', ell(0.34, 0.2, 0.12), c.deep, { p: [0, -0.1, 0.3] })
  b.part('chest', sph(0.13, 14, 10), c.eye, { p: [0, 0.14, 0.34], glow: true, outline: false })
  b.part('chest', torus(0.14, 0.035, 6, 18), c.accent, { p: [0, 0.14, 0.34] })
  b.part('head', ell(0.2, 0.17, 0.2, 16, 12), c.main, { p: [0, 0.08, 0] })
  b.part('head', ell(0.16, 0.05, 0.08), '#1d2438', { p: [0, 0.09, 0.15] })
  b.part('head', ell(0.13, 0.03, 0.03), c.eye, { p: [0, 0.09, 0.21], glow: true, outline: false })
  b.mirror((s, t) => {
    b.part(`shoulder${t}`, sph(0.28, 16, 12), c.deep)
    b.part(`shoulder${t}`, torus(0.25, 0.05, 6, 18), c.accent, { p: [s * 0.03, 0, 0], r: [0, 0, Math.PI / 2] })
    b.part(`shoulder${t}`, cap(0.13, 0.2), c.main, { p: [0, -0.2, 0] })
    b.part(`elbow${t}`, cap(0.15, 0.2), c.deep, { p: [0, -0.14, 0] })
    b.part(`elbow${t}`, sph(0.25, 16, 12), c.main, { p: [0, -0.4, 0.02] })
    b.part(`elbow${t}`, torus(0.18, 0.05, 6, 16), c.accent, { p: [0, -0.26, 0], r: [Math.PI / 2, 0, 0] })
    b.part(`hip${t}`, cap(0.14, 0.2), c.main, { p: [0, -0.2, 0] })
    b.part(`knee${t}`, cap(0.14, 0.16), c.deep, { p: [0, -0.16, 0] })
    b.part(`knee${t}`, ell(0.22, 0.15, 0.3), c.main, { p: [0, -0.46, 0.06] })
  })
  return b
}

/** The Guardroid's L arm at rest (R mirrors y and z): a hunched gorilla
 *  stance, fists hanging in front of the hips — the old rest had them 0.2 rad
 *  out to the sides (the A-pose). Every fist clearance is positive. */
export const BRUTE_REST: Readonly<ArmPose> = { x: -0.38, y: 0.18, z: -0.02, elbow: -0.7 }

const animateBrute = (rig: Rig, t: number, slam: number, m: EnemyMotion): void => {
  const T = t * m.tempo
  const calm = m.calm
  const g = GAIT.brute!
  const wk = gaitAmp(m.walk)
  const still = 1 - wk
  gaitLegs(g, m, wk)
  // Soft knees at rest (the soles stay down: hips drop 0.027), straight in the stride
  poseLegs(rig, -0.25 * still, 0.5 * still)
  const br = Math.sin(T * 1.6)
  const sh = Math.sin(T * 0.45 + 0.7)
  nudge(rig, 'hips', 0, -stanceDrop(g) - 0.027 * still + 0.01 * br * still - slam * 0.25 + 0.06 * m.startle, 0)
  const p = fidgetP(m, 'brute')
  const fe = m.fid ? fidgetEnv(p) * calm : 0
  let hZ = 0
  let cZ = 0
  let aX = 0
  let aY = 0
  let aE = 0
  let knock = 0
  let rollL = 0
  if (m.fid === 1) {
    // Neck crack: head over to one side, hold, the other, hold
    hZ = 0.4 * clamp(2 * Math.sin(TAU * p), -1, 1)
    cZ = -0.2 * hZ
  } else if (m.fid === 2) {
    // Knuckle knock: both fists come up IN FRONT of the chest and knock
    // inward twice — symmetric, unlike the combo (one arm drawn back) or the
    // slam (both back). They stop ~0.15 m apart: the shoulders are too wide
    // and the chest too deep for the 0.25 m fists to touch without clipping.
    aX = -0.8
    aY = 0.6
    aE = -0.6
    knock = 0.05 * Math.max(0, Math.sin(3 * TAU * p))
  } else if (m.fid === 3) {
    // Shoulder roll: each arm circles forward in turn (never back into an A)
    rollL = Math.sin(TAU * p)
    cZ = 0.08 * rollL
  }
  const look = m.look * calm
  const shiftX = 0.035 * sh * still - 0.045 * Math.sin(TAU * frac(m.phase / TAU)) * wk
  const twist = ((legL.th - legR.th) * 0.5 * 0.14 / g.A) * wk * gaitDir.f
  // Attack blend per arm: 0 = the rest layer, 1 = exactly the old attack pose
  const aL = m.armL
  const aR = m.armR
  const bL = Math.min(1, Math.max(Math.abs(aL), Math.abs(slam) * 2.5))
  const bR = Math.min(1, Math.max(Math.abs(aR), Math.abs(slam) * 2.5))
  const bAny = Math.max(bL, bR)
  nudge(rig, 'chest', shiftX, 0.012 * br * still, 0)
  pose(rig, 'chest', (0.12 + 0.035 * br * still) * (1 - bAny) + 0.12 * wk * gaitDir.f + 0.2 * slam, -0.35 * aL + 0.35 * aR - twist + 0.2 * look, -1.2 * shiftX + cZ * fe)
  pose(rig, 'head', -0.12 * (1 - bAny) - 0.1 * m.startle, clamp(0.45 * look, -0.9, 0.9), hZ * fe)
  const B = BRUTE_REST
  const breathArm = 0.04 * br * still
  // Arms counter-swing: L with the R leg, R with the L leg
  const swingL = (legR.th / g.A) * 0.3 * wk * gaitDir.f
  const swingR = (legL.th / g.A) * 0.3 * wk * gaitDir.f
  pose(rig, 'shoulderL',
    mix(B.x - swingL + breathArm + (aX - 0.15 * Math.max(0, rollL)) * fe - 0.2 * m.startle, -1.4 * Math.max(0, aL) + 0.6 * Math.max(0, -aL) - 2.6 * slam, bL),
    mix(B.y + (aY + knock) * fe, 0, bL),
    mix(B.z, -0.2, bL))
  pose(rig, 'elbowL', mix(B.elbow + aE * fe, -0.9 + 0.8 * Math.max(0, aL), bL), 0, 0)
  pose(rig, 'shoulderR',
    mix(B.x - swingR + breathArm + (aX - 0.15 * Math.max(0, -rollL)) * fe - 0.2 * m.startle, -1.4 * Math.max(0, aR) + 0.6 * Math.max(0, -aR) - 2.6 * slam, bR),
    mix(-B.y - (aY + knock) * fe, 0, bR),
    mix(-B.z, 0.2, bR))
  pose(rig, 'elbowR', mix(B.elbow + aE * fe, -0.9 + 0.8 * Math.max(0, aR), bR), 0, 0)
}

/** punch: which arm (−1 L, 1 R, 0 none) and wind-up k (−1 back … 1 thrown).
 *  With `m`, the motion layer: the two arms then come from m.armL / m.armR
 *  (one can return while the other winds up) and `slam` is the eased slam. */
export const poseBrute = (rig: Rig, t: number, walk: number, arm: number, k: number, slam: number, m?: EnemyMotion): void => {
  if (m) {
    animateBrute(rig, t, slam, m)
    return
  }
  const w = Math.sin(t * 5.5) * walk
  pose(rig, 'hipL', w * 0.4, 0, 0)
  pose(rig, 'hipR', -w * 0.4, 0, 0)
  pose(rig, 'kneeL', Math.max(0, -w) * 0.5, 0, 0)
  pose(rig, 'kneeR', Math.max(0, w) * 0.5, 0, 0)
  nudge(rig, 'hips', 0, Math.abs(w) * 0.05 - slam * 0.25, 0)
  const throwL = arm < 0 ? k : 0
  const throwR = arm > 0 ? k : 0
  pose(rig, 'shoulderL', -1.4 * Math.max(0, throwL) + 0.6 * Math.max(0, -throwL) - 2.6 * slam, 0, -0.2)
  pose(rig, 'shoulderR', -1.4 * Math.max(0, throwR) + 0.6 * Math.max(0, -throwR) - 2.6 * slam, 0, 0.2)
  pose(rig, 'elbowL', -0.9 + 0.8 * Math.max(0, throwL), 0, 0)
  pose(rig, 'elbowR', -0.9 + 0.8 * Math.max(0, throwR), 0, 0)
  pose(rig, 'chest', 0.2 * slam, -0.35 * throwL + 0.35 * throwR, 0)
}

// ─── Wall Cannon ─────────────────────────────────────────────────────────────

export const buildTurret = (c: EnemyColors = BASE_COLORS.turret): Rig => {
  const b = new RigBuilder()
  b.bone('base', null, [0, 0, 0])
    .bone('head', 'base', [0, 0.62, 0])
    .bone('barrel', 'head', [0, 0.08, 0.2])
  b.part('base', rcyl(0.55, 0.3, 0.12, 22), c.metal, { p: [0, 0.15, 0] })
  b.part('base', rcone(0.36, 0.26, 0.36, 0.06, 18), c.deep, { p: [0, 0.45, 0] })
  b.part('head', dome(0.42, Math.PI * 0.55, 20, 10), c.main, { p: [0, -0.05, 0] })
  b.part('head', torus(0.4, 0.05, 6, 22), c.deep, { p: [0, -0.05, 0], r: [Math.PI / 2, 0, 0] })
  eye(b, 'head', [0, 0.22, 0.31], 0.1, c.eye, 0, true)
  b.part('barrel', rcyl(0.11, 0.55, 0.04, 14), c.metal, { p: [0, 0, 0.25], r: [Math.PI / 2, 0, 0] })
  b.part('barrel', torus(0.11, 0.035, 6, 14), c.accent, { p: [0, 0, 0.52] })
  return b.build({ outline: 0.018, height: 1.2 })
}

const animateTurret = (rig: Rig, pitch: number, recoil: number, m: EnemyMotion): void => {
  const calm = m.calm
  const p = fidgetP(m, 'turret')
  const fe = m.fid ? fidgetEnv(p) * calm : 0
  let yaw = 0
  let pit = 0
  // Double-take: snap back toward where it just looked, then settle
  if (m.fid === 1) yaw = -0.3 * (m.look < 0 ? -1 : 1) * Math.sin(Math.PI * Math.sqrt(p))
  else if (m.fid === 2) pit = 0.6 * Math.sin(Math.PI * p) // barrel check
  // Sentry scan while unaware (eased sweeps and holds); in the fight the head
  // faces front and the whole cannon turns to the player (e.yaw)
  pose(rig, 'head', 0, 0.7 * m.look * calm + yaw * fe, 0)
  const rest = 0.2 + 0.03 * Math.sin(4 * m.look)
  pose(rig, 'barrel', -(mix(pitch, rest, calm) + pit * fe), 0, 0)
  nudge(rig, 'barrel', 0, 0, -recoil * 0.15)
}

export const poseTurret = (rig: Rig, pitch: number, recoil: number, m?: EnemyMotion): void => {
  if (m) {
    animateTurret(rig, pitch, recoil, m)
    return
  }
  pose(rig, 'barrel', -pitch, 0, 0)
  nudge(rig, 'barrel', 0, 0, -recoil * 0.15)
}

// ─── Crate Golem ─────────────────────────────────────────────────────────────
//
// Asleep it IS the sector's supply crate (models/props.ts buildCrate): the
// same 1.15 m rounded box in the crate's wood, the four trim-coloured corner
// bumpers, the trim discs on its front and back with an accent nub on each,
// the same outline. Nothing else shows. The lid is the box's own top rows cut
// off along a ring (kit.rboxSplit: the same vertices and normals, so the cut
// cannot be seen), and the visor, core, arms, legs and rocks sit INSIDE the
// closed box, the limbs scaled to nothing. Awake it unfolds: stone legs punch
// out under it and lift it half a metre, the front disc drops open like a jaw
// on a glowing visor slit, the lid tips back on a glowing core, and stubby
// stone-and-plank arms swing out of its sides. It throws rocks it pulls out
// of itself: one hand into the crate for a throw, both for the boulder lob.

/** props.ts buildCrate's `s`: asleep, the golem is exactly this box. */
export const GOLEM_CRATE = 1.15
/** How high the legs lift the box off the floor, awake (m). */
export const GOLEM_LIFT = 0.5
/** Hip bone → sole, at scale 1 (GAIT.golem.L). */
const GOLEM_LEG = 0.615
/** The hips sit this far above the box's bottom face (inside it). */
const GOLEM_HIP_IN = 0.115
/** The lid: the box's top 4 of 12 rings (its top face and rounded edge, 10 cm). */
const GOLEM_LID_ROWS = 4
/** The inside of the box (seen once the lid opens): its trim's wood, in shadow.
 *  Near-black read as a hole in the model, not as a crate's inside. */
const golemInside = (c: EnemyColors): string => `#${new Color(c.deep).multiplyScalar(0.7).getHexString()}`
/** The visor band behind the jaw. */
const GOLEM_VISOR = '#161a22'
/** A scale that hides a part inside the box (0 would make a singular matrix). */
const HIDE = 0.001

export const buildGolem = (c: EnemyColors = BASE_COLORS.golem): Rig => {
  const s = GOLEM_CRATE
  const h = s / 2
  const cut = rboxSplit(s, s, s, 0.28, GOLEM_LID_ROWS)
  const b = new RigBuilder()
  b.bone('root', null, [0, 0, 0])
    .bone('body', 'root', [0, h, 0])
    // Lid hinge: the back edge of the cut ring
    .bone('lid', 'body', [0, cut.y, -cut.halfD])
    // Jaw hinge: the bottom edge of the front disc
    .bone('hatch', 'body', [0, -s * 0.36, h])
    .bone('visor', 'body', [0, 0.1, h - 0.005])
    .bone('boulder', 'body', [0, 1.02, 0.18])
    .bone('shoulderL', 'body', [-0.47, 0.18, 0])
    .bone('elbowL', 'shoulderL', [0, -0.3, 0])
    .bone('shoulderR', 'body', [0.47, 0.18, 0])
    .bone('elbowR', 'shoulderR', [0, -0.3, 0])
    // On top of the fist boulder (it hid inside it at the fist's centre)
    .bone('rockR', 'elbowR', [0, -0.54, 0.1])
    .bone('hipL', 'body', [-0.27, -h + GOLEM_HIP_IN, 0.02])
    .bone('kneeL', 'hipL', [0, -0.3, 0])
    .bone('hipR', 'body', [0.27, -h + GOLEM_HIP_IN, 0.02])
    .bone('kneeR', 'hipR', [0, -0.3, 0])
  // ── The crate, part for part as buildCrate lays it out (body-local = the
  // crate's own coordinates minus its half height) ──
  b.part('body', cut.bottom, c.main)
  b.part('lid', cut.top, c.main, { p: [0, -cut.y, cut.halfD] })
  for (const x of [-1, 1]) {
    for (const z of [-1, 1]) {
      b.part('lid', sph(0.2, 10, 8), c.deep, { p: [x * s * 0.42, s * 0.9 - h - cut.y, z * s * 0.42 + cut.halfD] })
    }
  }
  b.part('hatch', ell(s * 0.36, s * 0.36, 0.06), c.deep, { p: [0, s * 0.36, 0] })
  b.part('hatch', sph(0.09, 8, 6), c.eye, { p: [0, s * 0.36, s * 0.54 - h], glow: true, outline: false })
  b.part('body', ell(s * 0.36, s * 0.36, 0.06), c.deep, { p: [0, 0, -h] })
  b.part('body', sph(0.09, 8, 6), c.eye, { p: [0, 0, -s * 0.54], glow: true, outline: false })
  // ── Inside the box (never outlined: a hull would poke through the crate) ──
  // Behind the jaw: a dark visor band with the glowing slit, both shallower
  // than the closed disc in front of them
  b.part('visor', ell(0.28, 0.1, 0.03), GOLEM_VISOR, { p: [0, 0, 0.01], outline: false })
  b.part('visor', ell(0.22, 0.034, 0.024), c.eye, { p: [0, 0.005, 0.022], glow: true, outline: false })
  // The floor of the open top, the core glowing in a dark socket. Both dark
  // plates keep ≥ 2 cm inside the box's FACETED walls (between two rings a
  // wall is a chord, inside the smooth shape): at 3 mm one showed as a sliver.
  // From Flux's eye height (1.36 m, under the awake box's top) a gap round
  // the plate's rim is never seen.
  const inside = golemInside(c)
  b.part('body', rbox(1.04, 0.05, 1.04, 0.3), inside, { p: [0, cut.y - 0.05, 0], outline: false })
  b.part('body', torus(0.15, 0.035, 6, 16), '#2e2b38', { p: [0, cut.y - 0.04, 0], r: [Math.PI / 2, 0, 0], outline: false })
  b.part('body', sph(0.1, 12, 8), c.eye, { p: [0, cut.y - 0.06, 0], glow: true, outline: false })
  // The lid's underside
  b.part('lid', rbox(1.02, 0.04, 1.02, 0.3), inside, { p: [0, 0.03, cut.halfD], outline: false })
  // ── Limbs: stone, strapped with planks, iron at the joints ──
  b.mirror((_s, t) => {
    b.part(`shoulder${t}`, sph(0.14, 12, 8), c.accent)
    b.part(`shoulder${t}`, cap(0.1, 0.14), c.metal, { p: [0, -0.15, 0] })
    b.part(`shoulder${t}`, rbox(0.25, 0.09, 0.25, 0.35), c.main, { p: [0, -0.13, 0] })
    b.part(`elbow${t}`, cap(0.115, 0.08), c.metal, { p: [0, -0.1, 0] })
    b.part(`elbow${t}`, torus(0.125, 0.035, 6, 14), c.accent, { p: [0, -0.17, 0], r: [Math.PI / 2, 0, 0] })
    b.part(`elbow${t}`, rock(0.23, t === 'L' ? 11 : 12), c.metal, { p: [0, -0.34, 0.03] })
    b.part(`hip${t}`, sph(0.13, 12, 8), c.accent)
    b.part(`hip${t}`, cap(0.12, 0.1), c.metal, { p: [0, -0.15, 0] })
    b.part(`knee${t}`, cap(0.115, 0.06), c.metal, { p: [0, -0.09, 0] })
    b.part(`knee${t}`, torus(0.12, 0.03, 6, 14), c.accent, { p: [0, -0.05, 0], r: [Math.PI / 2, 0, 0] })
    // A plank-shod stone foot; its sole is GOLEM_LEG below the hip
    b.part(`knee${t}`, rbox(0.3, 0.14, 0.42, 0.4), c.deep, { p: [0, -(GOLEM_LEG - 0.3) + 0.07, 0.06] })
  })
  b.part('rockR', rock(0.19, 3), c.metal)
  b.part('boulder', rock(0.36, 7), c.metal)
  // `height` places the telegraph ring: over the boulder it heaves (≈2.46 m), not in it
  const rig = b.build({ outline: 0.028, height: 2.1 })
  // Born asleep: limbs in, lid and jaw shut
  poseGolem(rig, 0, 0, 0, 0, 0)
  return rig
}

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)
/** Ease-out with a small overshoot (≈6 %): parts that spring into place. */
const backOut = (x: number): number => {
  const k = clamp01(x) - 1
  return 1 + 2.3 * k * k * k + 1.3 * k * k
}

/** The throwing arm (shoulder x, z, elbow): wound up over the lid, and thrown. */
// Wound up BESIDE the lid, not behind it: seen from the front, a fist behind
// the tipped-up lid hid the whole wind-up
const GOLEM_WOUND = { x: -3.1, z: 0.7, elbow: -0.9 } as const
const GOLEM_THROWN = { x: -1.3, z: -0.05, elbow: -0.1 } as const
/** Both arms under the boulder, overhead (the R arm mirrors z). */
const GOLEM_HEAVE = { x: -2.8, z: 0.42, elbow: -0.45 } as const

/**
 * unfold: 0 asleep (exactly the crate) … 1 unfolded. arm: the throw, one path
 * — up over the top from rest to the wind-up (−1: the rock drawn out of the
 * crate over the lid), then the whip from there to the release (1). The
 * motion layer blends that path over the rest layer by `m.armL` (1 all
 * through the throw, eased out after it), so the release never swings back
 * down through the rest pose; without `m` (ModelLab) any arm ≠ 0 is fully
 * blended. lift: the boulder (0 rest … 1 held overhead; the release brings it
 * down the front). hop: the dodge, signed toward the hop side (0 standing).
 * With `m`, the walk, breathing, the brace tell and the rock and boulder in
 * hand; without it, those show at the wind-up's top.
 */
export const poseGolem = (rig: Rig, unfold: number, arm: number, lift: number, hop: number, t: number, m?: EnemyMotion): void => {
  const u = clamp01(unfold)
  const T = m ? t * m.tempo : t
  const up = u >= 1 ? 1 : 0
  // ── The unfold's beats: a rattle, the legs, the jaw, the eye, the lid, the arms ──
  const kLeg = smoothstep(0.1, 0.42, u)
  const kJaw = smoothstep(0.28, 0.55, u)
  const kEye = smoothstep(0.5, 0.62, u)
  const kLid = smoothstep(0.38, 0.7, u)
  const kArm = smoothstep(0.5, 0.86, u)
  const rattle = 0.05 * Math.sin(u * 95) * bump(u, 0, 0.3)
  const clack = bump(u, 0.8, 1)
  const liftY = GOLEM_LIFT * backOut(kLeg)
  // ── Motion layer ──
  const g = GAIT.golem!
  const wk = m ? gaitAmp(m.walk) * up : 0
  const brace = m ? m.brace * up : 0
  const grip = m ? m.grip : arm < -0.5 ? 1 : 0
  const held = m ? m.boulder : lift > 0.5 ? 1 : 0
  const ah = Math.abs(hop)
  const wThrow = m ? m.armL : arm !== 0 ? 1 : 0
  /** How far the hand is up over the lid (1 = fully wound), and the whip (1 = thrown). */
  const aT = wThrow * (arm <= 0 ? -arm : 1 - arm)
  const aF = wThrow * Math.max(0, arm)
  const lU = clamp01(lift)
  const br = Math.sin(T * 2.1) * up * (1 - wk)
  // ── Legs: grown to reach the floor as the box rises; then the gait ──
  const legS = kLeg > 0 ? Math.min(1.1, (GOLEM_HIP_IN + liftY) / GOLEM_LEG) : HIDE
  scaleBone(rig, 'hipL', legS)
  scaleBone(rig, 'hipR', legS)
  let drop = 0
  if (m && wk > 0) {
    gaitLegs(g, m, wk)
    drop = stanceDrop(g)
    poseLegs(rig, -0.55 * ah - 0.2 * brace, 1.1 * ah + 0.4 * brace)
  } else {
    pose(rig, 'hipL', -0.55 * ah - 0.2 * brace, 0, 0)
    pose(rig, 'hipR', -0.55 * ah - 0.2 * brace, 0, 0)
    pose(rig, 'kneeL', 1.1 * ah + 0.4 * brace, 0, 0)
    pose(rig, 'kneeR', 1.1 * ah + 0.4 * brace, 0, 0)
  }
  // ── Body: rides the legs, breathes, braces, twists into the throw ──
  const crouch = 0.1 * brace + 0.12 * ah
  nudge(rig, 'body', 0, liftY - drop - crouch + 0.012 * br, 0)
  const sway = 0.04 * Math.sin(TAU * frac((m ? m.phase : 0) / TAU)) * wk
  pose(rig, 'body',
    0.06 * wk + 0.06 * brace - 0.12 * lU + 0.06 * aF,
    0.28 * aT - 0.34 * aF,
    rattle + sway - 0.3 * hop)
  // ── Jaw, visor, lid (the lid gapes while a hand is in the crate) ──
  pose(rig, 'hatch', 1.0 * backOut(kJaw) + (0.05 * Math.sin(T * 7.3) + 0.25 * lU + 0.12 * aT) * up, 0, 0)
  const blink = 1 - 0.92 * bump(frac(T * 0.23), 0, 0.035) * up
  scaleBone(rig, 'visor', 1, Math.max(HIDE, kEye * blink * (1 - 0.55 * brace)), 1)
  pose(rig, 'lid', -(0.55 * backOut(kLid) + (0.05 * Math.sin(T * 1.7) + 0.3 * clamp01(aT * 1.4) + 1.05 * lU + 0.15 * brace) * up), 0, 0)
  // ── Arms: out of the sides; a clack of the fists to finish the unfold ──
  const armS = kArm > 0 ? Math.max(HIDE, backOut(kArm)) : HIDE
  scaleBone(rig, 'shoulderL', armS)
  scaleBone(rig, 'shoulderR', armS)
  nudge(rig, 'shoulderL', 0.3 * (1 - kArm), 0, 0)
  nudge(rig, 'shoulderR', -0.3 * (1 - kArm), 0, 0)
  // Counter-swing: L with the R leg, R with the L leg
  const swL = m && wk > 0 ? (legR.th / g.A) * 0.35 * wk * gaitDir.f : 0
  const swR = m && wk > 0 ? (legL.th / g.A) * 0.35 * wk * gaitDir.f : 0
  const restX = -0.2 + 0.03 * br - 0.9 * clack - 0.7 * brace - 0.4 * ah
  const restZ = 0.25 + 0.6 * (1 - kArm) - 0.28 * clack + 0.8 * ah
  const restE = -0.5 - 0.6 * clack - 0.9 * brace
  // The heave: up the front to overhead (angles interpolate through "forward")
  const H = GOLEM_HEAVE
  pose(rig, 'shoulderL', mix(restX - swL, H.x, lU), 0, mix(-restZ, H.z, lU))
  pose(rig, 'elbowL', mix(restE, H.elbow, lU), 0, 0)
  const layX = mix(restX - swR, H.x, lU)
  const layZ = mix(restZ, -H.z, lU)
  const layE = mix(restE, H.elbow, lU)
  // The throw path over that layer: rest → wound (arm −1), wound → thrown (arm 1)
  const W = GOLEM_WOUND
  const F = GOLEM_THROWN
  const pX = arm <= 0 ? mix(layX, W.x, -arm) : mix(W.x, F.x, arm)
  const pZ = arm <= 0 ? mix(layZ, W.z, -arm) : mix(W.z, F.z, arm)
  const pE = arm <= 0 ? mix(layE, W.elbow, -arm) : mix(W.elbow, F.elbow, arm)
  pose(rig, 'shoulderR', mix(layX, pX, wThrow), 0, mix(layZ, pZ, wThrow))
  pose(rig, 'elbowR', mix(layE, pE, wThrow), 0, 0)
  // ── What it throws ──
  scaleBone(rig, 'rockR', Math.max(HIDE, grip))
  scaleBone(rig, 'boulder', Math.max(HIDE, held))
  // The boulder rises out of the open top into the raised fists
  nudge(rig, 'boulder', 0, -0.85 * (1 - lU), -0.18 * (1 - lU))
}

export const buildEnemyRig = (kind: EnemyKind, colors?: EnemyColors): Rig => {
  const c = colors ?? BASE_COLORS[kind]
  switch (kind) {
    case 'hardhat': return buildHardhat(c)
    case 'trooper': return buildTrooper(c)
    case 'heli': return buildHeli(c)
    case 'hopper': return buildHopper(c)
    case 'roller': return buildRoller(c)
    case 'brute': return buildBrute(c)
    case 'turret': return buildTurret(c)
    case 'golem': return buildGolem(c)
    case 'polar': return buildPolar(c)
    case 'mole': return buildMole(c)
    case 'puffer': return buildPuffer(c)
    case 'stalker': return buildStalker(c)
    case 'spotter': return buildSpotter(c)
    case 'hornet': return buildHornet(c)
    case 'warden': return buildWarden(c)
    case 'gatekeeper': return buildGatekeeper(c)
    // Built from its Master's rig by `createEnemy` (it knows which).
    case 'echo': return buildWarden(c)
    // Built from its registry entry by `createMiniBoss` (it knows which).
    case 'miniboss': return buildBrute(c)
  }
}
