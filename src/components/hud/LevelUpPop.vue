<template lang="pug">
  //- The Hard Hat's level-up act (`state/celebrate.ts`): vector, so it is as
  //- sharp as the text at any pixel ratio. Decorative: the toast says it.
  div.lvl-pop(
    v-if="act"
    ref="el"
    :key="act.id"
    :class="{ reduced: act.reduced }"
    :style="{ '--dur': `${ms}ms` }"
    aria-hidden="true"
    data-celebrate="levelUp"
    data-zone="celebrate"
  )
    svg(viewBox="0 -44 120 168" xmlns="http://www.w3.org/2000/svg")
      defs
        clipPath#lvl-dome
          path(d="M16 80 A44 42 0 0 1 104 80 Z")
      g.hop
        //- Feet, body, face.
        ellipse(cx="43" cy="114" rx="13" ry="7" fill="#ff7a1f" :stroke="INK" stroke-width="3")
        ellipse(cx="77" cy="114" rx="13" ry="7" fill="#ff7a1f" :stroke="INK" stroke-width="3")
        ellipse(cx="60" cy="94" rx="31" ry="21" fill="#4a5570" :stroke="INK" stroke-width="3")
        g.eyes
          ellipse(cx="49" cy="90" rx="7.5" ry="8.5" fill="#fff" :stroke="INK" stroke-width="2")
          ellipse(cx="71" cy="90" rx="7.5" ry="8.5" fill="#fff" :stroke="INK" stroke-width="2")
          g.pupils
            circle(cx="50" cy="91" r="3.6" :fill="INK")
            circle(cx="70" cy="91" r="3.6" :fill="INK")
        circle(cx="60" cy="104" r="6" fill="#2a3042" stroke="#ff7a1f" stroke-width="2.6")
        //- The prize: a green up-arrow badge, kept under the helmet until it
        //- comes out.
        g.prize
          g.sparks
            path(d="M60 -38 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3z" fill="#ffd84a")
            path(d="M24 -14 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z" fill="#8dff7a")
            path(d="M96 -18 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z" fill="#ffd84a")
          circle(cx="60" cy="0" r="19" fill="#2fd25a" :stroke="INK" stroke-width="3")
          circle(cx="60" cy="0" r="14.5" fill="none" stroke="#b6ffb0" stroke-width="2" opacity="0.7")
          path(d="M60 -11 L71 1 H64.5 V11 H55.5 V1 H49 Z" fill="#fff" :stroke="INK" stroke-width="2" stroke-linejoin="round")
        //- The helmet: yellow dome, the deep stripe, brim and knob.
        g.helmet
          path(d="M16 80 A44 42 0 0 1 104 80 Z" fill="#ffc21a")
          rect(x="53" y="36" width="14" height="46" fill="#e08a00" clip-path="url(#lvl-dome)")
          path(d="M16 80 A44 42 0 0 1 104 80 Z" fill="none" :stroke="INK" stroke-width="3")
          rect(x="11" y="76" width="98" height="10" rx="5" fill="#e08a00" :stroke="INK" stroke-width="3")
          circle(cx="60" cy="38" r="6" fill="#e08a00" :stroke="INK" stroke-width="3")
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { celebrations, celebrationMs } from '@/game/state/celebrate'
import { addHudTicker } from '@/game/state/hud'
import { ZONE_GAP, zones } from './hudLayout'

/** Flux levelled up: the Hard Hat tips its helmet and holds up the arrow. */
const INK = '#141a33'
const act = computed(() => (celebrations.current?.kind === 'levelUp' ? celebrations.current : null))
const ms = computed(() => (act.value ? celebrationMs(act.value) : 0))

// Just under the compass as measured (its marks can hang below the strip),
// with headroom for the badge and sparks, which rise above the box at the
// top of the hop; the CSS top stands in while there is no compass.
/** How far the act rises above its box, as a share of its width. */
const RISE = 0.3
const el = ref<HTMLElement | null>(null)
let off: (() => void) | null = null
onMounted(() => {
  off = addHudTicker(() => {
    const b = el.value
    if (!b) return
    const c = zones.rects.compass
    const top = c ? `${(c.y + c.h + ZONE_GAP + b.offsetWidth * RISE).toFixed(0)}px` : ''
    if (b.style.top !== top) b.style.top = top
  })
})
onUnmounted(() => off?.())
</script>

