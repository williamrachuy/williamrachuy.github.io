/*
 * PYRAMID: AI houses.
 *
 * Plain script; attaches to PYR.AI. Uses only the public engine. Each AI
 * scores the position after every legal action (and, on the harder levels,
 * the best follow-up), adds a little noise by difficulty, and plays the best
 * action until nothing beats ending its turn. It never peeks at the deck: a
 * draw is valued by a flat estimate, not by the card it would turn up.
 */
(function (root) {
  'use strict';

  var PYR = root.PYR = root.PYR || {};
  var E = PYR.Engine;

  var LEVELS = {
    easy:   { noise: 6.0, depth: 1, label: 'Easy',   sub: 'loose and generous' },
    normal: { noise: 2.5, depth: 1, label: 'Normal', sub: 'plays its own game' },
    hard:   { noise: 0.8, depth: 2, label: 'Hard',   sub: 'plans two moves' },
    master: { noise: 0.1, depth: 2, label: 'Master', sub: 'misses very little' }
  };

  // Personalities weight the same evaluation differently.
  //   gem:    value of a gem in hand (score)
  //   deny:   how much rivals' gems hurt
  //   build:  appetite for pairing lanes (scaled by whether it is winning)
  //   rule:   value of controlling lanes
  //   thrift: extra reluctance to spend banked gems
  var ARCHETYPES = [
    { key: 'architect', title: 'the Architect', flavor: 'pairs lanes and wants the pyramid closed',
      w: { gem: 10, deny: 3.0, build: 3.0, rule: 0.8, thrift: 0.5 } },
    { key: 'hoarder', title: 'the Hoarder', flavor: 'counts every gem twice before spending one',
      w: { gem: 12, deny: 2.5, build: 1.4, rule: 0.6, thrift: 3.0 } },
    { key: 'usurper', title: 'the Usurper', flavor: 'shuffles royals to seize your lanes',
      w: { gem: 10, deny: 5.0, build: 1.2, rule: 2.2, thrift: 1.0 } }
  ];

  function persona(index) {
    return ARCHETYPES[((index % ARCHETYPES.length) + ARCHETYPES.length) % ARCHETYPES.length];
  }

  // Roughly how many subjects still have to change before the pyramid
  // closes: each unpaired base corner, plus every centre that doesn't share
  // the most common centre rank (aces fit anywhere). 0 means closed.
  function distance(s) {
    var d = 0, counts = {}, aces = 0, top = 0;
    E.LANES.forEach(function (l) { if (l.kind === 'corner' && !s.lanes[l.id].paired) d++; });
    E.SEATS.forEach(function (seat) {
      var c = s.courts[seat].subjects.C;
      if (c.r === 'A') aces++;
      else { counts[c.r] = (counts[c.r] || 0) + 1; top = Math.max(top, counts[c.r]); }
    });
    return d + (4 - aces - top);
  }

  function evaluate(s, seat, w) {
    var me = s.players[seat].gems;
    var others = E.SEATS.filter(function (x) { return x !== seat; }).map(function (x) { return s.players[x].gems; });
    var maxOther = Math.max.apply(null, others);
    var sumOther = others.reduce(function (a, b) { return a + b; }, 0);

    if (s.phase === 'over') {
      var won = s.winners.indexOf(seat) >= 0;
      if (won) return 1000 / s.winners.length + me;
      return -500 + me - maxOther;
    }

    var v = w.gem * me - w.deny * (sumOther / 3 + maxOther) / 2;

    // Closing the pyramid ends the game: good when ahead, bad when behind.
    // The capstone pays whoever closes, so a player a few gems behind can
    // still want the pyramid closed (on its own move).
    var lead = me - maxOther + (s.rules.capstone || 0);
    var close = 8 - distance(s);
    var bias = lead > 0 ? 1 + Math.min(lead, 6) / 3 : (lead === 0 ? 0.3 : -0.35);
    v += w.build * bias * close * (1 + close / 4);

    // Lanes it controls (and stalemated gems it could reach).
    E.LANES.forEach(function (l) {
      var c = E.controller(s, l);
      if (c === seat) v += w.rule * (l.kind === 'peak' ? 1.4 : 1);
      else if (c && (l.a.seat === seat || l.b.seat === seat)) v -= w.rule * 0.6;
      if (s.lanes[l.id].gem && !c && (l.a.seat === seat || l.b.seat === seat)) v += 2;
    });

    // Toward a flush of its own suit.
    var suit = E.SUIT_OF[seat], own = 0;
    E.POS.forEach(function (p) { if (s.courts[seat].subjects[p].s === suit) own++; });
    if (own >= 2) v += own === 2 ? 2 : 0;

    return v;
  }

  function spendPenalty(before, after, seat, w) {
    // Spending a banked gem (not the free action) is already in the gem term;
    // thrift adds a personal reluctance on top.
    var spent = before.players[seat].gems > after.players[seat].gems && before.free === 0;
    return spent ? w.thrift : 0;
  }

  function noise(rng, amp) {
    return (rng() + rng() + rng() - 1.5) * amp;
  }

  function candidates(s, seat) {
    return E.legalActions(s, seat).filter(function (a) { return a.type !== 'pass'; });
  }

  // Draws are valued without looking at the deck.
  function drawValue(s, seat, w) {
    var hand = s.players[seat].hand.length;
    var base = evaluate(s, seat, w);
    var cost = s.free > 0 ? 0 : w.gem;
    return base - cost + (hand === 0 ? 4 : 1.5);
  }

  function valueOf(s, a, seat, w, depth) {
    if (a.type === 'draw') return drawValue(s, seat, w);
    var r = E.apply(s, a);
    if (r.error) return -Infinity;
    var v = evaluate(r.state, seat, w) - spendPenalty(s, r.state, seat, w);
    if (depth > 1 && r.state.phase === 'play' && r.state.current === seat && E.canAfford(r.state, seat)) {
      var best = v;
      var next = candidates(r.state, seat);
      for (var i = 0; i < next.length; i++) {
        if (next[i].type === 'draw') continue;
        var r2 = E.apply(r.state, next[i]);
        if (r2.error) continue;
        var v2 = evaluate(r2.state, seat, w) - spendPenalty(r.state, r2.state, seat, w) - spendPenalty(s, r.state, seat, w);
        if (v2 > best) best = v2;
      }
      // A plan is worth a little less than a sure thing.
      v = v + (best - v) * 0.85;
    }
    return v;
  }

  // Choose the next action for the current seat. `ctx` carries the persona,
  // level, rng and how many actions it has already taken this turn.
  function choose(s, ctx) {
    var seat = s.current;
    var w = ctx.persona.w;
    var lvl = LEVELS[ctx.level] || LEVELS.normal;
    var rng = ctx.rng || Math.random;
    if (ctx.actionsThisTurn >= 8) return { type: 'pass' };

    var base = evaluate(s, seat, w);
    var acts = candidates(s, seat);
    var best = null, bestV = -Infinity;
    for (var i = 0; i < acts.length; i++) {
      var v = valueOf(s, acts[i], seat, w, lvl.depth) + noise(rng, lvl.noise);
      if (v > bestV) { best = acts[i]; bestV = v; }
    }
    // With the free action in hand, passing throws it away: any action that
    // doesn't hurt is worth taking. Spending a banked gem needs a real gain.
    var bar = s.free > 0 ? -0.5 : 0.75;
    if (best && bestV > base + bar) return best;
    return { type: 'pass' };
  }

  PYR.AI = {
    LEVELS: LEVELS,
    ARCHETYPES: ARCHETYPES,
    persona: persona,
    evaluate: evaluate,
    choose: choose
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = PYR.AI;
})(typeof window !== 'undefined' ? window : globalThis);
