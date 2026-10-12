import type { Terrain } from '../world/levelGen'
import type { ClimbBody, ClimbHost, ClimbRun } from './climb'
import type { AtlasLine } from './atlas'
import { CrumbleFeature } from './stages/crumble'
import { VentFeature, FIRE_STYLE } from './stages/vents'
import { meltdownCues } from './stages/meltdown'
import { IceFeature } from './stages/ice'
import { FrostThrowers } from './stages/frost'
import { IcePillars } from './stages/icePillars'
import { Icicles } from './stages/icicles'
import { WindFeature } from './stages/wind'
import { skyDocksCues } from './stages/skyDocks'
import { RailFeature } from './stages/rail'
import { WaveFeature } from './stages/waves'
import { ShockFeature } from './stages/shock'
import type { Shot } from './world'
import { SecretsFeature } from './secrets'
import { MagnetFeature, polarityCues } from './stages/magnet'
import { WaterFeature } from './stages/water'
import { NeonFeature } from './stages/neon'

/**
 * ─── Stage features: the platform stages' mechanics, one file each ───────────
 *
 * The climb's own parts (lifts, crushers, scrap balls, ladders) live in
 * `sim/climb.ts`. Everything a platform stage adds on top — ice, wind
 * tunnels, flame vents, a rail cart, waves of flyers, secret walls — is a
 * `StageFeature` in a file of its own, built by `buildStageFeatures` from the
 * terrain's optional lists and driven by `ClimbRun`:
 *
 *  - `update` every step before the player moves (like the lifts);
 *  - `move` bends the walk where the player stands: `friction` multiplies the
 *    mission's velocity blend (ice < 1: momentum carries), `push` is added to
 *    this step's move (m/s: a gust);
 *  - `carry` takes the body over for a step (a rail cart), `locksMove` makes
 *    the stick idle meanwhile (looking and shooting still work);
 *  - `shotHits` lets a feature's solid things stop Flux's shots (an ice
 *    pillar, a cracked one shot down);
 *  - `shot` sees each player shot's step (a secret's wall buttons);
 *  - `save` / `restore` ride in the climb's snapshot, by the feature's place
 *    in the list — so the list's order is fixed, and a feature is built
 *    (possibly idle) whenever its terrain list exists.
 *
 * A feature allocates at build time only, never per step. Atlas speaks for
 * a feature through `ClimbHost.say` (`hint.<id>`, `secret.<id>` lines; see
 * `sim/atlas.ts`), most simply with an `AtlasCue` — no glyphs, no tutorial
 * overlays: a stage teaches by its layout and Atlas's one line.
 */

export interface StageFeature {
  /** Per step, before the player moves (like ClimbRun.update). */
  update(dt: number, time: number, p: ClimbBody, playing: boolean): void
  /** Movement modifiers at the player's position: friction multiplies the mission's accel blend k (ice < 1), push is added to the velocity (m/s, wind). */
  move?(p: ClimbBody, out: MoveMod): void
  /** Take over the body this step (a rail cart): write out[0..1], set p.y; return true to skip the normal walk. */
  carry?(p: ClimbBody, out: [number, number], dt: number): boolean
  /** While true the stick is ignored (riding) but looking/shooting work. */
  locksMove?(): boolean
  /** A player shot at (x, y, z) of radius r (`charge` 0: a quick shot):
   *  true if something of this feature's stopped it. */
  shotHits?(x: number, y: number, z: number, r: number, charge: number): boolean
  /** Something of this feature that hurts is within r (m) of (x, z): a
   *  kill-cam holds off, Flux is in a hurry. */
  hazardNear?(x: number, z: number, r: number): boolean
  /** A player shot's step, from (px, py, pz) to (x, y, z), before the walls
   *  stop it: true when the feature caught it (the shot ends there). */
  shot?(s: Shot): boolean
  save?(): unknown
  restore?(s: unknown): void
  dispose?(): void
  /** Portal culling's verdict this frame, per room (1 drawn): a part hung at
   *  the scene root (it moves across rooms, or spans them) shows only while
   *  a room it stands in does (`Mission.updateRoomCulling`). */
  cull?(vis: Uint8Array): void
}

/** What `StageFeature.move` writes: start at friction 1, no push; each
 *  feature multiplies the friction and adds its push. */
export interface MoveMod {
  friction: number
  pushX: number
  pushZ: number
  /** The walk's top speed, multiplied (water: < 1). Absent: 1. */
  speed?: number
}

/** What of the climb's run a feature may drive (a secret's false wall). */
export type StageRun = Pick<ClimbRun, 'openSecret' | 'secretOpen'>

/**
 * The features a terrain needs, in a fixed order (the snapshot's indices).
 * A phase-2 feature registers itself with one line here, keyed on its
 * terrain list, e.g.
 *
 *   if (t.ice) out.push(new IceFeature(host, t))
 *
 * `run` is the climb's run (a secret opens its false wall through it). The
 * climb has none of the stage lists: it builds only its secret's feature.
 */
