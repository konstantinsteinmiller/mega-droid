// Wall climbs (`world/climbFeature.ts`): the Blackout Boulevard's wall-kick
// shaft as a feature of every story stage — a tower raised in a plain room,
// one to three shafts up it, a prize on top (a borrowed weapon, a Repair Gel,
// a ledge chest, in turn down the campaign), the Blaze practice wall and its
// hologram, and a few shortcuts through a locked battle room. Every stage,
// many seeds, both hands.

import { describe, expect, it } from 'vitest'
import { BufferGeometry, Float32BufferAttribute } from 'three'
import { generateStage } from '@/game/world/stages'
import { STAGE_LENGTH, type StageSector } from '@/game/world/stages/meta'
import { generateWakeUpCall } from '@/game/world/stages/tutorial'
import { mirrorX } from '@/game/world/stages/builder'
import { CELL, cellCenter, type MapData } from '@/game/world/levelGen'
import { createNav, findPath } from '@/game/world/nav'
import { BALCONY_DROP, CLIMB_PLAN, CUED, PITCH, SHORTCUT_SKIP, mapRouteField } from '@/game/world/climbFeature'
import { HOLD_GAP, SIGN_ARROW_Y, kickShaftParts, signPostParts } from '@/game/world/climbMesh'
import { THEMES } from '@/game/world/themes'
import { HOLO_LOOP, HOLO_PRESS, holoGlyphAt, holoRetired, LessonHologram } from '@/game/fx/lessonHologram'
import { planBorrowed } from '@/game/sim/borrowed'
import { climbProblems, roomWalk } from './climbCheck'
import { coplanarPairs } from './coplanar'
import { Scene } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { MissionObjects, type ObjectiveHost } from '@/game/sim/objectives'
import { storyQuest } from '@/game/data/quests'
import { SECTOR_BY_ID } from '@/game/data/regions'

const STAGES = Object.keys(STAGE_LENGTH) as StageSector[]
const SEEDS = Array.from({ length: 12 }, (_, i) => (i * 2654435761 + 97) >>> 0)
const K = (m: MapData, x: number, z: number) => Math.floor(z / CELL) * m.w + Math.floor(x / CELL)

describe('wall climbs in every story stage', () => {
  it('every story stage has one or two (the practice wall and a shortcut besides); the tutorial none', () => {
    for (const s of STAGES) {
      for (const seed of SEEDS) {
        const cl = generateStage(s, seed).terrain!.climbs ?? []
        const real = cl.filter(c => c.tier > 0 && c.reward !== 'shortcut')
        expect(real.length, `${s} #${seed}`).toBeGreaterThanOrEqual(1)
        expect(real.length, `${s} #${seed}`).toBeLessThanOrEqual(2)
        expect(cl.filter(c => c.tier === 0).length, `${s} #${seed}: the practice wall`).toBe(s === 'blaze' ? 1 : 0)
      }
    }
    expect(generateWakeUpCall(1).terrain!.climbs).toBeUndefined()
  })

  it('the tier rises with the sector: one pitch, then two, then a taller second', () => {
    const tiers = STAGES.map(s => Math.max(...generateStage(s, 1).terrain!.climbs!.filter(c => c.reward !== 'shortcut').map(c => c.tier)))
    for (let n = 1; n < tiers.length; n++) expect(tiers[n]!, STAGES[n]).toBeGreaterThanOrEqual(tiers[n - 1]!)
    expect(tiers[0]).toBe(1)
    expect(tiers[tiers.length - 1]).toBe(3)
    // Heights: the pitches add up to the tier's tower.
    const m = generateStage('tide', 1)
    const c = m.terrain!.climbs!.find(x => x.tier === 3)!
    const [a, b] = c.ladders.map(id => m.terrain!.ladders[id]!)
    expect([a!.y1 - a!.y0, b!.y1 - b!.y0]).toEqual([2 * PITCH, 3 * PITCH])
  })

  it('every climb is readable, reachable, bare and solvable with the real body — every seed, both hands', () => {
    for (const s of STAGES) {
      for (const seed of SEEDS.slice(0, 6)) {
        const m = generateStage(s, seed)
        for (const [h, map] of [m, mirrorX(m)].entries()) expect(climbProblems(map, s, `${s} #${seed}${h ? ' mirrored' : ''}`, true)).toEqual([])
      }
    }
  })

  it('the seed picks the spot (deterministically), never the stage around it', () => {
    let varied = 0
    for (const s of STAGES) {
      const spot = (seed: number) => {
        const m = generateStage(s, seed)
        const c = m.terrain!.climbs!.find(x => x.tier > 0 && x.reward !== 'shortcut')!
        // In the unmirrored frame, so the hand alone does not count.
        const i = m.start.x > m.w * CELL / 2 ? m.w - 1 - c.top.i : c.top.i
        return `${c.room}:${i},${c.top.j}`
      }
      expect(spot(SEEDS[3]!), s).toBe(spot(SEEDS[3]!))
      if (new Set(SEEDS.map(spot)).size > 1) varied++
    }
    expect(varied).toBeGreaterThanOrEqual(STAGES.length / 2)
  })
})

