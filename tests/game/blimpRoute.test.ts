// The ad blimp over the city (#170): it used to sail at one height round a
// ring that crossed the tall far band and the landmarks, and clipped through
// towers now and then. Its route is now bent round the tether and the launch
// column and lifted over every tower near it. This checks it against the
// city's REAL triangles (not the bounds the route was planned with), over its
// whole loop, for several maps and both quality tiers.

import { describe, expect, it } from 'vitest'
import { Box3, InstancedMesh, Matrix4, Mesh, Triangle, Vector3 } from 'three'
import { generateMap } from '@/game/world/levelGen'
import { generateClimb } from '@/game/world/climbGen'
import { THEMES } from '@/game/world/themes'
import { buildCityscape } from '@/game/world/cityscape'
import type { MapData } from '@/game/world/levelGen'

const GRID = 16

/** Every static city triangle, bucketed by the xz cells its box covers. */
const cityTriangles = (meshes: Mesh[]) => {
  const tris: Triangle[] = []
  const boxes: Box3[] = []
  const cells = new Map<string, number[]>()
  const a = new Vector3()
  const b = new Vector3()
  const c = new Vector3()
  for (const mesh of meshes) {
    mesh.updateMatrixWorld()
    const pos = mesh.geometry.attributes.position!
    const idx = mesh.geometry.index
    const n = idx ? idx.count : pos.count
    for (let i = 0; i < n; i += 3) {
      const at = (k: number, v: Vector3) => v.fromBufferAttribute(pos, idx ? idx.getX(i + k) : i + k).applyMatrix4(mesh.matrixWorld)
      at(0, a); at(1, b); at(2, c)
      const t = new Triangle(a.clone(), b.clone(), c.clone())
      const box = new Box3().setFromPoints([t.a, t.b, t.c])
      const id = tris.length
      tris.push(t)
      boxes.push(box)
      for (let gx = Math.floor(box.min.x / GRID); gx <= Math.floor(box.max.x / GRID); gx++) {
        for (let gz = Math.floor(box.min.z / GRID); gz <= Math.floor(box.max.z / GRID); gz++) {
          const key = `${gx},${gz}`
          const list = cells.get(key)
          if (list) list.push(id)
          else cells.set(key, [id])
        }
      }
    }
  }
  return { tris, boxes, cells }
}

const check = async (map: MapData, quality: 'full' | 'low') => {
  const city = await buildCityscape(map, THEMES.gale, undefined, quality)
  city.stream(Infinity)
  const statics = city.root.children.filter((o): o is Mesh => o instanceof Mesh && !(o instanceof InstancedMesh))
  const fleets = city.root.children.filter((o): o is InstancedMesh => o instanceof InstancedMesh)
  const blimp = fleets.find(f => f.name === 'blimp')!
  expect(blimp).toBeTruthy()
  const { tris, boxes, cells } = cityTriangles(statics)
  expect(tris.length).toBeGreaterThan(1000)
  blimp.geometry.computeBoundingBox()
  const local = blimp.geometry.boundingBox!
  const m = new Matrix4()
  const box = new Box3()
  const other = new Box3()
  const start = new Vector3()
  const p = new Vector3()
  let laps = 0
  let travelled = 0
  let prev: Vector3 | null = null
  // Long enough for a full loop at its 4 m/s.
  for (let t = 0; t < 600; t += 0.5) {
    city.update(t)
    blimp.getMatrixAt(0, m)
    // Not in the sky yet (the traffic trickles in).
    if (blimp.count === 0 || (m.elements[0] === 0 && m.elements[5] === 0)) continue
    p.setFromMatrixPosition(m)
    if (!prev) start.copy(p)
    else travelled += p.distanceTo(prev)
    prev = p.clone()
    box.copy(local).applyMatrix4(m)
    const seen = new Set<number>()
    for (let gx = Math.floor(box.min.x / GRID); gx <= Math.floor(box.max.x / GRID); gx++) {
      for (let gz = Math.floor(box.min.z / GRID); gz <= Math.floor(box.max.z / GRID); gz++) {
        for (const id of cells.get(`${gx},${gz}`) ?? []) {
          if (seen.has(id)) continue
          seen.add(id)
          if (!boxes[id]!.intersectsBox(box)) continue
          expect(box.intersectsTriangle(tris[id]!), `blimp at t=${t} (${p.x.toFixed(0)}, ${p.y.toFixed(0)}, ${p.z.toFixed(0)}) cuts the skyline`).toBe(false)
        }
      }
    }
    // Nor through other traffic (the rockets, the freighter).
    for (const f of fleets) {
      if (f === blimp) continue
      f.geometry.computeBoundingBox()
      for (let i = 0; i < f.count; i++) {
        f.getMatrixAt(i, m)
        if (m.elements[0] === 0 && m.elements[5] === 0) continue
        other.copy(f.geometry.boundingBox!).applyMatrix4(m)
        expect(other.intersectsBox(box), `blimp meets other traffic at t=${t}: ${f.geometry.boundingBox!.max.toArray()} at ${new Vector3().setFromMatrixPosition(m).toArray().map(Math.round)} vs ${p.toArray().map(Math.round)}`).toBe(false)
      }
    }
  }
  laps = travelled
  city.dispose()
  return laps
}

describe('the ad blimp', () => {
  it('never clips a building, a landmark or other traffic over its whole loop', async () => {
    const maps = [generateMap({ seed: 5, rooms: 8, boss: true }), generateMap({ seed: 9, rooms: 10, boss: false }), generateClimb(4)]
    for (const map of maps) {
      for (const q of ['full', 'low'] as const) {
        // At 4 m/s for 600 s it covers 2400 m: more than one loop of its ring.
        expect(await check(map, q)).toBeGreaterThan(2000)
      }
    }
  }, 120_000)
})
