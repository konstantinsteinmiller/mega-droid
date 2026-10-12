import {
  AdditiveBlending, Color, CylinderGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, Object3D, ShaderMaterial,
  SphereGeometry, Vector3, type BufferGeometry, type Material
} from 'three'
import { CELL, type Room } from '../world/levelGen'
import { rbox, rcyl, rcone, sph, torus, xform, paint, merge, type V3 } from '../models/kit'
import { toonVC, outlineMat } from '../models/toon'
import { MASTER_COLOR } from '../data/signature'
import { BOSSES } from '../data/bosses'
import type { BossId } from '../models/bosses'
import type { WeaponId } from '../data/weapons'
import type { ParticleSpec } from '../fx/particles'
import { pushHud, hud } from '../state/hud'
import { showBanner } from '../state/banner'
import type { AtlasLine } from './atlas'
import type { ClimbBody } from './climb'
import type { StageFeature } from './stageFeatures'
import type { Enemy, Shot } from './world'
import { Drops, type DropHost } from './drops'
import { GM_HP_MUL, WEAK_SPOT_MUL, WEAKNESS_MUL } from './grandMasterTune'

export { GM_HP_MUL, WEAK_SPOT_MUL, WEAKNESS_MUL }

/**
 * ─── The Grand Master Bot (#101) ─────────────────────────────────────────────
 *
 * Vex's last card. When he falls on the Core ring he presses a big red button:
 * the Fortress rumbles, and the ten Masters' bodies drop from the sky onto the
 * Spire's roof and lock together into one giant — Drill and Tide for feet,
 * the Scrapper's chest, Volt and Magnet shoulders, Blaze and Frost arms, Gale
 * and Rotor wings, Neon's head. Then it fights, in four parts, Mega Man 2's
 * Wily Machine style: one weak spot at a time, marked by Atlas —
 *
 *   ARMS  Blaze's cannon throws fire fans, Frost's lance fires ice;
 *   FEET  the stomps send shockwaves along the floor (block them);
 *   HEAD  a laser out of its eye sweeps the roof after a glow (block it);
 *   CORE  every Master's attack, at random (the core's lens shows which).
 *
 * From the head on it also charges its own PRISM CANNON: a ring of the ten
 * Masters' colours round the cannon in its belly, then a wide beam out of the
 * lens swept across the roof.
 *
 * Every attack has a wind-up a kid can read (the arm draws back, the giant
 * crouches before it hops, the head rears and the eye flares, the body rears
 * while the cannon charges) and a kick after it. Both beams start AT their
 * emitter (the eye, the lens), worked out from the part's live transform, and
 * the hit test runs along the same line (`aimBeam`).
 *
 * It is a stage feature of the Fortress (`buildStageFeatures` order: last), so
 * its state rides in the climb's save: a reload or a "Retry from checkpoint"
 * comes back to the fight with every broken part still broken.
 */

type PartId = 'armL' | 'armR' | 'footL' | 'footR' | 'head' | 'body'

interface Part {
  id: PartId
  master: BossId
  root: Group
  /** The part's own joint (the neck, a shoulder, the hips): attacks and the
   *  idle turn it round `pivot`; its meshes hang under it. */
  pose: Group
  pivot: Vector3
  /** Its weak spot, in the giant's frame (it faces +z, toward the roof's
   *  south side, where Flux lands). */
  wx: number
  wy: number
  wz: number
  r: number
  share: number
  hp: number
  max: number
  weakTo: WeaponId | null
  gone: boolean
  fallT: number
  flash: number
  /** Where it was put together (local), and the drop's start. */
  home: [number, number, number]
}

/** The parts in the order they come off, and each phase's set. */
export const GM_PHASES: PartId[][] = [['armL', 'armR'], ['footL', 'footR'], ['head'], ['body']]
/** Shares of the giant's health. */
const SHARES: Record<PartId, number> = { armL: 0.125, armR: 0.125, footL: 0.125, footR: 0.125, head: 0.2, body: 0.3 }
const PART_OF: Record<PartId, BossId> = {
  footL: 'drillMaster', footR: 'tideMaster', body: 'scrapper', armL: 'blazeMaster', armR: 'frostMaster', head: 'neonMaster'
}
/** Each part's weak spot and its radius (the hit volume), in the giant's frame. */
const WEAK: Record<PartId, [number, number, number, number]> = {
  footL: [-1.6, 0.6, 1.2, 0.9],
  footR: [1.6, 0.6, 1.2, 0.9],
  body: [0, 5.1, 1.35, 1.0],
  armL: [-3.4, 4.2, 1.6, 0.9],
  armR: [3.4, 4.2, 1.8, 0.9],
  head: [0, 7.5, 0.85, 0.8]
}
/** Each part's joint: the ankles, the hips, the shoulders, the neck. */
const PIVOT: Record<PartId, V3> = {
  footL: [-1.6, 0, 0], footR: [1.6, 0, 0], body: [0, 3.5, 0], armL: [-2.9, 6.3, 0], armR: [2.9, 6.3, 0], head: [0, 6.85, 0]
}
/** The beams' sources (part frame): the eye, the lens of the belly cannon. */
export const GM_EYE: V3 = [0, 7.56, 1.0]
export const GM_LENS: V3 = [0, 5.1, 1.95]
/** The intro: when each beat lands (s after Vex falls). */
const T_BUTTON = 3.2
const T_RUMBLE = 3.6
const T_BLACK = 8.2
const T_JUMP = 8.6
const T_ASSEMBLE = 9.2
const DROP_EVERY = 0.8
const DROP_S = 0.5
/** Fight timing. */
const ARM_EVERY = 2.2
/** The arm draws back this long before it fires (inside ARM_EVERY). */
const ARM_TELL = 0.5
const STOMP_EVERY = 3.0
/** The crouch and the hop before a stomp lands (inside STOMP_EVERY), and
 *  the hop's height. */
const STOMP_TELL = 0.8
const STOMP_HOP = 0.9
const LASER_EVERY = 4.2
const LASER_TELL = 1.0
const LASER_SWEEP = 1.3
const PRISM_EVERY = 9
const PRISM_CHARGE = 1.5
const BODY_EVERY = 2.0
/** The lens takes the next attack's colour this long before it comes. */
const BODY_TELL = 0.6
const DEATH_S = 2.4
/** The beams: where they aim (Flux's chest at his range, then on to the
 *  floor), their half-width either side of the line (rad, the hit test) and
 *  the drawn radius (m). */
const BEAM_AIM_Y = 1.0
const LASER_WIDTH = 0.06
const PRISM_WIDTH = 0.16
const LASER_R = 0.3
const PRISM_R = 0.85
/** Seconds the glow takes to come up once it wakes. */
const POWER_UP = 0.8
/** With its feet gone it flies (#145): how low it hangs, how fast the wings
 *  unfold out of its back, and their beat. */
const HOVER_Y = -1.6
const WING_DEPLOY = 0.9
/** The wing beat round the shoulder joints: its middle and its swing either
 *  way (rad), the share of a beat the slow upstroke takes (the downstroke is
 *  the rest, faster), and beats a second hovering / busy (an attack, the
 *  catch after the drop, its death throes). */
const WING_BEAT_MID = 0.12
export const WING_BEAT_AMP = 0.52
const WING_UP_SHARE = 0.62
const WING_HZ_HOVER = 0.6
const WING_HZ_BUSY = 1.0
/** How far it bobs with each beat (up as the wings come down). */
const WING_BOB = 0.15
/** Folded: swung back along the spine (yaw) and tipped down. */
const WING_FOLD_Y = 1.35
const WING_FOLD_Z = -0.9

const FEET = ['footL', 'footR'] as const
const ORDER: PartId[] = ['footL', 'footR', 'body', 'armL', 'armR', 'head']
const ALL_MASTERS = Object.keys(MASTER_COLOR).filter(id => id !== 'vexMk1') as BossId[]
const ALL_COLORS = ALL_MASTERS.map(id => new Color(MASTER_COLOR[id]))
const DARK = '#2b2f38'
const STEEL = '#4a505c'
const CHROME = '#c9ced8'
const LENS = '#ffb04a'
const VISOR_OFF = new Color('#331020')
const VISOR_ON = new Color(MASTER_COLOR.neonMaster)
const WHITE = new Color('#ffffff')
const LENS_ON = new Color(LENS)

/** A colour `k` of the way toward dark steel (or toward white, for k < 0). */
const shade = (hex: string, k: number): Color => k >= 0 ? new Color(hex).lerp(new Color(DARK), k) : new Color(hex).lerp(WHITE, -k)

/** One part's geometry, unmerged: its toon pieces, the pieces that glow (one
 *  vertex-coloured unlit mesh a part, pulsed as one), and the eye (the visor
 *  material). Test seam: the coplanar guard runs over every piece. */
