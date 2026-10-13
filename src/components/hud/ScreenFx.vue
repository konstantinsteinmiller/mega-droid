<template lang="pug">
  div.sfx-layer(aria-hidden="true")
    div.low-hp(:class="{ on: lowHealthLive }")
    div.hurt(ref="hurt")
    div.flash(ref="flash")
    div.beam(ref="beam")
    div.spot(ref="spot")
    div.spot.lock(ref="spotLock")
  div.toasts(data-zone="toasts")
    TransitionGroup(name="toast")
      div.toast(v-for="tt in toasts" :key="tt.id" :style="{ color: tt.color }") {{ t(tt.key, resolveParams(t, tt.params)) }}
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { addHudTicker, hud, hudLive } from '@/game/state/hud'
import { darkFlash, lowHealthLive, screenFx, toasts } from '@/game/state/screenFx'
import { resolveParams } from '@/game/state/i18nParams'

/** Red hurt vignette, the low-health edge pulse, colour flashes (parry,
 *  perfect, pickups), the beam-in white-out, and the toast stack.
 *
 *  The low-health pulse is a CSS animation keyed on `lowHealthLive`, not a
 *  ticker write: a modal suspends the loop, and a ticker-driven vignette
 *  froze on screen under it. */
const { t } = useI18n()
const hurt = ref<HTMLElement | null>(null)
const flash = ref<HTMLElement | null>(null)
const beam = ref<HTMLElement | null>(null)
const spot = ref<HTMLElement | null>(null)
const spotLock = ref<HTMLElement | null>(null)
/** The searchlight's edge glow, eased toward `hudLive.spotLit`. */
let spotK = 0
let off: (() => void) | null = null

onMounted(() => {
  off = addHudTicker((dt) => {
    screenFx.hurt = Math.max(0, screenFx.hurt - dt * 1.6)
    screenFx.flash = Math.max(0, screenFx.flash - dt * 3.5)
    if (hurt.value) hurt.value.style.opacity = String(Math.min(1, screenFx.hurt * 0.85))
    if (flash.value) {
      flash.value.style.opacity = String(screenFx.flash)
      flash.value.style.background = screenFx.flashColor
      // A dark flash (a fall's black-out, a pit's gloom) covers; screen
      // blending would add nothing and the cut showed bare (playtest #155).
      flash.value.style.mixBlendMode = darkFlash(screenFx.flashColor) ? 'normal' : 'screen'
    }
    // The white-out rides the camera's dive into Flux's head, not the shot of
    // him arriving (`sim/beamIn.ts`): it is his view materialising.
    if (beam.value) beam.value.style.opacity = hud.phase === 'beamIn' && !hud.introCine ? '0.35' : '0'
    // In a Searchlight Drone's light: a warm rim, red while it locks on (the
    // beam's own cone fades out round the eye, `fx/searchBeam.ts`).
    spotK += (hudLive.spotLit - spotK) * Math.min(1, dt * 8)
    if (spot.value) spot.value.style.opacity = String(Math.min(1, spotK * 2))
    if (spotLock.value) spotLock.value.style.opacity = String(Math.max(0, spotK * 2 - 1))
  })
})
onUnmounted(() => off?.())
</script>

<style scoped lang="sass">
.sfx-layer
  position: absolute
  inset: 0
  pointer-events: none
// Low health: a soft red rim that fades in, then beats on the same 0.9 s
// lub-dub as the heart on the health bar (HudBars keys on the same flag, so
// the two start in the same frame). The fade lives on the element and the
// beat on its ::before, so leaving play fades it out instead of cutting it.
.low-hp
  position: absolute
  inset: 0
  opacity: 0
  transition: opacity 0.5s
  &::before
    content: ''
    position: absolute
    inset: 0
    background: radial-gradient(ellipse at center, transparent 52%, rgba(255, 40, 64, 0.18) 76%, rgba(214, 12, 44, 0.44) 100%)
    opacity: 0.6
  &.on
    opacity: 1
    &::before
      animation: low-beat 0.9s ease-out infinite
.hurt
  position: absolute
  inset: 0
  opacity: 0
  background: radial-gradient(ellipse at center, transparent 45%, rgba(255, 30, 50, 0.55) 100%)
.flash
  position: absolute
  inset: 0
  opacity: 0
  mix-blend-mode: screen
.beam
  position: absolute
  inset: 0
  opacity: 0
  background: radial-gradient(ellipse at center, rgba(180, 250, 255, 0.9) 0%, rgba(120, 220, 255, 0.4) 40%, transparent 75%)
  transition: opacity 0.4s
.spot
  position: absolute
  inset: 0
  opacity: 0
  background: radial-gradient(ellipse at center, transparent 58%, rgba(255, 241, 176, 0.14) 80%, rgba(255, 220, 140, 0.32) 100%)
  &.lock
    background: radial-gradient(ellipse at center, transparent 52%, rgba(255, 45, 63, 0.2) 78%, rgba(255, 45, 63, 0.45) 100%)
.toasts
  position: absolute
  left: 50%
  top: calc(env(safe-area-inset-top, 0px) + clamp(70px, 14vh, 120px))
  transform: translateX(-50%)
  display: flex
  flex-direction: column
  align-items: center
  gap: 6px
  pointer-events: none
  width: min(92vw, 520px)
.toast
  font-family: var(--font-ui)
  font-size: clamp(14px, 3.2vmin, 20px)
  padding: 6px 14px
  border-radius: 10px
  background: rgba(11, 20, 51, 0.78)
  border: 2px solid rgba(127, 244, 255, 0.45)
  text-shadow: 0 2px 0 #141a33
  text-align: center
.toast-enter-active, .toast-leave-active
  transition: all 0.25s
.toast-enter-from
  opacity: 0
  transform: translateY(-10px) scale(0.9)
.toast-leave-to
  opacity: 0
@keyframes low-beat
  0%, 60%, 100%
    opacity: 0.6
  12%
    opacity: 1
  26%
    opacity: 0.72
  38%
    opacity: 0.92
// A steady rim instead of a beat.
@media (prefers-reduced-motion: reduce)
  .low-hp.on::before
    animation: none
    opacity: 0.8
</style>
