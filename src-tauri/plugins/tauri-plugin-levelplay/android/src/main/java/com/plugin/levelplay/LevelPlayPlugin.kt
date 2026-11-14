package com.plugin.levelplay

import android.app.Activity
import android.webkit.WebView
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import com.google.android.ump.ConsentDebugSettings
import com.google.android.ump.ConsentInformation
import com.google.android.ump.ConsentRequestParameters
import com.google.android.ump.UserMessagingPlatform
import com.unity3d.mediation.LevelPlay
import com.unity3d.mediation.LevelPlayAdError
import com.unity3d.mediation.LevelPlayAdInfo
import com.unity3d.mediation.LevelPlayConfiguration
import com.unity3d.mediation.LevelPlayInitError
import com.unity3d.mediation.LevelPlayInitListener
import com.unity3d.mediation.LevelPlayInitRequest
import com.unity3d.mediation.LevelPlayPrivacySettings
import com.unity3d.mediation.interstitial.LevelPlayInterstitialAd
import com.unity3d.mediation.interstitial.LevelPlayInterstitialAdListener
import com.unity3d.mediation.rewarded.LevelPlayReward
import com.unity3d.mediation.rewarded.LevelPlayRewardedAd
import com.unity3d.mediation.rewarded.LevelPlayRewardedAdListener

// JS → native payload for the init command. Shape matches
// `models::InitRequest` on the Rust side; Tauri auto-deserializes.
//
// `rewardedAdUnitId` / `interstitialAdUnitId` come from the LevelPlay
// dashboard under Ads → Ad Units. When empty, the matching show method
// returns a clean "not-configured" response so the rest of the app
// treats the call as a no-op instead of crashing.
//
// `admobTfcd` / `admobTfua` / `deviceIdOptOut` / `metaMixedAudience` are
// still part of the payload because the iOS plugin reads them; on Android
// everything child-related derives from `isChildDirected` alone.
@InvokeArg
class InitArgs {
    var appKey: String = ""
    var rewardedAdUnitId: String = ""
    var interstitialAdUnitId: String = ""
    var isChildDirected: Boolean = true
    var admobTfcd: Boolean = true
    var admobTfua: Boolean = false
    var deviceIdOptOut: Boolean = true
    var metaMixedAudience: Boolean = false
    var consentDebugEea: Boolean = false
    var enableTestSuite: Boolean = false
}

// LevelPlay 9.x integration for Tauri.
//
// ## Order of a session
//
//   1. Privacy flags (COPPA, the AdMob child tags, device-ID opt-out) are set
//      BEFORE `LevelPlay.init`. Init propagates them to each adapter's SDK;
//      flags set afterwards are a silent no-op for adapters that already
//      started.
//
//   2. Consent: Google UMP asks the player for GDPR consent where the law
//      needs it (EEA/UK/CH) and shows nothing anywhere else. The message
//      itself is configured in AdMob → Privacy & messaging. LevelPlay 7.7.0+
//      picks up the consent UMP stores and passes it to every network, so
//      nothing here forwards it by hand. A child-directed session skips the
//      form: under-age players are never asked for consent.
//
//   3. `LevelPlay.init`, then one rewarded and one interstitial ad object
//      per configured unit, each with its listener attached BEFORE the first
//      `loadAd()` so the first load never races the registration.
//
// The 9.x SDK uses per-instance ad objects (LevelPlayRewardedAd,
// LevelPlayInterstitialAd) keyed by dashboard-issued ad unit IDs. Each
// show method stores the active `Invoke` in a pending slot and resolves
// it exactly once from either `onAdClosed` or `onAdDisplayFailed`, so a
// concurrent second show can't cross-resolve an earlier caller's
// Promise. Lifecycle (`IronSource.onResume/onPause`) was removed in 9.x
// — the SDK now wires up `LevelPlayActivityLifecycleProvider` internally
// and we no longer need activity hooks on the plugin side.
@TauriPlugin
class LevelPlayPlugin(private val activity: Activity) : Plugin(activity) {

    private var initialized = false

