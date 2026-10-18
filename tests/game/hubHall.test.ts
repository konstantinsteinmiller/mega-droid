// @vitest-environment jsdom
// The Deployment Hall's set (#173, `models/hubHall.ts`) never ships
// z-fighting: no two flat faces of its parts lie in one plane overlapping —
// the shell (floor tiles over their seams, walls, lintels, frames, lamps,
// the airlock, the ribs), the lab's new front and door, every pad, portal
// frame and emitter, every station and the gate. A far-seen set gets the
// centimetre tolerance: the gap a depth buffer cannot hold across the hall.

import { describe, expect, it, vi } from 'vitest'
import type { BufferGeometry } from 'three'

vi.mock('@/game/world/textures', async (orig) => {
  const { Texture } = await import('three')
  return { ...(await orig<object>()), levelAtlas: () => new Texture(), glowTexture: () => new Texture(), ringTexture: () => new Texture() }
})

import {
  buildHallShell, buildLabFront, buildHoloTable, padParts, padDisc, portalFrame, buildWeaponRack, buildForge, buildChipLab,
  buildRecords, buildTrophies, buildGate, gateLeaf, PAD_TOP, type Parts
} from '@/game/models/hubHall'
import { POIS, POI_BY_ID, TROPHY_SPOT } from '@/game/world/hubLayout'
import { xform } from '@/game/models/kit'
import { coplanarPairs } from './coplanar'

const all = (p: Parts): BufferGeometry[] => [...p.plain, ...p.toon, ...p.glow]
const side = (id: keyof typeof POI_BY_ID) => POI_BY_ID[id].side as -1 | 1

const describePairs = (parts: BufferGeometry[], tol = 0.01): string[] =>
  coplanarPairs(parts, tol).slice(0, 8).map(b => `parts ${b.a}/${b.b} at ${b.at.x.toFixed(2)},${b.at.y.toFixed(2)},${b.at.z.toFixed(2)}`)

describe('the hall has no coplanar faces', () => {
  it('the shell', () => {
    expect(describePairs(all(buildHallShell()))).toEqual([])
  })

  it('the lab\'s front and door, the briefing table', () => {
    expect(describePairs([...all(buildLabFront()), ...all(buildHoloTable())])).toEqual([])
  })

  it('every pad with its light disc, and every portal frame', () => {
    const parts: BufferGeometry[] = []
    for (const p of POIS) {
      if (p.kind === 'station') continue
      parts.push(...all(padParts(p.x, p.z, p.kind === 'job')))
      parts.push(xform(padDisc(), [p.x, PAD_TOP + 0.04, p.z]))
      if (p.kind === 'story') parts.push(...all(portalFrame(p.side as -1 | 1, p.z)))
    }
    expect(describePairs(parts)).toEqual([])
  })

  it('the stations, each in its niche', () => {
    const lit = ['#ffc21a', '#ff6a2a', null, null, null, null, null, null, null, null]
    const sets: Parts[] = [
      buildWeaponRack(side('hero'), POI_BY_ID.hero.z, lit),
      buildForge(side('workshop'), POI_BY_ID.workshop.z),
      buildChipLab(side('circuits'), POI_BY_ID.circuits.z),
      buildRecords(side('records'), POI_BY_ID.records.z, true),
      buildTrophies(TROPHY_SPOT.side, TROPHY_SPOT.z, lit)
    ]
    for (const s of sets) expect(describePairs(all(s))).toEqual([])
    expect(describePairs(all(buildRecords(side('records'), POI_BY_ID.records.z, false)))).toEqual([])
  })

  it('the Fortress gate and its leaves', () => {
    expect(describePairs([...all(buildGate()), ...all(gateLeaf(-1)), ...all(gateLeaf(1))])).toEqual([])
  })

  it('the shell with everything that stands in it', () => {
    const parts = all(buildHallShell())
    for (const p of POIS) if (p.kind === 'story' || p.kind === 'job') parts.push(...all(padParts(p.x, p.z, p.kind === 'job')))
    parts.push(...all(buildForge(side('workshop'), POI_BY_ID.workshop.z)), ...all(buildGate()))
    expect(describePairs(parts)).toEqual([])
  })
})
