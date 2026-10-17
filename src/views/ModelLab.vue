<template lang="pug">
  div.lab
    div.host(ref="host")
    //- The store thumbnail carries no text, so the bar stays out of its frame
    div.bar(v-if="current !== 'thumb'")
      button(v-for="m in models" :key="m" :class="{ on: m === current }" @click="current = m") {{ m }}
</template>

<script setup lang="ts">
/**
 * DEV-ONLY turntable for every procedural model (route `/models`). Lets the
 * art be iterated on and screenshotted without playing into a mission.
 */
import { onMounted, onUnmounted, ref, watch } from 'vue'
import {
  Scene, PerspectiveCamera, HemisphereLight, DirectionalLight, AmbientLight, Color, Group, GridHelper, Fog, Mesh,
  MeshBasicMaterial, SphereGeometry, Sprite, SpriteMaterial, AdditiveBlending, NormalBlending, PointLight, Quaternion, Vector3,
  type Object3D, type SkinnedMesh, type Texture
} from 'three'
import { getRenderer } from '@/game/engine/renderer'
import { buildHero, animateHeroIdle, animateHeroVictory, buildViewmodel, DEFAULT_HERO_COLORS, type Viewmodel, type HeroColors } from '@/game/models/hero'
import { BASES, BASE_BY_ID } from '@/game/data/items'
import { WEAPONS, WEAPON_IDS, type WeaponId } from '@/game/data/weapons'
import { buildDoor, buildTeleporter, buildCrate, buildBarrel, buildChest, buildBolt, buildCapsule, buildDataCore } from '@/game/models/props'
import { THEMES, type SectorId } from '@/game/world/themes'
import { bakeTextures, glowTexture, ringTexture } from '@/game/world/textures'
import { generateMap } from '@/game/world/levelGen'
import { buildLevel, doorFramePos } from '@/game/world/levelMesh'
import { mulberry32 } from '@/game/world/rng'
import { HubMode } from '@/game/sim/hub'
import { PAL } from '@/game/models/palette'
import { glowVC } from '@/game/models/toon'
import { pose, nudge, type Rig, type V3 } from '@/game/models/kit'
import { buildBossRig, poseBoss, type BossAct, type BossId } from '@/game/models/bosses'
import { buildEnemyRig, poseHardhat, poseTrooper, poseHeli, poseHopper, poseRoller, poseBrute, poseTurret, poseGolem, poseSpotter, SPOTTER_LENS, type EnemyKind } from '@/game/models/enemies'
import { newMotion } from '@/game/models/motion'
import { golemColors, SPOT_R } from '@/game/sim/enemies'
import { makeSearchBeam, aimSearchBeam, type SearchBeam } from '@/game/fx/searchBeam'

const host = ref<HTMLElement | null>(null)
const ENEMIES: EnemyKind[] = ['hardhat', 'trooper', 'heli', 'hopper', 'roller', 'brute', 'turret', 'golem', 'polar', 'mole', 'puffer', 'stalker', 'spotter', 'hornet', 'warden', 'gatekeeper']
const BOSSES: BossId[] = ['scrapper', 'blazeMaster', 'frostMaster', 'voltMaster', 'galeMaster', 'magnetMaster', 'drillMaster', 'tideMaster', 'neonMaster', 'rotorMaster', 'vexMk1']
const models = ['hero', 'hubview', 'turn', 'gear', 'viewmodel', 'fp', 'thumb', 'props', 'enemies', 'bosses', ...ENEMIES, ...BOSSES]
let bossRigs: Array<{ id: BossId; rig: Rig }> = []
let enemyRigs: Array<{ kind: EnemyKind; rig: Rig }> = []
const hashQuery = new URLSearchParams(location.hash.split('?')[1] ?? '')
const current = ref(hashQuery.get('m') ?? 'hero')
/** Fixed turntable angle in degrees (`#/models?m=hero&angle=0`); spins when absent. */
const fixedAngle = hashQuery.has('angle') ? Number(hashQuery.get('angle')) * Math.PI / 180 : null
const zoom = Number(hashQuery.get('zoom') ?? 1)
/**
 * `m=spotter` — the Searchlight Drone over its pool of light, 3 m ahead on
 * the floor; `lock=1` holds the lock's red (0..1, its wind-up), `lamp=0`
 * shows the lamp shot out.
 */
const spotLock = Number(hashQuery.get('lock') ?? 0)
const spotLamp = Number(hashQuery.get('lamp') ?? 1)
let spotBeam: SearchBeam | null = null
/** `pose=victory` holds the results pose; `tint=1` tries a gear recolour. */
const heroPose = hashQuery.get('pose')
/** `still=1` freezes the idle animation (repeatable screenshots). */
const still = hashQuery.get('still') === '1'
/**
 * Flux in gear, composed the way `profile.heroColors()` does it: the
 * starter look (`DEFAULT_HERO_COLORS`), then each item's tint, then a copied
 * weapon's arm colours. `gear=helm_ace,body_reactor,arm_nova,flameWave`.
 */
const gearColors = (ids: string[]): HeroColors => {
  const c: HeroColors = { ...DEFAULT_HERO_COLORS }
  for (const id of ids) {
    const tint = BASE_BY_ID[id]?.tint
    if (tint) Object.assign(c, Object.fromEntries(Object.entries(tint).filter(([, v]) => v)))
    const w = WEAPONS[id as WeaponId]
    if (w) Object.assign(c, { buster: w.shell, core: w.color })
  }
  return c
}
const TINT: HeroColors = gearColors(['helm_ace', 'body_reactor', 'arm_quick'])
const gearParam = hashQuery.get('gear')
const heroTint = gearParam ? gearColors(gearParam.split(',')) : hashQuery.get('tint') === '1' ? TINT : undefined
/**
 * `m=gear`: every tint on the starter look, one row per slot (helmets,
 * chests, arm cannons, copied weapons), then a row of mixed kits.
 * `m=turn`: the default look from the front, three-quarter, side and back.
 */
const GEAR_ROWS: string[][][] = [
  BASES.filter(b => b.slot === 'helmet').map(b => [b.id]),
  BASES.filter(b => b.slot === 'chest').map(b => [b.id]),
  BASES.filter(b => b.slot === 'buster').map(b => [b.id]),
  WEAPON_IDS.map(w => [w]),
  [
    ['helm_royal', 'body_reactor', 'arm_heavy'], ['helm_guard', 'body_aegis', 'arm_quick'],
    ['helm_ace', 'body_plated', 'arm_nova'], ['helm_royal', 'body_light', 'flameWave'],
    ['helm_scout', 'body_reactor', 'iceLance']
  ]
]
/** `bg=hub` lights the bench like the hub (dark lab, cool rim light). */
const hubLight = hashQuery.get('bg') === 'hub'
let heroRigs: Rig[] = []
/**
 * `m=fp` — the in-mission first-person view (viewmodel scene, camera at the
 * origin looking down −Z, arm placed like mission.ts). `block=1` holds the
 * barrier up, `power=0.2` drains it, `impact=block|parry|break` fires that
 * impact every 1.5 s — or once at 1 s, then freezes `hold` seconds later
 * (`&hold=0.1`) so a screenshot catches a given moment.
 */
