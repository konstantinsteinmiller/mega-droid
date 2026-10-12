import { Group, Mesh, type Object3D } from 'three'
import { CELL, cellCenter, type MapData, type Pillar, type Room } from '../world/levelGen'
import { floorAt, hasLineOfSight, type Nav } from '../world/nav'
import { rcyl, rbox, torus, xform, paint, merge } from '../models/kit'
import { toonVC, outlineMat } from '../models/toon'
import type { Theme } from '../world/themes'
import type { Particles } from '../fx/particles'
import type { Enemy, Shot } from './world'
import type { Crate } from './objectives'

/**
 * ─── The boss arena's kit ────────────────────────────────────────────────────
 *
 * Every Core Master's room used to be the same bare 7 × 7 floor. Each arena
 * now gets, around its own hazards:
 *
 *   • 1–3 barrels and crates along its walls. They pay energy pills, and
 *     rarely (ARENA_GEL_CHANCE) a Repair Gel — never more than one gel a room;
 *   • 1–2 cover pillars. They stop shots both ways and crack under the
 *     boss's fire: PILLAR_HP boss hits and one crumbles, so cover is a
 *     breather, never a fortress;
 *   • the anti-cheese rule. Two boss attacks in a row stopped by geometry —
 *     aimed at Flux, eaten by a pillar or a wall — or no line of sight for
 *     BLIND_ENRAGE while the fight is on, and the boss ENRAGES: smoke pours
 *     off it, its head burns red, and it rains shells on Flux from the sky
 *     (lobbed over any cover) every BARRAGE_EVERY until it has seen him for
 *     CALM_AFTER in a row.
 *
 * The arena never changes a boss's own AI: the barrage is extra, on the
 * mission's clock. Pure placement over the room; the mission drives it.
 */

export const ARENA_GEL_CHANCE = 0.05
export const PILLAR_HP = 3
export const BLOCKED_ENRAGE = 2
export const BLIND_ENRAGE = 6
export const BARRAGE_EVERY = 1.3
export const CALM_AFTER = 2
const BARRAGE_FLIGHT = 1.05
const BARRAGE_DMG = 1.2

export interface ArenaHost {
  nav: Nav
  map: MapData
  theme: Theme
  fx: Particles
  player: { x: number; z: number; y?: number }
  addArenaCrate(x: number, z: number, yaw: number, kind: 'crate' | 'barrel', y: number): Crate | null
  propParent(x: number, z: number): Object3D
  lobShell(e: Enemy, tx: number, tz: number, dur: number, dmg: number): void
  sfx(name: string, x?: number, z?: number): void
  shake(amount: number): void
}

interface CoverPillar {
  p: Pillar
  hp: number
  mesh: Group
  y: number
}

/** The cells of a map's floor hazards: live panels and magnet rails. */
const hazardCells = (map: MapData): Set<number> => {
  const out = new Set<number>()
  const t = map.terrain
  for (const v of t?.vents ?? []) if (!v.dx && !v.dz) out.add(v.j * map.w + v.i)
  for (const m of t?.magnets ?? []) for (let j = m.j0; j <= m.j1; j++) for (let i = m.i0; i <= m.i1; i++) out.add(j * map.w + i)
  return out
}

export class BossArena {
  readonly pillars: CoverPillar[] = []
  /** Gels this room's props have paid (at most one). */
  gels = 0
  /** Boss attacks in a row stopped by geometry. */
  private blocked = 0
  private blind = 0
  private seen = 0
  private barrageT = 0
  enraged = false

  constructor(private readonly host: ArenaHost, readonly room: Room, seed: number) {
    let s = seed >>> 0
    const rng = (): number => {
      s = (s * 1664525 + 1013904223) >>> 0
      return s / 4294967296
    }
    const r = room
    // Never on the arena's own floor hazards (a live panel, a magnet rail):
    // a crate stood on a shock panel, a pillar across a rail.
    const busy = hazardCells(host.map)
    // Cover: one or two pillars on a diagonal, two cells in from the walls.
    const spots: Array<[number, number]> = [[r.x0 + 2, r.z0 + 2], [r.x0 + r.w - 3, r.z0 + r.h - 3], [r.x0 + r.w - 3, r.z0 + 2], [r.x0 + 2, r.z0 + r.h - 3]]
    const nPillars = rng() < 0.5 ? 1 : 2
    const first = Math.floor(rng() * 2) * 2
    for (let k = 0; k < nPillars; k++) {
      const [i, j] = spots[(first + k) % spots.length]!
      if (!busy.has(j * host.map.w + i)) this.addPillar(i, j)
    }
    // Props: 1–3 along the walls, one cell in (corners and mid-walls).
    const wall: Array<[number, number, number]> = [
      [r.x0 + 1, r.z0 + 1, 0.4], [r.x0 + r.w - 2, r.z0 + 1, -0.4], [r.x0 + 1, r.z0 + r.h - 2, 2.7],
      [r.x0 + r.w - 2, r.z0 + r.h - 2, -2.7], [r.x0 + Math.floor(r.w / 2), r.z0 + 1, 0]
    ]
    const nProps = 1 + Math.floor(rng() * 3)
    for (let k = 0; k < nProps; k++) {
      const [i, j, yaw] = wall.splice(Math.floor(rng() * wall.length), 1)[0]!
      if (busy.has(j * host.map.w + i)) continue
      const x = cellCenter(i)
      const z = cellCenter(j)
      const y = Math.max(0, floorAt(host.nav, x, z))
      const c = host.addArenaCrate(x, z, yaw, rng() < 0.4 ? 'barrel' : 'crate', y)
      if (c) c.arena = true
    }
  }

