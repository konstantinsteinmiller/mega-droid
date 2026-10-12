// ─── Playgama Bridge plugin (SDK v2) ───────────────────────────────────────
//
// Lazy-loaded module that owns everything the game says to — and hears from —
// the Playgama Bridge. `main.ts` only imports it when `VITE_APP_PLAYGAMA` is
// true, so no other build carries the SDK glue.
//
// "Playgama Bridge" is the one abstraction Playgama ships across ~30 portals.
// The `build:playgama` archive runs on three of them:
//
//   playgama    playgama.com (and `playgama_sandbox`)
//   qa_tool     Playgama's developer QA Tool — a different postMessage protocol
//   youtube     YouTube Playables — Playgama distributes the SAME archive there
//   standalone  a Playgama Wrap site (Bridge loads the Wrap SDK there)
//
// and on localhost it falls back to `mock`.
//
// **DO NOT** set `forciblySetPlatformId`. The Bridge picks the adapter from the
// host (`usercontent.goog` → youtube, the portal handshake → playgama, …);
// pinning one breaks every other context, the QA Tool first.
//
// ─── v1 → v2 (2026-09-16) ──────────────────────────────────────────────────
//
//   1. SOURCE. v1 was `<script src="https://bridge.playgama.com/v1/stable/…">`
//      plus runtime-injected adapter chunks; v2 is the npm package, loaded by
//      `playgamaBridgeLoader.ts` and bundled whole. See that file for why.
//   2. EVENTS. v1 subscribed on sub-modules (`bridge.platform.on`) and `on()`
//      returned an unsubscribe fn. v2 forwards every module to the ROOT and
//      **`on()` returns void** — unsubscribe with `off(name, sameCallback)`.
//      Keeping the v1 shape leaks one listener per ad, and the leaked
//      listeners resolve LATER ads early.
//   3. ADS. `showInterstitial()` / `showRewarded()` return VOID, not a promise.
//      The state event is the whole lifecycle.
//   4. STORAGE. The storage-type argument is gone, and so is the
//      `allowAnonymousCloudSave` option (absent from the 2.2.0 bundle): the
//      Playgama adapter turns cloud storage on whenever the portal reports
//      `getIsCloudSaveSupported()`. See `PlaygamaStrategy`.
//
// ─── Page Visibility is BANNED on this build ───────────────────────────────
//
// Playables: "Game MUST NOT use the web Page Visibility API … and MUST only use
// Playables SDK `onPause` and `onResume`." The Bridge's `PAUSE_STATE_CHANGED`
// (fed by Playables' own `onPause`) and `VISIBILITY_STATE_CHANGED` are the ONLY
// pause sources here. Nothing in this file may read `document.hidden` /
// `document.visibilityState`. (Bridge's own YouTube adapter does listen to
// `visibilitychange` internally, to refresh the audio flag — that is Playgama's
// code inside their certified SDK, not ours.)
//
// NOTE: this file MUST stay free of `import('...')` expressions — the
// obfuscator's `stringArray` pass mangles their specifiers. The Bridge import
// lives in `playgamaBridgeLoader.ts`, which is on the obfuscator's exclude list.

import { ref } from 'vue'
import { isPlaygama } from '@/use/useUser'
import { isDebug } from '@/use/useMatch'
import { pauseGame, resumeGame } from '@/use/useGamePause'
import { setPlatformAudioMuted } from '@/use/useGamePauseAudio'
import { toLocale } from '@/i18n/localeTag'
import type { SaveStrategy } from '@/utils/save/types'
// Static import — the obfuscator's `stringArray` mangles dynamic-import
// literals, which on the Playgama QA Tool surfaced as
// `Failed to resolve module specifier '@/utils/save/PlaygamaStrategy'` at
// runtime. Static-importing it inlines the strategy into this already-lazy
// chunk; non-Playgama builds never reach this module.
import { PlaygamaStrategy } from '@/utils/save/PlaygamaStrategy'
import { setPortalBoard } from '@/use/usePortalLeaderboard'
import { createPlaygamaBoardAdapter } from '@/utils/playgamaLeaderboard'
import { loadPlaygamaBridge, type Bridge } from '@/utils/playgamaBridgeLoader'

