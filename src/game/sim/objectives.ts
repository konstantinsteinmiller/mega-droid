import { Group, Mesh, MeshBasicMaterial, AdditiveBlending, Color, CylinderGeometry, DoubleSide, type Scene, type Object3D } from 'three'
import type { Quest, QuestTemplate } from '../data/quests'
import type { Enemy, World } from './world'
import type { Theme } from '../world/themes'
import { cellCenter, roomCenter, CELL, type ChestLoot, type MapData, type Room, type Door } from '../world/levelGen'
import { buildChest, buildCrate, buildBarrel, buildDataCore, type ChestMesh, type PropMesh } from '../models/props'
import { buildWorkerBot, animateWorkerBot } from '../models/npc'
import type { Rig } from '../models/kit'
import { mulberry32, shuffle } from '../world/rng'
import { rollRarity, type Rarity } from '../data/items'
import { createEnemy } from './enemies'
import { createBoss } from './bosses'
import { SECTOR_BY_ID } from '../data/regions'
import type { BossId } from '../models/bosses'
import { makeBlobShadow } from '../fx/markers'
import { hasLineOfSight } from '../world/nav'
import { pushHud } from '../state/hud'
import { RARITY_COLOR } from '../models/palette'
import { INTERACT_DIST, INTERACT_NEAR } from './constants'

/**
 * ─── Mission objects & objectives ────────────────────────────────────────────
 *
 * Everything in a sector map that is not a wall or an enemy: supply chests,
 * breakable crates and volatile barrels, data cores, the stranded worker-bot.
 * Their placement is deterministic from the map seed (so a resumed mission
 * rebuilds them and the snapshot only lists what was opened / taken), and
 * this module also owns the mission's objective counter.
 */

export interface Chest {
  id: number
  x: number
  z: number
  /** The floor it stands on: 0 on a flat map, a ledge's height on a terrain
   *  map (`Terrain.chests`). Opened only from that floor (CHEST_DY). */
  y: number
  yaw: number
  mesh: ChestMesh
  opened: boolean
  openT: number
  supply: boolean
  rarity: Rarity
  navIdx: number
  beam: Mesh
  /** An authored prize (`ChestSpot.loot`). */
  loot?: ChestLoot
}

export interface Crate {
  id: number
  x: number
  z: number
  kind: 'crate' | 'barrel'
  mesh: PropMesh
  hp: number
  broken: boolean
  navIdx: number
  hitT: number
  /** The floor it stands on (a stage's ledges; 0 on a flat map). */
  y: number
  /** A boss arena's prop: its own drops (`sim/bossArena.ts`). */
  arena?: boolean
  /** Breaks to any shot, not only a charge (the Scrapper's crane drops them). */
  soft?: boolean
  /** Dropped by the Scrapper's crane: an energy pill, nothing else. */
  crane?: boolean
}

export interface Core {
  id: number
  x: number
  z: number
  mesh: PropMesh
  taken: boolean
}

export interface Npc {
  x: number
  z: number
  rig: Rig
  root: Group
  rescued: boolean
  beamT: number
}

export interface ObjectiveInfo {
  template: QuestTemplate
  count: number
  progress: number
  done: boolean
}

export interface ObjectiveHost extends World {
  scene: Scene
  theme: Theme
  map: MapData
  onChestOpened(c: Chest): void
  /** An authored chest prize this save already took (`ChestSpot.loot`). */
  lootTaken?(key: string): boolean
  onCrateBroken(c: Crate): void
  onCoreTaken(c: Core): void
  onObjectiveDone(): void
  explode(x: number, z: number, r: number, dmg: number): void
  /** A quick shot bounced off a supply crate (they only break to a charge). */
  onCrateDeflect?(c: Crate): void
  /** The node a static prop at (x, z) hangs under: its room's mesh group,
   *  so portal culling hides the prop together with the room. */
  propParent(x: number, z: number): Object3D
}

// ─── The objective's spot (where the floor trail leads) ──────────────────────

