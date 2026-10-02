<template lang="pug">
  div.cutscene-layer.no-os-ui(:dir="dir")
    //- Everything that moves is painted by the HUD ticker from `cineLive`
    //- (direct style writes, the game loop's clock): ads, a hidden tab and a
    //- platform pause freeze it with the scene.
    div.blur(ref="blurEl" aria-hidden="true")
    div.cutin(ref="cutinEl" aria-hidden="true")
    div.rewind(ref="rewindEl" aria-hidden="true")
      div.scan(ref="scanEl")
      div.atlas-glyph.corner(ref="cornerEl")
    div.vex-bubble(v-if="cine.vex" ref="bubbleEl" aria-hidden="true")
      span.vex-text {{ t(`story.vex.${cine.vex}`) }}
    div.fp-hud(ref="hudEl" aria-hidden="true")
      div.hp
        div.cells
        div.lit
          div.fill(ref="hpFillEl")
      div.lv(ref="lvEl") {{ t('hud.level', { n: 1 }) }}
      div.atlas-slot(ref="slotEl")
        div.atlas-glyph(ref="slotGlyphEl")
    div.tag.fort(ref="fortEl" aria-hidden="true") {{ t('hub.levels', { a: 18, b: 26 }) }}
    div.tag.scrap(ref="scrapEl" aria-hidden="true") {{ t('hub.levels', { a: 1, b: 4 }) }}
    div.atlas-line(v-if="cine.atlas" ref="atlasEl" :key="cine.atlasSeq" aria-hidden="true")
      div.atlas-glyph(ref="atlasGlyphEl")
      span.atlas-text {{ t(`story.atlas.${cine.atlas}`) }}
    div.lids(aria-hidden="true")
      div.lid.top(ref="lidTopEl")
      div.lid.bottom(ref="lidBottomEl")
    div.black(ref="blackEl" aria-hidden="true")
    div.flash(ref="flashEl" aria-hidden="true")
      div.logo(ref="logoEl" v-html="LOGO_SVG")
    //- Skip: a labelled button, bottom corner (thumb reach on a phone); with a
    //- keyboard, also "hold Space", its ring filling as it is held.
    Transition(name="skip")
      div.skip-dock(v-if="cine.skip")
        div.hold-hint(v-if="keyboard" ref="holdEl" aria-hidden="true")
          span.hold-key
            svg.hold-ring(viewBox="0 0 48 48")
              circle.ring-track(cx="24" cy="24" r="21")
              circle.ring-fill(ref="ringEl" cx="24" cy="24" r="21" pathLength="1")
            span.spacebar
          span.hold-text {{ t('ui.holdToSkip', { key: t('pause.keys.space') }) }}
        button.cutscene-skip(
          type="button"
          aria-keyshortcuts="Escape"
          @click.stop="skipCutscene()"
          @pointerdown.stop
        )
          span.skip-label {{ t('ui.skip') }}
          span.skip-icon(aria-hidden="true")
            GameIcon(name="skip-forward")
    div.sr-only(aria-live="polite") {{ cine.line ? t(`story.intro.${cine.line}`) : '' }}
    //- The start gate: no press on the page yet, so the browser would mute
    //- the film's opening. The whole screen is the button.
    Transition(name="gate")
      button.start-gate(
        v-if="cine.gate"
        type="button"
        @click.stop="openGate()"
        @pointerdown.stop
      )
        span.gate-glow(aria-hidden="true")
        span.gate-logo(v-html="LOGO_SVG" aria-hidden="true")
        span.gate-cta
          span.gate-icon(aria-hidden="true")
            GameIcon(name="play")
          span.gate-label {{ t(keyboard ? 'ui.clickToStart' : 'ui.tapToStart') }}
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { addHudTicker } from '@/game/state/hud'
import { cine, cineLive, openGate, skipCutscene } from '@/game/story/cine'
import { ATLAS_HOLD, VEX_ON, ramp } from '@/game/story/introScript'
import GameIcon from '@/components/icons/GameIcon.vue'
import { LOGO_SVG } from './logoLockup'

