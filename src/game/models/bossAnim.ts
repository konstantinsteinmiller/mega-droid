import { pose, nudge, type Rig } from './kit'
import type { BossId } from './bosses'
import { BOSS_GAIT, TAU, frac, gaitAmp, smoothstep, type EnemyMotion } from './motion'
import { legL, legR, gaitDir, gaitLegs } from './gait'
import { newSpring, springTo, newPulse, firePulse, stepPulse, turnToward, clamp, stepResponse, type Spring, type Pulse } from './spring'

/**
 * ─── The humanoid bosses' motion layer, v2 (#183) ────────────────────────────
 *
 * The first motion layer (`models/bosses.ts`) gave the Masters and the
 * Scrapper a ready stance, a planted-foot walk and taunts, but every attack
 * still wound up the same crouch and struck the same two-arm thrust, the
 * strike's first frame snapped from the wind-up, a recovery was a linear
 * 0.25 s fade, a leap landed stiff and a blink popped. This layer keeps the
 * base (stance, breath, gait, taunts) and drives everything above it with
 * damped springs (`models/spring.ts`), stepped with the sim (`stepBossAnim`,
 * after every `updateBoss` tick) and read by the pose (`poseMasterAnim`):
 *
 *  - STYLES: every pattern belongs to a family (`ATTACK_STYLE`) with its own
 *    wind-up pose, its own pose held through the attack, and its own accent
 *    on each release (`step` ticking over: a shot, a wave, a swing). A volley
 *    coils and fires arm after arm, a slam raises both fists overhead and
 *    drives them into the floor, a ring burst gathers hunched and flings the
 *    arms wide, a dash crouches like a sprinter and slashes, a charge drops
 *    a shoulder, a leap crouches deep, a dive spreads its arms, a blink
 *    folds in and fades out.
 *  - WEIGHTS on springs: wind-up, hold, strike, airborne, dizzy, death. A
 *    snapping target is crossed in a few frames with a little overshoot and a
 *    settle; the recovery flows back to the stance.
 *  - KICKS: velocity impulses that ring out by themselves — a shot's recoil,
 *    a landing's squash (with the root squashed for real), a hit's flinch, a
 *    footfall's dip.
 *  - SECONDARY motion: a lean into every acceleration with the arms trailing
 *    it, the head locked on Flux at a servo's capped turn rate (it keeps
 *    the gaze while the chest twists into a coil), servo micro-saccades at
 *    rest (quick, exact, sprung — not jitter), and the hips set from the legs
 *    so a crouch keeps the soles on the floor.
 *
 * View only: it reads the boss (a `BossAnimSource`, the `Enemy` fits) and
 * never writes it, so every hit, telegraph and attack frame is where it was.
 * Allocation-free per frame (module scratch, springs made once).
 */

// ─── Styles ──────────────────────────────────────────────────────────────────

export type BossStyle = 'shoot' | 'lob' | 'slam' | 'nova' | 'channel' | 'rush' | 'ram' | 'leap' | 'dive' | 'blink' | 'burrow'

/** Every Master pattern's family (`sim/bosses.ts` PATTERN, plus the roar). */
export const ATTACK_STYLE: Readonly<Record<string, BossStyle>> = {
  iceVolley: 'shoot', iceVolleyBig: 'shoot', neonVolley: 'shoot', flameBurst: 'shoot', featherFan: 'shoot',
  featherStorm: 'shoot', chainBolt: 'shoot', orbStorm: 'shoot', bubbleVolley: 'shoot', magnetMissiles: 'shoot',
  polarStorm: 'shoot', droneSwarm: 'shoot', rotorStorm: 'shoot', bladeBoomerang: 'shoot',
  scrapToss: 'lob', lobBarrage: 'lob', drillBombs: 'lob', freezeFloor: 'lob',
  fireWave: 'slam', tidalWave: 'slam', tornado: 'slam', laserGrid: 'slam', quake: 'slam',
  flameRing: 'nova', voltRing: 'nova', roar: 'nova',
  whirlpool: 'channel', polePull: 'channel', downdraft: 'channel',
  charge: 'ram', dashSlash: 'rush', magnetPunch: 'rush',
  stomp: 'leap', leapSlam: 'leap', dive: 'dive', blink: 'blink', burrow: 'burrow'
}

export const styleOf = (attack: string): BossStyle => ATTACK_STYLE[attack] ?? 'shoot'

// ─── State ───────────────────────────────────────────────────────────────────

/** What the layer reads of the boss (the `Enemy` record fits). */
export interface BossAnimSource {
  state: string
  st: number
  attack: string
  step: number
  teleDur: number
  x: number
  z: number
  px: number
  pz: number
  y: number
  py: number
  yaw: number
  flash: number
  deathT: number
  buried?: boolean
}

export interface BossAnim {
  /** The family of the attack under way (kept through the recovery). */
  style: BossStyle
  /** The attack's own name. */
  attack: string
  /** Which arm the last release came from: 1 = R, −1 = L… */
  arm: number
  /** …and the held pose's lead, crossfading after it (1 = R, −1 = L). */
  side: Spring
  /** Weights 0..1 (springs; they overshoot a little and settle). */
  wind: Spring
  hold: Spring
  strike: Spring
  air: Spring
  daze: Spring
  death: Spring
  /** Pulses (peak ≈ 1 when fired, ring back to 0). */
  recoil: Pulse
  land: Pulse
  flinch: Pulse
  bounce: Pulse
  pop: Pulse
  /** Lean into the acceleration (rad-ish, + = forward / toward +X). */
  leanF: Spring
  leanS: Spring
  /** The gaze (rad, body frame): yaw and pitch toward Flux. */
  headY: Spring
  headX: Spring
  look: number
  /** Servo micro-saccades: the head's tiny exact re-aims at rest. */
  svY: Spring
  svX: Spring
  svToY: number
  svToX: number
  svT: number
  /** Vertical speed, smoothed (m/s): the airborne pose's stretch → tuck → reach. */
  vy: Spring
  /** Dive: the whole body pitched along it (rad). */
  pitch: Spring
  /** Hit flinch side (alternates). */
  fs: number
  // ── Timers and edges ──
  /** s since the melee swing (−1: none). */
  strikeT: number
  /** s since the blink's swap (−1: none). */
  blinkT: number
  /** s since the burrow's burst up (−1: none). */
  riseT: number
  /** 0..1: how far it has phased out (blink). */
  fade: number
  /** m below the floor (burrow). */
  sink: number
  /** Squash (−) / stretch (+) of the whole body. */
  sq: number
  pstate: string
  pstep: number
  pvx: number
  pvz: number
  pflash: number
  high: boolean
  pfoot: boolean
  rng: number
}

