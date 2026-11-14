// Unity LevelPlay (ironSource) provider for the native (Tauri Android / iOS)
// build, wired through the Tauri plugin at
// `src-tauri/plugins/tauri-plugin-levelplay/`. LevelPlay mediates between
// ironSource, Google AdMob and Unity Ads.
//
// ## Audience
//
// Since 2026-10-03 the Android app is an 18+ title on Google Play — it left
// the Families programme after two rejections over the "closeable after 5
// seconds" ad rule (ADS_STATE.md). `VITE_APP_ADS_CHILD_DIRECTED` decides the
// posture, and anything but an explicit "false" keeps the strict one:
//
//   • "false" — COPPA off, advertising ID allowed, interstitials between
//     battles on, and Google UMP asks EEA/UK/CH players for GDPR consent
//     before the first ad loads (the Android plugin does that before
//     `LevelPlay.init`).
//   • otherwise — COPPA on, AdMob TFCD, device-ID opt-out, rewarded only.
//
// Surface:
//   • `init()` invokes the native init command once, flips `isReady`
//     true on success, and is idempotent. Any failure leaves
//     `isReady` false so the ad placements stay hidden (the "failsafe"
//     behaviour we want on partially-configured builds).
//   • `showRewardedAd()` resolves `true` only if the video played all
//     the way through AND the reward was credited.
//   • `showMidgameAd()` resolves when the interstitial closed or failed.
//   • `privacyOptionsRequired` / `showPrivacyOptions()` — the consent
//     form's re-entry point for the Options menu, where UMP says one is due.
//
// Per-format readiness (`isRewardedReady`, `isInterstitialReady`)
// reflects the actual SDK ad-load state, not just init status. The
// native plugin emits a `rewarded-state` / `interstitial-state` event
// with `{ ready: boolean }` from the LevelPlay listener callbacks
// (onAdLoaded → ready=true, onAdLoadFailed/onAdClosed/onAdDisplayFailed
// → ready=false). The flag flips back to true after the auto-reload
// queued in onAdClosed succeeds. Components gate v-if on these refs
// so a "watch ad" button never appears unless an ad is actually
// loaded and tappable.
//
// App keys & ad unit IDs are platform-specific and ship in the bundle
// from Vite env vars (they are public identifiers, not secrets).
import { ref } from 'vue'
// `@tauri-apps/api/core` is only meaningful inside a Tauri / native shell.
// On a CrazyGames (or any web) build the provider is never instantiated
// at runtime — it's behind an `import.meta.env.VITE_APP_NATIVE === 'true'`
// gate in `resolveAdProvider`. A STATIC import of this package would
// nevertheless drag ~10KB of Tauri runtime globals into the entry chunk
// for every web build. The build-time-gated ternary below makes the
// dynamic import reachable only on native builds, so Rollup eliminates
// both the call AND the tauri chunk on CrazyGames / GD / itch / Glitch.
import type { invoke as TauriInvoke, addPluginListener as TauriAddPluginListener } from '@tauri-apps/api/core'
import { isDebug } from '@/use/useMatch'
import type { AdProvider } from './types'

type TauriCore = { invoke: typeof TauriInvoke; addPluginListener: typeof TauriAddPluginListener }
let _tauriPromise: Promise<TauriCore> | null = null

const loadTauri: () => Promise<TauriCore> =
  import.meta.env.VITE_APP_NATIVE === 'true'
    ? () => {
      if (!_tauriPromise) {
        _tauriPromise = import('@tauri-apps/api/core').then((m) => ({
          invoke: m.invoke,
          addPluginListener: m.addPluginListener
        }))
      }
      return _tauriPromise
    }
    : () => Promise.reject(new Error('[ads/levelplay] @tauri-apps/api is only available on native builds'))

const invoke: typeof TauriInvoke = (async (...args: unknown[]) => {
  const t = await loadTauri()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (t.invoke as any)(...args)
}) as unknown as typeof TauriInvoke

const addPluginListener: typeof TauriAddPluginListener = (async (...args: unknown[]) => {
  const t = await loadTauri()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (t.addPluginListener as any)(...args)
}) as unknown as typeof TauriAddPluginListener

