<template lang="pug">
  div.big-banner(ref="root" role="status" aria-live="polite" aria-atomic="true")
    div.bn-probe(ref="probe" aria-hidden="true")
    div.bn-band(
      v-if="visible"
      data-zone="banner"
      :key="banner.seq"
      :class="bandClass"
      :style="bandStyle"
      @animationend="onAnimationEnd"
    )
      div.bn-strip(aria-hidden="true")
        div.bn-sweep
      div.bn-line
        span.bn-text(:lang="lang" :dir="dir") {{ text }}
      span.bn-measure(ref="measure" :lang="lang" :dir="dir" :style="{ fontSize: BANNER_REF_SIZE + 'px' }" aria-hidden="true") {{ text }}
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { banner, bannerSeconds, type BannerKind } from '@/game/state/banner'
import { isGamePaused } from '@/use/useGamePause'
import { BANNER_REF_SIZE, fitBannerFontSize } from './bannerFit'
import { stage } from './hudLayout'

/**
 * The big moment banners: "LEVEL CLEARED" in electric blue as the exit drone
 * lifts off, "ENEMY DEFEATED!" and "GAME OVER!" in crimson — a dark band
 * across the middle of the screen, the words settling into it and fading out,
 * the way Elden Ring says ENEMY FELLED.
 *
 * The sim raises one (`showBanner`) and paces its own follow-up on
 * `BANNER_HOLD`; the whole animation runs inside that (`bannerSeconds`). The
 * band is keyed on `seq`, so a second banner, even of the same kind, replays
 * from the start. A banner that has played out is gone even while `kind`
 * stays set, and one raised before this view mounted never shows.
 *
 * The words must fit one line in every language on every screen, so the size
 * is measured, not picked (`bannerFit.ts`), again on every resize, language
 * switch and font load. The CSS animation pauses with the game: the sim's
 * clock stops under a modal or an ad, and the card keeps step with it.
 */
const { t, locale } = useI18n({ useScope: 'global' })

/** The largest size each card wants, px. The red cards are the loud ones. */
const DESIGN_MAX: Record<BannerKind, number> = { cleared: 112, bossDown: 150, gameOver: 150, grandMaster: 150 }
/** Scripts without capitals. A Han, Hangul, Thai, Devanagari or Arabic glyph
 *  fills more of its em than a Latin capital does, so these set a size
 *  smaller to look as large, and they are never tracked (see index.sass). */
const CASELESS = new Set(['ja', 'zh', 'zh-TW', 'ko', 'th', 'hi', 'ar'])
const CASELESS_SCALE = 0.86

const root = ref<HTMLElement | null>(null)
const probe = ref<HTMLElement | null>(null)
const measure = ref<HTMLElement | null>(null)
/** The last `seq` that has played out (or was already up at mount). */
const doneSeq = ref(banner.seq)
const fontSize = ref(0)

const kind = computed(() => banner.kind)
const visible = computed(() => banner.kind !== '' && banner.seq !== doneSeq.value)
const lang = computed(() => String(locale.value))
const caseless = computed(() => CASELESS.has(lang.value))
const dir = computed(() => (lang.value === 'ar' ? 'rtl' : 'ltr'))
const text = computed(() => (banner.kind ? t(`banner.${banner.kind}`) : ''))

const bandClass = computed(() => [
  `kind-${kind.value}`,
  kind.value === 'cleared' ? 'tone-blue' : 'tone-red',
  { caseless: caseless.value, paused: isGamePaused.value }
])
const bandStyle = computed(() => ({
  fontSize: fontSize.value > 0 ? `${fontSize.value}px` : undefined,
  '--bn-dur': `${banner.kind ? bannerSeconds(banner.kind) : 0}s`
}))

const px = (v: string): number => Number.parseFloat(v) || 0

