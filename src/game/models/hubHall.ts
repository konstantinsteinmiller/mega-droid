import {
  BoxGeometry, BufferGeometry, Color, Curve, Float32BufferAttribute, TubeGeometry, Vector3
} from 'three'
import { rcyl, rbox, torus, sph, ell, cap, lathe, xform, paint, paintBy, stripUv, rcone, merge, dome } from './kit'
import {
  AIRLOCK_END, AIRLOCK_HALF, DOOR_H, DOOR_HALF, GATE_DEPTH, GATE_HALF, HALL_END, HALL_H, HALL_HALF, LAB_R,
  NICHE_DEPTH, NICHE_HALF, ROWS, TABLE_R, TABLE_Z, rowZ
} from '../world/hubLayout'

/**
 * ─── The Deployment Hall's set (#173) ────────────────────────────────────────
 *
 * Geometry only, painted and placed, as part lists: the hub mode merges each
 * list into one mesh (one draw for the whole static hall), and the z-fighting
 * test (`tests/game/hubHall.test.ts`) reads the same lists for coplanar faces.
 *
 * The look is the lab's: deep blue panels, gunmetal trim, cyan light strips
 * and the warm yellow of the lab's console lamps — so the hall reads as the
 * lab grown long. Architecture is plain boxes, toon-shaded without an
 * outline; the props on show (stations, pads) are the kit's rounded parts,
 * outlined like everything else Flux touches.
 *
 * Layering rule (the one that keeps it free of z-fighting): every flat face
 * that sits on another stands at least 2 cm proud of it, and two faces of the
 * same plane only ever meet edge to edge.
 */

export interface Parts {
  /** Toon-shaded, no outline (the architecture). */
  plain: BufferGeometry[]
  /** Toon-shaded and outlined (props). */
  toon: BufferGeometry[]
  /** Unlit glow (strips, screens, lamps). */
  glow: BufferGeometry[]
}

export const newParts = (): Parts => ({ plain: [], toon: [], glow: [] })

export const C = {
  floor: '#3a5088',
  floorAlt: '#33477c',
  seam: '#141c38',
  wall: '#3d5898',
  wallLow: '#25376b',
  wallHi: '#6a8ee0',
  trim: '#3a5a9a',
  steel: '#5d6a82',
  steelHi: '#8a97ad',
  gun: '#3b4458',
  dark: '#1d2438',
  ink: '#141a33',
  cyan: '#7ff4ff',
  cyanDeep: '#4fd8ff',
  yellow: '#ffd84a',
  amber: '#ffb04a',
  red: '#ff2d3f'
} as const

/** A box (sharp edges, flat normals): architecture. */
export const box = (w: number, h: number, d: number): BufferGeometry => stripUv(new BoxGeometry(w, h, d))

/** A box spanning [x0, x1] × [y0, y1] × [z0, z1], one colour. */
const span = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, hex: string): BufferGeometry =>
  xform(paint(box(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)), hex), [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2])

/** A wall block: its body shading from the dark skirting up into the panel
 *  blue, and a lighter band along its top (two boxes, meeting edge to edge). */
const wallBlock = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): BufferGeometry => {
  const top = Math.max(y0 + 0.5, y1 - 0.42)
  const body = paintBy(span(x0, x1, y0, top, z0, z1, C.wall), (_x, y) => (y < y0 + 0.5 ? C.wallLow : C.wall))
  const band = span(x0, x1, top, y1, z0, z1, C.wallHi)
  return merge([body, band])
}

// ─── The floor ───────────────────────────────────────────────────────────────

const TILE = 2
const TILE_GAP = 0.05

