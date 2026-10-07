// @vitest-environment jsdom
// #130: the special weapon lessons were not obvious on phones and tablets.
// The weapon lesson points three yellow arrows at the slot to press, and
// every lesson hologram wears the input it presses over its head: the key
// on a desktop, the HUD button itself on touch.

import { describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import en from '@/i18n/locales/en'
import { hud } from '@/game/state/hud'
import ActionButtons from '@/components/hud/ActionButtons.vue'
import LessonGlyph from '@/components/hud/LessonGlyph.vue'

vi.mock('@/game/boot', () => ({ input: { device: 'touch', slideQueued: false } }))

const i18n = () => createI18n({ legacy: false, locale: 'en', messages: { en } })

describe('the weapon lesson on touch', () => {
  it('points yellow arrows at the slot the lesson wants', async () => {
    hud.phase = 'play'
    hud.device = 'touch'
    hud.weapons = [{ id: 'scrapBurst', ready: true, cost: 8, color: '#ffb13c' }, { id: null, ready: false, cost: 0, color: '' }] as unknown as typeof hud.weapons
    hud.lesson = { id: 'weapon', done: false, slot: 1 } as unknown as typeof hud.lesson
    const w = mount(ActionButtons, { global: { plugins: [i18n()] } })
    await nextTick()
    expect(w.find('.act.weapon.w0 .cue-arrows').exists()).toBe(true)
    hud.lesson = { id: 'weapon', done: true, slot: 1 } as unknown as typeof hud.lesson
    await nextTick()
    expect(w.find('.act.weapon.w0 .cue-arrows').exists()).toBe(false)
    hud.lesson = null
  })
})

describe('the hologram\'s input over its head', () => {
  it('is the HUD button on touch, the key or mouse on a desktop', async () => {
    hud.phase = 'play'
    hud.slideCue = false
    hud.holoAct = 'block'
    hud.device = 'touch'
    const w = mount(LessonGlyph)
    await nextTick()
    expect(w.find('.holo-btn.block').exists()).toBe(true)
    hud.device = 'mouse'
    await nextTick()
    expect(w.find('.holo-btn').exists()).toBe(false)
    expect(w.find('.glyph').exists()).toBe(true)
    // Walking on touch is the stick: its ∞ finger.
    hud.device = 'touch'
    hud.holoAct = 'move'
    await nextTick()
    expect(w.find('.holo-btn').exists()).toBe(false)
    expect(w.find('.glyph').exists()).toBe(true)
    hud.holoAct = ''
  })
})
