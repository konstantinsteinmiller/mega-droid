import type { Group } from 'three'
import { cellCenter, CELL, type CrumbleSpec, type Terrain } from '../../world/levelGen'
import { buildCrumble, CRUMBLE_THICK } from '../../models/stageProps/crumble'
import type { Plat } from '../../world/nav'
import type { ClimbBody, ClimbHost } from '../climb'
import type { StageFeature } from '../stageFeatures'

/**
 * ─── Crumbling platforms (Mega Man's falling blocks) ────────────────────────
 *
 * A slab over a pit that holds exactly once. It rattles faintly as Flux
 * comes near (CR_RATTLE_R); stood on, it shudders for CR_SHAKE (dust, a
 * creak, the slab jittering harder), then drops away — a real
 * fall for whoever is still on it — and comes back CR_BACK later with a
 * pop. The slab is a platform in the nav (`nav.plats`, like a lift top), so
 * the body code treats it as floor until it falls. It comes back only when
 * nobody stands in its column. A crumble is part of a level's path, so a
 * player who falls with it is rescued by Atlas like any pit fall.
 */
export const CR_SHAKE = 1
/** Flux this near (m, across) and about level: the slab already rattles, a
 *  warning before it is ever stood on (#279). */
export const CR_RATTLE_R = 4
export const CR_DROP = 1.1
export const CR_BACK = 4

type Stage = 'idle' | 'shake' | 'fall' | 'gone'

interface CrumbleRt {
  def: CrumbleSpec
  x: number
  z: number
  plat: Plat
  mesh: Group
  stage: Stage
  t: number
}

/** Is Flux near enough, and about level, for an idle slab to rattle? */
export const rattles = (x: number, z: number, y: number, p: Pick<ClimbBody, 'x' | 'y' | 'z'>): boolean =>
  Math.hypot(p.x - x, p.z - z) < CR_RATTLE_R && Math.abs(p.y - y) < 2.5

export class CrumbleFeature implements StageFeature {
  private readonly host: ClimbHost
  readonly slabs: CrumbleRt[] = []

  constructor(host: ClimbHost, t: Terrain) {
    this.host = host
    const nav = host.nav
    for (const d of t.crumbles ?? []) {
      const w = d.w ?? 1
      const dd = d.d ?? 1
      const x0 = d.i * CELL
      const z0 = d.j * CELL
      const x = x0 + (w * CELL) / 2
      const z = z0 + (dd * CELL) / 2
      const plat: Plat = { x0, z0, x1: x0 + w * CELL, z1: z0 + dd * CELL, top: d.y, dx: 0, dz: 0 }
      nav.plats!.push(plat)
      const mesh = buildCrumble(w, dd)
      mesh.position.set(x, d.y, z)
      host.propParent(cellCenter(d.i), cellCenter(d.j)).add(mesh)
      this.slabs.push({ def: d, x, z, plat, mesh, stage: 'idle', t: 0 })
    }
  }

  update(dt: number, _time: number, p: ClimbBody, _playing: boolean): void {
    for (const c of this.slabs) this.step(c, dt, p)
  }

  private on(c: CrumbleRt, p: ClimbBody): boolean {
    return p.ground && Math.abs(p.y - c.def.y) < 0.1 &&
      p.x > c.plat.x0 && p.x < c.plat.x1 && p.z > c.plat.z0 && p.z < c.plat.z1
  }

  private step(c: CrumbleRt, dt: number, p: ClimbBody): void {
    const d = c.def
    const m = c.mesh
    const h = this.host
    c.t += dt
    switch (c.stage) {
      case 'idle':
        if (this.on(c, p)) {
          c.stage = 'shake'
          c.t = 0
          h.sfx('guardCrack', c.x, c.z)
        } else if (rattles(c.x, c.z, d.y, p)) {
          m.position.set(c.x + Math.sin(c.t * 41) * 0.012, d.y + Math.abs(Math.sin(c.t * 29)) * 0.008, c.z)
          if (Math.random() < 0.04) h.fx.emit({ x: c.x + (Math.random() - 0.5) * CELL * 0.8, y: d.y - CRUMBLE_THICK, z: c.z + (Math.random() - 0.5) * CELL * 0.8, vy: -1, color: '#9a8a74', size: 0.25, sizeEnd: 0.08, life: 0.4 })
        } else m.position.set(c.x, d.y, c.z)
        break
      case 'shake': {
        const k = c.t / CR_SHAKE
        m.position.set(c.x + Math.sin(c.t * 60) * 0.05 * (0.4 + k), d.y + Math.sin(c.t * 47) * 0.02, c.z)
        if (Math.random() < 0.35) h.fx.emit({ x: c.x + (Math.random() - 0.5) * CELL * 0.8, y: d.y - CRUMBLE_THICK, z: c.z + (Math.random() - 0.5) * CELL * 0.8, vy: -1.5, color: '#9a8a74', size: 0.35, sizeEnd: 0.1, life: 0.5 })
        if (c.t >= CR_SHAKE) {
          c.stage = 'fall'
          c.t = 0
          c.plat.top = -1e4
          h.sfx('stomp', c.x, c.z)
        }
        break
      }
      case 'fall': {
        // Down and away, tumbling a little, then out of sight.
        const y = d.y - 6 * c.t * c.t
        m.position.set(c.x, y, c.z)
        m.rotation.set(c.t * 0.5, 0, c.t * 0.35)
        if (c.t >= CR_DROP) {
          c.stage = 'gone'
          m.visible = false
        }
        break
      }
      case 'gone':
        // Back once nobody is in its column.
        if (c.t >= CR_BACK - CR_DROP && !(p.x > c.plat.x0 - 0.3 && p.x < c.plat.x1 + 0.3 && p.z > c.plat.z0 - 0.3 && p.z < c.plat.z1 + 0.3)) {
          c.stage = 'idle'
          c.t = 0
          c.plat.top = d.y
          m.visible = true
          m.position.set(c.x, d.y, c.z)
          m.rotation.set(0, 0, 0)
          m.scale.setScalar(1)
          h.fx.riseRing(c.x, d.y + 0.05, c.z, '#ffb22a', 0.8, 12)
        }
        break
    }
  }

  /** A crumble about to go (or gone) near (x, z): Flux is in a hurry. */
  hazardNear(x: number, z: number, r: number): boolean {
    for (const c of this.slabs) {
      if (c.stage !== 'idle' && Math.hypot(c.x - x, c.z - z) < r) return true
    }
    return false
  }

  /** Nothing to save: every slab is back after a reload. */
  dispose(): void {
    for (const c of this.slabs) c.mesh.removeFromParent()
  }
}
