// Scratch probe (not committed): the account's plan and credits, as the app reads them.
import { connect } from './engines/browser.mjs'

const URL = 'https://elevenlabs.io/app/speech-synthesis/text-to-speech'
const { page, close } = await connect(URL)
try {
  const seen = []
  page.on('response', async (r) => {
    if (!/\/v1\/user(\/subscription)?(\?|$)/.test(r.url())) return
    try {
      const j = await r.json()
      const s = j.subscription ?? j
      if (s && 'character_limit' in s) seen.push({ tier: s.tier, used: s.character_count, limit: s.character_limit, status: s.status, reset: s.next_character_count_reset_unix })
    } catch { /* not json */ }
  })
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  const ok = await page.getByTestId('tts-editor').waitFor({ timeout: 30000 }).then(() => true, () => false)
  await page.waitForTimeout(4000)
  console.log('editor:', ok, 'url:', page.url().split('?')[0])
  const s = seen.at(-1)
  if (s) console.log(`tier: ${s.tier} (${s.status}); used ${s.used} of ${s.limit}; left ${s.limit - s.used}; resets ${s.reset ? new Date(s.reset * 1000).toISOString().slice(0, 10) : '?'}`)
  else console.log('no subscription response seen')
} finally {
  await close()
}
