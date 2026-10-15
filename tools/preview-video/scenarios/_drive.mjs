/**
 * The trailer's driver: boot a level, stage the moment in REAL time (setup),
 * then play it on the virtual clock (record) while the game's sound effects
 * are logged against video time for the audio stage.
 *
 * Game-side seams (all DEV only):
 *   window.__game      GameScene.vue — app, input, flow, startMission, mission()
 *   window.__trailer   src/game/trailer.ts — god mode, teleport, spawn, the
 *                      autopilot, the sound-effect tap
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** Open a level by its address (`levelCatalog.levelQuery`) and wait until it plays. */
export const boot = async (ctx, { level = 'stage', sector, seed = 1, plevel = 30 }) => {
  const base = new URL(ctx.page.url())
  const hash = `#/?level=${level}&sector=${sector}&seed=${seed}&plevel=${plevel}`
  // A fresh document per shot: the game route reads the level from the hash at boot.
  await ctx.page.goto('about:blank')
  await ctx.page.goto(`${base.origin}/${base.search}${hash}`)
  await ctx.waitFor(() => {
    const m = window.__game?.mission?.()
    return !!m && !!window.__trailer
  }, undefined, { timeout: 90_000 })
  await ctx.evaluate(() => window.__trailer.prepare())
  await waitPlay(ctx)
  await closeControlsIntro(ctx)
}

/**
 * A touch device's first mission opens the controls legend, and the game
 * waits under it (the portrait previews are a phone). Close it as the player's
 * tap would; it can open a moment after play starts, so watch a little while.
 */
const closeControlsIntro = async (ctx) => {
  for (let i = 0; i < 15; i++) {
    const was = await ctx.evaluate(() => {
      const f = window.__game.flow
      if (f.modal !== 'controls') return false
      f.modal = ''
      return true
    })
    if (was) ctx.log.step('closed the controls legend')
    await settle(ctx, 100)
  }
}

/** Real time: until the mission is in its play phase (beam-in done). */
export const waitPlay = (ctx, timeout = 30_000) =>
  ctx.waitFor(() => window.__trailer?.phase() === 'play', undefined, { timeout })

/** Real-time staging sleep (setup only). */
export const settle = (ctx, ms) => new Promise((r) => setTimeout(r, ms))

// ─── The sound log ────────────────────────────────────────────────────────
// Every `sfx()` / `chargeHum()` call the game makes on camera, stamped with
// VIDEO time (page clock since the first recorded frame). The audio stage
// replays it through the game's own synth (tools/cinematic-trailer/sfx-render).

let audioOut = null
let audioEvents = []

export const startAudioLog = async (ctx) => {
  audioOut = process.env.TRAILER_AUDIO_LOG ?? join(ctx.config.outDir ?? 'preview-videos', 'audio-log.json')
  audioEvents = []
  await ctx.evaluate(() => window.__trailer.audioLog(true))
}

/** Pull what the page logged so far and write the whole log out. */
export const flushAudioLog = async (ctx) => {
  if (!audioOut) return
  const ev = await ctx.evaluate(() => window.__trailer.audioTake())
  audioEvents.push(...ev)
  mkdirSync(dirname(audioOut), { recursive: true })
  writeFileSync(audioOut, JSON.stringify({ fps: ctx.fps, events: audioEvents }))
}

export const finishAudioLog = flushAudioLog

/**
 * Play `ms` of video, flushing the sound log every ~third of a second so a
 * take cut off by the recorder's end still has (almost) all its sounds.
 */
export const play = async (ctx, ms) => {
  const chunk = 330
  let left = ms
  while (left > 0) {
    const d = Math.min(chunk, left)
    await ctx.wait(d)
    left -= d
    await flushAudioLog(ctx)
  }
}

/** Play until `fn` holds in the page (sampled per frame), at most `ms`. */
export const playUntil = async (ctx, fn, ms, arg) => {
  const ok = await ctx.stepUntil(fn, { timeoutMs: ms, arg })
  await flushAudioLog(ctx)
  return ok
}

export const state = (ctx) => ctx.evaluate(() => window.__trailer.state())

export const logState = async (ctx, label) => {
  const s = await state(ctx)
  ctx.log.step(`${label}: ${JSON.stringify(s)}`)
  return s
}
