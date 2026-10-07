import {
  AdditiveBlending, BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Fog, Group, HemisphereLight, DirectionalLight,
  LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial, PerspectiveCamera, PlaneGeometry, Scene, Sprite, SpriteMaterial, Vector3,
  CylinderGeometry
} from 'three'
import type { GameMode } from '../engine/app'
import { getRenderer } from '../engine/renderer'
import { buildHero, animateHeroIdle, animateHeroWalk, type HeroColors } from '../models/hero'
import { buildPip, animatePip } from '../models/npc'
import { buildTeleporter, type PadMesh } from '../models/props'
import { buildTrooper, poseTrooper, buildHeli, poseHeli } from '../models/enemies'
import { buildBlazeMaster, poseBoss } from '../models/bosses'
import { buildGauss, poseGauss, newGaussPose, setGaussGlow, type GaussRig } from '../models/gauss'
import { buildStasisCapsule, type StasisCapsule } from '../models/stasis'
import { buildDiorama, type Diorama } from '../models/diorama'
import { buildStreet, vexFaceTexture, STREET_HAZE, type Street } from '../models/street'
import { newMotion } from '../models/motion'
import { pose, nudge, torus, cap, sph, rcyl, paint, type Rig } from '../models/kit'
import { PAL } from '../models/palette'
import { buildBarrier, type BarrierFx } from '../models/barrier'
import { buildChargedShot, type ChargedShotFx } from '../fx/chargedShot'
import { glowTexture } from '../world/textures'
import { THEMES } from '../world/themes'
import { buildLabSet } from '../sim/hub'
import { Particles } from '../fx/particles'
import { tickHud } from '../state/hud'
import { sfx } from '../audio/sfx'
import { setMusicTrack } from '@/use/useSound'
import { setSongStartHint } from '../audio/music'
import {
  INTRO_END, SKIP_AFTER, ATLAS_HOLD, eventsBetween, overlayAt, shotIndexAt, streetTime, streetRate, ringReach, ramp, clamp01,
  STREET_FROM, STREET_RELEASE, AFTER, STREET_DONE, SHOTS, STREET_AT as STREET_TIME_AT, type ShotId,
  SHOW_HIT, SHOW_DIVE, SHOW_GUARD_UP, SHOW_PARRY, SHOW_GUARD_DOWN, SHOW_SHIELD_UP, SHOW_VOLLEY, SHOW_ORB_FLIGHT, SHOW_SHIELD_DOWN,
  SHOW_ANSWER, SHOW_ANSWER_HIT, SHOW_SLAM, SHOW_SLIDE_FROM, SHOW_RING_OVER, SHOW_SLIDE_TO, SHOW_FINISH, SHOW_FINISH_HIT,
  SHOW_GEL, SHOW_GEL_BURST, SPIRE_FLASH, VEX_ON, CUTIN_FROM, CUTIN_TO, LAB_FROM, ALARM_TO, GAUSS_TURN,
  DISC_FROM, DISC_TO, STAGGER_AT, LEVER_AT, SAFE_FROM, SEAL_AT, FROST_FROM, FROST_TO, HEART_FROM, WAKE_FROM,
  PIP_POP, GLYPH_ON, LV_POP, HOLO_FROM, SCRAP_BLINK, TURN_FROM, HOLO_FOLD_FROM, HOLO_FOLD_TO, STEP_FROM, STEP_TO, BEAM_RISE,
  FLASH_FROM, FLASH_FULL
} from './introScript'
import { cine, cineLive, resetCine, setGateHandler, setSkipHandler, skipHold } from './cine'
import { holdProgress, stepHold } from './holdSkip'
import { sceneQuality, type SceneQuality } from '../engine/quality'
import { buildAtlas, animateAtlas } from '../models/atlas'
import { dashPose } from '../models/dash'
import { Shatter } from '../fx/shatter'

/** The street's two slides (action s): under the Trooper's swing, and under
 *  its shock ring. */
export const DASH_RUN: readonly [number, number] = [1.1, 1.6]

import { playVoiceSoon, prefetchVoice, stopVoice } from '../audio/voice'
import { audio, audioAllowed } from '../audio/engine'

/** How far ahead of an Atlas line its recording starts loading (s). */
const VOICE_LEAD = 1.5
/** Atlas's talk light runs this long after a line starts (its longest take). */
const ATLAS_TALK = 2.2

/**
 * ─── The intro cutscene: "Wake-Up Call" ──────────────────────────────────────
 *
 * A `GameMode` that plays `introScript.ts` (the six shots of `story-arc.md`
 * § 1) on the game loop's fixed step, so ads, modals, a hidden tab and a
 * platform pause freeze it like any mission: the loop simply stops calling it.
 *
 * All five sets live in one scene, far apart, and only the current shot's is
 * drawn: the neon street (cold open), the valley diorama (the Red Signal), a
 * dark stage for Blaze Master's cut-in, and Gauss's lab (the lab, safe mode,
 * the wake-up and the beam), which holds Pip's hologram of the valley. The
 * light count never changes between shots (one hemisphere, two directionals,
 * re-tinted), so no shot recompiles a shader.
 *
 * Every pose, camera and effect is a function of the cutscene clock, like the
 * beam-in (`sim/beamIn.ts`); the renderer interpolates between steps. The
 * overlays (rewind, eyelids, HUD boot, flash) are drawn by
 * `components/story/CutsceneLayer.vue` from `cineLive`.
 */

export interface IntroOptions {
  /** A replay from Options: no music handover, and the owner goes back to the hub. */
  replay?: boolean
  /** The cutscene became the live mode (the loader is gone): the owner starts
   *  building what comes next behind it. */
  onStart?: () => void
  /** The film itself began to run (at once, or on the start gate's press). */
  onLive?: () => void
  /** It ended (`skipped`: by the player). Called once. */
  onEnd?: (skipped: boolean) => void
  /** Flux's gear colours (the hub's refresh passes the player's). */
  colors?: HeroColors
  /** Scenery quality (default: the device's, `engine/quality.ts`). */
  quality?: SceneQuality
}

const STEP = 1 / 60

/** Where the sets stand (the lab is at the origin). */
const STREET_AT = new Vector3(-300, 0, 0)
/** The showcase's three shots: fired, landed (action clock), size. */
const SHOTS_FIRED: ReadonlyArray<readonly [number, number, number]> = [
  [STREET_RELEASE, SHOW_HIT, 1.4], [SHOW_ANSWER, SHOW_ANSWER_HIT, 1], [SHOW_FINISH, SHOW_FINISH_HIT, 1.4]
]
/** The muzzle flash's life, and the tracer's fade after the hit (s). */
const FLASH_FOR = 0.14
const TRACER_FADE = 0.22
const _muzzle = new Vector3()

/** Drone 2's post for its volley, where the answer shot meets it (street space). */
const D1_AT = new Vector3(1.4, 3.0, -8.2)
const VALLEY_AT = new Vector3(300, 0, 0)
const CUTIN_AT = new Vector3(0, 0, 300)

/** The lab's layout: Flux's capsule, Gauss's, where she stands, the hologram. */
const FLUX_CAP = new Vector3(1.45, 0, -3.1)
const GAUSS_CAP = new Vector3(-1.45, 0, -3.1)
const GAUSS_AT = new Vector3(0.05, 0, -2.3)
const HOLO_AT = new Vector3(0.7, 1.12, -1.75)
/** Flux's eye as he wakes: at the front of his capsule, the glass down. */
const EYE = new Vector3(FLUX_CAP.x, 0.34 + 1.06, FLUX_CAP.z + 0.45)
const PAD_EYE = new Vector3(0, 0.3 + 1.06, 0)
/** The hologram's scale: the valley (r 14 m) as a table-top a metre across. */
const HOLO_SCALE = 0.052
/** Where Pip hovers while projecting: up and aside, clear of the hologram. */
const PIP_PROJECT = new Vector3(1.35, 1.9, -1.65)
/** …and on the pad's edge, spinning the ring up. */
const PIP_PAD = new Vector3(-1.1, 1.5, 0.95)

interface CamKey {
  t: number
  pos: [number, number, number]
  look: [number, number, number]
  /** Horizontal field of view (deg): the framing's width holds in portrait. */
  hfov: number
}

const _a = new Vector3()
const _b = new Vector3()
const _c = new Vector3()
const _d = new Vector3()
const _up = new Vector3(0, 1, 0)

/** Smoothly between camera keys (held before the first and after the last). */
const camAt = (list: readonly CamKey[], t: number, pos: Vector3, look: Vector3): number => {
  if (t <= list[0]!.t) {
    pos.fromArray(list[0]!.pos)
    look.fromArray(list[0]!.look)
    return list[0]!.hfov
  }
  for (let i = 1; i < list.length; i++) {
    const k1 = list[i]!
    if (t <= k1.t) {
      const k0 = list[i - 1]!
      const u = ramp(k0.t, k1.t, t)
      pos.fromArray(k0.pos).lerp(_a.fromArray(k1.pos), u)
      look.fromArray(k0.look).lerp(_a.fromArray(k1.look), u)
      return k0.hfov + (k1.hfov - k0.hfov) * u
    }
  }
  const last = list[list.length - 1]!
  pos.fromArray(last.pos)
  look.fromArray(last.look)
  return last.hfov
}

// ─── Camera keys per shot (set-local coordinates) ────────────────────────────

// Every shot moves between few keys, each segment eased in and out (`camAt`),
// so the camera settles on its framing while the action plays and drifts on
// only between beats: holds, not whip pans.

