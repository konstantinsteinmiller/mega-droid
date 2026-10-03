# Mega Droid — implementation plan

This is the resume point. Tick boxes as chunks land, and commit after every
chunk that is playable. Design lives in `GDD.md`.

## Starting point

The repo is a structure-donor copy of **survivalist**. We keep its
platform/infra layer untouched in behaviour:

- `src/platforms/*`, `src/utils/save/*` (SaveManager + strategies), ads
  providers, portal plugins, `useAds`, `useAdGate`, `useGamePause`,
  `useGamePauseAudio`, `useModalState`, `useGameplayLifecycle`, `useSaveStatus`,
  `useUser`, `useMatch`, `useHaptics`, the i18n loader and its 39 locales,
  `FModal`, `FButton`, `GameIcon`, `OptionsModal`, `SaveStatusBanner`,
  `AdsBlockedModal`, `FPerfMeter`, `usePerfProbe`, `perfVariants`, the build
  scripts and `vite.config.ts`.

Everything survivalist-specific goes: `src/game/*`, `useSurvival*`,
`components/game/*`, weapon/boss/shop organisms, the benches, the art-sheet
tooling routes, the survivalist tests (`tests/game`, `tests/sim`, most of
`tests/ui`), and the survivalist images.

## Persisted state

- One localStorage key: **`mega_droid_state`**
  (`src/use/useGameState.ts`, a rename of `useTowerState` with a new key and a
  new `ma_` field prefix). Save strategies, the merge policy and the CG
  scrubbing all reference `STATE_KEY` / the prefix, never a literal.
- Pre-rename keys (`mega_adventure_state` / `_board_cache` / `_uid` / `_name`)
  live only in `src/legacyKeys.ts`: each owner moves its key before the first
  read, and the cloud strategies re-file a pre-rename payload under the new
  name and never write the old one.
- Fields (`src/keys.ts`): `ma_hero`, `ma_inventory`, `ma_quests`, `ma_world`,
  `ma_stats`, `ma_mission` (the resumable mid-mission snapshot), `ma_tutorial`,
  plus the settings and identity keys.
- Merge score: `level × 1000 + storyStage × 5000 + questsDone × 40 + bolts / 100`.
- `src/game/state/profile.ts` holds a typed profile with `load()` / `save()` /
  `migrate()` over those fields. Gameplay mutates plain objects, and the store
  persists them at checkpoints (room cleared, loot taken, mission end, hub edits).

## Architecture

```
src/game/
  engine/     renderer.ts (three setup, DPR cap, resize), loop.ts (RAF + fixed 60 Hz step),
              input.ts (touch/mouse/keyboard → intents), camera.ts (FP camera, bob, shake, lock-on)
  models/     toon.ts (gradient ramp, outline hull, shared materials), kit.ts (rounded parts),
              hero.ts (Flux full rig + FP arm), enemies.ts (rigs per archetype), bosses.ts,
              props.ts (door, chest, crate, barrel, teleporter, pickups, data core, npc)
  world/      rng.ts, levelGen.ts (rooms/corridors/doors/roles), levelMesh.ts (merged static
              geometry per room), themes.ts, nav.ts (grid collision, LOS, A*)
  sim/        mission.ts (the whole in-mission world + update), player.ts, enemyAi.ts,
              bossAi.ts, projectiles.ts, pickups.ts, objectives.ts, damage.ts
  fx/         particles.ts (pooled additive sprites), rings.ts, beam.ts (teleport), flash.ts
  data/       enemies.ts, weapons.ts, skills.ts, items.ts, regions.ts, quests.ts, progression.ts
  state/      profile.ts (typed save), hudBus.ts (throttled reactive HUD mirror)
  audio/      synth.ts (chiptune SFX), music.ts (step sequencer, per-sector tracks)
src/views/GameScene.vue      canvas host, mode switch mission ↔ hub, modal orchestration
src/components/hud/*         Bars, Compass, Crosshair+ChargeRing, Joystick, ActionButtons,
                             DamageNumbers, Toasts, ObjectiveTracker, BossBar,
                             ControlHints + CoachRing + InputGlyph (the coach), ControlsPanel
src/components/hub/*         HubScreen, MissionsTab, HeroTab, CircuitsTab, WorkshopTab
src/components/modals/*      Pause, Results, LevelUp, Loot, Defeat
```

The hot path runs outside Vue. The sim mutates plain objects. The HUD reads
from `hudBus`, a shallow reactive mirror written at most 15 times a second,
while bars and damage numbers get direct DOM writes.

## Chunks (commit after each)

- [x] **0. Plan.** GDD.md + this file.
- [x] **1. Strip and scaffold.** Remove the survivalist game, add three.js,
  rename the state layer to `mega_droid_state`, add a `GameScene` with a
  renderer and a test room, and keep the splash/loader working. Typecheck and
  build green. *Commit.*
- [x] **2. Exploration.** Level generator + meshes + theme, FP controller
  (joystick, look, tap-to-move with A*), doors, collision, head-bob, the
  teleport beam-in, the Flux FP arm cannon. *Commit.*
- [x] **3. Combat.** Enemy rigs (hardhat, trooper, heli, hopper, roller, brute,
  turret), AI state machines, lock-on, quick and charged shots with the perfect
  window, block and parry, slide, telegraph rings, damage numbers, hit flash,
  death orb bursts, drops. *Commit.*
- [x] **4. Progression and persistence.** Profile store, XP and levels,
  attribute pick, the three circuit boards UI, Repair Tanks, the mid-mission
  snapshot and resume. *Commit.*
- [x] **5. Missions and hub.** Regions, story chain, job generator, objectives
  (kill, collect, rescue, elite, supply, purge), compass/tracker, beam-out,
  results screen, hub UI with sector map and job board. *Commit.*
- [x] **6. Loot and gear.** Item generation, chests with a loot burst, the
  inventory/Hero tab with a 3D paper doll, gear recolouring the rig, the
  Workshop (upgrade, salvage, tanks). *Commit.*
- [x] **7. Bosses and special weapons.** Scrapper, Blaze, Frost, Volt and Gale
  Masters, boss door, name card, boss bar, weapon unlock, weakness, weapon
  slots, arm tint. *Commit.*
- [x] **8. Audio and juice.** Chiptune SFX synth and music sequencer (routed
  through the existing pause/mute gates), hit-stop, screenshake, level-up
  flash, loot beams, tutorial tips (Pip). *Commit.*
- [x] **9. i18n and responsiveness.** Every string in en plus the 20 other
  locales, the i18n parity test, safe areas, portrait/landscape layouts, the
  320×658 check. *Commit.*
- [x] **10. Ads and lifecycle wiring.** Revive (rewarded), 2× bolts
  (rewarded), the interstitial before results, gameplayStart/Stop from the
  state machine, platform pause gating the loop. *Commit.*
- [x] **11. QA pass.** Typecheck, tests (sim unit tests, save round-trip,
  i18n parity), a production build, a headless-browser play-through
  screenshot run, and a perf check on a throttled CPU. *Commit.*
- [x] **12. Loader first.** The logo loader paints before any level work:
  the mission is built in 12 ms wall-clock slices, shaders compile in slices
  with readiness polling, the GPU warm-up renders a room at a time, and the
  scene adopts the boot mission instead of building a second one. The bar
  animates on the compositor and the stuck hint only shows on a real stall.
  `scripts/boot-timeline.mjs` measures it. *Commit.*
- [x] **13. Wordless controls coach.** Glyphs replace Pip's text tips (see
  GDD § Teaching the controls). This chunk also fixes the camera (look deltas
  were zeroed before the render applied them), makes a press that travels
  become a look drag instead of a charge, lets manual look win over the
  soft lock and hand it to the enemy in the sights, adds ← / → turning, the
  "?" button and the glyph panel in the pause menu. *Commit.*
- [x] **14. Global leaderboard.** Lifetime XP (new `stats.xpEarned`, floored for
  older saves) on the `leaderboard-badge` stack: the Worker deployed as
  `mega-adventure-leaderboard` with its own D1 and secret, a rank chip on the
  results screen, a top-100 modal from the hub, and a modelled histogram-only
  board for the builds that cannot post (Poki, Yandex, Playgama). *Commit.*

- [x] **15. Desktop controls, lessons and the upgrade tour** (playtest feedback).
  - Pointer lock on desktop (`engine/input.ts`): the first click captures the
    mouse, mouse movement looks, left button fires (hold = charge), right
    button blocks. Space = slide/dodge (Q kept silently, Ctrl dropped because
    Ctrl+W closes the tab), B = beam out, E = interact. Losing the lock (Esc)
    opens the pause menu; modals and the hub release it. Falls back to drag
    looking where the lock is refused. No soft-lock camera pull with a locked
    mouse; shots only snap to a machine near the crosshair.
  - Keycaps in front of every desktop prompt ("[E] Open", "[B] Beam out") and
    on the action buttons, labelled from the real keyboard layout.
  - Wordless mission lessons (`sim/lessons.ts` + `LessonLayer.vue`):
    charge shot on a shielded training target right after the first beam-in;
    supply crates break only to charged shots (lesson in the second room
    entered, once it is cleared); the special weapon (key 1) on a row of three
    sleeping drones in the first mission after the weapon is won.
  - Guided upgrade tour on the first hub visit (`HubLesson.vue`): Workshop tab
    → upgrade the buster → pick the chest armour → upgrade it → back to
    Missions. Everything else is dimmed and inert meanwhile.
  - Hero model and block barrier redesigned (`models/hero.ts`,
    `models/barrier.ts`; a subagent owns those two files).

