// ─── LevelPlayProvider no-op stub (non-native builds only) ──────────────────
// `resolveAdProvider` STATICALLY imports every provider, so the LevelPlay
// function body (command names, env-id reads) would live in every web bundle.
// Aliased away in `vite.config.ts` unless `VITE_APP_NATIVE=true`.
import { ref } from 'vue'
import type { AdProvider } from './types'

const inertRef = ref(false)

export const levelPlayDebug = ref({
  platform: 'unknown',
  childDirected: true,
  appKeyConfigured: false,
  rewardedIdConfigured: false,
  interstitialIdConfigured: false,
  initState: 'idle',
  initError: '',
  lastRewardedShowError: '',
  lastInterstitialShowError: '',
  events: [] as string[]
})

export const launchLevelPlayTestSuite = async (): Promise<boolean> => false

export const createLevelPlayProvider = (): AdProvider => ({
  name: '',
  isReady: inertRef,
  isRewardedReady: inertRef,
  isInterstitialReady: inertRef,
  isAdsBlocked: inertRef,
  init: async () => {},
  showRewardedAd: async () => false,
  showMidgameAd: async () => {}
})
