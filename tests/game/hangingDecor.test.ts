// Nothing hangs from nothing (playtest 2026-10-16: a stalactite's rock cap
// hung over a Deep Mine room with open sky above it). Every stage that drops
// stalactites or icicles, many seeds: each one's root is set into a real roof
// mesh — the same room group (portal culling hides them together), covering
// its cell, just over the root — and that roof is closed from above as well
// as below (a lid under the wall tops), so it never shows against the sky.
import { describe, expect, it } from 'vitest'
import { Box3, Group, Mesh, Scene, type Object3D } from 'three'
import { createNav } from '@/game/world/nav'
import { THEMES } from '@/game/world/themes'
import { SECTOR_BY_ID } from '@/game/data/regions'
import { Icicles } from '@/game/sim/stages/icicles'
import { generateStage, isStageSector } from '@/game/world/stages'
import { cellOwners } from '@/game/world/levelMesh'
import { CELL, type MapData } from '@/game/world/levelGen'
import type { ClimbHost } from '@/game/sim/climb'

const SEEDS = Array.from({ length: 16 }, (_, i) => (i * 2654435761 + 1013904223) >>> 0)

const hostFor = (m: MapData, groups: Group[], scene: Scene): ClimbHost => {
  const owner = cellOwners(m)
  const noop = () => {}
  return {
    nav: createNav(m), map: m, theme: THEMES[m.theme as keyof typeof THEMES] ?? THEMES.drill,
    combat: { maxHp: 100 }, fx: { sparks: noop }, markers: { spawn: noop }, shocks: { spawn: noop },
    hitPlayer: () => 'hit', sfx: noop, shake: noop, onPickup: noop,
    propParent: (x: number, z: number) => {
      const o = owner[Math.floor(z / CELL) * m.w + Math.floor(x / CELL)] ?? -1
      return o >= 0 ? groups[o]! : scene
    },
    scene, time: 0, level: { root: new Group(), rooms: groups, sky: null, bounds: [], owner },
    enemyLevel: 1, encounters: SECTOR_BY_ID.drill.encounters, addEnemy: noop, say: noop
  } as unknown as ClimbHost
}

/** A mesh's faces facing up (+y) and down (−y), by their normals. */
const facing = (o: Object3D): { up: boolean; down: boolean } => {
  let up = false
  let down = false
  o.traverse(c => {
    if (!(c instanceof Mesh)) return
    const n = c.geometry.getAttribute('normal')
    for (let i = 0; i < n.count; i++) {
      if (n.getY(i) > 0.9) up = true
      if (n.getY(i) < -0.9) down = true
    }
  })
  return { up, down }
}

describe('hanging decor', () => {
  it('every stalactite and icicle on every stage hangs flush from a roof closed above and below', () => {
    let seen = 0
    for (const sec of Object.keys(SECTOR_BY_ID)) {
      if (!isStageSector(sec as never)) continue
      for (const seed of SEEDS) {
        const m = generateStage(sec as never, seed)
        if (!m.terrain?.icicles?.length) continue
        const scene = new Scene()
        const groups = m.rooms.map(() => new Group())
        const f = new Icicles(hostFor(m, groups, scene), m.terrain)
        for (const c of f.icicles) {
          seen++
          const at = `${sec} ${seed} (${c.def.i},${c.def.j})`
          const parent = c.mesh.parent!
          expect(parent, at).not.toBe(scene)
          const top = new Box3().setFromObject(c.mesh).max.y
          // A roof in the same group, over this cell, the mount's top set into it.
          const roof = parent.children.find(o => {
            if (o === c.mesh || !facing(o).down) return false
            const b = new Box3().setFromObject(o)
            return top > b.min.y && top < b.max.y + 1e-6
              && b.min.x <= c.x - CELL / 2 && b.max.x >= c.x + CELL / 2
              && b.min.z <= c.z - CELL / 2 && b.max.z >= c.z + CELL / 2
          })
          expect(roof, `${at}: no roof over the root`).toBeDefined()
          const b = new Box3().setFromObject(roof!)
          // Closed from above too, and never in the wall tops' plane.
          expect(facing(roof!).up, at).toBe(true)
          expect(b.max.y - b.min.y, at).toBeGreaterThan(0.05)
          const wall = m.terrain.wallTop[m.room[c.def.j * m.w + c.def.i]!]
          if (wall !== undefined && Number.isFinite(wall)) expect(wall - b.max.y, at).toBeGreaterThan(0.02)
        }
      }
    }
    expect(seen).toBeGreaterThan(0)
  })
})
