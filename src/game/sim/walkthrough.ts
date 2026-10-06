import type { EnemyKind } from '../models/enemies'
import type { MapData } from '../world/levelGen'
import { CELL, cellCenter } from '../world/levelGen'
import { hasLineOfSight, isSolidAt, type Nav } from '../world/nav'
import type { WalkthroughSave } from '../state/profile'
import type { Enemy } from './world'
import { roomAt } from './lessons'
import { plateSpot, type TrapSpot } from './traps'

/**
 * ─── The tutorial walkthrough: a lesson per room, a door per lesson ──────────
 *
 * "Wake-Up Call" is a guided walk along the main path, from the start pad to
 * the Scrapper's shutter. Every door on that path starts LOCKED (red lamp),
 * and a room's door out opens only once the player has DONE what the room
 * teaches — so nobody meets the boss, or the sectors after it, missing a
 * control or a mechanic the game takes for granted:
 *
 *   start  look and move (the coach, from the first frame), then the training
 *          drone: quick shots skip off its bubble, a charged shot pops it
 *   2nd    one Hardhat (shoot when it peeks), then a glowing crate that only
 *          a charged shot breaks
 *   3rd    one Shield Trooper: block its burst (a parry is welcome), a charge
 *          breaks its guard. Opens once it is down AND a block happened
 *   4th    one Stomper: slide out of its red ring. Opens once a slide happened
 *   5th    a chest: open it, and the boss shutter unlocks
 *
 * Then the REPAIR GEL, in the corridor out of the Stomper's room. Its door
 * opens as usual; halfway down the corridor a pressure plate clicks, a sheet
 * of fire fills the passage, and the door ahead slams shut. Flux is left on
 * exactly a quarter of his bar (never lower, never dead), with the room behind
 * him cleared and nothing awake near him. The gel lesson comes on (a gel is
 * granted, flying into its button, if he carries none), and the door opens
 * again once a gel is used. Its gate is the corridor, not a room, so it rides
 * beside the gates: `plan.gel`.
 *
 * No lesson can be skipped: a gate opens only once its steps are met, however
 * long that takes. A lesson skipped by accident brings in another teacher —
 * the Trooper down before a single block: a Rotor Drone rams (blockable); the
 * Stomper down before a slide: another Stomper — one at a time, the next a
 * beat (SETTLE) after the last one fell, for as long as it takes. A shorter
 * path folds lessons together (the chest joins the Stomper first); a longer
 * one gives its extra rooms a plain "clear it" gate. Walking into a held door
 * (or waiting at it) brings up "Finish the lesson", an arrow to `goal()` and
 * the glyph of what `needAt()` the door waits on (`sim/doorPrompt.ts`).
 *
 * Wordless like the rest: the coach's glyphs and the scene lessons do the
 * teaching; the walkthrough only schedules them and keeps the doors. A door
 * it opens gets a chime, a pulse and a yellow lamp (the mission's part).
 * `goal()` says where to walk next — each lesson's subject in turn, the door
 * it opens, the gel plate, the chest, then the boss shutter — and the floor
 * trail leads there once the coach's move glyph is learned (mission.ts).
 * Pure logic over a small host, pinned by `tests/game/walkthrough.test.ts`.
 */

/** What a room teaches before its door out opens. */
export type WalkStep = 'charge' | 'crate' | 'block' | 'slide' | 'chest' | 'clear' | 'gap' | 'rest'

export interface WalkGate {
  /** The path room that teaches. */
  room: number
  /** Its door out along the path (the last gate's is the boss shutter). */
  door: number
  steps: WalkStep[]
}

/** The Repair Gel corridor: the one out of `gate`'s room, its door that gate's. */
export interface GelPlan {
  gate: number
  door: number
  /** The pressure plate (a `plate` trap, `sim/traps.ts`). */
  spot: TrapSpot
}

export interface WalkPlan {
  /** The main path, start room first, up to the boss room's threshold. */
  path: number[]
  gates: WalkGate[]
  /** Where the Repair Gel is taught; null when no corridor fits. */
  gel: GelPlan | null
}

