import { ngHpMul, ngTempo, ngFollowUp } from './ngPlus'
import {
  Scene, PerspectiveCamera, Fog, HemisphereLight, DirectionalLight, Color, Vector3, Raycaster, Vector2,
  Mesh, RingGeometry, CylinderGeometry, MeshBasicMaterial, AdditiveBlending, DoubleSide, Group, AmbientLight,
  Frustum, Matrix4, Sphere, SphereGeometry, WebGLRenderTarget, Quaternion, Euler, Shape, ShapeGeometry, type Object3D
} from 'three'
import type { GameMode } from '../engine/app'
import { buildCityscape, type Cityscape } from '../world/cityscape'
import { weakSpotUnderRay } from '../data/weakspots'
import { AtlasDirector, atlasKey, type AtlasTick, type AtlasLine, type AtlasMemory } from './atlas'
import { buildAtlas, animateAtlas } from '../models/atlas'
import { playVoice, playVoiceSoon, prefetchVoice } from '../audio/voice'
import { bark, barkFor, preloadBarks } from '../audio/barks'
import { compareItems, rivalFor } from '../data/itemCompare'
import { Scene as StoryScene, markVexSeen, vexSeen, prefetchScene, VEX_BOSS_KEY, type Beat, type ScenePlace } from '../story/vexScene'
import {
  presentBeats, freedBeats, voltHackBeats, fortressBeats, mk1IntroBeats, mk1SignalBeats, mk1DefeatBeats,
  MK1_INTRO_HOLD, MK1_SIGNAL_HOLD, MK1_CALL
} from '../story/vexScenes'

/** Main-thread budget per frame for streaming the city in (ms). */
const CITY_STREAM_MS = 3
import { getRenderer, fovForAspect } from '../engine/renderer'
import type { Input } from '../engine/input'
import { consumeEdges } from '../engine/input'
import { generateMap, type MapData, type SecretSpec, CELL, WALL_H, pitKindOf } from '../world/levelGen'
import { createSlicer, type Slice } from '../engine/slicer'
import { createNav, moveCircle, findPath, smoothPath, isSolidAt, hasLineOfSight, floorAt, type Nav, type Slab } from '../world/nav'
import { buildLevel, buildWallPlug, doorFramePos, SKY_FAR, type LevelMeshes } from '../world/levelMesh'
import { THEMES, type Theme, type SectorId } from '../world/themes'
import { buildDoor, buildTeleporter, type DoorMesh, type PadMesh } from '../models/props'
import {
  buildViewmodel, buildHero, animateHeroIdle, animateHeroVictory, animateHeroWalk, animateHeroHop, type Viewmodel
} from '../models/hero'
import { buildExitDrone, poseExitDrone, type ExitDroneView } from '../models/exitDrone'
import { pose, type Rig } from '../models/kit'
import { newMotion, type EnemyMotion } from '../models/motion'
import { PAL, RARITY_COLOR as RARITY_HEX } from '../models/palette'
import {
  EYE_H, PLAYER_R, WALK_SPEED, ACCEL, PATH_SPEED, LOOK_TOUCH, LOOK_MOUSE, LOOK_LOCK, PITCH_MIN, PITCH_MAX,
  DOOR_OPEN_DIST, DOOR_OPEN_SPEED, TURN_RATE
} from './constants'
import { hud, hudLive, tickHud, pushHud } from '../state/hud'
import { feedDamage } from '../state/damageFeed'
import type { CombatPlayer, Enemy, PickupKind, Shot } from './world'
import { CombatSystem, type CombatHost } from './combat'
import { updateEnemy, syncEnemyVisual, PARRY_WINDOW, wake, createEnemy, frozenDt } from './enemies'
import { spawnEncounters, spawnTutorial, type EncounterTable } from './spawn'
import { baseStats, chargeInfo, type PlayerStats } from './stats'
import { Particles } from '../fx/particles'
import { FloorMarkers, ShockRings, makeBlobShadow } from '../fx/markers'
import { ObjectiveTrail, type TrailInput } from '../fx/objectiveTrail'
import { sfx } from '../audio/sfx'
import { setMusicTrack } from '@/use/useSound'
import { Coach, type CoachContext, type HintView } from './coach'
import { LessonDirector, roomAt, type LessonTick } from './lessons'
import { Walkthrough, planWalkthrough, doorwayOf, helperSpot, type WalkChest, type WalkPlan, type GelPlan, type WalkNeed, LESSON_OF } from './walkthrough'
import { DoorPrompt, IDLE_RANGE, CLOSE_RANGE, type DoorTick } from './doorPrompt'
import { TrapSystem, planTraps, type TrapTick } from './traps'
import { buildTrapView } from '../models/traps'
import { chargeHum } from '../audio/synth'
import type { Quest } from '../data/quests'
import { SECTOR_BY_ID } from '../data/regions'
import { MissionObjects, CHEST_DY, type Chest, type Crate, type Core, type ObjectiveHost } from './objectives'
import {
  profile, grantXp, saveProfile, claimGiftTank, computeStats, writeSnapshot, retryPointOf, xp01, heroColors, markTip, equipped, type MissionSnapshot
} from '../state/profile'
import { rollItem, type Item } from '../data/items'
import { flow, finishMission, retryFromSnapshot, copyBossWeapon } from '../flow'
import { showBanner, clearBanner } from '../state/banner'
import { DEFEAT_DELAY, SINK_S } from './respawn'
import { ExitRun, ExitCamera, planExit, newExitPose, PAD_R, type ExitEvent, type ExitHost } from './exitRun'
import { cineWorld, type CineWorld, type CineBox } from './cineCam'
import { FreezeDirector, type FreezeKind, type FreezeSpec } from './freezeCam'
import { Training, TUTORIAL_TRAINING, steppedToward, type TrainHost, type TrainId } from './training'
import { BossArena, type ArenaHost } from './bossArena'
import type { BossCrane } from './bossCrane'
import type { CoreDescent } from './coreDescent'
import type { GrandMaster } from './grandMaster'
import { bossHpMul, PROGRESS_HP } from './adaptive'
import { LessonHologram, TargetArrow, ArmHologram, type HoloId } from '../fx/lessonHologram'
import { tickLava } from '../models/lava'
import { Shatter } from '../fx/shatter'
import { wantsKillCam, KILLCAM_DUR, KILLCAM_HAZARD_R, KILLCAM_ALERT_R } from './killCam'
import { killCamsEnabled, setKillCamsEnabled } from '@/use/useKillCam'
import {
  BeamInCamera, beamInPose, newBeamInPose, padPlateLift, BEAM_IN_COLUMN, BEAM_IN_DROP, BEAM_IN_END, BEAM_IN_LAND, BEAM_IN_SKIP_AFTER
} from './beamIn'
import { updateBoss, syncBossVisual, startBossIntro, BOSS_INTRO_T, bossRoomOf } from './bosses'
import { WeaponSystem } from './weapons'
import { WEAPONS, type WeaponId } from '../data/weapons'
import type { BossDef } from '../data/bosses'
import { perfFlag } from '@/use/perfVariants'
import { roomCenter, cellCenter, corridorMouth, type Room } from '../world/levelGen'
import { Locator, type LocatorInput } from './locator'
import { generateClimb } from '../world/climbGen'
import { loadStage } from '../world/stages/load'
import { mulberry32 } from '../world/rng'
import { generateWakeUpCall } from '../world/stages/tutorial'
import { buildClimbLevel } from '../world/climbMesh'
import { ClimbRun, walkBlend } from './climb'
import { spawnClimb } from './climbSpawn'
import { BorrowedRun, planBorrowed, secretWeapon } from './borrowed'
import { Fumble, isHardHit, strayDir, FUMBLE_PANIC } from './fumble'
import { buildWeaponCapsule } from '../models/weaponCapsule'

export interface MissionSetup {
  sector: SectorId
  seed: number
  rooms: number
  boss: boolean
  enemyLevel: number
  encounters: EncounterTable
  stats?: PlayerStats
  /** First mission: gentle first room, softer damage until the mini-boss. */
  tutorial?: boolean
  /** A Tower Run: the climb's map (`world/climbGen.ts`), floor heights, its
   *  own cast, the sector's Core Master at the foot of the tower. */
  climb?: boolean
  /** A platform stage (`world/stages/`): the sector whose stage is built.
   *  Runs as a climb (`climb` is set with it): the same terrain, feet and
   *  hazards, plus the stage's own mechanics (`sim/stageFeatures.ts`). */
  stage?: SectorId
  lookSens?: number
  quest?: Quest
  snapshot?: MissionSnapshot | null
}

/** Build a mission setup from a quest (sector theme, enemy table, level). */
export const setupFromQuest = (quest: Quest, snapshot: MissionSnapshot | null): MissionSetup => {
  const sector = SECTOR_BY_ID[quest.sector]
  return {
    sector: quest.sector,
    seed: quest.seed,
    rooms: quest.rooms,
    boss: quest.template === 'boss' || quest.template === 'tutorial',
    enemyLevel: quest.level,
    encounters: sector.encounters,
    stats: computeStats(),
    tutorial: quest.template === 'tutorial',
    climb: quest.template === 'climb' || quest.template === 'stage' || quest.template === 'tutorial',
    stage: quest.template === 'stage' ? quest.sector : undefined,
    quest,
    snapshot
  }
}

/** A held gate's red judder on a refusal (s). */
const DOOR_SHAKE = 0.45
/** A rolling barrel flattens Flux this long (s): no moving, the view on the
 *  floor, a boing as he pops back up. */
export const FLAT_FOR = 1
/** The flattened eye height (m). */
const FLAT_EYE = 0.45

/** The slide lesson's Stomper holds at the top of its leap (s into its 0.7 s
 *  arc) until the player slides. */
const SLIDE_CUE_AT = 0.33
/** The gel hologram shows within this of its spot (m), once its lesson began. */
const GEL_HOLO_NEAR = 9
/** The checklist's arrow toward a lesson stays up this long (s). */
const LESSON_POINT_FOR = 6
/** The tutorial's false wall sinks over this long (s). */
const FALSE_WALL_SINK = 1.2
/** Off the pad this far (m) before a beam lesson's drones come. */
const BEAM_MOVE = 1.2
/** Which walkthrough step runs which lesson room. */
const TRAIN_OF: Partial<Record<string, TrainId>> = { charge: 'charge', block: 'block', slide: 'slide', gap: 'gap' }
/** …and which hologram stands in it (the crate and chest rooms have one too). */
const HOLO_OF: Partial<Record<string, HoloId>> = { ...TRAIN_OF, crate: 'crate', chest: 'chest' }
/** A shot opens a closed (not held) door within this reach (m) it is aimed at. */
const SHOT_DOOR_R = 10
/** Hazards on machines: half the share they take from Flux, once a burst. */
const HAZARD_MACHINE_SHARE = 0.5
const HAZARD_CD = 0.8
/** The arena's light, burning low as the boss falls. */
const ARENA_RED = new Color('#ff5a3a')
/** A hazard's first-hit freeze-frame (s). */
const TRAP_CAM_DUR = 1.5
/** The pit rescue: its length with a spiked floor and without (s), the
 *  impact before Atlas grabs, the grab, the lift; the footing trail. */
/** How close Flux comes to a boss shutter before it opens by itself (m). */
export const BOSS_DOOR_AUTO = 4
export const RESCUE_SPIKES = 3.9
export const RESCUE_VOID = 2.7
export const RESCUE_IMPACT = 1.2
export const RESCUE_GRAB = 1.9
export const RESCUE_LIFT = 1.5
/** In a rescue Atlas is drawn this much bigger, this high over Flux (m). */
const RESCUE_ATLAS_SCALE = 1.6
export const RESCUE_ATLAS_Y = 2.9
const RESCUE_CLEAR = 1.6
const FOOT_EVERY = 0.25
const FOOT_KEEP = 24

interface DoorState {
  id: number
  mesh: DoorMesh
  open: number
  opening: boolean
  closing: boolean
  locked: boolean
  /** A tutorial walkthrough gate not yet earned: locked, and not for the
   *  interact button either (unlike the sealed boss shutter). */
  held: boolean
  /** A refused push: the panels judder red for this long (s). */
  shakeT: number
  slab: Slab
  x: number
  z: number
  /** The floor under it (the climb's doors stand at their corridor's height). */
  y: number
  axis: 'x' | 'z'
  cellI: number
  cellJ: number
  from: number
  to: number
}

export interface PlayerState {
  x: number
  z: number
  px: number
  pz: number
  vx: number
  vz: number
  yaw: number
  pitch: number
  path: Array<[number, number]> | null
  bob: number
  bobAmp: number
  /** Feet height and its value a step ago (render interpolation). 0 on a
   *  flat map; the climb's floors, lifts and ladders move it (`sim/climb.ts`,
   *  which owns the fields below). The eye is always y + EYE_H. */
  y: number
  py: number
  vy: number
  ground: boolean
  ladder: number
  plat: number
  air: number
  safeY: number
  mantle: number
  mx: number
  mz: number
}

const _v2 = new Vector2()
const _v3 = new Vector3()
const _qy = new Quaternion()
const _e = new Euler()
const _up = new Vector3(0, 1, 0)
/** Scratch for Atlas (`renderAtlas`, `followAtlas`). */
const _v = new Vector3()
/** The lesson hologram's glyph spot (world, then screen). */
const _holoAt = { x: 0, y: 0, z: 0 }
const _holoPt = { x: 0, y: 0, visible: false }
// Portal-culling scratch (no per-frame allocation).
const _frustum = new Frustum()
const _pv = new Matrix4()
const _portal = new Sphere()
const _stray: [number, number, number] = [0, 0, 0]
/** The fumbling muzzle's sputter colours (`syncViewmodel`). */
const FUMBLE_SPARKS = ['#ff5a3a', '#ffd84a', '#7ff4ff', '#ffffff']
/** Under this share of health, the heartbeat plays. */
const LOW_HP_BEAT = 0.25
/** The machine kinds Atlas has a scan line for (`atlas.scan.<kind>`). */
const SCAN_KINDS: ReadonlySet<string> = new Set(['hardhat', 'trooper', 'heli', 'hopper', 'roller', 'brute', 'turret', 'golem', 'polar', 'warden', 'hornet', 'stalker', 'puffer', 'mole'])
/** True the first time ever a teaching line's flag is asked (kept in the profile's tips), false after. */
const firstEver = (flag: string): boolean => {
  if (profile.tips[flag]) return false
  markTip(flag)
  return true
}
/** Where the profile keeps a once-ever Atlas line (`AtlasMemory`): the scans keep the flags they always had. */
const atlasFlag = (id: AtlasLine): string => {
  if (id.startsWith('scan.')) {
    const what = id.slice(5)
    return what === 'fire' || what === 'ice' || what === 'volt' || what === 'wind' ? `atlas:scan:coat:${what}` : `atlas:scan:${what}`
  }
  return id === 'hint.locator' ? 'atlas:locator' : `atlas:said:${id}`
}
const ATLAS_MEMORY: AtlasMemory = {
  seen: (id) => !!profile.tips[atlasFlag(id)],
  mark: (id) => markTip(atlasFlag(id))
}
/** A blackout's sky and fog, and a lightning flash's. */
const NIGHT = new Color('#04050b')
const FLASH_WHITE = new Color('#e8eeff')
/** The Overload's violet (the prototype tier's), mixed into the core as it builds. */
const OVERLOAD_VIOLET = new Color('#b46cff')
/** After a manual look, the soft lock-on stands aside this long (s). */
const LOCK_YIELD = 1.1
/** A lock-on target out of sight keeps the lock this long (s), so a machine
 *  passing behind a pillar is still the target when it comes out: a rotor
 *  drone orbiting behind one 3 m away is hidden for about 0.9 s. Meanwhile
 *  `Mission.targetHidden` is set: the HUD dims the frame and bracket, and the
 *  soft lock stops turning the camera toward it. */
export const LOCK_GRACE = 1.2
/** A hold let go before the first charge level after this long (s) was a
 *  try at a charge: a lesson in the sights shakes its glyph. */
const EARLY_HOLD = 0.2
/** An enemy within this angle of the crosshair (rad) is "in the sights". */
const SIGHT_ANGLE = 0.22
/** `hud.combat` counts any awake machine within 22 m, walls or not, and a
 *  machine never falls back asleep: in a labyrinth one that lost the player
 *  a corridor over held it on for minutes. The floor trail and the locator
 *  wait only for a FIGHT: an awake machine in sight, this close (m), or hit
 *  this recently (s)… */
const FIGHT_NEAR = 8
const FIGHT_HURT = 3
/** …and come back once none has been for this long (s): a machine ducking
 *  behind a pillar does not flash them on. */
const FIGHT_LINGER = 1.5
/** A trap parks for a fight only with Flux or a fighting machine this close
 *  to it (m): a fight rooms away leaves the corridor ahead running. */
const TRAP_FIGHT_R = 12
/** How many doors deep the view reaches. Two covers a room seen through the
 *  next room's far door; anything deeper is past the fog anyway. */
const PORTAL_DEPTH = 2
/** Baseline arm for the perf A/B runner (`?perf=noportal`): the old
 *  distance-only culling. See PERF-LEDGER.md. */
const NO_PORTAL = perfFlag('noportal')
/** Back from a pit, the stick is ignored this long (s). */
const PIT_HOLD = 0.55
/** From Flux going down to the defeat modal (s): never before the GAME
 *  OVER banner has had its hold. */
export { DEFEAT_DELAY, RESPAWN_AFTER, SINK_S } from './respawn'
/** Slide cooldown (s), start to start, before the Slide Boosters cut it
 *  (`stats.slideCdMul`). Long enough that the dodge is a read, not a spam. */
const SLIDE_CD = 1.5
/** No Slide Boosters rank may cut the cooldown below this (s): at rank 3 the
 *  plain 1.5 × 0.55 = 0.825 s let the dodge be spammed again. */
const SLIDE_CD_MIN = 1
/** After a parry the shield stays down this long (s) with block still held:
 *  the counter window, inside the parried machine's stun (1.6 s and up). */
const RIPOSTE = 1.2

const angDiff = (a: number, b: number): number => {
  let d = a - b
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return d
}

/** The exit cutscene's cast (`sim/exitRun.ts`): built hidden with the sector. */
interface ExitView {
  drone: ExitDroneView
  hero: Rig
  heroRoot: Group
  motion: EnemyMotion
  heroShadow: Mesh
  droneShadow: Mesh
}

/** The flattened eye height with `left` seconds of the flatten to go: down in
 *  a snap, held, then back up with an overshoot (the boing). */
export const flatEye = (left: number): number => {
  const t = FLAT_FOR - left
  if (t < 0.08) return EYE_H + (FLAT_EYE - EYE_H) * (t / 0.08)
  if (left > 0.3) return FLAT_EYE + Math.sin(t * 30) * 0.03 * Math.max(0, 1 - t * 2)
  const k = 1 - left / 0.3
  return FLAT_EYE + (EYE_H - FLAT_EYE) * (k + Math.sin(k * Math.PI) * 0.35)
}

export class Mission implements GameMode, CombatHost, ObjectiveHost, ExitHost, TrainHost, ArenaHost {
  scene = new Scene()
  camera = new PerspectiveCamera(70, 1, 0.05, SKY_FAR)
  vmScene = new Scene()
  vmCamera = new PerspectiveCamera(50, 1, 0.01, 10)
  map!: MapData
  nav!: Nav
  theme: Theme
  level!: LevelMeshes
  /** The city round the level and the traffic in its sky (`world/cityscape.ts`). */
  city: Cityscape | null = null
  /** Atlas, Flux's AI companion: what it says (`sim/atlas.ts`), and its two
   *  bodies — in the viewmodel layer during play (it peeks into the top left
   *  of the view and can never clip a wall), in the world beside Flux in the
   *  beam-in and the exit. */
  atlas: AtlasDirector | null = null
  private atlasVm: Rig | null = null
  private atlasWorld: Rig | null = null
  /** Machines fall apart into their parts, which lie a while and sink (#105). */
  private shatter: Shatter | null = null
  /** Flux's body is sinking (the respawn's shot is on). */
  private sinking = false
  /** Atlas's tractor beam in a pit rescue (#282): a cone of light from it
   *  down to Flux, from the grab through the lift. */
  private tractor: Mesh | null = null
  private atlasWorldAt = new Vector3()
  private atlasWorldSet = false
  private atlasTick: AtlasTick = {
    playing: false, combat: false, hp01: 1, tanks: 0, we01: -1, level: 1, objectiveDone: false, trapNear: -1, plateNear: false
  }
  private cityDone = false
  doors: DoorState[] = []
  /** Per room group: visible this frame (portal culling). */
  private roomVis = new Uint8Array(0)
  private cullAdded: number[] = []
  pad!: PadMesh
  vm!: Viewmodel
  player!: PlayerState
  input: Input
  setup: MissionSetup
  stats: PlayerStats
  combat: CombatPlayer
  enemies: Enemy[] = []
  fx!: Particles
  markers = new FloorMarkers()
  shocks = new ShockRings()
  system!: CombatSystem
  time = 0
  phaseT = 0
  hitStop = 0
  bolts = 0
  xp = 0
  kills = 0
  chestsOpened = 0
  itemsFound: Item[] = []
  objects!: MissionObjects
  quest: Quest | null = null
  private snapT = 0
  private dirty = false
  private interact: ReturnType<MissionObjects['nearestInteractable']> | { kind: 'door'; ref: DoorState } | null = null
  private finished = false
  weapons!: WeaponSystem
  /** The borrowed-weapon capsules and the third button's charges
   *  (`sim/borrowed.ts`): this mission only, never the profile. */
  borrowed!: BorrowedRun
  private bossRoom: Room | null = null
  private boss: Enemy | null = null
  private bossStarted = false
  /** A voiced story scene running (`story/vexScene.ts`, #117), if any. */
  private storyScene: StoryScene | null = null
  /** Scans known said in this save (`noteSighting`): one profile lookup each. */
  private readonly scanned = new Set<AtlasLine>()
  /** A scene waiting for Atlas's current line to end (the landing's "Touchdown!"). */
  private pendingScene: (() => void) | null = null
  /** The Mk-I fight's beats: phase 2 seen, the attack in its wind-up, the elements called. */
  private mk1Signal = false
  private mk1Tele = ''
  private readonly mk1Called = new Set<string>()
  private bossBarT = 0
  /** The yellow "the goal is over there" triangle (`sim/locator.ts`). */
  private locator = new Locator()
  private locatorIn: LocatorInput = { playing: false, quiet: false, hasGoal: false, dist: 0, boss: false, finished: false }
  /** Where the triangle points and how solid it is; the HUD projects it per
   *  frame (`ObjectiveLocator.vue`). */
  readonly locatorPoint = { x: 0, y: 0, z: 0, alpha: 0 }
  /** The boss shutter's klaxon has sounded (once per mission). */
  private bossWarned = false
  private vmFlash = 0
  private vmFlashColor = '#ffffff'
  /** The wordless control coach (`sim/coach.ts`). */
  readonly coach = new Coach()
  private coachCtx: CoachContext = {
    time: 0, family: 'mouse', playing: false, combat: false, aimCandidate: false, teleBlock: false, teleRed: false,
    hp01: 1, tanks: 0, hasWeapon: false, canInteract: false, quiet: false, gelLesson: false, blockLesson: false
  }
  /** Scene-built lessons: the charge drone, crates, the special weapon, the gel. */
  lessons!: LessonDirector
  private lessonTick: LessonTick = { playing: false, combat: false, controls: false, hp01: 1, tanks: 0 }
  private lessonSig = ''
  /** The tutorial's guided walk along the main path (`sim/walkthrough.ts`);
   *  null in every other mission. */
  walk: Walkthrough | null = null
  /** "Finish the lesson" at a held walkthrough door (`sim/doorPrompt.ts`). */
  readonly doorPrompt = new DoorPrompt()
  private doorTick: DoorTick = { time: 0, playing: false, combat: false, press: -1, shot: -1, near: -1, close: -1 }
  /** What the door prompt's HUD draws (`DoorPrompt.vue`, per frame): its
   *  opacity and pulse, the door's glyph anchor and need, and the lesson
   *  the arrow points to (`goal`: false when there is none to point at). */
  readonly doorView = { alpha: 0, pulse: 0, x: 0, y: 0, z: 0, need: '' as WalkNeed | '', label: 'walk.finishLesson', weapon: '', goal: false, gx: 0, gz: 0 }
  /** Corridor traps (`sim/traps.ts`): flame jets, swinging blades, and the
   *  tutorial's Repair Gel plate. */
  traps!: TrapSystem
  private trapTick: TrapTick = { playing: false, combat: false, fightAt: (x, z) => this.fightNear(x, z) }
  /** The climb's moving parts and Flux's feet on it (`sim/climb.ts`); null
   *  on every labyrinth map, which never leaves y = 0. */
  climb: ClimbRun | null = null
  /** After a pit fall: the stick is ignored this much longer (s). */
  private pitHold = 0
  /** A hard hit shook the charge loose (`sim/fumble.ts`): the flailing arm,
   *  the stun, the cooldown. */
  readonly fumble = new Fumble()
  /** Yellow floor chevrons to the main objective (in the tutorial walkthrough:
   *  to its next lesson, `updateTrail`). */
  trail!: ObjectiveTrail
  private trailIn: TrailInput = { enabled: false, px: 0, pz: 0, target: null, time: 0 }
  /** When the player last steered the camera (drag / keys). */
  private manualLookAt = -10
  private hintsSig = ''
  private raycaster = new Raycaster()
  private marker!: Mesh
  private markerT = 0
  private shakeAmt = 0
  /** A boss's pull on Flux (`World.pull`): toward (pullX, pullZ) at pullS m/s for pullT s. */
  private pullX = 0
  private pullZ = 0
  private pullS = 0
  private pullT = 0
  private lookSens: number
  private vmRoot = new Group()
  private hudT = 0
  private aimCandidate = false
  private targetLostT = 0
  /** The lock-on target is out of sight, held only by `LOCK_GRACE`: read
   *  per frame by the bracket (`Crosshair.vue`), mirrored to `hud`. */
  targetHidden = false
  private respawnT = 0
  private deathT = 0
  private combatEndT = 0
  /** Counts down from FIGHT_LINGER once no machine is fighting (see FIGHT_NEAR). */
  private fightT = 0
  /** A fight is on: the trail and the locator stand down, traps near it park
   *  (`updateTargeting`). */
  private get fighting(): boolean { return this.fightT > 0 }
  /** Flux or an awake machine within TRAP_FIGHT_R of (x, z). Allocation-free. */
  private fightNear(x: number, z: number): boolean {
    const r2 = TRAP_FIGHT_R * TRAP_FIGHT_R
    const p = this.player
    if ((p.x - x) ** 2 + (p.z - z) ** 2 < r2) return true
    for (const e of this.enemies) {
      if (!e.awake || e.state === 'dead' || e.offstage || e.dormant) continue
      if ((e.x - x) ** 2 + (e.z - z) ** 2 < r2) return true
    }
    return false
  }
  /** DEV: override the camera ([x,y,z, lookX,lookY,lookZ]) for inspection. */
  debugCam: [number, number, number, number, number, number] | null = null
  /** The exit: the lab's drone fetches Flux (`sim/exitRun.ts`). */
  readonly exit = new ExitRun(this)
  private exitPose = newExitPose()
  private exitCam = new ExitCamera()
  private exitView: ExitView | null = null
  /** Freeze-frame shots: kill-cam, trap hits, Atlas's rescue, lesson cards. */
  readonly freeze = new FreezeDirector()
  /** Machine kinds shown in a kill-cam this mission (once per kind). */
  private readonly killCamSeen = new Set<string>()
  private killCamCount = 0
  /** Hazard kinds whose hit has had its freeze-frame this mission. */
  private readonly trapCamSeen = new Set<string>()
  /** Flattened by a barrel: seconds left (`FLAT_FOR`); and the hazard of the
   *  trap shot on screen (the barrel's shows him squashed flat). */
  flatT = 0
  private trapCamHazard = ''
  /** The lava pits' cells (x, surface y, z): embers rise off them near Flux. */
  private lavaCells: Array<[number, number, number]> | null = null
  /** Lesson rooms: intro, try (`sim/training.ts`). */
  readonly training: Training = new Training(this)
  /** The lesson rooms' holograms doing the move on a loop
   *  (`fx/lessonHologram.ts`), each up while Flux is in its room (`room` -1:
   *  the gel's, near its spot once its lesson began). */
  private holos: Array<{ holo: LessonHologram; room: number; x: number; z: number }> = []
  /** The big yellow arrows over the lesson targets (two at most at once). */
  private readonly targetArrows: TargetArrow[] = []
  /** The slide lesson's freeze: the Stomper held at the top of its leap until
   *  the player slides; and the leap already held (once per leap). */
  private slideCue: Enemy | null = null
  /** The held leap has been answered once: from then a slide counts. */
  private slideCueDone = false
  private slideCued: Enemy | null = null
  private gelHoloOn = false
  /** The weapon lesson room behind the boss (`map.exit`): its pedestal (lit
   *  once the lesson is done: walking onto it beams Flux out), the weapon
   *  copied from the boss, whether its lesson has begun, and the arm
   *  hologram shown as the boss falls. */
  private exitPad: PadMesh | null = null
  private exitWeapon: WeaponId | null = null
  private exitLit = false
  private exitStarted = false
  private exitShut = false
  private armHolo: ArmHologram | null = null
  /** Where the chevrons lead after the boss (#110), reused. */
  private readonly exitAim = { x: 0, z: 0, kind: 'objective' as const }
  /** Where the lesson's subject is (the target arrow, the slide freeze's view);
   *  set by whoever runs the room (the walkthrough, a weapon lesson). */
  trainSpot: { x: number; y: number; z: number } | null = null
  /** Each lesson room's middle in this mission (the checklist's arrows and
   *  the lesson's spotlight fall back to it). */
  readonly lessonSpots = new Map<TrainId, { x: number; y: number; z: number }>()
  /** The checklist's "which way": a lesson's room, until `until`. */
  lessonPointer: { x: number; z: number; until: number } | null = null
  private checklistSig = ''
  /** Atlas's pit rescue under way (`pitFall`): where Flux fell, the pit's
   *  floor if it has one (spikes: he lands on it first), where he goes. */
  private rescue: {
    fx: number; fy: number; fz: number; bottom: number; spikes: boolean
    tx: number; ty: number; tz: number; tyaw: number
  } | null = null
  /** Recent solid footing (x, z, y, yaw), newest last: the rescue sets Flux
   *  down on the nearest one clear of the pit's edge. */
  private readonly footing: Array<[number, number, number, number]> = []
  private footT = 0
  /** The sky light (the boss fight's set dressing dims and reddens it). */
  private hemi: HemisphereLight | null = null
  private readonly hemiBase = new Color()
  /** The stage's light (`stageDark`, `skyFlash`): the sun, the sky light's
   *  level as the arena dressing wants it, this frame's darkness and the
   *  flash fading out, and the sky and fog colours as built. */
  private sun: DirectionalLight | null = null
  private sunBase = 1
  private arenaLight = 1.05
  private darkWant = 0
  private dark = 0
  private flash = 0
  private readonly skyBase = new Color()
  private readonly fogBase = new Color()
  /** The boss arena's props, cover and anti-cheese (`sim/bossArena.ts`). */
  arena: BossArena | null = null
  /** The Scrapper's magnet crane (`sim/bossCrane.ts`), in his arena only. */
  crane: BossCrane | null = null
  /** Vex's Core Descent (`sim/coreDescent.ts`), in the Fortress only. */
  descent: CoreDescent | null = null
  /** The Grand Master Bot (`sim/grandMaster.ts`): after Vex, on the roof. */
  finale: GrandMaster | null = null
  /** The low-health heartbeat's countdown (s). */
  private heartT = 0
  /** The molten Core in the ring's pit (the Core Descent's last stage). */
  private coreGlow: Mesh | null = null
  /** A snapshot's Core Descent stage, applied once the climb has placed Flux. */
  private pendingVex: { stage: number; hp: number } | null = null
  /** Doors hidden behind a false wall until released (the tutorial's first):
   *  the wall stands in the mouth of the door's corridor, so the room is shut. */
  private readonly falseWalls = new Map<number, { mesh: Object3D; slab: Slab; t: number; x: number; y: number; z: number; tall: number }>()
  /** The gap lesson's take-off and landing arrows (the built tutorial). */
  private gapArrows: Mesh[] = []
  /** A stage's beam-in room: the weapon it teaches before its door opens
   *  (the newest one not yet taught), whether its drones came, its door. */
  private beamTeach: WeaponId | null = null
  private beamStarted = false
  private beamDoorId = -1
  /** Atlas is flying the lesson intro's arc (in and out). */
  private atlasSwoop = false
  /** The beam-in (`sim/beamIn.ts`): its pose, camera, and whether he landed. */
  private beamPose = newBeamInPose()
  private beamCam = new BeamInCamera()
  private beamLanded = false
  /** `phaseT` one step back, for the render's interpolation. */
  private beamPrevT = 0
  /** The level as solid space for the cutscene camera (`sim/cineCam.ts`). */
  cine!: CineWorld
  /** Until the rotor hum's next pulse (s). */
  private humT = 0
  /** Core Masters whose fall has had its banner (once each). */
  private bossBannered = new Set<Enemy>()