// Pulses: [hz, zeta, push (s)]. Each swells from rest over its push.
const RECOIL: readonly [number, number, number] = [6, 0.45, 0.06]
const LAND: readonly [number, number, number] = [3.4, 0.5, 0.11]
const FLINCH: readonly [number, number, number] = [5.5, 0.45, 0.06]
const BOUNCE: readonly [number, number, number] = [5, 0.6, 0.06]
const POP: readonly [number, number, number] = [4.2, 0.5, 0.09]
const pulse = (k: readonly [number, number, number]): Pulse => newPulse(k[0], k[1], k[2])

export const newBossAnim = (seed = 1): BossAnim => ({
  style: 'shoot', attack: '', arm: -1, side: newSpring(1),
  wind: newSpring(), hold: newSpring(), strike: newSpring(), air: newSpring(), daze: newSpring(), death: newSpring(),
  recoil: pulse(RECOIL), land: pulse(LAND), flinch: pulse(FLINCH), bounce: pulse(BOUNCE), pop: pulse(POP),
  leanF: newSpring(), leanS: newSpring(), headY: newSpring(), headX: newSpring(), look: 0,
  svY: newSpring(), svX: newSpring(), svToY: 0, svToX: 0, svT: 0.6,
  vy: newSpring(), pitch: newSpring(), fs: 1,
  strikeT: -1, blinkT: -1, riseT: -1, fade: 0, sink: 0, sq: 0,
  pstate: '', pstep: 0, pvx: 0, pvz: 0, pflash: 0, high: false, pfoot: true,
  rng: (Math.imul(seed | 0, 2246822519) >>> 0) || 7
})

const rnd = (a: BossAnim): number => {
  a.rng = (Math.imul(a.rng, 1664525) + 1013904223) >>> 0
  return a.rng / 4294967296
}

/** How fast each style snaps into its held pose at the release (Hz; the
 *  wider the arc from its wind-up, the lower, so no limb outruns a frame). */
const HOLD_HZ: Record<BossStyle, number> = {
  shoot: 5.5, lob: 4.2, slam: 4.6, nova: 5, channel: 4, rush: 5, ram: 5, leap: 4.2, dive: 3.4, blink: 3.6, burrow: 4
}
/** How long a melee swing holds its strike pose before it flows back (s). */
const STRIKE_HOLD = 0.16
/** The head's servo: top turn rate (rad/s) and its reach either way (rad). */
export const HEAD_RATE = 5.5
export const HEAD_REACH = 0.75
/** The rise out of the floor after a burrow (m). */
const RISE_FROM = 2.6
/** How deep a burrowing Master has sunk at the end of its wind-up (m). */
const SINK_TO = 2.8

/** The wind-up's weight across the telegraph: most of the pose early (the
 *  read), then a slow deepening coil to the release. */
export const windCurve = (k: number): number => 0.82 * smoothstep(0, 0.42, k) + 0.18 * smoothstep(0.42, 1, k)

/** One tick of the layer, after the boss AI and `stepMotion`. `fly` is the
 *  boss's hover height, `px, pz` where Flux stands, `headH` the head's height
 *  above its feet (m). Reads `e`, never writes it. */
