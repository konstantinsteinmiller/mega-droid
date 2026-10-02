import { Mesh, MeshBasicMaterial, AdditiveBlending, Color, SphereGeometry, Group } from 'three'
import type { Enemy } from './world'
import type { CombatSystem } from './combat'
import type { Particles } from '../fx/particles'
import { WEAPONS, weaponRank, type WeaponId } from '../data/weapons'
import { EYE_H, FREEZE_T } from './constants'
import type { PlayerStats } from './stats'
import type { Nav } from '../world/nav'
import { hasLineOfSight } from '../world/nav'
import { pushHud } from '../state/hud'

/**
 * ─── Special weapons ─────────────────────────────────────────────────────────
 *
 * The copied Core Master weapons. Each fires from the buster on a slot button
 * (or 1 / 2), costs Weapon Energy, has its own cooldown and a distinct verb
 * (a borrowed one, `borrowed.ts`, fires on the third button / 3 for charges
 * instead of energy):
 *
 *   Scrap Burst  — 3-way scrap spread (5-way at rank 3)
 *   Flame Wave   — a floor-hugging fireball that pierces a line and sets burns
 *   Ice Lance    — a fast piercing lance that freezes what it hits
 *   Thunder Arc  — instant bolt to the target, chaining to two more
 *   Gale Guard   — four leaves orbit Flux (eat shots, cut machines);
 *                  press again to hurl them forward
 */

export interface WeaponHost {
  nav: Nav
  fx: Particles
  system: CombatSystem
  enemies: Enemy[]
  stats: PlayerStats
  /** `y`: feet height (the climb; 0 on a flat map). */
  player: { x: number; z: number; yaw: number; y?: number }
  combat: { we: number; target: Enemy | null }
  time: number
  sfx(name: string, x?: number, z?: number): void
  shake(a: number): void
}

export class WeaponSystem {
  /** Per button: the two slots, then the borrowed weapon (`sim/borrowed.ts`). */
  cooldown: [number, number, number] = [0, 0, 0]
  /** Gale Guard state. */
  guardT = 0
  private leaves: Mesh[] = []
  private leafHitCd = new Map<number, number>()
  readonly root = new Group()
  private host: WeaponHost
  weaponXp: Partial<Record<WeaponId, number>>

  constructor(host: WeaponHost, weaponXp: Partial<Record<WeaponId, number>>) {
    this.host = host
    this.weaponXp = weaponXp
    const mat = new MeshBasicMaterial({ color: new Color('#7fffc8'), transparent: true, opacity: 0.9, blending: AdditiveBlending, depthWrite: false, toneMapped: false })
    const geo = new SphereGeometry(0.22, 10, 8)
    geo.scale(1.6, 0.4, 0.8)
    for (let k = 0; k < 4; k++) {
      const m = new Mesh(geo, mat)
      m.visible = false
      this.root.add(m)
      this.leaves.push(m)
    }
  }

  /** The live machine nearest to the ray from (x, z) at bearing `a`, within
   *  a narrow cone and in sight; machines in `skip` only as a last resort. */
  private nearestOnLine(x: number, z: number, a: number, skip: Enemy[]): Enemy | null {
    const h = this.host
    let best: Enemy | null = null
    let bestScore = Infinity
    for (const e of h.enemies) {
      if (e.state === 'dead' || e.offstage || e.buried) continue
      const d = Math.hypot(e.x - x, e.z - z)
      if (d > 20 || d < 0.5) continue
      let da = Math.atan2(e.x - x, e.z - z) - a
      while (da > Math.PI) da -= Math.PI * 2
      while (da < -Math.PI) da += Math.PI * 2
      if (Math.abs(da) > 0.13) continue
      if (!hasLineOfSight(h.nav, x, z, e.x, e.z)) continue
      const score = Math.abs(da) + (skip.includes(e) ? 1 : 0)
      if (score < bestScore) { best = e; bestScore = score }
    }
    return best
  }

