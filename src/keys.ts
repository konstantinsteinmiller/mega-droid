// ─── Game-state field catalogue ─────────────────────────────────────────────
//
// Field names INSIDE the single `mega_droid_state` blob (see
// `useGameState.ts`). These are NOT separate localStorage keys — they are
// properties of the one persisted object — but they are still a contract with
// the player base: renaming any of them strands existing players' progress on
// the old field. Treat them as load-bearing constants.
//
// Everything is `ma_`-prefixed (`STATE_FIELD_PREFIX`) so
// `SaveMergePolicy.isPayloadKey` can allowlist the whole surface with a single
// prefix.

// ─── Headline progress (flat numbers the save-merge score reads) ───────────
//
// Kept as flat numeric fields rather than buried inside `ma_hero` because the
// save layer scores two snapshots against each other WITHOUT knowing anything
// about the game's object shapes (`SaveMergePolicy.computeMeta`), and a portal
// plugin (GamePix) reports two of them as score/level.

/** Hero level, 1-based. */
export const LEVEL_KEY = 'ma_level'
/** Story progress: number of sectors whose Core Master is defeated. */
export const STORY_KEY = 'ma_story'
/** Lifetime missions completed (story + jobs). */
export const QUESTS_DONE_KEY = 'ma_quests_done'
/** Bolts — the single currency. */
export const BOLTS_KEY = 'ma_bolts'

// ─── Structured progress ────────────────────────────────────────────────────

/** `HeroSave` — xp, attributes, skill ranks, unlocked + equipped weapons. */
export const HERO_KEY = 'ma_hero'
/** `InventorySave` — items, equipped slots, repair tanks. */
export const INVENTORY_KEY = 'ma_inventory'
/** `QuestSave` — the job board, the active mission's quest, story flags. */
export const QUESTS_KEY = 'ma_quests'
/** `WorldSave` — unlocked sectors, bosses defeated, first-time flags. */
export const WORLD_KEY = 'ma_world'
/** `StatsSave` — lifetime kills, deaths, chests, play time. */
export const STATS_KEY = 'ma_stats'
/**
 * `MissionSnapshot | null` — the resumable mid-mission state.
 *
 * Maps are regenerated deterministically from `(sector, seed)`, so the
 * snapshot only carries what the player CHANGED: which enemies died, which
 * chests and crates are open, which pickups are gone, the objective counters,
 * the player's cell and vitals. A reload or a cloud sync on another device
 * drops the player back into the same mission, not at the hub.
 */
export const MISSION_KEY = 'ma_mission'
/** `Record<TipId, true>` — onboarding tips the player has already seen. */
export const TUTORIAL_KEY = 'ma_tutorial'

// ─── Leaderboard identity + posting bookkeeping ─────────────────────────────
//
// All of these live inside the same `ma_` blob as everything else, so they
// ride the cloud save with the rest of the player's progress. An id that does
// not survive a device change hands the same player a second row on a board.

/** The player's stable leaderboard id — the primary key of their row. */
export const PLAYER_ID_KEY = 'ma_player_id'
/** A name the player chose for themselves. Highest precedence. */
export const PLAYER_NAME_KEY = 'ma_player_name'
/** The last display name a platform SDK handed us, remembered. */
export const SDK_NAME_KEY = 'ma_sdk_name'
/** The generated fallback name, minted once and kept. */
export const ANON_NAME_KEY = 'ma_anon_name'
/** The name the board row is currently labelled with, as far as we know. */
export const POSTED_NAME_KEY = 'ma_posted_name'
/** The best score (lifetime XP) the server has ACCEPTED. The whole write rule
 *  is `score > this`, so it may only be set after a confirmed 200. */
export const SUBMITTED_SCORE_KEY = 'ma_submitted_score'
/** The best score the PORTAL's own board accepted. Its own key: the two boards
 *  fail independently. */
export const PORTAL_POSTED_SCORE_KEY = 'ma_portal_posted_score'
/** Whether this player already has a row on the portal's board. */
export const PORTAL_JOINED_KEY = 'ma_portal_joined'

// ─── User settings ──────────────────────────────────────────────────────────

export const SOUND_KEY = 'ma_user_sound_volume'
export const MUSIC_KEY = 'ma_user_music_volume'
export const LANGUAGE_KEY = 'ma_user_language'
/** `true` once the PLAYER picked a language in Options. A stored language
 *  without it (seeded from a portal by older builds) is not a choice. */
export const LANGUAGE_CHOSEN_KEY = 'ma_user_language_chosen'
export const DIFFICULTY_KEY = 'ma_user_difficulty'
export const MUSIC_TRACK_KEY = 'ma_user_music_track'
/** Look sensitivity multiplier (number, 0.4–2.0). Absent = 1. */
export const LOOK_SENS_KEY = 'ma_user_look_sensitivity'
/** Mobile-only hard audio mute (boolean). */
export const MOBILE_MUTE_KEY = 'ma_mobile_mute'
/** Vibration on / off (boolean). Absent means ON — see `useHaptics.ts`. */
export const HAPTICS_KEY = 'ma_user_haptics'
/** Kill-cams on / off (boolean). Absent means ON — see `useKillCam.ts`. */
export const KILLCAM_KEY = 'ma_user_killcam'
/** English voice-over for a language that has none of its own (boolean).
 *  Absent means NOT ASKED yet, and no English voice — see `useEnglishVoice.ts`. */
export const ENGLISH_VOICE_KEY = 'ma_user_english_voice'
/** Rebound main keys, action → `KeyboardEvent.code` (`engine/keyBindings.ts`). */
export const KEY_BINDINGS_KEY = 'ma_user_key_bindings'
/** Keyboard layout: auto-detect on / off, the manual pick, the layout last
 *  detected from typing (`engine/keyLabels.ts`). */
export const KB_LAYOUT_KEY = 'ma_user_keyboard_layout'