/**
 * ─── The intro's screen layer ────────────────────────────────────────────────
 *
 * What the 3D scene cannot draw by itself: the tape-rewind tear with Atlas's
 * glyph, Dr. Vex's gilded speech bubble (anchored to his hologram), Blaze
 * Master's cut-in frame, the first-person eyelids and focus blur, the HUD
 * booting (the 28-cell bar ticking full, `Lv 1`, Atlas's slot), the
 * hologram's level tags, Atlas's captions, the white flash and the logo.
 *
 * The skip button ("Skip ⏭", bottom right in the safe area, from 0.5 s) is
 * the only control: a labelled pill with a thumb-sized target, never taking
 * focus by itself. With a keyboard (a fine pointer, or any key pressed) a
 * "hold Space to skip" hint sits beside it: a space-bar cap in a ring that
 * fills while Space is held and empties when it is let go (`holdSkip.ts`,
 * stepped by the cutscene; `GameScene` routes the key). `Esc` skips at once.
 * A tap anywhere else only unlocks the sound (the audio gate's window
 * listener does that) — this layer swallows it, so nothing underneath
 * reacts. The screen-reader line for each shot is announced through the
 * `aria-live` region.
 */
const { t, locale } = useI18n()
const dir = computed(() => (locale.value === 'ar' ? 'rtl' : 'ltr'))

/** A keyboard is likely (a mouse or trackpad), or one was just used. */
const keyboard = ref(typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches)
const onAnyKey = (): void => {
  if (!keyboard.value) keyboard.value = true
}
const holdEl = ref<HTMLElement | null>(null)
const ringEl = ref<SVGCircleElement | null>(null)

const blurEl = ref<HTMLElement | null>(null)
const cutinEl = ref<HTMLElement | null>(null)
const rewindEl = ref<HTMLElement | null>(null)
const scanEl = ref<HTMLElement | null>(null)
const cornerEl = ref<HTMLElement | null>(null)
const bubbleEl = ref<HTMLElement | null>(null)
const hudEl = ref<HTMLElement | null>(null)
const hpFillEl = ref<HTMLElement | null>(null)
const lvEl = ref<HTMLElement | null>(null)
const slotEl = ref<HTMLElement | null>(null)
const slotGlyphEl = ref<HTMLElement | null>(null)
const fortEl = ref<HTMLElement | null>(null)
const scrapEl = ref<HTMLElement | null>(null)
const atlasEl = ref<HTMLElement | null>(null)
const atlasGlyphEl = ref<HTMLElement | null>(null)
const lidTopEl = ref<HTMLElement | null>(null)
const lidBottomEl = ref<HTMLElement | null>(null)
const blackEl = ref<HTMLElement | null>(null)
const flashEl = ref<HTMLElement | null>(null)
const logoEl = ref<HTMLElement | null>(null)

/** A pop: overshoot then settle, over `len` seconds from `age` 0. */
const pop = (age: number, len = 0.32): number => {
  if (age <= 0) return 0
  if (age >= len) return 1
  const k = age / len
  return k < 0.55 ? (k / 0.55) * 1.14 : 1.14 - 0.14 * ((k - 0.55) / 0.45)
}

const show = (el: HTMLElement | null, o: number): void => {
  if (!el) return
  el.style.opacity = o.toFixed(3)
  el.style.visibility = o > 0.001 ? 'visible' : 'hidden'
}