/** Floor tiles as loose quads (a seam shows between them, over the dark base). */
const tiles = (x0: number, x1: number, z0: number, z1: number, out: BufferGeometry[]): void => {
  const pos: number[] = []
  const col: number[] = []
  const nor: number[] = []
  const a = new Color(C.floor)
  const b = new Color(C.floorAlt)
  for (let x = x0; x < x1 - 1e-6; x += TILE) {
    for (let z = z0; z < z1 - 1e-6; z += TILE) {
      const xa = x + TILE_GAP
      const xb = Math.min(x1, x + TILE) - TILE_GAP
      const za = z + TILE_GAP
      const zb = Math.min(z1, z + TILE) - TILE_GAP
      const c = (Math.round(x / TILE) + Math.round(z / TILE)) % 2 === 0 ? a : b
      pos.push(xa, 0, za, xa, 0, zb, xb, 0, zb, xa, 0, za, xb, 0, zb, xb, 0, za)
      for (let k = 0; k < 6; k++) {
        col.push(c.r, c.g, c.b)
        nor.push(0, 1, 0)
      }
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new Float32BufferAttribute(nor, 3))
  g.setAttribute('color', new Float32BufferAttribute(col, 3))
  // The kit's parts are indexed: give the quads a trivial index so they merge.
  g.setIndex(Array.from({ length: pos.length / 3 }, (_, i) => i))
  out.push(g)
}

// ─── The hall ────────────────────────────────────────────────────────────────

/** An elliptical arch over the hall: half-span `a`, rise `b`, tube `r`. */
class ArchCurve extends Curve<Vector3> {
  constructor(private readonly a: number, private readonly b: number) { super() }
  override getPoint(t: number, target = new Vector3()): Vector3 {
    const th = Math.PI * t
    return target.set(Math.cos(th) * this.a, Math.sin(th) * this.b, 0)
  }
}

const arch = (a: number, b: number, r: number, hex: string): BufferGeometry =>
  paint(stripUv(new TubeGeometry(new ArchCurve(a, b), 28, r, 8, false)), hex)

/** The arch rib's rise over the wall tops. */
export const ARCH_RISE = 2.4

/** The shell: floors, walls with their niches, the airlock, ribs and the gate's niche. */
export const buildHallShell = (): Parts => {
  const p = newParts()
  const W = HALL_HALF
  const D = HALL_HALF + NICHE_DEPTH
  const BACK = 0.5
  const H = HALL_H
  const NH = 4.8
  const zEnd = HALL_END + GATE_DEPTH
  // Floor: a dark base under the whole hall and the airlock (its top 3 cm
  // under the tiles: the seams), and the tiles on the walkway and in the niches.
  p.plain.push(span(-D - BACK + 0.05, D + BACK - 0.05, -0.4, -0.03, LAB_R + 0.7, zEnd + BACK - 0.05, C.seam))
  tiles(-W, W, AIRLOCK_END, HALL_END, p.plain)
  tiles(-AIRLOCK_HALF, AIRLOCK_HALF, LAB_R + 0.7, AIRLOCK_END, p.plain)
  tiles(-GATE_HALF, GATE_HALF, HALL_END, zEnd, p.plain)
  for (let r = 0; r < ROWS; r++) {
    const z = rowZ(r)
    tiles(W, D, z - NICHE_HALF, z + NICHE_HALF, p.plain)
    tiles(-D, -W, z - NICHE_HALF, z + NICHE_HALF, p.plain)
  }
  // The walkway's light: a dashed lane down the middle toward the gate, and
  // a thin line along each wall.
  for (let z = AIRLOCK_END + 1; z < HALL_END - 1; z += 2.2) p.glow.push(span(-0.09, 0.09, 0.01, 0.035, z, z + 1.3, C.cyanDeep))
  for (const s of [-1, 1]) p.glow.push(span(s * (W - 0.62), s * (W - 0.5), 0.01, 0.035, AIRLOCK_END + 0.4, HALL_END - 0.4, C.cyanDeep))

  for (const s of [-1, 1] as const) {
    const xs = (a: number, b: number): [number, number] => (s > 0 ? [a, b] : [-b, -a])
    // The wall: deep blocks between the niches (their ends are the niches'
    // side walls), a lintel over each niche, a back wall in each.
    let z = AIRLOCK_END
    const blockEnds: Array<[number, number]> = []
    for (let r = 0; r <= ROWS; r++) {
      const z1 = r < ROWS ? rowZ(r) - NICHE_HALF : HALL_END
      blockEnds.push([z, z1])
      z = r < ROWS ? rowZ(r) + NICHE_HALF : z
    }
    for (const [z0, z1] of blockEnds) {
      const [x0, x1] = xs(W, D + BACK)
      p.plain.push(wallBlock(x0, x1, -0.1, H, z0, z1))
      // A light strip up the middle of the block's face (broken by a warm
      // lamp on its bracket at head height).
      const mid = (z0 + z1) / 2
      const [g0, g1] = xs(W - 0.06, W)
      if (z1 - z0 > 0.8) {
        p.glow.push(span(g0, g1, 0.9, 2.55, mid - 0.06, mid + 0.06, C.cyan))
        p.glow.push(span(g0, g1, 3.55, H - 1.0, mid - 0.06, mid + 0.06, C.cyan))
        p.toon.push(xform(paint(rbox(0.3, 0.16, 0.42, 0.3), C.gun), [s * (W - 0.14), 2.9, mid]))
        p.glow.push(xform(paint(ell(0.12, 0.2, 0.17, 10, 8), C.yellow), [s * (W - 0.18), 3.15, mid]))
      }
    }
    for (let r = 0; r < ROWS; r++) {
      const zc = rowZ(r)
      const [lx0, lx1] = xs(W, D + BACK)
      p.plain.push(wallBlock(lx0, lx1, NH, H, zc - NICHE_HALF, zc + NICHE_HALF))
      const [bx0, bx1] = xs(D, D + BACK)
      p.plain.push(wallBlock(bx0, bx1, -0.1, NH, zc - NICHE_HALF, zc + NICHE_HALF))
      // The niche's frame: a gunmetal arch band round its mouth, 4 cm proud.
      const [f0, f1] = xs(W - 0.04, W)
      p.plain.push(span(f0, f1, NH - 0.34, NH, zc - NICHE_HALF, zc + NICHE_HALF, C.gun))
      // Its yellow lamp strip under the lintel's front edge.
      const [y0, y1] = xs(W + 0.02, W + 0.3)
      p.glow.push(span(y0, y1, NH - 0.05, NH - 0.02, zc - NICHE_HALF + 0.3, zc + NICHE_HALF - 0.3, C.yellow))
    }
    // The cornice along the wall top.
    const [c0, c1] = xs(W - 0.32, W)
    p.plain.push(span(c0, c1, H - 0.34, H, AIRLOCK_END, HALL_END, C.trim))
    // The hall's front wall either side of the airlock, and the airlock.
    const [fw0, fw1] = xs(AIRLOCK_HALF + 0.5, D + BACK)
    p.plain.push(wallBlock(fw0, fw1, -0.1, H, AIRLOCK_END - 0.4, AIRLOCK_END))
    const [aw0, aw1] = xs(AIRLOCK_HALF, AIRLOCK_HALF + 0.5)
    p.plain.push(wallBlock(aw0, aw1, -0.1, 4.2, LAB_R + 0.05, AIRLOCK_END))
    const [ag0, ag1] = xs(AIRLOCK_HALF - 0.04, AIRLOCK_HALF)
    p.glow.push(...[1.0, 3.4].map(y => span(ag0, ag1, y, y + 0.08, LAB_R + 0.6, AIRLOCK_END - 0.3, C.cyan)))
    // The end wall either side of the gate, and the gate's niche walls.
    const [ew0, ew1] = xs(GATE_HALF, D + BACK)
    p.plain.push(wallBlock(ew0, ew1, -0.1, H, HALL_END, HALL_END + 0.6))
    const [gw0, gw1] = xs(GATE_HALF, GATE_HALF + 0.5)
    p.plain.push(wallBlock(gw0, gw1, -0.1, H, HALL_END + 0.6, zEnd + BACK))
  }
  // Over the airlock: its ceiling, and the hall's front wall above it.
  p.plain.push(span(-AIRLOCK_HALF - 0.5, AIRLOCK_HALF + 0.5, 4.2, 4.6, LAB_R + 0.05, AIRLOCK_END, C.gun))
  p.plain.push(wallBlock(-AIRLOCK_HALF - 0.5, AIRLOCK_HALF + 0.5, 4.6, H, AIRLOCK_END - 0.4, AIRLOCK_END))
  // The hall's entrance frame (4 cm proud of the front wall), its lamp.
  p.plain.push(span(-AIRLOCK_HALF - 0.5, AIRLOCK_HALF + 0.5, 4.2, 4.6, AIRLOCK_END, AIRLOCK_END + 0.04, C.gun))
  p.glow.push(span(-AIRLOCK_HALF, AIRLOCK_HALF, 4.25, 4.31, AIRLOCK_END + 0.04, AIRLOCK_END + 0.1, C.cyan))
  // The lab's crest over the entrance: a ring with Gauss's bolt.
  p.glow.push(xform(paint(torus(0.9, 0.08, 6, 36), C.cyan), [0, 6.4, AIRLOCK_END + 0.18]))
  p.glow.push(xform(paint(rbox(0.32, 1.1, 0.06, 0.3), C.yellow), [0, 6.4, AIRLOCK_END + 0.16], [0, 0, -0.45]))
  // The gate's back wall and the wall over the gate's niche.
  p.plain.push(wallBlock(-GATE_HALF, GATE_HALF, -0.1, H, zEnd, zEnd + BACK))
  p.plain.push(wallBlock(-GATE_HALF, GATE_HALF, 6.6, H, HALL_END, HALL_END + 0.6))
  // The ribs over the hall (one between each pair of niches) and three beams along them.
  for (let r = 0; r <= ROWS; r++) {
    const z = r === 0 ? AIRLOCK_END + 0.6 : r === ROWS ? HALL_END - 0.6 : (rowZ(r - 1) + rowZ(r)) / 2
    p.toon.push(xform(arch(W - 0.2, ARCH_RISE, 0.2, C.steel), [0, H - 0.1, z]))
  }
  p.toon.push(xform(paint(cap(0.14, HALL_END - AIRLOCK_END - 1.4, 8, 2), C.gun), [0, H + ARCH_RISE - 0.1, (AIRLOCK_END + HALL_END) / 2], [Math.PI / 2, 0, 0]))
  for (const s of [-1, 1]) {
    const x = s * (W - 0.2) * 0.62
    const y = H - 0.1 + ARCH_RISE * Math.sqrt(1 - 0.62 * 0.62)
    p.toon.push(xform(paint(cap(0.1, HALL_END - AIRLOCK_END - 1.4, 8, 2), C.gun), [x, y, (AIRLOCK_END + HALL_END) / 2], [Math.PI / 2, 0, 0]))
  }
  return p
}

// ─── The lab's front (the old lab was a stage with an open side) ─────────────

/** The angles of the lab's front panels (the back ring is `buildLabSet`'s). */
export const LAB_FRONT_ANGLES: readonly number[] = [0.1, 0.2, 0.3].map(k => k * Math.PI)
  .flatMap(a => [a, Math.PI - a])
  .concat([1.2, Math.PI - 1.2])

export const buildLabFront = (): Parts => {
  const p = newParts()
  for (const a of LAB_FRONT_ANGLES) {
    const x = Math.cos(a) * LAB_R
    const z = Math.sin(a) * LAB_R
    p.toon.push(paintBy(xform(rbox(2.6, 6, 0.5, 0.35), [x, 3, z], [0, Math.PI / 2 - a, 0]), (_x, y) => (y > 5.3 ? C.cyanDeep : y < 0.7 ? C.wallLow : C.wall)))
    p.glow.push(xform(paint(cap(0.07, 3.2, 8, 2), C.cyan), [Math.cos(a) * 7.9, 3.2, Math.sin(a) * 7.9]))
  }
  // The door: two posts, a header and its lamp, at the gap in the ring.
  const zf = Math.sqrt(LAB_R * LAB_R - (DOOR_HALF + 0.3) ** 2)
  for (const s of [-1, 1]) {
    p.toon.push(xform(paint(rbox(0.6, DOOR_H + 0.4, 0.9, 0.3), C.gun), [s * (DOOR_HALF + 0.3), (DOOR_H + 0.4) / 2, zf]))
    p.glow.push(xform(paint(cap(0.05, DOOR_H - 0.8, 8, 2), C.cyan), [s * (DOOR_HALF + 0.02), DOOR_H / 2, zf]))
  }
  p.toon.push(xform(paint(rbox(DOOR_HALF * 2 + 1.2, 0.7, 1.0, 0.3), C.gun), [0, DOOR_H + 0.35, zf]))
  p.glow.push(xform(paint(rbox(DOOR_HALF * 2 - 0.2, 0.1, 0.06, 0.4), C.yellow), [0, DOOR_H + 0.2, zf + 0.52]))
  // A threshold plate over the floors' joint (6 cm up: Flux walks over it).
  p.toon.push(xform(paint(rbox(DOOR_HALF * 2 + 0.8, 0.12, 1.6, 0.2), C.steel), [0, 0.0, zf + 0.5]))
  return p
}

/** The door's energy curtain: its size and place. */
export const DOOR_CURTAIN = { w: DOOR_HALF * 2, h: DOOR_H, z: Math.sqrt(LAB_R * LAB_R - (DOOR_HALF + 0.3) ** 2) }

// ─── The briefing table ──────────────────────────────────────────────────────

/** The projector table: the hologram of the valley floats over it (`hubHolo.ts`). */
export const buildHoloTable = (): Parts => {
  const p = newParts()
  const z = TABLE_Z
  p.toon.push(xform(paint(lathe([[0, 0], [TABLE_R * 0.62, 0], [TABLE_R * 0.7, 0.12], [TABLE_R * 0.48, 0.3], [TABLE_R * 0.42, 0.72], [TABLE_R, 0.82], [TABLE_R, 0.92], [0, 0.92]], 28), C.gun), [0, 0, z]))
  p.toon.push(xform(paint(torus(TABLE_R - 0.05, 0.07, 6, 40), C.steelHi), [0, 0.93, z], [Math.PI / 2, 0, 0]))
  p.glow.push(xform(paint(rcyl(TABLE_R - 0.22, 0.04, 0.02, 32), C.cyanDeep), [0, 0.94, z]))
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2
    p.glow.push(xform(paint(sph(0.06, 8, 6), C.yellow), [Math.cos(a) * (TABLE_R - 0.05), 0.86, z + Math.sin(a) * (TABLE_R - 0.05)]))
  }
  return p
}

