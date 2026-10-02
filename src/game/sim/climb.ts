import { Group, Color, type MeshBasicMaterial, type Object3D, type Scene } from 'three'
import {
  CELL, Cell, pitKindOf, type MapData, type Terrain, type Ladder, type Lift, type Crusher, type RollerLane, type RewardSpot, type SecretSpec
} from '../world/levelGen'
import { floorAt, groundAt, moveBody, platUnder, STEP_UP, type Nav, type Plat, type Slab } from '../world/nav'
import { BALL_R } from '../world/climbGen'
import { secretDoorFace } from '../world/stages/builder'
import type { LevelMeshes } from '../world/levelMesh'
import {
  buildLift, buildCrusher, buildScrapBall, buildEmberBarrel, buildLaneLamp, type LiftMesh, type CrusherMesh, type BallMesh
} from '../models/climbProps'
import { buildBolt, buildCapsule } from '../models/props'
import type { Theme } from '../world/themes'
import type { CombatPlayer, Enemy, PickupKind, Shot } from './world'
import type { Particles } from '../fx/particles'
import type { FloorMarkers, ShockRings } from '../fx/markers'
import { PLAYER_R, ACCEL } from './constants'
import type { EncounterTable } from './spawn'
import type { AtlasLine } from './atlas'
import { buildStageFeatures, AtlasCue, type StageFeature, type MoveMod } from './stageFeatures'

/**
 * ─── The climb at run time ───────────────────────────────────────────────────
 *
 * Everything that moves or can hurt on the tower (`world/climbGen.ts`), and
 * the player's body on its floor heights:
 *
 *  - Flux has feet now: gravity, ground snap down stairs and onto a lowering
 *    lift, a step-up of STEP_UP, a tenth of a second of grace over a pit edge
 *    (the shuttle's lip) — and no jump. Ladders are climbed by pushing toward
 *    the wall (away from it goes down), so forward climbs when facing the
 *    ladder and forward descends when coming off the top; the top steps off
 *    by itself. Slide lets go.
 *  - Lifts: a shuttle loops over a pit on the mission clock; a vertical lift
 *    waits at the bottom and rides up once stood on, then comes home — or,
 *    with `loop`, bobs up and down on the clock like a shuttle.
 *  - Crushers warn (a lamp, a click, a red ring on the walkway), slam, hold,
 *    rise. Under the head at the slam: a fifth of the health.
 *  - Scrap balls drop from hatches over the rolling stairs and roll down
 *    their lanes into the gutter, each lane's lamp going amber then red first.
 *  - Pits: a fall well below the last floor costs PIT_COST of the health and
 *    puts Flux back on the last checkpoint after a fade (MegaMan's pits,
 *    softened) — a visible pit holds spikes, twice that into lava
 *    (`Terrain.pitKind`, `pitKindOf`).
 *  - The dash leap: a slide that runs off a pit edge hops (LEAP_VY) and
 *    carries its momentum (LEAP_SPEED at most) with little air control, so
 *    a one-cell gap between equal floors is crossed and a two-cell one is
 *    not. Level designs rely on exactly that.
 *  - The platform stages' own mechanics (`sim/stageFeatures.ts`) are driven
 *    from here: their update, the walk they bend (`moveMod`), the body they
 *    carry, their snapshot. Secret alcoves stay walled off (a slab, blocked
 *    paths, the mesh's false wall) until `openSecret`.
 *
 * Nothing allocates per step: pools and fixed arrays built with the mission.
 */

/** Share of max health a pit fall costs. */
export const PIT_COST = 0.15
const GRAVITY = 26
const MAX_FALL = 22
/** Walking down: a floor this far under the feet is followed, not fallen to. */
const SNAP = 0.6
/** Grace over a pit edge before the fall starts (s). */
const COYOTE = 0.1
const CLIMB_SPEED = 3.3
/** A wall-kick: how high each kick lifts Flux (m), how fast he rises to it
 *  (m/s), and how fast he slips back down between kicks (m/s). */
export const KICK_UP = 1.6
const KICK_SPEED = 7
const KICK_SLIP = 0.9
/** Fallen this far under the last floor over a pit: it is a pit fall. */
const PIT_DROP = 4.5
/** No fall is longer than this (m), wherever it happens: the rescue comes. */
const FALL_LIMIT = 30
/** A surface this far under the feet (m) is no floor: a platform put away
 *  (a crumbled slab waits at −10 km until it comes back). */
const PARKED = 200
/** Crusher cycle (s from the warning): warn, slam, hold, rise; idle after. */
const CR_WARN = 0.75
const CR_SLAM = 0.12
const CR_HOLD = 0.45
const CR_RISE = 0.9
/** The crusher head's rest height over the walkway, its size, its beam. */
const CR_REST = 3.8
const CR_SIZE = 2.5
const CR_BEAM = 5.4
const CR_COST = 0.2
/** Scrap balls: the lamp's warning, the drop out of the hatch, the roll. */
const BALL_WARN = 0.9
const BALL_HATCH = 2.5
const BALL_V0 = 3
const BALL_ACC = 6
const BALL_VMAX = 9
const BALL_COST = 0.16
/** Flux's height for things that hit his body (m). */
const BODY_H = 1.75
/** The dash leap: the hop off a pit edge (m/s up) and the most horizontal
 *  speed it keeps (m/s; the slide runs at 15). With GRAVITY that is 0.47 s
 *  in the air before the feet are STEP_UP under the take-off floor: about
 *  5.1 m of flight with the stick let go, 3.5 m with it held on ahead —
 *  a 3 m gap is always crossed, a 6 m one never. */
export const LEAP_VY = 5
export const LEAP_SPEED = 11
/** The edge-leap (`edgeLeap`): the least walking speed that leaps (m/s),
 *  how far ahead a landing is looked for (m) and how much lower it may be,
 *  how far past its near edge the leap aims, and the flight time the launch
 *  speed is sized for (s; LEAP_VY under GRAVITY, landing a step lower). */
const EDGE_MIN = 1.2
const EDGE_REACH = 4.4
const EDGE_DROP = 1.6
const EDGE_OVER = 0.9
const EDGE_FLIGHT = 0.42
/** Air control on a terrain map: the walk's blend in the air, as a share of
 *  the ground's. */
export const AIR_CONTROL = 0.25
/** How deep a spiked (or lava) pit's floor lies when its room does not say. */
const PIT_FLOOR_Y = -4
/** Twice a plain fall into spikes or lava. */
const HOT_PIT = 2
/** Half the thickness of a secret alcove's wall slabs (m). */
const SECRET_WALL = 0.15

