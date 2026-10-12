import { toggleGameMute } from '@/use/useGameMute'

/**
 * ─── F2: the mute key, app-wide ──────────────────────────────────────────────
 *
 * F2 is the HUD's speaker button. Music a player is sick of is a reason to
 * close the tab, so the key is never anyone's to refuse: one listener for the
 * whole app (not the game scene's, which only some screens mount), on the
 * window's CAPTURE phase so it runs before every other key handler and none can
 * stop it, and with no exceptions — not a focused form field (F2 types no
 * text), not an ad (the ad's audio gate holds the context silent on its own;
 * the mute is a separate latch that simply still holds when the ad ends).
 * `e.key` as well as `e.code`, for keyboards that report the F-row oddly.
 */
const isMuteKey = (e: KeyboardEvent): boolean => e.code === 'F2' || e.key === 'F2'

const onKeyDown = (e: KeyboardEvent): void => {
  if (!isMuteKey(e)) return
  e.preventDefault()
  if (!e.repeat) toggleGameMute()
}

let installed = false

/** Attach the F2 listener once, for the app's lifetime. */
export const installMuteKey = (): void => {
  if (installed || typeof window === 'undefined') return
  installed = true
  window.addEventListener('keydown', onKeyDown, { capture: true })
}