// ─── Pads ────────────────────────────────────────────────────────────────────

/** A beam pedestal: an octagonal plinth, its rim and the inner disc. `x, z`
 *  the centre; the rim's light is the pad's own mesh (it changes colour). */
export const PAD_R = 1.2
export const PAD_TOP = 0.3

export const padParts = (x: number, z: number, hazard: boolean): Parts => {
  const p = newParts()
  const base = xform(lathe([[0, 0], [PAD_R + 0.15, 0], [PAD_R + 0.15, 0.08], [PAD_R, PAD_TOP], [0, PAD_TOP]], 8), [x, 0, z], [0, Math.PI / 8, 0])
  p.toon.push(hazard
    ? paintBy(base, (px, py, pz) => (py > PAD_TOP - 0.01 ? C.gun : Math.floor((Math.atan2(pz - z, px - x) + Math.PI) / (Math.PI / 6)) % 2 ? C.yellow : C.ink))
    : paint(base, C.gun))
  p.toon.push(xform(paint(torus(PAD_R - 0.12, 0.07, 6, 32), C.steel), [x, PAD_TOP + 0.02, z], [Math.PI / 2, 0, 0]))
  // Six little emitters round the rim.
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + Math.PI / 6
    p.toon.push(xform(paint(rcyl(0.11, 0.42, 0.05, 10), C.steel), [x + Math.cos(a) * (PAD_R + 0.28), 0.21, z + Math.sin(a) * (PAD_R + 0.28)]))
  }
  return p
}

