<template lang="pug">
  div.bars(ref="barsEl" aria-hidden="true")
    div.bar-col
      div.bar.hp(ref="hpEl" :title="t('hud.hp')" :class="{ low: hpLow && holdPct === null, beat: lowHealthLive && holdPct === null, refilling: holdPct !== null }")
        span.cap(ref="capEl")
          GameIcon(name="heart")
        div.track
          div.ghost(ref="ghostEl")
          div.fill(:style="{ height: (holdPct ?? hpPct) + '%' }")
          div.refill(ref="refillEl")
      div.bar.we(:title="t('hud.we')" :style="{ '--we': weColor }")
        span.cap
          GameIcon(name="bolt")
        div.track
          div.fill(:style="{ height: wePct + '%' }")
    div.power
      div.power-fill(:style="{ width: powerPct + '%' }" :class="{ cracked: powerPct < 20 }")
    //- A used gel flows from its button into the heart.
    span.gel-orb(ref="orbEl")
    //- The profile's first hit: a glow flies from its marker into the heart.
    span.hit-orb(ref="hitOrbEl")
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { addHudTicker, hud } from '@/game/state/hud'
import { profile } from '@/game/state/profile'
import { WEAPONS } from '@/game/data/weapons'
import { LOW_HP, lowHealthLive } from '@/game/state/screenFx'
import { damageFeed } from '@/game/state/damageFeed'
import GameIcon from '@/components/icons/GameIcon.vue'
import { HpGhost, KICK_GAP, claimFirstHit, rateGate } from './hpCues'

/**
 * The classic vertical energy bars: 28 segments each, health in yellow and
 * weapon energy in the equipped weapon's colour, drawn as ONE fill element over
 * a repeating segment mask (no per-segment DOM). A thin Power bar (block /
 * slide stamina) runs underneath.
 *
 * Each bar wears its glyph on a cap at the top, a heart on health and a bolt on
 * weapon energy: a playtester read the full weapon bar as their health one
 * turn before dying. Under `LOW_HP` the health bar turns red, and in live play it
 * beats in step with the ScreenFx edge vignette (`lowHealthLive`).
 *
 * The Core Master's bar (BossBar.vue) hangs horizontally under the compass,
 * in the same frame and segment style.
 *
 * A Repair Gel does not jump the bar. The gel drains from its button, an orb of
 * it flows up into the heart, and the missing segments fill GREEN one by one
 * (the classic tank refill) before they settle to yellow. The repair itself
 * is instant in the sim; this only catches up, and a hit on the way cancels it.
 *
 * A hit is answered on the bar too (`hpCues.ts`): the lost chunk stays as a
 * light ghost and drains after a beat, the bar flashes and kicks (rate
 * limited), and the first hit in a profile flies a glow from its damage
 * marker into the heart and swells the bar once. At low health the frame
 * breathes red on the heart's and the vignette's beat: one warning, three
 * places.
 */
const { t } = useI18n()
const SEG = 28
const seg = (v: number, max: number) =>
  (max > 0 ? (Math.ceil(Math.min(1, Math.max(0, v / max)) * SEG) / SEG) * 100 : 0)
const hpPct = computed(() => seg(hud.hp, hud.maxHp))
const wePct = computed(() => seg(hud.we, hud.maxWe))
const powerPct = computed(() => (hud.maxPower > 0 ? (hud.power / hud.maxPower) * 100 : 0))
const hpLow = computed(() => hud.hp > 0 && hud.hp < hud.maxHp * LOW_HP)
// Read from the profile, not `hud.weapons`: that array is mutated in place
// under a SHALLOW reactive, so a computed over it never saw a slot change.
const weColor = computed(() => {
  const id = profile.hero.slots[0]
  return id ? WEAPONS[id].color : '#5fd8ff'
})

