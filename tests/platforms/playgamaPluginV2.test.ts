// @vitest-environment jsdom
// ─── playgamaPlugin on Bridge v2 ────────────────────────────────────────────
//
// v2 changed the shape of everything the plugin touches: modules forward events
// to the ROOT, `on()` returns void (unsubscribe is `off(name, sameCallback)`),
// and the ad `show*()` calls return void — the state event is the whole
// lifecycle. Keeping the v1 shapes compiles and runs, and then leaks one
// listener per ad, whose leftovers resolve LATER ads early.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Listener = (...args: unknown[]) => void

const makeBridge = (o: { id?: string; language?: string; isPaused?: boolean; isAudioEnabled?: boolean; hangInit?: boolean } = {}) => {
  const listeners = new Map<string, Set<Listener>>()
  const bridge = {
    version: '2.2.0',
    initOptions: null as unknown,
    platform: {
      id: o.id ?? 'playgama',
      language: o.language ?? 'en',
      isPaused: o.isPaused ?? false,
      isAudioEnabled: o.isAudioEnabled ?? true,
      sendMessage: vi.fn(async () => {})
    },
    player: { id: 'p-1', name: null },
    leaderboards: { type: 'in_game', setScore: vi.fn(), getEntries: vi.fn() },
    // Both formats served — the show wrappers ask before firing (see
    // playgamaAdSupport.test.ts for a platform that serves neither).
    advertisement: { isInterstitialSupported: true, isRewardedSupported: true, showInterstitial: vi.fn(), showRewarded: vi.fn() },
    initialize: vi.fn(function (this: unknown, opts: unknown) {
      bridge.initOptions = opts
      return o.hangInit ? new Promise(() => {}) : Promise.resolve()
    }),
    on: vi.fn((name: string, cb: Listener) => {
      if (!listeners.has(name)) listeners.set(name, new Set())
      listeners.get(name)!.add(cb)
    }),
    off: vi.fn((name: string, cb: Listener) => { listeners.get(name)?.delete(cb) }),
    emit: (name: string, ...args: unknown[]) => { for (const cb of [...(listeners.get(name) ?? [])]) cb(...args) },
    count: (name: string) => listeners.get(name)?.size ?? 0
  }
  return bridge
}

let bridge: ReturnType<typeof makeBridge>
const pause = { pauseGame: vi.fn(), resumeGame: vi.fn() }
const audio = { setPlatformAudioMuted: vi.fn() }
const portal = { setPortalBoard: vi.fn() }

const load = async (b = makeBridge()) => {
  bridge = b
  vi.resetModules()
  vi.stubEnv('VITE_APP_PLAYGAMA', 'true')
  vi.stubEnv('VITE_PLAYGAMA_LEADERBOARD_ID', 'mega_droid_xp')
  vi.doMock('@/utils/playgamaBridgeLoader', () => ({ loadPlaygamaBridge: async () => bridge }))
  vi.doMock('@/use/useGamePause', () => pause)
  vi.doMock('@/use/useGamePauseAudio', () => audio)
  vi.doMock('@/use/usePortalLeaderboard', () => portal)
  vi.doMock('@/utils/save/PlaygamaStrategy', () => ({ PlaygamaStrategy: class {} }))
  return await import('@/utils/playgamaPlugin')
}

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => {})
  pause.pauseGame.mockClear()
  pause.resumeGame.mockClear()
  audio.setPlatformAudioMuted.mockClear()
  portal.setPortalBoard.mockClear()
})

afterEach(async () => {
  const m = await import('@/utils/playgamaPlugin')
  m.__stopPlaygamaLanguageWatch?.()
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.doUnmock('@/utils/playgamaBridgeLoader')
  vi.doUnmock('@/use/useGamePause')
  vi.doUnmock('@/use/useGamePauseAudio')
  vi.doUnmock('@/use/usePortalLeaderboard')
  vi.doUnmock('@/utils/save/PlaygamaStrategy')
  vi.restoreAllMocks()
})

