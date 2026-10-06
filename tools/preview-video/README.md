# preview-video — Mega Droid's gameplay video, generated rather than filmed

```bash
pnpm cinematic-trailer                     # the cinematic trailer (tools/cinematic-trailer)
pnpm cinematic-trailer --draft             # 15 fps, 960x540: a fast review cut
pnpm cinematic-trailer --draft --shots golem+exit --sheet
                                           # re-record two shots, a contact sheet each
pnpm cinematic-trailer --assemble          # re-cut and re-mix from the recorded shots
```

`record.mjs` and `lib/` are the `gameplay-video-pipeline` skill's recorder,
copied verbatim (one local change, in `lib/server.mjs`: the readiness ping asks
for `/@vite/client` and the title check waits up to four minutes, because this
dev server holds its FIRST page request until the cold dependency pre-bundle is
done — 30 s and more on a busy machine). `CONTRACT.md` is their contract.
`preview.config.mjs` and `scenarios/*` are this game's half.

Output is gitignored: `preview-videos/mega-droid-cinematic-trailer.mp4` (H.264
High 4:2:0, CRF 14, AAC 320k, −14 LUFS) and the per-shot masters (lossless) and
stems under `preview-videos/trailer/`.

## How the trailer is built

1. **Shots** (`scenarios/_shots.mjs`) — each is its own take on its own page:
   `stage()` boots a level through its address (`#/?level=…&sector=…`), puts
   Flux where the action is, and starts the moment, in REAL time and off
   camera; `play()` runs on the recorder's virtual clock. `TRAILER_SHOT=<id>`
   picks the shot (`scenarios/trailer-shot.mjs`).
2. **The seam** (`src/game/trailer.ts`, DEV only, `window.__trailer`): god
   mode, teleports, a boss's health share, the boss room, the AUTOPILOT, an
   eased free camera, and the sound tap.
3. **The autopilot** plays Flux through the same `Input` the keyboard and the
   touch sticks write — charge and release, pellets, strafing, slides, special
   weapons — and the soft lock-on aims, as it does for a touch player. Every
   enemy and boss runs its own AI. Nothing on camera is animated by the
   recorder; staging only decides where and when.
4. **Sound**: the recorder runs muted, so the seam logs every `sfx()` and
   `chargeHum()` call against video time; `tools/cinematic-trailer/sfx-render`
   replays that log through the game's own synth, buses, compressor and
   limiter in an OfflineAudioContext. The music is the boss theme rendered by
   `tools/music-render.mjs --wav`; Atlas's lines are his shipped English takes.
5. **The cut** (`tools/cinematic-trailer/cut.mjs`): whole bars of the boss
   theme (140 BPM), so every cut lands on a downbeat and the song's sections
   carry the arc. White flashes and a game stomp on the big hits, the logo on
   the boot loader's night blue at the end.

## Clean feed

Every DOM node but the WebGL canvas is hidden (`clean.keep`): the HUD,
subtitles, banners, name cards, the lock-on bracket. Canvas `fillText` is a
no-op. What the renderer draws in the world stays, because it is gameplay: the
attack telegraph rings, the arm cannon, Atlas at Flux's shoulder. A free
camera (`__trailer.cam` / `camMove`) hides the view-model scene, since a
fly-over is no one's eyes.

## Traps met here

| symptom | cause | fix |
|---|---|---|
| "dev server never answered" with Vite ready in 2 s | the first page request waits for the cold pre-bundle | ping `/@vite/client`; long title-check timeout |
| a second recorder run tries to start its own server | the reuse ping timed out while the server was busy | make.mjs passes `--url … --no-serve` |
| a stale Vite still holds 2091 after a crash | Windows `netstat` prints `ABHÖREN`, not `LISTENING`, so `grep LISTEN` saw nothing | look up the port's PID, kill it by tree |
| the rail cart rides off without Flux | setting `rail.s` moves the cart, not Flux, and the ride resets past 3 m | `rail.place(s)`, then teleport Flux onto the deck |
| a Master's kill never lands | crossing half health starts its phase-2 roar | push it into phase 2 off camera first |
| the exit drone shot ends before the lift-off | the walk to the drone varies with the spot | start the take on `exit.time ≥ plan.tHop − 0.5` |
| `--shots a,b` loses `b` | the worker-budget wrapper splits on commas | `--shots a+b` |
