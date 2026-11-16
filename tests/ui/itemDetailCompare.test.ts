// @vitest-environment jsdom
// The Armory's item card (#197): selecting another piece shows what the swap
// changes, every stat, gains in green first then losses in red — not just the
// main stat's arrow.

import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import en from '@/i18n/locales/en'
import ItemDetail from '@/components/hub/ItemDetail.vue'
import type { Item } from '@/game/data/items'

const item = (base: string, slot: Item['slot'], affixes: Item['affixes'] = []): Item =>
  ({ id: base, base, slot, rarity: 'tuned', ilvl: 3, upg: 0, affixes })

const card = (it: Item, compare?: Item | null) => mount(ItemDetail, {
  props: { item: it, compare },
  global: { plugins: [createI18n({ legacy: false, locale: 'en', fallbackLocale: 'en', messages: { en } })] }
})

describe('what switching changes', () => {
  it('lists every changed stat, gains first, with signs', () => {
    const worn = item('helm_ace', 'helmet', [{ id: 'hp', v: 4 }])
    const found = item('helm_guard', 'helmet', [{ id: 'hp', v: 10 }, { id: 'armor', v: 2 }])
    const w = card(found, worn)
    const chips = w.findAll('.deltas .chip')
    expect(chips.length).toBeGreaterThanOrEqual(2)
    const text = chips.map(c => c.text())
    expect(text.some(t => t.startsWith('+'))).toBe(true)
    // The crit the worn piece had is lost: shown as a loss, after the gains.
    const kinds = chips.map(c => (c.classes().includes('plus') ? 'plus' : 'minus'))
    expect(kinds.indexOf('minus')).toBeGreaterThan(kinds.lastIndexOf('plus'))
    expect(w.find('.vs').exists()).toBe(true)
  })

  it('shows nothing extra when there is nothing to compare with', () => {
    const w = card(item('helm_guard', 'helmet'), null)
    expect(w.find('.deltas').exists()).toBe(false)
    expect(w.find('.vs').exists()).toBe(false)
  })
})
