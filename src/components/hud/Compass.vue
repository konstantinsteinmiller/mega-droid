<template lang="pug">
  div.compass(v-if="hud.phase === 'play' && hud.compass.length" aria-hidden="true")
    div.strip
      span.tick(v-for="i in 9" :key="i" :style="{ left: ((i - 1) / 8) * 100 + '%' }")
      span.mark(
        v-for="(m, i) in hud.compass"
        :key="i"
        :class="[m.kind, { edge: Math.abs(m.bearing) > HALF, left: m.bearing < 0, first: i === 0 }]"
        :style="{ left: pos(m.bearing) + '%' }"
      )
        span.pin
        //- Behind: an arrow off the strip's end says which way to turn.
        span.turn(v-if="Math.abs(m.bearing) > HALF && i === 0")
        span.dist {{ Math.round(m.dist) }}
</template>

<script setup lang="ts">
import { hud } from '@/game/state/hud'

/**
 * The objective compass: a strip across the top showing where objective
 * targets, the boss and (once done) the exit lie relative to the view.
 * ±80° maps across the strip; anything behind clamps to the edge, and the
 * first pin (the way to go) grows a pulsing arrow there: "turn this way".
 * A faded pin at the end of the strip went unread by every playtester.
 */
const HALF = (80 * Math.PI) / 180
const pos = (b: number) => 50 + (Math.max(-HALF, Math.min(HALF, b)) / HALF) * 50
</script>

<style scoped lang="sass">
.compass
  position: absolute
  left: 50%
  top: calc(env(safe-area-inset-top, 0px) + clamp(6px, 1.6vmin, 12px))
  transform: translateX(-50%)
  width: min(46vw, 360px)
  pointer-events: none
.strip
  position: relative
  height: clamp(16px, 3.4vmin, 22px)
  border-radius: 8px
  background: linear-gradient(90deg, transparent, rgba(11, 20, 51, 0.6) 15%, rgba(11, 20, 51, 0.6) 85%, transparent)
.tick
  position: absolute
  top: 30%
  bottom: 30%
  width: 2px
  margin-left: -1px
  background: rgba(255, 255, 255, 0.25)
.mark
  position: absolute
  top: 50%
  transform: translate(-50%, -50%)
  display: flex
  flex-direction: column
  align-items: center
.pin
  width: clamp(10px, 2.2vmin, 14px)
  height: clamp(10px, 2.2vmin, 14px)
  transform: rotate(45deg)
  border: 2px solid #141a33
  background: #8dff7a
  box-shadow: 0 0 8px rgba(141, 255, 122, 0.8)
.boss .pin
  background: #ff4a5a
  box-shadow: 0 0 8px rgba(255, 74, 90, 0.8)
.exit .pin
  background: #7ff4ff
  border-radius: 50%
  box-shadow: 0 0 8px rgba(127, 244, 255, 0.8)
.edge .pin
  opacity: 0.55
.edge.first .pin
  opacity: 1
.turn
  position: absolute
  top: 50%
  width: 0
  height: 0
  border-top: clamp(7px, 1.6vmin, 10px) solid transparent
  border-bottom: clamp(7px, 1.6vmin, 10px) solid transparent
  border-left: clamp(10px, 2.2vmin, 14px) solid #ffd84a
  filter: drop-shadow(0 0 4px rgba(255, 216, 74, 0.9)) drop-shadow(1px 1px 0 #141a33)
  left: calc(100% + 4px)
  transform: translateY(-50%)
  animation: turn-nudge 0.9s ease-in-out infinite
.left .turn
  left: auto
  right: calc(100% + 4px)
  transform: translateY(-50%) scaleX(-1)
@keyframes turn-nudge
  0%, 100%
    translate: 0 0
  50%
    translate: 4px 0
.left .turn
  animation-name: turn-nudge-left
@keyframes turn-nudge-left
  0%, 100%
    translate: 0 0
  50%
    translate: -4px 0
@media (prefers-reduced-motion: reduce)
  .turn
    animation: none
.dist
  position: absolute
  top: 100%
  margin-top: 2px
  font-family: var(--font-pixel)
  font-size: 8px
  color: #fff
  text-shadow: 1px 1px 0 #141a33
// A narrow landscape screen (phones, small tablets): the objective card and
// the status pills fill the top row (at 640 px the pills reach past the
// middle), so the strip drops under it, centred; the card keeps clear of it
// (ObjectiveTracker.vue) and the boss bar hangs under it (BossBar.vue).
@media (min-aspect-ratio: 1/1) and (max-width: 1100px)
  .compass
    top: calc(env(safe-area-inset-top, 0px) + clamp(8px, 2.2vmin, 18px) + clamp(36px, 8vmin, 48px) + 8px)
    width: 40vw
// Portrait: the top row is taken by the bars and the status pills, so the
// strip drops below it.
@media (max-aspect-ratio: 1/1)
  .compass
    top: calc(env(safe-area-inset-top, 0px) + clamp(8px, 2.2vmin, 18px) + clamp(36px, 8vmin, 48px) + 8px)
    width: min(62vw, 320px)
</style>
