<template lang="pug">
  Transition(name="beam")
    div.mission-loading.no-os-ui(v-if="flow.loading")
      //- The boot loader's night blue and grid (#117), opaque: the intro's
      //- last frame (its white beam flash) showed through when the
      //- tutorial was still building behind it.
      SplashBackdrop
      div.beam(aria-hidden="true")
      div.card
        //- The boss splash (#103, Mega Man's stage-select intro): the Master
        //- strikes in and the name types on — inside the build's own wait,
        //- never adding to it.
        div.splash(v-if="flow.loadingBoss" aria-hidden="true")
          MasterPortrait.face(:id="loadingBoss" :size="104")
          div.name {{ t(`boss.${flow.loadingBoss}`) }}
        div.sector(v-if="flow.loadingSector") {{ t(`sector.${flow.loadingSector}`) }}
        div.bar(
          role="progressbar"
          :aria-label="flow.loadingSector ? t(`sector.${flow.loadingSector}`) : undefined"
          :aria-valuenow="Math.round(flow.loadProgress * 100)"
          aria-valuemin="0"
          aria-valuemax="100"
        )
          div.cells(aria-hidden="true")
          div.lit(aria-hidden="true")
            div.fill(:style="{ transform: `scaleX(${Math.max(0.04, flow.loadProgress).toFixed(4)})` }")
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { flow } from '@/game/flow'
import MasterPortrait from '@/components/atoms/MasterPortrait.vue'
import SplashBackdrop from '@/components/atoms/SplashBackdrop.vue'
import type { BossId } from '@/game/models/bosses'

/**
 * Hub → mission: the teleport beam shown the instant Deploy is tapped, while
 * the sector builds behind it (`flow.startMission`, time-sliced, so the lab
 * keeps animating and this bar keeps filling). The same masked 28-cell bar
 * as the boot loader, animated by transform on the compositor.
 */
const { t } = useI18n()
const loadingBoss = computed(() => flow.loadingBoss as BossId)
</script>

<style scoped lang="sass">
.mission-loading
  position: fixed
  inset: 0
  z-index: 60
  display: grid
  place-items: center
  background: #111d42
  pointer-events: auto
.beam
  position: absolute
  left: 50%
  top: 0
  bottom: 0
  width: clamp(90px, 22vmin, 170px)
  transform: translateX(-50%)
  background: linear-gradient(90deg, transparent, rgba(127, 244, 255, 0.35) 35%, rgba(230, 255, 255, 0.75) 50%, rgba(127, 244, 255, 0.35) 65%, transparent)
  animation: beam-pulse 0.9s ease-in-out infinite alternate
  will-change: opacity, transform
.card
  position: relative
  width: min(78vw, 420px)
  display: flex
  flex-direction: column
  align-items: center
  gap: 12px
  padding-top: 38vh
  &:has(.splash)
    padding-top: 18vh
.splash
  display: flex
  flex-direction: column
  align-items: center
  gap: 10px
.face
  animation: strike-in 0.45s cubic-bezier(0.2, 1.4, 0.4, 1) both
.name
  font-family: var(--font-ui)
  font-size: clamp(1.3rem, 6vmin, 2.2rem)
  color: #ffd84a
  text-shadow: 0 3px 0 #141a33
  letter-spacing: 0.05em
  white-space: nowrap
  // Typed on, left to right (a reveal, so every script types the same).
  animation: type-on 0.7s steps(14) 0.25s both
@keyframes strike-in
  from
    transform: translateY(-40px) scale(0.6)
    opacity: 0
@keyframes type-on
  from
    clip-path: inset(0 100% 0 0)
.sector
  font-family: var(--font-ui)
  font-size: clamp(1.1rem, 5vmin, 1.8rem)
  color: #fff
  text-shadow: 0 3px 0 #141a33, 0 0 14px rgba(127, 244, 255, 0.7)
  letter-spacing: 0.04em
.bar
  position: relative
  width: 100%
  height: clamp(16px, 3.4vmin, 24px)
  border: 3px solid #141a33
  border-radius: 6px
  background: #0b1433
  box-shadow: 0 3px 0 rgba(0, 0, 0, 0.35)
  box-sizing: border-box
.cells, .lit
  position: absolute
  inset: 3px
  -webkit-mask-image: repeating-linear-gradient(90deg, #000 0, #000 calc((100% - 54px) / 28), transparent calc((100% - 54px) / 28), transparent calc((100% - 54px) / 28 + 2px))
  mask-image: repeating-linear-gradient(90deg, #000 0, #000 calc((100% - 54px) / 28), transparent calc((100% - 54px) / 28), transparent calc((100% - 54px) / 28 + 2px))
.cells
  background: rgba(255, 255, 255, 0.08)
.lit
  overflow: hidden
.fill
  width: 100%
  height: 100%
  background: linear-gradient(#e8fdff 0%, #7ff4ff 45%, #1f9fd8 100%)
  transform-origin: left center
  transition: transform 0.35s cubic-bezier(0.2, 0.7, 0.3, 1)
  will-change: transform
@keyframes beam-pulse
  from
    opacity: 0.55
    transform: translateX(-50%) scaleX(0.85)
  to
    opacity: 1
    transform: translateX(-50%) scaleX(1.1)
.beam-enter-active
  transition: opacity 0.12s ease-out
.beam-leave-active
  transition: opacity 0.3s ease-in
.beam-enter-from, .beam-leave-to
  opacity: 0
@media (prefers-reduced-motion: reduce)
  .beam, .face, .name
    animation: none
</style>
