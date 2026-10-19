// @vitest-environment jsdom
// ─── The cheat panel (#Cheat1) ──────────────────────────────────────────────
//
// What each button of the panel does to the save, where its door jumps land
// on every story map (in front of the door, on a walkable floor reachable from
// the start, facing the door), and that a save a cheat touched never posts a
// leaderboard score, ours or the portal's.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { drainPersist, holdGameState } from '../stubs/drainPersist'

const h = vi.hoisted(() => ({ join: [] as number[], best: [] as number[], run: [] as number[] }))

vi.mock('@/use/usePortalLeaderboard', () => ({
  joinPortalBoard: async (best: number) => { h.join.push(best) },
  reportPortalBest: async (best: number) => { h.best.push(best) }
}))
vi.mock('@/use/useLeaderboard', () => ({ reportRun: async (best: number) => { h.run.push(best) } }))
vi.mock('@/use/useAds', () => ({ showMidgameAd: async () => {} }))
vi.mock('@/use/useAdGate', () => ({ canShowInterstitial: () => false, markInterstitialShown: () => {} }))
vi.mock('@/use/useCrazyGames', () => ({ triggerHappytime: () => {} }))

import { SECTORS } from '@/game/data/regions'
import { CELL, cellCenter } from '@/game/world/levelGen'
import { levelMap } from '@/game/data/levelCatalog'
import { createNav, floorAt, isSolidAt } from '@/game/world/nav'

const tally = { xp: 40, bolts: 5, kills: 3, chests: 0, items: [], seconds: 30 }

describe('cheat panel actions (game/cheatPanel.ts)', () => {
  beforeEach(async () => {
    h.join.length = 0
    h.best.length = 0
    h.run.length = 0
    await holdGameState()
  })
  afterEach(() => { drainPersist() })

  it('grants 10k bolts, the chips, an epic blaster and a full gel pack, and marks the save', async () => {
    const cp = await import('@/game/cheatPanel')
    const { profile, chipsAvailable, computeStats, isCheatedSave } = await import('@/game/state/profile')
    delete profile.tips.cheated
    const bolts = profile.bolts
    const chips = chipsAvailable()
    const items = profile.inv.items.length
    profile.inv.tanks = 0

    cp.grantBolts()
    expect(profile.bolts).toBe(bolts + cp.CHEAT_BOLTS)
    expect(cp.CHEAT_BOLTS).toBe(10000)
    expect(isCheatedSave()).toBe(true)

    cp.grantChips()
    expect(chipsAvailable()).toBe(chips + cp.CHEAT_CHIPS)

    cp.grantEpicBlaster()
    expect(profile.inv.items).toHaveLength(items + 1)
    const it = profile.inv.items[profile.inv.items.length - 1]!
    expect(it.slot).toBe('buster')
    expect(it.rarity).toBe('prototype')
    expect(profile.inv.fresh).toContain(it.id)

    cp.fillGels()
    expect(profile.inv.tanks).toBe(computeStats().tanksMax)
    // A gift over the cap is never taken away.
    profile.inv.tanks = computeStats().tanksMax + 1
    cp.fillGels()
    expect(profile.inv.tanks).toBe(computeStats().tanksMax + 1)
  })

  it('unlocks every sector, so every story mission can be deployed', async () => {
    const cp = await import('@/game/cheatPanel')
    const { profile } = await import('@/game/state/profile')
    const { storyFor } = await import('@/game/flow')
    profile.world.unlocked = ['scrapyard']
    profile.world.bosses = []
    profile.world.tutorialDone = true
    cp.unlockAllStory()
    expect([...profile.world.unlocked].sort()).toEqual(SECTORS.map(s => s.id).sort())
    for (const s of SECTORS) expect(storyFor(s.id), s.id).not.toBeNull()
  })

  it('a cheated save posts no score anywhere; a clean one still does', async () => {
    const flowMod = await import('@/game/flow')
    const { profile } = await import('@/game/state/profile')
    const { tutorialQuest } = await import('@/game/data/quests')

    delete profile.tips.cheated
    flowMod.flow.quest = tutorialQuest()
    await flowMod.finishMission(true, tally)
    expect(h.run).toHaveLength(1)
    expect(h.best).toHaveLength(1)

    const cp = await import('@/game/cheatPanel')
    cp.grantBolts()
    flowMod.flow.quest = tutorialQuest()
    await flowMod.finishMission(true, tally)
    flowMod.flow.quest = tutorialQuest()
    await flowMod.finishMission(false, tally)
    expect(h.run).toHaveLength(1)
    expect(h.best).toHaveLength(1)

    const fakeMode = {} as never
    flowMod.registerModeFactories(async () => fakeMode, () => fakeMode)
    await flowMod.createBootMode()
    expect(h.join).toEqual([])
  })
})

