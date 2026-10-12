// @vitest-environment jsdom
// Challenge rooms (an optional mini-boss behind its own door): where they
// hang (the Tower Run, supply runs), that the route never needs them, the
// door shutting behind Flux and opening after the kill, the prize, the
// mini-boss registry, the Cinder Hound's telegraphs, the new models' faces
// (no z-fighting) and the strings in every locale.

import { describe, expect, it, vi } from 'vitest'

// The blob shadow and the telegraph ring draw canvas textures (no 2D canvas
// under jsdom); plain textures stand in.
vi.mock('@/game/world/textures', async (orig) => {
  const { Texture } = await import('three')
  return { ...(await orig<object>()), glowTexture: () => new Texture(), ringTexture: () => new Texture() }
})
import { Mesh, type BufferGeometry } from 'three'
import { generateMap, cellCenter, CELL, Cell, type MapData } from '@/game/world/levelGen'
import { generateClimb } from '@/game/world/climbGen'
import { mirrorX } from '@/game/world/stages/builder'
import { generateStage } from '@/game/world/stages'
import { generateWakeUpCall } from '@/game/world/stages/tutorial'
import { createNav, findPath, hasLineOfSight } from '@/game/world/nav'
import { MINI_BOSSES, MINI_BOSS_IDS, miniBossFor } from '@/game/sim/miniBoss/registry'
import { CINDER_HOUND, LUNGE_TELE, BREATH_TELE, HOWL_TELE, EMBER_FALL, type HoundMem } from '@/game/sim/miniBoss/cinderHound'
import { createMiniBoss, startMiniBoss, updateMiniBoss, MINI_SHATTER_AT } from '@/game/sim/miniBosses'
import { ChallengeRun, type ChallengeReward } from '@/game/sim/challenge'
import {
  challengeBolts, challengeRarityOdds, rollChallengeRarity, challengeItemLevel, mastersBeaten, hasChallengeRoom
} from '@/game/data/challenge'
import { buildDoor, challengeFrameParts } from '@/game/models/props'
import { cinderHoundParts } from '@/game/models/miniBoss/cinderHound'
import { weakSpotOf } from '@/game/data/weakspots'
import { THEMES } from '@/game/world/themes'
import { hud } from '@/game/state/hud'
import { mulberry32 } from '@/game/world/rng'
import en from '@/i18n/locales/en'
import { LANGUAGES } from '@/utils/enums'
import type { Enemy, World } from '@/game/sim/world'
import type { AtlasLine } from '@/game/sim/atlas'
import { coplanarOverlaps } from './coplanar'

const SECTORS = ['blaze', 'cryo', 'volt', 'gale', 'magnet', 'drill', 'tide', 'neon', 'rotor', 'fortress'] as const

const cellsOf = (m: MapData, room: number): Set<number> => {
  const out = new Set<number>()
  for (let k = 0; k < m.room.length; k++) if (m.room[k] === room) out.add(k)
  return out
}
const cellKey = (m: MapData, x: number, z: number) => Math.floor(z / CELL) * m.w + Math.floor(x / CELL)

/** The room is a dead end off the map: one door into it, none out of it. */
const deadEnd = (m: MapData) => {
  const ch = m.challenge!
  expect(m.doors.filter(d => d.to === ch.room).length).toBe(1)
  expect(m.doors.filter(d => d.from === ch.room).length).toBe(0)
  const d = m.doors[ch.door]!
  expect(d.to).toBe(ch.room)
  expect(d.challenge).toBe(true)
  expect(d.boss).toBe(false)
  expect(m.rooms[ch.room]!.role).toBe('challenge')
}

