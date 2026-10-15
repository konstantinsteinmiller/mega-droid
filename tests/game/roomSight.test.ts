// @vitest-environment jsdom
// What a room can see over its walls (`world/roomSight.ts`) and what portal
// culling draws with it. Playtest 2026-10-11: in Sky Docks the wind tunnel
// (the turbine's room) stood metres over the shuttle chain beside it and was
// simply not there until Flux went through its door, and over open sky the
// door frames stood as lone arches where both their rooms were culled. The
// rule: a room the player can see is drawn whole; a hidden room shows nothing
// of itself — not its frames, not a track or cart running through it.

import { describe, expect, it, vi } from 'vitest'

vi.mock('@/use/useAds', () => ({ showMidgameAd: async () => {} }))
vi.mock('@/use/useAdGate', () => ({ canShowInterstitial: () => false, markInterstitialShown: () => {} }))
vi.mock('@/use/useCrazyGames', () => ({ triggerHappytime: () => {} }))
vi.mock('@/game/engine/app', () => ({ app: { setMode: () => {}, setWanted: () => {} } }))
vi.mock('@/game/audio/sfx', () => ({ sfx: () => {} }))
vi.mock('@/game/world/textures', async (orig) => {
  const { Texture } = await import('three')
  return { ...(await orig<object>()), levelAtlas: () => new Texture() }
})

import { Group, PerspectiveCamera, Scene } from 'three'
import { CELL, Cell, generateMap, type MapData } from '@/game/world/levelGen'
import { cellOwners } from '@/game/world/levelMesh'
import { buildClimbLevel } from '@/game/world/climbMesh'
import { roomSight } from '@/game/world/roomSight'
import { generateStage } from '@/game/world/stages'
import { generateSkyDocks } from '@/game/world/stages/gale'
import { generateClimb } from '@/game/world/climbGen'
import { THEMES, type SectorId } from '@/game/world/themes'
import { SECTOR_BY_ID } from '@/game/data/regions'
import { createNav, type Nav } from '@/game/world/nav'
import { buildDoor } from '@/game/models/props'
import { Mission } from '@/game/sim/mission'
import { hud } from '@/game/state/hud'
import { RailFeature } from '@/game/sim/stages/rail'
import { WindFeature } from '@/game/sim/stages/wind'
import type { ClimbHost } from '@/game/sim/climb'

const STAGES: SectorId[] = ['blaze', 'cryo', 'volt', 'gale', 'magnet', 'drill', 'tide', 'neon', 'rotor', 'fortress']
const SEEDS = [1, 2, 4242]
/** The fog's reach the mission passes (the widest theme's). */
const FAR = 86

const sightOf = (m: MapData): number[][] => roomSight(m, cellOwners(m), { far: FAR })

