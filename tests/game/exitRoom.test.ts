import { describe, expect, it } from 'vitest'
import { generateStage } from '@/game/world/stages'
import { generateWakeUpCall } from '@/game/world/stages/tutorial'
import { CELL, Cell, type MapData } from '@/game/world/levelGen'

// #D26: the weapon copied from a boss is taught right behind its arena, in a
// quiet room with the beam pedestal at its far end. Every Master's stage and
// the tutorial get one; the Fortress (Vex has no weapon to copy) does not.
const MASTERS = ['blaze', 'cryo', 'volt', 'gale', 'magnet', 'drill', 'tide', 'neon', 'rotor'] as const
const SEEDS = [1, 2, 3, 4, 5, 6]

const maps = (): Array<[string, MapData]> => [
  ...MASTERS.flatMap(s => SEEDS.map(seed => [`${s}#${seed}`, generateStage(s, seed)] as [string, MapData])),
  ['tutorial', generateWakeUpCall(1)]
]

describe('the weapon lesson room behind the boss', () => {
  it('every Master stage and the tutorial have one, opening off the arena', () => {
    for (const [name, m] of maps()) {
      const ex = m.exit
      expect(ex, name).toBeDefined()
      const door = m.doors[ex!.door]!
      const arena = m.rooms.find(r => r.role === 'boss')!
      expect(door.from, name).toBe(arena.id)
      expect(door.to, name).toBe(ex!.room)
      expect(door.boss, name).toBe(false)
      // A quiet room: never a spawn room or the objective.
      expect(m.rooms[ex!.room]!.role, name).toBe('start')
      // Its pedestal stands on one of its own floor cells, level with the arena.
      const [pi, pj] = ex!.pad
      expect(m.room[pj * m.w + pi], name).toBe(ex!.room)
      expect(m.cell[pj * m.w + pi], name).toBe(Cell.Room)
      expect(m.terrain!.floor[pj * m.w + pi], name).toBe(0)
      // And a checkpoint of its own.
      expect(m.terrain!.checkpoints.some(c => c.room === ex!.room), name).toBe(true)
    }
  })

  it('the Fortress has none', () => {
    for (const seed of SEEDS) expect(generateStage('fortress', seed).exit).toBeUndefined()
  })

  it('the mirrored hand mirrors the pedestal with its room', () => {
    for (const s of MASTERS) {
      for (const seed of SEEDS) {
        const m = generateStage(s, seed)
        const [pi, pj] = m.exit!.pad
        expect(m.room[pj * m.w + pi], `${s}#${seed}`).toBe(m.exit!.room)
      }
    }
  })
})

// #285 / D16: Flux never beams into a room with machines. Every stage lands
// him in a beam-in room of his own: no machine posted in it, the pad in it,
// and its one way out a door (shut until he walks up to it), so nothing in
// the next room sees him land.
describe('the beam-in pad', () => {
  it('stands in a room of its own with no machine in it, behind a door', () => {
    for (const s of [...MASTERS, 'fortress'] as const) {
      for (const seed of SEEDS) {
        const m = generateStage(s, seed)
        const name = `${s}#${seed}`
        const beam = m.beam
        expect(beam, name).toBeDefined()
        const padRoom = m.room[Math.floor(m.start.z / CELL) * m.w + Math.floor(m.start.x / CELL)]
        expect(padRoom, name).toBe(beam!.room)
        expect(m.terrain!.foes.filter(f => f.room === beam!.room), name).toEqual([])
        expect(m.doors.filter(d => d.from === beam!.room || d.to === beam!.room).map(d => d.id), name).toEqual([beam!.door])
      }
    }
  })
})
