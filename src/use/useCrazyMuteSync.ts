import { onMounted, onUnmounted, computed, ref, watch } from 'vue'
import useUser, { DEFAULT_SOUND_VOLUME, DEFAULT_MUSIC_VOLUME, playerMuted } from '@/use/useUser'
import {
  isSdkActive,
  onCrazyMuteChange,
  setCrazyMuted
} from '@/use/useCrazyGames'
import { isDbInitialized } from '@/use/useMatch'

const { userSoundVolume, userMusicVolume, setSettingValue } = useUser()

// Muted: the player's own mute is on, or both volumes are at zero.
const isMuted = computed(() => playerMuted.value || (userMusicVolume.value === 0 && userSoundVolume.value === 0))

// Snapshot of the volumes at the moment WE muted in response to a
// platform-mute event. `null` means "no platform-mute in this session"
// — `applyMute(false)` must NOT restore from snapshot in that case.
//
// Previous version started with literal defaults (0.5 / 0.7). On a
// cold load where the SDK reported `muted=false` but the cloud-hydrated
// in-game volumes were 0/0 (user deliberately muted on a different
// device), the `else if` branch fired and overwrote the cloud's
// intentional 0/0 with the stale defaults. CG QA caught it 2026-05-05.
let muteSnapshot: { music: number; sound: number } | null = null

export const applyMute = (muted: boolean) => {
  if (muted && !isMuted.value) {
    // Platform muted, in-game wasn't — snapshot current volumes so we
    // can restore them when the platform unmutes.
    muteSnapshot = {
      music: userMusicVolume.value,
      sound: userSoundVolume.value
    }
    setSettingValue('music', 0)
    setSettingValue('sound', 0)
  } else if (!muted && isMuted.value && muteSnapshot) {
    // Platform unmuted AND we have a snapshot from an earlier platform
    // mute → restore. Without the snapshot guard this branch would also
    // fire on cold load when the user's cloud value happens to be 0/0
    // (deliberate manual mute) and the SDK reports "not muted" — we'd
    // overwrite the cloud with the snapshot's stale defaults.
    setSettingValue('music', muteSnapshot.music)
    setSettingValue('sound', muteSnapshot.sound)
    muteSnapshot = null
  }
}

/** Apply a mute that originated from the CrazyGames platform toolbar. Keeps
 *  the in-game state in sync with the CG chrome toggle (one-way: CG → game,
 *  since the SDK exposes no setter to push the in-game button back to CG).
 *  Thin wrapper over `applyMute` so the sync hook and tests share one path. */
export const applyPlatformMute = (muted: boolean) => {
  // The toolbar's unmute is the player's own click too: it lifts their mute.
  if (!muted) playerMuted.value = false
  applyMute(muted)
}

export const toggleMute = () => {
  const next = !isMuted.value
  if (next) {
    // Muting: snapshot the current (audible) volumes, zero them, and hold the
    // hard silence (`playerMuted`) that nothing but the player lifts.
    applyMute(true)
    playerMuted.value = true
    setCrazyMuted(next)
    return
  }
  playerMuted.value = false
  if (!isMuted.value) {
    // The volumes came back underneath the mute (a cloud re-hydrate): lifting
    // the latch was all it took, and the snapshot is stale now.
    muteSnapshot = null
  } else if (muteSnapshot) {
    // Unmuting with a snapshot from an earlier mute → restore it.
    applyMute(false)
  } else {
    // Unmuting with NO snapshot. `applyMute(false)` is a deliberate no-op in
    // that case (it must not clobber a deliberate cloud-saved 0/0 during a
    // PASSIVE platform sync). But a USER tapping the button is an explicit
    // request for sound, so always restore audible defaults — otherwise a
    // game that booted already-muted (e.g. CrazyGames reported muted, or the
    // cloud save was 0/0) stays stuck at 0/0 and the button never unmutes.
    // This is the "FMuteButton can't unmute on CG" fix.
    setSettingValue('music', DEFAULT_MUSIC_VOLUME)
    setSettingValue('sound', DEFAULT_SOUND_VOLUME)
  }
  setCrazyMuted(next)
}

export { isMuted }

/**
 * Call once at the App level to keep the CrazyGames platform mute toggle
 * in sync with the in-game volume for the entire session, regardless of
 * which components are mounted.
 *
 * Direction of truth: the CG SDK is the source of truth for the mute
 * state — there's no public setter, the platform chrome owns it. We
 * listen for `sdk.game.addSettingsChangeListener` events (the v3
 * canonical API — the legacy `addMuteListener` never fires on the real
 * SDK) via `onCrazyMuteChange`, which also replays the current state to
 * the subscriber on attach, so one hook covers both the initial sync
 * and every subsequent toggle.
 *
 * We gate the *initial* apply on `isDbInitialized`: if IndexedDB hasn't
 * hydrated saved volume settings yet, we stash the pending mute and
 * apply it once hydration finishes so we don't fight the loader. Later
 * toggles flow through immediately.
 */
export const useCrazyMuteSync = () => {
  let unsubscribe: (() => void) | null = null
  const pendingInitialMute = ref<boolean | null>(null)

  const handleSdkMute = (muted: boolean) => {
    if (!isDbInitialized.value) {
      pendingInitialMute.value = muted
      return
    }
    // `applyPlatformMute` ignores the event if the player has taken control —
    // so an in-game unmute is never re-muted by the platform.
    applyPlatformMute(muted)
  }

  const stopDbWatch = watch(isDbInitialized, (ready) => {
    if (!ready || pendingInitialMute.value === null) return
    applyPlatformMute(pendingInitialMute.value)
    pendingInitialMute.value = null
  })

  onMounted(() => {
    if (!isSdkActive.value) return
    unsubscribe = onCrazyMuteChange(handleSdkMute)
  })

  onUnmounted(() => {
    unsubscribe?.()
    unsubscribe = null
    stopDbWatch()
  })
}
