/**
 * The CrazyGames preview shots (pv-*): boss fights with a jump attack, a dash
 * away, two full charges and special weapons, and short platforming passages
 * (the forge hammers, the rail cart, the ice pillar hall). Each shot is its
 * own take on its own page — `stage()` in REAL time off camera, `play()` on
 * the recorder's virtual clock — and `make-previews.mjs` cuts them into the
 * 10-11 s clips.
 *
 * Everything on camera is the game running as for a player: the boss's own
 * AI, Flux through the shared `Input` (the same flags the keyboard and the
 * touch sticks write), the soft lock-on aiming. Staging only decides WHERE and
 * WHEN (a teleport, a boss's health share, a hammer's phase); god mode only
 * keeps a take from ending early, and the FAIL takes switch it off.
 */
import { boot, logState, play, settle } from './_drive.mjs'
import { enterMaster } from './_shots.mjs'

const T = (ctx, fn, arg) => ctx.evaluate(fn, arg)

const until = async (ctx, fn, arg, ms = 30_000) => {
  try {
    await ctx.waitFor(fn, arg, { timeout: ms, polling: 16 })
    return true
  } catch {
    ctx.log.warn(`staging: condition not met in ${ms} ms`)
    return false
  }
}

/** A take's script: `[ms, fn]` pairs, each fn run when the take reaches `ms`. */
const script = async (ctx, steps) => {
  let t = 0
  for (const [ms, fn] of [...steps].sort((a, b) => a[0] - b[0])) {
    if (ms > t) { await play(ctx, ms - t); t = ms }
    await fn()
  }
}

/** The page-side hands (the same flags the autopilot writes), installed once per page. */
const installHands = (ctx) => T(ctx, () => {
  const st = document.createElement('style')
  st.textContent = 'html,body{overflow:hidden!important}'
  document.head.appendChild(st)
  const pin = () => { window.scrollTo(0, 0); document.scrollingElement.scrollLeft = 0; requestAnimationFrame(pin) }
  pin()
  const m = () => window.__trailer.m()
  window.__pv = {
    // A charge: held until `release`, which fires it.
    hold: () => { const i = m().input; i.fireHeld = true; i.firePressed = true },
    release: () => { const i = m().input; i.fireHeld = false; i.fireReleased = true },
    // A dash (slide) to a side: -1 left, 1 right, with a little forward/back.
    dash: (side, fwd = 0) => { const i = m().input; i.moveX = side; i.moveY = fwd; i.slideQueued = true },
    move: (x, y) => { const i = m().input; i.moveX = x; i.moveY = y },
    weapon: (n) => { const c = m().combat; c.we = c.maxWe; m().input.weaponQueued = n }
  }
})

const H = (ctx) => (fn, arg) => T(ctx, fn, arg)

// ─── Boss fights ───────────────────────────────────────────────────────────

/**
 * A Core Master mid-fight, frozen on the first frame of one of its `attacks`
 * (Flux standing `dist` m from it, in clear sight, facing it), so the take
 * opens on the wind-up. Nothing moves Flux once the boss has aimed: a jump
 * attack lands where he stood.
 */
const stageBoss = async (ctx, { level = 'stage', sector, seed = 1, hp, weapons, attacks, dist = 4.5 }) => {
  await enterMaster(ctx, sector, weapons, level, seed)
  // Below half health the Master's phase-2 roar plays off camera, not in the clip.
  await T(ctx, (f) => window.__trailer.bossHp(f), Math.min(hp, 0.45))
  await T(ctx, () => window.__trailer.auto({ fire: 'mix', chargeS: 0.8, strafe: 0.6, strafePeriod: 2.2, closeTo: 0, weapon: 0 }))
  await settle(ctx, 3000)
  await T(ctx, () => { window.__trailer.auto(null); window.__trailer.clearAdds() })
  await T(ctx, (d) => { window.__trailer.approach(['boss'], d); window.__trailer.clearAdds() }, dist)
  await installHands(ctx)
  await T(ctx, (f) => window.__trailer.bossHp(f), hp)
  const caught = await until(ctx, (a) => {
    const t = window.__trailer
    if (!t.bossDoing(a, ['tele'])) return false
    t.hold(true)
    return true
  }, attacks, 90_000)
  if (!caught) ctx.log.warn('no wind-up caught, opening mid-fight')
  await T(ctx, () => { const m = window.__trailer.m(); m.combat.target = m.boss })
  ctx.log.step('foes ' + JSON.stringify(await T(ctx, () => {
    const m = window.__trailer.m()
    return m.enemies.filter((e) => e.state !== 'dead' && !e.boss && Math.hypot(e.x - m.player.x, e.z - m.player.z) < 40).map((e) => [e.kind, e.state, !!e.challenge, !!e.mini, !!e.offstage, Math.round(Math.hypot(e.x - m.player.x, e.z - m.player.z))])
  })))
  await logState(ctx, 'open')
}

