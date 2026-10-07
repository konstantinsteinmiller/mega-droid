// @vitest-environment jsdom
// The tutorial's crane golem (mission.ts stepGolemDrop): Flux walks into its
// room, the crane lets go, and it lands AWAKE. Asleep it is a plain crate, and
// two desktop playtesters (2026-10-07) stood in front of it under "Defeat the
// machines in this room" for 10–15 minutes, sure the room was empty.

import { describe, expect, it, vi } from 'vitest'

vi.mock('@/game/audio/sfx', () => ({ sfx: () => {} }))
vi.mock('@/use/useAds', () => ({ showMidgameAd: async () => {} }))
vi.mock('@/use/useAdGate', () => ({ canShowInterstitial: () => false, markInterstitialShown: () => {} }))
vi.mock('@/use/useCrazyGames', () => ({ triggerHappytime: () => {} }))
vi.mock('@/game/engine/app', () => ({ app: { setMode: () => {}, setWanted: () => {} } }))
vi.mock('@/game/fx/markers', async (orig) => {
  const { Mesh, Group } = await import('three')
  return { ...(await orig<object>()), makeBlobShadow: () => new Mesh(), makeTeleRing: () => new Group(), setTeleRing: () => {} }
})
vi.mock('@/game/world/textures', async (orig) => {
  const { Texture } = await import('three')
  return { ...(await orig<object>()), glowTexture: () => new Texture(), ringTexture: () => new Texture() }
})

import { Mission, type MissionSetup } from '@/game/sim/mission'
import { createEnemy, golemShielded } from '@/game/sim/enemies'
import { baseStats } from '@/game/sim/stats'
import { createInput, type Input } from '@/game/engine/input'
import { createNav } from '@/game/world/nav'
import { CELL, type MapData } from '@/game/world/levelGen'
import { SECTORS } from '@/game/data/regions'
import { hud } from '@/game/state/hud'

const W = 24

describe('the tutorial crane golem', () => {
  it('lands awake, a machine to fight and not a crate to wonder at', () => {
    const sector = SECTORS[0]!
    const setup: MissionSetup = {
      sector: sector.id, seed: 1, rooms: 1, boss: false, enemyLevel: 1, encounters: sector.encounters,
      stats: baseStats(), tutorial: true
    }
    const m = new (Mission as unknown as new (s: MissionSetup, i: Input) => Mission)(setup, createInput())
    const map = { w: W, h: W, cell: new Uint8Array(W * W).fill(1), pillars: [], room: new Int16Array(W * W), rooms: [] } as unknown as MapData
    const mid = (W / 2) * CELL
    m.map = map
    m.nav = createNav(map)
    m.fx = { emit: () => {}, sparks: () => {}, flash: () => {}, riseRing: () => {} } as unknown as Mission['fx']
    m.player = { x: mid, z: mid } as unknown as Mission['player']
    hud.phase = 'play'
    const e = createEnemy('golem', 1, mid + 3, mid, 0)
    expect(e.dormant).toBe(true)
    e.hang = 3
    e.offstage = true
    const crane = { unpark: () => {}, landed: () => {} }
    const g = m as unknown as { golemDrop: unknown; stepGolemDrop(dt: number): void }
    g.golemDrop = { e, crane, falling: false, vy: 0 }
    for (let i = 0; i < 240 && g.golemDrop; i++) g.stepGolemDrop(1 / 60)
    expect(g.golemDrop).toBeNull()
    expect(e.offstage).toBe(false)
    expect(e.dormant).toBe(false)
    expect(e.awake).toBe(true)
    // Still untouchable through its unfold, as anywhere else.
    expect(golemShielded(e)).toBe(true)
  })
})
