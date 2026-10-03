import {
  AdditiveBlending, Color, DoubleSide, Group, Mesh, MeshBasicMaterial, RingGeometry, type BufferGeometry, type Material
} from 'three'
import { rcyl, rcone, rbox, torus, sph, ell, dome, rock, cap, xform, paint, merge } from './kit'
import { toonVC, outlineMat } from './toon'
import { SECTORS } from '../data/regions'
import type { SectorId } from '../world/themes'
import { SECTOR_COLOR } from '../data/signature'

/**
 * ─── The valley diorama ──────────────────────────────────────────────────────
 *
 * Cyber City in miniature (`story-arc.md` § 1 and § 3): a bowl of android
 * city ringing Gauss's cyan lab dome, each sector glowing in its own colour at
 * its `regions.ts` map spot — the Scrapyard crane, the Refinery's three
 * chimneys, the Cryo Plant's white domes, the Volt Tower spire with its coil,
 * the Sky Docks' floating pads and airships — relay beams hopping round the
 * ring, and the Control Spire white on the north-west cliff.
 *
 * Two looks from one build:
 * - SOLID (the intro's shot 1): toon city under neon. `setSignal` rolls the
 *   Red Signal out from the Spire: every lamp the ring passes flips to red.
 * - HOLO (Pip's projection, shot 4): the same shapes as cyan light, five
 *   sectors red, the Fortress inside a red shield, the Scrapyard's relay
 *   blinking cyan (`setHolo`).
 *
 * Every glowing part belongs to a LAMP: a group with its own material, a base
 * colour and its distance from the Spire, which is what the ring reads.
 */

/** Sector colours as the story's palette gives them (§ 3: a sector's own
 *  colour means it is free). */
export const SECTOR_GLOW: Record<Exclude<SectorId, 'fortress'>, string> = (({ fortress: _, ...free }) => free)(SECTOR_COLOR)
const LAB_CYAN = '#4fd8ff'
const SPIRE_WHITE = '#f4f7ff'
const VEX_RED = '#ff2d3f'

/** The diorama's radius (m): the city ring's outer edge. */
export const DIORAMA_R = 14

interface Lamp {
  mat: MeshBasicMaterial
  base: Color
  /** Distance from the Spire (m). */
  dist: number
  /** The sector it lights, if any. */
  sector: SectorId | 'lab' | 'spire' | 'relay'
}

export interface Diorama {
  root: Group
  /** Where things stand (diorama space, before `root`'s transform). */
  spire: { x: number; y: number; z: number }
  /** The Spire's tip (for Vex's hologram and bubble). */
  spireTip: { x: number; y: number; z: number }
  scrapyard: { x: number; y: number; z: number }
  /** Solid look: the Red Signal. `reach` 0..1 of the ring's roll; `flash`
   *  0..1 the Spire tip's red flash. */
  setSignal(reach: number, flash: number): void
  /** The ending (#102): from a fully red valley, a WHITE ring rolls out from
   *  the Spire and every lamp it passes comes home to its own colour; the
   *  Spire burns white. `k` 0..1 of the roll. */
  setFreed(k: number): void
  /** Idle motion: the coil turns, airships drift, beams hop (s). */
  animate(t: number): void
  /** Holo look: `scrapBlink` 0..1 (the Scrapyard relay pulses cyan). */
  setHolo(t: number, scrapBlink: number): void
  /** The farthest a lamp stands from the Spire (m): the ring's full reach. */
  reach: number
  /** A sector's place in the valley (diorama space, on the ground): where a camera looks. */
  sectorPos(id: SectorId): { x: number; y: number; z: number }
  /**
   * The story so far (the debrief, #119): every freed sector glows the one
   * cleared blue (CLEARED_BLUE: "safe" at a glance, a playtest ask), the next
   * target pulses in Vex's red, the rest stay a dim red; `hot` (the one just
   * freed) flares white and settles into the blue. `t` in s.
   */
  setProgress(freed: ReadonlySet<SectorId>, hot: SectorId | null, next: SectorId | null, t: number): void
}

/** A freed sector in the debrief's valley: cleared, safe. */
export const CLEARED_BLUE = '#3aa8ff'

const at = (mx: number, my: number): [number, number] => [(mx - 0.5) * 2 * DIORAMA_R * 0.85, (my - 0.5) * 2 * DIORAMA_R * 0.85]

/** A tiny seeded RNG (the city is the same every time). */
const lcg = (seed: number) => {
  let s = seed >>> 0 || 1
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296)
}