/** Measure the words at the reference size and size the band to the screen. */
const refit = (): void => {
  if (!visible.value || !banner.kind) return
  const el = root.value
  const vw = el?.clientWidth || window.innerWidth
  const vh = el?.clientHeight || window.innerHeight
  const cs = probe.value ? getComputedStyle(probe.value) : null
  const insets = cs
    ? { top: px(cs.paddingTop), right: px(cs.paddingRight), bottom: px(cs.paddingBottom), left: px(cs.paddingLeft) }
    : undefined
  fontSize.value = fitBannerFontSize({
    measuredWidth: measure.value?.getBoundingClientRect().width ?? 0,
    refSize: BANNER_REF_SIZE,
    viewportWidth: vw,
    viewportHeight: vh,
    insets,
    designMax: DESIGN_MAX[banner.kind] * (caseless.value ? CASELESS_SCALE : 1)
  })
}

/** Refit once the DOM holds the new words: a post-flush watcher runs before
 *  the browser paints, so the first frame is already the fitted size. */
watch([() => banner.seq, visible, lang], refit, { flush: 'post' })
// The coach's glyphs wait while the band is up (`coachHushed`).
watch(visible, (v) => { stage.bannerUp = v }, { immediate: true })

const onAnimationEnd = (e: AnimationEvent): void => {
  // The band's own fade-out is the last thing to finish (the text's drift
  // runs exactly as long, so either will do); scoped keyframes carry a suffix.
  if (e.target !== e.currentTarget || !e.animationName.startsWith('bn-band-out')) return
  doneSeq.value = banner.seq
}

const onFontsLoaded = (): void => refit()
onMounted(() => {
  window.addEventListener('resize', refit)
  window.addEventListener('orientationchange', refit)
  // A web font that finishes loading after the measurement (a script subset
  // fetched on first use) changes the width: measure again.
  document.fonts?.addEventListener?.('loadingdone', onFontsLoaded)
  void document.fonts?.ready.then(onFontsLoaded)
})
onUnmounted(() => {
  window.removeEventListener('resize', refit)
  window.removeEventListener('orientationchange', refit)
  document.fonts?.removeEventListener?.('loadingdone', onFontsLoaded)
  stage.bannerUp = false
})
</script>

<style scoped lang="sass">
// Keep in step with `bannerFit.ts`: the band is BANNER_LINE_EM of line plus
// BANNER_PAD_EM above and below.
$line: 1.3
$pad: 0.32em
$in: 0.7s
$out: 0.55s
$settle: cubic-bezier(0.16, 1, 0.3, 1)

// Above the HUD (its layers reach z 3), below the mission beam overlay (60)
// and every modal (teleported to <body>).
.big-banner
  position: absolute
  inset: 0
  z-index: 40
  display: flex
  align-items: center
  pointer-events: none
  overflow: hidden

// Reads the safe-area insets for the fit: env() is CSS-only.
.bn-probe
  position: absolute
  visibility: hidden
  padding: env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px) env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px)

.tone-red
  --bn-ink: #e8182f
  --bn-hot: rgba(255, 150, 90, 0.95)
  --bn-glow: rgba(255, 48, 24, 0.62)
  --bn-deep: rgba(160, 0, 18, 0.6)
  --bn-rule: #ff3b2e
  --bn-tint: rgba(150, 6, 20, 0.42)
.tone-blue
  --bn-ink: #3fc8ff
  --bn-hot: rgba(214, 248, 255, 0.95)
  --bn-glow: rgba(40, 170, 255, 0.62)
  --bn-deep: rgba(0, 86, 230, 0.55)
  --bn-rule: #52d4ff
  --bn-tint: rgba(0, 64, 150, 0.42)

// Tracking settles in from wider; scripts without capitals are never tracked.
.bn-band
  --bn-ls: 0.06em
  --bn-ls-from: 0.16em
  &.caseless
    --bn-ls: 0em
    --bn-ls-from: 0em

