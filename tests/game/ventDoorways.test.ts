import { describe, expect, it } from 'vitest'
import { Cell } from '@/game/world/levelGen'
import { generateStage } from '@/game/world/stages'

// A wall vent's burner sits on the wall between its cell and the one behind
// the jet. Playtest 2026-10-12: in the Vex Fortress's Reactor run one stood in
// the doorway out, a block in the hallway. That wall must be a real wall.
const SECTORS = ['blaze', 'cryo', 'volt', 'gale', 'magnet', 'drill', 'tide', 'neon', 'rotor', 'fortress'] as const

describe('wall vents', () => {
  it('never sit in a doorway or a corridor mouth: behind each is solid', () => {
    let n = 0
    for (const sector of SECTORS) {
      for (const seed of [1, 2, 3, 4]) {
        const m = generateStage(sector, seed)
        for (const v of m.terrain?.vents ?? []) {
          if (v.dx === 0 && v.dz === 0) continue
          n++
          const bi = v.i - v.dx
          const bj = v.j - v.dz
          const behind = bi < 0 || bj < 0 || bi >= m.w || bj >= m.h ? Cell.Void : m.cell[bj * m.w + bi]!
          expect(behind, `${sector} seed ${seed} vent at ${v.i},${v.j} facing ${v.dx},${v.dz}`).toBe(Cell.Void)
        }
      }
    }
    expect(n).toBeGreaterThan(0)
  })
})
