import type { GmState } from './grandMaster'

/**
 * What holds the beam-out (B, the button) back, and what the player is told
 * when it does (#159: B was silently dead while the weapon lesson was open;
 * #150: after the Grand Master it was refused with nothing to fight). Pure,
 * so the rule is testable without a mission.
 */
export interface BeamState {
  /** The mission's objective itself (Vex down, the cores in, …). */
  objectiveDone: boolean
  /** The Fortress finale's Grand Master, when the mission has one. */
  finale: GmState | null
  /** The boss's copied weapon, while its lesson is still owed (else ''). */
  weaponOwed: string
  /** Machines still fighting in reach (`hud.combat`). */
  combat: boolean
}

/** A refusal: the toast's i18n key and its params. */
export interface BeamRefusal {
  key: string
  params?: Record<string, string>
}

/** Why B does not beam out now, or null when it does. Every reason is said. */
export const beamRefusal = (s: BeamState): BeamRefusal | null => {
  if (!s.objectiveDone) return { key: 'combat.beamNotYet' }
  // Vex down is not the end while the Grand Master still stands.
  if (s.finale && s.finale !== 'done') return { key: 'combat.beamGrandMaster', params: { boss: 'boss.grandMaster' } }
  if (s.weaponOwed) return { key: 'combat.beamLesson', params: { weapon: `weapon.${s.weaponOwed}.name` } }
  if (s.combat) return { key: 'combat.beamFight' }
  return null
}

/** The Grand Master is up (waking, fighting, falling): the objective names it. */
export const grandMasterUp = (finale: GmState | null): boolean =>
  finale === 'intro' || finale === 'fight' || finale === 'dying'

/**
 * A machine on the far side of the sealed boss shutter, while Flux is inside
 * the arena (#150): a chaser left in the corridor can never reach him, so it
 * makes no fight — it held the beam-out back for good after the Grand Master.
 */
export const shutOut = (sealed: boolean, arena: readonly number[], playerRoom: number, enemyRoom: number): boolean =>
  sealed && arena.includes(playerRoom) && !arena.includes(enemyRoom)
