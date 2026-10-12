// ─── CrazyGames SDK integration ────────────────────────────────────────────
//
// Encapsulates everything the rest of the app needs to talk to the
// CrazyGames SDK loaded via a <script> tag in index.html:
//
//   1. init() — probes `window.CrazyGames.SDK`, calls SDK.init(), and flips
//      `isSdkActive` to true iff the SDK reports a real CrazyGames environment
//      ('crazygames' for live iframe, 'local' for local dev tooling) AND the
//      build-time `isCrazyWeb` flag is set (VITE_APP_CRAZY_WEB=true).
//
//   2. Gameplay lifecycle — `startGameplay()` / `stopGameplay()` wrap the
//      SDK's `game.gameplayStart()` / `gameplayStop()` hooks, which let
//      CrazyGames know when the player is actually in a match (vs menus).
//
//   3. `showRewardedAd()` — a Promise-based wrapper around the SDK's
//      `ad.requestAd('rewarded', …)` callback API. Resolves `true` only when
//      the video played all the way through, so callers can safely grant the
//      reward on success and be silent on failure.
//
// Persistence of player progress is handled separately by
// `@/utils/save/CrazyGamesStrategy`, wired into `SaveManager` at boot. This
// module exposes `createCrazyGamesSaveStrategy()` so the bootstrap can pick
// that strategy without reaching into SDK internals itself.
//
// Outside of a CrazyGames build the module is inert: `isSdkActive` stays
// false and `showRewardedAd()` resolves false.

import { ref } from 'vue'
import { isCrazyWeb } from '@/use/useUser'
import type { SaveStrategy } from '@/utils/save/types'

// The CrazyGames SDK is loaded globally via a script tag in index.html.
// We interact with it entirely through `window.CrazyGames.SDK`, so the
// types are intentionally loose — we only touch the members we need.
declare global {
  interface Window {
    CrazyGames?: {
      SDK?: any
    }
  }
}

/** Reactive: true when the SDK finished init AND we're in a crazy-web build. */
export const isSdkActive = ref(false)

/**
 * Last known mute state reported by the CrazyGames SDK. `null` until we've
 * either read `sdk.game.muteAudio` at init time or received an event from
 * `sdk.game.addMuteListener`. Components can mirror this into their own
 * volume settings to keep the platform-level mute toggle in sync.
 */
export const isSdkMuted = ref<boolean | null>(null)

/**
 * CrazyGames-side display name for the current player, when available.
 * Falls back to `null` for anonymous sessions or non-crazy builds — callers
 * should default to a generic label like "You".
 */
export const crazyPlayerName = ref<string | null>(null)

/**
 * Reactive: true once we've detected that the player's browser is blocking
 * CrazyGames ad requests (uBlock, AdGuard, Brave Shields, etc.). Two
 * sources feed this:
 *   1. `sdk.ad.hasAdblock()` — explicit method exposed by CG SDK v3,
 *      probed at init time. Fast path.
 *   2. `adError({ code: 'adblocker' })` — reported by the SDK at show
 *      time. Catches blockers that activated AFTER init (e.g. user
 *      enabled the extension while the game was running).
 * Wired into `AdProvider.isAdsBlocked` via `CrazyGamesProvider`.
 */
export const isCrazyAdsBlocked = ref(false)

/**
 * Two-letter language code derived from `sdk.user.systemInfo.locale`
 * (e.g. `en` from `en-US`). `null` when the SDK didn't expose one.
 */
export const crazyLocale = ref<string | null>(null)

// Internal handles — captured during init() and reused by the rest of the
// module. Keeping them here (rather than re-reading window.CrazyGames.SDK on
// every call) makes the intent explicit and lets us no-op cleanly when the
// script tag never loaded.
let sdk: any = null
let initialized = false
let gameplayActive = false

const getSdk = (): any => (typeof window !== 'undefined' ? window.CrazyGames?.SDK ?? null : null)

const isActiveEnv = (s: any): boolean => {
  if (!s) return false
  const env = s.environment
  // 'crazygames' — running inside an iframe on crazygames.com
  // 'local'      — local dev via `crazygames-sdk` CLI tool
  // 'disabled'   — plain localhost, no SDK tooling
  return (env === 'crazygames' || env === 'local') && isCrazyWeb
}

// ─── Init ──────────────────────────────────────────────────────────────────

/**
 * Initialize the SDK. Safe to call multiple times — subsequent calls are
 * no-ops. Persistence hydration happens separately via
 * `CrazyGamesStrategy` wired into `SaveManager` — this function now only
 * handles SDK init, profile capture, and mute listeners.
 */
