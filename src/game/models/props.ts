import { Group, Mesh, MeshBasicMaterial, AdditiveBlending, Color, CylinderGeometry, DoubleSide, BufferGeometry, Float32BufferAttribute, PlaneGeometry, CanvasTexture, SRGBColorSpace } from 'three'
import { drawVexFace } from './street'
import { buildEnemyRig, type EnemyColors } from './enemies'
import { rcyl, rbox, torus, sph, ell, cap, xform, paint, paintBy, merge, lathe } from './kit'
import { toonVC, glowVC, outlineMat } from './toon'
import { PAL, RARITY_COLOR } from './palette'
import type { Theme } from '../world/themes'
import { CELL, WALL_H } from '../world/levelGen'

/**
 * Props — doors, the teleporter pad, crates, energy barrels, chests, pickups,
 * data cores. All static meshes (no skeleton); each is at most three draw
 * calls (toon body, glow parts, outline).
 */

export interface PropMesh {
  root: Group
  body: Mesh | null
  glow: Mesh | null
}

const assemble = (toonParts: BufferGeometry[], glowParts: BufferGeometry[], outline = 0.02): PropMesh => {
  const root = new Group()
  let body: Mesh | null = null
  let glow: Mesh | null = null
  if (toonParts.length) {
    const g = merge(toonParts)
    body = new Mesh(g, toonVC())
    root.add(body)
    if (outline > 0) {
      const o = new Mesh(g, outlineMat(outline))
      o.renderOrder = -1
      root.add(o)
    }
  }
  if (glowParts.length) {
    glow = new Mesh(merge(glowParts), glowVC())
    root.add(glow)
  }
  return { root, body, glow }
}

// ─── Door ────────────────────────────────────────────────────────────────────

/**
 * The boss shutter's warning kit, animated by the mission (`updateDoors`):
 * two beacons whose light fans sweep the corridor, a red glow pooled on the
 * floor in front of the gate and three chevrons marching into it.
 */
export interface BossDoorFx {
  beacons: Group[]
  /** The beacons' glass domes and light fans (one material each, pulsed). */
  domeMat: MeshBasicMaterial
  beamMat: MeshBasicMaterial
  floorMat: MeshBasicMaterial
  chevronMats: MeshBasicMaterial[]
  /** Warning strength 0..1, eased by the mission (it powers down once the
   *  boss has fallen). */
  level: number
  /** Dr. Vex on the screen over the gate (the mission flickers it). */
  screenMat: MeshBasicMaterial
}

/** Dr. Vex's face for the boss gates' screens, drawn once (the intro's own
 *  drawing, `drawVexFace`, at a gate screen's size). */
let vexScreen: CanvasTexture | null = null
const vexScreenTexture = (): CanvasTexture => {
  if (vexScreen) return vexScreen
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 160
  const g = c.getContext('2d')
  if (g) drawVexFace(g, 256, 160)
  vexScreen = new CanvasTexture(c)
  vexScreen.colorSpace = SRGBColorSpace
  return vexScreen
}

export interface DoorMesh {
  root: Group
  /** What moves: a plain door's two halves (ONE group, lifted and squashed
   *  as one) or the boss door's shutter. */
  panels: Group[]
  /** A plain door's halves parted sideways, 0 (shut) .. 1 (0.35 m each):
   *  a morph target, so both halves draw as one mesh. No-op on the boss door. */
  part(k: number): void
  boss: boolean
  lamp: Mesh
  lampMat: MeshBasicMaterial
  /** Boss door only. */
  warn: BossDoorFx | null
}

// The danger livery is the same in every sector — yellow and black like a
// real machine guard, red light — so "a Core Master waits here" is one sign
// the player learns once, not a sector colour to decode each time.
const DANGER_YELLOW = '#ffc21a'
const DANGER_BLACK = '#1b1d24'
const DANGER_STEEL = '#343846'
const DANGER_RED = '#ff3040'

/** Diagonal hazard stripes, `per` bands per metre along (y ± z). */
const hazard = (per: number, flip = 1) => (x: number, y: number, z: number) =>
  (Math.floor((y + (z + x * 0.35) * flip) * per) & 1 ? DANGER_YELLOW : DANGER_BLACK)

