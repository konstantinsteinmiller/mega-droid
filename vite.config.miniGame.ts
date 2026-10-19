// ─── The loading mini-game, inlined into index.html (#Mini1) ────────────────
//
// public/js/mini-game.js is the source. index.html names it with a plain
// <script src> tag (so `vite` dev and the tests read one file); this plugin
// minifies it and swaps the tag for an inline <script>, so it runs from the
// first HTML byte with no request. It also writes the CSP meta tag, with the
// inline script's sha256 in script-src: the hash is taken from the exact bytes
// it inlines, so the two cannot drift (tests/platforms/miniGameInline.test.ts).
//
// The one exception is the Playgama build (the YouTube Playables submission):
// Playables runs the game under YouTube's own CSP, which a hash in our page
// cannot open, so there it stays an external same-origin file, minified.

import { createHash } from 'node:crypto'
import { readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { transformWithEsbuild, type Plugin } from 'vite'
import { buildCsp } from './src/platforms/csp'

export const MINI_GAME_TAG = '<script src="/js/mini-game.js"></script>'
export const CSP_PLACEHOLDER = '<!-- CSP meta tag injected by vite.config.ts at build time -->'
const SOURCE = resolve(__dirname, 'public/js/mini-game.js')

/** The script as it ships: minified, no trailing newline. */
export const miniGameCode = async (): Promise<string> =>
  (await transformWithEsbuild(readFileSync(SOURCE, 'utf8'), 'mini-game.js', { minify: true, target: 'es2017' })).code.trim()

/** A CSP source expression for one inline script's exact text. */
export const scriptHash = (code: string): string => `'sha256-${createHash('sha256').update(code, 'utf8').digest('base64')}'`

export interface MiniGameOptions {
  /** false: keep the external file (Playgama / Playables). */
  inline: boolean
  /** Builds whose portal forbids a game CSP meta tag. */
  skipCspMeta: boolean
}

/** index.html with the mini-game inlined (or not) and the CSP meta tag written. */
export const transformIndex = async (html: string, env: Record<string, string>, o: MiniGameOptions): Promise<string> => {
  const code = await miniGameCode()
  const out = o.inline ? html.replace(MINI_GAME_TAG, () => `<script>${code}</script>`) : html
  const csp = buildCsp(env, o.inline ? [scriptHash(code)] : [])
  return out.replace(CSP_PLACEHOLDER, o.skipCspMeta ? '' : `<meta http-equiv="Content-Security-Policy" content="${csp}" />`)
}

export const miniGamePlugin = (env: Record<string, string>, o: MiniGameOptions): Plugin => {
  let outDir = ''
  let build = false
  return {
    name: 'inject-csp-and-mini-game',
    configResolved(c) { outDir = resolve(c.root, c.build.outDir); build = c.command === 'build' },
    transformIndexHtml: { order: 'pre', handler: (html) => transformIndex(html, env, o) },
    // public/ copies the readable source into the build: drop it where it is
    // inlined, minify it where it is still loaded as a file.
    async closeBundle() {
      const file = resolve(outDir, 'js/mini-game.js')
      if (!build || !existsSync(file)) return
      if (o.inline) rmSync(file)
      else writeFileSync(file, await miniGameCode())
    }
  }
}