/** Flux goes down on the next hit: one health left, no god mode. */
const exposed = (ctx) => T(ctx, () => {
  const c = window.__trailer.m().combat
  c.iframes = 0
  c.hp = Math.min(c.hp, 1)
})

/**
 * The fight's beats, as a script of absolute times (ms into the take):
 *   0.00  the jump attack winds up; Flux starts a full charge
 *   0.75  the dash away (slide) while the boss is in the air
 *   1.65  the first full charge is released as the boss lands
 *   1.85  special weapon 1
 *   2.05  the second full charge is held; special weapon 2 meanwhile
 *   3.15  the second full charge released: the kill (WIN) or a sliver left (FAIL)
 * WIN then plays the shatter and walks on; FAIL has Flux greedily charge
 * again instead of dashing, take the next hit, go down, and Reboot.
 */
const fightScript = (ctx, o) => {
  const h = H(ctx)
  const side = o.side ?? 1
  const steps = [
    [0, () => h(() => { window.__trailer.hold(false); window.__pv.hold() })],
    [o.dashAt ?? 750, () => h((s) => window.__pv.dash(s, 0.15), side)],
    [(o.dashAt ?? 750) + 250, () => h(() => window.__pv.move(0, 0))],
    [o.charge1 ?? 1650, () => h(() => window.__pv.release())],
    [(o.charge1 ?? 1650) + 250, () => h((n) => window.__pv.weapon(n), 1)],
    [(o.charge1 ?? 1650) + 450, () => h(() => window.__pv.hold())],
    [o.weapon2 ?? 2750, () => h((n) => window.__pv.weapon(n), 2)],
    [o.charge2 ?? 3150, () => h((win) => {
      window.__trailer.bossHp(win ? 0.02 : 0.2)
      window.__pv.release()
    }, o.win)]
  ]
  for (const ms of [1500, 2500, 3500, 4500]) steps.push([ms, async () => { await logState(ctx, ms + 'ms'); ctx.log.step('view ' + JSON.stringify(await T(ctx, () => { const c = document.querySelector('canvas.game-canvas').getBoundingClientRect(); return [window.scrollX, document.scrollingElement.scrollLeft, Math.round(c.x), Math.round(c.y), Math.round(c.width), Math.round(c.height), innerWidth, innerHeight] }))) }])
  return { steps, h }
}

const bossShot = (cfg) => ({
  async stage(ctx) { await stageBoss(ctx, cfg) },
  async play(ctx) {
    const { steps, h } = fightScript(ctx, cfg)
    if (cfg.win) {
      // The kill is certain: if the shot missed the moving boss, it breaks apart anyway.
      steps.push([(cfg.charge2 ?? 3150) + 700, () => h(() => { const m = window.__trailer.m(); if (m.boss && m.boss.state !== 'dead') m.system.killEnemy(m.boss) })])
      steps.push([5300, () => h(() => { window.__pv.move(0, 0.7) })])
      await script(ctx, steps)
      return
    }
    // FAIL: the boss is on a sliver; Flux stays put for one more charge and the next attack lands.
    steps.push([(cfg.charge2 ?? 3150) + 450, () => h(() => window.__trailer.bossHp(0.05))])
    steps.push([(cfg.charge2 ?? 3150) + 500, async () => { await exposed(ctx); await h(() => { window.__trailer.m().combat.target = window.__trailer.m().boss; window.__pv.hold() }) }])
    await script(ctx, steps)
    const hit = await ctx.stepUntil(() => window.__trailer.m().combat.dead, { timeoutMs: 900 })
    if (!hit) {
      ctx.log.warn('fail: no hit landed in time, downing Flux')
      await h(() => window.__trailer.m().onPlayerDown())
    }
    await h(() => { window.__pv.release(); window.__trailer.auto(null) })
    await logState(ctx, 'down')
    await play(ctx, cfg.defeatMs ?? 1300)
    // Reboot: back on his feet where he fell, moving, straight into it.
    await h(() => {
      const t = window.__trailer
      window.__game.flow.modal = ''
      t.m().revive()
      t.prepare()
      window.__pv.move(0, 0.5)
    })
    await play(ctx, 1000)
    await logState(ctx, 'retry')
  }
})

