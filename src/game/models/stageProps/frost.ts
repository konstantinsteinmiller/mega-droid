import { Group, Mesh, MeshBasicMaterial, PlaneGeometry, Color, type BufferGeometry } from 'three'
import { rcyl, rcone, rbox, sph, torus, xform, paint, paintBy, merge } from '../kit'
import { toonVC, glowVC, outlineMat } from '../toon'
import type { Theme } from '../../world/themes'

/**
 * Glacier Run's props (`sim/stages/frost.ts`, `icePillars.ts`, `icicles.ts`
 * drive them): the frost thrower's wall nozzle, ice pillars (whole or
 * cracked) and icicles. Toon body, outline and a glow part each, like the
 * climb's props; the nozzle owns its lamp material (the telegraph). The
 * pillar and icicle geometry is built once and shared.
 */

const ICE = '#bfeaff'
const ICE_DEEP = '#7cc8f0'
const ICE_WHITE = '#f2fbff'
const CRACK = '#2e5a80'

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

export interface NozzleMesh {
  root: Group
  /** The mouth's glow: dark at rest, brightening through the telegraph,
   *  white-blue while it blasts (the sim sets its colour). */
  glowMat: MeshBasicMaterial
}

/**
 * A frost thrower: a steel housing on the wall with a flared nozzle and
 * coolant tubes, pointing along local +Z (the group's origin is the wall
 * face at the mouth's height; the sim turns it to face its lane).
 */
export const buildFrostNozzle = (theme: Theme): NozzleMesh => {
  const toon: BufferGeometry[] = []
  toon.push(xform(paint(rbox(1.3, 1.1, 0.5, 0.25), theme.pipe), [0, 0, 0.22]))
  toon.push(xform(paint(rbox(1.5, 0.18, 0.56, 0.3), theme.crateTrim), [0, 0.6, 0.24]))
  toon.push(xform(paint(rcyl(0.3, 0.5, 0.06, 14), theme.pilaster), [0, 0, 0.7], [Math.PI / 2, 0, 0]))
  toon.push(xform(paint(rcone(0.26, 0.44, 0.34, 0.03, 14), '#3a4a5e'), [0, 0, 1.08], [Math.PI / 2, 0, 0]))
  for (const s of [-1, 1]) {
    toon.push(xform(paint(rcyl(0.08, 1.4, 0.02, 8), '#5a7fa8'), [s * 0.5, 0.2, 0.52], [0, 0, 0]))
  }
  // Frost on the housing.
  toon.push(xform(paint(rbox(1.2, 0.12, 0.4, 0.4), ICE_WHITE), [0, 0.72, 0.3]))
  const root = assemble(toon, [xform(paint(torus(0.3, 0.05, 6, 16), theme.accent), [0, 0, 1.25])])
  const glowMat = new MeshBasicMaterial({ color: new Color('#16303f'), toneMapped: false })
  root.add(new Mesh(xform(sph(0.24, 12, 8), [0, 0, 1.18]), glowMat))
  return { root, glowMat }
}

let pillarGeo: { whole: BufferGeometry; cracked: BufferGeometry; glint: BufferGeometry } | null = null

/** Height of an ice pillar over its floor (m). */
export const PILLAR_H = 4.4

const pillarGeometry = () => {
  if (pillarGeo) return pillarGeo
  const shaft = (crack: boolean) => {
    const parts: BufferGeometry[] = []
    // A six-sided crystal shaft with a leaning shard and a frosty foot.
    const col = crack
      ? paintBy(xform(rcyl(0.95, PILLAR_H, 0.2, 6), [0, PILLAR_H / 2, 0]), (x, y, z) =>
        (Math.abs(Math.sin(y * 3.1 + x * 2.2) + Math.cos(z * 2.7 - y * 1.3)) < 0.18 ? CRACK : y > PILLAR_H * 0.6 ? ICE : ICE_DEEP))
      : paintBy(xform(rcyl(0.95, PILLAR_H, 0.2, 6), [0, PILLAR_H / 2, 0]), (_x, y) => (y > PILLAR_H * 0.6 ? ICE : ICE_DEEP))
    parts.push(col)
    parts.push(xform(paint(rcone(0.55, 0.05, 1.3, 0.04, 6), ICE), [0.35, PILLAR_H + 0.45, -0.2], [0.2, 0, -0.25]))
    parts.push(xform(paint(rcyl(1.2, 0.4, 0.15, 8), ICE_WHITE), [0, 0.2, 0]))
    return merge(parts)
  }
  pillarGeo = {
    whole: shaft(false),
    cracked: shaft(true),
    glint: merge([
      xform(paint(rbox(0.08, PILLAR_H * 0.7, 0.08, 0.5), ICE_WHITE), [0.55, PILLAR_H * 0.5, 0.7]),
      xform(paint(rbox(0.06, PILLAR_H * 0.4, 0.06, 0.5), ICE_WHITE), [-0.6, PILLAR_H * 0.62, 0.62])
    ])
  }
  return pillarGeo
}

