// PYR.AI — heuristic AI opponents for Pyramid.
// Plain script (no ES modules). Attaches to window.PYR.AI.
// Depends only on the PYR.Engine contract described in the spec (section 4).

(function () {
  'use strict';

  window.PYR = window.PYR || {};

  // ---------------------------------------------------------------------
  // Personality archetypes.
  //
  // Bounds are a FLOOR on competence: every roll, at any archetype bias and
  // any jitter, stays inside these ranges, which are themselves chosen so
  // that even the extremes still play sanely (see chooseAction below, which
  // always claims free gems and never passes while a +EV action exists).
  // ---------------------------------------------------------------------
  var BOUNDS = {
    greed: [0.8, 1.3],
    builder: [0.4, 1.2],
    disruptor: [0.2, 1.0],
    tempo: [0.1, 0.6],
    patience: [0.2, 0.8]
  };

  var DIFF = {
    easy: { noise: 0.35, lookahead: 1 },
    normal: { noise: 0.18, lookahead: 1 },
    hard: { noise: 0.08, lookahead: 2 },
    master: { noise: 0.02, lookahead: 2 }
  };

  // Three distinct archetype centers, spread well apart inside BOUNDS, so
  // that jitter (kept small relative to the spread) can never make two
  // archetypes collide. Rotated deterministically across successive calls
  // (see makePersonality) so that any 3 consecutive AI personalities
  // created for one game are guaranteed to be 3 different archetypes.
  var ARCHETYPES = [
    {
      name: 'the Architect',
      flavor: 'builds toward the peak',
      bias: { greed: 0.9, builder: 1.15, disruptor: 0.35, tempo: 0.25, patience: 0.65 }
    },
    {
      name: 'the Hoarder',
      flavor: 'claims every gem within reach',
      bias: { greed: 1.25, builder: 0.55, disruptor: 0.3, tempo: 0.5, patience: 0.3 }
    },
    {
      name: 'the Saboteur',
      flavor: 'denies rivals their gems',
      bias: { greed: 0.95, builder: 0.5, disruptor: 0.85, tempo: 0.4, patience: 0.45 }
    }
  ];

  var _archCounter = 0;

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  function makeDefaultPersonality(difficulty) {
    var diffCfg = DIFF[difficulty] || DIFF.normal;
    return {
      name: 'the Architect',
      descriptor: 'the Architect — builds toward the peak',
      greed: 1.0,
      builder: 0.8,
      disruptor: 0.5,
      tempo: 0.3,
      patience: 0.5,
      noise: diffCfg.noise,
      lookahead: diffCfg.lookahead
    };
  }

  function makePersonality(rng, difficulty) {
    rng = typeof rng === 'function' ? rng : Math.random;
    var arch = ARCHETYPES[_archCounter % ARCHETYPES.length];
    _archCounter = (_archCounter + 1) % 999999937; // keep it from growing unbounded

    var params = {};
    Object.keys(BOUNDS).forEach(function (key) {
      var b = BOUNDS[key];
      var range = b[1] - b[0];
      var jitterAmt = range * 0.22;
      var v = arch.bias[key] + (rng() * 2 - 1) * jitterAmt;
      params[key] = clamp(v, b[0], b[1]);
    });

    var diffCfg = DIFF[difficulty] || DIFF.normal;

    return {
      name: arch.name,
      descriptor: arch.name + ' — ' + arch.flavor,
      greed: params.greed,
      builder: params.builder,
      disruptor: params.disruptor,
      tempo: params.tempo,
      patience: params.patience,
      noise: diffCfg.noise,
      lookahead: diffCfg.lookahead
    };
  }

  // ---------------------------------------------------------------------
  // Small helpers
  // ---------------------------------------------------------------------

  function safeLegalActions(engine, state, suit) {
    try {
      var acts = engine.legalActions(state, suit);
      return Array.isArray(acts) ? acts : [];
    } catch (e) {
      return [];
    }
  }

  function actionsEqual(a, b) {
    if (!a || !b) return false;
    if (a.type !== b.type) return false;
    if (a.loc !== b.loc) return false;
    if (a.key !== b.key) return false;
    if (a.sub !== b.sub) return false;
    if (a.handIndex !== b.handIndex) return false;
    return true;
  }

  function isLegal(action, legal) {
    return legal.some(function (l) {
      return actionsEqual(action, l);
    });
  }

  function gemValue(engine, loc, key, suit) {
    var GV = (engine && engine.GEM_VALUES) || { base: 10, cap: 15, court: 25, peak: 60 };
    var base = GV[loc] || 0;
    if (loc === 'court' && key === suit) return base * 1.5;
    return base;
  }

  function diffGems(engine, before, after, suit) {
    var diffs = [];
    ['base', 'cap', 'peak', 'court'].forEach(function (loc) {
      if (!before.gems || !before.gems[loc] || !after.gems || !after.gems[loc]) return;
      Object.keys(before.gems[loc]).forEach(function (key) {
        var b = before.gems[loc][key];
        var a = after.gems[loc][key];
        if (!b || !a) return;
        if (b.gem !== a.gem) {
          diffs.push({ loc: loc, key: key, armed: a.gem, value: gemValue(engine, loc, key, suit) });
        }
      });
    });
    return diffs;
  }

  function countMatch(subj, suit) {
    if (!subj) return 0;
    var c = 0;
    ['left', 'right', 'center'].forEach(function (p) {
      if (subj[p] && subj[p].suit === suit) c++;
    });
    return c;
  }

  function coherenceScore(coh) {
    if (!coh) return 0;
    var s = 0;
    if (coh.corners) {
      Object.keys(coh.corners).forEach(function (k) {
        if (coh.corners[k]) s++;
      });
    }
    if (coh.peak) s += 2;
    if (coh.centersAgree) s += 3;
    return s;
  }

  function actionListHasClaim(engine, state, suit, loc, key) {
    var acts = safeLegalActions(engine, state, suit);
    return acts.some(function (a) {
      return a.type === 'claim' && a.loc === loc && a.key === key;
    });
  }

  // ---------------------------------------------------------------------
  // Scoring
  // ---------------------------------------------------------------------

  function scorePivot(engine, state, suit, action, personality, diffCfg) {
    var cloned;
    var result;
    try {
      cloned = engine.cloneState(state);
      result = engine.applyAction(cloned, action);
    } catch (e) {
      return -1e9;
    }
    if (!result || !result.state) return -1e9;
    var after = result.state;
    var score = 0;

    var diffs = diffGems(engine, state, after, suit);
    diffs.forEach(function (d) {
      if (d.armed) {
        var claimableNow = actionListHasClaim(engine, after, suit, d.loc, d.key);
        if (claimableNow) {
          score += d.value * personality.greed;
          if (d.loc === 'cap' || d.loc === 'base' || d.loc === 'peak') {
            score += d.value * personality.builder * 0.3;
          }
        } else if (d.loc === 'court' && d.key === suit) {
          score += d.value * personality.greed * 0.6;
        } else {
          // Arms a gem someone else will benefit from.
          score -= d.value * personality.disruptor * 0.4;
        }
      } else {
        // A gem broke / went unmatched.
        if (d.loc === 'court' && d.key === suit) {
          score -= d.value * personality.greed * 0.5;
        } else {
          score += d.value * personality.disruptor * 0.5;
        }
      }
    });

    try {
      var cohBefore = engine.coherence(state);
      var cohAfter = engine.coherence(after);
      score += (coherenceScore(cohAfter) - coherenceScore(cohBefore)) * personality.builder * 18;
    } catch (e) {
      /* ignore */
    }

    try {
      var beforeSubj = state.board.subjects[suit];
      var afterSubj = after.board.subjects[suit];
      score += (countMatch(afterSubj, suit) - countMatch(beforeSubj, suit)) * personality.builder * 6;
    } catch (e) {
      /* ignore */
    }

    if (diffCfg.lookahead >= 2 && Array.isArray(engine.SUITS)) {
      engine.SUITS.forEach(function (opp) {
        if (opp === suit) return;
        try {
          var oppBefore = safeLegalActions(engine, state, opp).filter(function (a) {
            return a.type === 'claim';
          });
          var oppAfter = safeLegalActions(engine, after, opp).filter(function (a) {
            return a.type === 'claim';
          });
          var newClaims = oppAfter.filter(function (a) {
            return !oppBefore.some(function (b) {
              return actionsEqual(a, b);
            });
          });
          newClaims.forEach(function (a) {
            score -= gemValue(engine, a.loc, a.key, opp) * personality.disruptor * 0.6;
          });
        } catch (e) {
          /* ignore */
        }
      });
    }

    return score;
  }

  function evaluateBuyAction(engine, state, suit, personality, diffCfg) {
    var sim;
    try {
      sim = engine.applyAction(engine.cloneState(state), { type: 'buyAction' });
    } catch (e) {
      return -1e9;
    }
    if (!sim || !sim.state) return -1e9;
    var after = sim.state;
    var legalAfter = safeLegalActions(engine, after, suit).filter(function (a) {
      return a.type === 'pivot';
    });
    var best = -1e9;
    legalAfter.forEach(function (a) {
      var s = scorePivot(engine, after, suit, a, personality, diffCfg);
      if (s > best) best = s;
    });
    if (best === -1e9) return -1e9;
    var threshold = 25 * (1 - personality.tempo) + 8;
    return best - threshold;
  }

  function validateOrPass(state, suit, action, legal) {
    if (isLegal(action, legal)) return action;
    var claims = legal.filter(function (a) {
      return a.type === 'claim';
    });
    if (claims.length) return claims[0];
    if (legal.some(function (a) { return a.type === 'pass'; })) return { type: 'pass' };
    return legal[0];
  }

  // ---------------------------------------------------------------------
  // chooseAction
  // ---------------------------------------------------------------------

  function chooseAction(state, suit, rng) {
    try {
      rng = typeof rng === 'function' ? rng : Math.random;
      var engine = window.PYR && window.PYR.Engine;
      if (!engine) return { type: 'pass' };

      var legal = safeLegalActions(engine, state, suit);
      if (!legal.length) return { type: 'pass' };

      var house = (state.houses && state.houses[suit]) || {};
      var personality = house.personality || makeDefaultPersonality(state.difficulty);
      var diffCfg = DIFF[state.difficulty] || DIFF.normal;

      // 1. Always claim free gems first — strictly positive EV.
      var claims = legal.filter(function (a) {
        return a.type === 'claim';
      });
      if (claims.length > 0) {
        var bestClaim = claims[0];
        var bestClaimVal = -Infinity;
        claims.forEach(function (c) {
          var v = gemValue(engine, c.loc, c.key, suit);
          if (v > bestClaimVal) {
            bestClaimVal = v;
            bestClaim = c;
          }
        });
        return validateOrPass(state, suit, bestClaim, legal);
      }

      var candidates = [];

      legal.forEach(function (a) {
        if (a.type === 'pivot') {
          var s = scorePivot(engine, state, suit, a, personality, diffCfg);
          candidates.push({ action: a, score: s });
        }
      });

      var bestPivotScore = -Infinity;
      candidates.forEach(function (c) {
        if (c.score > bestPivotScore) bestPivotScore = c.score;
      });

      var hand = house.hand || [];
      var hasDraw = legal.some(function (a) {
        return a.type === 'draw';
      });
      if (hasDraw && hand.length < 3) {
        var drawScore = (3 - hand.length) * personality.tempo * 8;
        // Draw is most attractive when we don't already have a strong pivot.
        if (bestPivotScore === -Infinity || bestPivotScore < drawScore) {
          candidates.push({ action: { type: 'draw' }, score: drawScore });
        } else {
          candidates.push({ action: { type: 'draw' }, score: drawScore * 0.3 - 1 });
        }
      }

      if (!candidates.length) {
        return validateOrPass(state, suit, { type: 'pass' }, legal);
      }

      var noisy = candidates.map(function (c) {
        var mult = 1 + (rng() * 2 - 1) * diffCfg.noise;
        return { action: c.action, score: c.score * mult, raw: c.score };
      });

      noisy.sort(function (a, b) {
        return b.score - a.score;
      });

      for (var i = 0; i < noisy.length; i++) {
        if (noisy[i].raw > 0 && isLegal(noisy[i].action, legal)) {
          return noisy[i].action;
        }
      }

      // Nothing is positive EV: pass if we can.
      if (legal.some(function (a) { return a.type === 'pass'; })) {
        return { type: 'pass' };
      }

      // No pass available (shouldn't normally happen) — take the least-bad
      // legal action rather than returning nothing.
      for (var j = 0; j < noisy.length; j++) {
        if (isLegal(noisy[j].action, legal)) return noisy[j].action;
      }
      return legal[0];
    } catch (e) {
      return { type: 'pass' };
    }
  }

  window.PYR.AI = {
    makePersonality: makePersonality,
    chooseAction: chooseAction
  };
})();
