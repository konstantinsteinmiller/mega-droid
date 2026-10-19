#!/usr/bin/env node
// ─── Store art, rendered from the real rig ──────────────────────────────────
//
//   node scripts/render-thumbnail.mjs                  # Poki: all variants, the pick → store-art/poki/
//   node scripts/render-thumbnail.mjs --set playgama   # Playgama covers + Wrap images → store-art/playgama/
//   node scripts/render-thumbnail.mjs --set playgama --sheet  # only rebuild previews/sheet.png
//   node scripts/render-thumbnail.mjs --port 5173      # reuse a running `pnpm dev` (else starts its own)
//   node scripts/render-thumbnail.mjs --only lab       # Poki: just these variants (comma list)
//   node scripts/render-thumbnail.mjs --pick sector    # Poki: which variant becomes thumbnail-*.png
//   node scripts/render-thumbnail.mjs --chrome <path>  # Chrome executable (or CHROME_PATH)
//
// Each picture is the dev-only composition view `#/models?m=thumb&v=<id>`
// (src/views/ModelLab.vue): Flux in his default look, a charge in the arm
// cannon, a backdrop from the game's own scene builders, and nothing on a
// clock, so a re-render is the same picture. It is rendered at half the
// target size in CSS px and deviceScaleFactor 4, i.e. at twice the target
// size, read straight off the WebGL canvas (so no DOM overlay can end up in
// it), and scaled DOWN with Lanczos, which is what makes the inverted-hull
// outlines crisp (the renderer has no MSAA at this DPR).
//
// POKI (default), into store-art/poki/ (a repo folder that never ships: only
// public/ is copied into dist):
//   thumbnail-1256.png          the master (lossless)
//   thumbnail-628.png / .jpg    the upload size; the jpg only when it is smaller
//                               AND scores SSIM ≥ 0.99 against the png
//   preview-200.png, -128.png   the pick at Poki tile sizes, the readability check
//   variants/<id>-628.png       every variant, and variants/sheet.png side by side
// Poki's rules it checks mechanically: square, the size, and nothing near
// Poki's playground colour #83FFE7 (fails on any pixel within CIE76 ΔE 10;
// reports the share within ΔE 20). What it cannot check: no text, one clear
// subject, reads at 128 px. Look at preview-128.png before uploading.
//
// PLAYGAMA (`--set playgama`), into store-art/playgama/:
//   covers/square-800x800.png            v=sector  } the three upload files: NO logo or text
//   covers/landscape-1920x1080.png       v=land    } (YouTube Playables forbids branding in
//   covers/portrait-1080x1920.png        v=port    }  a thumbnail; a slot may be forwarded)
//   covers-logo/landscape-1920x1080.png  v=wide + the logo lockup on the left third
//   covers-logo/portrait-1080x1920.png   v=tall + the lockup over the top third
//   wrap/hero-1920x1080.png              v=wide, no text (the Wrap site sets the title as its heading)
//   wrap/share-1280x670.png / .jpg       NOT made here: cut from the painted blaze-clash cover
//                                        by tools/promotion/blaze-clash-formats.mjs (read for previews)
//   wrap/icon-1024.png                   the icon tile full-bleed + the 2048 px emblem head (safe zone)
//   wrap/icon-1024-rounded.png           the same icon as the rounded tile with clear corners
//   previews/*.png                       the upload covers (and share, icon) at catalog size
//   previews/sheet.png                   those previews + wrap/screens/*.png (the gameplay
//                                        screenshots, captured separately) at 448x252;
//                                        `--set playgama --sheet` rebuilds only this sheet
// The cover slots take exactly those sizes, PNG or JPEG, at most 10 MB; the
// script checks the sizes and the 10 MB. The lockup is store-art/brand/
// logo-lockup.svg, laid on with a soft shadow; its title matches the game's.
//
// Every frame must show the amber plasma (eyes, reactor, charge), or Flux
// never rendered and the script fails.
//
// Its own Chrome, on a fresh temporary profile (never the MCP browser's), and
// the pointer lock is stubbed: automation must never capture the real mouse.
// A server it starts is its own child, killed with its whole tree at the end.

