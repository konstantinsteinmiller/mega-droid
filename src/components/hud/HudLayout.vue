<template lang="pug">
  div.hud-layout(ref="root" aria-hidden="true")
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { addHudTicker } from '@/game/state/hud'
import { COLUMN, ZONE_GAP, stackColumn, zones, type Rect, type ZoneId } from './hudLayout'

/**
 * The HUD's one layout (`hudLayout.ts`), applied every frame from the HUD
 * ticker: measures every piece marked `data-zone`, pushes the top-centre
 * column apart (a margin, so each piece's own transforms and animations are
 * left alone) and publishes the zones for the per-frame pieces that keep off
 * them (Atlas's bubble, the call-outs). Renders nothing.
 */
const root = ref<HTMLElement | null>(null)
/** The push each column piece carries now, px. */
const pushOf = new WeakMap<HTMLElement, number>()
let off: (() => void) | null = null

/** On screen: laid out, not hidden, not faded to nothing (its own or a parent's). */
const showing = (el: HTMLElement, r: DOMRect): boolean => {
  if (r.width <= 0 || r.height <= 0) return false
  const check = (el as HTMLElement & { checkVisibility?: (o: object) => boolean }).checkVisibility
  return check ? check.call(el, { opacityProperty: true, visibilityProperty: true }) : true
}

const layout = (): void => {
  const scope = root.value?.closest('.scene-root') ?? document
  const found = new Map<ZoneId, { el: HTMLElement, r: DOMRect }>()
  for (const el of scope.querySelectorAll<HTMLElement>('[data-zone]')) {
    const id = el.dataset.zone as ZoneId
    const r = el.getBoundingClientRect()
    if (!found.has(id) && showing(el, r)) found.set(id, { el, r })
  }
  // The column: read every piece first, then write the pushes.
  const pieces = COLUMN.map((id) => {
    const f = found.get(id)
    const push = f ? (pushOf.get(f.el) ?? 0) : 0
    // The layout height: a card scaling in would otherwise pull the pieces
    // under it up and down through its entrance.
    return { el: f?.el ?? null, top: f ? f.r.top - push : 0, height: f ? f.el.offsetHeight || f.r.height : 0, on: !!f, push }
  })
  const pushes = stackColumn(pieces)
  const rects: Partial<Record<ZoneId, Rect>> = {}
  for (const [id, f] of found) rects[id] = { x: f.r.left, y: f.r.top, w: f.r.width, h: f.r.height }
  pieces.forEach((p, i) => {
    const want = pushes[i]!
    if (!p.el) return
    if (Math.abs(want - p.push) > 0.5) {
      p.el.style.marginTop = want > 0 ? `${want.toFixed(0)}px` : ''
      pushOf.set(p.el, want)
    }
    const r = rects[COLUMN[i]!]
    if (r) r.y += want - p.push
  })
  zones.rects = rects
  let clear = 0
  for (const id of ['compass', 'boss'] as const) {
    const r = rects[id]
    if (r) clear = Math.max(clear, r.y + r.h + ZONE_GAP)
  }
  zones.topClear = clear
}

onMounted(() => { off = addHudTicker(layout) })
onUnmounted(() => {
  off?.()
  zones.rects = {}
  zones.topClear = 0
})
</script>

<style scoped lang="sass">
.hud-layout
  display: none
</style>