/** What `objectiveTarget` reads. A `MissionObjects` is one. */
export interface TargetSource {
  readonly objective: { readonly template: QuestTemplate; readonly done: boolean }
  readonly quest: { readonly target: Enemy['kind'] | null }
  readonly eliteId: number
  readonly cores: ReadonlyArray<{ readonly x: number; readonly z: number; readonly taken: boolean }>
  readonly chests: ReadonlyArray<{ readonly x: number; readonly z: number; readonly supply: boolean; readonly opened: boolean }>
  readonly npc: { readonly x: number; readonly z: number; readonly rescued: boolean } | null
}

/** The enemy fields the target rules read. */
export type TargetEnemy = Pick<Enemy, 'id' | 'kind' | 'state' | 'x' | 'z' | 'hold'>

/** The trail ends this far in front of the boss shutter (m): on the corridor
 *  side, clear of the panel and inside the interact reach. */
export const BOSS_DOOR_STANDOFF = 1
/** Another candidate must be 15 % nearer than the current pick to take over
 *  (compared squared), so a near-tie cannot flip the trail as the player walks. */
const TARGET_STICKY = 0.85 * 0.85
/** A chest answers only to a player standing within this of its floor (m):
 *  on a terrain map the one on the ledge overhead is not in reach. */
export const CHEST_DY = 1.2
/** How far a crate turned `a` from its wall reaches toward it (m): its box
 *  and the corner bumpers (`models/props.ts` buildCrate), and a barrel's. */
const crateReach = (a: number): number => {
  const k = Math.abs(Math.cos(a)) + Math.abs(Math.sin(a))
  return Math.max(0.575 * k, 0.483 * k + 0.2)
}
const BARREL_REACH = 0.53
/** A data core hangs at least this far from a chest or a crate (m). */
const CORE_CLEAR = 1.6
/** A crate keeps this much air from the wall behind it (m). */
const WALL_KEEP = 0.04
/** A lesson's sleeping drones only count once no real machine is left. */
const HELD_PENALTY = 1e9

// Scratch: the one live answer, and the pick it came from (for the stickiness).
const _target = { x: 0, z: 0 }
let _src: TargetSource | null = null
let _prev: object | null = null
let _pick: object | null = null
let _pickD = 0

const consider = (ref: object, x: number, z: number, px: number, pz: number, prev: object | null, penalty = 0): void => {
  let d = (x - px) * (x - px) + (z - pz) * (z - pz)
  if (ref === prev) d *= TARGET_STICKY
  d += penalty
  if (d >= _pickD) return
  _pickD = d
  _pick = ref
  _target.x = x
  _target.z = z
}

const livingElite = (src: TargetSource, enemies: readonly TargetEnemy[]): { x: number; z: number } | null => {
  for (const e of enemies) {
    if (e.id !== src.eliteId) continue
    if (e.state === 'dead') return null
    _target.x = e.x
    _target.z = e.z
    return _target
  }
  return null
}

/** The boss shutter, or null on a map without a boss room. */
const bossDoorOf = (map: MapData): Door | null => {
  for (const d of map.doors) if (d.boss) return d
  return null
}

/**
 * Where the objective is from (px, pz), or null when there is nothing to walk
 * to (see `MissionObjects.target`). Returns a shared scratch object, valid
 * until the next call.
 */
export const objectiveTarget = (
  src: TargetSource, map: MapData, enemies: readonly TargetEnemy[], px: number, pz: number
): { x: number; z: number } | null => {
  const prev = src === _src ? _prev : null
  _src = src
  _prev = null
  _pick = null
  _pickD = Infinity
  if (src.objective.done) return null
  switch (src.objective.template) {
    case 'tutorial':
    case 'boss':
    case 'climb':
    case 'stage': {
      const d = bossDoorOf(map)
      // A map that could not fit a boss room keeps its Core Master in the objective room.
      if (!d) return livingElite(src, enemies)
      // The fight starts as the player crosses into the boss room.
      const i = Math.floor(px / CELL)
      const j = Math.floor(pz / CELL)
      if (i >= 0 && j >= 0 && i < map.w && j < map.h && map.room[j * map.w + i] === d.to) return null
      const off = CELL / 2 - BOSS_DOOR_STANDOFF
      _target.x = cellCenter(d.i) + (d.axis === 'x' ? d.dir * off : 0)
      _target.z = cellCenter(d.j) + (d.axis === 'z' ? d.dir * off : 0)
      return _target
    }
    case 'elite':
      return livingElite(src, enemies)
    case 'kill':
      for (const e of enemies) {
        if (e.kind === src.quest.target && e.state !== 'dead') consider(e, e.x, e.z, px, pz, prev, e.hold ? HELD_PENALTY : 0)
      }
      break
    case 'purge':
      for (const e of enemies) {
        if (e.state !== 'dead') consider(e, e.x, e.z, px, pz, prev, e.hold ? HELD_PENALTY : 0)
      }
      break
    case 'collect':
      for (const c of src.cores) if (!c.taken) consider(c, c.x, c.z, px, pz, prev)
      break
    case 'supply':
      for (const c of src.chests) if (c.supply && !c.opened) consider(c, c.x, c.z, px, pz, prev)
      break
    case 'rescue': {
      const n = src.npc
      if (!n || n.rescued) return null
      _target.x = n.x
      _target.z = n.z
      return _target
    }
  }
  _prev = _pick
  return _pick ? _target : null
}

