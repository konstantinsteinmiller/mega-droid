import { computed, onMounted, onUnmounted, ref } from 'vue'
import { profile, saveProfile, computeStats, supplyDropBolts } from '@/game/state/profile'
import { itemPower, upgradeCost, MAX_UPG } from '@/game/data/items'
import { sfx } from '@/game/audio/sfx'
import { claimReward, canOfferReward, adInFlight } from '@/use/useAdGate'
import { resumeMusicAfterAd } from '@/use/useSound'

/**
 * ─── The lab's rewarded offers (#173: Pip's supplies) ────────────────────────
 *
 * Two videos the lab offers, both shown by Pip in his dialog (and the bolts
 * one at the forge too, where the upgrade tour points at it):
 *
 * - Bolts: a supply drop scaled by level and paced by a cooldown that lives
 *   in the save (a reload does not reset it), or, short of the best cannon's
 *   next upgrade, a top-up worth two of them. Never both (playtest
 *   2026-10-12: "+6122" beside "+860" for the same video read as nonsense):
 *   the bigger one that can be claimed now; the drop with its cooldown only
 *   when no top-up is offered.
 * - Gel for the road: one Repair Gel packed for the next mission
 *   (`claimGiftTank`), one over the cap if need be. Only after the tutorial
 *   (its gel lesson scripts the gels), never while a gift is packed, and never
 *   when he already carries more than the cap: "one over" stays one.
 *
 * Hidden whenever no rewarded ad is ready: an offer that then fails reads as
 * a broken game.
 */

export const DROP_COOLDOWN_MS = 4 * 60_000

/** A clock ticking once a second while the calling component is mounted. */
const useNow = () => {
  const now = ref(Date.now())
  let clock: number | null = null
  onMounted(() => { clock = window.setInterval(() => { now.value = Date.now() }, 1000) })
  onUnmounted(() => { if (clock !== null) clearInterval(clock) })
  return now
}

export const mmss = (s: number): string => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

export const usePipSupplies = () => {
  const now = useNow()
  // ── Bolts ──
  const dropAmount = computed(() => supplyDropBolts())
  const dropLeft = computed(() => Math.max(0, Math.ceil((profile.stats.lastDropAt + DROP_COOLDOWN_MS - now.value) / 1000)))
  /** The best cannon the player owns (by power), and what its next upgrade
   *  costs: short of that, the rewarded top-up pays two such upgrades. */
  const bestBuster = computed(() => profile.inv.items.filter(it => it.slot === 'buster' && it.upg < MAX_UPG)
    .sort((a, b) => itemPower(b) - itemPower(a))[0] ?? null)
  const shortForUpgrade = computed(() => !!bestBuster.value && profile.bolts < upgradeCost(bestBuster.value))
  const upgradeAdAmount = computed(() => (bestBuster.value ? upgradeCost(bestBuster.value) * 2 : 0))
  const adOffer = computed<'upgrade' | 'drop' | null>(() => {
    if (!canOfferReward.value) return null
    if (!shortForUpgrade.value) return 'drop'
    return dropLeft.value === 0 && dropAmount.value > upgradeAdAmount.value ? 'drop' : 'upgrade'
  })
  // The ad hard-stopped the lab music and its play intent; nothing else
  // restarts it until the next mission, so each claim brings it back.
  const claimDrop = async (): Promise<void> => {
    if (dropLeft.value > 0) return
    const n = dropAmount.value
    try {
      await claimReward(() => {
        profile.bolts += n
        profile.stats.lastDropAt = Date.now()
        now.value = Date.now()
        saveProfile()
        sfx('loot')
      })
    } finally {
      resumeMusicAfterAd()
    }
  }
  const claimUpgradeAd = async (): Promise<void> => {
    const n = upgradeAdAmount.value
    if (!n) return
    try {
      await claimReward(() => {
        profile.bolts += n
        saveProfile()
        sfx('loot')
      })
    } finally {
      resumeMusicAfterAd()
    }
  }
  // ── Gel for the road ──
  const tanksMax = computed(() => { void profile.hero.skills; return computeStats().tanksMax })
  const giftReady = computed(() => profile.world.tutorialDone && profile.inv.giftTank)
  const giftOffer = computed(() =>
    profile.world.tutorialDone && canOfferReward.value && !profile.inv.giftTank && profile.inv.tanks <= tanksMax.value)
  const claimGift = async (): Promise<void> => {
    if (profile.inv.giftTank) return
    try {
      await claimReward(() => {
        profile.inv.giftTank = true
        saveProfile()
        sfx('tank')
      })
    } finally {
      resumeMusicAfterAd()
    }
  }
  /** Pip has something to hand out now (his "!"). */
  const anyOffer = computed(() => (adOffer.value === 'drop' && dropLeft.value === 0) || adOffer.value === 'upgrade' || giftOffer.value)
  return {
    dropAmount, dropLeft, upgradeAdAmount, adOffer, claimDrop, claimUpgradeAd,
    giftReady, giftOffer, claimGift, anyOffer, adInFlight
  }
}
