import type { Rig } from '../../models/kit'
import type { EnemyDef } from '../../data/enemies'
import type { WeakSpot } from '../../data/weakspots'
import type { SectorId } from '../../world/themes'
import type { Room } from '../../world/levelGen'
import type { Enemy, Shot, World } from '../world'

/**
 * ─── Challenge mini-bosses: the shapes ───────────────────────────────────────
 *
 * A challenge room (`sim/challenge.ts`) holds one mini-boss: a machine with
 * a boss's entrance, a bar and a name card, but its own small AI, not the
 * Core Masters' (`sim/bosses.ts`). Each is a REGISTRY ENTRY
 * (`miniBoss/registry.ts`, one per sector) made of:
 *
 *  - a stat sheet (`MiniBossDef`, an `EnemyDef` plus its weak spot and
 *    colour), scaled like a strong boss (`createMiniBoss`, the mission);
 *  - a model (`build`, a skinned rig from `models/kit.ts`);
 *  - a behaviour module (`MiniBossBehaviour`): its entrance, its fight, its
 *    death throes and its pose, over a scratch record of its own (`M`).
 *
 * The shared state machine (`sim/miniBosses.ts` `updateMiniBoss`) runs the
 * rest: waiting offstage, the entrance's invulnerable beat ('alert'), stuns,
 * death, the hit flash, keeping it in its room and Flux out of its body. A
 * new mini-boss is a model file, a behaviour file and its registry line.
 */

/** The sectors with a challenge mini-boss: every story stage from Blaze on. */
export type ChallengeSector = Exclude<SectorId, 'scrapyard'>

export type MiniBossId =
  | 'cinderHound' | 'icebreakerBrute' | 'arcSpider' | 'stormHornetQueen' | 'lodestoneGolem'
  | 'burrowWyrm' | 'pufferMatriarch' | 'glitchStalker' | 'sawGyro' | 'sentinelPrototype'

export interface MiniBossDef extends EnemyDef {
  /** Its weak spot (`data/weakspots.ts` reads `def.weak`). */
  weak: WeakSpot
  /** Its signature colour: the death burst, the reward's sparks. */
  color: string
}

/**
 * A mini-boss's own AI and look. `M` is its scratch record (`init` makes a
 * fresh one per fight; it lives on `Enemy.challenge.mem`). States it owns:
 * 'engage', 'tele', 'act', 'recover' — set `e.state` / `e.st` itself. The
 * framework owns 'idle' (offstage), 'alert' (the entrance: hits TINK off),
 * 'stun' (a full charge's interrupt) and 'dead'.
 *
 * Rules every module keeps (a ten-year-old reads the fight):
 *  - every attack has a wind-up of at least ~0.6 s with a BIG pose change,
 *    the glow brightening and the telegraph ring (`kit.ts` `teleRing`);
 *  - every area it will hit is drawn on the floor before it hits (floor
 *    markers, a cone, a lane) for the whole wind-up;
 *  - damage only lands in 'act', never in 'tele'.
 */
export interface MiniBossBehaviour<M = unknown> {
  init(e: Enemy): M
  /** The entrance, a tick at a time from the moment Flux is shut in: true
   *  when it is over (the framework turns to 'engage'). */
  intro(w: World, e: Enemy, m: M, room: Room, dt: number): boolean
  /** One fight tick ('engage' | 'tele' | 'act' | 'recover'). */
  fight(w: World, e: Enemy, m: M, room: Room, dt: number): void
  /** A tick of its death throes, until the framework breaks it apart. */
  dying(w: World, e: Enemy, m: M, dt: number): void
  /** Pose its rig for the frame (the framework has placed and turned it). */
  pose(e: Enemy, m: M, time: number): void
  /** Drop what it has drawn in the world (floor fx): a stun cut its attack
   *  short, or it died. */
  clear?(w: World, e: Enemy, m: M): void
  /** A shot from (fromX, fromZ) skips off its guard (TINK; `combat.ts`): an
   *  ice shield up in front, say. A full charge breaks it like any guard. */
  guarded?(e: Enemy, m: M, fromX: number, fromZ: number): boolean
  /** A player shot in flight near it, tested before its body each step:
   *  'catch' — a part of its own took the shot (a shield drone, a decoy; the
   *  module has dealt with the hit and the shot ends there); 'pass' — it is
   *  not there to be hit (blinked out); nothing — its body as usual. */
  shot?(w: World, e: Enemy, m: M, s: Shot): 'catch' | 'pass' | void
}

export interface MiniBossSpec<M = unknown> {
  id: MiniBossId
  sector: ChallengeSector
  /** i18n key of its name (`miniboss.<id>`). */
  nameKey: string
  def: MiniBossDef
  /** Its rig at scale 1 (`Rig.height` is the tele ring's height). */
  build(): Rig
  behaviour: MiniBossBehaviour<M>
  /** Not built yet: it borrows another entry's model and behaviour (shown
   *  under its own name). The note says what it is meant to become. */
  todo?: string
}

/** What a mini-boss carries on its `Enemy` (`Enemy.challenge`). */
export interface MiniBossState {
  spec: MiniBossSpec
  room: Room
  mem: unknown
}
