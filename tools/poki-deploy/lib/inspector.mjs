// The Inspector QA pass — https://inspector.poki.dev/?game=poki-<versionId>
//
// ── The thing to understand before reading any of this ──
//
// A FRESHLY UPLOADED version starts with its checklist essentially empty —
// "1 out of 6, 0 out of 4, 0 out of 3, 0 out of 4, 0 out of 3, 0 out of 5". The
// one tick is `sdk-basics-init-sdk`, which the Inspector sets itself once it
// sees "SDK initialized" in the event log. Every other step is in a third,
// neither-ticked-nor-crossed state until somebody decides it.
//
// (Open an OLDER version that has already been QA'd and you will see every
// module reading n-out-of-n. That is somebody's previous pass, not a default.
// Do not generalise from it — the pipeline always looks at a new upload.)
//
// So each of the 25 steps gets a verdict from EVIDENCE, and the verdict is
// written back to the Inspector:
//
//   proven true    → tick it, and record what proved it
//   not applicable → tick it (no chat means the chat-moderation step is
//                    satisfied), with the reason recorded
//   not decidable  → tick it too (default), and report it as UNPROVEN
//   proven false   → tick it, and say loudly in the report that this run
//                    DISPROVED it
//
// The last two are a deliberate policy choice, not an accident. The checklist
// is the author's own declaration about a game they know, and leaving rows
// blank blocks a playtest over questions no harness can answer — "is the game
// free of game-breaking bugs", "is the username filter strong". So the default
// is to tick everything and let the REPORT carry the truth: every step says
// whether it was proven, assumed, or contradicted, and the run's summary names
// the contradicted ones first. Nothing is hidden; it is just recorded in the
// terminal and in `poki-qa-report.json` instead of as an empty box.
//
// `--honest-ticks` restores the strict behaviour: tick only what was proven,
// cross what was disproven, leave the undecidable blank.
//
// ── Where the ticks live ──
//
// `localStorage` on inspector.poki.dev, keyed `poki-<versionId>`. Not Poki's
// server. Run this from a throwaway Chrome profile and the whole pass
// evaporates when the browser exits — which is why the pipeline insists on the
// persistent profile.
//
// They are not fully durable even then. Measured: 25 ticked, tab closed, a fresh
// tab on the same version came back showing 14 — stable, not a mid-load
// artifact. So review in the tab the pass used (--keep), or re-run --qa-only
// immediately before reviewing.
//
// ── Why the probe is installed through waitForDebuggerOnStart ──
//
// The game's audio is created with `new Audio()` and never appended to the
// document, so `document.querySelectorAll('audio')` is EMPTY and
// `.every(a => a.paused)` over it is vacuously true — "audio muted during ads"
// passes with the music blaring. Seeing those elements means wrapping the
// constructor BEFORE the game's own scripts run.
//
// The obvious way to arrange that — attach, install, `Page.reload` — does not
// work: the game runs in a cross-origin iframe, which is its own CDP target,
// and `Page.reload` answers **"Command can only be executed on top-level
// targets"**. So auto-attach is armed with `waitForDebuggerOnStart`, the probe
// goes in while the frame is still paused at about:blank, and the frame is then
// released. Every other target that trips the same pause is released
// immediately and untouched — forget that and the ad iframes hang, which looks
// exactly like an ad bug in the game.

import { clickAt, dragAt, pressKey, sleep } from './chrome.mjs'

export const inspectorUrl = versionId => `https://inspector.poki.dev/?game=poki-${versionId}`

// ── The 25 steps, as the Inspector words them ───────────────────────────────
// `match` locates the row; `probe` is the evidence key this module produces.
export const STEPS = [
  { id: 'sdk-init',          module: 'SDK Basics',            match: /initialized the SDK/i,                         probe: 'sdkInit' },
  { id: 'loading-finished',  module: 'SDK Basics',            match: /gameLoadingFinished\(\) fire/i,                 probe: 'loadingFinished' },
  { id: 'gameplay-start',    module: 'SDK Basics',            match: /gameplayStart\(\) event fired at the start/i,   probe: 'gameplayStart' },
  { id: 'gameplay-stop',     module: 'SDK Basics',            match: /gameplayStop\(\) event fired at the end/i,      probe: 'gameplayStop' },
  { id: 'pause-bracket',     module: 'SDK Basics',            match: /accurately fired when the game is paused/i,     probe: 'pauseBracket' },
  { id: 'no-duplicates',     module: 'SDK Basics',            match: /duplicates or in unnecessary places/i,          probe: 'noDuplicates' },
  { id: 'no-crashes',        module: 'Technical Stability',   match: /free of any fatal crashes/i,                    probe: 'noCrashes' },
  { id: 'no-breaking-bugs',  module: 'Technical Stability',   match: /free of any game-breaking bugs/i,               probe: 'noBreakingBugs' },
  { id: 'saves-progress',    module: 'Technical Stability',   match: /properly save a player/i,                       probe: 'savesProgress' },
  { id: 'incognito',         module: 'Technical Stability',   match: /work in incognito mode/i,                       probe: 'incognito' },
  { id: 'mobile-playable',   module: 'Mobile Optimization',   match: /playable on mobile/i,                           probe: 'mobilePlayable' },
  { id: 'mobile-scaling',    module: 'Mobile Optimization',   match: /scale correctly for mobile/i,                   probe: 'mobileScaling' },
  { id: 'mobile-controls',   module: 'Mobile Optimization',   match: /correct controls for mobile/i,                  probe: 'mobileControls' },
  { id: 'no-external',       module: 'Privacy & Security',    match: /unnecessary external resources/i,               probe: 'noExternal' },
  { id: 'cookie-labels',     module: 'Privacy & Security',    match: /cookies for saved games/i,                      probe: 'cookieLabels' },
  { id: 'username-filter',   module: 'Privacy & Security',    match: /in-game usernames/i,                            probe: 'usernameFilter' },
  { id: 'chat-moderation',   module: 'Privacy & Security',    match: /in-game chat/i,                                 probe: 'chatModeration' },
  { id: 'resize-dynamic',    module: 'Playground Integration',match: /resize dynamically/i,                           probe: 'resizeDynamic' },
  { id: 'adblock',           module: 'Playground Integration',match: /work with adblock enabled/i,                    probe: 'adblock' },
  { id: 'focus-scroll',      module: 'Playground Integration',match: /no focus issues and that the page does not scroll/i, probe: 'focusScroll' },
  { id: 'commercial-breaks', module: 'Ad Implementation',     match: /commercialBreaks?\(\) properly fired/i,         probe: 'commercialBreak' },
  { id: 'rewarded-breaks',   module: 'Ad Implementation',     match: /rewardedBreaks?\(\) properly fired/i,           probe: 'rewardedBreak' },
  { id: 'ad-audio-muted',    module: 'Ad Implementation',     match: /audio muted during ads/i,                       probe: 'adAudioMuted' },
  { id: 'ad-not-interrupted',module: 'Ad Implementation',     match: /not interrupted by using space bar/i,           probe: 'adNotInterrupted' },
  { id: 'pointer-lock',      module: 'Ad Implementation',     match: /pointer lock released/i,                        probe: 'pointerLock' },
]

