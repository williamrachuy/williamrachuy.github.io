/*
 * PYRAMID — pure rules engine.
 *
 * Plain script (NOT an ES module) so it works over file:// via a <script> tag.
 * Attaches everything to window.PYR.Engine. No DOM access, no console spam,
 * no non-deterministic randomness (all randomness flows through a seeded
 * mulberry32 PRNG derived from `seed`).
 *
 * Geometry & rules ported from the original Python prototype
 * (~/github/pyramid/game.py — Table.setUpGemNodes / setUpPivotNodes / Rules /
 * Game.generateGems) and extended per PYRAMID_SPEC.md section 2.
 *
 * Every exported function is defensive: malformed/missing input degrades to
 * a safe no-op / empty result rather than throwing.
 */
(function (root) {
  'use strict';

  // ---------------------------------------------------------------------
  // Constants
  // ---------------------------------------------------------------------

  var SUITS = ['spades', 'hearts', 'clubs', 'diamonds'];
  var POSITIONS = ['left', 'right', 'center'];

  var SUBJECT_RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', 'X'];
  var ROYAL_RANKS = ['J', 'Q', 'K'];
  // Full rank order (subjects then royals). Subjects are what live in the
  // deck; royals are dealt directly into each house's royal row.
  var RANKS = SUBJECT_RANKS.concat(ROYAL_RANKS);

  var GEM_VALUES = { base: 10, cap: 15, court: 25, peak: 60 };
  var OWN_COURT_MULTIPLIER = 1.5;
  var PYRAMID_BONUS = 150;
  // Hard clock: the 12-card board is a closed system, so matches can be broken
  // and re-made indefinitely. Rounds bound the game even if nobody ever draws.
  var MAX_ROUNDS = 20;

  var ROYAL_TRUMPS = [['K', 'Q'], ['Q', 'J'], ['J', 'K']];
  var SUIT_TRUMPS = [
    ['spades', 'hearts'], ['hearts', 'clubs'], ['clubs', 'diamonds'], ['diamonds', 'spades']
  ];

  var COURT_PIVOT_SUBS = ['left-right', 'right-center', 'center-left'];
  var PEAK_KEYS = ['spades-clubs', 'hearts-diamonds'];

  // ---------------------------------------------------------------------
  // Small pure helpers
  // ---------------------------------------------------------------------

  function nextSuit(s) {
    var i = SUITS.indexOf(s);
    if (i === -1) return null;
    return SUITS[(i + 1) % 4];
  }

  function oppositeSuit(s) {
    var i = SUITS.indexOf(s);
    if (i === -1) return null;
    return SUITS[(i + 2) % 4];
  }

  function prevSuit(s) {
    var i = SUITS.indexOf(s);
    if (i === -1) return null;
    return SUITS[(i + 3) % 4];
  }

  function baseKey(suit) {
    var n = nextSuit(suit);
    if (!n) return null;
    return suit + '-' + n;
  }

  function pairIn(list, a, b) {
    for (var i = 0; i < list.length; i++) {
      if (list[i][0] === a && list[i][1] === b) return true;
    }
    return false;
  }

  // isPair: Ace is wild — matches any rank, including another Ace.
  function isPair(a, b) {
    if (!a || !b) return false;
    return a.rank === b.rank || a.rank === 'A' || b.rank === 'A';
  }

  // isFlush: every card in `cards` must belong to `suit`.
  function isFlush(suit, cards) {
    if (!suit || !Array.isArray(cards) || cards.length === 0) return false;
    for (var i = 0; i < cards.length; i++) {
      var c = cards[i];
      if (!c || c.suit !== suit) return false;
    }
    return true;
  }

  // doesCardTrump: ported verbatim from Rules.doesCardTrump.
  //  1. Royal RPS first: (K,Q) (Q,J) (J,K) -> true.
  //  2. Else, suit cycle spades>hearts>clubs>diamonds>spades -> true,
  //     UNLESS the royal-RPS relationship holds in reverse (then false).
  //  3. Else false.
  function doesCardTrump(a, b) {
    if (!a || !b) return false;
    if (pairIn(ROYAL_TRUMPS, a.rank, b.rank)) return true;
    if (pairIn(SUIT_TRUMPS, a.suit, b.suit)) {
      if (pairIn(ROYAL_TRUMPS, b.rank, a.rank)) return false;
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------------------
  // Seeded RNG (mulberry32) — deterministic given a seed.
  // ---------------------------------------------------------------------

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(arr, rng) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  // ---------------------------------------------------------------------
  // Cloning
  // ---------------------------------------------------------------------

  // State is plain JSON-safe data (no functions/dates), so a stringify
  // round-trip is a cheap, reliable deep clone.
  function cloneState(state) {
    if (state === undefined || state === null) return state;
    try {
      return JSON.parse(JSON.stringify(state));
    } catch (e) {
      return state;
    }
  }

  // ---------------------------------------------------------------------
  // Game setup
  // ---------------------------------------------------------------------

  function buildEmptyGems() {
    var g = { base: {}, cap: {}, court: {}, peak: {} };
    for (var i = 0; i < SUITS.length; i++) {
      var suit = SUITS[i];
      var key = baseKey(suit);
      g.base[key] = { gem: false, spent: false, claims: 0 };
      g.cap[key] = { gem: false, spent: false, claims: 0 };
      g.court[suit] = { gem: false, spent: false, claims: 0 };
    }
    g.peak[PEAK_KEYS[0]] = { gem: false, spent: false, claims: 0 };
    g.peak[PEAK_KEYS[1]] = { gem: false, spent: false, claims: 0 };
    return g;
  }

  function createGame(opts) {
    opts = opts || {};
    var difficulty = opts.difficulty || 'normal';
    var seedInput = opts.seed;
    var seed;
    if (seedInput === undefined || seedInput === null) {
      // Deterministic fallback isn't possible without an external seed, but
      // we still want a plain 32-bit int so replays are byte-identical if
      // the caller records the resulting state.seed.
      seed = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
    } else if (typeof seedInput === 'string') {
      // Cheap string hash -> 32-bit seed.
      var h = 2166136261;
      for (var si = 0; si < seedInput.length; si++) {
        h ^= seedInput.charCodeAt(si);
        h = Math.imul(h, 16777619);
      }
      seed = h >>> 0;
    } else {
      seed = (seedInput >>> 0);
    }
    var aiNames = opts.aiNames || {};
    var rng = mulberry32(seed);

    // Build & shuffle the 40-card subject deck.
    var deck = [];
    for (var s = 0; s < SUITS.length; s++) {
      for (var r = 0; r < SUBJECT_RANKS.length; r++) {
        deck.push({ rank: SUBJECT_RANKS[r], suit: SUITS[s] });
      }
    }
    deck = shuffle(deck, rng);

    // Deal 12 subjects onto the board (left, right, center per suit, in
    // SUITS order) — mirrors Table.dealSubjects exactly.
    var board = { subjects: {}, royals: {} };
    for (var su = 0; su < SUITS.length; su++) {
      var suitName = SUITS[su];
      board.subjects[suitName] = {};
      for (var p = 0; p < POSITIONS.length; p++) {
        board.subjects[suitName][POSITIONS[p]] = deck.shift() || null;
      }
      // Royals dealt directly (not from the deck): left=J, right=Q, center=K
      // — mirrors Table.dealRoyals (pops J,Q,K off the front in that order).
      board.royals[suitName] = {
        left: { rank: 'J', suit: suitName },
        right: { rank: 'Q', suit: suitName },
        center: { rank: 'K', suit: suitName }
      };
    }

    var defaultNames = { spades: 'You', hearts: 'Hearts AI', clubs: 'Clubs AI', diamonds: 'Diamonds AI' };
    var houses = {};
    for (var hs = 0; hs < SUITS.length; hs++) {
      var houseSuit = SUITS[hs];
      var isHuman = houseSuit === 'spades';
      houses[houseSuit] = {
        suit: houseSuit,
        name: isHuman ? 'You' : (aiNames[houseSuit] || defaultNames[houseSuit]),
        isHuman: isHuman,
        // The starting house (spades) begins with its turn-income gem so it
        // can act on turn one; every other house gets theirs via endTurn.
        gems: (houseSuit === SUITS[0]) ? 1 : 0,
        score: 0,
        hand: [],
        // Personality objects are the AI module's concern; the engine never
        // reads this field. Left null here — ai.js fills it in if it wants.
        personality: null
      };
    }

    var state = {
      turn: 0,
      round: 0,
      currentHouse: SUITS[0],
      phase: 'playing',
      difficulty: difficulty,
      maxRounds: (opts && opts.maxRounds) || MAX_ROUNDS,
      deck: deck,
      finalRound: false,
      board: board,
      houses: houses,
      gems: buildEmptyGems(),
      log: [],
      winner: null,
      pyramidComplete: false,
      seed: seed
    };

    // Arm any gems that happen to already be matched in the initial deal.
    var evaluated = evaluateGemsInternal(state);
    return evaluated.state;
  }

  // ---------------------------------------------------------------------
  // Gem arming
  // ---------------------------------------------------------------------

  // Updates a single (non-peak) gem node in place given whether its cards
  // currently match. Arms on an unmatched->matched transition; stays
  // suppressed while spent; clears spent once it goes unmatched again.
  function updateNode(node, matched, loc, key, newlyArmed) {
    if (!node) return;
    if (!matched) {
      node.gem = false;
      node.spent = false;
      return;
    }
    if (node.spent) return; // matched but still spent: stays suppressed
    if (!node.gem) {
      node.gem = true;
      newlyArmed.push({ loc: loc, key: key });
    }
  }

  // Peak is special: at most one peak gem may be armed at a time (mirrors
  // Game.generateGems' `empty` flag, checked in PEAK_KEYS order).
  function updatePeak(state, newlyArmed) {
    var matched = {};
    for (var i = 0; i < PEAK_KEYS.length; i++) {
      var key = PEAK_KEYS[i];
      var parts = key.split('-');
      var subjA = state.board.subjects[parts[0]];
      var subjB = state.board.subjects[parts[1]];
      matched[key] = isPair(subjA && subjA.center, subjB && subjB.center);
    }
    // First reset any node that has gone unmatched.
    for (var j = 0; j < PEAK_KEYS.length; j++) {
      var k = PEAK_KEYS[j];
      if (!matched[k]) {
        state.gems.peak[k].gem = false;
        state.gems.peak[k].spent = false;
      }
    }
    // A peak gem already armed (persisting from a previous evaluation)
    // blocks any new arming this pass.
    var empty = true;
    for (var m = 0; m < PEAK_KEYS.length; m++) {
      if (state.gems.peak[PEAK_KEYS[m]].gem) empty = false;
    }
    for (var n = 0; n < PEAK_KEYS.length; n++) {
      var kk = PEAK_KEYS[n];
      var node = state.gems.peak[kk];
      if (empty && matched[kk] && !node.spent && !node.gem) {
        node.gem = true;
        empty = false;
        newlyArmed.push({ loc: 'peak', key: kk });
      }
    }
  }

  // Internal: clones, re-evaluates every gem node, returns {state, newlyArmed}.
  function evaluateGemsInternal(state) {
    var s = cloneState(state);
    if (!s || !s.board || !s.gems) return { state: s, newlyArmed: [] };
    var newlyArmed = [];

    for (var i = 0; i < SUITS.length; i++) {
      var suit = SUITS[i];
      var nx = nextSuit(suit);
      var key = baseKey(suit);

      // base: pair(suit.right, next.left)
      var baseA = s.board.subjects[suit], baseB = s.board.subjects[nx];
      updateNode(s.gems.base[key], isPair(baseA && baseA.right, baseB && baseB.left), 'base', key, newlyArmed);

      // cap: pair(suit.center, next.center)
      updateNode(s.gems.cap[key], isPair(baseA && baseA.center, baseB && baseB.center), 'cap', key, newlyArmed);

      // court: flush of all 3 of this suit's subjects
      var subj = s.board.subjects[suit];
      var courtCards = subj ? [subj.left, subj.right, subj.center] : [];
      updateNode(s.gems.court[suit], isFlush(suit, courtCards), 'court', suit, newlyArmed);
    }

    updatePeak(s, newlyArmed);

    return { state: s, newlyArmed: newlyArmed };
  }

  function evaluateGems(state) {
    return evaluateGemsInternal(state).state;
  }

  // ---------------------------------------------------------------------
  // Pyramid coherence
  // ---------------------------------------------------------------------

  // Coherence is a structural fact about the current cards on the board —
  // independent of whether a node's gem has already been claimed/spent.
  function coherence(state) {
    var result = { corners: {}, peak: false, centersAgree: false };
    if (!state || !state.board || !state.board.subjects) return result;
    var subjects = state.board.subjects;

    var allCorners = true;
    for (var i = 0; i < SUITS.length; i++) {
      var suit = SUITS[i];
      var nx = nextSuit(suit);
      var key = baseKey(suit);
      var a = subjects[suit], b = subjects[nx];
      var matched = isPair(a && a.right, b && b.left);
      result.corners[key] = matched;
      if (!matched) allCorners = false;
    }

    var allCaps = true;
    for (var j = 0; j < SUITS.length; j++) {
      var s2 = SUITS[j];
      var n2 = nextSuit(s2);
      var a2 = subjects[s2], b2 = subjects[n2];
      if (!isPair(a2 && a2.center, b2 && b2.center)) allCaps = false;
    }

    var spades = subjects.spades, clubs = subjects.clubs;
    var hearts = subjects.hearts, diamonds = subjects.diamonds;
    var peakSC = isPair(spades && spades.center, clubs && clubs.center);
    var peakHD = isPair(hearts && hearts.center, diamonds && diamonds.center);
    var peakBoth = peakSC && peakHD;

    result.peak = peakBoth;
    result.centersAgree = allCaps && peakBoth;
    result._allCorners = allCorners; // internal convenience, harmless extra field
    return result;
  }

  function isPyramidComplete(state) {
    var c = coherence(state);
    var keys = Object.keys(c.corners || {});
    if (keys.length === 0) return false;
    for (var i = 0; i < keys.length; i++) {
      if (!c.corners[keys[i]]) return false;
    }
    return !!c.centersAgree;
  }

  // ---------------------------------------------------------------------
  // Ownership rule
  // ---------------------------------------------------------------------

  // Can `house` legally pivot this node? Mirrors the "touches at least one
  // of its own cards" rule from the spec, plus structural validity checks
  // (existing keys/positions/hand indices).
  function canPivot(state, house, loc, key, sub, handIndex) {
    if (!state || !state.houses || !state.board) return false;
    if (SUITS.indexOf(house) === -1) return false;

    if (loc === 'base' || loc === 'cap') {
      var ownKeys = [baseKey(house), baseKey(prevSuit(house))];
      if (ownKeys.indexOf(key) === -1) return false;
      return !!(state.gems && state.gems[loc] && Object.prototype.hasOwnProperty.call(state.gems[loc], key));
    }

    if (loc === 'peak') {
      var ownPeak = (house === 'spades' || house === 'clubs') ? PEAK_KEYS[0] : PEAK_KEYS[1];
      return key === ownPeak;
    }

    if (loc === 'court' || loc === 'royals') {
      if (key !== house) return false;
      return COURT_PIVOT_SUBS.indexOf(sub) !== -1;
    }

    if (loc === 'hands') {
      if (key !== house) return false;
      if (POSITIONS.indexOf(sub) === -1) return false;
      var hand = state.houses[house] && state.houses[house].hand;
      return Number.isInteger(handIndex) && Array.isArray(hand) && handIndex >= 0 && handIndex < hand.length;
    }

    return false;
  }

  // Executes the swap on state `s` (already a private clone). Returns true
  // on success. Never throws — malformed coordinates just fail quietly.
  function doPivot(s, loc, key, sub, handIndex) {
    try {
      if (loc === 'base' || loc === 'cap' || loc === 'peak') {
        var parts = key.split('-');
        var A = s.board.subjects[parts[0]];
        var B = s.board.subjects[parts[1]];
        if (!A || !B) return false;
        if (loc === 'base') {
          var tmp = A.right; A.right = B.left; B.left = tmp;
        } else {
          var tmp2 = A.center; A.center = B.center; B.center = tmp2;
        }
        return true;
      }
      if (loc === 'court') {
        var subs = sub.split('-');
        var S = s.board.subjects[key];
        if (!S) return false;
        var t = S[subs[0]]; S[subs[0]] = S[subs[1]]; S[subs[1]] = t;
        return true;
      }
      if (loc === 'royals') {
        var subs2 = sub.split('-');
        var R = s.board.royals[key];
        if (!R) return false;
        var t2 = R[subs2[0]]; R[subs2[0]] = R[subs2[1]]; R[subs2[1]] = t2;
        return true;
      }
      if (loc === 'hands') {
        var H = s.houses[key];
        var S2 = s.board.subjects[key];
        if (!H || !S2 || !Array.isArray(H.hand)) return false;
        if (handIndex < 0 || handIndex >= H.hand.length) return false;
        // Interpretation note: unlike the other pivot types, hand<->board is
        // treated as a one-way "play" rather than a symmetric swap. The
        // hand card is planted into the board position and the card that
        // was there is discarded from play; the vacated hand slot is
        // removed so the house can draw again. A true bidirectional swap
        // (put the old board card back into the same hand slot) would keep
        // every house's hand size monotonically non-decreasing once
        // non-empty, capping total possible draws across the whole game at
        // 4 houses x 3 = 12 against a 28-card deck — making the "deck
        // exhausted" end condition structurally unreachable. Planting +
        // discarding keeps hand slots reusable so the deck can actually run
        // out, matching the spec's "Other end condition".
        var playedCard = H.hand[handIndex];
        S2[sub] = playedCard;
        H.hand.splice(handIndex, 1);
        return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  }

  // ---------------------------------------------------------------------
  // Legal actions
  // ---------------------------------------------------------------------

  function legalActions(state, suit) {
    var actions = [];
    try {
      if (!state || state.phase === 'ended') return actions;
      if (SUITS.indexOf(suit) === -1) return actions;
      var H = state.houses && state.houses[suit];
      if (!H) return actions;

      // --- Claims (free unless a defended foreign court) ---
      var locs = ['base', 'cap', 'court', 'peak'];
      for (var li = 0; li < locs.length; li++) {
        var loc = locs[li];
        var bucket = (state.gems && state.gems[loc]) || {};
        var keys = Object.keys(bucket);
        for (var ki = 0; ki < keys.length; ki++) {
          var key = keys[ki];
          var node = bucket[key];
          if (!node || !node.gem) continue;
          var cost = 0;
          if (loc === 'court' && key !== suit) {
            var myChamp = state.board.royals[suit] && state.board.royals[suit].center;
            var theirChamp = state.board.royals[key] && state.board.royals[key].center;
            cost = doesCardTrump(myChamp, theirChamp) ? 0 : 1;
          }
          if (cost <= H.gems) {
            actions.push({ type: 'claim', loc: loc, key: key });
          }
        }
      }

      // --- Pivots + draw: every action is paid for with a gem ---
      if (H.gems >= 1) {
        var pv = prevSuit(suit);
        var ownBaseCapKeys = [baseKey(suit), baseKey(pv)];
        for (var oi = 0; oi < ownBaseCapKeys.length; oi++) {
          actions.push({ type: 'pivot', loc: 'base', key: ownBaseCapKeys[oi] });
          actions.push({ type: 'pivot', loc: 'cap', key: ownBaseCapKeys[oi] });
        }
        var ownPeak = (suit === 'spades' || suit === 'clubs') ? PEAK_KEYS[0] : PEAK_KEYS[1];
        actions.push({ type: 'pivot', loc: 'peak', key: ownPeak });

        for (var si = 0; si < COURT_PIVOT_SUBS.length; si++) {
          actions.push({ type: 'pivot', loc: 'court', key: suit, sub: COURT_PIVOT_SUBS[si] });
          actions.push({ type: 'pivot', loc: 'royals', key: suit, sub: COURT_PIVOT_SUBS[si] });
        }

        var hand = H.hand || [];
        for (var pi = 0; pi < POSITIONS.length; pi++) {
          for (var hi = 0; hi < hand.length; hi++) {
            actions.push({ type: 'pivot', loc: 'hands', key: suit, sub: POSITIONS[pi], handIndex: hi });
          }
        }

        if (state.deck && state.deck.length > 0 && hand.length < 3) {
          actions.push({ type: 'draw' });
        }
      }

      // --- Pass is always available (free) ---
      actions.push({ type: 'pass' });
    } catch (e) {
      return actions;
    }
    return actions;
  }

  // ---------------------------------------------------------------------
  // Turn management
  // ---------------------------------------------------------------------

  function determineWinner(state) {
    var rows = [];
    for (var i = 0; i < SUITS.length; i++) {
      var suit = SUITS[i];
      var h = state.houses[suit];
      rows.push({ suit: suit, score: (h && h.score) || 0, gems: (h && h.gems) || 0 });
    }
    var maxScore = Math.max.apply(null, rows.map(function (r) { return r.score; }));
    var top = rows.filter(function (r) { return r.score === maxScore; });
    if (top.length === 1) return top[0].suit;

    var maxGems = Math.max.apply(null, top.map(function (r) { return r.gems; }));
    top = top.filter(function (r) { return r.gems === maxGems; });
    if (top.length === 1) return top[0].suit;

    // Champion trump tie-break: first house (in turn order) whose Champion
    // trumps every other remaining tied house's Champion wins.
    for (var j = 0; j < SUITS.length; j++) {
      var suitJ = SUITS[j];
      var inTop = top.some(function (r) { return r.suit === suitJ; });
      if (!inTop) continue;
      var champ = state.board.royals[suitJ] && state.board.royals[suitJ].center;
      var beatsAll = true;
      for (var k = 0; k < top.length; k++) {
        if (top[k].suit === suitJ) continue;
        var otherChamp = state.board.royals[top[k].suit] && state.board.royals[top[k].suit].center;
        if (!doesCardTrump(champ, otherChamp)) { beatsAll = false; break; }
      }
      if (beatsAll) return suitJ;
    }
    // No clean trump winner: fall back to turn order among the tied houses.
    return top[0].suit;
  }

  // Advances currentHouse, resets actions/buys for the new house, and
  // handles the deck-exhaustion final-round countdown + game end.
  function endTurn(state) {
    var s = cloneState(state);
    if (!s || s.phase === 'ended') return s;

    var idx = SUITS.indexOf(s.currentHouse);
    if (idx === -1) idx = 0;
    s.turn = (s.turn || 0) + 1;

    // Deck ran dry during the house that's finishing now -> start the
    // final-round countdown (each of the 4 houses gets exactly one more
    // turn, including the trigger house).
    if (!s.finalRound && (!s.deck || s.deck.length === 0)) {
      s.finalRound = true;
      s._finalRoundTurnsLeft = 4;
    }

    var nextHouse = SUITS[(idx + 1) % 4];
    s.currentHouse = nextHouse;
    // Turn income: each house receives one gem at the start of its turn.
    // Gems are the sole action currency (pivots & draws each cost one).
    if (s.houses[nextHouse]) {
      s.houses[nextHouse].gems = (s.houses[nextHouse].gems || 0) + 1;
    }
    if (nextHouse === SUITS[0]) s.round = (s.round || 0) + 1;

    if (s.finalRound) {
      if (typeof s._finalRoundTurnsLeft !== 'number') s._finalRoundTurnsLeft = 4;
      s._finalRoundTurnsLeft -= 1;
      if (s._finalRoundTurnsLeft <= 0 && s.phase !== 'ended') {
        s.phase = 'ended';
        s.winner = determineWinner(s);
      }
    }

    // HARD CLOCK. The board is a closed 12-card system, so players can keep
    // breaking and re-making matches forever; the deck alone is not a reliable
    // clock (a house that never draws never drains it). Without this the game
    // runs unbounded. Round limit guarantees termination.
    if (s.phase !== 'ended' && (s.round || 0) >= (s.maxRounds || MAX_ROUNDS)) {
      s.phase = 'ended';
      s.winner = determineWinner(s);
    }

    return s;
  }

  // ---------------------------------------------------------------------
  // applyAction — the single mutation entry point
  // ---------------------------------------------------------------------

  function applyAction(state, action) {
    try {
      if (!state || typeof state !== 'object') return { state: state, events: [] };
      if (state.phase === 'ended') return { state: cloneState(state), events: [] };
      if (!action || typeof action.type !== 'string') return { state: cloneState(state), events: [] };

      var s = cloneState(state);
      var house = s.currentHouse;
      var H = s.houses && s.houses[house];
      if (!H) return { state: s, events: [] };
      var events = [];

      if (action.type === 'pass') {
        s = endTurn(s);
        events.push({ type: 'pass', house: house });
        events.push({ type: 'turnEnd', house: house });
        if (s.phase === 'ended' && s.winner) {
          events.push({ type: 'gameEnd', winner: s.winner });
        }
        return { state: s, events: events };
      }

      if (action.type === 'claim') {
        var loc = action.loc, key = action.key;
        if (!loc || !key || !s.gems[loc]) return { state: s, events: [] };
        var node = s.gems[loc][key];
        if (!node || !node.gem) return { state: s, events: [] }; // not armed -> illegal

        var cost = 0;
        var value = GEM_VALUES[loc] || 0;
        if (loc === 'court') {
          if (key === house) {
            value = Math.floor(GEM_VALUES.court * OWN_COURT_MULTIPLIER); // 37
          } else {
            var myChamp = s.board.royals[house] && s.board.royals[house].center;
            var theirChamp = s.board.royals[key] && s.board.royals[key].center;
            cost = doesCardTrump(myChamp, theirChamp) ? 0 : 1;
            value = GEM_VALUES.court; // 25, defended
          }
        }
        if (cost > H.gems) return { state: s, events: [] }; // can't afford defended claim

        // DIMINISHING RETURNS. A node can be re-armed by breaking and re-making
        // its match, so a naive flat value lets a player farm one node forever.
        // Each successive claim on the same node is worth less (full, 1/2, 1/3,
        // ... floored at a quarter), which pushes play toward new matches and
        // toward building the pyramid rather than grinding one corner.
        var priorClaims = node.claims || 0;
        var decay = Math.max(0.25, 1 / (1 + priorClaims));
        value = Math.max(1, Math.round(value * decay));
        node.claims = priorClaims + 1;

        node.gem = false;
        node.spent = true;
        H.gems -= cost;

        var recipient = house;
        events.push({ type: 'claim', house: house, loc: loc, key: key, value: value, cost: cost, claimIndex: priorClaims + 1 });

        if (loc === 'peak') {
          var claimantChamp = s.board.royals[house] && s.board.royals[house].center;
          for (var oi = 0; oi < SUITS.length; oi++) {
            var other = SUITS[oi];
            if (other === house) continue;
            var otherChamp = s.board.royals[other] && s.board.royals[other].center;
            if (doesCardTrump(otherChamp, claimantChamp)) {
              recipient = other;
              events.push({ type: 'duel', from: house, to: other, loc: loc, key: key });
              break;
            }
          }
        }

        // A node yields a GEM only the first time it is harvested. Re-claims
        // (after breaking and re-forming the match) still score — with the
        // diminishing value above — but give no gem. Without this, claim(+1)
        // and pivot(-1) net to zero and a house could act forever within one
        // turn (the turn would never end, so the game never terminates).
        var gemGain = (priorClaims === 0) ? 1 : 0;
        s.houses[recipient].gems += gemGain;
        s.houses[recipient].score += value;
        // fall through to gem re-evaluation / pyramid check below
      } else if (action.type === 'pivot') {
        if (H.gems < 1) return { state: s, events: [] };
        if (!canPivot(s, house, action.loc, action.key, action.sub, action.handIndex)) {
          return { state: s, events: [] };
        }
        if (!doPivot(s, action.loc, action.key, action.sub, action.handIndex)) {
          return { state: s, events: [] };
        }
        H.gems -= 1;
        events.push({ type: 'pivot', house: house, loc: action.loc, key: action.key, sub: action.sub, handIndex: action.handIndex });
      } else if (action.type === 'draw') {
        if (H.gems < 1) return { state: s, events: [] };
        if (!Array.isArray(H.hand) || H.hand.length >= 3) return { state: s, events: [] };
        if (!Array.isArray(s.deck) || s.deck.length === 0) return { state: s, events: [] };
        var card = s.deck.shift();
        H.hand.push(card);
        H.gems -= 1;
        events.push({ type: 'draw', house: house, card: card });
      } else {
        return { state: s, events: [] }; // unknown action type -> no-op
      }

      // Re-evaluate gem arming after any board/state-changing action.
      var evalResult = evaluateGemsInternal(s);
      s = evalResult.state;
      for (var na = 0; na < evalResult.newlyArmed.length; na++) {
        var arm = evalResult.newlyArmed[na];
        events.push({ type: 'gemArmed', loc: arm.loc, key: arm.key });
      }

      // Check THE PYRAMID completion (only pivots can actually trigger this,
      // since claim/draw/buy never change board cards — checked generically
      // for robustness).
      if (!s.pyramidComplete && isPyramidComplete(s)) {
        s.pyramidComplete = true;
        s.houses[house].score += 150;
        s.phase = 'ended';
        s.winner = house;
        events.push({ type: 'pyramid', house: house });
        events.push({ type: 'gameEnd', winner: house });
      }

      return { state: s, events: events };
    } catch (e) {
      return { state: cloneState(state), events: [] };
    }
  }

  // ---------------------------------------------------------------------
  // Export
  // ---------------------------------------------------------------------

  root.PYR = root.PYR || {};
  root.PYR.Engine = {
    SUITS: SUITS,
    POSITIONS: POSITIONS,
    RANKS: RANKS,
    GEM_VALUES: GEM_VALUES,

    nextSuit: nextSuit,
    oppositeSuit: oppositeSuit,

    isPair: isPair,
    isFlush: isFlush,
    doesCardTrump: doesCardTrump,

    createGame: createGame,
    cloneState: cloneState,
    legalActions: legalActions,
    applyAction: applyAction,
    evaluateGems: evaluateGems,
    isPyramidComplete: isPyramidComplete,
    coherence: coherence,
    endTurn: endTurn
  };

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