/** A flat quad on the floor (XZ), vertex colour fading c0 → c1 from z0 to z1.
 *  Under additive blending black adds nothing, so the fade needs no texture. */
const floorFade = (x0: number, x1: number, z0: number, z1: number, c0: Color, c1: Color): BufferGeometry => {
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute([x0, 0, z0, x1, 0, z0, x1, 0, z1, x0, 0, z1], 3))
  g.setAttribute('color', new Float32BufferAttribute([c0.r, c0.g, c0.b, c0.r, c0.g, c0.b, c1.r, c1.g, c1.b, c1.r, c1.g, c1.b], 3))
  g.setIndex([0, 2, 1, 0, 3, 2])
  return g
}

/** A floor chevron pointing along -Z·dir (into the gate), centred at z. */
const chevron = (z: number, dir: number, span: number, depth: number, thick: number): BufferGeometry => {
  const pts: number[] = []
  const idx: number[] = []
  for (const s of [-1, 1]) {
    // One arm: from the tip (x 0) out to the side, trailing back by `depth`.
    const b = pts.length / 3
    const tipZ = z - dir * depth / 2
    const endZ = z + dir * depth / 2
    pts.push(0, 0, tipZ, s * span, 0, endZ, s * span, 0, endZ + dir * thick, 0, 0, tipZ + dir * thick)
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3)
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pts, 3))
  g.setIndex(idx)
  return g
}

/** A beacon's light fan: two wedges back to back along ±X, bright at the
 *  lamp, black (= nothing, additively) at the far end. */
const lightFan = (len: number, spread: number): BufferGeometry => {
  const pts: number[] = []
  const col: number[] = []
  const c = new Color(DANGER_RED)
  for (const s of [-1, 1]) {
    for (const [dy, dz] of [[spread, 0], [0, spread]] as const) {
      pts.push(0, 0, 0, s * len, dy, dz, s * len, -dy, -dz)
      col.push(c.r, c.g, c.b, 0, 0, 0, 0, 0, 0)
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pts, 3))
  g.setAttribute('color', new Float32BufferAttribute(col, 3))
  return g
}

const additive = (color: string, opacity: number, vertexColors = false): MeshBasicMaterial => new MeshBasicMaterial({
  color: new Color(color), vertexColors, transparent: true, opacity, blending: AdditiveBlending,
  depthWrite: false, side: DoubleSide, toneMapped: false, fog: false
})

/**
 * A sliding double door built in local space with the doorway spanning X
 * (width = one cell) and facing ±Z. The mission rotates it to the corridor.
 * The boss door is a single heavy shutter of rounded slats that LIFTS — the
 * classic boss-gate silhouette — set in a hazard-striped frame with a robot
 * skull over it, warning beacons and a red pool of light on the approach
 * side (`approach`: the sign of local Z the corridor lies on).
 */
export const buildDoor = (theme: Theme, boss: boolean, approach: 1 | -1 = 1): DoorMesh => {
  const root = new Group()
  const panels: Group[] = []
  const w = CELL
  const h = WALL_H - 0.9
  if (boss) return buildBossDoor(root, panels, w, h, approach)
  // Both halves in one body, one outline and one glow (three draw calls, not
  // six): each half lies wholly on its own side of x = 0, and a morph target
  // slides every vertex 0.35 m outward along x by its side.
  const toon: BufferGeometry[] = []
  const glowG: BufferGeometry[] = []
  for (const s of [-1, 1]) {
    toon.push(xform(paint(rbox(w / 2 - 0.05, h, 0.34, 0.3), theme.crate), [s * (w / 4), h / 2, 0]))
    // Chevron stripes on the leading edges
    toon.push(paintBy(
      xform(rbox(0.26, h - 0.3, 0.4, 0.3), [s * 0.16, h / 2, 0]),
      (_x, y) => (Math.floor(y * 2.6) & 1 ? theme.hazard : theme.crateTrim)
    ))
    toon.push(xform(paint(ell(0.36, 0.36, 0.08), theme.crateTrim), [s * (w / 4), h * 0.62, 0.18]))
    toon.push(xform(paint(ell(0.36, 0.36, 0.08), theme.crateTrim), [s * (w / 4), h * 0.62, -0.18]))
    glowG.push(
      xform(paint(sph(0.12, 10, 8), theme.accent), [s * (w / 4), h * 0.62, 0.24]),
      xform(paint(sph(0.12, 10, 8), theme.accent), [s * (w / 4), h * 0.62, -0.24])
    )
  }
  const leaves = assemble([partMorph(merge(toon))], [partMorph(merge(glowG))], 0.025)
  panels.push(leaves.root)
  root.add(leaves.root)
  const slid: Mesh[] = []
  leaves.root.traverse((o) => { if ((o as Mesh).morphTargetInfluences) slid.push(o as Mesh) })
  const part = (k: number): void => { for (const m of slid) m.morphTargetInfluences![0] = k }
  const lampMat = new MeshBasicMaterial({ color: new Color(PAL.glowGreen), toneMapped: false })
  const lamp = new Mesh(new CylinderGeometry(0.16, 0.16, 0.12, 12), lampMat)
  lamp.rotation.x = Math.PI / 2
  lamp.position.set(0, h + 0.35, 0)
  root.add(lamp)
  return { root, panels, part, boss, lamp, lampMat, warn: null }
}

