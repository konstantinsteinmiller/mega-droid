import {
  BufferGeometry, Color, CylinderGeometry, DynamicDrawUsage, Float32BufferAttribute, Group, InstancedMesh, Matrix4, Mesh,
  Quaternion, ShaderMaterial, Vector3, type Material
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { sph, ell, torus, dome, cap, rcyl, rbox, xform, paint, type V3 } from '../models/kit'
import type { Theme } from './themes'
import type { MapData } from './levelGen'
import { CELL, WALL_H } from './levelGen'
import { noSlice, type Slice } from '../engine/slicer'
import { sceneQuality, type SceneQuality } from '../engine/quality'
import { SkyTargets } from './skyTargets'

/**
 * ─── The city around every sector ────────────────────────────────────────────
 *
 * Cyber City is a city, and a mission's walls are only its nearest block.
 * Beyond them stands a skyline of a far-future city (towers stepped, round,
 * twisted, needle-thin, twinned by skybridges; domes; and a handful of
 * landmarks no present-day city has: an arcology pyramid, a tower wearing a
 * halo ring, a leaning arch, a disc district floating on its own lift, a sphere
 * on a tripod and a space-elevator tether), and above it the sky is busy:
 * quadcopter drones, flying taxis, police cruisers with their light bars
 * flashing, cargo haulers, an ad blimp, a freighter high up, and rockets
 * lifting off from the spaceport now and then.
 *
 * All of it stays well away from the level: the city starts some 30 m beyond
 * the walls' reach, and every sky lane runs round or past the level, never over
 * it, so nothing flies directly over the player's head.
 *
 * Cheap by construction:
 * - The whole skyline is TWO merged meshes (bodies, lights) with one small
 *   shader: flat colours with the shading baked in, windows drawn
 *   procedurally on every wall (no texture, antialiased by distance), and its
 *   own haze toward the sector's fog colour by distance. The scene's fog would
 *   wipe anything past ~70 m; the haze keeps the city visible but far.
 * - Every vehicle kind is ONE instanced mesh, its lights merged in (one draw
 *   call a kind), placed each frame from closed-form paths: no simulation, a
 *   few dozen matrices.
 * - Deterministic from the map seed, so a resumed mission sees the same city.
 */

// ─── The shader ──────────────────────────────────────────────────────────────

const VERT = /* glsl */`
#include <common>
#include <color_pars_vertex>
attribute vec2 aW;
uniform float uHazeNear;
uniform float uHazeFar;
uniform float uHazeMax;
uniform float uHazeLit;
uniform float uReveal;
varying float vHaze;
varying vec2 vW;
varying vec2 vUv;
void main() {
  #include <color_vertex>
  vec4 wp = vec4( position, 1.0 );
  #ifdef USE_INSTANCING
    wp = instanceMatrix * wp;
  #endif
  wp = modelMatrix * wp;
  float d = distance( wp.xyz, cameraPosition );
  float hazeMax = uHazeMax;
  #ifdef VEHICLE
    // A vehicle's lights (aW.y = 1) cut through the haze further than its body.
    hazeMax = mix( uHazeMax, uHazeLit, aW.y );
  #endif
  // A streamed piece rises out of the haze: fully fogged until revealed.
  vHaze = mix( 1.0, hazeMax * smoothstep( uHazeNear, uHazeFar, d ), uReveal );
  vW = aW;
  // Windows: along the wall (baked arc length), and storeys up it.
  vUv = vec2( aW.x / 2.6, position.y / 3.4 );
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`

const FRAG = /* glsl */`
#include <common>
#include <color_pars_fragment>
uniform vec3 uFog;
uniform vec3 uGlass;
uniform vec3 uLit;
uniform float uNight;
uniform float uTime;
varying float vHaze;
varying vec2 vW;
varying vec2 vUv;
void main() {
  vec3 c = vColor.rgb;
  #ifdef VEHICLE
    // One mesh per vehicle kind, body and lights together: the lights
    // (vW.y = 1) never sink into the night, and blink like beacons.
    c *= 1.0 - 0.5 * uNight * ( 1.0 - vW.y );
    if ( vW.x > 0.0 ) c *= 0.15 + 0.85 * step( 0.55, fract( uTime * 0.7 + vW.x ) );
  #elif !defined( GLOW )
    // At night the walls sink into the dark and the lights carry them.
    c *= 1.0 - 0.5 * uNight;
  #endif
  #ifdef WINDOWS
    // A grid of windows on every wall face (vW.y = 1), lit at random, more
    // of them at night. Past a couple of pixels per window the grid fades
    // into its average, so it never shimmers.
    vec2 cell = fract( vUv );
    vec2 id = floor( vUv );
    float win = step( 0.16, cell.x ) * step( cell.x, 0.84 ) * step( 0.28, cell.y ) * step( cell.y, 0.82 );
    float px = max( fwidth( vUv.x ), fwidth( vUv.y ) );
    win = mix( win, 0.42, clamp( px * 2.2 - 0.4, 0.0, 1.0 ) ) * vW.y;
    float rnd = fract( sin( dot( id, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
    float lit = step( 0.82 - 0.42 * uNight, rnd );
    c = mix( c, uGlass * ( 0.85 + 0.3 * rnd ), win * 0.8 );
    c += uLit * win * lit * ( 0.25 + 0.75 * uNight );
  #endif
  #ifdef GLOW
    // Beacons: vW.x > 0 is a blink phase (aircraft warning lights).
    if ( vW.x > 0.0 ) c *= 0.15 + 0.85 * step( 0.55, fract( uTime * 0.7 + vW.x ) );
  #endif
  gl_FragColor = vec4( mix( c, uFog, vHaze ), 1.0 );
  #include <colorspace_fragment>
}
`

interface CityLook {
  fog: Color
  glass: Color
  lit: Color
  night: number
}

const cityMat = (look: CityLook, kind: 'body' | 'glow' | 'vehicle', hazeMax: number, hazeLit = hazeMax): ShaderMaterial =>
  new ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    vertexColors: true,
    fog: false,
    toneMapped: false,
    defines: kind === 'body' ? { WINDOWS: '' } : kind === 'vehicle' ? { VEHICLE: '' } : { GLOW: '' },
    uniforms: {
      uFog: { value: look.fog },
      uGlass: { value: look.glass },
      uLit: { value: look.lit },
      uNight: { value: look.night },
      uTime: { value: 0 },
      uHazeNear: { value: 40 },
      uHazeFar: { value: 320 },
      uHazeMax: { value: hazeMax },
      uHazeLit: { value: hazeLit },
      uReveal: { value: 1 }
    }
  })

// ─── Geometry helpers ────────────────────────────────────────────────────────

const SUN = new Vector3(0.45, 1, 0.3).normalize()

/** Give a geometry the city's attributes: baked shading into its colour, and
 *  `aW` (wall arc length, window mask). Kit geometry has no windows. */
const finish = (g: BufferGeometry, windows = false, blink = 0, shade = true): BufferGeometry => {
  const n = g.attributes.position!.count
  if (!g.attributes.aW) {
    const aw = new Float32Array(n * 2)
    for (let i = 0; i < n; i++) aw[i * 2] = blink
    g.setAttribute('aW', new Float32BufferAttribute(aw, 2))
  }
  if (!g.attributes.normal) g.computeVertexNormals()
  if (shade) {
    const col = g.attributes.color!
    const nor = g.attributes.normal!
    for (let i = 0; i < n; i++) {
      const d = nor.getX(i) * SUN.x + nor.getY(i) * SUN.y + nor.getZ(i) * SUN.z
      const k = 0.58 + 0.34 * Math.max(0, d) + 0.08 * nor.getY(i)
      col.setXYZ(i, col.getX(i) * k, col.getY(i) * k, col.getZ(i) * k)
    }
  }
  if (!windows) {
    const aw = g.attributes.aW!
    for (let i = 0; i < n; i++) aw.setY(i, 0)
  }
  return g
}

