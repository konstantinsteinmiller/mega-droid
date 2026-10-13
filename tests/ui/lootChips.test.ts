// @vitest-environment jsdom
// ─── The loot card's stat chips say what they measure (#158) ────────────────
//
// From a playtest: a found helmet headlined "−28 armour" in red, read as the
// item's own armour being negative, and a nameless "+1" chip wrapped onto a
// row of its own. The chips are the change against the equipped piece: the
// card says so, gains lead, and the "+n more" chip is named and rides on the
// last chip's row.

import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import en from '@/i18n/locales/en'
import { profile } from '@/game/state/profile'
import type { Item } from '@/game/data/items'
import LootCompare from '@/components/molecules/LootCompare.vue'

const item = (over: Partial<Item>): Item => ({
  id: 'x', base: 'helm_scout', slot: 'helmet', rarity: 'standard', ilvl: 1, upg: 0, affixes: [], ...over
})

const render = (it: Item) => mount(LootCompare, {
  props: { item: it, compact: true },
  global: { plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })] }
})

describe('the loot card chips', () => {
  const worn = item({ id: 'worn-helm', ilvl: 12 })
  profile.inv.items.push(worn)
  profile.inv.equipped.helmet = worn.id

  it('are labelled as the change against the equipped piece, gains first', () => {
    const w = render(item({ id: 'found-1', ilvl: 2, affixes: [{ id: 'hp', v: 4 }, { id: 'we', v: 1 }] }))
    expect(w.find('.l-vs').text()).toBe('vs equipped')
    const chips = w.findAll('.chip')
    expect(chips[0]!.classes()).toContain('plus')
    expect(chips.at(-1)!.classes()).toContain('minus')
    expect(chips.at(-1)!.text()).toMatch(/armou?r/i)
  })

  it('never leave a nameless "+1": one line over the cap is shown', () => {
    const w = render(item({ id: 'found-2', ilvl: 2, affixes: [{ id: 'hp', v: 4 }, { id: 'we', v: 1 }, { id: 'crit', v: 0.02 }] }))
    expect(w.findAll('.chip')).toHaveLength(4)
    expect(w.find('.more').exists()).toBe(false)
  })

  it('name the rest "+n more", on the last chip\'s row', () => {
    const w = render(item({ id: 'found-3', ilvl: 2, affixes: [{ id: 'hp', v: 4 }, { id: 'we', v: 1 }, { id: 'crit', v: 0.02 }, { id: 'bolts', v: 0.05 }] }))
    const more = w.find('.more')
    expect(more.text()).toBe('+2 more')
    const tail = w.findAll('li').at(-1)!
    expect(tail.findAll('.chip')).toHaveLength(2)
    expect(tail.find('.more').exists()).toBe(true)
  })
})
