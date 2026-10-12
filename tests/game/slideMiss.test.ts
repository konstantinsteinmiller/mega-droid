// @vitest-environment jsdom
// The slide lesson only counted the slide that answered the Stomper's held
// leap: a player who shot the Stomper down before it ever came close had
// nothing left to answer, and the room's door stayed shut — a dead end. Now,
// a beat after it falls, the slide input is pointed at (`hud.slideCue`) and
// any slide ticks the lesson off.

import { describe, expect, it, vi } from 'vitest'

vi.mock('@/game/audio/sfx', () => ({ sfx: () => {} }))
vi.mock('@/use/useAds', () => ({ showMidgameAd: async () => {} }))
vi.mock('@/use/useAdGate', () => ({ canShowInterstitial: () => false, markInterstitialShown: () => {} }))
vi.mock('@/use/useCrazyGames', () => ({ triggerHappytime: () => {} }))
vi.mock('@/game/engine/app', () => ({ app: { setMode: () => {}, setWanted: () => {} } }))

import { Mission } from '@/game/sim/mission'
import { Training } from '@/game/sim/training'
import { hud } from '@/game/state/hud'

type Fake = {
  stepTrainingBeats(playing: boolean): void
  slideCounts(): boolean
  training: Training
  time: number
  player: { x: number; z: number }
}

const fake = (stomper: { state: string } | null) => {
  const m = Object.create(Mission.prototype) as Record<string, unknown>
  const tr = new Training({ say: () => {} })
  const walk = {
    active: true,
    current: { room: 0, steps: ['slide'] },
    teacher: () => stomper,
    blockMet: false
  }
  Object.assign(m, {
    training: tr, lessons: {}, gapArrows: [], gelHoloOn: false, walk,
    map: { w: 1, h: 1, room: [0] }, player: { x: 1, z: 1 }, time: 0,
    slideCue: null, slideCueDone: false, slideCued: null, slideMissAt: -1, slideMissed: false,
    trainSpot: null, coach: { master: () => {} }, dirty: false, learnedHere: new Set()
  })
  return m as unknown as Fake
}

describe('the slide lesson with its Stomper shot down early', () => {
  it('points at the slide input a beat after it falls, and a slide then counts', () => {
    hud.slideCue = false
    const m = fake({ state: 'dead' })
    m.stepTrainingBeats(true)
    expect(m.training.id).toBe('slide')
    expect(m.slideCounts()).toBe(false)
    expect(hud.slideCue).toBe(false)
    m.time = 0.5
    m.stepTrainingBeats(true)
    expect(hud.slideCue).toBe(false)
    m.time = 1
    m.stepTrainingBeats(true)
    expect(hud.slideCue).toBe(true)
    expect(m.slideCounts()).toBe(true)
    // Out of the room the cue goes, and comes back with him.
    m.player.x = -5
    m.stepTrainingBeats(true)
    expect(hud.slideCue).toBe(false)
    m.player.x = 1
    m.stepTrainingBeats(true)
    expect(hud.slideCue).toBe(true)
    hud.slideCue = false
  })

  it('stays quiet while the Stomper stands: only its held leap teaches then', () => {
    hud.slideCue = false
    const m = fake({ state: 'idle', x: 1, z: 1, y: 0, def: { aimY: 1, hitR: 0.5 } } as { state: string })
    for (let k = 0; k < 5; k++) {
      m.time = k
      m.stepTrainingBeats(true)
    }
    expect(hud.slideCue).toBe(false)
    expect(m.slideCounts()).toBe(false)
  })
})