/** The pad's light disc (its own mesh, coloured by its state). */
export const padDisc = (): BufferGeometry => paint(rcyl(PAD_R - 0.24, 0.04, 0.02, 28), '#ffffff')

/** A story niche's back wall: a tall oval portal frame. `side` the wall. */
export const portalFrame = (side: -1 | 1, z: number): Parts => {
  const p = newParts()
  const x = side * (HALL_HALF + NICHE_DEPTH - 0.06)
  const yaw = side < 0 ? Math.PI / 2 : -Math.PI / 2
  p.toon.push(xform(paint(torus(1.2, 0.13, 8, 40), C.gun), [x, 2.45, z], [0, yaw, 0], [1, 1.5, 1]))
  p.toon.push(xform(paint(rbox(2.0, 0.4, 0.5, 0.3), C.steel), [x, 0.35, z], [0, yaw, 0]))
  return p
}

/** The portal's screen (its own mesh: the sector's colour, by state): an
 *  oval with its light falling off to the rim. Faces the hall. */
export const portalScreen = (): BufferGeometry => {
  const g = xform(stripUv(new BoxGeometry(0.02, 1, 1, 1, 12, 12)), [0, 0, 0])
  const pos = g.attributes.position!
  // Bend the square into the oval, and fade its colour from the middle out.
  const col = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) * 2
    const zz = pos.getZ(i) * 2
    const r = Math.min(1, Math.hypot(y, zz))
    const a = Math.atan2(y, zz)
    const k = Math.max(Math.abs(y), Math.abs(zz))
    pos.setXYZ(i, pos.getX(i), Math.sin(a) * k * 1.65, Math.cos(a) * k * 1.1)
    const v = 1 - 0.75 * r * r
    col[i * 3] = v
    col[i * 3 + 1] = v
    col[i * 3 + 2] = v
  }
  g.setAttribute('color', new Float32BufferAttribute(col, 3))
  g.computeVertexNormals()
  return g
}

