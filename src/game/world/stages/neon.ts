import { CELL, Ramp, cellCenter, type MapData } from '../levelGen'
import { mulberry32 } from '../rng'
import { Builder, finish, mirrorX, YAW_PX, YAW_NX, YAW_PZ, YAW_NZ } from './builder'

/**
 * ─── Blackout Boulevard (the neon sector's story stage) ──────────────────────
 *
 * The Neon Master's rooftops at night, 12 m over the streets (open air:
 * a fall is Atlas's rescue). Its gimmick is light (`sim/stages/neon.ts`):
 * bridges of light are floor only while lit — some blink on the clock
 * (flickering first), some answer a switch that swaps which of two is lit.
 * And a secret: a wall-kick shaft (slide at its foot, facing the wall, and
 * again, and again) up to the borrowed weapon.
 *
 *   1 Rooftop pad     the pad; a Glow Stalker (the stage's machine)
 *   2 First light     two blinking bridges between three roofs
 *   3 Stalker alley   a fight among vents
 *   4 The switch      lit bridge to a middle roof; shoot the switch for
 *                     the next one (and the first goes dark)
 *   5 Billboard drop  down a storey; a Searchlight Drone (the stage's
 *                     second machine) over the upper roof
 *   6 Roof garden     a fight; the wall-kick shaft up to the weapon ledge;
 *                     a Searchlight Drone over the Stalkers
 *   7 Blink run       two pulse bridges in a row: out with the blackout
 *   8 Neon gallery    a fight among billboards, a Searchlight Drone over it
 *   9 Switch gauntlet the switch again, a Stalker on the middle roof
 *  10 Fire escape     two flights down
 *  11 Gutter leaps    one-cell gaps between low roofs
 *  12 Sign shop       a secret alcove behind its north wall
 *  13 Approach        down to the boss shutter: a Stalker, a Rotor Drone
 *                     and a Searchlight Drone
 *  14 Arena           the Neon Master, floor at y = 0
 *
 * The SEARCHLIGHT DRONE (#142, `sim/enemies.ts`): met alone on the
 * Billboard Drop's upper roof (the Stalker below waits on its own level),
 * where its light, its lock and the strike it calls can be learned; then
 * over the Stalkers in the Roof Garden (the tower block hides Flux), in the
 * Neon Gallery (billboards, a Wall Cannon) and on the Approach — in the dark
 * its light sweeps faster.
 *
 * And the BLACKOUT (#110): every BLACKOUT_PERIOD s the whole boulevard goes
 * dark (a two-dip warning and a power-down whine first), and the Blink Run's
 * pulse bridges go out with it. The light is the longest part of the cycle,
 * and a pulse bridge is crossed well inside it; the boss arena keeps its lights.
 *
 * Every leap gap is one cell between equal floors, each with its `link`.
 * Deterministic from the seed: the hand and the bridges' rhythm vary —
 * never the route.
 */

const GRID_W = 34
const GRID_H = 49
const ROOF_Y = 12
const STOREY = 3
/** Vents and billboards stand this high over a roof (m). */
const COVER_H = 2.5

