// A voice file's content hash, and the list of shipped voice files with it.
// The build (vite.config.ts) lists every file as `<lang>/<file>?v=<hash>`, so a
// re-voiced line gets a new URL and no browser, CDN or portal cache can keep
// playing the old take; the review page (voice:review) keys its verdicts by the
// same hash, so a re-recorded line goes back to "not yet approved".
// Plain Node, no dependencies: the Vite config imports it too.

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

export const VOICE_EXTS = ['.ogg', '.mp3', '.m4a']

/** The first 10 hex digits of the file's SHA-1: changes whenever a byte does. */
export const voiceHash = (bytes) => createHash('sha1').update(bytes).digest('hex').slice(0, 10)
export const voiceHashOf = (path) => voiceHash(readFileSync(path))

/** Every voice file under `dir` (one folder per language), as `<lang>/<file>?v=<hash>`. */
export const scanVoiceFiles = (dir) => {
  const out = []
  if (!existsSync(dir)) return out
  for (const lang of readdirSync(dir).filter(d => /^[a-z]{2}(-[A-Z]{2})?$/.test(d)).sort()) {
    const files = readdirSync(join(dir, lang)).filter(f => VOICE_EXTS.includes(f.slice(f.lastIndexOf('.')).toLowerCase())).sort()
    for (const f of files) out.push(`${lang}/${f}?v=${voiceHashOf(join(dir, lang, f))}`)
  }
  return out
}
