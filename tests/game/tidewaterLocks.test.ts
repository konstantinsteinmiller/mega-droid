// Tidewater Locks (`world/stages/tide.ts`): the tide sector's story stage —
// up with the tide to the lock gates, down the spillway to the arena. Its
// water (`sim/stages/water.ts`) slows a wading Flux and hurts over his
// chest; the tide rises on the clock, a lock drains when its valve is shot,
// a canal's current pushes.

import { describe, expect, it, vi } from 'vitest'

vi.mock('@/use/useAds', () => ({ showMidgameAd: async () => {} }))
vi.mock('@/use/useAdGate', () => ({ canShowInterstitial: () => false, markInterstitialShown: () => {} }))
vi.mock('@/use/useCrazyGames', () => ({ triggerHappytime: () => {} }))
vi.mock('@/game/engine/app', () => ({ app: { setMode: () => {}, setWanted: () => {} } }))

import { Group, PlaneGeometry, Scene, type BufferGeometry } from 'three'
import { CELL, Cell, cellCenter, type MapData, type WaterZone } from '@/game/world/levelGen'
import { createNav, edgeHeight, STEP_UP, type Nav } from '@/game/world/nav'
import { generateTidewaterLocks } from '@/game/world/stages/tide'
import { generateVexFortress } from '@/game/world/stages/fortress'
import { STAGE_LENGTH } from '@/game/world/stages'
import { mirrorX, POOL_FREEBOARD, YAW_PX } from '@/game/world/stages/builder'
import { THEMES } from '@/game/world/themes'
import { SECTOR_BY_ID } from '@/game/data/regions'
import type { ClimbBody, ClimbHost } from '@/game/sim/climb'
import { WaterFeature, levelAt, wadeSpeed, lowDoors, rimEdges, DEEP, DROWN_TICK } from '@/game/sim/stages/water'
import { poolRimParts, inletParts, drainParts, COPE_UP, DRAIN_UP } from '@/game/models/stageProps/water'
import { coplanarOverlaps } from './coplanar'
import type { MoveMod } from '@/game/sim/stageFeatures'
import type { Shot } from '@/game/sim/world'
import type { AtlasLine } from '@/game/sim/atlas'

const SEEDS = Array.from({ length: 32 }, (_, i) => (i * 2654435761 + 1013904223) >>> 0)
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const
const idx = (m: MapData, x: number, z: number) => Math.floor(z / CELL) * m.w + Math.floor(x / CELL)
const standable = (m: MapData, k: number) => m.cell[k] !== Cell.Void && !m.terrain!.pit[k] && !m.navBlock[k]

const reach = (m: MapData): Set<number> => reachFrom(m, idx(m, m.start.x, m.start.z))

/** Every cell the verbs reach from cell `from` (only through `allow`, if given). */
const reachFrom = (m: MapData, from: number, allow?: Set<number>): Set<number> => {
  const t = m.terrain!
  const hops = new Map<number, number[]>()
  const hop = (a: number, b: number) => { hops.set(a, [...(hops.get(a) ?? []), b]) }
  const besideStop = (x: number, y: number, z: number): number[] => {
    const out: number[] = []
    const si = Math.floor(x / CELL)
    const sj = Math.floor(z / CELL)
    for (const [di, dj] of DIRS) {
      const k = (sj + dj) * m.w + si + di
      if (!standable(m, k)) continue
      if (Math.abs(edgeHeight(m, si + di, sj + dj, -di, -dj) - y) < 0.3) out.push(k)
    }
    return out
  }
  for (const lf of t.lifts) for (const a of besideStop(lf.ax, lf.ay, lf.az)) for (const b of besideStop(lf.bx, lf.by, lf.bz)) { hop(a, b); hop(b, a) }
  const leapOk = (a: [number, number], b: [number, number]): boolean => {
    const di = b[0] - a[0]
    const dj = b[1] - a[1]
    const ka = a[1] * m.w + a[0]
    const kb = b[1] * m.w + b[0]
    const mid = (a[1] + dj / 2) * m.w + a[0] + di / 2
    return standable(m, ka) && standable(m, kb) && !!t.pit[mid] && m.cell[mid] !== Cell.Void && !t.ramp[ka] && !t.ramp[kb] && t.floor[ka] === t.floor[kb]
  }
  const seen = new Set<number>()
  const stack = [from]
  while (stack.length) {
    const k = stack.pop()!
    if (seen.has(k) || (allow && !allow.has(k))) continue
    seen.add(k)
    const i = k % m.w
    const j = (k - i) / m.w
    for (const [di, dj] of DIRS) {
      const nk = (j + dj) * m.w + i + di
      if (standable(m, nk) && edgeHeight(m, i + di, j + dj, -di, -dj) - edgeHeight(m, i, j, di, dj) <= STEP_UP) stack.push(nk)
      if (leapOk([i, j], [i + 2 * di, j + 2 * dj])) stack.push((j + 2 * dj) * m.w + i + 2 * di)
    }
    for (const nk of hops.get(k) ?? []) stack.push(nk)
  }
  return seen
}

