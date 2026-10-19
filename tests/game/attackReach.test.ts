// #180: no machine winds up an attack that cannot reach Flux from where he
// stands. Playtest: the Steel Hound breathed its short fire cone at him from
// 15–20 m away, again and again. Every ordinary machine, every Core Master
// and every challenge mini-boss is run against the REAL sim with Flux
// standing still at many distances; each wind-up is held to its attack's
// declared reach (`sim/attackReach.ts`, the mini-bosses' `reach`), and from
// far away each must still close in and attack (fair, but aggressive).
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/game/fx/markers', async () => {
  const { Mesh, Group } = await import('three')
  return { makeBlobShadow: () => new Mesh(), makeTeleRing: () => new Group(), setTeleRing: () => {} }
})

import { createEnemy, updateEnemy } from '@/game/sim/enemies'
import { createBoss, startBossIntro, updateBoss } from '@/game/sim/bosses'
import { createMiniBoss, startMiniBoss, updateMiniBoss } from '@/game/sim/miniBosses'
import { MINI_BOSSES } from '@/game/sim/miniBoss/registry'
import { STEEL_HOUND, HOUND_REACH, BREATH_RANGE } from '@/game/sim/miniBoss/steelHound'
import { ENEMY_REACH, BOSS_REACH, withinReach } from '@/game/sim/attackReach'
import { ENEMIES } from '@/game/data/enemies'
import { BOSSES } from '@/game/data/bosses'
import { createNav } from '@/game/world/nav'
import { CELL, type MapData, type Room } from '@/game/world/levelGen'
import type { BossId } from '@/game/models/bosses'
import type { EnemyKind } from '@/game/models/enemies'
import type { Enemy, World } from '@/game/sim/world'

const DT = 1 / 60
const W = 40
/** One big open room (36 cells = 108 m across): no wall cuts a run short. */
const ROOM = { id: 0, x0: 2, z0: 2, w: 36, h: 36, depth: 0, parent: -1, children: [], role: 'fight', door: -1, cells: [] } as unknown as Room
const MID = (2 + 18) * CELL

/** Anything the sim draws or plays is a no-op here. */
const stubs = (): unknown => new Proxy({}, { get: () => () => {} })

const world = (enemies: Enemy[]): World => {
  const map = { w: W, h: W, cell: new Uint8Array(W * W).fill(1), pillars: [], room: new Int16Array(W * W), rooms: [ROOM] } as unknown as MapData
  const noop = (): void => {}
  return {
    map, nav: createNav(map), time: 0,
    player: { x: MID, z: MID, y: 0, yaw: 0, pitch: 0 },
    combat: { iframes: 1e9 } as World['combat'],
    enemies,
    fx: stubs(), markers: stubs(), shocks: stubs(),
    fireEnemyShot: noop, lobShell: noop, spawnWave: noop, spawnRing: noop, fireOrb: noop, pull: noop, slowPlayer: noop,
    spawnEnemy: noop, hitPlayer: () => 'hit', shake: noop, sfx: noop
  } as unknown as World
}

const DISTS = [2, 3.5, 5, 7, 9, 11, 13, 16, 20, 26]

interface Start { attack: string; d: number }

/** Run `tick` for `secs` with Flux still; log every wind-up's start and how far he stood. */
const watch = (w: World, e: Enemy, secs: number, tick: () => void, keepReady = true): Start[] => {
  const starts: Start[] = []
  for (let k = 0; k < secs / DT; k++) {
    w.time += DT
    if (keepReady && e.state === 'engage') e.cd = Math.min(e.cd, 0)
    const was = e.state
    const d = Math.hypot(w.player.x - e.x, w.player.z - e.z)
    tick()
    // A choice made in 'engage' (a follow-up, like the pull's slam, is part of its move).
    if (was === 'engage' && e.state === 'tele') starts.push({ attack: e.attack, d })
  }
  return starts
}

beforeEach(() => {
  let s = 0x5eed
  const dice = vi.spyOn(Math, 'random').mockImplementation(() => {
    s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9) >>> 0
    return (s >>> 0) / 4294967296
  })
  return () => dice.mockRestore()
})

