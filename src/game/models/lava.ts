import { Color, DataTexture, MeshBasicMaterial, PlaneGeometry, RepeatWrapping, RGBAFormat, LinearFilter, type BufferGeometry } from 'three'

/**
 * ─── Lava (#279) ─────────────────────────────────────────────────────────────
 *
 * A lava pit was one flat glowing slab per cell. Now its surface moves: one
 * shared material whose texture (blotches of yellow-white heat in orange
 * and deep red, generated from value noise, no canvas) slides slowly across
 * the pits, and whose brightness breathes; the mission adds embers rising
 * off it (`Mission.stepLava`). One plane per cell, a hand over the pit's
 * bottom (never coplanar with anything), UVs in world space so the flow runs
 * on unbroken from cell to cell.
 */

const N = 64
/** Texture repeats per metre. */
const UV_PER_M = 1 / 7

const hash = (x: number, y: number): number => {
  const s = Math.sin(((x % N) + N) % N * 127.1 + (((y % N) + N) % N) * 311.7) * 43758.5453
  return s - Math.floor(s)
}
const smooth = (t: number) => t * t * (3 - 2 * t)
/** Tileable value noise on an N-cell lattice at `f` cells per texture. */
const noise = (x: number, y: number, f: number): number => {
  const fx = (x / N) * f
  const fy = (y / N) * f
  const i = Math.floor(fx)
  const j = Math.floor(fy)
  const u = smooth(fx - i)
  const v = smooth(fy - j)
  const w = (a: number, b: number) => hash(((a % f) + f) % f, ((b % f) + f) % f)
  return (w(i, j) * (1 - u) + w(i + 1, j) * u) * (1 - v) + (w(i, j + 1) * (1 - u) + w(i + 1, j + 1) * u) * v
}

const DEEP = new Color('#8a1405')
const MID = new Color('#ff5a12')
const HOT = new Color('#ffd25a')

let mat: MeshBasicMaterial | null = null

/** The shared lava material (built once). */
export const lavaMaterial = (): MeshBasicMaterial => {
  if (mat) return mat
  const data = new Uint8Array(N * N * 4)
  const c = new Color()
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const n = noise(x, y, 4) * 0.6 + noise(x, y, 8) * 0.3 + noise(x, y, 16) * 0.1
      // Crust in the low places, white heat in the veins.
      if (n < 0.45) c.copy(DEEP).lerp(MID, n / 0.45)
      else c.copy(MID).lerp(HOT, Math.min(1, (n - 0.45) / 0.3))
      const k = (y * N + x) * 4
      data[k] = Math.round(c.r * 255)
      data[k + 1] = Math.round(c.g * 255)
      data[k + 2] = Math.round(c.b * 255)
      data[k + 3] = 255
    }
  }
  const tex = new DataTexture(data, N, N, RGBAFormat)
  tex.wrapS = tex.wrapT = RepeatWrapping
  tex.magFilter = LinearFilter
  tex.minFilter = LinearFilter
  tex.needsUpdate = true
  mat = new MeshBasicMaterial({ map: tex, toneMapped: false })
  return mat
}

/** One cell's lava surface: a CELL-square plane at `y`, its UVs in world space. */
export const lavaCell = (x0: number, z0: number, size: number, y: number): BufferGeometry => {
  const g = new PlaneGeometry(size, size).rotateX(-Math.PI / 2).translate(x0 + size / 2, y, z0 + size / 2)
  const pos = g.attributes.position!
  const uv = g.attributes.uv!
  for (let k = 0; k < pos.count; k++) uv.setXY(k, pos.getX(k) * UV_PER_M, pos.getZ(k) * UV_PER_M)
  return g
}

/** The flow and the glow, per frame (`time` in s). */
export const tickLava = (time: number): void => {
  if (!mat?.map) return
  mat.map.offset.set(time * 0.018, time * 0.011)
  const b = 0.88 + 0.12 * Math.sin(time * 1.6) + 0.04 * Math.sin(time * 4.3)
  mat.color.setRGB(b, b, b)
}