describe('the challenge room in a supply run (a labyrinth)', () => {
  const maps: MapData[] = []
  for (let seed = 1; seed <= 60; seed++) maps.push(generateMap({ seed: seed * 7919, rooms: 6 + (seed % 7), boss: false, challenge: true }))

  it('is there on nearly every map, as a dead end off a combat or treasure room', () => {
    const withRoom = maps.filter(m => m.challenge)
    expect(withRoom.length).toBeGreaterThanOrEqual(54)
    for (const m of withRoom) {
      deadEnd(m)
      const host = m.rooms[m.doors[m.challenge!.door]!.from]!
      expect(['combat', 'treasure']).toContain(host.role)
    }
  })

  it('never stands on the way to the objective, and can be walked into', () => {
    for (const m of maps.filter(x => x.challenge)) {
      const nav = createNav(m)
      const inside = cellsOf(m, m.challenge!.room)
      const goal = m.rooms.find(r => r.role === 'objective')!
      const path = findPath(nav, m.start.x, m.start.z, cellCenter(goal.x0 + Math.floor(goal.w / 2)), cellCenter(goal.z0 + Math.floor(goal.h / 2)), 4000)
      expect(path, `seed ${m.seed}`).not.toBeNull()
      for (const [x, z] of path!) expect(inside.has(cellKey(m, x, z)), `seed ${m.seed}`).toBe(false)
      const [ai, aj] = m.challenge!.at
      expect(inside.has(aj * m.w + ai)).toBe(true)
      expect(findPath(nav, m.start.x, m.start.z, cellCenter(ai), cellCenter(aj), 4000), `seed ${m.seed}`).not.toBeNull()
    }
  })

  it('leaves the rest of the map as it was for the seed', () => {
    for (const seed of [11, 4242, 90001]) {
      const a = generateMap({ seed, rooms: 9, boss: false })
      const b = generateMap({ seed, rooms: 9, boss: false, challenge: true })
      expect(b.rooms.slice(0, a.rooms.length).map(r => [r.x0, r.z0, r.w, r.h, r.role])).toEqual(a.rooms.map(r => [r.x0, r.z0, r.w, r.h, r.role]))
      expect(b.doors.slice(0, a.doors.length)).toEqual(a.doors)
      expect(a.challenge).toBeUndefined()
    }
  })

  it('is only asked for by the Tower Run and the supply run, from Blaze on', () => {
    for (const s of SECTORS) {
      expect(hasChallengeRoom('supply', s)).toBe(true)
      expect(hasChallengeRoom('climb', s)).toBe(true)
    }
    for (const t of ['boss', 'kill', 'collect', 'purge', 'elite', 'rescue', 'stage', 'tutorial'] as const) expect(hasChallengeRoom(t, 'blaze')).toBe(false)
    // Never before the first Master: the Scrapyard's runs have none.
    expect(hasChallengeRoom('supply', 'scrapyard')).toBe(false)
    expect(hasChallengeRoom('climb', 'scrapyard')).toBe(false)
    expect(generateClimb(5, false).challenge).toBeUndefined()
    expect(generateClimb(5, false).rooms.some(r => r.role === 'challenge')).toBe(false)
  })
})

describe('the challenge room in the Tower Run', () => {
  it('hangs off the drop descent, off the route, on every seed and both hands', () => {
    for (let seed = 1; seed <= 24; seed++) {
      for (const m of [generateClimb(seed * 131), mirrorX(generateClimb(seed * 131))]) {
        expect(m.challenge, `seed ${seed}`).toBeDefined()
        deadEnd(m)
        const t = m.terrain!
        expect(t.sections[m.doors[m.challenge!.door]!.from]).toBe('descent')
        const inside = cellsOf(m, m.challenge!.room)
        for (const k of inside) {
          expect(t.pit[k]).toBe(0)
          expect(t.floor[k]).toBe(0)
        }
        // The boss is reached without it; it is reached from the route.
        const nav = createNav(m)
        const arena = m.rooms.find(r => r.role === 'boss')!
        const path = findPath(nav, m.start.x, m.start.z, cellCenter(arena.x0 + 3), cellCenter(arena.z0 + 3), 6000, 1, true)
        expect(path, `seed ${seed}`).not.toBeNull()
        for (const [x, z] of path!) expect(inside.has(cellKey(m, x, z))).toBe(false)
        const [ai, aj] = m.challenge!.at
        expect(findPath(nav, m.start.x, m.start.z, cellCenter(ai), cellCenter(aj), 6000, 1, true), `seed ${seed}`).not.toBeNull()
      }
    }
  })
})

