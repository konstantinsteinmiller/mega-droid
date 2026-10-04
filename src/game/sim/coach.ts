import { profile, saveProfile } from '../state/profile'

/**
 * ─── The control coach: wordless, on-screen, earned away ─────────────────────
 *
 * Replaces the text tips. Every control is taught by a GLYPH drawn where the
 * action happens (a WASD cluster, a mouse with the right button lit, a finger
 * tracing an ∞ where the joystick works, a pulsing ring on the shield button…), never by a
 * sentence that disappears before it is read. Each glyph stays until the
 * player has actually DONE the thing a few times: every success flashes it
 * green and fills a pip, and the last one pops a check and retires it.
 *
 * Rules, each from a playtest:
 * - Nothing times out. A player who has not learned to look around still sees
 *   the look glyph a minute later; one who has, never sees it again.
 * - Mastery is per INPUT FAMILY (touch vs mouse+keys): a desktop veteran who
 *   picks up a phone has not learned the joystick.
 * - Some glyphs a family never gets (`UNTAUGHT`): on touch the ∞ finger
 *   teaches the drag, and the camera has no glyph of its own.
 * - It comes back when the player seems stuck — no camera movement for a
 *   while, not shooting in a fight, eating blockable hits — and the "?"
 *   button brings the core set back on demand.
 * - One input per glyph. "Shift or right-click" was read as Shift+right-click,
 *   which Firefox answers with its own context menu, uncancellably.
 * - A scene lesson (`lessons.ts`) quiets everything but survival — and the
 *   thumbs: moving and looking are never silenced, not even on the first
 *   frame with the training drone in view.
 *
 * Pure bookkeeping: the mission reports successes (`use`) and context, the HUD
 * reads `views()`.
 */

export type HintId =
  | 'move' | 'look' | 'walk' | 'fire' | 'charge' | 'block' | 'parry' | 'slide' | 'tank' | 'weapon' | 'interact'
export type InputFamily = 'touch' | 'mouse'

interface HintDef {
  /** Successes that retire the glyph for good (per input family). */
  goal: number
  /** Higher shows first when too many compete. */
  priority: number
}

export const HINTS: Record<HintId, HintDef> = {
  slide: { goal: 2, priority: 9 },
  block: { goal: 2, priority: 8 },
  parry: { goal: 2, priority: 7 },
  tank: { goal: 1, priority: 7 },
  fire: { goal: 4, priority: 6 },
  charge: { goal: 2, priority: 6 },
  look: { goal: 3, priority: 5 },
  move: { goal: 3, priority: 5 },
  weapon: { goal: 2, priority: 4 },
  interact: { goal: 1, priority: 4 },
  walk: { goal: 2, priority: 2 }
}

/** At most this many glyphs at once; urgent ones win. Two: in the first
 *  fight, four glyphs at once (stick, camera, shoot, shield) were more than
 *  a new player could take in. */
const MAX_SHOWN = 2
/** A glyph lingers this long after its context passes, so it does not flicker. */
const LINGER = 3
/** Stuck detection. */
const LOOK_IDLE = 18
const MOVE_IDLE = 16
const FIRE_IDLE = 7
const MISSED_BLOCKS = 3
/** The "?" button shows the core set for up to this long. */
const HELP_HOLD = 25
/** The Repair Tank glyph comes in below this much health (a tank carried). */
const TANK_AT = 0.5
/** During a lesson only what keeps the player alive may compete with it. */
const SURVIVAL: ReadonlySet<HintId> = new Set(['block', 'parry', 'slide', 'tank', 'interact'])
/**
 * …and the thumbs: a lesson never silences moving and looking, and never
 * crowds them out. In the blind playtest a phone player with the training
 * drone in front of the pad saw only a finger on the drone, took the Slide
 * button for "walk", and never touched the stick in 142 turns.
 */
const THUMBS: ReadonlySet<HintId> = new Set(['move', 'look'])
/** What may show while a lesson has the player's eyes. */
const heard = (id: HintId, quiet: boolean): boolean => !quiet || SURVIVAL.has(id) || THUMBS.has(id)
/**
 * Glyphs a hand is never shown. On touch the camera has none: the ∞ finger
 * ("drag here, any way") stands for it, and a second finger swaying beside
 * it was one glyph too many. Looking still counts toward its progress; it
 * just never takes a slot, never comes back when idle, and gates nothing
 * (`walk`, the drone lesson) — nothing waits on a glyph that never shows.
 */