/** What `Walkthrough.goal()` points at. */
export type WalkGoalKind =
  /** Step one's training drone. */
  | 'drone'
  /** A machine of the gate's room still standing: its teacher, a stand-in. */
  | 'machine'
  /** The gate's room, from outside it: just inside its door. */
  | 'room'
  /** The crate lesson's crate. */
  | 'crate'
  /** The chest step's chest. */
  | 'chest'
  /** The gel corridor's pressure plate. */
  | 'plate'
  /** The room is done: its door out. */
  | 'door'
  /** Past the last gate: the mission's own objective (the boss shutter). */
  | 'objective'

/** Where to walk next, and what is there. */
export interface WalkGoal {
  x: number
  z: number
  kind: WalkGoalKind
}

/** The walkthrough's save, with the gel trap (optional: older snapshots lack it). */
export interface WalkSave extends WalkthroughSave {
  /** The gel corridor's trap has gone off. */
  gel?: boolean
  /** …and its lesson is over (a gel used): its door is open again. Missing
   *  or false with `gel` set, a resume teaches the gel again. */
  gelDone?: boolean
}

/** What a held walkthrough door waits on: its room's step, or the gel
 *  corridor's gel (`Walkthrough.needAt`). */
export type WalkNeed = WalkStep | 'gel' | 'weapon'

/** The lesson a held door waits for, as its `train.name.<id>`: "Finish
 *  first: Shield Tutorial". Steps that are not a lesson (clear the room, open
 *  the chest) have none and keep the plain "Finish the lesson". */
export const LESSON_OF: Readonly<Partial<Record<WalkNeed, string>>> = {
  charge: 'charge', crate: 'charge', block: 'block', slide: 'slide', gel: 'gel', gap: 'gap', weapon: 'weapon'
}

/** The rooms after the start teach these, in order (the start: 'charge'). */
const TEACH: readonly WalkStep[] = ['crate', 'block', 'slide', 'chest']
/** The one machine that stands in a room for each step (the scripted cast). */
export const TEACHER: Record<WalkStep, EnemyKind | null> = {
  charge: null, crate: 'hardhat', block: 'trooper', slide: 'hopper', chest: null, clear: 'hardhat', gap: null, rest: null
}
/** A room must have been quiet this long before its lesson moves in — and
 *  the beat between one stand-in teacher falling and the next beaming in. */
export const SETTLE = 1.2
/** A gate's conditions must hold this long before its door opens, so the
 *  lesson's check and the last death burst play first. */
const OPEN_DELAY = 0.8
/** A prompt that found no floor to use tries again after this long (s). */
const RETRY = 1
/** The burst reads first; the gel lesson comes on this long after it (s). */
export const GEL_DELAY = 0.9
/** On (or past) the gel plate this long with something still awake nearby:
 *  it goes off anyway. A machine that will not come cannot hold the
 *  tutorial shut for good. */
export const GEL_FORCE_AFTER = 6

/**
 * Which lessons each of `n` path rooms teaches, start room first. Four rooms
 * after the start: one lesson each. More: the extra rooms (before the chest,
 * which always opens the boss shutter) only need clearing. Fewer: the later
 * rooms take two, the chest joining the Stomper first.
 */
export const stepsFor = (n: number): WalkStep[][] => {
  if (n <= 0) return []
  if (n === 1) return [['charge', ...TEACH]]
  const m = n - 1
  const out: WalkStep[][] = [['charge']]
  if (m >= TEACH.length) {
    for (let k = 0; k < TEACH.length - 1; k++) out.push([TEACH[k]!])
    for (let k = TEACH.length; k < m; k++) out.push(['clear'])
    out.push([TEACH[TEACH.length - 1]!])
    return out
  }
  const base = Math.floor(TEACH.length / m)
  const extra = TEACH.length % m
  let at = 0
  for (let k = 0; k < m; k++) {
    const take = base + (k >= m - extra ? 1 : 0)
    out.push(TEACH.slice(at, at + take))
    at += take
  }
  return out
}

