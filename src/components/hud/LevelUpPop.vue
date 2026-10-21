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
    svg(viewBox="6 -44 120 168" xmlns="http://www.w3.org/2000/svg")
      g.hop
        //- After models/enemies.ts buildHardhat in a three-quarter turn, the
        //- same drawing as the loader mini-game's hard hat (public/js/mini-game.js):
        //- the slate body, the orange feet, two eyes, the orange muzzle ring.
        ellipse(cx="63.4" cy="93.7" rx="30.7" ry="27.3" fill="#2f3850")
        ellipse(cx="60.3" cy="90.4" rx="27.0" ry="23.5" fill="#4a5570")
        ellipse(cx="52.7" cy="80.6" rx="10.4" ry="5.5" fill="#5d6a85")
        ellipse(cx="63.4" cy="93.7" rx="30.7" ry="27.3" fill="none" :stroke="INK" stroke-width="3")
        ellipse(cx="39.5" cy="113.7" rx="15.1" ry="7.3" fill="#c25a00")
        ellipse(cx="38.0" cy="112.8" rx="13.3" ry="6.3" fill="#ff7a1f")
        ellipse(cx="39.5" cy="113.7" rx="15.1" ry="7.3" fill="none" :stroke="INK" stroke-width="3")
        ellipse(cx="68.6" cy="113.7" rx="16.9" ry="8.3" fill="#c25a00")
        ellipse(cx="66.9" cy="112.7" rx="14.9" ry="7.2" fill="#ff7a1f")
        ellipse(cx="62.7" cy="109.7" rx="5.7" ry="1.7" fill="#ffa060")
        ellipse(cx="68.6" cy="113.7" rx="16.9" ry="8.3" fill="none" :stroke="INK" stroke-width="3")
        g.eyes
          ellipse(cx="33.8" cy="82.8" rx="6.2" ry="9.6" fill="#eef0f4" :stroke="INK" stroke-width="2")
          ellipse(cx="49.9" cy="82.8" rx="8.3" ry="9.6" fill="#eef0f4" :stroke="INK" stroke-width="2")
          g.pupils
            ellipse(cx="31.9" cy="84.1" rx="3.1" ry="5.5" fill="#0b1433")
            ellipse(cx="30.6" cy="81.5" rx="1.4" ry="1.6" fill="#fff")
            ellipse(cx="47.4" cy="84.1" rx="4.2" ry="5.5" fill="#0b1433")
            ellipse(cx="45.7" cy="81.5" rx="1.4" ry="1.6" fill="#fff")
        ellipse(cx="34.8" cy="101.9" rx="7.5" ry="9.4" fill="#ff7a1f" :stroke="INK" stroke-width="2.6")
        ellipse(cx="34.0" cy="101.9" rx="3.6" ry="5.5" fill="#2a3042")
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
        //- The helmet: the yellow dome on its rolled brim (the far half behind
        //- the dome, the near half over it), the knob.
        g.helmet
          g(transform="translate(1 -6.5) rotate(14 71 70)")
            ellipse(cx="69.9" cy="71.3" rx="44.2" ry="7.5" fill="#262b3a")
            path(d="M22.3 71.9 A48.9 9.4 0 0 1 120.1 71.9" fill="none" :stroke="INK" stroke-width="15.6" stroke-linecap="round")
            path(d="M22.3 71.9 A48.9 9.4 0 0 1 120.1 71.9" fill="none" stroke="#e39a0c" stroke-width="9.9" stroke-linecap="round")
            path(d="M22.3 69.8 A48.9 9.4 0 0 1 120.1 69.8" fill="none" stroke="#f4bf40" stroke-width="2.6" stroke-linecap="round")
            path(d="M25.7 70.3 A45.5 46.8 0 0 1 116.7 70.3 Z" fill="#c98600")
            path(d="M27.0 69.5 A40.6 44.2 0 0 1 108.1 69.5 Z" fill="#e6a614")
            ellipse(cx="53.0" cy="39.1" rx="11.4" ry="6.2" fill="#ffd866")
            path(d="M25.7 70.3 A45.5 46.8 0 0 1 116.7 70.3 Z" fill="none" :stroke="INK" stroke-width="3")
            path(d="M22.3 71.9 A48.9 9.4 0 0 0 120.1 71.9" fill="none" :stroke="INK" stroke-width="15.6" stroke-linecap="round")
            path(d="M22.3 71.9 A48.9 9.4 0 0 0 120.1 71.9" fill="none" stroke="#e39a0c" stroke-width="9.9" stroke-linecap="round")
            path(d="M22.3 69.8 A48.9 9.4 0 0 0 120.1 69.8" fill="none" stroke="#f4bf40" stroke-width="2.6" stroke-linecap="round")
            ellipse(cx="71.2" cy="23.5" rx="7.8" ry="6.8" fill="#b06a00")
            ellipse(cx="70.4" cy="22.7" rx="6.9" ry="5.8" fill="#e39a0c")
            ellipse(cx="71.2" cy="23.5" rx="7.8" ry="6.8" fill="none" :stroke="INK" stroke-width="3")
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
  transform-origin: 100% 100%
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
    transform: translate(18%, -24%) rotate(30deg)
  30%, 72%
    transform: translate(20%, -20%) rotate(24deg)
  80%
    transform: translate(0, 2%) rotate(-3deg)
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
    transform: translate(20%, -20%) rotate(24deg)
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
