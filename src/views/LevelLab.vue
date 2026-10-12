<template lang="pug">
  div.lab
    header.head
      h1 Level lab
      span.count {{ entries.length }} levels · {{ types.length }} types · dev only
      a.link(href="#/models") models
      a.link(href="#/") game
    div.body
      nav.list
        section.type(
          v-for="t in types" :key="t.template"
          :class="{ on: t.template === pick.template, fresh: t.isNew }"
        )
          div.t-head
            span.t-name {{ t.name }}
            span.tag.new(v-if="t.isNew") NEW · platformer
            span.tag(:class="t.map") {{ MAP_LABEL[t.map] }}
            span.tag.boss(v-if="t.boss") boss
            code.t-id {{ t.template }}
          p.t-blurb {{ t.blurb }}
          div.chips
            button(
              v-for="s in t.sectors" :key="s" type="button"
              :class="{ on: t.template === pick.template && s === pick.sector }"
              @click="choose(t.template, s)"
            ) {{ s }}
      main.detail
        div.d-head
          h2 {{ type.name }}
          span.tag.new(v-if="type.isNew") NEW · platformer
          span.tag(:class="type.map") {{ MAP_LABEL[type.map] }}
          code.t-id {{ type.template }}
        div.controls
          div.ctl
            span.lbl Sector
            div.chips
              button(
                v-for="s in type.sectors" :key="s" type="button"
                :class="{ on: s === pick.sector }"
                @click="pick.sector = s"
              ) {{ s }}
          div.ctl
            span.lbl Seed
            input.seed(
              v-model="seedText" inputmode="numeric" :disabled="fixed"
              @change="commitSeed" @keydown.enter="commitSeed"
            )
            button(type="button" :disabled="fixed" @click="reroll") Reroll
            span.hint {{ SEED_HINT[type.seed] }}
          div.ctl
            span.lbl Player level
            input.level(v-model.number="pick.playerLevel" type="range" min="1" :max="MAX_LEVEL" :disabled="fixed")
            span.val {{ pick.playerLevel }}
            button(type="button" :disabled="fixed" @click="pick.playerLevel = profile.level") save's level ({{ profile.level }})
            span.hint enemies scale to it inside the sector's band
        dl.facts
          template(v-for="f in facts" :key="f[0]")
            dt {{ f[0] }}
            dd {{ f[1] }}
        div.preview
          canvas(ref="canvas")
          ul.legend
            li(v-for="l in legend" :key="l[0]")
              i(:style="{ background: l[1] }")
              span {{ l[0] }}
        div.play-row
          button.play(type="button" @click="play") Play
          code.url {{ playUrl }}
        p.note
          | A test run is sandboxed: nothing it does is written to the save (no XP, loot, boss, sector
          | or resume point) and no leaderboard hears of it. Continue on its result screen comes back here.
</template>

<script setup lang="ts">
/**
 * DEV-ONLY level lab (route `/levels`): every level the game can generate
 * (`data/levelCatalog.ts` — a new quest template shows up here by itself),
 * with its sector, seed and the player level its enemies scale to, a top-down
 * map of the layout, and Play, which boots the game straight into it.
 *
 * Play loads `#/?level=…` as a fresh page rather than changing route: the
 * loader then builds the level exactly as a boot builds a resumed mission
 * (shaders compiled, first frame warm), from a profile read fresh from the
 * save. That address reproduces the level, so it can be bookmarked or shared.
 * The run is sandboxed (`flow.ts`, test runs), and its Continue comes back.
 */
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  LEVEL_TYPES, levelTypes, levelEntries, buildLevel, levelMap, levelQuery, parseLevelQuery,
  type LevelPick, type MapKind, type SeedKind
} from '@/game/data/levelCatalog'
import type { QuestTemplate } from '@/game/data/quests'
import { SECTOR_BY_ID } from '@/game/data/regions'
import { MAX_LEVEL } from '@/game/data/progression'
import { CELL, Cell, Ramp, type MapData, type RoomRole } from '@/game/world/levelGen'
import type { SectorId } from '@/game/world/themes'
import { profile } from '@/game/state/profile'
import { endTestRun } from '@/game/flow'

const router = useRouter()
const types = levelTypes()
const entries = levelEntries()

