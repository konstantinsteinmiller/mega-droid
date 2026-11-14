// iOS bridge for Unity LevelPlay (ironSource). Mirror of the Android
// plugin at ../../android/src/main/java/com/plugin/levelplay/LevelPlayPlugin.kt.
//
// COPPA / Families-Policy ordering rules (same as Android):
//
//   1. Every `LevelPlay.setMetaDataWithKey(...)` call MUST happen BEFORE
//      `LevelPlay.initWith(...)`. The init call propagates the flags to
//      each adapter's SDK during startup; setting metadata afterwards
//      is a silent no-op for adapters that have already initialised.
//
//   2. `LPMRewardedAd` / `LPMInterstitialAd` instances have their
//      delegate attached BEFORE we call `loadAd()` so the first load
//      attempt never races past the listener registration.
//
// LevelPlay 9.x uses per-instance ad objects keyed by dashboard-issued
// ad unit IDs. Each show method stores the active `Invoke` in a
// pending slot and resolves it exactly once from either `didCloseAd`
// or `didFailToDisplayAd`, so a concurrent second show can't
// cross-resolve an earlier caller's Promise.
//
// Audience: the app is 18+ and not child-directed since 2026-10-03
// (ADS_STATE.md). The JS provider sends `isChildDirected=false`,
// `deviceIdOptOut=false` and the AdMob tags off; a child-directed build
// still works through the same metadata. We never call
// ATTrackingManager.requestTrackingAuthorization, so the networks get
// no IDFA (the CI strips NSUserTrackingUsageDescription as well).
//
// Consent (EEA / UK / CH): before LevelPlay starts, Google UMP asks for
// consent with the message configured in AdMob → Privacy & messaging,
// exactly like the Android plugin. UMP reaches this target only
// transitively (GoogleMobileAds' SPM package depends on it), and the CLI
// SPM build may not expose it — see Package.swift. Every UMP call is
// therefore behind `canImport`: without the module the plugin compiles,
// skips consent and leaves a build warning in the CI log.

import SwiftRs
import Tauri
import UIKit
import WebKit
#if canImport(UserMessagingPlatform)
import UserMessagingPlatform
#else
#warning("UserMessagingPlatform is not importable: this iOS build shows no consent form")
#endif
// The IronSource xcframework's Swift module name is `IronSource`
// (per Unity's official LevelPlay-Swift integration guide), even
// though our SPM binary target is named `IronSourceSDK`. Linking
// comes from the binary-target dep in Package.swift; the import
// here resolves to the framework's modulemap.
//
// Exposes: `LevelPlay`, `LPMRewardedAd`, `LPMInterstitialAd`,
// `LPMInitRequestBuilder`, `LPMRewardedAdDelegate`,
// `LPMInterstitialAdDelegate`, `LPMAdInfo`, `LPMAdError`, `LPMReward`,
// `LPMConfiguration`.
import IronSource

// JS → native payload for the initialize command. Shape matches
// `models::InitRequest` on the Rust side; Tauri auto-deserializes.
class InitArgs: Decodable {
    let appKey: String
    var rewardedAdUnitId: String = ""
    var interstitialAdUnitId: String = ""
    var isChildDirected: Bool = true
    var admobTfcd: Bool = true
    var admobTfua: Bool = true
    var deviceIdOptOut: Bool = true
    var metaMixedAudience: Bool = false
    var consentDebugEea: Bool = false
    var enableTestSuite: Bool = false
}

