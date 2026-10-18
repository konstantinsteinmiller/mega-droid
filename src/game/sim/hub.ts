import {
  Scene, PerspectiveCamera, Color, HemisphereLight, DirectionalLight, Fog, Group, Mesh, MeshBasicMaterial,
  AdditiveBlending, CylinderGeometry, CircleGeometry, DoubleSide, FrontSide, Quaternion, Vector3, Matrix4, BufferGeometry,
  Float32BufferAttribute, PlaneGeometry, Points, PointsMaterial, InstancedMesh, InstancedBufferAttribute,
  ShaderMaterial, CustomBlending, OneFactor, OneMinusSrcAlphaFactor, DynamicDrawUsage, type Material, type Side
} from 'three'
import type { GameMode } from '../engine/app'
import { getRenderer } from '../engine/renderer'
import { sceneQuality } from '../engine/quality'
import { consumeEdges, type Input } from '../engine/input'
import { buildHero, animateHeroIdle, animateHeroVictory, animateHeroWalk } from '../models/hero'
import { buildPip, animatePip } from '../models/npc'
import { buildTeleporter, type PadMesh } from '../models/props'
import { rcyl, rbox, torus, sph, ell, cap, xform, paint, paintBy, merge, lathe, rcone } from '../models/kit'
import { toonVC, glowVC, outlineMat } from '../models/toon'
import { HERO_GAIT, newMotion, cycleLen, type GaitSpec, type EnemyMotion } from '../models/motion'
import type { BossId } from '../models/bosses'
import type { Diorama } from '../models/diorama'
import {
  buildHallShell, buildLabFront, buildSpire, newParts, padParts, padDisc, portalFrame, portalScreen, buildWeaponRack,
  buildForge, forgeHammer, buildChipLab, buildRecords, buildTrophies, buildGate, gateLeaf, buildHoloTable, DOOR_CURTAIN, PAD_R, PAD_TOP,
  C, type Parts
} from '../models/hubHall'
import { THEMES, type SectorId } from '../world/themes'
import type { Rig } from '../models/kit'
import { heroColors, profile, saveProfile } from '../state/profile'
import { buildGauss, poseGauss, newGaussPose, setGaussGlow, type GaussRig } from '../models/gauss'
import { Particles } from '../fx/particles'
import { makeBlobShadow } from '../fx/markers'
import { TRAIL_VERT, TRAIL_FRAG, TRAIL_MAX, TRAIL_STRIDE, createTrailPath, setTrailPath, layoutTrail } from '../fx/objectiveTrail'
import { tickHud, hud } from '../state/hud'
import { HoloMaterial, setHoloTime } from '../fx/holoMaterial'
import { hubUi, hubMarks, hubDialog, resetHubUi } from '../state/hubUi'
import {
  BRIEF_SPOT, GATE_LEAF_Z, GATE_PYLON_X, HALL_END, HALL_HALF, HOME_PAD, LAB_POSTS, NICHE_DEPTH, POI_BY_ID, POSTS, TABLE_Z,
  TROPHY_SPOT, WALLS, fenceOf, openGateWalls, poiAt, rayHit, rayHitPosts, routeTo, spawnOnPad, zoneAt,
  type Poi, type PoiId, type Seg, type Spawn
} from '../world/hubLayout'
import { newWalker, stepWalker, walkRoute, angDiff, type HubWalker } from './hubWalk'
import { placeState, placesFor, nextSector, fenced, deployable, jobIndex, type PlaceState, type PlaceInputs } from './hubPlaces'
import { LOOK_MOUSE, LOOK_TOUCH, TURN_RATE } from './constants'
import { SECTORS, SECTOR_BY_ID } from '../data/regions'
import { SECTOR_COLOR } from '../data/signature'
import { WEAPONS, WEAPON_IDS } from '../data/weapons'
import type { Quest } from '../data/quests'
import { loadHubHoloModule } from '../lazy'
import { flow, jobsOpen, startDebrief, briefingToReplay, deployFromPad, padQuest, type HubArrival } from '../flow'
import { hubTab, hubLesson, type HubTab } from '@/components/hub/hubLesson'
import { isUnlocked, unlockCount } from '@/components/hub/hubUnlocks'
import { isAnyModalOpen } from '@/use/useModalState'
import { leaderboardListEnabled } from '@/use/useLeaderboard'
import { hubSceneUi } from '../story/hubSceneUi'
import { sectorSelected, boardOpened, boardClosed } from '../story/hubAtlas'
import { sfx } from '../audio/sfx'

/** The lab's door: a walk out aimed a little beside it slides through. */
const DOOR_FUNNEL = { x: 0, z0: 3.5, z1: 7.4, reach: 3.6 }

/** A freed sector's blue (the debrief's valley uses the same, `CLEARED_BLUE`). */
const CLEARED = '#3aa8ff'

/** The ceiling lamp: its glowing ring (radius, height) round a housing. */
export const LAMP_R = 3.6
export const LAMP_Y = 7.2
/** The gantry the lamp hangs from: its beams' middle height, and its
 *  posts' distance out (behind the back wall's ends and its middle). */
export const GANTRY_Y = 8.6
const GANTRY_OUT = 8.6
const SPOKES = 6

/** A straight member from `a` to `b` (each end set into what it joins). */
export interface LampMount { a: [number, number, number]; b: [number, number, number]; r: number }

/** Every member that holds the lamp up, from the ring to the floor: six
 *  spokes ring → housing, a hanger rod housing → gantry, the gantry's two
 *  beams and its three posts down to the floor. The ring used to float at
 *  7.2 m with nothing above it (placement audit 2026-10-12). */
export const labLampMounts = (): LampMount[] => {
  const out: LampMount[] = []
  for (let k = 0; k < SPOKES; k++) {
    const a = (k / SPOKES) * Math.PI * 2 + Math.PI / SPOKES
    out.push({ a: [Math.cos(a) * 1.15, LAMP_Y + 0.38, Math.sin(a) * 1.15], b: [Math.cos(a) * LAMP_R, LAMP_Y, Math.sin(a) * LAMP_R], r: 0.045 })
  }
  // The hanger: from inside the housing's dome up into the cross beam.
  out.push({ a: [0, LAMP_Y + 0.6, 0], b: [0, GANTRY_Y, 0], r: 0.09 })
  // The posts: behind the back wall's two ends and its middle, up into the beams.
  for (const [x, z] of [[-GANTRY_OUT, 0], [GANTRY_OUT, 0], [0, -GANTRY_OUT]] as const) out.push({ a: [x, -0.1, z], b: [x, GANTRY_Y, z], r: 0.28 })
  return out
}

/** The lamp's parts, one geometry each (`tests/game/labLamp.test.ts` checks
 *  them for coplanar faces): the ring, its housing, the members, the beams. */
export const labLampParts = (): { toon: BufferGeometry[]; glow: BufferGeometry[] } => {
  const toon: BufferGeometry[] = []
  const glow: BufferGeometry[] = [xform(paint(torus(LAMP_R, 0.09, 6, 48), '#bff3ff'), [0, LAMP_Y, 0], [Math.PI / 2, 0, 0])]
  toon.push(xform(paint(ell(1.4, 0.4, 1.4, 20, 10), '#2f4580'), [0, LAMP_Y + 0.4, 0]))
  const up = new Vector3(0, 1, 0)
  const dir = new Vector3()
  const q = new Quaternion()
  for (const m of labLampMounts()) {
    dir.set(m.b[0] - m.a[0], m.b[1] - m.a[1], m.b[2] - m.a[2])
    const len = dir.length()
    q.setFromUnitVectors(up, dir.normalize())
    const g = paint(rcyl(m.r, len, m.r * 0.3, 10), m.r > 0.2 ? '#5d6a82' : '#8a97ad')
    g.applyQuaternion(q)
    g.translate((m.a[0] + m.b[0]) / 2, (m.a[1] + m.b[1]) / 2, (m.a[2] + m.b[2]) / 2)
    toon.push(g)
  }
  // The gantry: a beam across the lab over the posts at the wall's ends, and
  // a slimmer one from the back post to it (its faces inside the first's).
  toon.push(xform(paint(rbox(GANTRY_OUT * 2 + 0.8, 0.44, 0.5, 0.12), '#3b4458'), [0, GANTRY_Y + 0.12, 0]))
  toon.push(xform(paint(rbox(0.38, 0.32, GANTRY_OUT + 0.4, 0.1), '#3b4458'), [0, GANTRY_Y + 0.12, -GANTRY_OUT / 2]))
  return { toon, glow }
}

/**
 * The lab set: the round platform, the dome's glowing panels, the consoles and
 * the ceiling lamp. The hub stands on it, and the intro's lab shots reuse it
 * (`story/intro.ts`).
 */
