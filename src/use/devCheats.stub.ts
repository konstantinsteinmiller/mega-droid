// ─── devCheats no-op stub (Poki and Playgama release builds) ─────────────────
//
// Replaces `@/use/devCheats` via `resolve.alias` in `vite.config.ts` whenever
// `platformPolicy.devTools` is false — today, the Poki and Playgama releases,
// which ask for a clean build: "no debug code, no dev artifacts". Aliasing
// removes the shortcut table and the typed debug toggle from the bundle; the
// cheat panel (`useCheats`, #Cheat1) is not dev tooling under that rule and
// ships everywhere. Must mirror the real module's export surface.

export const registerCheat = (_shortcut: string, _label: string, _fn: () => void): void => {}

export const runDevCheat = (_shortcut: string): boolean => false

export const devCheatKeys = (): string[] => []

export const tryDebugWord = (_buf: string): boolean => false