  /** The cheap part only. The world is built by `Mission.create` — async and
   *  time-sliced, so nothing ever builds a sector in one frozen task. */
  private constructor(setup: MissionSetup, input: Input) {
    this.setup = setup
    this.input = input
    this.lookSens = setup.lookSens ?? 1
    this.stats = setup.stats ?? baseStats()
    const s = this.stats
    this.combat = {
      hp: s.maxHp, maxHp: s.maxHp, we: s.maxWe, maxWe: s.maxWe, power: s.maxPower, maxPower: s.maxPower,
      powerDelay: 0, charge: 0, charging: false, fireCd: 0, blocking: false, blockPressedAt: -10, riposteT: 0, guardBroken: 0,
      slideT: 0, slideCd: 0, slideDX: 0, slideDZ: 0, iframes: 0, hurtT: 0, target: null, recoil: 0, dead: false,
      lastStandUsed: false
    }
    this.theme = THEMES[setup.sector]
  }

  /**
   * Build a mission: map, level meshes, doors, props, the cast, the arm
   * cannon. Time-sliced (see `engine/slicer.ts`), so the boot loader and the
   * hub → mission beam keep painting while it runs; `onProgress` reports
   * 0..1 as each stage lands.
   */
  static async create(setup: MissionSetup, input: Input, onProgress: (p01: number) => void = () => {}): Promise<Mission> {
    const m = new Mission(setup, input)
    await m.build(createSlicer(12), onProgress)
    onProgress(1)
    return m
  }

  private async build(slice: Slice, onProgress: (p01: number) => void): Promise<void> {
    const setup = this.setup
    this.map = setup.tutorial
      ? generateWakeUpCall(setup.seed)
      : setup.stage
      ? await loadStage(setup.stage, setup.seed)
      : setup.climb ? generateClimb(setup.seed) : generateMap({ seed: setup.seed, rooms: setup.rooms, boss: setup.boss })
    this.nav = createNav(this.map)
    onProgress(0.04)
    await slice()
    const levelProgress = (f: number) => onProgress(0.04 + f * 0.51)
    this.level = setup.climb
      ? await buildClimbLevel(this.map, this.theme, slice, levelProgress)
      : await buildLevel(this.map, this.theme, slice, levelProgress)
    this.roomVis = new Uint8Array(this.level.rooms.length)
    this.scene.add(this.level.root)
    this.scene.add(this.level.sky)
    onProgress(0.55)
    await slice()
    this.city = await buildCityscape(this.map, this.theme, slice)
    this.scene.add(this.city.root)
    await slice()

    const th = this.theme
    this.scene.background = new Color(th.skyBottom)
    this.scene.fog = new Fog(new Color(th.fog), th.fogNear, th.fogFar)
    const hemi = new HemisphereLight(new Color(th.hemiSky), new Color(th.hemiGround), 1.05)
    this.hemi = hemi
    this.hemiBase.copy(hemi.color)
    const sun = new DirectionalLight(new Color(th.sun), th.sunIntensity)
    sun.position.set(0.45, 1, 0.3)
    this.scene.add(hemi, sun)
    this.sun = sun
    this.sunBase = th.sunIntensity
    this.skyBase.set(th.skyBottom)
    this.fogBase.set(th.fog)

    for (const d of this.map.doors) {
      // The corridor lies on the -dir side of the frame (local Z after the turn).
      const mesh = buildDoor(th, d.boss, d.dir === 1 ? -1 : 1)
      const [fx, fz] = doorFramePos(d)
      const fy = floorAt(this.nav, (d.i + 0.5) * CELL, (d.j + 0.5) * CELL)
      mesh.root.position.set(fx, fy, fz)
      mesh.root.rotation.y = d.axis === 'x' ? Math.PI / 2 : 0
      this.scene.add(mesh.root)
      const half = CELL / 2
      const thin = 0.22
      const slab: Slab = d.axis === 'x'
        ? { minX: fx - thin, maxX: fx + thin, minZ: fz - half, maxZ: fz + half, active: true }
        : { minX: fx - half, maxX: fx + half, minZ: fz - thin, maxZ: fz + thin, active: true }
      this.nav.slabs.push(slab)
      this.nav.pathBlock[d.j * this.map.w + d.i] = d.boss ? 2 : 1
      this.doors.push({
        id: d.id, mesh, open: 0, opening: false, closing: false, locked: d.boss, held: false, shakeT: 0, slab, x: fx, z: fz, y: fy, axis: d.axis, cellI: d.i, cellJ: d.j, from: d.from, to: d.to
      })
      await slice()
    }
    onProgress(0.62)

    this.pad = buildTeleporter(th)
    const [sx, sz] = [this.map.start.x, this.map.start.z]
    this.pad.root.position.set(sx, 0, sz)
    this.scene.add(this.pad.root)

    this.marker = new Mesh(
      new RingGeometry(0.34, 0.5, 32),
      new MeshBasicMaterial({ color: new Color(PAL.glowCyan), transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false })
    )
    this.marker.rotation.x = -Math.PI / 2
    this.marker.position.y = 0.03
    this.scene.add(this.marker)

    const sy = floorAt(this.nav, sx, sz)
    this.player = {
      x: sx, z: sz, px: sx, pz: sz, vx: 0, vz: 0, yaw: this.map.start.yaw, pitch: -0.06,
      path: null, bob: 0, bobAmp: 0,
      y: sy, py: sy, vy: 0, ground: true, ladder: -1, plat: -1, air: 0, safeY: sy, mantle: 0, mx: 0, mz: 0
    }

    // FX layers
    this.fx = new Particles(1000)
    this.scene.add(this.fx.points, this.markers.root, this.shocks.root)
    // At the scene root (room culling never hides it), before the precompile.
    this.trail = new ObjectiveTrail(this.scene, this.nav)
    this.system = new CombatSystem(this)
    if (setup.climb) {
      // Lifts, crushers, scrap balls, reward ledges; floor markers lie on
      // the ledge they warn about.
      this.climb = new ClimbRun(this, setup.enemyLevel)
      this.markers.floorY = (x, z) => floorAt(this.nav, x, z)
    }

    // Mission objects + objective, then the cast (deterministic order: the
    // resume snapshot refers to enemies by index).
    this.quest = setup.quest ?? null
    this.objects = new MissionObjects(this, setup.quest ?? {
      id: 'dev', kind: 'job', template: 'purge', sector: setup.sector, seed: setup.seed, level: setup.enemyLevel,
      target: null, count: 1, rooms: setup.rooms, reward: { xp: 0, bolts: 0, rarityBias: 0 }
    })
    // The tutorial is a guided walk: its path, its chest, a scripted cast.
    const plan = setup.tutorial ? planWalkthrough(this.map) : null
    const chest = plan ? this.walkChest(plan) : null
    onProgress(0.68)
    await slice()
    const spawned = (f: number) => onProgress(0.68 + f * 0.24)
    this.enemies = plan
      ? await spawnTutorial(this.map, this.nav, plan, setup.enemyLevel, {
        chestRooms: new Set(this.objects.chests.map(c => roomAt(this.map, c.x, c.z))), slice, onProgress: spawned
      })
      : setup.climb
        ? await spawnClimb(this.map, setup.encounters, setup.enemyLevel, { slice, onProgress: spawned })
        : await spawnEncounters(this.map, setup.encounters, setup.enemyLevel, { slice, onProgress: spawned })
    onProgress(0.92)
    this.objects.setupEnemyObjectives(this.enemies, (e) => this.enemies.push(e))
    for (const e of this.enemies) this.scene.add(e.root, e.shadow, e.ring)
    this.bossRoom = bossRoomOf(this.map.rooms)
    this.boss = this.enemies.find(e => e.boss) ?? null
    // Adaptive difficulty (`sim/adaptive.ts`): a boss keeps up with a player
    // geared far past the reference; machines toughen a little with every
    // Core Master beaten, so upgrades stay needed.
    if (this.boss) {
      const mul = bossHpMul(this.stats, setup.enemyLevel)
      this.boss.maxHp = Math.round(this.boss.maxHp * mul)
      this.boss.hp = this.boss.maxHp
    }
    for (const e of this.enemies) if (!e.boss) this.toughen(e)
    // New Game+ (`sim/ngPlus.ts`): every machine and boss a cycle tougher,
    // bosses quicker. The tutorial is never replayed in a New Game+.
    const ng = this.setup.tutorial ? 0 : profile.world.ngPlus
    if (ng > 0) {
      const hpMul = ngHpMul(ng)
      for (const e of this.enemies) {
        e.maxHp = Math.round(e.maxHp * hpMul)
        e.hp = e.maxHp
        if (e.boss) { e.tempo = ngTempo(ng); e.followUp = ngFollowUp(ng) }
      }
    }
    if (this.boss && this.bossRoom) this.arena = new BossArena(this, this.bossRoom, (setup.quest?.seed ?? 1) ^ 0x51ab)
    // The Scrapper fights under his magnet crane (#108).
    // (Loaded with the Scrapper's arena only: no other map pays for it.)
    if (this.boss?.bossId === 'scrapper' && this.bossRoom) {
      const { BossCrane } = await import('./bossCrane')
      this.crane = new BossCrane(this, this.bossRoom)
    }
    // Vex is fought on the roof, in the reactor hall and on the Core ring (#109).
    const stages = this.map.terrain?.bossStages
    if (this.boss && stages && stages.length > 1) {
      const self = this
      // The Fortress's finale is its own chunk: loaded with the Fortress only.
      const [{ CoreDescent }, { GrandMaster }] = await Promise.all([import('./coreDescent'), import('./grandMaster')])
      this.descent = new CoreDescent({
        get player() { return self.player },
        get combat() { return self.combat },
        rooms: this.map.rooms,
        markers: this.markers,
        shocks: this.shocks,
        fx: this.fx,
        setBossRoom: (r) => { self.bossRoom = r },
        keepRetryPoint: () => self.keepRetryPoint(),
        stageDark: (k) => self.stageDark(k),
        skyFlash: (a) => self.skyFlash(a),
        say: (l) => self.say(l),
        sfx: (n, x, z) => self.sfx(n, x, z),
        shake: (a) => self.shake(a),
        hitPlayer: (e, d, o) => self.hitPlayer(e, d, o),
        hurtMachines: (c, x, z, hit) => self.hurtMachines(c, x, z, hit)
      }, stages)
      // The Grand Master (#101): it wakes when Vex falls. A climb feature, last
      // in the list, so its state rides in the climb's save.
      const roof = this.map.rooms[stages[0]!]
      if (roof && this.climb && this.boss) {
        const vex = this.boss
        this.finale = new GrandMaster({
          get player() { return self.player },
          get combat() { return self.combat },
          vex,
          get dmg() { return vex.dmg },
          markers: this.markers,
          shocks: this.shocks,
          fx: this.fx,
          propParent: (x, z) => self.propParent(x, z),
          sfx: (n, x, z) => self.sfx(n, x, z),
          say: (l) => self.say(l),
          shake: (a) => self.shake(a),
          hitPlayer: (e, d, o) => self.hitPlayer(e, d, o),
          hurtMachines: (c, x, z, hit) => self.hurtMachines(c, x, z, hit),
          fireEnemyShot: (e, x, y, z, dx, dy, dz, sp, d, b) => self.system.spawnEnemyShot(e, x, y, z, dx, dy, dz, sp, d, b),
          spawnWave: (e, x, z, dx, dz, sp, hw, range, d, c) => self.spawnWave(e, x, z, dx, dz, sp, hw, range, d, c),
          pull: (x, z, sp, dur) => self.pull(x, z, sp, dur),
          skyFlash: (a) => self.skyFlash(a),
          keepRetryPoint: () => self.keepRetryPoint(),
          pressed: () => self.input.anyPressed,
          onDefeated: () => self.finaleDone()
        }, roof)
        this.climb.features.push(this.finale)
      }
      // The Core itself, molten in the ring's pit: it breathes (see update).
      const ring = this.map.rooms[stages[stages.length - 1]!]
      if (ring) {
        const cx = (ring.x0 + ring.w / 2) * CELL
        const cz = (ring.z0 + ring.h / 2) * CELL
        // A white-hot heart in an additive orange shell, an energy ring round it.
        const core = new Group()
        core.add(new Mesh(new SphereGeometry(1.3, 24, 16), new MeshBasicMaterial({ color: '#fff1b0', toneMapped: false })))
        this.coreGlow = new Mesh(new SphereGeometry(2.1, 24, 16), new MeshBasicMaterial({
          color: '#ff7a2a', transparent: true, opacity: 0.5, blending: AdditiveBlending, depthWrite: false, toneMapped: false
        }))
        core.add(this.coreGlow)
        const band = new Mesh(new RingGeometry(2.5, 2.75, 48), new MeshBasicMaterial({
          color: '#ffb04a', transparent: true, opacity: 0.7, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false
        }))
        band.rotation.x = -Math.PI / 2
        band.name = 'band'
        core.add(band)
        core.position.set(cx, -1.4, cz)
        this.propParent(cx, cz).add(core)
      }
    }
    if (setup.stage) this.placeStageProps()
    this.weapons = new WeaponSystem(this, profile.hero.weaponXp)
    this.scene.add(this.weapons.root)
    // Before the snapshot (it marks capsules taken) and the precompile.
    this.buildBorrowed()
    this.lessons = new LessonDirector(this, { guided: !!plan })
    if (plan) this.walk = new Walkthrough(this, plan, chest)
    if (setup.snapshot) this.applySnapshot(setup.snapshot)
    if (this.pendingVex && this.descent && this.boss) {
      this.descent.restore(this.boss, this.pendingVex.stage, this.pendingVex.hp)
      this.pendingVex = null
    }
    // Before the precompile: the training drone's materials compile with the
    // sector. Only while the walkthrough's first room is still to learn.
    if (this.walk?.needsDrone) this.lessons.placeTarget()
    this.walk?.start()
    this.setupTraining()
    this.buildTraps()

    await slice()
    // Viewmodel
    this.vm = buildViewmodel(heroColors())
    this.vmRoot.add(this.vm.root)
    this.vmScene.add(this.vmRoot)
    this.vmScene.add(new HemisphereLight(0xffffff, 0x445066, 1.2))
    const vmSun = new DirectionalLight(0xffffff, 1.1)
    vmSun.position.set(-0.4, 1, 0.6)
    this.vmScene.add(vmSun, new AmbientLight(0xffffff, 0.15))
    this.buildExit()
    // Atlas (in the scene from the start: the precompile covers it).
    this.atlasVm = buildAtlas()
    this.atlasVm.root.visible = false
    this.vmScene.add(this.atlasVm.root)
    this.atlasWorld = buildAtlas()
    this.atlasWorld.root.visible = false
    this.tractor = new Mesh(
      new CylinderGeometry(0.28, 0.95, 1, 24, 1, true),
      new MeshBasicMaterial({ color: new Color(PAL.glowCyan), transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false })
    )
    this.tractor.visible = false
    this.scene.add(this.tractor)
    this.scene.add(this.atlasWorld.root)
    const q = setup.quest
    this.atlas = new AtlasDirector({
      tutorial: !!setup.tutorial,
      kind: q?.kind ?? 'job',
      template: q?.template ?? '',
      sector: setup.sector,
      freed: profile.world.bosses.filter(b => b !== 'vexMk1').length,
      firstVisit: q?.kind === 'story' && !vexSeen(`sector:${setup.sector}`),
      variant: profile.questsDone
    }, (key) => playVoice(key), (key) => prefetchVoice(key), firstEver, ATLAS_MEMORY)
    preloadBarks()
    // Lines Atlas says at once, with no queue to load in (#107): warm them now.
    // A lesson's intro (the tutorial's, and the weapon lesson after a Master).
    prefetchVoice('atlas.warn.down')
    const lessons: readonly TrainId[] = setup.tutorial ? ['charge', 'block', 'slide', 'gel', 'gap', 'weapon'] : q?.kind === 'story' ? ['weapon'] : []
    for (const id of lessons) { prefetchVoice(`atlas.train.${id}`); prefetchVoice(`atlas.help.${id}`) }
  }

  /**
   * The exit's cast: the lab's drone and Flux's full body, each with a blob
   * shadow. Hidden until the exit, but in the scene from the start, so the
   * precompile and `warmUp` compile and upload them with the sector and the
   * cutscene's first frame does not hitch. At the scene root: room culling
   * never hides them.
   */
  private buildExit(): void {
    this.cine = cineWorld(this.nav)
    const drone = buildExitDrone()
    const hero = buildHero(heroColors())
    const heroRoot = new Group()
    heroRoot.add(hero.root)
    const heroShadow = makeBlobShadow(0.42)
    const droneShadow = makeBlobShadow(1.05)
    for (const o of [drone.root, heroRoot, heroShadow, droneShadow]) {
      o.visible = false
      this.scene.add(o)
    }
    this.exitView = { drone, hero, heroRoot, motion: newMotion(7), heroShadow, droneShadow }
  }

  /**
   * Upload every mesh and texture to the GPU while a loading screen is still
   * up: tiny off-screen renders from high above, where the whole sector is in
   * frame. three.js uploads buffers on first draw, so without this the first
   * LIVE frame paid for the whole sector — a several-hundred-ms hitch on a
   * phone, exactly as the player gained control. Programs are compiled before
   * this (`compileAsync`), so it is uploads only — ONE ROOM PER RENDER,
   * time-sliced, because a single render of everything was itself a
   * one-second task on a throttled CPU.
   */
  async warmUp(slice: Slice, onProgress: (f01: number) => void = () => {}): Promise<void> {
    const r = getRenderer()
    const rt = new WebGLRenderTarget(64, 64)
    const cam = new PerspectiveCamera(70, 1, 1, 2000)
    const cx = (this.map.w * CELL) / 2
    const cz = (this.map.h * CELL) / 2
    cam.position.set(cx, 230, cz + 0.01)
    cam.lookAt(cx, 0, cz)
    cam.updateMatrixWorld()
    const rooms = this.level.rooms
    const roomWas = rooms.map(g => g.visible)
    // Lights stay on in every pass: without them each program would be a
    // different variant, and this would COMPILE instead of upload.
    const top = this.scene.children.filter(o => !(o as { isLight?: boolean }).isLight)
    const topWas = top.map(o => o.visible)
    const prev = r.getRenderTarget()
    const draw = async (): Promise<void> => {
      r.render(this.scene, cam)
      await slice()
    }
    try {
      r.setRenderTarget(rt)
      for (const o of top) o.visible = false
      // The level, one room group at a time (props hang under their room).
      this.level.root.visible = true
      const rest = top.filter(o => o !== this.level.root)
      const passes = rooms.length + Math.ceil(rest.length / 4)
      let done = 0
      for (let i = 0; i < rooms.length; i++) {
        for (let k = 0; k < rooms.length; k++) rooms[k]!.visible = k === i
        await draw()
        onProgress(++done / passes)
      }
      for (const g of rooms) g.visible = false
      // Everything else — machines, doors, pickups, sky — a few at a time.
      for (let k = 0; k < rest.length; k += 4) {
        for (let j = k; j < Math.min(k + 4, rest.length); j++) rest[j]!.visible = true
        await draw()
        for (let j = k; j < Math.min(k + 4, rest.length); j++) rest[j]!.visible = false
        onProgress(++done / passes)
      }
      r.render(this.vmScene, this.vmCamera)
    } finally {
      top.forEach((o, k) => { o.visible = topWas[k]! })
      rooms.forEach((g, k) => { g.visible = roomWas[k]! })
      r.setRenderTarget(prev)
      rt.dispose()
    }
  }

  /** The mission becomes the live mode (`app.setMode`): beam in. A mission can
   *  be built in the background, so nothing player-facing happens earlier. */
  enter(): void {
    hud.phase = 'beamIn'
    this.phaseT = 0
    // No chip or clock left over from the last mission for the first frames.
    hud.missionBoss = this.boss?.bossId ?? ''
    hud.bossDown = false
    hud.locatorOn = false
    hud.locatorCd01 = -1
    hud.cineSkip = false
    // It opens on Flux himself, third person (`sim/beamIn.ts`).
    hud.introCine = true
    this.beamCam.reset()
    this.beamLanded = false
    this.beamPrevT = 0
    // No banner left over from the last mission.
    clearBanner()
    sfx('beamIn')
  }

  // ─── World interface ───────────────────────────────────────────────────────

  fireEnemyShot(e: Enemy, x: number, y: number, z: number, dx: number, dy: number, dz: number, speed: number, dmg: number, blockable: boolean, worldY = false): void {
    // A shot aimed in world heights already (the golem's rock) was lifted twice
    // here and flew over Flux's head.
    if (this.climb && !worldY) {
      // The AI fires for a flat floor: lift the shot to the machine's own
      // platform and tip it at the player's height (a turret on a ledge
      // shoots down, a Hardhat below shoots up).
      const f = e.floor ?? 0
      y += f
      const hd = Math.hypot(this.player.x - x, this.player.z - z)
      const hl = Math.hypot(dx, dz)
      if (hd > 0.5 && hl > 1e-4) dy += ((this.player.y - f) / hd) * hl
    }
    this.system.spawnEnemyShot(e, x, y, z, dx, dy, dz, speed, dmg, blockable)
  }

  lobShell(e: Enemy, tx: number, tz: number, dur: number, dmg: number): void {
    this.system.lobShell(e, tx, tz, dur, dmg)
  }

  spawnWave(e: Enemy, x: number, z: number, dx: number, dz: number, speed: number, halfWidth: number, range: number, dmg: number, color: string): void {
    this.system.spawnWave(e, x, z, dx, dz, speed, halfWidth, range, dmg, color)
  }

  spawnRing(e: Enemy, x: number, z: number, speed: number, maxR: number, dmg: number, color: string): void {
    this.system.spawnRing(e, x, z, speed, maxR, dmg, color)
  }

  fireOrb(e: Enemy, x: number, y: number, z: number, speed: number, dmg: number): void {
    this.system.fireOrb(e, x, y, z, speed, dmg)
  }

  pull(x: number, z: number, speed: number, dur: number): void {
    this.pullX = x
    this.pullZ = z
    this.pullS = speed
    this.pullT = dur
  }

  shake(amount: number): void {
    this.shakeAmt = Math.min(1, this.shakeAmt + amount)
  }

  sfx(name: string, x?: number, z?: number): void {
    let pan = 0
    let gain = 1
    if (x !== undefined && z !== undefined) {
      const dx = x - this.player.x
      const dz = z - this.player.z
      const d = Math.hypot(dx, dz)
      const rx = Math.cos(this.player.yaw)
      const rz = -Math.sin(this.player.yaw)
      pan = d > 0.01 ? (dx * rx + dz * rz) / d : 0
      gain = Math.max(0.15, Math.min(1, 1.2 - d / 26))
    }
    sfx(name, pan * 0.7, gain)
  }

  hitPlayer(e: Enemy | null, dmg: number, o: { blockable: boolean; fromX: number; fromZ: number; kind: 'melee' | 'aoe' | 'shot'; hazard?: string }): 'hit' | 'block' | 'parry' | 'miss' {
    const c = this.combat
    const p = this.player
    if (c.dead || hud.phase !== 'play') return 'miss'
    // A boss attack reached Flux: the arena's run of blocked ones is over.
    if (e?.boss) this.arena?.attackLanded()
    if (c.iframes > 0) return 'miss'
    if (this.climb && this.offLevel(e, o.kind, o.fromX, o.fromZ)) return 'miss'
    const toSrc = Math.atan2(-(o.fromX - p.x), -(o.fromZ - p.z))
    const frontal = Math.abs(angDiff(toSrc, p.yaw)) < 1.35
    if (o.blockable && c.blocking && frontal && c.guardBroken <= 0) {
      if (this.time - c.blockPressedAt <= PARRY_WINDOW + this.stats.parryBonus) {
        // ── PARRY ──
        this.hitStop = Math.max(this.hitStop, 0.14)
        this.shake(0.25)
        pushHud({ t: 'flash', color: '#bff6ff', strength: 0.5 })
        pushHud({ t: 'text', x: p.x - Math.sin(p.yaw) * 1.4, y: p.y + EYE_H + 0.2, z: p.z - Math.cos(p.yaw) * 1.4, key: 'combat.parry', color: '#7ff4ff' })
        this.fx.sparks(p.x - Math.sin(p.yaw) * 0.8, p.y + EYE_H - 0.3, p.z - Math.cos(p.yaw) * 0.8, '#bff6ff', 18, 7, 0.2)
        sfx('parry')
        bark('parry')
        if (e && o.kind === 'melee') {
          e.state = 'stun'
          e.st = 0
          e.stunT = 1.6 + this.stats.parryStunBonus
          e.ring.visible = false
          e.flash = 1
        }
        c.iframes = Math.max(c.iframes, 0.2)
        // The counter: the shield drops so the stunned machine can be shot
        // at once, with the button still down (the firing waits on
        // `!blocking`). A fresh press raises it again.
        c.riposteT = RIPOSTE
        c.blocking = false
        this.vm.barrier.impact('parry')
        this.coach.use('parry')
        this.walk?.noteBlock()
        this.trainDone('block')
        return 'parry'
      }
      // ── BLOCK ──
      const taken = Math.max(1, Math.round(dmg * 0.25 * this.stats.blockDmgMul))
      c.power -= dmg * 0.45 * this.stats.blockCostMul
      c.powerDelay = 0.9
      c.hp -= taken
      this.fx.sparks(p.x - Math.sin(p.yaw) * 0.7, p.y + EYE_H - 0.3, p.z - Math.cos(p.yaw) * 0.7, '#7ff4ff', 8, 5)
      this.shake(0.1)
      sfx('block')
      if (c.power > 0) this.vm.barrier.impact('block')
      pushHud({ t: 'damage', x: p.x - Math.sin(p.yaw) * 1.2, y: p.y + EYE_H - 0.1, z: p.z - Math.cos(p.yaw) * 1.2, amount: taken, crit: false, weak: false, toPlayer: true })
      if (this.stats.reflectPct > 0 && e) {
        this.system.damageEnemy(e, Math.round(dmg * this.stats.reflectPct), { crit: false, charge: 0, fromX: p.x, fromZ: p.z, x: e.x, y: e.y + e.def.aimY, z: e.z, color: '#7ff4ff' })
      }
      if (c.power <= 0) {
        c.power = 0
        c.guardBroken = 0.7
        c.blocking = false
        this.vm.barrier.impact('break')
        sfx('guardCrack')
        pushHud({ t: 'text', x: p.x - Math.sin(p.yaw) * 1.4, y: p.y + EYE_H + 0.1, z: p.z - Math.cos(p.yaw) * 1.4, key: 'combat.guardCracked', color: '#ff8a5a' })
      }
      this.coach.use('block')
      this.walk?.noteBlock()
      this.trainDone('block')
      this.checkDown()
      return 'block'
    }
    // ── HIT ──
    let taken = dmg * this.stats.damageTakenMul
    if (this.setup.tutorial) taken *= 0.6
    taken = Math.max(1, Math.round(taken))
    c.hp -= taken
    c.iframes = 0.8
    // A barrel flattens him like a cartoon (#280): no jolt, no shake.
    const flat = o.hazard === 'barrel'
    c.hurtT = flat ? 0 : 0.25
    if (flat) {
      this.flatT = FLAT_FOR
      c.charging = false
      c.charge = 0
      sfx('fumble')
    } else this.shake(0.35)
    feedDamage(p, e, o.fromX, o.fromZ, taken, c.maxHp) // the hurt sound from its side + the HUD's marker
    pushHud({ t: 'hurt', strength: Math.min(1, taken / (c.maxHp * 0.25)) })
    this.onPlayerHurt(taken)
    if (o.blockable) this.coach.blockableHit()
    // Knock the player back a touch (less on the climb: a narrow walkway)
    const kx = p.x - o.fromX
    const kz = p.z - o.fromZ
    const kl = Math.hypot(kx, kz) || 1
    const kb = this.climb ? 1.5 : 4
    p.vx += (kx / kl) * kb
    p.vz += (kz / kl) * kb
    this.checkDown()
    // Flux yelps: what hit him, or a groan the moment health drops under 30 %.
    if (!c.dead) {
      const crossedLow = c.hp / c.maxHp < 0.3 && (c.hp + taken) / c.maxHp >= 0.3
      bark(crossedLow ? 'lowHp' : barkFor({ hazard: o.hazard, element: e?.element, hard: o.kind === 'aoe' || isHardHit(taken, c.maxHp, !!e?.boss) }))
    }
    // A machine's hard hit mid-charge can shake it loose. Never a trap's or
    // a hazard's (no machine behind it), never in the tutorial.
    if (e && !c.dead && !this.setup.tutorial && !this.exit.active && !flow.modal &&
      this.fumble.roll(c.charging, isHardHit(taken, c.maxHp, !!e.boss))) this.fumbleCharge()
    if (o.hazard && !c.dead) this.maybeTrapCam(o.hazard, o.fromX, o.fromZ)
    return 'hit'
  }

  /**
   * A hazard's first hit of its kind in a mission gets a short freeze-frame on
   * Flux (`sim/freezeCam.ts`): the camera swings in front of him while he
   * shakes in the jolt, the flames, the frost — so "that hurt, and why" reads
   * at once. Later hits of the same kind stay first person. Never in a boss
   * fight, never on top of another shot, and not while a machine is awake
   * close by (the freeze would hide a live threat's wind-up).
   */
  private maybeTrapCam(hazard: string, fromX: number, fromZ: number): void {
    if (this.trapCamSeen.has(hazard) || this.freeze.active || this.exit.active || flow.modal) return
    if (this.bossStarted && this.boss && this.boss.state !== 'dead') return
    const p = this.player
    for (const o of this.enemies) {
      if (o.state !== 'dead' && o.awake && !o.dormant && Math.hypot(o.x - p.x, o.z - p.z) < KILLCAM_ALERT_R * 0.75) return
    }
    this.trapCamSeen.add(hazard)
    this.trapCamHazard = hazard
    this.startFreeze({
      kind: 'trap', dur: TRAP_CAM_DUR, frame: 'front', skippable: true,
      fx: hazard === 'volt' ? 'volt' : hazard === 'ice' ? 'ice' : hazard === 'flame' ? 'flame' : hazard === 'barrel' ? 'flat' : 'spikes',
      tx: fromX, ty: p.y + 1, tz: fromZ
    })
  }

  /**
   * Flux loses control of his charge (`sim/fumble.ts`): it goes off at the
   * level it had reached, wild; the arm flails, he blurts a line, and now
   * and then the jolt stuns him. Also the DEV hook's (`window.__fumble`).
   */
  fumbleCharge(): void {
    const c = this.combat
    const p = this.player
    const f = this.fumble
    const info = chargeInfo(c.charging ? c.charge : 0, this.stats)
    c.charging = false
    c.charge = 0
    const say = f.start()
    const dir = strayDir(p.yaw, p.pitch, f.rng, _stray)
    if (info.level === 0) this.firePellet(dir)
    else this.fireCharged(info.level, false, dir)
    if (f.stunned) this.shake(0.3)
    sfx('fumble')
    hud.sayKey = say
    hud.saySeq++
    // His line is voiced on the bark channel: it never cuts Atlas or Vex off.
    playVoice(say, 'bark')
  }

  private checkDown(): void {
    const c = this.combat
    if (c.hp > 0) return
    if (this.stats.lastStand && !c.lastStandUsed) {
      c.lastStandUsed = true
      c.hp = 1
      c.iframes = 1.5
      pushHud({ t: 'toast', key: 'combat.lastStand', color: '#ffd84a' })
      return
    }
    c.hp = 0
    this.onPlayerDown()
  }

  // ─── The climb (`sim/climb.ts`): heights ────────────────────────────────────

