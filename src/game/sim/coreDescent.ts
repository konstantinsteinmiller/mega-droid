import type { Room } from '../world/levelGen'
import { CELL } from '../world/levelGen'
import { pushHud } from '../state/hud'
import type { AtlasLine } from './atlas'
import type { Enemy } from './world'
import { startBossIntro } from './bosses'
import { Drops, type DropHost } from './drops'

/**
 * ─── The Core Descent (#109) ─────────────────────────────────────────────────
 *
 * Dr. Vex is fought in three stages (`Terrain.bossStages`):
 *
 *   1. the Spire's ROOF, under a lightning storm — a strike every STRIKE_EVERY
 *      s on a ring near Flux (STRIKE_COST, not blockable), the sky flashing;
 *   2. at STAGE_AT[0] of his health the roof gives way and the fight falls
 *      into the REACTOR HALL, its fire, shock and gusts cycling round them;
 *   3. at STAGE_AT[1] the floor goes again: the CORE RING, a narrow walkway
 *      round the molten Core, Vex hovering over it and quicker (RING_TEMPO).
 *
 * A stage change is a short fall scene (FALL_S): the floor rumbles, the
 * screen goes black, Flux and Vex land in the next room, Vex makes his
 * entrance again, and the Fortress keeps a retry point right there. The
 * rooms have no doors: only the falls carry Flux between them. Vex is
 * untouchable while it plays (his entrance state).
 */

export const STAGE_AT = [0.65, 0.3] as const
export const FALL_S = 1.6
/** When in the fall the screen is fully black and the jump happens (s). */
const JUMP_AT = 0.8
const BLACK_FROM = 0.4
const BLACK_TO = 1.2
export const STRIKE_EVERY = 3.2
export const STRIKE_COST = 0.08
/** The storm's gloom on the roof (0..1 of a blackout). */
const ROOF_GLOOM = 0.35
/** Vex's tempo on the ring (lower: quicker between attacks). */
export const RING_TEMPO = 0.8
/** Landed on the ring, the view starts tilted down onto the Core (rad):
 *  its rings, the walkway round it and the far side in one frame, before
 *  Vex comes down over it (a view tilted up at him read as a flat disc). */
export const RING_LOOK = -0.3

export interface DescentHost extends DropHost {
  player: { x: number; y: number; z: number; px: number; pz: number; py: number; safeY: number; yaw: number; pitch?: number; vx: number; vz: number; vy: number }
  rooms: Room[]
  setBossRoom(r: Room): void
  keepRetryPoint(): void
  stageDark?(dark01: number): void
  skyFlash?(amount: number): void
  say(line: AtlasLine): void
}

export class CoreDescent {
  /** The stage the fight is in (0 roof, 1 hall, 2 ring). */
  stage = 0
  /** Time into a fall scene, or −1. */
  private fallT = -1
  private strikeT = STRIKE_EVERY * 0.6
  private readonly drops: Drops
  private said = false

  constructor(private readonly host: DescentHost, readonly rooms: number[]) {
    this.drops = new Drops(host)
  }

  get falling(): boolean { return this.fallT >= 0 }

  /** One step of the fight. `live`: Vex is up and the fight is on. */
  update(dt: number, boss: Enemy, live: boolean, playing: boolean): void {
    const h = this.host
    this.drops.update(dt, h.player, playing)
    if (this.fallT >= 0) {
      this.stepFall(dt, boss)
      return
    }
    if (!live) return
    if (this.stage === 0) this.storm(dt)
    const next = STAGE_AT[this.stage]
    if (next !== undefined && boss.state !== 'dead' && boss.hp <= boss.maxHp * next) this.startFall(boss)
  }

  /** The roof's storm: gloom, and a strike near Flux on a ring. */
  private storm(dt: number): void {
    const h = this.host
    h.stageDark?.(ROOF_GLOOM)
    if (!this.said) {
      this.said = true
      h.say('hint.vex.roof')
    }
    this.strikeT -= dt
    if (this.strikeT > 0) return
    this.strikeT = STRIKE_EVERY
    const p = h.player
    const a = Math.random() * Math.PI * 2
    const d = Math.random() * 1.2
    this.drops.drop({
      x: p.x + Math.cos(a) * d, z: p.z + Math.sin(a) * d, y: p.y,
      warn: 1.2, fall: 0.08, height: 0, reach: 1.1, cost: STRIKE_COST,
      sound: 'bossWarn', hazard: 'volt', color: '#d8e6ff',
      onLand: () => { h.skyFlash?.(0.9); h.sfx('thunder') }
    })
  }

  private startFall(boss: Enemy): void {
    this.fallT = 0
    this.drops.clear()
    // Untouchable while the floor goes (his entrance state).
    boss.state = 'idle'
    boss.st = 0
    this.host.sfx('explode', boss.x, boss.z)
    this.host.shake(0.6)
    this.host.say(this.stage === 0 ? 'hint.vex.fall' : 'hint.vex.core')
  }

  private stepFall(dt: number, boss: Enemy): void {
    const h = this.host
    const before = this.fallT
    this.fallT += dt
    if (this.fallT < JUMP_AT) h.shake(0.25)
    // To black and back, through the screen's flash layer.
    if (this.fallT >= BLACK_FROM && this.fallT <= BLACK_TO) {
      const k = this.fallT < JUMP_AT ? (this.fallT - BLACK_FROM) / (JUMP_AT - BLACK_FROM) : 1 - (this.fallT - JUMP_AT) / (BLACK_TO - JUMP_AT)
      pushHud({ t: 'flash', color: '#000000', strength: Math.min(1, 0.4 + k) })
    }
    if (before < JUMP_AT && this.fallT >= JUMP_AT) this.land(boss, this.stage + 1)
    if (this.fallT >= FALL_S) {
      this.fallT = -1
      // His entrance again, in the new room; and a retry point here.
      startBossIntro(boss)
      h.keepRetryPoint()
    }
  }

  /** Put Flux and Vex in stage `n`'s room: Flux at its south side facing
   *  north, Vex at the far side (over the Core on the ring). */
  land(boss: Enemy, n: number): void {
    const h = this.host
    const r = h.rooms[this.rooms[n]!]
    if (!r) return
    this.stage = n
    h.setBossRoom(r)
    const cx = (r.x0 + r.w / 2) * CELL
    const p = h.player
    p.x = p.px = cx
    p.z = p.pz = (r.z0 + r.h - 1.5) * CELL
    p.y = p.py = p.safeY = 0
    p.vx = p.vz = p.vy = 0
    p.yaw = 0
    p.pitch = n === 2 ? RING_LOOK : 0
    boss.x = boss.px = cx
    boss.z = boss.pz = n === 2 ? (r.z0 + r.h / 2) * CELL : (r.z0 + 1.6) * CELL
    if (n === 2) boss.tempo = (boss.tempo ?? 1) * RING_TEMPO
    h.sfx('deckLand')
  }

  /** A retry / reload into stage `n` (Vex's health as it was there). */
  restore(boss: Enemy, n: number, hp: number): void {
    if (n <= 0) return
    this.land(boss, n)
    boss.hp = Math.max(1, Math.min(boss.maxHp, hp))
    if (n >= 1) boss.phase2 = boss.hp < boss.maxHp * 0.5
  }
}
