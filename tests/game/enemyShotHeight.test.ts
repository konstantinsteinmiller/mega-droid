// @vitest-environment jsdom
// Enemy shots on a climb (platform levels): most machines aim for a flat floor
// and the mission lifts the shot to the machine's platform and tips it at
// Flux's height. The crate golem's rock is aimed in world heights already;
// lifted a second time it flew over Flux's head (a playtest note).

import { describe, expect, it, vi } from 'vitest'

vi.mock('@/game/audio/sfx', () => ({ sfx: () => {} }))
vi.mock('@/use/useAds', () => ({ showMidgameAd: async () => {} }))
vi.mock('@/use/useAdGate', () => ({ canShowInterstitial: () => false, markInterstitialShown: () => {} }))
vi.mock('@/use/useCrazyGames', () => ({ triggerHappytime: () => {} }))
vi.mock('@/game/engine/app', () => ({ app: { setMode: () => {}, setWanted: () => {} } }))

import { Mission } from '@/game/sim/mission'
import type { Enemy } from '@/game/sim/world'

const host = () => {
  const spawned: number[][] = []
  const self = {
    climb: {},
    player: { x: 10, y: 0, z: 0 },
    system: { spawnEnemyShot: (_e: Enemy, x: number, y: number, z: number, dx: number, dy: number, dz: number) => { spawned.push([x, y, z, dx, dy, dz]) } }
  }
  const fire = (worldY: boolean) => Mission.prototype.fireEnemyShot.call(
    self as unknown as Mission, { floor: 4 } as Enemy, 0, 1.2, 0, 1, 0, 0, 10, 5, worldY)
  return { spawned, fire }
}

describe('enemy shots on a platform level', () => {
  it('lifts a flat-floor shot to the machine\'s platform and tips it toward Flux', () => {
    const h = host()
    h.fire(false)
    const [, y, , , dy] = h.spawned[0]!
    expect(y).toBeCloseTo(5.2)
    expect(dy).toBeLessThan(0) // Flux is 4 m below the ledge
  })

  it('leaves a shot aimed in world heights as it is (the golem\'s rock)', () => {
    const h = host()
    h.fire(true)
    expect(h.spawned[0]).toEqual([0, 1.2, 0, 1, 0, 0])
  })
})