/**
 * A prism or frustum with `sides` flat walls (4 = a box, 12+ reads round),
 * radius `r0` at the base and `r1` at the top, `h` tall, turned `yaw`. Walls
 * carry the window grid (each wall its own vertices, its arc length in `aW`);
 * the roof is a flat cap without windows. Base at y = 0.
 */
const prism = (sides: number, r0: number, r1: number, h: number, hex: string, yaw = 0, windows = true): BufferGeometry => {
  const pos: number[] = []
  const nor: number[] = []
  const aw: number[] = []
  const idx: number[] = []
  const col = new Color(hex)
  const side = 2 * r0 * Math.sin(Math.PI / sides)
  let v = 0
  for (let s = 0; s < sides; s++) {
    const a0 = yaw + (s / sides) * Math.PI * 2 + Math.PI / sides
    const a1 = yaw + ((s + 1) / sides) * Math.PI * 2 + Math.PI / sides
    const am = (a0 + a1) / 2
    const nx = Math.cos(am)
    const nz = Math.sin(am)
    const ny = (r0 - r1) / Math.max(0.001, h)
    const nl = Math.hypot(nx, ny, nz)
    const u0 = s * side
    const quad: Array<[number, number, number, number]> = [
      [Math.cos(a0) * r0, 0, Math.sin(a0) * r0, u0],
      [Math.cos(a1) * r0, 0, Math.sin(a1) * r0, u0 + side],
      [Math.cos(a1) * r1, h, Math.sin(a1) * r1, u0 + side],
      [Math.cos(a0) * r1, h, Math.sin(a0) * r1, u0]
    ]
    for (const [x, y, z, u] of quad) {
      pos.push(x, y, z)
      nor.push(nx / nl, ny / nl, nz / nl)
      aw.push(u, windows ? 1 : 0)
    }
    idx.push(v, v + 2, v + 1, v, v + 3, v + 2)
    v += 4
  }
  // Roof
  const c0 = v
  pos.push(0, h, 0)
  nor.push(0, 1, 0)
  aw.push(0, 0)
  v++
  for (let s = 0; s <= sides; s++) {
    const a = yaw + (s / sides) * Math.PI * 2 + Math.PI / sides
    pos.push(Math.cos(a) * r1, h, Math.sin(a) * r1)
    nor.push(0, 1, 0)
    aw.push(0, 0)
    v++
  }
  for (let s = 0; s < sides; s++) idx.push(c0, c0 + 2 + s, c0 + 1 + s)
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new Float32BufferAttribute(nor, 3))
  g.setAttribute('aW', new Float32BufferAttribute(aw, 2))
  const cols = new Float32Array(v * 3)
  for (let i = 0; i < v; i++) cols.set([col.r, col.g, col.b], i * 3)
  g.setAttribute('color', new Float32BufferAttribute(cols, 3))
  g.setIndex(idx)
  return finish(g, windows)
}

/** Place a geometry (translate, rotate, scale), as the kit's `xform`. */
const at = (g: BufferGeometry, p: V3, r: V3 = [0, 0, 0], s: V3 | number = 1): BufferGeometry => xform(g, p, r, s)

/** A kit shape painted and finished for the city (no windows). */
const solid = (g: BufferGeometry, hex: string, p: V3, r: V3 = [0, 0, 0], s: V3 | number = 1): BufferGeometry =>
  finish(at(paint(g, hex), p, r, s))

/** A light (unshaded), optionally blinking with phase `blink` (0..1, > 0). */
const light = (g: BufferGeometry, hex: string, p: V3, blink = 0, r: V3 = [0, 0, 0], s: V3 | number = 1): BufferGeometry =>
  finish(at(paint(g, hex), p, r, s), false, blink, false)

const lcg = (seed: number) => {
  let s = seed >>> 0 || 1
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296)
}

// ─── The skyline ─────────────────────────────────────────────────────────────

interface Kit {
  /** Sides of a "round" tower (fewer on low quality). */
  round: number
  body: BufferGeometry[]
  glow: BufferGeometry[]
  r: () => number
  wall: () => string
  accent: string
}

const BODY = ['#e4e9f0', '#c3ccd8', '#9aa6b8', '#6d7890', '#4a5268', '#8fa2b8', '#d6d0c4']
const GLOWS = ['#7ff4ff', '#ff5fd0', '#ffd27a', '#8dff7a', '#b48cff']

/** A red beacon on a roof, blinking. */
const beacon = (k: Kit, x: number, y: number, z: number): void => {
  k.glow.push(light(sph(0.7, 6, 4), '#ff3048', [x, y, z], 0.05 + k.r() * 0.9))
}

type Builder = (k: Kit, x: number, z: number, h: number, w: number) => void

/** Stepped tower: stacked blocks, a glowing band at each setback, a mast. */
const setback: Builder = (k, x, z, h, w) => {
  const tiers = 2 + Math.floor(k.r() * 3)
  let y = 0
  let r = w
  const yaw = k.r() * Math.PI
  const col = k.wall()
  for (let t = 0; t < tiers; t++) {
    const th = (h / tiers) * (t === 0 ? 1.3 : 0.85)
    k.body.push(at(prism(4, r, r, th, col, yaw), [x, y, z]))
    y += th
    k.glow.push(light(prism(4, r * 1.02, r * 1.02, 0.8, '#ffffff', yaw, false), k.accent, [x, y - 0.8, z]))
    r *= 0.72
  }
  k.body.push(solid(cap(0.4, h * 0.18, 4, 1), '#9aa6b8', [x, y + h * 0.09, z]))
  beacon(k, x, y + h * 0.2, z)
}

/** Round glass tower with glowing rings and a crown. */
const round: Builder = (k, x, z, h, w) => {
  const col = k.wall()
  k.body.push(at(prism(k.round, w, w * 0.82, h, col), [x, 0, z]))
  const g = GLOWS[Math.floor(k.r() * GLOWS.length)]!
  for (let i = 1; i <= 3; i++) {
    const y = h * (0.3 * i)
    const rr = w - (w * 0.18) * (y / h)
    k.glow.push(light(torus(rr + 0.4, 0.45, 4, 18), g, [x, y, z], 0, [Math.PI / 2, 0, 0]))
  }
  k.body.push(at(prism(k.round, w * 0.82, 0.5, h * 0.18, col, 0, false), [x, h, z]))
  beacon(k, x, h * 1.18 + 0.5, z)
}

/** A twisting tower: square floors turning a quarter turn on the way up. */
const twist: Builder = (k, x, z, h, w) => {
  const n = 12
  const col = k.wall()
  const turn = (0.5 + k.r() * 0.6) * Math.PI / 2
  for (let i = 0; i < n; i++) {
    const s = 1 - 0.3 * (i / n)
    k.body.push(at(prism(4, w * s, w * s, h / n * 0.94, col, (i / n) * turn), [x, (h / n) * i, z]))
  }
  k.glow.push(light(prism(4, w * 0.72, w * 0.72, 0.9, '#ffffff', turn, false), k.accent, [x, h - 0.4, z]))
  beacon(k, x, h + 1, z)
}

/** A needle: a slender taper, an observation disc, a spire. */
const needle: Builder = (k, x, z, h, w) => {
  const col = k.wall()
  const nw = w * 0.55
  k.body.push(at(prism(6, nw, nw * 0.45, h, col), [x, 0, z]))
  const dy = h * (0.62 + k.r() * 0.2)
  k.body.push(solid(rcyl(nw * 2.4, 3, 1.2, 18), '#e4e9f0', [x, dy, z]))
  k.glow.push(light(torus(nw * 2.4, 0.35, 4, 22), GLOWS[Math.floor(k.r() * GLOWS.length)]!, [x, dy, z], 0, [Math.PI / 2, 0, 0]))
  k.body.push(solid(cap(0.3, h * 0.3, 4, 1), '#c3ccd8', [x, h + h * 0.15, z]))
  beacon(k, x, h * 1.3 + 0.6, z)
}