export const gmPartPieces = (id: PartId): { toon: BufferGeometry[]; glow: BufferGeometry[]; eye: BufferGeometry[] } => {
  const c = MASTER_COLOR[PART_OF[id]]
  const light = shade(c, -0.22)
  const toon: BufferGeometry[] = []
  const glow: BufferGeometry[] = []
  const eye: BufferGeometry[] = []
  const T = (g: BufferGeometry, col: string | Color, p: V3, r: V3 = [0, 0, 0]) => { toon.push(xform(paint(g, col), p, r)) }
  const G = (g: BufferGeometry, col: string | Color, p: V3, r: V3 = [0, 0, 0]) => { glow.push(xform(paint(g, col), p, r)) }
  const Z: V3 = [Math.PI / 2, 0, 0]
  switch (id) {
    case 'footL':
    case 'footR': {
      const s = id === 'footL' ? -1 : 1
      const x = s * 1.6
      // The boot, its shin plate and knee cap, the leg, the ankle pistons.
      T(rbox(1.7, 1.1, 2.1, 0.3), c, [x, 0.55, 0.1])
      T(rcyl(0.5, 2.6, 0.1), DARK, [x, 2.4, 0])
      T(rbox(0.85, 1.0, 0.45, 0.3), c, [x, 1.75, 0.45], [-0.15, 0, 0])
      T(rbox(0.75, 0.5, 0.45, 0.4), light, [x, 2.55, 0.55], [0.4, 0, 0])
      for (const k of [-1, 1]) {
        T(rcyl(0.09, 1.3, 0.03, 10), CHROME, [x + k * 0.62, 1.65, -0.15])
        T(rcyl(0.16, 0.6, 0.05, 12), STEEL, [x + k * 0.62, 2.35, -0.15])
      }
      // Bolts down the boot's outer side, a spur at the heel.
      for (const z of [-0.55, 0, 0.55]) T(sph(0.09, 8, 6), STEEL, [x + s * 0.86, 0.6, z])
      T(rcone(0.25, 0.03, 0.6), STEEL, [x, 0.45, -1.15], [-Math.PI / 2, 0, 0])
      // Toe claws either side of the front.
      for (const k of [-1, 1]) T(rcone(0.18, 0.02, 0.7), CHROME, [x + k * 0.6, 0.25, 1.3], [Math.PI / 2 + 0.25, 0, 0])
      if (s < 0) {
        // Drill: the drill bit with its collar.
        T(rcone(0.55, 0.05, 1.2), CHROME, [x, 0.55, 1.6], Z)
        T(torus(0.5, 0.1, 8, 24), STEEL, [x, 0.55, 1.08])
      } else {
        // Tide: the fin and a water jet's nozzle.
        T(rbox(0.2, 0.9, 1.3, 0.08), '#e6fbff', [x, 1.4, 0])
        T(rcyl(0.4, 0.3, 0.08), STEEL, [x, 0.55, 1.25], Z)
        G(rcyl(0.28, 0.08, 0.03), '#9ff3ff', [x, 0.55, 1.42], Z)
      }
      // A glowing ring round the ankle.
      G(torus(0.56, 0.06, 6, 24), light, [x, 1.2, 0], Z)
      break
    }
    case 'body': {
      // The torso (a shade under its plates) and the hips.
      T(rbox(4.2, 3.2, 2.5, 0.4), shade(c, 0.16), [0, 5.1, 0])
      T(rbox(3.2, 1.0, 2.2, 0.3), DARK, [0, 3.4, 0])
      // Armour: two chest plates in a V and a dark ridge between them.
      for (const s of [-1, 1]) T(rbox(1.7, 0.95, 0.45, 0.3), c, [s * 1.05, 6.15, 1.18], [-0.12, s * 0.18, -s * 0.08])
      T(rbox(0.32, 1.1, 0.4, 0.3), DARK, [0, 6.15, 1.2], [-0.12, 0, 0])
      // Rivets in the torso's corners.
      for (const sx of [-1, 1]) for (const y of [3.95, 6.4]) T(sph(0.08, 8, 6), CHROME, [sx * 1.8, y, 1.17])
      // The neck.
      T(rcyl(0.62, 0.5, 0.08), DARK, [0, 6.85, -0.1])
      // The Prism Cannon in the belly: its housing, rim, bolts (the lens is
      // its own mesh; see `build`).
      T(rcyl(0.88, 0.5, 0.12, 24), DARK, [0, 5.1, 1.32], Z)
      T(torus(0.66, 0.1, 8, 28), light, [0, 5.1, 1.6])
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 + Math.PI / 8
        T(sph(0.07, 8, 6), CHROME, [Math.cos(a) * 0.8, 5.1 + Math.sin(a) * 0.8, 1.57])
      }
      // Louvres over a glowing vent below it.
      for (const y of [3.78, 3.96, 4.14]) T(rbox(1.7, 0.12, 0.26, 0.4), DARK, [0, y, 1.3], [0.35, 0, 0])
      G(rbox(1.5, 0.5, 0.1, 0.3), '#ff6a2a', [0, 3.96, 1.27])
      // Vents down each side.
      for (const s of [-1, 1]) for (const z of [-0.45, 0, 0.45]) G(rbox(0.1, 0.85, 0.14, 0.4), '#ff6a2a', [s * 2.13, 4.95, z])
      // Shoulders: Volt's and Magnet's, each with a dark trim, two spikes
      // out and three bolts (Gale's fan and Rotor's blades: `buildWings`,
      // low on the back under the wing roots).
      for (const s of [-1, 1]) {
        const mc = MASTER_COLOR[s < 0 ? 'voltMaster' : 'magnetMaster']
        T(rbox(1.5, 1.0, 1.6, 0.35), mc, [s * 2.5, 6.5, 0])
        T(rbox(1.65, 0.3, 1.75, 0.3), DARK, [s * 2.5, 6.05, 0], [0, 0, s * 0.12])
        for (const z of [-0.42, 0.42]) T(rcone(0.2, 0.02, 0.8), STEEL, [s * 3.05, 7.0, z], [0, 0, -s * (Math.PI / 2 - 0.6)])
        for (const dx of [-0.45, 0, 0.45]) T(sph(0.07, 8, 6), CHROME, [s * 2.5 + dx, 6.5, 0.79])
      }
      T(rcone(0.25, 0.02, 0.9), '#fff6a0', [-2.6, 7.3, 0])
      T(rcone(0.18, 0.02, 0.6), '#fff6a0', [-2.15, 7.15, 0.45], [0, 0, 0.25])
      T(torus(0.45, 0.14, 6, 16, Math.PI), '#ff4f4f', [2.5, 7.1, 0])
      // Exhaust stacks on the back, glowing at the top, and spine plates.
      for (const s of [-1, 1]) {
        T(rcyl(0.26, 1.4, 0.06), DARK, [s * 0.62, 7.0, -1.45], [-0.3, 0, 0])
        const top: V3 = [s * 0.62, 7.0 + 0.7 * Math.cos(0.3), -1.45 - 0.7 * Math.sin(0.3)]
        T(torus(0.26, 0.06, 6, 18), CHROME, top, [Math.PI / 2 - 0.3, 0, 0])
        G(sph(0.2, 10, 8), '#ff8a3a', top)
      }
      for (const y of [5.0, 5.75]) T(rbox(0.9, 0.5, 0.3, 0.3), DARK, [0, y, -1.3], [0.25, 0, 0])
      break
    }
    case 'armL':
    case 'armR': {
      const s = id === 'armL' ? -1 : 1
      // The upper arm with its piston, the shoulder ball.
      const tilt = -s * 0.5
      T(rcyl(0.45, 2.4, 0.1), DARK, [s * 3.1, 5.4, 0], [0, 0, tilt])
      T(rcyl(0.1, 1.5, 0.03, 10), CHROME, [s * 3.1, 5.4, 0.5], [0, 0, tilt])
      T(rcyl(0.17, 0.7, 0.05, 12), STEEL, [s * 3.316, 5.795, 0.5], [0, 0, tilt])
      T(sph(0.5, 14, 10), STEEL, [s * 3.67, 6.45, 0])
      if (s < 0) {
        // Blaze's cannon: rear cuff, cooling fins, muzzle ring, a glowing
        // bore, and its flame on top.
        T(rcyl(0.7, 2.0, 0.15), c, [-3.4, 4.2, 0.6], Z)
        T(rcyl(0.82, 0.55, 0.12), DARK, [-3.4, 4.2, -0.3], Z)
        for (const z of [0.35, 0.65, 0.95]) T(torus(0.74, 0.07, 6, 24), DARK, [-3.4, 4.2, z])
        T(torus(0.68, 0.14, 8, 28), DARK, [-3.4, 4.2, 1.55])
        G(rcyl(0.46, 0.1, 0.03), '#ffd35a', [-3.4, 4.2, 1.63], Z)
        G(rcone(0.3, 0.02, 0.8), '#ffd35a', [-3.4, 5.0, 0.4])
      } else {
        // Frost's lance: its housing, two rings, a glowing core ring, ice.
        T(rcone(0.6, 0.05, 2.4), c, [3.4, 4.2, 1.0], Z)
        T(rcyl(0.78, 0.7, 0.12), DARK, [3.4, 4.2, -0.35], Z)
        T(torus(0.56, 0.07, 6, 24), light, [3.4, 4.2, 0.25])
        T(torus(0.42, 0.06, 6, 20), light, [3.4, 4.2, 0.8])
        T(rcone(0.25, 0.02, 0.8), '#ffffff', [3.7, 4.8, 0.6])
        G(torus(0.62, 0.05, 6, 24), '#9ff3ff', [3.4, 4.2, 0.03])
        G(rcone(0.16, 0.02, 0.6), '#bff4ff', [3.95, 4.55, 0.1], [0, 0, -0.7])
        G(rcone(0.14, 0.02, 0.5), '#bff4ff', [3.1, 4.85, -0.1], [-0.3, 0, 0.4])
      }
      break
    }
    case 'head': {
      const deep = shade(c, 0.45)
      // The skull, a crest, a V of brows over a dark visor, the jaw and its
      // grille, ears with glowing rings, horns, Neon's halo.
      T(rbox(1.7, 1.4, 1.5, 0.35), c, [0, 7.5, 0])
      T(rbox(0.14, 0.45, 1.1, 0.4), deep, [0, 8.3, -0.05])
      for (const s of [-1, 1]) T(rbox(0.95, 0.3, 0.55, 0.3), deep, [s * 0.45, 8.02, 0.62], [0.3, 0, s * 0.2])
      T(rbox(1.45, 0.42, 0.22, 0.35), DARK, [0, 7.6, 0.72])
      T(rbox(1.3, 0.48, 0.5, 0.35), DARK, [0, 7.07, 0.58])
      for (let k = 0; k < 5; k++) T(rbox(0.12, 0.34, 0.1, 0.4), CHROME, [-0.4 + k * 0.2, 7.07, 0.86])
      for (const s of [-1, 1]) {
        T(rcyl(0.3, 0.26, 0.08), DARK, [s * 0.9, 7.5, 0], [0, 0, Math.PI / 2])
        G(torus(0.2, 0.05, 6, 16), light, [s * 1.04, 7.5, 0], [0, Math.PI / 2, 0])
        T(rcone(0.26, 0.03, 1.0, 0.03), STEEL, [s * 0.82, 8.25, -0.2], [-0.35, 0, -s * 0.9])
      }
      G(torus(0.9, 0.08, 6, 32), light, [0, 8.6, 0], Z)
      // The eye: an angry slit, low in the middle, and the laser's lens.
      for (const s of [-1, 1]) eye.push(xform(paint(rbox(0.6, 0.11, 0.1, 0.4), '#ffffff'), [s * 0.34, 7.62, 0.86], [0, 0, s * 0.22]))
      eye.push(xform(paint(sph(0.13, 12, 8), '#ffffff'), [GM_EYE[0], GM_EYE[1], 0.87]))
      break
    }
  }
  return { toon, glow, eye }
}

/** The beam's look: a soft round edge (bright where it faces the eye) and
 *  bands running out along it. */
const BEAM_VERT = /* glsl */`
uniform float uLen;
varying float vAlong;
varying float vFace;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vec3 n = normalize(normalMatrix * normal);
  vFace = abs(dot(n, normalize(-mv.xyz)));
  vAlong = uv.y * uLen;
  gl_Position = projectionMatrix * mv;
}
`
const BEAM_FRAG = /* glsl */`
uniform vec3 uColor;
uniform float uAlpha;
uniform float uTime;
uniform float uSharp;
varying float vAlong;
varying float vFace;
void main() {
  float bands = 0.72 + 0.28 * sin(vAlong * 2.6 - uTime * 42.0);
  float a = pow(vFace, uSharp) * bands * uAlpha;
  gl_FragColor = vec4(uColor, a);
  #include <colorspace_fragment>
}
`