class LevelPlayPlugin: Plugin,
    LPMRewardedAdDelegate,
    LPMInterstitialAdDelegate
{
    private var initialized = false
    private var rewardedAd: LPMRewardedAd?
    private var interstitialAd: LPMInterstitialAd?
    // The 9.x ad objects don't expose the adUnitId they were created with as
    // a public property, so we mirror it here to dispatch shared delegate
    // callbacks (didFailToLoadAd fires on both formats with the same
    // signature) to the correct format.
    private var rewardedAdUnitId: String?
    private var interstitialAdUnitId: String?
    private var pendingRewarded: Invoke?
    private var pendingInterstitial: Invoke?
    private var lastRewardGranted = false

    // Resolves the active webview's containing UIViewController. Tauri's
    // Plugin base exposes `manager` as a non-optional `PluginManager`,
    // but its `viewController` accessor may be nil in edge cases (no
    // scene yet, or the plugin instantiated before the webview is
    // attached). Fall back to UIApplication's key window root VC.
    @MainActor
    private var topViewController: UIViewController? {
        if let vc = self.manager.viewController { return vc }
        return UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first(where: \.isKeyWindow)?
            .rootViewController
    }

    // Emit a per-format readiness event to the webview. The JS provider
    // listens for "rewarded-state" / "interstitial-state" and mirrors
    // `ready` into Vue refs that gate ad-button visibility, so a
    // "watch ad" prompt never appears unless an ad is actually loaded.
    // The optional `error` carries the SDK's localizedDescription on
    // load/display failures so it surfaces in the on-device debug
    // overlay (mobile builds have no JS console).
    //
    // Two literal-dict call sites instead of a `[String: Any]` payload —
    // Tauri's `trigger(_:data:)` expects a JSObject ([String: JSValue]),
    // which Swift can synthesize from a homogeneous-ish literal but not
    // from an `[String: Any]` runtime value.
    private func emitReadiness(_ event: String, ready: Bool, error: String? = nil) {
        if let error = error {
            self.trigger(event, data: ["ready": ready, "error": error])
        } else {
            self.trigger(event, data: ["ready": ready])
        }
    }

    private func boolText(_ v: Bool) -> String { v ? "true" : "false" }

    @objc public func initialize(_ invoke: Invoke) throws {
        let args = try invoke.parseArgs(InitArgs.self)

        guard !args.appKey.isEmpty else {
            invoke.reject("levelplay: appKey is required")
            return
        }

        // ── Audience metadata — MUST come before init ──
        LevelPlay.setMetaDataWithKey("is_child_directed", value: boolText(args.isChildDirected))
        LevelPlay.setMetaDataWithKey("AdMob_TFCD", value: boolText(args.admobTfcd))
        LevelPlay.setMetaDataWithKey("AdMob_TFUA", value: boolText(args.admobTfua))
        LevelPlay.setMetaDataWithKey("is_deviceid_optout", value: boolText(args.deviceIdOptOut))
        LevelPlay.setMetaDataWithKey("Meta_Mixed_Audience", value: boolText(args.metaMixedAudience))
        if args.enableTestSuite {
            LevelPlay.setMetaDataWithKey("is_test_suite", value: "enable")
        }

        // Consent first, then LevelPlay — LevelPlay reads the stored TCF
        // string for every network when it starts.
        DispatchQueue.main.async { [weak self] in
            self?.gatherConsent(args) { [weak self] in
                self?.startLevelPlay(args, invoke)
            }
        }
    }

    // ── Consent (Google UMP) ─────────────────────────────────────────
    // A failed consent update or form must never cost the session its
    // ads: LevelPlay starts either way, and the networks then serve what
    // the stored consent signal (or its absence) allows.
    private func gatherConsent(_ args: InitArgs, done: @escaping () -> Void) {
        #if canImport(UserMessagingPlatform)
        if args.isChildDirected {
            done()
            return
        }
        let parameters = RequestParameters()
        parameters.isTaggedForUnderAgeOfConsent = false
        if args.consentDebugEea {
            // Debug builds only: pretend the device is in the EEA. Honoured
            // on registered test devices only.
            let debugSettings = DebugSettings()
            debugSettings.geography = .EEA
            parameters.debugSettings = debugSettings
        }
        ConsentInformation.shared.requestConsentInfoUpdate(with: parameters) { error in
            guard error == nil else {
                done()
                return
            }
            DispatchQueue.main.async { [weak self] in
                guard let vc = self?.topViewController else {
                    done()
                    return
                }
                ConsentForm.loadAndPresentIfRequired(from: vc) { _ in
                    done()
                }
            }
        }
        #else
        done()
        #endif
    }

    private func privacyOptionsRequired() -> Bool {
        #if canImport(UserMessagingPlatform)
        return ConsentInformation.shared.privacyOptionsRequirementStatus == .required
        #else
        return false
        #endif
    }

    // ── LevelPlay ────────────────────────────────────────────────────
    private func startLevelPlay(_ args: InitArgs, _ invoke: Invoke) {
        let initRequest = LPMInitRequestBuilder(appKey: args.appKey).build()

        LevelPlay.initWith(initRequest) { [weak self] _, error in
            guard let self = self else { return }

            if let error = error {
                invoke.reject("levelplay init failed: \(error.localizedDescription)")
                return
            }

            self.initialized = true

            // Create per-format ad objects only when the caller supplied
            // a matching unit ID. Missing IDs leave the object nil and
            // surface as "not-configured" on show.
            if !args.rewardedAdUnitId.isEmpty {
                let rw = LPMRewardedAd(adUnitId: args.rewardedAdUnitId)
                rw.setDelegate(self)
                self.rewardedAd = rw
                self.rewardedAdUnitId = args.rewardedAdUnitId
                rw.loadAd()
            }

            if !args.interstitialAdUnitId.isEmpty {
                let itl = LPMInterstitialAd(adUnitId: args.interstitialAdUnitId)
                itl.setDelegate(self)
                self.interstitialAd = itl
                self.interstitialAdUnitId = args.interstitialAdUnitId
                itl.loadAd()
            }

            invoke.resolve([
                "initialized": true,
                "privacyOptionsRequired": self.privacyOptionsRequired(),
            ])
        }
    }

    // Re-opens the consent form so a player can change their choice — the
    // "privacy options entry point" Google requires wherever UMP said a
    // form was needed (`privacyOptionsRequired` in the init response).
    @objc public func showPrivacyOptions(_ invoke: Invoke) throws {
        #if canImport(UserMessagingPlatform)
        DispatchQueue.main.async { [weak self] in
            guard let vc = self?.topViewController else {
                invoke.resolve(["shown": false, "error": "no-view-controller"])
                return
            }
            ConsentForm.presentPrivacyOptionsForm(from: vc) { error in
                if let error = error {
                    invoke.resolve(["shown": false, "error": error.localizedDescription])
                } else {
                    invoke.resolve(["shown": true])
                }
            }
        }
        #else
        invoke.resolve(["shown": false, "error": "consent-sdk-unavailable"])
        #endif
    }

    @objc public func showRewarded(_ invoke: Invoke) throws {
        guard initialized else {
            invoke.reject("levelplay: not initialized")
            return
        }
        guard let rw = rewardedAd else {
            invoke.resolve(["shown": false, "rewarded": false, "error": "not-configured"])
            return
        }
        guard rw.isAdReady() else {
            rw.loadAd()
            invoke.resolve(["shown": false, "rewarded": false, "error": "no-fill"])
            return
        }
        guard pendingRewarded == nil else {
            invoke.resolve(["shown": false, "rewarded": false, "error": "already-showing"])
            return
        }
        pendingRewarded = invoke
        lastRewardGranted = false
        DispatchQueue.main.async { [weak self] in
            guard let vc = self?.topViewController else {
                let pending = self?.pendingRewarded
                self?.pendingRewarded = nil
                pending?.resolve([
                    "shown": false, "rewarded": false, "error": "no-view-controller",
                ])
                return
            }
            rw.showAd(viewController: vc, placementName: nil)
        }
    }

    // Opens LevelPlay's Test Suite overlay over the running app. Requires
    // `is_test_suite=enable` metadata to have been set BEFORE the SDK was
    // initialized (the JS provider does this when `enableTestSuite=true`
    // is passed to `init`). The Test Suite serves test ads regardless of
    // account-approval / store-publication status, which is the diagnostic
    // we need pre-launch.
    @objc public func launchTestSuite(_ invoke: Invoke) throws {
        guard initialized else {
            invoke.resolve(["launched": false, "error": "levelplay: not initialized"])
            return
        }
        DispatchQueue.main.async { [weak self] in
            guard let vc = self?.topViewController else {
                invoke.resolve(["launched": false, "error": "no-view-controller"])
                return
            }
            LevelPlay.launchTestSuite(vc)
            invoke.resolve(["launched": true])
        }
    }

    @objc public func showInterstitial(_ invoke: Invoke) throws {
        guard initialized else {
            invoke.reject("levelplay: not initialized")
            return
        }
        guard let itl = interstitialAd else {
            invoke.resolve(["shown": false, "error": "not-configured"])
            return
        }
        guard itl.isAdReady() else {
            itl.loadAd()
            invoke.resolve(["shown": false, "error": "not-ready"])
            return
        }
        guard pendingInterstitial == nil else {
            invoke.resolve(["shown": false, "error": "already-showing"])
            return
        }
        pendingInterstitial = invoke
        DispatchQueue.main.async { [weak self] in
            guard let vc = self?.topViewController else {
                let pending = self?.pendingInterstitial
                self?.pendingInterstitial = nil
                pending?.resolve([
                    "shown": false, "error": "no-view-controller",
                ])
                return
            }
            itl.showAd(viewController: vc, placementName: nil)
        }
    }

    // ── LPMRewardedAdDelegate ────────────────────────────────────────
    func didLoadAd(with adInfo: LPMAdInfo) {
        emitReadiness("rewarded-state", ready: true)
    }

    func didFailToLoadAd(withAdUnitId adUnitId: String, error: Error) {
        // Same selector signature is shared by both rewarded and
        // interstitial delegates in 9.x. We can't distinguish here
        // without unit-id matching, so emit both — JS only acts on the
        // ref that's actually backing a visible button.
        let errorMsg = error.localizedDescription
        if rewardedAdUnitId == adUnitId {
            emitReadiness("rewarded-state", ready: false, error: errorMsg)
        }
        if interstitialAdUnitId == adUnitId {
            emitReadiness("interstitial-state", ready: false, error: errorMsg)
        }
    }

    func didChangeAdInfo(_ adInfo: LPMAdInfo) {}
    func didDisplayAd(with adInfo: LPMAdInfo) {}

    func didFailToDisplayAd(with adInfo: LPMAdInfo, error: Error) {
        // Either format may emit this — dispatch by which pending
        // invoke is set. Only one show can be in flight per format at
        // a time (we reject overlap with "already-showing"), so a
        // non-nil pending slot identifies the active format.
        if let pending = pendingRewarded {
            pendingRewarded = nil
            lastRewardGranted = false
            pending.resolve([
                "shown": false, "rewarded": false,
                "error": error.localizedDescription,
            ])
            emitReadiness("rewarded-state", ready: false)
            rewardedAd?.loadAd()
        } else if let pending = pendingInterstitial {
            pendingInterstitial = nil
            pending.resolve([
                "shown": false,
                "error": error.localizedDescription,
            ])
            emitReadiness("interstitial-state", ready: false)
            interstitialAd?.loadAd()
        }
    }

    func didClickAd(with adInfo: LPMAdInfo) {}

    func didCloseAd(with adInfo: LPMAdInfo) {
        if let pending = pendingRewarded {
            pendingRewarded = nil
            let granted = lastRewardGranted
            lastRewardGranted = false
            pending.resolve(["shown": true, "rewarded": granted])
            emitReadiness("rewarded-state", ready: false)
            rewardedAd?.loadAd()
        } else if let pending = pendingInterstitial {
            pendingInterstitial = nil
            pending.resolve(["shown": true])
            emitReadiness("interstitial-state", ready: false)
            interstitialAd?.loadAd()
        }
    }

    func didRewardAd(with adInfo: LPMAdInfo, reward: LPMReward) {
        // Fired BEFORE didCloseAd. Just record; the resolve happens on
        // close so the caller knows playback ended (not just that the
        // reward was credited).
        lastRewardGranted = true
    }

    // ── LPMInterstitialAdDelegate (overlapping methods inherited above) ──
    // The interstitial delegate's didLoadAd / didFailToLoadAd /
    // didFailToDisplayAd / didCloseAd selectors share signatures with
    // the rewarded delegate, so the implementations above cover both.
}

@_cdecl("init_plugin_levelplay")
func initPlugin() -> Plugin {
    return LevelPlayPlugin()
}