/** Twin towers joined high up by a lit skybridge. */
const twins: Builder = (k, x, z, h, w) => {
  const col = k.wall()
  const yaw = k.r() * Math.PI
  const gap = w * 2.6
  const dx = Math.cos(yaw) * gap / 2
  const dz = Math.sin(yaw) * gap / 2
  k.body.push(at(prism(4, w * 0.7, w * 0.62, h, col, yaw), [x - dx, 0, z - dz]))
  k.body.push(at(prism(4, w * 0.7, w * 0.62, h * 0.9, col, yaw), [x + dx, 0, z + dz]))
  const by = h * 0.68
  k.body.push(solid(rbox(gap, 3, 4, 0.2), '#dfe6ee', [x, by, z], [0, -yaw, 0]))
  k.glow.push(light(rbox(gap * 0.9, 0.6, 4.3, 0.2), k.accent, [x, by, z], 0, [0, -yaw, 0]))
  beacon(k, x - dx, h + 0.7, z - dz)
}

/** A cluster of domes, lit at their rims. */
const domes: Builder = (k, x, z, _h, w) => {
  for (let i = 0; i < 3; i++) {
    const r = w * (0.9 + k.r() * 0.9)
    const ox = (k.r() - 0.5) * w * 3
    const oz = (k.r() - 0.5) * w * 3
    k.body.push(solid(dome(r, Math.PI / 2, 16, 6), '#dfe8f2', [x + ox, 0, z + oz]))
    k.glow.push(light(torus(r, 0.35, 4, 20), GLOWS[i % GLOWS.length]!, [x + ox, 0.4, z + oz], 0, [Math.PI / 2, 0, 0]))
  }
}

const REGULAR: Array<[Builder, number]> = [[setback, 3], [round, 2], [twist, 1.2], [needle, 1], [twins, 0.8], [domes, 0.6]]

const pickBuilder = (r: number): Builder => {
  const total = REGULAR.reduce((a, [, w]) => a + w, 0)
  let x = r * total
  for (const [b, w] of REGULAR) {
    if ((x -= w) <= 0) return b
  }
  return setback
}

// ── The landmarks ──

/** An arcology: a stepped pyramid city in one building. */
const arcology = (k: Kit, x: number, z: number): void => {
  let r = 34
  let y = 0
  for (let t = 0; t < 6; t++) {
    const th = 16 - t
    k.body.push(at(prism(4, r, r * 0.88, th, '#cfd6e0', Math.PI / 4), [x, y, z]))
    y += th
    k.glow.push(light(prism(4, r * 0.89, r * 0.89, 0.7, '#ffffff', Math.PI / 4, false), k.accent, [x, y - 0.7, z]))
    r *= 0.78
  }
  k.body.push(solid(sph(r * 0.9, 12, 8), '#9fe6ff', [x, y, z]))
  beacon(k, x, y + r, z)
}

/** A tower wearing a halo: a huge lit ring on spokes round its crown. */
const halo = (k: Kit, x: number, z: number): void => {
  const h = 150
  k.body.push(at(prism(16, 9, 6, h, '#dfe6ee'), [x, 0, z]))
  k.body.push(solid(cap(0.8, 30, 4, 1), '#c3ccd8', [x, h + 15, z]))
  const hy = h - 16
  k.glow.push(light(torus(30, 1.6, 6, 48), '#7ff4ff', [x, hy, z], 0, [Math.PI / 2, 0, 0]))
  k.body.push(solid(torus(30, 2.6, 6, 48), '#9aa6b8', [x, hy - 2.4, z], [Math.PI / 2, 0, 0]))
  for (let s = 0; s < 4; s++) {
    const a = (s / 4) * Math.PI * 2
    k.body.push(solid(rbox(24, 1.4, 1.4, 0.2), '#c3ccd8', [x + Math.cos(a) * 18, hy, z + Math.sin(a) * 18], [0, -a, 0]))
  }
  beacon(k, x, h + 31, z)
}

/** An arch: two towers leaning in until they meet. */
const arch = (k: Kit, x: number, z: number, yaw: number): void => {
  const span = 46
  const h = 110
  const lean = Math.atan2(span / 2 - 5, h)
  for (const s of [-1, 1]) {
    const bx = x + Math.cos(yaw) * s * span / 2
    const bz = z + Math.sin(yaw) * s * span / 2
    const g = prism(4, 7, 5, h, '#c9d2de', 0)
    // Lean in toward the other leg: about the axis across the span.
    g.rotateY(yaw)
    const m = new Matrix4().makeRotationAxis(new Vector3(-Math.sin(yaw), 0, Math.cos(yaw)), s * lean)
    g.applyMatrix4(m)
    g.translate(bx, 0, bz)
    k.body.push(g)
  }
  k.body.push(solid(rbox(16, 12, 12, 0.3), '#e4e9f0', [x, h * Math.cos(lean) + 2, z], [0, -yaw, 0]))
  k.glow.push(light(rbox(16.5, 1, 12.5, 0.2), '#ff5fd0', [x, h * Math.cos(lean) + 5, z], 0, [0, -yaw, 0]))
  beacon(k, x, h * Math.cos(lean) + 9, z)
}

/** A floating district: a disc of towers on an inverted cone, lit beneath. */
const floating = (k: Kit, x: number, z: number): void => {
  const y = 70
  k.body.push(at(prism(18, 3, 26, 22, '#8e9bb0', 0, false), [x, y - 22, z]))
  k.body.push(solid(rcyl(27, 3, 1, 24), '#dfe6ee', [x, y + 1.5, z]))
  k.glow.push(light(torus(26.5, 0.8, 4, 36), '#7ff4ff', [x, y - 0.2, z], 0, [Math.PI / 2, 0, 0]))
  k.glow.push(light(sph(3, 10, 6), '#bff3ff', [x, y - 23, z]))
  const r = lcg(71)
  for (let i = 0; i < 7; i++) {
    const a = r() * Math.PI * 2
    const d = r() * 17
    const h = 8 + r() * 26
    k.body.push(at(prism(i % 2 ? 4 : 10, 3 + r() * 2, 2.5, h, BODY[i % BODY.length]!, a), [x + Math.cos(a) * d, y + 3, z + Math.sin(a) * d]))
  }
}

/** A sphere on a tripod. */
const orb = (k: Kit, x: number, z: number): void => {
  const y = 96
  for (let s = 0; s < 3; s++) {
    const a = (s / 3) * Math.PI * 2
    const bx = x + Math.cos(a) * 18
    const bz = z + Math.sin(a) * 18
    const len = Math.hypot(18, y)
    const g = prism(6, 2.2, 1.6, len, '#c3ccd8', 0, false)
    const tilt = Math.atan2(18, y)
    g.applyMatrix4(new Matrix4().makeRotationAxis(new Vector3(-Math.sin(a), 0, Math.cos(a)), tilt))
    g.translate(bx, 0, bz)
    k.body.push(g)
  }
  k.body.push(solid(sph(20, 20, 14), '#e4e9f0', [x, y + 8, z]))
  k.glow.push(light(torus(20.2, 0.9, 4, 36), '#ffd27a', [x, y + 8, z], 0, [Math.PI / 2, 0, 0]))
  beacon(k, x, y + 29, z)
}

/** A space-elevator tether: a hair-thin line up out of the sky, with lit
 *  climbers on it and a station ring at the top of what can be seen. */
const tether = (k: Kit, x: number, z: number): void => {
  const top = 225
  k.body.push(solid(rcyl(2, top, 0.5, 8), '#9aa6b8', [x, top / 2, z]))
  k.body.push(solid(rcyl(10, 8, 2, 16), '#c3ccd8', [x, 4, z]))
  for (let i = 0; i < 5; i++) k.glow.push(light(sph(1.6, 6, 4), '#bff3ff', [x, 30 + i * 40, z], 0.1 + i * 0.17))
  k.body.push(solid(torus(12, 2, 6, 28), '#dfe6ee', [x, top - 12, z], [Math.PI / 2, 0, 0]))
  k.glow.push(light(torus(12, 0.8, 4, 28), '#7ff4ff', [x, top - 9.5, z], 0, [Math.PI / 2, 0, 0]))
}

