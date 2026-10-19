import { Quaternion, Vector3 } from 'three'

/**
 * ─── Sky traffic that can be shot down (#169) ────────────────────────────────
 *
 * The flying taxis and the parcel quadcopters over the city are set dressing,
 * but a blaster shot that clears the walls can reach them: one hit and the
 * vehicle bursts into flame and sinks, spinning, down out of the sky. It
 * stays down for the rest of the mission.
 *
 * Wraps a fleet's closed-form `place` (`world/cityscape.ts`): while a vehicle
 * flies, its last placed position is kept (a typed array, no allocation per
 * frame) for the shots to test; once downed, its fall is closed-form too,
 * from where and how it was hit.
 */

export type PlaceFn = (i: number, t: number, p: Vector3, q: Quaternion, s: Vector3) => boolean

/** The fall: its first speed down (m/s) and how it gathers pace (m/s²). */
export const SINK_V = 2.5
export const SINK_G = 1.8
/** Its spin round the vertical (rad/s) and how far its nose tips down (rad). */
const SINK_SPIN = 1.3
const SINK_TILT = 0.55

/**
 * The aim helper (#181): a charged shot into the sky that would pass a
 * vehicle close by draws it into its path. Only within LURE_R of the shot's
 * line, only ahead and within its reach, and only if the vehicle can get
 * there without darting (LURE_SPEED); it eases off its lane and meets the
 * shot where the shot will be. One vehicle per shot.
 */
export const LURE_R = 12
const LURE_SPEED = 9
/** The quickest a lure may run (s): no snap onto a shot already there. */
const LURE_MIN = 0.35
/** After the meeting it holds there this long, then eases back (s). */
const LURE_HOLD = 0.8
const LURE_BACK = 2.5
/** The step a detour is walked at for buildings before it is flown (s). */
const LURE_STEP = 0.05

/** A taxi's most bank into a detour's turn (rad, ~25°); a fleet can set less. */
export const BANK_MAX = 0.44
/** The finite step the detour's heading and bank are read over (s). */
const DT = 1 / 20
const GRAV = 9.8

const XAXIS = new Vector3(1, 0, 0)
const YAXIS = new Vector3(0, 1, 0)
const _q = new Quaternion()
const _p = new Vector3()
const _s = new Vector3()

interface Kind {
  n: number
  /** Its body's reach round its centre for a shot (m). */
  r: number
  /** Where it hides once it has sunk this low (m). */
  floor: number
  place: PlaceFn
  /** Its most bank into a detour's turn (rad). */
  bank: number
  /** Last placed centre, per vehicle (x, y, z). */
  pos: Float32Array
  /** The placement pass that last placed it in the sky (−1: never). */
  seen: Int32Array
  /** When it was downed (−1: still flying). */
  downAt: Float64Array
  /** Where, turned how and scaled how it was hit. */
  from: Float32Array
  rot: Float32Array
  scale: Float32Array
  /** A lure, per vehicle: from, meet and end times (−1: none), and the
   *  offset off its lane it reaches at the meeting (x, y, z). */
  lureAt: Float64Array
  meetAt: Float64Array
  off: Float32Array
}

const smooth = (k: number): number => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k))

export class SkyTargets {
  private kinds: Kind[] = []
  private pass = 0
  private byPlace = new WeakMap<PlaceFn, Kind>()

  /** `clear`: true if a vehicle `r` round at (x, y, z) stands clear of the
   *  skyline — a lure whose detour would not is refused. */
  constructor(private clear: (x: number, y: number, z: number, r: number) => boolean = () => true) {}

  /** Whether vehicle `i` of the fleet `wrap` returned `place` is down. */
  isDown(place: PlaceFn, i: number): boolean {
    const k = this.byPlace.get(place)
    return !!k && k.downAt[i]! >= 0
  }

  /** A fleet's `place`, made shootable: `r` its body's reach, `floor` the
   *  height it vanishes at as it sinks. */
  wrap(n: number, r: number, floor: number, place: PlaceFn, bank = BANK_MAX): PlaceFn {
    const k: Kind = {
      n, r, floor, place, bank,
      pos: new Float32Array(n * 3),
      seen: new Int32Array(n).fill(-1),
      downAt: new Float64Array(n).fill(-1),
      from: new Float32Array(n * 3),
      rot: new Float32Array(n * 4),
      scale: new Float32Array(n),
      lureAt: new Float64Array(n).fill(-1),
      meetAt: new Float64Array(n).fill(-1),
      off: new Float32Array(n * 3)
    }
    this.kinds.push(k)
    const wrapped: PlaceFn = (i, t, p, q, s) => {
      const d = k.downAt[i]!
      if (d < 0) {
        const on = place(i, t, p, q, s)
        if (on && k.lureAt[i]! >= 0) this.lured(k, i, t, p, q)
        if (on) {
          k.pos[i * 3] = p.x
          k.pos[i * 3 + 1] = p.y
          k.pos[i * 3 + 2] = p.z
          k.seen[i] = this.pass
        }
        return on
      }
      return this.fall(k, i, t, p, q, s)
    }
    this.byPlace.set(wrapped, k)
    return wrapped
  }

