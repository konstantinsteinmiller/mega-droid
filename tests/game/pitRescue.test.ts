// @vitest-environment jsdom
// The pit rescue (`Mission.poseRescue`): Atlas comes down to Flux, grabs him
// and carries him back to solid footing on an arc. A fall into the void has
// no landing on spikes, so its rescue starts later on the same clock. It used
// to run on the wrong side of that offset: Atlas stopped halfway down, the
// lift never played and Flux was put back by a cut ("Flux just levitates up").

import { describe, expect, it, vi } from 'vitest'
import { Vector3 } from 'three'

vi.mock('@/game/audio/sfx', () => ({ sfx: () => {} }))
vi.mock('@/use/useAds', () => ({ showMidgameAd: async () => {} }))
vi.mock('@/use/useAdGate', () => ({ canShowInterstitial: () => false, markInterstitialShown: () => {} }))
vi.mock('@/use/useCrazyGames', () => ({ triggerHappytime: () => {} }))
vi.mock('@/game/engine/app', () => ({ app: { setMode: () => {}, setWanted: () => {} } }))

import { Mission, RESCUE_GRAB, RESCUE_IMPACT, RESCUE_LIFT, RESCUE_SPIKES, RESCUE_VOID, RESCUE_ATLAS_Y } from '@/game/sim/mission'

type Pose = { x: number; y: number; z: number; hang: boolean } | null

const rig = (spikes: boolean) => {
  const self = {
    rescue: { fx: 0, fy: 5, fz: 0, bottom: spikes ? -8 : 5, spikes, tx: 6, ty: 5, tz: 0, tyaw: 0 },
    freeze: { t: 0, shot: { kind: 'rescue', hx: 0, hy: 0, hz: 0, hyaw: 0, tx: 0, ty: 0, tz: 0 } },
    atlasWorldAt: new Vector3(),
    atlasWorldSet: false
  }
  const pose = (t: number): Pose => {
    self.freeze.t = t
    return (Mission.prototype as unknown as { poseRescue(this: unknown): Pose }).poseRescue.call(self)
  }
  return { self, pose }
}

describe('the pit rescue', () => {
  it('a void fall plays the same grab and lift as a spike fall, just without the landing', () => {
    expect(RESCUE_SPIKES - RESCUE_VOID).toBeCloseTo(RESCUE_IMPACT)
    expect(RESCUE_GRAB + RESCUE_LIFT).toBeLessThanOrEqual(RESCUE_SPIKES)
  })

  for (const spikes of [true, false]) {
    it(`${spikes ? 'spikes' : 'void'}: Atlas reaches Flux's hands, then carries him all the way to the footing`, () => {
      const { self, pose } = rig(spikes)
      const offset = spikes ? 0 : RESCUE_IMPACT
      // At the grab: Atlas is down over him (RESCUE_ATLAS_Y over his feet: big, its beam on him).
      const atGrab = pose(RESCUE_GRAB - offset)!
      expect(self.atlasWorldAt.y).toBeCloseTo(atGrab.y + RESCUE_ATLAS_Y, 1)
      // Halfway through the lift he hangs, carried on an arc (above the straight
      // line from where he fell to the footing).
      const mid = pose(RESCUE_GRAB + RESCUE_LIFT / 2 - offset)!
      expect(mid.hang).toBe(true)
      expect(mid.y).toBeGreaterThan((self.rescue.bottom + self.rescue.ty) / 2 + 1)
      // By the end of the shot he stands on the footing.
      const end = pose(spikes ? RESCUE_SPIKES : RESCUE_VOID)!
      expect(end.hang).toBe(false)
      expect(end.x).toBeCloseTo(self.rescue.tx)
      expect(end.y).toBeCloseTo(self.rescue.ty)
    })
  }
})
