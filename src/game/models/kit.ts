import {
  BufferGeometry, SphereGeometry, CapsuleGeometry, LatheGeometry, TorusGeometry, CylinderGeometry,
  Vector2, Vector3, Matrix4, Quaternion, Euler, Float32BufferAttribute, Uint16BufferAttribute,
  Bone, Skeleton, SkinnedMesh, Group, Color, Mesh, type Material
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { rigToon, rigGlow, outlineMat } from './toon'
import type { MeshToonMaterial, MeshBasicMaterial } from 'three'

/**
 * ─── Rounded low-poly kit ────────────────────────────────────────────────────
 *
 * The art direction is "low poly but never cubey": every body part is a
 * sphere, capsule, torus or lathe at a modest segment count, with SMOOTH
 * normals so the toon ramp paints soft bands across it. Hard-edged primitives
 * (boxes, capped cylinders) are avoided on purpose — their split normals also
 * crack the inverted-hull outline at every edge.
 *
 * All helpers return indexed geometry WITHOUT uvs, so any mix of them merges.
 */

export const stripUv = <T extends BufferGeometry>(g: T): T => {
  g.deleteAttribute('uv')
  return g
}

export const sph = (r: number, ws = 14, hs = 10): BufferGeometry =>
  stripUv(new SphereGeometry(r, ws, hs))

/** Ellipsoid — a sphere with per-axis radii. Normals are recomputed after the
 *  non-uniform scale so the shading stays correct. */
export const ell = (rx: number, ry: number, rz: number, ws = 14, hs = 10): BufferGeometry => {
  const g = new SphereGeometry(1, ws, hs)
  g.scale(rx, ry, rz)
  g.computeVertexNormals()
  return stripUv(g)
}

/** Partial sphere (dome). `thetaLen` is the polar angle covered from the top. */
export const dome = (r: number, thetaLen = Math.PI / 2, ws = 16, hs = 8): BufferGeometry =>
  stripUv(new SphereGeometry(r, ws, hs, 0, Math.PI * 2, 0, thetaLen))

/** Capsule along Y; `len` is the straight middle section. */
export const cap = (r: number, len: number, rs = 12, cs = 4): BufferGeometry =>
  stripUv(new CapsuleGeometry(r, Math.max(0.0001, len), cs, rs))

export const torus = (R: number, r: number, rs = 8, ts = 20, arc = Math.PI * 2): BufferGeometry =>
  stripUv(new TorusGeometry(R, r, rs, ts, arc))

/** Open cylinder (no caps) — only for parts whose ends are hidden. */
export const tube = (rt: number, rb: number, h: number, rs = 14): BufferGeometry =>
  stripUv(new CylinderGeometry(rt, rb, h, rs, 1, true))

/** Lathe from a profile of `[radius, y]` points, bottom to top. */
export const lathe = (pts: Array<[number, number]>, segs = 16): BufferGeometry => {
  const g = new LatheGeometry(pts.map(([r, y]) => new Vector2(Math.max(0, r), y)), segs)
  return stripUv(g)
}

/** Arc points from angle a0 to a1 around (cx, cy), radius r, for lathe profiles. */
const arc = (cx: number, cy: number, r: number, a0: number, a1: number, n: number): Array<[number, number]> => {
  const out: Array<[number, number]> = []
  for (let i = 0; i <= n; i++) {
    const a = a0 + (a1 - a0) * (i / n)
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r])
  }
  return out
}

/**
 * Rounded cylinder along Y: straight side with a quarter-round bevel into each
 * flat cap. The workhorse of the "machine but friendly" look — cannons, cans,
 * pads, joints. `bevel` ≤ min(r, h/2).
 */
export const rcyl = (r: number, h: number, bevel = 0.3 * r, segs = 16, bevelSteps = 3): BufferGeometry => {
  const b = Math.min(bevel, r * 0.99, h / 2 * 0.99)
  const y0 = -h / 2
  const y1 = h / 2
  const pts: Array<[number, number]> = [[0, y0]]
  pts.push(...arc(r - b, y0 + b, b, -Math.PI / 2, 0, bevelSteps))
  pts.push(...arc(r - b, y1 - b, b, 0, Math.PI / 2, bevelSteps))
  pts.push([0, y1])
  return lathe(pts, segs)
}