import { createRequire } from 'node:module'
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LOGO_WIDTH, withCoverLogo } from '../tools/promotion/logoOverlay.mjs'
import { createServer } from 'node:net'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright-core')
const sharp = require('sharp')
const { ssim } = require('ssim.js')

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d }
const SET = arg('set', 'poki')
if (SET !== 'poki' && SET !== 'playgama') throw new Error(`--set ${SET}: expected poki or playgama`)
const OUT = join(ROOT, 'store-art', SET)
const VARIANTS = (arg('only', 'lab,sector,full')).split(',').map(s => s.trim()).filter(Boolean)
const PICK = arg('pick', 'sector')
const CHROME = arg('chrome', process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe')
const CSS = 628
const DSF = 4
const TITLE = 'Mega Droid'

// ─── Dev server: reuse one, or start our own on a free port ─────────────────

const freePort = () => new Promise((res, rej) => {
  const s = createServer()
  s.once('error', rej)
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => res(port)) })
})

/**
 * The port answers, and with THIS game (a stale server from another project
 * answers too). Vite may bind `localhost` to ::1 only, and Node's fetch can
 * give up on `localhost` under load, so each address is tried in turn.
 */
const titleAt = async (port) => {
  for (const host of ['localhost', '[::1]', '127.0.0.1']) {
    try {
      const r = await fetch(`http://${host}:${port}/`, { signal: AbortSignal.timeout(15000) })
      return (await r.text()).match(/<title>([^<]*)<\/title>/)?.[1] ?? null
    } catch { /* next address */ }
  }
  return null
}

let server = null
const stopServer = () => {
  if (!server || server.exitCode !== null) return
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' })
  else { try { process.kill(-server.pid, 'SIGTERM') } catch { server.kill('SIGTERM') } }
}
process.on('exit', stopServer)
process.on('SIGINT', () => { stopServer(); process.exit(130) })

const SHEET_ONLY = SET === 'playgama' && argv.includes('--sheet')
// `--set playgama --logo`: only the images that carry the logo or the app
// icon (covers-logo/, the Wrap share image and icons), after a logo change.
// The landscape and the share image reuse wrap/hero-1920x1080.png (the same
// `wide` frame they were cut from); only the `tall` frame is rendered again.
const LOGO_ONLY = SET === 'playgama' && argv.includes('--logo')
let port = Number(arg('port', 0))
if (SHEET_ONLY) {
  // Rebuilds previews/sheet.png from files on disk: no server needed
} else if (port) {
  const t = await titleAt(port)
  if (t !== TITLE) throw new Error(`localhost:${port} serves "${t}", not ${TITLE}: start \`pnpm dev\` or drop --port`)
} else {
  port = await freePort()
  const vite = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js')
  server = spawn(process.execPath, [vite, '--port', String(port), '--strictPort'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32'
  })
  let log = ''
  server.stdout.on('data', (d) => { log += d })
  server.stderr.on('data', (d) => { log += d })
  const t0 = Date.now()
  let t = null
  while (Date.now() - t0 < 180000 && server.exitCode === null) {
    t = await titleAt(port)
    if (t) break
    await new Promise(r => setTimeout(r, 1000))
  }
  if (t !== TITLE) throw new Error(`dev server on ${port} did not come up as ${TITLE} (got "${t}")\n${log}`)
  console.log(`dev server: localhost:${port} (own, pid ${server.pid})`)
}

// ─── Colour check: Poki's playground mint must not appear ───────────────────