/** An ice pillar standing on the group's origin (its floor). A cracked one
 *  wears dark fracture lines, so it reads as the one to shoot. */
export const buildIcePillar = (cracked: boolean): Group => {
  const g = pillarGeometry()
  const root = new Group()
  const geo = cracked ? g.cracked : g.whole
  root.add(new Mesh(geo, toonVC()))
  const o = new Mesh(geo, outlineMat(0.035))
  o.renderOrder = -1
  root.add(o)
  root.add(new Mesh(g.glint, glowVC()))
  return root
}

let icicleGeo: BufferGeometry | null = null

/** An icicle hanging from the group's origin (its root at the ceiling),
 *  tip down, about 1.6 m long, with two smaller ones beside it. */
let roofMat: MeshBasicMaterial | null = null

/**
 * The roof an icicle hall hangs its icicles from (`sim/stages/icicles.ts`):
 * `cw` × `cd` cells of `cell` m, its underside at the group's origin. Frosted
 * steel panels in the Cryo Plant, mottled rock where stalactites fall
 * (`rock`). Drawn from below only: a camera over the hall (the rescue's
 * lift, a kill-cam) looks straight through it, and it casts nothing.
 */
export const buildIcicleRoof = (cw: number, cd: number, cell: number, rock: boolean): Group => {
  const down = (g: BufferGeometry, x: number, y: number, z: number) => xform(g, [x, y, z], [Math.PI / 2, 0, 0])
  const geos: BufferGeometry[] = []
  if (rock) {
    const a = new Color('#5e4d3c')
    const b = new Color('#3f3329')
    const g = paintBy(new PlaneGeometry(cw * cell + 0.1, cd * cell + 0.1, cw * 2, cd * 2), (x, y) => {
      const h = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453
      return a.clone().lerp(b, h - Math.floor(h))
    })
    geos.push(down(g, 0, 0, 0))
  } else {
    // A dark seam behind a grid of panels in two tones, frost in the joints.
    geos.push(down(paint(new PlaneGeometry(cw * cell + 0.1, cd * cell + 0.1), '#20405a'), 0, 0.02, 0))
    for (let j = 0; j < cd; j++) {
      for (let i = 0; i < cw; i++) {
        const x = (i + 0.5 - cw / 2) * cell
        const z = (j + 0.5 - cd / 2) * cell
        geos.push(down(paint(new PlaneGeometry(cell - 0.16, cell - 0.16), (i + j) & 1 ? '#4a7ea6' : '#3f7099'), x, 0, z))
        if (((i * 5 + j * 3) & 3) === 0) geos.push(down(paint(new PlaneGeometry(cell * 0.5, cell * 0.34), ICE), x + cell * 0.12, -0.01, z - cell * 0.1))
      }
    }
  }
  roofMat ??= new MeshBasicMaterial({ vertexColors: true })
  const root = new Group()
  root.add(new Mesh(merge(geos), roofMat))
  return root
}

export const buildIcicle = (): Group => {
  if (!icicleGeo) {
    icicleGeo = merge([
      xform(paint(rcone(0.34, 0.02, 1.6, 0.02, 7), ICE), [0, -0.8, 0], [Math.PI, 0, 0]),
      xform(paint(rcone(0.18, 0.02, 0.8, 0.02, 6), ICE_DEEP), [0.36, -0.4, 0.1], [Math.PI, 0, 0]),
      xform(paint(rcone(0.16, 0.02, 0.7, 0.02, 6), ICE_WHITE), [-0.3, -0.35, -0.16], [Math.PI, 0, 0]),
      xform(paint(rbox(1.0, 0.2, 0.8, 0.4), ICE_WHITE), [0, 0.05, 0])
    ])
  }
  const root = new Group()
  root.add(new Mesh(icicleGeo, toonVC()))
  const o = new Mesh(icicleGeo, outlineMat(0.025))
  o.renderOrder = -1
  root.add(o)
  return root
}
