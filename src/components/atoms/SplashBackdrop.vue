<template lang="pug">
  div.splash-backdrop(:class="{ solid }" aria-hidden="true")
    div.backdrop-grid
</template>

<script setup lang="ts">
/**
 * The boot loader's backdrop (FLogoProgress.vue: the night-blue gradient
 * under the panning grid of light lines), for every other loading screen
 * (#117): the mission's beam, the debrief's Atlas. `solid`: the whole
 * gradient, covering what is behind (the intro's last white frame showed
 * through the mission loader); without it only the warm glow and the grid,
 * over a 3D scene cleared to the same blue.
 */
withDefaults(defineProps<{ solid?: boolean }>(), { solid: true })
</script>

<style scoped lang="sass">
// Same values as FLogoProgress.vue's .splash-backdrop / .backdrop-grid.
.splash-backdrop
  position: absolute
  inset: 0
  overflow: hidden
  pointer-events: none
  background: radial-gradient(circle at 50% 40%, rgba(255, 167, 51, 0.16) 0%, rgba(255, 167, 51, 0) 32%)
  &.solid
    background: radial-gradient(circle at 50% 40%, rgba(255, 167, 51, 0.16) 0%, rgba(255, 167, 51, 0) 32%), radial-gradient(circle at 50% 40%, #1d2f63 0%, #111d42 52%, #0a1224 100%)

.backdrop-grid
  position: absolute
  inset: -64px 0 0 -64px
  background-image: linear-gradient(rgba(120, 160, 230, 0.08) 2px, transparent 2px), linear-gradient(90deg, rgba(120, 160, 230, 0.08) 2px, transparent 2px)
  background-size: 64px 64px
  animation: grid-pan 6s linear infinite
  will-change: transform

@keyframes grid-pan
  to
    transform: translate3d(64px, 64px, 0)

@media (prefers-reduced-motion: reduce)
  .backdrop-grid
    animation: none
</style>