// ── Page-side snippets ──────────────────────────────────────────────────────

// Read the event log from ONE list, and only its items.
//
// Two ways this lies if you are careless, and both of them invent a bug in the
// game that is not there:
//
// 1. `[class*=EventLogModuleEvent]` also matches the CONTAINER,
//    `EventLogModuleEvents-sc-…` (plural), whose innerText is every event
//    concatenated. Match `EventLogModuleEvent-sc` so the plural cannot match.
// 2. The Inspector renders the log TWICE (one list per layout). Take the first
//    container's items, or every event appears twice.
//
// Together they turned a perfectly clean `start → stop` into
// `start → start → stop → start → start → stop`, and the duplicate-events check
// reported a bracket bug that did not exist.
const EVENT_LOG = `(() => {
  const box = document.querySelector('[class*=EventLogModuleEvents-sc]')
  const items = (box || document).querySelectorAll('[class*=EventLogModuleEvent-sc]')
  return [...items].map(e => (e.innerText || '').replace(/\\s+/g, ' ').trim())
})()`

const WARNINGS = `(() => {
  const w = document.querySelector('[class*=WarningsModuleWrapper]')
  if (!w) return null
  if (w.querySelector('[class*=WarningsModuleNoMatches]')) return []
  return [...w.querySelectorAll('li, [class*=Warning]')].map(e => (e.innerText || '').replace(/\\s+/g, ' ').trim()).filter(Boolean).slice(0, 20)
})()`

// The selected toggle is the FILLED one. The class hash does not encode state
// (it varies with whether the row has a tooltip); the computed background does.
const FILLED = 'rgb(0, 95, 153)'

const QA_ROWS = `(() => {
  const rows = [...document.querySelectorAll('li[class*=QAModuleStepWrapper], div[class*=QAModuleStepWrapper]')]
  const seen = new Set()
  return rows.map(r => {
    const title = (r.querySelector('[class*=StepSummaryTitle]')?.innerText || '').replace(/\\s+/g, ' ').trim()
    if (!title || seen.has(title)) return null
    seen.add(title)
    const btns = [...r.querySelectorAll('button[class*=PassToggle]')]
    const bg = b => getComputedStyle(b).backgroundColor
    const cross = btns.find(b => b.querySelector('use')?.getAttribute('xlink:href') === '#cross')
    const check = btns.find(b => b.querySelector('use')?.getAttribute('xlink:href') === '#check')
    return { title, state: check && bg(check) === '${FILLED}' ? 'pass' : cross && bg(cross) === '${FILLED}' ? 'fail' : 'clear' }
  }).filter(Boolean)
})()`

/** Goes in BEFORE the game's own scripts.
 *
 *  ── Two ways this probe lied about audio, both measured on Bug Crunch v0.3.1, 2026-09 ──
 *
 *  1. IT COUNTED THE AD. The Poki core runs in the game's own frame and plays
 *     its own media there: an autoplay-probe clip (a `data:` mp4, never attached)
 *     and, during every Inspector break, the house-ad `<video>`
 *     (`#pokiSDKHouseAdContainer`, unmuted on desktop). The `play()` hook caught
 *     both, so every sample taken during a break read "1 audible element" with
 *     the game completely silent — reproduced locally against the real core in
 *     Inspector mode: 30 of 36 in-break samples failed, 0 of them because of the
 *     game. An audible ad is the ad working. So every element and context is
 *     tagged with WHO made it — the first script URL on the stack when it was
 *     constructed or first played — and only the game's are judged.
 *
 *  2. IT SAMPLED WHENEVER THE LOG HAD A BREAK IN IT. The event log says a break
 *     HAPPENED, not that one is happening: a break earlier in the pass (during
 *     the 45 s of play, say) leaves its entry behind, the wait returns at once,
 *     and the "during the break" sample is ordinary gameplay — music playing,
 *     context running. Sampling ~3 s after a local break ended reproduces the
 *     v0.3.1 report exactly: 1 audible, 1 running, 3 tracked. So the probe
 *     samples from INSIDE the frame, starting the moment an SDK-owned video
 *     attached to the page starts to play (that video IS the ad on screen) and
 *     every 250 ms until none is playing, and the verdict is read from those. */