/** The street, on the ACTION clock (`streetTime`): so the slow motion slows it. */
const STREET_CAM: readonly CamKey[] = [
  // High over the wet street, the billboards on both sides; Flux a speck far
  // down it, running in. One long crane down to his height as he nears.
  { t: STREET_FROM, pos: [2.4, 3.4, 1.2], look: [0, 1.6, -24], hfov: 66 },
  { t: 0.9, pos: [0.9, 0.5, -2.6], look: [0, 1.1, -9], hfov: 74 },
  // The poster frame: low, under the Trooper's swing, the billboards above.
  { t: 1.2, pos: [-1.5, 0.28, -3.6], look: [0.4, 1.35, -6.8], hfov: 80 },
  { t: 1.55, pos: [-1.3, 0.3, -3.2], look: [0.3, 1.3, -6.2], hfov: 80 },
  // Side on: Flux planted on the right, the Trooper's shield on the left; it
  // holds there through the charge, the release and the freeze.
  { t: 2.05, pos: [4.6, 1.1, -3.9], look: [0.1, 0.95, -5.0], hfov: 72 },
  { t: STREET_RELEASE, pos: [4.0, 1.0, -4.4], look: [0.15, 0.95, -5.0], hfov: 70 },
  // The showcase. The shot lands: a beat on the Trooper, staggering.
  { t: 3.3, pos: [3.6, 1.2, -3.4], look: [0.3, 1.0, -5.9], hfov: 72 },
  // Over his left shoulder (Atlas keeps to his right) as drone 1 dives in,
  // and the parry swats it away.
  { t: 4.1, pos: [-1.5, 1.75, -1.4], look: [-0.3, 1.45, -5.8], hfov: 76 },
  { t: 5.8, pos: [-1.6, 1.7, -1.6], look: [-1.2, 1.1, -6.4], hfov: 76 },
  // Low, three-quarter front: drone 2 up high, the shield taking its volley.
  { t: 7.0, pos: [-2.4, 0.8, -2.3], look: [0.7, 1.9, -6.6], hfov: 78 },
  { t: 10.1, pos: [-2.2, 0.85, -2.6], look: [0.9, 1.4, -6.8], hfov: 78 },
  // Wide from the side: the Trooper's ring rolls out, Flux slides under it.
  // Raised, so the ring reads as a ring and not as a wall.
  { t: 10.7, pos: [5.0, 2.6, -4.4], look: [0.2, 0.5, -5.6], hfov: 80 },
  { t: 12.9, pos: [4.7, 2.2, -5.2], look: [0.2, 0.7, -6.0], hfov: 78 },
  // Front on for the Repair Gel, easing in to the hero pose the freeze holds.
  { t: 13.6, pos: [1.0, 2.0, -7.5], look: [0.1, 1.05, -5.0], hfov: 64 },
  { t: 14.9, pos: [1.3, 1.4, -7.7], look: [0.1, 1.15, -5.0], hfov: 60 },
  { t: 17.1, pos: [1.7, 1.05, -7.8], look: [0.1, 1.2, -5.0], hfov: 58 }
]

const VALLEY_CAM: readonly CamKey[] = [
  // A slow aerial drift over the bright valley while the relays chime…
  { t: 11 + AFTER, pos: [6, 18, 36], look: [0, 1, 0], hfov: 72 },
  { t: 14.4 + AFTER, pos: [2, 14, 28], look: [-1.5, 2.2, -1.5], hfov: 72 },
  // …in on the Spire as it flashes and Vex's face comes on…
  { t: 16.0 + AFTER, pos: [-0.5, 10.5, 17], look: [-4, 4.5, -3], hfov: 76 },
  // …and back out, wide, as the red ring rolls over all of it.
  { t: CUTIN_FROM, pos: [2.5, 13.5, 27], look: [-2, 2, -1], hfov: 80 }
]

// Low and wide from beside the pad, on the right: Gauss three-quarter on,
// Flux's capsule beyond her, Pip peeking over the console at the edge. A slow
// push-in across the whole shot; the disc's close-up is the one cut away.
const LAB_CAM: readonly CamKey[] = [
  { t: LAB_FROM, pos: [2.9, 0.7, 1.9], look: [0.3, 1.35, -2.7], hfov: 80 },
  { t: DISC_FROM, pos: [2.5, 0.75, 1.4], look: [0.45, 1.35, -2.75], hfov: 78 },
  { t: DISC_TO, pos: [2.3, 0.85, 1.1], look: [0.55, 1.3, -2.8], hfov: 76 },
  { t: SAFE_FROM, pos: [1.9, 0.95, 0.6], look: [0.7, 1.25, -2.9], hfov: 76 }
]

/** The Atlas disc: held long enough to see it slide into his chest port. */
const DISC_CAM: readonly CamKey[] = [
  { t: DISC_FROM, pos: [1.9, 1.45, -1.55], look: [1.45, 1.2, -2.9], hfov: 56 },
  { t: DISC_TO, pos: [1.8, 1.4, -1.8], look: [1.45, 1.2, -2.9], hfov: 50 }
]

const SAFE_CAM: readonly CamKey[] = [
  { t: SAFE_FROM, pos: [-0.1, 1.5, -0.5], look: [-1.3, 1.3, -3.1], hfov: 64 },
  { t: WAKE_FROM, pos: [-0.5, 1.5, -1.0], look: [-1.45, 1.35, -3.1], hfov: 58 }
]

/** Where Flux looks in first person (world). */
const FP_LOOK: ReadonlyArray<readonly [number, number, number, number]> = [
  // t, x, y, z
  [WAKE_FROM, GAUSS_CAP.x, 1.3, GAUSS_CAP.z + 0.2],
  [43.2 + AFTER, GAUSS_CAP.x, 1.35, GAUSS_CAP.z],
  [44.4 + AFTER, HOLO_AT.x, HOLO_AT.y + 0.2, HOLO_AT.z],
  [TURN_FROM, HOLO_AT.x, HOLO_AT.y + 0.2, HOLO_AT.z],
  [STEP_FROM, 0, 1.0, 0],
  [STEP_TO, -0.3, 1.45, 3],
  // Up the beam column as it rises round him.
  [FLASH_FROM, -0.3, 2.3, 3],
  [INTRO_END, -0.3, 2.3, 3]
]

const fpLookAt = (t: number, out: Vector3): Vector3 => {
  let i = 1
  while (i < FP_LOOK.length - 1 && t > FP_LOOK[i]![0]) i++
  const k0 = FP_LOOK[i - 1]!
  const k1 = FP_LOOK[i]!
  const u = ramp(k0[0], k1[0], t)
  return out.set(k0[1] + (k1[1] - k0[1]) * u, k0[2] + (k1[2] - k0[2]) * u, k0[3] + (k1[3] - k0[3]) * u)
}

/** The stasis heartbeat: a beat every 1.3 s once the frost has set, 0..1. */
const heartbeat = (t: number): number => {
  if (t < HEART_FROM) return 0
  const p = (t - HEART_FROM) % 1.3
  return Math.exp(-p * 7) + 0.6 * Math.exp(-Math.max(0, p - 0.2) * 9) * (p > 0.2 ? 1 : 0)
}

/** A zig-zag of red lightning between two points, re-rolled every call. */
const crackle = (line: LineSegments, from: Vector3, to: Vector3, jag: number): void => {
  const pos = line.geometry.attributes.position!.array as Float32Array
  const n = pos.length / 6
  let px = from.x
  let py = from.y
  let pz = from.z
  for (let i = 0; i < n; i++) {
    const u = (i + 1) / n
    const j = i === n - 1 ? 0 : jag
    const x = from.x + (to.x - from.x) * u + (Math.random() - 0.5) * j
    const y = from.y + (to.y - from.y) * u + (Math.random() - 0.5) * j
    const z = from.z + (to.z - from.z) * u + (Math.random() - 0.5) * j
    pos.set([px, py, pz, x, y, z], i * 6)
    px = x
    py = y
    pz = z
  }
  line.geometry.attributes.position!.needsUpdate = true
}

const newCrackle = (segs: number): LineSegments => {
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(new Float32Array(segs * 6), 3))
  const l = new LineSegments(g, new LineBasicMaterial({ color: new Color('#ff3048'), transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false }))
  l.frustumCulled = false
  l.visible = false
  return l
}

const additive = (hex: string, opacity: number): MeshBasicMaterial =>
  new MeshBasicMaterial({ color: new Color(hex), transparent: true, opacity, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false })

export class IntroMode implements GameMode {
  scene = new Scene()
  camera = new PerspectiveCamera(50, 1, 0.05, 420)
  /** The cutscene clock (s). */
  t = 0
  private started = false
  private ended = false
  private readonly opts: IntroOptions
  private fx: Particles
  private hemi = new HemisphereLight(new Color('#ffffff'), new Color('#202040'), 1)
  private key = new DirectionalLight(new Color('#ffffff'), 1)
  private rim = new DirectionalLight(new Color('#7fd6ff'), 0.6)
  private fog = new Fog(new Color('#000000'), 20, 60)
  private sky = new Color('#000000')

  // ── Sets ──
  private streetSet = new Group()
  private street!: Street
  private runner!: Rig
  private runnerRoot = new Group()
  private runMotion = newMotion(7)
  private trooper!: Rig
  private trooperRoot = new Group()
  private drones: Rig[] = []
  private droneRoots: Group[] = []
  /** The charge at the muzzle and the charged shot: the game's own looks
   *  (`fx/chargedShot.ts`; the charge steps green, then the full charge's
   *  flickering cyan, as on the arm cannon in play). */
  private charge = new Group()
  private chargeGlow!: SpriteMaterial
  private chargeCore!: MeshBasicMaterial
  private shot!: ChargedShotFx
  /** Each shot visibly leaves the cannon (#106: the flights are a tenth of a
   *  second, and started inside his forearm): a flash at the muzzle ring and
   *  a plasma tracer from the muzzle to the shot, fading after the hit. */
  private flash!: Sprite
  private flashMat!: SpriteMaterial
  private tracer!: Mesh
  private tracerMat!: MeshBasicMaterial
  private eyeStreak!: Mesh
  /** The showcase's props: the shield (the game's barrier, held free of the
   *  first-person camera), drone 2's orbs, the Trooper's shock ring, the
   *  Repair Gel flask and its burst. */
  private shield!: BarrierFx
  private readonly shieldAt = new Vector3()
  /** The last frame's length (s): the barrier animates on its own clock. */
  private frameDt = 0
  private orbs: Mesh[] = []
  private shockRing!: Mesh
  private shockMat!: MeshBasicMaterial
  private flask!: Mesh
  private healRing!: Mesh
  private healMat!: MeshBasicMaterial
  /** The action clock last frame: the showcase's bursts fire on crossings. */
  private lastSt = STREET_FROM