/** The player's body as the climb moves it (the mission's `PlayerState`). */
export interface ClimbBody {
  x: number
  z: number
  y: number
  vx: number
  vz: number
  vy: number
  yaw: number
  ground: boolean
  /** The ladder climbed (index), or −1. */
  ladder: number
  /** The platform stood on (index into `nav.plats`), or −1. */
  plat: number
  /** Time off the ground while grounded over a pit edge (the grace). */
  air: number
  /** Height of the last solid floor stood on. */
  safeY: number
  /** Stepping off the top of a ladder: time left, and where to. */
  mantle: number
  mx: number
  mz: number
  path: Array<[number, number]> | null
}

export interface ClimbHost {
  nav: Nav
  map: MapData
  theme: Theme
  combat: CombatPlayer
  fx: Particles
  markers: FloorMarkers
  shocks: ShockRings
  /** For the stage features: the scene (meshes outside any room), the
   *  mission clock, the level's meshes (a secret's false wall), and what a
   *  wave of flyers needs — `createEnemy('heli', enemyLevel, …)` with a
   *  floor, a hover band and a leash, then `addEnemy`. */
  scene: Scene
  time: number
  level: LevelMeshes
  enemyLevel: number
  encounters: EncounterTable
  addEnemy(e: Enemy): void
  /** A machine's shot (the mission's own: lifted to its floor, tipped at
   *  Flux's height) — for a feature's machines that fire on their own
   *  rhythm (the rail's wave flyers). Optional: a host without it gets
   *  none. */
  fireEnemyShot?(e: Enemy, x: number, y: number, z: number, dx: number, dy: number, dz: number, speed: number, dmg: number, blockable: boolean): void
  /** Atlas says a line: a stage's `hint.<id>` (a tip on the danger ahead)
   *  or `secret.<id>` (a nudge toward a secret), once a mission each. */
  say(line: AtlasLine): void
  hitPlayer(e: Enemy | null, dmg: number, o: { blockable: boolean; fromX: number; fromZ: number; kind: 'melee' | 'aoe' | 'shot'; hazard?: string }): 'hit' | 'block' | 'parry' | 'miss'
  /** A hazard also catches machines (not a Core Master): each one the test
   *  says is in it loses `cost01` of ITS max health, halved (`hurtMachines`). */
  hurtMachines?(cost01: number, fromX: number, fromZ: number, hits: (x: number, y: number, z: number) => boolean): void
  sfx(name: string, x?: number, z?: number): void
  /** Flux reached checkpoint `n` (the Fortress keeps a retry point there). */
  onCheckpoint?(n: number): void
  /** The stage's lights this frame (`sim/lightPulse.ts`): 0 lit .. 1 dark. The
   *  darkest request of the frame wins; nothing asked means lit. */
  stageDark?(dark01: number): void
  /** A sky flash (lightning), 0..1, fading on its own. */
  skyFlash?(amount: number): void
  shake(amount: number): void
  onPickup(kind: PickupKind, value: number): void
  propParent(x: number, z: number): Object3D
  /** A secret's prize is taken (`sim/secrets.ts`): 'tank' one Repair Gel
   *  more, even over the cap; 'weapon' / 'power' a borrowed Core Master
   *  weapon's charges (`sim/borrowed.ts`). ('hp' is `onPickup('hpBig')`.) */
  secretPrize?(prize: SecretSpec['prize'], x: number, y: number, z: number): void
}

interface LadderRt {
  def: Ladder
  /** The face's middle, the normal toward the foot, the unit along it. */
  ex: number
  ez: number
  nx: number
  nz: number
  ax: number
  az: number
  standX: number
  standZ: number
  topX: number
  topZ: number
}

interface LiftRt {
  def: Lift
  plat: Plat
  mesh: LiftMesh
  x: number
  y: number
  z: number
  /** v lift: 0 home, 1 rising, 2 up, 3 returning. */
  state: number
  t: number
  /** Time stood on (at home) / left alone (up). */
  ride: number
  moving: boolean
  bottom: number
  /** Its index here and its platform's in `nav.plats`. */
  idx: number
  platIdx: number
}

interface CrusherRt {
  def: Crusher
  x: number
  z: number
  slab: Slab
  mesh: CrusherMesh
  /** Head underside over the walkway (m). */
  head: number
  /** Which cycle the warning / the hit / the impact last fired in. */
  warned: number
  hitCyc: number
  landed: number
}

interface LaneRt {
  def: RollerLane
  mat: MeshBasicMaterial
  /** Release count fired so far (keyed on the mission clock). */
  fired: number
  topY: number
}

interface BallRt {
  active: boolean
  lane: LaneRt | null
  /** Metres rolled; −1 while still dropping out of the hatch. */
  s: number
  v: number
  x: number
  y: number
  z: number
  vy: number
  sink: number
  hit: boolean
  mesh: BallMesh
}

interface RewardRt {
  def: RewardSpot
  root: Group
  taken: boolean
}

export interface ClimbSave {
  /** Last checkpoint reached (−1: the pad). */
  cp: number
  /** Reward ledges already emptied. */
  got: number[]
  /** Secrets opened (`Terrain.secrets` indices). */
  open?: number[]
  /** Each stage feature's own save, by its place in the list. */
  feat?: unknown[]
}

/** A secret alcove's walls at run time: the false wall's slab (active until
 *  solved) and the permanent ones round the rest of the alcove. */
interface SecretRt {
  def: SecretSpec
  door: Slab
  open: boolean
}

/** The blend of the walk toward the wanted velocity this step (the mission's
 *  `k`): all at once in a slide, ACCEL on the ground, a quarter of it in the
 *  air on a terrain map, times the floor's friction (`StageFeature.move`). */
export const walkBlend = (dt: number, sliding: boolean, air: boolean, friction = 1): number =>
  sliding ? 1 : Math.min(1, dt * ACCEL * friction * (air ? AIR_CONTROL : 1))

/** Lamp colours, made once: the telegraphs change colour every frame. */
const LAMP = {
  rest: new Color('#8dff7a'),
  move: new Color('#ffd23a'),
  moveDim: new Color('#7a5a10'),
  warn: new Color('#ff2d3f'),
  warnDim: new Color('#5a0a10'),
  hot: new Color('#ff7a2a'),
  idle: new Color('#ffb02a'),
  laneOff: new Color('#3a2a18'),
  laneRed: new Color('#ff2d3f'),
  laneRedDim: new Color('#6a0a12'),
  laneAmber: new Color('#ffb02a')
}

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v)
const ease = (k: number) => k * k * (3 - 2 * k)