const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
const toLab = (r, g, b) => {
  const R = lin(r); const G = lin(g); const B = lin(b)
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116)
  const fx = f((0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047)
  const fy = f(0.2126 * R + 0.7152 * G + 0.0722 * B)
  const fz = f((0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883)
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}
const MINT = toLab(0x83, 0xff, 0xe7)
/** Near-mint shares, the closest pixel, and how much of the frame is the amber plasma (the charge, the eyes). */
const colourReport = async (buf) => {
  const { data } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  let near10 = 0; let near20 = 0; let closest = Infinity; let amber = 0
  const n = data.length / 3
  for (let i = 0; i < data.length; i += 3) {
    const r = data[i]; const g = data[i + 1]; const b = data[i + 2]
    const L = toLab(r, g, b)
    const d = Math.hypot(L[0] - MINT[0], L[1] - MINT[1], L[2] - MINT[2])
    if (d < 10) near10++
    if (d < 20) near20++
    if (d < closest) closest = d
    // Amber: bright, saturated, red > green > blue with green about half-way (hue ≈ 25–50°)
    const max = Math.max(r, g, b); const min = Math.min(r, g, b)
    if (max > 200 && (max - min) / max > 0.45 && r === max && g > b && (g - b) / (r - b) > 0.35 && (g - b) / (r - b) < 0.8) amber++
  }
  return { near10: near10 / n, near20: near20 / n, closest, amber: amber / n }
}

// ─── Render ─────────────────────────────────────────────────────────────────

/** One composition, `cssW`×`cssH` CSS px at deviceScaleFactor 4: a PNG of 4× that. */
const shoot = async (id, cssW = CSS, cssH = CSS) => {
  const profile = mkdtempSync(join(tmpdir(), 'mega-thumb-'))
  const ctx = await chromium.launchPersistentContext(profile, {
    executablePath: CHROME,
    headless: true,
    viewport: { width: cssW, height: cssH },
    deviceScaleFactor: DSF,
    args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--mute-audio']
  })
  try {
    await ctx.addInitScript(() => {
      // Never let automation take a real pointer lock
      Element.prototype.requestPointerLock = function () { return Promise.resolve() }
    })
    const page = ctx.pages()[0] ?? await ctx.newPage()
    let errors = []
    page.on('pageerror', (e) => errors.push(String(e)))
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
    let url = ''
    // A dev server reloads the page whenever someone saves a source file; a
    // render caught by a reload starts again (at most three tries)
    for (let attempt = 1; !url; attempt++) {
      errors = []
      try {
        await page.goto(`http://localhost:${port}/#/models?m=thumb&v=${id}`, { waitUntil: 'load', timeout: 180000 })
        if (await page.title() !== TITLE) throw new Error(`wrong page title on ${port}`)
        await page.waitForFunction(() => window.__lab?.thumbReady === true, null, { timeout: 240000 })
        await page.waitForTimeout(1000)
        // Read the canvas itself, not a page screenshot: the boot loader (or
        // any other overlay) may still be up over it in a cold profile
        url = await page.evaluate(() => window.__lab.thumbPng())
      } catch (e) {
        if (attempt >= 3 || !/context was destroyed|navigat|Timeout/i.test(String(e))) throw e
        console.log(`v=${id}: the page reloaded under the render (try ${attempt}), again`)
      }
    }
    if (errors.length) throw new Error(`page errors in v=${id}: ${errors.join(' | ')}`)
    const png = Buffer.from(url.slice(url.indexOf(',') + 1), 'base64')
    const meta = await sharp(png).metadata()
    if (meta.width !== cssW * DSF || meta.height !== cssH * DSF) {
      throw new Error(`v=${id}: got ${meta.width}x${meta.height}, want ${cssW * DSF}x${cssH * DSF}`)
    }
    return png
  } finally {
    await ctx.close()
    rmSync(profile, { recursive: true, force: true })
  }
}

const png9 = (s) => s.png({ compressionLevel: 9, adaptiveFiltering: true, effort: 10 }).toBuffer()
const down = (buf, w, h = w) => png9(sharp(buf).resize(w, h, { kernel: 'lanczos3' }))

const rgba = async (buf) => {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return { data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length), width: info.width, height: info.height }
}

/** Smallest mozjpeg that still scores SSIM ≥ 0.99 against the png; null when none beats the png's size. */
const bestJpeg = async (png) => {
  const ref = await rgba(png)
  let best = null
  for (const q of [96, 94, 92, 90, 88, 86, 84, 82, 80]) {
    const jpg = await sharp(png).jpeg({ quality: q, mozjpeg: true, chromaSubsampling: '4:4:4' }).toBuffer()
    const s = ssim(ref, await rgba(jpg)).mssim
    if (s < 0.99) break
    best = { jpg, q, ssim: s }
  }
  return best && best.jpg.length < png.length ? best : null
}

const kb = (b) => `${(b.length / 1024).toFixed(0)} KB`

// ─── Poki ───────────────────────────────────────────────────────────────────

