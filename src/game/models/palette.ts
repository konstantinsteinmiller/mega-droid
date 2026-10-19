/**
 * Shared palette. Saturated primaries in the spirit of the 8-bit era, lifted
 * for a lit 3D render. Everything that has a "signature colour" pulls it from
 * here so the HUD, particles and models agree.
 */
export const PAL = {
  // Flux: pearl armour shells over a graphite undersuit, lit by one warm
  // plasma. Gear repaints the shells and the plasma (`HeroColors`); the suit,
  // visor and steel never change, so every kit still reads as him.
  heroPearl: '#f5f4f1',
  heroSuit: '#3a3f4b',
  heroSuitDeep: '#252932',
  heroVisor: '#161a22',
  heroVisorHi: '#3a4250',
  heroSteel: '#c3cad4',
  heroPlasma: '#ffa733',
  heroPlasmaHot: '#fff0cc',
  // The lab's blue and cyan: Pip and the hub (Flux wore them until his redesign)
  labBlue: '#2468f0',
  labCyan: '#4fd8ff',
  // Cartoon eyes (machines, masters)
  eyeWhite: '#ffffff',
  pupil: '#0b1433',
  // Generic machine tones
  steel: '#9aa7bd',
  steelDark: '#5d6a82',
  gunmetal: '#3b4458',
  black: '#1a1f2e',
  white: '#f4f7ff',
  // Enemy signatures
  hardhat: '#ffc21a',
  hardhatDeep: '#e08a00',
  trooper: '#3fae4a',
  trooperDeep: '#26732f',
  heli: '#e83a3a',
  heliDeep: '#a51f2c',
  hopper: '#9150e0',
  hopperDeep: '#5c2ca0',
  roller: '#ff8a1f',
  rollerDeep: '#c25a00',
  brute: '#8f9bb3',
  bruteDeep: '#56617a',
  turret: '#4bb3a8',
  // Glows
  glowCyan: '#7ff4ff',
  glowRed: '#ff4050',
  glowPink: '#ff5fb0',
  glowYellow: '#fff27a',
  glowGreen: '#8dff7a',
  glowOrange: '#ffb04a',
  glowPurple: '#d38bff'
} as const

/** Rarity colours for gear (shared by loot beams, UI frames, text). */
export const RARITY_COLOR = {
  standard: '#e8edf7',
  tuned: '#4aa8ff',
  prototype: '#b46cff',
  legendary: '#ff9a2e'
} as const