export class ClimbRun {
  readonly t: Terrain
  private host: ClimbHost
  private ladders: LadderRt[] = []
  /** Atlas's first-time warnings on the way: the first ladder, the first shuttle over a pit
   *  (the mission says each once ever). */
  private readonly cues: AtlasCue[] = []
  private lifts: LiftRt[] = []
  private crushers: CrusherRt[] = []
  private lanes: LaneRt[] = []
  private balls: BallRt[] = []
  private rewards: RewardRt[] = []
  private secrets: SecretRt[] = []
  /** The platform stages' mechanics (`sim/stageFeatures.ts`), in snapshot
   *  order. */
  readonly features: StageFeature[]
  private mod: MoveMod = { friction: 1, pushX: 0, pushZ: 0 }
  /** A wall-kick's target height (`kick`). */
  private kickTo = -Infinity
  /** A boss's pull this step (m/s), added to the features' push. */
  private pullX = 0
  private pullZ = 0
  /** Last checkpoint reached (−1: the pad). */
  cp = -1
  /** This step's pit fall happened (the mission restarts Flux), and how dark
   *  the fall has made the view so far (0..1). */
  pitted = false
  pitDark = 0
  /** Speed of the last landing (m/s), for the thud. */
  landSpeed = 0
  /** This step's slide ran off a pit edge into a dash leap (the mission
   *  ends the slide: the leap keeps its own momentum). */
  leapt = false
  /** This step's walk ran off an edge into an edge-leap (no slide). */
  edgeLeapt = false
  /** An edge-leap is in the air (until the feet touch down). */
  edgeFlight = false
  /** Share of max health this step's pit fall costs (PIT_COST, doubled
   *  into spikes or lava). */
  pitCost = PIT_COST
  private level: number

  constructor(host: ClimbHost, level: number) {
    this.host = host
    this.level = level
    const t = host.map.terrain!
    this.t = t
    const th = host.theme
    const nav = host.nav
    for (const L of t.ladders) {
      const ex = L.di ? (L.di > 0 ? (L.i + 1) * CELL : L.i * CELL) : (L.i + 0.5) * CELL
      const ez = L.dj ? (L.dj > 0 ? (L.j + 1) * CELL : L.j * CELL) : (L.j + 0.5) * CELL
      const nx = -L.di
      const nz = -L.dj
      this.ladders.push({
        def: L, ex, ez, nx, nz, ax: Math.abs(L.dj), az: Math.abs(L.di),
        standX: ex + nx * (PLAYER_R + 0.06), standZ: ez + nz * (PLAYER_R + 0.06),
        topX: ex - nx * (PLAYER_R + 0.35), topZ: ez - nz * (PLAYER_R + 0.35)
      })
      if (!L.kick && !L.side && !this.cues.some(c => c.line === 'warn.ladder')) {
        this.cues.push(new AtlasCue(host, 'warn.ladder', ex + nx * 1.4, ez + nz * 1.4, L.y0))
      }
    }
    for (const lf of t.lifts) {
      const mesh = buildLift(th, lf.hw, lf.hd, lf.kind === 'v')
      const plat: Plat = { x0: 0, z0: 0, x1: 0, z1: 0, top: lf.ay, dx: 0, dz: 0 }
      nav.plats!.push(plat)
      const bottom = t.pitBottom[lf.room] ?? lf.ay - 12
      const rt: LiftRt = {
        def: lf, plat, mesh, x: lf.ax, y: lf.ay, z: lf.az, state: 0, t: 0, ride: 0, moving: false, bottom,
        idx: this.lifts.length, platIdx: nav.plats!.length - 1
      }
      host.propParent(lf.ax, lf.az).add(mesh.root)
      if (lf.kind === 'h' && !this.cues.some(c => c.line === 'warn.pit')) {
        this.cues.push(new AtlasCue(host, 'warn.pit', lf.ax, lf.az, lf.ay))
      }
      this.lifts.push(rt)
      this.placeLift(rt, lf.ax, lf.ay, lf.az, true)
    }
    for (const cr of t.crushers) {
      const x = (cr.i + 0.5) * CELL
      const z = (cr.j + 0.5) * CELL
      // Thinner along the walkway, so a body caught inside is pushed out
      // along the walk, never off its side.
      const walkX = !t.pit[cr.j * host.map.w + cr.i + 1] && host.map.cell[cr.j * host.map.w + cr.i + 1] !== 0
      const ha = CR_SIZE / 2
      const hb = ha - 0.08
      const slab: Slab = walkX
        ? { minX: x - hb, maxX: x + hb, minZ: z - ha, maxZ: z + ha, active: false }
        : { minX: x - ha, maxX: x + ha, minZ: z - hb, maxZ: z + hb, active: false }
      nav.slabs.push(slab)
      const mesh = buildCrusher(th, CR_SIZE, CR_BEAM)
      mesh.root.position.set(x, cr.y, z)
      host.propParent(x, z).add(mesh.root)
      this.crushers.push({ def: cr, x, z, slab, mesh, head: CR_REST, warned: -1, hitCyc: -1, landed: -1 })
    }
    for (const ln of t.lanes) {
      const lamp = buildLaneLamp()
      const topY = groundAt(host.map, ln.x, ln.z)
      lamp.root.position.set(ln.x - ln.dx * 0.1 + ln.dz * 0.75, topY + 2.35, ln.z - ln.dz * 0.1 + ln.dx * 0.75)
      host.propParent(ln.x, ln.z).add(lamp.root)
      const rt: LaneRt = { def: ln, mat: lamp.mat, fired: -1, topY }
      this.lanes.push(rt)
      for (let n = 0; n < 2; n++) {
        // The blaze sector rolls ember barrels, every other one scrap balls.
        const mesh = th.id === 'blaze' ? buildEmberBarrel(th, BALL_R, ln.dz !== 0) : buildScrapBall(th, BALL_R)
        mesh.root.visible = false
        host.propParent(ln.x, ln.z).add(mesh.root)
        this.balls.push({ active: false, lane: null, s: 0, v: 0, x: 0, y: 0, z: 0, vy: 0, sink: 0, hit: false, mesh })
      }
    }
    for (const r of t.rewards) {
      const root = new Group()
      // A borrowed-weapon ledge is `sim/borrowed.ts`'s to draw, pay and save;
      // it keeps its place in the list so the snapshot's indices hold.
      if (r.kind === 'weapon') {
        this.rewards.push({ def: r, root, taken: false })
        continue
      }
      if (r.kind === 'bolts') {
        for (let n = 0; n < 3; n++) {
          const b = buildBolt()
          const a = (n / 3) * Math.PI * 2
          b.root.position.set(Math.cos(a) * 0.35, 0, Math.sin(a) * 0.35)
          root.add(b.root)
        }
      } else {
        root.add(buildCapsule(r.kind === 'hp' ? 'hp' : 'we', true).root)
      }
      root.position.set(r.x, r.y + 0.75, r.z)
      host.propParent(r.x, r.z).add(root)
      this.rewards.push({ def: r, root, taken: false })
    }
    for (const sp of t.secrets ?? []) this.secrets.push(this.sealSecret(sp))
    this.features = buildStageFeatures(host, t, this)
  }

