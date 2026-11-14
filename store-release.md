# Mega Droid — store release tracker (Play first)

Decisions (2026-11-13): id `com.hyperg8.megadroid` · audience teen 13+ (not Families) · landscape locked
(`sensorLandscape`) · shared `hyperg8-release.keystore` (alias hyperg8, Play App Signing) · closed track "Alpha" with the shared tester group · iOS later (no IAP plugin copied yet).

## Done by the agent
- [x] `src-tauri/` shell, LevelPlay plugin, Cargo.lock pin, release profile, capabilities
- [x] `gen/android` generated + Battlecross hand edits (signing, admob placeholder, versionCode env, AAB copy, Kotlin 2.1.20, landscape)
- [x] `.env.tauri` (new shape), `.env.tauri.remote` (1000001), ads gate, version-code bump, package scripts
- [x] LevelPlay provider wiring, stub alias, privacy buttons + i18n (39 locales), back button, resolver tests
- [x] Icons regenerated from `public/icons/icon.svg`; debug APK builds (aarch64)
- [x] iOS workflows + Fastlane copied and renamed (IAP off) — not yet run

## Owner / console steps (human logins) — in this order
1. [ ] Privacy-policy page `?megadroid-privacy-policy-en=true` (EN + DE) on the hyperg8 site, HTTP 200
2. [ ] AdMob: Android app + Rewarded & Interstitial units (RTB-for-mediation ticked) → add to GDPR + US-states messages
3. [ ] Unity Ads: Android app (Game ID + placements), not child-directed
4. [ ] LevelPlay: Android app, COPPA not directed, rewarded + interstitial, bidders ironSource + Google + Unity
5. [ ] Paste the ids into `.env.tauri` → `pnpm tauri:build-android-aab`
6. [ ] Play Console: create app, App content answers, listing (icon 512, feature graphic 1024x500, 2-8 landscape screenshots), closed track Alpha → upload AAB
7. [ ] 12 testers x 14 days → production; then AdMob "Add store" + LevelPlay store link

## Ids created (2026-11-14)
- Play Console app: `com.hyperg8.megadroid`, app id 4972053510144221947 (draft, developer 6829362737497959240)
- Unity Ads project "Mega Droid": Android Game ID 800438032 (BP_Rewarded_Android, BP_Interstitial_Android), iOS Game ID 800438033 (BP_Rewarded_iOS, BP_Interstitial_iOS)
- AdMob Android app `ca-app-pub-4823250874530748~2227876267`: rewarded `…/4662467910`, interstitial `…/4550787271` (both RTB-flagged). `…/9643156848` is an UNUSED rewarded unit created without the RTB flag by mistake (cannot be changed) — never use it.
- AdMob iOS app `ca-app-pub-4823250874530748~3051883670`: rewarded `…/1844732885`, interstitial `…/1764666824` (both RTB-flagged)
- LevelPlay Android app key `298c5b51d`: rewarded `6kep2h05okgur18g`, interstitial `g75wfar68e9btd91`
- LevelPlay iOS app key `298c5eea5`: rewarded `01tm6i77acze4d2v`, interstitial `5f52jjkh8y8fm08a`
- Both LevelPlay apps: "Not live yet", COPPA Not directed. STILL TO DO in LevelPlay: Networks → bidders (ironSource, Google, UnityAds) per app/format.
- LevelPlay mediation done 2026-11-14: Android = ironSource + UnityAds (800438032) + Google (AdMob units), iOS = ironSource + Google. iOS UnityAds bidder intentionally NOT set up (no Unity adapter in the iOS binary, ADS.md §7).
- Play Console privacy policy URL set (2026-11-14): https://konstantinsteinmiller.github.io/hyperg8/?megadroid-privacy-policy-en=true — the page is NOT live until the hyperg8-webpage changes are pushed/deployed.

## Still open
- Push hyperg8-webpage (new megadroid policy EN/DE) and check HTTP 200 on the policy URL
- AdMob: add both Mega Droid apps to the GDPR + US-states messages (Privacy & messaging) and set the privacy-policy URL
- Play Console: remaining App content answers (content rating, target audience 13+, Data safety, ads declaration), store listing assets, Alpha closed track + AAB
- Apple side (ASC app record, signing repo, GitHub secrets/variables) for iOS

## Play Console state (2026-11-14, end of day)
- Done: privacy URL, ads (yes), app access (nothing restricted), content rating (violence vs non-human, fantasy), target audience 13+/16+/18+, data safety (imported from Battlecross, deletion URL = Mega Droid policy), advertising ID (yes: analytics, advertising, fraud prevention), government/finance/health (no), trader status, category Action, contact email + website, default listing (name, short + full description, icon, feature graphic, 8 landscape screenshots), Alpha track countries (all) + tester group closed-test-pro-@googlegroups.com + feedback email, release 1000001 (1.0.2) uploaded as a draft.
- NOT done: "send changes for review" (needs owner go-ahead), tablet screenshots, store translations.
- Built locally: signed AAB, 55 MB, versionCode 1000001 uploaded; .env.tauri.remote now says 1000003 (the next build will use it). Opt-in link for testers: https://play.google.com/apps/testing/com.hyperg8.megadroid (works only after Google approves the release).

## 2026-11-14 late
- Play: listing screenshots replaced with the stores/ 1920x1080 set; 1 listing change waits on "Send for review" (Publishing overview). Release 1000001 (1.0.2) already shows "available to selected testers" on Alpha.
- iOS: bootstrap signing run #2 green (macos-15; macos-14 is rejected by GitHub), iOS Build & Sign #1 green with TestFlight upload (10m47s). ASC session expired: owner must log in to attach the build, add the 2868x1320 / 2752x2064 screenshots, publish the privacy label and submit.
