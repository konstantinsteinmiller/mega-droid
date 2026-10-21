// `pnpm voice:review` — the voice-over review page: listen to every shipped
// voice file of the review languages (lib.mjs PATHS.review) and approve or
// reject it, with a note. Verdicts go to voice-over-approvals.md
// (approvals.mjs), which stays the source of truth and fine to edit by hand.
//
//   pnpm voice:review              start the server on a free port and open the page
//   --no-open                      just print the address
//
// The server listens on 127.0.0.1 only, checks the port answers with its own
// token before opening it, and exits on Ctrl+C or when the page has been
// closed for a while (the page pings it every few seconds).
// Keys: Space play, A approve, R reject, ←/→ or J/K previous/next.

import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { APPROVALS, LANGS, REVIEW_LANGS, ROOT, VOICE_LINES, VOICE_OUT, args, fileName, textOf } from './lib.mjs'
import { APP, createReviewServer } from './reviewServer.mjs'

const a = args()
const byFile = new Map(VOICE_LINES.map(l => [fileName(l.key), l.key]))
const pick = (both, lang) => both?.[LANGS.indexOf(lang)] ?? both?.[0] ?? ''
const lines = Object.fromEntries(VOICE_LINES.map(l => [l.key, {
  key: l.key, speaker: l.speaker, scene: l.scene,
  // A neutral line (barks, laughs) is one English take for every language.
  text: Object.fromEntries(REVIEW_LANGS.map(g => [g, textOf(l, g) ?? (l.neutral ? textOf(l, 'en') : '')])),
  direction: Object.fromEntries(REVIEW_LANGS.map(g => [g, pick(l.direction, g)])),
  situation: Object.fromEntries(REVIEW_LANGS.map(g => [g, pick(l.when, g)]))
}]))

const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'review.html'), 'utf8')
const { server, token, sync } = createReviewServer({
  mdPath: APPROVALS, voiceDir: VOICE_OUT, langs: REVIEW_LANGS, lines, html,
  keyOf: (f) => byFile.get(f) ?? null,
  onIdle: (why) => { console.log(`voice:review: ${why}, stopping.`); stop() }
})
const stop = () => { server.close(); server.closeAllConnections?.(); process.exit(0) }
process.on('SIGINT', stop)
process.on('SIGTERM', stop)

// The file follows the recordings there are now before the page opens.
const entries = sync()
const n = (s) => [...entries.values()].filter(e => e.status === s).length
console.log(`${relative(ROOT, APPROVALS)}: ${entries.size} files, ${n('approved')} approved, ${n('rejected')} rejected, ${n('not yet approved')} not yet approved`)

server.listen(0, '127.0.0.1', async () => {
  const url = `http://127.0.0.1:${server.address().port}/`
  // The port must answer with OUR token: never open a page some other server is holding.
  const hello = await fetch(`${url}api/hello`).then(r => r.json()).catch(() => null)
  if (hello?.app !== APP || hello.token !== token) { console.error(`voice:review: ${url} is not this server`); stop() }
  console.log(`voice:review: ${url}  (Ctrl+C stops it; it also stops a while after the page is closed)`)
  if (a['no-open']) return
  const [cmd, argv] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]]
  spawn(cmd, argv, { detached: true, stdio: 'ignore', windowsVerbatimArguments: process.platform === 'win32' }).unref()
})
