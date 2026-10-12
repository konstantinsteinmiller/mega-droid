import type { EnemyKind } from './enemies'
import type { BossId } from './bosses'

/**
 * ─── Enemy motion channels ───────────────────────────────────────────────────
 *
 * What makes a machine look alive between its attacks, as plain numbers: one
 * `EnemyMotion` per enemy, allocated once (`newMotion`), advanced by the sim
 * every tick (`stepMotion`, sim/enemies.ts) and read by the pose functions in
 * models/enemies.ts through their optional last argument.
 *
 * Three layers:
 *  - LOCOMOTION, measured: `walk` is how fast the body really moved this tick
 *    (not what the AI meant to do), and `stride` is the gait phase, advanced
 *    by DISTANCE (plus a shuffle while turning on the spot). A machine that
 *    stands still never plays its walk cycle, and a walking one never skates:
 *    the stance foot moves back by exactly the ground the body covers.
 *  - IDLE: `calm` (1 while unaware), a per-enemy `tempo` so a room never
 *    breathes in lockstep, glances (`look`) and random fidgets whose
 *    envelope starts and ends at exactly zero.
 *  - ATTACK channels eased at state edges (heli tilt, roller lean, brute
 *    punches): strikes follow their target, only the RETURNS are eased, so a
 *    telegraph reads exactly as before and nothing snaps back in one frame.
 *
 * Pure math and data (no three.js): unit-testable and allocation-free.
 */

export const TAU = Math.PI * 2

export interface EnemyMotion {
  // ── Locomotion (measured) ──
  /** 0..1: ground speed actually covered / the kind's top speed, smoothed. */
  walk: number
  /** Ground speed actually covered (m/s, plus the turn shuffle), smoothed:
   *  the stride integrates it, so a one-tick burst of AI chatter cannot jump
   *  the legs, while over any sustained walk it sums to the exact distance. */
  speed: number
  /** Gait phase (rad), advanced by distance: 2π per cycle (two steps). */
  stride: number
  /** 0..1 eased: moving far faster than its walk (a boss's dash or charge).
   *  The legs fold still instead of strobing through ten steps a second. */
  dash: number
  /** `stride` at the previous tick (render interpolation, like px/pz). */
  pstride: number
  /** View scratch: `stride` interpolated to the rendered frame. */
  phase: number
  /** Smoothed travel direction in the body frame: forward (+Z) share… */
  fwd: number
  /** …and the share toward +X (the rig's R-bones side). */
  side: number
  /** Smoothed yaw rate (rad/s): banking, turn-on-the-spot steps. */
  turn: number
  /** Yaw at the start of the tick (set by updateEnemy's prologue). */
  pyaw: number
  /** Roller: wheel angle from distance. Heli: extra rotor spin with airspeed. */
  roll: number
  /** Roller: the wheel's heading into its travel (rad, body frame). */
  heading: number
  /** Hopper: the view-only hop arc height (m). */
  hop: number
  /** Hopper: squash (−) / stretch (+), eased into a telegraph that starts
   *  mid-hop; the leap's take-off and landing still snap (impact beats). */
  squash: number
  // ── Idle ──
  /** 1 = unaware (state idle) … 0 = in the fight. */
  calm: number
  /** Wake-up jolt 0..1..0 over the first 0.3 s of `alert`. */
  startle: number
  /** Per-enemy rate factor (0.88..1.12): no two machines breathe in step. */
  tempo: number
  /** Current fidget (1-based index into FIDGET_LEN[kind]; 0 = none). */
  fid: number
  /** Seconds into the current fidget (scaled by tempo). */
  fidT: number
  /** Seconds until the next fidget may start. */
  fidCd: number
  /** Glance −1..1 (eased toward `lookTo`); each kind scales it to its range. */
  look: number
  lookTo: number
  /** Seconds until the next glance target. */
  lookT: number
  /** Per-enemy LCG state: deterministic picks, reproducible tests. */
  rng: number
  // ── Eased attack channels ──
  /** Heli pitch / roller lean (rad). */
  tilt: number
  /** Brute punch per arm: −1 wound back … 0 rest … 1 thrown. */
  armL: number
  armR: number
  /** Brute overhead slam (−0.4 wind … 1 up). */
  slam: number
  /** Humanoid boss: weight of the airborne (leap) pose, eased. */
  air: number
  /** Humanoid boss: weight of the dizzy (stun) pose, eased. */
  daze: number
  // ── Crate golem ──
  /** 0..1: a full charge is aimed at it from out of reach, and it knows —
   *  it crouches and narrows its visor (the tell that a hop is coming). */
  brace: number
  /** 0..1: the rock in its throwing fist (grabbed in the crate, gone at the release). */
  grip: number
  /** 0..1: the boulder it hauls out of itself for the lob (gone at the release). */
  boulder: number
}

