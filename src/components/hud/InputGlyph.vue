<template lang="pug">
  //- ── WASD cluster ──
  svg.glyph(v-if="kind === 'wasd'" viewBox="0 0 176 116" aria-hidden="true")
    g(v-for="k in WASD" :key="k.c" :transform="`translate(${k.x} ${k.y})`")
      rect(x="2" y="8" width="54" height="50" rx="11" class="lip")
      rect(x="2" y="2" width="54" height="50" rx="11" class="cap" :class="{ lit: k.c === litKey }")
      text(x="29" y="36" class="label") {{ actionKeyLabel(k.c) }}

  //- ── A key and its taught alternate: 1 / Q (#174) ──
  svg.glyph(v-else-if="kind === 'key' && alt" viewBox="0 0 140 64" aria-hidden="true")
    g(v-for="(c, n) in [code, alt]" :key="c" :transform="`translate(${n * 80} 0)`")
      rect(x="2" y="10" width="56" height="52" rx="11" class="lip")
      rect(x="2" y="2" width="56" height="52" rx="11" class="cap")
      text(x="30" y="37" class="label") {{ n ? keyLabel(c) : actionKeyLabel(c) }}
    path(d="M77 12 L63 50" class="or")

  //- ── One key ──
  svg.glyph(v-else-if="kind === 'key'" :viewBox="isWide ? '0 0 124 64' : '0 0 60 64'" aria-hidden="true")
    rect(x="2" y="10" :width="isWide ? 120 : 56" height="52" rx="11" class="lip")
    rect(x="2" y="2" :width="isWide ? 120 : 56" height="52" rx="11" class="cap")
    text(v-if="!isWide" x="30" y="37" class="label") {{ code ? actionKeyLabel(code) : label }}
    rect(v-else x="34" y="30" width="56" height="7" rx="3.5" class="spacebar")

  //- ── Mouse: the button to press lit and pushed in — a click, or a hold ──
  svg.glyph(v-else-if="kind === 'mouse'" viewBox="0 0 140 112" aria-hidden="true" :class="`m-${mouseMode}`" :data-lit="lit ?? 'none'")
    g(v-if="drag || move")
      path.chev(d="M6 56 L18 44 M6 56 L18 68" class="arrow l")
      path.chev(d="M134 56 L122 44 M134 56 L122 68" class="arrow r")
    //- hold: a glow and a timer ring round the mouse, filling from twelve
    //- toward the lit side while the button stays down
    g(v-if="mouseMode === 'hold' && lit")
      defs
        radialGradient(:id="glowId")
          stop(offset="0.5" stop-color="#7ff4ff" stop-opacity="0")
          stop(offset="0.78" stop-color="#7ff4ff" stop-opacity="0.9")
          stop(offset="1" stop-color="#7ff4ff" stop-opacity="0")
      circle.m-glow(:cx="MOUSE_MID.x" :cy="MOUSE_MID.y" r="62" :fill="`url(#${glowId})`")
      path(v-for="p in MOUSE_HOLD[lit]" :key="p.cls" :class="p.cls" :d="p.d" :pathLength="p.len")
    g(:class="{ sway: drag || move }")
      rect.body(v-bind="MOUSE_BODY")
      //- the lit button's well: a dark rim shows round its top when it sinks
      path.well(v-if="lit" :d="MOUSE_BUTTONS[lit].d")
      path(v-for="s in MOUSE_SIDES" :key="s" :d="MOUSE_BUTTONS[s].d" :class="s === lit ? 'hot' : 'btn'" :data-button="s")
      line(x1="70" y1="12" x2="70" y2="52" class="seam")
      line(x1="41" y1="52" x2="99" y2="52" class="seam")
      rect(x="67.5" y="22" width="5" height="13" rx="2.5" class="wheel")
      //- the press: a ripple from the lit button's own centre
      circle.m-ripple(v-if="lit && (mouseMode === 'click' || mouseMode === 'hold')" :cx="MOUSE_BUTTONS[lit].cx" :cy="MOUSE_BUTTONS[lit].cy" r="12")
    //- a click: marks thrown off the lit button's outer corner
    path.m-marks(v-if="lit && mouseMode === 'click'" :d="MOUSE_BUTTONS[lit].marks")

  //- ── Ghost joystick with a circling thumb ──
  svg.glyph(v-else-if="kind === 'joystick'" viewBox="0 0 120 120" aria-hidden="true")
    circle(cx="60" cy="60" r="50" class="stick-base")
    circle(cx="60" cy="60" r="50" class="stick-rim")
    g.knob
      circle(cx="60" cy="60" r="20" class="stick-knob")
      circle(cx="54" cy="54" r="6" class="stick-shine")

  //- ── A finger tracing an ∞: drag to move (touch) ──
  svg.glyph(v-else-if="kind === 'infinity'" :viewBox="INFINITY.viewBox" aria-hidden="true")
    path.inf-halo(:d="INFINITY.d")
    path.inf-guide(:d="INFINITY.d")
    //- Twice: riding the ∞, and resting on it for reduced motion (CSS shows
    //- one). SMIL moves the finger and its streak on one clock, so the
    //- streak's head never leaves the fingertip.
    g(v-for="pose in POSES" :key="pose" :class="`inf-${pose}`")
      path.inf-streak(:d="INFINITY.d" :stroke-dasharray="INFINITY.dashArray" :stroke-dashoffset="INFINITY.dashRest")
        animate(
          v-if="pose === 'live'"
          attributeName="stroke-dashoffset"
          :values="INFINITY.dashOffsets"
          :keyTimes="INFINITY.keyTimes"
          calcMode="linear"
          :dur="INFINITY.dur"
          repeatCount="indefinite"
        )
      g
        animateMotion(
          v-if="pose === 'live'"
          :path="INFINITY.motion"
          :keyPoints="INFINITY.keyPoints"
          :keyTimes="INFINITY.keyTimes"
          calcMode="linear"
          :dur="INFINITY.dur"
          repeatCount="indefinite"
        )
        g(:transform="INFINITY.hand")
          g.hand-outline
            rect(v-for="(r, i) in HAND" :key="`o${i}`" v-bind="r")
          g.hand-fill
            rect(v-for="(r, i) in HAND" :key="`f${i}`" v-bind="r")
          rect(x="62" y="10" width="16" height="10" rx="5" class="nail")

  //- ── A finger: tap or hold (dragging is the ∞'s) ──
  svg.glyph(v-else viewBox="0 0 140 130" aria-hidden="true")
    g(v-if="mode === 'tap'")
      circle.ripple(cx="70" cy="18" r="12")
      circle.ripple.late(cx="70" cy="18" r="12")
    //- hold: the timer ring round the fingertip (behind the hand), 3/4 full
    g(v-if="mode === 'hold'")
      path(v-for="p in FINGER_HOLD" :key="p.cls" :class="p.cls" :d="p.d" :pathLength="p.len")
    g(:class="{ press: mode === 'tap', 'hold-press': mode === 'hold' }")
      //- outline pass (thick, dark) then fill pass: overlapping parts read as one hand
      g.hand-outline
        rect(v-for="(r, i) in HAND" :key="`o${i}`" v-bind="r")
      g.hand-fill
        rect(v-for="(r, i) in HAND" :key="`f${i}`" v-bind="r")
      rect(x="62" y="10" width="16" height="10" rx="5" class="nail")