export const stepBossAnim = (a: BossAnim, e: BossAnimSource, m: EnemyMotion, fly: number, headH: number, px: number, pz: number, dt: number): void => {
  if (dt <= 0) return
  const s = e.state
  const tele = s === 'tele'
  const act = s === 'act'
  const dead = s === 'dead'
  const entered = s !== a.pstate
  if (tele || act) {
    a.style = styleOf(e.attack)
    a.attack = e.attack
  }
  const style = a.style
  if (entered && (tele || act)) a.pstep = 0
  // Every volley opens from the cocked R arm
  if (entered && tele) a.arm = -1
  // ── Releases: the AI's own step ticking over (a shot, a wave, a swing) ──
  if (act && e.step > a.pstep) {
    if (style === 'shoot' || style === 'lob') {
      a.arm = -a.arm
      firePulse(a.recoil)
    } else if (style === 'slam' || style === 'nova' || style === 'channel') {
      firePulse(a.recoil)
    } else if (style === 'rush' && e.step === 1) {
      a.strikeT = 0
    } else if (style === 'dive' && e.step === 1) {
      firePulse(a.land)
      a.high = false
    } else if (style === 'blink' && e.step === 1) {
      a.blinkT = 0
    } else if (style === 'burrow' && e.step === 2) {
      a.riseT = 0
    }
  }
  a.pstep = act ? e.step : 0
  if (a.strikeT >= 0) a.strikeT += dt
  if (a.strikeT > 1) a.strikeT = -1
  // ── Wind-up, hold, strike ──
  const k = tele ? Math.min(1, e.st / Math.max(0.05, e.teleDur)) : 0
  // Out of the wind-up slowly: at the release the held pose takes over from
  // it (a crossfade at the hold's own speed), not the stance from both.
  springTo(a.wind, tele ? windCurve(k) : 0, tele ? 5 : 2.4, tele ? 0.72 : 0.95, dt)
  // (A leap's act is its flight: the airborne weight below. A dive holds
  // until the impact.)
  const holding = act && style !== 'leap' && !(style === 'dive' && e.step >= 1)
  springTo(a.hold, holding ? 1 : 0, holding ? HOLD_HZ[style] : 2.7, holding ? 0.5 : 0.72, dt)
  // A volley's held pose leads with the arm that fired last (crossfaded)
  springTo(a.side, style === 'shoot' ? a.arm : 1, 6, 0.75, dt)
  const striking = a.strikeT >= 0 && a.strikeT < STRIKE_HOLD
  springTo(a.strike, striking ? 1 : 0, striking ? 5 : 3, striking ? 0.5 : 0.7, dt)
  // ── Airborne (leaps, the dive, the entrance's drop) and landings ──
  const vy = (e.y - e.py) / dt
  springTo(a.vy, clamp(vy, -14, 14), 6, 0.9, dt)
  // (After the dive's impact it sinks the last half metre standing.)
  const up = e.y > fly + 0.5 && !(act && style === 'dive' && e.step >= 1)
  const airborne = !dead && s !== 'stun' && (up || (act && style === 'leap') || (act && style === 'dive' && e.step === 0))
  springTo(a.air, airborne ? 1 : 0, airborne ? 4.2 : 4.2, 0.72, dt)
  if (up) a.high = true
  else if (a.high && e.y <= fly + 0.12) {
    a.high = false
    firePulse(a.land)
  }
  if (act && style === 'leap' && entered) firePulse(a.pop)
  springTo(a.pitch, act && style === 'dive' && e.step === 0 ? 0.9 : 0, 3, 0.7, dt)
  // ── Dizzy, death ──
  springTo(a.daze, s === 'stun' ? 1 : 0, 4, 0.7, dt)
  springTo(a.death, dead ? 1 : 0, 1.5, 0.55, dt)
  // A hit (the flash jumps to 1): a flinch, its side alternating
  if (e.flash > a.pflash + 0.4 && !dead) {
    a.fs = -a.fs
    firePulse(a.flinch, s === 'stun' ? 0.6 : 1)
  }
  a.pflash = e.flash
  // ── Footfalls: a dip on each heel strike (L at u = 0, R at u = ½), by
  //    how hard it walks ──
  const foot = frac(m.stride / TAU) < 0.5
  if (foot !== a.pfoot && m.walk > 0.15 && m.dash < 0.5) firePulse(a.bounce, -Math.min(1, m.walk))
  a.pfoot = foot
  // ── The pulses ring out ──
  stepPulse(a.recoil, dt)
  stepPulse(a.land, dt)
  stepPulse(a.flinch, dt)
  stepPulse(a.bounce, dt)
  stepPulse(a.pop, dt)
  // ── Lean into the acceleration (body frame), the arms trailing it. The
  //    velocity is smoothed first, so a start or a stop leans for a beat
  //    instead of one tick; a blink moves it without a velocity at all. ──
  let vx = (e.x - e.px) / dt
  let vz = (e.z - e.pz) / dt
  if (Math.hypot(vx, vz) > 40) {
    vx = a.pvx
    vz = a.pvz
  }
  const kv = Math.min(1, dt * 9)
  const nvx = a.pvx + (vx - a.pvx) * kv
  const nvz = a.pvz + (vz - a.pvz) * kv
  const ax = (nvx - a.pvx) / dt
  const az = (nvz - a.pvz) / dt
  a.pvx = nvx
  a.pvz = nvz
  const sy = Math.sin(e.yaw)
  const cy = Math.cos(e.yaw)
  const fwdA = ax * sy + az * cy
  const sideA = ax * cy - az * sy
  springTo(a.leanF, clamp(fwdA * 0.012, -0.28, 0.28), 2.2, 0.62, dt)
  springTo(a.leanS, clamp(sideA * 0.012, -0.22, 0.22), 2.2, 0.62, dt)
  // ── The gaze: locked on Flux, at a servo's top speed, then a sprung settle ──
  const dx = px - e.x
  const dz = pz - e.z
  const d = Math.hypot(dx, dz)
  let rel = Math.atan2(dx, dz) - e.yaw
  rel = Math.atan2(Math.sin(rel), Math.cos(rel))
  a.look = turnToward(a.look, clamp(rel, -HEAD_REACH, HEAD_REACH), HEAD_RATE, dt)
  springTo(a.headY, a.look, 4.5, 0.6, dt)
  // Pitch: down to his eyes when he is close (Flux's eye ≈ 1.1 m)
  springTo(a.headX, clamp(Math.atan2(headH + (e.y - fly) - 1.1, Math.max(1, d)) * 0.7, -0.15, 0.35), 3, 0.75, dt)
  // ── Servo micro-saccades: a new tiny aim now and then, snapped to exactly ──
  a.svT -= dt
  if (a.svT <= 0) {
    a.svT = 0.7 + 1.9 * rnd(a)
    a.svToY = (rnd(a) * 2 - 1) * 0.07
    a.svToX = (rnd(a) * 2 - 1) * 0.045
  }
  springTo(a.svY, a.svToY, 8, 0.65, dt)
  springTo(a.svX, a.svToX, 8, 0.65, dt)
  // ── Blink: phase out through the last of the wind-up, back in after the swap ──
  if (tele && style === 'blink') {
    a.fade = smoothstep(0.3, 0.97, k)
    a.blinkT = -1
  } else if (act && style === 'blink' && e.step === 0) {
    // (The tick between the telegraph's end and the swap: still gone.)
    a.fade = 1
  } else if (a.blinkT >= 0) {
    // (Gone on the swap's own tick; it forms from the next.)
    a.fade = Math.max(0, 1 - stepResponse(a.blinkT, 2.6, 0.55))
    a.blinkT += dt
    if (a.blinkT > 1.4) {
      a.blinkT = -1
      a.fade = 0
    }
  } else a.fade = 0
  // ── Burrow: sink through the floor at the end of the wind-up, burst up ──
  if (a.riseT >= 0) a.riseT += dt
  if (tele && style === 'burrow') {
    const q = smoothstep(0.5, 1, k)
    a.sink = SINK_TO * q * q
    a.riseT = -1
  } else if (e.buried) a.sink = SINK_TO
  else if (a.riseT >= 0) {
    a.sink = RISE_FROM * (1 - stepResponse(a.riseT, 2.4, 0.42))
    if (a.riseT > 0.3 && a.riseT - dt <= 0.3) firePulse(a.land)
    if (a.riseT > 1.6) {
      a.riseT = -1
      a.sink = 0
    }
  } else a.sink = 0
  // ── The whole body's squash (landing) and stretch (take-off, the burst up) ──
  a.sq = -0.11 * a.land.x + 0.1 * a.pop.x + (a.riseT >= 0 ? 0.12 * (1 - smoothstep(0, 0.35, a.riseT)) : 0)
  a.pstate = s
}

