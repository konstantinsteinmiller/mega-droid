# Perf ledger

Every performance change is measured before it is kept. A change that cannot
show a win on the numbers below is reverted, however plausible it sounded.

## Procedure

1. Build the bundle you ship: `npx vite build --outDir <dir>` (or a platform
   mode). Never measure the dev server.
2. Run `node scripts/perf-mission.mjs --dist <dir> --throttle 4 --seconds 20`.
   It plays the first mission with an in-page driver (walk, turn, fire), under
   CDP CPU throttling, and reads the in-page probe (`?perfprobe=1`,
   `src/use/usePerfProbe.ts`). The game loop feeds it: `frameStart`/`frameEnd`,
   plus a `step` (simulation) and a `draw` phase (`src/game/engine/app.ts`).
3. For a candidate change, add a `?perf=<flag>` baseline arm
   (`src/use/perfVariants.ts`) that switches the change OFF, and run the arms
   INTERLEAVED: `--arms base,<flag> --reps 3`. Compare medians. Interleaving
   is not optional on a shared machine: background load drifts during a run,
   and alternating the arms spreads that drift over both.
4. Primary metric: p95 work-per-frame. Guard metric: the RAF interval. A win
   on work that loses on interval is not a win, because it moved cost to the
   GPU.
5. Record the result here, including the losses.

Load-independent numbers (draw calls, triangles) come from the renderer's
`info` in a dev session. They are exact, so they need no A/B.

## Baseline (2026-09-24, before any optimization)

Desktop, unthrottled, built web bundle, first mission:

| work p50 | work p95 | interval p50 / p95 | long tasks |
| --- | --- | --- | --- |
| 4.7 ms | 6.1 ms | 16.7 / 16.9 ms (60 fps locked) | 3 in 20 s |

The step/draw split under 4× throttle was ~2.5 ms simulation against ~22 ms
draw. **Rendering is the cost; the simulation is cheap.** At the tutorial's
start view the world pass was **130 draw calls and 447 K triangles**, and
302 K of those triangles were level geometry. Every room was drawn, because
distance culling (fog range) kept them all: the rooms are close together.

## Entries

### 1. Portal culling — KEPT

Rooms are only drawn when the player can see them. The walls are 4.2 m tall
and the eye is at 1.6 m, so a room is only visible through a door. Visible =
the player's room, then out through open doors that are on screen, two doors
deep, still capped by fog.
- Enemies in hidden rooms are hidden too.
- Static props (chests, crates, barrels, data cores) hang under their room's
  mesh group, so they vanish with it.
- Corridor ownership moved to the room a corridor leaves, and door frames
  moved to their own always-visible group, so a shut door hides exactly the
  room behind it.
- Portals only hold while the eye is below the wall tops. The beam-in (from
  7 m) and beam-out (to 9 m) see over every wall, so they show every room.
  The first cut missed this: crates and doors floated in the sky on beam-out,
  seen in the WebKit run of the cross-browser matrix.
- Terrain maps (stages, the Tower Run) are not the labyrinth: walls stand 5 m
  over each room's own highest floor, islands over open sky have no outer
  wall, and a door is a 4.2 m panel in a gap that runs up to the wall tops.
  Sky Docks' wind tunnel was missing from the room beside it (playtest
  2026-10-11). `world/roomSight.ts` now works out, once per map, what each
  room sees whatever its doors do (its route neighbours plus every room a
  sight line reaches over the real wall tops), and those rooms are always
  drawn with it. The labyrinth's lists are empty: its portal win is
  unchanged. Door frames on a terrain map are one group a door, drawn with
  the door; a rail's track and cart and the wind streaks follow their rooms.
  Not re-measured on a throttled device: a stage now draws more rooms.

Code: `Mission.updateRoomCulling`, `Mission.propParent`, `levelMesh.ts`.
Baseline arm: `?perf=noportal`.

- Exact: start view **130 → 66 draw calls, 447 K → 114 K triangles**.
- A/B at 4× throttle, 3 interleaved reps, 20 s each: medians of work p50
  **33.6 ms (portal) vs 61.0 ms (noportal)**, p95 70.9 vs 94.5. Portal won all
  3 pairs. The absolute numbers are inflated: the machine sat at 99 % CPU from
  other applications during the run. The ratio is the finding.

### 2. Obfuscation cost — measured, then FIXED (entry 4)

The production obfuscator (stringArray, no control-flow flattening) against an
unobfuscated twin, 4× throttle: work p50 16.6 vs 14.4 ms, about 13 %. Most of
that turned out to be three.js itself going through the obfuscator; see
entry 4.

### 3. Boot: loader first, one build, time-sliced — KEPT

Measured with `scripts/boot-timeline.mjs` (User Timing `boot:*` marks,
long-task observer, the loader fill sampled every frame).

What was wrong:
- `GameScene` mounted before priming finished, and its fallback built the
  whole first sector a SECOND time, synchronously, without the shader
  precompile. The primed copy was thrown away.
