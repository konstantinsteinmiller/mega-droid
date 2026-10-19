import { computed, reactive, ref } from 'vue'
import { profile, saveProfile, equipped, markTip, computeStats } from '@/game/state/profile'
import { behind } from '@/game/sim/adaptive'
import { canOfferReward } from '@/use/useAdGate'
import { storyFor } from '@/game/flow'
import { upgradeCost } from '@/game/data/items'
import { isUnlocked, unlockCount, type HubTab } from './hubUnlocks'

/**
 * ─── The upgrade tour (the Workshop's first visit) ───────────────────────────
 *
 * The Workshop is full of rows, prices and stats — too much to take in at
 * once. So the first time the player comes home with the Workshop open (it
 * unlocks after two finished missions, `hubUnlocks.ts`), a guide walks them
 * through the one loop that matters: bolts in, gear up. It never runs while
 * the Workshop is locked.
 *
 *   workshop       → walk to the forge and open it (the hall's golden trail
 *                    leads there; no spotlight over a moving label)
 *   upgradeBuster  → upgrade the buster (weapon: damage)
 *   pickArmor      → select the chest armour (defence)
 *   upgradeArmor   → upgrade it
 *   deploy         → back to Missions
 *
 * Wordless: a hand (a cursor on desktop) is on the target from each step's
 * first frame and taps; everything else is dimmed and inert, but a press
 * there makes the live target pulse, so the tour never reads as a lock-up
 * (`HubLesson.vue`). Each step ends on the game's own state (the tab open,
 * the level up), never on a timer. It runs once per profile
 * (`tips['lesson:upgrade']`); a player who has already upgraded something
 * skips it, and a close button ends it any time.
 */

export type { HubTab }
export type HubStep = 'workshop' | 'upgradeBuster' | 'earnBolts' | 'pickArmor' | 'upgradeArmor' | 'deploy'

export const HUB_STEPS: HubStep[] = ['workshop', 'upgradeBuster', 'earnBolts', 'pickArmor', 'upgradeArmor', 'deploy']
const DONE_KEY = 'lesson:upgrade'
const GRANT_KEY = 'lesson:upgradeGrant'

/** A tab the player may open now (Missions and Flux always). */
export const tabOpen = (id: HubTab): boolean => isUnlocked(id, unlockCount(profile))

const openTab = ref<HubTab>('missions')
/**
 * The hub's open tab (HubScreen binds it; the tour reads it). A locked tab can
 * never be open, whoever sets it: the write is ignored, and a tab that locks
 * under an open panel (a cloud save loaded on top) reads as Missions.
 */
export const hubTab = computed<HubTab>({
  get: () => (tabOpen(openTab.value) ? openTab.value : 'missions'),
  set: (id) => { if (tabOpen(id)) openTab.value = id }
})
/** The Workshop's selected item id (WorkshopTab binds it). */
export const workshopSel = ref<string | null>(null)
/** A Circuits node to open on (Pip's Overload notice sets it; CircuitsTab
 *  takes it on mount and clears it). */
export const circuitsFocus = ref<string | null>(null)

export const hubLesson = reactive({
  step: null as HubStep | null,
  /** Upgrade levels of the buster and the chest armour when the tour began. */
  busterBase: 0,
  armorBase: 0,
  /** Bolts added so the tour's two upgrades are affordable (shown as +N). */
  granted: 0,
  /** Pip's catch-up (the player fell behind the curve): the buster only, no
   *  free bolts — the Workshop offers a rewarded top-up instead. */
  catchUp: false
})

/** The next story mission's level (the selected sector's), or the player's. */
const nextLevel = (): number => storyFor(profile.world.selected)?.level ?? profile.level

/** Falling behind for the next mission, and not yet helped at this level. */
const catchUpDue = (): boolean => {
  // From the second mission on: the first one is the reference itself.
  if (!profile.world.bosses.length) return false
  const L = nextLevel()
  if (profile.tips[`lesson:catchup:${L}`]) return false
  return behind(computeStats(), L)
}

