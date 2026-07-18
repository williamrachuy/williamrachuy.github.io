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

  function clampN(v, a, b) { return v < a ? a : (v > b ? b : v); }

  // Subject rank -> numeric value (A=1 .. X=10).
  var RANK_VAL = { A: 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, X: 10 };

  // A "point" (a shared base corner = 2 cards, or the apex = 4 centre cards)
  // takes a single value. Ace rule: if every card there is an Ace (no definite
  // number) the point reads as 1; otherwise Aces are wildcards and the point
  // takes the value of the non-Ace card(s).
  function pointValue(cards) {
    var nonAce = null, sawCard = false;
    for (var i = 0; i < cards.length; i++) {
      var c = cards[i];
      if (!c || !c.rank) continue;
      sawCard = true;
      if (c.rank !== 'A') { nonAce = RANK_VAL[c.rank] || 6; }
    }
    if (!sawCard) return 6;       // nothing there: neutral mid value
    if (nonAce === null) return 1; // all Aces -> 1
    return nonAce;                // wildcard Aces take the real value
  }

  // Base corner i lies on an AXIAL line (i*90deg => +X, +Z, -X, -Z), so the
  // base reads as a diamond on the grid. Distance from centre scales gently
  // with the point's value; height (apex) scales with the centre value.
  function cornerRaw(i, value) {
    var ang = i * Math.PI / 2;
    var R = BASE_R * (0.60 + 0.40 * clampN(value, 1, 10) / 10);
    return { x: Math.cos(ang) * R, y: BASE_Y, z: Math.sin(ang) * R };
  }
  function apexRaw(value) {
    return { x: 0, y: BASE_Y + (APEX_Y - BASE_Y) * (0.45 + 0.55 * clampN(value, 1, 10) / 10), z: 0 };
  }

  function create(canvas, opts) {
    opts = opts || {};
    // minimal = title-screen showcase: no grid/caption, and the pyramid is
    // forced to its ideal coherent form (a clean slowly-rotating solid).
    var minimal = !!opts.minimal;
    var ctx = canvas.getContext('2d');
    var dpr = (global.devicePixelRatio || 1);
    var cssW = 200, cssH = 200;
    var latestState = null;
    var startTime = (global.performance && global.performance.now) ? global.performance.now() : Date.now();
    var rafId = null;
    var destroyed = false;

    // ---- camera + drag-to-inspect interaction ----
    var DEFAULT_TILT = TILT;              // resting pitch
    var AUTO_SPIN = 0.28;                 // idle yaw speed (rad/s)
    var MAX_PITCH_DEV = 45 * Math.PI / 180; // pitch is constrained to +/-45deg
    var yaw = 0;                          // accumulated horizontal rotation
    var pitch = DEFAULT_TILT;             // current vertical angle
    var dragging = false;
    var lastPX = 0, lastPY = 0;
    var lastFrame = 0;

    function xform(p) { return rotY(rotX(p, pitch), yaw); }

    function now() {
      return (global.performance && global.performance.now) ? global.performance.now() : Date.now();
    }

    function pointerXY(e) {
      var rect = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : { left: 0, top: 0 };
      var px = (e.touches && e.touches[0]) ? e.touches[0].clientX : e.clientX;
      var py = (e.touches && e.touches[0]) ? e.touches[0].clientY : e.clientY;
      return { x: px - rect.left, y: py - rect.top };
    }
    function onDown(e) {
      dragging = true;
      var p = pointerXY(e); lastPX = p.x; lastPY = p.y;
      if (canvas.setPointerCapture && e.pointerId != null) { try { canvas.setPointerCapture(e.pointerId); } catch (er) {} }
      canvas.style.cursor = 'grabbing';
      if (e.preventDefault) e.preventDefault();
    }
    function onMove(e) {
      if (!dragging) return;
      var p = pointerXY(e);
      var dx = p.x - lastPX, dy = p.y - lastPY;
      lastPX = p.x; lastPY = p.y;
      yaw += dx * 0.011;
      // Vertical: resistance grows toward +/-45deg so you can't flip it over —
      // pushing further gives progressively less movement (pressure at limits).
      var rel = pitch - DEFAULT_TILT;
      var delta = dy * 0.011;
      var toward = (delta > 0) === (rel >= 0);
      var resist = toward ? (1 - Math.min(1, Math.abs(rel) / MAX_PITCH_DEV)) : 1;
      rel = clampN(rel + delta * resist, -MAX_PITCH_DEV, MAX_PITCH_DEV);
      pitch = DEFAULT_TILT + rel;
      if (e.preventDefault) e.preventDefault();
    }
    function onUp(e) {
      dragging = false;
      canvas.style.cursor = 'grab';
      if (canvas.releasePointerCapture && e && e.pointerId != null) { try { canvas.releasePointerCapture(e.pointerId); } catch (er) {} }
    }
    if (!minimal && canvas.addEventListener) {
      canvas.style.touchAction = 'none';
      canvas.style.cursor = 'grab';
      canvas.addEventListener('pointerdown', onDown);
      canvas.addEventListener('pointermove', onMove);
      canvas.addEventListener('pointerup', onUp);
      canvas.addEventListener('pointercancel', onUp);
      canvas.addEventListener('pointerleave', onUp);
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
      // Advance the camera: idle auto-rotate + ease the pitch back to default
      // when the user isn't dragging (a smooth return to the resting view).
      var tn = now();
      if (!lastFrame) lastFrame = tn;
      var dt = Math.min(0.05, (tn - lastFrame) / 1000);
      lastFrame = tn;
      if (!dragging) {
        yaw += AUTO_SPIN * dt;
        pitch += (DEFAULT_TILT - pitch) * Math.min(1, dt * 3.0);
      }

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

      // Per-corner match + per-suit apex agreement drive the deformation.
      var i, s, n;
      var matched = [];       // matched[i] : is base corner i's pair coherent
      var capMatch = {};      // capMatch['s-n'] : do the two centres agree
      for (i = 0; i < 4; i++) {
        s = SUITS[i]; n = nextSuit(s);
        var ckey = s + '-' + n;
        matched[i] = minimal ? true : !!(coherence.corners && coherence.corners[ckey]);
        var cS = subj && subj[s] && subj[s].center;
        var cN = subj && subj[n] && subj[n].center;
        capMatch[ckey] = minimal ? true : isPair(cS, cN);
      }
      var agree = [];         // agree[i] : fraction of suit i's centre pairs that match
      for (i = 0; i < 4; i++) {
        var kPrev = SUITS[(i + 3) % 4] + '-' + SUITS[i];
        var kNext = SUITS[i] + '-' + SUITS[(i + 1) % 4];
        agree[i] = ((capMatch[kPrev] ? 1 : 0) + (capMatch[kNext] ? 1 : 0)) / 2;
      }
      var fullyCoherent = minimal || (coherence.peak && allCornersMatched(coherence.corners));

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

      // ---- vertex values (Ace rule): base corners on the axes, single apex ----
      var cornerVal = [];
      for (i = 0; i < 4; i++) {
        s = SUITS[i]; n = nextSuit(s);
        var cardR = subj && subj[s] && subj[s].right;
        var cardL = subj && subj[n] && subj[n].left;
        cornerVal[i] = minimal ? 8 : pointValue([cardR, cardL]);
      }
      var centreCards = [];
      for (i = 0; i < 4; i++) centreCards.push(subj && subj[SUITS[i]] && subj[SUITS[i]].center);
      var apexVal = minimal ? 9 : pointValue(centreCards);

      var corners3 = [];
      for (i = 0; i < 4; i++) corners3.push(xform(cornerRaw(i, cornerVal[i])));
      var apex3 = xform(apexRaw(apexVal));

      // ---- floor grid (subtle depth cue) ----
      if (!minimal) {
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(236,227,208,.10)';
        var GRID_N = 4, GRID_EXT = 1.55;
        ctx.beginPath();
        for (i = -GRID_N; i <= GRID_N; i++) {
          var gx = (i / GRID_N) * GRID_EXT;
          var p1 = project(xform({ x: gx, y: BASE_Y, z: -GRID_EXT }), cx, cy, scale);
          var p2 = project(xform({ x: gx, y: BASE_Y, z: GRID_EXT }), cx, cy, scale);
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          var q1 = project(xform({ x: -GRID_EXT, y: BASE_Y, z: gx }), cx, cy, scale);
          var q2 = project(xform({ x: GRID_EXT, y: BASE_Y, z: gx }), cx, cy, scale);
          ctx.moveTo(q1.x, q1.y);
          ctx.lineTo(q2.x, q2.y);
        }
        ctx.stroke();
      }

      // ---- faces (one per suit): a triangle from two adjacent base corners up
      // to the single shared apex. Painter's algorithm: farthest first.
      var pApex = project(apex3, cx, cy, scale);
      var faces = [];
      for (i = 0; i < 4; i++) {
        var left3 = corners3[(i + 3) % 4];
        var right3 = corners3[i];
        faces.push({ idx: i, left3: left3, right3: right3, avgZ: (left3.z + right3.z + apex3.z) / 3 });
      }
      faces.sort(function (a, b) { return b.avgZ - a.avgZ; });

      var f;
      for (f = 0; f < faces.length; f++) {
        var face = faces[f];
        var pL = project(face.left3, cx, cy, scale);
        var pR = project(face.right3, cx, cy, scale);
        var color = SUIT_COLORS[SUITS[face.idx]];
        var fillAlpha = fullyCoherent ? (0.42 + pulse * 0.12) : 0.24;
        ctx.beginPath();
        ctx.moveTo(pL.x, pL.y);
        ctx.lineTo(pR.x, pR.y);
        ctx.lineTo(pApex.x, pApex.y);
        ctx.closePath();
        ctx.fillStyle = hexToRgba(color, fillAlpha);
        ctx.fill();
        ctx.lineWidth = fullyCoherent ? 1.7 : 1.1;
        ctx.strokeStyle = fullyCoherent ? hexToRgba(GOLD, 0.78 + pulse * 0.2) : hexToRgba(color, 0.82);
        ctx.stroke();
      }

      // ---- nodes: base corners (gold when their pair agrees) + the apex ----
      for (i = 0; i < 4; i++) {
        drawNode(ctx, project(corners3[i], cx, cy, scale), minimal || matched[i], pulse, 3.0);
      }
      drawNode(ctx, pApex, minimal || !!coherence.peak, pulse, 4.0);

      // ---- caption / legend (hidden in the title-screen showcase) ----
      if (!minimal) {
        ctx.font = "600 9px 'Baloo 2', sans-serif";
        ctx.fillStyle = INK_MUTED;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText('THE PYRAMID', 6, 12);
        ctx.font = "8px 'Baloo 2', sans-serif";
        ctx.fillStyle = fullyCoherent ? hexToRgba(GOLD, 0.9) : 'rgba(236,227,208,.42)';
        ctx.fillText(fullyCoherent ? 'coherent — the pyramid is whole' : 'align every corner & peak', 6, cssH - 6);
      }

      ctx.restore();
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