describe('roomSight: a room sees what stands in plain view', () => {
  it('every stage: the next room on the route, and a room sharing an open edge, is drawn from each room', () => {
    for (const s of STAGES) {
      for (const seed of SEEDS) {
        const m = generateStage(s, seed)
        const sight = sightOf(m)
        for (const d of m.doors) {
          expect(sight[d.from], `${s}/${seed}: room ${d.from} → next room ${d.to}`).toContain(d.to)
          expect(sight[d.to], `${s}/${seed}: room ${d.to} → previous room ${d.from}`).toContain(d.from)
        }
        // Two rooms whose cells meet with no wall between (no door either):
        // nothing stands in that edge, so each sees the other.
        const own = cellOwners(m)
        const doorEdges = new Set(m.doors.map(d => `${d.j * m.w + d.i}:${(d.j + (d.axis === 'z' ? d.dir : 0)) * m.w + d.i + (d.axis === 'x' ? d.dir : 0)}`))
        for (let j = 0; j < m.h; j++) {
          for (let i = 0; i < m.w; i++) {
            const k = j * m.w + i
            if (m.cell[k] === Cell.Void) continue
            for (const [di, dj] of [[1, 0], [0, 1]] as const) {
              if (i + di >= m.w || j + dj >= m.h) continue
              const n = (j + dj) * m.w + i + di
              if (m.cell[n] === Cell.Void || own[k] === own[n] || own[k]! < 0 || own[n]! < 0) continue
              if (doorEdges.has(`${k}:${n}`) || doorEdges.has(`${n}:${k}`)) continue
              expect(sight[own[k]!], `${s}/${seed}: open edge ${i},${j}`).toContain(own[n])
              expect(sight[own[n]!], `${s}/${seed}: open edge ${i},${j}`).toContain(own[k])
            }
          }
        }
      }
    }
  })

  it('Sky Docks: the turbine room is drawn from the shuttle chain, and seen over the walls from farther back', () => {
    for (const seed of SEEDS) {
      const m = generateSkyDocks(seed)
      const turbineRoom = m.terrain!.wind![0]!.room
      const before = m.doors.find(d => d.to === turbineRoom)!.from
      const sight = sightOf(m)
      expect(sight[before]).toContain(turbineRoom)
      // The first leaps are no door of the wind tunnel's: only a sight line
      // over the walls (the tunnel's stand 4 m over theirs) puts it there.
      const firstLeaps = m.doors.find(d => d.to === before)!.from
      expect(m.doors.some(d => (d.from === firstLeaps && d.to === turbineRoom) || (d.to === firstLeaps && d.from === turbineRoom))).toBe(false)
      expect(sight[firstLeaps]).toContain(turbineRoom)
    }
  })

  it('#166: rooms two doors on, and rooms side by side, are always drawn (no room popping in at a door)', () => {
    for (const s of STAGES) {
      for (const seed of SEEDS) {
        const m = generateStage(s, seed)
        const sight = sightOf(m)
        const next = new Map<number, Set<number>>()
        for (const d of m.doors) {
          if (d.from < 0 || d.to < 0) continue
          if (!next.has(d.from)) next.set(d.from, new Set())
          if (!next.has(d.to)) next.set(d.to, new Set())
          next.get(d.from)!.add(d.to)
          next.get(d.to)!.add(d.from)
        }
        for (const [a, ns] of next) {
          for (const b of ns) {
            for (const c of next.get(b) ?? []) {
              if (c !== a) expect(sight[a], `${s}/${seed}: room ${a} → ${c} via ${b}`).toContain(c)
            }
          }
        }
      }
    }
  })

  it('keeps the culling where walls really hide a room', () => {
    for (const s of STAGES) {
      const m = generateStage(s, 1)
      const n = m.rooms.length
      const seen = sightOf(m).reduce((a, l) => a + l.length, 0)
      // Far from every room seeing every other (#166 draws two doors ahead, so a
      // small map like Blaze sees over half its pairs; the rest stays culled).
      expect(seen, s).toBeLessThan(n * (n - 1) * 0.7)
    }
  })

  it('the labyrinth keeps its pure portals (flat floors, 4.2 m walls)', () => {
    for (const seed of SEEDS) {
      const m = generateMap({ seed, rooms: 8, boss: false })
      expect(m.terrain).toBeUndefined()
      expect(sightOf(m).every(l => l.length === 0)).toBe(true)
    }
  })

  it('the Tower Run (a climb map) gets the same rule', () => {
    const m = generateClimb(3)
    const sight = sightOf(m)
    for (const d of m.doors) expect(sight[d.from]).toContain(d.to)
  })
})

