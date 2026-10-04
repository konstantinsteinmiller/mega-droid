import type { BossId } from '../models/bosses'
import type { Group, Mesh, Object3D, Sprite } from 'three'
import type { Rig } from '../models/kit'
import type { EnemyKind } from '../models/enemies'
import type { EnemyMotion } from '../models/motion'
import type { EnemyDef, Element } from '../data/enemies'
import type { Nav } from '../world/nav'
import type { MapData } from '../world/levelGen'
import type { Particles } from '../fx/particles'
import type { FloorMarkers, ShockRings } from '../fx/markers'

/**
 * Shared shapes for the mission sim. Kept free of three.js VALUES (types only)
 * so the pure logic modules stay unit-testable.
 */

export type EnemyState = 'idle' | 'alert' | 'engage' | 'tele' | 'act' | 'recover' | 'stun' | 'dead'

export interface Enemy {
  id: number
  kind: EnemyKind
  def: EnemyDef
  level: number
  elite: boolean
  boss: boolean
  element: Element
  /** i18n key of the display name. */
  nameKey: string
  x: number
  z: number
  y: number
  px: number
  pz: number
  py: number
  yaw: number
  vx: number
  vz: number
  hp: number
  maxHp: number
  dmg: number
  room: number
  awake: boolean
  /** A lesson's machine: stays asleep whatever it sees until it is hurt. */
  hold?: boolean
  /** A boss before its entrance: not in the arena yet, so it is not drawn,
   *  hit, aimed at, woken or bumped into. Its intro drops it in. */
  offstage?: boolean
  /** Under the floor (a Mole Driller between surfacings, the Drill Master's
   *  burrow): not drawn, hit or aimed at; it still moves and acts. */
  buried?: boolean
  /** A Master's echo (the Fortress's Twin Masters): whose rig and attacks. */
  echoOf?: BossId
  /** A machine asleep in disguise (the crate golem as a supply crate): drawn
   *  and hit like the prop it pretends to be, but never noticed, aimed at or
   *  locked on to as a machine, never woken by sight, noise or a room-mate —
   *  and a hit wakes it without hurting it. */
  dormant?: boolean
  /** A mini-boss (the Fortress's gatekeepers): no kill-cam, a checkpoint. */
  mini?: boolean
  /** Crate golem only: its state beyond the shared machine (sim/enemies.ts). */
  golem?: import('./enemies').GolemState
  state: EnemyState
  st: number
  cd: number
  /** Current attack id (kind-specific). */
  attack: string
  step: number
  teleDur: number
  teleRed: boolean
  /** 0..1: how "shut" the defence is (hardhat helmet down, trooper shield up). */
  guard: number
  aim: number
  stunT: number
  /** Stun diminishing returns (`tryStun`): stuns in the current chain, time
   *  since the last one (s), and a stun immunity still running (s). */
  stunN: number
  stunAge: number
  stunImmune: number
  /** The ranged fallback (`fallbackTick`): time spent unable to close on
   *  Flux (s), and where it stood when the last progress check began. */
  /** A hazard hit it a moment ago (s left): one hit per burst. */
  hazardCd?: number
  farT?: number
  farX?: number
  farZ?: number
  farCheck?: number
  flash: number
  path: Array<[number, number]> | null
  pathT: number
  /** 0..1 locomotion: the ground actually covered per tick / top speed
   *  (measured by `stepMotion`, mirrors `mo.walk`). Bosses run their own. */
  walk: number
  anim: number
  /** Animation channels (idle, distance-driven gait, eased attacks); see
   *  models/motion.ts. Advanced per tick, read by the pose functions. */
  mo: EnemyMotion
  /** Scratch slots for per-kind state. */
  a: number
  b: number
  tx: number
  tz: number
  sx: number
  sz: number
  hitPlayer: boolean
  rig: Rig
  root: Group
  shadow: Mesh
  ring: Sprite
  deathT: number
  /** Guard broken by a full charge: defence is down until this counts out. */
  guardBreakT: number
  /** Last time this enemy took damage (for the floating HP bar). */
  hurtAt: number
  /** Boss-only: which Core Master, whether phase 2 has begun. */
  bossId: import('../models/bosses').BossId | null
  phase2: boolean
  /** Extra seconds a boss's entrance or phase-2 roar runs while a story scene speaks over it (#117). */
  beatHold?: number
  /** Boss-only, New Game+ (`sim/ngPlus.ts`): tells and cooldowns × this,
   *  and the chance of a quick follow-up attack. Absent: 1 and none. */
  tempo?: number
  followUp?: number
  /** Status effects from special weapons. */
  burnT: number
  burnDps: number
  frozenT: number
  /** Id of the special weapon that last hit (weapon XP on kill). */
  lastWeapon: string
  /** The climb (terrain maps): the height of the platform it stands on.
   *  `y` stays relative to it, so the AI is the flat one; only the world
   *  position (drawing, shot origins, hit tests) adds it. Absent = 0. */
  floor?: number
  /** The climb: the rectangle (x0, z0, x1, z1) it may not leave — its own
   *  platform — and, for a flyer, the band of heights it follows the player
   *  through. */
  leash?: [number, number, number, number]
  hover?: [number, number]
  /** Never steps from its spot (it still turns and fights): the tutorial's
   *  block teacher, which walked out of its lesson. */
  rooted?: boolean
  /** Fallen apart into its parts (`fx/shatter.ts`): its own model hides. */
  shattered?: boolean
}

