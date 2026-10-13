import { BASE_BY_ID, itemPower, mainStat, type AffixId, type Item } from './items'

/**
 * ─── Is it an upgrade? ───────────────────────────────────────────────────────
 *
 * A found item next to what it would replace: every stat it changes, up or
 * down, and one verdict. The loot card (`LootCard.vue`) and the results screen
 * show it, so "a Tuned Plated Chest" becomes "+3 armour, +8 max health, −2 %
 * crit: an upgrade" without a trip to the workshop.
 *
 * The rival is the piece in the item's slot; for a chip, the weaker of the two
 * sockets — or nothing, while a socket is free (filling it is always better).
 * The verdict is `itemPower`, the same rating the workshop sorts by.
 */

/** The main stat (damage on a buster, armour on armour) or an affix. */
export type StatKey = 'damage' | 'armor' | AffixId

export interface StatLine {
  key: StatKey
  /** New minus old: + an increase, − a decrease. */
  delta: number
}

export interface Comparison {
  /** What it is measured against (null: an empty slot). */
  vs: Item | null
  upgrade: boolean
  /** Every stat that changes; the main stat first, then the new item's own. */
  lines: StatLine[]
}

/** Every stat an item gives, summed per stat (implicit and rolled affixes). */
export const itemStats = (it: Item | null): Map<StatKey, number> => {
  const m = new Map<StatKey, number>()
  if (!it) return m
  if (it.slot !== 'chip') m.set(it.slot === 'buster' ? 'damage' : 'armor', mainStat(it))
  const add = (k: StatKey, v: number) => m.set(k, (m.get(k) ?? 0) + v)
  const imp = BASE_BY_ID[it.base]?.implicit
  if (imp) add(imp.id, imp.v)
  for (const a of it.affixes) add(a.id, a.v)
  return m
}

/** Changes smaller than this are rounding, not a difference. */
const EPS = 1e-4

/** `it` against `vs` (pure). */
export const compareItems = (it: Item, vs: Item | null): Comparison => {
  const a = itemStats(it)
  const b = itemStats(vs)
  const keys: StatKey[] = [...a.keys()]
  for (const k of b.keys()) if (!keys.includes(k)) keys.push(k)
  const lines: StatLine[] = []
  for (const key of keys) {
    const delta = (a.get(key) ?? 0) - (b.get(key) ?? 0)
    if (Math.abs(delta) > EPS) lines.push({ key, delta })
  }
  return { vs, upgrade: !vs || itemPower(it) > itemPower(vs), lines }
}

/** The piece a found item would replace, from what is equipped. */
export const rivalFor = (it: Item, equipped: (slot: 'buster' | 'helmet' | 'chest' | 'boots' | 'chip1' | 'chip2') => Item | null): Item | null => {
  if (it.slot !== 'chip') return equipped(it.slot)
  const c1 = equipped('chip1')
  const c2 = equipped('chip2')
  if (!c1 || !c2) return null
  return itemPower(c1) <= itemPower(c2) ? c1 : c2
}

export interface DeltaChips {
  /** The lines shown as chips: the gains first, then the losses. */
  shown: StatLine[]
  /** The lines left out ("+n more"; the workshop has them all). */
  hidden: number
}

/**
 * The comparison as at most `cap` chips (#158). Gains lead: a weaker main
 * stat first in red read as the item's own stat being negative. A single
 * line over the cap is shown rather than hidden — a "+1 more" chip takes
 * the room of the line it stands for.
 */
export const deltaChips = (c: Comparison, cap: number): DeltaChips => {
  const lines = [...c.lines.filter(l => l.delta > 0), ...c.lines.filter(l => l.delta < 0)]
  if (lines.length <= cap + 1) return { shown: lines, hidden: 0 }
  return { shown: lines.slice(0, cap), hidden: lines.length - cap }
}
