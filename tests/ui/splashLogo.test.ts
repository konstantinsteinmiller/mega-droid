// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// ─── The boot splash is drawn twice and must be the same picture ───────────
//
// `index.html` paints a static splash before any script runs; `FLogoProgress`
// takes over when Vue mounts and cross-fades the static one away. The hand-over
// is only invisible if the two are the same picture, at the same size, in the
// same place. They used not to be: the static copy was a simplified emblem
// with half the title, so the logo visibly changed as the loader took over.
//
// Now the lockup (Flux's helmet in its charged ring over the MEGA /
// DROID wordmark, store-art/brand/logo.mjs) is ONE inline SVG of paths, pasted into both files. This
// pins the two copies to each other, byte for byte, and pins every sizing and
// colour rule of the two layouts to each other, rule for rule. A browser
// check of the hand-over (boxes and pixels) is in the logo redesign notes;
// what a unit test can hold is that nobody edits one copy and not the other.

const read = (rel: string): string => readFileSync(resolve(__dirname, '../..', rel), 'utf8')
const html = read('index.html')
const vue = read('src/components/atoms/FLogoProgress.vue')
const manifest = JSON.parse(read('public/manifest.json')) as { name: string; short_name: string; description: string; background_color: string }


/** `prop: value` pairs of a plain CSS rule in index.html's <style>. */
const cssRule = (selector: string): Record<string, string> => {
  const css = /<style>([\s\S]*?)<\/style>/.exec(html)?.[1] ?? ''
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const body = new RegExp(`(?:^|\\n|\\})\\s*${esc}\\s*\\{([^{}]*)\\}`).exec(css)?.[1]
  if (body === undefined) throw new Error(`index.html has no rule for ${selector}`)
  return Object.fromEntries(body.split(';').map((d) => d.trim()).filter(Boolean).map((d) => {
    const i = d.indexOf(':')
    return [d.slice(0, i).trim(), d.slice(i + 1).trim()]
  }))
}

/** `prop: value` pairs of an indented-sass rule in FLogoProgress (optionally one nested block down). */
const sassRule = (selector: string, nested?: string): Record<string, string> => {
  const style = /<style[^>]*lang="sass">([\s\S]*?)<\/style>/.exec(vue)?.[1] ?? ''
  const lines = style.split('\n')
  const at = lines.findIndex((l) => l === selector)
  if (at < 0) throw new Error(`FLogoProgress has no rule for ${selector}`)
  const block: string[] = []
  for (const l of lines.slice(at + 1)) {
    if (l.trim() && !l.startsWith('  ')) break
    block.push(l)
  }
  let pick = block.filter((l) => /^ {2}[a-z-]+: /.test(l))
  if (nested) {
    const n = block.findIndex((l) => l === `  ${nested}`)
    if (n < 0) throw new Error(`FLogoProgress has no ${nested} under ${selector}`)
    pick = []
    for (const l of block.slice(n + 1)) {
      if (!l.startsWith('    ')) break
      pick.push(l)
    }
  }
  return Object.fromEntries(pick.map((l) => {
    const i = l.indexOf(':')
    return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
  }))
}

const only = (rule: Record<string, string>, keys: string[]): Record<string, string> =>
  Object.fromEntries(keys.map((k) => [k, rule[k]]))