export const buildStageFeatures = (host: ClimbHost, t: Terrain, run: StageRun): StageFeature[] => {
  const out: StageFeature[] = []
  void host
  void t
  // One slot per stage mechanic, in a fixed order (saves go by position).

  // ── blaze (Meltdown Descent) ──
  if (t.vents?.some(v => v.kind === 'fire')) out.push(new VentFeature(host, t, 'fire', FIRE_STYLE))
  if (host.theme.id === 'blaze' && t.pitKind?.includes('lava')) out.push(meltdownCues(host, t))

  // ── cryo (Glacier Run) ──
  if (t.ice) out.push(new IceFeature(host, t))
  if (t.vents?.some(v => v.kind === 'frost')) out.push(new FrostThrowers(host, t))
  if (t.icePillars) out.push(new IcePillars(host, t))
  if (t.icicles) out.push(new Icicles(host, t))

  // ── volt (Rail Rush) ──
  // (The Deep Mine's cart came later: its slot is at the end.)
  const rail = t.rails?.[0] && host.theme.id !== 'drill' ? new RailFeature(host, t.rails[0]) : null
  if (rail) out.push(rail)
  if (t.waves) out.push(new WaveFeature(host, t.waves, rail))
  if (t.vents?.some(v => v.kind === 'shock')) out.push(new ShockFeature(host, t.vents))

  // ── gale (Sky Docks) ──
  if (t.wind) out.push(new WindFeature(host, t), skyDocksCues(host, t))

  // ── secrets (every terrain map) ──
  if (t.secrets?.length) out.push(new SecretsFeature(host, t, run))

  // ── any stage (appended last: older saves keep their feature slots) ──
  if (t.crumbles?.length) out.push(new CrumbleFeature(host, t))

  // ── magnet (Polarity Works), after every older slot ──
  if (t.magnets?.length) out.push(new MagnetFeature(host, t), polarityCues(host, t))

  // ── tide (Tidewater Locks) ──
  if (t.water?.length) out.push(new WaterFeature(host, t))

  // ── neon (Blackout Boulevard) ──
  if (t.neon?.length || t.neonSwitches?.length) out.push(new NeonFeature(host, t))

  // ── drill (Deep Mine): the mine cart (#111), after every older slot ──
  if (host.theme.id === 'drill' && t.rails?.[0]) out.push(new RailFeature(host, t.rails[0]))

  return out
}

// ─── Atlas's cues ────────────────────────────────────────────────────────────

/** Default reach of a cue (m) and how far off its floor Flux may be (m). */
const CUE_R = 6
const CUE_DY = 1.5

/**
 * Say `line` the first time Flux comes within `r` m of (x, z), standing
 * within `dy` of the floor `y` (a ledge below or above does not count):
 * poll it from a feature's `update`. Once said it stays quiet (and Atlas
 * itself says a line once a mission). Allocation-free.
 */
export class AtlasCue {
  said = false
  constructor(
    private readonly host: Pick<ClimbHost, 'say'>,
    readonly line: AtlasLine,
    readonly x: number,
    readonly z: number,
    readonly y: number,
    readonly r = CUE_R,
    readonly dy = CUE_DY
  ) {}

  /** True on the step it spoke. */
  update(p: ClimbBody, playing: boolean): boolean {
    if (this.said || !playing || Math.abs(p.y - this.y) > this.dy) return false
    const dx = p.x - this.x
    const dz = p.z - this.z
    if (dx * dx + dz * dz > this.r * this.r) return false
    this.said = true
    this.host.say(this.line)
    return true
  }
}

/** The same test without a latch, for a feature that keeps its own state:
 *  says `line` (Atlas drops a repeat) when Flux is within reach. */
export const atlasOnce = (
  host: Pick<ClimbHost, 'say'>, p: ClimbBody, line: AtlasLine, x: number, z: number, y: number, r = CUE_R, dy = CUE_DY
): boolean => {
  if (Math.abs(p.y - y) > dy || (p.x - x) ** 2 + (p.z - z) ** 2 > r * r) return false
  host.say(line)
  return true
}

/** A feature of nothing but cues: the lines a level's author pins to spots
 *  (a tip before a gap, a nudge by a secret's panel). Its save is which
 *  cues have spoken, so a resumed stage does not repeat them. */
export const cueFeature = (host: Pick<ClimbHost, 'say'>, cues: Array<{ line: AtlasLine; x: number; y: number; z: number; r?: number }>): StageFeature => {
  const list = cues.map(c => new AtlasCue(host, c.line, c.x, c.z, c.y, c.r))
  return {
    update(_dt, _time, p, playing) {
      for (const c of list) c.update(p, playing)
    },
    save: () => list.map(c => (c.said ? 1 : 0)),
    restore(s) {
      if (!Array.isArray(s)) return
      list.forEach((c, i) => { c.said = s[i] === 1 })
    }
  }
}
