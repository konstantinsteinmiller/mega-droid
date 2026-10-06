<template lang="pug">
  div.controls-panel(:class="family")
    div.group(v-for="g in groups" :key="g.key" :data-group="g.key")
      div.row(v-for="r in g.rows" :key="r.key" :data-row="r.key" role="img" :aria-label="ariaOf(r)")
        div.input(:class="r.glyph.kind")
          InputGlyph(v-bind="r.glyph")
          //- A parry is one press ON the beat: the ring closes as it lands,
          //- as on the coach's parry card.
          span.parry-ring(v-if="r.key === 'parry'")
        svg.to(viewBox="0 0 22 14" aria-hidden="true")
          path(d="M2 7H18M13 2L18 7L13 12")
        div.action(aria-hidden="true")
          span.icon
            GameIcon(:name="r.action")
          span.label(:data-label="r.label") {{ t(r.label) }}
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import InputGlyph from './InputGlyph.vue'
import GameIcon from '@/components/icons/GameIcon.vue'
import type { GameIconName } from '@/components/icons/iconNames'
import { input } from '@/game/boot'
import { actionKeyLabel } from '@/game/engine/keyLabels'
import { keyAriaParams } from './keyAria'
import { hud } from '@/game/state/hud'

/**
 * Every control at a glance, in the pause menu, for the input family in use.
 * Each row reads "do this → to do that": the input glyph (the same drawings
 * the coach uses in play, moving the same way) in one fixed box, so a hold, a
 * tap and a click line up down the column; an arrow; the action's icon and
 * its verb. The pause menu is a reference screen, so the verb is written out
 * here, unlike in play. Rows come in three groups (movement, combat, items and
 * the rest), split by a faint rule. The full sentence is the row's
 * screen-reader label.
 */
const { t } = useI18n()

type GlyphProps = InstanceType<typeof InputGlyph>['$props']
interface Row {
  key: string
  glyph: GlyphProps
  action: GameIconName
  /** The visible verb (an i18n key). */
  label: string
  /** The screen-reader sentence (an i18n key). Without one, a one-key row
   *  reads its key and its verb: "H: Repair Gel". */
  aria?: string
}
interface Group { key: 'movement' | 'combat' | 'items'; rows: Row[] }

const family = computed(() => input.device)
const groups = computed<Group[]>(() => family.value === 'touch'
  ? [
      {
        key: 'movement',
        rows: [
          // The finger tracing an ∞, as in play, and no look row: the ∞
          // stands for dragging, camera included.
          { key: 'move', glyph: { kind: 'infinity' }, action: 'boots', label: 'pause.label.move', aria: 'pause.touch.move' },
          { key: 'slide', glyph: { kind: 'finger', mode: 'tap' }, action: 'dodge', label: 'combat.slide', aria: 'tips.red' },
          // No jump button: walking off an edge leaps by itself (playtesters
          // looked for one).
          { key: 'leap', glyph: { kind: 'infinity' }, action: 'up', label: 'pause.label.leap', aria: 'pause.leapHint' }
        ]
      },
      {
        key: 'combat',
        rows: [
          { key: 'fire', glyph: { kind: 'finger', mode: 'tap' }, action: 'buster', label: 'combat.fire', aria: 'pause.touch.fire' },
          { key: 'charge', glyph: { kind: 'finger', mode: 'hold' }, action: 'bolt', label: 'hero.stat.charge', aria: 'pause.touch.fire' },
          // The shield button: HOLD it to block, TAP it on the beat to parry.
          { key: 'block', glyph: { kind: 'finger', mode: 'hold' }, action: 'shield', label: 'combat.block', aria: 'pause.touch.block' },
          { key: 'parry', glyph: { kind: 'finger', mode: 'tap' }, action: 'shield', label: 'pause.label.parry', aria: 'tips.blockTouch' }
        ]
      },
      {
        key: 'items',
        rows: [
          { key: 'tank', glyph: { kind: 'finger', mode: 'tap' }, action: 'flask', label: 'combat.tank', aria: 'lesson.gelTouch' },
          { key: 'use', glyph: { kind: 'finger', mode: 'tap' }, action: 'chest', label: 'pause.label.interact', aria: 'pause.touch.use' }
        ]
      }
    ]
  : [
      {
        key: 'movement',
        rows: [
          { key: 'move', glyph: { kind: 'wasd' }, action: 'boots', label: 'pause.label.move', aria: 'pause.keys.move' },
          {
            key: 'look',
            glyph: hud.lookMode === 'lock' ? { kind: 'mouse', button: 'none', move: true } : { kind: 'mouse', button: 'left', drag: true },
            action: 'replay',
            label: 'pause.label.look',
            aria: 'pause.keys.look'
          },
          { key: 'turn', glyph: { kind: 'key', code: 'ArrowLeft' }, action: 'replay', label: 'pause.label.turn', aria: 'pause.label.turn' },
          { key: 'slide', glyph: { kind: 'key', wide: true }, action: 'dodge', label: 'combat.slide', aria: 'pause.keys.slide' },
          { key: 'leap', glyph: { kind: 'wasd' }, action: 'up', label: 'pause.label.leap', aria: 'pause.leapHint' }
        ]
      },
      {
        key: 'combat',
        rows: [
          { key: 'fire', glyph: { kind: 'mouse', button: 'left', click: true }, action: 'buster', label: 'combat.fire', aria: 'pause.keys.fire' },
          { key: 'charge', glyph: { kind: 'mouse', button: 'left', hold: true }, action: 'bolt', label: 'hero.stat.charge', aria: 'pause.keys.fire' },
          // Held, like the touch shield: the right button stays down. A parry
          // is one right click on the beat.
          { key: 'block', glyph: { kind: 'mouse', button: 'right', hold: true }, action: 'shield', label: 'combat.block', aria: 'pause.keys.block' },
          { key: 'parry', glyph: { kind: 'mouse', button: 'right', click: true }, action: 'shield', label: 'pause.label.parry', aria: 'tips.blockKeys' },
          { key: 'weapon', glyph: { kind: 'key', code: 'Digit1' }, action: 'star', label: 'hero.weapons', aria: 'pause.keys.more' },
          { key: 'target', glyph: { kind: 'key', code: 'Tab' }, action: 'range', label: 'pause.label.target' }
        ]
      },
      {
        key: 'items',
        rows: [
          { key: 'tank', glyph: { kind: 'key', code: 'KeyH' }, action: 'flask', label: 'combat.tank' },
          { key: 'use', glyph: { kind: 'key', code: 'KeyE' }, action: 'chest', label: 'pause.label.interact' },
          { key: 'beam', glyph: { kind: 'key', code: 'KeyB' }, action: 'up', label: 'hud.beamOut' },
          // The HUD's speaker button wears F2 too (TopStatus).
          { key: 'mute', glyph: { kind: 'key', code: 'F2' }, action: 'sound', label: 'hud.mute' }
        ]
      }
    ])