describe('the prizes', () => {
  it('take turns down the campaign: weapon, gel, chest', () => {
    const order = STAGES.flatMap(s => CLIMB_PLAN[s].climbs.map(c => c.reward))
    const turn = ['weapon', 'tank', 'chest'] as const
    order.forEach((r, n) => expect(r, `climb ${n}`).toBe(turn[n % 3]))
  })

  it('each stands on its top ledge as planned: a capsule, a gel kit, a ledge chest with authored gear', () => {
    for (const s of STAGES) {
      for (const seed of SEEDS.slice(0, 4)) {
        const m = generateStage(s, seed)
        const t = m.terrain!
        for (const c of t.climbs!) {
          const k = c.top.j * m.w + c.top.i
          const at = `${s} #${seed} ${c.reward}`
          if (c.reward === 'chest') {
            const ch = t.chests!.find(x => K(m, x.x, x.z) === k)!
            expect(ch, at).toBeTruthy()
            expect(ch.ledge, at).toBe(true)
            expect(ch.y).toBe(c.top.y)
            expect(ch.loot!.rarity, at).not.toBe('legendary')
            expect(ch.loot!.rarity, at).toBe(CLIMB_PLAN[s].chest!.rarity)
            expect(ch.loot!.key).toBe(`${s}.climb`)
          } else if (c.reward !== 'shortcut') {
            const r = t.rewards.find(x => K(m, x.x, x.z) === k)
            expect(r?.kind, at).toBe(c.reward)
            expect(r!.y).toBe(c.top.y)
          }
        }
      }
    }
  })

  it('a climb\'s weapon capsule lends the mission\'s one weapon (a refill, never a second power)', () => {
    for (const s of STAGES.filter(x => CLIMB_PLAN[x].climbs.some(c => c.reward === 'weapon'))) {
      const caps = planBorrowed(generateStage(s, 3), { owned: [], slots: [] })
      expect(caps.length, s).toBeGreaterThanOrEqual(1)
      expect(new Set(caps.map(c => c.weapon)).size, s).toBe(1)
    }
  })

  it('the chests stay inside the story chests\' rule: once per save, never a legendary', () => {
    const keys = STAGES.flatMap(s => (generateStage(s, 1).terrain!.chests ?? []).filter(c => c.ledge).map(c => c.loot!.key))
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys.length).toBe(STAGES.filter(s => CLIMB_PLAN[s].climbs.some(c => c.reward === 'chest')).length)
  })
})

describe('the ledge chest', () => {
  it('opens to a shot only with Flux up on its ledge: a shot from the floor below stops on it', () => {
    const m = generateStage('volt', 5)
    const scene = new Scene()
    const noop = () => {}
    const player = { x: 0, z: 0, yaw: 0, pitch: 0, y: 0 }
    const opened: unknown[] = []
    const host = {
      scene, map: m, nav: createNav(m), theme: THEMES.volt, propParent: () => scene, player,
      fx: { sparks: noop, emit: noop, orbBurst: noop, flash: noop, riseRing: noop },
      shocks: { spawn: noop }, shake: noop, sfx: noop, explode: noop, lootTaken: () => false,
      onCrateDeflect: noop, onCrateBroken: noop, onChestOpened: (c: unknown) => opened.push(c), onCoreTaken: noop, onObjectiveDone: noop
    }
    const objs = new MissionObjects(host as unknown as ObjectiveHost, storyQuest(SECTOR_BY_ID.volt, 5, 0))
    const c = objs.chests.find(x => x.ledge)!
    expect(c).toBeTruthy()
    expect(c.loot?.key).toBe('volt.climb')
    // From the room floor below: the shot stops, the chest stays shut.
    player.y = c.y - 2 * PITCH
    expect(objs.shotHitsChest(c.x, c.y + 0.5, c.z, 0.1)).toBe(true)
    expect(c.opened).toBe(false)
    // Up on the ledge: it opens.
    player.y = c.y
    expect(objs.shotHitsChest(c.x, c.y + 0.5, c.z, 0.1)).toBe(true)
    expect(c.opened).toBe(true)
  })
})

