<template lang="pug">
  div.coach(v-if="hud.phase === 'play'" aria-live="polite" :class="{ hushed: coachHushed(stage) }")
    //- Desktop, mouse not captured yet: one click on the scene takes it.
    Transition(name="hint")
      div.capture(v-if="hud.pointerFree" role="img" :aria-label="t('tips.capture')")
        span.capture-ring
        InputGlyph(kind="mouse" button="left" :click="true")
    TransitionGroup(name="hint" tag="div" class="spots")
      div.hint(
        v-for="h in spots"
        :key="`${h.id}-${h.family}`"
        :class="[h.id, h.family, { ok: approving[h.id], done: h.done }]"
        role="img"
        :aria-label="ariaOf(h)"
      )
        div.glyph-box
          InputGlyph(v-bind="glyph(h)")
          span.approve(v-if="approving[h.id]" :key="h.flash")
          GameIcon.act(v-if="ACTION[h.id]" :name="ACTION[h.id]")
          span.floor(v-if="h.id === 'walk'")
        div.pips(v-if="!h.done")
          span.pip(v-for="i in h.goal" :key="i" :class="{ on: i <= h.count }")
        GameIcon.check(v-else name="check")
    TransitionGroup(name="hint" tag="div" class="row")
      div.hint.card(
        v-for="h in row"
        :key="`${h.id}-${h.family}`"
        :class="[h.id, h.family, { ok: approving[h.id], done: h.done, urgent: h.urgent }]"
        role="img"
        :aria-label="ariaOf(h)"
      )
        div.glyph-box
          span.urgent-halo(v-if="h.urgent")
          InputGlyph(v-bind="glyph(h)")
          span.parry-ring(v-if="h.id === 'parry'")
          span.floor(v-if="h.id === 'walk'")
          span.approve(v-if="approving[h.id]" :key="h.flash")
        GameIcon.act(v-if="ACTION[h.id]" :name="ACTION[h.id]")
        div.pips(v-if="!h.done")
          span.pip(v-for="i in h.goal" :key="i" :class="{ on: i <= h.count }")
        GameIcon.check(v-else name="check")
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { hud } from '@/game/state/hud'
import type { HintId, HintView, InputFamily } from '@/game/sim/coach'
import InputGlyph from './InputGlyph.vue'
import GameIcon from '@/components/icons/GameIcon.vue'
import { keyAriaParams } from './keyAria'
import { stage, coachHushed } from './hudLayout'
import type { GameIconName } from '@/components/icons/iconNames'

/**
 * The control coach's glyphs (see `game/sim/coach.ts`). Movement and camera
 * sit where the thumbs / hands are (on touch just one: a finger tracing an ∞
 * where the floating stick works); on desktop every action is a card just
 * under the crosshair — where the eyes already are. On touch the button actions
 * (block, slide, tank, weapon, interact) glow on the buttons themselves
 * (`ActionButtons` / `ContextButtons`).
 *
 * Every success flashes the glyph green and fills a pip; the last pip pops a
 * check and the glyph leaves. No words: the aria-label carries the sentence
 * for screen readers.
 */
const { t } = useI18n()

/** Touch actions that live on their own HUD buttons, not here. */
const ON_BUTTONS: ReadonlySet<HintId> = new Set(['block', 'parry', 'slide', 'tank', 'weapon', 'interact'])
/** Glyphs placed on the screen by region (the rest form the desktop row). */
const SPATIAL: ReadonlySet<HintId> = new Set(['move', 'look'])

// Until the mouse is captured a click captures it, so the click-driven cards
// (and the look glyph) wait; the keys still work and keep their glyphs.
const spots = computed(() => hud.hints.filter(h =>
  (SPATIAL.has(h.id) && !(hud.pointerFree && h.id === 'look')) || (h.family === 'touch' && !ON_BUTTONS.has(h.id))))
const row = computed(() => hud.pointerFree ? [] : hud.hints.filter(h => h.family === 'mouse' && !SPATIAL.has(h.id)))

const ACTION: Partial<Record<HintId, GameIconName>> = {
  fire: 'buster', charge: 'bolt', block: 'shield', parry: 'shield', slide: 'dodge', tank: 'flask', weapon: 'star'
}

