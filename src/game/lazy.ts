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