</template>

<script setup lang="ts">
/**
 * Wordless input glyphs for the control coach (and the pause menu's controls
 * panel): keycaps, the WASD cluster, a mouse with the button to press lit, a
 * finger tracing an ∞ (drag to move), and a finger that taps or holds.
 * Pure SVG + CSS (+ SMIL for the ∞), in the HUD's toon style (white fill,
 * navy outline, yellow = "press this"). Key LETTERS are drawn; words never are.
 *
 * Every glyph must read in a single frozen frame (a screenshot, a player who
 * glances once, reduced motion): motion adds to the meaning, never carries
 * it alone. A hold is a timer ring standing 3/4 full, a tap a ripple, a move
 * an ∞ with the finger on it.
 *
 * The mouse says WHICH button first: only that one is coloured, solid (see
 * `glyphGeometry.ts` for how the old one was misread). A click presses it
 * once — it sinks into its well, a ripple leaves its centre, marks fly off its
 * corner. A hold keeps it down while a ring round the mouse (on a faint track
 * with a stopwatch tick, so any frame shows a timer) fills toward that side
 * and a glow builds, then lets go.
 */
import { computed, useId } from 'vue'
import { actionKeyLabel, keyLabel } from '@/game/engine/keyLabels'
import { boundCode, shownAltCode } from '@/game/engine/keyBindings'
import {
  FINGER_HOLD, HAND, INFINITY, MOUSE_BODY, MOUSE_BUTTONS, MOUSE_HOLD, MOUSE_MID, MOUSE_SIDES, type MouseSide
} from './glyphGeometry'

