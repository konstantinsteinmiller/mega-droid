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

/** A machine of a held room that stands outside it with every door between
 *  them shut (no walk to Flux) this long (s) is written off. */
export const STRANDED_AFTER = 4

/**
 * Hold-times for machines outside a held room that cannot reach Flux (a Stomper
 * that leapt over a shut door: the room can never be cleared, nor the machine
 * ever get back in). `update` takes this step's stranded machines and returns
 * those that have been so for STRANDED_AFTER; one that is reachable again
 * (or gone) starts over.
 */
export class StrandedClock {
  private since = new Map<Enemy, number>()

  update(now: number, stranded: readonly Enemy[]): Enemy[] {
    const out: Enemy[] = []
    for (const e of [...this.since.keys()]) if (!stranded.includes(e)) this.since.delete(e)
    for (const e of stranded) {
      const t0 = this.since.get(e)
      if (t0 === undefined) this.since.set(e, now)
      else if (now - t0 >= STRANDED_AFTER) out.push(e)
    }
    return out
  }

  clear(): void { this.since.clear() }
}