describe('shortcuts', () => {
  const withShortcut = STAGES.filter(s => CLIMB_PLAN[s].shortcut)

  it('two to four across the campaign, each placed for every seed', () => {
    expect(withShortcut.length).toBeGreaterThanOrEqual(2)
    expect(withShortcut.length).toBeLessThanOrEqual(4)
    for (const s of STAGES) {
      for (const seed of SEEDS) {
        const n = (generateStage(s, seed).terrain!.climbs ?? []).filter(c => c.shortcut).length
        expect(n, `${s} #${seed}`).toBe(withShortcut.includes(s) ? 1 : 0)
      }
    }
  })

  it('are fixed per level: exactly Neon and Rotor, the same route rooms and cells for every seed and both hands', () => {
    expect([...withShortcut].sort()).toEqual(['neon', 'rotor'])
    for (const s of withShortcut) {
      const shape = (m: MapData) => {
        const c = m.terrain!.climbs!.find(x => x.shortcut)!
        const sc = c.shortcut!
        // In the unmirrored frame, so the hand alone does not count.
        const flip = m.start.x > m.w * CELL / 2
        const ui = (i: number) => (flip ? m.w - 1 - i : i)
        const din = m.doors[sc.doorIn]!
        const dout = m.doors[sc.doorOut]!
        return JSON.stringify({
          room: c.room, to: sc.to, skips: sc.skips, battle: sc.room,
          top: [ui(c.top.i), c.top.j, c.top.y],
          doorIn: [ui(din.i), din.j], doorOut: [ui(dout.i), dout.j],
          battleCells: m.room.reduce((n, r) => n + (r === sc.room ? 1 : 0), 0)
        })
      }
      const want = shape(generateStage(s, SEEDS[0]!))
      for (const seed of SEEDS) {
        const m = generateStage(s, seed)
        expect(shape(m), `${s} #${seed}`).toBe(want)
        expect(shape(mirrorX(m)), `${s} #${seed} mirrored`).toBe(want)
      }
    }
  })

  it("Neon's never bypasses the Searchlight Drone's first room (the Billboard Drop): it starts after it", () => {
    for (const seed of SEEDS) {
      const m0 = generateStage('neon', seed)
      for (const m of [m0, mirrorX(m0)]) {
        const t = m.terrain!
        const c = t.climbs!.find(x => x.shortcut)!
        const sc = c.shortcut!
        const at = `neon #${seed}`
        // The route rooms in story order: the arena is the last of them.
        const arena = m.rooms.findIndex(r => r.role === 'boss')
        const intro = Math.min(...t.foes.filter(f => f.kind === 'spotter' && f.room < arena).map(f => f.room))
        expect(intro, at).toBe(4)
        // Alone there: the only flyer of its room.
        expect(t.foes.filter(f => f.room === intro && f.role === 'flyer').map(f => f.kind), at).toEqual(['spotter'])
        expect(c.room, at).toBeGreaterThan(intro)
        expect(sc.skips, at).not.toContain(intro)
        expect(sc.to, at).toBeGreaterThan(intro)
      }
    }
  })

  it("Neon's lets out past the challenge door: a signpost by the way out points back to it (Rotor's needs none)", () => {
    for (const seed of SEEDS.slice(0, 6)) {
      const m0 = generateStage('neon', seed)
      for (const m of [m0, mirrorX(m0)]) {
        const t = m.terrain!
        const sc = t.climbs!.find(x => x.shortcut)!.shortcut!
        const sg = sc.sign!
        const at = `neon #${seed}`
        expect(sg, at).toBeDefined()
        const cd = m.doors[m.challenge!.door]!
        expect(cd.from, at).toBe(sc.to)
        // Beside the landing (the cell past the way out), on the route room's floor, not in the doorway.
        const dout = m.doors[sc.doorOut]!
        const li = dout.i + (dout.axis === 'x' ? dout.dir : 0)
        const lj = dout.j + (dout.axis === 'z' ? dout.dir : 0)
        const k = K(m, sg.x, sg.z)
        expect(k, at).toBe(lj * m.w + li)
        expect(m.room[k], at).toBe(sc.to)
        expect(t.pit[k], at).toBe(0)
        expect(Math.hypot(sg.x - cellCenter(li), sg.z - cellCenter(lj)), at).toBeGreaterThan(0.8)
        // The arrow points at the challenge door.
        const tx = cellCenter(cd.i) - sg.x
        const tz = cellCenter(cd.j) - sg.z
        expect(Math.hypot(sg.dx, sg.dz), at).toBeCloseTo(1, 5)
        expect((sg.dx * tx + sg.dz * tz) / Math.hypot(tx, tz), at).toBeGreaterThan(0.95)
        // Its arrow tip lies toward the door too, and nothing of it is coplanar.
        const parts = signPostParts(sg, t.floor[k]!, THEMES.neon)
        // Two crossed flat arrow plates (one upright, one lying): read from the
        // side, from below and from behind.
        expect(parts.glow.length, at).toBe(2)
        const y0 = t.floor[k]! + SIGN_ARROW_Y
        const extent = (g: (typeof parts.glow)[number]) => {
          const pos = g.getAttribute('position')
          let tip = -Infinity, across = 0, up = 0
          for (let v = 0; v < pos.count; v++) {
            const ox = pos.getX(v) - sg.x, oz = pos.getZ(v) - sg.z
            tip = Math.max(tip, ox * sg.dx + oz * sg.dz)
            across = Math.max(across, Math.abs(ox * sg.dz - oz * sg.dx))
            up = Math.max(up, Math.abs(pos.getY(v) - y0))
          }
          return { tip, across, up }
        }
        const [stand, lie] = parts.glow.map(extent) as [ReturnType<typeof extent>, ReturnType<typeof extent>]
        // Its tip toward the door; a wide head (0.84 m upright, 0.77 m lying) both ways; each plate thin.
        expect(stand.tip, at).toBeGreaterThan(0.9)
        expect(lie.tip, at).toBeGreaterThan(0.9)
        expect(stand.up * 2, at).toBeGreaterThan(0.7)
        expect(stand.across * 2, at).toBeLessThan(0.1)
        expect(lie.across * 2, at).toBeGreaterThan(0.7)
        expect(lie.up * 2, at).toBeLessThan(0.1)
        // Over the door leaves' lamps (about 2.5 m), under its lintel.
        expect(SIGN_ARROW_Y, at).toBeGreaterThan(3)
        expect(coplanarPairs([...parts.toon, ...parts.glow], 0.01).length, at).toBe(0)
        // It merges with the room's other glow parts (the same attributes).
        expect(() => mergeGeometries([...parts.glow, ...kickShaftParts(t.ladders[0]!, THEMES.neon).glow]), at).not.toThrow()
        expect(mergeGeometries([...parts.glow, ...kickShaftParts(t.ladders[0]!, THEMES.neon).glow]), at).not.toBeNull()
      }
    }
    for (const seed of SEEDS.slice(0, 3)) expect(generateStage('rotor', seed).terrain!.climbs!.find(x => x.shortcut)!.shortcut!.sign).toBeUndefined()
  })

  it('skip a fifth to two fifths of the route, through a locked battle room, past no beat and never the boss gate', () => {
    for (const s of withShortcut) {
      for (const seed of SEEDS.slice(0, 6)) {
        const m0 = generateStage(s, seed)
        for (const m of [m0, mirrorX(m0)]) {
          const t = m.terrain!
          const c = t.climbs!.find(x => x.shortcut)!
          const sc = c.shortcut!
          const at = `${s} #${seed}`
          const S = m.rooms[sc.room]!
          const din = m.doors[sc.doorIn]!
          const dout = m.doors[sc.doorOut]!
          // In from the tower's room, out into a route room further on.
          expect([din.from, din.to], at).toEqual([c.room, sc.room])
          expect([dout.from, dout.to, !!dout.shortcut], at).toEqual([sc.room, sc.to, true])
          // The route room keeps its own door in.
          expect(m.rooms[sc.to]!.door, at).not.toBe(dout.id)
          // A battle room: held until its machines are down, a hard fight.
          expect(t.guards, at).toContain(sc.room)
          const foes = t.foes.filter(f => f.room === sc.room)
          expect(foes.length, at).toBeGreaterThanOrEqual(5)
          expect(foes.some(f => f.elite), at).toBe(true)
          expect(new Set(foes.map(f => f.role)).size, at).toBeGreaterThanOrEqual(2)
          // Its balcony: a drop of BALCONY_DROP or more, no way back up.
          const inK = (din.j + (din.axis === 'z' ? din.dir : 0)) * m.w + din.i + (din.axis === 'x' ? din.dir : 0)
          // The way out's corridor walked back to the room's floor.
          let outK = dout.j * m.w + dout.i
          for (let n = 0; n < 20 && m.room[outK] !== sc.room; n++) outK -= dout.axis === 'z' ? dout.dir * m.w : dout.dir
          expect(m.room[inK]).toBe(sc.room)
          expect(m.room[outK]).toBe(sc.room)
          expect(t.floor[inK]! - t.floor[outK]!, at).toBeGreaterThanOrEqual(BALCONY_DROP - 1e-6)
          expect(roomWalk(m, sc.room, [outK]).has(inK), at).toBe(false)
          // The skip: SHORTCUT_SKIP of the route, by the route's own length.
          const f = mapRouteField(m)
          const boss = m.doors.find(d => d.boss)!
          const total = f[boss.j * m.w + boss.i]!
          const L = t.ladders[c.ladders[0]!]!
          const from = f[(L.j + L.dj) * m.w + L.i + L.di]!
          const to = f[(dout.j + (dout.axis === 'z' ? dout.dir : 0)) * m.w + dout.i + (dout.axis === 'x' ? dout.dir : 0)]!
          const skip = (to - from) / total
          expect(skip, at).toBeGreaterThanOrEqual(SHORTCUT_SKIP[0])
          expect(skip, at).toBeLessThanOrEqual(SHORTCUT_SKIP[1])
          // Past no beat: no guard hall, boss stage, wave ride, echo, nor the
          // first room of a mechanic Atlas teaches; never the arena.
          const arena = m.rooms.find(r => r.role === 'boss')!
          expect(sc.skips.length, at).toBeGreaterThanOrEqual(1)
          for (const r of sc.skips) {
            expect(t.guards ?? [], at).not.toContain(r)
            expect(t.bossStages ?? [], at).not.toContain(r)
            expect((t.waves ?? []).map(w => w.room), at).not.toContain(r)
            expect(t.foes.some(x => x.room === r && x.echo), at).toBe(false)
          }
          expect([c.room, sc.to, ...sc.skips], at).not.toContain(arena.id)
          expect(CUED[s], at).toBeDefined()
          // The boss gate is still the one way into the arena.
          expect(m.doors.filter(d => d.to === arena.id).length, at).toBe(1)
          // The shaft onto it is a branch: the trail keeps to the route…
          expect(L.branch, at).toBe(true)
          const nav = createNav(m)
          const foot = L.j * m.w + L.i
          const top = (L.j + L.dj) * m.w + L.i + L.di
          expect(nav.links?.get(foot) ?? [], `${at}: a trail hop up the shortcut's shaft`).not.toContain(top)
          // (No walk climbs it either: the battle room is off the trail's way.)
          expect(t.floor[top]! - t.floor[foot]!, at).toBeGreaterThan(1.4)
          // …and from inside the battle room it still finds the way on.
          const into = (dout.j + (dout.axis === 'z' ? dout.dir : 0)) * m.w + dout.i + (dout.axis === 'x' ? dout.dir : 0)
          const back = findPath(nav, cellCenter(outK % m.w), cellCenter(Math.floor(outK / m.w)), cellCenter(into % m.w), cellCenter(Math.floor(into / m.w)), 4000, 2, true)
          expect(back, `${at}: the trail from the battle room on`).toBeTruthy()
          // The battle room's low floor is one open floor: every post on it.
          const low = roomWalk(m, sc.room, [outK])
          for (const f of foes) expect(low.has(K(m, f.x, f.z)), `${at}: a post off the low floor`).toBe(true)
        }
      }
    }
  })
})

