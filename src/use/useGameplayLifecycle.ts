// ─── Gameplay-bracket fan-out ───────────────────────────────────────────────
//
// One place that answers "is the player actually playing right now?" for every
// portal that wants to know. `GameScene.vue` reports the boolean; this module
// decides which SDK events that becomes, because WHICH events to send is a
// platform contract and not a view concern.
//
// ⚠️ PLAYGAMA is loaded the way every other call site loads it — a DYNAMIC
// import behind the env flag (`main.ts`, `FLogoProgress.vue`). It has no alias
// stub, so a static import here would pull its SDK loader into every other
// portal's bundle. That makes its two calls asynchronous, so they are chained
// on one promise: a handover's stop→start must reach the bridge in that order,
// and by the time anyone is playing the module is already in the registry from
// boot, so the chain resolves on the next microtask.
//
// ⚠️ POKI: the caller drives this from `watch(isLiveGameplay, …)`, and
// `isLiveGameplay` is a computed over five reactive inputs — so a modal closing
// in the same tick an ad opens emits a stop→start pair microseconds apart. On
// CrazyGames that is merely noisy. On Poki it is monetization-fatal: the core
// SDK counts a `gameplayStart()` landing within 50 ms of the preceding
// `gameplayStop()` as a "bad event", and at 10 of them `gameplayStart`,
// `gameplayStop` AND `commercialBreak` all become no-ops for the rest of the
// session, reported only through a debug log line. `pokiGameplayStart/Stop`
// collapse duplicate consecutive events and defer (never drop) a start that
// lands inside the guard window, which is what makes this call site safe.
//
// The import is STATIC on purpose: this file is not in the obfuscator's exclude
// list, so a dynamic `'@/…'` literal would be at the mercy of the `stringArray`
// rewrite. The PokiSDK URL is kept out of every other platform's bundle by the
// `resolve.alias` stub swap in `vite.config.ts`, not by the env-literal gate
// below — see `pokiPlugin.stub.ts` for why the gate alone is not enough.

import { syncGameplayLifecycle as syncCrazyGameplay } from '@/use/useCrazyGames'
import { pokiGameplayStart, pokiGameplayStop } from '@/utils/pokiPlugin'

// ─── What counts as live gameplay ───────────────────────────────────────────
//
// The RULE lives here, next to the platforms it is a contract with; the scene
// owns only the reactive wiring that feeds it. Pure and total, so the contract
// can be asserted without mounting a canvas.
//
// The phase is a plain string rather than the mission's own union type on
// purpose: that module is the whole simulation, and a platform-contract module
// must not drag it into anything that imports it.
export interface GameplayLiveInputs {
  /** Which screen the flow is on. Only a mission is PLAYED; the hub is menus. */
  screen: 'boot' | 'mission' | 'hub' | 'intro' | 'ending' | 'debrief'
  /** The mission's phase. Only 'play' is live: the beam-in / beam-out
   *  animations and the defeat countdown hand the player no control. */
  phase: string
  /** A flow modal is up: pause, defeat, results or level-up. */
  flowModal: boolean
  /** Any other blocking modal (Options). */
  anyModalOpen: boolean
  /** A rewarded / interstitial ad is on screen. */
  adShowing: boolean
  /** `document.visibilityState === 'hidden'` — the player switched away. */
  visibilityHidden: boolean
  /** The portal's SDK asked us to pause (its own overlay, chrome, ad frame). */
  platformPaused: boolean
  /** A new player's first play is under way: from the intro going live (after
   *  the start gate's press) until the first mission hands him control
   *  (`flow.introPlay`). */
  introPlay?: boolean
}

/**
 * Is the player actually playing right now?
 *
 * Every input is a reason gameplay is NOT live, and each one is a real
 * requirement rather than a nicety:
 *
 *   • `visibilityHidden` / `platformPaused` already halt the simulation (they
 *     OR into `isGamePaused`), but halting the sim and TELLING the portal are
 *     two different things — without them a tab switch leaves an open
 *     gameplay bracket: CrazyGames keeps counting the session, and Poki holds
 *     the screen wake lock `gameplayStart()` takes on a page nobody is using.
 *   • `phase` — reporting a start during the beam-in, before the player can
 *     act, is the kind of thing portal moderation rejects.
 *
 * One exception, the owner's call (2026-10-02): the INTRO is the start of the
 * game. A new player's play opens when the film goes live — never before a
 * press on the page: the film waits behind its start gate, and Poki's own
 * first-start gate holds it too — and stays open through the hand-over into
 * the first mission, beam-in included, so the portal sees ONE start for
 * "intro, then the tutorial", not a second one as the level begins (and no
 * stop/start pair inside Poki's 50 ms window). Everything that pauses a play
 * still closes it: a modal, an ad, a hidden tab, the portal's pause.
 */
