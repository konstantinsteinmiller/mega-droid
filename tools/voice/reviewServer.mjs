// The review page's server (`pnpm voice:review`, tools/voice/review.mjs): a
// tiny local HTTP server on 127.0.0.1 that serves the page, the voice files
// and four calls. voice-over-approvals.md is read anew on every call (a hand
// edit counts at once) and every verdict rewrites it atomically.
//
//   GET  /api/hello     { app, token }: the launcher checks the port is ours
//   GET  /api/lines     every shipped file of the review languages, with its verdict
//   POST /api/verdict   { lang, key, hash, status, note }
//   POST /api/ping      the page's heartbeat: no ping for `idleMs`, and it exits
//   GET  /audio/<lang>/<file>.ogg
//
// Node only, no dependencies.

import { createServer } from 'node:http'
import { createReadStream, existsSync } from 'node:fs'
import { join } from 'node:path'
import { currentVoiceFiles, readApprovals, reconcile, setVerdict, writeApprovals } from './approvals.mjs'

export const APP = 'voice-review'

/**
 * `lines`: key → { key, speaker, scene, text: { [lang]: text }, direction: { [lang] }, situation: { [lang] } }.
 * `keyOf(file name without extension)` → key or null.
 */
export const createReviewServer = ({ mdPath, voiceDir, langs, lines, keyOf, html, token = Math.random().toString(36).slice(2), idleMs = 45_000, firstMs = 180_000, onIdle = () => {} }) => {
  const current = () => currentVoiceFiles(voiceDir, langs, keyOf)
  /** The md read anew and matched to the files there are now. */
  const state = () => {
    const files = current()
    return { files, entries: reconcile(readApprovals(mdPath), files) }
  }
  const sync = () => { const { entries } = state(); writeApprovals(mdPath, entries, langs); return entries }

  const rowsOf = (entries, files) => files.map(({ lang, key, hash, file }) => {
    const l = lines[key] ?? {}
    const e = entries.get(`${lang}/${key}`)
    return {
      lang, key, hash, speaker: l.speaker ?? '', scene: l.scene ?? '',
      text: l.text?.[lang] ?? '', en: lang === 'en' ? null : (l.text?.en ?? null),
      direction: l.direction?.[lang] ?? l.direction?.en ?? '', situation: l.situation?.[lang] ?? l.situation?.en ?? '',
      status: e?.status ?? 'not yet approved', note: e?.note ?? '', history: e?.history ?? '',
      audio: `/audio/${lang}/${file}?v=${hash}`
    }
  })

  let last = 0
  const started = Date.now()
  const timer = setInterval(() => {
    const quiet = last ? Date.now() - last > idleMs : Date.now() - started > firstMs
    if (quiet) onIdle(last ? 'the page was closed' : 'no page opened')
  }, Math.min(5_000, idleMs))

  const send = (res, code, body, type = 'application/json') => {
    res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' })
    res.end(type === 'application/json' ? JSON.stringify(body) : body)
  }
  const body = (req) => new Promise((resolve, reject) => {
    let s = ''
    req.on('data', c => { s += c; if (s.length > 1e5) req.destroy() })
    req.on('end', () => { try { resolve(s ? JSON.parse(s) : {}) } catch (e) { reject(e) } })
    req.on('error', reject)
  })

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost')
      const p = url.pathname
      if (req.method === 'GET' && (p === '/' || p === '/index.html')) return send(res, 200, html, 'text/html; charset=utf-8')
      if (p === '/api/hello') return send(res, 200, { app: APP, token })
      if (p === '/api/ping') { last = Date.now(); return send(res, 200, { ok: true }) }
      if (req.method === 'GET' && p === '/api/lines') {
        last = Date.now()
        const { files, entries } = state()
        return send(res, 200, { langs, rows: rowsOf(entries, files) })
      }
      if (req.method === 'POST' && p === '/api/verdict') {
        last = Date.now()
        const v = await body(req)
        const { files, entries } = state()
        try { setVerdict(entries, v) } catch (e) { return send(res, 409, { error: e.message }) }
        writeApprovals(mdPath, entries, langs)
        return send(res, 200, rowsOf(entries, files).find(r => r.lang === v.lang && r.key === v.key))
      }
      const audio = p.match(/^\/audio\/([\w-]+)\/([\w.-]+\.ogg)$/)
      if (req.method === 'GET' && audio && langs.includes(audio[1])) {
        const f = join(voiceDir, audio[1], audio[2])
        if (!existsSync(f)) return send(res, 404, { error: 'no file' })
        res.writeHead(200, { 'content-type': 'audio/ogg', 'cache-control': 'no-store' })
        return createReadStream(f).pipe(res)
      }
      send(res, 404, { error: 'not found' })
    } catch (e) {
      send(res, 500, { error: String(e?.message ?? e) })
    }
  })
  server.on('close', () => clearInterval(timer))
  return { server, token, sync }
}