/** Rounded cone/frustum (flared cuffs, nozzles, helmets' lower rims). */
export const rcone = (rb: number, rt: number, h: number, bevel = 0.04, segs = 16): BufferGeometry => {
  const b = Math.min(bevel, rb * 0.5, rt * 0.5 + 0.001, h / 2 * 0.9)
  const pts: Array<[number, number]> = [[0, -h / 2]]
  pts.push(...arc(rb - b, -h / 2 + b, b, -Math.PI / 2, 0, 2))
  pts.push(...arc(Math.max(b, rt - b), h / 2 - b, b, 0, Math.PI / 2, 2))
  pts.push([0, h / 2])
  return lathe(pts, segs)
}

/**
 * Rounded box — a superellipsoid-ish lathe won't do for boxes, so this builds
 * a box from a sphere by pushing vertices toward the box surface. The result
 * has continuous normals (no hull cracks) and reads as "pillowy machine block".
 */
export const rbox = (w: number, h: number, d: number, round = 0.35, ws = 16, hs = 12): BufferGeometry => {
  const g = new SphereGeometry(1, ws, hs)
  const pos = g.attributes.position!
  const v = new Vector3()
  // Exponent < 1 squares the sphere; `round` = 1 keeps it a sphere.
  const e = Math.max(0.12, Math.min(1, round))
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    const sx = Math.sign(v.x) * Math.pow(Math.abs(v.x), e)
    const sy = Math.sign(v.y) * Math.pow(Math.abs(v.y), e)
    const sz = Math.sign(v.z) * Math.pow(Math.abs(v.z), e)
    pos.setXYZ(i, sx * w / 2, sy * h / 2, sz * d / 2)
  }
  g.computeVertexNormals()
  return stripUv(g)
}

/**
 * `rbox` cut along one of its latitude rings into two pieces: rows 0..k (the
 * top cap) and rows k..hs (the rest). A superellipsoid ring is flat, so the
 * cut is a clean plane, and both pieces take their positions AND normals from
 * the whole box — put back together they shade pixel-for-pixel like
 * `rbox(w, h, d, round, ws, hs)`, with no line where they meet (normals
 * recomputed per piece would band the toon ramp along the cut). The crate
 * golem's lid is invisible until it opens. `y` is the cut's height, `halfD`
 * the ring's half-depth (where a back hinge goes).
 */
export const rboxSplit = (
  w: number, h: number, d: number, round = 0.35, k = 4, ws = 16, hs = 12
): { top: BufferGeometry; bottom: BufferGeometry; y: number; halfD: number } => {
  const whole = rbox(w, h, d, round, ws, hs)
  const wp = whole.attributes.position!
  const wn = whole.attributes.normal!
  const row = ws + 1
  // A partial sphere for the index layout; every vertex is then the whole's
  const piece = (first: number, rows: number): BufferGeometry => {
    const g = new SphereGeometry(1, ws, rows, 0, Math.PI * 2, (first * Math.PI) / hs, (rows * Math.PI) / hs)
    const pos = g.attributes.position!
    const nor = g.attributes.normal!
    for (let i = 0; i < pos.count; i++) {
      const src = first * row + i
      pos.setXYZ(i, wp.getX(src), wp.getY(src), wp.getZ(src))
      nor.setXYZ(i, wn.getX(src), wn.getY(src), wn.getZ(src))
    }
    return stripUv(g)
  }
  let halfD = 0
  for (let ix = 0; ix < row; ix++) halfD = Math.max(halfD, Math.abs(wp.getZ(k * row + ix)))
  const out = { top: piece(0, k), bottom: piece(k, hs - k), y: wp.getY(k * row), halfD }
  whole.dispose()
  return out
}

/**
 * A rounded rock: a low sphere with seeded bumps, a little flattened so it
 * lies like a stone. Smooth normals (a boulder, never a gem). Coincident seam
 * and pole vertices get the same bump, so the surface cannot crack open.
 * Same seed, same rock.
 */