export class MissionObjects {
  chests: Chest[] = []
  crates: Crate[] = []
  cores: Core[] = []
  npc: Npc | null = null
  objective: ObjectiveInfo
  quest: Quest
  /** Enemy id of the elite target / boss (elite + boss jobs). */
  eliteId = -1
  /** A purge's machines: the sector's whole cast as spawned (`setupEnemyObjectives`). */
  private purgeTargets: Enemy[] = []
  private host: ObjectiveHost
  readonly root = new Group()

  constructor(host: ObjectiveHost, quest: Quest) {
    this.host = host
    this.quest = quest
    host.scene.add(this.root)
    this.objective = { template: quest.template, count: quest.count, progress: 0, done: false }
    this.place()
  }

  private addChest(room: Room | null, spot: [number, number, number], supply: boolean, rarity: Rarity): void {
    this.addChestAt(cellCenter(spot[0]), 0, cellCenter(spot[1]), spot[2], supply, rarity)
    void room
  }

  /** A chest on the cell centred at (x, z), its floor at `y`, backed onto
   *  the wall `yaw` faces (`Room.wallSpots`' convention). */
  private addChestAt(x: number, y: number, z: number, yaw: number, supply: boolean, rarity: Rarity, loot?: ChestLoot): void {
    const h = this.host
    const mesh = buildChest(h.theme, rarity)
    // Push toward the wall it stands against so it does not block the room.
    const off = 0.55
    const cx = x - Math.sin(yaw) * off
    const cz = z - Math.cos(yaw) * off
    mesh.root.position.set(cx, y, cz)
    mesh.root.rotation.y = yaw
    const parent = h.propParent(cx, cz)
    parent.add(mesh.root)
    const navIdx = h.nav.props.length
    h.nav.props.push({ x: cx, z: cz, r: 0.8, active: true })
    const beam = new Mesh(
      new CylinderGeometry(0.35, 0.6, 5, 16, 1, true),
      new MeshBasicMaterial({ color: new Color(RARITY_COLOR[rarity]), transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false })
    )
    beam.position.set(cx, y + 2.5, cz)
    beam.visible = false
    parent.add(beam)
    this.chests.push({ id: this.chests.length, x: cx, y, z: cz, yaw, mesh, opened: false, openT: 0, supply, rarity, navIdx, beam, ...(loot ? { loot } : {}) })
  }

