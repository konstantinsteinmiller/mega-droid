// @vitest-environment jsdom
// The level meshes' wall pipes (#156). A thick capsule a cell and a bit long,
// at head height and 0.2 m off its wall: its rounded ends hung in mid-air past
// the wall's end or poked into the next wall, and walking along the wall it
// filled the top third of the view (Neon, Rotor, the supply run). The rule:
// a pipe hugs its wall, stays inside its own wall edge with both ends turning
// back into the wall, and runs over everyone's head — on every level type.

import { describe, expect, it, vi } from 'vitest'

vi.mock('@/game/world/textures', async (orig) => {
  const { Texture } = await import('three')
  return { ...(await orig<object>()), levelAtlas: () => new Texture() }
})

interface PipeCall { mx: number; mz: number; n: readonly [number, number, number]; y: number; alongX: boolean }
const calls: PipeCall[] = []
vi.mock('@/game/world/wallPipe', async (orig) => {
  const real = await orig<typeof import('@/game/world/wallPipe')>()
  return {
    ...real,
    wallPipe: (mx: number, mz: number, n: readonly [number, number, number], y: number, alongX: boolean, color: string, clamp: string) => {
      calls.push({ mx, mz, n, y, alongX })
      return real.wallPipe(mx, mz, n, y, alongX, color, clamp)
    }
  }
})

import { BufferAttribute, Vector3, type BufferGeometry } from 'three'
import { CELL, Cell, generateMap, type MapData } from '@/game/world/levelGen'
import { buildLevel } from '@/game/world/levelMesh'
import { buildClimbLevel } from '@/game/world/climbMesh'
import { generateStage } from '@/game/world/stages'
import { THEMES, type SectorId } from '@/game/world/themes'
import { PIPE_END, PIPE_MIN_Y, PIPE_OFF, PIPE_R, wallPipe, wallPipeY } from '@/game/world/wallPipe'
import { coplanarOverlaps } from './coplanar'

const verts = (parts: BufferGeometry[]): Vector3[] => parts.flatMap(g => {
  const pos = g.getAttribute('position') as BufferAttribute
  return Array.from({ length: pos.count }, (_, i) => new Vector3().fromBufferAttribute(pos, i))
})

const NORMALS: Array<[[number, number, number], boolean]> = [
  [[1, 0, 0], false], [[-1, 0, 0], false], [[0, 0, 1], true], [[0, 0, -1], true]
]

describe('a wall pipe', () => {
  for (const [n, alongX] of NORMALS) {
    it(`facing ${n.join(',')}: on its wall, inside its edge, both ends back in the wall`, () => {
      const mx = 10.5
      const mz = -4.5
      const y = 3.2
      const parts = wallPipe(mx, mz, n, y, alongX, '#3ff4ff', '#222233')
      const vs = verts(parts)
      const along = (v: Vector3) => alongX ? v.x - mx : v.z - mz
      const out = (v: Vector3) => (v.x - mx) * n[0] + (v.z - mz) * n[2]
      for (const v of vs) {
        // Hugging the wall: never more than a hand's width out of it (its
        // clamp a little proud of the pipe).
        expect(out(v)).toBeLessThan(PIPE_OFF + PIPE_R + 0.07)
        // Inside its own edge, clear of the corner pilasters (r 0.3).
        expect(Math.abs(along(v))).toBeLessThan(CELL / 2 - 0.3)
        // Level: nothing of it (its clamp) hangs much lower than the pipe.
        expect(v.y).toBeGreaterThan(y - PIPE_R - 0.07)
      }
      // Each end turns back into the wall: geometry at or behind its face.
      const ends = [-1, 1].map(s => vs.filter(v => s * along(v) > CELL / 2 - PIPE_END - PIPE_R - 0.02))
      for (const e of ends) {
        expect(e.length).toBeGreaterThan(0)
        expect(Math.min(...e.map(out))).toBeLessThanOrEqual(0)
      }
      expect(coplanarOverlaps(parts)).toBe(0)
    })
  }

  it('runs over head height, under the wall\'s top trim, or not at all', () => {
    for (const u of [0, 0.5, 1]) {
      for (const [fy, top, lift] of [[0, 4.2, 0], [3, 7.2, 0], [0, 6, 1.5], [-2, 2.2, 0]] as const) {
        const y = wallPipeY(fy, top, u, lift)
        if (y === null) continue
        expect(y - fy - lift).toBeGreaterThanOrEqual(PIPE_MIN_Y)
        expect(y + PIPE_R).toBeLessThan(top - 0.3)
      }
    }
    // A wall too low for one over head height gets none.
    expect(wallPipeY(0, 2.8, 0.5)).toBeNull()
  })
})

/** Every pipe the level mesh laid: on a wall over its own floor, high enough. */
const audit = (m: MapData, label: string): number => {
  const floorAt = (i: number, j: number): number => {
    const t = m.terrain
    const k = j * m.w + i
    return t ? t.floor[k]! + (t.ramp[k] ? t.rise[k]! : 0) : 0
  }
  for (const c of calls) {
    const at = `${label}: pipe at (${c.mx.toFixed(1)}, ${c.y.toFixed(2)}, ${c.mz.toFixed(1)})`
    // The cell it faces, and the one behind its wall.
    const i = Math.floor((c.mx + c.n[0] * 0.5) / CELL)
    const j = Math.floor((c.mz + c.n[2] * 0.5) / CELL)
    const bi = Math.floor((c.mx - c.n[0] * 0.5) / CELL)
    const bj = Math.floor((c.mz - c.n[2] * 0.5) / CELL)
    expect(m.cell[j * m.w + i], `${at}: faces a walkable cell`).not.toBe(Cell.Void)
    // Never across a walkway: behind it is the void, or a secret's walled
    // alcove (a wall between them all the same), never more open floor.
    const behind = bi >= 0 && bj >= 0 && bi < m.w && bj < m.h ? m.cell[bj * m.w + bi] : Cell.Void
    if (behind !== Cell.Void) {
      const secretOf = (k: number) => (m.terrain?.secrets ?? []).findIndex(s => s.cells.includes(k))
      expect(secretOf(bj * m.w + bi) !== secretOf(j * m.w + i), `${at}: walkway behind it`).toBe(true)
    }
    // Over head height on its floor.
    expect(c.y - floorAt(i, j), `${at}: over head height`).toBeGreaterThanOrEqual(PIPE_MIN_Y)
  }
  return calls.length
}

describe('the built level: every wall pipe over head height, on its wall', () => {
  const STAGES: SectorId[] = ['neon', 'rotor', 'magnet', 'fortress']
  for (const sector of STAGES) {
    it(`${sector}`, async () => {
      let n = 0
      for (const seed of [1, 3]) {
        calls.length = 0
        const m = generateStage(sector, seed)
        await buildClimbLevel(m, THEMES[sector])
        n += audit(m, `${sector} #${seed}`)
      }
      expect(n, `${sector}: some pipes laid`).toBeGreaterThan(0)
    }, 120_000)
  }

  it('the labyrinth', async () => {
    let n = 0
    for (const seed of [1, 2]) {
      calls.length = 0
      const m = generateMap({ seed, rooms: 8, boss: true })
      await buildLevel(m, THEMES.fortress)
      n += audit(m, `labyrinth #${seed}`)
    }
    expect(n).toBeGreaterThan(0)
  }, 60_000)
})
