// ─── Unified pause gate ────────────────────────────────────────────────────
//
// One module, three flags, one `isGamePaused` computed. Every reason the
// game has to halt (tab hidden, platform SDK pause callback fired, an ad
// is on-screen, an app-side modal asked for a pause) ORs into the same
// computed; the renderer reads it, audio mute can subscribe to its
// transitions, and the SDK's pause/resume callbacks just toggle their
// flag without knowing about the rest.
//
// **Zero-dependency module on purpose.** `useAds` imports `GamepixProvider`,
// which (transitively) imports this. If pause flags lived in `useAds`,
// `useGamepixPlugin` couldn't read them without a cycle. Keep this file
// importing only `vue`.
//
// **`flush: 'sync'` on the subscriber-fanout watcher is load-bearing.**
// `useAds.showRewardedAd` flips `isAdShowing.value = true` and then
// immediately awaits the SDK call, which opens the ad overlay
// synchronously before the await yields. With default `flush: 'pre'`
// the subscriber would fire on the next microtask tick, leaving a
// window where the game's bg-music + Web Audio sources play
// underneath the ad. GamePix's rewarded ad is the worst offender —
// it never fires the parent `sdk.pause` callback for rewarded
// placements, so `isAdShowing` is the ONLY signal that mutes audio
// for them.

import { computed, ref, watch } from 'vue'

/** True while a rewarded / midgame ad is currently on screen. Flipped
 *  by `useAds.showRewardedAd` / `useAds.showMidgameAd` set/reset. */
export const isAdShowing = ref(false)

/** Whether this build may touch the Page Visibility API at all.
 *
 *  YouTube Playables forbids it outright: the game "MUST NOT use the web Page
 *  Visibility API or similar web APIs and MUST only use Playables SDK
 *  `onPause`". The Playgama archive IS the Playables submission, so on that
 *  build this whole rung is removed and `isPlatformPaused` — driven by the
 *  Bridge's `PAUSE_STATE_CHANGED` — becomes the sole pause source. Every other
 *  platform keeps it: it is the most reliable background signal a mobile
 *  WebView gives us, and the portals that have their own pause callback still
 *  benefit from it as a backstop.
 *
 *  Read off `import.meta.env` rather than importing `isPlaygama` — this module
 *  is a deliberate zero-dependency island (see the header note), and the
 *  literal folds at build time so the listener disappears from the bundle. */
const mayUseVisibilityApi = import.meta.env.VITE_APP_PLAYGAMA !== 'true'

/** True when `document.visibilityState === 'hidden'`. Seeded from the
 *  document on first import, kept current by the listener installed
 *  below. Pinned `false` on Playables, where the API is forbidden. */
export const isVisibilityHidden = ref(
  mayUseVisibilityApi && typeof document !== 'undefined' && document.visibilityState === 'hidden'
)

/** True while the embedding portal (GamePix, etc.) has asked the game
 *  to pause via its SDK callback. Flipped by `pauseGame()` /
 *  `resumeGame()` from the platform plugin. */
export const isPlatformPaused = ref(false)

// Refcounted app-side pauses (in-game modals, tutorial overlays, etc.)
// compose: opening a modal during an ad-phase shouldn't stomp the ad
// pause when the modal closes. Plain boolean would lose that nesting.
let appPauseRefs = 0
const isAppPaused = ref(false)

/** Reserve an app-side pause. Returns a release function. Idempotent
 *  composition — N acquires + N releases. */
export const acquireAppPause = (): (() => void) => {
  appPauseRefs += 1
  isAppPaused.value = appPauseRefs > 0
  let released = false
  return (): void => {
    if (released) return
    released = true
    appPauseRefs = Math.max(0, appPauseRefs - 1)
    isAppPaused.value = appPauseRefs > 0
  }
}