/** How far each half of a plain door slides aside when parted (m). */
const DOOR_PART = 0.35

/** A plain door's geometry with one morph target: every vertex out along x,
 *  away from the middle, by DOOR_PART (its half's side is its x's sign). */
const partMorph = (g: BufferGeometry): BufferGeometry => {
  const pos = g.attributes.position!
  const d = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i++) d[i * 3] = Math.sign(pos.getX(i)) * DOOR_PART
  g.morphAttributes.position = [new Float32BufferAttribute(d, 3)]
  g.morphTargetsRelative = true
  return g
}

const buildBossDoor = (root: Group, panels: Group[], w: number, h: number, approach: 1 | -1): DoorMesh => {
  // ── The shutter: dark steel slats, every other one hazard-striped, and the
  // red eye in the middle on both faces.
  const toon: BufferGeometry[] = []
  const slats = 6
  for (let k = 0; k < slats; k++) {
    const y = (k + 0.5) * (h / slats)
    const slat = xform(rbox(w - 0.1, h / slats - 0.04, 0.5, 0.45), [0, y, 0])
    toon.push(k % 2 ? paintBy(slat, hazard(2.4)) : paint(slat, DANGER_STEEL))
  }
  toon.push(xform(paint(ell(0.66, 0.66, 0.2), DANGER_BLACK), [0, h * 0.55, 0]))
  const glowG = [
    xform(paint(ell(0.5, 0.5, 0.12), PAL.glowRed), [0, h * 0.55, 0.28]),
    xform(paint(ell(0.5, 0.5, 0.12), PAL.glowRed), [0, h * 0.55, -0.28])
  ]
  const shutter = assemble(toon, glowG, 0.03)
  panels.push(shutter.root)
  root.add(shutter.root)

  // ── The frame: two striped jambs the shutter runs in, a striped lintel,
  // and Dr. Vex grinning from a screen over the gate on the approach face
  // (the face from the intro: every Core Master's gate is his show).
  const frame: BufferGeometry[] = []
  const jx = w / 2 - 0.06
  for (const s of [-1, 1]) {
    frame.push(paintBy(xform(rbox(0.36, h + 0.62, 0.96, 0.2), [s * jx, (h + 0.62) / 2, 0]), hazard(2.2, s)))
    frame.push(xform(paint(rcyl(0.2, 0.22, 0.05, 14), DANGER_BLACK), [s * jx, h + 0.73, 0]))
  }
  frame.push(paintBy(xform(rbox(w + 0.5, 0.62, 1.0, 0.25), [0, h + 0.31, 0]), hazard(2.4)))
  const az = approach * 0.52
  // The screen's housing: a dark bezel with a red rim, on two brackets.
  frame.push(xform(paint(rbox(1.72, 1.08, 0.16, 0.12, 4, 2), '#1a0a10'), [0, h + 0.62, az]))
  frame.push(xform(paint(rbox(1.84, 1.2, 0.08, 0.1, 4, 2), '#7a1222'), [0, h + 0.62, az - approach * 0.05]))
  for (const s of [-1, 1]) frame.push(xform(paint(rbox(0.12, 0.5, 0.2, 0.05, 4, 2), DANGER_BLACK), [s * 0.7, h + 0.16, az - approach * 0.04]))
  const f = assemble(frame, [], 0.028)
  root.add(f.root)
  const screenMat = new MeshBasicMaterial({ map: vexScreenTexture(), toneMapped: false, transparent: true })
  const screen = new Mesh(new PlaneGeometry(1.56, 0.96), screenMat)
  screen.position.set(0, h + 0.62, az + approach * 0.09)
  if (approach < 0) screen.rotation.y = Math.PI
  root.add(screen)

  // Under the screen, a lamp bar is the door's state lamp (red locked,
  // yellow opening, cyan open): the mission drives `lampMat` as on every door.
  const lampMat = new MeshBasicMaterial({ color: new Color(PAL.glowRed), toneMapped: false })
  const lamp = new Mesh(paint(xform(rbox(1.2, 0.1, 0.06, 0.04, 4, 2), [0, h + 0.02, az + approach * 0.08]), '#ffffff'), lampMat)
  root.add(lamp)

  // ── Beacons on the jambs: a red glass dome and a light fan that sweeps.
  const domeMat = new MeshBasicMaterial({ color: new Color(DANGER_RED), toneMapped: false })
  const beamMat = additive('#ffffff', 0.55, true)
  const beacons: Group[] = []
  const domeG = lathe([[0.001, 0.2], [0.1, 0.18], [0.15, 0.1], [0.16, 0]], 12)
  const fanG = lightFan(2.6, 0.34)
  for (const s of [-1, 1]) {
    const b = new Group()
    b.position.set(s * jx, h + 0.78, 0)
    b.add(new Mesh(domeG, domeMat))
    const fan = new Mesh(fanG, beamMat)
    fan.position.y = 0.1
    fan.renderOrder = 2
    b.add(fan)
    beacons.push(b)
    root.add(b)
  }

  // ── On the corridor floor: a pooled red glow and three chevrons into the gate.
  const floorMat = additive('#ffffff', 0.6, true)
  const pool = new Mesh(floorFade(-w / 2 + 0.1, w / 2 - 0.1, approach * 0.5, approach * (0.5 + CELL * 1.8), new Color(DANGER_RED).multiplyScalar(0.8), new Color(0, 0, 0)), floorMat)
  pool.position.y = 0.025
  pool.renderOrder = 1
  root.add(pool)
  const chevronMats: MeshBasicMaterial[] = []
  for (let k = 0; k < 3; k++) {
    const m = additive(DANGER_YELLOW, 0.5)
    const c = new Mesh(chevron(approach * (1.3 + k * 1.25), approach, 0.9, 0.55, 0.22), m)
    c.position.y = 0.03
    c.renderOrder = 1
    chevronMats.push(m)
    root.add(c)
  }
  return { root, panels, part: () => {}, boss: true, lamp, lampMat, warn: { beacons, domeMat, beamMat, floorMat, chevronMats, level: 1, screenMat } }
}