export const rock = (r: number, seed = 1, ws = 9, hs = 7): BufferGeometry => {
  const g = new SphereGeometry(1, ws, hs)
  const pos = g.attributes.position!
  let st = (Math.imul(seed | 0, 2654435761) >>> 0) || 1
  const bumps = new Map<string, number>()
  const keys: string[] = []
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    const key = `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`
    keys.push(key)
    let k = bumps.get(key)
    if (k === undefined) {
      st = (Math.imul(st, 1664525) + 1013904223) >>> 0
      k = 0.84 + 0.3 * (st / 4294967296)
      bumps.set(key, k)
    }
    pos.setXYZ(i, x * r * k, y * r * k * 0.8, z * r * k)
  }
  g.computeVertexNormals()
  // Weld the normals of coincident vertices too, or the outline hull (pushed
  // out along them) splits open along the seam
  const nor = g.attributes.normal!
  const sum = new Map<string, Vector3>()
  for (let i = 0; i < pos.count; i++) {
    const v = sum.get(keys[i]!) ?? new Vector3()
    v.x += nor.getX(i)
    v.y += nor.getY(i)
    v.z += nor.getZ(i)
    sum.set(keys[i]!, v)
  }
  for (let i = 0; i < pos.count; i++) {
    const v = sum.get(keys[i]!)!
    const l = v.length() || 1
    nor.setXYZ(i, v.x / l, v.y / l, v.z / l)
  }
  return stripUv(g)
}

// ─── Transform helpers ───────────────────────────────────────────────────────

export type V3 = [number, number, number]

const _m = new Matrix4()
const _q = new Quaternion()
const _e = new Euler()
const _p = new Vector3()
const _s = new Vector3()

export const xform = (g: BufferGeometry, p: V3 = [0, 0, 0], r: V3 = [0, 0, 0], s: V3 | number = 1): BufferGeometry => {
  _e.set(r[0], r[1], r[2])
  _q.setFromEuler(_e)
  _p.set(p[0], p[1], p[2])
  if (typeof s === 'number') _s.set(s, s, s)
  else _s.set(s[0], s[1], s[2])
  _m.compose(_p, _q, _s)
  g.applyMatrix4(_m)
  return g
}

/** Paint a whole geometry one colour (linear-space vertex colours). */
export const paint = (g: BufferGeometry, hex: string | Color): BufferGeometry => {
  const c = typeof hex === 'string' ? new Color(hex) : hex
  const n = g.attributes.position!.count
  const arr = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r
    arr[i * 3 + 1] = c.g
    arr[i * 3 + 2] = c.b
  }
  g.setAttribute('color', new Float32BufferAttribute(arr, 3))
  return g
}

/** Paint by a per-vertex function of the (already transformed) position. */
export const paintBy = (g: BufferGeometry, fn: (x: number, y: number, z: number) => string | Color): BufferGeometry => {
  const pos = g.attributes.position!
  const n = pos.count
  const arr = new Float32Array(n * 3)
  const cache = new Map<string, Color>()
  for (let i = 0; i < n; i++) {
    const r = fn(pos.getX(i), pos.getY(i), pos.getZ(i))
    let c: Color
    if (typeof r === 'string') {
      c = cache.get(r) ?? new Color(r)
      cache.set(r, c)
    } else c = r
    arr[i * 3] = c.r
    arr[i * 3 + 1] = c.g
    arr[i * 3 + 2] = c.b
  }
  g.setAttribute('color', new Float32BufferAttribute(arr, 3))
  return g
}

/** Merge painted geometries (all must share attribute sets). */
export const merge = (geos: BufferGeometry[], groups = false): BufferGeometry => {
  const out = mergeGeometries(geos, groups)
  if (!out) throw new Error('[kit] mergeGeometries failed — attribute mismatch')
  return out
}

// ─── The outline's pull ──────────────────────────────────────────────────────
//
// The inverted hull's visible rim is its BACK faces, which sit on the far side
// of the part. Anything that reaches into the part's back half — a shin into
// its boot cuff, an eye socket set into a round head, a foot into the floor —
// is nearer than that rim and covers it, so the line broke exactly where two
// parts meet (playtest #140). Each hull vertex therefore slides toward the eye
// by most of half the part's LOCAL thickness there (`outlinePull`): far enough
// to win over what pokes in from behind, never so far it covers the part's own
// face or anything in front of the part's middle. Local, because one number
// per part fails a hollow cuff (wide, but a thin wall) and an L-shaped boot.
// The cap at `PULL_CAP·sqrt(half·thickness)` keeps the rim of a big round part
// from thickening inward, where its near and far faces converge.

