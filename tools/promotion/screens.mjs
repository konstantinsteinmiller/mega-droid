#!/usr/bin/env node
// ─── pnpm promo:screens ────────────────────────────────────────────────────
// 20 gameplay screenshots for store pages / socials, taken from the REAL game
// (the trailer's staged shots, tools/preview-video/scenarios/_shots.mjs), real
// time, 1920x1080. Each lands in src/assets/promotion/screens/ as NN-name.jpg
// and NN-name.webp, both compressed.
//
//   node tools/promotion/screens.mjs                 all 20
//   node tools/promotion/screens.mjs --only vex,lab  just these ids
//   node tools/promotion/screens.mjs --stores        the store set (Google Play 1920x1080, App Store
//                                                    iPhone 6.9" 2868x1320, iPad 13" 2752x2064) into
//   src/assets/promotion/screens/stores/NN-id-WxH.png. Real viewport x dpr, never upscaled.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import config from '../preview-video/preview.config.mjs'
import { startServer, assertOwnServer } from '../preview-video/lib/server.mjs'
import { launchBrowser, openPage } from '../preview-video/lib/browser.mjs'
import { createLogger } from '../preview-video/lib/log.mjs'
import { SHOTS } from '../preview-video/scenarios/_shots.mjs'
import { settle } from '../preview-video/scenarios/_drive.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const require = createRequire(join(ROOT, 'package.json'))
const sharp = require('sharp')
const OUT = join(ROOT, 'src/assets/promotion/screens')
const RAW = process.env.SCREENS_RAW ?? join(ROOT, 'preview-videos', 'screens-raw')
const log = createLogger('screens')
const STORES = process.argv.includes('--stores')
const STORE_IDS = ['brawl', 'glacier-run', 'weapon-capsule', 'blaze-master', 'volt-master', 'neon-master', 'grand-master-core', 'the-lab']
const STORE_OUT = join(ROOT, 'src/assets/promotion/screens/stores')
const STORE_VARIANTS = [
  { cssWidth: 960, cssHeight: 540, width: 1920, height: 1080, dpr: 2 },
  { cssWidth: 956, cssHeight: 440, width: 2868, height: 1320, dpr: 3 },
  { cssWidth: 1376, cssHeight: 1032, width: 2752, height: 2064, dpr: 2 }
].map((v) => ({ ...v, isMobile: false, hasTouch: false, locale: 'en-US' }))
const only = (() => { const i = process.argv.indexOf('--only'); return i > 0 ? process.argv[i + 1].split(',') : null })()

// A cart ride: the first rail feature of a stage, `at` of the way along.
const cart = (sector, at) => ({
  stage: SHOTS_RIDE(sector, at)
})
function SHOTS_RIDE(sector, at) {
  return async (ctx) => {
    const { boot } = await import('../preview-video/scenarios/_drive.mjs')
    await boot(ctx, { level: 'stage', sector })
    const ok = await ctx.evaluate((k) => {
      const m = window.__trailer.m()
      const rail = m.climb?.features?.find((f) => f.def?.boardAt)
      if (!rail) return false
      const p = m.player
      window.__trailer.tp(rail.x, rail.z)
      p.y = p.py = p.safeY = rail.y
      rail.start(p)
      rail.place(rail.length * k)
      rail.v = rail.def.speed
      window.__trailer.tp(rail.x, rail.z, Math.atan2(-rail.dirX, -rail.dirZ))
      p.y = p.py = p.safeY = rail.y
      window.__trailer.arm(['thunderArc', 'droneSwarm'])
      return true
    }, at)
    if (!ok) ctx.log.warn(`no rail on ${sector}`)
    await settle(ctx, 700)
  }
}

// id → { shot (key in SHOTS or a custom {stage, play}), snapAfter ms of play before the frame }
const LIST = [
  ['wake-up', { shot: 'beamin', snap: 4200 }],
  ['brawl', { shot: 'brawl', snap: 900 }],
  ['forge-hammers', { shot: 'forge', snap: 2600 }],
  ['glacier-run', { shot: 'glacier', snap: 700 }],
  ['cart-ride-start', { custom: cart('drill', 0.12), snap: 500 }],
  ['cart-ride-trestle', { custom: cart('drill', 0.5), snap: 500 }],
  ['puzzle-lamps', { shot: 'secret', snap: 0 }],
  ['puzzle-solved', { shot: 'secret', snap: 1800 }],
  ['weapon-capsule', { shot: 'capsule', snap: 350 }],
  ['challenge-door', { shot: 'challenge', snap: 400 }],
  ['crate-golem', { shot: 'golem', snap: 1500 }],
  ['blaze-master', { shot: 'blaze', snap: 700 }],
  ['volt-master', { shot: 'volt', snap: 500 }],
  ['neon-master', { shot: 'neonboss', snap: 500 }],
  ['master-shatters', { shot: 'shatter', snap: 2300 }],
  ['vex-roof', { shot: 'vex', snap: 600 }],
  ['grand-master-rises', { shot: 'gmrise', snap: 0 }],
  ['grand-master-prism', { shot: 'prism', snap: 500 }],
  ['grand-master-core', { shot: 'gmcore', snap: 700 }],
  ['the-lab', { shot: 'lab', snap: 900 }]
]