export const isGameplayLive = (i: GameplayLiveInputs): boolean =>
  ((i.screen === 'mission' && i.phase === 'play') || (!!i.introPlay && (i.screen === 'intro' || i.screen === 'mission')))
  && !i.flowModal
  && !i.anyModalOpen
  && !i.adShowing
  && !i.visibilityHidden
  && !i.platformPaused

/**
 * CrazyGames' reading of the same rule (#138). Two differences, both theirs:
 *
 *   • the INTRO is not play. CG QA expects the first `gameplayStart()` when
 *     the player lands in the tutorial and gets control — a start during the
 *     film reads as "gameplay began" while nobody can play, and the landing
 *     then had no start of its own (the bracket stayed open through it);
 *   • a hidden tab is not a pause — CG handles focus loss itself and asks
 *     games not to signal it.
 *
 * Everything else pauses it as it pauses every portal: the pause menu and
 * any other modal, an ad, the portal's own pause.
 */
export const isCrazyGameplayLive = (i: GameplayLiveInputs): boolean =>
  isGameplayLive({ ...i, introPlay: false, visibilityHidden: false })

/**
 * What the portals were last TOLD — not what the game is doing.
 *
 * `restartGameplayBracket` needs to know whether a play is still open from the
 * portals' point of view, and the scene's own flag cannot answer that: during a
 * handover it reads false for the single tick `phase` spends on 'clear', which
 * no watcher ever observes.
 */
let reported = false
let reportedCrazy = false

/**
 * Report whether gameplay is live — `live` for Poki and Playgama, `crazyLive`
 * (`isCrazyGameplayLive`, defaults to `live`) for CrazyGames. Idempotent on
 * every platform: each portal arm collapses a repeat of the state it is
 * already in, so callers may fire it as often as their reactive source changes.
 */
export const syncGameplayLifecycle = (live: boolean, crazyLive: boolean = live): void => {
  reported = live
  reportedCrazy = crazyLive
  syncCrazyGameplay(crazyLive)

  if (import.meta.env.VITE_APP_POKI === 'true') {
    if (live) pokiGameplayStart()
    else pokiGameplayStop()
  }

  syncPlaygamaGameplay(live)
}

/**
 * Playgama's half of the fan-out, in order.
 *
 * Its certification asks for `gameplay_started` / `gameplay_stopped` around
 * play, and until now nothing in the game called either: the two functions sat
 * in `playgamaPlugin` unused, so that portal saw a session with no plays in it.
 *
 * Every call is appended to one promise chain rather than fired as it resolves,
 * because a stop and the start after it would otherwise race — and a start that
 * overtook its stop would leave the bridge believing the first play never
 * ended. The plugin's own pair is idempotent, so a repeat of the state it is
 * already in costs nothing.
 */
let playgamaChain: Promise<void> = Promise.resolve()

const syncPlaygamaGameplay = (live: boolean): void => {
  if (import.meta.env.VITE_APP_PLAYGAMA !== 'true') return
  playgamaChain = playgamaChain
    .then(async () => {
      const m = await import('@/utils/playgamaPlugin')
      if (live) m.playgamaGameplayStart()
      else m.playgamaGameplayStop()
    })
    // A portal SDK that throws must never break the bracket for the others, and
    // must never poison the chain for the next stage either.
    .catch((e) => { console.warn('[playgama] gameplay signal failed', e) })
}

/** Test seam: settle the asynchronous arms. */
export const __gameplayFanoutIdle = (): Promise<void> => playgamaChain

/**
 * A new play began while the player never stopped playing.
 *
 * For a handover with no screen in between, nothing watching the live flag
 * can see the boundary, because it reads true on both sides. The portals
 * would hear neither the end of the play the player finished nor the start of
 * the next one. CrazyGames counts plays and playtime off those brackets, and
 * Poki grades its funnel on them.
 *
 * So a seamless handover says it by hand: close the bracket, open the next.
 * Every arm takes an immediate pair safely — CrazyGames' start/stop are
 * idempotent off a flag, and `pokiGameplayStart` DEFERS (never drops) a start
 * landing inside the SDK's 50 ms guard window.
 *
 * Mega Droid has no such handover today (every mission ends on the
 * results screen); this stays as the tested seam for one.
 */
export const restartGameplayBracket = (): void => {
  // Already closed — a result screen, a reveal, an ad or a hidden tab ended the
  // play, and the flag that closed it will open the next one.
  if (!reported && !reportedCrazy) return
  const live = reported
  const crazyLive = reportedCrazy
  syncGameplayLifecycle(false, false)
  syncGameplayLifecycle(live, crazyLive)
}

/** Test seam: forget what the portals were told. */
export const __resetGameplayBracket = (): void => { reported = false; reportedCrazy = false }
