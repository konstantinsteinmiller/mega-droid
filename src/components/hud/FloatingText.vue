<template lang="pug">
  div.ft-layer(ref="layer" aria-hidden="true")
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { addHudTicker, hudEvents } from '@/game/state/hud'
import { screenFx, pushToast, pushLoot } from '@/game/state/screenFx'
import { currentMission } from '@/game/boot'
import { KRANCK_LIFE, kranckTransform } from './kranck'

/**
 * Floating damage numbers and combat call-outs ("TINK!", "PARRY!", "+12 XP")
 * anchored in 3D and projected every frame. A fixed pool of spans, direct
 * style writes, no Vue reactivity on the hot path. Also the single drain for
 * the sim's HUD event queue — screen flashes and toasts are routed on from here.
 */
const { t } = useI18n()
const layer = ref<HTMLElement | null>(null)
const POOL = 32

interface Item {
  el: HTMLSpanElement
  active: boolean
  x: number
  y: number
  z: number
  t: number
  life: number
  rise: number
  jitter: number
  scale: number
  /** The weak-spot call-out: wobbles as it grows, then pops away. */
  kranck: boolean
}
const items: Item[] = []
const pt = { x: 0, y: 0, visible: false }
let off: (() => void) | null = null

const spawn = (x: number, y: number, z: number, text: string, cls: string, life: number, scale: number, color = ''): void => {
  let it = items.find(i => !i.active)
  if (!it) {
    it = items.reduce((a, b) => (a.t / a.life > b.t / b.life ? a : b))
  }
  it.active = true
  it.x = x
  it.y = y
  it.z = z
  it.t = 0
  it.life = life
  it.rise = 0.9 + Math.random() * 0.3
  it.jitter = (Math.random() - 0.5) * 36
  it.scale = scale
  it.kranck = cls === 'kranck'
  it.el.textContent = text
  it.el.className = `ft ${cls}`
  it.el.style.color = color
  it.el.style.display = 'block'
}

onMounted(() => {
  for (let i = 0; i < POOL; i++) {
    const el = document.createElement('span')
    el.className = 'ft'
    el.style.display = 'none'
    layer.value!.appendChild(el)
    items.push({ el, active: false, x: 0, y: 0, z: 0, t: 0, life: 1, rise: 1, jitter: 0, scale: 1, kranck: false })
  }
  off = addHudTicker((dt) => {
    // Drain the sim's event queue
    while (hudEvents.length) {
      const e = hudEvents.shift()!
      if (e.t === 'damage') {
        const cls = e.toPlayer ? 'dmg-player' : e.crit ? 'dmg-crit' : e.weak ? 'dmg-weak' : 'dmg'
        spawn(e.x, e.y, e.z, String(e.amount), cls, e.crit ? 1.0 : 0.8, e.crit ? 1.35 : 1)
      } else if (e.t === 'kranck') {
        spawn(e.x, e.y, e.z, t(e.key ?? 'combat.kranck'), 'kranck', KRANCK_LIFE, 1)
      } else if (e.t === 'text') {
        spawn(e.x, e.y, e.z, t(e.key, e.params ?? {}), 'call', 1.0, 1, e.color)
      } else if (e.t === 'hurt') {
        screenFx.hurt = Math.min(1, screenFx.hurt + 0.55 + e.strength * 0.45)
      } else if (e.t === 'flash') {
        screenFx.flash = Math.max(screenFx.flash, e.strength)
        screenFx.flashColor = e.color
      } else if (e.t === 'toast') {
        pushToast(e.key, e.params ?? {}, e.color)
      } else if (e.t === 'loot') {
        pushLoot(e.item)
      }
    }
    const m = currentMission()
    for (const it of items) {
      if (!it.active) continue
      it.t += dt
      const k = it.t / it.life
      if (k >= 1 || !m) {
        it.active = false
        it.el.style.display = 'none'
        continue
      }
      m.project(it.x, it.y + (it.kranck ? k * 0.25 : k * it.rise), it.z, pt)
      if (!pt.visible) {
        it.el.style.opacity = '0'
        continue
      }
      if (it.kranck) {
        it.el.style.opacity = '1'
        it.el.style.transform = `translate(${pt.x}px, ${pt.y}px) translate(-50%, -50%) ${kranckTransform(it.t)}`
        continue
      }
      const pop = k < 0.12 ? 0.6 + (k / 0.12) * 0.7 : k < 0.22 ? 1.3 - ((k - 0.12) / 0.1) * 0.3 : 1
      const op = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3
      it.el.style.opacity = String(op)
      it.el.style.transform = `translate(${pt.x + it.jitter * k}px, ${pt.y}px) translate(-50%, -50%) scale(${pop * it.scale})`
    }
  })
})
onUnmounted(() => off?.())
</script>

<style lang="sass">
@use './kranck'
.ft-layer
  position: absolute
  inset: 0
  pointer-events: none
  overflow: hidden
  .ft
    position: absolute
    left: 0
    top: 0
    font-family: var(--font-pixel)
    font-size: clamp(12px, 2.6vmin, 18px)
    line-height: 1
    white-space: nowrap
    color: #ffffff
    text-shadow: 2px 2px 0 #141a33, -1px -1px 0 #141a33, 1px -1px 0 #141a33, -1px 1px 0 #141a33
    will-change: transform, opacity
  .dmg-crit
    color: #ffd84a
    font-size: clamp(15px, 3.4vmin, 24px)
  .dmg-weak
    color: #ff9a2e
  .dmg-player
    color: #ff5a5a
  .kranck
    +kranck.look
  .call
    font-family: var(--font-ui)
    font-size: clamp(14px, 3vmin, 22px)
    letter-spacing: 0.02em
</style>