const ariaOf = (r: Row): string => r.aria
  ? t(r.aria, keyAriaParams(t))
  : t('pause.keys.press', { key: actionKeyLabel(r.glyph.code ?? ''), action: t(r.label) })
</script>

<style scoped lang="sass">
// One box for every input glyph (∞, finger, mouse, keys): the arrows and the
// actions line up down each column. Sized by the short side; see the short-
// viewport rules at the end.
.controls-panel
  --box-w: clamp(64px, 17vmin, 84px)
  --icon: clamp(28px, 6.4vmin, 38px)
  --gap: clamp(6px, 1.4vmin, 10px)
  display: flex
  flex-direction: column
  gap: var(--gap)
  text-align: start
// Each group is its own grid; every group has the same width, so the columns
// of one line up with the next. A row wants ~236 px: two glyphs, an icon and
// a verb like "Заряженный выстрел" on two lines, whole words. At 200 px the
// verb got ~35 px and broke letter by letter. One column on a phone held
// upright, two on a phone on its side, three on a desktop (PauseModal widens
// its frame for that).
.group
  display: grid
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 236px), 1fr))
  gap: var(--gap)
  & + .group
    padding-top: var(--gap)
    border-top: 2px solid rgba(159, 230, 255, 0.16)
.row
  display: flex
  align-items: center
  gap: 8px
  min-width: 0
  padding: 8px 10px
  border-radius: 12px
  background: rgba(0, 0, 0, 0.25)
.input
  position: relative
  flex: 0 0 auto
  width: var(--box-w)
  height: calc(var(--box-w) * 0.7)
  // A single keycap would be the biggest drawing in the legend.
  &.key
    padding: calc(var(--box-w) * 0.07) 0
.to
  flex: 0 0 auto
  width: 18px
  height: 12px
  overflow: visible
  path
    fill: none
    stroke: #9fe6ff
    stroke-width: 3
    stroke-linecap: round
    stroke-linejoin: round
.action
  display: flex
  align-items: center
  gap: 8px
  flex: 1 1 auto
  min-width: 0
.icon
  flex: 0 0 auto
  width: var(--icon)
  height: var(--icon)
  padding: calc(var(--icon) * 0.16)
  border-radius: 50%
  border: 3px solid #141a33
  background: radial-gradient(circle at 40% 30%, #9fe6ff, #3cc8ff 45%, #1f7fd0)
  color: #fff
// The verb: wraps (to two lines at most in every shipped language), never
// ellipsised.
.label
  min-width: 0
  font-family: var(--font-ui)
  font-size: clamp(12px, 3.3vmin, 15px)
  line-height: 1.15
  color: #fff
  overflow-wrap: break-word
  hyphens: auto

// The parry's beat: a ring closing on the glyph as the press lands. The mouse
// clicks at 30 % of its cycle and the ring closes at 85 % of 1.1 s, so the
// click runs 0.495 s ahead (as on the coach's card); the finger presses at
// 40 % of 1.2 s, so its ring runs 0.54 s ahead.
.parry-ring
  position: absolute
  left: 50%
  top: 50%
  height: 100%
  aspect-ratio: 1
  border-radius: 50%
  border: 3px solid #ffffff
  translate: -50% -50%
  pointer-events: none
  animation: parry-close 1.1s ease-in infinite
.row[data-row="parry"] .input
  --m-click-dur: 1.1s
  --m-click-delay: -0.495s
.input.finger .parry-ring
  animation-duration: 1.2s
  animation-delay: -0.54s
@keyframes parry-close
  0%
    transform: scale(1.3)
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
// Reduced motion: the glyphs take their still poses (InputGlyph), and the
// parry ring stands closed round the press.
@media (prefers-reduced-motion: reduce)
  .parry-ring
    animation: none

// Short viewports (a 1:1 portal frame, 1280×720, a phone on its side): the
// boxes size by HEIGHT, so the rows stay short: the whole menu stands at
// 1280×720, and on a phone on its side the legend scrolls inside the frame.
@media (max-height: 780px)
  .controls-panel
    --box-w: clamp(50px, 8.4vh, 76px)
    --icon: clamp(22px, 4.4vh, 34px)
    --gap: clamp(4px, 0.9vh, 10px)
  .row
    gap: 6px
    padding: clamp(4px, 0.8vh, 8px) clamp(6px, 1.2vh, 10px)
  .action
    gap: 6px
  .label
    font-size: clamp(11px, 2vh, 15px)
</style>