const fpBlock = hashQuery.get('block') === '1'
const fpPower = Number(hashQuery.get('power') ?? 1)
const fpImpact = hashQuery.get('impact') as 'block' | 'parry' | 'break' | null
const fpHold = hashQuery.has('hold') ? Number(hashQuery.get('hold')) : null
/** `freeze=0.46` stops the bench clock at that time (catch a raise mid-snap). */
const fpFreezeAt = hashQuery.has('freeze') ? Number(hashQuery.get('freeze')) : null
/** `drop=1.2` releases the guard at that time (catch the collapse). */
const fpDropAt = hashQuery.has('drop') ? Number(hashQuery.get('drop')) : null

/**
 * `m=golem` — the crate golem's life on a 9 s loop: asleep (1.2 s), the
 * unfold, idle, a throw (wind-up, release, return), the boulder lob (heave,
 * release), a dodge hop, the brace. Or one held pose:
 * `gpose=dormant|unfold|idle|wound|thrown|heave|hop|brace` (`u=0.4` holds the
 * unfold there). `compare=1` stands the sector's real supply crate beside it
 * (asleep, the two must be indistinguishable); `theme=cryo` picks the sector.
 */
const golemPose = hashQuery.get('gpose')
const golemU = hashQuery.has('u') ? Number(hashQuery.get('u')) : null
const golemCompare = hashQuery.get('compare') === '1'
const labTheme: SectorId = (hashQuery.get('theme') as SectorId | null) ?? 'scrapyard'
const golemMo = newMotion(7, 'golem')
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x))
const poseGolemLab = (r: Rig, t: number): void => {
  const m = golemMo
  const c = golemPose ? -1 : t % 9
  const at = (p: string, a: number, b: number): boolean => golemPose === p || (c >= a && c < b)
  m.walk = 0
  m.calm = 0
  m.armL = 0
  m.grip = 0
  m.boulder = 0
  m.brace = 0
  let u = 1
  let arm = 0
  let lift = 0
  let hop = 0
  if (at('dormant', 0, 1.2)) u = 0
  else if (at('unfold', 1.2, 2.0)) u = golemPose ? golemU ?? clamp01((t % 1.6) / 0.8) : (c - 1.2) / 0.8
  else if (at('wound', 3, 3.5)) {
    m.armL = 1
    arm = golemPose ? -1 : -clamp01((c - 3) / 0.4)
    m.grip = arm < -0.5 ? 1 : 0
  } else if (at('thrown', 3.5, 4.2)) {
    arm = golemPose ? 1 : Math.max(0.01, clamp01((c - 3.5) / 0.1))
    m.armL = golemPose || c < 3.6 ? 1 : clamp01(1 - (c - 3.6) / 0.5)
  } else if (at('heave', 4.5, 5.5)) {
    lift = golemPose ? 1 : clamp01((c - 4.5) / 0.85)
    m.boulder = 1
  } else if (c >= 5.5 && c < 6.2) {
    lift = c < 5.62 ? 1 - (0.65 * (c - 5.5)) / 0.12 : 0.35 * (1 - (c - 5.62) / 0.58)
  } else if (at('hop', 6.5, 6.84)) {
    hop = Math.sin(Math.PI * (golemPose ? 0.5 : (c - 6.5) / 0.34))
  } else if (at('brace', 7, 8.2)) m.brace = 1
  r.root.position.y = hop * 0.45
  poseGolem(r, u, arm, lift, hop, t, m)
}

const scene = new Scene()
scene.background = new Color(hubLight ? '#0e1c3f' : '#8fc8ff')
const camera = new PerspectiveCamera(35, 1, 0.05, 100)
if (hubLight) {
  // The hub's rig (sim/hub.ts): cool sky, white key from the front-right, cyan rim behind.
  scene.add(new HemisphereLight('#dbe8ff', '#1a2340', 1.1))
  const key = new DirectionalLight('#ffffff', 1.25)
  key.position.set(0.6, 1, 0.9)
  const rim = new DirectionalLight('#7fd6ff', 0.7)
  rim.position.set(-1, 0.6, -0.8)
  scene.add(key, rim)
} else {
  scene.add(new HemisphereLight('#e6f3ff', '#6b5f4f', 1.05))
  const sun = new DirectionalLight('#fff4dc', 1.25)
  sun.position.set(0.45, 1, 0.3)
  scene.add(sun)
}
const grid = new GridHelper(10, 20, hubLight ? 0x3a5a9a : 0x335577, hubLight ? 0x26365f : 0x557799)
scene.add(grid)
const stage = new Group()
scene.add(stage)
let rig: Rig | null = null
let raf = 0
const t0 = performance.now()

// First-person bench
const fpScene = new Scene()
fpScene.background = new Color('#1d2740')
const fpCamera = new PerspectiveCamera(50, 1, 0.01, 10)
fpScene.add(new HemisphereLight(0xffffff, 0x445066, 1.2))
const fpSun = new DirectionalLight(0xffffff, 1.1)
fpSun.position.set(-0.4, 1, 0.6)
fpScene.add(fpSun, new AmbientLight(0xffffff, 0.15))
const fpFloor = new GridHelper(12, 24, 0x5b7bb5, 0x3a4f7a)
fpFloor.position.y = -1.3
fpScene.add(fpFloor)
const fpVmRoot = new Group()
const fpBackdrop = new Group()
fpScene.add(fpVmRoot, fpBackdrop)
let fpVm: Viewmodel | null = null
let fpStart = 0
let fpLast = 0
let fpFired = -1
let fpFrozen = false
let fpDownUntil = -1

// ─── Store thumbnail (`m=thumb`) ─────────────────────────────────────────────
//
// Store art (store-art/poki/, store-art/playgama/), rendered from the real
// rig: Flux in his DEFAULT look with a charge building in the arm cannon, on
// a backdrop made by the game's own scene builders. `v=lab` is a low close-up
// on the hub's pad (HubMode's scene), `v=sector` a close-up in a Volt Tower
// room (generateMap + buildLevel, as a mission builds it) with a Rotor Drone
// over his shoulder, `v=full` head to boots on the pad. The Playgama covers:
// `v=land` (16:9) and `v=port` (9:16) fill the frame (no logo goes on them);
// `v=wide` and `v=tall` keep a calm third for the logo lockup. Frame each at
// its aspect: the camera's aspect follows the page. Nothing runs on a clock:
// pose, camera, lights and the spark layout are fixed, so a re-render is the
// same picture. The page renders at the full devicePixelRatio (the play-time
// cap is for frame rate, not for a still); `window.__lab.thumb({...})`
// re-poses and re-frames without a reload, for iterating on a composition.

