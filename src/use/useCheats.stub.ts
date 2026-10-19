// ─── useCheats no-op stub (Poki release build) ───────────────────────────────
//
// Replaces `@/use/useCheats` via `resolve.alias` in `vite.config.ts` whenever
// `platformPolicy.devTools` is false — today, the Poki release. Poki's hard
// requirements ask for a clean build: "no debug code, no dev artifacts"
// (integrate-poki REQUIREMENTS §1 row 10). A guard inside the real module would
// only remove the CALLS; the cheat table, its labels and the typed "cmarc" debug
// toggle would still ride in the bundle. Aliasing removes the code itself, the
// same mechanism as `pokiPlugin.stub.ts`.
//
// Must mirror the real module's export surface (App.vue imports the default and
// `installDebugUnlock`, `cheatUi` and `CheatLayer`; `@/game/cheats` imports
// `registerCheat`).

import { reactive, ref } from 'vue'

export const registerCheat = (_shortcut: string, _label: string, _fn: () => void): void => {}

export const installDebugUnlock = (): void => {}

export const isCheat = ref(false)

export const cheatUi = reactive({ open: false, toast: '' as '' | 'cheat.on' | 'cheat.off', toastAt: 0 })

export const toggleCheat = (): boolean => false

export const handleCheatKey = (_e: KeyboardEvent): boolean => false

export const PANEL_SHORTCUT = ''

export const buildShortcut = (_e: KeyboardEvent): string => ''

/** No cheat panel: App.vue renders nothing for it. */
export const CheatLayer = null

const useCheats = () => ({ isCheat })

export default useCheats