  private addPillar(i: number, j: number): void {
    const h = this.host
    const x = cellCenter(i)
    const z = cellCenter(j)
    const y = Math.max(0, floorAt(h.nav, x, z))
    const p: Pillar = { x, z, r: 0.7 }
    h.map.pillars.push(p)
    const nb = h.map.navBlock
    if (nb) nb[j * h.map.w + i] = 1
    const t = h.theme
    const geo = merge([
      xform(paint(rcyl(0.7, 3.2, 0.18, 14), t.pilaster), [0, 1.6, 0]),
      xform(paint(torus(0.68, 0.1, 6, 14), t.trim), [0, 2.7, 0], [Math.PI / 2, 0, 0]),
      xform(paint(rbox(1.6, 0.3, 1.6, 0.1, 4, 2), t.trim), [0, 0.15, 0])
    ])
    const mesh = new Group()
    mesh.add(new Mesh(geo, toonVC()))
    const o = new Mesh(geo, outlineMat(0.03))
    o.renderOrder = -1
    mesh.add(o)
    mesh.position.set(x, y, z)
    h.propParent(x, z).add(mesh)
    this.pillars.push({ p, hp: PILLAR_HP, mesh, y })
  }

  /** A boss shot ended on geometry at (x, z): a pillar near it takes the hit;
   *  aimed at Flux and eaten, it counts toward the enrage. */
  shotBlocked(s: Shot): void {
    const src = s.source
    if (!src?.boss) return
    let hit: CoverPillar | null = null
    for (const c of this.pillars) {
      if (c.p.gone) continue
      if (Math.hypot(c.p.x - s.x, c.p.z - s.z) < c.p.r + 0.9) { hit = c; break }
    }
    if (hit) this.crack(hit)
    this.blocked++
  }

  /** A boss attack reached Flux (hit, block or parry): the run of blocked
   *  ones is over. */
  attackLanded(): void {
    this.blocked = 0
  }

  private crack(c: CoverPillar): void {
    const h = this.host
    c.hp--
    h.fx.sparks(c.p.x, c.y + 1.5, c.p.z, '#d9d2c2', 12, 5, 0.2)
    h.sfx('guardCrack', c.p.x, c.p.z)
    // Leaning and shrinking as it cracks.
    const k = c.hp / PILLAR_HP
    c.mesh.rotation.z = (1 - k) * 0.08
    c.mesh.scale.set(1, 0.85 + 0.15 * k, 1)
    if (c.hp > 0) return
    c.p.gone = true
    c.mesh.visible = false
    const nb = h.map.navBlock
    if (nb) nb[Math.floor(c.p.z / CELL) * h.map.w + Math.floor(c.p.x / CELL)] = 0
    h.fx.orbBurst(c.p.x, c.y + 1.2, c.p.z, '#b8ad98', 1.6)
    h.fx.sparks(c.p.x, c.y + 1, c.p.z, '#8a7f6c', 24, 7, 0.3)
    h.shake(0.35)
    h.sfx('explode', c.p.x, c.p.z)
  }

  /**
   * One step of the fight (only while the boss is up and the fight is on):
   * the enrage's triggers and its barrage. Returns true while enraged.
   */
  update(dt: number, boss: Enemy): boolean {
    const h = this.host
    const p = h.player
    const sees = hasLineOfSight(h.nav, boss.x, boss.z, p.x, p.z)
    if (sees) {
      this.blind = 0
      this.seen += dt
    } else {
      this.blind += dt
      this.seen = 0
    }
    if (!this.enraged && (this.blocked >= BLOCKED_ENRAGE || this.blind >= BLIND_ENRAGE)) {
      this.enraged = true
      this.barrageT = 0.4
      h.sfx('alert', boss.x, boss.z)
      h.shake(0.3)
    }
    if (!this.enraged) return false
    if (this.seen >= CALM_AFTER) {
      this.enraged = false
      this.blocked = 0
      this.blind = 0
      return false
    }
    // Smoke off its head, and the barrage over any cover.
    const top = boss.y + (boss.floor ?? 0) + boss.def.aimY * 1.9
    if (Math.random() < 0.6) h.fx.emit({ x: boss.x + (Math.random() - 0.5) * 0.6, y: top, z: boss.z + (Math.random() - 0.5) * 0.6, vx: 0, vy: 1.8, vz: 0, color: Math.random() < 0.5 ? '#3a3a44' : '#5a5560', size: 0.8, sizeEnd: 1.6, life: 0.9 })
    this.barrageT -= dt
    if (this.barrageT <= 0) {
      this.barrageT = BARRAGE_EVERY
      h.lobShell(boss, p.x, p.z, BARRAGE_FLIGHT, Math.round(boss.dmg * BARRAGE_DMG))
    }
    return true
  }

  /** A prop's drop: a pill always, a Repair Gel rarely and once a room. */
  drop(): 'we' | 'hp' | 'tank' {
    if (this.gels === 0 && Math.random() < ARENA_GEL_CHANCE) {
      this.gels++
      return 'tank'
    }
    return Math.random() < 0.55 ? 'we' : 'hp'
  }
}
