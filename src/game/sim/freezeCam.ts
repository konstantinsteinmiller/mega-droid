import { placeCamera, type CamSpot, type CineWorld } from './cineCam'

/**
 * ─── Freeze-frame shots ──────────────────────────────────────────────────────
 *
 * A short moment where the WORLD stops and the camera shows something: the
 * kill-cam (a machine crumbling), a trap's hit on Flux (volt, flame, spikes,
 * ice), Atlas pulling Flux out of a pit, or a lesson's card (first person, no
 * camera move). While a shot runs:
 *
 *   • nothing simulates — no machine, shot, trap, lift or timer moves, and
 *     nobody takes damage (the mission skips its whole step);
 *   • the effects keep playing — particles, debris, a death's squash-pop —
 *     so the moment reads as a frozen instant with sparks still flying;
 *   • a third-person shot frames Flux whole (the exit's hero rig) from a
 *     spring-arm camera that never ends inside a wall (`placeCamera`).
 *
 * A skippable shot ends early on the second fresh press of anything (one
 * press could be a stray one — a player mid-fire when the shot cut in).
 *
 * The director is pure bookkeeping plus a camera solver, so tests pin its
 * rules without a scene.
 */

export type FreezeKind = 'kill' | 'trap' | 'rescue' | 'lesson' | 'sink'
/** Where the camera goes: behind Flux toward the subject, in front of him
 *  looking back at him, high above a pit, or nowhere (first person). */
export type FreezeFrame = 'shoulder' | 'front' | 'above' | 'fp'

export interface FreezeSpec {
  kind: FreezeKind
  /** Length (s); `Infinity` holds until `end()` (a lesson card). */
  dur: number
  frame: FreezeFrame
  /** Flux's feet and facing for the shot. */
  hx: number
  hy: number
  hz: number
  hyaw: number
  /** What the shot is about (the machine, the trap, the pit). */
  tx: number
  ty: number
  tz: number
  skippable: boolean
  /** A visual tag for the hero's reaction and the shot's effects:
   *  'volt' | 'flame' | 'spikes' | 'ice' | 'crumble' | 'fall' | ''. */
  fx: string
}

/** Presses that skip a skippable shot. */
export const SKIP_PRESSES = 2
/** How far the spring arm reaches behind / in front of Flux (m). */
const SHOULDER_BACK = 2.7
const SHOULDER_SIDE = 0.85
const SHOULDER_UP = 1.95
const FRONT_DIST = 2.9
/** A rescue's front frame: this much further off, and low (m over Flux's
 *  feet), looking up at him hanging under Atlas in its beam. */
const RESCUE_PULL = 1
const RESCUE_RISE = -0.2
const FRONT_UP = 1.35
/** The front shot drifts round Flux by this much over its length (rad). */
const FRONT_ORBIT = 0.35

export interface FreezeView {
  x: number
  y: number
  z: number
  /** Look-at point. */
  tx: number
  ty: number
  tz: number
}

const _want: CamSpot = { x: 0, y: 0, z: 0 }
const _out: CamSpot = { x: 0, y: 0, z: 0 }

export class FreezeDirector {
  shot: FreezeSpec | null = null
  /** Seconds into the shot. */
  t = 0
  /** Fresh presses counted toward a skip. */
  presses = 0
  /** The smoothed camera (a first frame snaps). */
  readonly view: FreezeView = { x: 0, y: 0, z: 0, tx: 0, ty: 0, tz: 0 }
  private seeded = false

  get active(): boolean {
    return this.shot !== null
  }

  start(spec: FreezeSpec): void {
    this.shot = spec
    this.t = 0
    this.presses = 0
    this.seeded = false
  }

  /** Skip requested (the HUD's skip chip, or presses). */
  skip(): void {
    if (this.shot?.skippable) this.presses = SKIP_PRESSES
  }

