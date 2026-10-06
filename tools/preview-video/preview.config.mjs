/**
 * ─── Mega Droid video configuration ─────────────────────────────────────────
 *
 *   pnpm cinematic-trailer                      # the whole trailer (tools/cinematic-trailer)
 *   TRAILER_SHOT=rooftops node tools/preview-video/record.mjs --formats trailer --scenarios trailer-shot
 *                                               # one shot of it, as the trailer records it
 *   node tools/preview-video/record.mjs --help
 *
 * The recorder (`record.mjs` + `lib/`) is the gameplay-video-pipeline skill's,
 * verbatim. This file and `scenarios/*` are the game's half. The trailer is cut
 * from SHOTS: each shot is its own take on its own page (`scenarios/trailer-shot.mjs`
 * stages it in real time, then records it on the virtual clock), and
 * `tools/cinematic-trailer/make.mjs` records every shot, renders the sound and
 * cuts them together.
 */
export default {
  // The port-ownership check: a stale server from another game answers too.
  title: 'Mega Droid',

  // The DEV server: `window.__game` / `window.__trailer` and the clean flag are
  // `import.meta.env.DEV` only. Port 2091 is the recorder's own (5173 is
  // `pnpm dev`), and its dependency cache is its own too, so starting it never
  // re-bundles under a dev server someone already has open.
  server: {
    mode: 'dev',
    port: 2091,
    command: 'pnpm',
    args: ['exec', 'vite', '--port', '{port}', '--strictPort'],
    env: { VITE_CACHE_DIR: 'node_modules/.vite-preview' },
    readyTimeoutMs: 120_000,
    // The recording page never hears hot reload: a file written anywhere in the
    // repo mid-take would reload the page out from under the frame loop.
    hotReload: false
  },

  formats: {
    // One trailer shot. Its length is the shot's, passed as --duration by
    // make.mjs. 1920x1080 at dpr 2 is a 960x540 CSS desktop: `dprCap()` is 2
    // on a fine pointer, so the canvas is drawn at the full 1920x1080.
    trailer: {
      durationMs: 4_000,
      quality: ['lossless', 'high'],
      orientations: {
        landscape: { width: 1920, height: 1080, dpr: 2, isMobile: false, hasTouch: false }
      }
    }
  },

  scenarios: ['trailer-shot'],
  fps: 30,
  outDir: 'preview-videos',
  capture: 'virtual',
  seedRandom: 7,

  clean: {
    enabled: true,
    // The WebGL canvas: every HUD node, banner, subtitle, name card and the
    // lock-on bracket are DOM and go. What the renderer draws in the world is
    // gameplay and stays (attack telegraphs, the arm cannon, Atlas).
    keep: ['canvas.game-canvas'],
    suppressCanvasText: true
  },

  urlParams: {
    // Pin the device class: a headless GPU must never be read as a weak one
    // (dpr 1, low scenery) halfway through a take.
    device: 'normal',
    scenery: 'full'
  },

  async onPageReady() { /* the scenario boots the game itself */ }
}