describe('the challenge room in the story stages', () => {
  /** What a stage places, by kind and cell: nothing of it may stand in the
   *  challenge room. */
  const things = (m: MapData): Array<[string, number]> => {
    const t = m.terrain!
    const at = (x: number, z: number) => cellKey(m, x, z)
    const out: Array<[string, number]> = []
    for (const f of t.foes) out.push(['foe', at(f.x, f.z)])
    for (const c of t.chests ?? []) out.push(['chest', at(c.x, c.z)])
    for (const r of t.rewards) out.push(['reward', at(r.x, r.z)])
    for (const c of t.checkpoints) for (const k of c.cells) out.push(['checkpoint', k])
    for (const v of t.vents ?? []) out.push(['vent', v.j * m.w + v.i])
    for (const l of t.ladders) out.push(['ladder', l.j * m.w + l.i])
    for (const l of t.lifts) out.push(['lift', at(l.ax, l.az)], ['lift', at(l.bx, l.bz)])
    for (const c of t.crushers) out.push(['crusher', c.j * m.w + c.i])
    for (const s of t.secrets ?? []) for (const k of s.cells) out.push(['secret', k])
    for (const r of t.rails ?? []) for (const p of r.points) out.push(['rail', at(p.x, p.z)])
    for (const p of t.icePillars ?? []) out.push(['ice pillar', p.j * m.w + p.i])
    for (const c of t.icicles ?? []) out.push(['icicle', c.j * m.w + c.i])
    const box = (kind: string, i0: number, j0: number, i1: number, j1: number) => {
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) out.push([kind, j * m.w + i])
    }
    for (const z of t.water ?? []) box('water', z.i0, z.j0, z.i1, z.j1)
    for (const r of t.magnets ?? []) box('magnet rail', r.i0, r.j0, r.i1, r.j1)
    for (const w of t.wind ?? []) box('wind', w.i0, w.j0, w.i1, w.j1)
    for (const n of t.neon ?? []) box('light bridge', n.i, n.j, n.i + n.w - 1, n.j + n.d - 1)
    return out
  }

  for (const s of SECTORS) {
    it(`${s}: exactly one, a dead end off a mid-to-late room, never on the route, its door in the wall line`, () => {
      for (let seed = 0; seed < 8; seed++) {
        const m = generateStage(s, seed)
        const t = m.terrain!
        const tag = `${s} #${seed}`
        expect(m.challenge, tag).toBeDefined()
        expect(m.rooms.filter(r => r.role === 'challenge').length, tag).toBe(1)
        deadEnd(m)
        const ch = m.challenge!
        const room = m.rooms[ch.room]!
        const door = m.doors[ch.door]!
        // Off a room on the chain past its first two, not the one with the
        // boss shutter in it (nor the arena, the beam-in or the lesson room).
        const host = door.from
        const shutter = m.doors.find(d => d.boss)!
        expect(host, tag).toBeGreaterThanOrEqual(2)
        expect(host, tag).not.toBe(shutter.from)
        expect(['start', 'boss', 'challenge']).not.toContain(m.rooms[host]!.role)
        expect(t.sections[host], tag).not.toBe('arena')
        // Inside the grid, a cell of void kept round it.
        expect(room.x0, tag).toBeGreaterThanOrEqual(1)
        expect(room.z0, tag).toBeGreaterThanOrEqual(1)
        expect(room.x0 + room.w, tag).toBeLessThanOrEqual(m.w - 1)
        expect(room.z0 + room.h, tag).toBeLessThanOrEqual(m.h - 1)
        // Room for the fight: 6 cells across at least one way, 5 the other.
        expect(Math.max(room.w, room.h), tag).toBeGreaterThanOrEqual(6)
        expect(Math.min(room.w, room.h), tag).toBeGreaterThanOrEqual(5)
        // A plain floor, level with the corridor and the cell it opens off.
        const di = door.axis === 'x' ? door.dir : 0
        const dj = door.axis === 'z' ? door.dir : 0
        let mi = door.i
        let mj = door.j
        while (m.cell[mj * m.w + mi] === Cell.Corridor) { mi -= di; mj -= dj }
        const mouth = mj * m.w + mi
        expect(m.room[mouth], tag).toBe(host)
        expect(t.pit[mouth], tag).toBe(0)
        const y = t.floor[mouth]!
        const inside = cellsOf(m, ch.room)
        for (const k of inside) {
          expect(t.pit[k], tag).toBe(0)
          expect(t.ramp[k], tag).toBe(0)
          expect(t.floor[k], tag).toBe(y)
        }
        // The door stands in the room's wall line: the corridor's last cell,
        // the room's first past it.
        expect(m.cell[door.j * m.w + door.i], tag).toBe(Cell.Corridor)
        expect(m.room[(door.j + dj) * m.w + door.i + di], tag).toBe(ch.room)
        // Nothing of the stage's own in it: its only machine is the mini-boss.
        for (const [kind, k] of things(m)) expect(inside.has(k), `${tag}: a ${kind} in the challenge room`).toBe(false)
        // The way through its host room, in at its door and out at the next,
        // never passes through it; from the way in it is reached.
        const nav = createNav(m)
        const inD = m.doors[m.rooms[host]!.door]!
        const outD = m.doors.find(d => d.from === host && !d.challenge)!
        const ix = cellCenter(inD.i + (inD.axis === 'x' ? inD.dir : 0))
        const iz = cellCenter(inD.j + (inD.axis === 'z' ? inD.dir : 0))
        const path = findPath(nav, ix, iz, cellCenter(outD.i), cellCenter(outD.j), 12000, 1, true)
        expect(path, tag).not.toBeNull()
        for (const [x, z] of path!) expect(inside.has(cellKey(m, x, z)), tag).toBe(false)
        const [ai, aj] = ch.at
        expect(inside.has(aj * m.w + ai), tag).toBe(true)
        expect(findPath(nav, ix, iz, cellCenter(ai), cellCenter(aj), 12000, 1, true), tag).not.toBeNull()
      }
    })
  }

  it('the Fortress: two cover pillars in the Sentinel\'s room, each a shelter from where it waits', () => {
    for (let seed = 0; seed < 8; seed++) {
      const m = generateStage('fortress', seed)
      const ch = m.challenge!
      const inside = cellsOf(m, ch.room)
      const posts = m.pillars.filter(p => inside.has(cellKey(m, p.x, p.z)))
      expect(posts.length).toBe(2)
      const nav = createNav(m)
      const ex = cellCenter(ch.at[0])
      const ez = cellCenter(ch.at[1])
      for (const p of posts) {
        const k = cellKey(m, p.x, p.z)
        // Solid for every path, never on the mini-boss's own spot.
        expect(m.navBlock[k]).toBe(1)
        expect(k).not.toBe(ch.at[1] * m.w + ch.at[0])
        // A step past it, away from the Sentinel: out of its sight (its beam
        // stops at cover).
        const d = Math.hypot(p.x - ex, p.z - ez)
        const hx = p.x + (p.x - ex) / d * 1.6
        const hz = p.z + (p.z - ez) / d * 1.6
        expect(inside.has(cellKey(m, hx, hz))).toBe(true)
        expect(hasLineOfSight(nav, ex, ez, hx, hz)).toBe(false)
      }
    }
    // No other stage stands a pillar in its challenge room.
    for (const s of SECTORS.filter(x => x !== 'fortress')) {
      const m = generateStage(s, 1)
      const inside = cellsOf(m, m.challenge!.room)
      expect(m.pillars.some(p => inside.has(cellKey(m, p.x, p.z))), s).toBe(false)
    }
  })

  it('none before the first Master: the Scrapyard and the tutorial', () => {
    for (let seed = 0; seed < 6; seed++) {
      expect(generateStage('scrapyard', seed).challenge).toBeUndefined()
      expect(generateStage('scrapyard', seed).rooms.some(r => r.role === 'challenge')).toBe(false)
    }
    const tut = generateWakeUpCall(1)
    expect(tut.challenge).toBeUndefined()
    expect(tut.rooms.some(r => r.role === 'challenge')).toBe(false)
  })
})