<style scoped lang="sass">
// Top centre, just under the compass (placed from its measured zone; Atlas's
// bubble keeps off this one): clear of the crosshair, the bars and the
// objective card. Never takes a click.
.lvl-pop
  position: absolute
  left: 50%
  top: calc(env(safe-area-inset-top, 0px) + clamp(30px, 6vmin, 44px))
  width: clamp(84px, 17vmin, 140px)
  transform: translateX(-50%)
  pointer-events: none
  z-index: 6
  svg
    display: block
    width: 100%
    height: auto
    overflow: visible
    filter: drop-shadow(0 3px 0 rgba(20, 26, 51, 0.45))
  g
    transform-box: fill-box
.hop
  transform-origin: 50% 100%
  animation: lvl-hop var(--dur) linear both
.helmet
  transform-origin: 0% 100%
  animation: lvl-helmet var(--dur) ease-in-out both
.prize
  transform-origin: 50% 50%
  animation: lvl-prize var(--dur) ease-out both
.sparks
  transform-origin: 50% 50%
  animation: lvl-sparks var(--dur) ease-out both
.pupils
  animation: lvl-look var(--dur) ease-in-out both

// 0–14 % pops up out of nowhere; 14–30 % the helmet tips open; 24–42 % the
// arrow comes out and up; 42–76 % held up proudly (wiggle, bounce); 76–86 %
// the helmet drops back; 86–100 % a hop and out.
@keyframes lvl-hop
  0%
    transform: translateY(70%) scale(0.2, 0.2)
    opacity: 0
  8%
    transform: translateY(-6%) scale(1.12, 0.9)
    opacity: 1
  12%
    transform: translateY(2%) scale(0.94, 1.08)
  16%, 44%
    transform: translateY(0) scale(1, 1)
  50%
    transform: translateY(-5%) scale(1.03, 0.97)
  56%
    transform: translateY(0) scale(1, 1)
  62%
    transform: translateY(-5%) scale(1.03, 0.97)
  68%, 84%
    transform: translateY(0) scale(1, 1)
  88%
    transform: translateY(2%) scale(1.14, 0.84)
    opacity: 1
  94%
    transform: translateY(-34%) scale(0.92, 1.1) rotate(8deg)
    opacity: 1
  100%
    transform: translateY(-10%) translateX(60%) scale(0.5) rotate(24deg)
    opacity: 0
@keyframes lvl-helmet
  0%, 16%
    transform: translate(0, 0) rotate(0deg)
  24%
    transform: translate(-4%, -22%) rotate(-30deg)
  30%, 72%
    transform: translate(-6%, -18%) rotate(-24deg)
  80%
    transform: translate(0, 2%) rotate(3deg)
  84%, 100%
    transform: translate(0, 0) rotate(0deg)
@keyframes lvl-prize
  0%, 22%
    transform: translateY(160%) scale(0.4)
    opacity: 0
  26%
    opacity: 1
  36%
    transform: translateY(-14%) scale(1.18)
  42%
    transform: translateY(0) scale(1) rotate(0deg)
  48%
    transform: translateY(-6%) rotate(-10deg)
  54%
    transform: translateY(0) rotate(9deg)
  60%
    transform: translateY(-6%) rotate(-8deg)
  66%
    transform: translateY(0) rotate(6deg)
  72%
    transform: translateY(0) scale(1) rotate(0deg)
    opacity: 1
  80%
    transform: translateY(-40%) scale(1.25)
    opacity: 0
  100%
    transform: translateY(-40%) scale(1.25)
    opacity: 0
@keyframes lvl-sparks
  0%, 36%
    transform: scale(0.3) rotate(0deg)
    opacity: 0
  44%
    transform: scale(1.1) rotate(20deg)
    opacity: 1
  70%
    transform: scale(1) rotate(50deg)
    opacity: 1
  78%, 100%
    transform: scale(1.4) rotate(70deg)
    opacity: 0
@keyframes lvl-look
  0%, 26%
    transform: translate(0, 0)
  34%, 74%
    transform: translate(0, -2.6px)
  80%, 100%
    transform: translate(0, 0)

// Reduced motion: the finished pose (helmet tipped, arrow up), faded in and
// out. Nothing travels.
.reduced
  .hop
    animation: lvl-fade var(--dur) ease-in-out both
  .helmet
    animation: none
    transform: translate(-6%, -18%) rotate(-24deg)
  .prize
    animation: none
  .sparks
    animation: none
    opacity: 0
  .pupils
    animation: none
    transform: translate(0, -2.6px)
@keyframes lvl-fade
  0%, 100%
    opacity: 0
  20%, 80%
    opacity: 1
</style>
