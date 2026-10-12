import type { MapData, Room } from '../world/levelGen'
import { CELL, DIRS4, cellCenter, roomCenter } from '../world/levelGen'
import { mulberry32, shuffle, type Rng } from '../world/rng'
import { WEAPONS, WEAPON_IDS, type WeaponId } from '../data/weapons'
import { hud, pushHud } from '../state/hud'
import { profile, markTip } from '../state/profile'
import type { WeaponCapsuleMesh } from '../models/weaponCapsule'
import { CAPSULE_HOVER } from '../models/weaponCapsule'

/**
 * ─── Borrowed weapons: a Core Master's power, for one mission ────────────────
 *
 * In the TV show Mega Man took an android's skill for a while after a fight.
 * Here a mission can leave a capsule on a pedestal (`models/weaponCapsule.ts`):
 * walk into it and Flux carries one of the copied weapons — preferably one he
 * has NOT won yet, a taste of a Core Master still ahead — on a third button
 * (key 3) for a few shots:
 *
 *   - It fires through the real `WeaponSystem`, so it looks, hits, pierces,
 *     freezes and exploits a boss's weakness exactly like the won weapon, at
 *     the rank Flux has for it (rank 1 when he has never owned it).
 *   - It costs NO Weapon Energy. Every shot spends one charge instead
 *     (`LENT_SHOTS`, fewer for the costly verbs); at 0 it pops and is gone.
 *     Gale Guard's charge is the cast; hurling the leaves is part of it.
 *   - It never enters `profile.hero.weapons` or the slots and never outlives
 *     the mission. A resumed mission keeps the charges left and which
 *     capsules are taken (the mission snapshot, `save`/`restore`).
 *   - Kills with a weapon Flux does not own train nothing (the mission skips
 *     the weapon XP), so a borrowed power never ranks up a weapon that is
 *     not his yet. The fallback of lending one he owns trains it as usual:
 *     it is his weapon either way.
 *   - Another capsule of the SAME weapon tops the charges back up (a full
 *     slot walks past it and leaves it for later); a different weapon
 *     replaces the borrowed one. Placement lends one weapon per mission, so
 *     in practice a second capsule is a refill and never a trap that throws
 *     away charges the player was saving.
 *
 * Where: the climb's harder reward ledge (the crusher bridge's alcove, named
 * `kind: 'weapon'` by `world/climbGen.ts`) holds one as its prize; a regular
 * story or job map has a 35 % chance of one in a treasure room (else a side
 * room off the main path). Never in the tutorial.
 * All from the map seed on a stream of its own, so the map, its spawns and
 * every other seeded draw stay exactly as they were.
 *
 * The first time a profile takes one, a wordless teach: the button pulses
 * with its key (3) or a tapping finger until it is fired once
 * (`ActionButtons.vue`). It waits while a scene lesson is on, and keeps its
 * card off a fight; the pulse is on the button itself, so no survival glyph
 * is ever covered.
 */

/** The capsule stream's salt (xor'd into the map seed). */
export const CAPSULE_SALT = 0x2b0e77a1
/** A regular map's chance of a capsule. */
export const CAPSULE_CHANCE = 0.35
/** Charges per capsule: the cheap spread gets the most, the costly verbs fewer
 *  (they are the same shots the Weapon Energy bar would pay 4–6 for). */
export const LENT_SHOTS: Record<WeaponId, number> = {
  scrapBurst: 10, flameWave: 8, iceLance: 8, thunderArc: 6, galeGuard: 6, magnetPull: 8, drillBomb: 6, bubbleLance: 8, neonBlade: 8, droneSwarm: 6
}
/** The first-take teach, once per profile (`profile.tips`). */
export const TEACH_TIP = 'lesson:borrowed'
/** How close Flux must come to take a capsule (plan view / height, m). */
export const PICK_R = 1.05
export const PICK_DY = 1.3
/** A climb capsule stands this far off its ledge's own prize along each
 *  axis, inside the ledge's cell: its plate (0.5 m) clear of the prize's pad
 *  (0.7 m) — at 0.8 m straight back the two plates lay in one another — and
 *  of the cell's walls. */