  rank(id: WeaponId): 1 | 2 | 3 {
    return weaponRank(this.weaponXp[id] ?? 0, WEAPONS[id])
  }

  cost(id: WeaponId): number {
    return Math.max(1, Math.round(WEAPONS[id].cost * this.host.stats.weCostMul))
  }

  /**
   * Fire the weapon on button `i` (0, 1: the slots; 2: the borrowed weapon).
   * Returns 'ok' or why it could not. `free`: a borrowed weapon, which spends
   * a charge of its own instead of Weapon Energy (the caller counts it).
   */
  use(i: 0 | 1 | 2, id: WeaponId | '', muzzle: [number, number, number], aim: [number, number, number, Enemy | null], free = false): 'ok' | 'energy' | 'cooldown' | 'none' {
    if (!id) return 'none'
    const h = this.host
    const def = WEAPONS[id]
    if (this.cooldown[i] > 0) return 'cooldown'
    // Gale Guard recast = throw (free)
    if (id === 'galeGuard' && this.guardT > 0) {
      this.throwLeaves(aim)
      this.cooldown[i] = 0.4
      return 'ok'
    }
    const cost = free ? 0 : this.cost(id)
    if (h.combat.we < cost) return 'energy'
    h.combat.we -= cost
    this.cooldown[i] = def.cooldown
    const r = this.rank(id)
    const dmg = Math.round(h.stats.busterDmg * def.dmg * h.stats.specialMul * (1 + (r - 1) * 0.25))
    const [dx, dy, dz, tgt] = aim
    const [mx, my, mz] = muzzle
    const sys = h.system
    switch (id) {
      case 'scrapBurst': {
        const n = r >= 3 ? 5 : 3
        const yaw = Math.atan2(dx, dz)
        const taken: Enemy[] = []
        for (let k = 0; k < n; k++) {
          const a = yaw + (k / (n - 1) - 0.5) * 0.42
          // Each pellet leans onto a machine close to its own line (distinct
          // ones first), so a burst aimed at the middle of a group meets the
          // group — the weapon's whole point.
          const home = this.nearestOnLine(mx, mz, a, taken)
          if (home) taken.push(home)
          const s = sys.spawnPlayerShot('charge1', mx, my, mz, Math.sin(a), dy, Math.cos(a), dmg, false, home)
          this.tag(s, id, '#c9d3e6')
        }
        h.sfx('shoot')
        break
      }
      case 'flameWave': {
        // A wall of fire rolling along the floor FLUX STANDS ON. (It used to
        // start at height 0.45 of the map: on any raised floor that is under
        // the ground, so the weapon fired nothing anyone could see or hit.)
        const feet = h.player.y ?? 0
        const s = sys.spawnPlayerShot('charge2', h.player.x + dx * 0.8, feet + 0.45, h.player.z + dz * 0.8, dx, 0, dz, dmg, false, null)
        this.tag(s, id, '#ff7a2a')
        s.pierce = 99
        s.burn = Math.round(dmg * 0.35)
        s.vx *= 0.55
        s.vz *= 0.55
        s.life = 1.6
        // Wide and low: it takes whatever stands in its lane.
        s.radius = 0.85
        // The cannon belches it out: a fan of flames at the muzzle, a roar.
        const r = Math.random
        for (let n = 0; n < 14; n++) {
          const a = (r() - 0.5) * 0.9
          const ca = Math.cos(a)
          const sa = Math.sin(a)
          const fx = dx * ca - dz * sa
          const fz = dz * ca + dx * sa
          const v = 5 + r() * 6
          h.fx.emit({ x: mx + fx * 0.3, y: my - 0.1 + (r() - 0.5) * 0.2, z: mz + fz * 0.3, vx: fx * v, vy: 0.6 + r() * 1.8, vz: fz * v, color: r() < 0.3 ? '#fff27a' : r() < 0.65 ? '#ffa23a' : '#ff5a1f', size: 0.6 + r() * 0.5, sizeEnd: 0.05, life: 0.35 + r() * 0.2, drag: 2.5 })
        }
        h.sfx('flameJet')
        break
      }
      case 'iceLance': {
        const s = sys.spawnPlayerShot('charge2', mx, my, mz, dx, dy, dz, dmg, false, tgt)
        this.tag(s, id, '#8ff2ff')
        s.pierce = 99
        s.freeze = FREEZE_T + (r - 1) * 0.5
        s.vx *= 1.4
        s.vy *= 1.4
        s.vz *= 1.4
        h.sfx('chargeShot')
        break
      }
      case 'thunderArc': {
        const first = tgt ?? this.nearestInFront()
        if (!first) {
          h.combat.we += cost
          this.cooldown[i] = 0
          return 'none'
        }
        const hitList: Enemy[] = [first]
        let last = first
        for (let k = 0; k < 2 + (r >= 3 ? 1 : 0); k++) {
          const next = h.enemies
            .filter(e => e.state !== 'dead' && !hitList.includes(e) && Math.hypot(e.x - last.x, e.z - last.z) < 7)
            .sort((a, b) => Math.hypot(a.x - last.x, a.z - last.z) - Math.hypot(b.x - last.x, b.z - last.z))[0]
          if (!next) break
          hitList.push(next)
          last = next
        }
        let ax = mx
        let ay = my
        let az = mz
        for (const e of hitList) {
          const ey = e.y + (e.floor ?? 0) + e.def.aimY
          this.bolt(ax, ay, az, e.x, ey, e.z)
          e.lastWeapon = id
          sys.damageEnemy(e, dmg, { crit: false, charge: 1, fromX: h.player.x, fromZ: h.player.z, x: e.x, y: ey, z: e.z, color: '#fff27a', element: 'volt', special: true, weapon: id })
          ax = e.x
          ay = ey
          az = e.z
        }
        h.shake(0.12)
        h.sfx('crit')
        break
      }
      case 'magnetPull': {
        // A slow horseshoe that homes hard on its mark (the aimed one, else
        // the nearest in front).
        const home = tgt ?? this.nearestInFront()
        const s = sys.spawnPlayerShot('charge1', mx, my, mz, dx, dy, dz, dmg, false, home)
        this.tag(s, id, WEAPONS.magnetPull.color)
        s.vx *= 0.8
        s.vy *= 0.8
        s.vz *= 0.8
        s.life = 1.8
        h.sfx('chargeShot')
        break
      }
      case 'drillBomb': {
        // It bores straight on, slower than a shot, spinning; it bursts
        // where it stops (`CombatSystem.kill`), or at the end of its fuse.
        const s = sys.spawnPlayerShot('charge2', mx, my, mz, dx, dy, dz, dmg, false, null)
        this.tag(s, id, '#ffb12a')
        s.vx *= 0.7
        s.vy *= 0.7
        s.vz *= 0.7
        s.life = 1.3
        h.sfx('lob')
        break
      }
      case 'bubbleLance': {
        // A big bubble rolling along the floor, through every machine.
        const s = sys.spawnPlayerShot('charge2', h.player.x + dx * 0.8, (h.player.y ?? 0) + 0.7, h.player.z + dz * 0.8, dx, 0, dz, dmg, false, null)
        this.tag(s, id, '#5fd2ff')
        s.pierce = 99
        s.vx *= 0.6
        s.vz *= 0.6
        s.life = 1.8
        h.sfx('chargeShot')
        break
      }
      case 'neonBlade': {
        // Thrown like a boomerang: out, then back (`CombatSystem`, BLADE_TURN).
        const s = sys.spawnPlayerShot('charge2', mx, my, mz, dx, dy, dz, dmg, false, null)
        this.tag(s, id, '#ff3fd2')
        s.pierce = 99
        s.vx *= 0.75
        s.vy *= 0.75
        s.vz *= 0.75
        s.life = 0.85
        h.sfx('dash')
        break
      }
      case 'droneSwarm': {
        // Three drones, each after its own machine (nearest first; one
        // machine gets them all if it is alone), fanning out as they go.
        const yaw = Math.atan2(dx, dz)
        const marks = h.enemies
          .filter(e => e.state !== 'dead' && !e.offstage && !e.buried && Math.hypot(e.x - h.player.x, e.z - h.player.z) < 20)
          .sort((a, b) => Math.hypot(a.x - h.player.x, a.z - h.player.z) - Math.hypot(b.x - h.player.x, b.z - h.player.z))
        for (let k = 0; k < 3; k++) {
          const a = yaw + (k - 1) * 0.55
          const home = tgt && k === 1 ? tgt : marks[k] ?? marks[0] ?? tgt
          const s = sys.spawnPlayerShot('charge1', mx, my + 0.2, mz, Math.sin(a), dy + 0.15, Math.cos(a), Math.round(dmg * 0.7), false, home)
          this.tag(s, id, '#b8ff5a')
          s.turn = 5
          s.vx *= 0.7
          s.vy *= 0.7
          s.vz *= 0.7
          s.life = 2.2
        }
        h.sfx('weapon')
        break
      }
      case 'galeGuard': {
        this.guardT = 8
        this.leafHitCd.clear()
        for (const l of this.leaves) l.visible = true
        h.sfx('weapon')
        break
      }
    }
    return 'ok'
  }

