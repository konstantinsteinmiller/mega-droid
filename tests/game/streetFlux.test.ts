// @vitest-environment jsdom
// Flux on the intro's street (`story/streetFlux.ts`), stepped frame by frame
// on the picture's clock the way the cutscene plays it. Three things made him
// twitch: through the whole showcase, standing still, his legs marked time
// at 57 % of a stride (most visible in the hero pose the intro ends on);
// the run skated, its legs at a quarter of the pace the ground went by; and
// each move (the aim, the shield, the gel, the dashes) was laid on from rest,
// so a joint jumped the frame it began and the frame it ended.

import { describe, expect, it } from 'vitest'
import { Group, Quaternion, Vector3 } from 'three'
import { buildHero } from '@/game/models/hero'
import { newMotion, cycleLen } from '@/game/models/motion'
import { pose, poseToward } from '@/game/models/kit'
import {
  streetTime, STREET_AT, STREET_DONE, STREET_FROM, STREET_END, SHOW_SLIDE_FROM, SHOW_SLIDE_TO, SHOW_FLEE_FROM, SHOW_FLEE_TO
} from '@/game/story/introScript'
import { poseStreetFlux, newStreetFlux, RUN_GAIT, RUN_SPEED, RUN_CADENCE, DASH_RUN } from '@/game/story/streetFlux'

const DASHES = [DASH_RUN, [SHOW_SLIDE_FROM, SHOW_SLIDE_TO], [SHOW_FLEE_FROM, SHOW_FLEE_TO]] as const

interface Frame { st: number; q: Record<string, Quaternion>; root: Vector3; soleL: Vector3; soleR: Vector3; dash: number }

/** The whole street at 60 fps on the picture clock (the slow motion slows it). */
const play = (): Frame[] => {
  const R = buildHero()
  const F = new Group()
  F.add(R.root)
  const m = newMotion(7)
  const out = newStreetFlux()
  const frames: Frame[] = []
  for (let t = STREET_AT; t <= STREET_DONE + 0.5; t += 1 / 60) {
    const st = streetTime(t)
    poseStreetFlux(R, F, m, st, out)
    F.updateMatrixWorld(true)
    const q: Record<string, Quaternion> = {}
    for (const [k, b] of Object.entries(R.bones)) q[k] = b.quaternion.clone()
    frames.push({
      st, q, root: F.position.clone(), dash: out.dashOn,
      soleL: R.bones.kneeL!.localToWorld(new Vector3(0, -0.36, 0)),
      soleR: R.bones.kneeR!.localToWorld(new Vector3(0, -0.36, 0))
    })
  }
  return frames
}

