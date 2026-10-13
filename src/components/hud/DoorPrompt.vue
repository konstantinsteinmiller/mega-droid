<template lang="pug">
  div.door-prompt(v-show="!flow.modal && !isGamePaused" ref="rootEl" :aria-hidden="on ? 'false' : 'true'")
    div.dp-head
      div.dp-label(ref="labelEl" role="status") {{ t(labelKey, { weapon: weaponName, lesson: lessonName }) }}
      div.dp-arrow(ref="arrowEl" aria-hidden="true")
        svg(viewBox="0 0 40 40")
          path.dp-arrow-body(:d="ARROW")
    div.dp-edge(ref="edgeEl" aria-hidden="true")
      svg(viewBox="0 0 40 40")
        path.dp-arrow-body(:d="ARROW")
    div.dp-glyph(ref="glyphEl" aria-hidden="true")
      div.dp-glyph-box(ref="glyphBoxEl")
        InputGlyph(v-if="input" v-bind="glyphProps")
        span.dp-badge(v-if="input")
          GameIcon(:name="input.icon")
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { hud, addHudTicker } from '@/game/state/hud'
import { currentMission } from '@/game/boot'
import { flow } from '@/game/flow'
import { isGamePaused } from '@/use/useGamePause'
import { bearingOf } from '@/game/state/damageFeed'
import { doorInput, promptArrow, type ArrowPose } from '@/game/sim/doorPrompt'
import type { WalkNeed } from '@/game/sim/walkthrough'
import InputGlyph from './InputGlyph.vue'
import GameIcon from '@/components/icons/GameIcon.vue'

/**
 * "Finish the lesson" at a tutorial door held shut until its room's lesson
 * is done (`sim/doorPrompt.ts` says when, the mission's `doorView` what):
 * the label in the top third, a red arrow toward the lesson — under the
 * label while it is ahead, turning live with the view, on the screen's side
 * while it is behind — and, on the door itself, the glyph of the input its
 * step needs (the coach's glyph language), pulsing on every bump.
 *
 * Direct style writes from the HUD ticker, like the locator: the only
 * reactive parts are the glyph's need and the on/off state, written when
 * they change.
 */
const { t } = useI18n()

/** An arrow pointing up (the drawing's 0 rad), with a navy outline. */
const ARROW = 'M20 3 L36 21 H26.5 V37 H13.5 V21 H4 Z'

const rootEl = ref<HTMLElement | null>(null)
const labelEl = ref<HTMLElement | null>(null)
const arrowEl = ref<HTMLElement | null>(null)
const edgeEl = ref<HTMLElement | null>(null)
const glyphEl = ref<HTMLElement | null>(null)
const glyphBoxEl = ref<HTMLElement | null>(null)

const need = ref<WalkNeed | ''>('')
/** "Finish the Tutorial first" at the first gate, "Finish the lesson" later. */
const labelKey = ref('walk.finishLesson')
/** The weapon a beam-in room's lesson is about ("Finish the lesson on …"). */
const weaponId = ref('')
const weaponName = computed(() => (weaponId.value ? t(`weapon.${weaponId.value}.name`) : ''))
/** What a tutorial gate waits for, in the objective card's words ("Finish
 *  first: Break the crate"): the crate's step used to borrow the charge
 *  lesson's name, so a player who had learned the charge shot was told to
 *  finish it (playtest 2026-10-06). */
const lessonName = computed(() => {
  const n = need.value
  if (!n || n === 'weapon') return ''
  return t(`objective.walk.${n === 'rest' ? 'gel' : n}`)
})
/** On screen (the label is read out only then). */
const on = ref(false)
const input = computed(() => (need.value ? doorInput(need.value, hud.device) : null))
/** The glyph's props, without the badge's icon (unset ones keep their defaults). */
const glyphProps = computed(() => {
  const i = input.value
  if (!i) return { kind: 'mouse' as const }
  return { kind: i.kind, button: i.button, hold: i.hold, click: i.click, code: i.code, litKey: i.litKey, wide: i.wide, mode: i.mode }
})