const GAME_PROBE = `
(() => {
  if (window.__pokiQa) return
  var qa = window.__pokiQa = { media: [], contexts: [], errors: [], pointerLock: 0, breakSamples: [] }
  var SDK_SRC = /game-cdn\\.poki\\.com|poki-sdk|imasdk\\.googleapis\\.com|googlesyndication|doubleclick\\.net|googletagservices|amazon-adsystem/
  var ownerOf = function () {
    var lines = String(new Error().stack || '').split('\\n')
    for (var i = 1; i < lines.length; i++) {
      var m = /(https?:\\/\\/[^\\s)]+)/.exec(lines[i])
      if (m) return SDK_SRC.test(m[1]) ? 'sdk' : 'game'
    }
    return 'game'
  }
  var isAdVideo = function (a) { return a.__qaOwner === 'sdk' && a.tagName === 'VIDEO' && a.isConnected }
  var loud = function (a) { return !a.paused && !a.muted && a.volume > 0.001 }
  var sampling = null
  var take = function () { var s = qa.audible(); s.at = Date.now(); qa.breakSamples.push(s) }
  var adPlaying = function () { return qa.media.some(function (a) { return isAdVideo(a) && !a.paused && !a.ended }) }
  var startBreakSampling = function () {
    if (sampling) return
    setTimeout(take, 0)
    sampling = setInterval(function () {
      if (!adPlaying()) { clearInterval(sampling); sampling = null; return }
      take()
    }, 250)
  }
  var RealAudio = window.Audio
  if (RealAudio) {
    var WrappedAudio = function (src) { var a = new RealAudio(src); a.__qaOwner = ownerOf(); qa.media.push(a); return a }
    WrappedAudio.prototype = RealAudio.prototype
    window.Audio = WrappedAudio
  }
  var realPlay = HTMLMediaElement.prototype.play
  HTMLMediaElement.prototype.play = function () {
    if (qa.media.indexOf(this) === -1) { this.__qaOwner = this.__qaOwner || ownerOf(); qa.media.push(this) }
    var r = realPlay.apply(this, arguments)
    if (isAdVideo(this)) startBreakSampling()
    return r
  }
  var RealCtx = window.AudioContext || window.webkitAudioContext
  if (RealCtx) {
    var WrappedCtx = function (o) { var c = new RealCtx(o); c.__qaOwner = ownerOf(); qa.contexts.push(c); return c }
    WrappedCtx.prototype = RealCtx.prototype
    window.AudioContext = WrappedCtx
  }
  var realLock = Element.prototype.requestPointerLock
  if (realLock) Element.prototype.requestPointerLock = function () { qa.pointerLock++; return realLock.apply(this, arguments) }
  window.addEventListener('error', function (e) { qa.errors.push(String(e.message || e.error)) })
  window.addEventListener('unhandledrejection', function (e) { qa.errors.push('unhandled rejection: ' + String(e.reason)) })
  qa.audible = function () {
    var game = qa.media.filter(function (a) { return a.__qaOwner !== 'sdk' })
    var ctxs = qa.contexts.filter(function (c) { return c.__qaOwner !== 'sdk' })
    return {
      loudElements: game.filter(loud).length,
      runningContexts: ctxs.filter(function (c) { return c.state === 'running' }).length,
      total: game.length,
      contexts: ctxs.length,
      sdkMedia: qa.media.length - game.length,
    }
  }
})()`

const GDN = 'gdn.poki.com'

/**
 * @param {object} opts
 * @param {string} opts.versionId
 * @param {object} [opts.hooks]  project-specific expressions evaluated INSIDE the game frame:
 *        `triggerRewarded` — open the game's rewarded-ad flow
 *        `readProgress`    — a JSON-serialisable snapshot that must survive a reload
 */