/** The game-facing id of the board created on the Playgama dashboard. Empty
 *  means this build has no Playgama leaderboard; `vite.config.ts` then leaves
 *  the `saas` block out of the bridge config too. */
const LEADERBOARD_ID: string = (import.meta.env.VITE_PLAYGAMA_LEADERBOARD_ID ?? '').trim()

/**
 * Options handed to `bridge.initialize()`.
 *
 * v2 resolves its config as `load(configFilePath, these)`: it fetches
 * `./playgama-bridge-config.json` and falls back to this object ONLY if that
 * fetch or parse fails. The emitted file (`platforms/playgama/bridgeConfig.ts`)
 * is the primary source and carries the leaderboard block too; this is the net
 * for a QA wrapper or CDN that does not serve it.
 */
const BRIDGE_OPTIONS = {
  advertisement: { minimumDelayBetweenInterstitial: 120 }
} as const

// Production handshake on a cold start can take 5-7 s; generous headroom so a
// slow mobile load does not latch "ads blocked" for the session.
//
// NOT belt-and-braces on Playables: the Bridge's `youtube` adapter waits for
// `window.ytgame` with a 100 ms poll and NO timeout, so a page without YouTube's
// SDK tag would hang inside `initialize()` forever. `index.html` keeps that tag
// on this build; this race is what stops a missing one from being fatal. It
// also bounds the boot wait — `main.ts` awaits this before the save hydrate.
const INIT_TIMEOUT_MS = 15_000

// Hard-coded rather than read off `bridge.EVENT_NAME`: greppable in a QA
// console, and usable before `initialize()` resolves. They match the 2.2.0
// package's exported constants.
const EVENT = {
  PAUSE_STATE_CHANGED: 'pause_state_changed',
  AUDIO_STATE_CHANGED: 'audio_state_changed',
  VISIBILITY_STATE_CHANGED: 'visibility_state_changed',
  INTERSTITIAL_STATE_CHANGED: 'interstitial_state_changed',
  REWARDED_STATE_CHANGED: 'rewarded_state_changed'
} as const

const MESSAGE = {
  GAME_READY: 'game_ready',
  IN_GAME_LOADING_STARTED: 'in_game_loading_started',
  IN_GAME_LOADING_STOPPED: 'in_game_loading_stopped',
  GAMEPLAY_STARTED: 'gameplay_started',
  GAMEPLAY_STOPPED: 'gameplay_stopped'
} as const

/** Reactive: true once the Bridge has resolved `initialize()` successfully. */
export const isPlaygamaSdkActive = ref(false)
/** Reactive: true when the Bridge failed to come up or the module was blocked.
 *  Wired into `AdProvider.isAdsBlocked` via `PlaygamaProvider`. */
export const isPlaygamaAdsBlocked = ref(false)
/** An internal locale code from `LANGUAGES`, from `bridge.platform.language`.
 *  `null` until the portal reports one this game ships. */
export const playgamaLocale = ref<string | null>(null)
/** Platform id the Bridge picked after init (`playgama`, `youtube`,
 *  `qa_tool`, `mock`, …) — the first thing to check in a QA console. */
export const playgamaDetectedId = ref<string | null>(null)

/**
 * Reactive: does THIS platform serve the format at all? Playgama's rule for the
 * archive it also forwards to YouTube Playables: the code "must always check
 * whether ad placements are supported" before firing — and where a format is
 * not, its button must not exist rather than fail after the player committed.
 *
 * Read from Bridge's own `advertisement.isInterstitialSupported` /
 * `isRewardedSupported` once `initialize()` succeeded (false before that, and
 * false on the localhost MOCK, which serves no ads). Only an explicit `true`
 * counts. `PlaygamaProvider` folds them into the per-format readiness gates;
 * the show wrappers below re-check at call time as well.
 */
