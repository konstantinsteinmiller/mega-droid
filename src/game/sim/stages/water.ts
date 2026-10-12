import type { Mesh } from 'three'
import { CELL, Cell, cellCenter, type MapData, type Terrain, type WaterZone } from '../../world/levelGen'
import { BUTTON_Y } from '../../world/stages/builder'
import {
  buildWater, buildValve, setValveColor, buildPoolRim, buildInlet, buildDrain, INLET_OUT,
  type WaterMesh, type ValveMesh, type RimEdge
} from '../../models/stageProps/water'
import type { ClimbBody, ClimbHost } from '../climb'
import type { Shot } from '../world'
import { segNear } from '../secrets'
import { AtlasCue, type MoveMod, type StageFeature } from '../stageFeatures'

/**
 * ─── Water (the Tidewater Locks, `world/stages/tide.ts`) ─────────────────────
 *
 * A `WaterZone`'s surface stands at `levelAt` — on the clock (the tide:
 * rise, hold, fall, hold), held high behind a lock until its valve is shot
 * (then it drains for good), or still. Wading slows Flux the deeper it is
 * (WADE_* below); over his chest (DEEP) it hurts, a tick every DROWN_TICK
 * s, so a rising tide sends him up the steps. A current pushes whoever wades
 * in it. The surfaces and the valves' state ride in the climb's snapshot.
 *
 * Water never stands on a floor in the open (`WaterZone`): still and
 * running water fills a pool sunk into the floor, with a coping along its
 * rim; a tide is a sealed flood (`stepFlood`) — its low doors slam first,
 * inlets in its walls pour it in, a drain in its floor takes it away when
 * the room is done, and only then do the doors open again.
 */

/** The tide's shape over one period: rising, holding high, falling, low. */
const RISE = 0.3
const HOLD = 0.2
const FALL = 0.3
/** Wading: no slow under WADE_FROM (m of water), the full slow (×WADE_MIN)
 *  at WADE_FULL. */
const WADE_FROM = 0.2
const WADE_FULL = 1.1
const WADE_MIN = 0.5
/** Over this much water Flux is out of his depth: it hurts. */
export const DEEP = 1.25
/** A tick of the deep water's harm (s) and its share of his health. */
export const DROWN_TICK = 0.8
export const DROWN_COST = 0.05
/** A valve's hit radius (m) over the shot's own. */
const VALVE_R = 0.5
/** A drained lock's surface falls this fast (m/s). */
const DRAIN_RATE = 1.2

const ease = (k: number) => k * k * (3 - 2 * k)

/** The surface of zone `z` at `time` (a lock: `drained` or not). */
export const levelAt = (z: WaterZone, time: number, drained = false): number => {
  if (z.valve) return drained ? z.lo : z.hi
  if (!z.period || z.period <= 0) return z.lo
  const u = ((((time + (z.phase ?? 0)) % z.period) + z.period) % z.period) / z.period
  let k: number
  if (u < RISE) k = ease(u / RISE)
  else if (u < RISE + HOLD) k = 1
  else if (u < RISE + HOLD + FALL) k = 1 - ease((u - RISE - HOLD) / FALL)
  else k = 0
  return z.lo + (z.hi - z.lo) * k
}

/** The walk's speed share wading `depth` m deep. */
export const wadeSpeed = (depth: number): number => {
  if (depth <= WADE_FROM) return 1
  const k = Math.min(1, (depth - WADE_FROM) / (WADE_FULL - WADE_FROM))
  return 1 - (1 - WADE_MIN) * k
}

const SIDE = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] } as const
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const

/** A flood room's stages: dry and waiting for Flux; its low doors slamming;
 *  filling on the tide's clock; pulled out through the drain; done for good
 *  (its goal met). */
export type FloodState = 'idle' | 'sealing' | 'flooding' | 'draining' | 'done'

/** Flux stands this far (m) from every low doorway of a flood room before it
 *  seals: never shut in the doorway. */
const SEAL_CLEAR = 3.2
/** A flood drains this fast (m/s), and its doors open once it is under the
 *  room's lowest floor. */
const FLOOD_DRAIN = 1.6
/** Flux over the waterline by this much (m) on his own feet: a flood room's
 *  climb is done. */