export const initCrazyGames = async (): Promise<void> => {
  if (initialized) return
  initialized = true

  const candidate = getSdk()
  if (!candidate) {
    // Script tag didn't load (blocked, offline, or plain non-CG build).
    return
  }

  try {
    await candidate.init?.()
  } catch (e) {
    console.warn('[crazygames] SDK init failed', e)
    return
  }

  if (!isActiveEnv(candidate)) {
    // Non-crazy-web build, or running in a 'disabled' environment.
    return
  }

  sdk = candidate
  isSdkActive.value = true

  await captureSdkProfile()
  registerMuteListener()
  probeAdBlocker()
}

/**
 * Build the save strategy backed by the CrazyGames `data` module. The
 * strategy pulls the SDK lazily through `getSdk()` so it can be
 * constructed before `initCrazyGames()` has resolved — actual data calls
 * happen during `hydrate()` which `SaveManager` awaits after SDK init.
 *
 * Returns a strategy that no-ops when the SDK isn't available, so the
 * game never blocks on a missing script tag.
 */
export const createCrazyGamesSaveStrategy = async (): Promise<SaveStrategy> => {
  // Dynamic import so the CG cloud-save adapter (BlobStorage, bookkeeping,
  // merge policy) only ships on CrazyGames builds. Every modal in the app
  // statically imports `useCrazyGames` for the no-op gameplay-lifecycle
  // hooks, so a static import of `CrazyGamesStrategy` here would pull it
  // into the entry chunk for every platform.
  const { CrazyGamesStrategy } = await import('@/utils/save/CrazyGamesStrategy')
  return new CrazyGamesStrategy(() => {
    const data = sdk?.data
    if (!data || typeof data.getItem !== 'function') return null
    return data
  })
}

// ─── Profile / settings capture ───────────────────────────────────────────

/**
 * Best-effort read of mute state, player identity, and locale from the SDK.
 * All branches are wrapped in try/catch so a single missing field doesn't
 * abort the rest — the SDK surface differs slightly between builds.
 */
const captureSdkProfile = async (): Promise<void> => {
  // Initial mute state. Per the CG SDK v3 docs, the canonical read path is
  // the property `sdk.game.settings.muteAudio` ("please disable the game
  // audio if this is true"). We also defensively check `sdk.game.muteAudio`
  // and an `isMuted()` method in case the SDK surface drifts between
  // builds, but the `settings.muteAudio` path is the documented one.
  try {
    let m: unknown = sdk?.game?.settings?.muteAudio
    if (typeof m !== 'boolean') m = sdk?.game?.muteAudio
    if (typeof m !== 'boolean' && typeof sdk?.game?.isMuted === 'function') {
      m = sdk.game.isMuted()
    }
    if (typeof m === 'boolean') isSdkMuted.value = m
  } catch (e) {
    console.warn('[crazygames] read settings.muteAudio failed', e)
  }

  // Player display name. `sdk.user.getUser()` resolves to `null` for
  // anonymous sessions, so we only fill the ref when a real username comes
  // back.
  try {
    const u = await sdk?.user?.getUser?.()
    const name = typeof u?.username === 'string' ? u.username.trim() : ''
    if (name) crazyPlayerName.value = name
  } catch (e) {
    console.warn('[crazygames] getUser failed', e)
  }

  // Locale. Newer SDK builds expose `systemInfo` as a property; older ones
  // expose a `getSystemInfo()` async accessor. We try the property first and
  // fall back to the method, then normalize whatever we find to its
  // language sub-tag (`en-US` → `en`).
  try {
    let info: any = sdk?.user?.systemInfo
    if (!info && typeof sdk?.user?.getSystemInfo === 'function') {
      info = await sdk.user.getSystemInfo()
    }
    const raw =
      info?.locale ??
      info?.userLocale ??
      info?.language ??
      null
    // The whole tag: `main.ts` maps it region-aware (pt-PT, zh-TW).
    if (typeof raw === 'string' && raw.length >= 2) crazyLocale.value = raw.trim()
  } catch (e) {
    console.warn('[crazygames] systemInfo locale read failed', e)
  }
}

// ─── Gameplay lifecycle ───────────────────────────────────────────────────

/**
 * Signal a "happy moment" to the CrazyGames SDK. CrazyGames uses these
 * events to pick the best times to highlight the game and to calibrate
 * player-sentiment analytics, so we fire it when the player just landed
 * a clearly positive reward (roulette win, boss drop, etc.). No-op when
 * the SDK isn't active.
 */
