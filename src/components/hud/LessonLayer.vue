<template lang="pug">
  div.lessons(
    v-if="show"
    :class="[lesson.id, hud.device, { done: lesson.done }]"
    aria-live="polite"
  )
    //- Weapon lesson: guide lines fan out from the buster to each drone.
    svg.guides(v-show="lesson.id === 'weapon' && !lesson.done" aria-hidden="true")
      g(v-for="i in 3" :key="i" :ref="(el) => setGuide(i - 1, el)")
        line.guide(x1="0" y1="0" x2="0" y2="0" :style="{ stroke: lesson.color }")
        circle.aim(cx="0" cy="0" r="26" :style="{ stroke: lesson.color }")
    //- The glyph, pinned to the lesson's subject (moved every frame).
    div.card(
      ref="cardEl"
      role="img"
      :aria-label="ariaText"
      :class="{ nudge: nudging }"
    )
      template(v-if="!lesson.done")
        //- charge / crates: the demo — press and hold, the rings fill, the
        //- shot grows, let go and it flies into the target
        div.glyph-box.demo-box(v-if="demo" :style="{ '--bounce': `${DEMO_CLIP.bounce}s` }")
          ChargeDemo(:device="hud.device" :aim="lesson.id === 'crate' || over ? 'down' : 'up'" :clip="clip")
          span.no(v-if="nudging")
        template(v-else)
          div.glyph-box
            //- the gel: its key (H), or a tap on its button
            InputGlyph(v-if="lesson.id === 'gel' && hud.device === 'mouse'" kind="key" code="KeyH")
            InputGlyph(v-else-if="lesson.id === 'gel'" kind="finger" mode="tap")
            //- the weapon: its key, or a tap (the finger sits on the button)
            InputGlyph(v-else-if="hud.device === 'mouse'" kind="key" :code="`Digit${lesson.slot}`")
            InputGlyph(v-else kind="finger" mode="tap")
            span.no(v-if="nudging")
          //- What it does: the weapon's orb, or the gel pouring into a heart
          //- that fills green.
          span.gel-heart(v-if="lesson.id === 'gel'")
            span.gh-gel
              GameIcon(name="flask")
            span.gh-flow
            span.gh-heart
              GameIcon.gh-empty(name="heart")
              GameIcon.gh-full(name="heart")
          span.orb(v-else :style="{ '--wc': lesson.color }")
      GameIcon.check(v-else name="check")
    //- Subject off screen, player in its room: the lesson's own glyph in a
    //- small bubble on that side. Never an arrow — an arrow reads "go this way".
    div.edge(ref="edgeEl" aria-hidden="true")
      ChargeDemo(v-if="demo" :device="hud.device" compact)
      InputGlyph(v-else-if="lesson.id === 'gel'" kind="key" code="KeyH")
      InputGlyph(v-else-if="hud.device === 'mouse'" kind="key" :code="`Digit${lesson.slot}`")
      InputGlyph(v-else kind="finger" mode="tap")
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { hud, addHudTicker } from '@/game/state/hud'
import { currentMission } from '@/game/boot'
import type { LessonView } from '@/game/sim/lessons'
import InputGlyph from './InputGlyph.vue'
import ChargeDemo from './ChargeDemo.vue'
import { DEMO_ANCHOR, DEMO_CLIP } from './glyphGeometry'
import GameIcon from '@/components/icons/GameIcon.vue'
import { spokenKey, spokenKeys } from './keyAria'

/**
 * The scene lessons' glyphs (see `game/sim/lessons.ts`). No words: the glyph
 * rides on the thing the lesson is about — the training drone, the glowing
 * crate, the row of drones — and follows it every frame with direct style
 * writes (no Vue on the hot path). A wrong try (a quick shot off the shield,
 * a hold let go too soon) shakes it; success pops a check where the subject
 * was. With the subject off screen and the player in its room, a small
 * bubble with the same glyph waits on that edge of the screen. Only then: an
 * edge ARROW kept pointing back at the unpopped drone and pulled two blind
 * testers back to the start pad, as if it were the way on.
 *
 * The Repair Gel lesson's subject is a HUD button, not a thing in the world:
 * its card stands over the gel button — the key (H) or a tapping finger, and a
 * gel pouring into a heart that fills green — while the button pulses.
 *
 * The charge and crate lessons show a looping demo instead of a glyph
 * (`ChargeDemo`): a finger held on the play area (or the left mouse button
 * held), the crosshair's rings filling round it, the shot growing, let go —
 * the shot flies into the target. The card hangs with the shot's column
 * under the drone's bubble (over the crate), so it flies straight in and
 * never covers the target — over a drone too close to leave room below, and
 * always inside the screen. A wrong try replays a quick tap whose pellet
 * skips off, and the card shakes as it does.
 */