describe('the Blaze practice wall and its lesson', () => {
  it('a one-kick wall right before the first real climb (its room or the one before), with bolts on top', () => {
    for (const seed of SEEDS) {
      for (const m of [generateStage('blaze', seed), mirrorX(generateStage('blaze', seed))]) {
        const t = m.terrain!
        const p = t.climbs![0]!
        const real = t.climbs!.find(c => c.tier > 0)!
        expect(p.tier).toBe(0)
        expect(p.reward).toBe('bolts')
        const L = t.ladders[p.ladders[0]!]!
        expect(L.y1 - L.y0).toBe(PITCH)
        // Its room is the climb's or the one before it on the route.
        const parent = m.rooms[real.room]!.parent
        expect([real.room, parent]).toContain(p.room)
        // Nothing holds on it: no door of its room is a guard's.
        expect(t.guards ?? []).not.toContain(p.room)
      }
    }
  })

  it('the hologram kicks on a loop, the slide lit at the kick, and folds once Flux has kicked', () => {
    const [a, b] = HOLO_PRESS.kick
    expect(a).toBeGreaterThan(0)
    expect(b).toBeLessThan(HOLO_LOOP.kick)
    expect(holoGlyphAt('kick', (a + b) / 2)).toEqual({ act: 'slide', down: true })
    expect(holoGlyphAt('kick', 0.1).down).toBe(false)
    const learned = new Set<never>()
    expect(holoRetired('kick', { crateBroken: false, chestOpen: false, learned })).toBe(false)
    expect(holoRetired('kick', { crateBroken: false, chestOpen: false, learned: new Set(['kick'] as const) })).toBe(true)
    const h = new LessonHologram('kick', { theme: THEMES.blaze })
    for (let n = 0; n < 240; n++) h.update(1 / 60, true)
    expect(h.root.visible).toBe(true)
    h.dispose()
  })
})