interface ThumbShot {
  bg: 'lab' | 'sector'
  /** Camera, look-at point (relative to the anchor: the pad's centre on the floor) and vertical FOV in degrees. */
  cam: V3
  look: V3
  fov: number
  /** Flux's feet (relative to the anchor) and facing. */
  at: V3
  yaw: number
  /** Bone → euler offset from the rest pose (radians); the hips drop by `crouch`. */
  pose: Record<string, V3>
  crouch: number
  /** Size of the charge at the muzzle (1 = a full charge) and its light. */
  charge: number
  glow: number
  /** The whole composition turns about the anchor by this (radians): picks the wall behind him. */
  turn: number
  /** A white key light from over the camera (0 = none): keeps the pearl armour pearl under a tinted sector sky. */
  key: number
  /** Machines in the shot. `act` (0..1) is how far into its attack each one is. */
  enemies?: ThumbEnemy[]
  /** A charged shot already fired, this far (m) down the cannon's aim; 0 or absent = none. */
  fired?: number
  /** `false` switches the room's wall light strips off (a logo is laid over that wall). Sector backdrops only. */
  lights?: boolean
  /** Which sector's room (sector backdrops; `theme=` in the address wins, then the Volt Tower). */
  theme?: SectorId
  /** Core Masters in the shot (the cover plates, `tools/art-promotion.mjs`). */
  bosses?: ThumbBoss[]
}
interface ThumbEnemy { kind: EnemyKind; at: V3; yaw: number; act?: number }
/** A boss frozen in `act` (`k` 0..1 into it, at animation time `t`), `scale` times its size. */
interface ThumbBoss { id: BossId; at: V3; yaw: number; scale?: number; act?: BossAct; k?: number; t?: number }

/**
 * Braced, three-quarter to the camera: the cannon raised and out to screen
 * right with the charge on its muzzle, the free fist cocked at the chest
 * (clear of the jaw), the head turned back to look at the viewer.
 */