describe('initialisation', () => {
  it('initialises once, with the fallback options, and reports the platform', async () => {
    const m = await load()
    await Promise.all([m.playgamaPlugin(), m.playgamaPlugin()])
    expect(bridge.initialize).toHaveBeenCalledTimes(1)
    expect(bridge.initOptions).toMatchObject({ advertisement: { minimumDelayBetweenInterstitial: 120 } })
    expect(m.isPlaygamaSdkActive.value).toBe(true)
    expect(m.playgamaDetectedId.value).toBe('playgama')
    expect(m.getPlaygamaBridge()).toBe(bridge)
  })

  it('gives up after the timeout without throwing, and blocks ads', async () => {
    vi.useFakeTimers()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const m = await load(makeBridge({ hangInit: true }))
    const p = m.playgamaPlugin()
    await vi.advanceTimersByTimeAsync(15_001)
    await expect(p).resolves.toBeUndefined()
    expect(m.isPlaygamaSdkActive.value).toBe(false)
    expect(m.isPlaygamaAdsBlocked.value).toBe(true)
    expect(m.getPlaygamaBridge()).toBeNull()
  })

  it('applies a portal that BOOTS muted and paused — no change event ever comes for those', async () => {
    const m = await load(makeBridge({ isPaused: true, isAudioEnabled: false }))
    await m.playgamaPlugin()
    expect(pause.pauseGame).toHaveBeenCalled()
    expect(audio.setPlatformAudioMuted).toHaveBeenCalledWith(true)
  })

  it('subscribes on the ROOT (v2), not on the v1 sub-modules', async () => {
    const m = await load()
    await m.playgamaPlugin()
    expect(bridge.count('pause_state_changed')).toBe(1)
    expect(bridge.count('visibility_state_changed')).toBe(1)
    expect(bridge.count('audio_state_changed')).toBe(1)
  })
})

describe('pause and mute', () => {
  it('holds the pause while EITHER the portal pause or the hidden state holds', async () => {
    const m = await load()
    await m.playgamaPlugin()
    bridge.emit('pause_state_changed', true)
    bridge.emit('visibility_state_changed', 'hidden')
    bridge.emit('pause_state_changed', false)
    expect(pause.resumeGame).not.toHaveBeenCalled()
    bridge.emit('visibility_state_changed', 'visible')
    expect(pause.resumeGame).toHaveBeenCalledTimes(1)
  })

  // #139: the Bridge reads window blur as "hidden" and only focus as visible
  // again; an ad overlay takes the focus and never gives it back, so the game
  // stood frozen after every ad until the player clicked into the frame.
  it('an ad that ends with the frame still unfocused resumes the game without a click', async () => {
    const m = await load()
    await m.playgamaPlugin()
    // The ad opens: the Bridge pauses and the frame blurs.
    bridge.emit('interstitial_state_changed', 'opened')
    bridge.emit('pause_state_changed', true)
    bridge.emit('visibility_state_changed', 'hidden')
    expect(pause.resumeGame).not.toHaveBeenCalled()
    // It closes; the Bridge keeps "paused" for the blur. The game resumes.
    bridge.emit('interstitial_state_changed', 'closed')
    expect(pause.resumeGame).toHaveBeenCalledTimes(1)
    // Same for a rewarded video.
    bridge.emit('rewarded_state_changed', 'opened')
    expect(pause.pauseGame).toHaveBeenCalled()
    pause.resumeGame.mockClear()
    bridge.emit('rewarded_state_changed', 'closed')
    expect(pause.resumeGame).toHaveBeenCalledTimes(1)
  })

  it('a real pause or tab switch after the ad still pauses', async () => {
    const m = await load()
    await m.playgamaPlugin()
    bridge.emit('pause_state_changed', true)
    bridge.emit('visibility_state_changed', 'hidden')
    bridge.emit('interstitial_state_changed', 'closed')
    pause.pauseGame.mockClear()
    // The click into the frame: focus → visible, then the pause clears.
    bridge.emit('visibility_state_changed', 'visible')
    bridge.emit('pause_state_changed', false)
    // Later the player switches tabs: paused again.
    bridge.emit('pause_state_changed', true)
    expect(pause.pauseGame).toHaveBeenCalled()
  })

  it('treats portal mute as a mute, not a pause', async () => {
    const m = await load()
    await m.playgamaPlugin()
    bridge.emit('audio_state_changed', false)
    expect(audio.setPlatformAudioMuted).toHaveBeenLastCalledWith(true)
    expect(pause.pauseGame).not.toHaveBeenCalled()
    bridge.emit('audio_state_changed', true)
    expect(audio.setPlatformAudioMuted).toHaveBeenLastCalledWith(false)
  })
})

