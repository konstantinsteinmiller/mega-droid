// The wall climbs' puzzle rule (`world/climbFeature.ts`), shared by the
// climb, puzzle-audit and stage-secret specs: every shaft readable (a real
// face over open floor, nothing of the dressing on it), reachable (its foot
// walkable from the room's doors, the room still walkable door to door
// round the tower) and solvable — kicked up with the game's own body
// (`ClimbRun`: KICK_UP, the slip, the mantle), pitch by pitch, to the prize.
import { Group, Scene } from 'three'
import { CELL, cellCenter, type ClimbSpot, type MapData } from '@/game/world/levelGen'
import { createNav, walkStep } from '@/game/world/nav'
import { THEMES, type SectorId } from '@/game/world/themes'
import { SECTOR_BY_ID } from '@/game/data/regions'
import { ClimbRun, KICK_UP, type ClimbBody, type ClimbHost } from '@/game/sim/climb'
import { planDecor, wallThingFaces } from '@/game/world/decor'

export const body = (x: number, z: number, y: number, yaw: number): ClimbBody => ({
  x, z, y, vx: 0, vz: 0, vy: 0, yaw, ground: true, ladder: -1, plat: -1, air: 0, safeY: y, mantle: 0, mx: 0, mz: 0, path: null
})

export const hostFor = (map: MapData, sector: SectorId): ClimbHost => {
  const scene = new Scene()
  const noop = () => {}
  return {
    nav: createNav(map), map, theme: THEMES[sector],
    combat: { maxHp: 100 } as ClimbHost['combat'],
    fx: { sparks: noop, riseRing: noop, emit: noop } as unknown as ClimbHost['fx'],
    markers: { spawn: noop } as unknown as ClimbHost['markers'],
    shocks: { spawn: noop } as unknown as ClimbHost['shocks'],
    hitPlayer: () => 'hit', sfx: noop, shake: noop, onPickup: noop, propParent: () => scene,
    scene, time: 0, level: { root: new Group(), rooms: [], sky: null as never, bounds: [], owner: new Int16Array(0) },
    enemyLevel: 1, encounters: SECTOR_BY_ID[sector].encounters, addEnemy: noop, say: noop
  }
}

/** Cells of room `room` walkable from `from` (`walkStep`, inside the room). */
export const roomWalk = (m: MapData, room: number, from: number[]): Set<number> => {
  const seen = new Set<number>()
  const stack = from.slice()
  while (stack.length) {
    const k = stack.pop()!
    if (seen.has(k)) continue
    seen.add(k)
    const i = k % m.w
    const j = (k - i) / m.w
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const ni = i + di
      const nj = j + dj
      if (ni < 0 || nj < 0 || ni >= m.w || nj >= m.h) continue
      const nk = nj * m.w + ni
      if (m.room[nk] === room && !seen.has(nk) && walkStep(m, i, j, ni, nj)) stack.push(nk)
    }
  }
  return seen
}

/** The room cells just inside each of `room`'s doorways. */
export const doorCellsOf = (m: MapData, room: number): number[] => {
  const out: number[] = []
  for (const d of m.doors) {
    for (const s of [-1, 1]) {
      const i = d.i + (d.axis === 'x' ? s : 0)
      const j = d.j + (d.axis === 'z' ? s : 0)
      if (i >= 0 && j >= 0 && i < m.w && j < m.h && m.room[j * m.w + i] === room) out.push(j * m.w + i)
    }
  }
  return out
}

/**
 * Kick up shaft `n` with the game's own body: at its foot, facing the wall,
 * a slide every `every` s. Returns the kicks it took, or −1 when Flux never
 * got onto the ledge.
 */
export const kickUp = (run: ClimbRun, m: MapData, n: number, every = 1 / 3): number => {
  const L = m.terrain!.ladders[n]!
  const p = body(cellCenter(L.i) + L.di * 0.8, cellCenter(L.j) + L.dj * 0.8, L.y0, Math.atan2(-L.di, -L.dj))
  if (!run.kick(p)) return -1
  const out: [number, number] = [0, 0]
  const step = Math.round(every * 60)
  let kicks = 1
  for (let f = 1; f < 60 * 20 && (p.ladder >= 0 || p.mantle > 0); f++) {
    if (p.ladder >= 0 && f % step === 0) { run.kick(p); kicks++ }
    run.stepBody(p, out, 0, 0, 1 / 60, false)
    p.x = out[0]
    p.z = out[1]
  }
  if (p.ladder >= 0 || Math.abs(p.y - L.y1) > 0.05) return -1
  // On the ledge, past the face.
  const ti = Math.floor(p.x / CELL)
  const tj = Math.floor(p.z / CELL)
  if (ti !== L.i + L.di || tj !== L.j + L.dj) return -1
  return kicks
}

