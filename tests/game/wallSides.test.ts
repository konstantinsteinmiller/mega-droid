// @vitest-environment jsdom
// A wall reads solid from both sides. Playtest 2026-10-12 (Blackout
// Boulevard, near the arena approach): from inside a room its wall was dark
// panels, vents and light strips; from the room before it, over that room's
// own lower wall, only the posts and the top rail stood there and the room
// behind showed through the gaps. Every wall was one face, facing its own
// cell, culled from behind. The rule: every wall between a walkable cell and
// the void has a face toward the walkable side AND one toward the void side,
// at its full height, on every level type; and a room that can see a wall's
// outside draws the room that owns it.

import { describe, expect, it, vi } from 'vitest'

vi.mock('@/game/world/textures', async (orig) => {
  const { Texture } = await import('three')
  return { ...(await orig<object>()), levelAtlas: () => new Texture() }
})

import { BufferAttribute, Group, Mesh, Vector3, type BufferGeometry } from 'three'
import { CELL, Cell, generateMap, type MapData } from '@/game/world/levelGen'
import { buildLevel, buildWallPlug, cellOwners, WALL_T } from '@/game/world/levelMesh'
import { buildClimbLevel } from '@/game/world/climbMesh'
import { generateStage } from '@/game/world/stages'
import { generateClimb } from '@/game/world/climbGen'
import { generateWakeUpCall } from '@/game/world/stages/tutorial'
import { roomSight } from '@/game/world/roomSight'
import { THEMES, type SectorId } from '@/game/world/themes'
import { coplanarOverlaps } from './coplanar'

const STAGES: SectorId[] = ['blaze', 'cryo', 'volt', 'gale', 'magnet', 'drill', 'tide', 'neon', 'rotor', 'fortress']
const SEEDS = [1, 2, 4242]
const themeOf = (s: SectorId) => THEMES[s]

/** A vertical wall triangle: its plane (x = c or z = c), its facing (±1),
 *  and its outline in the plane's own (along, y) frame. */
interface WallTri { axis: 'x' | 'z'; c: number; facing: number; p: Array<[number, number]> }

/** The textured floor-and-wall batch of every room group (the one mesh with
 *  the level atlas): the walls themselves, not their trim. */
const wallTris = (rooms: Group[]): Map<string, WallTri[]> => {
  const out = new Map<string, WallTri[]>()
  const a = new Vector3()
  const b = new Vector3()
  const c = new Vector3()
  for (const g of rooms) {
    g.traverse(o => {
      const m = o as Mesh
      if (!m.isMesh || !(m.material as { map?: unknown }).map) return
      const geo = m.geometry as BufferGeometry
      const pos = geo.getAttribute('position') as BufferAttribute
      const idx = geo.getIndex()!
      for (let t = 0; t < idx.count; t += 3) {
        a.fromBufferAttribute(pos, idx.getX(t))
        b.fromBufferAttribute(pos, idx.getX(t + 1))
        c.fromBufferAttribute(pos, idx.getX(t + 2))
        const n = new Vector3().subVectors(b, a).cross(new Vector3().subVectors(c, a))
        if (n.length() < 1e-6) continue
        n.normalize()
        const axis = Math.abs(n.x) > 0.99 ? 'x' : Math.abs(n.z) > 0.99 ? 'z' : null
        if (!axis) continue
        const coord = axis === 'x' ? a.x : a.z
        const along = (v: Vector3): [number, number] => [axis === 'x' ? v.z : v.x, v.y]
        const tri: WallTri = { axis, c: coord, facing: Math.sign(axis === 'x' ? n.x : n.z), p: [along(a), along(b), along(c)] }
        const key = `${axis}${Math.round(coord / CELL)}`
        const l = out.get(key) ?? []
        l.push(tri)
        out.set(key, l)
      }
    })
  }
  return out
}

