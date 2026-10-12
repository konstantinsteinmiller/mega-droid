<script setup lang="ts">
/**
 * THE rewarded-ad mark: the film clapper, white on a dark rounded chip. Every
 * button that plays a rewarded video carries this one (the Workshop's offers,
 * the gel for the road, the Reboot, the result screen's ×3), so "a video
 * follows this click" reads the same everywhere. Sized in em: it follows the
 * label it sits beside.
 */
import RewardAdIcon from '@/components/atoms/RewardAdIcon.vue'
</script>

<template lang="pug">
  span.reward-ad-badge(aria-hidden="true")
    RewardAdIcon.mark
</template>

<style scoped lang="sass">
.reward-ad-badge
  flex: none
  display: inline-grid
  place-items: center
  padding: 0.2em 0.32em
  border-radius: 0.45em
  background: #141a33
  color: #ffffff
  line-height: 0
.mark
  width: 1.7em
  height: 1.3em
</style>
