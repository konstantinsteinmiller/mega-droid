// @vitest-environment jsdom
// The puzzle placement rule, for every wall thing the player must see or
// shoot — a magnet rail's polarity panel, a neon switch, a sluice valve and a
// secret's buttons and hint panel: it hangs on a bare wall. A Polarity Works
// pipe (the level mesh's own wall dressing, blue in that sector) ran right
// across a polarity panel (playtest 2026-10-08), as a Sky Docks pipe once hid
// a blue button: the mesh kept only the secrets' faces bare. Now one list
// (`wallThingFaces`) keeps them all clear of the pipes, light strips and
// props; this pins the plan over every stage and seed, and the BUILT mesh —
// no triangle of the level's dressing in front of any of them.

import { describe, expect, it, vi } from 'vitest'

vi.mock('@/game/world/textures', async (orig) => {
  const { Texture } = await import('three')
  return { ...(await orig<object>()), levelAtlas: () => new Texture() }
})

import { Mesh, Vector3, type BufferAttribute } from 'three'
import { generateStage } from '@/game/world/stages'
import { BUTTON_Y } from '@/game/world/stages/builder'
import { planDecor, wallThingFaces } from '@/game/world/decor'
import { buildClimbLevel } from '@/game/world/climbMesh'
import { CELL, cellCenter, type MapData } from '@/game/world/levelGen'
import { THEMES, type SectorId } from '@/game/world/themes'

const STAGES: SectorId[] = ['blaze', 'cryo', 'volt', 'gale', 'magnet', 'drill', 'tide', 'neon', 'rotor', 'fortress']
const SIDE = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] } as const

interface Thing { what: string; x: number; y: number; z: number; nx: number; nz: number }

/** Every thing on a wall the player must see or shoot, where the sim hangs it
 *  (`sim/stages/magnet.ts`, `neon.ts`, `water.ts`, `sim/secrets.ts`). */
const wallThings = (m: MapData): Thing[] => {
  const t = m.terrain!
  const out: Thing[] = []
  const onSide = (what: string, i: number, j: number, side: keyof typeof SIDE, inset: number): void => {
    const [sx, sz] = SIDE[side]
    out.push({
      what, x: cellCenter(i) + sx * (CELL / 2 - inset), y: t.floor[j * m.w + i]! + BUTTON_Y, z: cellCenter(j) + sz * (CELL / 2 - inset),
      nx: -sx, nz: -sz
    })
  }
  for (const [n, r] of (t.magnets ?? []).entries()) if (r.panel) onSide(`polarity panel ${n}`, r.panel.i, r.panel.j, r.panel.side, 0.08)
  for (const [n, s] of (t.neonSwitches ?? []).entries()) onSide(`neon switch ${n}`, s.i, s.j, s.side, 0.08)
  for (const [n, w] of (t.water ?? []).entries()) if (w.valve) onSide(`valve ${n}`, w.valve.i, w.valve.j, w.valve.side, 0.1)
  for (const [n, s] of (t.secrets ?? []).entries()) {
    for (const [b, k] of s.buttons.entries()) out.push({ what: `secret ${n} button ${b}`, x: k.x, y: k.y, z: k.z, nx: k.nx, nz: k.nz })
    out.push({ what: `secret ${n} hint panel`, x: s.panel.x, y: s.panel.y, z: s.panel.z, nx: s.panel.nx, nz: s.panel.nz })
    // A mirror puzzle's beam lamp (#143).
    if (s.emitter) out.push({ what: `secret ${n} beam lamp`, ...s.emitter })
  }
  return out
}

/** The wall face a thing hangs on (the cell in front, the step to the wall). */
const faceOf = (m: MapData, w: Thing): string => {
  const i = Math.floor((w.x + w.nx * 0.5) / CELL)
  const j = Math.floor((w.z + w.nz * 0.5) / CELL)
  return `${j * m.w + i}:${-Math.sign(w.nx)},${-Math.sign(w.nz)}`
}

/** The space in front of a thing that must stay empty (m): its own half-width
 *  and a margin either side, from just off the wall out to arm's length, and
 *  its height and a margin over and under. */
const CLEAR_SIDE = 0.45 + 0.35
const CLEAR_OUT = 1.0
const CLEAR_UP = 0.45 + 0.25
/** Off the wall's own face (m): the wall and its flush trim are not in front. */
const CLEAR_FROM = 0.03

