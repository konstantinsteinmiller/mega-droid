// A room crane's hanging crate (#134): nearly every playtester shot at it
// and wondered why a charged shot did nothing. A shot finds it where it
// hangs; it breaks once, leaves the hook empty, and stays gone after a
// delivery.
import { describe, expect, it } from 'vitest'
import { Group } from 'three'
import { RoomCrane, type RoomCraneHost } from '@/game/sim/roomCrane'
import { THEMES } from '@/game/world/themes'
import { planDecor, type CraneSpot } from '@/game/world/decor'
import { generateWakeUpCall } from '@/game/world/stages/tutorial'
import { EYE_H, PITCH_MAX } from '@/game/sim/constants'

const spot = (carry: CraneSpot['carry']): CraneSpot =>
  ({ room: 0, x0: 0, z0: 0, x1: 16, z1: 12, alongX: true, y: 5.35, floor: 0, carry })

const makeHost = (): RoomCraneHost & { sounds: string[] } => {
  const sounds: string[] = []
  const parent = new Group()
  return {
    sounds,
    propParent: () => parent,
    sfx: (n: string) => { sounds.push(n) },
    fx: { sparks: () => {}, emit: () => {}, riseRing: () => {} } as unknown as RoomCraneHost['fx'],
    shake: () => {},
    player: { x: 0, z: 0 }
  }
}

describe('a room crane\'s hanging crate', () => {
  it('is hit where it hangs, not above or beside it', () => {
    const c = new RoomCrane(makeHost(), spot('crate'), THEMES.scrapyard)
    const at = c.loadAt()!
    expect(at.y).toBeGreaterThan(2)
    expect(c.shotHitsLoad(at.x, at.y, at.z, 0.2)).toBe(true)
    expect(c.shotHitsLoad(at.x, at.y + 2, at.z, 0.2)).toBe(false)
    expect(c.shotHitsLoad(at.x + 2, at.y, at.z, 0.2)).toBe(false)
    expect(c.shotHitsLoad(at.x, 1, at.z, 0.2)).toBe(false)
  })

  it('breaks once and leaves the hook empty, even after a delivery', () => {
    const host = makeHost()
    const c = new RoomCrane(host, spot('crate'), THEMES.scrapyard)
    const at = c.loadAt()!
    expect(c.breakLoad()).toEqual(at)
    expect(host.sounds).toContain('bonk')
    expect(c.loadAt()).toBeNull()
    expect(c.shotHitsLoad(at.x, at.y, at.z, 0.2)).toBe(false)
    expect(c.breakLoad()).toBeNull()
    // A delivery comes and goes: the broken crate does not come back.
    const box = new Group()
    c.deliver(box, 8, 6, 0, 1.15)
    for (let k = 0; k < 400; k++) c.update(1 / 60, k / 60)
    expect(c.loadAt()).toBeNull()
  })

  it('a crane with nothing on its hook has nothing to hit', () => {
    const c = new RoomCrane(makeHost(), spot('none'), THEMES.scrapyard)
    expect(c.loadAt()).toBeNull()
    expect(c.breakLoad()).toBeNull()
  })

  it('the tutorial crane crate is in a shot\'s reach from the room floor', () => {
    for (const seed of [1, 2, 3, 7]) {
      const m = generateWakeUpCall(seed)
      const sp = planDecor(m, 'scrapyard').cranes.find(c => c.carry === 'crate')
      if (!sp) continue
      const at = new RoomCrane(makeHost(), sp, THEMES.scrapyard).loadAt()!
      // Standing a room's width off, the look's top still reaches it.
      const run = Math.max(sp.x1 - sp.x0, sp.z1 - sp.z0) / 2
      expect(Math.atan2(at.y - (sp.floor + EYE_H), run), `seed ${seed}`).toBeLessThan(PITCH_MAX)
    }
  })
})
