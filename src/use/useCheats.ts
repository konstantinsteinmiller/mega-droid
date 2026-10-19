import { defineAsyncComponent, onMounted, onUnmounted, reactive, ref } from 'vue'
import { toggleDebug } from '@/use/useMatch'
import { safeGetBool, safeRemoveItem, safeSetItem } from '@/utils/safeStorage'

/**
 * Dev cheats.
 *
 * Enabled only when `localStorage.cheat` is truthy: set it in DevTools, or
 * type "cmonc" anywhere to toggle it (no reload needed). The cheat MAP is filled by the game at runtime through
 * `registerCheat` rather than by importing game modules here — this file is
 * imported by the eager `App.vue`, and a static import of the mission sim
 * would hoist the whole 3D engine into the entry chunk.
 */
export const isCheat = ref<boolean>(safeGetBool('cheat'))

type CheatFn = () => void
const cheats = new Map<string, { fn: CheatFn; label: string }>()

/** Register a cheat under a shortcut like `ctrl+shift+alt+k`. Last one wins. */
export const registerCheat = (shortcut: string, label: string, fn: CheatFn): void => {
  cheats.set(shortcut.toLowerCase(), { fn, label })
}

/** The cheat UI (`CheatLayer.vue`): the cmonc toast and the cheat panel
 *  (ctrl+shift+alt+F1, #Cheat1). `toast` is the key of the line on show. */
export const cheatUi = reactive({ open: false, toast: '' as '' | 'cheat.on' | 'cheat.off', toastAt: 0 })

/** Flip `localStorage.cheat` (typed "cmonc"); the panel shuts with it off. */
export const toggleCheat = (): boolean => {
  const on = !isCheat.value
  if (on) safeSetItem('cheat', 'true')
  else safeRemoveItem('cheat')
  isCheat.value = on
  if (!on) cheatUi.open = false
  cheatUi.toast = on ? 'cheat.on' : 'cheat.off'
  cheatUi.toastAt = Date.now()
  console.warn(`[CHEAT] ${on ? 'on' : 'off'}`)
  return on
}

/** The shortcut that opens the cheat panel. */
export const PANEL_SHORTCUT = 'ctrl+shift+alt+f1'

/** Lazy: the panel's code loads the first time it is shown. */
export const CheatLayer = defineAsyncComponent(() => import('@/components/organisms/CheatLayer.vue'))

let debugUnlockInstalled = false
/** Typing "cmarc" anywhere flips debug mode (FPS meter, extra logs). */
export const installDebugUnlock = (): void => {
  if (typeof window === 'undefined' || debugUnlockInstalled) return
  debugUnlockInstalled = true
  const target = 'cmarc'
  const cheatWord = 'cmonc'
  let buf = ''
  const isTypingTarget = (el: EventTarget | null): boolean => {
    if (!(el instanceof HTMLElement)) return false
    const tag = el.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
    return el.isContentEditable
  }
  window.addEventListener('keydown', (e) => {
    if (isTypingTarget(e.target)) { buf = ''; return }
    const k = e.key.toLowerCase()
    if (k.length !== 1) return
    buf = (buf + k).slice(-Math.max(target.length, cheatWord.length))
    if (buf.endsWith(target)) {
      buf = ''
      toggleDebug()
    } else if (buf.endsWith(cheatWord)) {
      buf = ''
      toggleCheat()
    }
  })
}
installDebugUnlock()

export const buildShortcut = (e: KeyboardEvent): string => {
  const parts: string[] = []
  if (e.ctrlKey || e.metaKey) parts.push('ctrl')
  if (e.shiftKey) parts.push('shift')
  if (e.altKey) parts.push('alt')
  const k = e.code.startsWith('Key') ? e.code.slice(3).toLowerCase()
    : e.code.startsWith('Digit') ? e.code.slice(5)
      : e.key.toLowerCase()
  parts.push(k)
  return parts.join('+')
}

/** One keydown against the cheat table: a no-op unless cheats are on. */
export const handleCheatKey = (e: KeyboardEvent): boolean => {
  if (!isCheat.value) return false
  const shortcut = buildShortcut(e)
  if (shortcut === PANEL_SHORTCUT) {
    e.preventDefault()
    cheatUi.open = !cheatUi.open
    return true
  }
  const entry = cheats.get(shortcut)
  if (!entry) return false
  e.preventDefault()
  entry.fn()
  console.warn(`[CHEAT] ${entry.label}`)
  return true
}

/** Attach the cheat keys for the app's lifetime. Always attached, gated per
 *  key on `isCheat`, so "cmonc" switches them on without a reload. */
const useCheats = () => {
  onMounted(() => {
    window.addEventListener('keydown', handleCheatKey, { passive: false })
    if (isCheat.value) console.warn('[CHEAT] enabled:', [...cheats.keys()].join(', ') || '(game not loaded yet)')
  })
  onUnmounted(() => {
    window.removeEventListener('keydown', handleCheatKey)
  })

  return { isCheat }
}

export default useCheats