  private place(): void {
    const h = this.host
    const map = h.map
    const rng = mulberry32(map.seed ^ 0xc4e57)
    const q = this.quest
    const rooms = map.rooms
    // Nothing of the job's in a challenge room: it is off the route.
    const byDepthDesc = [...rooms].filter(r => r.role !== 'start' && r.role !== 'boss' && r.role !== 'challenge').sort((a, b) => b.depth - a.depth)
    const wallCursor = new Map<number, number>()
    const takeWall = (r: Room): [number, number, number] | null => {
      const i = wallCursor.get(r.id) ?? 0
      wallCursor.set(r.id, i + 1)
      return r.wallSpots[r.wallSpots.length - 1 - i] ?? null
    }
    const spotCursor = new Map<number, number>()
    const takeSpot = (r: Room): [number, number] | null => {
      // Take from the END of the shuffled list so enemy spawns (front) and
      // objects rarely share a cell.
      const i = spotCursor.get(r.id) ?? 0
      spotCursor.set(r.id, i + 1)
      return r.spots[r.spots.length - 1 - i] ?? null
    }

    // Treasure rooms: one chest each; combat rooms: occasional bonus chest.
    for (const r of rooms) {
      if (r.role === 'treasure' || (r.role === 'combat' && rng() < 0.22)) {
        const spot = takeWall(r)
        if (spot) this.addChest(r, spot, false, rollRarity(rng, r.role === 'treasure' ? 0.6 : 0))
      }
    }
    // Supply jobs: N supply chests in the deepest rooms.
    if (q.template === 'supply') {
      let placed = 0
      for (const r of [...byDepthDesc, ...byDepthDesc]) {
        if (placed >= q.count) break
        const spot = takeWall(r)
        if (spot) {
          this.addChest(r, spot, true, rollRarity(rng, 0.3))
          placed++
        }
      }
      this.objective.count = placed
    }
    // Crates & barrels along walls in combat rooms.
    for (const r of rooms) {
      if (r.role === 'start' || r.role === 'boss' || r.role === 'challenge') continue
      const n = Math.min(3, Math.floor(rng() * 3) + (r.w * r.h > 20 ? 1 : 0))
      for (let k = 0; k < n; k++) {
        const spot = takeWall(r)
        if (!spot) break
        const barrel = rng() < 0.3
        let x = cellCenter(spot[0]) - Math.sin(spot[2]) * 0.7 + (rng() - 0.5) * 0.8
        let z = cellCenter(spot[1]) - Math.cos(spot[2]) * 0.7 + (rng() - 0.5) * 0.8
        const yaw = rng() * Math.PI * 2
        // Against the wall, never into it: its turned body's reach toward
        // the wall stays inside the cell (a jitter pushed crates 0.4 m into
        // the walls, playtest 2026-10-12).
        const wx = -Math.sin(spot[2])
        const wz = -Math.cos(spot[2])
        const reach = barrel ? BARREL_REACH : crateReach(yaw - spot[2])
        const over = (x - cellCenter(spot[0])) * wx + (z - cellCenter(spot[1])) * wz - (CELL / 2 - WALL_KEEP - reach)
        if (over > 0) { x -= wx * over; z -= wz * over }
        this.addCrate(x, z, yaw, barrel ? 'barrel' : 'crate')
      }
    }
    // Collect jobs: data cores, one per room from the deepest outward.
    if (q.template === 'collect') {
      let placed = 0
      for (const r of shuffle(rng, [...byDepthDesc])) {
        if (placed >= q.count) break
        // A spot clear of the room's chests and crates (a core hung inside a chest).
        const clear = (c: [number, number]) => ![...this.chests, ...this.crates].some(o => Math.hypot(o.x - cellCenter(c[0]), o.z - cellCenter(c[1])) < CORE_CLEAR)
        let sp = takeSpot(r)
        while (sp && !clear(sp)) sp = takeSpot(r)
        if (!sp) continue
        const mesh = buildDataCore()
        const x = cellCenter(sp[0])
        const z = cellCenter(sp[1])
        mesh.root.position.set(x, 1.1, z)
        h.propParent(x, z).add(mesh.root, (() => { const s = makeBlobShadow(0.35); s.position.set(x, 0.02, z); return s })())
        this.cores.push({ id: this.cores.length, x, z, mesh, taken: false })
        placed++
      }
      this.objective.count = placed
    }
    // Rescue jobs: the worker-bot waits in the objective room.
    if (q.template === 'rescue') {
      const r = rooms.find(x => x.role === 'objective') ?? byDepthDesc[0]!
      const [cx, cz] = roomCenter(r)
      const rig = buildWorkerBot()
      const root = new Group()
      root.add(rig.root)
      root.position.set(cx, 0, cz)
      this.root.add(root, (() => { const s = makeBlobShadow(0.45); s.position.set(cx, 0.02, cz); return s })())
      this.npc = { x: cx, z: cz, rig, root, rescued: false, beamT: 0 }
      h.nav.props.push({ x: cx, z: cz, r: 0.5, active: true })
      this.objective.count = 1
    }
    // A terrain map's own chests (`Terrain.chests`: a level's author put
    // them on its ledges), last: the rolls above stay the seed's.
    for (const c of map.terrain?.chests ?? []) {
      const roll = rollRarity(rng, 0.3) // always drawn: the rolls after stay the seed's
      // Its prize once per save; after that a plain chest, a notch down.
      const loot = c.loot && !this.host.lootTaken?.(c.loot.key) ? c.loot : undefined
      const rarity = loot ? loot.rarity : c.loot ? (c.loot.rarity === 'legendary' ? 'prototype' : c.loot.rarity) : roll
      this.addChestAt(c.x, c.y, c.z, c.yaw, false, rarity, loot)
    }
  }

