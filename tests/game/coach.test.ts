// The control coach (src/game/sim/coach.ts): wordless glyphs that stay until
// the control has been USED, flash on every success, retire with a check, and
// come back when the player is stuck. Pure bookkeeping, so it is asserted
// without a scene.

import { beforeEach, describe, expect, it } from 'vitest'
import { Coach, hintProgress, type CoachContext, type HintId } from '@/game/sim/coach'
import { profile } from '@/game/state/profile'

const base = (time: number, over: Partial<CoachContext> = {}): CoachContext => ({
  time, family: 'mouse', playing: true, combat: false, aimCandidate: false,
  teleBlock: false, teleRed: false, hp01: 1, tanks: 0, hasWeapon: false, canInteract: false, ...over
})

/** Run the coach from `t0` to `t1` in 1/15 s steps, returning the last views. */
const run = (c: Coach, t0: number, t1: number, over: Partial<CoachContext> = {}) => {
  let v = c.views()
  for (let t = t0; t <= t1 + 1e-9; t += 1 / 15) {
    c.update(base(t, over))
    v = c.views()
  }
  return v
}
const ids = (views: ReturnType<Coach['views']>): HintId[] => views.map(v => v.id)

beforeEach(() => { profile.tips = {} })

describe('first steps', () => {
  it('shows movement and camera together from the start, and nothing else', () => {
    const c = new Coach()
    const v = run(c, 0, 1)
    expect(ids(v).sort()).toEqual(['look', 'move'])
    expect(v.every(h => h.count === 0 && h.goal === 3)).toBe(true)
  })

  it('never times out: the look glyph is still there a minute later', () => {
    const c = new Coach()
    const v = run(c, 0, 60)
    expect(ids(v)).toContain('look')
  })

  it('counts each success, flashes it, and retires the glyph with a check', () => {
    const c = new Coach()
    run(c, 0, 1)
    c.use('move')
    let v = c.views().find(h => h.id === 'move')!
    expect(v.count).toBe(1)
    expect(v.flash).toBe(1)
    c.use('move')
    c.use('move')
    v = c.views().find(h => h.id === 'move')!
    expect(v.done).toBe(true)
    expect(hintProgress('move', 'mouse')).toBe(3)
    // The check shows briefly, then the glyph is gone — and stays gone.
    expect(ids(run(c, 1.1, 3))).not.toContain('move')
    expect(ids(run(c, 3, 10))).not.toContain('move')
  })

  it('counts movement by distance and looking by angle', () => {
    const c = new Coach()
    run(c, 0, 1)
    c.moved(2.4)
    expect(c.views().find(h => h.id === 'move')!.count).toBe(0)
    c.moved(0.2)
    expect(c.views().find(h => h.id === 'move')!.count).toBe(1)
    c.looked(0.61)
    expect(c.views().find(h => h.id === 'look')!.count).toBe(1)
  })

  it('learns per input family: the joystick is not the WASD keys', () => {
    const c = new Coach()
    run(c, 0, 1)
    for (let i = 0; i < 3; i++) c.use('move')
    expect(c.mastered('move', 'mouse')).toBe(true)
    expect(c.mastered('move', 'touch')).toBe(false)
    const v = run(c, 1, 2, { family: 'touch' })
    expect(ids(v)).toContain('move')
    expect(v.find(h => h.id === 'move')!.family).toBe('touch')
  })
})

describe('context', () => {
  it('teaches shooting when there is something to shoot', () => {
    const c = new Coach()
    expect(ids(run(c, 0, 1))).not.toContain('fire')
    expect(ids(run(c, 1, 2, { combat: true }))).toContain('fire')
  })

  it('shows the shield on a blockable wind-up and the slide on a red one, first', () => {
    const c = new Coach()
    const v = run(c, 0, 1, { teleBlock: true, teleRed: true, combat: true })
    expect(v.length).toBeLessThanOrEqual(2)
    expect(ids(v)).toEqual(['slide', 'block'])
  })

  it('a deflected shot calls up the charge shot', () => {
    const c = new Coach()
    for (let i = 0; i < 4; i++) c.use('fire')
    run(c, 0, 1)
    c.deflected()
    expect(ids(run(c, 1, 2))).toContain('charge')
  })
})