let off: (() => void) | null = null
let lastHold = -1
onMounted(() => {
  window.addEventListener('keydown', onAnyKey)
  off = addHudTicker(() => {
    const L = cineLive
    const tt = L.t
    const w = window.innerWidth
    const h = window.innerHeight
    show(blackEl.value, L.black)
    // Rewind: the tear jitters sideways; Atlas's ring spins in the corner.
    show(rewindEl.value, L.rewind)
    if (L.rewind > 0 && scanEl.value) scanEl.value.style.transform = `translate3d(${(Math.sin(tt * 97) * 6).toFixed(1)}px, ${((tt * 900) % 8).toFixed(1)}px, 0)`
    if (cornerEl.value) cornerEl.value.style.transform = `rotate(${(tt * 420) % 360}deg)`
    show(cutinEl.value, L.cutin)
    // Vex's bubble, anchored to his hologram, kept on screen.
    const b = bubbleEl.value
    if (b) {
      const s = pop(tt - VEX_ON - 0.1, 0.36)
      const bw = b.offsetWidth
      const bh = b.offsetHeight
      const x = Math.min(Math.max(L.bubbleX * w, 12), w - bw - 12)
      const y = Math.min(Math.max(L.bubbleY * h - bh, 12 + h * 0.06), h - bh - 12)
      b.style.transform = `translate3d(${x.toFixed(0)}px, ${y.toFixed(0)}px, 0) scale(${s.toFixed(3)}) rotate(${((1 - Math.min(1, s)) * -8).toFixed(2)}deg)`
    }
    // First person: eyelids, focus, the HUD booting.
    const lid = L.eyelid
    if (lidTopEl.value) lidTopEl.value.style.transform = `translate3d(0, ${((lid - 1) * 100).toFixed(1)}%, 0)`
    if (lidBottomEl.value) lidBottomEl.value.style.transform = `translate3d(0, ${((1 - lid) * 100).toFixed(1)}%, 0)`
    if (blurEl.value) {
      const px = L.blur * (Math.min(w, h) / 1080)
      const f = px > 0.05 ? `blur(${px.toFixed(2)}px)` : 'none'
      if (blurEl.value.style.backdropFilter !== f) {
        blurEl.value.style.backdropFilter = f
        blurEl.value.style.setProperty('-webkit-backdrop-filter', f)
      }
    }
    show(hudEl.value, L.hud)
    if (hpFillEl.value) {
      // The classic tick-fill: whole cells, one at a time.
      const cells = Math.round(L.hp * 28) / 28
      hpFillEl.value.style.transform = `scaleX(${Math.max(0.0001, cells).toFixed(4)})`
    }
    if (lvEl.value) {
      lvEl.value.style.transform = `scale(${pop(L.lv * 0.32, 0.32).toFixed(3)})`
      lvEl.value.style.opacity = L.lv > 0 ? '1' : '0'
    }
    show(slotEl.value, L.glyph)
    if (slotGlyphEl.value) slotGlyphEl.value.style.transform = `rotate(${((tt * (120 + 600 * (1 - L.glyph))) % 360).toFixed(1)}deg) scale(${(0.4 + 0.6 * L.glyph).toFixed(3)})`
    // The hologram's tags.
    const tag = (el: HTMLElement | null, o: number, x: number, y: number): void => {
      show(el, o)
      if (el && o > 0) el.style.transform = `translate3d(${(x * w).toFixed(0)}px, ${(y * h).toFixed(0)}px, 0) translate(-50%, -100%) scale(${pop(o * 0.3, 0.3).toFixed(3)})`
    }
    tag(fortEl.value, L.tagFortress, L.fortX, L.fortY)
    tag(scrapEl.value, L.tagScrap, L.scrapX, L.scrapY)
    // Atlas's caption: in, hold, out.
    if (atlasEl.value) {
      const age = tt - L.atlasAt
      show(atlasEl.value, ramp(0, 0.15, age) * (1 - ramp(ATLAS_HOLD - 0.3, ATLAS_HOLD, age)))
      atlasEl.value.style.transform = `translate(-50%, ${((1 - ramp(0, 0.2, age)) * 10).toFixed(1)}px)`
    }
    if (atlasGlyphEl.value) atlasGlyphEl.value.style.transform = `rotate(${((tt * 300) % 360).toFixed(1)}deg)`
    // The flash, and the logo stamped onto it.
    // The hold-to-skip ring (written only when it moves).
    if (ringEl.value && L.hold !== lastHold) {
      lastHold = L.hold
      ringEl.value.style.strokeDashoffset = (1 - L.hold).toFixed(4)
      holdEl.value?.classList.toggle('held', L.hold > 0)
    }
    show(flashEl.value, L.flash)
    if (logoEl.value) {
      logoEl.value.style.opacity = L.logo.toFixed(3)
      logoEl.value.style.transform = `scale(${(1.35 - 0.35 * L.logo).toFixed(3)})`
    }
  })
})
onUnmounted(() => {
  off?.()
  window.removeEventListener('keydown', onAnyKey)
})
</script>