describe('nothing of a culled room shows', () => {
  it('a stage level is rooms and door frames only: one frame group per door, none always on', async () => {
    const m = generateSkyDocks(1)
    const level = await buildClimbLevel(m, THEMES.gale)
    expect(level.doorFrames).toHaveLength(m.doors.length)
    for (const c of level.root.children) {
      const room = level.rooms.indexOf(c as Group)
      const frame = level.doorFrames!.indexOf(c)
      expect(room >= 0 || frame >= 0, `stray level part ${c.name || c.type}`).toBe(true)
    }
    // Each frame stands at its own door (not in a room's group).
    m.doors.forEach((d, n) => {
      const f = level.doorFrames![n]!
      expect(level.rooms.some(r => r.children.includes(f))).toBe(false)
      let near = false
      f.traverse(o => {
        const g = (o as { geometry?: { computeBoundingSphere(): void; boundingSphere: { center: { x: number; z: number } } | null } }).geometry
        if (!g) return
        g.computeBoundingSphere()
        const c = g.boundingSphere!.center
        if (Math.hypot(c.x - (d.i + 0.5) * CELL, c.z - (d.j + 0.5) * CELL) < CELL * 1.5) near = true
      })
      expect(near, `door ${n}`).toBe(true)
    })
  })

  it('portal culling hides a door frame with its door, and shows a seen room over its wall', () => {
    // Three rooms in a row along x, 4 cells each: 0 | 1 | 2, doors 0–1 and
    // 1–2; room 0 sees room 2 over the walls (a taller room beyond).
    const W = 12
    const owner = new Int16Array(W)
    for (let i = 0; i < W; i++) owner[i] = Math.floor(i / 4)
    const rooms = [new Group(), new Group(), new Group()]
    const door = (from: number, to: number, x: number) => ({
      mesh: buildDoor(THEMES.scrapyard, false), frame: new Group(), from, to, x, z: CELL / 2, y: 0, open: 0, opening: false
    })
    const doors = [door(0, 1, 4 * CELL), door(1, 2, 8 * CELL)]
    const camera = new PerspectiveCamera(70, 16 / 9, 0.1, 1000)
    camera.position.set(1.5 * CELL, 1.6, CELL / 2)
    camera.lookAt(20 * CELL, 1.6, CELL / 2)
    const fake = {
      player: { x: 1.5 * CELL, z: CELL / 2 },
      theme: { fogFar: 200 },
      level: { rooms, owner, bounds: rooms.map((_, i) => ({ x: (i * 4 + 2) * CELL, z: 0, r: 2 * CELL })) },
      roomVis: new Uint8Array(3),
      sight: [[] as number[], [], []],
      cullAdded: [] as number[],
      camera,
      map: { w: W },
      climb: null,
      debugCam: null,
      doors,
      enemies: []
    }
    hud.phase = 'play'
    const cull = (Mission.prototype as unknown as { updateRoomCulling(this: unknown): void }).updateRoomCulling
    cull.call(fake)
    expect(rooms.map(r => r.visible)).toEqual([true, false, false])
    expect(doors.map(d => d.frame.visible)).toEqual([true, false])
    // Room 0 sees room 2 over the walls: drawn with its door and frame, the
    // shut door between them notwithstanding.
    fake.sight = [[2], [], [0]]
    cull.call(fake)
    expect(rooms.map(r => r.visible)).toEqual([true, false, true])
    expect(doors.map(d => d.frame.visible)).toEqual([true, true])
    expect(doors.map(d => d.frame.visible)).toEqual(doors.map(d => d.mesh.root.visible))
  })

  const hostFor = (m: MapData, sector: SectorId): ClimbHost & { nav: Nav } => {
    const scene = new Scene()
    const noop = () => {}
    return {
      nav: createNav(m), map: m, theme: THEMES[sector],
      combat: { maxHp: 100 } as ClimbHost['combat'],
      fx: { sparks: noop, riseRing: noop, emit: noop } as unknown as ClimbHost['fx'],
      markers: { spawn: noop } as unknown as ClimbHost['markers'],
      shocks: { spawn: noop } as unknown as ClimbHost['shocks'],
      hitPlayer: () => 'hit', sfx: noop, shake: noop, onPickup: noop, propParent: () => scene,
      scene, time: 0, level: { root: new Group(), rooms: [], sky: null as never, bounds: [], owner: cellOwners(m) },
      enemyLevel: 1, encounters: SECTOR_BY_ID[sector].encounters, addEnemy: noop, say: noop
    }
  }

  it('a rail track spanning rooms shows while one of them does; its cart with the room it stands in', () => {
    const m = generateStage('volt', 1)
    const def = m.terrain!.rails![0]!
    const host = hostFor(m, 'volt')
    const f = new RailFeature(host, def)
    const track = host.scene.children[0]!
    const cart = host.scene.children[1]!
    const vis = new Uint8Array(m.rooms.length)
    f.cull(vis)
    expect(track.visible).toBe(false)
    expect(cart.visible).toBe(false)
    // The cart waits in the rail's room; the track runs on through others.
    vis[def.room] = 1
    f.cull(vis)
    expect(track.visible).toBe(true)
    expect(cart.visible).toBe(true)
    vis.fill(0)
    const own = cellOwners(m)
    const last = def.points[def.points.length - 1]!
    const far = own[Math.floor(last.z / CELL) * m.w + Math.floor(last.x / CELL)]!
    expect(far).not.toBe(def.room)
    vis[far] = 1
    f.cull(vis)
    expect(track.visible).toBe(true)
    expect(cart.visible).toBe(false)
  })

  it('the wind streaks hide with the rooms they blow in', () => {
    const m = generateSkyDocks(1)
    const host = hostFor(m, 'gale')
    const f = new WindFeature(host, m.terrain!)
    const streaks = host.scene.children.find(o => (o as { isInstancedMesh?: boolean }).isInstancedMesh)!
    streaks.visible = true
    const vis = new Uint8Array(m.rooms.length)
    f.cull(vis)
    expect(streaks.visible).toBe(false)
    streaks.visible = true
    vis[m.terrain!.wind![0]!.room] = 1
    f.cull(vis)
    expect(streaks.visible).toBe(true)
  })
})