describe('the splash logo', () => {
  // Both loaders show the square lockup (Flux's rendered head over MEGA /
  // DROID), written by store-art/brand/logo.mjs --raster, as one <img>.
  const SQUARE = /\/images\/logo\/mega-droid-logo-square-256\.webp/
  const staticImg = /<img class="s-logo" [^>]*>/.exec(html)?.[0] ?? ''
  const loaderImg = /h1\.logo\n\s*img\(([^\n]*)\)\n/.exec(vue)?.[1] ?? ''
  const attr = (s: string, a: string) => new RegExp(`(?:^|\\s)${a}="([^"]*)"`).exec(s)?.[1]

  it('is the 256 px square WebP in both places, with the same 2x source', () => {
    expect(attr(staticImg, 'src')).toMatch(SQUARE)
    expect(attr(loaderImg, 'src')).toBe(attr(staticImg, 'src'))
    expect(attr(loaderImg, 'srcset')).toBe(attr(staticImg, 'srcset'))
    for (const s of [staticImg, loaderImg]) expect([attr(s, 'width'), attr(s, 'height')]).toEqual(['256', '256'])
  })

  it('exists, square, transparent, and small (it is on the critical path)', async () => {
    const sharp = (await import('sharp')).default
    for (const f of (attr(staticImg, 'srcset') ?? '').split(',').map((x) => x.trim().split(' ')[0]!)) {
      const buf = readFileSync(resolve(__dirname, '../../public', f.slice(1)))
      const m = await sharp(buf).metadata()
      expect(m.width, f).toBe(m.height)
      expect(m.hasAlpha, f).toBe(true)
    }
    expect(readFileSync(resolve(__dirname, '../../public/images/logo/mega-droid-logo-square-256.webp')).length).toBeLessThan(40 * 1024)
  })

  it('carries the game name as its alt text in both places', () => {
    expect(attr(staticImg, 'alt')).toBe('Mega Droid')
    expect(loaderImg).toContain(`:alt="t('gameName')"`)
  })

  it('is named what the page and the installed app are named', () => {
    // The tab title, the iOS home-screen title, the PWA name and the logo's
    // accessible name are one string. scripts/render-thumbnail.mjs also
    // checks the served <title> against its own TITLE before trusting a port.
    const title = /<title>([^<]*)<\/title>/.exec(html)?.[1]
    expect(title).toBe('Mega Droid')
    expect(/<meta name="apple-mobile-web-app-title" content="([^"]*)">/.exec(html)?.[1]).toBe(title)
    expect(attr(staticImg, 'alt')).toBe(title)
    expect(manifest.name).toBe(title)
    expect(manifest.short_name).toBe(title)
    expect(read('scripts/render-thumbnail.mjs')).toContain(`const TITLE = '${title}'`)
  })
})

describe('the intro lockup (logoLockup.ts: the start gate and the intro flash)', () => {
  const introSvg = /`(<svg[\s\S]*?<\/svg>)`/.exec(read('src/components/story/logoLockup.ts'))?.[1] ?? ''

  it('is the generated flat wordmark, pasted as it is (node store-art/brand/logo.mjs)', () => {
    expect(introSvg).toBe(read('store-art/brand/logo-lockup.svg'))
  })

  it('carries no id, is paths not text, requests nothing and stays small', () => {
    expect(introSvg).not.toMatch(/\sid=|url\(|href=|<use\b/)
    expect(introSvg).not.toMatch(/<text\b|font-family|font-size/)
    expect(introSvg.replace('xmlns="http://www.w3.org/2000/svg"', '')).not.toMatch(/https?:|<image\b|@import/)
    expect(introSvg.length).toBeLessThan(5000)
    expect(introSvg).toMatch(/^<svg [^>]*aria-hidden="true"/)
  })
})

describe('the two layouts are the same, rule for rule', () => {
  it('centre the column the same way (a flex layer, no half-pixel transform)', () => {
    const keys = ['position', 'inset', 'display', 'align-items', 'justify-content']
    expect(only(sassRule('.loader'), keys)).toEqual(only(cssRule('#static-splash'), keys))
    expect(sassRule('.loader').transform).toBeUndefined()
  })

  it('size the column the same', () => {
    const keys = ['position', 'display', 'flex-direction', 'align-items', 'gap', 'width']
    expect(only(sassRule('.card'), keys)).toEqual(only(cssRule('.s-card'), keys))
  })

  it('size the logo the same', () => {
    expect(only(sassRule('.logo'), ['width', 'aspect-ratio', 'margin'])).toEqual(only(cssRule('.s-logo'), ['width', 'aspect-ratio', 'margin']))
  })
  it('draw the bar the same', () => {
    expect(sassRule('.bar')).toEqual(cssRule('.s-bar'))
    expect(sassRule('.track, .lit')).toEqual(cssRule('.s-track, .s-lit'))
    expect(sassRule('.track')).toEqual(cssRule('.s-track'))
    expect(sassRule('.lit')).toEqual(cssRule('.s-lit'))
    const fill = ['width', 'height', 'background', 'transform-origin']
    expect(only(sassRule('.fill'), fill)).toEqual(only(cssRule('.s-fill'), fill))
  })

  it('hang the same mini-game box under the column', () => {
    const mini = /<style[^>]*lang="sass">([\s\S]*?)<\/style>/.exec(read('src/components/atoms/LoaderMiniGame.vue'))?.[1] ?? ''
    const body = mini.split('\n.mini-game\n')[1]!.split('\n\n')[0]!
    const rule = Object.fromEntries(body.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 1).trim()]))
    expect(rule).toEqual(cssRule('.s-mini'))
    expect(html).toMatch(/<canvas class="s-mini" aria-hidden="true"><\/canvas>\n {2}<\/div>\n<\/div>\n[\s\S]*?<script src="\/js\/mini-game\.js"><\/script>/)
    expect(vue).toMatch(/\n {8}LoaderMiniGame\n/)
  })

  it('paint the same backdrop and the same grid', () => {
    expect(sassRule('.splash-backdrop').background).toBe(cssRule('#static-splash').background)
    const grid = ['inset', 'background-image', 'background-size']
    expect(only(sassRule('.backdrop-grid'), grid)).toEqual(only(cssRule('.s-grid'), grid))
    // Same loop (duration, easing), under each file's own keyframes name.
    const loop = (a: string) => a.split(' ').slice(1).join(' ')
    expect(loop(sassRule('.backdrop-grid').animation)).toBe(loop(cssRule('.s-grid').animation))
  })

  it('end the backdrop in the page colour, so nothing flashes at the edges', () => {
    const edge = /(#[0-9a-f]{6}) 100%\)$/i.exec(cssRule('#static-splash').background)?.[1]
    expect(edge).toBeTruthy()
    expect(cssRule('body')['background-color']).toBe(edge)
    expect(manifest.background_color).toBe(edge)
  })
})

