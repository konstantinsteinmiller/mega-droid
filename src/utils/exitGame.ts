import { touchFirst } from '@/game/engine/input'

/**
 * ─── Leaving the game from the pause menu (#204) ─────────────────────────────
 *
 * A game in fullscreen (a portal's wrapper, F11) gave the player no way out
 * but the browser's own key, which a captured mouse eats first. The pause
 * menu's Exit button leaves fullscreen and then closes the tab or window the
 * game runs in. A browser only lets a script close a window it opened, so the
 * close is best effort: leaving fullscreen is the part that always works.
 *
 * Not offered on a phone or tablet: an app there is left by the system's own
 * gesture, and a store build with a quit button is a review note.
 */

/** The Exit button shows (a desktop browser, a portal, a desktop wrapper). */
export const canExitGame = (): boolean => !touchFirst()

type FsDoc = Document & { webkitExitFullscreen?: () => Promise<void> | void; webkitFullscreenElement?: Element | null }

/** Leave fullscreen if it is on. Resolves whether or not there was any. */
export const leaveFullscreen = async (doc: FsDoc = document as FsDoc): Promise<void> => {
  try {
    if (doc.fullscreenElement && doc.exitFullscreen) await doc.exitFullscreen()
    else if (doc.webkitFullscreenElement && doc.webkitExitFullscreen) await doc.webkitExitFullscreen()
  } catch { /* already out, or the browser refused */ }
  // Embedded in a same-origin wrapper that holds the fullscreen itself.
  try {
    const top = window.top?.document as FsDoc | undefined
    if (top && top !== doc && top.fullscreenElement && top.exitFullscreen) await top.exitFullscreen()
  } catch { /* a cross-origin parent: not ours to leave */ }
}

/** Exit: out of fullscreen first, then close the window (best effort). */
export const exitGame = async (): Promise<void> => {
  await leaveFullscreen()
  try { window.close() } catch { /* not a window the game opened */ }
}
