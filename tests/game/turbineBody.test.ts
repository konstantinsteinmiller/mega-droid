// @vitest-environment jsdom
// A wind turbine (`sim/stages/wind.ts`) is solid: Flux walked through its
// mast (placement audit 2026-10-12), and one stands in the Sky Docks' boss
// arena. Its post is a `nav.props` circle, so bodies walk round it — and it
// must never cut a way off: every doorway of its room and every floor spot
// that was reachable without it still is, walked on a fine grid with Flux's
// own radius, in every stage with gusts, both hands.

import { describe, expect, it, vi } from 'vitest'

vi.mock('@/use/useAds', () => ({ showMidgameAd: async () => {} }))
vi.mock('@/use/useAdGate', () => ({ canShowInterstitial: () => false, markInterstitialShown: () => {} }))
vi.mock('@/use/useCrazyGames', () => ({ triggerHappytime: () => {} }))
vi.mock('@/game/engine/app', () => ({ app: { setMode: () => {}, setWanted: () => {} } }))

import { Group, Scene } from 'three'
import { CELL, Cell, type MapData, type WindZone } from '@/game/world/levelGen'
import { createNav, moveBody, type Nav } from '@/game/world/nav'
import { generateStage } from '@/game/world/stages'
import { THEMES, type SectorId } from '@/game/world/themes'
import { SECTOR_BY_ID } from '@/game/data/regions'
import type { ClimbHost } from '@/game/sim/climb'
import { WindFeature, turbineSpot, TURBINE_R } from '@/game/sim/stages/wind'
import { PLAYER_R } from '@/game/sim/constants'

const STAGES: SectorId[] = ['gale', 'rotor', 'fortress']
const SEEDS = [0, 1, 2, 3, 7]
/** The walk grid's step (m). */
const STEP = 0.25

const hostFor = (map: MapData, sector: SectorId): ClimbHost & { nav: Nav } => {
  const scene = new Scene()
  const noop = () => {}
  return {
    nav: createNav(map), map, theme: THEMES[sector],
    combat: { maxHp: 100 } as ClimbHost['combat'],
    fx: { sparks: noop, riseRing: noop, emit: noop } as unknown as ClimbHost['fx'],
    markers: { spawn: noop } as unknown as ClimbHost['markers'],
    shocks: { spawn: noop } as unknown as ClimbHost['shocks'],
    hitPlayer: () => 'hit', sfx: noop, shake: noop, onPickup: noop, propParent: () => scene,
    scene, time: 0, level: { root: new Group(), rooms: [], sky: null as never, bounds: [], owner: new Int16Array(0) },
    enemyLevel: 1, encounters: SECTOR_BY_ID[sector].encounters, addEnemy: noop, say: noop
  }
}

/** Grid points of zone `z`'s room (and a cell round it, for its doorways)
 *  a body of PLAYER_R stands on at the zone's floor, clear of everything
 *  else and of the posts; flood-filled from `from`. */
const walk = (m: MapData, z: WindZone, y: number, posts: Array<{ x: number; z: number; r: number }>, from: [number, number]): Set<string> => {
  const t = m.terrain!
  const r = m.rooms[z.room]!
  const ok = (i: number, j: number): boolean => {
    if (i < 0 || j < 0 || i >= m.w || j >= m.h) return false
    const k = j * m.w + i
    return m.cell[k] !== Cell.Void && !t.pit[k] && !m.navBlock[k] && Math.abs(t.floor[k]! - y) < 0.05
  }
  const x0 = (r.x0 - 1) * CELL
  const z0 = (r.z0 - 1) * CELL
  const nx = Math.round(((r.w + 2) * CELL) / STEP)
  const nz = Math.round(((r.h + 2) * CELL) / STEP)
  const free = (gx: number, gz: number): boolean => {
    const px = x0 + (gx + 0.5) * STEP
    const pz = z0 + (gz + 0.5) * STEP
    const i0 = Math.floor((px - PLAYER_R) / CELL)
    const i1 = Math.floor((px + PLAYER_R) / CELL)
    const j0 = Math.floor((pz - PLAYER_R) / CELL)
    const j1 = Math.floor((pz + PLAYER_R) / CELL)
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      if (ok(i, j)) continue
      const cx = Math.max(i * CELL, Math.min(px, (i + 1) * CELL))
      const cz = Math.max(j * CELL, Math.min(pz, (j + 1) * CELL))
      if (Math.hypot(px - cx, pz - cz) < PLAYER_R) return false
    }
    return posts.every(p => Math.hypot(px - p.x, pz - p.z) >= p.r + PLAYER_R)
  }
  const seen = new Set<string>()
  const start: [number, number] = [Math.floor((from[0] - x0) / STEP), Math.floor((from[1] - z0) / STEP)]
  const stack = [start]
  while (stack.length) {
    const [gx, gz] = stack.pop()!
    const key = `${gx},${gz}`
    if (seen.has(key) || gx < 0 || gz < 0 || gx >= nx || gz >= nz || !free(gx, gz)) continue
    seen.add(key)
    stack.push([gx + 1, gz], [gx - 1, gz], [gx, gz + 1], [gx, gz - 1])
  }
  return seen
}

