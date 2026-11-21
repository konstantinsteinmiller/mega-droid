import { ref } from 'vue'
import { flow, startMission, storyFor, leaveResults, debriefLive, endingLive } from '../flow'
import { currentMission } from '../boot'
import { SECTORS } from '../data/regions'
import { profile, markCheated } from '../state/profile'
import { cine, openGate, skipCutscene } from '../story/cine'
import { Autopilot } from './autopilot'
import { botHook } from './hook'

/**
 * ─── The bot: switch it on, and it plays on from where the player is ────────
 *
 * Typing "cmpnc", or tapping the mute button 30 times within 30 seconds
 * (`use/devCheats`), turns it on; the same again turns it off. It drives the
 * mission through the autopilot (`autopilot.ts`, one route per level) and the
 * game's flow through this director: the cutscenes, the results, the lab, the
 * next Core Master's stage — until the Frost Master falls, then it stops.
 *
 * It is a player, not a cheat: it presses what a player presses. It marks the
 * save as cheated all the same (no leaderboard score from a botted run).
 */

/** The last Core Master the bot goes for. */
export const BOT_LAST_BOSS = 'frostMaster'

export const botActive = ref(false)

let pilot: Autopilot | null = null
let timer: ReturnType<typeof setInterval> | null = null
let launching = false

const nextStory = () => {
  for (const s of SECTORS) {
    if (profile.world.bosses.includes(s.boss)) continue
    const q = storyFor(s.id)
    if (q) return q
  }
  return null
}

/** One look at the game's flow, a few times a second. */
const direct = (): void => {
  if (!botActive.value) return
  if (profile.world.bosses.includes(BOT_LAST_BOSS) && flow.screen !== 'mission') {
    stopBot('the Frost Master is down')
    return
  }
  switch (flow.screen) {
    case 'intro':
      if (cine.gate) openGate()
      else skipCutscene()
      break
    case 'debrief':
      debriefLive?.skip()
      break
    case 'ending':
      endingLive?.skip()
      break
    case 'hub': {
      if (flow.loading || flow.loadingLab || launching) break
      const q = nextStory()
      if (!q) break
      launching = true
      void startMission(q).finally(() => { launching = false })
      break
    }
    case 'mission': {
      if (flow.modal === 'results') void leaveResults()
      else if (flow.modal === 'defeat') {
        const m = currentMission()
        if (m?.canRetryCheckpoint) m.retryFromCheckpoint()
        else if (flow.quest && !launching) {
          launching = true
          void startMission(flow.quest).finally(() => { launching = false })
        }
      } else if (flow.modal === 'levelUp' || flow.modal === 'controls' || flow.modal === 'englishVoice') flow.modal = ''
      break
    }
    default:
  }
}

/** A dev badge on the page (the bot has no UI of its own, and on a portal's QA
 *  stage there is no console to read): what it is doing, for three seconds,
 *  and a small tag while it plays. Dev overlay: not user-facing copy. */
let badge: HTMLDivElement | null = null
let badgeTimer: ReturnType<typeof setTimeout> | null = null
const say = (text: string, hold = 3000): void => {
  if (typeof document === 'undefined') return
  if (!badge) {
    badge = document.createElement('div')
    badge.setAttribute('style', 'position:fixed;left:50%;top:8px;transform:translateX(-50%);z-index:99999;padding:4px 12px;border-radius:12px;background:rgba(10,14,30,.85);color:#7df;font:600 13px system-ui,sans-serif;pointer-events:none;letter-spacing:.04em')
    document.body.appendChild(badge)
  }
  badge.textContent = text
  badge.style.display = 'block'
  if (badgeTimer) clearTimeout(badgeTimer)
  if (hold > 0) badgeTimer = setTimeout(() => { if (badge) badge.style.display = botActive.value ? 'block' : 'none'; if (badge && botActive.value) badge.textContent = 'BOT' }, hold)
}

export const startBot = (): void => {
  if (botActive.value) return
  if (profile.world.bosses.includes(BOT_LAST_BOSS)) {
    // Nothing left to chase: say so (a silent no-op looks like a broken trigger).
    console.warn('[bot] the Frost Master is already down on this save')
    say('BOT: the Frost Master is already down on this save', 5000)
    if (flow.screen !== 'mission') return
  }
  markCheated()
  pilot = new Autopilot()
  pilot.echo = (s) => console.info(`[bot] ${s}`)
  botHook.driver = pilot
  botActive.value = true
  timer = setInterval(direct, 400)
  console.warn('[bot] on')
  say('BOT ON (type cmpnc again to stop)')
}

export const stopBot = (why = 'off'): void => {
  if (!botActive.value) return
  botActive.value = false
  botHook.driver = null
  pilot = null
  if (timer) clearInterval(timer)
  timer = null
  console.warn(`[bot] ${why}`)
  say(`BOT OFF: ${why}`)
  if (badge && !botActive.value) setTimeout(() => { if (badge && !botActive.value) badge.style.display = 'none' }, 3000)
}

export const toggleBot = (): void => (botActive.value ? stopBot() : startBot())