- [ ] **16. Story: intro cutscene, story beats and the ending** (`story.md`;
  its § Decisions are settled). Builds on chunk 15 (the new hero rig, the
  upgrade tour, pointer lock). Every step lands its own strings in all 21
  locales (English first; keys and copy in `story.md` § New strings) and its
  own sounds (synth, plus a drop-in name in `sound-todo.md`), so the parity
  test stays green at every commit.
  - **Weakness ring and GDD** (small, independent, first). Turn the ring one
    step so each copied weapon is the key to the next Master: `weakTo` in
    `data/bosses.ts` becomes Blaze ← `galeGuard`, Frost ← `flameWave`,
    Volt ← `iceLance`, Gale ← `thunderArc`; `COUNTER` becomes fire ← wind,
    ice ← fire, volt ← ice, wind ← volt (fix the chain comment). A test pins
    that every Master after Blaze is weak to a weapon from an earlier
    sector. GDD: § Setting (five foremen plus VEX, the Red Signal, the beam
    network, Gauss in stasis, a link to `story.md`), the Core Masters
    table's *Weak to* column, § Feel (the first 10 seconds are gameplay for
    a player who skips the intro). *Commit.*
  - **Models**, each on the ModelLab turntable (`story.md` § Reused and new):
    - Prof. Gauss (`models/npc.ts`): console, lever, stagger, asleep, waking,
      a hand on a helmet, idle at the console.
    - The stasis capsule (`models/props.ts`): glass, a frost shell that grows
      and melts, a heartbeat light.
    - The valley diorama (new `models/diorama.ts`): six landmarks at the
      `regions.ts` `mapPos` spots, the relay ring, the Fortress shield with
      crack stages, a solid look and a hologram look.
    - Vex's hologram (the Mk-I faceplate, flickering), Flux's visor eye-lights
      (`models/hero.ts`), and the Masters' red "controlled" glow on eyes,
      chest core and crest, with a swap back to their own colours. *Commit.*
  - **Cutscene player** (new `src/game/story/`). `CutsceneMode` is a
    `GameMode` that plays a script of shots: a camera per orientation
    (framed the way `HubMode` frames Flux), pose tracks and timed events
    (SFX, music section, HUD boot, Pip's glyph bubbles, blinks, the
    screen-reader line). It runs on the sim clock, never on CSS animations
    or timers, so modals, ads, a hidden tab and a platform pause freeze it.
    `CutsceneLayer.vue`: the skip button (`skip-forward`, top right inside
    the safe area, from 0.5 s, `Esc` too, selector `.cutscene-skip`), Pip's
    bubbles projected from 3D, the eyelid bars, an `aria-live` line. No
    pointer lock while a cutscene runs (a click there only unlocks audio or
    skips); the gameplay bracket stays closed. *Commit.*
  - **The intro** (`story/intro.ts`, the six shots in `story.md`) — BUILT
    2026-09-28 to `story-arc.md` § 1 (cold open + five shots, 17 s): script
    `story/introScript.ts`, player `story/intro.ts`, layer
    `components/story/CutsceneLayer.vue`, models `gauss.ts`, `stasis.ts`,
    `diorama.ts`, `street.ts`; tests `tests/game/intro.test.ts`. Not yet: a
    dedicated three-section `intro` music track (it plays the hub theme with
    SFX stings, then the Scrapyard theme on the flash), and a 4× run of
    `boot-timeline`. The other bullets of this chunk are still open.
    - Save: `profile.world.seen: string[]` in `ma_world` lists the story
      beats already shown (`intro`, `relay:<sector>`, `vex:<boss>`,
      `blueprint`, `breach`, `ending`). `migrate()` marks every beat whose
      trigger is already behind the player, so an update never queues old
      cutscenes. Round-trip test.
    - `bootTarget()` picks the intro when there is no snapshot, the tutorial
      isn't done and `intro` isn't in `seen`, once the first-timer check has
      waited (capped) for the cloud read. Boot order: build the cutscene set
      (time-sliced), hide the loader (so `notifySplashGone` lets the
      GameMonetize / GameDistribution / GamePix first-load ad land before
      shot 1), build the tutorial behind the cutscene, and at the flash hand
      off to the tutorial's `beamIn`, or to `MissionLoading` until the build
      is done. A cloud save with progress that arrives mid-intro ends it.
      Ending or skipping adds `intro` to `seen`.
    - "Replay intro" in Options (hub only); a replay ends back in the hub.
    - `VITE_APP_INTRO` is on by default; `false` drops the intro from the
      build.
    - Strings `ui.skip`, `options.replayIntro`, `story.intro.*`. Sounds: the
      `intro` track in `music.ts` (valley in the hub's key, the Vex motif,
      the wake-up rise landing on the Scrapyard track) and the SFX `alarm`,
      `capsule`, `freeze`, `heartbeat`, `bootUp`.
    - Tooling that boots a fresh profile presses `.cutscene-skip` (the real
      user path, so the skip is exercised): `qa:xbrowser`, `qa:portal`,
      `perf:mission`, `perf-builds.mjs` stage 0, `tools/preview-video`. New
      marks `boot:intro-start` / `boot:intro-end`;
      `scripts/boot-timeline.mjs` reports when the tutorial build finished
      against shot 6 (14 s) at 4×. If it overruns, A/B the cutscene at
      30 fps during the build into `PERF-LEDGER.md`, don't assume.
    - Tests: first-timers only; ending and skipping both record it; a
      snapshot resume or a finished tutorial never shows it; a cloud save
      arriving mid-intro ends it; the cutscene clock freezes under
      `isGamePaused` and ads. *Commit.*
  - **Masters are freed** (`sim/bosses.ts`). After the orb-ring burst (now
    the red chip breaking) the Master kneels in its own colours for about
    1.5 s, then beams out. `mission.bossFreed` for the five Masters;
    `mission.bossDown` stays for the Mk-I (test). The ad-before-results
    order does not move (`tests/game/resultsAdOrder.test.ts`). *Commit.*
  - **Hub beats** (`sim/hub.ts`, `MissionsTab.vue`, `story/beats.ts`):
    - Gauss's capsule behind the pad, in frame in both orientations: asleep
      until the Mk-I falls, then Gauss is awake at the console.
    - The relay animation on the sector strip when a sector opens. The
      first one waits until the upgrade tour (`hubLesson.ts`) hands back to
      Missions.
    - Vex's skull flickers over a lab console on the first visit after each
      Master (about 2 s, angrier each time, `vexGlitch`).
    - The blueprint after the Cryo Plant (about 4 s, `story.blueprint`) and
      the Breach after the Sky Docks (about 6 s, `story.breach`), on the
      cutscene player with the menus slid away, before any other hub
      lesson. *Commit.*
  - **The ending** (`story/ending.ts`): four shots after the Mk-I's results
    close, short credits, then the hub; `ending` into `seen`, an ending cue,
    `story.ending.*`. No Mk-II sting: it ships with New Game+ (GDD § Core
    Masters), which has no chunk yet. *Commit.*
  - **QA pass.** Typecheck, all tests, a production build, `qa:xbrowser`.
    Every shot framed at 320×658 portrait and 764×385 landscape. `qa:portal`
    checks that the intro obeys mute at boot and the tab-away freeze, and
    that `gameplayStart` waits for the tutorial's play phase.
    `boot-timeline` at 4×. After release, compare conversion-to-play per
    portal and switch `VITE_APP_INTRO` off where it drops. *Commit.*

