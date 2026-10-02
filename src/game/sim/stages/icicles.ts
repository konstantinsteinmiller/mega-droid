import type { Group } from 'three'
import { CELL, cellCenter, type IcicleSpec, type Terrain } from '../../world/levelGen'
import { buildIcicle, buildIcicleRoof } from '../../models/stageProps/frost'
import { buildStalactite } from '../../models/stageProps/rock'
import type { ClimbBody, ClimbHost } from '../climb'
import { PLAYER_R } from '../constants'
import { AtlasCue, type StageFeature } from '../stageFeatures'

/**
 * ─── Icicles (Glacier Run) ───────────────────────────────────────────────────
 *
 * `Terrain.icicles`: each hangs ICICLE_H over its cell's floor and runs a
 * cycle on the mission clock (`period`, offset by `phase`): a shadow ring
 * grows on the floor under it and it trembles (ICICLE_WARN s), it drops
 * (ICICLE_FALL s) and shatters on the floor — whoever stands within
 * ICICLE_REACH of its line on that floor takes ICICLE_COST of the health,
 * not blockable — and it grows back from the ceiling before the next ring.
 *
 * The ceiling is real: every room that holds icicles gets a roof at their
 * roots (`buildIcicleRoof`). They used to hang in the open sky.
 */

export const ICICLE_WARN = 1.1
export const ICICLE_FALL = 0.32
/** Its root's height over the floor (m); the icicle is 1.6 m long. */
const ICICLE_H = 4.6
const ICICLE_LEN = 1.6
export const ICICLE_REACH = 1
export const ICICLE_COST = 0.12
/** After the crash, a beat of nothing before it starts to grow back (s). */
const REGROW_AFTER = 0.3
/** The roof's underside over an icicle's root (m): its mount sits in it. */
const ROOF_OVER = 0.12
/** Floor to roof, at least (m): a room with a ledge closer to the roots than
 *  this stays open (Flux would walk with his head in the ceiling). */
const HEADROOM = 2.6

interface IcicleRt {
  def: IcicleSpec
  x: number
  z: number
  mesh: Group
  warned: number
  landed: number
}

export class Icicles implements StageFeature {
  private readonly host: ClimbHost
  readonly icicles: IcicleRt[] = []
  private readonly cue: AtlasCue | null = null
  /** The roofs built (room, centre, underside, size in m). */
  readonly roofs: Array<{ room: number; x: number; y: number; z: number; w: number; d: number }> = []
  /** The Deep Mine drops stalactites instead (same rhythm, same marker). */
  private readonly rock: boolean

  constructor(host: ClimbHost, t: Terrain) {
    this.host = host
    this.rock = host.theme.id === 'drill'
    for (const d of t.icicles ?? []) {
      const x = cellCenter(d.i)
      const z = cellCenter(d.j)
      const mesh = this.rock ? buildStalactite() : buildIcicle()
      mesh.position.set(x, d.y + ICICLE_H, z)
      mesh.rotation.y = d.i * 2.3 + d.j
      host.propParent(x, z).add(mesh)
      this.icicles.push({ def: d, x, z, mesh, warned: -1, landed: -1 })
    }
    this.buildRoofs(t)
    const f = this.icicles[0]
    if (f) this.cue = new AtlasCue(host, this.rock ? 'hint.drill.drop' : 'hint.cryo.icicles', f.x, f.z, f.def.y, 8)
  }

