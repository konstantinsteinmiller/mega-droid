// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { gzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { MINI_GAME_TAG, miniGameCode, scriptHash, transformIndex } from '../../vite.config.miniGame'

// ─── The loading mini-game is inlined, and the CSP carries its hash ────────
//
// The plugin minifies public/js/mini-game.js, inlines it into index.html and
// writes its sha256 into the CSP meta tag. Run on the real index.html here,
// the hash in the policy must be the hash of the exact bytes inlined, or the
// browser refuses the game on every build that ships a CSP.

const html = readFileSync(resolve(__dirname, '../../index.html'), 'utf8')
const csp = (out: string): string => /<meta http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(out)?.[1] ?? ''
const inlined = (out: string): string[] => [...out.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]!)

describe('the inlined loading mini-game', () => {
  it('index.html names it once, as the tag the plugin replaces', () => {
    expect(html.split(MINI_GAME_TAG).length).toBe(2)
  })

  it('is inlined, minified, and its sha256 is in script-src', async () => {
    const out = await transformIndex(html, {}, { inline: true, skipCspMeta: false })
    expect(out).not.toContain(MINI_GAME_TAG)
    const scripts = inlined(out)
    expect(scripts).toHaveLength(1)
    expect(scripts[0]).toBe(await miniGameCode())
    const scriptSrc = /script-src ([^;]+)/.exec(csp(out))?.[1] ?? ''
    expect(scriptSrc.split(' ')).toContain(scriptHash(scripts[0]!))
    expect(scriptSrc).not.toContain('unsafe-inline')
    // Small: it ships inside every index.html (under 6 KB gzipped)
    expect(gzipSync(scripts[0]!).length).toBeLessThan(6144)
  })

  it('keeps every other build CSP as it was, plus only the hash', async () => {
    const out = await transformIndex(html, {}, { inline: true, skipCspMeta: false })
    const { buildCsp } = await import('../../src/platforms/csp')
    expect(csp(out).replace(` ${scriptHash(inlined(out)[0]!)}`, '')).toBe(buildCsp({}))
  })

  it('stays a file, with no hash, where it is not inlined (Playgama / Playables)', async () => {
    const out = await transformIndex(html, {}, { inline: false, skipCspMeta: true })
    expect(out).toContain(MINI_GAME_TAG)
    expect(out).not.toMatch(/Content-Security-Policy/)
  })

  it('is inlined without a meta tag on builds that forbid one (Poki, Yandex, GamePix)', async () => {
    const out = await transformIndex(html, {}, { inline: true, skipCspMeta: true })
    expect(inlined(out)).toHaveLength(1)
    expect(out).not.toMatch(/Content-Security-Policy|CSP meta tag injected/)
  })
})