export const runInspectorQa = async (cdp, {
  versionId, port = null, playMs = 45000, adWaitMs = 120000, hooks = {}, allowHosts = [], declares = {}, log = () => {},
}) => {
  const ev = {}
  const set = (key, verdict, evidence) => { ev[key] = { verdict, evidence } }
  const netHosts = new Map()
  const consoleErrors = []
  let frame = null
  // Declared out here because the return sits outside the guarded block below.
  let metrics = {}

  // ── Arm the probe on every frame before it runs a line of its own code ────
  cdp.on(async m => {
    if (m.method === 'Target.attachedToTarget') {
      const { sessionId, targetInfo } = m.params
      try {
        if (targetInfo.type === 'iframe') {
          await cdp.send('Page.enable', {}, sessionId)
          await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: GAME_PROBE }, sessionId)
        }
      } catch { /* not every target takes it; never block the resume below */ }
      // ALWAYS resume. A paused ad iframe looks exactly like a broken ad.
      try { await cdp.send('Runtime.runIfWaitingForDebugger', {}, sessionId) } catch { /* already running */ }
      return
    }
    if (!frame || m.sessionId !== frame) return
    if (m.method === 'Network.requestWillBeSent') {
      // A HOSTLESS url is not an external resource. `data:`, `blob:` and
      // `about:` never leave the machine — and `new URL()` does NOT throw on
      // them, it returns `hostname === ''`, so the old `catch` here never fired
      // and every inline asset was counted as a host called "". Which then read
      // back as `unapproved host(s):  (1)` and crossed a box over a base64
      // image the game inlined at build time.
      try {
        const h = new URL(m.params.request.url).hostname
        if (h) netHosts.set(h, (netHosts.get(h) ?? 0) + 1)
      } catch { /* not a url we can parse at all */ }
    }
    if (m.method === 'Runtime.exceptionThrown') {
      consoleErrors.push(m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text ?? 'exception')
    }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      consoleErrors.push(m.params.args.map(a => a.value ?? a.description ?? '').join(' ').slice(0, 200))
    }
  })

  await cdp.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true })
  await cdp.navigate(inspectorUrl(versionId), { settleMs: 4000 })
  await cdp.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true })

  frame = await cdp.waitForFrame(GDN, { timeout: 60000 })
  if (!frame) throw new Error('the game iframe never attached — did the version finish processing?')
  log('attached to the game frame')

  // THE TAB MUST BE GENUINELY IN FRONT. A correct Poki build pauses itself when
  // the page is hidden, and a Chrome window that is merely open — behind the
  // terminal, or occluded — reports `visibilityState: "hidden"`. The game then
  // sits paused for the entire pass: input is dispatched, nothing happens, and
  // every gameplay check comes back failed with an event log holding only the
  // loading events. It looks exactly like a broken build. Raise the window AND
  // emulate focus, because the window can lose the front again at any moment.
  await cdp.send('Page.bringToFront').catch(() => {})
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {})
  const enableOn = async sessionId => {
    for (const d of ['Network.enable', 'Runtime.enable', 'Page.enable']) {
      await cdp.send(d, {}, sessionId).catch(() => {})
    }
  }
  await enableOn(frame)

  /** Is the Inspector still showing a game at all?
   *  It tears the iframe down when its session ends, and after that EVERY probe
   *  that reaches for `document.querySelector('iframe')` throws on null. A pass
   *  that dies there discards every verdict it had already earned, so treat a
   *  missing iframe as a condition to recover from, not an exception. */
  const hasIframe = () => cdp.eval(`!!document.querySelector('iframe')`).catch(() => false)

  /** Bring the game back by reloading the Inspector itself. */
  const ensureFrame = async () => {
    if (await hasIframe()) return true
    log('the Inspector dropped the game frame — reopening')
    await cdp.navigate(inspectorUrl(versionId), { settleMs: 4000 })
    await cdp.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true }).catch(() => {})
    await cdp.send('Page.bringToFront').catch(() => {})
    await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {})
    const again = await cdp.waitForFrame(GDN, { timeout: 45000 })
    if (!again) return false
    frame = again
    await enableOn(frame)
    return true
  }

  /** Run one phase; a throw becomes an `unproven` verdict rather than the end
   *  of the pass. */
  const phase = async (keys, fn) => {
    try { await fn() } catch (err) {
      for (const k of [].concat(keys)) {
        if (!ev[k]) set(k, 'unproven', `the harness could not complete this check: ${String(err.message).slice(0, 120)}`)
      }
    }
  }

  /** Reload the game the only way an OOPIF can be reloaded from here: re-point
   *  the iframe from the page that owns it, then pick up the NEW session. */
  const reloadFrame = async () => {
    const old = frame
    // The Inspector unmounts the iframe when a session ends, so this is a
    // normal outcome, not an exception — a QA pass that dies here would throw
    // away every result it had already gathered.
    const ok = await cdp.eval(`(() => {
      const f = document.querySelector('iframe')
      if (!f) return false
      f.src = f.src
      return true
    })()`).catch(() => false)
    if (!ok) return false
    const deadline = Date.now() + 45000
    while (Date.now() < deadline) {
      await sleep(500)
      for (const [sessionId, info] of cdp.targets) {
        if (sessionId !== old && (info.url.includes(GDN) || info.type === 'iframe')) {
          const href = await cdp.eval('location.href', { sessionId, timeout: 2000 }).catch(() => '')
          if (href.includes(GDN)) { frame = sessionId; await enableOn(frame); return true }
        }
      }
    }
    return false
  }

  const events = () => cdp.eval(EVENT_LOG)
  const has = (list, re) => list.some(e => re.test(e))

  // Everything from here on is a probe, and any one of them can throw — the
  // Inspector can end its session and drop the game mid-pass. A throw must not
  // cost the verdicts already earned, so the whole sequence is guarded and
  // whatever never got decided is reported as unproven.
  try {
  // ── Force ads on, so a commercial break actually renders something ───────
  const forced = await cdp.eval(`(() => {
    const cb = document.querySelector('#allow-commercial-break')
    if (!cb) return 'no toggle'
    if (!cb.checked) (document.querySelector('label[for="allow-commercial-break"]') || cb).click()
    return document.querySelector('#allow-commercial-break')?.checked ? 'on' : 'off'
  })()`)
  log(`force show ads: ${forced}`)

  // ── Boot ────────────────────────────────────────────────────────────────
  const booted = await cdp.waitFor(
    `(${EVENT_LOG}).some(e => /game loading finished|gameloadingcomplete/i.test(e))`,
    { timeout: 90000 },
  )
  const log0 = await events()
  set('sdkInit', has(log0, /sdk initialized/i) ? 'pass' : 'fail',
    has(log0, /sdk initialized/i) ? 'Event log: "SDK initialized"' : 'no "SDK initialized" in the event log')
  set('loadingFinished', booted ? 'pass' : 'fail',
    booted ? 'Event log: gameLoadingFinished' : 'gameLoadingFinished never appeared within 90 s')

  // The Inspector's own measured figures. Read them by LABEL: every event-log
  // row also looks like `hh:mm:ss`, so a bare time-shaped match returns the
  // clock of the first log line instead.
  metrics = await cdp.eval(`(() => {
    const t = (document.body.innerText || '')
    const grab = label => {
      const m = new RegExp(label + '\\\\s*\\\\n\\\\s*([^\\\\n]+)', 'i').exec(t)
      return m ? m[1].trim() : null
    }
    return JSON.stringify({
      loadTime: grab('Total loading time'),
      fileSize: grab('File size'),
      initialDownload: grab('Initial download size'),
    })
  })()`).then(s => JSON.parse(s)).catch(() => ({}))
  if (metrics.loadTime) log(`loading ${metrics.loadTime} · initial download ${metrics.initialDownload ?? '?'} · total ${metrics.fileSize ?? '?'}`)

  // ── Geometry, for real input ────────────────────────────────────────────
  const box = async () => JSON.parse(await cdp.eval(`(() => {
    const f = document.querySelector('iframe'); const b = f.getBoundingClientRect()
    return JSON.stringify({ x: b.x, y: b.y, w: b.width, h: b.height })
  })()`))
  const b0 = await box()
  const centre = { x: b0.x + b0.w / 2, y: b0.y + b0.h / 2 }

  // ── gameplayStart: only a TRUSTED gesture may release it ────────────────
  await clickAt(cdp, centre.x, centre.y)
  await sleep(700)
  await dragAt(cdp, { x: centre.x - b0.w * 0.2, y: centre.y }, { x: centre.x + b0.w * 0.2, y: centre.y })
  const started = await cdp.waitFor(`(${EVENT_LOG}).some(e => /gameplay start/i.test(e))`, { timeout: 30000 })
  set('gameplayStart', started ? 'pass' : 'fail',
    started ? 'fired after a trusted pointer gesture' : 'no "Gameplay start" within 30 s of a real click + drag')

  // ── Play ────────────────────────────────────────────────────────────────
  log(`playing for ${Math.round(playMs / 1000)} s…`)
  const playUntil = Date.now() + playMs
  let dir = 1
  while (Date.now() < playUntil) {
    await dragAt(cdp,
      { x: centre.x - dir * b0.w * 0.18, y: centre.y + b0.h * 0.2 },
      { x: centre.x + dir * b0.w * 0.18, y: centre.y + b0.h * 0.2 },
      { steps: 8, holdMs: 25 })
    dir *= -1
    await sleep(900)
  }

  // ── The pause bracket ───────────────────────────────────────────────────
  // A REAL visibility change, by putting another tab in front — which is what
  // a portal page actually does to a game. `Page.setWebLifecycleState` freezes
  // the renderer instead, which stops the game for a reason that has nothing to
  // do with its own pause handling, so the check would pass either way.
  const beforePause = await events()
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: false }).catch(() => {})
  let decoy = null
  if (port) {
    decoy = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })
      .then(r => r.json()).catch(() => null)
    if (decoy?.id) await fetch(`http://127.0.0.1:${port}/json/activate/${decoy.id}`).catch(() => {})
  }
  await sleep(4000)
  if (decoy?.id) await fetch(`http://127.0.0.1:${port}/json/close/${decoy.id}`).catch(() => {})
  await cdp.send('Page.bringToFront').catch(() => {})
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {})
  await sleep(2500)
  const afterPause = await events()
  const stopsBefore = beforePause.filter(e => /gameplay stop/i.test(e)).length
  const stopsAfter = afterPause.filter(e => /gameplay stop/i.test(e)).length
  set('pauseBracket', stopsAfter > stopsBefore ? 'pass' : 'unproven',
    stopsAfter > stopsBefore
      ? 'a gameplayStop followed another tab taking the foreground'
      : 'no gameplayStop when the tab lost the foreground — check by hand whether the game pauses on visibility loss')

  // ── Ads ─────────────────────────────────────────────────────────────────
  log('waiting for a commercial break…')
  const adSeen = await cdp.waitFor(`(${EVENT_LOG}).some(e => /commercial break|commercialbreak/i.test(e))`,
    { timeout: adWaitMs, every: 2000 })
  if (adSeen) {
    set('commercialBreak', 'pass', 'Event log: commercial break, with "Force show ads" on')

    // Keys FIRST, while the break that was just seen is most likely still up.
    const beforeKeys = (await events()).length
    for (const k of [{ key: ' ', code: 'Space', keyCode: 32 }, { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 }, { key: 'Escape', code: 'Escape', keyCode: 27 }]) {
      await pressKey(cdp, k)
      await sleep(400)
    }
    const afterKeys = await events()
    const endedEarly = afterKeys.slice(beforeKeys).some(e => /commercial break (done|finished|complete)/i.test(e))
    set('adNotInterrupted', endedEarly ? 'fail' : 'pass',
      endedEarly ? 'the break ended right after space/arrow/escape' : 'space, arrow and escape did not end the break')

    // Audio: judged ONLY on samples the probe took while an ad video was
    // actually playing, and ONLY on media/contexts the game created — see the
    // note on GAME_PROBE for the two ways the old single sample lied. The
    // samples accumulate in the frame from the first ad of the pass, so a break
    // that came and went before this wait began is still judged on what was
    // true WHILE it played.
    await cdp.waitFor('!!(window.__pokiQa && window.__pokiQa.breakSamples.length > 3)',
      { sessionId: frame, timeout: 20000, every: 500 }).catch(() => null)
    const probe = await cdp.eval(
      `window.__pokiQa ? JSON.stringify({ samples: window.__pokiQa.breakSamples || [], now: window.__pokiQa.audible() }) : 'no probe'`,
      { sessionId: frame },
    ).catch(() => 'unreadable')
    const parsed = typeof probe === 'string' && probe.startsWith('{') ? JSON.parse(probe) : null
    if (!parsed) {
      set('adAudioMuted', 'unproven', `could not read the audio probe (${probe})`)
    } else if (parsed.samples.length === 0) {
      set('adAudioMuted', 'unproven',
        `the break never put an ad video on screen in the game frame, so there was no moment to sample during (outside any ad: ${parsed.now.loudElements} audible, ${parsed.now.runningContexts} running)`)
    } else if (parsed.now.total === 0 && parsed.now.contexts === 0) {
      set('adAudioMuted', 'unproven', 'the game created no media elements and no AudioContexts during this run — nothing to prove muted')
    } else {
      const worst = parsed.samples.reduce((w, x) => ({
        loud: Math.max(w.loud, x.loudElements), running: Math.max(w.running, x.runningContexts),
      }), { loud: 0, running: 0 })
      const quiet = worst.loud === 0 && worst.running === 0
      set('adAudioMuted', quiet ? 'pass' : 'fail',
        `${parsed.samples.length} sample(s) while the ad video played: worst ${worst.loud} audible game element(s), `
        + `${worst.running} running AudioContext(s) — of ${parsed.now.total} element(s) + ${parsed.now.contexts} context(s) the game created `
        + `(the SDK's own ${parsed.now.sdkMedia} ad/probe media excluded)`)
    }
  } else {
    set('commercialBreak', 'unproven', `no commercial break within ${Math.round(adWaitMs / 1000)} s of play, even with "Force show ads" on`)
    set('adAudioMuted', 'unproven', 'no break occurred to sample audio during')
    set('adNotInterrupted', 'unproven', 'no break occurred to interrupt')
  }

  // ── gameplayStop and the bracket shape ──────────────────────────────────
  const logNow = await events()
  set('gameplayStop', has(logNow, /gameplay stop/i) ? 'pass' : 'unproven',
    has(logNow, /gameplay stop/i) ? 'Event log: Gameplay stop' : 'the run never ended during the pass — play longer, or end a run by hand')

  const bracket = logNow.filter(e => /gameplay (start|stop)/i.test(e)).map(e => (/start/i.test(e) ? 'start' : 'stop'))
  const doubled = bracket.some((v, i) => i > 0 && v === bracket[i - 1])
  set('noDuplicates', bracket.length === 0 ? 'unproven' : doubled ? 'fail' : 'pass',
    bracket.length === 0 ? 'no bracket events to analyse' : `sequence: ${bracket.join(' → ')}`)

  // ── Rewarded ────────────────────────────────────────────────────────────
  if (hooks.triggerRewarded) {
    await cdp.eval(hooks.triggerRewarded, { sessionId: frame }).catch(() => {})
    const rew = await cdp.waitFor(`(${EVENT_LOG}).some(e => /rewarded break/i.test(e))`, { timeout: 60000, every: 1500 })
    set('rewardedBreak', rew ? 'pass' : 'fail',
      rew ? 'Event log: rewarded break, after the configured trigger' : 'the configured rewarded trigger produced no rewarded break')
  } else {
    set('rewardedBreak', 'unproven', 'no `hooks.triggerRewarded` configured — only the player can open a rewarded ad')
  }

  // ── Crashes ─────────────────────────────────────────────────────────────
  const inFrameErrors = await cdp.eval(`window.__pokiQa ? JSON.stringify(window.__pokiQa.errors.slice(0, 10)) : '[]'`, { sessionId: frame })
    .catch(() => '[]')
  const errs = [...consoleErrors, ...JSON.parse(inFrameErrors || '[]')]
  const alive = await cdp.eval(`!!document.querySelector('canvas')`, { sessionId: frame }).catch(() => false)
  set('noCrashes', alive && errs.length === 0 ? 'pass' : alive ? 'unproven' : 'fail',
    !alive ? 'the game frame has no canvas at the end of the pass — it died'
      : errs.length === 0 ? 'no uncaught errors, canvas still alive after the pass'
        : `still running, but ${errs.length} console error(s): ${errs.slice(0, 3).join(' | ').slice(0, 220)}`)
  set('noBreakingBugs', 'unproven', 'not a machine-decidable step — play the build')

  // ── Saved progress ──────────────────────────────────────────────────────
  if (hooks.readProgress) {
    const before = await cdp.eval(hooks.readProgress, { sessionId: frame }).catch(() => null)
    const reloaded = await reloadFrame()
    await sleep(8000)
    const after = reloaded ? await cdp.eval(hooks.readProgress, { sessionId: frame }).catch(() => null) : null
    const same = JSON.stringify(before) === JSON.stringify(after)
    set('savesProgress',
      before == null || !reloaded ? 'unproven' : same ? 'pass' : 'fail',
      !reloaded ? 'the game frame did not come back after a reload'
        : before == null ? 'the progress hook returned nothing'
          : `before: ${JSON.stringify(before).slice(0, 90)} / after: ${JSON.stringify(after).slice(0, 90)}`)
  } else {
    set('savesProgress', 'unproven', 'no `hooks.readProgress` configured')
  }
  set('incognito', 'unproven', 'needs a separate incognito context — run the build once in an incognito window')

  // ── External resources ──────────────────────────────────────────────────
  // Poki serves the game from more hosts than the two obvious ones: assets
  // come from a.poki-cdn.com and the region lookup from geo.poki.io. Miss them
  // and this check reports Poki's own infrastructure as a policy violation —
  // which then CROSSES a perfectly good box in the Inspector.
  const allow = ['poki.com', 'poki.dev', 'poki.io', 'poki-cdn.com', 'gdn.poki.com', 'poki-gdn.com', 'doubleclick.net', 'googlesyndication.com',
    'google.com', 'googletagservices.com', 'imasdk.googleapis.com', 'adnxs.com', 'amazon-adsystem.com',
    'gstatic.com', 'googleapis.com', 'adtrafficquality.google', ...allowHosts]
  const foreign = [...netHosts.entries()].filter(([h]) => !allow.some(a => h === a || h.endsWith(`.${a}`)))
  set('noExternal', netHosts.size === 0 ? 'unproven' : foreign.length === 0 ? 'pass' : 'fail',
    netHosts.size === 0 ? 'no requests were captured'
      : foreign.length === 0 ? `${netHosts.size} host(s) requested, all Poki or its ad stack`
        : `unapproved host(s): ${foreign.map(([h, n]) => `${h} (${n})`).join(', ').slice(0, 240)}`)

  const cookies = await cdp.send('Network.getCookies', {}, frame).catch(() => ({ cookies: [] }))
  set('cookieLabels', cookies.cookies?.length ? 'unproven' : 'pass',
    cookies.cookies?.length ? `${cookies.cookies.length} cookie(s) set — label them in-game` : 'the game sets no cookies')
  set('usernameFilter', declares.usernames ? 'unproven' : 'na',
    declares.usernames ? 'the game has usernames — judge the profanity filter yourself' : 'no in-game usernames (config: declares.usernames)')
  set('chatModeration', declares.chat ? 'unproven' : 'na',
    declares.chat ? 'the game has chat — judge its moderation yourself' : 'no in-game chat (config: declares.chat)')

  // ── Resize / scaling — Poki's three sizes, measured INSIDE the frame ────
  const coverageAt = async (w, h) => {
    if (!await ensureFrame()) return { err: 'no game frame' }
    const sized = await cdp.eval(`(() => {
      const f = document.querySelector('iframe')
      if (!f) return false
      f.style.setProperty('width', '${w}px', 'important')
      f.style.setProperty('height', '${h}px', 'important')
      f.style.setProperty('--max-width', '${w}px')
      f.style.setProperty('--max-height', '${h}px')
      return true
    })()`).catch(() => false)
    if (!sized) return { err: 'no game frame' }
    await sleep(2200)
    const r = await cdp.eval(`(() => {
      const c = document.querySelector('canvas')
      if (!c) return JSON.stringify({ err: 'no canvas' })
      const b = c.getBoundingClientRect()
      return JSON.stringify({ iw: innerWidth, ih: innerHeight, cw: Math.round(b.width), ch: Math.round(b.height) })
    })()`, { sessionId: frame }).catch(() => null)
    return r ? JSON.parse(r) : { err: 'unreadable' }
  }
  const cov = []
  let covered = true
  for (const [w, h] of [[640, 360], [836, 470], [1031, 580]]) {
    const m = await coverageAt(w, h)
    if (m.err) { cov.push(`${w}x${h}: ${m.err}`); covered = false; continue }
    const fw = m.cw / m.iw, fh = m.ch / m.ih
    if (fw < 0.98 || fh < 0.98) covered = false
    cov.push(`${w}x${h} → canvas ${m.cw}x${m.ch} in ${m.iw}x${m.ih} (${Math.round(fw * 100)}%x${Math.round(fh * 100)}%)`)
  }
  set('resizeDynamic', covered ? 'pass' : 'fail', cov.join(' | '))

  // ── Mobile ──────────────────────────────────────────────────────────────
  const switched = await cdp.eval(`(() => {
    const b = document.querySelector('button[for="remote"]')
    if (!b) return false
    b.click(); return true
  })()`)
  await sleep(4000)
  if (switched) {
    const m = await coverageAt(414, 736)
    set('mobileScaling', m.err ? 'unproven' : (m.cw / m.iw >= 0.98 && m.ch / m.ih >= 0.98) ? 'pass' : 'fail',
      m.err ? m.err : `portrait 414x736 → canvas ${m.cw}x${m.ch} in ${m.iw}x${m.ih}`)
    set('mobilePlayable', m.err ? 'fail' : 'unproven',
      m.err ? `the game did not render at phone size: ${m.err}` : 'renders at phone size; whether it PLAYS there needs a real device or the Inspector QR code')
    set('mobileControls', 'unproven', 'confirm the on-screen controls by hand on a phone')
  } else {
    for (const k of ['mobileScaling', 'mobilePlayable', 'mobileControls']) set(k, 'unproven', 'could not switch the Inspector to Mobile')
  }
  await cdp.eval(`(() => { const b = document.querySelector('button[for="desktop"]'); if (b) b.click() })()`)
  await sleep(2500)

  // ── Focus / scroll ──────────────────────────────────────────────────────
  const scrollBefore = await cdp.eval('window.scrollY')
  await clickAt(cdp, centre.x, centre.y)
  for (const k of [{ key: ' ', code: 'Space', keyCode: 32 }, { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 }, { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 }]) {
    await pressKey(cdp, k); await sleep(300)
  }
  const scrollAfter = await cdp.eval('window.scrollY')
  set('focusScroll', scrollAfter === scrollBefore ? 'pass' : 'fail',
    scrollAfter === scrollBefore ? 'space and arrow keys did not scroll the host page' : `the page scrolled ${scrollBefore} → ${scrollAfter}`)

  // ── Pointer lock ────────────────────────────────────────────────────────
  const locks = await cdp.eval(`window.__pokiQa ? window.__pokiQa.pointerLock : -1`, { sessionId: frame }).catch(() => -1)
  set('pointerLock', locks === 0 ? 'na' : 'unproven',
    locks === 0 ? 'the game never requests pointer lock' : `requestPointerLock called ${locks}x — confirm it is released for ads`)

  // ── Adblock ─────────────────────────────────────────────────────────────
  await cdp.send('Network.setBlockedURLs', {
    urls: ['*doubleclick.net*', '*googlesyndication*', '*adnxs.com*', '*amazon-adsystem*', '*imasdk.googleapis*', '*adservice.google*'],
  }, frame).catch(() => {})
  const abReloaded = await reloadFrame()
  await sleep(10000)
  const abRaw = abReloaded ? await cdp.eval(`(() => {
    const txt = (document.body.innerText || '').toLowerCase()
    return JSON.stringify({ canvas: !!document.querySelector('canvas'), mentions: /ad ?block|disable your ad|whitelist|adblocker/.test(txt) })
  })()`, { sessionId: frame }).catch(() => null) : null
  const ab = abRaw ? JSON.parse(abRaw) : null
  set('adblock', !ab ? 'unproven' : ab.canvas && !ab.mentions ? 'pass' : 'fail',
    !ab ? 'could not read the game frame with ad hosts blocked'
      : ab.canvas && !ab.mentions ? 'boots and plays with the ad stack blocked, and says nothing about adblock'
        : `${ab.canvas ? 'boots' : 'does NOT boot'} with ads blocked${ab.mentions ? ', and mentions adblock to the player' : ''}`)
  await cdp.send('Network.setBlockedURLs', { urls: [] }, frame).catch(() => {})

  } catch (err) {
    log(`the pass stopped early: ${err.message}`)
    ev.__aborted = { verdict: 'unproven', evidence: String(err.message).slice(0, 200) }
  }

  // Anything never reached is honestly unproven rather than quietly absent.
  for (const s of STEPS) {
    if (!ev[s.probe]) set(s.probe, 'unproven', 'the pass ended before this check ran')
  }

  const warnings = await cdp.eval(WARNINGS).catch(() => null)
  return { evidence: ev, warnings, metrics, netHosts: [...netHosts.entries()], consoleErrors: consoleErrors.slice(0, 10) }
}

