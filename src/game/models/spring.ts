/**
 * ─── Springs and curves: the pose layers' blend kit ──────────────────────────
 *
 * Shared by every animated body (the Masters' motion layer `models/bossAnim.ts`,
 * the mini-bosses' framework and channels, the Grand Master's joints, Flux on
 * the intro's street). Two kinds of tool:
 *
 *  - STATEFUL springs (`Spring`, `springTo`, `kickSpring`): a damped
 *    harmonic oscillator advanced by its EXACT solution, so it is stable at
 *    any tick and one 1/30 s step lands where two 1/60 s steps do. A weight
 *    driven by one never jumps: a target that snaps (a telegraph ending, a
 *    strike starting) is crossed in a few frames, with `zeta` < 1 a little
 *    past it and back (anticipation, overshoot, settle). A velocity kick is
 *    a recoil, a flinch or a landing's squash that rings out on its own.
 *  - PURE curves of a clock (`stepResponse`, `springPulse`): the same
 *    spring's answer to a step or a short push, as a function of the time
 *    since it began. For poses that must stay a pure function of their clock
 *    (the intro's street, which a test steps without state): smooth onset
 *    (zero velocity at the start, never a jump), overshoot, settle.
 *
 * Plus a rate-limited turn (`turnToward`, a servo's top speed). Pure math, no
 * three.js, no allocations after `newSpring`.
 */

export const TAU = Math.PI * 2

/** Position and velocity of one damped spring channel. */
export interface Spring {
  x: number
  v: number
}

export const newSpring = (x = 0): Spring => ({ x, v: 0 })

/**
 * Advance `s` toward `to` by `dt`, exactly. `hz` is the undamped natural
 * frequency (cycles per second; 2-3 lazy, 5-8 snappy, 10+ a servo), `zeta`
 * the damping ratio: 1 arrives without overshoot (critically damped), 0.6
 * overshoots by ≈10 %, 0.45 by ≈20 %. Returns the new position.
 */
export const springTo = (s: Spring, to: number, hz: number, zeta: number, dt: number): number => {
  if (dt <= 0) return s.x
  const w = TAU * hz
  const x0 = s.x - to
  const v0 = s.v
  if (zeta < 0.999) {
    const a = zeta * w
    const wd = w * Math.sqrt(1 - zeta * zeta)
    const e = Math.exp(-a * dt)
    const c = Math.cos(wd * dt)
    const sn = Math.sin(wd * dt)
    const c2 = (v0 + a * x0) / wd
    s.x = to + e * (x0 * c + c2 * sn)
    s.v = e * ((wd * c2 - a * x0) * c - (a * c2 + wd * x0) * sn)
  } else {
    const e = Math.exp(-w * dt)
    const c2 = v0 + w * x0
    s.x = to + e * (x0 + c2 * dt)
    s.v = e * (v0 - w * c2 * dt)
  }
  return s.x
}

/** Add `dv` to the spring's velocity: a recoil, a flinch, a landing. It
 *  swings out and rings back to its target on the next `springTo` steps. */
export const kickSpring = (s: Spring, dv: number): void => {
  s.v += dv
}

/** Peak excursion of a spring at rest kicked by `dv` (for sizing kicks):
 *  dv / ω · exp(−ζ/√(1−ζ²) · atan(√(1−ζ²)/ζ)). */
export const kickPeak = (dv: number, hz: number, zeta: number): number => {
  const w = TAU * hz
  if (zeta >= 0.999) return dv / (w * Math.E)
  const r = Math.sqrt(1 - zeta * zeta)
  return (dv / w) * Math.exp((-zeta / r) * Math.atan2(r, zeta))
}

/**
 * The spring's response to a unit step `t` s after it (0 before): starts at
 * 0 with zero velocity (no jump, no kink), rises, overshoots by an amount set
 * by `zeta`, and settles at 1.
 */
