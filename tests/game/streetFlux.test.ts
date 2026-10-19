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
import { pose, poseToward, poseAdd } from '@/game/models/kit'
import {
  streetTime, STREET_AT, STREET_DONE, STREET_FROM, STREET_END, SHOW_SLIDE_FROM, SHOW_SLIDE_TO, SHOW_FLEE_FROM, SHOW_FLEE_TO,
  SHOW_TROOP_SHOTS, SHOW_TROOP_FLIGHT
} from '@/game/story/introScript'
import {
  poseStreetFlux, newStreetFlux, RUN_GAIT, RUN_SPEED, RUN_CADENCE, DASH_RUN, settle, kickAt, gazeAt, SHOTS, BLOCKS, GAZE
} from '@/game/story/streetFlux'

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

  it('past full weight it carries on along the arc (a spring overshooting), below 0 back past the start', () => {
    const R = buildHero()
    pose(R, 'kneeL', 0.2, 0, 0)
    poseToward(R, 'kneeL', 0.6, 0, 0, 1.25)
    const over = R.bones.kneeL!.quaternion.clone()
    pose(R, 'kneeL', 0.7, 0, 0)
    expect(R.bones.kneeL!.quaternion.angleTo(over)).toBeLessThan(1e-6)
    pose(R, 'kneeL', 0.2, 0, 0)
    poseToward(R, 'kneeL', 0.6, 0, 0, -0.25)
    const back = R.bones.kneeL!.quaternion.clone()
    pose(R, 'kneeL', 0.1, 0, 0)
    expect(R.bones.kneeL!.quaternion.angleTo(back)).toBeLessThan(1e-6)
  })

  it('poseAdd turns a joint on top of what is there, in its own frame', () => {
    const R = buildHero()
    pose(R, 'head', 0.3, 0, 0)
    poseAdd(R, 'head', 0.1, 0, 0)
    const got = R.bones.head!.quaternion.clone()
    pose(R, 'head', 0.4, 0, 0)
    expect(R.bones.head!.quaternion.angleTo(got)).toBeLessThan(1e-6)
  })
})

describe('Flux on the intro street: an android, not a glide (#183)', () => {
  it('each move settles like a spring: no faster at its start, a little past its mark at the end, then still', () => {
    // At rest at the start (the smoothstep it replaces started flat too)
    expect(settle(1, 1.3, 1)).toBe(0)
    expect(settle(1, 1.3, 1 + 1 / 60)).toBeLessThan(0.08)
    // Crosses its mark at the window's end, swings past, settles
    expect(settle(1, 1.3, 1.3)).toBeCloseTo(1, 2)
    let top = 0
    for (let x = 1; x < 2; x += 0.005) top = Math.max(top, settle(1, 1.3, x))
    expect(top).toBeGreaterThan(1.05)
    expect(top).toBeLessThan(1.15)
    expect(settle(1, 1.3, 3)).toBeCloseTo(1, 3)
  })

  it('a shot kicks and a block shoves in a few frames, past rest and back, and is over within a second', () => {
    expect(kickAt(0)).toBe(0)
    expect(kickAt(-0.1)).toBe(0)
    // Swells: the first frame is a fraction of the peak, never a snap
    expect(kickAt(1 / 60)).toBeLessThan(0.35)
    let top = 0
    let low = 0
    for (let t = 0; t < 1; t += 1 / 240) {
      top = Math.max(top, kickAt(t))
      low = Math.min(low, kickAt(t))
    }
    expect(top).toBeCloseTo(1, 2)
    expect(low).toBeLessThan(-0.05)
    expect(Math.abs(kickAt(1))).toBeLessThan(0.01)
  })

  const posed = (st: number): Record<string, Quaternion> => {
    const R = buildHero()
    const F = new Group()
    F.add(R.root)
    poseStreetFlux(R, F, newMotion(7), st, newStreetFlux())
    const q: Record<string, Quaternion> = {}
    for (const [k, b] of Object.entries(R.bones)) q[k] = b.quaternion.clone()
    return q
  }

  it('every shot kicks the cannon arm; every block shoves the shield arm', () => {
    const turn = (bone: string, a: number, b: number): number => posed(a)[bone]!.angleTo(posed(b)[bone]!)
    for (const [t] of SHOTS) {
      // Still before the shot, moving just after it
      expect(turn('shoulderR', t + 0.05, t + 0.1), `shot at ${t}`).toBeGreaterThan(turn('shoulderR', t - 0.1, t - 0.05) + 0.02)
    }
    // (The Trooper's two shots are met by a guard snapped up just before
    // them: the parry's and the volley's shield is already up and still.)
    for (const [t] of BLOCKS.filter(([t]) => !SHOW_TROOP_SHOTS.some(v => Math.abs(v + SHOW_TROOP_FLIGHT - t) < 1e-9))) {
      expect(turn('shoulderL', t + 0.05, t + 0.1), `block at ${t}`).toBeGreaterThan(turn('shoulderL', t - 0.1, t - 0.05) + 0.015)
    }
  })

  it('his head is a servo on the threats: it leads his turn to the Trooper and looks up at the drones and the drop', () => {
    const g = { yaw: 0, pitch: 0 }
    // Leading the turn (1.6–1.9): turned well into it before the body is halfway
    expect(gazeAt(1.68, g).yaw).toBeGreaterThan(0.35)
    // Drone 1 diving in from above, drone 2 up for its volley, the big drop
    expect(gazeAt(3.8, g).pitch).toBeLessThan(-0.3)
    expect(gazeAt(7.4, g).pitch).toBeLessThan(-0.25)
    expect(gazeAt(13.2, g).pitch).toBeLessThan(-0.25)
    // Continuous: no key jumps it (each is a sprung move from where it was),
    // at a servo's top speed (under 10 rad/s)
    let worst = 0
    let prev = gazeAt(0, { yaw: 0, pitch: 0 })
    for (let st = 0; st < GAZE[GAZE.length - 1]![0] + 2; st += 1 / 120) {
      const now = gazeAt(st, { yaw: 0, pitch: 0 })
      worst = Math.max(worst, Math.hypot(now.yaw - prev.yaw, now.pitch - prev.pitch))
      prev = now
    }
    expect(worst).toBeLessThan(0.08)
  })
})
