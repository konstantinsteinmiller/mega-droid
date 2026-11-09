#!/usr/bin/env node
/**
 * ─── Publish a trailer to YouTube through the user's own browser ─────────────
 *
 *   node tools/youtube/publish.mjs [config.json] [--metadata-only] [--new] [--dry-run]
 *
 * Drives YouTube Studio in the user's already signed-in Brave (or Chrome)
 * over the DevTools protocol: no API keys, no OAuth app. The config (see
 * `trailer.json`) holds the video and thumbnail paths and every field Studio
 * asks for; `<config>.state.json` remembers the video it published and the
 * hash of the file it uploaded, so running it again UPDATES that video:
 *
 *   same file      → the existing video's details are rewritten in place
 *                    (title, description, tags, thumbnail, category, language,
 *                    audience, altered content, visibility)
 *   changed file   → YouTube cannot replace a video's file, so the new cut is
 *                    uploaded as a new video, published, and the old one is
 *                    set to `retireOld` (default "unlisted": its links keep
 *                    working, the channel shows one trailer)
 *   --new          → upload a new video whatever the state says
 *   --metadata-only→ never upload, only rewrite the details
 *   --dry-run      → fill everything, publish nothing (the dialog is left open)
 *
 * Studio's own element ids and test-ids only, never its words: it works in
 * any interface language.
 *
 * The browser: Brave/Chrome with remote debugging switched on
 * (brave://inspect → "Discover network targets", or --remote-debugging-port).
 * The new-style switch only accepts the browser WebSocket named in the
 * profile's DevToolsActivePort file, and asks the user to allow each new
 * connection: click "Allow" when the infobar shows.
 *
 * Canonical copy: ~/.claude/skills/publish-cinematic-trailer/scripts/publish-youtube.mjs
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, resolve, win32 } from 'node:path'
import { pathToFileURL } from 'node:url'

/** Studio's category test-ids (Gaming is, oddly, GADGETS). */
const CATEGORY = {
  Gaming: 'CREATOR_VIDEO_CATEGORY_GADGETS', Film: 'CREATOR_VIDEO_CATEGORY_FILM', Entertainment: 'CREATOR_VIDEO_CATEGORY_ENTERTAINMENT',
  Education: 'CREATOR_VIDEO_CATEGORY_EDUCATION', Science: 'CREATOR_VIDEO_CATEGORY_SCIENCE', People: 'CREATOR_VIDEO_CATEGORY_PEOPLE',
  Music: 'CREATOR_VIDEO_CATEGORY_MUSIC', Howto: 'CREATOR_VIDEO_CATEGORY_HOWTO', Comedy: 'CREATOR_VIDEO_CATEGORY_COMEDY'
}
/** Studio's language test-ids are ISO codes. */
const LANGUAGE = { English: 'en', German: 'de', French: 'fr', Spanish: 'es', Italian: 'it', Portuguese: 'pt', Japanese: 'ja', Korean: 'ko', Chinese: 'zh', Russian: 'ru' }
const VISIBILITY = { public: 'PUBLIC', unlisted: 'UNLISTED', private: 'PRIVATE' }

const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex')

/** The browser WebSocket of the user's Brave (or Chrome) profile. */
const browserEndpoint = async () => {
  const local = process.env.LOCALAPPDATA ?? resolve(process.env.HOME ?? '', 'AppData/Local')
  const profiles = [
    process.env.BROWSER_USER_DATA,
    resolve(local, 'BraveSoftware/Brave-Browser/User Data'),
    resolve(local, 'Google/Chrome/User Data'),
    resolve(process.env.HOME ?? '', 'Library/Application Support/BraveSoftware/Brave-Browser'),
    resolve(process.env.HOME ?? '', '.config/BraveSoftware/Brave-Browser')
  ].filter(Boolean)
  for (const dir of profiles) {
    const f = resolve(dir, 'DevToolsActivePort')
    if (!existsSync(f)) continue
    const [port, path] = readFileSync(f, 'utf8').trim().split(/\r?\n/)
    return `ws://127.0.0.1:${port}${path}`
  }
  // The old switch serves a JSON listing.
  const r = await fetch('http://127.0.0.1:9222/json/version').catch(() => null)
  if (r?.ok) return (await r.json()).webSocketDebuggerUrl
  throw new Error('no debuggable Brave/Chrome: switch on remote debugging (brave://inspect) and keep the browser open')
}

/** Is it on screen? Studio's custom-element hosts have no box of their own, so Playwright's
 *  isVisible() calls an open upload dialog hidden: ask the page (offsetParent) instead. */