const pt = { x: 0, y: 0, visible: false }
const pose: ArrowPose = { rot: 0, edge: 0 }
let shown = false
let pulseSeen = 0
let off: (() => void) | null = null

/** Replay a one-shot CSS animation. */
const replay = (el: HTMLElement | null): void => {
  if (!el) return
  el.classList.remove('pulse')
  void el.offsetWidth
  el.classList.add('pulse')
}

const place = (): void => {
  const m = currentMission()
  const v = m?.doorView
  const root = rootEl.value
  const arrow = arrowEl.value
  const edge = edgeEl.value
  const glyph = glyphEl.value
  if (!root || !arrow || !edge || !glyph) return
  if (!m || !v || v.alpha <= 0.001 || hud.phase !== 'play') {
    if (shown) {
      root.style.opacity = '0'
      // Gone, not just clear: at opacity 0 its last "Finish first: …" stayed
      // in the page's text to the end of the tutorial (playtest 2026-10-07).
      root.style.visibility = 'hidden'
      shown = false
      on.value = false
    }
    return
  }
  if (v.need !== need.value) need.value = v.need
  if (v.label !== labelKey.value) labelKey.value = v.label
  if (v.weapon !== weaponId.value) weaponId.value = v.weapon
  root.style.opacity = v.alpha.toFixed(3)
  if (!shown) {
    on.value = true
    root.style.visibility = 'visible'
  }
  shown = true
  if (v.pulse !== pulseSeen) {
    pulseSeen = v.pulse
    replay(glyphBoxEl.value)
    replay(labelEl.value)
  }
  const w = window.innerWidth
  const h = window.innerHeight
  const p = m.player
  // The arrow: under the label while the lesson is ahead, on the side it
  // is on while it is behind.
  if (v.goal) {
    promptArrow(v.gx, v.gz, p.x, p.z, p.yaw, pose)
    if (pose.edge === 0) {
      arrow.style.opacity = '1'
      arrow.style.transform = `rotate(${pose.rot.toFixed(3)}rad)`
      edge.style.opacity = '0'
    } else {
      const mx = Math.max(40, w * 0.05)
      const x = pose.edge > 0 ? w - mx : mx
      arrow.style.opacity = '0'
      edge.style.opacity = '1'
      edge.style.transform = `translate3d(${x.toFixed(1)}px, ${(h * 0.46).toFixed(1)}px, 0) translate(-50%, -50%) rotate(${pose.rot.toFixed(3)}rad)`
    }
  } else {
    arrow.style.opacity = '0'
    edge.style.opacity = '0'
  }
  // The door's glyph, on the door while it is on screen: below the label,
  // clear of the thumbs, however close the door is.
  m.project(v.x, v.y, v.z, pt)
  const cam = m.camera
  const halfFov = (cam.fov * cam.aspect * Math.PI) / 360
  if (!pt.visible || Math.abs(bearingOf(v.x, v.z, p.x, p.z, p.yaw)) > halfFov * 1.05) {
    glyph.style.opacity = '0'
    return
  }
  const x = Math.min(w * 0.86, Math.max(w * 0.14, pt.x))
  const y = Math.min(h * 0.66, Math.max(h * 0.42, pt.y))
  glyph.style.opacity = '1'
  glyph.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`
}

onMounted(() => { off = addHudTicker(place) })
onUnmounted(() => { off?.() })
</script>

<style scoped lang="sass">
$red: #ff4a5a
// The way to the lesson is blue (the game's "go here" colour): the red
// label says "not yet", the blue arrow says where to instead.
$blue: #3cc8ff
$navy: #141a33
.door-prompt
  position: absolute
  inset: 0
  opacity: 0
  // Out of the page's text too until it first shows (place()).
  visibility: hidden
  pointer-events: none
  z-index: 2
  will-change: opacity
// Near the centre, in the top third: under the top row, over the crosshair.
// A phone held upright stacks the objective under the bars: lower there.
.dp-head
  position: absolute
  left: 50%
  top: clamp(84px, 21%, 220px)
  @media (orientation: portrait)
    top: clamp(84px, 27%, 300px)
  transform: translateX(-50%)
  width: min(88vw, 30em)
  display: flex
  flex-direction: column
  align-items: center
  gap: clamp(6px, 1.4vmin, 12px)
.dp-label
  max-width: 100%
  padding: 0.32em 0.95em 0.38em
  border: 2px solid $red
  border-radius: 12px
  background: rgba(20, 26, 51, 0.86)
  box-shadow: 0 0 0 3px rgba(20, 26, 51, 0.55), 0 0 18px rgba(255, 74, 90, 0.55)
  font-family: var(--font-ui)
  font-size: clamp(16px, 3.9vmin, 26px)
  line-height: 1.2
  letter-spacing: 0.03em
  color: #fff
  text-align: center
  text-shadow: 0 2px 0 $navy
  // Two lines at most, on the narrowest phone, in the longest language.
  display: -webkit-box
  -webkit-box-orient: vertical
  -webkit-line-clamp: 2
  line-clamp: 2
  overflow: hidden
  overflow-wrap: anywhere
.dp-arrow, .dp-edge
  width: clamp(34px, 7vmin, 52px)
  height: clamp(34px, 7vmin, 52px)
  filter: drop-shadow(0 0 6px rgba(255, 74, 90, 0.75))
  will-change: transform, opacity
  svg
    display: block
    width: 100%
    height: 100%
    overflow: visible
// On the edge it is the only cue on that side of the screen: bigger.
.dp-edge
  position: absolute
  left: 0
  top: 0
  width: clamp(44px, 10vmin, 68px)
  height: clamp(44px, 10vmin, 68px)
  opacity: 0
.dp-arrow-body
  fill: $blue
  stroke: $navy
  stroke-width: 3
  stroke-linejoin: round
.dp-glyph
  position: absolute
  left: 0
  top: 0
  opacity: 0
  will-change: transform, opacity
.dp-glyph-box
  position: relative
  width: clamp(58px, 12vmin, 88px)
  height: clamp(58px, 12vmin, 88px)
  padding: 8%
  box-sizing: border-box
  transform: translate(-50%, -50%)
  border: 2px solid $red
  border-radius: 16px
  background: rgba(20, 26, 51, 0.72)
  box-shadow: 0 0 14px rgba(255, 74, 90, 0.45)
// The action's icon on the glyph's corner: which button, on touch.
.dp-badge
  position: absolute
  right: -12%
  bottom: -12%
  width: 42%
  height: 42%
  padding: 6%
  box-sizing: border-box
  border-radius: 50%
  background: $red
  border: 2px solid $navy
  color: #fff
  display: flex
  :deep(svg)
    width: 100%
    height: 100%
.pulse.dp-glyph-box
  animation: dp-pulse 0.55s cubic-bezier(0.2, 1.4, 0.4, 1)
.pulse.dp-label
  animation: dp-nudge 0.45s ease-out
@keyframes dp-pulse
  0%
    transform: translate(-50%, -50%) scale(1)
  35%
    transform: translate(-50%, -50%) scale(1.28)
    box-shadow: 0 0 26px rgba(255, 74, 90, 0.95)
  100%
    transform: translate(-50%, -50%) scale(1)
@keyframes dp-nudge
  0%, 100%
    translate: 0 0
  25%
    translate: -6px 0
  50%
    translate: 5px 0
  75%
    translate: -3px 0
@media (prefers-reduced-motion: reduce)
  .pulse.dp-glyph-box, .pulse.dp-label
    animation: none
</style>
