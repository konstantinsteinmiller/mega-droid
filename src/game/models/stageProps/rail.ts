import { Group, Mesh, MeshBasicMaterial, Color, type BufferGeometry } from 'three'
import { rcyl, rbox, sph, torus, xform, paint, paintBy, merge } from '../kit'
import { toonVC, glowVC, outlineMat } from '../toon'
import type { Theme } from '../../world/themes'

/**
 * The volt stage's props (`sim/stages/rail.ts`, `sim/stages/shock.ts` drive
 * them): the maglev rail, its cart and the electrified floor panels. Cheap
 * on purpose — the whole rail is one merged toon mesh (beams and pylons) and
 * one glow mesh (the live strips, flickered by the sim through its one
 * material), the cart three draw calls and a lamp, a panel a plate and its
 * grid. The sparks are the particle pool's (`fx/particles.ts`).
 */

const DANGER_YELLOW = '#ffc21a'
const DANGER_BLACK = '#1b1d24'

const stripes = (per: number) => (x: number, y: number, z: number) =>
  (Math.floor((x + z + y * 0.6) * per) & 1 ? DANGER_YELLOW : DANGER_BLACK)

const assemble = (toonParts: BufferGeometry[], glowParts: BufferGeometry[], outline = 0.03): Group => {
  const root = new Group()
  if (toonParts.length) {
    const g = merge(toonParts)
    root.add(new Mesh(g, toonVC()))
    const o = new Mesh(g, outlineMat(outline))
    o.renderOrder = -1
    root.add(o)
  }
  if (glowParts.length) root.add(new Mesh(merge(glowParts), glowVC()))
  return root
}

export interface RailMesh {
  root: Group
  /** The live strips along the beam: the sim flickers its colour. */
  stripMat: MeshBasicMaterial
}

/** Pylons stand under the beam about this far apart (m). */
const PYLON_EVERY = 9

/**
 * The rail along `points` (the cart's floor at each point): a beam just
 * under the deck with two live strips along its top, on pylons down to
 * `bottomAt(x, z)` (a floor under it, or the pit's bottom) where that is
 * more than a metre down.
 */
export const buildRail = (theme: Theme, points: ReadonlyArray<{ x: number; y: number; z: number }>, bottomAt: (x: number, z: number) => number, mine = false): RailMesh => {
  const toon: BufferGeometry[] = []
  const strips: BufferGeometry[] = []
  // The Deep Mine's track (#111): wooden sleepers under two steel rails.
  let tie = 0
  let run = PYLON_EVERY / 2
  for (let n = 1; n < points.length; n++) {
    const a = points[n - 1]!
    const c = points[n]!
    const dx = c.x - a.x
    const dy = c.y - a.y
    const dz = c.z - a.z
    const h = Math.hypot(dx, dz)
    const len = Math.hypot(h, dy)
    if (len < 1e-4) continue
    // Along +X, pitched then turned onto the segment.
    const rot: [number, number, number] = [0, Math.atan2(-dz, dx), Math.atan2(dy, h)]
    const mid: [number, number, number] = [(a.x + c.x) / 2, (a.y + c.y) / 2, (a.z + c.z) / 2]
    toon.push(xform(paint(rbox(len + 0.12, 0.34, 0.62, 0.3, 8, 6), theme.pilaster), [mid[0], mid[1] - 0.62, mid[2]], rot))
    if (mine) {
      for (tie += len; tie >= MINE_TIE_EVERY; tie -= MINE_TIE_EVERY) {
        const k = 1 - (tie - MINE_TIE_EVERY) / len
        const tx = a.x + dx * Math.max(0, Math.min(1, k))
        const ty = a.y + dy * Math.max(0, Math.min(1, k))
        const tz = a.z + dz * Math.max(0, Math.min(1, k))
        toon.push(xform(paint(rbox(0.22, 0.14, 1.9, 0.2, 4, 4), MINE_WOOD), [tx, ty - 0.42, tz], rot))
      }
    }
    for (const side of [-1, 1]) {
      const sx = Math.sin(rot[1]) * side * 0.24
      const sz = Math.cos(rot[1]) * side * 0.24
      strips.push(xform(rbox(len + 0.1, 0.07, 0.1, 0.6, 6, 4), [mid[0] + sx, mid[1] - 0.43, mid[2] + sz], rot))
    }
    run += len
    if (run >= PYLON_EVERY) {
      run = 0
      const foot = bottomAt(c.x, c.z)
      const top = c.y - 0.75
      if (top - foot > 1) {
        const hgt = top - foot
        toon.push(paintBy(xform(rcyl(0.26, hgt, 0.05, 10), [c.x, foot + hgt / 2, c.z]), (_x, y) => (Math.floor(y * 0.8) & 1 ? theme.pipe : theme.pilaster)))
        toon.push(paintBy(xform(rbox(0.9, 0.3, 0.9, 0.4, 8, 6), [c.x, top, c.z]), stripes(2.2)))
      }
    }
  }
  const root = assemble(toon, [], 0.025)
  const stripMat = new MeshBasicMaterial({ color: new Color(theme.accent), toneMapped: false })
  if (strips.length) root.add(new Mesh(merge(strips), stripMat))
  return { root, stripMat }
}

