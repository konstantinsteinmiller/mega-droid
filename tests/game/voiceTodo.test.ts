// voice-todo.md is the voice work's memory: every voice line with its state
// per language. It is rendered from the catalogue, the locales, the shipped
// files and vo-src/shipped.json (src/game/audio/voiceTodo.ts); a new text
// line in a speaker's section shows up there as missing. This keeps the
// committed file current: when it fails, run `pnpm voice:script`.

import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { renderVoiceTodo } from '@/game/audio/voiceTodo'
import { VOICE_LINES } from '@/game/audio/voiceLines'
import { fileName } from '@/game/audio/voiceCatalog'
import en from '@/i18n/locales/en'
import de from '@/i18n/locales/de'

const ROOT = resolve(__dirname, '../..')
const filesOf = (lang: string) => {
  const dir = resolve(ROOT, 'public/audio/voice', lang)
  return new Set(existsSync(dir) ? readdirSync(dir).filter(f => /\.(ogg|mp3|m4a)$/i.test(f)).map(f => f.replace(/\.[^.]+$/, '')) : [])
}
const shippedFile = resolve(ROOT, 'vo-src/shipped.json')

describe('voice-todo.md', () => {
  const md = renderVoiceTodo({
    lines: VOICE_LINES,
    locales: { en, de },
    shipped: existsSync(shippedFile) ? JSON.parse(readFileSync(shippedFile, 'utf8')) : {},
    files: { en: filesOf('en'), de: filesOf('de') },
    fileName
  })

  it('is current (run `pnpm voice:script` when it is not)', () => {
    const file = readFileSync(resolve(ROOT, 'voice-todo.md'), 'utf8').replace(/\r\n/g, '\n')
    expect(file === md, 'voice-todo.md is stale: run pnpm voice:script').toBe(true)
  })

  it('lists every live line, and names a missing recording as missing', () => {
    for (const l of VOICE_LINES.filter(x => x.status === 'live')) expect(md, l.key).toContain(`\`${fileName(l.key)}\``)
    expect(md).toMatch(/## Missing \(\d+\)/)
  })
})
