<template lang="pug">
  //- A desktop's mouse under the crosshair, bouncing under a yellow arrow,
  //- when the game shows the one input that matters right now (on a phone
  //- the HUD button itself bounces under yellow arrows: `ActionButtons`):
  //- - the block lesson's held shot (`hud.blockCue`): time stands still with
  //-   the Trooper's shot a hand's breadth away — the right button clicks;
  //- - the charge show (`hud.chargeShow`): the game charges the first shot
  //-   itself — the left button sinks and stays down while the charge fills;
  //- - the slide lesson (`hud.slideCue`): the Stomper's leap held overhead,
  //-   or the Stomper shot down before it ever leapt — the Space key, pressed.
  div.input-cue(v-if="cue" :class="{ key: cue === 'space' }" aria-hidden="true")
    div.bounce
      PressCue.press(v-if="hud.blockCue || cue === 'space'")
      span.arrow(v-else)
      InputGlyph(v-if="cue === 'space'" kind="key" code="Space" :wide="true")
      InputGlyph(v-else kind="mouse" v-bind="cue")
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { hud } from '@/game/state/hud'
import InputGlyph from './InputGlyph.vue'
import PressCue from './PressCue.vue'

const cue = computed(() => {
  if (hud.phase !== 'play' || hud.device !== 'mouse') return null
  if (hud.blockCue) return { button: 'right' as const, click: true }
  if (hud.slideCue) return 'space' as const
  if (hud.chargeShow === 'aim') return { button: 'left' as const }
  if (hud.chargeShow === 'hold') return { button: 'left' as const, hold: true }
  return null
})
</script>

<style scoped lang="sass">
.input-cue
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
// The Space bar is wide and flat: a lower glyph keeps it the mouse's width.
.input-cue.key
  height: clamp(44px, 8vmin, 72px)
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
// The block's press glyph over it: an arrow onto a bar, once.
.press
  position: absolute
  left: 50%
  bottom: calc(100% + 6px)
  width: 42px
  transform: translateX(-50%)
@keyframes block-cue-bounce
  50%
    transform: translateY(-10px) scale(1.08)
@media (prefers-reduced-motion: reduce)
  .bounce
    animation: none
</style>