/** Sleepers under the mine track: one every this many metres, in old wood. */
const MINE_TIE_EVERY = 0.9
const MINE_WOOD = '#6b4a2b'
const MINE_IRON = '#59606e'
const MINE_RUST = '#9a5a2a'

export interface CartMesh {
  root: Group
  /** The magnet pads under the deck: bright while it rides. */
  padMat: MeshBasicMaterial
  /** A quadcopter's four rotors (spun by the ride), none on a cart. */
  rotors?: Group[]
}

/** The quadcopter's landing skids: their soles this far under its deck top
 *  (m). At rest it stands on them, its deck a step over the floor
 *  (`sim/stages/rail.ts` REST_LIFT). */
export const QUAD_SKID = 0.45
/** Its rotors' height over the deck top (m): up on their motor posts, clear
 *  of the floor it rests on. */
export const QUAD_ROTOR_Y = 0.32

/**
 * The Rotor Run's ride: a cargo quadcopter, its deck top at the group's
 * origin (the cart's footprint, so the ride carries Flux the same way),
 * facing −Z: a railed deck on four arms, a rotor in a ring up on a motor
 * post at each corner, two landing skids under it (it rests on them in its
 * slot; its rotors used to sit under the boarding island's floor), running
 * lights (the "pads": bright while it flies).
 */
export const buildQuadcopter = (theme: Theme): CartMesh => {
  const { toon, glow: glowG } = quadcopterParts(theme)
  const rotors: Group[] = []
  const root = new Group()
  const body = assemble(toon, glowG)
  root.add(body)
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const g = new Group()
    g.position.set(sx * 2.05, QUAD_ROTOR_Y + 0.02, sz * 2.05)
    const blade = merge([
      xform(paint(rbox(1.3, 0.03, 0.16, 0.5, 6, 2), '#e8ecf4'), [0, 0, 0]),
      xform(paint(rbox(0.16, 0.03, 1.3, 0.5, 6, 2), '#e8ecf4'), [0, 0, 0]),
      xform(paint(rcyl(0.1, 0.12, 0.03, 10), DANGER_YELLOW), [0, 0, 0])
    ])
    g.add(new Mesh(blade, toonVC()))
    rotors.push(g)
    root.add(g)
  }
  const padMat = new MeshBasicMaterial({ color: new Color(theme.pipe), toneMapped: false })
  // The running lights: along the deck's sides, under its rim.
  const pads = merge([-1, 1].map(sx => xform(rbox(0.08, 0.08, 1.7, 0.5, 8, 4), [sx * 1.26, -0.13, 0])))
  root.add(new Mesh(pads, padMat))
  return { root, padMat, rotors }
}

/** The quadcopter's body, one geometry per part (`tests/game/rotorRun.test.ts`
 *  checks them for coplanar faces): the merged toon and glow of its frame. */