// ─── The stations ────────────────────────────────────────────────────────────

/** Where a station's floor is: the niche's middle, against its back wall. */
const nicheBack = (side: -1 | 1): number => side * (HALL_HALF + NICHE_DEPTH)

/** The weapon rack: a board with ten copied cannons hung up muzzle-high,
 *  each lit in its colour once Flux owns it (a dark one waits for its
 *  Master); an armour stand in his kit's pearl and a gear locker beside. */
export const buildWeaponRack = (side: -1 | 1, z: number, colors: ReadonlyArray<string | null>): Parts => {
  const p = newParts()
  const xb = nicheBack(side)
  const toHall = -side
  p.toon.push(xform(paint(rbox(0.36, 3.0, 3.6, 0.2), C.gun), [xb + toHall * 0.22, 2.35, z]))
  p.glow.push(xform(paint(rbox(0.06, 2.7, 3.3, 0.4), '#16203f'), [xb + toHall * 0.42, 2.35, z]))
  p.glow.push(xform(paint(rbox(0.05, 0.06, 3.4, 0.4), C.cyan), [xb + toHall * 0.43, 3.8, z]))
  p.glow.push(xform(paint(rbox(0.05, 0.06, 3.4, 0.4), C.cyan), [xb + toHall * 0.43, 0.9, z]))
  colors.forEach((c, i) => {
    const row = Math.floor(i / 5)
    const col = i % 5
    const pz = z + (col - 2) * 0.64
    const py = 3.12 - row * 0.98
    const px = xb + toHall * 0.66
    // The hook it hangs on, the barrel, the cuff, and its muzzle's light.
    p.toon.push(xform(paint(rbox(0.3, 0.07, 0.12, 0.3), C.steel), [xb + toHall * 0.5, py - 0.12, pz]))
    p.toon.push(xform(paint(rcyl(0.105, 0.56, 0.05, 14), c ? '#dfe4ec' : '#55607a'), [px, py, pz]))
    p.toon.push(xform(paint(rcyl(0.135, 0.16, 0.05, 14), c ? '#3a3f4b' : '#2a3048'), [px, py - 0.3, pz]))
    p.glow.push(xform(paint(torus(0.085, 0.028, 6, 16), c ?? '#2a3352'), [px, py + 0.29, pz], [Math.PI / 2, 0, 0]))
    if (c) p.glow.push(xform(paint(sph(0.055, 8, 6), c), [px, py + 0.3, pz]))
  })
  // The armour stand: his kit on a post, the visor lit.
  const sx = xb + toHall * 1.15
  const sz = z - 1.45
  p.toon.push(xform(paint(rcyl(0.32, 0.12, 0.05, 18), C.gun), [sx, 0.06, sz]))
  p.toon.push(xform(paint(rcyl(0.05, 0.85, 0.02, 10), C.steel), [sx, 0.55, sz]))
  p.toon.push(xform(paint(ell(0.28, 0.25, 0.19, 16, 12), '#eef0f3'), [sx, 1.1, sz]))
  p.toon.push(xform(paint(ell(0.16, 0.1, 0.06, 12, 8), '#3a3f4b'), [sx + toHall * 0.17, 1.12, sz]))
  for (const d of [-1, 1]) p.toon.push(xform(paint(sph(0.12, 12, 10), '#eef0f3'), [sx, 1.24, sz + d * 0.3]))
  p.toon.push(xform(paint(dome(0.2, Math.PI * 0.62, 16, 10), '#eef0f3'), [sx, 1.47, sz]))
  p.glow.push(xform(paint(ell(0.05, 0.05, 0.15, 10, 6), '#ffa733'), [sx + toHall * 0.17, 1.52, sz]))
  // The gear locker: slits of light down its door.
  const lx = xb + toHall * 0.75
  const lz = z + 1.5
  p.toon.push(xform(paint(rbox(0.7, 1.9, 0.8, 0.2), '#4a5878'), [lx, 0.95, lz]))
  for (let k = 0; k < 3; k++) p.glow.push(xform(paint(rbox(0.04, 0.06, 0.5, 0.4), C.cyanDeep), [lx + toHall * 0.36, 1.45 - k * 0.22, lz]))
  return p
}