const runPoki = async () => {
  mkdirSync(join(OUT, 'variants'), { recursive: true })
  const shots = {}
  for (const id of VARIANTS) {
    const raw = await shoot(id)
    const v628 = await down(raw, 628)
    const m = await colourReport(v628)
    if (m.amber < 0.003) throw new Error(`v=${id}: no amber plasma in the frame (${(m.amber * 100).toFixed(2)}%): Flux and his charge did not render`)
    if (m.near10 > 0) throw new Error(`v=${id}: ${(m.near10 * 100).toFixed(2)}% of pixels within ΔE 10 of #83FFE7 (Poki's playground)`)
    writeFileSync(join(OUT, 'variants', `${id}-628.png`), v628)
    shots[id] = { raw, v628 }
    console.log(`v=${id}: 628 ${kb(v628)} · near #83FFE7: ΔE<20 ${(m.near20 * 100).toFixed(2)}%, closest ΔE ${m.closest.toFixed(1)} · amber ${(m.amber * 100).toFixed(1)}%`)
  }

  const ids = Object.keys(shots)
  if (ids.length > 1) {
    const cell = 400
    const tiles = await Promise.all(ids.map(id => sharp(shots[id].v628).resize(cell, cell).png().toBuffer()))
    await sharp({ create: { width: ids.length * cell + (ids.length - 1) * 12, height: cell, channels: 3, background: '#808080' } })
      .composite(tiles.map((input, i) => ({ input, left: i * (cell + 12), top: 0 })))
      .png().toFile(join(OUT, 'variants', 'sheet.png'))
  }

  const pick = shots[PICK]
  if (pick) {
    const master = await down(pick.raw, 1256)
    writeFileSync(join(OUT, 'thumbnail-1256.png'), master)
    writeFileSync(join(OUT, 'thumbnail-628.png'), pick.v628)
    const jpg = await bestJpeg(pick.v628)
    if (jpg) writeFileSync(join(OUT, 'thumbnail-628.jpg'), jpg.jpg)
    else rmSync(join(OUT, 'thumbnail-628.jpg'), { force: true })
    for (const s of [200, 128]) writeFileSync(join(OUT, `preview-${s}.png`), await down(pick.raw, s))
    console.log(`pick v=${PICK}: thumbnail-1256.png ${kb(master)} · thumbnail-628.png ${kb(pick.v628)}` +
      (jpg ? ` · thumbnail-628.jpg ${kb(jpg.jpg)} (q${jpg.q}, SSIM ${jpg.ssim.toFixed(4)})` : ' · no jpg (none smaller at SSIM ≥ 0.99)'))
    for (const f of ['thumbnail-1256.png', 'thumbnail-628.png', 'preview-200.png', 'preview-128.png']) statSync(join(OUT, f))
  } else if (!arg('only')) {
    throw new Error(`--pick ${PICK} is not one of the rendered variants (${ids.join(', ')})`)
  }
}

// ─── Playgama ───────────────────────────────────────────────────────────────

// The logo goes in the calmest corner, never the top-left (#185): tools/promotion/logoOverlay.mjs.
const withLockup = async (base) => {
  const { width, height } = await sharp(base).metadata()
  return png9(sharp(await withCoverLogo(base, width, height, width / height > 1.85 ? LOGO_WIDTH.share : undefined)))
}

/**
 * The app icon from public/icons/icon.svg, rendered by Chrome as
 * scripts/render-icons.mjs does it (the SVG swaps marks through a media query
 * on its own size, which only a browser evaluates): the rounded tile with
 * clear corners, and a full-bleed square with the badge inside the maskable
 * safe zone (the inner 80 % circle) for platforms that mask the icon.
 */