- [x] **16b. The city round every mission** (2026-09-28, not committed):
  `world/cityscape.ts` replaces the old fog-hidden skyline blobs. A far-future
  skyline (stepped, round, twisted, needle, twin and dome towers; landmarks:
  arcology, halo tower, leaning arch, floating district, sphere on a tripod,
  space-elevator tether, spaceport) and sky traffic (quadcopters, flying taxis,
  police cruisers with flashing light bars, cargo haulers, an ad blimp, a high
  freighter, rocket launches). Nothing flies over the level: every lane is
  ≥ 42 m outside its reach and ~26 m above its walls (tested). One shader
  (procedural windows, distance haze instead of scene fog), ~15 draw calls.
  Near/mid skyline builds behind the loader (time-sliced, longest chunk
  ~18 ms); the far band and landmarks stream in once play begins (3 ms a
  frame) and rise out of the haze; vehicles trickle in one every 0.3 s.
  `engine/quality.ts` (`?scenery=low|full`) gives budget phones ~40 % of the
  buildings, three landmarks and half the traffic; the intro uses the same
  tier (less rain, fewer puddles, half-size backdrop textures, half the
  diorama's towers) and streams its sets after the cold open's street.

- [x] **16c. The intro score, and Atlas** (2026-09-28, not committed):
  - "Wake-Up Call" (`audio/songs.ts`, id `intro`): 150 BPM so one 16th =
    0.1 s and every cutscene beat has a step; scored to the picture (hits on
    the charge shot, the Spire, the lever, the flash; silence on the freeze).
    Loops like the boss song (never rotates); joins mid-song at the cutscene's
    clock if the audio unlocks late (`setSongStartHint`). Loudness matched
    with tools/music-render.mjs: −18.6 LU per pass (Scrapyard −18.5), the
    cold open −17.1 (boss −17.0).
  - Atlas, Flux's AI companion: model `models/atlas.ts`; lines and rules
    `sim/atlas.ts` (briefings per mission/sector, story arc, boss ahead/freed,
    low health / weapon energy, traps, plates, objective, ride, level up,
    small talk; priorities, cooldowns, re-arming); in play it peeks into the
    top left of the view (viewmodel layer), in the beam-in / exit it flies at
    Flux's shoulder, in the intro it runs with him in the cold open and rises
    out of his chest disc at the wake-up. Bubble `AtlasBubble.vue`.
  - Voice-overs (`audio/voice.ts`): `public/audio/voice/<en|de>/<key>.ogg`,
    German for `de`, English for everyone else, listed at build time (never a
    404), silent on any failure. `pnpm voice:script` writes voice-todo.md.
    Loaded on demand: a line's file starts loading when the line is queued
    (`prefetchVoice`); a line still loading waits up to `VOICE_WAIT` (0.8 s),
    then goes up as a bubble alone.
- [x] **16d. Weak spots** (2026-09-28, not committed): `data/weakspots.ts` —
  one per machine and per boss (androids and the four Masters: the head;
  rotor drone: the tail; stomper, gear roller, crate golem, the Scrapper: the
  back; wall cannon: its rear core; Vex's Mk-I: the dome). Only a shot fired
  with the crosshair itself on the spot goes for it (`mission.aimShot` →
  `weakSpotUnderRay`, the camera's view ray, the side facing the eye, line of
  sight); an auto-aimed or locked-on shot carries no spot and never lands
  one. On the spot: ×1.5 (`WEAK_SPOT_MUL`), a crit, and the amber "KRANCK!"
  (`FloatingText.vue`: wobble, grow, snap away in 0.62 s). Placement checked
  in-game against every model, front and back.

- [x] **17. Blind-playtest fixes** (report: claude.ai/artifact/95ZdKQr6duPctCN7rMc4eH,
  2026-09-24). Done 2026-09-24, NOT committed: all six packages integrated,
  type-check and 729 tests green, round-2 report
  claude.ai/artifact/HLp2VHZ9c6G9nfiWpmNKMh. Round 2's open items (candidates
  for chunk 18): show each gate's requirement on its door and pulse it on
  contact; park the training drone in the doorway, with a stuck fallback; a
  hold cue on the block/parry cards and one safety drone instead of three;
  hit-direction arcs; dim the target frame behind walls; a dodge glyph for
  Slide (it hops back without stick input); a wider chest prompt; the level
  badge reads as a coin. Six parallel work packages with disjoint file
  ownership, then integration and a re-run of the same blind playtest:
  - **WP1 Guided walkthrough + coach** (`sim/coach.ts`, `sim/lessons.ts`,
    `sim/spawn.ts`, `sim/mission.ts`, `flow.ts`, `LessonLayer.vue`): move and
    look are never silenced by a lesson; the tutorial becomes a gated
    walkthrough along the start→boss path (look, move, fire + charge on the
    drone, Hardhat + crate, Shield Trooper block/parry, red-ring slide, chest,
    tank), each door opening when its room's lesson is done; scripted
    tutorial encounters (no Guardroid before the Scrapper); the lesson edge
    arrow only inside the lesson's room, drawn as the lesson glyph; the hub's
    Scrapyard card replays the tutorial until it is done.
  - **WP2 Glyphs** (`InputGlyph.vue`, `ControlHints.vue`, `CoachRing.vue`,
    `ControlsPanel.vue`): touch "move" is a finger tracing an ∞; the hold
    glyph reads without motion; the pause legend animates like the HUD.
  - **WP3 Objective trail** (new `fx/objectiveTrail.ts`, `sim/objectives.ts`
    `target()`): small subtle yellow floor chevrons along the nav path to the
    main objective, only once the walkthrough is done and out of combat.
  - **WP4 Bars** (`TargetFrame.vue`, `BossBar.vue`, `HudBars.vue`,
    `ScreenFx.vue`): MegaMan-style segmented enemy and boss bars; heart on
    the health bar, red pulse and edge vignette under 30 %.
  - **WP5a HUD text and glyphs** (icons, `TopStatus.vue`, hub/modals currency,
    `ObjectiveTracker.vue`, `GameScene.vue`, all locales): a nut glyph for
    Bolts (⚡ stays for energy/charge), "+140" reward chips, [Esc] on pause and
    F1 for help, the boss portrait on the objective card, "Defeat {boss}".
  - **WP5b Hub tour + pad beam** (`HubLesson.vue`, `hubLesson.ts`,
    `models/props.ts`): the tour's hand shows on the first frame and a tap on
    a dimmed control pulses the live step; the start pad's light column
    fades near the camera and after the beam-in.
  - Lead: wire WP3/WP5b into `mission.ts`, type-check, tests, build; harness
    fixes (emulated pointer lock so the host's real cursor is never captured,
    clicks at the crosshair while captured, an `aim` helper, short-exposure
    frames); re-run the two blind Sonnet playtests and publish a new report.
- **Chunk 18 — variety pass (2026-09-26).** Eight asks, built by parallel
  subagents with disjoint file ownership (at most three at once, targeted test
  files only, one full suite at the end by the lead):
  - **WP-A Hazards + Repair Gel lesson** (new `sim/traps.ts`,
    `models/traps.ts`; `sim/lessons.ts`, `sim/walkthrough.ts`, `sim/coach.ts`,
    `ActionButtons.vue`, `HudBars.vue`, `LessonLayer.vue`): 1–2 corridor traps
    per map (wall flame jets, a swinging blade), always readable, never
    stacked on a fight; in "Wake-Up Call" a scripted flame trap in a quiet
    corridor drops Flux to exactly 25 % with no machine near, then a wordless
    Repair Gel lesson (the gel button pulses, a gel→heart glyph, pips for how
    many gels are carried, the refill flows into the health bar). The gel
    button stays on screen whenever gels are carried, as a resource.
  - **WP-B Crate golem** (`models/enemies.ts`, `data/enemies.ts`,
    `sim/enemies.ts`, `sim/spawn.ts`, `data/regions.ts`): a machine that
    sleeps as a supply crate and takes no damage until a shot wakes it; it
    unfolds, lobs rocks, sidesteps charged shots it can see coming at range,
    so the answer is to close in.
  - **WP-D Climb mission** (new `world/climbGen.ts`; `world/nav.ts`,
    `world/levelMesh.ts`, `sim/mission.ts` player physics, `data/quests.ts`,
    `flow.ts`): a platforming stage with floor heights — stairs, drops,
    lifts, ladders, pits, timed obstacles — ending in a boss arena. Offered as
    the `climb` job template.
  - **WP-C Boss awareness + mute** (lead / later agent): HUD mute button left
    of "?" with F2; a mystery boss chip in the top row (the boss head behind a
    "?"); a yellow boss locator shown through walls for 5 s every 30 s until
    Flux is ~10 m from the boss door; a boss door that reads as danger.
  - **WP-E Temporary special shots**: capsules in the new levels grant a
    copied weapon with a limited shot count for that mission only.
  - **WP-F Level-up pick modal** (`LevelUpModal.vue`, `levelUpPick.ts`): pips
    per pending level-up, the badge shows the level being spent, a "+N" chip
    flies into a live stat readout, the cards re-deal after every pick, input
    locked 600 ms, a finish hold after the last pick; 1/2/3 keys.
  - Status (2026-09-27): WP-A, B, C, D, F built and screenshot-checked
    (boss door, chip, locator, gel trap + lesson on desktop and phone, climb
    rooms, level-up modal). Integration fixes by the lead: a sleeping golem
    never holds a lesson room or shows on the purge compass; the kill cheat
    wakes golems first. Open: WP-E (borrowed weapons) in progress; a real
    playthrough of a golem fight and a full climb on a phone; dedicated golem
    sounds (it reuses tink/door/stomp/lob); enemy AI/LOS is still 2D on climb
    platforms (leashed walkers slide along their leash edge).
  - QA harness for this chunk (scratchpad, not the repo): Vite dev server on a
    random port + playwright-core driving system Chrome with emulated pointer
    lock; click once to capture before expecting lesson cards (LessonLayer
    hides while `hud.pointerFree`); combat lock-on turns the camera onto any
    awake machine, so use `mission.debugCam` for prop shots.

- **Chunk 19+ — roadmap.md batch (2026-09-30).** One writer: only the
  main session edits code; subagents research and draft translations. Full
  decision table (D0–D53) in the published report
  https://claude.ai/artifact/UDq6P14LtaQcoDAyrJ9G34 and in
  `~/.claude/plans/steady-dancing-book.md`. Commit after every phase (P1…P10), then continue without waiting.
  - [x] **P1 Quick fixes and input** (commit 73c7642): right-click/back bug, middle-click block,
    boss gate opened by shoot/block, bubbles ×2 (non-voiced), chest + rail-cart
    shot collision, shield blocks mortars, freeze = 30 % slow (no stun), boss
    door stays shut + beam-out in the arena, weapon icon on results, supply drop
    reward/icon, mobile layout + buster glyph, first-touch controls modal,
    pointer lock after ads (+ playbook rule), shoot glyph on Gale, VO chains.
  - [x] **P2 Shared engines** (commit 3ddaa28; boss-room ideas 2–4 and the
    weapon-lesson room's respawns/spawn-on-move land with their levels in P4): FreezeCam, lesson framework v2, edge-leap,
    anti-stunlock + ranged fallback, hazards hurt enemies, spike pits + Atlas
    rescue, trap-hit cams + crumbling platforms, kill-cam + Gameplay tab + F4,
    flame cone + weapon VFX, chevron pulse, repair-kit model, boss-room kit +
    enrage, Vex-face door, wind turbine, puzzle validator, adaptive boss HP,
    Pip catch-up lesson.
  - [x] **P3 Mission 1 rework** + `fpv-tutorial` skill: "Wake-Up Call" is a
    built stage now (`world/stages/tutorial.ts`), lessons per room via
    `map.walkSteps`, a hidden first wall, the gap room, slide then gel then boss.
  - [x] **P4 Retrofit stages**: beam-in rooms (`Builder.beamRoom`, `map.beam`)
    teach the newest weapon behind a held door; spikes in every visible pit;
    Roller/Guardroid/golem/Hardhat on the first ground posts; 2–4 props per
    stage; per-Master arena hazards; health-reactive arena light; Gale hint
    readable. Deferred: crumbling slabs in the old stages (new levels only),
    the Scrapper's magnet crane.
  - [x] **P5 Intro showcase**: the cold open runs on 14.4 s at full speed
    after the release (`SHOW`; everything later is `old time + SHOW`, the
    score 144 steps later): the shot lands, a parry swats a diving drone,
    the shield takes a volley, a slide under the Trooper's shock ring, the
    finish, a Repair Gel; then the freeze and the rewind. Skyline rockets fly
    nose-first along their climb, with a thrust cone and a short see-through
    trail (none on the low tier).
  - [x] **P6 Balance pass 1**: `sim/balance.ts` plays the campaign on paper
    with the game's own tables for three profiles (reference: ×3 every 3rd
    mission, spends 60%; every-round ad; no ads); `scripts/balance-sim.mjs`
    prints it, `tests/game/balance.test.ts` pins the targets (Masters ~26–31 s,
    Vex ~50 s, machines 2–3 s throughout, never "behind", ad edge on bosses
    ≤ 6%). Tuning: the adaptive boss cap 2 → 3 (the Fortress let an
    every-round ad player run 38% ahead); `PROGRESS_HP` stays 0.06.
  - [x] **P7 Five new Masters** (Magnet, Drill, Tide, Neon, Rotor), one
    level per commit (P7.1 … P7.5), then the story docs (P7.6). Decisions:
    - Order and level bands (after Gale, before the Fortress): magnet [16, 22],
      drill [19, 25], tide [22, 28], neon [25, 31], rotor [28, 34]; fortress
      moves to [31, 40]. Existing saves: on load, unlock every sector whose
      `after` sector's Master is beaten (a Gale-beaten save gets Magnet).
    - Elements: the new Masters and sectors are `element: 'none'` (no new
      element in the counter chart); each has one `weakTo`. The new ring is a
      closed cycle: Magnet ← drillBomb, Drill ← bubbleLance, Tide ← neonBlade,
      Neon ← droneSwarm, Rotor ← magnetPull.
    - Weapons (cost / cooldown / dmg): magnetPull 3/0.8/×1.8 homing, breaks a
      guard like a level-2 charge; drillBomb 4/1.0/×2.8 lobbed, blasts r 2.5
      and breaks cracked walls; bubbleLance 3/0.7/×2.4 slow piercing bubble
      along the floor; neonBlade 3/0.6/×2.6 returning boomerang (hits going and
      coming, cuts enemy shots it passes); droneSwarm 6/1.8/×2.0 total, three
      homing mini-drones.
    - One new gimmick per level, as a stage feature (appended to the feature
      list: saves go by position), everything else reused:
      Magnet "Polarity Works" — magnet rails (floor strips that drag Flux;
      shoot a polarity panel to flip them), crumbles, leaps. Enemy Polar Pup
      (floating orb; its shell repels shots while blue, open while red).
      Drill "Deep Mine" — cracked walls (a level-2+ charge or a Drill Bomb
      breaks them: shortcuts, caches), falling rocks (the icicle feature),
      crumbling descents. Enemy Mole Driller (dust trail, surfaces, exposed).
      Tide "Tidewater Locks" — water (slows; the level rises and falls on the
      clock or a shot valve), bobbing pads (looping lifts). Enemy Puffer Mine
      (swells 1.5 s, bursts in a ring: pop it early or block).
      Neon "Blackout Boulevard" — light switches (shoot: lit bridges solid,
      dark ones gone), blackout pulses, the wall-kick shaft secret (D2: Space
      while facing the shaft wall kicks up a storey). Enemy Glow Stalker
      (only eyes in the dark; whine, lunge: parry).
      Rotor "Rotor Run" — the quadcopter ride (the rail feature on a flying
      path), drone hops (shuttles), gusts. Enemy Hornet Rotor (spin-up, dive).
    - Bosses reuse the World's attack parts (volley, lob, wave, ring, orb,
      leap, dash) per new pattern; phase 2 at 50% adds one pattern.
    - [x] P7.1 Magnet: Polarity Works stage (10 sections + arena + beam room),
      magnet rails + polarity panels (`sim/stages/magnet.ts`), Polar Pup,
      Magnet Master (magnetMissiles, polePull via `World.pull`, charge;
      polarStorm), Magnet Pull, chip theme, hub landmark, Atlas arc → 10
      relays, save migration for new sectors, all 21 locales.
      Interim until P7.5: the Fortress band rises with each new sector
      (now [19, 27], finally [31, 40]); the Magnet Master's `weakTo` is null
      until the Drill Bomb exists (P7.2 sets it, and `WEAK_TO`).
    - [x] P7.2 Drill: Deep Mine (11 sections + arena + beam room, 18 m down to
      0), boulders (plain walls; cracked ones break only to a level-2 charge
      or a Drill Bomb — the ice pillars on the drill theme), stalactites (the
      icicles on the drill theme), a two-cage mine elevator; Mole Driller
      (tunnels `buried`, bursts up on a red marker, out 1.8 s); Drill Master
      (burrow, drillBombs, charge; quake); Drill Bomb (bores on, bursts r 2.5,
      60% splash); Magnet weak to it now. Fortress interim band [22, 30].
      The Drill Master's `weakTo` waits for the Bubble Lance (P7.3).
    - [x] P7.3 Tide: Tidewater Locks (12 sections + arena + beam room, up
      with the tide to 14 m and down the spillway), water (`sim/stages/
      water.ts`: wading slows via `MoveMod.speed`, over DEEP it hurts on a
      tick; tide clock, valve-drained lock, currents), buoys; Puffer Mine
      (drifts, swells 1.5 s, bursts in a ring and is gone); Tide Master
      (dashSlash, tidalWave, bubbleVolley; whirlpool pull); Bubble Lance
      (a piercing bubble rolling along the floor); Drill weak to it. Fortress
      interim band [25, 33]. The Tide Master's `weakTo` waits for the Neon
      Blade (P7.4).
    - [x] P7.4 Neon: Blackout Boulevard (13 sections + arena + beam room,
      rooftops over open air), bridges of light (`sim/stages/neon.ts`: lit =
      floor; clock blink with a flicker, or two groups swapped by a shot
      switch), the wall-kick shaft (D2: a `kick` ladder — slide at its foot
      facing the wall, each slide kicks KICK_UP, he slips back between;
      Atlas's `hint.neon.kick` teaches it) up to the borrowed weapon; Glow
      Stalker (dark, eyes, whine, lunge, parry stops it); Neon Master
      (bladeBoomerang, dashSlash, neonVolley; laserGrid); Neon Blade (a
      boomerang that turns at BLADE_TURN and cuts again on the way back);
      Tide weak to it. Fortress interim band [28, 36]. The Neon Master's
      `weakTo` waits for the Drone Swarm (P7.5).
    - [x] P7.5 Rotor: Rotor Run (13 sections + arena + beam room, a sky
      airfield), the quadcopter flight (the rail ride on the rotor theme: no
      track, `buildQuadcopter`, its own lines; the course stays inside one
      open span), hornet waves, crosswind, shuttle and bobbing drones, a wind
      tunnel; Hornet Rotor (spin-up, straight dive, parry crashes it); Rotor
      Master (droneSwarm, downdraft — a negative pull —, dive; rotorStorm;
      weak to Magnet Pull); Drone Swarm (three homing drones); Neon weak to
      it. The Fortress's final band [31, 40]; the weakness ring is closed.
    - [x] P7.6 Story: Act IIb "The Second Shift" (Vex's reserve of five
      Masters, ten relays, the Breach after the Rotor Master; after Gale "the
      reserve" beat) across story-arc / story / comic (pages 25–29, R6) /
      story-voice-over / GDD; planned voice lines (scene `shift`) for Vex's
      intros and hub reactions and Atlas's sector and freed lines. Open: the
      Masters' tints vs the docs' freed colours, New Game+ has no level room
      past 40, the new ring pays off on rematches (only Rotor meets an owned
      weapon on a first run).
  - [x] **P8 Vex Fortress**: the Fortress is a stage now (17 sections +
    arena, three acts — Outer Wall, the Works, the Spire): Wardens (shell
    shut until they fire), sniper turrets on wall ledges, every Master's
    trick once more, a puzzle vault, two guard halls (`Terrain.guards`: the
    way out held until the hall's machines are down) with a checkpoint at
    each door — the Gatekeeper tank (front armour, open back reactor, chest
    hatch after a barrage) and the Twin Masters (Blaze and Frost echoes in
    their Masters' rigs, taking turns, the last one faster) — and Vex in the
    reactor hall, its fire, shock and gusts cycling on one clock. The Core
    Descent's roof-then-fall staging is not built (one arena; noted).
  - [x] **P9 Final balance**: the sim plays all ten Masters and the
    Fortress stage with its final bands. Reference player: Masters 26–34 s,
    the Gatekeeper ~21 s, each Twin Master ~11 s, Vex ~43 s; machines
    1.9–3.1 s throughout; never "behind"; the every-round ad player at most
    3% faster on a boss (35–40% on machines at the Magnet step, bounded by
    the upgrade cap). Pinned in `tests/game/balance.test.ts`. No constant
    needed changing after P6.
  - [x] **P10 Boot hot-path pass**: stage generators on demand
    (`stages/load.ts`, `stages/meta.ts`), shader error checks off in a build,
    hidden objects precompiled; PERF-LEDGER entry 6 (4×: long tasks 6.05 →
    5.85 s; the remaining 1.2 s intro hitch predates this work and needs a
    real-device check).

- **Chunk 20 — roadmap.md #100–#115 (2026-10-01).** Same one-writer
  method. Decisions (all defaults, accepted by the user) in
  https://claude.ai/artifact/AkWcZBqhx4iQopucLL5Pa9. #104–#107 were done before
  this chunk. Commit after every phase, then continue.
  - [x] **P0 #113 test cleanup** (b451b57): no /world, /characters or /water
    routes here; dead test out, predecessor fixtures re-keyed, Node test env
    by default (jsdom opt-in per file), full run ~43 s → ~30 s.
  - [x] **P1 #112 iOS resilience** (841344f): GL context-loss veil and
    recovery, gesture-armed audio resume for life, iPadOS = mobile, checklist
    taps, iOS low scenery + 1.5x (PERF-LEDGER 7, unmeasured).
  - [x] **P1b #114/#115 platform fit**: language read once (no Playgama poll),
    portal language never saved as the player's choice + explicit-choice flag,
    Options shows the live language, GamePix hint, Yandex retry + merge, F1 /
    Help opens the controls legend everywhere + frame focus. Open from the
    audit: Arabic RTL proof on the built Playgama archive (QA Tool, 320×658);
    CrazyGames keeps no device-local backup (CG forbids local data, by
    design); ad-before-results order per portal stays as pinned.
  - [x] **P2 #100 Overload shot** (giga re-timed: full + 3 s, 7x; Gale gate;
    bolt-priced epic-violet mod at 2300 bolts, outside chips and respec; Pip
    opens Circuits on it after the Gale Master).
  - [x] **P3 Shared engines**: 3.1 audio mix (voice bus, ducking,
    variation, voice cap, SFX low-pass, limiter), 3.2 drops on a telegraph,
    3.3 stage light + blackout clock, 3.4 baked Master portraits
    (`pnpm art:portraits`), 3.5 retry from checkpoint (Fortress). The
    single-consumer engines (story-cutscene player, in-mission scenes,
    multi-room boss, multi-part boss + segmented bar) land as their own
    commits right before their content in P6–P8.
  - [x] **P4 Retrofits**: 4.1 Scrapper crane (#108, phase 2 only, both
    arenas), 4.2 Neon blackout (#110, 9 s clock, Blink Run pulse bridges),
    4.3 Deep Mine cart (#111: optional ~15 s ride, trestle + drop + warren;
    the islands stay a walk; its feature slot is last).
  - [x] **P5 #103 stage-select missions** (portrait grid, colour borders,
    boss splash in the load window).
  - [x] **P6 #109 Core Descent** (roof → reactor hall → Core ring): `sim/coreDescent.ts`, `Terrain.bossStages`, a fall scene to black at 65 % and 30 %, a retry point per landing (`MissionSnapshot.vex`), lightning drops on the roof, the molten Core in the ring.
  - [x] **P7 #101 Grand Master Bot** (`sim/grandMaster.ts`, a Fortress
    climb feature: its parts' health rides in the climb's save) (7.1 rig + red-button assembly, 7.2 the
    four-part fight on the roof, Prism Cannon, checkpoint after Vex).
  - [x] **P8 #102 outro + New Game+**: `story/ending.ts` + `endingScript.ts`
    + `EndingLayer.vue`, ~100 s (valley freed, Gauss wakes, sunrise, credits
    with the baked portraits, end card); after the Fortress's results and
    their interstitial; New Game+ from the card (confirmed); Gauss awake in
    the lab afterwards (`seen: 'ending'`).
  - [x] **P9 story/docs catch-up** (comic skipped): story.md, story-arc.md,
    story-voice-over.md, GDD.md; the finale's lines planned in the voice
    catalogue; "Prof. Gauss" and the New Game+ promise (more health, not
    harder hits) fixed in the strings.
  - [x] **P10 final balance**: the Grand Master ~106 s for the reference
    player (pinned 80–150 s), Vex 43 s, nothing else moved.
  - [x] **P10b #114 sound pass**: a low-health heartbeat (under 25 %, quicker
    lower), a click on every FButton, a close blip for every modal, the
    loudest hits trimmed 2–3 dB. Song loudness left as composed (needs a
    listening pass, not a constant).
  - [x] **P11 boot/perf**: the finale (Grand Master + Core Descent), the
    Scrapper's crane and the ending film load on demand; PERF-LEDGER 8
    (sizes against 947ce03; the youtube-fit verdict unchanged, initial load
    2.96 MiB).
  - Deferred: outro replay menu; checkpoint retry outside the Fortress; boot
    shader time-slicing until a real iPhone is timed.
- **Chunk 21 — roadmap.md #117 voice-over pipeline (2026-10-01).** Same
  one-writer method, branch `vo-test-install` (merged to main after P6).
  Decisions in https://claude.ai/code/artifact/15b92236-a0d5-4b6c-a977-edf7e755252f
  (answered: 2 takes per line in production, picked by QA, no listening by
  hand; the generated takes replace the hand-made `public/vo` file; the AI
  Studio browser route is built beside the API; iOS < 17 format deferred).
  Local engines live in `~/.vo-venvs/<engine>` (uv, outside git).
  - [x] **P0 catalogue clean-up**: shipped lines marked live, ending keys
    fixed, stale ending lines retired, orphaned `public/vo` removed.
  - [x] **P1 voice cards + line tones** (`pnpm voice:cards`).
  - [x] **P2 collector** (`pnpm voice:collect [--samples]`, German text
    normaliser).
  - [x] **P3 post chain + QA** (Audacity chains as ffmpeg filters, trim,
    −16 LUFS, OGG Vorbis q2 mono; length, loudness, clipping, Whisper).
  - [x] **P4 engine bake-off** (VoxCPM2, Qwen3-TTS, Chatterbox ML v3,
    Gemini API + AI Studio browser route).
  - [ ] **P5 compression lab** + the blind listening report (`pnpm
    voice:compare`) — the one stop for the user's ratings.
  - [x] **P6 production run**: Chatterbox, every live line EN + DE (358
    files, 12.9 min, 3.3 MB as Opus 24k .ogg), 2 takes each + retries; all
    pass QA.
  - [ ] **P7 full VO** (user, 2026-10-02: "everything, new scenes too";
    scene spec S1–S14 in the decision doc):
    - [x] 7.0 shared: Flux bark channel + hooks, ending/intro voices, the
      Vex bubble and scene runner, AtlasDirector hold, seen flags (NG+
      reset, old-save migration), the new lines in all 39 locales.
    - [x] 7.1 in the boss room: Master presentations (S2), Mk-I intro,
      element call-outs, relays-hold beat, defeat (S10–S13).
    - [x] 7.2 in missions: Master freed lines (S3), Volt Tower hack (S8),
      Fortress welcome (S9).
    - [x] 7.3 in the hub: Vex broadcasts (S4), blueprint, reserve and breach
      cinematics (S5–S7).
    - [x] 7.4 the New Game+ sting (S14).
    - [x] 7.5 voice every new line (Chatterbox), browser pass (files decode
      in Chrome; the hub scenes, a Master's presentation and the Mk-I's
      beats checked on a private Chrome, no console errors).
    - [x] 7.6 Atlas's remaining 69 story lines wired (sector beam-ins, scans,
      warnings, hints, the mission board): one line per event, the generic
      recordings kept as variants; `atlas.objective` retired; 39 locales.
      Voiced: 494/494 live lines ship (Chatterbox, two retry rounds).
  - [x] **P4b ElevenLabs** through its web app (`engines/elevenlabs.mjs`, the
    shared voice-desk Chrome in `browser.mjs`): rated 5.0 on all six clips;
    listening tests only (free plan: no commercial use, 10k credits/month;
    the game is about 25k).
  - [x] **P8 skill**: `~/.claude/skills/voice-over-pipeline` (the toolchain,
    its tests and the runtime references as templates; engines, QA rules and
    wiring patterns as its notes).
  - [x] **Merge `vo-test-install` into main** (fast-forward, 2026-10-02; not pushed).
