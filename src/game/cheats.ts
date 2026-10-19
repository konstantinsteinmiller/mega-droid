import { registerCheat as register } from '@/use/devCheats'
import { currentMission } from './boot'
import { profile, saveProfile, grantXp, markCheated } from './state/profile'
import { xpToNext } from './data/progression'
import { SECTORS } from './data/regions'
import { WEAPONS, type WeaponId } from './data/weapons'
import { placeAtDoor } from './cheatPanel'
import { climbJob } from './data/quests'
import { startMission } from './flow'
import { wakeGolem } from './sim/enemies'

/**
 * Dev cheats. They only fire when cheats are enabled: `localStorage.cheat =
 * 'true'` plus a reload (see `useCheats`), so a shipped build keeps them
 * behind DevTools. They are registered from the game chunk, because the eager
 * App shell must never import the sim. All sit on ctrl+shift+alt, which no
 * game control uses.
 */
/** Any cheat marks the save: it never posts a leaderboard score again. */
const registerCheat = (shortcut: string, label: string, fn: () => void): void =>
  register(shortcut, label, () => {
    markCheated()
    fn()
  })

export const registerGameCheats = (): void => {
  registerCheat('ctrl+shift+alt+b', '+1000 bolts', () => {
    profile.bolts += 1000
    saveProfile()
  })
  registerCheat('ctrl+shift+alt+l', 'level up', () => {
    grantXp(xpToNext(profile.level) - profile.hero.xp)
    saveProfile()
  })
  registerCheat('ctrl+shift+alt+o', 'finish the objective', () => currentMission()?.objects.progress(99))
  registerCheat('ctrl+shift+alt+k', 'destroy every machine', () => {
    const m = currentMission()
    if (!m) return
    for (const e of m.enemies) {
      if (e.state === 'dead') continue
      // A sleeping or unfolding crate golem shrugs off any hit: wake it fully first.
      if (e.golem) {
        wakeGolem(m, e)
        e.golem.unfold = 1
      }
      m.system.damageEnemy(e, 1e6, {
        crit: false, charge: 2, fromX: m.player.x, fromZ: m.player.z, x: e.x, y: 1, z: e.z, color: '#ffffff'
      })
    }
  })
  let god = false
  registerCheat('ctrl+shift+alt+g', 'god mode (toggle)', () => {
    const m = currentMission()
    if (!m) return
    god = !god
    m.combat.iframes = god ? 1e9 : 0
  })
  // A boss fight is minutes into a mission; QA needs the entrance in seconds.
  // The corridor outside the shutter, facing it, so the last steps are walked.
  registerCheat('ctrl+shift+alt+j', 'jump to the boss door', () => { placeAtDoor('boss') })
  // The climb (Tower Run) is offered only after a boss falls; QA wants it now.
  // In the selected sector (any, boss beaten or not), a fresh seed each time.
  registerCheat('ctrl+shift+alt+c', 'start a climb (Tower Run)', () => {
    const sector = profile.world.selected ?? 'scrapyard'
    const q = climbJob((Date.now() >>> 0) ^ 0x51ab, [sector], profile.level)
    void startMission(q)
  })
  // …and each section of it without climbing the ones before.
  registerCheat('ctrl+shift+alt+n', 'climb: skip to the next checkpoint', () => {
    const m = currentMission()
    const cl = m?.climb
    if (!m || !cl) return
    const c = cl.t.checkpoints[Math.min(cl.t.checkpoints.length - 1, cl.cp + 1)]
    if (!c) return
    cl.cp = cl.t.checkpoints.indexOf(c)
    const p = m.player
    p.x = p.px = c.x
    p.z = p.pz = c.z
    p.y = p.py = p.safeY = c.y
    p.yaw = c.yaw
    p.vx = p.vz = p.vy = 0
    p.ground = true
    p.ladder = -1
    p.path = null
  })
  // A tutorial door waits for its lesson however long it takes (no stand-in
  // cap any more, `sim/walkthrough.ts`); QA walks on without it.
  registerCheat('ctrl+shift+alt+w', 'tutorial: open the next lesson door', () => currentMission()?.walk?.devPass())
  registerCheat('ctrl+shift+alt+u', 'unlock every sector and weapon', () => {
    profile.world.unlocked = SECTORS.map(s => s.id)
    for (const id of Object.keys(WEAPONS) as WeaponId[]) {
      if (!profile.hero.weapons.includes(id)) profile.hero.weapons.push(id)
    }
    saveProfile()
  })
}