  /** Called once enemies exist: attach elite / kill / purge targets. */
  setupEnemyObjectives(enemies: Enemy[], addEnemy: (e: Enemy) => void): void {
    const h = this.host
    const q = this.quest
    const rng = mulberry32(h.map.seed ^ 0x0b1e)
    if (q.template === 'tutorial' || q.template === 'boss' || q.template === 'climb' || q.template === 'stage') {
      // The sector's Core Master waits behind the boss shutter (a climb's:
      // at the foot of its tower, for the rematch).
      const room = h.map.rooms.find(r => r.role === 'boss') ?? h.map.rooms.find(r => r.role === 'objective')!
      const [cx, cz] = roomCenter(room)
      const boss = createBoss(SECTOR_BY_ID[q.sector].boss as BossId, q.level + (q.template === 'tutorial' ? 0 : 1), cx, cz, room.id)
      addEnemy(boss)
      this.eliteId = boss.id
      this.objective.count = 1
    }
    if (q.template === 'elite') {
      const room = h.map.rooms.find(r => r.role === 'objective') ?? h.map.rooms[h.map.rooms.length - 1]!
      const [cx, cz] = roomCenter(room)
      const kind = q.target ?? 'brute'
      const e = createEnemy(kind, q.level + 1, cx, cz, room.id, { elite: true })
      addEnemy(e)
      this.eliteId = e.id
      this.objective.count = 1
    }
    if (q.template === 'kill' && q.target) {
      // Guarantee enough of the target kind: top up in random rooms.
      const have = enemies.filter(e => e.kind === q.target).length
      const need = Math.max(0, q.count + 1 - have)
      const rooms = h.map.rooms.filter(r => r.role === 'combat' || r.role === 'objective')
      for (let k = 0; k < need && rooms.length; k++) {
        const r = rooms[Math.floor(rng() * rooms.length)]!
        const sp = r.spots[Math.floor(rng() * r.spots.length)]
        if (!sp) continue
        addEnemy(createEnemy(q.target, q.level, cellCenter(sp[0]), cellCenter(sp[1]), r.id, { element: 'none' }))
      }
    }
    if (q.template === 'purge') {
      this.purgeTargets = enemies.slice()
      this.objective.count = enemies.length
    }
  }

  // ─── Per-step ──────────────────────────────────────────────────────────────