/** Setter for platform-side pause (SDK pause callback). Idempotent. */
export const pauseGame = (): void => {
  if (!isPlatformPaused.value) isPlatformPaused.value = true
}
export const resumeGame = (): void => {
  if (isPlatformPaused.value) isPlatformPaused.value = false
}


/** Manual escape hatch (Enter in App.vue): a platform QA tool can leave the pause
 *  latched. Platform plugins register a reset for their own latched state here so
 *  a later REAL pause event is not swallowed as "unchanged". */
const forceResumeHooks = new Set<() => void>()
export const onForceResume = (fn: () => void): void => { forceResumeHooks.add(fn) }
export const forceResumeGame = (): void => {
  for (const fn of forceResumeHooks) { try { fn() } catch { /* ignore */ } }
  resumeGame()
}

/** OR of all four sources. Drives the renderer's early-return + any
 *  audio mute subscriber. */
export const isGamePaused = computed(
  () => isAdShowing.value || isVisibilityHidden.value || isPlatformPaused.value || isAppPaused.value
)

/**
 * The AUDIO half of the gate: every reason except an app-side modal.
 *
 * A modal freezes the simulation (the loop reads `isGamePaused`), but it must
 * not silence the game: the results fanfare plays as that screen opens, the
 * level-up sting rides its modal, and the Options volume sliders are useless
 * if the music they adjust is suspended. Ads, a hidden tab and a platform
 * pause still silence everything; `useGamePauseAudio` follows this gate.
 */
export const isAudioPaused = computed(
  () => isAdShowing.value || isVisibilityHidden.value || isPlatformPaused.value
)

/** The distinct reasons the game can be halted, in the same order they
 *  OR into `isGamePaused`. Logged by the audio orchestrator so the QA
 *  console shows *why* audio + the render loop stopped. */
export type PauseReason = 'ad' | 'tab-hidden' | 'platform' | 'modal'

/** Snapshot of every pause source currently asserting. Empty array =
 *  game is running. Used for structured pause/resume logging — see
 *  `useGamePauseAudio.ts`. */
export const getActivePauseReasons = (): PauseReason[] => {
  const reasons: PauseReason[] = []
  if (isAdShowing.value) reasons.push('ad')
  if (isVisibilityHidden.value) reasons.push('tab-hidden')
  if (isPlatformPaused.value) reasons.push('platform')
  if (isAppPaused.value) reasons.push('modal')
  return reasons
}

// ─── Subscriber fanout ─────────────────────────────────────────────────────

type PauseSubscriber = (paused: boolean) => void
const subscribers = new Set<PauseSubscriber>()

/** Register a subscriber that fires on every `isGamePaused` transition.
 *  Returns an unsubscribe function. The watcher uses `flush: 'sync'` so
 *  the subscriber runs inside the same call stack as the flag flip —
 *  see file-level comment. */
export const onPauseChange = (sub: PauseSubscriber): (() => void) => {
  subscribers.add(sub)
  return (): void => {
    subscribers.delete(sub)
  }
}

watch(isGamePaused, (paused) => {
  for (const sub of subscribers) {
    try { sub(paused) }
    catch (e) { console.warn('[pause] subscriber threw', e) }
  }
}, { flush: 'sync' })

const audioSubscribers = new Set<PauseSubscriber>()

/** Like `onPauseChange`, for the audio gate (`isAudioPaused`). Same
 *  `flush: 'sync'` guarantee, so an ad is silent from its first frame. */
export const onAudioPauseChange = (sub: PauseSubscriber): (() => void) => {
  audioSubscribers.add(sub)
  return (): void => {
    audioSubscribers.delete(sub)
  }
}

watch(isAudioPaused, (paused) => {
  for (const sub of audioSubscribers) {
    try { sub(paused) }
    catch (e) { console.warn('[pause] audio subscriber threw', e) }
  }
}, { flush: 'sync' })

// ─── Visibility listener ───────────────────────────────────────────────────

if (mayUseVisibilityApi && typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    isVisibilityHidden.value = document.visibilityState === 'hidden'
  })
}