export const triggerHappytime = (): void => {
  if (!sdk || !isSdkActive.value) return
  try {
    sdk.game?.happytime?.()
  } catch (e) {
    console.warn('[crazygames] happytime failed', e)
  }
}

/**
 * Notify CrazyGames that the game is in a loading phase — the SDK uses
 * this to drive its own loading indicator AND to mark the start of the
 * "loaded bytes" measurement that QA tooling reads. The SDK auto-enters
 * `loading` on `init()`, so the explicit call is only needed for
 * mid-game loading events (e.g. fetching a new arena chunk). Idempotent.
 */
export const startLoading = (): void => {
  if (!sdk || !isSdkActive.value) return
  try {
    sdk.game?.loadingStart?.()
  } catch (e) {
    console.warn('[crazygames] loadingStart failed', e)
  }
}

/**
 * Notify CrazyGames that the game has finished loading and the player
 * can interact. This is the canonical signal CG QA's tooling listens
 * for to record the cold-launch download size — every byte transferred
 * before this event counts toward the "load size" metric, every byte
 * after counts as on-demand. Call once when the splash screen resolves.
 * Idempotent.
 */
export const stopLoading = (): void => {
  if (!sdk || !isSdkActive.value) return
  try {
    sdk.game?.loadingStop?.()
  } catch (e) {
    console.warn('[crazygames] loadingStop failed', e)
  }
}

/**
 * Notify CrazyGames that interactive gameplay is starting. Idempotent.
 * Call when the player enters the arena / begins a match.
 */
export const startGameplay = (): void => {
  if (!sdk || gameplayActive) return
  try {
    sdk.game?.gameplayStart?.()
    gameplayActive = true
  } catch (e) {
    console.warn('[crazygames] gameplayStart failed', e)
  }
}

/**
 * Notify CrazyGames that gameplay has ended. Idempotent.
 * Call when leaving the arena, opening a blocking menu, or mid-ad.
 */
export const stopGameplay = (): void => {
  if (!sdk || !gameplayActive) return
  try {
    sdk.game?.gameplayStop?.()
    gameplayActive = false
  } catch (e) {
    console.warn('[crazygames] gameplayStop failed', e)
  }
}

// ─── Gameplay lifecycle policy ──────────────────────────────────────────────
//
// One contract in every build (#138): `gameplayStart()` when the player gets
// control, `gameplayStop()` on every break we own (the pause menu, any modal,
// an ad, the result screen, a finished run), `gameplayStart()` again when play
// resumes. Never two starts in a row and never a stop without a start before
// it: `startGameplay` / `stopGameplay` collapse a repeat of the state CG was
// last told (`gameplayActive`).
//
// The pre-release build used to send only ONE start "once loading has
// finished", from a `signalGameplayLoaded()` that nothing ever called — so a
// pre-release build sent no gameplay event at all, and QA found the first
// start missing when the player landed in the tutorial. The release flag still
// gates ads (`useAdGate`), not this.
//
// Deliberately NOT tied to tab visibility — CG handles focus loss itself and
// asks us not to signal it (`isCrazyGameplayLive`).

/** Drive the start/stop pair from whether gameplay is live (`isCrazyGameplayLive`). */
export const syncGameplayLifecycle = (live: boolean): void => {
  if (live) startGameplay()
  else stopGameplay()
}

/** Test seam: forget what CG was last told. */
export const __resetGameplayLifecycle = (): void => {
  gameplayActive = false
}

// ─── Mute sync ────────────────────────────────────────────────────────────

type MuteCallback = (muted: boolean) => void
const muteListeners = new Set<MuteCallback>()

/**
 * Wire up the CrazyGames → game side of the mute bridge. Called once at
 * init, after captureSdkProfile has read the initial state.
 *
 * Per the CG SDK v3 docs, the supported way to react to mute changes is
 * `sdk.game.addSettingsChangeListener(listener)`, where `listener` is
 * called with the *full settings object* (not just a boolean) every time
 * any game setting changes — we extract `muteAudio` from that object.
 *
 * We keep a defensive `addMuteListener` branch for older shims, but the
 * settings-change path is the documented one and the only one that
 * actually fires in the live SDK. The previous code here relied solely
 * on `addMuteListener`, which never fires on the real v3 surface — that
 * is why the platform mute button didn't reach the game.
 */
