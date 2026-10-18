// What every place in the Deployment Hall shows (#173, `sim/hubPlaces.ts`):
// the story pedestals light up behind the player (secured, with a rematch),
// the next one burns, the rest stand dark behind fences; the job pads open
// with the board after the Flame Master; the stations follow the lab's unlock
// rules; the records terminal is a station only with a live leaderboard.

import { describe, expect, it } from 'vitest'
import { POI_BY_ID, STORY_ORDER } from '@/game/world/hubLayout'
import { deployable, fenced, nextSector, placeState, placesFor, type PlaceInputs } from '@/game/sim/hubPlaces'
import { SECTORS } from '@/game/data/regions'
import type { Quest } from '@/game/data/quests'

const job = (id: string): Quest => ({
  id, kind: 'job', template: 'kill', sector: 'scrapyard', seed: 1, level: 3, target: 'hardhat', count: 5, rooms: 7,
  reward: { xp: 1, bolts: 1, rarityBias: 0 }
})
const save = (beaten: number, extra: Partial<PlaceInputs> = {}): PlaceInputs => ({
  unlocked: SECTORS.slice(0, beaten + 1).map(s => s.id),
  bosses: SECTORS.slice(0, beaten).map(s => s.boss),
  jobs: [],
  jobsOpen: beaten >= 2,
  menus: { hero: true, workshop: false, circuits: false, leaderboard: false },
  liveBoard: true,
  ...extra
})
const st = (id: string, i: PlaceInputs) => placeState(POI_BY_ID[id as keyof typeof POI_BY_ID], i)

describe('the story pedestals', () => {
  it('after the tutorial: the Scrapyard secured, Blaze next, the rest fenced off', () => {
    const i = save(1)
    expect(st('story:scrapyard', i)).toBe('cleared')
    expect(st('story:blaze', i)).toBe('next')
    for (const s of STORY_ORDER.slice(2)) expect(st(`story:${s}`, i)).toBe('locked')
    expect(st('story:fortress', i)).toBe('locked')
    expect(nextSector(i)).toBe('blaze')
  })

  it('every secured one can be replayed; the next one deploys; a locked one cannot', () => {
    expect(deployable('cleared')).toBe(true)
    expect(deployable('next')).toBe(true)
    expect(deployable('locked')).toBe(false)
    expect(deployable('empty')).toBe(false)
    expect(fenced('locked')).toBe(true)
    expect(fenced('cleared')).toBe(false)
  })

  it('the Fortress gate is the last one, and is secured once Vex falls', () => {
    const before = save(10)
    expect(st('story:fortress', before)).toBe('next')
    const after = save(11)
    expect(st('story:fortress', after)).toBe('cleared')
    expect(nextSector(after)).toBeNull()
  })
})

describe('the job pads', () => {
  it('stand fenced off until the Flame Master falls (#120)', () => {
    const i = save(1, { jobs: [job('a'), job('b'), job('c')] })
    for (const id of ['job0', 'job1', 'job2']) expect(st(id, i)).toBe('locked')
  })

  it('then carry the board\'s jobs, one per pad (an empty one shows empty)', () => {
    const i = save(3, { jobs: [job('a'), job('b')] })
    expect(st('job0', i)).toBe('open')
    expect(st('job1', i)).toBe('open')
    expect(st('job2', i)).toBe('empty')
  })
})

describe('the stations', () => {
  it('follow the lab\'s unlock rules', () => {
    const i = save(1, { menus: { hero: true, workshop: true, circuits: false, leaderboard: false } })
    expect(st('hero', i)).toBe('open')
    expect(st('workshop', i)).toBe('open')
    expect(st('circuits', i)).toBe('locked')
    expect(st('records', i)).toBe('locked')
    expect(st('table', i)).toBe('open')
  })

  it('the records terminal is a station only on a build with a live board', () => {
    expect(placesFor(true).some(p => p.id === 'records')).toBe(true)
    expect(placesFor(false).some(p => p.id === 'records')).toBe(false)
  })
})