const ABOVE = 0.5
/** A rim edge gets its coping where the rim stands this far over the basin. */
const RIM_STEP = 0.3
/** The inlets stand this far over the flood's top (m). */
const INLET_OVER = 0.7

/** The doorways of `room` whose sill is under `y`: a flood must seal them. */
export const lowDoors = (map: MapData, room: number, y: number): number[] => {
  const t = map.terrain!
  return map.doors.filter(d => (d.from === room || d.to === room) && t.floor[d.j * map.w + d.i]! < y).map(d => d.id)
}

/** The rim edges over a zone's basin: a zone cell (no pit, no ramp) beside a
 *  floor cell out of the zone standing RIM_STEP or more over it. */
export const rimEdges = (map: MapData, z: WaterZone): RimEdge[] => {
  const t = map.terrain!
  const out: RimEdge[] = []
  const inZone = (i: number, j: number) => i >= z.i0 && i <= z.i1 && j >= z.j0 && j <= z.j1
  for (let j = z.j0; j <= z.j1; j++) {
    for (let i = z.i0; i <= z.i1; i++) {
      const k = j * map.w + i
      if (t.pit[k] || t.ramp[k]) continue
      for (const [di, dj] of DIRS) {
        const ni = i + di
        const nj = j + dj
        if (inZone(ni, nj) || ni < 0 || nj < 0 || ni >= map.w || nj >= map.h) continue
        const nk = nj * map.w + ni
        if (map.cell[nk] === Cell.Void || t.pit[nk] || t.ramp[nk]) continue
        const y = t.floor[nk]!
        if (y - t.floor[k]! < RIM_STEP) continue
        // The shared edge's line, and the basin's side of it (−di, −dj from the rim).
        const ex = (di > 0 ? i + 1 : di < 0 ? i : i) * CELL
        const ez = (dj > 0 ? j + 1 : dj < 0 ? j : j) * CELL
        if (di) out.push({ x0: ex, z0: j * CELL, x1: ex, z1: (j + 1) * CELL, y, nx: -di, nz: 0 })
        else out.push({ x0: i * CELL, z0: ez, x1: (i + 1) * CELL, z1: ez, y, nx: 0, nz: -dj })
      }
    }
  }
  return out
}

interface InletRt {
  mesh: Mesh
  /** The mouth, and the way it pours (a unit axis). */
  x: number
  y: number
  z: number
  nx: number
  nz: number
}

interface FloodRt {
  state: FloodState
  /** The mission clock when it began to fill. */
  t0: number
  /** The low doorways, and the ones this flood shut (it opens only those). */
  doors: number[]
  shut: number[]
  /** The lowest floor under it (its surface hides under this). */
  bottom: number
  inlets: InletRt[]
  drain: { mesh: Mesh; x: number; y: number; z: number } | null
}

interface ZoneRt {
  def: WaterZone
  level: number
  drained: boolean
  mesh: WaterMesh
  valve: ValveMesh | null
  rim: Mesh | null
  flood: FloodRt | null
  vx: number
  vy: number
  vz: number
  nx: number
  nz: number
  spin: number
}

export class WaterFeature implements StageFeature {
  private readonly host: ClimbHost
  readonly zones: ZoneRt[]
  private drownT = 0
  private readonly cues: AtlasCue[] = []
  private deepCue: AtlasCue | null = null

