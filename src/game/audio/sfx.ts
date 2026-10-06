/**
 * SFX entry point. Every gameplay sound goes through `sfx(name, pan, gain)`;
 * the chiptune synthesizer behind it lands in the audio chunk. Until then this
 * is a registry the synth plugs into, so call sites are already final.
 *
 * `muffle` (0..1) low-passes the sound: a source behind the listener
 * (`state/damageFeed.ts`), which a pan alone cannot tell from one in front.
 */
export type SfxName =
  | 'shoot' | 'charge1' | 'charge2' | 'charge3' | 'chargeShot' | 'chargeShotBig' | 'hit' | 'hitHeavy' | 'crit' | 'tink'
  | 'guardBreak' | 'explode' | 'enemyShot' | 'lob' | 'jump' | 'stomp' | 'dash' | 'bonk' | 'punch' | 'alert'
  | 'hurt' | 'block' | 'parry' | 'guardCrack' | 'slide' | 'bolt' | 'heal' | 'energy' | 'door' | 'beamIn'
  | 'beamOut' | 'levelUp' | 'chestOpen' | 'loot' | 'tank' | 'weapon' | 'denied' | 'uiClick' | 'uiOpen'
  | 'objective' | 'bossIntro' | 'death' | 'locate' | 'bossWarn' | 'thunder'
  | 'attrPick'
  | 'trapHiss' | 'flameJet' | 'bladeWhoosh' | 'trapClick'
  // The Sky Docks' wind tunnel (`sim/stages/wind.ts`)
  | 'gust'
  | 'borrowGet' | 'borrowSpent'
  | 'droneArrive' | 'droneHum' | 'droneHumHi' | 'deckLand' | 'liftOff'
  | 'whizz'
  | 'fumble'
  // The intro cutscene (`story/introScript.ts`)
  | 'synthPulse' | 'tapeRewind' | 'relayChime' | 'vexGlitch' | 'relayOut' | 'alarm' | 'capsule' | 'freeze'
  | 'heartbeat' | 'pipChirp' | 'bootUp' | 'uiClose'

type Player = (name: SfxName, pan: number, gain: number, muffle: number) => void
let player: Player | null = null

export const setSfxPlayer = (p: Player | null): void => { player = p }

/** DEV only: a listener that hears every sound the game asks for, played or
 *  not — the trailer recorder logs them and renders them offline
 *  (`game/trailer.ts`, tools/cinematic-trailer). */
let tap: Player | null = null
export const setSfxTap = (t: Player | null): void => { if (import.meta.env.DEV) tap = t }

export const sfx = (name: SfxName | string, pan = 0, gain = 1, muffle = 0): void => {
  const p = Math.max(-1, Math.min(1, pan))
  const m = Math.max(0, Math.min(1, muffle))
  if (import.meta.env.DEV) tap?.(name as SfxName, p, gain, m)
  player?.(name as SfxName, p, gain, m)
}