const THUMB_STANCE: Record<string, V3> = {
  chest: [-0.06, 0.12, 0.05],
  head: [0.04, -0.48, 0.1],
  shoulderR: [-1.85, 0, 0.7],
  elbowR: [-0.3, 0, 0],
  shoulderL: [-0.55, 0, -0.35],
  elbowL: [-1.6, 0, 0],
  hipL: [-0.3, 0, -0.18],
  kneeL: [0.35, 0, 0],
  hipR: [0.3, 0, 0.2],
  kneeR: [0.35, 0, 0]
}
/** The same stance with the feet set wider, for the full-body frame. */
const THUMB_WIDE: Record<string, V3> = {
  ...THUMB_STANCE, head: [0.02, -0.5, 0.1], hipL: [-0.38, 0, -0.26], kneeL: [0.42, 0, 0], hipR: [0.36, 0, 0.26], kneeR: [0.36, 0, 0]
}
const THUMB: Record<string, ThumbShot> = {
  // Low and close on the hub's pad, turned so the consoles stay out of frame
  lab: {
    bg: 'lab', cam: [-0.55, 0.78, 1.85], look: [0.05, 1.2, 0], fov: 42, at: [0, 0.38, 0], yaw: 0.3,
    pose: THUMB_STANCE, crouch: 0.05, charge: 1, glow: 1.2, turn: 0.3, key: 0
  },
  // Off the pad in the start room, a Rotor Drone over his shoulder; placed
  // where no wall pipe runs into the frame edges
  sector: {
    bg: 'sector', cam: [-0.25, 0.72, -1.35], look: [0.3, 1.2, -3.25], fov: 43, at: [0.2, 0, -3.25], yaw: 0.3,
    pose: THUMB_STANCE, crouch: 0.05, charge: 1, glow: 1.2, turn: 1.42, key: 1.05,
    enemies: [{ kind: 'heli', at: [-0.05, 2.75, -5.55], yaw: 0.05 }]
  },
  // Logo layout (16:9): the lockup landscape (covers-logo/), the Wrap hero and
  // the share image. Flux fires a charged shot across the frame at a
  // Guardroid, a Rotor Drone over it; the left third is bare wall for the
  // logo or the site's heading. This wall (turn 4.56) has no pipes on it.
  wide: {
    bg: 'sector', cam: [0.2, 0.9, 1.2], look: [0.15, 1.1, -2.6], fov: 40, at: [-0.15, 0, -2.4], yaw: 1.55,
    pose: {
      chest: [0, 0.15, 0], head: [0.03, -1, 0.06], shoulderR: [-1.5, 0, 0.15], elbowR: [-0.08, 0, 0],
      shoulderL: [-0.55, 0, -0.4], elbowL: [-1.6, 0, 0], hipL: [-0.4, 0, -0.2], kneeL: [0.45, 0, 0], hipR: [0.4, 0, 0.22], kneeR: [0.35, 0, 0]
    },
    crouch: 0.07, charge: 0.5, glow: 1.2, turn: 4.56, key: 1.05, fired: 1.2,
    enemies: [{ kind: 'brute', at: [1.95, 0, -4], yaw: -0.75, act: 0.45 }, { kind: 'heli', at: [1.05, 2.3, -3.9], yaw: -0.5 }]
  },
  // Logo layout (9:16), the lockup portrait (covers-logo/): Flux head to
  // boots in the lower two thirds, charging, the top third bare wall for the logo
  tall: {
    bg: 'sector', cam: [-0.32, 1, 1.15], look: [0.1, 1, -2.6], fov: 40, at: [0, 0, -2.6], yaw: 0.3,
    pose: { ...THUMB_WIDE, shoulderR: [-2.1, 0, 0.6] }, crouch: 0.06, charge: 1, glow: 1.2, turn: 4.56, key: 1.05,
    lights: false
  },
  // Playgama covers WITHOUT a logo (YouTube Playables forbids branding in a
  // thumbnail, and a slot may be forwarded there), so nothing is left calm:
  // `land` (16:9) — Flux left, the shot across the middle into a Guardroid
  // that fills the right third, a Rotor Drone over them;
  land: {
    bg: 'sector', cam: [0.3, 0.85, 0.6], look: [0.55, 1.1, -2.8], fov: 46, at: [-0.6, 0, -2.45], yaw: 1.55,
    pose: {
      chest: [0, 0.15, 0], head: [0.03, -1, 0.06], shoulderR: [-1.6, 0, 0.15], elbowR: [-0.08, 0, 0],
      shoulderL: [-0.55, 0, -0.4], elbowL: [-1.6, 0, 0], hipL: [-0.4, 0, -0.2], kneeL: [0.45, 0, 0], hipR: [0.4, 0, 0.22], kneeR: [0.35, 0, 0]
    },
    crouch: 0.07, charge: 0.5, glow: 1.2, turn: 4.56, key: 1.05, fired: 1.2,
    enemies: [{ kind: 'brute', at: [2.15, 0, -3.3], yaw: -0.75, act: 0.35 }, { kind: 'heli', at: [0.7, 2.3, -3.7], yaw: -0.45 }]
  },
  // `port` (9:16) — Flux head to boots fires up at a Rotor Drone in the top third
  port: {
    bg: 'sector', cam: [-0.3, 0.95, 0.9], look: [0.15, 1.3, -2.6], fov: 46, at: [0, 0, -2.6], yaw: 0.35,
    pose: { ...THUMB_WIDE, chest: [-0.12, 0.1, 0.05], head: [-0.12, -0.3, 0.08], shoulderR: [-2.55, 0, 0.35] },
    crouch: 0.06, charge: 0.5, glow: 1.2, turn: 4.56, key: 1.05, fired: 0.9, lights: false,
    enemies: [{ kind: 'heli', at: [0.55, 2.75, -3.9], yaw: -0.15 }]
  },
  // ── The cover scenarios (#120): plates for `pnpm art:promotion --scenario <id>`,
  // framed at 16:9 here; the tool re-frames each per aspect (`__lab.thumb`).
  // The staging room is four cells square: a Master stands within 4.5 m. ──
  // `frost`: the duel. Flux left, in profile, his charged shot in flight at
  // the Frost Master on the right: amber against ice blue.
  frost: {
    bg: 'sector', theme: 'cryo', cam: [0.15, 0.95, 0.6], look: [0.15, 1.2, -2.7], fov: 46, at: [-1.35, 0, -2.6], yaw: 1.55,
    pose: {
      chest: [0, 0.15, 0], head: [0.03, -0.55, 0.06], shoulderR: [-1.6, 0, 0.15], elbowR: [-0.08, 0, 0], shoulderL: [-0.55, 0, -0.4],
      elbowL: [-1.6, 0, 0], hipL: [-0.4, 0, -0.2], kneeL: [0.45, 0, 0], hipR: [0.4, 0, 0.22], kneeR: [0.35, 0, 0]
    },
    crouch: 0.07, charge: 0.6, glow: 1.4, turn: 4.56, key: 1.0, fired: 1.15, lights: false,
    bosses: [{ id: 'frostMaster', at: [1.75, 0, -3.0], yaw: -1.2, scale: 1.7, act: 'attack', k: 0.6 }]
  },
  // `neon`: the face. Flux's helmet and the charging muzzle fill the frame,
  // the cannon pointed past the lens; the Neon Master looms behind him.
  neon: {
    bg: 'sector', theme: 'neon', cam: [0.15, 1.12, -1.25], look: [-0.05, 1.18, -2.6], fov: 40, at: [-0.2, 0, -2.6], yaw: 0.45,
    pose: { ...THUMB_STANCE, head: [0.06, -0.35, 0.08], shoulderR: [-1.55, 0, 0.55], elbowR: [-0.15, 0, 0] },
    crouch: 0.05, charge: 1.2, glow: 1.6, turn: 4.56, key: 1.0, lights: false,
    bosses: [{ id: 'neonMaster', at: [-1.75, 0, -4.5], yaw: 0.5, scale: 1.7, act: 'tele', k: 0.6 }]
  },
  // `blaze`: the charge. Flux leaps at the lens, cannon first, eyes on the
  // viewer; the Blaze Master and its fire behind him: white on warm orange.
  blaze: {
    bg: 'sector', theme: 'blaze', cam: [0.1, 0.8, 0.5], look: [0.2, 1.35, -3.0], fov: 50, at: [-0.45, 0.42, -1.7], yaw: 0.25,
    pose: {
      chest: [0.25, 0.15, 0], head: [-0.22, -0.2, 0.05], shoulderR: [-1.75, 0, 0.5], elbowR: [-0.1, 0, 0], shoulderL: [0.6, 0, -0.5],
      elbowL: [-1.2, 0, 0], hipL: [-1.0, 0, -0.15], kneeL: [1.3, 0, 0], hipR: [0.5, 0, 0.15], kneeR: [0.9, 0, 0]
    },
    crouch: 0, charge: 1.1, glow: 1.4, turn: 4.56, key: 1.0, lights: false,
    bosses: [{ id: 'blazeMaster', at: [1.7, 0, -4.2], yaw: -0.45, scale: 2.0, act: 'attack', k: 0.6 }]
  },
  // `vex`: the villain. Dr. Vex Mk-I hangs over the right of the frame,
  // leaning in; Flux small and defiant below, his charged shot on its way up.
  vex: {
    bg: 'sector', theme: 'fortress', cam: [-0.5, 0.55, 0.7], look: [0.35, 1.7, -3.0], fov: 56, at: [-1.25, 0, -2.2], yaw: 1.75,
    pose: {
      chest: [-0.12, 0.2, 0], head: [-0.25, -0.5, 0], shoulderR: [-2.25, 0, 0.2], elbowR: [-0.1, 0, 0], shoulderL: [-0.55, 0, -0.4],
      elbowL: [-1.6, 0, 0], hipL: [-0.4, 0, -0.22], kneeL: [0.45, 0, 0], hipR: [0.4, 0, 0.24], kneeR: [0.35, 0, 0]
    },
    crouch: 0.08, charge: 0.6, glow: 1.3, turn: 4.56, key: 1.0, fired: 1.1, lights: false,
    bosses: [{ id: 'vexMk1', at: [1.3, 1.5, -3.9], yaw: -0.7, scale: 1.7, act: 'tele', k: 0.8 }]
  },
  // ── #176: four more scenarios, built on what won #120 (one face, a charge,
  // one big Master behind). ──
  // `volt`: the storm. Flux close and low, cannon charging up at the Volt
  // Master hanging in the lightning above him: amber against electric violet.
  volt: {
    bg: 'sector', theme: 'volt', cam: [0.1, 0.7, -0.9], look: [0.1, 1.55, -2.8], fov: 46, at: [-0.35, 0, -2.5], yaw: 0.4,
    pose: { ...THUMB_STANCE, head: [-0.2, -0.4, 0.06], shoulderR: [-2.3, 0, 0.45], elbowR: [-0.1, 0, 0] },
    crouch: 0.08, charge: 1.2, glow: 1.6, turn: 4.56, key: 1.0, lights: false,
    bosses: [{ id: 'voltMaster', at: [1.2, 0.9, -4.6], yaw: -0.5, scale: 2.0, act: 'attack', k: 0.6 }]
  },
  // `magnet`: the pull. Flux braced, dragged toward the Magnet Master, firing
  // back point-blank: red and blue poles meeting at the amber charge.
  magnet: {
    bg: 'sector', theme: 'magnet', cam: [0.2, 0.85, 0.3], look: [0.35, 1.25, -2.9], fov: 48, at: [-0.85, 0, -2.3], yaw: 1.2,
    pose: { ...THUMB_WIDE, chest: [0.1, 0.25, 0.05], head: [0.0, -0.55, 0.06], shoulderR: [-1.6, 0, 0.3], elbowR: [-0.05, 0, 0] },
    crouch: 0.1, charge: 1.2, glow: 1.5, turn: 4.56, key: 1.0, lights: false,
    bosses: [{ id: 'magnetMaster', at: [1.4, 0, -3.6], yaw: -0.9, scale: 1.8, act: 'tele', k: 0.7 }]
  },
  // `drill`: the eruption. The Drill Master bursts up out of the mine floor
  // behind Flux, who spins round mid-jump, cannon charged.
  drill: {
    bg: 'sector', theme: 'drill', cam: [0.0, 0.6, 0.4], look: [0.2, 1.4, -3.0], fov: 52, at: [-0.5, 0.35, -1.9], yaw: 0.5,
    pose: {
      chest: [0.2, 0.15, 0], head: [-0.2, -0.3, 0.05], shoulderR: [-1.9, 0, 0.5], elbowR: [-0.1, 0, 0], shoulderL: [0.5, 0, -0.5],
      elbowL: [-1.2, 0, 0], hipL: [-0.9, 0, -0.15], kneeL: [1.2, 0, 0], hipR: [0.4, 0, 0.15], kneeR: [0.8, 0, 0]
    },
    crouch: 0, charge: 1.1, glow: 1.4, turn: 4.56, key: 1.0, lights: false,
    bosses: [{ id: 'drillMaster', at: [1.5, 0.3, -4.1], yaw: -0.5, scale: 2.0, act: 'attack', k: 0.6 }]
  },
  // `rotor`: the swarm. Flux back to the viewer's left, looking out, the
  // Rotor Master and its drones diving from the night sky.
  rotor: {
    bg: 'sector', theme: 'rotor', cam: [0.15, 0.8, -0.6], look: [0.2, 1.6, -2.8], fov: 48, at: [-0.45, 0, -2.4], yaw: 0.5,
    pose: { ...THUMB_STANCE, head: [-0.15, -0.45, 0.06], shoulderR: [-2.4, 0, 0.4], elbowR: [-0.1, 0, 0] },
    crouch: 0.07, charge: 1.1, glow: 1.5, turn: 4.56, key: 1.0, lights: false,
    bosses: [{ id: 'rotorMaster', at: [1.3, 1.4, -4.3], yaw: -0.6, scale: 1.9, act: 'attack', k: 0.6 }]
  },
  // Head to boots on the hub's pad
  full: {
    bg: 'lab', cam: [-0.6, 0.72, 2.9], look: [0.08, 1.08, 0], fov: 36, at: [0, 0.38, 0], yaw: 0.3,
    pose: THUMB_WIDE, crouch: 0.06, charge: 1, glow: 1.2, turn: 0.3, key: 0
  }
}
const thumbBase: ThumbShot = THUMB[hashQuery.get('v') ?? 'lab'] ?? THUMB.lab!
/** `v=sector` only: which sector's room (`theme=scrapyard`…); the Volt Tower by default. */
const thumbTheme: SectorId = (hashQuery.get('theme') as SectorId | null) ?? 'volt'
let thumbScene: Scene | null = null
let thumbReady = false
let thumbHero: Rig | null = null
let thumbEnemies: Rig[] = []
let thumbBosses: Rig[] = []
let thumbSky: Object3D | null = null
const thumbAnchor = new Vector3()
const thumbCharge = new Group()
const thumbLight = new PointLight(new Color(PAL.heroPlasma), 2, 2.4, 2)
const thumbKey = new DirectionalLight(new Color('#ffffff'), 0)
/** A charged shot in flight (`fired`): a hot core and a fading trail back to the muzzle. */
const thumbFired = new Group()

