import { poseAdd, type Rig } from './kit'

/**
 * ─── Shield Trooper acting ───────────────────────────────────────────────────
 *
 * The android-like reactions layered OVER the Trooper's gait/guard/aim pose,
 * shared by the intro's showcase (`story/intro.ts`) and the game
 * (`animateTrooper`, from the hit/shot events in its `EnemyMotion`): hits
 * throw the body back joint by joint (shield arm flung, chest and then the
 * head snapping back, knees buckling, a damped wobble as its servos catch
 * it), a hit on the raised shield drives the shield arm back and rocks the
 * chest, each shot kicks the gun arm, and the slam is a real overhead blow.
 *
 * Usage: `resetTrooperAct`, add any number of `act*` layers (they sum), then
 * `applyTrooperAct` once. One scratch record, no allocation per frame.
 */

export interface TrooperAct {
  chX: number
  chY: number
  chZ: number
  hdX: number
  hdZ: number
  shLX: number
  shLY: number
  shLZ: number
  elL: number
  shRX: number
  shRZ: number
  elR: number
  /** Knee bend, in units of the crouch below (feet stay planted). */
  crouch: number
  /** Hips raised (rig units). */
  lift: number
}

export const newTrooperAct = (): TrooperAct => ({
  chX: 0, chY: 0, chZ: 0, hdX: 0, hdZ: 0, shLX: 0, shLY: 0, shLZ: 0, elL: 0, shRX: 0, shRZ: 0, elR: 0, crouch: 0, lift: 0
})

export const resetTrooperAct = (a: TrooperAct): TrooperAct => {
  a.chX = a.chY = a.chZ = a.hdX = a.hdZ = 0
  a.shLX = a.shLY = a.shLZ = a.elL = a.shRX = a.shRZ = a.elR = 0
  a.crouch = a.lift = 0
  return a
}

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)
/** 0 → 1 across [a, b], smoothstepped. */
const ramp = (a: number, b: number, x: number): number => {
  const k = clamp01((x - a) / (b - a))
  return k * k * (3 - 2 * k)
}
/** A damped oscillation `age` seconds after an event (0 before it). */
const wob = (age: number, hz: number, damp: number): number => age < 0 ? 0 : Math.exp(-damp * age) * Math.sin(2 * Math.PI * hz * age)
/** A fast rise, then an exponential settle. */
const hit = (age: number, settle: number): number => age < 0 ? 0 : ramp(0, 0.06, age) * Math.exp(-settle * age)

/** How long a reaction lasts (s): past it every layer is exactly 0. */
export const TROOPER_HIT_LEN = 2.5
export const TROOPER_SHOT_LEN = 1

/**
 * A hit `age` seconds ago, strength `k` (1 = a full charged shot). `twist`
 * turns the chest away from the shot's side (+1: it came from the rig's +X).
 */
export const actHit = (a: TrooperAct, age: number, k: number, twist = 1): void => {
  if (age < 0 || age > TROOPER_HIT_LEN) return
  const e = hit(age, 2.4) * k
  const lag = hit(age - 0.05, 2.8) * k
  a.chX -= 0.45 * e + 0.08 * k * wob(age, 2.6, 4)
  a.chY += 0.32 * e * twist
  a.chZ -= 0.12 * e
  a.hdX -= 0.55 * lag + 0.12 * k * wob(age - 0.05, 3.4, 5)
  a.hdZ += 0.25 * lag
  a.shLX += 0.9 * e
  a.shLZ -= 0.5 * e
  a.elL -= 0.4 * e
  a.shRX += 0.5 * e
  a.shRZ += 0.45 * lag
  a.elR -= 0.35 * lag
  a.crouch += 0.75 * e * (1 - 0.4 * Math.exp(-6 * age))
}

/**
 * A hit taken on the raised shield: the shield arm is driven back into the
 * body and springs out again, the chest rocks, the knees give a little; the
 * head and gun arm stay on target (no full whip).
 */
