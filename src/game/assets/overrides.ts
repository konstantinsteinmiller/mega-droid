import overrides from 'virtual:asset-overrides'

/**
 * ─── Drop-in assets ──────────────────────────────────────────────────────────
 *
 * Everything is procedural by default: canvas-baked textures and a chiptune
 * synth. A file dropped into `public/` under the name of the thing it replaces
 * takes over from the procedural version (the names are listed in
 * `art-todo.md` and `sound-todo.md`):
 *
 *   public/audio/sfx/<sfx name>.ogg        → that sound effect
 *   public/audio/music/<track id>.ogg      → that music track (or jingle)
 *   public/images/textures/floor|wall.webp → that level detail map
 *
 * The list is taken at BUILD time (`assetOverridesPlugin` in vite.config.ts),
 * so the game only requests files that exist; a missing one is never a 404.
 * Each map is keyed by the file name without its extension.
 */
const byName = (files: string[], dir: string): Map<string, string> => {
  const base = import.meta.env.BASE_URL
  const m = new Map<string, string>()
  for (const f of files) m.set(f.slice(0, f.lastIndexOf('.')), `${base}${dir}/${f}`)
  return m
}

export const SFX_FILES = byName(overrides.sfx, 'audio/sfx')
export const MUSIC_FILES = byName(overrides.music, 'audio/music')
export const TEXTURE_FILES = byName(overrides.textures, 'images/textures')

/**
 * Voice-overs: `public/audio/voice/<lang>/<file>.ogg` (also .mp3 / .m4a),
 * per voiced language, keyed by line id (the line's i18n key, e.g.
 * `atlas.lowHp`). The file is named after the key with its dots as
 * underscores (`atlas_lowHp.ogg`, see `audio/voiceCatalog.ts`); a dotted name
 * (`atlas.lowHp.ogg`) still works. Only files that exist are listed, so a
 * line without one is never requested: it just shows its speech bubble.
 * The build lists each with its content hash (`<lang>/<file>.ogg?v=<hash>`,
 * tools/voice/hash.mjs) and the URL keeps it: a re-voiced line is a new URL,
 * so no cache serves the old take.
 */
export const voiceFiles = (list: readonly string[] = overrides.voice ?? []): Map<string, Map<string, string>> => {
  const base = import.meta.env.BASE_URL
  const out = new Map<string, Map<string, string>>()
  for (const entry of list) {
    const slash = entry.indexOf('/')
    if (slash < 0) continue
    const lang = entry.slice(0, slash)
    const q = entry.indexOf('?')
    const file = entry.slice(slash + 1, q < 0 ? undefined : q)
    const id = file.slice(0, file.lastIndexOf('.')).replace(/_/g, '.')
    let m = out.get(lang)
    if (!m) out.set(lang, (m = new Map()))
    // One file per line: .ogg wins over a duplicate .mp3 / .m4a.
    if (!m.has(id) || file.endsWith('.ogg')) m.set(id, `${base}audio/voice/${entry}`)
  }
  return out
}
export const VOICE_FILES = voiceFiles()
