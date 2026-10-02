<template lang="pug">
  div.demo(v-if="hud.trainPhase === 'demo'" aria-live="polite")
    //- "Watch": a play mark at the top, pulsing while the game plays the
    //- move by itself through the real controls.
    div.watch(role="img" :aria-label="t('train.watch')")
      GameIcon(name="play")
    //- The input being pressed, big, in step with the demo (desktop; on a
    //- phone the real button lights up under a finger, `ActionButtons`).
    div.big(v-if="glyph" :class="{ down: hud.demoDown }" aria-hidden="true")
      InputGlyph(v-bind="glyph")
    //- Two presses skip it (a pip per press).
    div.skip(aria-hidden="true")
      GameIcon(name="skip-forward")
      span.pip(v-for="i in 2" :key="i" :class="{ on: i <= hud.demoSkips }")
  //- The player's turn: the same input stays up, pulsing, until they have
  //- done it (desktop; on a phone the button itself is lit, `ActionButtons`).
  div.demo.turn(v-else-if="tryGlyph" aria-hidden="true")
    div.big.pulse
      InputGlyph(v-bind="tryGlyph")
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { hud } from '@/game/state/hud'
import InputGlyph from './InputGlyph.vue'
import GameIcon from '@/components/icons/GameIcon.vue'

/**
 * A lesson's demo on screen (`sim/demo.ts`): the "watch" mark, the input the
 * game is pressing right now (lit while pressed), and the skip pips. On touch
 * the big glyph stays away: the real button lights up instead, where the
 * player's thumb will go.
 */
const { t } = useI18n()
/** What the lesson asks for, once the demo is over and it is the player's turn. */
const tryGlyph = computed(() => {
  if (hud.device === 'touch' || hud.phase !== 'play' || hud.trainPhase !== 'try') return null
  switch (hud.trainId) {
    case 'charge': return { kind: 'mouse' as const, button: 'left' as const, hold: true }
    case 'block': return { kind: 'mouse' as const, button: 'right' as const, hold: true }
    case 'slide': return { kind: 'key' as const, code: 'Space', wide: true }
    default: return null
  }
})
const glyph = computed(() => {
  if (hud.device === 'touch') return null
  switch (hud.demoAct) {
    case 'fire': return { kind: 'mouse' as const, button: 'left' as const, hold: hud.demoDown }
    case 'block': return { kind: 'mouse' as const, button: 'right' as const, hold: hud.demoDown }
    case 'slide': return { kind: 'key' as const, code: 'Space', wide: true }
    case 'tank': return { kind: 'key' as const, code: 'KeyH' }
    case 'move': return { kind: 'wasd' as const }
    case 'look': return { kind: 'mouse' as const, button: 'none' as const, move: true }
    default: return null
  }
})
</script>

<style scoped lang="sass">
.demo
  position: absolute
  inset: 0
  z-index: 6
  pointer-events: none
  // A thin gold frame: the game has the controls for a moment.
  box-shadow: inset 0 0 0 4px rgba(255, 216, 74, 0.55)
.watch
  position: absolute
  top: calc(env(safe-area-inset-top, 0px) + clamp(56px, 12vh, 96px))
  left: 50%
  transform: translateX(-50%)
  width: clamp(40px, 8vmin, 56px)
  height: clamp(40px, 8vmin, 56px)
  padding: 10px
  box-sizing: border-box
  border-radius: 50%
  background: rgba(20, 26, 51, 0.75)
  border: 3px solid #ffd84a
  color: #ffd84a
  animation: watch 1s ease-in-out infinite
@keyframes watch
  50%
    box-shadow: 0 0 18px rgba(255, 216, 74, 0.9)
.big
  position: absolute
  left: 50%
  bottom: clamp(70px, 16vh, 140px)
  transform: translateX(-50%)
  height: clamp(70px, 14vmin, 110px)
  filter: drop-shadow(0 3px 0 rgba(20, 26, 51, 0.55))
  transition: transform 0.08s
  :deep(.glyph)
    height: 100%
  &.down
    transform: translateX(-50%) scale(0.93)
    filter: drop-shadow(0 0 14px rgba(255, 216, 74, 0.95))
  &.pulse
    height: clamp(52px, 10vmin, 80px)
    animation: turn 1.1s ease-in-out infinite
// The player's turn has no frame: the game is theirs again.
.turn
  box-shadow: none
@keyframes turn
  50%
    transform: translateX(-50%) scale(1.08)
    filter: drop-shadow(0 0 14px rgba(255, 216, 74, 0.95))
// Beside the "watch" mark (the top right is the checklist's).
.skip
  position: absolute
  left: calc(50% + clamp(30px, 6vmin, 44px))
  top: calc(env(safe-area-inset-top, 0px) + clamp(62px, 13vh, 104px))
  display: flex
  align-items: center
  gap: 4px
  padding: 6px 10px
  border-radius: 999px
  background: rgba(20, 26, 51, 0.6)
  color: #fff
  :deep(.game-icon)
    width: 18px
    height: 18px
.pip
  width: 8px
  height: 8px
  border-radius: 50%
  background: rgba(255, 255, 255, 0.35)
  &.on
    background: #7fffc8
@media (prefers-reduced-motion: reduce)
  .watch, .big.pulse
    animation: none
</style>
