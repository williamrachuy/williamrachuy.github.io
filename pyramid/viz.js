/*
 * PYRAMID: the live pyramid.
 *
 * Plain script; attaches to PYR.Viz. A small hand-rolled 3D renderer on a 2D
 * canvas (no libraries). Each court is a triangular face with one vertex on
 * each of two ground rays (its L and R subjects) and one on the vertical
 * axis (its C subject), at a distance equal to the card's value. Adjacent
 * courts share a ray; when the lane between them pairs, their two vertices
 * meet. When all ten lanes pair, the four apexes meet too and the faces
 * close over a four-sided base: a pyramid. Until then it is an unfolded
 * paper model.
 *
 *   PYR.Viz.create(canvas) -> { update(geometry), view('orbit'|'top'),
 *                               toggleView(), resize(), destroy() }
 */
(function (root) {
  'use strict';

  var PYR = root.PYR = root.PYR || {};

  var SEATS = ['S', 'E', 'N', 'W'];
  var SUIT_COLOR = { S: [214, 222, 236], E: [232, 92, 108], N: [96, 196, 150], W: [104, 160, 236] };
  var GLYPH = { S: '♠', E: '♥', N: '♣', W: '♦' };
  var GOLD = [242, 201, 110];
  var R2 = Math.SQRT1_2;
  // Ground rays (x east, y up, z south). Base corners sit on the diagonals.
  var RAY = { SE: [R2, 0, R2], NE: [R2, 0, -R2], NW: [-R2, 0, -R2], SW: [-R2, 0, R2] };
  // Which rays each face's L and R vertices lie on, as its owner sees them.
  var FACE_RAYS = { S: { L: 'SW', R: 'SE' }, E: { L: 'SE', R: 'NE' }, N: { L: 'NE', R: 'NW' }, W: { L: 'NW', R: 'SW' } };
  var MAXV = 10;

  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t].map(Math.round); }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function norm(a) { var l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
  function onRay(ray, v) { var d = RAY[ray]; return [d[0] * v, 0, d[2] * v]; }

  function create(canvas, opts) {
    opts = opts || {};
    var ctx = canvas.getContext('2d');
    var dpr = 1, W = 0, H = 0;
    var reduce = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;

    var cam = { yaw: -0.62, pitch: 0.42, tPitch: 0.42, spin: reduce ? 0 : 0.12 };
    var drag = null, idleUntil = 0;
    var target = null, cur = null, glow = 0, complete = false, pulse = 0;
    var raf = 0, last = 0, visible = true, alive = true;

    function initVals(g) {
      var v = {};
      SEATS.forEach(function (s) { v[s] = { L: g.faces[s].L, C: g.faces[s].C, R: g.faces[s].R }; });
      return v;
    }

    function update(g) {
      if (!g) return;
      target = g;
      if (!cur) cur = initVals(g);
      if (g.complete && !complete) pulse = 1;
      complete = g.complete;
      kick();
    }

    function resize() {
      var r = canvas.getBoundingClientRect();
      dpr = Math.min(root.devicePixelRatio || 1, 2);
      W = Math.max(1, r.width); H = Math.max(1, r.height);
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      kick();
    }

    // World -> camera -> screen.
    function xf(p) {
      var cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
      var x = p[0] * cy - p[2] * sy, z = p[0] * sy + p[2] * cy, y = p[1] - 3.2;
      var cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
      var y2 = y * cp - z * sp, z2 = y * sp + z * cp;
      var dist = 40, f = Math.min(W, H) * 1.62;
      var k = f / (dist - z2);
      return { x: W / 2 + x * k, y: H * (0.5 + 0.08 * Math.cos(cam.pitch)) - y2 * k, z: z2 };
    }

    // The camera's position in world space (for the specular glint).
    function eye() {
      var cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
      // Inverse of xf's rotations applied to (0, 0, dist).
      var y = 40 * sp, z = 40 * cp;
      return [z * sy, y + 3.2, z * cy];
    }

    function line(a, b, color, w, dash) {
      ctx.beginPath();
      ctx.setLineDash(dash || []);
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = color; ctx.lineWidth = w; ctx.stroke();
      ctx.setLineDash([]);
    }

    function dotAt(p, r, fill, glowColor, glowR) {
      if (glowColor) {
        var g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, glowR);
        g.addColorStop(0, glowColor); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, glowR, 0, Math.PI * 2); ctx.fill();
      }
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = fill; ctx.fill();
    }

    function drawGround() {
      // Rings at 5 and 10, the rays with a tick per unit, and the vertical axis.
      [5, 10].forEach(function (r, i) {
        ctx.beginPath();
        for (var a = 0; a <= 64; a++) {
          var t = a / 64 * Math.PI * 2;
          var p = xf([Math.cos(t) * r, 0, Math.sin(t) * r]);
          if (a === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
        }
        ctx.strokeStyle = 'rgba(255,255,255,' + (i ? 0.06 : 0.045) + ')';
        ctx.lineWidth = 1; ctx.stroke();
      });
      var o = xf([0, 0, 0]);
      Object.keys(RAY).forEach(function (k) {
        line(o, xf(onRay(k, 11)), 'rgba(255,255,255,.13)', 1);
        for (var i = 1; i <= 10; i++) {
          var p = xf(onRay(k, i));
          ctx.fillStyle = 'rgba(255,255,255,' + (i % 5 ? 0.16 : 0.3) + ')';
          ctx.fillRect(p.x - 0.9, p.y - 0.9, 1.8, 1.8);
        }
      });
      line(o, xf([0, 11, 0]), 'rgba(255,255,255,.13)', 1);
      for (var j = 1; j <= 10; j++) {
        var q = xf([0, j, 0]);
        ctx.fillStyle = 'rgba(255,255,255,' + (j % 5 ? 0.16 : 0.3) + ')';
        ctx.fillRect(q.x - 0.9, q.y - 0.9, 1.8, 1.8);
      }
    }

    function frame(t) {
      raf = 0;
      if (!alive) return;
      var dt = last ? Math.min(0.05, (t - last) / 1000) : 0.016;
      last = t;
      var moving = false;

      if (!drag && t > idleUntil && cam.spin) { cam.yaw += cam.spin * dt; moving = true; }
      var dp = cam.tPitch - cam.pitch;
      if (Math.abs(dp) > 0.001) { cam.pitch += dp * Math.min(1, dt * 5); moving = true; }

      if (target && cur) {
        var k = Math.min(1, dt * 5.5);
        SEATS.forEach(function (s) {
          ['L', 'C', 'R'].forEach(function (p) {
            var d = target.faces[s][p] - cur[s][p];
            if (Math.abs(d) > 0.002) { cur[s][p] += d * k; moving = true; } else cur[s][p] = target.faces[s][p];
          });
        });
      }
      var gTarget = complete ? 1 : 0;
      if (Math.abs(glow - gTarget) > 0.002) { glow += (gTarget - glow) * Math.min(1, dt * 2.5); moving = true; }
      if (pulse > 0) { pulse = Math.max(0, pulse - dt * 0.5); moving = true; }
      if (complete && !reduce) moving = true;

      draw(t);
      if (moving || drag) kick();
    }

    function draw(t) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      if (!cur) return;
      drawGround();

      var E3 = eye();
      var light = norm([-0.35, 0.9, 0.45]);
      var faces = SEATS.map(function (s) {
        var fr = FACE_RAYS[s];
        var L = onRay(fr.L, cur[s].L), R = onRay(fr.R, cur[s].R), A = [0, cur[s].C, 0];
        var n = norm(cross(sub(R, L), sub(A, L)));
        var mid = [(L[0] + R[0] + A[0]) / 3, (L[1] + R[1] + A[1]) / 3, (L[2] + R[2] + A[2]) / 3];
        if (dot(n, mid) < 0) n = [-n[0], -n[1], -n[2]];
        var pl = xf(L), pr = xf(R), pa = xf(A);
        return { s: s, L: L, R: R, A: A, n: n, mid: mid, pl: pl, pr: pr, pa: pa, z: (pl.z + pr.z + pa.z) / 3 };
      });

      // Shadows on the ground: each face's footprint.
      faces.forEach(function (f) {
        var o = xf([0, 0, 0]);
        ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(f.pl.x, f.pl.y); ctx.lineTo(f.pr.x, f.pr.y); ctx.closePath();
        ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.fill();
      });

      // The base, once the four corners have closed.
      if (target && target.baseClosed) {
        var c = target.corners.map(function (k) { return xf(onRay(k.ray, cur[k.a.seat][posOfCorner(k.a.seat, k.ray)])); });
        ctx.beginPath(); c.forEach(function (p, i) { if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); }); ctx.closePath();
        ctx.fillStyle = rgba(GOLD, 0.06 + glow * 0.08); ctx.fill();
        ctx.strokeStyle = rgba(GOLD, 0.35); ctx.lineWidth = 1; ctx.stroke();
      }

      faces.sort(function (a, b) { return a.z - b.z; });
      var view = norm(E3);
      faces.forEach(function (f) {
        var col = mix(SUIT_COLOR[f.s], GOLD, glow * 0.55);
        var diffuse = 0.35 + 0.65 * Math.max(0, dot(f.n, light));
        var v = norm(sub(E3, f.mid));
        var h = norm([light[0] + v[0], light[1] + v[1], light[2] + v[2]]);
        var spec = Math.pow(Math.max(0, dot(f.n, h)), 28);
        var facing = dot(f.n, v) > 0;

        ctx.beginPath();
        ctx.moveTo(f.pl.x, f.pl.y); ctx.lineTo(f.pr.x, f.pr.y); ctx.lineTo(f.pa.x, f.pa.y); ctx.closePath();
        var baseMid = { x: (f.pl.x + f.pr.x) / 2, y: (f.pl.y + f.pr.y) / 2 };
        var gr = ctx.createLinearGradient(f.pa.x, f.pa.y, baseMid.x, baseMid.y);
        var a0 = (facing ? 0.26 : 0.12) * diffuse + spec * 0.5;
        var a1 = (facing ? 0.1 : 0.05) * diffuse + spec * 0.15;
        gr.addColorStop(0, rgba(mix(col, [255, 255, 255], 0.35 + spec * 0.5), Math.min(0.85, a0 + 0.08)));
        gr.addColorStop(1, rgba(col, Math.min(0.7, a1 + 0.04)));
        ctx.fillStyle = gr; ctx.fill();

        // Edges: bright on the near faces, faint on the far ones.
        ctx.lineJoin = 'round';
        ctx.strokeStyle = rgba(mix(col, [255, 255, 255], 0.5), facing ? 0.75 : 0.28);
        ctx.lineWidth = facing ? 1.3 : 0.9;
        ctx.stroke();
        if (spec > 0.05) {
          ctx.strokeStyle = 'rgba(255,255,255,' + Math.min(0.9, spec * 1.4) + ')';
          ctx.lineWidth = 1.6;
          ctx.beginPath(); ctx.moveTo(f.pa.x, f.pa.y); ctx.lineTo(f.pl.x, f.pl.y); ctx.stroke();
        }
      });

      // Suit glyphs by each face's base.
      var fs = Math.max(10, Math.min(W, H) * 0.055);
      ctx.font = fs + 'px "Cinzel", Georgia, serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      faces.forEach(function (f) {
        var p = xf([(f.L[0] + f.R[0]) * 0.62, 0, (f.L[2] + f.R[2]) * 0.62]);
        ctx.fillStyle = rgba(SUIT_COLOR[f.s], 0.8);
        ctx.fillText(GLYPH[f.s], p.x, p.y + fs * 0.7);
      });

      drawVertices();

      if (pulse > 0) {
        var a = xf([0, cur.S.C, 0]);
        var rr = (1 - pulse) * Math.min(W, H) * 0.7;
        ctx.beginPath(); ctx.arc(a.x, a.y, rr, 0, Math.PI * 2);
        ctx.strokeStyle = rgba(GOLD, pulse * 0.7); ctx.lineWidth = 2; ctx.stroke();
      }
    }

    function posOfCorner(seat, ray) { return FACE_RAYS[seat].L === ray ? 'L' : 'R'; }

    function drawVertices() {
      var base = Math.max(2.2, Math.min(W, H) * 0.012);
      // Base corners.
      target.corners.forEach(function (k) {
        var va = cur[k.a.seat][posOfCorner(k.a.seat, k.ray)];
        var vb = cur[k.b.seat][posOfCorner(k.b.seat, k.ray)];
        var pa = xf(onRay(k.ray, va)), pb = xf(onRay(k.ray, vb));
        if (k.paired) {
          dotAt(pa, base * 1.25, rgba(GOLD, 1), rgba(GOLD, 0.45), base * 5);
        } else {
          line(pa, pb, 'rgba(255,255,255,.45)', 1, [3, 3]);
          dotAt(pa, base, rgba(SUIT_COLOR[k.a.seat], 1));
          dotAt(pb, base, rgba(SUIT_COLOR[k.b.seat], 1));
        }
      });
      // The apex: one point if every centre pairs, else one per court.
      if (target.apexUnified) {
        dotAt(xf([0, cur.S.C, 0]), base * 1.5, rgba(GOLD, 1), rgba(GOLD, 0.5), base * 7);
      } else {
        var hs = SEATS.map(function (s) { return cur[s].C; });
        var lo = Math.min.apply(null, hs), hi = Math.max.apply(null, hs);
        if (hi - lo > 0.05) line(xf([0, lo, 0]), xf([0, hi, 0]), 'rgba(255,255,255,.45)', 1, [3, 3]);
        SEATS.forEach(function (s) { dotAt(xf([0, cur[s].C, 0]), base, rgba(SUIT_COLOR[s], 1)); });
      }
    }

    function kick() { if (!raf && alive && visible) raf = requestAnimationFrame(frame); }

    // Drag to orbit; double-click (or the view button) for the plan view.
    function down(e) {
      drag = { x: e.clientX, y: e.clientY, yaw: cam.yaw, pitch: cam.tPitch };
      canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
      kick();
    }
    function move(e) {
      if (!drag) return;
      cam.yaw = drag.yaw - (e.clientX - drag.x) * 0.01;
      cam.tPitch = cam.pitch = Math.max(0.05, Math.min(1.5, drag.pitch + (e.clientY - drag.y) * 0.008));
      kick();
    }
    function up() { drag = null; idleUntil = performance.now() + 4000; }
    function view(name) { cam.tPitch = name === 'top' ? 1.5 : 0.42; idleUntil = performance.now() + (name === 'top' ? 1e9 : 0); kick(); }
    function toggleView() { view(cam.tPitch > 1 ? 'orbit' : 'top'); return cam.tPitch > 1 ? 'top' : 'orbit'; }

    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('dblclick', toggleView);

    var ro = root.ResizeObserver ? new ResizeObserver(resize) : null;
    if (ro) ro.observe(canvas);
    var io = root.IntersectionObserver ? new IntersectionObserver(function (es) { visible = es[0].isIntersecting; if (visible) kick(); }) : null;
    if (io) io.observe(canvas);
    function onVis() { visible = !document.hidden; last = 0; kick(); }
    document.addEventListener('visibilitychange', onVis);
    resize();

    return {
      update: update,
      view: view,
      toggleView: toggleView,
      resize: resize,
      destroy: function () {
        alive = false;
        if (raf) cancelAnimationFrame(raf);
        if (ro) ro.disconnect();
        if (io) io.disconnect();
        document.removeEventListener('visibilitychange', onVis);
      }
    };
  }

  PYR.Viz = { create: create };
})(typeof window !== 'undefined' ? window : globalThis);