/**
 * A beam, in the giant's parent frame (the world): a white-hot core in a
 * coloured glow, both open cones from the source out along +z (so the source
 * IS the origin: nothing reaches back into the body), a flare at the source
 * and a splash where it lands, a scorch ring when that is the floor.
 */
export class GmBeam {
  readonly group = new Group()
  /** Turned (YXZ: yaw, then the pitch down) and stretched along its length. */
  readonly shaft = new Group()
  readonly core: Mesh
  readonly glow: Mesh
  readonly flare: Mesh
  readonly splash: Mesh
  readonly scorch: Mesh
  readonly origin = new Vector3()
  readonly end = new Vector3()
  private readonly coreMat: ShaderMaterial
  private readonly glowMat: ShaderMaterial
  private readonly flareMat: ShaderMaterial
  private readonly splashMat: ShaderMaterial
  private readonly scorchMat: MeshBasicMaterial
  private readonly tmp = new Color()

  constructor() {
    const mat = (sharp: number): ShaderMaterial => new ShaderMaterial({
      uniforms: { uColor: { value: new Color() }, uAlpha: { value: 1 }, uTime: { value: 0 }, uLen: { value: 1 }, uSharp: { value: sharp } },
      vertexShader: BEAM_VERT, fragmentShader: BEAM_FRAG,
      transparent: true, depthWrite: false, blending: AdditiveBlending
    })
    // Radius 1 at the source; the core narrows a little, the glow spreads.
    const cone = (rFar: number, rNear: number): CylinderGeometry => {
      const g = new CylinderGeometry(rFar, rNear, 1, 16, 1, true)
      g.translate(0, 0.5, 0)
      g.rotateX(Math.PI / 2)
      return g
    }
    this.coreMat = mat(0.7)
    this.glowMat = mat(2.4)
    this.core = new Mesh(cone(0.3, 0.42), this.coreMat)
    this.glow = new Mesh(cone(1.3, 1.0), this.glowMat)
    this.core.renderOrder = this.glow.renderOrder = 6
    this.shaft.rotation.order = 'YXZ'
    this.shaft.add(this.glow, this.core)
    // The flare and the splash: soft balls of light (bright where they face
    // the eye, gone at the rim), flickering.
    const ball = new SphereGeometry(1, 16, 12)
    this.flareMat = mat(1.6)
    this.splashMat = mat(1.6)
    this.scorchMat = new MeshBasicMaterial({ transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false, side: DoubleSide })
    this.flare = new Mesh(ball, this.flareMat)
    this.splash = new Mesh(ball, this.splashMat)
    // Flat on the floor, lifted off it (additive, no depth write: a decal).
    this.scorch = new Mesh(merge([torus(1, 0.22, 6, 32)]), this.scorchMat)
    this.scorch.rotation.x = Math.PI / 2
    for (const m of [this.flare, this.splash, this.scorch]) m.renderOrder = 6
    this.group.add(this.shaft, this.flare, this.splash, this.scorch)
    this.hide()
  }

  /** Only the flare at the source: the charge, the tell. */
  charge(o: Vector3, size: number, color: Color, alpha: number, time: number): void {
    this.group.visible = true
    this.shaft.visible = this.splash.visible = this.scorch.visible = false
    this.flare.visible = size > 0.01
    this.flare.position.copy(o)
    this.flare.scale.setScalar(size)
    this.light(this.flareMat, color, alpha, time)
  }

  /** A flare's or splash's colour and strength this frame. */
  private light(m: ShaderMaterial, color: Color, alpha: number, time: number): void {
    ;(m.uniforms.uColor!.value as Color).copy(color)
    m.uniforms.uAlpha!.value = alpha
    m.uniforms.uTime!.value = time
    m.uniforms.uLen!.value = 0
  }

  /** The beam from `o` along `yaw` / `pitch` (down) for `len` m, `r` its
   *  radius, `alpha` its strength; `floor`: it lands on the floor. A thin
   *  faint one is the tell's sight line. */
  fire(o: Vector3, yaw: number, pitch: number, len: number, r: number, color: Color, alpha: number, time: number, floor: boolean): void {
    this.group.visible = this.shaft.visible = true
    this.origin.copy(o)
    this.shaft.position.copy(o)
    this.shaft.rotation.set(pitch, yaw, 0)
    this.shaft.scale.set(r, r, len)
    const cp = Math.cos(pitch)
    this.end.set(o.x + Math.sin(yaw) * cp * len, o.y - Math.sin(pitch) * len, o.z + Math.cos(yaw) * cp * len)
    this.tmp.copy(color).lerp(WHITE, 0.65)
    this.coreMat.uniforms.uLen!.value = this.glowMat.uniforms.uLen!.value = len
    this.coreMat.uniforms.uTime!.value = this.glowMat.uniforms.uTime!.value = time
    ;(this.coreMat.uniforms.uColor!.value as Color).copy(this.tmp)
    ;(this.glowMat.uniforms.uColor!.value as Color).copy(color)
    this.coreMat.uniforms.uAlpha!.value = alpha
    this.glowMat.uniforms.uAlpha!.value = alpha * 0.8
    const flick = 1 + 0.12 * Math.sin(time * 61) + 0.08 * Math.sin(time * 23)
    const hot = alpha > 0.5
    this.flare.visible = this.splash.visible = hot
    this.flare.position.copy(o)
    this.flare.scale.setScalar(r * 2.2 * flick)
    this.light(this.flareMat, this.tmp, alpha, time)
    this.splash.position.copy(this.end)
    this.splash.scale.setScalar(r * 2.8 * flick)
    this.light(this.splashMat, color, alpha, time * 1.3)
    this.scorch.visible = hot && floor
    this.scorch.position.set(this.end.x, 0.06, this.end.z)
    this.scorch.scale.setScalar(r * 2.6 * (1 + 0.15 * Math.sin(time * 17)))
    this.scorchMat.color.copy(color).multiplyScalar(0.7 * alpha)
  }

  hide(): void {
    this.group.visible = false
  }

  dispose(): void {
    this.group.removeFromParent()
    for (const m of [this.core, this.glow, this.flare, this.scorch]) m.geometry.dispose()
    for (const m of [this.coreMat, this.glowMat, this.flareMat, this.splashMat, this.scorchMat]) m.dispose()
  }
}

export type GmState = 'dormant' | 'intro' | 'fight' | 'dying' | 'done'

export interface GmHost extends DropHost {
  player: ClimbBody & { px: number; pz: number; py: number; pitch?: number }
  /** Vex (dead by now): the source the giant's shots are booked to. */
  vex: Enemy
  dmg: number
  propParent(x: number, z: number): Object3D
  sfx(name: string, x?: number, z?: number): void
  say(line: AtlasLine): void
  fireEnemyShot(e: Enemy, x: number, y: number, z: number, dx: number, dy: number, dz: number, speed: number, dmg: number): void
  spawnWave(e: Enemy, x: number, z: number, dx: number, dz: number, speed: number, halfWidth: number, range: number, dmg: number, color: string): void
  pull(x: number, z: number, speed: number, dur: number): void
  skyFlash?(amount: number): void
  keepRetryPoint(): void
  /** A press this frame (skips the intro). */
  pressed(): boolean
  /** The giant fell: the objective is done now. */
  onDefeated(): void
}

const _v = new Vector3()
const _o = new Vector3()
const _c = new Color()

export class GrandMaster implements StageFeature {
  state: GmState = 'dormant'
  readonly root = new Group()
  /** The whole body leans (rears for the cannon, kicks back as it fires)
   *  round the hips: `rig` turns there, `body` holds the parts. */
  private readonly rig = new Group()
  private readonly body = new Group()
  readonly parts: Part[] = []
  private t = 0
  private readonly x: number
  private readonly z: number
  /** The roof (stage 1 of the Core Descent): where it is fought. */
  private readonly roof: Room
  private readonly drops: Drops
  private readonly button: Group
  private readonly marker: Mesh
  /** The laser's and the Prism Cannon's beam (in the world, not the body). */
  readonly beam = new GmBeam()
  private readonly prism: Mesh
  /** Where each beam leaves the body: the eye, the lens. */
  private readonly eyeAt = new Object3D()
  private readonly lensAt = new Object3D()
  private readonly muzzles: Object3D[] = []
  private visor: MeshBasicMaterial | null = null
  private eye: Mesh | null = null
  /** The lens of the belly cannon (the core's weak spot). */
  private readonly lensMat = new MeshBasicMaterial({ color: LENS, toneMapped: false })
  private readonly lens: Mesh
  /** Every part's glowing pieces share it: dark until it wakes, then a pulse. */
  private readonly glowMat = new MeshBasicMaterial({ vertexColors: true, toneMapped: false })
  private readonly owned: Material[] = []
  private phase = 0
  private armT = ARM_EVERY
  private stompT = STOMP_EVERY
  private laserT = LASER_EVERY
  private prismT = PRISM_EVERY
  private bodyT = BODY_EVERY
  /** A sweep in progress: −1 none; its kind, start yaw and direction. */
  private sweepT = -1
  private sweepKind: 'laser' | 'prism' = 'laser'
  private sweepYaw = 0
  private sweepDir = 1
  private sweepHit = false
  private chargeT = -1
  private armTurn = 0
  /** The arm winding up for the next shot (-1 none). */
  private armNext = -1
  private readonly armKick = [0, 0]
  /** The core's next attack, shown on its lens before it comes. */
  private bodyPick: BossId | null = null
  private lastBeat = -1
  /** The look: seconds alive, the glow's power (0 dark .. 1 awake), the
   *  eye's alarm (it flares on every wind-up), the kicks after a shot. */
  private lookT = 0
  private power = 0
  private alarm = 0
  private headKick = 0
  private bodyKick = 0
  private headYaw = 0
  private sparkT = 0
  private readonly spec: ParticleSpec = { x: 0, y: 0, z: 0, color: new Color(), size: 0.2, life: 0.4 }
  /** The flight rig (#145) on the core's back: Gale's and Rotor's wings, the
   *  hover jets under the torso. Folded away until the feet are gone. */
  readonly wings = new Group()
  /** The wings' shoulder joints: [left, right]. */
  readonly hinges: Group[] = []
  private readonly jets: Mesh[] = []
  private readonly tipJets: Mesh[] = []
  /** Each wing's feathers, pivoting where they hang from the spars. */
  private readonly feathers: Group[][] = []
  /** Gale's fan and Rotor's blades: on the back, low, under the wing roots. */
  readonly backTrim: Mesh[] = []
  /** Seconds since the wings began to unfold (-1: still folded away). */
  private wingT = -1
  private flyT = 0
  private lastYaw = 0
  /** The beat: where in it (0..1), its rate, the stroke last step. */
  private beatPh = 0
  private beatHz = WING_HZ_HOVER
  private lastStroke = -1