/** The main path (the map is a tree: the boss room's ancestors) and its gates. */
export const planWalkthrough = (map: MapData): WalkPlan => {
  const boss = map.rooms.find(r => r.role === 'boss')
  if (!boss || boss.parent < 0) return { path: [], gates: [], gel: null }
  const path: number[] = []
  for (let r = boss.parent; r >= 0; r = map.rooms[r]!.parent) path.unshift(r)
  // A built tutorial names its rooms' lessons itself.
  const steps = map.walkSteps && map.walkSteps.length === path.length
    ? map.walkSteps.map(s => s as WalkStep[])
    : stepsFor(path.length)
  const gates = path.map((room, k): WalkGate => {
    const next = k + 1 < path.length ? path[k + 1]! : boss.id
    return { room, door: map.rooms[next]!.door, steps: steps[k]! }
  })
  return { path, gates, gel: gelPlan(map, gates) }
}

/**
 * The Repair Gel corridor: the one into the breather before the boss (a
 * built tutorial: a whole room between the trap and the boss door, so the
 * lesson never fires while the player is already at the shutter), else the
 * one out of the Stomper's room (by then every fighting control is known).
 * Never the boss shutter's corridor — a shorter path, whose Stomper room
 * opens onto the boss, takes the corridor before it — and never the start
 * room's. It needs a cell before the door's own for the plate.
 */
const gelPlan = (map: MapData, gates: WalkGate[]): GelPlan | null => {
  const rest = gates.findIndex(g => g.steps.includes('rest'))
  const slide = gates.findIndex(g => g.steps.includes('slide'))
  const from = rest > slide && slide >= 0 ? rest - 1 : slide
  for (let k = from; k >= 1; k--) {
    const g = gates[k]!
    if (map.doors[g.door]?.boss) continue
    const spot = plateSpot(map, g.door)
    if (spot) return { gate: k, door: g.door, spot }
  }
  return null
}

/** Where the player first stands in a room: the cell just inside the door
 *  leading in (the pad, for the start room). */
export const doorwayOf = (map: MapData, roomId: number): [number, number] => {
  const r = map.rooms[roomId]
  const d = r && r.door >= 0 ? map.doors[r.door] : undefined
  if (!d) return [map.start.x, map.start.z]
  return [cellCenter(d.i + (d.axis === 'x' ? d.dir : 0)), cellCenter(d.j + (d.axis === 'z' ? d.dir : 0))]
}

/** Where a stand-in teacher beams in: inside `roomId`, 4–11 m from the
 *  player, in sight, as near the middle of the view as the room allows. */
export const helperSpot = (
  nav: Nav, map: MapData, roomId: number, px: number, pz: number, yaw: number
): [number, number] | null => {
  const room = map.rooms[roomId]
  if (!room) return null
  let best: [number, number] | null = null
  let bestScore = Infinity
  for (const [i, j] of room.spots) {
    const x = cellCenter(i)
    const z = cellCenter(j)
    const d = Math.hypot(x - px, z - pz)
    if (d < 4 || d > 11 || isSolidAt(nav, x, z) || !hasLineOfSight(nav, px, pz, x, z)) continue
    let a = Math.atan2(-(x - px), -(z - pz)) - yaw
    while (a > Math.PI) a -= Math.PI * 2
    while (a < -Math.PI) a += Math.PI * 2
    const score = Math.abs(a) * 3 + Math.abs(d - 6)
    if (score < bestScore) {
      best = [x, z]
      bestScore = score
    }
  }
  return best
}

/** The steps done only with the room's machines down too (the drone and the
 *  chest need no quiet room). */
/** Steps whose door also waits for the room's machines to be down. Not the
 *  shield and slide lessons: their door opens the moment the move is learned
 *  (a playtester learned the slide and the door stayed shut). */
const quietStep = (s: WalkStep): boolean => s !== 'charge' && s !== 'chest' && s !== 'block' && s !== 'slide'

/** None of the room's own machines is standing (a boss never counts). */
const roomEmpty = (enemies: Enemy[], room: number): boolean => {
  for (let k = 0; k < enemies.length; k++) {
    const e = enemies[k]!
    if (e.room === room && e.state !== 'dead' && !e.boss) return false
  }
  return true
}