  /** A new placement pass begins (before the fleets place their vehicles):
   *  only what this pass places is in the sky to be hit. */
  tick(): void {
    this.pass++
  }

  /**
   * A charged shot from (x, y, z) flying (vx, vy, vz) m/s for `range` metres
   * more, at time `t`: the one vehicle closest to its line (within LURE_R,
   * ahead of it, and able to reach it in time) steers to meet it. True if
   * one did.
   */
  lure(x: number, y: number, z: number, vx: number, vy: number, vz: number, range: number, t: number): boolean {
    const v2 = vx * vx + vy * vy + vz * vz
    if (v2 < 1e-6) return false
    const speed = Math.sqrt(v2)
    let best: Kind | null = null
    let bi = -1
    let bd = LURE_R * LURE_R
    let bt = 0
    for (const k of this.kinds) {
      for (let i = 0; i < k.n; i++) {
        if (k.seen[i] !== this.pass || k.downAt[i]! >= 0 || k.lureAt[i]! >= 0) continue
        // When the shot passes nearest the vehicle — where its lane will
        // have it by then (a taxi crosses 17 m a second: its spot now is
        // the wrong place to meet it), refined twice from its spot now.
        let px = k.pos[i * 3]!, py = k.pos[i * 3 + 1]!, pz = k.pos[i * 3 + 2]!
        let tc = 0
        let d2 = Infinity
        for (let it = 0; it < 3; it++) {
          const dx = px - x, dy = py - y, dz = pz - z
          tc = (dx * vx + dy * vy + dz * vz) / v2
          const ex = dx - vx * tc, ey = dy - vy * tc, ez = dz - vz * tc
          d2 = ex * ex + ey * ey + ez * ez
          if (tc <= 0) break
          _s.set(1, 1, 1)
          if (!k.place(i, t + tc, _p, _q, _s)) break
          px = _p.x
          py = _p.y
          pz = _p.z
        }
        if (tc <= 0 || tc * speed > range) continue
        if (d2 >= bd) continue
        best = k
        bi = i
        bd = d2
        bt = tc
      }
    }
    if (!best) return false
    // Where it must be when the shot gets there, against where its lane
    // would have it then: the difference is the detour it flies.
    const meet = t + Math.max(bt, LURE_MIN)
    _s.set(1, 1, 1)
    if (!best.place(bi, meet, _p, _q, _s)) return false
    const ox = x + vx * (meet - t) - _p.x
    const oy = y + vy * (meet - t) - _p.y
    const oz = z + vz * (meet - t) - _p.z
    if (Math.hypot(ox, oy, oz) > LURE_SPEED * (meet - t)) return false
    best.lureAt[bi] = t
    best.meetAt[bi] = meet
    best.off[bi * 3] = ox
    best.off[bi * 3 + 1] = oy
    best.off[bi * 3 + 2] = oz
    // Never into a building: the whole detour, out and back, is walked
    // first; one that would clip the skyline is no lure.
    const end = meet + LURE_HOLD + LURE_BACK
    for (let u = t; u <= end + 1e-6; u += LURE_STEP) {
      this.at(best, bi, u, _b0, _d0)
      if (!this.clear(_d0.x, _d0.y, _d0.z, best.r)) {
        best.lureAt[bi] = -1
        return false
      }
    }
    return true
  }

  /** A lured vehicle's detour weight at `t`: eased out to the meeting,
   *  held a moment, eased back. */
  private weight(k: Kind, i: number, t: number): number {
    const a = k.lureAt[i]!
    const m = k.meetAt[i]!
    return t < m ? smooth((t - a) / (m - a)) : 1 - smooth((t - m - LURE_HOLD) / LURE_BACK)
  }

  /** Where the lane puts it at `t` (into `p`), and with the detour (`d`). */
  private at(k: Kind, i: number, t: number, p: Vector3, d: Vector3): void {
    _s.set(1, 1, 1)
    k.place(i, t, p, _q2, _s)
    const w = this.weight(k, i, t)
    d.set(p.x + k.off[i * 3]! * w, p.y + k.off[i * 3 + 1]! * w, p.z + k.off[i * 3 + 2]! * w)
  }

