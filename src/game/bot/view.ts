import type { Mission } from '../sim/mission'
import type { Enemy } from '../sim/world'
import type { Input } from '../engine/input'
import type { Nav } from '../world/nav'
import type { MapData } from '../world/levelGen'

/**
 * What the bot reads of a running mission. The mission keeps most of it
 * private; the bot is a player with a debugger, so it looks anyway, through
 * this one cast. Read-only by convention: the bot acts through `input`
 * (and, for aim, through `player.yaw` / `player.pitch`, which is what a
 * mouse does).
 */
export interface BotMission {
  /** The eye: a shot flies where THIS points (render writes it from the player's yaw each frame; a headless run never renders). */
  readonly camera: { position: { set(x: number, y: number, z: number): unknown }; rotation: { order: string; set(x: number, y: number, z: number): unknown }; updateMatrixWorld(): void }
  readonly input: Input
  readonly map: MapData
  readonly nav: Nav
  readonly time: number
  readonly enemies: Enemy[]
  readonly boss: Enemy | null
  readonly bossStarted: boolean
  readonly doors: Array<{
    id: number; x: number; z: number; y: number; open: number; opening: boolean; locked: boolean; held: boolean
    axis: 'x' | 'z'; from: number; to: number
  }>
  readonly player: {
    x: number; y: number; z: number; vx: number; vz: number; yaw: number; pitch: number
    ground: boolean; ladder: number; plat: number; air: number; path: Array<[number, number]> | null
  }
  readonly combat: {
    hp: number; maxHp: number; power: number; maxPower: number; we: number; maxWe: number
    charging: boolean; charge: number; blocking: boolean; iframes: number; hurtT: number; slideCd: number
    slideT: number; guardBroken: number; fireCd: number; dead: boolean; target: Enemy | null
  }
  readonly objects: {
    chests: Array<{ x: number; y: number; z: number; opened: boolean }>
    objective: { progress: number; count: number; done: boolean }
    npc: { x: number; z: number; rescued: boolean } | null
  }
  readonly walk: null | {
    active: boolean
    goal(): { kind: string; x: number; z: number } | null
    needAt(id: number): string | null
    devPass(): void
  }
  readonly climb: null | {
    cp: number
    t: { checkpoints: Array<{ x: number; y: number; z: number; yaw: number }>; ladders: Array<{ i: number; j: number; di: number; dj: number; y0: number; y1: number; kick?: boolean }> }
  }
  /** The tutorial's lesson props (training drones, the crate). */
  readonly lessons: { target: { x: number; y: number; z: number; alive: boolean } | null; drones: Enemy[]; droneAt: { x: number; z: number } | null; crateAt: { x: number; z: number } | null; crateBroken: boolean }
  /** A freeze-frame (a kill-cam, a lesson's held moment): the world waits for a press. */
  readonly freeze: { active: boolean; shot?: { kind: string } | null }
  /** Held lesson moments that wait for one specific move. */
  readonly blockCue: unknown
  readonly swoopCue: unknown
  readonly slideCue: unknown
  readonly exitLit: boolean
  readonly exitWeapon: string | null
  readonly exitPad: { root: { position: { x: number; y: number; z: number } } } | null
  /** The rooms' doors, for the exit's lesson room. */
  readonly bossWon: boolean
  readonly setup: { tutorial?: boolean; stage?: string; sector: string; climb?: boolean }
  interact: { kind: string; ref: unknown } | null
}

export const asBot = (m: unknown): BotMission => m as BotMission
export type { Mission }
