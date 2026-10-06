/**
 * The trailer's shot library. Each shot: `stage(ctx)` in REAL time, off
 * camera (boot the level, put Flux where the action is, let the autopilot
 * get the fight going), then `play(ctx)` on camera. A shot's length is the
 * cut sheet's (tools/cinematic-trailer/cut.mjs); `play` only times beats
 * inside it, the rest plays on.
 *
 * Everything on camera is the game running as it does for a player: the
 * enemies' and bosses' own AI, Flux driven through the shared Input by the
 * autopilot (`src/game/trailer.ts`), the soft lock-on aiming, the game's own
 * set pieces (beam-in, rail ride, secret wall, weapon copy, the Grand
 * Master's assembly, the exit drone). Staging only decides WHERE and WHEN —
 * a teleport, a health share, a set piece started on cue; god mode only
 * keeps a take from ending early.
 */
import { boot, logState, play, settle } from './_drive.mjs'

const T = (ctx, fn, arg) => ctx.evaluate(fn, arg)

/** Wait (real time, staging) until `fn` holds in the page; false on timeout. */
const until = async (ctx, fn, arg, ms = 30_000) => {
  try {
    await ctx.waitFor(fn, arg, { timeout: ms, polling: 16 })
    return true
  } catch {
    ctx.log.warn(`staging: condition not met in ${ms} ms`)
    return false
  }
}

const PILOT = { fire: 'mix', chargeS: 0.9, strafe: 0.55, strafePeriod: 2.6, closeTo: 0 }

/**
 * A Core Master mid-fight, caught as it winds up one of `attacks`: Flux walks
 * in (the entrance plays off camera), the autopilot fights with `weapons`,
 * the Master's health is set to `hp` (below half = its phase-2 moves), and
 * the take starts on the wind-up with Flux `dist` m from it.
 */
const masterShot = (sector, { attacks, hp = 0.45, weapons = ['iceLance', 'neonBlade'], pilot = {}, dist = 5 }) => ({
  async stage(ctx) {
    await enterMaster(ctx, sector, weapons)
    await T(ctx, (f) => window.__trailer.bossHp(f), hp)
    await T(ctx, (p) => window.__trailer.auto(p), { ...PILOT, weapon: 1, weaponEvery: 3.2, ...pilot })
    await settle(ctx, 2500)
    await T(ctx, () => window.__trailer.clearAdds())
    await until(ctx, (a) => window.__trailer.bossDoing(a, ['tele']), attacks, 45_000)
    await T(ctx, (d) => { window.__trailer.approach(['boss'], d); window.__trailer.clearAdds() }, dist)
    await logState(ctx, 'wind-up')
  },
  async play(ctx) {
    await play(ctx, 900)
    await logState(ctx, 'mid')
  }
})

/** Boot a stage and walk into its Core Master's arena; returns once the fight is on. */
const enterMaster = async (ctx, sector, weapons = ['iceLance', 'neonBlade']) => {
  await boot(ctx, { level: 'stage', sector })
  await T(ctx, ([w]) => window.__trailer.arm(w), [weapons])
  await T(ctx, () => window.__trailer.enterBoss(4))
  // The shutter, the drop, Dr. Vex's presentation: all off camera.
  await until(ctx, () => window.__trailer.state().boss?.started, undefined, 15_000)
  await settle(ctx, 2600)
  await until(ctx, () => window.__trailer.phase() === 'play', undefined, 30_000)
}