/** One glow sprite. Additive by default; the outer blooms are painted instead
 *  (added onto a purple sector sky, amber turns pink; laid over it, it stays
 *  amber on any backdrop). */
const glowSprite = (to: Group, map: Texture, hex: string, scale: number, opacity: number, additive = true): Sprite => {
  const s = new Sprite(new SpriteMaterial({
    map, color: new Color(hex), transparent: true, opacity, blending: additive ? AdditiveBlending : NormalBlending,
    depthWrite: false, toneMapped: false, fog: false
  }))
  s.scale.setScalar(scale)
  to.add(s)
  return s
}
const hotCore = (r: number): Mesh =>
  new Mesh(new SphereGeometry(r, 16, 12), new MeshBasicMaterial({ color: new Color(PAL.heroPlasmaHot), toneMapped: false }))

/** The charge at the muzzle: a white-hot core in an amber halo, a gathering ring, sparks drawn in. */
const buildCharge = (): void => {
  thumbCharge.clear()
  glowSprite(thumbCharge, glowTexture(), '#ff9a2e', 1.25, 0.5, false)
  glowSprite(thumbCharge, glowTexture(), PAL.heroPlasma, 0.62, 0.95)
  glowSprite(thumbCharge, ringTexture(), '#ffc266', 0.44, 0.85)
  glowSprite(thumbCharge, glowTexture(), PAL.heroPlasmaHot, 0.3, 1)
  thumbCharge.add(hotCore(0.05))
  // A fixed, seeded spark layout: the same picture on every render
  const rng = mulberry32(0xc0ba17)
  for (let i = 0; i < 16; i++) {
    const u = rng() * 2 - 1
    const a = rng() * Math.PI * 2
    const r = 0.2 + rng() * 0.28
    const s = Math.sqrt(1 - u * u)
    const sp = glowSprite(thumbCharge, glowTexture(), i % 3 ? '#ffd08a' : PAL.heroPlasmaHot, 0.03 + rng() * 0.05, 0.9)
    sp.position.set(Math.cos(a) * s * r, u * r, Math.sin(a) * s * r)
  }
}

/** The shot in flight: core, halo and bloom, then a trail of shrinking glows laid back along the cannon's aim. */
const SHOT_TRAIL = 12
let thumbTrail: Sprite[] = []
const buildFiredShot = (): void => {
  thumbFired.clear()
  glowSprite(thumbFired, glowTexture(), '#ff9a2e', 1.0, 0.45, false)
  glowSprite(thumbFired, glowTexture(), PAL.heroPlasma, 0.55, 1)
  glowSprite(thumbFired, glowTexture(), PAL.heroPlasmaHot, 0.26, 1)
  thumbFired.add(hotCore(0.075))
  thumbTrail = Array.from({ length: SHOT_TRAIL }, (_, i) => {
    const k = (i + 1) / SHOT_TRAIL
    return glowSprite(thumbFired, glowTexture(), k < 0.3 ? PAL.heroPlasmaHot : PAL.heroPlasma, 0.34 * (1 - k) + 0.05, 0.85 * (1 - k) + 0.1)
  })
}

const Y_AXIS = new Vector3(0, 1, 0)
/** A composition point (anchor-relative, turned by `turn`) in world space. */
const thumbAt = (v: V3, turn: number): Vector3 => new Vector3(v[0], v[1], v[2]).applyAxisAngle(Y_AXIS, turn).add(thumbAnchor)