/** What the walkthrough needs from the mission. */
export interface WalkHost {
  time: number
  map: MapData
  player: { x: number; z: number }
  enemies: Enemy[]
  lessons: {
    /** Step one's training drone still hovers. */
    readonly droneUp: boolean
    /** …and where (null once it popped). */
    readonly droneAt: { readonly x: number; readonly z: number } | null
    /** The crate lesson's crate broke (this mission). */
    readonly crateBroken: boolean
    /** The crate lesson's crate while that lesson runs (null otherwise). */
    readonly crateAt: { readonly x: number; readonly z: number } | null
    /** Light the crate lesson in `room`; false while no crate can be shown. */
    startCrate(room: number): boolean
    /** A floor glow under a scripted scene's subject (the chest). */
    spotlight(x: number, z: number, on: boolean): void
  }
  objects: {
    chests: ReadonlyArray<{ opened: boolean }>
    /** The mission's objective (`MissionObjects.target`): the boss shutter. */
    target(px: number, pz: number, enemies: readonly Enemy[]): { x: number; z: number } | null
  }
  /** Shut a path door: locked, red lamp, nobody through. */
  holdDoor(id: number): void
  /** Open it for good: a yellow lamp, a chime, a pulse at the door. */
  releaseDoor(id: number): void
  /** Slide an open path door shut behind the player and hold it (optional:
   *  a host without it leaves the way back open). */
  shutDoor?(id: number): void
  /** Beam a stand-in teacher into `room`, in view of the player. */
  bringIn(kind: 'heli' | 'hopper', room: number): boolean
  /** Progress worth a checkpoint (the resume snapshot). */
  checkpoint(): void
  // ── The Repair Gel corridor (optional: a host without them skips it) ──
  /** Nothing awake near Flux: the plate may go off. */
  gelSafe?(): boolean
  /** The plate goes off: the burst, a quarter of his health left, the door
   *  ahead slammed shut (held). */
  springGel?(gel: GelPlan): void
  /** Light the gel lesson (granting a gel if none is carried); false while
   *  it cannot start yet. */
  startGel?(): boolean
  /** The gel lesson has ended: a gel used (in the tutorial nothing else ends
   *  it, `LessonDirector`). */
  gelOver?(): boolean
}

/** The chest step's chest: its id in `MissionObjects.chests`, and where. */
export interface WalkChest {
  id: number
  x: number
  z: number
}

export class Walkthrough {
  readonly plan: WalkPlan
  private h: WalkHost
  private chest: WalkChest | null
  /** Gates passed; the one at this index is the one being taught. */
  private gate = 0
  private blocked = false
  private slid = false
  private leapt = false
  private crate = false
  private crateLive = false
  private clearAt = -1
  private readyAt = -1
  private retryAt = -1
  private lit = false
  /** Gates whose door in has been shut behind the player (one way forward). */
  private shut = 0
  /** The gel corridor: waiting for its gate, the plate armed, gone off (the
   *  lesson on, its door held), or done with. */
  private gel: 'wait' | 'armed' | 'sprung' | 'done'
  private gelAt = -1
  /** Since when Flux has stood on (or past) the armed plate (-1: not there). */
  private plateSince = -1
  private gelLit = false
  /** The plate went off (saved: a resume never springs it twice). */
  private gelFiredFlag = false
  /** Per gate: where its room is entered (just inside the door leading in)
   *  and its door out's cell — `goal()`'s fixed points, found once. */
  private readonly entries: Array<[number, number]>
  private readonly exits: Array<[number, number]>
  /** `goal()`'s answer, reused. */
  private readonly aimAt: WalkGoal = { x: 0, z: 0, kind: 'room' }

  constructor(host: WalkHost, plan: WalkPlan, chest: WalkChest | null = null) {
    this.h = host
    this.plan = plan
    this.chest = chest
    this.gel = plan.gel && host.springGel ? 'wait' : 'done'
    this.entries = plan.gates.map(g => doorwayOf(host.map, g.room))
    this.exits = plan.gates.map(g => {
      const d = host.map.doors[g.door]
      return d ? [cellCenter(d.i), cellCenter(d.j)] : doorwayOf(host.map, g.room)
    })
  }

