// Per-project settings for `pnpm deploy:poki` — Mega Droid.
//
// `team` and `gameId` come straight out of the P4D URL of the game's Versions
// page:
//   https://app.poki.dev/<team>/games/<gameId>/versions

export default {
  // The developer team every game of this studio lives under (the same slug as
  // the sibling repos' configs).
  team: 'hyperg8',
  // NOT KNOWN YET, and deliberately not guessed. Until Mega Droid exists in
  // P4D and its uuid is pasted here (or passed as `--game-id <uuid>`), every mode
  // that talks to P4D refuses to start — see lib/target.mjs. This repo was
  // forked from Survivalist and this field used to hold Survivalist's id; an
  // upload with that id would have landed in Survivalist's Versions list, so
  // that id is refused outright even if it is pasted back in.
  // `--gates-only` (offline) needs no id.
  gameId: '9b504ac8-a798-4111-b0e5-a7c569fcec46',
  gameName: 'Mega Droid',

  build: 'pnpm build:poki',
  dist: 'dist',
  // What `build:poki` writes (its tail is `node tools/poki-deploy/pack.mjs`).
  zip: 'dist/mega-droid-poki.zip',

  /** Pack `dist` into `zip` with the pipeline's own zip writer instead of
   *  trusting a shell `tar -a -cf`, which silently produces a TAR named `.zip`
   *  whenever GNU tar wins the PATH. Leave this on. */
  repack: true,
  /** Extra files to keep out of the upload (backups and nested zips are
   *  already excluded). */
  zipExclude: () => false,

  /** What the version is called in P4D. Keep the version number in it — it is
   *  the only thing tying a live build back to a commit. */
  /** The required "what this update includes" multi-select of the Create Version form (names exactly as Poki lists them; `--update-types a,b`
   *  overrides for one run). Unknown names make the upload throw with the list Poki actually offers. */
  updateTypes: ['Bug Fixes'],

  versionName: version => `Mega Droid ${version}`,

  /** Extra hosts the gates and the runtime sweep should accept. Anything here
   *  needs a matching per-URL approval in P4D → Settings → CSP. Mega Droid
   *  makes no external requests on Poki (the leaderboard is baked), so: none. */
  allowHosts: [],

  /** Strings that must never ship in a Poki release — Poki asks for a clean
   *  build, "no debug code, no dev artifacts". The release aliases this tooling
   *  to stubs (src/platforms/policy.ts → vite.config.ts); a QA twin built with
   *  `VITE_POKI_QA_TOOLS=true` keeps it and is REFUSED here, by design. */
  forbidInBundle: [
    { text: '[CHEAT]', why: 'dev cheats, src/use/devCheats.ts' },
    { text: 'ctrl+shift+alt+', why: 'cheat shortcuts, src/game/cheats.ts' },
    { text: 'cmarc', why: 'typed debug-mode toggle, src/use/devCheats.ts' },
    // NOT "cmonc": the cheat panel (#Cheat1) and its typed toggle ship in the
    // release on purpose (src/use/useCheats.ts).
    // NOT the hidden 30-tap interstitial (src/use/useQaAdTrigger.ts): it ships
    // in the release on purpose (src/platforms/policy.ts).
  ],

  qa: {
    playMs: 45000,          // how long the harness actually plays before judging
    // How long to wait for a commercial break. NOTE: this game requests an
    // interstitial only on the result screen's Continue, 121 s apart
    // (src/use/useAdGate.ts), so a short pass usually sees none and reports the
    // ad steps as unproven. A human can fire one on demand, on the release
    // itself: 30 taps on the bolts counter (HUD or hub) within 30 s
    // (src/use/useQaAdTrigger.ts).
    adWaitMs: 120000,
    reloadIdleMs: 60000,    // no-input window after an iframe reload; any gameplayStart in it FAILS (sticky activation)
  },

  /** Surfaces this game actually has. They decide whether a checklist step is
   *  "not applicable" or a real question — a game WITH usernames must not have
   *  its profanity-filter step reported as n/a.
   *
   *  Mega Droid has neither on Poki: there is no name-entry UI anywhere
   *  (`setPlayerName` has no caller), and with `VITE_LEADERBOARD_URL` empty the
   *  Poki build shows only a rank badge — the top-100 list, the one place other
   *  players' names appear, is compiled out (`leaderboardListEnabled` is false)
   *  and the baked seed board carries no rows. */
  declares: {
    usernames: false,
    chat: false,
  },

  /** Expressions evaluated INSIDE the game's iframe during the QA pass. */
  hooks: {
    /** A snapshot that must survive a reload. Mega Droid keeps ALL of its
     *  state in ONE localStorage blob, `mega_droid_state`, keyed by `ma_*`
     *  fields (src/keys.ts). A save from before the rename sits under
     *  `mega_adventure_state` until the game's next boot moves it
     *  (src/legacyKeys.ts), so that name is the fallback. Only DURABLE
     *  progress is read — counters that change on a mission result or a
     *  kill, never on a mere reload — so a resumed mission re-writing its
     *  snapshot (`ma_mission`), a job re-roll (`ma_quests`) or a timestamp
     *  cannot fail a save that works. `null` when there is no save yet, which
     *  the pass reports as unproven, not as a pass. */
    readProgress: `(() => {
      try {
        const raw = localStorage.getItem('mega_droid_state') ?? localStorage.getItem('mega_adventure_state')
        if (!raw) return null
        const s = JSON.parse(raw)
        const hero = s.ma_hero || {}
        const world = s.ma_world || {}
        return {
          level: s.ma_level ?? null,
          xp: hero.xp ?? null,
          bolts: s.ma_bolts ?? null,
          story: s.ma_story ?? null,
          questsDone: s.ma_quests_done ?? null,
          tutorialDone: !!world.tutorialDone,
          sectors: Array.isArray(world.unlocked) ? world.unlocked.length : 0,
          bosses: Array.isArray(world.bosses) ? world.bosses.length : 0,
          weapons: Array.isArray(hero.weapons) ? hero.weapons.length : 0,
        }
      } catch (e) { return null }
    })()`,

    /** Open the game's rewarded-ad flow. Mega Droid's rewarded offers all
     *  sit behind game state (the defeat modal's reboot, the result screen's
     *  double bolts, the hub workshop's supply drop), so there is no expression
     *  that opens one from a cold pass — left null, and the step is reported
     *  as unproven rather than silently ticked. */
    triggerRewarded: null,
  },
}
