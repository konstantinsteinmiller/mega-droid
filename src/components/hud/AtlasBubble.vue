<template lang="pug">
  div.atlas-say(aria-live="polite")
    div.bubble(v-if="hud.atlasKey" ref="el" :key="hud.atlasSeq" :class="{ docked, gold: hud.atlasGold }")
      span.glyph(aria-hidden="true")
      span.text {{ t(hud.atlasKey, paramsOf(hud.atlasKey)) }}
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { hud, hudLive, addHudTicker } from '@/game/state/hud'
import { setAtlasTextLookup } from '@/game/sim/atlas'
import { BUBBLE_AVOID, ZONE_GAP, placeBubble, zones } from './hudLayout'

/**
 * Atlas's speech bubble (`sim/atlas.ts`): its line in a small cyan-edged
 * bubble beside Atlas's model — tail pointing at it — while the model is in
 * view (it flies into the top left of the view to speak), docked in the top
 * left with Atlas's ring glyph when it is not. The line is also read to
 * screen readers. It lives outside the HUD layer, so it stays up through the
 * beam-in and the exit, when the rest of the HUD is away.
 *
 * Positioned from the HUD ticker (the game loop's clock), like the other
 * per-frame HUD pieces, and kept off the HUD's zones (`hudLayout.ts`): moved
 * to the nearest free spot, or held back while the cards fill the view.
 */
const { t } = useI18n()
/** A line that names something fills it from its own key's last part (#117):
 *  the weapon copied or borrowed, the machine scanned. */
const paramsOf = (key: string): Record<string, string> => {
  const weapon = /^atlas\.(?:story\.copied|warn\.borrowedLast)\.(\w+)$/.exec(key)
  if (weapon) return { weapon: t(`weapon.${weapon[1]}.name`) }
  const scan = /^atlas\.scan\.(\w+)$/.exec(key)
  return scan ? { enemy: t(`enemy.${scan[1]}`) } : {}
}
const el = ref<HTMLElement | null>(null)
const docked = ref(true)
let off: (() => void) | null = null

onMounted(() => {
  // The director times a line without a voice by the length of its text.
  setAtlasTextLookup((key) => t(key, paramsOf(key)))
  off = addHudTicker(() => {
    const b = el.value
    if (!b) return
    const w = window.innerWidth
    const h = window.innerHeight
    const inView = hudLive.atlasIn
    // The dock: under the objective card, right of the vitals (#151: docked
    // at the left edge it covered the health and energy bars).
    const r = zones.rects
    const dock = {
      x: r.vitals ? r.vitals.x + r.vitals.w + ZONE_GAP : Math.max(16, w * 0.02),
      y: r.objective ? r.objective.y + r.objective.h + ZONE_GAP : Math.max(96, h * 0.2)
    }
    // Beside Atlas (to its right), or at the dock.
    const want = inView
      ? { x: hudLive.atlasX * w + Math.min(w, h) * 0.085, y: hudLive.atlasY * h - b.offsetHeight / 2 }
      : dock
    // Never over a card, a toast, the bars or the boss bar: the nearest free
    // spot, or nowhere for now (the line waits under the cards).
    const obstacles = BUBBLE_AVOID.flatMap(id => (r[id] ? [r[id]!] : []))
    const at = placeBubble(want, { w: b.offsetWidth, h: b.offsetHeight }, obstacles, { w, h }, [dock])
    b.style.visibility = at ? '' : 'hidden'
    if (!at) return
    // Moved off Atlas's side, the tail would point at nothing.
    const beside = inView && Math.hypot(at.x - want.x, at.y - want.y) < 24
    if (docked.value === beside) docked.value = !beside
    b.style.transform = `translate3d(${at.x.toFixed(0)}px, ${at.y.toFixed(0)}px, 0)`
  })
})
onUnmounted(() => {
  off?.()
  setAtlasTextLookup(null)
})
</script>

<style scoped lang="sass">
.atlas-say
  position: absolute
  inset: 0
  pointer-events: none
  z-index: 3
.bubble
  position: absolute
  left: 0
  top: 0
  display: flex
  align-items: center
  gap: 0.45em
  max-width: min(58vw, 300px)
  padding: 0.38em 0.8em 0.42em 0.55em
  background: #ffffff
  color: #141a33
  border: 3px solid #141a33
  border-radius: 1.1em
  box-shadow: 0 0 0 2px #6ff2ff, 0 4px 0 rgba(20, 26, 51, 0.4)
  font-family: var(--font-ui)
  font-size: clamp(12px, 2.6vmin, 18px)
  line-height: 1.15
  // A lesson room's intro ("Let's train the Charge Shot"): gold-edged and
  // glowing, unlike every other line, so it reads as "training starts here".
  &.gold
    background: linear-gradient(#fffaf0, #fff0c8)
    box-shadow: 0 0 0 3px #ffd84a, 0 0 18px rgba(255, 196, 40, 0.8), 0 4px 0 rgba(20, 26, 51, 0.4)
    animation: gold-glow 1.3s ease-in-out infinite
  will-change: transform
  // The tail, toward Atlas on the left.
  &::before
    content: ''
    position: absolute
    left: -10px
    top: 50%
    width: 12px
    height: 12px
    margin-top: -6px
    background: #ffffff
    border-left: 3px solid #141a33
    border-bottom: 3px solid #141a33
    transform: rotate(45deg)
  &.docked::before
    display: none
.text
  display: inline-block
  animation: atlas-pop 0.3s cubic-bezier(0.2, 1.5, 0.45, 1) both
  overflow-wrap: anywhere
// Atlas's ring glyph: shown when the bubble is docked (Atlas not in view).
.glyph
  display: none
  flex: none
  width: 1.1em
  height: 1.1em
  border-radius: 50%
  border: 2px solid #20b8d0
  border-top-color: transparent
  .docked &
    display: block
@keyframes atlas-pop
  0%
    transform: scale(0.3)
    opacity: 0
  60%
    transform: scale(1.1)
    opacity: 1
  100%
    transform: scale(1)
@keyframes gold-glow
  50%
    box-shadow: 0 0 0 3px #ffd84a, 0 0 28px rgba(255, 196, 40, 1), 0 4px 0 rgba(20, 26, 51, 0.4)
@media (prefers-reduced-motion: reduce)
  .bubble.gold
    animation: none
</style>