  /** The gel corridor's plate has gone off (or went off before a resume). */
  get gelFired(): boolean {
    return this.gelFiredFlag
  }

  /** Between the burst and the gel lesson coming on, and while it runs: the
   *  coach's own tank glyph stands aside. */
  get gelPending(): boolean {
    return this.gel === 'sprung'
  }

  /** The gate being taught waits on a block and the player is in its room:
   *  the coach keeps the shield glyph up, emphasised, until one lands. */
  blockPending(x: number, z: number): boolean {
    const g = this.plan.gates[this.gate]
    if (!g || this.blocked || !g.steps.includes('block')) return false
    return roomAt(this.h.map, x, z) === g.room
  }

  /** Until every gate before the boss is passed. */
  get active(): boolean {
    return this.gate < this.plan.gates.length
  }

  /** Gates passed so far. */
  get passed(): number {
    return this.gate
  }

  /** The gate being taught now, if any. */
  get current(): WalkGate | null {
    return this.plan.gates[this.gate] ?? null
  }

  /** Step one still needs its training drone (the mission places it at build). */
  get needsDrone(): boolean {
    return this.current?.steps.includes('charge') ?? false
  }

  /** Lock every door not yet earned: at build, after a resume restored the
   *  progress (the doors already passed are open or open on approach) — and
   *  the gel corridor's door while its lesson is still to do. */
  start(): void {
    for (let k = this.gate; k < this.plan.gates.length; k++) this.h.holdDoor(this.plan.gates[k]!.door)
    if (this.gel === 'sprung' && this.plan.gel) this.h.holdDoor(this.plan.gel.door)
  }

  /** A block or a parry landed (anywhere in the mission). */
  noteBlock(): void {
    if (this.blocked) return
    this.blocked = true
    this.h.checkpoint()
  }

  /** The player crossed a gap with an edge-leap. */
  noteLeap(): void {
    if (this.leapt) return
    this.leapt = true
    this.h.checkpoint()
  }

  /** The player slid. */
  noteSlide(): void {
    if (this.slid) return
    this.slid = true
    this.h.checkpoint()
  }

  /** Per sim step. Allocation-free. */
  update(playing: boolean, fighting: boolean): void {
    if (this.gel === 'armed' || this.gel === 'sprung') this.stepGel(playing, fighting)
    const g = this.plan.gates[this.gate]
    if (!g) return
    const h = this.h
    if (playing) this.shutBehind(g)
    // The chest step's chest glows on the floor until it is open.
    const c = this.chest
    const glow = !!c && g.steps.includes('chest') && !this.chestOpen()
    if (glow !== this.lit) {
      this.lit = glow
      if (c) h.lessons.spotlight(c.x, c.z, glow)
    }
    if (!playing) return
    // Only this room's machines: a fight next door (machines that saw Flux
    // through the doorway) used to hold the gate shut until he walked away.
    const clear = roomEmpty(h.enemies, g.room)
    if (!clear) this.clearAt = -1
    else if (this.clearAt < 0) this.clearAt = h.time
    for (let k = 0; k < g.steps.length; k++) {
      const s = g.steps[k]!
      if (this.met(s, clear)) continue
      this.readyAt = -1
      const settled = this.clearAt >= 0 && h.time - this.clearAt >= SETTLE
      if (settled && h.time >= this.retryAt && roomAt(h.map, h.player.x, h.player.z) === g.room) this.prompt(s, g.room)
      return
    }
    if (this.readyAt < 0) this.readyAt = h.time
    else if (h.time - this.readyAt >= OPEN_DELAY) this.pass(g)
  }

  private chestOpen(): boolean {
    const c = this.chest
    return !c || !!this.h.objects.chests[c.id]?.opened
  }

