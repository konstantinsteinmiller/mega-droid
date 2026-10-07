<template lang="pug">
  div.locator(ref="rootEl" :class="{ boss: hud.missionBoss !== '' }" aria-hidden="true")
    div.spin(ref="spinEl")
      div.bob
        span.halo
        svg.tri(viewBox="0 0 40 36")
          path.tri-edge(d="M4 4 H36 L20 32 Z")
          path.tri-fill(d="M4 4 H36 L20 32 Z")
          path.tri-shine(d="M9 7 H31 L28 12 H12 Z")
        GameIcon.mark(v-if="hud.missionBoss" name="skull")
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { hud, addHudTicker } from '@/game/state/hud'
import { currentMission } from '@/game/boot'
import GameIcon from '@/components/icons/GameIcon.vue'

/**
 * The objective locator's triangle (see `sim/locator.ts` for when it shows).
 *
 * Drawn over the 3D view, so it shows the goal THROUGH walls — which is the
 * point: the floor trail says which way to walk, this says where it all ends.
 * In view it hangs over the goal pointing down at it, bobbing; out of view it
 * rides the screen's edge and turns to point toward it, the way the lesson
 * bubbles never do (those mark a thing in this room; this marks a place far
 * away, so here a pointer is the honest reading). A boss goal carries the
 * skull, a job's goal is the bare triangle.
 *
 * Direct style writes from the HUD ticker, like the floating numbers: nothing
 * reactive on the per-frame path.
 */
const rootEl = ref<HTMLElement | null>(null)
const spinEl = ref<HTMLElement | null>(null)
const pt = { x: 0, y: 0, visible: false }
let shown = false
let pinned = false
let off: (() => void) | null = null

const place = (): void => {
  const m = currentMission()
  const el = rootEl.value
  const spin = spinEl.value
  if (!el || !spin) return
  const L = m?.locatorPoint
  if (!m || !L || L.alpha <= 0.001 || hud.phase !== 'play') {
    if (shown) {
      el.style.opacity = '0'
      shown = false
    }
    return
  }
  const w = window.innerWidth
  const h = window.innerHeight
  const p = m.player
  // Relative bearing, + = left (yaw grows to the left), decides "behind me"
  // before the projection does — a point behind the camera projects mirrored.
  let bearing = Math.atan2(-(L.x - p.x), -(L.z - p.z)) - p.yaw
  while (bearing > Math.PI) bearing -= Math.PI * 2
  while (bearing < -Math.PI) bearing += Math.PI * 2
  m.project(L.x, L.y, L.z, pt)
  const cam = m.camera
  const halfFov = (cam.fov * cam.aspect * Math.PI) / 360
  // Clear of the top row (bars, status pills) and the thumb clusters.
  const mx = Math.max(34, w * 0.06)
  const top = Math.max(70, h * 0.16)
  const bottom = Math.max(90, h * 0.2)
  const onScreen = pt.visible && Math.abs(bearing) < halfFov * 1.02 &&
    pt.x > mx && pt.x < w - mx && pt.y > top && pt.y < h - bottom
  let x: number
  let y: number
  let angle = 0
  if (onScreen) {
    x = pt.x
    y = pt.y
  } else {
    // Ray from the screen's centre toward the goal, cut by an inset box.
    const cx = w / 2
    const cy = (top + h - bottom) / 2
    let dx: number
    let dy: number
    if (pt.visible && Math.abs(bearing) < Math.PI / 2) {
      dx = pt.x - cx
      dy = pt.y - cy
    } else {
      // Behind: down the side it is on, so the turn it asks for is obvious.
      dx = -Math.sin(bearing)
      dy = Math.max(0.25, -Math.cos(bearing))
    }
    const len = Math.hypot(dx, dy) || 1
    dx /= len
    dy /= len
    const hw = w / 2 - mx
    const hh = (h - bottom - top) / 2
    const k = Math.min(Math.abs(dx) > 1e-4 ? hw / Math.abs(dx) : Infinity, Math.abs(dy) > 1e-4 ? hh / Math.abs(dy) : Infinity)
    x = cx + dx * k
    y = cy + dy * k
    // The drawing points down (+y); turn it to point along the ray.
    angle = Math.atan2(dy, dx) - Math.PI / 2
  }
  el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`
  el.style.opacity = L.alpha.toFixed(3)
  // A pinned lesson subject (the tutorial's crate) is no boss: no skull.
  if (L.pin !== pinned) {
    pinned = L.pin
    el.classList.toggle('pin', pinned)
  }
  spin.style.transform = `translate(-50%, -100%) rotate(${angle.toFixed(3)}rad)`
  shown = true
}

onMounted(() => { off = addHudTicker(place) })
onUnmounted(() => { off?.() })
</script>

<style scoped lang="sass">
.locator
  position: absolute
  left: 0
  top: 0
  opacity: 0
  pointer-events: none
  will-change: transform, opacity
.spin
  // Rotates about the triangle's tip, which sits on the goal (in view) or on
  // the edge point (out of view).
  transform-origin: 50% 100%
.bob
  position: relative
  width: clamp(36px, 7.6vmin, 56px)
  height: clamp(33px, 6.9vmin, 51px)
  animation: loc-bob 0.9s ease-in-out infinite alternate
.halo
  position: absolute
  left: 50%
  top: 40%
  width: 170%
  height: 170%
  border-radius: 50%
  transform: translate(-50%, -50%)
  background: radial-gradient(circle, rgba(255, 216, 74, 0.5), rgba(255, 216, 74, 0) 65%)
  animation: loc-halo 1.1s ease-out infinite
.tri
  position: absolute
  inset: 0
  width: 100%
  height: 100%
  overflow: visible
  filter: drop-shadow(0 0 6px rgba(255, 216, 74, 0.85))
.tri-edge
  fill: none
  stroke: #141a33
  stroke-width: 6
  stroke-linejoin: round
.tri-fill
  fill: #ffd84a
.tri-shine
  fill: rgba(255, 255, 255, 0.55)
// The skull rides in the triangle's wide top half.
.mark
  position: absolute
  left: 50%
  top: 12%
  width: 46%
  height: 46%
  transform: translateX(-50%)
  color: #141a33
.pin .mark
  display: none
@keyframes loc-bob
  from
    translate: 0 -12%
  to
    translate: 0 6%
@keyframes loc-halo
  0%
    opacity: 0.9
    scale: 0.55
  100%
    opacity: 0
    scale: 1.25
@media (prefers-reduced-motion: reduce)
  .bob, .halo
    animation: none
</style>