const inTri = (p: Array<[number, number]>, u: number, y: number): boolean => {
  const s = (a: [number, number], b: [number, number]) => (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (u - a[0])
  const d0 = s(p[0]!, p[1]!)
  const d1 = s(p[1]!, p[2]!)
  const d2 = s(p[2]!, p[0]!)
  const neg = d0 < -1e-6 || d1 < -1e-6 || d2 < -1e-6
  const pos = d0 > 1e-6 || d1 > 1e-6 || d2 > 1e-6
  return !(neg && pos)
}

interface Miss { where: string; side: 'inside' | 'outside' }

/**
 * Every wall edge (a walkable cell beside the void) of a built level: a ray
 * from each side at points along it and up it must meet a face turned toward
 * that side, within a wall's thickness of the wall line.
 */
const wallMisses = (map: MapData, rooms: Group[]): { walls: number; misses: Miss[] } => {
  const tris = wallTris(rooms)
  const t = map.terrain
  const W = map.w
  const walk = (i: number, j: number) => i >= 0 && j >= 0 && i < W && j < map.h && map.cell[j * W + i] !== Cell.Void
  const misses: Miss[] = []
  let walls = 0
  for (let j = 0; j < map.h; j++) {
    for (let i = 0; i < W; i++) {
      const k = j * W + i
      if (!walk(i, j)) continue
      // Over open sky a gap's outer edge is open by design: no wall there.
      if (t?.clouds && t.pit[k]) continue
      const floor = t ? (t.pit[k] ? t.pitBottom[map.room[k]!]! : t.floor[k]! + (t.ramp[k] ? t.rise[k]! : 0)) : 0
      const top = t ? (map.room[k]! >= 0 ? t.wallTop[map.room[k]!]! : t.floor[k]! + 5) : 4.2
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        if (walk(i + di, j + dj)) continue
        walls++
        const axis = di ? 'x' : 'z'
        const line = di ? (i + (di > 0 ? 1 : 0)) * CELL : (j + (dj > 0 ? 1 : 0)) * CELL
        const a0 = di ? j * CELL : i * CELL
        const list = tris.get(`${axis}${Math.round(line / CELL)}`) ?? []
        const out = di || dj
        for (const side of ['inside', 'outside'] as const) {
          // The face seen from inside points back into the cell (−out),
          // the one seen from outside points out into the void (+out).
          const want = side === 'inside' ? -out : out
          let ok = true
          for (const s of [0.1, 0.5, 0.9]) {
            for (const f of [0.04, 0.5, 0.96]) {
              const u = a0 + s * CELL
              const y = floor + (top - floor) * f
              const hit = list.some(tr => tr.facing === want && (tr.c - line) * out >= -0.01 && (tr.c - line) * out <= WALL_T + 0.01 && inTri(tr.p, u, y))
              if (!hit) ok = false
            }
          }
          if (!ok) misses.push({ where: `cell ${i},${j} → ${di},${dj} (room ${map.room[k]})`, side })
        }
      }
    }
  }
  return { walls, misses }
}

const levels: Array<{ name: string; map: () => MapData; theme: SectorId }> = [
  ...STAGES.flatMap(s => SEEDS.map(seed => ({ name: `${s}/${seed}`, map: () => generateStage(s, seed), theme: s }))),
  ...SEEDS.map(seed => ({ name: `tower run/${seed}`, map: () => generateClimb(seed), theme: 'scrapyard' as SectorId })),
  ...SEEDS.map(seed => ({ name: `wake-up call/${seed}`, map: () => generateWakeUpCall(seed), theme: 'scrapyard' as SectorId }))
]