const PULL_CAP = 1.4
/** Short of the part's middle: a slide of the full half-thickness lands a rim
 *  vertex level with the part's own nearest face, and the two flicker. */
const PULL_DEPTH = 0.7

/**
 * Half the part's thickness at each vertex: straight in, against its normal,
 * to the nearest vertex of the same part on the far side (one within a cone
 * of that line). 0 where nothing lies opposite (an open sheet).
 */
export const halfThickness = (geo: BufferGeometry): Float32Array => {
  const pos = geo.attributes.position!
  const nor = geo.attributes.normal
  const n = pos.count
  const out = new Float32Array(n)
  if (!nor) return out
  // Unique positions only: the seams of a merged part repeat them.
  const keyOf = new Map<string, number>()
  const ux: number[] = []
  const uy: number[] = []
  const uz: number[] = []
  for (let i = 0; i < n; i++) {
    const k = `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`
    if (keyOf.has(k)) continue
    keyOf.set(k, ux.length)
    ux.push(pos.getX(i))
    uy.push(pos.getY(i))
    uz.push(pos.getZ(i))
  }
  const m = ux.length
  for (let i = 0; i < n; i++) {
    const px = pos.getX(i)
    const py = pos.getY(i)
    const pz = pos.getZ(i)
    const nx = nor.getX(i)
    const ny = nor.getY(i)
    const nz = nor.getZ(i)
    let best = Infinity
    for (let j = 0; j < m; j++) {
      const dx = px - ux[j]!
      const dy = py - uy[j]!
      const dz = pz - uz[j]!
      const along = dx * nx + dy * ny + dz * nz
      if (along <= 1e-5 || along >= best) continue
      const side2 = dx * dx + dy * dy + dz * dz - along * along
      // Within a cone of ~35° around the inward line.
      if (side2 <= along * along * 0.5) best = along
    }
    out[i] = Number.isFinite(best) ? best / 2 : 0
  }
  // Copies of one position (a seam) must slide alike, or the hull cracks open
  // along the seam: each takes the thinnest of them.
  const thin = new Float32Array(m).fill(Infinity)
  const at = new Int32Array(n)
  for (let i = 0; i < n; i++) {
    at[i] = keyOf.get(`${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`)!
    thin[at[i]!] = Math.min(thin[at[i]!]!, out[i]!)
  }
  for (let i = 0; i < n; i++) out[i] = thin[at[i]!]!
  return out
}

/** How far a hull vertex slides toward the eye, for a hull `thickness` thick. */
export const pullFor = (half: number, thickness: number): number =>
  Math.max(0, Math.min(PULL_DEPTH * half, PULL_CAP * Math.sqrt(half * thickness)))

/**
 * Measured halves by part SHAPE. Every spawn of an enemy builds the same parts
 * afresh, and the measure is quadratic in a part's vertices (4–12 ms a rig),
 * so a mid-fight spawn would hitch on a phone: the shape (positions + normals,
 * hashed) finds the measure of the last one. Bounded; cleared when full.
 */
const halfCache = new Map<string, Float32Array>()
const HALF_CACHE_MAX = 4096
const shapeKey = (geo: BufferGeometry): string => {
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  const bits = new Uint32Array(1)
  const f = new Float32Array(bits.buffer)
  for (const name of ['position', 'normal']) {
    const a = geo.attributes[name]
    if (!a) continue
    const arr = a.array
    for (let i = 0; i < arr.length; i++) {
      f[0] = arr[i]!
      h1 = Math.imul(h1 ^ bits[0]!, 0x01000193)
      h2 = Math.imul(h2 + bits[0]!, 0x5bd1e995) ^ (h2 >>> 15)
    }
  }
  return `${geo.attributes.position!.count}:${h1 >>> 0}:${h2 >>> 0}`
}

/** Tag every vertex of `geo` with its pull (see above). */
export const tagOutlinePull = (geo: BufferGeometry, thickness: number): BufferGeometry => {
  const key = shapeKey(geo)
  let half = halfCache.get(key)
  if (!half) {
    half = halfThickness(geo)
    if (halfCache.size >= HALF_CACHE_MAX) halfCache.clear()
    halfCache.set(key, half)
  }
  const pull = new Float32Array(half.length)
  for (let i = 0; i < half.length; i++) pull[i] = pullFor(half[i]!, thickness)
  geo.setAttribute('outlinePull', new Float32BufferAttribute(pull, 1))
  return geo
}