const LEDGE_OFFSET = 0.92

export interface CapsuleSpot {
  x: number
  z: number
  /** Floor height (0 on a labyrinth map, the ledge's on the climb). */
  y: number
  room: number
  weapon: WeaponId
}

/** A reward ledge of the climb (`Terrain.rewards`, `world/climbGen.ts`). */
export interface LedgeSpot {
  x: number
  z: number
  y: number
  room: number
  /** `weapon`: the ledge whose prize is a borrowed-weapon capsule. */
  kind?: string
}

export interface BorrowedSave {
  /** The weapon carried ('' = none) and its charges left. */
  w: string
  shots: number
  /** Capsules already taken, by index. */
  got: number[]
}

// ─── Placement (pure) ────────────────────────────────────────────────────────

/** Rooms on the way from the start to the goal (the objective room and the
 *  boss room, up their parents to the root). */
export const mainPathRooms = (map: MapData): Set<number> => {
  const on = new Set<number>()
  for (const r of map.rooms) {
    if (r.role !== 'objective' && r.role !== 'boss') continue
    let cur: Room | undefined = r
    while (cur && !on.has(cur.id)) {
      on.add(cur.id)
      cur = cur.parent >= 0 && cur.parent !== cur.id ? map.rooms[cur.parent] : undefined
    }
  }
  return on
}

/**
 * Which weapon a mission lends, from one roll: one Flux has not won yet if
 * any is left (a taste of a Core Master still ahead), else one of his that is
 * not slotted (so the third button is not a copy of the first two), else any.
 */
export const lentWeapon = (roll: number, owned: readonly string[], slots: readonly string[]): WeaponId => {
  const fresh = WEAPON_IDS.filter(id => !owned.includes(id))
  const spare = WEAPON_IDS.filter(id => !slots.includes(id))
  const pool = fresh.length ? fresh : spare.length ? spare : WEAPON_IDS
  return pool[Math.min(pool.length - 1, Math.floor(roll * pool.length))]!
}

/** The room's cell nearest its middle that is not against a wall (a chest or
 *  a crate stands there) and not its last spot (a data core's: objectives.ts
 *  takes spots from the end). World centre of that cell. */
const capsuleCell = (r: Room): [number, number] => {
  const [cx, cz] = roomCenter(r)
  const last = r.spots[r.spots.length - 1]
  let best: [number, number] | null = null
  let bestD = Infinity
  for (const s of r.spots) {
    if (s === last) continue
    if (s[0] <= r.x0 || s[0] >= r.x0 + r.w - 1 || s[1] <= r.z0 || s[1] >= r.z0 + r.h - 1) continue
    const d = (cellCenter(s[0]) - cx) ** 2 + (cellCenter(s[1]) - cz) ** 2
    if (d < bestD) {
      bestD = d
      best = s
    }
  }
  return best ? [cellCenter(best[0]), cellCenter(best[1])] : [cx, cz]
}

/** Off a ledge's centre toward the wall(s) behind it — the sides with no
 *  cell at all — and to one side along a wall, staying inside the ledge's
 *  own cell: a corner of it. */
const backOfLedge = (map: MapData, x: number, z: number): [number, number] => {
  const i = Math.floor(x / CELL)
  const j = Math.floor(z / CELL)
  let dx = 0
  let dz = 0
  for (const [di, dj] of DIRS4) {
    const ni = i + di
    const nj = j + dj
    const solid = ni < 0 || nj < 0 || ni >= map.w || nj >= map.h || map.cell[nj * map.w + ni] === 0
    if (solid) {
      dx += di
      dz += dj
    }
  }
  // Along a single wall: the corner on its +x / +z side.
  if (dx && !dz) dz = 1
  else if (dz && !dx) dx = 1
  else if (!dx && !dz) { dx = 1; dz = 1 }
  return [Math.sign(dx) * LEDGE_OFFSET, Math.sign(dz) * LEDGE_OFFSET]
}