%bn-type
  font-family: var(--font-ui)
  // Russo One ships one weight, and a faked bold smears it; the system faces
  // behind it for other scripts have real bold cuts and take them.
  font-weight: 700
  font-synthesis: none
  text-transform: uppercase
  letter-spacing: var(--bn-ls)
  white-space: nowrap

.bn-band
  position: relative
  width: 100%
  padding: $pad 0
  animation: bn-band-out $out ease-in calc(var(--bn-dur) - #{$out}) forwards
  &.paused, &.paused *
    animation-play-state: paused

// The dark strip: fades out towards both edges, a hairline of the tone along
// its top and bottom, the tone's heat in the middle.
.bn-strip
  position: absolute
  inset: 0
  overflow: hidden
  background: radial-gradient(ellipse 42% 120% at 50% 50%, var(--bn-tint), transparent 72%), rgba(4, 6, 14, 0.74)
  box-shadow: inset 0 max(2px, 0.022em) 0 var(--bn-rule), inset 0 calc(-1 * max(2px, 0.022em)) 0 var(--bn-rule), inset 0 0.16em 0.3em -0.14em var(--bn-glow), inset 0 -0.16em 0.3em -0.14em var(--bn-glow)
  -webkit-mask-image: linear-gradient(90deg, transparent, #000 20%, #000 80%, transparent)
  mask-image: linear-gradient(90deg, transparent, #000 20%, #000 80%, transparent)
  animation: bn-strip-in 0.42s $settle both

// One pass of light across the band as it opens.
.bn-sweep
  position: absolute
  top: 0
  bottom: 0
  left: 0
  width: 24%
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.16) 45%, var(--bn-glow) 50%, rgba(255, 255, 255, 0.16) 55%, transparent)
  transform: translateX(-120%) skewX(-24deg)
  animation: bn-sweep 0.9s cubic-bezier(0.4, 0, 0.2, 1) 0.08s both

.bn-line
  position: relative
  box-sizing: border-box
  width: 100%
  padding: 0 env(safe-area-inset-right, 0px) 0 env(safe-area-inset-left, 0px)
  line-height: $line
  text-align: center
  white-space: nowrap

.bn-text
  @extend %bn-type
  display: inline-block
  vertical-align: top
  color: var(--bn-ink)
  text-shadow: 0 0 0.035em var(--bn-hot), 0 0 0.16em var(--bn-glow), 0 0 0.48em var(--bn-deep), 0 0.05em 0.03em rgba(0, 0, 0, 0.85)
  animation: bn-text-in $in $settle both, bn-drift var(--bn-dur) linear both

// The same words at the reference size, never seen: what the fit measures.
.bn-measure
  @extend %bn-type
  position: absolute
  top: 0
  left: 0
  width: max-content
  visibility: hidden
  animation: none

@keyframes bn-strip-in
  from
    opacity: 0
    transform: scaleY(0.2)
@keyframes bn-sweep
  from
    transform: translateX(-120%) skewX(-24deg)
  to
    transform: translateX(440%) skewX(-24deg)
@keyframes bn-text-in
  from
    opacity: 0
    transform: scale(1.15)
    letter-spacing: var(--bn-ls-from)
    filter: blur(0.06em)
  to
    opacity: 1
    transform: scale(1)
    letter-spacing: var(--bn-ls)
    filter: blur(0)
// A slow push-in while it holds.
@keyframes bn-drift
  from
    scale: 1
  to
    scale: 1.035
@keyframes bn-band-out
  to
    opacity: 0

// Reduced motion: no zoom, no tracking, no sweep, no drift; it fades in and
// out on the same clock.
@media (prefers-reduced-motion: reduce)
  .bn-strip
    animation: bn-fade-in 0.3s ease-out both
  .bn-sweep
    display: none
  .bn-text
    animation: bn-fade-in 0.3s ease-out both
@keyframes bn-fade-in
  from
    opacity: 0
</style>