const { t } = useI18n()

const lesson = computed(() => hud.lesson as LessonView)
/** Hidden until the mouse is captured: before that a click captures it,
 *  and the capture glyph owns the crosshair. */
const show = computed(() => hud.phase === 'play' && !!hud.lesson && !hud.pointerFree)
/** The lessons taught by the charge demo. */
const demo = computed(() => hud.lesson?.id === 'charge' || hud.lesson?.id === 'crate')

const aria = computed(() => {
  const l = hud.lesson
  if (!l) return 'lesson.charge'
  if (l.id === 'weapon') return hud.device === 'touch' ? 'lesson.weaponTouch' : 'lesson.weaponKeys'
  if (l.id === 'gel') return hud.device === 'touch' ? 'lesson.gelTouch' : 'lesson.gelKeys'
  return `lesson.${l.id}`
})
/** Keys spoken as this keyboard and the bindings have them (`keyAria.ts`). */
const ariaText = computed(() => {
  const slot = hud.lesson?.slot ?? 1
  const n = hud.device === 'touch' ? slot : spokenKeys(t, `Digit${slot}`)
  return t(aria.value, { n, key: spokenKey(t, 'KeyH') })
})

// ── "Not like that": a shake and a red cross on each wrong try ──
// On the charge demo the card first replays the try — a quick tap, a small
// pellet skipping off the target — and shakes as the pellet bounces
// (`--bounce`), then the film runs again.
const NUDGE_MS = 520
const nudging = ref(false)
/** The quick-tap clip on the demo: its key while it plays, else 0. */
const clip = ref(0)
let clipSeq = 0
let nudgeTimer: number | null = null
let clipTimer: number | null = null
watch(() => hud.lesson?.nudge ?? 0, (n, prev) => {
  if (!prev && prev !== 0) return
  if (n <= (prev ?? 0)) return
  nudging.value = false
  requestAnimationFrame(() => {
    nudging.value = true
    const replay = demo.value
    if (nudgeTimer !== null) clearTimeout(nudgeTimer)
    nudgeTimer = window.setTimeout(() => { nudging.value = false }, NUDGE_MS + (replay ? DEMO_CLIP.bounce * 1000 : 0))
    if (!replay) return
    clip.value = ++clipSeq
    if (clipTimer !== null) clearTimeout(clipTimer)
    clipTimer = window.setTimeout(() => { clip.value = 0 }, DEMO_CLIP.dur * 1000)
  })
})

// ── Per-frame placement ──
const cardEl = ref<HTMLElement | null>(null)
const edgeEl = ref<HTMLElement | null>(null)
const guides: Array<SVGGElement | null> = [null, null, null]
// (Typed here, not in the template: a pug template is compiled apart from
// the script and is never stripped of TypeScript — a cast there is a syntax
// error in the browser that vue-tsc happily accepts.)
const setGuide = (i: number, el: unknown) => { guides[i] = el as SVGGElement | null }
const anchors = new Float32Array(9)
const pt = { x: 0, y: 0, visible: false }
const low = { x: 0, y: 0, visible: false }
let off: (() => void) | null = null
/** The training drone's bubble (props.ts: r 0.78, and its rim). */
const BUBBLE_R = 0.8
/** Clear air between the bubble's lowest point and the demo card (px). */
const BUBBLE_GAP = 6
/** The demo card keeps this far inside the screen's edges (px). */
const EDGE_PAD = 8
/** Over a crate (or a drone with no room below it) the target sits this
 *  share of the card's height under its bottom edge: where the demo's shot
 *  lands when it flies down (`demoTargetY`). */
const DEMO_LIFT = 1.15
/** The demo card over the drone instead of under it: no room below (a close
 *  drone, a short screen). Its shot then flies down into the bubble. */
const over = ref(false)
// The demo card's box, kept by a ResizeObserver (read off the card, once,
// until it reports; every frame where there is none).
let cardW = 0
let cardH = 0
const sizer = typeof ResizeObserver === 'function'
  ? new ResizeObserver((entries) => {
    const box = entries[0]?.borderBoxSize?.[0]
    if (box) { cardW = box.inlineSize; cardH = box.blockSize }
  })
  : null