const body = (x: number, z: number, y = 0): ClimbBody => ({
  x, z, y, vx: 0, vz: 0, vy: 0, yaw: YAW_PX, ground: true, ladder: -1, plat: -1, air: 0, safeY: y, mantle: 0, mx: 0, mz: 0, path: null
})

const hostFor = (map: MapData, said: AtlasLine[] = [], sfx: string[] = [], hits: number[] = []): ClimbHost & { nav: Nav } => {
  const scene = new Scene()
  const noop = () => {}
  return {
    nav: createNav(map), map, theme: THEMES.tide,
    combat: { maxHp: 100 } as ClimbHost['combat'],
    fx: { sparks: noop, riseRing: noop, emit: noop } as unknown as ClimbHost['fx'],
    markers: { spawn: noop } as unknown as ClimbHost['markers'],
    shocks: { spawn: noop } as unknown as ClimbHost['shocks'],
    hitPlayer: (_e, dmg) => { hits.push(dmg); return 'hit' }, sfx: (n: string) => { sfx.push(n) }, shake: noop, onPickup: noop, propParent: () => scene,
    scene, time: 0, level: { root: new Group(), rooms: [], sky: null as never, bounds: [], owner: new Int16Array(0) },
    enemyLevel: 1, encounters: SECTOR_BY_ID.tide.encounters, addEnemy: noop,
    say: (l) => { said.push(l) }
  }
}

describe('generateTidewaterLocks', () => {
  it('is deterministic for a seed', () => {
    for (const seed of [0, 4242, SEEDS[5]!]) {
      const a = generateTidewaterLocks(seed)
      const b = generateTidewaterLocks(seed)
      expect(JSON.stringify(a.rooms)).toBe(JSON.stringify(b.rooms))
      expect(Array.from(a.terrain!.floor)).toEqual(Array.from(b.terrain!.floor))
      expect(JSON.stringify(a.terrain!.water)).toBe(JSON.stringify(b.terrain!.water))
    }
  })

  it('twelve sections and the arena; the seed varies the hand and the tide, never the route', () => {
    const mirrored = new Set<boolean>()
    const tides = new Set<number>()
    for (const seed of SEEDS) {
      const m = generateTidewaterLocks(seed)
      const t = m.terrain!
      expect(t.sections.slice(0, (m.beam ? -1 : 0) + (m.exit ? -1 : 0) + (m.challenge ? -1 : 0) || undefined)).toEqual(
        ['dock', 'water', 'water', 'lift', 'water', 'islands', 'conveyor', 'hall', 'islands', 'descent', 'hall', 'hall', 'arena'])
      expect(t.sections.length - 1 - ((m.beam ? 1 : 0) + (m.exit ? 1 : 0) + (m.challenge ? 1 : 0))).toBe(STAGE_LENGTH.tide)
      mirrored.add(m.start.x > m.w * CELL / 2)
      tides.add(Math.round(t.water!.find(z => z.period && z.room === 2)!.period! * 100))
      expect(t.water!.filter(z => z.valve).length).toBe(1)
      expect(t.water!.filter(z => z.strength).length).toBeGreaterThanOrEqual(5)
    }
    expect(mirrored.size).toBe(2)
    expect(tides.size).toBeGreaterThan(4)
  })

  it('ends at a 7 × 7 arena at y = 0 behind the one boss shutter, a shallow tide in it', () => {
    for (const seed of SEEDS.slice(0, 8)) {
      const m = generateTidewaterLocks(seed)
      const arena = m.rooms.find(r => r.role === 'boss')!
      expect([arena.w, arena.h]).toEqual([7, 7])
      for (let j = arena.z0; j < arena.z0 + arena.h; j++) for (let i = arena.x0; i < arena.x0 + arena.w; i++) expect(m.terrain!.floor[j * m.w + i]).toBe(0)
      expect(m.doors.filter(d => d.boss).length).toBe(1)
      const z = m.terrain!.water!.find(w => w.room === arena.id)!
      expect(z.hi).toBeLessThan(DEEP)
    }
  })

  it('the verbs (and the buoys) reach the boss shutter, the weapon and every checkpoint', () => {
    for (const seed of SEEDS.slice(0, 8)) {
      const m = generateTidewaterLocks(seed)
      const t = m.terrain!
      const got = reach(m)
      const door = m.doors.find(d => d.boss)!
      expect(got.has(door.j * m.w + door.i), `seed ${seed}: boss door`).toBe(true)
      const weapon = t.rewards.find(r => r.kind === 'weapon')!
      expect(got.has(idx(m, weapon.x, weapon.z))).toBe(true)
      for (const c of t.checkpoints) expect(got.has(idx(m, c.x, c.z)), `seed ${seed}: checkpoint`).toBe(true)
      const lifts = t.lifts
      t.lifts = []
      expect(reach(m).has(door.j * m.w + door.i)).toBe(false)
      t.lifts = lifts
    }
  })

  it('every leap gap is one cell between equal floors', () => {
    for (const seed of SEEDS.slice(0, 8)) {
      const m = generateTidewaterLocks(seed)
      const t = m.terrain!
      for (const l of t.links!.filter(x => x.kind === 'leap')) {
        const ka = l.from[1] * m.w + l.from[0]
        const kb = l.to[1] * m.w + l.to[0]
        const di = l.to[0] - l.from[0]
        const dj = l.to[1] - l.from[1]
        expect(Math.abs(di) + Math.abs(dj)).toBe(2)
        expect(t.floor[ka]).toBe(t.floor[kb])
        expect(t.pit[(l.from[1] + dj / 2) * m.w + l.from[0] + di / 2]).toBe(1)
      }
    }
  })
})