// ─── Teleporter pad ──────────────────────────────────────────────────────────

export interface PadMesh extends PropMesh {
  ring: Mesh
  ringMat: MeshBasicMaterial
  /**
   * The light column for a first-person camera; call it every sim step (the
   * mission does). `distToAxis` is the camera's distance from the pad's axis
   * in plan view, `active` is true during beam-in and beam-out. Full while
   * active, then a slow fade; gone while the camera is within ~2 m of the pad
   * (standing at the rim of a lit column tints part of the screen behind a
   * hard edge); a faint pulse from further off. The first call also turns on
   * the soft edges. The hub never calls it: its far camera keeps the plain
   * tube at the opacity it sets.
   */
  setBeamView(distToAxis: number, active: boolean, dt: number): void
}

/** The light column: radius and height (it stands on the pad, 0.3 → 3.5 m). */
const COL_R = 0.9
const COL_H = 3.2
/** Column opacity during beam-in and beam-out, and its idle glow (± 0.08). */
const BEAM_FULL = 0.85
const BEAM_IDLE = 0.18

const smooth = (a: number, b: number, x: number): number => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return k * k * (3 - 2 * k)
}

// Soft edges for the column, patched into its MeshBasicMaterial so `opacity`
// keeps its meaning for the hub and the mission alike. Alpha follows how
// squarely the view meets the column in plan view: 1 through its middle and
// 0 at its silhouette, so it reads as a glowing volume, not a tube with an
// outline. It thins out within a metre of the camera, where the near plane
// would slice it into a hard edge, and fades in from the base and out toward
// the open top, whose rim would cut a hard ring into the view from inside.
// The vertex stage hands over small relative vectors, so the fragment math
// stays exact anywhere on the map. uSoft = 0 renders the plain tube, as is.
const COL_VARY = /* glsl */`
varying vec2 vColR;
varying vec3 vColV;
varying float vColH;
`
const COL_VERT = /* glsl */`
vec4 colW = modelMatrix * vec4( transformed, 1.0 );
vColR = colW.xz - ( modelMatrix * vec4( 0.0, transformed.y, 0.0, 1.0 ) ).xz;
vColV = cameraPosition - colW.xyz;
vColH = position.y / ${COL_H.toFixed(2)} + 0.5;
`
const COL_FRAG = /* glsl */`
float colLen = length( vColV.xz );
float colFace = colLen > 1e-4 ? abs( dot( normalize( vColR ), vColV.xz ) ) / colLen : 0.0;
float colSoft = colFace * colFace * smoothstep( 0.1, 0.8, length( vColV ) )
  * smoothstep( 0.0, 0.1, vColH ) * ( 1.0 - smoothstep( 0.3, 1.0, vColH ) );
diffuseColor.a *= mix( 1.0, colSoft, uSoft );
`