const registerMuteListener = (): void => {
  if (!sdk?.game) return

  const handleMuteChange = (muted: boolean) => {
    if (isSdkMuted.value === muted) return
    isSdkMuted.value = muted
    muteListeners.forEach(cb => {
      try {
        cb(muted)
      } catch (e) {
        console.warn('[crazygames] mute callback threw', e)
      }
    })
  }

  if (typeof sdk.game.addSettingsChangeListener === 'function') {
    try {
      sdk.game.addSettingsChangeListener((newSettings: any) => {
        const m = newSettings?.muteAudio
        if (typeof m === 'boolean') handleMuteChange(m)
      })
    } catch (e) {
      console.warn('[crazygames] addSettingsChangeListener failed', e)
    }
  } else if (typeof sdk.game.addMuteListener === 'function') {
    // Legacy / shim fallback.
    try {
      sdk.game.addMuteListener((muted: boolean) => handleMuteChange(!!muted))
    } catch (e) {
      console.warn('[crazygames] addMuteListener failed', e)
    }
  }
}

/**
 * Subscribe to CrazyGames-side mute toggles. The listener fires whenever
 * the platform chrome (or another part of the page) flips the mute state,
 * letting components mirror it into their own audio settings.
 *
 * New subscribers are IMMEDIATELY replayed the current SDK mute state
 * (when known), so a single hook covers both the initial sync and future
 * toggles — no separate "apply once" watcher needed.
 *
 * Returns an unsubscribe function. When the SDK isn't active, the callback
 * is never invoked and the unsubscribe is a no-op.
 */
export const onCrazyMuteChange = (cb: MuteCallback): (() => void) => {
  muteListeners.add(cb)
  if (isSdkMuted.value !== null) {
    try {
      cb(isSdkMuted.value)
    } catch (e) {
      console.warn('[crazygames] mute replay callback threw', e)
    }
  }
  return () => muteListeners.delete(cb)
}

/**
 * Record an in-game mute toggle so any code reading `isSdkMuted` sees the
 * new value. NOTE: the CrazyGames SDK v3 has no public setter for the
 * platform-level mute — that toggle is owned by the CG chrome and only
 * flows one-way (platform → game) through the settings-change listener.
 * The previous property-assignment attempts (`sdk.game.muteAudio = muted`)
 * were silently failing on the real SDK, which is why the in-game mute
 * button never moved the platform UI. We now just update our local ref so
 * internal consumers stay coherent. Safe to call when the SDK is inactive.
 */
export const setCrazyMuted = (muted: boolean): void => {
  isSdkMuted.value = muted
}

// Backwards-compat alias — `addCrazyMuteListener` was the old name used by
// `useCrazyMuteSync`. It's just `onCrazyMuteChange` under a different
// spelling so existing call sites keep compiling; prefer the new name in
// new code.
export const addCrazyMuteListener = onCrazyMuteChange

// ─── Ad-blocker detection ─────────────────────────────────────────────────

/**
 * Probe the SDK's `ad.hasAdblock()` method at init time. The method may
 * be sync (boolean) or async (Promise<boolean>) depending on SDK build —
 * normalize to async. Failure to call (method missing on older shims) is
 * NOT treated as "blocked" — we'd rather under-report than misfire the
 * modal at users without blockers.
 */
const probeAdBlocker = (): void => {
  const fn = sdk?.ad?.hasAdblock
  if (typeof fn !== 'function') return
  try {
    const result = fn.call(sdk.ad)
    Promise.resolve(result).then(
      (v) => {
        if (typeof v === 'boolean') isCrazyAdsBlocked.value = v
      },
      (e) => console.warn('[crazygames] hasAdblock rejected', e)
    )
  } catch (e) {
    console.warn('[crazygames] hasAdblock threw', e)
  }
}

/** Map an SDK adError to whether it indicates an ad-blocker. CG v3 uses
 *  `error.code === 'adblocker'`; older shims may stuff the same info into
 *  `message`. We check both to be robust across SDK builds. */
const isAdBlockerError = (err: any): boolean => {
  const code = String(err?.code ?? '').toLowerCase()
  if (code === 'adblocker' || code === 'adblock') return true
  const msg = String(err?.message ?? err ?? '').toLowerCase()
  return msg.includes('adblock') || msg.includes('blocked by client')
}

/** True when the SDK's adError represents an expected, non-actionable
 *  outcome rather than a real failure. CG QA flagged
 *  `[crazygames] midgame ad error d` (where `d` was an `adCooldown`
 *  error) as console noise — the SDK rate-limits midgame ads and tells
 *  us politely; we should not surface that as a warning. Add other
 *  benign codes here as the SDK surfaces them. */
const isBenignAdError = (err: any): boolean => {
  const code = String(err?.code ?? '').toLowerCase()
  return code === 'adcooldown' || code === 'adnotfound'
}