const MAP_LABEL: Record<MapKind, string> = { rooms: 'rooms', climb: 'tower', stage: 'stage', tutorial: 'tutorial' }
const SEED_HINT: Record<SeedKind, string> = {
  board: 'a job-board roll',
  attempt: 'the story attempt number (0 = a first try)',
  fixed: 'a hand-picked map: seed and level change nothing'
}

// `#/levels?level=climb&sector=blaze&seed=12&plevel=8` reopens a selection.
const fromUrl = parseLevelQuery(new URLSearchParams(location.hash.split('?')[1] ?? ''))
const pick = reactive<LevelPick>(fromUrl ?? { template: 'climb', sector: 'scrapyard', seed: 1, playerLevel: 1 })
const type = computed(() => LEVEL_TYPES[pick.template])
const fixed = computed(() => type.value.seed === 'fixed')
const quest = computed(() => buildLevel(pick))
const map = computed(() => levelMap(quest.value))

const choose = (template: QuestTemplate, sector: SectorId): void => {
  pick.template = template
  pick.sector = sector
}

const seedText = ref(String(pick.seed))
watch(() => pick.seed, (v) => { seedText.value = String(v) })
const commitSeed = (): void => {
  const n = Number(seedText.value.trim())
  if (seedText.value.trim() !== '' && Number.isInteger(n) && n >= 0 && n <= 0xffffffff) pick.seed = n
  else seedText.value = String(pick.seed)
}
const reroll = (): void => { pick.seed = 1 + Math.floor(Math.random() * 999999) }

// The selection lives in the address, so a reload keeps it.
watch(pick, () => { void router.replace({ name: 'levels', query: levelQuery(pick) }) })

const query = computed(() => new URLSearchParams(levelQuery(pick)).toString())
const playUrl = computed(() => `#/?${query.value}`)
const play = (): void => {
  history.pushState(null, '', `${location.pathname}${location.search}#/?${query.value}`)
  location.reload()
}

// ─── What the level is ───────────────────────────────────────────────────────

const facts = computed((): Array<[string, string]> => {
  const q = quest.value
  const t = type.value
  const m = map.value
  const sector = SECTOR_BY_ID[q.sector]
  const out: Array<[string, string]> = [
    ['Quest', `${q.id} · ${q.kind} · ${q.template}`],
    ['Map', t.map === 'climb' ? `climb tower (climbGen) · map seed ${q.seed}`
      : t.map === 'stage' ? `${q.sector} platform stage (world/stages) · map seed ${q.seed}`
        : t.map === 'tutorial' ? 'Wake-Up Call (world/stages/tutorial) · built'
        : `${q.rooms} rooms (levelGen) · map seed ${q.seed}`]
  ]
  // A job is the first board roll of its template at or after the seed.
  const board = q.kind === 'job' ? parseInt(q.id.slice(4), 36) : null
  if (board !== null && board !== pick.seed) out.push(['Board roll', `seed ${board} (the first ${q.template} roll from ${pick.seed})`])
  out.push(['Enemies', `level ${q.level} (${q.sector} band ${sector.levels[0]}–${sector.levels[1]})`])
  if (t.boss) out.push(['Core Master', sector.boss])
  if (q.target || q.count > 1) out.push(['Objective', `${q.count} × ${q.target ?? q.template}`])
  out.push(['Reward', `${q.reward.xp} XP · ${q.reward.bolts} bolts${q.reward.guaranteed ? ` · a ${q.reward.guaranteed} item` : ''}`])
  const tr = m.terrain
  out.push(['Layout', tr
    ? `${tr.sections.join(' → ')} · ${tr.ladders.length} ladders · ${tr.lifts.length} lifts · ${tr.crushers.length} crushers · `
      + `${tr.lanes.length} ball lanes · ${tr.checkpoints.length} checkpoints · ${tr.rewards.length} reward ledges · ${tr.foes.length} machine posts`
    : `${m.rooms.length} rooms (${roleCounts(m)}) · ${m.doors.length} doors · ${m.pillars.length} pillars`])
  return out
})

const roleCounts = (m: MapData): string => {
  const n: Partial<Record<RoomRole, number>> = {}
  for (const r of m.rooms) n[r.role] = (n[r.role] ?? 0) + 1
  return Object.entries(n).map(([k, v]) => `${v} ${k}`).join(', ')
}

// ─── The top-down map ────────────────────────────────────────────────────────

