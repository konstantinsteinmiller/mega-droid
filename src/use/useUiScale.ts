/**
 * ─── The UI scale for small screens ─────────────────────────────────────────
 *
 * The menus (the Lab, every modal) are laid out in px for a phone of today:
 * about 390 px tall in landscape, 375 px wide in portrait. On an old or small
 * phone (a 568x320 landscape screen, a 320 px wide portrait one) the same
 * layout runs out of room: the Lab's panel shows two items of a list and its
 * modals lose their title ribbon. Rather than a second layout, the menus are
 * drawn at a share of their size there: `--ui-scale` on the root, read as a
 * CSS `zoom` by the Lab's blocks and the modal shell (FModal). Text gets smaller with everything
 * else, so a player on a small screen sees the whole menu.
 *
 * Never below MIN (text must stay readable), never above 1 (a big screen keeps
 * the layout as designed). The game's 3D canvas and the in-mission touch HUD
 * are NOT scaled: the renderer sizes itself from the window, and the joystick
 * lives in screen pixels.
 */
export const UI_REF = { height: 390, width: 375 }
export const UI_MIN = 0.7

/** The menus' scale for a viewport: the short side against the layout's reference. */
export const uiScaleFor = (w: number, h: number): number => {
  const landscape = w > h
  const s = landscape ? h / UI_REF.height : w / UI_REF.width
  return Math.round(Math.max(UI_MIN, Math.min(1, s)) * 1000) / 1000
}

let installed = false

/** Keep `--ui-scale` on <html> in step with the window (App.vue, once). */
export const installUiScale = (): void => {
  if (installed || typeof window === 'undefined') return
  installed = true
  const apply = () => document.documentElement.style.setProperty('--ui-scale', String(uiScaleFor(window.innerWidth, window.innerHeight)))
  apply()
  window.addEventListener('resize', apply)
  window.addEventListener('orientationchange', () => setTimeout(apply, 200))
}