const props = withDefaults(defineProps<{
  /** `joystick` is the old touch-move glyph, kept for callers; the coach draws `infinity`. */
  kind: 'wasd' | 'key' | 'mouse' | 'joystick' | 'finger' | 'infinity'
  /** key: the key's letter. */
  label?: string
  /** key: the physical key (`KeyE`); its letter follows the keyboard layout. */
  code?: string
  /** wasd: the key to press, lit yellow (its DEFAULT code, e.g. `KeyW`: forward). */
  litKey?: string
  /** key: the wide space bar. */
  wide?: boolean
  /** mouse: which button is lit (none: just move the mouse). */
  button?: 'left' | 'right' | 'none'
  /** mouse: sway with arrows, the button held down (drag to look). */
  drag?: boolean
  /** mouse: sway with arrows, no button (a captured mouse looks by moving). */
  move?: boolean
  /** mouse: a HOLD — the button sinks and stays down while a ring round the
   *  mouse fills and a glow builds, then lets go (charge, block). */
  hold?: boolean
  /** mouse: a CLICK — one short press and release, a ripple from the
   *  button's centre and marks off its corner. */
  click?: boolean
  /** finger: tap / hold. */
  mode?: 'tap' | 'hold'
}>(), { label: '', code: '', litKey: '', wide: false, button: 'left', drag: false, move: false, hold: false, click: false, mode: 'tap' })

/** Physical keys: an AZERTY keyboard prints Z Q S D on them. */
const WASD = [
  { c: 'KeyW', x: 59, y: 0 },
  { c: 'KeyA', x: 0, y: 58 },
  { c: 'KeyS', x: 59, y: 58 },
  { c: 'KeyD', x: 118, y: 58 }
]
/** The space bar stays a bar only while the action is still on Space
 *  (`keyBindings.ts`); rebound, it is a key with its letter. */
const isWide = computed(() => props.wide && (!props.code || boundCode(props.code) === 'Space'))
/** A key's taught alternate, drawn as a second cap after a slash ("1 / Q":
 *  either, never both — a slash, not a plus). */
const alt = computed(() => props.kind === 'key' && props.code && !props.wide ? shownAltCode(props.code) : null)
/** The mouse button to press; none when the mouse only moves. */
const lit = computed<MouseSide | null>(() => props.move || props.button === 'none' ? null : props.button)
/** What the mouse glyph acts out. */
const mouseMode = computed(() => props.move ? 'move' : props.drag ? 'drag' : props.hold ? 'hold' : props.click ? 'click' : 'lit')
/** The hold glow's gradient, one per glyph on screen. */
const glowId = `mglow-${useId()}`
/** The ∞ finger, in motion and at rest. */
const POSES = ['live', 'rest'] as const
</script>

<style scoped lang="sass">
.glyph
  display: block
  width: 100%
  height: 100%
  overflow: visible
.lip
  fill: #141a33
.cap
  fill: #f4f7ff
  stroke: #141a33
  stroke-width: 3.5
  // The key to press: yellow, "press this", as on the mouse.
  &.lit
    fill: #ffd84a
.label
  font-family: var(--font-ui)
  font-size: 26px
  fill: #141a33
  text-anchor: middle
.spacebar
  fill: #9aa6c8
