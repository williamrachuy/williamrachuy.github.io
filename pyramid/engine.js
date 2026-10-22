/*
 * PYRAMID: the rules engine.
 *
 * Plain script (not an ES module) so the game also runs from file://. It
 * attaches to window.PYR.Engine (or globalThis in Node, for the tests). Pure:
 * no DOM, and every function returns a new state rather than mutating its
 * input. All randomness comes from a seeded PRNG, so a seed replays a game.
 *
 * The rules are written down in RULES.md; this file is their single source
 * of truth in code. Vocabulary:
 *
 *   seat     S, E, N, W. Turn order is S -> E -> N -> W. The human is S.
 *   court    a seat's six cards: three subjects (A-10) above three royals
 *            (J, Q, K), each row in positions L, C, R as the owner sees them.
 *   lane     a pivot node between two courts. Four base corners (one
 *            court's R subject and the next court's L subject), four ridges
 *            (adjacent courts' C subjects), and two peaks (opposite courts'
 *            C subjects). A lane is "paired" when its two subjects match.
 *   control  the royal under each end of a lane is compared; the winner's
 *            seat controls the lane. Equal-rank, same-colour royals are a
 *            stalemate and nobody controls it.
 *   gem      the currency and the score. Every action costs one gem; each
 *            turn begins with one free action.
 */