/** The forge: a furnace with a glowing mouth, an anvil on a stump, a bin of
 *  bolts. Its hammer arm is `forgeHammer` (it moves). */
export const buildForge = (side: -1 | 1, z: number): Parts => {
  const p = newParts()
  const xb = nicheBack(side)
  const toHall = -side
  const fx = xb + toHall * 0.85
  p.toon.push(xform(paint(rbox(1.5, 2.3, 1.9, 0.25), '#4a3a38'), [fx, 1.15, z - 0.75]))
  p.toon.push(xform(paint(rbox(1.62, 0.3, 2.02, 0.3), C.gun), [fx, 2.42, z - 0.75]))
  p.toon.push(xform(paint(rcyl(0.38, 2.5, 0.08, 16), C.gun), [fx, 3.7, z - 0.75]))
  p.toon.push(xform(paint(torus(0.4, 0.07, 6, 20), C.steel), [fx, 4.0, z - 0.75], [Math.PI / 2, 0, 0]))
  // The mouth (facing the hall), and its fire inside.
  p.toon.push(xform(paint(rbox(0.12, 0.9, 1.0, 0.3), C.ink), [fx + toHall * 0.73, 1.05, z - 0.75]))
  p.glow.push(xform(paint(ell(0.06, 0.38, 0.42, 12, 8), '#ff7a2a'), [fx + toHall * 0.8, 1.0, z - 0.75]))
  p.glow.push(xform(paint(ell(0.04, 0.2, 0.26, 10, 6), '#ffe08a'), [fx + toHall * 0.83, 0.95, z - 0.75]))
  // The anvil, on a stump, nearer the hall.
  const ax = xb + toHall * 1.75
  const az = z + 0.55
  p.toon.push(xform(paint(rcone(0.42, 0.34, 0.55, 0.06, 14), '#5a4636'), [ax, 0.28, az]))
  p.toon.push(xform(paint(lathe([[0, 0], [0.3, 0], [0.18, 0.18], [0.2, 0.26], [0, 0.26]], 4), '#4a5262'), [ax, 0.55, az], [0, Math.PI / 4, 0]))
  p.toon.push(xform(paint(rbox(0.36, 0.2, 0.9, 0.25), '#5b6476'), [ax, 0.9, az]))
  p.toon.push(xform(paint(rcone(0.1, 0.02, 0.42, 0.02, 10), '#5b6476'), [ax, 0.92, az + 0.62], [Math.PI / 2, 0, 0]))
  // The hot plate on the anvil, glowing.
  p.glow.push(xform(paint(rbox(0.22, 0.05, 0.42, 0.3), '#ff9a2e'), [ax, 1.02, az]))
  // A bin of bolts.
  const bx = xb + toHall * 0.7
  p.toon.push(xform(paint(rbox(0.8, 0.55, 0.8, 0.25), '#8a5b3a'), [bx, 0.28, z + 1.25]))
  for (let k = 0; k < 7; k++) {
    const a = k * 2.4
    p.glow.push(xform(paint(rcyl(0.08, 0.05, 0.02, 6), C.yellow), [bx + Math.cos(a) * 0.22, 0.58 + (k % 2) * 0.03, z + 1.25 + Math.sin(a) * 0.22], [0.3 * (k % 3), 0, 0.2]))
  }
  return p
}

