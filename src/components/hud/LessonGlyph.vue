<template lang="pug">
  //- The input the lesson hologram presses, pinned over its head and lit in
  //- step with its loop (desktop; on a phone the real button lights instead,
  //- `ActionButtons`).
  div.holo-glyph(
    v-show="glyph && pinned"
    ref="el"
    :class="{ down: hud.holoDown }"
    aria-hidden="true"
  )
    InputGlyph(v-if="glyph" v-bind="glyph")
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { addHudTicker, hud, hudLive } from '@/game/state/hud'
import InputGlyph from './InputGlyph.vue'

/**
 * A lesson hologram's input on screen (`fx/lessonHologram.ts`): the key or
 * mouse button the see-through Flux presses, over its head, pushed in while
 * the loop presses it. Placed from the HUD ticker (the game loop's clock),
 * like the other world-pinned HUD pieces.
 */
const el = ref<HTMLElement | null>(null)
const pinned = ref(false)
const glyph = computed(() => {
  if (hud.device === 'touch' || hud.phase !== 'play' || hud.slideCue) return null
  switch (hud.holoAct) {
    case 'fire':
    case 'weapon': return { kind: 'mouse' as const, button: 'left' as const, hold: hud.holoAct === 'fire' && hud.holoDown }
    case 'block': return { kind: 'mouse' as const, button: 'right' as const, hold: hud.holoDown }
    case 'slide': return { kind: 'key' as const, code: 'Space', wide: true }
    case 'tank': return { kind: 'key' as const, code: 'KeyH' }
    case 'move': return { kind: 'wasd' as const }
    default: return null
  }
})
let off: (() => void) | null = null
onMounted(() => {
  off = addHudTicker(() => {
    const on = hudLive.holoOn
    if (on !== pinned.value) pinned.value = on
    const e = el.value
    if (e && on) e.style.transform = `translate(${hudLive.holoX.toFixed(1)}px, ${hudLive.holoY.toFixed(1)}px) translate(-50%, -100%)`
  })
})
onUnmounted(() => off?.())
</script>

<style scoped lang="sass">
.holo-glyph
  position: absolute
  left: 0
  top: 0
  z-index: 2
  height: clamp(44px, 9vmin, 70px)
  pointer-events: none
  opacity: 0.92
  filter: drop-shadow(0 0 8px rgba(95, 232, 255, 0.85)) drop-shadow(0 3px 0 rgba(20, 26, 51, 0.55))
  :deep(.glyph)
    height: 100%
  &.down
    filter: drop-shadow(0 0 14px rgba(255, 216, 74, 0.95)) drop-shadow(0 3px 0 rgba(20, 26, 51, 0.55))
</style>