const UNTAUGHT: Record<InputFamily, ReadonlySet<HintId>> = { touch: new Set(['look']), mouse: new Set() }

export interface HintView {
  id: HintId
  family: InputFamily
  /** Successes so far toward `goal` (0..goal). */
  count: number
  goal: number
  /** Increments on every success: the HUD keys its green flash on it. */
  flash: number
  /** Just completed: show the check and fade. */
  done: boolean
  /** A lesson waits on it: drawn bigger and pulsing (the shield lesson). */
  urgent?: boolean
}

/** What the mission tells the coach every step. */
export interface CoachContext {
  time: number
  family: InputFamily
  playing: boolean
  combat: boolean
  /** An enemy is in the sights (shots would aim at it). */
  aimCandidate: boolean
  /** A blockable / an unblockable telegraph is winding up within reach. */
  teleBlock: boolean
  teleRed: boolean
  hp01: number
  tanks: number
  hasWeapon: boolean
  canInteract: boolean
  /** Past the tutorial mission: the "no shot in a fight" recall is off. On
   *  a platform stage a fight often has nothing in reach (a drone across a
   *  gap, a gun on another ledge), and the fire glyph kept coming back on
   *  Sky Docks for players who had fired a thousand shots. */
  veteran?: boolean
  /** A scene lesson (`lessons.ts`) is on screen: keep to survival glyphs
   *  (block, slide, tank) and the thumbs (move, look), and let the lesson
   *  have the player's attention. */
  quiet?: boolean
  /** The Repair Gel lesson owns the gel button (on, or about to come on
   *  after the tutorial's trap): the tank glyph stands aside — two glyphs on
   *  one button read as two different things to do. */
  gelLesson?: boolean
  /** The tutorial's shield lesson is on (`Walkthrough.blockPending`): the
   *  block glyph stays up, emphasised, until a block lands — not only while
   *  a ring winds up, which on a diving drone is gone before it is read. */
  blockLesson?: boolean
  /** A lesson that is about shooting is running (the charge shot, the crate
   *  and the chest): the only time a "stuck" shoot glyph comes back. In a
   *  plain fight it pointed at nothing to hit, or at what the player already
   *  knew. */
  fireLesson?: boolean
  /** The tutorial: it has lessons for shooting, so the shoot glyphs keep to
   *  them (taught or recalled) and never point at a plain fight's drones. */
  lessonsTeach?: boolean
}

interface HintState {
  /** Successes counted during the current showing. */
  count: number
  /** Successes still needed for a recall to retire (0 = not recalled). */
  recall: number
  wantedUntil: number
  flash: number
  doneAt: number
  shown: boolean
}

const key = (id: HintId, family: InputFamily): string => `hint:${id}:${family}`

/** Persisted successes for a glyph (monotonic). */
export const hintProgress = (id: HintId, family: InputFamily): number => {
  const v = profile.tips[key(id, family)]
  return typeof v === 'number' ? v : 0
}

export class Coach {
  private st = {} as Record<HintId, HintState>
  private family: InputFamily = 'mouse'
  private now = 0
  private lastLook = 0
  private lastMove = 0
  private lastFire = 0
  private missedBlocks: number[] = []
  private helpUntil = -1
  private lookAcc = 0
  private moveAcc = 0
  private quiet = false
  private blockLesson = false

  constructor() {
    for (const id of Object.keys(HINTS) as HintId[]) {
      this.st[id] = { count: 0, recall: 0, wantedUntil: -1, flash: 0, doneAt: -1, shown: false }
    }
  }

  mastered(id: HintId, family = this.family): boolean {
    return hintProgress(id, family) >= HINTS[id].goal
  }

  /** Does this hand get the glyph at all? (Not `look` on touch.) */
  teaches(id: HintId, family = this.family): boolean {
    return !UNTAUGHT[family].has(id)
  }

  /** Nothing left to teach on this hand: mastered, or never taught here.
   *  What anything waiting on a glyph (the next glyph, a lesson) reads. */
  learned(id: HintId, family = this.family): boolean {
    return !this.teaches(id, family) || this.mastered(id, family)
  }

  /** May the glyph show now: taught on this hand, and not hushed by a lesson. */
  private open(id: HintId): boolean {
    return this.teaches(id) && heard(id, this.quiet)
  }

