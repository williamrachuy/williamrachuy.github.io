/*
 * PYRAMID: the table.
 *
 * Drives the DOM from engine states. Every card is one persistent element
 * keyed by its id; a render computes where each card belongs and sets a CSS
 * transform, so swaps, draws and plays animate on the compositor. Gems are
 * small elements that pop on a lane and fly to a purse. The AI plays through
 * the same engine calls, one visible action at a time.
 *
 * Stage coordinates: the table is 100 x 100 units, the tray below it runs to
 * y = 121. One unit is --u px (the stage width / 100).
 */
(function () {
  'use strict';

  const E = PYR.Engine, AI = PYR.AI;
  const Sound = PYR.Audio || { play() {}, isMuted: () => true, toggleMute() {}, resume() {} };
  const $ = (id) => document.getElementById(id);
  const SEATS = E.SEATS, POS = E.POS;

  // ---------------------------------------------------------------------
  // Geometry of the table
  // ---------------------------------------------------------------------

  const ROT = { S: 0, E: -90, N: 180, W: 90 };
  // Subject positions; royals sit one row further out.
  const SUBJ = {
    S: { L: [37.5, 75], C: [50, 75], R: [62.5, 75] },
    E: { L: [75, 62.5], C: [75, 50], R: [75, 37.5] },
    N: { L: [62.5, 25], C: [50, 25], R: [37.5, 25] },
    W: { L: [25, 37.5], C: [25, 50], R: [25, 62.5] }
  };
  const OUT = { S: [0, 15], E: [15, 0], N: [0, -15], W: [-15, 0] };
  // Lanes sit on the table's diagonals (the pyramid's rays); the two peaks
  // sit by the apex at the centre.
  const NODE_AT = {
    cSE: [72.5, 72.5], cEN: [72.5, 27.5], cNW: [27.5, 27.5], cWS: [27.5, 72.5],
    rSE: [61, 61], rEN: [61, 39], rNW: [39, 39], rWS: [39, 61],
    pSN: [50, 43.5], pEW: [56.5, 50]
  };
  const BADGE_AT = { S: [2.5, 105.5], E: [77.5, 19], N: [1.5, 19], W: [1.5, 75] };
  const BADGE_W = { S: 24, E: 21, N: 21, W: 21 };
  const HAND_AT = { E: [89.5, 9], N: [10.5, 9], W: [10.5, 91] };
  const DECK_AT = [90, 90];
  const TRAY_Y = 111.25;
  const SUIT_GLYPH = { spades: '♠', hearts: '♥', clubs: '♣', diamonds: '♦' };
  const SEAT_COLOR = { S: 'var(--S)', E: 'var(--E)', N: 'var(--N)', W: 'var(--W)' };
  const SEAT_HEX = { S: '#dfe6f2', E: '#ff7a8a', N: '#63d6a4', W: '#78b4ff' };
  const CROWN = { K: '♔︎', Q: '♕︎', J: '♘︎' };
  const LANE_NAME = {
    cSE: 'south-east corner', cEN: 'north-east corner', cNW: 'north-west corner', cWS: 'south-west corner',
    rSE: 'South–East ridge', rEN: 'East–North ridge', rNW: 'North–West ridge', rWS: 'West–South ridge',
    pSN: 'South–North peak', pEW: 'East–West peak'
  };
  const POS_WORD = { L: 'left', C: 'centre', R: 'right' };
  const LEVELS = ['easy', 'normal', 'hard', 'master'];
  const CLOCKS = [{ v: 20, label: '20 rounds' }, { v: 30, label: '30 rounds' }, { v: 0, label: 'None' }];
  const PACES = [{ v: 'calm', label: 'Calm' }, { v: 'normal', label: 'Normal' }, { v: 'fast', label: 'Fast' }];
  const PACE_T = { calm: 1.35, normal: 1, fast: 0.5 };

  // ---------------------------------------------------------------------
  // App state
  // ---------------------------------------------------------------------

  const app = {
    state: null,
    settings: loadSettings(),
    personas: {},
    busy: false,
    sel: null,
    tollArm: null,
    token: 0,
    u: 6,
    cards: new Map(),
    place: new Map(),
    nodes: {},
    gems: {},
    badges: {},
    shown: {},
    viz: null,
    titleViz: null,
    resultsViz: null,
    rng: Math.random
  };

  function loadSettings() {
    const d = { level: 'normal', clock: 30, pace: 'normal', fx: true };
    try { return Object.assign(d, JSON.parse(localStorage.getItem('pyramid.settings') || '{}')); } catch (e) { return d; }
  }
  function saveSettings() {
    try { localStorage.setItem('pyramid.settings', JSON.stringify(app.settings)); } catch (e) { /* private mode */ }
  }

  const T = () => PACE_T[app.settings.pace] || 1;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---------------------------------------------------------------------
  // Text helpers
  // ---------------------------------------------------------------------

  function rankLabel(r) { return r === 'X' ? '10' : r; }
  function cardText(c) { return c ? rankLabel(c.r) + SUIT_GLYPH[c.s] : '?'; }
  function cardHTML(c) { return '<b style="color:' + SEAT_COLOR[E.SEAT_OF[c.s]] + '">' + cardText(c) + '</b>'; }
  function who(seat) { return app.state.players[seat].name; }
  function whoB(seat) { return '<b style="color:' + SEAT_COLOR[seat] + '">' + who(seat) + '</b>'; }
  function verb(seat, base, third) { return app.state.players[seat].human ? base : third; }
  function their(seat) { return app.state.players[seat].human ? 'your' : 'their'; }
  function laneValue(s, lane) {
    const a = s.courts[lane.a.seat].subjects[lane.a.pos], b = s.courts[lane.b.seat].subjects[lane.b.pos];
    if (a.r === 'A' && b.r === 'A') return 1;
    return a.r === 'A' ? E.value(b) : E.value(a);
  }

  // ---------------------------------------------------------------------
  // Setup screen
  // ---------------------------------------------------------------------

  function seg(el, options, current, onPick) {
    el.innerHTML = '';
    options.forEach((o) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.textContent = o.label;
      b.setAttribute('aria-checked', String(o.v === current));
      b.addEventListener('click', () => {
        el.querySelectorAll('button').forEach((x) => x.setAttribute('aria-checked', 'false'));
        b.setAttribute('aria-checked', 'true');
        onPick(o.v);
        saveSettings();
        Sound.play('click');
      });
      el.appendChild(b);
    });
  }

  function dealPersonas() {
    const order = [0, 1, 2].sort(() => Math.random() - 0.5);
    app.personas = { E: AI.persona(order[0]), N: AI.persona(order[1]), W: AI.persona(order[2]) };
    const box = $('houses-preview');
    box.innerHTML = '';
    ['E', 'N', 'W'].forEach((seat) => {
      const p = app.personas[seat], suit = E.SUIT_OF[seat];
      const d = document.createElement('div');
      d.className = 'house-card';
      d.innerHTML = '<div class="hc-suit" style="color:' + SEAT_COLOR[seat] + '">' + SUIT_GLYPH[suit] + ' ' + suit + '</div>' +
        '<div class="hc-title">' + p.title + '</div><div class="hc-flavor">' + p.flavor + '</div>';
      box.appendChild(d);
    });
  }

  function initTitle() {
    seg($('seg-level'), LEVELS.map((v) => ({ v, label: AI.LEVELS[v].label })), app.settings.level, (v) => { app.settings.level = v; });
    seg($('seg-clock'), CLOCKS, app.settings.clock, (v) => { app.settings.clock = v; });
    seg($('seg-pace'), PACES, app.settings.pace, (v) => { app.settings.pace = v; applyPace(); });
    dealPersonas();
    if (PYR.Viz) {
      app.titleViz = PYR.Viz.create($('title-canvas'));
      demoLoop();
    }
  }

  // The title pyramid folds and unfolds.
  function demoGeometry(closed) {
    const faces = closed
      ? { S: { L: 4, C: 7, R: 5 }, E: { L: 5, C: 7, R: 7 }, N: { L: 7, C: 7, R: 3 }, W: { L: 3, C: 7, R: 4 } }
      : { S: { L: 2, C: 9, R: 6 }, E: { L: 3, C: 4, R: 8 }, N: { L: 5, C: 6, R: 2 }, W: { L: 9, C: 3, R: 7 } };
    const rays = { cSE: 'SE', cEN: 'NE', cNW: 'NW', cWS: 'SW' };
    const corners = E.LANES.filter((l) => l.kind === 'corner').map((l) => ({
      id: l.id, ray: rays[l.id], paired: closed,
      a: { seat: l.a.seat, v: faces[l.a.seat][l.a.pos] }, b: { seat: l.b.seat, v: faces[l.b.seat][l.b.pos] }
    }));
    return { faces, corners, apexUnified: closed, baseClosed: closed, complete: closed, progress: closed ? 1 : 0.2 };
  }
  let demoClosed = false, demoTimer = 0;
  function demoLoop() {
    clearTimeout(demoTimer);
    if (!app.titleViz || $('screen-title').hidden) return;
    app.titleViz.update(demoGeometry(demoClosed));
    demoClosed = !demoClosed;
    demoTimer = setTimeout(demoLoop, demoClosed ? 2600 : 3800);
  }

  function applyPace() { document.documentElement.classList.toggle('fast', app.settings.pace === 'fast'); }
  function applyFx() { document.documentElement.classList.toggle('fx-off', !app.settings.fx); }

  // ---------------------------------------------------------------------
  // Building the stage
  // ---------------------------------------------------------------------

  let built = false;
  function buildStage() {
    if (built) return;
    built = true;
    const layer = $('layer');

    // The net: four faces of the unfolded pyramid, its rays, and the lanes.
    const svg = $('net');
    const ns = 'http://www.w3.org/2000/svg';
    const tri = { S: '0,100 100,100 50,50', E: '100,100 100,0 50,50', N: '100,0 0,0 50,50', W: '0,0 0,100 50,50' };
    SEATS.forEach((seat) => {
      const p = document.createElementNS(ns, 'polygon');
      p.setAttribute('points', tri[seat]);
      p.setAttribute('class', 'face');
      p.setAttribute('fill', SEAT_HEX[seat]);
      p.setAttribute('fill-opacity', '0.03');
      p.id = 'face-' + seat;
      svg.appendChild(p);
    });
    [[0, 0], [100, 0], [100, 100], [0, 100]].forEach((c) => {
      const l = document.createElementNS(ns, 'line');
      l.setAttribute('x1', 50); l.setAttribute('y1', 50); l.setAttribute('x2', c[0]); l.setAttribute('y2', c[1]);
      l.setAttribute('stroke', 'rgba(255,255,255,.10)'); l.setAttribute('stroke-width', '0.25');
      svg.appendChild(l);
      for (let i = 1; i <= 10; i++) {
        const t = 0.5 + i * 0.045, d = document.createElementNS(ns, 'circle');
        d.setAttribute('cx', 50 + (c[0] - 50) * (t - 0.5) * 2 * 0.9); d.setAttribute('cy', 50 + (c[1] - 50) * (t - 0.5) * 2 * 0.9);
        d.setAttribute('r', i % 5 ? 0.22 : 0.4); d.setAttribute('fill', 'rgba(255,255,255,.18)');
        svg.appendChild(d);
      }
    });
    const apex = document.createElementNS(ns, 'circle');
    apex.setAttribute('cx', 50); apex.setAttribute('cy', 50); apex.setAttribute('r', 0.9); apex.setAttribute('fill', 'rgba(242,201,110,.5)');
    svg.appendChild(apex);
    E.LANES.forEach((l) => {
      const pl = document.createElementNS(ns, 'polyline');
      const a = SUBJ[l.a.seat][l.a.pos], b = SUBJ[l.b.seat][l.b.pos], n = NODE_AT[l.id];
      pl.setAttribute('points', a.join(',') + ' ' + n.join(',') + ' ' + b.join(','));
      pl.setAttribute('fill', 'none');
      pl.setAttribute('class', 'lane');
      pl.setAttribute('stroke-linejoin', 'round');
      pl.id = 'lane-' + l.id;
      svg.insertBefore(pl, apex);
    });

    // Lane nodes.
    E.LANES.forEach((l) => {
      const b = document.createElement('button');
      b.className = 'node';
      b.type = 'button';
      b.dataset.lane = l.id;
      b.innerHTML = '<span class="ring"></span><span class="kind"></span>';
      b.setAttribute('aria-label', LANE_NAME[l.id]);
      b.addEventListener('click', () => onLane(l.id));
      b.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') showLaneTip(l.id); });
      b.addEventListener('pointerleave', () => hideTip());
      b.addEventListener('focus', () => showLaneTip(l.id));
      b.addEventListener('blur', () => hideTip());
      layer.appendChild(b);
      app.nodes[l.id] = b;
    });

    // House badges.
    SEATS.forEach((seat) => {
      const d = document.createElement('div');
      d.className = 'badge' + (seat === 'S' ? ' me' : '');
      d.style.setProperty('--c', SEAT_COLOR[seat]);
      d.innerHTML = '<div class="badge-top"><span class="badge-name"></span><span class="badge-gems">0</span></div><div class="badge-sub"></div>';
      layer.appendChild(d);
      app.badges[seat] = d;
    });

    // The deck: a little stack of backs, and its count.
    for (let i = 0; i < 3; i++) {
      const d = document.createElement('div');
      d.className = 'card down deck-back no-anim';
      d.innerHTML = '<div class="card-body"><div class="back"></div></div>';
      d.dataset.off = i;
      layer.appendChild(d);
    }
    const dc = document.createElement('div');
    dc.className = 'deck-count';
    dc.id = 'deck-count';
    layer.appendChild(dc);

    // Tray: your hand and the turn buttons.
    const hl = document.createElement('div');
    hl.className = 'hand-label';
    hl.id = 'hand-label';
    layer.appendChild(hl);
    const btns = document.createElement('div');
    btns.className = 'tray-btns';
    btns.innerHTML = '<button class="btn btn-quiet" id="btn-draw">Draw <span class="cost" id="draw-cost"></span></button>' +
      '<button class="btn btn-gold" id="btn-end">End turn</button>';
    layer.appendChild(btns);
    app.trayBtns = btns;
    $('btn-draw').addEventListener('click', () => act({ type: 'draw' }));
    $('btn-end').addEventListener('click', () => act({ type: 'pass' }));

    if (window.ResizeObserver) new ResizeObserver(() => layout()).observe($('stage'));
    window.addEventListener('resize', layout);

    if (PYR.Viz) app.viz = PYR.Viz.create($('pyr-canvas'));
    $('btn-view').addEventListener('click', () => {
      if (!app.viz) return;
      const v = app.viz.toggleView();
      $('btn-view').textContent = v === 'top' ? '3D' : 'Plan';
    });
    $('stage').addEventListener('click', (e) => {
      if (e.target.closest('.card, .node, .btn')) return;
      clearSel();
    });
  }

  function px(x, y) { return [x * app.u, y * app.u]; }

  function layout() {
    const stage = $('stage');
    if (!stage || !stage.clientWidth) return;
    const u = stage.clientWidth / 100;
    const changed = Math.abs(u - app.u) > 0.01;
    app.u = u;
    stage.style.setProperty('--u', u + 'px');
    E.LANES.forEach((l) => {
      const [x, y] = px(NODE_AT[l.id][0], NODE_AT[l.id][1]);
      app.nodes[l.id].style.transform = 'translate(' + x + 'px,' + y + 'px)';
    });
    SEATS.forEach((seat) => {
      const [x, y] = px(BADGE_AT[seat][0], BADGE_AT[seat][1]);
      app.badges[seat].style.transform = 'translate(' + x + 'px,' + y + 'px)';
      app.badges[seat].style.width = (BADGE_W[seat] * u) + 'px';
    });
    document.querySelectorAll('.deck-back').forEach((d) => {
      const o = +d.dataset.off;
      d.style.transform = 'translate(' + ((DECK_AT[0] - 5 - o * 0.35) * u) + 'px,' + ((DECK_AT[1] - 7 - o * 0.35) * u) + 'px)';
    });
    let [x, y] = px(DECK_AT[0], DECK_AT[1] - 10.4);
    $('deck-count').style.transform = 'translate(' + x + 'px,' + y + 'px) translateX(-50%)';
    [x, y] = px(50, TRAY_Y - 1.2);
    $('hand-label').style.transform = 'translate(' + x + 'px,' + y + 'px) translateX(-50%)';
    [x, y] = px(76, 103.4);
    app.trayBtns.style.transform = 'translate(' + x + 'px,' + y + 'px)';
    Object.keys(app.gems).forEach((id) => setGemAt(app.gems[id], NODE_AT[id]));
    if (changed && app.state) {
      app.cards.forEach((el) => el.classList.add('no-anim'));
      renderCards(app.state, true);
      requestAnimationFrame(() => app.cards.forEach((el) => el.classList.remove('no-anim')));
    }
  }

  // ---------------------------------------------------------------------
  // Cards
  // ---------------------------------------------------------------------

  function placements(s) {
    const m = new Map();
    SEATS.forEach((seat) => {
      POS.forEach((pos) => {
        const [x, y] = SUBJ[seat][pos];
        m.set(s.courts[seat].subjects[pos].id, { zone: 'subject', seat, pos, x, y, rot: ROT[seat], card: s.courts[seat].subjects[pos] });
        m.set(s.courts[seat].royals[pos].id, { zone: 'royal', seat, pos, x: x + OUT[seat][0], y: y + OUT[seat][1], rot: ROT[seat], card: s.courts[seat].royals[pos], royal: true });
      });
      const hand = s.players[seat].hand;
      hand.forEach((c, i) => {
        if (s.players[seat].human) {
          m.set(c.id, { zone: 'hand', seat, index: i, x: 39 + 11 * i, y: TRAY_Y, rot: 0, card: c });
        } else {
          const k = i - (hand.length - 1) / 2;
          m.set(c.id, { zone: 'hand', seat, index: i, x: HAND_AT[seat][0] + k * 3.6, y: HAND_AT[seat][1] + Math.abs(k) * 0.5, rot: k * 9, scale: 0.62, down: s.phase === 'play', card: c });
        }
      });
    });
    return m;
  }

  function makeCard(c, royal) {
    const el = document.createElement('div');
    el.className = 'card' + (royal ? ' royal' : '');
    el.dataset.suit = c.s;
    el.innerHTML = '<div class="card-body"><div class="face"><div class="face-in">' +
      (royal ? '<span class="crown">' + CROWN[c.r] + '</span>' : '') +
      '<span class="rank">' + rankLabel(c.r) + '</span><span class="pip">' + SUIT_GLYPH[c.s] + '</span></div></div><div class="back"></div></div>';
    el.addEventListener('click', (e) => { e.stopPropagation(); onCard(c.id); });
    el.setAttribute('aria-label', E.rankName(c.r) + ' of ' + c.s);
    $('layer').appendChild(el);
    return el;
  }

  function transformFor(el, p) {
    const u = app.u, w = 10 * u, h = 14 * u;
    let rot = p.rot;
    if (el._rot != null) rot = p.rot + 360 * Math.round((el._rot - p.rot) / 360);
    el._rot = rot;
    return 'translate3d(' + (p.x * u - w / 2).toFixed(1) + 'px,' + (p.y * u - h / 2).toFixed(1) + 'px,0) rotate(' + rot + 'deg) scale(' + (p.scale || 1) + ')';
  }

  function renderCards(s, instant) {
    const m = placements(s);
    app.place = m;
    const moved = [];
    m.forEach((p, id) => {
      let el = app.cards.get(id);
      if (!el) {
        el = makeCard(p.card, p.royal);
        app.cards.set(id, el);
        // New on the table: it comes off the deck.
        el.classList.add('no-anim', 'down');
        el._rot = 0;
        el.style.transform = transformFor(el, { x: DECK_AT[0], y: DECK_AT[1], rot: 0 });
        el.getBoundingClientRect();
        el.classList.remove('no-anim');
      }
      const tf = transformFor(el, p);
      el.querySelector('.face-in').style.transform = 'rotate(' + (-el._rot) + 'deg)';
      el.classList.toggle('down', !!p.down);
      if (el._tf !== tf) {
        if (el._tf && !instant) moved.push(el);
        el._tf = tf;
        el.style.transform = tf;
      }
    });
    // Cards that left the table went to the bottom of the deck.
    app.cards.forEach((el, id) => {
      if (m.has(id)) return;
      app.cards.delete(id);
      el.classList.add('is-moving');
      el.classList.add('down');
      el.style.transform = transformFor(el, { x: DECK_AT[0], y: DECK_AT[1], rot: 0 });
      setTimeout(() => el.remove(), 800);
    });
    moved.forEach((el) => {
      el.classList.add('is-moving', 'glint');
      clearTimeout(el._mt);
      el._mt = setTimeout(() => el.classList.remove('is-moving', 'glint'), 900);
    });
    updateCardStates();
    return moved.length;
  }

  function myTurn() {
    const s = app.state;
    return s && s.phase === 'play' && s.players[s.current].human && !app.busy;
  }

  function updateCardStates() {
    const mine = myTurn();
    const sel = app.sel;
    app.place.forEach((p, id) => {
      const el = app.cards.get(id);
      if (!el) return;
      const own = p.seat === 'S';
      el.classList.toggle('is-clickable', mine && own);
      el.classList.toggle('is-selected', !!sel && sel.id === id);
      let target = false;
      if (mine && sel && sel.id !== id && own) {
        if (sel.zone === 'subject' && p.zone === 'subject') target = true;
        if (sel.zone === 'royal' && p.zone === 'royal') target = true;
        if (sel.zone === 'hand' && p.zone === 'subject') target = true;
        if (sel.zone === 'subject' && p.zone === 'hand') target = true;
      }
      el.classList.toggle('is-target', target);
    });
  }

  // ---------------------------------------------------------------------
  // Lanes, gems, badges
  // ---------------------------------------------------------------------

  function setGemAt(g, at, scale) {
    const t = 'translate(' + (at[0] * app.u) + 'px,' + (at[1] * app.u) + 'px)' + (scale != null ? ' scale(' + scale + ')' : '');
    g.style.setProperty('--at', 'translate(' + (at[0] * app.u) + 'px,' + (at[1] * app.u) + 'px)');
    g.style.transform = t;
  }

  function makeGem(at, pop) {
    const g = document.createElement('div');
    g.className = 'gem' + (pop ? ' pop' : '');
    g.innerHTML = '<i></i>';
    setGemAt(g, at);
    $('layer').appendChild(g);
    return g;
  }

  // Gems resting on stalemated lanes.
  function renderGems(s) {
    E.LANES.forEach((l) => {
      const has = s.lanes[l.id].gem;
      if (has && !app.gems[l.id]) app.gems[l.id] = makeGem(NODE_AT[l.id], true);
      if (!has && app.gems[l.id]) { app.gems[l.id].remove(); delete app.gems[l.id]; }
    });
  }

  function renderNodes(s) {
    const mine = myTurn();
    E.LANES.forEach((l) => {
      const n = app.nodes[l.id];
      const st = s.lanes[l.id];
      const ctrl = E.controller(s, l);
      n.classList.toggle('paired', st.paired);
      n.classList.toggle('stalemate', !ctrl);
      n.style.setProperty('--ctrl', ctrl ? SEAT_HEX[ctrl] : 'rgba(255,255,255,.3)');
      n.querySelector('.kind').textContent = st.paired ? String(laneValue(s, l)) : (l.kind === 'peak' ? '▲' : '');
      const acc = E.laneAccess(s, l.id, s.current);
      n.classList.toggle('is-disabled', !(mine && acc.ok));
      n.classList.toggle('is-armed', app.tollArm === l.id);
      const line = $('lane-' + l.id);
      line.setAttribute('stroke', st.paired ? '#f2c96e' : (ctrl ? SEAT_HEX[ctrl] : '#ffffff'));
      line.setAttribute('stroke-opacity', st.paired ? '0.75' : '0.16');
      line.setAttribute('stroke-width', st.paired ? '0.55' : '0.3');
      line.setAttribute('stroke-dasharray', ctrl || st.paired ? '' : '1 1');
    });
  }

  function renderBadges(s, bumps) {
    SEATS.forEach((seat) => {
      const b = app.badges[seat], P = s.players[seat];
      b.querySelector('.badge-name').textContent = SUIT_GLYPH[P.suit] + ' ' + P.name;
      const g = b.querySelector('.badge-gems');
      if (g.textContent !== String(P.gems)) {
        g.textContent = P.gems;
        if (bumps) { g.classList.remove('bump'); void g.offsetWidth; g.classList.add('bump'); }
      }
      b.classList.toggle('is-turn', s.phase === 'play' && s.current === seat);
      let sub;
      if (P.human) {
        const free = s.current === seat && s.phase === 'play' ? (s.free > 0 ? '<span class="free">✦ free action</span>' : '<span class="free spent">free action</span>') : 'waiting';
        sub = free;
      } else {
        sub = app.personas[seat] ? app.personas[seat].title : '';
      }
      b.querySelector('.badge-sub').innerHTML = sub;
    });
    SEATS.forEach((seat) => {
      const f = $('face-' + seat);
      if (f) f.setAttribute('fill-opacity', s.phase === 'play' && s.current === seat ? '0.085' : '0.03');
    });
  }

  function renderTray(s) {
    const mine = myTurn();
    const P = s.players.S;
    const canDraw = mine && !E.whyIllegal(s, { type: 'draw' });
    $('btn-draw').disabled = !canDraw;
    $('btn-end').disabled = !mine;
    $('draw-cost').textContent = s.free > 0 && s.current === 'S' ? '· free' : '· 1◆';
    $('hand-label').textContent = P.hand.length ? '' : (s.deck.length ? 'Your hand is empty' : 'The deck is empty');
    $('deck-count').textContent = s.deck.length + ' in deck';
    document.querySelectorAll('.deck-back').forEach((d, i) => { d.style.opacity = s.deck.length > i ? '1' : '0'; });
  }

  function renderTop(s) {
    const r = s.rules.maxRounds ? 'Round <b>' + s.round + '</b> / ' + s.rules.maxRounds : 'Round <b>' + s.round + '</b>';
    let t;
    if (s.phase !== 'play') t = 'Game over';
    else if (s.players[s.current].human) t = '<b>Your turn</b>';
    else t = '<b style="color:' + SEAT_COLOR[s.current] + '">' + who(s.current) + '</b>';
    $('topbar-mid').innerHTML = r + ' · ' + t;
  }

  function renderViz(s) {
    const g = E.geometry(s);
    if (app.viz) app.viz.update(g);
    $('pyr-count').textContent = g.pairedCount + ' / 10';
    $('pyr-bar-fill').style.width = (g.progress * 100) + '%';
    const corners = g.corners.filter((c) => c.paired).length;
    const apex = E.LANES.filter((l) => l.kind !== 'corner' && s.lanes[l.id].paired).length;
    $('pyr-note').textContent = g.complete
      ? 'Closed: four faces meet over a four-sided base.'
      : corners + ' of 4 base corners and ' + apex + ' of 6 apex lanes meet. Drag to turn it.';
  }

  function renderHint(s) {
    let h;
    if (s.phase !== 'play') {
      h = 'The game is over. Open the menu to deal again.';
    } else if (!s.players[s.current].human) {
      h = whoB(s.current) + ' is playing.';
    } else if (app.busy) {
      h = '';
    } else if (app.tollArm) {
      const acc = E.laneAccess(s, app.tollArm, 'S');
      h = 'Click the ' + LANE_NAME[app.tollArm] + ' again to pay ' + whoB(acc.controller) + ' one gem and make the swap.';
    } else if (app.sel) {
      const p = app.place.get(app.sel.id);
      if (p.zone === 'subject') h = 'Swap ' + cardHTML(p.card) + ' with another of your subjects, or play a card from your hand onto it.';
      else if (p.zone === 'royal') h = 'Swap ' + cardHTML(p.card) + ' with another of your royals. Royals decide who controls your lanes.';
      else h = 'Play ' + cardHTML(p.card) + ' onto one of your subjects. The card it replaces goes to the bottom of the deck.';
    } else {
      const cost = s.free > 0 ? 'Your <b>free action</b> is ready.' : 'Each action now costs <b>1 gem</b> (you have ' + s.players.S.gems + ').';
      h = cost + ' Swap two of your subjects or royals, or click a lane to swap across it.';
    }
    $('hint').innerHTML = h;
  }

  function render(s, opts) {
    opts = opts || {};
    renderCards(s, opts.instant);
    renderNodes(s);
    renderGems(s);
    if (!opts.keepBadges) renderBadges(s, opts.bumps);
    renderTray(s);
    renderTop(s);
    renderViz(s);
    renderHint(s);
  }

  // ---------------------------------------------------------------------
  // Tooltips
  // ---------------------------------------------------------------------

  function showLaneTip(id) {
    const s = app.state;
    if (!s) return;
    const l = E.LANE_BY_ID[id];
    const a = s.courts[l.a.seat].subjects[l.a.pos], b = s.courts[l.b.seat].subjects[l.b.pos];
    const ra = s.courts[l.a.seat].royals[l.a.pos], rb = s.courts[l.b.seat].royals[l.b.pos];
    const ctrl = E.controller(s, l);
    const st = s.lanes[id];
    let html = '<div class="tip-head">' + LANE_NAME[id] + '</div>';
    html += cardHTML(a) + ' ' + who(l.a.seat) + ' ↔ ' + cardHTML(b) + ' ' + who(l.b.seat) + ' · ' + (st.paired ? '<b>paired (' + laneValue(s, l) + ')</b>' : 'not paired') + '<br>';
    if (ctrl) {
      const win = ctrl === l.a.seat ? ra : rb, lose = ctrl === l.a.seat ? rb : ra;
      html += whoB(ctrl) + ' ' + (s.players[ctrl].human ? 'control' : 'controls') + ' it: ' + cardHTML(win) + ' trumps ' + cardHTML(lose) + '.<br>';
    } else {
      html += '<b>Stalemate</b>: ' + cardHTML(ra) + ' and ' + cardHTML(rb) + ' are the same rank and colour.<br>';
    }
    if (s.phase === 'play' && s.players[s.current].human) {
      const acc = E.laneAccess(s, id, 'S');
      if (acc.ok && acc.toll) html += 'Swap by paying ' + whoB(acc.toll) + ' 1 gem.';
      else if (acc.ok) html += 'Swap for ' + (s.free > 0 ? 'your free action.' : '1 gem.');
      else html += acc.reason;
    }
    if (st.gem) html += '<br>A gem waits here for whoever takes control.';
    const tip = $('tip');
    tip.innerHTML = html;
    tip.hidden = false;
    const [nx, ny] = NODE_AT[id];
    const W = $('stage').clientWidth, tw = tip.offsetWidth, th = tip.offsetHeight;
    let x = nx * app.u - tw / 2, y = ny * app.u - th - 4.5 * app.u;
    if (y < 0) y = ny * app.u + 4.5 * app.u;
    x = Math.max(4, Math.min(W - tw - 4, x));
    tip.style.transform = 'translate(' + x + 'px,' + y + 'px)';
    [l.a, l.b].forEach((end) => {
      const sc = s.courts[end.seat];
      [sc.subjects[end.pos].id, sc.royals[end.pos].id].forEach((cid) => { const el = app.cards.get(cid); if (el) el.classList.add('is-lit'); });
    });
    app.nodes[id].classList.add('is-hot');
  }

  function hideTip() {
    $('tip').hidden = true;
    app.cards.forEach((el) => el.classList.remove('is-lit'));
    Object.values(app.nodes).forEach((n) => n.classList.remove('is-hot'));
  }

  // ---------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------

  function clearSel() {
    if (!app.sel && !app.tollArm) return;
    app.sel = null;
    app.tollArm = null;
    updateCardStates();
    renderNodes(app.state);
    renderHint(app.state);
  }

  function onCard(id) {
    Sound.resume && Sound.resume();
    if (!app.state) return;
    const p = app.place.get(id);
    if (!p) return;
    if (!myTurn()) {
      if (app.state.phase === 'play' && !app.busy) toast(who(app.state.current) + ' is playing.');
      return;
    }
    if (p.seat !== 'S') { toast('That card belongs to ' + who(p.seat) + '. Click a lane to swap across it.'); return; }
    app.tollArm = null;
    const sel = app.sel && app.place.get(app.sel.id);
    if (sel && app.sel.id === id) { clearSel(); return; }
    if (sel) {
      if (sel.zone === 'subject' && p.zone === 'subject') return act({ type: 'court', a: sel.pos, b: p.pos });
      if (sel.zone === 'royal' && p.zone === 'royal') return act({ type: 'royal', a: sel.pos, b: p.pos });
      if (sel.zone === 'hand' && p.zone === 'subject') return act({ type: 'play', hand: sel.index, pos: p.pos });
      if (sel.zone === 'subject' && p.zone === 'hand') return act({ type: 'play', hand: p.index, pos: sel.pos });
    }
    app.sel = { id, zone: p.zone };
    Sound.play('click');
    updateCardStates();
    renderNodes(app.state);
    renderHint(app.state);
  }

  function onLane(id) {
    Sound.resume && Sound.resume();
    if (!app.state) return;
    if (!myTurn()) { if (app.state.phase === 'play' && !app.busy) toast(who(app.state.current) + ' is playing.'); return; }
    const acc = E.laneAccess(app.state, id, 'S');
    if (!acc.ok) { toast(acc.reason); Sound.play('error'); return; }
    if (acc.toll && app.tollArm !== id) {
      app.tollArm = id;
      app.sel = null;
      updateCardStates();
      renderNodes(app.state);
      renderHint(app.state);
      toast('Click again to pay ' + who(acc.toll) + ' one gem for this swap.', true);
      clearTimeout(app.tollTimer);
      app.tollTimer = setTimeout(() => { if (app.tollArm === id) clearSel(); }, 5000);
      return;
    }
    app.tollArm = null;
    act({ type: 'lane', lane: id });
  }

  async function act(action) {
    if (!myTurn()) return;
    const why = E.whyIllegal(app.state, action);
    if (why) { toast(why); Sound.play('error'); return; }
    hideTip();
    app.sel = null;
    app.tollArm = null;
    app.busy = true;
    const token = app.token;
    await perform(action);
    if (token !== app.token) return;
    app.busy = false;
    if (app.state.phase === 'play' && !app.state.players[app.state.current].human) runAI();
    else render(app.state);
  }

  // ---------------------------------------------------------------------
  // Playing an action, with its animation
  // ---------------------------------------------------------------------

  async function perform(action) {
    const before = app.state;
    const r = E.apply(before, action);
    if (r.error) { toast(r.error); return; }
    app.state = r.state;
    await animate(before, r.state, r.events);
  }

  function badgeCenter(seat) {
    return [BADGE_AT[seat][0] + BADGE_W[seat] - 4, BADGE_AT[seat][1] + 2.5];
  }

  function courtCenter(seat) { return SUBJ[seat].C; }

  function fly(from, to, delay, opts) {
    opts = opts || {};
    return new Promise((res) => {
      const g = opts.el || makeGem(from, !opts.el && opts.pop);
      setTimeout(() => {
        setGemAt(g, to, opts.shrink ? 0.4 : 1);
        if (opts.fadeTo) g.style.opacity = '0';
      }, delay);
      setTimeout(() => { g.style.opacity = '0'; setTimeout(() => { g.remove(); res(); }, 280); }, delay + 780 * Math.max(0.6, T()));
    });
  }

  async function animate(before, after, events) {
    const t = T();
    const flights = [];
    let longest = 0;

    events.forEach((e) => logEvent(e, before, after));
    const moved = renderCards(after);
    renderNodes(after);
    renderTray(after);
    renderTop(after);
    renderViz(after);
    renderHint(after);
    renderBadgeFree(after);

    if (events.some((e) => e.type === 'swap' || e.type === 'play')) Sound.play('pivot');
    if (events.some((e) => e.type === 'draw')) Sound.play('draw');

    const spawned = new Set(events.filter((e) => e.type === 'spawn').map((e) => e.lane));
    const gemDelay = (moved ? 520 : 120) * t;

    events.forEach((e) => {
      if (e.type === 'pay' && !e.free && !e.to) {
        // A gem spent to the bank: it lifts off the purse and fades.
        const from = badgeCenter(e.seat);
        flights.push(fly(from, [from[0], from[1] - 6], 0, { fadeTo: true, shrink: true }));
      }
      if (e.type === 'toll') {
        Sound.play('buy');
        flights.push(fly(badgeCenter(e.seat), badgeCenter(e.to), 60, {}));
      }
      if (e.type === 'collect') {
        let el = null;
        if (!spawned.has(e.lane) && app.gems[e.lane]) { el = app.gems[e.lane]; delete app.gems[e.lane]; }
        const at = NODE_AT[e.lane];
        const startAt = spawned.has(e.lane) ? gemDelay + 420 * t : gemDelay;
        if (!el) {
          const g = makeGem(at, false);
          g.style.opacity = '0';
          setTimeout(() => { g.style.opacity = '1'; g.classList.add('pop'); Sound.play('gemArm'); }, gemDelay);
          el = g;
        }
        setTimeout(() => Sound.play('claim'), startAt + 500 * t);
        flights.push(fly(at, badgeCenter(e.seat), startAt, { el }));
        longest = Math.max(longest, startAt + 800 * t);
      }
      if (e.type === 'flush') {
        const at = courtCenter(e.seat);
        setTimeout(() => Sound.play('claim'), gemDelay + 300 * t);
        flights.push(fly(at, badgeCenter(e.seat), gemDelay + 200 * t, { pop: true }));
        toast(who(e.seat) + (app.state.players[e.seat].human ? '’ve' : '’s court has') + ' a flush: +1 gem', true);
      }
    });
    // Gems that stay on a stalemated lane appear after the cards land.
    const resting = events.filter((e) => e.type === 'spawn' && after.lanes[e.lane].gem);
    if (resting.length) {
      setTimeout(() => { renderGems(after); Sound.play('gemArm'); }, gemDelay);
    } else {
      renderGems(after);
    }

    const started = performance.now();
    const base = moved ? 650 * t : 200 * t;
    await Promise.race([Promise.all(flights), wait(2600)]);
    await wait(Math.max(0, Math.max(base, longest) - (performance.now() - started)));
    renderGems(after);
    renderBadges(after, true);

    const turn = events.find((e) => e.type === 'turn');
    if (turn) {
      sweep();
      if (after.players[turn.seat].human) Sound.play('turn');
    }
    const end = events.find((e) => e.type === 'end');
    if (end) {
      render(after);
      await wait(700 * t);
      showResults(after);
    }
  }

  // The human's free-action marker changes at once (not after the gems land).
  function renderBadgeFree(s) {
    const b = app.badges.S;
    const P = s.players.S;
    const free = s.current === 'S' && s.phase === 'play' ? (s.free > 0 ? '<span class="free">✦ free action</span>' : '<span class="free spent">free action</span>') : 'waiting';
    b.querySelector('.badge-sub').innerHTML = free;
  }

  function sweep() {
    const s = $('sweep');
    s.classList.remove('go');
    void s.offsetWidth;
    s.classList.add('go');
  }

  // ---------------------------------------------------------------------
  // The AI's turns
  // ---------------------------------------------------------------------

  function highlight(action, seat, on) {
    const s = app.state;
    const ids = [];
    if (action.type === 'court' || action.type === 'royal') {
      const row = action.type === 'court' ? s.courts[seat].subjects : s.courts[seat].royals;
      ids.push(row[action.a].id, row[action.b].id);
    } else if (action.type === 'lane') {
      const l = E.LANE_BY_ID[action.lane];
      ids.push(s.courts[l.a.seat].subjects[l.a.pos].id, s.courts[l.b.seat].subjects[l.b.pos].id);
      app.nodes[action.lane].classList.toggle('is-hot', on);
    } else if (action.type === 'play') {
      ids.push(s.players[seat].hand[action.hand].id, s.courts[seat].subjects[action.pos].id);
    }
    ids.forEach((id) => { const el = app.cards.get(id); if (el) el.classList.toggle('is-ai-pick', on); });
  }

  async function runAI() {
    const token = app.token;
    app.busy = true;
    render(app.state);
    while (app.state.phase === 'play' && !app.state.players[app.state.current].human) {
      const seat = app.state.current;
      app.badges[seat].classList.add('thinking');
      await wait(520 * T());
      if (token !== app.token) return;
      let acted = 0;
      while (app.state.phase === 'play' && app.state.current === seat) {
        const a = AI.choose(app.state, { persona: app.personas[seat], level: app.settings.level, rng: app.rng, actionsThisTurn: acted });
        if (a.type !== 'pass') {
          highlight(a, seat, true);
          await wait(480 * T());
          if (token !== app.token) return;
          highlight(a, seat, false);
        } else {
          app.badges[seat].classList.remove('thinking');
        }
        await perform(a);
        if (token !== app.token) return;
        acted++;
        if (a.type !== 'pass') await wait(260 * T());
      }
      app.badges[seat].classList.remove('thinking');
    }
    app.busy = false;
    render(app.state);
  }

  // ---------------------------------------------------------------------
  // The log
  // ---------------------------------------------------------------------

  function log(html, seat) {
    const li = document.createElement('li');
    li.innerHTML = html;
    if (seat) li.style.setProperty('--c', SEAT_COLOR[seat]);
    const ol = $('log');
    ol.insertBefore(li, ol.firstChild);
    while (ol.children.length > 80) ol.removeChild(ol.lastChild);
  }

  function logEvent(e, before, after) {
    const s = after;
    const W = (seat) => whoB(seat);
    switch (e.type) {
      case 'swap': {
        const byId = (id) => findCard(before, id);
        const c1 = byId(e.cards[0]), c2 = byId(e.cards[1]);
        if (e.kind === 'court') log(W(e.seat) + ' ' + verb(e.seat, 'swap', 'swaps') + ' ' + cardHTML(c1) + ' and ' + cardHTML(c2) + ' in ' + their(e.seat) + ' court.', e.seat);
        else if (e.kind === 'royal') log(W(e.seat) + ' ' + verb(e.seat, 'move', 'moves') + ' ' + their(e.seat) + ' royals: ' + cardHTML(c1) + ' ↔ ' + cardHTML(c2) + '.', e.seat);
        else log(W(e.seat) + ' ' + verb(e.seat, 'swap', 'swaps') + ' ' + cardHTML(c1) + ' ↔ ' + cardHTML(c2) + ' across the ' + LANE_NAME[e.lane] + '.', e.seat);
        break;
      }
      case 'toll':
        log(W(e.seat) + ' ' + verb(e.seat, 'pay', 'pays') + ' ' + W(e.to) + ' a gem for the lane.', e.seat);
        break;
      case 'play': {
        const c = findCard(after, e.card), d = findCard(before, e.displaced);
        log(W(e.seat) + ' ' + verb(e.seat, 'play', 'plays') + ' ' + cardHTML(c) + ' over ' + cardHTML(d) + ' (' + POS_WORD[e.pos] + ').', e.seat);
        break;
      }
      case 'draw': {
        const c = findCard(after, e.card);
        log(s.players[e.seat].human ? 'You draw ' + cardHTML(c) + '.' : W(e.seat) + ' draws a card.', e.seat);
        break;
      }
      case 'spawn':
        if (s.lanes[e.lane].gem) log('The ' + LANE_NAME[e.lane] + ' pairs. Stalemate: its gem waits.', null);
        break;
      case 'collect': {
        const fresh = before.lanes[e.lane].gem === false;
        log(fresh ? 'The ' + LANE_NAME[e.lane] + ' pairs: ' + W(e.seat) + ' ' + verb(e.seat, 'collect', 'collects') + ' a gem.'
          : W(e.seat) + ' ' + verb(e.seat, 'take', 'takes') + ' the gem waiting on the ' + LANE_NAME[e.lane] + '.', e.seat);
        break;
      }
      case 'flush':
        log(W(e.seat) + (s.players[e.seat].human ? ' hold' : ' holds') + ' a flush: +1 gem.', e.seat);
        break;
      case 'turn':
        if (s.players[e.seat].human) log('<b>Round ' + e.round + '.</b> Your turn.', 'S');
        break;
      case 'end':
        log(e.reason === 'pyramid' ? '<b>The pyramid closes.</b>' : '<b>The clock runs out.</b>', null);
        break;
    }
  }

  function findCard(s, id) {
    for (const seat of SEATS) {
      for (const p of POS) {
        if (s.courts[seat].subjects[p].id === id) return s.courts[seat].subjects[p];
        if (s.courts[seat].royals[p].id === id) return s.courts[seat].royals[p];
      }
      for (const c of s.players[seat].hand) if (c.id === id) return c;
    }
    for (const c of s.deck) if (c.id === id) return c;
    return null;
  }

  // ---------------------------------------------------------------------
  // Toast, overlays, results
  // ---------------------------------------------------------------------

  let toastTimer = 0;
  function toast(msg, good) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.toggle('good', !!good);
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }

  function openOverlay(id) { $(id).hidden = false; Sound.play('click'); const f = $(id).querySelector('button'); if (f) f.focus(); }
  function closeOverlay(el) { el.hidden = true; }

  function showResults(s) {
    const human = s.winners.indexOf('S') >= 0;
    $('results-title').textContent = s.endReason === 'pyramid' ? 'The Pyramid Closes' : 'The Clock Runs Out';
    const best = s.players[s.winners[0]].gems;
    let sub;
    if (s.winners.length > 1) sub = 'Shared at ' + best + ' gems: ' + s.winners.map(who).join(' and ') + '.';
    else if (human) sub = 'You win with ' + best + ' gems.';
    else sub = who(s.winners[0]) + ' wins with ' + best + ' gems.';
    if (s.endReason !== 'pyramid') sub += ' ' + E.pairedCount(s) + ' of 10 lanes were paired.';
    $('results-sub').textContent = sub;
    const box = $('standings');
    box.innerHTML = '';
    SEATS.slice().sort((a, b) => s.players[b].gems - s.players[a].gems).forEach((seat) => {
      const d = document.createElement('div');
      d.className = 'standing' + (s.winners.indexOf(seat) >= 0 ? ' win' : '');
      d.style.setProperty('--c', SEAT_COLOR[seat]);
      d.innerHTML = '<div class="st-crown">' + (s.winners.indexOf(seat) >= 0 ? '♔︎' : '') + '</div><div class="st-name">' + SUIT_GLYPH[s.players[seat].suit] + ' ' + who(seat) + '</div><div class="st-gems">' + s.players[seat].gems + '</div>';
      box.appendChild(d);
    });
    $('results').hidden = false;
    if (PYR.Viz && !app.resultsViz) app.resultsViz = PYR.Viz.create($('results-canvas'));
    if (app.resultsViz) { app.resultsViz.resize(); app.resultsViz.update(E.geometry(s)); }
    Sound.play(s.endReason === 'pyramid' ? 'pyramid' : (human ? 'win' : 'lose'));
    if (human) setTimeout(() => Sound.play('win'), 900);
  }

  // ---------------------------------------------------------------------
  // Game lifecycle
  // ---------------------------------------------------------------------

  function newGame() {
    app.token++;
    app.busy = false;
    app.sel = null;
    app.tollArm = null;
    if (!app.personas.E) dealPersonas();
    app.state = E.newGame({
      maxRounds: app.settings.clock,
      names: { S: 'You', E: 'Hearts', N: 'Clubs', W: 'Diamonds' }
    });
    app.rng = E.mulberry32(app.state.seed ^ 0x9e3779b9);
    app.cards.forEach((el) => el.remove());
    app.cards.clear();
    Object.values(app.gems).forEach((g) => g.remove());
    app.gems = {};
    $('log').innerHTML = '';
    $('results').hidden = true;
    layout();
    render(app.state, { instant: true });
    // Deal: the cards were placed at the deck; let them fly out.
    app.cards.forEach((el, id) => {
      const p = app.place.get(id);
      el.classList.add('no-anim');
      el.style.transform = transformFor(el, { x: DECK_AT[0], y: DECK_AT[1], rot: 0, scale: 0.9 });
      el.classList.add('down');
      el.getBoundingClientRect();
      el.classList.remove('no-anim');
      const i = [...app.place.keys()].indexOf(id);
      setTimeout(() => {
        el._tf = transformFor(el, p);
        el.style.transform = el._tf;
        el.classList.toggle('down', !!p.down);
      }, 40 + i * 45);
    });
    log('<b>The table is dealt.</b> You play South (♠). Your free action is ready.', 'S');
    setTimeout(sweep, 900);
  }

  function showGame() {
    $('screen-title').hidden = true;
    $('screen-game').hidden = false;
    clearTimeout(demoTimer);
    buildStage();
    requestAnimationFrame(() => { layout(); newGame(); });
  }

  // ---------------------------------------------------------------------
  // Wiring
  // ---------------------------------------------------------------------

  function syncSound() {
    const on = !Sound.isMuted();
    $('btn-sound').classList.toggle('is-off', !on);
    $('opt-sound').checked = on;
  }

  function init() {
    applyPace();
    applyFx();
    initTitle();
    $('btn-begin').addEventListener('click', () => { Sound.resume && Sound.resume(); Sound.play('click'); showGame(); });
    $('btn-rules-title').addEventListener('click', () => openOverlay('rules'));
    $('btn-rules').addEventListener('click', () => openOverlay('rules'));
    $('btn-menu').addEventListener('click', () => openOverlay('menu'));
    $('btn-menu-rules').addEventListener('click', () => { closeOverlay($('menu')); openOverlay('rules'); });
    $('btn-sound').addEventListener('click', () => { Sound.toggleMute(); syncSound(); });
    $('opt-sound').addEventListener('change', () => { if ($('opt-sound').checked === Sound.isMuted()) Sound.toggleMute(); syncSound(); });
    $('opt-fx').checked = app.settings.fx;
    $('opt-fx').addEventListener('change', () => { app.settings.fx = $('opt-fx').checked; saveSettings(); applyFx(); });
    $('btn-new').addEventListener('click', () => {
      closeOverlay($('menu'));
      if ($('screen-game').hidden) showGame(); else { dealPersonas(); newGame(); }
    });
    $('btn-again').addEventListener('click', () => { dealPersonas(); newGame(); });
    $('btn-results-table').addEventListener('click', () => closeOverlay($('results')));
    document.querySelectorAll('.overlay').forEach((ov) => {
      ov.addEventListener('click', (e) => { if (e.target === ov || e.target.closest('[data-close]')) closeOverlay(ov); });
    });
    document.addEventListener('keydown', (e) => {
      if (e.target.closest && e.target.closest('input')) return;
      const open = [...document.querySelectorAll('.overlay')].find((o) => !o.hidden);
      if (e.key === 'Escape') {
        if (open) { closeOverlay(open); return; }
        if (app.sel || app.tollArm) { clearSel(); return; }
        if (!$('screen-game').hidden) openOverlay('menu');
        return;
      }
      if (open) return;
      if (e.key === '?') openOverlay('rules');
      else if (e.key === 'm' || e.key === 'M') { Sound.toggleMute(); syncSound(); }
      else if ((e.key === 'd' || e.key === 'D') && myTurn()) act({ type: 'draw' });
      else if ((e.key === 'e' || e.key === 'E') && myTurn()) act({ type: 'pass' });
    });
    syncSound();
    const unlock = () => { Sound.resume && Sound.resume(); document.removeEventListener('pointerdown', unlock); };
    document.addEventListener('pointerdown', unlock);
  }

  PYR.UI = { app, render };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