// ─── Rig builder: one skinned mesh per character ─────────────────────────────
//
// Parts are authored in their BONE's local space. `build()` bakes every part
// into the rig's bind pose, tags each vertex with its bone (rigid skinning,
// weight 1) and merges the lot into ONE SkinnedMesh with two material groups
// (toon, glow) plus ONE outline SkinnedMesh bound to the same skeleton. A whole
// android is therefore 3 draw calls however many parts it has, and every part
// still animates independently by rotating its bone.

interface PartSpec {
  bone: number
  geo: BufferGeometry
  glow: boolean
  outline: boolean
}

export interface Rig {
  root: Group
  mesh: SkinnedMesh
  outline: SkinnedMesh | null
  bones: Record<string, Bone>
  rest: Record<string, { p: Vector3; q: Quaternion }>
  material: MeshToonMaterial
  glowMaterial: MeshBasicMaterial
  height: number
}

export class RigBuilder {
  private bones: Bone[] = []
  private byName = new Map<string, number>()
  private parts: PartSpec[] = []

  bone(name: string, parent: string | null, p: V3, r: V3 = [0, 0, 0]): this {
    const b = new Bone()
    b.name = name
    b.position.set(p[0], p[1], p[2])
    b.rotation.set(r[0], r[1], r[2])
    if (parent !== null) {
      const pi = this.byName.get(parent)
      if (pi === undefined) throw new Error(`[rig] unknown parent bone ${parent}`)
      this.bones[pi]!.add(b)
    }
    this.byName.set(name, this.bones.length)
    this.bones.push(b)
    return this
  }

  /** Add a part (geometry in bone space) painted one colour. */
  part(bone: string, geo: BufferGeometry, hex: string, opts: { p?: V3; r?: V3; s?: V3 | number; glow?: boolean; outline?: boolean } = {}): this {
    const bi = this.byName.get(bone)
    if (bi === undefined) throw new Error(`[rig] unknown bone ${bone}`)
    xform(geo, opts.p, opts.r, opts.s ?? 1)
    if (!geo.attributes.color) paint(geo, hex)
    this.parts.push({ bone: bi, geo, glow: !!opts.glow, outline: opts.outline !== false })
    return this
  }

  /** Add a pre-painted geometry (use `paintBy` for gradients / stripes). */
  painted(bone: string, geo: BufferGeometry, opts: { p?: V3; r?: V3; s?: V3 | number; glow?: boolean; outline?: boolean } = {}): this {
    return this.part(bone, geo, '#ffffff', opts)
  }

  /** Each part's geometry, in model space once `build` has run (a part is
   *  moved into its bone's place there): the z-fighting tests read them. */
  get partGeometries(): BufferGeometry[] {
    return this.parts.map(p => p.geo)
  }

  /** Mirror helper: calls `fn` for side = -1 (left) and +1 (right). */
  mirror(fn: (side: -1 | 1, tag: 'L' | 'R') => void): this {
    fn(-1, 'L')
    fn(1, 'R')
    return this
  }