- **Chunk 22 — roadmap.md #118, #119 (2026-10-02).**
  - [x] **#118** the boss was on the HUD twice (a "?" chip and the objective
    card's portrait): the chip is the objective locator's clock now, no boss.
  - [x] **#119** the debrief: a film after each story mission's results
    (`story/debrief.ts` on its own chunk, `debriefScript.ts` for the beats,
    `DebriefLayer.vue` for the cards). Decisions:
    - Where: after the result screen and its interstitial, before the Lab
      (`leaveResults`); the ending wins after the Fortress. Once per Master
      and run (`debrief:<boss>`, marked at its start; New Game+ clears the
      flags so the story is told again; old saves migrated).
    - What: the valley from above (the intro's diorama; freed sectors in
      their own colour, the rest Vex's red), then four stages moved by the
      beats: the city, the copied weapon (its card), Vex (the Lab scene that
      Master had, absorbed here and marked seen; the blueprint, the reserve
      and the breach keep their hologram, `HubHologram.vue`), the next sector
      (its Master as a hologram over it, a card with name and level band).
    - Who: Pip, voiced (a fifth speaker: card, tones, chain, 52 lines in
      39 locales, EN + DE voiced). Per transition: what the win changed, the
      weapon, where next, what that Master has done there, how to beat it;
      a welcome in the first, a send-off in each. Six Pip lines at most.
    - Not excessive: about 25 s voiced; a tap (Space, Enter) moves on a
      line, Skip (Esc) ends it.
    - Checked: unit tests (script order, every line live and in the
      catalogue, flow order, once ever, none after a lost mission), type
      check, a private Chrome on desktop and phone sizes (three debriefs,
      no console errors).
  - [x] **#121** the tutorial's first room: the charge lesson starts with
    Flux's first step toward the training drones (or a shot at one), not by
    itself on the pad. The room is walled in: the way on was an open doorway
    onto a room not drawn yet (its cover wall stood at the door, in the next
    room's group, so it was culled with it); now a wall like the others
    stands in the corridor's mouth, in the start room's own group, solid to
    Flux and shots, and sinks when the lesson is done; then the door at the
    corridor's end opens.
    Follow-up from the same playtest: the Repair Gel lesson's demo spent the
    only gel and healed Flux, so there was nothing left to train (it even
    counted as the lesson done). The demo's gel is free now and teaches
    nothing; Flux is hurt again when it ends, for his own try. The lesson's
    line came late behind Atlas's health warnings: those wait in the
    tutorial until the gel lesson is learned, and a lesson's intro goes up
    at once.
  - [x] **#122** Atlas talks less (`sim/atlas.ts`, rules in
    `story-voice-over.md` "How often Atlas talks"): warnings at once; scans,
    the relay count, level-ups and tips are chatter (12 s of quiet first,
    one waiting at a time, a late scan dropped); tips once in a save;
    thirteen plain-to-see stage hints never said; one line on the way in; a
    level-up line every second level; one line of small talk a mission.
  - [x] **#123** "the Flame Master level's puzzle shows yellow and there is
    no yellow in the room". A colour puzzle's hint panel had a lamp for all
    four colours, the three not asked for dimmed but plain to see; it has a
    lamp per colour in the room now, the others switched off. The panel
    stood half behind the post beside the false wall: it is in the middle of
    its wall face. Checked every puzzle (10 stages x 24 seeds, the Tower
    Run): one Volt Tower story seed started SOLVED (the first shot un-solved
    it); the builder refuses that now, and a key colour no button has. The
    puzzle audit pins all of it.
  - [x] **#120** store covers (`pnpm art:promotion`, records in
    `store-art/cover-research.md` and `cover-comparison.md`). Decisions:
    - Evidence first (web research, graded): one subject, a readable face
      with an expression, action on a diagonal, exactly one opponent, the
      white hero on a dark or saturated ground, a simple background; Poki
      tests text-free covers better, CrazyGames and GamePix allow the title,
      Steam requires it. No source supports a 20 % click-through for a grid
      tile (stated levels are low single digits): the target is relative.
    - Four new scenarios, staged in the composition view (it places Core
      Masters now) and painted once each at 16:9: neon (the face), blaze
      (the leap), vex (the villain), frost (the duel).
    - Compared blind at tile size by three reviewers on the research rubric:
      neon 79, blaze 78, vex 72, the first painted cover 67, frost 63, the
      old unpainted renders 54 and 47. A proxy, not a measurement.
    - Ships neon, repainted once with its two weak points fixed (a big boss
      behind Flux, the charge whole in the frame); the other aspects painted
      against that master so every format is one picture.
    - Eleven sizes, .jpg and .webp, bare and with the logo (44 files). The
      logo is laid on afterwards, lower-left / lower-right / upper-right by
      format, never top-left (CrazyGames' banner). The folder is a pick
      list, not a contract: only the files a portal needs are kept, and no
      test tracks it.
  - [x] **The intro, from a playtest (2026-10-02).**
    - A start gate: with no press on the page yet the browser mutes
      everything, so the film opened silent and its voices and score cut in
      at whatever shot the first click landed on. It waits behind "Click to
      Start" / "Tap to Start" now (the logo, one button, the whole screen is
      the target; any key the browser counts as a press works too; 39
      locales). Only when sound is locked: an embed that grants autoplay, a
      replay from Options and a returning player's Lab never see it.
    - "Core online. Good morning, Flux." went unvoiced: a recording asked for
      while sound was still locked was never fetched, and a line whose file
      was not decoded at its cue stayed silent. A cutscene line now starts
      the moment it has loaded, if within 1.5 s.
    - The showcase's shield is the game's barrier (the honeycomb dome, its
      ripple on a block, its ring on a parry), built free of the first-person
      camera; its charge and charged shot are the game's too (green to the
      full charge's flickering cyan at the muzzle; the shot's glow, core,
      comet tail and rings), from one shared module the mission uses as well.
    - The intro is the start of the first play (the owner's call, against
      the playbook's "no portal gameplayStart during an intro" guardrail):
      the portals' gameplay bracket opens when the film goes live (after the
      start gate's press; Poki's own first-start gate still holds it where
      no press has happened) and stays open through the hand-over and the
      tutorial's beam-in, so there is ONE start for "intro, then the first
      level". A modal, an ad, a hidden tab or the portal's pause still close
      it. Only a new player's intro, never a replay. Watch for it in review:
      a portal's QA may read a start during a film as early; `flow.introPlay`
      is the one switch.
  - [x] **The stages, from a playtest (2026-10-02).**
    - Pits. No fall goes on for ever: the gap a crumbled slab leaves is a pit
      (the slab waits 10 km under the level and was "a floor"), a room with
      no pit kind of its own holds spikes again (one lava room had turned
      every other pit of its stage into a bottomless dark floor), and the
      pit's floor is solid: Flux lands ON the spikes or the lava and the
      rescue starts there. Any fall over 30 m is a pit fall, whatever is
      under him. Stage pits are 8 m deep (12 before) and the spikes taller,
      with lit tips, so the bed reads as spikes from the edge.
    - Flame Wave fired under the ground on every raised floor (it started
      at height 0.45 of the map) and died on the spot. It starts at Flux's
      feet, hugs the floor it rolls over, belches a fan of flames at the
      muzzle, is wider, and roars (the flame jet).
    - The debrief is owed by the save (`dueDebrief`: the last Master beaten
      with its return to the Lab untold), not by a note in memory that a
      reload between the result screen and Continue lost. A game that boots
      into the Lab owing one plays it on the first press there.
    - The slide lesson: a slide counts only on the player's turn in its own
      lesson (`Training.counts`), so the Stomper yard always shows its card
      and demo first; a slide on the way used to tick it off. In every
      lesson's try the input stays up: the key pulsing (desktop), the lit
      button with the finger (touch).
    - Icicle halls (Cryo Plant, Deep Mine, Fortress) have a roof at the
      icicles' roots, drawn from below only.
    - No debrief after the Volt Tower either: a Master's FIRST fall in a run
      owes its debrief whatever the flags say. A New Game+ begun before its
      debrief flags were cleared (or a migration) left every film "seen",
      so none played for the whole run; the stale flag is dropped on the
      first clear.
    - The Lab's sector tiles: a one-word name too long for its tile
      ("Gezeitenschleusen", "Polaritätswerk") shrinks to fit, down to 80 %,
      and past that widens its own tile; the level range stays on one line.
  - Chosen (user's blind test, 2026-10-02): Gemini Flash-Lite 4.5 stars,
    Gemini Flash and Chatterbox 4.0, VoxCPM2 and Qwen3 3.3; Opus 24k/16k
    rated above Vorbis q2. Production on Chatterbox (free) and Opus 24k in
    .ogg, so the user can play the game with full VO first.
  - Deferred: re-voice with Gemini 3.8 Flash-Lite once the user commits to a
    paid model (billing on the AI Studio project "Default Gemini Project";
    `pnpm voice:gen --engine gemini-lite --force`, voices already designed);
    the AI Studio browser route (blocked: Google refuses its token to a
    Chrome with an automation port); a small format every browser decodes
    (iOS < 17); the label-driven glitches and Flux's synth tails in the FX
    chains; Atlas's still-unwired lines (sector beam-ins, field warnings,
    hints, scans, `atlas.fortress.bays`); the Volt Tower and Fortress scenes
    don't hold enemies asleep and the hub broadcast doesn't put Vex on the
    Lab's 3D screens (bubble only).
