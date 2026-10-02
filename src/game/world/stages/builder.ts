import {
  CELL, Cell, Ramp, cellCenter, type MapData, type Room, type RoomRole, type Door, type Terrain, type SectionKind,
  type Ladder, type Lift, type Crusher, type RollerLane, type Checkpoint, type RewardSpot, type FoePost,
  type ChestSpot, type SecretSpec, type PitKind, type WindZone, type RailSpec, type WaveSpec, type VentSpec, type NavLink,
  type IcePillar, type IcicleSpec, type CrumbleSpec, type MagnetRail, type WaterZone, type NeonBridge, type NeonSwitch, type BlackoutSpec
} from '../levelGen'

/**
 * ─── Building a terrain map by hand ──────────────────────────────────────────
 *
 * The toolkit the climb (`world/climbGen.ts`) and the platform stages
 * (`world/stages/*.ts`) are authored with: a grid of cells, rooms laid in
 * order with a corridor and a door between each two, floor heights, stairs,
 * pits, and the list of moving parts and spots each section adds. `finish`
 * turns it into a `MapData` with its `terrain`; `mirrorX` flips a finished
 * map left-right (a seed's "other hand").
 *
 * Rooms are chained: each new room's parent is the one before it, and a
 * corridor always leads out of the last room into the next one added. The
 * arena (section 'arena', role 'boss') is the last room, entered through the
 * boss corridor, with its floor at y = 0 so the boss needs no heights.
 */

/** Walls rise this far above a room's highest floor (m). */
const WALL_OVER = 5
/** Pits are drawn this deep under the floor they are cut into (m). */
const PIT_DEPTH = 8
/** The arena keeps the labyrinth's wall height: the boss drops in over it. */
const ARENA_WALL = 4.2
/** A wall button's face and the hint panel stand this far off their wall (m),
 *  and this high over the floor. */
const BUTTON_OFF = 0.06
export const BUTTON_Y = 1.6
const PANEL_Y = 1.5

/** Facing yaw (the game's convention: forward = (−sin, −cos)) toward +X etc.
 *  For a chest or a wall spot: the wall it backs onto. */
export const YAW_PX = -Math.PI / 2
export const YAW_NX = Math.PI / 2
export const YAW_PZ = Math.PI
export const YAW_NZ = 0

/** A wall side of a cell: n = −Z, s = +Z, e = +X, w = −X. */
export type WallSide = 'n' | 's' | 'e' | 'w'
const SIDE: Record<WallSide, [number, number]> = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }

export class Builder {
  readonly W: number
  readonly H: number
  cell: Uint8Array
  room: Int16Array
  floor: Float32Array
  ramp: Uint8Array
  rise: Float32Array
  pit: Uint8Array
  /** Created by the first `ice` call (absent from the terrain otherwise). */
  iceMask: Uint8Array | null = null
  rooms: Room[] = []
  doors: Door[] = []
  sections: SectionKind[] = []
  ladders: Ladder[] = []
  lifts: Lift[] = []
  crushers: Crusher[] = []
  lanes: RollerLane[] = []
  checkpoints: Checkpoint[] = []
  rewards: RewardSpot[] = []
  foes: FoePost[] = []
  chests: ChestSpot[] = []
  secrets: SecretSpec[] = []
  /** Per room; only rooms given a kind other than 'void' need an entry. */
  pitKinds: Array<PitKind | undefined> = []
  wind: WindZone[] = []
  magnets: MagnetRail[] = []
  water: WaterZone[] = []
  neon: NeonBridge[] = []
  /** The stage's blackout clock (`Terrain.blackout`), if it has one. */
  blackout: BlackoutSpec | null = null
  /** The final boss's stage rooms (`Terrain.bossStages`). */
  bossStages: number[] = []
  neonSwitches: NeonSwitch[] = []
  /** Rooms whose way out stays shut until their machines are down. */
  guards: number[] = []
  rails: RailSpec[] = []
  waves: WaveSpec[] = []
  vents: VentSpec[] = []
  icePillars: IcePillar[] = []
  icicles: IcicleSpec[] = []
  crumbles: CrumbleSpec[] = []
  /** The beam-in room and its door, if the stage has one (`beamRoom`). */
  beam: { room: number; door: number } | null = null
  links: NavLink[] = []