  /**
   * A lured vehicle at `t`: its detour off its lane, and its turn — it noses
   * round to where it actually flies (the lane's heading turned by the
   * difference) and banks into the turn by the detour's own sideways pull
   * (the lane's own curve already flies as built), clamped to `k.bank`.
   * Both come from the eased path, so they ease in and out with it.
   */
  private lured(k: Kind, i: number, t: number, p: Vector3, q: Quaternion): void {
    const w = this.weight(k, i, t)
    if (t > k.meetAt[i]! + LURE_HOLD + LURE_BACK) k.lureAt[i] = -1
    // Three samples round t, on the lane (b) and on the detour (d).
    this.at(k, i, t - DT, _b0, _d0)
    this.at(k, i, t, _b1, _d1)
    this.at(k, i, t + DT, _b2, _d2)
    p.x += k.off[i * 3]! * w
    p.y += k.off[i * 3 + 1]! * w
    p.z += k.off[i * 3 + 2]! * w
    // Heading: lane velocity against detour velocity, round the vertical.
    const bx = _b2.x - _b0.x, bz = _b2.z - _b0.z
    const dx = _d2.x - _d0.x, dz = _d2.z - _d0.z
    if (bx * bx + bz * bz > 1e-8 && dx * dx + dz * dz > 1e-8) {
      const turn = Math.atan2(dx, dz) - Math.atan2(bx, bz)
      q.premultiply(_tilt.setFromAxisAngle(YAXIS, Math.atan2(Math.sin(turn), Math.cos(turn))))
    }
    // Bank: the detour's extra sideways acceleration (level), as a tilt of
    // the vertical toward it.
    const ax = (_d2.x - 2 * _d1.x + _d0.x - (_b2.x - 2 * _b1.x + _b0.x)) / (DT * DT)
    const az = (_d2.z - 2 * _d1.z + _d0.z - (_b2.z - 2 * _b1.z + _b0.z)) / (DT * DT)
    // Only its part across the flight: speeding up or braking tilts nothing.
    const fl = Math.hypot(dx, dz)
    let lx = ax, lz = az
    if (fl > 1e-6) {
      const fx = dx / fl, fz = dz / fl
      const along = ax * fx + az * fz
      lx -= along * fx
      lz -= along * fz
    }
    const la = Math.hypot(lx, lz)
    if (la > 1e-4) {
      const roll = Math.min(k.bank, Math.atan(la / GRAV))
      // Turning the vertical toward the pull: round (pull × up) / |pull|.
      _ax.set(lz / la, 0, -lx / la)
      q.premultiply(_tilt.setFromAxisAngle(_ax, roll))
    }
  }

  /** How many vehicles have been shot down. */
  get downed(): number {
    let c = 0
    for (const k of this.kinds) for (let i = 0; i < k.n; i++) if (k.downAt[i]! >= 0) c++
    return c
  }

  /**
   * A shot at (x, y, z), radius `r`, at time `t`: true if it struck a vehicle
   * still flying, which is downed now; its centre goes into `out`.
   */
  hit(x: number, y: number, z: number, r: number, t: number, out: Vector3): boolean {
    for (const k of this.kinds) {
      const rr = (k.r + r) * (k.r + r)
      for (let i = 0; i < k.n; i++) {
        if (k.seen[i] !== this.pass || k.downAt[i]! >= 0) continue
        const dx = k.pos[i * 3]! - x
        const dy = k.pos[i * 3 + 1]! - y
        const dz = k.pos[i * 3 + 2]! - z
        if (dx * dx + dy * dy + dz * dz > rr) continue
        // Its pose now (closed form): where the fall starts from.
        _s.set(1, 1, 1)
        k.place(i, t, _p, _q, _s)
        if (k.lureAt[i]! >= 0) this.lured(k, i, t, _p, _q)
        k.lureAt[i] = -1
        k.downAt[i] = t
        k.from[i * 3] = _p.x
        k.from[i * 3 + 1] = _p.y
        k.from[i * 3 + 2] = _p.z
        k.rot[i * 4] = _q.x
        k.rot[i * 4 + 1] = _q.y
        k.rot[i * 4 + 2] = _q.z
        k.rot[i * 4 + 3] = _q.w
        k.scale[i] = _s.x
        out.copy(_p)
        return true
      }
    }
    return false
  }

  /** Every vehicle still sinking at `t`, by its centre (its smoke trail). */
  sinking(t: number, emit: (x: number, y: number, z: number) => void): void {
    for (const k of this.kinds) {
      for (let i = 0; i < k.n; i++) {
        if (k.downAt[i]! < 0) continue
        if (this.fall(k, i, t, _p, _q, _s)) emit(_p.x, _p.y, _p.z)
      }
    }
  }

  private fall(k: Kind, i: number, t: number, p: Vector3, q: Quaternion, s: Vector3): boolean {
    const e = Math.max(0, t - k.downAt[i]!)
    p.set(k.from[i * 3]!, k.from[i * 3 + 1]! - SINK_V * e - 0.5 * SINK_G * e * e, k.from[i * 3 + 2]!)
    q.set(k.rot[i * 4]!, k.rot[i * 4 + 1]!, k.rot[i * 4 + 2]!, k.rot[i * 4 + 3]!)
    q.multiply(_tilt.setFromAxisAngle(XAXIS, Math.min(SINK_TILT, e * 0.4)))
    q.premultiply(_tilt.setFromAxisAngle(YAXIS, e * SINK_SPIN))
    s.setScalar(k.scale[i]!)
    return p.y > k.floor
  }
}

const _tilt = new Quaternion()
const _q2 = new Quaternion()
const _ax = new Vector3()
const _b0 = new Vector3()
const _b1 = new Vector3()
const _b2 = new Vector3()
const _d0 = new Vector3()
const _d1 = new Vector3()
const _d2 = new Vector3()
