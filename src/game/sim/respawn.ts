import { BANNER_HOLD } from '../state/banner'

/**
 * ─── Down, and back (#105) ───────────────────────────────────────────────────
 *
 * Flux goes down: the GAME OVER banner, then the defeat modal (a gel, a
 * rewarded reboot, retreat). Nothing chosen within RESPAWN_AFTER of the fall,
 * his body sinks into the floor over SINK_S and he comes back at the last
 * checkpoint (`Mission.respawnAtCheckpoint`) — the level goes on.
 */

/** The defeat modal waits this long after the fall (s): the banner reads first. */
export const DEFEAT_DELAY = Math.max(1.4, BANNER_HOLD.gameOver)
/** From the fall to the sink (s). */
export const RESPAWN_AFTER = 10
/** The sink into the floor (s). */
export const SINK_S = 2