.or
  stroke: #ffffff
  stroke-width: 5
  stroke-linecap: round
  filter: drop-shadow(0 2px 0 #141a33)
// Mouse. Only the button to press is coloured — solid yellow, never pulsing
// toward the white of the other one — and the wheel is a small grey slot.
.body
  fill: #f4f7ff
  stroke: #141a33
  stroke-width: 4
.btn
  fill: transparent
.hot
  fill: #ffd84a
  stroke: #141a33
  stroke-width: 3
  stroke-linejoin: round
// Under the lit button: the dark hole a pressed button sinks into.
.well
  fill: #141a33
.seam
  stroke: #141a33
  stroke-width: 3
.wheel
  fill: #c3cbe2
  stroke: #141a33
  stroke-width: 2
// The press: a navy ring out of the lit button's centre, inside its face.
.m-ripple
  fill: none
  stroke: #141a33
  stroke-width: 3
  opacity: 0
  transform-box: fill-box
  transform-origin: center
// A click: three marks off the lit button's outer corner.
.m-marks
  fill: none
  stroke: #ffffff
  stroke-width: 5
  stroke-linecap: round
  filter: drop-shadow(0 2px 0 #141a33)
  opacity: 0
// A hold's fill (navy edge, cyan) and the glow behind the mouse.
.m-fill-edge, .m-fill
  fill: none
  stroke-linecap: round
  stroke-dasharray: 100
  stroke-dashoffset: 100
.m-fill-edge
  stroke: #141a33
  stroke-width: 11
.m-fill
  stroke: #7ff4ff
  stroke-width: 7
.m-glow
  opacity: 0
// One short press and release, on a 1.2 s beat (a parry card retimes it with
// --m-click-dur / --m-click-delay to land as its ring closes).
.m-click
  --m-beat: var(--m-click-dur, 1.2s) var(--m-click-delay, 0s)
  .hot
    animation: m-click var(--m-beat) ease-in-out infinite
  .m-ripple
    animation: m-ripple-click var(--m-beat) ease-out infinite
  .m-marks
    animation: m-marks-click var(--m-beat) ease-out infinite
// Held: pressed at 12 %, down while the ring fills to 78 % and the glow
// builds, full to 84 %, let go by 90 %.
.m-hold
  .hot
    animation: m-hold 2.4s ease-in-out infinite
  .m-ripple
    animation: m-ripple-hold 2.4s ease-out infinite
  .m-fill-edge, .m-fill
    animation: m-fill 2.4s linear infinite
  .m-glow
    animation: m-glow 2.4s ease-in infinite
  // The standing three quarters is the reduced-motion pose only.
  .hold-edge, .hold-arc
    display: none
// Dragging to look: the button stays down while the mouse sways.
.m-drag .hot
  transform: translateY(3px)
  fill: #f0ae22
// Arrows (drag)
.arrow
  fill: none
  stroke: #ffffff
  stroke-width: 6
  stroke-linecap: round
  stroke-linejoin: round
  filter: drop-shadow(0 2px 0 #141a33)
  animation: arrow-nudge 1.2s ease-in-out infinite
  &.r
    animation-delay: 0.6s
// Joystick
.stick-base
  fill: rgba(255, 255, 255, 0.14)
.stick-rim
  fill: none
  stroke: rgba(255, 255, 255, 0.75)
  stroke-width: 4
  stroke-dasharray: 10 8
.stick-knob
  fill: #f4f7ff
  stroke: #141a33
  stroke-width: 4
.stick-shine
  fill: #ffffff
.knob
  animation: knob-circle 2.2s linear infinite
  transform-origin: 60px 60px
// ∞: a soft guide, and a bright streak that ends at the fingertip
.inf-halo, .inf-guide, .inf-streak
  fill: none
  stroke: #ffffff
  stroke-linecap: round
  stroke-linejoin: round
.inf-halo
  stroke-width: 16
  opacity: 0.14
.inf-guide
  stroke-width: 6
  opacity: 0.5
.inf-streak
  stroke-width: 8
.inf-rest
  display: none
// Hand
.hand-outline rect
  fill: #141a33
  stroke: #141a33
  stroke-width: 9
.hand-fill rect
  fill: #f4f7ff
.nail
  fill: #dfe7ff
// Motion
.sway
  animation: sway 1.4s ease-in-out infinite
.press
  animation: press 1.2s ease-in-out infinite
  transform-origin: 70px 60px
// A hold presses down while the ring fills, and lets go as it completes.
.hold-press
  animation: hold-press 1.6s ease-in-out infinite
  transform-origin: 70px 60px
.ripple
  fill: none
  stroke: #ffffff
  stroke-width: 4
  transform-box: fill-box
  transform-origin: center
  animation: ripple 1.2s ease-out infinite
  &.late
    animation-delay: 0.6s
// Hold: a timer ring standing 3/4 full (static: it is what a still frame
// shows), with the fill sweeping round it in motion.
.hold-track, .hold-edge, .hold-arc, .hold-ring, .hold-tick-edge, .hold-tick
  fill: none
  stroke-linecap: round
.hold-track
  stroke: #ffffff
  stroke-width: 5
  opacity: 0.3
.hold-edge
  stroke: #141a33
  stroke-width: 11
.hold-arc
  stroke: #7ff4ff
  stroke-width: 7
.hold-ring
  stroke: #ffffff
  stroke-width: 3
  stroke-dasharray: 100
  stroke-dashoffset: 100
  animation: hold-fill 1.6s linear infinite
.hold-tick-edge
  stroke: #141a33
  stroke-width: 8
.hold-tick
  stroke: #f4f7ff
  stroke-width: 3.5
@keyframes m-click
  0%, 24%, 50%, 100%
    transform: translateY(0)
    fill: #ffd84a
  30%, 42%
    transform: translateY(3px)
    fill: #f0ae22
@keyframes m-ripple-click
  0%, 24%
    transform: scale(0.3)
    opacity: 0
  28%
    transform: scale(0.35)
    opacity: 1
  72%, 100%
    transform: scale(1.1)
    opacity: 0
@keyframes m-marks-click
  0%, 26%
    opacity: 0
  30%, 52%
    opacity: 1
  66%, 100%
    opacity: 0
@keyframes m-hold
  0%, 6%, 90%, 100%
    transform: translateY(0)
    fill: #ffd84a
  12%, 84%
    transform: translateY(3px)
    fill: #f0ae22
@keyframes m-ripple-hold
  0%, 10%
    transform: scale(0.3)
    opacity: 0
  12%
    transform: scale(0.35)
    opacity: 1
  36%, 100%
    transform: scale(1.1)
    opacity: 0
@keyframes m-fill
  0%, 12%
    stroke-dashoffset: 100
    opacity: 0
  13%
    stroke-dashoffset: 99
    opacity: 1
  78%, 84%
    stroke-dashoffset: 0
    opacity: 1
  90%, 100%
    stroke-dashoffset: 0
    opacity: 0
@keyframes m-glow
  0%, 12%
    opacity: 0
  76%
    opacity: 0.55
  80%
    opacity: 0.95
  84%
    opacity: 0.8
  90%, 100%
    opacity: 0
@keyframes arrow-nudge
  50%
    opacity: 0.35
@keyframes knob-circle
  0%
    transform: translate(16px, 0)
  25%
    transform: translate(0, -16px)
  50%
    transform: translate(-16px, 0)
  75%
    transform: translate(0, 16px)
  100%
    transform: translate(16px, 0)
@keyframes sway
  0%, 100%
    transform: translateX(-16px)
  50%
    transform: translateX(16px)
@keyframes press
  0%, 100%
    transform: translateY(0) scale(1)
  40%
    transform: translateY(5px) scale(0.96)
@keyframes hold-press
  0%, 88%, 100%
    transform: translateY(0) scale(1)
  10%, 78%
    transform: translateY(5px) scale(0.96)
@keyframes ripple
  from
    transform: scale(0.4)
    opacity: 0.9
  to
    transform: scale(2.2)
    opacity: 0
// Pressed at 10 %, full at 78 %, let go and fade: the same clock as hold-press.
@keyframes hold-fill
  0%, 10%
    stroke-dashoffset: 100
    opacity: 1
  78%
    stroke-dashoffset: 0
    opacity: 1
  90%, 100%
    stroke-dashoffset: 0
    opacity: 0
// Reduced motion: still poses that still read. The finger rests on the ∞
// with its streak behind it, the hold ring stands at 3/4, a tap keeps one
// ripple round the fingertip. The mouse: a click keeps its ripple and marks
// on the lit button; a hold keeps that button down inside a ring standing
// three quarters round on its side, softly lit.
@media (prefers-reduced-motion: reduce)
  .sway, .press, .hold-press, .knob, .ripple, .arrow, .hot, .hold-ring, .m-ripple, .m-marks, .m-fill-edge, .m-fill, .m-glow
    animation: none
  // The mouse's press cycles are set under .m-click / .m-hold, which outrank
  // the flat rule above: still them at the same weight.
  .m-click, .m-hold
    .hot, .m-ripple, .m-marks, .m-fill-edge, .m-fill, .m-glow
      animation: none
  .ripple
    transform: scale(1.7)
    opacity: 0.7
    &.late
      display: none
  .inf-live
    display: none
  .inf-rest
    display: inline
  .m-click
    .m-ripple
      transform: scale(0.9)
      opacity: 0.8
    .m-marks
      opacity: 1
  .m-hold
    .hot
      transform: translateY(3px)
      fill: #f0ae22
    .hold-edge, .hold-arc
      display: inline
    .m-fill-edge, .m-fill
      display: none
    .m-glow
      opacity: 0.45
</style>
