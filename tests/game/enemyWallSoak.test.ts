// Machines and walls, soaked (#160): a playtest sampled a trooper and a
// hardhat standing inside solid wall cells of a Scrapyard boss mission for up
// to 30 s. Whatever moves a machine — its walk, a rush, a dash, a hop, the
// push-apart between machines, a hit's knockback — must leave its centre on
// the floor. A few real missions' casts, every machine awake, chase Flux
// round the map for a while; no live centre may end a tick in a wall.

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/game/fx/markers', async () => {
  const { Mesh, Group } = await import('three')
  return { makeBlobShadow: () => new Mesh(), makeTeleRing: () => new Group(), setTeleRing: () => {} }
})
vi.mock('@/game/world/textures', async (orig) => {
  const { Texture } = await import('three')
  return { ...(await orig<object>()), levelAtlas: () => new Texture(), glowTexture: () => new Texture(), ringTexture: () => new Texture() }
})

import { updateEnemy, shove, wake } from '@/game/sim/enemies'
import { spawnEncounters } from '@/game/sim/spawn'
import { createNav, isSolidAt, isSolidCell, resolveCircle, moveBody, groundAt, STEP_UP, type Nav } from '@/game/world/nav'
import { generateStage } from '@/game/world/stages'
import { generateMap, CELL, Cell, type MapData } from '@/game/world/levelGen'
import { SECTOR_BY_ID } from '@/game/data/regions'
import { THEMES } from '@/game/world/themes'
import { MissionObjects, type ObjectiveHost } from '@/game/sim/objectives'
import type { Quest } from '@/game/data/quests'
import { Scene } from 'three'
import type { Enemy, World } from '@/game/sim/world'

const DT = 1 / 60
const noop = (): void => {}

/** Seeded [0, 1) stream: the AI rolls Math.random, the soak replays one run. */
const rng = (seed: number) => () => {
  seed = (Math.imul(seed ^ (seed >>> 15), 2246822507) + 0x9e3779b9) >>> 0
  seed ^= seed >>> 13
  return (seed >>> 0) / 4294967296
}
beforeEach(() => {
  const dice = vi.spyOn(Math, 'random').mockImplementation(rng(0x5011))
  return () => dice.mockRestore()
})

const worldOf = (map: MapData, enemies: Enemy[]): World => ({
  map, nav: createNav(map), time: 0,
  player: { x: map.start.x, z: map.start.z, yaw: 0, pitch: 0 },
  combat: { iframes: 1e9, charging: false, charge: 0 } as unknown as World['combat'],
  enemies,
  fx: { sparks: noop, emit: noop, orbBurst: noop, flash: noop, riseRing: noop } as unknown as World['fx'],
  markers: { spawn: noop } as unknown as World['markers'],
  shocks: { spawn: noop, spawnLinear: noop } as unknown as World['shocks'],
  fireEnemyShot: noop, lobShell: noop, spawnWave: noop, spawnRing: noop, fireOrb: noop,
  pull: noop, slowPlayer: noop,
  hitPlayer: () => 'miss', shake: noop, sfx: noop
})

/** Seconds of chase per mission. */
const SOAK_S = 30

/** A mission's map with its crates and chests: solid props, most of them
 *  against a wall (`MissionObjects` puts them on the nav). */
const missionMap = (sector: keyof typeof SECTOR_BY_ID, seed: number): { map: MapData; nav: Nav } => {
  const map = generateMap({ seed, rooms: 9, boss: true })
  const nav = createNav(map)
  const scene = new Scene()
  const host = {
    scene, map, nav, theme: THEMES.scrapyard, propParent: () => scene,
    fx: { sparks: noop, emit: noop, orbBurst: noop, flash: noop, riseRing: noop }, shocks: { spawn: noop },
    shake: noop, sfx: noop, explode: noop,
    onCrateDeflect: noop, onCrateBroken: noop, onChestOpened: noop, onCoreTaken: noop, onObjectiveDone: noop
  }
  const quest = {
    id: `job_${seed}`, kind: 'job', template: 'purge', sector, seed, level: 4,
    target: null, count: 1, rooms: 9, reward: { xp: 0, bolts: 0, rarityBias: 0 }
  } as Quest
  void new MissionObjects(host as unknown as ObjectiveHost, quest)
  return { map, nav }
}

/** The solid round things a body is pushed off: pillars and props. */
const rounds = (map: MapData, nav: Nav): Array<{ x: number; z: number; r: number }> =>
  [...map.pillars.filter(p => !p.gone), ...nav.props.filter(p => p.active)]