// The app icon at `size`: the tile of public/icons/icon.svg (night-blue
// gradient + amber glow, same stops) drawn natively, with the head laid on from
// the 2048 px emblem render (public/images/logo/mega-droid-emblem-2048.png) by
// a Lanczos downscale. The SVG embeds a small head that blurs when blown up to
// 1024, so the store icons are not rendered from it. Rounded: the tile with
// rx 112/512; square: full bleed, the head at 0.84 in the maskable safe zone.
const renderIcon = async (size) => {
  const k = size / 512
  const tile = (rx) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512"><defs><radialGradient id="b" cx="50%" cy="42%" r="64%"><stop offset="0" stop-color="#24397a"/><stop offset=".56" stop-color="#122150"/><stop offset="1" stop-color="#0a1224"/></radialGradient><radialGradient id="g" cx="50%" cy="52%" r="46%"><stop offset="0" stop-color="#ffa733" stop-opacity=".55"/><stop offset="1" stop-color="#ffa733" stop-opacity="0"/></radialGradient></defs><rect width="512" height="512" rx="${rx}" fill="url(#b)"/><rect width="512" height="512" rx="${rx}" fill="url(#g)"/></svg>`)
  const emblem = join(ROOT, 'public', 'images', 'logo', 'mega-droid-emblem-2048.png')
  const head = async (scale) => {
    const w = Math.round(440 * k * scale)
    const left = Math.round(size / 2 + (36 * k - size / 2) * scale)
    const top = Math.round(size / 2 + (40 * k - size / 2) * scale)
    return { input: await sharp(emblem).resize(w, w, { kernel: 'lanczos3' }).png().toBuffer(), left, top }
  }
  const rounded = await sharp(tile(112)).composite([await head(1)]).png().toBuffer()
  const square = await sharp(await sharp(tile(0)).flatten({ background: '#0a1224' }).png().toBuffer()).composite([await head(0.84)]).png().toBuffer()
  return { rounded, square }
}

const runPlaygama = async () => {
  for (const d of ['covers', 'covers-logo', 'wrap', 'previews']) mkdirSync(join(OUT, d), { recursive: true })
  /** Exact size, the cover slots' 10 MB cap, then write. */
  const put = async (rel, buf, w, h) => {
    const meta = await sharp(buf).metadata()
    if (meta.width !== w || meta.height !== h) throw new Error(`${rel}: ${meta.width}x${meta.height}, want ${w}x${h}`)
    if (buf.length > 10 * 1024 * 1024) throw new Error(`${rel}: ${kb(buf)}; a cover slot takes at most 10 MB`)
    writeFileSync(join(OUT, rel), buf)
    console.log(`${rel}: ${w}x${h}, ${kb(buf)}`)
  }
  const rendered = async (name, buf) => {
    const m = await colourReport(buf)
    if (m.amber < 0.003) throw new Error(`${name}: no amber plasma in the frame (${(m.amber * 100).toFixed(2)}%): Flux and his charge did not render`)
    return buf
  }

  // The three cover slots: no logo and no text. YouTube Playables forbids
  // branding in a thumbnail, and we cannot tell which slot Playgama forwards.
  // The square is the Poki close-up (the catalog shows it ~218 px wide); the
  // landscape and portrait are compositions that fill the frame.
  const square = await rendered('square', await down(await shoot('sector', 400, 400), 800))
  await put('covers/square-800x800.png', square, 800, 800)
  const landscape = await rendered('landscape', await down(await shoot('land', 960, 540), 1920, 1080))
  await put('covers/landscape-1920x1080.png', landscape, 1920, 1080)
  const portrait = await rendered('portrait', await down(await shoot('port', 540, 960), 1080, 1920))
  await put('covers/portrait-1080x1920.png', portrait, 1080, 1920)

  // The logo versions (covers-logo/, for other portals) and the Wrap images:
  // one `wide` render feeds the logo landscape, the Wrap hero (without the
  // logo: the site sets the title as its heading) and the share image
  const wide = await shoot('wide', 960, 540)
  const hero = await rendered('wide', await down(wide, 1920, 1080))
  await put('wrap/hero-1920x1080.png', hero, 1920, 1080)
  await put('covers-logo/landscape-1920x1080.png', await withLockup(hero), 1920, 1080)
  // Share (wrap/share-1280x670.*): no longer made here. It is cut from the
  // painted blaze-clash cover by tools/promotion/blaze-clash-formats.mjs (the
  // render cut probed soft); only read here for the previews.
  const share = readFileSync(join(OUT, 'wrap', 'share-1280x670.png'))

  // The logo portrait: Flux head to boots, the lockup over the top third
  const tall = await rendered('tall', await down(await shoot('tall', 540, 960), 1080, 1920))
  await put('covers-logo/portrait-1080x1920.png', await withLockup(tall), 1080, 1920)

  // Icon (Wrap: the site's icon, favicon and PWA icon)
  const icon = await renderIcon(1024)
  await put('wrap/icon-1024.png', await png9(sharp(icon.square)), 1024, 1024)
  await put('wrap/icon-1024-rounded.png', await png9(sharp(icon.rounded)), 1024, 1024)

  // The three upload covers (and the share image and icon) at catalog size,
  // side by side, to check they read small
  const small = [
    ['square-218.png', square, 218, 218], ['landscape-448x252.png', landscape, 448, 252],
    ['portrait-216x384.png', portrait, 216, 384], ['share-448x234.png', share, 448, 234], ['icon-64.png', icon.square, 64, 64]
  ]
  for (const [name, buf, w, h] of small) writeFileSync(join(OUT, 'previews', name), await down(buf, w, h))
  await previewSheet()
}

