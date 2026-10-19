import {
  AdditiveBlending, CanvasTexture, Color, CylinderGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, RepeatWrapping, SRGBColorSpace
} from 'three'
import { rcyl, torus, sph, xform, paint, lathe, rbox, staticProp } from './kit'
import { toonVC, glowVC } from './toon'
import { PAL } from './palette'

/**
 * ─── The stasis capsule ──────────────────────────────────────────────────────
 *
 * A glass tube on a heavy base, with a lever on its side. Two of them stand in
 * Gauss's lab for the intro (`story-arc.md` § 1): Flux sleeps in one until
 * Gauss throws its lever and the glass slides down into the base; Gauss seals
 * herself into the other, and frost races up over its glass while a heartbeat
 * light in the base pulses slow and blue. Both stay in the hub's lab from
 * then on (a state, not a beat): Flux's open, Gauss asleep behind a thin
 * frost until the ending (`sim/hub.ts`).
 *
 * Everything animates through the setters, pure functions of their inputs, so
 * the cutscene can scrub them.
 */

export interface StasisCapsule {
  root: Group
  /** The lever arm (rotates on x). */
  lever: Group
  /** 0 = glass up and closed … 1 = slid down into the base. */
  setOpen(k: number): void
  /** 0 = clear … 1 = frosted over (grows from the bottom up); `thick`
   *  thins it (the hub's veil, Gauss seen through it). */
  setFrost(k: number, thick?: number): void
  /** The heartbeat light, 0 = off … 1 = a full beat. */
  setHeart(k: number): void
  /** The lever, 0 = up … 1 = thrown. */
  setLever(k: number): void
  /** The inner light (red alarm → cyan), as a colour. */
  setInner(hex: string, strength: number): void
}

const GLASS_R = 0.62
const GLASS_H = 2.25
const BASE_H = 0.34
/** The lever housing's centre: its inner face 3 cm off the glass (clear of its rim as it slides). */
export const LEVER_X = GLASS_R + 0.03 + 0.11

let frostTex: CanvasTexture | null = null
/** Frost: white fern-ish streaks on transparency, drawn once. */
const frostTexture = (): CanvasTexture => {
  if (frostTex) return frostTex
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 256
  const g = c.getContext('2d')
  if (g) {
    g.fillStyle = 'rgba(220, 240, 255, 0.55)'
    g.fillRect(0, 0, 128, 256)
    let s = 7
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647)
    g.strokeStyle = 'rgba(255, 255, 255, 0.9)'
    for (let k = 0; k < 70; k++) {
      let x = rnd() * 128
      let y = rnd() * 256
      g.lineWidth = 0.6 + rnd() * 1.6
      g.beginPath()
      g.moveTo(x, y)
      for (let j = 0; j < 5; j++) {
        x += (rnd() - 0.5) * 22
        y -= rnd() * 18
        g.lineTo(x, y)
      }
      g.stroke()
    }
  }
  frostTex = new CanvasTexture(c)
  frostTex.wrapS = RepeatWrapping
  frostTex.repeat.set(3, 1)
  frostTex.colorSpace = SRGBColorSpace
  return frostTex
}

/** The stasis heartbeat, `s` seconds after it starts: a beat every 1.3 s, 0..1. */
export const stasisBeat = (s: number): number => {
  if (s < 0) return 0
  const p = s % 1.3
  return Math.exp(-p * 7) + 0.6 * Math.exp(-Math.max(0, p - 0.2) * 9) * (p > 0.2 ? 1 : 0)
}