export const isPlaygamaInterstitialSupported = ref(false)
export const isPlaygamaRewardedSupported = ref(false)

type AdSupportKey = 'isInterstitialSupported' | 'isRewardedSupported'

const adSupported = (bridge: Bridge | null, key: AdSupportKey): boolean => {
  try {
    return (bridge?.advertisement as Record<AdSupportKey, unknown> | undefined)?.[key] === true
  } catch {
    return false
  }
}

// ─── Internal handles ──────────────────────────────────────────────────────

let sdk: Bridge | null = null
let initPromise: Promise<void> | null = null
let gameReadySent = false
let gameplayStartedActive = false

/**
 * The Bridge reports two independent reasons to halt: `PAUSE_STATE_CHANGED`
 * (portal overlays, ads, Playables' `onPause`) and `VISIBILITY_STATE_CHANGED`
 * (the portal's tab-hidden signal). Each is tracked separately and the game is
 * paused while EITHER holds — collapsing them would let a visibility resume
 * release a pause the portal still holds.
 */
let bridgePaused = false
let bridgeHidden = false
/**
 * An ad just closed and left the frame without focus (#139). The Bridge reads
 * window `blur` as "hidden" — and with it, paused — and only `focus` as
 * visible again. An ad overlay takes the focus and never hands it back, so the
 * game stood frozen after every interstitial (the fly-out cutscene too) until
 * the player clicked into the frame. While this holds, that leftover
 * blur-pause is not a pause; the Bridge's next visibility or pause change (a
 * click focusing the frame, a real tab switch, a portal pause) ends it.
 */
let adBlurOverride = false

const applyPauseAggregate = (): void => {
  if (!adBlurOverride && (bridgePaused || bridgeHidden)) pauseGame()
  else resumeGame()
}

/** An ad (any ad — ours, or one the portal ran) opened or ended. */
const onAdState = (state: unknown): void => {
  if (state === 'opened') {
    if (adBlurOverride) { adBlurOverride = false; applyPauseAggregate() }
    return
  }
  if (state !== 'closed' && state !== 'failed') return
  // Ask for the focus back first: when it comes, the Bridge's own `focus`
  // listener clears "hidden" the proper way.
  try { window.focus() } catch { /* ignore */ }
  if (!bridgeHidden) return
  adBlurOverride = true
  applyPauseAggregate()
}

const setBridgePaused = (paused: boolean): void => {
  if (paused === bridgePaused && !adBlurOverride) return
  adBlurOverride = false
  bridgePaused = paused
  applyPauseAggregate()
}

const setBridgeHidden = (hidden: boolean): void => {
  if (hidden === bridgeHidden && !adBlurOverride) return
  adBlurOverride = false
  bridgeHidden = hidden
  applyPauseAggregate()
}

/** Public accessor — `PlaygamaStrategy` reads `bridge.storage` through this.
 *  Null until `initialize()` has SUCCEEDED: its module getters throw "Before
 *  using the SDK you must initialize it" before that. */
export const getPlaygamaBridge = (): Bridge | null => sdk

// ─── Portal language ───────────────────────────────────────────────────────

/** Adapters with no portal behind them: their `platform.language` is just the
 *  browser language and must not be treated as a portal signal. */
const NO_PORTAL_LANGUAGE: ReadonlySet<string> = new Set(['mock'])

/**
 * `standalone` is Playgama WRAP: Bridge 2.2.0 loads the Wrap SDK
 * (`PLAYGAMA_WRAP`) on that site and reports the page's
 * `platformService.getLanguage()` as `platform.language` — or, when the page
 * supplies none, the BROWSER language, and `platform.language` alone cannot
 * tell the two apart. So on Wrap the SDK is asked directly, through Bridge's
 * public handle on it (`platform.sdk`): a language the Wrap page set is a
 * portal signal like any other portal's (applied, never stored, and a change
 * overrides an earlier in-game choice); an absent one is no signal at all, and
 * the game keeps its own default rather than a browser guess.
 */
const WRAP_PLATFORM_ID = 'standalone'