  /** A hit that cannot reach Flux's level: a floor blast (a stomp, a shell,
   *  a crusher) on another floor than his, a melee blow from a machine on
   *  another platform. Shots are tested in 3D by the combat system. */
  private offLevel(e: Enemy | null, kind: 'melee' | 'aoe' | 'shot', fromX: number, fromZ: number): boolean {
    const py = this.player.y
    if (kind === 'aoe') return Math.abs(Math.max(-60, floorAt(this.nav, fromX, fromZ)) - py) > 1.2
    if (kind === 'melee' && e) return Math.abs((e.floor ?? 0) - py) > 1.6
    return false
  }

  /**
   * One step of Flux's body on the tower (after the walk velocity is
   * blended): ladders, the lift under him, gravity, a pit fall. Writes the
   * new x, z to `out`, like `moveCircle`.
   */
  private stepClimb(out: [number, number], fwdX: number, fwdZ: number, rightX: number, rightZ: number, dt: number, sliding: boolean): void {
    const cl = this.climb!
    const p = this.player
    const inp = this.input
    // The stick in world space: toward a ladder's wall climbs it.
    const wx = fwdX * inp.moveY + rightX * inp.moveX
    const wz = fwdZ * inp.moveY + rightZ * inp.moveX
    cl.stepBody(p, out, wx, wz, dt, sliding)
    // A slide off a pit edge became a dash leap: the slide is over, the
    // leap flies on its own momentum.
    if (cl.leapt) this.combat.slideT = 0
    // An edge-leap: the take-off reads as one (a whoosh, a dust puff, a kick
    // of the view), and it counts as the gap lesson done.
    if (cl.edgeLeapt) {
      this.sfx('slide', p.x, p.z)
      this.fx.emit({ x: p.x, y: p.y + 0.1, z: p.z, color: '#dfefff', size: 0.9, sizeEnd: 1.6, life: 0.25 })
      this.shake(0.08)
      this.onEdgeLeap()
    }
    if (cl.landSpeed > 8) {
      this.shake(Math.min(0.3, (cl.landSpeed - 8) * 0.04))
      this.sfx('stomp', p.x, p.z)
      this.fx.emit({ x: out[0], y: p.y + 0.1, z: out[1], color: '#dfefff', size: 1.1, sizeEnd: 1.8, life: 0.3 })
    }
    // Falling into a pit: the view darkens on the way down…
    if (cl.pitDark > 0.05) pushHud({ t: 'flash', color: '#05070f', strength: cl.pitDark * 0.85 })
    // …and far enough under the floor, back to the last checkpoint.
    if (cl.pitted) this.pitFall(out)
  }

  /** A pit: PIT_COST of the health (twice that into spikes or lava:
   *  `ClimbRun.pitCost`), and back on the last checkpoint out of a black
   *  screen (MegaMan's pits, softened). It can be the last straw. */
  /**
   * A fall into a pit. MegaMan's pits, softened, and now SHOWN: where the pit
   * has a floor (spikes), Flux lands on it — a short freeze-frame, sparks off
   * his body — and Atlas swoops down, Flux grabs on, and Atlas lifts him back
   * onto the nearest solid footing he stood on. A pit with no floor (off the
   * level) goes straight to the rescue. The fall's cost is paid at once; a
   * fall that ends him is his defeat as before.
   */
  private pitFall(out: [number, number]): void {
    const c = this.combat
    const p = this.player
    const cl = this.climb!
    const dmg = Math.max(1, Math.round(c.maxHp * cl.pitCost))
    c.hp -= dmg
    sfx('hurt')
    bark('pit')
    pushHud({ t: 'hurt', strength: 0.5 })
    this.dirty = true
    const to = this.rescueSpot(p.x, p.z) ?? cl.respawn()
    const bottom = cl.pitFloor(p.x, p.z)
    const spikes = bottom > -50
    if (c.hp <= 0 || this.freeze.active) {
      this.placeAfterFall(to, out)
      this.checkDown()
      return
    }
    this.rescue = { fx: p.x, fy: p.y, fz: p.z, bottom: spikes ? bottom : p.y, spikes, tx: to.x, ty: to.y, tz: to.z, tyaw: to.yaw }
    p.vx = p.vz = p.vy = 0
    out[0] = p.x
    out[1] = p.z
    this.startFreeze({
      kind: 'rescue', dur: spikes ? RESCUE_SPIKES : RESCUE_VOID, frame: 'front', skippable: true, fx: spikes ? 'spikes' : 'fall',
      hy: spikes ? bottom : p.y, tx: p.x, ty: (spikes ? bottom : p.y) + 1, tz: p.z
    })
    if (spikes) {
      this.sfx('stomp', p.x, p.z)
      this.shake(0.4)
    }
    pushHud({ t: 'damage', x: p.x, y: (spikes ? bottom : p.y) + 1.4, z: p.z, amount: dmg, crit: false, weak: false, toPlayer: true })
  }

  /** The nearest recent footing at least RESCUE_CLEAR from the fall. */
  private rescueSpot(x: number, z: number): { x: number; y: number; z: number; yaw: number } | null {
    for (let k = this.footing.length - 1; k >= 0; k--) {
      const f = this.footing[k]!
      if (Math.hypot(f[0] - x, f[1] - z) >= RESCUE_CLEAR) return { x: f[0], z: f[1], y: f[2], yaw: f[3] }
    }
    return null
  }

  /** Keep a short trail of solid footing (every FOOT_EVERY on real ground —
   *  never a lift, a ladder or the air). */
  private noteFooting(dt: number): void {
    const p = this.player
    this.footT -= dt
    if (this.footT > 0 || !p.ground || p.plat >= 0 || p.ladder >= 0 || !this.climb) return
    if (floorAt(this.nav, p.x, p.z, p.y) !== p.y) return
    this.footT = FOOT_EVERY
    this.footing.push([p.x, p.z, p.y, p.yaw])
    if (this.footing.length > FOOT_KEEP) this.footing.shift()
  }

  /** Put Flux down after a fall (the rescue's end, or at once). */
  private placeAfterFall(at: { x: number; y: number; z: number; yaw: number }, out?: [number, number]): void {
    const c = this.combat
    const p = this.player
    p.x = p.px = at.x
    p.z = p.pz = at.z
    if (out) {
      out[0] = at.x
      out[1] = at.z
    }
    p.y = p.py = p.safeY = at.y
    p.yaw = at.yaw
    p.vx = p.vz = p.vy = 0
    p.ground = true
    p.ladder = -1
    p.plat = -1
    p.air = 0
    p.mantle = 0
    p.path = null
    c.slideT = 0
    c.iframes = Math.max(c.iframes, 1.2)
    if (this.climb) this.climb.edgeFlight = false
    this.pitHold = PIT_HOLD
    this.fx.riseRing(at.x, at.y + 0.1, at.z, PAL.glowCyan, 0.9, 20)
  }

  /** The rescue's shot this frame: Flux on the spikes, Atlas coming down, the
   *  lift back up (an arc over the gap), set down. Writes the freeze spec's
   *  hero and subject, and Atlas's spot. */
  private poseRescue(): { x: number; y: number; z: number; hang: boolean } | null {
    const r = this.rescue
    const s = this.freeze.shot
    if (!r || !s || s.kind !== 'rescue') return null
    // On the spikes's clock: a fall into the void has no landing on them, so
    // it starts RESCUE_IMPACT in (it was minus: Atlas stopped halfway down,
    // the lift never played and Flux was put back by a cut).
    const t = this.freeze.t + (r.spikes ? 0 : RESCUE_IMPACT)
    let x = r.fx
    let y = r.bottom
    let z = r.fz
    let hang = false
    if (t > RESCUE_GRAB) {
      const k = Math.min(1, (t - RESCUE_GRAB) / RESCUE_LIFT)
      const e = k * k * (3 - 2 * k)
      x = r.fx + (r.tx - r.fx) * e
      z = r.fz + (r.tz - r.fz) * e
      y = r.bottom + (r.ty - r.bottom) * e + Math.sin(e * Math.PI) * 3
      hang = k < 1
    }
    s.hx = x
    s.hy = y
    s.hz = z
    s.hyaw = r.tyaw
    s.tx = x
    // Framed for both: Flux and Atlas over him.
    s.ty = y + 1.7
    s.tz = z
    // Atlas, big: from high above, down over him, then carrying him up on
    // its tractor beam.
    const down = Math.min(1, Math.max(0, (t - RESCUE_IMPACT * 0.8) / (RESCUE_GRAB - RESCUE_IMPACT * 0.8)))
    const ay = y + RESCUE_ATLAS_Y + (1 - down) * 7
    this.atlasWorldAt.set(x + 0.1, ay, z)
    this.atlasWorldSet = true
    this.atlasWorld?.root.scale.setScalar(RESCUE_ATLAS_SCALE)
    const tr = this.tractor
    if (tr) {
      const on = Math.min(1, Math.max(0, (t - (RESCUE_GRAB - 0.3)) / 0.3))
      tr.visible = on > 0
      if (on > 0) {
        const top = ay - 0.5
        const len = Math.max(0.5, top - y)
        tr.position.set(x + 0.1, y + len / 2, z)
        tr.scale.set(1, len, 1)
        ;(tr.material as MeshBasicMaterial).opacity = on * (0.32 + 0.12 * Math.sin(this.freeze.t * 18))
        if (Math.random() < 0.6) this.fx.emit({ x: x + (Math.random() - 0.5) * 1.2, y: y + Math.random() * len, z: z + (Math.random() - 0.5) * 1.2, vy: 2.5, color: PAL.glowCyan, size: 0.18, sizeEnd: 0.02, life: 0.5 })
      }
    }
    return { x, y, z, hang }
  }

  /** Where a tap's ray first meets a floor on the tower (the labyrinth's is
   *  simply y = 0). False when it meets a wall first, or nothing near. */
  private rayToFloor(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, out: Vector3): boolean {
    for (let t = 0.3; t < 45; t += 0.2) {
      const x = ox + dx * t
      const y = oy + dy * t
      const z = oz + dz * t
      if (isSolidAt(this.nav, x, z)) return false
      if (y <= floorAt(this.nav, x, z)) {
        out.set(x, y, z)
        return true
      }
    }
    return false
  }

  onEnemyKilled(e: Enemy, xp: number): void {
    // An ordinary machine breaks into its parts at once; a boss at the end
    // of its death throes (`stepShatter`).
    if (!e.boss) this.shatterEnemy(e)
    this.xp += xp
    this.kills++
    profile.stats.kills++
    if (this.combat.target === e) this.combat.target = null
    // Weapon XP only for a weapon Flux owns: a borrowed one he has not won
    // yet (`sim/borrowed.ts`) never ranks up.
    if (e.lastWeapon && profile.hero.weapons.includes(e.lastWeapon as WeaponId)) this.weapons.onKill(e.lastWeapon)
    if (e.boss) {
      // The shutter stays shut: the way out is the beam, from inside the
      // arena, where the exit drone has room (a corridor clipped its camera).
      pushHud({ t: 'toast', key: 'mission.bossDown', params: { boss: e.nameKey }, color: '#ffd84a' })
      // The big red card, once per Core Master however its death is reported.
      if (!this.bossBannered.has(e)) {
        this.bossBannered.add(e)
        showBanner('bossDown')
        if (e.bossId === 'vexMk1') {
          // Vex sinks ("a second opinion…"); Atlas's "We did it!" waits for the Grand Master.
          this.playScene(mk1DefeatBeats(), 'title', null)
          // Vex presses his button: the Grand Master (#101).
          this.finale?.start(e.x, e.z)
        } else {
          // A Master's first clear: what freeing it did, and the weapon Flux copied.
          const bid = e.bossId ?? ''
          const first = this.setup.quest?.kind === 'story' && !!VEX_BOSS_KEY[bid] && !profile.world.bosses.includes(bid)
          const beats = first ? freedBeats(bid) : []
          if (beats.length) this.playScene(beats, 'top', null)
          else this.atlas?.event('bossDown')
          this.onBossDownWeapon(e)
        }
      }
    }
    this.objects.onEnemyKilled(e)
    this.gainXp(xp)
    this.dirty = true
    this.maybeKillCam(e)
  }

  private bossDoor(): DoorState | null {
    if (!this.bossRoom) return null
    return this.doors.find(d => d.to === this.bossRoom!.id) ?? null
  }

  /** Crossing into the boss room: shutter slams, name card, bar fills, fight. */
  private startBoss(): void {
    const b = this.boss
    // A resume after the kill restores the boss dead: no second entrance.
    if (!b || this.bossStarted || b.state === 'dead') return
    this.bossStarted = true
    startBossIntro(b)
    const d = this.bossDoor()
    if (d) {
      d.locked = true
      d.opening = false
      d.open = 1
      d.closing = true
      this.nav.pathBlock[d.cellJ * this.map.w + d.cellI] = 2
    }
    hud.bossName = b.nameKey
    hud.bossHp01 = 0
    hud.titleKey = b.nameKey
    hud.titleSub = `sector.${this.setup.sector}`
    hud.titleShownAt = performance.now()
    this.bossBarT = 0
    this.combat.target = b
    sfx('bossIntro')
    setMusicTrack('boss')
    this.shake(0.3)
    // Dr. Vex presents his Master (once ever; later entrances get his laugh), or lands the Mk-I.
    const bid = b.bossId ?? ''
    this.mk1Signal = b.phase2
    if (bid === 'vexMk1') {
      // Atlas's element call-outs are said at once, mid-fight: load them now.
      for (const el of new Set(Object.values(MK1_CALL))) prefetchVoice(`atlas.mk1.${el}`)
      if (!vexSeen('mk1:intro')) {
        b.beatHold = MK1_INTRO_HOLD
        this.playScene(mk1IntroBeats(), 'title', 'mk1:intro')
      }
    } else if (VEX_BOSS_KEY[bid]) {
      if (!vexSeen(`present:${bid}`)) this.playScene(presentBeats(bid), 'title', `present:${bid}`)
      else playVoiceSoon('vex.laugh.short')
    }
  }

  /** Special weapon in slot i (HUD button / 1 / 2). */
  fireWeapon(i: 0 | 1): void {
    const id = profile.hero.slots[i] as WeaponId | ''
    if (!id || hud.phase !== 'play' || this.combat.dead || this.fumble.panicking) return
    const m = this.muzzle()
    const aim = this.aimDir(m)
    const r = this.weapons.use(i, id, m, aim)
    if (r === 'ok') {
      this.coach.use('weapon')
      this.lessons.weaponFired()
      this.vmFlash = 1
      this.vmFlashColor = WEAPONS[id].color
      this.combat.recoil = 1
      this.makeNoise(12)
      if (aim[3] && !aim[3].awake && !aim[3].hold) wake(this, aim[3])
    } else if (r === 'energy') {
      pushHud({ t: 'toast', key: 'combat.noEnergy', color: '#ff9a8a' })
      sfx('denied')
      this.atlas?.say('warn.weEmpty')
    }
  }

  // ─── The borrowed weapon (`sim/borrowed.ts`) ──────────────────────────────

  /** A mission's capsules, from the map seed (none in the tutorial). Build
   *  time, before the precompile; each hangs under its room's group. */
  private buildBorrowed(): void {
    const spots = planBorrowed(this.map, {
      tutorial: !!this.setup.tutorial, owned: profile.hero.weapons, slots: profile.hero.slots
    })
    this.borrowed = new BorrowedRun(this, spots, (s) => {
      const v = buildWeaponCapsule(s.weapon)
      v.root.position.set(s.x, s.y, s.z)
      this.propParent(s.x, s.z).add(v.root)
      return v
    })
  }

  /** The borrowed weapon (third button / 3): no Weapon Energy, one charge a
   *  shot. Gale Guard's throw rides on the charge its cast paid. */
  fireBorrowed(): void {
    const b = this.borrowed
    const id = b.slot.id
    if (!id || hud.phase !== 'play' || this.combat.dead || this.fumble.panicking) return
    const throwing = id === 'galeGuard' && this.weapons.guardT > 0
    if (b.slot.shots <= 0 && !throwing) return
    const m = this.muzzle()
    const aim = this.aimDir(m)
    if (this.weapons.use(2, id, m, aim, true) !== 'ok') return
    b.fired(throwing)
    if (!throwing && b.slot.shots === 1) this.atlas?.say(`warn.borrowedLast.${id}` as AtlasLine)
    this.vmFlash = 1
    this.vmFlashColor = WEAPONS[id].color
    this.combat.recoil = 1
    this.makeNoise(12)
    if (aim[3] && !aim[3].awake && !aim[3].hold) wake(this, aim[3])
    this.dirty = true
  }

  /** Capsules walked into, and a borrowed weapon running dry: a pop in its
   *  colour at the muzzle (not while its Gale Guard leaves are still out). */
  private updateBorrowed(dt: number, playing: boolean): void {
    const b = this.borrowed
    if (b.update(dt, this.time, this.player, playing)) this.dirty = true
    if (b.checkSpent(b.slot.id === 'galeGuard' && this.weapons.guardT > 0)) {
      const m = this.muzzle()
      this.fx.flash(m[0], m[1], m[2], b.lastColor, 1.2, 0.22)
      this.fx.sparks(m[0], m[1], m[2], b.lastColor, 10, 4, 0.14)
      this.vmFlash = 1
      this.vmFlashColor = '#ffffff'
      this.dirty = true
    }
  }

  /** Live XP → profile. A level-up mid-mission is a full repair + fanfare;
   *  the attribute pick waits for a calm moment (see LevelUpModal). */
  private gainXp(xp: number): void {
    const gained = grantXp(xp)
    if (gained > 0) {
      const c = this.combat
      this.stats = computeStats()
      c.maxHp = this.stats.maxHp
      c.maxWe = this.stats.maxWe
      c.maxPower = this.stats.maxPower
      c.hp = c.maxHp
      c.we = c.maxWe
      const p = this.player
      this.fx.riseRing(p.x, p.y + 0.1, p.z, '#ffd84a', 1.1, 26)
      pushHud({ t: 'flash', color: '#ffd84a', strength: 0.45 })
      pushHud({ t: 'toast', key: 'progress.levelUp', params: { n: profile.level }, color: '#ffd84a' })
      sfx('levelUp')
    }
  }

  // ─── Objective host ─────────────────────────────────────────────────────────

  onChestOpened(c: Chest): void {
    this.chestsOpened++
    profile.stats.chests++
    const lvl = this.setup.enemyLevel
    // Bolts burst out of every chest; an item drops by rarity chance.
    const bolts = Math.round((12 + lvl * 6) * (c.supply ? 1.2 : 1) * this.stats.boltMul)
    for (let k = 0; k < 5; k++) this.system.spawnPickup('bolt', Math.max(1, Math.round(bolts / 5)), c.x, c.y + 1.0, c.z)
    const itemChance = c.rarity === 'standard' ? 0.45 : 1
    const seed = (this.map.seed ^ (0x9e37 * (c.id + 1))) >>> 0
    if (Math.random() < itemChance) {
      const it = rollItem(seed, lvl, { rarity: c.rarity })
      profile.inv.items.push(it)
      profile.inv.fresh.push(it.id)
      this.itemsFound.push(it)
      // Its own card, icon and upgrade check included (`LootCard.vue`): a
      // line in the toast stack went by unread.
      pushHud({ t: 'loot', item: it })
      sfx('loot')
      if (compareItems(it, rivalFor(it, equipped)).upgrade) this.atlas?.say('hint.upgrade')
    }
    if (Math.random() < 0.18 && profile.inv.tanks < this.stats.tanksMax) {
      profile.inv.tanks++
      pushHud({ t: 'toast', key: 'loot.tank', color: '#8dff7a' })
    }
    sfx('chestOpen')
    this.dirty = true
  }

  onCrateBroken(c: Crate): void {
    // The crane's crates: an energy pill, nothing else.
    if (c.crane) {
      this.crane?.forget(c)
      this.system.spawnPickup(Math.random() < 0.55 ? 'we' : 'hp', 0, c.x, c.y + 0.8, c.z)
      return
    }
    // A boss arena's prop: a pill always, a Repair Gel rarely (one a room).
    if (c.arena && this.arena) {
      const d = this.arena.drop()
      if (d === 'tank' && profile.inv.tanks < this.stats.tanksMax) {
        profile.inv.tanks++
        pushHud({ t: 'toast', key: 'loot.tank', color: '#8dff7a' })
        sfx('tank')
        this.dirty = true
      } else this.system.spawnPickup(d === 'tank' ? 'hp' : d, 0, c.x, c.y + 0.8, c.z)
      return
    }
    const n = c.kind === 'barrel' ? 1 : 2
    for (let k = 0; k < n; k++) this.system.spawnPickup('bolt', 2 + Math.floor(Math.random() * 3), c.x, c.y + 0.8, c.z)
    if (Math.random() < 0.12) this.system.spawnPickup(Math.random() < 0.6 ? 'hp' : 'we', 0, c.x, c.y + 0.8, c.z)
  }

  onCoreTaken(_c: Core): void {
    sfx('objective')
    this.dirty = true
  }

  onObjectiveDone(): void {
    // Vex is down, but the Grand Master is coming: the objective waits for it.
    if (this.finale && this.finale.state !== 'done') return
    // A Master's copied weapon still to learn: not done yet (#110: Atlas said
    // "call the drone" over the fallen boss). The pedestal finishes it.
    if (this.weaponOwed) return
    hud.objectiveDone = true
    pushHud({ t: 'toast', key: 'mission.objectiveDone', color: '#8dff7a' })
    pushHud({ t: 'flash', color: '#8dff7a', strength: 0.3 })
    sfx('objective')
    this.dirty = true
  }

  shotHitsProp(x: number, y: number, z: number, r: number, dmg: number, charge: number): boolean {
    return this.objects.shotHitsCrate(x, y, z, r, dmg, charge) || this.objects.shotHitsChest(x, y, z, r) ||
      !!this.climb?.shotHits(x, y, z, r, charge)
  }

  shotHitsLesson(s: Shot): 'hit' | 'deflect' | null {
    return this.lessons.shotHits(s)
  }

  /** A stage's wall buttons (`sim/secrets.ts`, via `ClimbRun.shotStep`). */
  shotHitsStage(s: Shot): boolean {
    return this.climb?.shotStep(s) ?? false
  }

  /** A secret's prize (`ClimbHost.secretPrize`): a Repair Gel past the cap
   *  (a secret is worth breaking the rule for), or a borrowed weapon — the
   *  one this mission's capsules lend, else one chosen the same way. */
  secretPrize(prize: SecretSpec['prize'], x: number, y: number, z: number): void {
    if (prize === 'tank') {
      profile.inv.tanks++
      pushHud({ t: 'toast', key: 'loot.tank', color: '#8dff7a' })
      sfx('tank')
    } else if (prize === 'hp') {
      this.onPickup('hpBig', 0)
    } else {
      const w = this.borrowed.capsules[0]?.spot.weapon ?? secretWeapon(this.map.seed, profile.hero.weapons, profile.hero.slots)
      this.borrowed.lend(w, x, y, z)
    }
    this.dirty = true
  }

  /** A quick shot bounced off a supply crate: the charge shot's moment. */
  onCrateDeflect(c: Crate): void {
    this.lessons.crateDeflected(c)
    this.coach.deflected()
  }

  // ─── Lesson host (`sim/lessons.ts`) ──────────────────────────────────────────

  crates(): Crate[] {
    return this.objects.crates
  }

  addCrate(x: number, z: number, yaw: number): Crate | null {
    return this.objects.addCrate(x, z, yaw)
  }

  addArenaCrate(x: number, z: number, yaw: number, kind: 'crate' | 'barrel', y: number): Crate | null {
    return this.objects.addCrate(x, z, yaw, kind, y)
  }

  /** The crane lifts a crate away: gone without a drop. */
  liftCrate(c: Crate): void {
    if (c.broken) return
    c.broken = true
    c.mesh.root.visible = false
    this.nav.props[c.navIdx]!.active = false
    this.fx.sparks(c.x, c.y + 1, c.z, '#d8dde6', 6, 3, 0.12)
  }

  /** A hazard of the arena's own lands on the boss: `frac` of its health. */
  hurtBoss(boss: Enemy, frac: number, x: number, z: number): void {
    if (boss.state === 'dead') return
    this.system.damageEnemy(boss, Math.round(boss.maxHp * frac), {
      crit: false, charge: 0, fromX: x, fromZ: z, x: boss.x, y: boss.y + 1.6, z: boss.z, color: '#ffb12a'
    })
    this.shake(0.3)
  }

  onShotBlocked(s: Shot): void {
    this.arena?.shotBlocked(s)
  }

  addEnemy(e: Enemy): void {
    this.toughen(e)
    this.enemies.push(e)
    this.scene.add(e.root, e.shadow, e.ring)
  }

  /**
   * A stage's barrels and crates: 2–4 of them in the corners of every other
   * ground machine's patch (the platform stages had none — the first
   * mission's crates and barrels were never seen again). Deterministic from
   * the map's seed; never on a pit or a ledge's lip.
   */
  private placeStageProps(): void {
    const t = this.map.terrain
    if (!t) return
    const posts = t.foes.filter(f => f.role !== 'turret' && f.role !== 'flyer')
    const rng = mulberry32(this.map.seed ^ 0xb4a1)
    const want = 2 + Math.floor(rng() * 3)
    let n = 0
    for (let k = 1; k < posts.length && n < want; k += 2) {
      const f = posts[k]!
      const [x0, z0, x1, z1] = f.leash
      const x = rng() < 0.5 ? x0 + 0.3 : x1 - 0.3
      const z = rng() < 0.5 ? z0 + 0.3 : z1 - 0.3
      const yaw = rng() * Math.PI * 2
      const kind = rng() < 0.45 ? 'barrel' : 'crate'
      if (Math.hypot(x - f.x, z - f.z) < 1.4) continue
      if (Math.abs(floorAt(this.nav, x, z, f.y + 0.5) - f.y) > 0.05) continue
      if (Math.abs(floorAt(this.nav, x + 0.7, z, f.y + 0.5) - f.y) > 0.05 || Math.abs(floorAt(this.nav, x - 0.7, z, f.y + 0.5) - f.y) > 0.05) continue
      this.objects.addCrate(x, z, yaw, kind, f.y)
      n++
    }
  }

  /**
   * The fight shows on the arena itself, as the boss wears down: under half
   * its health the lights stutter; under a quarter they burn low and red and
   * sparks rain from the rafters. Visual only; back to normal when it falls.
   */
  private arenaDressing(dt: number): void {
    const h = this.hemi
    const b = this.boss
    // The room the fight is in now (the Core Descent moves it).
    const room = this.bossRoom ?? this.arena?.room
    if (!h || !b || !room) return
    const live = this.bossStarted && b.state !== 'dead'
    const frac = live ? b.hp / Math.max(1, b.maxHp) : 1
    let want = 1.05
    if (frac < 0.5) want *= Math.random() < 0.06 ? 0.45 : 1
    if (frac < 0.25) {
      want *= 0.8
      if (Math.random() < 0.35) {
        const x = (room.x0 + Math.random() * room.w) * CELL
        const z = (room.z0 + Math.random() * room.h) * CELL
        this.fx.emit({ x, y: 6.5, z, vx: 0, vy: -1, vz: 0, color: Math.random() < 0.5 ? '#ffd35a' : '#ff7a2a', size: 0.14, sizeEnd: 0.02, life: 1.2, gravity: 7 })
      }
    }
    this.arenaLight += (want - this.arenaLight) * Math.min(1, dt * (want < this.arenaLight ? 30 : 6))
    const red = live && frac < 0.25 ? 1 : 0
    h.color.copy(this.hemiBase).lerp(ARENA_RED, 0.4 * red)
  }

  /** The Grand Master has fallen: now the objective is done, the exit open. */
  private finaleDone(): void {
    this.dirty = true
    this.onObjectiveDone()
    this.atlas?.event('vexDown')
  }

  /** A stage feature asks for darkness this frame (the darkest ask wins). */
  stageDark(dark01: number): void {
    this.darkWant = Math.max(this.darkWant, Math.max(0, Math.min(1, dark01)))
  }

  /** Lightning: the sky flashes and fades on its own. */
  skyFlash(amount: number): void {
    this.flash = Math.max(this.flash, Math.max(0, Math.min(1, amount)))
  }

  /**
   * The stage's light, once a frame after everything that asks for it: the
   * sky light (at the arena dressing's level), the sun, the skyline windows
   * and the sky and fog colours, all scaled by the frame's darkness, plus a
   * lightning flash. A blackout keeps 15 % of the light: platform edges, the
   * HUD and the machines' eyes stay readable.
   */
  private applyStageLight(dt: number): void {
    const d = this.darkWant
    this.darkWant = 0
    const flashWas = this.flash
    this.flash = Math.max(0, this.flash - dt * 4)
    const changed = d !== this.dark || flashWas > 0
    this.dark = d
    if (this.hemi) this.hemi.intensity = this.arenaLight * (1 - 0.85 * d) + this.flash * 1.4
    if (!changed) return
    if (this.sun) this.sun.intensity = this.sunBase * (1 - 0.9 * d) + this.flash * 0.8
    this.city?.setLight(1 - d + this.flash)
    if (this.scene.background instanceof Color) this.scene.background.copy(this.skyBase).lerp(NIGHT, 0.75 * d).lerp(FLASH_WHITE, 0.35 * this.flash)
    this.scene.fog?.color.copy(this.fogBase).lerp(NIGHT, 0.75 * d)
  }

  /** Story progress toughens machines: PROGRESS_HP more health per Core
   *  Master beaten (never a boss, never twice). */
  private toughen(e: Enemy): void {
    if (e.boss || (e as { toughened?: boolean }).toughened) return
    ;(e as { toughened?: boolean }).toughened = true
    // New Game+: every Core Master was beaten once already.
    const beaten = profile.world.ngPlus > 0 ? Object.values(SECTOR_BY_ID).filter(s => s.boss !== 'vexMk1').length : profile.world.bosses.length
    const mul = 1 + PROGRESS_HP * beaten
    e.maxHp = Math.round(e.maxHp * mul)
    e.hp = Math.round(e.hp * mul)
  }

  /** Atlas says a line (`ClimbHost`: a stage feature's tip or a secret's
   *  nudge). Before Atlas is built, nothing. */
  say(line: AtlasLine): void {
    const a = this.atlas
    if (!a) return
    // The story's first-time warnings from the stage itself (a crusher, a ladder, a lift over
    // a pit): once ever. Not in Meltdown Descent, whose hammers have their own tip, nor on the
    // Sky Docks, where the shuttles over the gaps are plain to see (#122).
    if (line === 'warn.crusher' || line === 'warn.ladder' || line === 'warn.pit') {
      if ((line === 'warn.crusher' && this.setup.sector === 'blaze') || (line === 'warn.pit' && this.setup.sector === 'gale')) return
      if (!a.first(`atlas:${line}`)) return
    }
    // A lesson's intro is up at once, over whatever Atlas was saying: its
    // card follows in under two seconds (`training.ts`, INTRO_FOR).
    if (line.startsWith('train.')) {
      a.sayNow(line)
      return
    }
    a.say(line)
  }

  /** The cast's level and the sector's table (`ClimbHost`: a stage's waves
   *  of flyers are cast from them). */
  get enemyLevel(): number { return this.setup.enemyLevel }
  get encounters(): EncounterTable { return this.setup.encounters }

  spawnPickup(kind: PickupKind, value: number, x: number, y: number, z: number): void {
    this.system.spawnPickup(kind, value, x, y, z)
  }

  weaponCost(id: WeaponId): number {
    return this.weapons.cost(id)
  }

  weaponDamage(id: WeaponId): number {
    const r = this.weapons.rank(id)
    return Math.round(this.stats.busterDmg * WEAPONS[id].dmg * this.stats.specialMul * (1 + (r - 1) * 0.25))
  }

  /** Where the live lesson's glyph attaches (HUD ticker; x, y, z triples). */
  lessonAnchors(out: Float32Array): number {
    return this.lessons.anchors(out)
  }

  /** The player is in the live lesson's room: its off-screen bubble may show. */
  lessonInRoom(): boolean {
    return this.lessons.inRoom(this.player.x, this.player.z)
  }

  // ─── Walkthrough host (`sim/walkthrough.ts`) ────────────────────────────────

  /** The tutorial's guided walk is still under way: some door on the path to
   *  the boss is not earned yet. Always false outside the tutorial. */
  walkthroughActive(): boolean {
    return !!this.walk?.active
  }

  /** Shut a walkthrough gate: locked, a red lamp, no path through. */
  holdDoor(id: number): void {
    const d = this.doors[id]
    if (!d) return
    d.held = true
    d.locked = true
    d.opening = false
    d.open = 0
    d.slab.active = true
    this.nav.pathBlock[d.cellJ * this.map.w + d.cellI] = 2
    d.mesh.lampMat.color.set(PAL.glowRed)
  }