/** Every problem with map `m`'s wall climbs (empty: none). `run`: also kick
 *  every shaft up with the real body (slower). */
export const climbProblems = (m: MapData, sector: SectorId, label: string, run = false): string[] => {
  const t = m.terrain!
  const out: string[] = []
  const faces = wallThingFaces(t, m.w)
  const decor = planDecor(m, sector)
  const cr = run ? new ClimbRun(hostFor(m, sector), 1) : null
  for (const [n, c] of (t.climbs ?? []).entries()) {
    const at = `${label} climb ${n} (${c.reward}, tier ${c.tier})`
    const cells = new Set(c.cells)
    // Bare: no prop on the tower or in front of a shaft, no pipe or prop on its walls.
    const feet = c.ladders.map(id => t.ladders[id]!).map(L => L.j * m.w + L.i)
    for (const p of decor.props) {
      // A wall prop by its face's cell (its origin lies on the wall line).
      const k = p.face ? Number(p.face.split(':')[0]) : Math.floor(p.z / CELL) * m.w + Math.floor(p.x / CELL)
      if (cells.has(k) || feet.includes(k)) out.push(`${at}: a ${p.kind} on the tower or a shaft's foot`)
    }
    for (const k of c.cells) for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!faces.has(`${k}:${di},${dj}`)) out.push(`${at}: wall ${k}:${di},${dj} not kept bare`)
    // Every tower cell raised; the top is the tower's.
    for (const k of c.cells) if (m.room[k] !== c.room) out.push(`${at}: tower cell ${k} not in its room`)
    if (!cells.has(c.top.j * m.w + c.top.i)) out.push(`${at}: its prize off the tower`)
    // The shafts: each a real face, foot on open floor, a pitch after another.
    let prev = -1
    for (const id of c.ladders) {
      const L = t.ladders[id]!
      const fk = L.j * m.w + L.i
      const tk = (L.j + L.dj) * m.w + L.i + L.di
      if (!L.kick || !L.side) out.push(`${at}: shaft ${id} not a side kick shaft`)
      if (t.pit[fk] || m.room[fk] !== c.room) out.push(`${at}: shaft ${id}'s foot not floor of the room`)
      if (!cells.has(tk)) out.push(`${at}: shaft ${id} not up the tower`)
      if (Math.abs(t.floor[fk]! - L.y0) > 1e-6 || Math.abs(t.floor[tk]! - L.y1) > 1e-6) out.push(`${at}: shaft ${id}'s ends off the floors`)
      if (L.y1 - L.y0 < 1.4) out.push(`${at}: shaft ${id} no wall to kick (${L.y1 - L.y0} m)`)
      // Pitch to pitch: the next foot walkable from the last ledge.
      if (prev >= 0 && !roomWalk(m, c.room, [prev]).has(fk)) out.push(`${at}: shaft ${id}'s foot not reached from the last ledge`)
      prev = tk
      if (cr) {
        const kicks = kickUp(cr, m, id)
        if (kicks < 0) out.push(`${at}: shaft ${id} not climbable`)
        else if (kicks > Math.ceil((L.y1 - L.y0) / KICK_UP) + 1) out.push(`${at}: shaft ${id} took ${kicks} kicks`)
        // A slower hand gets there too (a kick every 0.6 s, the slip between).
        if (kickUp(cr, m, id, 0.6) < 0) out.push(`${at}: shaft ${id} not climbable at a slow beat`)
      }
    }
    if (prev >= 0 && !roomWalk(m, c.room, [prev]).has(c.top.j * m.w + c.top.i) && c.reward !== 'shortcut') out.push(`${at}: the prize not reached from the last ledge`)
    // Reachable: the first foot from the room's doors; door to door round the tower.
    const doors = doorCellsOf(m, c.room)
    const walk = roomWalk(m, c.room, doors.slice(0, 1))
    const first = t.ladders[c.ladders[0]!]!
    if (!walk.has(first.j * m.w + first.i)) out.push(`${at}: the first foot not reached from the door`)
    for (const k of doors) if (!walk.has(k)) out.push(`${at}: room ${c.room} cut door to door`)
    // Not by walking: the prize only up the shafts.
    if (walk.has(c.top.j * m.w + c.top.i)) out.push(`${at}: the prize walked to without the climb`)
  }
  return out
}

/** The wall climbs of `m` and of its other hand. */
export const bothHands = (m: MapData, mirror: (m: MapData) => MapData): MapData[] => [m, mirror(m)]

export type { ClimbSpot }