/** Next pseudo-random number in [0, 1) from the enemy's own stream. */
export const rand = (m: EnemyMotion): number => {
  m.rng = (Math.imul(m.rng, 1664525) + 1013904223) >>> 0
  return m.rng / 4294967296
}

/** A fresh motion record. `seed` (the enemy id) desyncs tempo, first fidget
 *  and gait phase between machines; the result is the same for the same seed. */
export const newMotion = (seed: number, kind?: EnemyKind): EnemyMotion => {
  const m: EnemyMotion = {
    walk: 0, speed: 0, stride: 0, dash: 0, pstride: 0, phase: 0, fwd: 1, side: 0, turn: 0, pyaw: 0, roll: 0, heading: 0, hop: 0, squash: 0,
    calm: 1, startle: 0, tempo: 1, fid: 0, fidT: 0, fidCd: 0, look: 0, lookTo: 0, lookT: 0,
    rng: (Math.imul(seed | 0, 2654435761) >>> 0) || 1,
    tilt: kind === 'heli' ? 0.08 : kind === 'roller' ? 0.2 : 0, armL: 0, armR: 0, slam: 0, air: 0, daze: 0,
    brace: 0, grip: 0, boulder: 0
  }
  m.tempo = 0.88 + 0.24 * rand(m)
  m.fidCd = 0.5 + 5.5 * rand(m)
  m.lookT = 0.5 + 2 * rand(m)
  m.stride = rand(m) * TAU
  m.pstride = m.stride
  m.phase = m.stride
  return m
}

// ─── Gait ─────────────────────────────────────────────────────────────────────

export interface GaitSpec {
  /** Hip pivot → sole (m), measured on the rig. For a foot-only rig (hardhat)
   *  1, so `sin(angle)` IS the foot's fore-aft offset. */
  L: number
  /** Largest leg swing (rad) at full walk. */
  A: number
  /** Share of the cycle a foot stays planted. */
  beta: number
  /** Knee flex at mid-swing (rad); for a foot-only rig, the swing foot's lift (m). */
  knee: number
  /** Half the stance width (m): feet shuffle this far per radian of turn. */
  hipW: number
  /** How much shorter a side-step is than a forward step (0..1, default
   *  0.65): short for the machines' narrow stances; a boss strafing at full
   *  speed needs longer ones, or its cadence would outrun the frame rate. */
  side?: number
}

/**
 * Legged kinds. `L` is measured from the rig's bones (hip → knee → sole),
 * because the planted-foot condition is exact only for the real length: the
 * phase-1 prototype slipped 13 % with a guessed brute leg and 1.5 % with 1.03.
 */
export const GAIT: Partial<Record<EnemyKind, GaitSpec>> = {
  hardhat: { L: 1, A: 0.1, beta: 0.5, knee: 0.05, hipW: 0.16 },
  trooper: { L: 0.68, A: 0.5, beta: 0.5, knee: 1.0, hipW: 0.13 },
  brute: { L: 1.03, A: 0.38, beta: 0.55, knee: 0.8, hipW: 0.22 },
  // Stubby stone legs under a crate: hip → knee 0.3, knee → sole 0.315
  golem: { L: 0.615, A: 0.32, beta: 0.55, knee: 0.7, hipW: 0.27 }
}

