/**
 * ─── Training: show, then train (the lesson rooms' running order) ────────────
 *
 * Playtests of the first mission: players walked past the training drone,
 * shot it with quick shots forever, never found the charged shot, never
 * blocked, never slid. Glyphs alone did not teach a MECHANIC. Then players
 * skipped the cards' text and the one-time first-person demo was over before
 * it made sense. So every lesson room has a hologram doing the move on a loop
 * (`fx/lessonHologram.ts`, for as long as Flux is in the room) and runs two
 * beats:
 *
 *   intro  (the charge lesson waits for a first step toward its drones,
 *          `steppedToward`) Atlas flies in with a gold bubble — "Let's train
 *          the Charge Shot" —
 *          while a gold vignette and the room's label ("Charge Shot Tutorial")
 *          say: this is a training room;
 *   try    the player's turn (a move made during the intro counts too). The
 *          room's door opens once it is done (`walkthrough.ts`); stuck for
 *          HELP_AFTER, Atlas gives a hint, and again every HELP_AFTER.
 *
 * Done lessons tick off the checklist and are remembered per profile, so a
 * replay of the mission does not teach them twice. Pure bookkeeping over a
 * small host; `tests/game/training.test.ts` pins the order.
 */

export type TrainId = 'charge' | 'block' | 'slide' | 'gel' | 'gap' | 'weapon'
export type TrainPhase = 'off' | 'intro' | 'try' | 'done'

/** The tutorial's lessons, in the order the checklist lists them. */
export const TUTORIAL_TRAINING: readonly TrainId[] = ['charge', 'block', 'gap', 'slide', 'gel']

/** The charge lesson starts once Flux is this much closer to its drones than
 *  his pad is (m): one step. He has his bearings before time stops for the card. */
export const CHARGE_STEP = 1

interface XZ { readonly x: number; readonly z: number }
/** `now` is at least `step` closer to `target` than `from` is. */
export const steppedToward = (target: XZ, from: XZ, now: XZ, step = CHARGE_STEP): boolean =>
  Math.hypot(target.x - now.x, target.z - now.z) <= Math.hypot(target.x - from.x, target.z - from.z) - step

/** Atlas's intro holds this long before the player's turn (s). */
export const INTRO_FOR = 1.8
/** No progress in the try phase this long (s): a hint, and again after as long. */
export const HELP_AFTER = 30

export interface TrainHost {
  /** Atlas's gold intro line (`train.<id>`) and its hints (`help.<id>`). */
  say(line: `train.${TrainId}` | `help.${TrainId}`): void
}

export class Training {
  /** The lesson running (its room entered), or null. */
  id: TrainId | null = null
  phase: TrainPhase = 'off'
  /** Lessons done (profile-persisted by the mission). */
  readonly done = new Set<TrainId>()
  /** The time the current phase began. */
  private at = 0
  private helpAt = Infinity
  /** Hints given in this lesson (the HUD can escalate its glyph). */
  helps = 0

  constructor(private readonly host: TrainHost) {}

  /** Flux entered `id`'s room. A lesson already done only shows its tick. */
  enter(id: TrainId, now: number): void {
    if (this.id === id) return
    this.id = id
    this.helps = 0
    this.helpAt = Infinity
    this.at = now
    if (this.done.has(id)) {
      this.phase = 'done'
      return
    }
    this.phase = 'intro'
    this.host.say(`train.${id}`)
  }

  /** Flux left the room (the vignette and label go; a lesson not yet done
   *  starts over from its intro when he comes back). */
  leave(): void {
    this.id = null
    this.phase = 'off'
    this.helpAt = Infinity
  }

  /** One step. `playing`: live play (no modal, no cutscene). */
  update(now: number, playing: boolean): void {
    if (!this.id || !playing) return
    switch (this.phase) {
      case 'intro':
        if (now - this.at >= INTRO_FOR) this.toTry(now)
        break
      case 'try':
        if (now >= this.helpAt) {
          this.helps++
          this.helpAt = now + HELP_AFTER
          this.host.say(`help.${this.id}`)
        }
        break
    }
  }

  /**
   * Does the move count for lesson `id` right now? Only made IN the lesson
   * (its intro or the try; or by a player who learned it on an earlier run).
   * For the lessons a room is built around: a slide in an earlier room used
   * to tick the slide lesson off, so the Stomper yard found it done — nothing
   * shown — and the one move nobody had explained was the one the room needs.
   */
  counts(id: TrainId): boolean {
    return this.done.has(id) || (this.id === id && (this.phase === 'intro' || this.phase === 'try'))
  }

  /** The player did it: the lesson ticks off. Also for a lesson done before
   *  its room was reached (a charged shot fired on the way). */
  complete(id: TrainId): void {
    this.done.add(id)
    if (this.id === id) {
      this.phase = 'done'
      this.helpAt = Infinity
    }
  }

  private toTry(now: number): void {
    this.phase = 'try'
    this.at = now
    this.helpAt = now + HELP_AFTER
  }
}