const ROLE_COLOR: Record<RoomRole, string> = {
  start: '#2fb872', combat: '#35609a', treasure: '#b98f1c', objective: '#d9791a', boss: '#c23a44', challenge: '#e0a21a'
}
const BG = '#070c19'
const CORRIDOR = '#4f5b73'
const WALL = '#d7e3ff'
const PIT = '#000000'
const DOOR = '#f4f8ff'
const BOSS_DOOR = '#ff5c6c'
const LADDER = '#ffd23f'
const LIFT = '#3cc8ff'
const CRUSHER = '#ff4d5e'
const LANE = '#ff9a3c'
const CHECKPOINT = '#ffffff'
const REWARD = '#ffe082'
const FOE = '#ff3b6b'

const legend = computed((): Array<[string, string]> => [
  ['start', ROLE_COLOR.start], ['combat', ROLE_COLOR.combat], ['treasure', ROLE_COLOR.treasure],
  ['objective', ROLE_COLOR.objective], ['boss', ROLE_COLOR.boss], ['corridor', CORRIDOR],
  ['door', DOOR], ['boss door', BOSS_DOOR],
  ...(map.value.terrain
    ? [['pit', PIT], ['ladder', LADDER], ['lift', LIFT], ['crusher', CRUSHER], ['ball lane', LANE],
        ['checkpoint', CHECKPOINT], ['reward', REWARD], ['machine', FOE]] as Array<[string, string]>
    : [])
])

/** Toward white by `t` (0..1): the climb's higher floors read lighter. */
const lighten = (hex: string, t: number): string => {
  const n = parseInt(hex.slice(1), 16)
  const mix = (c: number) => Math.round(c + (255 - c) * t)
  return `rgb(${mix((n >> 16) & 255)},${mix((n >> 8) & 255)},${mix(n & 255)})`
}

const canvas = ref<HTMLCanvasElement | null>(null)
/** The largest the drawing may be (CSS px). */
const BOX_W = 620
const BOX_H = 460

