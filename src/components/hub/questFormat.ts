import type { GameIconName } from '@/components/icons/iconNames'
import type { Quest, QuestTemplate } from '@/game/data/quests'
import { SECTOR_BY_ID } from '@/game/data/regions'

/** Each mission type's glyph: its card, and its pad's label in the hall. */
export const QUEST_ICON: Record<QuestTemplate, GameIconName> = {
  tutorial: 'star', boss: 'skull', kill: 'bomb', collect: 'gem', rescue: 'heart', elite: 'trophy', supply: 'chest', purge: 'flame',
  climb: 'up', stage: 'rocket'
}

/** A mission's title, as its card heads it. */
export const questTitle = (t: (k: string, p?: Record<string, unknown>) => string, q: Quest): string => {
  if (q.kind === 'story' && q.template === 'boss') return t('quest.bossTitle', { boss: t(`boss.${SECTOR_BY_ID[q.sector].boss}`) })
  if (q.template === 'stage') return t(`quest.stageName.${q.sector}`)
  return t(`quest.${q.template}`)
}
