// @vitest-environment jsdom
import { it } from 'vitest'
import { generateClimb } from '@/game/world/climbGen'
import { CELL } from '@/game/world/levelGen'
import { createNav } from '@/game/world/nav'
it('dbg', () => {
  const m = generateClimb(3); const t = m.terrain!
  const ci = Math.floor(79 / CELL), cj = Math.floor(7.5 / CELL)
  for (let j = cj - 3; j <= cj + 3; j++) {
    let row = ''
    for (let i = ci - 6; i <= ci + 4; i++) { const k = j * m.w + i; row += (m.cell[k] === 0 ? '   ##' : t.pit[k] ? '   PP' : String(t.floor[k]).padStart(5)) }
    console.log(j, row)
  }
  console.log('ci', ci, 'cj', cj, (createNav(m).plats ?? []).filter(p => p.x1 > 60 && p.x0 < 90 && p.z0 < 20).map(p => JSON.stringify(p)).join('\n'))
})