    private var rewardedAd: LevelPlayRewardedAd? = null
    private var interstitialAd: LevelPlayInterstitialAd? = null

    private var pendingRewarded: Invoke? = null
    private var pendingInterstitial: Invoke? = null
    // `onAdRewarded` can fire before or after `onAdClosed`. We capture
    // the reward flag here and resolve on close so the caller knows
    // playback actually ended (not just that credit was granted).
    private var lastRewardGranted = false

    private val consentInformation: ConsentInformation by lazy {
        UserMessagingPlatform.getConsentInformation(activity)
    }

    override fun load(webView: WebView) {
        super.load(webView)
    }

    @Command
    fun initialize(invoke: Invoke) {
        val args = invoke.parseArgs(InitArgs::class.java)

        if (args.appKey.isEmpty()) {
            invoke.reject("levelplay: appKey is required")
            return
        }

        applyPrivacyFlags(args.isChildDirected)

        activity.runOnUiThread {
            gatherConsent(args) { startLevelPlay(args, invoke) }
        }
    }

    // ── 1. Privacy flags — MUST come before init ─────────────────────────
    private fun applyPrivacyFlags(childDirected: Boolean) {
        // 9.4+: setCOPPA also drives each network's child tags (AdMob TFCD
        // included — the old "AdMob_TFCD" / "AdMob_TFUA" metadata keys are
        // deprecated and logged as such).
        LevelPlayPrivacySettings.setCOPPA(childDirected)
        LevelPlay.setMetaData("is_deviceid_optout", childDirected.boolText())
    }

    // ── 2. Consent (Google UMP) ──────────────────────────────────────────
    private fun gatherConsent(args: InitArgs, done: () -> Unit) {
        if (args.isChildDirected) {
            done()
            return
        }
        val params = ConsentRequestParameters.Builder()
            .setTagForUnderAgeOfConsent(false)
        if (args.consentDebugEea) {
            // Debug builds only: pretend the device is in the EEA so the
            // consent form can be tested from anywhere. Honoured on test
            // devices only (emulators are test devices automatically).
            params.setConsentDebugSettings(
                ConsentDebugSettings.Builder(activity)
                    .setDebugGeography(ConsentDebugSettings.DebugGeography.DEBUG_GEOGRAPHY_EEA)
                    .build()
            )
        }
        // A failed consent update or form must never cost the session its
        // ads: LevelPlay starts either way, and the networks then serve
        // what the stored consent signal (or its absence) allows.
        consentInformation.requestConsentInfoUpdate(
            activity,
            params.build(),
            {
                UserMessagingPlatform.loadAndShowConsentFormIfRequired(activity) { _ -> done() }
            },
            { _ -> done() }
        )
    }

    private fun privacyOptionsRequired(): Boolean =
        consentInformation.privacyOptionsRequirementStatus ==
            ConsentInformation.PrivacyOptionsRequirementStatus.REQUIRED

    // ── 3. LevelPlay ─────────────────────────────────────────────────────
    private fun startLevelPlay(args: InitArgs, invoke: Invoke) {
        if (args.enableTestSuite) {
            LevelPlay.setMetaData("is_test_suite", "enable")
        }

        val initRequest = LevelPlayInitRequest.Builder(args.appKey).build()

        LevelPlay.init(activity, initRequest, object : LevelPlayInitListener {
            override fun onInitSuccess(configuration: LevelPlayConfiguration) {
                initialized = true

                // Create per-format ad objects only when the caller
                // supplied a matching unit ID. Missing IDs leave the
                // object null and surface as "not-configured" on show.
                if (args.rewardedAdUnitId.isNotEmpty()) {
                    val rw = LevelPlayRewardedAd(args.rewardedAdUnitId)
                    rw.setListener(rewardedListener)
                    rewardedAd = rw
                    rw.loadAd()
                }

                if (args.interstitialAdUnitId.isNotEmpty()) {
                    val itl = LevelPlayInterstitialAd(args.interstitialAdUnitId)
                    itl.setListener(interstitialListener)
                    interstitialAd = itl
                    itl.loadAd()
                }

                if (args.enableTestSuite) {
                    // `validateIntegration` writes the adapter-health
                    // report to logcat (under tag IntegrationHelper).
                    // `launchTestSuite` opens the interactive overlay
                    // that lets you trigger a test ad from any
                    // configured network on demand — this is what
                    // actually puts a test ad on screen without waiting
                    // for real fill. Both are debug-only.
                    LevelPlay.validateIntegration(activity)
                    activity.runOnUiThread {
                        LevelPlay.launchTestSuite(activity)
                    }
                }

                val res = JSObject()
                res.put("initialized", true)
                res.put("privacyOptionsRequired", privacyOptionsRequired())
                invoke.resolve(res)
            }

            override fun onInitFailed(error: LevelPlayInitError) {
                invoke.reject("levelplay init failed: ${error.errorMessage}")
            }
        })
    }

