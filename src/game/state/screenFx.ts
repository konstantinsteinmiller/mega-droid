import { computed, reactive } from 'vue'
import { isGamePaused } from '@/use/useGamePause'
import { hud } from './hud'
import type { Item } from '../data/items'

/**
 * Full-screen feedback levels (written by the HUD event drain, decayed and
 * painted by `ScreenFx.vue` every frame) and the toast queue.
 */
export const screenFx = {
  hurt: 0,
  flash: 0,
  flashColor: '#ffffff'
}

/** A flash colour dark enough to cover rather than light up (a fall's
 *  black-out, a pit's gloom): drawn over the view, not screen-blended (which
 *  adds nothing for black, so the Core Descent's cut showed bare). */
export const darkFlash = (hex: string): boolean => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return false
  const n = parseInt(m[1]!, 16)
  return 0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255) < 40
}

/** Below this share of max HP the health bar turns red (HudBars). 40 %, not
 *  30: a playtester saw the low-health overlay one turn before dying. */
export const LOW_HP = 0.4

/**
 * The low-health warning is LIVE: under `LOW_HP` in actual play. Not while
 * beaming in or out, not dead, and not under a modal, an ad or a paused tab
 * (all of which hold `isGamePaused`; the hub unmounts the HUD outright).
 *
 * The health bar's heartbeat (HudBars) and the red edge vignette (ScreenFx)
 * both key their CSS animations on this one flag, so they start in the same
 * frame, beat in step, and restart in step after every pause.
 */
export const lowHealthLive = computed(() =>
  hud.phase === 'play' && hud.hp > 0 && hud.hp < hud.maxHp * LOW_HP && !isGamePaused.value
)

export interface Toast {
  id: number
  key: string
  params: Record<string, string | number>
  color: string
}

/** Toasts on screen at once (#151): a boss kill raised four in one breath and
 *  the stack ran down over the cards. The rest wait their turn. */
export const TOAST_SHOWN = 2
/** Waiting toasts kept; past this the oldest waiting one is dropped. */
export const TOAST_WAITING = 4
/** How long a toast stays once it is on screen, ms. */
export const TOAST_MS = 2600

/** On screen, oldest first. */
export const toasts = reactive<Toast[]>([])
/** Raised while `TOAST_SHOWN` were up: shown in order as those leave. */
const waiting: Toast[] = []
let nextToast = 1

const showToast = (t: Toast): void => {
  toasts.push(t)
  setTimeout(() => {
    const i = toasts.findIndex(x => x.id === t.id)
    if (i >= 0) toasts.splice(i, 1)
    const next = waiting.shift()
    if (next) showToast(next)
  }, TOAST_MS)
}

export const pushToast = (key: string, params: Record<string, string | number> = {}, color = '#ffffff'): void => {
  // The same words already up or waiting say nothing new.
  const same = (x: Toast) => x.key === key && JSON.stringify(x.params) === JSON.stringify(params)
  if (toasts.some(same) || waiting.some(same)) return
  const t: Toast = { id: nextToast++, key, params, color }
  if (toasts.length < TOAST_SHOWN) {
    showToast(t)
    return
  }
  waiting.push(t)
  if (waiting.length > TOAST_WAITING) waiting.shift()
}

/** How many toasts wait for a place (tests). */
export const toastsWaiting = (): number => waiting.length

/**
 * Items found in the mission, waiting for their card (`LootCard.vue`), oldest
 * first. One card at a time, each for a few seconds of PLAY: a chest opened
 * right before a modal or an ad does not spend its card unseen.
 */
export const lootQueue = reactive<Item[]>([])
/** More than this waiting and the oldest wait no longer (they are in the
 *  results and the workshop either way). */
const LOOT_MAX = 4
export const pushLoot = (item: Item): void => {
  lootQueue.push(item)
  if (lootQueue.length > LOOT_MAX) lootQueue.splice(1, 1)
}