const shown = (page, sel) => page.evaluate((s) => [...document.querySelectorAll(s)].some(e => e.offsetParent !== null), sel).catch(() => false)

/** Wait (polling) until `sel` is on screen; false on timeout. */
const until = async (page, sel, ms) => {
  for (let t = 0; t < ms; t += 1000) { if (await shown(page, sel)) return true; await sleep(1000) }
  return false
}

const PUBLISHED = 'ytcp-video-share-dialog, ytcp-uploads-still-processing-dialog'

/** In the upload wizard: on to the last step, the visibility, Publish / Save; true once Studio confirms. */
const finishWizard = async (page, c, log) => {
  const d = page.locator('ytcp-uploads-dialog')
  for (let i = 0; i < 4 && await shown(page, 'ytcp-uploads-dialog #next-button'); i++) {
    await d.locator('#next-button').click().catch(() => {})
    await sleep(1500)
  }
  await d.locator(`tp-yt-paper-radio-button[name="${VISIBILITY[c.visibility ?? 'public']}"]`).click()
  await sleep(800)
  await d.locator('#done-button').click()
  const ok = await until(page, PUBLISHED, 120000)
  if (ok) await page.locator('ytcp-video-share-dialog #close-button, ytcp-uploads-still-processing-dialog #close-button').filter({ visible: true }).first().click().catch(() => {})
  else log('Studio did not confirm the publish (its dialog shows an error, or the checks are still running)')
  return ok
}

/**
 * A video Studio keeps as a DRAFT (the wizard stopped at "Done" with "An error occurred",
 * or the run died there): its edit page has a draft banner and no visibility control.
 * Save what the page holds, open the draft's wizard from the banner, finish it.
 */
const finishDraft = async (page, id, c, log) => {
  await page.bringToFront()
  if (!page.url().includes(`/video/${id}/edit`)) {
    await page.goto(`https://studio.youtube.com/video/${id}/edit`)
    await page.waitForSelector('#title-textarea #textbox', { timeout: 60000 })
    await sleep(2000)
  }
  if (!(await shown(page, 'ytcp-uploads-dialog'))) {
    const save = page.locator('ytcp-button#save').first()
    if (await shown(page, 'ytcp-button#save') && (await save.getAttribute('disabled')) === null) { await save.click().catch(() => {}); await sleep(4000) }
    // The draft banner's own action ("Edit draft" in any language).
    await page.locator('ytcp-banner #action-1').first().click()
    if (!(await until(page, 'ytcp-uploads-dialog', 20000))) throw new Error(`video ${id}: the draft's wizard did not open`)
  }
  return finishWizard(page, c, log)
}

/** Is the video on its edit page a draft (a banner with an action, no visibility control)? */
const isDraft = async (page) => (await shown(page, 'ytcp-banner #action-1')) && !(await shown(page, 'ytcp-video-metadata-visibility'))

/** Set a file input over raw CDP (Playwright's setter can time out on Studio). */
const setFile = async (page, selector, file) => {
  const s = await page.context().newCDPSession(page)
  try {
    const { root } = await s.send('DOM.getDocument', { depth: -1, pierce: true })
    const { nodeId } = await s.send('DOM.querySelector', { nodeId: root.nodeId, selector })
    if (!nodeId) throw new Error(`no file input ${selector}`)
    await s.send('DOM.setFileInputFiles', { nodeId, files: [process.platform === 'win32' ? win32.normalize(file) : file] })
  } finally { await s.detach().catch(() => {}) }
}

/** Fill one of Studio's contenteditable text boxes. */
const fillBox = async (page, scope, sel, text) => {
  const box = scope.locator(sel).first()
  await box.click()
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.press('Delete')
  await page.keyboard.insertText(text)
}

/** Pick an item from a Studio menu by its test-id (open it in the same breath: menus close on blur). */
const pick = async (page, opener, testId) => {
  await opener.click()
  await sleep(700)
  await page.locator(`tp-yt-paper-item[test-id="${testId}"]`).filter({ visible: true }).first().click()
  await sleep(500)
}

/**
 * Every detail field, in the upload dialog or on a video's edit page (the
 * same editor component and ids in both).
 */
