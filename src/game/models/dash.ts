import { pose, type Rig } from './kit'

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)
const ramp = (a: number, b: number, x: number): number => {
  const k = clamp01((x - a) / (b - a))
  return k * k * (3 - 2 * k)
}

/**
 * A Mega Man X dash on any clock — the intro's street, the slide lesson's hologram (#272: the slide looked like lego,
 * every joint on one 0.12 s ramp): a crouch just before `a`, then low and
 * leaning in, the front leg reaching, the back leg trailing straight, the
 * arms swept back, stretched along the run; at `b` a settle with a small
 * bounce. Writes the rig's joints; returns what the root does (`drop` m down,
 * `lean` rad forward, `stretch` along the run) and how far into the dash it
 * is (`on`, 0..1).
 */
export const dashPose = (R: Rig, st: number, a: number, b: number): { drop: number; lean: number; stretch: number; on: number } => {
  const pre = ramp(a - 0.14, a - 0.02, st) * (1 - ramp(a - 0.02, a + 0.06, st))
  const on = ramp(a - 0.02, a + 0.08, st) * (1 - ramp(b - 0.08, b + 0.04, st))
  const after = st > b ? clamp01((st - b) / 0.32) : 1
  const bounce = st > b && after < 1 ? Math.sin(after * Math.PI) * (1 - after) : 0
  if (pre > 0) {
    pose(R, 'hipL', -0.6 * pre, 0, -0.05)
    pose(R, 'kneeL', 0.9 * pre, 0, 0)
    pose(R, 'hipR', -0.4 * pre, 0, 0.05)
    pose(R, 'kneeR', 0.9 * pre, 0, 0)
    pose(R, 'chest', 0.25 * pre, 0, 0)
  }
  if (on > 0) {
    pose(R, 'hipL', -1.2 * on, 0, -0.05)
    pose(R, 'kneeL', 1.15 * on, 0, 0)
    pose(R, 'hipR', 0.95 * on, 0, 0.05)
    pose(R, 'kneeR', 0.25 * on, 0, 0)
    pose(R, 'chest', 0.42 * on, 0, 0)
    pose(R, 'shoulderL', 0.95 * on, 0, -0.25 * on)
  }
  if (bounce > 0) {
    pose(R, 'kneeL', 0.6 * bounce, 0, 0)
    pose(R, 'kneeR', 0.6 * bounce, 0, 0)
  }
  return { drop: 0.16 * pre + 0.3 * on + 0.08 * bounce, lean: 0.12 * pre + 0.34 * on, stretch: 0.14 * on - 0.08 * pre - 0.06 * bounce, on }
}
