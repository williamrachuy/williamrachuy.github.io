/* ==========================================================================
   PYRAMID — ui.js
   Screens, board rendering, HUD, interaction. Depends on window.PYR.Engine,
   window.PYR.AI, window.PYR.Viz3D, window.PYR.Audio (contracts in spec §4).
   No game rules live here — every legality check is delegated to Engine.
   ========================================================================== */
(function () {
  'use strict';

  var PYR = window.PYR = window.PYR || {};

  /* ------------------------------------------------------------ constants */
  var SUITS = ['spades', 'hearts', 'clubs', 'diamonds'];
  var SUIT_GLYPH = { spades: '♠', hearts: '♥', clubs: '♣', diamonds: '♦' };
  var SUIT_COLOR = { spades: '#cfd6dd', hearts: '#c0453d', clubs: '#4f8a5c', diamonds: '#4f7fb0' };
  var SUIT_LABEL = { spades: 'Spades', hearts: 'Hearts', clubs: 'Clubs', diamonds: 'Diamonds' };
  var PEAK_KEYS = ['spades-clubs', 'hearts-diamonds'];
  var AI_LOOP_HARD_CAP = 400; // policy 13: no unbounded loops

  /* The literal diamond layout, transcribed from the Python prototype's
     printTable(). Row order top -> bottom; each row lists its slots
     left -> right exactly as the ASCII art does. */
  var BOARD_ROWS = [
    [
      c('royals', 'clubs', 'right'), c('royals', 'clubs', 'center'), c('royals', 'clubs', 'left')
    ],
    [
      g('base', 'clubs-diamonds'), c('subjects', 'clubs', 'right'), g('court', 'clubs'),
      c('subjects', 'clubs', 'left'), g('base', 'hearts-clubs')
    ],
    [
      c('royals', 'diamonds', 'left'), c('subjects', 'diamonds', 'left'), g('cap', 'clubs-diamonds'),
      c('subjects', 'clubs', 'center'), g('cap', 'hearts-clubs'), c('subjects', 'hearts', 'right'),
      c('royals', 'hearts', 'right')
    ],
    [
      c('royals', 'diamonds', 'center'), g('court', 'diamonds'), c('subjects', 'diamonds', 'center'),
      g('peak', 'spades-clubs'), c('subjects', 'hearts', 'center'), g('court', 'hearts'),
      c('royals', 'hearts', 'center')
    ],
    [
      c('royals', 'diamonds', 'right'), c('subjects', 'diamonds', 'right'), g('cap', 'diamonds-spades'),
      c('subjects', 'spades', 'center'), g('cap', 'spades-hearts'), c('subjects', 'hearts', 'left'),
      c('royals', 'hearts', 'left')
    ],
    [
      g('base', 'diamonds-spades'), c('subjects', 'spades', 'left'), g('court', 'spades'),
      c('subjects', 'spades', 'right'), g('base', 'spades-hearts')
    ],
    [
      c('royals', 'spades', 'left'), c('royals', 'spades', 'center'), c('royals', 'spades', 'right')
    ]
  ];

  function c(which, suit, pos) { return { kind: 'card', which: which, suit: suit, pos: pos }; }
  function g(loc, key) { return { kind: 'gem', loc: loc, key: key }; }

  function cardNodeId(which, suit, pos) { return 'card:' + which + ':' + suit + ':' + pos; }
  function handNodeId(i) { return 'hand:' + i; }
  function gemNodeId(loc, key) { return 'gem:' + loc + ':' + key; }

  /* ------------------------------------------------------------ tiny RNG */
  // Self-contained mulberry32, used only to drive AI.chooseAction() calls
  // and setup-screen seeds. Engine keeps its own internal RNG for dealing.
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function randSeed() { return (Math.random() * 4294967296) >>> 0; }

  /* ------------------------------------------------------------ app state */
  var app = {
    screen: 'title',
    difficulty: 'normal',
    pendingState: null,   // preview state shown on Setup, becomes live state on Begin
    state: null,          // live game state
    selection: null,      // { nodeId, partners: Set<string> }
    viz: null,
    vizRaf: null,
    aiRunning: false,
    aiLoopGuard: 0,
    seenLogCount: 0
  };

  /* ------------------------------------------------------------ dom refs */
  var $ = function (id) { return document.getElementById(id); };
  var dom = {}; // populated on init

  function qAll(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  /* ------------------------------------------------------------ init */
  document.addEventListener('DOMContentLoaded', init);

  function init() {
    cacheDom();
    bindGlobalUI();
    bindBoardDelegation();
    bindKeyboard();
    syncSoundUI();
    generatePreview();
    showScreen('title');
    if (PYR.Audio && PYR.Audio.startMusic) { try { PYR.Audio.startMusic('menu'); } catch (e) {} }
    var unlock = function () {
      if (PYR.Audio && PYR.Audio.resume) { try { PYR.Audio.resume(); } catch (e) {} }
      document.removeEventListener('pointerdown', unlock);
      document.removeEventListener('keydown', unlock);
    };
    document.addEventListener('pointerdown', unlock);
    document.addEventListener('keydown', unlock);
  }

  function cacheDom() {
    dom.screens = {
      title: $('screen-title'), setup: $('screen-setup'),
      game: $('screen-game'), results: $('screen-results')
    };
    dom.diffGrid = $('diff-grid');
    dom.aiPreview = $('ai-preview');
    dom.boardRows = qAll('.board-row', $('board'));
    dom.housesCol = $('houses-col');
    dom.handCards = $('hand-cards');
    dom.logFeed = $('log-feed');
    dom.turnBanner = $('turn-banner');
    dom.deckCount = $('deck-count');
    dom.btnDraw = $('btn-draw');
    dom.btnBuy = $('btn-buy');
    dom.btnPass = $('btn-pass');
    dom.vizDock = $('viz-dock');
    dom.vizCanvas = $('viz3d-canvas');
    dom.resultsHeadline = $('results-headline');
    dom.resultsSub = $('results-sub');
    dom.resultsGrid = $('results-grid');
    dom.toast = $('toast');
    dom.celebrate = $('celebrate-flash');
    dom.howtoOverlay = $('howto-overlay');
    dom.settingsOverlay = $('settings-overlay');
    dom.pauseOverlay = $('pause-overlay');
  }

  function bindGlobalUI() {
    $('btn-play').addEventListener('click', function () { PYR.Audio && PYR.Audio.play && PYR.Audio.play('click'); showScreen('setup'); });
    $('btn-howto-title').addEventListener('click', function () { openOverlay(dom.howtoOverlay); });
    $('btn-settings-title').addEventListener('click', function () { openOverlay(dom.settingsOverlay); });

    $('btn-reroll').addEventListener('click', function () { playClick(); generatePreview(true); });
    $('btn-begin').addEventListener('click', function () { playClick(); beginGame(); });

    $('btn-pause').addEventListener('click', function () { openOverlay(dom.pauseOverlay); });
    $('btn-pause-resume').addEventListener('click', function () { closeOverlay(dom.pauseOverlay); });
    $('btn-pause-howto').addEventListener('click', function () { openOverlay(dom.howtoOverlay); });
    $('btn-pause-sound').addEventListener('click', function () { toggleMute(); });
    $('btn-pause-restart').addEventListener('click', function () {
      closeOverlay(dom.pauseOverlay);
      generatePreview(true, app.difficulty);
      beginGame();
    });

    $('btn-results-howto').addEventListener('click', function () { openOverlay(dom.howtoOverlay); });
    $('btn-results-setup').addEventListener('click', function () { playClick(); generatePreview(true); showScreen('setup'); });
    $('btn-results-replay').addEventListener('click', function () { playClick(); generatePreview(true, app.difficulty); beginGame(); });

    qAll('.overlay-close').forEach(function (btn) {
      btn.addEventListener('click', function () { closeOverlay(btn.closest('.overlay')); });
    });
    qAll('.overlay').forEach(function (ov) {
      ov.addEventListener('click', function (e) { if (e.target === ov) closeOverlay(ov); });
    });

    $('btn-mute-global').addEventListener('click', toggleMute);
    $('btn-mute-game').addEventListener('click', toggleMute);
    var toggleSound = $('toggle-sound');
    toggleSound.addEventListener('click', toggleMute);
    toggleSound.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleMute(); } });

    var toggleMotion = $('toggle-motion');
    var motionOn = false;
    function setMotion(on) {
      motionOn = on;
      toggleMotion.setAttribute('aria-checked', String(on));
      document.documentElement.style.setProperty('--force-reduced-motion', on ? '1' : '0');
      if (on) document.documentElement.setAttribute('data-reduce-motion', '1');
      else document.documentElement.removeAttribute('data-reduce-motion');
    }
    toggleMotion.addEventListener('click', function () { setMotion(!motionOn); });
    toggleMotion.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setMotion(!motionOn); } });

    dom.btnDraw.addEventListener('click', function () { humanAction({ type: 'draw' }); });
    dom.btnBuy.addEventListener('click', function () { humanAction({ type: 'buyAction' }); });
    dom.btnPass.addEventListener('click', function () { humanAction({ type: 'pass' }); });
  }

  function toggleMute() {
    if (!(PYR.Audio && PYR.Audio.toggleMute)) return;
    PYR.Audio.toggleMute();
    syncSoundUI();
    playClick();
  }
  function syncSoundUI() {
    var muted = PYR.Audio && PYR.Audio.isMuted ? PYR.Audio.isMuted() : false;
    var glyph = muted ? '♯' : '♪';
    ['btn-mute-global', 'btn-mute-game'].forEach(function (id) {
      var el = $(id); if (el) { el.textContent = glyph; el.style.color = muted ? 'var(--faint)' : ''; }
    });
    var t = $('toggle-sound');
    if (t) t.setAttribute('aria-checked', String(!muted));
  }
  function playClick() { if (PYR.Audio && PYR.Audio.play) { try { PYR.Audio.play('click'); } catch (e) {} } }

  function openOverlay(el) { el.hidden = false; playClick(); var f = el.querySelector('button, a'); if (f) f.focus(); }
  function closeOverlay(el) { el.hidden = true; }

  function bindKeyboard() {
    document.addEventListener('keydown', function (e) {
      if (!dom.howtoOverlay.hidden && e.key === 'Escape') { closeOverlay(dom.howtoOverlay); return; }
      if (!dom.settingsOverlay.hidden && e.key === 'Escape') { closeOverlay(dom.settingsOverlay); return; }
      if (app.screen !== 'game') return;

      if (e.key === 'Escape') {
        if (app.selection) { clearSelection(); return; }
        if (!dom.pauseOverlay.hidden) closeOverlay(dom.pauseOverlay);
        else openOverlay(dom.pauseOverlay);
        return;
      }
      if (!dom.pauseOverlay.hidden) return;
      if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); humanAction({ type: 'pass' }); return; }
      if (e.key === 'd' || e.key === 'D') { humanAction({ type: 'draw' }); return; }
      if (e.key === 'b' || e.key === 'B') { humanAction({ type: 'buyAction' }); return; }
      if (e.key === 'm' || e.key === 'M') { toggleMute(); return; }
    });
  }

  /* ------------------------------------------------------------ screens */
  function showScreen(name) {
    app.screen = name;
    Object.keys(dom.screens).forEach(function (k) { dom.screens[k].hidden = (k !== name); });
    dom.vizDock.hidden = (name !== 'game');
    if (name === 'title') ensureTitleViz();
    if (name === 'game') {
      ensureViz();
      startVizLoop();
      if (PYR.Audio && PYR.Audio.startMusic) { try { PYR.Audio.startMusic('game'); } catch (e) {} }
    } else {
      stopVizLoop();
      if (name === 'title' || name === 'setup') {
        if (PYR.Audio && PYR.Audio.startMusic) { try { PYR.Audio.startMusic('menu'); } catch (e) {} }
      }
    }
    if (name === 'setup') renderSetup();
    if (name === 'results') renderResults();
  }

  /* ------------------------------------------------------------ setup */
  function generatePreview(reroll, forcedDifficulty) {
    if (forcedDifficulty) app.difficulty = forcedDifficulty;
    var seed = randSeed();
    app.pendingState = PYR.Engine.createGame({ difficulty: app.difficulty, seed: seed });
    renderSetup();
  }

  function renderSetup() {
    if (!dom.diffGrid.childElementCount) {
      var levels = [
        ['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard'], ['master', 'Master']
      ];
      levels.forEach(function (lv) {
        var btn = document.createElement('button');
        btn.className = 'diff-card';
        btn.type = 'button';
        btn.setAttribute('aria-pressed', 'false');
        btn.innerHTML = '<span class="d-name">' + lv[1] + '</span><span class="d-sub">' + diffSub(lv[0]) + '</span>';
        btn.addEventListener('click', function () {
          if (app.difficulty === lv[0]) return;
          playClick();
          app.difficulty = lv[0];
          generatePreview();
        });
        dom.diffGrid.appendChild(btn);
      });
    }
    qAll('.diff-card', dom.diffGrid).forEach(function (btn, i) {
      var lv = ['easy', 'normal', 'hard', 'master'][i];
      btn.setAttribute('aria-pressed', String(lv === app.difficulty));
    });

    dom.aiPreview.innerHTML = '';
    if (!app.pendingState) return;
    ['hearts', 'clubs', 'diamonds'].forEach(function (suit) {
      var house = app.pendingState.houses[suit];
      var p = house.personality || {};
      var card = document.createElement('div');
      card.className = 'ai-card';
      card.style.setProperty('--suit-color', SUIT_COLOR[suit]);
      card.innerHTML =
        '<span class="a-suit">' + SUIT_GLYPH[suit] + ' ' + SUIT_LABEL[suit] + '</span>' +
        '<span class="a-name">' + escapeHtml(p.name || SUIT_LABEL[suit]) + '</span>' +
        '<span class="a-flavor">' + flavorText(p) + '</span>' +
        '<span class="a-traits">' + traitPills(p) + '</span>';
      dom.aiPreview.appendChild(card);
    });
  }

  function diffSub(lv) {
    return { easy: 'gentle', normal: 'balanced', hard: 'sharp', master: 'ruthless' }[lv] || '';
  }
  function flavorText(p) {
    var bits = [];
    if (p.builder > (p.greed || 0)) bits.push('builds toward the pyramid');
    else if (p.disruptor > 0.6) bits.push('plays to deny you gems');
    else bits.push('hunts gems on sight');
    return escapeHtml(bits.join(', '));
  }
  function traitPills(p) {
    var out = '';
    if (typeof p.greed === 'number') out += '<span class="trait-pill">greed ' + p.greed.toFixed(1) + '</span>';
    if (typeof p.builder === 'number') out += '<span class="trait-pill">builder ' + p.builder.toFixed(1) + '</span>';
    if (typeof p.disruptor === 'number') out += '<span class="trait-pill">disruptor ' + p.disruptor.toFixed(1) + '</span>';
    return out;
  }
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }

  function beginGame() {
    app.state = app.pendingState || PYR.Engine.createGame({ difficulty: app.difficulty, seed: randSeed() });
    app.aiRng = mulberry32(randSeed());
    app.seenLogCount = 0;
    app.selection = null;
    showScreen('game');
    renderGame(true);
    maybeRunAI();
  }

  /* ------------------------------------------------------------ game render */
  function renderGame(fullLogReset) {
    var state = app.state;
    if (!state) return;
    var legal = (state.phase === 'playing' && state.currentHouse === 'spades')
      ? (PYR.Engine.legalActions(state, 'spades') || []) : [];
    var maps = buildInteractionMaps(legal);

    renderBoard(state, maps);
    renderHouses(state);
    renderHand(state, maps);
    renderHeader(state);
    renderActionButtons(state, legal);
    renderLog(state, fullLogReset);
  }

  function buildInteractionMaps(legal) {
    var direct = {};      // nodeId -> action (claim, or fixed-slot pivot)
    var cardPivots = {};  // nodeId -> [{action, partner}]
    legal.forEach(function (action) {
      if (action.type === 'claim') {
        var locKey = action.loc === 'court' ? action.key : action.key;
        direct[gemNodeId(action.loc, locKey)] = action;
      } else if (action.type === 'pivot') {
        if (action.loc === 'base' || action.loc === 'cap' || action.loc === 'peak') {
          var id = gemNodeId(action.loc, action.key);
          if (!direct[id]) direct[id] = action;
        } else if (action.loc === 'court' || action.loc === 'royals') {
          var which = action.loc === 'court' ? 'subjects' : 'royals';
          var pair = subPair(action.sub);
          var nA = cardNodeId(which, action.key, pair[0]);
          var nB = cardNodeId(which, action.key, pair[1]);
          addPivot(cardPivots, nA, action, nB);
          addPivot(cardPivots, nB, action, nA);
        } else if (action.loc === 'hands') {
          var hN = handNodeId(action.handIndex);
          var cN = cardNodeId('subjects', action.key, action.sub);
          addPivot(cardPivots, hN, action, cN);
          addPivot(cardPivots, cN, action, hN);
        }
      }
    });
    return { direct: direct, cardPivots: cardPivots };
  }
  function subPair(sub) {
    if (sub === 'left-right') return ['left', 'right'];
    if (sub === 'right-center') return ['right', 'center'];
    return ['center', 'left'];
  }
  function addPivot(map, nodeId, action, partner) {
    (map[nodeId] = map[nodeId] || []).push({ action: action, partner: partner });
  }

  function renderBoard(state, maps) {
    for (var r = 0; r < BOARD_ROWS.length; r++) {
      var rowEl = dom.boardRows[r];
      var frag = document.createDocumentFragment();
      BOARD_ROWS[r].forEach(function (slot) {
        frag.appendChild(slot.kind === 'card' ? renderCardSlot(state, maps, slot) : renderGemSlot(state, maps, slot));
      });
      rowEl.innerHTML = '';
      rowEl.appendChild(frag);
    }
  }

  function renderCardSlot(state, maps, slot) {
    var card = state.board[slot.which][slot.suit][slot.pos];
    var id = cardNodeId(slot.which, slot.suit, slot.pos);
    var el = document.createElement('div');
    el.className = 'slot';
    var inner = buildCardEl(card, slot.which === 'royals');
    inner.dataset.nodeId = id;
    inner.style.setProperty('--rot', cardRotation(slot) + 'deg');
    if (slot.suit === 'spades') inner.classList.add('own-house');
    var pivots = maps.cardPivots[id];
    if (pivots && pivots.length) {
      inner.classList.add('selectable');
      inner.setAttribute('role', 'button');
      inner.tabIndex = 0;
      inner.setAttribute('aria-label', cardAria(card, slot) + ' — pivotable');
    } else {
      inner.setAttribute('aria-label', cardAria(card, slot));
    }
    if (app.selection) {
      if (app.selection.nodeId === id) inner.classList.add('selected');
      else if (app.selection.partners.has(id)) inner.classList.add('pivot-target');
    }
    el.appendChild(inner);
    return el;
  }

  // Orient each card along its pyramid face so the board reads radially (a
  // pinwheel). Suits sit at the four poles and each radiates outward; the two
  // flanking cards of a face splay toward its shared corners. Net result: every
  // card lands on a 45-degree increment (0/45/90/.../315).
  var SUIT_POLE = { clubs: 0, hearts: 90, spades: 180, diamonds: 270 };
  function cardRotation(slot) {
    var base = SUIT_POLE[slot.suit] || 0;
    // Royals sit squarely at the cardinal angle (0/90/180/270). Only the
    // subject cards splay +/-45deg toward their face's shared corners.
    if (slot.which === 'royals') return base;
    var fan = slot.pos === 'left' ? -45 : (slot.pos === 'right' ? 45 : 0);
    return base + fan;
  }

  function cardAria(card, slot) {
    return rankWord(card.rank) + ' of ' + SUIT_LABEL[card.suit] + ', ' + slot.which + ' ' + slot.pos;
  }
  function rankWord(r) { return r === 'X' ? '10' : (r === 'A' ? 'Ace' : (r === 'J' ? 'Jack' : (r === 'Q' ? 'Queen' : (r === 'K' ? 'King' : r)))); }

  function buildCardEl(card, isRoyal) {
    var el = document.createElement('div');
    el.className = 'card' + (isRoyal ? ' is-royal' : '');
    if (card) {
      el.style.setProperty('--card-color', SUIT_COLOR[card.suit]);
      var rank = document.createElement('span');
      rank.className = 'c-rank';
      rank.textContent = card.rank === 'X' ? '10' : card.rank;
      var pip = document.createElement('span');
      pip.className = 'c-pip';
      pip.style.color = SUIT_COLOR[card.suit];
      pip.textContent = SUIT_GLYPH[card.suit];
      el.appendChild(rank);
      el.appendChild(pip);
    }
    return el;
  }

  function renderGemSlot(state, maps, slot) {
    var loc = slot.loc, key = slot.key;
    var info;
    if (loc === 'peak') {
      info = resolvePeak(state);
      key = info.key;
    } else {
      info = state.gems[loc][key];
    }
    var id = gemNodeId(loc, key);
    var el = document.createElement('div');
    el.className = 'slot';
    var inner = document.createElement('div');
    inner.className = 'gem' + (loc === 'peak' ? ' peak-node' : '');
    var armed = !!(info && info.gem);
    var spent = !!(info && info.spent && !info.gem);
    if (armed) inner.classList.add('armed');
    if (spent) inner.classList.add('spent');
    var action = maps.direct[id];
    if (action) {
      inner.classList.add('pivotable');
      inner.setAttribute('role', 'button');
      inner.tabIndex = 0;
    }
    inner.dataset.nodeId = id;
    inner.setAttribute('aria-label', gemAria(loc, key, armed, action));
    el.appendChild(inner);
    return el;
  }

  function resolvePeak(state) {
    for (var i = 0; i < PEAK_KEYS.length; i++) {
      var k = PEAK_KEYS[i];
      if (state.gems.peak[k] && state.gems.peak[k].gem) return { key: k };
    }
    for (var j = 0; j < PEAK_KEYS.length; j++) {
      var k2 = PEAK_KEYS[j];
      if (state.gems.peak[k2] && state.gems.peak[k2].spent) return { key: k2 };
    }
    return { key: 'spades-clubs' };
  }

  function gemAria(loc, key, armed, action) {
    var name = loc === 'court' ? (SUIT_LABEL[key] + ' court gem') : (loc + ' gem ' + key);
    if (armed) return name + ', armed' + (action ? ', claimable' : '');
    if (action) return name + ', pivotable';
    return name + ', dormant';
  }

  function renderHouses(state) {
    if (!dom.housesCol.childElementCount) {
      SUITS.forEach(function (suit) {
        var panel = document.createElement('div');
        panel.className = 'house-panel';
        panel.id = 'house-' + suit;
        panel.style.setProperty('--suit-color', SUIT_COLOR[suit]);
        panel.innerHTML =
          '<div class="house-top"><span class="house-name">' + SUIT_GLYPH[suit] + ' <span class="hp-name"></span></span>' +
          '<span class="house-tag hp-tag"></span></div>' +
          '<div class="house-stats">' +
          '<span class="stat-gold">Gems <b class="hp-gems">0</b></span>' +
          '<span>Score <b class="hp-score">0</b></span>' +
          '<span class="hp-actions-wrap">Acts <b class="hp-actions">—</b></span>' +
          '</div>';
        dom.housesCol.appendChild(panel);
      });
    }
    SUITS.forEach(function (suit) {
      var house = state.houses[suit];
      var panel = $('house-' + suit);
      panel.classList.toggle('is-current', state.currentHouse === suit && state.phase === 'playing');
      panel.querySelector('.hp-name').textContent = house.isHuman ? 'You' : (house.personality && house.personality.name || SUIT_LABEL[suit]);
      panel.querySelector('.hp-tag').textContent = house.isHuman ? SUIT_LABEL[suit] : (SUIT_LABEL[suit] + (house.personality ? ' · AI' : ''));
      panel.querySelector('.hp-gems').textContent = house.gems;
      panel.querySelector('.hp-score').textContent = house.score;
      panel.querySelector('.hp-actions').textContent = (state.currentHouse === suit && state.phase === 'playing') ? String(house.actions) : '—';
    });
  }

  function renderHand(state, maps) {
    var human = state.houses.spades;
    dom.handCards.innerHTML = '';
    if (!human.hand.length) {
      var empty = document.createElement('span');
      empty.className = 'hand-empty';
      empty.textContent = 'No cards drawn yet';
      dom.handCards.appendChild(empty);
      return;
    }
    human.hand.forEach(function (card, i) {
      var id = handNodeId(i);
      var el = buildCardEl(card, false);
      el.dataset.nodeId = id;
      var pivots = maps.cardPivots[id];
      if (pivots && pivots.length) {
        el.classList.add('selectable');
        el.setAttribute('role', 'button');
        el.tabIndex = 0;
      }
      el.setAttribute('aria-label', rankWord(card.rank) + ' of ' + SUIT_LABEL[card.suit] + ', in hand');
      if (app.selection) {
        if (app.selection.nodeId === id) el.classList.add('selected');
        else if (app.selection.partners.has(id)) el.classList.add('pivot-target');
      }
      dom.handCards.appendChild(el);
    });
  }

  function renderHeader(state) {
    var suit = state.currentHouse;
    var house = state.houses[suit];
    dom.turnBanner.innerHTML =
      '<span class="turn-dot" style="--suit-color:' + SUIT_COLOR[suit] + '"></span>' +
      '<span class="t-name" style="--suit-color:' + SUIT_COLOR[suit] + '">' +
      (house.isHuman ? 'Your Turn' : (SUIT_LABEL[suit] + '’s Turn')) + '</span>' +
      '<span class="t-actions">' + (state.phase === 'playing' ? house.actions + ' action' + (house.actions === 1 ? '' : 's') + ' left' : 'Game over') + '</span>';
    dom.deckCount.textContent = state.deck.length;
  }

  function renderActionButtons(state, legal) {
    var isHumanTurn = state.phase === 'playing' && state.currentHouse === 'spades';
    setBtn(dom.btnDraw, isHumanTurn && legal.some(function (a) { return a.type === 'draw'; }),
      isHumanTurn ? (state.houses.spades.hand.length >= 3 ? 'Hand is full (3)' : (state.deck.length === 0 ? 'Deck is empty' : 'Draw a card')) : 'Not your turn');
    setBtn(dom.btnBuy, isHumanTurn && legal.some(function (a) { return a.type === 'buyAction'; }),
      isHumanTurn ? (state.houses.spades.gems < 1 ? 'Need a gem to spend' : (state.houses.spades.buys >= 2 ? 'Max 2 buys this turn' : 'Spend a gem for an extra action')) : 'Not your turn');
    setBtn(dom.btnPass, isHumanTurn, isHumanTurn ? 'End your turn' : 'Not your turn');
  }
  function setBtn(btn, enabled, title) {
    btn.disabled = !enabled;
    btn.title = title || '';
  }

  function renderLog(state, fullReset) {
    var log = state.log || [];
    if (fullReset) { dom.logFeed.innerHTML = ''; app.seenLogCount = 0; }
    var startAt = fullReset ? Math.max(0, log.length - 30) : app.seenLogCount;
    for (var i = startAt; i < log.length; i++) {
      appendLogEntry(log[i], !fullReset);
    }
    app.seenLogCount = log.length;
  }
  function appendLogEntry(entry, animate) {
    var row = document.createElement('div');
    row.className = 'log-entry' + (animate ? ' is-new' : '');
    if (entry.house) row.style.setProperty('--suit-color', SUIT_COLOR[entry.house] || 'inherit');
    var name = entry.house ? '<b>' + SUIT_LABEL[entry.house] + '</b> ' : '';
    row.innerHTML = name + escapeHtml(entry.text || '');
    dom.logFeed.insertBefore(row, dom.logFeed.firstChild);
    while (dom.logFeed.children.length > 60) dom.logFeed.removeChild(dom.logFeed.lastChild);
  }

  /* ------------------------------------------------------------ interaction */
  function bindBoardDelegation() {
    document.addEventListener('click', function (e) {
      var el = e.target.closest && e.target.closest('[data-node-id]');
      if (!el) return;
      handleNodeActivate(el.dataset.nodeId);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      var el = e.target.closest && e.target.closest('[data-node-id]');
      if (!el) return;
      e.preventDefault();
      handleNodeActivate(el.dataset.nodeId);
    });
  }

  function handleNodeActivate(nodeId) {
    if (app.screen !== 'game' || !app.state) return;
    if (app.state.phase !== 'playing' || app.state.currentHouse !== 'spades') return;

    var legal = PYR.Engine.legalActions(app.state, 'spades') || [];
    var maps = buildInteractionMaps(legal);

    if (maps.direct[nodeId]) {
      clearSelection();
      humanAction(maps.direct[nodeId]);
      return;
    }
    var candidates = maps.cardPivots[nodeId];
    if (!candidates || !candidates.length) {
      flashToast('That isn’t a legal move right now.');
      return;
    }

    if (app.selection) {
      if (app.selection.nodeId === nodeId) { clearSelection(); return; }
      if (app.selection.partners.has(nodeId)) {
        var srcCandidates = app.selection.candidates;
        var match = srcCandidates.filter(function (c) { return c.partner === nodeId; })[0];
        clearSelection();
        if (match) humanAction(match.action);
        return;
      }
    }
    // start a new selection
    var partners = {};
    candidates.forEach(function (c) { partners[c.partner] = true; });
    app.selection = { nodeId: nodeId, partners: new Set(Object.keys(partners)), candidates: candidates };
    renderGame();
  }

  function clearSelection() {
    if (app.selection) { app.selection = null; renderGame(); }
  }

  function flashToast(msg) {
    dom.toast.textContent = msg;
    dom.toast.classList.add('show');
    if (PYR.Audio && PYR.Audio.play) { try { PYR.Audio.play('error'); } catch (e) {} }
    clearTimeout(app._toastTimer);
    app._toastTimer = setTimeout(function () { dom.toast.classList.remove('show'); }, 2200);
  }

  /* ------------------------------------------------------------ dispatch */
  function humanAction(action) {
    if (!app.state || app.state.phase !== 'playing' || app.state.currentHouse !== 'spades') return;
    applyAndProcess(action);
  }

  function applyAndProcess(action) {
    var result;
    try {
      result = PYR.Engine.applyAction(app.state, action);
    } catch (err) {
      flashToast('That move isn’t legal.');
      return;
    }
    app.state = result.state;
    app.selection = null;
    renderGame();
    processEvents(result.events || []);
    afterAction();
  }

  function afterAction() {
    if (app.state.phase === 'ended') {
      setTimeout(function () { showScreen('results'); }, 900);
      return;
    }
    maybeRunAI();
  }

  var EVENT_SOUND = {
    claim: 'claim', pivot: 'pivot', draw: 'draw', buy: 'buy', pass: 'pass',
    gemArmed: 'gemArm', turnEnd: 'turn', duel: 'duel', pyramid: 'pyramid', gameEnd: 'win'
  };

  function processEvents(events) {
    events.forEach(function (ev) {
      var sound = EVENT_SOUND[ev.type];
      if (sound && PYR.Audio && PYR.Audio.play) { try { PYR.Audio.play(sound); } catch (e) {} }
      if (ev.type === 'duel' || ev.type === 'pyramid') celebrate();
    });
  }

  function celebrate() {
    dom.celebrate.classList.remove('show');
    void dom.celebrate.offsetWidth;
    dom.celebrate.classList.add('show');
  }

  /* ------------------------------------------------------------ AI loop */
  function maybeRunAI() {
    if (app.aiRunning) return;
    if (!app.state || app.state.phase !== 'playing' || app.state.currentHouse === 'spades') return;
    app.aiRunning = true;
    app.aiLoopGuard = 0;
    stepAI();
  }

  function stepAI() {
    if (!app.state || app.state.phase !== 'playing' || app.state.currentHouse === 'spades') {
      app.aiRunning = false;
      if (app.state && app.state.phase === 'ended') setTimeout(function () { showScreen('results'); }, 900);
      return;
    }
    if (++app.aiLoopGuard > AI_LOOP_HARD_CAP) { app.aiRunning = false; return; }

    var suit = app.state.currentHouse;
    var action;
    try {
      action = PYR.AI.chooseAction(app.state, suit, app.aiRng);
    } catch (err) {
      action = { type: 'pass' };
    }
    var result;
    try {
      result = PYR.Engine.applyAction(app.state, action);
    } catch (err) {
      result = PYR.Engine.applyAction(app.state, { type: 'pass' });
    }
    app.state = result.state;
    renderGame();
    processEvents(result.events || []);
    highlightTouched(suit);

    if (app.state.phase === 'ended') {
      app.aiRunning = false;
      setTimeout(function () { showScreen('results'); }, 900);
      return;
    }
    setTimeout(stepAI, 600);
  }

  function highlightTouched(suit) {
    var panel = $('house-' + suit);
    if (!panel) return;
    panel.classList.add('touched');
    setTimeout(function () { panel.classList.remove('touched'); }, 900);
  }

  /* ------------------------------------------------------------ viz3d */
  // The dock is a fixed-size CIRCLE, so the canvas must be told its real CSS
  // size — otherwise Viz3D keeps its 200x200 default, draws off-centre into a
  // differently-sized backing store, and gets clipped by the round mask.
  function sizeViz() {
    if (!app.viz || !app.viz.setSize || !dom.vizCanvas) return;
    var dock = dom.vizCanvas.parentElement || dom.vizCanvas;
    var w = dock.clientWidth || 200, h = dock.clientHeight || 200;
    try { app.viz.setSize(w, h); } catch (e) {}
  }
  // The title-screen glyph: the same 3D pyramid, in minimal showcase mode
  // (no grid/caption, forced coherent) — a slow rotating solid.
  function ensureTitleViz() {
    if (app.titleViz || !(PYR.Viz3D && PYR.Viz3D.create)) return;
    var cv = document.getElementById('title-glyph');
    if (!cv) return;
    try { app.titleViz = PYR.Viz3D.create(cv, { minimal: true }); } catch (e) { app.titleViz = null; }
    var szt = function () { if (app.titleViz) { try { app.titleViz.setSize(cv.clientWidth || 160, cv.clientHeight || 160); } catch (e) {} } };
    szt();
    window.addEventListener('resize', szt);
  }
  function ensureViz() {
    if (app.viz || !(PYR.Viz3D && PYR.Viz3D.create)) return;
    try { app.viz = PYR.Viz3D.create(dom.vizCanvas); } catch (e) { app.viz = null; }
    sizeViz();
    if (!app._vizResize) {
      app._vizResize = function () { sizeViz(); };
      window.addEventListener('resize', app._vizResize);
    }
  }
  function startVizLoop() {
    stopVizLoop();
    function frame() {
      if (app.screen === 'game' && app.viz && app.state) {
        try { app.viz.render(app.state); } catch (e) {}
      }
      app.vizRaf = requestAnimationFrame(frame);
    }
    app.vizRaf = requestAnimationFrame(frame);
  }
  function stopVizLoop() {
    if (app.vizRaf) cancelAnimationFrame(app.vizRaf);
    app.vizRaf = null;
  }

  /* ------------------------------------------------------------ results */
  function renderResults() {
    var state = app.state;
    if (!state) return;
    var winner = state.winner;
    var winHouse = winner ? state.houses[winner] : null;
    if (state.pyramidComplete) {
      dom.resultsHeadline.textContent = 'The Pyramid Holds';
      dom.resultsSub.textContent = (winHouse ? (winHouse.isHuman ? 'You' : winHouse.personality.name) : SUIT_LABEL[winner]) +
        ' completed the pyramid and claimed a +150 bonus.';
    } else if (winner) {
      dom.resultsHeadline.textContent = (winHouse.isHuman ? 'You Win the Table' : SUIT_LABEL[winner] + ' Wins the Table');
      dom.resultsSub.textContent = 'The deck ran dry. Highest score takes the table' +
        (winHouse.isHuman ? '' : ', led by ' + winHouse.personality.name) + '.';
    } else {
      dom.resultsHeadline.textContent = 'The Table Settles';
      dom.resultsSub.textContent = 'The deck ran dry with the houses tied on the deciding measure.';
    }

    dom.resultsGrid.innerHTML = '';
    var ordered = SUITS.slice().sort(function (a, b) { return state.houses[b].score - state.houses[a].score; });
    ordered.forEach(function (suit) {
      var house = state.houses[suit];
      var card = document.createElement('div');
      card.className = 'result-card' + (suit === winner ? ' is-winner' : '');
      card.style.setProperty('--suit-color', SUIT_COLOR[suit]);
      card.innerHTML =
        '<span class="r-crown">' + (suit === winner ? '★' : '') + '</span>' +
        '<span class="r-name">' + SUIT_GLYPH[suit] + ' ' + (house.isHuman ? 'You' : (house.personality && house.personality.name || SUIT_LABEL[suit])) + '</span>' +
        '<span class="r-score">' + house.score + '</span>' +
        '<span class="r-gems">' + house.gems + ' gems</span>';
      dom.resultsGrid.appendChild(card);
    });

    if (PYR.Audio && PYR.Audio.play) {
      try { PYR.Audio.play(winner === 'spades' ? 'win' : (winner ? 'lose' : 'win')); } catch (e) {}
    }
  }

})();