  constructor(host: ClimbHost, t: Terrain) {
    this.host = host
    const map = host.map
    this.zones = (t.water ?? []).map(def => {
      const mesh = buildWater(def.i0 * CELL, def.j0 * CELL, (def.i1 + 1) * CELL, (def.j1 + 1) * CELL, def.strength ? 1.2 : 0, def.dx ?? 0, def.dz ?? 0)
      const flood = def.flood ? this.buildFlood(def) : null
      const level = flood ? def.lo : levelAt(def, 0)
      mesh.mesh.position.y = level
      mesh.mesh.visible = !flood
      host.propParent(mesh.mesh.position.x, mesh.mesh.position.z).add(mesh.mesh)
      const rim = buildPoolRim(rimEdges(map, def))
      if (rim) host.propParent(mesh.mesh.position.x, mesh.mesh.position.z).add(rim)
      let valve: ValveMesh | null = null
      let vx = 0
      let vy = 0
      let vz = 0
      let nx = 0
      let nz = 0
      if (def.valve) {
        const [sx, sz] = SIDE[def.valve.side]
        vx = cellCenter(def.valve.i) + sx * (CELL / 2 - 0.1)
        vz = cellCenter(def.valve.j) + sz * (CELL / 2 - 0.1)
        vy = t.floor[def.valve.j * map.w + def.valve.i]! + BUTTON_Y
        nx = -sx
        nz = -sz
        valve = buildValve()
        valve.root.position.set(vx, vy, vz)
        valve.root.rotation.y = Math.atan2(nx, nz)
        host.propParent(vx, vz).add(valve.root)
      }
      return { def, level, drained: false, mesh, valve, rim, flood, vx, vy, vz, nx, nz, spin: 0 }
    })
    // Atlas: the first tide, the first valve.
    const y0 = (z: WaterZone) => t.floor[z.j0 * map.w + z.i0]!
    const tide = this.zones.find(z => z.def.period)
    if (tide) this.cues.push(new AtlasCue(host, 'hint.tide.rise', cellCenter(tide.def.i0), cellCenter(tide.def.j0), y0(tide.def), 5))
    const lock = this.zones.find(z => z.valve)
    if (lock?.def.valve) {
      const v = lock.def.valve
      this.cues.push(new AtlasCue(host, 'hint.tide.valve', cellCenter(v.i), cellCenter(v.j), t.floor[v.j * map.w + v.i]!, 6))
    }
  }

  /** A flood room's parts: its low doors, two inlets in the walls by its
   *  lowest floor (over the flood's top), a drain in that floor. */
  private buildFlood(def: WaterZone): FloodRt {
    const map = this.host.map
    const t = map.terrain!
    let bottom = Infinity
    for (let j = def.j0; j <= def.j1; j++) {
      for (let i = def.i0; i <= def.i1; i++) {
        const k = j * map.w + i
        if (!t.pit[k]) bottom = Math.min(bottom, t.floor[k]!)
      }
    }
    const low: Array<[number, number]> = []
    for (let j = def.j0; j <= def.j1; j++) {
      for (let i = def.i0; i <= def.i1; i++) {
        const k = j * map.w + i
        if (!t.pit[k] && !t.ramp[k] && t.floor[k] === bottom) low.push([i, j])
      }
    }
    const doors = lowDoors(map, def.room, def.hi)
    // Wall spots by the lowest floor, clear of the doorways.
    const spots: Array<{ i: number; j: number; di: number; dj: number }> = []
    for (const [i, j] of low) {
      for (const [di, dj] of DIRS) {
        const ni = i + di
        const nj = j + dj
        if (ni < 0 || nj < 0 || ni >= map.w || nj >= map.h || map.cell[nj * map.w + ni] !== Cell.Void) continue
        if (map.doors.some(d => Math.abs(d.i - i) + Math.abs(d.j - j) <= 1)) continue
        if (def.valve && def.valve.i === i && def.valve.j === j) continue
        spots.push({ i, j, di, dj })
      }
    }
    // Two of them, as far apart as there are.
    const picked: typeof spots = []
    if (spots.length) {
      picked.push(spots[0]!)
      let far = spots[0]!
      let best = -1
      for (const s of spots) {
        const d = Math.abs(s.i - spots[0]!.i) + Math.abs(s.j - spots[0]!.j) + (s.di !== spots[0]!.di || s.dj !== spots[0]!.dj ? 0.5 : 0)
        if (d > best) { best = d; far = s }
      }
      if (far !== spots[0]) picked.push(far)
    }
    const top = map.terrain!.wallTop[def.room] ?? def.hi + 3
    const inlets = picked.map((s): InletRt => {
      const mesh = buildInlet()
      const wx = cellCenter(s.i) + s.di * (CELL / 2)
      const wz = cellCenter(s.j) + s.dj * (CELL / 2)
      const y = Math.min(def.hi + INLET_OVER, top - 0.6)
      const nx = -s.di
      const nz = -s.dj
      mesh.position.set(wx, y, wz)
      mesh.rotation.y = Math.atan2(nx, nz)
      this.host.propParent(wx, wz).add(mesh)
      return { mesh, x: wx + nx * INLET_OUT, y, z: wz + nz * INLET_OUT, nx, nz }
    })
    // The drain: in the lowest floor, its cell nearest the zone's middle.
    let drain: FloodRt['drain'] = null
    if (low.length && inlets.length) {
      const ci = (def.i0 + def.i1) / 2
      const cj = (def.j0 + def.j1) / 2
      const [i, j] = low.reduce((a, b) => (Math.hypot(b[0] - ci, b[1] - cj) < Math.hypot(a[0] - ci, a[1] - cj) ? b : a))
      const mesh = buildDrain()
      mesh.position.set(cellCenter(i), bottom, cellCenter(j))
      this.host.propParent(mesh.position.x, mesh.position.z).add(mesh)
      drain = { mesh, x: cellCenter(i), y: bottom, z: cellCenter(j) }
    }
    return { state: 'idle', t0: 0, doors, shut: [], bottom, inlets, drain }
  }

