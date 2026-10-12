import { CELL, Cell, type MapData, type Terrain, type WindZone } from '../../world/levelGen'
import { STEP_UP } from '../../world/nav'
import { sceneQuality } from '../../engine/quality'
import { buildWindStreaks, STREAK_WINDOW, type WindStreaksMesh } from '../../models/stageProps/wind'
import { buildTurbine, type TurbineMesh } from '../../models/stageProps/turbine'
import type { ClimbBody, ClimbHost } from '../climb'
import type { MoveMod, StageFeature } from '../stageFeatures'

/**
 * ─── Wind tunnels (the Sky Docks, `world/stages/gale.ts`) ────────────────────
 *
 * A `WindZone` blows along (dx, dz) on the mission clock: `on` seconds of
 * gust, `off` seconds of calm, offset by `phase`. In a gust Flux is pushed
 * (`StageFeature.move`) at `strength` m/s — a little less than his walk, so
 * he still inches forward against it — and in the calm he walks freely. The
 * gust eases in and out over GUST_RAMP, and GUST_WARN before it a whistle
 * sounds and the wind lines thicken: the beat to find cover.
 *
 * Cover: a wind-break pillar (a cell of the zone standing more than a step
 * over the floor, or a wall) shelters the SHELTER cells in its lee — no push
 * there at all. The mask is worked out once, at build.
 *
 * Fairness is the level's job and the push's shape: a zone is laid over a
 * solid floor between walls (`gale.ts`), and the push never lifts or drops a
 * body — it only adds to the walk that `moveBody` resolves against walls.
 *
 * Looks: anime wind lines (`models/stageProps/wind.ts`) in one instanced
 * draw, spawned from a fixed pool along the zone; many and fast in a gust,
 * a few lazy ones in the calm, fewer on 'low' scenery. Nothing allocates per
 * step.
 */

/** The gust eases in and out over this long (s). */
export const GUST_RAMP = 0.3
/** The whistle and the thickening streaks come this long before a gust (s). */
export const GUST_WARN = 0.8
/** Cells in a pillar's lee that it shelters (downwind of it). */
export const SHELTER = 2
/** Flux counts as in a zone standing within this of its floor (m). */
const ZONE_DY = 1.5
/** The streaks show (and the whistle sounds) within this of a zone (m). */
const NEAR = 26

/** Where zone `z` is in its cycle at `time` (s from the gust's start). */
const cycleAt = (z: WindZone, time: number): number => {
  const period = z.on + z.off
  return (((time + z.phase) % period) + period) % period
}

/** Share of the full push at `time`: 0 in the calm, easing in and out at
 *  the gust's ends, 1 in its middle. */
export const gustShare = (z: WindZone, time: number): number => {
  const u = cycleAt(z, time)
  if (u >= z.on) return 0
  return Math.max(0, Math.min(1, u / GUST_RAMP, (z.on - u) / GUST_RAMP))
}

/** The last GUST_WARN of the calm: the whistle, the lines gathering. */
export const gustWarning = (z: WindZone, time: number): boolean => cycleAt(z, time) >= z.on + z.off - GUST_WARN

/**
 * Which cells of zone `z` are sheltered: 1 where, within SHELTER cells
 * upwind (and inside the zone), a cell stands more than a step above this
 * one's floor or is solid. Indexed (j − j0) × width + (i − i0).
 */
export const windShelter = (map: MapData, z: WindZone): Uint8Array => {
  const t = map.terrain!
  const w = z.i1 - z.i0 + 1
  const h = z.j1 - z.j0 + 1
  const out = new Uint8Array(w * h)
  const blocks = (i: number, j: number, y: number): boolean => {
    const k = j * map.w + i
    return map.cell[k] === Cell.Void || (!t.pit[k] && t.floor[k]! + t.rise[k]! > y + STEP_UP)
  }
  for (let j = z.j0; j <= z.j1; j++) {
    for (let i = z.i0; i <= z.i1; i++) {
      const k = j * map.w + i
      if (map.cell[k] === Cell.Void || t.pit[k]) continue
      const y = t.floor[k]!
      if (blocks(i, j, y)) continue
      for (let n = 1; n <= SHELTER; n++) {
        const ui = i - z.dx * n
        const uj = j - z.dz * n
        if (ui < z.i0 || ui > z.i1 || uj < z.j0 || uj > z.j1) break
        if (blocks(ui, uj, y)) { out[(j - z.j0) * w + (i - z.i0)] = 1; break }
      }
    }
  }
  return out
}

/**
 * The push of zone `z` on a body at (x, y, z) at gust share `share`, added
 * into `out` — nothing outside the zone, off its floor or in shelter.
 */