export const buildLabSet = (): Group => {
  const g = new Group()
  const toon: BufferGeometry[] = []
  const glow: BufferGeometry[] = []
  // Floor: a big rounded disc with rings
  toon.push(xform(paint(rcyl(9, 0.4, 0.2, 48), '#26365f'), [0, -0.2, 0]))
  toon.push(xform(paint(torus(3.2, 0.06, 6, 48), '#3a5a9a'), [0, 0.01, 0], [Math.PI / 2, 0, 0]))
  toon.push(xform(paint(torus(5.6, 0.06, 6, 64), '#3a5a9a'), [0, 0.01, 0], [Math.PI / 2, 0, 0]))
  // Back wall: curved panels in a half ring behind the pad
  for (let k = 0; k < 11; k++) {
    const a = Math.PI + (k / 10) * Math.PI
    const x = Math.cos(a) * 8.2
    const z = Math.sin(a) * 8.2
    toon.push(paintBy(xform(rbox(2.6, 6, 0.5, 0.35), [x, 3, z], [0, -a - Math.PI / 2, 0]), (_x, y) => (y > 5.3 ? '#4fd8ff' : y < 0.7 ? '#1c2a50' : '#2f4580')))
    glow.push(xform(paint(cap(0.07, 3.2, 8, 2), k % 2 ? '#7ff4ff' : '#ffd84a'), [Math.cos(a) * 7.9, 3.2, Math.sin(a) * 7.9]))
    toon.push(xform(paint(rcyl(0.32, 6.4, 0.12, 12), '#5d6a82'), [Math.cos(a + 0.14) * 8.1, 3.2, Math.sin(a + 0.14) * 8.1]))
  }
  // Consoles either side
  for (const s of [-1, 1]) {
    toon.push(xform(paint(rbox(1.6, 1.1, 0.9, 0.35), '#3b4458'), [s * 3.6, 0.55, -2.4], [0, -s * 0.5, 0]))
    toon.push(xform(paint(rbox(1.4, 0.8, 0.12, 0.4), '#1d2438'), [s * 3.55, 1.45, -2.65], [-0.35, -s * 0.5, 0]))
    glow.push(xform(paint(rbox(1.2, 0.6, 0.05, 0.5), s > 0 ? '#3cff9a' : '#3cc8ff'), [s * 3.55, 1.47, -2.58], [-0.35, -s * 0.5, 0]))
    // Glass capsule tubes with glowing fluid
    toon.push(xform(paint(rcyl(0.55, 0.35, 0.12, 20), '#5d6a82'), [s * 5.4, 0.18, -0.6]))
    toon.push(xform(paint(rcyl(0.55, 0.35, 0.12, 20), '#5d6a82'), [s * 5.4, 3.3, -0.6]))
    glow.push(xform(paint(lathe([[0, 0], [0.42, 0.05], [0.42, 2.6], [0, 2.65]], 20), s > 0 ? '#7fffc8' : '#8ab8ff'), [s * 5.4, 0.35, -0.6]))
    toon.push(xform(paint(sph(0.35, 14, 10), '#9aa7bd'), [s * 5.4, 1.6, -0.6]))
  }
  // Ceiling lamp ring, hung from its gantry
  const lamp = labLampParts()
  toon.push(...lamp.toon)
  glow.push(...lamp.glow)
  const geo = merge(toon)
  g.add(new Mesh(geo, toonVC()))
  const ol = new Mesh(geo, outlineMat(0.03))
  ol.renderOrder = -1
  g.add(ol)
  g.add(new Mesh(merge(glow), glowVC()))
  // Soft light shaft over the pad
  const shaft = new Mesh(
    new CylinderGeometry(1.2, 1.6, 7, 24, 1, true),
    new MeshBasicMaterial({ color: new Color('#7ff4ff'), transparent: true, opacity: 0.07, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false })
  )
  shaft.position.y = 3.6
  g.add(shaft)
  return g
}

// ─── The walkable lab (#173) ─────────────────────────────────────────────────

/** Flux's jog through the hall: a longer swing than the mission walk's. */
const HUB_GAIT: GaitSpec = { ...HERO_GAIT, A: 0.66, beta: 0.44 }
/** The chase camera: distance behind Flux, its tilt down, the pivot's height. */
const CAM_DIST = 4.4
const CAM_PITCH = -0.2
const PITCH_LO = -0.62
const PITCH_HI = 0.18
const PIVOT_H = 1.25
/** It eases round behind him as he walks, unless the player steered it lately (s). */
const FOLLOW_RATE = 1.5
const FOLLOW_YIELD = 1.6
/** Marker anchors over a pad, a station, the table and the gate (m). */
const MARK_Y = { pad: 3.25, station: 3.7, table: 2.75, gate: 5.1 }
/** Markers show within this of Flux, fading out over the last stretch (m). */
const MARK_NEAR = 16
const MARK_FADE = 5
/** The film moments (s): the landing, the briefing's turn, the beam-out. */
const LAND_T = 1.25
const LAND_FREE = 0.85
const BRIEF_HOLD = 1.1
const BRIEF_TURN = 1.3
const BEAM_T = 0.95
/** A pedestal's hologram: its height and how high it floats over the pad. */
const HOLO_H = 2.05
const HOLO_LIFT = 0.16
/** …standing behind the pad, toward the portal: Flux on the pad faces it. */
const HOLO_BACK = 1.05

/** Where a pedestal's Master stands: behind its pad, on its emitter. */
const holoSpot = (p: Poi): [number, number] =>
  p.side !== 0 ? [p.x + p.side * HOLO_BACK, p.z] : [p.x, p.z + HOLO_BACK * 1.4]

type Act = 'land' | 'brief' | 'walk' | 'beam'

/** A place in the hall, its parts that change with its state. */
interface Slot {
  poi: Poi
  state: PlaceState
  /** Its signature colour (a sector's, the job's sector's, a station's lamp). */
  color: string
  disc: Mesh | null
  discMat: MeshBasicMaterial | null
  beam: Mesh | null
  beamMat: MeshBasicMaterial | null
  screenMat: MeshBasicMaterial | null
  holo: Group | null
  holoMat: HoloMaterial | null
  holoOn: number
  /** Its light on the floor (its colour spilling into the hall). */
  poolMat: MeshBasicMaterial | null
  /** Where its marker hangs (world). */
  mark: Vector3
}

/** Merged static meshes: the hall's architecture is the same for every visit. */
let shellCache: { plain: BufferGeometry; toon: BufferGeometry; glow: BufferGeometry; spirePlain: BufferGeometry; spireGlow: BufferGeometry } | null = null
const shellGeometry = () => {
  if (shellCache) return shellCache
  const hall = buildHallShell()
  const front = buildLabFront()
  const spire = buildSpire()
  shellCache = {
    plain: merge(hall.plain),
    toon: merge([...hall.toon, ...front.toon]),
    glow: merge([...hall.glow, ...front.glow]),
    spirePlain: merge(spire.plain),
    spireGlow: merge(spire.glow)
  }
  return shellCache
}

const additive = (hex: string, opacity: number, side: Side = FrontSide): MeshBasicMaterial =>
  new MeshBasicMaterial({ color: new Color(hex), transparent: true, opacity, blending: AdditiveBlending, depthWrite: false, toneMapped: false, side })

/** An open light column with its glow falling off toward the top (additive:
 *  black is clear), so it reads as a soft beam, not a tube. */
const beamGeometry = (r: number, h: number): BufferGeometry => {
  const g = new CylinderGeometry(r, r * 1.08, h, 28, 6, true)
  g.deleteAttribute('uv')
  const pos = g.attributes.position!
  const col = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getY(i) / h + 0.5
    const v = Math.max(0, 1 - u) ** 1.6 * Math.min(1, u * 8)
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = v
  }
  g.setAttribute('color', new Float32BufferAttribute(col, 3))
  g.translate(0, h / 2, 0)
  return g
}

/** A pool of light on the floor: bright in the middle, gone at the rim
 *  (additive, so its black rim is clear). */
const poolGeometry = (r: number): BufferGeometry => {
  const g = new CircleGeometry(r, 32, 0, Math.PI * 2)
  g.deleteAttribute('uv')
  g.rotateX(-Math.PI / 2)
  const pos = g.attributes.position!
  const col = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i++) {
    const d = Math.hypot(pos.getX(i), pos.getZ(i)) / r
    const v = (1 - d) * (1 - d)
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = v
  }
  g.setAttribute('color', new Float32BufferAttribute(col, 3))
  return g
}

/** A floor pool's material: additive, drawn over the floor it lies on. */
const poolMaterial = (hex: string, opacity: number): MeshBasicMaterial => {
  const m = new MeshBasicMaterial({
    color: new Color(hex), vertexColors: true, transparent: true, opacity, blending: AdditiveBlending, depthWrite: false,
    toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
  })
  return m
}

/** A job's sign over its pad: what the job is, as a shape of light. */
const jobSign = (template: string): BufferGeometry => {
  const parts: BufferGeometry[] = []
  switch (template) {
    case 'climb':
      for (let k = 0; k < 4; k++) parts.push(xform(paint(rbox(0.62 - k * 0.12, 0.3, 0.62 - k * 0.12, 0.3), '#ffffff'), [0, k * 0.32, 0]))
      parts.push(xform(paint(rcone(0.16, 0.01, 0.34, 0.01, 8), '#ffffff'), [0, 1.42, 0]))
      break
    case 'supply':
    case 'collect':
      parts.push(xform(paint(rbox(0.8, 0.62, 0.8, 0.25), '#ffffff'), [0, 0.4, 0]))
      parts.push(xform(paint(rbox(0.86, 0.1, 0.86, 0.3), '#9a9a9a'), [0, 0.4, 0]))
      break
    case 'rescue':
      parts.push(xform(paint(sph(0.24, 14, 10), '#ffffff'), [-0.18, 0.62, 0]))
      parts.push(xform(paint(sph(0.24, 14, 10), '#ffffff'), [0.18, 0.62, 0]))
      parts.push(xform(paint(rcone(0.36, 0.02, 0.5, 0.01, 4), '#ffffff'), [0, 0.32, 0], [Math.PI, Math.PI / 4, 0]))
      break
    default:
      // A target's reticle: a ring, a dot and four ticks.
      parts.push(xform(paint(torus(0.42, 0.05, 6, 28), '#ffffff'), [0, 0.6, 0]))
      parts.push(xform(paint(sph(0.09, 10, 8), '#ffffff'), [0, 0.6, 0]))
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2
        parts.push(xform(paint(rbox(0.06, 0.2, 0.06, 0.4), '#ffffff'), [Math.cos(a) * 0.58, 0.6 + Math.sin(a) * 0.58, 0], [0, 0, a + Math.PI / 2]))
      }
  }
  return merge(parts)
}

/** The chip lab's floating chip: a lattice of lit nodes. */
const chipLattice = (): BufferGeometry => {
  const parts: BufferGeometry[] = []
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    parts.push(xform(paint(sph(0.055, 8, 6), i === 0 && j === 0 ? '#ffd84a' : '#3cff9a'), [i * 0.32, 0, j * 0.32]))
    if (i < 1) parts.push(xform(paint(rbox(0.32, 0.018, 0.018, 0.5), '#7ff4ff'), [i * 0.32 + 0.16, 0, j * 0.32]))
    if (j < 1) parts.push(xform(paint(rbox(0.018, 0.018, 0.32, 0.5), '#7ff4ff'), [i * 0.32, 0, j * 0.32 + 0.16]))
  }
  parts.push(xform(paint(rbox(1.0, 0.03, 1.0, 0.3), '#1d6a4a'), [0, -0.06, 0]))
  return merge(parts)
}

