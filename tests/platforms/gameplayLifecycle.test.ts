import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Which CrazyGames lifecycle events a build sends.
 *
 * The two contracts are deliberately different, and getting them backwards is
 * invisible until a reviewer reads the event log — so it is asserted here.
 */

interface Loaded {
  syncGameplayLifecycle: (live: boolean) => void
  initCrazyGames: () => Promise<void>
  __resetGameplayLifecycle: () => void
  calls: string[]
}

const load = async (fullRelease: boolean): Promise<Loaded> => {
  vi.resetModules()
  vi.doMock('@/use/useUser', () => ({ isCrazyWeb: true }))
  vi.doMock('@/use/useMatch', () => ({ isCrazyGamesFullRelease: fullRelease }))

  const calls: string[] = []
  ;(globalThis as any).window = globalThis as any
  ;(globalThis as any).CrazyGames = {
    SDK: {
      environment: 'crazygames',
      init: async () => {},
      game: {
        gameplayStart: () => calls.push('start'),
        gameplayStop: () => calls.push('stop')
      },
      user: {},
      ad: {}
    }
  }

  const mod = await import('@/use/useCrazyGames')
  await mod.initCrazyGames()
  mod.__resetGameplayLifecycle()
  calls.length = 0
  return { ...mod, calls } as unknown as Loaded
}

beforeEach(() => {
  vi.restoreAllMocks()
})

// #138: one contract in every build. The pre-release build used to send a
// single start from a `signalGameplayLoaded()` nothing called — no event at
// all — so QA found the first start missing at the tutorial landing.
for (const fullRelease of [false, true]) {
  describe(fullRelease ? 'full release build' : 'pre-release build', () => {
    it('stops when play is interrupted (the pause menu) and starts when it resumes', async () => {
      const m = await load(fullRelease)
      m.syncGameplayLifecycle(true)
      m.syncGameplayLifecycle(false)
      m.syncGameplayLifecycle(true)
      expect(m.calls).toEqual(['start', 'stop', 'start'])
    })

    it('never sends two starts in a row, nor a stop before any start', async () => {
      const m = await load(fullRelease)
      m.syncGameplayLifecycle(false)
      m.syncGameplayLifecycle(true)
      m.syncGameplayLifecycle(true)
      m.syncGameplayLifecycle(false)
      m.syncGameplayLifecycle(false)
      m.syncGameplayLifecycle(true)
      expect(m.calls).toEqual(['start', 'stop', 'start'])
    })
  })
}