/** The first lab visit with the Workshop open, for a player who never
 *  upgraded anything. */
export const wantsHubLesson = (): boolean => {
  if (!tabOpen('workshop')) return false
  // Later visits: Pip steps in when the gear has fallen behind.
  if (profile.tips[DONE_KEY]) return !!equipped('buster') && catchUpDue()
  if (profile.inv.items.some(it => it.upg > 0)) {
    // Already found the Workshop on their own: nothing to teach.
    markTip(DONE_KEY)
    return false
  }
  return !!equipped('buster') && !!equipped('chest')
}

/** Begin the tour. Tops the wallet up once, so a short first mission never
 *  leaves the upgrade button greyed out in the middle of the lesson. */
export const startHubLesson = (): void => {
  const b = equipped('buster')
  const c = equipped('chest')
  if (!b || !c || !tabOpen('workshop')) return
  hubLesson.busterBase = b.upg
  hubLesson.armorBase = c.upg
  hubLesson.catchUp = !!profile.tips[DONE_KEY]
  if (hubLesson.catchUp) {
    profile.tips[`lesson:catchup:${nextLevel()}`] = true
    saveProfile()
  } else if (!profile.tips[GRANT_KEY]) {
    const need = upgradeCost(b) + upgradeCost(c)
    const short = Math.max(0, need - profile.bolts)
    profile.tips[GRANT_KEY] = true
    if (short > 0) {
      profile.bolts += short
      hubLesson.granted = short
    }
    saveProfile()
  }
  hubLesson.step = 'workshop'
  syncHubLesson()
}

/**
 * The step follows from the game's state, never from a timer: which of the
 * two upgrades are done, which tab is open, which item is selected. Called
 * whenever any of those change, so a player who side-steps (opens another
 * tab, re-selects the buster) is simply guided back.
 */
export const syncHubLesson = (): void => {
  if (!hubLesson.step) return
  const b = equipped('buster')
  const c = equipped('chest')
  if (!b || !c) { endHubLesson(); return }
  const inShop = hubTab.value === 'workshop'
  if (b.upg <= hubLesson.busterBase) {
    // Catch-up short of bolts: the rewarded top-up first (or, with no ad to
    // offer, the shortfall once, like the first tour's grant).
    if (hubLesson.catchUp && profile.bolts < upgradeCost(b)) {
      if (canOfferReward.value) {
        hubLesson.step = inShop ? 'earnBolts' : 'workshop'
        return
      }
      hubLesson.granted = upgradeCost(b) - profile.bolts
      profile.bolts += hubLesson.granted
      saveProfile()
    }
    hubLesson.step = inShop ? 'upgradeBuster' : 'workshop'
    // The upgrade button acts on the selection: keep it on the buster.
    if (inShop && workshopSel.value !== b.id) workshopSel.value = b.id
  } else if (!hubLesson.catchUp && c.upg <= hubLesson.armorBase) {
    hubLesson.step = !inShop ? 'workshop' : workshopSel.value === c.id ? 'upgradeArmor' : 'pickArmor'
  } else if (hubTab.value === 'missions') {
    endHubLesson()
  } else {
    hubLesson.step = 'deploy'
  }
}

/** Finished (or closed): never again for this profile. */
export const endHubLesson = (): void => {
  hubLesson.step = null
  hubLesson.granted = 0
  hubLesson.catchUp = false
  markTip(DONE_KEY)
}

/** Where each step points: a `data-lesson` anchor in the hub's DOM. */
export const stepTarget = (s: HubStep): string => {
  switch (s) {
    case 'workshop': return '[data-lesson="tab-workshop"]'
    case 'upgradeBuster':
    case 'upgradeArmor': return '[data-lesson="upgrade"]'
    case 'earnBolts': return '[data-lesson="bolts-ad"]'
    case 'pickArmor': return '[data-lesson="armor"]'
    case 'deploy': return '[data-lesson="tab-missions"]'
  }
}