  /** The zone with the deepest water over (x, z) at floor y, and its depth. */
  depthAt(x: number, y: number, z: number): { zone: ZoneRt | null; depth: number } {
    const i = Math.floor(x / CELL)
    const j = Math.floor(z / CELL)
    let best: ZoneRt | null = null
    let depth = 0
    for (const zr of this.zones) {
      const d = zr.def
      if (i < d.i0 || i > d.i1 || j < d.j0 || j > d.j1) continue
      const dd = zr.level - y
      if (dd > depth) { depth = dd; best = zr }
    }
    return { zone: best, depth }
  }

  update(dt: number, time: number, p: ClimbBody, playing: boolean): void {
    for (const z of this.zones) {
      let churn = 0
      if (z.flood) churn = this.stepFlood(z, z.flood, dt, time, p, playing)
      else {
        const want = levelAt(z.def, time, z.drained)
        // A lock drains at its pace; the tide follows its clock.
        z.level = z.def.valve ? Math.max(want, z.level - DRAIN_RATE * dt) : want
      }
      z.mesh.mesh.position.y = z.level
      z.mesh.mat.uniforms.uTime!.value = time
      z.mesh.mat.uniforms.uChurn!.value = churn
      if (z.valve) {
        z.spin = Math.max(0, z.spin - dt * 2)
        z.valve.wheel.rotation.z -= z.spin * dt * 8
      }
    }
    for (const c of this.cues) c.update(p, playing)
    // Out of his depth: a tick of harm (and Atlas's warning, once).
    const t = this.host.map.terrain!
    const k = Math.floor(p.z / CELL) * this.host.map.w + Math.floor(p.x / CELL)
    const onFloor = !t.pit[k]
    const { depth } = this.depthAt(p.x, p.y, p.z)
    if (playing && onFloor && depth > DEEP) {
      if (!this.deepCue) {
        this.deepCue = new AtlasCue(this.host, 'hint.tide.deep', p.x, p.z, p.y, 99, 99)
      }
      this.deepCue.update(p, playing)
      this.drownT -= dt
      if (this.drownT <= 0) {
        this.drownT = DROWN_TICK
        this.host.hitPlayer(null, Math.max(1, Math.round(this.host.combat.maxHp * DROWN_COST)), { blockable: false, fromX: p.x, fromZ: p.z + 0.01, kind: 'aoe' })
        this.host.fx.emit({ x: p.x, y: p.y + 1.2, z: p.z, vy: 1.5, color: '#bff0ff', size: 0.2, sizeEnd: 0.05, life: 0.6 })
      }
    } else {
      this.drownT = Math.min(this.drownT, 0.3)
    }
  }

  /** How far door `id` stands open (a host without doors: shut). */
  private doorOpen(id: number): number {
    return this.host.doorOpen ? this.host.doorOpen(id) : 0
  }

