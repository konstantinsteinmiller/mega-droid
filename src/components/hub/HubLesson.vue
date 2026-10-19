<template lang="pug">
  div.tour(v-if="visible" :class="device")
    //- The walk to the forge is guided in the hall itself (the golden trail
    //- on the floor, the forge's label pinned on screen): no dimming over a
    //- label that moves with every step. The spotlight starts at its panel.
    template(v-if="dimmed")
      //- Four blockers dim and fence off everything but the hole: only the
      //- step's own target can be pressed. A press anywhere else gets an
      //- answer: the live step pulses, so the dimmed screen never reads as a lock-up.
      div.block(v-for="(b, i) in blocks" :key="i" :style="b" @pointerdown.prevent.stop="nudge")
      div.hole(v-if="found" :style="holeStyle" :class="pulse" aria-hidden="true")
    //- The guide: a hand on touch, a cursor with a mouse. On screen from the
    //- step's first frame, it glides from target to target and taps.
    div.guide(v-if="dimmed && placed" :style="guideStyle" aria-hidden="true")
      //- (position) → .tip puts the fingertip / arrow tip on the point →
      //- .kick jumps on a pulse → .tap taps
      div.tip
        div.kick(:class="pulse")
          div.tap
            InputGlyph(v-if="device === 'touch'" kind="finger" mode="tap")
            svg.cursor(v-else viewBox="0 0 64 64")
              circle.ripple(cx="10" cy="6" r="10")
              path.arrow(d="M10 6 L10 46 L20 37 L27 53 L34 50 L27 34 L40 34 Z")
    //- The wallet top-up that makes the two upgrades affordable.
    div.grant(v-if="grantShown" :style="grantStyle" aria-hidden="true")
      div.grant-chip
        GameIcon.gi(name="nut")
        span +{{ grantShown }}
    //- Pip's catch-up: one short line — the gear has fallen behind.
    div.pip-say(v-if="hubLesson.catchUp && hubLesson.step === 'workshop'" role="status") {{ t('hubLesson.catchUp') }}
    span.sr(role="status" aria-live="polite") {{ t(`hubLesson.${hubLesson.step}`) }}
    button.skip(v-if="dimmed" type="button" :aria-label="t('close')" @click="endHubLesson()")
      GameIcon(name="close")
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import InputGlyph from '@/components/hud/InputGlyph.vue'
import GameIcon from '@/components/icons/GameIcon.vue'
import {
  hubLesson, hubTab, workshopSel, wantsHubLesson, startHubLesson, syncHubLesson, endHubLesson, stepTarget
} from './hubLesson'
import { equipped } from '@/game/state/profile'
import { flow } from '@/game/flow'
import { isAnyModalOpen } from '@/use/useModalState'
import { input, currentHub } from '@/game/boot'
import { sfx } from '@/game/audio/sfx'

/**
 * The first-return upgrade tour (see `hubLesson.ts`): the screen dims except
 * for one target, a hand points at it and taps, the player taps it, and the
 * next target lights. The hand is there from a step's first frame and stays
 * between steps; the target breathes the whole time, and a press on the
 * dimmed screen makes it pulse, so the tour never looks frozen. Words only
 * for screen readers. Steps end on the game's own state, so nothing here
 * counts time except the animations.
 */
const { t } = useI18n()

/** Anything else on top (level-up pick, options, leaderboard) wins; the
 *  tour waits underneath, invisible, and resumes afterwards. */
const blocked = computed(() => !!flow.modal || isAnyModalOpen.value || flow.loading || flow.screen !== 'hub')
const visible = computed(() => !!hubLesson.step && !blocked.value)
/** The spotlight is on: every step but the walk to the forge (`hubLesson.ts`:
 *  the hall's trail leads there while it is 'workshop'). */
const dimmed = computed(() => visible.value && hubLesson.step !== 'workshop')
const device = ref<'touch' | 'mouse'>(input.device)

// ── Start: the lab has been calm for a moment ──
let startTimer: number | null = null
const armStart = () => {
  if (startTimer !== null) { clearTimeout(startTimer); startTimer = null }
  if (hubLesson.step || blocked.value || !wantsHubLesson()) return
  startTimer = window.setTimeout(() => {
    startTimer = null
    if (hubLesson.step || blocked.value || !wantsHubLesson()) return
    device.value = input.device
    startHubLesson()
    // Placed before the tour's first render: its first frame already shows
    // the hole and the hand on the target, never a bare dimmed screen.
    measure()
    if (hubLesson.granted) {
      grantShown.value = hubLesson.granted
      sfx('loot')
      window.setTimeout(() => { grantShown.value = 0 }, 1800)
    }
  }, 900)
}
watch(blocked, armStart)

