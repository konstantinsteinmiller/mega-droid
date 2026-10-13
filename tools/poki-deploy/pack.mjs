#!/usr/bin/env node
// ─── node tools/poki-deploy/pack.mjs ────────────────────────────────────────
//
// The tail of `pnpm build:poki`: zip `dist/` into `dist/chaos-machine-poki.zip`
// (paths from poki.config.mjs) with the pipeline's own PKZIP writer, then check
// the result — real zip, `index.html` at the archive root.
//
// It replaces the `cd dist && tar -a -cf ../x.zip * && move …` idiom, which is
// only a zip when `tar` is Windows' bsdtar. Launched from Git Bash (or from any
// process whose PATH puts Git's /usr/bin first — `cmd /c where tar` lists GNU
// tar FIRST there), `tar` is GNU tar, whose `-a` does not know zip: it silently
// writes a TAR named `.zip`, and P4D answers "We couldn't read your zip file".
// Measured on this machine: from Git Bash the old tail wrote a TAR; from
// PowerShell a zip. A build script must not depend on which shell ran it.
//
// No network, no browser, no P4D — safe to run anywhere.
//
// Usage:  node tools/poki-deploy/pack.mjs [--config <path>]

import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { packArtifact } from './lib/pack.mjs'
import { bytes, die, pass } from './lib/log.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(here, '..', '..')

const argv = process.argv.slice(2)
const i = argv.indexOf('--config')
const CONFIG_PATH = resolve(i >= 0 && argv[i + 1] ? argv[i + 1] : join(here, 'poki.config.mjs'))
if (!existsSync(CONFIG_PATH)) die(`no config at ${CONFIG_PATH}`)
const cfg = (await import(pathToFileURL(CONFIG_PATH).href)).default

if (!existsSync(join(ROOT, cfg.dist, 'index.html'))) {
  die(`${cfg.dist}/index.html is missing`, 'run the Vite build first (pnpm build:poki does both)')
}

const r = packArtifact({ root: ROOT, cfg })
if (!r.ok) die(`packed ${cfg.zip}, but it would be rejected: ${r.why}`)
pass(`packed ${cfg.zip}`, `real PKZIP, index.html at the root, ${r.entries} entries, ${bytes(r.bytes)}, sha1 ${r.sha1}`)
