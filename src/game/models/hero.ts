import {
  Group, Mesh, MeshBasicMaterial, AdditiveBlending, SphereGeometry, CylinderGeometry, Color, LatheGeometry,
  BufferGeometry, Float32BufferAttribute, Matrix4, Vector2, Vector3, TorusGeometry, Quaternion, CatmullRomCurve3, TubeGeometry, DataTexture, RedFormat, LinearFilter,
  MeshToonMaterial, type Material
} from 'three'
import {
  RigBuilder, sph, cap, torus, xform, paint, merge, stripUv, type Rig, type V3, pose, nudge
} from './kit'
import { PAL } from './palette'
import { toonVC, glowVC, outlineMat } from './toon'
import { buildBarrier, type BarrierFx } from './barrier'
import { HERO_GAIT, gaitAmp, type EnemyMotion, type GaitSpec } from './motion'
import { legL, legR, gaitDir, gaitLegs, poseLegs, stanceDrop } from './gait'

/**
 * Colour slots that gear recolours (see `data/items.ts`). The graphite
 * undersuit, the visor and the piston steel are NOT slots: they stay put under
 * every kit, so any combination still reads as Flux.
 */
export interface HeroColors {
  main: string // outer armour: helmet dome + jaw, ear discs, pearl limbs, boots + knee pads (helmets tint it)
  accent: string // torso armour: chest plate, shoulder caps, pelvis (chest pieces tint it)
  buster: string // arm cannon shell (arm cannons and copied weapons tint it)
  core: string // the body's plasma: chest reactor, muzzle (NOT the head: see HERO_EYE)
}

/**
 * The head's lights, eye-lights and antenna tip: always this amber, whatever
 * the kit. It is his identity (the logo and app icon are drawn around it),
 * so a cannon or copied weapon relights the body (`core`), never the face.
 */
export const HERO_EYE = PAL.heroPlasma
/** The eyes' hot centre: a white-yellow, not white, so the eye reads as one glow. */
const EYE_HOT = '#fffdc4'

export const DEFAULT_HERO_COLORS: HeroColors = {
  main: PAL.heroPearl,
  accent: PAL.heroPearl,
  buster: PAL.heroPearl,
  core: PAL.heroPlasma
}

// ─── Local shape helpers ─────────────────────────────────────────────────────
//
// The kit's primitives plus the shapes Flux needs: welded blobs (no seam or
// pole cracks in the outline hull), a lathe painted ring by ring (crisp colour
// bands that share position AND normal, so the hull stays closed), plates
// laid on the head's skull, and the arm cannon profile.

/** A slot colour darkened in linear space — shadow tones stay in the slot's hue. */
const shade = (hex: string, k: number): string => `#${new Color(hex).multiplyScalar(k).getHexString()}`

/**
 * A unit sphere born welded: `SphereGeometry`'s triangles, but its seam
 * column shared and each pole one vertex, so smooth normals never split
 * (no seam or pole crack in the outline hull), without paying for
 * `mergeVertices` (it was half of a build).
 */
const unitSphere = (ws: number, hs: number): { pos: Float32Array; idx: number[] } => {
  const pos = new Float32Array((ws * (hs - 1) + 2) * 3)
  pos[1] = 1
  let o = 3
  for (let iy = 1; iy < hs; iy++) {
    const th = (iy / hs) * Math.PI
    for (let ix = 0; ix < ws; ix++) {
      const ph = (ix / ws) * Math.PI * 2
      pos[o++] = -Math.cos(ph) * Math.sin(th)
      pos[o++] = Math.cos(th)
      pos[o++] = Math.sin(ph) * Math.sin(th)
    }
  }
  pos[o + 1] = -1
  const bottom = ws * (hs - 1) + 1
  const at = (iy: number, ix: number): number => (iy === 0 ? 0 : iy === hs ? bottom : 1 + (iy - 1) * ws + (ix % ws))
  const idx: number[] = []
  for (let iy = 0; iy < hs; iy++) {
    for (let ix = 0; ix < ws; ix++) {
      const a = at(iy, ix + 1)
      const b = at(iy, ix)
      const c = at(iy + 1, ix)
      const d = at(iy + 1, ix + 1)
      if (iy !== 0) idx.push(a, b, d)
      if (iy !== hs - 1) idx.push(b, c, d)
    }
  }
  return { pos, idx }
}