// ─── Pose channels ───────────────────────────────────────────────────────────

const HY = 0
const SP = 1
const CX = 2
const CY = 3
const CZ = 4
const CN = 5
const NX = 6
const NY = 7
const NZ = 8
const LX = 9
const LY = 10
const LZ = 11
const LE = 12
const RX = 13
const RY = 14
const RZ = 15
const RE = 16
const GLX = 17
const GLZ = 18
const GRX = 19
const GRZ = 20
const KL = 21
const KR = 22
const N = 23

type Ch = 'hy' | 'sp' | 'cx' | 'cy' | 'cz' | 'cn' | 'nx' | 'ny' | 'nz' | 'lx' | 'ly' | 'lz' | 'le' | 'rx' | 'ry' | 'rz' | 're' |
  'glx' | 'glz' | 'grx' | 'grz' | 'kl' | 'kr'
const INDEX: Record<Ch, number> = {
  hy: HY, sp: SP, cx: CX, cy: CY, cz: CZ, cn: CN, nx: NX, ny: NY, nz: NZ, lx: LX, ly: LY, lz: LZ, le: LE,
  rx: RX, ry: RY, rz: RZ, re: RE, glx: GLX, glz: GLZ, grx: GRX, grz: GRZ, kl: KL, kr: KR
}

/** A key pose: the channels it sets (`m`), and their values. */
interface Key { v: Float64Array; m: Uint8Array }

const key = (d: Partial<Record<Ch, number>>): Key => {
  const k: Key = { v: new Float64Array(N), m: new Uint8Array(N) }
  for (const [c, x] of Object.entries(d) as Array<[Ch, number]>) {
    k.v[INDEX[c]] = x
    k.m[INDEX[c]] = 1
  }
  return k
}

/** `src` with L and R swapped (the other arm leads). */
const mirrorInto = (src: Key, dst: Key): Key => {
  const v = src.v
  const o = dst.v
  for (let i = 0; i < N; i++) {
    o[i] = v[i]!
    dst.m[i] = src.m[i]!
  }
  const swap = (a: number, b: number, sg: number): void => {
    o[a] = v[b]! * sg
    o[b] = v[a]! * sg
    const ma = src.m[a]!
    dst.m[a] = src.m[b]!
    dst.m[b] = ma
  }
  swap(LX, RX, 1)
  swap(LY, RY, -1)
  swap(LZ, RZ, -1)
  swap(LE, RE, 1)
  swap(GLX, GRX, 1)
  swap(GLZ, GRZ, -1)
  swap(KL, KR, 1)
  o[CY] = -v[CY]!
  o[CZ] = -v[CZ]!
  o[CN] = -v[CN]!
  o[NY] = -v[NY]!
  o[NZ] = -v[NZ]!
  return dst
}

/** The pose being built (module scratch). */
const P = new Float64Array(N)
const _mir = key({})

const mixKey = (k: Key, w: number): void => {
  if (w === 0) return
  const v = k.v
  const m = k.m
  for (let i = 0; i < N; i++) if (m[i]) P[i] = P[i]! + (v[i]! - P[i]!) * w
}

// ─── The key poses (the R arm leading; `mirrorInto` for the L) ──────────────
//
// Absolute joint offsets from the bind pose (rad; shoulder x − = forward and
// up, z out = − on the L, elbow − = bent; chest x + = hunched, y + = its front
// turned to its R; hip x − = thigh forward, knee + = bent). The hips' height
// is not a key: it is set from the legs (`plant`) so a crouch keeps its soles
// on the floor. The head's yaw is not in them either: the gaze holds on Flux
// whatever the chest does.

