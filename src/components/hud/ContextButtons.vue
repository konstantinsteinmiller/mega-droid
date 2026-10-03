<template lang="pug">
  div.ctx(v-if="hud.phase === 'play'")
    Transition(name="ctx-pop")
      button.ctx-btn.interact(v-if="hud.interactKey" type="button" @mousedown.prevent @click="interact")
        KeyCap(v-if="hud.device === 'mouse'" code="KeyE")
        GameIcon.ico(:name="icon")
        span {{ t(hud.interactKey) }}
        CoachRing.ring(:hint="hud.hints.find(h => h.id === 'interact' && h.family === 'touch')")
    Transition(name="ctx-pop")
      button.ctx-btn.beam(v-if="hud.objectiveDone && !hud.combat" type="button" @mousedown.prevent @click="beamOut")
        KeyCap(v-if="hud.device === 'mouse'" code="KeyB")
        GameIcon.ico(name="up")
        span {{ t('hud.beamOut') }}
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { hud } from '@/game/state/hud'
import { currentMission, input } from '@/game/boot'
import GameIcon from '@/components/icons/GameIcon.vue'
import CoachRing from './CoachRing.vue'
import KeyCap from './KeyCap.vue'
import type { GameIconName } from '@/components/icons/iconNames'

/** Contextual actions, bottom centre: open / rescue / enter, and Beam out
 *  once the objective is done and the room is quiet. On desktop each one
 *  leads with its key — "[E] Open", "[B] Beam out" — because a captured
 *  mouse has no cursor to click them with. */
const { t } = useI18n()
const icon = computed<GameIconName>(() =>
  hud.interactKey === 'interact.chest' ? 'chest' : hud.interactKey === 'interact.rescue' ? 'heart' : 'skull')
const interact = () => {
  input.touched = true
  currentMission()?.doInteract()
}
const beamOut = () => {
  input.touched = true
  currentMission()?.beamOut()
}
</script>

<style scoped lang="sass">
.ctx
  position: absolute
  left: 50%
  bottom: calc(env(safe-area-inset-bottom, 0px) + clamp(90px, 20vmin, 150px))
  transform: translateX(-50%)
  display: flex
  flex-direction: column
  align-items: center
  gap: 10px
  pointer-events: none
.ctx-btn
  position: relative
  pointer-events: auto
  display: flex
  align-items: center
  gap: 8px
  padding: clamp(8px, 1.8vmin, 12px) clamp(14px, 3.4vmin, 22px)
  border-radius: 999px
  border: 3px solid #141a33
  color: #fff
  font-family: var(--font-ui)
  font-size: clamp(14px, 3vmin, 19px)
  text-shadow: 0 2px 0 #141a33
  box-shadow: 0 4px 0 rgba(0, 0, 0, 0.35), inset 0 3px 0 rgba(255, 255, 255, 0.3)
  animation: ctx-bob 1.4s ease-in-out infinite
  // iOS drew a white box round the pill after a tap: the native button look,
  // the tap highlight and a focus ring in currentColor (white). A press never
  // takes focus (mousedown.prevent above); none of the three is drawn.
  -webkit-appearance: none
  appearance: none
  -webkit-tap-highlight-color: transparent
  -webkit-touch-callout: none
  touch-action: manipulation
  outline: none
  &:focus, &:focus-visible
    outline: none
  &:active
    transform: translateY(2px)
.keycap
  font-size: 1.05em
  margin-inline-end: 2px
.ico
  width: clamp(18px, 4vmin, 24px)
  height: clamp(18px, 4vmin, 24px)
.interact
  background: linear-gradient(#ffd23a, #e08a00)
// The coach ring follows the pill, not a circle.
.ring :deep(.pulse), .ring :deep(.approve)
  inset: -8px
  border-radius: 999px
.beam
  background: linear-gradient(#7ff4ff, #1f9fd8)
@keyframes ctx-bob
  50%
    transform: translateY(-3px)
.ctx-pop-enter-active, .ctx-pop-leave-active
  transition: all 0.2s
.ctx-pop-enter-from, .ctx-pop-leave-to
  opacity: 0
  transform: scale(0.8)
</style>
