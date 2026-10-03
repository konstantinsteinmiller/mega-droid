// @vitest-environment jsdom
// The boss shutter opens by itself as Flux walks up to it, like every other
// door (a playtest note: players looked for a button). Never once the fight
// has begun, and never while a lesson holds it shut.

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/game/audio/sfx', () => ({ sfx: () => {} }))
vi.mock('@/use/useAds', () => ({ showMidgameAd: async () => {} }))
vi.mock('@/use/useAdGate', () => ({ canShowInterstitial: () => false, markInterstitialShown: () => {} }))
vi.mock('@/use/useCrazyGames', () => ({ triggerHappytime: () => {} }))
vi.mock('@/game/engine/app', () => ({ app: { setMode: () => {}, setWanted: () => {} } }))

import { Mission, BOSS_DOOR_AUTO } from '@/game/sim/mission'
import { hud } from '@/game/state/hud'

const door = () => ({
  id: 0, x: 0, y: 0, z: 0, cellI: 0, cellJ: 0, locked: true, held: false, opening: false, closing: false, open: 0,
  mesh: { boss: true, panels: [{ position: { x: 0, y: 0 }, scale: { y: 1 } }], lampMat: { color: { set: () => {} } } },
  slab: { active: true }
})

const step = (dist: number, o: { held?: boolean; bossStarted?: boolean } = {}) => {
  const d = door()
  d.held = !!o.held
  const self = {
    doors: [d], player: { x: dist, y: 0, z: 0 }, bossStarted: !!o.bossStarted, interact: null,
    nav: { pathBlock: new Uint8Array(4) }, map: { w: 2 },
    updateFalseWalls: () => {}, sfx: () => {}, shake: () => {}, closePanels: () => {}
  }
  const m = Mission.prototype as unknown as { updateDoors(this: unknown, dt: number): void; openBossDoor(this: unknown, d: unknown): void }
  ;(self as Record<string, unknown>).openBossDoor = m.openBossDoor
  m.updateDoors.call(self, 1 / 60)
  return d
}

describe('the boss shutter', () => {
  beforeEach(() => { hud.phase = 'play' })

  it('opens by itself when Flux walks up to it', () => {
    const d = step(BOSS_DOOR_AUTO - 1)
    expect(d.locked).toBe(false)
    expect(d.opening).toBe(true)
  })

  it('stays shut while he is further away', () => {
    expect(step(BOSS_DOOR_AUTO + 2).locked).toBe(true)
  })

  it('stays shut while a lesson holds it, and once the fight has begun', () => {
    expect(step(1, { held: true }).locked).toBe(true)
    expect(step(1, { bossStarted: true }).locked).toBe(true)
  })
})
