<template lang="pug">
  canvas.mini-game(ref="canvasEl" aria-hidden="true")
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

/**
 * The loading mini-game (#Mini1) inside the in-app loaders. The game itself is
 * public/js/mini-game.js, the classic script index.html's splash runs before
 * the bundle; this only hands it a canvas. Its state lives on `window.mdMini`,
 * so the fight carries on across the hand-over. Stops on unmount.
 */
type MiniGame = { run: (canvas: HTMLCanvasElement) => () => void }
const canvasEl = ref<HTMLCanvasElement | null>(null)
let stop: (() => void) | null = null

onMounted(() => {
  const game = (window as { mdMini?: MiniGame }).mdMini
  if (game && canvasEl.value) stop = game.run(canvasEl.value)
})
onUnmounted(() => { stop?.(); stop = null })
</script>

<style scoped lang="sass">
// The same box as index.html's .s-mini (tests/ui/splashLogo.test.ts).
.mini-game
  position: absolute
  top: 100%
  left: 0
  right: 0
  display: block
  width: 100%
  height: clamp(56px, min(30vmin, 22vh), 176px)
  margin: clamp(10px, 3vmin, 20px) auto 0
  touch-action: none
  cursor: crosshair

// Short screens (landscape phones): in the column's flow, smaller, rather
// than hidden; the loader shrinks its logo to match. Gone only with no room.
@media (max-height: 600px)
  .mini-game
    position: static
    margin: 0
@media (max-height: 240px)
  .mini-game
    display: none
</style>
