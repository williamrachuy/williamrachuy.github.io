/*
 * PYRAMID: the table.
 *
 * Drives the DOM from engine states. Every card is one persistent element
 * keyed by its id; a render computes where each card belongs and sets a CSS
 * transform, so swaps, draws and plays animate on the compositor. Gems are
 * faceted diamonds: they form on a lane (or at a court's centre), hold so
 * you can see them, then fly to a purse. The AI plays through the same
 * engine calls, one visible action at a time.
 *
 * Stage coordinates: the table is 100 x 100 units, the tray below it runs to
 * y = 121. One unit is --u px (the stage width / 100). The three AI houses
 * sit beside the table, outside the stage.
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

  const CW = 9, CH = 12.6;          // card size in units
  const ROT = { S: 0, E: -90, N: 180, W: 90 };
  const CENTRE = 13.5;              // centre subjects: a cross around the apex
  const CORNER = 20;                // corner pairs meet head to head at (50 +- 20, 50 +- 20)
  const CORNER_GAP = 0.9;           // half the gap between the two heads
  const CORNER_OUT = 8.2;           // the corner gem node sits this far outside them, on the diagonal
  const ROYALS = 41;                // royal rows
  const RIDGE = 9;                  // ridge gem nodes, between neighbouring centre cards

  function rv(x, y, deg) {
    const t = deg * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
    return [x * c - y * s, x * s + y * c];
  }
  // A point given in South's frame (x right, y toward South), turned to `seat`.
  function seatPt(seat, x, y) { const p = rv(x, y, ROT[seat]); return [50 + p[0], 50 + p[1]]; }

  const SLOT = {};
  const NODE_AT = {};
  const COURT_AT = {};
  SEATS.forEach((seat) => {
    SLOT[seat] = { subjects: {}, royals: {} };
    [['L', -12.5], ['C', 0], ['R', 12.5]].forEach(([pos, dx]) => {
      const [x, y] = seatPt(seat, dx, ROYALS);
      SLOT[seat].royals[pos] = { x, y, rot: ROT[seat] };
    });
    // The centre subject: on the cross, square to its court.
    const [cx, cy] = seatPt(seat, 0, CENTRE);
    SLOT[seat].subjects.C = { x: cx, y: cy, rot: ROT[seat] };
    // The left and right subjects lean 45 degrees, head to head with the
    // neighbouring court's card across the diagonal (the pyramid's edge).
    [['R', 1, 45], ['L', -1, -45]].forEach(([pos, sx, lean]) => {
      const node = seatPt(seat, sx * CORNER, CORNER);
      const k = CH / 2 + CORNER_GAP;
      const off = rv(-sx * k / Math.SQRT2, k / Math.SQRT2, ROT[seat]);
      SLOT[seat].subjects[pos] = { x: node[0] + off[0], y: node[1] + off[1], rot: ROT[seat] + lean };
    });
  });
  // Each court's gem node sits on the line through its two base-corner gem
  // nodes: the midpoint of its face's base edge.
  const CO = CORNER + CORNER_OUT / Math.SQRT2;
  SEATS.forEach((seat) => { COURT_AT[seat] = seatPt(seat, 0, CO); });
  // Each corner is one court's R end and the next court's L end; its gem
  // node sits just outside the pair, on the diagonal.
  NODE_AT.cSE = seatPt('S', CO, CO);
  NODE_AT.cEN = seatPt('E', CO, CO);
  NODE_AT.cNW = seatPt('N', CO, CO);
  NODE_AT.cWS = seatPt('W', CO, CO);
  NODE_AT.rSE = seatPt('S', RIDGE, RIDGE);
  NODE_AT.rEN = seatPt('E', RIDGE, RIDGE);
  NODE_AT.rNW = seatPt('N', RIDGE, RIDGE);
  NODE_AT.rWS = seatPt('W', RIDGE, RIDGE);
  // The apex: one gem node at the centre. The two peaks are pivots only and
  // have no node: swap across one by clicking its two centre cards (these
  // points just anchor their tooltips).
  const APEX = [50, 50];
  NODE_AT.apex = APEX;
  NODE_AT.pSN = [50, 46];
  NODE_AT.pEW = [54, 50];

  const BADGE_AT = [2.5, 105.5], BADGE_W = 24;
  const DECK_AT = [90, 90];
  const TRAY_Y = 111.25;
  const SUIT_GLYPH = { spades: '♠', hearts: '♥', clubs: '♣', diamonds: '♦' };
  const SEAT_COLOR = { S: 'var(--S)', E: 'var(--E)', N: 'var(--N)', W: 'var(--W)' };
  const CROWN = { K: '♔︎', Q: '♕︎', J: '♘︎' };
  const LANE_NAME = {
    cSE: 'south-east corner', cEN: 'north-east corner', cNW: 'north-west corner', cWS: 'south-west corner',
    rSE: 'South–East ridge', rEN: 'East–North ridge', rNW: 'North–West ridge', rWS: 'West–South ridge',
    pSN: 'South–North peak', pEW: 'East–West peak', apex: 'apex'
  };
  const SEAT_WORD = { S: 'South', E: 'East', N: 'North', W: 'West' };
  const POS_WORD = { L: 'left', C: 'centre', R: 'right' };
  const LEVELS = ['easy', 'normal', 'hard', 'master'];
  const CLOCKS = [{ v: 20, label: '20 rounds' }, { v: 30, label: '30 rounds' }, { v: 0, label: 'None' }];
  const PACES = [{ v: 'calm', label: 'Calm' }, { v: 'normal', label: 'Normal' }, { v: 'fast', label: 'Fast' }];
  const PACE_T = { calm: 1.35, normal: 1, fast: 0.55 };

  // A cut gem in profile: a table, five crown facets, four pavilion facets.
  const GEM_SVG = '<svg viewBox="0 0 40 34" aria-hidden="true">' +
    '<g stroke="rgba(255,250,230,.75)" stroke-width=".7" stroke-linejoin="round">' +
    '<polygon points="2,12 12,2 11,12" fill="#f4cd6e"/>' +
    '<polygon points="12,2 20,12 11,12" fill="#fff3c9"/>' +
    '<polygon points="12,2 28,2 20,12" fill="#ffe59a"/>' +
    '<polygon points="28,2 29,12 20,12" fill="#e2aa40"/>' +
    '<polygon points="28,2 38,12 29,12" fill="#b9801f"/>' +
    '<polygon points="2,12 11,12 20,32" fill="#e8b24c"/>' +
    '<polygon points="11,12 20,12 20,32" fill="#fff0bd"/>' +
    '<polygon points="20,12 29,12 20,32" fill="#c98c2a"/>' +
    '<polygon points="29,12 38,12 20,32" fill="#875812"/>' +
    '</g></svg>';

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
    courtNodes: {},
    gems: {},
    houses: {},
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
  function ownSuitCount(s, seat) {
    return POS.filter((p) => s.courts[seat].subjects[p].s === E.SUIT_OF[seat]).length;
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

    // Gem nodes for the base corners and ridges (the peaks have none).
    E.LANES.forEach((l) => {
      if (l.kind === 'peak') return;
      const b = document.createElement('button');
      b.className = 'node';
      b.type = 'button';
      b.dataset.lane = l.id;
      b.innerHTML = '<span class="ring"></span>';
      b.setAttribute('aria-label', LANE_NAME[l.id]);
      b.addEventListener('click', (e) => { e.stopPropagation(); onLane(l.id); });
      b.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') showLaneTip(l.id); });
      b.addEventListener('pointerleave', () => hideTip());
      b.addEventListener('focus', () => showLaneTip(l.id));
      b.addEventListener('blur', () => hideTip());
      layer.appendChild(b);
      app.nodes[l.id] = b;
    });

    // The apex gem node: all four centre cards matching forms its gem.
    const ax = document.createElement('button');
    ax.className = 'node apex-node';
    ax.type = 'button';
    ax.innerHTML = '<span class="ring"></span>';
    ax.setAttribute('aria-label', 'The apex');
    ax.addEventListener('click', (e) => { e.stopPropagation(); showApexTip(); });
    ax.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') showApexTip(); });
    ax.addEventListener('pointerleave', () => hideTip());
    ax.addEventListener('blur', () => hideTip());
    layer.appendChild(ax);
    app.apexNode = ax;

    // Court gem nodes: a flush (three of the court's own suit) forms a gem here.
    SEATS.forEach((seat) => {
      const b = document.createElement('button');
      b.className = 'node court-node';
      b.type = 'button';
      b.style.setProperty('--c', SEAT_COLOR[seat]);
      b.innerHTML = '<span class="ring"></span>';
      b.setAttribute('aria-label', SEAT_WORD[seat] + '’s court');
      b.addEventListener('click', (e) => { e.stopPropagation(); showCourtTip(seat); });
      b.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') showCourtTip(seat); });
      b.addEventListener('pointerleave', () => hideTip());
      b.addEventListener('blur', () => hideTip());
      layer.appendChild(b);
      app.courtNodes[seat] = b;
    });

    // Your purse.
    const d = document.createElement('div');
    d.className = 'badge me';
    d.style.setProperty('--c', SEAT_COLOR.S);
    d.innerHTML = '<div class="badge-top"><span class="badge-name">' + SUIT_GLYPH.spades + ' You</span>' +
      '<span class="purse"><span class="purse-gem">' + GEM_SVG + '</span><b class="purse-n">0</b></span></div><div class="badge-sub"></div>';
    layer.appendChild(d);
    app.badge = d;

    // The deck: a little stack of backs, and its count.
    for (let i = 0; i < 3; i++) {
      const b = document.createElement('div');
      b.className = 'card down deck-back no-anim';
      b.innerHTML = '<div class="card-body"><div class="back"></div></div>';
      b.dataset.off = i;
      layer.appendChild(b);
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

    // The three houses, beside the table.
    const list = $('houses-list');
    ['E', 'N', 'W'].forEach((seat) => {
      const h = document.createElement('div');
      h.className = 'house';
      h.style.setProperty('--c', SEAT_COLOR[seat]);
      h.innerHTML = '<div class="house-id"><span class="house-name"></span><span class="house-title"></span></div>' +
        '<div class="house-hand"></div>' +
        '<span class="purse"><span class="purse-gem">' + GEM_SVG + '</span><b class="purse-n">0</b></span>';
      list.appendChild(h);
      app.houses[seat] = h;
    });

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
      hideTip();
    });
  }

  function px(x, y) { return [x * app.u, y * app.u]; }
  function placeAt(el, at) { const [x, y] = px(at[0], at[1]); el.style.transform = 'translate(' + x + 'px,' + y + 'px)'; }

  function layout() {
    const stage = $('stage');
    if (!stage || !stage.clientWidth) return;
    const u = stage.clientWidth / 100;
    app.u = u;
    stage.style.setProperty('--u', u + 'px');
    Object.keys(app.nodes).forEach((id) => placeAt(app.nodes[id], NODE_AT[id]));
    placeAt(app.apexNode, APEX);
    SEATS.forEach((seat) => placeAt(app.courtNodes[seat], COURT_AT[seat]));
    placeAt(app.badge, BADGE_AT);
    app.badge.style.width = (BADGE_W * u) + 'px';
    document.querySelectorAll('.deck-back').forEach((d) => {
      const o = +d.dataset.off;
      d.style.transform = 'translate(' + ((DECK_AT[0] - CW / 2 - o * 0.35) * u) + 'px,' + ((DECK_AT[1] - CH / 2 - o * 0.35) * u) + 'px)';
    });
    let [x, y] = px(DECK_AT[0], DECK_AT[1] - 9.8);
    $('deck-count').style.transform = 'translate(' + x + 'px,' + y + 'px) translateX(-50%)';
    [x, y] = px(50, TRAY_Y - 1.2);
    $('hand-label').style.transform = 'translate(' + x + 'px,' + y + 'px) translateX(-50%)';
    [x, y] = px(76, 103.4);
    app.trayBtns.style.transform = 'translate(' + x + 'px,' + y + 'px)';
    Object.keys(app.gems).forEach((id) => placeAt(app.gems[id], NODE_AT[id]));
    if (app.state) {
      app.cards.forEach((el) => el.classList.add('no-anim'));
      renderCards(app.state, true);
      requestAnimationFrame(() => app.cards.forEach((el) => el.classList.remove('no-anim')));
    }
  }

  // ---------------------------------------------------------------------
  // Cards
  // ---------------------------------------------------------------------

  // Where an AI's hand is, in stage units: beside the table, in its house row.
  function offstage(seat) {
    const hand = app.houses[seat] && app.houses[seat].querySelector('.house-hand');
    const st = $('stage').getBoundingClientRect();
    if (!hand) return [110, 50];
    const r = hand.getBoundingClientRect();
    return [(r.left + r.width / 2 - st.left) / app.u, (r.top + r.height / 2 - st.top) / app.u];
  }

  function placements(s) {
    const m = new Map();
    SEATS.forEach((seat) => {
      POS.forEach((pos) => {
        const a = SLOT[seat].subjects[pos], r = SLOT[seat].royals[pos];
        m.set(s.courts[seat].subjects[pos].id, { zone: 'subject', seat, pos, x: a.x, y: a.y, rot: a.rot, card: s.courts[seat].subjects[pos] });
        m.set(s.courts[seat].royals[pos].id, { zone: 'royal', seat, pos, x: r.x, y: r.y, rot: r.rot, card: s.courts[seat].royals[pos], royal: true });
      });
      const hand = s.players[seat].hand;
      const off = s.players[seat].human ? null : offstage(seat);
      hand.forEach((c, i) => {
        if (s.players[seat].human) {
          m.set(c.id, { zone: 'hand', seat, index: i, x: 39 + 11 * i, y: TRAY_Y, rot: 0, card: c });
        } else {
          m.set(c.id, { zone: 'hand', seat, index: i, x: off[0], y: off[1], rot: 0, scale: 0.35, down: true, off: true, card: c });
        }
      });
    });
    return m;
  }

  function makeCard(c, royal) {
    const el = document.createElement('div');
    el.className = 'card' + (royal ? ' royal' : '');
    el.dataset.suit = c.s;
    const under = c.r === '6' || c.r === '9' ? ' under' : '';
    el.innerHTML = '<div class="card-body"><div class="face"><div class="face-in">' +
      (royal ? '<span class="crown">' + CROWN[c.r] + '</span>' : '') +
      '<span class="rank' + under + '">' + rankLabel(c.r) + '</span><span class="pip">' + SUIT_GLYPH[c.s] + '</span></div></div><div class="back"></div></div>';
    el.addEventListener('click', (e) => { e.stopPropagation(); onCard(c.id); });
    el.setAttribute('aria-label', E.rankName(c.r) + ' of ' + c.s);
    $('layer').appendChild(el);
    return el;
  }

  function transformFor(el, p) {
    const u = app.u, w = CW * u, h = CH * u;
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
      el.classList.toggle('down', !!p.down);
      el.classList.toggle('off', !!p.off);
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
      el.classList.add('is-moving', 'down');
      el.classList.remove('off');
      el.style.transform = transformFor(el, { x: DECK_AT[0], y: DECK_AT[1], rot: 0 });
      setTimeout(() => el.remove(), 900);
    });
    moved.forEach((el) => {
      el.classList.add('is-moving', 'glint');
      clearTimeout(el._mt);
      el._mt = setTimeout(() => el.classList.remove('is-moving', 'glint'), 950);
    });
    updateCardStates();
    return moved.length;
  }

  function myTurn() {
    const s = app.state;
    return s && s.phase === 'play' && s.players[s.current].human && !app.busy;
  }

  // The lane joining two subjects, if there is one.
  function laneBetween(a, b) {
    return E.LANES.find((l) =>
      (l.a.seat === a.seat && l.a.pos === a.pos && l.b.seat === b.seat && l.b.pos === b.pos) ||
      (l.b.seat === a.seat && l.b.pos === a.pos && l.a.seat === b.seat && l.a.pos === b.pos)) || null;
  }

  function updateCardStates() {
    const mine = myTurn();
    const sel = app.sel && app.place.get(app.sel.id);
    app.place.forEach((p, id) => {
      const el = app.cards.get(id);
      if (!el) return;
      const own = p.seat === 'S';
      // Any subject can start a swap across a lane; royals and the hand are yours only.
      el.classList.toggle('is-clickable', mine && (own || p.zone === 'subject'));
      el.classList.toggle('is-selected', !!sel && app.sel.id === id);
      let target = false;
      if (mine && sel && app.sel.id !== id) {
        if (own && sel.seat === 'S') {
          if (sel.zone === 'subject' && p.zone === 'subject') target = true;
          if (sel.zone === 'royal' && p.zone === 'royal') target = true;
          if (sel.zone === 'hand' && p.zone === 'subject') target = true;
          if (sel.zone === 'subject' && p.zone === 'hand') target = true;
        }
        if (sel.zone === 'subject' && p.zone === 'subject') {
          const l = laneBetween(sel, p);
          if (l && E.laneAccess(app.state, l.id, 'S').ok) target = true;
        }
      }
      el.classList.toggle('is-target', target);
    });
  }

  // ---------------------------------------------------------------------
  // Lanes, gems, purses
  // ---------------------------------------------------------------------

  function makeRestingGem(at) {
    const g = document.createElement('div');
    g.className = 'gem rest';
    g.innerHTML = GEM_SVG;
    placeAt(g, at);
    $('layer').appendChild(g);
    return g;
  }

  function gemAt(s, id) { return id === 'apex' ? s.apex.gem : s.lanes[id].gem; }

  // Gems resting on stalemated lanes (and on the apex, until someone rules it).
  function renderGems(s) {
    E.LANES.map((l) => l.id).concat('apex').forEach((id) => {
      const has = gemAt(s, id);
      if (has && !app.gems[id]) app.gems[id] = makeRestingGem(NODE_AT[id]);
      if (!has && app.gems[id]) { app.gems[id].remove(); delete app.gems[id]; }
    });
  }

  function renderNodes(s) {
    const mine = myTurn();
    E.LANES.forEach((l) => {
      const n = app.nodes[l.id];
      if (!n) return;
      const st = s.lanes[l.id];
      n.classList.toggle('paired', st.paired);
      const open = mine && E.laneAccess(s, l.id, 'S').ok;
      n.classList.toggle('is-open', open);
      n.classList.toggle('is-dim', mine && !open);
      n.classList.toggle('is-armed', app.tollArm === l.id);
    });
    const axOn = E.apexMatched(s);
    app.apexNode.classList.toggle('paired', axOn);
    SEATS.forEach((seat) => {
      const n = app.courtNodes[seat];
      n.classList.toggle('flush', E.isFlush(s, seat));
      n.dataset.count = ownSuitCount(s, seat);
    });
  }

  function purseOf(seat) {
    return seat === 'S' ? app.badge.querySelector('.purse') : app.houses[seat].querySelector('.purse');
  }
  function setShown(seat, v, bump) {
    app.shown[seat] = v;
    const p = purseOf(seat);
    p.querySelector('.purse-n').textContent = v;
    if (bump) { p.classList.remove('bump'); void p.offsetWidth; p.classList.add('bump'); }
  }

  function renderPurses(s, bump) {
    SEATS.forEach((seat) => {
      const v = s.players[seat].gems;
      if (app.shown[seat] !== v) setShown(seat, v, bump);
    });
  }

  function renderHouses(s) {
    ['E', 'N', 'W'].forEach((seat) => {
      const h = app.houses[seat], P = s.players[seat];
      h.querySelector('.house-name').textContent = SUIT_GLYPH[P.suit] + ' ' + P.name;
      h.querySelector('.house-title').textContent = app.personas[seat] ? app.personas[seat].title : '';
      h.classList.toggle('is-turn', s.phase === 'play' && s.current === seat);
      const hand = h.querySelector('.house-hand');
      if (hand.childElementCount !== P.hand.length) {
        hand.innerHTML = P.hand.map(() => '<i></i>').join('');
      }
    });
    app.badge.classList.toggle('is-turn', s.phase === 'play' && s.current === 'S');
    renderBadgeFree(s);
  }

  // Your free-action marker.
  function renderBadgeFree(s) {
    const free = s.current === 'S' && s.phase === 'play' ? (s.free > 0 ? '<span class="free">✦ free action</span>' : '<span class="free spent">free action used</span>') : 'waiting';
    app.badge.querySelector('.badge-sub').innerHTML = free;
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
    if (s.phase === 'deal') t = 'The deal';
    else if (s.phase !== 'play') t = 'Game over';
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
    if (s.phase === 'deal') {
      h = 'The cards are dealt. Before the first turn, gems form on any pairs already on the table.';
    } else if (s.phase !== 'play') {
      h = 'The game is over. Open the menu to deal again.';
    } else if (!s.players[s.current].human) {
      h = whoB(s.current) + ' is playing.';
    } else if (app.busy) {
      h = 'Your move plays out\u2026';
    } else if (app.tollArm) {
      const acc = E.laneAccess(s, app.tollArm, 'S');
      h = 'Click again to pay ' + whoB(acc.controller) + ' one gem and swap across the ' + LANE_NAME[app.tollArm] + '.';
    } else if (app.sel) {
      const p = app.place.get(app.sel.id);
      if (p.zone === 'subject' && p.seat !== 'S') h = 'Now click the card across a lane from ' + cardHTML(p.card) + ' to swap them (lit cards are ones you can reach).';
      else if (p.zone === 'subject') h = 'Swap ' + cardHTML(p.card) + ' with another of your subjects, with the card across a lane from it, or play a card from your hand onto it.';
      else if (p.zone === 'royal') h = 'Swap ' + cardHTML(p.card) + ' with another of your royals. Royals decide who controls your lanes.';
      else h = 'Play ' + cardHTML(p.card) + ' onto one of your subjects. The card it replaces goes to the bottom of the deck.';
    } else {
      const cost = s.free > 0 ? 'Your <b>free action</b> is ready.' : 'Each action now costs <b>1 gem</b> (you have ' + s.players.S.gems + ').';
      h = cost + ' Swap two of your subjects or royals, or click a card and then its partner across a lane (or a lit gem node). Close the pyramid for <b>+' + (s.rules.capstone || 0) + '</b>.';
    }
    $('hint').innerHTML = h;
  }

  function render(s, opts) {
    opts = opts || {};
    renderCards(s, opts.instant);
    renderNodes(s);
    renderGems(s);
    renderHouses(s);
    if (!opts.keepPurses) renderPurses(s, opts.bumps);
    renderTray(s);
    renderTop(s);
    renderViz(s);
    renderHint(s);
  }

  // ---------------------------------------------------------------------
  // Tooltips
  // ---------------------------------------------------------------------

  function placeTip(at, html) {
    const tip = $('tip');
    tip.innerHTML = html;
    tip.hidden = false;
    const W = $('stage').clientWidth, tw = tip.offsetWidth, th = tip.offsetHeight;
    let x = at[0] * app.u - tw / 2, y = at[1] * app.u - th - 4.5 * app.u;
    if (y < 0) y = at[1] * app.u + 4.5 * app.u;
    x = Math.max(4, Math.min(W - tw - 4, x));
    tip.style.transform = 'translate(' + x + 'px,' + y + 'px)';
  }

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
    placeTip(NODE_AT[id], html);
    [l.a, l.b].forEach((end) => {
      const sc = s.courts[end.seat];
      [sc.subjects[end.pos].id, sc.royals[end.pos].id].forEach((cid) => { const el = app.cards.get(cid); if (el) el.classList.add('is-lit'); });
    });
    if (app.nodes[id]) app.nodes[id].classList.add('is-hot');
  }

  function showApexTip() {
    const s = app.state;
    if (!s) return;
    const on = E.apexMatched(s), ctrl = E.apexController(s);
    let html = '<div class="tip-head">The apex</div>' +
      'Centres: ' + SEATS.map((seat) => cardHTML(s.courts[seat].subjects.C)).join(' ') + ' · ' +
      (on ? '<b>all four match (' + E.vertexValue(s, 'S', 'C') + ')</b>' : 'not all matching') + '<br>' +
      'When all four centre cards match, a gem forms here. It goes to whoever’s centre royal beats all three others: ' +
      (ctrl ? whoB(ctrl) + ' (' + cardHTML(s.courts[ctrl].royals.C) + ').' : '<b>nobody</b> right now.');
    if (s.apex.gem) html += '<br>A gem waits here.';
    html += '<br>To swap opposite centres, click one centre card, then the one across from it.';
    placeTip(APEX, html);
    SEATS.forEach((seat) => { const el = app.cards.get(s.courts[seat].subjects.C.id); if (el) el.classList.add('is-lit'); });
  }

  function showCourtTip(seat) {
    const s = app.state;
    if (!s) return;
    const n = ownSuitCount(s, seat), suit = E.SUIT_OF[seat];
    const html = '<div class="tip-head">' + SEAT_WORD[seat] + '’s court</div>' +
      n + ' of 3 subjects are ' + SUIT_GLYPH[suit] + ' ' + suit + '. ' +
      (n === 3 ? '<b>A flush.</b> It earned a gem when it formed.' : 'Three of a kind of suit (a flush) forms a gem here for ' + whoB(seat) + '.');
    placeTip(COURT_AT[seat], html);
    POS.forEach((p) => { const el = app.cards.get(s.courts[seat].subjects[p].id); if (el) el.classList.add('is-lit'); });
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
    if (p.seat !== 'S' && p.zone !== 'subject') { toast('That card belongs to ' + who(p.seat) + '.'); return; }
    const sel = app.sel && app.place.get(app.sel.id);
    if (sel && app.sel.id === id) { clearSel(); return; }
    if (sel) {
      if (sel.seat === 'S' && p.seat === 'S') {
        if (sel.zone === 'subject' && p.zone === 'subject') return act({ type: 'court', a: sel.pos, b: p.pos });
        if (sel.zone === 'royal' && p.zone === 'royal') return act({ type: 'royal', a: sel.pos, b: p.pos });
        if (sel.zone === 'hand' && p.zone === 'subject') return act({ type: 'play', hand: sel.index, pos: p.pos });
        if (sel.zone === 'subject' && p.zone === 'hand') return act({ type: 'play', hand: p.index, pos: sel.pos });
      }
      // Two subjects across a lane (a corner, a ridge or a peak): swap them.
      if (sel.zone === 'subject' && p.zone === 'subject') {
        const l = laneBetween(sel, p);
        if (l) return onLane(l.id, true);
      }
    }
    app.tollArm = null;
    app.sel = { id, zone: p.zone };
    Sound.play('click');
    updateCardStates();
    renderNodes(app.state);
    renderHint(app.state);
  }

  // A swap across a lane, from its gem node or from its two cards (keepSel:
  // the toll confirmation is a second click on the same card).
  function onLane(id, keepSel) {
    Sound.resume && Sound.resume();
    if (!app.state) return;
    if (!myTurn()) { if (app.state.phase === 'play' && !app.busy) toast(who(app.state.current) + ' is playing.'); return; }
    const acc = E.laneAccess(app.state, id, 'S');
    if (!acc.ok) { if (!keepSel) showLaneTip(id); toast(acc.reason); Sound.play('error'); return; }
    if (acc.toll && app.tollArm !== id) {
      app.tollArm = id;
      if (!keepSel) app.sel = null;
      updateCardStates();
      renderNodes(app.state);
      renderHint(app.state);
      toast((keepSel ? 'Click that card again' : 'Click again') + ' to pay ' + who(acc.toll) + ' one gem for this swap.', true);
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

  // Client coordinates (for the gem flights, which cross from the table to
  // the purses beside it).
  function clientOfStage(at) {
    const r = $('stage').getBoundingClientRect();
    return [r.left + at[0] * app.u, r.top + at[1] * app.u];
  }
  function clientOfPurse(seat) {
    const r = purseOf(seat).querySelector('.purse-gem').getBoundingClientRect();
    return [r.left + r.width / 2, r.top + r.height / 2];
  }

  function gemSize() { return Math.max(18, app.u * 4.6); }

  // One gem's journey: it forms where it is made (a burst of light, then it
  // holds so you can see it), then arcs to its purse.
  function gemFlight(opts) {
    const t = T();
    const size = gemSize();
    return new Promise((resolve) => {
      setTimeout(() => {
        const from = opts.fromClient || clientOfStage(opts.from);
        const fx = $('fx');
        const g = document.createElement('div');
        g.className = 'gem fly';
        g.innerHTML = GEM_SVG;
        g.style.width = size + 'px';
        g.style.height = size + 'px';
        fx.appendChild(g);
        const at = (p, sc, r) => 'translate(' + (p[0] - size / 2) + 'px,' + (p[1] - size / 2) + 'px) scale(' + sc + ') rotate(' + (r || 0) + 'deg)';
        let formed = Promise.resolve();
        if (opts.form) {
          const burst = document.createElement('div');
          burst.className = 'gem-burst';
          burst.style.transform = 'translate(' + (from[0] - size) + 'px,' + (from[1] - size) + 'px)';
          burst.style.width = burst.style.height = (size * 2) + 'px';
          fx.appendChild(burst);
          burst.animate([{ opacity: 0.9, transform: burst.style.transform + ' scale(.2)' }, { opacity: 0, transform: burst.style.transform + ' scale(1.4)' }], { duration: 750 * t, easing: 'ease-out' }).finished.then(() => burst.remove());
          if (opts.sound !== false) Sound.play('gemArm');
          formed = g.animate([
            { transform: at(from, 0, -40), opacity: 0, filter: 'brightness(3)' },
            { transform: at(from, 1.35, 8), opacity: 1, filter: 'brightness(1.8)', offset: 0.6 },
            { transform: at(from, 1, 0), opacity: 1, filter: 'brightness(1)' }
          ], { duration: 680 * t, easing: 'ease-out', fill: 'forwards' }).finished;
        } else {
          g.style.transform = at(from, 1, 0);
        }
        formed
          .then(() => wait((opts.hold == null ? 520 : opts.hold) * t))
          .then(() => {
            if (opts.onDepart) opts.onDepart();
            const to = opts.toClient || clientOfPurse(opts.to);
            const dist = Math.hypot(to[0] - from[0], to[1] - from[1]);
            const mid = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2 - Math.min(140, dist * 0.28)];
            return g.animate([
              { transform: at(from, 1, 0), opacity: 1 },
              { transform: at(mid, 1.15, 180), opacity: 1, offset: 0.5 },
              { transform: at(to, opts.fade ? 0.4 : 0.6, 360), opacity: opts.fade ? 0 : 1 }
            ], { duration: Math.max(650, Math.min(1250, 520 + dist * 0.9)) * t, easing: 'cubic-bezier(.45,.05,.3,1)', fill: 'forwards' }).finished;
          })
          .then(() => {
            g.remove();
            if (opts.onArrive) opts.onArrive();
            resolve();
          });
      }, opts.delay || 0);
    });
  }

  // A gem spent to the bank: it lifts off the purse and dissolves.
  function gemSpend(seat) {
    const from = clientOfPurse(seat);
    setShown(seat, app.shown[seat] - 1, false);
    return gemFlight({ fromClient: from, toClient: [from[0], from[1] - 40], hold: 0, fade: true });
  }

  // Animate the gem events in `events` (formed, collected, flushed, paid),
  // one after another from `at`, `gap` apart. Returns the jobs' promises.
  function gemJobs(events, after, at, gap) {
    const t = T();
    const jobs = [];
    const spawned = new Set(events.filter((e) => e.type === 'spawn').map((e) => e.lane));
    const step = () => { const d = at; at += gap; return d; };
    events.forEach((e) => {
      if (e.type === 'pay' && !e.free && !e.to) jobs.push(gemSpend(e.seat));
      if (e.type === 'toll') {
        Sound.play('buy');
        setShown(e.seat, app.shown[e.seat] - 1, false);
        jobs.push(gemFlight({ fromClient: clientOfPurse(e.seat), to: e.to, hold: 120, onArrive: () => setShown(e.to, app.shown[e.to] + 1, true) }));
      }
      if (e.type === 'collect') {
        const fresh = spawned.has(e.lane);
        const delay = step();
        if (!fresh && app.gems[e.lane]) {
          const restEl = app.gems[e.lane];
          delete app.gems[e.lane];
          setTimeout(() => restEl.remove(), delay);
        }
        jobs.push(gemFlight({
          from: NODE_AT[e.lane], to: e.seat, delay, form: fresh, hold: fresh ? 560 : 260,
          onArrive: () => { setShown(e.seat, app.shown[e.seat] + 1, true); Sound.play('claim'); }
        }));
      }
      if (e.type === 'flush') {
        const node = app.courtNodes[e.seat];
        const delay = step();
        setTimeout(() => node.classList.add('is-forming'), delay);
        jobs.push(gemFlight({
          from: COURT_AT[e.seat], to: e.seat, delay, form: true, hold: 760,
          onDepart: () => node.classList.remove('is-forming'),
          onArrive: () => { setShown(e.seat, app.shown[e.seat] + 1, true); Sound.play('claim'); }
        }));
      }
      if (e.type === 'spawn' && gemAt(after, e.lane)) {
        // A gem on a stalemated node forms and stays.
        const delay = step();
        jobs.push(new Promise((res) => setTimeout(() => {
          const g = makeRestingGem(NODE_AT[e.lane]);
          g.classList.add('forming');
          app.gems[e.lane] = g;
          Sound.play('gemArm');
          setTimeout(res, 700 * t);
        }, delay)));
      }
      if (e.type === 'capstone') {
        for (let i = 0; i < e.gems; i++) {
          jobs.push(gemFlight({
            from: APEX, to: e.seat, delay: at + 260 * t + i * 220 * t, form: true, hold: 420, sound: i === 0,
            onArrive: () => { setShown(e.seat, app.shown[e.seat] + 1, true); Sound.play('claim'); }
          }));
        }
      }
    });
    return jobs;
  }

  // The generation phase between turns: every paired node, the apex and
  // every flush court forms its gem together; then they fly to whoever
  // controls them (stalemated ones stay).
  async function runPhase(after, events) {
    const t = T();
    logPhase(events);
    if (!events.some((e) => e.type === 'spawn' || e.type === 'flush')) return;
    $('table').classList.add('phase');
    $('hint').innerHTML = 'Between turns, <b>gems form</b> on every paired node and every flush court, and go to whoever controls them.';
    await wait(260 * t);
    await Promise.all(gemJobs(events, after, 0, 150 * t));
    $('table').classList.remove('phase');
  }

  function logPhase(events) {
    const got = {}, waits = [];
    events.forEach((e) => {
      if (e.type === 'collect' || e.type === 'flush') got[e.seat] = (got[e.seat] || 0) + 1;
    });
    const spawned = events.filter((e) => e.type === 'spawn').map((e) => e.lane);
    const collected = new Set(events.filter((e) => e.type === 'collect').map((e) => e.lane));
    spawned.forEach((l) => { if (!collected.has(l)) waits.push(l); });
    const parts = SEATS.filter((x) => got[x]).map((x) => whoB(x) + ' +' + got[x]);
    if (!parts.length && !waits.length) return;
    let line = 'Gems form: ' + (parts.length ? parts.join(' · ') : 'none collected');
    if (waits.length) line += '. ' + waits.length + ' wait' + (waits.length > 1 ? '' : 's') + ' on ' + (waits.length > 1 ? 'stalemated nodes' : (waits[0] === 'apex' ? 'the apex' : 'the ' + LANE_NAME[waits[0]])) + '.';
    log(line, null);
  }

  async function animate(before, after, events) {
    const t = T();
    // A turn's own events, then (after a pass) the generation phase.
    const g = events.findIndex((e) => e.type === 'generate');
    const turnEvents = g < 0 ? events : events.slice(0, g);
    const phaseEvents = g < 0 ? [] : events.slice(g);

    turnEvents.forEach((e) => logEvent(e, before, after));
    const moved = renderCards(after);
    renderNodes(after);
    renderHouses(after);
    renderTray(after);
    renderTop(after);
    renderViz(after);
    if (!phaseEvents.length) renderHint(after);

    if (turnEvents.some((e) => e.type === 'swap' || e.type === 'play')) Sound.play('pivot');
    if (turnEvents.some((e) => e.type === 'draw')) Sound.play('draw');

    const jobs = gemJobs(turnEvents, after, moved ? 640 * t : 160 * t, 380 * t);
    const minWait = moved ? 700 * t : 220 * t;
    await Promise.all([Promise.all(jobs), wait(minWait)]);

    const turn = turnEvents.find((e) => e.type === 'turn');
    if (turn) {
      sweep();
      if (after.players[turn.seat].human) Sound.play('turn');
    }
    if (phaseEvents.length) {
      await runPhase(after, phaseEvents);
      renderHint(after);
    }
    renderGems(after);
    renderPurses(after, true);

    const end = events.find((e) => e.type === 'end');
    if (end) {
      render(after);
      await wait(700 * t);
      showResults(after);
    }
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
      if (app.nodes[action.lane]) app.nodes[action.lane].classList.toggle('is-hot', on);
    } else if (action.type === 'play') {
      ids.push(s.courts[seat].subjects[action.pos].id);
    }
    ids.forEach((id) => { const el = app.cards.get(id); if (el) el.classList.toggle('is-ai-pick', on); });
  }

  async function runAI() {
    const token = app.token;
    app.busy = true;
    render(app.state);
    while (app.state.phase === 'play' && !app.state.players[app.state.current].human) {
      const seat = app.state.current;
      app.houses[seat].classList.add('thinking');
      await wait(520 * T());
      if (token !== app.token) return;
      let acted = 0;
      while (app.state.phase === 'play' && app.state.current === seat) {
        const a = AI.choose(app.state, { persona: app.personas[seat], level: app.settings.level, rng: app.rng, actionsThisTurn: acted });
        if (a.type !== 'pass') {
          highlight(a, seat, true);
          await wait(520 * T());
          if (token !== app.token) return;
          highlight(a, seat, false);
        } else {
          app.houses[seat].classList.remove('thinking');
        }
        await perform(a);
        if (token !== app.token) return;
        acted++;
        if (a.type !== 'pass') await wait(260 * T());
      }
      app.houses[seat].classList.remove('thinking');
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
        const c1 = findCard(before, e.cards[0]), c2 = findCard(before, e.cards[1]);
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
        if (e.lane === 'apex') log('All four centres match: a gem forms at the apex.' + (gemAt(s, 'apex') ? ' No centre royal rules it yet, so it waits.' : ''), null);
        else if (gemAt(s, e.lane)) log('The ' + LANE_NAME[e.lane] + ' pairs. Stalemate: its gem waits.', null);
        break;
      case 'collect': {
        const fresh = gemAt(before, e.lane) === false;
        if (e.lane === 'apex') { log(W(e.seat) + ' ' + verb(e.seat, 'take', 'takes') + ' the apex gem.', e.seat); break; }
        log(fresh ? 'The ' + LANE_NAME[e.lane] + ' pairs: ' + W(e.seat) + ' ' + verb(e.seat, 'collect', 'collects') + ' a gem.'
          : W(e.seat) + ' ' + verb(e.seat, 'take', 'takes') + ' the gem waiting on the ' + LANE_NAME[e.lane] + '.', e.seat);
        break;
      }
      case 'flush':
        log(W(e.seat) + (s.players[e.seat].human ? ' hold' : ' holds') + ' a flush: +1 gem.', e.seat);
        break;
      case 'capstone':
        log(W(e.seat) + ' ' + verb(e.seat, 'close', 'closes') + ' the pyramid and ' + verb(e.seat, 'take', 'takes') + ' the capstone: <b>+' + e.gems + ' gems</b>.', e.seat);
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
    if (s.endReason === 'pyramid') sub += ' The capstone went to ' + who(s.current) + '.';
    else sub += ' ' + E.pairedCount(s) + ' of 10 lanes were paired.';
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
    app.shown = {};
    $('fx').innerHTML = '';
    $('log').innerHTML = '';
    $('results').hidden = true;
    layout();
    render(app.state, { instant: true });
    // Deal: the cards fly out from the deck.
    const ids = [...app.place.keys()];
    app.cards.forEach((el, id) => {
      const p = app.place.get(id);
      el.classList.add('no-anim', 'down');
      el.style.transform = transformFor(el, { x: DECK_AT[0], y: DECK_AT[1], rot: 0 });
      el.getBoundingClientRect();
      el.classList.remove('no-anim');
      setTimeout(() => {
        el._tf = transformFor(el, p);
        el.style.transform = el._tf;
        el.classList.toggle('down', !!p.down);
      }, 40 + ids.indexOf(id) * 45);
    });
    log('<b>The table is dealt.</b> You play South (♠).', 'S');
    // Before the first turn: the opening generation phase.
    app.busy = true;
    const token = app.token;
    setTimeout(async () => {
      if (token !== app.token) return;
      sweep();
      const r = E.start(app.state);
      const before = app.state;
      app.state = r.state;
      await animate(before, r.state, r.events);
      if (token !== app.token) return;
      app.busy = false;
      log('Your turn. Your free action is ready.', 'S');
      render(app.state);
    }, 40 + app.place.size * 45 + 900);
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
