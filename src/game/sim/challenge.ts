import type { MeshBasicMaterial } from 'three'
import type { Enemy } from './world'
import type { MapData } from '../world/levelGen'
import type { Rarity } from '../data/items'
import type { AtlasLine } from './atlas'
import { CELL } from '../world/levelGen'
import { hud } from '../state/hud'
import { startMiniBoss, MINI_SHATTER_AT } from './miniBosses'
import { challengeBolts, challengeItemLevel, rollChallengeRarity } from '../data/challenge'

/**
 * ─── A challenge room: the door, the fight, the prize ────────────────────────
 *
 * An optional side room (`MapData.challenge`) behind the challenge door
 * (`buildDoor`'s challenge livery), its mini-boss waiting offstage inside
 * (`sim/miniBosses.ts`). The door opens on approach like any door. Then:
 *
 *  1. Near the door the first time, Atlas points it out (`atlas.challenge`).
 *  2. Flux steps into the room (past the doorway): the door slams shut and
 *     holds; the name card comes up in the challenge style (the CHALLENGE
 *     label over the mini-boss's name), the challenge sting plays, the bar
 *     fills, and the mini-boss makes its entrance.
 *  3. It falls: the prize (`ChallengeReward`, `data/challenge.ts`) — a
 *     Repair Gel, the bolts, an item — and, once its death throes are over,
 *     the door opens again for good.
 *
 * A resume restores the mini-boss dead when it was beaten (the snapshot's
 * `killed`): then the room is done and pays nothing twice. Pure of three.js
 * values; the mission is its host.
 */

/** Flux must be this far past the doorway before it shuts (m): never on him. */
export const SHUT_PAST = 1.6
/** Atlas names the door from this close (m). */
const SAY_AT = 8
/** The bar fills over this (s), as a Core Master's does in its entrance. */
const BAR_FILL = 1.6
/** The bar stays up this long after the kill (s). */
const BAR_LINGER = 1.6

export interface ChallengeReward {
  /** A Repair Gel, past the cap. */
  gel: true
  /** Bolts, Flux's bolt bonus applied. */
  bolts: number
  /** The item's rarity and item level. */
  rarity: Rarity
  ilvl: number
}

export interface ChallengeHost {
  readonly map: MapData
  readonly player: { x: number; z: number }
  shutDoor(id: number): void
  releaseDoor(id: number): void
  say(line: AtlasLine): void
  /** The fight's music on (the boss track) or back to the sector's. */
  music(fight: boolean): void
  sfx(name: string, x?: number, z?: number): void
  /** Pay the prize out where the mini-boss fell. */
  reward(r: ChallengeReward, x: number, z: number): void
}

export type ChallengeState = 'waiting' | 'fight' | 'won'

export class ChallengeRun {
  state: ChallengeState = 'waiting'
  /** The prize paid (once a run). */
  paid: ChallengeReward | null = null
  private said = false
  private barT = 0
  private wonT = 0
  private reopened = false
  private readonly room: number
  private readonly door: number
  private readonly doorX: number
  private readonly doorZ: number

  constructor(
    private readonly h: ChallengeHost,
    readonly foe: Enemy,
    /** What the prize is worth: the run's level, the Core Masters beaten,
     *  Flux's bolt bonus; and the item's roll. */
    private readonly pay: { level: number; masters: number; boltMul: number; rng: () => number },
    /** The door's beacons, pulsed while the mini-boss stands. */
    private readonly beacon: MeshBasicMaterial | null = null
  ) {
    const c = h.map.challenge!
    this.room = c.room
    this.door = c.door
    const d = h.map.doors[c.door]!
    this.doorX = (d.i + 0.5) * CELL
    this.doorZ = (d.j + 0.5) * CELL
  }

  /** Flux stands in the challenge room, past its doorway. */
  inside(): boolean {
    const p = this.h.player
    const m = this.h.map
    const i = Math.floor(p.x / CELL)
    const j = Math.floor(p.z / CELL)
    if (i < 0 || j < 0 || i >= m.w || j >= m.h) return false
    return m.room[j * m.w + i] === this.room && Math.hypot(p.x - this.doorX, p.z - this.doorZ) > SHUT_PAST
  }

  /** One tick (`playing`: the mission is in play, no modal up). */
  update(dt: number, time: number, playing: boolean): void {
    const p = this.h.player
    if (this.beacon) {
      const live = this.state !== 'won'
      const k = live ? 0.75 + 0.5 * (0.5 + 0.5 * Math.sin(time * (this.state === 'fight' ? 9 : 3.2))) : 0.35
      this.beacon.color.setRGB(k, k * 0.72, k * 0.26)
    }
    if (this.state === 'waiting') {
      // Beaten before a resume (the snapshot restored it dead): done, its
      // door a plain door again, nothing paid twice.
      if (this.foe.state === 'dead') {
        this.state = 'won'
        this.reopened = true
        this.wonT = 99
        return
      }
      if (!playing) return
      if (!this.said && Math.hypot(p.x - this.doorX, p.z - this.doorZ) < SAY_AT) {
        this.said = true
        this.h.say('challenge')
      }
      if (this.inside()) this.start()
      return
    }
    if (this.state === 'fight') {
      const e = this.foe
      this.barT += dt
      hud.bossHp01 = e.state === 'dead' ? 0 : Math.min(this.barT / BAR_FILL, e.hp / e.maxHp)
      if (e.state === 'dead') this.win()
      return
    }
    // Won: the bar goes, then the door opens once the death throes are over.
    this.wonT += dt
    if (this.wonT > BAR_LINGER && hud.bossStyle === 'challenge') {
      hud.bossName = ''
      hud.bossStyle = ''
    }
    if (!this.reopened && this.foe.deathT >= MINI_SHATTER_AT) {
      this.reopened = true
      this.h.releaseDoor(this.door)
      this.h.music(false)
    }
  }

  /** Shut in: the door slams, the card, the sting, the entrance. */
  start(): void {
    if (this.state !== 'waiting' || this.foe.state === 'dead') return
    this.state = 'fight'
    this.barT = 0
    this.h.shutDoor(this.door)
    startMiniBoss(this.foe)
    hud.bossName = this.foe.nameKey
    hud.bossStyle = 'challenge'
    hud.bossMarks = []
    hud.bossHp01 = 0
    hud.titleKey = this.foe.nameKey
    hud.titleSub = ''
    hud.titleStyle = 'challenge'
    hud.titleShownAt = performance.now()
    this.h.sfx('challenge')
    this.h.music(true)
  }

  private win(): void {
    this.state = 'won'
    this.wonT = 0
    const { level, masters, boltMul, rng } = this.pay
    const r: ChallengeReward = {
      gel: true,
      bolts: Math.round(challengeBolts(masters) * boltMul),
      rarity: rollChallengeRarity(rng, masters),
      ilvl: challengeItemLevel(level, masters)
    }
    this.paid = r
    this.h.reward(r, this.foe.x, this.foe.z)
  }
}