  /** A walkthrough gate earned: the lamp turns, a chime, a pulse at the door.
   *  A plain door slides open by itself — the clearest "this way" there is;
   *  the boss shutter stays sealed until the player opens it. */
  releaseDoor(id: number): void {
    const d = this.doors[id]
    if (!d || !d.held) return
    // The tutorial's first way on is a wall until now: it sinks first, and
    // the door at the end of the corridor behind it opens once it is down
    // (`updateFalseWalls`).
    const fw = this.falseWalls.get(id)
    if (fw && fw.t < 0) {
      d.held = false
      fw.t = 0
      this.sfx('stomp', fw.x, fw.z)
      this.shake(0.3)
      sfx('objective')
      return
    }
    d.held = false
    d.mesh.lampMat.color.set(PAL.glowYellow)
    if (!d.mesh.boss) {
      d.locked = false
      d.opening = true
      this.nav.pathBlock[d.cellJ * this.map.w + d.cellI] = 1
      this.sfx('door', d.x, d.z)
    }
    sfx('objective')
    this.fx.riseRing(d.x, 0.15, d.z, PAL.glowYellow, 1.1, 22)
    this.fx.flash(d.x, WALL_H - 0.55, d.z, PAL.glowYellow, 2.2, 0.35)
    this.shocks.spawn(d.x, 0.05, d.z, 2.4, PAL.glowYellow, 0.5)
  }

  /** Beam a stand-in teacher into `roomId`, in view of the player: the
   *  Trooper fell before a single block, the Stomper before a slide. */
  bringIn(kind: 'heli' | 'hopper', roomId: number): boolean {
    const p = this.player
    const at = helperSpot(this.nav, this.map, roomId, p.x, p.z, p.yaw)
    if (!at) return false
    const e = createEnemy(kind, this.setup.enemyLevel, at[0], at[1], roomId)
    e.yaw = Math.atan2(p.x - at[0], p.z - at[1])
    this.addEnemy(e)
    this.fx.riseRing(at[0], 0.1, at[1], PAL.glowCyan, 0.8, 18)
    this.sfx('beamIn', at[0], at[1])
    wake(this, e)
    return true
  }

  /** Progress worth keeping: into the next snapshot. */
  checkpoint(): void {
    this.dirty = true
  }

  // ─── The held door's prompt (`sim/doorPrompt.ts`) ───────────────────────────

  /**
   * Feed the door prompt: the held walkthrough door Flux pushes against (in
   * reach of its slab, moving into it), the one a shot of his is about to
   * meet, and the one he waits by. Only a door `Walkthrough.needAt` names
   * counts: a gate whose room is done opens in a moment. Waiting there long
   * enough wakes the room's teacher if it sleeps (a beat after the prompt
   * came up), so it comes out into view; the arrow points to it meanwhile.
   */
  private updateDoorPrompt(dt: number, playing: boolean): void {
    const walk = this.walk
    // Held doors: the walkthrough's gates, or a stage's beam-in door while
    // its weapon lesson is owed.
    const beamNeed = this.beamTeach ? this.beamDoorId : -1
    if (!walk && beamNeed < 0) return
    const needAt = (id: number): WalkNeed | null => walk ? walk.needAt(id) : id === beamNeed ? 'weapon' : null
    const p = this.player
    const o = this.doorTick
    o.time = this.time
    o.playing = playing
    o.combat = hud.combat
    o.press = o.shot = o.near = o.close = -1
    let nearest = IDLE_RANGE
    for (const d of this.doors) {
      if (!d.held || Math.abs(p.y - d.y) > 2.6) continue
      const dist = Math.hypot(d.x - p.x, d.z - p.z)
      if (dist > 30 || !needAt(d.id)) continue
      if (dist < nearest) {
        nearest = dist
        o.near = d.id
      }
      // Across the door's face (its slab's thin side) and along it.
      const across = d.axis === 'x'
      const gap = across ? d.x - p.x : d.z - p.z
      const along = across ? Math.abs(d.z - p.z) : Math.abs(d.x - p.x)
      const half = across ? (d.slab.maxX - d.slab.minX) / 2 : (d.slab.maxZ - d.slab.minZ) / 2
      const into = (across ? p.vx : p.vz) * Math.sign(gap)
      if (Math.abs(gap) < PLAYER_R + half + 0.15 && along < CELL / 2 && into > 0.5) o.press = d.id
      for (const s of this.system.shots) {
        if (!s.active || s.owner !== 'player' || s.y > d.y + WALL_H) continue
        const sg = across ? d.x - s.x : d.z - s.z
        const sv = across ? s.vx : s.vz
        // Flying into its face, a step and a half from it at most.
        if (sg * sv <= 0 || Math.abs(sg) > Math.abs(sv) * dt * 1.5 + 0.5) continue
        if ((across ? Math.abs(d.z - s.z) : Math.abs(d.x - s.x)) < CELL / 2) o.shot = d.id
      }
    }
    if (o.near >= 0 && nearest < CLOSE_RANGE) o.close = o.near
    const pr = this.doorPrompt
    const pulse = pr.pulse
    pr.update(o)
    // Each refusal the prompt shows (an approach, a bump, a shot): the gate
    // judders red, so "not yet" is on the door itself too.
    if (pr.pulse !== pulse && pr.door >= 0) {
      const dd = this.doors[pr.door]
      if (dd?.held) dd.shakeT = DOOR_SHAKE
    }
    if (pr.call && walk) {
      const e = walk.teacher()
      if (e && !e.awake) wake(this, e)
    }
    const v = this.doorView
    const d = pr.door >= 0 ? this.doors[pr.door] : undefined
    const need = d?.held ? needAt(d.id) : null
    v.alpha = need ? pr.alpha : 0
    v.pulse = pr.pulse
    if (!d || !need) return
    v.need = need
    // The very first gate: "Finish the Tutorial first" (players took the
    // shut door for a dead end); every later one names its lesson.
    v.label = !walk ? 'walk.finishLessonOn' : walk.passed === 0 ? 'walk.finishTutorial'
      : LESSON_OF[need] ? 'walk.finishLessonNamed' : 'walk.finishLesson'
    v.weapon = this.beamTeach ?? ''
    v.x = d.x
    v.y = d.y + 1.35
    v.z = d.z
    const g = walk ? walk.goal() : this.beamGoal()
    v.goal = !!g && g.kind !== 'door'
    if (g) {
      v.gx = g.x
      v.gz = g.z
    }
  }

  // ─── Traps + the Repair Gel corridor (`sim/traps.ts`, `sim/walkthrough.ts`) ─

  /** The map's corridor traps, and the tutorial's gel plate. Build time,
   *  before the precompile, so their materials compile with the sector; each
   *  hangs under its corridor's room group, so portal culling hides it too. */
  private buildTraps(): void {
    // The climb brings its own hazards (crushers, scrap balls, pits).
    const spots = this.climb ? [] : planTraps(this.map, { tutorial: !!this.setup.tutorial })
    const gel = this.walk?.plan.gel
    if (gel) spots.push(gel.spot)
    this.traps = new TrapSystem(this, spots, (s) => {
      const v = buildTrapView(s, this.theme, this.fx)
      this.propParent(s.x, s.z).add(v.root)
      return v
    })
    // A resumed tutorial whose plate already went off: dark for good.
    if (this.walk?.gelFired) this.traps.spendPlate()
  }

  /** The gel plate may go off: no fight, nothing awake within 15 m. */
  gelSafe(): boolean {
    if (hud.combat) return false
    const p = this.player
    for (const e of this.enemies) {
      if (e.state === 'dead' || e.offstage || !e.awake) continue
      if (Math.hypot(e.x - p.x, e.z - p.z) < 15) return false
    }
    return true
  }

  /**
   * The gel plate goes off under Flux: a sheet of fire, and exactly a quarter
   * of his bar left — never lower, never lethal, whatever the tutorial's
   * damage scaling. The door ahead slams shut: nothing gets in, and the way
   * on waits for the gel.
   */
  springGel(gel: GelPlan): void {
    const c = this.combat
    const p = this.player
    this.traps.trip()
    const quarter = Math.max(1, Math.round(c.maxHp * 0.25))
    if (c.hp > quarter) c.hp = quarter
    c.iframes = Math.max(c.iframes, 0.8)
    c.hurtT = 0.25
    this.shake(0.55)
    sfx('hurt')
    pushHud({ t: 'hurt', strength: 1 })
    pushHud({ t: 'flash', color: '#ffa23a', strength: 0.4 })
    // Blown back toward the room behind, away from the door.
    const d = this.map.doors[gel.door]
    if (d) {
      if (d.axis === 'x') p.vx -= d.dir * 5
      else p.vz -= d.dir * 5
    }
    this.shutDoor(gel.door)
    this.dirty = true
  }

  /** The gel lesson comes on; a gel flies into its button first if none is
   *  carried (the HUD animates any gain as a fly-in). */
  startGel(): boolean {
    if (profile.inv.tanks <= 0) {
      profile.inv.tanks = 1
      pushHud({ t: 'toast', key: 'loot.tank', color: '#8dff7a' })
      sfx('loot')
      this.dirty = true
    }
    this.training.enter('gel', this.time)
    return this.lessons.startGel()
  }

  /** The gel lesson is over: the walkthrough opens the gel door again. */
  gelOver(): boolean {
    return this.lessons.gelEnded
  }

  /** Slam a door that already opened (the gel trap's lockdown): held like a
   *  walkthrough gate, its panels driven shut (`updateDoors`, closing). */
  shutDoor(id: number): void {
    const d = this.doors[id]
    if (!d) return
    const was = d.open
    this.holdDoor(id)
    d.open = was
    d.closing = was > 0
  }

  /** The walkthrough's chest: one already standing in the chest room, else
   *  one placed in plain view of its door. Build time, so a resume rebuilds
   *  it under the same id. */
  private walkChest(plan: WalkPlan): WalkChest | null {
    const g = plan.gates.find(x => x.steps.includes('chest'))
    const room = g ? this.map.rooms[g.room] : undefined
    if (!room) return null
    const [dx, dz] = doorwayOf(this.map, room.id)
    const c = this.objects.chests.find(k => roomAt(this.map, k.x, k.z) === room.id)
      ?? this.objects.placeChest(room, dx, dz)
    return c ? { id: c.id, x: c.x, z: c.z } : null
  }

  /** Barrel blast: hurts every machine (and crate) in the radius. */
  explode(x: number, z: number, r: number, dmg: number): void {
    for (const e of this.enemies) {
      if (e.state === 'dead' || e.offstage) continue
      if (Math.hypot(e.x - x, e.z - z) < r + e.def.radius) {
        this.system.damageEnemy(e, dmg, { crit: false, charge: 2, fromX: x, fromZ: z, x: e.x, y: e.y + e.def.aimY, z: e.z, color: '#ffb04a' })
      }
    }
    for (const c of this.objects.crates) {
      if (!c.broken && Math.hypot(c.x - x, c.z - z) < r) this.objects.breakCrate(c)
    }
    const p = this.player
    if (Math.hypot(p.x - x, p.z - z) < r * 0.8) {
      this.hitPlayer(null, Math.round(dmg * 0.25), { blockable: false, fromX: x, fromZ: z, kind: 'aoe' })
    }
  }

  onPickup(kind: PickupKind, value: number): void {
    const c = this.combat
    switch (kind) {
      case 'bolt':
        this.bolts += value
        profile.bolts += value
        this.dirty = true
        sfx('bolt')
        break
      case 'hp':
      case 'hpBig': {
        const amt = Math.round(c.maxHp * (kind === 'hp' ? 0.14 : 0.35))
        c.hp = Math.min(c.maxHp, c.hp + amt)
        sfx('heal')
        pushHud({ t: 'flash', color: '#8dff7a', strength: 0.18 })
        break
      }
      case 'we':
      case 'weBig':
        c.we = Math.min(c.maxWe, c.we + (kind === 'we' ? 6 : 14))
        sfx('energy')
        break
    }
  }

  onPlayerHurt(_amount: number): void {
    // Chunk hooks (tutorial tips, analytics) attach here.
  }

  onPlayerDown(): void {
    const c = this.combat
    if (c.dead) return
    c.dead = true
    c.charging = false
    bark('down')
    this.atlas?.sayNow('warn.down')
    this.fumble.reset()
    this.deathT = 0
    hud.phase = 'dead'
    // Flux bursts in his own plasma (the kit's core glow)
    this.fx.orbBurst(this.player.x, this.player.y + EYE_H - 0.4, this.player.z, `#${this.vm.coreColor.getHexString()}`, 1.3)
    sfx('death')
    // GAME OVER, and the defeat modal only once it has held.
    showBanner('gameOver')
    this.respawnT = DEFEAT_DELAY
    this.writeSnap()
  }

  /** Defeat modal → "Reboot": back on your feet where you fell, full repair. */
  revive(): void {
    const c = this.combat
    c.dead = false
    c.hp = c.maxHp
    c.power = c.maxPower
    c.iframes = 2.5
    c.hurtT = 0
    this.fumble.reset()
    hud.phase = 'play'
    this.phaseT = 0
    clearBanner()
    this.fx.riseRing(this.player.x, this.player.y + 0.1, this.player.z, PAL.glowCyan, 1, 22)
    // Push nearby machines back a step so a revive is not an instant re-death.
    for (const e of this.enemies) {
      if (e.state === 'dead' || e.offstage) continue
      const d = Math.hypot(e.x - this.player.x, e.z - this.player.z)
      if (d < 4) {
        e.state = 'stun'
        e.st = 0
        e.stunT = 1.2
      }
    }
    sfx('beamIn')
    flow.modal = ''
  }

  /**
   * Ten seconds down (#105, the defeat modal's countdown): his body sinks
   * into the floor, filmed from outside, and he comes back at the last
   * checkpoint at full health — the level, its kills and its doors, as they
   * were. No rebuild.
   */
  respawnAtCheckpoint(): void {
    if (!this.combat.dead || this.sinking) return
    flow.modal = ''
    this.sinking = true
    const p = this.player
    this.startFreeze({ kind: 'sink', dur: SINK_S, frame: 'front', skippable: false, fx: '', tx: p.x, ty: p.y + 0.4, tz: p.z })
  }

  /** Where a respawn puts him: inside the arena's door while its boss
   *  stands (it keeps the damage done), else the last checkpoint of a
   *  stage, else the level's start. */
  respawnSpot(): { x: number; y: number; z: number; yaw: number } {
    const b = this.boss
    const d = this.bossStarted && b && b.state !== 'dead' ? this.bossDoor() : null
    const spec = d ? this.map.doors.find(x => x.id === d.id) : undefined
    if (spec) {
      const di = spec.axis === 'x' ? spec.dir : 0
      const dj = spec.axis === 'z' ? spec.dir : 0
      const x = cellCenter(spec.i + di * 2)
      const z = cellCenter(spec.j + dj * 2)
      return { x, z, y: Math.max(0, floorAt(this.nav, x, z)), yaw: Math.atan2(-di, -dj) }
    }
    if (this.climb) return this.climb.respawn()
    const s = this.map.start
    return { x: s.x, z: s.z, y: Math.max(0, floorAt(this.nav, s.x, s.z)), yaw: s.yaw }
  }

  private respawnNow(): void {
    this.sinking = false
    this.placeAfterFall(this.respawnSpot())
    this.revive()
    this.dirty = true
  }

  /** A shot at a closed door that is not held (by a lesson, a guard, the
   *  boss): it opens, like walking up to it. Within SHOT_DOOR_R, aimed at
   *  it, in sight. */
  private shotOpensDoor(dx: number, dz: number): void {
    const p = this.player
    const l = Math.hypot(dx, dz) || 1
    for (const d of this.doors) {
      if (d.locked || d.held || d.opening || d.mesh.boss) continue
      const ox = d.x - p.x
      const oz = d.z - p.z
      const dist = Math.hypot(ox, oz)
      if (dist > SHOT_DOOR_R || dist < 0.5) continue
      // Within a door's half-width of the line of fire.
      const along = (ox * dx + oz * dz) / l
      const off = Math.abs(ox * dz - oz * dx) / l
      if (along <= 0 || off > 1.4) continue
      if (!hasLineOfSight(this.nav, p.x, p.z, d.x - (ox / dist) * 1.6, d.z - (oz / dist) * 1.6)) continue
      d.opening = true
      this.sfx('door', d.x, d.z)
    }
  }

  /** Static props hang under their room's mesh group, so portal culling
   *  hides them with the room (ObjectiveHost). */
  propParent(x: number, z: number): Object3D {
    const o = this.level.owner[Math.floor(z / CELL) * this.map.w + Math.floor(x / CELL)] ?? -1
    return o >= 0 ? this.level.rooms[o]! : this.scene
  }

  /** Retreat / abandon: keep what was earned, fail the quest, go home. */
  retreat(): void {
    if (this.finished) return
    this.finished = true
    void finishMission(false, this.tally())
  }

  /**
   * Objective done → the exit (the B key and the button; the name is the old
   * beam-out's): the lab's drone flies in, Flux boards it, it lifts off under
   * the LEVEL CLEARED banner, and the results follow (`sim/exitRun.ts`). The
   * phase stays `beamOut` throughout, so everything that already stood down
   * for the beam — the HUD, the controls, the portals' gameplay bracket —
   * does so for the whole cutscene. Once per mission.
   */
  beamOut(): void {
    if (hud.phase !== 'play' || !this.objects.objective.done || this.exit.active || this.weaponOwed) return
    // Not while the Grand Master stands (or before it has come).
    if (this.finale && this.finale.state !== 'done') return
    hud.phase = 'beamOut'
    this.phaseT = 0
    const c = this.combat
    c.charging = false
    c.blocking = false
    this.fumble.reset()
    const p = this.player
    p.path = null
    p.vx = p.vz = 0
    p.plat = -1
    this.cine.boxes = this.cineBoxes()
    this.exitCam.reset()
    this.humT = 0
    this.armHolo?.dispose()
    this.armHolo = null
    // The pad, when he is on its floor: standing on it, he stands on its plate
    // (the lesson room's pedestal, when he beams out from that).
    const ep = this.exitPad?.root.position
    const pad = ep && Math.hypot(p.x - ep.x, p.z - ep.z) < PAD_R + 0.3 ? ep : this.pad.root.position
    const onPadFloor = Math.abs(floorAt(this.nav, pad.x, pad.z) - p.y) < 0.5
    this.exit.start(planExit(this.cine, p.x, p.y, p.z, p.yaw, p.ground && p.ladder < 0, onPadFloor ? { x: pad.x, z: pad.z } : null))
  }

  /** The exit's beats (ExitHost): its sounds, the banner, and the finish. */
  exitEvent(e: ExitEvent): void {
    const P = this.exit.plan!
    switch (e) {
      case 'approach':
        sfx('droneArrive')
        this.atlas?.event('exit')
        break
      case 'hop':
        sfx('jump')
        break
      case 'land':
        sfx('deckLand')
        this.fx.sparks(P.sx, P.hoverY + 0.1, P.sz, PAL.glowCyan, 10, 3, 0.16)
        break
      case 'lift':
        showBanner('cleared')
        sfx('liftOff')
        this.fx.riseRing(P.sx, P.fy + 0.08, P.sz, PAL.glowCyan, 1.2, 24)
        hud.cineSkip = false
        break
      case 'finish':
        // Exactly once, and never after a retreat already ended the mission.
        if (this.finished) return
        this.finished = true
        writeSnapshot(null)
        void finishMission(true, this.tally())
        break
    }
  }

  /** What the grid does not hold, as boxes for the exit's drone and camera:
   *  door lintels, jambs and shut doors (as they stand right now), and the
   *  teleporter pad with its posts. */
  private cineBoxes(): CineBox[] {
    const out: CineBox[] = []
    const pad = this.pad.root.position
    const py = floorAt(this.nav, pad.x, pad.z)
    out.push({ x0: pad.x - 1.5, x1: pad.x + 1.5, y0: py - 0.1, y1: py + 0.55, z0: pad.z - 1.5, z1: pad.z + 1.5 })
    for (const d of this.doors) {
      const along = CELL / 2 + 0.2
      const [hx, hz] = d.axis === 'x' ? [0.45, along] : [along, 0.45]
      const y1 = d.y + WALL_H + (d.mesh.boss ? 0.9 : 0.2)
      // The lintel (and, while shut, the door itself: down to the floor)
      const y0 = d.slab.active || d.open < 0.9 ? d.y : d.y + WALL_H - 1.25
      out.push({ x0: d.x - hx, x1: d.x + hx, y0, y1, z0: d.z - hz, z1: d.z + hz })
      // The jambs either side
      for (const s of [-1, 1]) {
        const jx = d.axis === 'x' ? d.x : d.x + s * CELL / 2
        const jz = d.axis === 'x' ? d.z + s * CELL / 2 : d.z
        out.push({ x0: jx - 0.45, x1: jx + 0.45, y0: d.y, y1, z0: jz - 0.45, z1: jz + 0.45 })
      }
    }
    return out
  }

  useTank(): boolean {
    const c = this.combat
    // At full health only while the gel lesson runs: the tutorial's gel door
    // waits for a gel used, however the health came back meanwhile.
    if (profile.inv.tanks <= 0 || c.dead || (c.hp >= c.maxHp && !(this.walk && this.lessons.gelLive)) || hud.phase !== 'play') {
      sfx('denied')
      return false
    }
    profile.inv.tanks--
    // The HUD drains the gel from its button and pours it into the bar from
    // where health stood (`ActionButtons`, `HudBars`); the repair itself is
    // instant, the animation only catches up.
    hud.gelFrom01 = Math.max(0, c.hp) / c.maxHp
    hud.gelUse++
    c.hp = c.maxHp
    c.power = c.maxPower
    this.fx.riseRing(this.player.x, this.player.y + 0.1, this.player.z, '#8dff7a', 0.9, 20)
    pushHud({ t: 'flash', color: '#8dff7a', strength: 0.35 })
    sfx('tank')
    bark('gel')
    this.coach.use('tank')
    this.lessons.gelUsed()
    this.dirty = true
    return true
  }

  private tally() {
    return { xp: this.xp, bolts: this.bolts, kills: this.kills, chests: this.chestsOpened, items: this.itemsFound, seconds: this.time }
  }

  // ─── Snapshot (resume) ──────────────────────────────────────────────────────

  private writeSnap(): void {
    if (!this.quest || this.finished) return
    writeSnapshot(this.buildSnap())
  }

  // ─── Retry from checkpoint (the Fortress) ──────────────────────────────────
  //
  // The Fortress is long, with mini-bosses, Vex and what follows him: a death
  // there offers a free "Retry from checkpoint" beside the gel and the ad
  // revive. The checkpoint is the whole mission as it stood when Flux reached
  // it (every machine down stays down, every door open stays open), at full
  // health, and a retry rebuilds the mission from it like a reload would.

  /** The last checkpoint, or null (none reached, or not a Fortress run). */
  private cpSnap: MissionSnapshot | null = null

  /** Whether this mission keeps checkpoints to retry from. */
  get keepsCheckpoints(): boolean {
    return this.quest?.sector === 'fortress'
  }

  /** A checkpoint to retry from is there. */
  get canRetryCheckpoint(): boolean {
    return !!this.cpSnap && !this.finished
  }

  /** The climb reached a checkpoint tile. */
  onCheckpoint(_n: number): void {
    this.keepRetryPoint()
  }

  /** Keep a retry point HERE (a checkpoint tile, a boss stage's start). */
  keepRetryPoint(): void {
    if (!this.keepsCheckpoints || !this.quest || this.finished) return
    const s = this.buildSnap()
    s.hp = Math.round(this.combat.maxHp)
    s.we = this.combat.maxWe
    s.atCheckpoint = true
    this.cpSnap = s
    this.dirty = true
  }

  /** Defeat modal → "Retry from checkpoint". */
  retryFromCheckpoint(): void {
    const s = this.cpSnap
    if (!s || this.finished) return
    this.finished = true
    writeSnapshot({ ...s, checkpoint: s })
    void retryFromSnapshot(s)
  }

  private buildSnap(): MissionSnapshot {
    const killed: number[] = []
    this.enemies.forEach((e, i) => { if (e.state === 'dead') killed.push(i) })
    return {
      quest: this.quest!,
      killed,
      opened: this.objects.chests.filter(c => c.opened).map(c => c.id),
      doors: this.doors.filter(d => d.opening).map(d => d.id),
      collected: [
        ...this.objects.cores.filter(c => c.taken).map(c => c.id),
        ...(this.objects.npc?.rescued ? [-1] : [])
      ],
      progress: this.objects.objective.progress,
      x: this.player.x,
      z: this.player.z,
      yaw: this.player.yaw,
      hp: Math.max(1, Math.round(this.combat.hp)),
      we: this.combat.we,
      bolts: this.bolts,
      xp: this.xp,
      kills: this.kills,
      t: this.time,
      done: false,
      walk: this.walk?.save(),
      climb: this.climb?.save(),
      borrowed: this.borrowed.save(),
      checkpoint: this.cpSnap ?? undefined,
      vex: this.descent && this.boss && this.descent.stage > 0 ? { stage: this.descent.stage, hp: Math.round(this.boss.hp) } : undefined
    }
  }

  private applySnapshot(s: MissionSnapshot): void {
    for (const i of s.killed) {
      const e = this.enemies[i]
      if (!e) continue
      e.state = 'dead'
      e.hp = 0
      e.deathT = 10
      e.root.visible = false
      e.shadow.visible = false
    }
    for (const id of s.opened) {
      const c = this.objects.chests[id]
      if (!c) continue
      c.opened = true
      c.openT = 1
      c.mesh.lid.rotation.x = -1.9
      this.nav.props[c.navIdx]!.active = false
    }
    for (const id of s.collected) {
      if (id === -1 && this.objects.npc) {
        this.objects.npc.rescued = true
        this.objects.npc.beamT = 1
        this.objects.npc.root.visible = false
        continue
      }
      const core = this.objects.cores[id]
      if (core) {
        core.taken = true
        core.mesh.root.visible = false
      }
    }
    for (const id of s.doors) {
      const d = this.doors[id]
      if (!d) continue
      d.opening = true
      d.locked = false
      d.open = 0.99
    }
    const ob = this.objects.objective
    ob.progress = Math.min(ob.count, s.progress)
    if (ob.progress >= ob.count) {
      ob.done = true
      hud.objectiveDone = true
    }
    const p = this.player
    p.x = p.px = s.x
    p.z = p.pz = s.z
    p.yaw = s.yaw
    this.combat.hp = Math.min(this.combat.maxHp, s.hp)
    this.combat.we = Math.min(this.combat.maxWe, s.we)
    this.bolts = s.bolts
    this.xp = s.xp
    this.kills = s.kills
    this.time = s.t
    // Which walkthrough doors are earned; `start()` locks the rest after this.
    this.walk?.restore(s.walk)
    // The retry point carries over a reload, and a retry keeps its own.
    this.cpSnap = retryPointOf(s)
    // Vex's stage and health (the Core Descent), after the climb placed Flux.
    if (s.vex && this.descent && this.boss) this.pendingVex = s.vex
    // The borrowed weapon's charges left, and the capsules already taken.
    this.borrowed.restore(s.borrowed)
    if (this.climb) {
      // A climb resumes on its last checkpoint, standing: never in mid-air,
      // on a lift or over a pit where the save caught it.
      this.climb.restore(s.climb)
      const at = this.climb.respawn()
      p.x = p.px = at.x
      p.z = p.pz = at.z
      p.y = p.py = p.safeY = at.y
      p.yaw = at.yaw
    }
  }

  // ─── Update ────────────────────────────────────────────────────────────────

  update(rawDt: number, first: boolean): void {
    // A freeze-frame: the world holds still, the effects play on.
    if (this.freeze.active) {
      this.stepFreeze(rawDt, first)
      return
    }
    // Hit-stop: the world slows to a crawl for a few frames on crits/parries.
    const dt = this.hitStop > 0 ? rawDt * 0.08 : rawDt
    this.hitStop = Math.max(0, this.hitStop - rawDt)
    this.time += dt
    this.phaseT += dt
    const p = this.player
    p.px = p.x
    p.pz = p.z
    p.py = p.y
    // The tower moves first: this step's lift motion is what carries a rider.
    this.climb?.update(dt, this.time, p, hud.phase === 'play' && !flow.modal)
    if (hud.phase === 'play') this.noteFooting(dt)

    if (hud.phase === 'beamIn') {
      this.stepBeamIn(dt, first)
    } else if (hud.phase === 'play') {
      this.updatePlayer(dt, first)
    } else if (hud.phase === 'dead') {
      this.stepDead(dt, rawDt)
    } else if (hud.phase === 'beamOut') {
      this.stepExit(dt, first)
    }

    for (const e of this.enemies) {
      const edt = frozenDt(e, dt)
      if (e.boss) updateBoss(this, e, edt, this.bossRoom)
      else updateEnemy(this, e, edt)
      // The climb: a machine keeps to its platform, a drone to Flux's height.
      if (this.climb && !e.boss) this.climb.tendFoe(e, p.y, dt)
      // Status effects from special weapons
      if (e.state !== 'dead') {
        if (e.burnT > 0) {
          const before = Math.floor(e.burnT * 2)
          e.burnT -= dt
          if (Math.random() < 0.4) this.fx.emit({ x: e.x + (Math.random() - 0.5) * 0.6, y: e.y + e.def.aimY * Math.random() * 1.4, z: e.z + (Math.random() - 0.5) * 0.6, vy: 2, color: '#ff7a2a', size: 0.45, sizeEnd: 0.05, life: 0.4 })
          if (Math.floor(e.burnT * 2) !== before) {
            e.lastWeapon = 'flameWave'
            this.system.damageEnemy(e, Math.max(1, Math.round(e.burnDps * 0.5)), { crit: false, charge: 0, fromX: e.x, fromZ: e.z, x: e.x, y: e.y + e.def.aimY, z: e.z, color: '#ff7a2a', special: true })
          }
        }
        if (e.frozenT > 0) e.frozenT -= dt
      }
    }
    // The arena's anti-cheese: a boss that cannot reach Flux enrages.
    const boss = this.boss
    if (this.arena && boss && this.bossStarted && boss.state !== 'dead' && hud.phase === 'play' && !this.descent?.falling) this.arena.update(dt, boss)
    if (this.coreGlow) {
      const k = 0.5 + 0.5 * Math.sin(this.time * 2.4)
      ;(this.coreGlow.material as MeshBasicMaterial).opacity = 0.35 + 0.25 * k
      this.coreGlow.scale.setScalar(1 + 0.08 * k)
      const band = this.coreGlow.parent?.getObjectByName('band')
      if (band) { band.rotation.z += dt * 0.6; band.position.y = 1.2 + 0.25 * Math.sin(this.time * 1.3) }
    }
    if (this.descent && boss) {
      const live = this.bossStarted && boss.state !== 'dead' && hud.phase === 'play'
      this.descent.update(dt, boss, live, hud.phase === 'play' && !flow.modal)
    }
    if (this.crane && boss) {
      const live = this.bossStarted && boss.state !== 'dead' && hud.phase === 'play' && boss.hp <= boss.maxHp * 0.5
      this.crane.update(dt, boss, live, hud.phase === 'play' && !flow.modal)
    }
    this.arenaDressing(dt)
    this.applyStageLight(dt)
    // Low health: a heartbeat, quicker the lower it gets (#114 sound pass).
    const hp01 = this.combat.hp / Math.max(1, this.combat.maxHp)
    if (hud.phase === 'play' && !this.combat.dead && hp01 < LOW_HP_BEAT) {
      this.heartT -= dt
      if (this.heartT <= 0) {
        this.heartT = 0.65 + 2 * hp01
        sfx('heartbeat')
      }
    } else this.heartT = 0
    // Entering the boss room triggers the Core Master
    if (this.boss && !this.bossStarted && this.bossRoom && hud.phase === 'play') {
      const i = Math.floor(p.x / CELL)
      const j = Math.floor(p.z / CELL)
      if (this.map.room[j * this.map.w + i] === this.bossRoom.id) this.startBoss()
    }
    this.weapons.update(dt)
    if (first && this.input.weaponQueued && hud.phase === 'play') {
      const q = this.input.weaponQueued
      if (q === 3) this.fireBorrowed()
      else this.fireWeapon((q - 1) as 0 | 1)
    }
    this.system.update(dt)
    this.stepShatter(dt)
    if (first) this.stepLava()
    this.fx.update(dt)
    this.markers.update(dt, this.time)
    this.shocks.update(dt)
    this.updateDoors(dt)
    this.updateRoomCulling()
    this.markerT = Math.max(0, this.markerT - dt)
    ;(this.marker.material as MeshBasicMaterial).opacity = p.path ? 0.55 + Math.sin(this.time * 8) * 0.25 : this.markerT * 2
    this.marker.scale.setScalar(p.path ? 1 + Math.sin(this.time * 6) * 0.08 : 1 + (0.5 - this.markerT) * 0.6)
    // The pad beams Flux in; he leaves by drone, so it stays idle after.
    this.pad.setBeamView(Math.hypot(p.x - this.pad.root.position.x, p.z - this.pad.root.position.z), hud.phase === 'beamIn' && this.phaseT < BEAM_IN_COLUMN, dt)
    this.pad.ring.rotation.y += dt * 0.6
    this.objects.update(dt, this.time)
    const lt = this.lessonTick
    lt.playing = hud.phase === 'play' && !flow.modal
    lt.combat = hud.combat
    // `learned`, not `mastered`: on touch the camera has no glyph to wait for.
    lt.controls = this.coach.learned('move') && this.coach.learned('look')
    lt.hp01 = this.combat.hp / this.combat.maxHp
    lt.tanks = profile.inv.tanks
    this.lessons.update(dt, lt)
    this.walk?.update(lt.playing, hud.combat)
    this.stepTraining(lt.playing, dt)
    this.training.update(this.time, lt.playing)
    this.updateDoorPrompt(dt, lt.playing)
    this.stepGuards()
    // Traps run on the mission's dt (hit-stop slows them) and park in a fight
    // that reaches them (`fightNear`).
    const tt = this.trapTick
    tt.playing = lt.playing
    tt.combat = this.fighting
    this.traps.update(dt, tt)
    this.updateBorrowed(dt, lt.playing)
    this.updateTrail(dt, lt.playing)
    this.tickAtlas(dt, lt.playing)

    // Interaction: the nearest chest / bot / sealed boss door in reach (a
    // walkthrough gate is not for opening by hand).
    if (hud.phase === 'play') {
      const near = this.objects.nearestInteractable(p.x, p.z, p.yaw, p.y)
      const door = this.bossStarted ? undefined : this.doors.find(d => d.locked && !d.held && Math.hypot(d.x - p.x, d.z - p.z) < 3.4)
      this.interact = near ?? (door ? { kind: 'door', ref: door } : null)
      if (first && this.input.interactQueued) this.doInteract()
      // Playtesters stood at the sealed shutter pressing shoot and block:
      // either one opens it too, when Flux faces it.
      else if (first && door && this.interact?.ref === door && (this.input.firePressed || this.input.blockPressed) &&
        Math.abs(angDiff(Math.atan2(-(door.x - p.x), -(door.z - p.z)), p.yaw)) < 1.05) this.doInteract()
      if (first && this.input.tankQueued) this.useTank()
      // B: beam out — the same rule as the button (objective done, room quiet).
      if (first && this.input.beamQueued && hud.objectiveDone && !hud.combat) this.beamOut()
    } else {
      this.interact = null
    }
    this.updateCoach()

    // Checkpoints: persist profile + mission snapshot at most every 2 s.
    this.snapT -= rawDt
    if (this.dirty && this.snapT <= 0 && hud.phase === 'play') {
      this.snapT = 2
      this.dirty = false
      saveProfile()
      this.writeSnap()
    }

    this.hudT -= rawDt
    if (this.hudT <= 0) {
      this.hudT = 1 / 15
      this.writeHud()
    }

    if (first) {
      this.handleTaps()
      consumeEdges(this.input)
    }
  }

