// ─── The browser ────────────────────────────────────────────────────────────
//
// Playwright driving the SYSTEM Chrome (`channel: 'chrome'`), never a
// downloaded chromium: most game repos install `@playwright/test` for e2e but
// never run `playwright install`, so the bundled binary is not on disk. The
// installed Chrome is also the engine players actually run.
//
// A recording context is a phone, not a desktop window: `viewport` is the CSS
// size and `deviceScaleFactor` multiplies it into the OUTPUT pixels, so a
// 720x1280 clip is a 360x640 viewport at dpr 2 — the size the game's
// responsive layout was designed against. Screenshots come out at exactly
// viewport x dsf, which is why the frame size never has to be scaled afterwards.

/** @typedef {import('./types.js').Variant} Variant */

/**
 * `playwright` is not always a direct dependency — under pnpm's strict linking
 * only `@playwright/test` resolves from the project root. Both export the same
 * `chromium`.
 */
async function loadChromium() {
  const tried = []
  for (const spec of ['playwright', '@playwright/test', 'playwright-core']) {
    try {
      const mod = await import(spec)
      if (mod.chromium) return mod.chromium
      tried.push(`${spec}: no chromium export`)
    } catch (err) {
      tried.push(`${spec}: ${err.code ?? err.message}`)
    }
  }
  throw new Error(
    'Could not load Playwright. Install it with `pnpm add -D @playwright/test`.\n  ' + tried.join('\n  ')
  )
}

const WINDOWS_CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'

/**
 * @param {object} o
 * @param {boolean} [o.headed]
 * @param {string} [o.executablePath]
 * @param {import('./types.js').Logger} [o.log]
 */
export async function launchBrowser({ headed = false, executablePath, log } = {}) {
  const chromium = await loadChromium()
  const args = [
    '--mute-audio',
    '--hide-scrollbars',
    // A Windows box at 150 % display scaling otherwise leaks its scale into the
    // page. Pinning it to 1 lets the context's deviceScaleFactor (an Emulation
    // override, which takes precedence) decide the output size on its own.
    '--force-device-scale-factor=1',
    '--autoplay-policy=no-user-gesture-required',
    '--disable-features=CalculateNativeWinOcclusion,IsolateOrigins,site-per-process',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows'
  ]

  const attempts = executablePath
    ? [{ executablePath }]
    : [{ channel: 'chrome' }, { executablePath: WINDOWS_CHROME }, {}]

  let lastErr
  for (const how of attempts) {
    try {
      const browser = await chromium.launch({ headless: !headed, args, ...how })
      log?.ok(`Chrome launched (${how.channel ?? how.executablePath ?? 'bundled chromium'}${headed ? ', headed' : ''})`)
      return { browser, close: () => browser.close() }
    } catch (err) {
      lastErr = err
    }
  }
  throw new Error(
    `Could not launch Chrome.\nLast error: ${lastErr?.message}\n` +
    'Install Chrome, or pass an explicit path via CHROME_PATH.'
  )
}

/**
 * @param {import('playwright').Browser} browser
 * @param {object} o
 * @param {Variant} o.variant
 * @param {string} [o.url]
 * @param {string[]} [o.initScripts]  page-side sources, injected at document start
 * @param {(msg: string) => void} [o.onConsole]
 * @param {import('./types.js').Logger} [o.log]
 * @param {string|null} [o.muteSocketsTo]  origin whose WebSockets are answered locally and never connected
 */
export async function openPage(browser, { variant, url, initScripts = [], onConsole, log, muteSocketsTo = null }) {
  const context = await browser.newContext({
    viewport: { width: variant.cssWidth, height: variant.cssHeight },
    deviceScaleFactor: variant.dpr,
    isMobile: variant.isMobile,
    hasTouch: variant.hasTouch,
    // A preview video is all motion — a `prefers-reduced-motion` default would
    // quietly flatten every animation the clip exists to show.
    reducedMotion: 'no-preference',
    locale: variant.locale,
    colorScheme: 'dark'
  })

  for (const src of initScripts) await context.addInitScript({ content: src })

  // A dev server with hot reload broadcasts a FULL RELOAD to every open client
  // when a file it cannot hot-swap changes — anything under `public/`, an
  // `.env`, index.html — and hot-swaps a component by unmounting it. On a repo
  // where anybody else is working, that is someone's asset landing in the
  // middle of a fifteen-minute capture, and the page navigates out from under
  // the frame loop ("Execution context was destroyed"). Measured here: another
  // session re-exporting art killed a 1080p take in its first seconds.
  //
  // So the recording page's sockets to the dev server are answered HERE: they
  // open, and nothing is ever said on them. (Shadowing `location.reload` does
  // not work — Location members are unforgeable, `defineProperty` throws.)
  if (muteSocketsTo) {
    const { host } = new URL(muteSocketsTo)
    await context.routeWebSocket((u) => u.host === host, () => {})
  }

  const page = await context.newPage()
  if (onConsole) {
    page.on('console', (m) => { if (m.type() === 'error') onConsole(m.text()) })
    page.on('pageerror', (e) => onConsole(String(e)))
  }

  const cdp = await context.newCDPSession(page)

  if (url) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    const [w, h, dpr] = await page.evaluate(() => [window.innerWidth, window.innerHeight, window.devicePixelRatio])
    if (Math.round(w * dpr) !== variant.width || Math.round(h * dpr) !== variant.height) {
      log?.warn(
        `frame size will be ${Math.round(w * dpr)}x${Math.round(h * dpr)}, not ${variant.width}x${variant.height} ` +
        `(viewport ${w}x${h} @ ${dpr}x)`
      )
    }
  }

  return {
    context,
    page,
    cdp,
    close: async () => {
      try { await cdp.detach() } catch { /* already gone */ }
      await context.close()
    }
  }
}