  update(dt: number, time: number): void {
    const h = this.host
    this.syncPurge()
    for (const c of this.chests) {
      if (!c.opened) {
        // Idle shimmer on the lock lamp
        c.mesh.lampMat.color.setScalar(0.75 + Math.sin(time * 4 + c.id) * 0.25).multiply(new Color(RARITY_COLOR[c.rarity]))
        continue
      }
      if (c.openT < 1) {
        c.openT = Math.min(1, c.openT + dt * 2.2)
        const e = 1 - Math.pow(1 - c.openT, 3)
        c.mesh.lid.rotation.x = -e * 1.9
        c.beam.visible = true
        ;(c.beam.material as MeshBasicMaterial).opacity = Math.sin(c.openT * Math.PI) * 0.55
        c.beam.scale.set(1, 0.3 + e, 1)
      } else if (c.beam.visible) {
        c.beam.visible = false
      }
    }
    for (const c of this.crates) {
      if (c.broken) continue
      c.hitT = Math.max(0, c.hitT - dt * 6)
      c.mesh.root.scale.setScalar(1 + c.hitT * 0.08)
    }
    for (const core of this.cores) {
      if (core.taken) continue
      core.mesh.root.rotation.y += dt * 1.6
      core.mesh.root.position.y = 1.1 + Math.sin(time * 2 + core.id) * 0.12
      if (Math.hypot(h.player.x - core.x, h.player.z - core.z) < 1.2) {
        core.taken = true
        core.mesh.root.visible = false
        h.fx.riseRing(core.x, 0.5, core.z, '#8dff7a', 0.6, 14)
        h.fx.flash(core.x, 1.1, core.z, '#8dff7a', 1.2, 0.2)
        this.progress(1)
        h.onCoreTaken(core)
      }
    }
    if (this.npc) {
      const n = this.npc
      animateWorkerBot(n.rig, time, !n.rescued)
      if (n.rescued && n.beamT < 1) {
        n.beamT = Math.min(1, n.beamT + dt * 1.2)
        n.root.scale.set(1 - n.beamT * 0.8, 1 + n.beamT * 2, 1 - n.beamT * 0.8)
        n.root.position.y = n.beamT * 2
        if (n.beamT >= 1) n.root.visible = false
      } else if (!n.rescued) {
        n.root.rotation.y = Math.atan2(h.player.x - n.x, h.player.z - n.z)
      }
    }
  }

  progress(n: number): void {
    if (this.objective.done) return
    this.objective.progress = Math.min(this.objective.count, this.objective.progress + n)
    if (this.objective.progress >= this.objective.count) {
      this.objective.done = true
      this.host.onObjectiveDone()
    }
  }

  /**
   * A purge counts its dead machines rather than its kill reports (#149): a
   * puffer that popped itself, a golem woken and broken in one blow, a
   * resumed run — every way a target ends dead counts once, and a machine
   * brought in later (a stand-in, a challenge's mini-boss) not at all.
   */
  private syncPurge(): void {
    if (this.quest.template !== 'purge' || !this.purgeTargets.length) return
    let dead = 0
    for (const e of this.purgeTargets) if (e.state === 'dead') dead++
    if (dead > this.objective.progress) this.progress(dead - this.objective.progress)
  }

  onEnemyKilled(e: Enemy): void {
    const q = this.quest
    if (q.template === 'kill' && e.kind === q.target) this.progress(1)
    else if (q.template === 'purge') this.syncPurge()
    else if ((q.template === 'elite' || q.template === 'tutorial' || q.template === 'boss' || q.template === 'climb' || q.template === 'stage') && e.id === this.eliteId) this.progress(1)
  }

  // ─── Interaction ───────────────────────────────────────────────────────────

  /**
   * The nearest thing the player can interact with right now: an unopened
   * chest or the stranded worker-bot within `INTERACT_DIST` and in sight —
   * taken on trust up close (`INTERACT_NEAR`), where only a false "no" can
   * come of the grid test. The bot wins a near-tie with a chest. No facing
   * rule: the prompt must not flicker as the view turns, and a tap walks the
   * player up without turning them. The E key, the prompt button and a tap
   * on the object (`Mission.doInteract`) all act on this answer.
   */
  nearestInteractable(px: number, pz: number, yaw: number, py = 0): { kind: 'chest' | 'npc'; ref: Chest | Npc } | null {
    const nav = this.host.nav
    let best: { kind: 'chest' | 'npc'; ref: Chest | Npc } | null = null
    let bestD = INTERACT_DIST
    for (const c of this.chests) {
      if (c.opened || Math.abs(c.y - py) >= CHEST_DY) continue
      const d = Math.hypot(c.x - px, c.z - pz)
      if (d < bestD && (d < INTERACT_NEAR || hasLineOfSight(nav, px, pz, c.x, c.z))) { bestD = d; best = { kind: 'chest', ref: c } }
    }
    const n = this.npc
    if (n && !n.rescued) {
      const d = Math.hypot(n.x - px, n.z - pz)
      if (d < bestD + 0.4 && (d < INTERACT_NEAR || hasLineOfSight(nav, px, pz, n.x, n.z))) best = { kind: 'npc', ref: n }
    }
    void yaw
    return best
  }

