import { Box3 } from 'three'
import { decorParts, type DecorKind } from '../models/decorProps'
import type { DecorSpot } from '../world/decor'

/**
 * ─── Set dressing a shot can break (#169) ────────────────────────────────────
 *
 * Every prop of a level's set dressing (`world/decor.ts`) but its pipes
 * breaks to any player hit and drops one bolt: a player who shoots at the
 * scenery gets a small reward, and sees it answer. A broken prop is gone for
 * the rest of the mission (its body's nav circle too), so it pays once.
 *
 * Each prop is a box round its parts (world axes, from its built geometry):
 * cheap to test a shot's step against, a list of a few dozen a level.
 */

/** Props that stay standing. Empty: every room prop breaks, the Cryo coolant
 *  pipe too; only the walls' own pipes (`wallPipe.ts`, not props) never do. */
export const UNBREAKABLE: ReadonlySet<DecorKind> = new Set<DecorKind>()

/** Bolts a broken prop drops. */
export const DECOR_BOLTS = 1

export interface DecorTarget {
  /** Index into `planDecor(...).props` (`LevelMeshes.breakDecor`). */
  n: number
  kind: DecorKind
  x0: number
  y0: number
  z0: number
  x1: number
  y1: number
  z1: number
  /** Its body's slot in `nav.props` (a floor prop), else −1. */
  navIdx: number
  broken: boolean
}

const local = new Map<DecorKind, Box3>()
/** A kind's box in its own frame (built once). */
const localBox = (kind: DecorKind): Box3 => {
  let b = local.get(kind)
  if (!b) {
    b = new Box3()
    for (const g of decorParts(kind).toon) {
      g.computeBoundingBox()
      b.union(g.boundingBox!)
      g.dispose()
    }
    local.set(kind, b)
  }
  return b
}

/** The breakable props of a plan, each boxed in the world. `navIdx(n)`: the
 *  prop's nav slot, or −1. */
export const decorTargets = (props: readonly DecorSpot[], navIdx: (n: number) => number = () => -1): DecorTarget[] => {
  const out: DecorTarget[] = []
  props.forEach((p, n) => {
    if (UNBREAKABLE.has(p.kind)) return
    const b = localBox(p.kind)
    // Turned by its yaw round y: the box of the turned box's corners.
    const c = Math.cos(p.yaw)
    const s = Math.sin(p.yaw)
    let x0 = Infinity
    let x1 = -Infinity
    let z0 = Infinity
    let z1 = -Infinity
    for (const lx of [b.min.x, b.max.x]) {
      for (const lz of [b.min.z, b.max.z]) {
        const wx = p.x + lx * c + lz * s
        const wz = p.z - lx * s + lz * c
        x0 = Math.min(x0, wx)
        x1 = Math.max(x1, wx)
        z0 = Math.min(z0, wz)
        z1 = Math.max(z1, wz)
      }
    }
    out.push({ n, kind: p.kind, x0, y0: p.y + b.min.y, z0, x1, y1: p.y + b.max.y, z1, navIdx: navIdx(n), broken: false })
  })
  return out
}

/**
 * The first unbroken target the step (ax, ay, az) → (bx, by, bz) of a shot
 * of radius `r` passes through (a point when a = b), or null. A slab test
 * against each box grown by `r`.
 */
export const decorHit = (
  targets: readonly DecorTarget[], ax: number, ay: number, az: number, bx: number, by: number, bz: number, r: number
): DecorTarget | null => {
  const dx = bx - ax
  const dy = by - ay
  const dz = bz - az
  let best: DecorTarget | null = null
  let bestT = Infinity
  for (const d of targets) {
    if (d.broken) continue
    // Broad phase: the step's own box against the target's.
    if (Math.max(ax, bx) < d.x0 - r || Math.min(ax, bx) > d.x1 + r) continue
    if (Math.max(az, bz) < d.z0 - r || Math.min(az, bz) > d.z1 + r) continue
    if (Math.max(ay, by) < d.y0 - r || Math.min(ay, by) > d.y1 + r) continue
    let t0 = 0
    let t1 = 1
    const slab = (o: number, v: number, lo: number, hi: number): boolean => {
      if (Math.abs(v) < 1e-9) return o >= lo && o <= hi
      let ta = (lo - o) / v
      let tb = (hi - o) / v
      if (ta > tb) { const k = ta; ta = tb; tb = k }
      t0 = Math.max(t0, ta)
      t1 = Math.min(t1, tb)
      return t0 <= t1
    }
    if (!slab(ax, dx, d.x0 - r, d.x1 + r) || !slab(ay, dy, d.y0 - r, d.y1 + r) || !slab(az, dz, d.z0 - r, d.z1 + r)) continue
    if (t0 < bestT) {
      bestT = t0
      best = d
    }
  }
  return best
}
