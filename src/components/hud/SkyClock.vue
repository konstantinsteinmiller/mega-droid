<template lang="pug">
  //- The sky shoot's clock (#178): while it runs, the seconds left in big
  //- digits and a pip per drone (lit: still up). Wordless; the sentence is
  //- for screen readers. Red and pulsing for the last five seconds.
  Transition(name="sky")
    div.sky-clock(
      v-if="hud.skyT >= 0"
      role="timer"
      :class="{ hurry: hud.skyT <= 5 }"
      :aria-label="t('combat.skyClock', { s: Math.ceil(hud.skyT), n: hud.skyLeft })"
    )
      span.digits {{ shown }}
      span.pips(aria-hidden="true")
        span.pip(v-for="k in hud.skyN" :key="k" :class="{ up: k <= hud.skyLeft }")
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { hud } from '@/game/state/hud'
import { formatTenths } from '@/utils/localeNumber'

const { t, locale } = useI18n()
/** Tenths under ten seconds, whole seconds above. */
const shown = computed(() => (hud.skyT < 10 ? formatTenths(hud.skyT, locale.value) : String(Math.ceil(hud.skyT))))
</script>

<style scoped lang="sass">
.sky-clock
  position: absolute
  // On the right, under the status buttons: the middle of the top is the
  // target frame's and Atlas's bubble's.
  right: calc(env(safe-area-inset-right, 0px) + clamp(10px, 2vmin, 16px))
  top: calc(env(safe-area-inset-top, 0px) + clamp(66px, 11vh, 92px))
  transform-origin: 100% 0
  display: flex
  flex-direction: column
  align-items: center
  gap: 4px
  padding: 4px 14px 7px
  border-radius: 14px
  border: 3px solid #141a33
  background: rgba(11, 20, 51, 0.82)
  box-shadow: 0 4px 0 rgba(0, 0, 0, 0.35), inset 0 0 0 2px rgba(127, 244, 255, 0.25)
  pointer-events: none
.digits
  font-family: var(--font-pixel)
  font-size: clamp(22px, 5vmin, 34px)
  color: #9fe6ff
  text-shadow: 0 3px 0 #141a33
  font-variant-numeric: tabular-nums
.pips
  display: flex
  gap: 4px
.pip
  width: 10px
  height: 10px
  border-radius: 50%
  border: 2px solid #141a33
  background: #2a3352
  &.up
    background: radial-gradient(circle at 40% 35%, #dff1ff, #3c8dff 60%)
.hurry
  box-shadow: 0 4px 0 rgba(0, 0, 0, 0.35), inset 0 0 0 2px rgba(255, 74, 90, 0.6)
  animation: hurry 0.5s ease-in-out infinite alternate
  .digits
    color: #ff6a74
@keyframes hurry
  to
    transform: scale(1.07)
.sky-enter-active, .sky-leave-active
  transition: opacity 0.25s, transform 0.25s
.sky-enter-from, .sky-leave-to
  opacity: 0
  transform: translateY(-10px)
@media (prefers-reduced-motion: reduce)
  .hurry
    animation: none
</style>