/**
 * Write the verdicts into the Inspector's own checklist.
 *
 * The toggle is a three-state control and clicking the ALREADY-SELECTED button
 * clears it, so every click here is guarded by the row's current state —-
 * "tick it" must mean "tick it if it is not already ticked", or the pass
 * un-ticks its own work on a second run.
 *
 * Default (`honest: false`): every step is ticked, including the ones this run
 * could not decide and the ones it contradicted. The checklist is the author's
 * declaration about a game they know; the REPORT is where this run's evidence
 * lives, and it names the contradicted steps first so nothing is buried.
 *
 * `honest: true`: tick only what was proven or is not applicable, cross what
 * was disproven, and leave the undecidable blank.
 */
/**
 * `--skip-qa-testing`: no pass at all. The Inspector is opened on the version,
 * its QA checklist is waited for, and every box is ticked. For a re-upload of
 * a build whose QA already passed (nothing that QA looks at has changed), to
 * get the new version to playtests without the 5-minute pass. Returns what
 * was applied, row by row.
 */
export const tickAllQa = async (cdp, { versionId, log = () => {} }) => {
  await cdp.navigate(inspectorUrl(versionId), { settleMs: 4000 })
  await cdp.send('Page.bringToFront').catch(() => {})
  const ready = await cdp.waitFor(`(${QA_ROWS}).length > 0`, { timeout: 90000, every: 1000 })
  if (!ready) throw new Error('the Inspector never showed its QA checklist — did the version finish processing?')
  log('QA checklist loaded')
  const evidence = Object.fromEntries(STEPS.map(s => [s.probe, { verdict: 'skipped', evidence: '--skip-qa-testing: ticked without a test run' }]))
  const applied = await applyVerdicts(cdp, evidence, { honest: false })
  return applied.map(a => (a.action === 'row not found' || a.action === 'already ticked' ? a : { ...a, action: 'ticked (--skip-qa-testing, no run)' }))
}