interface WrapSdk { platformService?: { getLanguage?: () => unknown } }

const wrapSuppliedLanguage = (bridge: Bridge): unknown => {
  try {
    const wrap = (bridge.platform as { sdk?: unknown } | undefined)?.sdk as WrapSdk | null | undefined
    return wrap?.platformService?.getLanguage?.()
  } catch {
    return undefined
  }
}

/**
 * BCP-47 / ISO-639 tag → an internal code from `LANGUAGES`, or `null` for a
 * language this game does not ship. `null`, never the raw code, so an unshipped
 * portal language cannot knock the player out of a language they chose.
 * Region-aware where the game ships two variants (`pt_PT` → `pt-PT`,
 * `zh-Hant` → `zh-TW`, `pt-BR` → `pt`); see `i18n/localeTag.ts`.
 */
export const normalizePlaygamaLanguage = (raw: unknown): string | null => toLocale(raw)

let lastLoggedLanguage: string | null = null
let languageRead = false

/**
 * Read the portal language ONCE per page and publish it.
 *
 * On the Bridge every read of `platform.language` is a GET_LANGUAGE message to
 * the platform, and Playgama's review flagged "an abnormal number of [platform]
 * Get language" calls: this used to poll every 2 s (to follow the QA Tool's
 * language switch without a reload) and re-read on every return to the tab.
 * Playgama's instruction now is one read after start; a portal language change
 * applies on the next load.
 */
const readPortalLanguage = (bridge: Bridge | null = sdk): void => {
  try {
    if (!bridge || languageRead) return
    languageRead = true
    const id = bridge.platform?.id ?? ''
    if (NO_PORTAL_LANGUAGE.has(id)) return
    const raw = id === WRAP_PLATFORM_ID ? wrapSuppliedLanguage(bridge) : bridge.platform?.language
    const code = normalizePlaygamaLanguage(raw)
    if (raw !== lastLoggedLanguage) {
      lastLoggedLanguage = typeof raw === 'string' ? raw : null
      console.info('[playgama] portal language:', raw, '→', code ?? '(not shipped, ignored)')
    }
    if (code && code !== playgamaLocale.value) playgamaLocale.value = code
  } catch (e) {
    if (isDebug.value) console.warn('[playgama] platform.language read threw', e)
  }
}

/** Test-only reset: forget that the language was read this page. */
export const __stopPlaygamaLanguageWatch = (): void => {
  languageRead = false
  lastLoggedLanguage = null
}

// ─── Public init ───────────────────────────────────────────────────────────

export const playgamaPlugin = (): Promise<void> => {
  if (initPromise) return initPromise
  if (!isPlaygama) {
    initPromise = Promise.resolve()
    return initPromise
  }
  initPromise = (async () => {
    const bridge = await loadPlaygamaBridge()
    if (!bridge) {
      isPlaygamaAdsBlocked.value = true
      console.warn('[playgama] Bridge module unavailable — ads and cloud save disabled')
      return
    }
    try {
      let timer: ReturnType<typeof setTimeout> | null = null
      try {
        await Promise.race([
          bridge.initialize(BRIDGE_OPTIONS),
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error('initialize() timeout')), INIT_TIMEOUT_MS)
          })
        ])
      } finally {
        if (timer !== null) clearTimeout(timer)
      }
      sdk = bridge
      isPlaygamaSdkActive.value = true
      playgamaDetectedId.value = bridge.platform?.id ?? null
      isPlaygamaInterstitialSupported.value = adSupported(bridge, 'isInterstitialSupported')
      isPlaygamaRewardedSupported.value = adSupported(bridge, 'isRewardedSupported')
      console.info('[playgama] Bridge v%s initialized — platform.id: %s', bridge.version, playgamaDetectedId.value)

      readPortalLanguage(bridge)

      // Initial states FIRST, then the edges. A portal that boots muted or
      // paused never sends a change event for the state it started in —
      // Playgama filed exactly that against tower-siege.
      if (typeof bridge.platform?.isPaused === 'boolean') setBridgePaused(bridge.platform.isPaused)
      if (typeof bridge.platform?.isAudioEnabled === 'boolean') {
        setPlatformAudioMuted(!bridge.platform.isAudioEnabled)
      }

      // Aggregated pause already covers ads and overlays — do NOT also pause on
      // INTERSTITIAL/REWARDED state, that double-counts the suspend stack.
      bridge.on(EVENT.PAUSE_STATE_CHANGED, (paused: unknown) => setBridgePaused(!!paused))
      bridge.on(EVENT.VISIBILITY_STATE_CHANGED, (state: unknown) => {
        setBridgeHidden(state === 'hidden')
      })
      // An ad's end resumes the game by itself, focus or not (#139).
      bridge.on(EVENT.INTERSTITIAL_STATE_CHANGED, onAdState)
      bridge.on(EVENT.REWARDED_STATE_CHANGED, onAdState)
      // Portal mute is its own audio slot, NOT a pause: muting the portal
      // chrome must silence the game without freezing it, and a mute that
      // arrives before the music exists must still gate its start
      // (`isPlatformAudioMuted`, see `useGamePauseAudio`).
      bridge.on(EVENT.AUDIO_STATE_CHANGED, (enabled: unknown) => {
        setPlatformAudioMuted(enabled === false)
      })
    } catch (e) {
      console.warn('[playgama] initialize() failed', e)
      isPlaygamaAdsBlocked.value = true
      // A bridge whose init rejected may still know its language.
      readPortalLanguage(bridge)
    }
  })()
  return initPromise
}

