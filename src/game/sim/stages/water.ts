import { CELL, cellCenter, type Terrain, type WaterZone } from '../../world/levelGen'
import { BUTTON_Y } from '../../world/stages/builder'
import { buildWater, buildValve, setValveColor, type WaterMesh, type ValveMesh } from '../../models/stageProps/water'
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

interface ZoneRt {
  def: WaterZone
  level: number
  drained: boolean
  mesh: WaterMesh
  valve: ValveMesh | null
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
      const level = levelAt(def, 0)
      mesh.mesh.position.y = level
      host.propParent(mesh.mesh.position.x, mesh.mesh.position.z).add(mesh.mesh)
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
      return { def, level, drained: false, mesh, valve, vx, vy, vz, nx, nz, spin: 0 }
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
      const want = levelAt(z.def, time, z.drained)
      // A lock drains at its pace; the tide follows its clock.
      z.level = z.def.valve ? Math.max(want, z.level - DRAIN_RATE * dt) : want
      z.mesh.mesh.position.y = z.level
      z.mesh.mat.uniforms.uTime!.value = time
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
    return { drained: this.zones.map(z => (z.drained ? 1 : 0)), cues: this.cues.map(c => (c.said ? 1 : 0)) }
  }

  restore(s: unknown): void {
    const o = s as { drained?: unknown; cues?: unknown } | null
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
  }
}
