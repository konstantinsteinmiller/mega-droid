<template lang="pug">
  //- The block lesson's held shot on a desktop (`hud.blockCue`): time stands
  //- still with the Trooper's shot a hand's breadth away, and under the
  //- crosshair a mouse presses its right button, over and over, bouncing for
  //- attention — press it now. (On a phone the block button itself bounces
  //- under yellow arrows: `ActionButtons`.)
  div.block-cue(v-if="hud.phase === 'play' && hud.blockCue && hud.device === 'mouse'" aria-hidden="true")
    div.bounce
      span.arrow
      InputGlyph(kind="mouse" button="right" click)
</template>

<script setup lang="ts">
import { hud } from '@/game/state/hud'
import InputGlyph from './InputGlyph.vue'
</script>

<style scoped lang="sass">
.block-cue
  position: absolute
  left: 50%
  top: 62%
  z-index: 4
  height: clamp(70px, 14vmin, 120px)
  transform: translate(-50%, 0)
  pointer-events: none
  filter: drop-shadow(0 0 12px rgba(255, 216, 74, 0.9)) drop-shadow(0 3px 0 rgba(20, 26, 51, 0.6))
  :deep(.glyph)
    height: 100%
// The same attention bounce as the touch button's (`ActionButtons` cue-bounce).
.bounce
  position: relative
  height: 100%
  animation: block-cue-bounce 0.6s ease-in-out infinite
// The yellow hint arrow over it, tip down, as on the touch button.
.arrow
  position: absolute
  left: 50%
  bottom: calc(100% + 6px)
  width: 0
  height: 0
  border-left: 17px solid transparent
  border-right: 17px solid transparent
  border-top: 30px solid #ffd84a
  transform: translateX(-50%)
  filter: drop-shadow(0 0 6px rgba(255, 216, 74, 0.95)) drop-shadow(0 2px 0 rgba(20, 26, 51, 0.7))
@keyframes block-cue-bounce
  50%
    transform: translateY(-10px) scale(1.08)
@media (prefers-reduced-motion: reduce)
  .bounce
    animation: none
</style>
