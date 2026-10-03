// ElevenLabs (Eleven v4) through its web app, driven in the voice desk's own
// Chrome (browser.mjs). The free plan is 10,000 credits a month (about that
// many characters), forbids commercial use and asks for attribution; mega-droid
// ships its takes on the owner's call (2026-10-03). A second free account on
// the same machine meets ElevenLabs' paywall at once: that is its abuse check,
// not something to route around.
//
//   pnpm voice:gen --engine elevenlabs --jobs samples
//   pnpm voice:gen --engine elevenlabs --sign-in      (once: opens the plain window)
//
// Voices: one library voice per speaker (VOICES; they speak every language).
// The line's direction goes in front of the text as a v4 audio tag
// ("[worried, quick] Ouch! Careful, Flux!"), in English whatever the line's
// language. The take is read from the app's own stream response (MP3), then
// converted to the WAV the pipeline expects. Paced, one line at a time.

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ffmpeg } from '../post.mjs'
import { connect, signInWindow, sleep } from './browser.mjs'

const URL = 'https://elevenlabs.io/app/speech-synthesis/text-to-speech'
/** One library voice per speaker (the "My voices" defaults; search finds them by name). */
export const VOICES = {
  atlas: 'River - Relaxed, Neutral, Informative',
  vex: 'Callum - Husky Trickster',
  flux: 'Liam - Energetic, Social Media Creator',
  gauss: 'Sarah - Mature, Reassuring, Confident',
  // His card: a light, clear tenor in his late twenties, brisk and cheerful.
  pip: 'Will - Relaxed Optimist'
}
const GAP_MS = 3000
/** Longest one line may take, voice pick to WAV, before the run gives up. */
const LINE_MS = 180000

/**
 * The delivery as a v4 audio tag: the tone word alone ("[cheeky] "). The
 * direction's first clause rode along at first, and the model read it out:
 * "[warm, the score so far, with a hint of pride] One relay lit" came back as
 * "The score so far... One relay lit", and a tag before a short line made it
 * say the line twice (the English run, 2026-10-03). `EL_TAG=clause` brings the
 * clause back for a test.
 */
export const tagFor = (direction, tone) => {
  const first = process.env.EL_TAG === 'clause'
    ? (direction ?? '').replace(/"[^"]*"/g, '').split(/[.:;!?]/)[0].replace(/\s+/g, ' ').trim().toLowerCase()
    : ''
  const parts = [...new Set([tone, first].filter(Boolean).filter(p => p !== 'neutral'))]
  return parts.length ? `[${parts.join(', ').slice(0, 48)}] ` : ''
}

const ready = async (page) => {
  if (!page.url().startsWith(URL)) await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('tts-editor').waitFor({ timeout: 30000 }).catch(() => {
    throw new Error(/sign-in|login/.test(page.url()) ? 'signed out: run with --sign-in' : 'ElevenLabs: the editor did not load')
  })
  await page.locator('[aria-label="Dismiss"]').first().click({ timeout: 800 }).catch(() => {})
}

const setVoice = async (page, name) => {
  const sel = page.getByTestId('tts-voice-selector')
  if ((await sel.innerText()).trim() === name) return
  // DOM clicks throughout: the app's popups and its sticky audio player sit over controls.
  await sel.evaluate((b) => b.click())
  const search = page.getByPlaceholder('Start typing to search...')
  await search.waitFor({ timeout: 10000 })
  await search.fill(name.split(' - ')[0])
  await page.waitForTimeout(2000)
  // The row's "Use" button is labelled "Select <voice name>"; it only shows on hover in a narrow window,
  // so it is clicked through the DOM.
  const use = page.locator(`button[aria-label=${JSON.stringify(`Select ${name}`)}]`).first()
  await use.waitFor({ state: 'attached', timeout: 10000 })
  await use.evaluate((b) => b.click())
  await page.waitForTimeout(1200)
  if (await search.isVisible().catch(() => false)) await page.keyboard.press('Escape')
  if ((await sel.innerText()).trim() !== name) throw new Error(`ElevenLabs: could not select the voice "${name}"`)
}

