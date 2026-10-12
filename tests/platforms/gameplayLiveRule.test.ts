// @vitest-environment jsdom
// What counts as LIVE GAMEPLAY — the predicate behind every portal's
// gameplayStart / gameplayStop bracket.
//
// This is a portal contract, not a view detail. CrazyGames counts the session
// between the two events; Poki measures conversion-to-play on the first
// `gameplayStart()` and takes a screen wake lock for the duration of the
// bracket. So every reason the game is not being played has to close it, and a
// missing one is invisible until a reviewer reads the SDK event log.
//
// The tab-away and portal-pause arms are here because they were once MISSING:
// both already halted the simulation via `isGamePaused`, so the game looked
// correct while the portal was never told, and a player who switched tabs
// mid-mission left an open bracket behind them.

import { describe, expect, it } from 'vitest'
import { isCrazyGameplayLive, isGameplayLive, type GameplayLiveInputs } from '@/use/useGameplayLifecycle'

/** A player mid-mission with nothing in the way. Each test negates one thing. */
const playing: GameplayLiveInputs = {
  screen: 'mission',
  phase: 'play',
  flowModal: false,
  anyModalOpen: false,
  adShowing: false,
  visibilityHidden: false,
  platformPaused: false
}

// A new player's first play starts with the intro (the owner's call): one
// bracket from the film going live to the tutorial's end, not a second start
// as the first level begins.
describe('the intro is the start of the first play', () => {
  const film: GameplayLiveInputs = { ...playing, screen: 'intro', phase: 'boot', introPlay: true }

  it('is live once the film runs; never before (the start gate is still up)', () => {
    expect(isGameplayLive(film)).toBe(true)
    expect(isGameplayLive({ ...film, introPlay: false })).toBe(false)
  })

  it('stays ONE play through the hand-over: no stop between the film and the first level', () => {
    // The film, the tutorial's build overlay, its beam-in, then control.
    const steps: GameplayLiveInputs[] = [
      film,
      { ...film, screen: 'mission', phase: 'boot' },
      { ...film, screen: 'mission', phase: 'beamIn' },
      { ...film, screen: 'mission', phase: 'play' },
      // The flag is dropped on the first moment of control: still live, by the usual rule.
      { ...playing }
    ]
    expect(steps.map(isGameplayLive)).toEqual([true, true, true, true, true])
  })

  it('pauses like any play: a hidden tab, an ad, the portal\'s pause, a modal', () => {
    expect(isGameplayLive({ ...film, visibilityHidden: true })).toBe(false)
    expect(isGameplayLive({ ...film, adShowing: true })).toBe(false)
    expect(isGameplayLive({ ...film, platformPaused: true })).toBe(false)
    expect(isGameplayLive({ ...film, anyModalOpen: true })).toBe(false)
  })

  it('is only ever the first play: every later beam-in is an animation again, and the Lab is menus', () => {
    expect(isGameplayLive({ ...playing, phase: 'beamIn' })).toBe(false)
    expect(isGameplayLive({ ...film, screen: 'hub', phase: 'hub' })).toBe(false)
  })
})

describe('isGameplayLive', () => {
  it('is live while the player has control in a mission', () => {
    expect(isGameplayLive(playing)).toBe(true)
  })

  it('is not live in the hub — that is menus, not play', () => {
    expect(isGameplayLive({ ...playing, screen: 'hub', phase: 'hub' })).toBe(false)
    expect(isGameplayLive({ ...playing, screen: 'boot' })).toBe(false)
  })

  it('is not live while the player has no control', () => {
    // The beam-in, the beam-out and the defeat countdown are animations: a
    // `gameplayStart` there opens a play nobody has begun, and on Poki
    // inflates the very C2P number the web fit test grades.
    expect(isGameplayLive({ ...playing, phase: 'beamIn' })).toBe(false)
    expect(isGameplayLive({ ...playing, phase: 'beamOut' })).toBe(false)
    expect(isGameplayLive({ ...playing, phase: 'dead' })).toBe(false)
  })

  // ─── The two that were missing ───────────────────────────────────────────

  it('STOPS on tab away', () => {
    expect(isGameplayLive({ ...playing, visibilityHidden: true })).toBe(false)
  })

  it('STOPS when the portal SDK asks the game to pause', () => {
    expect(isGameplayLive({ ...playing, platformPaused: true })).toBe(false)
  })

  it('comes back live when the player returns to the tab', () => {
    // The bracket must REOPEN, not stay closed — a stop with no matching start
    // costs the rest of the session's playtime on every portal that measures it.
    const away = { ...playing, visibilityHidden: true }
    expect(isGameplayLive(away)).toBe(false)
    expect(isGameplayLive({ ...away, visibilityHidden: false })).toBe(true)
  })

  // ─── The ones that were already right ────────────────────────────────────

  it('STOPS on menu entry', () => {
    expect(isGameplayLive({ ...playing, anyModalOpen: true })).toBe(false)
  })

  it('STOPS while an ad is on screen', () => {
    expect(isGameplayLive({ ...playing, adShowing: true })).toBe(false)
  })

  it('STOPS while a flow modal is up — pause, defeat, results, level-up', () => {
    expect(isGameplayLive({ ...playing, flowModal: true })).toBe(false)
  })

  it('needs EVERY reason to clear before it reports live again', () => {
    // Overlapping stops are the normal case: a modal opened while the tab was
    // hidden, an ad that opened during a portal pause. Dropping one must not
    // reopen the bracket.
    const stopped = { ...playing, visibilityHidden: true, anyModalOpen: true }
    expect(isGameplayLive({ ...stopped, visibilityHidden: false })).toBe(false)
    expect(isGameplayLive({ ...stopped, anyModalOpen: false })).toBe(false)
    expect(isGameplayLive({ ...stopped, visibilityHidden: false, anyModalOpen: false }))
      .toBe(true)
  })
})

// #138: CrazyGames QA found the first `gameplayStart()` missing when the
// player lands in the tutorial after the intro. On CG the intro is not play:
// the first start is the landing, and the pause menu stops and restarts it.
describe('CrazyGames: the first play starts at the tutorial landing', () => {
  const film: GameplayLiveInputs = { ...playing, screen: 'intro', phase: 'boot', introPlay: true }

  it('is not live through the film, the build overlay or the beam-in; live on control', () => {
    const steps: GameplayLiveInputs[] = [
      film,
      { ...film, screen: 'mission', phase: 'boot' },
      { ...film, screen: 'mission', phase: 'beamIn' },
      { ...film, screen: 'mission', phase: 'play' },
      { ...playing }
    ]
    expect(steps.map(isCrazyGameplayLive)).toEqual([false, false, false, true, true])
  })

  it('the pause menu stops it, and closing it starts it again', () => {
    expect(isCrazyGameplayLive({ ...playing, flowModal: true })).toBe(false)
    expect(isCrazyGameplayLive(playing)).toBe(true)
  })

  it('a hidden tab is not a pause on CG (it handles focus itself); ads and its own pause are', () => {
    expect(isCrazyGameplayLive({ ...playing, visibilityHidden: true })).toBe(true)
    expect(isCrazyGameplayLive({ ...playing, adShowing: true })).toBe(false)
    expect(isCrazyGameplayLive({ ...playing, platformPaused: true })).toBe(false)
  })
})