describe('walls read solid from both sides', () => {
  it('every stage, the Tower Run and the tutorial: each wall has a face toward its room and one toward the void, full height', async () => {
    const report: string[] = []
    for (const lv of levels) {
      const map = lv.map()
      const meshes = await buildClimbLevel(map, themeOf(lv.theme))
      const { walls, misses } = wallMisses(map, meshes.rooms)
      expect(walls, lv.name).toBeGreaterThan(20)
      report.push(`${lv.name}: ${walls} walls, ${misses.length} missing`)
      expect(misses.slice(0, 5), `${lv.name}: ${misses.length} of ${walls} wall faces missing`).toEqual([])
    }
  }, 300_000)

  it('the labyrinth (with its boss room and a challenge room): each wall has both faces', async () => {
    for (const seed of SEEDS) {
      for (const spec of [{ seed, rooms: 8, boss: true }, { seed, rooms: 6, boss: false, challenge: true }]) {
        const map = generateMap(spec)
        const meshes = await buildLevel(map, themeOf('fortress'))
        const { walls, misses } = wallMisses(map, meshes.rooms)
        expect(walls, `labyrinth ${JSON.stringify(spec)}`).toBeGreaterThan(20)
        expect(misses.slice(0, 5), `labyrinth ${JSON.stringify(spec)}: ${misses.length} of ${walls}`).toEqual([])
      }
    }
  }, 60_000)

  it('a corridor\'s wall plug has a face on each side', () => {
    for (const axis of ['x', 'z'] as const) {
      for (const n of [1, -1] as const) {
        const g = buildWallPlug(themeOf('fortress'), axis, n, 9)
        const tris = [...wallTris([g]).values()].flat()
        for (const want of [n, -n]) {
          for (const y of [0.2, 4.5, 8.8]) {
            for (const u of [-1.2, 0, 1.2]) {
              expect(tris.some(tr => tr.axis === axis && tr.facing === want && inTri(tr.p, u, y)), `${axis}/${n} facing ${want} at ${u},${y}`).toBe(true)
            }
          }
        }
      }
    }
  })

  it('no wall\'s outer face lies in the plane of another face turned the same way', async () => {
    for (const lv of [levels[0]!, levels.find(l => l.name === 'neon/1')!, levels.find(l => l.name === 'tower run/1')!]) {
      const meshes = await buildClimbLevel(lv.map(), themeOf(lv.theme))
      // Each room's wall batch against every other room's (two rooms' outer
      // faces meet across the void between them).
      const parts: BufferGeometry[] = []
      for (const g of meshes.rooms) {
        const m = g.children.find(o => (o as Mesh).isMesh && ((o as Mesh).material as { map?: unknown }).map) as Mesh | undefined
        if (m) parts.push(m.geometry as BufferGeometry)
      }
      expect(coplanarOverlaps(parts), lv.name).toBe(0)
    }
  }, 60_000)

  it('a room that sees a wall\'s outside draws the room that owns it', () => {
    // Over the walls by their real tops (a door is a WALL_H panel in its
    // gap), from a standing eye in every cell: if a sight line reaches the
    // outer face of another room's wall, near its top or its ends, that
    // room is on the looker's sight list (portal culling draws it).
    for (const s of STAGES) {
      const map = generateStage(s, 1)
      const own = cellOwners(map)
      const sight = roomSight(map, own, { far: 86 })
      const t = map.terrain!
      const W = map.w
      const H = map.h
      const walk = (i: number, j: number) => i >= 0 && j >= 0 && i < W && j < H && map.cell[j * W + i] !== Cell.Void
      const topOf = (k: number) => (map.room[k]! >= 0 ? t.wallTop[map.room[k]!]! : t.floor[k]! + 5)
      const stand = (k: number) => (t.pit[k] ? -Infinity : t.floor[k]!)
      // How high the grid line between cells a and b stops a sight line:
      // a wall by its top, a ledge by its floor, a door by its panel.
      const edgeH = (ia: number, ja: number, ib: number, jb: number): number => {
        const wa = walk(ia, ja)
        const wb = walk(ib, jb)
        let h = -Infinity
        if (wa !== wb) {
          const k = wa ? ja * W + ia : jb * W + ib
          if (!(t.clouds && t.pit[k])) h = topOf(k)
        } else if (wa) h = Math.max(stand(ja * W + ia), stand(jb * W + ib))
        for (const d of map.doors) {
          const ni = d.i + (d.axis === 'x' ? d.dir : 0)
          const nj = d.j + (d.axis === 'z' ? d.dir : 0)
          if ((d.i === ia && d.j === ja && ni === ib && nj === jb) || (d.i === ib && d.j === jb && ni === ia && nj === ja)) {
            h = Math.max(h, t.floor[d.j * W + d.i]! + 4.2)
          }
        }
        return h
      }
      /** A straight line from e to p, grid line by grid line. */
      const clear = (ex: number, ey: number, ez: number, px: number, py: number, pz: number): boolean => {
        let i = Math.floor(ex / CELL)
        let j = Math.floor(ez / CELL)
        const ti = Math.floor(px / CELL)
        const tj = Math.floor(pz / CELL)
        const dx = px - ex
        const dz = pz - ez
        const si = Math.sign(dx)
        const sj = Math.sign(dz)
        let nx = dx > 0 ? ((i + 1) * CELL - ex) / dx : dx < 0 ? (i * CELL - ex) / dx : Infinity
        let nz = dz > 0 ? ((j + 1) * CELL - ez) / dz : dz < 0 ? (j * CELL - ez) / dz : Infinity
        const sx = dx !== 0 ? CELL / Math.abs(dx) : Infinity
        const sz = dz !== 0 ? CELL / Math.abs(dz) : Infinity
        while (i !== ti || j !== tj) {
          const f = Math.min(nx, nz)
          if (f > 1) break
          const y = ey + (py - ey) * f
          if (nx < nz) {
            if (y < edgeH(i, j, i + si, j)) return false
            i += si
            nx += sx
          } else {
            if (y < edgeH(i, j, i, j + sj)) return false
            j += sj
            nz += sz
          }
        }
        return true
      }
      // The outer faces' sample points: near the top, at the middle and
      // toward both ends of each wall edge, just outside the wall.
      const targets: Array<{ o: number; x: number; y: number; z: number }> = []
      for (let j = 0; j < H; j++) {
        for (let i = 0; i < W; i++) {
          const k = j * W + i
          if (!walk(i, j) || (t.clouds && t.pit[k]) || own[k]! < 0) continue
          for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
            if (walk(i + di, j + dj)) continue
            for (const s of [0.15, 0.5, 0.85]) {
              const x = di ? (i + 0.5 + di * 0.5) * CELL + di * (WALL_T + 0.1) : (i + s) * CELL
              const z = dj ? (j + 0.5 + dj * 0.5) * CELL + dj * (WALL_T + 0.1) : (j + s) * CELL
              targets.push({ o: own[k]!, x, y: topOf(k) - 0.4, z })
            }
          }
        }
      }
      const missing: string[] = []
      const seen = new Set<string>()
      for (let j = 0; j < H; j += 1) {
        for (let i = 0; i < W; i += 1) {
          const k = j * W + i
          const r = own[k]!
          if (!walk(i, j) || t.pit[k] || r < 0 || ((i + j) & 1)) continue
          const ex = (i + 0.5) * CELL
          const ez = (j + 0.5) * CELL
          const ey = t.floor[k]! + 1.45
          for (const g of targets) {
            if (g.o === r || sight[r]!.includes(g.o) || seen.has(`${r}→${g.o}`)) continue
            // Inside the fog (the list reaches 86 m, the fog fades all by then).
            if (Math.hypot(g.x - ex, g.z - ez) > 80) continue
            if (clear(ex, ey, ez, g.x, g.y, g.z)) {
              seen.add(`${r}→${g.o}`)
              missing.push(`room ${r} (eye over cell ${i},${j}) sees room ${g.o}'s wall at ${g.x.toFixed(1)}, ${g.y.toFixed(1)}, ${g.z.toFixed(1)}`)
            }
          }
        }
      }
      expect(missing, `${s}/1: rooms that see another room's wall but do not draw it`).toEqual([])
    }
  }, 120_000)
})