export const quadcopterParts = (theme: Theme): { toon: BufferGeometry[]; glow: BufferGeometry[] } => {
  const toon: BufferGeometry[] = []
  const glowG: BufferGeometry[] = []
  toon.push(paintBy(xform(rbox(2.5, 0.2, 2.6, 0.2), [0, -0.12, 0]), stripes(1.6)))
  toon.push(xform(paint(rbox(2.2, 0.05, 2.3, 0.2), '#2a2d3e'), [0, 0.0, 0]))
  for (const sx of [-1, 1]) toon.push(xform(paint(rbox(0.12, 0.5, 2.5, 0.3), theme.pilaster), [sx * 1.2, 0.25, 0]))
  // The cargo pod between the skids, clear of the floor.
  toon.push(xform(paint(rbox(0.9, 0.16, 0.8, 0.3), theme.pilaster), [0, -0.27, 0]))
  // The skids: a tube each side on two struts set up into the deck.
  for (const sx of [-0.85, 0.85]) {
    toon.push(xform(paint(rcyl(0.055, 2.3, 0.02, 8), DANGER_BLACK), [sx, -QUAD_SKID + 0.055, 0], [Math.PI / 2, 0, 0]))
    for (const sz of [-0.7, 0.7]) toon.push(xform(paint(rcyl(0.04, 0.36, 0.01, 6), theme.pilaster), [sx, -0.24, sz]))
  }
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    toon.push(xform(paint(rbox(1.1, 0.12, 0.16, 0.3), theme.pilaster), [sx * 1.55, -0.12, sz * 1.55], [0, sx * sz > 0 ? -Math.PI / 4 : Math.PI / 4, 0]))
    // The motor post up from the arm's end to the rotor's ring.
    toon.push(xform(paint(rcyl(0.11, QUAD_ROTOR_Y + 0.14, 0.03, 10), theme.pilaster), [sx * 2.05, (QUAD_ROTOR_Y - 0.18) / 2 + 0.02, sz * 2.05]))
    toon.push(xform(paint(torus(0.75, 0.08, 6, 24), DANGER_BLACK), [sx * 2.05, QUAD_ROTOR_Y - 0.03, sz * 2.05], [Math.PI / 2, 0, 0]))
    glowG.push(xform(paint(sph(0.1, 8, 6), sz < 0 ? '#ff4a4a' : '#5dff8a'), [sx * 2.05, QUAD_ROTOR_Y + 0.07, sz * 2.05 + sz * 0.78]))
  }
  return { toon, glow: glowG }
}

/**
 * The maglev cart, its deck top at the group's origin, facing −Z (the game's
 * forward at yaw 0): a hazard-striped deck with low side walls, a black
 * bumper with a lamp at the front, magnet pads glowing underneath.
 */
export const buildCart = (theme: Theme): CartMesh => {
  const toon: BufferGeometry[] = []
  const glowG: BufferGeometry[] = []
  toon.push(paintBy(xform(rbox(2.5, 0.36, 2.6, 0.25), [0, -0.2, 0]), stripes(1.6)))
  toon.push(xform(paint(rbox(2.2, 0.05, 2.3, 0.2), '#2a2d3e'), [0, 0.0, 0]))
  for (const sx of [-1, 1]) {
    toon.push(xform(paint(rbox(0.2, 0.62, 2.5, 0.3), DANGER_YELLOW), [sx * 1.18, 0.25, 0]))
    toon.push(xform(paint(rbox(0.26, 0.12, 2.6, 0.4), DANGER_BLACK), [sx * 1.18, 0.6, 0]))
  }
  toon.push(xform(paint(rbox(2.5, 0.42, 0.28, 0.35), DANGER_BLACK), [0, 0.12, -1.34]))
  toon.push(xform(paint(rbox(1.4, 0.3, 0.9, 0.35), theme.pilaster), [0, -0.52, 0]))
  glowG.push(xform(paint(sph(0.14, 10, 6), '#fff6c0'), [0.8, 0.2, -1.5]))
  glowG.push(xform(paint(sph(0.14, 10, 6), '#fff6c0'), [-0.8, 0.2, -1.5]))
  glowG.push(xform(paint(rbox(2.1, 0.05, 0.08, 0.5, 6, 4), theme.accent), [0, 0.2, 1.33]))
  const root = assemble(toon, glowG)
  const padMat = new MeshBasicMaterial({ color: new Color(theme.pipe), toneMapped: false })
  const pads = merge([-0.75, 0.75].map(sz => xform(rbox(1.7, 0.1, 0.5, 0.5, 8, 4), [0, -0.72, sz])))
  root.add(new Mesh(pads, padMat))
  return { root, padMat }
}