// ── The gel refill ──
/** While a refill plays, the yellow fill holds where health stood. */
const holdPct = ref<number | null>(null)
const barsEl = ref<HTMLElement | null>(null)
const capEl = ref<HTMLElement | null>(null)
const refillEl = ref<HTMLElement | null>(null)
const orbEl = ref<HTMLElement | null>(null)
/** The orb's flight from the gel button to the heart (ms). */
const FLOW = 380
/** One segment of the refill (ms): the tank's rising run. */
const TICK = 40
let running: Animation[] = []
let doneTimer: number | null = null
const stopRefill = (): void => {
  for (const a of running) a.cancel()
  running = []
  if (doneTimer !== null) clearTimeout(doneTimer)
  doneTimer = null
  holdPct.value = null
}
watch(() => hud.gelUse, (n, prev) => {
  if (prev === undefined || n <= prev) return
  stopRefill()
  const from = seg(hud.gelFrom01, 1)
  const refill = refillEl.value
  if (!refill || typeof refill.animate !== 'function' || from >= 100) return
  holdPct.value = from
  const steps = Math.max(1, Math.round(((100 - from) / 100) * SEG))
  // The orb: from the gel button's middle to the heart cap.
  const orb = orbEl.value
  const box = barsEl.value
  const btn = document.querySelector<HTMLElement>('[data-lesson="gel"]')
  const cap = capEl.value
  if (orb && box && btn && cap) {
    const o = box.getBoundingClientRect()
    const b = btn.getBoundingClientRect()
    const c = cap.getBoundingClientRect()
    const at = (x: number, y: number, s: number) => `translate(${x - o.left}px, ${y - o.top}px) translate(-50%, -50%) scale(${s})`
    const bx = b.left + b.width / 2
    const by = b.top + b.height / 2
    const cx = c.left + c.width / 2
    const cy = c.top + c.height / 2
    running.push(orb.animate([
      { transform: at(bx, by, 0.6), opacity: 0 },
      { transform: at(bx, by, 1.2), opacity: 1, offset: 0.12 },
      { transform: at((bx + cx) / 2, Math.min(by, cy) + (by - cy) * 0.15, 1), opacity: 1, offset: 0.55 },
      { transform: at(cx, cy, 0.5), opacity: 0.9 }
    ], { duration: FLOW, easing: 'cubic-bezier(0.5, 0, 0.3, 1)' }))
  }
  // The green climb over the missing segments, one at a time, once the orb
  // lands; then the yellow takes the bar back under it and the green fades.
  const band = `${100 - from}%`
  refill.style.bottom = `${from}%`
  running.push(refill.animate([
    { height: '0%', opacity: 1 },
    { height: band, opacity: 1 }
  ], { duration: steps * TICK, delay: FLOW * 0.8, easing: `steps(${steps}, end)`, fill: 'forwards' }))
  doneTimer = window.setTimeout(() => {
    doneTimer = null
    for (const a of running) a.cancel()
    running = [refill.animate([{ height: band, opacity: 1 }, { height: band, opacity: 0 }], { duration: 280 })]
    holdPct.value = null
  }, FLOW * 0.8 + steps * TICK)
})
// A hit on the way: the bar tells the truth at once.
watch(() => hud.hp, (hp) => {
  if (holdPct.value !== null && hp < hud.maxHp) stopRefill()
})
onUnmounted(stopRefill)