/** The spaceport: a launch pad with a gantry (the rockets are traffic). */
const spaceport = (k: Kit, x: number, z: number): void => {
  k.body.push(solid(rcyl(22, 2, 0.6, 24), '#6d7890', [x, 1, z]))
  k.glow.push(light(torus(21, 0.6, 4, 32), '#ffd27a', [x, 2.1, z], 0, [Math.PI / 2, 0, 0]))
  for (const s of [-1, 1]) {
    k.body.push(at(prism(4, 3, 2.5, 46, '#8e9bb0', 0, false), [x + s * 11, 2, z]))
    beacon(k, x + s * 11, 49, z)
  }
}

// ─── Traffic ─────────────────────────────────────────────────────────────────

interface Lane {
  /** Position at arc length `s` (m) along the lane, and its heading (rad). */
  at(s: number, out: Vector3): number
  length: number
}

const ringLane = (cx: number, cz: number, r: number, y: number, dir: 1 | -1): Lane => ({
  length: Math.PI * 2 * r,
  at: (s, out) => {
    const a = (s / r) * dir
    out.set(cx + Math.cos(a) * r, y + Math.sin(a * 3) * 1.5, cz + Math.sin(a) * r)
    // Heading along the tangent (yaw about +y, 0 = +z).
    return Math.atan2(-Math.sin(a) * dir, Math.cos(a) * dir)
  }
})

/** A straight lane past the level: offset `d` from the centre, never over it. */
const chordLane = (cx: number, cz: number, d: number, phi: number, y: number, half: number): Lane => {
  const nx = Math.cos(phi)
  const nz = Math.sin(phi)
  const tx = -nz
  const tz = nx
  return {
    length: half * 2,
    at: (s, out) => {
      const u = s - half
      out.set(cx + nx * d + tx * u, y, cz + nz * d + tz * u)
      return Math.atan2(tx, tz)
    }
  }
}

/** Something in the skyline the blimp must keep clear of: a footprint of
 *  radius `r` round (x, z), `top` high. `wall` ones (a tether up out of the
 *  sky, the spaceport's launch column) cannot be flown over: the blimp's
 *  route bends round them instead. */
export interface SkyObstacle { x: number; z: number; r: number; top: number; wall?: boolean }

/** The blimp's half-extents (m): along its length, and below its centre (the
 *  gondola). Its fins and flanks stay inside `BLIMP_REACH` across. */
export const BLIMP_REACH = 23
export const BLIMP_BELOW = 8.6

/** A regular building's reach round its spot and its height, with its mast
 *  and beacon (a generous bound over every builder above). */
const plotBounds = (b: Builder, h: number, w: number): { r: number; top: number } =>
  b === domes ? { r: w * 3.3, top: w * 1.8 + 1 }
    : b === twins ? { r: w * 2, top: h + 2 }
      : b === needle ? { r: w * 1.4, top: h * 1.35 + 2 }
        : { r: w * 1.1, top: h * 1.35 + 2 }

/** Each landmark's reach and height (`wall`: cannot be flown over). */
const MARK_BOUNDS: Record<string, { r: number; top: number; wall?: boolean }> = {
  arcology: { r: 36, top: 95 },
  halo: { r: 34, top: 185 },
  arch: { r: 34, top: 130 },
  floating: { r: 29, top: 110 },
  orb: { r: 40, top: 130 },
  tether: { r: 14, top: Infinity, wall: true },
  // The rockets climb out of it, drifting up to ~24 m off the pad.
  spaceport: { r: 34, top: Infinity, wall: true }
}

const skyObstacles = (
  plots: Array<{ x: number; z: number; h: number; w: number; b: Builder }>,
  marks: Array<{ id: string; x: number; z: number }>
): SkyObstacle[] => [
  ...plots.map(p => ({ x: p.x, z: p.z, ...plotBounds(p.b, p.h, p.w) })),
  ...marks.map(m => ({ x: m.x, z: m.z, ...MARK_BOUNDS[m.id]! }))
]

/**
 * The blimp's loop (#170): a ring round the level at radius `r0` and at
 * least `y0` high that is clear of every obstacle by construction — it bends
 * outward round each `wall` and climbs over everything else under it, with
 * gentle ramps (it never dips into a tower it is passing; it rose before it).
 */
export const blimpLane = (cx: number, cz: number, r0: number, y0: number, obstacles: SkyObstacle[]): Lane & { peak: number } => {
  const N = 720
  const MARGIN = 6
  const ang = (i: number) => (i / N) * Math.PI * 2
  // Arc between samples on the plain ring; ramps are limited per sample.
  const seg = (Math.PI * 2 * r0) / N
  const rampLimit = (v: number[], perM: number): void => {
    const d = perM * seg
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < N * 2; i++) v[(i + 1) % N] = Math.max(v[(i + 1) % N]!, v[i % N]! - d)
      for (let i = N * 2; i > 0; i--) v[(i - 1) % N] = Math.max(v[(i - 1) % N]!, v[i % N]! - d)
    }
  }
  // 1. Radius: outward round the walls.
  const rad = new Array<number>(N).fill(r0)
  for (const o of obstacles) {
    if (!o.wall) continue
    const od = Math.hypot(o.x - cx, o.z - cz)
    const oa = Math.atan2(o.z - cz, o.x - cx)
    const keep = o.r + BLIMP_REACH + MARGIN
    for (let i = 0; i < N; i++) {
      const da = Math.atan2(Math.sin(ang(i) - oa), Math.cos(ang(i) - oa))
      if (Math.abs(da) > Math.PI / 2) continue
      const lat = od * Math.sin(Math.abs(da))
      if (lat >= keep) continue
      rad[i] = Math.max(rad[i]!, od * Math.cos(da) + Math.sqrt(keep * keep - lat * lat))
    }
  }
  rampLimit(rad, 0.6)
  // 2. Height: over everything else near the route as it now runs. The
  //    footprint test is widened by a sample's spacing, so the line between
  //    two samples is covered too.
  const pts = rad.map((r, i) => [cx + Math.cos(ang(i)) * r, cz + Math.sin(ang(i)) * r] as const)
  let step = 0
  for (let i = 0; i < N; i++) {
    const [ax, az] = pts[i]!
    const [bx, bz] = pts[(i + 1) % N]!
    step = Math.max(step, Math.hypot(bx - ax, bz - az))
  }
  const alt = new Array<number>(N).fill(y0)
  for (const o of obstacles) {
    if (o.wall) continue
    const keep = o.r + BLIMP_REACH + MARGIN + step
    for (let i = 0; i < N; i++) {
      const [px, pz] = pts[i]!
      if (Math.hypot(px - o.x, pz - o.z) < keep) alt[i] = Math.max(alt[i]!, o.top + BLIMP_BELOW + MARGIN)
    }
  }
  rampLimit(alt, 0.35)
  // Arc length along the bent route.
  const cum = new Array<number>(N + 1).fill(0)
  for (let i = 0; i < N; i++) {
    const [ax, az] = pts[i]!
    const [bx, bz] = pts[(i + 1) % N]!
    cum[i + 1] = cum[i]! + Math.hypot(bx - ax, bz - az)
  }
  const length = cum[N]!
  let hint = 0
  return {
    length,
    // Its highest point: the freighter crosses above it.
    peak: Math.max(...alt),
    at: (s, out) => {
      const u = ((s % length) + length) % length
      // The lane is walked forward almost always: start from the last hit.
      if (cum[hint]! > u || cum[hint + 1]! < u) {
        let lo = 0
        let hi = N
        while (hi - lo > 1) {
          const mid = (lo + hi) >> 1
          if (cum[mid]! <= u) lo = mid
          else hi = mid
        }
        hint = lo
      }
      const i = hint
      const j = (i + 1) % N
      const f = (u - cum[i]!) / Math.max(1e-6, cum[i + 1]! - cum[i]!)
      const [ax, az] = pts[i]!
      const [bx, bz] = pts[j]!
      out.set(ax + (bx - ax) * f, alt[i]! + (alt[j]! - alt[i]!) * f, az + (bz - az) * f)
      return Math.atan2(bx - ax, bz - az)
    }
  }
}

