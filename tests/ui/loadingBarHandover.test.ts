// @vitest-environment jsdom
// The splash → Vue hand-over of the HP-style loading bar: FLogoProgress's bar
// starts exactly where the static splash's creeping bar has got to and never
// moves backwards from there, whatever the asset loader reports first.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

const progress = vi.hoisted(() => ({ ref: null as unknown as { value: number } }))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))
vi.mock('@/use/useAssets', async () => {
  const { ref } = await import('vue')
  progress.ref = ref(0)
  return { default: () => ({ loadingProgress: progress.ref, preloadAssets: async () => {} }) }
})
vi.mock('@/components/atoms/LoaderMiniGame.vue', () => ({ default: { template: '<canvas class="mini-game" />' } }))
vi.mock('@/use/useCrazyGames', () => ({ stopLoading: () => {} }))
vi.mock('@/use/useFirstLoadInterstitial', () => ({ armFirstLoadInterstitial: () => {}, notifySplashGone: () => {} }))
vi.mock('@/use/whenInteractive', () => ({ whenInteractive: () => {} }))
// The lockup's public-dir URLs, compiled into imports by the SFC template.
vi.mock('/images/logo/mega-droid-logo-square-256.webp', () => ({ default: '/l256.webp' }))
vi.mock('/images/logo/mega-droid-logo-square-512.png', () => ({ default: '/l512.png' }))
vi.mock('/images/logo/mega-droid-logo-square-768.webp', () => ({ default: '/l768.webp' }))

import FLogoProgress from '@/components/atoms/FLogoProgress.vue'

const scale = (el: Element): number => Number(/scaleX\(([\d.]+)\)/.exec((el as HTMLElement).style.transform)?.[1])

describe('the loading bar hand-over', () => {
  beforeEach(() => {
    // The static splash's bar, mid-creep (a browser reports the computed transform as a matrix).
    document.body.innerHTML = '<div id="static-splash"><div class="hp-bar"><div class="hp-lit"><div class="hp-fill" style="transform: matrix(0.07, 0, 0, 1, 0, 0)"></div></div></div></div>'
    progress.ref.value = 0
  })
  afterEach(() => { document.body.innerHTML = '' })

  it('draws the same HP-bar classes as the static splash', () => {
    const w = mount(FLogoProgress, { attachTo: document.body, global: { stubs: { Transition: false } } })
    const bar = w.find('.loader .hp-bar')
    expect(bar.attributes('role')).toBe('progressbar')
    expect(bar.find('.hp-cells').exists()).toBe(true)
    expect(bar.find('.hp-lit .hp-fill').exists()).toBe(true)
    w.unmount()
  })

  it('starts where the static bar got to, then only moves forward', async () => {
    vi.useFakeTimers()
    const w = mount(FLogoProgress, { attachTo: document.body, global: { stubs: { Transition: false } } })
    const fill = w.find('.loader .hp-fill').element
    const bar = w.find('.loader .hp-bar')
    expect(scale(fill)).toBeCloseTo(0.07, 4)
    expect(bar.attributes('aria-valuenow')).toBe('7')
    const seen = [scale(fill)]
    // First frame armed, then a loader that reports less than the static bar showed.
    await vi.advanceTimersByTimeAsync(50)
    seen.push(scale(fill))
    for (const p of [2, 5, 20, 60, 100]) {
      progress.ref.value = p
      await w.vm.$nextTick()
      seen.push(scale(fill))
    }
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1]!)
    expect(seen.at(-1)).toBe(1)
    w.unmount()
    vi.useRealTimers()
  })
})