/** Type the line, generate, and return the MP3 the app streams back. */
const speak = async (page, text) => {
  const editor = page.getByTestId('tts-editor')
  // The app's own "Clear text" (select-all + delete leaves the rich editor's earlier block behind).
  const clear = page.locator('button[aria-label="Clear text"]')
  if (await clear.count()) await clear.first().evaluate((b) => b.click())
  await page.waitForTimeout(300)
  await editor.locator('[contenteditable=true]').first().or(editor).first().focus()
  await page.keyboard.insertText(text)
  await page.waitForTimeout(300)
  const typed = (await editor.innerText()).replace(/\s+/g, ' ').trim()
  if (typed !== text.replace(/\s+/g, ' ').trim()) throw new Error(`ElevenLabs: the editor holds "${typed.slice(0, 60)}", not the line`)
  const audio = page.waitForResponse(r => r.request().method() === 'POST' && /\/v1\/text-to-(dialogue|speech)\b/.test(r.url()) && /audio/.test(r.headers()['content-type'] ?? ''), { timeout: 90000 })
  await page.getByTestId('tts-generate').evaluate((b) => b.click())
  const res = await audio
  if (!res.ok()) throw new Error(`ElevenLabs ${res.status()}: ${(await res.text().catch(() => '')).slice(0, 160)}`)
  return res.body()
}

export default {
  name: 'elevenlabs',
  label: 'ElevenLabs Eleven v4 (web app, browser)',
  signIn: () => signInWindow(URL),
  async voice({ speaker }) {
    // A speaker added to the cast later needs its library voice picked by ear first.
    if (!VOICES[speaker]) throw new Error(`ElevenLabs: no library voice for "${speaker}" yet; add one to VOICES`)
    return { id: VOICES[speaker] }
  },
  async synth(items) {
    const { page, close } = await connect(URL)
    const tmp = mkdtempSync(join(tmpdir(), 'el-'))
    const out = new Array(items.length)
    try {
      await ready(page)
      // Grouped by voice: the voice is picked once per speaker.
      const order = items.map((it, i) => [it, i]).sort((x, y) => x[0].voice.id.localeCompare(y[0].voice.id))
      for (const [it, i] of order) {
        try {
          // A window closed mid-run left every call waiting for ever: stop instead.
          if (page.isClosed()) throw new Error('browser closed: run again')
          let timer
          const line = (async () => {
            await setVoice(page, it.voice.id)
            const mp3 = join(tmp, `${i}.mp3`)
            writeFileSync(mp3, await speak(page, tagFor(it.directionEn ?? it.direction, it.tone) + it.text))
            await ffmpeg(['-i', mp3, '-ac', '1', '-ar', '48000', '-c:a', 'pcm_s16le', it.raw])
          })()
          const stuck = new Promise((_, no) => { timer = setTimeout(() => no(new Error('browser stuck: no take in 3 minutes, run again')), LINE_MS) })
          await Promise.race([line, stuck]).finally(() => clearTimeout(timer))
          out[i] = { ok: true }
        } catch (e) {
          out[i] = { ok: false, error: e.message.split('\n')[0] }
          if (/signed out|quota|credit|limit|browser closed|browser stuck|Target.*closed|has been closed/i.test(e.message)) { for (const [, j] of order) out[j] ??= { ok: false, error: 'skipped: ' + out[i].error }; break }
          await page.goto(URL, { waitUntil: 'domcontentloaded' }).catch(() => {})
          await ready(page).catch(() => {})
        }
        await sleep(GAP_MS + Math.random() * 1500)
      }
    } finally {
      rmSync(tmp, { recursive: true, force: true })
      await close() // detaches; the window stays for the next run
    }
    return out
  }
}
