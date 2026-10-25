<template lang="pug">
  //- A lesson's held moment (`hud.blockCue` / `hud.slideCue`): time stands
  //- still until one input is pressed, so the rest of the view goes dark and
  //- only that input shows through — its HUD button (with its key on a
  //- desktop) and the bouncing mouse / Space glyph (`InputCue`).
  Transition(name="spot")
    svg.freeze-spot(v-if="act" aria-hidden="true" :viewBox="`0 0 ${vw} ${vh}`" preserveAspectRatio="none")
      defs
        mask#freeze-spot-mask(maskUnits="userSpaceOnUse" x="0" y="0" :width="vw" :height="vh")
          rect(x="0" y="0" :width="vw" :height="vh" fill="#fff")
          circle(v-for="(h, i) in holes" :key="i" :cx="h.x" :cy="h.y" :r="h.r" fill="url(#freeze-spot-soft)")
        radialGradient#freeze-spot-soft
          stop(offset="0.78" stop-color="#000")
          stop(offset="1" stop-color="#fff")
      rect(x="0" y="0" :width="vw" :height="vh" fill="rgba(4, 6, 16, 0.72)" mask="url(#freeze-spot-mask)")
      circle.ring(v-for="(h, i) in holes" :key="`r${i}`" :cx="h.x" :cy="h.y" :r="h.r * 0.8")
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { hud } from '@/game/state/hud'

interface Hole { x: number, y: number, r: number }

/** The HUD button the held moment waits on (`ActionButtons`' data-spot). */
const act = computed(() => hud.phase !== 'play' ? '' : hud.blockCue ? 'block' : hud.slideCue ? 'slide' : '')
const vw = ref(window.innerWidth)
const vh = ref(window.innerHeight)
const holes = ref<Hole[]>([])

const holeOf = (el: Element | null, pad: number): Hole | null => {
  if (!el) return null
  const r = el.getBoundingClientRect()
  if (r.width <= 0 || r.height <= 0) return null
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: (Math.hypot(r.width, r.height) / 2 + pad) / 0.78 }
}
// Followed every frame: the glyph bounces and the layout can turn.
let raf = 0
const step = (): void => {
  vw.value = window.innerWidth
  vh.value = window.innerHeight
  const out: Hole[] = []
  const btn = holeOf(document.querySelector(`[data-spot="${act.value}"]`), 10)
  if (btn) out.push(btn)
  const cue = holeOf(document.querySelector('.input-cue'), 14)
  if (cue) out.push(cue)
  holes.value = out
  raf = requestAnimationFrame(step)
}
watch(act, a => {
  cancelAnimationFrame(raf)
  if (a) step()
}, { immediate: true })
onUnmounted(() => cancelAnimationFrame(raf))
</script>

<style scoped lang="sass">
.freeze-spot
  position: absolute
  inset: 0
  width: 100%
  height: 100%
  z-index: 3
  pointer-events: none
.ring
  fill: none
  stroke: #ffd84a
  stroke-width: 3
  filter: drop-shadow(0 0 6px rgba(255, 216, 74, 0.9))
  animation: spot-pulse 1s ease-in-out infinite
  transform-box: fill-box
  transform-origin: center
@keyframes spot-pulse
  50%
    opacity: 0.45
    transform: scale(1.06)
.spot-enter-active, .spot-leave-active
  transition: opacity 0.25s
.spot-enter-from, .spot-leave-to
  opacity: 0
@media (prefers-reduced-motion: reduce)
  .ring
    animation: none
</style>
