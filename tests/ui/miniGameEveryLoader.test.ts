// @vitest-environment jsdom
// The loading mini-game (#Mini1) on EVERY load: the cold HTML load, the boot
// loader (into the Lab or a resumed mission), and the mission beam that every
// Lab → mission build shows (story, supply run, challenge, replays, the intro's
// tutorial build). It runs the moment its loader mounts, and a short screen
// shrinks it instead of hiding it.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

const flow = vi.hoisted(() => ({ value: null as unknown }))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))
vi.mock('@/game/flow', async () => {
  const { reactive } = await import('vue')
  flow.value = reactive({ loading: false, loadingSector: '', loadingBoss: '', loadProgress: 0 })
  return { flow: flow.value }
})

import MissionLoading from '@/components/hud/MissionLoading.vue'

const read = (p: string): string => readFileSync(resolve(__dirname, '../..', p), 'utf8')
const SRC = read('public/js/mini-game.js')
type F = { loading: boolean; loadingSector: string; loadingBoss: string; loadProgress: number }
const f = (): F => flow.value as F

describe('the mini-game on every loader', () => {
  let run: ReturnType<typeof vi.fn>
  beforeEach(() => {
    run = vi.fn(() => () => {})
    ;(window as unknown as { mdMini: unknown }).mdMini = { run }
  })
  afterEach(() => { Object.assign(f(), { loading: false, loadingSector: '', loadingBoss: '' }) })

  it.each([
    ['a story stage (boss splash)', { loadingSector: 'magnet', loadingBoss: 'magnetMaster' }],
    ['a supply run / challenge / job', { loadingSector: 'scrapyard', loadingBoss: '' }],
    ['the intro\'s tutorial build', { loadingSector: '', loadingBoss: '' }]
  ])('the mission beam runs it at once for %s', async (_, s) => {
    Object.assign(f(), s, { loading: true })
    const w = mount(MissionLoading, { global: { stubs: { Transition: false } } })
    const c = w.find('canvas.mini-game')
    expect(c.exists()).toBe(true)
    expect(run).toHaveBeenCalledWith(c.element)
    w.unmount()
  })

  it('no beam, no mini-game', () => {
    const w = mount(MissionLoading, { global: { stubs: { Transition: false } } })
    expect(w.find('canvas.mini-game').exists()).toBe(false)
    expect(run).not.toHaveBeenCalled()
  })

  it('every loading screen hosts it, and the beam is always mounted in the game view', () => {
    expect(read('src/components/atoms/FLogoProgress.vue')).toMatch(/\n {8}LoaderMiniGame\n/)
    expect(read('src/components/hud/MissionLoading.vue')).toMatch(/\n {8}LoaderMiniGame\n/)
    expect(read('src/views/GameScene.vue')).toMatch(/\n {4}MissionLoading\n/)
    expect(read('src/App.vue')).toMatch(/\n {4}FLogoProgress\n/)
    // Every way into a mission goes through the beam (flow.loading).
    const fl = read('src/game/flow.ts')
    expect(fl).toMatch(/deployFromPad[\s\S]*?return startMission\(quest\)/)
    expect(fl).toMatch(/export const startMission[\s\S]*?flow\.loading = true/)
  })

  it('the cold HTML load has it before any bundle', () => {
    const html = read('index.html')
    const splash = html.indexOf('<div id="static-splash">')
    expect(splash).toBeGreaterThan(0)
    expect(html.indexOf('<canvas class="s-mini" aria-hidden="true"></canvas>')).toBeGreaterThan(splash)
    const tag = html.indexOf('<script src="/js/mini-game.js"></script>')
    const bundle = html.indexOf('<script type="module" src=')
    expect(tag).toBeGreaterThan(splash)
    if (bundle > 0) expect(tag).toBeLessThan(bundle)
  })

  it('a short screen shrinks it rather than hiding it; gone only with no room', () => {
    const html = read('index.html')
    const vue = read('src/components/atoms/LoaderMiniGame.vue')
    expect(html).not.toMatch(/max-height: 600px\)\s*\{[^}]*\.s-mini\s*\{\s*display: none/)
    expect(html).toMatch(/@media \(max-height: 600px\) \{[\s\S]*?\.s-mini \{ position: static; margin: 0; \}/)
    expect(html).toMatch(/@media \(max-height: 240px\) \{ \.s-mini \{ display: none; \} \}/)
    expect(vue).toMatch(/@media \(max-height: 600px\)\n {2}\.mini-game\n {4}position: static\n {4}margin: 0/)
    expect(vue).toMatch(/@media \(max-height: 240px\)\n {2}\.mini-game\n {4}display: none/)
    // The logo makes room the same way on both sides of the hand-over.
    expect(html).toMatch(/\.s-logo \{ width: min\(100%, 256px, 42vh\); \}/)
    expect(read('src/components/atoms/FLogoProgress.vue')).toMatch(/@media \(max-height: 600px\)\n {2}\.logo\n {4}width: min\(100%, 256px, 42vh\)/)
  })

  it('draws its first frame inside run(), not a frame later', () => {
    new Function(SRC)()
    const g = (window as unknown as { mdMini: { run: (c: HTMLCanvasElement) => () => void } }).mdMini
    const canvas = document.createElement('canvas')
    document.body.appendChild(canvas)
    const ctx = new Proxy({}, { get: (_, k) => (k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {}), set: () => true })
    canvas.getContext = (() => ctx) as unknown as HTMLCanvasElement['getContext']
    Object.defineProperty(canvas, 'clientWidth', { value: 300 })
    Object.defineProperty(canvas, 'clientHeight', { value: 80 })
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1)
    const stop = g.run(canvas)
    expect(canvas.width).toBe(Math.round(300 * (window.devicePixelRatio || 1)))
    expect(canvas.height).toBe(Math.round(80 * (window.devicePixelRatio || 1)))
    stop()
    canvas.remove()
    vi.restoreAllMocks()
  })
})