/** The forge's hammer: an arm hung from the niche's ceiling, pivoting at its
 *  top (local origin), the head at its end over the anvil. */
export const forgeHammer = (): Parts => {
  const p = newParts()
  p.toon.push(xform(paint(rcyl(0.16, 0.3, 0.05, 12), C.gun), [0, 0, 0], [Math.PI / 2, 0, 0]))
  p.toon.push(xform(paint(cap(0.07, 2.2, 8, 2), C.steel), [0, -1.15, 0]))
  p.toon.push(xform(paint(rbox(0.36, 0.34, 0.6, 0.3), '#4a5262'), [0, -2.35, 0]))
  p.glow.push(xform(paint(torus(0.1, 0.03, 6, 14), C.amber), [0, -1.9, 0], [Math.PI / 2, 0, 0]))
  return p
}

/** The chip lab: a bench with a lit circuit board, a scope on an arm, and a
 *  rack of chips on the wall. Its floating chip is `hubHolo`'s. */
export const buildChipLab = (side: -1 | 1, z: number): Parts => {
  const p = newParts()
  const xb = nicheBack(side)
  const toHall = -side
  const bx = xb + toHall * 1.2
  p.toon.push(xform(paint(rbox(1.1, 0.14, 2.8, 0.25), C.steel), [bx, 1.0, z]))
  for (const dz of [-1.2, 1.2]) for (const dx of [-0.4, 0.4]) {
    p.toon.push(xform(paint(rcyl(0.06, 0.95, 0.02, 8), C.gun), [bx + dx, 0.48, z + dz]))
  }
  p.glow.push(xform(paint(rbox(0.8, 0.04, 1.4, 0.4), '#3cff9a'), [bx, 1.09, z - 0.3]))
  // Its traces: a grid of darker lines a hair over the board.
  for (let k = -3; k <= 3; k++) p.toon.push(xform(paint(rbox(0.7, 0.03, 0.03, 0.5), '#13502f'), [bx, 1.115, z - 0.3 + k * 0.18]))
  // The scope: a post, an arm, a lens over the board.
  p.toon.push(xform(paint(rcyl(0.12, 0.08, 0.03, 12), C.gun), [bx - toHall * 0.3, 1.11, z + 0.8]))
  p.toon.push(xform(paint(cap(0.04, 0.6, 8, 2), C.steelHi), [bx - toHall * 0.3, 1.45, z + 0.8]))
  p.toon.push(xform(paint(cap(0.035, 0.6, 8, 2), C.steelHi), [bx - toHall * 0.05, 1.78, z + 0.55], [0.9, 0, 0]))
  p.toon.push(xform(paint(rcyl(0.08, 0.16, 0.03, 12), C.gun), [bx + toHall * 0.05, 1.6, z + 0.25]))
  p.glow.push(xform(paint(sph(0.05, 8, 6), '#3cff9a'), [bx + toHall * 0.05, 1.5, z + 0.25]))
  // The wall rack of chips.
  p.toon.push(xform(paint(rbox(0.2, 1.6, 2.6, 0.2), C.gun), [xb + toHall * 0.14, 2.9, z]))
  for (let i = 0; i < 12; i++) {
    const col = i % 4
    const row = Math.floor(i / 4)
    p.glow.push(xform(paint(rbox(0.04, 0.3, 0.42, 0.3), ['#3cff9a', C.cyanDeep, C.yellow][row]!), [xb + toHall * 0.26, 2.4 + row * 0.5, z + (col - 1.5) * 0.58]))
  }
  return p
}

/** The records terminal: a tall screen on a base, the trophy's plinth on top. */
export const buildRecords = (side: -1 | 1, z: number, live: boolean): Parts => {
  const p = newParts()
  const xb = nicheBack(side)
  const toHall = -side
  const tx = xb + toHall * 0.7
  p.toon.push(xform(paint(rbox(0.9, 0.5, 1.8, 0.3), C.gun), [tx, 0.25, z]))
  p.toon.push(xform(paint(rbox(0.5, 3.0, 2.3, 0.2), C.gun), [tx - toHall * 0.1, 2.0, z]))
  p.glow.push(xform(paint(rbox(0.04, 2.3, 1.9, 0.4), live ? '#2a2210' : '#141a2a'), [tx + toHall * 0.17, 2.1, z]))
  if (live) {
    // Five lit rows: the board's top five, the first in gold.
    for (let k = 0; k < 5; k++) {
      p.glow.push(xform(paint(rbox(0.03, 0.18, 1.5 - k * 0.12, 0.4), k === 0 ? C.yellow : '#c9a640'), [tx + toHall * 0.2, 2.9 - k * 0.38, z]))
    }
  }
  p.toon.push(xform(paint(rcyl(0.36, 0.2, 0.06, 16), C.steel), [tx - toHall * 0.1, 3.6, z]))
  return p
}

