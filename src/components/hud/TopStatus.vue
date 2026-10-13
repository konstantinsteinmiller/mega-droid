<template lang="pug">
  div.top-status(data-zone="status")
    BossChip.chip
    div.lvl(:aria-label="t('hud.level', { n: hud.level })")
      span.lv-num {{ hud.level }}
      div.xp
        div.xp-fill(:style="{ width: Math.min(100, hud.xp01 * 100) + '%' }")
    div.bolts(:aria-label="t('hud.bolts')" @pointerdown="registerQaAdTap()")
      span.bolt-icon
        GameIcon(name="nut")
      span.bolt-num {{ fmt(hud.bolts) }}
    button.mute(
      type="button"
      :class="{ muted: gameMuted }"
      :aria-label="t(gameMuted ? 'hud.unmute' : 'hud.mute')"
      :aria-pressed="gameMuted"
      @click="toggleGameMute"
    )
      GameIcon(:name="gameMuted ? 'sound-off' : 'sound'")
      KeyCap.kc(v-if="desk" code="F2")
    button.help(type="button" :aria-label="t('hud.help')" @click="help")
      GameIcon(name="help")
      KeyCap.kc(v-if="desk" code="F1")
    button.pause(type="button" :aria-label="t('ui.pause')" @click="$emit('pause')")
      GameIcon(name="pause")
      KeyCap.kc(v-if="desk" code="Escape")
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { hud } from '@/game/state/hud'
import GameIcon from '@/components/icons/GameIcon.vue'
import KeyCap from './KeyCap.vue'
import BossChip from './BossChip.vue'
import { formatCount } from '@/utils/localeNumber'
import { registerQaAdTap } from '@/use/useQaAdTrigger'
import { toggleHelp } from '@/game/help'
import { gameMuted, toggleGameMute } from '@/use/useGameMute'

defineEmits<{ pause: [] }>()
const { t, locale } = useI18n()
const fmt = (n: number) => formatCount(Math.round(n), locale.value)
/** Bring the control glyphs back (the coach's "?"). F1 and "?" do the same
 *  (GameScene's key handler): a captured mouse has no cursor to click with. */
const help = () => toggleHelp()
/** Mouse + keys: both buttons wear their key, like the action buttons. */
const desk = computed(() => hud.device === 'mouse')
</script>

<style scoped lang="sass">
.top-status
  position: absolute
  right: calc(env(safe-area-inset-right, 0px) + clamp(8px, 2.2vmin, 18px))
  top: calc(env(safe-area-inset-top, 0px) + clamp(8px, 2.2vmin, 18px))
  display: flex
  align-items: center
  gap: clamp(6px, 1.4vmin, 10px)
  pointer-events: none
// The level: a rank badge with the XP bar coming out of it. It was a gold disc
// in a dark pill, the same build as the Bolts pill beside it, and testers
// read the "1" as a coin count. So nothing of it is round or gold now: a
// teal shield with a pointed foot (rank, not money; and not the nut's
// hexagon), and no pill of its own. The XP bar is tucked under the badge's
// right edge and starts in the badge's teal, so the two read as one piece.
.lvl
  position: relative
  display: flex
  align-items: center
  filter: drop-shadow(0 2px 0 rgba(0, 0, 0, 0.35))
