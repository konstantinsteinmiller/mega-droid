import { describe, expect, it } from 'vitest'
import { generateWakeUpCall, TUTORIAL_STEPS } from '@/game/world/stages/tutorial'
import { planWalkthrough } from '@/game/sim/walkthrough'
import { createNav, floorAt } from '@/game/world/nav'
import { CELL, Cell, cellCenter, corridorMouth } from '@/game/world/levelGen'

// Mission 1 is a built stage: its lessons in a fixed order (charge, crate,
// block, the gap, the chest, the slide), three fighting rooms (two rotor
// drones; a running wheel and a Shield Trooper; a crate golem), the Repair
// Gel corridor into the breather (a whole room between its trap and the boss
// door), and a spiked one-cell gap that only an edge-leap crosses.
describe('Wake-Up Call (the built tutorial)', () => {
  const map = generateWakeUpCall(1)

  it('teaches its rooms in order, then three fighting rooms, the breather right before the boss', () => {
    const plan = planWalkthrough(map)
    expect(plan.gates.map(g => g.steps)).toEqual(TUTORIAL_STEPS)
    expect(map.doors[plan.gates[plan.gates.length - 1]!.door]!.boss).toBe(true)
    expect(map.walkCast!.slice(6, 9)).toEqual([['heli', 'heli'], ['roller', 'trooper'], ['golem']])
  })

  it('puts the Repair Gel corridor into the breather, a whole room before the boss door', () => {
    const plan = planWalkthrough(map)
    expect(plan.gel).not.toBeNull()
    const g = plan.gates[plan.gel!.gate]!
    expect(plan.gates[plan.gel!.gate + 1]!.steps).toContain('rest')
    // The corridor runs long: the plate is well before the door into the breather.
    const door = map.doors[g.door]!
    expect(Math.hypot(cellCenter(door.i) - cellCenter(plan.gel!.spot.i), cellCenter(door.j) - cellCenter(plan.gel!.spot.j))).toBeGreaterThanOrEqual(CELL)
    expect(map.doors[g.door]!.boss).toBeFalsy()
  })

  it('has a spiked one-cell gap with a leap link across it', () => {
    const t = map.terrain!
    const link = t.links!.find(l => l.kind === 'leap')!
    expect(link).toBeTruthy()
    const nav = createNav(map)
    const mid = [(link.from[0] + link.to[0]) / 2, link.from[1]] as const
    expect(floorAt(nav, cellCenter(mid[0]), cellCenter(mid[1]))).toBe(-Infinity)
    expect(floorAt(nav, cellCenter(link.from[0]), cellCenter(link.from[1]))).toBe(0)
    expect(floorAt(nav, cellCenter(link.to[0]), cellCenter(link.to[1]))).toBe(0)
    expect(t.pitKind![map.room[mid[1] * map.w + mid[0]]!]).toBe('spikes')
  })

  it("walls the start room in: the false wall stands in its corridor's mouth, on the room's own wall line", () => {
    const plan = planWalkthrough(map)
    const first = map.doors[plan.gates[0]!.door]!
    const at = corridorMouth(map, first)
    // The start room's east wall, in the middle of the corridor's width, seen from the room (-x).
    const room = map.rooms[first.from]!
    expect(room.role).toBe('start')
    expect(at).toEqual({ x: (room.x0 + room.w) * CELL, z: cellCenter(first.j), axis: 'x', n: -1 })
    // A room cell on the near side, the corridor on the far side: nothing of the way on is left in view.
    const i = Math.floor(at.x / CELL)
    const j = Math.floor(at.z / CELL)
    expect(map.cell[j * map.w + i]).toBe(Cell.Corridor)
    expect(map.cell[j * map.w + i - 1]).toBe(Cell.Room)
    // The door itself is at the corridor's far end, behind it.
    expect(cellCenter(first.i) + CELL / 2).toBeGreaterThan(at.x + CELL)
  })

  it("finds a corridor's mouth for every door, whichever way it runs", () => {
    for (const d of map.doors) {
      const at = corridorMouth(map, d)
      const di = d.axis === 'x' ? at.n : 0
      const dj = d.axis === 'z' ? at.n : 0
      const i = Math.floor((at.x - di * 0.1) / CELL)
      const j = Math.floor((at.z - dj * 0.1) / CELL)
      // Just past the mouth: the corridor. Just before it: the room the door leaves.
      expect(map.cell[j * map.w + i], `door ${d.id}`).toBe(Cell.Corridor)
      expect(map.room[(j + dj) * map.w + i + di], `door ${d.id}`).toBe(d.from)
    }
  })

  it('every room has spots for its cast, and the start pad is in the start room', () => {
    for (const r of map.rooms) expect(r.spots.length, `room ${r.id}`).toBeGreaterThan(4)
    const i = Math.floor(map.start.x / 3)
    const j = Math.floor(map.start.z / 3)
    expect(map.rooms[map.room[j * map.w + i]!]!.role).toBe('start')
  })
})