/** Volley: draw and coil — the lead hand sighting ahead, the cannon cocked at the hip. */
const SHOOT_W = key({
  cx: 0.12, cy: 0.42, sp: 0.05, nx: -0.05,
  lx: -1.25, ly: 0.1, lz: -0.12, le: -0.35,
  rx: -0.35, ry: 0.35, rz: 0.4, re: -1.6,
  glx: -0.32, glz: -0.06, grx: 0.28, grz: 0.08, kl: 0.38, kr: 0.42
})
/** …then both arms levelled at him through the volley. */
const SHOOT_H = key({
  cx: -0.06, cy: -0.12, sp: -0.03, nx: 0.02,
  lx: -1.42, ly: 0.05, lz: -0.14, le: -0.12,
  rx: -1.58, ry: -0.05, rz: 0.1, re: -0.06,
  glx: -0.3, glz: -0.08, grx: 0.26, grz: 0.08, kl: 0.3, kr: 0.36
})
/** Lob: the throwing hand cocked behind its head, the other pointing up the arc. */
const LOB_W = key({
  cx: -0.2, cy: 0.3, sp: -0.06, nx: -0.22,
  lx: -1.6, ly: 0, lz: -0.3, le: -0.1,
  rx: -2.6, ry: 0.2, rz: 0.25, re: -1.7,
  glx: -0.4, glz: -0.08, grx: 0.32, grz: 0.08, kl: 0.25, kr: 0.5
})
/** …and the follow-through, across and down. */
const LOB_H = key({
  cx: 0.3, cy: -0.3, sp: 0.08, nx: -0.1,
  lx: 0.2, ly: 0, lz: -0.3, le: -0.45,
  rx: -1.3, ry: -0.45, rz: -0.05, re: -0.2,
  glx: -0.42, glz: -0.08, grx: 0.36, grz: 0.08, kl: 0.42, kr: 0.3
})
/** Floor wave: both fists overhead, arched back, up on its toes… */
const SLAM_W = key({
  hy: 0.025, cx: -0.3, cy: 0, sp: -0.12, nx: -0.25,
  lx: -2.7, ly: 0.2, lz: -0.32, le: -0.55,
  rx: -2.7, ry: -0.2, rz: 0.32, re: -0.55,
  glx: 0.02, glz: -0.12, grx: 0.02, grz: 0.12, kl: 0.05, kr: 0.05
})
/** …driven down into the floor. */
const SLAM_H = key({
  hy: 0, cx: 0.58, cy: 0, sp: 0.18, nx: -0.42,
  lx: -0.75, ly: 0.25, lz: -0.2, le: -0.12,
  rx: -0.75, ry: -0.25, rz: 0.2, re: -0.12,
  glx: -0.62, glz: -0.15, grx: -0.62, grz: 0.15, kl: 1.05, kr: 1.05
})
/** Ring burst: gathered in, arms crossed, hunched… */
const NOVA_W = key({
  cx: 0.38, cy: 0, sp: 0.1, nx: 0.3,
  lx: -1.3, ly: 0.85, lz: 0.05, le: -1.45,
  rx: -1.3, ry: -0.85, rz: -0.05, re: -1.45,
  glx: -0.45, glz: -0.1, grx: -0.45, grz: 0.1, kl: 0.85, kr: 0.85
})
/** …flung wide open, head back. */
const NOVA_H = key({
  hy: 0.015, cx: -0.32, cy: 0, sp: -0.12, nx: -0.3,
  lx: -0.5, ly: -0.2, lz: -1.35, le: -0.1,
  rx: -0.5, ry: 0.2, rz: 1.35, re: -0.1,
  glx: 0.05, glz: -0.2, grx: 0.05, grz: 0.2, kl: 0.06, kr: 0.06
})
/** Pull / blow: the arms raised out in front, braced wide… */
const CHANNEL_W = key({
  cx: -0.08, cy: 0, sp: -0.02, nx: -0.05,
  lx: -1.2, ly: -0.3, lz: -0.5, le: -0.45,
  rx: -1.2, ry: 0.3, rz: 0.5, re: -0.45,
  glx: -0.3, glz: -0.16, grx: 0.15, grz: 0.16, kl: 0.5, kr: 0.35
})
/** …straining, hands clawed, drawing the arena round it while it runs. */
const CHANNEL_H = key({
  cx: 0.14, cy: 0, sp: 0.04, nx: -0.08,
  lx: -1.4, ly: 0.1, lz: -0.7, le: -0.7,
  rx: -1.4, ry: -0.1, rz: 0.7, re: -0.7,
  glx: -0.34, glz: -0.18, grx: 0.2, grz: 0.18, kl: 0.55, kr: 0.4
})
/** Dash: a sprinter's crouch, the striking arm cocked back… */
const RUSH_W = key({
  cx: 0.52, cy: 0.3, sp: 0.12, nx: -0.42,
  lx: -0.95, ly: 0.3, lz: -0.15, le: -1.1,
  rx: 0.75, ry: 0.15, rz: 0.32, re: -1.25,
  glx: -0.8, glz: -0.05, grx: 0.45, grz: 0.05, kl: 1.3, kr: 0.75
})
/** …low through the dash, arms swept back… */
const RUSH_H = key({
  cx: 0.6, cy: 0.18, sp: 0.1, nx: -0.5,
  lx: 0.55, ly: 0, lz: -0.3, le: -0.35,
  rx: 0.55, ry: 0.1, rz: 0.3, re: -0.55,
  glx: -1.05, glz: -0.05, grx: 0.75, grz: 0.05, kl: 1.15, kr: 0.3
})
/** …and the slash across. */
const RUSH_S = key({
  cx: 0.32, cy: -0.55, sp: 0.06, nx: -0.2,
  lx: 0.45, ly: 0, lz: -0.35, le: -0.5,
  rx: -1.35, ry: -0.7, rz: -0.12, re: -0.12,
  glx: -0.7, glz: -0.08, grx: 0.5, grz: 0.08, kl: 0.8, kr: 0.45
})
/** Charge: a shoulder dropped, the forearm across as a ram… */
const RAM_W = key({
  cx: 0.55, cy: -0.42, sp: 0.12, nx: -0.45,
  lx: -1.05, ly: 0.65, lz: -0.05, le: -1.65,
  rx: 0.55, ry: 0, rz: 0.3, re: -0.9,
  glx: -0.85, glz: -0.05, grx: 0.5, grz: 0.06, kl: 1.3, kr: 0.8
})
/** …and held low into it at full tilt. */
const RAM_H = key({
  cx: 0.62, cy: -0.48, sp: 0.14, nx: -0.55,
  lx: -1.15, ly: 0.7, lz: -0.05, le: -1.7,
  rx: 0.7, ry: 0, rz: 0.3, re: -0.8,
  glx: -0.95, glz: -0.05, grx: 0.65, grz: 0.06, kl: 1.2, kr: 0.45
})
/** Leap: a deep crouch, both arms swung back. */
const LEAP_W = key({
  cx: 0.55, cy: 0, sp: 0.15, nx: -0.45,
  lx: 0.6, ly: 0, lz: -0.22, le: -0.35,
  rx: 0.6, ry: 0, rz: 0.22, re: -0.35,
  glx: -0.95, glz: -0.08, grx: -0.95, grz: 0.08, kl: 1.6, kr: 1.6
})
/** Airborne: stretched out rising, tucked at the top, legs reaching falling. */
const STRETCH = key({
  cx: -0.18, cy: 0, sp: -0.08, nx: -0.2,
  lx: -2.2, ly: 0, lz: -0.25, le: -0.15,
  rx: -2.2, ry: 0, rz: 0.25, re: -0.15,
  glx: 0.15, glz: -0.04, grx: 0.25, grz: 0.04, kl: 0.15, kr: 0.25
})
const TUCK = key({
  cx: 0.15, cy: 0, sp: 0.05, nx: 0.05,
  lx: -2.0, ly: 0, lz: -0.35, le: -0.6,
  rx: -2.0, ry: 0, rz: 0.35, re: -0.6,
  glx: -1.0, glz: -0.08, grx: -0.85, grz: 0.08, kl: 1.4, kr: 1.3
})
const REACH = key({
  cx: 0.08, cy: 0, sp: 0.02, nx: 0.25,
  lx: -1.2, ly: 0, lz: -0.75, le: -0.3,
  rx: -1.2, ry: 0, rz: 0.75, re: -0.3,
  glx: -0.35, glz: -0.1, grx: -0.2, grz: 0.1, kl: 0.45, kr: 0.35
})
/** Dive: rising with the arms spread like wings… */
const DIVE_W = key({
  cx: -0.2, cy: 0, sp: -0.08, nx: -0.12,
  lx: -0.35, ly: -0.3, lz: -1.45, le: -0.08,
  rx: -0.35, ry: 0.3, rz: 1.45, re: -0.08,
  glx: 0.2, glz: -0.03, grx: 0.32, grz: 0.03, kl: 0.35, kr: 0.45
})
/** …then down head first, arms ahead (the body pitched along it: `pitch`). */
const DIVE_H = key({
  cx: 0.25, cy: 0, sp: 0.05, nx: -0.55,
  lx: -2.95, ly: 0, lz: -0.18, le: -0.05,
  rx: -2.95, ry: 0, rz: 0.18, re: -0.05,
  glx: 0.35, glz: -0.03, grx: 0.5, grz: 0.03, kl: 0.25, kr: 0.4
})
/** Blink: folded in, head bowed, phasing out… */
const BLINK_W = key({
  cx: 0.3, cy: 0, sp: 0.05, nx: 0.42,
  lx: -1.45, ly: 0.95, lz: 0.08, le: -1.7,
  rx: -1.45, ry: -0.95, rz: -0.08, re: -1.7,
  glx: -0.12, glz: 0.04, grx: -0.12, grz: -0.04, kl: 0.2, kr: 0.2
})
/** …and snapping open as it forms again. */
const BLINK_H = key({
  cx: -0.2, cy: 0, sp: -0.05, nx: -0.15,
  lx: -0.7, ly: -0.2, lz: -0.75, le: -0.35,
  rx: -0.7, ry: 0.2, rz: 0.75, re: -0.35,
  glx: -0.1, glz: -0.1, grx: 0.05, grz: 0.1, kl: 0.25, kr: 0.15
})
/** Burrow: arms together overhead, crouched to dive into the floor. */
const BURROW_W = key({
  cx: 0.3, cy: 0, sp: 0.06, nx: 0.2,
  lx: -2.95, ly: 0.3, lz: 0.12, le: -0.05,
  rx: -2.95, ry: -0.3, rz: -0.12, re: -0.05,
  glx: -0.7, glz: -0.04, grx: -0.7, grz: 0.04, kl: 1.2, kr: 1.2
})
/** Dizzy: slumped on buckling knees (its wobble is added). */
const STUN = key({
  cx: 0.35, cy: 0, cz: 0, sp: 0.1, nx: 0.3,
  lx: 0.3, ly: 0, lz: -0.6, le: -0.3,
  rx: 0.3, ry: 0, rz: 0.6, re: -0.3,
  glx: -0.4, glz: -0.08, grx: -0.3, grz: 0.08, kl: 0.65, kr: 0.55
})
/** Death: down on its knees, folded over, arms hanging. */
const DEATH = key({
  cx: 0.75, cy: 0, cz: 0, sp: 0.25, nx: 0.65, nz: 0.15,
  lx: 0.25, ly: 0, lz: -0.3, le: -0.25,
  rx: 0.1, ry: 0, rz: 0.45, re: -0.6,
  glx: -1.15, glz: -0.15, grx: -0.85, grz: 0.15, kl: 1.9, kr: 1.6
})

