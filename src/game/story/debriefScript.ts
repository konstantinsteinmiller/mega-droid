import { SECTORS } from '../data/regions'
import type { SectorId } from '../world/themes'
import type { Beat } from './vexScene'
import { copiedWeapon, hubSceneFor } from './vexScenes'

/**
 * ─── The debrief: the story between two missions (#119) ──────────────────────
 *
 * After a Core Master's first fall, before the Lab: the city from above (the
 * intro's valley), and Pip — voiced now — tells it in short lines. What the
 * win changed, the weapon Flux copied, Vex's reaction on the Spire's screens,
 * then the next sector, its Master, what it has done there and how to beat
 * it. About 25 s, a tap moves on a line, Skip ends it.
 *
 * It is the game's main storytelling, so it must not drag: five Pip lines and
 * a goodbye, one Vex beat. Vex's beat is the Lab scene that Master already
 * had (`hubSceneFor`: his broadcast, or the blueprint, the reserve, the
 * breach), moved here so the story arrives in one piece; it counts as seen.
 *
 * Pure data: the mode (`story/debrief.ts`) plays it, `DebriefLayer.vue` shows
 * the cards. Lines are voice catalog keys = i18n keys:
 * `pip.debrief.<sector just freed>.<won|weapon|next|boss|tip>`.
 */

export type DebriefStage = '' | 'city' | 'weapon' | 'vex' | 'next'

export interface DebriefPlan {
  /** The Master that fell, and its sector. */
  boss: string
  from: SectorId
  /** Where the story goes next, and who waits there. */
  to: SectorId
  toBoss: string
  /** The weapon copied from the fallen Master (its line and card), if any. */
  weapon: string | null
}

/** The debrief a fallen Master earns: every Master with a sector after it (Vex's fall has the ending). */
export const debriefFor = (bossId: string): DebriefPlan | null => {
  const from = SECTORS.find(s => s.boss === bossId)
  const to = from && SECTORS.find(s => s.after === from.id)
  if (!from || !to) return null
  return { boss: bossId, from: from.id, to: to.id, toBoss: to.boss, weapon: copiedWeapon(bossId) }
}

/** Its seen flag (`profile.world.seen`): once per run (`startNewGamePlus` clears it, so New Game+ tells the story again). */
export const debriefSeen = (bossId: string): string => `debrief:${bossId}`

/**
 * The beats. `stage` moves the picture (the camera and the cards follow the
 * lines, never a fixed timeline); `hello` adds Pip's welcome (the first
 * debrief only).
 */
export const debriefBeats = (p: DebriefPlan, stage: (s: DebriefStage) => () => void, hello: boolean): Beat[] => {
  const k = `pip.debrief.${p.from}`
  const vex = hubSceneFor(p.boss)
  return [
    { call: stage('city') },
    { wait: 1.2 },
    ...(hello ? [{ pip: 'pip.debrief.hello', gap: 0.3 }] : []),
    { pip: `${k}.won`, gap: 0.4 },
    ...(p.weapon ? [
      { call: stage('weapon') },
      { pip: `${k}.weapon`, params: { weapon: `weapon.${p.weapon}.name` }, gap: 0.5 }
    ] : []),
    ...(vex ? [{ call: stage('vex') }, { wait: 0.5 }, ...vex.beats] : []),
    { call: stage('next') },
    { wait: 0.9 },
    { pip: `${k}.next`, params: { sector: `sector.${p.to}` }, gap: 0.3 },
    { pip: `${k}.boss`, params: { boss: `boss.${p.toBoss}` }, gap: 0.3 },
    { pip: `${k}.tip`, gap: 0.4 },
    { pip: 'pip.debrief.go', gap: 0.5 }
  ]
}