/** A machine frozen mid-attack: `act` 0 is its idle stance, 1 the height of the attack. */
const poseThumbEnemy = (r: Rig, e: ThumbEnemy): void => {
  const k = e.act ?? 0
  if (e.kind === 'heli') poseHeli(r, 0.6, 0.12 + 0.25 * k, 0.5)
  else if (e.kind === 'brute') poseBrute(r, 0, 0, 1, 0, k)
  else if (e.kind === 'hopper') poseHopper(r, 1 - 2 * k, 0)
  else if (e.kind === 'trooper') poseTrooper(r, 1 - k, k, 0, 0)
  else if (e.kind === 'turret') poseTurret(r, 0.25 * k, 0)
}

/** Pose Flux, frame him, put the charge on the muzzle (no rebuild of the backdrop). */
const applyThumb = (shot: ThumbShot): void => {
  const hero = thumbHero
  if (!hero || !thumbScene) return
  for (const name of Object.keys(hero.bones)) pose(hero, name)
  for (const [name, [x, y, z]] of Object.entries(shot.pose)) pose(hero, name, x, y, z)
  nudge(hero, 'hips', 0, -shot.crouch, 0)
  hero.root.position.copy(thumbAt(shot.at, shot.turn))
  hero.root.rotation.y = shot.yaw + shot.turn
  hero.root.updateMatrixWorld(true)
  // The muzzle opens toward −Y in the forearm's (elbowR) space; the core sits just outside it
  const muzzle = hero.bones.elbowR!.localToWorld(new Vector3(0, -0.36, 0))
  thumbCharge.position.copy(muzzle)
  thumbCharge.scale.setScalar(shot.charge)
  thumbLight.position.copy(muzzle)
  thumbLight.intensity = shot.glow
  // The shot in flight rides the cannon's axis (−Y of the forearm), its trail laid back toward the muzzle
  const aim = new Vector3(0, -1, 0).applyQuaternion(hero.bones.elbowR!.getWorldQuaternion(new Quaternion()))
  thumbFired.visible = (shot.fired ?? 0) > 0
  thumbFired.position.copy(muzzle).addScaledVector(aim, shot.fired ?? 0)
  thumbTrail.forEach((s, i) => s.position.copy(aim).multiplyScalar(-((i + 1) / SHOT_TRAIL) * Math.min(1.2, (shot.fired ?? 0) * 0.8)))
  shot.enemies?.forEach((e, i) => {
    const r = thumbEnemies[i]
    if (!r) return
    r.root.position.copy(thumbAt(e.at, shot.turn))
    r.root.rotation.y = e.yaw + shot.turn
    poseThumbEnemy(r, e)
  })
  shot.bosses?.forEach((b, i) => {
    const r = thumbBosses[i]
    if (!r) return
    r.root.position.copy(thumbAt(b.at, shot.turn))
    r.root.rotation.y = b.yaw + shot.turn
    r.root.scale.setScalar(b.scale ?? 1)
    poseBoss(r, b.id, b.t ?? 0.4, b.act ?? 'idle', b.k ?? 0)
  })
  camera.fov = shot.fov
  camera.position.copy(thumbAt(shot.cam, shot.turn))
  camera.lookAt(thumbAt(shot.look, shot.turn))
  camera.updateProjectionMatrix()
  thumbSky?.position.copy(camera.position)
  thumbKey.intensity = shot.key
  thumbKey.position.copy(camera.position).add(new Vector3(0, 1.5, 0))
  thumbKey.target.position.copy(hero.root.position)
}

/**
 * The thumbnail's pixels straight off the WebGL canvas, rendered and read in
 * one task (the drawing buffer is still intact then): no page screenshot, so
 * no DOM overlay (the boot loader, a debug meter) can land in the picture.
 * Full devicePixelRatio: 628 CSS px at deviceScaleFactor 4 is 2512 px.
 */
const thumbPng = (): string => {
  const r = getRenderer()
  const el = host.value!
  r.setPixelRatio(window.devicePixelRatio)
  r.setSize(el.clientWidth, el.clientHeight, false)
  camera.aspect = el.clientWidth / el.clientHeight
  camera.updateProjectionMatrix()
  r.clear()
  if (thumbScene) r.render(thumbScene, camera)
  return r.domElement.toDataURL('image/png')
}

const buildThumb = async (shot: ThumbShot): Promise<void> => {
  thumbReady = false
  let sc: Scene
  if (shot.bg === 'lab') {
    // The hub exactly as the game builds it; its own Flux and Pip step
    // aside, and so do the additive light columns over the pad (seen from
    // this close they are a cyan haze across him, not a beam)
    sc = new HubMode().scene
    sc.traverse((o) => {
      if ((o as SkinnedMesh).isSkinnedMesh && o.parent) o.parent.visible = false
      const m = (o as Mesh).material
      if (m instanceof MeshBasicMaterial && m.blending === AdditiveBlending) o.visible = false
    })
    thumbAnchor.set(0, 0, 0)
  } else {
    // A Volt Tower room, built the way a mission builds it (mission.ts)
    const th = THEMES[(hashQuery.get('theme') as SectorId | null) ?? shot.theme ?? thumbTheme] ?? THEMES.volt
    const map = generateMap({ seed: 20260926, rooms: 5, boss: false })
    const level = await buildLevel(map, th)
    // The level's glow meshes (wall strips, lamps) share one material
    if (shot.lights === false) level.root.traverse((o) => { if ((o as Mesh).material === glowVC()) o.visible = false })
    sc = new Scene()
    sc.add(level.root, level.sky)
    thumbSky = level.sky
    sc.background = new Color(th.skyBottom)
    sc.fog = new Fog(new Color(th.fog), th.fogNear, th.fogFar)
    const sun = new DirectionalLight(new Color(th.sun), th.sunIntensity)
    sun.position.set(0.45, 1, 0.3)
    sc.add(new HemisphereLight(new Color(th.hemiSky), new Color(th.hemiGround), 1.05), sun)
    for (const d of map.doors) {
      const door = buildDoor(th, d.boss)
      const [fx, fz] = doorFramePos(d)
      door.root.position.set(fx, 0, fz)
      door.root.rotation.y = d.axis === 'x' ? Math.PI / 2 : 0
      sc.add(door.root)
    }
    // Anchored on the start cell; its pad is left out (a floor fixture that
    // only crowded the foreground of the wide shots)
    thumbAnchor.set(map.start.x, 0, map.start.z)
  }
  thumbHero = buildHero()
  buildCharge()
  buildFiredShot()
  sc.add(thumbHero.root, thumbCharge, thumbFired, thumbLight, thumbKey, thumbKey.target)
  thumbEnemies = (shot.enemies ?? []).map((e) => {
    const r = buildEnemyRig(e.kind)
    sc.add(r.root)
    return r
  })
  thumbBosses = (shot.bosses ?? []).map((b) => {
    const r = buildBossRig(b.id)
    sc.add(r.root)
    return r
  })
  thumbScene = sc
  applyThumb(shot)
  thumbReady = true
}

