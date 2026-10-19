// Flux's model (src/game/models/hero.ts) after his redesign, asserted
// without a GPU: the full body and the first-person arm build for every kit
// the gear can put on him, keep the bones the animations pose, stay in the
// old model's vertex budget and never produce a broken vertex (a NaN, or a
// normal the outline hull cannot push along). The starter kit IS the default
// look, and that look is pearl armour, a graphite suit and a warm plasma —
// not the blue helmet and skin face he started with. His head lights (eyes,
// antenna tip) are the brand's amber under every kit; only the body's glows
// follow the cannon.

import { afterAll, describe, expect, it, vi } from 'vitest'
import { Color, SRGBColorSpace, type BufferGeometry } from 'three'
import {
  buildHero, buildViewmodel, animateHeroIdle, animateHeroVictory, DEFAULT_HERO_COLORS, HERO_EYE, type HeroColors
} from '@/game/models/hero'
import { RigBuilder, type Rig } from '@/game/models/kit'
import { coplanarOverlaps } from './coplanar'
import { BASES, BASE_BY_ID, type Item, type Slot } from '@/game/data/items'
import { WEAPONS, WEAPON_IDS, type WeaponId } from '@/game/data/weapons'
import { PAL } from '@/game/models/palette'
import { heroColors, profile } from '@/game/state/profile'

/** The bones `animateHeroIdle` / `animateHeroVictory` pose. */
const BONES = ['hips', 'spine', 'chest', 'head', 'shoulderL', 'elbowL', 'shoulderR', 'elbowR', 'hipL', 'kneeL', 'hipR', 'kneeR']

/** A kit composed the way `profile.heroColors()` does it: starter look, item tints, then a copied weapon's arm. */
const kit = (...ids: string[]): HeroColors => {
  const c: HeroColors = { ...DEFAULT_HERO_COLORS }
  for (const id of ids) {
    const tint = BASE_BY_ID[id]?.tint
    if (tint) Object.assign(c, Object.fromEntries(Object.entries(tint).filter(([, v]) => v)))
    const w = WEAPONS[id as WeaponId]
    if (w) Object.assign(c, { buster: w.shell, core: w.color })
  }
  return c
}

const idsOf = (slot: Slot): string[] => BASES.filter(b => b.slot === slot).map(b => b.id)
const HELMETS = idsOf('helmet')
const CHESTS = idsOf('chest')
const CANNONS = idsOf('buster')
const ARMS = [...CANNONS, ...WEAPON_IDS]

/** Vertices a renderer or the outline hull would choke on. */
const brokenVertices = (g: BufferGeometry): number => {
  const p = g.attributes.position!
  const n = g.attributes.normal!
  let bad = 0
  for (let i = 0; i < p.count; i++) {
    const v = [p.getX(i), p.getY(i), p.getZ(i), n.getX(i), n.getY(i), n.getZ(i)]
    if (!v.every(Number.isFinite) || Math.hypot(v[3]!, v[4]!, v[5]!) < 0.5) bad++
  }
  return bad
}

const hsl = (hex: string) => new Color(hex).getHSL({ h: 0, s: 0, l: 0 }, SRGBColorSpace)

/** A vertex colour (linear) as a comparable key. */
const colourKey = (r: number, g: number, b: number): string => [r, g, b].map(x => x.toFixed(3)).join(',')
const keyOf = (hex: string): string => {
  const c = new Color(hex)
  return colourKey(c.r, c.g, c.b)
}

/** The colours of the unlit (glow) parts, per bone they ride on. */
const glowsByBone = (rig: Rig): Record<string, Set<string>> => {
  const g = rig.mesh.geometry
  const group = g.groups.find(x => x.materialIndex === 1)!
  const col = g.attributes.color!
  const skin = g.attributes.skinIndex!
  const names = rig.mesh.skeleton.bones.map(b => b.name)
  const out: Record<string, Set<string>> = {}
  for (let i = group.start; i < group.start + group.count; i++) {
    const v = g.index!.getX(i)
    const bone = names[skin.getX(v)]!
    ;(out[bone] ??= new Set()).add(colourKey(col.getX(v), col.getY(v), col.getZ(v)))
  }
  return out
}

const dispose = (rig: Rig): void => {
  rig.mesh.geometry.dispose()
  if (rig.outline && rig.outline.geometry !== rig.mesh.geometry) rig.outline.geometry.dispose()
}

