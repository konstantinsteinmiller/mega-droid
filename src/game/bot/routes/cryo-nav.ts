import { CELL } from '../../world/levelGen'
import { isSolidCell, walkStep } from '../../world/nav'
import type { Ctx } from '../ctx'

/**
 * The cryo route's planner: A* over the walk graph plus the stage's hops
 * (ladders, the shuttle, dash leaps), cells only, read from the map.
 */
export type Hop = 'walk' | 'ladder' | 'lift' | 'leap'
export interface Step { from: number; to: number; kind: Hop }

export const cellOf = (c: Ctx): number => Math.floor(c.p.z / CELL) * c.m.map.w + Math.floor(c.p.x / CELL)
export const cx = (c: Ctx, k: number): number => ((k % c.m.map.w) + 0.5) * CELL
export const cz = (c: Ctx, k: number): number => (Math.floor(k / c.m.map.w) + 0.5) * CELL

const hopKind = (c: Ctx, a: number, b: number): Hop => {
  const t = c.m.map.terrain!
  const W = c.m.map.w
  for (const L of t.ladders) {
    const foot = L.j * W + L.i
    const top = (L.j + L.dj) * W + L.i + L.di
    if ((a === foot && b === top) || (a === top && b === foot)) return 'ladder'
  }
  const fa = t.floor[a]!
  const fb = t.floor[b]!
  for (const l of t.links ?? []) {
    if (l.from[1] * W + l.from[0] === a && l.to[1] * W + l.to[0] === b) return 'leap'
  }
  void fa; void fb
  return 'lift'
}

/** Plan from cell `a` to cell `goal`. Null when there is none. */
export const plan = (c: Ctx, a: number, goal: number, avoid: Set<number> = new Set()): Step[] | null => {
  const m = c.m
  const map = m.map
  const nav = m.nav
  const W = map.w
  const t = map.terrain!
  const g = new Map<number, number>([[a, 0]])
  const came = new Map<number, number>()
  const open = new Set<number>([a])
  const closed = new Set<number>()
  const ti = goal % W
  const tj = Math.floor(goal / W)
  const h = (k: number) => {
    const dx = Math.abs((k % W) - ti)
    const dz = Math.abs(Math.floor(k / W) - tj)
    return Math.max(dx, dz) + 0.414 * Math.min(dx, dz)
  }
  const ok = (i: number, j: number): boolean => {
    if (i < 0 || j < 0 || i >= W || j >= map.h) return false
    const k = j * W + i
    if (isSolidCell(nav, i, j) || map.navBlock[k] === 1 || t.pit[k]) return false
    if (nav.pathBlock[k]! > 1 && k !== goal) return false
    return true
  }
  const cost = (k: number): number => (t.ice?.[k] ? 0.6 : 0) + (avoid.has(k) ? 8 : 0)
  let n = 0
  while (open.size && n++ < 4000) {
    let cur = -1
    let bf = Infinity
    for (const k of open) {
      const f = (g.get(k) ?? Infinity) + h(k)
      if (f < bf) { bf = f; cur = k }
    }
    open.delete(cur)
    if (cur === goal) {
      const out: Step[] = []
      let k = cur
      while (came.has(k)) {
        const p = came.get(k)!
        const di = Math.abs((k % W) - (p % W))
        const dj = Math.abs(Math.floor(k / W) - Math.floor(p / W))
        const walk = di <= 1 && dj <= 1 && walkStep(map, p % W, Math.floor(p / W), k % W, Math.floor(k / W)) && !nav.links?.get(p)?.includes(k)
        out.push({ from: p, to: k, kind: walk ? 'walk' : hopKind(c, p, k) })
        k = p
      }
      return out.reverse()
    }
    closed.add(cur)
    const ci = cur % W
    const cj = Math.floor(cur / W)
    const relax = (nk: number, add: number) => {
      if (closed.has(nk)) return
      const v = (g.get(cur) ?? 0) + add + cost(nk)
      if (v < (g.get(nk) ?? Infinity)) { g.set(nk, v); came.set(nk, cur); open.add(nk) }
    }
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue
        const ni = ci + di
        const nj = cj + dj
        if (!ok(ni, nj)) continue
        if (di && dj && (!ok(ci + di, cj) || !ok(ci, cj + dj))) continue
        if (!walkStep(map, ci, cj, ni, nj)) continue
        relax(nj * W + ni, di && dj ? 1.414 : 1)
      }
    }
    for (const nk of nav.links?.get(cur) ?? []) {
      if (ok(nk % W, Math.floor(nk / W))) relax(nk, 3)
    }
  }
  return null
}