// The rim is the badge's own background and the face an inset copy of the
// same shape (a CSS border would be cut off by the clip-path).
.lv-num
  position: relative
  z-index: 1
  flex: 0 0 auto
  display: grid
  place-items: center
  width: clamp(22px, 5vmin, 30px)
  aspect-ratio: 7 / 8
  // The number sits in the shield's square body, above the point.
  padding-bottom: 0.35em
  background: #141a33
  clip-path: polygon(0 0, 100% 0, 100% 64%, 50% 100%, 0 64%)
  color: #0b2a33
  font-family: var(--font-pixel)
  font-size: clamp(9px, 2vmin, 12px)
  &::before
    content: ''
    position: absolute
    inset: 2px
    z-index: -1
    clip-path: polygon(0 0, 100% 0, 100% 64%, 50% 100%, 0 64%)
    background: linear-gradient(#c8fff4, #3fe6c6 55%, #129c8a)
.xp
  margin-left: -6px
  // The tucked-under end stays out of the fill's width.
  padding-left: 6px
  width: clamp(40px, 10vmin, 70px)
  height: 10px
  border: 2px solid #141a33
  border-left: 0
  border-radius: 0 5px 5px 0
  background: #0b1433
  overflow: hidden
.xp-fill
  height: 100%
  background: linear-gradient(90deg, #3fe6c6, #9dff5a)
  transition: width 0.3s ease-out
.bolts
  // Takes taps for the hidden QA ad trigger (useQaAdTrigger), so a tap here
  // never turns the view either.
  pointer-events: auto
  display: flex
  align-items: center
  gap: 4px
  padding: 3px 10px 3px 4px
  border-radius: 999px
  background: rgba(11, 20, 51, 0.72)
  border: 2px solid #141a33
  color: #fff
  font-family: var(--font-pixel)
  font-size: clamp(9px, 2vmin, 12px)
.bolt-icon
  width: clamp(18px, 4vmin, 24px)
  height: clamp(18px, 4vmin, 24px)
  color: #ffd84a
// The help button's twin (same size, same rim keycap), in slate so the one
// that teaches and the one that silences are never read as a pair of the same
// thing. Muted, it dims and the glyph crosses out — the state is on the
// button, not in a toast.
.mute
  position: relative
  pointer-events: auto
  width: clamp(32px, 7vmin, 42px)
  height: clamp(32px, 7vmin, 42px)
  border-radius: 50%
  border: 3px solid #141a33
  background: linear-gradient(#5a6c94, #34436a)
  color: #fff
  padding: clamp(5px, 1.4vmin, 8px)
  flex: 0 0 auto
  box-shadow: 0 3px 0 rgba(0, 0, 0, 0.35)
  &:active
    transform: translateY(2px)
  &.muted
    background: linear-gradient(#3a4258, #242a3c)
    color: #ff9a8a
.help
  position: relative
  pointer-events: auto
  width: clamp(32px, 7vmin, 42px)
  height: clamp(32px, 7vmin, 42px)
  border-radius: 50%
  border: 3px solid #141a33
  background: linear-gradient(#8fe0ff, #3c8cff)
  color: #fff
  padding: clamp(5px, 1.4vmin, 8px)
  flex: 0 0 auto
  box-shadow: 0 3px 0 rgba(0, 0, 0, 0.35)
  &:active
    transform: translateY(2px)
.pause
  position: relative
  pointer-events: auto
  width: clamp(36px, 8vmin, 48px)
  height: clamp(36px, 8vmin, 48px)
  border-radius: 12px
  border: 3px solid #141a33
  background: linear-gradient(#3a5a9a, #22386a)
  color: #fff
  padding: clamp(6px, 1.6vmin, 10px)
  flex: 0 0 auto
  box-shadow: 0 3px 0 rgba(0, 0, 0, 0.35)
  &:active
    transform: translateY(2px)
// The key that works the button, tucked on its bottom rim (as on the action
// buttons): Esc pauses, F1 brings the control glyphs back, F2 mutes. A size
// smaller than theirs, so "Esc" stays inside the pause button's width. Nested,
// so it outranks KeyCap's own font size on specificity.
.mute .kc, .help .kc, .pause .kc
  position: absolute
  left: 50%
  bottom: -0.6em
  transform: translateX(-50%)
  font-size: clamp(9px, 1.9vmin, 12px)
  pointer-events: none
// Portrait: the row is already as wide as a 320 px phone allows, so the boss
// chip steps down under its right end — clear of the compass strip, which
// drops to the same height but stays centred and narrower.
@media (max-aspect-ratio: 1/1)
  .top-status
    gap: clamp(4px, 1.2vmin, 8px)
  .chip
    position: absolute
    right: 0
    top: calc(100% + 10px)
// The narrowest phones: shave the pills rather than let the row run into the
// energy bars at the left edge.
@media (max-width: 380px)
  .xp
    width: 34px
  .bolts
    padding-right: 7px
  .mute, .help
    width: 30px
    height: 30px
    padding: 5px
  .pause
    width: 33px
    height: 33px
    padding: 6px
</style>