/** Patches the soft edges in; returns their switch (`value` 0 = plain tube).
 *  Every pad shares the patched program: only the uniform differs. */
const softenColumn = (mat: MeshBasicMaterial): { value: number } => {
  const soft = { value: 0 }
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uSoft = soft
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>${COL_VARY}`)
      .replace('#include <fog_vertex>', `#include <fog_vertex>${COL_VERT}`)
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uSoft;${COL_VARY}`)
      .replace('#include <opaque_fragment>', `${COL_FRAG}#include <opaque_fragment>`)
  }
  return soft
}

export const buildTeleporter = (theme: Theme): PadMesh => {
  const toon = [
    xform(paint(rcyl(1.25, 0.28, 0.12, 28), theme.pilaster), [0, 0.14, 0]),
    xform(paint(torus(1.18, 0.1, 8, 32), theme.trim), [0, 0.28, 0], [Math.PI / 2, 0, 0]),
    xform(paint(rcyl(0.9, 0.1, 0.04, 28), theme.crateTrim), [0, 0.3, 0])
  ]
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2
    toon.push(xform(paint(rcyl(0.14, 0.5, 0.06, 10), theme.trim), [Math.cos(a) * 1.35, 0.25, Math.sin(a) * 1.35]))
  }
  const glowParts = [xform(paint(rcyl(0.78, 0.06, 0.02, 28), PAL.glowCyan), [0, 0.35, 0])]
  const p = assemble(toon, glowParts, 0.03)
  const ringMat = new MeshBasicMaterial({
    color: new Color(PAL.glowCyan), transparent: true, opacity: 0.5, blending: AdditiveBlending,
    depthWrite: false, side: DoubleSide, toneMapped: false
  })
  const soft = softenColumn(ringMat)
  const ring = new Mesh(new CylinderGeometry(COL_R, COL_R, COL_H, 28, 1, true), ringMat)
  ring.position.y = 0.3 + COL_H / 2
  p.root.add(ring)

  let lit = -1 // 0..1: how far the column is beaming; −1 until the first call
  let t = 0
  const setBeamView = (distToAxis: number, active: boolean, dt: number): void => {
    soft.value = 1
    t += dt
    // Snaps on the first call (the beam-in's first frame); after that a beam
    // lights up quickly and dies away slowly.
    const want = active ? 1 : 0
    lit = lit < 0 ? want : want > lit ? Math.min(want, lit + dt / 0.25) : Math.max(want, lit - dt / 0.8)
    // Beaming, but not with the camera at the wall (a beam-out beside the
    // pad): the far side would tint half the screen, up to the wall.
    const rim = smooth(0.12, 0.45, Math.abs(distToAxis - COL_R))
    // Idle: a faint pulse from afar, nothing on or beside the pad.
    const idle = (BEAM_IDLE + Math.sin(t * 2.4) * 0.08) * smooth(1.8, 3, distToAxis)
    ringMat.opacity = BEAM_FULL * lit * rim + idle * (1 - lit)
    // Seen from inside, even a blank column is a transparent pass over the
    // whole screen: skip the draw while there is nothing to show.
    ring.visible = ringMat.opacity > 0.004
  }
  return { ...p, ring, ringMat, setBeamView }
}