  private tag(s: import('./world').Shot, id: WeaponId, color: string): void {
    s.kind = 'special'
    s.weapon = id
    s.element = WEAPONS[id].element
    ;(s.sprite.material as import('three').SpriteMaterial).color.set(color)
    ;(s.core!.material as MeshBasicMaterial).color.set('#ffffff')
    s.color = color
  }

  private nearestInFront(): Enemy | null {
    const h = this.host
    let best: Enemy | null = null
    let bestD = 18
    for (const e of h.enemies) {
      if (e.state === 'dead' || e.offstage || e.buried) continue
      const d = Math.hypot(e.x - h.player.x, e.z - h.player.z)
      const a = Math.atan2(-(e.x - h.player.x), -(e.z - h.player.z))
      let da = a - h.player.yaw
      while (da > Math.PI) da -= Math.PI * 2
      while (da < -Math.PI) da += Math.PI * 2
      if (d < bestD && Math.abs(da) < 0.7 && hasLineOfSight(h.nav, h.player.x, h.player.z, e.x, e.z)) { bestD = d; best = e }
    }
    return best
  }

  private bolt(ax: number, ay: number, az: number, bx: number, by: number, bz: number): void {
    const fx = this.host.fx
    const n = Math.max(6, Math.round(Math.hypot(bx - ax, bz - az) * 3))
    for (let k = 0; k <= n; k++) {
      const t = k / n
      const j = k === 0 || k === n ? 0 : 0.3
      fx.emit({
        x: ax + (bx - ax) * t + (Math.random() - 0.5) * j, y: ay + (by - ay) * t + (Math.random() - 0.5) * j,
        z: az + (bz - az) * t + (Math.random() - 0.5) * j, color: '#fff27a', size: 0.3, sizeEnd: 0.08, life: 0.18
      })
    }
    fx.flash(bx, by, bz, '#fff27a', 1.1, 0.12)
  }