// ─── Lifecycle messages ────────────────────────────────────────────────────

const sendMessage = (name: string): void => {
  try {
    // v2 `sendMessage` returns a promise that REJECTS on portals which do not
    // implement the message. That is not a game-facing failure.
    const result = sdk?.platform?.sendMessage?.(name)
    if (result && typeof (result as Promise<unknown>).catch === 'function') {
      void (result as Promise<unknown>).catch(() => {})
    }
  } catch (e) {
    if (isDebug.value) console.warn('[playgama] sendMessage failed', name, e)
  }
}

/** Fires `in_game_loading_started`. A no-op until init resolved. */
export const playgamaLoadingStart = (): void => {
  if (!isPlaygamaSdkActive.value) return
  sendMessage(MESSAGE.IN_GAME_LOADING_STARTED)
}

/** Fires `in_game_loading_stopped` AND `game_ready` (once). `game_ready` is
 *  certification-mandatory on the QA Tool, and on Playables Bridge forwards it
 *  as `ytgame.game.gameReady()` (it calls `firstFrameReady()` itself at init).
 *  Idempotent. */
export const playgamaGameLoadingStop = (): void => {
  if (!isPlaygamaSdkActive.value) return
  sendMessage(MESSAGE.IN_GAME_LOADING_STOPPED)
  if (gameReadySent) return
  gameReadySent = true
  sendMessage(MESSAGE.GAME_READY)
}

/** Notify the portal that gameplay is starting. Idempotent. */
export const playgamaGameplayStart = (): void => {
  if (!isPlaygamaSdkActive.value || gameplayStartedActive) return
  gameplayStartedActive = true
  sendMessage(MESSAGE.GAMEPLAY_STARTED)
}

/** Companion to `playgamaGameplayStart`. Idempotent. */
export const playgamaGameplayStop = (): void => {
  if (!isPlaygamaSdkActive.value || !gameplayStartedActive) return
  gameplayStartedActive = false
  sendMessage(MESSAGE.GAMEPLAY_STOPPED)
}

// ─── Ad show wrappers ──────────────────────────────────────────────────────

/** Shows an interstitial; resolves on `closed` or `failed`. Never rejects.
 *  Resolves at once, without asking, on a platform that serves none. */