const fillDetails = async (page, scope, c, root, log) => {
  await fillBox(page, scope, '#title-textarea #textbox', c.title)
  await fillBox(page, scope, '#description-textarea #textbox', [].concat(c.description).join('\n'))
  if (c.thumbnail) {
    await setFile(page, 'input#file-loader', resolve(root, c.thumbnail))
    await sleep(2500)
  }
  await scope.locator(`tp-yt-paper-radio-button[name="${c.madeForKids ? 'VIDEO_MADE_FOR_KIDS_MFK' : 'VIDEO_MADE_FOR_KIDS_NOT_MFK'}"]`).click()
  if (!(await scope.locator('#tags-container').isVisible())) await scope.locator('#toggle-button').first().click()
  await sleep(800)
  const altered = scope.locator(`tp-yt-paper-radio-button[name="${c.alteredContent ? 'VIDEO_HAS_ALTERED_CONTENT_YES' : 'VIDEO_HAS_ALTERED_CONTENT_NO'}"]`)
  if (await altered.count()) await altered.click()
  // Tags: the old chips off, the new ones on in one go.
  for (let i = 0; i < 80; i++) {
    const x = scope.locator('#tags-container ytcp-chip #delete-icon')
    if (!(await x.count())) break
    await x.first().click()
  }
  if (c.tags?.length) {
    await scope.locator('#tags-container input#text-input').click()
    await page.keyboard.insertText(c.tags.join(',') + ',')
    await page.keyboard.press('Enter')
  }
  if (c.language) await pick(page, scope.locator('#language-input'), LANGUAGE[c.language] ?? c.language)
  if (c.category) await pick(page, scope.locator('ytcp-form-select#category'), CATEGORY[c.category] ?? c.category)
  log(`details: "${c.title}" · ${c.tags?.length ?? 0} tags · ${c.category ?? '-'} · ${c.language ?? '-'} · kids ${!!c.madeForKids}`)
}

/** The studio tab: one that is open already, or a new one. */
const studioPage = async (browser) => {
  const ctx = browser.contexts()[0]
  const page = ctx.pages().find(p => p.url().startsWith('https://studio.youtube.com/')) ?? (await ctx.newPage())
  // A half-edited page asks "leave?": yes (this run rewrites it anyway).
  if (!page.__publishDialogs) { page.__publishDialogs = true; page.on('dialog', d => d.accept().catch(() => {})) }
  return page
}

/** Upload, fill, publish: the new video's id. */
const upload = async (page, c, root, opts, log, remember = () => {}) => {
  await page.bringToFront()
  await page.goto(`https://studio.youtube.com/channel/${c.channel}/videos/upload?d=ud`)
  await page.waitForSelector('input[type=file][name=Filedata]', { state: 'attached', timeout: 60000 })
  await setFile(page, 'input[type=file][name=Filedata]', resolve(root, c.video))
  const d = page.locator('ytcp-uploads-dialog')
  await d.locator('#title-textarea #textbox').waitFor({ timeout: 120000 })
  await sleep(2500)
  await fillDetails(page, d, c, root, log)
  const link = await d.locator('a[href*="youtu.be/"], .video-url-fadeable a').first().getAttribute('href')
  const id = (link ?? '').split('/').pop()
  log(`uploading as ${id}`)
  if (opts.dryRun) {
    for (let i = 0; i < 3; i++) { await d.locator('#next-button').click(); await sleep(1500) }
    await d.locator(`tp-yt-paper-radio-button[name="${VISIBILITY[c.visibility ?? 'public']}"]`).click()
    log('dry run: the dialog is left open, nothing published')
    return id
  }
  // Known before anything can fail: a re-run finishes THIS video instead of uploading again.
  remember(id, false)
  let ok = await finishWizard(page, c, log)
  // "Done" pressed while Studio still checks the file fails with a bare "An error occurred" and
  // leaves a draft: wait, then finish the draft from its edit page.
  for (let i = 1; !ok && i <= 3; i++) {
    log(`finishing the draft (attempt ${i})…`)
    await sleep(30000 * i)
    ok = await finishDraft(page, id, c, log).catch((e) => { log(String(e?.message ?? e).slice(0, 200)); return false })
  }
  if (!ok) throw new Error(`video ${id} is uploaded but still a draft: run again (it finishes the draft) or open https://studio.youtube.com/video/${id}/edit`)
  remember(id, true)
  log(`published https://youtu.be/${id}`)
  return id
}

/** Set a video's visibility on its edit page (the visibility dialog). */
const setVisibility = async (page, visibility) => {
  await page.locator('ytcp-video-metadata-visibility #select-button, ytcp-video-metadata-visibility').first().click()
  await sleep(800)
  await page.locator(`tp-yt-paper-radio-button[name="${VISIBILITY[visibility]}"]`).filter({ visible: true }).first().click()
  await page.locator('ytcp-video-visibility-select #save-button, #save-button').filter({ visible: true }).first().click()
  await sleep(800)
}

