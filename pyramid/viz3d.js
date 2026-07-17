/* PYR.Viz3D — hand-rolled 3D wireframe/solid pyramid renderer.
 * No external libraries. Plain script (not a module); attaches to window.PYR.
 * Contract: PYR.Viz3D.create(canvas) -> { render(state), setSize(w,h), destroy() }
 */
(function (global) {
  'use strict';

  var PYR = global.PYR = global.PYR || {};

  var SUITS = ['spades', 'hearts', 'clubs', 'diamonds'];
  var SUIT_COLORS = {
    spades: '#cfd6dd',
    hearts: '#c0453d',
    clubs: '#4f8a5c',
    diamonds: '#4f7fb0'
  };
  var GOLD = '#e3b53f';
  var INK = '#ece3d0';
  var INK_MUTED = 'rgba(236,227,208,.62)';

  function nextSuit(s) {
    var i = SUITS.indexOf(s);
    if (i < 0) return s;
    return SUITS[(i + 1) % 4];
  }

  function isPair(a, b) {
    if (!a || !b) return false;
    return a.rank === b.rank || a.rank === 'A' || b.rank === 'A';
  }

  function rankText(card) {
    return card && card.rank ? String(card.rank) : '?';
  }

  // ---- coherence: prefer PYR.Engine.coherence(state), else recompute per spec ----
  function computeCoherence(state) {
    if (PYR.Engine && typeof PYR.Engine.coherence === 'function') {
      try {
        var c = PYR.Engine.coherence(state);
        if (c && c.corners) return c;
      } catch (e) { /* fall through to local recompute */ }
    }
    var subj = state && state.board && state.board.subjects;
    var corners = {};
    var capOk = {};
    var i, s, n, key;
    for (i = 0; i < 4; i++) {
      s = SUITS[i];
      n = nextSuit(s);
      key = s + '-' + n;
      var right = subj && subj[s] && subj[s].right;
      var left = subj && subj[n] && subj[n].left;
      corners[key] = isPair(right, left);
      var cS = subj && subj[s] && subj[s].center;
      var cN = subj && subj[n] && subj[n].center;
      capOk[key] = isPair(cS, cN);
    }
    var allCap = true;
    for (var k in capOk) if (!capOk[k]) allCap = false;
    var peakPairs = [['spades', 'clubs'], ['hearts', 'diamonds']];
    var peakOk = true;
    for (i = 0; i < peakPairs.length; i++) {
      var a = peakPairs[i][0], b = peakPairs[i][1];
      var ca = subj && subj[a] && subj[a].center;
      var cb = subj && subj[b] && subj[b].center;
      if (!isPair(ca, cb)) peakOk = false;
    }
    var centersAgree = allCap && peakOk;
    return { corners: corners, peak: centersAgree, centersAgree: centersAgree };
  }

  function allCornersMatched(corners) {
    if (!corners) return false;
    var any = false;
    for (var k in corners) {
      any = true;
      if (!corners[k]) return false;
    }
    return any;
  }

  // ---- hand-rolled 3D math ----
  function rotY(p, a) {
    var c = Math.cos(a), s = Math.sin(a);
    return { x: p.x * c + p.z * s, y: p.y, z: -p.x * s + p.z * c };
  }
  function rotX(p, a) {
    var c = Math.cos(a), s = Math.sin(a);
    return { x: p.x, y: p.y * c - p.z * s, z: p.y * s + p.z * c };
  }

  var TILT = -0.62; // fixed camera elevation (radians)
  var CAM_DIST = 4.4;

  function project(p, cx, cy, scale) {
    var z = p.z + CAM_DIST;
    if (z < 0.1) z = 0.1;
    var factor = CAM_DIST / z;
    return {
      x: cx + p.x * factor * scale,
      y: cy - p.y * factor * scale,
      z: z
    };
  }

  function transform(p, spin) {
    return rotY(rotX(p, TILT), spin);
  }

  function hexToRgba(hex, alpha) {
    var h = hex.replace('#', '');
    if (h.length === 3) {
      h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    }
    var r = parseInt(h.substring(0, 2), 16);
    var g = parseInt(h.substring(2, 4), 16);
    var b = parseInt(h.substring(4, 6), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }

  var BASE_R = 0.96;
  var BASE_Y = -0.46;
  var APEX_Y = 0.8;

  function baseCornerRaw(i) {
    var ang = (i * Math.PI / 2) - Math.PI / 4;
    return { x: Math.cos(ang) * BASE_R, y: BASE_Y, z: Math.sin(ang) * BASE_R };
  }
  var APEX_RAW = { x: 0, y: APEX_Y, z: 0 };

  function lerp3(a, b, t) {
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
  }

  function create(canvas) {
    var ctx = canvas.getContext('2d');
    var dpr = (global.devicePixelRatio || 1);
    var cssW = 200, cssH = 200;
    var latestState = null;
    var startTime = (global.performance && global.performance.now) ? global.performance.now() : Date.now();
    var rafId = null;
    var destroyed = false;

    function now() {
      return (global.performance && global.performance.now) ? global.performance.now() : Date.now();
    }

    function setSize(w, h) {
      cssW = w || 200;
      cssH = h || 200;
      dpr = (global.devicePixelRatio || 1);
      try {
        canvas.width = Math.max(1, Math.round(cssW * dpr));
        canvas.height = Math.max(1, Math.round(cssH * dpr));
        canvas.style.width = cssW + 'px';
        canvas.style.height = cssH + 'px';
      } catch (e) { /* headless / detached canvas: ignore */ }
    }

    function draw() {
      if (destroyed) return;
      var t = (now() - startTime) / 1000;
      var spin = t * 0.28; // slow auto-rotate

      ctx.save();
      try {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      } catch (e) {}
      ctx.clearRect(0, 0, cssW, cssH);

      var cx = cssW / 2;
      var cy = cssH / 2 + cssH * 0.06;
      // Dock is a rounded square; keep a little margin so the base corners and
      // the caption never touch the edge at the small in-game size.
      var scale = Math.min(cssW, cssH) * 0.38;

      var state = latestState;
      var coherence = computeCoherence(state);
      var subj = state && state.board && state.board.subjects;
      var fullyCoherent = coherence.peak && allCornersMatched(coherence.corners);

      var pulse = fullyCoherent ? (0.5 + 0.5 * Math.sin(t * 3.4)) : 0;

      // ---- background halo when fully coherent ----
      if (fullyCoherent) {
        var haloR = scale * (1.55 + pulse * 0.18);
        var grad = ctx.createRadialGradient(cx, cy, scale * 0.2, cx, cy, haloR);
        grad.addColorStop(0, hexToRgba(GOLD, 0.28 + pulse * 0.14));
        grad.addColorStop(1, hexToRgba(GOLD, 0));
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, haloR, 0, Math.PI * 2);
        ctx.fill();
      }

      // ---- 3D vertices ----
      var corners3 = [];
      var i;
      for (i = 0; i < 4; i++) corners3.push(transform(baseCornerRaw(i), spin));
      var apex3 = transform(APEX_RAW, spin);

      // ---- floor grid (subtle depth cue) ----
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(236,227,208,.10)';
      var GRID_N = 4, GRID_EXT = 1.55;
      ctx.beginPath();
      for (i = -GRID_N; i <= GRID_N; i++) {
        var gx = (i / GRID_N) * GRID_EXT;
        var p1 = project(transform({ x: gx, y: BASE_Y, z: -GRID_EXT }, spin), cx, cy, scale);
        var p2 = project(transform({ x: gx, y: BASE_Y, z: GRID_EXT }, spin), cx, cy, scale);
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        var q1 = project(transform({ x: -GRID_EXT, y: BASE_Y, z: gx }, spin), cx, cy, scale);
        var q2 = project(transform({ x: GRID_EXT, y: BASE_Y, z: gx }, spin), cx, cy, scale);
        ctx.moveTo(q1.x, q1.y);
        ctx.lineTo(q2.x, q2.y);
      }
      ctx.stroke();

      // ---- faces: painter's algorithm (farthest first) ----
      var faces = [];
      for (i = 0; i < 4; i++) {
        var suit = SUITS[i];
        var left3 = corners3[(i + 3) % 4];
        var right3 = corners3[i];
        var avgZ = (left3.z + right3.z + apex3.z) / 3;
        faces.push({ suit: suit, idx: i, left3: left3, right3: right3, avgZ: avgZ });
      }
      faces.sort(function (a, b) { return b.avgZ - a.avgZ; });

      var f;
      for (f = 0; f < faces.length; f++) {
        var face = faces[f];
        var pL = project(face.left3, cx, cy, scale);
        var pR = project(face.right3, cx, cy, scale);
        var pA = project(apex3, cx, cy, scale);
        var color = SUIT_COLORS[face.suit];

        var fillAlpha = fullyCoherent ? (0.4 + pulse * 0.12) : 0.28;
        ctx.beginPath();
        ctx.moveTo(pL.x, pL.y);
        ctx.lineTo(pR.x, pR.y);
        ctx.lineTo(pA.x, pA.y);
        ctx.closePath();
        ctx.fillStyle = hexToRgba(color, fillAlpha);
        ctx.fill();
        ctx.lineWidth = fullyCoherent ? 1.6 : 1.1;
        ctx.strokeStyle = fullyCoherent ? hexToRgba(GOLD, 0.75 + pulse * 0.2) : hexToRgba(color, 0.85);
        ctx.stroke();

        // rank labels for this face, offset toward centroid to avoid overlap
        if (subj && subj[face.suit]) {
          var cData = subj[face.suit];
          var centroid3 = {
            x: (face.left3.x + face.right3.x + apex3.x) / 3,
            y: (face.left3.y + face.right3.y + apex3.y) / 3,
            z: (face.left3.z + face.right3.z + apex3.z) / 3
          };
          var leftLabel3 = lerp3(face.left3, centroid3, 0.32);
          var rightLabel3 = lerp3(face.right3, centroid3, 0.32);
          var apexLabel3 = lerp3(apex3, centroid3, 0.4);
          drawLabel(ctx, project(leftLabel3, cx, cy, scale), rankText(cData.left), color);
          drawLabel(ctx, project(rightLabel3, cx, cy, scale), rankText(cData.right), color);
          drawLabel(ctx, project(apexLabel3, cx, cy, scale), rankText(cData.center), color);
        }
      }

      // ---- base corner glows ----
      for (i = 0; i < 4; i++) {
        var s = SUITS[i];
        var n = nextSuit(s);
        var key = s + '-' + n;
        var matched = !!(coherence.corners && coherence.corners[key]);
        var p = project(corners3[i], cx, cy, scale);
        drawNode(ctx, p, matched, pulse, 3.1);
      }

      // ---- peak glow ----
      var apexP = project(apex3, cx, cy, scale);
      drawNode(ctx, apexP, !!coherence.peak, pulse, 3.8);

      // ---- caption / legend ----
      ctx.font = "600 9px 'Baloo 2', sans-serif";
      ctx.fillStyle = INK_MUTED;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText('THE PYRAMID', 6, 12);
      ctx.font = "8px 'Baloo 2', sans-serif";
      ctx.fillStyle = fullyCoherent ? hexToRgba(GOLD, 0.9) : 'rgba(236,227,208,.42)';
      ctx.fillText(fullyCoherent ? 'coherent — the pyramid is whole' : 'gold = corners aligned', 6, cssH - 6);

      ctx.restore();
    }

    function drawLabel(ctx2, p, text, color) {
      ctx2.font = "600 8px 'Baloo 2', sans-serif";
      ctx2.textAlign = 'center';
      ctx2.textBaseline = 'middle';
      ctx2.lineWidth = 2.2;
      ctx2.strokeStyle = 'rgba(13,16,20,.78)';
      ctx2.strokeText(text, p.x, p.y);
      ctx2.fillStyle = INK;
      ctx2.fillText(text, p.x, p.y);
    }

    function drawNode(ctx2, p, matched, pulse, r) {
      var radius = matched ? r * (1.15 + pulse * 0.25) : r * 0.75;
      if (matched) {
        var glowR = radius * 2.6;
        var g = ctx2.createRadialGradient(p.x, p.y, 0, p.x, p.y, glowR);
        g.addColorStop(0, hexToRgba(GOLD, 0.85));
        g.addColorStop(1, hexToRgba(GOLD, 0));
        ctx2.fillStyle = g;
        ctx2.beginPath();
        ctx2.arc(p.x, p.y, glowR, 0, Math.PI * 2);
        ctx2.fill();
      }
      ctx2.beginPath();
      ctx2.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx2.fillStyle = matched ? GOLD : 'rgba(236,227,208,.5)';
      ctx2.fill();
      ctx2.lineWidth = 1;
      ctx2.strokeStyle = matched ? 'rgba(13,16,20,.4)' : 'rgba(13,16,20,.3)';
      ctx2.stroke();
    }

    function loop() {
      if (destroyed) return;
      try { draw(); } catch (e) { /* never throw from the render loop */ }
      rafId = global.requestAnimationFrame ? global.requestAnimationFrame(loop) : null;
    }

    function render(state) {
      latestState = state || null;
      try { draw(); } catch (e) { /* swallow: never throw on bad state */ }
    }

    setSize(cssW, cssH);
    if (global.requestAnimationFrame) {
      rafId = global.requestAnimationFrame(loop);
    }

    function destroy() {
      destroyed = true;
      if (rafId != null && global.cancelAnimationFrame) {
        global.cancelAnimationFrame(rafId);
      }
      rafId = null;
      latestState = null;
    }

    return { render: render, setSize: setSize, destroy: destroy };
  }

  PYR.Viz3D = { create: create };

})(typeof window !== 'undefined' ? window : this);