export const windPush = (map: MapData, z: WindZone, shelter: Uint8Array, share: number, p: ClimbBody, out: MoveMod): void => {
  if (share <= 0) return
  const i = Math.floor(p.x / CELL)
  const j = Math.floor(p.z / CELL)
  if (i < z.i0 || i > z.i1 || j < z.j0 || j > z.j1) return
  const k = j * map.w + i
  const t = map.terrain!
  if (t.pit[k] || Math.abs(p.y - t.floor[k]!) > ZONE_DY) return
  if (shelter[(j - z.j0) * (z.i1 - z.i0 + 1) + (i - z.i0)]) return
  out.pushX += z.dx * z.strength * share
  out.pushZ += z.dz * z.strength * share
}

// ─── The streak pool ─────────────────────────────────────────────────────────

/** Floats per streak: zone, age, life, x, y, z, speed, length, side, lift, width, peak. */
const S = 12
/** Streaks wanted on screen: in a gust, in the telegraph, in the calm. */
const COUNT = { full: [48, 14, 5], low: [24, 8, 3] } as const
/** Streak speeds (m/s) and lives (s): a gust's, and the calm's. */
const GUST_V = 17
const CALM_V = 4.5

interface ZoneRt {
  def: WindZone
  shelter: Uint8Array
  share: number
  warned: boolean
  y: number
  /** The streaks' yaw: local +X down the wind. */
  cos: number
  sin: number
  /** The turbine at its upwind edge, and its rotor's spin (rad/s). */
  turbine: TurbineMesh | null
  spin: number
}

/** A turbine's rotor at a full gust (rad/s), and how fast it winds up and
 *  coasts down (1/s). */
const SPIN_FULL = 14
const SPIN_EASE = 1.6

/** A turbine's foot (half its side, m) and how far it stands in from the
 *  wall when it stands inside its zone (m). */
const TURBINE_FOOT = 0.6
const TURBINE_IN = 0.8
/** Its duct's reach either side of its mast (m): clear of side walls. */
const TURBINE_SPAN = 1.6
/** Its body (m): a post round its mast and foot that bodies walk round, as
 *  round a pillar (`nav.props`). Flux walked through it (placement audit,
 *  2026-10-12). Its cell stays on the paths: the post fills under half of
 *  it, and its spot keeps TURBINE_SPAN clear either side. */
export const TURBINE_R = 0.75

/**
 * The turbine's spot: on the zone's upwind edge, a cell out — on that cell's
 * floor when it is the zone's own room at the zone's height; else (the zone
 * runs to the wall, as in an arena) just inside the edge, its foot by the
 * wall. The middle of the edge first, then the cells out from it; never on
 * a doorway (it stood in the Sky Docks' boss corridor) and never in a wall
 * (a gust zone wall to wall put it inside the wall's mass).
 */
export const turbineSpot = (map: MapData, d: WindZone, y: number): { x: number; z: number } => {
  const t = map.terrain!
  const alongX = d.dx === 0
  const a0 = alongX ? d.i0 : d.j0
  const a1 = alongX ? d.i1 : d.j1
  const mid = ((a0 + a1 + 1) / 2) * CELL
  const along = [mid, ...Array.from({ length: a1 - a0 + 1 }, (_, n) => (a0 + n + 0.5) * CELL).sort((p, q) => Math.abs(p - mid) - Math.abs(q - mid))]
  const edge = d.dx > 0 ? d.i0 * CELL : d.dx < 0 ? (d.i1 + 1) * CELL : d.dz > 0 ? d.j0 * CELL : (d.j1 + 1) * CELL
  const up = -(d.dx || d.dz)
  const at = (a: number, depth: number): { x: number; z: number } => (alongX ? { x: a, z: edge + up * depth } : { x: edge + up * depth, z: a })
  const floorOk = (x: number, z: number): boolean => {
    const i = Math.floor(x / CELL)
    const j = Math.floor(z / CELL)
    if (i < 0 || j < 0 || i >= map.w || j >= map.h) return false
    const k = j * map.w + i
    if (map.cell[k] !== Cell.Room || map.room[k] !== d.room || t.pit[k] || t.ramp[k] || Math.abs(t.floor[k]! - y) > 0.05) return false
    return !map.doors.some(o => Math.abs(o.i - i) + Math.abs(o.j - j) <= 1)
  }
  const open = (x: number, z: number): boolean => {
    const i = Math.floor(x / CELL)
    const j = Math.floor(z / CELL)
    return i >= 0 && j >= 0 && i < map.w && j < map.h && map.cell[j * map.w + i] !== Cell.Void &&
      !map.doors.some(o => Math.abs(o.i - i) + Math.abs(o.j - j) <= 1)
  }
  const fits = (p: { x: number; z: number }): boolean => {
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) if (!floorOk(p.x + sx * TURBINE_FOOT, p.z + sz * TURBINE_FOOT)) return false
    return [-1, 1].every(s => (alongX ? open(p.x + s * TURBINE_SPAN, p.z) : open(p.x, p.z + s * TURBINE_SPAN)))
  }
  for (const depth of [CELL * 0.35, -TURBINE_IN]) {
    for (const a of along) {
      const p = at(a, depth)
      if (fits(p)) return p
    }
  }
  return at(mid, CELL * 0.35)
}

