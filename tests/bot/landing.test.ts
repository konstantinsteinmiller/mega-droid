// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/game/audio/sfx', () => ({ sfx: () => {} }))
vi.mock('@/use/useAds', () => ({ showMidgameAd: async () => {} }))
vi.mock('@/use/useAdGate', () => ({ canShowInterstitial: () => false, markInterstitialShown: () => {} }))
vi.mock('@/use/useCrazyGames', () => ({ triggerHappytime: () => {} }))
vi.mock('@/game/engine/app', () => ({ app: { setMode: () => {}, setWanted: () => {} } }))
vi.mock('@/game/engine/renderer', async (orig) => {
  const f: unknown = new Proxy(function () {}, {
    get: (_t, k) => (k === Symbol.toPrimitive ? () => 1 : k === 'then' ? undefined : f), apply: () => f, set: () => true
  })
  return { ...(await orig<object>()), getRenderer: () => f, hasRenderer: () => false }
})
const done = vi.hoisted(() => ({ finishes: [] as boolean[] }))
vi.mock('@/game/flow', async (orig) => ({
  ...(await orig<typeof import('@/game/flow')>()),
  finishMission: async (success: boolean) => { done.finishes.push(success) },
  retryFromSnapshot: async () => {}
}))
vi.mock('@/game/state/profile', async (orig) => ({
  ...(await orig<typeof import('@/game/state/profile')>()),
  writeSnapshot: () => {},
  saveProfile: () => {}
}))

import { CELL } from '@/game/world/levelGen'
import { Mission, setupFromQuest } from '@/game/sim/mission'
import { storyQuest, tutorialQuest } from '@/game/data/quests'
import { SECTOR_BY_ID } from '@/game/data/regions'
import { createInput, consumeEdges } from '@/game/engine/input'
import { hud } from '@/game/state/hud'
import { profile } from '@/game/state/profile'

// No 2D canvas in jsdom: every texture paints into a context that takes anything.
const ctx: unknown = new Proxy(function () {}, {
  get: (_t, k) => (k === 'width' || k === 'height' ? 1 : k === 'data' ? new Uint8ClampedArray(4 * 256 * 256) : k === Symbol.toPrimitive ? () => 0 : ctx),
  set: () => true,
  apply: () => ctx
})
;(globalThis as unknown as { Path2D: unknown }).Path2D = class { constructor() { return ctx as object } }
;(HTMLCanvasElement.prototype as unknown as { getContext: () => unknown }).getContext = () => ctx


describe('a machine stranded behind a shut door (#208)', () => {
  it('counts as down, and the room gate opens', async () => {
    const input = createInput()
    const m = (await Mission.create(setupFromQuest(tutorialQuest(), null), input)) as unknown as {
      update(dt: number, first: boolean): void; enter(): void; enemies: Array<{ room: number; x: number; z: number; state: string; dormant?: boolean; boss: boolean; awake: boolean }>
      walk: { current: { room: number; door: number } | null; devPass(): void; active: boolean }; player: { x: number; z: number; px: number; pz: number }
      map: { rooms: Array<{ id: number; x0: number; z0: number; w: number; h: number }> }; doors: Array<{ locked: boolean; held: boolean }>
    }
    m.enter()
    for (let i = 0; i < 400; i++) m.update(1 / 60, true)
    // On to the first gate whose room has a machine to be stranded.
    for (let n = 0; n < 10 && m.walk.active && !m.enemies.some(e => e.room === m.walk.current!.room && !e.boss); n++) {
      m.walk.devPass()
      for (let i = 0; i < 30; i++) m.update(1 / 60, true)
    }
    const gate = m.walk.current!
    const room = m.map.rooms[gate.room]!
    const foe = m.enemies.find(e => e.room === gate.room && !e.boss)
    expect(foe, 'a machine in the first gate room').toBeTruthy()
    const far = m.map.rooms.filter(r => r.id !== gate.room).pop()!
    // Flux in the room, the machine across the level behind shut doors.
    m.player.x = m.player.px = (room.x0 + room.w / 2) * CELL
    m.player.z = m.player.pz = (room.z0 + room.h / 2) * CELL
    foe!.x = (far.x0 + far.w / 2) * CELL
    foe!.z = (far.z0 + far.h / 2) * CELL
    foe!.dormant = false
    for (let i = 0; i < 60 * 8; i++) m.update(1 / 60, true)
    expect(foe!.state).toBe('dead')
  }, 120_000)
})

describe('landing from a save', () => {
  it('the rooms around the player are built before the loading screen goes', async () => {
    const quest = tutorialQuest()
    const input = createInput()
    const probe = (await Mission.create(setupFromQuest(quest, null), input)) as unknown as { map: { rooms: Array<{ id: number }>; start: { x: number; z: number } }; level: { pending?: Set<number> }; buildSnap(): Record<string, unknown> }
    const rooms = probe.map.rooms
    expect(probe.level.pending?.size).toBeGreaterThan(0)
    // A save in each late room (the boss's front room among them).
    for (const room of [rooms.length - 1, rooms.length - 2, Math.floor(rooms.length / 2)]) {
      const r = probe.map.rooms[room] as unknown as { x0: number; z0: number; w: number; h: number }
      const snap = { ...probe.buildSnap(), x: (r.x0 + r.w / 2) * CELL, z: (r.z0 + r.h / 2) * CELL }
      const m = (await Mission.create(setupFromQuest(quest, snap as never), input)) as unknown as { level: { pending?: Set<number> }; player: { x: number; z: number }; roomAtXZ(x: number, z: number): number }
      const at = m.roomAtXZ(m.player.x, m.player.z)
      expect(at, 'on the map').toBeGreaterThanOrEqual(0)
      expect(m.level.pending?.has(at) ?? false, `room ${at} built`).toBe(false)
    }
  }, 120_000)
})