export type ShotKind = 'pellet' | 'charge1' | 'charge2' | 'charge3' | 'enemy' | 'shell' | 'reflect' | 'special' | 'rock'

export interface Shot {
  active: boolean
  owner: 'player' | 'enemy'
  kind: ShotKind
  x: number
  y: number
  z: number
  px: number
  py: number
  pz: number
  vx: number
  vy: number
  vz: number
  dmg: number
  crit: boolean
  radius: number
  life: number
  pierce: number
  hitIds: number[]
  homing: Enemy | null
  /** Aimed at this machine's weak spot (`data/weakspots.ts`): the crosshair
   *  was on it when fired. Only such a shot can land one; the auto-aim's never. */
  weakOf?: Enemy | null
  /** How close it has come to that spot so far (m): once it is past it, it
   *  is an ordinary shot. */
  weakBest?: number
  turn: number
  source: Enemy | null
  blockable: boolean
  /** Ballistic shells: start, target, time. */
  sx: number
  sy: number
  sz: number
  tx: number
  tz: number
  t: number
  dur: number
  color: string
  sprite: Sprite
  core: Mesh | null
  element: Element
  /** Special weapon id when kind === 'special'. */
  weapon: string
  /** A Neon Blade on its way back (it turned at half its flight). */
  back?: boolean
  /** Enemy orbs that steer toward the player and can be shot down. */
  homePlayer: boolean
  destructible: boolean
  /** Special-weapon payloads: burn (dps, s) / freeze (s) applied on hit. */
  burn: number
  freeze: number
  /** A crate golem's rock (a tumbling stone mesh, fx/rubble.ts) in place of the glow core. */
  rock?: Object3D | null
  /** A charged shot's comet tail and the energy rings it sheds (combat.ts),
   *  built the first time its pool slot fires one. */
  aura?: Group | null
}

export type PickupKind = 'bolt' | 'hp' | 'hpBig' | 'we' | 'weBig' | 'core'

export interface Pickup {
  active: boolean
  kind: PickupKind
  value: number
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  t: number
  root: Group
  magnet: boolean
}

export interface CombatPlayer {
  hp: number
  maxHp: number
  we: number
  maxWe: number
  power: number
  maxPower: number
  powerDelay: number
  charge: number
  charging: boolean
  fireCd: number
  blocking: boolean
  blockPressedAt: number
  /** After a parry the shield is lowered for the counter (s left): firing
   *  works even with block still held. A fresh block press raises it again. */
  riposteT: number
  guardBroken: number
  slideT: number
  slideCd: number
  slideDX: number
  slideDZ: number
  iframes: number
  hurtT: number
  target: Enemy | null
  recoil: number
  dead: boolean
  lastStandUsed: boolean
}

export interface World {
  map: MapData
  nav: Nav
  time: number
  /** `y`: the height of the player's feet (the climb; 0 on a flat map). */
  player: { x: number; z: number; yaw: number; pitch: number; y?: number }
  combat: CombatPlayer
  enemies: Enemy[]
  fx: Particles
  markers: FloorMarkers
  shocks: ShockRings
  /** Every projectile in flight (the CombatSystem's pool, which puts itself
   *  here): a crate golem watches for charged shots coming its way. */
  shots?: readonly Shot[]
  /** What a machine can read of Flux's kit: how long his charge takes. */
  stats?: { readonly chargeTimeMul: number }
  /** `worldY`: the shot is already aimed in world heights (the crate golem's
   *  rock), so a climb must not lift and tip it again. */
  fireEnemyShot(e: Enemy, x: number, y: number, z: number, dx: number, dy: number, dz: number, speed: number, dmg: number, blockable: boolean, worldY?: boolean): void
  lobShell(e: Enemy, tx: number, tz: number, dur: number, dmg: number): void
  /** Boss hazards (see CombatSystem). */
  spawnWave(e: Enemy, x: number, z: number, dx: number, dz: number, speed: number, halfWidth: number, range: number, dmg: number, color: string): void
  spawnRing(e: Enemy, x: number, z: number, speed: number, maxR: number, dmg: number, color: string): void
  fireOrb(e: Enemy, x: number, y: number, z: number, speed: number, dmg: number): void
  /** Drag the player toward (x, z) at `speed` m/s for `dur` s (a boss's pull). */
  pull?(x: number, z: number, speed: number, dur: number): void
  /** Melee / AoE / contact damage from an enemy to the player. */
  hitPlayer(e: Enemy | null, dmg: number, opts: { blockable: boolean; fromX: number; fromZ: number; kind: 'melee' | 'aoe' | 'shot'; hazard?: string }): 'hit' | 'block' | 'parry' | 'miss'
  shake(amount: number): void
  sfx(name: string, x?: number, z?: number): void
}
