#!/usr/bin/env node
// Increment `ANDROID_VERSION_CODE` in `.env.tauri.remote` after a
// successful Android APK/AAB build. Chained onto
// `tauri:build-android-apk` / `tauri:build-android-aab` with `&&` so
// it only runs when the underlying tauri build succeeded — a failed
// build leaves the value untouched and the next attempt reuses the
// same code.
//
// The Play Console rejects uploads whose versionCode is not strictly
// greater than the previously-uploaded value. Without a CI pipeline
// to drive this monotonically, persisting it in the repo's
// `.env.tauri.remote` (committed, non-secret build state) and
// bumping post-success is the simplest source of truth that survives
// across local builds and machines.

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ENV_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '..', '.env.tauri.remote')
const KEY = 'ANDROID_VERSION_CODE'

const raw = readFileSync(ENV_PATH, 'utf8')
const lineRegex = new RegExp(`^${KEY}=(\\d+)\\s*$`, 'm')
const match = raw.match(lineRegex)

let next
let updated
if (match) {
  const current = parseInt(match[1], 10)
  if (!Number.isFinite(current)) {
    console.error(`[bump-android-version-code] existing ${KEY} value is not a number: "${match[1]}"`)
    process.exit(1)
  }
  next = current + 1
  updated = raw.replace(lineRegex, `${KEY}=${next}`)
  console.log(`[bump-android-version-code] ${KEY}: ${current} → ${next}`)
} else {
  // Missing key — seed at 2 so the just-finished build (which used the
  // gradle fallback of "1") and the next build are still monotonic.
  next = 2
  const sep = raw.endsWith('\n') ? '' : '\n'
  updated = `${raw}${sep}${KEY}=${next}\n`
  console.log(`[bump-android-version-code] ${KEY} not present — seeded at ${next}`)
}

writeFileSync(ENV_PATH, updated, 'utf8')