  constructor(W: number, H: number) {
    this.W = W
    this.H = H
    this.cell = new Uint8Array(W * H)
    this.room = new Int16Array(W * H).fill(-1)
    this.floor = new Float32Array(W * H)
    this.ramp = new Uint8Array(W * H)
    this.rise = new Float32Array(W * H)
    this.pit = new Uint8Array(W * H)
  }

  k(i: number, j: number): number { return j * this.W + i }

  addRoom(x0: number, z0: number, w: number, h: number, role: RoomRole, kind: SectionKind, y: number): Room {
    const parent = this.rooms.length - 1
    const r: Room = {
      id: this.rooms.length, x0, z0, w, h, depth: this.rooms.length, parent, children: [], role, door: -1,
      spots: [], wallSpots: []
    }
    if (parent >= 0) this.rooms[parent]!.children.push(r.id)
    this.rooms.push(r)
    this.sections.push(kind)
    for (let j = z0; j < z0 + h; j++) {
      for (let i = x0; i < x0 + w; i++) {
        const k = this.k(i, j)
        this.cell[k] = Cell.Room
        this.room[k] = r.id
        this.floor[k] = y
      }
    }
    return r
  }

  /** Floor height over a rectangle of cells (inclusive). */
  level(i0: number, j0: number, i1: number, j1: number, y: number): void {
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) this.floor[this.k(i, j)] = y
  }

  pits(i0: number, j0: number, i1: number, j1: number): void {
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) this.pit[this.k(i, j)] = 1
  }

  /** What the pits of `room` hold (spikes and lava cost twice a plain fall). */
  /**
   * The beam-in room: a small quiet room off the stage's first room where
   * Flux lands (no machine in sight of the pad), joined to room `to` by a
   * corridor of `n` cells from (ci, cj) along (di, dj) — its door in the last
   * cell. Added after the arena so no stage's room numbers move; it is a room
   * of its own, not on the chain (no parent). Room `to` stops being the start.
   */
  beamRoom(x0: number, z0: number, w: number, h: number, ci: number, cj: number, di: number, dj: number, n: number, to = 0): void {
    // Level with the room it opens into, at the cell past the door.
    const y = this.floor[this.k(ci + di * n, cj + dj * n)]!
    const id = this.rooms.length
    const r: Room = { id, x0, z0, w, h, depth: 0, parent: -1, children: [], role: 'start', door: -1, spots: [], wallSpots: [] }
    this.rooms.push(r)
    this.sections.push('hall')
    for (let j = z0; j < z0 + h; j++) {
      for (let i = x0; i < x0 + w; i++) {
        const k = this.k(i, j)
        this.cell[k] = Cell.Room
        this.room[k] = id
        this.floor[k] = y
      }
    }
    for (let s = 0; s < n; s++) {
      const k = this.k(ci + di * s, cj + dj * s)
      this.cell[k] = Cell.Corridor
      this.floor[k] = y
    }
    const door = this.doors.length
    this.doors.push({
      id: door, i: ci + di * (n - 1), j: cj + dj * (n - 1), axis: di !== 0 ? 'x' : 'z',
      dir: (di !== 0 ? di : dj) as 1 | -1, from: id, to, boss: false
    })
    this.rooms[to]!.role = 'combat'
    this.beam = { room: id, door }
    // A checkpoint on the pad's floor: a fall anywhere near comes back here.
    const cells: Array<[number, number]> = []
    for (let j = z0; j < z0 + h; j++) for (let i = x0; i < x0 + w; i++) cells.push([i, j])
    // First on the route: the checkpoints run in route order.
    this.checkpoints.unshift({
      x: (x0 + w / 2) * CELL, z: (z0 + h / 2) * CELL, y, yaw: Math.atan2(-di, -dj), room: id,
      cells: cells.map(([a, b]) => this.k(a, b))
    })
  }

  /** A bridge of light (`sim/stages/neon.ts`) at top `y` over the w × d
   *  cells from (i, j), which become pit: solid only while lit. */
  bridge(i: number, j: number, y: number, w: number, d: number, o: Pick<NeonBridge, 'group' | 'period' | 'phase' | 'on' | 'pulse'>): void {
    this.pits(i, j, i + w - 1, j + d - 1)
    this.neon.push({ i, j, y, w, d, ...o, room: this.room[this.k(i, j)]! })
  }

  /** A crumbling slab (`sim/stages/crumble.ts`) at top `y` over the w × d
   *  cells from (i, j), which become pit: it holds once, then drops. */
  crumble(i: number, j: number, y: number, w = 1, d = 1): void {
    this.pits(i, j, i + w - 1, j + d - 1)
    this.crumbles.push({ i, j, y, w, d })
  }

  pitKind(room: number, kind: PitKind): void {
    while (this.pitKinds.length <= room) this.pitKinds.push(undefined)
    this.pitKinds[room] = kind
  }

  /** Ice over a rectangle of cells (inclusive). */
  ice(i0: number, j0: number, i1: number, j1: number): void {
    if (!this.iceMask) this.iceMask = new Uint8Array(this.W * this.H)
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) this.iceMask[this.k(i, j)] = 1
  }

  stair(i: number, j: number, dir: Ramp, lo: number, rise: number): void {
    const k = this.k(i, j)
    this.ramp[k] = dir
    this.floor[k] = lo
    this.rise[k] = rise
  }

  /** A straight corridor out of the last room: `n` cells from (i, j) along
   *  (di, dj); the door stands in its last cell, facing the next room. */
  corridor(i: number, j: number, di: number, dj: number, n: number, y: number, boss = false): void {
    for (let s = 0; s < n; s++) {
      const k = this.k(i + di * s, j + dj * s)
      this.cell[k] = Cell.Corridor
      this.floor[k] = y
    }
    const from = this.rooms.length - 1
    this.doors.push({
      id: this.doors.length, i: i + di * (n - 1), j: j + dj * (n - 1), axis: di !== 0 ? 'x' : 'z',
      dir: (di !== 0 ? di : dj) as 1 | -1, from, to: from + 1, boss
    })
  }

  checkpoint(i: number, j: number, yaw: number, cells: Array<[number, number]>): void {
    const r = this.room[this.k(i, j)]!
    this.checkpoints.push({
      x: cellCenter(i), z: cellCenter(j), y: this.floor[this.k(i, j)]!, yaw, room: r,
      cells: cells.map(([a, b]) => this.k(a, b))
    })
  }

  /** A machine's post, leashed to a rectangle of cells (inclusive). */
  foe(role: FoePost['role'], i: number, j: number, yaw: number, box: [number, number, number, number], fly?: [number, number], kind?: FoePost['kind'], echo?: string): void {
    const [i0, j0, i1, j1] = box
    const pad = 0.75
    this.foes.push({
      role, x: cellCenter(i), z: cellCenter(j), y: this.floor[this.k(i, j)]!, yaw, room: this.room[this.k(i, j)]!,
      leash: [i0 * CELL + pad, j0 * CELL + pad, (i1 + 1) * CELL - pad, (j1 + 1) * CELL - pad], fly,
      ...(kind ? { kind } : {}),
      ...(echo ? { echo } : {})
    })
  }

  /** A chest on cell (i, j)'s floor, backed onto the wall `yaw` faces (one
   *  of the YAW_ constants). Keep it off the walking line: it is solid. */
  chest(i: number, j: number, yaw: number): void {
    const k = this.k(i, j)
    this.chests.push({ x: cellCenter(i), y: this.floor[k]!, z: cellCenter(j), yaw, room: this.room[k]! })
  }

  /** A one-way hop for the objective trail (see `NavLink`). */
  link(from: [number, number], to: [number, number], kind: NavLink['kind']): void {
    this.links.push({ from, to, kind })
  }

  /**
   * An optional secret alcove (see `SecretSpec`). `alcove` is a rectangle of
   * cells (inclusive), carved as cells of `room` at the room's floor beside
   * the door — void cells next to the room are the natural place for it —
   * and hidden until solved. `door` is the alcove cell whose face along
   * `axis` opens onto a room cell (the false wall). Each button sits on the
   * named wall side of its cell; `color` defaults to the button's index.
   * For `color` the target is derived from `key`; otherwise it is `target`.
   */
  secret(
    room: number, kind: SecretSpec['kind'], alcove: [number, number, number, number], door: SecretSpec['door'],
    buttons: Array<[number, number, WallSide, number?]>, target: number[], prize: SecretSpec['prize'], key?: number
  ): SecretSpec {
    const [i0, j0, i1, j1] = alcove
    const inAlcove = (i: number, j: number) => i >= i0 && i <= i1 && j >= j0 && j <= j1
    if (!inAlcove(door.i, door.j)) throw new Error(`[builder] secret door (${door.i},${door.j}) is not in its alcove`)
    // The room cell the false wall faces: along the axis, out of the alcove.
    let oi = -1
    let oj = -1
    for (const s of [-1, 1]) {
      const ni = door.i + (door.axis === 'x' ? s : 0)
      const nj = door.j + (door.axis === 'z' ? s : 0)
      if (!inAlcove(ni, nj) && this.room[this.k(ni, nj)] === room) { oi = ni; oj = nj }
    }
    if (oi < 0) throw new Error(`[builder] secret door (${door.i},${door.j}) faces no cell of room ${room}`)
    const y = this.floor[this.k(oi, oj)]!
    const cells: number[] = []
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const k = this.k(i, j)
        this.cell[k] = Cell.Room
        this.room[k] = room
        this.floor[k] = y
        this.pit[k] = 0
        this.ramp[k] = 0
        this.rise[k] = 0
        cells.push(k)
      }
    }
    const bs = buttons.map(([i, j, side, color], n) => {
      const [di, dj] = SIDE[side]
      const nx = di ? -di : 0
      const nz = dj ? -dj : 0
      return {
        x: cellCenter(i) + di * (CELL / 2 - BUTTON_OFF), y: this.floor[this.k(i, j)]! + BUTTON_Y,
        z: cellCenter(j) + dj * (CELL / 2 - BUTTON_OFF), nx, nz, color: color ?? n % 4
      }
    })
    // The panel: on the wall beside the false wall (the face next to it along
    // the same line, if that is a wall), in the MIDDLE of that face — nearer
    // the false wall, the post between the two faces stood in front of its
    // first lamp (#123) — else on the false wall itself, off its middle.
    const fx = door.axis === 'x' ? (door.i + oi + 1) / 2 * CELL : cellCenter(door.i)
    const fz = door.axis === 'z' ? (door.j + oj + 1) / 2 * CELL : cellCenter(door.j)
    const nx = door.axis === 'x' ? Math.sign(oi - door.i) : 0
    const nz = door.axis === 'z' ? Math.sign(oj - door.j) : 0
    const ax = door.axis === 'z' ? 1 : 0
    const az = door.axis === 'x' ? 1 : 0
    let along = 0.9
    for (const s of [1, -1]) {
      const wi = door.i + ax * s
      const wj = door.j + az * s
      const ri = oi + ax * s
      const rj = oj + az * s
      const open = this.cell[this.k(wi, wj)] !== Cell.Void && !inAlcove(wi, wj)
      if (!open && this.room[this.k(ri, rj)] === room) { along = s * CELL; break }
    }
    const panel = {
      x: fx + ax * along + nx * BUTTON_OFF, y: y + PANEL_Y, z: fz + az * along + nz * BUTTON_OFF, nx, nz
    }
    // The prize: in the alcove cell farthest from the door.
    let pi = door.i
    let pj = door.j
    let far = -1
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const d = Math.abs(i - door.i) + Math.abs(j - door.j)
        if (d > far) { far = d; pi = i; pj = j }
      }
    }
    // A puzzle must ask for something: a key colour no button has, or a
    // target the buttons start on, is no puzzle (the wall would never open,
    // or the first shot would un-solve it).
    if (kind === 'color' && !bs.some(b => b.color === key)) throw new Error(`[builder] secret in room ${room}: no button has the key colour ${key}`)
    const want = target.slice()
    if (kind !== 'color' && want.length) {
      const start = bs.map(b => (kind === 'cycle' ? ((b.color % 4) + 4) % 4 : 0))
      if (start.every((v, n) => v === (want[n] ?? 0))) want[0] = kind === 'cycle' ? (start[0]! + 1) % 4 : 1
    }
    const spec: SecretSpec = {
      room, kind, buttons: bs,
      target: kind === 'color' ? bs.map(b => (b.color === key ? 1 : 0)) : want,
      key: kind === 'color' ? key : undefined,
      panel, door: { ...door }, cells, prize,
      prizeAt: { x: cellCenter(pi), y, z: cellCenter(pj) }
    }
    if (spec.key === undefined) delete spec.key
    this.secrets.push(spec)
    return spec
  }
}