/** The trophy case: two shelves of five plinths, a core on each for a Master
 *  beaten (in its colour; dark otherwise). */
export const buildTrophies = (side: -1 | 1, z: number, cores: ReadonlyArray<string | null>): Parts => {
  const p = newParts()
  const xb = nicheBack(side)
  const toHall = -side
  const cx = xb + toHall * 0.55
  p.toon.push(xform(paint(rbox(0.9, 3.2, 3.4, 0.15), C.gun), [cx, 1.6, z]))
  p.glow.push(xform(paint(rbox(0.04, 2.8, 3.0, 0.4), '#121a33'), [cx + toHall * 0.46, 1.7, z]))
  cores.forEach((c, i) => {
    const row = Math.floor(i / 5)
    const col = i % 5
    const y = 2.55 - row * 1.15
    const pz = z + (col - 2) * 0.58
    p.toon.push(xform(paint(rcyl(0.17, 0.12, 0.04, 12), C.steel), [cx + toHall * 0.62, y - 0.28, pz]))
    p.glow.push(xform(paint(sph(0.15, 12, 10), c ?? '#262e48'), [cx + toHall * 0.62, y, pz]))
  })
  // The shelves' lit edges.
  for (const y of [2.18, 1.03]) p.glow.push(xform(paint(rbox(0.04, 0.05, 3.0, 0.4), C.cyan), [cx + toHall * 0.47, y, z]))
  return p
}

// ─── The Fortress gate ───────────────────────────────────────────────────────

/** Two pylons, a header with Vex's eye, at the mouth of the gate's niche. The
 *  leaves are `gateLeaf` (they open once the Fortress does). */
export const buildGate = (): Parts => {
  const p = newParts()
  const z = HALL_END + 0.35
  for (const s of [-1, 1]) {
    p.toon.push(xform(paint(rbox(1.0, 6.6, 1.0, 0.2), '#2a1420'), [s * (GATE_HALF - 0.55), 3.3, z]))
    p.glow.push(xform(paint(rbox(0.12, 5.6, 0.06, 0.4), C.red), [s * (GATE_HALF - 0.55), 3.1, z - 0.53]))
  }
  p.toon.push(xform(paint(rbox(GATE_HALF * 2 - 0.2, 1.0, 1.1, 0.2), '#2a1420'), [0, 6.6, z]))
  // Vex's eye: a red hexagon ring with its pupil.
  p.glow.push(xform(paint(torus(0.55, 0.09, 6, 6), C.red), [0, 6.6, z - 0.58], [0, 0, Math.PI / 6]))
  p.glow.push(xform(paint(sph(0.2, 12, 8), '#ff8a8a'), [0, 6.6, z - 0.62]))
  return p
}

/** One leaf of the gate (hinged at its outer edge, local origin): `s` its side. */
export const gateLeaf = (s: -1 | 1): Parts => {
  const p = newParts()
  const w = GATE_HALF - 1.05
  p.toon.push(xform(paint(rbox(w, 6.0, 0.3, 0.12), '#3a1a24'), [-s * w / 2, 3.0, 0]))
  for (let k = 0; k < 4; k++) p.toon.push(xform(paint(rbox(w * 0.8, 0.12, 0.36, 0.3), '#562230'), [-s * w / 2, 1.0 + k * 1.4, 0]))
  p.glow.push(xform(paint(rbox(0.06, 5.2, 0.34, 0.4), '#ff5a6a'), [-s * (w - 0.06), 3.0, 0]))
  return p
}

/** Vex's spire far beyond the hall's end, over the gate (no fog on it). */
export const buildSpire = (): Parts => {
  const p = newParts()
  const z = HALL_END + 95
  p.plain.push(xform(paint(lathe([[0, 0], [14, 0], [9, 12], [6, 30], [3, 46], [1.2, 55], [0, 57]], 8), '#120a18'), [0, -10, z]))
  for (let k = 0; k < 9; k++) {
    const y = -7 + k * 5.6
    const r = 13.2 - k * 1.3
    p.glow.push(xform(paint(torus(Math.max(1.2, r), 0.18, 4, 24), k % 3 === 0 ? '#ff2d3f' : '#5a0f1c'), [0, y, z], [Math.PI / 2, 0, 0]))
  }
  p.glow.push(xform(paint(sph(1.4, 12, 8), '#ff4050'), [0, 48, z]))
  return p
}