/** A rail-type ride (the maglev cart, the quadcopter): Flux aboard, `at` of the way along. */
const rideShot = (sector, { at = 0.35, lead = 2200 } = {}) => ({
  async stage(ctx) {
    await boot(ctx, { level: 'stage', sector })
    const ok = await T(ctx, (k) => {
      const m = window.__trailer.m()
      const rail = m.climb?.features?.find((f) => f.def?.boardAt)
      if (!rail) return false
      const p = m.player
      window.__trailer.tp(rail.x, rail.z)
      p.y = p.py = p.safeY = rail.y
      rail.start(p)
      // Mid-ride: the cart moved along its rail, Flux on its deck, full speed.
      rail.place(rail.length * k)
      rail.v = rail.def.speed
      window.__trailer.tp(rail.x, rail.z, Math.atan2(-rail.dirX, -rail.dirZ))
      p.y = p.py = p.safeY = rail.y
      return true
    }, at)
    if (!ok) ctx.log.warn('ride: no rail feature on this stage')
    await T(ctx, () => window.__trailer.auto({ fire: 'mix', chargeS: 0.7, strafe: 0, closeTo: 0 }))
    // The flyer waves rise a moment after the ride enters their room.
    await settle(ctx, lead)
    await T(ctx, () => window.__trailer.soften(0.3, 40))
    await logState(ctx, 'riding')
  },
  async play(ctx) { await play(ctx, 900) }
})

/** Fortress roof arena (Act C): Flux in it, the Mk-I fight running. */
const enterVex = async (ctx) => {
  await boot(ctx, { level: 'stage', sector: 'fortress' })
  await T(ctx, () => window.__trailer.arm(['thunderArc', 'droneSwarm']))
  await T(ctx, () => {
    const m = window.__trailer.m()
    const r = m.map.rooms[m.map.terrain.bossStages[0]]
    window.__trailer.tp((r.x0 + r.w / 2) * 3, (r.z0 + r.h - 1.5) * 3)
    window.__trailer.face((r.x0 + r.w / 2) * 3, (r.z0 + r.h / 2) * 3)
  })
  await until(ctx, () => window.__trailer.state().boss?.started, undefined, 15_000)
  await settle(ctx, 4000)
  await until(ctx, () => window.__trailer.phase() === 'play', undefined, 30_000)
}

/** The Grand Master straight into its fight, `hp` per part (footL, footR, body, armL, armR, head; -1 = full). */
const enterGrandMaster = async (ctx, hp) => {
  await enterVex(ctx)
  await T(ctx, (hp) => {
    const t = window.__trailer
    const m = t.m()
    const b = m.boss
    // Vex is down and gone (his fall and defeat are another shot).
    b.hp = 0; b.state = 'dead'; b.deathT = 10; b.shattered = true
    if (b.root) b.root.visible = false
    const r = m.map.rooms[m.map.terrain.bossStages[0]]
    m.finale.start((r.x0 + r.w / 2) * 3, (r.z0 + r.h / 2) * 3)
    m.finale.restore({ s: 'fight', hp: hp.map((v, i) => (v < 0 ? m.finale.parts[i].max : v * m.finale.parts[i].max)) })
  }, hp)
  await settle(ctx, 1500)
  await faceGrandMaster(ctx, 8.5, 0.22)
}

/** Flux `dist` m in front of the Grand Master (south of it), looking up at it. */
const faceGrandMaster = (ctx, dist, pitch) => T(ctx, ([dist, pitch]) => {
  const t = window.__trailer
  const m = t.m()
  const v = m.finale.root.position.clone()
  m.finale.root.getWorldPosition(v)
  t.tp(v.x, v.z + dist)
  t.face(v.x, v.z)
  m.player.pitch = pitch
}, [dist, pitch])

