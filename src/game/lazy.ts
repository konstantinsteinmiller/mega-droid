/**
 * ─── The game's on-demand chunks ─────────────────────────────────────────────
 *
 * Every `import()` the game makes at run time lives here (the stage
 * generators have their own loader, `world/stages/load.ts`), because this
 * file is excluded from the obfuscator (`obfuscatorExclude.ts`). Its
 * stringArray pass rewrites a string literal into a decoder call at random
 * (60 % of them): an `import('./sim/coreDescent')` rewritten so cannot be
 * followed by the bundler, its chunk is never built, and the call fails in
 * the shipped game. That is how nine of the ten platform stages and the
 * Fortress's Core Descent went missing from the obfuscated builds (#121).
 *
 * A new lazy chunk gets its loader HERE; `tests/meta/lazyImports.test.ts`
 * fails on a dynamic import in any file the obfuscator would see.
 */

/** The mission engine: the biggest part of the game (`boot.ts`). */
export const loadMissionModule = () => import('./sim/mission')
/** The intro cutscene: a first-timer's, or a replay from Options. */
export const loadIntroModule = () => import('./story/intro')
/** The ending, after the Fortress. */
export const loadEndingModule = () => import('./story/ending')
/** The debrief after a story mission, and its loader. */
export const loadDebriefModule = () => import('./story/debrief')
export const loadDebriefLoaderModule = () => import('./story/debriefLoader')
/** The Scrapper's magnet crane (his arena only). */
export const loadBossCraneModule = () => import('./sim/bossCrane')
/** The Fortress's finale: the Core Descent and the Grand Master. */
export const loadFinaleModules = () => Promise.all([import('./sim/coreDescent'), import('./sim/grandMaster')])
/** The street's models (Vex's face for the scene bubbles). */
export const loadStreetModule = () => import('./models/street')
/** The hall's holograms (the Masters over their pedestals, the valley over
 *  the briefing table): fetched once the walkable lab is up (#173). */
export const loadHubHoloModule = () => import('./models/hubHolo')

/** The mission's HUD, its overlays, the modals and the story layers: Vue
 *  components in chunks of their own, so their CSS is not in the first load
 *  (`views/GameScene.vue` wraps each in `defineAsyncComponent`). */
export const loadMissionHud = () => import('../components/hud/MissionHud.vue')
export const loadMissionOverlays = () => import('../components/hud/MissionOverlays.vue')
export const loadGameModals = () => import('../components/modals/GameModals.vue')
export const loadEndingLayer = () => import('../components/story/EndingLayer.vue')
export const loadDebriefLayer = () => import('../components/story/DebriefLayer.vue')
/** Fetch all five (the boot does, once the first scene is up). */
export const preloadUiChunks = (): Promise<unknown> =>
  Promise.all([loadMissionHud(), loadGameModals(), loadMissionOverlays(), loadEndingLayer(), loadDebriefLayer()].map(p => p.catch(() => { /* fetched again when shown */ })))

/** The autopilot (`bot/index.ts`): typed "cmpnc" or 30 mute taps (`use/devCheats`). */
export const loadBot = () => import('./bot/index')
