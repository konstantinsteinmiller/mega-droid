// #118: every room of the tutorial looks like itself (playtest 2026-10-06:
// players wandered between rooms that were all the same green). Its own wall
// colours, an accent and a wall prop it repeats, and no two rooms alike.
import { describe, expect, it } from 'vitest'
import { generateWakeUpCall, TUTORIAL_ROOM_STYLE } from '@/game/world/stages/tutorial'
import { planDecor, LANDMARKS_PER_ROOM } from '@/game/world/decor'
import { DECOR, type DecorKind } from '@/game/models/decorProps'

describe('the tutorial rooms\' landmarks', () => {
  const map = generateWakeUpCall(20261916)

  it('gives every walkthrough room a style, each with a wall prop, and no two alike', () => {
    expect(map.roomStyle).toBe(TUTORIAL_ROOM_STYLE)
    expect(TUTORIAL_ROOM_STYLE.length).toBeGreaterThanOrEqual(10)
    for (const st of TUTORIAL_ROOM_STYLE) expect(DECOR[st.prop as DecorKind]?.mount, st.prop).toBe('wall')
    expect(new Set(TUTORIAL_ROOM_STYLE.map(s => s.wall)).size).toBe(TUTORIAL_ROOM_STYLE.length)
    expect(new Set(TUTORIAL_ROOM_STYLE.map(s => s.prop)).size).toBe(TUTORIAL_ROOM_STYLE.length)
  })

  it('hangs each room\'s own prop on its walls', () => {
    const { props } = planDecor(map, 'scrapyard')
    TUTORIAL_ROOM_STYLE.forEach((st, r) => {
      const mine = props.filter(p => p.room === r && p.kind === st.prop)
      expect(mine.length, `room ${r} (${st.prop})`).toBeGreaterThanOrEqual(1)
      expect(mine.length).toBeLessThanOrEqual(LANDMARKS_PER_ROOM + 2)
    })
  })

  // #175: a wall prop shaped like a doorway (two posts and a lintel) on a
  // wall with no door sent players looking for a way through.
  it('hangs no fake door frame on any wall', () => {
    const { props } = planDecor(map, 'scrapyard')
    const doorLike: DecorKind[] = ['shoring']
    expect(props.filter(p => doorLike.includes(p.kind as DecorKind))).toEqual([])
  })
})
