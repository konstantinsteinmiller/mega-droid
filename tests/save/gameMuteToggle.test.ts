// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { drainAndResetModules, drainPersist, holdGameState } from '../stubs/drainPersist'

// ─── The HUD speaker button and F2 ───────────────────────────────────────────
//
// One switch, three ways in: the top bar's speaker button, F2 on any screen,
// and FMuteButton. `useGameMute` must drive the SAME state FMuteButton does
// (on desktop the volume mute of useCrazyMuteSync), or the button would say
// "muted" over a game that is playing.

const SOUND_KEY = 'ma_user_sound_volume'
const MUSIC_KEY = 'ma_user_music_volume'

beforeEach(async () => {
  localStorage.clear()
  drainAndResetModules()
  await holdGameState()
})

afterEach(drainPersist)

describe('useGameMute (desktop)', () => {
  it('mutes and unmutes through the shared volume mute', async () => {
    const { gameMuted, toggleGameMute } = await import('@/use/useGameMute')
    const { isMuted } = await import('@/use/useCrazyMuteSync')
    const { getState } = await import('@/use/useGameState')
    expect(gameMuted.value).toBe(false)

    toggleGameMute()
    expect(gameMuted.value).toBe(true)
    expect(isMuted.value).toBe(true)
    expect(getState(MUSIC_KEY)).toBe(0)
    expect(getState(SOUND_KEY)).toBe(0)

    toggleGameMute()
    expect(gameMuted.value).toBe(false)
    expect(getState(MUSIC_KEY)).toBeGreaterThan(0)
    expect(getState(SOUND_KEY)).toBeGreaterThan(0)
  })
})

describe('wiring', () => {
  const src = (p: string) => readFileSync(resolve(__dirname, '../..', p), 'utf8')

  it('the top bar puts the speaker left of the help button, keycap F2', () => {
    const top = src('src/components/hud/TopStatus.vue')
    const mute = top.indexOf('button.mute(')
    const help = top.indexOf('button.help(')
    expect(mute).toBeGreaterThan(0)
    expect(mute).toBeLessThan(help)
    expect(top).toMatch(/KeyCap\.kc\(v-if="desk" code="F2"\)/)
    expect(top).toMatch(/hud\.unmute/)
  })

  it('F2 is installed app-wide, not by the game scene', () => {
    expect(src('src/App.vue')).toMatch(/installMuteKey\(\)/)
    const scene = src('src/views/GameScene.vue')
    expect(scene).not.toMatch(/toggleGameMute/)
  })

  it('the audio graph holds every bus silent while the player has muted', () => {
    const engine = src('src/game/audio/engine.ts')
    expect(engine).toMatch(/const muted = .*playerMuted\.value/)
    expect(engine).toMatch(/watch\(\[[^\]]*playerMuted\]/)
  })
})

// ─── Bulletproof (playtest 2026-10-11: "F2 doesn't work, the music keeps
// playing") ─────────────────────────────────────────────────────────────────
//
// Music a player is sick of is a reason to leave. F2 must reach the mute from
// anywhere, and once muted nothing but the player may bring the sound back.
describe('F2, from anywhere', () => {
  const press = (target: EventTarget, init: KeyboardEventInit = {}) =>
    target.dispatchEvent(new KeyboardEvent('keydown', { code: 'F2', key: 'F2', bubbles: true, cancelable: true, ...init }))

  it('toggles even when another handler swallows the key, under an ad, or in a form field', async () => {
    const { installMuteKey } = await import('@/use/useMuteKey')
    const { gameMuted } = await import('@/use/useGameMute')
    const { isAdShowing } = await import('@/use/useGamePause')
    installMuteKey()
    installMuteKey()
    const swallow = (e: Event) => { e.stopImmediatePropagation(); e.stopPropagation() }
    document.addEventListener('keydown', swallow, true)
    try {
      press(document.body)
      expect(gameMuted.value).toBe(true)
      press(document.body, { repeat: true })
      expect(gameMuted.value, 'a held key toggles once').toBe(true)
      isAdShowing.value = true
      press(document.body)
      expect(gameMuted.value).toBe(false)
      isAdShowing.value = false
      const field = document.createElement('input')
      document.body.appendChild(field)
      field.focus()
      press(field)
      expect(gameMuted.value).toBe(true)
      field.remove()
      // A keyboard that reports only the key name.
      press(document.body, { code: '' })
      expect(gameMuted.value).toBe(false)
    } finally {
      document.removeEventListener('keydown', swallow, true)
    }
  })

  it('a cloud re-hydrate that brings the old volumes back does not unmute', async () => {
    const { gameMuted, toggleGameMute } = await import('@/use/useGameMute')
    const { setState } = await import('@/use/useGameState')
    const { saveDataVersion } = await import('@/use/useSaveStatus')
    const { playerMuted } = await import('@/use/useUser')
    const { nextTick } = await import('vue')
    toggleGameMute()
    expect(gameMuted.value).toBe(true)
    // An older save lands with the volumes up.
    setState(MUSIC_KEY, 0.4)
    setState(SOUND_KEY, 0.7)
    saveDataVersion.value++
    await nextTick()
    expect(playerMuted.value).toBe(true)
    expect(gameMuted.value).toBe(true)
    // One more F2 and the sound is back.
    toggleGameMute()
    expect(gameMuted.value).toBe(false)
    expect(playerMuted.value).toBe(false)
  })

  it('raising a volume slider lifts the mute; a slider at zero does not', async () => {
    const { gameMuted, toggleGameMute } = await import('@/use/useGameMute')
    const useUser = (await import('@/use/useUser')).default
    const { setSettingValue } = useUser()
    toggleGameMute()
    setSettingValue('music', 0)
    expect(gameMuted.value).toBe(true)
    setSettingValue('music', 0.3)
    expect(gameMuted.value).toBe(false)
  })
})
