import { Color } from 'three'
import { CELL, type RailSpec } from '../../world/levelGen'
import { groundAt } from '../../world/nav'
import { buildRail, buildCart, buildMineCart, buildQuadcopter, type CartMesh, type RailMesh } from '../../models/stageProps/rail'
import type { ClimbBody, ClimbHost } from '../climb'
import type { StageFeature } from '../stageFeatures'

/**
 * ─── The maglev cart (Rail Rush, `world/stages/volt.ts`) ────────────────────
 *
 * A cart waits in its slot on the boarding platform (`RailSpec.boardAt`).
 * Stand on it for a beat and it sets off: Flux is drawn onto its middle and
 * carried along the rail's polyline (`carry`), the stick idle (`locksMove`)
 * while looking, shooting and blocking still work — a slide does not start
 * off it, the body is not on the ground. It pulls away and brakes into the
 * exit slot (`exitAt`) smoothly, the height following the rail; there it
 * stops and lets go, and stays: there is no way back.
 *
 * A ride is never saved half done: a resume (or a teleport off the cart —
 * the mission putting Flux back on a checkpoint) puts the cart back in its
 * boarding slot, and the boarding platform is the checkpoint for the whole
 * ride. A death on the cart just halts it until the reboot.
 *
 * Atlas: the drive on boarding, a warning before the big drop, the stop.
 */

/** Stood on the cart this long (s) before it sets off. */
export const BOARD_BEAT = 0.6
/** Pulling away and braking (m/s²), and the crawl into the slot (m/s). */
const ACCEL = 3.2
const BRAKE = 3.4
const CRAWL = 0.7
/** How long the body takes to slide onto the cart's middle (s). */
const SNAP_T = 0.45
/** Off the cart by more than this (m) mid-ride: something moved Flux (a
 *  checkpoint restart) — the ride is off and the cart goes home. */
const LOST = 3
/** Spark crackles along the rail near Flux (s between two). */
const SPARK_EVERY = 0.09
const SPARK_NEAR = 26

export type RailState = 'wait' | 'board' | 'ride' | 'done'

/** A point on the rail: the cart's floor there, its level heading (unit)
 *  and its slope (rad, climbing positive). */
export interface RailPoint {
  x: number
  y: number
  z: number
  dx: number
  dz: number
  pitch: number
}

const STRIP_A = new Color('#ffe13d')
const STRIP_B = new Color('#fffbe0')
const STRIP_DIM = new Color('#8a6a10')
/** The mine track's steel rails: they glint, they do not crackle. */
const STEEL = new Color('#c9ced8')
const STEEL_GLINT = new Color('#ffffff')

export class RailFeature implements StageFeature {
  readonly def: RailSpec
  /** Distance along the rail at each point (m), and the whole length. */
  private readonly cum: Float32Array
  readonly length: number
  state: RailState = 'wait'
  /** Distance along the rail (m) and speed (m/s). */
  s = 0
  v = 0
  /** Rides started so far (the waves re-arm on each). */
  rides = 0
  /** The cart now: position (its floor) and heading along the rail. */
  x = 0
  y = 0
  z = 0
  dirX = 0
  dirZ = 1
  private readonly at: RailPoint = { x: 0, y: 0, z: 0, dx: 0, dz: 1, pitch: 0 }
  private beat = 0
  private snap = 0
  private ox = 0
  private oz = 0
  /** The Rotor Run's flight (a quadcopter, no track). */
  private air = false
  /** The Deep Mine's ore tub on a sleepered track (#111). */
  private mine = false
  /** Atlas's lines for this ride: the volt's, the rotor's or the mine's. */
  private lines = 'volt'
  private spark = 0
  private readonly host: ClimbHost
  private readonly bi: number
  private readonly bj: number
  private readonly rail: RailMesh
  private readonly cart: CartMesh