// ── The hit cues (`hpCues.ts`) ──
const hpEl = ref<HTMLElement | null>(null)
const ghostEl = ref<HTMLElement | null>(null)
const hitOrbEl = ref<HTMLElement | null>(null)
const ghost = new HpGhost()
const kickGate = rateGate(KICK_GAP)
/** The ghost's top as last written (%), -1 = hidden. */
let ghostAt = -1
let lastMax = hud.maxHp
let calm = false
let offTicker: (() => void) | null = null
/** The first-hit glow's flight to the heart (ms). */
const FLY = 460
const KICK: Keyframe[] = [
  { transform: 'translate(0, 0) scale(1)', filter: 'brightness(1)' },
  { transform: 'translate(-2px, 2px) scale(1.08)', filter: 'brightness(2.4)', offset: 0.18 },
  { transform: 'translate(2px, -1px) scale(1.03)', filter: 'brightness(1.5)', offset: 0.45 },
  { transform: 'translate(0, 0) scale(1)', filter: 'brightness(1)' }
]
const KICK_CALM: Keyframe[] = [
  { filter: 'brightness(1)' },
  { filter: 'brightness(2.4)', offset: 0.18 },
  { filter: 'brightness(1)' }
]
const REST = '0 3px 0 rgba(0, 0, 0, 0.35), 0 0 0 0 rgba(255, 255, 255, 0), 0 0 0 0 rgba(255, 51, 71, 0)'
const LIT = '0 3px 0 rgba(0, 0, 0, 0.35), 0 0 0 3px rgba(255, 255, 255, 0.95), 0 0 20px 7px rgba(255, 51, 71, 0.95)'
const SWELL: Keyframe[] = [
  { transform: 'scale(1)', boxShadow: REST },
  { transform: 'scale(1.5)', boxShadow: LIT, offset: 0.3 },
  { transform: 'scale(1.38)', boxShadow: LIT, offset: 0.55 },
  { transform: 'scale(1)', boxShadow: REST }
]
const SWELL_CALM: Keyframe[] = [{ boxShadow: REST }, { boxShadow: LIT, offset: 0.3 }, { boxShadow: REST }]

const kick = (): void => {
  const el = hpEl.value
  if (el && typeof el.animate === 'function') el.animate(calm ? KICK_CALM : KICK, { duration: 300, easing: 'ease-out' })
}

/** The profile's first hit: from the marker it left (or the crosshair) a
 *  glow flies into the heart, and the bar swells once as it lands. */
const firstHit = (): void => {
  const orb = hitOrbEl.value
  const box = barsEl.value
  const cap = capEl.value
  const bar = hpEl.value
  if (!orb || !box || !cap || !bar || typeof bar.animate !== 'function') return
  let delay = 0
  if (!calm) {
    const o = box.getBoundingClientRect()
    const c = cap.getBoundingClientRect()
    const mk = damageFeed.latest
    const marked = !!mk && mk.active && Number.isFinite(mk.sx)
    const sx = marked ? mk.sx : window.innerWidth / 2
    const sy = marked ? mk.sy : window.innerHeight / 2
    const cx = c.left + c.width / 2
    const cy = c.top + c.height / 2
    const at = (x: number, y: number, s: number) => `translate(${x - o.left}px, ${y - o.top}px) translate(-50%, -50%) scale(${s})`
    orb.animate([
      { transform: at(sx, sy, 0.5), opacity: 0 },
      { transform: at(sx, sy, 1.6), opacity: 1, offset: 0.14 },
      { transform: at((sx + cx) / 2, (sy + cy) / 2 - Math.abs(sx - cx) * 0.12, 1.2), opacity: 1, offset: 0.55 },
      { transform: at(cx, cy, 0.7), opacity: 0.9 }
    ], { duration: FLY, easing: 'cubic-bezier(0.45, 0, 0.3, 1)' })
    delay = FLY * 0.85
  }
  bar.animate(calm ? SWELL_CALM : SWELL, { duration: 720, delay, easing: 'ease-out' })
}

// Every change of health: the ghost follows it, a drop in play kicks the bar.
watch(() => hud.hp, (hp, prev) => {
  const max = hud.maxHp
  const now = seg(hp, max)
  if (prev === undefined || hp >= prev || max !== lastMax) {
    lastMax = max
    ghost.reset(now)
    return
  }
  ghost.hit(seg(prev, max), now)
  if (hud.phase !== 'play' || hp <= 0) return
  if (kickGate(performance.now() / 1000)) kick()
  if (hitOrbEl.value && claimFirstHit()) firstHit()
})