describe('wind turbines are solid', () => {
  it('a body walks round the post, never through it', () => {
    for (const sector of STAGES) {
      const m = generateStage(sector, 0)
      const host = hostFor(m, sector)
      const before = host.nav.props.length
      new WindFeature(host, m.terrain!)
      const posts = host.nav.props.slice(before)
      expect(posts, sector).toHaveLength(m.terrain!.wind!.length)
      for (const p of posts) {
        // Walking straight at its mast from a metre and a half out.
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const out: [number, number] = [0, 0]
          const sx = p.x - dx * 1.5
          const sz = p.z - dz * 1.5
          moveBody(host.nav, sx, sz, 0, dx * 1.5, dz * 1.5, PLAYER_R, out)
          expect(Math.hypot(out[0] - p.x, out[1] - p.z), `${sector}`).toBeGreaterThanOrEqual(TURBINE_R + PLAYER_R - 0.01)
        }
      }
    }
  })

  it('cuts no way off: every doorway and every floor spot of its room is still reached', () => {
    for (const sector of STAGES) {
      for (const seed of SEEDS) {
        const m = generateStage(sector, seed)
        const t = m.terrain!
        for (const z of t.wind!) {
          const y = t.floor[z.j0 * m.w + z.i0]!
          const at = turbineSpot(m, z, y)
          const post = { x: at.x, z: at.z, r: TURBINE_R }
          const room = m.rooms[z.room]!
          // Its doorways at the zone's height: the room cell inside each.
          const doors = m.doors.filter(d => d.from === z.room || d.to === z.room).flatMap(d => {
            const inside = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([a, b]) => [d.i + a!, d.j + b!] as const)
              .find(([i, j]) => m.room[j * m.w + i] === z.room && Math.abs(t.floor[j * m.w + i]! - y) < 0.05)
            return inside ? [[(inside[0] + 0.5) * CELL, (inside[1] + 0.5) * CELL] as [number, number]] : []
          })
          const where = `${sector} seed ${seed} room ${z.room}`
          if (!doors.length) {
            // A boss stage's hall with no doors (the falls carry Flux in): its middle.
            doors.push([(room.x0 + room.w / 2) * CELL, (room.z0 + room.h / 2) * CELL])
          }
          const bare = walk(m, z, y, [], doors[0]!)
          const withPost = walk(m, z, y, [post], doors[0]!)
          expect(bare.size, `${where}: the walk found its floor`).toBeGreaterThan(200)
          for (const d of doors) {
            const key = `${Math.floor((d[0] - (room.x0 - 1) * CELL) / STEP)},${Math.floor((d[1] - (room.z0 - 1) * CELL) / STEP)}`
            if (bare.has(key)) expect(withPost.has(key), `${where}: a doorway cut off`).toBe(true)
          }
          // Only the post's own ring is lost.
          let lost = 0
          for (const key of bare) if (!withPost.has(key)) lost++
          const ring = Math.PI * (TURBINE_R + PLAYER_R + STEP) ** 2 / (STEP * STEP)
          expect(lost, where).toBeLessThanOrEqual(ring)
          // And it stands on no doorway, checkpoint or machine's post.
          const ci = Math.floor(at.x / CELL)
          const cj = Math.floor(at.z / CELL)
          for (const d of m.doors) expect(Math.abs(d.i - ci) + Math.abs(d.j - cj) <= 1, `${where}: by a doorway`).toBe(false)
          for (const c of t.checkpoints) expect(Math.hypot(c.x - at.x, c.z - at.z) >= TURBINE_R + PLAYER_R, `${where}: on a checkpoint`).toBe(true)
          for (const f of t.foes) if (f.role !== 'flyer') expect(Math.hypot(f.x - at.x, f.z - at.z) >= TURBINE_R + 1, `${where}: on a machine`).toBe(true)
        }
      }
    }
  })
})
