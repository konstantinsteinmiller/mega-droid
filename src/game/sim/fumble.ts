import type { Rng } from '../world/rng'

/**
 * ─── The fumble: a hard hit shakes Flux's charge loose ──────────────────────
 *
 * A machine lands a hard hit (a Core Master's blow, or one worth
 * `FUMBLE_HARD` of his bar) while Flux is charging the buster: now and then
 * (`FUMBLE_CHANCE`) he loses control of it.
 *
 * - The charge goes off at the level it had reached (a tiny one: a pellet),
 *   wild, in a wide cone round the view (`strayDir`). Never at the crosshair
 *   and never homing, but a normal shot after that: a lucky hit still counts.
 * - His arm flails for `FUMBLE_PANIC`, with no firing and no charging, and he
 *   blurts a line in a speech bubble (`flux.fumble.1..FUMBLE_LINES`,
 *   `FluxBubble.vue`).
 * - Sometimes (`FUMBLE_STUN_CHANCE`) the jolt stuns him for `FUMBLE_STUN`:
 *   no moving, no looking.
 * - Fire still held when the panic ends: the charge starts again from zero.
 *
 * A laugh, never a lock: at most one per `FUMBLE_COOLDOWN`. The mission
 * decides where it may happen at all: never in the tutorial (its Trooper
 * lesson needs a charge that lands), never in the exit cutscene, and never
 * from a trap, a pit or a blocked hit (`Mission.hitPlayer`).
 */

const DEG = Math.PI / 180

/** Chance a qualifying hit fumbles the charge. */
export const FUMBLE_CHANCE = 0.25
/** A hit this big (a fraction of max health, after armour) is a hard one. */
export const FUMBLE_HARD = 0.12
/** The flailing arm: no firing, no charging (s). */
export const FUMBLE_PANIC = 0.5
/** Chance a fumble also stuns… */
export const FUMBLE_STUN_CHANCE = 0.1
/** …for this long: no moving, no looking (s). */
export const FUMBLE_STUN = 0.2
/** From one fumble to the next may-fumble (s). */
export const FUMBLE_COOLDOWN = 1.5
/** The wild shot's cone round the view: turned left or right by between
 *  these (never straight at the crosshair)… */
export const FUMBLE_YAW_MIN = 12 * DEG
export const FUMBLE_YAW_MAX = 40 * DEG
/** …and tipped between these (+ = up). */
export const FUMBLE_PITCH_MIN = -5 * DEG
export const FUMBLE_PITCH_MAX = 20 * DEG
/** Flux's lines: `flux.fumble.1` … `flux.fumble.N`. */
export const FUMBLE_LINES = 6
/** The speech bubble's time on screen (s): long enough to read; his line is
 *  voiced too (`flux.fumble.*`, played by `Mission.fumbleCharge`). */
export const FUMBLE_BUBBLE = 2.2

/** A hard hit: from a Core Master, or a big share of the bar. */
export const isHardHit = (taken: number, maxHp: number, boss: boolean): boolean =>
  boss || taken >= maxHp * FUMBLE_HARD

/**
 * The wild shot's direction (a unit vector into `out`): the view (`yaw`,
 * `pitch`; forward is (-sin yaw, -cos yaw)) turned to a random side by
 * `FUMBLE_YAW_MIN..MAX` and tipped by `FUMBLE_PITCH_MIN..MAX`.
 */
export const strayDir = (yaw: number, pitch: number, rng: Rng, out: [number, number, number]): [number, number, number] => {
  const side = rng() < 0.5 ? -1 : 1
  const y = yaw + side * (FUMBLE_YAW_MIN + (FUMBLE_YAW_MAX - FUMBLE_YAW_MIN) * rng())
  const p = pitch + FUMBLE_PITCH_MIN + (FUMBLE_PITCH_MAX - FUMBLE_PITCH_MIN) * rng()
  out[0] = -Math.sin(y) * Math.cos(p)
  out[1] = Math.sin(p)
  out[2] = -Math.cos(y) * Math.cos(p)
  return out
}

/** Flux's fumble clock: the panic, the stun and the cooldown. */
export class Fumble {
  /** Every roll: the chance, the stun, the line, the shot. Tests stub it. */
  rng: Rng = Math.random
  /** The arm flails while > 0 (s). */
  panicT = 0
  /** No moving, no looking while > 0 (s). */
  stunT = 0
  /** No new fumble while > 0 (s). */
  cooldown = 0

  get panicking(): boolean {
    return this.panicT > 0
  }

  get stunned(): boolean {
    return this.stunT > 0
  }

  /** Does this hit fumble the charge? Charging, a hard hit, off cooldown,
   *  and the dice. */
  roll(charging: boolean, hard: boolean): boolean {
    if (!charging || !hard || this.cooldown > 0 || this.panicT > 0) return false
    return this.rng() < FUMBLE_CHANCE
  }

  /** A fumble starts: the panic, the cooldown, maybe the stun. Returns the
   *  i18n key of Flux's line. */
  start(): string {
    this.panicT = FUMBLE_PANIC
    this.cooldown = FUMBLE_COOLDOWN
    this.stunT = this.rng() < FUMBLE_STUN_CHANCE ? FUMBLE_STUN : 0
    return `flux.fumble.${1 + Math.min(FUMBLE_LINES - 1, Math.floor(this.rng() * FUMBLE_LINES))}`
  }

  /** One step. True on the step the panic ends. Snapped to 0 within float
   *  dust of it, so 30 steps of 1/60 are exactly the 0.5 s. */
  update(dt: number): boolean {
    this.cooldown = this.cooldown - dt > 1e-9 ? this.cooldown - dt : 0
    this.stunT = this.stunT - dt > 1e-9 ? this.stunT - dt : 0
    if (this.panicT <= 0) return false
    this.panicT = this.panicT - dt > 1e-9 ? this.panicT - dt : 0
    return this.panicT === 0
  }

  reset(): void {
    this.panicT = 0
    this.stunT = 0
    this.cooldown = 0
  }
}
