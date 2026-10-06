// ─── The server under the recording ─────────────────────────────────────────
//
// Two modes. `dev` spawns the project's own dev server, which is what a game
// with dev-only debug seams (`window.__game`, `import.meta.env.DEV`) needs —
// those seams are exactly how a scenario drives the game, and they are compiled
// out of a production build. `static` serves a built `dist/` for a game that
// scripts itself through real input only.
//
// ── The port check is not paranoia ──
//
// A stale dev server from ANOTHER project answers on a shared port perfectly
// happily, and you end up with four beautiful clips of the wrong game. So we
// fetch the page and check its `<title>` before a single frame is captured, and
// refuse to record if it is not the game we were asked for.

import { spawn } from 'node:child_process'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.mp4': 'video/mp4',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8'
}

/** Vite binds `localhost`, not `127.0.0.1` — probe the name it actually answers to. */
export const originFor = (port) => `http://localhost:${port}`

/** Does anything at all answer on this port? It asks for Vite's own client
 *  script, not the page: a dev server holds its FIRST page request until the
 *  cold dependency pre-bundle is done (30 s and more on a busy machine), and a
 *  ping that aborts before then never sees the server come up at all. A
 *  static server answers it too (the SPA fallback, or a 404 — any status). */
async function ping(url, timeoutMs = 5_000) {
  try {
    const res = await fetch(new URL('/@vite/client', url), { signal: AbortSignal.timeout(timeoutMs) })
    // Any HTTP answer means something owns the port — even a 404.
    return res.status > 0
  } catch {
    return false
  }
}

async function waitForPort(url, { timeoutMs, log }) {
  const deadline = Date.now() + timeoutMs
  let announced = false
  while (Date.now() < deadline) {
    if (await ping(url)) return true
    if (!announced && Date.now() - (deadline - timeoutMs) > 4000) {
      log?.info(`still waiting for ${url} …`)
      announced = true
    }
    await sleep(400)
  }
  return false
}

/**
 * Kill a spawned server. On Windows `child.kill()` orphans the grandchildren —
 * `pnpm exec vite` is a shell that spawns node, and killing the shell leaves
 * vite holding the port — so the whole tree goes through `taskkill`.
 */
function killTree(child) {
  if (!child || child.exitCode !== null) return
  if (process.platform === 'win32') {
    try {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
      return
    } catch { /* fall through to kill() */ }
  }
  try { child.kill('SIGTERM') } catch { /* already gone */ }
}

/**
 * @param {object} o
 * @param {string} o.repoRoot
 * @param {number} o.port
 * @param {'dev'|'static'} [o.mode]
 * @param {string} [o.command]
 * @param {string[]} [o.args]
 * @param {string} [o.dir]           static mode: the directory to serve
 * @param {Record<string,string>} [o.env]
 * @param {number} [o.readyTimeoutMs]
 * @param {import('./types.js').Logger} [o.log]
 */
/**
 * @param {string[]} args
 * @param {number} port
 * @returns {string[]}
 */
export const withPort = (args, port) => args.map((a, i) => {
  if (args[i - 1] === '--port' && /^\d+$/.test(a)) return String(port)
  return String(a).replace(/^--port=\d+$/, `--port=${port}`).replaceAll('{port}', String(port))
})

export async function startServer(o) {
  const { repoRoot, port, mode = 'dev', log } = o
  const url = originFor(port)

  // Somebody is already here. That is usually a `pnpm dev` the user left open
  // on the same port, which is fine to record against — `assertOwnServer` is
  // what decides whether it is the right game.
  if (await ping(url)) {
    log?.info(`port ${port} already answers — reusing that server`)
    return { url, port, kind: 'existing', stop: async () => {} }
  }

  if (mode === 'static') {
    const root = resolve(repoRoot, o.dir ?? 'dist')
    if (!existsSync(root)) throw new Error(`static mode: ${root} does not exist — build first.`)
    const server = createServer((req, res) => {
      const rel = decodeURIComponent((req.url ?? '/').split('?')[0])
      let file = normalize(join(root, rel))
      if (!file.startsWith(root)) { res.statusCode = 403; res.end('forbidden'); return }
      if (!existsSync(file) || statSync(file).isDirectory()) {
        const index = join(existsSync(file) ? file : root, 'index.html')
        // SPA fallback: an unknown path is a client route, not a 404.
        file = existsSync(index) ? index : join(root, 'index.html')
      }
      if (!existsSync(file)) { res.statusCode = 404; res.end('not found'); return }
      res.setHeader('Content-Type', MIME[extname(file).toLowerCase()] ?? 'application/octet-stream')
      res.setHeader('X-Served-From', root)
      createReadStream(file).pipe(res)
    })
    await new Promise((ok, fail) => {
      server.once('error', fail)
      server.listen(port, ok)
    })
    log?.ok(`static server on ${url} (${root})`)
    return {
      url, port, kind: 'static',
      stop: () => new Promise((r) => server.close(() => r()))
    }
  }

  const command = o.command ?? (process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm')
  // The RESOLVED port (config, then `--port`) is the only one that counts:
  // `{port}` in the configured args is substituted, and a literal
  // `--port <n>` is rewritten. Without this, `--port 2065` started vite on the
  // config's hardcoded 2063 and then waited forever for 2065 to answer.
  const args = withPort(o.args ?? ['exec', 'vite', '--port', '{port}', '--strictPort'], port)
  log?.info(`starting dev server: ${command} ${args.join(' ')}`)

  const child = spawn(command, args, {
    cwd: repoRoot,
    env: { ...process.env, ...(o.env ?? {}) },
    stdio: ['ignore', 'pipe', 'pipe'],
    // `pnpm` on Windows is a .cmd shim; without a shell, spawn cannot find it.
    shell: process.platform === 'win32'
  })
  const tail = []
  const keep = (chunk) => {
    tail.push(String(chunk))
    if (tail.length > 40) tail.shift()
  }
  child.stdout?.on('data', keep)
  child.stderr?.on('data', keep)
  child.on('exit', (code) => {
    if (code !== 0 && code !== null) log?.warn(`dev server exited with code ${code}`)
  })

  const ready = await waitForPort(url, { timeoutMs: o.readyTimeoutMs ?? 90_000, log })
  if (!ready) {
    killTree(child)
    throw new Error(`dev server never answered on ${url}.\n--- last output ---\n${tail.join('')}`)
  }
  log?.ok(`dev server on ${url}`)
  return {
    url, port, kind: 'dev',
    stop: async () => { killTree(child); await sleep(300) }
  }
}

/**
 * Prove the server on `url` is serving the game we mean to record.
 *
 * @param {object} o
 * @param {string} o.url
 * @param {string} o.expectTitle
 * @param {import('./types.js').Logger} [o.log]
 */
export async function assertOwnServer({ url, expectTitle, log }) {
  if (!expectTitle) {
    log?.warn('preview.config.mjs has no `title` — skipping the port-ownership check')
    return
  }
  let html
  try {
    // The first page request waits for the cold pre-bundle (see ping()).
    const res = await fetch(url, { signal: AbortSignal.timeout(240_000) })
    html = await res.text()
  } catch (err) {
    throw new Error(`Could not read ${url} to verify which game is being served: ${err.message}`)
  }
  const found = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? ''
  if (!found.toLowerCase().includes(expectTitle.toLowerCase())) {
    throw new Error(
      `${url} is serving "${found || '(no <title>)'}", not "${expectTitle}".\n` +
      'Another project\'s server is holding this port. Stop it, or pass --port / --url.'
    )
  }
  log?.ok(`serving "${found}" — the right game`)
}
