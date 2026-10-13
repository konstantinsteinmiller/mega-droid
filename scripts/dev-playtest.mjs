#!/usr/bin/env node
// ─── A dev server for PLAYTESTS: no HMR, no reloads, no live leaderboard ─────
//
//   pnpm dev:playtest                 # http://127.0.0.1:2195
//   pnpm dev:playtest -- --port 44123
//
// `pnpm dev` watches the tree and pushes every edit into the open page; with
// other people (or agents) editing while a playtest runs, that is a full page
// reload in the middle of a fight and the run's state is gone. This server
// is the same `vite.config.ts` with:
//
// - `server.hmr: false` — no HMR socket, so the page is never told to update
//   or reload;
// - `server.watch: null` — no file watcher, so no edit is even noticed. A
//   module the page already loaded stays as it was; a chunk it has not loaded
//   yet is still read from disk when it is first asked for. Restart the
//   server (and reload the page) to pick up edits;
// - `VITE_LEADERBOARD_URL` / `VITE_LEADERBOARD_SECRET` blanked: `.env` holds
//   the live board and its signing secret, and a finished mission in a test
//   run would post a real score.
//
// Level-lab addresses (`#/?level=stage&sector=magnet&seed=0&plevel=19`) boot
// straight into that level here too, also on a fresh browser profile
// (`flow.createBootMode`).

import { createServer } from 'vite'

const argv = process.argv.slice(2)
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d }
const port = Number(arg('port', '2195'))
const host = arg('host', '127.0.0.1')

// Set before the config loads: variables already in the environment win over
// the `.env` files.
process.env.VITE_LEADERBOARD_URL = ''
process.env.VITE_LEADERBOARD_SECRET = ''

const server = await createServer({
  server: { port, host, strictPort: true, hmr: false, watch: null }
})
await server.listen()
server.printUrls()
console.log('  playtest server: HMR and file watching are off; restart it to pick up edits')