  constructor(private readonly host: GmHost, roof: Room) {
    this.roof = roof
    this.drops = new Drops(host)
    this.x = (roof.x0 + roof.w / 2) * CELL
    this.z = (roof.z0 + 1.1) * CELL
    this.root.position.set(this.x, 0, this.z)
    this.root.visible = false
    this.rig.position.set(0, 3, 0)
    this.body.position.set(0, -3, 0)
    this.rig.add(this.body)
    this.root.add(this.rig)
    this.lens = new Mesh(sph(0.6, 20, 14), this.lensMat)
    // Its white-hot heart, bulging out of the front.
    const heart = new MeshBasicMaterial({ color: '#fff4d6', toneMapped: false })
    this.owned.push(heart)
    const core = new Mesh(sph(0.3, 14, 10), heart)
    core.position.set(0, 0, 0.42)
    this.lens.add(core)
    const vexMax = host.vex.maxHp
    for (const id of ORDER) this.parts.push(this.build(id, vexMax))
    this.buildWings()
    // Atlas's mark on the weak spot to hit.
    this.marker = new Mesh(merge([paint(torus(1, 0.08, 6, 32), '#ffffff')]), new MeshBasicMaterial({ color: '#ffffff', transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false }))
    this.marker.visible = false
    this.body.add(this.marker)
    // The Prism Cannon's charge: a ring of the ten colours round the lens.
    this.prism = new Mesh(merge([torus(1.1, 0.16, 6, 40)]), new MeshBasicMaterial({ color: '#ffffff', transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false }))
    this.prism.position.set(0, 5.1, 1.85)
    this.prism.visible = false
    this.part('body').pose.children[0]!.add(this.prism)
    this.owned.push(this.marker.material as Material, this.prism.material as Material, this.lensMat, this.glowMat)
    // Vex's big red button (shown where he fell, during the intro).
    this.button = new Group()
    this.button.add(this.toon(merge([
      xform(paint(rbox(0.5, 0.3, 0.4, 0.1), '#2b2f38'), [0, 0.15, 0]),
      xform(paint(sph(0.16, 12, 8), '#ff2d3f'), [0, 0.34, 0])
    ])))
    this.button.visible = false
    const parent = host.propParent(this.x, this.z)
    parent.add(this.root)
    parent.add(this.beam.group)
    this.setGlow()
  }

  // ─── The body ──────────────────────────────────────────────────────────────

  private toon(geo: ReturnType<typeof merge>): Mesh {
    const m = new Mesh(geo, toonVC())
    const o = new Mesh(geo, outlineMat(0.04))
    o.renderOrder = -1
    m.add(o)
    return m
  }

  private build(id: PartId, vexMax: number): Part {
    const master = PART_OF[id]
    const [wx, wy, wz, r] = WEAK[id]
    const pieces = gmPartPieces(id)
    const root = new Group()
    // root → pose (at the joint) → content (back by the joint) → meshes.
    const pivot = new Vector3(...PIVOT[id])
    const pose = new Group()
    pose.position.copy(pivot)
    const content = new Group()
    content.position.copy(pivot).negate()
    pose.add(content)
    root.add(pose)
    content.add(this.toon(merge(pieces.toon)))
    if (pieces.glow.length) content.add(new Mesh(merge(pieces.glow), this.glowMat))
    if (id === 'head') {
      // The eye: dark until the giant wakes.
      this.visor = new MeshBasicMaterial({ color: VISOR_OFF, toneMapped: false })
      this.owned.push(this.visor)
      // Centred on itself, so the alarm can widen it in place.
      this.eye = new Mesh(merge(pieces.eye).translate(0, -7.6, -0.86), this.visor)
      this.eye.position.set(0, 7.6, 0.86)
      content.add(this.eye)
      this.eyeAt.position.set(...GM_EYE)
      content.add(this.eyeAt)
    }
    if (id === 'body') {
      this.lens.position.set(0, 5.1, 1.3)
      content.add(this.lens)
      this.lensAt.position.set(...GM_LENS)
      content.add(this.lensAt)
    }
    if (id === 'armL' || id === 'armR') {
      const m = new Object3D()
      m.position.set(wx, wy, wz + 0.1)
      content.add(m)
      this.muzzles[id === 'armL' ? 0 : 1] = m
    }
    this.body.add(root)
    const max = Math.round(vexMax * GM_HP_MUL * SHARES[id])
    return {
      id, master, root, pose, pivot, wx, wy, wz, r, share: SHARES[id], hp: max, max,
      weakTo: BOSSES[master].weakTo, gone: false, fallT: -1, flash: 0, home: [0, 0, 0]
    }
  }

  /** `o`'s position in the giant's parent frame (the world), through every
   *  joint as it stands now (the pose, a fall, the lean, the sway, a hop). */
  private worldOf(o: Object3D, out: Vector3): Vector3 {
    out.set(0, 0, 0)
    const top = this.root.parent
    for (let n: Object3D | null = o; n && n !== top; n = n.parent) {
      n.updateMatrix()
      out.applyMatrix4(n.matrix)
    }
    return out
  }

  /** The wings and the hover jets, on the core's part (they go when it goes).
   *  Built spread, in the giant's frame; `stepWings` folds and beats them. */
  private buildWings(): void {
    const dark = DARK
    const flame = new MeshBasicMaterial({ color: '#9ff3ff', transparent: true, opacity: 0.85, blending: AdditiveBlending, depthWrite: false, toneMapped: false })
    this.owned.push(flame)
    const jet = (x: number, y: number, z: number, r: number, len: number): Mesh => {
      // Its origin at the nozzle, so a scale stretches the flame downward.
      const m = new Mesh(xform(rcone(0.03, r, len), [0, -len / 2, 0]), flame)
      m.position.set(x, y, z)
      this.jets.push(m)
      return m
    }
    const mount: ReturnType<typeof paint>[] = []
    for (const s of [-1, 1]) {
      // Hover jets where the legs were, under the torso stump.
      mount.push(xform(paint(rcone(0.45, 0.3, 0.5), dark), [s * 0.9, 2.75, 0]))
      mount.push(xform(paint(torus(0.42, 0.07, 6, 20), '#ffb04a'), [s * 0.9, 2.53, 0], [Math.PI / 2, 0, 0]))
      this.wings.add(jet(s * 0.9, 2.5, 0, 0.34, 0.9))
      // A strut out of the back to each shoulder joint.
      this.wings.add(this.toon(merge([xform(paint(rcyl(0.2, 1.0, 0.06), dark), [s * 1.5, 6.0, -1.65], [Math.PI / 2, 0, 0])])))
      this.hinges.push(this.buildWing(s, dark, jet))
    }
    this.wings.add(this.toon(merge(mount)))
    // Gale's fan and Rotor's blades: low on the back, under the wing roots,
    // clear of the wings in every pose (always there, legs or no legs).
    const trims = [
      [xform(paint(torus(0.7, 0.1, 6, 24), MASTER_COLOR.galeMaster), [-1.15, 4.0, -1.5])],
      [
        xform(paint(rbox(2.0, 0.1, 0.36, 0.05), MASTER_COLOR.rotorMaster), [1.15, 4.0, -1.5]),
        xform(paint(rbox(0.36, 0.16, 0.8, 0.05), MASTER_COLOR.rotorMaster), [1.15, 4.0, -1.5])
      ]
    ]
    for (const t of trims) {
      const m = this.toon(merge(t))
      this.backTrim.push(m)
      this.part('body').root.add(m)
    }
    for (const hinge of this.hinges) this.wings.add(hinge)
    this.wings.visible = false
    this.part('body').root.add(this.wings)
  }

  /** One wing, spread, round its shoulder joint: two jointed spars rising
   *  out and then sweeping down, five panel feathers fanned under them in its
   *  Master's colour, a jet at the tip. `s`: -1 left (Gale), +1 right (Rotor). */
  private buildWing(s: number, dark: string, jet: (x: number, y: number, z: number, r: number, len: number) => Mesh): Group {
    const c = s < 0 ? MASTER_COLOR.galeMaster : MASTER_COLOR.rotorMaster
    const hinge = new Group()
    hinge.position.set(s * 1.5, 6.0, -2.15)
    const g: ReturnType<typeof paint>[] = []
    // A spar from `[x, y]`, `len` long, at `a` above the horizontal, outward.
    const spar = (x: number, y: number, a: number, len: number): [number, number] => {
      const dx = s * Math.cos(a)
      const dy = Math.sin(a)
      g.push(xform(paint(rcyl(0.17, len, 0.05), dark), [x + dx * len / 2, y + dy * len / 2, 0], [0, 0, -s * (Math.PI / 2 - a)]))
      return [x + dx * len, y + dy * len]
    }
    g.push(paint(sph(0.4, 14, 10), dark))
    const elbow = spar(0, 0, 0.42, 3.2)
    g.push(xform(paint(sph(0.28, 12, 8), c), [elbow[0], elbow[1], 0]))
    const tip = spar(elbow[0], elbow[1], -0.2, 2.6)
    g.push(xform(paint(rcone(0.24, 0.14, 0.4), c), [tip[0], tip[1] - 0.12, 0]))
    const tipJet = jet(tip[0], tip[1] - 0.32, 0, 0.18, 0.7)
    this.tipJets.push(tipJet)
    hinge.add(tipJet)
    // The feathers: hung along both spars, each a step further back and
    // tilted its own way, so no two lie in one plane.
    const along = (d: number): [number, number] => d <= 3.2
      ? [s * Math.cos(0.42) * d, Math.sin(0.42) * d]
      : [elbow[0] + s * Math.cos(-0.2) * (d - 3.2), elbow[1] + Math.sin(-0.2) * (d - 3.2)]
    const LEN = [1.4, 1.9, 2.4, 2.2, 1.7]
    const feathers: Group[] = []
    LEN.forEach((len, i) => {
      const [ax, ay] = along(0.9 + i * 1.1)
      const fan = 0.1 + 0.16 * i
      // Its pivot where it hangs, so it can trail behind the beat.
      const f = new Group()
      f.position.set(ax, ay, 0)
      f.add(this.toon(merge([xform(paint(rbox(0.8, len, 0.1, 0.3), i % 2 ? '#eef6ff' : c),
        [s * Math.sin(fan) * len / 2, -Math.cos(fan) * len / 2, -0.14 - 0.12 * i],
        [0.08 + 0.05 * i, 0, s * fan])])))
      hinge.add(f)
      feathers.push(f)
    })
    this.feathers.push(feathers)
    // The joint, the upper spar, and the elbow with the lower spar and tip:
    // a mesh each, so each one's bounds hug it through the beat.
    for (const piece of [g.slice(0, 1), g.slice(1, 2), g.slice(2)]) hinge.add(this.toon(merge(piece)))
    return hinge
  }