  // Everything after the cold open streams in (see the constructor), so these
  // are assigned by their build jobs.
  private valleySet = new Group()
  private valley!: Diorama
  private vexHolo!: Mesh
  private vexMat!: MeshBasicMaterial

  private cutinSet = new Group()
  private blaze!: Rig

  private labSet = new Group()
  private pad!: PadMesh
  private fluxCap!: StasisCapsule
  private gaussCap!: StasisCapsule
  private sleeper!: Rig
  private sleeperRoot = new Group()
  private gauss!: GaussRig
  private gaussRoot = new Group()
  private gp = newGaussPose()
  private pip!: Rig
  private pipRoot = new Group()
  private holo!: Diorama
  private holoBeam!: Mesh
  private disc!: Mesh
  private alarm: MeshBasicMaterial[] = []
  private armCrackle = newCrackle(10)
  private glassCrackle = newCrackle(14)
  private beamGlow!: Mesh
  /** The sets still to build, in shot order, and how many are done. */
  /** How far into a dash Flux is now (0..1), and the action time the dust
   *  last checked. */
  private dashOn = 0
  private lastDust = -Infinity
  /** The Shield Trooper's gait and guard, through the game's own motion layer
   *  (the old direct pose held the shield up like an umbrella), and its
   *  pieces once the finish takes it apart (#105). */
  private readonly trooperMotion = newMotion(3, 'trooper')
  private shatter: Shatter | null = null
  private jobs: Array<() => Group> = []
  private jobAt = 0
  private readonly low: boolean
  /** Atlas: at Flux's shoulder in the cold open; out of his chest disc and
   *  into the top left of his view from the wake-up on. */
  private atlasStreet!: Rig
  private atlasLab!: Rig
  private camPos = new Vector3()
  private camLook = new Vector3()

  constructor(opts: IntroOptions = {}) {
    this.opts = opts
    this.low = (opts.quality ?? sceneQuality()) === 'low'
    this.fx = new Particles(this.low ? 220 : 500)
    const s = this.scene
    s.background = this.sky
    s.fog = this.fog
    this.key.position.set(0.6, 1, 0.9)
    this.rim.position.set(-1, 0.6, -0.8)
    s.add(this.hemi, this.key, this.rim, this.fx.points)


    // The sets in shot order. The loader builds the valley and the cut-in
    // (the opening shot, #121: their shaders compile behind the splash too);
    // the rest stream in one per frame while it plays (`streamSets`), the
    // street last, as it plays last, and a shot that needs one not built yet
    // builds it first (`needSets`), so a skip never shows a missing set.
    this.jobs = [
      () => this.buildValley(),
      () => this.buildCutin(),
      () => this.buildLab(),
      () => this.buildCast(),
      () => this.buildHolo(),
      () => this.buildStreetSet()
    ]
    this.needSets(2)
  }

  /** The neon street, the cold open's set: it plays last now. */
  private buildStreetSet(): Group {
    const opts = this.opts
    this.street = buildStreet({ low: this.low })
    this.streetSet.add(this.street.root)
    this.runner = buildHero(opts.colors)
    this.runnerRoot.add(this.runner.root)
    this.streetSet.add(this.runnerRoot)
    this.trooper = buildTrooper()
    this.trooperRoot.add(this.trooper.root)
    this.streetSet.add(this.trooperRoot)
    for (let k = 0; k < 2; k++) {
      const d = buildHeli()
      const r = new Group()
      r.add(d.root)
      this.drones.push(d)
      this.droneRoots.push(r)
      this.streetSet.add(r)
    }
    this.chargeGlow = new SpriteMaterial({ map: glowTexture(), color: new Color('#c8ff7a'), transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false })
    this.chargeCore = new MeshBasicMaterial({ color: new Color('#ffffff'), toneMapped: false })
    const halo = new Sprite(this.chargeGlow)
    halo.renderOrder = 6
    this.charge.add(halo, new Mesh(sph(0.09, 12, 8), this.chargeCore))
    this.shot = buildChargedShot('charge2')
    this.flashMat = new SpriteMaterial({ map: this.chargeGlow.map, color: new Color('#e6fbff'), transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false })
    this.flash = new Sprite(this.flashMat)
    this.flash.renderOrder = 7
    this.flash.visible = false
    this.tracerMat = additive('#7ff4ff', 0.8)
    this.tracer = new Mesh(new CylinderGeometry(1, 1, 1, 8, 1, true), this.tracerMat)
    this.tracer.visible = false
    this.eyeStreak = new Mesh(cap(0.03, 1.2, 6, 2), additive(PAL.heroPlasma, 0.55))
    this.streetSet.add(this.charge, this.shot.root, this.eyeStreak, this.flash, this.tracer)
    // The showcase's props.
    this.shield = buildBarrier({ free: 0.62 })
    for (let k = 0; k < SHOW_VOLLEY.length; k++) {
      const o = new Mesh(sph(0.11, 10, 8), additive('#ff4a3a', 1))
      o.visible = false
      this.orbs.push(o)
    }
    this.shockMat = additive('#ff2a36', 0.85)
    this.shockRing = new Mesh(torus(1, 0.045, 6, 48), this.shockMat)
    this.flask = new Mesh(cap(0.045, 0.1, 8, 4), additive('#5dff8a', 0.95))
    this.flask.position.set(0, -0.22, 0.03)
    this.runner.bones.elbowL!.add(this.flask)
    this.healMat = additive('#5dff8a', 0.8)
    this.healRing = new Mesh(torus(0.7, 0.05, 6, 36), this.healMat)
    this.streetSet.add(this.shield.root, this.shockRing, this.healRing, ...this.orbs)
    this.shockRing.visible = this.flask.visible = this.healRing.visible = false
    // Atlas, flying at his shoulder: his first mission, logged.
    this.atlasStreet = buildAtlas()
    this.streetSet.add(this.atlasStreet.root)
    this.streetSet.position.copy(STREET_AT)
    this.scene.add(this.streetSet)
    return this.streetSet
  }

  /** Build the next set (one per frame), and compile its materials now,
   *  while the cold open plays, rather than on its first frame. */
  private streamSets(): void {
    if (this.jobAt >= this.jobs.length) return
    const set = this.jobs[this.jobAt++]!()
    // Shown or not yet, compile it now (compile skips hidden objects).
    const was = set.visible
    set.visible = true
    try { getRenderer().compile(set, this.camera, this.scene) } catch { /* compiles on first draw */ }
    set.visible = was
  }

  /** Make sure the first `n` sets exist. */
  private needSets(n: number): void {
    while (this.jobAt < Math.min(n, this.jobs.length)) this.jobs[this.jobAt++]!()
  }

  private buildValley(): Group {
    const s = this.scene
    this.valley = buildDiorama({ low: this.low })
    this.valleySet.add(this.valley.root)
    this.vexMat = new MeshBasicMaterial({
      map: vexFaceTexture(), transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false
    })
    this.vexHolo = new Mesh(new PlaneGeometry(7.2, 4.5), this.vexMat)
    this.vexHolo.position.set(this.valley.spireTip.x, this.valley.spireTip.y + 3.4, this.valley.spireTip.z)
    this.valleySet.add(this.vexHolo)
    this.valleySet.position.copy(VALLEY_AT)
    s.add(this.valleySet)
    return this.valleySet
  }

  private buildCutin(): Group {
    const s = this.scene
    this.blaze = buildBlazeMaster()
    this.cutinSet.add(this.blaze.root)
    const back = new Mesh(new PlaneGeometry(8, 8), additive('#ff5a1f', 0.35))
    back.position.set(0, 1.4, -1.5)
    this.cutinSet.add(back)
    this.cutinSet.position.copy(CUTIN_AT)
    s.add(this.cutinSet)
    return this.cutinSet
  }

  private buildLab(): Group {
    this.labSet.add(buildLabSet())
    this.pad = buildTeleporter(THEMES.scrapyard)
    ;(this.pad.ringMat as MeshBasicMaterial).opacity = 0.12
    this.labSet.add(this.pad.root)
    // The alarm: a red strip over each of the dome's glow strips.
    for (let k = 0; k < 11; k++) {
      const a = Math.PI + (k / 10) * Math.PI
      const m = additive('#ff2036', 0)
      const strip = new Mesh(cap(0.1, 3.3, 8, 2), m)
      strip.position.set(Math.cos(a) * 7.85, 3.2, Math.sin(a) * 7.85)
      this.labSet.add(strip)
      this.alarm.push(m)
    }
    this.labSet.add(this.armCrackle, this.glassCrackle)
    this.scene.add(this.labSet)
    return this.labSet
  }

  private buildCast(): Group {
    const opts = this.opts
    this.fluxCap = buildStasisCapsule()
    this.fluxCap.root.position.copy(FLUX_CAP)
    // Its lever to the front, where Gauss stands (and out of his view).
    this.fluxCap.root.rotation.y = -Math.PI / 2
    this.gaussCap = buildStasisCapsule()
    this.gaussCap.root.position.copy(GAUSS_CAP)
    // Its lever to the back, its heartbeat light toward Flux as he wakes.
    this.gaussCap.root.rotation.y = Math.PI / 2
    this.labSet.add(this.fluxCap.root, this.gaussCap.root)
    this.sleeper = buildHero(opts.colors)
    this.sleeperRoot.add(this.sleeper.root)
    this.sleeperRoot.position.set(FLUX_CAP.x, 0.34, FLUX_CAP.z)
    this.labSet.add(this.sleeperRoot)
    this.gauss = buildGauss()
    this.gaussRoot.add(this.gauss.root)
    this.labSet.add(this.gaussRoot)
    this.pip = buildPip()
    this.pipRoot.add(this.pip.root)
    this.labSet.add(this.pipRoot)
    this.disc = new Mesh(paint(rcyl(0.07, 0.02, 0.008, 16), '#ffffff'), additive(PAL.glowCyan, 1))
    this.labSet.add(this.disc)
    this.beamGlow = new Mesh(new CylinderGeometry(0.95, 0.95, 4, 28, 1, true), additive(PAL.glowCyan, 0))
    this.beamGlow.position.y = 2.3
    this.labSet.add(this.beamGlow)
    this.atlasLab = buildAtlas()
    this.atlasLab.root.visible = false
    this.labSet.add(this.atlasLab.root)
    return this.labSet
  }

