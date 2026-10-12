import { computed, ref, watch } from 'vue'
import type { Ref } from 'vue'
import { mobileCheck } from '@/utils/function'
import { DIFFICULTY, type Difficulties } from '@/utils/enums'
import { isDbInitialized, isSplashScreenVisible } from '@/use/useMatch'
import { saveDataVersion } from '@/use/useSaveStatus'
import { getState, setState, hasState, removeState, flushPersist } from '@/use/useGameState'
import {
  SOUND_KEY, MUSIC_KEY, LANGUAGE_KEY, LANGUAGE_CHOSEN_KEY, DIFFICULTY_KEY, MUSIC_TRACK_KEY
} from '@/keys'

export const windowWidth = ref(window.innerWidth)
export const windowHeight = ref(window.innerHeight)

export const orientation = ref(mobileCheck() && windowWidth.value > windowHeight.value ? 'landscape' : 'portrait')

export const isMobileLandscape = computed(() =>
  mobileCheck() && windowWidth.value > 500 && orientation.value === 'landscape'
)
export const isMobilePortrait = computed(() =>
  mobileCheck() && windowWidth.value < windowHeight.value
)

// A short viewport (≤ 500px tall) where the full-size desktop result/reward
// overlay overflows — e.g. the game embedded in a portal iframe on a
// Chromebook (~764×385). Deliberately NOT gated on `mobileCheck()`, so it
// catches the non-touch short-embed case that `isMobileLandscape` misses; the
// overlay uses it to shrink the title, drop the tiles line, and tighten gaps.
export const isShortViewport = computed(() => windowHeight.value <= 500)

declare const APP_VERSION: string
export const isCrazyWeb = import.meta.env.VITE_APP_CRAZY_WEB === 'true'
export const isWaveDash = import.meta.env.VITE_APP_WAVEDASH === 'true'
export const isItch = import.meta.env.VITE_APP_ITCH === 'true'
export const isGlitch = import.meta.env.VITE_APP_GLITCH === 'true'
export const isGameDistribution = import.meta.env.VITE_APP_GAME_DISTRIBUTION === 'true'
export const isPlaygama = import.meta.env.VITE_APP_PLAYGAMA === 'true'
export const isGamepix = import.meta.env.VITE_APP_GAMEPIX === 'true'
export const isGameMonetize = import.meta.env.VITE_APP_GAME_MONETIZE === 'true'
export const isYandex = import.meta.env.VITE_APP_YANDEX === 'true'
export const isPoki = import.meta.env.VITE_APP_POKI === 'true'
export const showMediatorAds = import.meta.env.VITE_APP_SHOW_MEDIATOR_ADS === 'true'
export const isNative = import.meta.env.VITE_APP_NATIVE === 'true'
export const isWeb = import.meta.env.VITE_APP_NATIVE !== 'true'
export const isDemo = import.meta.env.VITE_APP_DEMO === 'true'
export const version: string = APP_VERSION

// ─── Persisted settings ────────────────────────────────────────────────────
//
// Survivalist persists FIVE user settings — difficulty, sound volume, music
// volume, locale, music track — as fields inside the single `mega_droid_state`
// blob (keys catalogued in `src/keys.ts`), never as their own localStorage
// entries. On a platform build the blob goes through the patched
// `SaveManager.setItem` and is mirrored to the SDK cloud store automatically.
// Hydrate at boot is a synchronous read; the strategy populates localStorage
// from the cloud BEFORE the App module graph imports (see `main.ts`).
//
// Key constants are re-exported here so long-standing importers
// (`useCrazyMuteSync`, tests) keep working without an extra import hop.
export { SOUND_KEY, MUSIC_KEY, LANGUAGE_KEY, DIFFICULTY_KEY, MUSIC_TRACK_KEY }

// Background-music track id → audio filename (under public/audio/music/).
export type MusicTrack = 'trance' | 'cozy'
export const MUSIC_TRACK_FILES: Record<MusicTrack, string> = {
  trance: 'trance.ogg',
  cozy: 'bg-cozy.ogg'
}

const readNumber = (key: string, fallback: number): number => {
  const v = getState<unknown>(key)
  if (v === undefined || v === null) return fallback
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return Number.isFinite(n) ? n : fallback
}
const readString = <T extends string>(key: string, fallback: T): T => {
  const v = getState<unknown>(key)
  if (v === undefined || v === null) return fallback
  return String(v) as T
}

/** Default audio levels for a fresh install. Exported so the mute toggle
 *  (`useCrazyMuteSync`) can restore to the same levels when a user unmutes
 *  but there's no pre-mute snapshot to fall back to. */