interface Fleet {
  body: InstancedMesh
  n: number
  place(i: number, t: number, p: Vector3, q: Quaternion, s: Vector3): boolean
}

/**
 * Build one vehicle kind from its body and light parts (local, facing +z),
 * `n` instances: ONE instanced mesh, one draw call. The lights are merged
 * into the body with `aW.y` = 1, which the vehicle shader (`VEHICLE`) reads
 * to keep them bright at night and clear through the haze.
 */
const fleet = (
  bodyParts: BufferGeometry[], glowParts: BufferGeometry[], n: number, mat: Material,
  place: Fleet['place']
): Fleet => {
  const parts = [mergeGeometries(bodyParts)]
  if (glowParts.length) {
    const lights = mergeGeometries(glowParts)
    const aw = lights.attributes.aW!
    for (let i = 0; i < aw.count; i++) aw.setY(i, 1)
    parts.push(lights)
  }
  const body = new InstancedMesh(parts.length > 1 ? mergeGeometries(parts) : parts[0]!, mat, n)
  body.instanceMatrix.setUsage(DynamicDrawUsage)
  body.frustumCulled = false
  return { body, n, place }
}

const YAXIS = new Vector3(0, 1, 0)
const ZAXIS = new Vector3(0, 0, 1)

// ── Vehicle models (low detail: seen from 60 m and more) ──

const quadcopter = (): [BufferGeometry[], BufferGeometry[]] => [[
  solid(rbox(1.4, 0.5, 1.4, 0.3), '#3c4458', [0, 0, 0]),
  solid(rbox(3.4, 0.18, 0.25, 0.3), '#6d7890', [0, 0.1, 0], [0, Math.PI / 4, 0]),
  solid(rbox(3.4, 0.18, 0.25, 0.3), '#6d7890', [0, 0.1, 0], [0, -Math.PI / 4, 0]),
  ...[0, 1, 2, 3].map(i => solid(rcyl(0.75, 0.08, 0.02, 10), '#9aa6b8', [Math.cos(Math.PI / 4 + i * Math.PI / 2) * 1.2, 0.3, Math.sin(Math.PI / 4 + i * Math.PI / 2) * 1.2])),
  solid(rbox(0.8, 0.5, 0.8, 0.3), '#c68a3e', [0, -0.55, 0])
], [
  light(sph(0.25, 6, 4), '#8dff7a', [1.2, 0.2, 1.2]),
  light(sph(0.25, 6, 4), '#ff3048', [-1.2, 0.2, 1.2])
]]

const taxi = (): [BufferGeometry[], BufferGeometry[]] => [[
  solid(ell(1.5, 1.0, 2.8, 12, 8), '#ffc21a', [0, 0, 0]),
  solid(ell(1.25, 0.7, 1.6, 12, 6), '#1d2438', [0, 0.55, 0.3]),
  solid(rcyl(0.7, 0.5, 0.15, 10), '#3c4458', [1.7, -0.2, 1.3], [0, 0, Math.PI / 2]),
  solid(rcyl(0.7, 0.5, 0.15, 10), '#3c4458', [-1.7, -0.2, 1.3], [0, 0, Math.PI / 2]),
  solid(rcyl(0.7, 0.5, 0.15, 10), '#3c4458', [1.7, -0.2, -1.3], [0, 0, Math.PI / 2]),
  solid(rcyl(0.7, 0.5, 0.15, 10), '#3c4458', [-1.7, -0.2, -1.3], [0, 0, Math.PI / 2])
], [
  light(rbox(2.2, 0.2, 0.2, 0.3), '#fff4c8', [0, 0, 2.75]),
  light(rbox(2.2, 0.2, 0.2, 0.3), '#ff3048', [0, 0.1, -2.75]),
  light(rbox(0.8, 0.3, 0.5, 0.3), '#7ff4ff', [0, 1.1, 0.2])
]]

const cruiser = (): [BufferGeometry[], BufferGeometry[]] => [[
  solid(rbox(2.6, 1.0, 5.4, 0.4), '#f4f7ff', [0, 0, 0]),
  solid(rbox(2.62, 0.5, 2.4, 0.4), '#1f3b8a', [0, -0.1, -0.2]),
  solid(ell(1.1, 0.55, 1.6, 10, 6), '#1d2438', [0, 0.6, 0.5]),
  solid(rcyl(0.55, 0.4, 0.1, 10), '#3c4458', [1.6, -0.2, 1.8], [0, 0, Math.PI / 2]),
  solid(rcyl(0.55, 0.4, 0.1, 10), '#3c4458', [-1.6, -0.2, 1.8], [0, 0, Math.PI / 2]),
  solid(rcyl(0.55, 0.4, 0.1, 10), '#3c4458', [1.6, -0.2, -1.8], [0, 0, Math.PI / 2]),
  solid(rcyl(0.55, 0.4, 0.1, 10), '#3c4458', [-1.6, -0.2, -1.8], [0, 0, Math.PI / 2])
], [
  light(rbox(2.0, 0.18, 0.2, 0.3), '#ffffff', [0, 0, 2.72])
]]

/** One half of the cruiser's light bar (two instances per car, recoloured
 *  each frame: red / blue). */
const lightbar = (): BufferGeometry[] => [light(rbox(0.7, 0.3, 0.35, 0.3), '#ffffff', [0, 1.05, 0])]

const hauler = (): [BufferGeometry[], BufferGeometry[]] => [[
  solid(rbox(4, 3, 12, 0.2), '#8e9bb0', [0, 0, 0]),
  solid(rbox(3.6, 2.4, 3, 0.3), '#e4e9f0', [0, 0.3, 6.6]),
  ...[[-1, 1], [1, 1], [-1, -1], [1, -1]].map(([sx, sz]) => solid(torus(1.3, 0.35, 4, 12), '#4a5268', [sx! * 3.2, 0.4, sz! * 4.2], [Math.PI / 2, 0, 0])),
  solid(rbox(3.4, 2.2, 7, 0.2), '#ff8a1f', [0, -2.4, -1])
], [
  light(rbox(3, 0.25, 0.2, 0.3), '#fff4c8', [0, 0.3, 8.2]),
  ...[[-1, 1], [1, 1], [-1, -1], [1, -1]].map(([sx, sz]) => light(rcyl(0.9, 0.1, 0.02, 10), '#7ff4ff', [sx! * 3.2, 0.2, sz! * 4.2]))
]]

const blimp = (): [BufferGeometry[], BufferGeometry[]] => [[
  solid(ell(7, 7, 22, 16, 10), '#e4e9f0', [0, 0, 0]),
  solid(rbox(3, 2, 6, 0.3), '#4a5268', [0, -7.6, 2]),
  solid(rbox(0.6, 6, 5, 0.2), '#9aa6b8', [0, 5, -19]),
  solid(rbox(6, 0.6, 5, 0.2), '#9aa6b8', [0, 0, -19])
], [
  // The ad screen along its flank (reads as colour, never words).
  light(rbox(0.3, 5, 18, 0.1), '#ff5fd0', [7.05, 0, 0]),
  light(rbox(0.3, 5, 18, 0.1), '#7ff4ff', [-7.05, 0, 0])
]]