  private buildHolo(): Group {
    this.holo = buildDiorama({ holo: true, low: this.low })
    this.holo.root.scale.setScalar(HOLO_SCALE)
    this.holo.root.position.copy(HOLO_AT)
    this.holo.root.rotation.y = 0.5
    this.labSet.add(this.holo.root)
    this.holoBeam = new Mesh(new CylinderGeometry(0.62, 0.02, 1, 20, 1, true), additive(PAL.glowCyan, 0.12))
    this.labSet.add(this.holoBeam)
    return this.labSet
  }

  enter(): void {
    resetCine()
    cine.on = true
    setSkipHandler(() => this.skip())
    // The tutorial builds behind the film from now, gate or no gate.
    this.opts.onStart?.()
    // The browser lets no sound start before the first press on the page. A
    // player who has not pressed yet would get the opening in silence, with
    // the voices and the score cutting in at whatever shot his first click
    // lands on: the film waits behind "Click to Start" instead.
    // (Asking for the graph makes the context: an embed that grants autoplay
    // is known only once it exists.)
    audio()
    if (audioAllowed()) return this.begin()
    cine.gate = true
    // Only a press the browser counts as one opens it (Esc is not one: the
    // film would start and stay silent).
    setGateHandler(() => { if (audioAllowed()) this.begin() })
  }

  /** The film goes live: from the mode's entry, or from the start gate's press. */
  private begin(): void {
    if (this.started || this.ended) return
    setGateHandler(null)
    cine.gate = false
    this.started = true
    // The score ("Wake-Up Call", `audio/songs.ts`) follows this clock: if the
    // audio only unlocks later (the first tap), it joins at the shot on screen.
    setSongStartHint((id) => (id === 'intro' ? this.t : 0))
    setMusicTrack('intro')
    this.opts.onLive?.()
  }

  /** The player skipped (the button, `Esc`, `Space` held). Counts from `SKIP_AFTER`. */
  skip(): void {
    if (this.ended || this.t < SKIP_AFTER) return
    // Straight to the flash: the handover shows the white frame and the logo,
    // never a cut back into the middle of a shot.
    this.t = Math.max(this.t, FLASH_FULL)
    this.end(true)
  }

  /** End it now, without the end callback (the owner has moved on). */
  abort(): void {
    if (this.ended) return
    this.ended = true
    setSkipHandler(null)
    setGateHandler(null)
    setSongStartHint(null)
    resetCine()
  }

  get isEnded(): boolean {
    return this.ended
  }

  private end(skipped: boolean): void {
    if (this.ended) return
    this.ended = true
    if (skipped) stopVoice()
    cine.skip = false
    cine.vex = ''
    setSkipHandler(null)
    setSongStartHint(null)
    this.opts.onEnd?.(skipped)
  }

  update(dt: number, first = true): void {
    if (!this.started || this.ended) return
    if (first) this.streamSets()
    const t0 = this.t
    this.t = Math.min(INTRO_END, this.t + dt)
    // Atlas's recordings load on demand, a moment before each line.
    for (const e of eventsBetween(t0 + VOICE_LEAD, this.t + VOICE_LEAD)) {
      if (e.kind === 'atlas') prefetchVoice(`story.atlas.${e.key}`)
      if (e.kind === 'vex' && e.key) prefetchVoice(`story.vex.${e.key}`)
    }
    for (const e of eventsBetween(t0, this.t)) {
      switch (e.kind) {
        case 'sfx': sfx(e.name, 0, e.gain ?? 1); break
        case 'line': cine.line = e.shot; break
        case 'atlas':
          cine.atlas = e.key
          cine.atlasSeq++
          cineLive.atlasAt = e.at
          // Its recorded voice (a moment late if it is still loading, never missing).
          playVoiceSoon(`story.atlas.${e.key}`)
          break
        case 'vex':
          cine.vex = e.key
          if (e.key) playVoiceSoon(`story.vex.${e.key}`)
          break
        case 'music': if (!this.opts.replay) setMusicTrack(e.track); break
      }
    }
    // Up from SKIP_AFTER; gone once the flash is full (a skip lands there).
    const skipNow = this.t >= SKIP_AFTER && this.t < FLASH_FULL
    if (cine.skip !== skipNow) cine.skip = skipNow
    // Space held: the ring fills on this clock, so an ad or a pause freezes
    // it with the picture (and a hold from before the button showed only
    // starts counting once it has).
    if (skipNow && stepHold(skipHold, dt)) {
      cineLive.hold = 1
      this.skip()
      return
    }
    cineLive.hold = holdProgress(skipHold)
    this.emit(dt)
    this.fx.update(dt)
    this.shatter?.update(dt)
    if (this.t >= INTRO_END) this.end(false)
  }

  /** Scripted particles: the flame jet, the charge, the steam, the frost, the beam. */
  private emit(dt: number): void {
    const t = this.t
    const S = STREET_AT
    const st = streetTime(t)
    if (t >= STREET_TIME_AT && t < STREET_DONE) {
      // The street's particles run on the action clock too: in the slow
      // motion they are spawned, fly and die at its rate.
      const rate = Math.max(0.05, streetRate(t))
      if (st > 1.55 && st < 2.3) {
        for (let k = 0; k < 4; k++) {
          if (Math.random() > rate) continue
          this.fx.emit({
            x: S.x - 4.4, y: S.y + 0.9 + (Math.random() - 0.5) * 0.4, z: S.z - 8.2 + (Math.random() - 0.5) * 0.4,
            vx: (9 + Math.random() * 4) * rate, vy: (Math.random() - 0.3) * 1.5 * rate, vz: (Math.random() - 0.5) * 1.5 * rate,
            color: Math.random() < 0.5 ? '#ff7a1f' : '#ffd84a', size: 0.7, sizeEnd: 1.4, life: 0.55 / rate, drag: 1.5 * rate
          })
        }
      }
      if (st > 1.9 && st < 2.6 && Math.random() < dt * 40 * rate) {
        const m = this.charge.position
        const a = Math.random() * Math.PI * 2
        this.fx.emit({ x: S.x + m.x + Math.cos(a) * 0.6, y: S.y + m.y + Math.sin(a) * 0.6, z: S.z + m.z, vx: -Math.cos(a) * 2 * rate, vy: -Math.sin(a) * 2 * rate, color: PAL.heroPlasma, size: 0.08, sizeEnd: 0.02, life: 0.3 / rate })
      }
    }
    this.showcaseBursts(st)
    // The dash: a cyan afterimage streaming off him, dust where it starts and stops.
    if (this.dashOn > 0.3 && t < STREET_DONE) {
      const F = this.runnerRoot.position
      const rate = Math.max(0.05, streetRate(t))
      for (let k = 0; k < 3; k++) {
        this.fx.emit({ x: S.x + F.x + (Math.random() - 0.5) * 0.3, y: S.y + 0.35 + Math.random() * 0.8, z: S.z + F.z + (Math.random() - 0.5) * 0.3, color: k ? PAL.glowCyan : '#e6fbff', size: 0.32, sizeEnd: 0.05, life: 0.22 / rate })
      }
    }
    for (const [a, b] of [DASH_RUN, [SHOW_SLIDE_FROM, SHOW_SLIDE_TO]] as const) {
      for (const at of [a, b]) {
        if (!(this.lastDust < at && st >= at)) continue
        const F = this.runnerRoot.position
        for (let k = 0; k < 10; k++) {
          const ang = Math.random() * Math.PI * 2
          this.fx.emit({ x: S.x + F.x, y: S.y + 0.1, z: S.z + F.z, vx: Math.cos(ang) * 2.2, vy: 0.6 + Math.random(), vz: Math.sin(ang) * 2.2, color: '#b8ad98', size: 0.4, sizeEnd: 0.9, life: 0.5, drag: 2 })
        }
      }
    }
    this.lastDust = st
    if (t > LEVER_AT + 0.05 && t < LEVER_AT + 1.8) {
      // The burst, then the steam thinning out as the glass settles.
      const n = t < LEVER_AT + 0.9 ? 3 : 1
      for (let k = 0; k < n; k++) {
        const a = Math.random() * Math.PI * 2
        this.fx.emit({ x: FLUX_CAP.x + Math.cos(a) * 0.7, y: 0.4, z: FLUX_CAP.z + Math.sin(a) * 0.7, vx: Math.cos(a) * 1.5, vy: 1.5 + Math.random() * 1.5, vz: Math.sin(a) * 1.5, color: '#e8f4ff', size: 0.35, sizeEnd: 0.9, life: 0.9, drag: 1.2 })
      }
    }
    if (t > FROST_FROM && t < FROST_TO + 0.3 && Math.random() < dt * 30) {
      const a = Math.random() * Math.PI * 2
      this.fx.emit({ x: GAUSS_CAP.x + Math.cos(a) * 0.66, y: 0.4 + ramp(FROST_FROM, FROST_TO, t) * 2.2, z: GAUSS_CAP.z + Math.sin(a) * 0.66, vy: 0.3, color: '#dff6ff', size: 0.07, sizeEnd: 0.01, life: 0.5 })
    }
    if (t > BEAM_RISE && Math.random() < dt * 30) {
      const a = Math.random() * Math.PI * 2
      this.fx.emit({ x: Math.cos(a) * 0.8, y: 0.4, z: Math.sin(a) * 0.8, vy: 3 + Math.random() * 2, color: PAL.glowCyan, size: 0.1, sizeEnd: 0.02, life: 0.8 })
    }
  }

