// Every platform stage's secret room is a puzzle the runtime can actually
// solve (`sim/secrets.ts`). The four stages were designed in parallel with
// the puzzle runtime, against the builder's signature alone, so this holds
// them to its rules: at least one button, the puzzle not solved on arrival,
// and a solution reachable by pressing the buttons — for many seeds (the
// seed picks the kind and the colours) and both mirror sides. The later
// kinds (#143) the same: a sequence played in its order, a mirror puzzle's
// mirrors turned, a tiles puzzle walked plate by plate, one step at a time.

import { describe, expect, it } from 'vitest'
import { generateStage } from '@/game/world/stages'
import { generateClimb } from '@/game/world/climbGen'
import { CELL } from '@/game/world/levelGen'
import { initialState, press, pressCount, solved } from '@/game/sim/secrets'
import type { SecretSpec } from '@/game/world/levelGen'
import type { SectorId } from '@/game/world/themes'

const STAGES: SectorId[] = ['blaze', 'cryo', 'volt', 'gale', 'magnet', 'drill', 'tide', 'neon', 'rotor', 'fortress']

/** A tiles puzzle by walking: from some plate, onto a dark neighbour each
 *  step (a lit one, or off the plates, puts them all out), until all lit. */
const walkable = (spec: SecretSpec): boolean => {
  const ps = spec.tiles!
  const next = (a: number, b: number) => Math.abs(ps[a]!.x - ps[b]!.x) + Math.abs(ps[a]!.z - ps[b]!.z) === CELL
  const walk = (at: number, s: number[]): boolean => {
    if (solved(spec, s)) return true
    for (let b = 0; b < ps.length; b++) {
      if (!next(at, b) || s[b]) continue
      const n = s.slice()
      press(spec, n, b)
      if (walk(b, n)) return true
    }
    return false
  }
  return ps.some((_, a) => { const s = initialState(spec); press(spec, s, a); return walk(a, s) })
}

/** Breadth-first over button presses: can the puzzle be solved at all? Each
 *  button has at most four states, so the space stays tiny. */
const solvable = (spec: SecretSpec): boolean => {
  if (spec.kind === 'tiles') return walkable(spec)
  const start = initialState(spec)
  const seen = new Set([start.join(',')])
  const queue = [start]
  while (queue.length) {
    const s = queue.shift()!
    if (solved(spec, s)) return true
    for (let i = 0; i < pressCount(spec); i++) {
      const next = s.slice()
      next[i] = press(spec, next, i)
      const key = next.join(',')
      if (seen.has(key)) continue
      seen.add(key)
      queue.push(next)
    }
  }
  return false
}

const check = (secrets: SecretSpec[] | undefined, label: string): void => {
  expect(secrets?.length, `${label}: a secret`).toBeGreaterThanOrEqual(1)
  for (const s of secrets!) {
    expect(pressCount(s), `${label}: buttons (mirrors, plates)`).toBeGreaterThan(0)
    expect(solved(s, initialState(s)), `${label}: not solved on arrival (${s.kind})`).toBe(false)
    expect(solvable(s), `${label}: solvable (${s.kind})`).toBe(true)
  }
}

describe('stage secrets are fair puzzles', () => {
  for (const sector of STAGES) {
    it(`${sector}: every seed's secret starts unsolved and can be solved`, () => {
      for (let seed = 0; seed < 40; seed++) check(generateStage(sector, seed).terrain!.secrets, `${sector} #${seed}`)
    })
  }

  it('the Tower Run\'s too', () => {
    for (let seed = 0; seed < 40; seed++) check(generateClimb(seed).terrain!.secrets, `climb #${seed}`)
  })

  // #143: from the Magnet Master's stage on, each secret is one of the later
  // kinds (the earlier stages keep the lamp puzzles).
  it('the later stages each use a later kind, each kind twice', () => {
    const kinds = (['magnet', 'drill', 'tide', 'neon', 'rotor', 'fortress'] as const).map(s => generateStage(s, 1).terrain!.secrets![0]!.kind)
    expect(kinds).toEqual(['sequence', 'mirror', 'tiles', 'mirror', 'tiles', 'sequence'])
    for (const s of ['blaze', 'cryo', 'volt', 'gale'] as const) {
      expect(['lights', 'color', 'cycle'], s).toContain(generateStage(s, 1).terrain!.secrets![0]!.kind)
    }
  })
})