const show = (name: string) => {
  stage.clear()
  rig = null
  enemyRigs = []
  bossRigs = []
  heroRigs = []
  camera.fov = 35
  camera.updateProjectionMatrix()
  const th = THEMES.scrapyard
  if (name === 'thumb') {
    void buildThumb(thumbBase)
  } else if (name === 'hero') {
    rig = buildHero(heroTint)
    stage.add(rig.root)
    camera.position.set(0, 1.0, 4.2 / zoom)
    camera.lookAt(0, zoom > 1.5 ? 1.15 : 0.78, 0)
  } else if (name === 'hubview') {
    // Flux where the hub stands him (sim/hub.ts), seen through its camera:
    // landscape by default, `portrait=1` for the phone framing.
    rig = buildHero(heroTint)
    rig.root.position.set(0, 0.38, 0)
    rig.root.rotation.y = 0.25
    stage.add(rig.root)
    if (hashQuery.get('portrait') === '1') {
      camera.fov = 46
      camera.position.set(0, 1.2, 7.2)
      camera.lookAt(0, -0.95, 0)
    } else {
      camera.fov = 38
      camera.position.set(-1.6, 1.5, 5.6)
      camera.lookAt(-1.7, 1.0, 0)
    }
    camera.updateProjectionMatrix()
  } else if (name === 'turn') {
    // Front, three-quarter, side, back — one frame for a turnaround sheet.
    ;[0, 35, 90, 180].forEach((deg, i) => {
      const r = buildHero(heroTint)
      r.root.position.x = (i - 1.5) * 1.3
      r.root.rotation.y = (deg * Math.PI) / 180
      stage.add(r.root)
      heroRigs.push(r)
    })
    camera.position.set(0, 0.95, 4.4 / zoom)
    camera.lookAt(0, 0.76, 0)
  } else if (name === 'gear') {
    const only = hashQuery.has('row') ? Number(hashQuery.get('row')) : null
    const rows = GEAR_ROWS.filter((_r, i) => only === null || i === only)
    rows.forEach((row, ri) => {
      row.forEach((ids, i) => {
        const r = buildHero(gearColors(ids))
        r.root.position.set((i - (row.length - 1) / 2) * 1.05, (rows.length - 1 - ri) * 1.8, 0)
        r.root.rotation.y = fixedAngle ?? 0.35
        stage.add(r.root)
        heroRigs.push(r)
      })
    })
    const midY = ((rows.length - 1) * 1.8) / 2 + 0.76
    const span = Math.max(rows.length * 1.8, 2.2)
    camera.position.set(0, midY + 0.3, (span / (2 * Math.tan((17.5 * Math.PI) / 180))) * 1.05)
    camera.lookAt(0, midY, 0)
  } else if (name === 'fp') {
    fpVmRoot.clear()
    fpBackdrop.clear()
    fpVm = buildViewmodel(heroTint)
    fpVmRoot.add(fpVm.root)
    // A couple of enemies downrange, to judge how readable the view stays
    for (const [kind, x, z] of [['hardhat', -0.7, -3.4], ['trooper', 0.9, -4.6]] as const) {
      const r = buildEnemyRig(kind)
      r.root.position.set(x, -1.3, z)
      r.root.rotation.y = -x * 0.4
      fpBackdrop.add(r.root)
      enemyRigs.push({ kind, rig: r })
    }
    fpStart = performance.now() / 1000
    fpLast = fpStart
    fpVT = 0
    fpFired = -1
    fpFrozen = false
    fpDownUntil = -1
  } else if (name === 'viewmodel') {
    const vm = buildViewmodel(heroTint)
    vm.root.scale.setScalar(3)
    vm.root.position.y = 1
    stage.add(vm.root)
    camera.position.set(0, 1.9, 4.6)
    camera.lookAt(0, 1, 0)
  } else if (name === 'bosses' || (BOSSES as string[]).includes(name)) {
    const ids = name === 'bosses' ? BOSSES : [name as BossId]
    ids.forEach((id, i) => {
      const r = buildBossRig(id)
      const sc = id === 'scrapper' || id === 'vexMk1' ? 1 : 1.35
      r.root.scale.setScalar(sc)
      r.root.position.set((i - (ids.length - 1) / 2) * 2.6, id === 'vexMk1' ? 1.6 : 0, 0)
      stage.add(r.root)
      bossRigs.push({ id, rig: r })
    })
    camera.position.set(0, 2.2, ids.length > 1 ? 12 : 5.5)
    camera.lookAt(0, 1.2, 0)
  } else if (name === 'enemies' || (ENEMIES as string[]).includes(name)) {
    const kinds = name === 'enemies' ? ENEMIES : [name as EnemyKind]
    kinds.forEach((kind, i) => {
      const r = buildEnemyRig(kind, kind === 'golem' ? golemColors(THEMES[labTheme]) : undefined)
      r.root.position.set((i - (kinds.length - 1) / 2) * 2.1, kind === 'heli' ? 1.6 : kind === 'spotter' ? 2.4 : 0, 0)
      stage.add(r.root)
      enemyRigs.push({ kind, rig: r })
    })
    spotBeam = null
    if (name === 'spotter') {
      // Its beam, from the lamp down to a pool 3 m ahead on the floor
      spotBeam = makeSearchBeam()
      enemyRigs[0]!.rig.root.add(spotBeam.root)
      aimSearchBeam(spotBeam, 0, SPOTTER_LENS.y, SPOTTER_LENS.z, 0, -2.4, 3, SPOT_R, spotLock, spotLamp, 0)
      camera.position.set(3.4, 2.9, 3.9)
      camera.lookAt(0, 1.7, 1.1)
      return
    }
    if (name === 'golem' && golemCompare) {
      // The real crate beside it, as MissionObjects builds it
      enemyRigs[0]!.rig.root.position.x = -0.85
      const crate = buildCrate(THEMES[labTheme]).root
      crate.position.x = 0.85
      stage.add(crate)
    }
    if (name === 'golem') {
      // Room for the open lid, the arms overhead and the boulder over them
      camera.position.set(0, 1.5, (golemCompare ? 7.4 : 6.6) / zoom)
      camera.lookAt(0, 1.05, 0)
      return
    }
    if (kinds.length > 1) {
      camera.position.set(0, 2.4, 11)
      camera.lookAt(0, 1.0, 0)
    } else {
      const h = enemyRigs[0]!.rig.height
      camera.position.set(0, h * 0.75 + 0.4, h * 2.2 + 1.2)
      camera.lookAt(0, h * 0.5, 0)
    }
  } else {
    const items: Object3D[] = [
      buildDoor(th, false).root, buildDoor(th, true).root, buildTeleporter(th).root, buildCrate(th).root,
      buildBarrel(th).root, buildChest(th, 'prototype').root, buildBolt().root, buildCapsule('hp', true).root,
      buildCapsule('we', false).root, buildDataCore().root
    ]
    items.forEach((o, i) => {
      o.position.set((i % 5) * 3.4 - 6.8, i === 6 || i > 6 ? 0.5 : 0, Math.floor(i / 5) * 4 - 2)
      stage.add(o)
    })
    camera.position.set(0, 7, 13)
    camera.lookAt(0, 0.8, 0)
  }
}