  /** The player just did it. */
  use(id: HintId): void {
    const s = this.st[id]
    if (id === 'look') this.lastLook = this.now
    if (id === 'move') this.lastMove = this.now
    if (id === 'fire' || id === 'charge') this.lastFire = this.now
    if (id === 'block' || id === 'parry') this.missedBlocks.length = 0
    const k = key(id, this.family)
    const stored = hintProgress(id, this.family)
    if (stored < HINTS[id].goal) {
      profile.tips[k] = stored + 1
      // Persist now: the mission only checkpoints on kills, chests and doors,
      // so a reload before the first one brought a learned glyph back.
      // Bounded by each hint's goal, so a handful of saves per glyph.
      saveProfile()
    }
    if (!s.shown) {
      if (s.recall > 0) s.recall--
      return
    }
    s.count++
    s.flash++
    if (s.recall > 0) s.recall--
    const retired = this.mastered(id) && s.recall === 0
    if (retired && s.doneAt < 0) {
      s.doneAt = this.now
      // Drop the linger window, or the glyph pops back once its check fades.
      s.wantedUntil = -1
    }
  }

  /** A lesson taught it outright (the charge lesson: shooting and charging):
   *  learned for good on this hand, its glyph retired at once. */
  master(id: HintId): void {
    const k = key(id, this.family)
    if (hintProgress(id, this.family) < HINTS[id].goal) {
      profile.tips[k] = HINTS[id].goal
      saveProfile()
    }
    const s = this.st[id]
    s.recall = 0
    s.wantedUntil = -1
    if (s.shown && s.doneAt < 0) s.doneAt = this.now
    if (id === 'fire' || id === 'charge') this.lastFire = this.now
  }

  /** Camera turned by `rad` (drag or keys): every 35° counts as one use. */
  looked(rad: number): void {
    this.lastLook = this.now
    this.lookAcc += Math.abs(rad)
    while (this.lookAcc >= 0.6) {
      this.lookAcc -= 0.6
      this.use('look')
    }
  }

  /** Walked `m` metres under the player's own control: every 2.5 m is a use. */
  moved(m: number): void {
    this.lastMove = this.now
    this.moveAcc += m
    while (this.moveAcc >= 2.5) {
      this.moveAcc -= 2.5
      this.use('move')
    }
  }

  /** A blockable hit landed. Three in a row without a block recall the shield. */
  blockableHit(): void {
    this.missedBlocks.push(this.now)
    this.missedBlocks = this.missedBlocks.filter(t => this.now - t < 20)
    if (this.missedBlocks.length >= MISSED_BLOCKS) {
      this.recall('block')
      this.missedBlocks.length = 0
    }
  }

  /** A shot bounced off a guard: time to learn the charge shot. */
  deflected(): void {
    if (!this.mastered('charge')) this.st.charge.wantedUntil = this.now + 8
  }

  /** The "?" button: the core set, until each is used once more. */
  help(): void {
    this.helpUntil = this.now + HELP_HOLD
    for (const id of ['move', 'look', 'fire', 'block', 'slide'] as HintId[]) this.recall(id)
  }

  private recall(id: HintId): void {
    if (!this.teaches(id)) return
    const s = this.st[id]
    s.recall = Math.max(s.recall, 1)
    s.doneAt = -1
  }

