// Flyers and decks (sim/climb.ts `tendFoe`, sim/enemies.ts `groundUnder`).
// Roadmap: in the Gale Master's Sky Docks a rotor drone over a raised deck
// followed Flux down to the lower deck by sinking straight through the
// deck's slab — its hover band chased his height with no floor under it.
// Now a flyer never sinks below the ground under any of its body, and a low
// one never slides in under a deck's edge: it holds, or goes round.

import { describe, expect, it, vi } from 'vitest'

vi.mock('@/game/fx/markers', async () => {
  const { Mesh, Group } = await import('three')
  return { makeBlobShadow: () => new Mesh(), makeTeleRing: () => new Group(), setTeleRing: () => {} }
})
vi.mock('@/game/world/textures', async (orig) => {
  const { Texture } = await import('three')
  return { ...(await orig<object>()), levelAtlas: () => new Texture(), glowTexture: () => new Texture(), ringTexture: () => new Texture() }
})
vi.mock('@/use/useAds', () => ({ showMidgameAd: async () => {} }))
vi.mock('@/use/useAdGate', () => ({ canShowInterstitial: () => false, markInterstitialShown: () => {} }))
vi.mock('@/use/useCrazyGames', () => ({ triggerHappytime: () => {} }))
vi.mock('@/game/engine/app', () => ({ app: { setMode: () => {}, setWanted: () => {} } }))

import { createEnemy, groundUnder, keepClear, shove, tooTallFor, type Enemy } from '@/game/sim/enemies'
import { ClimbRun } from '@/game/sim/climb'
import { createNav, groundAt, isSolidCell, moveCircle, resolveCircle, STEP_UP, type Nav } from '@/game/world/nav'
import { CELL, Cell, generateMap, type MapData } from '@/game/world/levelGen'
import { generateStage } from '@/game/world/stages'
import type { EnemyKind } from '@/game/models/enemies'
import type { World } from '@/game/sim/world'

const SECTORS = ['blaze', 'cryo', 'volt', 'gale', 'magnet', 'drill', 'tide', 'neon', 'rotor', 'fortress'] as const
const FLYERS: EnemyKind[] = ['heli', 'polar', 'puffer', 'hornet', 'spotter']
const DIRS: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]]
const DT = 1 / 30
const tend = (map: MapData, e: Enemy, playerY: number): void =>
  ClimbRun.prototype.tendFoe.call({ host: { map } } as unknown as ClimbRun, e, playerY, DT)

/** No part of it in a wall, nor in a raised block. */
const expectClear = (map: MapData, nav: Nav, e: Enemy, where: string): void => {
  const [rx, rz] = resolveCircle(nav, e.x, e.z, e.def.radius)
  expect(Math.hypot(rx - e.x, rz - e.z), `${where}: in a wall`).toBeLessThan(1e-6)
  expect(tooTallFor(map, e, e.x, e.z), `${where}: in a block`).toBe(false)
  // Spelled out, independent of the rule under test: the ground under any of
  // its footprint is below its underside (or a step over its floor)
  const f = e.floor ?? 0
  const g = groundUnder(map, e.x, e.z, e.def.radius)
  expect(g, `${where}: body in a block`).toBeLessThanOrEqual(Math.max(f + STEP_UP, f + Math.max(0, e.y) - e.def.radius) + 1e-6)
}

/** Fly `e` toward (tx, tz) for `frames` frames the way the mission does —
 *  its step, the climb's tending, then `keepClear` — checking every frame. */
const chase = (map: MapData, nav: Nav, e: Enemy, tx: number, tz: number, playerY: number, where: string, climb = true): void => {
  const w = { map, nav, enemies: [] } as unknown as World
  const out: [number, number] = [0, 0]
  for (let f = 0; f < 90; f++) {
    e.px = e.x
    e.pz = e.z
    const dx = tx - e.x
    const dz = tz - e.z
    const l = Math.hypot(dx, dz)
    if (l > 0.05) {
      const s = Math.min(l, 4 * DT)
      moveCircle(nav, e.x, e.z, (dx / l) * s, (dz / l) * s, e.def.radius, out)
      e.x = out[0]
      e.z = out[1]
    }
    // A knockback now and then, toward where it is going
    if (f % 15 === 7 && l > 0.05) shove(w, e, (dx / l) * 0.8, (dz / l) * 0.8)
    if (climb) tend(map, e, playerY)
    keepClear(w, e)
    expectClear(map, nav, e, `${where} f${f}`)
    if (e.hover) expect(e.floor!, `${where} f${f}: sunk into a deck`).toBeGreaterThanOrEqual(groundUnder(map, e.x, e.z, e.def.radius) - 1e-6)
  }
}