export const stepResponse = (t: number, hz: number, zeta: number): number => {
  if (t <= 0) return 0
  const w = TAU * hz
  if (zeta >= 0.999) return 1 - Math.exp(-w * t) * (1 + w * t)
  const a = zeta * w
  const wd = w * Math.sqrt(1 - zeta * zeta)
  return 1 - Math.exp(-a * t) * (Math.cos(wd * t) + (a / wd) * Math.sin(wd * t))
}

/**
 * A short push of `width` s, through the same spring: 0 before `t` = 0,
 * a smooth rise, a peak, a dip past 0 (follow-through) and back to 0. The
 * shape of a recoil or a flinch on a pure clock.
 */
export const springPulse = (t: number, width: number, hz: number, zeta: number): number =>
  stepResponse(t, hz, zeta) - stepResponse(t - width, hz, zeta)

/** `a` → `b` over the window [t0, t1], each end eased by the spring: on at
 *  t0, off at t1 (so ≈1 between, a small overshoot and settle at each edge). */
export const springWindow = (t: number, t0: number, t1: number, hz: number, zeta: number): number =>
  stepResponse(t - t0, hz, zeta) - stepResponse(t - t1, hz, zeta)

/**
 * A spring driven by a short push instead of a velocity kick: fired, it
 * swells from rest (no jump: a kick starts at full speed, a frame-one snap on
 * a big rig), peaks at `amp`, dips a little past 0 and settles. A recoil, a
 * landing's squash, a flinch, a footfall's dip. Firing it again mid-ring
 * pushes it on from where it is.
 */
export interface Pulse extends Spring {
  /** s since it was fired (−1: idle). */
  t: number
  amp: number
  readonly width: number
  readonly hz: number
  readonly zeta: number
  /** Target height that makes the peak 1. */
  readonly gain: number
}

/** Highest point of `springPulse` (numerically, once per pulse kind). */
export const pulsePeak = (hz: number, zeta: number, width: number): number => {
  let top = 0
  for (let t = 0; t < 3; t += 0.002) top = Math.max(top, springPulse(t, width, hz, zeta))
  return top
}

/** A pulse whose push lasts `width` s (≈ the rise time: 0.5–0.7 / hz). */
export const newPulse = (hz: number, zeta: number, width: number): Pulse =>
  ({ x: 0, v: 0, t: -1, amp: 0, width, hz, zeta, gain: 1 / pulsePeak(hz, zeta, width) })

export const firePulse = (p: Pulse, amp = 1): void => {
  p.t = 0
  p.amp = amp
}

/** Advance a pulse by `dt`; returns its position. */
export const stepPulse = (p: Pulse, dt: number): number => {
  const on = p.t >= 0 && p.t < p.width
  springTo(p, on ? p.gain * p.amp : 0, p.hz, p.zeta, dt)
  if (p.t >= 0) {
    p.t += dt
    if (p.t >= p.width) p.t = -1
  }
  return p.x
}

/**
 * An oscillator's phase under a varying rate. `sin(t · rate)` jumps the
 * moment the rate changes (by t · Δrate: at t = 20 s a 10 % faster fin beat
 * is a 2-radian pop); an integrated phase only ever turns at the rate it has
 * now. One per oscillator; `t` is the pose's clock (a repeated `t` adds
 * nothing, a gap longer than 0.1 s counts as 0.1 s).
 */
export interface Phase { at: number; ph: number }

export const newPhase = (): Phase => ({ at: NaN, ph: 0 })

export const phaseAt = (p: Phase, t: number, rate: number): number => {
  const dt = Number.isNaN(p.at) ? 0 : Math.max(0, Math.min(0.1, t - p.at))
  p.at = t
  p.ph = (p.ph + rate * dt) % (TAU * 64)
  return p.ph
}

const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a))

/** `cur` turned toward the angle `to` by at most `rate`·dt (rad): a servo's
 *  top speed, the short way round. */
export const turnToward = (cur: number, to: number, rate: number, dt: number): number => {
  const d = wrap(to - cur)
  const m = rate * dt
  return cur + (d > m ? m : d < -m ? -m : d)
}

export const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x)