  render(alpha: number, dt: number): void {
    this.frameDt = dt
    const t = this.ended || !this.started ? this.t : Math.min(INTRO_END, this.t + alpha * STEP)
    const shot = SHOTS[shotIndexAt(t)]!.id
    // The valley opens it (its set and the cut-in's first); the lab's from
    // its shot on, the street for its own.
    if (this.started) this.needSets(shot === 'valley' ? 2 : shot === 'coldOpen' ? this.jobs.length : this.jobs.length - 1)
    overlayAt(t, cineLive)
    cineLive.t = t
    const cutin = t >= CUTIN_FROM && t < CUTIN_TO
    // Only the live set is drawn (before the first live frame: all of them,
    // for the precompile).
    if (this.started) {
      this.streetSet.visible = shot === 'coldOpen'
      this.valleySet.visible = shot === 'valley' && !cutin
      this.cutinSet.visible = cutin
      this.labSet.visible = shot !== 'coldOpen' && shot !== 'valley'
    }
    const cam = this.camera
    const pos = this.camPos
    const look = this.camLook
    let hfov = 70
    if (shot === 'coldOpen') hfov = this.renderStreet(t, pos, look)
    else if (shot === 'valley') hfov = cutin ? this.renderCutin(t, pos, look) : this.renderValley(t, pos, look)
    else hfov = this.renderLab(t, dt, pos, look)
    this.frame(pos, look, hfov)
    cam.position.copy(pos)
    cam.lookAt(look)
    cam.updateProjectionMatrix()
    this.anchors(shot, cutin)
    // The tutorial builds behind the cutscene, and its GPU warm-up renders
    // into an off-screen target across async slices: draw to the screen
    // regardless, and hand its target back.
    const r = getRenderer()
    const prev = r.getRenderTarget()
    r.setRenderTarget(null)
    r.clear()
    r.render(this.scene, cam)
    r.setRenderTarget(prev)
    tickHud(dt)
  }

  /**
   * Hold a shot's framing in any orientation: the keys give a horizontal
   * field of view; a tall screen gets the vertical one that keeps that width,
   * and past a sane lens the camera backs off along its view instead.
   */
  private frame(pos: Vector3, look: Vector3, hfov: number): void {
    const cam = this.camera
    const aspect = Math.max(0.2, cam.aspect)
    // A tall screen keeps most of the width, not all of it: the shots are
    // staged round their middle, and backing off far enough to keep the
    // edges would shrink the subject to a speck.
    const crop = aspect < 1 ? 0.72 + 0.28 * aspect : 1
    const th = Math.tan((hfov * crop * Math.PI) / 360)
    let v = (2 * Math.atan(th / aspect) * 180) / Math.PI
    const MAX_V = 88
    if (v > MAX_V) {
      const back = th / aspect / Math.tan((MAX_V * Math.PI) / 360)
      _a.copy(pos).sub(look).multiplyScalar(back)
      pos.copy(look).add(_a)
      // Never back down through the floor.
      pos.y = Math.max(pos.y, 0.25)
      v = MAX_V
    }
    cam.fov = Math.max(30, v)
  }

  private light(sky: string, ground: string, hemi: number, key: string, keyI: number, rim: string, rimI: number, fogNear: number, fogFar: number): void {
    this.sky.set(sky)
    this.fog.color.set(sky)
    this.fog.near = fogNear
    this.fog.far = fogFar
    this.hemi.color.set(key)
    this.hemi.groundColor.set(ground)
    this.hemi.intensity = hemi
    this.key.color.set(key)
    this.key.intensity = keyI
    this.rim.color.set(rim)
    this.rim.intensity = rimI
  }

  // ─── 0 · Cold open ─────────────────────────────────────────────────────────

  private renderStreet(t: number, pos: Vector3, look: Vector3): number {
    const st = streetTime(t)
    // Fog in the skyline's haze: the far street melts into the city.
    this.light(STREET_HAZE, '#1a0f2a', 0.85, '#ff7ad8', 0.7, '#3ff4ff', 1.1, 14, 62)
    this.street.animate(st)
    // Flux: runs at the camera, slides under the swing, plants, charges.
    const R = this.runner
    const run = st < 1.1
    let z: number
    if (st < 1.1) z = -16 + 6.8 * st
    else if (st < 1.6) z = -8.52 + (1 - Math.pow(1 - (st - 1.1) / 0.5, 2)) * 4.92
    else z = -3.6
    const turn = ramp(1.6, 1.9, st)
    // The answer shot: he turns and raises the cannon at drone 2, up and to
    // the right (it used to leave straight ahead and bend to the drone).
    const ans = ramp(SHOW_ANSWER - 0.35, SHOW_ANSWER - 0.05, st) * (1 - ramp(SHOW_ANSWER_HIT + 0.2, SHOW_ANSWER_HIT + 0.6, st))
    const ry = Math.PI * turn + ans * (Math.atan2(D1_AT.x, D1_AT.z - z) - Math.PI)
    const m = this.runMotion
    m.walk = run ? 1 : 0.2
    m.phase = st * 12
    m.stride = m.phase
    animateHeroWalk(R, m, st)
    const dash = dashPose(R, st, DASH_RUN[0], DASH_RUN[1])
    this.runnerRoot.position.set(0, -dash.drop, z)
    this.runnerRoot.rotation.set(dash.lean + 0.18 * (run && dash.on === 0 ? 1 : 0), ry, 0)
    this.runnerRoot.scale.set(1, 1 - dash.stretch * 0.5, 1 + dash.stretch)
    this.dashOn = dash.on
    const aim = ramp(1.75, 2.0, st)
    if (aim > 0) {
      pose(R, 'shoulderR', -1.5 * aim - 0.38 * ans, 0, 0.12)
      pose(R, 'elbowR', -0.05, 0, 0)
      pose(R, 'hipL', -0.35 * aim, 0, -0.08)
      pose(R, 'hipR', 0.3 * aim, 0, 0.08)
      pose(R, 'kneeL', 0.35 * aim, 0, 0)
      pose(R, 'chest', 0.05, 0.2 * aim, 0)
    }
    // The charge ring at the muzzle, then the shot a hand's width off the shield.
    this.streetSet.updateMatrixWorld(true)
    const muzzle = _muzzle.copy(R.bones.elbowR!.localToWorld(_a.set(0, -0.34, 0))).sub(this.streetSet.position)
    const charge = st > 1.9 && st < 2.62 ? ramp(1.9, 2.55, st) : 0
    // As the arm cannon charges in play: green through the first level, then
    // the full charge's cyan, flickering.
    this.charge.visible = charge > 0
    this.charge.position.copy(muzzle)
    const full = charge >= 0.55
    const flick = full && Math.floor(t * 30) % 2 ? 0.55 : 1
    this.chargeGlow.color.set(full ? '#7ff4ff' : '#c8ff7a')
    this.chargeGlow.opacity = (0.45 + 0.5 * charge) * flick
    this.chargeCore.color.set(full ? '#e6fbff' : '#eaffb0')
    this.charge.scale.setScalar(0.5 + 1.5 * charge)
    const shield = _b.set(0.55, 0.75, -6.0)
    // From the release to the shield at one speed (its last metre used to crawl).
    const fly = st >= STREET_RELEASE && st < SHOW_HIT ? (st - STREET_RELEASE) / (SHOW_HIT - STREET_RELEASE) : -1
    if (fly >= 0) {
      _d.copy(shield).sub(muzzle).normalize()
      _c.copy(muzzle).lerp(shield, fly)
      this.shot.fly(_c.x, _c.y, _c.z, _d.x, _d.y, _d.z, t)
    } else this.shot.hide()
    // Amber streaks off his visor while he runs.
    this.eyeStreak.visible = st < 1.6
    this.eyeStreak.position.copy(R.bones.head!.getWorldPosition(_a)).sub(this.streetSet.position).add(_d.set(0, 0.02, -0.75))
    this.eyeStreak.rotation.set(Math.PI / 2, 0, 0)
    // Atlas keeps pace above his shoulder.
    const A = this.atlasStreet
    A.root.position.set(this.runnerRoot.position.x + 0.75, 1.75 + Math.sin(st * 3) * 0.08, this.runnerRoot.position.z - 0.7 * Math.cos(ry))
    A.root.rotation.set(0, ry, 0)
    animateAtlas(A, st, this.atlasTalk(t))
    // The Shield Trooper: steps out of the alley, swings, turns to face him.
    const step = ramp(0.85, 1.2, st)
    this.trooperRoot.position.set(3.9 - 3.2 * step, 0, -6.4)
    this.trooperRoot.rotation.y = -Math.PI / 2 + (Math.PI / 2) * ramp(1.45, 1.9, st)
    // The charged shot breaks its guard: the shield comes down and stays down.
    const guard = (0.4 + 0.6 * ramp(1.1, 1.3, st)) * (1 - ramp(SHOW_HIT + 0.25, SHOW_HIT + 0.8, st))
    const tm = this.trooperMotion
    tm.walk = step < 1 && step > 0 ? 1 : 0
    tm.phase = st * 9
    poseTrooper(this.trooper, guard, 0, st, tm.walk, tm)
    // Two Rotor Drones swoop in overhead.
    this.drones.forEach((d, i) => {
      const s = i ? 1 : -1
      const k = ramp(0.25, 1.3, st)
      this.droneRoots[i]!.position.set(s * (2.8 - 0.9 * k) + Math.sin(st * 2 + i) * 0.2, 7 - 3.4 * k + Math.sin(st * 3 + i) * 0.15, 3 - 10.5 * k)
      this.droneRoots[i]!.rotation.y = Math.PI + s * 0.3
      poseHeli(d, st, 0.35 * (1 - k), st * 40)
    })
    this.renderShowcase(st, t, muzzle)
    const hfov = camAt(STREET_CAM, st, pos, look)
    pos.add(STREET_AT)
    look.add(STREET_AT)
    return hfov
  }