const WIND: Record<BossStyle, Key> = {
  shoot: SHOOT_W, lob: LOB_W, slam: SLAM_W, nova: NOVA_W, channel: CHANNEL_W, rush: RUSH_W, ram: RAM_W,
  leap: LEAP_W, dive: DIVE_W, blink: BLINK_W, burrow: BURROW_W
}
const HOLD: Record<BossStyle, Key> = {
  shoot: SHOOT_H, lob: LOB_H, slam: SLAM_H, nova: NOVA_H, channel: CHANNEL_H, rush: RUSH_H, ram: RAM_H,
  leap: STRETCH, dive: DIVE_H, blink: BLINK_H, burrow: STRETCH
}

/** A style's wind-up and held key poses (the R arm leading). Test seam. */
export const styleKeys = (s: BossStyle): { wind: Float64Array; hold: Float64Array } => ({ wind: WIND[s].v, hold: HOLD[s].v })

// ─── Legs → hips ─────────────────────────────────────────────────────────────

/** Hip → knee and knee → sole (rig units): the Masters share Flux's
 *  proportions, the Scrapper is built like a Guardroid. */
const LEG: Record<'master' | 'scrapper', readonly [number, number]> = { master: [0.22, 0.335], scrapper: [0.42, 0.62] }

/** How far below the hip a leg reaches with this hip and knee bend. */
const reachOf = (l1: number, l2: number, hx: number, hz: number, kn: number): number =>
  (l1 * Math.cos(hx) + l2 * Math.cos(hx + kn)) * Math.cos(hz)

// ─── The pose ────────────────────────────────────────────────────────────────

/** The taunt's offsets (`models/bosses.ts` fills them; `fe` is its envelope). */
export interface Taunt {
  fe: number
  lX: number
  lY: number
  lE: number
  rX: number
  rY: number
  rE: number
  hX: number
  hY: number
  hZ: number
  cY: number
  cZ: number
  buzz: number
}

/** An arm's rest: shoulder [rx, ry, rz] + elbow rx for the L arm (R mirrors ry, rz). */
export interface ArmRest { x: number; y: number; z: number; elbow: number }

