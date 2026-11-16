import { CELL, Cell, type MapData } from '../world/levelGen'
import type { Enemy } from './world'

/**
 * ─── Where a climb's ground machine may walk (#196) ─────────────────────────
 *
 * A stage post used to leash its machine to a rectangle of its own platform,
 * so a machine never followed Flux through the corridor that joins one patch
 * to the next: running out of the room was a full escape, above all from the
 * slow Guardroid. Now a ground machine keeps to the FLAT, CONNECTED floor it
 * stands on instead — every cell reachable from its post over floor at the
 * same height, no ramp, no pit, no wall — which takes in the corridors and the
 * neighbouring platforms joined by them, and still never a ledge, a pit or a
 * staircase (a machine does not climb; its floor height stays what it spawned
 * with).
 */

const regions = new WeakMap<MapData, Int32Array>()

/** Region id per cell (−1: not floor a ground machine can stand on). One
 *  flood fill per map, cached: 4-connected cells of the same flat height. */
export const roamRegions = (map: MapData): Int32Array => {
  const hit = regions.get(map)
  if (hit) return hit
  const W = map.w
  const t = map.terrain
  const id = new Int32Array(map.w * map.h).fill(-1)
  if (t) {
    const stand = (k: number): boolean => map.cell[k] !== Cell.Void && !t.pit[k] && !t.ramp[k]
    let next = 0
    const stack: number[] = []
    for (let s = 0; s < id.length; s++) {
      if (id[s] !== -1 || !stand(s)) continue
      id[s] = next
      stack.push(s)
      const f = t.floor[s]!
      while (stack.length) {
        const k = stack.pop()!
        const i = k % W
        const j = (k - i) / W
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const ni = i + di
          const nj = j + dj
          if (ni < 0 || nj < 0 || ni >= W || nj >= map.h) continue
          const nk = nj * W + ni
          if (id[nk] !== -1 || !stand(nk) || Math.abs(t.floor[nk]! - f) > 1e-3) continue
          id[nk] = next
          stack.push(nk)
        }
      }
      next++
    }
  }
  regions.set(map, id)
  return id
}

/** Which of the machine's kinds roam: walkers that move and are not asleep as
 *  a crate. Turrets, flyers (own height band) and golems keep their leash. */
export const roams = (e: Enemy): boolean =>
  !!e.leash && !e.hover && e.def.fly === 0 && e.def.speed > 0 && !e.golem && !e.rooted && e.kind !== 'turret'

const cellAt = (map: MapData, x: number, z: number): number => {
  const i = Math.floor(x / CELL)
  const j = Math.floor(z / CELL)
  return i < 0 || j < 0 || i >= map.w || j >= map.h ? -1 : j * map.w + i
}

/** The machine's body is on its own region: its centre, and the four points
 *  of its rim, each on the region or in a wall (a wall is the collision's). */
export const onRegion = (map: MapData, reg: number, x: number, z: number, r: number): boolean => {
  const ids = roamRegions(map)
  const probe = (px: number, pz: number, wallOk: boolean): boolean => {
    const k = cellAt(map, px, pz)
    if (k < 0) return wallOk
    if (ids[k] === reg) return true
    return wallOk && map.cell[k] === Cell.Void
  }
  const d = r * 0.9
  return probe(x, z, false) && probe(x + d, z, true) && probe(x - d, z, true) && probe(x, z + d, true) && probe(x, z - d, true)
}

/**
 * Hold a roaming machine to its region: the first call fixes the region it
 * stands in; a position off it (a rush, a hop, a knockback over a ledge) is
 * undone to the last spot on it. Returns false when `e` does not roam (the
 * caller keeps its rectangle leash).
 */
export const keepOnRegion = (map: MapData, e: Enemy): boolean => {
  if (!roams(e)) return false
  const ids = roamRegions(map)
  if (e.roam === undefined) {
    const k = cellAt(map, e.x, e.z)
    e.roam = k >= 0 ? ids[k]! : -1
  }
  if (e.roam < 0) return false
  if (onRegion(map, e.roam, e.x, e.z, e.def.radius)) {
    e.safeX = e.x
    e.safeZ = e.z
  } else if (e.safeX !== undefined && onRegion(map, e.roam, e.safeX, e.safeZ!, e.def.radius)) {
    e.x = e.safeX
    e.z = e.safeZ!
  } else {
    // Never on a good spot yet (a post on a lip): the old rectangle holds it.
    return false
  }
  return true
}