/** One frame of the first-person bench: arm placed exactly like mission.ts.
 *  Runs on a fixed 60 Hz virtual clock (catching up to the wall clock) so a
 *  `hold` freeze lands on the same moment however slow the machine is. */
const FP_STEP = 1 / 60
let fpVT = 0
const fpFrame = () => {
  const vm = fpVm
  if (!vm) return
  const now = performance.now() / 1000
  const target = now - fpStart
  const portrait = fpCamera.aspect < 1
  let steps = 0
  while (!fpFrozen && fpVT + FP_STEP <= target && steps++ < 30) {
    fpVT += FP_STEP
    const t = fpVT
    if (fpImpact) {
      const period = 1.5
      const due = fpHold === null ? Math.floor((t - 1) / period) : t >= 1 ? 0 : -1
      if (due > fpFired) {
        fpFired = due
        vm.barrier.impact(fpImpact)
        if (fpImpact === 'break') fpDownUntil = t + (fpHold === null ? 0.8 : 99)
      }
    }
    const up = fpBlock && t > 0.4 && t > fpDownUntil && (fpDropAt === null || t < fpDropAt)
    const block = up ? 1 : 0
    fpVmRoot.position.set((portrait ? 0.15 : 0.25) - block * 0.05, (portrait ? -0.3 : -0.27) - block * 0.04, -0.62)
    fpVmRoot.rotation.set(0.05 + Math.sin(t * 1.6) * 0.006, portrait ? 0.16 : 0.1, 0)
    fpVmRoot.scale.setScalar(portrait ? 0.62 : 0.82)
    vm.barrier.update(FP_STEP, up, fpPower, t)
    if (fpHold !== null && fpFired >= 0 && t >= 1 + fpHold) fpFrozen = true
    if (fpFreezeAt !== null && t >= fpFreezeAt) fpFrozen = true
  }
  fpLast = now
}

const loop = () => {
  raf = requestAnimationFrame(loop)
  const t = (performance.now() - t0) / 1000
  if (current.value === 'thumb') {
    const r = getRenderer()
    r.clear()
    if (thumbScene && thumbReady) r.render(thumbScene, camera)
    return
  }
  if (current.value === 'fp') {
    fpFrame()
    for (const { kind, rig: er } of enemyRigs) {
      if (kind === 'hardhat') poseHardhat(er, 1, t, 0)
      else poseTrooper(er, 0.5 + 0.5 * Math.sin(t), 0, t, 0.3)
    }
    const r = getRenderer()
    r.clear()
    r.render(fpScene, fpCamera)
    return
  }
  for (const hr of rig ? [rig, ...heroRigs] : heroRigs) {
    if (heroPose === 'victory') animateHeroVictory(hr, 1)
    else animateHeroIdle(hr, still ? 0 : t)
  }
  for (const { kind, rig: r } of enemyRigs) {
    if (kind === 'hardhat') poseHardhat(r, 0.5 + 0.5 * Math.sin(t * 1.5), t, 0)
    else if (kind === 'trooper') poseTrooper(r, 0.5 + 0.5 * Math.sin(t), 0.5 - 0.5 * Math.sin(t), t, 0.3)
    else if (kind === 'heli') poseHeli(r, t, 0.1, t * 25)
    else if (kind === 'hopper') poseHopper(r, Math.sin(t * 2), t)
    else if (kind === 'roller') poseRoller(r, t * 3, t, 0.4)
    else if (kind === 'brute') poseBrute(r, t, 0.2, Math.sin(t) > 0 ? 1 : -1, Math.sin(t * 2), 0)
    else if (kind === 'turret') poseTurret(r, 0.2 + Math.sin(t) * 0.2, 0)
    else if (kind === 'golem') poseGolemLab(r, still ? 0 : t)
    else if (kind === 'spotter') poseSpotter(r, Math.atan2(SPOTTER_LENS.y + 2.4, 3 - SPOTTER_LENS.z), spotLock, spotLamp, still ? 0 : t)
  }
  for (const { id, rig: r } of bossRigs) poseBoss(r, id, t, 'idle', 0)
  if (bossRigs.length > 1) stage.rotation.y = fixedAngle ?? Math.sin(t * 0.4) * 0.4
  if (enemyRigs.length > 1) stage.rotation.y = fixedAngle ?? Math.sin(t * 0.4) * 0.5
  if (heroRigs.length > 0 || current.value === 'hubview') stage.rotation.y = 0
  else if (spotBeam) stage.rotation.y = fixedAngle ?? 0
  else if (current.value !== 'props' && enemyRigs.length <= 1 && bossRigs.length <= 1) stage.rotation.y = fixedAngle ?? t * 0.6
  const r = getRenderer()
  r.clear()
  r.render(scene, camera)
}

onMounted(() => {
  // Handle for headless screenshot scripts (dev-only page)
  ;(window as unknown as { __lab: unknown }).__lab = {
    scene, stage, fpScene, getRig: () => rig, getRigs: () => heroRigs, getVm: () => fpVm, show,
    /** `m=thumb`: true once the backdrop is built and the first pose applied. */
    get thumbReady () { return thumbReady },
    /** `m=thumb`: re-pose / re-frame the current backdrop (`{ cam, look, fov, yaw, pose, … }`). */
    thumb: (o: Partial<ThumbShot> = {}) => applyThumb({ ...thumbBase, ...o, pose: { ...thumbBase.pose, ...o.pose } }),
    /** `m=thumb`: the frame as a PNG data URL, read off the canvas (scripts/render-thumbnail.mjs). */
    thumbPng
  }
  bakeTextures()
  const r = getRenderer()
  // A still, not a frame-rate budget: render the thumbnail at the page's full pixel ratio
  if (current.value === 'thumb') r.setPixelRatio(window.devicePixelRatio)
  host.value!.appendChild(r.domElement)
  const resize = () => {
    const w = host.value!.clientWidth
    const h = host.value!.clientHeight
    r.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    fpCamera.aspect = w / h
    fpCamera.fov = w < h ? 58 : 50
    fpCamera.updateProjectionMatrix()
  }
  resize()
  window.addEventListener('resize', resize)
  show(current.value)
  loop()
})
watch(current, show)
onUnmounted(() => cancelAnimationFrame(raf))
</script>

<style scoped lang="sass">
.lab
  position: fixed
  inset: 0
.host
  position: absolute
  inset: 0
  :deep(canvas)
    width: 100%
    height: 100%
    display: block
.bar
  position: absolute
  left: 8px
  top: 8px
  display: flex
  gap: 6px
  button
    padding: 4px 10px
    background: #1f2a44
    color: #fff
    border-radius: 6px
    &.on
      background: #3cc8ff
      color: #000
</style>