// ─── Platforming passages ──────────────────────────────────────────────────

/** Meltdown Descent's forge hammers: Flux waits out a slam, then runs under. */
const hammers = {
  async stage(ctx) {
    await boot(ctx, { level: 'stage', sector: 'blaze' })
    await installHands(ctx)
    const ok = await T(ctx, () => {
      const t = window.__trailer
      const m = t.m()
      const crs = m.climb.crushers.filter((c) => c.def.room === 5)
      const cp = m.map.terrain.checkpoints.find((c) => c.room === 5) ?? m.map.terrain.checkpoints.find((c) => c.room === 4)
      if (crs.length < 1 || !cp) return false
      crs.sort((a, b) => Math.hypot(a.x - cp.x, a.z - cp.z) - Math.hypot(b.x - cp.x, b.z - cp.z))
      const first = crs[0]
      const last = crs[crs.length - 1]
      const l = Math.hypot(last.x - first.x, last.z - first.z) || 1
      const dx = (last.x - first.x) / l
      const dz = (last.z - first.z) / l
      // `dist` m before the first hammer, looking down the line of them.
      t.tp(first.x - dx * 4.4, first.z - dz * 4.4)
      t.face(last.x, last.z)
      m.player.pitch = -0.04
      t.clearAdds(40)
      return true
    })
    if (!ok) ctx.log.warn('hammers: none found')
    // A first sight of a crusher can open a freeze-frame (a lesson, a trap's hit): let it come, end it.
    await settle(ctx, 1200)
    await T(ctx, () => { window.__trailer.m().freeze?.end(); window.__game.flow.modal = '' })
    // Freeze, then set each hammer's cycle: the first one is mid-warning as the take opens.
    await T(ctx, () => {
      const t = window.__trailer
      t.m().freeze?.end()
      t.hold(true)
      const m = t.m()
      const crs = m.climb.crushers.filter((c) => c.def.room === 5)
      const cp = m.map.terrain.checkpoints.find((c) => c.room === 5) ?? m.map.terrain.checkpoints.find((c) => c.room === 4)
      crs.sort((a, b) => Math.hypot(a.x - cp.x, a.z - cp.z) - Math.hypot(b.x - cp.x, b.z - cp.z))
      // u = seconds into the cycle at take open (warn 0..0.75, slam, hold, rise to 2.2).
      const u0 = [0.2, 1.7]
      crs.forEach((c, k) => {
        const per = Math.max(c.def.period, 2.32)
        c.def.phase = (((u0[k] ?? 1) - m.time) % per + per) % per
      })
    })
    await logState(ctx, 'hammers')
  },
  async play(ctx) {
    const h = H(ctx)
    await script(ctx, [
      [0, () => h(() => { window.__trailer.hold(false); window.__pv.move(0, 1) })],
      // Stops short of the head and watches it come down.
      [90, () => logState(ctx, 'h90')],
      [330, () => h(() => window.__pv.move(0, 0))],
      // The slam has risen: through.
      [1280, () => h(() => window.__pv.move(0, 1))]
    ])
  }
}

/** The rail cart: Flux aboard, mid-ride at full speed, the flyer waves coming. */
const cart = {
  async stage(ctx) {
    await boot(ctx, { level: 'stage', sector: 'rotor' })
    await installHands(ctx)
    const ok = await T(ctx, () => {
      const m = window.__trailer.m()
      const rail = m.climb?.features?.find((f) => f.def?.boardAt)
      if (!rail) return false
      const p = m.player
      window.__trailer.tp(rail.x, rail.z)
      p.y = p.py = p.safeY = rail.y
      rail.start(p)
      rail.place(rail.length * 0.5)
      rail.v = rail.def.speed
      window.__trailer.tp(rail.x, rail.z, Math.atan2(-rail.dirX, -rail.dirZ))
      p.y = p.py = p.safeY = rail.y
      return true
    })
    if (!ok) ctx.log.warn('cart: no rail feature on this stage')
    await T(ctx, () => {
      window.__trailer.arm(['thunderArc', 'droneSwarm'])
      window.__trailer.auto({ fire: 'mix', chargeS: 0.7, strafe: 0, closeTo: 0, weapon: 2, weaponEvery: 1.4 })
    })
    await settle(ctx, 2200)
    await T(ctx, () => window.__trailer.soften(0.3, 40))
    await logState(ctx, 'riding')
  },
  async play(ctx) { await play(ctx, 900) }
}