export const generateBlackoutBoulevard = (seed: number): MapData => {
  const rng = mulberry32(seed ^ 0x4e0b1)
  const b = new Builder(GRID_W, GRID_H)
  // The blackout (#110): `sim/lightPulse.ts`'s BLACKOUT rhythm — a 1 s warning,
  // 2 s dark, 6 s light. A fixed phase: no draw, the rest of the stage rolls
  // exactly as before.
  b.blackout = { period: 9, warn: 1, dark: 2, phase: 0 }
  const island = (i0: number, j0: number, i1: number, j1: number, y: number) => {
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) b.pit[b.k(i, j)] = 0
    b.level(i0, j0, i1, j1, y)
  }
  const leaps = (i: number, j: number, di: number, dj: number, span: number[], back = false) => {
    for (const s of span) {
      const fi = di ? i : s
      const fj = di ? s : j
      b.link([fi, fj], [fi + di * 2, fj + dj * 2], 'leap')
      if (back) b.link([fi + di * 2, fj + dj * 2], [fi, fj], 'leap')
    }
  }
  const cells = (i0: number, j0: number, i1: number, j1: number): Array<[number, number]> => {
    const out: Array<[number, number]> = []
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) out.push([i, j])
    return out
  }
  const sw = (i: number, j: number, side: 'n' | 's' | 'e' | 'w') => { b.neonSwitches.push({ i, j, side, room: b.rooms.length - 1 }) }
  const M = ROOF_Y - STOREY
  const LOW = ROOF_Y - 3 * STOREY

  // ── 1 Rooftop pad ─────────────────────────────────────────────────────────
  b.addRoom(1, 1, 6, 5, 'start', 'dock', ROOF_Y)
  b.checkpoint(2, 3, YAW_PX, cells(1, 2, 2, 4))
  b.foe('ground', 4, 4, YAW_NX, [3, 3, 6, 5], undefined, 'stalker')
  b.corridor(7, 2, 1, 0, 2, ROOF_Y)

  // ── 2 First light ─────────────────────────────────────────────────────────
  // Three roofs, a three-cell gap between each two, a bridge of light over
  // each blinking on the clock, half a beat apart.
  b.addRoom(9, 1, 12, 4, 'combat', 'islands', ROOF_Y)
  b.pits(9, 1, 20, 4)
  island(9, 1, 10, 4, ROOF_Y)
  island(14, 1, 15, 4, ROOF_Y)
  island(19, 1, 20, 4, ROOF_Y)
  const p1 = 4 + rng() * 0.8
  b.bridge(11, 2, ROOF_Y, 3, 2, { period: p1, phase: 0, on: p1 * 0.62 })
  b.bridge(16, 2, ROOF_Y, 3, 2, { period: p1, phase: p1 / 2, on: p1 * 0.62 })
  b.rewards.push({ x: cellCenter(15), z: cellCenter(4), y: ROOF_Y, room: 1, kind: 'bolts' })
  b.checkpoint(9, 2, YAW_PX, cells(9, 1, 10, 4))
  b.checkpoint(14, 2, YAW_PX, cells(14, 1, 15, 4))
  b.foe('flyer', 17, 1, YAW_NX, [9, 1, 20, 4], [ROOF_Y, ROOF_Y + 2])
  b.foe('ground', 19, 3, YAW_NX, [19, 1, 20, 4], undefined, 'stalker')
  b.corridor(21, 2, 1, 0, 2, ROOF_Y)

  // ── 3 Stalker alley ───────────────────────────────────────────────────────
  b.addRoom(23, 1, 8, 5, 'combat', 'hall', ROOF_Y)
  b.level(25, 2, 25, 2, ROOF_Y + COVER_H)
  b.level(28, 4, 28, 4, ROOF_Y + COVER_H)
  b.chest(23, 5, YAW_NX)
  b.checkpoint(24, 3, YAW_PX, cells(23, 2, 24, 4))
  b.foe('ground', 27, 3, YAW_NX, [26, 1, 30, 5], undefined, 'stalker')
  b.foe('ground', 29, 2, YAW_NX, [26, 1, 30, 5], undefined, 'stalker')
  b.foe('turret', 30, 5, YAW_NX, [30, 5, 30, 5])
  b.corridor(28, 6, 0, 1, 2, ROOF_Y)

  // ── 4 The switch ──────────────────────────────────────────────────────────
  // A chasm with a roof in its middle. The lit bridge (magenta) reaches it;
  // the switch on the east wall lights the far one (cyan) — and darkens
  // the first. It hangs on the near roof's wall, at the chasm's edge: over
  // the gap itself there is no wall (open sky), and it hung in the air there
  // (playtest 2026-10-12).
  b.addRoom(24, 8, 8, 8, 'combat', 'islands', ROOF_Y)
  b.pits(24, 10, 31, 13)
  island(27, 11, 28, 12, ROOF_Y)
  b.bridge(27, 10, ROOF_Y, 2, 1, { group: 0 })
  b.bridge(27, 13, ROOF_Y, 2, 1, { group: 1 })
  sw(31, 9, 'e')
  b.checkpoint(28, 8, YAW_PZ, cells(26, 8, 30, 9))
  b.checkpoint(28, 15, YAW_PZ, cells(26, 14, 30, 15))
  b.foe('flyer', 25, 12, YAW_PZ, [24, 8, 31, 15], [ROOF_Y, ROOF_Y + 2])
  b.corridor(28, 16, 0, 1, 2, ROOF_Y)

  // ── 5 Billboard drop ──────────────────────────────────────────────────────
  b.addRoom(24, 18, 8, 5, 'combat', 'descent', ROOF_Y)
  b.level(24, 18, 26, 22, M)
  b.checkpoint(29, 20, YAW_NX, cells(28, 19, 31, 21))
  b.checkpoint(25, 20, YAW_NX, cells(24, 19, 26, 21))
  b.foe('ground', 25, 22, YAW_NX, [24, 18, 26, 22], undefined, 'stalker')
  // The Searchlight Drone's first showing, alone over the upper roof (it
  // took the Wall Cannon's place: one floor marker to read at a time)
  b.foe('flyer', 30, 21, YAW_NX, [27, 18, 31, 22], [ROOF_Y, ROOF_Y], 'spotter')
  b.corridor(23, 20, -1, 0, 2, M)

  // ── 6 Roof garden ─────────────────────────────────────────────────────────
  // A water tower's block stands two storeys over the garden; on its top
  // the borrowed weapon. Its south face is a wall-kick shaft.
  b.addRoom(13, 14, 9, 9, 'combat', 'hall', M)
  b.level(16, 14, 18, 16, M + 2 * STOREY)
  b.ladders.push({ i: 17, j: 17, di: 0, dj: -1, y0: M, y1: M + 2 * STOREY, side: true, kick: true })
  b.rewards.push({ x: cellCenter(17), z: cellCenter(14), y: M + 2 * STOREY, room: 5, kind: 'weapon' })
  b.rewards.push({ x: cellCenter(16), z: cellCenter(15), y: M + 2 * STOREY, room: 5, kind: 'hp' })
  b.checkpoint(20, 20, YAW_NX, cells(19, 19, 21, 21))
  b.foe('ground', 14, 20, YAW_PX, [13, 17, 21, 22], undefined, 'stalker')
  b.foe('ground', 20, 18, YAW_NX, [13, 17, 21, 22], undefined, 'stalker')
  b.foe('flyer', 17, 21, YAW_PX, [13, 17, 21, 22], [M, M], 'spotter')
  b.corridor(12, 20, -1, 0, 2, M)

  // ── 7 Blink run ───────────────────────────────────────────────────────────
  b.addRoom(1, 17, 10, 6, 'combat', 'islands', M)
  b.pits(1, 17, 10, 22)
  island(9, 17, 10, 22, M)
  island(5, 17, 6, 22, M)
  island(1, 17, 2, 22, M)
  rng() // (the old blink rhythm's draw, kept so the rest of the stage rolls the same)
  b.bridge(7, 19, M, 2, 2, { pulse: true })
  b.bridge(3, 19, M, 2, 2, { pulse: true })
  b.checkpoint(10, 20, YAW_NX, cells(9, 18, 10, 21))
  b.checkpoint(6, 20, YAW_NX, cells(5, 18, 6, 21))
  b.checkpoint(2, 20, YAW_PZ, cells(1, 18, 2, 21))
  b.foe('flyer', 5, 17, YAW_NX, [1, 17, 10, 22], [M, M + 2])
  b.foe('ground', 1, 22, YAW_PZ, [1, 17, 2, 22], undefined, 'stalker')
  b.corridor(2, 23, 0, 1, 2, M)

  // ── 8 Neon gallery ────────────────────────────────────────────────────────
  b.addRoom(1, 25, 10, 5, 'combat', 'hall', M)
  b.level(4, 27, 4, 27, M + COVER_H)
  b.level(7, 26, 7, 26, M + COVER_H)
  b.chest(1, 29, YAW_NX)
  b.checkpoint(2, 26, YAW_PZ, cells(1, 25, 3, 26))
  b.foe('ground', 5, 28, YAW_PX, [3, 25, 10, 29], undefined, 'stalker')
  b.foe('ground', 8, 27, YAW_NX, [3, 25, 10, 29], undefined, 'stalker')
  b.foe('flyer', 6, 26, YAW_NX, [1, 25, 10, 29], [M, M + 2], 'spotter')
  b.foe('turret', 10, 29, YAW_NX, [10, 29, 10, 29])
  b.corridor(11, 27, 1, 0, 2, M)

  // ── 9 Switch gauntlet ─────────────────────────────────────────────────────
  b.addRoom(13, 25, 10, 5, 'combat', 'islands', M)
  b.pits(13, 25, 22, 29)
  island(13, 25, 14, 29, M)
  island(17, 25, 18, 29, M)
  island(21, 25, 22, 29, M)
  b.bridge(15, 27, M, 2, 1, { group: 0 })
  b.bridge(19, 27, M, 2, 1, { group: 1 })
  sw(17, 25, 'n')
  b.checkpoint(14, 27, YAW_PX, cells(13, 26, 14, 28))
  b.checkpoint(18, 28, YAW_PX, cells(17, 28, 18, 29))
  b.foe('ground', 18, 26, YAW_PX, [17, 25, 18, 29], undefined, 'stalker')
  b.foe('flyer', 20, 26, YAW_NX, [13, 25, 22, 29], [M, M + 2])
  b.corridor(23, 27, 1, 0, 2, M)

  // ── 10 Fire escape ────────────────────────────────────────────────────────
  b.addRoom(25, 25, 8, 8, 'combat', 'descent', M)
  for (let i = 25; i <= 32; i++) b.stair(i, 28, Ramp.NZ, M - STOREY, STOREY)
  b.level(25, 29, 32, 30, M - STOREY)
  for (let i = 25; i <= 32; i++) b.stair(i, 31, Ramp.NZ, LOW, STOREY)
  b.level(25, 32, 32, 32, LOW)
  b.checkpoint(27, 26, YAW_PZ, cells(26, 25, 30, 26))
  b.checkpoint(29, 32, YAW_PZ, cells(26, 32, 31, 32))
  b.foe('ground', 30, 30, YAW_NZ, [25, 29, 32, 30], undefined, 'stalker')
  b.foe('turret', 32, 25, YAW_NX, [32, 25, 32, 25])
  b.corridor(28, 33, 0, 1, 2, LOW)

  // ── 11 Gutter leaps ───────────────────────────────────────────────────────
  b.addRoom(23, 35, 10, 4, 'combat', 'islands', LOW)
  b.pits(23, 35, 32, 38)
  island(28, 35, 32, 38, LOW)
  island(25, 35, 26, 38, LOW)
  island(23, 35, 23, 38, LOW)
  leaps(28, 0, -1, 0, [36, 37])
  leaps(25, 0, -1, 0, [36, 37])
  b.checkpoint(30, 36, YAW_NX, cells(29, 35, 32, 38))
  b.checkpoint(25, 36, YAW_NX, cells(25, 36, 26, 37))
  b.foe('flyer', 27, 37, YAW_NX, [23, 35, 32, 38], [LOW, LOW + 2])
  b.corridor(22, 36, -1, 0, 2, LOW)

  // ── 12 Sign shop ──────────────────────────────────────────────────────────
  // Behind the north wall, a secret alcove (shoot the buttons).
  b.addRoom(12, 34, 9, 5, 'combat', 'hall', LOW)
  b.chest(20, 34, YAW_PX)
  b.checkpoint(19, 36, YAW_NX, cells(19, 35, 20, 37))
  b.foe('ground', 16, 36, YAW_PX, [13, 34, 18, 38], undefined, 'stalker')
  // A beam from the east wall, three mirrors to the target by the false
  // wall, each found once the one before it is turned (#143).
  b.secret(11, 'mirror', [12, 33, 13, 33], { i: 13, j: 33, axis: 'z' }, [], [], 'tank', undefined,
    { emitter: [20, 38, 'e'], mirrors: [[17, 38, 1], [17, 35, 1], [14, 35, 1]] })
  b.corridor(11, 36, -1, 0, 2, LOW)

  // ── 13 Approach ───────────────────────────────────────────────────────────
  b.addRoom(1, 34, 9, 5, 'combat', 'hall', 0)
  b.level(6, 34, 9, 38, LOW)
  for (let j = 34; j <= 38; j++) b.stair(5, j, Ramp.PX, 0, LOW)
  b.checkpoint(8, 36, YAW_NX, cells(7, 35, 9, 37))
  b.checkpoint(2, 37, YAW_PZ, cells(1, 36, 3, 38))
  b.foe('ground', 2, 35, YAW_PZ, [1, 34, 4, 38], undefined, 'stalker')
  b.foe('flyer', 7, 37, YAW_NX, [1, 34, 9, 38], [0, LOW])
  b.foe('flyer', 3, 37, YAW_PX, [1, 34, 9, 38], [0, LOW], 'spotter')
  b.corridor(3, 39, 0, 1, 2, 0, true)

  // ── 14 Arena ──────────────────────────────────────────────────────────────
  b.addRoom(1, 41, 7, 7, 'boss', 'arena', 0)

  // The beam-in room: south of the pad, its door into it.
  b.beamRoom(3, 7, 4, 3, 5, 6, 0, -1, 1)
  // The weapon lesson room behind the boss, where the grid has room for it.
  b.exitRoom()
  // The challenge room (`sim/challenge.ts`): south off the gutter leaps'
  // first roof, a walled rooftop hall at its height — the door is beside
  // Flux as he comes down the fire escape; the way on is west, over the gaps.
  b.challengeRoom(10, { mouth: { i: 29, j: 38, di: 0, dj: 1 } })
  const map = finish(b, { x: cellCenter(4) + CELL / 2, z: cellCenter(8), yaw: YAW_NZ }, seed)
  // Open air under the roofs: a fall is the rescue's, not a spike pit.
  map.terrain!.clouds = true
  return rng() < 0.5 ? mirrorX(map) : map
}