describe('celebration acts from the panel', () => {
  it('each button queues its own act, leaving level and objective alone', async () => {
    const cp = await import('@/game/cheatPanel')
    const { celebrations, resetCelebrations } = await import('@/game/state/celebrate')
    const { profile } = await import('@/game/state/profile')
    resetCelebrations()
    const level = profile.level
    const xp = profile.hero.xp
    cp.playCelebration('levelUp')
    expect(celebrations.current?.kind).toBe('levelUp')
    cp.playCelebration('objective')
    expect(celebrations.queue.map(c => c.kind)).toEqual(['objective'])
    expect(profile.level).toBe(level)
    expect(profile.hero.xp).toBe(xp)
    resetCelebrations()
  })
})

describe('door jumps on every story map', () => {
  it('each story map has a boss door; each jump stands in front of its door, on walkable floor in the room before it, facing it', async () => {
    const cp = await import('@/game/cheatPanel')
    let challenges = 0
    for (const s of SECTORS) {
      const map = levelMap(cp.storyQuestFor(s.id))
      const nav = createNav(map)
      const boss = cp.doorsOf(map, 'boss')
      expect(boss.length, `${s.id} boss door`).toBeGreaterThan(0)
      const doors = [...boss, ...cp.doorsOf(map, 'challenge')]
      challenges += cp.doorsOf(map, 'challenge').length
      expect(cp.storyDoors(s.id)).toEqual({ boss: boss.length, challenge: doors.length - boss.length })
      for (const d of doors) {
        const tag = `${s.id} door ${d.id}${d.boss ? ' (boss)' : ' (challenge)'}`
        const p = cp.doorApproach(nav, d)
        const dx = cellCenter(d.i)
        const dz = cellCenter(d.j)
        expect(isSolidAt(nav, p.x, p.z), `${tag} walkable`).toBe(false)
        expect(Number.isFinite(p.y), `${tag} floor`).toBe(true)
        expect(p.y).toBe(floorAt(nav, p.x, p.z))
        const dist = Math.hypot(p.x - dx, p.z - dz)
        expect(dist, `${tag} near`).toBeGreaterThanOrEqual(1.5)
        expect(dist, `${tag} near`).toBeLessThanOrEqual(4.5)
        // On the near side: not inside the room the door leads into.
        const k = Math.floor(p.z / CELL) * map.w + Math.floor(p.x / CELL)
        expect(map.room[k], `${tag} near side`).not.toBe(d.to)
        // Facing the door (forward is -sin, -cos of yaw).
        const fx = -Math.sin(p.yaw)
        const fz = -Math.cos(p.yaw)
        expect(fx * (dx - p.x) + fz * (dz - p.z), `${tag} facing`).toBeGreaterThan(0)
        // A walk from the spot up to the doorway, no wall between.
        for (let b = 0.5; b < dist; b += 0.5) {
          expect(isSolidAt(nav, p.x + (dx - p.x) * b / dist, p.z + (dz - p.z) * b / dist), `${tag} clear walk`).toBe(false)
        }
        // In the room the door leads out of: the one the route reaches it
        // through (the stage specs prove each route walkable, which a grid
        // search cannot: their jumps, ladders and bridges).
        expect([d.from, -1], `${tag} in its room or corridor`).toContain(map.room[k])
      }
    }
    // The stages hang challenge rooms off their routes: the panel lists them.
    expect(challenges).toBeGreaterThan(0)
  })
})