// ── Steps follow the game's state ──
watch(
  () => [hubTab.value, workshopSel.value, equipped('buster')?.upg, equipped('chest')?.upg] as const,
  (_, prev) => {
    const b0 = prev?.[2]
    const c0 = prev?.[3]
    const before = hubLesson.step
    syncHubLesson()
    // An upgrade inside the tour: Flux shows it off.
    if (before && (equipped('buster')?.upg !== b0 || equipped('chest')?.upg !== c0)) currentHub()?.celebrate()
  }
)

// ── Geometry: the hole and the hand follow the target every frame (tabs animate) ──
const rect = ref({ x: 0, y: 0, w: 0, h: 0 })
/** The target is on screen and fully shown: the hole opens around it. */
const found = ref(false)
/** The hand has a spot. It keeps it while the next target is still on its
 *  way in (the Workshop slides in), so it never leaves during the tour. */
const placed = ref(false)
const guide = ref({ x: 0, y: 0 })
const grantShown = ref(0)
const boltsAt = ref({ x: 0, y: 0 })
let raf = 0
let scrolledAt = -1e9
const PAD = 8

/** The nearest ancestor that scrolls vertically, if any. */
const scrollParent = (el: HTMLElement): HTMLElement | null => {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY
    if ((o === 'auto' || o === 'scroll') && p.scrollHeight > p.clientHeight + 1) return p
  }
  return null
}
/** Fully visible: inside the window and inside its scrolling sheet. */
const shownIn = (r: DOMRect, el: HTMLElement): boolean => {
  const sp = scrollParent(el)
  const top = sp ? Math.max(0, sp.getBoundingClientRect().top) : 0
  const bottom = sp ? Math.min(window.innerHeight, sp.getBoundingClientRect().bottom) : window.innerHeight
  return r.top >= top - 1 && r.bottom <= bottom + 1
}

/** Where the hole and the hand go for the current step. Every frame, and also
 *  the moment a step or the tour appears, ahead of its first frame. */
const measure = (): void => {
  // The wallet (the grant chip hangs under it), on the walk too.
  const b = document.querySelector<HTMLElement>('[data-lesson="bolts"]')?.getBoundingClientRect()
  if (b) boltsAt.value = { x: b.left + b.width / 2, y: b.bottom }
  if (!hubLesson.step || hubLesson.step === 'workshop') return
  const el = document.querySelector<HTMLElement>(stepTarget(hubLesson.step))
  const r = el?.getBoundingClientRect()
  if (!el || !r || r.width === 0) {
    // Not there yet: everything stays dimmed, and the hand waits where it
    // last pointed.
    found.value = false
    return
  }
  // A target below the fold of a scrolling sheet (portrait: the Workshop's
  // upgrade button, a row of the gear list) is scrolled into view first —
  // a hole around something clipped would point at whatever covers it.
  if (!shownIn(r, el) && performance.now() - scrolledAt > 450) {
    scrolledAt = performance.now()
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    found.value = false
    return
  }
  const x = r.left - PAD
  const y = r.top - PAD
  const w = r.width + PAD * 2
  const h = r.height + PAD * 2
  const cur = rect.value
  if (cur.x !== x || cur.y !== y || cur.w !== w || cur.h !== h) rect.value = { x, y, w, h }
  // The hand taps the button itself when the lit block holds more (the
  // upgrade block also shows what the upgrade buys).
  const tap = (el.matches('button') ? el : el.querySelector('button'))?.getBoundingClientRect() ?? r
  const gx = tap.left + tap.width * 0.62
  const gy = tap.top + tap.height * 0.6
  if (guide.value.x !== gx || guide.value.y !== gy) guide.value = { x: gx, y: gy }
  found.value = true
  placed.value = true
}
const track = () => {
  raf = requestAnimationFrame(track)
  measure()
}
// Back from under a modal: placed again before the tour's first frame.
watch(visible, (v) => { if (v) measure() })
// A new step: measured once the DOM has caught up; the hand glides over. The
// tour over: the hand goes with it.
watch(() => hubLesson.step, (s) => {
  if (s && s !== 'workshop') {
    measure()
    return
  }
  found.value = false
  placed.value = false
}, { flush: 'post' })

