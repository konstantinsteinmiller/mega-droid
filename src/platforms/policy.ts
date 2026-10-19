// ─── Platform policy: portal rules that shape the UI and what a build ships ──
//
// Pure — no `import.meta.env`, no Vue, no `window` — so the SAME rules are read
// by `vite.config.ts` (which decides what gets aliased out of a build) and by
// the app (through the build-time `platformPolicy` in `capabilities.ts`).
// Adding a portal rule means adding a field here, not another scattered
// `VITE_APP_*` check in a component.
//
// The app does not call the resolver itself: `vite.config.ts` resolves the
// policy ONCE for the build it configures and hands the result to the app as
// the compile-time constant `__PLATFORM_POLICY__`. The two readers therefore
// cannot disagree, and no portal name has to ship in a bundle to decide a
// rule at runtime (the Playgama release is held to exactly that — see
// `tools/playgama-release/gates.mjs`).

export interface PolicyInput {
  isPoki: boolean
  /**
   * The Playgama release — which is also the YouTube Playables submission
   * (Playgama forwards that one archive). Held to a clean build like Poki's:
   * both portals review the archive by hand, and its release rule is a PURE
   * bundle — the Playgama plugin path and nothing else, no dev tooling either.
   */
  isPlaygama?: boolean
  /**
   * The QA-twin opt-in: `VITE_QA_TOOLS=true` (or the Poki-era name
   * `VITE_POKI_QA_TOOLS=true`, still honoured). Builds a twin of a clean
   * release that KEEPS the dev tooling (the cheats and the debug toggle).
   * Never a release: both portals' release gates refuse an artifact carrying
   * it (`DEV_TOOL_MARKERS` below).
   */
  qaTools?: boolean
}

export interface PlatformPolicy {
  /**
   * Poki: "the free/standard continue must be in the primary position and
   * equal or larger than the rewarded option" (integrate-poki REQUIREMENTS §3).
   * So wherever a free choice and a rewarded one sit side by side — the result
   * screen's Continue vs. Double bolts, the defeat screen's Retreat vs. Reboot
   * (ad) — the free one renders FIRST and is never the smaller of the two.
   */
  freeOptionFirst: boolean
  /**
   * Does dev tooling ship? The `localStorage.cheat` cheats and the typed
   * "cmarc" debug toggle. Poki's hard requirements ask for a clean build — "no
   * debug code, no dev artifacts" (REQUIREMENTS §1 row 10) — and the Playgama
   * release is held to the same rule, so neither carries any of it: the
   * modules are aliased to stubs, and the `cheat` flag no longer turns on
   * debug mode.
   *
   * The hidden 20-tap QA interstitial (`useQaAdTrigger`) is NOT dev tooling:
   * it ships in every build, releases included. It is invisible, a normal
   * player never triggers it, and QA can then prove ads on the exact archive
   * that was submitted.
   */
  devTools: boolean
}

export const resolvePlatformPolicy = ({ isPoki, isPlaygama = false, qaTools = false }: PolicyInput): PlatformPolicy => ({
  freeOptionFirst: isPoki,
  devTools: !(isPoki || isPlaygama) || qaTools
})

/**
 * The dev-tooling modules a build without `devTools` swaps for no-op stubs:
 * import specifier → project-relative stub path. Each stub mirrors its real
 * module's exports, so every importer still resolves.
 */
export const DEV_TOOL_STUBS = {
  '@/use/useCheats': 'src/use/useCheats.stub.ts',
  '@/game/cheats': 'src/game/cheats.stub.ts'
} as const

/**
 * What the modules in `DEV_TOOL_STUBS` leave in a BUILT bundle when they are
 * not stubbed: the release gates grep the artifact for these, because that is
 * the only falsifiable proof the aliases took effect (an alias that fails to
 * apply still builds). Each text lives in its real module and in none of the
 * stubs — `tests/platforms/playgamaCleanBuild.test.ts` holds that pairing.
 */
export const DEV_TOOL_MARKERS: ReadonlyArray<{ text: string; why: string }> = [
  { text: '[CHEAT]', why: 'dev cheats, src/use/useCheats.ts' },
  { text: 'ctrl+shift+alt+', why: 'cheat shortcuts, src/game/cheats.ts' },
  { text: 'cmarc', why: 'typed debug-mode toggle, src/use/useCheats.ts' },
  { text: 'cmonc', why: 'typed cheat toggle and cheat panel, src/use/useCheats.ts' }
]

/** The `resolve.alias` entries a build with this policy needs for its dev
 *  tooling (project-relative stub paths; `vite.config.ts` makes them absolute).
 *  Empty when the tooling ships. */
export const devToolAliases = (policy: PlatformPolicy): Record<string, string> =>
  (policy.devTools ? {} : { ...DEV_TOOL_STUBS })