/**
 * The humanoid bosses' legs (rig units; the sim scales the cycle by the rig's
 * own scale, ×1.35 for a Master). The four Masters share Flux's proportions
 * (hip → knee 0.22, knee → sole 0.335); the Scrapper is built like a Guardroid.
 * Dr. Vex hovers: no gait.
 */
const MASTER_GAIT: GaitSpec = { L: 0.555, A: 0.5, beta: 0.5, knee: 0.9, hipW: 0.11, side: 0.4 }
export const BOSS_GAIT: Partial<Record<BossId, GaitSpec>> = {
  scrapper: { L: 1.04, A: 0.4, beta: 0.55, knee: 0.8, hipW: 0.28, side: 0.6 },
  blazeMaster: MASTER_GAIT,
  frostMaster: MASTER_GAIT,
  voltMaster: MASTER_GAIT,
  galeMaster: MASTER_GAIT,
  magnetMaster: MASTER_GAIT,
  drillMaster: MASTER_GAIT,
  tideMaster: MASTER_GAIT,
  neonMaster: MASTER_GAIT,
  rotorMaster: MASTER_GAIT
}

/**
 * Flux's own legs, for the times he is seen whole walking (the exit
 * cutscene, `sim/exitRun.ts`): hip → knee 0.19, knee → sole 0.36 on his rig
 * (`models/hero.ts`).
 */
export const HERO_GAIT: GaitSpec = { L: 0.55, A: 0.42, beta: 0.5, knee: 0.95, hipW: 0.125 }

/** Gait amplitude 0..1: ramps in over the first 35 % of `walk`. */
export const gaitAmp = (walk: number): number => Math.min(1, walk / 0.35)

/** Swing amplitude (rad) along the travel. Side-steps are shorter: each foot
 *  sweeps outward of its own hip (the legs never cross), so a full swing
 *  would splay the stance. `side` is the unit travel direction's +X share. */
export const swingA = (g: GaitSpec, walk: number, side: number): number =>
  g.A * gaitAmp(walk) * (1 - (g.side ?? 0.65) * Math.min(1, Math.abs(side)))

/** Metres per gait cycle (two steps) at swing `a`: the stance foot sweeps
 *  2·L·sin(a) while the body covers beta·C. Floored so a barely-moving
 *  machine takes quick small steps instead of an infinite cadence. */
export const cycleLen = (g: GaitSpec, a: number): number =>
  Math.max(0.35 * (2 * g.L * Math.sin(g.A)) / g.beta, (2 * g.L * Math.sin(a)) / g.beta)

export interface LegSample {
  /** Leg angle (rad), + = foot ahead along the travel. */
  th: number
  /** Knee flex (rad) — or, for a foot-only rig, foot lift (m). */
  knee: number
  /** Foot planted. */
  stance: boolean
}

/**
 * One leg at cycle position `u` ∈ [0, 1). Stance keeps the foot's offset
 * LINEAR in u (`sin th` falls at a constant rate), so the planted foot moves
 * back at exactly the ground speed, knee straight; the swing brings it forward
 * on an eased arc with the knee lifted.
 */
export const legAt = (u: number, sinA: number, beta: number, kneeMax: number, out: LegSample): LegSample => {
  if (u < beta) {
    out.th = Math.asin(sinA * (1 - (2 * u) / beta))
    out.knee = 0
    out.stance = true
  } else {
    const s = (u - beta) / (1 - beta)
    out.th = -Math.asin(sinA) * Math.cos(Math.PI * s)
    out.knee = kneeMax * Math.sin(Math.PI * s)
    out.stance = false
  }
  return out
}

export const frac = (x: number): number => x - Math.floor(x)

// ─── Fidgets ──────────────────────────────────────────────────────────────────