const freighter = (): [BufferGeometry[], BufferGeometry[]] => [[
  solid(rbox(14, 5, 40, 0.2), '#9aa6b8', [0, 0, 0]),
  solid(rbox(24, 1.6, 12, 0.2), '#6d7890', [0, 0, -8]),
  solid(rbox(6, 4, 8, 0.3), '#dfe6ee', [0, 3.5, 14])
], [
  ...[-4, 0, 4].map(x => light(rcyl(1.6, 0.6, 0.1, 10), '#bff3ff', [x, 0, -20.5], 0, [Math.PI / 2, 0, 0])),
  light(sph(0.8, 6, 4), '#ff3048', [-12, 0, -8], 0.3),
  light(sph(0.8, 6, 4), '#8dff7a', [12, 0, -8], 0.8)
]]

/** An open cone (the kit's attributes: no uv). */
const cone = (top: number, bottom: number, h: number, segs: number): BufferGeometry => {
  const g = new CylinderGeometry(top, bottom, h, segs, 1, true)
  g.deleteAttribute('uv')
  return g
}

const rocket = (): [BufferGeometry[], BufferGeometry[]] => [[
  solid(rcyl(2.2, 26, 0.4, 12), '#f4f7ff', [0, 13, 0]),
  solid(sph(2.2, 12, 8), '#f4f7ff', [0, 26, 0], [0, 0, 0], [1, 2.2, 1]),
  ...[0, 1, 2].map(i => solid(rbox(0.4, 5, 3, 0.2), '#3c4458', [Math.cos(i * 2.1) * 2.4, 2.5, Math.sin(i * 2.1) * 2.4], [0, -i * 2.1, 0]))
], [
  light(sph(2.4, 10, 6), '#fff0cc', [0, -2.5, 0], 0, [0, 0, 0], [1, 2.6, 1]),
  // The thrust cone: wide at the nozzles, a hot point below.
  light(cone(2.1, 0.35, 10, 12), '#ffb03a', [0, -5.5, 0]),
  light(cone(1.2, 0.2, 6, 10), '#fff6d8', [0, -3.6, 0])
]]

/** The smoke a launch leaves: a short unit-tall column (narrow end at the
 *  top, under the flame), scaled per frame and drawn see-through. */
const plume = (): BufferGeometry[] => [prism(10, 3.4, 1.6, 1, '#eef0f6', 0, false)]

// ─── Assemble ────────────────────────────────────────────────────────────────

export interface Cityscape {
  root: Group
  quality: SceneQuality
  /** Place the traffic, tick the beacons, fade in what streamed (s, the
   *  mission clock). */
  update(t: number): void
  /**
   * Build more of what streams in, for at most `budgetMs` of this frame
   * (at least one job). The mission calls it once play has begun: the far
   * skyline and the landmarks build a piece per frame and rise out of the
   * haze, and the traffic trickles into the sky one vehicle at a time.
   * True once everything is in.
   */
  stream(budgetMs: number): boolean
  /** The windows' light, 0 (a blackout) .. 1 (as built). */
  setLight(k01: number): void
  /** A player shot at (x, y, z), radius `r`, over the walls (#169): true if
   *  it struck a flying taxi or a parcel drone, which is shot down (it sinks
   *  out of the sky); its centre goes into `out`. */
  shotHits(x: number, y: number, z: number, r: number, out: Vector3): boolean
  /** Each downed vehicle still sinking, by its centre (for its smoke). */
  sinking(emit: (x: number, y: number, z: number) => void): void
  dispose(): void
}

const NIGHT: Record<string, number> = { scrapyard: 0.15, blaze: 0.45, cryo: 0.1, volt: 1, gale: 0.1, magnet: 0.55, drill: 0.35, tide: 0.1, neon: 1, rotor: 0.05, fortress: 0.9 }

/** Seconds between one vehicle joining the sky and the next. */
const TRICKLE = 0.3
/** Seconds a streamed piece of skyline takes to rise out of the haze. */
const REVEAL = 2.5

/**
 * Build the city for a map. What the loader builds (time-sliced, `slice`
 * between stages, like the level itself) is the ground and the near and mid
 * skyline. The far band, the landmarks and every vehicle STREAM in once play
 * has begun (`stream`). The vehicles' meshes exist from the start with no
 * instances, so the loader's shader precompile covers them and nothing
 * compiles mid-play.
 *
 * `quality` 'low' (budget phones, `engine/quality.ts`) builds about half the
 * buildings, three landmarks instead of seven, coarser round shapes, and a
 * quiet sky: four vehicle kinds of eight (four draw calls), seven
 * vehicles instead of forty-two, moved at 30 Hz.
 */
