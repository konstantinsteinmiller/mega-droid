# Mega Droid native ads — state

Updated 2026-11-13. Mirrors Battlecross's `ADS_STATE.md`; the playbook is the user-level `tauri-mobile-ci` skill (`ADS.md`).

- **Stack:** Unity LevelPlay (ironSource) is the only native ad SDK. It mediates ironSource, Google AdMob and Unity Ads
  (bidding). Plugin: `src-tauri/plugins/tauri-plugin-levelplay` (copied from Battlecross, pinned SDKs). JS side:
  `src/use/ads/LevelPlayProvider.ts`, chosen in `src/platforms/resolveAdProvider.ts` when `VITE_APP_NATIVE` and
  `VITE_APP_SHOW_MEDIATOR_ADS` are true. Web builds alias it to the `.stub.ts` (verified: no `plugin:levelplay` / Tauri
  strings in a default web bundle).
- **Audience:** teen 13+, not child-directed (`VITE_APP_ADS_CHILD_DIRECTED=false`). Never Families. Keep listing art and
  wording teen-or-older (the trailer brief's "10-15 year old" wording must not reach the Play listing).
- **Placements:** the same as the web build — rewarded buttons show only while `isRewardedReady`; interstitial gating via
  `useAdGate`.
- **Consent:** Google UMP before `LevelPlay.init` (EEA/UK/CH). Options shows "Privacy settings" while UMP requires it and
  "Privacy policy" (`VITE_APP_PRIVACY_POLICY_URL`). Keys `privacy.policy` / `privacy.settings` exist in all 39 locales.
- **Gate:** `scripts/native-ads-gate.mjs` runs before every AAB; it currently BLOCKS (all Android ids empty) — correct.
- **Ids to fill in `.env.tauri`:** `VITE_APP_LEVELPLAY_ANDROID_{APP_ID,REWARDED_ID,INTERSTITIAL_ID}`,
  `VITE_APP_ADMOB_ANDROID_APP_ID` (iOS ones later).
