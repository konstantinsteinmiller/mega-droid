// voice-todo.md: every voice line with its state per language, rendered by
// src/game/audio/voiceTodo.ts (the test that keeps the file current renders
// the same text). Written by `pnpm voice:script` and after every voice:gen run.

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import { LANGS, LOCALES, ROOT, VOICE_LINES, VOICE_OUT, VO_SRC, fileName } from './lib.mjs'

const { renderVoiceTodo } = await import(pathToFileURL(join(ROOT, 'src/game/audio/voiceTodo.ts')).href)

/** The file names (no extension) in public/audio/voice/<lang>/. */
export const voiceFilesOf = (lang) => {
  const dir = join(VOICE_OUT, lang)
  return new Set(existsSync(dir) ? readdirSync(dir).filter(f => /\.(ogg|mp3|m4a)$/i.test(f)).map(f => f.replace(/\.[^.]+$/, '')) : [])
}

export const writeVoiceTodo = () => {
  const shippedFile = join(VO_SRC, 'shipped.json')
  const md = renderVoiceTodo({
    lines: VOICE_LINES,
    langs: LANGS,
    locales: LOCALES,
    shipped: existsSync(shippedFile) ? JSON.parse(readFileSync(shippedFile, 'utf8')) : {},
    files: Object.fromEntries(LANGS.map(l => [l, voiceFilesOf(l)])),
    fileName
  })
  const out = join(ROOT, 'voice-todo.md')
  writeFileSync(out, md)
  const live = VOICE_LINES.filter(l => l.status === 'live').length
  console.log(`${relative(ROOT, out)}: ${live} lines`)
}