// ─── Crate & barrel (breakable) ──────────────────────────────────────────────

export const buildCrate = (theme: Theme): PropMesh => {
  const s = 1.15
  const toon = [
    xform(paint(rbox(s, s, s, 0.28), theme.crate), [0, s / 2, 0]),
    // Rounded corner bumpers
    ...[-1, 1].flatMap(a => [-1, 1].map(b => xform(paint(sph(0.2, 10, 8), theme.crateTrim), [a * s * 0.42, s * 0.9, b * s * 0.42]))),
    xform(paint(ell(s * 0.36, s * 0.36, 0.06), theme.crateTrim), [0, s / 2, s * 0.5]),
    xform(paint(ell(s * 0.36, s * 0.36, 0.06), theme.crateTrim), [0, s / 2, -s * 0.5])
  ]
  const glowParts = [
    xform(paint(sph(0.09, 8, 6), theme.accent), [0, s / 2, s * 0.54]),
    xform(paint(sph(0.09, 8, 6), theme.accent), [0, s / 2, -s * 0.54])
  ]
  return assemble(toon, glowParts, 0.028)
}

export const buildBarrel = (theme: Theme): PropMesh => {
  const toon = [
    xform(paint(rcyl(0.46, 1.3, 0.18, 18), theme.pipe), [0, 0.65, 0]),
    xform(paint(torus(0.47, 0.06, 6, 18), theme.crateTrim), [0, 0.3, 0], [Math.PI / 2, 0, 0]),
    xform(paint(torus(0.47, 0.06, 6, 18), theme.crateTrim), [0, 1.0, 0], [Math.PI / 2, 0, 0])
  ]
  const glowParts = [xform(paint(rcyl(0.475, 0.22, 0.05, 18), PAL.glowOrange), [0, 0.65, 0])]
  return assemble(toon, glowParts, 0.028)
}

// ─── Chest ───────────────────────────────────────────────────────────────────

export interface ChestMesh {
  root: Group
  lid: Group
  lampMat: MeshBasicMaterial
}

/** Supply chest: a rounded capsule-crate with a hinged lid and a glowing lock. */
export const buildChest = (theme: Theme, rarity: keyof typeof RARITY_COLOR = 'standard'): ChestMesh => {
  const root = new Group()
  const trim = rarity === 'standard' ? theme.trim : RARITY_COLOR[rarity]
  const base = assemble([
    xform(paint(rbox(1.5, 0.75, 0.95, 0.35), theme.crateTrim), [0, 0.4, 0]),
    xform(paint(rbox(1.56, 0.16, 1.0, 0.5), trim), [0, 0.1, 0]),
    xform(paint(rbox(1.56, 0.12, 1.0, 0.5), trim), [0, 0.74, 0])
  ], [], 0.028)
  root.add(base.root)
  const lid = new Group()
  lid.position.set(0, 0.78, -0.47)
  const lidMesh = assemble([
    xform(paint(rbox(1.5, 0.42, 0.95, 0.35), theme.crate), [0, 0.18, 0.47]),
    xform(paint(rbox(0.3, 0.46, 1.0, 0.5), trim), [-0.45, 0.18, 0.47]),
    xform(paint(rbox(0.3, 0.46, 1.0, 0.5), trim), [0.45, 0.18, 0.47])
  ], [], 0.028)
  lid.add(lidMesh.root)
  root.add(lid)
  const lampMat = new MeshBasicMaterial({ color: new Color(RARITY_COLOR[rarity]), toneMapped: false })
  const lamp = new Mesh(xform(sph(0.13, 12, 8), [0, 0.62, 0.5]), lampMat)
  root.add(lamp)
  return { root, lid, lampMat }
}