describe('the mini-boss registry', () => {
  it('has one mini-boss per sector from Blaze on, each named and complete', () => {
    expect(Object.keys(MINI_BOSSES).sort()).toEqual([...SECTORS].sort())
    expect(new Set(MINI_BOSS_IDS).size).toBe(10)
    for (const s of SECTORS) {
      const m = MINI_BOSSES[s]
      expect(m.sector).toBe(s)
      expect(m.nameKey).toBe(`miniboss.${m.id}`)
      expect(m.def.kind).toBe('miniboss')
      expect(m.def.hp).toBeGreaterThan(0)
      expect(m.def.weak.r).toBeGreaterThan(0)
      expect(typeof m.build).toBe('function')
      expect(typeof m.behaviour.fight).toBe('function')
    }
    // Built for real: the Cinder Hound and those since; the rest are marked stand-ins.
    expect(MINI_BOSSES.blaze.id).toBe('cinderHound')
    expect(MINI_BOSSES.cryo.id).toBe('icebreakerBrute')
    expect(MINI_BOSSES.volt.id).toBe('arcSpider')
    expect(MINI_BOSSES.gale.id).toBe('stormHornetQueen')
    expect(MINI_BOSSES.magnet.id).toBe('lodestoneGolem')
    expect(MINI_BOSSES.drill.id).toBe('burrowWyrm')
    expect(MINI_BOSSES.tide.id).toBe('pufferMatriarch')
    expect(MINI_BOSSES.neon.id).toBe('glitchStalker')
    expect(MINI_BOSSES.rotor.id).toBe('sawGyro')
    expect(MINI_BOSSES.fortress.id).toBe('sentinelPrototype')
    const built: readonly string[] = ['blaze', 'cryo', 'volt', 'gale', 'magnet', 'drill', 'tide', 'neon', 'rotor', 'fortress']
    for (const s of SECTORS) expect(!!MINI_BOSSES[s].todo, s).toBe(!built.includes(s))
    // The Scrapyard has none.
    expect(miniBossFor('scrapyard')).toBeNull()
    expect(miniBossFor('blaze')?.id).toBe('cinderHound')
  })

  it('builds a mini-boss offstage, its weak spot its own', () => {
    const map = generateMap({ seed: 77, rooms: 9, boss: false, challenge: true })
    const e = createMiniBoss(CINDER_HOUND, 8, 30, 30, map.rooms[map.challenge!.room]!)
    expect(e.offstage).toBe(true)
    expect(e.state).toBe('idle')
    expect(e.kind).toBe('miniboss')
    expect(e.nameKey).toBe('miniboss.cinderHound')
    expect(e.maxHp).toBeGreaterThan(CINDER_HOUND.def.hp)
    expect(weakSpotOf(e)).toBe(CINDER_HOUND.def.weak)
  })
})

