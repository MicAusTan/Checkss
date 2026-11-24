/* Chess Royale: real-time simulation. PURE (no DOM, no Math.random, no Date), so it runs headless in tests and replays exactly.
   Design: ROYALE_SPEC.md. This file is step R1: board, Material, deck/hand, deploy with delay, Health/Damage/Initiative combat,
   towers as targets with HP, all six piece behaviours (Pawn slow mode, Knight Charge, Bishop Weave, Rook Siege, Queen Hunter, Camel Flanker), Fortress/Bastion fire, win by Fortress / timeout, a bot.
   NOT here yet: King, orders, promotion, spells, Phalanx.

   Time: one tick = TICK_MS (250 ms). Every duration is a whole number of ticks, so all actions land on a quarter-second beat.
   Sides: 'w' starts at y = 0 and moves toward +y; 'b' is the mirror and moves toward -y. x runs 0..10, y runs 0..18 (spec ranks/files are 1-based).
   Each side owns y 0..8 (b: 10..18); the river is y = 9 and is only walkable on the bridge files.
   A unit acts when tick >= unit.ready. After an action ready = tick + cooldown. A behaviour that returns false "waits" (no cooldown spent).
   Same-tick order: higher Initiative, then lower cooldown, then older deploy order. */
const Royale = (() => {
  const K0 = {
    W: 11, H: 19, RIVER_Y: 9, BRIDGE_X: [2, 3, 7, 8],
    TICK_MS: 250, REGULAR: 720, OVERTIME: 240, DOUBLE_FROM: 480,            // 3:00 + 1:00 overtime; double Material from 2:00
    MAT_START: 5, MAT_MAX: 10, MAT_PTS: 22, REGEN: 2, REGEN2: 4,           // 22 points = 1 Material; +2/tick = 1 per 2.75 s, doubled = 1 per 1.375 s
    HAND: 4, FORTRESS_HP: 24, BASTION_HP: 12,                                // bot matches at 12/6 lasted ~65 s median, at 24/12 ~120 s (regulation is 180 s)
    PAWN_MOVE_MODE: 'slow',                                                 // only 'slow' exists so far
    PAWN_FRONT_BLOCKS_ATTACK: 'enemy',                                      // 'enemy' | 'any'
    TOWERS_FIRE: true, FORTRESS_DMG: 2, FORTRESS_CD: 12, BASTION_DMG: 2, BASTION_CD: 16, TOWER_RANGE: 3,   // tower fire: Fortress every 3 s, Bastion every 4 s, damage 2, reach 3 squares (= the longest piece reach, so nothing can out-range a tower)
    SLIDE_REACH: 3, STEP: { b: 2, r: 2, q: 2, k: 1 },                             // sliders attack up to 3 squares away but travel 2 per action (pacing assumption, tune)
    ORDER_COOLDOWN: 8,                                                      // per-piece wait between orders (2 s); 0 disables
    PROMO_FALLBACK: true, PROMO_HEALTH_FRAC: 1,                             // a pawn whose chosen piece is taken falls back to the best available; promoted pieces start at full Health
    KING_DELAY: 4, KING_RECALL: 6, KING_COOLDOWN: 40, FORWARD_ROWS: 3,      // King: lands after 1 s, recall channel 1.5 s, 10 s before he can go out again; a lost Bastion opens 3 ranks past the river
    REACH: { k: 1 }, KNIGHT_MEMORY: 2                                                        // a knight will not return to the last N squares it left
  };
  // cd / delay in ticks (x 0.25 s). The five classic pieces all use a 1.0 s cooldown for now (user's call); later/custom pieces get their own intervals. Camel code = the existing Camel piece code (so skins and names carry over).
  const CAMEL = '\u03b3';
  const DEFS = {
    p:     { name: 'Pawn',   cost: 1, hp: 1, dmg: 1, cd: 4, init: 1, delay: 1 },
    n:     { name: 'Knight', cost: 3, hp: 2, dmg: 2, cd: 4, init: 3, delay: 3 },
    b:     { name: 'Bishop', cost: 3, hp: 3, dmg: 2, cd: 4, init: 4, delay: 4 },
    r:     { name: 'Rook',   cost: 4, hp: 4, dmg: 3, cd: 4, init: 2, delay: 5 },
    q:     { name: 'Queen',  cost: 7, hp: 5, dmg: 4, cd: 4, init: 4, delay: 6 },
    [CAMEL]: { name: 'Camel', cost: 2, hp: 1, dmg: 2, cd: 2, init: 5, delay: 2 }
  };
  const KING = { name: 'King', hp: 12, dmg: 2, cd: 4, init: 3, delay: 4 };     // the royal: not a card; hp is mirrored from the Fortress pool
  // spells: r = Chebyshev radius of the area (1 = 3x3, 2 = 5x5), delay = cast delay in ticks
  const SPELLS = {
    surge: { name: 'Surge', cost: 2, r: 1, delay: 2 }, stampede: { name: 'Stampede', cost: 4, r: 2, delay: 2 },
    zug: { name: 'Zugzwang', cost: 3, r: 1, delay: 2, freeze: 10 }, barr: { name: 'Barricade', cost: 2, delay: 2, life: 32 }
  };
  const CARDS = {};
  Object.keys(DEFS).forEach(k => { CARDS[k] = Object.assign({ kind: 'piece' }, DEFS[k]); });
  CARDS.ph = { kind: 'phalanx', name: 'Phalanx', cost: 2, delay: 2 };
  Object.keys(SPELLS).forEach(k => { CARDS[k] = Object.assign({ kind: 'spell' }, SPELLS[k]); });
  const CARD_IDS = ['p', 'n', 'b', 'r', 'q', CAMEL, 'ph', 'surge', 'stampede', 'zug', 'barr'];
  const DEFAULT_DECK = ['p', 'n', 'b', 'r', 'q', CAMEL, 'ph', 'surge'];
  const ORDERS = { p: ['attack', 'hold', 'promote'], b: ['attack', 'hold'], q: ['attack', 'hold'] };   // n, r and the Camel are locked to their doctrine
  const initOrder = (a, b) => b.init - a.init || a.cd - b.cd || a.born - b.born;
  const KN = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];

  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const shuffle = (arr, r) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
  const other = s => (s === 'w' ? 'b' : 'w');
  const fwd = s => (s === 'w' ? 1 : -1);

  function create(opts = {}) {
    const K = Object.assign({}, K0, opts.cfg || {});
    const seed = opts.seed == null ? 1 : opts.seed, doShuffle = opts.shuffle !== false;
    const decks = { w: (opts.decks && opts.decks.w || DEFAULT_DECK).slice(), b: (opts.decks && opts.decks.b || DEFAULT_DECK).slice() };
    ['w', 'b'].forEach(s => { if (decks[s].length < K.HAND + 1) throw new Error('deck needs at least ' + (K.HAND + 1) + ' cards'); decks[s].forEach(c => { if (!CARDS[c]) throw new Error('unknown card ' + c); }); });

    const st = { tick: 0, units: [], towers: [], mat: { w: K.MAT_START * K.MAT_PTS, b: K.MAT_START * K.MAT_PTS }, hands: {}, over: false, winner: null, reason: '', sudden: false, spells: [], barr: [], king: { w: { out: false, cd: 0 }, b: { out: false, cd: 0 } } };
    let nextId = 1, nextBorn = 1, pending = [], events = [];
    const log = [];
    ['w', 'b'].forEach((s, i) => { const order = doShuffle ? shuffle(decks[s].slice(), rng(seed * 2 + i + 1)) : decks[s].slice(); st.hands[s] = { hand: order.slice(0, K.HAND), queue: order.slice(K.HAND) }; });

    // ---- towers: Fortress 3x3 at the back, two Bastions 2x2 on the bridge files (mirrored for 'b')
    const mkTower = (side, kind, x0, y0, w, h, hp) => st.towers.push({ id: 'T' + (st.towers.length + 1), side, kind, x0, y0, w, h, hp, maxhp: hp, ready: 0 });   // towers shoot the moment something is in range, then wait their cooldown
    mkTower('w', 'fortress', 4, 0, 3, 3, K.FORTRESS_HP); mkTower('w', 'bastion', 2, 5, 2, 2, K.BASTION_HP); mkTower('w', 'bastion', 7, 5, 2, 2, K.BASTION_HP);
    mkTower('b', 'fortress', 4, K.H - 3, 3, 3, K.FORTRESS_HP); mkTower('b', 'bastion', 2, K.H - 7, 2, 2, K.BASTION_HP); mkTower('b', 'bastion', 7, K.H - 7, 2, 2, K.BASTION_HP);

    // ---- board helpers
    const inB = (x, y) => x >= 0 && x < K.W && y >= 0 && y < K.H;
    const isBridge = x => K.BRIDGE_X.includes(x);
    const bridgeDist = x => Math.min.apply(null, K.BRIDGE_X.map(b => Math.abs(b - x)));
    const unitAt = (x, y) => st.units.find(u => u.x === x && u.y === y) || null;
    const towerAt = (x, y) => st.towers.find(t => t.hp > 0 && x >= t.x0 && x < t.x0 + t.w && y >= t.y0 && y < t.y0 + t.h) || null;
    const barrAt = (x, y) => st.barr.find(b => b.x === x && b.y === y) || null;
    const walkable = (x, y) => inB(x, y) && !towerAt(x, y) && !barrAt(x, y) && (y !== K.RIVER_Y || isBridge(x));
    const canStand = (x, y) => walkable(x, y) && !unitAt(x, y);
    const fortressOf = s => st.towers.find(t => t.side === s && t.kind === 'fortress');
    const distSq = (x, y, t) => { const dx = Math.max(t.x0 - x, 0, x - (t.x0 + t.w - 1)), dy = Math.max(t.y0 - y, 0, y - (t.y0 + t.h - 1)); return dx * dx + dy * dy; };
    const inZone = (s, y) => (s === 'w' ? y <= K.RIVER_Y - 1 : y >= K.RIVER_Y + 1);
    // Clash-style forward deploy: once an enemy Bastion in a lane is down you may also deploy FORWARD_ROWS ranks past the river on that side (files 1-5 left, 7-11 right)
    function fwdZone(side, x, y) {
      if (!inB(x, y) || y === K.RIVER_Y || x === 5) return false;
      const left = x < 5, down = st.towers.some(t => t.side === other(side) && t.kind === 'bastion' && t.hp <= 0 && (left ? t.x0 < 5 : t.x0 > 5));
      return down && (side === 'w' ? y <= K.RIVER_Y + K.FORWARD_ROWS : y >= K.RIVER_Y - K.FORWARD_ROWS);
    }
    const zoneOk = (s, x, y) => inB(x, y) && (inZone(s, y) || fwdZone(s, x, y));
    const reachLen = t => (K.REACH && K.REACH[t]) || K.SLIDE_REACH;

    // ---- reach geometry. reach(u) = every square the unit could attack right now (with real blockers): {x, y, unit?, tower?}; empty squares are included
    // (a unit standing there WOULD be hit), friendly pieces and non-walkable squares block. geom() is the same ignoring units (for path planning).
    const ORTHO = [[1, 0], [-1, 0], [0, 1], [0, -1]], DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]], ALL8 = ORTHO.concat(DIAG);
    const CAMEL_L = [[3, 1], [3, -1], [-3, 1], [-3, -1], [1, 3], [1, -3], [-1, 3], [-1, -3]];
    const MOVES = { b: { slide: DIAG }, r: { slide: ORTHO }, q: { slide: ALL8 }, k: { slide: ALL8 }, n: { leap: KN }, [CAMEL]: { leap: CAMEL_L } };
    const stepLen = t => (K.STEP && K.STEP[t]) || K.SLIDE_REACH;
    function reach(u) {
      const out = [], side = u.side;
      const add = (x, y) => {
        if (!inB(x, y)) return; const tw = towerAt(x, y);
        if (tw) { if (tw.side !== side) out.push({ x, y, tower: tw }); return; }
        if ((y === K.RIVER_Y && !isBridge(x)) || barrAt(x, y)) return;
        const v = unitAt(x, y); if (v) { if (v.side !== side) out.push({ x, y, unit: v }); return; }
        out.push({ x, y });
      };
      if (u.t === 'p') { add(u.x - 1, u.y + fwd(side)); add(u.x + 1, u.y + fwd(side)); }
      const m = MOVES[u.t]; if (!m) return out;
      if (m.leap) m.leap.forEach(d => add(u.x + d[0], u.y + d[1]));
      if (m.slide) m.slide.forEach(d => { for (let k = 1; k <= reachLen(u.t); k++) { const n = out.length; add(u.x + d[0] * k, u.y + d[1] * k); if (out.length === n || out[n].unit || out[n].tower) break; } });
      return out;
    }
    function geom(type, x, y) {
      const out = [], add = (px, py) => { if (!inB(px, py)) return false; const tw = towerAt(px, py); if (tw) { out.push({ x: px, y: py, tower: tw }); return false; } if ((py === K.RIVER_Y && !isBridge(px)) || barrAt(px, py)) return false; out.push({ x: px, y: py }); return true; };
      const m = MOVES[type]; if (!m) return out;
      if (m.leap) m.leap.forEach(d => add(x + d[0], y + d[1]));
      if (m.slide) m.slide.forEach(d => { for (let k = 1; k <= reachLen(type); k++) if (!add(x + d[0] * k, y + d[1] * k)) break; });
      return out;
    }
    const geomHits = (u, x, y, pred) => geom(u.t, x, y).some(s => s.tower && s.tower.side !== u.side && pred(s.tower));
    const attackSquares = u => (u.idle ? [] : reach(u).map(s => [s.x, s.y]));
    const threatenedAt = (side, x, y) => st.units.some(v => v.side !== side && attackSquares(v).some(s => s[0] === x && s[1] === y));
    const unitsOf = L => L.filter(s => s.unit).map(s => s.unit);
    const towersOf = L => L.filter(s => s.tower).map(s => s.tower).sort((a, b) => (a.kind === 'fortress' ? 0 : 1) - (b.kind === 'fortress' ? 0 : 1) || (a.id < b.id ? -1 : 1));
    const costOf = t => (DEFS[t] || { cost: 9 }).cost;                  // the King counts as the most valuable target
    const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
    // single-action destinations of a walker/leaper from (x, y): terrain and standing units block
    function stepOpts(type, x, y) {
      const m = MOVES[type], out = []; if (!m) return out;
      if (m.leap) m.leap.forEach(d => { const nx = x + d[0], ny = y + d[1]; if (walkable(nx, ny) && !unitAt(nx, ny)) out.push({ x: nx, y: ny, dx: d[0] }); });
      if (m.slide) m.slide.forEach(d => { for (let k = 1; k <= stepLen(type); k++) { const nx = x + d[0] * k, ny = y + d[1] * k; if (!walkable(nx, ny) || unitAt(nx, ny)) break; out.push({ x: nx, y: ny, dx: d[0] }); } });
      return out;
    }
    // breadth-first search over actions: the first step of a shortest path to any square where goal(x, y) holds (null = already there / no path)
    function firstStep(u, goal, pref) {
      const seen = new Set([u.y * K.W + u.x]); if (goal(u.x, u.y)) return null;
      let layer = [{ x: u.x, y: u.y, first: null }];
      while (layer.length) {
        const next = [];
        for (const n of layer) {
          const opts = stepOpts(u.t, n.x, n.y); if (pref && !n.first) opts.sort(pref);
          for (const o of opts) { const key = o.y * K.W + o.x; if (seen.has(key)) continue; seen.add(key); const f = n.first || o; if (goal(o.x, o.y)) return f; next.push({ x: o.x, y: o.y, first: f }); }
        }
        layer = next;
      }
      return null;
    }

    // ---- actions
    const ev = e => { e.tick = st.tick; events.push(e); };
    function moveTo(u, x, y) { ev({ e: 'move', id: u.id, fx: u.x, fy: u.y, tx: x, ty: y }); u.x = x; u.y = y; return true; }
    function end(winner, reason) { if (st.over) return; st.over = true; st.winner = winner; st.reason = reason; ev({ e: 'end', winner, reason }); }
    function dealDamage(v, dmg) {                                        // returns true if v died. The King has no Health of his own: his Health IS the Fortress pool
      if (v.king) {
        const F = fortressOf(v.side); F.hp -= dmg; v.hp = Math.max(0, F.hp); v.recallAt = 0;
        if (F.hp <= 0) { ev({ e: 'towerDown', tower: F.id }); end(other(v.side), 'fortress destroyed'); return true; }
        return false;
      }
      v.hp -= dmg; return v.hp <= 0;
    }
    function hitUnit(u, v) {
      const dead = dealDamage(v, u.dmg); ev({ e: 'hit', id: u.id, target: v.id, dmg: u.dmg, left: Math.max(0, v.hp) });
      if (dead) { v.dead = true; st.units = st.units.filter(w => w !== v); ev({ e: 'kill', id: u.id, target: v.id }); if (!st.over) moveTo(u, v.x, v.y); }   // a killing blow is a normal capture: the attacker moves onto the square
      return true;
    }
    function hitTower(u, t) {
      t.hp -= u.dmg; ev({ e: 'towerHit', id: u.id, tower: t.id, dmg: u.dmg, left: Math.max(0, t.hp) });
      if (t.hp <= 0) { ev({ e: 'towerDown', tower: t.id }); if (t.kind === 'fortress') end(u.side, 'fortress destroyed'); }
      if (st.sudden && !st.over) end(u.side, 'sudden death');
      return true;
    }

    // ---- behaviours: return true if the unit acted (cooldown starts), false to wait
    function sidestep(u, safe, towardBridge) {
      const cands = [u.x - 1, u.x + 1].filter(x => canStand(x, u.y) && (!safe || !threatenedAt(u.side, x, u.y)) && (!towardBridge || bridgeDist(x) < bridgeDist(u.x)));
      if (!cands.length) return false;
      cands.sort((a, b) => bridgeDist(a) - bridgeDist(b) || a - b);
      return moveTo(u, cands[0], u.y);
    }
    const lastRank = side => (side === 'w' ? K.H - 1 : 0);
    function promote(u) {                                                // spending an action on the enemy back rank: best available piece, one pawn-promoted piece of each type alive
      const taken = new Set(st.units.filter(v => v.side === u.side && v.promoted).map(v => v.t));
      let pick = u.promoteTo && !taken.has(u.promoteTo) ? u.promoteTo : null;
      const fb = K.PROMO_FALLBACK && typeof K.PROMO_FALLBACK === 'object' ? K.PROMO_FALLBACK[u.side] : K.PROMO_FALLBACK;   // true/false for both players, or {w, b}
      if (!pick && (!u.promoteTo || fb)) pick = ['q', 'r', 'b', 'n'].find(c => !taken.has(c)) || null;
      if (!pick) return false;                                           // chosen piece taken and no fall-back (or all taken): wait on the rank
      const d = DEFS[pick]; ev({ e: 'promote', id: u.id, to: pick });
      Object.assign(u, { t: pick, hp: Math.max(1, Math.ceil(d.hp * K.PROMO_HEALTH_FRAC)), maxhp: d.hp, dmg: d.dmg, cd: d.cd, init: d.init, promoted: true, stance: 'attack', promoteTo: null, lastDx: 0, mem: [] });
      return true;
    }
    function holdAct(u) {                                                // Hold stance: guard, never advance
      if (u.t === 'p') { const a = unitAt(u.x, u.y + fwd(u.side)); if (a && a.side !== u.side) return false; }
      const L = reach(u), us = unitsOf(L).sort((a, b) => a.hp - b.hp || a.id - b.id); if (us.length) return hitUnit(u, us[0]);
      const ts = towersOf(L); return ts.length ? hitTower(u, ts[0]) : false;
    }
    function actKing(u) {                                                // the King out of his Fortress: adjacent fights, otherwise walks to the square he was sent to
      const L = reach(u), us = unitsOf(L).sort((a, b) => a.hp - b.hp || a.id - b.id); if (us.length) return hitUnit(u, us[0]);
      const ts = towersOf(L); if (ts.length) return hitTower(u, ts[0]);
      if (!u.goal) return false; if (u.x === u.goal.x && u.y === u.goal.y) { u.goal = null; return false; }
      const g = u.goal, step = firstStep(u, (x, y) => x === g.x && y === g.y); if (step) return moveTo(u, step.x, step.y); u.goal = null; return false;
    }
    function actPawn(u) {
      if (u.y === lastRank(u.side)) return promote(u);
      const f = fwd(u.side), ahead = unitAt(u.x, u.y + f), enemyAhead = !!ahead && ahead.side !== u.side;
      const blocked = K.PAWN_FRONT_BLOCKS_ATTACK === 'any' ? !!ahead : enemyAhead;
      if (!blocked && u.stance !== 'promote') { const L = reach(u), us = unitsOf(L).sort((a, b) => a.hp - b.hp || a.id - b.id); if (us.length) return hitUnit(u, us[0]); const ts = towersOf(L); if (ts.length) return hitTower(u, ts[0]); }
      if (enemyAhead) return sidestep(u, true, false);                  // head-on: only a SAFE sidestep, otherwise a standoff
      const nx = u.x, ny = u.y + f;
      if (canStand(nx, ny)) return moveTo(u, nx, ny);
      if (inB(nx, ny) && ny === K.RIVER_Y && !isBridge(nx)) return sidestep(u, false, true);   // river ahead: shuffle toward the nearest bridge
      return false;                                                     // friend / tower ahead or last rank: wait (promotion comes in R5)
    }
    function actKnight(u) {                                              // Charge: ignores everything but the enemy Fortress
      const F = fortressOf(other(u.side)); if (!F || F.hp <= 0) return false;
      const all = KN.map(d => [u.x + d[0], u.y + d[1]]).filter(s => inB(s[0], s[1]));
      if (all.some(s => towerAt(s[0], s[1]) === F)) return hitTower(u, F);
      const d0 = distSq(u.x, u.y, F), recent = u.mem || [];
      const land = all.filter(s => walkable(s[0], s[1]));
      const empty = land.filter(s => !unitAt(s[0], s[1]) && !recent.includes(s[0] + ',' + s[1]));
      const best = list => list.reduce((b, s) => (!b || distSq(s[0], s[1], F) < distSq(b[0], b[1], F) ? s : b), null);
      const go = s => { u.mem = [u.x + ',' + u.y].concat(recent).slice(0, K.KNIGHT_MEMORY); return moveTo(u, s[0], s[1]); };
      const improving = best(empty.filter(s => distSq(s[0], s[1], F) < d0)); if (improving) return go(improving);
      const side = best(empty); if (side) return go(side);              // reroute with a sideways leap
      const foes = land.filter(s => { const v = unitAt(s[0], s[1]); return v && v.side !== u.side; });
      const foe = best(foes); if (foe) return hitUnit(u, unitAt(foe[0], foe[1]));   // every route occupied: hit the enemy on the best square
      return false;                                                      // only friends in the way: wait
    }
    const enemyFortress = u => { const F = fortressOf(other(u.side)); return F && F.hp > 0 ? F : null; };
    function actBishop(u) {                                              // Weave: hit what is on its diagonals, else zig-zag toward the Fortress
      const L = reach(u), us = unitsOf(L).sort((a, b) => b.dmg - a.dmg || a.hp - b.hp || a.id - b.id);
      if (us.length) return hitUnit(u, us[0]);
      const ts = towersOf(L); if (ts.length) return hitTower(u, ts[0]);
      const F = enemyFortress(u); if (!F) return false;
      const last = u.lastDx || 0, step = firstStep(u, (x, y) => geomHits(u, x, y, t => t === F), (a, b) => a.dx * last - b.dx * last);   // prefer the opposite sideways direction: the zig-zag
      if (!step) return false; u.lastDx = step.dx < 0 ? -1 : 1; return moveTo(u, step.x, step.y);
    }
    function actRook(u) {                                                // Siege: Fortress first, then Bastions; only hits pieces that block it
      const ts = towersOf(reach(u)); if (ts.length) return hitTower(u, ts[0]);
      const F = enemyFortress(u); let step = F ? firstStep(u, (x, y) => geomHits(u, x, y, t => t === F)) : null;
      if (!step) { const bs = st.towers.filter(t => t.side !== u.side && t.hp > 0); step = firstStep(u, (x, y) => geomHits(u, x, y, t => bs.includes(t))); }
      if (step) return moveTo(u, step.x, step.y);
      const us = unitsOf(reach(u)).sort((a, b) => a.hp - b.hp || a.id - b.id); return us.length ? hitUnit(u, us[0]) : false;
    }
    function actQueen(u) {                                               // Hunter: highest-cost enemy in reach, else approach the nearest enemy, else the Fortress
      const L = reach(u), us = unitsOf(L).sort((a, b) => costOf(b.t) - costOf(a.t) || a.hp - b.hp || a.id - b.id);
      if (us.length) return hitUnit(u, us[0]);
      const ts = towersOf(L); if (ts.length) return hitTower(u, ts[0]);
      const foe = st.units.filter(v => v.side !== u.side).sort((a, b) => cheb(u, a) - cheb(u, b) || a.id - b.id)[0];
      let step = foe ? firstStep(u, (x, y) => geom(u.t, x, y).some(s => s.x === foe.x && s.y === foe.y)) : null;
      if (!step) { const F = enemyFortress(u); step = F ? firstStep(u, (x, y) => geomHits(u, x, y, t => t === F)) : null; }
      return step ? moveTo(u, step.x, step.y) : false;
    }
    function actCamel(u) {                                               // Flanker: weakest enemy (Health 1-2) in leap reach, else along the edge files toward the Fortress
      const L = reach(u), weak = unitsOf(L).filter(v => v.hp <= 2).sort((a, b) => a.hp - b.hp || a.id - b.id);
      if (weak.length) return hitUnit(u, weak[0]);
      const ts = towersOf(L); if (ts.length) return hitTower(u, ts[0]);
      const F = enemyFortress(u); if (!F) return false; const edge = x => Math.min(x, K.W - 1 - x);
      const step = firstStep(u, (x, y) => geomHits(u, x, y, t => t === F), (a, b) => edge(a.x) - edge(b.x));
      return step ? moveTo(u, step.x, step.y) : false;
    }
    function towerFire(t) {                                              // Fortress garrison / Bastion: hits the weakest enemy within TOWER_RANGE on its own timer
      if (st.over || t.hp <= 0 || t.ready > st.tick) return;
      if (t.kind === 'fortress' && st.king[t.side].out) return;            // the garrison is silent while the King is away
      const gap = v => Math.max(Math.max(t.x0 - v.x, 0, v.x - (t.x0 + t.w - 1)), Math.max(t.y0 - v.y, 0, v.y - (t.y0 + t.h - 1)));
      const c = st.units.filter(v => v.side !== t.side && gap(v) <= K.TOWER_RANGE).sort((a, b) => a.hp - b.hp || gap(a) - gap(b) || a.id - b.id); if (!c.length) return;
      const v = c[0], dmg = t.kind === 'fortress' ? K.FORTRESS_DMG : K.BASTION_DMG, dead = dealDamage(v, dmg); ev({ e: 'towerFire', tower: t.id, target: v.id, dmg, left: Math.max(0, v.hp) });
      if (dead) { v.dead = true; st.units = st.units.filter(w => w !== v); ev({ e: 'kill', tower: t.id, target: v.id }); }
      t.ready = st.tick + (t.kind === 'fortress' ? K.FORTRESS_CD : K.BASTION_CD);
    }
    const BEHAVIOUR = { p: actPawn, n: actKnight, b: actBishop, r: actRook, q: actQueen, [CAMEL]: actCamel, k: actKing };
    const doAct = u => { if (u.stance === 'hold' && u.t !== 'k') return holdAct(u); const b = BEHAVIOUR[u.t]; return b ? b(u) : false; };
    const actNow = u => { if (u.dead || u.idle || st.over || (u.frozenUntil || 0) > st.tick) return; doAct(u); };   // a spell's free action: cooldown untouched

    // ---- commands (validated when issued AND again when applied, so a replay behaves identically)
    const kingUnit = side => st.units.find(u => u.king && u.side === side) || null;
    const mine = (side, ids) => st.units.filter(u => u.side === side && !u.dead && Array.isArray(ids) && ids.includes(u.id));
    function squareOk(side, x, y) {
      if (!zoneOk(side, x, y)) return 'not in your deploy zone';
      if (towerAt(x, y)) return 'tower square'; if (barrAt(x, y)) return 'blocked'; if (unitAt(x, y)) return 'square taken';
      return '';
    }
    function checkDeploy(side, slot, x, y) {
      if (st.over) return 'game over';
      if (side !== 'w' && side !== 'b') return 'bad side';
      const hand = st.hands[side].hand; if (!(slot >= 0 && slot < hand.length)) return 'bad slot';
      const c = CARDS[hand[slot]]; if (st.mat[side] < c.cost * K.MAT_PTS) return 'not enough Material';
      if (c.kind === 'spell') { if (!inB(x, y)) return 'off the board'; if (hand[slot] === 'barr' && (!walkable(x, y) || unitAt(x, y))) return 'blocked'; return ''; }
      if (c.kind === 'phalanx') { if (x < 1 || x > K.W - 2) return 'needs 3 free squares in a row'; for (let d = -1; d <= 1; d++) if (squareOk(side, x + d, y)) return 'needs 3 free squares in a row'; return ''; }
      return squareOk(side, x, y);
    }
    function validate(side, cmd) {
      if (st.over) return 'game over'; if (!cmd) return 'unknown command';
      switch (cmd.type) {
        case 'deploy': return checkDeploy(side, cmd.slot, cmd.x, cmd.y);
        case 'kingOut': { const k = st.king[side], F = fortressOf(side); if (k.out) return 'the King is already out'; if (st.tick < k.cd) return 'the King is still recovering'; if (!F || F.hp <= 0) return 'no Fortress'; return squareOk(side, cmd.x, cmd.y); }
        case 'kingOrder': return kingUnit(side) && inB(cmd.x, cmd.y) ? '' : 'the King is not out';
        case 'recall': { const k = kingUnit(side); return !k ? 'the King is not out' : k.recallAt ? 'already recalling' : ''; }
        case 'order': return mine(side, cmd.ids).some(u => ORDERS[u.t] && ORDERS[u.t].includes(cmd.order) && st.tick >= (u.orderReady || 0)) ? '' : 'no selected piece can take that order';
        case 'promoteTo': return ['n', 'b', 'r', 'q', 'auto'].includes(cmd.piece) && mine(side, cmd.ids).some(u => u.t === 'p') ? '' : 'select pawns first';
        default: return 'unknown command';
      }
    }
    function command(side, cmd) {
      const why = validate(side, cmd); if (why) return { ok: false, reason: why };
      const c = { tick: st.tick, side, cmd: JSON.parse(JSON.stringify(cmd)) };
      log.push(c); pending.push(c); return { ok: true };
    }
    function place(side, t, x, y, extra) {                               // used by deploy and by tests
      const d = DEFS[t] || KING, u = Object.assign({ id: nextId++, born: nextBorn++, side, t, x, y, hp: d.hp, maxhp: d.hp, dmg: d.dmg, cd: d.cd, init: d.init, ready: st.tick + d.delay }, extra || {});
      st.units.push(u); return u;
    }
    function applyDeploy(side, cmd) {
      const h = st.hands[side], card = h.hand[cmd.slot], info = CARDS[card];
      st.mat[side] -= info.cost * K.MAT_PTS; h.hand[cmd.slot] = h.queue.shift(); h.queue.push(card);
      if (info.kind === 'piece') { const u = place(side, card, cmd.x, cmd.y); ev({ e: 'deploy', id: u.id, side, t: card, x: cmd.x, y: cmd.y }); }
      else if (info.kind === 'phalanx') [-1, 0, 1].forEach(d => { const u = place(side, 'p', cmd.x + d, cmd.y, { ready: st.tick + info.delay }); ev({ e: 'deploy', id: u.id, side, t: 'p', x: u.x, y: u.y }); });
      else { st.spells.push({ id: nextId++, side, card, x: cmd.x, y: cmd.y, at: st.tick + info.delay }); ev({ e: 'cast', side, card, x: cmd.x, y: cmd.y }); }
    }
    function applyCommand(c) {
      const { side, cmd } = c; if (validate(side, cmd)) return;       // state changed since it was issued: silently dropped
      switch (cmd.type) {
        case 'deploy': return applyDeploy(side, cmd);
        case 'kingOut': { const F = fortressOf(side), u = place(side, 'k', cmd.x, cmd.y, { king: true, hp: F.hp, maxhp: F.maxhp, ready: st.tick + K.KING_DELAY }); st.king[side].out = true; return ev({ e: 'kingOut', id: u.id, side, x: cmd.x, y: cmd.y }); }
        case 'kingOrder': kingUnit(side).goal = { x: cmd.x, y: cmd.y }; return ev({ e: 'order', side, order: 'move' });
        case 'recall': kingUnit(side).recallAt = st.tick + K.KING_RECALL; return ev({ e: 'recallStart', side });
        case 'order': mine(side, cmd.ids).forEach(u => { if (ORDERS[u.t] && ORDERS[u.t].includes(cmd.order) && st.tick >= (u.orderReady || 0)) { u.stance = cmd.order; u.orderReady = st.tick + K.ORDER_COOLDOWN; } }); return ev({ e: 'order', side, order: cmd.order });
        case 'promoteTo': return mine(side, cmd.ids).forEach(u => { if (u.t === 'p') u.promoteTo = cmd.piece === 'auto' ? null : cmd.piece; });
      }
    }
    function castSpell(sp) {
      const info = SPELLS[sp.card], inArea = u => Math.max(Math.abs(u.x - sp.x), Math.abs(u.y - sp.y)) <= info.r;
      ev({ e: 'spell', card: sp.card, side: sp.side, x: sp.x, y: sp.y });
      if (sp.card === 'surge' || sp.card === 'stampede') st.units.filter(u => u.side === sp.side && inArea(u)).sort(initOrder).forEach(u => actNow(u));
      else if (sp.card === 'zug') st.units.filter(u => u.side !== sp.side && inArea(u)).forEach(u => { u.ready = st.tick + info.freeze + Math.max(0, u.ready - st.tick); u.frozenUntil = st.tick + info.freeze; });   // freeze pauses the timer: it resumes where it left off
      else if (sp.card === 'barr') [-1, 0, 1].forEach(d => { const x = sp.x + d; if (walkable(x, sp.y) && !unitAt(x, sp.y)) st.barr.push({ x, y: sp.y, until: st.tick + info.life }); });
    }

    function score(s) { const ts = st.towers.filter(t => t.side === s && t.hp > 0); return [ts.length, ts.reduce((a, t) => a + t.hp, 0)]; }
    function timeUp() {
      const a = score('w'), b = score('b');
      if (a[0] !== b[0]) return end(a[0] > b[0] ? 'w' : 'b', 'more towers standing');
      if (a[1] !== b[1]) return end(a[1] > b[1] ? 'w' : 'b', 'more tower HP');
      st.sudden = true; ev({ e: 'overtime' });
    }

    function step() {
      events = [];
      if (st.over) return events;
      const q = pending; pending = []; q.forEach(applyCommand);
      st.barr = st.barr.filter(b => b.until > st.tick);
      const due = st.spells.filter(sp => sp.at <= st.tick); st.spells = st.spells.filter(sp => sp.at > st.tick); due.forEach(castSpell);
      st.units.filter(u => u.king).forEach(k => {
        const F = fortressOf(k.side); k.hp = Math.max(0, F.hp);
        if (k.recallAt && st.tick >= k.recallAt) { k.dead = true; st.units = st.units.filter(w => w !== k); st.king[k.side] = { out: false, cd: st.tick + K.KING_COOLDOWN }; ev({ e: 'kingHome', side: k.side }); }
      });
      const order = st.units.filter(u => u.ready <= st.tick).sort((a, b) => b.init - a.init || a.cd - b.cd || a.born - b.born);
      for (const u of order) {
        if (st.over) break; if (u.dead || u.ready > st.tick) continue;
        if (!u.idle && doAct(u)) u.ready = st.tick + u.cd;
      }
      if (K.TOWERS_FIRE) for (const t of st.towers) towerFire(t);
      const dbl = st.tick >= K.DOUBLE_FROM;
      ['w', 'b'].forEach(s => { st.mat[s] = Math.min(K.MAT_MAX * K.MAT_PTS, st.mat[s] + (dbl ? K.REGEN2 : K.REGEN)); });
      st.tick++;
      if (!st.over && st.tick === K.REGULAR) timeUp();
      if (!st.over && st.tick >= K.REGULAR + K.OVERTIME) end(null, 'draw');
      return events;
    }

    const snapshot = () => ({
      tick: st.tick, over: st.over, winner: st.winner, reason: st.reason, sudden: st.sudden,
      mat: { w: Math.floor(st.mat.w / K.MAT_PTS), b: Math.floor(st.mat.b / K.MAT_PTS) }, matPts: { w: st.mat.w, b: st.mat.b },
      hands: { w: { hand: st.hands.w.hand.slice(), next: st.hands.w.queue[0] }, b: { hand: st.hands.b.hand.slice(), next: st.hands.b.queue[0] } },
      units: st.units.map(u => ({ id: u.id, side: u.side, t: u.t, x: u.x, y: u.y, hp: u.hp, maxhp: u.maxhp, ready: u.ready, cd: u.cd, stance: u.stance || 'attack', king: !!u.king, promoted: !!u.promoted, promoteTo: u.promoteTo || null, frozen: (u.frozenUntil || 0) > st.tick, recalling: !!u.recallAt, goal: u.goal || null })),
      spells: st.spells.map(p => ({ side: p.side, card: p.card, x: p.x, y: p.y, at: p.at })), barr: st.barr.map(b => ({ x: b.x, y: b.y, until: b.until })), king: { w: { out: st.king.w.out, cd: st.king.w.cd }, b: { out: st.king.b.out, cd: st.king.b.cd } },
      towers: st.towers.map(t => ({ id: t.id, side: t.side, kind: t.kind, x0: t.x0, y0: t.y0, w: t.w, h: t.h, hp: t.hp, maxhp: t.maxhp }))
    });
    // Network play: the host runs the sim and sends view(side) every tick; the guest's copy never steps, it only loads those states (so can/check/snapshot work there).
    const loadState = o => { Object.keys(st).forEach(k => { delete st[k]; }); Object.assign(st, JSON.parse(JSON.stringify(o))); };
    const view = side => { const c = JSON.parse(JSON.stringify(st)); ['w', 'b'].forEach(x => { if (x !== side) c.hands[x] = { hand: [], queue: [] }; }); return c; };   // hands other than your own stay hidden (a spectator sees none)
    const record = () => ({ v: 1, seed, decks, cfg: opts.cfg || {}, shuffle: doShuffle, ticks: st.tick, commands: log.map(c => ({ tick: c.tick, side: c.side, cmd: Object.assign({}, c.cmd) })) });
    return { K, st, step, loadState, view, command, check: checkDeploy, can: validate, snapshot, record, status: () => ({ over: st.over, winner: st.winner, reason: st.reason }),
             events: () => events, _: { place, unitAt, towerAt, walkable, attackSquares } };
  }

  // Re-simulate a record exactly (same commands on the same ticks).
  function replay(rec, upTo) {
    const sim = create({ seed: rec.seed, decks: rec.decks, cfg: rec.cfg, shuffle: rec.shuffle });
    const end = upTo == null ? rec.ticks : Math.min(upTo, rec.ticks); let i = 0;
    for (let t = 0; t < end; t++) { while (i < rec.commands.length && rec.commands[i].tick === t) { const c = rec.commands[i++]; sim.command(c.side, c.cmd); } sim.step(); }
    return sim;
  }

  // ---- Bot (R2): fills a side by calling sim.command like a player would. Easy thinks every ~2-3 s and sometimes sits on its Material; Normal thinks every
  // second and always spends. Both defend the lane an enemy piece is in. It only plays cards that have a behaviour yet (IMPLEMENTED).
  const IMPLEMENTED = ['p', 'n', 'b', 'r', 'q', CAMEL, 'ph', 'surge', 'stampede', 'zug'];   // the bot never plays Barricade
  function bot(level, seed) {
    const r = rng((seed || 1) * 7919 + 13), every = level === 'normal' ? 4 : 8, B = { level: level || 'easy', next: 0, failed: 0, played: 0 };
    const LANES = { left: [2, 3], right: [7, 8], mid: [4, 5, 6] };
    B.think = (sim, side) => {
      const st = sim.st, K = sim.K; if (st.over || st.tick < B.next) return null;
      B.next = st.tick + every + (B.level === 'normal' ? 0 : Math.floor(r() * 4));
      const mat = st.mat[side] / K.MAT_PTS, reserve = B.level === 'normal' ? 0 : Math.floor(r() * 3);
      const spot = (rad, pred) => { let best = null, bc = 0; for (let x = 0; x < K.W; x++) for (let y = 0; y < K.H; y++) { const c = st.units.filter(u => pred(u) && Math.max(Math.abs(u.x - x), Math.abs(u.y - y)) <= rad).length; if (c > bc) { bc = c; best = [x, y]; } } return { best, count: bc }; };
      const opts = [];
      st.hands[side].hand.forEach((c, i) => {
        const info = CARDS[c]; if (!IMPLEMENTED.includes(c) || !(info.cost + reserve <= mat || (mat >= K.MAT_MAX && info.cost <= mat))) return;
        if (info.kind === 'spell') {
          const sp = c === 'zug' ? spot(info.r, u => u.side !== side) : spot(info.r, u => u.side === side && !u.king);
          if (sp.count >= (c === 'surge' ? 3 : c === 'stampede' ? 5 : 3)) opts.push({ c, i, at: sp.best });
        } else opts.push({ c, i });
      });
      if (!opts.length) return null;
      const pick = opts[Math.floor(r() * opts.length)];
      if (pick.at) { const res = sim.command(side, { type: 'deploy', slot: pick.i, x: pick.at[0], y: pick.at[1] }); if (res.ok) { B.played++; return res; } B.failed++; return null; }
      const threat = st.units.filter(u => u.side !== side && (side === 'w' ? u.y < K.RIVER_Y : u.y > K.RIVER_Y)).sort((a, b) => Math.abs(a.y - (side === 'w' ? 0 : K.H - 1)) - Math.abs(b.y - (side === 'w' ? 0 : K.H - 1)))[0];
      const laneOf = x => (x <= 3 ? 'left' : x >= 7 ? 'right' : 'mid');
      const lane = threat ? laneOf(threat.x) : ['left', 'right', 'mid'][Math.floor(r() * 3)];
      const front = pick.c === 'p' || pick.c === 'ph', dir = side === 'w' ? 1 : -1, base = side === 'w' ? 0 : K.H - 1;
      const rows = []; for (let k = 0; k < K.RIVER_Y; k++) rows.push(front ? base + dir * (K.RIVER_Y - 1 - k) : base + dir * (1 + k));   // pawns start nearest the river, others from the back
      const xs = LANES[lane].slice().sort(() => r() - 0.5).concat([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      for (const y of rows) for (const x of xs) {
        if (!(y >= 0 && y < K.H) || (side === 'w' ? y >= K.RIVER_Y : y <= K.RIVER_Y)) continue;
        const res = sim.command(side, { type: 'deploy', slot: pick.i, x, y }); if (res.ok) { B.played++; return res; }
      }
      B.failed++; return null;
    };
    return B;
  }
  return { create, replay, bot, IMPLEMENTED, CONSTANTS: K0, DEFS, CARDS, CARD_IDS, ORDERS, SPELLS, DEFAULT_DECK, KN };
})();
if (typeof module !== 'undefined') module.exports = Royale;