/** Screen-reader sentences (the glyphs themselves are wordless). */
const ARIA: Record<HintId, Record<InputFamily, string>> = {
  move: { touch: 'tips.moveTouch', mouse: 'tips.moveKeys' },
  look: { touch: 'tips.moveTouch', mouse: 'tips.lookMouse' },
  walk: { touch: 'tips.moveTouch', mouse: 'tips.moveKeys' },
  fire: { touch: 'tips.fireTouch', mouse: 'tips.fireKeys' },
  charge: { touch: 'tips.charge', mouse: 'tips.charge' },
  block: { touch: 'tips.blockTouch', mouse: 'tips.blockKeys' },
  parry: { touch: 'tips.blockTouch', mouse: 'tips.blockKeys' },
  slide: { touch: 'tips.red', mouse: 'tips.dodgeKeys' },
  tank: { touch: 'tips.tank', mouse: 'tips.tank' },
  weapon: { touch: 'tips.weapon', mouse: 'tips.weapon' },
  interact: { touch: 'tips.chest', mouse: 'tips.chest' }
}
/** The sentence, with the keys as this keyboard and the bindings have them. */
const ariaOf = (h: HintView): string => t(ARIA[h.id][h.family], keyAriaParams(t, 'tips.spaceKey'))

type GlyphProps = InstanceType<typeof InputGlyph>['$props']
/** One input per glyph — never "X or Y", which reads as "X + Y". */
const glyph = (h: HintView): GlyphProps => {
  if (h.family === 'touch') {
    switch (h.id) {
      // A finger drawing an ∞: "drag here, any way". The ghost joystick it
      // replaces read as a dashed-circle icon, and Slide's arrow as "walk".
      // It stands for the camera too: the coach never raises `look` on touch.
      case 'move': return { kind: 'infinity' }
      case 'charge': return { kind: 'finger', mode: 'hold' }
      default: return { kind: 'finger', mode: 'tap' }
    }
  }
  switch (h.id) {
    case 'move': return { kind: 'wasd' }
    // A captured mouse looks by moving; where the capture is refused, by dragging.
    case 'look': return hud.lookMode === 'lock' ? { kind: 'mouse', button: 'none', move: true } : { kind: 'mouse', button: 'left', drag: true }
    case 'charge': return { kind: 'mouse', button: 'left', hold: true }
    // Block is HELD (the shield stays up while the button is down); a parry
    // is one timed press, landing as the card's closing ring meets the mouse.
    case 'block': return { kind: 'mouse', button: 'right', hold: true }
    case 'parry': return { kind: 'mouse', button: 'right', click: true }
    case 'slide': return { kind: 'key', code: 'Space', wide: true }
    case 'tank': return { kind: 'key', code: 'KeyH' }
    case 'weapon': return { kind: 'key', code: 'Digit1' }
    case 'interact': return { kind: 'key', code: 'KeyE' }
    default: return { kind: 'mouse', button: 'left', click: true }
  }
}

// ── The green "yes, that" flash ──
// Keyed on each glyph's success counter; the first sighting only records it,
// so a glyph never flashes just for appearing.
const lastFlash: Record<string, number> = {}
const approving = reactive<Record<string, boolean>>({})
watch(() => hud.hints, (hints) => {
  for (const h of hints) {
    const prev = lastFlash[h.id]
    lastFlash[h.id] = h.flash
    if (prev === undefined || h.flash <= prev) continue
    approving[h.id] = false
    requestAnimationFrame(() => {
      approving[h.id] = true
      setTimeout(() => { approving[h.id] = false }, 560)
    })
  }
})
</script>

<style scoped lang="sass">
.coach
  position: absolute
  inset: 0
  pointer-events: none
  transition: opacity 0.2s
  // A boss's name card is up (#151): a leftover look glyph sat in its band;
  // the big banner too (its band crossed a weapon lesson's keys).
  &.hushed
    opacity: 0
.spots, .row
  position: absolute
  inset: 0
.hint
  position: absolute
  display: flex
  flex-direction: column
  align-items: center
  gap: 6px
  filter: drop-shadow(0 3px 0 rgba(20, 26, 51, 0.55))