- The prime started before the loader had painted, and the build was one
  450 ms task on desktop, so the bar did not move for most of it.
- The first live frame uploaded every mesh to the GPU: a 460 ms hitch at 4×,
  exactly as the player gained control.

What changed:
- `adoptBootMode` makes the scene wait for the prepared mode. It never builds
  its own copy.
- `afterPaint` puts the loader on screen before any heavy work.
- `Mission.create`, `buildLevel` and `spawnEncounters` are time-sliced
  (`engine/slicer.ts`, 12 ms wall-clock budget, `scheduler.yield` or a
  MessageChannel, never timers) and report fine-grained progress.
- The shader programs are created one material at a time and their readiness
  is polled. A final `compileAsync` would re-derive every material in one
  500 ms task.
- The GPU warm-up happens off-screen from above, one room per render.
- The loader bar is ONE fill animated by `transform` under a segment mask, so
  it moves on the compositor through any long task. The static HTML splash
  creeps from the first byte, and the Vue loader continues from its position.
- The "taking too long" hint fires on a real stall (no progress for 6 s),
  not after a fixed 5 s.

Numbers (dev server, desktop, 1×): long tasks 1150 ms total (longest 450) →
402 ms (longest 176); the bar first moves at 374 ms instead of 629. At 4×,
production build: the loader shows at ~0.6 s, the mission is ready at ~6.9 s,
and the longest bar standstill is ~0.8 s, down from over 2 s.

### 4. The obfuscator was rewriting three.js — FIXED

`vite-plugin-javascript-obfuscator` does
`exclude ? handleMatcher(exclude) : defaultExcludeMatcher`. The project's own
exclude list therefore REPLACED the default `/node_modules/`, and every vendor
library went through the stringArray pass. Adding `/node_modules/` back:
- the engine chunk shrank from 1003 KB (320 KB gz) to 787 KB (228 KB gz);
- at 4×, the mission was ready at ~6.9 s instead of 10.0 s;
- the loader appeared at 0.6 s instead of 1.55 s.

### 5. Hub → mission: pause the lab while the sector builds — KEPT

A Deploy tap shows the beam overlay at once (`MissionLoading.vue`) and builds
the mission behind it, time-sliced. The lab loop is paused for the build,
because the overlay covers it anyway. Build time: 11.9 s → 5.8 s at 4×, and
1.47 → 1.28 s at 1×.

### 6. Boot after the second shift: stages on demand, no sync shader logs — KEPT

The five new Masters, the Fortress stage and their features grew the engine
chunk from 1129 KB (350 KB gz, before the cybercity work) to 1442 KB
(477 KB gz). Measured with `scripts/boot-timeline.mjs --throttle 4` on built
bundles, headless Chrome (software GL), three runs each; and a CPU profile
of the intro's first frames.

What changed:
- Each platform stage's generator is its own chunk, loaded when its
  mission is built (`world/stages/load.ts`). The quest board and the boot
  path import only `stages/meta.ts`. The ten chunks are 5–9 KB each.
- `renderer.debug.checkShaderErrors` is off in a production build: the
  info-log reads after each link are synchronous.
- The boot precompile shows hidden objects for the `compile` call (the
  intro's showcase props, cards, streamed sets), so they do not compile on
  their first draw mid-play.

Numbers (4×, built): engine chunk 1442 → 1382 KB (477 → 458 KB gz); long
tasks 6.05 s → 5.85 s total, the longest 1.38 → 1.24 s; playable after
~8.3 s (the old build, before the new content: ~7.9–8.8 s).

What is left: the longest task (~1.2 s at the intro's first frames) is
three.js building a new program's uniform table, which waits for the link.
It was there before this work too. Software GL in headless Chrome has no
`KHR_parallel_shader_compile`, so the boot's readiness poll cannot wait for
the links there; on GPUs with the extension the poll does. Confirm on a real
phone before acting on it.

### 7. iOS opens one step lighter — SHIPPED UNMEASURED (#112, 2026-10-01)

- Why: portal analytics show iOS sessions at a fraction of Android's (1–5 min
  vs 16–28 min). iOS reports no `deviceMemory` and "Apple GPU", so every
  iPhone opened at full scenery and 1.6x; iOS kills an oversized tab instead
  of slowing it down.
- Change: iPhone/iPad (iPadOS by its touch points) open at low scenery and a
  1.5x pixel-ratio cap. Baseline arm: `?perf=ios-legacy`.
- Status: NOT measured — there is no iOS on this machine and WebKit on Windows
  has no memory killer. To keep or revert it: a real iPhone, Safari Web
  Inspector, both arms, memory and frame time after 5 min in a mission.

### 8. Chunk 20's weight, and the finale on demand — KEPT (2026-10-01)

- Measured: the default build (obfuscated) against 947ce03, gzip. Boot
  372.5 → 453.5 KB, GameScene 69.9 → 111.0 KB, index 81.6 → 96.1 KB, each
  locale +2.5–3 KB (the new strings). The growth is the new code itself
  (obfuscation roughly triples it), not a lost code split: the stage
  generators still load on demand.
- Change: the Grand Master + Core Descent (6.7 + ~1 KB), the Scrapper's crane
  (2.3 KB) and the ending film are their own chunks now, fetched with the
  Fortress, the Scrapper's arena and the ending only (boot −11.6 KB gz from
  the first measure). The ending's layer reads a tiny state module so it
  never pulls the film in.