/**
 * The default rig, built ONCE. A build is the whole cost of this file (~30 ms
 * idle, several times that under a loaded suite), so every assertion that only
 * reads the default look shares this one.
 */
let defaultRig: Rig | undefined
const baseRig = (): Rig => (defaultRig ??= buildHero())

// ─── What a kit can change ──────────────────────────────────────────────────
//
// A kit is four colours. `buildHero` lays out the same parts in the same order
// whatever they are, and paints each part from one slot or from a fixed colour,
// so a kit can only move the `color` attribute, and only where a slot paints.
// That is not taken on trust: the PROBE kit paints every slot a pure primary no
// part of Flux uses, so each vertex of one build says which slot, if any,
// painted it. Every kit is then a PREDICTION — the default rig's colours with
// each slot's vertices in the kit's colour — and every kit built below is held
// to it vertex by vertex, along with its geometry.

const SLOTS = ['main', 'accent', 'buster', 'core'] as const
const PROBE: HeroColors = { main: '#ff0000', accent: '#00ff00', buster: '#0000ff', core: '#ff00ff' }

/** A hex colour exactly as the model stores it: linear, in a Float32Array. */
const rgb = (hex: string): number[] => new Color(hex).toArray().map(Math.fround)
const isRgb = (a: ArrayLike<number>, v: number, c: readonly number[]): boolean =>
  a[v * 3] === c[0] && a[v * 3 + 1] === c[1] && a[v * 3 + 2] === c[2]

/** The first buffer in which two rigs' geometry differs — or null when it is the same geometry. */
const geometryDiff = (a: Rig, b: Rig): string | null => {
  const same = (x: ArrayLike<number>, y: ArrayLike<number>): boolean => {
    if (x.length !== y.length) return false
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false
    return true
  }
  const ga = a.mesh.geometry
  const gb = b.mesh.geometry
  for (const name of ['position', 'normal', 'skinIndex', 'skinWeight']) {
    if (!same(ga.attributes[name]!.array, gb.attributes[name]!.array)) return name
  }
  if (!same(ga.index!.array, gb.index!.array)) return 'index'
  if (JSON.stringify(ga.groups) !== JSON.stringify(gb.groups)) return 'groups'
  return null
}

interface TintMap {
  probe: Rig
  /** Per vertex: the index in SLOTS of the slot that paints it, or -1 where no kit reaches. */
  slot: Int8Array
  /** Vertices the probe cannot explain: neither in a slot's probe colour over that slot's default, nor unchanged. */
  stray: number[]
}
let tintMap: TintMap | undefined
const tints = (): TintMap => {
  if (tintMap) return tintMap
  const probe = buildHero(PROBE)
  const was = baseRig().mesh.geometry.attributes.color!.array
  const got = probe.mesh.geometry.attributes.color!.array
  const probeRgb = SLOTS.map(s => rgb(PROBE[s]))
  const defaultRgb = SLOTS.map(s => rgb(DEFAULT_HERO_COLORS[s]))
  const slot = new Int8Array(was.length / 3)
  const stray: number[] = []
  for (let v = 0; v < slot.length; v++) {
    const s = probeRgb.findIndex(c => isRgb(got, v, c))
    const explained = s >= 0 ? isRgb(was, v, defaultRgb[s]!) : isRgb(got, v, [was[v * 3]!, was[v * 3 + 1]!, was[v * 3 + 2]!])
    if (!explained) stray.push(v)
    slot[v] = s
  }
  return (tintMap = { probe, slot, stray })
}

/** The colours `k` must produce: the default rig's, with each slot's vertices in the kit's colour. */
const predictedColours = (k: HeroColors): Float32Array => {
  const out = Float32Array.from(baseRig().mesh.geometry.attributes.color!.array)
  const want = SLOTS.map(s => rgb(k[s]))
  const { slot } = tints()
  for (let v = 0; v < slot.length; v++) {
    if (slot[v]! >= 0) out.set(want[slot[v]!]!, v * 3)
  }
  return out
}

/** The first vertex whose colour differs from `want`, or -1. */
const firstWrongColour = (rig: Rig, want: Float32Array): number => {
  const got = rig.mesh.geometry.attributes.color!.array
  if (got.length !== want.length) return 0
  for (let v = 0; v < want.length / 3; v++) {
    if (got[v * 3] !== want[v * 3] || got[v * 3 + 1] !== want[v * 3 + 1] || got[v * 3 + 2] !== want[v * 3 + 2]) return v
  }
  return -1
}