const draw = (m: MapData): void => {
  const cv = canvas.value
  const g = cv?.getContext('2d')
  if (!cv || !g) return
  // Only the part of the grid the map uses, plus a cell of margin.
  let i0 = m.w
  let j0 = m.h
  let i1 = 0
  let j1 = 0
  for (let j = 0; j < m.h; j++) {
    for (let i = 0; i < m.w; i++) {
      if (m.cell[j * m.w + i] === Cell.Void) continue
      i0 = Math.min(i0, i); j0 = Math.min(j0, j); i1 = Math.max(i1, i); j1 = Math.max(j1, j)
    }
  }
  i0 = Math.max(0, i0 - 1); j0 = Math.max(0, j0 - 1)
  i1 = Math.min(m.w - 1, i1 + 1); j1 = Math.min(m.h - 1, j1 + 1)
  const cols = i1 - i0 + 1
  const rows = j1 - j0 + 1
  const s = Math.max(4, Math.floor(Math.min(BOX_W / cols, BOX_H / rows)))
  const W = cols * s
  const H = rows * s
  const dpr = window.devicePixelRatio || 1
  cv.width = Math.round(W * dpr)
  cv.height = Math.round(H * dpr)
  cv.style.width = `${W}px`
  cv.style.height = `${H}px`
  g.setTransform(dpr, 0, 0, dpr, 0, 0)
  g.fillStyle = BG
  g.fillRect(0, 0, W, H)
  const X = (i: number) => (i - i0) * s
  const Y = (j: number) => (j - j0) * s
  const WX = (x: number) => (x / CELL - i0) * s
  const WZ = (z: number) => (z / CELL - j0) * s
  const t = m.terrain
  let top = 1
  if (t) for (let k = 0; k < t.floor.length; k++) top = Math.max(top, t.floor[k]! + t.rise[k]!)
  const solid = (k: number) => m.cell[k] !== Cell.Void && !(t && t.pit[k])

  // Floors: room role (corridors grey); on the climb, lighter the higher.
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const k = j * m.w + i
      const c = m.cell[k]
      if (c === Cell.Void) continue
      const base = c === Cell.Corridor ? CORRIDOR : ROLE_COLOR[m.rooms[m.room[k]!]!.role]
      g.fillStyle = t?.pit[k] ? PIT : t ? lighten(base, 0.55 * (t.floor[k]! + t.rise[k]! / 2) / top) : base
      g.fillRect(X(i), Y(j), s, s)
    }
  }

  // Walls against the void and between rooms; on the climb, a ledge line
  // where the floor steps (never across a ramp, which is walked).
  g.lineCap = 'round'
  const wall = new Path2D()
  const ledge = new Path2D()
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const k = j * m.w + i
      if (m.cell[k] === Cell.Void) continue
      const edges: Array<[number, number, number, number, number]> = [
        [i + 1, j, X(i + 1), Y(j), 0], [i, j + 1, X(i), Y(j + 1), 1]
      ]
      for (const [ni, nj, x, y, horiz] of edges) {
        const x2 = horiz ? x + s : x
        const y2 = horiz ? y : y + s
        const nk = nj * m.w + ni
        const out = ni >= m.w || nj >= m.h || m.cell[nk] === Cell.Void
        const other = !out && m.cell[k] === Cell.Room && m.cell[nk] === Cell.Room && m.room[k] !== m.room[nk]
        if (out || other) { wall.moveTo(x, y); wall.lineTo(x2, y2); continue }
        if (t && solid(k) && solid(nk) && !t.ramp[k] && !t.ramp[nk] && Math.abs(t.floor[k]! - t.floor[nk]!) > 0.5) {
          ledge.moveTo(x, y); ledge.lineTo(x2, y2)
        }
      }
      // The left and top edges against the void (the loop above only looks right and down).
      if (i === 0 || m.cell[k - 1] === Cell.Void) { wall.moveTo(X(i), Y(j)); wall.lineTo(X(i), Y(j + 1)) }
      if (j === 0 || m.cell[k - m.w] === Cell.Void) { wall.moveTo(X(i), Y(j)); wall.lineTo(X(i + 1), Y(j)) }
    }
  }
  g.strokeStyle = 'rgba(0,0,0,0.75)'
  g.lineWidth = Math.max(1.5, s / 5)
  g.stroke(ledge)
  g.strokeStyle = WALL
  g.lineWidth = Math.max(1, s / 7)
  g.stroke(wall)

  // Pillars.
  g.fillStyle = '#10151f'
  for (const p of m.pillars) {
    g.beginPath()
    g.arc(WX(p.x), WZ(p.z), Math.max(1.5, (p.r / CELL) * s), 0, Math.PI * 2)
    g.fill()
  }

  // Doors: a bar across the corridor.
  for (const d of m.doors) {
    g.strokeStyle = d.boss ? BOSS_DOOR : DOOR
    g.lineWidth = Math.max(2, s / 4)
    g.beginPath()
    if (d.axis === 'x') { g.moveTo(X(d.i) + s / 2, Y(d.j)); g.lineTo(X(d.i) + s / 2, Y(d.j + 1)) }
    else { g.moveTo(X(d.i), Y(d.j) + s / 2); g.lineTo(X(d.i + 1), Y(d.j) + s / 2) }
    g.stroke()
  }

  if (t) {
    // Stairs: an arrow up the slope.
    g.strokeStyle = 'rgba(0,0,0,0.6)'
    g.lineWidth = Math.max(1, s / 10)
    const UP: Record<number, [number, number]> = { [Ramp.PX]: [1, 0], [Ramp.NX]: [-1, 0], [Ramp.PZ]: [0, 1], [Ramp.NZ]: [0, -1] }
    for (let k = 0; k < t.ramp.length; k++) {
      const dir = UP[t.ramp[k]!]
      if (!dir) continue
      const cx = X(k % m.w) + s / 2
      const cy = Y(Math.floor(k / m.w)) + s / 2
      const [ux, uy] = dir
      const a = s * 0.3
      g.beginPath()
      g.moveTo(cx - ux * a - uy * a, cy - uy * a - ux * a)
      g.lineTo(cx + ux * a, cy + uy * a)
      g.lineTo(cx - ux * a + uy * a, cy - uy * a + ux * a)
      g.stroke()
    }
    // Ladders: foot cell to top cell (dashed: a side ladder to a reward ledge).
    g.strokeStyle = LADDER
    g.lineWidth = Math.max(2, s / 4)
    for (const l of t.ladders) {
      g.setLineDash(l.side ? [s / 4, s / 5] : [])
      g.beginPath()
      g.moveTo(X(l.i) + s / 2, Y(l.j) + s / 2)
      g.lineTo(X(l.i + l.di) + s / 2, Y(l.j + l.dj) + s / 2)
      g.stroke()
    }
    g.setLineDash([])
    // Lifts: the platform at its first stop, and its travel.
    for (const l of t.lifts) {
      g.strokeStyle = LIFT
      g.lineWidth = Math.max(1.5, s / 8)
      g.beginPath()
      g.moveTo(WX(l.ax), WZ(l.az))
      g.lineTo(WX(l.bx), WZ(l.bz))
      g.stroke()
      g.fillStyle = LIFT
      g.globalAlpha = 0.55
      g.fillRect(WX(l.ax - l.hw), WZ(l.az - l.hd), (2 * l.hw / CELL) * s, (2 * l.hd / CELL) * s)
      g.globalAlpha = 1
    }
    // Crushers: a cross on the cell they slam.
    g.strokeStyle = CRUSHER
    g.lineWidth = Math.max(1.5, s / 6)
    for (const c of t.crushers) {
      const x = X(c.i)
      const y = Y(c.j)
      g.beginPath()
      g.moveTo(x + s * 0.2, y + s * 0.2); g.lineTo(x + s * 0.8, y + s * 0.8)
      g.moveTo(x + s * 0.8, y + s * 0.2); g.lineTo(x + s * 0.2, y + s * 0.8)
      g.stroke()
    }
    // Scrap-ball lanes: hatch to gutter.
    g.strokeStyle = LANE
    g.lineWidth = Math.max(1.5, s / 7)
    for (const l of t.lanes) {
      g.beginPath()
      g.moveTo(WX(l.x), WZ(l.z))
      g.lineTo(WX(l.x + l.dx * l.len), WZ(l.z + l.dz * l.len))
      g.stroke()
    }
    const dot = (x: number, z: number, r: number, color: string, square = false) => {
      g.fillStyle = color
      if (square) { g.fillRect(WX(x) - r, WZ(z) - r, 2 * r, 2 * r); return }
      g.beginPath()
      g.arc(WX(x), WZ(z), r, 0, Math.PI * 2)
      g.fill()
    }
    for (const c of t.checkpoints) {
      g.save()
      g.translate(WX(c.x), WZ(c.z))
      g.rotate(Math.PI / 4)
      g.fillStyle = CHECKPOINT
      const r = Math.max(2.5, s * 0.22)
      g.fillRect(-r, -r, 2 * r, 2 * r)
      g.restore()
    }
    for (const r of t.rewards) dot(r.x, r.z, Math.max(2.5, s * 0.22), r.kind === 'weapon' ? '#e27bff' : REWARD)
    for (const f of t.foes) dot(f.x, f.z, Math.max(2, s * 0.17), FOE, f.role === 'turret')
    // Which section each room is.
    g.font = `${Math.max(10, Math.round(s * 0.62))}px monospace`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    for (const r of m.rooms) {
      const x = X(r.x0) + (r.w * s) / 2
      const y = Y(r.z0) + s * 0.55
      g.fillStyle = 'rgba(0,0,0,0.65)'
      g.fillText(t.sections[r.id] ?? '', x + 1, y + 1)
      g.fillStyle = '#ffffff'
      g.fillText(t.sections[r.id] ?? '', x, y)
    }
  }

  // Flux on the pad, facing along the game's forward (−sin yaw, −cos yaw).
  const sx = WX(m.start.x)
  const sz = WZ(m.start.z)
  const fx = -Math.sin(m.start.yaw)
  const fz = -Math.cos(m.start.yaw)
  const a = Math.max(5, s * 0.45)
  g.fillStyle = '#ffffff'
  g.strokeStyle = '#000000'
  g.lineWidth = 1.5
  g.beginPath()
  g.moveTo(sx + fx * a, sz + fz * a)
  g.lineTo(sx - fx * a * 0.6 - fz * a * 0.6, sz - fz * a * 0.6 + fx * a * 0.6)
  g.lineTo(sx - fx * a * 0.6 + fz * a * 0.6, sz - fz * a * 0.6 - fx * a * 0.6)
  g.closePath()
  g.fill()
  g.stroke()
}