onMounted(() => {
  calm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  ghost.reset(hpPct.value)
  // The ghost's hold and drain: direct writes from the HUD ticker, and only
  // while it moves.
  offTicker = addHudTicker((dt) => {
    const top = ghost.step(dt)
    const at = ghost.showing ? Math.round(top * 10) / 10 : -1
    if (at === ghostAt) return
    ghostAt = at
    const el = ghostEl.value
    if (!el) return
    if (at < 0) el.style.opacity = '0'
    else {
      el.style.height = `${at}%`
      el.style.opacity = '1'
    }
  })
})
onUnmounted(() => offTicker?.())
</script>

<style scoped lang="sass">
.bars
  // The bar geometry.
  --bw: clamp(14px, 3.4vmin, 22px)
  --gap: clamp(3px, 0.8vmin, 6px)
  position: absolute
  left: calc(env(safe-area-inset-left, 0px) + clamp(8px, 2.2vmin, 18px))
  top: calc(env(safe-area-inset-top, 0px) + clamp(8px, 2.2vmin, 18px))
  display: flex
  flex-direction: column
  gap: 6px
.bar-col
  display: flex
  gap: var(--gap)
// The navy frame: its padding is the outline, the glyph cap sits on top and
// the segment well takes the rest (the bar keeps its old outer size).
.bar
  display: flex
  flex-direction: column
  width: var(--bw)
  height: clamp(110px, 28vmin, 200px)
  padding: 3px
  border-radius: 4px
  background: #141a33
  box-shadow: 0 3px 0 rgba(0, 0, 0, 0.35)
// Reaches into the frame's edge, so the glyph gets the bar's whole width.
.cap
  display: block
  flex: none
  width: calc(var(--bw) - 2px)
  height: calc(var(--bw) - 2px)
  margin: -2px -2px 1px
.hp
  // Above the weapon bar when it swells (the first hit), from its corner.
  position: relative
  z-index: 1
  transform-origin: 30% 12%
.hp .cap
  color: #ff5d73
.hp.low .cap
  color: #ff3347
  filter: drop-shadow(0 0 2px rgba(255, 51, 71, 0.9))
.we .cap
  color: var(--we)
