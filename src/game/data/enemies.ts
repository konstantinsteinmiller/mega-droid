import type { EnemyKind } from '../models/enemies'

/**
 * ─── Enemy stat sheets ───────────────────────────────────────────────────────
 *
 * Numbers are level-1 values; `scaleHp` / `scaleDmg` grow them with the enemy
 * level. The player's buster starts at 10 damage per pellet, 100 HP, so a
 * hardhat takes three pellets (or one full charge) and one pellet costs the
 * player a tenth of the bar — the classic rhythm.
 *
 * `tele` is the telegraph length (ring shrink time). Every attack is readable
 * a beat ahead: orange rings can be blocked (and parried in the last 0.28 s),
 * red rings cannot — slide or step out.
 */

export type Element = 'none' | 'fire' | 'ice' | 'volt' | 'wind'

export interface EnemyDef {
  kind: EnemyKind
  hp: number
  dmg: number
  speed: number
  /** Body radius for collision / separation. */
  radius: number
  /** Hit sphere radius for player shots. */
  hitR: number
  /** Height of the hit / aim point above the enemy's feet. */
  aimY: number
  /** Hover height for flyers. */
  fly: number
  aggro: number
  /** Preferred distance band to the player. */
  range: [number, number]
  xp: number
  bolts: [number, number]
  /** Base cooldown between attacks, seconds (randomised ±30 %). */
  cooldown: number
  tele: number
  /** Red ring (unblockable) vs orange ring (blockable). */
  unblockable: boolean
  /** Damage multiplier taken (armor). */
  armor: number
}

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  hardhat: {
    kind: 'hardhat', hp: 30, dmg: 9, speed: 1.3, radius: 0.5, hitR: 0.62, aimY: 0.42, fly: 0,
    aggro: 13, range: [3, 12], xp: 12, bolts: [3, 6], cooldown: 2.4, tele: 0.55, unblockable: false, armor: 1
  },
  trooper: {
    kind: 'trooper', hp: 55, dmg: 8, speed: 2.3, radius: 0.55, hitR: 0.72, aimY: 1.05, fly: 0,
    aggro: 16, range: [5, 10], xp: 20, bolts: [5, 9], cooldown: 2.1, tele: 0.5, unblockable: false, armor: 1
  },
  warden: {
    kind: 'warden', hp: 110, dmg: 18, speed: 0.8, radius: 0.7, hitR: 0.8, aimY: 0.95, fly: 0,
    aggro: 18, range: [4, 14], xp: 30, bolts: [8, 13], cooldown: 2.6, tele: 1.0, unblockable: false, armor: 1
  },
  gatekeeper: {
    kind: 'gatekeeper', hp: 900, dmg: 24, speed: 1.1, radius: 1.4, hitR: 1.5, aimY: 1.4, fly: 0,
    aggro: 22, range: [5, 11], xp: 160, bolts: [60, 90], cooldown: 1.6, tele: 0.9, unblockable: false, armor: 1
  },
  echo: {
    kind: 'echo', hp: 480, dmg: 22, speed: 2.4, radius: 0.9, hitR: 1.0, aimY: 1.5, fly: 0,
    aggro: 22, range: [5, 9], xp: 120, bolts: [40, 60], cooldown: 1.5, tele: 0.75, unblockable: false, armor: 1
  },
  hornet: {
    kind: 'hornet', hp: 44, dmg: 17, speed: 3.8, radius: 0.45, hitR: 0.55, aimY: 0, fly: 2.4,
    aggro: 18, range: [5, 9], xp: 22, bolts: [5, 9], cooldown: 2.4, tele: 0.7, unblockable: false, armor: 1
  },
  stalker: {
    kind: 'stalker', hp: 70, dmg: 18, speed: 3.6, radius: 0.5, hitR: 0.6, aimY: 0.85, fly: 0,
    aggro: 16, range: [1, 3], xp: 26, bolts: [6, 11], cooldown: 1.8, tele: 0.6, unblockable: false, armor: 1
  },
  puffer: {
    kind: 'puffer', hp: 34, dmg: 16, speed: 1.7, radius: 0.5, hitR: 0.62, aimY: 0, fly: 1.3,
    aggro: 15, range: [0, 4], xp: 18, bolts: [4, 8], cooldown: 1.2, tele: 1.5, unblockable: false, armor: 1
  },
  mole: {
    kind: 'mole', hp: 62, dmg: 15, speed: 3.2, radius: 0.5, hitR: 0.62, aimY: 0.45, fly: 0,
    aggro: 14, range: [0, 2], xp: 24, bolts: [6, 10], cooldown: 2.0, tele: 0.8, unblockable: true, armor: 1
  },
  polar: {
    kind: 'polar', hp: 48, dmg: 12, speed: 2.2, radius: 0.48, hitR: 0.55, aimY: 0, fly: 1.9,
    aggro: 16, range: [5, 10], xp: 22, bolts: [5, 9], cooldown: 2.6, tele: 0.6, unblockable: false, armor: 1
  },
  heli: {
    kind: 'heli', hp: 28, dmg: 11, speed: 3.4, radius: 0.5, hitR: 0.6, aimY: 0, fly: 2.1,
    aggro: 16, range: [4.5, 8], xp: 14, bolts: [4, 7], cooldown: 3.0, tele: 0.7, unblockable: false, armor: 1
  },
  hopper: {
    kind: 'hopper', hp: 72, dmg: 16, speed: 2.0, radius: 0.75, hitR: 0.9, aimY: 1.35, fly: 0,
    aggro: 14, range: [0, 6], xp: 26, bolts: [6, 10], cooldown: 2.8, tele: 0.8, unblockable: true, armor: 0.95
  },
  roller: {
    kind: 'roller', hp: 46, dmg: 14, speed: 2.2, radius: 0.7, hitR: 0.85, aimY: 0.9, fly: 0,
    aggro: 16, range: [5, 12], xp: 18, bolts: [5, 8], cooldown: 2.6, tele: 0.7, unblockable: true, armor: 1
  },
  brute: {
    kind: 'brute', hp: 150, dmg: 20, speed: 1.6, radius: 0.95, hitR: 1.1, aimY: 1.55, fly: 0,
    aggro: 14, range: [0, 2.6], xp: 42, bolts: [10, 16], cooldown: 1.6, tele: 0.85, unblockable: false, armor: 0.85
  },
  turret: {
    kind: 'turret', hp: 60, dmg: 12, speed: 0, radius: 0.6, hitR: 0.75, aimY: 0.75, fly: 0,
    aggro: 18, range: [0, 20], xp: 16, bolts: [4, 7], cooldown: 2.6, tele: 0.8, unblockable: true, armor: 0.9
  },
  // Crate golem, AWAKE (asleep it has a crate's hit volume, sim/enemies.ts
  // GOLEM_SLEEP_*, and takes no damage at all). `dmg` is the thrown rock
  // (orange); the boulder lob hits ×1.35 (red). It keeps 6–12 m from Flux and
  // backs off faster than it closes; `tele` is the throw's wind-up.
  golem: {
    kind: 'golem', hp: 80, dmg: 12, speed: 2.0, radius: 0.6, hitR: 0.8, aimY: 1.05, fly: 0,
    aggro: 16, range: [6, 12], xp: 24, bolts: [6, 11], cooldown: 1.6, tele: 0.62, unblockable: false, armor: 1
  }
}

export const scaleHp = (base: number, level: number): number => Math.round(base * (1 + 0.3 * (level - 1)))
export const scaleDmg = (base: number, level: number): number => Math.round(base * (1 + 0.14 * (level - 1)))
export const scaleXp = (base: number, level: number): number => Math.round(base * (1 + 0.22 * (level - 1)))