  /** The wings unfold (and the giant takes to the air): the feet are gone.
   *  `instant` for a reload into a later phase. */
  private deployWings(instant: boolean): void {
    if (this.wingT >= 0) return
    this.wings.visible = true
    this.wingT = instant ? WING_DEPLOY : 0
    this.lastYaw = this.root.rotation.y
    this.stepWings(0)
    if (instant) return
    const h = this.host
    for (const s of [-1, 1]) {
      h.fx.sparks(this.x + s * 1.5, 6 + HOVER_Y, this.z - 2.1, s < 0 ? MASTER_COLOR.galeMaster : MASTER_COLOR.rotorMaster, 18, 7, 0.2)
    }
    h.fx.sparks(this.x, 2.5 + HOVER_Y, this.z, '#9ff3ff', 20, 6, 0.2)
    h.sfx('flameJet', this.x, this.z)
  }

  /** How far the wings are out: 0 folded away, 1 spread. */
  get wingsOut(): number {
    return this.wingT < 0 ? 0 : Math.min(1, this.wingT / WING_DEPLOY)
  }

  /** The unfold (out of the back, a little overshoot), then the beat: a slow
   *  upstroke and a fast downstroke round the shoulder joints, feathers
   *  trailing, the tip jets flaring as the wings come down and the body
   *  lifting with them; faster while it is busy. The pair banks into the
   *  giant's sway. */
  private stepWings(dt: number): void {
    if (this.wingT < 0) return
    this.wingT += dt
    this.flyT += dt
    const k = this.wingsOut
    const e = 1 - Math.pow(1 - k, 3)
    const out = k < 1 ? e + Math.sin(k * Math.PI) * 0.12 : 1
    const busy = k < 1 || this.sweepT >= 0 || this.chargeT >= 0 || this.state === 'dying'
    this.beatHz += ((busy ? WING_HZ_BUSY : WING_HZ_HOVER) - this.beatHz) * Math.min(1, dt * 3)
    this.beatPh = (this.beatPh + this.beatHz * dt) % 1
    const w = wingStroke(this.beatPh)
    // The stroke's speed (per second): below 0 on the downstroke.
    const vel = dt > 0 ? (w - this.lastStroke) / dt : 0
    this.lastStroke = w
    const down = Math.min(1, Math.max(0, -vel / (Math.PI * this.beatHz / (1 - WING_UP_SHARE))))
    this.hinges.forEach((hinge, i) => {
      const s = i ? 1 : -1
      hinge.scale.setScalar(0.3 + 0.7 * out)
      hinge.rotation.set(0, s * WING_FOLD_Y * (1 - out), s * (WING_FOLD_Z * (1 - out) + out * (WING_BEAT_MID + WING_BEAT_AMP * w)))
      // The feathers lag the beat (up on the way down), the outer ones most,
      // and fan a little wider on the downstroke.
      this.feathers[i]!.forEach((f, n) => {
        f.rotation.z = s * e * (Math.max(-0.12, Math.min(0.3, -vel * 0.04)) * (0.5 + 0.2 * n) + 0.05 * n * down)
      })
    })
    const yawRate = dt > 0 ? (this.root.rotation.y - this.lastYaw) / dt : 0
    this.lastYaw = this.root.rotation.y
    this.wings.rotation.z = -yawRate * 1.8 * e
    this.jets.forEach((j, i) => j.scale.set(1, (0.85 + 0.15 * Math.sin(this.flyT * 37 + i * 2.1)) * (0.3 + 0.7 * e), 1))
    for (const j of this.tipJets) j.scale.y *= 1 + 1.4 * down
    // It drops as the feet go, the wings catch it, then it bobs with each
    // beat: up as the wings come down.
    if (this.state === 'fight' || this.state === 'dying') this.root.position.y = HOVER_Y - 0.9 * (1 - e) - WING_BOB * w
  }

  /** The shoulder joints' beat angle (rad, the right wing's; the left one
   *  mirrors it). Test seam. */
  get wingAngle(): number {
    return this.hinges[1]!.rotation.z
  }

  /** The beam out now (the laser's tell included), or null. Test seam. */
  get beamKind(): 'laser' | 'prism' | null {
    return this.sweepT >= 0 ? this.sweepKind : null
  }

  // ─── The look ──────────────────────────────────────────────────────────────

  /** The glow (vents, rings, halo, bores), the eye and the lens, from the
   *  power, the pulse and the alarm. */
  private setGlow(): void {
    const pulse = 0.82 + 0.18 * Math.sin(this.lookT * 2.4)
    let g = this.power * pulse
    if (this.state === 'dying') g *= 0.35 + 0.65 * Math.abs(Math.sin(this.lookT * 31) * Math.sin(this.lookT * 7))
    this.glowMat.color.setScalar(0.12 + 0.88 * g)
    if (this.visor) this.visor.color.copy(VISOR_OFF).lerp(VISOR_ON, Math.min(1, g * 1.1)).lerp(WHITE, this.alarm * 0.75 * this.power)
    if (this.eye) this.eye.scale.set(1, 1 + 0.5 * this.alarm, 1)
  }

  /** It lives: breathes, sways, looks at Flux, glows; the joints play out
   *  the wind-ups and the kicks. */
  private stepLook(dt: number): void {
    this.lookT += dt
    if (this.state === 'fight') this.power = Math.min(1, this.power + dt / POWER_UP)
    const busy = this.sweepT >= 0 && this.sweepT < (this.sweepKind === 'laser' ? LASER_TELL : 0)
    const wind = busy || this.chargeT >= 0 || this.armNext >= 0 || this.bodyPick !== null ||
      (this.phase === 1 && this.state === 'fight' && this.stompT < STOMP_TELL)
    this.alarm += ((wind ? 1 : 0) - this.alarm) * Math.min(1, dt * (wind ? 6 : 3))
    this.headKick = Math.max(0, this.headKick - dt * 3)
    this.bodyKick = Math.max(0, this.bodyKick - dt * 2.5)
    for (let i = 0; i < 2; i++) this.armKick[i] = Math.max(0, this.armKick[i]! - dt * 4)
    const breath = Math.sin(this.lookT * 1.7)
    const p = this.host.player
    // Body: breathing, rearing for the cannon, kicked back by its beam.
    const body = this.part('body')
    body.pose.scale.set(1 + 0.008 * breath, 1 + 0.014 * breath, 1 + 0.008 * breath)
    const charge = this.chargeT >= 0 ? Math.min(1, this.chargeT / PRISM_CHARGE) : 0
    const dying = this.state === 'dying' ? Math.min(1, this.t / DEATH_S) : 0
    this.rig.rotation.x = -0.08 * charge * charge - 0.06 * this.bodyKick + 0.2 * dying * dying
    this.rig.rotation.z = this.state === 'dying' ? Math.sin(this.lookT * 23) * 0.025 : 0
    // Head: looks at Flux (or along its laser), rears for the laser, kicks.
    const head = this.part('head')
    let look = Math.atan2(p.x - this.x, p.z - this.z) - this.root.rotation.y
    if (this.sweepT >= 0 && this.sweepKind === 'laser') look = this.sweepYaw - this.root.rotation.y
    look = Math.max(-0.45, Math.min(0.45, Math.atan2(Math.sin(look), Math.cos(look))))
    this.headYaw += (look - this.headYaw) * Math.min(1, dt * 4)
    const rear = this.sweepT >= 0 && this.sweepKind === 'laser' && this.sweepT < LASER_TELL ? Math.sin(Math.min(1, this.sweepT / LASER_TELL) * Math.PI / 2) : 0
    head.pose.position.y = head.pivot.y + 0.04 * breath
    head.pose.rotation.set(-0.22 * rear + 0.18 * this.headKick + 0.015 * breath, this.headYaw, 0)
    // Arms: hang and sway; the next to fire draws back, then kicks up.
    for (let i = 0; i < 2; i++) {
      const arm = this.part(i ? 'armR' : 'armL')
      const k = this.armNext === i ? 1 - Math.max(0, this.armT) / ARM_TELL : 0
      const draw = Math.sin(Math.min(1, k) * Math.PI) * 0.28
      arm.pose.position.y = arm.pivot.y + 0.03 * breath
      arm.pose.rotation.set(draw - 0.32 * this.armKick[i]! + 0.03 * Math.sin(this.lookT * 1.1 + i * 2), 0, (i ? -1 : 1) * 0.02 * breath)
    }
    // Feet: during the hop they hang a little, toes down.
    const hop = this.state === 'fight' && this.phase === 1 ? hopAt(this.stompT) : 0
    for (const id of FEET) this.part(id).pose.rotation.x = Math.max(0, hop) * 0.25
    if (this.state === 'fight' && this.phase <= 1) this.root.position.y = hop * STOMP_HOP
    // The lens: the next attack's colour, the charge's, or its own.
    if (this.chargeT >= 0) this.lensMat.color.copy(ALL_COLORS[Math.floor(this.chargeT * 6) % ALL_COLORS.length]!).lerp(WHITE, charge * 0.5)
    else if (this.bodyPick) this.lensMat.color.set(MASTER_COLOR[this.bodyPick]).lerp(WHITE, 0.3 + 0.3 * Math.sin(this.lookT * 30))
    else this.lensMat.color.copy(LENS_ON).multiplyScalar(0.25 + 0.75 * this.power * (0.85 + 0.15 * Math.sin(this.lookT * 3.1)))
    this.lens.scale.setScalar(1 + 0.12 * charge + (this.bodyPick ? 0.06 : 0))
    // Embers out of the stacks now and then.
    if (this.power > 0.5 && this.state === 'fight' && Math.floor(this.lookT * 5) !== Math.floor((this.lookT - dt) * 5)) {
      const stack = this.part('body')
      if (!stack.gone) {
        for (const s of [-1, 1]) {
          _v.set(s * 0.62, 7.75, -1.7).sub(stack.pivot)
          this.worldOfLocal(stack, _v)
          this.puff(_v.x, _v.y, _v.z, (Math.random() - 0.5) * 0.6, 2.2, -0.9, '#ff9a4a', 0.32, 0.7)
        }
      }
    }
    this.setGlow()
  }

  /** A point in `part`'s pose frame, to the world (in place). */
  private worldOfLocal(part: Part, v: Vector3): void {
    part.pose.updateMatrix()
    v.applyMatrix4(part.pose.matrix)
    for (let n: Object3D | null = part.root; n && n !== this.root.parent; n = n.parent) {
      n.updateMatrix()
      v.applyMatrix4(n.matrix)
    }
  }