    // Emit a per-format readiness event to the webview. The JS provider
    // listens for "rewarded-state" / "interstitial-state" and mirrors
    // `ready` into Vue refs that gate ad-button visibility, so a
    // "watch ad" prompt never appears unless an ad is actually loaded.
    private fun emitReadiness(event: String, ready: Boolean, error: LevelPlayAdError? = null) {
        val obj = JSObject()
        obj.put("ready", ready)
        // Load failures carry their reason (no fill, unit paused, …) to the
        // debug HUD — mobile builds have no console to read it from.
        if (error != null) obj.put("error", "${error.errorCode}: ${error.errorMessage}")
        trigger(event, obj)
    }

    // ── Rewarded video listener ──────────────────────────────────────
    private val rewardedListener = object : LevelPlayRewardedAdListener {
        override fun onAdLoaded(adInfo: LevelPlayAdInfo) {
            emitReadiness("rewarded-state", true)
        }

        override fun onAdLoadFailed(error: LevelPlayAdError) {
            emitReadiness("rewarded-state", false, error)
        }

        override fun onAdDisplayed(adInfo: LevelPlayAdInfo) {}

        override fun onAdDisplayFailed(error: LevelPlayAdError, adInfo: LevelPlayAdInfo) {
            val pending = pendingRewarded
            pendingRewarded = null
            lastRewardGranted = false
            val obj = JSObject()
            obj.put("shown", false)
            obj.put("rewarded", false)
            obj.put("error", error.errorMessage ?: "show-failed")
            pending?.resolve(obj)
            // Ad consumed/failed → not ready until reload completes.
            emitReadiness("rewarded-state", false)
            rewardedAd?.loadAd()
        }

        override fun onAdRewarded(reward: LevelPlayReward, adInfo: LevelPlayAdInfo) {
            lastRewardGranted = true
        }

        override fun onAdClicked(adInfo: LevelPlayAdInfo) {}
        override fun onAdInfoChanged(adInfo: LevelPlayAdInfo) {}

        override fun onAdClosed(adInfo: LevelPlayAdInfo) {
            val pending = pendingRewarded
            pendingRewarded = null
            val granted = lastRewardGranted
            lastRewardGranted = false
            val obj = JSObject()
            obj.put("shown", true)
            obj.put("rewarded", granted)
            pending?.resolve(obj)
            // Ad consumed → not ready; reload queues the next onAdLoaded
            // which will flip ready=true again.
            emitReadiness("rewarded-state", false)
            rewardedAd?.loadAd()
        }
    }

    // ── Interstitial listener ────────────────────────────────────────
    private val interstitialListener = object : LevelPlayInterstitialAdListener {
        override fun onAdLoaded(adInfo: LevelPlayAdInfo) {
            emitReadiness("interstitial-state", true)
        }

        override fun onAdLoadFailed(error: LevelPlayAdError) {
            emitReadiness("interstitial-state", false, error)
        }

        override fun onAdDisplayed(adInfo: LevelPlayAdInfo) {}

        override fun onAdDisplayFailed(error: LevelPlayAdError, adInfo: LevelPlayAdInfo) {
            val pending = pendingInterstitial
            pendingInterstitial = null
            val obj = JSObject()
            obj.put("shown", false)
            obj.put("error", error.errorMessage ?: "show-failed")
            pending?.resolve(obj)
            emitReadiness("interstitial-state", false)
            interstitialAd?.loadAd()
        }

        override fun onAdClicked(adInfo: LevelPlayAdInfo) {}
        override fun onAdInfoChanged(adInfo: LevelPlayAdInfo) {}

        override fun onAdClosed(adInfo: LevelPlayAdInfo) {
            val pending = pendingInterstitial
            pendingInterstitial = null
            val obj = JSObject()
            obj.put("shown", true)
            pending?.resolve(obj)
            emitReadiness("interstitial-state", false)
            interstitialAd?.loadAd()
        }
    }