- The Playgama/YouTube build: the youtube-fit audit gives the same verdict
  before and after (its 9 MUST failures are the bridge library's SDK strings,
  handled by the release pipeline, unchanged by this chunk); initial load
  2.96 MiB, well under the 5 MiB ideal.
- Not measured: frame time in the Grand Master fight on a phone (≈12 extra
  draw calls: six parts with outlines, the marker, the beams).

### 9. Doors with their rooms, one mesh a door, a quiet sky on budget phones — KEPT (2026-10-07)

- Why: a Mali-G52 MC2 phone (Android 14 WebView, 8 cores, DPR 2) ran
  missions at 10–15 fps. It already lands on the weak tier (its GPU name:
  1x pixel ratio, low scenery), so the draw calls were the lever left.
- Found (exact counts, real GL draw calls per frame, weak tier, dev build):
  the doors stood at the scene root, so every door of every room behind the
  walls was drawn: 8 doors x 7 calls + the boss gate's 15 in the tutorial's
  first room, 71 of its 133 calls. The sky's traffic was 15 calls (a mesh per
  vehicle kind and another for its lights), even on the low tier.
- Change:
  - A door is drawn while either of its two rooms is (`updateRoomCulling`).
  - A plain door's halves are one body, outline and glow, parted by a morph
    target (`props.ts` `partMorph`): 7 → 4 calls a door.
  - The start and exit pads hang under their rooms like any prop.
  - Every vehicle kind is one instanced mesh, its lights merged in (`VEHICLE`
    in the city shader): 15 → 9 calls on full scenery.
  - Low scenery keeps four vehicle kinds (rockets, taxis, blimp, freighter;
    7 vehicles, was 21) and moves them at 30 Hz: 15 → 4 calls.
- Exact, tutorial first room: **133 → 50** draw calls. A regular mission's
  start (Blaze, Volt): **62–67 → 35**.
- Not measured: frame time on the phone itself. To confirm, the same phone,
  `?perfprobe=1`, a minute in a mission, `window.__perf`.

### 10. Startup: the scene's own chunks first, the rest on demand (#121) — KEPT (2026-10-07)

- Found, and the bigger news: the obfuscated builds (production, CrazyGames,
  itch, glitch, GameDistribution, Poki, GameMonetize) were missing nine of
  the ten platform stages and the Fortress's Core Descent. The obfuscator's
  stringArray rewrites 60 % of string literals at random, an `import()` whose
  path became a decoder call cannot be followed by the bundler, so the chunk
  was never built: deploying the Flame Master's stage failed with "Failed to
  fetch dynamically imported module …/assets/blaze" (reproduced on the built
  bundle). Every runtime `import()` now lives in `src/game/lazy.ts` or
  `world/stages/load.ts`, both excluded; `tests/meta/lazyImports.test.ts`
  fails on a dynamic import in any file the obfuscator transforms.
- Change:
  - The mission engine (502 KB, 197 KB gz) and the intro (32 KB) are their
    own chunks. The boot chunk: **1479 → 837 KB (508 → 244 KB gz)**. The
    mission chunk is fetched in the background once the first scene is up.
  - The intro opens on the valley but built the street (its LAST shot) in the
    loader, and the valley on its first live frame, uncompiled. Now the
    loader builds the valley and the cut-in; the street streams in last.
  - The pixel ratio is 1 or 2, nothing between: 2 from a 1.5× screen up,
    1 below and on weak devices (was 1.5 on iOS, 1.6 on touch phones).
- Measured: built bundle, 4× CPU, 8 Mbit/s, phone viewport, 3 interleaved
  runs, medians. First-timer (intro): the boot work starts **4.5 → 3.3 s**,
  the scene is ready **10.1 → 8.9 s**, and the longest freeze in the 8 s after
  the loader **4.1 → 1.5 s**. Returning player (lab): the boot work starts
  **4.5 → 3.5 s**; ready at ~9 s in both (the lab's shader compile dominates,
  12 programs on the headless software GL).
- Sharpness: a 3× phone draws at 2× and reads BLURRY on the live probe, as it
  did at the old 1.6× (0.111 old, 0.113 new). #121 allows 1× and 2× only.

## Open hypotheses (not applied, not measured)

- The inverted-hull outline doubles every decor and character triangle.
  Dropping it on far rooms, or on flat level decor, is the next biggest lever
  on triangles.
- The rounded kit uses 14–16 radial segments on pilasters and pillars; 10
  may read the same at game distance.
- Repeated props could be instanced.