  private met(s: WalkStep, clear: boolean): boolean {
    const h = this.h
    if (s === 'crate' && !this.crate && this.crateLive && h.lessons.crateBroken) {
      this.crate = true
      // The crate lesson borrowed the floor glow: a chest sharing the
      // room (a folded path) gets it back on the next step.
      this.lit = false
      h.checkpoint()
    }
    return this.done(s, clear)
  }

  /** `met` without its bookkeeping: `goal()` only reads. */
  private done(s: WalkStep, clear: boolean): boolean {
    return quietStep(s) ? clear && this.learned(s) : this.learned(s)
  }

  /** The step's own part is done, the room's machines aside (`done` wants
   *  both for the steps that need the room quiet). */
  private learned(s: WalkStep): boolean {
    const h = this.h
    switch (s) {
      case 'charge':
        return !h.lessons.droneUp
      case 'crate':
        return this.crate || (this.crateLive && h.lessons.crateBroken)
      case 'block':
        return this.blocked
      case 'slide':
        return this.slid
      case 'chest':
        return this.chestOpen()
      case 'clear':
        return true
      case 'rest':
        // The breather before the boss: its door (the shutter) waits for the
        // gel lesson, so it never fires while Flux is at the boss door.
        return !this.plan.gel || this.gel === 'done'
      case 'gap':
        return this.leapt
    }
  }

  /** The room is quiet and the player in it, but the step is not done: bring
   *  in what teaches it (the crate lesson, another machine). A stand-in comes
   *  only into a room with nothing standing, SETTLE after the last one fell:
   *  one at a time, never a pile-up, and never a last one. */
  private prompt(s: WalkStep, room: number): void {
    const h = this.h
    if (s === 'crate') {
      if (!this.crateLive) this.crateLive = h.lessons.startCrate(room)
      if (!this.crateLive) this.retryAt = h.time + RETRY
    } else if (s === 'block' || s === 'slide') {
      if (h.bringIn(s === 'block' ? 'heli' : 'hopper', room)) {
        this.clearAt = -1
      } else {
        this.retryAt = h.time + RETRY
      }
    }
  }

  /**
   * The gel corridor. Armed: Flux steps onto the plate's cell with nothing
   * awake near him — it goes off. Then, after the burst has read, the lesson;
   * the door ahead opens again once the lesson is over.
   */
  private stepGel(playing: boolean, fighting: boolean): void {
    const h = this.h
    const gel = this.plan.gel
    if (!gel || !playing) return
    if (this.gel === 'armed') {
      if (!this.overPlate(gel)) {
        this.plateSince = -1
        return
      }
      if (this.plateSince < 0) this.plateSince = h.time
      const forced = h.time - this.plateSince >= GEL_FORCE_AFTER
      if (!forced && (fighting || !(h.gelSafe?.() ?? true))) return
      this.gel = 'sprung'
      this.gelAt = h.time
      this.gelLit = false
      this.gelFiredFlag = true
      h.springGel?.(gel)
      h.checkpoint()
      return
    }
    if (!this.gelLit) {
      if (h.time - this.gelAt >= GEL_DELAY) this.gelLit = h.startGel?.() ?? true
      return
    }
    if (h.gelOver?.() ?? true) {
      this.gel = 'done'
      h.releaseDoor(gel.door)
      h.checkpoint()
    }
  }

  /**
   * Flux is on the gel plate — or past it: in the doorway beyond, or already
   * in the room through it. The plate is one cell before the door, and a
   * player cutting the corner steps from the cell beside it straight into the
   * doorway; an exact-cell test left the plate armed for good, the gel lesson
   * never came, and the boss shutter (which waits for it) stayed shut —
   * every playtester of 2026-10-06 stood there.
   */
  private overPlate(gel: GelPlan): boolean {
    const h = this.h
    const i = Math.floor(h.player.x / CELL)
    const j = Math.floor(h.player.z / CELL)
    if (i === gel.spot.i && j === gel.spot.j) return true
    const d = h.map.doors[gel.door]
    if (d && i === d.i && j === d.j) return true
    const next = this.plan.gates[gel.gate + 1]
    return !!next && roomAt(h.map, h.player.x, h.player.z) === next.room
  }