.glyph-box
  position: relative
  width: 100%
  aspect-ratio: 1
  display: grid
  place-items: center
  transition: filter 0.2s
.ok .glyph-box
  animation: approve-pop 0.5s cubic-bezier(0.2, 1.8, 0.4, 1)
  filter: drop-shadow(0 0 10px #8dff7a) drop-shadow(0 0 4px #8dff7a)
.approve
  position: absolute
  inset: -8%
  border-radius: 50%
  border: 5px solid #8dff7a
  box-shadow: 0 0 18px rgba(141, 255, 122, 0.8), inset 0 0 12px rgba(141, 255, 122, 0.5)
  animation: approve-ring 0.55s ease-out forwards
.act
  position: absolute
  right: -14%
  bottom: -4%
  width: 42%
  height: 42%
  padding: 7%
  border-radius: 50%
  background: radial-gradient(circle at 40% 30%, #9fe6ff, #3cc8ff 45%, #1f7fd0)
  border: 3px solid #141a33
  color: #fff
.pips
  display: flex
  gap: 5px
.pip
  width: clamp(9px, 1.8vmin, 12px)
  height: clamp(9px, 1.8vmin, 12px)
  border-radius: 50%
  border: 2px solid #141a33
  background: rgba(255, 255, 255, 0.35)
  transition: background 0.2s, transform 0.2s
  &.on
    background: #8dff7a
    box-shadow: 0 0 8px rgba(141, 255, 122, 0.9)
    transform: scale(1.15)
.check
  width: clamp(26px, 6vmin, 40px)
  height: clamp(26px, 6vmin, 40px)
  padding: 5px
  border-radius: 50%
  border: 3px solid #141a33
  background: #8dff7a
  color: #141a33
  animation: check-pop 0.45s cubic-bezier(0.2, 1.9, 0.4, 1)

// ── Where each glyph sits ──
.move
  left: calc(env(safe-area-inset-left, 0px) + 8vw)
  bottom: calc(env(safe-area-inset-bottom, 0px) + 20vh)
  width: clamp(92px, 20vmin, 150px)
  // The ∞ finger, drawn over the resting joystick (`Joystick.vue`): "drag
  // this". Centred with `translate`, which the enter / leave `transform`
  // animations leave alone.
  &.touch
    left: calc(env(safe-area-inset-left, 0px) + var(--joy-home-x))
    bottom: calc(env(safe-area-inset-bottom, 0px) + var(--joy-home-y))
    translate: -50% 50%
    width: clamp(120px, 40vmin, 150px)
    .glyph-box
      aspect-ratio: 265 / 184
.look
  right: calc(env(safe-area-inset-right, 0px) + 16vw)
  top: 34vh
  width: clamp(96px, 22vmin, 160px)
.walk.touch
  left: 50%
  top: 58vh
  width: clamp(76px, 16vmin, 110px)
  transform: translateX(-50%)
.fire.touch, .charge.touch
  right: calc(env(safe-area-inset-right, 0px) + 26vw)
  top: 50vh
  width: clamp(76px, 16vmin, 110px)
.floor
  position: absolute
  left: 50%
  top: 16%
  width: 90%
  height: 26%
  transform: translate(-50%, -50%)
  border: 4px solid rgba(255, 255, 255, 0.8)
  border-radius: 50%
  animation: floor-ring 1.2s ease-out infinite
  z-index: -1

// Desktop action cards: one row just under the crosshair.
.row
  display: flex
  justify-content: center
  align-items: flex-start
  gap: clamp(14px, 3vw, 28px)
  top: calc(50% + clamp(56px, 11vh, 96px))
  bottom: auto
  inset-inline: 0
.card
  position: relative
  width: clamp(80px, 14vmin, 112px)
  &.tank, &.weapon, &.interact
    width: clamp(58px, 10vmin, 80px)
  // The space bar is wide: its box keeps the key's proportions.
  &.slide.mouse
    width: clamp(96px, 16vmin, 130px)
    .glyph-box
      aspect-ratio: 124 / 64
  .floor
    top: 92%
// A lesson waits on it (the shield lesson): bigger, with a gold halo
// breathing behind it, so it reads before the drone's dive is over.
.card.urgent
  width: clamp(112px, 20vmin, 160px)
  .glyph-box
    animation: urgent-bob 1s ease-in-out infinite
.urgent-halo
  position: absolute
  inset: -22%
  border-radius: 50%
  border: 5px solid #ffd84a
  box-shadow: 0 0 22px rgba(255, 216, 74, 0.85), inset 0 0 16px rgba(255, 216, 74, 0.5)
  animation: urgent-halo 1s ease-out infinite
  z-index: -1
@keyframes urgent-halo
  from
    transform: scale(0.85)
    opacity: 1
  to
    transform: scale(1.3)
    opacity: 0
@keyframes urgent-bob
  0%, 100%
    transform: scale(1)
  50%
    transform: scale(1.08)
.parry-ring
  position: absolute
  inset: -30%
  border-radius: 50%
  border: 4px solid #ffffff
  animation: parry-close 1.1s ease-in infinite
// The parry's click on the ring's beat: InputGlyph presses at 30 % of its
// cycle, the ring closes at 85 % of 1.1 s — so the click runs 0.495 s ahead.
.parry .glyph-box
  --m-click-dur: 1.1s
  --m-click-delay: -0.495s

// The capture glyph sits ON the crosshair: that is where the click goes.
.capture
  position: absolute
  left: 50%
  top: 50%
  width: clamp(88px, 15vmin, 124px)
  aspect-ratio: 140 / 112
  transform: translate(-50%, -18%)
  filter: drop-shadow(0 3px 0 rgba(20, 26, 51, 0.55))
.capture-ring
  position: absolute
  left: 50%
  top: -34%
  width: 46%
  aspect-ratio: 1
  border-radius: 50%
  border: 4px solid #ffffff
  transform: translateX(-50%)
  animation: capture-pulse 1.3s ease-out infinite
@keyframes capture-pulse
  from
    transform: translateX(-50%) scale(0.6)
    opacity: 1
  to
    transform: translateX(-50%) scale(1.5)
    opacity: 0
.capture.hint-enter-from, .capture.hint-leave-to
  transform: translate(-50%, -18%) scale(0.6)

// Portrait phones: the thumbs sit lower and the screen is narrow.
@media (max-aspect-ratio: 1/1)
  .look
    right: calc(env(safe-area-inset-right, 0px) + 10vw)
    top: 40vh
  .fire.touch, .charge.touch
    right: calc(env(safe-area-inset-right, 0px) + 12vw)
    top: 54vh

.hint-enter-active
  transition: opacity 0.3s, transform 0.3s cubic-bezier(0.2, 1.6, 0.4, 1)
.hint-leave-active
  transition: opacity 0.35s, transform 0.35s
.hint-enter-from
  opacity: 0
  transform: scale(0.6)
.hint-leave-to
  opacity: 0
  transform: scale(1.25)
.walk.touch.hint-enter-from, .walk.touch.hint-leave-to
  transform: translateX(-50%) scale(0.6)

@keyframes approve-pop
  0%
    transform: scale(1)
  40%
    transform: scale(1.18)
  100%
    transform: scale(1)
@keyframes approve-ring
  from
    transform: scale(0.7)
    opacity: 1
  to
    transform: scale(1.35)
    opacity: 0
@keyframes check-pop
  from
    transform: scale(0)
@keyframes floor-ring
  from
    transform: translate(-50%, -50%) scale(0.5)
    opacity: 1
  to
    transform: translate(-50%, -50%) scale(1.4)
    opacity: 0
@keyframes parry-close
  0%
    transform: scale(1.6)
    opacity: 0
  30%
    opacity: 1
  85%
    transform: scale(1)
    opacity: 1
    border-color: #ffffff
  100%
    transform: scale(0.95)
    opacity: 0
    border-color: #7ff4ff
@media (prefers-reduced-motion: reduce)
  .ok .glyph-box, .approve, .floor, .parry-ring, .check, .capture-ring, .urgent-halo, .card.urgent .glyph-box
    animation: none
</style>
