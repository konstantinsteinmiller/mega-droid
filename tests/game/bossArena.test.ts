import { describe, expect, it, vi } from 'vitest'
import { Group, type BufferGeometry } from 'three'
import { coplanarOverlaps } from './coplanar'
import { BossArena, BLOCKED_ENRAGE, BLIND_ENRAGE, CALM_AFTER, PILLAR_HP, PILLAR_R, PLINTH_R, coverPillarParts, type ArenaHost } from '@/game/sim/bossArena'
import { createNav } from '@/game/world/nav'
import { generateMap } from '@/game/world/levelGen'
import { THEMES } from '@/game/world/themes'
import { bossRoomOf } from '@/game/sim/bosses'
import type { Enemy, Shot } from '@/game/sim/world'

// Every boss arena gets props (pills, a rare gel, one gel a room at most),
// cover pillars that crumble under fire, and the anti-cheese enrage.
const rig = () => {
  const map = generateMap({ seed: 7, rooms: 8, boss: true })
  const room = bossRoomOf(map.rooms)!
  const lobs: Array<[number, number]> = []
  const crates: unknown[] = []
  const nav = createNav(map)
  const host: ArenaHost = {
    nav, map, theme: THEMES.scrapyard,
    fx: { sparks: () => {}, emit: () => {}, orbBurst: () => {}, flash: () => {} } as unknown as ArenaHost['fx'],
    // On the middle column, near a wall: in the open (the pillars stand on
    // the diagonals), so the boss can see Flux.
    player: { x: (room.x0 + room.w / 2) * 3, z: (room.z0 + 1.2) * 3 },
    addArenaCrate: (..._a) => { const c = { arena: false }; crates.push(c); return c as never },
    propParent: () => new Group(),
    lobShell: (_e, tx, tz) => { lobs.push([tx, tz]) },
    sfx: () => {},
    shake: () => {}
  }
  const arena = new BossArena(host, room, 42)
  const boss = { boss: true, x: (room.x0 + room.w / 2) * 3, z: (room.z0 + room.h / 2) * 3, y: 0, dmg: 20, def: { aimY: 1.4 } } as unknown as Enemy
  return { arena, host, lobs, crates, boss, map }
}

describe('boss arena kit', () => {
  it('places 1–3 props and 1–2 cover pillars', () => {
    const { arena, crates } = rig()
    expect(crates.length).toBeGreaterThanOrEqual(1)
    expect(crates.length).toBeLessThanOrEqual(3)
    expect(arena.pillars.length).toBeGreaterThanOrEqual(1)
    expect(arena.pillars.length).toBeLessThanOrEqual(2)
  })

  it('props pay pills, and at most one Repair Gel a room', () => {
    const { arena } = rig()
    vi.spyOn(Math, 'random').mockReturnValue(0)
    expect(arena.drop()).toBe('tank')
    expect(arena.drop()).not.toBe('tank')
    vi.restoreAllMocks()
  })

  it('a pillar crumbles after PILLAR_HP boss hits', () => {
    const { arena, boss } = rig()
    const c = arena.pillars[0]!
    for (let k = 0; k < PILLAR_HP; k++) arena.shotBlocked({ source: boss, x: c.p.x, z: c.p.z } as unknown as Shot)
    expect(c.p.gone).toBe(true)
  })

  it('two blocked boss attacks in a row enrage it; a clear view calms it', () => {
    const { arena, boss, lobs } = rig()
    for (let k = 0; k < BLOCKED_ENRAGE; k++) arena.shotBlocked({ source: boss, x: -99, z: -99 } as unknown as Shot)
    expect(arena.update(0.1, boss)).toBe(true)
    for (let k = 0; k < 20; k++) arena.update(0.1, boss)
    expect(lobs.length).toBeGreaterThan(0)
    // The test room is open: the boss sees Flux, and calms after CALM_AFTER.
    for (let t = 0; t < CALM_AFTER + 0.3; t += 0.1) arena.update(0.1, boss)
    expect(arena.enraged).toBe(false)
  })

  it('a landed attack breaks the run', () => {
    const { arena, boss } = rig()
    arena.shotBlocked({ source: boss, x: -99, z: -99 } as unknown as Shot)
    arena.attackLanded()
    arena.shotBlocked({ source: boss, x: -99, z: -99 } as unknown as Shot)
    expect(arena.update(0.1, boss)).toBe(false)
    expect(BLIND_ENRAGE).toBeGreaterThan(CALM_AFTER)
  })
})

describe('cover pillar geometry', () => {
  const parts = coverPillarParts(THEMES.scrapyard)
  const box = (g: BufferGeometry) => { g.computeBoundingBox(); return g.boundingBox! }

  it('its plinth stays inside a round footprint just wider than the shaft: no corners stick out', () => {
    const [shaft, , plinth] = parts
    const pos = plinth!.getAttribute('position')
    let far = 0
    for (let i = 0; i < pos.count; i++) far = Math.max(far, Math.hypot(pos.getX(i), pos.getZ(i)))
    expect(far).toBeLessThanOrEqual(PLINTH_R + 1e-4)
    // A collar, not a slab: at most 20 cm wider than the shaft all round.
    expect(far - PILLAR_R).toBeLessThanOrEqual(0.2)
    // The shaft stands on the plinth, its foot hidden inside it.
    expect(box(shaft!).min.y).toBeLessThan(box(plinth!).max.y)
    expect(box(shaft!).min.y).toBeGreaterThan(0)
  })

  it('has no coplanar overlapping faces', () => {
    expect(coplanarOverlaps(parts)).toBe(0)
  })

  it('stands on the floor: its foot at y = 0', () => {
    expect(Math.min(...parts.map(g => box(g).min.y))).toBeCloseTo(0, 3)
  })
})
