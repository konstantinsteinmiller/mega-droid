import { CHARGE_L2, PERFECT_DELAY, PERFECT_LEN } from './stats'

/**
 * ─── The charge show: the game fires the first charged shot itself ─────────
 *
 * Playtests (2026-10-07): players still did not get the charged shot from
 * the hologram and the glyph. So right after landing in the tutorial's start
 * room the game takes the buster once: the view turns onto the side training
 * drone, the fire input is HELD (the real input record — the real hum, glow
 * and rings) until the charge is full, let go in its sweet spot, and the
 * charged shot pops the drone. Meanwhile the HUD shows the input being held
 * (`hud.chargeShow`): the fire button with a finger down on a phone, the left
 * mouse button sinking on a desktop. The other drone is the player's.
 *
 * The timeline is pure (`ChargeShow.step`): tests pin its order and that the
 * release lands inside the full charge's perfect window.
 */

export type ChargeShowPhase = 'wait' | 'aim' | 'hold' | 'watch' | 'done'

/** After landing, a beat before the game takes the buster (s). */
export const SHOW_WAIT = 0.5
/** The view turns onto the drone over this long (s). */
export const SHOW_AIM = 0.6
/** After the release, the pop plays out before the hands come back (s). */
export const SHOW_WATCH = 1.1

/** How long the fire input is held: into the middle of the full charge's
 *  perfect window (at the charge-time multiplier and perfect-window scale). */
export const showHoldFor = (chargeTimeMul: number, perfectMul: number): number =>
  CHARGE_L2 * chargeTimeMul + PERFECT_DELAY + (PERFECT_LEN * perfectMul) / 2

export class ChargeShow {
  phase: ChargeShowPhase = 'wait'
  /** Seconds into the current phase. */
  t = 0
  /** This step is the release (fire let go). */
  release = false

  constructor(private readonly holdFor: number) {}

  /** The game holds the controls (not before it starts, not once done). */
  get active(): boolean {
    return this.phase === 'aim' || this.phase === 'hold' || this.phase === 'watch'
  }

  /** One step. */
  step(dt: number): ChargeShowPhase {
    this.release = false
    this.t += dt
    switch (this.phase) {
      case 'wait':
        if (this.t >= SHOW_WAIT) this.next('aim')
        break
      case 'aim':
        if (this.t >= SHOW_AIM) this.next('hold')
        break
      case 'hold':
        if (this.t >= this.holdFor) {
          this.release = true
          this.next('watch')
        }
        break
      case 'watch':
        if (this.t >= SHOW_WATCH) this.next('done')
        break
    }
    return this.phase
  }

  /** Called off (the drone gone another way, a cutscene): hands back now. */
  stop(): void {
    this.phase = 'done'
    this.release = false
  }

  private next(p: ChargeShowPhase): void {
    this.phase = p
    this.t = 0
  }
}