export const buildDiorama = (opts: { holo?: boolean; low?: boolean } = {}): Diorama => {
  const holo = !!opts.holo
  // `low` (budget phones, `engine/quality.ts`): under half the city's towers
  // and fewer hills; the landmarks and the relay ring all stay.
  const low = !!opts.low
  const root = new Group()
  const toon: BufferGeometry[] = []
  const lampGeos = new Map<string, { geos: BufferGeometry[]; color: string; sector: Lamp['sector']; cx: number; cz: number; n: number }>()
  const lamp = (key: string, color: string, sector: Lamp['sector'], g: BufferGeometry, x: number, z: number): void => {
    let e = lampGeos.get(key)
    if (!e) lampGeos.set(key, (e = { geos: [], color, sector, cx: 0, cz: 0, n: 0 }))
    e.geos.push(paint(g, '#ffffff'))
    e.cx += x
    e.cz += z
    e.n++
  }

  const pos: Record<SectorId, [number, number]> = {} as Record<SectorId, [number, number]>
  for (const s of SECTORS) pos[s.id] = at(s.mapPos[0], s.mapPos[1])
  const [sx, sz] = pos.fortress
  const cliffH = 2.4
  const spire = { x: sx, y: cliffH, z: sz }
  const spireTip = { x: sx, y: cliffH + 5.2, z: sz }

  // ── Ground: the valley floor, the rim of hills, the Spire's cliff ──
  toon.push(xform(paint(rcyl(DIORAMA_R * 1.3, 0.5, 0.2, 48), '#1b2347'), [0, -0.25, 0]))
  const rr = lcg(99)
  const hills = low ? 12 : 22
  for (let k = 0; k < hills; k++) {
    const a = (k / hills) * Math.PI * 2 + rr() * 0.2
    const r = DIORAMA_R * (1.18 + rr() * 0.12)
    // Low hills to the south (the camera's side), higher to the north.
    const north = Math.max(0, -Math.sin(a))
    toon.push(xform(paint(rock((1.4 + rr() * 1.2) * (22 / hills), k + 3), '#3a4172'), [Math.cos(a) * r, 0.2, Math.sin(a) * r], [0, rr() * 3, 0], [1.3, 0.35 + north * 0.9 + rr() * 0.3, 1.3]))
  }
  toon.push(xform(paint(rock(3.2, 7), '#2f3560'), [sx, cliffH * 0.4, sz], [0, 0.4, 0], [1, 0.9, 1]))
  toon.push(xform(paint(rcyl(1.6, 0.4, 0.1, 20), '#3b4458'), [sx, cliffH, sz]))

  // ── The lab dome in the middle ──
  toon.push(xform(paint(rcyl(1.9, 0.3, 0.1, 28), '#3b4458'), [0, 0.15, 0]))
  lamp('lab', LAB_CYAN, 'lab', xform(dome(1.5, Math.PI / 2, 22, 10), [0, 0.3, 0]), 0, 0)
  lamp('lab', LAB_CYAN, 'lab', xform(torus(1.9, 0.07, 6, 32), [0, 0.32, 0], [Math.PI / 2, 0, 0]), 0, 0)

  // ── The Control Spire: white and calm (its tip is its own lamp) ──
  toon.push(xform(paint(rcone(0.9, 0.25, 4.6, 0.08, 14), SPIRE_WHITE), [sx, cliffH + 2.3, sz]))
  toon.push(xform(paint(rbox(1.4, 0.5, 1.4, 0.3), '#c3cad4'), [sx, cliffH + 0.45, sz]))
  lamp('spire', SPIRE_WHITE, 'spire', xform(sph(0.3, 12, 8), [sx, spireTip.y, sz]), sx, sz)
  lamp('spire', SPIRE_WHITE, 'spire', xform(torus(0.55, 0.05, 6, 20), [sx, cliffH + 3.4, sz], [Math.PI / 2, 0, 0]), sx, sz)

  // ── The landmarks ──
  const moving: { coil: Group | null; ships: Group[] } = { coil: null, ships: [] }
  {
    // Scrapyard: a yellow crane over junk heaps.
    const [x, z] = pos.scrapyard
    const c = SECTOR_GLOW.scrapyard
    toon.push(xform(paint(rbox(0.35, 3.2, 0.35, 0.2), '#c9a227'), [x, 1.6, z]))
    toon.push(xform(paint(rbox(3.2, 0.25, 0.3, 0.2), '#c9a227'), [x + 1.1, 3.2, z], [0, 0, 0.08]))
    toon.push(xform(paint(cap(0.03, 1.1), '#9aa7bd'), [x + 2.4, 2.5, z]))
    for (let k = 0; k < 3; k++) toon.push(xform(paint(rock(0.7, k + 11), '#5d5a52'), [x - 0.8 + k * 0.9, 0.2, z + 0.9 - k * 0.3], [0, k, 0], [1, 0.5, 1]))
    lamp('scrapyard', c, 'scrapyard', xform(sph(0.14, 8, 6), [x + 2.6, 3.25, z]), x, z)
    lamp('scrapyard', c, 'scrapyard', xform(sph(0.18, 8, 6), [x, 3.45, z]), x, z)
    lamp('scrapyard', c, 'scrapyard', xform(torus(0.9, 0.05, 6, 20), [x, 0.08, z], [Math.PI / 2, 0, 0]), x, z)
  }
  {
    // The Refinery: three chimneys with flame tips.
    const [x, z] = pos.blaze
    const c = SECTOR_GLOW.blaze
    for (let k = 0; k < 3; k++) {
      const cx = x - 0.9 + k * 0.9
      const h = 2.4 + (k === 1 ? 0.8 : 0)
      toon.push(xform(paint(rcyl(0.3, h, 0.06, 14), '#6b4a3a'), [cx, h / 2, z]))
      toon.push(xform(paint(torus(0.3, 0.05, 6, 14), '#3b2a22'), [cx, h * 0.7, z], [Math.PI / 2, 0, 0]))
      lamp('blaze', c, 'blaze', xform(rcone(0.22, 0.01, 0.6, 0.02, 10), [cx, h + 0.3, z]), x, z)
    }
    toon.push(xform(paint(rbox(3, 0.9, 1.4, 0.2), '#4a3b36'), [x, 0.45, z + 0.9]))
    lamp('blaze', c, 'blaze', xform(rbox(2.6, 0.12, 0.05, 0.3), [x, 0.75, z + 1.62]), x, z)
  }
  {
    // The Cryo Plant: white domes, ice-blue rings.
    const [x, z] = pos.cryo
    const c = SECTOR_GLOW.cryo
    const domes: Array<[number, number, number]> = [[0, 0, 1.3], [1.5, 0.6, 0.9], [-1.3, 0.7, 0.8]]
    for (const [dx, dz, r] of domes) {
      toon.push(xform(paint(dome(r, Math.PI / 2, 18, 8), '#eef6ff'), [x + dx, 0, z + dz]))
      lamp('cryo', c, 'cryo', xform(torus(r, 0.05, 6, 22), [x + dx, 0.06, z + dz], [Math.PI / 2, 0, 0]), x, z)
      lamp('cryo', c, 'cryo', xform(sph(0.1, 8, 6), [x + dx, r + 0.05, z + dz]), x, z)
    }
  }
  const coilAt: [number, number, number] = [0, 0, 0]
  {
    // The Volt Tower: a spire with a turning coil.
    const [x, z] = pos.volt
    const c = SECTOR_GLOW.volt
    toon.push(xform(paint(rcone(0.8, 0.12, 5.2, 0.06, 12), '#6a7090'), [x, 2.6, z]))
    toon.push(xform(paint(rbox(1.8, 0.6, 1.8, 0.3), '#4a4f6a'), [x, 0.3, z]))
    lamp('volt', c, 'volt', xform(sph(0.2, 10, 8), [x, 5.3, z]), x, z)
    lamp('volt', c, 'volt', xform(rbox(0.08, 3.6, 0.08, 0.3), [x + 0.3, 2.4, z + 0.3]), x, z)
    coilAt[0] = x
    coilAt[1] = 3.6
    coilAt[2] = z
  }
  {
    // The Sky Docks: floating pads and two small airships.
    const [x, z] = pos.gale
    const c = SECTOR_GLOW.gale
    const pads: Array<[number, number, number]> = [[0, 2.2, 0], [1.6, 3.0, 0.5], [-1.5, 2.6, -0.4]]
    for (const [dx, h, dz] of pads) {
      toon.push(xform(paint(rcyl(0.8, 0.2, 0.08, 18), '#c3cad4'), [x + dx, h, z + dz]))
      toon.push(xform(paint(rcone(0.5, 0.05, 0.7, 0.04, 10), '#9aa7bd'), [x + dx, h - 0.45, z + dz], [Math.PI, 0, 0]))
      lamp('gale', c, 'gale', xform(torus(0.8, 0.04, 6, 20), [x + dx, h + 0.1, z + dz], [Math.PI / 2, 0, 0]), x, z)
    }
  }

  {
    // Polarity Works: a giant horseshoe magnet over the foundry, its poles
    // lit red and blue.
    const [x, z] = pos.magnet
    const c = SECTOR_GLOW.magnet
    toon.push(xform(paint(rbox(2.4, 0.8, 1.6, 0.2), '#5a6072'), [x, 0.4, z]))
    toon.push(xform(paint(torus(0.85, 0.26, 10, 22, Math.PI), '#c23a4a'), [x, 2.6, z]))
    for (const s of [-1, 1]) {
      toon.push(xform(paint(rcyl(0.26, 1.2, 0.04, 12), '#c23a4a'), [x + s * 0.85, 2.0, z]))
      lamp('magnet', s < 0 ? c : '#5a8cff', 'magnet', xform(rcyl(0.27, 0.32, 0.04, 12), [x + s * 0.85, 1.3, z]), x, z)
    }
    lamp('magnet', c, 'magnet', xform(torus(1.0, 0.05, 6, 22), [x, 0.82, z], [Math.PI / 2, 0, 0]), x, z)
  }

  {
    // The Deep Mine: a headframe over the shaft, its wheel lit, a giant
    // drill bit planted beside it.
    const [x, z] = pos.drill
    const c = SECTOR_GLOW.drill
    for (const s of [-1, 1]) {
      toon.push(xform(paint(rbox(0.16, 3.2, 0.16, 0.2), '#6b5a4a'), [x + s * 0.55, 1.6, z], [0, 0, -s * 0.12]))
    }
    toon.push(xform(paint(rbox(1.5, 0.16, 0.2, 0.2), '#6b5a4a'), [x, 3.1, z]))
    lamp('drill', c, 'drill', xform(torus(0.42, 0.06, 6, 20), [x, 3.35, z]), x, z)
    toon.push(xform(paint(rcone(0.55, 0.05, 1.8, 0.04, 12), '#c9a227'), [x + 1.4, 0.9, z + 0.6], [Math.PI, 0, 0.2]))
    toon.push(xform(paint(rbox(2.0, 0.5, 1.4, 0.2), '#4a3d32'), [x, 0.25, z]))
    lamp('drill', c, 'drill', xform(rbox(1.6, 0.1, 0.05, 0.3), [x, 0.45, z + 0.72]), x, z)
  }

  {
    // The Tidewater Locks: a striped lighthouse by a lock gate.
    const [x, z] = pos.tide
    const c = SECTOR_GLOW.tide
    toon.push(xform(paint(rcone(0.6, 0.35, 3.0, 0.06, 14), '#f4f7ff'), [x, 1.5, z]))
    for (const h of [0.8, 1.8]) toon.push(xform(paint(rcyl(0.53 - h * 0.07, 0.35, 0.03, 14), '#ff5a3a'), [x, h, z]))
    lamp('tide', c, 'tide', xform(sph(0.3, 10, 8), [x, 3.25, z]), x, z)
    toon.push(xform(paint(rcone(0.38, 0.05, 0.45, 0.04, 12), '#3a4a5a'), [x, 3.7, z]))
    toon.push(xform(paint(rbox(2.4, 1.0, 0.3, 0.2), '#2f7f8f'), [x + 1.2, 0.5, z + 1.1]))
    lamp('tide', c, 'tide', xform(rbox(2.2, 0.08, 0.06, 0.3), [x + 1.2, 0.95, z + 1.27]), x, z)
  }

  {
    // Blackout Boulevard: a dark tower ringed in neon, a billboard beside it.
    const [x, z] = pos.neon
    const c = SECTOR_GLOW.neon
    toon.push(xform(paint(rbox(1.2, 3.6, 1.2, 0.2), '#2a2a3a'), [x, 1.8, z]))
    for (const h of [1.0, 2.0, 3.0]) lamp('neon', h === 2.0 ? '#3ff4ff' : c, 'neon', xform(rbox(1.3, 0.08, 1.3, 0.3), [x, h, z]), x, z)
    toon.push(xform(paint(rbox(0.1, 1.6, 0.1, 0.3), '#2a2a3a'), [x + 1.3, 0.8, z + 0.5]))
    lamp('neon', c, 'neon', xform(rbox(1.4, 0.8, 0.08, 0.2), [x + 1.3, 1.9, z + 0.5]), x, z)
  }

  {
    // The Rotor Run: a control tower with a quadcopter parked on its top.
    const [x, z] = pos.rotor
    const c = SECTOR_GLOW.rotor
    toon.push(xform(paint(rcyl(0.45, 3.0, 0.06, 12), '#c8ccd6'), [x, 1.5, z]))
    toon.push(xform(paint(rcyl(1.1, 0.25, 0.06, 18), '#ff8a2a'), [x, 3.1, z]))
    toon.push(xform(paint(rbox(0.9, 0.18, 0.9, 0.3), '#5a6478'), [x, 3.35, z]))
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      lamp('rotor', c, 'rotor', xform(torus(0.28, 0.04, 6, 16), [x + sx * 0.6, 3.4, z + sz * 0.6], [Math.PI / 2, 0, 0]), x, z)
    }
    lamp('rotor', c, 'rotor', xform(torus(1.1, 0.04, 6, 24), [x, 3.24, z], [Math.PI / 2, 0, 0]), x, z)
  }

  // ── The city: towers in the ring, each with a neon band on its nearest
  //    sector's lamp ──
  const avoid: Array<[number, number, number]> = [[0, 0, 2.6], [sx, sz, 3.2]]
  for (const s of SECTORS) if (s.id !== 'fortress') avoid.push([pos[s.id][0], pos[s.id][1], 2.4])
  const cr = lcg(1234)
  let placed = 0
  for (let tries = 0; tries < 600 && placed < (low ? 48 : 110); tries++) {
    const a = cr() * Math.PI * 2
    const r = 3 + cr() * (DIORAMA_R - 3.5)
    const x = Math.cos(a) * r
    const z = Math.sin(a) * r
    if (avoid.some(([ax, az, ar]) => (x - ax) ** 2 + (z - az) ** 2 < ar * ar)) continue
    placed++
    const h = 0.4 + cr() * cr() * 2.4
    const w = 0.3 + cr() * 0.4
    toon.push(xform(paint(rbox(w, h, w, 0.25), cr() < 0.5 ? '#2c3566' : '#3a3f6e'), [x, h / 2, z], [0, cr() * 3, 0]))
    // Nearest sector (its colour; the wave reads its distance)
    let best: SectorId = 'scrapyard'
    let bd = Infinity
    for (const s of SECTORS) {
      if (s.id === 'fortress') continue
      const d = (pos[s.id][0] - x) ** 2 + (pos[s.id][1] - z) ** 2
      if (d < bd) { bd = d; best = s.id }
    }
    const col = SECTOR_GLOW[best as Exclude<SectorId, 'fortress'>]
    // Split each sector's windows by distance, so the wave crosses a sector.
    const band = Math.floor(Math.hypot(x - sx, z - sz) / 4)
    lamp(`city-${best}-${band}`, col, best, xform(rbox(w * 1.08, 0.12, w * 1.08, 0.2), [x, h * (0.55 + cr() * 0.3), z]), x, z)
    if (h > 0.9) lamp(`city-${best}-${band}`, col, best, xform(rbox(w * 1.08, 0.08, w * 1.08, 0.2), [x, h * 0.3, z]), x, z)
    if (h > 1.4) lamp(`city-${best}-${band}`, col, best, xform(sph(0.06, 6, 4), [x, h + 0.06, z]), x, z)
  }

  // ── The relay ring: a pylon by each sector, beams hopping between them ──
  const relays = SECTORS.map(s => {
    const [x, z] = pos[s.id]
    const a = Math.atan2(z, x)
    const r = Math.hypot(x, z) * 0.62
    return { id: s.id, x: Math.cos(a) * r, z: Math.sin(a) * r }
  })
  relays.forEach((p, i) => {
    toon.push(xform(paint(rcyl(0.12, 1.3, 0.04, 8), '#9aa7bd'), [p.x, 0.65, p.z]))
    const c = p.id === 'fortress' ? SPIRE_WHITE : SECTOR_GLOW[p.id as Exclude<SectorId, 'fortress'>]
    lamp(`relay-${p.id}`, c, p.id === 'fortress' ? 'spire' : p.id, xform(sph(0.16, 8, 6), [p.x, 1.4, p.z]), p.x, p.z)
    const q = relays[(i + 1) % relays.length]!
    const len = Math.hypot(q.x - p.x, q.z - p.z)
    const mx = (p.x + q.x) / 2
    const mz = (p.z + q.z) / 2
    const yaw = Math.atan2(q.x - p.x, q.z - p.z)
    lamp(`beam-${i}`, LAB_CYAN, 'relay', xform(cap(0.03, len), [mx, 1.4, mz], [Math.PI / 2, yaw, 0]), mx, mz)
  })

  // ── Beyond the rim (solid look only): the rest of Cyber City ──
  // The bowl is only the valley's heart. Past its hills the city goes on —
  // skyscrapers climbing taller the farther they stand, between rolling
  // hills — up to a ring of mountains the fog turns to silhouettes. Without
  // it the aerial shot sees the diorama floating in bare sky. Kept low on
  // the south (the camera's side) so nothing stands in the shot.
  const outerGlow: BufferGeometry[] = []
  if (!holo) {
    const or = lcg(4242)
    const OUTER = 95
    toon.push(xform(paint(rcyl(OUTER, 0.5, 0.2, 48), '#171d3c'), [0, -0.35, 0]))
    // Rolling hills between the rim and the towers, and mountains behind.
    const outerHills = low ? 10 : 18
    for (let k = 0; k < outerHills; k++) {
      const a = (k / outerHills) * Math.PI * 2 + or() * 0.3
      const r = DIORAMA_R * 1.55 + or() * 10
      const south = Math.max(0, Math.sin(a))
      const s = (3 + or() * 3) * (1 - 0.5 * south)
      toon.push(xform(paint(rock(s, k + 40), '#2c3263'), [Math.cos(a) * r, -0.3, Math.sin(a) * r], [0, or() * 3, 0], [1.6, 0.2 + (1 - south) * 0.45 + or() * 0.15, 1.6]))
    }
    const peaks = low ? 9 : 16
    for (let k = 0; k < peaks; k++) {
      const a = (k / peaks) * Math.PI * 2 + or() * 0.25
      const r = 68 + or() * 16
      const s = 12 + or() * 8
      toon.push(xform(paint(rock(s, k + 70, 8, 6), '#262b55'), [Math.cos(a) * r, 0, Math.sin(a) * r], [0, or() * 3, 0], [1.5, 0.9 + or() * 0.8, 1.2]))
    }
    // The skyscrapers: stepped, round and needle towers with window bands.
    const WIN = ['#ffd98a', '#7fe8ff', '#ff7ad8', '#b8a6ff']
    const want = low ? 30 : 70
    let built = 0
    for (let tries = 0; tries < 400 && built < want; tries++) {
      const a = or() * Math.PI * 2
      const r = DIORAMA_R * 1.45 + Math.pow(or(), 0.8) * 42
      const x = Math.cos(a) * r
      const z = Math.sin(a) * r
      // The camera's corridor: it flies in from the south, over +z.
      if (z > 0 && Math.abs(x) < 16) continue
      const south = Math.max(0, Math.sin(a))
      const far = (r - DIORAMA_R * 1.45) / 42
      const h = (2 + far * 8 + or() * or() * 6) * (1 - 0.75 * south)
      const w = 0.9 + or() * 1.1
      const wall = or() < 0.5 ? '#2a3162' : '#353a6b'
      const win = WIN[Math.floor(or() * WIN.length)]!
      const kind = or()
      built++
      if (kind < 0.45) {
        // Stepped: a slab with a narrower block on top.
        toon.push(xform(paint(rbox(w, h * 0.7, w, 0.15, 8, 6), wall), [x, h * 0.35, z], [0, a, 0]))
        toon.push(xform(paint(rbox(w * 0.65, h * 0.3, w * 0.65, 0.2, 8, 6), wall), [x, h * 0.85, z], [0, a, 0]))
      } else if (kind < 0.8) {
        toon.push(xform(paint(rcyl(w * 0.55, h, 0.1, 10, 1), wall), [x, h / 2, z]))
      } else {
        toon.push(xform(paint(rcone(w * 0.6, w * 0.12, h * 1.25, 0.05, 8), wall), [x, h * 0.625, z]))
      }
      const bands = Math.max(1, Math.floor(h / 2.2))
      for (let b = 0; b < bands; b++) {
        const y = h * (0.2 + 0.6 * (b + 0.5) / bands)
        const bw = kind < 0.8 ? w * (kind < 0.45 ? 1.04 : 1.12) : w * 0.9 * (1 - y / (h * 1.25))
        outerGlow.push(paint(xform(kind < 0.45 ? rbox(bw, 0.18, bw, 0.15, 8, 4) : rcyl(bw * 0.5, 0.18, 0.02, 10, 1), [x, y, z], [0, a, 0]), win))
      }
      if (h > 7) outerGlow.push(paint(xform(sph(0.25, 6, 4), [x, (kind >= 0.8 ? h * 1.25 : h) + 0.2, z]), SPIRE_WHITE))
    }
  }

  // ── Assemble ──
  const toonGeo = merge(toon)
  let holoMat: MeshBasicMaterial | null = null
  if (holo) {
    holoMat = new MeshBasicMaterial({
      color: new Color(LAB_CYAN), transparent: true, opacity: 0.22, blending: AdditiveBlending, depthWrite: false, toneMapped: false
    })
    root.add(new Mesh(toonGeo, holoMat))
  } else {
    root.add(new Mesh(toonGeo, toonVC()))
    const ol = new Mesh(toonGeo, outlineMat(0.04))
    ol.renderOrder = -1
    root.add(ol)
  }
  const lamps: Lamp[] = []
  for (const [, e] of lampGeos) {
    const mat = new MeshBasicMaterial({ color: new Color(e.color), toneMapped: false })
    if (holo) {
      mat.transparent = true
      mat.blending = AdditiveBlending
      mat.depthWrite = false
    }
    root.add(new Mesh(merge(e.geos), mat))
    const cx = e.cx / e.n
    const cz = e.cz / e.n
    lamps.push({ mat, base: new Color(e.color), dist: Math.hypot(cx - sx, cz - sz), sector: e.sector })
  }
  const reach = Math.max(...lamps.map(l => l.dist)) + 1
  // The outer city's windows: one mesh, not a lamp (the ring's reach stays
  // the bowl's); they redden once the ring has rolled over the bowl.
  const outerMat = new MeshBasicMaterial({ vertexColors: true, toneMapped: false })
  outerMat.userData.own = true
  if (outerGlow.length) root.add(new Mesh(merge(outerGlow), outerMat))

  // The turning coil and the drifting airships (both lamps of their own).
  const voltMat = new MeshBasicMaterial({ color: new Color(SECTOR_GLOW.volt), toneMapped: false })
  const coil = new Group()
  for (let k = 0; k < 3; k++) {
    const m = new Mesh(torus(0.55 - k * 0.1, 0.05, 6, 18), voltMat)
    m.position.y = k * 0.45
    m.rotation.x = Math.PI / 2 + (k - 1) * 0.3
    coil.add(m)
  }
  coil.position.set(coilAt[0], coilAt[1], coilAt[2])
  root.add(coil)
  moving.coil = coil
  lamps.push({ mat: voltMat, base: new Color(SECTOR_GLOW.volt), dist: Math.hypot(coilAt[0] - sx, coilAt[2] - sz), sector: 'volt' })
  const shipMat = new MeshBasicMaterial({ color: new Color(SECTOR_GLOW.gale), toneMapped: false })
  for (let k = 0; k < 2; k++) {
    const ship = new Group()
    const hull = new Mesh(paint(ell(0.9, 0.35, 0.35, 14, 8), '#c3cad4'), holo ? holoMat! : toonVC())
    const stripe = new Mesh(ell(0.92, 0.08, 0.37, 14, 6), shipMat)
    const gond = new Mesh(paint(rbox(0.4, 0.15, 0.2, 0.3), '#5d6a82'), holo ? holoMat! : toonVC())
    gond.position.y = -0.38
    ship.add(hull, stripe, gond)
    ship.userData.base = [pos.gale[0] + (k ? 1.8 : -1.2), 4.2 + k * 0.7, pos.gale[1] + (k ? -1.2 : 1.4)]
    root.add(ship)
    moving.ships.push(ship)
  }
  lamps.push({ mat: shipMat, base: new Color(SECTOR_GLOW.gale), dist: Math.hypot(pos.gale[0] - sx, pos.gale[1] - sz), sector: 'gale' })

  // The Red Signal's shock-ring (solid) / the Fortress shield (holo).
  const ringMat = new MeshBasicMaterial({
    color: new Color(VEX_RED), transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false
  })
  const ring = new Mesh(new RingGeometry(0.86, 1, 64, 1), ringMat)
  ring.rotation.x = -Math.PI / 2
  ring.position.set(sx, 0.35, sz)
  ring.visible = false
  root.add(ring)
  const shieldMat = new MeshBasicMaterial({
    color: new Color(VEX_RED), transparent: true, opacity: 0.35, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false
  })
  const shield = new Mesh(dome(3.4, Math.PI / 2, 24, 10), shieldMat)
  shield.position.set(sx, cliffH - 0.2, sz)
  shield.visible = holo
  root.add(shield)
  // Beam pulses hopping round the ring.
  const hopMat = new MeshBasicMaterial({ color: new Color('#e8fbff'), toneMapped: false })
  const hops = [0, 1, 2].map(() => {
    const m = new Mesh(sph(0.2, 8, 6), hopMat)
    root.add(m)
    return m
  })

  const red = new Color(VEX_RED)
  const blue = new Color(CLEARED_BLUE)
  const tmp = new Color()
  let signalOn = 0

  return {
    root,
    spire,
    spireTip,
    scrapyard: { x: pos.scrapyard[0], y: 0, z: pos.scrapyard[1] },
    reach,
    sectorPos: (id) => ({ x: pos[id][0], y: id === 'fortress' ? cliffH : 0, z: pos[id][1] }),
    setProgress: (freed, hot, next, t) => {
      signalOn = 0
      ring.visible = false
      hopMat.color.set('#e8fbff')
      outerMat.color.set('#ffffff')
      for (const l of lamps) {
        if (l.sector === 'lab') { l.mat.color.copy(l.base); continue }
        // The Spire is Vex's until the end.
        if (l.sector === 'spire' || l.sector === 'relay') { l.mat.color.copy(red); continue }
        if (l.sector === hot) l.mat.color.copy(blue).lerp(tmp.set('#ffffff'), 0.5 + 0.5 * Math.sin(t * 9))
        else if (freed.has(l.sector)) l.mat.color.copy(blue)
        else if (l.sector === next) l.mat.color.copy(red).multiplyScalar(0.75 + 0.45 * (0.5 + 0.5 * Math.sin(t * 5)))
        else l.mat.color.copy(red).multiplyScalar(0.4)
      }
    },
    setSignal: (k, flash) => {
      signalOn = k
      const front = k * reach
      for (const l of lamps) {
        if (l.sector === 'lab') continue
        if (l.sector === 'spire') {
          l.mat.color.copy(l.base).lerp(red, Math.max(flash, k > 0 ? 1 : 0))
          continue
        }
        // Flips as the ring's front passes, with a short flicker.
        const past = front - l.dist
        const f = past <= 0 ? 0 : past > 1.2 ? 1 : (Math.sin(past * 40) > 0 ? 1 : 0.3)
        l.mat.color.copy(l.base).lerp(red, f)
      }
      ring.visible = k > 0 && k < 1
      ring.scale.setScalar(Math.max(0.01, front))
      ringMat.opacity = 0.9 * (1 - k * 0.6)
      hopMat.color.copy(tmp.set('#e8fbff')).lerp(red, k > 0.15 ? 1 : 0)
      outerMat.color.set('#ffffff').lerp(red, Math.min(1, Math.max(0, (k - 0.6) / 0.4)) * 0.85)
    },
    setFreed: (k) => {
      signalOn = 0
      const front = k * reach
      for (const l of lamps) {
        if (l.sector === 'lab') continue
        if (l.sector === 'spire') {
          l.mat.color.copy(red).lerp(tmp.set(SPIRE_WHITE), Math.min(1, k * 4))
          continue
        }
        // Back to its own colour as the white front passes, with a flicker.
        const past = front - l.dist
        const f = past <= 0 ? 0 : past > 1.2 ? 1 : (Math.sin(past * 40) > 0 ? 1 : 0.3)
        l.mat.color.copy(red).lerp(l.base, f)
      }
      ring.visible = k > 0 && k < 1
      ring.scale.setScalar(Math.max(0.01, front))
      ringMat.color.set('#ffffff')
      ringMat.opacity = 0.9 * (1 - k * 0.6)
      hopMat.color.set('#e8fbff')
      outerMat.color.set('#ffffff')
    },
    animate: (t) => {
      if (moving.coil) moving.coil.rotation.y = t * 2.2
      moving.ships.forEach((s, i) => {
        const b = s.userData.base as [number, number, number]
        s.position.set(b[0] + Math.sin(t * 0.4 + i * 2) * 0.8, b[1] + Math.sin(t * 1.1 + i) * 0.15, b[2] + Math.cos(t * 0.4 + i * 2) * 0.5)
        s.rotation.y = t * 0.2 + i * 2
      })
      // Hops: each pulse runs one relay-to-relay leg, then the next.
      hops.forEach((m, i) => {
        const u = t * 1.4 + i * (relays.length / hops.length)
        const leg = Math.floor(u) % relays.length
        const f = u - Math.floor(u)
        const p = relays[leg]!
        const q = relays[(leg + 1) % relays.length]!
        m.position.set(p.x + (q.x - p.x) * f, 1.4 + Math.sin(f * Math.PI) * 0.5, p.z + (q.z - p.z) * f)
        m.visible = signalOn < 0.3
      })
    },
    setHolo: (t, scrapBlink) => {
      for (const l of lamps) {
        if (l.sector === 'lab') l.mat.color.copy(l.base)
        else if (l.sector === 'scrapyard') {
          l.mat.color.copy(red).lerp(tmp.set(LAB_CYAN), scrapBlink * (0.6 + 0.4 * Math.sin(t * 14)))
        } else l.mat.color.copy(red).multiplyScalar(0.8)
      }
      shieldMat.opacity = 0.28 + Math.sin(t * 5) * 0.06
      if (holoMat) holoMat.opacity = 0.2 + Math.sin(t * 23) * 0.02
      for (const m of hops) m.visible = false
    }
  }
}

/** Dispose the diorama's geometries and materials. */
export const disposeDiorama = (d: Diorama): void => {
  d.root.traverse((o) => {
    const m = o as Mesh
    if (m.geometry) m.geometry.dispose()
    const mat = m.material as Material | Material[] | undefined
    if (mat && !Array.isArray(mat) && mat instanceof MeshBasicMaterial && (mat.vertexColors === false || mat.userData.own)) mat.dispose()
  })
}
