import type { SkyShootSpec } from '../world/levelGen'
import type { Enemy, PickupKind } from './world'
import type { PlayerStats } from './stats'
import { createEnemy } from './enemies'
import { TRAINING_DRONE } from '../models/props'
import { hud, pushHud } from '../state/hud'

/**
 * ─── The sky shoot (#178) ────────────────────────────────────────────────────
 *
 * An air-shooting puzzle over a stage's room (the Blaze stage's roof, the
 * first room past the beam-in): eight blue drones circle high over it. They
 * are targets, not machines — they never wake, never shoot, fly only the
 * ring — and they are built for the charge shot: a well-timed half charge
 * brings one down, a full charge is overkill and costs time, a quick shot
 * does a third of its damage (`SKY_PELLET`, about six to a drone).
 *
 * The first drone down starts the clock, on screen. All eight before it runs
 * out pays a bonus (bolts, XP, a big repair capsule), once. Too slow: the
 * survivors fly off, the clock goes, and a fresh ring of eight comes down
 * for another go. The drones pay nothing on their own, so a failed round is
 * never a farm.
 *
 * The flight is a pure function of the clock (`slot`), so a test can check
 * the ring stays in the room and in reach of the crosshair.
 */

/** Drones in the ring. */
export const SKY_DRONES = 8
/** Seconds on the clock once the first drone is down: the other seven at a
 *  steady half charge each take about 10 s; there is room to miss a few. */
export const SKY_TIME = 18
/** Their height over the floor (m), the two tiers, and the bob on top: about
 *  the walls' tops, and never past the view's tilt from under the ring. */
export const SKY_LOW = 3.3
export const SKY_HIGH = 3.9
const BOB = 0.22
/** The ring's turn (rad/s), a little quicker once the clock runs. */
const SPIN = 0.22
const SPIN_RUN = 0.32
/** A fresh ring drops in from this far up, over this long (s). */
const DROP = 6.5
const DROP_T = 1.4
/** After a failed round: the survivors leave over this long, then the next ring comes. */
const LEAVE_T = 1.3
/** A half charge's damage multiplier (`Mission.fireCharged`, level 1). */
const HALF_CHARGE = 2.2

export type SkyState = 'ready' | 'run' | 'leave' | 'won'

export interface SkyHost {
  readonly player: { x: number; z: number }
  readonly level: number
  stats(): PlayerStats
  addEnemy(e: Enemy): void
  fx: {
    riseRing(x: number, y: number, z: number, color: string, r?: number, n?: number): void
    flash(x: number, y: number, z: number, color: string, size?: number, life?: number): void
    sparks(x: number, y: number, z: number, color: string, n?: number, speed?: number, size?: number): void
  }
  sfx(name: string, x?: number, z?: number): void
  spawnPickup(kind: PickupKind, value: number, x: number, y: number, z: number): void
  /** The round's bonus XP. */
  reward(xp: number): void
}

/** A drone's place in the ring at ring angle `base` and time `t`: x, z and
 *  its height over the floor. */
export const slot = (spec: SkyShootSpec, k: number, base: number, t: number): [number, number, number] => {
  const a = base + (k / SKY_DRONES) * Math.PI * 2
  const r = spec.r + 0.35 * Math.sin(t * 0.9 + k * 1.3)
  const y = (k % 2 === 0 ? SKY_LOW : SKY_HIGH) + BOB * Math.sin(t * 1.7 + k * 0.8)
  return [spec.x + Math.cos(a) * r, spec.z + Math.sin(a) * r, y]
}

/** A drone's health: one half charge (not a crit) takes it, never less. */
export const skyHp = (s: Pick<PlayerStats, 'busterDmg' | 'chargeDmgMul'>, armor: number): number =>
  Math.max(1, Math.floor(Math.round(s.busterDmg * HALF_CHARGE * s.chargeDmgMul) * armor * 0.95))

/** The round's bonus: bolts and XP by the stage's level. */
export const skyBonus = (level: number): { bolts: number; xp: number } => ({ bolts: 60 + level * 14, xp: 40 + level * 12 })

export class SkyShoot {
  state: SkyState = 'ready'
  /** Seconds left on the clock (while it runs). */
  clock = 0
  /** The ring now in the air. */
  drones: Enemy[] = []
  private t = 0
  private base = 0
  private stateT = 0
  private spawned = false
  private lastTick = -1

  constructor(private readonly host: SkyHost, readonly spec: SkyShootSpec) {}

  /** Won on an earlier visit to this run (a resume): no ring. */
  get won(): boolean {
    return this.state === 'won'
  }

  markWon(): void {
    this.state = 'won'
    this.clear()
    this.writeHud()
  }

  /** Drones left in the ring. */
  get left(): number {
    return this.drones.filter(d => d.state !== 'dead').length
  }

