// @vitest-environment jsdom
// ─── HUD celebrations: the Hard Hat's level-up, Atlas's checkmark ───────────
//
// A level-up and a finished objective each get a short act (`state/celebrate`):
// one at a time, queued in order, its sting played as it starts, a fade under
// reduced motion, and nothing left over once it ends or the HUD goes.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createI18n } from 'vue-i18n'
import en from '@/i18n/locales/en'
import { hud, hudEvents, pushHud, tickHud } from '@/game/state/hud'
import {
  CELEBRATION_MS, CELEBRATION_REDUCED_MS, celebrationPending, celebrations,
  finishCelebration, pushCelebration, resetCelebrations
} from '@/game/state/celebrate'
import { sfx } from '@/game/audio/sfx'
import LevelUpPop from '@/components/hud/LevelUpPop.vue'
import { BUBBLE_AVOID, ZONE_GAP, zones } from '@/components/hud/hudLayout'
import ObjectiveTracker from '@/components/hud/ObjectiveTracker.vue'
import FloatingText from '@/components/hud/FloatingText.vue'

vi.mock('@/game/audio/sfx', () => ({ sfx: vi.fn() }))
vi.mock('@/game/boot', () => ({ currentMission: () => null }))
vi.mock('@/game/flow', async () => {
  const { reactive } = await import('vue')
  return { flow: reactive({ quest: null }) }
})
vi.mock('@/game/models/portrait', () => ({
  bossPortrait: vi.fn(async () => null),
  cachedBossPortrait: vi.fn(() => null)
}))

const i18n = () => createI18n({ legacy: false, locale: 'en', messages: { en } })
const reduceMotion = (on: boolean) => {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: on && q.includes('reduce') }))
}

enableAutoUnmount(afterEach)
beforeEach(() => {
  vi.useFakeTimers()
  vi.mocked(sfx).mockClear()
  reduceMotion(false)
  resetCelebrations()
})
afterEach(() => {
  resetCelebrations()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  hud.objectiveKey = ''
  hud.objectiveDone = false
})

describe('the queue', () => {
  it('plays one act at a time, in order, each sting as it starts', () => {
    pushCelebration('levelUp')
    pushCelebration('objective')
    expect(celebrations.current?.kind).toBe('levelUp')
    expect(celebrations.queue.map(c => c.kind)).toEqual(['objective'])
    expect(vi.mocked(sfx).mock.calls.map(c => c[0])).toEqual(['levelUp'])
    vi.advanceTimersByTime(CELEBRATION_MS.levelUp)
    expect(celebrations.current?.kind).toBe('objective')
    expect(vi.mocked(sfx).mock.calls.map(c => c[0])).toEqual(['levelUp', 'objective'])
    vi.advanceTimersByTime(CELEBRATION_MS.objective)
    expect(celebrations.current).toBeNull()
    expect(celebrations.queue).toHaveLength(0)
  })

  it('a pile-up keeps only the newest few waiting', () => {
    for (let i = 0; i < 8; i++) pushCelebration('levelUp')
    expect(celebrations.queue.length).toBeLessThanOrEqual(3)
  })

  it('reduced motion: the short fade', () => {
    reduceMotion(true)
    pushCelebration('objective')
    expect(celebrations.current?.reduced).toBe(true)
    vi.advanceTimersByTime(CELEBRATION_REDUCED_MS - 1)
    expect(celebrations.current).not.toBeNull()
    vi.advanceTimersByTime(1)
    expect(celebrations.current).toBeNull()
  })

  it('a reset drops what plays and what waits, and its timer', () => {
    pushCelebration('levelUp')
    pushCelebration('objective')
    resetCelebrations()
    expect(celebrations.current).toBeNull()
    expect(celebrationPending('objective')).toBe(false)
    vi.advanceTimersByTime(10_000)
    expect(celebrations.current).toBeNull()
    expect(sfx).toHaveBeenCalledTimes(1)
  })
})