/** Rewrite an existing video's details on its edit page, and save. */
const update = async (page, id, c, root, opts, log, fields = true) => {
  await page.bringToFront()
  await page.goto(`https://studio.youtube.com/video/${id}/edit`)
  await page.waitForSelector('#title-textarea #textbox', { timeout: 60000 })
  await sleep(2000)
  const editor = page.locator('ytcp-video-metadata-editor').first()
  if (fields) await fillDetails(page, editor, c, root, log)
  if (!opts.dryRun && await isDraft(page)) {
    log(`${id} is a draft: finishing it`)
    if (!(await finishDraft(page, id, c, log))) throw new Error(`video ${id} is still a draft`)
    log(`published https://youtu.be/${id}`)
    return
  }
  if (c.visibility) await setVisibility(page, c.visibility)
  if (opts.dryRun) { log('dry run: not saved'); return }
  // `.first()`: with a draft's wizard open the page holds two of them (strict mode would throw).
  const save = page.locator('ytcp-button#save').first()
  if (await save.getAttribute('disabled') === null) {
    await save.click()
    await page.waitForFunction(() => document.querySelector('ytcp-button#save')?.hasAttribute('disabled'), null, { timeout: 60000 })
    log(`saved https://youtu.be/${id}`)
  } else log('nothing to save: already up to date')
}

/** The whole run, given a connected browser (the CLI connects; a daemon can pass its own). */
export const run = async ({ browser, configPath, opts = {}, log = console.log }) => {
  const cfgFile = resolve(configPath)
  const root = resolve(dirname(cfgFile), opts.root ?? findRoot(dirname(cfgFile)))
  const c = JSON.parse(readFileSync(cfgFile, 'utf8'))
  const stateFile = cfgFile.replace(/\.json$/, '.state.json')
  const state = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')) : {}
  const video = resolve(root, c.video)
  if (!existsSync(video)) throw new Error(`no video at ${video}`)
  const hash = sha256(video)
  const page = await studioPage(browser)
  // The same file again (published, or left a draft by a failed run): the update path, which finishes a draft.
  const fresh = opts.new || !state.videoId || (!opts.metadataOnly && state.videoSha256 !== hash)
  if (fresh) {
    const old = state.videoId
    const remember = (id, published) => writeFileSync(stateFile, JSON.stringify({ videoId: id, videoSha256: hash, published, publishedAt: new Date().toISOString(), previous: [...(state.previous ?? []), ...(old ? [old] : [])] }, null, 2) + '\n')
    const id = await upload(page, c, root, opts, log, remember)
    if (!opts.dryRun) {
      const retire = c.retireOld ?? 'unlisted'
      if (old && old !== id && retire !== 'keep') {
        log(`the old cut ${old} → ${retire}`)
        await update(page, old, { visibility: retire }, root, opts, log, false)
      }
    }
  } else {
    await update(page, state.videoId, c, root, opts, log)
    if (!opts.dryRun) writeFileSync(stateFile, JSON.stringify({ ...state, published: true, updatedAt: new Date().toISOString() }, null, 2) + '\n')
  }
}

/** The project root: the nearest folder up with a package.json. */
const findRoot = (dir) => {
  let d = dir
  for (let i = 0; i < 8; i++) { if (existsSync(resolve(d, 'package.json'))) return d; d = dirname(d) }
  return dir
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url
if (isMain) {
  const args = process.argv.slice(2)
  const configPath = args.find(a => !a.startsWith('--')) ?? 'tools/youtube/trailer.json'
  const opts = { new: args.includes('--new'), metadataOnly: args.includes('--metadata-only'), dryRun: args.includes('--dry-run') }
  const require = createRequire(resolve(findRoot(process.cwd()), 'package.json'))
  let pw
  try { pw = require('playwright-core') } catch { pw = require('playwright') }
  const endpoint = await browserEndpoint()
  console.log('connecting to the browser (allow the debugging connection if it asks)…')
  // Brave asks the user to allow every new connection: give them time to click.
  const browser = await pw.chromium.connectOverCDP(endpoint, { timeout: 180000 })
  // Leaves the user's browser open: only this connection goes.
  try {
    await run({ browser, configPath: isAbsolute(configPath) ? configPath : resolve(process.cwd(), configPath), opts })
    process.exit(0)
  } catch (e) {
    console.error(e?.stack ?? e)
    process.exit(1)
  }
}