  constructor(host: ClimbHost, def: RailSpec) {
    this.host = host
    this.def = def
    const P = def.points
    this.cum = new Float32Array(P.length)
    for (let n = 1; n < P.length; n++) {
      const a = P[n - 1]!
      const c = P[n]!
      this.cum[n] = this.cum[n - 1]! + Math.hypot(c.x - a.x, c.y - a.y, c.z - a.z)
    }
    this.length = this.cum[P.length - 1] ?? 0
    this.bi = def.boardAt.i
    this.bj = def.boardAt.j
    const map = host.map
    const t = map.terrain!
    this.rail = buildRail(host.theme, P, (x, z) => {
      const g = groundAt(map, x, z)
      if (g > -Infinity) return g
      const i = Math.floor(x / CELL)
      const j = Math.floor(z / CELL)
      const r = i >= 0 && j >= 0 && i < map.w && j < map.h ? map.room[j * map.w + i]! : -1
      return r >= 0 ? t.pitBottom[r] ?? -12 : -12
    }, host.theme.id === 'drill')
    host.scene.add(this.rail.root)
    // The Rotor Run flies its course: no track, a quadcopter for a cart,
    // and Atlas's own lines.
    this.air = host.theme.id === 'rotor'
    this.mine = host.theme.id === 'drill'
    this.lines = this.air ? 'rotor' : this.mine ? 'drill' : 'volt'
    this.rail.root.visible = !this.air
    this.cart = this.air ? buildQuadcopter(host.theme) : this.mine ? buildMineCart(host.theme) : buildCart(host.theme)
    host.scene.add(this.cart.root)
    this.place(0)
  }

  /**
   * The point `s` m along the rail (clamped) into `out`: the cart's floor
   * there, its level heading and its slope. A binary search, no state (the
   * waves ask it for the rail ahead).
   */
  sample(s: number, out: RailPoint): void {
    const P = this.def.points
    const cum = this.cum
    const last = P.length - 1
    s = Math.max(0, Math.min(this.length, s))
    let lo = 0
    let hi = Math.max(0, last - 1)
    while (lo < hi) {
      const m = (lo + hi + 1) >> 1
      if (cum[m]! <= s) lo = m
      else hi = m - 1
    }
    const n1 = Math.min(last, lo + 1)
    const a = P[lo]!
    const c = P[n1]!
    const span = cum[n1]! - cum[lo]!
    const k = span > 1e-6 ? (s - cum[lo]!) / span : 0
    out.x = a.x + (c.x - a.x) * k
    out.y = a.y + (c.y - a.y) * k
    out.z = a.z + (c.z - a.z) * k
    const hx = c.x - a.x
    const hz = c.z - a.z
    const h = Math.hypot(hx, hz)
    if (h > 1e-6) {
      out.dx = hx / h
      out.dz = hz / h
      out.pitch = Math.atan2(c.y - a.y, h)
    }
  }

  /** The cart at `s` along the rail: position, heading, and the mesh. */
  private place(s: number): void {
    const q = this.at
    this.sample(s, q)
    this.s = Math.max(0, Math.min(this.length, s))
    this.x = q.x
    this.y = q.y
    this.z = q.z
    this.dirX = q.dx
    this.dirZ = q.dz
    const root = this.cart.root
    root.position.set(q.x, q.y, q.z)
    root.rotation.order = 'YXZ'
    root.rotation.y = Math.atan2(-q.dx, -q.dz)
    root.rotation.x = q.pitch
  }

  /**
   * A shot stops on the cart: its deck (a shot aimed down through the floor
   * Flux rides on went straight through it) and its side rails. The test runs
   * in the cart's frame: `dirX/dirZ` is its long axis.
   */
  shotHits(x: number, y: number, z: number, r: number): boolean {
    const dx = x - this.x
    const dz = z - this.z
    const along = dx * this.dirX + dz * this.dirZ
    const side = dx * this.dirZ - dz * this.dirX
    if (Math.abs(along) > 1.3 + r || Math.abs(side) > 1.25 + r) return false
    const dy = y - this.y
    if (dy < -0.8 - r) return false
    if (dy <= 0.02 + r) return true
    // Above the deck only the side rails (and the front bar) are solid.
    return dy <= 0.66 + r && (Math.abs(side) > 1.05 || along > 1.2)
  }

  /** Back in the boarding slot, waiting. */
  reset(): void {
    this.state = 'wait'
    this.v = 0
    this.beat = 0
    this.place(0)
    this.cart.padMat.color.set(this.host.theme.pipe)
  }