- **Chunk 23 — Atlas clean-up and the ElevenLabs re-voice (2026-10-03).**
  - [x] The thirteen hints #122 silenced are gone (cues, never-say list,
    catalogue, tones, 39 locales, 20 recordings) (bcffa21).
  - [ ] **Re-voice English with ElevenLabs** through its web app (the user's
    call: free accounts, shipped at the owner's risk; German later). One take
    per line, `--retry` for the QA failures. Pip = "Will - Relaxed Optimist"
    (picked by his card; the user checks his first lines). On a credit or rate
    limit the run stops and the user signs in to another account; a re-run
    only speaks the lines with no take yet:
    `node tools/voice/generate.mjs --engine elevenlabs --lang en --takes 1`
    (sign-in: add `--sign-in`, sign in, close that window). A passing line
    replaces its Chatterbox file at once, so the game mixes the two voices
    until the run is through.
    Status: the first free account's 10k credits voiced 163 English lines;
    123 passed QA and ship (Atlas 19, Vex 26, Flux 30, Pip 48), 40 failed
    (doubled lines, laughs and barks over their length; a retry speaks them
    again), 147 are not spoken yet. A second free account met ElevenLabs'
    paywall at once (its free-tier block, not worked around). Open: the
    user's call between one paid plan, the first account's monthly reset,
    or Chatterbox for the rest.
    Then (user): every Chatterbox file left the game for now, English and
    German (455 files, `git mv` to `vo-src/backup-chatterbox/<lang>/`; put
    one back by moving it to `public/audio/voice/<lang>/`). The game ships
    only the 123 ElevenLabs lines; every other line is a bubble alone, and
    German players hear those 123 in English (the German fallback).
    `vo-src/shipped.json` records the engine of every shipped file; the
    generator keeps it up to date.
    Then the Starter plan (the user's, 2026-10-03; 30k credits a month,
    commercial licence): English 308/310, German 265/268 ship, all ElevenLabs
    (the 42 grunts and laughs are one English take for every language). What
    made the difference: the audio tag is the tone word alone (a clause in it
    was read out, and made short lines come out twice), "Mk-I" is said as
    "Mark One", a hung Whisper is killed and restarted, and an empty text box
    is typed into again. Bubbles for now: EN `atlas.scan.volt` (every take
    heard as "Volt-coded"), EN `pip.debrief.magnet.next` (5.7-5.9 s against
    5.4; the catalogue's 3.5 s cap stays), DE `atlas.story.cryo` (drops its
    "Brr!"), DE `atlas.story.rotor` (heard "Roter Pflüg"), DE
    `atlas.scan.elite` (2.7 s against 2.5). The Chatterbox backup stays in
    `vo-src/backup-chatterbox/` until the user drops it.
- **Chunk 24 — roadmap.md playtest bullets (2026-10-03).** One-writer method;
  decisions (D1-D31, the user's answers folded in) in
  https://claude.ai/artifact/W8gQe5npfn3LsrAu771D4c. A commit per phase, the
  roadmap item ticked when its phase is committed.
  - [x] **P1 Voice: one source of truth** (#274, #284): the text decides
    (`SPEECH` rules + `deriveVoiceLines`, `VOICE_DETAIL` for the extras),
    voice-todo.md rendered with every line's state and kept current by a
    test, Flux's fumble lines voiced and wired; the skill updated.
  - [x] **P2 Bugs from the maps**: golem double-lifted aim, void-pit rescue
    sign, unleashed tutorial machines, lesson doors naming their lesson.
  - [x] **P3 Quick wins**: chests open on any hit (#273), the boss shutter
    opens by itself (#283), enemies fire back across their room (#277), the
    debrief's colours (cleared blue, target red).
  - [x] **P4 Hologram lessons** (#266-#270 and the new tutorial points):
    hologram engine, no cards, the slide freeze with the yellow-arrow button,
    target arrows, rooted block guard, doors closing behind, the first level's
    new rooms (drones, wheel + guard, golem) and the longer gel stretch, then a
    headed-Chrome playthrough of the whole tutorial. Lessons are intro → try
    now (`sim/demo.ts`, the cards and the demo overlay are gone); the
    holograms live in `Mission.holos`, their glyph in `LessonGlyph.vue`
    (`hudLive.holo*`), the slide freeze in `stepSlideCue`; the walkthrough
    shuts each door in behind the player (`shutBehind`) and the breather's
    gate waits for the gel. The playthrough probe drives the real game room
    by room (teleport to each entry, play the lesson through the input
    record).
  - [x] **P5 Weapon lessons after the boss** (#275, #278, #285, the weapon
    item): the arm hologram, a lesson room and exit pedestal behind every boss
    (not the Fortress), the beam-in lesson as a fallback only, Blaze's quiet
    landing room. `Builder.exitRoom()` finds free grid beside the arena by
    itself (Blaze grew to 29 rows, Sky Docks and Polarity Works to 41
    columns); `map.exit` = room, door, pedestal cell. `copyBossWeapon`
    (flow.ts) grants and equips at the boss's fall and still reports the
    weapon as new on the results. Found on the way: the Flame Wave rolled
    under the lesson drones (they hover at 2.1 m); level-shot weapons get
    low drones (`LOW_SHOT`).
  - [x] **P6 Hazards and feel**: barrel flatten (#280), lava and slab rattle
    (#279), crate golem ram (#281), Atlas's rescue (#282). Rolling barrels
    hit with hazard 'barrel' (`Mission.flatT`, `flatEye`, trap fx 'flat');
    lava is `models/lava.ts` (a DataTexture, no canvas, ticked by
    `stepLava`); `CR_SHAKE` 1 s and `rattles()`; the golem's `ram`
    (`GOLEM_RAM_*`); the rescue frames from below (`RESCUE_PULL/RISE` in
    freezeCam.ts) with `Mission.tractor`.
  - [x] **P7 Boss bar** horizontal under the compass (#276). BossBar.vue
    holds the name and the bar in one block under Compass.vue's strip;
    short landscape (max-height 480px) puts it under the objective card.
    Also: a weapon lesson's frame leaves with Flux when he steps out of its
    room (`weaponRoomNow`).
  - [ ] **P8 Intro rework** (#271, #272): new order, synced shots, the
    Mega Man X dash, the score rewritten.
  - [ ] **P9 Wrap-up**: voice the new lines, story/voice docs, final browser
    pass.

## Resume notes

- Dev server: `pnpm dev` (port 2194 — 2050/2077/2193 belong to other games
  on this machine). Check the served `<title>` ("Mega Droid") before
  trusting a browser test.
- `#/models?m=hero&angle=20&zoom=2` — DEV turntable for every procedural
  model (`src/views/ModelLab.vue`).
- `window.__game.app.mode` is the live mission in dev (`debugCam` overrides
  the camera for inspection).
- Cheats: `localStorage.cheat = 'true'` (DevTools) + reload enables the hotkeys in
  `src/game/cheats.ts`, all on ctrl+shift+alt: B +1000 bolts, L level up,
  O finish objective, K destroy every machine, G god mode, U unlock all,
  J jump to the boss door (the corridor outside the shutter, facing it).
  Typing "cmarc" toggles debug mode (FPS/draw-call meter).
- Layout checks: 320×658 portrait and 764×385 landscape, touch UA. In
  portrait the top HUD row belongs to the bars and the status pills, so the
  compass, target frame and objective stack below it
  (`@media (max-aspect-ratio: 1/1)`). The results modal splits into two
  columns on short landscape screens.
- `<html lang>` follows the active locale (`main.ts`). Arabic gets
  `unicode-bidi: plaintext` on text blocks (`index.sass`), so sentences read
  RTL, while the HUD geometry stays LTR.
- Audio only starts once unlocked (`audioUnlocked` in `useAssets`: the first
  gesture, or a context that came up running because the embed grants
  autoplay). A track requested before that waits in `music.ts` and starts on
  the first gesture. The console stays free of autoplay warnings.
- Ads (playbook Phase 6): `finishMission` pays and saves, waits only on the ad
  GATE (another placement's ad, capped at 8 s), then reveals the results and
  plays the jingle. The interstitial runs on the result screen's Continue
  (`leaveResults`, won or failed): the screen closes first, the ad plays if
  pacing allows (121 s gap, none in the first 61 s after load; no 3-minute
  floor any more), and only then the hub opens and starts its music.
  `tests/game/resultsAdOrder.test.ts` pins that order. Every ad that
  interrupts live play or the hub restarts the music in `.finally()`
  (`resumeMusicAfterAd`): the revive, the supply drop and the QA trigger.
- Modals freeze the simulation (`isGamePaused`) but not the audio
  (`isAudioPaused` = ad / hidden tab / platform pause). The charge hum is
  silenced whenever the sim freezes.
- Gameplay bracket: `isGameplayLive` = a mission in phase `play` with no flow
  modal, modal, ad, hidden tab or platform pause (GameScene watches it).
- Rewarded placements: revive (once per mission), 2× bolts on results, and
  the Workshop supply drop (40 + 20·level bolts, 4-minute cooldown saved in
  `ma_stats.lastDropAt`). All are hidden unless `canOfferReward`.
- Hidden QA ad trigger: 20 taps on a bolts pill within 30 s
  (`useQaAdTrigger`). Ships in every build, the Poki and Playgama releases
  included; it is not dev tooling, so no alias strips it and no release gate
  refuses it.
- QA tooling (all run against a BUILT bundle; `npx vite build --outDir <dir>`):
  - `pnpm qa:xbrowser --dist <dir>`: Chrome / Edge / Firefox / WebKit play the
    first mission to the hub, with zero page errors.
  - `pnpm qa:portal --platform gamepix --dist <dir> --headless`: mute at boot,
    unmute, tab-away freeze and silence, resume, menu entry (12 checks).
  - `pnpm perf:mission --dist <dir> [--arms base,<flag> --reps 3]`:
    throttled perf with interleaved A/B. Results go in `PERF-LEDGER.md`.
- Drop-in assets: files in `public/audio/sfx|music` and
  `public/images/textures` replace the procedural sound or texture of the
  same name. They are listed at build time (`virtual:asset-overrides`), so a
  missing file never 404s. See `sound-todo.md` and `art-todo.md`.
- Portal culling (`Mission.updateRoomCulling`): rooms show through open,
  on-screen doors, two deep. Static props hang under their room group.
  Beam-in and beam-out, with the camera above the walls, show everything.
- Control coach: `game/sim/coach.ts` is the bookkeeping. The mission reports
  successes (`use`, `looked`, `moved`, `blockableHit`, `deflected`) and the
  context each step, and the HUD reads `hud.hints`. Progress is saved as
  `profile.tips['hint:<id>:<touch|mouse>']`. Clear `profile.tips` to see the
  first-run glyphs again. `tests/game/coach.test.ts` pins the rules. The
  playtest scripts drive a real mission: the first fight shows look and move,
  then fire and block (desktop cards under the crosshair; on touch, the tap
  glyph plus a ring on the shield button).
- Desktop mouse (chunk 15): pointer lock is owned by `engine/input.ts`
  (`requestPointerLock` / `releasePointerLock` / `isPointerLocked`), mouse
  BUTTONS come from mouse events (a second button while the first is held is
  a `pointermove` under Pointer Events), and a refusal only counts when the
  request rode a real gesture outside Chrome's re-capture cooldown.
  `GameScene` releases the capture for every pause reason and the hub, takes
  it back on Resume, and ignores an Esc that arrives with a lost capture.
  `hud.pointerFree` drives the click glyph on the crosshair.
- Scene lessons and the upgrade tour: flags `profile.tips['lesson:charge' |
  'lesson:crate' | 'lesson:weapon' | 'lesson:upgrade']` (plus
  `lesson:upgradeGrant` for the one-time bolt top-up). Clear them to see the
  lessons again. Pinned by `tests/game/lessons.test.ts`, `crates.test.ts`,
  `hubLesson.test.ts`, `input.test.ts`. Hub DOM anchors are `data-lesson`
  attributes (`tab-<id>`, `upgrade`, `armor`, `bolts`, `weapon-<n>`).
- Guided walkthrough (chunk 17): `sim/walkthrough.ts` locks the tutorial's
  start→boss path doors (red lamps) and opens each when its room's lesson is
  done; the tutorial seed is 20261916 (four path rooms), the cast is scripted
  in `spawn.ts`, progress rides the snapshot field `walk`, and the hub's
  Scrapyard card replays the tutorial until `tutorialDone`.
  `Mission.walkthroughActive()` gates the objective trail
  (`fx/objectiveTrail.ts`, `MissionObjects.target()`), which is also off in a
  fight and during a scene lesson.
- Browser defaults (menus, mouse/rocker gestures, autoscroll, history buttons,
  drag, selection, quick find, pinch) are cancelled in one place:
  `src/use/useBrowserGuard.ts` (capture phase on `window`, defaults only, text
  fields exempt; pinned by `tests/ui/browserGuard.test.ts`). Don't add
  per-component `contextmenu` blockers; extend the guard.
- Browser automation must NEVER take a real pointer lock: a headless Chrome on
  Windows captured the host's mouse cursor. Emulate it in the page (see
  `scripts/xbrowser.mjs`): override `requestPointerLock`, the
  `pointerLockElement` getter and `exitPointerLock`, and feed look as JS
  `mousemove` events with `movementX/Y`.
- Never put TypeScript in a pug template (`el as X`): the template is
  compiled apart from the script and is not stripped, so it is a syntax
  error in the browser that `vue-tsc` accepts. Cast in the script.
- A browser playtest that ends a mission on the dev server posts to the LIVE
  board. Route `/workers\.dev/` to a local answer in any such script (as
  `scripts/xbrowser.mjs` does).
- Input ownership: `consumeEdges` (end of each sim step) clears only EDGES.
  The look deltas belong to the render, which applies and zeroes them. Clearing
  them in the step lost every drag whenever a step ran between two frames.
- Boot timing: `node scripts/boot-timeline.mjs [url] [--throttle 4]` (or
  `--dist <dir>`) prints the `boot:*` User Timing marks and the long tasks
  until `boot:adopted`.
- Leaderboard (GDD § Global leaderboard): Worker in `worker/` (runbook
  `worker/SETUP.md`, account pinned in `wrangler.toml`). `.env` holds the live
  URL and the signing secret, so NOTHING automated may end a mission against
  it: vitest blanks both (`test.env`) and rejects non-local fetches
  (`tests/setup.network.ts`, pinned by `tests/game/noLiveLeaderboard.test.ts`),
  and `scripts/xbrowser.mjs` answers the Worker itself. A hand-run browser test
  that ends a mission posts a real row; delete it afterwards with
  `npx wrangler d1 execute mega-adventure-leaderboard --remote --command
  "DELETE FROM scores WHERE id = '<id>'; DELETE FROM board_cache"` (the id is
  `localStorage.mega_droid_uid`). `data/leaderboard-snapshot.json` (the live
  builds' offline fallback) appears on the first build after the board has
  players; commit it then. The modelled board is `pnpm leaderboard:seed`.
- Known open items for a human: the origin remote still points at the
  survivalist repo, and `.env` still holds survivalist's GameMonetize id and
  Glitch ids. Replace them before a portal upload. (The Playgama leaderboard
  id is cleared; create a Mega Droid board on the Playgama dashboard to
  switch that board on.)