describe('water', () => {
  const zone = (o: Partial<WaterZone> = {}): WaterZone => ({ i0: 0, j0: 0, i1: 3, j1: 3, lo: 0, hi: 2, room: 0, ...o })

  it('the tide rises, holds high, falls and holds low over its period; a lock is high until drained', () => {
    const z = zone({ period: 10 })
    expect(levelAt(z, 0)).toBeCloseTo(0)
    expect(levelAt(z, 3.5)).toBeCloseTo(2)
    expect(levelAt(z, 4.5)).toBeCloseTo(2)
    expect(levelAt(z, 9.5)).toBeCloseTo(0)
    expect(levelAt(z, 6.5)).toBeGreaterThan(0)
    expect(levelAt(z, 6.5)).toBeLessThan(2)
    const lock = zone({ valve: { i: 0, j: 0, side: 'n' } })
    expect(levelAt(lock, 5)).toBe(2)
    expect(levelAt(lock, 5, true)).toBe(0)
    expect(levelAt(zone(), 7)).toBe(0)
  })

  it('wading slows the walk with depth, never below half', () => {
    expect(wadeSpeed(0.1)).toBe(1)
    expect(wadeSpeed(0.6)).toBeLessThan(1)
    expect(wadeSpeed(0.6)).toBeGreaterThan(wadeSpeed(1.0))
    expect(wadeSpeed(3)).toBeCloseTo(0.5)
  })

  const map = generateTidewaterLocks(0)
  const t = map.terrain!

  it('reaches the walk where Flux wades (and the current pushes), and hurts out of his depth on a tick', () => {
    const hits: number[] = []
    const said: AtlasLine[] = []
    const f = new WaterFeature(hostFor(map, said, [], hits), t)
    const canal = t.water!.find(z => z.strength && z.dx)!
    const y = t.floor[canal.j0 * map.w + canal.i0]!
    const p = body(cellCenter(Math.round((canal.i0 + canal.i1) / 2)), cellCenter(canal.j0), y)
    f.update(1 / 60, 0, p, true)
    const m: MoveMod = { friction: 1, pushX: 0, pushZ: 0, speed: 1 }
    f.move(p, m)
    expect(m.speed!).toBeLessThan(1)
    expect(m.pushX).toBeCloseTo(canal.dx! * canal.strength!)
    expect(hits.length).toBe(0)
    // The lock, flooded: out of his depth.
    const lock = t.water!.find(z => z.valve)!
    const ci = Math.round((lock.i0 + lock.i1) / 2)
    const cj = Math.round((lock.j0 + lock.j1) / 2)
    const deep = body(cellCenter(ci), cellCenter(cj), t.floor[cj * map.w + ci]!)
    for (let n = 0; n < Math.ceil((DROWN_TICK * 2.5) * 60); n++) f.update(1 / 60, n / 60, deep, true)
    expect(hits.length).toBeGreaterThanOrEqual(2)
    expect(said).toContain('hint.tide.deep')
  })

  it('a shot on the valve drains the lock for good (from the room\'s side); it rides in the save', () => {
    const sfx: string[] = []
    const f = new WaterFeature(hostFor(map, [], sfx), t)
    const z = f.zones.find(r => r.def.valve)!
    const shot = (fromX: number, fromZ: number) => ({ px: fromX, py: z.vy, pz: fromZ, x: z.vx, y: z.vy, z: z.vz, radius: 0.15 }) as unknown as Shot
    expect(f.shot(shot(z.vx - z.nx * 2, z.vz - z.nz * 2))).toBe(false)
    expect(f.shot(shot(z.vx + z.nx * 4, z.vz + z.nz * 4))).toBe(true)
    for (let n = 0; n < 600; n++) f.update(1 / 60, n / 60, body(0, 0), true)
    expect(z.level).toBeCloseTo(z.def.lo)
    const g = new WaterFeature(hostFor(map), t)
    g.restore(f.save())
    expect(g.zones.find(r => r.def.valve)!.level).toBeCloseTo(z.def.lo)
    expect(sfx).toContain('door')
  })

  it('the mirror flips the current and the valve\'s wall', () => {
    const m = mirrorX(map)
    m.terrain!.water!.forEach((z, n) => {
      const o = t.water![n]!
      expect(z.i0).toBe(map.w - 1 - o.i1)
      if (o.dx) expect(z.dx).toBe(-o.dx)
      if (o.valve) expect(z.valve!.side).toBe(o.valve.side === 'e' ? 'w' : o.valve.side === 'w' ? 'e' : o.valve.side)
    })
  })
})