describe('the loader mechanics survive the restyle', () => {
  it('the static bar creeps on the compositor, from nothing, by transform', () => {
    expect(cssRule('.s-fill').transform).toBe('scaleX(0)')
    expect(cssRule('.s-fill').animation).toMatch(/^s-creep /)
    expect(html).toMatch(/@keyframes s-creep \{\s*to \{ transform: scaleX\(0\.1\); \}/)
  })

  it('the Vue bar starts where the static one got to, and only ever creeps forward from there', () => {
    expect(vue).toContain("readScaleX(document.querySelector('#static-splash .s-fill'))")
    expect(vue).toMatch(/div\.fill\(:style="fillStyle"\)/)
    const creepTo = Number(/const CREEP_TO = ([\d.]+)/.exec(vue)?.[1])
    const staticEnd = Number(/@keyframes s-creep \{\s*to \{ transform: scaleX\(([\d.]+)\)/.exec(html)?.[1])
    expect(creepTo).toBeGreaterThan(staticEnd)
  })

  it('the grid pan continues in phase instead of restarting under the cross-fade', () => {
    expect(vue).toMatch(/continuePan\(staticSplash\.querySelector\('\.s-grid'\), gridEl\.value\)/)
    expect(vue).toMatch(/div\.backdrop-grid\(ref="gridEl"/)
  })

  it('the 28-cell bar is gone from both (it was a MegaMan health bar)', () => {
    for (const src of [html, vue]) {
      expect(src).not.toMatch(/\/ 28\)|28-cell|helm/i)
    }
  })
})

describe('the store copy describes the new hero', () => {
  const meta = /<meta name="description" content="([^"]*)">/.exec(html)?.[1] ?? ''

  it.each([['index.html meta description', meta], ['manifest description', manifest.description]])('%s names Flux and no longer the blue android', (_, text) => {
    expect(text).toContain('Flux')
    expect(text).not.toMatch(/\bblue\b|Cobalt/i)
    // "Buster" is MegaMan's word for the arm cannon; store copy says cannon.
    expect(text).not.toMatch(/buster/i)
  })
})
