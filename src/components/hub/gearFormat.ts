import type { GameIconName } from '@/components/icons/iconNames'
import type { Affix, AffixId } from '@/game/data/items'
import type { StatKey } from '@/game/data/itemCompare'
import { formatPercent } from '@/utils/localeNumber'

export const SLOT_ICON: Record<string, GameIconName> = {
  buster: 'buster', helmet: 'helmet', chest: 'armor', boots: 'boots', chip: 'chip', chip1: 'chip', chip2: 'chip'
}

const PERCENT: AffixId[] = ['crit', 'critDmg', 'bolts', 'chargeSpeed', 'pelletDmg', 'chargeDmg', 'moveSpeed', 'special', 'regen', 'magnet']

/** "+12 max health", "+4.5% critical chance" — number formatted here, text
 *  translated (`affix.<id>` takes the signed value as `{v}`). */
export const formatAffix = (t: (k: string, p?: Record<string, unknown>) => string, a: Affix, locale = 'en'): string => {
  const pct = PERCENT.includes(a.id)
  const v = pct ? formatPercent(a.v, locale) : `${Math.round(a.v)}`
  return t(`affix.${a.id}`, { v: `+${v}` })
}

/** A stat CHANGE, signed: "+3 armor", "−2% critical chance". The main stats
 *  read as their affix twins (`affix.armor`, `affix.damage`). */
export const formatStatDelta = (t: (k: string, p?: Record<string, unknown>) => string, key: StatKey, delta: number, locale = 'en'): string => {
  const pct = PERCENT.includes(key as AffixId)
  const m = Math.abs(delta)
  const v = pct ? formatPercent(m, locale) : `${Math.round(m)}`
  return t(`affix.${key}`, { v: `${delta > 0 ? '+' : '−'}${v}` })
}
