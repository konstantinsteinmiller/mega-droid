// Every ramp of every platform stage is walked up to its landing by Flux's
// real body (`moveBody` with PLAYER_R, the climb's floor snap): a storey in
// one cell is a slope of 1, and measured from the feet a body's radius back
// down it, the flush landing at its top stood more than STEP_UP over them —
// the drained Tide lock's exit stair was a wall (playtest 2026-10-11).
import { describe, expect, it } from 'vitest'
import { CELL, Cell, Ramp, cellCenter, type MapData } from '@/game/world/levelGen'
import { createNav, floorAt, moveBody, STEP_UP } from '@/game/world/nav'
import { generateStage } from '@/game/world/stages'
import { mirrorX } from '@/game/world/stages/builder'
import { PLAYER_R } from '@/game/sim/constants'
import type { SectorId } from '@/game/world/themes'

const STAGES: SectorId[] = ['blaze', 'cryo', 'volt', 'gale', 'magnet', 'drill', 'tide', 'neon', 'rotor', 'fortress']
const UP: Record<number, [number, number]> = { [Ramp.PX]: [1, 0], [Ramp.NX]: [-1, 0], [Ramp.PZ]: [0, 1], [Ramp.NZ]: [0, -1] }

/** Walk a body from the middle of ramp cell k straight uphill for a while:
 *  where it ends (its cell) and its feet. */
const walkUp = (m: MapData, nav: ReturnType<typeof createNav>, k: number): { cell: number; y: number } => {
  const t = m.terrain!
  const i = k % m.w
  const j = (k - i) / m.w
  const [ux, uz] = UP[t.ramp[k]!]!
  let x = cellCenter(i)
  let z = cellCenter(j)
  let y = floorAt(nav, x, z)
  const out: [number, number] = [0, 0]
  const dt = 1 / 60
  for (let n = 0; n < 36; n++) {
    moveBody(nav, x, z, y, ux * 5 * dt, uz * 5 * dt, PLAYER_R, out)
    x = out[0]
    z = out[1]
    const sup = floorAt(nav, x, z, y)
    if (sup > -Infinity && sup <= y + STEP_UP + 1e-6) y = sup
  }
  return { cell: Math.floor(z / CELL) * m.w + Math.floor(x / CELL), y }
}

describe('ramps', () => {
  it('every ramp is walked up onto the landing at its top (the real body, not its middle)', () => {
    for (const sector of STAGES) {
      for (const seed of [1, 7]) {
        for (const m of [generateStage(sector, seed), mirrorX(generateStage(sector, seed))]) {
          const t = m.terrain!
          const nav = createNav(m)
          for (let k = 0; k < m.cell.length; k++) {
            const r = t.ramp[k]
            if (!r || t.pit[k]) continue
            const i = k % m.w
            const j = (k - i) / m.w
            const [ux, uz] = UP[r]!
            const nk = (j + uz) * m.w + i + ux
            // A landing the ramp meets flush (another ramp carries on: its own check).
            if (m.cell[nk] === Cell.Void || t.pit[nk] || t.ramp[nk] || m.navBlock[nk]) continue
            if (Math.abs(t.floor[nk]! - (t.floor[k]! + t.rise[k]!)) > 0.01) continue
            const end = walkUp(m, nav, k)
            expect(end.cell, `${sector} ${seed}: ramp (${i}, ${j}) onto (${i + ux}, ${j + uz})`).toBe(nk)
            expect(end.y).toBeCloseTo(t.floor[nk]!, 3)
          }
        }
      }
    }
  })
})