/**
 * Capsules for a stage with reward ledges but none named for a weapon: one,
 * or two (40 %), at the ledge's floor height, beside the ledge's own prize. A
 * placement for any list of spots, so a future stage can reuse it.
 */
export const capsulesOnLedges = (map: MapData, ledges: readonly LedgeSpot[], rng: Rng): LedgeSpot[] => {
  if (!ledges.length) return []
  const n = ledges.length >= 2 && rng() < 0.4 ? 2 : 1
  const order = shuffle(rng, ledges.map((_, i) => i)).slice(0, n).sort((a, b) => a - b)
  return order.map((i) => {
    const l = ledges[i]!
    const [ox, oz] = backOfLedge(map, l.x, l.z)
    return { x: l.x + ox, z: l.z + oz, y: l.y, room: l.room }
  })
}

/**
 * Where a mission's capsules go and what they lend. Pure and deterministic:
 * the same map (and the same owned weapons) always gets the same answer, and
 * it draws from its own stream (`CAPSULE_SALT`), so no other seeded draw —
 * the map, its spawns, chests, traps — moves. Positions come before the
 * weapon roll, so what Flux owns never moves a capsule.
 */
export const planBorrowed = (
  map: MapData,
  opts: { tutorial?: boolean; owned?: readonly string[]; slots?: readonly string[] } = {}
): CapsuleSpot[] => {
  if (opts.tutorial) return []
  const rng = mulberry32((map.seed ^ CAPSULE_SALT) >>> 0)
  const at: LedgeSpot[] = []
  const ledges = map.terrain?.rewards
  if (ledges) {
    // The climb names its weapon ledge (`kind: 'weapon'`, the crusher
    // bridge's alcove): the capsule IS that ledge's prize. A stage with
    // ledges but none named gets one or two beside their prizes.
    const named = ledges.filter(l => l.kind === 'weapon')
    if (named.length) for (const l of named) at.push({ x: l.x, z: l.z, y: l.y, room: l.room })
    else at.push(...capsulesOnLedges(map, ledges, rng))
  } else {
    if (rng() >= CAPSULE_CHANCE) return []
    const path = mainPathRooms(map)
    const treasure = map.rooms.filter(r => r.role === 'treasure')
    const pool = treasure.length ? treasure : map.rooms.filter(r => r.role === 'combat' && !path.has(r.id))
    if (!pool.length) return []
    const room = pool[Math.floor(rng() * pool.length)]!
    const [x, z] = capsuleCell(room)
    at.push({ x, z, y: 0, room: room.id })
  }
  if (!at.length) return []
  // One power per mission: every capsule lends the same weapon.
  const weapon = lentWeapon(rng(), opts.owned ?? [], opts.slots ?? [])
  return at.map(s => ({ ...s, weapon }))
}

/** A secret's weapon prize on a map without a capsule: chosen like a
 *  capsule's (`lentWeapon`), from a stream of its own off the map seed. */
export const SECRET_SALT = 0x5ec2e7
export const secretWeapon = (seed: number, owned: readonly string[], slots: readonly string[]): WeaponId =>
  lentWeapon(mulberry32((seed ^ SECRET_SALT) >>> 0)(), owned, slots)

// ─── The borrowed slot (pure state) ──────────────────────────────────────────

export class BorrowedSlot {
  id: WeaponId | '' = ''
  shots = 0
  max = 0

  /** Would a capsule of `id` add anything? (A full slot of the same weapon
   *  leaves the capsule standing for later.) */
  wants(id: WeaponId): boolean {
    return this.id !== id || this.shots < this.max
  }

  /** Take a capsule: the same weapon tops up to full, another replaces it. */
  grant(id: WeaponId): 'new' | 'topup' | 'replace' {
    const was = this.id
    this.id = id
    this.max = LENT_SHOTS[id]
    this.shots = this.max
    return !was ? 'new' : was === id ? 'topup' : 'replace'
  }

