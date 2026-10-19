import {
  BufferGeometry, Color, CylinderGeometry, DynamicDrawUsage, Float32BufferAttribute, Group, IcosahedronGeometry, InstancedMesh, Matrix4, Mesh,
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
#define CLOUD_DRIFT 6.0
#include <common>
#include <color_pars_vertex>
attribute vec2 aW;
uniform float uHazeNear;
uniform float uHazeFar;
uniform float uHazeMax;
uniform float uHazeLit;
uniform float uCloudHaze;
uniform float uReveal;
uniform float uTime;
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
  float hazeMax = uHazeMax;
  // Cloud puffs (aW.y < 0, see puff()) cut through the haze, so the cloud
  // sea reads to the horizon; drifting ones (aW.y < -1.5) sway slowly on
  // their own phase (aW.x), every vertex of a puff by the same offset.
  if ( aW.y < -0.5 ) {
    hazeMax *= uCloudHaze;
    if ( aW.y < -1.5 ) wp.xz += vec2( sin( uTime * 0.05 + aW.x ), cos( uTime * 0.037 + aW.x * 1.7 ) ) * CLOUD_DRIFT;
  }
  float d = distance( wp.xyz, cameraPosition );
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
    // (Clouds, vW.y < -0.5, keep their own palette: see cloudPalette.)
    c *= 1.0 - 0.5 * uNight * step( -0.5, vW.y );
  #endif
  #ifdef WINDOWS
    // A grid of windows on every wall face (vW.y = 1), lit at random, more
    // of them at night. Past a couple of pixels per window the grid fades
    // into its average, so it never shimmers.
    vec2 cell = fract( vUv );
    vec2 id = floor( vUv );
    float win = step( 0.16, cell.x ) * step( cell.x, 0.84 ) * step( 0.28, cell.y ) * step( cell.y, 0.82 );
    float px = max( fwidth( vUv.x ), fwidth( vUv.y ) );
    win = mix( win, 0.42, clamp( px * 2.2 - 0.4, 0.0, 1.0 ) ) * max( vW.y, 0.0 );
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
      // How much of the haze the clouds take (see VERT): the palette's.
      uCloudHaze: { value: 0.3 },
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

/**
 * A flat ring round the ground's disc, out to the horizon: its rings at
 * `radii` (the first the disc's own edge, same yaw, so they meet without a
 * gap or an overlap), each in its colour, shaded as the disc's roof.
 */
const seaRim = (sides: number, radii: number[], cols: Color[]): BufferGeometry => {
  const pos: number[] = []
  const col: number[] = []
  const idx: number[] = []
  for (let k = 0; k < radii.length; k++) {
    for (let s = 0; s <= sides; s++) {
      const a = (s / sides) * Math.PI * 2 + Math.PI / sides
      pos.push(Math.cos(a) * radii[k]!, 0, Math.sin(a) * radii[k]!)
      col.push(cols[k]!.r, cols[k]!.g, cols[k]!.b)
    }
  }
  const w = sides + 1
  for (let k = 0; k + 1 < radii.length; k++) {
    for (let s = 0; s < sides; s++) {
      const a = k * w + s
      idx.push(a, a + 1, a + w + 1, a, a + w + 1, a + w)
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new Float32BufferAttribute(pos.map((_, i) => i % 3 === 1 ? 1 : 0), 3))
  g.setAttribute('color', new Float32BufferAttribute(col, 3))
  g.setIndex(idx)
  return finish(g, false)
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

/** A lane's room for the widest vehicle on it (a hauler, ~10 m long at its
 *  scale) and a parcel drone's bob under it, plus its sway (m). */
export const LANE_CLEAR = 11
export const LANE_DIP = 2
/** The freighter's reach round its centre (m). */
export const FREIGHTER_CLEAR = 24

const skyObstacles = (
  plots: Array<{ x: number; z: number; h: number; w: number; b: Builder }>,
  marks: Array<{ id: string; x: number; z: number }>
): SkyObstacle[] => [
  ...plots.map(p => ({ x: p.x, z: p.z, ...plotBounds(p.b, p.h, p.w) })),
  ...marks.map(m => ({ x: m.x, z: m.z, ...MARK_BOUNDS[m.id]! }))
]

/** Room a route keeps off every building, past its vehicles' reach (m). */
export const ROUTE_MARGIN = 4
/** A landmark or tower a route would have to climb more than this over (m)
 *  it goes round instead: a taxi lifted 150 m over the halo is out of the
 *  sky's play (and out of a shot's reach). */
const LIFT_MAX = 60

/**
 * Any traffic lane made clear of the skyline (#181 follow-up): sampled every
 * 2 m, each sample is pushed radially (in or out, never nearer the level
 * than `minR`) round every `wall` and every tower it would
 * have to climb more than LIFT_MAX over, then lifted over what is
 * still under it, with gentle ramps either way (the route bends or rises
 * before it reaches a tower, never through it). `clear` is the reach of the
 * widest vehicle on the lane round its centre, `dip` how far below the lane
 * one wobbles. The level's own sky is never flown over.
 * Deterministic: it reads nothing but the lane and the obstacles.
 */
export const clearLane = (
  src: Lane, closed: boolean, cx: number, cz: number, clear: number, dip: number, obstacles: SkyObstacle[], minR = 0
): Lane => {
  const N = Math.max(8, Math.ceil(src.length / 2))
  const n = closed ? N : N + 1
  const seg = src.length / N
  const v = new Vector3()
  const xs: number[] = []
  const ys: number[] = []
  const zs: number[] = []
  for (let i = 0; i < n; i++) {
    src.at(i * seg, v)
    xs.push(v.x)
    ys.push(v.y)
    zs.push(v.z)
  }
  const ramp = (a: number[], perM: number): void => {
    const d = perM * seg
    for (let pass = 0; pass < 2; pass++) {
      const m = closed ? n * 2 : n - 1
      for (let i = 0; i < m; i++) a[(i + 1) % n] = Math.max(a[(i + 1) % n]!, a[i % n]! - d)
      for (let i = m; i > 0; i--) a[(i - 1) % n] = Math.max(a[(i - 1) % n]!, a[i % n]! - d)
    }
  }
  // Widened by a sample's spacing: the line between two samples is covered.
  const keepOf = (o: SkyObstacle) => o.r + clear + ROUTE_MARGIN + seg
  const climb = (o: SkyObstacle) => o.top + clear + dip + ROUTE_MARGIN
  // 1. Round the walls and the tallest towers, radially, on the side of
  //    each the route already runs: inside one farther out from the city
  //    than the route (never nearer the level than `minR`), outside one
  //    nearer in. What a bend cannot clear is climbed over in 2.
  // A wall's bend (it cannot be climbed) wins over a tower's where both
  // want a sample; the tower is then climbed over.
  const bend = (wallsOnly: boolean): void => {
    const pushIn = new Array<number>(n).fill(0)
    const pushOut = new Array<number>(n).fill(0)
    const wallIn = new Array<number>(n).fill(0)
    const wallOut = new Array<number>(n).fill(0)
    for (const o of obstacles) {
      if (wallsOnly && !o.wall) continue
      // A metre over: a bent sample lands past the edge, not on it.
      const keep = keepOf(o) + 1
      // One side per obstacle: inside it if the route is inside it where it
      // passes nearest and can bend in far enough there, else outside.
      let inward = true
      let any = false
      for (let i = 0; i < n; i++) {
        if (!o.wall && climb(o) - ys[i]! <= LIFT_MAX) continue
        const px = xs[i]! - cx, pz = zs[i]! - cz
        const rho = Math.hypot(px, pz) || 1
        const ux = px / rho, uz = pz / rho
        const wx = o.x - xs[i]!, wz = o.z - zs[i]!
        const a = wx * ux + wz * uz
        const lat = Math.abs(wx * uz - wz * ux)
        // Only where the route actually runs into it (the ramps bend it
        // early); the radial line's far end means nothing.
        if (lat >= keep || wx * wx + wz * wz >= keep * keep) continue
        const h = Math.sqrt(keep * keep - lat * lat)
        any = true
        if (a <= 0 || rho - (h - a) < minR) inward = false
      }
      if (!any) continue
      for (let i = 0; i < n; i++) {
        if (!o.wall && climb(o) - ys[i]! <= LIFT_MAX) continue
        const px = xs[i]! - cx, pz = zs[i]! - cz
        const rho = Math.hypot(px, pz) || 1
        const ux = px / rho, uz = pz / rho
        const wx = o.x - xs[i]!, wz = o.z - zs[i]!
        const a = wx * ux + wz * uz
        const lat = Math.abs(wx * uz - wz * ux)
        // Only where the route actually runs into it (the ramps bend it
        // early); the radial line's far end means nothing.
        if (lat >= keep || wx * wx + wz * wz >= keep * keep) continue
        const h = Math.sqrt(keep * keep - lat * lat)
        const pi = o.wall ? wallIn : pushIn
        const po = o.wall ? wallOut : pushOut
        if (inward) pi[i] = Math.max(pi[i]!, h - a)
        else po[i] = Math.max(po[i]!, a + h)
      }
    }
    for (const a of [pushIn, pushOut, wallIn, wallOut]) ramp(a, 0.6)
    for (let i = 0; i < n; i++) {
      const d = wallIn[i]! || wallOut[i]!
        ? (wallOut[i]! >= wallIn[i]! ? wallOut[i]! : -wallIn[i]!)
        : pushOut[i]! >= pushIn[i]! ? pushOut[i]! : -pushIn[i]!
      if (!d) continue
      const px = xs[i]! - cx, pz = zs[i]! - cz
      const rho = Math.hypot(px, pz) || 1
      xs[i] = xs[i]! + (px / rho) * d
      zs[i] = zs[i]! + (pz / rho) * d
    }
  }
  // Then the walls again (twice): a tower's bend ramping off beside one
  // may have carried the route back into it.
  bend(false)
  bend(true)
  bend(true)
  // 2. Over every tower still under it, where it now runs.
  const lift = new Array<number>(n).fill(0)
  for (const o of obstacles) {
    if (o.wall) continue
    const keep = keepOf(o)
    for (let i = 0; i < n; i++) {
      if (Math.hypot(xs[i]! - o.x, zs[i]! - o.z) < keep) lift[i] = Math.max(lift[i]!, climb(o) - ys[i]!)
    }
  }
  ramp(lift, 0.35)
  for (let i = 0; i < n; i++) ys[i] = ys[i]! + Math.max(0, lift[i]!)
  // Arc length along the cleared route.
  const cum = new Array<number>(n + 1).fill(0)
  const segs = closed ? n : n - 1
  for (let i = 0; i < segs; i++) {
    const j = (i + 1) % n
    cum[i + 1] = cum[i]! + Math.hypot(xs[j]! - xs[i]!, zs[j]! - zs[i]!)
  }
  const length = cum[segs]!
  let hint = 0
  return {
    length,
    at: (s, out) => {
      const u = closed ? ((s % length) + length) % length : Math.max(0, Math.min(length, s))
      if (!(cum[hint]! <= u && cum[hint + 1]! >= u)) {
        let lo = 0
        let hi = segs
        while (hi - lo > 1) {
          const mid = (lo + hi) >> 1
          if (cum[mid]! <= u) lo = mid
          else hi = mid
        }
        hint = lo
      }
      const i = hint
      const j = (i + 1) % n
      const f = (u - cum[i]!) / Math.max(1e-6, cum[i + 1]! - cum[i]!)
      out.set(xs[i]! + (xs[j]! - xs[i]!) * f, ys[i]! + (ys[j]! - ys[i]!) * f, zs[i]! + (zs[j]! - zs[i]!) * f)
      return Math.atan2(xs[j]! - xs[i]!, zs[j]! - zs[i]!)
    }
  }
}

/** True if a vehicle centred at (x, y, z), `r` round, reaching `below` under
 *  its centre, stands clear of every obstacle by `margin`. */
export const skyClear = (obstacles: SkyObstacle[], x: number, y: number, z: number, r: number, below: number, margin: number): boolean => {
  for (const o of obstacles) {
    if (y - below >= o.top + margin) continue
    if (Math.hypot(x - o.x, z - o.z) < o.r + r + margin) return false
  }
  return true
}

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

// ─── The sea of clouds ───────────────────────────────────────────────────────

/** Where cloud geometry may rise: the ground plane (`buildCityscape`) sits at
 *  y = -0.6..-0.5. Every puff's underside sinks well below it, so no puff face
 *  ever lies in the plane (no z-fighting at any distance). */
export const CLOUD_SINK = -2.5

/** How far a drifting puff sways off its spot (m): CLOUD_DRIFT in VERT. */
export const CLOUD_DRIFT = 6

/**
 * A cloud's three tones, top to belly (toon steps, no shading baked), plus
 * the city glow some bellies catch (none by day), the flat sea's tone past
 * the level (`rim`: the pits' mist only under it) and how much of the haze
 * the clouds take (`haze`, a share of the walls') and how much of the
 * rolling sea falls out of the crest's tone into the flanks and troughs
 * (`sink`, 0 by day: more contrast where the sky would swallow the crests).
 */
export interface CloudPalette { top: Color; flank: Color; under: Color; glow: Color[]; rim: Color; haze: number; sink: number }

/**
 * The clouds' palette for a sector, to match its sky: white tops and soft
 * blue bellies by day (gale and every other); under neon's purple night,
 * muted moonlit lavender-grey crests over deep indigo troughs, a few bellies
 * lit magenta or cyan by the city, the flat sea a night indigo; in rotor's
 * dusk, warm sunlit crests over dusky rose-mauve troughs, thinly hazed so
 * they do not melt into the warm fog. The clouds keep it at night too (FRAG
 * leaves them out of the walls' night dimming).
 */
export const cloudPalette = (themeId: string, fog: Color): CloudPalette => {
  const mist = fog.clone().lerp(new Color('#ffffff'), 0.35)
  // `shade`: how far the flanks fall toward the belly (deeper for contrast).
  const pal = (top: string, under: Color, rim = mist, haze = 0.3, glow: string[] = [], shade = 0.38, sink = 0): CloudPalette => {
    const t = new Color(top)
    return { top: t, flank: t.clone().lerp(under, shade), under, glow: glow.map(h => new Color(h)), rim, haze, sink }
  }
  if (themeId === 'neon') {
    return pal('#7c74a4', new Color('#24184e').lerp(new Color('#a0308a'), 0.12), new Color('#2c2058'), 0.3, ['#c0409c', '#3aa8c8'], 0.58, 0.06)
  }
  if (themeId === 'rotor') return pal('#ffeacc', new Color('#7a4466').lerp(new Color('#5e4282'), 0.3), new Color('#c89a98'), 0.12, [], 0.55, 0.16)
  return pal('#ffffff', fog.clone().lerp(new Color('#5d7cc4'), 0.6))
}

/** A belly's tone: now and then lit by the city's glow, if the palette has
 *  one (`pick` in 0..1 picks the facet and its colour). */
const belly = (pal: CloudPalette, c: Color, pick: number): Color => {
  const n = pal.glow.length
  if (n && pick < 0.3) c.lerp(pal.glow[Math.floor((pick / 0.3) * n) % n]!, 0.24)
  return c
}

/**
 * One chunky puff: a 20-facet icosahedron, flattened and turned, each facet
 * its own flat colour from the palette — the top lit, shading into the
 * belly's tone underneath. Indexed, with the city's attributes, so it merges into the
 * skyline's body meshes: the whole cloud sea costs no draw call of its own.
 * `aW` flags it a cloud for VERT (y = -1, or -2 to drift, on phase x), which
 * thins the haze on it so the banks still read at the horizon.
 */
const puff = (r: () => number, pal: CloudPalette, p: V3, s: V3, drift = false): BufferGeometry => {
  const g = new IcosahedronGeometry(1, 0)
  g.deleteAttribute('uv')
  g.deleteAttribute('normal')
  xform(g, p, [(r() - 0.5) * 0.5, r() * Math.PI * 2, (r() - 0.5) * 0.5], s)
  g.computeVertexNormals()
  const nor = g.attributes.normal!
  const n = nor.count
  const { top, under } = pal
  const cols = new Float32Array(n * 3)
  const c = new Color()
  // One glow pick per puff (drawn only if the palette glows, so day clouds
  // keep their layout).
  const pick = pal.glow.length ? r() : 1
  for (let i = 0; i < n; i++) {
    const up = nor.getY(i)
    const sun = Math.max(0, nor.getX(i) * SUN.x + nor.getY(i) * SUN.y + nor.getZ(i) * SUN.z)
    // Toon steps: sunlit top, a pale blue flank, a cool blue belly.
    const k = up > 0.55 ? 0 : up > -0.1 ? 0.42 - 0.14 * sun : 0.85
    c.copy(top).lerp(under, k)
    if (k > 0.8) belly(pal, c, pick)
    cols.set([c.r, c.g, c.b], i * 3)
  }
  g.setAttribute('color', new Float32BufferAttribute(cols, 3))
  g.setIndex([...Array(n).keys()])
  finish(g, false, 0, false)
  const aw = g.attributes.aW!
  const phase = r() * Math.PI * 2
  for (let i = 0; i < n; i++) aw.setXY(i, phase, drift ? -2 : -1)
  return g
}

/** Where cloud geometry may rise: see CLOUD_SINK. A puff `sy` tall half
 *  shows above it. */
const lift = (sy: number) => CLOUD_SINK + sy * 0.75

/** What no cloud may enter: a tower's or landmark's footprint (`r`, its
 *  whole spread), a vertical column from the ground up. */
export type CloudKeepOut = Array<{ x: number; z: number; r: number }>

/** The room a cloud has at (x, z): its distance to the nearest footprint's
 *  rim (m). */
const room = (keepOut: CloudKeepOut, x: number, z: number): number => {
  let m = Infinity
  for (const k of keepOut) m = Math.min(m, Math.hypot(k.x - x, k.z - z) - k.r)
  return m
}

/** Clear of every footprint by `gap` m, every vertex, at any sway. */
const clearOf = (g: BufferGeometry, keepOut: CloudKeepOut, gap: number): boolean => {
  const pos = g.attributes.position!
  for (let i = 0; i < pos.count; i++) {
    if (room(keepOut, pos.getX(i), pos.getZ(i)) <= gap) return false
  }
  return true
}

/**
 * The cloud sea the sky city rises out of (`Terrain.clouds` maps). The
 * towers pierce its flat surface (the pale ground) cleanly; no cloud ever
 * wraps one or enters a footprint in `keepOut` (by its sway and a margin
 * more). On the surface: low, flat billows filling the open gaps between
 * the buildings, broad drifting banks out where the sky opens up, and a
 * billowing ridge on the horizon; above it, a few cloud islands adrift in
 * open sky. Purely visual (nothing collides with the city), kept out past
 * the level's reach, and modest: ~60 vertices a puff.
 */
export const cloudSea = (
  r: () => number, fog: Color, cx: number, cz: number, reach: number,
  keepOut: CloudKeepOut, low: boolean, pal: CloudPalette = cloudPalette('', fog), half?: [number, number]
): BufferGeometry[] => {
  const out: BufferGeometry[] = []
  const MARGIN = 2
  // One puff at (x, z), as wide as the room there allows (up to `size`),
  // dropped when it would be a crumb or would still touch a footprint.
  const place = (x: number, z: number, size: number, flat: number, y: number | null, drift: boolean): boolean => {
    const sway = drift ? CLOUD_DRIFT : 0
    // A tilted puff reaches a little past its widest axis: keep 1.3x room.
    const sx = Math.min(size, (room(keepOut, x, z) - sway - MARGIN) / 1.3, Math.hypot(x - cx, z - cz) - reach - 22)
    if (sx < 4) return false
    const sy = sx * flat
    const g = puff(r, pal, [x, y ?? lift(sy), z], [sx, sy, sx * (0.6 + r() * 0.4)], drift)
    if (!clearOf(g, keepOut, sway + MARGIN)) { g.dispose(); return false }
    out.push(g)
    return true
  }
  const scatter = (n: number, from: number, to: number, size: number, flat: number, drift: boolean) => {
    for (let i = 0, tries = 0; i < n && tries < n * 4; tries++) {
      const a = r() * Math.PI * 2
      const d = from + r() * (to - from)
      if (place(cx + Math.cos(a) * d, cz + Math.sin(a) * d, size * (0.7 + r() * 0.6), flat * (0.8 + r() * 0.4), null, drift)) i++
    }
  }
  // Billows in the gaps between the towers: still, low and flat, so the
  // sea's surface swells round the feet without touching them.
  scatter(low ? 24 : 70, reach + 28, 215, 11, 0.4, false)
  // Banks where the sky opens up: broad, and drifting.
  scatter(low ? 6 : 16, reach + 60, 215, 20, 0.45, true)
  // The horizon ridge — tall, overlapping billows round the ground's rim,
  // so the skyline ends in a cloud sea instead of a flat edge.
  for (let i = 0, n = low ? 14 : 30; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * (Math.PI * 2 / n)
    const d = 215 + r() * 30
    place(cx + Math.cos(a) * d, cz + Math.sin(a) * d, 34 * (0.6 + r() * 0.8), 0.6 + r() * 0.3, null, true)
  }
  // Islands adrift above the sea: a big puff with two smaller ones on its
  // back, in open sky only.
  const islands = low ? 2 : 5
  for (let i = 0, tries = 0; i < islands && tries < 60; tries++) {
    const a = r() * Math.PI * 2
    const d = reach + 60 + r() * 100
    const x = cx + Math.cos(a) * d
    const z = cz + Math.sin(a) * d
    const y = 8 + r() * 10
    const s = 5 + r() * 4
    // The island's own reach (its big puff, 1.6 s, tilted) plus its sway.
    if (room(keepOut, x, z) < s * 2.2 + CLOUD_DRIFT + MARGIN) continue
    const parts = [
      puff(r, pal, [x, y, z], [s * 1.6, s * 0.55, s * 1.2], true),
      puff(r, pal, [x + s * 0.5, y + s * 0.4, z], [s * 0.8, s * 0.5, s * 0.7], true),
      puff(r, pal, [x - s * 0.6, y + s * 0.25, z + s * 0.3], [s * 0.6, s * 0.4, s * 0.6], true)
    ]
    if (!parts.every(g => clearOf(g, keepOut, CLOUD_DRIFT + MARGIN))) { parts.forEach(g => g.dispose()); continue }
    i++
    out.push(...parts)
  }
  // Under it all, the rolling surface every tower pierces (last: the puffs
  // come first).
  out.push(cloudSurface(r, fog, pal, cx, cz, reach, keepOut, low, half))
  return out
}

/** Where the rolling surface sinks to at its rims (round every footprint
 *  and at its inner edge): well under the ground plane, so it runs into the
 *  plane at a slant and never lies in it. */
export const SURFACE_DIP = CLOUD_SINK + 0.3

/**
 * The cloud sea's rolling surface: a faceted polar heightfield from just
 * past the level's walls (`half`, its half extents; else its reach) to the
 * ground's rim, swelling up to ~10 m over the pale ground plane (higher
 * toward the horizon) but kept under 0.5 m within 20 m of the level's reach
 * (the city's clearance), each facet a stepped tone by its height and its
 * slope to the sun (white crests, pale flanks, blue troughs). Static, cut round the
 * footprints: no facet with a corner (or an edge's middle, or its own) in a
 * tower's or landmark's footprint, and every corner of the cut's edge sinks
 * to SURFACE_DIP, under the ground plane: each tower stands in a narrow
 * trough, one facet wide, whose ragged rim stays hidden under the plane.
 */
const cloudSurface = (
  r: () => number, fog: Color, pal: CloudPalette, cx: number, cz: number, reach: number,
  keepOut: CloudKeepOut, low: boolean, half?: [number, number]
): BufferGeometry => {
  const GAP = 1.5
  const r1 = 238
  // Where it starts, by bearing: 14 m past the walls (or round the reach).
  const from = (a: number) => half
    ? Math.min(half[0] / Math.max(1e-6, Math.abs(Math.cos(a))), half[1] / Math.max(1e-6, Math.abs(Math.sin(a)))) + 14
    : reach + 24
  const rings = low ? 14 : 22
  const segs = low ? 56 : 84
  const ph = [r() * 6.3, r() * 6.3, r() * 6.3, r() * 6.3]
  const mist = fog.clone().lerp(new Color('#ffffff'), 0.35)
  const inside = (x: number, z: number) => keepOut.some(k => Math.hypot(k.x - x, k.z - z) <= k.r)
  // The grid: rings closer near (where it is seen big), jittered a little.
  const n = (rings + 1) * segs
  const px = new Float32Array(n)
  const pz = new Float32Array(n)
  const py = new Float32Array(n)
  const hn = new Float32Array(n)
  const bad = new Uint8Array(n)
  const rim = new Uint8Array(n)
  for (let i = 0; i <= rings; i++) {
    const jit = i === 0 || i === rings ? 0 : 0.3
    for (let j = 0; j < segs; j++) {
      const v = i * segs + j
      const a = ((j + (i % 2) * 0.5 + (r() - 0.5) * jit) / segs) * Math.PI * 2
      const r0 = Math.min(from(a), r1 - 40)
      const dd = r0 + (r1 - r0) * (i / rings) ** 1.3 + (r() - 0.5) * jit * (r1 - r0) / rings
      const x = cx + Math.cos(a) * dd
      const z = cz + Math.sin(a) * dd
      px[v] = x
      pz[v] = z
      // Rolling swells, two octaves, rising toward the horizon.
      const w = 0.5 + 0.25 * Math.sin(x * 0.045 + ph[0]!) * Math.sin(z * 0.05 + ph[1]!) +
        0.25 * Math.sin((x - z) * 0.11 + ph[2]!) * Math.sin((x + z) * 0.07 + ph[3]!)
      const dc = Math.hypot(x - cx, z - cz)
      // Low by the level (under 0.5 m within its reach + 20), rising past it.
      const h = Math.min(0.6 + 6 * w * w + 3 * Math.min(1, Math.max(0, (dc - 170) / 60)), 0.4 + Math.max(0, dc - reach - 20) * 0.35)
      if (keepOut.some(k => Math.hypot(k.x - x, k.z - z) <= k.r + GAP)) bad[v] = 1
      // Down into the dip at the inner edge.
      const f = Math.min(1, Math.max(0, (dd - r0) / 8))
      py[v] = SURFACE_DIP + (h - SURFACE_DIP) * f
      hn[v] = w * f
    }
  }
  // The cut: every facet with a corner, an edge's middle or its middle in a
  // footprint goes, and the corners it leaves on the edge sink under the plane.
  const tris: number[] = []
  const cut = (a: number, b: number, d: number): boolean =>
    !!(bad[a] || bad[b] || bad[d]) ||
    inside((px[a]! + px[b]!) / 2, (pz[a]! + pz[b]!) / 2) || inside((px[b]! + px[d]!) / 2, (pz[b]! + pz[d]!) / 2) ||
    inside((px[d]! + px[a]!) / 2, (pz[d]! + pz[a]!) / 2) ||
    inside((px[a]! + px[b]! + px[d]!) / 3, (pz[a]! + pz[b]! + pz[d]!) / 3)
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < segs; j++) {
      const a = i * segs + j
      const b = i * segs + (j + 1) % segs
      const d = (i + 1) * segs + j
      const e = (i + 1) * segs + (j + 1) % segs
      for (const t of [[a, b, d], [b, e, d]] as const) {
        if (cut(...t)) for (const v of t) rim[v] = 1
        else tris.push(...t)
      }
    }
  }
  for (let v = 0; v < n; v++) {
    if (!rim[v]) continue
    py[v] = SURFACE_DIP
    hn[v] = 0
  }
  const pos: number[] = []
  const col: number[] = []
  const c = new Color()
  const sunk = new Color().copy(pal.flank).lerp(pal.under, 0.7).lerp(mist, 0.35)
  for (let i = 0; i < tris.length; i += 3) {
    const a = tris[i]!
    const b = tris[i + 1]!
    const d = tris[i + 2]!
    // Wound to face up.
    const o = (px[b]! - px[a]!) * (pz[d]! - pz[a]!) - (pz[b]! - pz[a]!) * (px[d]! - px[a]!)
    for (const v of o < 0 ? [a, b, d] : [a, d, b]) pos.push(px[v]!, py[v]!, pz[v]!)
    // Stepped tones by the facet's height in the swell and its slope to the
    // sun: crest, flank, trough; a facet sinking into a dip takes the
    // belly's tone, lifted toward the ground's mist, so the seam with the
    // plane is quiet.
    const ux = px[b]! - px[a]!, uy = py[b]! - py[a]!, uz = pz[b]! - pz[a]!
    const vx = px[d]! - px[a]!, vy = py[d]! - py[a]!, vz = pz[d]! - pz[a]!
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
    const sun = Math.abs(nx * SUN.x + ny * SUN.y + nz * SUN.z) / (Math.hypot(nx, ny, nz) || 1)
    const t = (hn[a]! + hn[b]! + hn[d]!) / 3 + 1.6 * (sun - SUN.y) - pal.sink
    if (Math.min(py[a]!, py[b]!, py[d]!) < 0) c.copy(sunk)
    else if (t > 0.55) c.copy(pal.top)
    else if (t > 0.4) c.copy(pal.top).lerp(pal.flank, 0.5)
    else if (t > 0.25) c.copy(pal.flank)
    else belly(pal, c.copy(pal.flank).lerp(pal.under, 0.6), (Math.sin(px[a]! * 12.9898 + pz[a]! * 78.233) * 43758.5453 % 1 + 1) % 1)
    for (let k = 0; k < 3; k++) col.push(c.r, c.g, c.b)
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setAttribute('color', new Float32BufferAttribute(col, 3))
  g.computeVertexNormals()
  g.setIndex([...Array(pos.length / 3).keys()])
  finish(g, false, 0, false)
  // A static cloud to the shader (aW.y = -1): thin haze, no drift.
  const aw = g.attributes.aW!
  for (let i = 0; i < aw.count; i++) aw.setXY(i, 0, -1)
  return g
}

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
  /** A charged shot entering the sky (#181): the vehicle nearest its line,
   *  if close, steers to meet it. `range` its flight left (m). */
  lure(x: number, y: number, z: number, vx: number, vy: number, vz: number, range: number): boolean
  /** Each downed vehicle still sinking, by its centre (for its smoke). */
  sinking(emit: (x: number, y: number, z: number) => void): void
  /** The skyline's footprints every route keeps clear of. */
  obstacles: SkyObstacle[]
  /** Every flying traffic vehicle at `t` (a test's probe): its centre, its
   *  reach round it and below it. Places them, so it moves the lure clock. */
  probe(t: number, emit: (x: number, y: number, z: number, r: number, below: number, kind: string) => void): void
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
  // Past the level it takes the sea's own tone (`CloudPalette.rim`: a night
  // indigo under neon), shading over from the mist round the level's edge.
  const sky = map.terrain?.clouds ? cloudPalette(theme.id, fog) : null
  const groundHex = sky ? `#${fog.clone().lerp(new Color('#ffffff'), 0.35).getHexString()}` : '#2a3048'
  const inner = sky ? Math.min(reach + 10, 180) : 240
  const ground = prism(low ? 20 : 40, inner, inner, 0.1, groundHex, 0, false)
  kit.body.push(at(ground, [cx, -0.6, cz]))
  if (sky) {
    bodyMat.uniforms.uCloudHaze!.value = sky.haze
    kit.body.push(at(seaRim(low ? 20 : 40, [inner, inner + 25, 240], [new Color(groundHex), sky.rim, sky.rim]), [cx, -0.5, cz]))
  }

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
    // Out past the inner traffic rings, so they need not bend round them.
    const d = Math.max(reach + 105, 150) + r() * 25
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
  // Over open sky the towers rise out of a sea of clouds, merged into the
  // near body mesh (no draw call of its own). Drawn from its own seed, so
  // the rest of the city stays the same.
  const clouds = map.terrain?.clouds ? lcg(map.seed ^ 0xc10d) : null
  if (clouds) {
    const keepOut = [...plots.map(p => ({ x: p.x, z: p.z, r: plotBounds(p.b, p.h, p.w).r })), ...markAt.map(m => ({ x: m.x, z: m.z, r: MARK_BOUNDS[m.id]!.r }))]
    kit.body.push(...cloudSea(clouds, fog, cx, cz, reach, keepOut, low, sky!, [cx, cz]))
  }
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
    jobs.push(() => {
      for (const p of chunk) p.b(farKit, p.x, p.z, p.h, p.w)
    })
  }
  for (const m of markAt) {
    jobs.push(() => {
      m.make(farKit, m.x, m.z, m.a)
    })
  }
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
  // Every lane is cleared of the skyline once, here (no vehicle on it ever
  // clips a tower): LANE_CLEAR covers the widest vehicle that flies the
  // shared lanes (a hauler), LANE_DIP a parcel drone's bob below its lane.
  const obstacles = skyObstacles(plots, markAt)
  const y0 = top + 26
  const ring = (rr: number, y: number, dir: 1 | -1) => clearLane(ringLane(cx, cz, rr, y, dir), true, cx, cz, LANE_CLEAR, LANE_DIP, obstacles, reach + 32)
  const chord = (d: number, phi: number, y: number, half: number) => clearLane(chordLane(cx, cz, d, phi, y, half), false, cx, cz, LANE_CLEAR, LANE_DIP, obstacles, reach + 32)
  const lanes: Lane[] = [
    ring(reach + 42, y0, 1),
    ring(reach + 46, y0 + 5, -1),
    ring(reach + 78, y0 + 18, 1),
    ring(reach + 84, y0 + 23, -1),
    ring(reach + 120, y0 + 42, 1),
    chord(reach + 60, base + 0.9, y0 + 12, 200),
    chord(reach + 95, base + 2.6, y0 + 30, 200)
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
  // Each traffic fleet's reach round its centre and below it (m), for the
  // route-clearance probe (`Cityscape.probe`); the rockets are the
  // spaceport's own and not in it.
  const reachOf = new Map<Fleet, [number, number, string]>()
  const reg = (f: Fleet, r: number, below: number, kind: string): Fleet => (reachOf.set(f, [r, below, kind]), f)
  // The taxis and the parcel drones can be shot down (#169).
  const targets = new SkyTargets((x, y, z, r) => skyClear(obstacles, x, y, z, r + LANE_DIP, LANE_DIP, ROUTE_MARGIN))
  const SINK_FLOOR = -6
  // A parcel drone tips less into a detour's turn than a taxi banks (#181).
  const QUAD_BANK = 0.2
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
    fleets.push(reg(fleet(b, g, taxiN, vehMat, targets.wrap(taxiN, 4, SINK_FLOOR, (i, t, p, q, s) => {
      const lane = lanes[[0, 1, 2, 3, 5][i % 5]!]!
      along(lane, seedOf(i + 30) * lane.length + t * 17, p, q, 0.08)
      s.setScalar(1.5)
      return true
    })), 4.5, 1.5, 'taxi'))
  }
  // The low tier keeps the sky's showpieces (rockets, taxis, the blimp, the
  // freighter) and drops the swarms: fewer kinds is fewer draw calls, and
  // fewer vehicles is less to place every frame on a phone that is short of
  // both.
  // Quadcopters: small, many, weaving along the inner lanes.
  if (!low) {
    const [b, g] = quadcopter()
    const quadN = n(16)
    fleets.push(reg(fleet(b, g, quadN, vehMat, targets.wrap(quadN, 3.2, SINK_FLOOR, (i, t, p, q, s) => {
      const lane = lanes[i % 2]!
      along(lane, seedOf(i) * lane.length + t * 9, p, q)
      p.y += Math.sin(t * 1.3 + i) * 2 + (i % 3) * 2.5
      p.x += Math.sin(t * 0.7 + i * 2) * 3
      s.setScalar(1.6)
      return true
    }, QUAD_BANK)), 3.2, 1.5, 'drone'))
  }
  // Police cruisers: fast, on the middle rings, lights flashing.
  const copN = low ? 0 : 3
  const cops = copN ? (() => {
    const [b, g] = cruiser()
    return reg(fleet(b, g, copN, vehMat, (i, t, p, q, s) => {
      const lane = lanes[2 + (i % 2)]!
      along(lane, seedOf(i + 60) * lane.length + t * 28, p, q, 0.15)
      s.setScalar(1.5)
      return true
    }), 4.5, 1.5, 'cruiser')
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
    fleets.push(reg(fleet(b, g, n(4), vehMat, (i, t, p, q, s) => {
      const lane = lanes[5 + (i % 2)]!
      along(lane, seedOf(i + 90) * lane.length + t * 11 * (i % 2 ? 1 : -1), p, q)
      if (i % 2 === 0) q.multiply(tmpQ.setFromAxisAngle(YAXIS, Math.PI))
      s.setScalar(1.3)
      return true
    }), 10, 4, 'hauler'))
  }
  let route: ReturnType<typeof blimpLane>
  // An ad blimp, slow, on the outer ring: on its own route, bent round the
  // tether and the launch column and lifted over every tower it passes, so
  // it never sails through one (#170).
  {
    const [b, g] = blimp()
    route = blimpLane(cx, cz, reach + 120, y0 + 54, obstacles)
    const f = fleet(b, g, 1, vehMat, (_i, t, p, q, s) => {
      along(route, t * 4, p, q)
      s.setScalar(1)
      return true
    })
    f.body.name = 'blimp'
    fleets.push(reg(f, BLIMP_REACH, BLIMP_BELOW, 'blimp'))
  }
  // A freighter crossing high over the far city (and over the blimp, where
  // its route has climbed over a tall tower: they never meet).
  {
    const [b, g] = freighter()
    const lane = clearLane(chordLane(cx, cz, reach + 150, base + 4.2, Math.max(150, route.peak + BLIMP_BELOW + 14), 230), false, cx, cz, FREIGHTER_CLEAR, 0, obstacles)
    fleets.push(reg(fleet(b, g, n(2), vehMat, (i, t, p, q, s) => {
      along(lane, i * 230 + t * 7, p, q)
      s.setScalar(1)
      return true
    }), FREIGHTER_CLEAR, 6, 'freighter'))
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
    lure: (x, y, z, vx, vy, vz, range) => targets.lure(x, y, z, vx, vy, vz, range, lastT),
    sinking: (emit) => targets.sinking(lastT, emit),
    obstacles,
    probe: (t, emit) => {
      for (const [f, [r, below, kind]] of reachOf) {
        for (let i = 0; i < f.n; i++) {
          // Downed ones are falling out of the sky, not flying a route.
          if (f.place(i, t, p, q, s) && !targets.isDown(f.place, i)) emit(p.x, p.y, p.z, r, below, kind)
        }
      }
    },
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
