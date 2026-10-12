import type { Object3D } from 'three'
import { buildGantryCrane, HOOK_DROP, type GantryCrane } from '../models/gantryCrane'
import { buildCrate } from '../models/props'
import type { CraneSpot } from '../world/decor'
import type { Theme } from '../world/themes'
import type { Particles } from '../fx/particles'

/**
 * ─── A room's crane at work (#114) ───────────────────────────────────────────
 *
 * The crane over a room (`world/decor.ts` plans where): it idles about, the
 * bridge rolling to a new spot every so often, the hook on its cable swaying
 * a little; a Scrapyard crane holds a crate, the Polarity Works' a casting.
 * Over the tutorial's crate lesson it DELIVERS: rolls over the spot, lowers
 * nothing, lets go — the crate falls, lands with a thud and a dust ring, and
 * is the lesson's crate (it stood there all along for the lesson's logic).
 * Over the golem room it holds the sleeping golem until Flux walks in, then
 * drops it (`Mission`'s golem drop). Looks only: it never touches a body —
 * except its idle crate, which a charged shot breaks (#134: nearly every
 * playtester shot at it): its loot rains down, and the hook stays empty.
 */

export interface RoomCraneHost {
  propParent(x: number, z: number): Object3D
  sfx(name: string, x?: number, z?: number): void
  fx: Particles
  shake(a: number): void
  player: { x: number; z: number }
}

/** Rolling to a spot (s), and the fall's pull (m/s²). */
const TRAVEL = 1.3
export const CRANE_G = 22
/** The idle wander: a new spot every IDLE_EVERY..+IDLE_JITTER s. */
const IDLE_EVERY = 7
const IDLE_JITTER = 5
/** A crate's height (props.ts: buildCrate's 1.15 m box). */
const CRATE_H = 1.15
/** The hanging crate's reach for a shot, round its middle (m). */
const LOAD_R = 0.62

interface Delivery {
  obj: Object3D
  x: number
  z: number
  groundY: number
  height: number
  onLand?: () => void
  t: number
  from: { u: number; v: number }
  to: { u: number; v: number }
  falling: boolean
  y: number
  vy: number
}

export class RoomCrane {
  readonly crane: GantryCrane
  private readonly cx: number
  private readonly cz: number
  private readonly alongX: boolean
  private readonly idleLoad: Object3D | null
  /** The idle crate was shot down: the hook stays empty. */
  loadBroken = false
  private job: Delivery | null = null
  /** Over a spot, held there (the golem): no wandering. */
  private parked = false
  private wanderT = 2
  private wander = { from: { u: 0, v: 0 }, to: { u: 0, v: 0 }, t: 1 }
  private readonly tipY: number

  constructor(private readonly host: RoomCraneHost, readonly spot: CraneSpot, private readonly theme: Theme) {
    this.alongX = spot.alongX
    this.cx = (spot.x0 + spot.x1) / 2
    this.cz = (spot.z0 + spot.z1) / 2
    const len = spot.alongX ? spot.x1 - spot.x0 : spot.z1 - spot.z0
    const span = spot.alongX ? spot.z1 - spot.z0 : spot.x1 - spot.x0
    this.crane = buildGantryCrane(len - 0.2, span - 0.8, spot.carry === 'claw' ? 'claw' : 'none')
    const r = this.crane.root
    r.position.set(this.cx, spot.y, this.cz)
    // Local x along the rails: turned onto z when they run that way.
    r.rotation.y = spot.alongX ? 0 : -Math.PI / 2
    host.propParent(this.cx, this.cz).add(r)
    // The hook tip's height over the rails at rest (its local y chain).
    this.tipY = spot.y + 0.9 - HOOK_DROP - 0.34
    if (spot.carry === 'crate') {
      this.idleLoad = buildCrate(theme).root
      this.crane.hookTip.add(this.idleLoad)
      this.idleLoad.position.y = -CRATE_H - 0.02
    } else this.idleLoad = null
  }

  /** World (x, z) → the crane's (u, v). */
  private uv(x: number, z: number): { u: number; v: number } {
    const dx = x - this.cx
    const dz = z - this.cz
    // Turned by −90°: local (u, v) lands on world (−v, u).
    return this.alongX ? { u: dx, v: dz } : { u: dz, v: -dx }
  }

  /** The hook's world (x, z) now. */
  hookAt(): { x: number; z: number; y: number } {
    const { u, v } = this.crane
    return this.alongX ? { x: this.cx + u, z: this.cz + v, y: this.tipY } : { x: this.cx - v, z: this.cz + u, y: this.tipY }
  }

  /** Whether (x, z) is under this crane. */
  covers(x: number, z: number): boolean {
    const s = this.spot
    return x > s.x0 && x < s.x1 && z > s.z0 && z < s.z1
  }

  /** The idle crate's middle, while it hangs there (null: none, broken, or
   *  away while the hook carries a delivery). */
  loadAt(): { x: number; y: number; z: number } | null {
    if (!this.idleLoad || this.loadBroken || this.job) return null
    const h = this.hookAt()
    return { x: h.x, y: h.y - 0.02 - CRATE_H / 2, z: h.z }
  }