export const DEFAULT_SOUND_VOLUME = 0.7
/** Music starts BELOW the effects for a first-time player: at 0.6 the score sat
 *  on top of the game, and loud music is the first thing a new player mutes.
 *  Only a fresh install sees this — a saved slider value wins. */
export const DEFAULT_MUSIC_VOLUME = 0.4

/**
 * The player's own mute (F2, the speaker buttons), held this session as a hard
 * silence ON TOP of the zeroed volumes. The volumes alone were not enough: a
 * cloud re-hydrate re-reads them from a save that may predate the mute, and the
 * music came back while the button still promised silence. The audio graph
 * keeps every bus at 0 while this is set, whatever the volumes say; only the
 * player lifts it — the mute toggle again, or raising a volume slider.
 */
export const playerMuted = ref(false)

const userSoundVolume: Ref<number> = ref(readNumber(SOUND_KEY, DEFAULT_SOUND_VOLUME))
const userMusicVolume: Ref<number> = ref(readNumber(MUSIC_KEY, DEFAULT_MUSIC_VOLUME))
const userLanguage: Ref<string> = ref(readString(LANGUAGE_KEY, 'en'))
// Difficulty defaults to MEDIUM. It scales enemy HP + wave budget (Easy −20%,
// Hard +25%) via `difficultyFactor()` below, read by the wave director.
const userDifficulty: Ref<Difficulties> = ref(readString<Difficulties>(DIFFICULTY_KEY, DIFFICULTY.MEDIUM))
// Background-music track — defaults to 'trance' ("Overdrive").
const userMusicTrack: Ref<MusicTrack> = ref(readString<MusicTrack>(MUSIC_TRACK_KEY, 'trance'))

// Re-read on hydrate-success bump. Module init reads these synchronously
// from localStorage, but on cloud-only builds (CrazyGames) the blob is
// in-memory only — `useUser.ts` is one of the few composables imported at
// the top of `main.ts`, so its module evaluation runs BEFORE
// `await saveManager.init()` populates the blob from `sdk.data`. Without
// this watcher the user's saved difficulty / volume / language would
// silently revert to defaults on every refresh.
//
// Settings-stranding fix: after refreshing refs from localStorage, write
// the current ref value back for any setting still null in localStorage.
// Triggers the patched setItem path → strategy.onLocalSet → sdk.data, so
// even a player who never opens OptionsModal ends up with their settings
// round-tripping through the cloud. Idempotent for returning players
// because hydrate has already populated localStorage from sdk.data.
//
// LANGUAGE is intentionally NOT seeded here: main.ts handles it
// separately so the CrazyGames portal locale (`cgLocale`) can seed
// first-time players. If we wrote the default 'en' here, main.ts's
// "is there a stored choice?" probe would always see a value and
// never apply the portal locale to a fresh player.
watch(saveDataVersion, () => {
  userSoundVolume.value = readNumber(SOUND_KEY, userSoundVolume.value)
  userMusicVolume.value = readNumber(MUSIC_KEY, userMusicVolume.value)
  userLanguage.value = readString(LANGUAGE_KEY, userLanguage.value)
  userDifficulty.value = readString<Difficulties>(DIFFICULTY_KEY, userDifficulty.value)
  userMusicTrack.value = readString<MusicTrack>(MUSIC_TRACK_KEY, userMusicTrack.value)

  if (!hasState(SOUND_KEY)) setState(SOUND_KEY, userSoundVolume.value)
  if (!hasState(MUSIC_KEY)) setState(MUSIC_KEY, userMusicVolume.value)
  if (!hasState(DIFFICULTY_KEY)) setState(DIFFICULTY_KEY, userDifficulty.value)
  if (!hasState(MUSIC_TRACK_KEY)) setState(MUSIC_TRACK_KEY, userMusicTrack.value)
})

/** Wave-pressure multiplier for the active difficulty: Easy −20% (smaller wave
 *  budgets and softer enemies), Medium ×1, Hard +25% (denser waves, tankier
 *  enemies). Read by the wave director when composing a wave. */
export const difficultyFactor = (): number => {
  if (userDifficulty.value === DIFFICULTY.EASY) return 0.8
  if (userDifficulty.value === DIFFICULTY.HARD) return 1.25
  return 1
}

// Boot signal that several composables (`main.ts`, `useCrazyMuteSync`,
// the i18n loader) wait on. Previously the IDB hydrate flipped this; with
// localStorage we have synchronous reads, so flip immediately. The
// SaveManager has already populated localStorage from the cloud strategy
// before this module evaluates (see `main.ts`: `await saveManager.init()`
// runs BEFORE `import('@/App.vue')`).
isDbInitialized.value = true
isSplashScreenVisible.value = false