/** The Frost Master's pillar hall: a charge brings the cracked pillar down, Flux slides through the gap. */
const ice = {
  async stage(ctx) {
    await boot(ctx, { level: 'stage', sector: 'cryo' })
    await installHands(ctx)
    const ok = await T(ctx, () => {
      const t = window.__trailer
      const m = t.m()
      const f = m.climb.features.find((x) => x.pillars)
      const c = f?.pillars.find((q) => q.def.cracked)
      const cp = m.map.terrain.checkpoints.find((k) => k.room === 3)
      if (!c || !cp) return false
      // Every machine of the hall is gone (even a challenge one): nothing to lock on to but the pillar.
      for (const e of m.enemies) if (!e.boss && e.state !== 'dead') m.system.killEnemy(e)
      t.arm(['iceLance', 'thunderArc'])
      // From the east side of the wall, a few metres out from the cracked pillar.
      // A spot east of the wall, 5 m out, with a clear line to the cracked pillar (no other pillar between).
      const clear = (x, z) => f.pillars.every((q) => q === c || q.broken || (() => {
        const dx = c.x - x, dz = c.z - z, L2 = dx * dx + dz * dz
        const u = Math.max(0, Math.min(1, ((q.x - x) * dx + (q.z - z) * dz) / L2))
        return Math.hypot(x + dx * u - q.x, z + dz * u - q.z) > 1.9
      })())
      let spot = [cp.x, cp.z]
      for (const deg of [0, 20, -20, 40, -40, 60, -60]) {
        const r = deg * Math.PI / 180
        const x = c.x + Math.cos(r) * 5, z = c.z + Math.sin(r) * 5
        if (clear(x, z) && f.pillars.every((q) => Math.hypot(q.x - x, q.z - z) > 2)) { spot = [x, z]; break }
      }
      t.tp(spot[0], spot[1])
      t.face(c.x, c.z)
      m.player.pitch = 0
      return true
    })
    if (!ok) ctx.log.warn('ice: no pillar hall')
    // The cleared machines' deaths play out off camera; nothing is left to lock on to.
    await settle(ctx, 3500)
    await T(ctx, () => {
      const t = window.__trailer
      const m = t.m()
      m.combat.target = null
      const f = m.climb.features.find((x) => x.pillars)
      const c = f.pillars.find((q) => q.def.cracked)
      t.face(c.x, c.z)
      m.player.pitch = 0
      t.hold(true)
    })
    await logState(ctx, 'ice')
  },
  async play(ctx) {
    const h = H(ctx)
    await script(ctx, [
      [0, () => h(() => { window.__trailer.hold(false); window.__pv.hold() })],
      [1000, () => h(() => window.__pv.release())],
      // The cracked pillar goes down with the charge; if the shot was eaten by another, it still does.
      [1150, () => h(() => {
        const f = window.__trailer.m().climb.features.find((x) => x.pillars)
        const c = f.pillars.find((q) => q.def.cracked)
        if (!c.broken) f.shatter(c, true)
      })],
      [1250, () => h(() => window.__pv.move(0, 1))]
    ])
  }
}

export const SHOTS = {
  hammers,
  cart,
  ice,
  // A: the Blaze Master — leap slam, dashed to the right, ice lance + blades
  'blaze-win': bossShot({ sector: 'blaze', hp: 0.55, weapons: ['galeGuard', 'neonBlade'], attacks: ['leapSlam'], win: true, side: 1 }),
  'blaze-fail': bossShot({ sector: 'blaze', hp: 0.55, weapons: ['galeGuard', 'neonBlade'], attacks: ['leapSlam'], win: false, side: 1 }),
  // B: the Scrapper — its stomp leap, dashed to the left, thunder + drones
  'scrap-win': bossShot({ level: 'boss', sector: 'scrapyard', seed: 2, hp: 0.5, weapons: ['thunderArc', 'droneSwarm'], attacks: ['stomp'], win: true, side: -1 }),
  'scrap-fail': bossShot({ level: 'boss', sector: 'scrapyard', seed: 2, hp: 0.5, weapons: ['thunderArc', 'droneSwarm'], attacks: ['stomp'], win: false, side: -1 })
}