// ── A press on the dimmed screen: the live step answers ──
// The hand jumps and the ring flashes. The class alternates so that every
// press restarts the animation, and clears once it has played.
const pulse = ref<'' | 'pulse-a' | 'pulse-b'>('')
let pulseTimer: number | null = null
const nudge = (): void => {
  pulse.value = pulse.value === 'pulse-a' ? 'pulse-b' : 'pulse-a'
  if (pulseTimer !== null) clearTimeout(pulseTimer)
  pulseTimer = window.setTimeout(() => {
    pulse.value = ''
    pulseTimer = null
  }, 800)
}

const blocks = computed(() => {
  if (!found.value) return [{ left: '0', top: '0', width: '100%', height: '100%' }]
  const { x, y, w, h } = rect.value
  return [
    { left: '0', top: '0', width: '100%', height: `${Math.max(0, y)}px` },
    { left: '0', top: `${y + h}px`, width: '100%', bottom: '0' },
    { left: '0', top: `${y}px`, width: `${Math.max(0, x)}px`, height: `${h}px` },
    { left: `${x + w}px`, top: `${y}px`, right: '0', height: `${h}px` }
  ]
})
const holeStyle = computed(() => {
  const { x, y, w, h } = rect.value
  return { transform: `translate(${x}px, ${y}px)`, width: `${w}px`, height: `${h}px` }
})
const guideStyle = computed(() => ({ transform: `translate(${guide.value.x}px, ${guide.value.y}px)` }))
const grantStyle = computed(() => ({ transform: `translate(${boltsAt.value.x}px, ${boltsAt.value.y}px)` }))

onMounted(() => {
  raf = requestAnimationFrame(track)
  armStart()
})
onUnmounted(() => {
  cancelAnimationFrame(raf)
  if (startTimer !== null) clearTimeout(startTimer)
  if (pulseTimer !== null) clearTimeout(pulseTimer)
})
</script>

<style scoped lang="sass">
.pip-say
  position: absolute
  left: 50%
  top: calc(env(safe-area-inset-top, 0px) + clamp(60px, 14vh, 110px))
  transform: translateX(-50%)
  max-width: min(84vw, 420px)
  padding: 0.5em 0.9em
  border-radius: 1em
  border: 3px solid #141a33
  background: #ffffff
  color: #141a33
  font-family: var(--font-ui)
  font-size: clamp(13px, 2.8vmin, 17px)
  box-shadow: 0 0 0 2px #ffd84a, 0 4px 0 rgba(20, 26, 51, 0.4)
  pointer-events: none
  z-index: 3
.tour
  position: fixed
  inset: 0
  z-index: 30
  pointer-events: none
.block
  position: absolute
  background: rgba(6, 12, 34, 0.66)
  pointer-events: auto
  transition: all 0.35s cubic-bezier(0.3, 1.2, 0.4, 1)
.hole
  position: absolute
  left: 0
  top: 0
  border-radius: 16px
  box-shadow: 0 0 0 3px #ffffff, 0 0 18px 4px rgba(127, 244, 255, 0.85)
  transition: transform 0.35s cubic-bezier(0.3, 1.2, 0.4, 1), width 0.35s, height 0.35s
  animation: hole-breathe 1.2s ease-in-out infinite
  // A soft ring keeps rolling out of the target: the dimmed screen is never
  // still, whatever the player does.
  &::before
    content: ''
    position: absolute
    inset: 0
    border-radius: inherit
    animation: halo 1.8s ease-out infinite
  // The answer to a press on the dimmed screen: the target flashes and a
  // bright ring bursts out of it.
  &::after
    content: ''
    position: absolute
    inset: 0
    border-radius: inherit
    opacity: 0
  &.pulse-a::after
    animation: flash-a 0.7s ease-out
  &.pulse-b::after
    animation: flash-b 0.7s ease-out
.guide
  position: absolute
  left: 0
  top: 0
  width: clamp(54px, 11vmin, 76px)
  height: clamp(54px, 11vmin, 76px)
  // No fade-in: the hand is simply there on a step's first frame, then
  // glides to each new target.
  transition: transform 0.4s cubic-bezier(0.2, 0.8, 0.3, 1)
  filter: drop-shadow(0 4px 0 rgba(20, 26, 51, 0.6))
.tip
  width: 100%
  height: 100%
.touch .tip
  transform: translate(-50%, -11%)
.mouse .tip
  transform: translate(-16%, -9%)
.kick
  width: 100%
  height: 100%
  &.pulse-a
    animation: kick-a 0.6s ease-out
  &.pulse-b
    animation: kick-b 0.6s ease-out
// The jump scales about the fingertip / arrow tip, so it keeps pointing.
.touch .kick
  transform-origin: 50% 11%