<style scoped lang="sass">
// ── The start gate ──
.start-gate
  position: absolute
  inset: 0
  z-index: 30
  display: flex
  flex-direction: column
  align-items: center
  justify-content: center
  gap: clamp(18px, 5vmin, 44px)
  margin: 0
  padding: 0
  border: 0
  background: radial-gradient(ellipse at 50% 42%, #24306e 0%, #141a33 55%, #0a0d1f 100%)
  color: #fff
  font-family: var(--font-ui)
  cursor: pointer
  touch-action: manipulation
  -webkit-tap-highlight-color: transparent
  &:focus-visible .gate-cta
    outline: 3px solid #ffd84a
    outline-offset: 4px
.gate-glow
  position: absolute
  left: 50%
  top: 42%
  width: min(90vmin, 620px)
  aspect-ratio: 1
  transform: translate(-50%, -50%)
  border-radius: 50%
  background: radial-gradient(circle, rgba(255, 180, 60, 0.28), rgba(255, 180, 60, 0) 65%)
  pointer-events: none
  animation: gate-breathe 2.4s ease-in-out infinite
.gate-logo
  position: relative
  width: min(56vmin, 340px)
  filter: drop-shadow(0 6px 0 rgba(8, 10, 24, 0.55))
  :deep(svg)
    display: block
    width: 100%
    height: auto
.gate-cta
  position: relative
  display: inline-flex
  align-items: center
  gap: 0.55em
  min-height: 56px
  padding: 0.55em 1.5em 0.55em 1.1em
  border-radius: 999px
  border: 3px solid #141a33
  background: linear-gradient(#ffd84a, #ffb020)
  box-shadow: 0 5px 0 #141a33, 0 0 0 4px rgba(255, 216, 74, 0.25)
  color: #141a33
  font-size: clamp(18px, 4.2vmin, 28px)
  font-weight: 700
  letter-spacing: 0.02em
  line-height: 1.1
  animation: gate-pulse 1.3s ease-in-out infinite
.gate-icon
  display: inline-flex
  width: 1.15em
  height: 1.15em
.start-gate:active .gate-cta
  transform: translateY(3px)
  box-shadow: 0 2px 0 #141a33, 0 0 0 4px rgba(255, 216, 74, 0.25)
  animation: none
.gate-leave-active
  transition: opacity 0.35s ease
.gate-leave-to
  opacity: 0
@keyframes gate-pulse
  50%
    transform: scale(1.06)
@keyframes gate-breathe
  50%
    opacity: 0.6
    transform: translate(-50%, -50%) scale(1.08)
@media (prefers-reduced-motion: reduce)
  .gate-cta, .gate-glow
    animation: none
.no-os-ui
  caret-color: transparent
  user-select: none
  -webkit-user-select: none
  -webkit-touch-callout: none
  -webkit-tap-highlight-color: transparent
.cutscene-layer
  position: absolute
  inset: 0
  overflow: hidden
  z-index: 5
  pointer-events: auto
  touch-action: none
  font-family: var(--font-ui)
.blur, .cutin, .rewind, .black, .flash, .lids
  position: absolute
  inset: 0
  pointer-events: none
.black
  background: #000
.flash
  background: #fff
  display: grid
  place-items: center
  visibility: hidden
.logo
  width: min(62vw, 46vh, 420px)
  opacity: 0
  :deep(svg)
    display: block
    width: 100%
    height: auto
    filter: drop-shadow(0 6px 0 rgba(20, 26, 51, 0.25))

// ── The tape rewind: scan-lines, a cyan cast, Atlas's ring in a corner ──
.rewind
  visibility: hidden
  background: rgba(40, 200, 255, 0.18)
  mix-blend-mode: screen
.scan
  position: absolute
  inset: -12px
  background: repeating-linear-gradient(180deg, rgba(160, 250, 255, 0.35) 0, rgba(160, 250, 255, 0.35) 2px, transparent 2px, transparent 8px)
  will-change: transform
.corner
  position: absolute
  top: calc(env(safe-area-inset-top, 0px) + clamp(14px, 3vmin, 26px))
  left: calc(env(safe-area-inset-left, 0px) + clamp(14px, 3vmin, 26px))
  width: clamp(28px, 6vmin, 44px)
  height: clamp(28px, 6vmin, 44px)
.atlas-glyph
  border-radius: 50%
  border: 3px solid #7ff4ff
  border-top-color: transparent
  box-shadow: 0 0 10px rgba(127, 244, 255, 0.8), inset 0 0 6px rgba(127, 244, 255, 0.6)
  box-sizing: border-box

// ── Blaze Master's cut-in: a red comic frame, slashed ──
.cutin
  visibility: hidden
  border: clamp(6px, 1.4vmin, 12px) solid #ff2d3f
  box-shadow: inset 0 0 0 4px #141a33, inset 0 0 60px rgba(255, 45, 63, 0.55)
  background: linear-gradient(115deg, rgba(20, 26, 51, 0.9) 0 9%, transparent 9% 91%, rgba(20, 26, 51, 0.9) 91%)

// ── Dr. Vex's bubble: ornate, gilded and red ──
.vex-bubble
  position: absolute
  left: 0
  top: 0
  max-width: min(64vw, 420px)
  padding: 0.65em 1.1em 0.7em
  background: radial-gradient(ellipse at 50% 30%, #c4162c, #6a0714 80%)
  color: #fff4d6
  border: 3px solid #ffd35a
  outline: 3px solid #6a0714
  box-shadow: 0 0 0 6px #ffd35a33, 0 6px 0 rgba(20, 0, 6, 0.55), 0 0 26px rgba(255, 45, 63, 0.55)
  border-radius: 1.4em 1.4em 1.4em 0.3em
  font-size: clamp(14px, 3.1vmin, 24px)
  line-height: 1.2
  letter-spacing: 0.02em
  text-align: center
  text-shadow: 0 2px 0 #3a0008
  transform-origin: 0% 100%
  pointer-events: none
  will-change: transform
  &::before, &::after
    content: ''
    position: absolute
    width: 10px
    height: 10px
    background: #ffd35a
    transform: rotate(45deg)
    top: -7px
  &::before
    left: 18%
  &::after
    right: 18%
.vex-text
  display: -webkit-box
  -webkit-line-clamp: 3
  -webkit-box-orient: vertical
  overflow: hidden
  overflow-wrap: anywhere

// ── The first-person HUD booting ──
.fp-hud
  position: absolute
  top: calc(env(safe-area-inset-top, 0px) + clamp(12px, 2.6vmin, 22px))
  left: calc(env(safe-area-inset-left, 0px) + clamp(12px, 2.6vmin, 22px))
  display: flex
  align-items: center
  gap: clamp(8px, 1.8vmin, 14px)
  visibility: hidden
  pointer-events: none
.hp
  position: relative
  width: clamp(140px, 30vmin, 260px)
  height: clamp(14px, 3vmin, 22px)
  border: 3px solid #141a33
  border-radius: 6px
  background: #0b1433
  box-sizing: border-box
.cells, .lit
  position: absolute
  inset: 3px
  -webkit-mask-image: repeating-linear-gradient(90deg, #000 0, #000 calc((100% - 54px) / 28), transparent calc((100% - 54px) / 28), transparent calc((100% - 54px) / 28 + 2px))
  mask-image: repeating-linear-gradient(90deg, #000 0, #000 calc((100% - 54px) / 28), transparent calc((100% - 54px) / 28), transparent calc((100% - 54px) / 28 + 2px))
.cells
  background: rgba(255, 255, 255, 0.08)
.fill
  width: 100%
  height: 100%
  background: linear-gradient(180deg, #fff6c8, #ffa733 60%, #e07a10)
  transform-origin: 0 50%
  transform: scaleX(0)
[dir="rtl"] .fill
  transform-origin: 100% 50%
.lv
  padding: 0.12em 0.5em
  border: 3px solid #141a33
  border-radius: 0.6em
  background: #ffd84a
  color: #141a33
  font-size: clamp(12px, 2.6vmin, 18px)
  line-height: 1
  opacity: 0
.atlas-slot
  width: clamp(24px, 5vmin, 36px)
  height: clamp(24px, 5vmin, 36px)
  visibility: hidden
  .atlas-glyph
    width: 100%
    height: 100%

// ── The hologram's level tags ──
.tag
  position: absolute
  left: 0
  top: 0
  padding: 0.15em 0.55em
  border-radius: 0.5em
  font-size: clamp(12px, 2.5vmin, 18px)
  line-height: 1.1
  white-space: nowrap
  visibility: hidden
  pointer-events: none
  &.fort
    background: rgba(106, 7, 20, 0.85)
    color: #ffd6dc
    border: 2px solid #ff2d3f
  &.scrap
    background: rgba(8, 40, 64, 0.85)
    color: #dffcff
    border: 2px solid #7ff4ff

// ── Atlas's captions: calm, cyan, low in the frame ──
.atlas-line
  position: absolute
  left: 50%
  // Low in the frame, but always clear above the skip dock's row, which a
  // centred caption can reach on a narrow or portrait screen.
  bottom: calc(env(safe-area-inset-bottom, 0px) + max(clamp(18px, 7vh, 60px), clamp(12px, 2.6vmin, 22px) + 62px))
  display: flex
  align-items: center
  gap: 0.55em
  max-width: min(86vw, 520px)
  padding: 0.4em 0.9em 0.45em 0.6em
  border-radius: 999px
  background: rgba(6, 22, 40, 0.78)
  border: 2px solid rgba(127, 244, 255, 0.75)
  color: #dffcff
  font-size: clamp(13px, 2.8vmin, 20px)
  line-height: 1.15
  visibility: hidden
  pointer-events: none
  .atlas-glyph
    flex: none
    width: 1.15em
    height: 1.15em
    border-width: 2px

// ── Eyelids ──
.lid
  position: absolute
  left: 0
  right: 0
  height: 51%
  background: #000
  will-change: transform
  &.top
    top: 0
    transform: translate3d(0, -100%, 0)
  &.bottom
    bottom: 0
    transform: translate3d(0, 100%, 0)

// ── Skip: bottom right, clear of the safe area, a thumb-sized target ──
.skip-dock
  position: absolute
  bottom: calc(env(safe-area-inset-bottom, 0px) + clamp(12px, 2.6vmin, 22px))
  inset-inline-end: calc(max(env(safe-area-inset-left, 0px), env(safe-area-inset-right, 0px)) + clamp(12px, 2.6vmin, 22px))
  display: flex
  align-items: center
  gap: clamp(10px, 2vmin, 16px)
  z-index: 2
.cutscene-skip
  display: inline-flex
  align-items: center
  gap: 0.45em
  min-width: 48px
  min-height: 48px
  padding: 0 1em 0 1.1em
  box-sizing: border-box
  border-radius: 999px
  border: 2px solid rgba(255, 255, 255, 0.7)
  background: rgba(20, 26, 51, 0.72)
  color: #fff
  font-family: var(--font-ui)
  font-size: clamp(15px, 2.6vmin, 19px)
  line-height: 1
  letter-spacing: 0.02em
  cursor: pointer
  touch-action: manipulation
  transition: background 0.15s, border-color 0.15s
  @media (hover: hover)
    &:hover
      background: rgba(40, 52, 96, 0.9)
      border-color: #fff
  &:active
    background: rgba(40, 52, 96, 0.95)
  &:focus-visible
    outline: 3px solid #ffd84a
    outline-offset: 2px
.skip-icon
  display: block
  width: 1.1em
  height: 1.1em
  :deep(svg)
    display: block
    width: 100%
    height: 100%
[dir="rtl"] .skip-icon
  transform: scaleX(-1)
.hold-hint
  display: inline-flex
  align-items: center
  gap: 0.5em
  padding: 0.3em 0.8em 0.3em 0.3em
  border-radius: 999px
  background: rgba(20, 26, 51, 0.55)
  color: rgba(255, 255, 255, 0.85)
  font-size: clamp(13px, 2.1vmin, 16px)
  line-height: 1.1
  white-space: nowrap
  pointer-events: none
[dir="rtl"] .hold-hint
  padding: 0.3em 0.3em 0.3em 0.8em
.hold-key
  position: relative
  display: grid
  place-items: center
  width: 44px
  height: 44px
  flex: none
.hold-ring
  position: absolute
  inset: 0
  width: 100%
  height: 100%
  // The fill starts at twelve o'clock and runs clockwise.
  transform: rotate(-90deg)
  circle
    fill: none
    stroke-width: 4
  .ring-track
    stroke: rgba(255, 255, 255, 0.22)
  .ring-fill
    stroke: #ffd84a
    stroke-linecap: round
    stroke-dasharray: 1
    stroke-dashoffset: 1
// The space bar: a bar in a cap (shapes, never words — as `KeyCap.vue`).
.spacebar
  position: relative
  width: 24px
  height: 12px
  border-radius: 3px
  background: #f4f7ff
  border: 2px solid #141a33
  box-shadow: 0 2px 0 #141a33
  box-sizing: border-box
  &::after
    content: ''
    position: absolute
    left: 3px
    right: 3px
    bottom: 2px
    height: 2px
    border-radius: 1px
    background: #9aa6c8
// Held: the cap pressed down, lit, and the words brighten.
.hold-hint.held
  color: #fff
  .spacebar
    transform: translateY(2px)
    box-shadow: none
    background: #ffd84a
.skip-enter-active, .skip-leave-active
  transition: opacity 0.25s
.skip-enter-from, .skip-leave-to
  opacity: 0
@media (prefers-reduced-motion: reduce)
  .skip-enter-active, .skip-leave-active, .cutscene-skip
    transition: none

.sr-only
  position: absolute
  width: 1px
  height: 1px
  margin: -1px
  overflow: hidden
  clip: rect(0 0 0 0)
  white-space: nowrap
</style>