export const actBlock = (a: TrooperAct, age: number, k: number, twist = 0): void => {
  if (age < 0 || age > TROOPER_HIT_LEN) return
  const e = hit(age, 5) * k
  const shake = k * wob(age, 3.2, 6)
  a.shLX += 0.55 * e + 0.08 * shake
  a.elL += 0.35 * e
  a.chX -= 0.16 * e + 0.05 * shake
  a.chY += 0.12 * e * twist
  a.hdX -= 0.05 * hit(age - 0.04, 6) * k
  a.crouch += 0.3 * e
}

/** One of its own shots `age` seconds ago: the brace before it (age < 0),
 *  then the gun arm kicks up and the chest twists back. */
export const actShot = (a: TrooperAct, age: number): void => {
  if (age < -0.2 || age > TROOPER_SHOT_LEN) return
  a.crouch += 0.2 * ramp(-0.2, 0, age) * (1 - ramp(0.1, 0.5, age))
  const k = hit(age, 7)
  a.shRX -= 0.4 * k
  a.elR -= 0.3 * k
  a.chY -= 0.14 * k
  a.chX -= 0.06 * k
  a.hdX -= 0.08 * hit(age - 0.03, 6)
}

/** The overhead slam, `sa` seconds from its contact: wind up (crouch, then
 *  rise with both arms high, chest arched), drive down, shudder, hold, recover. */
export const actSlam = (a: TrooperAct, sa: number): void => {
  const up = ramp(-0.65, -0.15, sa)
  const prep = ramp(-0.75, -0.55, sa) * (1 - ramp(-0.5, -0.3, sa))
  const drive = ramp(-0.15, 0, sa)
  const strike = drive * drive * (1 - ramp(0.45, 1.1, sa))
  const wind = up * (1 - drive)
  if (up <= 0 && drive <= 0) return
  const shake = 0.06 * wob(sa, 7, 7)
  a.crouch += 0.45 * prep + 1.1 * strike
  a.lift += 0.06 * wind
  a.chX += -0.4 * wind + 0.6 * strike + shake
  a.hdX += -0.3 * wind + 0.25 * strike - 0.12 * wob(sa - 0.04, 4, 6)
  a.shLX += -2.7 * wind - 0.75 * strike
  a.shLY += 1.4 * (wind + strike)
  a.elL += 0.3 * wind - 0.2 * strike
  a.shRX += -2.4 * wind - 0.95 * strike
  a.shRZ += -0.25 * wind
  a.elR += 0.35 * wind - 0.15 * strike
}

/** Hip drop per unit of crouch: what the thigh/shin angles below shorten
 *  the legs by (thigh and shin 0.3 each), so the feet stay planted. */
export const TROOPER_CROUCH_DROP = 0.055

/** Lay the summed layers onto the rig, on top of whatever posed it before. */
export const applyTrooperAct = (R: Rig, a: TrooperAct): void => {
  const c = Math.min(a.crouch, 1.2)
  const hips = R.bones.hips
  if (hips) hips.position.y += -TROOPER_CROUCH_DROP * c + a.lift
  poseAdd(R, 'hipL', -0.5 * c, 0, 0)
  poseAdd(R, 'hipR', -0.5 * c, 0, 0)
  poseAdd(R, 'kneeL', 0.85 * c, 0, 0)
  poseAdd(R, 'kneeR', 0.85 * c, 0, 0)
  poseAdd(R, 'chest', a.chX - 0.12 * c, a.chY, a.chZ)
  poseAdd(R, 'head', a.hdX, 0, a.hdZ)
  poseAdd(R, 'shoulderL', a.shLX, a.shLY, a.shLZ)
  poseAdd(R, 'elbowL', a.elL, 0, 0)
  poseAdd(R, 'shoulderR', a.shRX, 0, a.shRZ)
  poseAdd(R, 'elbowR', a.elR, 0, 0)
}
