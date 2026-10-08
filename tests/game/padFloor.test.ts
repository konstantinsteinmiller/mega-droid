// @vitest-environment jsdom
// The Gale Master's beam-in pad stood at y 0 while its room is level with
// the raised dock it opens into: the floor covered the pad. Every teleporter
// pad of a stage (the beam-in one, the weapon room's pedestal) stands on the
// floor under it.

import { describe, expect, it, vi } from 'vitest'

vi.mock('@/game/audio/sfx', () => ({ sfx: () => {} }))
vi.mock('@/use/useAds', () => ({ showMidgameAd: async () => {} }))
vi.mock('@/use/useAdGate', () => ({ canShowInterstitial: () => false, markInterstitialShown: () => {} }))
vi.mock('@/use/useCrazyGames', () => ({ triggerHappytime: () => {} }))
vi.mock('@/game/engine/app', () => ({ app: { setMode: () => {}, setWanted: () => {} } }))

import { Mission } from '@/game/sim/mission'
import { generateStage } from '@/game/world/stages'
import { createNav, groundAt } from '@/game/world/nav'
import { cellCenter } from '@/game/world/levelGen'
import type { SectorId } from '@/game/world/themes'

const SECTORS = ['blaze', 'cryo', 'volt', 'gale', 'magnet', 'drill', 'tide', 'neon', 'rotor', 'fortress'] as const

describe('teleporter pads stand on their floor', () => {
  it('the beam-in pad and the weapon room pedestal, on every stage', () => {
    let raised = 0
    for (const sector of SECTORS) {
      for (const seed of [1, 2, 3]) {
        const map = generateStage(sector as SectorId, seed)
        const m = Object.create(Mission.prototype) as { nav: unknown; padFloor(x: number, z: number): number }
        m.nav = createNav(map)
        const spots: Array<[number, number]> = [[map.start.x, map.start.z]]
        if (map.exit) spots.push([cellCenter(map.exit.pad[0]), cellCenter(map.exit.pad[1])])
        for (const [x, z] of spots) {
          const g = groundAt(map, x, z)
          expect(Number.isFinite(g), `${sector} ${seed}`).toBe(true)
          expect(m.padFloor(x, z), `${sector} ${seed}`).toBeCloseTo(g, 5)
          if (g > 0.1) raised++
        }
      }
    }
    // Gale's beam-in room is up on the dock: the case that sank the pad.
    expect(raised).toBeGreaterThan(0)
  })
})