/** Length (s) of each kind's idle fidgets, in id order (id = index + 1). */
export const FIDGET_LEN: Record<EnemyKind, readonly number[]> = {
  // peek-look, helmet settle, shuffle-turn
  hardhat: [2.4, 0.9, 1.2],
  // look-around, check gun, shield shrug, antenna twitch
  trooper: [2.6, 1.8, 1.2, 0.5],
  // claw snap, hiccup dip, spin check
  heli: [0.8, 1.2, 1.6],
  // bounce-bounce, leg shake, eye roll
  hopper: [1.1, 1.0, 1.8],
  // look-around, rev blip, near-topple
  roller: [2.0, 0.7, 1.2],
  // neck crack, knuckle bump, shoulder roll
  brute: [1.4, 1.6, 1.5],
  // double-take, barrel check
  turret: [1.2, 1.4],
  // None: asleep it is a crate, and a crate never fidgets (awake, it is never
  // unaware again)
  golem: [],
  // None: it hovers and hums; its shell's shiver is its idle.
  polar: [],
  // None: unaware it sits half dug in, paws scraping (its pose's idle).
  mole: [],
  // None: it bobs and fans its fins (its pose's idle).
  puffer: [],
  // None: it sways on its wheel (its pose's idle).
  stalker: [],
  // None: it hovers, its fans hum and its lamp searches (its pose's idle).
  spotter: [],
  // None: it hovers and buzzes (its pose's idle).
  hornet: [],
  // None: the Fortress's machines stand their post.
  warden: [],
  gatekeeper: [],
  echo: [],
  // None: a mini-boss runs its own pose (`sim/miniBosses.ts`).
  miniboss: []
}

export const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** Fidget envelope: exactly 0 at p = 0 and p = 1 (so every fidget returns to
 *  neutral by construction), 1 through the middle. */
export const fidgetEnv = (p: number): number => smoothstep(0, 0.15, p) * (1 - smoothstep(0.8, 1, p))

/**
 * The humanoid bosses' taunts: short (they only play in the ≈0.5–0.7 s
 * `recover` after an attack — never in the intro, a telegraph or an attack).
 * Id 1 is a shoulder roll for all; id 2 each boss's own flourish. Dr. Vex: none.
 */
export const BOSS_FIDGET_LEN: Record<BossId, readonly number[]> = {
  // shoulder roll, hammer tap
  scrapper: [0.6, 0.8],
  // shoulder roll, nozzle flick
  blazeMaster: [0.6, 0.6],
  // shoulder roll, blade check
  frostMaster: [0.6, 0.7],
  // shoulder roll, crackle
  voltMaster: [0.6, 0.6],
  // shoulder roll, fan flourish
  galeMaster: [0.6, 0.7],
  // shoulder roll, polarity clap
  magnetMaster: [0.6, 0.8],
  // shoulder roll, drill rev
  drillMaster: [0.6, 0.7],
  // shoulder roll, breaststroke
  tideMaster: [0.6, 0.9],
  // shoulder roll, blade flourish
  neonMaster: [0.6, 0.8],
  // shoulder roll, rotor check
  rotorMaster: [0.6, 0.8],
  vexMk1: []
}

/** Progress 0..1 of the current fidget in a length table (0 when none). */
export const fidgetPIn = (m: EnemyMotion, lens: readonly number[]): number => {
  const len = m.fid > 0 ? lens[m.fid - 1] : undefined
  return len ? Math.min(1, m.fidT / len) : 0
}

/** Progress 0..1 of the current fidget (0 when none). */
export const fidgetP = (m: EnemyMotion, kind: EnemyKind): number => fidgetPIn(m, FIDGET_LEN[kind])

/** A half-sine bump: 0 outside [a, b], 1 at its middle. */
export const bump = (x: number, a: number, b: number): number =>
  x <= a || x >= b ? 0 : Math.sin((Math.PI * (x - a)) / (b - a))

/**
 * Hopper squash (−) / stretch (+) through one engage hop; `b` ∈ [0, 1) is the
 * AI's own hop clock (it moves only while b < 0.45, so the feet are off the
 * floor for every metre it covers). Continuous, and 0 at both ends.
 */
export const hopSquash = (b: number): number =>
  0.35 * bump(b, 0, 0.2) + 0.12 * bump(b, 0.1, 0.45) - 0.4 * bump(b, 0.45, 0.62) - 0.3 * bump(b, 0.8, 1)

/** Height (m) of the hopper's engage hop arc. */
export const HOP_H = 0.3
/** Rolling radius of the gear roller's wheel (root height, m). */
export const ROLLER_R = 0.7
