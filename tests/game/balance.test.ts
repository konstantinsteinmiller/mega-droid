import { describe, expect, it } from 'vitest'
import { simulate, bossEdge, foeEdge, REFERENCE, AD_EVERY_ROUND, NO_ADS } from '@/game/sim/balance'

// The balance targets (`scripts/balance-sim.mjs` prints the tables).
describe('the balance simulation', () => {
  const ref = simulate(REFERENCE)
  const ad = simulate(AD_EVERY_ROUND)
  const none = simulate(NO_ADS)
  const story = ref.filter(r => r.kind === 'story')

  it('plays the whole campaign: the tutorial, then every sector to its Core Master', () => {
    expect(ref[0]!.kind).toBe('tutorial')
    expect(story.map(r => r.sector)).toEqual(['blaze', 'cryo', 'volt', 'gale', 'magnet', 'drill', 'tide', 'neon', 'rotor', 'fortress'])
  })

  it('the reference player meets each Core Master in a fight of half a minute or so, Vex longer', () => {
    for (const r of story.filter(r => r.sector !== 'fortress')) {
      expect(r.bossTtk).toBeGreaterThanOrEqual(20)
      expect(r.bossTtk).toBeLessThanOrEqual(45)
    }
    const vex = story.find(r => r.sector === 'fortress')!
    expect(vex.bossTtk).toBeGreaterThan(story[0]!.bossTtk)
    expect(vex.bossTtk).toBeLessThanOrEqual(75)
  })

  it('regular machines stay a couple of seconds each all the way (upgrades keep pace with the toughening)', () => {
    for (const r of ref) {
      expect(r.foeTtk).toBeGreaterThanOrEqual(1)
      expect(r.foeTtk).toBeLessThanOrEqual(4)
    }
  })

  // Vex, the last boss, takes 1.5× his first draft's health (playtest
  // 2026-10-12): against him it takes dodging or blocking two hits in three.
  it('a Core Master is survivable: with two full-heal gels, dodging or blocking half its hits wins (Vex: two in three)', () => {
    for (const r of story) expect(r.bossTtd * 3, r.sector).toBeGreaterThanOrEqual(r.bossTtk * (r.sector === 'fortress' ? 1 / 3 : 0.5))
  })

  // Its parts follow Vex's health, 1.5× since playtest 2026-10-12: ~2:40.
  it('the Grand Master is the longest fight of the game: two to three minutes for the reference player (#101)', () => {
    const f = simulate(REFERENCE).find(r => r.sector === 'fortress' && r.kind === 'story')!
    expect(f.gmTtk).toBeGreaterThan(f.bossTtk)
    expect(f.gmTtk).toBeGreaterThanOrEqual(80)
    expect(f.gmTtk).toBeLessThanOrEqual(180)
  })

  // The gates take twice their formula's health on the story stage (playtest
  // 2026-10-12): the Gatekeeper is now as long as Vex, never longer.
  it('the Fortress mini-bosses are proper fights, never longer than Vex: the Gatekeeper, then each Twin Master', () => {
    const f = story.find(r => r.sector === 'fortress')!
    expect(f.gateTtk).toBeGreaterThanOrEqual(24)
    expect(f.gateTtk).toBeLessThanOrEqual(f.bossTtk)
    expect(f.twinTtk).toBeGreaterThanOrEqual(12)
    expect(f.twinTtk * 2).toBeLessThanOrEqual(f.bossTtk + 10)
  })

  it('the reference player is never flagged as falling behind', () => {
    for (const r of ref) expect(r.ratio).toBeGreaterThanOrEqual(0.8)
  })

  it('the every-round ad player is at most ~15% stronger against a Core Master', () => {
    for (const e of bossEdge(ref, ad)) expect(e.edge).toBeLessThanOrEqual(1.15)
    // Against the machines there is no adaptive health: the bolts show more,
    // but stay bounded by the upgrade cap.
    for (const e of foeEdge(ref, ad)) expect(e.edge).toBeLessThanOrEqual(1.4)
  })

  it('a player who never watches an ad is not left behind either', () => {
    for (const e of bossEdge(none, ref)) expect(e.edge).toBeLessThanOrEqual(1.15)
    for (const r of none) expect(r.ratio).toBeGreaterThanOrEqual(0.8)
  })
})
