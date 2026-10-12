import type { BossId } from '../models/bosses'
import type { EnemyDef, Element } from './enemies'
import type { WeaponId } from './weapons'
import { MASTER_COLOR } from './signature'

/**
 * Core Master stat sheets. `hp` is at level 1 and scales like any enemy; the
 * weakness is the classic rock-paper-scissors of the weapon-copy games, in
 * two rings that run WITH the story order: each Master is weak to the weapon
 * of the Master freed just before it, so Flux already carries the answer on
 * the first fight (Blaze ← Gale Guard, Frost ← Flame Wave, Volt ← Ice Lance,
 * Gale ← Thunder Arc; Magnet ← Drone Swarm, Drill ← Magnet Pull, Tide ← Drill
 * Bomb, Neon ← Bubble Lance, Rotor ← Neon Blade). Only each ring's first
 * Master (Blaze, Magnet) waits for its rematch.
 */
export interface BossDef extends EnemyDef {
  id: BossId
  element: Element
  weakTo: WeaponId | null
  /** Visual scale of the rig. */
  scale: number
  /** Patterns in phase 1 and the extra ones unlocked at half health. */
  patterns: string[]
  patterns2: string[]
  color: string
}

const base = (o: Partial<BossDef> & Pick<BossDef, 'id' | 'hp' | 'dmg' | 'element' | 'weakTo' | 'patterns' | 'patterns2' | 'color'>): BossDef => ({
  kind: 'brute',
  speed: 3,
  radius: 0.9,
  hitR: 1.05,
  aimY: 1.25,
  fly: 0,
  aggro: 30,
  range: [5, 9],
  xp: 260,
  bolts: [60, 90],
  cooldown: 1.3,
  tele: 0.8,
  unblockable: false,
  armor: 1,
  scale: 1.35,
  ...o
})

export const BOSSES: Record<BossId, BossDef> = {
  scrapper: base({
    id: 'scrapper', hp: 580, dmg: 14, element: 'none', weakTo: null, scale: 1, radius: 1.3, hitR: 1.4, aimY: 1.5,
    speed: 2.4, range: [4, 9], xp: 150, bolts: [40, 60], color: MASTER_COLOR.scrapper,
    patterns: ['charge', 'scrapToss', 'stomp'], patterns2: ['magnetPunch']
  }),
  blazeMaster: base({
    id: 'blazeMaster', hp: 520, dmg: 16, element: 'fire', weakTo: 'galeGuard', color: MASTER_COLOR.blazeMaster,
    patterns: ['fireWave', 'flameBurst', 'leapSlam'], patterns2: ['flameRing']
  }),
  frostMaster: base({
    id: 'frostMaster', hp: 560, dmg: 17, element: 'ice', weakTo: 'flameWave', color: MASTER_COLOR.frostMaster,
    patterns: ['iceVolley', 'freezeFloor', 'dashSlash'], patterns2: ['iceVolleyBig']
  }),
  voltMaster: base({
    id: 'voltMaster', hp: 600, dmg: 18, element: 'volt', weakTo: 'iceLance', color: MASTER_COLOR.voltMaster,
    patterns: ['chainBolt', 'orbStorm', 'blink'], patterns2: ['voltRing']
  }),
  galeMaster: base({
    id: 'galeMaster', hp: 640, dmg: 19, element: 'wind', weakTo: 'thunderArc', color: MASTER_COLOR.galeMaster,
    patterns: ['featherFan', 'tornado', 'dive'], patterns2: ['featherStorm']
  }),
  // The Polarity Works' Master: homing horseshoes, a pull to its pole, a
  // rail-straight charge; phase 2 storms both poles at once.
  magnetMaster: base({
    id: 'magnetMaster', hp: 680, dmg: 20, element: 'none', weakTo: 'droneSwarm', color: MASTER_COLOR.magnetMaster,
    patterns: ['magnetMissiles', 'polePull', 'charge'], patterns2: ['polarStorm']
  }),
  // The Deep Mine's Master: it burrows and bursts up under Flux, lobs
  // drill bombs, charges; phase 2 shakes the mine (rings and falling rock).
  drillMaster: base({
    id: 'drillMaster', hp: 720, dmg: 21, element: 'none', weakTo: 'magnetPull', color: MASTER_COLOR.drillMaster,
    patterns: ['burrow', 'drillBombs', 'charge'], patterns2: ['quake']
  }),
  // The Tidewater Locks' Master: a lance thrust, tidal waves to slide
  // under, a slow volley of bubbles; phase 2 a whirlpool that pulls.
  tideMaster: base({
    id: 'tideMaster', hp: 760, dmg: 22, element: 'none', weakTo: 'drillBomb', color: MASTER_COLOR.tideMaster,
    patterns: ['dashSlash', 'tidalWave', 'bubbleVolley'], patterns2: ['whirlpool']
  }),
  // The Blackout Boulevard's Master: a blade thrown out and back, a dash
  // out of the dark, a neon volley; phase 2 a laser grid of rings.
  neonMaster: base({
    id: 'neonMaster', hp: 800, dmg: 23, element: 'none', weakTo: 'bubbleLance', color: MASTER_COLOR.neonMaster,
    patterns: ['bladeBoomerang', 'dashSlash', 'neonVolley'], patterns2: ['laserGrid']
  }),
  // The Rotor Run's Master: a swarm of drones, a downdraft that blows Flux
  // back, a dive from above; phase 2 a storm of drones and rings.
  rotorMaster: base({
    id: 'rotorMaster', hp: 840, dmg: 24, element: 'none', weakTo: 'neonBlade', color: MASTER_COLOR.rotorMaster,
    patterns: ['droneSwarm', 'downdraft', 'dive'], patterns2: ['rotorStorm']
  }),
  // 1.5× the first draft's 1100 (playtest 2026-10-12); the Grand Master
  // Bot's parts follow (GM_HP_MUL of his max).
  vexMk1: base({
    id: 'vexMk1', hp: 1650, dmg: 22, element: 'none', weakTo: null, scale: 1, fly: 1.6, radius: 1.3, hitR: 1.3, aimY: 0.2,
    speed: 2.2, range: [6, 11], xp: 600, bolts: [150, 220], color: MASTER_COLOR.vexMk1,
    patterns: ['flameBurst', 'iceVolley', 'orbStorm', 'lobBarrage'], patterns2: ['voltRing', 'fireWave', 'dive']
  })
}

/** Counter-element chart for regular machines (×1.75), the same ring as the
 *  Masters': an element is weak to the one listed (fire to wind, ice to
 *  fire, volt to ice, wind to volt). */
export const COUNTER: Record<Element, Element | null> = {
  none: null,
  fire: 'wind',
  ice: 'fire',
  volt: 'ice',
  wind: 'volt'
}