export const buildStasisCapsule = (): StasisCapsule => {
  const root = new Group()
  const toon = [
    xform(paint(rcyl(0.82, BASE_H, 0.1, 28), '#5d6a82'), [0, BASE_H / 2, 0]),
    xform(paint(torus(0.74, 0.05, 6, 28), '#3b4458'), [0, BASE_H + 0.01, 0], [Math.PI / 2, 0, 0]),
    xform(paint(rcyl(0.78, 0.28, 0.1, 28), '#5d6a82'), [0, BASE_H + GLASS_H + 0.14, 0]),
    xform(paint(rcyl(0.3, 0.2, 0.06, 16), '#3b4458'), [0, BASE_H + GLASS_H + 0.36, 0]),
    // Pipes up the back
    xform(paint(rcyl(0.07, GLASS_H, 0.03, 10), '#9aa7bd'), [0.55, BASE_H + GLASS_H / 2, -0.55]),
    xform(paint(rcyl(0.07, GLASS_H, 0.03, 10), '#9aa7bd'), [-0.55, BASE_H + GLASS_H / 2, -0.55]),
    // The lever's housing on the right, against the glass
    xform(paint(rbox(0.22, 0.4, 0.2, 0.3), '#3b4458'), [LEVER_X, 0.95, 0.1])
  ]
  const glowParts = [
    xform(paint(torus(0.8, 0.035, 6, 28), PAL.glowCyan), [0, BASE_H + GLASS_H + 0.02, 0], [Math.PI / 2, 0, 0])
  ]
  root.add(staticProp(toon, glowParts, toonVC(), glowVC(), 0.02))

  // The glass: a clear shell with a bright rim, sliding down on open.
  const glassMat = new MeshBasicMaterial({
    color: new Color('#9fe6ff'), transparent: true, opacity: 0.16, blending: AdditiveBlending,
    depthWrite: false, side: DoubleSide, toneMapped: false
  })
  const glass = new Group()
  const shell = new Mesh(lathe([[GLASS_R, 0], [GLASS_R, GLASS_H]], 28), glassMat)
  glass.add(shell)
  const rim = new Mesh(paint(torus(GLASS_R, 0.025, 6, 28), '#e8fbff'), glowVC())
  rim.rotation.x = Math.PI / 2
  rim.position.y = GLASS_H - 0.02
  glass.add(rim)
  glass.position.y = BASE_H
  root.add(glass)

  // Frost: a slightly larger shell that grows up from the base.
  const frostMat = new MeshBasicMaterial({
    map: frostTexture(), transparent: true, opacity: 0, depthWrite: false, side: DoubleSide, toneMapped: false
  })
  // A plain cylinder, not the kit's lathe: the frost texture needs its UVs.
  const frost = new Mesh(new CylinderGeometry(GLASS_R + 0.015, GLASS_R + 0.015, GLASS_H, 28, 1, true).translate(0, GLASS_H / 2, 0), frostMat)
  frost.position.y = BASE_H
  frost.scale.y = 0.001
  frost.visible = false
  root.add(frost)

  // The inner light: a soft column that washes whoever stands inside.
  const innerMat = new MeshBasicMaterial({
    color: new Color(PAL.glowCyan), transparent: true, opacity: 0.1, blending: AdditiveBlending,
    depthWrite: false, side: DoubleSide, toneMapped: false
  })
  const inner = new Mesh(lathe([[GLASS_R - 0.05, 0], [GLASS_R - 0.05, GLASS_H]], 20), innerMat)
  inner.position.y = BASE_H
  root.add(inner)

  // The heartbeat light, in the front of the base.
  const heartMat = new MeshBasicMaterial({ color: new Color('#5b8cff'), toneMapped: false, transparent: true, opacity: 0.2 })
  const heart = new Mesh(sph(0.09, 12, 8), heartMat)
  heart.position.set(0, BASE_H * 0.55, 0.8)
  root.add(heart)

  // The lever, pivoting at the housing.
  const lever = new Group()
  lever.position.set(LEVER_X + 0.08, 1.05, 0.1)
  const arm = new Mesh(paint(rcyl(0.04, 0.46, 0.02, 8), '#c3cad4'), toonVC())
  arm.position.y = 0.23
  const knob = new Mesh(paint(sph(0.08, 10, 8), '#ff4050'), toonVC())
  knob.position.y = 0.48
  lever.add(arm, knob)
  root.add(lever)

  return {
    root,
    lever,
    setOpen: (k) => {
      glass.position.y = BASE_H - GLASS_H * 0.96 * Math.max(0, Math.min(1, k))
    },
    setFrost: (k, thick = 1) => {
      const f = Math.max(0, Math.min(1, k))
      frost.visible = f > 0.001
      frost.scale.y = Math.max(0.001, f)
      frostMat.opacity = (0.35 + 0.55 * f) * thick
      frostTexture().offset.y = 1 - f
    },
    setHeart: (k) => {
      const h = Math.max(0, Math.min(1, k))
      heartMat.opacity = 0.2 + 0.8 * h
      heart.scale.setScalar(1 + 0.35 * h)
    },
    setLever: (k) => {
      lever.rotation.x = -1.2 * Math.max(0, Math.min(1, k)) + 0.35
    },
    setInner: (hex, strength) => {
      innerMat.color.set(hex)
      innerMat.opacity = strength
    }
  }
}