  // ─── Freeze-frames (`sim/freezeCam.ts`) ──────────────────────────────────

  /** One step of a freeze-frame: only the effects, the death pops and the
   *  shot's own clock move. */
  private stepFreeze(dt: number, first: boolean): void {
    const pressed = first && this.input.anyPressed
    // The slide lesson's held leap: only a slide lets it land (the slide
    // itself happens on the next step, its press kept for it).
    if (this.slideCue && this.freeze.shot?.kind === 'lesson') {
      if (first && this.input.slideQueued) {
        // The slide must happen: no cooldown or empty power can eat it.
        this.combat.slideCd = 0
        this.combat.power = this.combat.maxPower
        this.slideCue = null
        this.slideCueDone = true
        hud.slideCue = false
        this.freeze.end()
        this.writeHud()
        return
      }
    }
    const ended = this.freeze.update(dt, pressed)
    this.fx.update(dt)
    this.system.rubble.update(dt, this.nav)
    this.shocks.update(dt)
    for (const e of this.enemies) if (e.state === 'dead' && !e.boss) updateEnemy(this, e, dt)
    this.freezeFx(dt)
    const r = this.rescue
    if (r?.spikes && this.freeze.t < RESCUE_IMPACT && Math.random() < 0.5) {
      this.fx.sparks(r.fx + (Math.random() - 0.5) * 0.6, r.bottom + 0.3 + Math.random(), r.fz + (Math.random() - 0.5) * 0.6, '#ffd84a', 3, 5, 0.12)
    }
    if (ended) this.onFreezeEnd(ended)
    this.hudT -= dt
    if (this.hudT <= 0 || ended) {
      this.hudT = 1 / 15
      this.writeHud()
    }
    if (first) consumeEdges(this.input)
  }

  /** Start a shot, from Flux's feet and facing unless the spec says so. */
  startFreeze(spec: Omit<FreezeSpec, 'hx' | 'hy' | 'hz' | 'hyaw'> & Partial<Pick<FreezeSpec, 'hx' | 'hy' | 'hz' | 'hyaw'>>): void {
    const p = this.player
    this.freeze.start({ hx: p.x, hy: p.y, hz: p.z, hyaw: p.yaw, ...spec })
    // A held charge must not fire on the frame the shot ends.
    this.combat.charging = false
    this.combat.charge = 0
    chargeHum(null)
    this.syncFreezeHud()
  }

  /** The freeze-frame's HUD fields (also part of every `writeHud`). */
  private syncFreezeHud(): void {
    const fz = this.freeze.shot
    hud.freezeKind = fz?.kind ?? ''
    hud.freezeFrame = fz?.frame ?? ''
    hud.freezeSkippable = !!fz?.skippable
    hud.freezeSkips = this.freeze.presses
    hud.killCams = this.killCamCount
  }

  /** Ask for a skip (the HUD's skip chip). */
  skipFreeze(): void {
    this.freeze.skip()
  }

  /** Kill-cams off for good (the in-shot button, F4); Options turns them on. */
  killCamsOff(): void {
    if (this.freeze.shot?.kind !== 'kill') return
    setKillCamsEnabled(false)
    this.freeze.end()
    this.onFreezeEnd('kill')
  }

  private onFreezeEnd(kind: FreezeKind): void {
    if (kind === 'sink') {
      this.exitView?.heroRoot.scale.set(1, 1, 1)
      this.respawnNow()
      return
    }
    // A barrel's shot left him squashed: whole again for the next one; the
    // rescue's big Atlas and its beam go.
    this.exitView?.heroRoot.scale.set(1, 1, 1)
    if (kind === 'rescue') {
      this.atlasWorld?.root.scale.setScalar(1)
      if (this.tractor) this.tractor.visible = false
    }
    if (kind === 'rescue' && this.rescue) {
      const r = this.rescue
      this.rescue = null
      this.placeAfterFall({ x: r.tx, y: r.ty, z: r.tz, yaw: r.tyaw })
      sfx('beamIn')
      this.dirty = true
    }
    const v = this.exitView
    if (v && hud.phase === 'play') {
      v.heroRoot.visible = false
      v.heroShadow.visible = false
    }
    void kind
    this.writeHud()
  }

  /** Effects around Flux while a trap's shot holds him (the kill-cam's are the
   *  machine's own debris). */
  private freezeFx(dt: number): void {
    const s = this.freeze.shot
    if (!s || s.kind !== 'trap') return
    const k = Math.min(1, dt * 60)
    if (Math.random() > 0.7 * k) return
    const x = s.hx + (Math.random() - 0.5) * 0.8
    const y = s.hy + 0.2 + Math.random() * 1.5
    const z = s.hz + (Math.random() - 0.5) * 0.8
    if (s.fx === 'volt') this.fx.sparks(x, y, z, Math.random() < 0.5 ? '#fff38a' : '#7fe8ff', 3, 4, 0.12)
    else if (s.fx === 'flame') this.fx.emit({ x, y, z, vy: 2.2, color: Math.random() < 0.5 ? '#ffb13c' : '#ff5a2a', size: 0.55, sizeEnd: 0.05, life: 0.45 })
    else if (s.fx === 'ice') this.fx.emit({ x, y, z, vy: 0.4, color: '#bff6ff', size: 0.3, sizeEnd: 0.02, life: 0.6 })
    else if (s.fx === 'flat') {
      // Flattened: cartoon stars circling over the pancake.
      const a = this.freeze.t * 9 + Math.random() * 0.4
      this.fx.emit({ x: s.hx + Math.cos(a) * 0.7, y: s.hy + 0.55, z: s.hz + Math.sin(a) * 0.7, vy: 0, color: '#fff38a', size: 0.28, sizeEnd: 0.05, life: 0.35 })
    } else this.fx.sparks(x, y, z, '#ffd84a', 2, 5, 0.1)
  }

  // ─── Training host (`sim/training.ts`) ──────────────────────────────────