describe('the prize', () => {
  it('pays 200 bolts with the first Master down, 15 % more for each one after', () => {
    expect(challengeBolts(0)).toBe(200)
    expect(challengeBolts(1)).toBe(200)
    expect(challengeBolts(2)).toBe(230)
    expect(challengeBolts(10)).toBe(470)
    expect(mastersBeaten(['scrapper', 'blazeMaster', 'frostMaster'])).toBe(2)
    expect(mastersBeaten(['scrapper'], 1)).toBe(10)
  })

  it('drops an item never below tuned, better with every Master beaten', () => {
    const score = (m: number) => { const o = challengeRarityOdds(m); return o.tuned + 2 * o.prototype + 3 * o.legendary }
    for (let m = 0; m <= 10; m++) {
      const o = challengeRarityOdds(m)
      expect(o.tuned + o.prototype + o.legendary).toBeCloseTo(1)
      expect(Math.min(o.tuned, o.prototype, o.legendary)).toBeGreaterThan(0)
      if (m > 0) {
        expect(score(m)).toBeGreaterThan(score(m - 1))
        expect(challengeItemLevel(10, m)).toBeGreaterThanOrEqual(challengeItemLevel(10, m - 1))
      }
    }
    const share = (m: number) => {
      const rng = mulberry32(5)
      const got = Array.from({ length: 4000 }, () => rollChallengeRarity(rng, m))
      expect(got).not.toContain('standard')
      return got.filter(r => r === 'legendary' || r === 'prototype').length / got.length
    }
    expect(share(9)).toBeGreaterThan(share(0) + 0.3)
    expect(challengeItemLevel(10, 9)).toBe(13)
  })
})

