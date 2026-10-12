<template lang="pug">
  div.xh-layer(aria-hidden="true")
    div.xh(ref="xh")
      svg(viewBox="0 0 100 100")
        circle.track(cx="50" cy="50" r="40")
        circle.l1(ref="l1" cx="50" cy="50" r="40")
        circle.l2(ref="l2" cx="50" cy="50" r="46")
        circle.dot(cx="50" cy="50" r="5")
    div.lock(ref="lock")
      span.c.tl
      span.c.tr
      span.c.bl
      span.c.br
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { addHudTicker } from '@/game/state/hud'
import { currentMission } from '@/game/boot'
import { chargeInfo } from '@/game/sim/stats'
import { initChargeRing, paintChargeRing } from './chargeRing'

/**
 * Crosshair + charge ring + lock-on bracket. Updated every frame by the HUD
 * ticker with direct style writes (never through Vue reactivity):
 *
 *   • inner ring fills to charge level 1, outer ring to the full charge;
 *   • at full charge the ring flickers, and inside the PERFECT window it turns
 *     gold — release then for a critical;
 *   • the bracket tracks the locked target's aim point on screen; while the
 *     target is out of sight (the lock's grace, `Mission.targetHidden`) it
 *     turns faint, grey and dashed, and snaps back the moment it is seen.
 */
const xh = ref<HTMLElement | null>(null)
const l1 = ref<SVGCircleElement | null>(null)
const l2 = ref<SVGCircleElement | null>(null)
const lock = ref<HTMLElement | null>(null)
const pt = { x: 0, y: 0, visible: false }
const top = { x: 0, y: 0, visible: false }
let off: (() => void) | null = null
let t = 0

onMounted(() => {
  initChargeRing(l1.value!, l2.value!)
  off = addHudTicker((dt) => {
    t += dt
    const m = currentMission()
    if (!m || !xh.value || !lock.value) return
    const c = m.combat
    const info = chargeInfo(c.charging ? c.charge : 0, m.stats)
    const showing = c.charging && info.toL1 > 0.12
    paintChargeRing(xh.value, l1.value!, l2.value!, info, showing, t)
    xh.value.style.transform = `translate(-50%, -50%) scale(${1 + (showing ? 0.25 + info.toL2 * 0.25 : 0) + c.recoil * 0.12})`
    // Lock bracket
    const tg = c.target
    if (tg && tg.state !== 'dead') {
      const s = tg.elite ? 1.18 : 1
      // The climb: a machine on a ledge stands on its platform (`floor`).
      const ty = tg.y + (tg.floor ?? 0)
      m.project(tg.x, ty + (tg.def.aimY + tg.def.hitR) * s, tg.z, top)
      m.project(tg.x, ty + tg.def.aimY * s, tg.z, pt)
      if (pt.visible) {
        const size = Math.max(34, Math.min(170, Math.abs(pt.y - top.y) * 2.3))
        lock.value.style.opacity = '1'
        lock.value.style.width = `${size}px`
        lock.value.style.height = `${size}px`
        lock.value.style.transform = `translate(${pt.x - size / 2}px, ${pt.y - size / 2}px) rotate(${Math.sin(t * 3) * 3}deg)`
        lock.value.dataset.tele = tg.state === 'tele' ? (tg.teleRed ? 'red' : 'orange') : ''
        lock.value.dataset.lost = m.targetHidden ? '1' : ''
        return
      }
    }
    lock.value.style.opacity = '0'
  })
})
onUnmounted(() => off?.())
</script>

<style scoped lang="sass">
@use './chargeRing'
.xh-layer
  position: absolute
  inset: 0
  pointer-events: none
.xh
  position: absolute
  left: 50%
  top: 50%
  width: clamp(44px, 9vmin, 64px)
  height: clamp(44px, 9vmin, 64px)
  transform: translate(-50%, -50%)
  +chargeRing.look
.lock
  position: absolute
  left: 0
  top: 0
  opacity: 0
  transition: opacity 0.15s
  will-change: transform
  .c
    position: absolute
    width: 26%
    height: 26%
    border: 3px solid #ffffff
    filter: drop-shadow(0 0 2px rgba(20, 26, 51, 0.9))
  .tl
    left: 0
    top: 0
    border-right: none
    border-bottom: none
    border-top-left-radius: 6px
  .tr
    right: 0
    top: 0
    border-left: none
    border-bottom: none
    border-top-right-radius: 6px
  .bl
    left: 0
    bottom: 0
    border-right: none
    border-top: none
    border-bottom-left-radius: 6px
  .br
    right: 0
    bottom: 0
    border-left: none
    border-top: none
    border-bottom-right-radius: 6px
  &[data-tele='orange'] .c
    border-color: #ffa21f
  &[data-tele='red'] .c
    border-color: #ff2d3f
  // Out of sight: faint, grey (over any telegraph colour) and each corner's
  // two arms dashed. It fades out; seen again it is back at once, since the
  // transition only lives on the lost state.
  &[data-lost='1'] .c
    opacity: 0.38
    border-color: #b9c0d3
    transition: opacity 0.15s
  &[data-lost='1'] .tl
    border-top-style: dashed
    border-left-style: dashed
  &[data-lost='1'] .tr
    border-top-style: dashed
    border-right-style: dashed
  &[data-lost='1'] .bl
    border-bottom-style: dashed
    border-left-style: dashed
  &[data-lost='1'] .br
    border-bottom-style: dashed
    border-right-style: dashed
</style>
