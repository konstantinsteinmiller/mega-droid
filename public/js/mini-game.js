/* Loading-time mini-game (#Mini1): Flux blasts machines while the game loads.
   A classic script, no images: all Canvas 2D, drawn in the game's toon look
   (flat fills, a shade tone, a highlight, ink outlines) after the real models:
   models/hero.ts, models/enemies.ts (buildHeli, buildHardhat, buildBrute,
   buildGolem), the shots after fx/chargedShot.ts (pellet, charge2).
   Tap = shot, hold + release = charged shot (3x damage, 50% faster). A killed
   machine pops into bolts, the next, stronger one drops in: rotor drone, hard
   hat, guardroid, crate golem, loop. index.html's splash and the in-app
   loaders (LoaderMiniGame.vue) share it through window.mdMini; the state
   lives there, so a hand-over continues the fight (and a held charge). run(canvas)
   returns stop(); it also stops itself once the canvas leaves the page. */
(function (w) {
  var HP = [3, 5, 8, 12], CH = 0.45, FX = 30, PI = Math.PI, T2 = PI * 2, V = 210, VC = V * 1.5
  var calm = w.matchMedia && w.matchMedia('(prefers-reduced-motion: reduce)').matches
  var hpOf = function (k, lap) { return Math.round(HP[k] * (1 + lap * 0.6)) }
  /* who: what holds the charge (a pointerId, or 'k' for a key), null = none */
  var M = function () { return { k: 0, lap: 0, hp: 3, sh: [], pt: [], die: 0, drop: 1, t: 0, hold: -1, who: null, kx: 0, fl: 0, rec: 0 } }
  var fire = function (S, ch) { S.sh.push({ x: FX + 29, c: ch ? 1 : 0 }); S.rec = 1 }
  var next = function (S) { S.k = (S.k + 1) % 4; if (!S.k) S.lap++; S.hp = hpOf(S.k, S.lap); S.drop = 1 }
  var burst = function (S, x, y, n, big) {
    for (var i = 0; i < n; i++) {
      var a = -PI / 2 + (Math.random() - 0.5) * (big ? 2.4 : 1.6), v = (big ? 70 : 40) + Math.random() * (big ? 70 : 30)
      S.pt.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: Math.random() * T2, vr: (Math.random() - 0.5) * 14, l: 1, b: big ? (i % 3 ? 1 : 2) : 0 })
    }
  }
  /* Advance dt seconds; W = the field's width (the machine stands at W - 34). */
  var step = function (S, dt, W) {
    var mx = W - 34, i, p
    S.t += dt; S.kx *= Math.pow(0.002, dt); S.fl = Math.max(0, S.fl - dt * 5); S.rec = Math.max(0, S.rec - dt * 6)
    if (S.drop) S.drop = Math.max(0, S.drop - dt * 2.5)
    for (i = S.sh.length; i--;) {
      p = S.sh[i]; p.x += dt * (p.c ? VC : V)
      if (p.x >= mx - 14 && !S.die && !S.drop) {
        S.sh.splice(i, 1); S.hp -= p.c ? 3 : 1; S.kx = p.c ? 9 : 4; S.fl = 1
        burst(S, mx - 14, 64, calm ? 2 : p.c ? 8 : 4, 0)
        if (S.hp <= 0) { S.die = 1; burst(S, mx, 62, calm ? 8 : 26, 1) }
      } else if (p.x > W + 20) S.sh.splice(i, 1)
    }
    if (S.die && (S.die -= dt * 1.1) <= 0) { S.die = 0; next(S) }
    for (i = S.pt.length; i--;) {
      p = S.pt[i]; p.vy += 160 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt; p.l -= dt * (p.b ? 0.7 : 2.6)
      if (p.l <= 0) S.pt.splice(i, 1)
    }
  }

  var c, INK = '#141a33', K = '#161a22'
  var path = function () { c.beginPath() }
  var paint = function (f, s, lw) { if (f) { c.fillStyle = f; c.fill() } if (s) { c.lineWidth = lw || 1.5; c.strokeStyle = s; c.stroke() } }
  var el = function (x, y, rx, ry, f, s, lw) { path(); c.ellipse(x, y, rx, ry, 0, 0, T2); paint(f, s, lw) }
  var rr = function (x, y, ww, hh, r, f, s, lw) { path(); c.roundRect ? c.roundRect(x, y, ww, hh, r) : c.rect(x, y, ww, hh); paint(f, s, lw) }
  /* Toon shading, the light from the upper left: the shade tone, the lit
     base inset toward the light, a highlight, the ink outline. */
  var te = function (x, y, rx, ry, b, d, h) {
    el(x, y, rx, ry, d); el(x - rx * 0.1, y - ry * 0.12, rx * 0.88, ry * 0.86, b)
    if (h) el(x - rx * 0.35, y - ry * 0.48, rx * 0.34, ry * 0.2, h)
    el(x, y, rx, ry, 0, INK)
  }
  var tr = function (x, y, ww, hh, r, b, d, h) {
    rr(x, y, ww, hh, r, d); rr(x, y, ww * 0.86, hh * 0.74, r, b)
    if (h) rr(x + ww * 0.15, y + hh * 0.14, ww * 0.42, Math.max(1, hh * 0.13), r / 3, h)
    rr(x, y, ww, hh, r, 0, INK)
  }
  /* Additive glow, so it brightens whatever is under it. */
  var glow = function (x, y, r, col) {
    var g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)')
    c.globalCompositeOperation = 'lighter'; el(x, y, r, r, g); c.globalCompositeOperation = 'source-over'
  }
  var hex = function (x, y, r, f) { path(); for (var i = 0; i < 6; i++) c.lineTo(x + Math.cos(i * PI / 3) * r, y + Math.sin(i * PI / 3) * r); c.closePath(); paint(f, INK, 1) }
  var P = '#f5f4f1', PD = '#c3c6cf', SU = '#3a3f4b'

  /* Flux, feet at (0,0), facing right: pearl shells over the graphite suit,
     the big round helmet, the visor band with his plasma eyes, the buster. */
  var flux = function (S) {
    var b = calm ? 0 : Math.sin(S.t * 3) * 0.8, k = -S.rec * 2.5, hold = S.hold >= 0 ? Math.min(1, (S.t - S.hold) / CH) : 0
    var bl = (S.t % 4) > 3.86 ? 0.15 : 1
    el(0, 0, 17, 3, 'rgba(0,0,0,.3)')
    rr(-8, -15, 15, 6, 3, SU)
    tr(-9, -13, 7, 10, 3, P, PD); te(-6, -3, 6, 3.4, P, PD)
    tr(1, -13, 7, 10, 3, P, PD); te(6, -3, 7, 3.6, P, PD, '#fff')
    c.save(); c.translate(k, b)
    te(-10, -24, 4, 6, P, PD)
    te(-1, -24, 10, 9, P, PD, '#fff')
    rr(-3, -31, 12, 10, 4, SU, INK, 1)
    glow(6, -26, 7, 'rgba(255,167,51,.7)'); hex(6, -26, 3.4, '#ffa733'); el(5.4, -26.6, 1.2, 1.2, '#fff0cc')
    rr(-3, -34, 7, 4, 2, '#252932')
    /* the helmet, its seam, the ear pod behind */
    te(1, -48, 20, 19, P, PD, '#fff')
    path(); c.moveTo(-6, -66); c.quadraticCurveTo(-13, -56, -13, -47); paint(0, 'rgba(22,26,34,.45)', 1.1)
    te(-15, -46, 5, 6.5, P, PD); el(-15.5, -46, 2.4, 3.2, K); el(-15.5, -46, 1, 1.4, '#ffa733')
    /* the visor band, wrapped round the front, his two plasma eyes */
    rr(-11, -54, 34, 13, 6.5, K, INK)
    rr(-6, -52.5, 22, 2, 1, '#46434f')
    var eye = function (x, r) {
      glow(x, -47, r * 2.2, 'rgba(255,167,51,.6)')
      el(x, -47, r, r * 1.1 * bl, '#b04205'); el(x, -47.2, r * 0.8, r * 0.9 * bl, '#ffcd16'); el(x - r * 0.15, -47.6, r * 0.45, r * 0.5 * bl, '#fffdc4')
    }
    eye(6, 3.3); eye(16, 4.4)
    /* the pearl chin plate under the band: a shield-shaped jaw, no mouth */
    var jaw = function (d) { path(); c.moveTo(1 + d, -42); c.lineTo(21 - d, -42); c.quadraticCurveTo(20 - d, -34 + d, 12, -31.5 + d); c.quadraticCurveTo(3 + d, -33 + d, 1 + d, -42) }
    jaw(0); paint(PD); jaw(2.2); paint(P); jaw(0); paint(0, INK)
    /* the buster (his right arm, in front): pearl barrel, a suit band, the
       dark muzzle with its plasma ring */
    te(3, -26, 5.5, 5.5, P, PD)
    tr(4, -28, 22, 12, 6, P, PD, '#fff')
    rr(13, -28.5, 4, 13, 1.5, SU, INK, 1)
    rr(24, -27, 6, 10, 3, SU, INK)
    var cc = hold >= 1 ? '#7ff4ff' : hold ? '#c8ff7a' : '#ffa733'
    el(29.5, -22, 2.2, 4.4, 0, S.rec && !hold ? '#fff0cc' : cc, 1.8)
    if (hold) {
      var R = 4 + hold * 9, f = hold >= 1 && S.t % 0.16 < 0.08
      glow(31, -22, R * 1.8, hold >= 1 ? 'rgba(60,224,255,.9)' : 'rgba(157,255,90,.8)')
      if (!calm) for (var i = 0; i < 3; i++) {
        var a = S.t * 9 + i * 2.1, d = R * (1.6 - (S.t * 3 + i / 3) % 1)
        el(31 + Math.cos(a) * d, -22 + Math.sin(a) * d, 1, 1, '#fff')
      }
      el(31, -22, R * 0.45, R * 0.45, f ? '#fff' : hold >= 1 ? '#e6fbff' : '#eaffb0')
    }
    c.restore()
  }

  var eye = function (x, y, r, iris) { el(x, y, r, r * 1.1, '#fff', INK); el(x - r * 0.3, y, r * 0.6, r * 0.7, iris || '#0b1433'); el(x - r * 0.45, y - r * 0.3, r * 0.2, r * 0.2, '#fff') }
  /* The machines, ground (0,0), facing left (toward Flux). */
  var mach = function (S, k) {
    var t = S.t, h = calm ? 0 : Math.sin(t * 2.4), i
    el(0, 0, k === 2 ? 22 : 15, 3, 'rgba(0,0,0,.3)')
    if (k === 0) { /* rotor drone: red ball, dark-red band, metal belly, one big eye, yellow rotor, claws */
      c.translate(0, -38 + h * 3)
      for (i = -1; i < 2; i += 2) { rr(i * 6 - 1.5, 6, 3, 9, 1.5, '#7f8ba3', INK, 1); te(i * 6, 16, 3.4, 2.4, '#e83a3a', '#a51f2c') }
      te(0, 7, 12, 6, '#7f8ba3', '#5d6a82')
      te(0, 0, 15, 13.5, '#e83a3a', '#a51f2c', '#ff8f86')
      rr(-15.5, 1, 31, 3.6, 1.8, '#a51f2c', INK, 1)
      eye(-8, -2.5, 5.5, '#fff27a'); el(-10.5, -2.5, 1.4, 2.4, '#0b1433')
      rr(-1.5, -19, 3, 6.5, 1, '#7f8ba3', INK, 1)
      var sw = calm ? 18 : Math.cos(t * 30) * 22
      if (!calm) el(0, -20, 23, 2.4, 'rgba(255,210,58,.3)')
      el(0, -20, Math.abs(sw) + 2, 1.7, '#ffd23a', INK, 1); el(0, -20, 3.2, 2.6, '#ffd23a', INK, 1)
    } else if (k === 1) { /* hard hat: striped yellow dome on a slate body, orange feet, front ring */
      var pk = calm ? 1 : Math.max(0, Math.sin(t * 1.3)) * 4
      te(-6, -3, 6.5, 3.6, '#ff7a1f', '#c25a00'); te(6, -3, 6.5, 3.6, '#ff7a1f', '#c25a00')
      te(0, -12, 14, 10, '#4a5570', '#2f3850')
      eye(-8, -14, 3.2); eye(-0.5, -14, 3.2)
      el(-11.5, -7, 3, 3, '#2a3042', '#ff7a1f', 1.6)
      c.translate(0, -15 - pk)
      path(); c.ellipse(0, 0, 18, 18, 0, PI, T2); paint('#e08a00')
      path(); c.ellipse(-1.6, 0, 16, 16.4, 0, PI, T2); paint('#ffc21a')
      rr(-3.5, -16.5, 6, 16.5, 1, '#e08a00')
      el(-8, -11, 4, 2.2, '#ffe680')
      path(); c.ellipse(0, 0, 18, 18, 0, PI, T2); c.closePath(); paint(0, INK)
      tr(-20, -2.5, 40, 5, 2.5, '#e08a00', '#b06a00')
      te(0, -18, 3.4, 2.8, '#e08a00', '#b06a00')
    } else if (k === 2) { /* guardroid: slate hulk, orange-ringed shoulders, red core, visor slit */
      c.translate(0, h * 0.8)
      var G = '#8f9bb3', GD = '#56617a', GH = '#c3cbdb', GX = '#3e475c'
      te(13, -45, 9, 9, GD, GX); te(16, -21, 8, 7.5, G, GD)
      tr(-11, -21, 8, 15, 3, G, GD); tr(3, -21, 8, 15, 3, G, GD)
      te(-9, -4, 9.5, 4.6, G, GD, GH); te(7, -4, 9, 4.6, G, GD)
      te(0, -22, 13, 6, GD, GX)
      te(0, -38, 19, 16, G, GD, GH)
      glow(-3, -31, 11, 'rgba(255,64,80,.7)')
      el(-3, -31, 5.4, 5.4, '#ff4050', '#ff8a2a', 2.4); el(-4.5, -32.5, 1.6, 1.6, '#fff')
      te(-2, -57, 9, 7.5, G, GD, GH)
      rr(-11.5, -59, 10, 4.4, 2.2, '#1d2438'); rr(-10.5, -58, 7, 2, 1, '#ff4050'); glow(-7, -57, 6, 'rgba(255,64,80,.6)')
      te(-12, -44, 9.5, 9.5, GD, GX, '#8f9bb3')
      el(-12.5, -44, 3, 9, 0, '#ff8a2a', 2.2)
      tr(-17, -37, 9, 13, 4.5, G, GD)
      rr(-18, -27, 11, 3, 1.5, '#ff8a2a', INK, 1)
      te(-14, -18, 9.5, 8.5, G, GD, GH)
    } else { /* crate golem: the Scrapyard crate on stone legs, jaw dropped on its glowing visor */
      c.translate(0, -h * 0.6)
      var ST = '#8e877b', SD = '#6b655b', WD = '#5f4630'
      for (i = -1; i < 2; i += 2) { tr(i * 8 - 4, -18, 8, 18, 3, ST, SD); rr(i * 8 - 5, -9, 10, 3, 1.5, '#646b7a', INK, 1) }
      tr(14, -36, 7, 14, 3.5, ST, SD)
      c.save(); c.translate(18, -52); c.rotate(0.38); tr(-35, -8, 36, 8, 4, '#c68a3e', '#9a6a2c'); c.restore()
      glow(2, -53, 9, 'rgba(255,207,90,.8)')
      tr(-18, -53, 36, 36, 6, '#c68a3e', '#9a6a2c', '#dcae6e')
      rr(-17, -41, 34, 1.4, 0, 'rgba(95,70,48,.5)'); rr(-17, -29, 34, 1.4, 0, 'rgba(95,70,48,.5)')
      for (i = 0; i < 4; i++) te(i % 2 ? 15 : -15, i < 2 ? -50 : -20, 4.6, 4.6, WD, '#3e2d1f')
      rr(-16, -44, 20, 7, 3.5, K, INK, 1); rr(-14, -41.5, 14, 2, 1, '#ffcf5a'); glow(-7, -40.5, 8, 'rgba(255,207,90,.6)')
      tr(-25, -35, 8, 14, 4, ST, SD); rr(-26, -27, 10, 3, 1.5, '#646b7a', INK, 1); te(-21, -19, 6, 5.5, ST, SD, '#b3ada1')
      el(-22, -22, 9, 3.4, WD, INK); el(-26, -23, 2.2, 1.3, '#ffcf5a')
    }
  }
  var bolt = function (p) {
    c.save(); c.translate(p.x, p.y); c.rotate(p.r); c.globalAlpha = Math.min(1, p.l * 2)
    if (!p.b) el(0, 0, 1.6, 1.6, '#fff6b0')
    else if (p.b === 1) { hex(0, 0, 3, '#c3cad4'); el(0, 0, 1.2, 1.2, '#3b4458') }
    else { rr(-1, -1, 2, 7, 0.6, '#9aa7bd', INK, 0.8); rr(-2.6, -2.5, 5.2, 2.5, 0.8, '#c3cad4', INK, 0.8) }
    c.restore()
  }
  /* The buster's shots (fx/chargedShot.ts): the pellet, yellow; the charged
     shot, cyan with a ring. Both trail a streak back toward the muzzle. */
  var shot = function (p) {
    var x = p.x, y = 68, L = p.c ? 30 : 14, g = c.createLinearGradient(x - L, 0, x, 0)
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, p.c ? 'rgba(60,224,255,.8)' : 'rgba(255,224,102,.75)')
    c.globalCompositeOperation = 'lighter'; rr(x - L, y - (p.c ? 5 : 2), L, p.c ? 10 : 4, p.c ? 5 : 2, g); c.globalCompositeOperation = 'source-over'
    if (p.c) {
      glow(x, y, 19, 'rgba(60,224,255,.85)')
      el(x, y, 10 + Math.sin(x * 0.3), 9, 0, '#7ff4ff', 2)
      el(x, y, 7, 6.2, '#e6fbff'); el(x - 1.5, y - 1.5, 3, 2.6, '#fff')
    } else { glow(x, y, 8, 'rgba(255,224,102,.8)'); el(x, y, 4.2, 3, '#fff6b0', '#ffe066', 1); el(x - 0.8, y - 0.6, 1.6, 1.2, '#fff') }
  }
  var draw = function (cx, S, W, s) {
    c = cx; c.setTransform(s, 0, 0, s, 0, 0); c.clearRect(0, 0, W, 100); c.lineJoin = c.lineCap = 'round'
    var mx = W - 34
    c.fillStyle = 'rgba(120,160,230,.18)'; c.fillRect(6, 90, W - 12, 1.5)
    c.save(); c.translate(FX, 90); flux(S); c.restore()
    for (var i = 0; i < S.sh.length; i++) shot(S.sh[i])
    if (!S.die) {
      c.save(); c.translate(mx + S.kx, 90 - S.drop * S.drop * 100)
      var sc = 1 + S.lap * 0.08; c.scale(sc, sc)
      mach(S, S.k)
      c.restore()
      if (S.fl) { c.globalAlpha = S.fl * 0.5; glow(mx - 10, 60, 18, 'rgba(255,255,255,.9)'); c.globalAlpha = 1 }
    }
    if (S.die > 0.6) { c.globalAlpha = (S.die - 0.6) * 2.5; glow(mx, 60, 34, 'rgba(255,214,140,.9)'); c.globalAlpha = 1 }
    for (i = 0; i < S.pt.length; i++) bolt(S.pt[i])
  }

  var run = function (cv) {
    var S = mdMini.S || (mdMini.S = M()), cx = cv.getContext && cv.getContext('2d'), raf = 0, last = 0, on = 1
    if (!cx) return function () {}
    var frame = function (now) {
      raf = 0
      if (!cv.isConnected) return stop()
      var dpr = w.devicePixelRatio || 1, cw = cv.clientWidth, ch = cv.clientHeight
      if (cw && ch) {
        var bw = Math.round(cw * dpr), bh = Math.round(ch * dpr)
        if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh }
        var W = cw / ch * 100
        step(S, Math.min(0.05, last ? (now - last) / 1000 : 0), W)
        draw(cx, S, W, bh / 100)
      }
      last = now
      if (on && !document.hidden) raf = requestAnimationFrame(frame)
    }
    /* Any press anywhere in the window while a loader is up plays: a mouse
       button, a finger (pen), any key. Window listeners in the capture phase,
       so nothing on the page can swallow them, and the release counts wherever
       it lands, even outside the window. One input holds the charge (one
       finger of several, one key; auto-repeat ignored) and only its release
       fires. A cancel (the browser took the touch, the window lost focus, the
       tab hid) drops the charge without a shot. Only the newest run owns the
       input (the splash hands over to a Vue loader). Nothing is prevented on a
       press outside the canvas, so a loader's buttons still get their clicks;
       while a charge is held, a drag, a selection, a long-press menu and a
       touch scroll or pinch are held off so they cannot cancel it. */
    var id = mdMini.n = (mdMini.n || 0) + 1
    var mine = function () { return on && mdMini.n === id }
    var held = function () { return mine() && S.hold >= 0 }
    var press = function (who) { if (S.hold < 0) { S.hold = S.t; S.who = who } }
    var release = function (who, shoot) { if (!held() || S.who !== who) return; if (shoot) fire(S, S.t - S.hold >= CH); S.hold = -1; S.who = null }
    var pdown = function (e) {
      if (!mine() || e.button > 0) return
      if (e.target === cv) e.preventDefault()
      press(e.pointerId)
    }
    var cancel = function () { if (held()) { S.hold = -1; S.who = null } }
    var block = function (e) { if (held()) e.preventDefault() }
    var vis = function () {
      if (document.hidden) return cancel()
      if (on && !raf) { last = 0; raf = requestAnimationFrame(frame) }
    }
    var o = { capture: true, passive: false }
    var L = [
      [w, 'pointerdown', pdown], [w, 'pointerup', function (e) { release(e.pointerId, 1) }],
      [w, 'pointercancel', function (e) { release(e.pointerId) }],
      [w, 'keydown', function (e) { if (mine() && !e.repeat) press('k') }], [w, 'keyup', function () { release('k', 1) }],
      [w, 'blur', cancel], [w, 'touchmove', block], [w, 'dragstart', block], [w, 'selectstart', block], [w, 'contextmenu', block],
      [document, 'visibilitychange', vis]
    ]
    var stop = function () {
      if (!on) return
      cancel(); on = 0
      if (raf) cancelAnimationFrame(raf)
      L.forEach(function (l) { l[0].removeEventListener(l[1], l[2], o) })
    }
    L.forEach(function (l) { l[0].addEventListener(l[1], l[2], o) })
    /* The first frame now, not on the next one: a loader that is up for a
       moment still shows the fight. */
    if (!document.hidden) frame(w.performance ? performance.now() : 0)
    return stop
  }
  var mdMini = w.mdMini = { run: run, S: null, M: M, step: step, fire: fire, next: next, hpOf: hpOf, CH: CH, V: V, VC: VC }
  var cv = document.querySelector('#static-splash canvas')
  if (cv) run(cv)
})(window)
