<template lang="pug">
  //- The rewarded offer on the result screen: the big rewarded badge (reads as
  //- "watch a video" at a glance, in any language), what it
  //- gives in words and in bolts, and a ×3 sticker. Also rendered invisibly
  //- inside the free Continue button on Poki, so that one is never smaller.
  span.triple-offer
    span.film(aria-hidden="true")
      RewardAdBadge.cam
    span.words
      span.what {{ t('results.triple') }}
      span.amount
        | +{{ amount }}
        GameIcon.nut(name="nut")
    span.x3(aria-hidden="true") ×3
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import GameIcon from '@/components/icons/GameIcon.vue'
import RewardAdBadge from '@/components/atoms/RewardAdBadge.vue'

defineProps<{
  /** The bolts the offer would bring in total (already formatted). */
  amount: string
}>()

const { t } = useI18n()
</script>

<style scoped lang="sass">
.triple-offer
  position: relative
  display: inline-flex
  align-items: center
  gap: 0.55em
  text-align: left
  line-height: 1.05
// The film badge: the rewarded mark every video button carries
// (`RewardAdBadge`), big and glowing here, so "watch a video" reads at a
// glance instead of hiding in a tiny glyph.
.film
  position: relative
  flex: none
  display: grid
  place-items: center
  border-radius: 0.5em
  border: 0.12em solid #fff3c2
  box-shadow: 0 0 0.6em rgba(255, 220, 120, 0.75)
  animation: film-pulse 1.4s ease-in-out infinite
.cam
  font-size: 1.3em
.words
  display: flex
  flex-direction: column
  gap: 0.12em
.what
  font-size: 0.78em
  letter-spacing: 0.04em
  text-transform: uppercase
  opacity: 0.95
.amount
  display: inline-flex
  align-items: center
  gap: 0.2em
  font-family: var(--font-pixel)
  font-size: 1.05em
  color: #fff6c8
  text-shadow: 0 0.08em 0 rgba(60, 10, 40, 0.8)
.nut
  width: 1.1em
  height: 1.1em
  color: #ffd84a
// The ×3: a gold pill inside the button (the body clips anything outside
// it), set in the UI face — the pixel face has no clean ×.
.x3
  flex: none
  padding: 0.1em 0.38em
  border-radius: 0.55em
  font-family: var(--font-ui)
  font-size: 1.25em
  line-height: 1
  color: #3a0c24
  text-shadow: none
  background: linear-gradient(180deg, #fff3a0, #ffc21a)
  border: 0.1em solid #3a0c24
  box-shadow: 0 0.12em 0 #3a0c24
  transform: rotate(-6deg)
  animation: x3-bob 1.1s ease-in-out infinite
@keyframes film-pulse
  50%
    box-shadow: 0 0 1em rgba(255, 220, 120, 1)
@keyframes x3-bob
  50%
    transform: rotate(-6deg) scale(1.12)
@media (prefers-reduced-motion: reduce)
  .film, .x3
    animation: none
</style>