    @Command
    fun showRewarded(invoke: Invoke) {
        if (!initialized) {
            invoke.reject("levelplay: not initialized")
            return
        }
        val rw = rewardedAd
        if (rw == null) {
            val obj = JSObject()
            obj.put("shown", false)
            obj.put("rewarded", false)
            obj.put("error", "not-configured")
            invoke.resolve(obj)
            return
        }
        if (!rw.isAdReady) {
            rw.loadAd()
            val obj = JSObject()
            obj.put("shown", false)
            obj.put("rewarded", false)
            obj.put("error", "no-fill")
            invoke.resolve(obj)
            return
        }
        if (pendingRewarded != null) {
            val obj = JSObject()
            obj.put("shown", false)
            obj.put("rewarded", false)
            obj.put("error", "already-showing")
            invoke.resolve(obj)
            return
        }
        pendingRewarded = invoke
        lastRewardGranted = false
        activity.runOnUiThread { rw.showAd(activity) }
    }

    // Opens LevelPlay's Test Suite overlay over the running Activity.
    // Requires `is_test_suite=enable` to have been set BEFORE init (the JS
    // provider does this when `enableTestSuite=true` is passed to `init`).
    // Test Suite serves test ads regardless of account-approval / store-
    // publication state — the right diagnostic for a pre-launch build.
    @Command
    fun launchTestSuite(invoke: Invoke) {
        if (!initialized) {
            val obj = JSObject()
            obj.put("launched", false)
            obj.put("error", "levelplay: not initialized")
            invoke.resolve(obj)
            return
        }
        activity.runOnUiThread {
            LevelPlay.launchTestSuite(activity)
            val obj = JSObject()
            obj.put("launched", true)
            invoke.resolve(obj)
        }
    }

    // Re-opens the consent form so a player can change their choice — the
    // "privacy options entry point" Google requires wherever UMP said a
    // form was needed (`privacyOptionsRequired` in the init response).
    @Command
    fun showPrivacyOptions(invoke: Invoke) {
        activity.runOnUiThread {
            UserMessagingPlatform.showPrivacyOptionsForm(activity) { formError ->
                val obj = JSObject()
                obj.put("shown", formError == null)
                if (formError != null) obj.put("error", formError.message ?: "form-failed")
                invoke.resolve(obj)
            }
        }
    }

    @Command
    fun showInterstitial(invoke: Invoke) {
        if (!initialized) {
            invoke.reject("levelplay: not initialized")
            return
        }
        val itl = interstitialAd
        if (itl == null) {
            val obj = JSObject()
            obj.put("shown", false)
            obj.put("error", "not-configured")
            invoke.resolve(obj)
            return
        }
        if (!itl.isAdReady) {
            itl.loadAd()
            val obj = JSObject()
            obj.put("shown", false)
            obj.put("error", "not-ready")
            invoke.resolve(obj)
            return
        }
        if (pendingInterstitial != null) {
            val obj = JSObject()
            obj.put("shown", false)
            obj.put("error", "already-showing")
            invoke.resolve(obj)
            return
        }
        pendingInterstitial = invoke
        activity.runOnUiThread { itl.showAd(activity) }
    }
}

// Locale-safe boolean → "true"/"false" string for LevelPlay metadata.
// `Boolean.toString()` on JVM is locale-independent, but this keeps the
// intent explicit so nobody reaches for `String.format` in a future edit.
private fun Boolean.boolText(): String = if (this) "true" else "false"