export class WindFeature implements StageFeature {
  private readonly host: ClimbHost
  private readonly zones: ZoneRt[]
  private readonly fx: WindStreaksMesh
  private readonly pool: Float32Array
  private readonly max: number
  private readonly want: readonly number[]
  private active = 0

  constructor(host: ClimbHost, t: Terrain) {
    this.host = host
    const map = host.map
    this.zones = (t.wind ?? []).map(def => ({
      def, shelter: windShelter(map, def), share: 0, warned: false,
      y: t.floor[def.j0 * map.w + def.i0]!,
      cos: def.dx, sin: -def.dz,
      turbine: null, spin: 0
    }))
    // One turbine per zone, on its upwind edge, blowing down the wind.
    for (const z of this.zones) {
      const at = turbineSpot(map, z.def, z.y)
      const tb = buildTurbine()
      tb.root.position.set(at.x, z.y, at.z)
      tb.root.rotation.y = Math.atan2(z.def.dx, z.def.dz)
      host.propParent(at.x, at.z).add(tb.root)
      host.nav.props.push({ x: at.x, z: at.z, r: TURBINE_R, active: true })
      z.turbine = tb
    }
    let q: 'low' | 'full' = 'full'
    try { q = sceneQuality() } catch { /* no window: full */ }
    this.want = COUNT[q]
    this.max = this.want[0]!
    this.pool = new Float32Array(this.max * S)
    this.fx = buildWindStreaks(this.max, q === 'low' ? 8 : 16)
    host.scene.add(this.fx.mesh)
  }

  /** The zone share now (for tests and the look): 0 calm .. 1 full gust. */
  share(n: number): number {
    return this.zones[n]?.share ?? 0
  }

  update(dt: number, time: number, p: ClimbBody): void {
    let near: ZoneRt | null = null
    for (const z of this.zones) {
      const d = z.def
      z.share = gustShare(d, time)
      // The turbine winds up with the gust and coasts down in the calm.
      if (z.turbine) {
        z.spin += (SPIN_FULL * z.share - z.spin) * Math.min(1, dt * SPIN_EASE)
        z.turbine.rotor.rotation.z -= z.spin * dt
      }
      const warn = gustWarning(d, time)
      const close = this.distTo(z, p.x, p.z) < NEAR && Math.abs(p.y - z.y) < 6
      if (close) near = z
      if (warn && !z.warned && close) {
        this.host.sfx('gust', (d.i0 + d.i1 + 1) / 2 * CELL, (d.j0 + d.j1 + 1) / 2 * CELL)
      }
      z.warned = warn
    }
    this.stepStreaks(dt, near, time)
  }

  /** The streaks are one mesh at the scene root: drawn while a room they
   *  blow in is. */
  cull(vis: Uint8Array): void {
    if (this.fx.mesh.visible && !this.zones.some(z => vis[z.def.room] === 1)) this.fx.mesh.visible = false
  }

  move(p: ClimbBody, out: MoveMod): void {
    for (const z of this.zones) windPush(this.host.map, z.def, z.shelter, z.share, p, out)
  }

  dispose(): void {
    this.fx.dispose()
  }

  private distTo(z: ZoneRt, x: number, zz: number): number {
    const d = z.def
    const cx = Math.max(d.i0 * CELL, Math.min(x, (d.i1 + 1) * CELL))
    const cz = Math.max(d.j0 * CELL, Math.min(zz, (d.j1 + 1) * CELL))
    return Math.hypot(x - cx, zz - cz)
  }