// The preview sheet: the catalog-size previews in the top row, then the Wrap
// gameplay screenshots (wrap/screens/*.png) three to a row at the landscape
// preview size. The screenshots are captured from real gameplay, not by this
// script; `--set playgama --sheet` rebuilds just the sheet (no server, no
// browser) after they change.
const PREVIEWS = [['square-218.png', 218, 218], ['landscape-448x252.png', 448, 252],
  ['portrait-216x384.png', 216, 384], ['share-448x234.png', 448, 234], ['icon-64.png', 64, 64]]
const previewSheet = async () => {
  const tiles = []
  let x = 12
  for (const [name, w] of PREVIEWS) {
    tiles.push({ input: readFileSync(join(OUT, 'previews', name)), left: x, top: 12 })
    x += w + 12
  }
  let y = 384 + 24
  const dir = join(OUT, 'wrap', 'screens')
  const shots = existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith('.png')).sort() : []
  for (const [i, f] of shots.entries()) {
    const buf = readFileSync(join(dir, f))
    const meta = await sharp(buf).metadata()
    if (meta.width !== 1920 || meta.height !== 1080) throw new Error(`wrap/screens/${f}: ${meta.width}x${meta.height}, want 1920x1080`)
    if (buf.length > 10 * 1024 * 1024) throw new Error(`wrap/screens/${f}: ${kb(buf)}, over 10 MB`)
    tiles.push({ input: await down(buf, 448, 252), left: 12 + (i % 3) * (448 + 12), top: y + Math.floor(i / 3) * (252 + 12) })
  }
  if (shots.length) y += Math.ceil(shots.length / 3) * (252 + 12)
  else console.log('previews/sheet.png: no wrap/screens/*.png yet')
  await sharp({ create: { width: Math.max(x, 12 + 3 * (448 + 12)), height: y, channels: 3, background: '#f2f4f8' } })
    .composite(tiles).png().toFile(join(OUT, 'previews', 'sheet.png'))
  console.log(`previews/sheet.png: the previews + ${shots.length} gameplay screenshots`)
}

const runPlaygamaLogo = async () => {
  const put = async (rel, buf, w, h) => {
    const meta = await sharp(buf).metadata()
    if (meta.width !== w || meta.height !== h) throw new Error(`${rel}: ${meta.width}x${meta.height}, want ${w}x${h}`)
    writeFileSync(join(OUT, rel), buf)
    console.log(`${rel}: ${w}x${h}, ${kb(buf)}`)
  }
  const hero = readFileSync(join(OUT, 'wrap', 'hero-1920x1080.png'))
  await put('covers-logo/landscape-1920x1080.png', await withLockup(hero), 1920, 1080)
  // The share image comes from tools/promotion/blaze-clash-formats.mjs (see runPlaygama).
  const share = readFileSync(join(OUT, 'wrap', 'share-1280x670.png'))
  const tall = await down(await shoot('tall', 540, 960), 1080, 1920)
  await put('covers-logo/portrait-1080x1920.png', await withLockup(tall), 1080, 1920)
  const icon = await renderIcon(1024)
  await put('wrap/icon-1024.png', await png9(sharp(icon.square)), 1024, 1024)
  await put('wrap/icon-1024-rounded.png', await png9(sharp(icon.rounded)), 1024, 1024)
  writeFileSync(join(OUT, 'previews', 'share-448x234.png'), await down(share, 448, 234))
  writeFileSync(join(OUT, 'previews', 'icon-64.png'), await down(icon.square, 64, 64))
  await previewSheet()
}

try {
  if (SET === 'poki') await runPoki()
  else if (SHEET_ONLY) await previewSheet()
  else if (LOGO_ONLY) await runPlaygamaLogo()
  else await runPlaygama()
} finally {
  stopServer()
}