const soak = async (sector: keyof typeof SECTOR_BY_ID, seed: number): Promise<string[]> => {
  const { map, nav } = missionMap(sector, seed)
  expect(nav.props.length).toBeGreaterThan(3)
  const cast = await spawnEncounters(map, SECTOR_BY_ID[sector].encounters, 4)
  const w = worldOf(map, cast)
  w.nav = nav
  const solids = rounds(map, nav)
  const r = rng(seed)
  // Flux's stops: every room's middle, in turn, a few seconds each.
  const stops = map.rooms.map(o => [(o.x0 + o.w / 2) * CELL, (o.z0 + o.h / 2) * CELL] as const)
  for (const e of cast) {
    // Awake, from the first tick (a sleeping crate golem wakes too).
    e.dormant = false
    e.hold = false
    wake(w, e, false)
  }
  const bad: string[] = []
  const ticks = Math.round(SOAK_S / DT)
  for (let t = 0; t < ticks; t++) {
    w.time += DT
    if (t % 180 === 0) {
      const [x, z] = stops[Math.floor(t / 180) % stops.length]!
      w.player.x = x
      w.player.z = z
    }
    // A chase squeezes a machine in behind a crate or a pillar now and then.
    if (t % 60 === 30) {
      const e = cast[Math.floor(r() * cast.length)]!
      const o = solids[Math.floor(r() * solids.length)]!
      const a = r() * Math.PI * 2
      const x = o.x + Math.cos(a) * (o.r + 0.05)
      const z = o.z + Math.sin(a) * (o.r + 0.05)
      if (e.state !== 'dead' && e.def.fly === 0 && !isSolidAt(nav, x, z)) {
        e.x = x
        e.z = z
      }
    }
    for (const e of cast) {
      updateEnemy(w, e, DT)
      // Hits land on the machines now and then: knockback, a full charge's too.
      if (e.state !== 'dead' && r() < 0.03) {
        const a = r() * Math.PI * 2
        shove(w, e, Math.cos(a) * 0.35, Math.sin(a) * 0.35)
      }
    }
    for (const e of cast) {
      if (e.state === 'dead' || e.offstage) continue
      if (isSolidAt(w.nav, e.x, e.z)) bad.push(`${sector}#${seed} t=${(t * DT).toFixed(2)} ${e.kind}#${e.id} ${e.state}/${e.attack} at ${e.x.toFixed(2)},${e.z.toFixed(2)}`)
    }
  }
  return bad
}

describe('machines never stand in a wall', () => {
  // The cause: a crate against a wall pushed a body that slipped in behind it
  // straight into the wall, and the next frame's wall pass and the crate's
  // push held it there.
  it('a crate, a chest or a pillar never pushes a body into a wall', () => {
    let tried = 0
    const bad: string[] = []
    for (let seed = 1; seed <= 12; seed++) {
      const { map, nav } = missionMap('scrapyard', seed * 977)
      for (const o of rounds(map, nav)) {
        for (let k = 0; k < 16; k++) {
          const a = (k / 16) * Math.PI * 2
          for (const body of [0.45, 0.6, 0.9]) {
            let x = o.x + Math.cos(a) * (o.r + 0.1)
            let z = o.z + Math.sin(a) * (o.r + 0.1)
            if (isSolidAt(nav, x, z)) continue
            tried++
            // A few frames of push-out in a row: it must not settle in the wall.
            for (let f = 0; f < 4; f++) [x, z] = resolveCircle(nav, x, z, body)
            if (isSolidAt(nav, x, z)) bad.push(`#${seed * 977} round at ${o.x.toFixed(2)},${o.z.toFixed(2)} r ${o.r}, body ${body} -> ${x.toFixed(2)},${z.toFixed(2)}`)
          }
        }
      }
    }
    expect(tried).toBeGreaterThan(5000)
    expect(bad.slice(0, 8), `${bad.length} in a wall`).toEqual([])
  })

  it.each([
    ['scrapyard', 1201], ['scrapyard', 5531], ['cryo', 4242], ['neon', 2718]
  ] as const)('%s mission %i: every machine awake, chasing Flux round the map', async (sector, seed) => {
    const bad = await soak(sector, seed)
    expect(bad.slice(0, 10), `${bad.length} wall samples`).toEqual([])
  }, 60_000)
})

// The same push-out for a body with feet (`moveBody`: Flux on a terrain map —
// a stage, a climb): a crate against a wall pushed him into it as well.
describe('Flux never stands in a wall on a terrain map', () => {
  it('a crate against a wall never pushes him into it, on any stage', () => {
    const SECTORS = ['blaze', 'cryo', 'volt', 'gale', 'magnet', 'drill', 'tide', 'neon', 'rotor', 'fortress'] as const
    const R = 0.45
    const out: [number, number] = [0, 0]
    let tried = 0
    const bad: string[] = []
    for (const sector of SECTORS) {
      const map = generateStage(sector, 1)
      const nav = createNav(map)
      for (let j = 1; j < map.h - 1; j++) {
        for (let i = 1; i < map.w - 1; i++) {
          if (map.cell[j * map.w + i] === Cell.Void || isSolidCell(nav, i, j)) continue
          for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
            if (!isSolidCell(nav, i + di, j + dj)) continue
            // A crate on its wall spot (0.7 m in from the cell's middle), Flux
            // slipped in between it and the wall.
            const cx = (i + 0.5) * CELL + di * 0.7
            const cz = (j + 0.5) * CELL + dj * 0.7
            const prop = { x: cx, z: cz, r: 0.6, active: true }
            nav.props.push(prop)
            let x = cx + di * 0.65
            let z = cz + dj * 0.65
            const feet = groundAt(map, (i + 0.5) * CELL, (j + 0.5) * CELL)
            if (!Number.isFinite(feet)) { nav.props.pop(); continue }
            tried++
            // A few frames of standing still there.
            for (let f = 0; f < 4; f++) [x, z] = moveBody(nav, x, z, feet, 0, 0, R, out)
            const tall = groundAt(map, x, z) > feet + STEP_UP
            if (isSolidAt(nav, x, z) || tall) bad.push(`${sector} ${i},${j} toward ${di},${dj} -> ${x.toFixed(2)},${z.toFixed(2)}`)
            nav.props.pop()
          }
        }
      }
    }
    expect(tried).toBeGreaterThan(200)
    expect(bad.slice(0, 8), `${bad.length} in a wall`).toEqual([])
  })
})