/** A challenge room's runtime on a fake mission: what it shut, opened, said and paid. */
const runner = () => {
  const map = generateMap({ seed: 4242, rooms: 9, boss: false, challenge: true })
  const ch = map.challenge!
  const room = map.rooms[ch.room]!
  const foe = createMiniBoss(CINDER_HOUND, 8, cellCenter(ch.at[0]), cellCenter(ch.at[1]), room)
  const log = { shut: [] as number[], released: [] as number[], said: [] as AtlasLine[], paid: [] as ChallengeReward[], music: [] as boolean[] }
  const player = { x: map.start.x, z: map.start.z }
  const run = new ChallengeRun({
    map, player,
    shutDoor: (id) => log.shut.push(id),
    releaseDoor: (id) => log.released.push(id),
    say: (l) => log.said.push(l),
    music: (f) => log.music.push(f),
    sfx: () => {},
    reward: (r) => log.paid.push(r)
  }, foe, { level: 8, masters: 3, boltMul: 1.1, rng: mulberry32(9) })
  return { map, ch, room, foe, log, player, run }
}

describe('the challenge door and the fight', () => {
  it('shuts behind Flux once he is in, starts the fight with the challenge card, and opens after the kill', () => {
    const { map, ch, room, foe, log, player, run } = runner()
    const d = map.doors[ch.door]!
    // At the door, still outside: nothing shuts, Atlas points it out.
    player.x = cellCenter(d.i)
    player.z = cellCenter(d.j)
    run.update(1 / 60, 0, true)
    expect(log.shut).toEqual([])
    expect(log.said).toEqual(['challenge'])
    expect(run.state).toBe('waiting')
    // In the room, past the doorway.
    player.x = cellCenter(ch.at[0])
    player.z = cellCenter(ch.at[1])
    expect(map.room[cellKey(map, player.x, player.z)]).toBe(room.id)
    run.update(1 / 60, 0, true)
    expect(log.shut).toEqual([ch.door])
    expect(run.state).toBe('fight')
    expect(foe.state).toBe('alert')
    expect(foe.offstage).toBe(false)
    expect(hud.bossName).toBe('miniboss.cinderHound')
    expect(hud.bossStyle).toBe('challenge')
    expect(hud.titleKey).toBe('miniboss.cinderHound')
    expect(hud.titleStyle).toBe('challenge')
    expect(log.music).toEqual([true])
    // The kill: paid at once, the door opens when its death throes are over.
    foe.state = 'dead'
    foe.hp = 0
    foe.deathT = 0
    run.update(1 / 60, 0, true)
    expect(log.paid.length).toBe(1)
    expect(log.released).toEqual([])
    foe.deathT = MINI_SHATTER_AT
    run.update(1 / 60, 0, true)
    expect(log.released).toEqual([ch.door])
    expect(log.music).toEqual([true, false])
    for (let k = 0; k < 200; k++) run.update(1 / 60, 0, true)
    expect(log.paid.length).toBe(1)
    expect(log.released.length).toBe(1)
    expect(hud.bossName).toBe('')
  })

  it('pays a Repair Gel, the bolts by story progress and an item of tuned or better', () => {
    const { foe, log, run, player, ch } = runner()
    player.x = cellCenter(ch.at[0])
    player.z = cellCenter(ch.at[1])
    run.update(1 / 60, 0, true)
    foe.state = 'dead'
    run.update(1 / 60, 0, true)
    const r = log.paid[0]!
    expect(r.gel).toBe(true)
    // Three Masters beaten, a 10 % bolt bonus.
    expect(r.bolts).toBe(Math.round(challengeBolts(3) * 1.1))
    expect(['tuned', 'prototype', 'legendary']).toContain(r.rarity)
    expect(r.ilvl).toBe(challengeItemLevel(8, 3))
  })

  it('pays nothing twice: a resume with it beaten finds the room done and the door a door', () => {
    const { foe, log, run, player, ch } = runner()
    foe.state = 'dead'
    foe.deathT = 10
    player.x = cellCenter(ch.at[0])
    player.z = cellCenter(ch.at[1])
    for (let k = 0; k < 10; k++) run.update(1 / 60, 0, true)
    expect(run.state).toBe('won')
    expect(log.shut).toEqual([])
    expect(log.paid).toEqual([])
  })
})

