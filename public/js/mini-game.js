/* Loading-time mini-game (#Mini1): Flux blasts machines while the game loads.
   A classic script, no images: all Canvas 2D. Tap = shot, hold + release =
   charged shot (3x damage). A killed machine pops into bolts, the next,
   stronger one drops in: rotor drone, hard hat, guardroid, crate golem, loop.
   index.html's splash and the in-app loaders (LoaderMiniGame.vue) share it
   through window.mdMini; the state lives there, so a hand-over continues the
   fight. run(canvas) returns stop(); it also stops itself once the canvas
   leaves the page. Colours: src/game/models/palette.ts + enemies.ts. */
(function (w) {
  var HP = [3, 5, 8, 12], CH = 0.45, FX = 30, PI = Math.PI, T2 = PI * 2
  var calm = w.matchMedia && w.matchMedia('(prefers-reduced-motion: reduce)').matches
  var hpOf = function (k, lap) { return Math.round(HP[k] * (1 + lap * 0.6)) }
  var M = function () { return { k: 0, lap: 0, hp: 3, sh: [], pt: [], die: 0, drop: 1, t: 0, hold: -1, kx: 0, fl: 0, rec: 0 } }
  var fire = function (S, ch) { S.sh.push({ x: FX + 24, c: ch ? 1 : 0 }); S.rec = 1 }
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
      p = S.sh[i]; p.x += dt * (p.c ? 150 : 210)
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

  var c
  var path = function () { c.beginPath() }
  var el = function (x, y, rx, ry, f, s, lw) { path(); c.ellipse(x, y, rx, ry, 0, 0, T2); paint(f, s, lw) }
  var rr = function (x, y, ww, hh, r, f, s, lw) { path(); c.roundRect ? c.roundRect(x, y, ww, hh, r) : c.rect(x, y, ww, hh); paint(f, s, lw) }
  var paint = function (f, s, lw) { if (f) { c.fillStyle = f; c.fill() } if (s) { c.lineWidth = lw || 1.4; c.strokeStyle = s; c.stroke() } }
  var lg = function (y0, y1, a, b) { var g = c.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, a); g.addColorStop(1, b); return g }
  var rg = function (x, y, r, a, b) { var g = c.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r); g.addColorStop(0, a); g.addColorStop(1, b); return g }
  var glow = function (x, y, r, col) { var g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, col); g.addColorStop(1, 'rgba(255,167,51,0)'); el(x, y, r, r, g) }
  var INK = '#141823'

  /* Flux, feet at (0,0), facing right: chibi body, the big round dome. */
  var flux = function (S) {
    var b = calm ? 0 : Math.sin(S.t * 3) * 0.8, k = -S.rec * 2.5, hold = S.hold >= 0 ? Math.min(1, (S.t - S.hold) / CH) : 0
    el(0, 0, 16, 3, 'rgba(0,0,0,.3)')
    rr(-8, -11, 6, 11, 3, '#3a3f4b', INK); rr(2, -11, 6, 11, 3, '#3a3f4b', INK)
    rr(-10, -5, 9, 5, 2.5, '#f5f4f1', INK); rr(1, -5, 10, 5, 2.5, '#f5f4f1', INK)
    c.save(); c.translate(k, b)
    el(-9, -21, 4, 6, '#e6e4df', INK)
    el(0, -20, 10, 10, rg(0, -20, 11, '#fff', '#d7d9de'), INK)
    rr(-9, -16, 18, 4, 2, '#252932')
    el(0, -14, 2, 1.6, '#ffa733')
    /* head: dome, seams, band, screen, eyes, chin, ear pods */
    el(-19, -44, 5, 6.5, rg(-19, -44, 7, '#fff', '#c9ccd4'), INK); el(-19.5, -44, 2, 2.6, '#ffa733')
    el(0, -45, 21, 19, rg(0, -45, 23, '#ffffff', '#cdd1d8'), INK, 1.6)
    path(); c.moveTo(-7, -63.4); c.quadraticCurveTo(-12, -52, -12, -44); c.moveTo(7, -63.4); c.quadraticCurveTo(12, -52, 12, -44)
    paint(0, 'rgba(110,118,135,.55)', 1)
    rr(-17, -50, 36, 14, 7, '#0d0f14')
    rr(-12, -48.5, 29, 11, 5.5, lg(-48, -37, '#3a4250', '#161a22'))
    var bl = (S.t % 4) > 3.86 ? 0.15 : 1
    glow(-2, -43, 6, 'rgba(255,167,51,.55)'); glow(9, -43, 6, 'rgba(255,167,51,.55)')
    el(-2, -43, 3, 3.3 * bl, '#ffc768'); el(9, -43, 3, 3.3 * bl, '#ffc768')
    el(-2.6, -44, 1.2, 1.2 * bl, '#fff0cc'); el(8.4, -44, 1.2, 1.2 * bl, '#fff0cc')
    rr(-6, -34, 14, 5, 2.5, '#f5f4f1', INK)
    el(-7, -57, 7, 3.5, 'rgba(255,255,255,.85)')
    /* the arm cannon (his right arm, in front) */
    rr(2, -27, 24, 13, 6.5, lg(-27, -14, '#ffffff', '#bfc4cc'), INK, 1.6)
    rr(5, -25.5, 15, 3, 1.5, 'rgba(255,255,255,.9)')
    rr(23, -25, 5, 9, 2.5, '#252932', INK)
    el(28, -20.5, 1.6, 3.2, hold || S.rec ? '#fff0cc' : '#ffa733')
    if (hold) { glow(30, -20.5, 6 + hold * 9, 'rgba(255,199,104,.9)'); el(30, -20.5, 1.5 + hold * 4, 1.5 + hold * 4, hold >= 1 && S.t % 0.2 < 0.1 ? '#fff' : '#fff0cc') }
    c.restore()
  }

  var eye = function (x, y, r) { el(x, y, r, r, '#fff', INK); el(x - r * 0.25, y, r * 0.5, r * 0.55, '#0b1433') }
  /* The machines, ground (0,0), facing left (toward Flux). */
  var mach = function (S, k) {
    var t = S.t, h = calm ? 0 : Math.sin(t * 2.4)
    el(0, 0, k === 2 ? 20 : 15, 3, 'rgba(0,0,0,.3)')
    if (k === 0) { /* rotor drone: red body, metal belly, one yellow eye, yellow rotor */
      c.translate(0, -36 + h * 3)
      rr(-1.5, -20, 3, 7, 1, '#7f8ba3', INK)
      var sw = Math.abs(Math.cos(t * 30)) * 20 + 2
      el(0, -21, sw, 2, '#ffd23a', INK); el(0, -21, 3, 2.5, '#ffd23a', INK)
      rr(-8, 6, 3, 8, 1.5, '#7f8ba3', INK); rr(5, 6, 3, 8, 1.5, '#7f8ba3', INK)
      el(-6.5, 14.5, 3, 2.2, '#a51f2c', INK); el(6.5, 14.5, 3, 2.2, '#a51f2c', INK)
      el(0, 5, 12, 6, '#7f8ba3', INK)
      el(0, 0, 15, 13, rg(0, 0, 16, '#ff6a5e', '#c9283a'), INK, 1.6)
      rr(-15, 1, 30, 3, 1.5, '#a51f2c')
      eye(-6, -1, 5.5); el(-7.5, -1, 2.6, 2.8, '#fff27a'); el(-8, -2, 1, 1, '#fff')
    } else if (k === 1) { /* hard hat: yellow dome with stripes, metal face, orange feet */
      var pk = calm ? 0.5 : Math.max(0, Math.sin(t * 1.3)) * 4
      el(-6, -2.5, 6, 3.5, '#ff7a1f', INK); el(6, -2.5, 6, 3.5, '#ff7a1f', INK)
      el(0, -12, 14, 10, '#4a5570', INK)
      eye(-5, -14, 3.2); eye(4.5, -14, 3.2)
      c.translate(0, -15 - pk)
      path(); c.ellipse(0, 0, 18, 17, 0, PI, T2); c.closePath(); paint(rg(0, -6, 18, '#ffe06a', '#f0a800'), INK, 1.6)
      rr(-2.5, -17, 5, 17, 1, '#e08a00')
      rr(-19, -2, 38, 4.5, 2.2, '#e08a00', INK)
      el(0, -17.5, 3, 2.5, '#e08a00', INK)
    } else if (k === 2) { /* guardroid: grey hulk, orange rings, red eye and core */
      c.translate(0, h * 0.8)
      rr(-11, -18, 8, 18, 3, '#56617a', INK); rr(3, -18, 8, 18, 3, '#56617a', INK)
      el(-7, -2, 7, 3, '#8f9bb3', INK); el(7, -2, 7, 3, '#8f9bb3', INK)
      el(0, -20, 13, 6, '#56617a', INK)
      el(0, -36, 20, 16, rg(0, -36, 22, '#c3cbdb', '#7d889f'), INK, 1.6)
      el(0, -30, 10, 5, '#56617a')
      el(-4, -38, 4.5, 4.5, '#ff8a2a', INK); glow(-4, -38, 7, 'rgba(255,64,80,.6)'); el(-4, -38, 3, 3, '#ff4050')
      el(0, -55, 9, 7, rg(0, -55, 10, '#c3cbdb', '#7d889f'), INK)
      rr(-8, -57, 10, 4, 2, '#1d2438'); rr(-7, -56, 7, 2, 1, '#ff4050')
      el(-19, -42, 9, 9, '#56617a', INK); el(19, -42, 9, 9, '#56617a', INK)
      rr(-26, -38, 10, 15, 5, '#8f9bb3', INK); el(-21, -20, 8, 8, rg(-21, -20, 9, '#c3cbdb', '#7d889f'), INK)
      rr(-27, -30, 12, 3, 1.5, '#ff8a2a', INK)
      rr(16, -38, 9, 13, 4.5, '#8f9bb3', INK)
    } else { /* crate golem: the Scrapyard crate on stone legs, glowing visor */
      c.translate(0, -h * 0.6)
      rr(-12, -16, 8, 16, 3, '#8e877b', INK); rr(4, -16, 8, 16, 3, '#8e877b', INK)
      rr(-13, -6, 10, 3, 1.5, '#646b7a'); rr(3, -6, 10, 3, 1.5, '#646b7a')
      rr(-20, -32, 7, 14, 3.5, '#8e877b', INK); rr(-22, -24, 11, 9, 4, '#8e877b', INK); rr(-21, -26, 9, 2.5, 1, '#646b7a')
      rr(-18, -50, 36, 36, 7, lg(-50, -14, '#d69d52', '#a9712f'), INK, 1.6)
      for (var i = 0; i < 4; i++) el(i % 2 ? 14 : -14, i < 2 ? -46 : -18, 5, 5, '#5f4630', INK)
      rr(-18, -36.5, 36, 3, 1, 'rgba(95,70,48,.6)')
      rr(-11, -39, 22, 6, 3, '#161a22'); rr(-8, -37, 16, 2, 1, '#ffcf5a')
      el(0, -24, 8, 7, '#5f4630', INK); el(0, -24, 2.6, 2.6, '#ffcf5a'); glow(0, -24, 6, 'rgba(255,207,90,.5)')
      rr(14, -32, 6, 12, 3, '#8e877b', INK)
    }
  }
  var bolt = function (p) {
    c.save(); c.translate(p.x, p.y); c.rotate(p.r); c.globalAlpha = Math.min(1, p.l * 2)
    if (!p.b) el(0, 0, 1.6, 1.6, '#fff0cc')
    else if (p.b === 1) { path(); for (var i = 0; i < 6; i++) c.lineTo(Math.cos(i * PI / 3) * 3, Math.sin(i * PI / 3) * 3); c.closePath(); paint('#c3cad4', INK, 1); el(0, 0, 1.2, 1.2, '#3b4458') }
    else { rr(-1, -1, 2, 7, 0.6, '#9aa7bd', INK, 0.8); rr(-2.6, -2.5, 5.2, 2.5, 0.8, '#c3cad4', INK, 0.8) }
    c.restore()
  }
  var draw = function (cx, S, W, s) {
    c = cx; c.setTransform(s, 0, 0, s, 0, 0); c.clearRect(0, 0, W, 100); c.lineJoin = 'round'
    var mx = W - 34
    c.fillStyle = 'rgba(120,160,230,.18)'; c.fillRect(6, 90, W - 12, 1.5)
    c.save(); c.translate(FX, 90); flux(S); c.restore()
    for (var i = 0; i < S.sh.length; i++) {
      var p = S.sh[i]
      if (p.c) { glow(p.x, 69.5, 17, 'rgba(255,199,104,.8)'); el(p.x, 69.5, 8.5, 7.5, '#fff0cc', '#ffa733', 2) }
      else { glow(p.x, 69.5, 6, 'rgba(255,167,51,.7)'); el(p.x, 69.5, 4, 2, '#fff0cc', '#ffa733') }
    }
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
    /* Any press anywhere while a loader is up plays: a click or tap in the
       window, any key (one held key = one charge, auto-repeat ignored). Only
       the newest run owns the input (the splash hands over to a Vue loader).
       Nothing is prevented outside the canvas, so a loader's buttons work. */
    var id = mdMini.n = (mdMini.n || 0) + 1
    var mine = function () { return on && mdMini.n === id }
    var down = function (e) { if (!mine() || e.repeat) return; if (e.target === cv) e.preventDefault(); if (S.hold < 0) S.hold = S.t }
    var up = function () { if (!mine() || S.hold < 0) return; fire(S, S.t - S.hold >= CH); S.hold = -1 }
    var vis = function () { if (!document.hidden && on && !raf) { last = 0; raf = requestAnimationFrame(frame) } }
    var L = [[w, 'pointerdown', down], [w, 'pointerup', up], [w, 'pointercancel', up], [w, 'keydown', down], [w, 'keyup', up], [w, 'blur', up], [cv, 'contextmenu', down], [document, 'visibilitychange', vis]]
    var stop = function () {
      if (!on) return; on = 0
      if (raf) cancelAnimationFrame(raf)
      L.forEach(function (l) { l[0].removeEventListener(l[1], l[2]) })
      S.hold = -1
    }
    L.forEach(function (l) { l[0].addEventListener(l[1], l[2]) })
    /* The first frame now, not on the next one: a loader that is up for a
       moment still shows the fight. */
    if (!document.hidden) frame(w.performance ? performance.now() : 0)
    return stop
  }
  var mdMini = w.mdMini = { run: run, S: null, M: M, step: step, fire: fire, next: next, hpOf: hpOf, CH: CH }
  var cv = document.querySelector('#static-splash canvas')
  if (cv) run(cv)
})(window)