watch(map, (m) => { void nextTick(() => draw(m)) })

onMounted(() => {
  // Back from a test run (Continue, or any other way here): its sandbox ends
  // and the profile is the save's again.
  endTestRun()
  draw(map.value)
})
</script>

<style scoped lang="sass">
.lab
  position: fixed
  inset: 0
  overflow: auto
  touch-action: pan-x pan-y
  background: #0a1224
  color: #e8f1ff
  font-size: 14px
  line-height: 1.4
  user-select: text
  -webkit-user-select: text
.head
  display: flex
  align-items: baseline
  gap: 14px
  padding: 12px 16px
  border-bottom: 1px solid #1f2a44
  h1
    margin: 0
    font-size: 20px
  .count
    color: #8ea3c8
  .link
    color: #3cc8ff
.body
  display: grid
  grid-template-columns: minmax(300px, 400px) 1fr
  gap: 16px
  padding: 16px
  @media (max-width: 860px)
    grid-template-columns: 1fr
.list
  display: flex
  flex-direction: column
  gap: 10px
.type
  padding: 10px 12px
  border: 1px solid #1f2a44
  border-radius: 8px
  background: #101a33
  &.on
    border-color: #3cc8ff
  &.fresh
    background: linear-gradient(135deg, #2a2310, #101a33 60%)
    border-color: #ffa733
    &.on
      box-shadow: 0 0 0 1px #3cc8ff
.t-head, .d-head
  display: flex
  align-items: center
  flex-wrap: wrap
  gap: 6px
.t-name
  font-size: 16px
.t-id
  margin-left: auto
  color: #8ea3c8
  font-family: monospace
.t-blurb
  margin: 6px 0 8px
  color: #b8c6e2
  font-size: 13px
.tag
  padding: 1px 7px
  border-radius: 10px
  background: #1f2a44
  color: #b8c6e2
  font-size: 11px
  text-transform: uppercase
  letter-spacing: 0.04em
  &.new
    background: #ffa733
    color: #1a1000
  &.climb
    background: #3b2a5e
    color: #e3d4ff
  &.boss
    background: #5a1f28
    color: #ffd0d6
.chips
  display: flex
  flex-wrap: wrap
  gap: 5px
  button
    padding: 3px 9px
    border-radius: 6px
    background: #1f2a44
    color: #fff
    &.on
      background: #3cc8ff
      color: #000
button
  cursor: pointer
  &:disabled
    opacity: 0.4
    cursor: default
.detail
  display: flex
  flex-direction: column
  gap: 12px
  min-width: 0
  h2
    margin: 0
    font-size: 22px
.controls
  display: flex
  flex-direction: column
  gap: 8px
.ctl
  display: flex
  align-items: center
  flex-wrap: wrap
  gap: 8px
  .lbl
    width: 96px
    color: #8ea3c8
  > button
    padding: 3px 10px
    border-radius: 6px
    background: #1f2a44
    color: #fff
  .hint
    color: #6f82a8
    font-size: 12px
  .val
    min-width: 2ch
    font-family: monospace
input.seed
  width: 120px
  padding: 3px 8px
  border-radius: 6px
  border: 1px solid #2c3a5c
  background: #070c19
  color: #fff
  font-family: monospace
  user-select: text
  -webkit-user-select: text
input.level
  width: 200px
.facts
  display: grid
  grid-template-columns: max-content 1fr
  gap: 3px 14px
  margin: 0
  dt
    color: #8ea3c8
  dd
    margin: 0
    font-family: monospace
    font-size: 13px
    overflow-wrap: anywhere
.preview
  display: flex
  flex-wrap: wrap
  align-items: flex-start
  gap: 12px
  canvas
    display: block
    max-width: 100%
    border-radius: 6px
    border: 1px solid #1f2a44
.legend
  list-style: none
  margin: 0
  padding: 0
  display: grid
  grid-template-columns: repeat(2, max-content)
  gap: 3px 12px
  font-size: 12px
  color: #b8c6e2
  li
    display: flex
    align-items: center
    gap: 6px
  i
    width: 12px
    height: 12px
    border-radius: 2px
    border: 1px solid #33415f
.play-row
  display: flex
  align-items: center
  flex-wrap: wrap
  gap: 12px
.play
  padding: 10px 34px
  border-radius: 8px
  background: #3cc8ff
  color: #000
  font-size: 18px
  &:hover
    background: #7fdcff
.url
  color: #8ea3c8
  font-family: monospace
  font-size: 12px
  overflow-wrap: anywhere
.note
  margin: 0
  color: #6f82a8
  font-size: 12px
</style>