export const SHOTS = {
  // ── intro ───────────────────────────────────────────────────────────────

  /** Wake-Up Call: the beam-in on the Scrapyard pad, then Flux's first look round. */
  beamin: {
    async stage(ctx) {
      await boot(ctx, { level: 'boss', sector: 'scrapyard', seed: 2 })
      await T(ctx, () => {
        const t = window.__trailer
        const m = t.m()
        const pad = m.pad.root.position
        t.tp(pad.x, pad.z, m.map.start.yaw)
        // Replay the beam-in and hold it on its first frame until the take starts.
        m.enter()
        t.hold(true)
      })
      await settle(ctx, 300)
    },
    async play(ctx) {
      await T(ctx, () => window.__trailer.hold(false))
      await play(ctx, 3000)
      // His first look about the yard.
      await T(ctx, () => { window.__trailer.m().input.turn = 0.3 })
    }
  },

  // ── A: the stages ──────────────────────────────────────────────────────

  /** The Polarity Works: charge shots into a pack of machines, which blow apart. */
  brawl: {
    async stage(ctx) {
      await boot(ctx, { level: 'stage', sector: 'magnet' })
      await T(ctx, () => {
        const t = window.__trailer
        t.approach(undefined, 3.8)
        t.wake(18)
        t.soften(0.2)
        t.auto({ fire: 'mix', chargeS: 0.6, strafe: 0.6, strafePeriod: 2.0, closeTo: 4 })
      })
      await settle(ctx, 500)
      await logState(ctx, 'staged')
    },
    async play(ctx) { await play(ctx, 1500) }
  },

  rotor: rideShot('rotor', { at: 0.5 }),

  /** Meltdown Descent: the forge hammers slam across the walkway ahead. */
  forge: {
    async stage(ctx) {
      await boot(ctx, { level: 'stage', sector: 'blaze' })
      await T(ctx, () => {
        const t = window.__trailer
        const m = t.m()
        const cr = m.map.terrain.crushers.filter((c) => c.room === 4)
        const cp = m.map.terrain.checkpoints.find((c) => c.room === 4)
        if (!cr.length || !cp) return
        const first = cr[0]
        // A few metres before the first hammer, looking down the line of them.
        const fx = t.cell(first.i)
        const fz = t.cell(first.j)
        const dx = fx - cp.x
        const dz = fz - cp.z
        const l = Math.hypot(dx, dz) || 1
        t.tp(fx - (dx / l) * 5.5, fz - (dz / l) * 5.5)
        const last = cr[cr.length - 1]
        t.face(t.cell(last.i), t.cell(last.j))
      })
      await T(ctx, () => window.__trailer.auto({ fire: 'none', strafe: 0, closeTo: 0 }))
      await settle(ctx, 400)
      await logState(ctx, 'forge')
    },
    async play(ctx) {
      // Flux holds at the edge of the first hammer's reach: they slam, one after another.
    }
  },

  /** Glacier Run: icicles ring, drop and shatter around Flux on the ice. */
  glacier: {
    async stage(ctx) {
      await boot(ctx, { level: 'stage', sector: 'cryo' })
      await T(ctx, () => {
        const t = window.__trailer
        const m = t.m()
        const f = m.climb.features.find((x) => x.icicles)
        const cp = m.map.terrain.checkpoints.find((c) => c.room === 4)
        if (!f || !cp) return
        const ic = f.icicles
        const cx = ic.reduce((s, k) => s + k.x, 0) / ic.length
        const cz = ic.reduce((s, k) => s + k.z, 0) / ic.length
        t.tp(cp.x, cp.z)
        t.face(cx, cz)
      })
      await settle(ctx, 1200)
      await logState(ctx, 'glacier')
    },
    async play(ctx) {
      await T(ctx, () => { window.__trailer.m().input.moveY = 0.6 })
    }
  },

  /** A crate that isn't: the Crate Golem unfolds, throws, and falls to charge shots. */
  golem: {
    async stage(ctx) {
      for (const seed of [5, 7, 11, 13, 17, 3]) {
        await boot(ctx, { level: 'boss', sector: 'scrapyard', seed })
        const found = await T(ctx, () => {
          const t = window.__trailer
          const g = t.m().enemies.find((e) => e.golem && e.dormant && e.state !== 'dead')
          if (!g) return false
          window.__golem = g
          // In clear sight of it, 6 m out; nothing else of the room's in the way.
          if (!t.approach(g, 4.5)) return false
          t.face(g.x, g.z)
          t.m().player.pitch = -0.08
          return true
        })
        if (found) break
        ctx.log.warn(`golem: none asleep at seed ${seed}`)
      }
      await settle(ctx, 300)
      await logState(ctx, 'golem')
    },
    async play(ctx) {
      await play(ctx, 250)
      await T(ctx, () => {
        const t = window.__trailer
        t.wakeGolem(window.__golem)
        t.m().combat.target = window.__golem
      })
      await play(ctx, 1300)
      await T(ctx, () => {
        const g = window.__golem
        g.hp = Math.max(1, Math.round(g.maxHp * 0.12))
        window.__trailer.auto({ fire: 'charge', chargeS: 0.6, strafe: 0.5, strafePeriod: 2.2 })
      })
    }
  },

  // ── B: loot, then the Masters ──────────────────────────────────────────

  /** A secret solved: the false wall sinks under a shaft of light. */
  secret: {
    async stage(ctx) {
      await boot(ctx, { level: 'stage', sector: 'cryo' })
      await T(ctx, () => {
        const t = window.__trailer
        const m = t.m()
        const sf = m.climb.features.find((f) => f.isSolved)
        const rt = sf?.list?.[0]
        if (!rt) return
        window.__secret = { sf, rt }
        // Square on to the false wall, the lamp buttons and the panel in frame.
        const n = rt.spec.panel
        t.tp(rt.fx + n.nx * 7.5, rt.fz + n.nz * 7.5)
        t.face(rt.fx, rt.fz)
        t.m().player.pitch = 0.08
        t.clearAdds(25)
      })
      await settle(ctx, 300)
      await logState(ctx, 'secret')
    },
    async play(ctx) {
      // The last lamp takes its hit: the puzzle solves, blinks green, the wall sinks.
      await T(ctx, () => {
        const { sf, rt } = window.__secret
        const i = rt.spec.buttons.length - 1
        rt.state.forEach((_, k) => { if (k !== i) rt.state[k] = rt.spec.target[k] })
        const m = window.__trailer.m()
        m.input.firePressed = true
        m.input.fireReleased = true
        sf.solve(rt)
      })
      await play(ctx, 600)
      await T(ctx, () => { window.__trailer.m().input.moveY = 0.6 })
    }
  },

  /** A borrowed weapon in its glass capsule: Flux walks in and takes it. */
  capsule: {
    async stage(ctx) {
      await boot(ctx, { level: 'stage', sector: 'magnet' })
      const ok = await T(ctx, () => {
        const t = window.__trailer
        const m = t.m()
        const c = m.borrowed?.capsules?.find((k) => !k.taken)
        if (!c) return false
        const v = c.view.root.position.clone()
        c.view.root.getWorldPosition(v)
        // 4 m out on the open side (the capsule sits against the stage's edge).
        t.tp(v.x + 4, v.z)
        t.clearAdds(25)
        t.face(v.x, v.z)
        m.player.pitch = 0
        return true
      })
      if (!ok) ctx.log.warn('capsule: none on this stage')
      await settle(ctx, 300)
    },
    async play(ctx) {
      await play(ctx, 200)
      await T(ctx, () => { window.__trailer.m().input.moveY = 1 })
    }
  },

  /** The shutter's klaxon, the walk in, the Scrapper's drop with its shock ring. */
  bossdoor: {
    async stage(ctx) {
      await boot(ctx, { level: 'boss', sector: 'scrapyard', seed: 2 })
      await T(ctx, () => window.__trailer.arm(['iceLance', 'neonBlade']))
      await T(ctx, () => {
        const t = window.__trailer
        const m = t.m()
        const d = m.doors.find((o) => o.mesh?.boss)
        if (!d) return
        // Straight down the corridor at the shutter, 6.5 m out (its axis decides which way).
        const room = m.bossRoom
        const inside = d.axis === 'z' ? Math.sign((room.z0 + room.h / 2) * 3 - d.z) : Math.sign((room.x0 + room.w / 2) * 3 - d.x)
        const x = d.axis === 'z' ? d.x : d.x - inside * 6.5
        const z = d.axis === 'z' ? d.z - inside * 6.5 : d.z
        t.tp(x, z)
        t.face(d.x, d.z)
        t.clearAdds(20)
        m.bossWarned = false
      })
      await settle(ctx, 200)
    },
    async play(ctx) {
      await T(ctx, () => { window.__trailer.m().input.moveY = 1 })
      await ctx.stepUntil(() => window.__trailer.state().boss?.started, { timeoutMs: 2400 })
      await T(ctx, () => {
        const m = window.__trailer.m()
        m.input.moveY = 0.25
        m.player.pitch = 0.18
      })
      await play(ctx, 900)
      await T(ctx, () => { window.__trailer.m().input.moveY = 0 })
    }
  },

  blaze: masterShot('blaze', { attacks: ['fireWave', 'flameRing', 'leapSlam'] }),
  volt: masterShot('volt', { attacks: ['chainBolt', 'orbStorm', 'voltRing'], weapons: ['iceLance', 'droneSwarm'] }),
  neonboss: masterShot('neon', { attacks: ['laserGrid', 'bladeBoomerang'], weapons: ['bubbleLance', 'neonBlade'] }),
  rotorboss: masterShot('rotor', { attacks: ['droneSwarm', 'rotorStorm', 'dive'], weapons: ['neonBlade', 'droneSwarm'] }),

  // ── C: a Master falls, the Fortress, Vex ───────────────────────────────

  /** The Frost Master's last hit: ripple explosions, the shatter, the weapon copied onto the arm. */
  shatter: {
    async stage(ctx) {
      await enterMaster(ctx, 'cryo', ['flameWave', 'neonBlade'])
      // Into phase 2 now, so its roar plays off camera and not over the kill.
      await T(ctx, () => window.__trailer.bossHp(0.3))
      await T(ctx, () => window.__trailer.auto({ fire: 'rapid', strafe: 0 }))
      await settle(ctx, 3500)
      await T(ctx, () => window.__trailer.clearAdds())
      await T(ctx, () => window.__trailer.approach(['boss'], 5.5))
      // A full charge, held for the take.
      await T(ctx, () => window.__trailer.auto({ fire: 'charge', chargeS: 99, strafe: 0, closeTo: 0 }))
      await settle(ctx, 1600)
      await logState(ctx, 'charged')
    },
    async play(ctx) {
      await play(ctx, 200)
      await T(ctx, () => {
        window.__trailer.bossHp(0.001)
        window.__trailer.auto({ chargeS: 0 })
      })
      await play(ctx, 400)
      await T(ctx, () => window.__trailer.auto({ fire: 'none' }))
      await logState(ctx, 'down')
    }
  },

  /** The Vex Fortress: a slow rise over the beach toward the red-and-black walls. */
  fortress: {
    async stage(ctx) {
      await boot(ctx, { level: 'stage', sector: 'fortress' })
      await T(ctx, () => {
        const t = window.__trailer
        const m = t.m()
        // High over the beach (the stage's first room, by the landing), sweeping
        // west over the gate court and the moat to the wall and the Spire city.
        const r = m.map.rooms[0]
        const x1 = (r.x0 + r.w) * 3
        const z0 = r.z0 * 3
        const wall = m.map.rooms[3]
        const wx = (wall.x0 + wall.w / 2) * 3
        const wz = (wall.z0 + wall.h / 2) * 3
        const a = [x1 + 1, 18, z0 + 3, wx + 10, 8, wz - 6]
        const b = [x1 - 14, 13, z0 + 6, wx, 9, wz]
        window.__fortressCam = [a, b]
        t.cam(a)
      })
      await settle(ctx, 500)
    },
    async play(ctx) {
      await T(ctx, () => window.__trailer.camMove(...window.__fortressCam, 3.6))
    }
  },

  /** Dr. Vex Mk-I on the storm roof — and the roof gives way under them both. */
  vex: {
    async stage(ctx) {
      await enterVex(ctx)
      await T(ctx, () => {
        const t = window.__trailer
        t.bossHp(0.7)
        t.approach(['boss'], 4.5)
        t.auto({ fire: 'mix', chargeS: 0.8, strafe: 0.6, strafePeriod: 2.2, weapon: 1, weaponEvery: 2.5 })
      })
      await settle(ctx, 800)
      await logState(ctx, 'vex')
    },
    async play(ctx) {
      await play(ctx, 1500)
      await T(ctx, () => {
        const m = window.__trailer.m()
        m.descent.startFall(m.boss)
      })
      await play(ctx, 600)
      await logState(ctx, 'falling')
    }
  },

  /** Ten Masters' bodies drop out of the sky and lock into the Grand Master Bot. */
  gmrise: {
    async stage(ctx) {
      await enterVex(ctx)
      await T(ctx, () => {
        const t = window.__trailer
        t.auto(null)
        const m = t.m()
        m.system.killEnemy(m.boss)
      })
      // Vex's defeat, the red button, the rumble, the blackout: off camera.
      await until(ctx, () => window.__trailer.m().finale?.state === 'intro', undefined, 15_000)
      await settle(ctx, 9100)
      await faceGrandMaster(ctx, 11, 0.32)
      await logState(ctx, 'assembly')
    }
  },

  // ── A2: the Grand Master ───────────────────────────────────────────────

  /** Head phase: the Prism Cannon's ring of ten colours, then the sweep. */
  prism: {
    async stage(ctx) {
      await enterGrandMaster(ctx, [0, 0, -1, 0, 0, 0.7])
      await T(ctx, () => window.__trailer.auto({ fire: 'mix', chargeS: 0.8, strafe: 0.5, strafePeriod: 2.4, weapon: 2, weaponEvery: 2.2 }))
      await settle(ctx, 800)
      await T(ctx, () => { window.__trailer.m().finale.prismT = 0.15 })
      await logState(ctx, 'prism')
    }
  },

  /** Core phase: the core is open — full charge shots straight into it. */
  gmcore: {
    async stage(ctx) {
      await enterGrandMaster(ctx, [0, 0, 0.8, 0, 0, 0])
      await T(ctx, () => window.__trailer.auto({ fire: 'charge', chargeS: 0.7, strafe: 0.6, strafePeriod: 2.0, weapon: 1, weaponEvery: 1.6 }))
      await settle(ctx, 1200)
      await logState(ctx, 'core')
    }
  },

  // ── the ride out ───────────────────────────────────────────────────────

  /** The exit drone: it swoops in, Flux hops on, cheers, and they lift off over the city. */
  exit: {
    async stage(ctx) {
      await boot(ctx, { level: 'stage', sector: 'gale' })
      await T(ctx, () => {
        const t = window.__trailer
        const m = t.m()
        t.clearAdds(500)
        m.objects.objective.done = true
        m.beamOut()
      })
      // The drone's approach and Flux's walk play off camera; the take opens
      // half a second before the hop (the walk's length varies with the spot).
      await until(ctx, () => {
        const x = window.__trailer.m().exit
        return !!x.plan && x.time >= x.plan.tHop - 0.5
      }, undefined, 15_000)
      await logState(ctx, 'exit')
    }
  },

  /** Development probe: any sector's stage, the autopilot on the nearest machine. */
  probe: {
    async stage(ctx) {
      await boot(ctx, { sector: process.env.PROBE_SECTOR ?? 'neon' })
      await T(ctx, () => {
        window.__trailer.approach(undefined, 7)
        window.__trailer.wake(14)
        window.__trailer.auto({ fire: 'mix', chargeS: 1.1, strafe: 0.6, strafePeriod: 2.2 })
      })
      await settle(ctx, 1200)
      await logState(ctx, 'staged')
    },
    async play(ctx) { await play(ctx, 2000) }
  }
}