// ─── Rewarded video ads ───────────────────────────────────────────────────

/**
 * Shows a rewarded video ad via the CrazyGames SDK. Resolves `true` iff the
 * ad played all the way through — callers should only grant the reward on
 * a `true` result.
 *
 * Always resolves `false` (and is a no-op) when the SDK is not active, so
 * callers can use it unconditionally without guard checks.
 */
export const showRewardedAd = (onImpression?: () => void): Promise<boolean> => {
  return new Promise((resolve) => {
    if (!sdk || !isSdkActive.value) {
      resolve(false)
      return
    }

    // CrazyGames recommends pausing gameplay while an ad plays so that
    // sounds + timers don't run behind the video. Only resume gameplay if it
    // was active BEFORE the ad — rewarded ads fire from menus too (AdRewardButton,
    // DailyRewards, BattlePass, the Second-Chance "Watch & Continue"), and
    // calling gameplayStart() afterwards would falsely tell CG the player is in
    // a match while they're on a menu / result screen.
    let wasGameplayActive = false
    const resumeAfterAd = () => {
      if (wasGameplayActive) startGameplay()
    }

    try {
      sdk.ad?.requestAd?.('rewarded', {
        adStarted: () => {
          wasGameplayActive = gameplayActive
          stopGameplay()
          try { onImpression?.() } catch { /* never let a callback break the ad */ }
        },
        adFinished: () => {
          resumeAfterAd()
          resolve(true)
        },
        adError: (err: unknown) => {
          if (!isBenignAdError(err)) console.warn('[crazygames] rewarded ad error', err)
          if (isAdBlockerError(err)) isCrazyAdsBlocked.value = true
          resumeAfterAd()
          resolve(false)
        }
      })
    } catch (e) {
      console.warn('[crazygames] requestAd threw', e)
      if (isAdBlockerError(e)) isCrazyAdsBlocked.value = true
      resumeAfterAd()
      resolve(false)
    }
  })
}

// ─── Midgame interstitial ads ─────────────────────────────────────────────

/**
 * Shows a midgame (interstitial) video ad via the CrazyGames SDK. Unlike
 * rewarded ads there is no reward to grant, so the promise simply resolves
 * once the SDK signals the ad has finished or errored — callers can `await`
 * it to know when it's safe to resume the next match.
 *
 * No-op (and resolves immediately) when the SDK is not active.
 */
export const showMidgameAd = (onImpression?: () => void): Promise<void> => {
  return new Promise((resolve) => {
    if (!sdk || !isSdkActive.value) {
      resolve()
      return
    }

    // Pause gameplay while the ad plays so sounds and timers don't run
    // behind the video. Only resume if gameplay was active before the ad — a
    // midgame ad fired from the result screen (our 600ms-delayed win/lose
    // interstitial) must NOT flip CG into "in match" state afterwards.
    let wasGameplayActive = false
    const resumeAfterAd = () => {
      if (wasGameplayActive) startGameplay()
    }

    try {
      sdk.ad?.requestAd?.('midgame', {
        adStarted: () => {
          wasGameplayActive = gameplayActive
          stopGameplay()
          // The ad genuinely opened. `useAds` uses this to tell "the SDK is
          // showing a 30 s video" apart from "the request went nowhere", so a
          // real ad is never cut short by the stuck-request cap.
          try { onImpression?.() } catch { /* never let a callback break the ad */ }
        },
        adFinished: () => {
          resumeAfterAd()
          resolve()
        },
        adError: (err: unknown) => {
          if (!isBenignAdError(err)) console.warn('[crazygames] midgame ad error', err)
          if (isAdBlockerError(err)) isCrazyAdsBlocked.value = true
          resumeAfterAd()
          resolve()
        }
      })
    } catch (e) {
      console.warn('[crazygames] requestAd midgame threw', e)
      if (isAdBlockerError(e)) isCrazyAdsBlocked.value = true
      resumeAfterAd()
      resolve()
    }
  })
}

// ─── Default export (composable-style convenience) ───────────────────────

const useCrazyGames = () => ({
  isSdkActive,
  isSdkMuted,
  crazyPlayerName,
  crazyLocale,
  initCrazyGames,
  createCrazyGamesSaveStrategy,
  startGameplay,
  stopGameplay,
  startLoading,
  stopLoading,
  showRewardedAd,
  showMidgameAd,
  addCrazyMuteListener,
  onCrazyMuteChange,
  setCrazyMuted,
  triggerHappytime
})

export default useCrazyGames