describe('the HUD event hooks', () => {
  it('the HUD drain starts the act a celebrate event asks for, and drops it on unmount', () => {
    hudEvents.length = 0
    const w = mount(FloatingText, { global: { plugins: [i18n()] } })
    pushHud({ t: 'celebrate', kind: 'levelUp' })
    tickHud(0.016)
    expect(celebrations.current?.kind).toBe('levelUp')
    w.unmount()
    expect(celebrations.current).toBeNull()
  })

  it('the mission pushes one on a finished objective and on a level-up', async () => {
    const { Mission } = await import('@/game/sim/mission')
    const proto = Mission.prototype as unknown as { onObjectiveDone(this: object): void }
    hudEvents.length = 0
    proto.onObjectiveDone.call({ finale: null, weaponOwed: '', dirty: false })
    expect(hudEvents).toContainEqual({ t: 'celebrate', kind: 'objective' })
    // An objective still owed (a Master's weapon to learn) celebrates nothing.
    hudEvents.length = 0
    proto.onObjectiveDone.call({ finale: null, weaponOwed: 'blaze', dirty: false })
    expect(hudEvents.some(e => e.t === 'celebrate')).toBe(false)
    // XP enough for a level: the level-up act, beside its toast.
    const lv = Mission.prototype as unknown as { gainXp(this: object, xp: number): void }
    hudEvents.length = 0
    lv.gainXp.call({ combat: {}, player: { x: 0, y: 0, z: 0 }, fx: { riseRing: () => {} } }, 1e7)
    expect(hudEvents).toContainEqual({ t: 'celebrate', kind: 'levelUp' })
    expect(hudEvents.some(e => e.t === 'toast' && e.key === 'progress.levelUp')).toBe(true)
    hudEvents.length = 0
  })
})

describe('the acts on screen', () => {
  it('the Hard Hat shows only during a level-up act and is gone after', async () => {
    const w = mount(LevelUpPop)
    expect(w.find('[data-celebrate="levelUp"]').exists()).toBe(false)
    pushCelebration('levelUp')
    await nextTick()
    const pop = w.get('[data-celebrate="levelUp"]')
    expect(pop.classes()).not.toContain('reduced')
    expect(pop.attributes('style')).toContain(`--dur: ${CELEBRATION_MS.levelUp}ms`)
    finishCelebration()
    await nextTick()
    expect(w.find('[data-celebrate="levelUp"]').exists()).toBe(false)
  })

  it("the Hard Hat sits just under the compass, a zone Atlas's bubble keeps off", async () => {
    const w = mount(LevelUpPop)
    pushCelebration('levelUp')
    await nextTick()
    const pop = w.get('[data-celebrate="levelUp"]')
    expect(pop.attributes('data-zone')).toBe('celebrate')
    expect(BUBBLE_AVOID).toContain('celebrate')
    zones.rects = { compass: { x: 300, y: 10, w: 360, h: 40 } }
    tickHud(0.016)
    expect((pop.element as HTMLElement).style.top).toBe(`${10 + 40 + ZONE_GAP}px`) // jsdom: no width, so no rise headroom
    zones.rects = {}
    tickHud(0.016)
    expect((pop.element as HTMLElement).style.top).toBe('')
  })

  it('reduced motion marks the act for the fade', async () => {
    reduceMotion(true)
    const w = mount(LevelUpPop)
    pushCelebration('levelUp')
    await nextTick()
    expect(w.get('[data-celebrate="levelUp"]').classes()).toContain('reduced')
  })

  it('the objective badge waits for Atlas\'s checkmark, then stays', async () => {
    hud.phase = 'play'
    hud.objectiveKey = 'objective.kill'
    hud.objectiveParams = { n: 3, total: 3, target: '' }
    hud.objectiveDone = true
    pushCelebration('levelUp')
    pushCelebration('objective')
    const w = mount(ObjectiveTracker, { global: { plugins: [i18n()] } })
    await nextTick()
    // Queued behind the level-up: no badge yet, no Atlas yet.
    expect(w.find('.check-slot').exists()).toBe(true)
    expect(w.find('.check-slot > svg.check').exists()).toBe(false)
    expect(w.find('[data-celebrate="objective"]').exists()).toBe(false)
    vi.advanceTimersByTime(CELEBRATION_MS.levelUp)
    await nextTick()
    expect(w.find('[data-celebrate="objective"] .atlas').exists()).toBe(true)
    expect(w.find('.check-slot > svg.check').exists()).toBe(false)
    vi.advanceTimersByTime(CELEBRATION_MS.objective)
    await nextTick()
    expect(w.find('[data-celebrate="objective"]').exists()).toBe(false)
    expect(w.find('.check-slot > svg.check').exists()).toBe(true)
  })
})
