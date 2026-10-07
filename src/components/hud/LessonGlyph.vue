<template lang="pug">
  //- The input the lesson hologram presses, pinned over its head and lit in
  //- step with its loop: the key or mouse button on a desktop, the very HUD
  //- button on a phone or tablet (#130: the real button lights too,
  //- `ActionButtons`, but the eye is on the hologram). It floats up a little
  //- and back, so it catches the eye.
  div.holo-glyph(
    v-show="shown && pinned"
    ref="el"
    :class="{ down: hud.holoDown }"
    aria-hidden="true"
  )
    div.float
      InputGlyph(v-if="glyphOrMove" v-bind="glyphOrMove")
      span.holo-btn(v-else-if="button" :class="button.cls" :style="button.style")
        GameIcon(:name="button.icon")
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { addHudTicker, hud, hudLive } from '@/game/state/hud'
import { WEAPON_ICON, type WeaponId } from '@/game/data/weapons'
import GameIcon from '@/components/icons/GameIcon.vue'
import InputGlyph from './InputGlyph.vue'

/**
 * A lesson hologram's input on screen (`fx/lessonHologram.ts`): the key,
 * mouse button or touch button the see-through Flux presses, over its head,
 * pushed in while the loop presses it. Placed from the HUD ticker (the game
 * loop's clock), like the other world-pinned HUD pieces.
 */
const el = ref<HTMLElement | null>(null)
const pinned = ref(false)
const live = computed(() => hud.phase === 'play' && !hud.slideCue && !hud.blockCue)
const glyph = computed(() => {
  if (!live.value || hud.device === 'touch') return null
  switch (hud.holoAct) {
    case 'fire': return { kind: 'mouse' as const, button: 'left' as const, hold: hud.holoDown }
    case 'weapon': return { kind: 'key' as const, code: 'Digit1' }
    case 'block': return { kind: 'mouse' as const, button: 'right' as const, hold: hud.holoDown }
    case 'slide': return { kind: 'key' as const, code: 'Space', wide: true }
    case 'tank': return { kind: 'key' as const, code: 'KeyH' }
    case 'move': return { kind: 'wasd' as const }
    default: return null
  }
})
/** On a phone or tablet: the HUD button itself, in its own colours. */
const button = computed(() => {
  if (!live.value || hud.device !== 'touch') return null
  switch (hud.holoAct) {
    case 'fire': return { icon: 'buster', cls: 'fire', style: {} }
    case 'block': return { icon: 'shield', cls: 'block', style: {} }
    case 'slide': return { icon: 'dodge', cls: 'slide', style: {} }
    case 'tank': return { icon: 'flask', cls: 'tank', style: {} }
    case 'weapon': {
      const w = hud.weapons[0]
      return { icon: WEAPON_ICON[w?.id as WeaponId] ?? 'buster', cls: 'weapon', style: { '--wc': w?.color ?? '#ffd84a' } }
    }
    // Walking is the stick, not a button: its ∞ finger, as on the controls card.
    case 'move': return null
    default: return null
  }
})
const moveGlyph = computed(() => (live.value && hud.device === 'touch' && hud.holoAct === 'move' ? { kind: 'infinity' as const } : null))
const shown = computed(() => !!(glyph.value || button.value || moveGlyph.value))
// The stick's glyph rides the same slot as a desktop glyph.
const glyphOrMove = computed(() => glyph.value ?? moveGlyph.value)
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
// A small float up and back: enough motion to catch the eye, never a bounce.
.float
  height: 100%
  animation: holo-float 1.6s ease-in-out infinite alternate
@keyframes holo-float
  from
    translate: 0 0
  to
    translate: 0 -9px
@media (prefers-reduced-motion: reduce)
  .float
    animation: none
// The touch button, as the HUD draws it (`ActionButtons`).
.holo-btn
  display: grid
  place-items: center
  height: 100%
  aspect-ratio: 1
  border-radius: 50%
  border: 3px solid #141a33
  color: #fff
  box-shadow: inset 0 -5px 0 rgba(0, 0, 0, 0.18), inset 0 4px 0 rgba(255, 255, 255, 0.35)
  transition: transform 0.08s
  :deep(.game-icon)
    width: 54%
    height: 54%
  &.fire
    background: radial-gradient(circle at 40% 30%, #ffe7a8, #ffb13c 45%, #e0621f)
  &.block
    background: radial-gradient(circle at 40% 30%, #9fe6ff, #3cc8ff 45%, #1f7fd0)
  &.slide
    background: radial-gradient(circle at 40% 30%, #c0d4ff, #6f8cff 45%, #3a4fc0)
  &.tank
    background: radial-gradient(circle at 40% 30%, #b8ffc8, #5dff8a 45%, #1f9a4a)
  &.weapon
    background: radial-gradient(circle at 40% 30%, #ffffff, var(--wc) 55%, #141a33 120%)
.down .holo-btn
  transform: scale(0.88)
  box-shadow: 0 0 0 4px #ffd84a, 0 0 18px rgba(255, 216, 74, 0.9), inset 0 -3px 0 rgba(0, 0, 0, 0.18)
</style>
