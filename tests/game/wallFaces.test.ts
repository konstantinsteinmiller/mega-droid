// @vitest-environment jsdom
// No two wall or floor faces of a level occupy one plane and overlap (#201):
// that is the flicker that shimmers as the camera moves (z-fighting). One real
// cause is pinned here: a tall pit wall is built in bands, and a band whose top
// edge sat BELOW zero was taken for "the last band" and ran on to the wall's
// top, over the bands above it — every pit deeper than the floor (the Blaze
// stage's shaft, lift room and arena) showed three or four walls in one place.
// The guard reads the level's own quads (the batch meshes) of every stage, the
// Tower Run and the labyrinth, each shrunk a little so faces that merely meet
// at an edge are not counted.

import { describe, expect, it, vi } from 'vitest'
import { BufferAttribute, BufferGeometry, type Mesh } from 'three'

vi.mock('@/game/world/textures', async (orig) => {
  const { Texture } = await import('three')
  return { ...(await orig<object>()), levelAtlas: () => new Texture(), glowTexture: () => new Texture(), ringTexture: () => new Texture() }
})

import { buildClimbLevel } from '@/game/world/climbMesh'
import { buildLevel, type LevelMeshes } from '@/game/world/levelMesh'
import { generateStage, isStageSector } from '@/game/world/stages'
import { generateClimb } from '@/game/world/climbGen'
import { generateMap } from '@/game/world/levelGen'
import { THEMES, type SectorId } from '@/game/world/themes'
import { coplanarPairs } from './coplanar'

/** The level's quads, one part each, shrunk 3 % toward their centre. */
const quads = (level: LevelMeshes): BufferGeometry[] => {
  level.root.updateMatrixWorld(true)
  const parts: BufferGeometry[] = []
  for (const room of level.rooms) {
    room.traverse((o) => {
      const m = o as Mesh
      if (!m.isMesh || !m.geometry) return
      const g = m.geometry as BufferGeometry
      // The level's own batch: toon-lit quads with UVs (the decor's outline twin is the same geometry again).
      if (!g.getAttribute('uv') || (m.material as { type?: string }).type !== 'MeshToonMaterial') return
      const pos = g.getAttribute('position') as BufferAttribute
      const idx = g.getIndex()
      if (!idx) return
      for (let i = 0; i + 5 < idx.count; i += 6) {
        const ids = [idx.getX(i), idx.getX(i + 1), idx.getX(i + 2), idx.getX(i + 5)]
        const cg = new BufferGeometry()
        const arr = new Float32Array(12)
        ids.forEach((id, q) => { arr[q * 3] = pos.getX(id); arr[q * 3 + 1] = pos.getY(id); arr[q * 3 + 2] = pos.getZ(id) })
        cg.setAttribute('position', new BufferAttribute(arr, 3))
        cg.setIndex([0, 1, 2, 0, 2, 3])
        cg.applyMatrix4(m.matrixWorld)
        const p = cg.getAttribute('position') as BufferAttribute
        const cx = (p.getX(0) + p.getX(1) + p.getX(2) + p.getX(3)) / 4
        const cy = (p.getY(0) + p.getY(1) + p.getY(2) + p.getY(3)) / 4
        const cz = (p.getZ(0) + p.getZ(1) + p.getZ(2) + p.getZ(3)) / 4
        for (let q = 0; q < 4; q++) p.setXYZ(q, cx + (p.getX(q) - cx) * 0.97, cy + (p.getY(q) - cy) * 0.97, cz + (p.getZ(q) - cz) * 0.97)
        parts.push(cg)
      }
    })
  }
  return parts
}

const STAGES = (Object.keys(THEMES) as SectorId[]).filter(isStageSector)

describe('no two faces of a level fight for one plane', () => {
  it.each(STAGES)('%s stage', async (sector) => {
    const map = generateStage(sector, 1)
    const bad = coplanarPairs(quads(await buildClimbLevel(map, THEMES[sector])))
    expect(bad.map(b => `${b.at.x.toFixed(1)},${b.at.y.toFixed(1)},${b.at.z.toFixed(1)}`).slice(0, 5), `${sector}: ${bad.length} overlaps`).toEqual([])
  }, 60_000)

  it('Tower Run', async () => {
    const bad = coplanarPairs(quads(await buildClimbLevel(generateClimb(5), THEMES.scrapyard)))
    expect(bad.length).toBe(0)
  }, 60_000)

  it('labyrinth', async () => {
    const bad = coplanarPairs(quads(await buildLevel(generateMap({ seed: 9, rooms: 9, boss: true }), THEMES.scrapyard)))
    expect(bad.length).toBe(0)
  }, 60_000)

  it('a pit wall deeper than the floor is built in bands that meet, never overlap', async () => {
    // The Blaze stage's shaft: walls from the pit's bottom (below 0) to the room's top.
    const map = generateStage('blaze', 1)
    const parts = quads(await buildClimbLevel(map, THEMES.blaze))
    // Any wall quad reaching from below zero to above it in one piece, over a band of its own, is the old bug.
    const tall = parts.filter((g) => {
      const p = g.getAttribute('position') as BufferAttribute
      const ys = [0, 1, 2, 3].map(i => p.getY(i))
      return Math.max(...ys) - Math.min(...ys) > 4.2 * 1.2 && Math.min(...ys) < -0.5
    })
    expect(tall.length).toBe(0)
  }, 60_000)
})
