import { newSpring, springTo, newPulse, firePulse, stepPulse, clamp, type Spring, type Pulse } from './spring'

/**
 * ─── Whole-body secondary motion (#183) ──────────────────────────────────────
 *
 * The layer every challenge mini-boss gets on top of its own pose
 * (`sim/miniBosses.ts`): the body leans into every acceleration and rocks back
 * when it brakes, banks into its turns (a flyer much more than a walker),
 * rocks back from a hit and squashes on a landing — on damped springs, so a
 * lunge's start, a wall stop or a hit reads as weight, not as a cut. It moves
 * the rig's root only (tilted about its feet, squashed from them): the
 * module's own pose, its hit volume and its weak spot are untouched.
 *
 * View only and allocation-free: stepped with the sim after every tick
 * (`stepBodyDyn`), read when it is drawn.
 */

/** What it reads of the body (the `Enemy` fits). */
export interface BodySource {
  x: number
  z: number
  px: number
  pz: number
  y: number
  yaw: number
  flash: number
  state: string
}

export interface BodyDyn {
  /** The body's lean (rad): forward (+, into an acceleration) and to its side. */
  leanF: Spring
  leanS: Spring
  /** Banking into a turn (rad). */
  bank: Spring
  /** Rocked back by a hit; squashed by a landing (pulses, peak ≈ 1). */
  flinch: Pulse
  land: Pulse
  pvx: number
  pvz: number
  pyaw: number
  pflash: number
  high: boolean
  /** The rig root's own scale (its build size), squashed about it. */
  base: number
  /** This frame's output: pitch (+ = forward), roll, squash (− squashed). */
  pitch: number
  roll: number
  sq: number
}

export const newBodyDyn = (base: number): BodyDyn => ({
  leanF: newSpring(), leanS: newSpring(), bank: newSpring(),
  flinch: newPulse(5, 0.45, 0.06), land: newPulse(3.6, 0.5, 0.1),
  pvx: 0, pvz: 0, pyaw: NaN, pflash: 0, high: false, base, pitch: 0, roll: 0, sq: 0
})

/** How much a body of each build leans and banks. */
export interface BodyFeel {
  /** rad of lean per m/s² of acceleration, and its cap. */
  lean: number
  leanMax: number
  /** rad of bank per rad/s of turn, and its cap. */
  bank: number
  bankMax: number
}

/** A walker leans a little; a flyer tips and banks like one. */
export const WALKER: Readonly<BodyFeel> = { lean: 0.006, leanMax: 0.09, bank: 0.03, bankMax: 0.06 }
export const FLYER: Readonly<BodyFeel> = { lean: 0.012, leanMax: 0.2, bank: 0.09, bankMax: 0.22 }

/** One tick, after the body moved (`e.y` is its height over its floor). */
export const stepBodyDyn = (b: BodyDyn, e: BodySource, f: Readonly<BodyFeel>, dt: number): void => {
  if (dt <= 0) return
  const dead = e.state === 'dead'
  // The velocity, smoothed: a start or a stop leans for a beat, not a tick;
  // a teleport (a blink, a respawn) is no acceleration at all
  let vx = (e.x - e.px) / dt
  let vz = (e.z - e.pz) / dt
  if (Math.hypot(vx, vz) > 40) {
    vx = b.pvx
    vz = b.pvz
  }
  const k = Math.min(1, dt * 9)
  const nvx = b.pvx + (vx - b.pvx) * k
  const nvz = b.pvz + (vz - b.pvz) * k
  const ax = (nvx - b.pvx) / dt
  const az = (nvz - b.pvz) / dt
  b.pvx = nvx
  b.pvz = nvz
  const sy = Math.sin(e.yaw)
  const cy = Math.cos(e.yaw)
  const still = dead ? 0 : 1
  springTo(b.leanF, clamp((ax * sy + az * cy) * f.lean, -f.leanMax, f.leanMax) * still, 2.4, 0.6, dt)
  springTo(b.leanS, clamp((ax * cy - az * sy) * f.lean, -f.leanMax, f.leanMax) * still, 2.4, 0.6, dt)
  // (Its first tick: no turn before it.)
  if (Number.isNaN(b.pyaw)) b.pyaw = e.yaw
  let dyaw = e.yaw - b.pyaw
  dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw))
  b.pyaw = e.yaw
  springTo(b.bank, clamp((dyaw / dt) * f.bank, -f.bankMax, f.bankMax) * still, 2, 0.7, dt)
  // A hit (the flash jumps): rocked back; a landing: squashed
  if (e.flash > b.pflash + 0.4 && !dead) firePulse(b.flinch)
  b.pflash = e.flash
  if (e.y > 0.6) b.high = true
  else if (b.high && e.y < 0.1) {
    b.high = false
    firePulse(b.land)
  }
  stepPulse(b.flinch, dt)
  stepPulse(b.land, dt)
  b.pitch = b.leanF.x - 0.07 * b.flinch.x
  // It banks into a turn and tips toward a sideways push (+X is its R side)
  b.roll = -b.leanS.x - b.bank.x
  b.sq = -0.08 * b.land.x - 0.025 * b.flinch.x
}