describe('stuck', () => {
  const masterAll = (c: Coach) => {
    for (const id of ['move', 'look', 'walk'] as HintId[]) for (let i = 0; i < 3; i++) c.use(id)
  }

  it('brings the camera glyph back after a long time without looking — one look retires it', () => {
    const c = new Coach()
    masterAll(c)
    expect(ids(run(c, 0, 10))).not.toContain('look')
    const v = run(c, 10, 22)
    const look = v.find(h => h.id === 'look')
    expect(look).toBeDefined()
    expect(look!.goal).toBe(1)
    c.looked(0.7)
    expect(c.views().find(h => h.id === 'look')!.done).toBe(true)
    expect(ids(run(c, 22.1, 24))).not.toContain('look')
  })

  it('three blockable hits without a block bring the shield back at the next wind-up', () => {
    const c = new Coach()
    masterAll(c)
    for (let i = 0; i < 2; i++) c.use('block')
    run(c, 0, 1)
    c.blockableHit()
    c.blockableHit()
    c.blockableHit()
    expect(ids(run(c, 1, 2))).not.toContain('block')
    expect(ids(run(c, 2, 3, { teleBlock: true }))).toContain('block')
  })

  it('the "?" button shows the core set again', () => {
    const c = new Coach()
    masterAll(c)
    for (const id of ['fire', 'block', 'slide'] as HintId[]) for (let i = 0; i < 4; i++) c.use(id)
    run(c, 0, 1)
    c.help()
    const v = run(c, 1, 2)
    expect(ids(v)).toEqual(['slide', 'block'])
    // …and as those are used, the rest of the set follows.
    c.use('slide')
    c.use('block')
    expect(ids(run(c, 2.1, 4))).toEqual(expect.arrayContaining(['fire']))
  })
})

describe('during a scene lesson', () => {
  const learnThumbs = (c: Coach) => {
    for (const id of ['move', 'look', 'walk'] as HintId[]) for (let i = 0; i < 3; i++) c.use(id)
  }

  it('never silences moving and looking — the rest keeps quiet', () => {
    const c = new Coach()
    expect(ids(run(c, 0, 30, { quiet: true, aimCandidate: true })).sort()).toEqual(['look', 'move'])
  })

  it('shows the stick from the first frame on a phone too — the ∞ stands for the camera', () => {
    const c = new Coach()
    const v = run(c, 0, 0, { quiet: true, family: 'touch' })
    expect(ids(v)).toEqual(['move'])
    expect(v.every(h => h.family === 'touch')).toBe(true)
  })

  it('still warns: a blockable wind-up shows the shield, and nothing else competes', () => {
    const c = new Coach()
    learnThumbs(c)
    const v = run(c, 0, 1, { quiet: true, teleBlock: true, combat: true, aimCandidate: true })
    expect(ids(v)).toEqual(['block'])
  })

  it('the shield never pushes the thumbs out', () => {
    const c = new Coach()
    const v = run(c, 0, 1, { quiet: true, teleBlock: true, combat: true })
    expect(ids(v)).toEqual(['block', 'look', 'move'])
  })

  it('a player frozen in front of the lesson gets the stick back', () => {
    const c = new Coach()
    learnThumbs(c)
    expect(ids(run(c, 0, 10, { quiet: true }))).toEqual([])
    const v = ids(run(c, 10, 22, { quiet: true }))
    expect(v).toContain('move')
    expect(v).toContain('look')
  })

  it('the lesson over, the glyphs it held back come in', () => {
    const c = new Coach()
    learnThumbs(c)
    expect(ids(run(c, 0, 5, { quiet: true, aimCandidate: true }))).toEqual([])
    expect(ids(run(c, 5, 6, { aimCandidate: true }))).toEqual(['fire'])
  })
})