  /**
   * A flood room, one step: it seals once Flux is in it and clear of its
   * low doorways (the doors slam; a boss shutter is the mission's to shut),
   * fills from its inlets once every one of them is shut, drains through
   * its floor when the room is done — its machines down, or Flux up over the
   * waterline — or when he is out of it (a retry behind it), or a doorway
   * opens under it; then its doors open again. Returns the surface's churn.
   */
  private stepFlood(z: ZoneRt, f: FloodRt, dt: number, time: number, p: ClimbBody, playing: boolean): number {
    const map = this.host.map
    const def = z.def
    const i = Math.floor(p.x / CELL)
    const j = Math.floor(p.z / CELL)
    const inRoom = this.inFlood(def.room, i, j)
    let churn = 0
    if (f.state === 'idle' || f.state === 'done') {
      z.level = def.lo
      if (f.state === 'idle' && playing && inRoom && this.clearOfDoors(f, p)) {
        f.state = 'sealing'
        for (const id of f.doors) {
          const d = map.doors[id]!
          if (d.boss || this.host.doorHeld?.(id)) continue
          this.host.shutDoor?.(id)
          f.shut.push(id)
          const [fx, fz] = doorAt(id, map)
          this.host.sfx('door', fx, fz)
        }
      }
    } else if (f.state === 'sealing') {
      if (!inRoom) this.drainFlood(f)
      else if (f.doors.every(id => this.doorOpen(id) <= 0)) {
        f.state = 'flooding'
        f.t0 = time
        for (const n of f.inlets) this.host.sfx('trapHiss', n.x, n.z)
      }
    } else if (f.state === 'flooding') {
      const prev = z.level
      z.level = levelAt(def, time - f.t0 - (def.phase ?? 0))
      const rising = z.level > prev + 1e-5
      churn = rising ? 1 : 0.25
      if (rising) this.pour(f, z.level)
      // Done: its machines down, Flux up over the waterline, or a doorway
      // opened under it by the mission (the boss beaten, the lesson room).
      const done = (this.host.roomClear?.(def.room) ?? false) || (inRoom && p.ground && p.y >= def.hi + ABOVE) ||
        f.doors.some(id => this.doorOpen(id) > 0)
      if (done) this.won.add(def.room)
      if (done || !inRoom) this.drainFlood(f)
    }
    if (f.state === 'draining') {
      z.level = Math.max(def.lo, z.level - FLOOD_DRAIN * dt)
      churn = 0.7
      const d = f.drain
      if (d && z.level > f.bottom && Math.random() < 0.8) {
        const a = Math.random() * Math.PI * 2
        const r = 0.5 + Math.random() * 0.9
        this.host.fx.emit({ x: d.x + Math.cos(a) * r, y: z.level + 0.05, z: d.z + Math.sin(a) * r, vx: -Math.sin(a) * 2 - Math.cos(a), vz: Math.cos(a) * 2 - Math.sin(a), color: '#dff6ff', size: 0.16, sizeEnd: 0.04, life: 0.5 })
      }
      if (z.level <= f.bottom - 0.05 || z.level <= def.lo) {
        for (const id of f.shut) this.host.releaseDoor?.(id)
        f.shut.length = 0
        f.state = this.won.has(def.room) ? 'done' : 'idle'
        if (d) this.host.sfx('door', d.x, d.z)
      }
    }
    z.mesh.mesh.visible = z.level > f.bottom + 0.02
    return churn
  }

  /** Rooms whose flood was beaten: it never comes back. */
  private readonly won = new Set<number>()

  /** Cell (i, j) is in flood room `room`: one of its cells, or under one of
   *  its floods (the lesson room's corridor off the arena). */
  private inFlood(room: number, i: number, j: number): boolean {
    const map = this.host.map
    if (i < 0 || j < 0 || i >= map.w || j >= map.h) return false
    const k = j * map.w + i
    if (map.room[k] === room && map.cell[k] === Cell.Room) return true
    return this.zones.some(z => z.flood && z.def.room === room && i >= z.def.i0 && i <= z.def.i1 && j >= z.def.j0 && j <= z.def.j1)
  }

  private clearOfDoors(f: FloodRt, p: ClimbBody): boolean {
    for (const id of f.doors) {
      const [fx, fz] = doorAt(id, this.host.map)
      if (Math.hypot(p.x - fx, p.z - fz) < SEAL_CLEAR) return false
    }
    return true
  }

  /** Start pulling a flood out (it may not have begun to fill). */
  private drainFlood(f: FloodRt): void {
    f.state = 'draining'
    const d = f.drain
    if (d) this.host.sfx('trapHiss', d.x, d.z)
  }

