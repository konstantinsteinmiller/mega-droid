// @vitest-environment jsdom
// The bot plays a level of the real mission, headless, in virtual time.
//
//   BOT_LEVEL=tutorial npx vitest run tests/bot/playthrough.test.ts
//   BOT_LEVEL=blaze BOT_SECONDS=900 BOT_LEVELUP=8 BOT_TRACE=1 npx vitest run tests/bot/playthrough.test.ts
//
// BOT_LEVEL   tutorial | <sector id> (its story stage; blaze, cryo, …)
// BOT_SECONDS game seconds before giving up (default 600)
// BOT_LEVELUP the hero's level when it starts (default: tutorial 1, a stage 6)
// BOT_TRACE   print the bot's own lines and a position sample every 5 s
// BOT_SEED    the seed of Math.random (default 1): a run is repeatable
// BOT_ATTEMPT the quest attempt number (default 0: another one mirrors / reseeds the stage)
// BOT_ROUTE   a module (relative to src/game/bot/routes) exporting `route`, to try
//             one without registering it
//
// Without BOT_LEVEL this file does nothing, so `vitest run` stays fast. The
// verdict is the Core Master's death (`boss.state === 'dead'`) inside the budget.

import { afterAll, describe, expect, it, vi } from 'vitest'

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

import { Mission, setupFromQuest } from '@/game/sim/mission'
import { storyQuest, tutorialQuest } from '@/game/data/quests'
import { SECTOR_BY_ID } from '@/game/data/regions'
import { createInput, consumeEdges } from '@/game/engine/input'
import { hud } from '@/game/state/hud'
import { profile } from '@/game/state/profile'
import { botHook } from '@/game/bot/hook'
import { Autopilot } from '@/game/bot/autopilot'
import type { Route } from '@/game/bot/routes'

// No 2D canvas in jsdom: every texture paints into a context that takes anything.
const ctx: unknown = new Proxy(function () {}, {
  get: (_t, k) => (k === 'width' || k === 'height' ? 1 : k === 'data' ? new Uint8ClampedArray(4 * 256 * 256) : k === Symbol.toPrimitive ? () => 0 : ctx),
  set: () => true,
  apply: () => ctx
})
;(globalThis as unknown as { Path2D: unknown }).Path2D = class { constructor() { return ctx as object } }
;(HTMLCanvasElement.prototype as unknown as { getContext: () => unknown }).getContext = () => ctx

const level = process.env.BOT_LEVEL
const seconds = Number(process.env.BOT_SECONDS ?? 600)
const trace = !!process.env.BOT_TRACE
const STEP = Number(process.env.BOT_DT ?? 1 / 60)

const seedRandom = (seed: number): void => {
  let a = seed >>> 0
  Math.random = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe.skipIf(!level)('the bot plays', () => {
  afterAll(() => { botHook.driver = null })

  it(`${level} to its Core Master's death`, async () => {
    seedRandom(Number(process.env.BOT_SEED ?? 1))
    const tut = level === 'tutorial'
    profile.level = Number(process.env.BOT_LEVELUP ?? (tut ? 1 : 6))
    // A hero who has played to here carries a full set of repair tanks.
    profile.inv.tanks = 2
    const quest = tut ? tutorialQuest() : storyQuest(SECTOR_BY_ID[level as keyof typeof SECTOR_BY_ID], profile.level, Number(process.env.BOT_ATTEMPT ?? 0))
    const input = createInput()
    let m = (await Mission.create(setupFromQuest(quest, null), input)) as unknown as {
      update(dt: number, first: boolean): void; enter(): void; boss: { state: string; hp: number; maxHp: number } | null
      player: { x: number; y: number; z: number }; combat: { hp: number; maxHp: number; dead: boolean; charging: boolean; charge: number; fireCd: number }
    }
    const bot = new Autopilot()
    if (trace) bot.echo = (s) => console.log(s)
    if (process.env.BOT_ROUTE) bot.override = ((await import(/* @vite-ignore */ `@/game/bot/routes/${process.env.BOT_ROUTE}`)).route) as Route
    botHook.driver = bot
    m.enter()
    let deaths = 0
    let wasDead = false
    let deadAt = -1
    let next = 5
    const t0 = performance.now()
    let t = 0
    for (; t < seconds; t += STEP) {
      m.update(STEP, true)
      consumeEdges(input)
      if (m.combat.dead && !wasDead) {
        deaths++
        console.log(`[bot] DEAD at ${t.toFixed(1)}s (${m.player.x.toFixed(1)}, ${m.player.y.toFixed(1)}, ${m.player.z.toFixed(1)})`)
        // The defeat modal's "retry from checkpoint": the flow rebuilds the mission from its checkpoint snapshot (BOT_NORETRY=1 keeps the old end-of-run death).
        const snap = (m as unknown as { cpSnap: unknown }).cpSnap
        if (!process.env.BOT_NORETRY) {
          m = (await Mission.create(setupFromQuest(quest, (snap ?? null) as never), input)) as unknown as typeof m
          m.enter()
          console.log(`[bot] retry (checkpoint snapshot only on the Fortress; else the stage start) at ${t.toFixed(1)}s -> (${m.player.x.toFixed(1)}, ${m.player.y.toFixed(1)}, ${m.player.z.toFixed(1)})`)
          wasDead = false
          continue
        }
      }
      wasDead = m.combat.dead
      if (trace && t >= next) {
        next += 5
        console.log(`t=${t.toFixed(0)} phase=${hud.phase} pos=(${m.player.x.toFixed(1)}, ${m.player.y.toFixed(1)}, ${m.player.z.toFixed(1)}) hp=${Math.round(m.combat.hp)}/${m.combat.maxHp} chg=${m.combat.charging ? m.combat.charge.toFixed(2) : "-"} lesson=${hud.lesson ? "y" : "-"} boss=${m.boss ? `${m.boss.state} ${Math.round(m.boss.hp)}/${m.boss.maxHp}` : '-'}`)
      }
      if (done.finishes.length) break
      if (m.boss?.state === 'dead') {
        // BOT_EXIT=1 plays on through the weapon lesson and the beam-out.
        if (!process.env.BOT_EXIT) break
        if (deadAt < 0) { deadAt = t; console.log(`[bot] boss dead at ${t.toFixed(1)}s`) }
        if (hud.phase === 'beamOut' || t - deadAt > 240) { console.log(`[bot] exit: phase ${hud.phase} after ${(t - deadAt).toFixed(0)}s`); break }
      }
      // BOT_STOPDEATH=1: a death ends the run (the harness has no retry).
      if (m.combat.dead && process.env.BOT_STOPDEATH) break
    }
    console.log(`[bot] ${level}: boss ${m.boss?.state} after ${t.toFixed(0)} game-s (${((performance.now() - t0) / 1000).toFixed(0)} real-s), deaths ${deaths}, failure: ${bot.failure ?? '-'}`)
    console.log(bot.lines.slice(-25).join('\n'))
    expect(m.boss?.state).toBe('dead')
  }, 1_800_000)
})
