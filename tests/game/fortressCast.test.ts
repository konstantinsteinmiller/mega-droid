// @vitest-environment jsdom
// The Vex Fortress's cast (#144): the final stage is meant to be the hardest.
// Its regular machines come in 1.5–2× the first draft's numbers (26) and take
// three times the health the sector's formula gives them (`stageFoeHpMul`,
// applied with the mission's `toughen`); the gates' mini-bosses (the
// Gatekeeper, the Twin Masters) take twice theirs; Vex and a challenge room's
// mini-boss keep theirs, and no other stage changes. Every
// new post stands on real floor inside its room, never in a doorway, on a
// vent, under a rockfall or on a ladder's foot.

import { describe, expect, it, vi } from 'vitest'

vi.mock('@/game/world/textures', async (orig) => {
  const { Texture } = await import('three')
  return { ...(await orig<object>()), levelAtlas: () => new Texture(), glowTexture: () => new Texture(), ringTexture: () => new Texture() }
})
import { CELL, Cell, type MapData } from '@/game/world/levelGen'
import { groundAt } from '@/game/world/nav'
import { generateVexFortress } from '@/game/world/stages/fortress'
import { stageFoeHpMul, STAGE_FOE_HP, STAGE_GATE_HP } from '@/game/sim/adaptive'
import { spawnClimb } from '@/game/sim/climbSpawn'
import { createEnemy } from '@/game/sim/enemies'
import { SECTOR_BY_ID } from '@/game/data/regions'
import type { SectorId } from '@/game/world/themes'

const SEEDS = Array.from({ length: 16 }, (_, i) => (i * 2654435761 + 1013904223) >>> 0)
/** The first draft's regular machines (the gates' mini-bosses left out). */
const OLD_REGULAR = 26
const MINI = new Set(['gatekeeper', 'echo'])
const cellOf = (m: MapData, x: number, z: number): [number, number] => [Math.floor(x / CELL), Math.floor(z / CELL)]

