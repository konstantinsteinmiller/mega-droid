import { Color } from 'three'
import { CELL, type RailSpec } from '../../world/levelGen'
import { groundAt, type Plat } from '../../world/nav'
import { buildRail, buildCart, buildMineCart, buildQuadcopter, QUAD_SKID, type CartMesh, type RailMesh } from '../../models/stageProps/rail'
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
/** The quadcopter stands on its skids: its deck this far over the course
 *  (the floor of its slot), all the way, so it lands on them as well. A
 *  step up to board (under STEP_UP): its deck is a platform (`nav.plats`)
 *  while it rests. */
export const REST_LIFT = QUAD_SKID
/** The deck's half footprint (m): across and along its heading. */
const DECK_HW = 1.25
const DECK_HL = 1.3
/** Where the deck's platform waits while it flies (m): out of the level. */
const PARK = -1e4
/** The quadcopter flies its course with rounded corners: each corner is a
 *  curve this wide (m), cut short to under half of either leg, drawn as
 *  this many short chords (a cart's track keeps its sharp corners). */
const ROUND_R = 4.2
const ROUND_LEG = 0.45
const ROUND_STEPS = 16
/** It eases into a turn: sideways pull (m/s²) and turn rate (rad/s) it
 *  never goes over, braking ahead of the corner as it would before a stop. */
const TURN_PULL = 7
export const TURN_RATE = 1.6
/** Its heading and slope are read over this stretch of the course (m), so
 *  they turn through a corner instead of stepping chord by chord. */
const LOOK = 0.9
/** The bank into a turn: as a quadcopter tilts into its pull, at most this
 *  much (rad), eased in and out at this rate (1/s). */
export const BANK_MAX = 0.32
const BANK_EASE = 5
const G = 9.8

type P3 = { x: number; y: number; z: number }

/**
 * The flight's course: the polyline with each corner replaced by a
 * quadratic curve from a point on the leg before it, through the corner's
 * pull, to a point on the leg after it. Start and end stay where they are;
 * the curve lies inside the corner, never out past the polyline.
 */
export function roundCourse(P: ReadonlyArray<P3>): P3[] {
  if (P.length < 3) return P.map(p => ({ x: p.x, y: p.y, z: p.z }))
  const out: P3[] = [{ x: P[0]!.x, y: P[0]!.y, z: P[0]!.z }]
  for (let n = 1; n < P.length - 1; n++) {
    const a = P[n - 1]!
    const c = P[n]!
    const e = P[n + 1]!
    const la = Math.hypot(c.x - a.x, c.y - a.y, c.z - a.z)
    const le = Math.hypot(e.x - c.x, e.y - c.y, e.z - c.z)
    const ha = Math.hypot(c.x - a.x, c.z - a.z) || 1
    const he = Math.hypot(e.x - c.x, e.z - c.z) || 1
    const dot = ((c.x - a.x) * (e.x - c.x) + (c.z - a.z) * (e.z - c.z)) / (ha * he)
    const turn = Math.acos(Math.max(-1, Math.min(1, dot)))
    if (turn < 1e-3 || la < 1e-6 || le < 1e-6) {
      out.push({ x: c.x, y: c.y, z: c.z })
      continue
    }
    const cut = Math.min(ROUND_R * Math.tan(turn / 2), ROUND_LEG * la, ROUND_LEG * le)
    const ka = 1 - cut / la
    const ke = cut / le
    const b0 = { x: a.x + (c.x - a.x) * ka, y: a.y + (c.y - a.y) * ka, z: a.z + (c.z - a.z) * ka }
    const b2 = { x: c.x + (e.x - c.x) * ke, y: c.y + (e.y - c.y) * ke, z: c.z + (e.z - c.z) * ke }
    for (let k = 0; k <= ROUND_STEPS; k++) {
      const t = k / ROUND_STEPS
      const m0 = (1 - t) * (1 - t)
      const m1 = 2 * t * (1 - t)
      const m2 = t * t
      out.push({ x: m0 * b0.x + m1 * c.x + m2 * b2.x, y: m0 * b0.y + m1 * c.y + m2 * b2.y, z: m0 * b0.z + m1 * c.z + m2 * b2.z })
    }
  }
  const z = P[P.length - 1]!
  out.push({ x: z.x, y: z.y, z: z.z })
  return out
}