  /**
   * The slide lesson's held leap (#266): while the slide is still to learn,
   * every leap of the room's Stomper that would land on Flux freezes at its
   * top, the view on it, and only a slide lets it come down (`stepFreeze`).
   * The HUD points three yellow arrows at the slide input meanwhile
   * (`hud.slideCue`).
   */
  private stepSlideCue(e: Enemy): void {
    if (this.slideCued && this.slideCued.state !== 'act') this.slideCued = null
    if (e.state !== 'act' || e.st < SLIDE_CUE_AT || this.slideCued === e || this.training.done.has('slide')) return
    this.slideCued = e
    this.slideCue = e
    hud.slideCue = true
    // The view goes up to it: the leap, held overhead, is the lesson.
    const p = this.player
    const ey = e.y + (e.floor ?? 0) + e.def.aimY
    p.yaw = Math.atan2(-(e.x - p.x), -(e.z - p.z))
    p.pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, Math.atan2(ey - (p.y + EYE_H), Math.max(0.8, Math.hypot(e.x - p.x, e.z - p.z)))))
    this.startFreeze({
      kind: 'lesson', dur: Infinity, frame: 'fp', skippable: false, fx: '',
      tx: e.x, ty: e.y + (e.floor ?? 0) + e.def.aimY, tz: e.z
    })
  }

  /** The checklist's tap on an open lesson: point the way for a while. */
  pointToLesson(id: TrainId): void {
    const at = this.lessonSpots.get(id)
    if (!at || this.training.done.has(id)) return
    this.lessonPointer = { x: at.x, z: at.z, until: this.time + LESSON_POINT_FOR }
  }

  /**
   * A hazard's hit on machines (`TrapHost` / `ClimbHost.hurtMachines`): every
   * awake machine the test catches — never a Core Master, never one asleep in
   * disguise — loses half of `cost01` of its own max health, once a burst
   * (`hazardCd`), with the hit's sparks and number.
   */
  hurtMachines(cost01: number, fromX: number, fromZ: number, hits: (x: number, y: number, z: number) => boolean): void {
    for (const e of this.enemies) {
      if (e.boss || e.state === 'dead' || e.dormant || e.offstage || (e.hazardCd ?? 0) > 0) continue
      const y = e.y + (e.floor ?? 0)
      if (!hits(e.x, y, e.z)) continue
      e.hazardCd = HAZARD_CD
      const dmg = Math.max(1, Math.round(e.maxHp * cost01 * HAZARD_MACHINE_SHARE))
      this.system.damageEnemy(e, dmg, { crit: false, charge: 0, fromX, fromZ, x: e.x, y: y + e.def.aimY, z: e.z, color: '#ff9a2e', special: true })
      if (!e.awake) wake(this, e)
    }
  }

  /** Where the beam lesson's prompt points: its drones, else its room. */
  private beamGoal(): { x: number; z: number; kind: string } | null {
    const at = this.lessons.weaponDronesAt
    if (at) return { x: at.x, z: at.z, kind: 'machine' }
    const b = this.map.beam
    const r = b ? this.map.rooms[b.room] : undefined
    return r ? { x: (r.x0 + r.w / 2) * CELL, z: (r.z0 + r.h / 2) * CELL, kind: 'room' } : null
  }

  /** An edge-leap happened: the gap lesson's proof. */
  private onEdgeLeap(): void {
    this.walk?.noteLeap()
    this.trainDone('gap')
  }

  // ─── The tutorial's lesson rooms (`sim/training.ts` over the walkthrough) ─

  /** Build time: the profile's done lessons, each lesson room's spot (the
   *  checklist), the hidden first door and the gap arrows. */
  private setupTraining(): void {
    for (const id of ['charge', 'block', 'slide', 'gel', 'gap', 'weapon'] as TrainId[]) {
      if (profile.tips[`train:${id}`]) this.training.done.add(id)
    }
    this.setupBeamLesson()
    this.setupGuards()
    this.setupExitRoom()
    this.setupLava()
    const walk = this.walk
    if (!walk) return
    for (const g of walk.plan.gates) {
      for (const st of g.steps) {
        const id = TRAIN_OF[st]
        if (!id) continue
        const r = this.map.rooms[g.room]!
        const x = (r.x0 + r.w / 2) * CELL
        const z = (r.z0 + r.h / 2) * CELL
        this.lessonSpots.set(id, { x, y: Math.max(0, floorAt(this.nav, x, z)), z })
      }
    }
    const gel = walk.plan.gel
    if (gel) this.lessonSpots.set('gel', { x: cellCenter(gel.spot.i), y: 0, z: cellCenter(gel.spot.j) })
    this.buildHolograms()
    // A built tutorial walls its first room in: the way on (the corridor
    // and its door) is behind a wall like any other until the charge lesson
    // is done, then that wall sinks (players took a shut door for the way on
    // and never met the drone; an open doorway onto nothing looked broken).
    const first = walk.plan.gates[0]
    if (first && this.map.walkSteps && walk.passed === 0) this.hideDoor(first.door)
    this.buildGapArrows()
  }

  /**
   * A stage's beam-in room teaches the newest weapon not yet taught (the one
   * the last Core Master gave): its door into the level stays shut until the
   * lesson is done. It is slotted first if it is not (a weapon the player
   * cannot fire cannot be taught). No weapon to teach: the door just opens.
   */
  /** The guard rooms' exits, held at the start (`Terrain.guards`). */
  private guardDoors: Array<{ room: number; door: number }> = []

  /** A mini-boss hall: its way out (the door from it) stays shut while a
   *  machine in it stands; the last one down opens it. */
  private setupGuards(): void {
    for (const room of this.map.terrain?.guards ?? []) {
      const d = this.map.doors.find(x => x.from === room && !x.boss)
      if (!d) continue
      this.holdDoor(d.id)
      this.guardDoors.push({ room, door: d.id })
    }
  }

  private stepGuards(): void {
    for (let n = this.guardDoors.length - 1; n >= 0; n--) {
      const g = this.guardDoors[n]!
      if (this.enemies.some(e => e.room === g.room && e.state !== 'dead' && !e.offstage)) continue
      // Spawned and all down (a room still waiting on its spawns has none).
      if (!this.enemies.some(e => e.room === g.room)) continue
      this.guardDoors.splice(n, 1)
      this.releaseDoor(g.door)
      this.say('guardDown')
    }
  }

  private setupBeamLesson(): void {
    const beam = this.map.beam
    if (!beam || this.setup.tutorial) return
    this.beamDoorId = beam.door
    const owned = profile.hero.weapons
    let id: WeaponId | null = null
    for (let k = owned.length - 1; k >= 0; k--) {
      const w = owned[k]!
      if (!profile.tips[`train:weapon:${w}`]) { id = w; break }
    }
    if (!id) return
    const slots = profile.hero.slots
    if (slots[0] !== id && slots[1] !== id) {
      if (!slots[0]) slots[0] = id
      else if (!slots[1]) slots[1] = id
      else slots[0] = id
      saveProfile()
    }
    this.beamTeach = id
    this.holdDoor(beam.door)
    // Its hologram: along the room's long side, playing toward the door.
    const r = this.map.rooms[beam.room]!
    const d = this.doors[beam.door]
    const cx = (r.x0 + r.w / 2) * CELL
    const cz = (r.z0 + r.h / 2) * CELL
    const along = r.w >= r.h ? [1, 0] : [0, 1]
    const s = d && (d.x - cx) * along[0]! + (d.z - cz) * along[1]! < 0 ? -1 : 1
    this.addHolo('weapon', beam.room, cx - along[0]! * s * 0.5, cz - along[1]! * s * 0.5, Math.atan2(-along[1]! * s, along[0]! * s), WEAPONS[id].color, id)
  }

  /** Per step while a beam lesson is owed: the drones come once Flux moves
   *  off the pad (never before he has his bearings); energy stays topped up
   *  for more tries; done, the door opens. */
  private stepBeamLesson(playing: boolean): void {
    const id = this.beamTeach
    const beam = this.map.beam
    if (!id || !beam || !playing) return
    const p = this.player
    const tr = this.training
    if (!this.beamStarted) {
      if (Math.hypot(p.x - this.map.start.x, p.z - this.map.start.z) < BEAM_MOVE) return
      this.beamStarted = true
      if (!this.lessons.teachWeapon(beam.room, id)) {
        // No row of drones fits: nothing to teach here; let him on.
        this.beamTeach = null
        this.releaseDoor(beam.door)
        return
      }
      tr.enter('weapon', this.time)
    }
    const at = this.lessons.weaponDronesAt
    this.trainSpot = at ? { x: at.x, y: at.y, z: at.z } : null
    this.combat.we = Math.max(this.combat.we, Math.min(this.combat.maxWe, this.weaponCost(id) * 2))
    if (this.lessons.weaponLearned === id) {
      markTip(`train:weapon:${id}`)
      this.trainDone('weapon')
      this.beamTeach = null
      this.releaseDoor(beam.door)
      tr.leave()
    }
  }

  // ─── Machines fall apart (#105) ─────────────────────────────────────────

  /** `e` breaks into the parts of its own model, here and now (once). */
  private shatterEnemy(e: Enemy, power = 1): void {
    if (e.shattered || !e.root) return
    if (!this.shatter) {
      if (!this.scene || !this.nav) return
      this.shatter = new Shatter(this.scene, {
        floorAt: (x, z, y) => floorAt(this.nav, x, z, y),
        solidAt: (x, z) => isSolidAt(this.nav, x, z)
      })
    }
    e.root.scale.setScalar(e.elite ? 1.18 : 1)
    this.shatter.burst(e.root, [], e.boss ? 12 : 5, { x: this.player.x, z: this.player.z }, power)
    e.shattered = true
    e.root.visible = false
  }

  /** Per step: the pieces; a boss falls apart once its death throes end. */
  private stepShatter(dt: number): void {
    for (const e of this.enemies) {
      if (e.boss && e.state === 'dead' && !e.shattered && e.deathT >= 1.55) this.shatterEnemy(e, 1.5)
    }
    this.shatter?.update(dt)
  }

  // ─── Lava (#279: a moving surface, embers rising off it) ────────────────

  private setupLava(): void {
    const t = this.map.terrain
    if (!t?.pitKind?.some(k => k === 'lava')) return
    const cells: Array<[number, number, number]> = []
    const w = this.map.w
    for (let k = 0; k < t.pit.length; k++) {
      if (!t.pit[k]) continue
      const room = this.map.room[k]!
      if (pitKindOf(t, room) !== 'lava') continue
      const i = k % w
      const j = (k - i) / w
      cells.push([cellCenter(i), (t.pitBottom[room] ?? 0) + 0.36, cellCenter(j)])
    }
    if (cells.length) this.lavaCells = cells
  }

  /** Per frame: the surface flows; embers drift up off cells near Flux. */
  private stepLava(): void {
    const cells = this.lavaCells
    if (!cells) return
    tickLava(this.time)
    const p = this.player
    for (let n = 0; n < 3; n++) {
      const c = cells[(Math.random() * cells.length) | 0]!
      if (Math.abs(c[0] - p.x) > 18 || Math.abs(c[2] - p.z) > 18) continue
      this.fx.emit({
        x: c[0] + (Math.random() - 0.5) * CELL, y: c[1] + 0.1, z: c[2] + (Math.random() - 0.5) * CELL,
        vy: 1.2 + Math.random() * 1.6, color: Math.random() < 0.6 ? '#ffb13c' : '#ff5a2a', size: 0.22, sizeEnd: 0.02, life: 1.4
      })
    }
  }

  // ─── The weapon lesson behind the boss (`map.exit`, #D26) ──────────────

  /** Build time: the room's door stays shut until the boss is down; its
   *  pedestal stands dark at the far end. A story stage only: a replay of a
   *  Master from the labyrinth has no such room. */
  private setupExitRoom(): void {
    const ex = this.map.exit
    if (!ex || this.setup.quest?.kind !== 'story') return
    this.holdDoor(ex.door)
    const pad = buildTeleporter(this.theme)
    pad.root.position.set(cellCenter(ex.pad[0]), 0, cellCenter(ex.pad[1]))
    this.scene.add(pad.root)
    this.exitPad = pad
  }

  /**
   * The boss is down: its weapon is copied and equipped at once, its arm
   * hangs in front of Flux as a hologram for a few seconds, and the door to
   * the lesson room opens. A weapon learned on an earlier run lights the
   * pedestal straight away.
   */
  private onBossDownWeapon(e: Enemy): void {
    const ex = this.map?.exit
    const w = Object.values(WEAPONS).find(d => d.from === e.bossId)
    if (!ex || !w || !this.exitPad || this.exitWeapon) return
    this.exitWeapon = w.id
    copyBossWeapon(w.id)
    saveProfile()
    this.vm.setColors(heroColors())
    const p = this.player
    const fx = -Math.sin(p.yaw)
    const fz = -Math.cos(p.yaw)
    this.armHolo?.dispose()
    this.armHolo = new ArmHologram(heroColors(), w.color)
    this.armHolo.place(this.scene, p.x + fx * 1.7, p.y + EYE_H - 0.1, p.z + fz * 1.7, p.yaw)
    sfx('loot')
    this.releaseDoor(ex.door)
    // The weapon's hologram in the lesson room, playing away from the door.
    const r = this.map.rooms[ex.room]!
    const d = this.doors[ex.door]!
    const cx = (r.x0 + r.w / 2) * CELL
    const cz = (r.z0 + r.h / 2) * CELL
    const l = Math.hypot(cx - d.x, cz - d.z) || 1
    const ux = (cx - d.x) / l
    const uz = (cz - d.z) / l
    this.addHolo('weapon', ex.room, cx - uz * 2.4 + ux * 0.5, cz + ux * 2.4 + uz * 0.5, Math.atan2(-uz, ux), w.color, w.id)
    if (profile.tips[`train:weapon:${w.id}`]) this.lightExit()
  }

  /** The boss is down and its weapon still to learn in the room behind the
   *  arena: no beam-out (B, the button, the pedestal) until it is (#110). */
  get weaponOwed(): boolean {
    return !!this.exitWeapon && !this.exitLit && !!this.exitPad
  }

  /** Where the chevrons lead after the boss: into the lesson room while its
   *  weapon is owed, then onto the lit pedestal. Null otherwise. */
  private exitGoal(): { x: number; z: number; kind: 'objective' } | null {
    const ex = this.map?.exit
    const pad = this.exitPad
    if (!ex || !pad || !this.exitWeapon) return null
    const a = this.exitAim
    if (this.exitLit) {
      a.x = pad.root.position.x
      a.z = pad.root.position.z
      return a
    }
    if (roomAt(this.map, this.player.x, this.player.z) === ex.room) return null
    const d = this.map.doors[ex.door]!
    const di = d.axis === 'x' ? d.dir : 0
    const dj = d.axis === 'z' ? d.dir : 0
    a.x = cellCenter(d.i + di * 2)
    a.z = cellCenter(d.j + dj * 2)
    return a
  }

  /** The room a weapon lesson runs in now, or -1. */
  private weaponRoomNow(): number {
    if (this.beamTeach && this.map.beam) return this.map.beam.room
    if (this.exitStarted && !this.exitLit && this.map.exit) return this.map.exit.room
    return -1
  }

  /** The lesson is done (or was learned before): the pedestal lights up. */
  private lightExit(): void {
    if (this.exitLit || !this.exitPad) return
    const owed = this.weaponOwed
    this.exitLit = true
    // The weapon learned: now the objective is done (it waited, #110).
    if (owed && this.objects.objective.done) this.onObjectiveDone()
    const at = this.exitPad.root.position
    this.fx.riseRing(at.x, 0.2, at.z, PAL.glowCyan, 1.3, 26)
    this.sfx('beamIn', at.x, at.z)
  }

  /** Per step: the arm hologram's time; in the room, the lesson (blue
   *  drones that never fire, energy kept topped up); then the pedestal. */
  private stepExitRoom(playing: boolean, dt: number): void {
    if (this.armHolo && !this.armHolo.update(dt)) {
      this.armHolo.dispose()
      this.armHolo = null
    }
    const ex = this.map.exit
    const pad = this.exitPad
    if (!ex || !pad) return
    const p = this.player
    const at = pad.root.position
    const dist = Math.hypot(p.x - at.x, p.z - at.z)
    pad.setBeamView(dist, this.exitLit, dt)
    pad.ring.rotation.y += dt * 0.6
    const id = this.exitWeapon
    if (!id || !playing) return
    const tr = this.training
    // In: the door shuts behind him (the way on is the pedestal).
    if (!this.exitShut && roomAt(this.map, p.x, p.z) === ex.room) {
      const d = this.doors[ex.door]
      if (d && Math.hypot(p.x - d.x, p.z - d.z) > CELL * 1.6) {
        this.exitShut = true
        this.shutDoor(ex.door)
      }
    }
    if (!this.exitStarted && roomAt(this.map, p.x, p.z) === ex.room) {
      this.exitStarted = true
      if (!this.exitLit) {
        if (this.lessons.teachWeapon(ex.room, id)) tr.enter('weapon', this.time)
        else this.lightExit()
      }
    }
    if (this.exitStarted && !this.exitLit) {
      // Out of the room the lesson's frame goes; back in, it comes back.
      const inRoom = roomAt(this.map, p.x, p.z) === ex.room
      if (tr.id !== 'weapon' && inRoom) tr.enter('weapon', this.time)
      else if (tr.id === 'weapon' && !inRoom) tr.leave()
      const d = this.lessons.weaponDronesAt
      this.trainSpot = d ? { x: d.x, y: d.y, z: d.z } : null
      this.combat.we = Math.max(this.combat.we, Math.min(this.combat.maxWe, this.weaponCost(id) * 2))
      if (this.lessons.weaponLearned === id) {
        markTip(`train:weapon:${id}`)
        this.trainDone('weapon')
        tr.leave()
        this.lightExit()
      }
    }
    // Onto the lit pedestal: the quadcopter, as B does.
    if (this.exitLit && dist < PAD_R && p.ground && hud.phase === 'play' && !hud.combat) this.beamOut()
  }

  /** Wall a door's corridor off from its room: a wall like the ones beside
   *  it across the corridor's mouth (in the room's own group, so it is drawn
   *  whenever the room is), solid to Flux and to shots. */
  private hideDoor(id: number): void {
    const d = this.doors[id]
    const spec = this.map.doors.find(x => x.id === id)
    if (!d || !spec) return
    const at = corridorMouth(this.map, spec)
    // As tall as the room's own walls (a stage's stand over its highest floor).
    const tall = (this.climb?.t.wallTop[d.from] ?? d.y + WALL_H) - d.y
    const mesh = buildWallPlug(this.theme, at.axis, at.n, tall)
    mesh.position.set(at.x, d.y, at.z)
    ;(this.level.rooms[d.from] ?? this.scene).add(mesh)
    const half = CELL / 2
    const thin = 0.22
    const slab: Slab = at.axis === 'x'
      ? { minX: at.x - thin, maxX: at.x + thin, minZ: at.z - half, maxZ: at.z + half, active: true }
      : { minX: at.x - half, maxX: at.x + half, minZ: at.z - thin, maxZ: at.z + thin, active: true }
    this.nav.slabs.push(slab)
    this.falseWalls.set(id, { mesh, slab, t: -1, x: at.x, y: d.y, z: at.z, tall })
  }

  /** A released false wall sinks into the floor (dust, a rumble); once down
   *  the way is free and the door at the corridor's end opens. */
  private updateFalseWalls(dt: number): void {
    for (const [id, fw] of this.falseWalls) {
      if (fw.t < 0) continue
      fw.t += dt
      const k = Math.min(1, fw.t / FALSE_WALL_SINK)
      fw.mesh.position.y = fw.y - k * (fw.tall + 0.5) + Math.sin(fw.t * 50) * 0.03 * (1 - k)
      if (Math.random() < 0.5) this.fx.emit({ x: fw.x + (Math.random() - 0.5) * 0.8, y: fw.y + 0.2, z: fw.z + (Math.random() - 0.5) * 0.8, vy: 1.2, color: '#b8ad98', size: 0.7, sizeEnd: 1.3, life: 0.6 })
      if (k < 1) continue
      fw.mesh.removeFromParent()
      fw.slab.active = false
      this.falseWalls.delete(id)
      const d = this.doors[id]
      if (!d) continue
      d.locked = false
      d.opening = true
      this.nav.pathBlock[d.cellJ * this.map.w + d.cellI] = 1
      d.mesh.lampMat.color.set(PAL.glowYellow)
      this.fx.riseRing(d.x, 0.15, d.z, PAL.glowYellow, 1.1, 22)
    }
  }

  /** Glowing floor arrows at the gap's take-off and landing (its `leap`
   *  link): where to walk off, where he comes down. */
  private buildGapArrows(): void {
    const walk = this.walk
    const t = this.map.terrain
    if (!walk || !t?.links || !this.lessonSpots.has('gap')) return
    const g = walk.plan.gates.find(x => x.steps.includes('gap' as never))
    if (!g) return
    const link = t.links.find(l => l.kind === 'leap' && this.map.room[l.from[1] * this.map.w + l.from[0]] === g.room)
    if (!link) return
    const shape = new Shape()
    shape.moveTo(0, 0.7)
    shape.lineTo(0.55, 0.05)
    shape.lineTo(0.2, 0.05)
    shape.lineTo(0.2, -0.6)
    shape.lineTo(-0.2, -0.6)
    shape.lineTo(-0.2, 0.05)
    shape.lineTo(-0.55, 0.05)
    shape.closePath()
    const geo = new ShapeGeometry(shape).rotateX(-Math.PI / 2)
    const fx = cellCenter(link.from[0])
    const fz = cellCenter(link.from[1])
    const tx = cellCenter(link.to[0])
    const tz = cellCenter(link.to[1])
    const yaw = Math.atan2(-(tx - fx), -(tz - fz))
    for (const [x, z, col] of [[fx, fz, '#ffd84a'], [tx, tz, '#7fffc8']] as const) {
      const mat = new MeshBasicMaterial({ color: new Color(col), transparent: true, opacity: 0.8, blending: AdditiveBlending, depthWrite: false, toneMapped: false })
      const m = new Mesh(geo, mat)
      m.position.set(x, floorAt(this.nav, x, z) + 0.05, z)
      m.rotation.y = yaw
      m.renderOrder = 3
      this.propParent(x, z).add(m)
      this.gapArrows.push(m)
    }
  }

  /**
   * Per step: the lesson room Flux is in runs its beats (`sim/training.ts`),
   * with the subject its arrow marks; leaving it takes the vignette away. The
   * gel lesson (a corridor) runs from its trap to its end. The holograms and
   * the arrows follow (`stepHolograms`).
   */
  private stepTraining(playing: boolean, dt: number): void {
    this.trainSpot = null
    this.stepTrainingBeats(playing)
    this.stepExitRoom(playing, dt)
    if (playing) this.stepHolograms(dt)
  }

  private stepTrainingBeats(playing: boolean): void {
    const walk = this.walk
    const tr = this.training
    const p = this.player
    if (this.beamTeach) this.stepBeamLesson(playing)
    // The gap arrows breathe until the gap has been crossed.
    const gapOpen = !tr.done.has('gap')
    for (const a of this.gapArrows) {
      a.visible = gapOpen
      ;(a.material as MeshBasicMaterial).opacity = 0.45 + 0.4 * Math.sin(this.time * 4)
    }
    if (tr.id === 'gel') {
      this.gelHoloOn = true
      if (this.lessons.gelEnded) {
        this.trainDone('gel')
        tr.leave()
      }
      return
    }
    if (!walk?.active || !playing) return
    const g = walk.current
    const here = roomAt(this.map, p.x, p.z)
    let id: TrainId | null = null
    if (g && here === g.room) {
      for (const st of g.steps) {
        const t = TRAIN_OF[st]
        if (t) { id = t; break }
      }
    }
    if (!id) {
      // A weapon lesson runs in its own room (the beam-in room, the room
      // behind the boss); out of it, its label and vignette go too.
      if (tr.id && (tr.id !== 'weapon' || here !== this.weaponRoomNow())) tr.leave()
      return
    }
    // The charge lesson waits for a first step toward its drones (or a shot
    // at one): Flux has his bearings before time stops for the card.
    if (id === 'charge' && tr.id !== id && !this.chargeLessonDue()) return
    if (tr.id !== id) tr.enter(id, this.time)
    // The subject, fresh every step (a machine walks).
    if (id === 'charge') {
      const a = this.lessons.targetAt
      this.trainSpot = a ? { x: a.x, y: a.y, z: a.z } : null
      if (!this.lessons.droneUp) this.trainDone('charge')
    } else if (id === 'block' || id === 'slide') {
      const e = walk.teacher()
      if (e && e.state !== 'dead') {
        this.trainSpot = { x: e.x, y: e.y + (e.floor ?? 0) + e.def.aimY + e.def.hitR, z: e.z }
        if (id === 'slide') this.stepSlideCue(e)
      }
    }
  }

  /**
   * Build time: a hologram in every lesson room of the walkthrough, one on
   * the gap's leap (walking the very path the player must take), one by the
   * gel plate. Each plays side-on to the way the player comes in.
   */
  private buildHolograms(): void {
    const walk = this.walk
    if (!walk) return
    const t = this.map.terrain
    for (const g of walk.plan.gates) {
      for (const st of g.steps) {
        const id = HOLO_OF[st]
        if (!id) continue
        const r = this.map.rooms[g.room]!
        let x = (r.x0 + r.w / 2) * CELL
        let z = (r.z0 + r.h / 2) * CELL
        let yaw: number
        if (id === 'gap') {
          const link = t?.links?.find(l => l.kind === 'leap' && this.map.room[l.from[1] * this.map.w + l.from[0]] === g.room)
          if (!link) continue
          const fx = cellCenter(link.from[0])
          const fz = cellCenter(link.from[1])
          const tx = cellCenter(link.to[0])
          const tz = cellCenter(link.to[1])
          x = (fx + tx) / 2
          z = (fz + tz) / 2
          yaw = Math.atan2(-(tz - fz), tx - fx)
        } else {
          // Off to one side of the room's middle, where its machines stand,
          // and playing away from the way in (the start room: from the pad):
          // seen from behind, the way the player sees his own Flux do it.
          const [dx, dz] = g.room === walk.plan.gates[0]!.room ? [this.map.start.x, this.map.start.z] : doorwayOf(this.map, g.room)
          const ix = x - dx
          const iz = z - dz
          const il = Math.hypot(ix, iz) || 1
          const ux = ix / il
          const uz = iz / il
          const side = Math.min(2.8, Math.max(0, Math.min(r.w, r.h) * CELL / 2 - 2.2))
          // Its Flux (2 m behind its middle) stands level with the room's middle.
          x += -uz * side + ux * 2
          z += ux * side + uz * 2
          yaw = Math.atan2(-uz, ux)
        }
        this.addHolo(id, g.room, x, z, yaw)
      }
    }
    const gel = walk.plan.gel
    const gd = gel ? this.doors[gel.door] : undefined
    if (gel && gd) {
      // A few metres on from the plate toward the door it shuts: where he looks.
      const sx = cellCenter(gel.spot.i)
      const sz = cellCenter(gel.spot.j)
      const l = Math.hypot(gd.x - sx, gd.z - sz) || 1
      const k = Math.min(2.6, l * 0.6) / l
      this.addHolo('gel', -1, sx + (gd.x - sx) * k, sz + (gd.z - sz) * k, Math.atan2(-(gd.z - sz), gd.x - sx) + Math.PI / 2)
    }
  }

  private addHolo(id: HoloId, room: number, x: number, z: number, yaw: number, weaponColor?: string, weapon?: WeaponId): void {
    const holo = new LessonHologram(id, { weaponColor, weapon })
    holo.place(this.scene, x, Math.max(0, floorAt(this.nav, x, z)), z, yaw)
    this.holos.push({ holo, room, x, z })
  }

  /** Per step: each hologram up while Flux is in its room (#269: even with
   *  its lesson learned, until he walks out), its input pinned over it on
   *  the HUD; the yellow arrows over what the lessons want hit (#D31). */
  private stepHolograms(dt: number): void {
    const p = this.player
    const here = roomAt(this.map, p.x, p.z)
    let glyph: LessonHologram | null = null
    for (const h of this.holos) {
      const show = h.room >= 0 ? here === h.room : this.gelHoloOn && Math.hypot(p.x - h.x, p.z - h.z) < GEL_HOLO_NEAR
      h.holo.update(dt, show)
      if (show && !glyph) glyph = h.holo
    }
    const g = glyph?.glyph()
    hud.holoAct = g?.act ?? ''
    hud.holoDown = !!g?.down
    if (glyph && g?.act) {
      glyph.headAt(_holoAt)
      this.project(_holoAt.x, _holoAt.y, _holoAt.z, _holoPt)
      hudLive.holoX = _holoPt.x
      hudLive.holoY = _holoPt.y
      hudLive.holoOn = _holoPt.visible
    } else hudLive.holoOn = false
    // The arrows: the lesson's subject, and the crate lesson's crate.
    let n = 0
    const at = this.trainSpot
    const tr = this.training
    if (at && tr.id && tr.phase !== 'done') {
      const top = tr.id === 'charge' || tr.id === 'weapon' ? at.y + 0.7 : at.y
      this.arrow(n++).update(dt, true, at.x, top, at.z)
    }
    const crate = this.walk?.current?.steps.includes('crate') ? this.lessons.crateAt : null
    if (crate) this.arrow(n++).update(dt, true, crate.x, Math.max(0, floorAt(this.nav, crate.x, crate.z)) + 1.5, crate.z)
    for (let k = n; k < this.targetArrows.length; k++) this.targetArrows[k]!.update(dt, false, 0, 0, 0)
  }

  private arrow(k: number): TargetArrow {
    let a = this.targetArrows[k]
    if (!a) {
      a = new TargetArrow()
      this.scene.add(a.root)
      this.targetArrows.push(a)
    }
    return a
  }

  /** The charge lesson's start: Flux is a step closer to the training drone
   *  than his pad is, or has shot at it. A lesson done already, or a drone
   *  popped from the pad, has nothing to wait for. */
  private chargeLessonDue(): boolean {
    const a = this.lessons.droneAt
    if (!a || this.training.done.has('charge') || this.lessons.droneShot) return true
    return steppedToward(a, this.map.start, this.player)
  }

  /** Does a slide tick the slide lesson off? In the tutorial, only one made
   *  in the lesson (`Training.counts`); anywhere else, any. */
  private slideCounts(): boolean {
    // In the lesson, only the slide that answers the held leap (#105 note:
    // a slide made before any leap ticked it off, so it never froze).
    if (this.walk && this.training.id === 'slide' && !this.training.done.has('slide')) return this.slideCueDone
    return !this.walk || this.training.counts('slide')
  }

  /** A lesson done by the player's own hand: ticked off for good. */
  private trainDone(id: TrainId): void {
    if (!this.training.done.has(id)) markTip(`train:${id}`)
    // The charge lesson has taught shooting and charging: their glyphs retire.
    if (id === 'charge') {
      this.coach.master('fire')
      this.coach.master('charge')
    }
    this.training.complete(id)
  }

  /** A machine went down: maybe the kill-cam (`sim/killCam.ts`). */
  private maybeKillCam(e: Enemy): void {
    if (e.boss || hud.phase !== 'play' || this.freeze.active || this.exit.active) return
    const p = this.player
    let alertNear = false
    for (const o of this.enemies) {
      if (o === e || o.state === 'dead' || !o.awake || o.dormant) continue
      if (Math.hypot(o.x - p.x, o.z - p.z) < KILLCAM_ALERT_R) { alertNear = true; break }
    }
    let hazardNear = false
    for (const s of this.traps.traps) {
      if (s.stage !== 'spent' && Math.hypot(s.spot.x - p.x, s.spot.z - p.z) < KILLCAM_HAZARD_R) { hazardNear = true; break }
    }
    if (!hazardNear && this.climb?.hazardNear?.(p.x, p.z, KILLCAM_HAZARD_R)) hazardNear = true
    const ok = wantsKillCam({
      enabled: killCamsEnabled.value,
      tutorial: !!this.setup.tutorial,
      boss: false,
      mini: !!e.mini,
      kind: e.kind,
      seen: this.killCamSeen,
      sliding: this.combat.slideT > 0,
      airborne: !!this.climb && !p.ground,
      hazardNear,
      alertNear,
      busy: !!flow.modal || this.lessons.focus(p.x, p.z, p.yaw),
      roll: Math.random()
    })
    if (!ok) return
    this.killCamSeen.add(e.kind)
    this.killCamCount++
    // Flux turns to face his kill; the machine's middle is the subject.
    const yaw = Math.atan2(-(e.x - p.x), -(e.z - p.z))
    this.startFreeze({
      kind: 'kill', dur: KILLCAM_DUR, frame: 'shoulder', hyaw: yaw, skippable: true, fx: 'crumble',
      tx: e.x, ty: e.y + (e.floor ?? 0) + e.def.aimY, tz: e.z
    })
  }

  /** Down: the death camera drops, and the defeat modal opens once the GAME
   *  OVER banner has held (`DEFEAT_DELAY`). */
  private stepDead(dt: number, rawDt: number): void {
    this.deathT += dt
    if (this.respawnT > 0) {
      this.respawnT -= rawDt
      if (this.respawnT <= 0) flow.modal = 'defeat'
    }
  }

  /** One step of the beam-in (`sim/beamIn.ts`): the landing's beat, the skip,
   *  and the handover to play. */
  private stepBeamIn(dt: number, first: boolean): void {
    const p = this.player
    this.beamPrevT = this.phaseT - dt
    // Any press once it has begun: straight to play (the press still counts —
    // a thumb on the stick is already walking).
    if (first && this.input.anyPressed && this.phaseT >= BEAM_IN_SKIP_AFTER) this.phaseT = BEAM_IN_END
    if (!this.beamLanded && this.phaseT >= BEAM_IN_LAND) {
      this.beamLanded = true
      this.atlas?.event('landed')
      this.prefetchStoryScenes()
      if (this.phaseT < BEAM_IN_END) {
        sfx('deckLand')
        this.fx.sparks(p.x, p.y + 0.3, p.z, PAL.glowCyan, 10, 3, 0.16)
      }
      this.fx.riseRing(p.x, p.y + 0.2, p.z, PAL.glowCyan, 0.9, 20)
    }
    const o = beamInPose(this.phaseT, this.beamPose)
    if (hud.introCine !== o.cine) hud.introCine = o.cine
    const skip = this.phaseT >= BEAM_IN_SKIP_AFTER && this.phaseT < BEAM_IN_END
    if (hud.cineSkip !== skip) hud.cineSkip = skip
    if (this.phaseT >= BEAM_IN_END) {
      hud.phase = 'play'
      this.phaseT = 0
      this.startStoryBeat()
      // The lab's rewarded gift pays out as he lands, where the fly-in is
      // seen. A resume already had its start (and its gift), so only a fresh
      // mission claims one; a mission quit mid-beam leaves it pending.
      if (!this.setup.snapshot && claimGiftTank()) {
        pushHud({ t: 'toast', key: 'loot.giftTank', color: '#8dff7a' })
        sfx('loot')
      }
      hud.introCine = false
      hud.cineSkip = false
      const v = this.exitView
      if (v) {
        v.heroRoot.visible = false
        v.heroShadow.visible = false
        v.heroRoot.scale.setScalar(1)
      }
    }
  }

  /** One step of the exit cutscene. A fresh press (after the first moments)
   *  skips to the lift-off; the beats themselves land in `exitEvent`. */
  private stepExit(dt: number, first: boolean): void {
    const run = this.exit
    if (!run.active) return
    run.update(dt, first && this.input.anyPressed)
    const o = run.sample(run.time, this.exitPose)
    // Flux's body goes where his model does: room culling, the fog's reach
    // and the listener follow him onto the deck.
    const p = this.player
    p.x = o.hx
    p.z = o.hz
    p.y = o.hy
    // The rotors: a pulsed hum (each pulse a one-shot, so a mute or an ad
    // silences it like any sound), louder as the drone nears the lens.
    this.humT -= dt
    if (this.humT <= 0) {
      this.humT = run.lifted ? 0.3 : 0.4
      const c = this.camera.position
      const d = Math.hypot(o.dx - c.x, o.dy - c.y, o.dz - c.z)
      sfx(run.lifted ? 'droneHumHi' : 'droneHum', 0, Math.max(0.2, Math.min(1, 1.35 - d / 14)))
    }
    const skip = run.skippable
    if (hud.cineSkip !== skip) hud.cineSkip = skip
  }

  /**
   * The objective locator (`sim/locator.ts`). A boss map points at the arena
   * (the Core Master is offstage until its entrance, so the room IS where it
   * is) and measures the retire distance to the shutter; any other map points
   * where the floor trail leads. `trailGoal` is the trail's own answer this
   * step when it ran (undefined when it did not), so the objective scan is
   * not paid twice.
   */
  private updateLocator(dt: number, playing: boolean, trailGoal: { x: number; z: number } | null | undefined): void {
    const p = this.player
    const L = this.locatorPoint
    const li = this.locatorIn
    const door = this.bossRoom ? this.bossDoor() : null
    li.playing = playing
    li.quiet = !this.fighting && !hud.lesson && !this.walkthroughActive()
    li.boss = !!door
    li.finished = this.objects.objective.done || this.bossStarted || this.boss?.state === 'dead'
    if (door && this.bossRoom) {
      const [cx, cz] = roomCenter(this.bossRoom)
      L.x = cx
      L.z = cz
      // On a terrain map the arena's floor (y = 0 by design) is read, not
      // assumed: the triangle floats over the floor it points at.
      L.y = this.map?.terrain ? Math.max(-60, floorAt(this.nav, cx, cz)) + 2.4 : 2.4
      li.hasGoal = true
      li.dist = Math.hypot(door.x - p.x, door.z - p.z)
    } else if (trailGoal !== undefined) {
      // The trail runs exactly when the locator may (live play, quiet), so a
      // step without its answer is one where the triangle holds still anyway.
      li.hasGoal = !!trailGoal
      if (trailGoal) {
        L.x = trailGoal.x
        L.z = trailGoal.z
        L.y = this.map?.terrain ? Math.max(-60, floorAt(this.nav, trailGoal.x, trailGoal.z)) + 1.6 : 1.6
        li.dist = Math.hypot(trailGoal.x - p.x, trailGoal.z - p.z)
      }
    }
    this.locator.update(dt, li)
    if (this.locator.popped) {
      this.locator.popped = false
      sfx('locate')
      // What the yellow triangle is, the first time ever it shows.
      if (!this.setup.tutorial) this.atlas?.say('hint.locator')
    }
    L.alpha = this.locator.alpha
  }

  /**
   * The floor trail (`fx/objectiveTrail.ts`), then the locator from its
   * answer. Never over a fight or a modal. In the tutorial walkthrough it
   * leads to the walkthrough's own goal (`Walkthrough.goal`) — each lesson
   * in turn, the door it opens, the gel plate, the chest — from the moment
   * the coach's move glyph is learned (a returning player: the first frame
   * of play). A live scene lesson keeps it only while that lesson's
   * subject is the goal and the player is out of its room: in the room the
   * lesson's glyph and edge bubble show the way, and two markers would
   * argue. Elsewhere, and past the walkthrough, it leads to the mission's
   * objective and never over a lesson. The locator never shows during the
   * walkthrough (`updateLocator`): the trail alone guides it.
   */
  private updateTrail(dt: number, playing: boolean): void {
    const p = this.player
    const ti = this.trailIn
    const walk = this.walk?.active ? this.walk : null
    const after = this.exitGoal()
    ti.px = p.x
    ti.pz = p.z
    ti.time = this.time
    ti.yaw = p.yaw
    // The chevrons pulse in the first two missions, while they are new.
    ti.pulse = !!this.setup.tutorial || profile.world.bosses.length <= 1
    if (after) {
      // After the boss (#110): to the lesson room, then the pedestal.
      ti.enabled = playing && !this.fighting
      ti.target = ti.enabled ? after : null
    } else if (walk) {
      // Not before the coach's first glyph is learned: on a phone the first
      // chevrons lay across the stick's ∞ finger, and the first goal (the
      // drone) hovers in plain view in front of the pad anyway.
      const goal = playing && !this.fighting && this.coach.learned('move') ? walk.goal() : null
      const lesson = hud.lesson
      ti.target = goal && (!lesson || (!lesson.done && (goal.kind === 'drone' || goal.kind === 'crate') && !this.lessonInRoom()))
        ? goal
        : null
      ti.enabled = ti.target !== null
    } else {
      ti.enabled = playing && !this.fighting && !hud.lesson
      ti.target = ti.enabled ? this.objects.target(p.x, p.z, this.enemies) : null
    }
    this.trail.update(dt, ti)
    this.updateLocator(dt, playing, ti.enabled && (!walk || after) ? ti.target : undefined)
  }

  /** Feed the control coach what is happening right now (see `sim/coach.ts`). */
  private updateCoach(): void {
    const p = this.player
    let teleBlock = false
    let teleRed = false
    for (const e of this.enemies) {
      if (e.state !== 'tele' || !e.awake) continue
      if (Math.hypot(e.x - p.x, e.z - p.z) > 16) continue
      if (e.teleRed) teleRed = true
      else teleBlock = true
    }
    const c = this.coachCtx
    c.time = this.time
    c.family = this.input.device
    c.playing = hud.phase === 'play' && !flow.modal
    c.combat = hud.combat
    c.aimCandidate = this.aimCandidate
    // The tutorial teaches the shield and the slide in their own rooms: their
    // glyphs wait for those lessons (the shield glyph came up at the crate
    // room's Hardhat, a room before the shield lesson).
    const walk = this.walk?.active ? this.training : null
    c.teleBlock = teleBlock && (!walk || walk.done.has('block'))
    c.teleRed = teleRed && (!walk || walk.done.has('slide'))
    c.hp01 = this.combat.hp / this.combat.maxHp
    // The tutorial keeps the gel's glyph for its own lesson (a playtester took
    // the plain heal glyph in the slide room for that lesson).
    c.tanks = this.setup.tutorial && !this.training.done.has('gel') ? 0 : profile.inv.tanks
    // The charge lesson taught shooting and charging, on this run or one
    // before: their glyphs stay retired (a save that had learned it kept
    // showing both mice in the next rooms).
    if (this.training.done.has('charge')) {
      if (!this.coach.mastered('fire')) this.coach.master('fire')
      if (!this.coach.mastered('charge')) this.coach.master('charge')
    }
    c.hasWeapon = !!profile.hero.slots[0] || !!profile.hero.slots[1]
    c.canInteract = !!this.interact
    // A lesson hologram shows its own input: the coach hushes all but the
    // thumbs and survival (a fire glyph kept coming back in the shield and
    // slide lessons, pointing at the wrong button).
    c.quiet = this.lessons.focus(p.x, p.z, p.yaw) || hud.holoAct !== ''
    c.veteran = profile.world.tutorialDone
    c.gelLesson = this.lessons.gelLive || !!this.walk?.gelPending
    c.blockLesson = !!this.walk?.blockPending(p.x, p.z)
    c.lessonsTeach = !!this.setup.tutorial
    c.fireLesson = this.lessons.shootLive || (this.training.id === 'charge' && (this.training.phase === 'intro' || this.training.phase === 'try'))
    this.coach.update(c)
  }

  /** The HUD's "?" button: bring the core control glyphs back. */
  showHelp(): void {
    this.coach.help()
    this.hudT = 0
  }

  /** A shot bounced off a guard (CombatHost): the charge shot's moment. */
  onDeflect(): void {
    this.coach.deflected()
  }

  /** Act on the current interactable (button / E key / tapping it). */
  doInteract(): void {
    const it = this.interact
    if (!it || hud.phase !== 'play') return
    if (it.kind === 'chest') this.objects.openChest(it.ref as Chest)
    else if (it.kind === 'npc') this.objects.rescue(it.ref as NonNullable<MissionObjects['npc']>)
    else if (it.kind === 'door') this.openBossDoor(it.ref as DoorState)
    this.interact = null
    this.dirty = true
    this.coach.use('interact')
  }

  private updatePlayer(dt: number, first: boolean): void {
    const p = this.player
    const c = this.combat
    const inp = this.input
    const st = this.stats

    // ── Timers & regen ──
    c.fireCd -= dt
    c.iframes = Math.max(0, c.iframes - dt)
    c.hurtT = Math.max(0, c.hurtT - dt)
    if (this.flatT > 0) {
      this.flatT = Math.max(0, this.flatT - dt)
      if (this.flatT === 0) sfx('fumble')
    }
    // Snapped to 0 within float dust of it: 90 steps of 1/60 leave 1.5 s at
    // +3e-16, and that must not push the next slide a whole step late.
    c.slideCd = c.slideCd - dt > 1e-9 ? c.slideCd - dt : 0
    c.guardBroken = Math.max(0, c.guardBroken - dt)
    c.recoil = Math.max(0, c.recoil - dt * 6)
    const recovered = this.fumble.update(dt)
    if (!c.blocking) {
      c.powerDelay -= dt
      if (c.powerDelay <= 0) c.power = Math.min(c.maxPower, c.power + 26 * dt)
    }
    if (!hud.combat && st.regen > 0) c.hp = Math.min(c.maxHp, c.hp + c.maxHp * st.regen * dt)

    // ── Targeting ──
    this.updateTargeting(dt)

    // ── Block ──
    if (inp.blockPressed) {
      c.blockPressedAt = this.time
      c.riposteT = 0
    }
    c.riposteT = Math.max(0, c.riposteT - dt)
    c.blocking = inp.blockHeld && c.riposteT <= 0 && c.guardBroken <= 0 && c.slideT <= 0 && c.hurtT <= 0

    // ── Fire / charge (MegaMan: shoot on press, charge while held) ──
    // A fumble's flailing arm neither fires nor charges (`sim/fumble.ts`).
    const canAct = c.hurtT <= 0 && c.guardBroken <= 0 && c.slideT <= 0 && !c.blocking && !this.fumble.panicking
    if (first && inp.firePressed && canAct && this.input.fireHeld !== undefined) {
      if (c.fireCd <= 0 && this.activePellets() < 3) this.firePellet()
      c.charging = true
      c.charge = 0
    }
    // The panic is over and fire is still held: the charge starts again.
    if (recovered && inp.fireHeld && canAct && !c.dead && !c.charging) {
      c.charging = true
      c.charge = 0
    }
    // The muzzle spits sparks while the arm flails.
    if (this.fumble.panicking && Math.random() < 0.35) {
      const m = this.muzzle()
      this.fx.sparks(m[0], m[1], m[2], Math.random() < 0.5 ? '#ffd84a' : '#7ff4ff', 3, 4, 0.1)
    }
    if (c.charging && inp.fireHeld) {
      const before = chargeInfo(c.charge, st).level
      c.charge += dt
      const after = chargeInfo(c.charge, st).level
      if (after > before) sfx(after === 1 ? 'charge1' : after === 2 ? 'charge2' : 'charge3')
    }
    if (first && inp.fireCancelled) {
      // The press became a look drag: the charge is dropped, not fired.
      c.charging = false
      c.charge = 0
    }
    if (first && inp.fireReleased && c.charging) {
      const info = chargeInfo(c.charge, st)
      if (info.level !== 0 && canAct) this.fireCharged(info.level, info.perfect)
      // Let go too soon at a lesson's drone or crate: its glyph shakes.
      else if (info.level === 0 && c.charge >= EARLY_HOLD) this.lessons.earlyRelease(p.x, p.z, p.yaw)
      c.charging = false
      c.charge = 0
    } else if (c.charging && !inp.fireHeld && !inp.fireReleased) {
      // Lost the hold without a release edge (focus loss) — drop the charge.
      c.charging = false
      c.charge = 0
    }

    // ── Slide ── (the climb: a ground move; on a ladder it lets go). A press
    // while it cools down is dropped with this step's edges, never held: no
    // surprise slide a second later.
    // A wall-kick shaft takes the slide as a kick (at its foot or on it).
    const kicked = first && inp.slideQueued && !!this.climb && !this.fumble.stunned && this.flatT <= 0 && this.climb.kick(p)
    if (first && inp.slideQueued && this.climb && p.ladder >= 0 && !kicked) this.climb.letGo(p)
    if (first && inp.slideQueued && !kicked && c.slideCd <= 0 && c.slideT <= 0 && c.power >= st.slideCost && !this.fumble.stunned && this.flatT <= 0 && (!this.climb || this.climb.canSlide(p))) {
      let dx = 0
      let dz = 0
      const stick = Math.hypot(inp.moveX, inp.moveY)
      const fwdX = -Math.sin(p.yaw)
      const fwdZ = -Math.cos(p.yaw)
      const rightX = Math.cos(p.yaw)
      const rightZ = -Math.sin(p.yaw)
      if (stick > 0.2) {
        dx = fwdX * inp.moveY + rightX * inp.moveX
        dz = fwdZ * inp.moveY + rightZ * inp.moveX
      } else {
        dx = -fwdX
        dz = -fwdZ // no direction: hop back
      }
      const l = Math.hypot(dx, dz) || 1
      c.slideDX = dx / l
      c.slideDZ = dz / l
      c.slideT = 0.28
      c.slideCd = Math.max(SLIDE_CD_MIN, SLIDE_CD * st.slideCdMul)
      hudLive.slideCdMax = c.slideCd
      c.iframes = Math.max(c.iframes, 0.22)
      c.power -= st.slideCost
      c.powerDelay = 0.6
      p.path = null
      sfx('slide')
      this.coach.use('slide')
      if (this.slideCounts()) {
        this.walk?.noteSlide()
        this.trainDone('slide')
      }
      this.fx.emit({ x: p.x, y: p.y + 0.2, z: p.z, color: '#dfefff', size: 0.9, sizeEnd: 1.6, life: 0.3 })
    }

    // ── Movement ──
    let tx = 0
    let tz = 0
    const fwdX = -Math.sin(p.yaw)
    const fwdZ = -Math.cos(p.yaw)
    const rightX = Math.cos(p.yaw)
    const rightZ = -Math.sin(p.yaw)
    // Back from a pit: the stick is ignored for a beat, so a held "forward"
    // does not walk straight back off the ledge that was just restarted on.
    this.pitHold = Math.max(0, this.pitHold - dt)
    // Stunned by a fumble: no moving either.
    const stunned = this.fumble.stunned
    // Riding (a stage's rail cart): the stick waits, looking and shooting work.
    const riding = !!this.climb?.locksMove()
    if (riding) p.path = null
    const stick = this.pitHold > 0 || stunned || riding || this.flatT > 0 ? 0 : Math.hypot(inp.moveX, inp.moveY)
    const speedMul = st.moveMul * (c.blocking ? 0.45 : 1) * (c.hurtT > 0 ? 0.5 : 1)
    if (c.slideT > 0) {
      c.slideT -= dt
      const sp = 15
      tx = c.slideDX * sp
      tz = c.slideDZ * sp
      if (Math.random() < 0.6) this.fx.emit({ x: p.x, y: p.y + 0.12, z: p.z, color: '#cfe0ff', size: 0.5, sizeEnd: 1.1, life: 0.25 })
    } else if (stick > 0.01) {
      p.path = null
      tx = (fwdX * inp.moveY + rightX * inp.moveX) * WALK_SPEED * speedMul
      tz = (fwdZ * inp.moveY + rightZ * inp.moveX) * WALK_SPEED * speedMul
      this.coach.moved(Math.hypot(tx, tz) * dt)
    } else if (p.path && p.path.length && !stunned) {
      const [wx, wz] = p.path[0]!
      const dx = wx - p.x
      const dz = wz - p.z
      const d = Math.hypot(dx, dz)
      if (d < 0.35) {
        p.path.shift()
        if (!p.path.length) p.path = null
      } else {
        const sp = Math.min(PATH_SPEED * speedMul, d * 6)
        tx = (dx / d) * sp
        tz = (dz / d) * sp
        if (!hud.combat) {
          const want = Math.atan2(-dx, -dz)
          p.yaw += angDiff(want, p.yaw) * Math.min(1, dt * 3.2)
        }
      }
    }
    // On a terrain map: little air control, and the floor's friction (ice).
    // In the air with the stick let go, the momentum carries (a dash leap
    // flies on over its gap).
    const air = !!this.climb && !p.ground && p.ladder < 0 && p.mantle <= 0
    // An edge-leap flies on its launch speed to its landing (the stick
    // steers only after touchdown), or the held walk would drag it short.
    if (air && ((c.slideT <= 0 && stick <= 0.01 && !p.path) || this.climb!.edgeFlight)) {
      tx = p.vx
      tz = p.vz
    }
    // A boss's pull (the Magnet Master's Pole Pull) drags him toward its
    // pole, a push on top of the walk; it lets go within a body's length.
    let pvx = 0
    let pvz = 0
    if (this.pullT > 0) {
      this.pullT -= dt
      const dx = this.pullX - p.x
      const dz = this.pullZ - p.z
      const d = Math.hypot(dx, dz)
      if (d > 1.2) {
        pvx = (dx / d) * this.pullS
        pvz = (dz / d) * this.pullS
      }
    }
    if (this.climb) this.climb.setPull(pvx, pvz)
    const mod = this.climb?.moveMod(p)
    // Wading (the Tidewater Locks' water): the walk slows; a slide too.
    if (mod?.speed !== undefined && mod.speed < 1 && !air) {
      tx *= mod.speed
      tz *= mod.speed
    }
    const k = mod ? walkBlend(dt, c.slideT > 0, air, mod.friction) : c.slideT > 0 ? 1 : Math.min(1, dt * ACCEL)
    p.vx += (tx - p.vx) * k
    p.vz += (tz - p.vz) * k
    const out: [number, number] = [0, 0]
    if (this.climb) this.stepClimb(out, fwdX, fwdZ, rightX, rightZ, dt, c.slideT > 0)
    else moveCircle(this.nav, p.x, p.z, (p.vx + pvx) * dt, (p.vz + pvz) * dt, PLAYER_R, out)
    if (p.path && Math.hypot(out[0] - p.x, out[1] - p.z) < 0.002 && Math.hypot(tx, tz) > 1) p.path = null
    p.x = out[0]
    p.z = out[1]
    const speed = Math.hypot(p.vx, p.vz)
    p.bobAmp += ((speed > 0.4 && c.slideT <= 0 ? Math.min(1, speed / WALK_SPEED) : 0) - p.bobAmp) * Math.min(1, dt * 8)
    p.bob += dt * (4.2 + speed * 1.35)
  }

  private activePellets(): number {
    let n = 0
    for (const s of this.system.shots) if (s.active && s.kind === 'pellet') n++
    return n
  }

  /** Muzzle position in world space (right-low of the eye). */
  private muzzle(): [number, number, number] {
    const p = this.player
    const cam = this.camera
    _v3.set(0.26, -0.22, -0.7).applyQuaternion(cam.quaternion)
    return [p.x + _v3.x, p.y + EYE_H + _v3.y, p.z + _v3.z]
  }

  private aimDir(from: [number, number, number]): [number, number, number, Enemy | null] {
    const t = this.combat.target
    const p = this.player
    // Only a machine the buster can see: a lock still held through its grace
    // behind a wall (or the edge of a doorway) is no aim and no homing — the
    // shot flies free, to the crosshair, and ends on that wall.
    const aimAt = (e: Enemy): [number, number, number, Enemy] | null => {
      if (!hasLineOfSight(this.nav, p.x, p.z, e.x, e.z) || !hasLineOfSight(this.nav, from[0], from[2], e.x, e.z)) return null
      const ax = e.x - from[0]
      const ay = e.y + (e.floor ?? 0) + e.def.aimY * (e.elite ? 1.18 : 1) - from[1]
      const az = e.z - from[2]
      const l = Math.hypot(ax, ay, az) || 1
      return [ax / l, ay / l, az / l, e]
    }
    if (this.input.locked) {
      // A captured mouse aims itself: the shot goes where the crosshair is,
      // and only snaps onto a machine that is right under it.
      const e = this.enemyUnderCrosshair(0.09)
      const aim = e && aimAt(e)
      if (aim) return aim
    } else if (t && t.state !== 'dead') {
      const toT = Math.atan2(-(t.x - p.x), -(t.z - p.z))
      const aim = Math.abs(angDiff(toT, p.yaw)) < 1.1 ? aimAt(t) : null
      if (aim) return aim
    }
    // The training drones are not machines, so the lock-on never found them:
    // aim at the one near the crosshair like at one.
    const lt = this.lessons.aimTarget(p.x, p.z, p.yaw, this.input.locked ? 0.14 : 0.45)
    if (lt) {
      const ax = lt.x - from[0]
      const ay = lt.y - from[1]
      const az = lt.z - from[2]
      const l = Math.hypot(ax, ay, az) || 1
      return [ax / l, ay / l, az / l, null]
    }
    // Free aim: along the view, converging on the crosshair where the view
    // meets a wall or the floor (the muzzle sits right-low of the eye).
    _v3.set(0, 0, -1).applyQuaternion(this.camera.quaternion)
    const reach = this.viewReach(_v3.x, _v3.y, _v3.z)
    const fx = p.x + _v3.x * reach
    const fy = p.y + EYE_H + _v3.y * reach
    const fz = p.z + _v3.z * reach
    const dx = fx - from[0]
    const dy = fy - from[1]
    const dz = fz - from[2]
    const l = Math.hypot(dx, dy, dz) || 1
    return [dx / l, dy / l, dz / l, null]
  }

  /**
   * A buster shot's aim: the crosshair itself on a weak spot (`data/
   * weakspots.ts`) — the shot flies at the spot and may land it — or else
   * the ordinary aim (`aimDir`, with its assist), which never can. The test
   * is the view ray as it is when fired: no assist, no snapping.
   */
  private aimShot(from: [number, number, number]): [number, number, number, Enemy | null, Enemy | null] {
    const p = this.player
    const cam = this.camera.position
    _v3.set(0, 0, -1).applyQuaternion(this.camera.quaternion)
    const reach = this.viewReach(_v3.x, _v3.y, _v3.z)
    const w = weakSpotUnderRay(
      cam.x, cam.y, cam.z, _v3.x, _v3.y, _v3.z, this.enemies,
      (e) => e.state !== 'dead' && !e.offstage && !e.dormant,
      (e) => hasLineOfSight(this.nav, p.x, p.z, e.x, e.z) && hasLineOfSight(this.nav, from[0], from[2], e.x, e.z),
      reach + 0.5
    )
    if (w) {
      const dx = w.x - from[0]
      const dy = w.y - from[1]
      const dz = w.z - from[2]
      const l = Math.hypot(dx, dy, dz) || 1
      return [dx / l, dy / l, dz / l, null, w.e]
    }
    const [dx, dy, dz, tgt] = this.aimDir(from)
    return [dx, dy, dz, tgt, null]
  }

  /** The machine nearest the crosshair, within `cone` radians widened by its
   *  size (a big machine is a big target), and in sight. */
  private enemyUnderCrosshair(cone: number): Enemy | null {
    const p = this.player
    _v3.set(0, 0, -1).applyQuaternion(this.camera.quaternion)
    const vx = _v3.x
    const vy = _v3.y
    const vz = _v3.z
    let best: Enemy | null = null
    let bestDot = -1
    for (const e of this.enemies) {
      // A golem asleep is a crate to the crosshair: a shot at it flies free
      if (e.state === 'dead' || e.offstage || e.dormant) continue
      const ex = e.x - p.x
      const ey = e.y + (e.floor ?? 0) + e.def.aimY * (e.elite ? 1.18 : 1) - (p.y + EYE_H)
      const ez = e.z - p.z
      const d = Math.hypot(ex, ey, ez)
      if (d > 32 || d < 0.3) continue
      const dot = (ex * vx + ey * vy + ez * vz) / d
      if (dot < Math.cos(Math.min(0.5, cone + Math.atan2(e.def.hitR * 0.6, d)))) continue
      if (dot <= bestDot) continue
      if (!hasLineOfSight(this.nav, p.x, p.z, e.x, e.z)) continue
      best = e
      bestDot = dot
    }
    return best
  }

  /** How far the view ray runs before a wall or the floor (m, 2.5..26). */
  private viewReach(vx: number, vy: number, vz: number): number {
    const p = this.player
    const h = Math.hypot(vx, vz)
    let reach = 26
    // The climb: the eye stands over the floor it is on, and a ledge's
    // floor ahead (or its cliff face) is where the view meets it.
    const cl = !!this.climb
    const eye = p.y + EYE_H
    if (vy < -0.02) reach = Math.min(reach, (cl ? Math.max(0.3, eye - Math.max(-60, floorAt(this.nav, p.x, p.z))) : EYE_H) / -vy)
    if (h > 1e-3) {
      const ux = vx / h
      const uz = vz / h
      for (let d = 0.5; d / h < reach; d += 0.5) {
        const qx = p.x + ux * d
        const qz = p.z + uz * d
        if (isSolidAt(this.nav, qx, qz) || (cl && eye + vy * (d / h) < floorAt(this.nav, qx, qz))) {
          reach = Math.min(reach, d / h)
          break
        }
      }
    }
    return Math.max(2.5, reach)
  }

  /** A quick shot: aimed, or `stray` (a fumble's wild direction, no lock). */
  private firePellet(stray: [number, number, number] | null = null): void {
    const c = this.combat
    const st = this.stats
    const m = this.muzzle()
    const [dx, dy, dz, tgt, weak] = stray ? [stray[0], stray[1], stray[2], null, null] : this.aimShot(m)
    const crit = Math.random() < st.critChance
    const dmg = Math.round(st.busterDmg * st.pelletMul * (crit ? st.critMul : 1))
    this.system.spawnPlayerShot('pellet', m[0], m[1], m[2], dx, dy, dz, dmg, crit, tgt, weak)
    this.shotOpensDoor(dx, dz)
    c.fireCd = 0.2
    c.recoil = Math.min(1, c.recoil + 0.45)
    this.fx.flash(m[0] + dx * 0.5, m[1] + dy * 0.5, m[2] + dz * 0.5, '#fff39a', 0.22, 0.06)
    sfx('shoot')
    if (!stray) this.coach.use('fire')
    // Shooting at a sleeping enemy in view wakes it.
    if (tgt && !tgt.awake && !tgt.hold) wake(this, tgt)
    this.makeNoise(10)
  }

  /** Gunfire is loud: machines within `r` metres that can hear it wake up. */
  private makeNoise(r: number): void {
    const p = this.player
    for (const e of this.enemies) {
      // A lesson's drones sleep through gunfire; only a hit wakes them.
      if (e.awake || e.state === 'dead' || e.hold) continue
      if (Math.hypot(e.x - p.x, e.z - p.z) < r) wake(this, e)
    }
  }

  /** A charge shot: aimed, or `stray` (a fumble's wild direction, no lock). */
  private fireCharged(level: 1 | 2 | 3, perfect: boolean, stray: [number, number, number] | null = null): void {
    const c = this.combat
    const st = this.stats
    const m = this.muzzle()
    const [dx, dy, dz, tgt, weak] = stray ? [stray[0], stray[1], stray[2], null, null] : this.aimShot(m)
    const mul = level === 3 ? 7 : level === 2 ? 4 : 2.2
    const crit = perfect || Math.random() < st.critChance
    const dmg = Math.round(st.busterDmg * mul * st.chargeDmgMul * (crit ? st.critMul : 1))
    const kind = level === 3 ? 'charge3' : level === 2 ? 'charge2' : 'charge1'
    this.system.spawnPlayerShot(kind, m[0], m[1], m[2], dx, dy, dz, dmg, crit, tgt, weak)
    this.shotOpensDoor(dx, dz)
    c.fireCd = 0.25
    c.recoil = 1
    this.shake(level >= 2 ? 0.16 : 0.06)
    this.fx.flash(m[0] + dx * 0.6, m[1] + dy * 0.6, m[2] + dz * 0.6, level >= 2 ? '#7ff4ff' : '#c8ff7a', level >= 2 ? 0.5 : 0.32, 0.1)
    // A full charge leaves the buster in a burst of sparks
    if (level >= 2) this.fx.sparks(m[0] + dx * 0.6, m[1] + dy * 0.6, m[2] + dz * 0.6, crit ? '#ffd84a' : level === 3 ? '#ff5fd8' : '#7ff4ff', 8, 4, 0.1)
    if (perfect) {
      pushHud({ t: 'flash', color: '#ffd84a', strength: 0.25 })
      pushHud({ t: 'text', x: m[0] + dx * 3, y: m[1] + 0.4, z: m[2] + dz * 3, key: 'combat.perfect', color: '#ffd84a' })
    }
    sfx(level >= 2 ? 'chargeShotBig' : 'chargeShot')
    if (!stray) this.coach.use('charge')
    if (tgt && !tgt.awake && !tgt.hold) wake(this, tgt)
    this.makeNoise(12)
  }

  private updateTargeting(dt: number): void {
    const c = this.combat
    const p = this.player
    let engaged = 0
    this.aimCandidate = false
    let best: Enemy | null = null
    let bestScore = Infinity
    let sighted: Enemy | null = null
    let sightedAng = SIGHT_ANGLE
    let targetAng = 0
    let fight = false
    for (const e of this.enemies) {
      // A golem asleep is a crate: no lock, no target frame, no fire glyph
      if (e.state === 'dead' || e.offstage || e.dormant) continue
      const d = Math.hypot(e.x - p.x, e.z - p.z)
      const ang = Math.abs(angDiff(Math.atan2(-(e.x - p.x), -(e.z - p.z)), p.yaw))
      if (e === c.target) targetAng = ang
      if (e.awake && d < 22) {
        engaged++
        if (!fight && (d < FIGHT_NEAR || this.time - e.hurtAt < FIGHT_HURT || hasLineOfSight(this.nav, p.x, p.z, e.x, e.z))) fight = true
      }
      if (d < 22 && ang < 0.5 && hasLineOfSight(this.nav, p.x, p.z, e.x, e.z)) {
        this.noteSighting(e)
        this.aimCandidate = true
        if (ang < sightedAng) { sighted = e; sightedAng = ang }
      }
      if ((e.awake && d < 22) || (d < 20 && ang < 0.45)) {
        const score = ang * 2.2 + d / 10
        if (score < bestScore && hasLineOfSight(this.nav, p.x, p.z, e.x, e.z)) {
          bestScore = score
          best = e
        }
      }
    }
    const wasCombat = hud.combat
    hud.combat = engaged > 0
    if (wasCombat && !hud.combat) this.combatEndT = 0.6
    this.fightT = fight ? FIGHT_LINGER : Math.max(0, this.fightT - dt)
    if (this.combatEndT > 0) {
      this.combatEndT -= dt
      if (this.combatEndT <= 0) this.system.vacuum(16)
    }
    const t = c.target
    const valid = t && t.state !== 'dead' && Math.hypot(t.x - p.x, t.z - p.z) < 24
    if (valid && !hasLineOfSight(this.nav, p.x, p.z, t.x, t.z)) this.targetLostT += dt
    else this.targetLostT = 0
    if (!valid || this.targetLostT > LOCK_GRACE) {
      c.target = best && (best.awake || this.aimCandidate) ? best : null
      this.targetLostT = 0
    }
    // Aim by looking: while the player steers the camera, the enemy under the
    // crosshair takes the lock once the old target has left the sights. On
    // touch this IS target switching — a sideways drag is a look now, not a
    // flick — and on desktop it spares the reach for Tab.
    if (c.target && sighted && sighted !== c.target && targetAng > SIGHT_ANGLE * 1.6
      && this.time - this.manualLookAt < LOCK_YIELD) {
      c.target = sighted
    }
    // Tab: cycle to the next engaged enemy by bearing.
    if (this.input.swipe !== 0) {
      const list = this.enemies
        .filter(e => e.state !== 'dead' && e.awake && Math.hypot(e.x - p.x, e.z - p.z) < 22 && hasLineOfSight(this.nav, p.x, p.z, e.x, e.z))
        .map(e => ({ e, a: angDiff(Math.atan2(-(e.x - p.x), -(e.z - p.z)), p.yaw) }))
        .sort((a, b) => a.a - b.a)
      if (list.length > 1) {
        const i = Math.max(0, list.findIndex(o => o.e === c.target))
        const next = list[(i + (this.input.swipe > 0 ? -1 : 1) + list.length) % list.length]!
        c.target = next.e
        sfx('uiClick')
      }
    }
    // A new target was in sight when it took the lock: its grace starts clean.
    if (c.target !== t) this.targetLostT = 0
    this.targetHidden = this.targetLostT > 0
  }

  /** A plain door's halves at `e` (0 shut … 1 open): the opening pose in
   *  `updateDoors`, run backwards for a door slammed shut again. */
  private closePanels(d: DoorState, e: number): void {
    const part = Math.min(1, e * 2.5)
    const lift = Math.max(0, (e - 0.25) / 0.75)
    for (let k = 0; k < 2; k++) {
      const pn = d.mesh.panels[k]
      if (!pn) continue
      pn.position.x = (k === 0 ? -1 : 1) * part * 0.35
      pn.position.y = lift * (WALL_H - 1.1)
      pn.scale.y = Math.max(0.05, 1 - lift * 0.95)
    }
  }

  /** The boss shutter rolls up: by the interact key or button, or by itself
   *  when Flux walks up to it (`BOSS_DOOR_AUTO`) before the fight. */
  private openBossDoor(d: DoorState): void {
    d.locked = false
    d.opening = true
    this.nav.pathBlock[d.cellJ * this.map.w + d.cellI] = 1
    this.shake(0.2)
    this.sfx('door', d.x, d.z)
    pushHud({ t: 'toast', key: 'mission.bossDoor', color: '#ff7a7a' })
  }

  private updateDoors(dt: number): void {
    this.updateFalseWalls(dt)
    const p = this.player
    for (const d of this.doors) {
      // A boss shutter opens as Flux walks up to it, like any door (players
      // looked for a button): never once the fight began, never while a
      // lesson holds it.
      if (d.locked && d.mesh.boss && !d.held && !d.opening && !this.bossStarted && hud.phase === 'play' &&
        Math.hypot(p.x - d.x, p.z - d.z) < BOSS_DOOR_AUTO && Math.abs(p.y - d.y) < 2.6) {
        this.openBossDoor(d)
        if (this.interact?.kind === 'door') this.interact = null
      }
      if (!d.opening && !d.locked) {
        if (Math.hypot(p.x - d.x, p.z - d.z) < DOOR_OPEN_DIST && Math.abs(p.y - d.y) < 2.6) {
          d.opening = true
          this.sfx('door', d.x, d.z)
        }
      }
      if (d.opening && d.open < 1) {
        d.open = Math.min(1, d.open + dt * DOOR_OPEN_SPEED)
        const e = 1 - Math.pow(1 - d.open, 3)
        if (d.mesh.boss) {
          d.mesh.panels[0]!.position.y = e * (WALL_H - 0.6)
        } else {
          // Halves part a little, then retract up into the lintel.
          const part = Math.min(1, e * 2.5)
          const lift = Math.max(0, (e - 0.25) / 0.75)
          for (let k = 0; k < 2; k++) {
            const pn = d.mesh.panels[k]!
            pn.position.x = (k === 0 ? -1 : 1) * part * 0.35
            pn.position.y = lift * (WALL_H - 1.1)
            pn.scale.y = Math.max(0.05, 1 - lift * 0.95)
          }
        }
        if (d.open > 0.55 && d.slab.active) {
          d.slab.active = false
          this.nav.pathBlock[d.cellJ * this.map.w + d.cellI] = 0
        }
        d.mesh.lampMat.color.set(d.open >= 1 ? PAL.glowCyan : PAL.glowYellow)
      }
      // The boss shutter slams shut behind you (and the gel trap's door, `shutDoor`).
      if (d.closing) {
        d.open = Math.max(0, d.open - dt * DOOR_OPEN_SPEED * 2.2)
        const e = d.open * d.open
        if (d.mesh.boss) d.mesh.panels[0]!.position.y = e * (WALL_H - 0.6)
        else this.closePanels(d, e)
        if (d.open < 0.5) d.slab.active = true
        if (d.open <= 0) {
          d.closing = false
          this.shake(0.35)
          this.sfx('stomp', d.x, d.z)
          d.mesh.lampMat.color.set(PAL.glowRed)
        }
      }
      if (d.mesh.warn) this.updateBossDoorFx(d, dt)
      // A held gate refusing Flux: a short red judder of its panels.
      if (d.shakeT > 0) {
        d.shakeT = Math.max(0, d.shakeT - dt)
        const k = d.shakeT / DOOR_SHAKE
        const off = Math.sin(this.time * 70) * 0.06 * k
        for (let i = 0; i < d.mesh.panels.length && !d.opening; i++) d.mesh.panels[i]!.position.x = (d.mesh.boss ? 0 : (i === 0 ? -1 : 1) * 0) + off
        d.mesh.lampMat.color.set(k > 0 && Math.sin(this.time * 30) > 0 ? '#ff3a3a' : PAL.glowRed)
      }
    }
  }

  /**
   * The boss shutter's warning kit: beacons sweep, the floor pool breathes,
   * the chevrons march into the gate. Full strength while a Core Master is
   * behind it; once it falls the kit powers down (the beacons coast to a stop,
   * the light fades) so the way out reads as safe. The first time Flux has the
   * shutter in sight from ~9 m, a klaxon and a faint red pulse announce it.
   */
  /** Atlas names the Master's weakness right after the boss warning, when
   *  Flux carries that weapon (the rings run with the story, so on a first
   *  run that is most Masters); a Master with no weakness gets `noWeak`. One
   *  with a weakness Flux has not copied yet: nothing, it is found by trying. */
  /**
   * The boss door's line: the Scrapyard's first signal ever ("It's… big."),
   * the short "Core Master ahead." when a weakness tip follows it, and the
   * full "Boss ahead. Deep breath!" when nothing does. One line, never two.
   */
  private sayBossAhead(): void {
    const a = this.atlas
    const b = this.boss
    if (!a || !b) return
    const weak = (b.def as BossDef).weakTo
    const tipFollows = !weak || profile.hero.weapons.includes(weak)
    if (this.setup.sector === 'scrapyard' && a.first('atlas:signal')) a.say('boss.signalFirst')
    else a.say(tipFollows ? 'warn.boss' : 'bossAhead')
  }

  /**
   * A machine in plain view: Atlas reads it the first time ever its kind is
   * seen (then an elite's gold ring, then an element coat: one line per
   * sighting). Not in the tutorial (its lessons teach), not over a scene or
   * another line (a late scan is noise). A scan is chatter: the director
   * may turn it down (another tip is waiting), and it comes another time.
   */
  private noteSighting(e: Enemy): void {
    const a = this.atlas
    if (!a || e.boss || this.setup.tutorial || this.storyScene || a.line) return
    const lines: AtlasLine[] = []
    if (SCAN_KINDS.has(e.kind)) lines.push(`scan.${e.kind}` as AtlasLine)
    if (e.elite) lines.push('scan.elite')
    if (e.element !== 'none') lines.push(`scan.${e.element}` as AtlasLine)
    for (const line of lines) {
      if (this.scanned.has(line)) continue
      if (a.say(line)) return
      if (ATLAS_MEMORY.seen(line)) this.scanned.add(line)
    }
  }

  private sayWeakness(): void {
    const b = this.boss
    if (!b || !this.atlas) return
    const weak = (b.def as BossDef).weakTo
    if (!weak) this.atlas.say('noWeak')
    else if (profile.hero.weapons.includes(weak)) this.atlas.say(`weak.${weak}`)
  }

  private updateBossDoorFx(d: DoorState, dt: number): void {
    const fx = d.mesh.warn!
    const bossAlive = !!this.boss && this.boss.state !== 'dead'
    const t = this.time
    // The level eases toward live, so the power-down is a fade, not a cut.
    fx.level += ((bossAlive ? 1 : 0) - fx.level) * Math.min(1, dt * 1.5)
    const a = fx.level
    for (let k = 0; k < fx.beacons.length; k++) fx.beacons[k]!.rotation.y += dt * 4.4 * a * (k ? -1 : 1)
    const flash = 0.5 + 0.5 * Math.sin(t * 8.8)
    fx.beamMat.opacity = 0.5 * a
    fx.domeMat.color.setRGB(0.55 + 0.45 * flash * a, 0.1 + 0.08 * flash * a, 0.14)
    fx.floorMat.opacity = (0.45 + 0.2 * Math.sin(t * 2.4)) * a
    // Dr. Vex's screen: a signal that glitches now and then, going dark
    // once his Core Master has fallen.
    const glitch = Math.sin(t * 13.7) > 0.93 || Math.sin(t * 3.1 + 1.3) > 0.985
    fx.screenMat.opacity = (0.25 + 0.75 * a) * (glitch ? 0.35 : 1)
    fx.screenMat.color.setScalar(glitch ? 1.6 : 1)
    for (let k = 0; k < fx.chevronMats.length; k++) {
      // The pulse runs from the far chevron to the gate: "in there".
      fx.chevronMats[k]!.opacity = (0.18 + 0.7 * Math.max(0, Math.sin(t * 4.2 + k * 1.1))) * a
    }
    if (!this.bossWarned && bossAlive && !this.bossStarted && hud.phase === 'play') {
      const p = this.player
      if (Math.hypot(d.x - p.x, d.z - p.z) < 9 && hasLineOfSight(this.nav, p.x, p.z, d.x, d.z)) {
        this.bossWarned = true
        this.sfx('bossWarn', d.x, d.z)
        this.sayBossAhead()
        this.sayWeakness()
        this.shake(0.12)
        pushHud({ t: 'flash', color: '#ff3040', strength: 0.16 })
      }
    }
  }

  /**
   * Portal culling. The walls stand 4.2 m against a 1.6 m eye, so the only
   * way to see into another room is through a door. Visible = the room the
   * player stands in, then out through every door that is open (even a crack)
   * AND on screen, up to PORTAL_DEPTH doors deep; a shut door is opaque. Fog
   * distance still caps it. Enemies in a hidden room are hidden with it, which
   * also spares their skinning.
   */
  private updateRoomCulling(): void {
    const p = this.player
    const far = this.theme.fogFar + 6
    const lv = this.level
    const n = lv.rooms.length
    const vis = this.roomVis
    const cam = this.camera
    cam.updateMatrixWorld()
    _pv.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse)
    _frustum.setFromProjectionMatrix(_pv)
    const W = this.map.w
    const cellOwner = (x: number, z: number): number => lv.owner[Math.floor(z / CELL) * W + Math.floor(x / CELL)] ?? -1
    const here = cellOwner(p.x, p.z)
    // The exit's camera is off Flux's shoulder, maybe in the next room or
    // the corridor: the view is seen from both.
    const cine = hud.phase === 'beamOut'
    const camHere = cine ? cellOwner(cam.position.x, cam.position.z) : -1
    const topOf = (o: number): number => (this.climb && o >= 0 ? this.climb.t.wallTop[o] ?? WALL_H : WALL_H)
    // Portals only hold while the eye is below the wall tops: the beam-in
    // drops from 7 m and the exit's drone rises out of the level, and from up
    // there every room is in plain sight. Off the grid for a frame (a
    // knock-back into a corner) or a debug camera: show all too.
    const wallTop = Math.max(topOf(here), camHere >= 0 ? topOf(camHere) : 0)
    const overWalls = cam.position.y > wallTop - 0.5 || !!this.debugCam
    if (here < 0 || overWalls || NO_PORTAL) {
      vis.fill(1)
    } else {
      vis.fill(0)
      vis[here] = 1
      if (camHere >= 0) vis[camHere] = 1
      const added = this.cullAdded
      for (let hop = 0; hop < PORTAL_DEPTH; hop++) {
        added.length = 0
        for (const d of this.doors) {
          if (d.open <= 0.01 && !d.opening) continue
          const a = vis[d.from]!
          const b = vis[d.to]!
          if (a === b) continue
          _portal.center.set(d.x, d.y + WALL_H / 2, d.z)
          _portal.radius = CELL * 0.85
          const standingIn = Math.hypot(d.x - p.x, d.z - p.z) < CELL
            || (cine && Math.hypot(d.x - cam.position.x, d.z - cam.position.z) < CELL)
          if (!standingIn && !_frustum.intersectsSphere(_portal)) continue
          added.push(a ? d.to : d.from)
        }
        if (!added.length) break
        for (const r of added) vis[r] = 1
      }
    }
    for (let i = 0; i < n; i++) {
      const bb = lv.bounds[i]!
      lv.rooms[i]!.visible = vis[i] === 1 && Math.hypot(bb.x - p.x, bb.z - p.z) - bb.r < far
    }
    for (const e of this.enemies) {
      const alive = e.state !== 'dead' || e.deathT < 0.2
      const near = Math.hypot(e.x - p.x, e.z - p.z) < far
      const o = cellOwner(e.x, e.z)
      e.root.visible = alive && !e.offstage && !e.buried && near && (o < 0 || vis[o] === 1)
      e.shadow.visible = e.root.visible
    }
  }

  /** Right-side presses count as FIRE while in combat or an enemy is in the sights. */
  wantsFire(): boolean {
    const p = this.player
    return hud.phase === 'play' && (hud.combat || this.aimCandidate || this.lessons.inSights(p.x, p.z, p.yaw))
  }

  // ─── Taps: walk-to / interact ────────────────────────────────────────────

  private handleTaps(): void {
    if (hud.phase !== 'play') return
    for (const tap of this.input.taps) {
      const w = getRenderer().domElement.clientWidth || 1
      const h = getRenderer().domElement.clientHeight || 1
      // Tapped an object (chest / bot)? Open it if in reach, else walk to it.
      const hit = this.tappedObject(tap.x, tap.y)
      if (hit) {
        const p = this.player
        if (this.interact && this.interact.ref === hit.ref) this.doInteract()
        else {
          const dx = p.x - hit.x
          const dz = p.z - hit.z
          const d = Math.hypot(dx, dz) || 1
          if (this.walkTo(hit.x + (dx / d) * 1.6, hit.z + (dz / d) * 1.6)) this.coach.use('walk')
        }
        continue
      }
      _v2.set((tap.x / w) * 2 - 1, -(tap.y / h) * 2 + 1)
      this.raycaster.setFromCamera(_v2, this.camera)
      const ray = this.raycaster.ray
      if (this.climb) {
        // The tower's floors are at many heights: march the ray to the first.
        const o = ray.origin
        const d = ray.direction
        if (!this.rayToFloor(o.x, o.y, o.z, d.x, d.y, d.z, _v3)) continue
      } else {
        if (ray.direction.y >= -0.01) continue
        const t = -ray.origin.y / ray.direction.y
        if (t > 45) continue
        ray.at(t, _v3)
      }
      if (this.walkTo(_v3.x, _v3.z)) this.coach.use('walk')
    }
  }

  private tappedObject(sx: number, sy: number): { ref: unknown; x: number; z: number } | null {
    const pt = { x: 0, y: 0, visible: false }
    let best: { ref: unknown; x: number; z: number } | null = null
    let bestD = 70
    const p = this.player
    const consider = (ref: unknown, x: number, y: number, z: number) => {
      if (Math.hypot(x - p.x, z - p.z) > 26) return
      this.project(x, y, z, pt)
      if (!pt.visible) return
      const d = Math.hypot(pt.x - sx, pt.y - sy)
      if (d < bestD && hasLineOfSight(this.nav, p.x, p.z, x, z)) { bestD = d; best = { ref, x, z } }
    }
    // A chest on another floor (a ledge overhead) is not the tap's: it falls
    // through to the floor under the finger.
    for (const c of this.objects.chests) if (!c.opened && Math.abs(c.y - p.y) < CHEST_DY) consider(c, c.x, c.y + 0.6, c.z)
    const n = this.objects.npc
    if (n && !n.rescued) consider(n, n.x, 0.8, n.z)
    if (!this.bossStarted) for (const d of this.doors) if (d.locked && !d.held) consider(d, d.x, d.y + 1.6, d.z)
    return best
  }

  walkTo(x: number, z: number): boolean {
    const p = this.player
    if (isSolidAt(this.nav, x, z)) {
      const dx = x - p.x
      const dz = z - p.z
      const len = Math.hypot(dx, dz)
      let found = false
      for (let s = len; s > 0.5; s -= 0.5) {
        const cx = p.x + (dx / len) * s
        const cz = p.z + (dz / len) * s
        if (!isSolidAt(this.nav, cx, cz)) { x = cx; z = cz; found = true; break }
      }
      if (!found) return false
    }
    const raw = findPath(this.nav, p.x, p.z, x, z, 1400, 1)
    if (!raw) return false
    p.path = smoothPath(this.nav, p.x, p.z, raw, PLAYER_R)
    this.marker.position.x = x
    this.marker.position.y = floorAt(this.nav, x, z) + 0.03
    this.marker.position.z = z
    this.markerT = 0.5
    return true
  }

  // ─── HUD mirror (≤ 15 Hz) ────────────────────────────────────────────────

  private writeHud(): void {
    this.syncFreezeHud()
    const tr = this.training
    hud.trainId = tr.id ?? ''
    hud.trainPhase = tr.phase
    // The first mission's checklist: every lesson this map teaches.
    if (this.setup.tutorial) {
      let sig = ''
      for (const id of TUTORIAL_TRAINING) {
        if (this.lessonSpots.has(id)) sig += `${id}${tr.done.has(id) ? 1 : 0}${tr.id === id ? 'c' : ''};`
      }
      if (sig !== this.checklistSig) {
        this.checklistSig = sig
        hud.checklist = TUTORIAL_TRAINING.filter(id => this.lessonSpots.has(id))
          .map(id => ({ id, done: tr.done.has(id), current: tr.id === id }))
      }
    }
    const c = this.combat
    hud.hp = Math.max(0, c.hp)
    hud.maxHp = c.maxHp
    hud.we = c.we
    hud.maxWe = c.maxWe
    hud.power = c.power
    hud.maxPower = c.maxPower
    hud.bolts = profile.bolts
    hud.level = profile.level
    hud.xp01 = xp01()
    hud.tanks = profile.inv.tanks
    hud.tanksMax = this.stats.tanksMax
    hud.blockHeld = c.blocking
    // Coach glyphs: only re-assigned when something visible changed.
    const views: HintView[] = this.coach.views()
    const sig = views.map(v => `${v.id}${v.family}${v.count}/${v.goal}${v.flash}${v.done ? 'd' : ''}${v.urgent ? 'u' : ''}`).join(',')
    if (sig !== this.hintsSig) {
      this.hintsSig = sig
      hud.hints = views
    }
    hud.slideReady = c.slideCd <= 0 && c.power >= this.stats.slideCost
    hud.slidePowerLow = c.slideCd <= 0 && c.power < this.stats.slideCost
    hudLive.slideCd = c.slideCd
    // Which hand is playing, and whether the mouse still needs capturing.
    hud.device = this.input.device
    hud.lookMode = this.input.lockRefused ? 'drag' : 'lock'
    hud.pointerFree = this.input.device === 'mouse' && !this.input.locked && !this.input.lockRefused
    const lv = this.lessons.view()
    const lsig = lv ? `${lv.id}${lv.nudge}${lv.done ? 'd' : ''}${lv.slot}` : ''
    if (lsig !== this.lessonSig) {
      this.lessonSig = lsig
      hud.lesson = lv
    }
    // Objective line + compass
    const ob = this.objects.objective
    hud.objectiveKey = `objective.${ob.template}`
    hud.objectiveParams = {
      n: ob.progress, total: ob.count,
      target: this.quest?.target ? (ob.template === 'kill' ? `enemyPlural.${this.quest.target}` : `enemy.${this.quest.target}`) : ''
    }
    // Vex down is not the end while the Grand Master still stands; a Master
    // down is not either while its copied weapon is still to learn (#110):
    // the objective is the lesson room behind the arena.
    hud.objectiveDone = ob.done && (!this.finale || this.finale.state === 'done') && !this.weaponOwed
    if (ob.done && this.weaponOwed) {
      hud.objectiveKey = 'objective.learnWeapon'
      hud.objectiveParams = { weapon: `weapon.${this.exitWeapon}.name` }
    }
    const it = this.interact
    hud.interactKey = !it ? '' : it.kind === 'chest' ? 'interact.chest' : it.kind === 'npc' ? 'interact.rescue' : 'interact.bossDoor'
    const p = this.player
    const marks: typeof hud.compass = []
    for (const m of this.objects.compassTargets(this.enemies)) {
      const bearing = angDiff(Math.atan2(-(m.x - p.x), -(m.z - p.z)), p.yaw)
      marks.push({ bearing: -bearing, kind: m.kind, dist: Math.hypot(m.x - p.x, m.z - p.z) })
      if (marks.length >= 6) break
    }
    if (ob.done) marks.push({ bearing: -angDiff(Math.atan2(-(this.map.start.x - p.x), -(this.map.start.z - p.z)), p.yaw), kind: 'exit', dist: Math.hypot(this.map.start.x - p.x, this.map.start.z - p.z) })
    hud.compass = marks
    // Special weapon slots
    for (let i = 0; i < 2; i++) {
      const id = profile.hero.slots[i] as WeaponId | ''
      const w = hud.weapons[i]!
      if (!id) {
        w.id = ''
        continue
      }
      const cost = this.weapons.cost(id)
      w.id = id
      w.cost = cost
      w.color = WEAPONS[id].color
      w.ready = this.weapons.cooldown[i as 0 | 1] <= 0 && (c.we >= cost || (id === 'galeGuard' && this.weapons.guardT > 0))
    }
    // The borrowed weapon's button: charges, cooldown, the first-take teach
    // (which waits while a scene lesson has the stage).
    this.borrowed.writeHud(this.weapons.cooldown[2] <= 0, !!hud.lesson)
    // Boss bar: fills segment by segment during the entrance, then tracks HP
    const b = this.boss
    // (The Grand Master keeps the bar its own while it is up.)
    const giant = this.finale && this.finale.state !== 'dormant' && this.finale.state !== 'done'
    if (b && this.bossStarted && !giant) {
      this.bossBarT += 1 / 15
      const fill = Math.min(1, this.bossBarT / (BOSS_INTRO_T * 0.7))
      hud.bossHp01 = b.state === 'dead' ? 0 : Math.min(fill, b.hp / b.maxHp)
      if (b.state === 'dead' && b.deathT > 1.6) hud.bossName = ''
    }
    // The top row's locator chip (its clock).
    hud.missionBoss = b?.bossId ?? ''
    hud.bossDown = !!b && b.state === 'dead'
    hud.locatorOn = this.locator.visible
    hud.locatorCd01 = this.locator.cooldown01
    const t = c.target
    if (t && t.state !== 'dead') {
      hud.targetName = t.nameKey
      hud.targetLevel = t.level
      hud.targetHp01 = t.hp / t.maxHp
      hud.targetElite = t.elite
      hud.targetHidden = this.targetHidden
    } else {
      hud.targetName = ''
      hud.targetHidden = false
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  /** The player's look input this frame (drag / captured mouse / keys).
   *  Stunned by a fumble, it is dropped (`sim/fumble.ts`). */
  private applyLook(dt: number): void {
    const p = this.player
    const inp = this.input
    const live = hud.phase === 'play' && !this.fumble.stunned
    if (live && (inp.lookDX || inp.lookDY)) {
      const s = (inp.device === 'touch' ? LOOK_TOUCH : inp.locked ? LOOK_LOCK : LOOK_MOUSE) * this.lookSens
      // Full speed, always: the soft lock below stands aside while the
      // player is steering (it used to damp this to 35 % and pull the view
      // straight back, so in a fight the camera felt nailed down).
      p.yaw -= inp.lookDX * s
      p.pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, p.pitch - inp.lookDY * s))
      this.coach.looked(Math.hypot(inp.lookDX, inp.lookDY) * s)
      this.manualLookAt = this.time
    }
    if (live && inp.turn) {
      const d = inp.turn * TURN_RATE * this.lookSens * Math.min(dt, 0.05)
      p.yaw -= d
      this.coach.looked(d)
      this.manualLookAt = this.time
    }
    inp.lookDX = 0
    inp.lookDY = 0
  }

  render(alpha: number, dt: number): void {
    const p = this.player
    const c = this.combat
    const inp = this.input
    this.applyLook(dt)

    const x = p.px + (p.x - p.px) * alpha
    const z = p.pz + (p.z - p.pz) * alpha
    // Feet height, interpolated like the position (0 on a flat map).
    const fy = p.py + (p.y - p.py) * alpha

    // Soft lock-on: ease the view toward the target (yaw + pitch) — but not
    // while, or just after, the player steers the camera themselves, and
    // never for a captured mouse: that hand aims itself, and a camera that
    // drifts under it feels broken. Nor toward a target out of sight: the
    // lock's grace holds it, but a view swung onto a wall helps nobody.
    const t = c.target
    const steering = this.time - this.manualLookAt < LOCK_YIELD
    if (hud.phase === 'play' && t && t.state !== 'dead' && (hud.combat || c.charging) && !steering && !inp.locked && !this.targetHidden) {
      const ty = t.y + (t.floor ?? 0) + t.def.aimY * (t.elite ? 1.18 : 1)
      const want = Math.atan2(-(t.x - x), -(t.z - z))
      const dist = Math.hypot(t.x - x, t.z - z)
      const wantPitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, Math.atan2(ty - (fy + EYE_H), Math.max(0.5, dist)) * 0.85))
      const rate = Math.min(1, dt * 5.5)
      p.yaw += angDiff(want, p.yaw) * rate
      p.pitch += (wantPitch - p.pitch) * Math.min(1, dt * 4)
    }

    const bobY = Math.sin(p.bob * 2) * 0.042 * p.bobAmp
    const bobX = Math.cos(p.bob) * 0.028 * p.bobAmp
    let y = fy + EYE_H + bobY
    if (hud.phase === 'dead') {
      y = fy + EYE_H - Math.min(1, this.deathT * 1.5) * 0.9
    }
    if (c.slideT > 0) y -= 0.35
    // Flattened: the eye slaps down to the floor, then springs back up with
    // a wobble as he pops out.
    if (this.flatT > 0) y += (fy + flatEye(this.flatT) - y)
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 1.8)
    const sh = this.shakeAmt * this.shakeAmt
    const cam = this.camera
    cam.position.set(
      x + Math.cos(p.yaw) * bobX + (Math.random() - 0.5) * sh * 0.2,
      y + (Math.random() - 0.5) * sh * 0.16,
      z - Math.sin(p.yaw) * bobX
    )
    cam.rotation.order = 'YXZ'
    // A fumble's stun jolts the view (`sim/fumble.ts`).
    const hurtRoll = (c.hurtT > 0 ? Math.sin(this.time * 40) * 0.02 : 0) + (this.fumble.stunned ? Math.sin(this.time * 55) * 0.035 : 0)
    cam.rotation.set(p.pitch, p.yaw, Math.cos(p.bob) * 0.006 * p.bobAmp + (Math.random() - 0.5) * sh * 0.05 + hurtRoll + (c.slideT > 0 ? -0.05 : 0))
    // The exit is third person: its own camera, Flux whole, no arm cannon.
    const exiting = hud.phase === 'beamOut' && this.exit.active
    if (exiting) this.frameExit(alpha, dt)
    // A third-person freeze-frame: Flux whole, its own spring-arm camera.
    const fz = this.freeze.shot
    const frozenCam = !!fz && fz.frame !== 'fp'
    if (frozenCam) this.frameFreeze(dt)
    const cine = exiting || frozenCam
    // The beam-in opens on Flux himself, then flies into his head.
    const intro = hud.phase === 'beamIn'
    if (intro) this.frameBeamIn(x, fy, z, alpha)
    if (this.debugCam) {
      const d = this.debugCam
      cam.position.set(d[0], d[1], d[2])
      cam.lookAt(d[3], d[4], d[5])
    }
    cam.updateMatrixWorld()
    this.level.sky.position.copy(cam.position)
    // Once play has begun, the rest of the city streams in: a few ms a frame.
    if (this.city && hud.phase === 'play' && !this.cityDone) this.cityDone = this.city.stream(CITY_STREAM_MS)
    this.city?.update(this.time)

    for (const e of this.enemies) {
      if (!e.root.visible && e.state !== 'dead') continue
      if (e.boss) syncBossVisual(e, alpha)
      else syncEnemyVisual(e, alpha, this.time)
      // The climb: the machine's platform lifts it, its shadow and its ring.
      if (e.floor) {
        e.root.position.y += e.floor
        e.shadow.position.y += e.floor
        if (e.ring.visible) e.ring.position.y += e.floor
      }
      if (e.frozenT > 0) e.rig.material.emissive.setRGB(0.15 + e.flash * 0.7, 0.4 + e.flash * 0.5, 0.75)
      // An enraged boss burns red (`sim/bossArena.ts`).
      else if (e.boss && this.arena?.enraged) e.rig.material.emissive.setRGB(0.55 + 0.25 * Math.sin(this.time * 9) + e.flash * 0.4, 0.06, 0.02)
    }
    this.system.sync(alpha)

    this.syncViewmodel(dt)
    this.vmRoot.visible = !cine && !(intro && this.beamPose.arm <= 0)
    this.renderAtlas(dt, cine, intro)

    const r = getRenderer()
    r.clear()
    r.render(this.scene, cam)
    if (!cine) {
      r.clearDepth()
      r.render(this.vmScene, this.vmCamera)
    }
    tickHud(dt)
  }

  /**
   * Run a voiced story scene: marked seen at once, Atlas's own lines held
   * while it plays, Atlas's scene lines in his own bubble.
   */
  private playScene(beats: readonly Beat[], place: ScenePlace, seen: string | null, onEnd?: () => void): void {
    if (seen) markVexSeen(seen)
    this.storyScene?.skip()
    this.atlas?.hold(true)
    this.storyScene = new StoryScene(beats, place, {
      atlas: (key) => this.atlas?.sayNow(key.replace(/^atlas\./, '') as AtlasLine) ?? 0,
      onEnd: () => { this.atlas?.hold(false); onEnd?.() }
    })
  }

  /**
   * The landing's story beat: Atlas's briefing, or in its place the Volt
   * Tower hack (S8) or Vex's welcome to the Fortress (S9), once ever each.
   */
  private startStoryBeat(): void {
    const story = this.setup.quest?.kind === 'story'
    const sector = this.setup.sector
    const freed = profile.world.bosses.filter(b => b !== 'vexMk1').length
    if (story && sector === 'volt' && !vexSeen('voltHack')) {
      this.pendingScene = () => this.playScene(voltHackBeats(freed,
        () => pushHud({ t: 'flash', color: '#ff2d3f', strength: 0.55 }),
        () => pushHud({ t: 'flash', color: '#ffb43a', strength: 0.6 })), 'top', 'voltHack')
    } else if (story && sector === 'fortress' && !vexSeen('fortress')) {
      this.pendingScene = () => this.playScene(fortressBeats(), 'top', 'fortress', () => this.atlas?.event('play'))
    } else this.atlas?.event('play')
    // The sector's own beam-in line is for the first story landing there.
    if (story) markVexSeen(`sector:${sector}`)
  }

  /** The story scenes' recordings, fetched as the mission lands (a line must not wait on its file). */
  private prefetchStoryScenes(): void {
    const bid = this.boss?.bossId ?? ''
    if (bid === 'vexMk1') {
      for (const beats of [mk1IntroBeats(), mk1SignalBeats(), mk1DefeatBeats()]) prefetchScene(beats)
    } else if (VEX_BOSS_KEY[bid]) {
      prefetchScene(presentBeats(bid))
      prefetchScene(freedBeats(bid))
    }
    if (this.setup.sector === 'volt') prefetchScene(voltHackBeats(3, () => {}, () => {}))
    if (this.setup.sector === 'fortress') prefetchScene(fortressBeats())
  }

  /** The Mk-I fight: the relays-hold beat at phase 2 (S12), Atlas's element call-outs (S11). */
  private tickMk1(): void {
    const b = this.boss
    if (!b || b.bossId !== 'vexMk1' || !this.bossStarted || b.state === 'dead') return
    if (b.phase2 && !this.mk1Signal) {
      this.mk1Signal = true
      if (!vexSeen('mk1:signal')) {
        b.beatHold = MK1_SIGNAL_HOLD
        this.playScene(mk1SignalBeats(), 'title', 'mk1:signal')
      }
    }
    if (b.state === 'tele' && b.attack !== this.mk1Tele) {
      this.mk1Tele = b.attack
      const el = MK1_CALL[b.attack]
      // A late call-out is wrong: only when nobody is speaking.
      if (el && !this.mk1Called.has(el) && !this.storyScene && this.atlas && !this.atlas.line) {
        this.mk1Called.add(el)
        this.atlas.sayNow(`mk1.${el}` as AtlasLine)
      }
    } else if (b.state !== 'tele') this.mk1Tele = ''
  }

  /** Feed Atlas what it reacts to, and mirror its line to the HUD. */
  private tickAtlas(dt: number, playing: boolean): void {
    if (this.storyScene && !this.storyScene.update(dt)) this.storyScene = null
    if (this.pendingScene && !this.storyScene && !this.atlas?.line) {
      const start = this.pendingScene
      this.pendingScene = null
      start()
    }
    this.tickMk1()
    if (!this.atlas) return
    const k = this.atlasTick
    const p = this.player
    k.playing = playing
    k.combat = hud.combat
    k.hp01 = this.combat.hp / this.combat.maxHp
    k.tanks = profile.inv.tanks
    k.we01 = profile.hero.slots[0] || profile.hero.slots[1] ? hud.we / Math.max(1, hud.maxWe) : -1
    k.level = profile.level
    k.objectiveDone = hud.objectiveDone
    k.trapNear = -1
    k.plateNear = false
    k.trapKind = ''
    // The tutorial teaches the Repair Gel itself: no health warnings over that lesson, or before it.
    k.hpMuted = !!this.setup.tutorial && !this.training.done.has('gel')
    this.traps.traps.forEach((s, i) => {
      if (s.stage === 'spent') return
      const d = Math.hypot(s.spot.x - p.x, s.spot.z - p.z)
      if (s.spot.plate) { if (d < 5) k.plateNear = true } else if (d < 8 && k.trapNear < 0) { k.trapNear = i; k.trapKind = s.spot.kind }
    })
    // A rescue job: the worker-bot's faint signal, once he is near.
    const npc = this.objects.npc
    if (playing && npc && !npc.rescued && this.setup.quest?.template === 'rescue' &&
      Math.hypot(npc.x - p.x, npc.z - p.z) < 12) this.atlas.say('hint.rescue')
    this.atlas.update(dt, k)
    const key = this.atlas.line ? atlasKey(this.atlas.line.id) : ''
    if (key !== hud.atlasKey) {
      hud.atlasKey = key
      hud.atlasGold = key.startsWith('atlas.train.')
      if (key) hud.atlasSeq++
    }
  }

  /**
   * Place Atlas for this frame. In play: in the viewmodel layer, eased from
   * out of sight (above and behind the left shoulder) into the top left of
   * the view by the director's `peek`. In the beam-in and the exit: in the
   * world, at Flux's shoulder (`frameBeamIn` / `frameExit` aim it). And
   * where its speech bubble goes.
   */
  private renderAtlas(dt: number, cine: boolean, intro: boolean): void {
    if (!this.atlas || !this.atlasVm || !this.atlasWorld) return
    const t = this.time
    const talk = this.atlas.line ? 1 : 0
    const vc = this.vmCamera
    const peek = this.atlas.peek
    const d = 1.3
    const ty = Math.tan((vc.fov * Math.PI) / 360)
    const tx = ty * vc.aspect
    // In view: in from the top-left corner, under the status cards (lower
    // and smaller on a tall screen).
    const portrait = vc.aspect < 1
    // A lesson intro (gold line): Atlas FLIES in, from off the top right in
    // an arc to its spot, and back out the same way — the playtesters never
    // noticed the usual slide-in from the corner.
    if (hud.atlasGold) this.atlasSwoop = true
    else if (peek < 0.02) this.atlasSwoop = false
    const spotX = -1.55 + (portrait ? 0.97 : 1.0)
    const spotY = 1.35 - (portrait ? 1.13 : 0.93)
    const e = 1 - (1 - peek) * (1 - peek)
    const nx = this.atlasSwoop ? 1.7 + (spotX - 1.7) * e : -1.55 + (portrait ? 0.97 : 1.0) * peek
    const ny = this.atlasSwoop ? 1.5 + (spotY - 1.5) * e + Math.sin(e * Math.PI) * 0.35 : 1.35 - (portrait ? 1.13 : 0.93) * peek
    const vm = this.atlasVm
    vm.root.visible = !cine && !intro && peek > 0.01
    if (vm.root.visible) {
      vm.root.position.set(nx * tx * d, ny * ty * d + Math.sin(t * 1.9) * 0.02, -d)
      vm.root.scale.setScalar(portrait ? 0.42 : 0.55)
      // Facing Flux (the camera), turned a touch toward the middle.
      vm.root.lookAt(0, 0, 0)
      vm.root.rotateY(0.3)
      animateAtlas(vm, t, talk)
      hudLive.atlasX = (nx + 1) / 2
      hudLive.atlasY = (1 - ny) / 2
      hudLive.atlasIn = peek > 0.5
    }
    const w = this.atlasWorld
    w.root.visible = (cine || intro) && this.atlasWorldSet
    if (w.root.visible) {
      w.root.position.copy(this.atlasWorldAt)
      w.root.position.y += Math.sin(t * 2.1) * 0.05
      w.root.lookAt(this.camera.position.x, w.root.position.y, this.camera.position.z)
      animateAtlas(w, t, talk)
      _v.copy(w.root.position).project(this.camera)
      hudLive.atlasX = (_v.x + 1) / 2
      hudLive.atlasY = (1 - _v.y) / 2 - 0.04
      hudLive.atlasIn = _v.z < 1 && Math.abs(_v.x) < 1 && Math.abs(_v.y) < 1
    } else if (!vm.root.visible) hudLive.atlasIn = false
    if (!cine && !intro) this.atlasWorldSet = false
    void dt
  }

  /** Aim the world Atlas at Flux's shoulder (local offset from his root),
   *  following with a little lag once it is out. */
  private followAtlas(hero: Object3D, dt: number, snap: boolean): void {
    if (!this.atlasWorld) return
    _v.set(0.62, 1.45, -0.15).applyQuaternion(hero.quaternion).add(hero.position)
    if (snap || !this.atlasWorldSet) this.atlasWorldAt.copy(_v)
    else this.atlasWorldAt.lerp(_v, 1 - Math.exp(-dt * 6))
    this.atlasWorldSet = true
  }

  /**
   * A frame of the beam-in (`sim/beamIn.ts`) at the render's point between
   * two steps: Flux forming in the pad's column and landing, and the camera
   * that frames him and then dives into his head. (x, fy, z): his feet.
   */
  private frameBeamIn(x: number, fy: number, z: number, alpha: number): void {
    const v = this.exitView
    if (!v) return
    const t = this.beamPrevT + (this.phaseT - this.beamPrevT) * alpha
    const o = beamInPose(t, this.beamPose)
    const p = this.player
    const pad = this.pad.root.position
    const plate = Math.abs(floorAt(this.nav, pad.x, pad.z) - fy) < 0.5 ? padPlateLift(pad.x, pad.z, x, z) : 0
    // ── Flux ──
    const hr = v.heroRoot
    hr.visible = o.body
    hr.position.set(x, fy + plate + o.drop, z)
    hr.quaternion.setFromAxisAngle(_up, p.yaw + Math.PI)
    hr.scale.set(o.sx, o.sy, o.sx)
    const rig = v.hero
    if (o.drop > 0.02 || o.crouch > 0) animateHeroHop(rig, o.crouch, o.drop > 0.02 ? 0.35 * (1 - o.drop / BEAM_IN_DROP) : 0, t)
    else animateHeroIdle(rig, t)
    v.heroShadow.visible = o.body
    v.heroShadow.position.set(x, fy + plate + 0.035, z)
    // Atlas beams in with him, at his shoulder once he has landed.
    if (t >= BEAM_IN_LAND - 0.25) this.followAtlas(hr, 1 / 60, true)
    this.atlasWorld?.root.scale.setScalar(Math.min(1, Math.max(0.05, (t - (BEAM_IN_LAND - 0.25)) / 0.3)))
    v.heroShadow.scale.setScalar(Math.max(0.35, 1 - o.drop * 0.2))
    // ── The camera ──
    // From the floor the first-person eye stands on, so the dive ends exactly
    // at that eye; the plate only lifts what the lens looks at.
    const sh = this.beamCam.frame(this.cine, x, fy, z, p.yaw, p.pitch, o.dive, o.drop + plate)
    const cam = this.camera
    cam.position.set(sh.x, sh.y, sh.z)
    cam.lookAt(sh.tx, sh.ty, sh.tz)
  }

  /**
   * A frame of the exit (`sim/exitRun.ts`), at the render's point between
   * two steps: the drone and Flux posed, their shadows on the floor, and the
   * cutscene camera (kept out of the walls by `sim/cineCam.ts`).
   */
  private frameExit(alpha: number, dt: number): void {
    const run = this.exit
    const v = this.exitView
    if (!v) return
    const t = run.ptime + (run.time - run.ptime) * alpha
    const o = run.sample(t, this.exitPose)
    // ── The drone ──
    const dr = v.drone
    dr.root.visible = true
    dr.root.position.set(o.dx, o.dy, o.dz)
    dr.root.rotation.y = o.dyaw
    poseExitDrone(dr, t, o.spin, o.dpitch, o.droll, o.thrust)
    const gy = floorAt(this.nav, o.dx, o.dz)
    const lift = o.dy - gy
    v.droneShadow.visible = gy > -50 && lift < 8
    v.droneShadow.position.set(o.dx, gy + 0.03, o.dz)
    v.droneShadow.scale.setScalar(1.05 + lift * 0.08)
    // ── Flux ──
    const hr = v.heroRoot
    hr.visible = true
    hr.position.set(o.hx, o.hy, o.hz)
    if (o.mode === 'ride') {
      // On the deck he banks with it (its tilt pivots under his feet).
      _e.set(o.dpitch, o.dyaw, o.droll, 'YXZ')
      hr.quaternion.setFromEuler(_e).multiply(_qy.setFromAxisAngle(_up, o.hyaw - o.dyaw))
    } else {
      hr.quaternion.setFromAxisAngle(_up, o.hyaw)
    }
    const rig = v.hero
    if (o.mode === 'walk') {
      const m = v.motion
      m.walk = o.walk
      m.phase = o.stride
      m.fwd = 1
      m.side = 0
      m.dash = 0
      animateHeroWalk(rig, m, t)
    } else if (o.mode === 'stand') {
      animateHeroIdle(rig, t)
      pose(rig, 'kneeL')
      pose(rig, 'kneeR')
      pose(rig, 'head', o.look, Math.sin(t * 0.7 + 0.5) * 0.06, 0)
    } else {
      animateHeroHop(rig, o.crouch, o.tuck, t)
      if (o.cheer >= 0) animateHeroVictory(rig, o.cheer)
    }
    // Atlas rides out with him, at his shoulder.
    this.atlasWorld?.root.scale.setScalar(1)
    this.followAtlas(hr, dt, false)
    const fy = floorAt(this.nav, o.hx, o.hz)
    v.heroShadow.visible = o.mode !== 'ride' && fy > -50
    v.heroShadow.position.set(o.hx, fy + 0.035, o.hz)
    // ── The camera ──
    const cam = this.camera
    const sh = this.exitCam.frame(this.cine, run, o, t, dt, cam.aspect, fovForAspect(cam.aspect))
    cam.position.set(sh.x, sh.y, sh.z)
    cam.lookAt(sh.tx, sh.ty, sh.tz)
    if (Math.abs(cam.fov - sh.fov) > 0.01) {
      cam.fov = sh.fov
      cam.updateProjectionMatrix()
    }
  }

  /** A frame of a third-person freeze-frame: Flux's rig where he stands,
   *  reacting to what holds him, and the director's camera. */
  private frameFreeze(dt: number): void {
    const s = this.freeze.shot
    const v = this.exitView
    if (!s || !v) return
    const t = this.freeze.t
    const hr = v.heroRoot
    hr.visible = true
    // A trap's hold shakes him in place; the other shots stand him still. A
    // barrel's leaves him squashed flat, wide as a pancake.
    const squashed = s.kind === 'trap' && this.trapCamHazard === 'barrel'
    hr.scale.set(squashed ? 1.45 : 1, squashed ? 0.28 : 1, squashed ? 1.45 : 1)
    const shake = s.kind === 'trap' && !squashed ? 0.035 : 0
    hr.position.set(
      s.hx + (shake ? (Math.random() - 0.5) * shake : 0),
      s.hy + (shake ? Math.random() * shake : 0),
      s.hz + (shake ? (Math.random() - 0.5) * shake : 0)
    )
    hr.quaternion.setFromAxisAngle(_up, s.hyaw)
    // The respawn's sink: he lies on his back and goes down into the floor.
    if (s.kind === 'sink') {
      const k = Math.min(1, t / SINK_S)
      hr.rotateX(-Math.PI / 2)
      hr.position.y = s.hy + 0.3 - k * k * 1.8
    }
    const rp = s.kind === 'rescue' ? this.poseRescue() : null
    if (rp) {
      hr.position.set(rp.x, rp.y, rp.z)
      if (rp.hang) animateHeroHop(v.hero, 0, 0.6, t)
      else animateHeroIdle(v.hero, t)
    } else animateHeroIdle(v.hero, t)
    const fy = floorAt(this.nav, s.hx, s.hz)
    v.heroShadow.visible = fy > -50 && s.hy - fy < 3
    v.heroShadow.position.set(s.hx, fy + 0.035, s.hz)
    const view = this.freeze.frame(this.cine, dt)
    if (!view) return
    const cam = this.camera
    cam.position.set(view.x, view.y, view.z)
    cam.lookAt(view.tx, view.ty, view.tz)
  }

  private syncViewmodel(dt: number): void {
    const p = this.player
    const c = this.combat
    const vm = this.vmRoot
    const beam = hud.phase === 'beamIn' ? 1 - this.beamPose.arm
      : hud.phase === 'beamOut' || hud.phase === 'dead' ? 1 : 0
    const block = c.blocking ? 1 : 0
    // Portrait screens are narrow: tuck the arm in and shrink it so it never
    // eats the right third of the view.
    const portrait = this.camera.aspect < 1
    const ax = portrait ? 0.15 : 0.25
    const ay = portrait ? -0.3 : -0.27
    // A fumble (`sim/fumble.ts`): the arm flails, jittery shakes and wobbles,
    // full for most of the panic and settling over its last 40 %.
    const tt = this.time
    const fl = Math.min(1, this.fumble.panicT / (FUMBLE_PANIC * 0.4))
    vm.position.set(
      ax + Math.cos(p.bob) * 0.012 * p.bobAmp - block * 0.05 + fl * (Math.sin(tt * 47) * 0.05 + Math.sin(tt * 29 + 1) * 0.03),
      ay + Math.abs(Math.sin(p.bob)) * 0.014 * p.bobAmp - beam * 0.5 - block * 0.04 + fl * (Math.sin(tt * 39 + 2) * 0.045 + Math.abs(Math.sin(tt * 23)) * 0.03),
      -0.62 + c.recoil * 0.07 + fl * Math.sin(tt * 33) * 0.04
    )
    vm.rotation.set(
      0.05 + Math.sin(tt * 1.6) * 0.006 + c.recoil * 0.12 + fl * Math.sin(tt * 31) * 0.2,
      (portrait ? 0.16 : 0.1) + fl * Math.sin(tt * 37 + 1) * 0.22,
      fl * Math.sin(tt * 43) * 0.42
    )
    vm.scale.setScalar(portrait ? 0.62 : 0.82)
    // Charge glow: grows through lv1, flickers at full charge (the classic)
    const info = chargeInfo(c.charging ? c.charge : 0, this.stats)
    if (c.charging && info.toL1 > 0.2 && hud.phase === 'play') chargeHum(info.toL1 * 0.5 + info.toL2 * 0.5, info.level >= 2, info.level === 3)
    else chargeHum(null)
    const coreMat = this.vm.coreMat
    const haloMat = this.vm.haloMat
    if (fl > 0) {
      // The muzzle sparks and sputters while the arm flails.
      coreMat.color.set(FUMBLE_SPARKS[Math.floor(tt * 24) % FUMBLE_SPARKS.length]!)
      haloMat.color.copy(coreMat.color)
      haloMat.opacity = (0.2 + Math.random() * 0.35) * fl
      this.vm.core.scale.setScalar(1 + Math.random() * 0.8 * fl)
      this.vm.halo.scale.setScalar(0.5 + Math.random() * 0.5 * fl)
    } else if (c.charging && info.level === 3) {
      // Overloaded: a gold-white core in a violet halo that breathes and
      // turns (2.5 Hz, under the 3-flashes-a-second line), the arm trembling
      // and spitting violet sparks.
      const pulse = 0.5 + 0.5 * Math.sin(this.time * Math.PI * 5)
      coreMat.color.set('#fff6d6')
      haloMat.color.set(pulse > 0.5 ? '#b46cff' : '#d38bff')
      haloMat.opacity = 0.6 + 0.3 * pulse
      this.vm.core.scale.setScalar(2.5 + pulse * 0.3)
      this.vm.halo.scale.setScalar(2.0 + pulse * 0.4)
      this.vm.halo.rotation.z += dt * 5
      vm.rotation.z += Math.sin(this.time * 47) * 0.012
      if (Math.random() < 0.3) {
        const m = this.muzzle()
        this.fx.sparks(m[0], m[1], m[2], '#d38bff', 2, 3, 0.08)
      }
    } else if (c.charging && info.toL1 > 0.25) {
      const lv = info.level
      const flick = lv >= 2 ? (Math.floor(this.time * 30) % 2 === 0 ? 1 : 0.55) : 1
      if (info.perfect) coreMat.color.set('#ffd84a')
      // Building toward the Overload: the full-charge cyan bleeds to violet.
      else if (lv >= 2 && info.toL3 > 0) coreMat.color.set('#7ff4ff').lerp(OVERLOAD_VIOLET, info.toL3 * 0.7)
      else if (lv >= 2) coreMat.color.set('#7ff4ff')
      else if (lv === 1) coreMat.color.set('#c8ff7a')
      else coreMat.color.copy(this.vm.coreColor)
      haloMat.color.copy(coreMat.color)
      haloMat.opacity = (0.25 + 0.45 * (lv >= 1 ? 1 : info.toL1)) * flick
      const sc = 1 + info.toL1 * 0.6 + info.toL2 * 0.9
      this.vm.core.scale.setScalar(sc)
      this.vm.halo.scale.setScalar(0.6 + info.toL1 * 0.6 + info.toL2 * 0.8 + (info.perfect ? 0.3 : 0))
    } else {
      coreMat.color.copy(this.vm.coreColor)
      haloMat.opacity = Math.max(0, haloMat.opacity - dt * 6)
      this.vm.core.scale.setScalar(1 + Math.sin(this.time * 5) * 0.08 + this.vmFlash * 0.8)
      if (this.vmFlash > 0) {
        coreMat.color.set(this.vmFlashColor)
        haloMat.color.set(this.vmFlashColor)
        haloMat.opacity = Math.max(haloMat.opacity, this.vmFlash * 0.7)
        this.vm.halo.scale.setScalar(0.8 + this.vmFlash)
      }
      this.vmFlash = Math.max(0, this.vmFlash - dt * 4)
    }
    // The block barrier: raised while guarding, warmer as Power runs out.
    this.vm.barrier.update(dt, c.blocking && hud.phase === 'play', c.power / Math.max(1, c.maxPower), this.time)
  }

  /** Project a world point to CSS pixels on the canvas (for the HUD). */
  project(x: number, y: number, z: number, out: { x: number; y: number; visible: boolean }): void {
    _v3.set(x, y, z).project(this.camera)
    const el = getRenderer().domElement
    out.visible = _v3.z < 1 && _v3.z > -1
    out.x = (_v3.x * 0.5 + 0.5) * el.clientWidth
    out.y = (-_v3.y * 0.5 + 0.5) * el.clientHeight
  }

  resize(w: number, h: number): void {
    this.vmCamera.aspect = w / h
    this.vmCamera.fov = w < h ? 58 : 50
    this.vmCamera.updateProjectionMatrix()
    const r = getRenderer()
    this.fx.setScale(h * r.getPixelRatio(), this.camera.fov)
  }

  dispose(): void {
    this.storyScene?.skip()
    this.crane?.dispose()
    this.city?.dispose()
    this.trail?.dispose()
    this.climb?.dispose()
    chargeHum(null)
    hud.hints = []
    hud.lesson = null
    hud.pointerFree = false
    this.fx.dispose()
    this.shatter?.dispose()
    this.scene.traverse((o) => {
      const m = o as Mesh
      if (m.geometry) m.geometry.dispose()
    })
    this.vmScene.traverse((o) => {
      const m = o as Mesh
      if (m.geometry) m.geometry.dispose()
    })
  }
}