/**
 * The kits built in full: every helmet × arm and every chest × arm pair once,
 * every helmet × chest pair at least twice — 40 of the 160, so any two pieces
 * of gear have been built together. The other combinations are the same
 * geometry with a predicted recolour, pinned by the composition and tint-map
 * tests below.
 */
const BUILT = HELMETS.flatMap((helm, h) => ARMS.map((arm, a) => [helm, CHESTS[(h + a) % CHESTS.length]!, arm] as const))

afterAll(() => {
  if (defaultRig) dispose(defaultRig)
  if (tintMap) dispose(tintMap.probe)
})

describe('the default look', () => {
  it('is what a new player wears: the starter kit composes to DEFAULT_HERO_COLORS', () => {
    expect(heroColors()).toEqual(DEFAULT_HERO_COLORS)
    expect(kit('helm_scout', 'body_light', 'arm_standard', 'boots_basic')).toEqual(DEFAULT_HERO_COLORS)
  })

  it('is pearl armour on a graphite suit with a warm plasma, not blue', () => {
    for (const slot of ['main', 'accent', 'buster'] as const) {
      const { s, l } = hsl(DEFAULT_HERO_COLORS[slot])
      expect(l, slot).toBeGreaterThan(0.85)
      expect(s, slot).toBeLessThan(0.3)
    }
    const core = hsl(DEFAULT_HERO_COLORS.core)
    expect(core.h * 360).toBeGreaterThan(25) // amber/orange: warm, but clear of Vex's red
    expect(core.h * 360).toBeLessThan(50)
    expect(core.s).toBeGreaterThan(0.8)
    const suit = hsl(PAL.heroSuit)
    expect(suit.l).toBeLessThan(0.35)
    expect(suit.s).toBeLessThan(0.2)
  })

  it('has no skin face and no blue armour left anywhere on the model', () => {
    const col = baseRig().mesh.geometry.attributes.color!
    const c = new Color()
    const olds = ['#ffd2a8', '#2468f0', '#4fd8ff'].map(h => new Color(h))
    let hits = 0
    for (let i = 0; i < col.count; i++) {
      c.setRGB(col.getX(i), col.getY(i), col.getZ(i))
      if (olds.some(o => Math.abs(o.r - c.r) + Math.abs(o.g - c.g) + Math.abs(o.b - c.b) < 0.03)) hits++
    }
    expect(hits).toBe(0)
  })

  it('leaves the lab its old blue and cyan (Pip still wears them)', () => {
    expect(PAL.labBlue).toBe('#2468f0')
    expect(PAL.labCyan).toBe('#4fd8ff')
  })
})