  /**
   * The door the player came in by slides shut behind him once he is well
   * inside the gate's room (#270): one way forward, never a walk back to an
   * earlier room. The start room has none; the gel corridor's door shuts the
   * same way once he is through into the breather.
   */
  private shutBehind(g: WalkGate): void {
    const k = this.gate
    if (k < 1 || this.shut >= k || !this.h.shutDoor) return
    const h = this.h
    if (roomAt(h.map, h.player.x, h.player.z) !== g.room) return
    const prev = this.plan.gates[k - 1]!
    const d = h.map.doors[prev.door]
    if (!d || Math.hypot(h.player.x - cellCenter(d.i), h.player.z - cellCenter(d.j)) < CELL * 1.6) return
    this.shut = k
    h.shutDoor?.(prev.door)
  }

  private pass(g: WalkGate): void {
    const h = this.h
    h.releaseDoor(g.door)
    // Out of the gel corridor's room: its plate is armed from now on.
    if (this.gel === 'wait' && this.plan.gel?.gate === this.gate) this.gel = 'armed'
    this.gate++
    this.clearAt = -1
    this.readyAt = -1
    this.retryAt = -1
    this.crateLive = false
    if (this.lit && this.chest) {
      this.lit = false
      h.lessons.spotlight(this.chest.x, this.chest.z, false)
    }
    h.checkpoint()
  }

  // ─── Where to go next (the objective trail) ─────────────────────────────────

  /**
   * Where the player should walk next: what the floor trail leads to while
   * the walkthrough runs (mission.ts). The gate being taught's first step not
   * yet done names it — the training drone; a machine of the room still
   * standing (its teacher, a stand-in), or from outside, the room itself
   * until that machine wakes; the crate once its lesson is lit; the chest —
   * and, the room done, its door out (the moment it opens the next gate's
   * room takes over, one cell on). The gel plate comes first while its
   * corridor is armed; past the last gate, the mission's objective (the boss
   * shutter). Null when there is nowhere to walk: the player stands in the
   * room while its next lesson moves in, or the gel lesson has the moment.
   * Pure — reads the progress, never writes it — and allocation-free: the
   * answer is one shared object, valid until the next call.
   */
  goal(): WalkGoal | null {
    const h = this.h
    const g = this.plan.gates[this.gate]
    if (!g) {
      const t = h.objects.target(h.player.x, h.player.z, h.enemies)
      return t ? this.aim(t.x, t.z, 'objective') : null
    }
    const gel = this.plan.gel
    if (this.gel === 'sprung') return null
    if (this.gel === 'armed' && gel) return this.aim(gel.spot.x, gel.spot.z, 'plate')
    const inRoom = roomAt(h.map, h.player.x, h.player.z) === g.room
    const clear = roomEmpty(h.enemies, g.room)
    for (let k = 0; k < g.steps.length; k++) {
      const s = g.steps[k]!
      if (this.done(s, clear)) continue
      if (s === 'charge') {
        const d = h.lessons.droneAt
        return d ? this.aim(d.x, d.z, 'drone') : null
      }
      if (s === 'chest') {
        const c = this.chest
        return c ? this.aim(c.x, c.z, 'chest') : null
      }
      // Every other step waits on the room's machines first.
      if (!clear) {
        const e = this.nearestStanding(g.room)
        if (e && (inRoom || e.awake)) return this.aim(e.x, e.z, 'machine')
        return this.aimEntry()
      }
      if (s === 'crate' && this.crateLive) {
        const c = h.lessons.crateAt
        if (c) return this.aim(c.x, c.z, 'crate')
      }
      // Quiet, the lesson (the crate, a stand-in) moves in once the player is in.
      return inRoom ? null : this.aimEntry()
    }
    const out = this.exits[this.gate]!
    return this.aim(out[0], out[1], 'door')
  }

  private aim(x: number, z: number, kind: WalkGoalKind): WalkGoal {
    const a = this.aimAt
    a.x = x
    a.z = z
    a.kind = kind
    return a
  }

  /** The gate being taught's room, from outside: just inside its door. */
  private aimEntry(): WalkGoal {
    const at = this.entries[this.gate]!
    return this.aim(at[0], at[1], 'room')
  }