describe('attack reach (#180)', () => {
  it('ordinary machines only wind up what reaches him', () => {
    const kinds = (Object.keys(ENEMIES) as EnemyKind[]).filter(k => k !== 'miniboss')
    let seen = 0
    for (const kind of kinds) {
      const reach = ENEMY_REACH[kind]
      expect(reach, `${kind}: declare its attacks in ENEMY_REACH`).toBeDefined()
      for (const d of DISTS) {
        const e = createEnemy(kind, 1, MID, MID - d, 0)
        e.state = 'engage'
        e.awake = true
        e.cd = 0
        const w = world([e])
        for (const s of watch(w, e, 2.5, () => updateEnemy(w, e, DT))) {
          seen++
          expect(reach![s.attack], `${kind} ${s.attack}: undeclared`).toBeDefined()
          expect(withinReach(reach!, s.attack, s.d - 0.05), `${kind} ${s.attack} at ${s.d.toFixed(1)} m`).toBe(true)
        }
      }
    }
    expect(seen).toBeGreaterThan(40)
  })

  it('the Core Masters only start a pattern that reaches him, and still close in', () => {
    for (const id of Object.keys(BOSSES) as BossId[]) {
      const def = BOSSES[id]
      for (const p of [...def.patterns, ...def.patterns2]) expect(BOSS_REACH[p], `${id} ${p}: undeclared`).toBeDefined()
      for (const half of [false, true]) {
        for (const d of DISTS) {
          const e = createBoss(id, 1, MID, MID - d, 0)
          startBossIntro(e)
          if (half) { e.phase2 = true; e.hp = Math.round(e.maxHp * 0.4) }
          const w = world([e])
          const starts = watch(w, e, 8, () => updateBoss(w, e, DT, ROOM))
          for (const s of starts) expect(withinReach(BOSS_REACH, s.attack, s.d - 0.05), `${id} ${s.attack} at ${s.d.toFixed(1)} m`).toBe(true)
          expect(starts.length, `${id} from ${d} m`).toBeGreaterThan(0)
        }
      }
    }
  })

  it('the challenge mini-bosses only start a move that reaches him, and still close in', () => {
    const specs = [...new Set(Object.values(MINI_BOSSES).filter(Boolean))]
    expect(specs.length).toBeGreaterThanOrEqual(10)
    for (const spec of specs) {
      for (const half of [false, true]) {
        for (const d of DISTS) {
          const e = createMiniBoss(spec!, 8, MID, MID - d, ROOM)
          const w = world([e])
          startMiniBoss(e)
          // Through its entrance first.
          for (let k = 0; k < 6 / DT && e.state !== 'engage'; k++) updateMiniBoss(w, e, DT)
          e.x = MID
          e.z = MID - d
          if (half) e.hp = Math.round(e.maxHp * 0.45)
          const starts = watch(w, e, 10, () => updateMiniBoss(w, e, DT))
          for (const s of starts) {
            expect(spec!.reach[s.attack], `${spec!.id} ${s.attack}: undeclared`).toBeDefined()
            expect(withinReach(spec!.reach, s.attack, s.d - 0.05), `${spec!.id} ${s.attack} at ${s.d.toFixed(1)} m`).toBe(true)
          }
          expect(starts.length, `${spec!.id} from ${d} m`).toBeGreaterThan(0)
        }
      }
    }
  })
})

describe('the Steel Hound at 15–20 m (#180)', () => {
  it('never breathes its cone from afar: it runs in, and the breath starts within the cone', () => {
    expect(HOUND_REACH.breath).toBeLessThan(BREATH_RANGE + 1)
    let breaths = 0
    for (const d of [15, 17, 20]) {
      const e = createMiniBoss(STEEL_HOUND, 8, MID, MID - d, ROOM)
      const w = world([e])
      startMiniBoss(e)
      for (let k = 0; k < 6 / DT && e.state !== 'engage'; k++) updateMiniBoss(w, e, DT)
      e.x = MID
      e.z = MID - d
      const starts = watch(w, e, 14, () => updateMiniBoss(w, e, DT))
      // Its first move: none from where it stood; it had to run in first.
      expect(starts[0]!.d).toBeLessThan(d - 1)
      for (const s of starts) {
        if (s.attack === 'breath') { breaths++; expect(s.d).toBeLessThanOrEqual(HOUND_REACH.breath) }
        if (s.attack === 'lunge') expect(s.d).toBeLessThanOrEqual(HOUND_REACH.lunge)
      }
    }
    expect(breaths).toBeGreaterThan(0)
  })
})
