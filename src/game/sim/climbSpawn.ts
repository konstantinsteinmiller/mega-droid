import type { BossId } from '../models/bosses'
import type { EnemyKind } from '../models/enemies'
import type { MapData } from '../world/levelGen'
import { mulberry32, weighted } from '../world/rng'
import { createEnemy } from './enemies'
import type { Enemy } from './world'
import type { EncounterTable } from './spawn'
import type { Slice } from '../engine/slicer'
import { THEMES } from '../world/themes'

/**
 * The climb's cast (`world/climbGen.ts` places the posts): a Wall Cannon on
 * each turret post, a Rotor Drone on each flyer post, and on each ground post
 * a walker from the sector's own table. Each stands on its platform (`floor`)
 * and may not leave it (`leash`); a drone follows the player through its band
 * of heights (`hover`). Deterministic from the map seed, in post order, so a
 * resumed climb rebuilds the same cast and its snapshot's indices still fit.
 */

/** Walkers that read on a flat platform: no turret, no flyer, nothing that
 *  poses as scenery (a crate that wakes up would sit on a ledge unseen). */
const GROUND: readonly EnemyKind[] = ['hardhat', 'trooper', 'hopper', 'roller', 'brute']
/** Drones a Tower Run's flyer posts roll from the sector's table besides the
 *  Rotor Drone (the neon sector's Searchlight Drone). A story stage names its
 *  own flyers: its unnamed posts stay Rotor Drones. */
const FLYERS: readonly EnemyKind[] = ['spotter']

export const spawnClimb = async (
  map: MapData, table: EncounterTable, level: number,
  opts: { slice?: Slice; onProgress?: (f01: number) => void; tower?: boolean } = {}
): Promise<Enemy[]> => {
  const t = map.terrain!
  const rng = mulberry32(map.seed ^ 0xc1e1)
  const walkers = table.kinds.filter(([k]) => GROUND.includes(k))
  const pool: ReadonlyArray<readonly [EnemyKind, number]> = walkers.length ? walkers : [['hardhat', 1]]
  // Only a table with such a drone rolls for its flyers (no other draw changes)
  const drones = opts.tower ? table.kinds.filter(([k]) => FLYERS.includes(k)) : []
  const flyPool: ReadonlyArray<readonly [EnemyKind, number]> | null = drones.length
    ? [['heli', table.kinds.find(([k]) => k === 'heli')?.[1] ?? 1], ...drones]
    : null
  const out: Enemy[] = []
  // The first ground posts along the route bring back the first mission's
  // machines (players met them once and never again): a Gear Roller, a
  // Guardroid, a crate golem asleep as a crate (where the sector has crates),
  // a Hardhat. The rest roll from the sector's table.
  const FIRST: ReadonlyArray<EnemyKind | 'golem'> = ['roller', 'brute', 'golem', 'hardhat']
  let ground = 0
  for (let n = 0; n < t.foes.length; n++) {
    const f = t.foes[n]!
    let kind: EnemyKind = f.kind ?? (f.role === 'turret' ? 'turret' : f.role === 'flyer' ? (flyPool ? weighted(rng, flyPool) : 'heli') : weighted(rng, pool))
    let golem = false
    if (!f.kind && f.role !== 'turret' && f.role !== 'flyer') {
      const first = FIRST[ground++]
      if (first === 'golem') {
        if (table.theme) { kind = 'golem'; golem = true }
      } else if (first) kind = first
    }
    const e = golem
      ? createEnemy('golem', level, f.x, f.z, f.room, { theme: THEMES[table.theme!] })
      : createEnemy(kind, level, f.x, f.z, f.room, { element: table.element, echo: f.echo as BossId | undefined })
    // Posts face the game's way (forward = −sin, −cos); machines face (sin, cos).
    e.yaw = f.yaw + Math.PI
    e.floor = f.y
    e.leash = f.leash
    if (f.fly) e.hover = f.fly
    out.push(e)
    await opts.slice?.()
    opts.onProgress?.((n + 1) / t.foes.length)
  }
  return out
}
