import type { MapData } from '../world/levelGen'
import type { Enemy } from './world'
import { roomAt } from './lessons'

/**
 * ─── Locked rooms never softlock ────────────────────────────────────────────
 *
 * A room held shut until its machines are down (a mini-boss hall, the weapon
 * lesson behind a boss) must never wait on one nobody can reach. Playtest
 * 2026-10-20 (Blaze): the weapon lesson put a drone back through the doorway
 * it was started on, the door shut behind Flux, and the beam-out pedestal
 * stayed dark with the drone hovering behind it. The rules here are the
 * mission's safety net; `LessonDirector` leashes its own drones the same way.
 */

/** The exit room's lesson may have nothing to shoot this long (s) before the
 *  pedestal lights anyway (a buster try brings the drones back in 1.5 s). */
export const EXIT_STALL = 6

/** The weapon lesson in the beam-out room has had nothing to shoot since
 *  `idleFrom` (-1: it has) for EXIT_STALL: light the pedestal. */
export const exitStalled = (idleFrom: number, time: number): boolean =>
  idleFrom >= 0 && time - idleFrom >= EXIT_STALL

/**
 * Machines a held room counts that stand outside it, while Flux is in that
 * room (`here`): the ones to beam back. Dead, offstage and sleeping-crate
 * machines never count.
 */
export const strayGuards = (
  map: MapData, enemies: readonly Enemy[], held: ReadonlyArray<{ room: number }>, here: number
): Enemy[] => {
  const out: Enemy[] = []
  if (here < 0 || !held.some(g => g.room === here)) return out
  for (const e of enemies) {
    if (e.room !== here || e.state === 'dead' || e.offstage || e.boss || e.dormant) continue
    if (roomAt(map, e.x, e.z) !== here) out.push(e)
  }
  return out
}