  /** One particle (no allocation: the spec is reused). */
  private puff(x: number, y: number, z: number, vx: number, vy: number, vz: number, color: string | Color, size: number, life: number, drag = 1): void {
    const s = this.spec
    s.x = x; s.y = y; s.z = z; s.vx = vx; s.vy = vy; s.vz = vz
    if (typeof color === 'string') (s.color as Color).set(color)
    else (s.color as Color).copy(color)
    s.size = size; s.sizeEnd = size * 0.2; s.life = life; s.drag = drag; s.gravity = 0
    this.host.fx.emit(s)
  }

  // ─── The state ─────────────────────────────────────────────────────────────

  /** Vex fell (at `x, z`): the button, the rumble, the assembly. */
  start(x: number, z: number): void {
    if (this.state !== 'dormant') return
    this.state = 'intro'
    this.t = 0
    this.button.position.set(x, 0, z)
    this.host.propParent(x, z).add(this.button)
    hud.cineSkip = false
  }

  /** The giant stands, and the fight is on (an intro skipped or played out,
   *  or a retry's). */
  private wake(retry: boolean): void {
    this.root.visible = true
    for (const p of this.parts) {
      p.root.position.set(0, 0, 0)
      p.root.visible = !p.gone
    }
    this.button.visible = false
    hud.cineSkip = false
    hud.bossName = 'boss.grandMaster'
    hud.bossStyle = ''
    hud.bossMarks = this.marks()
    this.syncBar()
    this.phase = this.currentPhase()
    this.state = 'fight'
    this.t = 0
    if (retry) this.power = 1
    else {
      showBanner('grandMaster')
      this.host.sfx('bossIntro')
      this.host.keepRetryPoint()
      // It powers up: a flash from the eye and the core as the glow comes on.
      const eye = this.worldOf(this.eyeAt, _v)
      this.host.fx.flash(eye.x, eye.y, eye.z, MASTER_COLOR.neonMaster, 2.2, 0.35)
      const lens = this.worldOf(this.lensAt, _v)
      this.host.fx.flash(lens.x, lens.y, lens.z, LENS, 2.6, 0.4)
    }
    this.host.say(`hint.gm.${PHASE_LINE[this.phase]}`)
  }

  private currentPhase(): number {
    for (let n = 0; n < GM_PHASES.length; n++) {
      if (GM_PHASES[n]!.some(id => !this.part(id).gone)) return n
    }
    return GM_PHASES.length
  }

  part(id: PartId): Part {
    return this.parts.find(p => p.id === id)!
  }

  /** The boss bar's marks: where each phase's share ends. */
  private marks(): number[] {
    const total = this.parts.reduce((a, p) => a + p.max, 0)
    let left = total
    const out: number[] = []
    for (const set of GM_PHASES.slice(0, -1)) {
      for (const id of set) left -= this.part(id).max
      out.push(left / total)
    }
    return out
  }

  private syncBar(): void {
    const total = this.parts.reduce((a, p) => a + p.max, 0)
    const left = this.parts.reduce((a, p) => a + Math.max(0, p.hp), 0)
    hud.bossHp01 = left / total
  }

  /** The intro holds the stick (the fight leaves it free). */
  locksMove(): boolean {
    return this.state === 'intro' && this.t >= T_JUMP
  }

  /** Blocks the exit until it has fallen. */
  get blocking(): boolean {
    return this.state === 'intro' || this.state === 'fight' || this.state === 'dying'
  }

  // ─── Each step ─────────────────────────────────────────────────────────────

  update(dt: number, _time: number, p: ClimbBody, playing: boolean): void {
    this.drops.update(dt, p, playing)
    for (const part of this.parts) this.stepFall(part, dt)
    if (this.state === 'intro') this.stepIntro(dt)
    else if (this.state === 'fight' && playing) this.stepFight(dt)
    else if (this.state === 'dying') this.stepDeath(dt)
    if (this.root.visible && (this.state === 'fight' || this.state === 'dying') && (playing || this.state === 'dying')) this.stepLook(dt)
    this.stepWings(dt)
  }

  private stepIntro(dt: number): void {
    const h = this.host
    const before = this.t
    this.t += dt
    const t = this.t
    const passed = (at: number) => before < at && t >= at
    // Skippable once the button is pressed (the fight starts as assembled).
    if (t > T_RUMBLE && t < T_ASSEMBLE + DROP_EVERY * ORDER.length && h.pressed()) {
      if (t < T_JUMP) this.jump()
      this.wake(false)
      return
    }
    if (t > T_RUMBLE) hud.cineSkip = true
    if (passed(T_BUTTON)) {
      this.button.visible = true
      h.sfx('alert', this.button.position.x, this.button.position.z)
      h.say('hint.gm.button')
    }
    if (t >= T_RUMBLE && t < T_BLACK) {
      h.shake(0.12)
      const beat = Math.floor((t - T_RUMBLE) / 0.7)
      if (beat !== this.lastBeat) {
        this.lastBeat = beat
        h.sfx(beat % 2 ? 'door' : 'stomp')
      }
    }
    if (t >= T_BLACK && t <= T_JUMP + 0.5) {
      const k = t < T_JUMP ? (t - T_BLACK) / (T_JUMP - T_BLACK) : 1 - (t - T_JUMP) / 0.5
      pushHud({ t: 'flash', color: '#000000', strength: Math.min(1, 0.3 + k) })
    }
    if (passed(T_JUMP)) this.jump()
    if (t >= T_JUMP) this.faceGiant(dt)
    // The assembly: one part every DROP_EVERY, falling DROP_S out of the sky.
    if (t >= T_ASSEMBLE) {
      this.root.visible = true
      ORDER.forEach((id, n) => {
        const part = this.part(id)
        const t0 = T_ASSEMBLE + n * DROP_EVERY
        const k = Math.min(1, Math.max(0, (t - t0) / DROP_S))
        part.root.visible = t >= t0
        part.root.position.y = 30 * (1 - k * k)
        if (passed(t0 + DROP_S)) {
          h.sfx('stomp', this.x, this.z)
          h.sfx('deckLand', this.x, this.z)
          h.shake(0.35)
          h.fx.sparks(this.x + part.wx, part.wy, this.z + 0.5, MASTER_COLOR[part.master], 16, 6, 0.2)
        }
      })
    }
    if (t >= T_ASSEMBLE + DROP_EVERY * ORDER.length + 0.4) this.wake(false)
  }

  /** The fall to the roof: Flux on its south side, facing the giant. */
  private jump(): void {
    const p = this.host.player
    const r = this.roof
    p.x = p.px = (r.x0 + r.w / 2) * CELL
    p.z = p.pz = (r.z0 + r.h - 1.2) * CELL
    p.y = p.py = p.safeY = 0
    p.vx = p.vz = p.vy = 0
    p.yaw = 0
    this.button.visible = false
  }

  private faceGiant(dt: number): void {
    const p = this.host.player
    if (p.pitch !== undefined) p.pitch += (0.32 - p.pitch) * Math.min(1, dt * 3)
  }

  private stepFight(dt: number): void {
    const h = this.host
    const p = h.player
    this.t += dt
    // Atlas's mark on the weak spot to hit (the nearest live one of the set).
    const set = GM_PHASES[this.phase] ?? []
    const target = set.map(id => this.part(id)).filter(q => !q.gone)
      .sort((a, b) => Math.hypot(a.wx - (p.x - this.x), a.wz) - Math.hypot(b.wx - (p.x - this.x), b.wz))[0]
    if (target) {
      this.marker.visible = true
      this.marker.position.set(target.wx, target.wy, target.wz + 0.1)
      this.marker.scale.setScalar(target.r * (1.2 + 0.15 * Math.sin(this.t * 6)))
      ;(this.marker.material as MeshBasicMaterial).color.set(MASTER_COLOR[target.master])
    }
    for (const part of this.parts) {
      if (part.flash > 0) {
        part.flash = Math.max(0, part.flash - dt * 5)
        part.root.scale.setScalar(1 + part.flash * 0.04)
      }
    }
    // Its idle: a slow sway.
    this.root.rotation.y = Math.sin(this.t * 0.7) * 0.08
    if (this.sweepT >= 0) this.stepSweep(dt)
    if (this.chargeT >= 0) this.stepCharge(dt)
    const dmg = this.host.dmg
    switch (this.phase) {
      case 0: this.armsAttack(dt, dmg); break
      case 1: this.stompAttack(dt, dmg); break
      case 2: this.laserAttack(dt, dmg); break
      case 3: this.bodyAttack(dt, dmg); break
    }
    if (this.phase >= 2 && this.sweepT < 0 && this.chargeT < 0) {
      this.prismT -= dt
      if (this.prismT <= 0) {
        this.prismT = PRISM_EVERY
        this.chargeT = 0
        this.prism.visible = true
        h.sfx('bossWarn', this.x, this.z)
        h.say('hint.gm.prism')
      }
    }
  }

  /** From a part's muzzle (the giant's frame, unturned), aimed at Flux's chest. */
  private fire(lx: number, ly: number, lz: number, speed: number, dmg: number, spread = 0): void {
    _o.set(this.x + lx, ly + this.root.position.y, this.z + lz)
    this.fireFrom(_o, speed, dmg, spread)
  }

  /** From a point in the world, aimed at Flux's chest. */
  private fireFrom(o: Vector3, speed: number, dmg: number, spread = 0): void {
    const h = this.host
    const p = h.player
    const dx = p.x - o.x
    const dz = p.z - o.z
    const a = Math.atan2(dx, dz) + spread
    h.fireEnemyShot(h.vex, o.x, o.y, o.z, Math.sin(a), (p.y + 1.2 - o.y) / Math.max(1, Math.hypot(dx, dz)), Math.cos(a), speed, dmg)
  }