  private spawnRing(): void {
    const h = this.host
    const s = h.stats()
    this.drones = []
    for (let k = 0; k < SKY_DRONES; k++) {
      const [x, z, y] = slot(this.spec, k, this.base, this.t)
      const e = createEnemy('heli', h.level, x, z, this.spec.room, { colors: TRAINING_DRONE })
      e.sky = true
      e.hold = true
      e.floor = this.spec.y
      e.y = e.py = y + DROP
      this.drones.push(e)
      h.addEnemy(e)
      // After it joins the cast: the mission's toughening (progress, run and
      // stage multipliers, New Game+) must not touch it. A ring tougher than
      // one half charge could not be cleared in the time, so the round only
      // ever failed and paid nothing (#199).
      e.hp = e.maxHp = skyHp(s, e.def.armor)
    }
    this.stateT = 0
    this.spawned = true
    h.sfx('beamIn', this.spec.x, this.spec.z)
  }

  /** Every sim step. `playing`: the clock only runs while play does. */
  update(dt: number, playing: boolean): void {
    if (this.state === 'won') return
    if (!this.spawned) this.spawnRing()
    this.t += dt
    this.stateT += dt
    this.base += dt * (this.state === 'run' ? SPIN_RUN : SPIN)
    const h = this.host
    const p = h.player
    for (let k = 0; k < this.drones.length; k++) {
      const e = this.drones[k]!
      if (e.state === 'dead') continue
      let [x, z, y] = slot(this.spec, k, this.base, this.t)
      // A fresh ring drops in from the sky; a leaving one climbs away.
      if (this.state === 'leave') y += (this.stateT / LEAVE_T) ** 2 * DROP * 1.5
      else if (this.stateT < DROP_T && this.state === 'ready') y += DROP * (1 - this.stateT / DROP_T) ** 2
      e.x = x
      e.z = z
      e.y = y
      e.yaw = Math.atan2(p.x - x, p.z - z)
    }
    if (this.state === 'run' && playing) {
      this.clock = Math.max(0, this.clock - dt)
      // The last five seconds tick.
      const s = Math.ceil(this.clock)
      if (s <= 5 && s !== this.lastTick && this.clock > 0) {
        this.lastTick = s
        h.sfx('uiClick')
      }
      if (this.clock <= 0) this.fail()
    } else if (this.state === 'leave' && this.stateT >= LEAVE_T) {
      this.clear()
      this.state = 'ready'
      this.spawnRing()
    }
    this.writeHud()
  }

  /** A machine went down: one of the ring's? */
  onKilled(e: Enemy): void {
    if (!e.sky || !this.drones.includes(e) || this.state === 'won' || this.state === 'leave') return
    const h = this.host
    if (this.state === 'ready') {
      this.state = 'run'
      this.clock = SKY_TIME
      this.lastTick = -1
      h.sfx('alert')
    }
    if (this.left === 0) this.win(e)
  }

  private fail(): void {
    this.state = 'leave'
    this.stateT = 0
    this.clock = 0
    this.host.sfx('denied')
    pushHud({ t: 'toast', key: 'mission.skyFail', color: '#7fd6ff' })
  }

  private win(last: Enemy): void {
    const h = this.host
    this.state = 'won'
    this.clock = 0
    const { bolts, xp } = skyBonus(h.level)
    const y = this.spec.y + 2.5
    let n = bolts
    const chunks = 8
    for (let k = 0; k < chunks; k++) {
      const v = Math.max(1, Math.round(n / (chunks - k)))
      n -= v
      h.spawnPickup('bolt', v, last.x, y, last.z)
    }
    h.spawnPickup('hpBig', 0, last.x, y, last.z)
    h.reward(xp)
    h.fx.riseRing(this.spec.x, this.spec.y + 0.2, this.spec.z, '#ffd84a', this.spec.r, 40)
    h.sfx('objective')
    pushHud({ t: 'toast', key: 'mission.skyClear', params: { n: bolts }, color: '#ffd84a' })
    // The clock goes with the last drone (the update stops once it is won).
    this.writeHud()
  }

  /** Every drone still up leaves quietly (no kill, no reward). */
  private clear(): void {
    for (const e of this.drones) {
      if (e.state === 'dead') continue
      this.host.fx.flash(e.x, this.spec.y + e.y, e.z, '#7fd6ff', 1, 0.15)
      e.state = 'dead'
      e.hp = 0
      e.deathT = 10
      e.root.visible = false
      e.shadow.visible = false
    }
  }

  private writeHud(): void {
    const t = this.state === 'run' ? Math.ceil(this.clock * 10) / 10 : -1
    if (hud.skyT !== t) hud.skyT = t
    const left = this.state === 'run' ? this.left : 0
    if (hud.skyLeft !== left) hud.skyLeft = left
    if (hud.skyN !== SKY_DRONES) hud.skyN = SKY_DRONES
  }
}