export const showInterstitialPG = async (onImpression?: () => void): Promise<void> => {
  await playgamaPlugin()
  const bridge = sdk
  if (!isPlaygamaSdkActive.value || !bridge?.advertisement?.showInterstitial) return
  if (!adSupported(bridge, 'isInterstitialSupported')) return
  return new Promise<void>((resolve) => {
    let settled = false
    let hardCap: ReturnType<typeof setTimeout> | null = null
    const finish = (): void => {
      if (settled) return
      settled = true
      if (hardCap !== null) clearTimeout(hardCap)
      try { bridge.off(EVENT.INTERSTITIAL_STATE_CHANGED, onState) } catch { /* ignore */ }
      resolve()
    }
    const onState = (state: unknown): void => {
      // 'opened' is the impression edge `useAds` needs: unreported, its 6 s
      // "never opened" cap releases the wait mid-ad and the result screen goes
      // up on top of a playing interstitial.
      if (state === 'opened') { onImpression?.(); return }
      if (state === 'closed' || state === 'failed') finish()
    }
    bridge.on(EVENT.INTERSTITIAL_STATE_CHANGED, onState)
    try {
      bridge.advertisement.showInterstitial()
    } catch (e) {
      console.warn('[playgama] showInterstitial threw', e)
      finish()
    }
    // A dropped state event must not strand the caller — and with it the
    // ad-pause gate — for the rest of the session.
    hardCap = setTimeout(finish, 60_000)
  })
}

/** Shows a rewarded video. Resolves `true` only when the Bridge fired
 *  `'rewarded'` before `'closed'` / `'failed'` — granting on `'closed'` alone is
 *  a certification-graded violation. */
export const showRewardedPG = async (onImpression?: () => void): Promise<boolean> => {
  await playgamaPlugin()
  const bridge = sdk
  if (!isPlaygamaSdkActive.value || !bridge?.advertisement?.showRewarded) return false
  if (!adSupported(bridge, 'isRewardedSupported')) return false
  return new Promise<boolean>((resolve) => {
    let settled = false
    let rewarded = false
    let hardCap: ReturnType<typeof setTimeout> | null = null
    const finish = (): void => {
      if (settled) return
      settled = true
      if (hardCap !== null) clearTimeout(hardCap)
      try { bridge.off(EVENT.REWARDED_STATE_CHANGED, onState) } catch { /* ignore */ }
      resolve(rewarded)
    }
    const onState = (state: unknown): void => {
      if (state === 'opened') { onImpression?.(); return }
      if (state === 'rewarded') { rewarded = true; return }
      if (state === 'closed' || state === 'failed') finish()
    }
    bridge.on(EVENT.REWARDED_STATE_CHANGED, onState)
    try {
      bridge.advertisement.showRewarded()
    } catch (e) {
      console.warn('[playgama] showRewarded threw', e)
      finish()
    }
    hardCap = setTimeout(finish, 120_000)
  })
}

// ─── Leaderboard ───────────────────────────────────────────────────────────

/**
 * Hand Playgama's leaderboard to the portal-board layer. Call after
 * `playgamaPlugin()` resolved; a no-op when the bridge did not come up or the
 * build carries no leaderboard id.
 *
 * Registered even when `type` is `not_available` (localhost MOCK): the adapter
 * reports that mode, and the portal layer then neither posts nor shows a tab.
 */
export const registerPlaygamaLeaderboard = (): void => {
  const bridge = sdk
  if (!isPlaygamaSdkActive.value || !bridge || LEADERBOARD_ID.length === 0) return
  try {
    if (!bridge.leaderboards) return
    setPortalBoard(createPlaygamaBoardAdapter(bridge, LEADERBOARD_ID))
    console.info('[playgama] leaderboard', LEADERBOARD_ID, '— type:', bridge.leaderboards.type)
  } catch (e) {
    if (isDebug.value) console.warn('[playgama] leaderboard registration failed', e)
  }
}

// ─── Save-strategy factory ─────────────────────────────────────────────────

/** Build the Playgama save strategy. Non-Playgama builds never reach this code
 *  (resolveSaveStrategy's `VITE_APP_PLAYGAMA` arm is dead there). */
export const createPlaygamaSaveStrategy = async (): Promise<SaveStrategy> => {
  return new PlaygamaStrategy()
}