  /** One roof per room that holds icicles, at the height of their roots. */
  private buildRoofs(t: Terrain): void {
    const map = this.host.map
    const roots = new Map<number, number>()
    for (const c of this.icicles) {
      const id = map.room[c.def.j * map.w + c.def.i] ?? -1
      if (id >= 0) roots.set(id, Math.max(roots.get(id) ?? -Infinity, c.def.y + ICICLE_H))
    }
    for (const [id, top] of roots) {
      const r = map.rooms[id]
      if (!r) continue
      let hi = -Infinity
      for (let j = r.z0; j < r.z0 + r.h; j++) {
        for (let i = r.x0; i < r.x0 + r.w; i++) {
          const k = j * map.w + i
          if (!t.pit[k]) hi = Math.max(hi, t.floor[k]! + t.rise[k]!)
        }
      }
      if (hi > top - HEADROOM) continue
      const x = (r.x0 + r.w / 2) * CELL
      const z = (r.z0 + r.h / 2) * CELL
      const roof = buildIcicleRoof(r.w, r.h, CELL, this.rock)
      roof.position.set(x, top + ROOF_OVER, z)
      this.host.propParent(x, z).add(roof)
      this.roofs.push({ room: id, x, y: top + ROOF_OVER, z, w: r.w * CELL, d: r.h * CELL })
    }
  }

  update(_dt: number, time: number, p: ClimbBody, playing: boolean): void {
    this.cue?.update(p, playing)
    for (const c of this.icicles) this.step(c, time, p, playing)
  }

  private step(c: IcicleRt, time: number, p: ClimbBody, playing: boolean): void {
    const d = c.def
    const period = Math.max(d.period, ICICLE_WARN + ICICLE_FALL + REGROW_AFTER + 0.6)
    const clock = time + d.phase
    const cyc = Math.floor(clock / period)
    const u = clock - cyc * period
    const m = c.mesh
    const tFall = ICICLE_WARN
    const tHit = tFall + ICICLE_FALL
    if (u < tFall) {
      // Hanging, trembling harder as the ring closes in.
      const k = u / tFall
      m.visible = true
      m.scale.setScalar(1)
      m.position.set(c.x + Math.sin(u * 55) * 0.05 * k, d.y + ICICLE_H, c.z)
      if (c.warned !== cyc) {
        c.warned = cyc
        this.host.markers.spawn(c.x, c.z, ICICLE_REACH + 0.25, ICICLE_WARN + ICICLE_FALL)
        this.host.sfx('tink', c.x, c.z)
      }
      return
    }
    if (u < tHit) {
      const k = (u - tFall) / ICICLE_FALL
      m.visible = true
      m.position.set(c.x, d.y + ICICLE_H - (ICICLE_H - ICICLE_LEN) * k * k, c.z)
      return
    }
    if (c.landed !== cyc) {
      c.landed = cyc
      this.crash(c, p, playing)
    }
    // Gone, then growing back out of the ceiling.
    const g = Math.min(1, Math.max(0, (u - tHit - REGROW_AFTER) / Math.max(0.3, period - tHit - REGROW_AFTER)))
    m.visible = g > 0.02
    m.scale.setScalar(Math.max(0.02, g))
    m.position.set(c.x, d.y + ICICLE_H, c.z)
  }

  private crash(c: IcicleRt, p: ClimbBody, playing: boolean): void {
    const y = c.def.y
    this.host.sfx('guardCrack', c.x, c.z)
    this.host.fx.sparks(c.x, y + 0.3, c.z, this.rock ? '#a08a6a' : '#dff8ff', 14, 5, 0.22)
    this.host.shocks.spawn(c.x, y + 0.05, c.z, ICICLE_REACH + 0.4, this.rock ? '#ffb12a' : '#bff4ff', 0.3)
    this.host.hurtMachines?.(ICICLE_COST, c.x, c.z, (x, yy, z) => Math.abs(yy - y) < 1.2 && (x - c.x) ** 2 + (z - c.z) ** 2 < (ICICLE_REACH + 0.4) ** 2)
    if (!playing || Math.abs(p.y - y) > 1.2) return
    const reach = ICICLE_REACH + PLAYER_R * 0.6
    if ((p.x - c.x) ** 2 + (p.z - c.z) ** 2 > reach * reach) return
    this.host.hitPlayer(null, Math.round(this.host.combat.maxHp * ICICLE_COST), { blockable: false, fromX: c.x, fromZ: c.z, kind: 'aoe', hazard: this.rock ? 'rock' : 'ice' })
  }

  save(): unknown {
    return this.cue?.said ? 1 : 0
  }

  restore(s: unknown): void {
    if (this.cue) this.cue.said = s === 1
  }
}