export const buildCityscape = async (
  map: MapData, theme: Theme, slice: Slice = noSlice, quality: SceneQuality = sceneQuality()
): Promise<Cityscape> => {
  const low = quality === 'low'
  const r = lcg(map.seed ^ 0xc17c)
  const cx = (map.w * CELL) / 2
  const cz = (map.h * CELL) / 2
  // How far the level reaches from its centre, and how high its walls go.
  const reach = Math.hypot(map.w, map.h) * CELL / 2
  const top = map.terrain ? Math.max(WALL_H, ...map.terrain.wallTop) : WALL_H
  const root = new Group()
  const night = NIGHT[theme.id] ?? 0.2
  const fog = new Color(theme.fog)
  const look: CityLook = {
    fog,
    glass: new Color(theme.skyTop).lerp(new Color('#1a2340'), 0.55 + 0.3 * night),
    lit: new Color('#ffe2a8').lerp(new Color(theme.accent), 0.3),
    night
  }
  const litBase = look.lit.clone()
  const bodyMat = cityMat(look, 'body', 0.6)
  const glowMat = cityMat(look, 'glow', 0.32)
  const vehMat = cityMat(look, 'vehicle', 0.5, 0.3)
  const vehLight = cityMat(look, 'glow', 0.3)
  // The rockets' smoke: the vehicles' shading, see-through.
  const smokeMat = vehMat.clone()
  smokeMat.defines = {}
  smokeMat.fragmentShader = 'uniform float uAlpha;\n' + FRAG.replace('vHaze ), 1.0 );', 'vHaze ), uAlpha );')
  smokeMat.uniforms.uAlpha = { value: 0.34 }
  smokeMat.transparent = true
  smokeMat.depthWrite = false
  const mats: ShaderMaterial[] = [bodyMat, glowMat, vehMat, vehLight, smokeMat]

  const tint = new Color(theme.wallLow)
  const newKit = (): Kit => ({
    body: [],
    glow: [],
    r,
    accent: theme.accent,
    round: low ? 8 : 14,
    wall: () => `#${new Color(BODY[Math.floor(r() * BODY.length)]!).lerp(tint, 0.18).getHexString()}`
  })
  const kit = newKit()
  const farKit = newKit()

  // The ground the city stands on, from just past the walls to the horizon.
  // Over open sky (`Terrain.clouds`) it is the sea of clouds, in the pits'
  // own mist colour (`climbMesh.ts`): a dark ground there showed through
  // every gap between the docks, so the walls, hazed pale toward the fog,
  // read as glass panes over it ("everything is see-through", Sky Docks
  // playtest 2026-10-16).
  const groundHex = map.terrain?.clouds ? `#${fog.clone().lerp(new Color('#ffffff'), 0.35).getHexString()}` : '#2a3048'
  const ground = prism(low ? 20 : 40, 240, 240, 0.1, groundHex, 0, false)
  kit.body.push(at(ground, [cx, -0.6, cz]))

  // Landmarks, at spread-out bearings in the far ring. Placed now (the
  // skyline keeps clear of them); BUILT when they stream in.
  const base = r() * Math.PI * 2
  const allMarks: Array<[string, (k: Kit, x: number, z: number, a: number) => void]> = [
    ['arcology', (k, x, z) => arcology(k, x, z)],
    ['halo', (k, x, z) => halo(k, x, z)],
    ['arch', (k, x, z, a) => arch(k, x, z, a + Math.PI / 2)],
    ['floating', (k, x, z) => floating(k, x, z)],
    ['orb', (k, x, z) => orb(k, x, z)],
    ['tether', (k, x, z) => tether(k, x, z)],
    ['spaceport', (k, x, z) => spaceport(k, x, z)]
  ]
  const marks = low ? allMarks.filter(([id]) => id === 'halo' || id === 'arcology' || id === 'spaceport') : allMarks
  const markAt = marks.map(([id, make], i) => {
    const a = base + (i / marks.length) * Math.PI * 2 + (r() - 0.5) * 0.3
    const d = Math.max(reach + 85, 150) + r() * 25
    return { id, make, a, d, x: cx + Math.cos(a) * d, z: cz + Math.sin(a) * d }
  })
  const port = markAt.find(m => m.id === 'spaceport')!

  // The regular skyline: three bands, lower near, taller far.
  const k = low ? 0.4 : 1
  const bands: Array<{ from: number; to: number; n: number; h0: number; h1: number; far: boolean }> = [
    // (A dome cluster or a pair of twins spreads up to ~18 m from its spot.)
    { from: reach + 45, to: reach + 75, n: Math.round(26 * k), h0: 14, h1: 40, far: false },
    { from: reach + 70, to: reach + 120, n: Math.round(34 * k), h0: 30, h1: 90, far: false },
    { from: reach + 120, to: Math.min(215, reach + 185), n: Math.round(30 * k), h0: 50, h1: 130, far: true }
  ]
  // Every building's spot and shape, drawn now so the city is the same
  // whatever order it builds in.
  type Plot = { x: number; z: number; h: number; w: number; b: Builder; far: boolean }
  const plots: Plot[] = []
  for (const b of bands) {
    for (let i = 0; i < b.n; i++) {
      const a = (i / b.n) * Math.PI * 2 + r() * (Math.PI * 2 / b.n) * 0.8
      const d = b.from + r() * (b.to - b.from)
      const x = cx + Math.cos(a) * d
      const z = cz + Math.sin(a) * d
      const h = b.h0 + r() * r() * (b.h1 - b.h0)
      const w = 5 + r() * 7
      const builder = pickBuilder(r())
      if (markAt.some(m => Math.hypot(m.x - x, m.z - z) < 48)) continue
      plots.push({ x, z, h, w, b: builder, far: b.far })
    }
  }
  const near = plots.filter(p => !p.far)
  for (let i = 0; i < near.length; i++) {
    const p = near[i]!
    p.b(kit, p.x, p.z, p.h, p.w)
    if (i % 12 === 11) await slice()
  }
  await slice()
  const bodyMesh = new Mesh(mergeGeometries(kit.body), bodyMat)
  await slice()
  const glowMesh = new Mesh(mergeGeometries(kit.glow), glowMat)
  await slice()
  bodyMesh.frustumCulled = false
  glowMesh.frustumCulled = false
  root.add(bodyMesh, glowMesh)

  // ── What streams in: the far band and the landmarks, a piece per job ──
  const jobs: Array<() => void> = []
  const far = plots.filter(p => p.far)
  for (let i = 0; i < far.length; i += 5) {
    const chunk = far.slice(i, i + 5)
    jobs.push(() => { for (const p of chunk) p.b(farKit, p.x, p.z, p.h, p.w) })
  }
  for (const m of markAt) jobs.push(() => m.make(farKit, m.x, m.z, m.a))
  let lastT = 0
  const reveals: Array<{ mats: ShaderMaterial[]; at: number }> = []
  // Merged in two jobs (bodies, then lights), each with its own copy of the
  // material: same program, but its own haze to rise out of.
  let farBody: ShaderMaterial | null = null
  jobs.push(() => {
    farBody = bodyMat.clone()
    farBody.uniforms.uReveal!.value = 0
    const m = new Mesh(mergeGeometries(farKit.body), farBody)
    m.frustumCulled = false
    root.add(m)
    mats.push(farBody)
  })
  jobs.push(() => {
    const farGlow = glowMat.clone()
    farGlow.uniforms.uReveal!.value = 0
    const m = new Mesh(mergeGeometries(farKit.glow), farGlow)
    m.frustumCulled = false
    root.add(m)
    mats.push(farGlow)
    reveals.push({ mats: [farBody!, farGlow], at: lastT })
    farKit.body.length = 0
    farKit.glow.length = 0
  })
  let jobAt = 0
  let trafficFrom = -1

  // ── Traffic lanes: round the level and past it, never over it ──
  const y0 = top + 26
  const lanes: Lane[] = [
    ringLane(cx, cz, reach + 42, y0, 1),
    ringLane(cx, cz, reach + 46, y0 + 5, -1),
    ringLane(cx, cz, reach + 78, y0 + 18, 1),
    ringLane(cx, cz, reach + 84, y0 + 23, -1),
    ringLane(cx, cz, reach + 120, y0 + 42, 1),
    chordLane(cx, cz, reach + 60, base + 0.9, y0 + 12, 200),
    chordLane(cx, cz, reach + 95, base + 2.6, y0 + 30, 200)
  ]
  const tmpQ = new Quaternion()
  const along = (lane: Lane, s: number, p: Vector3, q: Quaternion, bank = 0): void => {
    const L = lane.length
    const u = ((s % L) + L) % L
    const yaw = lane.at(u, p)
    q.setFromAxisAngle(YAXIS, yaw)
    if (bank) q.multiply(tmpQ.setFromAxisAngle(ZAXIS, bank))
  }

  const fleets: Fleet[] = []
  // The taxis and the parcel drones can be shot down (#169).
  const targets = new SkyTargets()
  const SINK_FLOOR = -6
  const seedOf = (i: number) => (Math.imul(i + 1, 2654435761) >>> 0) / 4294967296
  const n = (full: number) => (low ? Math.max(1, Math.ceil(full / 2)) : full)

  // Rockets first in the trickle: the spaceport is the sky's showpiece.
  const LAUNCH = 16
  const PERIOD = 38
  const launch = (i: number, t: number): number => ((t + i * PERIOD / 2 + 6) % PERIOD)
  {
    const [b, g] = rocket()
    // Straight up, then a gentle gravity turn; the nose always points along
    // the climb (its velocity), never tilted off it.
    const ACC = 1.9
    const TURN = 0.004
    const flight = (i: number, kk: number, p: Vector3): number => {
      p.set(port.x + (i ? 8 : -8) + TURN * kk * kk * kk, 2 + 0.5 * ACC * kk * kk, port.z)
      return Math.atan2(3 * TURN * kk * kk, ACC * kk + 1e-6)
    }
    fleets.push(fleet(b, g, n(2), vehMat, (i, t, p, q, s) => {
      const kk = launch(i, t)
      if (kk > LAUNCH) return false
      q.setFromAxisAngle(ZAXIS, -flight(i, kk, p))
      s.setScalar(1)
      return true
    }))
    // A short see-through trail under the flame (none on the low tier).
    if (!low) {
      const tail = new Vector3()
      fleets.push(fleet(plume(), [], 2, smokeMat, (i, t, p, q, s) => {
        const kk = launch(i, t)
        if (kk > LAUNCH + 3) return false
        const a = flight(i, Math.min(kk, LAUNCH), p)
        // It grows to its length off the pad, and thins out after the rocket.
        const len = Math.min(16, 0.5 * ACC * kk * kk + 2)
        const fade = kk > LAUNCH ? 1 - (kk - LAUNCH) / 3 : 1
        q.setFromAxisAngle(ZAXIS, -a)
        tail.set(Math.sin(a), Math.cos(a), 0).multiplyScalar(-(9 + len))
        p.add(tail)
        s.set(fade, len, fade)
        return fade > 0.02
      }))
    }
  }
  // Flying taxis.
  {
    const [b, g] = taxi()
    const taxiN = low ? 4 : 12
    fleets.push(fleet(b, g, taxiN, vehMat, targets.wrap(taxiN, 4, SINK_FLOOR, (i, t, p, q, s) => {
      const lane = lanes[[0, 1, 2, 3, 5][i % 5]!]!
      along(lane, seedOf(i + 30) * lane.length + t * 17, p, q, 0.08)
      s.setScalar(1.5)
      return true
    })))
  }
  // The low tier keeps the sky's showpieces (rockets, taxis, the blimp, the
  // freighter) and drops the swarms: fewer kinds is fewer draw calls, and
  // fewer vehicles is less to place every frame on a phone that is short of
  // both.
  // Quadcopters: small, many, weaving along the inner lanes.
  if (!low) {
    const [b, g] = quadcopter()
    const quadN = n(16)
    fleets.push(fleet(b, g, quadN, vehMat, targets.wrap(quadN, 3.2, SINK_FLOOR, (i, t, p, q, s) => {
      const lane = lanes[i % 2]!
      along(lane, seedOf(i) * lane.length + t * 9, p, q)
      p.y += Math.sin(t * 1.3 + i) * 2 + (i % 3) * 2.5
      p.x += Math.sin(t * 0.7 + i * 2) * 3
      s.setScalar(1.6)
      return true
    })))
  }
  // Police cruisers: fast, on the middle rings, lights flashing.
  const copN = low ? 0 : 3
  const cops = copN ? (() => {
    const [b, g] = cruiser()
    return fleet(b, g, copN, vehMat, (i, t, p, q, s) => {
      const lane = lanes[2 + (i % 2)]!
      along(lane, seedOf(i + 60) * lane.length + t * 28, p, q, 0.15)
      s.setScalar(1.5)
      return true
    })
  })() : null
  if (cops) fleets.push(cops)
  // Their light bars: two halves per car, recoloured every frame.
  const bars = copN ? new InstancedMesh(mergeGeometries(lightbar()), vehLight, copN * 2) : null
  if (bars) {
    bars.frustumCulled = false
    bars.instanceMatrix.setUsage(DynamicDrawUsage)
  }
  // Cargo haulers on the straight lanes.
  if (!low) {
    const [b, g] = hauler()
    fleets.push(fleet(b, g, n(4), vehMat, (i, t, p, q, s) => {
      const lane = lanes[5 + (i % 2)]!
      along(lane, seedOf(i + 90) * lane.length + t * 11 * (i % 2 ? 1 : -1), p, q)
      if (i % 2 === 0) q.multiply(tmpQ.setFromAxisAngle(YAXIS, Math.PI))
      s.setScalar(1.3)
      return true
    }))
  }
  let route: ReturnType<typeof blimpLane>
  // An ad blimp, slow, on the outer ring: on its own route, bent round the
  // tether and the launch column and lifted over every tower it passes, so
  // it never sails through one (#170).
  {
    const [b, g] = blimp()
    route = blimpLane(cx, cz, reach + 120, y0 + 54, skyObstacles(plots, markAt))
    const f = fleet(b, g, 1, vehMat, (_i, t, p, q, s) => {
      along(route, t * 4, p, q)
      s.setScalar(1)
      return true
    })
    f.body.name = 'blimp'
    fleets.push(f)
  }
  // A freighter crossing high over the far city (and over the blimp, where
  // its route has climbed over a tall tower: they never meet).
  {
    const [b, g] = freighter()
    const lane = chordLane(cx, cz, reach + 150, base + 4.2, Math.max(150, route.peak + BLIMP_BELOW + 14), 230)
    fleets.push(fleet(b, g, n(2), vehMat, (i, t, p, q, s) => {
      along(lane, i * 230 + t * 7, p, q)
      s.setScalar(1)
      return true
    }))
  }

  for (const f of fleets) root.add(f.body)
  if (bars) root.add(bars)

  const m = new Matrix4()
  const p = new Vector3()
  const q = new Quaternion()
  const s = new Vector3()
  const hidden = new Matrix4().makeScale(0, 0, 0)
  const red = new Color('#ff2036')
  const blue = new Color('#2f6bff')
  const off = new Color('#301018')
  const barM = new Matrix4()
  const barL = new Matrix4().makeTranslation(-0.45, 0, 0)
  const barR = new Matrix4().makeTranslation(0.45, 0, 0)
  const total = fleets.reduce((a, f) => a + f.n, 0)

  /** How many of each fleet's vehicles are in the sky (into `out`):
   *  vehicles join one every TRICKLE s, dealt round the fleets in turn.
   *  Returns how many have joined in all. */
  const active = new Array<number>(fleets.length).fill(0)
  const countActive = (): number => {
    active.fill(0)
    if (trafficFrom < 0) return 0
    const joined = Math.min(total, Math.floor((lastT - trafficFrom) / TRICKLE) + 1)
    for (let j = 0, f = 0; j < joined; f = (f + 1) % fleets.length) {
      if (active[f]! < fleets[f]!.n) {
        active[f]!++
        j++
      }
    }
    return joined
  }

  let placedAt = -Infinity
  const update = (t: number): void => {
    lastT = t
    for (const mat of mats) if (mat.uniforms.uTime) mat.uniforms.uTime.value = t
    for (const rv of reveals) {
      const kr = Math.min(1, (t - rv.at) / REVEAL)
      for (const mat of rv.mats) mat.uniforms.uReveal!.value = kr * kr * (3 - 2 * kr)
    }
    // The low tier moves its traffic at 30 Hz: far off, the steps never show,
    // and the matrices upload half as often.
    if (low && Math.abs(t - placedAt) < 1 / 30) return
    placedAt = t
    countActive()
    targets.tick()
    fleets.forEach((f, fi) => {
      const act = active[fi]!
      f.body.count = act
      if (bars && f === cops) bars.count = act * 2
      for (let i = 0; i < act; i++) {
        s.set(1, 1, 1)
        const on = f.place(i, t, p, q, s)
        if (on) m.compose(p, q, s)
        f.body.setMatrixAt(i, on ? m : hidden)
        if (bars && f === cops) {
          // The light bar rides the cruiser; its halves flash in turn.
          for (let h = 0; h < 2; h++) {
            barM.multiplyMatrices(m, h ? barR : barL)
            bars.setMatrixAt(i * 2 + h, on ? barM : hidden)
            const phase = Math.floor(t * 6 + i) % 2
            bars.setColorAt(i * 2 + h, phase === h ? (h ? blue : red) : off)
          }
        }
      }
      if (act) f.body.instanceMatrix.needsUpdate = true
    })
    if (bars) {
      bars.instanceMatrix.needsUpdate = true
      if (bars.instanceColor) bars.instanceColor.needsUpdate = true
    }
  }
  // Colour buffer on the bars from the start (one program, never recompiled).
  if (bars) for (let i = 0; i < copN * 2; i++) bars.setColorAt(i, off)
  update(0)

  const stream = (budgetMs: number): boolean => {
    if (trafficFrom < 0) trafficFrom = lastT
    const t0 = performance.now()
    while (jobAt < jobs.length) {
      jobs[jobAt++]!()
      if (performance.now() - t0 >= budgetMs) break
    }
    return jobAt >= jobs.length && countActive() >= total
  }

  return {
    root,
    quality,
    update,
    stream,
    // `look.lit` is the one colour every city material's `uLit` points at.
    setLight: (k01: number) => { look.lit.copy(litBase).multiplyScalar(Math.max(0, Math.min(1, k01))) },
    shotHits: (x, y, z, r, out) => targets.hit(x, y, z, r, lastT, out),
    sinking: (emit) => targets.sinking(lastT, emit),
    dispose: () => {
      root.traverse((o) => {
        const mesh = o as Mesh
        if (mesh.geometry) mesh.geometry.dispose()
        if (o instanceof InstancedMesh) o.dispose()
      })
      for (const mat of mats) mat.dispose()
    }
  }
}

/** How close the traffic comes to the level's centre, horizontally (m): the
 *  innermost lane's radius. The level reaches `reach` from its centre. */
export const trafficClearance = (map: MapData): { reach: number; nearest: number } => {
  const reach = Math.hypot(map.w, map.h) * CELL / 2
  return { reach, nearest: reach + 42 }
}