/**
 * The finished map: doors lead into rooms, walls and pits get their heights,
 * and the terrain carries every list the builder collected (the optional
 * ones only when something was put in them). `start` is where Flux beams in.
 */
export const finish = (b: Builder, start: { x: number; z: number; yaw: number }, seed: number): MapData => {
  // Doors lead INTO rooms: each room's door index.
  for (const d of b.doors) b.rooms[d.to]!.door = d.id

  const wallTop: number[] = []
  const pitBottom: number[] = []
  b.rooms.forEach((r, id) => {
    let hi = -Infinity
    let lo = Infinity
    for (let j = r.z0; j < r.z0 + r.h; j++) {
      for (let i = r.x0; i < r.x0 + r.w; i++) {
        const k = b.k(i, j)
        if (b.pit[k]) continue
        hi = Math.max(hi, b.floor[k]! + b.rise[k]!)
        lo = Math.min(lo, b.floor[k]!)
      }
    }
    wallTop.push(b.sections[id] === 'arena' ? ARENA_WALL : hi + WALL_OVER)
    pitBottom.push(lo - PIT_DEPTH)
  })

  const terrain: Terrain = {
    floor: b.floor, ramp: b.ramp, rise: b.rise, pit: b.pit, wallTop, pitBottom, sections: b.sections,
    ladders: b.ladders, lifts: b.lifts, crushers: b.crushers, lanes: b.lanes, checkpoints: b.checkpoints,
    rewards: b.rewards, foes: b.foes
  }
  if (b.chests.length) terrain.chests = b.chests
  if (b.secrets.length) terrain.secrets = b.secrets
  if (b.iceMask) terrain.ice = b.iceMask
  // A room with no kind of its own keeps the rule (`pitKindOf`: spikes, or
  // the open sky's void). It used to be written out as 'void' here, so one
  // lava room turned every other pit of its stage into a bottomless dark
  // floor with nothing to land on.
  if (b.pitKinds.some(p => p !== undefined)) terrain.pitKind = b.rooms.map((_, id) => b.pitKinds[id])
  if (b.wind.length) terrain.wind = b.wind
  if (b.magnets.length) terrain.magnets = b.magnets
  if (b.water.length) terrain.water = b.water
  if (b.guards.length) terrain.guards = b.guards
  if (b.neon.length) terrain.neon = b.neon
  if (b.neonSwitches.length) terrain.neonSwitches = b.neonSwitches
  if (b.blackout) terrain.blackout = b.blackout
  if (b.bossStages.length) terrain.bossStages = b.bossStages
  if (b.rails.length) terrain.rails = b.rails
  if (b.waves.length) terrain.waves = b.waves
  if (b.vents.length) terrain.vents = b.vents
  if (b.links.length) terrain.links = b.links
  // A pillar's cell is no way through for any path (a cracked one's is
  // cleared when it is shot down).
  const navBlock = new Uint8Array(b.W * b.H)
  if (b.icePillars.length) {
    terrain.icePillars = b.icePillars
    for (const p of b.icePillars) navBlock[b.k(p.i, p.j)] = 1
  }
  if (b.icicles.length) terrain.icicles = b.icicles
  if (b.crumbles.length) terrain.crumbles = b.crumbles
  const map: MapData = {
    seed, w: b.W, h: b.H, cell: b.cell, room: b.room, navBlock, rooms: b.rooms,
    doors: b.doors, pillars: [], start, terrain
  }
  if (b.beam) map.beam = b.beam
  return map
}