// Force the LevelPlay Test Suite overlay on launch. Driven from
// .env.tauri's VITE_APP_ADS_TEST_SUITE flag so you can toggle it
// without flipping the runtime debug flag in localStorage. Keep this
// set to `false` for production builds — the overlay opens an
// interactive Activity over the game.
const forceTestSuite = import.meta.env.VITE_APP_ADS_TEST_SUITE === 'true'

/** Strict unless the build explicitly says the audience is not children. */
const childDirected = import.meta.env.VITE_APP_ADS_CHILD_DIRECTED !== 'false'

/** Debug builds only: make Google UMP treat the device as in the EEA, so the
 *  consent form can be tested from anywhere. Ignored on non-test devices. */
const consentDebugEea = import.meta.env.VITE_APP_ADS_CONSENT_DEBUG_EEA === 'true'

const androidAppKey = import.meta.env.VITE_APP_LEVELPLAY_ANDROID_APP_ID ?? ''
const iosAppKey = import.meta.env.VITE_APP_LEVELPLAY_IOS_APP_ID ?? ''
const androidRewardedAdUnit = import.meta.env.VITE_APP_LEVELPLAY_ANDROID_REWARDED_ID ?? ''
const androidInterstitialAdUnit = import.meta.env.VITE_APP_LEVELPLAY_ANDROID_INTERSTITIAL_ID ?? ''
const iosRewardedAdUnit = import.meta.env.VITE_APP_LEVELPLAY_IOS_REWARDED_ID ?? ''
const iosInterstitialAdUnit = import.meta.env.VITE_APP_LEVELPLAY_IOS_INTERSTITIAL_ID ?? ''

// ─── Interstitials only outside the children's posture ─────────────────────
// Google Play's Families ad format rules reject full-screen ads that can't be
// closed after 5 seconds, a control the publisher does not have over a
// mediated network ad. A child-directed build therefore ships rewarded-only:
// no interstitial unit is loaded and `showMidgameAd` is a no-op. The 18+ build
// shows interstitials between battles (cadence: `midgameCadence.ts`).
const NATIVE_INTERSTITIALS_ENABLED = !childDirected

const isReady = ref(false)
const isRewardedReady = ref(false)
const isInterstitialReady = ref(false)
// LevelPlay is mobile-native (Android / iOS via Tauri plugin) — there's
// no browser extension layer to intercept ad requests, so the
// `AdProvider.isAdsBlocked` flag stays false. The shared
// `AdsBlockedModal` therefore never fires on native builds; "no fill"
// shows up via the per-format readiness ref instead.
const isAdsBlocked = ref(false)
/** UMP asked for a way back into the consent form (GDPR regions only). */
const privacyOptionsRequired = ref(false)
let initStarted = false

// On-screen debug surface — exported as `levelPlayDebug` and rendered
// by `LevelPlayDebugOverlay.vue`. Module-level so it's a singleton and
// any component can read it. Mobile builds have no access to a JS
// console, so this is the only way to diagnose init/load failures
// from a sideloaded build.
type LevelPlayInitState = 'idle' | 'no-app-key' | 'starting' | 'ready' | 'failed'
export const levelPlayDebug = ref({
  platform: 'unknown' as 'android' | 'ios' | 'other' | 'unknown',
  childDirected,
  appKeyConfigured: false,
  rewardedIdConfigured: false,
  interstitialIdConfigured: false,
  initState: 'idle' as LevelPlayInitState,
  initError: '' as string,
  lastRewardedShowError: '' as string,
  lastInterstitialShowError: '' as string,
  events: [] as string[]
})

const stamp = (): string => {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}
const logDebug = (msg: string): void => {
  const line = `${stamp()} ${msg}`
  // Replace ref with a new object so Vue picks up the change.
  levelPlayDebug.value = {
    ...levelPlayDebug.value,
    events: [...levelPlayDebug.value.events, line].slice(-12)
  }
}
const setDebug = (patch: Partial<typeof levelPlayDebug.value>): void => {
  levelPlayDebug.value = { ...levelPlayDebug.value, ...patch }
}

