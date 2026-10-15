import type { Group } from 'three'
import { CELL, cellCenter, type IcicleSpec, type Terrain } from '../../world/levelGen'
import { buildIcicle, buildIcicleRoof, ICICLE_MOUNT, ROOF_THICK } from '../../models/stageProps/frost'
import { buildStalactite, STALACTITE_MOUNT } from '../../models/stageProps/rock'
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
 * The ceiling is real: every room that holds icicles gets a roof
 * (`buildIcicleRoof`), and every icicle hangs FROM it — its root in the roof,
 * whatever floor it hangs over. They used to hang in the open sky, and in a
 * room of several floors (the Deep Mine's terrace descent) each hung a fixed
 * ICICLE_H over its own floor: the lower ones floated metres under the roof,
 * and a room whose ledge came too close to the roots got no roof at all
 * (playtest 2026-10-11). A tall drop grows a longer stalactite (up to
 * ICICLE_MAX_LEN) and falls for longer, as a stone does.
 *
 * Its mount stretches with it, so its root is set per length: the mount's top
 * always sits inside the roof slab (MOUNT_IN over the underside, under the
 * lid). A fixed root let a long stalactite's cap poke up through the roof and
 * read, from above, as a rock floating over an open room (playtest 2026-10-16).
 */

export const ICICLE_WARN = 1.1
export const ICICLE_FALL = 0.32
/** Its root's height over the floor (m), at least, where the walls allow;
 *  the icicle is ICICLE_LEN long at that drop. */
const ICICLE_H = 4.6
const ICICLE_LEN = 1.6
/** A longer drop grows a longer icicle, its tip this far over the floor… */
const TIP_CLEAR = 3
/** …within these lengths (m). */
const ICICLE_MIN_LEN = 1.1
const ICICLE_MAX_LEN = 3.2
export const ICICLE_REACH = 1
export const ICICLE_COST = 0.12
/** After the crash, a beat of nothing before it starts to grow back (s). */
const REGROW_AFTER = 0.3
/** The roof's underside over an icicle's root (m): its mount sits in it. */
const ROOF_OVER = 0.12
/** The roof stays this far under the wall tops (m): never in their plane. */
const WALL_GAP = 0.15
/** The mount's top over the roof's underside (m): inside the slab. */
const MOUNT_IN = ROOF_THICK / 2

interface IcicleRt {
  def: IcicleSpec
  x: number
  z: number
  mesh: Group
  warned: number
  landed: number
  /** Its root at full size (m): the mount's top in its room's roof. */
  root: number
  /** Where the mount's top sits (m), in the roof slab. */
  top: number
  /** Its length (m) and so its mesh's vertical stretch. */
  len: number
  /** Its fall, root to floor (s). */
  fall: number
}

export class Icicles implements StageFeature {
  private readonly host: ClimbHost
  readonly icicles: IcicleRt[] = []
  private readonly cue: AtlasCue | null = null
  /** The roofs built (room, centre, underside, size in m). */
  readonly roofs: Array<{ room: number; x: number; y: number; z: number; w: number; d: number }> = []
  /** The Deep Mine drops stalactites instead (same rhythm, same marker). */
  private readonly rock: boolean
  /** The mount's top over the root at scale 1 (m). */
  private readonly mount: number

  constructor(host: ClimbHost, t: Terrain) {
    this.host = host
    this.rock = host.theme.id === 'drill'
    this.mount = this.rock ? STALACTITE_MOUNT : ICICLE_MOUNT
    const ceil = this.buildRoofs(t)
    const map = host.map
    for (const d of t.icicles ?? []) {
      const x = cellCenter(d.i)
      const z = cellCenter(d.j)
      const room = map.room[d.j * map.w + d.i] ?? -1
      const under = ceil.get(room) ?? d.y + ICICLE_H + ROOF_OVER
      const len = Math.min(ICICLE_MAX_LEN, Math.max(ICICLE_MIN_LEN, under - ROOF_OVER - d.y - TIP_CLEAR))
      const top = under + MOUNT_IN
      const root = top - this.mount * len / ICICLE_LEN
      const drop = root - d.y
      // Free fall: the time grows with the root of the distance.
      const fall = ICICLE_FALL * Math.sqrt(Math.max(0.2, drop - len) / (ICICLE_H - ICICLE_LEN))
      const mesh = this.rock ? buildStalactite() : buildIcicle()
      mesh.scale.set(1, len / ICICLE_LEN, 1)
      mesh.position.set(x, root, z)
      mesh.rotation.y = d.i * 2.3 + d.j
      host.propParent(x, z).add(mesh)
      this.icicles.push({ def: d, x, z, mesh, warned: -1, landed: -1, root, top, len, fall })
    }
    const f = this.icicles[0]
    if (f) this.cue = new AtlasCue(host, this.rock ? 'hint.drill.drop' : 'hint.cryo.icicles', f.x, f.z, f.def.y, 8)
  }

  /**
   * One roof per room that holds icicles: ICICLE_H over its highest root's
   * floor AND over its highest standing floor (so a ledge never puts Flux's
   * head in it), but never above the room's walls (a roof over the wall tops
   * leaves a gap of sky round it). Returns each room's roof height.
   */
  private buildRoofs(t: Terrain): Map<number, number> {
    const map = this.host.map
    const roots = new Map<number, number>()
    for (const d of t.icicles ?? []) {
      const id = map.room[d.j * map.w + d.i] ?? -1
      if (id >= 0) roots.set(id, Math.max(roots.get(id) ?? -Infinity, d.y + ICICLE_H))
    }
    const out = new Map<number, number>()
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
      const wall = t.wallTop[id] ?? Infinity
      const y = Math.min(Math.max(top, hi + ICICLE_H) + ROOF_OVER, wall - WALL_GAP)
      const x = (r.x0 + r.w / 2) * CELL
      const z = (r.z0 + r.h / 2) * CELL
      const roof = buildIcicleRoof(r.w, r.h, CELL, this.rock)
      roof.position.set(x, y, z)
      this.host.propParent(x, z).add(roof)
      this.roofs.push({ room: id, x, y, z, w: r.w * CELL, d: r.h * CELL })
      out.set(id, y)
    }
    return out
  }

  update(_dt: number, time: number, p: ClimbBody, playing: boolean): void {
    this.cue?.update(p, playing)
    for (const c of this.icicles) this.step(c, time, p, playing)
  }

  private step(c: IcicleRt, time: number, p: ClimbBody, playing: boolean): void {
    const d = c.def
    const period = Math.max(d.period, ICICLE_WARN + c.fall + REGROW_AFTER + 0.6)
    const clock = time + d.phase
    const cyc = Math.floor(clock / period)
    const u = clock - cyc * period
    const m = c.mesh
    const sy = c.len / ICICLE_LEN
    const tFall = ICICLE_WARN
    const tHit = tFall + c.fall
    if (u < tFall) {
      // Hanging, trembling harder as the ring closes in.
      const k = u / tFall
      m.visible = true
      m.scale.set(1, sy, 1)
      m.position.set(c.x + Math.sin(u * 55) * 0.05 * k, c.root, c.z)
      if (c.warned !== cyc) {
        c.warned = cyc
        this.host.markers.spawn(c.x, c.z, ICICLE_REACH + 0.25, ICICLE_WARN + c.fall)
        this.host.sfx('tink', c.x, c.z)
      }
      return
    }
    if (u < tHit) {
      const k = (u - tFall) / c.fall
      m.visible = true
      // Root to the tip on the floor.
      m.position.set(c.x, c.root - (c.root - d.y - c.len) * k * k, c.z)
      return
    }
    if (c.landed !== cyc) {
      c.landed = cyc
      this.crash(c, p, playing)
    }
    // Gone, then growing back out of the ceiling.
    const g = Math.min(1, Math.max(0, (u - tHit - REGROW_AFTER) / Math.max(0.3, period - tHit - REGROW_AFTER)))
    m.visible = g > 0.02
    const gs = Math.max(0.02, g)
    m.scale.set(gs, gs * sy, gs)
    // Out of the roof: the smaller mount's top still in the slab.
    m.position.set(c.x, c.top - this.mount * gs * sy, c.z)
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