describe('the holds', () => {
  /** The wall a shaft is bolted to, as a quad, for the coplanar check. */
  const wallQuad = (x: number, z: number, nx: number, nz: number, y0: number, y1: number): BufferGeometry => {
    const ax = Math.abs(nz) * 2
    const az = Math.abs(nx) * 2
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute([
      x - ax, y0, z - az, x + ax, y0, z + az, x + ax, y1, z + az,
      x - ax, y0, z - az, x + ax, y1, z + az, x - ax, y1, z - az
    ], 3))
    return g
  }

  it('sit clearly off their wall in every sector, never coplanar with it or each other', () => {
    for (const s of STAGES) {
      const m = generateStage(s, 2)
      const t = m.terrain!
      for (const id of t.climbs!.flatMap(c => c.ladders)) {
        const L = t.ladders[id]!
        const parts = kickShaftParts(L, THEMES[s])
        const all = [...parts.toon, ...parts.glow]
        expect(all.length).toBeGreaterThan(2)
        // The face: the edge between the foot cell and the tower.
        const fx = L.di ? (L.di > 0 ? (L.i + 1) * CELL : L.i * CELL) : (L.i + 0.5) * CELL
        const fz = L.dj ? (L.dj > 0 ? (L.j + 1) * CELL : L.j * CELL) : (L.j + 0.5) * CELL
        for (const g of all) {
          const pos = g.getAttribute('position')
          for (let v = 0; v < pos.count; v++) {
            // Off the face toward the foot (−di, −dj).
            const off = L.di ? (pos.getX(v) - fx) * -L.di : (pos.getZ(v) - fz) * -L.dj
            expect(off, `${s} shaft ${id}`).toBeGreaterThanOrEqual(HOLD_GAP - 1e-3)
          }
        }
        expect(coplanarPairs([wallQuad(fx, fz, -L.di, -L.dj, L.y0, L.y1), ...all], 0.01).length, `${s} shaft ${id}`).toBe(0)
      }
    }
  })
})