  build(opts: { outline?: number; height?: number } = {}): Rig {
    const root = this.bones[0]
    if (!root) throw new Error('[rig] no bones')
    root.updateMatrixWorld(true)

    const toonGeos: BufferGeometry[] = []
    const glowGeos: BufferGeometry[] = []
    const outlineGeos: BufferGeometry[] = []
    const thickness = opts.outline ?? 0.025
    for (const part of this.parts) {
      const g = part.geo
      g.applyMatrix4(this.bones[part.bone]!.matrixWorld)
      // Every part (glow too: one merged geometry needs one attribute set).
      tagOutlinePull(g, thickness)
      const n = g.attributes.position!.count
      const idx = new Uint16Array(n * 4)
      const w = new Float32Array(n * 4)
      for (let i = 0; i < n; i++) {
        idx[i * 4] = part.bone
        w[i * 4] = 1
      }
      g.setAttribute('skinIndex', new Uint16BufferAttribute(idx, 4))
      g.setAttribute('skinWeight', new Float32BufferAttribute(w, 4))
      ;(part.glow ? glowGeos : toonGeos).push(g)
      if (part.outline) outlineGeos.push(g)
    }

    const material = rigToon()
    const glowMaterial = rigGlow()
    let geometry: BufferGeometry
    let mats: Material | Material[]
    if (glowGeos.length > 0 && toonGeos.length > 0) {
      geometry = merge([merge(toonGeos), merge(glowGeos)], true)
      mats = [material, glowMaterial]
    } else if (glowGeos.length > 0) {
      geometry = merge(glowGeos)
      mats = glowMaterial
    } else {
      geometry = merge(toonGeos)
      mats = material
    }

    const skeleton = new Skeleton(this.bones)
    const mesh = new SkinnedMesh(geometry, mats)
    mesh.add(root)
    mesh.bind(skeleton)
    mesh.frustumCulled = false

    let outline: SkinnedMesh | null = null
    if (thickness > 0 && outlineGeos.length > 0) {
      const og = outlineGeos.length === this.parts.length && glowGeos.length === 0
        ? geometry
        : merge(outlineGeos)
      outline = new SkinnedMesh(og, outlineMat(thickness))
      outline.bind(skeleton, mesh.bindMatrix)
      outline.frustumCulled = false
      outline.renderOrder = -1
    }

    const group = new Group()
    group.add(mesh)
    if (outline) group.add(outline)

    const bones: Record<string, Bone> = {}
    const rest: Record<string, { p: Vector3; q: Quaternion }> = {}
    for (const b of this.bones) {
      bones[b.name] = b
      rest[b.name] = { p: b.position.clone(), q: b.quaternion.clone() }
    }
    return { root: group, mesh, outline, bones, rest, material, glowMaterial, height: opts.height ?? 1.5 }
  }
}

// ─── Pose helpers ────────────────────────────────────────────────────────────

const _pq = new Quaternion()
const _pe = new Euler()

/** Set a bone to its rest rotation plus an euler offset (radians). */
export const pose = (rig: Rig, name: string, rx = 0, ry = 0, rz = 0): void => {
  const b = rig.bones[name]
  const r = rig.rest[name]
  if (!b || !r) return
  _pe.set(rx, ry, rz)
  _pq.setFromEuler(_pe)
  b.quaternion.copy(r.q).multiply(_pq)
}

const _pt = new Quaternion()
/**
 * `pose`, weighted: the bone turns from wherever the layers before put it
 * (a gait, an idle) toward the target by `w` 0..1. A layer laid on with
 * `pose(rig, b, k * x)` starts from REST the moment `k` leaves 0, so the
 * joint jumps from the layer below; this one starts from where it is.
 */
export const poseToward = (rig: Rig, name: string, rx: number, ry: number, rz: number, w: number): void => {
  if (w <= 0) return
  const b = rig.bones[name]
  const r = rig.rest[name]
  if (!b || !r) return
  _pe.set(rx, ry, rz)
  _pt.copy(r.q).multiply(_pq.setFromEuler(_pe))
  if (w >= 1) b.quaternion.copy(_pt)
  else b.quaternion.slerp(_pt, w)
}

/** Offset a bone from its rest position (units, bone-parent space). */
export const nudge = (rig: Rig, name: string, dx = 0, dy = 0, dz = 0): void => {
  const b = rig.bones[name]
  const r = rig.rest[name]
  if (!b || !r) return
  b.position.set(r.p.x + dx, r.p.y + dy, r.p.z + dz)
}

export const scaleBone = (rig: Rig, name: string, sx: number, sy = sx, sz = sx): void => {
  const b = rig.bones[name]
  if (b) b.scale.set(sx, sy, sz)
}

/** Static (non-skinned) merged prop mesh + optional outline, as one Group. */
export const staticProp = (toonGeos: BufferGeometry[], glowGeos: BufferGeometry[], material: Material, glowMaterial: Material, outline = 0.02): Group => {
  const g = new Group()
  if (toonGeos.length) {
    if (outline > 0) for (const t of toonGeos) tagOutlinePull(t, outline)
    const geo = merge(toonGeos)
    g.add(new Mesh(geo, material))
    if (outline > 0) {
      const o = new Mesh(geo, outlineMat(outline))
      o.renderOrder = -1
      g.add(o)
    }
  }
  if (glowGeos.length) g.add(new Mesh(merge(glowGeos), glowMaterial))
  return g
}