// ─── Pools and floods: water never stands on a floor in the open ─────────────

/** Every Tide map (both hands) and the Fortress's, whose flood vault is a lock. */
const WATER_MAPS = (): Array<{ map: MapData; where: string }> => {
  const out: Array<{ map: MapData; where: string }> = []
  for (const seed of SEEDS) {
    const m = generateTidewaterLocks(seed)
    out.push({ map: m, where: `tide ${seed}` }, { map: mirrorX(m), where: `tide ${seed} mirrored` })
  }
  for (const seed of SEEDS.slice(0, 4)) out.push({ map: generateVexFortress(seed), where: `fortress ${seed}` })
  return out
}

const inZone = (z: WaterZone, i: number, j: number) => i >= z.i0 && i <= z.i1 && j >= z.j0 && j <= z.j1
const cells = (z: WaterZone, w = 34): number[] => {
  const out: number[] = []
  for (let j = z.j0; j <= z.j1; j++) for (let i = z.i0; i <= z.i1; i++) out.push(j * w + i)
  return out
}

describe('pools and floods', () => {
  const all = WATER_MAPS()

  it('no water has a free edge: every cell beside it out of the water is a wall, a rim at or over its top, or a doorway a flood seals', () => {
    for (const { map: m, where } of all) {
      const t = m.terrain!
      for (const z of t.water!) {
        const sealed = z.flood ? lowDoors(m, z.room, z.hi) : []
        for (let j = z.j0; j <= z.j1; j++) {
          for (let i = z.i0; i <= z.i1; i++) {
            for (const [di, dj] of DIRS) {
              const ni = i + di
              const nj = j + dj
              if (inZone(z, ni, nj)) continue
              const nk = nj * m.w + ni
              if (m.cell[nk] === Cell.Void) continue
              // The same flood on the other side (the arena's runs on into a corridor).
              if (t.water!.some(o => o !== z && o.room === z.room && o.hi >= z.hi && inZone(o, ni, nj))) continue
              // A sealed door's own frame: the edge between its cell and the
              // cell it faces.
              if (sealed.some(id => {
                const d = m.doors[id]!
                const fi = d.i + (d.axis === 'x' ? d.dir : 0)
                const fj = d.j + (d.axis === 'z' ? d.dir : 0)
                return (d.i === ni && d.j === nj && fi === i && fj === j) || (d.i === i && d.j === j && fi === ni && fj === nj)
              })) continue
              const at = `${where}: water room ${z.room} at (${i}, ${j}) beside (${ni}, ${nj})`
              expect(t.pit[nk], `${at}: a pit`).toBe(0)
              // What stands at the shared edge (a ramp: its height there).
              expect(edgeHeight(m, ni, nj, -di, -dj), at).toBeGreaterThanOrEqual(z.hi - 1e-6)
            }
          }
        }
      }
    }
  })

  it('still and running water fills a sunk basin: its surface under the rim, the basin floor under it, never level with a floor', () => {
    for (const { map: m, where } of all) {
      const t = m.terrain!
      for (const z of t.water!.filter(w => !w.period && !w.valve)) {
        expect(z.lo, where).toBe(z.hi)
        let wet = 0
        for (let j = z.j0; j <= z.j1; j++) {
          for (let i = z.i0; i <= z.i1; i++) {
            const k = j * m.w + i
            if (t.pit[k]) continue
            // The water and a floor never share a plane (2 cm at least).
            expect(Math.abs(t.floor[k]! - z.hi), `${where} (${i}, ${j})`).toBeGreaterThan(0.02)
            if (t.floor[k]! < z.hi) wet++
            // Out of its pits, a pool's floor is under its surface or a full
            // step over it (an island): nothing stands awash.
            expect(t.floor[k]! < z.hi || t.floor[k]! >= z.hi + POOL_FREEBOARD - 1e-6, `${where} (${i}, ${j})`).toBe(true)
          }
        }
        if (wet) {
          // A rim round a basin: the pool's surface is POOL_FREEBOARD under it.
          for (const e of rimEdges(m, z)) expect(e.y - z.hi, where).toBeGreaterThanOrEqual(POOL_FREEBOARD - 1e-6)
        }
      }
    }
  })

  it('the Tide\'s wading water is let into the floor (Shallows, Canal, Puffer pool, Spillway), with a coping round each pool', () => {
    const m = generateTidewaterLocks(SEEDS[3]!)
    const t = m.terrain!
    const sunk = t.water!.filter(z => !z.period && !z.valve && cells(z).some(k => !t.pit[k] && t.floor[k]! < z.hi))
    // Shallows, Canal, Puffer pool and the Spillway's four channels.
    expect(sunk.length).toBe(7)
    for (const z of sunk) {
      expect(rimEdges(m, z).length, `room ${z.room}`).toBeGreaterThan(0)
      for (const k of cells(z)) expect(t.floor[k]!).toBeLessThan(z.hi)
    }
  })

  it('every water room is crossed from its way in to its way out on foot (no step over STEP_UP), drained or flooded alike', () => {
    for (const { map: m, where } of all) {
      const t = m.terrain!
      for (const room of new Set(t.water!.map(z => z.room))) {
        const r = m.rooms[room]!
        if (r.role === 'boss') continue
        const din = m.doors.find(d => d.to === room)!
        const dout = m.doors.find(d => d.from === room && !d.boss) ?? m.doors.find(d => d.from === room)!
        const allow = new Set<number>([din.j * m.w + din.i, dout.j * m.w + dout.i])
        for (let k = 0; k < m.cell.length; k++) if ((m.room[k] === room && m.cell[k] === Cell.Room) || m.cell[k] === Cell.Corridor) allow.add(k)
        // Water never changes what a foot can stand on: the same route holds
        // with it high or drained. A flood keeps its way out over its top.
        expect(reachFrom(m, din.j * m.w + din.i, allow).has(dout.j * m.w + dout.i), `${where}: room ${room}`).toBe(true)
        for (const z of t.water!.filter(w => w.room === room && w.flood)) expect(lowDoors(m, room, z.hi), where).not.toContain(dout.id)
      }
    }
  })

  it('no ground machine is leashed to a one-cell strip at a doorway (it would plug the way out)', () => {
    for (const { map: m, where } of all) {
      const t = m.terrain!
      for (const f of t.foes.filter(x => x.role === 'ground')) {
        const [x0, z0, x1, z1] = f.leash!
        const i0 = Math.floor(x0 / CELL)
        const i1 = Math.floor(x1 / CELL)
        const j0 = Math.floor(z0 / CELL)
        const j1 = Math.floor(z1 / CELL)
        for (const d of m.doors.filter(x => x.from === f.room || x.to === f.room)) {
          // The room's cell at the doorway (the corridor runs along the door's axis).
          const side = d.from === f.room ? -1 : 1
          const ci = d.axis === 'x' ? d.i + d.dir * side * -1 : d.i
          const cj = d.axis === 'z' ? d.j + d.dir * side * -1 : d.j
          const cells = [[ci, cj], [d.i + 1, d.j], [d.i - 1, d.j], [d.i, d.j + 1], [d.i, d.j - 1]]
            .filter(([i, j]) => m.room[j! * m.w + i!] === f.room && m.cell[j! * m.w + i!] === Cell.Room)
          for (const [i, j] of cells) {
            if (i! < i0 || i! > i1 || j! < j0 || j! > j1) continue
            const narrow = d.axis === 'x' ? i0 === i1 : j0 === j1
            expect(narrow, `${where}: ground post in room ${f.room} at door ${d.id}`).toBe(false)
          }
        }
      }
    }
  })

  it('the coping, the inlets and the drain never lay a face in another\'s plane, nor in a floor\'s or the water\'s', () => {
    for (const { map: m, where } of all.slice(0, 6)) {
      const t = m.terrain!
      for (const z of t.water!) {
        const edges = rimEdges(m, z)
        const parts = poolRimParts(edges)
        // The floors round it, as flat quads at their heights.
        const floors: BufferGeometry[] = []
        for (let j = z.j0 - 1; j <= z.j1 + 1; j++) {
          for (let i = z.i0 - 1; i <= z.i1 + 1; i++) {
            const k = j * m.w + i
            if (i < 0 || j < 0 || i >= m.w || j >= m.h || m.cell[k] === Cell.Void || t.pit[k] || t.ramp[k]) continue
            floors.push(new PlaneGeometry(CELL, CELL).rotateX(-Math.PI / 2).translate(cellCenter(i), t.floor[k]!, cellCenter(j)))
          }
        }
        expect(coplanarOverlaps([...parts, ...floors]), `${where}: room ${z.room}`).toBe(0)
        // The coping's top is clear of the water at every level it holds.
        for (const e of edges) expect(e.y + COPE_UP - z.hi, where).toBeGreaterThan(0.02)
      }
    }
    expect(coplanarOverlaps(inletParts())).toBe(0)
    const drain = drainParts()
    expect(coplanarOverlaps([...drain, new PlaneGeometry(4, 4).rotateX(-Math.PI / 2)])).toBe(0)
    expect(DRAIN_UP).toBeGreaterThanOrEqual(0.02)
  })
})

