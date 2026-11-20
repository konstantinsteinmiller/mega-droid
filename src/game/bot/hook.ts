/**
 * ─── The autopilot's seam into the mission ──────────────────────────────────
 *
 * `Mission.update` calls the driver (when one is installed) before it reads
 * the player's input, so the bot's presses are this step's presses. The bot
 * itself lives in its own chunk (`bot/index.ts`, `game/lazy.ts`) and installs
 * itself here when it is switched on; a build or a session that never turns
 * it on pays for this file only.
 */
export interface BotDriver {
  /** One mission step. `first` is true on the first sub-step of a frame (the
   *  one that consumes the input's edges). */
  drive(mission: unknown, dt: number, first: boolean): void
}

export const botHook: { driver: BotDriver | null } = { driver: null }
