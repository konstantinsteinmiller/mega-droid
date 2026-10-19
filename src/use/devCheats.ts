import { toggleDebug } from '@/use/useMatch'

/**
 * Dev tooling behind the cheat flag: the ctrl+shift+alt shortcut table the game
 * fills (`@/game/cheats`) and the typed "cmarc" debug-mode toggle. Split out of
 * `useCheats` so a build whose platform policy ships no dev tooling (the Poki
 * and Playgama releases) can alias THIS module to its stub while the cheat
 * panel (#Cheat1) and its typed toggle ship in every build.
 */
type CheatFn = () => void
const cheats = new Map<string, { fn: CheatFn; label: string }>()

/** Register a cheat under a shortcut like `ctrl+shift+alt+k`. Last one wins. */
export const registerCheat = (shortcut: string, label: string, fn: CheatFn): void => {
  cheats.set(shortcut.toLowerCase(), { fn, label })
}

/** Run the registered cheat for `shortcut`, if any. */
export const runDevCheat = (shortcut: string): boolean => {
  const entry = cheats.get(shortcut)
  if (!entry) return false
  entry.fn()
  console.warn(`[CHEAT] ${entry.label}`)
  return true
}

/** The registered shortcuts, for the boot log. */
export const devCheatKeys = (): string[] => [...cheats.keys()]

/** The typed debug word; `buf` is the tail of what the player typed. Flips
 *  debug mode (FPS meter, extra logs) and returns true on a match. */
export const tryDebugWord = (buf: string): boolean => {
  if (!buf.endsWith('cmarc')) return false
  toggleDebug()
  return true
}