  private armsAttack(dt: number, dmg: number): void {
    this.armT -= dt
    const left = this.part('armL')
    const right = this.part('armR')
    // The wind-up: which arm fires next is known ARM_TELL ahead, and it
    // draws back (`stepLook`) while its bore flares.
    if (this.armT <= ARM_TELL && this.armNext < 0) {
      this.armNext = !left.gone && (right.gone || this.armTurn++ % 2 === 0) ? 0 : right.gone ? -1 : 1
      if (this.armNext >= 0) {
        const m = this.worldOf(this.muzzles[this.armNext]!, _v)
        this.host.fx.flash(m.x, m.y, m.z, this.armNext ? '#bff4ff' : '#ffd35a', 0.9, ARM_TELL)
      }
    }
    if (this.armT > 0) return
    this.armT = ARM_EVERY
    const use = this.armNext
    this.armNext = -1
    if (use < 0) return
    const arm = use ? right : left
    if (arm.gone) return
    const m = this.worldOf(this.muzzles[use]!, _v)
    if (use === 0) {
      // Blaze's cannon: a fan of three fireballs.
      for (const s of [-0.22, 0, 0.22]) this.fireFrom(m, 9, Math.round(dmg * 0.7), s)
      this.host.sfx('flameJet', this.x + left.wx, this.z)
      this.host.fx.flash(m.x, m.y, m.z, '#ffb347', 1.8, 0.16)
      this.host.fx.sparks(m.x, m.y, m.z, '#ff8a3a', 14, 7, 0.2)
    } else {
      // Frost's lance: one fast spike.
      this.fireFrom(m, 16, Math.round(dmg * 0.9))
      this.host.sfx('enemyShot', this.x + right.wx, this.z)
      this.host.fx.flash(m.x, m.y, m.z, '#dff8ff', 1.4, 0.14)
      this.host.fx.sparks(m.x, m.y, m.z, '#bff4ff', 10, 6, 0.16)
    }
    this.armKick[use] = 1
    this.host.shake(0.08)
  }

  private stompAttack(dt: number, dmg: number): void {
    this.stompT -= dt
    if (this.stompT > 0) return
    this.stompT = STOMP_EVERY
    const h = this.host
    const p = h.player
    for (const id of ['footL', 'footR'] as const) {
      const f = this.part(id)
      if (f.gone) continue
      const x = this.x + f.wx
      const z = this.z + f.wz
      h.spawnWave(h.vex, x, z, p.x - x, p.z - z, 7, 1.2, 22, Math.round(dmg * 1.1), MASTER_COLOR[f.master])
      // Dust and a ring of the foot's colour where it lands.
      h.fx.riseRing(x, 0.15, z - 0.4, MASTER_COLOR[f.master], 1.4, 18)
      h.fx.sparks(x, 0.3, z - 0.4, '#d9cbb0', 16, 6, 0.26)
      h.fx.flash(x, 0.4, z - 0.4, '#fff1d0', 2.2, 0.16)
    }
    h.sfx('stomp', this.x, this.z)
    h.shake(0.45)
  }

  private laserAttack(dt: number, _dmg: number): void {
    if (this.sweepT >= 0 || this.chargeT >= 0) return
    this.laserT -= dt
    if (this.laserT > 0) return
    this.laserT = LASER_EVERY
    this.startSweep('laser')
  }

  private bodyAttack(dt: number, dmg: number): void {
    if (this.sweepT >= 0 || this.chargeT >= 0) return
    this.bodyT -= dt
    // The wind-up: the lens takes the next Master's colour.
    if (this.bodyT <= BODY_TELL && !this.bodyPick) this.bodyPick = ALL_MASTERS[Math.floor(Math.random() * ALL_MASTERS.length)]!
    if (this.bodyT > 0) return
    this.bodyT = BODY_EVERY
    const h = this.host
    const p = h.player
    const pick = this.bodyPick ?? ALL_MASTERS[Math.floor(Math.random() * ALL_MASTERS.length)]!
    this.bodyPick = null
    const color = MASTER_COLOR[pick]
    const lens = this.worldOf(this.lensAt, _o)
    h.fx.flash(lens.x, lens.y, lens.z, color, 1.6, 0.18)
    this.bodyKick = Math.max(this.bodyKick, 0.5)
    switch (pick) {
      case 'blazeMaster':
        for (const s of [-0.3, -0.1, 0.1, 0.3]) this.fireFrom(lens, 9, Math.round(dmg * 0.6), s)
        break
      case 'frostMaster':
      case 'neonMaster':
        this.fireFrom(lens, 17, Math.round(dmg * 0.8))
        break
      case 'voltMaster':
      case 'drillMaster':
        h.spawnWave(h.vex, this.x, this.z + 1.5, p.x - this.x, p.z - this.z, 7.5, 1.4, 22, dmg, color)
        h.fx.riseRing(this.x, 0.15, this.z + 1.5, color, 1.6, 18)
        break
      case 'scrapper':
      case 'tideMaster':
        // Scrap (or water) from the sky: three rings round Flux.
        for (let k = 0; k < 3; k++) {
          const a = Math.random() * Math.PI * 2
          const d = 0.5 + Math.random() * 2.2
          this.drops.drop({ x: p.x + Math.cos(a) * d, z: p.z + Math.sin(a) * d, y: p.y, warn: 1.1, fall: 0.25, height: 0, reach: 1, cost: 0.07, sound: k ? undefined : 'alert', color })
        }
        break
      case 'magnetMaster':
        h.pull(this.x, this.z + 2, 2.4, 1.4)
        h.sfx('locate', this.x, this.z)
        this.streaks(color, -1)
        break
      case 'galeMaster':
        h.pull(this.x, this.z + 2, -3.2, 1.2)
        h.sfx('gust', this.x, this.z)
        this.streaks(color, 1)
        break
      case 'rotorMaster':
        for (const s of [-0.5, 0.5]) this.fire(s * 4, 6.9, -1, 8, Math.round(dmg * 0.6), s * 0.4)
        break
    }
  }

  /** A pull or a gust you can see: motes streaming between the giant and
   *  Flux (`dir` 1 out toward him, -1 in toward the giant). */
  private streaks(color: string, dir: number): void {
    const p = this.host.player
    const dx = p.x - this.x
    const dz = p.z - (this.z + 2)
    const d = Math.max(1, Math.hypot(dx, dz))
    for (let k = 0; k < 26; k++) {
      const f = Math.random()
      const side = (Math.random() - 0.5) * 5
      const x = this.x + dx * f - dz / d * side
      const z = this.z + 2 + dz * f + dx / d * side
      this.puff(x, 0.4 + Math.random() * 2.4, z, dir * dx / d * 9, 0, dir * dz / d * 9, color, 0.3, 0.5, 0.5)
    }
  }

  private startSweep(kind: 'laser' | 'prism'): void {
    const p = this.host.player
    this.sweepKind = kind
    this.sweepT = 0
    this.sweepHit = false
    const o = this.worldOf(kind === 'laser' ? this.eyeAt : this.lensAt, _o)
    const toFlux = Math.atan2(p.x - o.x, p.z - o.z)
    this.sweepDir = Math.random() < 0.5 ? 1 : -1
    // It starts off to one side of Flux and sweeps through him.
    this.sweepYaw = toFlux - this.sweepDir * 0.6
    if (kind === 'laser') this.host.sfx('bossWarn', this.x, this.z)
  }

  /**
   * The beam this frame, from its emitter (the eye or the lens, as the body
   * stands now) along `yaw`: it dips to Flux's chest height at his range and
   * runs on to the floor or a wall. Draws it (`alpha`, `r`) and returns its
   * reach across the floor (m) — the hit test uses the same origin and line.
   */
  private aimBeam(yaw: number, r: number, color: Color, alpha: number): number {
    const p = this.host.player
    const o = this.worldOf(this.sweepKind === 'laser' ? this.eyeAt : this.lensAt, _o)
    const range = Math.max(4, Math.hypot(p.x - o.x, p.z - o.z))
    const drop = Math.max(0.2, o.y - BEAM_AIM_Y)
    const pitch = Math.atan2(drop, range)
    // Out to the floor, unless a wall of the roof comes first.
    const toFloor = o.y > 0 ? o.y / Math.tan(pitch) : 0
    const sx = Math.sin(yaw)
    const sz = Math.cos(yaw)
    const x0 = this.roof.x0 * CELL
    const x1 = (this.roof.x0 + this.roof.w) * CELL
    const z0 = this.roof.z0 * CELL
    const z1 = (this.roof.z0 + this.roof.h) * CELL
    let toWall = 200
    if (sx > 1e-4) toWall = Math.min(toWall, (x1 - o.x) / sx)
    if (sx < -1e-4) toWall = Math.min(toWall, (x0 - o.x) / sx)
    if (sz > 1e-4) toWall = Math.min(toWall, (z1 - o.z) / sz)
    if (sz < -1e-4) toWall = Math.min(toWall, (z0 - o.z) / sz)
    const reach = Math.max(1, Math.min(toFloor, toWall))
    this.beam.fire(o, yaw, pitch, reach / Math.cos(pitch), r, color, alpha, this.lookT, toFloor <= toWall)
    return reach
  }

  private stepSweep(dt: number): void {
    const h = this.host
    const p = h.player
    this.sweepT += dt
    const laser = this.sweepKind === 'laser'
    const tell = laser ? LASER_TELL : 0
    const color = laser ? VISOR_ON : ALL_COLORS[Math.floor(this.sweepT * 2.5) % ALL_COLORS.length]!
    if (this.sweepT < tell) {
      // The tell: the head rears (`stepLook`), the eye flares and a faint
      // sight line shows where the sweep begins.
      const k = this.sweepT / tell
      this.aimBeam(this.sweepYaw, 0.05 + 0.04 * k, color, 0.25 + 0.35 * k * (0.6 + 0.4 * Math.sin(this.sweepT * 40)))
      const o = this.beam.origin
      _c.copy(color).lerp(WHITE, 0.5)
      this.beam.charge(o, 0.25 + 0.6 * k, _c, 0.7 + 0.3 * k, this.lookT)
      this.beam.shaft.visible = true
      if (Math.floor(this.sweepT * 12) !== Math.floor((this.sweepT - dt) * 12)) {
        // Motes drawn into the eye.
        for (let n = 0; n < 2; n++) {
          const a = Math.random() * Math.PI * 2
          this.puff(o.x + Math.cos(a) * 1.4, o.y + Math.sin(a) * 1.4, o.z + 0.3, -Math.cos(a) * 3.6, -Math.sin(a) * 3.6, -0.6, color, 0.22, 0.38, 0)
        }
      }
      return
    }
    const k = (this.sweepT - tell) / LASER_SWEEP
    if (k > 1) {
      this.sweepT = -1
      this.beam.hide()
      return
    }
    if (this.sweepT - dt < tell) {
      // It fires: a kick, a flash, a rumble.
      if (laser) this.headKick = 1
      else this.bodyKick = 1
      h.shake(laser ? 0.2 : 0.4)
      h.skyFlash?.(laser ? 0.2 : 0.45)
      if (!laser) pushHud({ t: 'flash', color: '#ffffff', strength: 0.22 })
    }
    const yaw = this.sweepYaw + this.sweepDir * 1.2 * k
    // In fast, out fast, a flicker in between.
    const ease = Math.min(1, k / 0.06, (1 - k) / 0.08)
    const r = (laser ? LASER_R : PRISM_R) * (0.35 + 0.65 * ease) * (1 + 0.06 * Math.sin(this.lookT * 70))
    const reach = this.aimBeam(yaw, r, color, 0.6 + 0.4 * ease)
    h.shake(dt * (laser ? 1.95 : 2.3))
    this.sparkT -= dt
    if (this.sparkT <= 0) {
      this.sparkT = 0.05
      const e = this.beam.end
      const hex = laser ? MASTER_COLOR.neonMaster : MASTER_COLOR[ALL_MASTERS[Math.floor(this.sweepT * 2.5) % ALL_MASTERS.length]!]
      h.fx.sparks(e.x, e.y + 0.1, e.z, hex, laser ? 5 : 8, laser ? 6 : 8, laser ? 0.18 : 0.26)
      if (Math.random() < 0.35) h.fx.flash(e.x, e.y + 0.2, e.z, hex, laser ? 1.2 : 2.2, 0.12)
    }
    if (this.sweepHit) return
    // The same line the beam is drawn along: its origin, its yaw, its reach.
    const o = this.beam.origin
    const toFlux = Math.atan2(p.x - o.x, p.z - o.z)
    let d = toFlux - yaw
    d = Math.atan2(Math.sin(d), Math.cos(d))
    const width = laser ? LASER_WIDTH : PRISM_WIDTH
    if (Math.abs(d) < width && p.y < 1.5 && Math.hypot(p.x - o.x, p.z - o.z) <= reach + 0.6) {
      this.sweepHit = true
      const dmg = Math.round(this.host.dmg * (laser ? 1.2 : 1.8))
      h.hitPlayer(h.vex, dmg, { blockable: true, fromX: o.x, fromZ: o.z, kind: 'shot' })
    }
  }