describe('a flyer and the decks of a terrain stage', () => {
  for (const sector of SECTORS) {
    it(`never sinks into a raised block, slides under one or spawns in one (${sector})`, () => {
      const map = generateStage(sector, 1)
      expect(map.terrain).toBeTruthy()
      const nav = createNav(map)
      const w = { map, nav, enemies: [] } as unknown as World
      let edges = 0
      for (let j = 1; j < map.h - 1 && edges < 40; j++) {
        for (let i = 1; i < map.w - 1 && edges < 40; i++) {
          if (map.cell[j * map.w + i] === Cell.Void || isSolidCell(nav, i, j)) continue
          const hx = (i + 0.5) * CELL
          const hz = (j + 0.5) * CELL
          const high = groundAt(map, hx, hz)
          if (!Number.isFinite(high)) continue
          for (const [di, dj] of DIRS) {
            if (isSolidCell(nav, i + di, j + dj)) continue
            const lx = (i + di + 0.5) * CELL
            const lz = (j + dj + 0.5) * CELL
            const low = groundAt(map, lx, lz)
            if (!Number.isFinite(low) || high - low < STEP_UP * 2) continue
            const kind = FLYERS[edges % FLYERS.length]!
            edges++
            const where = `${sector} ${kind} ${i},${j} → ${di},${dj}`
            // Over the block, Flux below: down only once it is clear of it
            const a = createEnemy(kind, 10, hx, hz, 0, {})
            a.floor = high
            a.y = a.def.fly
            a.hover = [low - 4, high + 4]
            chase(map, nav, a, lx + di * CELL, lz + dj * CELL, low, `${where} (above)`)
            // Below the block's edge, Flux up on it: never noses into it
            const b = createEnemy(kind, 10, lx, lz, 0, {})
            b.floor = low
            b.y = b.def.fly
            b.hover = [low, low]
            chase(map, nav, b, hx - di * CELL, hz - dj * CELL, high, `${where} (below)`)
            // A flyer with no hover band (a wave's, a post's) at its own height
            const c = createEnemy(kind, 10, lx, lz, 0, {})
            c.floor = low
            c.y = c.def.fly
            chase(map, nav, c, hx - di * CELL, hz - dj * CELL, high, `${where} (no band)`, false)
            // Spawned with its rim over the block: it ends clear
            const s = createEnemy(kind, 10, lx - di * (CELL / 2 - s0(kind)), lz - dj * (CELL / 2 - s0(kind)), 0, {})
            s.floor = low
            s.y = s.def.fly
            keepClear(w, s)
            expectClear(map, nav, s, `${where} (spawn)`)
          }
        }
      }
      expect(edges).toBeGreaterThan(0)
    })
  }
})

/** Most of a flyer's radius: a spawn this far from a block's edge has its rim over the block. */
const s0 = (kind: EnemyKind): number => createEnemy(kind, 1, 0, 0, 0, {}).def.radius * 0.5

describe('a flyer and the walls of the labyrinth', () => {
  it('ends every frame out of the walls, whatever pushed it', () => {
    const map = generateMap({ seed: 4242, rooms: 9, boss: false })
    const nav = createNav(map)
    const w = { map, nav, enemies: [] } as unknown as World
    let tried = 0
    for (let j = 1; j < map.h - 1 && tried < 60; j++) {
      for (let i = 1; i < map.w - 1 && tried < 60; i++) {
        if (!isSolidCell(nav, i, j)) continue
        for (const [di, dj] of DIRS) {
          if (isSolidCell(nav, i + di, j + dj) || map.cell[(j + dj) * map.w + i + di] === Cell.Void) continue
          const kind = FLYERS[tried++ % FLYERS.length]!
          // Spawned or pulled half into the wall
          const e = createEnemy(kind, 10, (i + 0.5 + di * 0.6) * CELL, (j + 0.5 + dj * 0.6) * CELL, 0, {})
          keepClear(w, e)
          expectClear(map, nav, e, `${kind} ${i},${j}`)
          for (let k = 0; k < 20; k++) { shove(w, e, -di * 0.4, -dj * 0.4); keepClear(w, e) }
          expectClear(map, nav, e, `${kind} ${i},${j} shoved`)
          break
        }
      }
    }
    expect(tried).toBeGreaterThan(20)
  })
})