  /**
   * Where the objective trail (`fx/objectiveTrail.ts`) leads from (px, pz):
   * the boss shutter until the Core Master's fight starts, the elite, the
   * nearest machine that counts, data core or supply chest, the worker-bot.
   * Null once the objective is done or there is nothing to walk to. A shared
   * scratch object (no per-step allocation), valid until the next call.
   */
  target(px: number, pz: number, enemies: readonly Enemy[]): { x: number; z: number } | null {
    return objectiveTarget(this, this.host.map, enemies, px, pz)
  }

  openChest(c: Chest): void {
    if (c.opened) return
    c.opened = true
    c.openT = 0
    // An opened chest stays a solid thing: Flux walks around it and shots
    // stop on it (its loot still flies to him on the pickup magnet).
    this.host.fx.riseRing(c.x, c.y + 0.4, c.z, RARITY_COLOR[c.rarity], 0.9, 18)
    this.host.fx.sparks(c.x, c.y + 0.9, c.z, RARITY_COLOR[c.rarity], 16, 5)
    if (c.supply) this.progress(1)
    this.host.onChestOpened(c)
  }

  rescue(n: Npc): void {
    if (n.rescued) return
    n.rescued = true
    n.beamT = 0
    this.host.nav.props.forEach(p => { if (p.x === n.x && p.z === n.z) p.active = false })
    this.host.fx.riseRing(n.x, 0.2, n.z, '#7ff4ff', 0.7, 20)
    pushHud({ t: 'toast', key: 'mission.rescued', color: '#7fffc8' })
    this.progress(1)
  }

  /** A crate or an energy barrel on the floor (build time, or a lesson's). */
  addCrate(x: number, z: number, yaw: number, kind: 'crate' | 'barrel' = 'crate', y = 0): Crate {
    const h = this.host
    const barrel = kind === 'barrel'
    const mesh = barrel ? buildBarrel(h.theme) : buildCrate(h.theme)
    mesh.root.position.set(x, y, z)
    mesh.root.rotation.y = yaw
    h.propParent(x, z).add(mesh.root)
    const navIdx = h.nav.props.length
    h.nav.props.push({ x, z, r: barrel ? 0.5 : 0.62, active: true })
    const c: Crate = { id: this.crates.length, x, z, kind, mesh, hp: barrel ? 1 : 12, broken: false, navIdx, hitT: 0, y }
    this.crates.push(c)
    return c
  }

  /**
   * A player shot hit something? Returns true if it struck a crate/barrel.
   * Supply crates are reinforced: a quick shot (`charge` 0) bounces off with
   * a tink, and only a charged shot, a copied weapon or a blast breaks one —
   * the charge shot's second use, taught by its own lesson. Barrels are
   * volatile and pop to anything.
   */
  shotHitsCrate(x: number, y: number, z: number, r: number, dmg: number, charge = 1): boolean {
    for (const c of this.crates) {
      if (c.broken) continue
      const top = c.kind === 'barrel' ? 1.3 : 1.15
      if (y > c.y + top + r || y < c.y - r) continue
      if (Math.hypot(c.x - x, c.z - z) > (c.kind === 'barrel' ? 0.5 : 0.62) + r) continue
      // Crates stand against walls: a shot on the far side stops on the wall
      if (!hasLineOfSight(this.host.nav, x, z, c.x, c.z)) continue
      if (c.kind === 'crate' && charge <= 0 && !c.soft) {
        const h = this.host
        c.hitT = 0.45
        h.fx.sparks(x, y, z, '#ffffff', 6, 4, 0.14)
        pushHud({ t: 'text', x, y: y + 0.3, z, key: 'combat.tink', color: '#dfe7ff' })
        h.sfx('tink', c.x, c.z)
        h.onCrateDeflect?.(c)
        return true
      }
      c.hp -= dmg
      c.hitT = 1
      if (c.hp <= 0) this.breakCrate(c)
      return true
    }
    return false
  }

  /** A shot hit a chest, open or shut? It stops there (sparks), and a shut
   *  one opens: any hit by Flux does it, a pellet, a charged shot or a copied
   *  weapon (a playtest note: players shot chests and nothing happened). */
  shotHitsChest(x: number, y: number, z: number, r: number): boolean {
    for (const c of this.chests) {
      if (y > c.y + 1.05 + r || y < c.y - r) continue
      if (Math.hypot(c.x - x, c.z - z) > this.host.nav.props[c.navIdx]!.r + r) continue
      if (!hasLineOfSight(this.host.nav, x, z, c.x, c.z)) continue
      if (!c.opened) this.openChest(c)
      return true
    }
    return false
  }