/** The records terminal's trophy: a cup of light. */
const trophyCup = (): BufferGeometry => merge([
  paint(lathe([[0, 0], [0.2, 0], [0.2, 0.05], [0.06, 0.1], [0.05, 0.3], [0.28, 0.42], [0.3, 0.7], [0.26, 0.7], [0.0, 0.48]], 18), '#ffd84a'),
  xform(paint(torus(0.13, 0.03, 6, 14), '#ffd84a'), [0.3, 0.55, 0], [0, 0, 0]),
  xform(paint(torus(0.13, 0.03, 6, 14), '#ffd84a'), [-0.3, 0.55, 0], [0, 0, 0])
])

/** A lock of light: an offline station's sign. */
const lockSign = (): BufferGeometry => merge([
  xform(paint(rbox(0.5, 0.42, 0.12, 0.3), '#ffffff'), [0, 0, 0]),
  xform(paint(torus(0.16, 0.05, 6, 16, Math.PI), '#ffffff'), [0, 0.2, 0])
])

/** The hall's trail of chevrons to the next mission (the missions' look). */
class HubTrail {
  readonly mesh: InstancedMesh
  private readonly geo: PlaneGeometry
  private readonly mat: ShaderMaterial
  private readonly alpha: InstancedBufferAttribute
  private readonly path = createTrailPath()
  private readonly slots = new Float32Array(TRAIL_MAX * TRAIL_STRIDE)
  private vis = 0
  private since = Infinity
  private toX = NaN
  private toZ = NaN

  constructor(scene: Scene) {
    this.geo = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2)
    this.alpha = new InstancedBufferAttribute(new Float32Array(TRAIL_MAX), 1).setUsage(DynamicDrawUsage)
    this.geo.setAttribute('aAlpha', this.alpha)
    this.mat = new ShaderMaterial({
      uniforms: { uColor: { value: new Color('#ffd84a') }, uInk: { value: new Color('#0f1a30') }, uLift: { value: 0.6 } },
      vertexShader: TRAIL_VERT,
      fragmentShader: TRAIL_FRAG,
      transparent: true,
      depthWrite: false,
      blending: CustomBlending,
      blendSrc: OneFactor,
      blendDst: OneMinusSrcAlphaFactor,
      toneMapped: false
    })
    this.mesh = new InstancedMesh(this.geo, this.mat, TRAIL_MAX)
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage)
    this.mesh.count = 0
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 2
    scene.add(this.mesh)
  }

  update(dt: number, on: boolean, x: number, z: number, to: Poi | null, t: number): void {
    this.since += dt
    const want = on && !!to && Math.hypot(to.ax - x, to.az - z) > 4
    if (want && to && (this.since > 0.4 || to.ax !== this.toX || to.az !== this.toZ)) {
      this.since = 0
      this.toX = to.ax
      this.toZ = to.az
      setTrailPath(this.path, x, z, routeTo(x, z, to))
    }
    this.vis = want ? Math.min(1, this.vis + dt / 0.4) : Math.max(0, this.vis - dt / 0.4)
    const n = this.vis > 0 ? layoutTrail(this.path, x, z, this.slots) : 0
    this.mesh.count = n
    this.mesh.visible = n > 0
    if (!n) return
    const al = this.alpha.array as Float32Array
    const phase = (t / 1.2) * Math.PI * 2
    for (let i = 0; i < n; i++) {
      const b = i * TRAIL_STRIDE
      const w = 0.5 + 0.5 * Math.cos(phase + (this.slots[b + 4]! / 5) * Math.PI * 2)
      al[i] = Math.min(1, this.vis * this.slots[b + 3]! * (0.6 + 0.4 * w * w))
      _m4.makeRotationY(this.slots[b + 2]!).scale(_s3.set(0.62, 1, 0.62)).setPosition(this.slots[b]!, 0.05, this.slots[b + 1]!)
      this.mesh.setMatrixAt(i, _m4)
    }
    this.mesh.instanceMatrix.needsUpdate = true
    this.alpha.needsUpdate = true
  }

  dispose(): void {
    this.mesh.removeFromParent()
    this.mesh.dispose()
    this.geo.dispose()
    this.mat.dispose()
  }
}

const _m4 = new Matrix4()
const _s3 = new Vector3()
const _v = new Vector3()
const _w = new Vector3()

const smooth = (a: number, b: number, x: number): number => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return k * k * (3 - 2 * k)
}

/**
 * ─── The hub: Gauss's lab and its Deployment Hall, on foot (#173) ───────────
 *
 * The lab used to be a backdrop behind four menu tabs. Now it is a place:
 * Flux lands on the lab's teleporter (or comes back to the pedestal he left
 * from, or turns from the briefing table after a debrief), walks out through
 * the airlock into the hall, and everything the menus did stands in it — the
 * weapon rack for his gear, the forge for upgrades, the chip lab for his
 * circuits, the records terminal for the leaderboard, a beam pedestal per
 * mission (`world/hubLayout.ts` for where, `sim/hubPlaces.ts` for what
 * state). Third person, so the player sees the gear they put on.
 *
 * The camera follows behind him; the stick (WASD, or the left thumb) walks
 * relative to it, a drag (or ← / →) turns it; a tap on a place's marker walks
 * him there. At a station the camera swings round to frame him beside its
 * panel, as the old lab did. On a pedestal the mission's card comes up, and
 * Deploy beams him out.
 */
export class HubMode implements GameMode {
  scene = new Scene()
  camera = new PerspectiveCamera(55, 1, 0.1, 420)
  private hero: Rig
  private readonly heroRoot = new Group()
  private readonly motion: EnemyMotion = newMotion(7)
  private readonly shadow: Mesh
  private readonly pip: Rig
  private readonly pipRoot = new Group()
  private readonly pipAt = new Vector3()
  private gauss: GaussRig | null = null
  private readonly gaussPose = newGaussPose()
  private readonly fx = new Particles(600)
  private readonly trail: HubTrail
  private t = 0
  private victoryT = -1
  private readonly walker: HubWalker
  private prevX = 0
  private prevZ = 0
  private prevYaw = 0
  private act: Act = 'land'
  private actT = 0
  private readonly arrival: HubArrival
  // The camera
  private camYaw = 0
  private camPitch = CAM_PITCH
  private camDist = CAM_DIST
  private lastLook = -10
  /** A heading the camera swings round to by itself (after a panel, a
   *  pad's landing), until the player steers it. */
  private camAim: number | null = null
  private panelK = 0
  private readonly camPos = new Vector3()
  private readonly camLook = new Vector3()
  // The places
  private readonly places: Poi[]
  private readonly slots: Slot[] = []
  private walls: Seg[] = []
  private readonly homePad: PadMesh
  private readonly doorMat: MeshBasicMaterial
  private readonly fenceMat: MeshBasicMaterial
  private hammer: Group | null = null
  private hammerT = 0
  private readonly hammerAt = new Vector3()
  private chip: Mesh | null = null
  private cup: Mesh | null = null
  private valley: Diorama | null = null
  private valleyOn = 0
  private freed: Set<SectorId>
  private nextStory: SectorId | null
  private gateLeaves: Group[] = []
  private gateOpen = 0
  private readonly owned: Array<{ geo: BufferGeometry } | { mat: Material }> = []
  // Going somewhere / leaving
  private goal: { id: PoiId; open: boolean } | null = null
  /** The landing's or the briefing's last step: still part of the film. */
  private stepping = false
  private beamQuest: Quest | null = null
  private beamSlot: Slot | null = null
  private beamed = false
  private disposed = false
  private atlasFor: PoiId | '' = ''