describe('a flood seals its room first', () => {
  /** A host whose doors open and slam over time (the mission's pace). */
  const doorHost = (map: MapData) => {
    const open = new Map<number, number>()
    const held = new Set<number>()
    const closing = new Set<number>()
    const released: number[] = []
    for (const d of map.doors) open.set(d.id, 1)
    const host = hostFor(map)
    Object.assign(host, {
      doorOpen: (id: number) => open.get(id) ?? 0,
      doorHeld: (id: number) => held.has(id),
      shutDoor: (id: number) => { held.add(id); closing.add(id) },
      releaseDoor: (id: number) => { held.delete(id); closing.delete(id); released.push(id); open.set(id, 1) },
      roomClear: () => false
    })
    const step = (dt: number) => {
      for (const id of closing) {
        const o = Math.max(0, (open.get(id) ?? 0) - dt * 2)
        open.set(id, o)
        if (o <= 0) closing.delete(id)
      }
    }
    return { host, open, held, released, step }
  }

  for (const mirrored of [false, true]) {
    it(`the tide steps: the door behind shuts before a drop comes in, no doorway open under the waterline, inlets pour, it drains and opens on top${mirrored ? ' (mirrored)' : ''}`, () => {
      const base = generateTidewaterLocks(SEEDS[2]!)
      const m = mirrored ? mirrorX(base) : base
      const t = m.terrain!
      const z = t.water!.find(w => w.flood && m.rooms[w.room]!.role !== 'boss')!
      const { host, open, released, step } = doorHost(m)
      const f = new WaterFeature(host, t)
      const zr = f.zones.find(r => r.def === z)!
      expect(zr.flood!.inlets.length).toBeGreaterThanOrEqual(1)
      expect(zr.flood!.drain).not.toBeNull()
      const low = lowDoors(m, z.room, z.hi)
      expect(low.length).toBeGreaterThan(0)
      const sill = (id: number) => t.floor[m.doors[id]!.j * m.w + m.doors[id]!.i]!
      // Into the room, past the doorway, on its lowest floor.
      const din = m.doors.find(d => d.to === z.room)!
      const ii = din.axis === 'x' ? din.i + din.dir * 2 : din.i
      const jj = din.axis === 'z' ? din.j + din.dir * 2 : din.j
      const p = body(cellCenter(ii), cellCenter(jj), t.floor[jj * m.w + ii]!)
      let peak = -Infinity
      const dt = 1 / 30
      for (let n = 0; n < Math.ceil((z.period! * 2) / dt); n++) {
        step(dt)
        f.update(dt, n * dt, p, true)
        peak = Math.max(peak, zr.level)
        for (const id of low) {
          if (zr.level > sill(id)) expect(open.get(id), `door ${id} open under the water at ${(n * dt).toFixed(2)} s`).toBe(0)
        }
      }
      expect(peak).toBeGreaterThan(t.floor[jj * m.w + ii]! + DEEP)
      expect(zr.mesh.mat.uniforms.uChurn).toBeDefined()
      // Up on the top step over the waterline: it drains, then the door opens.
      let top = -Infinity
      let tk = -1
      for (let j = z.j0; j <= z.j1; j++) for (let i = z.i0; i <= z.i1; i++) {
        const k = j * m.w + i
        if (m.room[k] === z.room && !t.ramp[k] && t.floor[k]! > top) { top = t.floor[k]!; tk = k }
      }
      p.x = cellCenter(tk % m.w)
      p.z = cellCenter(Math.floor(tk / m.w))
      p.y = top
      const t0 = Math.ceil((z.period! * 2) / dt) * dt
      for (let n = 0; n < 300; n++) {
        step(dt)
        f.update(dt, t0 + n * dt, p, true)
        for (const id of low) if (zr.level > sill(id)) expect(open.get(id)).toBe(0)
      }
      expect(zr.flood!.state).toBe('done')
      expect(zr.level).toBeLessThan(t.floor[jj * m.w + ii]!)
      for (const id of low) expect(released).toContain(id)
    })
  }

  it('the arena floods only once its shutter is down, and drains when the way on opens', () => {
    const m = generateTidewaterLocks(SEEDS[4]!)
    const t = m.terrain!
    const arena = m.rooms.find(r => r.role === 'boss')!
    const z = t.water!.find(w => w.room === arena.id)!
    expect(z.flood).toBe(true)
    const { host, open, step } = doorHost(m)
    const f = new WaterFeature(host, t)
    const zr = f.zones.find(r => r.def === z)!
    const bossDoor = m.doors.find(d => d.boss)!
    const p = body(cellCenter(arena.x0 + 3), cellCenter(arena.z0 + 3), 0)
    const dt = 1 / 30
    for (let n = 0; n < 120; n++) { step(dt); f.update(dt, n * dt, p, true) }
    // The shutter is the mission's: open, so nothing comes in.
    expect(zr.level).toBe(z.lo)
    open.set(bossDoor.id, 0)
    let peak = -Infinity
    for (let n = 120; n < 120 + Math.ceil(z.period! / dt); n++) {
      step(dt)
      f.update(dt, n * dt, p, true)
      peak = Math.max(peak, zr.level)
      for (const id of lowDoors(m, arena.id, z.hi)) if (zr.level > 0) expect(open.get(id)).toBe(0)
    }
    expect(peak).toBeGreaterThan(0.5)
    // The boss down, the lesson room's door opens: the water goes.
    const exit = m.doors.find(d => d.from === arena.id && !d.boss)
    if (exit) open.set(exit.id, 0.1)
    else (host as unknown as { roomClear: () => boolean }).roomClear = () => true
    for (let n = 0; n < 120; n++) f.update(dt, 100 + n * dt, p, true)
    expect(zr.level).toBeLessThanOrEqual(0)
    expect(zr.flood!.state).toBe('done')
  })
})