describe('the Vex Fortress cast (#144)', () => {
  it('three times the health for its regular machines, twice for its gates, on its story stage only', () => {
    expect(STAGE_FOE_HP.fortress).toBe(3)
    expect(STAGE_GATE_HP.fortress).toBe(2)
    const reg = { boss: false, kind: 'warden' }
    expect(stageFoeHpMul('fortress', reg)).toBe(3)
    expect(stageFoeHpMul('fortress', { boss: false, kind: 'hornet' })).toBe(3)
    expect(stageFoeHpMul('fortress', { boss: false, kind: 'turret' })).toBe(3)
    // The gates' mini-bosses: twice.
    expect(stageFoeHpMul('fortress', { boss: false, kind: 'gatekeeper' })).toBe(2)
    expect(stageFoeHpMul('fortress', { boss: false, kind: 'echo' })).toBe(2)
    // Vex, a challenge room's mini-boss and its brood.
    expect(stageFoeHpMul('fortress', { boss: true, kind: 'boss' })).toBe(1)
    expect(stageFoeHpMul('fortress', { boss: false, mini: true, kind: 'miniboss' })).toBe(1)
    expect(stageFoeHpMul('fortress', { boss: false, kind: 'hornet' }, true)).toBe(1)
    // Not a story stage (a job, a Tower Run in the sector), or another stage.
    expect(stageFoeHpMul(undefined, reg)).toBe(1)
    for (const id of Object.keys(SECTOR_BY_ID) as SectorId[]) {
      if (id === 'fortress') continue
      expect(stageFoeHpMul(id, reg), id).toBe(1)
      expect(stageFoeHpMul(id, { boss: false, kind: 'gatekeeper' }), id).toBe(1)
    }
  })

  it('its spawned machines carry 3× the formula\'s health; its gates\' mini-bosses do not', async () => {
    const m = generateVexFortress(1)
    const table = SECTOR_BY_ID.fortress.encounters
    const cast = await spawnClimb(m, table, 35)
    let regular = 0
    for (const e of cast) {
      const base = createEnemy(e.kind, 35, e.x, e.z, e.room, { element: table.element, echo: e.echoOf ?? undefined }).maxHp
      const mul = stageFoeHpMul('fortress', e, m.rooms[e.room]?.role === 'challenge')
      if (MINI.has(e.kind)) expect(mul).toBe(2)
      else { expect(mul).toBe(3); regular++ }
      expect(Math.round(base * mul)).toBe(base * mul)
    }
    expect(regular).toBeGreaterThanOrEqual(OLD_REGULAR * 1.5)
  })

  it('1.5–2× the machines, every seed; the gates keep their mini-bosses alone', () => {
    for (const seed of SEEDS) {
      const m = generateVexFortress(seed)
      const t = m.terrain!
      const regular = t.foes.filter(f => !MINI.has(f.kind ?? ''))
      expect(regular.length, `seed ${seed}`).toBeGreaterThanOrEqual(OLD_REGULAR * 1.5)
      expect(regular.length, `seed ${seed}`).toBeLessThanOrEqual(OLD_REGULAR * 2)
      for (const g of t.guards!) expect(regular.filter(f => f.room === g)).toEqual([])
      // No fighting room is down to a lone machine any more.
      for (const r of m.rooms) {
        if (r.role !== 'combat' || t.guards!.includes(r.id) || t.bossStages!.includes(r.id)) continue
        const n = regular.filter(f => f.room === r.id).length
        if (n) expect(n, `seed ${seed}: room ${r.id} (${t.sections[r.id]})`).toBeGreaterThanOrEqual(2)
      }
    }
  })

  it('every post stands on real floor in its room: off doorways, vents, rockfalls, ladders and boulders', () => {
    for (const seed of SEEDS.slice(0, 4)) {
      const m = generateVexFortress(seed)
      const t = m.terrain!
      const taken = new Set<string>()
      const vents = new Set((t.vents ?? []).map(v => `${v.i},${v.j}`))
      const falls = new Set((t.icicles ?? []).map(v => `${v.i},${v.j}`))
      const rocks = new Set((t.icePillars ?? []).map(v => `${v.i},${v.j}`))
      const ladders = new Set(t.ladders.flatMap(L => [`${L.i},${L.j}`, `${L.i + L.di},${L.j + L.dj}`]))
      for (const f of t.foes) {
        const [i, j] = cellOf(m, f.x, f.z)
        const k = j * m.w + i
        const where = `seed ${seed}: ${f.kind ?? f.role} at ${i},${j}`
        expect(m.cell[k], where).not.toBe(Cell.Void)
        expect(m.navBlock[k], where).toBeFalsy()
        // A drone may hover over a gap (one always did, over the light bridges).
        if (f.role !== 'flyer') {
          expect(t.pit[k], where).toBeFalsy()
          expect(groundAt(m, f.x, f.z), where).toBe(f.y)
        }
        const r = m.rooms[f.room]!
        expect(i >= r.x0 && i < r.x0 + r.w && j >= r.z0 && j < r.z0 + r.h, where).toBe(true)
        // Its leash stays inside its room.
        const [x0, z0, x1, z1] = f.leash
        expect(x0 >= r.x0 * CELL && x1 <= (r.x0 + r.w) * CELL && z0 >= r.z0 * CELL && z1 <= (r.z0 + r.h) * CELL, where).toBe(true)
        for (const d of m.doors) expect(Math.abs(d.i - i) + Math.abs(d.j - j) <= 1, `${where}: in a doorway`).toBe(false)
        expect(vents.has(`${i},${j}`) || falls.has(`${i},${j}`) || rocks.has(`${i},${j}`) || ladders.has(`${i},${j}`), `${where}: on a hazard`).toBe(false)
        expect(taken.has(`${i},${j}`), `${where}: two on one cell`).toBe(false)
        taken.add(`${i},${j}`)
      }
    }
  })

  it('a checkpoint in every fighting section and health on the way, so a fall is a retry', () => {
    const m = generateVexFortress(0)
    const t = m.terrain!
    for (const f of t.foes) expect(t.checkpoints.some(c => c.room === f.room), `room ${f.room}`).toBe(true)
    expect(t.rewards.filter(r => r.kind === 'hp').length).toBeGreaterThanOrEqual(2)
  })
})