.track
  position: relative
  flex: 1
  border-radius: 1px
  background: #0b1433
  overflow: hidden
  // Segment gaps drawn over whatever fill is below
  &::after
    content: ''
    position: absolute
    inset: 0
    background: repeating-linear-gradient(to top, transparent 0, transparent calc(100% / 28 - 1.5px), #0b1433 calc(100% / 28 - 1.5px), #0b1433 calc(100% / 28))
    pointer-events: none
.fill
  position: absolute
  left: 0
  right: 0
  bottom: 0
  transition: height 0.12s linear
.hp .fill
  background: linear-gradient(90deg, #fff9c8 0%, #fff9c8 30%, #ffe14a 31%, #f0a800 100%)
// The damage ghost: the chunk just lost, standing light over the fill's top
// until it drains (HpGhost). Under the fill, so only the lost part shows.
.ghost
  position: absolute
  left: 0
  right: 0
  bottom: 0
  height: 0
  opacity: 0
  background: linear-gradient(90deg, #ffffff 0%, #ffffff 30%, #ffd6dc 31%, #ff9aa8 100%)
.hp.low .fill
  background: linear-gradient(90deg, #ffe0e3 0%, #ffe0e3 30%, #ff4a5c 31%, #c8142e 100%)
// The heartbeat: the heart pumps (past the frame, which does not clip it) and
// the fill flares a lighter red (white washed it out to pink), on the
// vignette's 0.9 s lub-dub. The frame breathes with them, a red glow and a
// small swell on the same beat: the warning and the bar read as one.
.hp.beat
  animation: breathe 0.9s ease-out infinite
  .cap
    animation: pump 0.9s ease-out infinite
  .fill::before
    content: ''
    position: absolute
    inset: 0
    background: #ff9aa6
    opacity: 0
    animation: flare 0.9s ease-out infinite
.we .fill
  background: linear-gradient(90deg, #ffffff 0%, #ffffff 30%, var(--we) 31%, var(--we) 100%)
// The gel refill: a green band over the segments it is filling (the segment
// mask above draws over it too).
.refill
  position: absolute
  left: 0
  right: 0
  bottom: 0
  height: 0
  opacity: 0
  background: linear-gradient(90deg, #f0ffe8 0%, #f0ffe8 30%, #8dff7a 31%, #2fbf5a 100%)
  box-shadow: 0 0 8px rgba(141, 255, 122, 0.8)
.hp.refilling .cap
  color: #8dff7a
  filter: drop-shadow(0 0 3px rgba(141, 255, 122, 0.95))
  animation: pump 0.5s ease-out infinite
.hit-orb
  position: absolute
  z-index: 2
  left: 0
  top: 0
  width: calc(var(--bw) * 1.5)
  height: calc(var(--bw) * 1.5)
  border-radius: 50%
  border: 2px solid #141a33
  background: radial-gradient(circle at 40% 30%, #ffe0e4, #ff4a5c 45%, #c8142e)
  box-shadow: 0 0 18px 4px rgba(255, 51, 71, 0.95)
  opacity: 0
  pointer-events: none
  will-change: transform, opacity
.gel-orb
  position: absolute
  z-index: 2
  left: 0
  top: 0
  width: calc(var(--bw) * 1.4)
  height: calc(var(--bw) * 1.4)
  border-radius: 50%
  border: 2px solid #141a33
  background: radial-gradient(circle at 40% 30%, #f0ffe8, #8dff7a 45%, #2fbf5a)
  box-shadow: 0 0 16px rgba(141, 255, 122, 0.95)
  opacity: 0
  pointer-events: none
  will-change: transform, opacity
.power
  width: calc(var(--bw) * 2 + var(--gap))
  height: 7px
  border: 2px solid #141a33
  border-radius: 4px
  background: #0b1433
  overflow: hidden
.power-fill
  height: 100%
  background: linear-gradient(#bff3ff, #3cc8ff)
  transition: width 0.1s linear
  &.cracked
    background: linear-gradient(#ffd0c0, #ff6a3d)
@keyframes pump
  0%, 60%, 100%
    transform: scale(1)
  12%
    transform: scale(1.3)
  26%
    transform: scale(1.04)
  38%
    transform: scale(1.2)
@keyframes breathe
  0%, 60%, 100%
    transform: scale(1)
    box-shadow: 0 3px 0 rgba(0, 0, 0, 0.35), 0 0 0 0 rgba(255, 51, 71, 0)
  12%
    transform: scale(1.05)
    box-shadow: 0 3px 0 rgba(0, 0, 0, 0.35), 0 0 12px 3px rgba(255, 51, 71, 0.85)
  26%
    transform: scale(1.01)
    box-shadow: 0 3px 0 rgba(0, 0, 0, 0.35), 0 0 6px 1px rgba(255, 51, 71, 0.35)
  38%
    transform: scale(1.035)
    box-shadow: 0 3px 0 rgba(0, 0, 0, 0.35), 0 0 10px 2px rgba(255, 51, 71, 0.65)
@keyframes flare
  0%, 60%, 100%
    opacity: 0
  12%
    opacity: 0.5
  26%
    opacity: 0.1
  38%
    opacity: 0.36
// Red and still: the tint alone carries the warning (and a steady glow).
@media (prefers-reduced-motion: reduce)
  .hp.beat, .hp.beat .cap, .hp.beat .fill::before, .hp.refilling .cap
    animation: none
  .hp.beat
    box-shadow: 0 3px 0 rgba(0, 0, 0, 0.35), 0 0 8px 2px rgba(255, 51, 71, 0.6)
</style>