describe('gear tints', () => {
  it('are hex colours, and every item in a slot looks different', () => {
    for (const slot of ['buster', 'helmet', 'chest'] as const) {
      const seen = new Set<string>()
      for (const id of idsOf(slot)) {
        const tint = BASE_BY_ID[id]!.tint
        expect(tint, id).toBeDefined()
        for (const v of Object.values(tint!)) expect(v, id).toMatch(/^#[0-9a-f]{6}$/i)
        const key = JSON.stringify(tint)
        expect(seen.has(key), `${id} repeats another ${slot}`).toBe(false)
        seen.add(key)
      }
    }
  })

  it('paint only the slot their piece owns', () => {
    for (const id of HELMETS) expect(Object.keys(BASE_BY_ID[id]!.tint!), id).toEqual(['main'])
    for (const id of CHESTS) expect(Object.keys(BASE_BY_ID[id]!.tint!), id).toEqual(['accent'])
    for (const id of CANNONS) expect(Object.keys(BASE_BY_ID[id]!.tint!).sort(), id).toEqual(['buster', 'core'])
  })

  it('compose on Flux exactly as the game does, for every helmet × chest × arm cannon / copied weapon', () => {
    // `kit` stands in for `heroColors()` everywhere below; pin the two together
    // on the real profile. A copied weapon's arm wins over whichever cannon is
    // on, so each one goes on over a different cannon.
    const saved = { items: profile.inv.items, equipped: { ...profile.inv.equipped }, slots: profile.hero.slots }
    const owned = (base: string): string => `test:${base}`
    profile.inv.items = [...saved.items, ...[...HELMETS, ...CHESTS, ...CANNONS].map((base): Item => ({
      id: owned(base), base, slot: BASE_BY_ID[base]!.slot, rarity: 'standard', ilvl: 1, upg: 0, affixes: []
    }))]
    try {
      let kits = 0
      for (const helm of HELMETS) {
        for (const chest of CHESTS) {
          for (const [i, arm] of ARMS.entries()) {
            const copied = (WEAPON_IDS as string[]).includes(arm)
            profile.inv.equipped.helmet = owned(helm)
            profile.inv.equipped.chest = owned(chest)
            profile.inv.equipped.buster = owned(copied ? CANNONS[i % CANNONS.length]! : arm)
            profile.hero.slots = [copied ? arm as WeaponId : '', '']
            expect(heroColors(), `${helm} ${chest} ${arm}`).toEqual(kit(helm, chest, arm))
            kits++
          }
        }
      }
      expect(kits).toBe(HELMETS.length * CHESTS.length * ARMS.length)
    } finally {
      profile.inv.items = saved.items
      profile.inv.equipped = saved.equipped
      profile.hero.slots = saved.slots
    }
  })
})

describe('the full-body rig', () => {
  it('recolours in place: each part takes one slot or none, on the same geometry whatever the kit', () => {
    const { probe, slot, stray } = tints()
    const g = baseRig().mesh.geometry
    expect(geometryDiff(probe, baseRig()), 'the probe kit moved the geometry').toBeNull()
    expect(stray, 'vertices no slot explains').toEqual([])

    // The split `HeroColors` documents: helmets tint the helmet, ear discs and
    // pearl limbs; chests the torso armour and pelvis; cannons the right arm.
    const names = baseRig().mesh.skeleton.bones.map(b => b.name)
    const skin = g.attributes.skinIndex!
    const reach: Record<string, Set<string>> = {}
    for (let v = 0; v < slot.length; v++) {
      if (slot[v]! >= 0) (reach[SLOTS[slot[v]!]!] ??= new Set()).add(names[skin.getX(v)]!)
    }
    expect(Object.fromEntries(Object.entries(reach).map(([s, bones]) => [s, [...bones].sort()]))).toEqual({
      main: ['elbowL', 'head', 'hipL', 'hipR', 'kneeL', 'kneeR', 'shoulderL'],
      accent: ['chest', 'hips', 'shoulderL', 'shoulderR'],
      buster: ['elbowR'],
      core: ['chest', 'elbowR']
    })

    // The plasma is light, never paint; the face's lights belong to no slot.
    const core = SLOTS.indexOf('core')
    const [lit, unlit] = [0, 1].map(m => g.groups.find(x => x.materialIndex === m)!)
    let litPlasma = 0
    for (let i = lit!.start; i < lit!.start + lit!.count; i++) {
      if (slot[g.index!.getX(i)] === core) litPlasma++
    }
    expect(litPlasma, 'lit triangle corners in the plasma colour').toBe(0)
    const wrongGlows = new Set<string>()
    for (let i = unlit!.start; i < unlit!.start + unlit!.count; i++) {
      const v = g.index!.getX(i)
      const bone = names[skin.getX(v)]!
      if (slot[v] !== (bone === 'head' ? -1 : core)) wrongGlows.add(`${bone}: ${slot[v]! < 0 ? 'fixed' : SLOTS[slot[v]!]}`)
    }
    expect([...wrongGlows], 'glows off the head follow the core; the head\'s follow nothing').toEqual([])
  })

  it('builds every two pieces of gear together at least once', () => {
    const pairs = new Set<string>()
    for (const [helm, chest, arm] of BUILT) {
      pairs.add(`${helm}+${chest}`).add(`${helm}+${arm}`).add(`${chest}+${arm}`)
    }
    expect(BUILT).toHaveLength(HELMETS.length * ARMS.length)
    expect(pairs.size).toBe(HELMETS.length * CHESTS.length + (HELMETS.length + CHESTS.length) * ARMS.length)
  })

  for (const helm of HELMETS) {
    it(`builds cleanly under the ${helm}, with every arm cannon / copied weapon and every chest, head lights unchanged`, () => {
      const headLights = glowsByBone(baseRig()).head
      for (const [, chest, arm] of BUILT.filter(([h]) => h === helm)) {
        const k = kit(helm, chest, arm)
        const rig = buildHero(k)
        const at = `${helm} ${chest} ${arm}`
        expect(brokenVertices(rig.mesh.geometry), at).toBe(0)
        expect(geometryDiff(rig, baseRig()), at).toBeNull()
        expect(firstWrongColour(rig, predictedColours(k)), `${at}: first vertex off the predicted recolour`).toBe(-1)
        expect(glowsByBone(rig).head, at).toEqual(headLights)
        dispose(rig)
      }
    })
  }

  it('keeps the eyes and antenna tip amber for every cannon and weapon; the body glows follow its core', () => {
    // At the default look the body's plasma IS the eyes' amber: one colour all over.
    expect(HERO_EYE).toBe(DEFAULT_HERO_COLORS.core)
    const eye = keyOf(HERO_EYE)
    for (const arm of ARMS) {
      const c = kit(arm)
      const rig = buildHero(c)
      const glows = glowsByBone(rig)
      expect(glows.head!.has(eye), arm).toBe(true)
      if (c.core !== HERO_EYE) expect(glows.head!.has(keyOf(c.core)), `${arm}: the face took the weapon's colour`).toBe(false)
      // Reactor + fin edges on the chest, vents + muzzle on the cannon arm.
      expect(glows.chest!.has(keyOf(c.core)), arm).toBe(true)
      expect(glows.elbowR!.has(keyOf(c.core)), arm).toBe(true)
      dispose(rig)
    }
  })

  it('keeps the bones the idle and victory poses drive, and both poses move them', () => {
    // Its own build: posing moves bones, and the shared rig stays at rest.
    const rig = buildHero()
    expect(Object.keys(rig.bones).sort()).toEqual([...BONES].sort())
    animateHeroIdle(rig, 1.3)
    const idleHead = rig.bones.head!.quaternion.clone()
    expect(idleHead.angleTo(rig.rest.head!.q)).toBeGreaterThan(0.01)
    animateHeroVictory(rig, 1)
    // The buster goes up: the cannon arm swings far past its rest.
    expect(rig.bones.shoulderR!.quaternion.angleTo(rig.rest.shoulderR!.q)).toBeGreaterThan(2)
    dispose(rig)
  })

  it('stays within the old model’s budget (11.7k vertices, 21.2k triangles)', () => {
    const rig = baseRig()
    const g = rig.mesh.geometry
    expect(g.attributes.position!.count).toBeLessThan(13_000)
    expect(g.index!.count / 3).toBeLessThan(24_000)
    // One skinned mesh (toon + glow groups) plus one outline: 3 draw calls.
    expect(g.groups.map(x => x.materialIndex)).toEqual([0, 1])
    expect(rig.outline).not.toBeNull()
  })

  it('has no two parts in one plane (helmet plates, band, ears, reactor, cannon, boots)', () => {
    let parts: BufferGeometry[] = []
    const build = RigBuilder.prototype.build
    const spy = vi.spyOn(RigBuilder.prototype, 'build').mockImplementation(function (this: RigBuilder, ...a: Parameters<RigBuilder['build']>) {
      const rig = build.apply(this, a)
      parts = this.partGeometries
      return rig
    })
    const rig = buildHero()
    spy.mockRestore()
    expect(parts.length).toBeGreaterThan(40)
    expect(coplanarOverlaps(parts)).toBe(0)
    dispose(rig)
  })
})

describe('the first-person arm', () => {
  it('builds for every arm cannon and copied weapon, and recolours in place', () => {
    const vm = buildViewmodel()
    expect(`#${vm.coreColor.getHexString()}`).toBe(DEFAULT_HERO_COLORS.core)
    for (const arm of ARMS) {
      const c = kit(arm)
      const fresh = buildViewmodel(c)
      // The arm and its glow parts (vertex-coloured); the core, halo and barrier are plain FX meshes.
      fresh.root.traverse((o) => {
        const g = (o as { geometry?: BufferGeometry }).geometry
        if (g?.attributes.color) expect(brokenVertices(g), arm).toBe(0)
      })
      vm.setColors(c)
      // The resting glow is the kit's plasma; the mission returns to it after every charge.
      expect(vm.coreColor.getHexString(), arm).toBe(new Color(c.core).getHexString())
      expect(vm.coreMat.color.getHexString(), arm).toBe(new Color(c.core).getHexString())
    }
  })

  it('stays light: the arm is well under two thousand vertices', () => {
    const vm = buildViewmodel()
    const arm = vm.root.children[0] as unknown as { geometry: BufferGeometry }
    expect(arm.geometry.attributes.position!.count).toBeLessThan(2000)
  })
})