describe('the camera on touch: no glyph of its own', () => {
  // The ∞ finger ("drag here, any way") replaces the finger that swayed left
  // and right: on touch the coach never raises `look`, and nothing waits on it.
  const touch = { family: 'touch' } as const
  /** Every glyph id shown at any step from `t0` to `t1`. */
  const seen = (c: Coach, t0: number, t1: number, over: Partial<CoachContext> = {}): Set<HintId> => {
    const all = new Set<HintId>()
    for (let t = t0; t <= t1 + 1e-9; t += 1 / 15) {
      c.update(base(t, over))
      for (const h of c.views()) all.add(h.id)
    }
    return all
  }

  it('never raises look: not at first, not a minute later, not in a lesson', () => {
    expect([...seen(new Coach(), 0, 60, touch)]).toEqual(['move'])
    expect([...seen(new Coach(), 0, 30, { ...touch, quiet: true, aimCandidate: true })]).toEqual(['move'])
  })

  it('never brings it back when idle, long past LOOK_IDLE — the stick still does', () => {
    const c = new Coach()
    run(c, 0, 0, touch)
    for (const id of ['move', 'walk'] as HintId[]) for (let i = 0; i < 3; i++) c.use(id)
    // From 1 s: the stick's check has faded, so a stick seen later is its recall.
    const all = seen(c, 1, 60, touch)
    expect(all.has('look')).toBe(false)
    expect(all.has('move')).toBe(true)
  })

  it('the "?" button brings the core set back without it', () => {
    const shownAfterHelp = (family: 'touch' | 'mouse') => {
      const c = new Coach()
      run(c, 0, 0, { family })
      for (const id of ['move', 'look', 'walk', 'fire', 'block', 'slide'] as HintId[]) for (let i = 0; i < 4; i++) c.use(id)
      run(c, 0, 1, { family })
      c.help()
      run(c, 1, 2, { family })
      for (const id of ['slide', 'block', 'fire'] as HintId[]) c.use(id)
      return ids(run(c, 2.1, 4, { family })).sort()
    }
    expect(shownAfterHelp('touch')).toEqual(['move'])
    expect(shownAfterHelp('mouse')).toEqual(['look', 'move'])
  })

  it('lets walk in for a player who never looked', () => {
    const c = new Coach()
    run(c, 0, 1, touch)
    for (let i = 0; i < 3; i++) c.use('move')
    expect(c.mastered('look')).toBe(false)
    expect(ids(run(c, 1, 5, touch))).toEqual(['walk'])
  })

  it('still counts looking, but gates nothing on it (the drone lesson reads `learned`)', () => {
    const c = new Coach()
    run(c, 0, 0, touch)
    expect(c.learned('look')).toBe(true)
    expect(c.learned('move')).toBe(false)
    expect(c.learned('look', 'mouse')).toBe(false)
    c.looked(0.61)
    expect(hintProgress('look', 'touch')).toBe(1)
    expect(ids(run(c, 0, 1, touch))).toEqual(['move'])
  })

  it('drops a camera glyph still lingering from the mouse when the phone takes over', () => {
    const c = new Coach()
    expect(ids(run(c, 0, 1)).sort()).toEqual(['look', 'move'])
    const v = run(c, 1.05, 1.5, touch)
    expect(ids(v)).toEqual(['move'])
    expect(v[0]!.family).toBe('touch')
  })

  it('on the mouse, the camera glyph is as before, and walk still waits for it', () => {
    const c = new Coach()
    run(c, 0, 1)
    for (let i = 0; i < 3; i++) c.use('move')
    expect(c.learned('look')).toBe(false)
    const v = run(c, 1, 5)
    expect(ids(v)).toEqual(['look'])
    for (let i = 0; i < 3; i++) c.use('look')
    expect(ids(run(c, 5, 10))).toEqual(['walk'])
  })
})

describe('the repair tank', () => {
  it('comes in at half health with a tank carried, not before', () => {
    const c = new Coach()
    expect(ids(run(c, 0, 1, { hp01: 0.6, tanks: 1 }))).not.toContain('tank')
    expect(ids(run(c, 1, 2, { hp01: 0.45, tanks: 1 }))).toContain('tank')
    const d = new Coach()
    expect(ids(run(d, 0, 1, { hp01: 0.2, tanks: 0 }))).not.toContain('tank')
  })
})

describe('the shield lesson', () => {
  // A diving drone's ring is gone before it is read: in the tutorial's block
  // lesson the glyph stays up, emphasised, until a block actually lands.
  it('keeps the block glyph up and urgent with no ring winding up', () => {
    const c = new Coach()
    for (const id of ['move', 'look'] as HintId[]) for (let k = 0; k < 3; k++) c.use(id)
    const v = run(c, 0, 8, { blockLesson: true, combat: true })
    const b = v.find(h => h.id === 'block')
    expect(b).toBeDefined()
    expect(b!.urgent).toBe(true)
  })

  it('shows it even when the block was mastered before', () => {
    profile.tips = { 'hint:block:mouse': 2 }
    const c = new Coach()
    expect(ids(run(c, 0, 1, { blockLesson: true }))).toContain('block')
  })

  it('is not urgent outside the lesson', () => {
    const c = new Coach()
    const b = run(c, 0, 1, { teleBlock: true }).find(h => h.id === 'block')
    expect(b?.urgent).toBeFalsy()
  })
})