const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a))

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
  /** The course flown: the rail's points, or (the quadcopter) its rounded
   *  course. */
  readonly points: ReadonlyArray<P3>
  /** Per point: the signed turn there (rad/m, left positive; 0 on a cart),
   *  and the fastest it may pass it (m/s), braking ahead of every turn. */
  private readonly bend: Float32Array
  private readonly vmax: Float32Array
  /** The quadcopter's bank now (rad, into the turn). */
  bank = 0
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
  /** The rooms the track runs over: it is drawn while one of them is. */
  private readonly over: number[]
  /** The quadcopter's deck over its course (REST_LIFT; 0 for a cart), and
   *  its deck as a platform to step onto while it rests (none for a cart). */
  private lift = 0
  private deck: Plat | null = null

  constructor(host: ClimbHost, def: RailSpec) {
    this.host = host
    this.def = def
    const P = host.theme.id === 'rotor' ? roundCourse(def.points) : def.points
    this.points = P
    this.cum = new Float32Array(P.length)
    for (let n = 1; n < P.length; n++) {
      const a = P[n - 1]!
      const c = P[n]!
      this.cum[n] = this.cum[n - 1]! + Math.hypot(c.x - a.x, c.y - a.y, c.z - a.z)
    }
    this.length = this.cum[P.length - 1] ?? 0
    // The turn at each point, and from it a speed profile: under the pull
    // and the turn rate in the turn, braking back from every one of them.
    this.bend = new Float32Array(P.length)
    this.vmax = new Float32Array(P.length).fill(def.speed)
    if (host.theme.id === 'rotor') {
      const yaw = (n: number) => Math.atan2(-(P[n + 1]!.x - P[n]!.x), -(P[n + 1]!.z - P[n]!.z))
      for (let n = 1; n < P.length - 1; n++) {
        const ds = (this.cum[n + 1]! - this.cum[n - 1]!) / 2
        const k = ds > 1e-6 ? wrap(yaw(n) - yaw(n - 1)) / ds : 0
        this.bend[n] = k
        const ak = Math.abs(k)
        if (ak > 1e-4) this.vmax[n] = Math.min(def.speed, Math.sqrt(TURN_PULL / ak), TURN_RATE / ak)
      }
      for (let n = P.length - 2; n >= 0; n--) {
        const ds = this.cum[n + 1]! - this.cum[n]!
        this.vmax[n] = Math.min(this.vmax[n]!, Math.sqrt(this.vmax[n + 1]! ** 2 + 2 * BRAKE * ds))
      }
    }
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
    if (this.air && host.nav.plats) {
      this.lift = REST_LIFT
      this.deck = { x0: 0, z0: 0, x1: 0, z1: 0, top: -Infinity, dx: 0, dz: 0 }
      host.nav.plats.push(this.deck)
    }
    const over = new Set<number>()
    for (let n = 1; n < P.length; n++) {
      const a = P[n - 1]!
      const c = P[n]!
      const steps = Math.ceil(Math.hypot(c.x - a.x, c.z - a.z) / (CELL / 2))
      for (let k = 0; k <= steps; k++) {
        const o = this.ownerAt(a.x + (c.x - a.x) * k / steps, a.z + (c.z - a.z) * k / steps)
        if (o >= 0) over.add(o)
      }
    }
    this.over = [...over]
    this.place(0)
  }

  private ownerAt(x: number, z: number): number {
    const map = this.host.map
    const i = Math.floor(x / CELL)
    const j = Math.floor(z / CELL)
    return i >= 0 && j >= 0 && i < map.w && j < map.h ? this.host.level.owner[j * map.w + i] ?? -1 : -1
  }

  /** Track and cart stand at the scene root (the track runs through several
   *  rooms, the cart rides from one to the next): each shows only while a
   *  room it is in does. */
  cull(vis: Uint8Array): void {
    this.rail.root.visible = !this.air && this.over.some(r => vis[r] === 1)
    const o = this.ownerAt(this.x, this.z)
    this.cart.root.visible = o < 0 || vis[o] === 1
  }

  /**
   * The point `s` m along the rail (clamped) into `out`: the cart's floor
   * there, its level heading and its slope. A binary search, no state (the
   * waves ask it for the rail ahead).
   */
  sample(s: number, out: RailPoint): void {
    const P = this.points
    s = Math.max(0, Math.min(this.length, s))
    const lo = this.seg(s)
    this.lerp(lo, s, out)
    if (this.air && this.length > 2 * LOOK) {
      // The heading and slope over a short stretch: they turn smoothly
      // through a rounded corner rather than stepping at each chord.
      const s0 = Math.max(0, Math.min(this.length - 2 * LOOK, s - LOOK))
      const o = this.scratch
      this.lerp(this.seg(s0), s0, o)
      const ax = o.x
      const ay = o.y
      const az = o.z
      this.lerp(this.seg(s0 + 2 * LOOK), s0 + 2 * LOOK, o)
      const hx = o.x - ax
      const hz = o.z - az
      const h = Math.hypot(hx, hz)
      if (h > 1e-6) {
        out.dx = hx / h
        out.dz = hz / h
        out.pitch = Math.atan2(o.y - ay, h)
      }
      return
    }
    const n1 = Math.min(P.length - 1, lo + 1)
    const a = P[lo]!
    const c = P[n1]!
    const hx = c.x - a.x
    const hz = c.z - a.z
    const h = Math.hypot(hx, hz)
    if (h > 1e-6) {
      out.dx = hx / h
      out.dz = hz / h
      out.pitch = Math.atan2(c.y - a.y, h)
    }
  }

  private readonly scratch: RailPoint = { x: 0, y: 0, z: 0, dx: 0, dz: 1, pitch: 0 }

  /** The point index the stretch of course holding `s` starts at. */
  private seg(s: number): number {
    const cum = this.cum
    let lo = 0
    let hi = Math.max(0, this.points.length - 2)
    while (lo < hi) {
      const m = (lo + hi + 1) >> 1
      if (cum[m]! <= s) lo = m
      else hi = m - 1
    }
    return lo
  }

  /** The position `s` m along the course, on the stretch from point `lo`. */
  private lerp(lo: number, s: number, out: RailPoint): void {
    const P = this.points
    const cum = this.cum
    const last = P.length - 1
    const n1 = Math.min(last, lo + 1)
    const a = P[lo]!
    const c = P[n1]!
    const span = cum[n1]! - cum[lo]!
    const k = span > 1e-6 ? (s - cum[lo]!) / span : 0
    out.x = a.x + (c.x - a.x) * k
    out.y = a.y + (c.y - a.y) * k
    out.z = a.z + (c.z - a.z) * k
  }

  /** Between the two points round `s`: their share of it (0..1). */
  private along(s: number): [number, number, number] {
    const n = this.seg(Math.max(0, Math.min(this.length, s)))
    const n1 = Math.min(this.points.length - 1, n + 1)
    const span = this.cum[n1]! - this.cum[n]!
    return [n, n1, span > 1e-6 ? Math.max(0, Math.min(1, (s - this.cum[n]!) / span)) : 0]
  }

  /** The fastest the quadcopter may fly at `s` (m/s): its speed profile
   *  (the rail's own speed on a cart). */
  maxSpeedAt(s: number): number {
    const [n, n1, k] = this.along(s)
    return this.vmax[n]! + (this.vmax[n1]! - this.vmax[n]!) * k
  }

  /** The signed turn at `s` (rad/m, left positive). */
  private bendAt(s: number): number {
    const [n, n1, k] = this.along(s)
    return this.bend[n]! + (this.bend[n1]! - this.bend[n]!) * k
  }

  /** The cart at `s` along the rail: position, heading, and the mesh. */
  private place(s: number): void {
    const q = this.at
    this.sample(s, q)
    this.s = Math.max(0, Math.min(this.length, s))
    this.x = q.x
    this.y = q.y + this.lift
    this.z = q.z
    this.dirX = q.dx
    this.dirZ = q.dz
    const root = this.cart.root
    root.position.set(q.x, this.y, q.z)
    // At rest its deck is a step to stand on; in flight Flux is carried.
    const d = this.deck
    if (d) {
      const along = Math.abs(q.dz) >= Math.abs(q.dx)
      const hx = along ? DECK_HW : DECK_HL
      const hz = along ? DECK_HL : DECK_HW
      const away = this.state === 'ride'
      d.x0 = away ? PARK : q.x - hx
      d.x1 = away ? PARK : q.x + hx
      d.z0 = away ? PARK : q.z - hz
      d.z1 = away ? PARK : q.z + hz
      d.top = away ? PARK : this.y
    }
    root.rotation.order = 'YXZ'
    root.rotation.y = Math.atan2(-q.dx, -q.dz)
    root.rotation.x = q.pitch
    root.rotation.z = this.bank
  }

  /** The quadcopter tilts into its turn as its pull asks (v²·turn / g),
   *  eased, and levels out on the straights and at rest. */
  private tilt(dt: number): void {
    if (!this.air) return
    const want = Math.max(-BANK_MAX, Math.min(BANK_MAX, Math.atan(this.v * this.v * this.bendAt(this.s) / G)))
    this.bank += (want - this.bank) * Math.min(1, BANK_EASE * dt)
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
    this.bank = 0
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
      const cap = Math.max(CRAWL, Math.min(Math.sqrt(2 * BRAKE * rem), this.maxSpeedAt(this.s)))
      this.v = Math.min(this.def.speed, cap, this.v + ACCEL * dt)
      this.tilt(dt)
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
    this.bank = 0
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