/** The whole map mirrored left-right: same route, the other hand. */
export const mirrorX = (m: MapData): MapData => {
  const W = m.w
  const X = W * CELL
  const t = m.terrain!
  const flip = <A extends Uint8Array | Int16Array | Float32Array>(a: A): A => {
    const out = a.slice() as A
    for (let j = 0; j < m.h; j++) for (let i = 0; i < W; i++) out[j * W + i] = a[j * W + (W - 1 - i)]!
    return out
  }
  const ramp = flip(t.ramp)
  for (let k = 0; k < ramp.length; k++) {
    if (ramp[k] === Ramp.PX) ramp[k] = Ramp.NX
    else if (ramp[k] === Ramp.NX) ramp[k] = Ramp.PX
  }
  const mi = (i: number) => W - 1 - i
  const mk = (k: number) => { const i = k % W; return (k - i) + mi(i) }
  const box = (l: [number, number, number, number]): [number, number, number, number] => [X - l[2], l[1], X - l[0], l[3]]
  const terrain: Terrain = {
    ...t,
    floor: flip(t.floor),
    ramp,
    rise: flip(t.rise),
    pit: flip(t.pit),
    ladders: t.ladders.map(l => ({ ...l, i: mi(l.i), di: -l.di })),
    lifts: t.lifts.map(l => ({ ...l, ax: X - l.ax, bx: X - l.bx })),
    crushers: t.crushers.map(c => ({ ...c, i: mi(c.i) })),
    lanes: t.lanes.map(l => ({ ...l, x: X - l.x, dx: -l.dx })),
    checkpoints: t.checkpoints.map(c => ({ ...c, x: X - c.x, yaw: -c.yaw, cells: c.cells.map(mk) })),
    rewards: t.rewards.map(r => ({ ...r, x: X - r.x })),
    foes: t.foes.map(f => ({ ...f, x: X - f.x, yaw: -f.yaw, leash: box(f.leash) }))
  }
  if (t.chests) terrain.chests = t.chests.map(c => ({ ...c, x: X - c.x, yaw: -c.yaw }))
  if (t.secrets) {
    terrain.secrets = t.secrets.map(s => ({
      ...s,
      buttons: s.buttons.map(b => ({ ...b, x: X - b.x, nx: -b.nx })),
      target: s.target.slice(),
      panel: { ...s.panel, x: X - s.panel.x, nx: -s.panel.nx },
      door: { ...s.door, i: mi(s.door.i) },
      cells: s.cells.map(mk),
      prizeAt: { ...s.prizeAt, x: X - s.prizeAt.x }
    }))
  }
  if (t.ice) terrain.ice = flip(t.ice)
  if (t.pitKind) terrain.pitKind = t.pitKind.slice()
  if (t.wind) terrain.wind = t.wind.map(w => ({ ...w, i0: mi(w.i1), i1: mi(w.i0), dx: -w.dx }))
  if (t.magnets) {
    const side = { n: 'n', s: 's', e: 'w', w: 'e' } as const
    terrain.magnets = t.magnets.map(r => ({
      ...r, i0: mi(r.i1), i1: mi(r.i0), dx: -r.dx,
      ...(r.panel ? { panel: { ...r.panel, i: mi(r.panel.i), side: side[r.panel.side] } } : {})
    }))
  }
  if (t.water) {
    const side = { n: 'n', s: 's', e: 'w', w: 'e' } as const
    terrain.water = t.water.map(z => ({
      ...z, i0: mi(z.i1), i1: mi(z.i0),
      ...(z.dx ? { dx: -z.dx } : {}),
      ...(z.valve ? { valve: { ...z.valve, i: mi(z.valve.i), side: side[z.valve.side] } } : {})
    }))
  }
  if (t.neon) terrain.neon = t.neon.map(n => ({ ...n, i: mi(n.i + n.w - 1) }))
  if (t.blackout) terrain.blackout = { ...t.blackout }
  if (t.bossStages) terrain.bossStages = t.bossStages.slice()
  if (t.neonSwitches) {
    const side = { n: 'n', s: 's', e: 'w', w: 'e' } as const
    terrain.neonSwitches = t.neonSwitches.map(s => ({ ...s, i: mi(s.i), side: side[s.side] }))
  }
  if (t.rails) {
    terrain.rails = t.rails.map(r => ({
      ...r, points: r.points.map(p => ({ ...p, x: X - p.x })),
      boardAt: { ...r.boardAt, i: mi(r.boardAt.i) }, exitAt: { ...r.exitAt, i: mi(r.exitAt.i) }
    }))
  }
  if (t.waves) terrain.waves = t.waves.map(w => ({ ...w, trigger: w.trigger === 'rail' ? 'rail' : { ...w.trigger, i: mi(w.trigger.i) } }))
  if (t.vents) terrain.vents = t.vents.map(v => ({ ...v, i: mi(v.i), dx: -v.dx }))
  if (t.links) terrain.links = t.links.map(l => ({ ...l, from: [mi(l.from[0]), l.from[1]], to: [mi(l.to[0]), l.to[1]] }))
  if (t.icePillars) terrain.icePillars = t.icePillars.map(p => ({ ...p, i: mi(p.i) }))
  if (t.icicles) terrain.icicles = t.icicles.map(c => ({ ...c, i: mi(c.i) }))
  if (t.crumbles) terrain.crumbles = t.crumbles.map(c => ({ ...c, i: mi(c.i + (c.w ?? 1) - 1) }))
  return {
    ...m,
    cell: flip(m.cell),
    room: flip(m.room),
    navBlock: flip(m.navBlock),
    pillars: m.pillars.map(p => ({ ...p, x: X - p.x })),
    rooms: m.rooms.map(r => ({ ...r, x0: W - (r.x0 + r.w) })),
    doors: m.doors.map(d => ({ ...d, i: mi(d.i), dir: (d.axis === 'x' ? -d.dir : d.dir) as 1 | -1 })),
    start: { x: X - m.start.x, z: m.start.z, yaw: -m.start.yaw },
    terrain
  }
}

/**
 * The false wall of a secret: the alcove's door cell (i, j) and the step
 * (di, dj) from it to the room cell it faces. The wall face lies between
 * them. Derived from the cells, so it holds for a mirrored map too.
 */
export const secretDoorFace = (map: MapData, s: SecretSpec): { i: number; j: number; di: number; dj: number } => {
  const { i, j, axis } = s.door
  for (const d of [-1, 1]) {
    const di = axis === 'x' ? d : 0
    const dj = axis === 'z' ? d : 0
    const ni = i + di
    const nj = j + dj
    if (ni < 0 || nj < 0 || ni >= map.w || nj >= map.h) continue
    const k = nj * map.w + ni
    if (map.room[k] === s.room && !s.cells.includes(k)) return { i, j, di, dj }
  }
  return { i, j, di: axis === 'x' ? 1 : 0, dj: axis === 'z' ? 1 : 0 }
}