describe('the Cinder Hound', () => {
  /** Fight it for `secs` with Flux circling in its room; log every hit with
   *  the hound's state at that moment, and every wind-up. */
  const fight = (secs: number, hurt = 1) => {
    const map = generateMap({ seed: 4242, rooms: 9, boss: false, challenge: true })
    const ch = map.challenge!
    const room = map.rooms[ch.room]!
    const e = createMiniBoss(CINDER_HOUND, 8, cellCenter(ch.at[0]), cellCenter(ch.at[1]), room)
    const hits: Array<{ t: number; state: string; attack: string; hazard?: string }> = []
    const markers: number[] = []
    const cx = (room.x0 + room.w / 2) * CELL
    const cz = (room.z0 + room.h / 2) * CELL
    const stub = () => {}
    let t = 0
    const w = {
      map, nav: createNav(map), time: 0,
      player: { x: cx + 3, z: cz, yaw: 0, pitch: 0 },
      combat: {}, enemies: [e],
      fx: { emit: stub, sparks: stub, orbBurst: stub, flash: stub, riseRing: stub },
      markers: { spawn: () => markers.push(t) },
      shocks: { spawn: stub, spawnLinear: stub },
      hitPlayer: (_s: Enemy | null, _d: number, o: { hazard?: string }) => {
        hits.push({ t, state: e.state, attack: e.attack, hazard: o.hazard === 'fire' && e.state !== 'act' ? 'hazard' : undefined })
        return 'hit'
      },
      shake: stub, sfx: stub, fireEnemyShot: stub, lobShell: stub, spawnWave: stub, spawnRing: stub, fireOrb: stub
    } as unknown as World
    startMiniBoss(e)
    const teles: Array<{ attack: string; dur: number }> = []
    const acts: string[] = []
    const actAt: Array<{ attack: string; t: number }> = []
    let teleFor = 0
    let coneSeen = false
    const dt = 1 / 60
    for (let k = 0; k < secs / dt; k++) {
      t = k * dt
      // Flux circles the room's middle, 3 m out.
      w.player.x = cx + Math.cos(t * 0.6) * 3
      w.player.z = cz + Math.sin(t * 0.6) * 3
      const was = e.state
      updateMiniBoss(w, e, dt)
      if (e.state === 'engage' && hurt < 1 && e.hp === e.maxHp) e.hp = Math.round(e.maxHp * hurt)
      if (was === 'tele') teleFor += dt
      if (was !== 'act' && e.state === 'act') {
        teles.push({ attack: e.attack, dur: teleFor })
        acts.push(e.attack)
        actAt.push({ attack: e.attack, t })
      }
      if (e.state !== 'tele') teleFor = 0
      const mem = e.challenge!.mem as HoundMem
      if (e.state === 'tele' && e.attack === 'breath' && mem.cone?.visible) coneSeen = true
    }
    return { e, hits, teles, acts, actAt, markers, coneSeen }
  }

  it('lands nothing during its entrance, and every blow only after a wind-up of over half a second', () => {
    const { hits, teles, acts } = fight(40)
    expect(acts.length).toBeGreaterThan(4)
    expect(hits.length).toBeGreaterThan(0)
    // Its entrance (2.5 s) never hurts.
    for (const h of hits) expect(h.t).toBeGreaterThan(2.5)
    // Direct blows land in 'act' only; the fire it leaves behind burns later.
    for (const h of hits) if (!h.hazard) expect(h.state).toBe('act')
    for (const x of teles) expect(x.dur, x.attack).toBeGreaterThanOrEqual(0.6)
    expect(LUNGE_TELE).toBeGreaterThanOrEqual(0.6)
    expect(BREATH_TELE).toBeGreaterThanOrEqual(0.6)
    expect(HOWL_TELE).toBeGreaterThanOrEqual(0.6)
  })

  it('lunges and breathes fire, each drawn on the floor first; under half health it howls embers down', () => {
    const calm = fight(40)
    expect(calm.acts).toContain('lunge')
    expect(calm.acts).toContain('breath')
    expect(calm.acts).not.toContain('howl')
    expect(calm.coneSeen).toBe(true)
    expect(calm.markers.length).toBeGreaterThan(0)
    const hurt = fight(40, 0.45)
    expect(hurt.acts).toContain('howl')
    // Fire left behind (a trail, an ember) burns only after a lunge or a howl
    // put it there; an ember lands EMBER_FALL after its ring appeared.
    for (const r of [calm, hurt]) {
      const firstFire = r.actAt.find(a => a.attack === 'lunge' || a.attack === 'howl')!
      for (const h of r.hits) if (h.hazard) expect(h.t).toBeGreaterThan(firstFire.t)
    }
    // The embers' rings go down as the howl begins, a second before they land.
    const howl = hurt.actAt.find(a => a.attack === 'howl')!
    expect(hurt.markers.some(t => Math.abs(t - howl.t) < 0.05)).toBe(true)
    expect(EMBER_FALL).toBeGreaterThanOrEqual(1)
  })
})