  constructor(private readonly input: Input, arrival: HubArrival = { kind: 'home' }) {
    this.arrival = arrival
    resetHubUi()
    const s = this.scene
    s.background = new Color('#0b1430')
    s.fog = new Fog(new Color('#121c40'), 34, 120)
    s.add(new HemisphereLight(new Color('#e4eeff'), new Color('#2a3660'), 1.45))
    const key = new DirectionalLight(new Color('#fff6e8'), 1.35)
    key.position.set(0.6, 1, 0.9)
    const rim = new DirectionalLight(new Color('#7fd6ff'), 0.65)
    rim.position.set(-1, 0.6, -0.8)
    s.add(key, rim)
    // The lab as it always was, and what makes it a room: its front wall, its door.
    s.add(buildLabSet())
    const shell = shellGeometry()
    const plain = new Mesh(shell.plain, toonVC())
    const toonM = new Mesh(shell.toon, toonVC())
    const ol = new Mesh(shell.toon, outlineMat(0.03))
    ol.renderOrder = -1
    s.add(plain, toonM, ol, new Mesh(shell.glow, glowVC()))
    // Vex's spire over the hall's end wall: far, unfogged, his red.
    const spireMat = this.own(new MeshBasicMaterial({ vertexColors: true, fog: false, toneMapped: false }))
    s.add(new Mesh(shell.spirePlain, spireMat), new Mesh(shell.spireGlow, spireMat))
    s.add(this.buildStars())

    this.homePad = buildTeleporter(THEMES.scrapyard)
    s.add(this.homePad.root)
    ;(this.homePad.ringMat as MeshBasicMaterial).opacity = 0.12

    this.doorMat = this.own(additive('#7ff4ff', 0.3, DoubleSide))
    const curtain = new Mesh(this.ownGeo(this.curtainGeometry()), this.doorMat)
    curtain.position.set(0, DOOR_CURTAIN.h / 2, DOOR_CURTAIN.z)
    s.add(curtain)
    this.fenceMat = this.own(additive('#ff2d3f', 0.8))

    // The places and their state.
    this.places = placesFor(leaderboardListEnabled)
    const inputs = this.placeInputs()
    this.freed = new Set(SECTORS.filter(x => profile.world.bosses.includes(x.boss)).map(x => x.id))
    this.nextStory = nextSector(inputs)
    const props = newParts()
    for (const p of this.places) this.buildSlot(p, placeState(p, inputs), props)
    this.buildDecor(props)
    const pg = merge(props.toon)
    s.add(this.ownMesh(new Mesh(pg, toonVC())))
    const pol = new Mesh(pg, outlineMat(0.022))
    pol.renderOrder = -1
    s.add(pol)
    if (props.glow.length) s.add(this.ownMesh(new Mesh(merge(props.glow), glowVC())))
    this.syncWalls()
    hubUi.places = this.slots.map(sl => ({ id: sl.poi.id, state: sl.state }))

    // Flux and Pip.
    this.hero = buildHero(heroColors())
    this.heroRoot.add(this.hero.root)
    this.shadow = makeBlobShadow(0.5)
    s.add(this.heroRoot, this.shadow)
    this.pip = buildPip()
    this.pipRoot.add(this.pip.root)
    this.pipRoot.scale.setScalar(0.78)
    s.add(this.pipRoot)
    if (profile.world.seen.includes('ending')) {
      // Dr. Gauss, awake in her lab once the ending has played (#102): by the briefing table.
      this.gauss = buildGauss()
      this.gauss.root.position.set(2.5, 0, TABLE_Z + 0.6)
      this.gauss.root.rotation.y = -0.9
      setGaussGlow(this.gauss, 1)
      const sh = makeBlobShadow(0.5)
      sh.position.set(2.5, 0.01, TABLE_Z + 0.6)
      s.add(this.gauss.root, sh)
    }
    s.add(this.fx.points)
    this.trail = new HubTrail(s)

    // Where he turns up.
    const sp = this.spawn()
    this.walker = newWalker(sp.x, sp.z, sp.yaw)
    this.prevX = sp.x
    this.prevZ = sp.z
    this.prevYaw = sp.yaw
    this.act = arrival.kind === 'brief' ? 'brief' : 'land'
    hubUi.cine = true
    if (arrival.kind === 'brief') this.camYaw = sp.yaw
    else if (arrival.kind === 'pad') this.camYaw = sp.yaw + Math.PI
    else this.camYaw = sp.yaw + Math.PI * 0.85
    this.pipAt.set(sp.x, 1.8, sp.z)

    // The holograms stream in once the hall is up.
    void loadHubHoloModule().then(m => this.addHolograms(m)).catch((e) => console.warn('[hub] holograms failed to load', e))
  }

  // ─── Building ──────────────────────────────────────────────────────────────

  private own<T extends Material>(m: T): T {
    this.owned.push({ mat: m })
    return m
  }

  private ownGeo(g: BufferGeometry): BufferGeometry {
    this.owned.push({ geo: g })
    return g
  }

  private ownMesh(m: Mesh): Mesh {
    this.ownGeo(m.geometry)
    return m
  }

  private placeInputs(): PlaceInputs {
    const n = unlockCount(profile)
    return {
      unlocked: profile.world.unlocked,
      bosses: profile.world.bosses,
      jobs: profile.quests.jobs,
      jobsOpen: jobsOpen(),
      menus: {
        hero: isUnlocked('hero', n),
        workshop: isUnlocked('workshop', n),
        circuits: isUnlocked('circuits', n),
        leaderboard: isUnlocked('leaderboard', n)
      },
      liveBoard: leaderboardListEnabled
    }
  }

  private curtainGeometry(): BufferGeometry {
    // A sheet of light, bright at its edges and its scan lines.
    const g = new PlaneGeometry(DOOR_CURTAIN.w, DOOR_CURTAIN.h, 8, 24)
    g.deleteAttribute('uv')
    const pos = g.attributes.position!
    const col = new Float32Array(pos.count * 3)
    for (let i = 0; i < pos.count; i++) {
      const x = Math.abs(pos.getX(i)) / (DOOR_CURTAIN.w / 2)
      const y = (pos.getY(i) / DOOR_CURTAIN.h) + 0.5
      const v = 0.25 + 0.75 * x ** 4 + (Math.round(y * 24) % 3 === 0 ? 0.25 : 0)
      col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = Math.min(1, v)
    }
    g.setAttribute('color', new Float32BufferAttribute(col, 3))
    this.doorMat.vertexColors = true
    return g
  }