  private stepCharge(dt: number): void {
    this.chargeT += dt
    const k = Math.min(1, this.chargeT / PRISM_CHARGE)
    // Ten colours round the cannon, changing 2.5 times a second, the ring
    // tightening on the lens as the light pours in.
    const c = ALL_COLORS[Math.floor(this.chargeT * 2.5) % ALL_COLORS.length]!
    ;(this.prism.material as MeshBasicMaterial).color.copy(c)
    this.prism.scale.setScalar(1.7 - 0.9 * k + 0.05 * Math.sin(this.chargeT * 40))
    this.prism.rotation.z += dt * (2 + 8 * k)
    const o = this.worldOf(this.lensAt, _o)
    this.beam.charge(o, 0.4 + 1.1 * k * k, c, 0.6 + 0.4 * k, this.lookT)
    if (Math.floor(this.chargeT * 20) !== Math.floor((this.chargeT - dt) * 20)) {
      for (let n = 0; n < 3; n++) {
        const a = Math.random() * Math.PI * 2
        const rr = 2.2 + Math.random()
        this.puff(o.x + Math.cos(a) * rr, o.y + Math.sin(a) * rr, o.z + 0.4, -Math.cos(a) * rr * 2.6, -Math.sin(a) * rr * 2.6, -0.8, ALL_COLORS[(n + Math.floor(this.chargeT * 7)) % ALL_COLORS.length]!, 0.3, 0.38, 0)
      }
    }
    this.host.shake(dt * 1.95 * k)
    if (this.chargeT >= PRISM_CHARGE) {
      this.chargeT = -1
      this.prism.visible = false
      this.beam.hide()
      this.startSweep('prism')
      this.host.sfx('chargeShotBig', this.x, this.z)
    }
  }

  // ─── Hits ──────────────────────────────────────────────────────────────────

  /** A player shot meets the giant: the live part takes it, the others ring. */
  shot(s: Shot): boolean {
    if (s.owner !== 'player' || (this.state !== 'fight' && this.state !== 'intro')) return false
    if (this.state === 'intro' && !this.root.visible) return false
    for (const part of this.parts) {
      if (part.gone || !part.root.visible) continue
      const wx = this.x + part.wx
      const wz = this.z + part.wz
      // (It sinks once its feet are gone: the parts with it.)
      const d = Math.hypot(s.x - wx, s.y - (part.wy + this.root.position.y), s.z - wz)
      const outer = part.r * 1.9 + s.radius
      if (d > outer) continue
      const live = this.state === 'fight' && (GM_PHASES[this.phase] ?? []).includes(part.id)
      if (!live) {
        this.host.fx.sparks(s.x, s.y, s.z, '#ffffff', 6, 4, 0.14)
        pushHud({ t: 'text', x: s.x, y: s.y + 0.3, z: s.z, key: 'combat.tink', color: '#dfe7ff' })
        this.host.sfx('tink', s.x, s.z)
        return true
      }
      const weakSpot = d <= part.r + s.radius
      const weak = !!s.weapon && s.kind === 'special' && s.weapon === part.weakTo
      const dmg = Math.max(1, Math.round(s.dmg * (weakSpot ? WEAK_SPOT_MUL : 1) * (weak ? WEAKNESS_MUL : 1)))
      this.hit(part, dmg, s, weak || weakSpot)
      return true
    }
    return false
  }

  private hit(part: Part, dmg: number, s: Shot, strong: boolean): void {
    const h = this.host
    part.hp -= dmg
    part.flash = 1
    pushHud({ t: 'damage', x: s.x, y: s.y + 0.2, z: s.z, amount: dmg, crit: s.crit, weak: strong, toPlayer: false })
    h.fx.sparks(s.x, s.y, s.z, MASTER_COLOR[part.master], 8, 5, 0.16)
    h.sfx(strong ? 'hitHeavy' : 'hit', s.x, s.z)
    this.syncBar()
    if (part.hp <= 0) this.breakPart(part)
  }

  private breakPart(part: Part): void {
    const h = this.host
    part.hp = 0
    part.gone = true
    part.fallT = 0
    h.fx.orbBurst(this.x + part.wx, part.wy + this.root.position.y, this.z + part.wz, MASTER_COLOR[part.master], 2)
    h.sfx('explode', this.x + part.wx, this.z)
    h.shake(0.5)
    if (part.id === 'armL' || part.id === 'armR') this.armNext = -1
    const next = this.currentPhase()
    if (next >= GM_PHASES.length) {
      this.state = 'dying'
      this.t = 0
      this.marker.visible = false
      this.beam.hide()
      this.prism.visible = false
      this.sweepT = -1
      this.chargeT = -1
      this.bodyPick = null
      return
    }
    if (next !== this.phase) {
      this.phase = next
      this.sweepT = -1
      this.chargeT = -1
      this.beam.hide()
      this.prism.visible = false
      h.say(`hint.gm.${PHASE_LINE[next]}`)
      // The body crashes down a little once the feet are gone: the head is in reach.
      if (next === 2) this.root.position.y = HOVER_Y
      // With no legs left, it flies: the wings unfold out of its back.
      if (next >= 2) this.deployWings(false)
    }
  }

  private stepFall(part: Part, dt: number): void {
    if (part.fallT < 0) return
    part.fallT += dt
    const k = part.fallT
    part.root.position.y = -4.9 * k * k
    part.root.rotation.z = (part.wx >= 0 ? -1 : 1) * k * 1.4
    if (k > 1.3) {
      part.root.visible = false
      part.fallT = -1
    }
  }

  private stepDeath(dt: number): void {
    const h = this.host
    const before = this.t
    this.t += dt
    // Chain explosions round the wreck, a flash every third of a second at most.
    if (Math.floor(this.t * 5) !== Math.floor(before * 5)) {
      const part = this.parts[Math.floor(Math.random() * this.parts.length)]!
      h.fx.orbBurst(this.x + part.wx + (Math.random() - 0.5) * 2, part.wy + Math.random() + this.root.position.y, this.z + part.wz, MASTER_COLOR[part.master], 1.6)
      h.sfx('explode', this.x, this.z)
      h.shake(0.3)
    }
    if (Math.floor(this.t * 3) !== Math.floor(before * 3)) pushHud({ t: 'flash', color: '#ffffff', strength: 0.35 })
    if (this.t >= DEATH_S) {
      this.state = 'done'
      this.root.visible = false
      this.beam.hide()
      hud.bossName = ''
      hud.bossMarks = []
      showBanner('bossDown')
      h.onDefeated()
    }
  }

  // ─── The save (the climb's feature slot) ───────────────────────────────────

  save(): unknown {
    if (this.state === 'dormant') return null
    return { s: this.state === 'done' || this.state === 'dying' ? 'done' : 'fight', hp: this.parts.map(p => Math.round(p.hp)) }
  }

  restore(s: unknown): void {
    const o = s as { s?: string; hp?: unknown } | null
    if (!o || typeof o !== 'object') return
    if (Array.isArray(o.hp)) {
      o.hp.forEach((v, i) => {
        const p = this.parts[i]
        if (!p || typeof v !== 'number') return
        p.hp = Math.max(0, Math.min(p.max, v))
        p.gone = p.hp <= 0
      })
    }
    if (o.s === 'done') {
      this.state = 'done'
      this.root.visible = false
      return
    }
    // Back to the fight as it stood: no intro, no second banner.
    if (this.currentPhase() >= 2) {
      this.root.position.y = HOVER_Y
      this.deployWings(true)
    }
    this.wake(true)
  }

  dispose(): void {
    this.drops.clear()
    this.root.removeFromParent()
    this.button.removeFromParent()
    this.beam.dispose()
    for (const o of [this.root, this.button]) {
      o.traverse(n => { const m = n as Mesh; if (m.isMesh) m.geometry.dispose() })
    }
    for (const m of this.owned) m.dispose()
  }
}

/** The stomp's hop by the time left before it lands (`stompT`): a crouch,
 *  the rise, the slam; 0 the rest of the time. In hops (×STOMP_HOP). */
const hopAt = (left: number): number => {
  if (left >= STOMP_TELL || left <= 0) return 0
  const crouchEnd = STOMP_TELL - 0.25
  if (left > crouchEnd) return -0.2 * Math.sin((STOMP_TELL - left) / 0.25 * Math.PI / 2)
  if (left > 0.18) {
    const k = (crouchEnd - left) / (crouchEnd - 0.18)
    return -0.2 + 1.2 * (1 - (1 - k) * (1 - k))
  }
  const k = (0.18 - left) / 0.18
  return 1 - k * k
}

/** The wing beat at `ph` (0..1): -1 wings down, +1 up; up slowly over
 *  WING_UP_SHARE of it, then down fast. */
const wingStroke = (ph: number): number => ph < WING_UP_SHARE
  ? -Math.cos(ph / WING_UP_SHARE * Math.PI)
  : Math.cos((ph - WING_UP_SHARE) / (1 - WING_UP_SHARE) * Math.PI)

/** Atlas's line as each phase begins. */
const PHASE_LINE = ['arms', 'feet', 'head', 'body'] as const

/** Test seam: the giant's colours, phase by phase. */
export const __gmColor = (id: PartId): Color => new Color(MASTER_COLOR[PART_OF[id]])