const detectPlatform = (): 'android' | 'ios' | 'other' => {
  if (typeof navigator === 'undefined') return 'other'
  const ua = navigator.userAgent || ''
  if (/android/i.test(ua)) return 'android'
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios'
  return 'other'
}

type InitResponse = { initialized: boolean; privacyOptionsRequired?: boolean }
type ShowAdResponse = { shown: boolean; rewarded?: boolean; error?: string }
type LaunchTestSuiteResponse = { launched: boolean; error?: string }
type PrivacyOptionsResponse = { shown: boolean; error?: string }
// `error` only present on `ready=false` events triggered by an SDK
// load/display failure — used by the debug overlay to surface the
// underlying reason (no fill, invalid unit ID, etc.) on device.
type StatePayload = { ready: boolean; error?: string }

export const createLevelPlayProvider = (): AdProvider => ({
  name: 'levelplay',
  isReady,
  isRewardedReady,
  isInterstitialReady,
  isAdsBlocked,
  privacyOptionsRequired,
  init: async () => {
    if (initStarted) return
    initStarted = true

    const platform = detectPlatform()
    const appKey = platform === 'android' ? androidAppKey : platform === 'ios' ? iosAppKey : ''
    const rewardedAdUnitId =
      platform === 'android' ? androidRewardedAdUnit : platform === 'ios' ? iosRewardedAdUnit : ''
    const interstitialAdUnitId =
      platform === 'android' ? androidInterstitialAdUnit : platform === 'ios' ? iosInterstitialAdUnit : ''
    const effectiveInterstitialAdUnitId = NATIVE_INTERSTITIALS_ENABLED ? interstitialAdUnitId : ''

    setDebug({
      platform,
      appKeyConfigured: !!appKey,
      rewardedIdConfigured: !!rewardedAdUnitId,
      interstitialIdConfigured: !!effectiveInterstitialAdUnitId
    })
    logDebug(
      `platform=${platform} childDirected=${childDirected} appKey=${appKey ? 'set' : 'EMPTY'} ` +
      `rew=${rewardedAdUnitId ? 'set' : 'EMPTY'} int=${effectiveInterstitialAdUnitId ? 'set' : (NATIVE_INTERSTITIALS_ENABLED ? 'EMPTY' : 'OFF(child)')}`
    )

    if (!appKey) {
      setDebug({ initState: 'no-app-key', initError: `no app key for platform "${platform}"` })
      logDebug('init aborted: no app key')
      console.warn(`[ads/levelplay] no app key for platform "${platform}" — ads disabled`)
      return
    }

    // Subscribe to per-format readiness events BEFORE invoking init.
    // The plugin's `onAdLoaded` may fire synchronously inside the init
    // success callback if a cached ad was already available, so racing
    // the listener registration after init is risky. The listeners are
    // safe to register before init: the plugin queues `trigger()` calls
    // until the webview is ready to receive them.
    try {
      await addPluginListener<StatePayload>('levelplay', 'rewarded-state', (data) => {
        const r = !!data?.ready
        isRewardedReady.value = r
        const err = data?.error ?? ''
        logDebug(`rewarded-state ready=${r}${err ? ` err="${err}"` : ''}`)
        if (err) setDebug({ lastRewardedShowError: err })
      })
      await addPluginListener<StatePayload>('levelplay', 'interstitial-state', (data) => {
        const r = !!data?.ready
        isInterstitialReady.value = r
        const err = data?.error ?? ''
        logDebug(`interstitial-state ready=${r}${err ? ` err="${err}"` : ''}`)
        if (err) setDebug({ lastInterstitialShowError: err })
      })
      logDebug('listeners subscribed')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      logDebug(`listener subscribe failed: ${msg}`)
      console.warn('[ads/levelplay] failed to subscribe to state events', e)
    }

    try {
      setDebug({ initState: 'starting' })
      logDebug('invoke plugin:levelplay|init')
      // On Android, init also runs Google UMP's consent form where GDPR
      // needs it, so this can stay pending while the player reads it.
      const res = await invoke<InitResponse>('plugin:levelplay|init', {
        payload: {
          appKey,
          rewardedAdUnitId,
          interstitialAdUnitId: effectiveInterstitialAdUnitId,
          isChildDirected: childDirected,
          // TFCD only for children, and never together with TFUA.
          admobTfcd: childDirected,
          admobTfua: false,
          deviceIdOptOut: childDirected,
          metaMixedAudience: false,
          consentDebugEea,
          enableTestSuite: isDebug.value || forceTestSuite
        }
      })
      if (res.initialized) {
        isReady.value = true
        privacyOptionsRequired.value = res.privacyOptionsRequired === true
        setDebug({ initState: 'ready', initError: '' })
        logDebug(`init OK${res.privacyOptionsRequired ? ' (privacy options required)' : ''}`)
      } else {
        setDebug({ initState: 'failed', initError: 'plugin returned initialized=false' })
        logDebug('init returned initialized=false')
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setDebug({ initState: 'failed', initError: msg })
      logDebug(`init threw: ${msg}`)
      console.warn('[ads/levelplay] init failed', e)
    }
  },
  showRewardedAd: async () => {
    if (!isReady.value) {
      logDebug('show_rewarded skipped: not ready')
      return false
    }
    try {
      logDebug('invoke show_rewarded')
      const res = await invoke<ShowAdResponse>('plugin:levelplay|show_rewarded')
      logDebug(`show_rewarded → shown=${res.shown} rewarded=${res.rewarded ?? false}${res.error ? ' err=' + res.error : ''}`)
      if (res.error) setDebug({ lastRewardedShowError: res.error })
      return res.rewarded === true
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setDebug({ lastRewardedShowError: msg })
      logDebug(`show_rewarded threw: ${msg}`)
      console.warn('[ads/levelplay] show_rewarded failed', e)
      return false
    }
  },
  showMidgameAd: async () => {
    if (!NATIVE_INTERSTITIALS_ENABLED) {
      logDebug('show_interstitial off (child-directed build: rewarded only)')
      return
    }
    if (!isReady.value) {
      logDebug('show_interstitial skipped: not ready')
      return
    }
    try {
      logDebug('invoke show_interstitial')
      const res = await invoke<ShowAdResponse>('plugin:levelplay|show_interstitial')
      logDebug(`show_interstitial → shown=${res.shown}${res.error ? ' err=' + res.error : ''}`)
      if (res.error) setDebug({ lastInterstitialShowError: res.error })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setDebug({ lastInterstitialShowError: msg })
      logDebug(`show_interstitial threw: ${msg}`)
      console.warn('[ads/levelplay] show_interstitial failed', e)
    }
  },
  showPrivacyOptions: async () => {
    try {
      logDebug('invoke show_privacy_options')
      const res = await invoke<PrivacyOptionsResponse>('plugin:levelplay|show_privacy_options')
      logDebug(`show_privacy_options → shown=${res.shown}${res.error ? ' err=' + res.error : ''}`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      logDebug(`show_privacy_options threw: ${msg}`)
      console.warn('[ads/levelplay] show_privacy_options failed', e)
    }
  }
})

// LevelPlay debug Test Suite launcher. Not part of the cross-provider
// AdProvider interface because no other provider has an analogue —
// exported as a standalone function so the on-device debug overlay can
// trigger it. The native side also auto-launches on init when
// `enableTestSuite=true` (currently only Android does this; iOS just
// sets the metadata and waits for an explicit launch). This explicit
// command works on both platforms regardless.
export const launchLevelPlayTestSuite = async (): Promise<boolean> => {
  try {
    logDebug('invoke launch_test_suite')
    const res = await invoke<LaunchTestSuiteResponse>('plugin:levelplay|launch_test_suite')
    logDebug(`launch_test_suite → launched=${res.launched}${res.error ? ' err=' + res.error : ''}`)
    return res.launched === true
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    logDebug(`launch_test_suite threw: ${msg}`)
    console.warn('[ads/levelplay] launch_test_suite failed', e)
    return false
  }
}
