import { hasLineOfSight } from '../world/nav'
import type { World } from './world'
import type { EnemyKind } from '../models/enemies'
import {
  ROLLER_LUNGE_MAX, HOPPER_LEAP_R, BRUTE_RUSH_MAX, BRUTE_STOMP_MAX, STALKER_LUNGE_R, PUFFER_SWELL_R, MOLE_STRIKE, MOLE_LUNGE_R,
  GOLEM_RAM_R, GATE_STOMP_R
} from './enemies'
import { PLAYER_R } from './constants'

/**
 * ─── How far each attack can reach when it starts (#180) ─────────────────────
 *
 * A machine only winds an attack up when Flux stands within that attack's
 * EFFECTIVE REACH (m): its hitbox, plus the ground its lunge, dash, leap or
 * pull covers before the hit. Beyond it, it closes in or picks a move that
 * reaches. (The Steel Hound breathed its 6.5 m cone at Flux 15–20 m away:
 * nothing could land unless he walked into it.)
 *
 * `Infinity` is a move that reaches anywhere it sees him: a shot, a lob at his
 * feet, a ring of embers round him, a leap onto his spot, a blink beside him,
 * a room-wide hazard. The test (`tests/game/attackReach.test.ts`) runs every
 * machine against Flux at many distances and holds every wind-up to this.
 */

/** Ranged or room-wide: reaches him wherever he is. */
export const ANYWHERE = Infinity

/** The ordinary machines, by kind and attack (`sim/enemies.ts` `startTele`).
 *  Their gates sit in `updateEnemy`; these are the numbers those gates use. */
const KINDS: Partial<Record<EnemyKind, Record<string, number>>> = {
  hardhat: { spread: ANYWHERE },
  trooper: { burst: ANYWHERE },
  heli: { swoop: 11 },
  hopper: { leap: HOPPER_LEAP_R },
  roller: { lunge: ROLLER_LUNGE_MAX, charge: 14 },
  brute: { combo: 3.4, slam: 3.4, stomp: BRUTE_STOMP_MAX, rush: BRUTE_RUSH_MAX, scrapToss: ANYWHERE, volley: ANYWHERE },
  turret: { lob: ANYWHERE },
  polar: { pulse: ANYWHERE },
  warden: { cannon: ANYWHERE },
  gatekeeper: { stomp: GATE_STOMP_R + PLAYER_R, barrage: ANYWHERE, cannon: ANYWHERE },
  echo: { volley: ANYWHERE, lob: ANYWHERE },
  hornet: { dive: 14 },
  stalker: { lunge: STALKER_LUNGE_R },
  spotter: { lock: ANYWHERE },
  puffer: { swell: PUFFER_SWELL_R },
  mole: { erupt: MOLE_STRIKE, lunge: MOLE_LUNGE_R },
  golem: { ram: GOLEM_RAM_R, lob: ANYWHERE, throw: ANYWHERE }
}

/** Every ordinary machine's own moves, and the lob any of them throws when
 *  Flux has stood out of its reach too long (`lobFallback`). */
export const ENEMY_REACH: Partial<Record<EnemyKind, Record<string, number>>> = Object.fromEntries(
  Object.entries(KINDS).map(([k, r]) => [k, { ...r, lobFallback: ANYWHERE }])
)

/**
 * The Core Masters' patterns (`sim/bosses.ts`). A dash or lunge counts its
 * run (speed × longest run) plus its swing; a pull counts the drag plus the
 * clamp or ring at its end; a ring counts its widest radius; a floor wave
 * its run.
 */
export const BOSS_REACH: Record<string, number> = {
  charge: 18, // 13 m/s for up to 1.6 s
  magnetPunch: 8, // a 5 m lunge, then a 3.2 m swing
  dashSlash: 11.5, // a 9.4 m dash, then a 2.6 m slash
  burrow: 12, // tunnels 9.75 m after him, bursts up 2.3 m round
  polePull: 8.5, // dragged 6 m in, the 2.4 m clamp
  whirlpool: 12, // dragged in 8 m, the 9 m ring at the end
  flameRing: 9,
  voltRing: 10,
  fireWave: 24,
  tornado: 24,
  tidalWave: 24,
  downdraft: 22,
  laserGrid: 20,
  scrapToss: ANYWHERE,
  lobBarrage: ANYWHERE,
  drillBombs: ANYWHERE,
  freezeFloor: ANYWHERE,
  quake: ANYWHERE,
  stomp: ANYWHERE, // a leap onto his spot
  leapSlam: ANYWHERE,
  dive: ANYWHERE, // a dive onto his spot
  flameBurst: ANYWHERE,
  iceVolley: ANYWHERE,
  iceVolleyBig: ANYWHERE,
  chainBolt: ANYWHERE, // needs line of sight (BOSS_NEEDS_LOS)
  orbStorm: ANYWHERE,
  blink: ANYWHERE,
  featherFan: ANYWHERE,
  featherStorm: ANYWHERE,
  magnetMissiles: ANYWHERE,
  polarStorm: ANYWHERE,
  bubbleVolley: ANYWHERE,
  bladeBoomerang: ANYWHERE,
  neonVolley: ANYWHERE,
  droneSwarm: ANYWHERE,
  rotorStorm: ANYWHERE,
  // #188 Every Master's charged attacks: the homing salvo flies anywhere;
  // the blast is gated per Master on its own ring (`blastReaches`,
  // sim/bosses.ts) — it walks in and holds it until he is inside
  chargedBlast: ANYWHERE,
  homingSalvo: ANYWHERE
}

/** Patterns that only land along a clear line (an instant bolt). */
export const BOSS_NEEDS_LOS: ReadonlySet<string> = new Set(['chainBolt'])

/** `attack` reaches Flux `d` m away (an undeclared attack never does). */
export const withinReach = (reach: Readonly<Record<string, number>>, attack: string, d: number): boolean =>
  d <= (reach[attack] ?? -1)

/** A boss pattern can start now: in reach, and in sight when it needs to be. */
export const bossCanStart = (w: World, x: number, z: number, attack: string, d: number): boolean =>
  withinReach(BOSS_REACH, attack, d) && (!BOSS_NEEDS_LOS.has(attack) || hasLineOfSight(w.nav, x, z, w.player.x, w.player.z))

/** The first of `want, ...alt` that reaches `d` m, or null (close in first). */
export const firstInReach = <A extends string>(reach: Readonly<Record<A, number>>, d: number, want: A, ...alt: A[]): A | null => {
  if (d <= reach[want]) return want
  for (const a of alt) if (d <= reach[a]) return a
  return null
}