const place = (): void => {
  const m = currentMission()
  const card = cardEl.value
  const edge = edgeEl.value
  if (!m || !card || !edge || !hud.lesson) return
  if (hud.lesson.id === 'gel') {
    // The gel's subject is its button: the card stands just above it (and
    // above its pips), right-aligned to it, so it never leaves the screen.
    edge.style.opacity = '0'
    const btn = document.querySelector<HTMLElement>('[data-lesson="gel"]')
    if (!btn) { card.style.opacity = '0'; return }
    const r = btn.getBoundingClientRect()
    card.style.transform = `translate3d(${r.right + 4}px, ${r.top - Math.max(18, r.height * 0.34)}px, 0) translate(-100%, -100%)`
    card.style.opacity = '1'
    return
  }
  const n = m.lessonAnchors(anchors)
  if (n === 0) {
    card.style.opacity = '0'
    edge.style.opacity = '0'
    return
  }
  const el = m.camera
  const w = window.innerWidth
  const h = window.innerHeight
  const p = m.player
  // The middle subject leads (the centre drone of three).
  const k = n === 3 ? 1 : 0
  const ax = anchors[k * 3]!
  const ay = anchors[k * 3 + 1]!
  const az = anchors[k * 3 + 2]!
  // Relative bearing decides "behind me" before projecting. Yaw grows to
  // the LEFT (the mouse turns right by lowering it), so + = left.
  let bearing = Math.atan2(-(ax - p.x), -(az - p.z)) - p.yaw
  while (bearing > Math.PI) bearing -= Math.PI * 2
  while (bearing < -Math.PI) bearing += Math.PI * 2
  m.project(ax, ay, az, pt)
  const halfFov = (el.fov * el.aspect * Math.PI) / 360
  const onScreen = pt.visible && Math.abs(bearing) < halfFov * 1.02 && pt.x > 0 && pt.x < w && pt.y > 0 && pt.y < h
  const touchWeapon = hud.lesson.id === 'weapon' && hud.device === 'touch' && !hud.lesson.done
  if (touchWeapon) {
    // The finger taps the weapon button itself, wherever the layout put it.
    const btn = document.querySelector<HTMLElement>(`[data-lesson="weapon-${hud.lesson.slot}"]`)
    if (btn) {
      const r = btn.getBoundingClientRect()
      card.style.transform = `translate3d(${r.left + r.width / 2}px, ${r.top - 8}px, 0) translate(-50%, -100%)`
      card.style.opacity = '1'
    }
  } else if (onScreen && demo.value && !hud.lesson.done) {
    // The demo: its shot's column right under the training drone's bubble
    // (it hovers at eye level: a card on top would hide the target), or over
    // the crate — so the demo's shot flies straight into the real target.
    if (!sizer || !cardW) { cardW = card.offsetWidth; cardH = card.offsetHeight }
    let top: number
    if (hud.lesson.id === 'charge') {
      m.project(ax, ay - BUBBLE_R, az, low)
      const below = Math.max(pt.y, low.y) + BUBBLE_GAP
      // No room under a close drone: over it, the shot flying down. (With
      // some slack both ways, so it does not flip back and forth.)
      const room = h - EDGE_PAD - cardH
      if (below > room + (over.value ? -24 : 0)) {
        m.project(ax, ay + BUBBLE_R, az, low)
        const above = Math.min(pt.y, low.y) - cardH * DEMO_LIFT
        if (over.value !== above >= EDGE_PAD) over.value = above >= EDGE_PAD
      } else if (over.value) over.value = false
      if (over.value) top = low.y - cardH * DEMO_LIFT
      // Last resort — the drone fills the screen: the card stays on it.
      else top = Math.min(below, room)
    } else {
      top = Math.max(EDGE_PAD, pt.y - cardH * DEMO_LIFT)
    }
    // On screen side to side: at the edges the shot's column leaves the
    // target's rather than the card leaving the screen.
    const left = Math.max(EDGE_PAD, Math.min(w - EDGE_PAD - cardW, pt.x - cardW * DEMO_ANCHOR))
    card.style.transform = `translate3d(${left}px, ${top}px, 0)`
    card.style.opacity = '1'
  } else if (onScreen) {
    // Above a crate, a drone row or a popped drone's check.
    card.style.transform = `translate3d(${pt.x}px, ${pt.y}px, 0) translate(-50%, -115%)`
    card.style.opacity = '1'
  } else {
    card.style.opacity = '0'
  }
  // The glyph's bubble on the side the subject is on — only in its room, and
  // never rotated into a pointer.
  if (!onScreen && !hud.lesson.done && m.lessonInRoom()) {
    const right = bearing < 0
    const behind = Math.abs(bearing) > Math.PI / 2
    const ex = right ? w - 64 : 64
    const ey = behind ? h * 0.5 : Math.max(90, Math.min(h - 90, pt.visible ? pt.y : h * 0.5))
    edge.style.transform = `translate3d(${ex}px, ${ey}px, 0) translate(-50%, -50%)`
    edge.style.opacity = '1'
  } else {
    edge.style.opacity = '0'
  }
  // Guide lines: from the buster (right-low of the view) to each drone.
  if (hud.lesson.id === 'weapon' && !hud.lesson.done) {
    const mx = w * 0.64
    const my = h * 0.86
    for (let i = 0; i < 3; i++) {
      const g = guides[i]
      if (!g) continue
      if (i >= n) { g.style.opacity = '0'; continue }
      m.project(anchors[i * 3]!, anchors[i * 3 + 1]!, anchors[i * 3 + 2]!, pt)
      if (!pt.visible) { g.style.opacity = '0'; continue }
      const line = g.firstElementChild as SVGLineElement
      const ring = g.lastElementChild as SVGCircleElement
      line.setAttribute('x1', String(mx))
      line.setAttribute('y1', String(my))
      line.setAttribute('x2', String(pt.x))
      line.setAttribute('y2', String(pt.y))
      ring.setAttribute('cx', String(pt.x))
      ring.setAttribute('cy', String(pt.y))
      g.style.opacity = '1'
    }
  }
}