// ─── Pickups ─────────────────────────────────────────────────────────────────

/** Bolt (currency): a hex-headed bolt with a rounded shaft. Spins in world. */
export const buildBolt = (): PropMesh => {
  const head = new CylinderGeometry(0.16, 0.16, 0.1, 6)
  head.deleteAttribute('uv')
  return assemble([
    xform(paint(head, '#ffd84a'), [0, 0.09, 0]),
    xform(paint(cap(0.06, 0.16, 8, 2), '#e6e9f2'), [0, -0.06, 0])
  ], [], 0.012)
}

/** Health (red/white) or weapon-energy (blue/white) capsule. */
export const buildCapsule = (kind: 'hp' | 'we', big: boolean): PropMesh => {
  const s = big ? 1.4 : 1
  const col = kind === 'hp' ? '#ff4a5a' : '#3a8bff'
  const toon = [
    xform(paint(ell(0.17 * s, 0.14 * s, 0.14 * s), '#f4f7ff'), [-0.09 * s, 0, 0]),
    xform(paint(ell(0.17 * s, 0.14 * s, 0.14 * s), col), [0.09 * s, 0, 0])
  ]
  const glowParts = [xform(paint(torus(0.13 * s, 0.03 * s, 6, 14), kind === 'hp' ? PAL.glowRed : PAL.glowCyan), [0, 0, 0], [0, Math.PI / 2, 0])]
  return assemble(toon, glowParts, 0.012)
}

/** Data core (collect objective): a floating glowing octa-sphere in a ring cage. */
export const buildDataCore = (): PropMesh => {
  const toon = [
    xform(paint(torus(0.36, 0.05, 6, 20), PAL.steel), [0, 0, 0], [Math.PI / 2, 0, 0]),
    xform(paint(torus(0.36, 0.05, 6, 20), PAL.steel), [0, 0, 0], [0, 0, 0])
  ]
  const glowParts = [xform(paint(sph(0.22, 8, 6), PAL.glowGreen), [0, 0, 0])]
  return assemble(toon, glowParts, 0.015)
}

/** Exit beacon: the pillar of light the player walks into to beam out. */
export const buildBeacon = (): { root: Group; mat: MeshBasicMaterial } => {
  const root = new Group()
  const mat = new MeshBasicMaterial({
    color: new Color(PAL.glowCyan), transparent: true, opacity: 0.35, blending: AdditiveBlending,
    depthWrite: false, side: DoubleSide, toneMapped: false
  })
  const g = lathe([[0.9, 0], [0.75, 3], [0.2, 9]], 24)
  root.add(new Mesh(g, mat))
  return { root, mat }
}

// ─── Training target (the charge-shot lesson) ────────────────────────────────

/** The training drone's paint: blue and white, a friendly practice machine. */
/** The training drones' blue: a machine that is only there to be shot. */
export const TRAINING_DRONE: EnemyColors = { main: '#3c8dff', deep: '#1f4fb0', accent: '#dff1ff', eye: '#7ff4ff', metal: '#8fa3c8' }

export interface TrainingTargetMesh {
  root: Group
  /** The bullseye drone; bobs and turns to face the player. */
  body: Group
  /** Side rotor pods (spin). */
  rotors: Group[]
}

/**
 * A hovering training drone. Quick shots skip off it; a charged shot pops it
 * — the charge shot's first lesson, with no words. No bubble round it
 * (playtest 2026-10-07: the circle read as a target ring, not as armour, and
 * hid the machine). Built around its hover centre, front = +Z.
 */
export const buildTrainingTarget = (): TrainingTargetMesh => {
  const root = new Group()
  const body = new Group()
  root.add(body)
  // A real Rotor Drone, painted training blue and unarmed (playtesters took
  // the old bullseye for scenery and walked past it): the same machine they
  // will meet, so the lesson transfers. Its rotor spins with the "pods".
  const rig = buildEnemyRig('heli', TRAINING_DRONE)
  rig.root.scale.setScalar(0.9)
  rig.root.position.y = -0.45
  body.add(rig.root)
  const rotors: Group[] = []
  const rotor = rig.bones.rotor
  if (rotor) rotors.push(rotor as unknown as Group)
  return { root, body, rotors }
}
