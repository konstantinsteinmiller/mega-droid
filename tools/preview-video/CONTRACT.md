# preview-video — module contract (v2)

v2 adds FORMATS, the CLEAN FEED, one-capture-many-qualities, the seeded RNG and
`{port}`. Everything below describes the code as it is; change the code and this
file together or not at all.

Runtime: Node ESM (`.mjs`), Node >= 22. No TypeScript. Dependencies:
`playwright` (via `@playwright/test`) driving the SYSTEM Chrome
(`channel: 'chrome'`), and `ffmpeg-static`. Windows-safe paths throughout.

## Layout

```
tools/preview-video/
  record.mjs              # CLI entry / orchestrator; exports createCtx      [generic]
  lib/args.mjs            # CLI + config → variants (formats)                [generic]
  lib/log.mjs             # tiny logger, bytes()                             [generic]
  lib/server.mjs          # dev/static server, port ownership, withPort      [generic]
  lib/browser.mjs         # chrome launch + page open                        [generic]
  lib/clock.mjs           # deterministic virtual clock                      [generic]
  lib/determinism.mjs     # seeded Math.random                               [generic]
  lib/clean.mjs           # clean-feed init scripts                          [generic]
  lib/capture.mjs         # frame loop (virtual + realtime)                  [generic]
  lib/encode.mjs          # frames → mp4 via ffmpeg-static, probe()          [generic]
  lib/types.js            # JSDoc typedefs only                              [generic]
  preview.config.mjs      # formats, clean, server, params                   [game]
  scenarios/<id>.mjs      # one module per scenario (per format if mapped)   [game]
  scenarios/_*.mjs        # helpers, never loaded as scenarios               [game]
```

## CLI

```
node tools/preview-video/record.mjs [options]

  --formats <a,b>                 formats to record                   (all)
  --scenarios <a,b>               scenario ids               (config.scenarios)
  --orientations <a,b>            filter, within each format          (all)
  --<orientation> <WxH>           output pixels — EVERY selected format
  --dpr <n>                       EVERY selected format
  --duration <seconds>            EVERY selected format
  --fps <n>                       EVERY selected format
  --quality <q[,q]>               lossless-rgb|lossless|high|balanced; several =
                                  one capture, one encode each      (config)
  --clean / --no-clean            clean feed                (config.clean.enabled)
  --seed <n|off>                  Math.random seed                        (7)
  --url-param <k=v>               repeatable, strongest URL-param source
  --capture virtual|realtime                                        (virtual)
  --out <dir>                     relative to repo root      (preview-videos)
  --url <url> / --no-serve        record an external server
  --port <n>                      our server's port             (config/2063)
  --headed  --keep-frames  --no-poster  --only-setup  --help
```

Unknown flags are an error. `--<orientation>` flags exist for every orientation
id any format declares.

## Output

```
stem   = <scenarioId>-<formatId>-<orientationId>-<W>x<H>     (formatId omitted when null)
1 quality   → <out>/<stem>.mp4          + <out>/<stem>.png
N qualities → <out>/<quality>/<stem>.mp4 + <out>/<quality>/<stem>.png   (each)
--keep-frames → <out>/frames/<stem>/frame-00000.png …
--only-setup  → <out>/<stem>-setup.png
```

Poster = frame 0, unless the scenario called `ctx.beat('poster')` (alias `hero`);
written from the captured buffer, never re-shot.

## preview.config.mjs

```js
export default {
  title,                          // <title> substring — port-ownership check
  server: { mode: 'dev'|'static', port, command, args, dir, env, readyTimeoutMs,
            hotReload },          // default false: the recording page never hears HMR
  formats: {                      // optional; absent = one unnamed format (id null)
    [id]: {
      orientations: { [orientationId]: { width, height, dpr, isMobile, hasTouch } },
      durationMs, fps, quality,   // quality: string | string[]
      scenarios: { [scenarioId]: moduleName },   // default: moduleName = scenarioId
      urlParams,
    },
  },
  orientations,                   // used when there are no formats, and as their fallback
  scenarios: ['success', 'fail'],
  fps, durationMs, quality,       // fallbacks for every format
  outDir, capture, seedRandom,
  clean: { enabled, keep, hide, suppressCanvasText, urlParams, css },
  urlParams, route,
  async onPageReady(ctx) {},      // real time, once per page, before setup()
}
```