  /** One shot's charge. True when that was the last one. */
  spend(): boolean {
    if (!this.id || this.shots <= 0) return false
    this.shots--
    return this.shots <= 0
  }

  clear(): void {
    this.id = ''
    this.shots = 0
    this.max = 0
  }
}

// ─── The mission's capsules + slot ───────────────────────────────────────────

export interface BorrowedHost {
  fx: {
    orbBurst(x: number, y: number, z: number, color: string, scale?: number): void
    riseRing(x: number, y: number, z: number, color: string, r?: number, n?: number): void
    flash(x: number, y: number, z: number, color: string, size?: number, life?: number): void
    sparks(x: number, y: number, z: number, color: string, n?: number, speed?: number, size?: number): void
  }
  sfx(name: string, x?: number, z?: number): void
}

export interface CapsuleRt {
  spot: CapsuleSpot
  view: WeaponCapsuleMesh | null
  taken: boolean
}

/** What the HUD draws for the third button. */
export interface BorrowedView {
  id: WeaponId | ''
  shots: number
  max: number
  color: string
  /** Off cooldown (the one limit it has besides its charges). */
  ready: boolean
  /** The first-take teach is showing (no scene lesson has the stage). */
  teach: boolean
  /** Counts the times a borrowed weapon ran dry: the HUD pops the button. */
  spent: number
}

export const NO_BORROWED: BorrowedView = { id: '', shots: 0, max: 0, color: '#ffffff', ready: false, teach: false, spent: 0 }

export class BorrowedRun {
  readonly slot = new BorrowedSlot()
  readonly capsules: CapsuleRt[] = []
  /** The first-take teach is due: on until the weapon is fired once. */
  teach = false
  /** Runs dry so far (the HUD's spent pop keys on it). */
  spent = 0
  /** The colour of the weapon last carried: the spent pop wears it. */
  lastColor = '#ffffff'
  private host: BorrowedHost
  private sig = ''

  constructor(host: BorrowedHost, spots: CapsuleSpot[], makeView?: (s: CapsuleSpot) => WeaponCapsuleMesh | null) {
    this.host = host
    for (const spot of spots) this.capsules.push({ spot, view: makeView?.(spot) ?? null, taken: false })
    // A new mission starts with nothing borrowed on the HUD.
    hud.borrowed = NO_BORROWED
  }

  /**
   * Animate the capsules and take one Flux walks into (feet at `p.y`).
   * Returns the capsule taken this step, or null. Zero allocations.
   */
  update(dt: number, time: number, p: { x: number; y: number; z: number }, playing: boolean): CapsuleRt | null {
    let got: CapsuleRt | null = null
    for (let k = 0; k < this.capsules.length; k++) {
      const c = this.capsules[k]!
      if (c.taken) continue
      const v = c.view
      if (v) {
        v.float.position.y = CAPSULE_HOVER + Math.sin(time * 2.2 + k) * 0.09
        v.float.rotation.y += dt * 0.9
        v.halo.rotation.y += dt * 2.4
        v.holo.rotation.y -= dt * 2.6
        // A hologram flickers now and then; the column breathes.
        v.holoMat.opacity = 0.7 + Math.sin(time * 5.3 + k) * 0.12 + (Math.sin(time * 31 + k * 7) > 0.93 ? -0.4 : 0)
        v.columnMat.opacity = 0.26 + Math.sin(time * 2.2 + k) * 0.07
        v.haloMat.opacity = 0.75 + Math.sin(time * 4 + k) * 0.15
      }
      if (got || !playing) continue
      const s = c.spot
      if (Math.abs(p.y - s.y) > PICK_DY) continue
      const dx = p.x - s.x
      const dz = p.z - s.z
      if (dx * dx + dz * dz > PICK_R * PICK_R) continue
      if (!this.slot.wants(s.weapon)) continue
      this.take(c)
      got = c
    }
    return got
  }