// CSP blocks injected <style>, so a constructed stylesheet does the hiding. Tutorial overlays (WASD keycaps, the lesson mouse glyph, checklist, pointers, cues) stay out of promo frames.
const HIDE_HINTS = `(() => { const css = ".coach, .holo-glyph, .lesson-pointer, .input-cue, .checklist { display: none !important; }"; const sheet = new CSSStyleSheet(); sheet.replaceSync(css); const put = () => { try { if (!document.adoptedStyleSheets.includes(sheet)) document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet] } catch (e) {} }; put(); document.addEventListener("DOMContentLoaded", put); setInterval(put, 100) })()`
const variant = { cssWidth: 960, cssHeight: 540, width: 1920, height: 1080, dpr: 2, isMobile: false, hasTouch: false, locale: 'en-US' }

const server = await startServer({ repoRoot: ROOT, port: config.server.port, mode: 'dev', command: config.server.command, args: config.server.args, env: config.server.env, readyTimeoutMs: config.server.readyTimeoutMs, log })
let browser
let failed = 0
try {
  await assertOwnServer({ url: server.url, expectTitle: config.title, log })
  mkdirSync(OUT, { recursive: true })
  mkdirSync(RAW, { recursive: true })
  browser = await launchBrowser({ headed: false, log })
  let n = 0
  for (const [id, spec] of LIST) {
    n++
    if (only && !only.includes(id)) continue
    if (STORES && !STORE_IDS.includes(id)) continue
    for (const v of (STORES ? STORE_VARIANTS : [variant])) {
    const name = `${String(n).padStart(2, '0')}-${id}`
    log.step(STORES ? `${name} ${v.width}x${v.height}` : name)
    const target = new URL('/', server.url)
    for (const [k, v] of Object.entries(config.urlParams ?? {})) target.searchParams.set(k, v)
    const { page, cdp, close } = await openPage(browser.browser, { initScripts: [HIDE_HINTS], variant: v, url: target.href, muteSocketsTo: server.url, log })
    const ctx = {
      page, cdp, log, config, phase: 'setup', fps: 30,
      evaluate: (fn, arg) => page.evaluate(fn, arg),
      waitFor: (fn, arg, o = {}) => page.waitForFunction(fn, arg, { timeout: 20_000, ...o }),
      wait: (ms) => new Promise((r) => setTimeout(r, ms)),
      async stepUntil(fn, o = {}) {
        const end = Date.now() + (o.timeoutMs ?? 3000)
        while (Date.now() < end) {
          if (await page.evaluate(fn, o.arg)) return true
          await new Promise((r) => setTimeout(r, 33))
        }
        return false
      }
    }
    try {
      const shot = spec.custom ?? SHOTS[spec.shot]
      await shot.stage(ctx)
      const playing = spec.custom ? Promise.resolve() : (shot.play?.(ctx) ?? Promise.resolve()).catch((e) => log.warn(`play: ${e.message}`))
      await new Promise((r) => setTimeout(r, spec.snap))
      const png = await page.screenshot({ type: 'png', animations: 'allow', caret: 'hide' })
      if (STORES) {
        mkdirSync(STORE_OUT, { recursive: true })
        writeFileSync(join(STORE_OUT, `${name}-${v.width}x${v.height}.png`), png)
        log.ok(`${name} ${v.width}x${v.height}`)
        await Promise.race([playing, new Promise((r) => setTimeout(r, 200))])
        continue
      }
      writeFileSync(join(RAW, `${name}.png`), png)
      const img = sharp(png)
      const jpg = await img.clone().jpeg({ quality: 82, mozjpeg: true, chromaSubsampling: '4:4:4' }).toBuffer()
      const webp = await img.clone().webp({ quality: 80, effort: 6 }).toBuffer()
      writeFileSync(join(OUT, `${name}.jpg`), jpg)
      writeFileSync(join(OUT, `${name}.webp`), webp)
      log.ok(`${name}: jpg ${(jpg.length / 1024).toFixed(0)} KB, webp ${(webp.length / 1024).toFixed(0)} KB`)
      await Promise.race([playing, new Promise((r) => setTimeout(r, 200))])
    } catch (err) {
      failed++
      log.error(`${name} failed: ${err.message}`)
    } finally {
      await close()
    }
    }
  }
} finally {
  await browser?.close()
  await server.stop()
}
process.exit(failed ? 1 : 0)
