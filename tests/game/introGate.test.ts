// The intro's start gate and its showcase looks.
//
// A browser lets no sound start before the first press on the page: the
// intro waits behind "Click to Start" instead of opening in silence
// (`story/cine.ts` holds the gate, `story/intro.ts` opens it). And its shield
// and charged shot are the game's own (`models/barrier.ts` built free of the
// first-person camera, `fx/chargedShot.ts`), not stand-ins.

import { describe, expect, it, vi } from 'vitest'
import { Texture } from 'three'

vi.mock('@/game/world/textures', () => ({ glowTexture: () => new Texture() }))

const { cine, openGate, resetCine, setGateHandler } = await import('@/game/story/cine')
const { buildChargedShot, CHARGE_AURA, SHOT_LOOK } = await import('@/game/fx/chargedShot')
const { buildBarrier } = await import('@/game/models/barrier')
const locales = import.meta.glob('@/i18n/locales/*.ts', { eager: true }) as Record<string, { default: { ui: Record<string, string> } }>

describe('the start gate', () => {
  it('a press does what the live cutscene set, and nothing once it is gone', () => {
    const begin = vi.fn()
    cine.gate = true
    setGateHandler(begin)
    openGate()
    expect(begin).toHaveBeenCalledTimes(1)
    setGateHandler(null)
    openGate()
    expect(begin).toHaveBeenCalledTimes(1)
  })

  it('never outlives its cutscene', () => {
    cine.gate = true
    resetCine()
    expect(cine.gate).toBe(false)
  })

  it('says "Click to Start" and "Tap to Start" in every language the game ships', () => {
    const all = Object.entries(locales)
    expect(all.length).toBeGreaterThanOrEqual(39)
    for (const [file, m] of all) {
      expect(m.default.ui.clickToStart, file).toBeTruthy()
      expect(m.default.ui.tapToStart, file).toBeTruthy()
      expect(m.default.ui.clickToStart, file).not.toBe(m.default.ui.tapToStart)
    }
  })
})

describe('the intro uses the game\'s own looks', () => {
  it('a charged shot for a scene: hidden until it flies, then glow, core, tail and the full charge\'s rings', () => {
    const fx = buildChargedShot('charge2')
    expect(fx.root.visible).toBe(false)
    fx.fly(1, 2, 3, 0, 0, -1, 0.2, 0.75)
    expect(fx.root.visible).toBe(true)
    expect(fx.root.position.toArray()).toEqual([1, 2, 3])
    expect(fx.root.scale.x).toBeCloseTo(0.75)
    const [glow, core, aura] = fx.root.children
    expect((glow as unknown as { isSprite: boolean }).isSprite).toBe(true)
    expect(glow!.scale.x).toBeCloseTo(SHOT_LOOK.charge2!.g)
    // The core throbs round its radius.
    expect(core!.scale.x).toBeGreaterThan(SHOT_LOOK.charge2!.r * 0.8)
    expect(core!.scale.x).toBeLessThan(SHOT_LOOK.charge2!.r * 1.2)
    const rings = aura!.children.slice(2)
    expect(rings.filter(r => r.visible)).toHaveLength(CHARGE_AURA.charge2.rings)
    fx.hide()
    expect(fx.root.visible).toBe(false)
  })

  it('the barrier, built free: it stays where its owner puts it and only sizes itself', () => {
    const b = buildBarrier({ free: 0.6 })
    b.root.position.set(4, 1, -7)
    for (let k = 0; k < 30; k++) b.update(1 / 60, true, 1, k / 60)
    expect(b.root.position.toArray()).toEqual([4, 1, -7])
    const mesh = b.root.children[0]!
    expect(mesh.visible).toBe(true)
    // Raised: at its radius (the snap's overshoot has settled).
    expect(mesh.scale.x).toBeCloseTo(0.6, 1)
    expect(mesh.scale.y).toBeCloseTo(0.6, 1)
    // A parry and a block do not move it either.
    b.impact('parry')
    b.update(1 / 60, true, 1, 1)
    expect(b.root.position.toArray()).toEqual([4, 1, -7])
  })
})