  /**
   * The showcase, after the release (ACTION s): the shot lands, a perfect
   * block swats drone 1, the shield takes drone 2's volley, the Trooper's
   * shock ring rolls out and Flux slides under it, then a Repair Gel. Every
   * pose is a function of the action clock.
   */
  private renderShowcase(st: number, t: number, muzzle: Vector3): void {
    const R = this.runner
    const F = this.runnerRoot
    // Flux: the dash under the ring carries him forward; he settles after.
    const fz = -3.6 - 1.4 * ramp(SHOW_SLIDE_FROM, SHOW_SLIDE_TO, st)
    if (st > STREET_RELEASE) {
      const dash = dashPose(R, st, SHOW_SLIDE_FROM, SHOW_SLIDE_TO)
      F.position.set(0, -dash.drop, fz)
      F.rotation.x = dash.lean
      F.scale.set(1, 1 - dash.stretch * 0.5, 1 + dash.stretch)
      this.dashOn = Math.max(this.dashOn, dash.on)
    }
    // The shield: up for the parry and for the volley; a flash on each hit.
    const guard = Math.max(
      ramp(SHOW_GUARD_UP, SHOW_GUARD_UP + 0.1, st) * (1 - ramp(SHOW_GUARD_DOWN - 0.1, SHOW_GUARD_DOWN, st)),
      ramp(SHOW_SHIELD_UP, SHOW_SHIELD_UP + 0.15, st) * (1 - ramp(SHOW_SHIELD_DOWN - 0.15, SHOW_SHIELD_DOWN, st))
    )
    if (guard > 0) {
      pose(R, 'shoulderL', -1.35 * guard, 0, 0.35 * guard)
      pose(R, 'elbowL', -0.5 * guard, 0, 0)
    }
    // The game's own barrier, a hand's width in front of him; its ripple and
    // parry ring are set off on the beats (`showcaseBursts`).
    this.shieldAt.set(F.position.x + 0.05, 1.05, fz - 0.62)
    this.shield.root.position.copy(this.shieldAt)
    this.shield.update(this.frameDt, guard > 0.02, 1, t)
    // The Repair Gel: the flask up in his left hand, then the green burst.
    const gel = ramp(SHOW_GEL, SHOW_GEL + 0.35, st) * (1 - ramp(SHOW_GEL_BURST, SHOW_GEL_BURST + 0.45, st))
    this.flask.visible = st >= SHOW_GEL && st < SHOW_GEL_BURST
    if (gel > 0) {
      pose(R, 'shoulderL', -2.5 * gel, 0, 0.25 * gel)
      pose(R, 'elbowL', -0.9 * gel, 0, 0)
    }
    const heal = st >= SHOW_GEL_BURST ? clamp01((st - SHOW_GEL_BURST) / 0.9) : -1
    this.healRing.visible = heal >= 0 && heal < 1
    if (heal >= 0) {
      this.healRing.position.set(F.position.x, 0.1 + 1.9 * heal, fz)
      this.healRing.rotation.set(Math.PI / 2, 0, 0)
      this.healRing.scale.setScalar(0.8 + 0.5 * heal)
      this.healMat.opacity = 0.85 * (1 - heal)
    }
    // The hero pose after the gel: chin up, the cannon held across.
    const hero = ramp(SHOW_GEL_BURST + 0.3, SHOW_GEL_BURST + 0.9, st)
    if (hero > 0) {
      pose(R, 'shoulderR', -1.5 + 0.9 * hero, 0, 0.12 + 0.5 * hero)
      pose(R, 'elbowR', -0.05 - 0.9 * hero, 0, 0)
      pose(R, 'chest', 0.05, 0.2 - 0.3 * hero, 0)
    }

    // The muzzle where he stands now: the slide carried him forward and the
    // poses above moved the arm (it was a step behind him at the finish).
    this.streetSet.updateMatrixWorld(true)
    muzzle.copy(R.bones.elbowR!.localToWorld(_a.set(0, -0.34, 0))).sub(this.streetSet.position)

    // The Trooper: staggered by the charged shot, the slam, then finished.
    const T = this.trooperRoot
    const back = ramp(SHOW_HIT, SHOW_HIT + 0.4, st)
    const stagger = ramp(SHOW_HIT, SHOW_HIT + 0.15, st) * (1 - ramp(SHOW_HIT + 0.5, SHOW_HIT + 1.3, st))
    const lift = ramp(SHOW_SLAM - 0.5, SHOW_SLAM - 0.15, st) * (1 - ramp(SHOW_SLAM - 0.15, SHOW_SLAM, st))
    const down = ramp(SHOW_SLAM - 0.15, SHOW_SLAM, st) * (1 - ramp(SHOW_SLAM + 0.4, SHOW_SLAM + 0.9, st))
    const fall = ramp(SHOW_FINISH_HIT, SHOW_FINISH_HIT + 0.2, st)
    T.position.z = -6.4 - 0.8 * back
    T.rotation.x = -0.35 * stagger - 0.25 * lift + 0.4 * down - 0.6 * fall
    // The finish takes it apart: its pieces are the shatter's (`showcaseBursts`).
    T.visible = st < SHOW_FINISH_HIT
    // The shock ring: out from the Trooper's feet, over Flux as he slides.
    const ringK = st - SHOW_SLAM
    const reach = Math.abs(T.position.z - (-3.6 - 1.4 * ramp(SHOW_SLIDE_FROM, SHOW_SLIDE_TO, SHOW_RING_OVER)))
    const r = 0.3 + (reach - 0.3) * (ringK / (SHOW_RING_OVER - SHOW_SLAM))
    this.shockRing.visible = ringK >= 0 && ringK < 2.2
    if (this.shockRing.visible) {
      this.shockRing.position.set(T.position.x, 0.8, T.position.z)
      this.shockRing.rotation.set(Math.PI / 2, 0, 0)
      this.shockRing.scale.set(r, r, 1)
      this.shockMat.opacity = 0.9 * (1 - clamp01((ringK - 1.4) / 0.8))
    }

    // Drone 1: dives, the parry swats it; it tumbles into the street.
    const d0 = this.droneRoots[0]!
    const dive = ramp(SHOW_DIVE, SHOW_PARRY, st)
    const knock = st >= SHOW_PARRY ? clamp01((st - SHOW_PARRY) / 1.0) : 0
    if (st >= SHOW_DIVE) {
      _c.set(-1.9, 3.6, -7.5).lerp(_d.set(-0.15, 1.35, fz - 1.1), dive)
      d0.position.set(_c.x - 2.5 * knock, Math.max(0.25, _c.y + 2.2 * knock - 3.6 * knock * knock), _c.z - 3.0 * knock)
      d0.rotation.set(0.8 * dive * (1 - knock), Math.PI - 0.3, knock * 7)
      if (knock > 0) poseHeli(this.drones[0]!, st, 0, knock < 1 ? st * 40 * (1 - knock) : 0)
    } else d0.rotation.set(0, Math.PI - 0.3, 0)
    // Drone 2: up high for its volley, then Flux's answer brings it down.
    const d1 = this.droneRoots[1]!
    const rise = ramp(SHOW_GUARD_DOWN, SHOW_SHIELD_UP, st)
    const drop = st >= SHOW_ANSWER_HIT ? clamp01((st - SHOW_ANSWER_HIT) / 0.8) : 0
    if (st >= SHOW_GUARD_DOWN) {
      _c.set(1.9, 3.6, -7.5).lerp(_d.set(1.4, 3.0, -8.2), rise)
      d1.position.set(_c.x + 0.8 * drop, Math.max(0.25, _c.y * (1 - drop * drop)), _c.z)
      d1.rotation.set(0, Math.PI + 0.3, -drop * 5)
      if (drop > 0) poseHeli(this.drones[1]!, st, 0, drop < 1 ? st * 40 * (1 - drop) : 0)
    } else d1.rotation.set(0, Math.PI + 0.3, 0)
    // Its orbs, each from the drone to the barrier.
    SHOW_VOLLEY.forEach((v, k) => {
      const o = this.orbs[k]!
      const u = (st - v) / SHOW_ORB_FLIGHT
      o.visible = u >= 0 && u < 1
      if (o.visible) o.position.copy(d1.position).lerp(_d.set(0.05, 1.05, fz - 0.62), u)
    })
    // The shot, reused: the answer at drone 2, the point-blank finish.
    const shotAt = (from: number, to: number, target: Vector3, scale: number): boolean => {
      if (st < from || st >= to) return false
      const at = _a.copy(muzzle).lerp(target, (st - from) / (to - from))
      _b.copy(target).sub(muzzle).normalize()
      this.shot.fly(at.x, at.y, at.z, _b.x, _b.y, _b.z, t, scale)
      return true
    }
    if (!shotAt(SHOW_ANSWER, SHOW_ANSWER_HIT, _c.copy(D1_AT), 0.8)) {
      // Point blank, a full charge.
      shotAt(SHOW_FINISH, SHOW_FINISH_HIT, _c.set(T.position.x, 1.1, T.position.z + 0.3), 1)
    }
    // The flash and the tracer of whichever shot is out (or just landed).
    this.flash.visible = false
    this.tracer.visible = false
    for (const [from, to, size] of SHOTS_FIRED) {
      if (st < from || st >= to + TRACER_FADE) continue
      const target = from === STREET_RELEASE ? _c.set(0.55, 0.75, -6.0)
        : from === SHOW_ANSWER ? _c.copy(D1_AT) : _c.set(T.position.x, 1.1, T.position.z + 0.3)
      const k = st - from
      this.flash.visible = k < FLASH_FOR
      if (this.flash.visible) {
        this.flash.position.copy(muzzle)
        this.flash.scale.setScalar(size * (0.5 + 1.4 * (k / FLASH_FOR)))
        this.flashMat.opacity = 1 - k / FLASH_FOR
      }
      const head = _a.copy(muzzle).lerp(target, Math.min(1, k / (to - from)))
      _b.copy(head).sub(muzzle)
      const len = _b.length()
      if (len < 0.05) break
      this.tracer.visible = true
      this.tracer.position.copy(muzzle).addScaledVector(_b, 0.5)
      this.tracer.quaternion.setFromUnitVectors(_up, _b.normalize())
      this.tracer.scale.set(0.035 * size, len, 0.035 * size)
      this.tracerMat.opacity = 0.85 * (st < to ? 1 : 1 - (st - to) / TRACER_FADE)
      break
    }
  }

