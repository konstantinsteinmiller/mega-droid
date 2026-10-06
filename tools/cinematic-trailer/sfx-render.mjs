/**
 * Render one shot's sound-effect log (written while filming by the trailer
 * seam, `src/game/trailer.ts`) through the game's own synth, offline, into a
 * 48 kHz stereo WAV. The page is `sfx-render.html`, served by the recorder's
 * dev server so `/src/…` resolves; a fresh page per shot, because the game
 * builds its audio graph once per page.
 */
import { readFileSync, writeFileSync } from 'node:fs'

/** A minimal 16-bit PCM WAV around raw interleaved stereo samples. */
export const wavFrom = (pcm, sr, channels = 2) => {
  const h = Buffer.alloc(44)
  h.write('RIFF', 0)
  h.writeUInt32LE(36 + pcm.length, 4)
  h.write('WAVE', 8)
  h.write('fmt ', 12)
  h.writeUInt32LE(16, 16)
  h.writeUInt16LE(1, 20)
  h.writeUInt16LE(channels, 22)
  h.writeUInt32LE(sr, 24)
  h.writeUInt32LE(sr * channels * 2, 28)
  h.writeUInt16LE(channels * 2, 32)
  h.writeUInt16LE(16, 34)
  h.write('data', 36)
  h.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([h, pcm])
}

/**
 * @param {import('playwright-core').Browser} browser
 * @param {string} baseUrl   the recorder's dev server
 * @param {string} logFile   the shot's audio-log.json
 * @param {number} seconds   the shot's length
 * @param {string} outWav
 */
export const renderShotSfx = async (browser, baseUrl, logFile, seconds, outWav) => {
  const { events } = JSON.parse(readFileSync(logFile, 'utf8'))
  const page = await browser.newPage()
  try {
    const errors = []
    page.on('pageerror', (e) => errors.push(String(e)))
    await page.goto(new URL('/tools/cinematic-trailer/sfx-render.html', baseUrl).href)
    await page.waitForFunction(() => window.sfxRenderReady === true, undefined, { timeout: 60_000 })
    const r = await page.evaluate(([ev, s]) => window.renderSfx(ev, s), [events, seconds])
    if (errors.length) throw new Error(`sfx render page errors: ${errors.join(' | ')}`)
    writeFileSync(outWav, wavFrom(Buffer.from(r.b64, 'base64'), r.sr))
    return { events: events.length, sounds: events.filter((e) => e.k === 's').length }
  } finally {
    await page.close()
  }
}