  update(dt: number, time: number, p: ClimbBody, playing: boolean): void {
    const host = this.host
    if (this.state === 'wait' || this.state === 'board') {
      const on = playing && p.ground && p.ladder < 0 && Math.floor(p.x / CELL) === this.bi && Math.floor(p.z / CELL) === this.bj &&
        Math.abs(p.y - this.y) < 0.4
      if (on) {
        this.state = 'board'
        this.beat += dt
        if (this.beat >= BOARD_BEAT) this.start(p)
      } else {
        this.state = 'wait'
        this.beat = 0
      }
    } else if (this.state === 'ride' && playing) {
      if (this.snap >= SNAP_T && Math.hypot(p.x - this.x, p.z - this.z) > LOST) {
        this.reset()
        return
      }
      const rem = this.length - this.s
      const cap = Math.max(CRAWL, Math.sqrt(2 * BRAKE * rem))
      this.v = Math.min(this.def.speed, cap, this.v + ACCEL * dt)
      this.place(this.s + this.v * dt)
      if (this.s >= this.length - 1e-3) this.arrive(p)
    }
    // The strips crackle; the magnet pads glow while it rides.
    const f = Math.sin(time * 37) * Math.sin(time * 23 + 1.3)
    if (this.mine) this.rail.stripMat.color.copy(f > 0.8 ? STEEL_GLINT : STEEL)
    else this.rail.stripMat.color.copy(f > 0.55 ? STRIP_B : f < -0.7 ? STRIP_DIM : STRIP_A)
    if (this.state === 'ride') this.cart.padMat.color.copy(f > 0 ? STRIP_B : STRIP_A)
    // A quadcopter's rotors: idling in its slot, flat out in flight.
    if (this.cart.rotors) {
      const spin = (this.state === 'ride' ? 34 : this.state === 'board' ? 20 : 6) * dt
      for (const r of this.cart.rotors) r.rotation.y += spin
    }
    this.spark -= dt
    if (this.spark <= 0) {
      this.spark = SPARK_EVERY
      const P = this.def.points
      const q = P[Math.floor(Math.random() * P.length)]!
      if (Math.abs(q.x - p.x) < SPARK_NEAR && Math.abs(q.z - p.z) < SPARK_NEAR) host.fx.sparks(q.x, q.y - 0.4, q.z, '#ffe13d', 4, 4, 0.12)
      if (this.state === 'ride') host.fx.sparks(this.x, this.y - 0.7, this.z, '#bfe8ff', 3, 3, 0.1)
      else if (this.state === 'wait' && Math.floor(time * 1.2) !== Math.floor((time - SPARK_EVERY) * 1.2) &&
        Math.hypot(p.x - this.x, p.z - this.z) < 12) {
        // Waiting: a ring in the slot every so often says "stand here".
        host.fx.riseRing(this.x, this.y + 0.1, this.z, '#ffe13d', 0.9, 12)
      }
    }
  }

  /** Off it goes: Flux slides onto the middle and the stick lets go. */
  private start(p: ClimbBody): void {
    this.state = 'ride'
    this.rides++
    this.v = 0
    this.snap = 0
    this.ox = p.x - this.x
    this.oz = p.z - this.z
    p.path = null
    this.host.sfx('liftOff', this.x, this.z)
    this.host.shake(0.12)
    this.host.say(`hint.${this.lines}.board`)
  }

  /** In the exit slot: stop, let go, stay. */
  private arrive(p: ClimbBody): void {
    this.state = 'done'
    this.v = 0
    this.place(this.length)
    p.x = this.x
    p.z = this.z
    p.y = this.y
    p.vx = p.vz = p.vy = 0
    p.ground = true
    p.air = 0
    p.plat = -1
    p.safeY = this.y
    this.cart.padMat.color.set(this.host.theme.pipe)
    this.host.sfx('deckLand', this.x, this.z)
    this.host.shake(0.1)
    this.host.fx.sparks(this.x, this.y + 0.1, this.z, '#ffe13d', 14, 6, 0.16)
  }

  carry(p: ClimbBody, out: [number, number], dt: number): boolean {
    if (this.state !== 'ride') return false
    this.snap += dt
    const f = Math.max(0, 1 - this.snap / SNAP_T)
    const k = f * f
    out[0] = this.x + this.ox * k
    out[1] = this.z + this.oz * k
    p.y = this.y
    p.safeY = this.y
    // Carried, not walking: no velocity of its own (no head bob, no
    // momentum when let go), and off the ground (no slide, no checkpoint
    // under the rail).
    p.vx = p.vz = p.vy = 0
    p.ground = false
    p.air = 0
    p.plat = -1
    p.ladder = -1
    p.mantle = 0
    return true
  }

  locksMove(): boolean {
    return this.state === 'ride'
  }

  save(): unknown {
    return this.state === 'done' ? 1 : 0
  }

  restore(s: unknown): void {
    if (s === 1) {
      this.state = 'done'
      this.place(this.length)
    } else {
      this.reset()
    }
  }

  dispose(): void {
    this.rail.root.removeFromParent()
    this.cart.root.removeFromParent()
  }
}