  /** The showcase's particle bursts, each once as the action clock passes
   *  its beat (never on the rewind). */
  private showcaseBursts(st: number): void {
    const from = this.lastSt
    this.lastSt = st
    if (st <= from || st - from > 1 || !this.street) return
    const S = STREET_AT
    const passed = (at: number): boolean => from < at && st >= at
    const burst = (x: number, y: number, z: number, colors: string[], n: number, speed: number, size = 0.12, life = 0.5): void => {
      for (let k = 0; k < n; k++) {
        const a = Math.random() * Math.PI * 2
        const b = Math.random() * Math.PI - Math.PI / 2
        const v = speed * (0.5 + Math.random() * 0.5)
        this.fx.emit({
          x: S.x + x, y: S.y + y, z: S.z + z,
          vx: Math.cos(a) * Math.cos(b) * v, vy: Math.sin(b) * v + speed * 0.3, vz: Math.sin(a) * Math.cos(b) * v,
          color: colors[k % colors.length]!, size, sizeEnd: size * 0.2, life: life * (0.6 + Math.random() * 0.6), drag: 2
        })
      }
    }
    const T = this.trooperRoot.position
    const n = this.low ? 0.5 : 1
    if (passed(SHOW_HIT)) burst(0.55, 0.9, -6.0, [PAL.heroPlasmaHot, PAL.heroPlasma, '#ffffff'], 26 * n, 6, 0.16)
    const bp = this.shieldAt
    if (passed(SHOW_PARRY)) {
      this.shield.impact('parry')
      burst(bp.x, bp.y, bp.z, ['#fff4a8', '#ffffff', PAL.glowCyan], 30 * n, 7, 0.14)
    }
    for (const v of SHOW_VOLLEY) {
      if (!passed(v + SHOW_ORB_FLIGHT)) continue
      this.shield.impact('block')
      burst(bp.x, bp.y, bp.z, ['#ff6a4a', PAL.glowCyan], 12 * n, 4, 0.1, 0.35)
    }
    const d0 = this.droneRoots[0]!.position
    if (passed(SHOW_PARRY + 0.95)) burst(d0.x, 0.3, d0.z, ['#6a6a78', '#ffb040', '#3a3a44'], 18 * n, 3, 0.25, 0.9)
    const d1 = this.droneRoots[1]!.position
    if (passed(SHOW_ANSWER_HIT)) burst(d1.x, d1.y, d1.z, ['#ffb040', '#ff5a20', '#ffffff'], 30 * n, 6, 0.2, 0.7)
    if (passed(SHOW_SLAM)) burst(T.x, 0.15, T.z + 0.4, ['#ff2a36', '#ffb0a0'], 20 * n, 4, 0.14, 0.5)
    if (passed(SHOW_FINISH_HIT)) {
      burst(T.x, 1.0, T.z, ['#ffb040', '#ffffff'], 20 * n, 6, 0.2, 0.6)
      // It falls apart into its own green parts and plating.
      if (!this.shatter) this.shatter = new Shatter(this.scene, { floorAt: () => S.y })
      const F = this.runnerRoot.position
      this.shatter.burst(this.trooperRoot, [PAL.trooper, PAL.trooperDeep, '#6a6a78'], 8, { x: S.x + F.x, z: S.z + F.z }, 1.2)
    }
    if (passed(SHOW_GEL_BURST)) {
      const F = this.runnerRoot.position
      burst(F.x, 0.9, F.z, ['#5dff8a', '#c8ffd8', '#ffffff'], 36 * n, 3.5, 0.12, 1.0)
    }
  }

  // ─── 1 · The valley and the Red Signal ─────────────────────────────────────

  private renderValley(t: number, pos: Vector3, look: Vector3): number {
    const reach = ringReach(t)
    const flash = t >= SPIRE_FLASH ? 0.5 + 0.5 * Math.sin((t - SPIRE_FLASH) * 30) : 0
    this.light(
      reach > 0.3 ? '#3a1630' : '#2b2350', '#1a1030', 1.0,
      reach > 0.3 ? '#ff9a9a' : '#ffd7a8', 1.0, '#7fd6ff', 0.5, 45, 175
    )
    this.valley.animate(t)
    this.valley.setSignal(reach, t >= SPIRE_FLASH ? Math.max(flash, reach > 0 ? 1 : 0) : 0)
    // Vex's face glitches on over the Spire, and stays, grinning.
    const on = ramp(VEX_ON, VEX_ON + 0.2, t)
    const glitch = t < VEX_ON + 0.35 || Math.sin(t * 17) > 0.93
    this.vexMat.opacity = on * (glitch ? 0.4 + Math.random() * 0.6 : 0.85 + Math.sin(t * 40) * 0.08)
    this.vexHolo.visible = on > 0
    this.vexHolo.scale.set(1 + (glitch ? (Math.random() - 0.5) * 0.3 : 0), Math.max(0.01, on) * (glitch ? 0.8 + Math.random() * 0.3 : 1), 1)
    const hfov = camAt(VALLEY_CAM, t, pos, look)
    pos.add(VALLEY_AT)
    look.add(VALLEY_AT)
    this.vexHolo.lookAt(pos)
    return hfov
  }

  private renderCutin(t: number, pos: Vector3, look: Vector3): number {
    this.light('#1a0604', '#200806', 1.1, '#ffb070', 1.2, '#ff3040', 0.9, 4, 20)
    const k = (t - CUTIN_FROM) / (CUTIN_TO - CUTIN_FROM)
    poseBoss(this.blaze, 'blazeMaster', t, 'idle', 0)
    // Gold eyes flicker, then lock red.
    const red = k > 0.55 || (k > 0.15 && Math.sin(t * 70) > 0)
    this.blaze.glowMaterial.color.set(red ? '#ff2036' : '#ffffff')
    this.cutinSet.updateMatrixWorld(true)
    this.blaze.bones.head!.getWorldPosition(look)
    look.y += 0.08
    pos.copy(look).add(_a.set(0.12, 0.02, 0.95 - 0.15 * k))
    return 42
  }

  // ─── 2–5 · The lab ─────────────────────────────────────────────────────────