describe('the new models', () => {
  const placed = (g: BufferGeometry) => g

  it('the challenge door: no two parts in one plane, its own beacons, nothing of the boss door', () => {
    const p = challengeFrameParts()
    expect(coplanarOverlaps([...p.toon, ...p.glow, ...p.lamps, ...p.globes].map(placed))).toBe(0)
    const d = buildDoor(THEMES.blaze, false, 1, true)
    expect(d.boss).toBe(false)
    expect(d.warn).toBeNull()
    expect(d.beacon).toBeDefined()
    expect(d.panels.length).toBe(1)
    let meshes = 0
    d.root.traverse((o) => { if ((o as Mesh).isMesh) meshes++ })
    expect(meshes).toBeLessThanOrEqual(8)
  })

  it('the Cinder Hound: no two parts in one plane', () => {
    const b = cinderHoundParts()
    b.build()
    expect(coplanarOverlaps(b.partGeometries)).toBe(0)
  })
})

describe('the strings', () => {
  const at = (o: unknown, key: string): unknown => key.split('.').reduce<unknown>((x, k) => (x as Record<string, unknown> | undefined)?.[k], o)
  const keys = [...MINI_BOSS_IDS.map(id => `miniboss.${id}`), 'challenge.label', 'challenge.cleared', 'atlas.challenge']

  it('are in English and in every shipped locale', async () => {
    for (const k of keys) expect(typeof at(en, k), k).toBe('string')
    for (const code of LANGUAGES) {
      const mod = await import(`../../src/i18n/locales/${code}.ts`)
      for (const k of keys) {
        const v = at(mod.default, k)
        expect(typeof v, `${code} ${k}`).toBe('string')
        expect((v as string).length, `${code} ${k}`).toBeGreaterThan(0)
      }
      expect(at(mod.default, 'challenge.cleared') as string, code).toContain('{bolts}')
    }
  })
})