describe('ads — the state event is the whole lifecycle', () => {
  it('resolves an interstitial on closed, reports the impression, and leaves no listener behind', async () => {
    const m = await load()
    await m.playgamaPlugin()
    // The plugin's own standing listener (#139) is not a leak.
    const base = bridge.count('interstitial_state_changed')
    const impression = vi.fn()
    const p = m.showInterstitialPG(impression)
    await Promise.resolve()
    await Promise.resolve()
    expect(bridge.advertisement.showInterstitial).toHaveBeenCalled()
    bridge.emit('interstitial_state_changed', 'opened')
    bridge.emit('interstitial_state_changed', 'closed')
    await p
    expect(impression).toHaveBeenCalledTimes(1)
    expect(bridge.count('interstitial_state_changed'), 'leaked listener resolves the NEXT ad early').toBe(base)
  })

  it('grants a rewarded video only on "rewarded", never on "closed" alone', async () => {
    const m = await load()
    await m.playgamaPlugin()
    const base = bridge.count('rewarded_state_changed')

    const skipped = m.showRewardedPG()
    await Promise.resolve(); await Promise.resolve()
    bridge.emit('rewarded_state_changed', 'opened')
    bridge.emit('rewarded_state_changed', 'closed')
    expect(await skipped).toBe(false)

    const watched = m.showRewardedPG()
    await Promise.resolve(); await Promise.resolve()
    bridge.emit('rewarded_state_changed', 'opened')
    bridge.emit('rewarded_state_changed', 'rewarded')
    bridge.emit('rewarded_state_changed', 'closed')
    expect(await watched).toBe(true)
    expect(bridge.count('rewarded_state_changed')).toBe(base)
  })

  it('resolves on "failed" (no fill) and never hangs the caller', async () => {
    const m = await load()
    await m.playgamaPlugin()
    const p = m.showRewardedPG()
    await Promise.resolve(); await Promise.resolve()
    bridge.emit('rewarded_state_changed', 'failed')
    expect(await p).toBe(false)
  })
})

describe('portal language', () => {
  it('normalises portal tags to shipped codes, and refuses unshipped ones', async () => {
    const m = await load()
    expect(m.normalizePlaygamaLanguage('de-DE')).toBe('de')
    expect(m.normalizePlaygamaLanguage('zh-Hant')).toBe('zh-TW')
    expect(m.normalizePlaygamaLanguage('PT_PT')).toBe('pt-PT')
    expect(m.normalizePlaygamaLanguage('pt-BR')).toBe('pt')
    expect(m.normalizePlaygamaLanguage('UA')).toBe('uk')
    expect(m.normalizePlaygamaLanguage('deu')).toBe('de')
    expect(m.normalizePlaygamaLanguage('xx')).toBeNull()
    expect(m.normalizePlaygamaLanguage(undefined)).toBeNull()
  })

  it('reads the language ONCE at init: no poll, no re-read (Playgama review, #114)', async () => {
    vi.useFakeTimers()
    const m = await load(makeBridge({ id: 'qa_tool', language: 'fr' }))
    // Every read of `platform.language` is a GET_LANGUAGE message on the Bridge.
    let reads = 0
    let value = 'fr'
    Object.defineProperty(bridge.platform, 'language', { get: () => { reads++; return value }, configurable: true })
    await m.playgamaPlugin()
    expect(m.playgamaLocale.value).toBe('fr')
    value = 'ja'
    await vi.advanceTimersByTimeAsync(60_000)
    expect(reads).toBe(1)
    expect(m.playgamaLocale.value).toBe('fr')
  })

  it('ignores the browser language the MOCK adapter reports', async () => {
    const m = await load(makeBridge({ id: 'mock', language: 'de' }))
    await m.playgamaPlugin()
    expect(m.playgamaLocale.value).toBeNull()
  })
})

describe('messages and the leaderboard', () => {
  it('sends game_ready once, and brackets gameplay idempotently', async () => {
    const m = await load()
    await m.playgamaPlugin()
    m.playgamaGameLoadingStop()
    m.playgamaGameLoadingStop()
    m.playgamaGameplayStart()
    m.playgamaGameplayStart()
    m.playgamaGameplayStop()
    const sent = bridge.platform.sendMessage.mock.calls.map((c) => c[0])
    expect(sent.filter((s) => s === 'game_ready')).toHaveLength(1)
    expect(sent.filter((s) => s === 'gameplay_started')).toHaveLength(1)
    expect(sent.filter((s) => s === 'gameplay_stopped')).toHaveLength(1)
  })

  it('registers the Playgama board only after a successful init', async () => {
    const m = await load()
    m.registerPlaygamaLeaderboard()
    expect(portal.setPortalBoard).not.toHaveBeenCalled()
    await m.playgamaPlugin()
    m.registerPlaygamaLeaderboard()
    expect(portal.setPortalBoard).toHaveBeenCalledTimes(1)
  })
})