  private renderLab(t: number, dt: number, pos: Vector3, look: Vector3): number {
    const fp = t >= WAKE_FROM
    // Red alarm light, closing in panel by panel; calmer once Gauss is frozen.
    const panels = 11 * ramp(LAB_FROM, ALARM_TO, t)
    const calm = ramp(HEART_FROM, HEART_FROM + 2, t)
    const pulse = 0.5 + 0.5 * Math.sin(t * 6)
    this.alarm.forEach((m, k) => {
      m.opacity = (k < panels ? 0.75 : 0) * (1 - 0.65 * calm) * (0.7 + 0.3 * pulse)
    })
    if (calm < 1) {
      this.light('#1c0a14', '#2a0c18', 0.9 + 0.2 * pulse, '#ff6a78', 0.9, '#7fd6ff', 0.45, 16, 44)
    } else {
      this.light('#0e1c3f', '#1a2340', 1.0, '#dbe8ff', 1.0, '#7fd6ff', 0.7, 18, 46)
      this.hemi.color.set('#c8d8ff')
    }
    // Flux asleep in his capsule: eye-lights and reactor down to embers.
    animateHeroIdle(this.sleeper, t * 0.3)
    pose(this.sleeper, 'head', 0.3, 0, 0)
    this.sleeper.glowMaterial.color.setScalar(0.1)
    this.sleeperRoot.visible = !fp
    // His capsule: the lever, the glass sliding down.
    const lever = ramp(LEVER_AT - 0.4, LEVER_AT, t)
    this.fluxCap.setLever(lever)
    this.fluxCap.setOpen(ramp(LEVER_AT + 0.2, LEVER_AT + 1.6, t))
    // (In first person the camera stands inside it: no wash over the view.)
    this.fluxCap.setInner('#ff4050', fp ? 0 : 0.12)
    this.fluxCap.setFrost(0)
    this.fluxCap.setHeart(0)
    // Gauss's capsule: open until she steps in, then sealed and frosting.
    this.gaussCap.setOpen(t < SEAL_AT ? 1 : 1 - ramp(SEAL_AT, SEAL_AT + 0.4, t))
    this.gaussCap.setFrost(ramp(FROST_FROM, FROST_TO, t))
    const hb = heartbeat(t)
    this.gaussCap.setHeart(hb)
    this.gaussCap.setLever(ramp(SEAL_AT - 0.2, SEAL_AT, t))
    this.gaussCap.setInner(t < FROST_FROM ? '#ff4050' : '#5b8cff', t < FROST_FROM ? 0.08 : 0.1 + 0.1 * hb)
    // Gauss: at the console, then turning to Flux (disc, crackle, lever), then
    // across to her own capsule — a few slow steps, bobbing — and into it.
    const gp = this.gp
    const walk = ramp(SAFE_FROM, SAFE_FROM + 1.0, t)
    const from = GAUSS_AT
    const bob = walk > 0 && walk < 1 ? Math.abs(Math.sin(walk * Math.PI * 3)) * 0.03 : 0
    this.gaussRoot.position.set(
      from.x + (GAUSS_CAP.x - from.x) * walk, 0.34 * ramp(SAFE_FROM + 0.75, SAFE_FROM + 1.0, t) + bob, from.z + (GAUSS_CAP.z - from.z) * walk
    )
    this.gaussRoot.rotation.y = 2.1 * (1 - walk)
    gp.disc = t < DISC_TO + 0.2 ? ramp(GAUSS_TURN, DISC_FROM + 0.1, t) : 1 - ramp(DISC_TO + 0.2, DISC_TO + 0.8, t)
    gp.stagger = t > STAGGER_AT && t < SAFE_FROM ? ramp(STAGGER_AT, STAGGER_AT + 0.4, t) * (1 - ramp(STAGGER_AT + 1.0, STAGGER_AT + 1.8, t)) : 0
    gp.look = t < GAUSS_TURN ? -0.2 : t < STAGGER_AT + 0.1 ? 0.4 : t < STAGGER_AT + 0.8 ? -0.7 : 0.3
    gp.lever = t < SAFE_FROM - 0.1 ? ramp(LEVER_AT - 1.0, LEVER_AT, t) : 0
    gp.slap = ramp(SEAL_AT - 0.1, SEAL_AT + 0.1, t) * (1 - ramp(SEAL_AT + 0.4, SEAL_AT + 0.9, t))
    gp.asleep = ramp(FROST_FROM + 0.7, FROST_TO + 0.6, t)
    poseGauss(this.gauss, gp, t)
    setGaussGlow(this.gauss, 1 - gp.asleep, hb)
    this.labSet.updateMatrixWorld(true)
    // The Atlas disc: from her hand into his chest port, where it stays lit.
    this.gauss.bones.elbowL!.getWorldPosition(_a)
    _a.y -= 0.25
    this.sleeper.bones.chest!.getWorldPosition(_b)
    _b.add(_d.set(0, 0.07, 0.19))
    // It slides home in the close-up, and clicks in (`energy`) at DISC_TO − 0.5.
    const into = ramp(DISC_FROM + 0.3, DISC_TO - 0.5, t)
    this.disc.visible = t > GAUSS_TURN - 0.1 && !fp
    this.disc.position.copy(_a).lerp(_b, into)
    this.disc.rotation.set(Math.PI / 2, 0, 0)
    ;(this.disc.material as MeshBasicMaterial).opacity = 0.7 + 0.3 * Math.sin(t * 12)
    // The red crackle: up her arm, then at the frost, where it dies.
    const arm = t > GAUSS_TURN + 0.6 && t < LEVER_AT + 0.2
    this.armCrackle.visible = arm && Math.random() < 0.85
    if (arm) {
      this.gauss.bones.shoulderL!.getWorldPosition(_b)
      const climb = ramp(GAUSS_TURN + 0.6, STAGGER_AT - 0.2, t)
      crackle(this.armCrackle, _a, _c.copy(_a).lerp(_b, climb), 0.09)
    }
    const glass = t > FROST_FROM - 0.05 && t < FROST_TO
    this.glassCrackle.visible = glass && Math.random() < 0.8 * (1 - ramp(FROST_TO - 0.5, FROST_TO, t)) + 0.1
    if (glass) {
      const top = 0.4 + 2.2 * ramp(FROST_FROM, FROST_TO, t)
      _a.set(GAUSS_CAP.x + 0.25, 0.1, GAUSS_CAP.z + 0.75)
      _b.set(GAUSS_CAP.x + 0.1, Math.max(0.5, top - 0.1), GAUSS_CAP.z + 0.68)
      crackle(this.glassCrackle, _a, _b, 0.18)
    }
    // Pip: hiding behind the console, then in Flux's face, then the hologram.
    this.renderPip(t)
    // The hologram of the valley: five sectors red, the Fortress shielded.
    const holoOn = ramp(HOLO_FROM, HOLO_FROM + 0.6, t) * (1 - ramp(HOLO_FOLD_FROM, HOLO_FOLD_TO, t))
    this.holo.root.visible = holoOn > 0.01
    this.holo.root.scale.set(HOLO_SCALE, HOLO_SCALE * holoOn, HOLO_SCALE)
    this.holo.animate(t)
    this.holo.setHolo(t, t >= SCRAP_BLINK ? 1 : 0)
    this.holoBeam.visible = holoOn > 0.01
    if (this.holoBeam.visible) {
      this.pipRoot.getWorldPosition(_a)
      _b.copy(HOLO_AT)
      this.holoBeam.position.copy(_a).lerp(_b, 0.5)
      this.holoBeam.scale.set(holoOn, _a.distanceTo(_b), holoOn)
      this.holoBeam.lookAt(_b)
      this.holoBeam.rotateX(-Math.PI / 2)
    }
    // The pad: its ring spins up, the beam column rises.
    const spin = ramp(STEP_FROM, BEAM_RISE, t)
    this.pad.ring.rotation.y += dt * (0.5 + 12 * spin)
    const beam = ramp(BEAM_RISE, FLASH_FULL, t)
    ;(this.pad.ringMat as MeshBasicMaterial).opacity = 0.12 + 0.6 * beam
    ;(this.beamGlow.material as MeshBasicMaterial).opacity = 0.25 * beam
    this.beamGlow.scale.set(1, Math.max(0.01, beam), 1)
    this.beamGlow.position.y = 0.3 + 2 * beam
    // The camera.
    if (!fp) {
      if (t < SAFE_FROM) {
        if (t >= DISC_FROM && t < DISC_TO) return camAt(DISC_CAM, t, pos, look)
        return camAt(LAB_CAM, t, pos, look)
      }
      return camAt(SAFE_CAM, t, pos, look)
    }
    // First person: his eye, then three steps onto the pad.
    const walkK = ramp(STEP_FROM, STEP_TO, t)
    pos.copy(EYE).lerp(PAD_EYE, walkK)
    pos.y -= Math.abs(Math.sin(walkK * Math.PI * 3)) * 0.03
    // The wake-up: a small dip and rise as the eyes open.
    pos.y += -0.05 * (1 - ramp(37.8 + AFTER, 40.0 + AFTER, t))
    fpLookAt(t, look)
    this.placeAtlasFp(t, pos, look)
    return 82
  }

  /** Atlas is talking (its line has just started; the caption holds on for
   *  `ATLAS_HOLD`). */
  private atlasTalk(t: number): number {
    const age = t - cineLive.atlasAt
    return age >= 0 && age < Math.min(ATLAS_TALK, ATLAS_HOLD) ? 1 : 0
  }

  /**
   * First person: Atlas rises out of Flux's chest disc as the HUD boots and
   * settles in the top left of his view, where it stays with him.
   */
  private placeAtlasFp(t: number, pos: Vector3, look: Vector3): void {
    const A = this.atlasLab
    const on = ramp(GLYPH_ON - 0.3, GLYPH_ON + 0.45, t)
    A.root.visible = on > 0.01
    if (!A.root.visible) return
    const f = _a.copy(look).sub(pos).normalize()
    const r = _b.crossVectors(f, _up).normalize()
    const u = _c.crossVectors(r, f)
    // From his chest (below the view) to the top left of it.
    const k = on * on * (3 - 2 * on)
    A.root.position.copy(pos)
      .addScaledVector(f, 0.55 + 0.45 * k)
      .addScaledVector(r, -0.42 * k)
      .addScaledVector(u, -0.55 + 0.82 * k + Math.sin(t * 1.9) * 0.02)
    A.root.scale.setScalar((0.25 + 0.75 * k) * 0.7)
    A.root.lookAt(pos)
    animateAtlas(A, t, this.atlasTalk(t), k)
  }

  private renderPip(t: number): void {
    const P = this.pipRoot
    animatePip(this.pip, t)
    const pop = ramp(PIP_POP - 0.2, PIP_POP + 0.2, t)
    const back = ramp(LV_POP, HOLO_FROM, t)
    if (t < WAKE_FROM) {
      // Behind the right console, only his eye over the top.
      P.position.set(3.5, 1.2 + Math.sin(t * 3) * 0.03, -2.95)
      P.rotation.y = -0.6
      P.scale.setScalar(1)
    } else if (t < STEP_FROM) {
      // In Flux's face, eye huge, then a happy squint; then back to project.
      fpLookAt(t, _a)
      _b.copy(_a).sub(EYE).normalize()
      const near = _c.copy(EYE).addScaledVector(_b, 0.85).add(_d.set(0.05, -0.1, 0))
      P.position.copy(near).lerp(PIP_PROJECT, back)
      P.position.y += (1 - pop) * -0.8 + Math.sin(t * 2.4) * 0.03
      P.lookAt(EYE)
      const sq = t > PIP_POP + 0.6 && t < PIP_POP + 1.4 ? 0.8 : 1
      const s = 0.3 + 0.7 * pop
      P.scale.set(s, s * sq, s)
      // As the view turns to the pad, he flies ahead to its edge.
      if (t > TURN_FROM) P.position.lerp(PIP_PAD, ramp(TURN_FROM, STEP_FROM, t))
    } else {
      // On the pad's edge, spinning the ring up, his halo spinning with it.
      P.position.copy(PIP_PAD)
      P.position.y += Math.sin(t * 2.4) * 0.04
      P.lookAt(0, 1.4, 0)
      P.scale.setScalar(1)
      pose(this.pip, 'ring', 0, t * (3 + 30 * ramp(STEP_FROM, BEAM_RISE, t)), 0)
    }
    nudge(this.pip, 'body', 0, Math.sin(t * 2.4) * 0.05, 0)
  }

  /** Project the bubble's and the tags' anchors for the layer. */
  private anchors(shot: ShotId, cutin: boolean): void {
    const cam = this.camera
    cam.updateMatrixWorld(true)
    if (shot === 'valley' && !cutin) {
      this.vexHolo.updateMatrixWorld(true)
      _a.set(2.6, 2.0, 0).applyMatrix4(this.vexHolo.matrixWorld).project(cam)
      cineLive.bubbleX = clamp01((_a.x + 1) / 2)
      cineLive.bubbleY = clamp01((1 - _a.y) / 2)
    }
    if (shot === 'wakeUp') {
      this.holo.root.updateMatrixWorld(true)
      const f = this.holo.spireTip
      _a.set(f.x, f.y + 1, f.z).applyMatrix4(this.holo.root.matrixWorld).project(cam)
      cineLive.fortX = (_a.x + 1) / 2
      cineLive.fortY = (1 - _a.y) / 2
      const s = this.holo.scrapyard
      _a.set(s.x, 4, s.z).applyMatrix4(this.holo.root.matrixWorld).project(cam)
      cineLive.scrapX = (_a.x + 1) / 2
      cineLive.scrapY = (1 - _a.y) / 2
    }
  }

  resize(_w: number, h: number): void {
    this.fx.setScale(h * getRenderer().getPixelRatio(), this.camera.fov)
  }

  dispose(): void {
    this.shatter?.dispose()
    if (!this.ended) setSkipHandler(null)
    setGateHandler(null)
    resetCine()
    this.fx.dispose()
    this.scene.traverse((o) => {
      const m = o as Mesh
      if (m.geometry) m.geometry.dispose()
    })
  }
}