const _v = new Vector3()
/** A welded unit sphere pushed into shape by `fn`, with smooth normals. */
const blob = (fn: (v: Vector3) => void, ws = 18, hs = 12): BufferGeometry => {
  const { pos, idx } = unitSphere(ws, hs)
  for (let i = 0; i < pos.length; i += 3) {
    fn(_v.set(pos[i]!, pos[i + 1]!, pos[i + 2]!))
    pos[i] = _v.x
    pos[i + 1] = _v.y
    pos[i + 2] = _v.z
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

/** Welded capsule along Y: radius `r`, straight length `len` between its domes; `rz` flattens it front to back. */
const pill = (r: number, len: number, rz = r, ws = 16, hs = 12): BufferGeometry =>
  blob((v) => { v.set(v.x * r, v.y * r + (v.y >= 0 ? 1 : -1) * len / 2, v.z * rz) }, ws, hs)

const _q = new Quaternion()
const _yAxis = new Vector3(0, 1, 0)
/** A welded capsule from `a` to `b` (finger and thumb segments). */
const limb = (r: number, a: Vector3, b: Vector3): BufferGeometry => {
  const d = b.clone().sub(a)
  const g = pill(r, d.length(), r, 8, 6)
  _q.setFromUnitVectors(_yAxis, d.normalize())
  return g.applyMatrix4(new Matrix4().makeRotationFromQuaternion(_q).setPosition(a.clone().add(b).multiplyScalar(0.5)))
}

/** Welded ellipsoid. */
const oval = (rx: number, ry: number, rz: number, ws = 16, hs = 12): BufferGeometry =>
  blob((v) => { v.set(v.x * rx, v.y * ry, v.z * rz) }, ws, hs)

type Ring = [r: number, y: number, hex: string]
/**
 * Lathe (profile bottom → top) painted per profile point. Repeat a point with
 * a new colour for a hard colour edge: the pair shares one averaged normal.
 */
const clathe = (pts: Ring[], segs = 20): BufferGeometry => {
  const g = stripUv(new LatheGeometry(pts.map(([r, y]) => new Vector2(Math.max(0, r), y)), segs))
  const n = pts.length
  const nor = g.attributes.normal!
  const col = new Float32Array(nor.count * 3)
  const c = new Color()
  for (let j = 0; j < n; j++) {
    const pt = pts[j]!
    const next = pts[j + 1]
    c.set(pt[2])
    const dup = next !== undefined && next[0] === pt[0] && next[1] === pt[1]
    for (let i = 0; i <= segs; i++) {
      const k = i * n + j
      col[k * 3] = c.r
      col[k * 3 + 1] = c.g
      col[k * 3 + 2] = c.b
      if (dup) {
        const x = nor.getX(k) + nor.getX(k + 1)
        const y = nor.getY(k) + nor.getY(k + 1)
        const z = nor.getZ(k) + nor.getZ(k + 1)
        const l = Math.hypot(x, y, z) || 1
        nor.setXYZ(k, x / l, y / l, z / l)
        nor.setXYZ(k + 1, x / l, y / l, z / l)
      }
    }
  }
  g.setAttribute('color', new Float32BufferAttribute(col, 3))
  return g
}

const sstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** Hexagonal glow slab facing +Z, corners left and right like `torus(r, t, 6, 6)` (unlit: hard edges are fine). */
const hexGlow = (r: number, depth: number): BufferGeometry =>
  xform(stripUv(new CylinderGeometry(r, r, depth, 6, 1)), [0, 0, 0], [Math.PI / 2, Math.PI / 2, 0])

const _m4 = new Matrix4()
const _bx = new Vector3()
const _by = new Vector3()
const _up = new Vector3(0, 1, 0)
/** Stand `g` (authored facing +Z, up +Y) on a surface at `p` with normal `n`, turned `roll` about it. */
const onSurface = (g: BufferGeometry, p: Vector3, n: Vector3, roll = 0): BufferGeometry => {
  _bx.crossVectors(_up, n).normalize()
  _by.crossVectors(n, _bx)
  if (roll) xform(g, [0, 0, 0], [0, 0, roll])
  g.applyMatrix4(_m4.makeBasis(_bx, _by, n).setPosition(p))
  return g
}

// ─── Flux's head ─────────────────────────────────────────────────────────────
//
// The cover art's head: a big round pearl dome over a dark skull. A raised
// black visor band wraps all the way round at the brow; under it, in front,
// the skull shows through a wide face window, dark glass with two big round amber
// eyes; a pearl jaw shell closes round the cheeks and dips into a pointed
// chin; round ear discs sit on the band at either side. Every plate dives
// under the skull along its borders, so the seams read as soft dark lines.

/** Skull centre above the head (neck) bone. */
/** The head's scale over the body: the cover's true chibi, the head ~40 % of his height. */
const HS = 1.364
const HC = 0.25 * HS + 0.004
const HCV = new Vector3(0, HC, 0)

/** The skull as a function of a unit direction (overwrites `v`): a near-sphere with a soft jaw. */
const shellShape = (v: Vector3): Vector3 => {
  const down = Math.max(0, -v.y)
  const jaw = down * down
  const x = v.x * 0.25 * HS * (1 - 0.02 * jaw)
  const y = v.y * 0.25 * HS
  const z = v.z * 0.25 * HS
  return v.set(x, y + HC, z)
}

/** Point on the skull toward azimuth `az` (from +Z toward +X) and elevation `el`. */
const shellAt = (az: number, el: number, out: Vector3): Vector3 => {
  const ce = Math.cos(el)
  return shellShape(out.set(Math.sin(az) * ce, Math.sin(el), Math.cos(az) * ce))
}

/** Skull point pushed `off` along the radius from the skull centre. */
const lifted = (az: number, el: number, off: number, out: Vector3): Vector3 => {
  shellAt(az, el, out)
  const r = out.distanceTo(HCV)
  return out.sub(HCV).multiplyScalar(1 + off / r).add(HCV)
}

/** Row (or column) positions from `a` to `b`: dense where a border dives, `mid` even steps between. */
const spread = (a: number, b: number, diveA: boolean, diveB: boolean, d: number, mid: number): number[] => {
  const D = Math.min(d, (b - a) / 3.4)
  const edge = [0, 0.3, 0.6, 1, 1.5]
  const lo = diveA ? edge.map(k => a + k * D) : [a]
  const hi = diveB ? edge.map(k => b - k * D).reverse() : [b]
  const i0 = lo[lo.length - 1]!
  const i1 = hi[0]!
  const out = [...lo]
  for (let k = 1; k <= mid; k++) out.push(i0 + ((i1 - i0) * k) / (mid + 1))
  return out.concat(hi)
}

interface Plate {
  /** Azimuth span; a `ring` goes all the way round (az0 = -π, az1 = π). */
  az0: number
  az1: number
  ring?: boolean
  /** Lower and upper edge (elevation) at each azimuth. */
  lo: (az: number) => number
  hi: (az: number) => number
  /** Which elevation edges dive under (a border at a pole stays put). */
  dive?: [lo: boolean, hi: boolean]
  /** `hi` is the crown's pole: the top row is one shared vertex (no pole crack). */
  pole?: boolean
  /** Height over the skull inside the plate (or per point: azimuth, elevation, the edge elevations). */
  lift: number | ((az: number, el: number, lo: number, hi: number) => number)
  /** Columns round, extra rows across. */
  cols: number
  rows: number
  /** Per-point colour (azimuth, elevation, the edge elevations); unpainted plates take the part's colour. */
  tint?: (az: number, el: number, lo: number, hi: number) => Color
  /** How far (radians) the borders take to dive (default `DIVE`); a short dive reads as the cover's ink line. */
  diveLen?: number
  /** Moves each point after it is placed (the jaw's flare); borders and dives move with it. */
  push?: (az: number, el: number, p: Vector3) => void
}
/** How far (radians) a plate border takes to dive from `lift` to under the skull. */
const DIVE = 0.06
const SINK = 0.02
/**
 * A plate laid on the skull. It stands `lift` proud inside and dives
 * `SINK` under the skull along every open border, so its visible edge is a
 * crisp intersection (with the skull) and the border itself stays buried.
 * Rows follow the edge curves, so the edges stay clean on any curve. A ring
 * shares its seam and a `pole` plate its top vertex, so the smooth normals
 * never split and the outline hull never cracks.
 */
const plate = (o: Plate): BufferGeometry => {
  const [dLo, dHi] = o.dive ?? [true, true]
  const DV = o.diveLen ?? DIVE
  const span = o.az1 - o.az0
  const azs = o.ring
    ? Array.from({ length: o.cols }, (_, i) => o.az0 + (span * i) / o.cols)
    : spread(o.az0, o.az1, true, true, DV, o.cols)
  const pos: number[] = []
  const col: number[] = []
  const idx: number[] = []
  const p = new Vector3()
  const put = (az: number, el: number, off: number, a: number, b: number): void => {
    lifted(az, el, off, p)
    o.push?.(az, el, p)
    pos.push(p.x, p.y, p.z)
    if (o.tint) {
      const c = o.tint(az, el, a, b)
      col.push(c.r, c.g, c.b)
    }
  }
  const liftAt = (az: number, el: number, a: number, b: number): number =>
    typeof o.lift === 'number' ? o.lift : o.lift(az, el, a, b)
  let rows = 0
  for (const az of azs) {
    const a = o.lo(az)
    const b = o.hi(az)
    const els = spread(a, b, dLo, dHi, DV, o.rows)
    rows = els.length
    const wAz = o.ring ? 1 : Math.min(sstep(o.az0, o.az0 + DV, az), sstep(o.az1, o.az1 - DV, az))
    const D = Math.min(DV, (b - a) / 3.4)
    for (const el of o.pole ? els.slice(0, -1) : els) {
      let w = wAz
      if (dLo) w = Math.min(w, sstep(a, a + D, el))
      if (dHi) w = Math.min(w, sstep(b, b - D, el))
      put(az, el, -SINK + (liftAt(az, el, a, b) + SINK) * w, a, b)
    }
  }
  // One shared vertex at the pole; the rows under it fan into it
  const per = o.pole ? rows - 1 : rows
  const pole = pos.length / 3
  if (o.pole) put(0, Math.PI / 2, liftAt(0, Math.PI / 2, o.lo(0), Math.PI / 2), o.lo(0), Math.PI / 2)
  const vi = (i: number, j: number): number => (o.pole && j === rows - 1 ? pole : i * per + j)
  const n = azs.length
  for (let i = 0; i < (o.ring ? n : n - 1); i++) {
    const i2 = (i + 1) % n
    for (let j = 0; j < rows - 1; j++) {
      const k = vi(i, j)
      const k2 = vi(i2, j)
      const k1 = vi(i, j + 1)
      const k21 = vi(i2, j + 1)
      idx.push(k, k2, k1)
      if (k1 !== k21) idx.push(k1, k2, k21)
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  if (o.tint) g.setAttribute('color', new Float32BufferAttribute(col, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

// The visor band (all the way round) and the face window under it, in front.
const BAND_LO = -0.19
const BAND_HI = 0.215
/** The face window's half-width (azimuth). */
const FACE_AZ = 1.42
/** The window's lower edge: a pointed chin in the middle, rising to the band at the sides. */
/** |azimuth| folded into 0..π (the split jaw plates run past ±π). */
const fold = (az: number): number => Math.abs(Math.atan2(Math.sin(az), Math.cos(az)))
/** The plate's top edge under the eyes, and its straight-sided peak between them. */
const FACE_LO = -0.75
const FACE_PEAK = 0.15
const faceBot = (az: number): number => {
  const a = fold(az)
  // A modest straight-sided point between the eyes, dipping a touch to the corners under their outer ends, then up the cheeks
  const corner = FACE_LO - 0.05 * sstep(0.3, 0.9, a)
  return corner + FACE_PEAK * Math.max(0, 1 - a / 0.33) + (BAND_LO - corner) * sstep(0.95, FACE_AZ + 0.05, a)
}
/** The jaw shell's upper edge: the window in front, the band behind. */
const jawTop = (az: number): number => {
  const k = sstep(FACE_AZ - 0.05, FACE_AZ + 0.2, fold(az))
  return faceBot(az) + (BAND_LO - faceBot(az)) * k
}
const PLATE_LIFT = 0.014
/**
 * The jaw's flare: the cover's lower face is a cup wider than the sphere,
 * its cheeks dropping almost straight from the band's ends and its chin a
 * broad flat front, tucking back under at the bottom. Points below the
 * screen move straight outward (sideways and forward, never down), so the
 * chin stays at the sphere's bottom.
 */
const JAW_FLARE = 0.06
/** The flare's reach (outward) at `el`: full across the cheeks and the chin's front, tucking back under the bottom. */
const jawFlare = (el: number): number =>
  (JAW_FLARE * sstep(-0.5, -1.2, el) + 0.03 * sstep(-1.15, -1.3, el)) * sstep(-1.5, -1.32, el)
/** The chin's front hangs a hair (2 cm) below the sphere's curve so its lower edge lands on the head's bottom outline. */
const jawDrop = (el: number): number => 0.02 * sstep(-1.1, -1.3, el) * sstep(-1.5, -1.32, el)
const jawPush = (az: number, el: number, p: Vector3): void => {
  const f = jawFlare(el)
  if (f > 0) {
    p.x += Math.sin(az) * f
    p.z += Math.cos(az) * f
    p.y -= jawDrop(el)
  }
}
/** The band stands proud of the plates and bulges a little across its middle. */
const BAND_LIFT = 0.045
const bandLift = (_az: number, el: number, lo: number, hi: number): number =>
  BAND_LIFT * (0.7 + 0.3 * Math.sin(Math.PI * (el - lo) / (hi - lo)))

/** Point + outward normal on the skull, `off` above it (for the eyes and ears). */
const skullFrame = (az: number, el: number, off: number): { p: Vector3; n: Vector3 } => {
  const p = lifted(az, el, off, new Vector3())
  const e = 0.01
  const pa = lifted(az + e, el, off, new Vector3()).sub(p)
  const pe = lifted(az, el + e, off, new Vector3()).sub(p)
  return { p, n: pa.cross(pe).normalize() }
}

/**
 * A friendly lens facing +Z: `rx` wide, `ry` tall, its top a touch flatter
 * than its bottom, bent to the face's curve and painted by `paint(x, y)`
 * in lens units (the edge at hypot = 1).
 */
/** The lens's upper half, over its lower: a touch flatter on top, friendly rather than the cover's angry cut. */
const EYE_TOP = 0.92
const eyeLens = (rx: number, ry: number, radial: (x: number, y: number) => Color, ws = 32, hs = 10): BufferGeometry => {
  const g = blob((v) => {
    const x = v.x * rx
    const y = v.y * ry * (v.y > 0 ? EYE_TOP : 1)
    v.set(x, y, v.z * 0.003 - (x * x + y * y) / (0.5 * HS))
  }, ws, hs)
  const pos = g.attributes.position!
  const col = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i)
    const c = radial(pos.getX(i) / rx, y / (ry * (y > 0 ? EYE_TOP : 1)))
    col[i * 3] = c.r
    col[i * 3 + 1] = c.g
    col[i * 3 + 2] = c.b
  }
  g.setAttribute('color', new Float32BufferAttribute(col, 3))
  return g
}


/**
 * The arm cannon, along +Y: muzzle lip face at y = 0, recessed bore above
 * it, a fat rounded shell with black accents (a dark muzzle lip and a wide
 * band toward the back) and a rounded back end the arm runs into
 * (y ≈ 0.46). Shell = `buster` slot; the dark lip and bands fixed.
 */
const busterProfile = (c: HeroColors): Ring[] => {
  const B = c.buster
  const K = PAL.heroVisor
  const G = PAL.heroSuit
  const D = PAL.heroSuitDeep
  return [
    [0, 0.07, D], [0.06, 0.066, D], [0.07, 0.05, D], [0.074, 0.03, D], [0.076, 0.016, D],
    [0.076, 0.016, K], [0.084, 0.004, K], [0.1, 0, K], [0.116, 0.004, K], [0.124, 0.016, K], [0.126, 0.03, K],
    [0.126, 0.03, B], [0.134, 0.05, B], [0.144, 0.085, B], [0.152, 0.13, B], [0.156, 0.18, B], [0.157, 0.215, B],
    [0.157, 0.215, K], [0.161, 0.222, K], [0.162, 0.25, K], [0.16, 0.276, K], [0.155, 0.282, K],
    [0.155, 0.282, B], [0.15, 0.32, B], [0.138, 0.36, B], [0.118, 0.395, B], [0.092, 0.42, B], [0.066, 0.435, B],
    [0.066, 0.435, G], [0.04, 0.442, G], [0, 0.444, G]
  ]
}

/** The bright ring raised in the muzzle's dark lip (cannon space, see `busterProfile`). */
const muzzleRing = (c: HeroColors): BufferGeometry =>
  xform(paint(torus(0.1, 0.009, 5, 28), c.core), [0, 0.003, 0], [Math.PI / 2, 0, 0])

/** The dark sight window on top of the cannon (cannon space, on its +Z side). */
const busterSlot = (): BufferGeometry =>
  xform(paint(blob((v) => { v.set(v.x * 0.036, v.y * 0.052, v.z * 0.016) }, 12, 8), PAL.heroVisor), [0, 0.165, 0.151])

/** Where the muzzle's lip sits on the cannon arm (elbowR space): shots, flashes and charge leave here.
 *  The cannon rides a little outboard of the arm so it hangs clear of the thigh. */
export const HERO_MUZZLE_X = 0.045
export const HERO_MUZZLE_Y = -0.4

/** Flux's gloss, spliced in before the opaque output (`heroGloss`). */
const GLOSS_GLSL = /* glsl */`
      {
        vec3 gN = normalize(normal);
        vec3 gV = normalize(vViewPosition);
        float ndv = clamp(dot(gN, gV), 0.0, 1.0);
        float nh = clamp(dot(gN, normalize(normalize(vec3(-0.35, 0.65, 0.68)) + gV)), 0.0, 1.0);
        float lum = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
        // A soft, wide highlight over a faint sheen (rough painted armour, matched to the
        // other machines); next to nothing on the dark parts
        float spec = smoothstep(0.93, 0.99, nh) * (0.02 + 0.16 * smoothstep(0.05, 0.6, lum)) + pow(nh, 4.0) * (0.01 + 0.05 * smoothstep(0.05, 0.6, lum));
        float rim = smoothstep(0.6, 0.95, 1.0 - ndv) * (0.05 + 0.1 * smoothstep(0.1, 0.6, lum));
        // Creamy pearl: lift the lit whites, cool the shaded side a touch
        float lit = max(outgoingLight.r, max(outgoingLight.g, outgoingLight.b));
        float pearl = smoothstep(0.35, 0.75, lum);
        outgoingLight *= mix(vec3(1.0), mix(vec3(0.97, 1.0, 1.08), vec3(1.3, 1.27, 1.2), smoothstep(0.3, 0.8, lit)), pearl);
        outgoingLight += vec3(1.0, 0.97, 0.92) * spec + vec3(1.0, 0.86, 0.7) * rim;
      }
      #include <opaque_fragment>`
let h = 0
for (let i = 0; i < GLOSS_GLSL.length; i++) h = (h * 31 + GLOSS_GLSL.charCodeAt(i)) | 0
const GLOSS_KEY = `flux-gloss-${(h >>> 0).toString(36)}`

let glossRamp: DataTexture | null = null
/**
 * Flux's own lit material: the toon material over a softer, filtered ramp,
 * plus a hard-edged specular glint and a warm rim — the painted gloss of the
 * cover. One program for every Flux (`customProgramCacheKey`), no textures
 * beyond the 8-texel ramp, so it costs a mobile GPU a few ALU ops a pixel.
 */
const heroGloss = (): MeshToonMaterial => {
  if (!glossRamp) {
    const d = new Uint8Array([150, 176, 198, 216, 232, 244, 252, 255])
    glossRamp = new DataTexture(d, d.length, 1, RedFormat)
    glossRamp.minFilter = LinearFilter
    glossRamp.magFilter = LinearFilter
    glossRamp.generateMipmaps = false
    glossRamp.needsUpdate = true
  }
  const m = new MeshToonMaterial({ vertexColors: true, gradientMap: glossRamp, emissive: new Color(0, 0, 0) })
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', GLOSS_GLSL)
  }
  // Keyed by the shader text: a constant key let the renderer keep serving the
  // old program after an edit (the intro still showed the old gloss).
  m.customProgramCacheKey = () => GLOSS_KEY
  return m
}

/**
 * A flat-shaded armour panel on the skull: a coarse grid of planar facets
 * between azimuths `az0..az1` and the edge curves `lo..hi`, standing `lift(u, v)`
 * proud (u across, v up, both 0..1), and a bevelled skirt round it that
 * slopes back under the skull — a crisp stepped edge, no seam left open.
 * Face normals throughout (a triangle soup), so every facet reads flat.
 */
interface FacetOpts {
  az0: number; az1: number; nA: number; nE: number
  lo: (az: number) => number; hi: (az: number) => number
  lift: (u: number, v: number) => number
  /** The side edges at height `v` (0 at `lo`, 1 at `hi`) in place of `az0..az1`: a chin that widens toward the jaw. */
  edges?: (v: number) => [az0: number, az1: number]
  /** Moves each point after it is placed (the jaw's flare); the skirt moves with it. */
  push?: (az: number, el: number, p: Vector3) => void
}

/** Where (azimuth, elevation) a panel's grid point (u across, v up) sits. */
const facetAt = (o: FacetOpts, u: number, v: number): { az: number; el: number } => {
  const [a0, a1] = o.edges ? o.edges(v) : [o.az0, o.az1]
  const az = a0 + (a1 - a0) * u
  return { az, el: o.lo(az) + (o.hi(az) - o.lo(az)) * v }
}

/** A panel's point (u across, v up) `off` above the skull, pushed like the panel. */
const facetPoint = (o: FacetOpts, u: number, v: number, off: number): Vector3 => {
  const { az, el } = facetAt(o, u, v)
  const p = lifted(az, el, off, new Vector3())
  o.push?.(az, el, p)
  return p
}

/**
 * Points round a facet panel's rim, just proud of its surface (for its ink
 * line): the whole way round, or with one side (`skip`: the u = 0 or u = 1
 * edge) left out, an open run of the other three — a panel that butts
 * against another shares its neighbour's line rather than drawing a second.
 */
const facetRim = (o: FacetOpts, skip?: 'u0' | 'u1', per = 6): Vector3[] => {
  const pt = (u: number, v: number): Vector3 => facetPoint(o, u, v, o.lift(u, v) + 0.002)
  const bottom = Array.from({ length: per }, (_, k) => pt(k / per, 0))
  const right = Array.from({ length: per }, (_, k) => pt(1, k / per))
  const top = Array.from({ length: per }, (_, k) => pt(1 - k / per, 1))
  const left = Array.from({ length: per }, (_, k) => pt(0, 1 - k / per))
  if (skip === 'u0') return [...bottom, ...right, ...top, pt(0, 1)]
  if (skip === 'u1') return [...top, ...left, ...bottom, pt(1, 0)]
  return [...bottom, ...right, ...top, ...left]
}

const facetPanel = (o: FacetOpts): BufferGeometry => {
  const BEV = 0.045
  const top: Vector3[][] = []
  for (let i = 0; i <= o.nA; i++) {
    const u = i / o.nA
    const col: Vector3[] = []
    for (let j = 0; j <= o.nE; j++) {
      const v = j / o.nE
      col.push(facetPoint(o, u, v, o.lift(u, v)))
    }
    top.push(col)
  }
  // The perimeter, walked round, with each point's outward step in (az, el)
  const ring: Array<{ p: Vector3; az: number; el: number }> = []
  const at = (i: number, j: number, dA: number, dE: number): void => {
    const { az, el } = facetAt(o, i / o.nA, j / o.nE)
    ring.push({ p: top[i]![j]!, az: az + dA * BEV, el: el + dE * BEV })
  }
  for (let i = 0; i < o.nA; i++) at(i, 0, i === 0 ? -1 : 0, -1)
  for (let j = 0; j < o.nE; j++) at(o.nA, j, 1, j === 0 ? -1 : 0)
  for (let i = o.nA; i > 0; i--) at(i, o.nE, i === o.nA ? 1 : 0, 1)
  for (let j = o.nE; j > 0; j--) at(0, j, -1, j === o.nE ? 1 : 0)
  const pos: number[] = []
  const tri = (a: Vector3, b: Vector3, c: Vector3): void => { pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z) }
  for (let i = 0; i < o.nA; i++) {
    for (let j = 0; j < o.nE; j++) {
      const a = top[i]![j]!
      const b2 = top[i + 1]![j]!
      const c2 = top[i + 1]![j + 1]!
      const d = top[i]![j + 1]!
      tri(a, b2, c2)
      tri(a, c2, d)
    }
  }
  const skirt = ring.map(r => {
    const p = lifted(r.az, r.el, -SINK, new Vector3())
    o.push?.(r.az, r.el, p)
    return p
  })
  for (let k = 0; k < ring.length; k++) {
    const k2 = (k + 1) % ring.length
    tri(ring[k]!.p, skirt[k]!, skirt[k2]!)
    tri(ring[k]!.p, skirt[k2]!, ring[k2]!.p)
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.computeVertexNormals()
  // Indexed like every other part (the merge needs it), each corner its own
  g.setIndex(Array.from({ length: pos.length / 3 }, (_, i) => i))
  return g
}

// ─── Flux ────────────────────────────────────────────────────────────────────

/**
 * Flux — the player android, full body (Hero screen, results, beam-in,
 * cutaways), as the cover art draws him: a chibi with a huge round helmet,
 * a compact pearl torso with a hex reactor, a dark segmented waist, pearl
 * limbs on dark ball joints, dark fists, chunky rounded boots, and the right
 * forearm a fat pearl cannon with black bands and a glowing muzzle.
 */
export const buildHero = (c: HeroColors = DEFAULT_HERO_COLORS): Rig => {
  const b = new RigBuilder()
  b.bone('hips', null, [0, 0.51, 0])
    .bone('spine', 'hips', [0, 0.1, 0])
    .bone('chest', 'spine', [0, 0.14, 0])
    .bone('head', 'chest', [0, 0.21, 0])
    .bone('shoulderL', 'chest', [-0.235, 0.07, 0])
    .bone('elbowL', 'shoulderL', [0, -0.17, 0])
    .bone('shoulderR', 'chest', [0.235, 0.07, 0])
    .bone('elbowR', 'shoulderR', [0, -0.17, 0])
    .bone('hipL', 'hips', [-0.125, -0.05, 0])
    .bone('kneeL', 'hipL', [0, -0.16, 0])
    .bone('hipR', 'hips', [0.125, -0.05, 0])
    .bone('kneeR', 'hipR', [0, -0.16, 0])

  const suit = PAL.heroSuit
  const deep = PAL.heroSuitDeep

  // ── Pelvis: pearl briefs under a short dark waist ──
  b.part('hips', blob((v) => { v.set(v.x * 0.186, v.y * (v.y < 0 ? 0.1 : 0.085), v.z * 0.148) }, 20, 12), c.accent, { p: [0, -0.008, -0.004] })
  b.part('spine', oval(0.145, 0.1, 0.116), suit, { p: [0, 0.03, 0] })

  // ── Chest: a graphite barrel under a rounded pearl plate ──
  const chestProfile: Ring[] = ([
    [0, -0.13], [0.12, -0.128], [0.136, -0.1], [0.152, -0.05], [0.172, 0], [0.19, 0.05], [0.195, 0.085],
    [0.186, 0.12], [0.16, 0.15], [0.118, 0.17], [0.07, 0.18], [0, 0.182]
  ] as Array<[number, number]>).map(([r, y]) => [r, y, suit])
  b.painted('chest', clathe(chestProfile, 24), { s: [1, 1, 0.8] })
  b.part('chest', blob((v) => {
    v.set(v.x * 0.228, v.y * (v.y > 0 ? 0.13 : 0.142), v.z * (v.z > 0 ? 0.19 : 0.188))
  }, 20, 14), c.accent, { p: [0, 0.07, 0] })
  b.part('chest', xform(torus(0.072, 0.022, 8, 24), [0, 0, 0], [Math.PI / 2, 0, 0]), suit, { p: [0, 0.182, -0.004], s: [1, 1, 0.9] })
  // The hex reactor: an amber hex in a dark recessed hex socket
  b.part('chest', torus(0.052, 0.015, 6, 6), deep, { p: [0, 0.052, 0.184] })
  b.part('chest', hexGlow(0.04, 0.02), c.core, { p: [0, 0.052, 0.187], glow: true, outline: false })

  // ── Head ──
  b.part('head', cap(0.058, 0.05), suit, { p: [0, 0.02, -0.01] })
  // Dark skull: the face glass, and the seams between the plates
  // The band's paint, sampled off the cover: near-black edges, a slate body,
  // a pale streak of reflection and a light rim along its top
  const bandDark = new Color('#08060e')
  const bandBase = new Color('#1c1a26')
  const bandStreak = new Color('#766b72')
  const bandRim = new Color('#46434f')
  // The skull: navy where it shows as seams, the cover's warm near-black
  // across the face window (the glass behind the eyes)
  const skullSeam = new Color(PAL.heroVisor)
  const skullGlass = new Color('#201311')
  const skullCol: number[] = []
  const skull = blob((v) => {
    const az = Math.atan2(v.x, v.z)
    const el = Math.asin(Math.max(-1, Math.min(1, v.y)))
    const g = fold(az) < FACE_AZ + 0.1 && el < BAND_LO + 0.02 && el > -1.1 ? skullGlass : skullSeam
    skullCol.push(g.r, g.g, g.b)
    shellShape(v)
  }, 24, 16)
  skull.setAttribute('color', new Float32BufferAttribute(skullCol, 3))
  b.painted('head', skull, { outline: true })
  // Pearl dome: from the band up over the crown; its lower edge dives short
  // and steep, so dome meets band at one dark ink line like the cover's
  b.part('head', plate({
    az0: -Math.PI, az1: Math.PI, ring: true, lo: () => BAND_HI, hi: () => Math.PI / 2, dive: [true, false], pole: true,
    lift: PLATE_LIFT, cols: 48, rows: 9, diveLen: 0.025
  }), c.main)
  // …with its seams: two thin dark beads running front to back over the crown,
  // mirrored about the middle, splitting the dome into a wide centre strip
  // (about 45 % of its width seen from the front) and two equal sides; their
  // ends at the band. The cover's seams only LOOK offset, from its roll and perspective.
  for (const k of [-0.45, 0.45]) {
    const sx = k * 0.25 * HS
    // The bead rides 1.5 mm under the dome's surface (a hair of it shows): its ring radius in the plane x = sx
    const rho = 0.25 * HS + PLATE_LIFT - 0.0015
    const R = Math.sqrt(rho * rho - sx * sx)
    const a0 = Math.asin(Math.min(1, Math.sin(BAND_HI) * 0.25 * HS / R)) + 0.02
    const seam = stripUv(new TorusGeometry(R, 0.0048, 3, 36, Math.PI - 2 * a0))
    b.part('head', xform(xform(seam, [0, 0, 0], [0, 0, a0]), [sx, HC, 0], [0, -Math.PI / 2, 0]), deep, { outline: false })
  }
  // Pearl faceplate, the cover's faceted armour: a smooth pearl shell over the
  // whole bottom of the sphere, cheek to cheek (dark only in the strip under
  // the screen's edge, so that edge reads as ink), and over it flat-shaded
  // panels with bevelled, stepped edges — a wide, short chin plate inset a
  // little under the screen's edge, its sides parallel down to the jaw's own
  // outline, its lower corners chamfered into a rounded bottom with a modest
  // point and a gentle centre crease, and a broad cheek plate either side,
  // flush with it, sweeping up beside the screen to the band.
  const seamDark = new Color(deep)
  const shellMain = new Color(c.main)
  b.painted('head', plate({
    az0: -Math.PI, az1: Math.PI, ring: true, lo: () => -1.52, hi: jawTop,
    lift: 0.006, cols: 48, rows: 6, push: jawPush,
    tint: (az, el) => (fold(az) < 1.58 && el > faceBot(az) - 0.025 ? seamDark : shellMain)
  }))
  // Bold dark linework along the panel edges, like the cover's ink: a tube
  // standing just proud of each panel's rim (finer round the chin plate and down its crease)
  const INK = '#141a33'
  const inkLine = (pts: Vector3[], closed: boolean, r = 0.006): void => {
    b.part('head', stripUv(new TubeGeometry(new CatmullRomCurve3(pts, closed), closed ? 32 : 24, r, 3, closed)), INK, { outline: false })
  }
  // The chin plate's half-width: narrower at the top (under the eyes' inner
  // halves) and wider in azimuth toward the bottom, so its sides run parallel
  // on the sphere's narrowing lower front; its lower corners at the jaw line
  const CHIN_TOP = 0.41
  const CHIN_BOT = 0.58
  const JAW_EL = -1.1
  const chinHalf = (v: number): number => CHIN_BOT - (CHIN_BOT - CHIN_TOP) * v
  const chin: FacetOpts = {
    az0: -CHIN_BOT, az1: CHIN_BOT, nA: 4, nE: 2,
    lo: (az) => JAW_EL - 0.2 * Math.max(0, 1 - (az / CHIN_BOT) ** 2), hi: (az) => faceBot(az) - 0.02,
    edges: (v) => [-chinHalf(v), chinHalf(v)],
    lift: (u, v) => 0.024 + 0.006 * Math.max(0, 1 - Math.abs(2 * u - 1) * 2) * (0.4 + 0.6 * v),
    push: jawPush
  }
  b.part('head', facetPanel(chin), c.main, { outline: false })
  inkLine(facetRim(chin), true, 0.0055)
  inkLine([0.1, 0.4, 0.7, 1].map(v => facetPoint(chin, 0.5, v, chin.lift(0.5, v) + 0.002)), false, 0.0035)
  b.mirror((s) => {
    const a1 = 1.5
    // The cheek's inner edge runs just outside the chin plate's side; no ink of its own there
    const inner = (v: number): number => 0.04 + chinHalf(v)
    const cheek: FacetOpts = {
      az0: s < 0 ? -a1 : CHIN_BOT, az1: s < 0 ? -CHIN_BOT : a1, nA: 3, nE: 2,
      edges: (v) => (s < 0 ? [-a1, -inner(v)] : [inner(v), a1]),
      lo: (az) => JAW_EL + 0.25 * sstep(CHIN_BOT, a1, Math.abs(az)), hi: (az) => faceBot(az) - 0.02,
      lift: (u, v) => 0.018 + 0.006 * v,
      push: jawPush
    }
    b.part('head', facetPanel(cheek), c.main, { outline: false })
    inkLine(facetRim(cheek, s < 0 ? 'u1' : 'u0'), false)
  })
  // The raised black visor band, bulging a little: near-black, ink along both
  // edges, a faint lip along the top, and the cover's soft pale reflection
  // high on his left (the model is mirrored, so that is azimuth < 0 here)
  b.part('head', plate({
    az0: -Math.PI, az1: Math.PI, ring: true, lo: () => BAND_LO, hi: () => BAND_HI,
    lift: bandLift, cols: 48, rows: 5, diveLen: 0.03,
    tint: (az, el, lo, hi) => {
      const t = (el - lo) / (hi - lo)
      const streak = sstep(0.0, -0.45, az) * sstep(-1.4, -0.95, az) * sstep(0.3, 0.6, t) * sstep(0.99, 0.9, t)
      return bandDark.clone().lerp(bandBase, sstep(0.0, 0.1, t)).lerp(bandStreak, streak)
        .lerp(bandRim, sstep(0.84, 0.9, t)).lerp(bandDark, sstep(0.965, 0.985, t))
    }
  }), PAL.heroVisor)
  // The cover's eyes, opened up friendly: a big round lens filling the screen
  // from the band down to the plate, its paint sampled off the cover — a
  // cream-hot core a touch up and in, a quick turn to yellow, then a slow
  // run to orange at its crisp edge — over a separate glow bleeding deep
  // orange-red onto the glass around it. Constant under every kit (HERO_EYE).
  const stops: Array<[number, Color]> = [
    [0, new Color(EYE_HOT)], [0.33, new Color(EYE_HOT)], [0.39, new Color('#fff56f')], [0.46, new Color('#fee11e')],
    [0.55, new Color('#fdd715')], [0.65, new Color('#ffcd16')], [0.75, new Color('#fec513')], [0.84, new Color('#ffb80e')],
    [0.93, new Color(HERO_EYE)], [1, new Color(HERO_EYE)]
  ]
  const lens = (t: number): Color => {
    let i = 1
    while (i < stops.length - 1 && t > stops[i]![0]) i++
    const [t0, c0] = stops[i - 1]!
    const [t1, c1] = stops[i]!
    return c0.clone().lerp(c1, Math.min(1, Math.max(0, (t - t0) / (t1 - t0))))
  }
  const glowStops: Array<[number, Color]> = [
    [0, new Color('#b04205')], [0.64, new Color('#b04205')], [0.72, new Color('#9a3509')], [0.8, new Color('#6e260d')],
    [0.88, new Color('#4a1c11')], [1, skullGlass]
  ]
  const glow = (t: number): Color => {
    let i = 1
    while (i < glowStops.length - 1 && t > glowStops[i]![0]) i++
    const [t0, c0] = glowStops[i - 1]!
    const [t1, c1] = glowStops[i]!
    return c0.clone().lerp(c1, Math.min(1, Math.max(0, (t - t0) / (t1 - t0))))
  }
  const EX = 0.053 * HS
  const EY = 0.056 * HS
  b.mirror((s) => {
    const { p, n } = skullFrame(s * 0.44, -0.43, 0.002)
    const at = (d: number): Vector3 => p.clone().addScaledVector(n, d)
    // The hot core sits a touch up and toward the nose
    const cx = -s * 0.1
    const cy = 0.08
    b.painted('head', onSurface(eyeLens(EX * 1.56, EY * 1.5, (x, y) => glow(Math.min(1, Math.hypot(x, y))), 20, 7), at(0), n), { glow: true, outline: false })
    b.painted('head', onSurface(eyeLens(EX, EY, (x, y) => lens(Math.min(1, Math.hypot(x - cx * (1 - Math.hypot(x, y) ** 4), y - cy * (1 - Math.hypot(x, y) ** 4)))), 32, 13), at(0.005), n), { glow: true, outline: false })
  })
  // Ear pods at the sides, just behind the band: a rounded pearl puck, a dark groove, a domed cap
  const ear: Ring[] = [
    [0.064, -0.03, c.main], [0.076, -0.01, c.main], [0.08, 0.012, c.main], [0.078, 0.032, c.main], [0.07, 0.048, c.main],
    [0.06, 0.056, c.main], [0.06, 0.056, deep], [0.052, 0.055, deep], [0.045, 0.056, deep],
    [0.045, 0.056, c.main], [0.038, 0.066, c.main], [0.022, 0.075, c.main], [0, 0.078, c.main]
  ]
  b.mirror((s) => {
    const p = shellAt(s * (Math.PI / 2 + 0.3), 0.06, new Vector3())
    b.painted('head', xform(xform(clathe(ear, 16), [0, 0, 0], [0, 0, -s * Math.PI / 2], [1.1 * HS, 1.3 * HS, 0.9 * HS]), [0, 0, 0], [0, -s * 0.3, 0]), { p: [p.x, p.y, p.z] })
  })

  // ── Arms: round pearl caps, dark ball joints, pearl limbs, dark fists ──
  b.mirror((s, t) => {
    b.part(`shoulder${t}`, oval(0.07, 0.07, 0.07, 16, 12), deep)
    // A big dome cap over the ball joint, flaring down over the top of the upper arm
    b.part(`shoulder${t}`, blob((v) => {
      const k = v.y < 0 ? 1 + 0.12 * v.y * v.y : 1
      v.set(v.x * 0.124 * k, v.y * (v.y > 0 ? 0.104 : 0.075), v.z * 0.118 * k)
    }, 18, 12), c.accent, { p: [s * 0.026, 0.0, 0] })
    // …with its panel line, a thin dark bead round the dome
    b.part(`shoulder${t}`, xform(torus(0.1, 0.0045, 4, 30), [0, 0, 0], [Math.PI / 2, 0, 0]), deep, { p: [s * 0.026, 0.06, 0], s: [1.02, 1, 0.97], outline: false })
    b.part(`elbow${t}`, sph(0.05, 12, 8), deep)
  })
  // Left: pearl upper arm, a pearl forearm flaring to the wrist, a dark fist
  b.part('shoulderL', pill(0.068, 0.04), c.main, { p: [0, -0.088, 0] })
  b.part('elbowL', pill(0.074, 0.03), c.main, { p: [0, -0.075, 0] })
  // A chunky gunmetal robot hand in a loose fist: a rounded palm block, four
  // two-segment fingers curling in toward the body (+X), a thumb across the front
  const sq = (x: number): number => Math.sign(x) * Math.abs(x) ** 0.55
  b.part('elbowL', blob((v) => {
    v.set(sq(v.x) * 0.034, sq(v.y) * 0.04, sq(v.z) * 0.05)
  }, 14, 10), suit, { p: [0, -0.2, 0.004] })
  const FINGER_R = 0.0145
  for (let i = 0; i < 4; i++) {
    const z = -0.036 + i * 0.024
    const l1 = i === 0 || i === 3 ? 0.034 : 0.04
    const root = new Vector3(-0.008, -0.236, z)
    const mid = root.clone().add(new Vector3(Math.sin(0.55), -Math.cos(0.55), 0).multiplyScalar(l1))
    const tip = mid.clone().add(new Vector3(Math.sin(2.0), -Math.cos(2.0), 0).multiplyScalar(0.034))
    b.part('elbowL', limb(FINGER_R, root, mid), suit)
    b.part('elbowL', limb(FINGER_R * 0.95, mid, tip), suit)
  }
  {
    const root = new Vector3(0.02, -0.2, 0.05)
    const mid = new Vector3(0.036, -0.232, 0.06)
    const tip = new Vector3(0.05, -0.248, 0.036)
    b.part('elbowL', limb(0.015, root, mid), suit)
    b.part('elbowL', limb(0.014, mid, tip), suit)
  }
  // Right: a dark upper arm into the cannon
  b.part('shoulderR', pill(0.062, 0.04), suit, { p: [0, -0.088, 0] })
  const MZ: V3 = [HERO_MUZZLE_X, HERO_MUZZLE_Y, 0]
  b.painted('elbowR', clathe(busterProfile(c), 28), { p: MZ })
  b.painted('elbowR', busterSlot(), { p: MZ })
  b.part('elbowR', muzzleRing(c), c.core, { p: MZ, glow: true, outline: false })
  b.part('elbowR', sph(0.066, 14, 10), c.core, { p: [MZ[0], MZ[1] + 0.05, 0], glow: true, outline: false })

  // ── Legs: pearl thighs on dark joints into chunky rounded boots ──
  const shaft: Ring[] = ([
    [0, -0.2], [0.086, -0.198], [0.096, -0.18], [0.1, -0.15], [0.105, -0.1], [0.108, -0.05], [0.106, -0.02],
    [0.094, 0.002], [0.07, 0.01], [0, 0.012]
  ] as Array<[number, number]>).map(([r, y]) => [r, y, c.main])
  b.mirror((s, t) => {
    b.part(`hip${t}`, sph(0.056, 12, 8), deep)
    b.part(`hip${t}`, pill(0.088, 0.03), c.main, { p: [0, -0.072, 0] })
    b.part(`knee${t}`, sph(0.056, 12, 8), deep)
    b.painted(`knee${t}`, clathe(shaft, 20), { p: [0, -0.02, 0] })
    // Knee pad: a rounded pearl plate over the joint
    b.part(`knee${t}`, blob((v) => {
      v.set(v.x * 0.074, v.y * 0.08, v.z * 0.042)
    }, 14, 10), c.main, { p: [0, -0.008, 0.078], r: [-0.15, 0, 0] })
    // Dark ankle band, then the chunky rounded boot and its dark sole
    b.part(`knee${t}`, xform(torus(0.1, 0.022, 8, 24), [0, 0, 0], [Math.PI / 2, 0, 0]), deep, { p: [0, -0.16, 0] })
    b.part(`knee${t}`, blob((v) => {
      const toe = Math.max(0, v.z)
      v.set(v.x * 0.13 * (1 + 0.12 * toe), Math.max(-0.066, v.y * (v.y < 0 ? 0.076 : 0.12)), v.z * (v.z > 0 ? 0.232 : 0.142))
    }, 20, 14), c.main, { p: [s * 0.002, -0.218, 0.05] })
    b.part(`knee${t}`, blob((v) => {
      v.set(v.x * 0.134 * (1 + 0.1 * Math.max(0, v.z)), v.y * 0.026, v.z * (v.z > 0 ? 0.238 : 0.146))
    }, 22, 8), deep, { p: [s * 0.002, -0.274, 0.05] })
  })

  const rig = b.build({ outline: 0.014, height: 1.62 })
  // The glossy pearl: Flux's own lit material in place of the plain toon one
  const gloss = heroGloss()
  rig.material.dispose()
  rig.material = gloss
  ;(rig.mesh.material as Material[])[0] = gloss
  // The rig is authored with its "R" bones at +X, which on a body facing +Z
  // is his LEFT. Mirror the whole model once, here, inside its root: every
  // bone keeps its name and its pose code, and the cannon hangs on his right
  // arm everywhere the body is drawn (#113). three.js flips the face culling
  // for the mirrored transform itself.
  const mirror = new Group()
  mirror.scale.x = -1
  for (const child of [...rig.root.children]) mirror.add(child)
  rig.root.add(mirror)
  return rig
}

/** Idle breathing + gentle sway. `t` in seconds. */
export const animateHeroIdle = (rig: Rig, t: number): void => {
  const br = Math.sin(t * 2.2)
  nudge(rig, 'hips', 0, br * 0.006, 0)
  pose(rig, 'chest', br * 0.025, Math.sin(t * 0.7) * 0.05, 0)
  pose(rig, 'head', -br * 0.02, Math.sin(t * 0.7 + 0.5) * 0.12, Math.sin(t * 0.9) * 0.03)
  pose(rig, 'shoulderL', 0, 0, -0.18 - br * 0.03)
  pose(rig, 'shoulderR', -0.1, 0, 0.3 + br * 0.03)
  pose(rig, 'elbowL', -0.25, 0, 0)
  pose(rig, 'elbowR', -0.35, 0, 0)
  pose(rig, 'hipL', 0, 0, -0.04)
  pose(rig, 'hipR', 0, 0, 0.04)
}

/** Victory pose (results): buster raised. */
export const animateHeroVictory = (rig: Rig, t: number): void => {
  const k = Math.min(1, t * 3)
  const bob = Math.sin(t * 5) * 0.01
  nudge(rig, 'hips', 0, bob, 0)
  pose(rig, 'shoulderR', -2.7 * k, 0, 0.25 * k)
  pose(rig, 'elbowR', -0.3 * k, 0, 0)
  pose(rig, 'shoulderL', 0, 0, -0.5 * k)
  pose(rig, 'elbowL', -1.2 * k, 0, 0)
  pose(rig, 'head', -0.15 * k, 0, 0.08 * k)
  pose(rig, 'chest', -0.08 * k, 0, 0)
}

/** The hips' drop for the leg pose `gaitLegs` just sampled: the stance
 *  leg's vault, scaled by `bob` round its mean over a step. */
export const heroHipDrop = (g: GaitSpec, bob = 1): number => {
  const drop = stanceDrop(g)
  if (bob === 1) return drop
  const a = Math.max(1e-3, gaitDir.a)
  const mean = g.L * (1 - Math.sin(a) / a)
  return mean + (drop - mean) * bob
}

/**
 * A walk (the exit cutscene): the planted-foot gait of `models/gait.ts` at
 * `m.phase` (`HERO_GAIT`), the arms swinging against the legs, the chest
 * leaning into the walk. `m.walk` 0..1 is how much of a stride he takes;
 * `g` another gait of his (the intro's sprint). `bob` scales the hips' rise
 * and fall round their mean (1: the planted-foot vault; the hub's quick jog
 * takes a quarter of it, or ten 10 cm hops a second read as hopping).
 */
export const animateHeroWalk = (rig: Rig, m: EnemyMotion, t: number, g: GaitSpec = HERO_GAIT, bob = 1): void => {
  const wk = gaitAmp(m.walk)
  gaitLegs(g, m, wk)
  poseLegs(rig)
  const br = Math.sin(t * 2.2)
  nudge(rig, 'hips', 0, -heroHipDrop(g, bob) + 0.006 * br * (1 - wk), 0)
  // The L arm swings with the R leg, the cannon arm a little less
  const swingL = (legR.th / g.A) * 0.45 * wk
  const swingR = (legL.th / g.A) * 0.3 * wk
  const twist = ((legL.th - legR.th) * 0.05 / g.A) * wk
  pose(rig, 'spine', 0, 0, 0)
  pose(rig, 'chest', 0.04 + 0.06 * wk + 0.015 * br, -twist, 0)
  pose(rig, 'head', -0.04, twist * 0.5, 0)
  pose(rig, 'shoulderL', -swingL, 0, -0.16)
  pose(rig, 'shoulderR', -0.12 - swingR, 0, 0.3)
  pose(rig, 'elbowL', -0.3 - 0.2 * Math.max(0, swingL), 0, 0)
  pose(rig, 'elbowR', -0.4, 0, 0)
}

/**
 * A hop (onto the exit drone's deck): `crouch` 0..1 is the wind-up before
 * the take-off or the squash of a landing (hips down, knees bent, feet
 * staying under them), `tuck` 0..1 the legs drawn up in the air, the arms
 * thrown back for the push and forward over the jump.
 */
export const animateHeroHop = (rig: Rig, crouch: number, tuck: number, t: number): void => {
  const c = crouch
  const u = tuck
  const br = Math.sin(t * 2.2)
  nudge(rig, 'hips', 0, -0.088 * c + 0.004 * br * (1 - u), 0)
  pose(rig, 'hipL', -0.9 * c - 0.85 * u, 0, -0.05)
  pose(rig, 'hipR', -0.9 * c - 0.6 * u, 0, 0.05)
  pose(rig, 'kneeL', 1.33 * c + 1.3 * u, 0, 0)
  pose(rig, 'kneeR', 1.33 * c + 1.0 * u, 0, 0)
  pose(rig, 'spine', 0.08 * c, 0, 0)
  pose(rig, 'chest', 0.2 * c - 0.08 * u + 0.02 * br, 0, 0)
  pose(rig, 'head', -0.1 * c + 0.06 * u, 0, 0)
  pose(rig, 'shoulderL', 0.5 * c - 1.1 * u, 0, -0.18 - 0.25 * u)
  pose(rig, 'shoulderR', 0.4 * c - 0.9 * u, 0, 0.3 + 0.1 * u)
  pose(rig, 'elbowL', -0.3 - 0.35 * u, 0, 0)
  pose(rig, 'elbowR', -0.4 - 0.2 * u, 0, 0)
}

// ─── First-person viewmodel ──────────────────────────────────────────────────

export interface Viewmodel {
  root: Group
  /** The glowing muzzle core — its colour/scale shows charge level. */
  core: Mesh
  coreMat: MeshBasicMaterial
  /** The core's resting colour (the kit's plasma); charge colours return to it. */
  coreColor: Color
  /** Additive halo around the muzzle while charging. */
  halo: Mesh
  haloMat: MeshBasicMaterial
  /** The block barrier (energy shield) in front of the left side of the view. */
  barrier: BarrierFx
  /** Muzzle position in viewmodel space (for flashes). */
  muzzle: [number, number, number]
  setColors: (c: HeroColors) => void
}

const buildArmGeometry = (c: HeroColors): { toon: BufferGeometry; glow: BufferGeometry } => {
  // Built along -Z (pointing into the screen). Units are viewmodel units.
  // The same cannon as the full-body model, slimmed to sit in the corner of
  // the view; the lip face sits at z = -0.345 so the core (z -0.33) glows in
  // the bore and pokes out of the muzzle.
  const AX = 1.05
  const RAD = 0.8
  const toParts = (g: BufferGeometry) => xform(xform(g, [0, 0, 0], [0, 0, 0], [RAD, AX, RAD]), [0, 0, -0.345], [Math.PI / 2, 0, 0])
  // Dark upper arm disappearing toward the camera
  const upper = (g: BufferGeometry) => xform(g, [0.02, 0.03, 0.26], [Math.PI / 2 - 0.25, 0, 0])
  const toon = merge([
    toParts(clathe(busterProfile(c), 28)),
    toParts(xform(busterSlot(), [0, 0, 0], [0, Math.PI, 0])),
    upper(paint(cap(0.07, 0.2), PAL.heroSuit))
  ])
  const glow = merge([muzzleRing(c)].map(toParts))
  return { toon, glow }
}

export const buildViewmodel = (c: HeroColors = DEFAULT_HERO_COLORS): Viewmodel => {
  const root = new Group()
  let geo = buildArmGeometry(c)
  const arm = new Mesh(geo.toon, toonVC())
  const armOutline = new Mesh(geo.toon, outlineMat(0.008))
  armOutline.renderOrder = -1
  const armGlow = new Mesh(geo.glow, glowVC())
  root.add(arm, armOutline, armGlow)

  const coreColor = new Color(c.core)
  const coreMat = new MeshBasicMaterial({ color: coreColor.clone(), toneMapped: false })
  const core = new Mesh(new SphereGeometry(0.06, 14, 10), coreMat)
  core.position.set(0, 0, -0.33)
  root.add(core)

  const haloMat = new MeshBasicMaterial({
    color: coreColor.clone(), transparent: true, opacity: 0, blending: AdditiveBlending,
    depthWrite: false, toneMapped: false
  })
  const halo = new Mesh(new SphereGeometry(0.16, 16, 12), haloMat)
  halo.position.copy(core.position)
  root.add(halo)

  const barrier = buildBarrier()
  root.add(barrier.root)

  const setColors = (nc: HeroColors) => {
    const next = buildArmGeometry(nc)
    arm.geometry = next.toon
    armOutline.geometry = next.toon
    armGlow.geometry = next.glow
    geo.toon.dispose()
    geo.glow.dispose()
    geo = next
    coreColor.set(nc.core)
    coreMat.color.copy(coreColor)
    haloMat.color.copy(coreColor)
  }

  return { root, core, coreMat, coreColor, halo, haloMat, barrier, muzzle: [0, 0, -0.36], setColors }
}