  /**
   * Wall a secret alcove off: a slab on every face between an alcove cell
   * and the open floor around it — the false wall's the only one that ever
   * opens — and no path into it (the objective trail, the tap-to-move).
   */
  private sealSecret(def: SecretSpec): SecretRt {
    const map = this.host.map
    const nav = this.host.nav
    const W = map.w
    const face = secretDoorFace(map, def)
    let door: Slab | null = null
    for (const k of def.cells) {
      nav.pathBlock[k] = 2
      const i = k % W
      const j = (k - i) / W
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const ni = i + di
        const nj = j + dj
        if (ni < 0 || nj < 0 || ni >= W || nj >= map.h) continue
        const nk = nj * W + ni
        if (map.cell[nk] === Cell.Void || def.cells.includes(nk)) continue
        const x = (i + (di > 0 ? 1 : 0)) * CELL
        const z = (j + (dj > 0 ? 1 : 0)) * CELL
        const slab: Slab = di
          ? { minX: x - SECRET_WALL, maxX: x + SECRET_WALL, minZ: j * CELL, maxZ: (j + 1) * CELL, active: true }
          : { minX: i * CELL, maxX: (i + 1) * CELL, minZ: z - SECRET_WALL, maxZ: z + SECRET_WALL, active: true }
        nav.slabs.push(slab)
        if (i === face.i && j === face.j && di === face.di && dj === face.dj) door = slab
      }
    }
    return { def, door: door ?? { minX: 0, maxX: 0, minZ: 0, maxZ: 0, active: false }, open: false }
  }

  /** Solved: the false wall of secret `n` gives way — bodies, sight and
   *  paths pass, and the mesh's wall goes (`hideWall`: false when the
   *  runtime sinks it itself first). */
  openSecret(n: number, hideWall = true): void {
    const s = this.secrets[n]
    if (!s || s.open) return
    s.open = true
    s.door.active = false
    for (const k of s.def.cells) this.host.nav.pathBlock[k] = 0
    const wall = this.host.level.secretWalls?.[n]
    if (wall && hideWall) wall.visible = false
  }

  secretOpen(n: number): boolean {
    return !!this.secrets[n]?.open
  }

  /** The walk bent where Flux stands (ice, wind): a shared scratch, valid
   *  until the next call. */
  moveMod(p: ClimbBody): MoveMod {
    const m = this.mod
    m.friction = 1
    m.pushX = 0
    m.pushZ = 0
    m.speed = 1
    for (const f of this.features) f.move?.(p, m)
    m.pushX += this.pullX
    m.pushZ += this.pullZ
    return m
  }

  /** The mission's boss pull for this step (`Mission.pull`). */
  setPull(x: number, z: number): void {
    this.pullX = x
    this.pullZ = z
  }

  /** A player shot met something solid of a stage feature's (an ice
   *  pillar). */
  /** A feature's hazard within r (m) of (x, z) (`StageFeature.hazardNear`). */
  hazardNear(x: number, z: number, r: number): boolean {
    for (const f of this.features) if (f.hazardNear?.(x, z, r)) return true
    return false
  }

  shotHits(x: number, y: number, z: number, r: number, charge: number): boolean {
    for (const f of this.features) if (f.shotHits?.(x, y, z, r, charge)) return true
    return false
  }

  /** A player shot this step (`CombatHost.shotHitsStage`): true when a
   *  feature caught it (a secret's wall button), and the shot ends. */
  shotStep(s: Shot): boolean {
    for (const f of this.features) if (f.shot?.(s)) return true
    return false
  }

  /** A feature has the body (a rail cart): the stick waits. */
  locksMove(): boolean {
    for (const f of this.features) if (f.locksMove?.()) return true
    return false
  }

  // ─── Per step ──────────────────────────────────────────────────────────────

  /** Lifts, crushers, balls, rewards, checkpoints. Before the player moves:
   *  the lifts' motion this step is what carries a rider. */
  update(dt: number, time: number, p: ClimbBody, playing: boolean): void {
    for (const lf of this.lifts) this.stepLift(lf, dt, time, p)
    for (const cr of this.crushers) this.stepCrusher(cr, time, p, playing)
    for (const ln of this.lanes) this.stepLane(ln, time)
    for (const b of this.balls) if (b.active) this.stepBall(b, dt, p, playing)
    for (const f of this.features) f.update(dt, time, p, playing)
    for (const c of this.cues) c.update(p, playing)
    for (const r of this.rewards) {
      if (r.taken || r.def.kind === 'weapon') continue
      r.root.rotation.y += dt * 1.8
      r.root.position.y = r.def.y + 0.75 + Math.sin(time * 2.4) * 0.1
      if (playing && Math.abs(p.y - r.def.y) < 1 && Math.hypot(p.x - r.def.x, p.z - r.def.z) < 1.1) this.take(r)
    }
    if (p.ground && playing) {
      const k = Math.floor(p.z / CELL) * this.host.map.w + Math.floor(p.x / CELL)
      for (let n = this.cp + 1; n < this.t.checkpoints.length; n++) {
        if (!this.t.checkpoints[n]!.cells.includes(k)) continue
        this.cp = n
        const c = this.t.checkpoints[n]!
        this.host.fx.riseRing(c.x, c.y + 0.1, c.z, '#7ff4ff', 0.7, 14)
        this.host.onCheckpoint?.(n)
        break
      }
    }
  }

  private placeLift(lf: LiftRt, x: number, y: number, z: number, first = false): void {
    const pl = lf.plat
    pl.dx = first ? 0 : x - lf.x
    pl.dz = first ? 0 : z - lf.z
    lf.x = x
    lf.y = y
    lf.z = z
    pl.x0 = x - lf.def.hw
    pl.x1 = x + lf.def.hw
    pl.z0 = z - lf.def.hd
    pl.z1 = z + lf.def.hd
    pl.top = y
    lf.mesh.root.position.set(x, y, z)
    if (lf.mesh.column) lf.mesh.column.scale.y = Math.max(0.1, y - 0.5 - lf.bottom)
  }

  private stepLift(lf: LiftRt, dt: number, time: number, p: ClimbBody): void {
    const d = lf.def
    let k: number
    if (d.kind === 'h' || d.loop) {
      // A loop on the mission clock: wait at A, go, wait at B, come back
      // (a shuttle across, or a bobbing platform up and down).
      const leg = d.travel + d.wait
      const u = ((time + d.phase) % (leg * 2) + leg * 2) % (leg * 2)
      if (u < d.wait) k = 0
      else if (u < leg) k = ease((u - d.wait) / d.travel)
      else if (u < leg + d.wait) k = 1
      else k = 1 - ease((u - leg - d.wait) / d.travel)
      lf.moving = (u >= d.wait && u < leg) || u >= leg + d.wait
    } else {
      // Rides up once stood on for a beat; comes home once left alone.
      const on = p.ground && p.plat === lf.platIdx
      if (lf.state === 0) {
        lf.ride = on ? lf.ride + dt : 0
        if (lf.ride > 0.35) { lf.state = 1; lf.t = 0; this.host.sfx('door', lf.x, lf.z) }
      } else if (lf.state === 2) {
        lf.ride = on ? 0 : lf.ride + dt
        if (lf.ride > d.wait) { lf.state = 3; lf.t = 0; this.host.sfx('door', lf.x, lf.z) }
      } else {
        lf.t += dt
        if (lf.t >= d.travel) { lf.state = lf.state === 1 ? 2 : 0; lf.ride = 0 }
      }
      const f = Math.min(1, lf.t / d.travel)
      k = lf.state === 0 ? 0 : lf.state === 2 ? 1 : lf.state === 1 ? ease(f) : 1 - ease(f)
      lf.moving = lf.state === 1 || lf.state === 3
    }
    this.placeLift(lf, d.ax + (d.bx - d.ax) * k, d.ay + (d.by - d.ay) * k, d.az + (d.bz - d.az) * k)
    const blink = lf.moving && Math.floor(time * 6 + lf.idx) % 2 === 0
    lf.mesh.lampMat.color.copy(lf.moving ? (blink ? LAMP.move : LAMP.moveDim) : LAMP.rest)
  }

  private stepCrusher(cr: CrusherRt, time: number, p: ClimbBody, playing: boolean): void {
    const d = cr.def
    const period = Math.max(d.period, CR_WARN + CR_SLAM + CR_HOLD + CR_RISE + 0.1)
    const clock = time + d.phase
    const cyc = Math.floor(clock / period)
    const u = clock - cyc * period
    const tSlam = CR_WARN
    const tHold = tSlam + CR_SLAM
    const tRise = tHold + CR_HOLD
    const tIdle = tRise + CR_RISE
    let head: number
    if (u < tSlam) head = CR_REST + Math.sin(u * 70) * 0.03 * (u / tSlam)
    else if (u < tHold) { const k = (u - tSlam) / CR_SLAM; head = CR_REST * (1 - k * k) }
    else if (u < tRise) head = 0
    else if (u < tIdle) head = CR_REST * ease((u - tRise) / CR_RISE)
    else head = CR_REST
    cr.head = head
    cr.mesh.head.position.y = head
    cr.mesh.rod.position.y = head + 1.3
    cr.mesh.rod.scale.y = Math.max(0.05, CR_BEAM - head - 1.3)
    cr.slab.active = head < BODY_H
    // Telegraph: the lamp blinks red, a click, a ring on the walkway.
    const warning = u < tSlam
    cr.mesh.lampMat.color.copy(warning ? (Math.floor(u * 10) % 2 ? LAMP.warn : LAMP.warnDim) : head < CR_REST - 0.1 ? LAMP.hot : LAMP.idle)
    if (warning && cr.warned !== cyc) {
      cr.warned = cyc
      this.host.sfx('trapClick', cr.x, cr.z)
      if (playing && Math.hypot(p.x - cr.x, p.z - cr.z) < 9) this.host.say('warn.crusher')
      this.host.markers.spawn(cr.x, cr.z, 1.35, CR_WARN + CR_SLAM)
    }
    // The slam: whoever is under the head as it comes down.
    if (playing && u >= tSlam && u < tRise && head < p.y - d.y + BODY_H && cr.hitCyc !== cyc && Math.abs(p.y - d.y) < 1.2) {
      const r = PLAYER_R * 0.7
      if (Math.abs(p.x - cr.x) < CR_SIZE / 2 + r && Math.abs(p.z - cr.z) < CR_SIZE / 2 + r) {
        cr.hitCyc = cyc
        this.host.hitPlayer(null, Math.round(this.host.combat.maxHp * CR_COST), { blockable: false, fromX: cr.x, fromZ: cr.z, kind: 'aoe', hazard: 'crush' })
      }
    }
    if (u >= tSlam && u < tRise) {
      this.host.hurtMachines?.(CR_COST, cr.x, cr.z, (x, y, z) => Math.abs(y - d.y) < 1.2 &&
        Math.abs(x - cr.x) < CR_SIZE / 2 + 0.4 && Math.abs(z - cr.z) < CR_SIZE / 2 + 0.4)
    }
    if (u >= tHold && cr.landed !== cyc) {
      cr.landed = cyc
      this.host.sfx('stomp', cr.x, cr.z)
      const dd = Math.hypot(p.x - cr.x, p.z - cr.z)
      if (dd < 10) this.host.shake(0.28 * (1 - dd / 10))
      this.host.shocks.spawn(cr.x, d.y + 0.05, cr.z, 2.2, '#ffd9a0', 0.35)
      this.host.fx.sparks(cr.x, d.y + 0.2, cr.z, '#ffd9a0', 14, 6, 0.2)
    }
  }

  private stepLane(ln: LaneRt, time: number): void {
    const d = ln.def
    const n = Math.floor((time - d.phase) / d.period)
    const next = (n + 1) * d.period + d.phase
    const toGo = next - time
    // Lamp: dark, amber in the last BALL_WARN, red blinking in its last half.
    if (toGo < BALL_WARN) ln.mat.color.copy(toGo < BALL_WARN / 2 ? (Math.floor(toGo * 12) % 2 ? LAMP.laneRed : LAMP.laneRedDim) : LAMP.laneAmber)
    else ln.mat.color.copy(LAMP.laneOff)
    if (n > ln.fired) {
      const first = ln.fired < 0
      ln.fired = n
      if (!first) this.release(ln)
    }
  }

  private release(ln: LaneRt): void {
    let b: BallRt | null = null
    for (const x of this.balls) if (!x.active) { b = x; break }
    if (!b) return
    const d = ln.def
    b.active = true
    b.lane = ln
    b.s = -1
    b.v = BALL_V0
    b.x = d.x
    b.z = d.z
    b.y = ln.topY + BALL_HATCH
    b.vy = 0
    b.sink = 0
    b.hit = false
    b.mesh.root.visible = true
    b.mesh.root.scale.setScalar(1)
    b.mesh.root.position.set(b.x, b.y, b.z)
    this.host.sfx('lob', d.x, d.z)
  }

  private stepBall(b: BallRt, dt: number, p: ClimbBody, playing: boolean): void {
    const d = b.lane!.def
    const map = this.host.map
    if (b.sink > 0) {
      // Into the gutter: down and gone.
      b.sink += dt
      b.y -= dt * 5
      b.mesh.root.scale.setScalar(Math.max(0.01, 1 - b.sink * 3))
      if (b.sink > 0.35) { b.active = false; b.mesh.root.visible = false }
    } else if (b.s < 0) {
      // Dropping out of the hatch onto the top of the stairs.
      b.vy -= GRAVITY * dt
      b.y += b.vy * dt
      const g = groundAt(map, b.x, b.z) + BALL_R
      if (b.y <= g) {
        b.y = g
        b.s = 0
        this.host.sfx('stomp', b.x, b.z)
      }
    } else {
      b.v = Math.min(BALL_VMAX, b.v + BALL_ACC * dt)
      b.s += b.v * dt
      b.x = d.x + d.dx * b.s
      b.z = d.z + d.dz * b.s
      b.y = groundAt(map, b.x - d.dx * 0.3, b.z - d.dz * 0.3) + BALL_R
      // Roll: spin about the axle across the lane.
      if (d.dx) b.mesh.spin.rotation.z += (b.v * dt / BALL_R) * (d.dx > 0 ? -1 : 1)
      else b.mesh.spin.rotation.x += (b.v * dt / BALL_R) * (d.dz > 0 ? 1 : -1)
      if (b.s >= d.len + 0.5) {
        b.sink = 1e-3
        this.host.fx.sparks(b.x, b.y, b.z, '#ffd9a0', 10, 5, 0.18)
        this.host.sfx('bonk', b.x, b.z)
      }
    }
    b.mesh.root.position.set(b.x, b.y, b.z)
    if (b.sink <= 0) {
      this.host.hurtMachines?.(BALL_COST, b.x, b.z, (x, y, z) =>
        (x - b.x) ** 2 + (z - b.z) ** 2 < (BALL_R + 0.5) ** 2 && b.y - BALL_R < y + BODY_H && b.y + BALL_R > y)
    }
    if (!playing || b.hit || b.sink > 0) return
    const dx = p.x - b.x
    const dz = p.z - b.z
    const reach = BALL_R + PLAYER_R * 0.75
    if (dx * dx + dz * dz < reach * reach && b.y - BALL_R < p.y + BODY_H && b.y + BALL_R > p.y) {
      b.hit = true
      const r = this.host.hitPlayer(null, Math.round(this.host.combat.maxHp * BALL_COST), { blockable: false, fromX: b.x - d.dx, fromZ: b.z - d.dz, kind: 'aoe', hazard: 'crush' })
      if (r === 'hit') {
        // Bowled aside, across the lane.
        const side = (dx * -d.dz + dz * d.dx) >= 0 ? 1 : -1
        p.vx += -d.dz * side * 5
        p.vz += d.dx * side * 5
      }
    }
  }

  private take(r: RewardRt): void {
    r.taken = true
    r.root.visible = false
    const d = r.def
    this.host.fx.riseRing(d.x, d.y + 0.2, d.z, '#8dff7a', 0.7, 16)
    if (d.kind === 'bolts') {
      const v = 12 + this.level * 5
      for (let n = 0; n < 3; n++) this.host.onPickup('bolt', v)
    } else {
      this.host.onPickup(d.kind === 'hp' ? 'hpBig' : 'weBig', 0)
    }
  }

  // ─── The player's body ─────────────────────────────────────────────────────

  /**
   * One step of Flux's body: the ladder he is on, the step off its top, a
   * ladder to grab, the platform carrying him, the walk (`moveBody`), then
   * gravity. `p.vx/vz` are already blended toward the wanted velocity;
   * `wx, wz` are the stick in world space (−1..1: toward a ladder's wall is
   * up). Writes the new x, z to `out` (the mission applies them) and sets
   * `pitted` / `pitDark` / `landSpeed`.
   */
  stepBody(p: ClimbBody, out: [number, number], wx: number, wz: number, dt: number, sliding: boolean): void {
    this.pitted = false
    this.pitDark = 0
    this.landSpeed = 0
    this.leapt = false
    this.edgeLeapt = false
    const nav = this.host.nav
    for (const f of this.features) if (f.carry?.(p, out, dt)) return
    if (p.ladder >= 0) {
      this.climbLadder(p, out, wx, wz, dt)
      return
    }
    if (p.mantle > 0) {
      const k = Math.min(1, dt / p.mantle)
      out[0] = p.x + (p.mx - p.x) * k
      out[1] = p.z + (p.mz - p.z) * k
      p.mantle -= dt
      p.vx = 0
      p.vz = 0
      return
    }
    if (p.ground && !sliding && this.tryMount(p, wx, wz)) {
      out[0] = p.x
      out[1] = p.z
      return
    }
    let x = p.x
    let z = p.z
    if (p.ground && p.plat >= 0) {
      const pl = nav.plats![p.plat]
      if (pl) { x += pl.dx; z += pl.dz }
    }
    const m = this.moveMod(p)
    moveBody(nav, x, z, p.y, (p.vx + m.pushX) * dt, (p.vz + m.pushZ) * dt, PLAYER_R, out)
    const sup = floorAt(nav, out[0], out[1], p.y)
    if (p.ground) {
      if (sup >= p.y - SNAP) {
        p.y = sup
        p.vy = 0
        p.air = 0
      } else if (sliding && sup === -Infinity) {
        // The dash leap: off the edge in a slide, a hop, and the slide's
        // momentum (capped) carries over the gap.
        p.ground = false
        p.vy = LEAP_VY
        p.air = 0
        const v = Math.hypot(p.vx, p.vz)
        if (v > LEAP_SPEED) {
          p.vx *= LEAP_SPEED / v
          p.vz *= LEAP_SPEED / v
        }
        this.leapt = true
      } else if (!sliding && sup === -Infinity && this.edgeLeap(p, out)) {
        // The edge-leap: walked into a gap with a floor in reach ahead, Flux
        // runs off the lip and leaps for it (there is no jump button — an
        // edge IS the jump). Falling in is for gaps with nothing to reach.
        this.leapt = true
        this.edgeLeapt = true
        this.edgeFlight = true
      } else if (sup === -Infinity && p.air < COYOTE) {
        p.air += dt
      } else {
        p.ground = false
        p.vy = 0
      }
    }
    if (!p.ground) {
      p.vy = Math.max(-MAX_FALL, p.vy - GRAVITY * dt)
      p.y += p.vy * dt
      if (p.y <= sup) {
        this.edgeFlight = false
        this.landSpeed = -p.vy
        p.y = sup
        p.vy = 0
        p.ground = true
        p.air = 0
      }
    }
    p.plat = p.ground ? platUnder(nav, out[0], out[1], p.y) : -1
    if (p.ground && p.air === 0) p.safeY = p.y
    // A pit: over a pit cell, with nothing to land on before the pit's own
    // floor. (It used to ask for "no surface at all there", and a crumbled
    // slab is still a surface to the nav, parked far below the level: Flux
    // ran into the gap it left and fell for ever, with no rescue.)
    const drop = p.safeY - p.y
    const bed = this.pitFloor(out[0], out[1])
    if (!p.ground && groundAt(this.host.map, out[0], out[1]) === -Infinity &&
      floorAt(nav, out[0], out[1], p.y) < (bed > -Infinity ? bed : p.y - PARKED)) {
      // The pit's own floor (its spikes, its lava) is solid: he lands on it.
      // A pit with none (open sky) takes him once he is well under the edge.
      const depth = bed > -Infinity ? Math.max(0.5, p.safeY - bed) : PIT_DROP
      this.pitDark = clamp(drop / depth, 0, 1)
      if (bed > -Infinity ? p.y <= bed : drop > PIT_DROP) {
        if (bed > -Infinity) p.y = bed
        this.pitFell(out)
      }
    } else if (!p.ground && drop > FALL_LIMIT) {
      // The last net: no fall goes on for ever, whatever is under him.
      this.pitFell(out)
    }
  }

  /** Flux is in the pit at `out`: the mission takes it from here (`pitFall`). */
  private pitFell(out: [number, number]): void {
    this.pitted = true
    const map = this.host.map
    const i = Math.floor(out[0] / CELL)
    const j = Math.floor(out[1] / CELL)
    const r = i >= 0 && j >= 0 && i < map.w && j < map.h ? map.room[j * map.w + i]! : -1
    // Lava costs twice a fall; spikes are the plain fall made visible.
    this.pitCost = pitKindOf(this.t, r) === 'lava' ? PIT_COST * HOT_PIT : PIT_COST
  }

  /**
   * A wall-kick (the Blackout Boulevard's shaft, a `kick` ladder): a slide
   * at its foot facing the wall kicks Flux up the shaft, and each slide
   * after that, on it, kicks him KICK_UP higher; between kicks he slips
   * back down. True when the slide was a kick (the mission then slides no
   * further).
   */
  kick(p: ClimbBody): boolean {
    if (p.ladder >= 0) {
      const L = this.ladders[p.ladder]!
      if (!L.def.kick) return false
      this.kickTo = Math.min(L.def.y1, Math.max(this.kickTo, p.y) + KICK_UP)
      this.host.sfx('jump', L.ex, L.ez)
      this.host.fx.sparks(L.ex, p.y + 0.4, L.ez, this.host.theme.accent, 6, 4, 0.16)
      return true
    }
    if (!p.ground) return false
    for (let n = 0; n < this.ladders.length; n++) {
      const L = this.ladders[n]!
      if (!L.def.kick) continue
      const rx = p.x - L.ex
      const rz = p.z - L.ez
      if (Math.abs(rx * L.ax + rz * L.az) > 0.95) continue
      const d = rx * L.nx + rz * L.nz
      // At the foot, facing the wall.
      const face = -(-Math.sin(p.yaw) * L.nx - Math.cos(p.yaw) * L.nz)
      if (Math.abs(p.y - L.def.y0) > 0.35 || d <= 0 || d > PLAYER_R + 0.6 || face < 0.5) continue
      p.ladder = n
      p.ground = false
      p.vx = 0
      p.vz = 0
      p.vy = 0
      p.plat = -1
      p.path = null
      this.kickTo = Math.min(L.def.y1, p.y + KICK_UP)
      this.host.sfx('jump', L.ex, L.ez)
      return true
    }
    return false
  }

  /** Grab a ladder: at its foot pushing toward the wall, or at its top
   *  walking off the edge above it. */
  private tryMount(p: ClimbBody, wx: number, wz: number): boolean {
    for (let n = 0; n < this.ladders.length; n++) {
      const L = this.ladders[n]!
      if (L.def.kick) continue
      const rx = p.x - L.ex
      const rz = p.z - L.ez
      if (Math.abs(rx * L.ax + rz * L.az) > 0.95) continue
      const d = rx * L.nx + rz * L.nz
      const push = -(wx * L.nx + wz * L.nz)
      if (Math.abs(p.y - L.def.y0) < 0.35 && d > 0 && d < PLAYER_R + 0.45 && push > 0.35) {
        p.y = L.def.y0
      } else if (Math.abs(p.y - L.def.y1) < 0.35 && d < 0 && d > -1.3 && push < -0.35) {
        p.y = L.def.y1 - 0.05
      } else continue
      p.ladder = n
      p.ground = false
      p.vx = 0
      p.vz = 0
      p.vy = 0
      p.plat = -1
      p.path = null
      this.host.sfx('tink', L.ex, L.ez)
      return true
    }
    return false
  }

  private climbLadder(p: ClimbBody, out: [number, number], wx: number, wz: number, dt: number): void {
    const L = this.ladders[p.ladder]!
    const kick = !!L.def.kick
    // A kick shaft: the stick does nothing; each kick lifts him toward
    // `kickTo`, and between kicks he slips back down the wall.
    const push = kick ? (p.y >= L.def.y1 - 0.05 ? 1 : 0) : -(wx * L.nx + wz * L.nz)
    const k = Math.min(1, dt * 14)
    out[0] = p.x + (L.standX - p.x) * k
    out[1] = p.z + (L.standZ - p.z) * k
    p.vx = 0
    p.vz = 0
    p.vy = 0
    if (kick) {
      if (this.kickTo > p.y + 0.01) p.y = Math.min(this.kickTo, p.y + KICK_SPEED * dt)
      else { p.y -= KICK_SLIP * dt; this.kickTo = p.y }
    } else if (Math.abs(push) > 0.2) p.y += push * CLIMB_SPEED * dt
    if (p.y >= L.def.y1 - 0.02) {
      p.y = L.def.y1 - 0.02
      if (push > 0.2) {
        // Over the top: step off onto the ledge.
        p.ladder = -1
        p.y = L.def.y1
        p.ground = true
        p.air = 0
        p.safeY = p.y
        p.mantle = 0.2
        p.mx = L.topX
        p.mz = L.topZ
      }
    } else if (p.y <= L.def.y0) {
      p.y = L.def.y0
      p.ladder = -1
      p.ground = true
      p.air = 0
      p.safeY = p.y
    }
  }

  /** Slide on a ladder: let go and drop off it, backward. */
  letGo(p: ClimbBody): void {
    const L = this.ladders[p.ladder]
    if (!L) return
    p.ladder = -1
    p.ground = false
    p.vy = 0
    p.vx = L.nx * 3
    p.vz = L.nz * 3
  }

  /** Slide is a ground move: not in the air, on a ladder or stepping off one. */
  /**
   * The edge-leap's test and launch. Walking at the edge (at least EDGE_MIN
   * m/s along the stick), look ahead along the walk for a floor no lower
   * than EDGE_DROP under the feet within EDGE_REACH: found, the body leaves
   * the lip with LEAP_VY up and just the speed that carries it EDGE_OVER
   * past that floor's near edge (capped at LEAP_SPEED); none, no leap.
   */
  private edgeLeap(p: ClimbBody, at: [number, number]): boolean {
    const v = Math.hypot(p.vx, p.vz)
    if (v < EDGE_MIN) return false
    const dx = p.vx / v
    const dz = p.vz / v
    const nav = this.host.nav
    for (let d = 0.8; d <= EDGE_REACH; d += 0.3) {
      const fy = floorAt(nav, at[0] + dx * d, at[1] + dz * d, p.y + STEP_UP)
      if (fy === -Infinity || fy < p.y - EDGE_DROP || fy > p.y + STEP_UP) continue
      const speed = Math.min(LEAP_SPEED, Math.max(v, (d + EDGE_OVER) / EDGE_FLIGHT))
      p.ground = false
      p.vy = LEAP_VY
      p.air = 0
      p.vx = dx * speed
      p.vz = dz * speed
      return true
    }
    return false
  }

  canSlide(p: ClimbBody): boolean {
    return p.ground && p.ladder < 0 && p.mantle <= 0
  }

  /** Where a pit fall (or a resume) puts Flux back. */
  /** The floor of the pit under (x, z) that Flux lands on — its spikes or
   *  lava — or −∞ for a pit that falls off the level (no floor to show). */
  pitFloor(x: number, z: number): number {
    const map = this.host.map
    const i = Math.floor(x / CELL)
    const j = Math.floor(z / CELL)
    const r = i >= 0 && j >= 0 && i < map.w && j < map.h ? map.room[j * map.w + i]! : -1
    const kind = pitKindOf(this.t, r)
    if (kind !== 'spikes' && kind !== 'lava') return -Infinity
    return this.t.pitBottom[r] ?? PIT_FLOOR_Y
  }

  respawn(): { x: number; z: number; y: number; yaw: number } {
    const c = this.t.checkpoints[this.cp]
    if (c) return c
    const s = this.host.map.start
    return { x: s.x, z: s.z, y: groundAt(this.host.map, s.x, s.z), yaw: s.yaw }
  }

  /** The climb's machines stay on their own platform; a flyer rises and
   *  sinks through its band after the player. */
  tendFoe(e: Enemy, playerY: number, dt: number): void {
    const l = e.leash
    if (l) {
      e.x = clamp(e.x, l[0], l[2])
      e.z = clamp(e.z, l[1], l[3])
    }
    // Never into a block of terrain taller than its body is high: a drone
    // backing off after a swoop sank into the Sky Docks' raised decks (the
    // 2-D wall test only knows walls, not floor heights). Such a step is
    // undone, the way a wall stops it.
    if (e.state !== 'dead') {
      const g = groundAt(this.host.map, e.x, e.z)
      const body = (e.floor ?? 0) + Math.max(0, e.y) - 0.25
      if (g > body + STEP_UP && g > (e.floor ?? 0) + STEP_UP) {
        e.x = e.px
        e.z = e.pz
      }
    }
    const h = e.hover
    if (h && e.state !== 'dead') {
      const want = clamp(playerY, h[0], h[1])
      const f = e.floor ?? 0
      e.floor = f + clamp(want - f, -2.4 * dt, 2.4 * dt)
    }
  }

  save(): ClimbSave {
    const got: number[] = []
    this.rewards.forEach((r, i) => { if (r.taken) got.push(i) })
    const s: ClimbSave = { cp: this.cp, got }
    if (this.secrets.length) {
      s.open = []
      this.secrets.forEach((x, i) => { if (x.open) s.open!.push(i) })
    }
    if (this.features.length) s.feat = this.features.map(f => f.save?.() ?? null)
    return s
  }

  restore(s: ClimbSave | undefined): void {
    if (!s) return
    this.cp = Math.max(-1, Math.min(this.t.checkpoints.length - 1, Math.round(s.cp)))
    for (const i of s.got ?? []) {
      const r = this.rewards[i]
      if (!r) continue
      r.taken = true
      r.root.visible = false
    }
    for (const i of s.open ?? []) this.openSecret(i)
    this.features.forEach((f, i) => { if (s.feat && s.feat[i] != null) f.restore?.(s.feat[i]) })
  }

  dispose(): void {
    for (const f of this.features) f.dispose?.()
  }
}