Resolution order for a format field: CLI → format → config top level → default
(`fps 30`, `durationMs 10000`, `quality 'lossless'`, `dpr 2`, `port 2063`,
`seed 7`). Odd output dimensions are rounded down to even, with a warning.

URL params, weakest → strongest: `config.urlParams` → `format.urlParams` →
`config.clean.urlParams` (clean runs only) → `scenario.urlParams` →
`--url-param`. Applied to the URL the runner opens.

## lib/args.mjs

```js
parseArgs(argv, config): ResolvedOptions
resolveFormats(config): Format[]          // declaration order; unnamed if none
allOrientationKeys(formats): string[]
stemFor(variant): string
QUALITIES, printHelp(), wantsHelp(argv), REPO_ROOT
```

```js
ResolvedOptions = { repoRoot, url, port, serve, capture, clean, seed, urlParams,
                    outDir, keepFrames, headed, poster, onlySetup,
                    formats, orientationKeys, variants, warnings }
Variant = { scenarioId, scenarioModule, formatId, orientationId, stem,
            width, height, dpr, cssWidth, cssHeight, isMobile, hasTouch,
            fps, durationMs, qualities, urlParams }
```

`isMobile`/`hasTouch` default to `height > width`.

## lib/server.mjs

```js
startServer({ repoRoot, port, mode, command, args, dir, env, readyTimeoutMs, log })
  // → { url, port, kind: 'existing'|'dev'|'static', stop() }
assertOwnServer({ url, expectTitle, log })   // throws unless <title> includes expectTitle
withPort(args, port)                          // '{port}' substituted; numeric after '--port' rewritten
originFor(port)                               // http://localhost:<port>
```

A port that already answers is REUSED (`kind: 'existing'`); `assertOwnServer`
decides whether it is the right game. Default dev args:
`['exec','vite','--port','{port}','--strictPort']`. Vite binds `localhost`,
never probe `127.0.0.1`.

## lib/browser.mjs

```js
launchBrowser({ headed, executablePath, log })   // → { browser, close() }
openPage(browser, { variant, url, initScripts, onConsole, log, muteSocketsTo })
  // → { context, page, cdp, close() }
```

`muteSocketsTo` (an origin): WebSockets to that host are answered locally via
`context.routeWebSocket` and never connected — the dev server's hot reload
cannot navigate the page mid-take. `record.mjs` passes the server URL unless
`config.server.hotReload === true`. Shadowing `location.reload` is NOT an
alternative: Location members are unforgeable in Chrome.