/**
 * The Masters' and the Scrapper's pose with the v2 layer. `tn` is the taunt's
 * offsets for this frame, `R` the arms' rest. The root's own motion (squash,
 * the blink's fade, the burrow's depth, the dive's pitch) is on `a` for the
 * sim to put on the boss's groups (`syncBossVisual`).
 */
export const poseMasterAnim = (rig: Rig, id: BossId, t: number, m: EnemyMotion, a: BossAnim, R: ArmRest, tn: Taunt): void => {
  const g = BOSS_GAIT[id]!
  const T = t * m.tempo
  const wk = gaitAmp(m.walk)
  const still = 1 - wk
  gaitLegs(g, m, wk)
  const u = frac(m.phase / TAU)
  const f = gaitDir.f
  const s = gaitDir.s
  const fe = tn.fe
  // ── Base: the ready stance, breath, weight shift, gait, taunt ──
  const br = Math.sin(T * 2.0)
  const sh = Math.sin(T * 0.5 + 0.9)
  const shiftX = 0.012 * sh * still - 0.02 * Math.sin(TAU * u) * wk
  const twist = ((legL.th - legR.th) * 0.5 * 0.12 / g.A) * wk * f
  const lead = clamp(0.1 * m.turn, -0.3, 0.3)
  const swingL = (legR.th / g.A) * 0.35 * wk * f
  const swingR = (legL.th / g.A) * 0.35 * wk * f
  const breathArm = 0.03 * br * still
  P[HY] = 0.008 * br * still + tn.buzz * fe
  P[SP] = 0.02 * br
  P[CN] = shiftX
  P[CX] = 0.04 + 0.08 * wk * f + 0.015 * br
  P[CY] = -twist + tn.cY * fe - clamp(0.05 * m.turn, -0.18, 0.18)
  P[CZ] = -1.2 * shiftX + tn.cZ * fe
  P[NX] = -0.04 + tn.hX * fe
  P[NY] = lead + tn.hY * fe
  P[NZ] = tn.hZ * fe
  P[LX] = R.x - swingL + breathArm + tn.lX * fe
  P[LY] = R.y + tn.lY * fe
  P[LZ] = R.z
  P[LE] = R.elbow + tn.lE * fe
  P[RX] = R.x - swingR + breathArm + tn.rX * fe
  P[RY] = -R.y + tn.rY * fe
  P[RZ] = -R.z
  P[RE] = R.elbow + tn.rE * fe
  P[GLX] = -legL.th * f
  P[GLZ] = legL.th * s - gaitDir.bias
  P[GRX] = -legR.th * f
  P[GRZ] = legR.th * s + gaitDir.bias
  P[KL] = legL.knee
  P[KR] = legR.knee
  // ── The attack: wind-up, held pose, strike ──
  const st = a.style
  const lead1 = a.arm > 0
  const ram = st === 'ram'
  const wind = a.wind.x
  const hold = a.hold.x
  mixKey(WIND[st], wind)
  // A volley's held pose leads with the arm that fired last, crossfaded
  const sideL = clamp((1 - a.side.x) / 2, 0, 1)
  if (sideL > 0.001) {
    mirrorInto(HOLD[st], _mir)
    const h = HOLD[st].v
    const o = _mir.v
    for (let i = 0; i < N; i++) o[i] = h[i]! + (o[i]! - h[i]!) * sideL
    mixKey(_mir, hold)
  } else mixKey(HOLD[st], hold)
  if (st === 'rush') mixKey(RUSH_S, a.strike.x)
  // The wind-up's coil hums as it deepens (a servo under load)
  const hum = Math.sin(t * 41) * 0.022 * smoothstep(0.6, 1, wind) * (st === 'nova' || st === 'channel' || st === 'slam' ? 1.6 : 1)
  P[LX] += hum
  P[RX] -= hum
  P[CX] += hum * 0.4
  // A channel strains; a charge pounds along
  if (st === 'channel') {
    // Hands working in turn (a slow swirl), a strained tremor, the torso turning with it
    const sw = Math.sin(t * 3.2)
    P[LX] += (0.28 * sw + Math.sin(t * 38) * 0.03) * hold
    P[RX] += (-0.28 * sw + Math.sin(t * 38 + 1.3) * 0.03) * hold
    P[CY] += Math.sin(t * 3.2 - 0.6) * 0.16 * hold
  } else if (ram) P[HY] += Math.abs(Math.sin(t * 11)) * 0.012 * hold
  // Each release: the arm that fired (or both) kicks and rings back
  const rc = a.recoil.x
  if (rc !== 0) {
    const lob = st === 'lob'
    const both = st === 'slam' || st === 'nova' || st === 'channel'
    const fx = lob ? -0.5 : st === 'slam' ? 0.18 : 0.5
    const fe2 = lob ? 0 : -0.55
    if (both) {
      P[LX] += fx * rc
      P[RX] += fx * rc
      P[CX] += (st === 'slam' ? 0.14 : -0.1) * rc
      P[KL] += 0.22 * rc * (st === 'slam' ? 1 : 0)
      P[KR] += 0.22 * rc * (st === 'slam' ? 1 : 0)
      P[LZ] -= (st === 'nova' ? 0.22 : 0) * rc
      P[RZ] += (st === 'nova' ? 0.22 : 0) * rc
    } else if (lead1) {
      P[RX] += fx * rc
      P[RE] += fe2 * rc
      P[LX] += 0.08 * rc
      P[CY] -= 0.1 * rc
    } else {
      P[LX] += fx * rc
      P[LE] += fe2 * rc
      P[RX] += 0.08 * rc
      P[CY] += 0.1 * rc
    }
    if (!both) P[CX] += (lob ? 0.1 : -0.06) * rc
  }
  // ── Airborne: stretched rising, tucked at the top, reaching down to land ──
  const air = a.air.x
  if (air > 0.001) {
    // (A dive's flight is its held pose.)
    if (st !== 'dive') {
      // Tucked, then stretched rising or reaching down falling, by its speed
      const vyN = clamp(a.vy.x / 7, -1, 1)
      const up = Math.max(0, vyN)
      const dn = Math.max(0, -vyN)
      const o = _mir.v
      for (let i = 0; i < N; i++) {
        _mir.m[i] = TUCK.m[i]!
        const v = TUCK.v[i]! + (STRETCH.v[i]! - TUCK.v[i]!) * up
        o[i] = v + (REACH.v[i]! - v) * dn
      }
      mixKey(_mir, air)
    }
  }
  // The landing: knees give, arms out for balance, then it rises out of it
  const ld = a.land.x
  P[GLX] -= 0.55 * ld
  P[GRX] -= 0.55 * ld
  P[KL] += 1.0 * ld
  P[KR] += 1.0 * ld
  P[CX] += 0.38 * ld
  P[SP] += 0.1 * ld
  P[NX] -= 0.2 * ld
  P[LX] += 0.3 * ld
  P[RX] += 0.3 * ld
  P[LZ] -= 0.45 * ld
  P[RZ] += 0.45 * ld
  // ── Lean into the acceleration; the arms trail it ──
  const lf = a.leanF.x
  const ls = a.leanS.x
  P[CX] += 0.75 * lf
  P[SP] += 0.25 * lf
  P[CZ] -= 0.55 * ls
  P[LX] += 0.8 * lf
  P[RX] += 0.8 * lf
  P[LZ] -= 0.35 * Math.max(0, ls)
  P[RZ] -= 0.35 * Math.min(0, ls)
  // Footfalls: a dip and a nod on each heel strike
  P[HY] += 0.02 * a.bounce.x
  P[CX] -= 0.03 * a.bounce.x
  // ── Dizzy (its wobble and a servo glitch), death ──
  const dz = a.daze.x
  if (dz > 0.001) {
    mixKey(STUN, dz)
    const gl = frac(Math.sin(Math.floor(t * 6) * 78.233) * 43758.5) > 0.8 ? 1 : 0
    P[CY] += Math.sin(t * 8) * 0.2 * dz
    P[CZ] += Math.sin(t * 5.3) * 0.08 * dz
    P[NY] += Math.sin(t * 9) * 0.4 * dz
    P[NZ] += gl * 0.22 * dz * Math.sin(t * 60)
  }
  const de = a.death.x
  if (de > 0.001) {
    mixKey(DEATH, Math.min(1, de))
    // Servos failing: jerks on a broken rhythm
    const j = Math.max(0, Math.sin(t * 29) * Math.sin(t * 7.3) - 0.55) * 1.6 * Math.min(1, de)
    P[NX] -= j * 0.35
    P[RX] -= j * 0.5
    P[LE] -= j * 0.4
    P[CY] += j * 0.15
  }
  // ── The flinch: rocked back from a hit ──
  const fl = a.flinch.x
  P[CX] -= 0.16 * fl
  P[SP] -= 0.06 * fl
  P[NX] -= 0.22 * fl
  P[LX] += 0.22 * fl
  P[RX] += 0.22 * fl
  P[CY] += 0.1 * fl * a.fs
  // ── The gaze: on Flux whatever the chest does (dizzy and dying: it drifts) ──
  const track = Math.max(0, 1 - dz) * Math.max(0, 1 - de)
  const calm = Math.max(0, 1 - wind) * Math.max(0, 1 - hold) * track
  P[NY] += (a.headY.x - 0.85 * P[CY]!) * track + a.svY.x * calm
  P[NX] += a.headX.x * track * (1 - 0.6 * air) + a.svX.x * calm
  // ── The hips from the legs: the lower sole on the floor (airborne: free) ──
  const [l1, l2] = id === 'scrapper' ? LEG.scrapper : LEG.master
  const reach = Math.max(reachOf(l1, l2, P[GLX]!, P[GLZ]!, P[KL]!), reachOf(l1, l2, P[GRX]!, P[GRZ]!, P[KR]!))
  const ground = 1 - clamp(air, 0, 1)
  const hipsY = P[HY]! - (l1 + l2 - reach) * ground + Math.sin(t * 2.2) * 0.012 * (1 - ground)
  // ── Write the rig ──
  nudge(rig, 'hips', 0, hipsY, 0)
  pose(rig, 'spine', P[SP]!, 0, 0)
  nudge(rig, 'chest', P[CN]!, 0, 0)
  pose(rig, 'chest', P[CX]!, P[CY]!, P[CZ]!)
  pose(rig, 'head', P[NX]!, P[NY]!, P[NZ]!)
  pose(rig, 'shoulderL', P[LX]!, P[LY]!, P[LZ]!)
  pose(rig, 'shoulderR', P[RX]!, P[RY]!, P[RZ]!)
  pose(rig, 'elbowL', P[LE]!, 0, 0)
  pose(rig, 'elbowR', P[RE]!, 0, 0)
  pose(rig, 'hipL', P[GLX]!, 0, P[GLZ]!)
  pose(rig, 'hipR', P[GRX]!, 0, P[GRZ]!)
  pose(rig, 'kneeL', P[KL]!, 0, 0)
  pose(rig, 'kneeR', P[KR]!, 0, 0)
}

/** The view's weights for Dr. Vex's own pose (`models/vexMk1.ts`), from the
 *  same springs: his telegraph, the release's jolt, the aim, the dive, the daze. */
export interface VexBlend { tele: number; kick: number; aim: number; dive: number; daze: number }

const _vex: VexBlend = { tele: 0, kick: 0, aim: 0, dive: 0, daze: 0 }

/** Dr. Vex's weights for the frame (module scratch). */
export const vexBlend = (a: BossAnim): VexBlend => {
  _vex.tele = a.wind.x
  // (Not below 0: his muzzles' charge scales with it.)
  _vex.kick = Math.max(0, a.recoil.x)
  _vex.aim = Math.max(a.wind.x, a.hold.x * 0.85)
  _vex.dive = a.air.x
  _vex.daze = Math.max(a.daze.x, a.death.x)
  return _vex
}

