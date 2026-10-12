// Every door stands in its room's wall: a corridor ends on the wall line of
// the room it opens into, never inside it. Rotor Run's flight-deck corridor
// ran a cell into the deck, so its door stood one cell inside the room and
// the corridor cell behind it belonged to no room (the level mesh drew
// nothing there until `cellOwners` learned to adopt such orphans). This pins
// the layout at its source, before that fallback: every stage, every seed.

import { describe, expect, it } from 'vitest'
import { generateStage } from '@/game/world/stages'
import { generateClimb } from '@/game/world/climbGen'
import { generateWakeUpCall } from '@/game/world/stages/tutorial'
import { Cell, type MapData } from '@/game/world/levelGen'
import type { SectorId } from '@/game/world/themes'

const STAGES: SectorId[] = ['blaze', 'cryo', 'volt', 'gale', 'magnet', 'drill', 'tide', 'neon', 'rotor', 'fortress']

/** Problems with a map's doors and cell owners (empty: none). */
const audit = (m: MapData): string[] => {
  const out: string[] = []
  const K = (i: number, j: number) => j * m.w + i
  for (const d of m.doors) {
    const di = d.axis === 'x' ? d.dir : 0
    const dj = d.axis === 'z' ? d.dir : 0
    // The door cell is the corridor's own; the next cell is the room's.
    if (m.cell[K(d.i, d.j)] !== Cell.Corridor) out.push(`door ${d.id} (${d.i}, ${d.j}): inside room ${m.room[K(d.i, d.j)]}, not at its wall`)
    if (m.room[K(d.i + di, d.j + dj)] !== d.to) out.push(`door ${d.id} (${d.i}, ${d.j}): the cell past it is not room ${d.to}`)
  }
  // Every walkable cell owned by a room, or by a corridor walked back from a door.
  const owned = new Uint8Array(m.w * m.h)
  for (let k = 0; k < owned.length; k++) if (m.room[k]! >= 0) owned[k] = 1
  for (const d of m.doors) {
    const di = d.axis === 'x' ? -d.dir : 0
    const dj = d.axis === 'z' ? -d.dir : 0
    for (let i = d.i, j = d.j, n = 0; m.cell[K(i, j)] === Cell.Corridor && n < 20; i += di, j += dj, n++) owned[K(i, j)] = 1
  }
  for (let k = 0; k < owned.length; k++) {
    if (m.cell[k] !== Cell.Void && !owned[k]) out.push(`cell (${k % m.w}, ${Math.floor(k / m.w)}): walkable, owned by no room`)
  }
  return out
}

describe('doors stand in their room\'s wall', () => {
  for (const sector of STAGES) {
    it(`${sector}: every seed`, () => {
      for (let seed = 0; seed < 16; seed++) expect(audit(generateStage(sector, seed)), `${sector} #${seed}`).toEqual([])
    })
  }
  it('the Tower Run and the tutorial', () => {
    for (let seed = 0; seed < 16; seed++) expect(audit(generateClimb(seed)), `tower #${seed}`).toEqual([])
    expect(audit(generateWakeUpCall(1)), 'tutorial').toEqual([])
  })
})