// One-time legacy cleanup. CG QA's standing rule is "NO locally-saved
// data" — both localStorage AND sessionStorage count. We sweep relics
// from prior builds at module load:
//   • `user_db` IndexedDB store — held CardQuest userHand / userCollection
//     / quest-* relics nothing here references.
//   • `card*` keys (case-insensitive) — the CardQuest-era prefix that
//     produced `cardQuestUserLanguage`, `cardQuestSoundVolume`, etc.
//   • `chaosArena*` keys — the interim prefix from the
//     2026-05-04 build. We no longer mirror the locale hint to
//     sessionStorage at all (the value lives in `ts_user_language`,
//     which flows through `sdk.data` on CG), so any existing
//     `chaosArena*` entry is also dead data.
// Fire-and-forget — errors are swallowed because there is nothing to
// recover. Runs at module load (useUser.ts is imported at the top of
// main.ts) so the data is gone before the rest of the app boots.
try {
  if (typeof window !== 'undefined' && window.indexedDB?.deleteDatabase) {
    const req = window.indexedDB.deleteDatabase('user_db')
    req.onerror = () => { /* no-op: harmless if locked / already gone */
    }
  }
} catch { /* harmless */
}
const LEGACY_KEY_RE = /^(card|chaosArena)/i
const sweepLegacyKeys = (storage: Storage) => {
  try {
    const toRemove: string[] = []
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i)
      if (k && LEGACY_KEY_RE.test(k)) toRemove.push(k)
    }
    for (const k of toRemove) storage.removeItem(k)
  } catch { /* harmless */
  }
}
sweepLegacyKeys(localStorage)
sweepLegacyKeys(sessionStorage)

/**
 * Forget the player's language choice — the portal changed its language, and a
 * portal CHANGE outranks a stored choice (see `src/i18n/portalLanguage.ts`).
 *
 * `displayed` is the language the game now shows, so the Options dropdown
 * follows it; it is NOT persisted. Writing it through `setSettingValue` would
 * store platform state in the player's key, where it would outrank every later
 * portal language — the bug this contract exists to prevent.
 *
 * Persisted AT ONCE, not on the save debounce: at boot this runs moments before
 * main.ts re-reads the blob from storage (`reloadGameState`), which would
 * otherwise bring the old choice straight back — the portal language would win
 * for one session and the stale choice would reach the cloud and return on the
 * next visit (measured on the built Wrap archive).
 */
export const clearLanguageChoice = (displayed: string): void => {
  removeState(LANGUAGE_KEY)
  removeState(LANGUAGE_CHOSEN_KEY)
  flushPersist()
  userLanguage.value = displayed
}

/**
 * Did the PLAYER choose the stored language (in Options)?
 *
 * "A language is stored" used to mean that, but older builds wrote the
 * CrazyGames / Yandex / Poki portal language into the same key, and a portal
 * value written there outranked every later portal language for good (synced
 * through the cloud save). Only Options sets the flag, so those saves read as
 * "no choice" and follow the portal again.
 */
export const hasLanguageChoice = (): boolean =>
  hasState(LANGUAGE_KEY) && getState<boolean>(LANGUAGE_CHOSEN_KEY, false) === true

// ─── Composable surface ───────────────────────────────────────────────────

const useUser = () => {
  const setSettingValue = (name: string, value: unknown) => {
    switch (name) {
      case 'sound':
        if (+(value as number) > 0) playerMuted.value = false
        userSoundVolume.value = +(value as number)
        setState(SOUND_KEY, userSoundVolume.value)
        break
      case 'music':
        if (+(value as number) > 0) playerMuted.value = false
        userMusicVolume.value = +(value as number)
        setState(MUSIC_KEY, userMusicVolume.value)
        break
      case 'language':
        userLanguage.value = value as string
        setState(LANGUAGE_KEY, userLanguage.value)
        setState(LANGUAGE_CHOSEN_KEY, true)
        break
      case 'difficulty':
        userDifficulty.value = value as Difficulties
        setState(DIFFICULTY_KEY, userDifficulty.value)
        break
      case 'musicTrack':
        userMusicTrack.value = value as MusicTrack
        setState(MUSIC_TRACK_KEY, userMusicTrack.value)
        break
    }
  }

  return {
    userSoundVolume,
    userMusicVolume,
    userLanguage,
    userDifficulty,
    userMusicTrack,
    setSettingValue
  }
}

export default useUser