(function (root) {
  'use strict';

  var SEATS = ['S', 'E', 'N', 'W'];
  var SUIT_OF = { S: 'spades', E: 'hearts', N: 'clubs', W: 'diamonds' };
  var SEAT_OF = { spades: 'S', hearts: 'E', clubs: 'N', diamonds: 'W' };
  var SUITS = ['spades', 'hearts', 'clubs', 'diamonds'];
  var POS = ['L', 'C', 'R'];
  var SUBJECT_RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', 'X'];
  // Royals are dealt to the same places in every court, as in the prototype.
  var ROYAL_DEAL = { L: 'J', C: 'K', R: 'Q' };

  // Cyclic trumps. Ranks: K > Q > J > K. Suits: spades > hearts > clubs >
  // diamonds > spades. Same-colour suits (spades/clubs, hearts/diamonds)
  // never trump each other.
  var RANK_BEATS = { K: 'Q', Q: 'J', J: 'K' };
  var SUIT_BEATS = { spades: 'hearts', hearts: 'clubs', clubs: 'diamonds', diamonds: 'spades' };

  // House options. freeGemBanks: when true the turn's free gem goes into
  // the purse (and so counts as score); when false it is a free action that
  // is lost if unused. capstone: gems for the player whose action closes the
  // pyramid. See RULES.md.
  var DEFAULTS = { maxRounds: 30, freeGemBanks: false, handLimit: 3, capstone: 5 };

  // The ten lanes. `a` and `b` are the subjects at each end; the royal in
  // the same position under each subject decides control.
  var LANES = [
    { id: 'cSE', kind: 'corner', ray: 'SE', a: { seat: 'S', pos: 'R' }, b: { seat: 'E', pos: 'L' } },
    { id: 'cEN', kind: 'corner', ray: 'NE', a: { seat: 'E', pos: 'R' }, b: { seat: 'N', pos: 'L' } },
    { id: 'cNW', kind: 'corner', ray: 'NW', a: { seat: 'N', pos: 'R' }, b: { seat: 'W', pos: 'L' } },
    { id: 'cWS', kind: 'corner', ray: 'SW', a: { seat: 'W', pos: 'R' }, b: { seat: 'S', pos: 'L' } },
    { id: 'rSE', kind: 'ridge', a: { seat: 'S', pos: 'C' }, b: { seat: 'E', pos: 'C' } },
    { id: 'rEN', kind: 'ridge', a: { seat: 'E', pos: 'C' }, b: { seat: 'N', pos: 'C' } },
    { id: 'rNW', kind: 'ridge', a: { seat: 'N', pos: 'C' }, b: { seat: 'W', pos: 'C' } },
    { id: 'rWS', kind: 'ridge', a: { seat: 'W', pos: 'C' }, b: { seat: 'S', pos: 'C' } },
    { id: 'pSN', kind: 'peak', a: { seat: 'S', pos: 'C' }, b: { seat: 'N', pos: 'C' } },
    { id: 'pEW', kind: 'peak', a: { seat: 'E', pos: 'C' }, b: { seat: 'W', pos: 'C' } }
  ];
  var LANE_BY_ID = {};
  LANES.forEach(function (l) { LANE_BY_ID[l.id] = l; });

  var COURT_PAIRS = [['L', 'C'], ['C', 'R'], ['L', 'R']];

  // ---------------------------------------------------------------------
  // Cards
  // ---------------------------------------------------------------------

  function card(rank, suit) {
    return { r: rank, s: suit, id: rank + suit.charAt(0) };
  }

  // Face value: A is 1, X is 10.
  function value(c) {
    if (!c) return 0;
    if (c.r === 'A') return 1;
    if (c.r === 'X') return 10;
    return parseInt(c.r, 10) || 0;
  }

  // Aces are wild: an ace pairs with anything, including another ace.
  function isPair(a, b) {
    if (!a || !b) return false;
    return a.r === b.r || a.r === 'A' || b.r === 'A';
  }

  // 1 if royal a trumps royal b, -1 if b trumps a, 0 for a stalemate.
  function trump(a, b) {
    if (!a || !b) return 0;
    if (a.r !== b.r) {
      if (RANK_BEATS[a.r] === b.r) return 1;
      if (RANK_BEATS[b.r] === a.r) return -1;
      return 0;
    }
    if (SUIT_BEATS[a.s] === b.s) return 1;
    if (SUIT_BEATS[b.s] === a.s) return -1;
    return 0;
  }

  // ---------------------------------------------------------------------
  // PRNG
  // ---------------------------------------------------------------------

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hashSeed(x) {
    if (typeof x === 'number') return x >>> 0;
    var s = String(x), h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  function shuffle(arr, rng) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function clone(s) { return JSON.parse(JSON.stringify(s)); }

  // ---------------------------------------------------------------------
  // Setup
  // ---------------------------------------------------------------------

  function nextSeat(seat) { return SEATS[(SEATS.indexOf(seat) + 1) % 4]; }
  function oppositeSeat(seat) { return SEATS[(SEATS.indexOf(seat) + 2) % 4]; }

  function newGame(opts) {
    opts = opts || {};
    var seed = opts.seed == null ? ((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0) : hashSeed(opts.seed);
    var rng = mulberry32(seed);
    var rules = {};
    Object.keys(DEFAULTS).forEach(function (k) { rules[k] = opts[k] == null ? DEFAULTS[k] : opts[k]; });

    var deck = [];
    SUITS.forEach(function (s) { SUBJECT_RANKS.forEach(function (r) { deck.push(card(r, s)); }); });
    deck = shuffle(deck, rng);

    var courts = {}, players = {};
    var names = opts.names || {};
    SEATS.forEach(function (seat) {
      var suit = SUIT_OF[seat];
      courts[seat] = { subjects: {}, royals: {} };
      POS.forEach(function (p) {
        courts[seat].subjects[p] = deck.shift();
        courts[seat].royals[p] = card(ROYAL_DEAL[p], suit);
      });
      players[seat] = {
        seat: seat,
        suit: suit,
        name: names[seat] || (seat === 'S' ? 'You' : suit.charAt(0).toUpperCase() + suit.slice(1)),
        human: seat === (opts.humanSeat || 'S'),
        gems: 0,
        hand: []
      };
    });

    var state = {
      seed: seed,
      rules: rules,
      turn: 1,
      round: 1,
      current: SEATS[0],
      free: 1,
      deck: deck,
      courts: courts,
      players: players,
      lanes: {},
      flush: {},
      phase: 'play',
      winners: [],
      endReason: null
    };
    if (rules.freeGemBanks) { state.free = 0; players[SEATS[0]].gems += 1; }
    // Pairs and flushes already on the table at the deal are recorded but do
    // not spawn gems: gems come from pairs the players make.
    LANES.forEach(function (l) {
      state.lanes[l.id] = { paired: lanePaired(state, l), gem: false, spawnTurn: 0 };
    });
    SEATS.forEach(function (seat) { state.flush[seat] = { on: isFlush(state, seat), spawnTurn: 0 }; });
    state.apex = { on: apexMatched(state), gem: false, spawnTurn: 0 };
    return state;
  }

  // ---------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------

  function subjectAt(state, end) { return state.courts[end.seat].subjects[end.pos]; }
  function royalAt(state, end) { return state.courts[end.seat].royals[end.pos]; }

  function lanePaired(state, lane) {
    return isPair(subjectAt(state, lane.a), subjectAt(state, lane.b));
  }

  function isFlush(state, seat) {
    var sub = state.courts[seat].subjects, suit = SUIT_OF[seat];
    return POS.every(function (p) { return sub[p] && sub[p].s === suit; });
  }

  // The seat that controls a lane, or null on a stalemate.
  function controller(state, laneOrId) {
    var lane = typeof laneOrId === 'string' ? LANE_BY_ID[laneOrId] : laneOrId;
    if (!lane) return null;
    var t = trump(royalAt(state, lane.a), royalAt(state, lane.b));
    if (t > 0) return lane.a.seat;
    if (t < 0) return lane.b.seat;
    return null;
  }

  // The apex: one gem node shared by all four courts. It forms a gem when
  // all four centre subjects match (the six centre lanes all paired, so the
  // four apexes are one point). The two peaks are pivots only; they make no
  // gems of their own.
  function apexMatched(state) {
    return LANES.every(function (l) { return l.kind === 'corner' || lanePaired(state, l); });
  }

  // Who controls the apex: the seat whose centre royal trumps all three
  // others. Usually nobody, until someone rearranges their royals.
  function apexController(state) {
    for (var i = 0; i < SEATS.length; i++) {
      var me = state.courts[SEATS[i]].royals.C, all = true;
      for (var j = 0; j < SEATS.length; j++) {
        if (i !== j && trump(me, state.courts[SEATS[j]].royals.C) <= 0) { all = false; break; }
      }
      if (all) return SEATS[i];
    }
    return null;
  }

  function lanesOf(seat) {
    return LANES.filter(function (l) { return l.a.seat === seat || l.b.seat === seat; });
  }

  function pairedCount(state) {
    var n = 0;
    LANES.forEach(function (l) { if (state.lanes[l.id].paired) n++; });
    return n;
  }

  function canAfford(state, seat) {
    return state.free > 0 || state.players[seat].gems > 0;
  }

  // Why a lane swap is or isn't open to `seat`. Returns
  // { ok, toll: seat|null, controller, reason }.
  function laneAccess(state, laneId, seat) {
    var lane = LANE_BY_ID[laneId];
    if (!lane) return { ok: false, reason: 'No such lane.' };
    var ctrl = controller(state, lane);
    var party = lane.a.seat === seat || lane.b.seat === seat;
    if (!ctrl) {
      var ra = royalAt(state, lane.a), rb = royalAt(state, lane.b);
      return { ok: false, controller: null, party: party, reason: 'Stalemate: ' + rankName(ra.r) + ' of ' + ra.s + ' meets ' + rankName(rb.r) + ' of ' + rb.s + '. Nobody controls this lane.' };
    }
    if (party && ctrl !== seat) {
      return { ok: false, controller: ctrl, party: true, reason: 'Your royal is trumped here. ' + state.players[ctrl].name + ' controls this lane.' };
    }
    if (!canAfford(state, seat)) return { ok: false, controller: ctrl, party: party, reason: 'You have no gems to spend.' };
    return { ok: true, controller: ctrl, party: party, toll: party ? null : ctrl };
  }

  function rankName(r) {
    return { A: 'Ace', X: '10', J: 'Jack', Q: 'Queen', K: 'King' }[r] || r;
  }

  function legalActions(state, seat) {
    seat = seat || state.current;
    var out = [];
    if (state.phase !== 'play' || seat !== state.current) return out;
    var afford = canAfford(state, seat);
    if (afford) {
      COURT_PAIRS.forEach(function (pr) {
        out.push({ type: 'court', a: pr[0], b: pr[1] });
        out.push({ type: 'royal', a: pr[0], b: pr[1] });
      });
      LANES.forEach(function (l) {
        var acc = laneAccess(state, l.id, seat);
        if (acc.ok) out.push({ type: 'lane', lane: l.id, toll: acc.toll || null });
      });
      var hand = state.players[seat].hand;
      for (var i = 0; i < hand.length; i++) {
        POS.forEach(function (p) { out.push({ type: 'play', hand: i, pos: p }); });
      }
      if (hand.length < state.rules.handLimit && state.deck.length > 0) out.push({ type: 'draw' });
    }
    out.push({ type: 'pass' });
    return out;
  }

  // Why an action is illegal (or null when it is legal). The UI shows this.
  function whyIllegal(state, action) {
    if (state.phase !== 'play') return 'The game is over.';
    if (!action) return 'No action.';
    var seat = state.current;
    if (action.type === 'pass') return null;
    if (!canAfford(state, seat)) return 'You have no gems to spend.';
    var P = state.players[seat];
    switch (action.type) {
      case 'court':
      case 'royal':
        if (POS.indexOf(action.a) < 0 || POS.indexOf(action.b) < 0 || action.a === action.b) return 'Pick two different positions.';
        return null;
      case 'lane':
        var acc = laneAccess(state, action.lane, seat);
        return acc.ok ? null : acc.reason;
      case 'play':
        if (!(action.hand >= 0 && action.hand < P.hand.length)) return 'No such card in hand.';
        if (POS.indexOf(action.pos) < 0) return 'Pick a subject to replace.';
        return null;
      case 'draw':
        if (state.deck.length === 0) return 'The deck is empty.';
        if (P.hand.length >= state.rules.handLimit) return 'Your hand is full (' + state.rules.handLimit + ').';
        return null;
    }
    return 'Unknown action.';
  }

  // ---------------------------------------------------------------------
  // Applying actions
  // ---------------------------------------------------------------------

  // Pay one gem for an action: the free action first, then the purse. A
  // toll sends the gem to the lane's controller instead of the bank.
  function pay(s, seat, toll, events) {
    var usedFree = false;
    if (s.free > 0) { s.free = 0; usedFree = true; }
    else s.players[seat].gems -= 1;
    if (toll) s.players[toll].gems += 1;
    events.push({ type: 'pay', seat: seat, free: usedFree, to: toll || null });
  }

  // After the board changes: spawn gems on newly paired lanes, pay court
  // flushes, hand sitting gems to whoever controls their lane, and check
  // for the completed pyramid.
  function settle(s, events) {
    LANES.forEach(function (l) {
      var st = s.lanes[l.id];
      var now = lanePaired(s, l);
      if (now && !st.paired) {
        events.push({ type: 'pair', lane: l.id });
        // One gem per lane per turn, so a pair can't be farmed by breaking
        // and re-making it within a turn. Peaks make no gems: the apex does.
        if (l.kind !== 'peak' && !st.gem && st.spawnTurn !== s.turn) {
          st.gem = true;
          st.spawnTurn = s.turn;
          events.push({ type: 'spawn', lane: l.id });
        }
      } else if (!now && st.paired) {
        events.push({ type: 'unpair', lane: l.id });
      }
      st.paired = now;
    });

    var ax = s.apex, axNow = apexMatched(s);
    if (axNow && !ax.on && !ax.gem && ax.spawnTurn !== s.turn) {
      ax.gem = true;
      ax.spawnTurn = s.turn;
      events.push({ type: 'spawn', lane: 'apex' });
    }
    ax.on = axNow;

    SEATS.forEach(function (seat) {
      var f = s.flush[seat];
      var now = isFlush(s, seat);
      if (now && !f.on && f.spawnTurn !== s.turn) {
        f.spawnTurn = s.turn;
        s.players[seat].gems += 1;
        events.push({ type: 'flush', seat: seat });
      }
      f.on = now;
    });

    collect(s, events);

    if (pairedCount(s) === LANES.length) {
      // The capstone: whoever makes the final pair is paid for closing.
      if (s.rules.capstone) {
        s.players[s.current].gems += s.rules.capstone;
        events.push({ type: 'capstone', seat: s.current, gems: s.rules.capstone });
      }
      endGame(s, 'pyramid', events);
    }
  }

  // Gems are collected automatically the moment their lane has a controller.
  function collect(s, events) {
    LANES.forEach(function (l) {
      var st = s.lanes[l.id];
      if (!st.gem) return;
      var c = controller(s, l);
      if (!c) return;
      st.gem = false;
      s.players[c].gems += 1;
      events.push({ type: 'collect', lane: l.id, seat: c });
    });
    if (s.apex.gem) {
      var a = apexController(s);
      if (a) {
        s.apex.gem = false;
        s.players[a].gems += 1;
        events.push({ type: 'collect', lane: 'apex', seat: a });
      }
    }
  }

  function endGame(s, reason, events) {
    s.phase = 'over';
    s.endReason = reason;
    var best = -Infinity;
    SEATS.forEach(function (seat) { best = Math.max(best, s.players[seat].gems); });
    s.winners = SEATS.filter(function (seat) { return s.players[seat].gems === best; });
    events.push({ type: 'end', reason: reason, winners: s.winners.slice() });
  }

  function swap(obj, a, b) { var t = obj[a]; obj[a] = obj[b]; obj[b] = t; }

  function apply(state, action) {
    var why = whyIllegal(state, action);
    if (why) return { state: state, events: [], error: why };
    var s = clone(state);
    var seat = s.current;
    var P = s.players[seat];
    var court = s.courts[seat];
    var events = [];

    switch (action.type) {
      case 'pass':
        events.push({ type: 'pass', seat: seat });
        endTurn(s, events);
        return { state: s, events: events };

      case 'court':
        pay(s, seat, null, events);
        events.push({ type: 'swap', kind: 'court', seat: seat, cards: [court.subjects[action.a].id, court.subjects[action.b].id], a: { seat: seat, pos: action.a }, b: { seat: seat, pos: action.b } });
        swap(court.subjects, action.a, action.b);
        break;

      case 'royal':
        pay(s, seat, null, events);
        events.push({ type: 'swap', kind: 'royal', seat: seat, cards: [court.royals[action.a].id, court.royals[action.b].id], a: { seat: seat, pos: action.a }, b: { seat: seat, pos: action.b } });
        swap(court.royals, action.a, action.b);
        break;

      case 'lane':
        var lane = LANE_BY_ID[action.lane];
        var acc = laneAccess(s, action.lane, seat);
        pay(s, seat, acc.toll, events);
        if (acc.toll) events.push({ type: 'toll', seat: seat, to: acc.toll, lane: lane.id });
        var A = s.courts[lane.a.seat].subjects, B = s.courts[lane.b.seat].subjects;
        events.push({ type: 'swap', kind: 'lane', seat: seat, lane: lane.id, cards: [A[lane.a.pos].id, B[lane.b.pos].id], a: lane.a, b: lane.b });
        var t = A[lane.a.pos]; A[lane.a.pos] = B[lane.b.pos]; B[lane.b.pos] = t;
        break;

      case 'play':
        pay(s, seat, null, events);
        var played = P.hand.splice(action.hand, 1)[0];
        var displaced = court.subjects[action.pos];
        court.subjects[action.pos] = played;
        // The displaced subject goes to the bottom of the deck.
        s.deck.push(displaced);
        events.push({ type: 'play', seat: seat, pos: action.pos, card: played.id, displaced: displaced.id });
        break;

      case 'draw':
        pay(s, seat, null, events);
        var c = s.deck.shift();
        P.hand.push(c);
        events.push({ type: 'draw', seat: seat, card: c.id });
        break;
    }

    settle(s, events);
    return { state: s, events: events };
  }

  function endTurn(s, events) {
    if (s.phase !== 'play') return;
    s.free = 0;
    var next = nextSeat(s.current);
    if (next === SEATS[0]) {
      s.round += 1;
      if (s.rules.maxRounds && s.round > s.rules.maxRounds) {
        s.round = s.rules.maxRounds;
        endGame(s, 'clock', events);
        return;
      }
    }
    s.turn += 1;
    s.current = next;
    if (s.rules.freeGemBanks) s.players[next].gems += 1;
    else s.free = 1;
    events.push({ type: 'turn', seat: next, round: s.round });
  }

  // ---------------------------------------------------------------------
  // Geometry: each court is a triangular face with a vertex on each of two
  // ground rays (its L and R subjects) and one on the vertical axis (its C
  // subject). Paired lanes make vertices coincide; when all ten are paired
  // the faces close into a pyramid over a quadrilateral base.
  // ---------------------------------------------------------------------

  // The value a subject takes as a vertex. An ace takes its partner's value
  // across a paired lane; two aces make 1.
  function vertexValue(state, seat, pos) {
    var c = state.courts[seat].subjects[pos];
    if (!c) return 0;
    if (c.r !== 'A') return value(c);
    var partners = LANES.filter(function (l) {
      return (l.a.seat === seat && l.a.pos === pos) || (l.b.seat === seat && l.b.pos === pos);
    });
    // Prefer the opposite court across the peak, then the ridges: any
    // non-ace partner it is paired with.
    var votes = {};
    partners.forEach(function (l) {
      var other = (l.a.seat === seat && l.a.pos === pos) ? l.b : l.a;
      var oc = subjectAt(state, other);
      if (oc && oc.r !== 'A') votes[value(oc)] = (votes[value(oc)] || 0) + 1;
    });
    var best = 1, bestN = 0;
    Object.keys(votes).forEach(function (v) {
      if (votes[v] > bestN) { bestN = votes[v]; best = +v; }
    });
    return best;
  }

  function geometry(state) {
    var faces = {};
    SEATS.forEach(function (seat) {
      faces[seat] = {
        L: vertexValue(state, seat, 'L'),
        C: vertexValue(state, seat, 'C'),
        R: vertexValue(state, seat, 'R')
      };
    });
    var paired = {};
    LANES.forEach(function (l) { paired[l.id] = !!state.lanes[l.id].paired; });
    var corners = LANES.filter(function (l) { return l.kind === 'corner'; }).map(function (l) {
      return { id: l.id, ray: l.ray, paired: paired[l.id], a: { seat: l.a.seat, v: faces[l.a.seat][l.a.pos] }, b: { seat: l.b.seat, v: faces[l.b.seat][l.b.pos] } };
    });
    var apexUnified = LANES.every(function (l) { return l.kind === 'corner' || paired[l.id]; });
    var count = pairedCount(state);
    return {
      faces: faces,
      corners: corners,
      paired: paired,
      apexUnified: apexUnified,
      baseClosed: corners.every(function (c) { return c.paired; }),
      complete: count === LANES.length,
      progress: count / LANES.length,
      pairedCount: count
    };
  }

  var Engine = {
    SEATS: SEATS,
    SUITS: SUITS,
    SUIT_OF: SUIT_OF,
    SEAT_OF: SEAT_OF,
    POS: POS,
    LANES: LANES,
    LANE_BY_ID: LANE_BY_ID,
    COURT_PAIRS: COURT_PAIRS,
    DEFAULTS: DEFAULTS,
    value: value,
    isPair: isPair,
    trump: trump,
    rankName: rankName,
    nextSeat: nextSeat,
    oppositeSeat: oppositeSeat,
    newGame: newGame,
    clone: clone,
    controller: controller,
    laneAccess: laneAccess,
    lanesOf: lanesOf,
    isFlush: isFlush,
    pairedCount: pairedCount,
    apexMatched: apexMatched,
    apexController: apexController,
    canAfford: canAfford,
    legalActions: legalActions,
    whyIllegal: whyIllegal,
    apply: apply,
    geometry: geometry,
    vertexValue: vertexValue,
    mulberry32: mulberry32
  };

  root.PYR = root.PYR || {};
  root.PYR.Engine = Engine;
  if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
})(typeof window !== 'undefined' ? window : globalThis);
