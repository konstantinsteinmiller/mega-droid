// node plate.mjs URL VARIANT W H OUT.png ['{"cam":[…],…}']
// A cover plate from the dev-only composition view (`#/models?m=thumb&v=<id>`,
// src/views/ModelLab.vue): the game's own rigs on the game's own backdrop,
// nothing on a clock. The optional JSON re-frames the shot for this aspect
// (`__lab.thumb`). The pixels come straight off the WebGL canvas, so no DOM
// overlay can land in them. Its own headless Chrome on a throw-away profile.
import { createRequire } from 'node:module'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const { chromium } = createRequire(join(ROOT, 'package.json'))('playwright-core')
const [URL_, VARIANT, W, H, OUT, OVER] = process.argv.slice(2)
if (!OUT) throw new Error('usage: node plate.mjs URL VARIANT W H OUT.png [overrides JSON]')

const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'plate-')), {
  executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true, viewport: { width: +W, height: +H }, deviceScaleFactor: 1,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
})
try {
  const page = ctx.pages()[0] ?? await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${URL_.replace(/\/$/, '')}/#/models?m=thumb&v=${VARIANT}`, { waitUntil: 'load', timeout: 180000 })
  if (!/Mega Droid/.test(await page.title())) throw new Error(`wrong app at ${URL_}: "${await page.title()}"`)
  await page.waitForFunction(() => window.__lab?.thumbReady === true, null, { timeout: 180000 })
  const over = OVER ? JSON.parse(OVER) : null
  const data = await page.evaluate((o) => {
    if (o) window.__lab.thumb(o)
    return window.__lab.thumbPng()
  }, over)
  if (errors.length) throw new Error(`page errors: ${errors.join(' | ')}`)
  writeFileSync(OUT, Buffer.from(data.split(',')[1], 'base64'))
  console.log(`plate ${VARIANT} ${W}x${H} → ${OUT}`)
} finally {
  await ctx.close()
}