  /** The inlets pour while the flood rises: a stream out of each mouth
   *  arcing down into the water, and spray where it lands. */
  private pour(f: FloodRt, level: number): void {
    const fx = this.host.fx
    for (const n of f.inlets) {
      for (let s = 0; s < 2; s++) {
        const sp = 2.2 + Math.random() * 0.8
        fx.emit({
          x: n.x + (Math.random() - 0.5) * 0.3, y: n.y + (Math.random() - 0.5) * 0.3, z: n.z + (Math.random() - 0.5) * 0.3,
          vx: n.nx * sp, vy: 0.3, vz: n.nz * sp, color: Math.random() < 0.5 ? '#9fe4ff' : '#e6fbff',
          size: 0.26, sizeEnd: 0.1, life: 0.55, gravity: 12
        })
      }
      if (Math.random() < 0.6) {
        // Where the stream meets the water: about a metre and a half out.
        const out = 1.2 + Math.random() * 0.6
        fx.emit({
          x: n.x + n.nx * out + (Math.random() - 0.5) * 0.6, y: level + 0.05, z: n.z + n.nz * out + (Math.random() - 0.5) * 0.6,
          vx: (Math.random() - 0.5) * 1.5, vy: 1.5 + Math.random() * 1.5, vz: (Math.random() - 0.5) * 1.5,
          color: '#ffffff', size: 0.2, sizeEnd: 0.04, life: 0.45, gravity: 8
        })
      }
    }
  }

  move(p: ClimbBody, out: MoveMod): void {
    const { zone, depth } = this.depthAt(p.x, p.y, p.z)
    if (!zone || depth <= WADE_FROM) return
    out.speed = Math.min(out.speed ?? 1, wadeSpeed(depth))
    const d = zone.def
    if (d.strength && (d.dx || d.dz)) {
      out.pushX += (d.dx ?? 0) * d.strength
      out.pushZ += (d.dz ?? 0) * d.strength
    }
  }

  shot(s: Shot): boolean {
    for (const z of this.zones) {
      if (!z.valve || z.drained) continue
      if ((s.px - z.vx) * z.nx + (s.pz - z.vz) * z.nz < -0.05) continue
      if (!segNear(s.px, s.py, s.pz, s.x, s.y, s.z, z.vx, z.vy, z.vz, VALVE_R + s.radius)) continue
      z.drained = true
      z.spin = 3
      setValveColor(z.valve, '#5dff8a')
      this.host.sfx('uiClick', z.vx, z.vz)
      this.host.sfx('door', z.vx, z.vz)
      return true
    }
    return false
  }

  save(): unknown {
    return {
      drained: this.zones.map(z => (z.drained ? 1 : 0)),
      cues: this.cues.map(c => (c.said ? 1 : 0)),
      won: [...this.won]
    }
  }

  restore(s: unknown): void {
    const o = s as { drained?: unknown; cues?: unknown; won?: unknown } | null
    if (!o || typeof o !== 'object') return
    if (Array.isArray(o.drained)) {
      this.zones.forEach((z, i) => {
        if ((o.drained as unknown[])[i] !== 1) return
        z.drained = true
        z.level = z.def.lo
        z.mesh.mesh.position.y = z.level
        if (z.valve) setValveColor(z.valve, '#5dff8a')
      })
    }
    if (Array.isArray(o.cues)) this.cues.forEach((c, i) => { c.said = (o.cues as unknown[])[i] === 1 })
    this.won.clear()
    if (Array.isArray(o.won)) for (const r of o.won) if (typeof r === 'number') this.won.add(r)
    // A flood starts over dry: its doors open, it seals again when Flux is
    // back in it.
    for (const z of this.zones) {
      const f = z.flood
      if (!f) continue
      for (const id of f.shut) this.host.releaseDoor?.(id)
      f.shut.length = 0
      f.state = this.won.has(z.def.room) ? 'done' : 'idle'
      z.level = z.def.lo
      z.mesh.mesh.position.y = z.level
      z.mesh.mesh.visible = false
    }
  }
}

/** Where door `id`'s frame stands (`levelMesh.doorFramePos`). */
const doorAt = (id: number, map: MapData): [number, number] => {
  const d = map.doors[id]!
  return [cellCenter(d.i) + (d.axis === 'x' ? d.dir * CELL / 2 : 0), cellCenter(d.j) + (d.axis === 'z' ? d.dir * CELL / 2 : 0)]
}
