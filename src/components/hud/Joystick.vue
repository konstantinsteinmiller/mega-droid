<template lang="pug">
  div.joy(ref="root" aria-hidden="true")
    //- The resting stick: always there on touch, faint, low on the left — so
    //- the movement control can be SEEN before it is found. A press on it
    //- grabs it by its centre (`engine/input.ts`); in use, it steps aside
    //- for the live stick below.
    div.joy-home(ref="home" v-show="resting" :class="{ hidden: busy, demo: demoMove }")
      div.joy-home-knob
    div.joy-base(ref="base")
      div.joy-knob(ref="knob")
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { addHudTicker, hud } from '@/game/state/hud'
import { input } from '@/game/boot'

/**
 * The joystick's visuals. The logic lives in `engine/input.ts`; the live stick
 * only mirrors it with direct DOM writes from the HUD ticker (never through
 * Vue reactivity — it moves every frame).
 *
 * The resting stick reports its centre and grab radius to the input record
 * whenever the layout changes, so a touch on it and the picture of it agree.
 */
const root = ref<HTMLElement | null>(null)
const home = ref<HTMLElement | null>(null)
const base = ref<HTMLElement | null>(null)
const knob = ref<HTMLElement | null>(null)
/** The resting stick is part of the touch HUD, in play. */
const resting = computed(() => hud.device === 'touch' && hud.phase === 'play')
/** The live stick is out: the resting one fades away under it. */
const busy = ref(false)
let off: (() => void) | null = null
let shown = false

/** A touch this much wider than the drawn ring still grabs it. */
const GRAB = 1.35

const place = (): void => {
  const r = root.value
  const h = home.value
  if (!r || !h || !resting.value) {
    input.joyHomeR = 0
    return
  }
  const a = r.getBoundingClientRect()
  const b = h.getBoundingClientRect()
  if (b.width === 0) { input.joyHomeR = 0; return }
  input.joyHomeX = b.left + b.width / 2 - a.left
  input.joyHomeY = b.top + b.height / 2 - a.top
  input.joyHomeR = (b.width / 2) * GRAB
}
const placeSoon = (): void => { void nextTick(place) }

let ro: ResizeObserver | null = null
onMounted(() => {
  placeSoon()
  window.addEventListener('resize', placeSoon)
  window.addEventListener('orientationchange', placeSoon)
  if (typeof ResizeObserver === 'function' && root.value) {
    ro = new ResizeObserver(placeSoon)
    ro.observe(root.value)
  }
  off = addHudTicker(() => {
    const b = base.value
    const k = knob.value
    if (!b || !k) return
    if (input.joyActive !== shown) {
      shown = input.joyActive
      busy.value = shown
      b.style.opacity = shown ? '1' : '0'
    }
    if (!shown) return
    b.style.transform = `translate(${input.joyOriginX}px, ${input.joyOriginY}px)`
    const m = Math.min(1, Math.hypot(input.joyX, input.joyY))
    const a = Math.atan2(input.joyY, input.joyX)
    k.style.transform = `translate(${Math.cos(a) * m * 100}%, ${Math.sin(a) * m * 100}%)`
  })
})
watch(resting, placeSoon)
onUnmounted(() => {
  off?.()
  ro?.disconnect()
  window.removeEventListener('resize', placeSoon)
  window.removeEventListener('orientationchange', placeSoon)
  input.joyHomeR = 0
})
/** A lesson hologram walks (the gap's): the stick's resting ring lights gold. */
const demoMove = computed(() => hud.holoAct === 'move' && hud.holoDown)
</script>

<style scoped lang="sass">
.joy-home.demo
  box-shadow: 0 0 0 4px #ffd84a, 0 0 20px rgba(255, 216, 74, 0.9)
  opacity: 1 !important
.joy
  position: absolute
  inset: 0
  pointer-events: none
// Centred on --joy-home-x / --joy-home-y (set on the HUD layer, shared with
// the coach's move glyph): far enough from both edges that a full push of the
// stick, finger and all, stays on the glass.
.joy-home
  position: absolute
  left: calc(env(safe-area-inset-left, 0px) + var(--joy-home-x))
  bottom: calc(env(safe-area-inset-bottom, 0px) + var(--joy-home-y))
  width: 112px
  height: 112px
  margin: 0 0 -56px -56px
  border-radius: 50%
  background: radial-gradient(circle, rgba(20, 40, 90, 0.12) 0%, rgba(20, 40, 90, 0.22) 70%)
  border: 3px solid rgba(160, 225, 255, 0.4)
  opacity: 0.55
  transition: opacity 0.15s
  &.hidden
    opacity: 0
.joy-home-knob
  position: absolute
  left: 50%
  top: 50%
  width: 50px
  height: 50px
  margin: -25px 0 0 -25px
  border-radius: 50%
  background: radial-gradient(circle at 38% 32%, rgba(191, 243, 255, 0.7) 0%, rgba(60, 200, 255, 0.55) 45%, rgba(31, 95, 232, 0.5) 100%)
  border: 3px solid rgba(20, 26, 51, 0.5)
.joy-base
  position: absolute
  left: 0
  top: 0
  width: 112px
  height: 112px
  margin: -56px 0 0 -56px
  border-radius: 50%
  background: radial-gradient(circle, rgba(20, 40, 90, 0.18) 0%, rgba(20, 40, 90, 0.34) 70%)
  border: 3px solid rgba(160, 225, 255, 0.55)
  box-shadow: 0 0 18px rgba(80, 200, 255, 0.25), inset 0 0 12px rgba(80, 200, 255, 0.25)
  opacity: 0
  transition: opacity 0.12s
  will-change: transform
.joy-knob
  position: absolute
  left: 50%
  top: 50%
  width: 50px
  height: 50px
  margin: -25px 0 0 -25px
  border-radius: 50%
  background: radial-gradient(circle at 38% 32%, #bff3ff 0%, #3cc8ff 45%, #1f5fe8 100%)
  border: 3px solid #141a33
  box-shadow: 0 3px 0 rgba(0, 0, 0, 0.35)
  will-change: transform
</style>