  private buildStars(): Points {
    const n = 700
    const pos = new Float32Array(n * 3)
    let seed = 9137
    const r = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296)
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2
      const e = 0.12 + r() * 1.3
      const d = 190
      pos[i * 3] = Math.cos(a) * Math.cos(e) * d
      pos[i * 3 + 1] = Math.sin(e) * d
      pos[i * 3 + 2] = 40 + Math.sin(a) * Math.cos(e) * d
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(pos, 3))
    this.ownGeo(g)
    const m = new PointsMaterial({ color: new Color('#cfe6ff'), size: 2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85, depthWrite: false })
    this.owned.push({ mat: m })
    return new Points(g, m)
  }

  private slotColor(p: Poi): string {
    if (p.sector) return SECTOR_COLOR[p.sector]
    if (p.kind === 'job') {
      const q = profile.quests.jobs[jobIndex(p.id)]
      return q ? SECTOR_COLOR[q.sector] : C.amber
    }
    switch (p.id) {
      case 'workshop': return '#ff9a2e'
      case 'circuits': return '#3cff9a'
      case 'records': return C.yellow
      default: return C.cyan
    }
  }

  private buildSlot(p: Poi, state: PlaceState, props: Parts): void {
    const color = this.slotColor(p)
    const slot: Slot = {
      poi: p, state, color, disc: null, discMat: null, beam: null, beamMat: null, screenMat: null,
      holo: null, holoMat: null, holoOn: 0, poolMat: null, mark: new Vector3(p.x, MARK_Y.station, p.z)
    }
    // Its colour on the floor of its niche (the table's in the lab).
    slot.poolMat = this.own(poolMaterial(color, 0))
    const pool = new Mesh(this.ownGeo(poolGeometry(p.kind === 'gate' ? 3.2 : 2.3)), slot.poolMat)
    const px = p.kind === 'station' && p.side !== 0 ? p.side * (HALL_HALF + NICHE_DEPTH * 0.45) : p.id === 'table' ? 0 : p.x
    pool.position.set(px, 0.03, p.id === 'table' ? p.z + 0.6 : p.z)
    pool.renderOrder = 1
    this.scene.add(pool)
    const add = (parts: Parts): void => {
      props.toon.push(...parts.toon, ...parts.plain)
      props.glow.push(...parts.glow)
    }
    const s = this.scene
    if (p.kind === 'story' || p.kind === 'gate' || p.kind === 'job') {
      add(padParts(p.x, p.z, p.kind === 'job'))
      slot.discMat = this.own(new MeshBasicMaterial({ color: new Color(color), vertexColors: true, toneMapped: false }))
      slot.disc = new Mesh(this.ownGeo(padDisc()), slot.discMat)
      slot.disc.position.set(p.x, PAD_TOP + 0.04, p.z)
      slot.beamMat = this.own(additive(color, 0))
      slot.beamMat.vertexColors = true
      slot.beam = new Mesh(this.ownGeo(beamGeometry(PAD_R - 0.18, 4.2)), slot.beamMat)
      slot.beam.position.set(p.x, PAD_TOP + 0.02, p.z)
      s.add(slot.disc, slot.beam)
      slot.mark.set(p.x, p.kind === 'gate' ? MARK_Y.gate : MARK_Y.pad, p.z)
      if (p.kind === 'story' || p.kind === 'gate') {
        const [hx, hz] = holoSpot(p)
        const em = newParts()
        em.toon.push(xform(paint(rcyl(0.5, 0.12, 0.04, 20), C.gun), [hx, 0.06, hz]))
        em.glow.push(xform(paint(torus(0.42, 0.04, 6, 28), color), [hx, 0.125, hz], [Math.PI / 2, 0, 0]))
        add(em)
      }
      if (p.kind === 'story' && p.side !== 0) {
        add(portalFrame(p.side, p.z))
        slot.screenMat = this.own(new MeshBasicMaterial({ color: new Color(color), vertexColors: true, toneMapped: false }))
        const scr = new Mesh(this.ownGeo(portalScreen()), slot.screenMat)
        scr.position.set(p.side * (HALL_HALF + NICHE_DEPTH - 0.1), 2.45, p.z)
        s.add(scr)
      }
      if (p.kind === 'gate') this.buildGateLeaves(state, add)
      if (p.kind === 'job') {
        const q = profile.quests.jobs[jobIndex(p.id)]
        if (q && state === 'open') {
          slot.holoMat = this.own(new HoloMaterial(color, 0.75))
          slot.holo = new Group()
          slot.holo.add(new Mesh(this.ownGeo(jobSign(q.template)), slot.holoMat))
          slot.holo.position.set(p.x, PAD_TOP + 0.45, p.z)
          s.add(slot.holo)
        }
      }
      if (fenced(state)) this.buildFence(p, add)
    } else if (p.id === 'hero') {
      add(buildWeaponRack(p.side as -1 | 1, p.z, WEAPON_IDS.map(id => (profile.hero.weapons.includes(id) ? WEAPONS[id].color : null))))
    } else if (p.id === 'workshop') {
      add(buildForge(p.side as -1 | 1, p.z))
      const hp = forgeHammer()
      this.hammer = new Group()
      const hm = new Mesh(this.ownGeo(merge(hp.toon)), toonVC())
      const hol = new Mesh(hm.geometry, outlineMat(0.02))
      hol.renderOrder = -1
      this.hammer.add(hm, hol, new Mesh(this.ownGeo(merge(hp.glow)), glowVC()))
      this.hammerAt.set(p.side * (HALL_HALF + NICHE_DEPTH - 1.75), 3.5, p.z + 0.55)
      this.hammer.position.copy(this.hammerAt)
      s.add(this.hammer)
    } else if (p.id === 'circuits') {
      add(buildChipLab(p.side as -1 | 1, p.z))
      this.chip = new Mesh(this.ownGeo(chipLattice()), this.own(new HoloMaterial('#3cff9a', 0.9)))
      this.chip.position.set(p.side * (HALL_HALF + NICHE_DEPTH - 1.2), 1.75, p.z - 0.3)
      s.add(this.chip)
    } else if (p.id === 'records') {
      add(buildRecords(p.side as -1 | 1, p.z, true))
      this.cup = new Mesh(this.ownGeo(trophyCup()), this.own(new HoloMaterial('#ffd84a', 0.9)))
      this.cup.position.set(p.side * (HALL_HALF + NICHE_DEPTH - 0.8), 3.75, p.z)
      s.add(this.cup)
    } else if (p.id === 'table') {
      add(buildHoloTable())
      slot.mark.set(p.x, MARK_Y.table, p.z)
    }
    // An offline station: a lock of light in its niche's mouth.
    if (p.kind === 'station' && state === 'locked') {
      slot.holoMat = this.own(new HoloMaterial('#9fb8e6', 0.55))
      slot.holo = new Group()
      slot.holo.add(new Mesh(this.ownGeo(lockSign()), slot.holoMat))
      slot.holo.position.set(p.side * (HALL_HALF + 0.9), 2.2, p.z)
      slot.holo.rotation.y = p.yaw
      s.add(slot.holo)
    }
    this.slots.push(slot)
  }

  /** A locked niche's fence: two emitters and four red beams across its mouth. */
  private buildFence(p: Poi, add: (parts: Parts) => void): void {
    const f = fenceOf(p)
    if (!f) return
    const parts = newParts()
    const len = Math.hypot(f.bx - f.ax, f.bz - f.az)
    const yaw = Math.atan2(f.bx - f.ax, f.bz - f.az)
    for (const [x, z] of [[f.ax, f.az], [f.bx, f.bz]] as const) {
      parts.toon.push(xform(paint(rcyl(0.16, 2.5, 0.05, 10), C.gun), [x, 1.25, z]))
      parts.toon.push(xform(paint(sph(0.19, 10, 8), C.steel), [x, 2.55, z]))
    }
    add(parts)
    const beams: BufferGeometry[] = []
    const along: [number, number, number] = Math.abs(f.bx - f.ax) > Math.abs(f.bz - f.az) ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0]
    for (const y of [0.45, 0.95, 1.45, 1.95]) beams.push(xform(cap(0.025, len - 0.3, 6, 1), [(f.ax + f.bx) / 2, y, (f.az + f.bz) / 2], along))
    const sheet = xform(new PlaneGeometry(len - 0.3, 2.1), [(f.ax + f.bx) / 2, 1.2, (f.az + f.bz) / 2], [0, yaw + Math.PI / 2, 0])
    sheet.deleteAttribute('uv')
    const m = new Mesh(this.ownGeo(merge(beams.map(b => { b.deleteAttribute('uv'); return b }))), this.fenceMat)
    const sh = new Mesh(this.ownGeo(sheet), this.own(additive('#ff2d3f', 0.07, DoubleSide)))
    this.scene.add(m, sh)
  }

  private buildGateLeaves(state: PlaceState, add: (parts: Parts) => void): void {
    add(buildGate())
    for (const s of [-1, 1] as const) {
      const lp = gateLeaf(s)
      const g = new Group()
      const lm = new Mesh(this.ownGeo(merge(lp.toon)), toonVC())
      const lol = new Mesh(lm.geometry, outlineMat(0.02))
      lol.renderOrder = -1
      g.add(lm, lol, new Mesh(this.ownGeo(merge(lp.glow)), glowVC()))
      g.position.set(s * (GATE_PYLON_X - 0.5), 0, GATE_LEAF_Z)
      g.userData.side = s
      this.scene.add(g)
      this.gateLeaves.push(g)
    }
    this.gateOpen = state === 'locked' ? 0 : 0.02
  }

  /** The trophy case (the Masters' cores), a thing to look at. */
  private buildDecor(props: Parts): void {
    const cores = SECTORS.filter(x => x.id !== 'fortress').map(x => (profile.world.bosses.includes(x.boss) ? SECTOR_COLOR[x.id] : null))
    const parts = buildTrophies(TROPHY_SPOT.side, TROPHY_SPOT.z, cores)
    props.toon.push(...parts.toon)
    props.glow.push(...parts.glow)
    // Without a live board the records terminal stands dark, a thing to look at.
    if (!this.places.some(p => p.id === 'records')) {
      const r = POI_BY_ID.records
      const dark = buildRecords(r.side as -1 | 1, r.z, false)
      props.toon.push(...dark.toon)
      props.glow.push(...dark.glow)
    }
  }

  /** Walls: the hall's, and every fence that is up (and the open gate's leaves). */
  private syncWalls(): void {
    const out: Seg[] = [...WALLS]
    for (const sl of this.slots) {
      if (!fenced(sl.state)) continue
      const f = fenceOf(sl.poi)
      if (f) out.push(f)
    }
    const gate = this.slots.find(sl => sl.poi.kind === 'gate')
    if (gate && !fenced(gate.state)) out.push(...openGateWalls())
    this.walls = out
  }

  private addHolograms(m: typeof import('../models/hubHolo')): void {
    if (this.disposed) return
    for (const sl of this.slots) {
      if ((sl.poi.kind !== 'story' && sl.poi.kind !== 'gate') || !sl.poi.sector) continue
      const boss = SECTOR_BY_ID[sl.poi.sector].boss as BossId
      const tint = sl.state === 'locked' ? '#ff2d3f'
        : sl.state === 'cleared' ? new Color(sl.color).lerp(new Color(CLEARED), 0.55).getStyle()
          : new Color(sl.color).lerp(new Color('#ffffff'), 0.3).getStyle()
      const h = m.buildMasterHolo(boss, tint, sl.poi.kind === 'gate' ? HOLO_H * 1.5 : HOLO_H)
      this.owned.push({ mat: h.mat })
      const [hx, hz] = holoSpot(sl.poi)
      h.root.position.set(hx, HOLO_LIFT, hz)
      h.root.rotation.y = sl.poi.yaw
      this.scene.add(h.root)
      sl.holo = h.root
      sl.holoMat = h.mat
      sl.holoOn = 0
    }
    this.valley = m.buildValleyHolo(sceneQuality() === 'low')
    this.valley.root.scale.setScalar(0.0001)
    this.valley.root.position.set(0, 1.18, TABLE_Z)
    this.scene.add(this.valley.root)
  }

  // ─── Where he turns up ─────────────────────────────────────────────────────

  private spawn(): Spawn {
    const a = this.arrival
    if (a.kind === 'brief') return { x: BRIEF_SPOT.x, z: BRIEF_SPOT.z, yaw: BRIEF_SPOT.yaw }
    if (a.kind === 'pad') {
      const p = this.places.find(q => q.id === a.id)
      if (p) return spawnOnPad(p)
    }
    return HOME_PAD
  }

  /** The heading along the hall toward the next mission (or the lab). */
  private onwardYaw(z: number): number {
    const next = this.nextStory ? this.places.find(p => p.sector === this.nextStory) : null
    return next && next.az < z - 1 ? Math.PI : 0
  }

  // ─── The player's side ─────────────────────────────────────────────────────

  /** The slot Flux stands at. */
  private slotOf(id: PoiId | ''): Slot | null {
    return id ? this.slots.find(s => s.poi.id === id) ?? null : null
  }

  /** The state of a place now ('' when this build has no such place). */
  stateOf(id: PoiId): PlaceState | '' {
    return this.slotOf(id)?.state ?? ''
  }

  /** Free to walk: no panel, no modal, no film, no beam. */
  private get free(): boolean {
    return this.act === 'walk' && hubTab.value === 'missions' && !flow.modal && !isAnyModalOpen.value &&
      !hubDialog.open && !hubSceneUi.active
  }

  /**
   * E, Enter, B or the prompt's button: use the place Flux stands at — open
   * its panel, deploy from its pad, replay the briefing. A locked one says
   * no (the marker shows why).
   */
  interact(): void {
    if (this.act !== 'walk') return
    const sl = this.slotOf(hubUi.near)
    if (!sl) return
    const p = sl.poi
    if (sl.state === 'locked') {
      sfx('denied')
      return
    }
    if (p.kind === 'station') {
      if (p.id === 'table') {
        const plan = briefingToReplay()
        if (plan) {
          sfx('uiOpen')
          void startDebrief(plan)
        }
        return
      }
      if (p.id === 'records') {
        hubDialog.board = true
        sfx('uiOpen')
        return
      }
      if (hubTab.value !== p.id) sfx('uiOpen')
      hubTab.value = p.id as HubTab
      return
    }
    const q = padQuest(p.id)
    if (q && deployable(sl.state)) this.deploy(q)
  }

  /** A tap on a place's marker: walk there, and use it on arrival (`open`). */
  goTo(id: PoiId, open = true): void {
    const p = this.places.find(q => q.id === id)
    if (!p || this.act !== 'walk') return
    // A station opens on arrival; a pedestal shows its card (Deploy is the
    // player's own press, never a side effect of walking up).
    const use = open && p.kind === 'station'
    if (hubUi.near === id) {
      if (use) this.interact()
      return
    }
    // On arrival he faces the place itself (into its niche, at the table, at the gate).
    walkRoute(this.walker, routeTo(this.walker.x, this.walker.z, p), p.yaw + Math.PI)
    this.goal = { id, open: use }
    hubUi.walkingTo = id
    sfx('uiClick')
  }

  /** Beam out from the pad Flux stands on, into its mission. */
  deploy(q: Quest): void {
    const sl = this.slotOf(hubUi.near)
    if (!sl || this.act !== 'walk' || flow.loading) return
    this.beamQuest = q
    this.beamSlot = sl
    this.act = 'beam'
    this.actT = 0
    this.beamed = false
    hubUi.cine = true
    this.walker.route = []
    saveProfile()
    sfx('beamOut')
    boardClosed()
  }

  /** The station's panel closed: back to the hall, the camera behind him. */
  private panelClosed(): void {
    // Facing along the hall, whichever way the camera was nearer to.
    const along = Math.abs(angDiff(0, this.camYaw)) < Math.PI / 2 ? 0 : Math.PI
    this.camAim = along
    this.walker.endYaw = along
  }

  /** The board changed (a reroll): each job pad takes its job's colour and sign. */
  refreshJobs(): void {
    const inputs = this.placeInputs()
    for (const sl of this.slots) {
      if (sl.poi.kind !== 'job') continue
      sl.state = placeState(sl.poi, inputs)
      sl.color = this.slotColor(sl.poi)
      const q = profile.quests.jobs[jobIndex(sl.poi.id)]
      if (sl.holo) {
        sl.holo.removeFromParent()
        sl.holo = null
      }
      if (q && sl.state === 'open') {
        sl.holoMat ??= this.own(new HoloMaterial(sl.color, 0.75))
        sl.holoMat.tint.set(sl.color)
        sl.holo = new Group()
        sl.holo.add(new Mesh(this.ownGeo(jobSign(q.template)), sl.holoMat))
        sl.holo.position.set(sl.poi.x, PAD_TOP + 0.45, sl.poi.z)
        this.scene.add(sl.holo)
        this.fx.riseRing(sl.poi.x, PAD_TOP + 0.1, sl.poi.z, sl.color, 0.9, 20)
      }
    }
    for (const pl of hubUi.places) {
      const sl = this.slotOf(pl.id)
      if (sl) pl.state = sl.state
    }
  }

  /** Rebuild Flux in his current gear colours (after equipping). */
  refreshHero(): void {
    this.heroRoot.remove(this.hero.root)
    this.hero.mesh.geometry.dispose()
    this.hero = buildHero(heroColors())
    this.heroRoot.add(this.hero.root)
    this.fx.riseRing(this.walker.x, 0.4, this.walker.z, '#7ff4ff', 0.8, 18)
  }

  /** A little cheer (level up, an upgrade). */
  celebrate(): void {
    this.victoryT = 0
    this.fx.riseRing(this.walker.x, 0.4, this.walker.z, '#ffd84a', 0.9, 26)
  }

  enter(): void {
    boardOpened()
  }

  // ─── The step ──────────────────────────────────────────────────────────────

  private wasPanel = false

  update(dt: number, first: boolean): void {
    this.t += dt
    this.actT += dt
    const inp = this.input
    const w = this.walker
    this.prevX = w.x
    this.prevZ = w.z
    this.prevYaw = w.yaw
    if (hud.device !== inp.device) hud.device = inp.device
    if (this.victoryT >= 0) {
      this.victoryT += dt
      if (this.victoryT > 2.4) this.victoryT = -1
    }
    this.stepAct(dt)
    const panel = hubTab.value !== 'missions'
    if (this.wasPanel && !panel) this.panelClosed()
    this.wasPanel = panel
    stepWalker(w, {
      moveX: inp.moveX, moveY: inp.moveY, camYaw: this.camYaw, free: this.free || (this.act === 'land' && this.actT > LAND_FREE && !panel),
      funnel: DOOR_FUNNEL
    }, dt, this.walls, POSTS)
    // At a station's panel he turns to the camera; on arrival, to the place.
    if (panel) w.yaw += angDiff(this.panelFacing(), w.yaw) * Math.min(1, dt * 6)
    if (w.cancelled) {
      this.goal = null
      hubUi.walkingTo = ''
    }
    if (this.stepping && (w.arrived || w.cancelled || !w.route.length)) {
      this.stepping = false
      hubUi.cine = false
    }
    // Where he stands.
    const at = poiAt(w.x, w.z, this.places)
    const near = at && (at.kind === 'station' || zoneAt(w.x, w.z) === 'niche' || at.kind === 'gate') ? at.id : ''
    if (near !== hubUi.near) hubUi.near = near
    let locked: PoiId | '' = ''
    for (const sl of this.slots) {
      if (!fenced(sl.state)) continue
      const f = fenceOf(sl.poi)
      if (f && Math.hypot(w.x - (f.ax + f.bx) / 2, w.z - (f.az + f.bz) / 2) < 2.6) locked = sl.poi.id
    }
    if (locked !== hubUi.nearLocked) hubUi.nearLocked = locked
    // Atlas on a sector as Flux reaches its pedestal (#117's lines, the board's).
    const story = this.slotOf(near || locked)
    const sid = story?.poi.sector
    if ((near || locked) !== this.atlasFor) {
      this.atlasFor = near || locked
      if (sid && this.act === 'walk') sectorSelected(sid)
    }
    if (w.arrived && this.goal) {
      const g = this.goal
      this.goal = null
      hubUi.walkingTo = ''
      if (g.open && hubUi.near === g.id) this.interact()
    }
    if (first) {
      if (this.act === 'walk' && !panel && !flow.modal && !hubDialog.open) {
        if (inp.interactQueued) this.interact()
        else if (inp.beamQueued && this.slotOf(hubUi.near)?.poi.kind !== 'station') this.interact()
      }
      consumeEdges(inp)
    }
    this.stepPlaces(dt)
    setHoloTime(this.t)
    this.fx.update(dt)
  }

  private stepAct(dt: number): void {
    const w = this.walker
    if (this.act === 'land') {
      const onPad = this.arrival.kind === 'pad'
      if (!onPad && this.actT >= LAND_FREE && hubUi.cine) hubUi.cine = false
      // Home: the camera finishes its swing round behind him.
      if (!onPad && this.actT >= LAND_T) this.camAim = w.yaw
      if (this.actT >= LAND_T) {
        this.act = 'walk'
        // Back on a pedestal: a step out to the walkway, turned along the hall
        // (the film until he stands there; a push on the stick ends it).
        const p = onPad ? this.places.find(q => q.id === (this.arrival as { id: string }).id) : null
        if (p && p.side !== 0 && Math.hypot(this.input.moveX, this.input.moveY) < 0.12) {
          walkRoute(w, [[p.side * (HALL_HALF - 1.4), p.az]], this.onwardYaw(p.az))
          this.camAim = this.onwardYaw(p.az)
          this.stepping = true
        } else {
          if (p) this.camAim = p.yaw
          hubUi.cine = false
        }
      }
    } else if (this.act === 'brief') {
      // The briefing's end: he looks at the table a moment, turns to the door,
      // and takes a few steps toward it (the camera off the table behind him).
      if (this.actT > BRIEF_HOLD) w.endYaw = 0
      if (this.actT > BRIEF_HOLD + BRIEF_TURN) {
        this.act = 'walk'
        this.camYaw = 0
        walkRoute(w, [[0, 1.1]], 0)
        this.stepping = true
      }
    } else if (this.act === 'beam') {
      const sl = this.beamSlot
      if (sl) {
        // Onto the pad's middle, facing the hall.
        w.x += (sl.poi.ax - w.x) * Math.min(1, dt * 8)
        w.z += (sl.poi.az - w.z) * Math.min(1, dt * 8)
        w.yaw += angDiff(sl.poi.side === 0 ? Math.PI : sl.poi.yaw, w.yaw) * Math.min(1, dt * 6)
      }
      if (this.actT >= BEAM_T && !this.beamed) {
        this.beamed = true
        const q = this.beamQuest
        const id = this.beamSlot?.poi.id
        if (q && id) void deployFromPad(id, q)
      }
    }
  }

  /** Where Flux faces while a panel is open: at the camera, out of his niche. */
  private panelFacing(): number {
    const sl = this.slotOf(hubTab.value as PoiId)
    if (sl && sl.poi.side !== 0) return sl.poi.yaw
    return Math.atan2(this.camPos.x - this.walker.x, this.camPos.z - this.walker.z)
  }

  /** Per step: the places' lights and moving parts. */
  private stepPlaces(dt: number): void {
    const t = this.t
    const w = this.walker
    for (const sl of this.slots) {
      const p = sl.poi
      const st = sl.state
      const pulse = 0.5 + 0.5 * Math.sin(t * 2.6 + p.z * 0.3)
      const here = hubUi.near === p.id
      if (sl.poolMat) {
        const k = st === 'next' ? 0.62 + 0.18 * pulse : st === 'open' ? 0.45 : st === 'cleared' ? 0.3 : st === 'empty' ? 0.08 : 0.16
        sl.poolMat.opacity = Math.min(1, k + (here ? 0.15 : 0))
        if (st === 'locked' && p.kind !== 'station') sl.poolMat.color.set('#ff2d3f')
        else if (st === 'cleared') sl.poolMat.color.set(CLEARED)
      }
      if (sl.discMat) {
        const c = st === 'locked' ? '#3a1a24' : st === 'cleared' ? CLEARED : st === 'empty' ? '#2a3352' : sl.color
        sl.discMat.color.set(c).multiplyScalar(st === 'next' ? 0.75 + 0.25 * pulse : st === 'locked' ? 0.7 : 0.85)
      }
      if (sl.beamMat && sl.beam) {
        const want = st === 'next' ? 0.42 + 0.18 * pulse : st === 'open' ? (p.kind === 'job' ? 0.22 : 0.3) : st === 'cleared' ? 0.1 : 0
        const lit = this.beamSlot === sl ? Math.min(1, this.actT / 0.35) : 0
        sl.beamMat.opacity = Math.min(1, want + (here ? 0.15 : 0) + lit)
        if (st === 'cleared') sl.beamMat.color.set(CLEARED)
        sl.beam.visible = sl.beamMat.opacity > 0.01
        sl.beam.scale.set(1 + lit * 0.4, 1 + lit * 0.6, 1 + lit * 0.4)
      }
      if (sl.screenMat) {
        const k = st === 'next' ? 0.8 + 0.2 * pulse : st === 'cleared' ? 0.5 : st === 'open' ? 0.65 : 0.5
        sl.screenMat.color.set(st === 'locked' ? '#5a0f1c' : sl.color).multiplyScalar(k)
      }
      if (sl.holo && sl.holoMat) {
        sl.holoOn = Math.min(1, sl.holoOn + dt * 1.6)
        const flick = Math.random() < (st === 'locked' ? 0.08 : 0.02) ? 0.45 : 1
        const base = p.kind === 'station' ? 0.6 : st === 'locked' ? 0.3 : st === 'cleared' ? 0.6 : st === 'next' ? 1 : 0.85
        sl.holoMat.alpha = base * sl.holoOn * flick * (0.92 + 0.08 * Math.sin(t * 23 + p.z))
        if (p.kind === 'station') {
          sl.holo.position.y = 2.2 + Math.sin(t * 1.6) * 0.06
        } else if (p.kind === 'job') {
          sl.holo.rotation.y += dt * 0.9
          sl.holo.position.y = PAD_TOP + 0.45 + Math.sin(t * 1.4 + p.z) * 0.08
        } else {
          // A Master turns slowly on its pedestal, unfolding upward as it lights.
          sl.holo.rotation.y = p.yaw + Math.sin(t * 0.5 + p.z) * 0.6
          sl.holo.scale.set(1, Math.max(0.01, smooth(0, 1, sl.holoOn)), 1)
          const [hx] = holoSpot(p)
          sl.holo.position.y = HOLO_LIFT + Math.sin(t * 1.2 + p.z) * 0.05
          if (st === 'locked' && Math.random() < 0.05) sl.holo.position.x = hx + (Math.random() - 0.5) * 0.1
          else sl.holo.position.x = hx
        }
      }
      // The next mission's pad breathes light motes up its column.
      if (st === 'next' && Math.random() < dt * 8) {
        const a = Math.random() * Math.PI * 2
        this.fx.emit({ x: p.x + Math.cos(a) * 0.8, y: PAD_TOP + 0.1, z: p.z + Math.sin(a) * 0.8, vy: 1 + Math.random() * 1.2, color: sl.color, size: 0.14, sizeEnd: 0.02, life: 1.6 })
      }
    }
    // The door's curtain parts as he comes near.
    const dd = Math.hypot(w.x, w.z - DOOR_CURTAIN.z)
    this.doorMat.opacity = (0.06 + 0.3 * smooth(2.2, 4.6, dd)) * (0.9 + 0.1 * Math.sin(t * 17))
    this.fenceMat.opacity = 0.6 + 0.3 * Math.sin(t * 9)
    // The forge: the hammer rises, holds, strikes; sparks and a ring.
    if (this.hammer) {
      this.hammerT = (this.hammerT + dt) % 3.4
      const h = this.hammerT
      const up = h < 1.6 ? smooth(0, 1.6, h) : h < 2.5 ? 1 : 1 - smooth(2.5, 2.66, h)
      const side = this.hammerAt.x > 0 ? 1 : -1
      this.hammer.rotation.z = -side * up * 1.0
      if (h >= 2.66 && h - dt < 2.66) {
        const ax = this.hammerAt.x
        const az = this.hammerAt.z
        this.fx.sparks(ax, 1.08, az, '#ffb04a', 14, 5, 0.12)
        const d = Math.hypot(w.x - ax, w.z - az)
        if (d < 11 && hubTab.value === 'missions') sfx('tink', 0, Math.max(0.15, 1 - d / 11) * 0.7)
      }
    }
    if (this.chip) {
      this.chip.rotation.y += dt * 0.7
      this.chip.position.y = 1.75 + Math.sin(this.t * 1.3) * 0.06
    }
    if (this.cup) this.cup.rotation.y += dt * 0.8
    // The gate: its leaves swing open once the Fortress is, as Flux comes up the hall.
    if (this.gateLeaves.length) {
      const gate = this.slots.find(sl => sl.poi.kind === 'gate')
      const want = gate && !fenced(gate.state) && w.z > HALL_END - 16 ? 1 : 0
      const before = this.gateOpen
      this.gateOpen += (want - this.gateOpen) * Math.min(1, dt * 1.2)
      if (before < 0.05 && this.gateOpen >= 0.05) sfx('door')
      for (const g of this.gateLeaves) g.rotation.y = (g.userData.side as number) * smooth(0, 1, this.gateOpen) * -1.45
    }
    // The briefing table's valley: the story so far, the next target pulsing.
    if (this.valley) {
      const inLab = zoneAt(w.x, w.z) === 'lab' || this.act === 'brief'
      this.valleyOn = Math.max(0, Math.min(1, this.valleyOn + (inLab ? dt : -dt) * 1.5))
      this.valley.root.visible = this.valleyOn > 0.01
      if (this.valley.root.visible) {
        this.valley.root.scale.set(0.08, 0.08 * smooth(0, 1, this.valleyOn), 0.08)
        this.valley.root.rotation.y = this.t * 0.08
        this.valley.animate(this.t)
        this.valley.setHolo(this.t, 0)
        this.valley.setProgress(this.freed, null, this.nextStory, this.t)
      }
    }
    // Motes drifting in the lamplight round the camera.
    if (Math.random() < dt * 5) {
      const c = this.camPos
      this.fx.emit({ x: c.x + (Math.random() - 0.5) * 10, y: 0.5 + Math.random() * 4, z: c.z + 2 + Math.random() * 10, vy: 0.08, vx: (Math.random() - 0.5) * 0.2, color: '#9fdcff', size: 0.06, sizeEnd: 0.02, life: 4 })
    }
  }

  // ─── Drawing ───────────────────────────────────────────────────────────────

  private applyLook(dt: number): void {
    const inp = this.input
    if (inp.lookDX || inp.lookDY) {
      if (this.act === 'walk' && hubTab.value === 'missions' && !hubDialog.open) {
        const s = inp.device === 'touch' ? LOOK_TOUCH : LOOK_MOUSE
        this.camYaw -= inp.lookDX * s
        this.camPitch = Math.max(PITCH_LO, Math.min(PITCH_HI, this.camPitch + inp.lookDY * s * 0.6))
        this.lastLook = this.t
        this.camAim = null
      }
      inp.lookDX = 0
      inp.lookDY = 0
    }
    if (inp.turn && this.act === 'walk' && hubTab.value === 'missions') {
      this.camYaw -= inp.turn * TURN_RATE * Math.min(dt, 0.05)
      this.lastLook = this.t
      this.camAim = null
    }
  }

  render(alpha: number, dt: number): void {
    this.applyLook(dt)
    const w = this.walker
    const x = this.prevX + (w.x - this.prevX) * alpha
    const z = this.prevZ + (w.z - this.prevZ) * alpha
    const yaw = this.prevYaw + angDiff(w.yaw, this.prevYaw) * alpha
    this.poseHero(x, z, yaw, dt)
    this.posePip(x, z, yaw, dt)
    if (this.gauss) {
      this.gaussPose.look = Math.sin(this.t * 0.3) > 0.6 ? 0.5 : 0
      poseGauss(this.gauss, this.gaussPose, this.t)
    }
    this.homePad.ring.rotation.y += dt * 0.5
    this.frame(x, z, yaw, dt)
    this.trail.update(dt, this.act === 'walk' && hubTab.value === 'missions' && !hubDialog.open, x, z, this.trailTarget(), this.t)
    this.writeMarks(x, z)
    const r = getRenderer()
    r.setRenderTarget(null)
    r.clear()
    r.render(this.scene, this.camera)
    tickHud(dt)
  }

  /** Where the trail leads: the tour's station, else the next mission. */
  private trailTarget(): Poi | null {
    if (hubUi.walkingTo) return this.places.find(p => p.id === hubUi.walkingTo) ?? null
    if (hubLesson.step === 'workshop') return POI_BY_ID.workshop
    const id = this.nextStory ? `story:${this.nextStory}` : null
    return id ? this.places.find(p => p.id === id) ?? null : null
  }

  private poseHero(x: number, z: number, yaw: number, dt: number): void {
    const w = this.walker
    const R = this.hero
    const m = this.motion
    // The gait: phase advanced by the ground covered.
    const sp = Math.hypot(w.vx, w.vz)
    m.walk = w.stride
    m.stride += (sp * dt * Math.PI * 2) / cycleLen(HUB_GAIT, HUB_GAIT.A * Math.min(1, w.stride / 0.35 + 0.001))
    m.phase = m.stride
    if (this.victoryT >= 0 && w.stride < 0.05) animateHeroVictory(R, this.victoryT)
    else if (w.stride > 0.03) animateHeroWalk(R, m, this.t, HUB_GAIT)
    else animateHeroIdle(R, this.t)
    this.heroRoot.position.set(x, 0.0 + this.padLift(x, z), z)
    this.heroRoot.rotation.set(0.12 * w.stride, yaw, 0)
    this.heroRoot.scale.set(1, 1, 1)
    this.heroRoot.visible = true
    // The landing and the beam-out: a column of light that pulls him in or out.
    if (this.act === 'land' && this.arrival.kind !== 'brief') {
      const k = 1 - smooth(0.15, 0.7, this.actT)
      this.heroRoot.scale.set(1 - k * 0.92, 1 + k * 0.9, 1 - k * 0.92)
      this.heroRoot.position.y += k * 0.6
      this.heroRoot.visible = this.actT > 0.08
      if (this.actT < 0.2 && this.actT + dt >= 0.12) {
        sfx('beamIn')
        this.fx.riseRing(x, 0.4, z, '#7ff4ff', 1.0, 28)
      }
      const pad = this.arrival.kind === 'pad' ? this.slotOf(this.arrival.id as PoiId) : null
      if (pad?.beamMat) pad.beamMat.opacity = Math.max(pad.beamMat.opacity, 1 - smooth(0.4, LAND_T, this.actT))
      if (!pad) (this.homePad.ringMat as MeshBasicMaterial).opacity = 0.12 + 0.75 * (1 - smooth(0.35, LAND_T, this.actT))
    } else if (this.act === 'beam') {
      const k = smooth(0.25, BEAM_T * 0.92, this.actT)
      this.heroRoot.scale.set(1 - k * 0.94, 1 + k * 1.1, 1 - k * 0.94)
      this.heroRoot.position.y += k * 1.4
      this.heroRoot.visible = k < 0.98
      if (this.actT < 0.3 && Math.random() < 0.6) this.fx.emit({ x: x + (Math.random() - 0.5) * 1.4, y: 0.4, z: z + (Math.random() - 0.5) * 1.4, vy: 3 + Math.random() * 2, color: this.beamSlot?.color ?? '#7ff4ff', size: 0.16, sizeEnd: 0.02, life: 0.9 })
    } else {
      (this.homePad.ringMat as MeshBasicMaterial).opacity = 0.12
    }
    this.shadow.position.set(x, 0.02 + this.padLift(x, z), z)
    this.shadow.visible = this.heroRoot.visible
  }

  /** On a pad he stands on its plinth. */
  private padLift(x: number, z: number): number {
    for (const sl of this.slots) {
      if (!sl.disc) continue
      if (Math.hypot(x - sl.poi.x, z - sl.poi.z) < PAD_R + 0.12) return PAD_TOP
    }
    return Math.hypot(x, z) < 1.05 ? 0.3 : 0
  }

  private posePip(x: number, z: number, yaw: number, dt: number): void {
    // Pip hovers by Flux's left shoulder (clear of the cannon), a little ahead
    // of him; at a station's panel, beside him in the shot instead.
    const lx = Math.cos(yaw)
    const lz = -Math.sin(yaw)
    const ahead = hubTab.value !== 'missions' ? -0.25 : 0.55
    const out = hubTab.value !== 'missions' ? 1.05 : 0.85
    _v.set(x + lx * out + Math.sin(yaw) * ahead, 1.95 + Math.sin(this.t * 1.7) * 0.1, z + lz * out + Math.cos(yaw) * ahead)
    if (this.act === 'beam') _v.y += 0.6
    this.pipAt.lerp(_v, Math.min(1, dt * 3.2))
    this.pipRoot.position.copy(this.pipAt)
    // He looks where Flux looks; at a panel or with supplies, at the camera.
    const atCam = hubTab.value !== 'missions' || hubUi.pipReady || hubDialog.open
    const want = atCam ? Math.atan2(this.camPos.x - this.pipAt.x, this.camPos.z - this.pipAt.z) : yaw
    this.pipRoot.rotation.y += angDiff(want, this.pipRoot.rotation.y) * Math.min(1, dt * 4)
    animatePip(this.pip, this.t)
  }

  /** The camera: behind him, a station's framing, or a film moment. */
  private frame(x: number, z: number, yaw: number, dt: number): void {
    const cam = this.camera
    const panel = hubTab.value !== 'missions'
    this.panelK = Math.max(0, Math.min(1, this.panelK + (panel ? dt * 2.6 : -dt * 3)))
    // Chase: the camera trails round behind him as he walks (not while the
    // player steers it, and never swinging round to face him).
    const steering = this.t - this.lastLook < FOLLOW_YIELD
    const w = this.walker
    if (this.act === 'brief') {
      // Over his shoulder at the table, then round with him to the door.
      const k = smooth(BRIEF_HOLD, BRIEF_HOLD + BRIEF_TURN, this.actT)
      this.camYaw = BRIEF_SPOT.yaw + angDiff(0, BRIEF_SPOT.yaw) * k
    } else if (this.act === 'land') {
      // Home: from his front round to behind him. On a pedestal the shot
      // holds on him as he beams in.
      if (this.arrival.kind !== 'pad') this.camYaw += angDiff(yaw, this.camYaw) * Math.min(1, dt * (this.actT > 0.5 ? 2.2 : 0.4))
    } else if (this.camAim !== null && !panel) {
      const d = angDiff(this.camAim, this.camYaw)
      this.camYaw += d * Math.min(1, dt * 2.4)
      if (Math.abs(d) < 0.02) this.camAim = null
    } else if (!steering && w.stride > 0.2 && !panel) {
      const d = angDiff(yaw, this.camYaw)
      if (Math.abs(d) < Math.PI * 0.6) this.camYaw += d * Math.min(1, dt * FOLLOW_RATE * w.stride)
    }
    const pitch = this.act === 'beam' ? CAM_PITCH + 0.12 * smooth(0, BEAM_T, this.actT) : this.camPitch
    const cy = Math.cos(pitch)
    const fx = Math.sin(this.camYaw) * cy
    const fz = Math.cos(this.camYaw) * cy
    const fy = Math.sin(pitch)
    const px = x
    const pz = z
    const py = PIVOT_H + this.padLift(x, z)
    // Kept in front of the walls: shortened at once, let out slowly.
    const want = CAM_DIST * (this.act === 'beam' ? 1 + 0.25 * smooth(0, BEAM_T, this.actT) : 1)
    const ex = px - fx * (want + 0.35)
    const ez = pz - fz * (want + 0.35)
    const hit = Math.min(rayHit(px, pz, ex, ez, this.walls), zoneAt(px, pz) === 'lab' ? rayHitPosts(px, pz, ex, ez, LAB_POSTS) : 1)
    const room = Math.max(0.9, hit * (want + 0.35) - 0.35)
    this.camDist = room < this.camDist ? room : this.camDist + (room - this.camDist) * Math.min(1, dt * 2.5)
    const d = Math.min(this.camDist, room)
    _v.set(px - fx * d, py - fy * d + 0.35, pz - fz * d)
    _w.set(px, py, pz)
    // A station's panel: Flux framed beside it, as the old lab framed him.
    if (this.panelK > 0) {
      const k = smooth(0, 1, this.panelK)
      const portrait = cam.aspect < 1
      const f = this.panelFacing()
      const ffx = Math.sin(f)
      const ffz = Math.cos(f)
      const lx = -ffz
      const lz = ffx
      const back = portrait ? 6.4 : 5.2
      const side = portrait ? 0 : 1.55
      const pX = x + ffx * back + lx * side
      const pZ = z + ffz * back + lz * side
      const hit2 = rayHit(x, z, pX, pZ, this.walls)
      const pk = Math.max(0.35, hit2 - 0.05)
      _v.lerp(_s3.set(x + (pX - x) * pk, portrait ? 1.3 : 1.5, z + (pZ - z) * pk), k)
      _w.lerp(_s3.set(x + lx * (portrait ? 0 : 1.6) * pk, portrait ? -0.55 : 1.0, z + lz * (portrait ? 0 : 1.6) * pk), k)
    }
    this.camPos.copy(_v)
    this.camLook.copy(_w)
    cam.position.copy(_v)
    cam.lookAt(_w)
    const portrait = cam.aspect < 1
    const walkFov = portrait ? Math.min(82, 56 / Math.max(0.55, cam.aspect)) : 55
    const panelFov = portrait ? 46 : 38
    cam.fov = walkFov + (panelFov - walkFov) * smooth(0, 1, this.panelK)
    cam.updateProjectionMatrix()
    cam.updateMatrixWorld()
  }

  /** Every marker's spot on screen, for the hub's labels (`HubMarkers.vue`). */
  private writeMarks(x: number, z: number): void {
    const cam = this.camera
    const vw = getRenderer().domElement.clientWidth || 1
    const vh = getRenderer().domElement.clientHeight || 1
    const inLab = zoneAt(x, z) === 'lab'
    const pinned = this.trailTarget()?.id
    for (const sl of this.slots) {
      const p = sl.poi
      const dist = Math.hypot(p.tx - x, p.tz - z)
      const sameSide = p.id === 'table' ? inLab : !inLab
      let a = sameSide ? 1 - smooth(MARK_NEAR - MARK_FADE, MARK_NEAR, dist) : 0
      if (p.id === pinned) a = Math.max(a, 1)
      this.placeMark(p.id, sl.mark, dist, a, cam, vw, vh)
    }
    _v.copy(this.pipRoot.position)
    _v.y += 0.55
    this.placeMark('pip', _v, 0, 1, cam, vw, vh)
  }

  private placeMark(id: string, at: Vector3, dist: number, alpha: number, cam: PerspectiveCamera, vw: number, vh: number): void {
    let m = hubMarks.get(id)
    if (!m) {
      m = { x: 0, y: 0, onScreen: false, dist: 0, alpha: 0 }
      hubMarks.set(id, m)
    }
    _s3.copy(at).project(cam)
    // Behind the camera the projection mirrors: flip it, so the edge clamp
    // points the right way.
    _w.copy(at).sub(cam.position)
    const behind = _w.dot(this.camDir()) < 0
    let nx = behind ? -_s3.x : _s3.x
    let ny = behind ? -_s3.y : _s3.y
    const on = !behind && nx > -1 && nx < 1 && ny > -1 && ny < 1
    if (!on) {
      const k = 0.9 / Math.max(Math.abs(nx), Math.abs(ny), 1e-3)
      nx *= k
      ny *= k
    }
    m.x = ((nx + 1) / 2) * vw
    m.y = ((1 - ny) / 2) * vh
    m.onScreen = on
    m.dist = dist
    m.alpha = alpha
  }

  private readonly dirScratch = new Vector3()
  private camDir(): Vector3 {
    return this.camera.getWorldDirection(this.dirScratch)
  }

  resize(w: number, h: number): void {
    this.fx.setScale(h * getRenderer().getPixelRatio(), this.camera.fov)
  }

  dispose(): void {
    this.disposed = true
    boardClosed()
    this.fx.dispose()
    this.trail.dispose()
    for (const o of this.owned) {
      if ('geo' in o) o.geo.dispose()
      else o.mat.dispose()
    }
    this.scene.traverse((o) => {
      const m = o as Mesh
      // The cached hall stays for the next visit.
      if (!m.geometry || m.geometry === shellCache?.plain || m.geometry === shellCache?.toon || m.geometry === shellCache?.glow ||
        m.geometry === shellCache?.spirePlain || m.geometry === shellCache?.spireGlow) return
      m.geometry.dispose()
    })
    resetHubUi()
  }
}