  /** Age, move and retire the streaks; top the pool up toward what the
   *  zone's state wants; write the instances (the live ones first). */
  private stepStreaks(dt: number, near: ZoneRt | null, time: number): void {
    const pool = this.pool
    // Retire and advance.
    let n = 0
    for (let s = 0; s < this.active; s++) {
      const o = s * S
      const age = pool[o + 1]! + dt
      if (age >= pool[o + 2]!) continue
      if (n !== s) pool.copyWithin(n * S, o, o + S)
      const m = n * S
      pool[m + 1] = age
      const z = this.zones[pool[m]!]!
      pool[m + 3] = pool[m + 3]! + z.def.dx * pool[m + 6]! * dt
      pool[m + 5] = pool[m + 5]! + z.def.dz * pool[m + 6]! * dt
      n++
    }
    this.active = n
    // Spawn: only for the zone Flux is near, a few a step at most.
    if (near) {
      const zi = this.zones.indexOf(near)
      const gust = near.share > 0
      const want = gust ? this.want[0]! : gustWarning(near.def, time) ? this.want[1]! : this.want[2]!
      for (let k = 0; k < 3 && this.active < Math.min(want, this.max); k++) this.spawn(zi, near, gust)
    }
    this.write()
    this.fx.mesh.visible = this.active > 0
  }

  private spawn(zi: number, z: ZoneRt, gust: boolean): void {
    const d = z.def
    const o = this.active * S
    const pool = this.pool
    // Along the zone: start anywhere from a little upwind of it; across it:
    // anywhere between its walls; up: from the knees to over the head.
    const r = Math.random
    const alongX = d.dx !== 0
    const span0 = alongX ? d.i0 * CELL : d.j0 * CELL
    const span1 = alongX ? (d.i1 + 1) * CELL : (d.j1 + 1) * CELL
    const cross0 = alongX ? d.j0 * CELL + 0.4 : d.i0 * CELL + 0.4
    const cross1 = alongX ? (d.j1 + 1) * CELL - 0.4 : (d.i1 + 1) * CELL - 0.4
    const dir = alongX ? d.dx : d.dz
    const len = gust ? 7 + r() * 7 : 3.5 + r() * 3
    const along = (dir > 0 ? span0 - len * 0.5 : span1 + len * 0.5) + dir * r() * (span1 - span0) * (gust ? 0.85 : 0.6)
    const across = cross0 + r() * (cross1 - cross0)
    const v = gust ? GUST_V * (0.8 + r() * 0.4) : CALM_V * (0.7 + r() * 0.6)
    pool[o] = zi
    pool[o + 1] = 0
    pool[o + 2] = gust ? 0.55 + r() * 0.35 : 1.4 + r() * 0.8
    pool[o + 3] = alongX ? along : across
    pool[o + 4] = z.y + 0.3 + r() * 3
    pool[o + 5] = alongX ? across : along
    pool[o + 6] = v
    pool[o + 7] = len
    pool[o + 8] = (r() - 0.5) * (gust ? 0.9 : 1.6)
    pool[o + 9] = (r() - 0.3) * 0.6
    pool[o + 10] = gust ? 0.12 + r() * 0.1 : 0.07 + r() * 0.05
    pool[o + 11] = gust ? 0.75 + r() * 0.25 : 0.35 + r() * 0.2
    this.active++
  }

  private write(): void {
    const pool = this.pool
    const mat = this.fx.mesh.instanceMatrix.array as Float32Array
    const shape = this.fx.shape.array as Float32Array
    const prog = this.fx.prog.array as Float32Array
    for (let s = 0; s < this.active; s++) {
      const o = s * S
      const z = this.zones[pool[o]!]!
      const c = z.cos
      const sn = z.sin
      // A turn about Y taking +X down the wind, then the start point.
      const m = s * 16
      mat[m] = c; mat[m + 1] = 0; mat[m + 2] = -sn; mat[m + 3] = 0
      mat[m + 4] = 0; mat[m + 5] = 1; mat[m + 6] = 0; mat[m + 7] = 0
      mat[m + 8] = sn; mat[m + 9] = 0; mat[m + 10] = c; mat[m + 11] = 0
      mat[m + 12] = pool[o + 3]!; mat[m + 13] = pool[o + 4]!; mat[m + 14] = pool[o + 5]!; mat[m + 15] = 1
      shape[s * 4] = pool[o + 7]!
      shape[s * 4 + 1] = pool[o + 8]!
      shape[s * 4 + 2] = pool[o + 9]!
      shape[s * 4 + 3] = pool[o + 10]!
      // The stroke draws on from the tail and wipes off past the head; it
      // fades in and out at the ends of its life.
      const f = pool[o + 1]! / pool[o + 2]!
      prog[s * 2] = f * (1 + STREAK_WINDOW)
      prog[s * 2 + 1] = pool[o + 11]! * Math.min(1, f * 6, (1 - f) * 4)
    }
    this.fx.mesh.count = this.active
    this.fx.mesh.instanceMatrix.needsUpdate = true
    this.fx.shape.needsUpdate = true
    this.fx.prog.needsUpdate = true
  }
}