  /** A shot (x, y, z, radius r) on the idle crate. */
  shotHitsLoad(x: number, y: number, z: number, r: number): boolean {
    const c = this.loadAt()
    if (!c) return false
    return Math.abs(y - c.y) <= CRATE_H / 2 + r && Math.hypot(x - c.x, z - c.z) <= LOAD_R + r
  }

  /** The idle crate breaks: splinters, a bonk, the hook left empty. Where
   *  it was (for its loot), or null when there was none to break. */
  breakLoad(): { x: number; y: number; z: number } | null {
    const c = this.loadAt()
    if (!c) return null
    this.loadBroken = true
    this.idleLoad!.visible = false
    this.idleLoad!.removeFromParent()
    this.host.fx.sparks(c.x, c.y, c.z, this.theme.crate, 14, 5, 0.22)
    this.host.fx.emit({ x: c.x, y: c.y, z: c.z, color: '#ffffff', size: 1.1, sizeEnd: 1.8, life: 0.18 })
    this.host.sfx('bonk', c.x, c.z)
    return c
  }

  /** Straight over (x, z), and stay there (the golem it holds). */
  park(x: number, z: number): void {
    const { u, v } = this.uv(x, z)
    this.crane.at(u, v)
    this.parked = true
  }

  /** Let the parked spot go: back to wandering. */
  unpark(): void {
    this.parked = false
    this.wanderT = IDLE_EVERY
  }

  /**
   * Bring `obj` (a mesh standing at (x, groundY, z), `height` tall) there:
   * it rides under the hook while the crane rolls over, then falls and lands
   * where it stands. `onLand` once it is down.
   */
  deliver(obj: Object3D, x: number, z: number, groundY: number, height: number, onLand?: () => void): void {
    this.parked = false
    if (this.idleLoad) this.idleLoad.visible = false
    this.job = {
      obj, x, z, groundY, height, onLand, t: 0, from: { u: this.crane.u, v: this.crane.v }, to: this.uv(x, z),
      falling: false, y: this.tipY - height - 0.02, vy: 0
    }
    obj.position.set(this.hookAt().x, this.tipY - height - 0.02, this.hookAt().z)
    this.host.sfx('trapHiss', x, z)
  }

  update(dt: number, time: number): void {
    const c = this.crane
    c.setDrop(HOOK_DROP + Math.sin(time * 0.7 + this.cx) * 0.05)
    const j = this.job
    if (j) {
      if (!j.falling) {
        j.t += dt
        const k = Math.min(1, j.t / TRAVEL)
        const e = k * k * (3 - 2 * k)
        c.at(j.from.u + (j.to.u - j.from.u) * e, j.from.v + (j.to.v - j.from.v) * e)
        const h = this.hookAt()
        j.obj.position.set(h.x, j.y, h.z)
        if (k >= 1) {
          j.falling = true
          this.host.sfx('alert', j.x, j.z)
        }
        return
      }
      j.vy += CRANE_G * dt
      j.y -= j.vy * dt
      if (j.y <= j.groundY) {
        j.y = j.groundY
        j.obj.position.set(j.x, j.groundY, j.z)
        this.landed(j.x, j.groundY, j.z)
        this.job = null
        if (this.idleLoad && !this.loadBroken) this.idleLoad.visible = true
        j.onLand?.()
        this.wanderT = IDLE_EVERY
        return
      }
      j.obj.position.set(j.x, j.y, j.z)
      return
    }
    if (this.parked) return
    // Idle: roll to a new spot now and then.
    const w = this.wander
    if (w.t < 1) {
      w.t = Math.min(1, w.t + dt / (TRAVEL * 2.2))
      const e = w.t * w.t * (3 - 2 * w.t)
      c.at(w.from.u + (w.to.u - w.from.u) * e, w.from.v + (w.to.v - w.from.v) * e)
      return
    }
    this.wanderT -= dt
    if (this.wanderT > 0) return
    const s = this.spot
    const len = this.alongX ? s.x1 - s.x0 : s.z1 - s.z0
    const span = this.alongX ? s.z1 - s.z0 : s.x1 - s.x0
    const r = (Math.sin(time * 12.9898 + this.cx) * 43758.5453) % 1
    const q = (Math.sin(time * 78.233 + this.cz) * 12345.678) % 1
    w.from = { u: c.u, v: c.v }
    w.to = { u: r * (len / 2 - 1.2), v: q * (span / 2 - 1.2) }
    w.t = 0
    this.wanderT = IDLE_EVERY + Math.abs(r) * IDLE_JITTER
  }

  /** A thud: dust round the foot, a little shake if he is close. */
  landed(x: number, y: number, z: number): void {
    this.host.fx.riseRing(x, y + 0.08, z, '#d8c8a8', 1.0, 20)
    this.host.fx.sparks(x, y + 0.2, z, '#c8b898', 14, 4, 0.2)
    this.host.sfx('door', x, z)
    const p = this.host.player
    if (Math.hypot(p.x - x, p.z - z) < 9) this.host.shake(0.22)
  }

  dispose(): void {
    this.crane.root.removeFromParent()
  }
}
