import {
  Group, Mesh, MeshBasicMaterial, AdditiveBlending, SphereGeometry, CylinderGeometry, Color, LatheGeometry,
  BufferGeometry, Float32BufferAttribute, Matrix4, Vector2, Vector3
} from 'three'
import {
  RigBuilder, sph, cap, torus, xform, paint, merge, stripUv, type Rig, type V3, pose, nudge
} from './kit'
import { PAL } from './palette'
import { toonVC, glowVC, outlineMat } from './toon'
import { buildBarrier, type BarrierFx } from './barrier'
import { HERO_GAIT, gaitAmp, type EnemyMotion } from './motion'
import { legL, legR, gaitLegs, poseLegs, stanceDrop } from './gait'

/**
 * Colour slots that gear recolours (see `data/items.ts`). The graphite
 * undersuit, the visor and the piston steel are NOT slots: they stay put under
 * every kit, so any combination still reads as Flux.
 */
export interface HeroColors {
  main: string // outer armour: head plates, sensor blade, gloves, boots + knee guards (helmets tint it)
  accent: string // torso armour: chest plate, shoulder caps, belt, back fins (chest pieces tint it)
  buster: string // arm cannon shell (arm cannons and copied weapons tint it)
  core: string // the body's plasma: chest reactor, muzzle, cannon vents, fin edges (NOT the head: see HERO_EYE)
}

/**
 * The head's lights, eye-lights and antenna tip: always this amber, whatever
 * the kit. It is his identity (the logo and app icon are drawn around it),
 * so a cannon or copied weapon relights the body (`core`), never the face.
 */
export const HERO_EYE = PAL.heroPlasma

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
// Armour plates over a graphite skull. The skull is a swept-back egg (wider
// than tall, the crown pulled back into a rounded tail over the nape, a soft
// jaw); on it lie a pearl cranial plate with a chevron brow, a pearl
// faceplate that swells into a chin and curves up into a jaw line, and
// between them a recessed visor band with two plasma eye-lights. Graphite
// shows in the seams: the slot, the jaw hinge, the neck. No face opening, no
// ear pieces, no crest or stripe: the only asymmetry is the sensor blade the
// visor's left end runs on into.

/** Skull centre above the head (neck) bone. */
const HC = 0.2
const HCV = new Vector3(0, HC, 0)

/** The crown's sweep: back and a little up. */
const TAIL = new Vector3(0, 0.36, -0.93).normalize()

/** The skull as a function of a unit direction (overwrites `v`). */
const shellShape = (v: Vector3): Vector3 => {
  const down = Math.max(0, -v.y)
  const jaw = down * down
  // Pull the back of the crown out along TAIL into a rounded point
  const pull = Math.max(0, v.dot(TAIL)) ** 4
  const x = v.x * 0.226 * (1 - 0.26 * jaw) * (1 - 0.3 * pull)
  const y = v.y * (v.y > 0 ? 0.202 : 0.186)
  const z = v.z * (v.z > 0 ? 0.194 : 0.2) * (1 - 0.05 * jaw)
  return v.set(x, y + HC + TAIL.y * 0.1 * pull, z + TAIL.z * 0.1 * pull)
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
  /** Which elevation edges dive under (a border at a pole or the chin stays put). */
  dive?: [lo: boolean, hi: boolean]
  /** `hi` is the crown's pole: the top row is one shared vertex (no pole crack). */
  pole?: boolean
  /** Height over the skull inside the plate (or per point: azimuth, elevation, the edge elevations). */
  lift: number | ((az: number, el: number, lo: number, hi: number) => number)
  /** Columns round, extra rows across. */
  cols: number
  rows: number
  /** Per-point colour (same arguments as `lift`); unpainted plates take the part's colour. */
  tint?: (az: number, el: number, lo: number, hi: number) => Color
}
/** How far (radians) a plate border takes to dive from `lift` to under the skull. */
const DIVE = 0.07
const SINK = 0.02
/**
 * A plate laid on the skull. It stands `lift` proud inside and dives
 * `SINK` under the skull along every open border, so its visible edge is a
 * crisp intersection (with the skull or a lower plate) and the border itself
 * stays buried. Rows follow the edge curves, so the edges stay clean on any
 * curve. A ring shares its seam and a `pole` plate its top vertex, so the
 * smooth normals never split and the outline hull never cracks.
 */