  /** The room's standing machine nearest the player (`roomEmpty`'s count). */
  private nearestStanding(room: number): Enemy | null {
    const { enemies, player } = this.h
    let best: Enemy | null = null
    let bestD = Infinity
    for (let k = 0; k < enemies.length; k++) {
      const e = enemies[k]!
      if (e.room !== room || e.state === 'dead' || e.boss) continue
      const d = (e.x - player.x) ** 2 + (e.z - player.z) ** 2
      if (d < bestD) {
        best = e
        bestD = d
      }
    }
    return best
  }

  // ─── The held door's prompt (`sim/doorPrompt.ts`) ───────────────────────────

  /**
   * What the held door `id` waits on: the gate being taught's first step not
   * yet learned (its glyph goes on the door); every step learned but the
   * room's machines still standing, 'clear' (shoot them); the gel while the
   * gel corridor's door is shut. Null for any other door, and for a gate
   * whose room is done (it opens in a moment). Pure, allocation-free.
   */
  needAt(id: number): WalkNeed | null {
    const gel = this.plan.gel
    if (this.gel === 'sprung' && gel && gel.door === id) return 'gel'
    const g = this.plan.gates[this.gate]
    if (!g || g.door !== id) return null
    let quiet = false
    for (let k = 0; k < g.steps.length; k++) {
      const s = g.steps[k]!
      if (!this.learned(s)) return s === 'rest' ? 'gel' : s
      if (quietStep(s)) quiet = true
    }
    return quiet && !roomEmpty(this.h.enemies, g.room) ? 'clear' : null
  }

  /** The gate being taught's machine nearest the player, standing (its own
   *  teacher, a stand-in): the one a player waiting at the door is shown. */
  teacher(): Enemy | null {
    const g = this.plan.gates[this.gate]
    return g ? this.nearestStanding(g.room) : null
  }

  /** DEV only (the cheat): open what holds the way now — the gel door, else
   *  the gate being taught — as if its lesson were done. */
  devPass(): void {
    const gel = this.plan.gel
    if (this.gel === 'sprung' && gel) {
      this.gel = 'done'
      this.h.releaseDoor(gel.door)
      this.h.checkpoint()
      return
    }
    const g = this.plan.gates[this.gate]
    if (g) this.pass(g)
  }

  // ─── Resume ────────────────────────────────────────────────────────────────

  save(): WalkSave {
    return {
      gate: this.gate, crate: this.crate, block: this.blocked, slide: this.slid, leap: this.leapt,
      gel: this.gelFiredFlag, gelDone: this.gelFiredFlag && this.gel === 'done'
    }
  }

  /**
   * Before `start()`: the snapshot's progress (anything malformed reads as
   * none). A trap that already went off stays spent. If its lesson was over
   * too, its door is open; if not (or an older save cannot say), the lesson
   * comes back a beat after the resume and `start()` holds its door again —
   * a resume never skips it. One not yet sprung is armed again if its gate
   * was passed (its door is not held: a player resumed past the plate walks
   * on).
   */
  restore(s: WalkSave | null | undefined): void {
    if (!s || typeof s !== 'object') return
    const n = Number(s.gate)
    this.gate = Number.isFinite(n) ? Math.max(0, Math.min(this.plan.gates.length, Math.floor(n))) : 0
    this.crate = s.crate === true
    this.blocked = s.block === true
    this.slid = s.slide === true
    this.leapt = s.leap === true
    this.gelFiredFlag = s.gel === true
    const gel = this.plan.gel
    if (this.gel !== 'done' && gel) {
      // Only past its gate can the plate have gone off (a save that says
      // otherwise is malformed: the gate's own steps still hold it).
      const past = this.gate > gel.gate
      if (!this.gelFiredFlag) this.gel = past ? 'armed' : 'wait'
      else if (!past || s.gelDone === true) this.gel = 'done'
      else {
        this.gel = 'sprung'
        this.gelAt = this.h.time
        this.gelLit = false
      }
    }
  }
}