describe('the shield lesson', () => {
  // A diving drone's ring is gone before it is read: in the tutorial's block
  // lesson the glyph stays up, emphasised, until a block actually lands.
  it('keeps the block glyph up and urgent with no ring winding up', () => {
    const c = new Coach()
    for (const id of ['move', 'look'] as HintId[]) for (let k = 0; k < 3; k++) c.use(id)
    const v = run(c, 0, 8, { blockLesson: true, combat: true })
    const b = v.find(h => h.id === 'block')
    expect(b).toBeDefined()
    expect(b!.urgent).toBe(true)
  })

  it('shows it even when the block was mastered before', () => {
    profile.tips = { 'hint:block:mouse': 2 }
    const c = new Coach()
    expect(ids(run(c, 0, 1, { blockLesson: true }))).toContain('block')
  })

  it('is not urgent outside the lesson', () => {
    const c = new Coach()
    const b = run(c, 0, 1, { teleBlock: true }).find(h => h.id === 'block')
    expect(b?.urgent).toBeFalsy()
  })
})

// Playtest: on a desktop the mouse "fire" glyph stayed up after the charge
// lesson and kept coming back in the shield and slide lessons, pointing at
// the wrong button. The charge lesson masters shooting; a lesson hologram
// (which shows its own input) hushes the coach.
describe('after the charge lesson', () => {
  it('master() retires the fire and charge glyphs for good', () => {
    const c = new Coach()
    for (const id of ['move', 'look'] as HintId[]) { c.use(id); c.use(id); c.use(id) }
    expect(ids(run(c, 0, 1, { combat: true }))).toContain('fire')
    c.master('fire')
    c.master('charge')
    expect(hintProgress('fire', 'mouse')).toBe(4)
    // Gone (its check fades), and not wanted again while he keeps fighting.
    expect(ids(run(c, 1, 6, { combat: true }))).not.toContain('fire')
    expect(ids(run(c, 6, 6.5, { combat: true }))).not.toContain('charge')
  })

  it('a quiet coach never calls the fire glyph back in a fight', () => {
    const c = new Coach()
    for (const id of ['move', 'look'] as HintId[]) { c.use(id); c.use(id); c.use(id) }
    expect(ids(run(c, 0, 20, { combat: true, quiet: true }))).not.toContain('fire')
  })
})

// Playtest: a recalled shoot glyph stayed up over an empty corridor after
// the drones were down. A recall shows only while it can be acted on.
describe('recalls', () => {
  it('a recalled shoot glyph shows in a fight and goes once the fight is over', () => {
    const c = new Coach()
    for (const id of ['move', 'look'] as HintId[]) { c.use(id); c.use(id); c.use(id) }
    c.use('fire')
    expect(ids(run(c, 0, 12, { combat: true }))).toContain('fire')
    expect(ids(run(c, 12, 18, { combat: false }))).not.toContain('fire')
  })

  it('never comes back for a player who has shot enough', () => {
    const c = new Coach()
    for (const id of ['move', 'look'] as HintId[]) { c.use(id); c.use(id); c.use(id) }
    for (let k = 0; k < 4; k++) c.use('fire')
    expect(ids(run(c, 0, 20, { combat: true }))).not.toContain('fire')
  })
})


describe('the "stuck" shoot glyph', () => {
  // In the tutorial a plain fight (or an empty room) is no time to point at
  // the fire button: only its lessons about shooting show it.
  const learned = (): Coach => {
    const c = new Coach()
    for (const id of ['move', 'look'] as HintId[]) { c.use(id); c.use(id); c.use(id) }
    return c
  }
  it('stays away in a plain tutorial fight, however long the player holds fire', () => {
    expect(ids(run(learned(), 0, 30, { combat: true, aimCandidate: true, lessonsTeach: true }))).not.toContain('fire')
  })
  it('shows in a shooting lesson', () => {
    expect(ids(run(learned(), 0, 30, { combat: true, aimCandidate: true, lessonsTeach: true, fireLesson: true }))).toContain('fire')
  })
})