  /** Flux takes a capsule: the grant, a burst in the weapon's colour, the
   *  jingle, a toast naming the power and its charges. */
  take(c: CapsuleRt): void {
    if (c.taken) return
    c.taken = true
    if (c.view) c.view.root.visible = false
    const s = c.spot
    const color = WEAPONS[s.weapon].color
    this.slot.grant(s.weapon)
    this.lastColor = color
    if (!profile.tips[TEACH_TIP]) this.teach = true
    const fx = this.host.fx
    const y = s.y + CAPSULE_HOVER
    fx.orbBurst(s.x, y, s.z, color, 0.8)
    fx.riseRing(s.x, s.y + 0.15, s.z, color, 0.9, 20)
    fx.flash(s.x, y, s.z, '#ffffff', 1.8, 0.2)
    this.host.sfx('borrowGet', s.x, s.z)
    pushHud({ t: 'flash', color, strength: 0.3 })
    pushHud({ t: 'toast', key: 'combat.borrowedGet', params: { weapon: `weapon.${s.weapon}.name`, n: this.slot.shots }, color })
  }

  /** A borrowed weapon off any pedestal — a secret alcove's prize
   *  (`sim/secrets.ts`): taken at (x, y, z) as if a capsule stood there. It
   *  joins no list, so the capsules' saved indices hold; the slot's charges
   *  ride in the save as usual. */
  lend(weapon: WeaponId, x: number, y: number, z: number): void {
    this.take({ spot: { x, y, z, room: -1, weapon }, view: null, taken: false })
  }

  /** The borrowed weapon fired ('ok'). `free`: Gale Guard's throw, which is
   *  the second half of the charge its cast already paid. */
  fired(free = false): void {
    if (this.teach) {
      this.teach = false
      markTip(TEACH_TIP)
    }
    if (!free) this.slot.spend()
  }

  /**
   * A slot at 0 charges goes with a pop — unless what it fired is still out
   * (`busy`: Gale Guard's leaves orbiting, still to be thrown). True when it
   * went this step; the mission draws the pop at the muzzle.
   */
  checkSpent(busy: boolean): boolean {
    if (!this.slot.id || this.slot.shots > 0 || busy) return false
    this.lastColor = WEAPONS[this.slot.id].color
    this.slot.clear()
    this.teach = false
    this.spent++
    this.host.sfx('borrowSpent')
    return true
  }

  save(): BorrowedSave {
    const got: number[] = []
    this.capsules.forEach((c, i) => { if (c.taken) got.push(i) })
    return { w: this.slot.id, shots: this.slot.shots, got }
  }

  /** A resumed mission: the charges left and the capsules already taken
   *  (quietly — no burst, no jingle, no teach). */
  restore(s: BorrowedSave | undefined): void {
    if (!s) return
    for (const i of s.got ?? []) {
      const c = this.capsules[i]
      if (!c) continue
      c.taken = true
      if (c.view) c.view.root.visible = false
    }
    const id = s.w as WeaponId
    if (id && id in WEAPONS && s.shots > 0) {
      this.slot.id = id
      this.slot.max = LENT_SHOTS[id]
      this.slot.shots = Math.max(1, Math.min(this.slot.max, Math.round(s.shots)))
      this.lastColor = WEAPONS[id].color
    }
  }

  /** The third button's mirror (≤ 15 Hz): reassigned only when something it
   *  draws changed, so the HUD re-renders on a change, not on every write. */
  writeHud(ready: boolean, lessonLive: boolean): void {
    const id = this.slot.id
    const teach = this.teach && !!id && !lessonLive
    const sig = `${id}${this.slot.shots}/${this.slot.max}${ready ? 'r' : ''}${teach ? 't' : ''}${this.spent}`
    if (sig === this.sig) return
    this.sig = sig
    hud.borrowed = {
      id, shots: this.slot.shots, max: this.slot.max, color: id ? WEAPONS[id].color : this.lastColor,
      ready: !!id && ready, teach, spent: this.spent
    }
  }
}