onMounted(() => {
  off = addHudTicker(place)
  if (cardEl.value) sizer?.observe(cardEl.value)
})
// The card element comes and goes with the lesson: measure whichever is there.
watch(cardEl, (el, prev) => {
  cardW = 0
  cardH = 0
  if (prev) sizer?.unobserve(prev)
  if (el) sizer?.observe(el)
}, { flush: 'post' })
onUnmounted(() => {
  off?.()
  sizer?.disconnect()
  if (nudgeTimer !== null) clearTimeout(nudgeTimer)
  if (clipTimer !== null) clearTimeout(clipTimer)
})
</script>

<style scoped lang="sass">
.lessons
  position: absolute
  inset: 0
  pointer-events: none
.guides
  position: absolute
  inset: 0
  width: 100%
  height: 100%
  overflow: visible
.guides g
  opacity: 0
  transition: opacity 0.2s
.guide
  stroke-width: 5
  stroke-linecap: round
  stroke-dasharray: 2 16
  filter: drop-shadow(0 0 5px rgba(255, 255, 255, 0.8))
  animation: guide-flow 0.7s linear infinite
.aim
  fill: none
  stroke-width: 4
  transform-box: fill-box
  transform-origin: center
  animation: aim-pulse 1.1s ease-in-out infinite
.card
  position: absolute
  left: 0
  top: 0
  display: flex
  align-items: center
  gap: clamp(4px, 1vmin, 8px)
  opacity: 0
  transition: opacity 0.2s
  filter: drop-shadow(0 3px 0 rgba(20, 26, 51, 0.55))
  will-change: transform
.glyph-box
  position: relative
  width: clamp(92px, 16vmin, 132px)
  aspect-ratio: 140 / 112
  animation: lesson-bob 1.6s ease-in-out infinite
.weapon.mouse .glyph-box
  width: clamp(46px, 8vmin, 64px)
  aspect-ratio: 60 / 64
.weapon.touch .glyph-box
  width: clamp(62px, 12vmin, 88px)
  aspect-ratio: 140 / 130
.gel.mouse .glyph-box
  width: clamp(40px, 7vmin, 56px)
  aspect-ratio: 60 / 64
.gel.touch .glyph-box
  width: clamp(54px, 10vmin, 76px)
  aspect-ratio: 140 / 130
// The charge demo (its box: glyphGeometry's DEMO_W × DEMO_H). It does not
// bob: its shot has to land on the real bubble's edge.
.glyph-box.demo-box
  // Touch: the ring round the finger about 24 vmin across.
  width: clamp(150px, 41vmin, 250px)
  aspect-ratio: 156 / 128
  animation: none
.mouse .glyph-box.demo-box
  // Desktop: the ring round the mouse ~126 px across at 1280 × 720.
  width: clamp(170px, 30vmin, 250px)
  aspect-ratio: 156 / 100
// The gel → heart glyph: the flask, a green flow, and a heart filling green
// from the bottom (a still frame shows it half full, mid-pour).
.gel-heart
  display: flex
  align-items: center
  gap: clamp(2px, 0.6vmin, 5px)