  breakCrate(c: Crate): void {
    if (c.broken) return
    const h = this.host
    c.broken = true
    c.mesh.root.visible = false
    h.nav.props[c.navIdx]!.active = false
    if (c.kind === 'barrel') {
      h.fx.orbBurst(c.x, 0.7, c.z, '#ffb04a', 1.2)
      h.shocks.spawn(c.x, 0.05, c.z, 3.2, '#ff8a3a', 0.4)
      h.shake(0.35)
      h.sfx('explode', c.x, c.z)
      h.explode(c.x, c.z, 3.2, 40)
    } else {
      h.fx.sparks(c.x, 0.6, c.z, h.theme.crate, 14, 5, 0.22)
      h.fx.emit({ x: c.x, y: 0.6, z: c.z, color: '#ffffff', size: 1.1, sizeEnd: 1.8, life: 0.18 })
      h.sfx('bonk', c.x, c.z)
    }
    h.onCrateBroken(c)
  }

  /** Items shown on the compass: remaining objective locations. */
  compassTargets(enemies: Enemy[]): Array<{ x: number; z: number; kind: 'objective' | 'chest' | 'boss' }> {
    const out: Array<{ x: number; z: number; kind: 'objective' | 'chest' | 'boss' }> = []
    const q = this.quest
    if (this.objective.done) return out
    if (q.template === 'collect') for (const c of this.cores) { if (!c.taken) out.push({ x: c.x, z: c.z, kind: 'objective' }) }
    if (q.template === 'supply') for (const c of this.chests) { if (c.supply && !c.opened) out.push({ x: c.x, z: c.z, kind: 'objective' }) }
    if (q.template === 'rescue' && this.npc && !this.npc.rescued) out.push({ x: this.npc.x, z: this.npc.z, kind: 'objective' })
    if (q.template === 'elite' || q.template === 'tutorial' || q.template === 'boss' || q.template === 'climb' || q.template === 'stage') {
      const e = enemies.find(x => x.id === this.eliteId && x.state !== 'dead')
      if (e) out.push({ x: e.x, z: e.z, kind: q.template === 'elite' ? 'objective' : 'boss' })
    }
    if (q.template === 'kill') for (const e of enemies) { if (e.kind === q.target && e.state !== 'dead') out.push({ x: e.x, z: e.z, kind: 'objective' }) }
    if (q.template === 'purge') {
      // A sleeping crate golem passes for a crate: the compass only gives it
      // away once it is the last machine standing (as the floor trail does).
      const awake = enemies.some(e => e.state !== 'dead' && !e.dormant)
      for (const e of enemies) { if (e.state !== 'dead' && (!e.dormant || !awake)) out.push({ x: e.x, z: e.z, kind: 'objective' }) }
    }
    return out
  }

  /**
   * A chest for a scripted scene (the tutorial walkthrough's chest room): on
   * a free wall spot of `room` in sight of (fromX, fromZ) — the doorway — and
   * as far from it as the room allows, so it is the first thing seen on the
   * way in. Deterministic, so a resumed mission rebuilds it under the same id.
   */
  placeChest(room: Room, fromX: number, fromZ: number, rarity: Rarity = 'tuned'): Chest | null {
    const h = this.host
    let best: [number, number, number] | null = null
    let bestD = -1
    for (const spot of room.wallSpots) {
      const x = cellCenter(spot[0])
      const z = cellCenter(spot[1])
      if (this.crates.some(c => Math.hypot(c.x - x, c.z - z) < 1.8)) continue
      if (this.chests.some(c => Math.hypot(c.x - x, c.z - z) < 1.8)) continue
      if (!hasLineOfSight(h.nav, fromX, fromZ, x, z)) continue
      const d = Math.hypot(x - fromX, z - fromZ)
      if (d > bestD) {
        best = spot
        bestD = d
      }
    }
    if (!best) return null
    this.addChest(room, best, false, rarity)
    return this.chests[this.chests.length - 1]!
  }
}
