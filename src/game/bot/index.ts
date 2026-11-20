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

export const startBot = (): void => {
  if (botActive.value) return
  markCheated()
  pilot = new Autopilot()
  pilot.echo = (s) => console.info(`[bot] ${s}`)
  botHook.driver = pilot
  botActive.value = true
  timer = setInterval(direct, 400)
  console.warn('[bot] on')
}

export const stopBot = (why = 'off'): void => {
  if (!botActive.value) return
  botActive.value = false
  botHook.driver = null
  pilot = null
  if (timer) clearInterval(timer)
  timer = null
  console.warn(`[bot] ${why}`)
}

export const toggleBot = (): void => (botActive.value ? stopBot() : startBot())