System Chrome, `--mute-audio --hide-scrollbars --force-device-scale-factor=1`
(the context's `deviceScaleFactor` is what decides), background throttling off.
Init scripts are added before navigation, in order; the page is then opened at
`url`. Warns once per variant if `innerWidth × devicePixelRatio` ≠ output size.

## Init scripts, in order

1. `randomSeedSource(seed)` — `Math.random` = mulberry32(seed); `window.__vseed.reseed(n)`. Omitted with `--seed off`.
2. `cleanFeedScripts(config.clean)` — clean runs only (below).
3. `CLOCK_SOURCE` — virtual capture only.

## lib/clean.mjs

```js
cleanFeedScripts(clean): string[]
```

- A `<style id="__preview_clean">` re-inserted on `DOMContentLoaded`:
  `body * { visibility: hidden }`, then `keep` and `keep *` visible (default
  `keep: ['canvas']`; `keep: []` disables the rule), then `hide` hidden, then
  `cursor: none`, scrollbars hidden, `css` appended. `visibility`, never
  `display` — boxes stay, nothing reflows.
- Unless `suppressCanvasText === false`: `fillText`/`strokeText` are no-ops on
  `CanvasRenderingContext2D` and `OffscreenCanvasRenderingContext2D`.
  `measureText` is untouched.
- Interface the game PAINTS is out of reach: the game gates it behind its own
  flag, switched on through `clean.urlParams`.

## lib/clock.mjs

```js
CLOCK_SOURCE: string            // installs window.__vclock at document start, passthrough
armPageClock(page)              // → virtual: now/Date/rAF/timers/animations are ours
stepPageClock(page, dtMs)       // timers due → rAF snapshot → getAnimations() sync
disarmPageClock(page)
pageClockState(page)            // { rafs, timers, errors, messages, … }
createNodeClock()               // { now, advance(ms), wait(ms), waitUntil(t), pending(), idle() }
```

Shims are installed at document start and SHADOW every registration; `arm()`
re-books native timers and intervals virtually. Frame `i` = time `i × dt`;
frame 0 is unstepped. A throwing rAF callback is collected, never fatal.

## lib/capture.mjs

```js
captureScenario({ page, cdp, mode, variant, fps, durationMs, scenario, ctx, clock, onFrame, log })
  // → { frames, beats, errors }
```

virtual, per frame: `clock.advance(dt)` → `ctx.settle()` → `stepPageClock` →
PNG screenshot → `onFrame(png, i)`. `record()` runs as a floating promise; a
rejection is recorded and the loop rolls on to fill the duration.
realtime: CDP screencast, resampled onto the fps grid.

## lib/encode.mjs

```js
QUALITY_PRESETS = {
  'lossless-rgb': libx264rgb, veryslow, qp 0, rgb24
  lossless:       libx264, veryslow, qp 0, yuv444p, high444
  high:           libx264, slow, crf 14, yuv420p, high
  balanced:       libx264, medium, crf 20, yuv420p, high
}
createEncoder({ outFile, fps, quality, log })   // → { write(png), finish() → { path, bytes }, abort() }
probe(file)                                     // → { width, height, pixFmt, durationSec, … }
QUALITY_NOTES
```

`-y -f image2pipe -vcodec png -r <fps> -i pipe:0 <preset> -movflags +faststart -an`.
Backpressure respected. N qualities = N encoders fed the same PNG per frame.

## Scenario module

```js
export default {
  id, label,
  orientationOverrides: { [orientationId]: Partial<Orientation> },  // tweaks only; unknown ids warned
  urlParams,
  async setup(ctx) {},    // REAL time, unrecorded; its last frame is frame 0
  async record(ctx) {},   // VIRTUAL time; should consume ~ctx.durationMs
}
```

## ctx (record.mjs `createCtx`)

```js
{
  page, cdp, log, variant, fps, durationMs, config,
  format: { id, durationMs, fps },
  clean: boolean,
  phase: 'setup'|'record',
  wait(ms),                         // setup: real sleep; record: clock.wait
  evaluate(fn, arg?),               // tracked for settle()
  waitFor(fn, arg?, opts?),         // REAL time; THROWS in the record phase
  stepUntil(fn, { arg, timeoutMs = 3000, label }),  // advances the clip; false + warning on timeout
                                    // (VIRTUAL record phase only: the deadline is on the node
                                    //  clock, which only the capture loop advances — in setup or
                                    //  realtime capture it polls in real time and never times out)
  beat(name), frame(),
  settle(),                         // internal: the capture loop's barrier
}
```

## Game-side seams this project provides (Mega Droid; not part of the generic core)

| seam | where | what |
|---|---|---|
| `#/?level=<template>&sector=<id>&seed=N&plevel=N` | `src/game/data/levelCatalog.ts` | DEV only: boots straight into a level on a throwaway save |
| `window.__game` | `src/views/GameScene.vue` | DEV only: app, input, flow, `startMission`, `mission()` |
| `window.__trailer` | `src/game/trailer.ts` | DEV only: god mode, teleport, boss room, health shares, the autopilot, a free camera, the sound tap (`setSfxTap` / `setChargeHumTap`) |
| `?device=normal&scenery=full` | `src/use/deviceProfile.ts`, `src/game/engine/quality.ts` | pins the device class and scenery: a headless GPU is never read as a weak one |