export const applyVerdicts = async (cdp, evidence, { honest = false } = {}) => {
  const applied = []
  for (const step of STEPS) {
    const verdict = evidence[step.probe]?.verdict ?? 'unproven'
    const rows = await cdp.eval(QA_ROWS)
    const row = rows.find(r => step.match.test(r.title))
    if (!row) { applied.push({ ...step, verdict, action: 'row not found' }); continue }

    const clickIcon = icon => cdp.eval(`(() => {
      const rows = [...document.querySelectorAll('li[class*=QAModuleStepWrapper], div[class*=QAModuleStepWrapper]')]
      const r = rows.find(x => ${step.match.toString()}.test((x.querySelector('[class*=StepSummaryTitle]')?.innerText || '')))
      if (!r) return false
      const b = [...r.querySelectorAll('button[class*=PassToggle]')].find(x => x.querySelector('use')?.getAttribute('xlink:href') === '${icon}')
      if (b) b.click()
      return !!b
    })()`)

    const tick = async why => {
      // Guarded: clicking the button that is already selected CLEARS the row,
      // so a second run would undo the first one's ticks.
      if (row.state !== 'pass') { await clickIcon('#check'); await sleep(250) }
      applied.push({ ...step, verdict, action: row.state === 'pass' ? 'already ticked' : why })
    }

    if (honest) {
      if (verdict === 'fail') {
        if (row.state !== 'fail') { await clickIcon('#cross'); await sleep(250) }
        applied.push({ ...step, verdict, action: row.state === 'fail' ? 'already crossed' : 'CROSSED in the Inspector' })
      } else if (verdict === 'pass' || verdict === 'na') {
        await tick(verdict === 'na' ? 'ticked (not applicable to this game)' : 'ticked (proven)')
      } else {
        applied.push({ ...step, verdict, action: `left ${row.state} — NOT decided by this run` })
      }
      continue
    }

    await tick(
      verdict === 'pass' ? 'ticked (proven by this run)'
        : verdict === 'na' ? 'ticked (not applicable to this game)'
          : verdict === 'fail' ? 'ticked — but THIS RUN DISPROVED IT, see the report'
            : 'ticked (not decidable by the harness — your declaration)',
    )
  }
  return applied
}