  /** One real-time step. `pressed`: a fresh input this step. Returns the kind
   *  of shot that ended this step, or null. */
  update(dt: number, pressed: boolean): FreezeKind | null {
    const s = this.shot
    if (!s) return null
    this.t += dt
    if (pressed && s.skippable) this.presses++
    if (this.t >= s.dur || (s.skippable && this.presses >= SKIP_PRESSES)) return this.end()
    return null
  }

  end(): FreezeKind | null {
    const k = this.shot?.kind ?? null
    this.shot = null
    this.presses = 0
    return k
  }

  /** 0..1 through a timed shot (0 for a held one). */
  get progress(): number {
    const s = this.shot
    return !s || !Number.isFinite(s.dur) ? 0 : Math.min(1, this.t / s.dur)
  }

  /**
   * The camera for this frame, kept out of walls. `null` for a first-person
   * shot (the mission's own camera stays).
   */
  frame(w: CineWorld | null, dt: number): FreezeView | null {
    const s = this.shot
    if (!s || s.frame === 'fp') return null
    const k = this.progress
    const headY = s.hy + 1.4
    let lx = s.tx
    let ly = s.ty
    let lz = s.tz
    if (s.frame === 'shoulder') {
      // Behind Flux, on his right shoulder, looking past him at the subject;
      // the arm eases in a little over the shot.
      let dx = s.tx - s.hx
      let dz = s.tz - s.hz
      const d = Math.hypot(dx, dz) || 1
      dx /= d
      dz /= d
      const back = SHOULDER_BACK - 0.45 * k
      _want.x = s.hx - dx * back + dz * SHOULDER_SIDE
      _want.z = s.hz - dz * back - dx * SHOULDER_SIDE
      _want.y = s.hy + SHOULDER_UP
      // Mostly the subject, a little of Flux: both stay in frame.
      lx = s.hx + (s.tx - s.hx) * 0.72
      ly = headY + (s.ty - headY) * 0.72
      lz = s.hz + (s.tz - s.hz) * 0.72
    } else if (s.frame === 'front') {
      // In front of Flux looking back at him, drifting slowly round. A rescue
      // stands further off and higher, framing Atlas over him and its beam;
      // a barrel's (fx 'flat') stays low, on the pancake he has become.
      const rescue = s.kind === 'rescue'
      const flat = s.fx === 'flat'
      const a = s.hyaw + Math.PI + (k - 0.5) * FRONT_ORBIT
      const dist = rescue ? FRONT_DIST * RESCUE_PULL : FRONT_DIST
      _want.x = s.hx - Math.sin(a) * dist
      _want.z = s.hz - Math.cos(a) * dist
      _want.y = rescue ? s.hy + RESCUE_RISE : s.hy + (flat ? 1.15 : FRONT_UP + 0.4 * k)
      lx = s.hx
      // A pancake's look point stays over the floor: lower, the camera's
      // lines from it met the floor, and it went straight up overhead.
      ly = rescue ? s.ty : s.hy + (flat ? 0.6 : 1.0)
      lz = s.hz
    } else {
      // Above: high over the subject, looking down into it.
      _want.x = s.tx + Math.sin(s.hyaw) * 3.2
      _want.z = s.tz + Math.cos(s.hyaw) * 3.2
      _want.y = Math.max(s.ty, s.hy) + 4.2
    }
    if (w) placeCamera(w, lx, ly, lz, _want, _out)
    else {
      _out.x = _want.x
      _out.y = _want.y
      _out.z = _want.z
    }
    const v = this.view
    const r = this.seeded ? Math.min(1, dt * 9) : 1
    v.x += (_out.x - v.x) * r
    v.y += (_out.y - v.y) * r
    v.z += (_out.z - v.z) * r
    v.tx += (lx - v.tx) * r
    v.ty += (ly - v.ty) * r
    v.tz += (lz - v.tz) * r
    this.seeded = true
    return v
  }
}
