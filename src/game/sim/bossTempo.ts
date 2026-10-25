/**
 * ─── Boss tempo: a Core Master fight that ended too fast toughens the next ───
 *
 * (#191) How fast the last Core Master fell sets the next one's step:
 *
 * - under 15 s: step 2, +30% health and +15% damage;
 * - under 30 s: at least step 1, +15% health and +7% damage;
 * - within a minute: the step holds;
 * - longer: the step eases back by one.
 *
 * Dr. Vex and the Grand Master keep their own tuning: they never take a
 * step and never move it, nor does the tutorial's Core Master. Pure; pinned
 * by `tests/game/bossTempo.test.ts`.
 */

export const BOSS_TEMPO_HP = [1, 1.15, 1.3] as const
export const BOSS_TEMPO_DMG = [1, 1.07, 1.15] as const
export const BOSS_TEMPO_MAX = 2

/** The bosses outside the tempo. */
export const tempoExempt = (bossId: string | undefined): boolean => !bossId || bossId === 'vexMk1' || bossId === 'grandMaster'

/** The next step after a Core Master fell in `seconds` at step `step`. */
export const nextBossTempo = (step: number, seconds: number): number => {
  const s = Math.max(0, Math.min(BOSS_TEMPO_MAX, Math.round(step) || 0))
  if (seconds < 15) return 2
  if (seconds < 30) return Math.max(s, 1)
  if (seconds <= 60) return s
  return Math.max(0, s - 1)
}

export const bossTempoMul = (step: number): { hp: number; dmg: number } => {
  const s = Math.max(0, Math.min(BOSS_TEMPO_MAX, Math.round(step) || 0))
  return { hp: BOSS_TEMPO_HP[s], dmg: BOSS_TEMPO_DMG[s] }
}