/**
 * The Deep Mine's ride (#111): an iron ore tub on four wheels, rust-streaked,
 * a lamp at the front. Same footprint as the maglev cart (deck top at the
 * group's origin, facing −Z), so the ride carries Flux the same way; the
 * "pads" are the axle glow.
 */
export const buildMineCart = (theme: Theme): CartMesh => {
  const toon: BufferGeometry[] = []
  const glowG: BufferGeometry[] = []
  toon.push(paintBy(xform(rbox(2.3, 0.3, 2.5, 0.25), [0, -0.18, 0]), (_x, y, z) => (Math.floor((z + y) * 2.2) & 1 ? MINE_IRON : MINE_RUST)))
  toon.push(xform(paint(rbox(2.0, 0.05, 2.2, 0.2), '#2a2420'), [0, 0, 0]))
  for (const sx of [-1, 1]) {
    toon.push(xform(paint(rbox(0.16, 0.72, 2.4, 0.3), MINE_IRON), [sx * 1.12, 0.3, 0]))
    toon.push(xform(paint(rbox(0.22, 0.1, 2.5, 0.4), MINE_RUST), [sx * 1.12, 0.68, 0]))
  }
  for (const sz of [-1, 1]) toon.push(xform(paint(rbox(2.3, 0.62, 0.16, 0.3), MINE_IRON), [0, 0.27, sz * 1.2]))
  for (const sx of [-0.85, 0.85]) {
    for (const sz of [-0.8, 0.8]) {
      toon.push(xform(paint(rcyl(0.32, 0.22, 0.06, 14), '#2b2f38'), [sx, -0.52, sz], [0, 0, Math.PI / 2]))
      toon.push(xform(paint(torus(0.3, 0.05, 6, 16), theme.accent), [sx * 1.06, -0.52, sz], [0, Math.PI / 2, 0]))
    }
  }
  // The lamp on the front lip, low: the rider's view clears it.
  glowG.push(xform(paint(sph(0.09, 10, 6), '#ffe0a0'), [0, -0.12, -1.3]))
  const root = assemble(toon, glowG)
  const padMat = new MeshBasicMaterial({ color: new Color(theme.pipe), toneMapped: false })
  const pads = merge([-0.8, 0.8].map(sz => xform(rcyl(0.07, 1.9, 0.02, 8), [0, -0.52, sz], [0, 0, Math.PI / 2])))
  root.add(new Mesh(pads, padMat))
  return { root, padMat }
}

export interface ShockPanelMesh {
  root: Group
  /** The grid's colour: dark at rest, amber in the warning, white-hot live. */
  mat: MeshBasicMaterial
}

/**
 * An electrified floor panel filling a cell (`size` m square), its top a
 * few centimetres over the floor at the group's origin: a dark plate in a
 * hazard-striped frame, a glowing grid on it.
 */
export const buildShockPanel = (size: number): ShockPanelMesh => {
  const toon: BufferGeometry[] = []
  // Its striped rim (0.16 wide on its edge) stays inside its cell: two
  // panels side by side had their rims in one another, in one plane.
  const s = size - 0.2
  toon.push(xform(paint(rbox(s, 0.06, s, 0.2, 8, 4), '#1d2038'), [0, 0.01, 0]))
  for (const [x, z, w, d] of [[0, -s / 2, s, 0.16], [0, s / 2, s, 0.16], [-s / 2, 0, 0.16, s], [s / 2, 0, 0.16, s]] as const) {
    toon.push(paintBy(xform(rbox(w, 0.08, d, 0.3, 8, 4), [x, 0.02, z]), stripes(2.4)))
  }
  const root = assemble(toon, [], 0.015)
  const grid: BufferGeometry[] = []
  for (let n = -1; n <= 1; n++) {
    grid.push(xform(rbox(s * 0.9, 0.03, 0.07, 0.6, 6, 4), [0, 0.05, n * s * 0.28]))
    grid.push(xform(rbox(0.07, 0.03, s * 0.9, 0.6, 6, 4), [n * s * 0.28, 0.05, 0]))
  }
  const mat = new MeshBasicMaterial({ color: new Color('#2a3a7a'), toneMapped: false })
  root.add(new Mesh(merge(grid), mat))
  return { root, mat }
}
