// Z-fighting guard shared by the geometry tests: two triangles of different
// parts lying in one plane and overlapping would fight for the same pixels.
import { BufferAttribute, Vector3, type BufferGeometry } from 'three'

export const tris = (g: BufferGeometry): Vector3[][] => {
  const pos = g.getAttribute('position') as BufferAttribute
  const idx = g.getIndex()
  const out: Vector3[][] = []
  const n = idx ? idx.count : pos.count
  const v = (i: number) => new Vector3().fromBufferAttribute(pos, idx ? idx.getX(i) : i)
  for (let i = 0; i < n; i += 3) out.push([v(i), v(i + 1), v(i + 2)])
  return out
}

/** Two triangles from different parts lying in one plane, overlapping. */
export const coplanarOverlaps = (parts: BufferGeometry[]): number => {
  type T = { p: Vector3[]; n: Vector3; d: number; part: number; key: string }
  const all: T[] = []
  parts.forEach((g, part) => {
    for (const p of tris(g)) {
      const n = new Vector3().subVectors(p[1]!, p[0]!).cross(new Vector3().subVectors(p[2]!, p[0]!))
      const a = n.length()
      if (a < 1e-5) continue
      n.divideScalar(a)
      // Only big flat faces can fight: a curved surface's facets are small.
      if (a / 2 < 0.004) continue
      const d = n.dot(p[0]!)
      const key = `${Math.round(n.x * 50)},${Math.round(n.y * 50)},${Math.round(n.z * 50)},${Math.round(d * 200)}`
      all.push({ p, n, d, part, key })
    }
  })
  const groups = new Map<string, T[]>()
  for (const t of all) { const l = groups.get(t.key) ?? []; l.push(t); groups.set(t.key, l) }
  let bad = 0
  const project = (t: T): Array<[number, number]> => {
    // Into the plane's own 2D frame.
    const u = Math.abs(t.n.y) < 0.9 ? new Vector3(0, 1, 0).cross(t.n).normalize() : new Vector3(1, 0, 0).cross(t.n).normalize()
    const w = new Vector3().crossVectors(t.n, u)
    return t.p.map(q => [q.dot(u), q.dot(w)])
  }
  const sep = (a: Array<[number, number]>, b: Array<[number, number]>): boolean => {
    for (const poly of [a, b]) {
      for (let i = 0; i < 3; i++) {
        const [x0, y0] = poly[i]!
        const [x1, y1] = poly[(i + 1) % 3]!
        const nx = y1 - y0
        const ny = x0 - x1
        const pa = a.map(([x, y]) => x * nx + y * ny)
        const pb = b.map(([x, y]) => x * nx + y * ny)
        if (Math.max(...pa) <= Math.min(...pb) + 1e-6 || Math.max(...pb) <= Math.min(...pa) + 1e-6) return true
      }
    }
    return false
  }
  for (const g of groups.values()) {
    for (let i = 0; i < g.length; i++) {
      for (let j = i + 1; j < g.length; j++) {
        if (g[i]!.part === g[j]!.part || g[i]!.n.dot(g[j]!.n) < 0.999) continue
        if (!sep(project(g[i]!), project(g[j]!))) bad++
      }
    }
  }
  return bad
}
