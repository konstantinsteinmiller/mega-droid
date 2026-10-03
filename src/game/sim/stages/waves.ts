import { CELL, type WaveSpec } from '../../world/levelGen'
import { isSolidAt } from '../../world/nav'
import { sceneQuality } from '../../engine/quality'
import { createEnemy } from '../enemies'
import type { Enemy } from '../world'
import type { ClimbBody, ClimbHost } from '../climb'
import type { StageFeature } from '../stageFeatures'
import type { RailFeature, RailPoint } from './rail'

/**
 * ─── Waves of flyers on the rail (Rail Rush) ────────────────────────────────
 *
 * A `WaveSpec` with trigger 'rail' is a run of Rotor Drones that beam in
 * while the cart crosses its room: the first wave a beat after the cart
 * enters, then one every `every` s, `total` in all, `count` at a time (one
 * fewer on a low-end device). They come in AHEAD of the cart along the rail,
 * off to alternate sides at the cart's height (`floor` on the rail, a
 * `hover` band round it, a `leash` round where they came in), swoop at Flux
 * as he passes (the drone's own attack) and zap at him on a rhythm of their
 * own — slow, blockable shots. The cart outruns them: one left far enough
 * behind it goes quietly. After the ride nothing new comes, and whoever is
 * still flying stays.
 *
 * Each new ride (after a restart on the boarding platform) runs the waves
 * again from the first; a finished ride keeps them spent.
 */

/** A wave comes in this far (m) ahead of the cart along the rail, each
 *  drone of it a little further on, this far off the rail to either side. */
const AHEAD = 20
const SPREAD = 4
const SIDE = 4.2
/** The first wave: this long (s) after the cart enters the room. */
const FIRST = 1.2
/** Drones left this far behind the cart (m, along its heading) go. */
const BEHIND = 12
const GONE = 34
/** The zap: first after (s), then every (s); speed, share of the drone's
 *  damage, the height over Flux's feet it is aimed at (m). */
const ZAP_FIRST = 1.1
const ZAP_EVERY = 2.6
const ZAP_SPEED = 11
const ZAP_DMG = 0.6
const ZAP_AT = 1.2
const ZAP_NEAR = 4
const ZAP_FAR = 16

interface WaveRt {
  def: WaveSpec
  fired: number
  next: number
  started: boolean
}

export class WaveFeature implements StageFeature {
  private readonly host: ClimbHost
  private readonly rail: RailFeature | null
  private readonly waves: WaveRt[]
  /** The drones sent so far and each one's zap clock. */
  readonly flyers: Enemy[] = []
  private zap: number[] = []
  private ride = 0
  private readonly q: RailPoint = { x: 0, y: 0, z: 0, dx: 0, dz: 1, pitch: 0 }
  private readonly low: boolean

  constructor(host: ClimbHost, specs: WaveSpec[], rail: RailFeature | null) {
    this.host = host
    this.rail = rail
    this.waves = specs.filter(w => w.trigger === 'rail').map(def => ({ def, fired: 0, next: FIRST, started: false }))
    this.low = sceneQuality() === 'low'
  }

  /** Waves sent so far (all specs). */
  get sent(): number {
    let n = 0
    for (const w of this.waves) n += w.fired
    return n
  }

  update(dt: number, _time: number, p: ClimbBody, playing: boolean): void {
    const rail = this.rail
    if (!rail || !playing) return
    const riding = rail.state === 'ride'
    if (riding && rail.rides !== this.ride) {
      // A new ride: the waves run again from the first.
      this.ride = rail.rides
      for (const w of this.waves) { w.fired = 0; w.next = FIRST; w.started = false }
    }
    if (riding) {
      const map = this.host.map
      const i = Math.floor(rail.x / CELL)
      const j = Math.floor(rail.z / CELL)
      const room = i >= 0 && j >= 0 && i < map.w && j < map.h ? map.room[j * map.w + i]! : -1
      for (const w of this.waves) {
        if (w.def.room !== room || w.fired >= w.def.total) continue
        if (!w.started) { w.started = true; w.next = FIRST }
        w.next -= dt
        if (w.next > 0) continue
        w.next = w.def.every
        w.fired++
        this.send(w.def)
      }
    }
    this.tend(dt, p, riding)
  }

