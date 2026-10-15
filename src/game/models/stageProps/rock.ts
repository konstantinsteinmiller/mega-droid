import { Group, Mesh, type BufferGeometry } from 'three'
import { rbox, rcone, rock, xform, paint, merge } from '../kit'
import { toonVC, glowVC, outlineMat } from '../toon'

/**
 * The Deep Mine's rock (`world/stages/drill.ts`), the Glacier's ice pillars
 * and icicles in stone (`sim/stages/icePillars.ts`, `icicles.ts` pick these
 * on the drill theme):
 *
 *  - a boulder filling its cell; a cracked one has glowing amber seams and
 *    gives way to a full charge or a Drill Bomb;
 *  - a stalactite hanging from the cave roof, tip down, that drops.
 */

const STONE = '#7a6650'
const STONE_DARK = '#5a4a3a'
const STONE_LIGHT = '#9a8468'
const SEAM = '#ffb12a'

let whole: BufferGeometry | null = null
let cracked: BufferGeometry | null = null
let seams: BufferGeometry | null = null

const bodyOf = (seed: number): BufferGeometry => merge([
  xform(paint(rock(1.15, seed, 11, 8), STONE), [0, 1.05, 0], [0, 0, 0], [1, 1.0, 1]),
  xform(paint(rock(0.7, seed + 3, 9, 7), STONE_DARK), [0.35, 2.0, -0.2], [0, 1, 0], [1, 0.8, 1]),
  xform(paint(rock(0.55, seed + 7, 9, 7), STONE_LIGHT), [-0.5, 0.5, 0.45])
])

/** A boulder over the group's origin (its cell's floor). */
export const buildBoulder = (isCracked: boolean): Group => {
  if (!whole) whole = bodyOf(5)
  if (!cracked) cracked = bodyOf(9)
  if (!seams) {
    // Amber seams across the cracked boulder's face: thin glowing slabs.
    const parts: BufferGeometry[] = []
    const lines: Array<[number, number, number, number]> = [[0.2, 1.4, 0.6, 0.4], [-0.3, 0.9, -0.5, 0.25], [0.4, 0.6, 1.1, 0.3], [-0.1, 1.9, 0.2, 0.2]]
    for (const [x, y, rz, w] of lines) {
      for (const side of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
        parts.push(xform(paint(rbox(w * 2.2, 0.06, 0.06, 0.2), SEAM), [Math.sin(side) * 1.08 + x * Math.cos(side), y, Math.cos(side) * 1.08 - x * Math.sin(side)], [0, side, rz]))
      }
    }
    seams = merge(parts)
  }
  const geo = isCracked ? cracked : whole
  const root = new Group()
  root.add(new Mesh(geo, toonVC()))
  const o = new Mesh(geo, outlineMat(0.035))
  o.renderOrder = -1
  root.add(o)
  if (isCracked) root.add(new Mesh(seams, glowVC()))
  return root
}

let stalGeo: BufferGeometry | null = null
/** Its mount's top over the origin (m), at scale 1. */
export const STALACTITE_MOUNT = 0.18

/** A stalactite hanging from the group's origin (its root at the roof),
 *  tip down, about 1.6 m long, with two smaller ones beside it. */
export const buildStalactite = (): Group => {
  if (!stalGeo) {
    stalGeo = merge([
      xform(paint(rcone(0.36, 0.03, 1.6, 0.03, 7), STONE), [0, -0.8, 0], [Math.PI, 0, 0]),
      xform(paint(rcone(0.2, 0.03, 0.8, 0.03, 6), STONE_DARK), [0.38, -0.4, 0.1], [Math.PI, 0, 0]),
      xform(paint(rcone(0.17, 0.03, 0.7, 0.03, 6), STONE_LIGHT), [-0.32, -0.35, -0.16], [Math.PI, 0, 0]),
      xform(paint(rbox(1.1, 0.24, 0.9, 0.4), STONE_DARK), [0, 0.06, 0])
    ])
  }
  const root = new Group()
  root.add(new Mesh(stalGeo, toonVC()))
  const o = new Mesh(stalGeo, outlineMat(0.025))
  o.renderOrder = -1
  root.add(o)
  return root
}