.gh-gel
  width: clamp(28px, 5vmin, 38px)
  height: clamp(28px, 5vmin, 38px)
  padding: 6px
  border-radius: 50%
  border: 3px solid #141a33
  background: radial-gradient(circle at 40% 30%, #d4ffc8, #5fe07a 45%, #1f9a4a)
  color: #ffffff
  animation: gh-tip 1.6s ease-in-out infinite
.gh-flow
  width: clamp(14px, 2.6vmin, 20px)
  height: 7px
  border-radius: 4px
  border: 2px solid #141a33
  background: repeating-linear-gradient(90deg, #8dff7a 0 5px, #e6ffdc 5px 9px)
  background-size: 18px 100%
  animation: gh-flow 0.5s linear infinite
.gh-heart
  position: relative
  width: clamp(30px, 5.4vmin, 40px)
  height: clamp(30px, 5.4vmin, 40px)
  filter: drop-shadow(0 0 0 #141a33) drop-shadow(2px 0 0 #141a33) drop-shadow(-2px 0 0 #141a33) drop-shadow(0 2px 0 #141a33) drop-shadow(0 -2px 0 #141a33)
  .game-icon
    position: absolute
    inset: 0
.gh-empty
  color: #5a2630
.gh-full
  color: #8dff7a
  clip-path: inset(50% 0 0 0)
  animation: gh-fill 1.6s ease-in-out infinite
.orb
  width: clamp(26px, 4.6vmin, 34px)
  height: clamp(26px, 4.6vmin, 34px)
  border-radius: 50%
  border: 3px solid #141a33
  background: radial-gradient(circle at 40% 30%, #ffffff, var(--wc) 60%)
  box-shadow: 0 0 14px var(--wc)
.weapon.touch .orb
  display: none
.check
  width: clamp(40px, 8vmin, 56px)
  height: clamp(40px, 8vmin, 56px)
  padding: 7px
  border-radius: 50%
  border: 3px solid #141a33
  background: #8dff7a
  color: #141a33
  animation: check-pop 0.45s cubic-bezier(0.2, 1.9, 0.4, 1)
// A wrong try: shake, and a red slash across the glyph.
.nudge .glyph-box
  animation: nudge-shake 0.45s ease-in-out
.no
  position: absolute
  left: 50%
  top: 50%
  width: 110%
  height: 7px
  border-radius: 4px
  background: #ff4a5a
  box-shadow: 0 0 0 2px #141a33
  transform: translate(-50%, -50%) rotate(-28deg)
  animation: no-flash 0.5s ease-out forwards
// On the demo both wait for the replayed pellet to bounce off (`--bounce`).
.nudge .glyph-box.demo-box
  animation: nudge-shake 0.45s ease-in-out var(--bounce, 0s)
.demo-box .no
  opacity: 0
  animation-delay: var(--bounce, 0s)
// Off screen, in the subject's room: the same glyph, small, in a dark bubble
// (not a pointer, not the cyan of the UI's "go" buttons).
.edge
  position: absolute
  left: 0
  top: 0
  width: clamp(62px, 12vmin, 84px)
  aspect-ratio: 1
  padding: clamp(7px, 1.5vmin, 11px)
  border-radius: 50%
  border: 3px solid #f4f7ff
  background: rgba(20, 26, 51, 0.72)
  opacity: 0
  transition: opacity 0.2s
  filter: drop-shadow(0 3px 0 rgba(20, 26, 51, 0.55))
  :deep(.glyph)
    animation: edge-breathe 1.6s ease-in-out infinite
@keyframes lesson-bob
  50%
    transform: translateY(-5px)
@keyframes nudge-shake
  0%, 100%
    transform: translateX(0)
  20%
    transform: translateX(-9px)
  40%
    transform: translateX(8px)
  60%
    transform: translateX(-6px)
  80%
    transform: translateX(4px)
@keyframes no-flash
  0%
    opacity: 1
  70%
    opacity: 1
  100%
    opacity: 0
@keyframes check-pop
  from
    transform: scale(0)
@keyframes guide-flow
  to
    stroke-dashoffset: -18
@keyframes aim-pulse
  50%
    transform: scale(1.25)
    opacity: 0.6
@keyframes edge-breathe
  50%
    transform: scale(1.08)
@keyframes gh-tip
  0%, 100%
    transform: rotate(0)
  30%, 70%
    transform: rotate(-24deg)
@keyframes gh-flow
  to
    background-position: 18px 0
@keyframes gh-fill
  0%, 15%
    clip-path: inset(95% 0 0 0)
  75%, 100%
    clip-path: inset(0 0 0 0)
@media (prefers-reduced-motion: reduce)
  .glyph-box, .guide, .aim, .check, .edge :deep(.glyph), .gh-gel, .gh-flow, .gh-full
    animation: none
</style>
