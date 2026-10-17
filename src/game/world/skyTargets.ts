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
}

export class SkyTargets {
  private kinds: Kind[] = []
  private pass = 0

  /** A fleet's `place`, made shootable: `r` its body's reach, `floor` the
   *  height it vanishes at as it sinks. */
  wrap(n: number, r: number, floor: number, place: PlaceFn): PlaceFn {
    const k: Kind = {
      n, r, floor, place,
      pos: new Float32Array(n * 3),
      seen: new Int32Array(n).fill(-1),
      downAt: new Float64Array(n).fill(-1),
      from: new Float32Array(n * 3),
      rot: new Float32Array(n * 4),
      scale: new Float32Array(n)
    }
    this.kinds.push(k)
    return (i, t, p, q, s) => {
      const d = k.downAt[i]!
      if (d < 0) {
        const on = place(i, t, p, q, s)
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
  }

  /** A new placement pass begins (before the fleets place their vehicles):
   *  only what this pass places is in the sky to be hit. */
  tick(): void {
    this.pass++
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
