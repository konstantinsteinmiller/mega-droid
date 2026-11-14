#!/usr/bin/env node
// ─── Release gate: what a store bundle may not contain ──────────────────────
//
//   dotenv -e .env.tauri -- node scripts/native-ads-gate.mjs
//
// Chained in front of `tauri:build-android-aab`. Every check here is a
// mistake that already cost, or would cost, a Play review round (~10 days):
//
//   • debug switches in a store build — the on-screen debug HUD, LevelPlay's
//     Test Suite opening over the game, Google UMP pretending every player is
//     in the EEA;
//   • a store build without the LevelPlay app key / ad units, or with
//     Google's test AdMob app ID in the manifest;
//   • an 18+ build without an in-app privacy policy link (Google Play wants
//     the policy reachable inside the app, not only on the store listing);
//   • ads in a child-directed build. Google Play's Families programme
//     requires every ad to be closeable after 5 seconds, and neither
//     LevelPlay's rewarded video nor AdMob's rewarded interstitial is
//     (measured 2026-10-02, ADS_STATE.md) — that combination ships with ads
//     off or not at all.
//
// Reads the same env the build reads. Exit 0 = the build may proceed.

const env = process.env
const problems = []

if (env.VITE_APP_DEBUG === 'true') {
  problems.push('VITE_APP_DEBUG=true — the on-screen debug HUD would ship to the store.')
}

const adsOn = env.VITE_APP_SHOW_MEDIATOR_ADS === 'true'
const childDirected = env.VITE_APP_ADS_CHILD_DIRECTED !== 'false'
let summary = 'native ads OFF'

if (adsOn) {
  summary = `native ads ON — LevelPlay, ${childDirected ? 'child-directed' : 'not child-directed (18+)'}`

  if (childDirected) {
    problems.push(
      'ads are on in a child-directed build. No ad stack this app has has passed Google Play\'s Families ' +
      '"closeable after 5 seconds" rule (ADS_STATE.md). Ship with VITE_APP_SHOW_MEDIATOR_ADS=false, or as an ' +
      '18+ title with VITE_APP_ADS_CHILD_DIRECTED=false and the matching Play Console target audience.'
    )
  }
  if (env.VITE_APP_ADS_TEST_SUITE === 'true') {
    problems.push('VITE_APP_ADS_TEST_SUITE=true — LevelPlay\'s Test Suite would open over the game for every player.')
  }
  if (env.VITE_APP_ADS_CONSENT_DEBUG_EEA === 'true') {
    problems.push('VITE_APP_ADS_CONSENT_DEBUG_EEA=true — a debug consent setting would ship.')
  }

  const required = ['VITE_APP_LEVELPLAY_ANDROID_APP_ID', 'VITE_APP_LEVELPLAY_ANDROID_REWARDED_ID']
  if (!childDirected) required.push('VITE_APP_LEVELPLAY_ANDROID_INTERSTITIAL_ID')
  for (const name of required) {
    if (!env[name]) problems.push(`${name} is empty — that ad would never load.`)
  }

  const admobAppId = env.VITE_APP_ADMOB_ANDROID_APP_ID || ''
  if (!admobAppId || admobAppId.startsWith('ca-app-pub-3940256099942544')) {
    problems.push(
      'VITE_APP_ADMOB_ANDROID_APP_ID is empty or Google\'s test app ID — the AdMob bidder and the consent ' +
      'form need the real one (ca-app-pub-…~…).'
    )
  }

  if (!childDirected && !env.VITE_APP_PRIVACY_POLICY_URL) {
    problems.push(
      'VITE_APP_PRIVACY_POLICY_URL is empty — the app would have no in-app privacy policy link. Use the same ' +
      'URL as the Play Console store listing.'
    )
  }
}

if (problems.length) {
  console.error('\n[native-ads-gate] BLOCKED — this bundle must not go to Google Play:\n')
  for (const problem of problems) console.error(`  ✗ ${problem}`)
  console.error('\n  Settings live in .env.tauri. Background: ADS_STATE.md\n')
  process.exit(1)
}

console.log(`[native-ads-gate] ok — ${summary}`)