const plate = (o: Plate): BufferGeometry => {
  const [dLo, dHi] = o.dive ?? [true, true]
  const span = o.az1 - o.az0
  const azs = o.ring
    ? Array.from({ length: o.cols }, (_, i) => o.az0 + (span * i) / o.cols)
    : spread(o.az0, o.az1, true, true, DIVE, o.cols)
  const pos: number[] = []
  const col: number[] = []
  const idx: number[] = []
  const p = new Vector3()
  const put = (az: number, el: number, off: number, a: number, b: number): void => {
    lifted(az, el, off, p)
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
    const els = spread(a, b, dLo, dHi, DIVE, o.rows)
    rows = els.length
    const wAz = o.ring ? 1 : Math.min(sstep(o.az0, o.az0 + DIVE, az), sstep(o.az1, o.az1 - DIVE, az))
    const D = Math.min(DIVE, (b - a) / 3.4)
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

// Visor: tall across the face with a shallow chevron on top (a brow without
// eyebrows), sweeping up and narrowing as it wraps round to the temples.
// `visorTop`/`visorBot` are the elevations of its visible edges: the plates
// around it end there, and the band itself runs on under them.
const VISOR_AZ = 2.0
const vabs = (az: number): number => Math.sqrt(az * az + 0.0016) - 0.04
const visorTop = (az: number): number => 0.09 + 0.3 * vabs(az) - 0.26 * (az / VISOR_AZ) ** 2
const visorBot = (az: number): number => -0.38 + 0.08 * vabs(az) + 0.4 * (az / VISOR_AZ) ** 2
const visorMid = (az: number): number => (visorTop(az) + visorBot(az)) / 2
/** The plates stand this far off the skull; the visor sits lower, in a slot. */
const PLATE_LIFT = 0.013
const VISOR_LIFT = 0.005
/** Where the cranial plate's edge meets the nape, straight behind. */
const NAPE = -0.95
/** The faceplate's reach round the cheeks. */
const FACE_AZ = 1.7

/** Point + outward normal on the visor's face (fully lifted), for the eye-lights. */
const visorFrame = (az: number, el: number): { p: Vector3; n: Vector3 } => {
  const p = lifted(az, el, VISOR_LIFT, new Vector3())
  const e = 0.01
  const pa = lifted(az + e, el, VISOR_LIFT, new Vector3()).sub(p)
  const pe = lifted(az, el + e, VISOR_LIFT, new Vector3()).sub(p)
  return { p, n: pa.cross(pe).normalize() }
}

/**
 * The arm cannon, along +Y: muzzle lip face at y = 0, recessed bore above
 * it, a nose that tapers into the muzzle, a recessed groove and a collar at
 * the back (y ≈ 0.35). Shell = `buster` slot; lip, groove and collar the
 * graphite suit, the bore a deeper graphite.
 */
const busterProfile = (c: HeroColors): Ring[] => {
  const B = c.buster
  const G = PAL.heroSuit
  const D = PAL.heroSuitDeep
  return [
    [0, 0.058, D], [0.044, 0.056, D], [0.05, 0.044, D], [0.052, 0.025, D], [0.054, 0.01, D],
    [0.054, 0.01, G], [0.06, 0.002, G], [0.07, 0, G], [0.079, 0.003, G], [0.084, 0.012, G], [0.086, 0.022, G],
    [0.086, 0.022, B],
    [0.088, 0.036, B], [0.092, 0.062, B], [0.096, 0.094, B], [0.099, 0.118, B],
    [0.099, 0.118, G], [0.094, 0.124, G], [0.093, 0.132, G], [0.094, 0.14, G], [0.099, 0.146, G],
    [0.099, 0.146, B], [0.102, 0.2, B], [0.104, 0.25, B], [0.105, 0.29, B],
    [0.105, 0.29, G], [0.112, 0.3, G], [0.115, 0.318, G], [0.111, 0.334, G], [0.097, 0.344, G],
    [0.07, 0.35, G], [0, 0.352, G]
  ]
}

/** The glowing ring set in the muzzle lip (cannon space, see `busterProfile`). */
const muzzleRing = (c: HeroColors): BufferGeometry =>
  xform(paint(torus(0.066, 0.0055, 5, 24), c.core), [0, 0.0015, 0], [Math.PI / 2, 0, 0])

/** Glowing vent slots on the cannon shell, at angle `around` from the local +X side. */
const busterVents = (c: HeroColors, y: number, around: number): BufferGeometry[] =>
  [-0.36, 0, 0.36].map((d) => {
    const a = around + d
    return xform(paint(cap(0.0085, 0.036, 6, 2), c.core), [Math.cos(a) * 0.099, y, Math.sin(a) * 0.099])
  })

/** Exposed actuator on the cannon arm: a graphite cylinder driving a steel rod, along -Y. */
const piston = (len: number): BufferGeometry[] => [
  xform(paint(cap(0.015, len * 0.42, 10, 2), PAL.heroSuitDeep), [0, -len * 0.3, 0]),
  xform(paint(cap(0.007, len * 0.5, 8, 2), PAL.heroSteel), [0, -len * 0.72, 0])
]

// ─── Flux ────────────────────────────────────────────────────────────────────

/**
 * Flux — the player android, full body (Hero screen, results, beam-in,
 * cutaways). Chibi proportions of the sprite era, in pearl armour over a
 * graphite undersuit: the swept-back head with its visor, a chest plate with
 * a hex reactor, round shoulder caps, flared gloves, belt, graphite thighs
 * into big boots with knee guards, and the right forearm IS the buster.
 * Three bionic tells and no more: the reactor, the exposed pistons on the
 * cannon arm and the heat-sink fins on the back.
 */
export const buildHero = (c: HeroColors = DEFAULT_HERO_COLORS): Rig => {
  const b = new RigBuilder()
  b.bone('hips', null, [0, 0.6, 0])
    .bone('spine', 'hips', [0, 0.1, 0])
    .bone('chest', 'spine', [0, 0.14, 0])
    .bone('head', 'chest', [0, 0.21, 0])
    .bone('shoulderL', 'chest', [-0.235, 0.07, 0])
    .bone('elbowL', 'shoulderL', [0, -0.17, 0])
    .bone('shoulderR', 'chest', [0.235, 0.07, 0])
    .bone('elbowR', 'shoulderR', [0, -0.17, 0])
    .bone('hipL', 'hips', [-0.125, -0.05, 0])
    .bone('kneeL', 'hipL', [0, -0.19, 0])
    .bone('hipR', 'hips', [0.125, -0.05, 0])
    .bone('kneeR', 'hipR', [0, -0.19, 0])

  const suit = PAL.heroSuit
  const deep = PAL.heroSuitDeep

  // ── Pelvis: graphite briefs + a pearl belt ──
  b.part('hips', blob((v) => { v.set(v.x * 0.176, v.y * (v.y < 0 ? 0.11 : 0.09), v.z * 0.134) }), suit, { p: [0, 0.0, -0.005] })
  b.part('spine', oval(0.136, 0.095, 0.108), suit, { p: [0, 0.035, 0] })
  b.part('spine', xform(torus(0.139, 0.024, 8, 30), [0, 0, 0], [Math.PI / 2, 0, 0]), c.accent, { p: [0, -0.012, 0], s: [1, 1, 0.82] })

  // ── Chest: a graphite barrel that tapers into the waist, the pearl plate over it ──
  const chestProfile: Ring[] = ([
    [0, -0.13], [0.12, -0.128], [0.136, -0.1], [0.152, -0.05], [0.172, 0], [0.19, 0.05], [0.195, 0.085],
    [0.186, 0.12], [0.16, 0.15], [0.118, 0.17], [0.07, 0.18], [0, 0.182]
  ] as Array<[number, number]>).map(([r, y]) => [r, y, suit])
  b.painted('chest', clathe(chestProfile, 24), { s: [1, 1, 0.8] })
  b.part('chest', blob((v) => {
    v.set(v.x * 0.206, v.y * (v.y > 0 ? 0.118 : 0.13), v.z * (v.z > 0 ? 0.172 : 0.176))
  }, 24, 16), c.accent, { p: [0, 0.078, 0] })
  b.part('chest', xform(torus(0.078, 0.024, 8, 24), [0, 0, 0], [Math.PI / 2, 0, 0]), suit, { p: [0, 0.182, -0.004], s: [1, 1, 0.9] })
  // Bionic 1: the hex reactor
  b.part('chest', torus(0.047, 0.012, 6, 6), suit, { p: [0, 0.076, 0.17] })
  b.part('chest', hexGlow(0.037, 0.016), c.core, { p: [0, 0.076, 0.171], glow: true, outline: false })
  // Bionic 3: heat-sink fins on the back, each with a glowing leading edge
  b.mirror((s) => {
    const fin = blob((v) => {
      const k = (v.y + 1) / 2 // 0 root → 1 tip
      v.set(v.x * 0.011, v.y * 0.1, v.z * 0.042 * (1 - 0.55 * k) - k * 0.045)
    }, 12, 10)
    const r: V3 = [-0.62, 0, -s * 0.85]
    b.part('chest', xform(fin, [0, 0.1, 0]), c.accent, { p: [s * 0.08, 0.1, -0.15], r })
    b.part('chest', xform(cap(0.0075, 0.15, 6, 2), [0, 0.1, 0.004], [-0.33, 0, 0]), c.core, { p: [s * 0.08, 0.1, -0.15], r, glow: true, outline: false })
  })

  // ── Head ──
  b.part('head', cap(0.056, 0.05), suit, { p: [0, 0.02, -0.01] })
  // Graphite skull: shows only in the seams between the plates
  b.part('head', blob((v) => { shellShape(v) }, 24, 16), suit)
  // Cranial plate: all the way round, down to the visor in front and the nape behind
  const craniumLo = (az: number): number => {
    const a = Math.abs(az)
    if (a <= VISOR_AZ) return visorTop(az)
    return visorTop(VISOR_AZ) + (NAPE - visorTop(VISOR_AZ)) * sstep(VISOR_AZ, VISOR_AZ + 0.75, a)
  }
  // …thickening into a brow over the slot, across the front only
  const brow = (az: number, el: number, lo: number): number =>
    PLATE_LIFT + 0.012 * (1 - sstep(0.9, 1.7, Math.abs(az))) * (1 - sstep(lo + 0.02, lo + 0.3, el))
  b.part('head', plate({
    az0: -Math.PI, az1: Math.PI, ring: true, lo: craniumLo, hi: () => Math.PI / 2, dive: [true, false], pole: true,
    lift: brow, cols: 56, rows: 12
  }), c.main)
  // Faceplate = jaw guard: under the visor, swelling into a chin, curving up
  // into a jaw line toward the ears
  const chin = (az: number, el: number): number =>
    PLATE_LIFT + 0.011 * (1 - sstep(0.15, 0.75, Math.abs(az))) * sstep(-0.35, -0.75, el)
  b.part('head', plate({
    az0: -FACE_AZ, az1: FACE_AZ, lo: (az) => -1.35 + 0.95 * sstep(0.8, FACE_AZ, Math.abs(az)), hi: visorBot,
    lift: chin, cols: 24, rows: 7
  }), c.main)
  // Visor band in its slot: dark glass catching the light toward the top. It
  // runs on under the plates, and has no hull (its borders are buried).
  const glass = new Color(PAL.heroVisor)
  const glassHi = new Color(PAL.heroVisorHi)
  b.part('head', plate({
    az0: -VISOR_AZ, az1: VISOR_AZ, lo: (az) => visorBot(az) - 0.1, hi: (az) => visorTop(az) + 0.1,
    lift: VISOR_LIFT, cols: 30, rows: 5,
    tint: (_az, el, lo, hi) => glass.clone().lerp(glassHi, sstep(0.5, 0.88, (el - lo) / (hi - lo)))
  }), PAL.heroVisor, { outline: false })
  // Eye-lights behind the glass: a dim bloom, the amber, a hot glint up top.
  // Constant under every kit (HERO_EYE). Tilted in a touch — determined, not angry.
  b.mirror((s) => {
    const az = s * 0.36
    const { p, n } = visorFrame(az, visorMid(az) + 0.01)
    const at = (d: number): Vector3 => p.clone().addScaledVector(n, d)
    b.part('head', onSurface(oval(0.046, 0.054, 0.0015, 14, 8), at(0), n, s * 0.1), shade(HERO_EYE, 0.36), { glow: true, outline: false })
    b.part('head', onSurface(oval(0.032, 0.041, 0.005, 14, 8), at(0.002), n, s * 0.1), HERO_EYE, { glow: true, outline: false })
    b.part('head', onSurface(xform(oval(0.01, 0.014, 0.003, 10, 6), [s * 0.006, 0.013, 0]), at(0.006), n, s * 0.1), PAL.heroPlasmaHot, { glow: true, outline: false })
  })
  // The one asymmetric detail: on the left, the visor's tapered end runs on
  // into a sensor blade, swept up and back past the crown, amber at its tip
  // (a head light, like the eyes: constant, see HERO_EYE).
  {
    const at = lifted(-VISOR_AZ + 0.06, visorMid(-VISOR_AZ + 0.06), -0.012, new Vector3())
    const L = 0.22
    const SW = 0.06
    const blade = blob((v) => {
      const k = (v.y + 1) / 2 // root → tip
      v.set(v.x * 0.016 * (1 - 0.5 * k), k * L, v.z * 0.036 * (1 - 0.6 * k) - k * k * SW)
    }, 12, 12)
    // The bead rides the blade's own transform, so it stays on the tip. Built
    // on the other side (x and the tilt mirrored): the whole model is mirrored
    // once at the end (#113), which puts the blade back where the logo and
    // the cover art have it.
    const place = (g: BufferGeometry): BufferGeometry => xform(g, [-at.x, at.y, at.z], [-0.6, 0, -0.42])
    b.part('head', place(blade), c.main)
    b.part('head', place(xform(sph(0.017, 8, 6), [0, L + 0.008, -SW - 0.004])), HERO_EYE, { glow: true, outline: false })
  }

  // ── Arms ──
  b.mirror((s, t) => {
    b.part(`shoulder${t}`, oval(0.074, 0.074, 0.074, 16, 12), suit)
    b.part(`shoulder${t}`, blob((v) => { v.set(v.x * 0.096, v.y * (v.y > 0 ? 0.078 : 0.05), v.z * 0.09) }, 18, 12), c.accent, { p: [s * 0.014, 0.014, 0] })
    b.part(`shoulder${t}`, cap(0.05, 0.07), suit, { p: [0, -0.085, 0] })
  })
  // Bionic 2: exposed actuators down the outside of the cannon arm
  for (const [x, z] of [[0.058, -0.004], [0.036, -0.05]] as Array<[number, number]>) {
    for (const g of piston(0.15)) b.painted('shoulderR', g, { p: [x, -0.02, z] })
  }
  // Left: flared glove + a fist that reads as one (knuckles, thumb)
  const gloveProfile: Ring[] = ([
    [0, -0.128], [0.052, -0.126], [0.061, -0.11], [0.064, -0.082], [0.07, -0.052], [0.079, -0.026],
    [0.091, -0.01], [0.1, 0.006], [0.098, 0.021], [0.087, 0.031], [0.066, 0.034], [0, 0.032]
  ] as Array<[number, number]>).map(([r, y]) => [r, y, c.main])
  b.painted('elbowL', clathe(gloveProfile, 20))
  const FC: V3 = [0, -0.19, 0.006]
  const FR: V3 = [0.074, 0.074, 0.07]
  b.part('elbowL', oval(FR[0], FR[1], FR[2], 16, 12), c.main, { p: FC })
  for (let i = 0; i < 4; i++) {
    const x = -0.033 + i * 0.022
    const y = FC[1] - 0.026
    const q = Math.max(0, 1 - (x / FR[0]) ** 2 - ((y - FC[1]) / FR[1]) ** 2)
    b.part('elbowL', sph(0.02, 8, 6), c.main, { p: [x, y, FC[2] + FR[2] * Math.sqrt(q) - 0.01] })
  }
  b.part('elbowL', oval(0.026, 0.036, 0.024, 10, 8), c.main, { p: [0.05, -0.166, 0.05], r: [0.35, -0.5, -0.35] })

  // Right: the buster
  b.painted('elbowR', clathe(busterProfile(c), 22), { p: [0, -0.314, 0] })
  for (const v of busterVents(c, 0.2, 0)) b.part('elbowR', v, c.core, { p: [0, -0.314, 0], glow: true, outline: false })
  b.part('elbowR', muzzleRing(c), c.core, { p: [0, -0.314, 0], glow: true, outline: false })
  b.part('elbowR', sph(0.046, 12, 8), c.core, { p: [0, -0.314 + 0.034, 0], glow: true, outline: false })

  // ── Legs: short graphite thighs into big cuffed boots with knee guards ──
  // Boot shaft narrows to an ankle so the foot and the cuff both read
  const shaft: Ring[] = ([
    [0, -0.27], [0.072, -0.268], [0.08, -0.245], [0.081, -0.205], [0.085, -0.15], [0.092, -0.08], [0.098, -0.03],
    [0.1, 0], [0.09, 0.012], [0, 0.014]
  ] as Array<[number, number]>).map(([r, y]) => [r, y, c.main])
  // Flared, rolled cuff (a closed ring profile) round the top of the shaft
  const cuff: Ring[] = ([
    [0.097, -0.058], [0.106, -0.047], [0.117, -0.026], [0.125, -0.004], [0.128, 0.016], [0.123, 0.033], [0.11, 0.042],
    [0.094, 0.04], [0.084, 0.028], [0.082, 0], [0.088, -0.03], [0.092, -0.058], [0.097, -0.058]
  ] as Array<[number, number]>).map(([r, y]) => [r, y, c.main])
  b.mirror((s, t) => {
    b.part(`hip${t}`, cap(0.064, 0.11), suit, { p: [0, -0.1, 0] })
    b.painted(`knee${t}`, clathe(shaft, 20))
    b.painted(`knee${t}`, clathe(cuff, 22))
    b.part(`knee${t}`, xform(torus(0.1, 0.011, 6, 24), [0, 0, 0], [Math.PI / 2, 0, 0]), suit, { p: [0, -0.066, 0] })
    // Knee guard: a plate rising out of the cuff, narrowing to a rounded point
    b.part(`knee${t}`, blob((v) => {
      const k = (v.y + 1) / 2
      v.set(v.x * 0.064 * (1 - 0.35 * k * k), v.y * 0.062, v.z * 0.017)
    }, 14, 12), c.main, { p: [0, 0.034, 0.121], r: [-0.32, 0, 0] })
    // Foot: long round toe, short heel, flat sole
    b.part(`knee${t}`, blob((v) => {
      const toe = Math.max(0, v.z)
      v.set(v.x * 0.11 * (1 + 0.1 * toe), Math.max(-0.056, v.y * (v.y < 0 ? 0.064 : 0.1)), v.z * (v.z > 0 ? 0.2 : 0.12))
    }, 20, 14), c.main, { p: [s * 0.002, -0.282, 0.045] })
    b.part(`knee${t}`, blob((v) => {
      v.set(v.x * 0.116 * (1 + 0.1 * Math.max(0, v.z)), v.y * 0.024, v.z * (v.z > 0 ? 0.208 : 0.128))
    }, 20, 8), deep, { p: [s * 0.002, -0.336, 0.045] })
  })

  const rig = b.build({ outline: 0.014, height: 1.52 })
  // The rig is authored with its "R" bones at +X, which on a body facing +Z
  // is his LEFT: the 3D Flux carried the buster on his left arm while the
  // first-person view and the cover art have it on the right (#113). Mirror
  // the whole model once, here, inside its root: every bone keeps its name
  // and its pose code, and the buster hangs on his right arm everywhere the
  // body is drawn (the lab, the exit, the intro, the holograms). three.js
  // flips the face culling for the mirrored transform itself.
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
  pose(rig, 'shoulderR', -0.1, 0, 0.2 + br * 0.03)
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

/**
 * A walk (the exit cutscene): the planted-foot gait of `models/gait.ts` at
 * `m.phase` (`HERO_GAIT`), the arms swinging against the legs, the chest
 * leaning into the walk. `m.walk` 0..1 is how much of a stride he takes.
 */
export const animateHeroWalk = (rig: Rig, m: EnemyMotion, t: number): void => {
  const g = HERO_GAIT
  const wk = gaitAmp(m.walk)
  gaitLegs(g, m, wk)
  poseLegs(rig)
  const br = Math.sin(t * 2.2)
  nudge(rig, 'hips', 0, -stanceDrop(g) + 0.006 * br * (1 - wk), 0)
  // The L arm swings with the R leg, the cannon arm a little less
  const swingL = (legR.th / g.A) * 0.45 * wk
  const swingR = (legL.th / g.A) * 0.3 * wk
  const twist = ((legL.th - legR.th) * 0.05 / g.A) * wk
  pose(rig, 'spine', 0, 0, 0)
  pose(rig, 'chest', 0.04 + 0.06 * wk + 0.015 * br, -twist, 0)
  pose(rig, 'head', -0.04, twist * 0.5, 0)
  pose(rig, 'shoulderL', -swingL, 0, -0.16)
  pose(rig, 'shoulderR', -0.12 - swingR, 0, 0.2)
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
  nudge(rig, 'hips', 0, -0.105 * c + 0.004 * br * (1 - u), 0)
  pose(rig, 'hipL', -0.9 * c - 0.85 * u, 0, -0.05)
  pose(rig, 'hipR', -0.9 * c - 0.6 * u, 0, 0.05)
  pose(rig, 'kneeL', 1.33 * c + 1.3 * u, 0, 0)
  pose(rig, 'kneeR', 1.33 * c + 1.0 * u, 0, 0)
  pose(rig, 'spine', 0.08 * c, 0, 0)
  pose(rig, 'chest', 0.2 * c - 0.08 * u + 0.02 * br, 0, 0)
  pose(rig, 'head', -0.1 * c + 0.06 * u, 0, 0)
  pose(rig, 'shoulderL', 0.5 * c - 1.1 * u, 0, -0.18 - 0.25 * u)
  pose(rig, 'shoulderR', 0.4 * c - 0.9 * u, 0, 0.2 + 0.2 * u)
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
  // The same cannon as the full-body model, stretched a little along its
  // axis; the lip face sits at z = -0.345 so the core (z -0.33) glows in
  // the bore and pokes out of the muzzle.
  const AX = 1.32
  const RAD = 1.12
  const toParts = (g: BufferGeometry) => xform(xform(g, [0, 0, 0], [0, 0, 0], [RAD, AX, RAD]), [0, 0, -0.345], [Math.PI / 2, 0, 0])
  // Upper arm disappearing toward the camera, its actuators on the outside
  const upper = (g: BufferGeometry) => xform(g, [0.02, 0.03, 0.26], [Math.PI / 2 - 0.25, 0, 0])
  const toon = merge([
    toParts(clathe(busterProfile(c), 26)),
    upper(paint(cap(0.07, 0.2), PAL.heroSuit)),
    ...piston(0.26).map(g => upper(xform(g, [0.074, 0.13, -0.012]))),
    ...piston(0.26).map(g => upper(xform(g, [0.05, 0.13, -0.06])))
  ])
  // Vent slots on top of the shell, where the player sees them
  const glow = merge([...busterVents(c, 0.21, -Math.PI / 2), muzzleRing(c)].map(toParts))
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
