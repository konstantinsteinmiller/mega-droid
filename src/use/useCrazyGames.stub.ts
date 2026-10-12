// ─── useCrazyGames no-op stub (non-CrazyGames builds only) ──────────────────
//
// This file replaces `src/use/useCrazyGames.ts` on builds that don't target
// CrazyGames, via a Vite `resolve.alias` configured in `vite.config.ts`. On
// CG builds the alias is absent and the real `useCrazyGames.ts` is used.
//
// Why a stub: the real module contains literal strings like the CG SDK
// environment identifier ('crazygames'), the strategy class name
// ('crazyGames'), and `[crazygames] ...` console log prefixes. Yandex's
// moderation scanner flags ANY non-Yandex identifier-looking string with
// "Service storage URL detected", even bare names with no TLD. Many
// components (GameScene, BattlePass, AchievementsModal, OptionsModal,
// UpgradesModal, DailyRewards, SpinnerAchievementsModal) statically import
// from this module — so even if the actual code paths are dead on Yandex
// builds, module init pulls every literal into the bundle.
//
// The stub keeps the same EXPORT SHAPE as the real module so the static
// imports resolve, every CG-specific function is a no-op, and the bundle
// contains zero CG-identifier strings.
//
// Important constraint: the stub MUST NOT contain any 'crazygames' /
// 'crazyGames' literals itself. Console messages use a generic tag.

import { ref } from 'vue'
import type { Ref } from 'vue'
import type { SaveStrategy } from '@/utils/save/types'

// Reactive refs — kept at default values; no-op setters elsewhere.
export const isSdkActive: Ref<boolean> = ref(false)
export const isSdkMuted: Ref<boolean | null> = ref(null)
export const crazyPlayerName: Ref<string | null> = ref(null)
export const isCrazyAdsBlocked: Ref<boolean> = ref(false)
export const crazyLocale: Ref<string | null> = ref(null)

// Async initialisers — resolve immediately to nothing.
export const initCrazyGames = async (): Promise<void> => {}

export const createCrazyGamesSaveStrategy = async (): Promise<SaveStrategy> => {
  // Should never be called on non-CG builds (resolveSaveStrategy gates on
  // VITE_APP_CRAZY_WEB), but defensively return a minimal stub strategy so
  // the SaveManager doesn't throw if the dead branch ever ran.
  return {
    name: 'cg-stub',
    hydrateState: 'success-empty' as const,
    async hydrate() {},
    onLocalSet() {},
    onLocalRemove() {}
  }
}

// Sync no-op procedures. Components call these unconditionally; on non-CG
// builds we just swallow the call.
export const triggerHappytime = (): void => {}
export const startLoading = (): void => {}
export const stopLoading = (): void => {}
export const startGameplay = (): void => {}
export const stopGameplay = (): void => {}
export const syncGameplayLifecycle = (_live: boolean): void => { void _live }
export const __resetGameplayLifecycle = (): void => {}

// Mute-listener registry — return a no-op unsubscribe so callers can
// safely `const off = onCrazyMuteChange(cb); off()` without crashing.
type MuteCallback = (muted: boolean) => void
export const onCrazyMuteChange = (_cb: MuteCallback): (() => void) => () => {}
export const addCrazyMuteListener = onCrazyMuteChange
export const setCrazyMuted = (_muted: boolean): void => {}

// Ad show wrappers — never called on non-CG builds (resolveAdProvider gates
// to a different provider), but return contract-correct defaults defensively.
export const showRewardedAd = async (_onImpression?: () => void): Promise<boolean> => false
export const showMidgameAd = async (_onImpression?: () => void): Promise<void> => {}

const useCrazyGames = () => ({
  initCrazyGames,
  isSdkActive,
  isSdkMuted,
  crazyPlayerName,
  isCrazyAdsBlocked,
  crazyLocale,
  triggerHappytime,
  startLoading,
  stopLoading,
  startGameplay,
  stopGameplay,
  syncGameplayLifecycle,
  onCrazyMuteChange,
  addCrazyMuteListener,
  setCrazyMuted,
  showRewardedAd,
  showMidgameAd
})

export default useCrazyGames