  update(c: CoachContext): void {
    this.now = c.time
    if (c.family !== this.family) {
      // A different hand on a different device: its own progress, fresh views.
      this.family = c.family
      for (const s of Object.values(this.st)) { s.count = 0; s.shown = false; s.doneAt = -1 }
    }
    this.quiet = !!c.quiet
    if (!c.playing) return
    const t = c.time
    const want = (id: HintId, on: boolean): void => {
      if (on && this.open(id)) this.st[id].wantedUntil = t + LINGER
    }
    // Untaught counts as learned: on touch `look` is never fresh, so `walk`
    // follows the stick alone.
    const fresh = (id: HintId): boolean => !this.learned(id)
    // Movement and camera from the first moment of control, together: a
    // player who never finds the camera is stuck in the first corridor.
    // (On touch, movement alone: the ∞ finger covers both.)
    want('move', fresh('move'))
    want('look', fresh('look'))
    want('walk', !c.combat && !fresh('move') && !fresh('look') && fresh('walk'))
    const shootTime = !c.lessonsTeach || !!c.fireLesson
    want('fire', (c.combat || c.aimCandidate) && fresh('fire') && shootTime)
    want('charge', c.combat && !fresh('fire') && fresh('charge'))
    this.blockLesson = !!c.blockLesson
    want('block', (c.teleBlock && fresh('block')) || this.blockLesson)
    want('parry', c.teleBlock && !fresh('block') && fresh('parry'))
    want('slide', c.teleRed && fresh('slide'))
    // No linger either: the lesson's glyph takes over at once.
    if (c.gelLesson) this.st.tank.wantedUntil = -1
    want('tank', !c.gelLesson && c.hp01 < TANK_AT && c.tanks > 0 && fresh('tank'))
    want('weapon', c.hasWeapon && c.combat && fresh('weapon'))
    want('interact', c.canInteract && fresh('interact'))
    // Stuck: bring the glyph back until the player does it once more. Moving
    // and looking are watched through a lesson too — a player frozen in front
    // of the training drone is exactly the one who needs the stick again.
    if (t > 6) {
      if (t - this.lastLook > LOOK_IDLE && !c.combat) this.recall('look')
      if (t - this.lastMove > MOVE_IDLE && !c.combat) this.recall('move')
      // Never for a player who has shot enough already: the glyph came back
      // in every fight of the tutorial once he paused to dodge or block.
      if ((c.fireLesson || (c.combat && !c.lessonsTeach)) && !this.quiet && !c.veteran && !this.mastered('fire') && t - this.lastFire > FIRE_IDLE) this.recall('fire')
    }
    for (const id of Object.keys(this.st) as HintId[]) {
      const s = this.st[id]
      // A recall shows only while it can be acted on: the shield and slide
      // under a wind-up, shooting in a fight or with something to shoot at
      // (a recalled shoot glyph stayed up over an empty corridor).
      const now = id === 'block' || id === 'slide' ? c.teleBlock || c.teleRed
        : id === 'fire' || id === 'charge' ? (c.combat || c.aimCandidate) && shootTime
          : true
      if (s.recall > 0 && this.open(id) && (now || t < this.helpUntil)) {
        s.wantedUntil = Math.max(s.wantedUntil, t + 0.5)
      }
    }
  }

  /** What to draw, most urgent first, at most MAX_SHOWN (plus fading checks). */
  views(): HintView[] {
    const t = this.now
    const live: HintId[] = []
    for (const id of Object.keys(this.st) as HintId[]) {
      const s = this.st[id]
      const fading = s.doneAt >= 0 && t - s.doneAt < 0.9
      // A lesson in focus clears the stage at once, lingering glyphs too.
      // An untaught glyph still lingering from the other hand drops too.
      const wanted = s.wantedUntil > t && (s.doneAt < 0) && this.open(id)
      if (wanted || fading) live.push(id)
      else {
        s.shown = false
        s.count = 0
        if (s.doneAt >= 0 && t - s.doneAt >= 0.9) s.doneAt = -1
      }
    }
    live.sort((a, b) => HINTS[b].priority - HINTS[a].priority)
    // A lesson on screen counts as one of the two — but not against the
    // thumbs: the stick and the camera glyphs sit where the thumbs are, well
    // away from the lesson's card, and are never the ones left out.
    let room = this.quiet ? MAX_SHOWN - 1 : MAX_SHOWN
    const shown: HintId[] = []
    for (const id of live) {
      if (this.quiet && THUMBS.has(id)) shown.push(id)
      else if (room > 0) {
        shown.push(id)
        room--
      }
    }
    return shown.map((id) => {
      const s = this.st[id]
      if (!s.shown) {
        s.shown = true
        // A recall of something mastered asks for fresh proof; otherwise the
        // pips resume from what was already done.
        s.count = s.recall > 0 && this.mastered(id) ? 0 : Math.min(hintProgress(id, this.family), HINTS[id].goal)
      }
      const goal = s.recall > 0 && this.mastered(id) ? Math.max(1, s.count + s.recall) : HINTS[id].goal
      const urgent = id === 'block' && this.blockLesson && s.doneAt < 0
      return { id, family: this.family, count: Math.min(s.count, goal), goal, flash: s.flash, done: s.doneAt >= 0, urgent }
    })
  }
}