.mouse .kick
  transform-origin: 16% 9%
.tap
  width: 100%
  height: 100%
  animation: guide-tap 1.1s ease-in-out infinite
.cursor
  width: 100%
  height: 100%
  overflow: visible
.arrow
  fill: #f4f7ff
  stroke: #141a33
  stroke-width: 4
  stroke-linejoin: round
.ripple
  fill: none
  stroke: #ffffff
  stroke-width: 3
  transform-box: fill-box
  transform-origin: center
  animation: ripple 1.1s ease-out infinite
.grant
  position: absolute
  left: 0
  top: 0
.grant-chip
  display: flex
  align-items: center
  gap: 4px
  transform: translateX(-50%)
  padding: 4px 10px
  border-radius: 999px
  border: 3px solid #141a33
  background: linear-gradient(#fff3a0, #ffd23a)
  color: #141a33
  font-family: var(--font-pixel)
  font-size: clamp(11px, 2.4vmin, 14px)
  animation: grant-rise 1.8s ease-out forwards
  .gi
    width: 16px
    height: 16px
// Top centre: the one spot no step ever points at (the tabs fill the bottom
// corners — in portrait the Workshop tab sat right under a corner button).
.skip
  position: absolute
  left: 50%
  top: calc(env(safe-area-inset-top, 0px) + 10px)
  transform: translateX(-50%)
  width: 40px
  height: 40px
  padding: 9px
  border-radius: 50%
  border: 3px solid #141a33
  background: rgba(244, 247, 255, 0.85)
  color: #141a33
  pointer-events: auto
  opacity: 0.8
.sr
  position: absolute
  width: 1px
  height: 1px
  overflow: hidden
  clip: rect(0 0 0 0)
@keyframes hole-breathe
  50%
    box-shadow: 0 0 0 5px #ffffff, 0 0 30px 10px rgba(127, 244, 255, 0.9)
@keyframes halo
  0%
    box-shadow: 0 0 0 0 rgba(127, 244, 255, 0.55)
  100%
    box-shadow: 0 0 0 18px rgba(127, 244, 255, 0)
// Two copies of each pulse: swapping the name restarts it on every press.
@each $n in a, b
  @keyframes flash-#{$n}
    0%
      opacity: 1
      background: rgba(191, 246, 255, 0.35)
      box-shadow: 0 0 0 4px #ffffff, 0 0 30px 12px rgba(127, 244, 255, 0.95)
    100%
      opacity: 0
      background: rgba(191, 246, 255, 0)
      box-shadow: 0 0 0 34px rgba(127, 244, 255, 0), 0 0 44px 20px rgba(127, 244, 255, 0)
  @keyframes kick-#{$n}
    0%, 100%
      transform: translateY(0) scale(1)
    20%
      transform: translateY(-12px) scale(1.3)
    45%
      transform: translateY(3px) scale(0.92)
    70%
      transform: translateY(-4px) scale(1.1)
  // Reduced motion: the same answer as a flash that stays put.
  @keyframes glow-#{$n}
    0%
      opacity: 1
      background: rgba(191, 246, 255, 0.35)
      box-shadow: 0 0 0 5px #ffffff, 0 0 30px 12px rgba(127, 244, 255, 0.95)
    100%
      opacity: 0
      background: rgba(191, 246, 255, 0)
      box-shadow: 0 0 0 5px #ffffff, 0 0 30px 12px rgba(127, 244, 255, 0.95)
@keyframes guide-tap
  0%, 55%, 100%
    transform: translate(0, 0) scale(1)
  25%
    transform: translate(-2px, 5px) scale(0.92)
@keyframes ripple
  0%, 20%
    transform: scale(0.3)
    opacity: 0
  30%
    opacity: 1
  100%
    transform: scale(2.2)
    opacity: 0
@keyframes grant-rise
  0%
    transform: translate(-50%, 18px) scale(0.4)
    opacity: 0
  18%
    transform: translate(-50%, 8px) scale(1.15)
    opacity: 1
  30%
    transform: translate(-50%, 6px) scale(1)
  80%
    opacity: 1
  100%
    transform: translate(-50%, -6px)
    opacity: 0
@media (prefers-reduced-motion: reduce)
  .hole, .hole::before, .tap, .ripple, .kick.pulse-a, .kick.pulse-b
    animation: none
  .hole.pulse-a::after
    animation: glow-a 0.7s ease-out
  .hole.pulse-b::after
    animation: glow-b 0.7s ease-out
</style>