  private throwLeaves(aim: [number, number, number, Enemy | null]): void {
    const h = this.host
    const [dx, , dz, tgt] = aim
    const dmg = Math.round(h.stats.busterDmg * WEAPONS.galeGuard.dmg * h.stats.specialMul * 1.2)
    const yaw = Math.atan2(dx, dz)
    for (let k = 0; k < 4; k++) {
      const a = yaw + (k / 3 - 0.5) * 0.5
      const s = h.system.spawnPlayerShot('charge1', h.player.x + Math.sin(a) * 0.8, (h.player.y ?? 0) + EYE_H - 0.4, h.player.z + Math.cos(a) * 0.8, Math.sin(a), 0, Math.cos(a), dmg, false, tgt)
      this.tag(s, 'galeGuard', '#7fffc8')
      s.pierce = 2
    }
    this.guardT = 0
    for (const l of this.leaves) l.visible = false
    h.sfx('dash')
  }

  update(dt: number): void {
    const h = this.host
    this.cooldown[0] = Math.max(0, this.cooldown[0] - dt)
    this.cooldown[1] = Math.max(0, this.cooldown[1] - dt)
    this.cooldown[2] = Math.max(0, this.cooldown[2] - dt)
    for (const [k, v] of this.leafHitCd) {
      if (v - dt <= 0) this.leafHitCd.delete(k)
      else this.leafHitCd.set(k, v - dt)
    }
    if (this.guardT <= 0) return
    this.guardT -= dt
    if (this.guardT <= 0) {
      for (const l of this.leaves) l.visible = false
      return
    }
    const R = 1.25
    const dmg = Math.round(h.stats.busterDmg * WEAPONS.galeGuard.dmg * h.stats.specialMul * 0.6)
    for (let k = 0; k < this.leaves.length; k++) {
      const a = h.time * 3.2 + (k / this.leaves.length) * Math.PI * 2
      const x = h.player.x + Math.cos(a) * R
      const z = h.player.z + Math.sin(a) * R
      const y = (h.player.y ?? 0) + EYE_H - 0.45 + Math.sin(h.time * 5 + k) * 0.12
      const leaf = this.leaves[k]!
      leaf.position.set(x, y, z)
      leaf.rotation.set(0, -a, Math.sin(h.time * 6 + k) * 0.4)
      if (Math.random() < 0.25) h.fx.emit({ x, y, z, color: '#bffff2', size: 0.25, sizeEnd: 0.03, life: 0.25 })
      // Eat enemy shots
      for (const s of h.system.shots) {
        if (!s.active || s.owner !== 'enemy' || s.kind === 'shell') continue
        if ((s.x - x) ** 2 + (s.z - z) ** 2 < 0.5 && Math.abs(s.y - y) < 0.8) {
          h.fx.sparks(s.x, s.y, s.z, '#bffff2', 6, 4)
          s.active = false
          s.sprite.visible = false
          if (s.core) s.core.visible = false
        }
      }
      // Cut machines
      for (const e of h.enemies) {
        if (e.state === 'dead' || e.offstage || this.leafHitCd.has(e.id)) continue
        if (Math.hypot(e.x - x, e.z - z) < e.def.radius + 0.35 && Math.abs(e.y + (e.floor ?? 0) + e.def.aimY - y) < 1.4) {
          this.leafHitCd.set(e.id, 0.5)
          e.lastWeapon = 'galeGuard'
          h.system.damageEnemy(e, dmg, { crit: false, charge: 0, fromX: h.player.x, fromZ: h.player.z, x, y, z, color: '#7fffc8', element: 'wind', special: true, weapon: 'galeGuard' })
        }
      }
    }
  }

  /** A kill scored with a special weapon trains it. Returns true on rank-up. */
  onKill(id: string): boolean {
    if (!(id in WEAPONS)) return false
    const wid = id as WeaponId
    const before = this.rank(wid)
    this.weaponXp[wid] = (this.weaponXp[wid] ?? 0) + 1
    const after = this.rank(wid)
    if (after > before) {
      pushHud({ t: 'toast', key: 'weapon.rankUp', params: { weapon: `weapon.${wid}.name`, n: after }, color: WEAPONS[wid].color })
      return true
    }
    return false
  }
}
