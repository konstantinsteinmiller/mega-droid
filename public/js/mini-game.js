/* Loading-time mini-game (#Mini1): Flux blasts machines while the game loads.
   A classic script, no images: all Canvas 2D, drawn in the game's toon look
   (flat fills, a shade tone, a highlight, ink outlines) after the real models:
   models/hero.ts, models/enemies.ts (buildHeli, buildHardhat, buildHornet,
   buildMole, buildBrute, buildGolem), the shots after fx/chargedShot.ts (pellet, charge2).
   Tap = shot, hold + release = charged shot (3x damage, 50% faster). A killed
   machine pops into bolts, the next, stronger one drops in: rotor drone, hard
   hat, hornet rotor, mole driller, guardroid, crate golem, loop. index.html's splash and the in-app
   loaders (LoaderMiniGame.vue) share it through window.mdMini; the state
   lives there, so a hand-over continues the fight (and a held charge). run(canvas)
   returns stop(); it also stops itself once the canvas leaves the page. */
(function (w) {
  var HP = [3, 5, 6, 7, 8, 12], N = HP.length, CH = 0.45, FX = 30, PI = Math.PI, T2 = PI * 2, V = 210, VC = V * 1.5
  var calm = w.matchMedia && w.matchMedia('(prefers-reduced-motion: reduce)').matches
  var hpOf = function (k, lap) { return Math.round(HP[k] * (1 + lap * 0.6)) }
  /* who: what holds the charge (a pointerId, or 'k' for a key), null = none */
  var M = function () { return { k: 0, lap: 0, hp: 3, sh: [], pt: [], die: 0, drop: 1, t: 0, hold: -1, who: null, kx: 0, fl: 0, rec: 0, ht: -9, hk: 1 } }
  var fire = function (S, ch) { S.sh.push({ x: FX + 30, c: ch ? 1 : 0 }); S.rec = 1 }
  var next = function (S) { S.k = (S.k + 1) % N; if (!S.k) S.lap++; S.hp = hpOf(S.k, S.lap); S.drop = 1 }
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
        S.sh.splice(i, 1); S.hp -= p.c ? 3 : 1; S.kx = p.c ? 9 : 4; S.fl = 1; S.ht = S.t; S.hk = p.c ? 1.6 : 1
        burst(S, mx - 14, 56, calm ? 2 : p.c ? 8 : 4, 0)
        if (S.hp <= 0) { S.die = 1; burst(S, mx, 62, calm ? 8 : 26, 1) }
      } else if (p.x > W + 20) S.sh.splice(i, 1)
    }
    if (S.die && (S.die -= dt * 1.1) <= 0) { S.die = 0; next(S) }
    for (i = S.pt.length; i--;) {
      p = S.pt[i]; p.vy += 160 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt; p.l -= dt * (p.b ? 0.7 : 2.6)
      if (p.l <= 0) S.pt.splice(i, 1)
    }
  }

  var c, INK = '#141a33', K = '#161a22', LW = 1.5
  var path = function () { c.beginPath() }
  var paint = function (f, s, lw) { if (f) { c.fillStyle = f; c.fill() } if (s) { c.lineWidth = lw || LW; c.strokeStyle = s; c.stroke() } }
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
  var P = '#f5f4f1', PD = '#c3c6cf', SU = '#3a3f4b', FD = '#bdbbb6'

  /* Flux, feet at (0,0), a three-quarter turn to the right, after the real
     rig: the round pearl helmet with its crest seam, the dark visor band and
     ear disc, the face window with his plasma eyes over the pearl jaw shell,
     the hex core, gunmetal fist, segmented pearl limbs on the graphite suit,
     the buster raised. Breath bobs the upper body, a shot kicks it back, a
     charge crouches it. */
  var flux = function (S) {
    var hold = S.hold >= 0 ? Math.min(1, (S.t - S.hold) / CH) : 0, b = calm ? 0 : Math.sin(S.t * 2.2) * 0.7 + hold * 1.4
    var k = -S.rec * 2.5 - hold, bl = (S.t % 4) > 3.86 ? 0.15 : 1
    LW = 1.1; el(1, 0, 15, 2.6, 'rgba(0,0,0,.3)')
    /* the legs: graphite suit under round pearl segments, big boots */
    var leg = function (x, w) {
      rr(x - 3, -21, 6, 16, 3, SU)
      te(x + 1.2, -7.8, 3.5 * w, 3.9, P, FD); rr(x - 2.6, -5.8, 7.6 * w, 1.8, 0.9, SU)
      te(x + 3, -3.4, 7.6 * w, 3.9, P, FD, '#fff'); rr(x - 4.2, -1.6, 14.6 * w, 1.8, 0.9, K)
      te(x, -16.4, 4.4 * w, 5, P, FD, '#fff'); te(x + 2.2, -11.6, 3.1 * w, 2.9, P, FD, '#fff')
    }
    leg(-5.5, 0.94); leg(3.5, 1)
    c.save(); c.translate(k * 0.5, b * 0.5)
    tr(-7.5, -28, 17, 9, 4, P, FD)
    c.translate(k * 0.5, b * 0.5)
    /* the far arm hangs: pearl segments, the gunmetal fist */
    te(-10, -29.5, 3, 4, P, FD); te(-9.8, -24, 2.8, 3.4, P, FD); tr(-12.6, -22.6, 6.4, 6, 2.4, '#5a606e', '#2e323c', '#8a90a0'); path(); c.moveTo(-8.4, -21.6); c.lineTo(-8.4, -17.6); paint(0, INK, 0.8)
    rr(-5.5, -30.5, 13, 4.5, 2, SU, INK, 1)
    rr(-2.5, -43, 8, 4, 2, SU)
    tr(-8, -41, 21, 12.5, 5, P, FD, '#fff')
    hex(2.4, -35, 3.2, K); hex(2.4, -35, 1.9, '#ffa733'); el(2, -35.5, 0.7, 0.7, '#fff0cc'); glow(2.4, -35, 5, 'rgba(255,167,51,.5)')
    te(-9.5, -36, 4.6, 3.8, P, FD, '#fff')
    /* the head: dome, crest seam, visor band, ear disc */
    c.save(); c.translate(-k * 0.2, b * 0.4)
    te(-1, -56, 16, 16.5, P, FD, '#fff')
    path(); c.moveTo(1, -72.4); c.quadraticCurveTo(11, -70, 14.5, -60); paint(0, 'rgba(22,26,34,.55)', 1)
    /* the face window, dark glass cut into the dome's front, the pearl jaw
       shell behind it closing to the chin; his two plasma eyes */
    var win = function () { path(); c.moveTo(-6, -60); c.quadraticCurveTo(-5, -46, 8.5, -40.6); c.lineTo(20, -40); c.lineTo(20, -60) }
    c.save(); el(-1, -56, 16, 16.5); c.clip(); win(); paint(K); el(9, -46, 7, 4, '#232a36'); c.restore()
    path(); c.moveTo(-5.8, -54); c.quadraticCurveTo(-5, -46, 8.5, -40.6); paint(0, INK, 1.2)
    path(); c.moveTo(-13.5, -51.5); c.lineTo(-8.5, -44.5); c.lineTo(4, -40.2); c.moveTo(-8.5, -44.5); c.lineTo(-5.5, -48); paint(0, 'rgba(22,26,34,.75)', 0.9)
    var eye = function (x, rx, ry) {
      glow(x, -49.4, ry * 2.1, 'rgba(255,167,51,.65)')
      el(x, -49.4, rx, ry * bl, '#c24a08'); el(x - rx * 0.1, -49.6, rx * 0.78, ry * 0.8 * bl, '#ffb21e'); el(x - rx * 0.25, -50.3, rx * 0.4, ry * 0.42 * bl, '#fff3c4')
    }
    eye(4.4, 4.2, 4.3); eye(12.4, 2.1, 3.8)
    rr(-18.5, -60, 35, 7, 3.5, K, INK); rr(-12, -59, 24, 1.3, 0.6, '#3a4250')
    te(-16.6, -56.4, 3.8, 4.8, P, FD, '#fff'); el(-16.4, -56.4, 2, 2.8, '#d9dbe0', INK, 1)
    c.restore()
    /* the buster arm, raised: shoulder ball, the pearl cannon with its two
       dark bands, the dark muzzle with its plasma ring */
    te(10, -35.5, 4.4, 4.2, P, FD, '#fff')
    tr(12, -42, 15.5, 15, 7.5, P, FD, '#fff')
    rr(16.5, -42.3, 3.4, 15.6, 1.2, K); rr(23.5, -42, 1.8, 15, 0.9, K)
    el(27, -34.5, 4, 7.5, P, INK); el(27.4, -34.5, 3, 6.2, K)
    var cc = hold >= 1 ? '#7ff4ff' : hold ? '#c8ff7a' : '#ffa733'
    el(27.6, -34.5, 2.2, 4.8, 0, S.rec && !hold ? '#fff0cc' : cc, 1.4)
    if (hold) {
      var R = 4 + hold * 9, f = hold >= 1 && S.t % 0.16 < 0.08
      glow(28, -34.5, R * 1.8, hold >= 1 ? 'rgba(60,224,255,.9)' : 'rgba(157,255,90,.8)')
      if (!calm) for (var i = 0; i < 3; i++) {
        var a = S.t * 9 + i * 2.1, d = R * (1.6 - (S.t * 3 + i / 3) % 1)
        el(28 + Math.cos(a) * d, -34.5 + Math.sin(a) * d, 1, 1, '#fff')
      }
      el(28, -34.5, R * 0.45, R * 0.45, f ? '#fff' : hold >= 1 ? '#e6fbff' : '#eaffb0')
    }
    c.restore(); LW = 1.5
  }

  var eye = function (x, y, r, iris) { el(x, y, r, r * 1.1, '#fff', INK); el(x - r * 0.3, y, r * 0.6, r * 0.7, iris || '#0b1433'); el(x - r * 0.45, y - r * 0.3, r * 0.2, r * 0.2, '#fff') }
  /* The machines, ground (0,0), facing left (toward Flux). */
  var mach = function (S, k) {
    var t = S.t, h = calm ? 0 : Math.sin(t * 2.4), i
    /* the hit flinch, android-like: the body thrown back from the hips, the
       head snapping after it, knees buckling, a damped servo wobble */
    var r = t - S.ht, e = calm || r > 1.5 ? 0 : Math.exp(-5 * r) * S.hk, fa = e * Math.sin(r * 18 + 1.2) * 0.2, fh = e * Math.sin(r * 18 - 0.3) * 0.3, fb = e * 3 + (calm ? 0 : h * 0.4)
    el(0, 0, k === 4 ? 22 : k === 3 ? 19 : 15, 3, 'rgba(0,0,0,.3)')
    var MT = '#7f8ba3', MS = '#5d6a82', MH = '#a3adc2'
    if (k === 0) { /* rotor drone (buildHeli): the red ball, its dark-red band, the
         steel belly under it, one big yellow eye up front, the mast and the
         yellow two-blade rotor, two little red claws hanging under it */
      var RD = '#e83a3a', RS = '#a51f2c'
      c.translate(0, -38 + h * 3); c.rotate(fa * 0.5)
      for (i = 0; i < 2; i++) { rr([-8.6, 3.6][i], 12, 2.4, 4.5, 1.2, MT, INK, 1); c.save(); c.translate([-8, 5.4][i], 17.2); c.rotate(-0.12); te(0, 0, 3.8 + i * 0.4, 2, RD, RS); c.restore() }
      te(0, 0, 15.5, 14, RD, RS, '#ff8f86')
      te(0, 8.2, 14, 7, MT, MS)
      rr(-16, 1.2, 32, 2.8, 1.4, RS, INK, 1)
      glow(-13, -1, 6, 'rgba(255,242,122,.45)')
      el(-12, -1.4, 3.1, 5.3, '#e9e9ec', INK, 1); el(-13, -0.6, 1.8, 2.7, '#fff27a'); el(-13.4, -0.5, 0.9, 1.7, '#0b1433'); el(-11.6, -4.2, 0.7, 0.8, '#fff')
      path(); c.ellipse(-12, -1.4, 3.6, 5.8, 0, -1.4, 0.2); paint(0, INK, 1.2)
      rr(-1.3, -17.4, 2.6, 4, 0.8, MT, INK, 1)
      var sw = calm ? 21 : Math.cos(t * 30) * 22
      if (!calm) el(0, -19.4, 23, 2, 'rgba(255,210,58,.3)')
      el(0, -19.4, Math.abs(sw) + 2, 1.3, '#ffd23a', INK, 1); te(0, -19, 2.9, 2.6, '#ffd23a', '#c9a21a')
    } else if (k === 1) { /* hard hat (buildHardhat): it hides under its yellow dome and
         peeks: the helmet tips back, the slate body rises out from under it,
         two eyes and the orange muzzle ring; a hit ducks it back under */
      var pk = calm ? 1 : Math.min(1, Math.max(0, Math.sin(t * 1.3) * 1.6 + 0.5)) * Math.max(0, 1 - e), ry = 10.5 * (0.45 + 0.55 * pk), by = -5 - 5.5 * pk, HY = '#e6a614', HD = '#c98600', BR = '#e39a0c', OR = '#ff7a1f'
      te(-1, by, 11.8, ry, '#4a5570', '#2f3850', '#5d6a85')
      te(-10.2, -2.8, 5.8, 2.8, OR, '#c25a00'); te(1, -2.8, 6.5, 3.2, OR, '#c25a00', '#ffa060')
      if (pk > 0.3) {
        var ey = by - ry * 0.4
        for (i = 0; i < 2; i++) { var ex = [-12.4, -6.2][i], rx = [2.4, 3.2][i]; el(ex, ey, rx, 3.7, '#eef0f4', INK, 1); el(ex - rx * 0.3, ey + 0.5, rx * 0.5, 2.1, '#0b1433'); el(ex - rx * 0.5, ey - 0.5, 0.55, 0.6, '#fff') }
        el(-12, by + ry * 0.3, 2.9, 3.6, OR, INK, 1); el(-12.3, by + ry * 0.3, 1.4, 2.1, '#2a3042')
      }
      c.translate(2 * pk, -5 - 14.5 * pk); c.rotate(0.27 * pk)
      /* the brim, a rolled tube: its far half behind the dome, its near half over it */
      var bq = 1.8 + 1.8 * pk, tube = function (a0, a1) { path(); c.ellipse(0, 0.6, 18.8, bq, 0, a0, a1); paint(0, INK, 6); paint(0, BR, 3.8); path(); c.ellipse(0, -0.2, 18.8, bq, 0, a0, a1); if (c.getTransform().a > 2.5) paint(0, '#f4bf40', 1) }
      if (pk > 0.05) el(-0.5, 0.4, 17, bq * 0.8, INK)
      tube(PI, T2)
      path(); c.ellipse(0, 0, 17.5, 18, 0, PI, T2); paint(HD)
      path(); c.ellipse(-1.8, -0.3, 15, 16.4, 0, PI, T2); paint(HY)
      el(-7, -12, 4.4, 2.4, '#ffd866')
      path(); c.ellipse(0, 0, 17.5, 18, 0, PI, T2); paint(0, INK)
      tube(0, PI)
      te(0, -18, 3, 2.6, BR, '#b06a00')
    } else if (k === 2) { /* hornet rotor (buildHornet): the yellow wasp hull, one black
         stripe, the black stinger, two red-eyed eyes up front, twin rotors on
         steel struts */
      var Y = '#f6c832', YD = '#c3961c', HK = '#22232e', SL = '#c8ccd6'
      c.translate(0, -40 + h * 3); c.rotate(fa * 0.5)
      rr(-10, -11.8, 6.6, 3, 1, SL, INK, 1); rr(1, -11.8, 9.4, 3, 1, SL, INK, 1)
      for (i = 0; i < 2; i++) {
        var hx = [-8.6, 9][i], ph = calm ? 0 : Math.sin(t * 28 + i * 2) * 7
        te(hx, -13.2, 2.5, 2.3, '#ff4a3a', '#b8261c')
        if (!calm) el(hx, -14.6, 11.4, 1.9, 'rgba(200,204,214,.22)')
        el(hx, -14.6, 10.7, 0.9, SL, INK, 0.9); el(hx + ph, -14.6, 1.6, 0.5, '#8a909c')
      }
      path(); c.moveTo(15.2, -4); c.lineTo(24.5, 0.6); c.lineTo(15, 5); c.closePath(); paint(HK, INK)
      var egg = function () { path(); c.moveTo(-17, 0); c.bezierCurveTo(-17, -9, -6, -11, 3, -10); c.bezierCurveTo(13, -9.6, 18, -5, 18, 0.5); c.bezierCurveTo(18, 6.5, 11, 10.5, 0, 10.5); c.bezierCurveTo(-11, 10.5, -17, 7, -17, 0) }
      egg(); paint(YD); c.save(); c.translate(-2, -1.2); c.scale(0.88, 0.86); egg(); paint(Y); c.restore(); el(-6, -6, 6, 1.8, '#ffe680')
      c.save(); egg(); c.clip(); el(7.6, 0.4, 2.1, 11, HK); c.restore(); egg(); paint(0, INK)
      for (i = 0; i < 2; i++) {
        var qx = [-15.2, -9.4][i], qy = [-4.2, -3.4][i], qr = [2.1, 3.1][i]
        el(qx, qy, qr, [3.3, 4][i], '#dfe1e6', INK, 1); el(qx - qr * 0.4, qy + 0.3, qr * 0.5, 2.2, '#ff2a2a'); el(qx - qr * 0.55, qy + 0.4, qr * 0.28, 1.2, '#0b1433'); el(qx + qr * 0.2, qy - 1.6, 0.5, 0.6, '#fff')
      }
      glow(-11, -3.6, 6, 'rgba(255,42,42,.35)')
    } else if (k === 3) { /* mole driller (buildMole): the rust-brown body, the dark
         belly, the banded steel drill out front, the miner's lamp on its
         crown, the engine on its back, two shovel paws; the biggest of the small fry */
      var MO = '#a8743f', MD = '#7f5430', DK = '#5a3d2a', ST = '#9ea6b8', SS = '#737c90'
      c.translate(15, 0); c.rotate(fa); c.scale(1.2, 1.2 - fb * 0.01); c.translate(-17, 0)
      c.save(); c.translate(-12.4, -5.6); c.rotate(0.15); te(0, 0, 5.2, 2.1, ST, SS); c.restore()
      tr(13, -25, 7.5, 7, 1.8, ST, SS); rr(0.5, -29.6, 4.6, 2.8, 0.8, ST, INK, 1)
      te(5, -13.8, 15, 13.2, MO, MD, '#c99567')
      c.save(); path(); c.rect(-30, -6.6, 60, 10); c.clip(); te(4.4, -3.6, 13.4, 4.4, DK, '#3e2a1c'); el(5, -13.8, 15, 13.2, DK, INK); c.restore()
      c.save(); c.translate(1, -4.6); c.rotate(0.3); te(0, 0, 5.8, 2.1, ST, SS, '#c6ccd8'); c.restore()
      glow(-0.5, -28.3, 6, 'rgba(255,210,58,.7)'); el(-0.5, -28.3, 2.3, 2.3, '#ffd23a')
      el(-1.4, -21.4, 2, 2.4, '#f2eee8', INK, 0.8); el(-2.4, -21.1, 0.8, 1.5, '#ff6a2a')
      /* the drill, stepped: each banded collar, then the steel cone on to the next */
      el(-4.4, -16.3, 3.2, 7.8, DK, INK, 1.2); el(-4.6, -16.3, 1.9, 6.6, ST)
      var dx = [-7.2, -12.4, -17.2, -22.4], dr = [6.4, 4.7, 3.1, 0.3]
      for (i = 0; i < 3; i++) {
        el(dx[i], -16.3, dr[i] * 0.56, dr[i] * 1.12, DK, INK, 1.2); el(dx[i] - dr[i] * 0.2, -16.3, dr[i] * 0.24, dr[i] * 0.66, '#3e2a1c')
        path(); c.moveTo(dx[i] - 0.4, -16.3 - dr[i] * 0.78); c.lineTo(dx[i + 1] + 0.2, -16.3 - dr[i + 1]); c.lineTo(dx[i + 1] + 0.2, -16.3 + dr[i + 1]); c.lineTo(dx[i] - 0.4, -16.3 + dr[i] * 0.78); c.closePath(); paint(ST, INK, 1)
        path(); c.moveTo(dx[i] - 0.4, -16.3 - dr[i] * 0.6); c.lineTo(dx[i + 1] + 0.2, -16.3 - dr[i + 1] * 0.75); c.lineTo(dx[i + 1] + 0.2, -16.3 - dr[i + 1] * 0.2); c.lineTo(dx[i] - 0.4, -16.3 - dr[i] * 0.2); c.closePath(); paint('#c6ccd8')
      }
    } else if (k === 4) { /* guardroid (buildBrute), in its rendered neutral greys: a slate barrel on stubby legs, dark shoulder balls
         ringed orange, huge ball fists, the red core in its orange ring, a
         little head with a red visor slit; a hit throws it back from the hips */
      var G = '#737b89', GS = '#5d636e', GD = '#434a59', GH = '#8a919d', GX = '#343a46', OR = '#ff8a2a'
      var orb = function (x, y, r, b, d, a0) { te(x, y, r, r, b, d, GH); path(); c.arc(x, y, r - 1, a0, a0 + 1.3); paint(0, OR, 2) }
      for (i = 1; i > -2; i -= 2) { tr(i * 5.5 - 3.6, -31 + fb * 0.5, 7.2, 14, 3.5, G, GS); tr(i * 5.5 - 3.4, -18 + fb * 0.5, 6.8, 12, 3, GD, GX); te(i * 5.5 - 1.5, -3, 7.6, 3.4, G, GS, GH) }
      c.translate(0, -31 + fb); c.rotate(fa)
      orb(-13.5, -22, 7.4, GD, GX, 3.4); tr(-19, -18, 6, 8, 3, GD, GX); orb(-20.5, -3, 7.4, G, GS, -0.6)
      te(1, 0, 9, 4.6, GD, GX)
      te(1.3, -15.5, 13.6, 12.8, G, GS, GH)
      te(-5.2, -10.6, 7.6, 4.9, GD, GX)
      glow(-6.6, -18.8, 9, 'rgba(255,64,80,.7)')
      el(-6.6, -18.8, 3.4, 4.1, '#ff4050', OR, 2); el(-7.6, -20, 1.1, 1.3, '#fff')
      c.save(); c.translate(-0.5, -28); c.rotate(fh)
      te(0, -2.5, 6, 5.4, G, GS, GH); rr(-7, -3.5, 7, 2.6, 1.3, '#1d2438'); rr(-6.2, -2.8, 5, 1.1, 0.5, '#ff4050'); glow(-3.7, -2.3, 5, 'rgba(255,64,80,.6)')
      c.restore()
      orb(13, -21, 7.4, GD, GX, -0.9); orb(9.6, -3, 7.4, G, GS, -1)
    } else { /* crate golem (buildGolem): its sector's crate on stone legs, the lid flung
         open on its hinge, the jaw dropped forward, a stone fist at its side */
      var ST = '#8e877b', SD = '#6b655b', WD = '#5f4630', WX = '#3e2d1f', CR = '#c68a3e'
      for (i = -1; i < 2; i += 2) { tr(i * 5.4 - 3.2, -19 + fb, 6.4, 16, 3, ST, SD, '#b3ada1'); rr(i * 5.4 - 3.8, -9.5 + fb * 0.5, 7.6, 2.2, 1, '#646b7a', INK, 1); tr(i * 5.6 - 5.6, -4, 12, 4.4, 1.5, WD, WX) }
      c.translate(0, -17 + fb); c.rotate(fa)
      te(-21, -5, 3, 3.4, ST, SD)
      path(); c.moveTo(-17, -47 - fa * 20); c.lineTo(3.3, -46.5 - fa * 20); c.lineTo(20.5, -32); c.lineTo(-3.8, -33); c.closePath(); paint(WX, INK)
      path(); c.moveTo(3.3, -46.5 - fa * 20); c.lineTo(20.5, -32); paint(0, CR, 1.4)
      glow(0, -30, 9, 'rgba(255,207,90,.8)')
      tr(-21, -30, 42, 30, 3.5, CR, '#9a6a2c', '#dcae6e')
      rr(1, -29.5, 20, 29, 3, 'rgba(95,70,48,.18)'); path(); c.moveTo(1.5, -29.6); c.lineTo(1.5, -0.4); paint(0, 'rgba(62,45,31,.6)', 1)
      el(0, -29.6, 5, 1.2, '#ffcf5a')
      for (i = 0; i < 3; i++) te([-17, 3.3, 20.5][i], [-47, -46.5, -32][i] - (i < 2 ? fa * 20 : 0), 5, 5, WD, WX, '#7a5c40')
      el(-12, -19.5, 6.6, 3, K, INK); rr(-16.6, -20.2, 9.2, 1.4, 0.7, '#ffcf5a'); glow(-12, -19.3, 7, 'rgba(255,207,90,.55)')
      c.save(); c.translate(-18.8, -10.8 + fa * 8); c.rotate(0.35)
      el(0, 0, 12, 5.2, WD, INK); el(1, -0.8, 10.4, 3.6, WX); el(-1.5, 1.4, 1.9, 1.2, '#ffcf5a'); c.restore()
      tr(10.4, -27, 4.4, 14, 2.2, ST, SD); rr(9.6, -20.5, 6, 2.2, 1, CR, INK, 1)
      tr(3, -12.5, 11, 11, 4, ST, SD, '#b3ada1'); path(); c.moveTo(6.5, -8); c.lineTo(6.5, -3); paint(0, INK, 0.8)
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
    var x = p.x, y = 55.5, L = p.c ? 30 : 14, g = c.createLinearGradient(x - L, 0, x, 0)
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
    /* the machine's origin on a whole device pixel: a fractional one smears
       its outlines across two pixels at 1x */
    var px = function (v) { return Math.round(v * s) / s }
    c.save(); c.translate(FX, 90); flux(S); c.restore()
    for (var i = 0; i < S.sh.length; i++) shot(S.sh[i])
    if (!S.die) {
      c.save(); c.translate(px(mx + S.kx), px(90 - S.drop * S.drop * 100))
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
  var mdMini = w.mdMini = { run: run, paint: function (cx, S, k) { c = cx; c.lineJoin = c.lineCap = 'round'; mach(S, k) }, S: null, M: M, step: step, fire: fire, next: next, hpOf: hpOf, CH: CH, V: V, VC: VC }
  var cv = document.querySelector('#static-splash canvas')
  if (cv) run(cv)
})(window)