  /** One wave: `count` drones ahead of the cart, alternating sides. */
  private send(def: WaveSpec): void {
    const rail = this.rail!
    const host = this.host
    const map = host.map
    const q = this.q
    const count = this.low ? Math.max(1, def.count - 1) : def.count
    const r = map.rooms[def.room]
    let sent = 0
    for (let n = 0; n < count; n++) {
      // The furthest spot ahead still in the wave's room.
      let at = -1
      for (let ahead = AHEAD + n * SPREAD; ahead > 2; ahead -= 3) {
        rail.sample(rail.s + ahead, q)
        const i = Math.floor(q.x / CELL)
        const j = Math.floor(q.z / CELL)
        if (map.room[j * map.w + i] === def.room) { at = ahead; break }
      }
      if (at < 0) continue
      rail.sample(rail.s + at, q)
      const side = n % 2 ? SIDE : -SIDE
      let x = q.x - q.dz * side
      let z = q.z + q.dx * side
      if (isSolidAt(host.nav, x, z)) { x = q.x - q.dz * side * 0.4; z = q.z + q.dx * side * 0.4 }
      if (isSolidAt(host.nav, x, z)) { x = q.x; z = q.z }
      const e = createEnemy(def.kind, host.enemyLevel, x, z, def.room, { element: host.encounters.element })
      e.floor = q.y
      e.hover = [q.y - 4, q.y + 4]
      const x0 = r ? r.x0 * CELL + 0.75 : x - 10
      const z0 = r ? r.z0 * CELL + 0.75 : z - 10
      const x1 = r ? (r.x0 + r.w) * CELL - 0.75 : x + 10
      const z1 = r ? (r.z0 + r.h) * CELL - 0.75 : z + 10
      e.leash = [Math.max(x0, x - 10), Math.max(z0, z - 10), Math.min(x1, x + 10), Math.min(z1, z + 10)]
      // Awake and coming: facing the cart.
      e.awake = true
      e.state = 'alert'
      e.st = 0
      e.yaw = Math.atan2(rail.x - x, rail.z - z)
      host.addEnemy(e)
      this.flyers.push(e)
      this.zap.push(ZAP_FIRST + n * 0.35)
      host.fx.riseRing(x, q.y + 1.2, z, '#ffe13d', 0.8, 12)
      sent++
    }
    if (!sent) return
    host.sfx('alert', q.x, q.z)
  }

  /** Zaps on their own rhythm while the ride lasts; the ones left behind
   *  go quietly. */
  private tend(dt: number, p: ClimbBody, riding: boolean): void {
    const rail = this.rail!
    const host = this.host
    for (let n = 0; n < this.flyers.length; n++) {
      const e = this.flyers[n]!
      if (e.state === 'dead') continue
      if (riding) {
        const bx = e.x - rail.x
        const bz = e.z - rail.z
        const d = Math.hypot(bx, bz)
        if (d > GONE || (bx * rail.dirX + bz * rail.dirZ < -BEHIND && d > BEHIND)) {
          this.despawn(e)
          continue
        }
      }
      if (!riding || !host.fireEnemyShot) continue
      this.zap[n]! -= dt
      if (this.zap[n]! > 0) continue
      const dx = p.x - e.x
      const dz = p.z - e.z
      const hd = Math.hypot(dx, dz)
      if (e.state !== 'engage' || hd < ZAP_NEAR || hd > ZAP_FAR) { this.zap[n] = 0.3; continue }
      this.zap[n] = ZAP_EVERY
      host.fireEnemyShot(e, e.x, e.y, e.z, dx / hd, (ZAP_AT - e.y) / hd, dz / hd, ZAP_SPEED, Math.max(1, Math.round(e.dmg * ZAP_DMG)), true)
      host.sfx('enemyShot', e.x, e.z)
    }
  }

  /** Gone without a trace: no wreck, no bolts, no kill. */
  private despawn(e: Enemy): void {
    e.state = 'dead'
    e.hp = 0
    e.deathT = 10
    e.offstage = true
    e.root.visible = false
    e.shadow.visible = false
    e.ring.visible = false
  }

  /** A finished ride keeps its waves spent; otherwise they run again. */
  save(): unknown {
    return this.waves.map(w => w.fired)
  }

  restore(s: unknown): void {
    const done = this.rail?.state === 'done'
    this.waves.forEach((w, i) => {
      w.fired = done && Array.isArray(s) ? Math.min(w.def.total, Number(s[i]) || 0) : 0
      w.next = FIRST
      w.started = false
    })
  }
}
