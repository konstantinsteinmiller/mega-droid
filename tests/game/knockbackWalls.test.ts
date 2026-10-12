// Knockback and walls (sim/enemies.ts `shove`, sim/climb.ts `tendFoe`).
// Playtest 2026-10-12: a machine in a Magnet stage stood inside a raised
// locker block. A hit's knockback moved it with no wall test at all, and it
// lands before the machines update — so the climb's undo, which went back to
// the frame's start, went back to the spot inside the block. Knockback now
// goes through the wall test and never up onto a block; the undo goes to the
// last spot that passed; a mini-boss's blink, dive or burst-up is pushed out
// of any wall it lands in.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/game/fx/markers', async () => {
  const { Mesh, Group } = await import('three')
  return { makeBlobShadow: () => new Mesh(), makeTeleRing: () => new Group(), setTeleRing: () => {} }
})
vi.mock('@/game/world/textures', async (orig) => {
  const { Texture } = await import('three')
  return { ...(await orig<object>()), levelAtlas: () => new Texture(), glowTexture: () => new Texture(), ringTexture: () => new Texture() }
})

import { createEnemy, shove, settle, tooTallFor } from '@/game/sim/enemies'
import { createNav, groundAt, isSolidCell, resolveCircle } from '@/game/world/nav'
import { CELL, Cell } from '@/game/world/levelGen'
import { generateStage } from '@/game/world/stages'
import { THEMES } from '@/game/world/themes'
import type { World } from '@/game/sim/world'

const SECTORS = ['blaze', 'cryo', 'volt', 'gale', 'magnet', 'drill', 'tide', 'neon', 'rotor', 'fortress'] as const
const DIRS: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]]
const src = (p: string) => readFileSync(resolve(__dirname, '../..', p), 'utf8')

describe('a hit\'s knockback', () => {
  it('never pushes a machine into a wall or up onto a block, on any stage', () => {
    let walls = 0
    let blocks = 0
    for (const sector of SECTORS) {
      const map = generateStage(sector, 1)
      const nav = createNav(map)
      const w = { map, nav } as unknown as World
      const e = createEnemy('trooper', 10, 0, 0, 0, { theme: THEMES.scrapyard })
      for (let j = 1; j < map.h - 1; j++) {
        for (let i = 1; i < map.w - 1; i++) {
          if (map.cell[j * map.w + i] === Cell.Void || isSolidCell(nav, i, j)) continue
          const x = (i + 0.5) * CELL
          const z = (j + 0.5) * CELL
          const g = groundAt(map, x, z)
          if (!Number.isFinite(g)) continue
          for (const [di, dj] of DIRS) {
            const wall = isSolidCell(nav, i + di, j + dj)
            e.x = x
            e.z = z
            e.floor = g
            e.y = 0
            const block = !wall && tooTallFor(map, e, (i + di + 0.5) * CELL, (j + dj + 0.5) * CELL)
            if (!wall && !block) continue
            if (wall) walls++
            else blocks++
            // A burst of charged hits straight at it, far past the cell edge.
            for (let k = 0; k < 30; k++) shove(w, e, di * 0.35, dj * 0.35)
            const where = `${sector} ${i},${j} toward ${di},${dj}`
            const [rx, rz] = resolveCircle(nav, e.x, e.z, e.def.radius)
            expect(Math.hypot(rx - e.x, rz - e.z), `${where}: in a wall`).toBeLessThan(1e-6)
            expect(tooTallFor(map, e, e.x, e.z), `${where}: on a block`).toBe(false)
          }
        }
      }
    }
    expect(walls).toBeGreaterThan(100)
    expect(blocks).toBeGreaterThan(10)
  })

  it('a machine that cannot move is not moved', () => {
    const map = generateStage('magnet', 1)
    const w = { map, nav: createNav(map) } as unknown as World
    const e = createEnemy('trooper', 10, map.start.x, map.start.z, 0, { theme: THEMES.scrapyard })
    e.rooted = true
    shove(w, e, 0.35, 0)
    expect([e.x, e.z]).toEqual([map.start.x, map.start.z])
  })

  it('every hit goes through it, dead or alive; no bare position push is left', () => {
    const combat = src('src/game/sim/combat.ts')
    expect(combat).toMatch(/shove\(h, e, \(kx \/ kl\) \* kb, \(kz \/ kl\) \* kb\)/)
    expect(combat).not.toMatch(/e\.x \+= \(kx \/ kl\)/)
  })
})

describe('the climb\'s undo and the mini-bosses', () => {
  it('the undo goes back to the last spot that passed, dead machines too', () => {
    const climb = src('src/game/sim/climb.ts')
    expect(climb).toMatch(/tooTallFor\(this\.host\.map, e, e\.x, e\.z\)\) \{\s*e\.x = e\.safeX \?\? e\.px/)
    expect(climb).toMatch(/e\.safeX = e\.x/)
  })

  it('a mini-boss is pushed out of any wall it lands in after every update', () => {
    expect(src('src/game/sim/mission.ts')).toMatch(/updateMiniBoss\(this, e, edt\); settle\(this, e\)/)
    const map = generateStage('fortress', 1)
    const nav = createNav(map)
    const w = { map, nav } as unknown as World
    // A blink onto the middle of a wall cell next to the floor.
    let tried = 0
    for (let j = 1; j < map.h - 1 && tried < 40; j++) {
      for (let i = 1; i < map.w - 1 && tried < 40; i++) {
        if (!isSolidCell(nav, i, j) || !DIRS.some(([a, b]) => map.cell[(j + b) * map.w + i + a] !== Cell.Void && !isSolidCell(nav, i + a, j + b))) continue
        tried++
        const e = createEnemy('trooper', 10, (i + 0.5) * CELL, (j + 0.5) * CELL, 0, { theme: THEMES.scrapyard })
        settle(w, e)
        const [rx, rz] = resolveCircle(nav, e.x, e.z, e.def.radius)
        expect(Math.hypot(rx - e.x, rz - e.z), `${i},${j}`).toBeLessThan(1e-6)
      }
    }
    expect(tried).toBe(40)
  })
})
