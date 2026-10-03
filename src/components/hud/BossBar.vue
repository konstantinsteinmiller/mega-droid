<template lang="pug">
  Transition(name="bb")
    div.bb(v-if="hud.bossName" aria-hidden="true")
      //- The name over the bar's left end, marked with the skull.
      div.bb-name
        span.skull
          GameIcon(name="skull")
        span.label {{ t(hud.bossName) }}
      div.bb-bar
        div.track
          div.fill(:style="{ width: segPct + '%' }")
          //- A multi-part boss: where each part's share ends.
          span.mark(v-for="m in hud.bossMarks" :key="m" :style="{ left: (m * 100) + '%' }")
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { hud } from '@/game/state/hud'
import GameIcon from '@/components/icons/GameIcon.vue'

/**
 * The Core Master's energy (#276): a horizontal 28-segment bar right under
 * the compass strip, the way most action RPGs hang a boss's health across
 * the top, with its name over the bar's left end. In violet under a skull, a
 * colour none of Flux's bars ever take (yellow or red health, weapon
 * colours). The Grand Master's part marks stand across it.
 *
 * It fills segment by segment during the entrance (the mission ramps
 * `bossHp01`), with no tween, so every step lands whole. In portrait it
 * follows the compass down under the top row.
 */
const { t } = useI18n()
const SEG = 28
const segPct = computed(() => (Math.ceil(Math.min(1, Math.max(0, hud.bossHp01)) * SEG) / SEG) * 100)
</script>

<style scoped lang="sass">
// ─── Under the compass (Compass.vue: its top, its strip, its labels) ────────
.bb
  position: absolute
  left: 50%
  top: calc(env(safe-area-inset-top, 0px) + clamp(6px, 1.6vmin, 12px) + clamp(16px, 3.4vmin, 22px) + 14px)
  transform: translateX(-50%)
  width: min(46vw, 360px)
  display: flex
  flex-direction: column
  gap: 3px
  pointer-events: none
  z-index: 2
.bb-name
  display: flex
  align-items: center
  gap: 5px
  min-width: 0
  font-family: var(--font-ui)
  font-size: clamp(12px, 2.6vmin, 16px)
  color: #fff
  text-shadow: 0 2px 0 #141a33, 0 0 6px rgba(180, 92, 255, 0.7)
  letter-spacing: 0.04em
  white-space: nowrap
.skull
  display: block
  flex: none
  width: 1.2em
  height: 1.2em
  color: #c98bff
  filter: drop-shadow(0 2px 0 #141a33)
.label
  min-width: 0
  overflow: hidden
  text-overflow: ellipsis
.bb-bar
  padding: 3px
  border-radius: 4px
  background: #141a33
  box-shadow: 0 3px 0 rgba(0, 0, 0, 0.35)
.track
  position: relative
  height: clamp(9px, 2vmin, 13px)
  border-radius: 1px
  background: #0b1433
  overflow: hidden
  // Segment gaps drawn over whatever fill is below
  &::after
    content: ''
    position: absolute
    inset: 0
    background: repeating-linear-gradient(to right, transparent 0, transparent calc(100% / 28 - 1.5px), #0b1433 calc(100% / 28 - 1.5px), #0b1433 calc(100% / 28))
    pointer-events: none
.fill
  position: absolute
  left: 0
  top: 0
  bottom: 0
  background: linear-gradient(180deg, #f4e0ff 0%, #f4e0ff 30%, #b45cff 31%, #7a2ee0 100%)
.mark
  position: absolute
  top: -2px
  bottom: -2px
  width: 2px
  margin-left: -1px
  background: #ffd84a
  z-index: 1
.bb-enter-active, .bb-leave-active
  transition: opacity 0.3s, transform 0.3s
.bb-enter-from, .bb-leave-to
  opacity: 0
  transform: translate(-50%, -8px)
// A short landscape screen: the objective card reaches the middle at the top,
// so the bar hangs just under it instead, a little narrower.
@media (min-aspect-ratio: 1/1) and (max-height: 480px)
  .bb
    top: calc(env(safe-area-inset-top, 0px) + 78px)
    width: min(40vw, 300px)
// Portrait: the compass drops under the top row; the bar follows it.
@media (max-aspect-ratio: 1/1)
  .bb
    top: calc(env(safe-area-inset-top, 0px) + clamp(8px, 2.2vmin, 18px) + clamp(36px, 8vmin, 48px) + 8px + clamp(16px, 3.4vmin, 22px) + 14px)
    width: min(62vw, 320px)
</style>
