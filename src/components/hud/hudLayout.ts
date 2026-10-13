import { reactive } from 'vue'

/**
 * One layout for the HUD's loud moments (#151). A boss's entrance, a boss
 * kill and a challenge reward used to stack the boss bar, the loot card, the
 * toasts, the held-door label, Atlas's bubble and a leftover coach glyph on
 * top of each other, each placed by its own CSS as if it were alone.
 *
 * The pieces keep their CSS homes; `HudLayout.vue` measures them every frame
 * (`data-zone` marks them) and resolves the clashes with the pure rules here:
 *
 * - the top-centre column (compass, boss bar, loot card, toasts, door label)
 *   is a stack: each piece moves down under the one above it (`stackColumn`);
 * - Atlas's bubble keeps off every zone, the vitals, the cards and the big
 *   banner's band included,
 *   moving to the nearest free spot or waiting while there is none
 *   (`placeBubble`);
 * - call-outs ("+120 XP") stay under the compass and the boss bar
 *   (`zones.topClear`) and off the toasts, the loot card and the door
 *   label (`callOutY`);
 * - an emptied boss bar goes the moment its boss is dead (`bossBarShown`);
 * - the coach's glyphs step aside while a boss's name card or the big
 *   banner is up (`coachHushed`).
 */

export interface Rect { x: number; y: number; w: number; h: number }

/** The zones a piece of the HUD marks itself with (`data-zone`). */
export type ZoneId = 'vitals' | 'objective' | 'status' | 'compass' | 'boss' | 'loot' | 'toasts' | 'door' | 'title' | 'banner'

/** The top-centre column, top to bottom. The first two never move. */
export const COLUMN: readonly ZoneId[] = ['compass', 'boss', 'loot', 'toasts', 'door']
/** What Atlas's bubble must never cover. The big banner ("ENEMY DEFEATED!")
 *  draws above it and cut a line in half: the bubble keeps off its band too. */
export const BUBBLE_AVOID: readonly ZoneId[] = ['vitals', 'objective', 'status', 'compass', 'boss', 'loot', 'toasts', 'door', 'title', 'banner']

/** Space kept between two pieces, px. */
export const ZONE_GAP = 8
/** Atlas's bubble stays in the top part of the view: below it are the
 *  thumbs' sticks and buttons. */
export const BUBBLE_FLOOR = 0.62

/** The zones as last measured (`HudLayout.vue`), for the per-frame pieces. */
export const zones = {
  rects: {} as Partial<Record<ZoneId, Rect>>,
  /** Below the compass and the boss bar: call-outs keep under this, px. */
  topClear: 0
}

/** Moments the Vue parts of the HUD react to. */
export const stage = reactive({
  /** A boss's (or mini-boss's) name card is on screen (`TitleCard.vue`). */
  titleUp: false,
  /** The big banner ("ENEMY DEFEATED!") is on screen (`BigBanner.vue`). */
  bannerUp: false
})

/** The coach's glyphs step aside (they wait, faded out) while a boss's name
 *  card or the big banner is up: the banner's band crossed a weapon lesson's
 *  key glyphs under the crosshair for its whole run (pt2). */
export const coachHushed = (s: { titleUp: boolean; bannerUp: boolean }): boolean => s.titleUp || s.bannerUp

/** The column pieces a call-out keeps off ("+1690 XP" sat on the level-up
 *  toast at a boss kill, pt2). */
export const CALLOUT_AVOID: readonly ZoneId[] = ['toasts', 'loot', 'door']

/**
 * The height (px, its centre) for a call-out centred at (x, y), `w` × `h`:
 * where it is, unless it would cover one of `avoid`, then down under it (and
 * under the next it would then cover, in turn).
 */
export const callOutY = (
  x: number, y: number, w: number, h: number, avoid: readonly (Rect | undefined)[], gap = ZONE_GAP
): number => {
  let cy = y
  for (let pass = 0; pass <= avoid.length; pass++) {
    let moved = false
    for (const r of avoid) {
      if (!r || !intersects({ x: x - w / 2, y: cy - h / 2, w, h }, r)) continue
      cy = r.y + r.h + gap + h / 2
      moved = true
    }
    if (!moved) break
  }
  return cy
}

export const intersects = (a: Rect, b: Rect, pad = 0): boolean =>
  a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad

export interface ColumnPiece {
  /** Where its own CSS puts its top, px (with no push). */
  top: number
  height: number
  /** On screen. A piece that is off takes no room. */
  on: boolean
}

/**
 * The push (px, down) for each piece of a top-to-bottom column so that none
 * starts above the bottom of the one before it, plus `gap`. A piece that sits
 * lower by itself is left where it is; one that is off is never pushed.
 */
export const stackColumn = (pieces: readonly ColumnPiece[], gap = ZONE_GAP): number[] => {
  let floor = -Infinity
  return pieces.map((p) => {
    if (!p.on || p.height <= 0) return 0
    const push = Math.max(0, floor - p.top)
    floor = p.top + push + p.height + gap
    return push
  })
}

export interface View { w: number; h: number }

/**
 * Where Atlas's bubble goes: `want` (beside Atlas, or its dock) if that is
 * clear of every obstacle; else the free spot nearest to it among the spots
 * beside, under or above each obstacle (and the `docks`), on both axes. The spot
 * stays inside the view and above `BUBBLE_FLOOR`. Null: nowhere is free
 * right now, and the bubble waits.
 */
export const placeBubble = (
  want: { x: number; y: number }, size: { w: number; h: number }, obstacles: readonly Rect[],
  view: View, docks: readonly { x: number; y: number }[] = [], gap = ZONE_GAP
): { x: number; y: number } | null => {
  const floor = view.h * BUBBLE_FLOOR
  const fit = (x: number, y: number) => ({
    x: Math.min(Math.max(gap, x), view.w - size.w - gap),
    y: Math.max(gap, y)
  })
  const free = (p: { x: number; y: number }): boolean =>
    p.y + size.h <= Math.max(floor, gap + size.h) &&
    !obstacles.some(o => intersects({ x: p.x, y: p.y, w: size.w, h: size.h }, o, gap / 2))
  const first = fit(want.x, want.y)
  if (free(first)) return first
  // Every column and row that clears some obstacle (beside it, under it,
  // above it), crossed: a free corner between a toast and the banner's band
  // is reached by a move along both axes.
  const xs = [first.x, ...docks.map(d => d.x)]
  const ys = [first.y, ...docks.map(d => d.y)]
  for (const o of obstacles) {
    xs.push(o.x + o.w + gap, o.x - size.w - gap)
    ys.push(o.y + o.h + gap, o.y - size.h - gap)
  }
  const spots: { x: number; y: number }[] = []
  for (const x of xs) for (const y of ys) spots.push(fit(x, y))
  let best: { x: number; y: number } | null = null
  let bestD = Infinity
  for (const s of spots) {
    if (!free(s)) continue
    const d = Math.hypot(s.x - first.x, s.y - first.y)
    if (d < bestD) {
      bestD = d
      best = s
    }
  }
  return best
}

/**
 * The boss bar is up while its boss is: from the entrance (filling from
 * empty) until the boss is dead. `filled` = it has shown some health since
 * this boss's bar came up; back at empty after that, the boss is dead (the
 * sim keeps the name a moment longer for the death throes).
 */
export const bossBarShown = (name: string, hp01: number, filled: boolean): boolean =>
  !!name && !(filled && hp01 <= 0)