/** Point p (world) in front of thing w, inside its clear box. */
const inFront = (w: Thing, p: Vector3): boolean => {
  // The wall it hangs on: the cell edge a few cm behind it.
  const wx = w.nx ? Math.round(w.x / CELL) * CELL : w.x
  const wz = w.nz ? Math.round(w.z / CELL) * CELL : w.z
  const out = (p.x - wx) * w.nx + (p.z - wz) * w.nz
  const side = Math.abs((p.x - w.x) * -w.nz + (p.z - w.z) * w.nx)
  return out > CLEAR_FROM && out < CLEAR_OUT && side < CLEAR_SIDE && Math.abs(p.y - w.y) < CLEAR_UP
}

describe('wall things hang on a bare wall', () => {
  for (const sector of STAGES) {
    it(`${sector}: no prop on or in front of one, its face kept bare of pipes, every seed`, () => {
      for (let seed = 0; seed < 24; seed++) {
        const m = generateStage(sector, seed)
        const faces = wallThingFaces(m.terrain!, m.w)
        const plan = planDecor(m, sector)
        for (const w of wallThings(m)) {
          const at = `${sector} #${seed} ${w.what}`
          const face = faceOf(m, w)
          // The level mesh draws no pipe or light strip on this face.
          expect(faces.has(face), `${at}: its face kept bare`).toBe(true)
          for (const p of plan.props) {
            expect(p.face === face || (p.backs ?? []).includes(face), `${at}: ${p.kind} on its face`).toBe(false)
            // A floor prop's body clear of the space in front (with its radius).
            if (p.r > 0) {
              const out = (p.x - w.x) * w.nx + (p.z - w.z) * w.nz
              const side = Math.abs((p.x - w.x) * -w.nz + (p.z - w.z) * w.nx)
              expect(out + p.r > 0 && out - p.r < CLEAR_OUT && side - p.r < CLEAR_SIDE, `${at}: ${p.kind} in front of it`).toBe(false)
            }
          }
        }
      }
    })
  }
})

// ─── The built mesh ──────────────────────────────────────────────────────────

/** Any triangle of the level's meshes reaching into the clear box of a thing
 *  (sampled over each triangle, so a long pipe with no vertex near it counts). */
const blockers = (root: import('three').Object3D, things: Thing[]): string[] => {
  const hits: string[] = []
  const a = new Vector3()
  const b = new Vector3()
  const c = new Vector3()
  const p = new Vector3()
  root.updateMatrixWorld(true)
  root.traverse(o => {
    const mesh = o as Mesh
    if (!mesh.isMesh) return
    const pos = mesh.geometry.getAttribute('position') as BufferAttribute | undefined
    if (!pos) return
    const idx = mesh.geometry.getIndex()
    const n = idx ? idx.count : pos.count
    const v = (i: number, out: Vector3) => out.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(mesh.matrixWorld)
    for (let i = 0; i < n; i += 3) {
      v(i, a)
      v(i + 1, b)
      v(i + 2, c)
      // Only triangles near some thing at all (a cheap bound first).
      const near = things.filter(w =>
        Math.min(a.x, b.x, c.x) < w.x + 1.5 && Math.max(a.x, b.x, c.x) > w.x - 1.5 &&
        Math.min(a.z, b.z, c.z) < w.z + 1.5 && Math.max(a.z, b.z, c.z) > w.z - 1.5 &&
        Math.min(a.y, b.y, c.y) < w.y + 1 && Math.max(a.y, b.y, c.y) > w.y - 1)
      if (!near.length) continue
      const S = 8
      for (let u = 0; u <= S; u++) {
        for (let s = 0; s <= S - u; s++) {
          p.set(0, 0, 0).addScaledVector(a, u / S).addScaledVector(b, s / S).addScaledVector(c, (S - u - s) / S)
          for (const w of near) if (inFront(w, p)) hits.push(`${w.what} at (${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)})`)
        }
      }
    }
  })
  return [...new Set(hits.map(h => h.split(' at ')[0]))]
}

describe('the built level: nothing of its dressing in front of a wall thing', () => {
  // Seeds where the mesh DID draw a pipe across a polarity panel or a neon
  // switch while it kept only the secrets' faces bare (magnet 9, 10, 13;
  // neon 3), and a valve's and a Sky Docks secret's level besides.
  const CASES: Array<[SectorId, number]> = [['magnet', 9], ['magnet', 10], ['magnet', 13], ['neon', 3], ['tide', 1], ['gale', 1]]
  for (const [sector, seed] of CASES) {
    it(`${sector} #${seed}`, async () => {
      const m = generateStage(sector, seed)
      const things = wallThings(m)
      const level = await buildClimbLevel(m, THEMES[sector])
      expect(blockers(level.root, things), `${sector} #${seed}`).toEqual([])
    }, 60_000)
  }
})
