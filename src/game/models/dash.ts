import { poseToward, type Rig } from './kit'

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
  // The crouch hands over to the reach on the reach's own ramp.
  const pre = ramp(a - 0.14, a - 0.02, st) * (1 - ramp(a - 0.02, a + 0.08, st))
  const on = ramp(a - 0.02, a + 0.08, st) * (1 - ramp(b - 0.08, b + 0.04, st))
  const after = st > b ? clamp01((st - b) / 0.32) : 1
  const bounce = st > b && after < 1 ? Math.sin(after * Math.PI) * (1 - after) : 0
  // Each layer turns the joints from where the gait or idle below left them
  // (weighted, not laid on from rest): no joint jumps as a dash starts or
  // ends.
  if (pre > 0) {
    poseToward(R, 'hipL', -0.6, 0, -0.05, pre)
    poseToward(R, 'kneeL', 0.9, 0, 0, pre)
    poseToward(R, 'hipR', -0.4, 0, 0.05, pre)
    poseToward(R, 'kneeR', 0.9, 0, 0, pre)
    poseToward(R, 'chest', 0.25, 0, 0, pre)
  }
  if (on > 0) {
    poseToward(R, 'hipL', -1.2, 0, -0.05, on)
    poseToward(R, 'kneeL', 1.15, 0, 0, on)
    poseToward(R, 'hipR', 0.95, 0, 0.05, on)
    poseToward(R, 'kneeR', 0.25, 0, 0, on)
    poseToward(R, 'chest', 0.42, 0, 0, on)
    poseToward(R, 'shoulderL', 0.95, 0, -0.25, on)
  }
  if (bounce > 0) {
    poseToward(R, 'kneeL', 0.6, 0, 0, bounce)
    poseToward(R, 'kneeR', 0.6, 0, 0, bounce)
  }
  return { drop: 0.16 * pre + 0.3 * on + 0.08 * bounce, lean: 0.12 * pre + 0.34 * on, stretch: 0.14 * on - 0.08 * pre - 0.06 * bounce, on }
}