describe('Flux on the intro street', () => {
  const frames = play()

  it('covers the whole street, run to hero pose', () => {
    expect(frames[0]!.st).toBeCloseTo(STREET_FROM, 5)
    expect(frames[frames.length - 1]!.st).toBeCloseTo(STREET_END, 5)
  })

  it('no joint jumps between frames: each move turns the joints from where they are', () => {
    // A move laid on from rest jumped in ONE frame as its weight left 0 or
    // came back to it (the shield arm, the aim's hips, the knees out of a
    // dash): a step far bigger than the frames either side of it (by
    // 0.15-0.5 rad). An eased move speeds up and slows down over several
    // frames instead.
    const keys = Object.keys(frames[0]!.q)
    const step = (i: number, k: string) => frames[i - 1]!.q[k]!.angleTo(frames[i]!.q[k]!)
    const jumps: string[] = []
    let worst = 0
    let where = ''
    for (let i = 2; i < frames.length - 1; i++) {
      const runLegs = frames[i]!.st < DASH_RUN[0]
      for (const k of keys) {
        // (The sprint: the gait's stance and swing, its test below.)
        if (runLegs) continue
        const d = step(i, k)
        if (d > worst) { worst = d; where = `${k} at st ${frames[i]!.st.toFixed(3)}` }
        const around = (step(i - 1, k) + step(i + 1, k)) / 2
        if (d - around > Math.max(0.05, around / 2)) jumps.push(`${k} ${d.toFixed(2)} at st ${frames[i]!.st.toFixed(3)}`)
      }
    }
    expect(jumps.join("; ")).toBe("")
    // The fastest eased move is the dash's kick (0.1 s from crouch to full
    // reach); nothing turns faster than it.
    expect(worst, where).toBeLessThan(0.45)
  })

  it('the sprint\'s legs move in steps a frame can hold', () => {
    let worst = 0
    for (let i = 1; i < frames.length; i++) {
      if (frames[i]!.st >= DASH_RUN[0]) break
      for (const k of ['hipL', 'hipR', 'kneeL', 'kneeR']) worst = Math.max(worst, frames[i - 1]!.q[k]!.angleTo(frames[i]!.q[k]!))
    }
    expect(worst).toBeLessThan(0.5)
  })

  it('standing, he stands: no stride while his root holds still (the old march in place)', () => {
    let still = 0
    for (let i = 1; i < frames.length; i++) {
      const a = frames[i - 1]!
      const b = frames[i]!
      const speed = Math.hypot(b.root.x - a.root.x, b.root.z - a.root.z) * 60
      // (A dash's wind-up and its settle are moves, not strides.)
      if (speed > 0.05 || DASHES.some(([d0, d1]) => b.st > d0 - 0.2 && b.st < d1 + 0.4) || b.st < DASH_RUN[1] + 0.4) continue
      still++
      // A planted leg turns only with a move's stance (the aim's), never cycles:
      // over a still stretch each leg joint changes by a hair per frame.
      for (const k of ['hipL', 'hipR', 'kneeL', 'kneeR']) expect(a.q[k]!.angleTo(b.q[k]!), `${k} at st ${b.st.toFixed(2)}`).toBeLessThan(0.02)
    }
    // Most of the showcase is him standing his ground.
    expect(still).toBeGreaterThan(400)
  })

  it('the hero pose the intro ends on holds: the last second is a still frame below the waist', () => {
    const tail = frames.filter(f => f.st > STREET_END - 1)
    for (const k of ['hipL', 'hipR', 'kneeL', 'kneeR']) {
      for (const f of tail) expect(f.q[k]!.angleTo(tail[0]!.q[k]!)).toBeLessThan(1e-3)
    }
  })

  it('the run keeps its planted foot planted: its cadence matches the ground going by', () => {
    expect(RUN_CADENCE * cycleLen(RUN_GAIT, RUN_GAIT.A) / (2 * Math.PI)).toBeCloseTo(RUN_SPEED, 5)
    // On the rig: the lower sole, mid-run, moves with the ground (the root
    // goes by at RUN_SPEED; a skating foot moved at most of it).
    const slips: number[] = []
    for (let i = 1; i < frames.length; i++) {
      const a = frames[i - 1]!
      const b = frames[i]!
      if (b.st < -1.5 || b.st > 0.6) continue
      const low = b.soleL.y < b.soleR.y ? 'soleL' : 'soleR'
      if (Math.abs(a.soleL.y - a.soleR.y) < 0.02) continue
      slips.push(Math.abs(b[low].z - a[low].z) * 60)
    }
    slips.sort((x, y) => x - y)
    const median = slips[slips.length >> 1]!
    expect(median).toBeLessThan(0.25 * RUN_SPEED)
  })
})

describe('poseToward', () => {
  it('turns a joint from where it is, and lands on pose() at full weight', () => {
    const R = buildHero()
    pose(R, 'kneeL', 0.8, 0, 0)
    const from = R.bones.kneeL!.quaternion.clone()
    poseToward(R, 'kneeL', 0.2, 0, 0, 0.01)
    expect(R.bones.kneeL!.quaternion.angleTo(from)).toBeLessThan(0.01)
    poseToward(R, 'kneeL', 0.2, 0, 0, 1)
    const at = R.bones.kneeL!.quaternion.clone()
    pose(R, 'kneeL', 0.2, 0, 0)
    expect(R.bones.kneeL!.quaternion.angleTo(at)).toBeLessThan(1e-6)
    poseToward(R, 'kneeL', 1.4, 0, 0, 0)
    expect(R.bones.kneeL!.quaternion.angleTo(at)).toBeLessThan(1e-6)
  })
})
