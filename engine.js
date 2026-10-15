/*
 * Variant-ready chess engine.
 * A variant is a plain object:
 *   w, h        board size (x = file 0..w-1, y = rank 0..h-1, y=0 is White's back rank)
 *   pieces      { letter: { slide: [dirs], leap: [offsets] } }  (pawn 'p' is built in)
 *   setup       rows from top (Black side) to bottom; uppercase = White, '.' = empty
 *   promoteTo   letters a pawn may become
 *   castling    true/false (king 'k' + rooks 'r' that have not moved)
 * New pieces = new entries in `pieces`. Classes/spells would hook into move()/apply().
 */
const Engine = (() => {
  const ROOK = [[1,0],[-1,0],[0,1],[0,-1]], BISHOP = [[1,1],[1,-1],[-1,1],[-1,-1]],
        ALL = ROOK.concat(BISHOP),
        KNIGHT = [[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]];

  const STANDARD = {
    w: 8, h: 8,
    pieces: { r:{slide:ROOK}, b:{slide:BISHOP}, q:{slide:ALL}, n:{leap:KNIGHT}, k:{leap:ALL}, p:{} },
    setup: ['rnbqkbnr','pppppppp','........','........','........','........','PPPPPPPP','RNBQKBNR'],
    promoteTo: ['q','r','b','n'],
    castling: true
  };

  /*
   * Alice Chess: two boards. A piece moves as normal using only the pieces on its own board,
   * the destination square must be empty on the OTHER board, and after moving the piece
   * appears on that other board. Check only counts on the king's own board.
   * (No castling or en passant in this version.)
   */
  function createAlice() {
    const w = 8, h = 8, idx = (x, y) => y * w + x, inB = (x, y) => x >= 0 && y >= 0 && x < w && y < h;
    const opp = c => (c === 'w' ? 'b' : 'w'), defs = STANDARD.pieces;
    let S = { L: [new Array(64).fill(null), new Array(64).fill(null)], turn: 'w' };
    STANDARD.setup.forEach((row, i) => [...row].forEach((ch, x) => {
      if (ch !== '.') S.L[0][idx(x, 7 - i)] = { t: ch.toLowerCase(), c: ch === ch.toUpperCase() ? 'w' : 'b' };
    }));
    const hist = [], stC = new WeakMap();

    function reach(B, x, y, atk) {
      const p = B[idx(x, y)], out = [], def = defs[p.t];
      const add = (tx, ty, e) => out.push(Object.assign({ tx, ty }, e));
      if (p.t === 'p') {
        const d = p.c === 'w' ? 1 : -1, last = p.c === 'w' ? 7 : 0, start = p.c === 'w' ? 1 : 6;
        const push = (tx, ty, e) => (ty === last ? STANDARD.promoteTo.forEach(t => add(tx, ty, { promo: t })) : add(tx, ty, e));
        if (!atk && inB(x, y + d) && !B[idx(x, y + d)]) {
          push(x, y + d);
          if (y === start && !B[idx(x, y + 2 * d)]) add(x, y + 2 * d);
        }
        for (const dx of [-1, 1]) {
          const tx = x + dx, ty = y + d;
          if (inB(tx, ty) && (atk || (B[idx(tx, ty)] && B[idx(tx, ty)].c !== p.c))) push(tx, ty);
        }
        return out;
      }
      for (const [dx, dy] of def.leap || []) {
        const tx = x + dx, ty = y + dy;
        if (inB(tx, ty) && (!B[idx(tx, ty)] || B[idx(tx, ty)].c !== p.c)) add(tx, ty);
      }
      for (const [dx, dy] of def.slide || []) {
        let tx = x + dx, ty = y + dy;
        while (inB(tx, ty)) {
          const t = B[idx(tx, ty)];
          if (!t) add(tx, ty); else { if (t.c !== p.c) add(tx, ty); break; }
          tx += dx; ty += dy;
        }
      }
      return out;
    }

    const attacked = (B, x, y, by) =>
      B.some((p, i) => p && p.c === by && reach(B, i % w, Math.floor(i / w), true).some(m => m.tx === x && m.ty === y));

    function apply(S, m) {
      const L = [S.L[0].slice(), S.L[1].slice()], p = L[m.fl][idx(m.fx, m.fy)];
      L[m.fl][idx(m.fx, m.fy)] = null;
      L[m.fl][idx(m.tx, m.ty)] = null;                       // capture happens on the mover's board
      L[1 - m.fl][idx(m.tx, m.ty)] = { t: m.promo || p.t, c: p.c };   // piece lands on the other board
      return { L, turn: opp(S.turn) };
    }

    function kingPos(S, c) {
      for (let l = 0; l < 2; l++) for (let i = 0; i < 64; i++) {
        const p = S.L[l][i];
        if (p && p.t === 'k' && p.c === c) return { x: i % w, y: Math.floor(i / w), l };
      }
      return null;
    }
    function inCheckS(S, c) {
      const k = kingPos(S, c);
      return k ? attacked(S.L[k.l], k.x, k.y, opp(c)) : false;
    }

    function legal(S, x, y, l) {
      const p = S.L[l][idx(x, y)];
      if (!p || p.c !== S.turn) return [];
      return reach(S.L[l], x, y)
        .filter(m => !S.L[1 - l][idx(m.tx, m.ty)])
        .map(m => Object.assign({ fx: x, fy: y, fl: l }, m))
        .filter(m => !inCheckS(apply(S, m), S.turn));
    }
    function all(S) {
      const out = [];
      for (let l = 0; l < 2; l++) for (let i = 0; i < 64; i++) out.push(...legal(S, i % w, Math.floor(i / w), l));
      return out;
    }

    return {
      w, h, layers: 2,
      get turn() { return S.turn; },
      at: (x, y, l = 0) => S.L[l][idx(x, y)],
      moves: (x, y, l = 0) => legal(S, x, y, l),
      kingPos: c => kingPos(S, c),
      move(m) {
        if (!(m.fl === 0 || m.fl === 1) || !inB(m.fx, m.fy)) return false;
        const ok = legal(S, m.fx, m.fy, m.fl).find(l => l.tx === m.tx && l.ty === m.ty && (l.promo || null) === (m.promo || null));
        if (!ok) return false;
        const vic = S.L[ok.fl][idx(ok.tx, ok.ty)];
        S = apply(S, ok);
        hist.push({ fl: ok.fl, fx: ok.fx, fy: ok.fy, tx: ok.tx, ty: ok.ty, promo: ok.promo || null, cap: vic ? vic.t : null });
        return true;
      },
      inCheck: () => inCheckS(S, S.turn),
      status() {
        if (stC.has(S)) return stC.get(S);
        const none = all(S).length === 0, c = inCheckS(S, S.turn);
        const r = none ? (c ? 'checkmate' : 'stalemate') : (c ? 'check' : 'playing');
        stC.set(S, r); return r;
      },
      history: () => hist.slice(),
      perft(d) { const rec = (S, d) => { if (!d) return 1; let n = 0; for (const m of all(S)) n += rec(apply(S, m), d - 1); return n; }; return rec(S, d); }
    };
  }


  // Geometry shared by the 4-seat engines. 'wide' = 16 x height team board, 'infinite' = the 14x14 cross sitting in
  // the middle of an open 32x32 board (corners are no longer cut off), otherwise the plain cross board.
  function multiGeom(v) {
    const wide = v.board === 'wide', inf = v.board === 'infinite';
    const BW = wide ? 16 : inf ? 32 : 14, BH = wide ? (v.height || 10) : inf ? 32 : 14, SZ = BW * BH, O = inf ? 9 : 0;
    const idx = (x, y) => y * BW + x;
    const valid = (x, y) => x >= 0 && y >= 0 && x < BW && y < BH && (wide || inf || !((x < 3 || x > 10) && (y < 3 || y > 10)));
    const FWD = wide ? { r: [0, 1], y: [0, 1], b: [0, -1], g: [0, -1] } : { r: [0, 1], b: [1, 0], y: [0, -1], g: [-1, 0] };
    const rankOf = wide
      ? (c, x, y) => (c === 'r' || c === 'y' ? y : BH - 1 - y)
      : (c, x, y) => { x -= O; y -= O; return c === 'r' ? y : c === 'b' ? x : c === 'y' ? 13 - y : 13 - x; };
    const promoRank = wide ? BH - 1 : 10;
    // place(c, u, r): own-frame file u (0..7 along the back rank) and rank r -> board square
    const place = wide
      ? (c, u, r) => (c === 'r' ? [u, r] : c === 'y' ? [8 + u, r] : c === 'b' ? [15 - u, BH - 1 - r] : [7 - u, BH - 1 - r])
      : (c, u, r) => {
        const q = ({ r: (x, y) => [x, y], b: (x, y) => [y, 13 - x], y: (x, y) => [13 - x, 13 - y], g: (x, y) => [13 - y, x] })[c](3 + u, r);
        return [q[0] + O, q[1] + O];
      };
    const isCenter = (x, y) => x - O >= 3 && x - O <= 10 && y - O >= 3 && y - O <= 10;
    return { wide, inf, BW, BH, SZ, idx, valid, FWD, rankOf, promoRank, place, isCenter };
  }

  /*
   * 4-seat engine used for the cross board (14x14, corners cut) and the "wide" team board
   * (16 x v.height, teams face each other across the middle). Options (all in the variant object):
   *   seats/dead, castling, drops (+dropZone), movesPerTurn/firstSingle, board:'wide', height, teams {seat:team}.
   * Teammates never capture or check each other. A player who is checkmated or resigns is out (pieces turn gray and
   * can be captured, kings included); a stalemated player just skips. The game ends when one team is left.
   */
  function createMulti(v) {
    const { wide, BW, BH, SZ, idx, valid, FWD, rankOf, promoRank, place, isCenter } = multiGeom(v);
    const ORDER = ['r', 'b', 'y', 'g'], seats = v.seats, per = () => v.movesPerTurn || 1;
    const teamOf = c => (v.teams ? v.teams[c] : c);
    // Neutral-piece fairy types: c commoner (king step), i imp (knight leap), w wraith (<=2 diagonal), o ox (<=2 straight).
    const defs = Object.assign({}, STANDARD.pieces, {
      c: { leap: STANDARD.pieces.k.leap }, i: { leap: STANDARD.pieces.n.leap },
      w: { slide: BISHOP, max: 2 }, o: { slide: ROOK, max: 2 }
    });
    const BACK = 'rnbqkbnr', NEU = !!v.neutral;
    const b = new Array(SZ).fill(null), alive = {}, events = [], hist = [], hands = {};
    ORDER.forEach(c => {
      hands[c] = {};
      if (!seats.includes(c) && !(v.dead || []).includes(c)) return;
      alive[c] = seats.includes(c);
      for (let k = 0; k < 8; k++) {
        const [bx, by] = place(c, k, 0), [px, py] = place(c, k, 1);
        b[idx(bx, by)] = { t: BACK[k], c, dead: !alive[c] };
        b[idx(px, py)] = { t: 'p', c, dead: !alive[c] };
      }
    });
    // Neutral pieces (colour 'n') belong to nobody. They move by themselves after every full round of turns.
    let nid = 0;
    if (NEU) {
      alive.n = true;
      const orbits = [[[5, 5], [5, 8], [8, 8], [8, 5]], [[6, 4], [4, 7], [7, 9], [9, 6]]];
      const kinds = v.neutralSet === 'mixed' ? ['w', 'i'] : ['c', 'c'];
      orbits.forEach((orb, k) => orb.forEach(([x, y]) => { b[idx(x, y)] = { t: kinds[k], c: 'n', id: ++nid }; }));
    }
    const S = { turn: seats[0], left: v.firstSingle ? 1 : per(), drawn: false, moved: new Set(), nmoved: new Set(), pending: false, needSettle: false };
    const activeCount = () => seats.filter(c => alive[c]).length;
    const liveTeams = () => new Set(seats.filter(c => alive[c]).map(teamOf)).size;
    function nextActive(c) {
      let i = seats.indexOf(c);
      for (let n = 0; n < seats.length; n++) { i = (i + 1) % seats.length; if (alive[seats[i]]) return seats[i]; }
      return c;
    }
    const pass = c => {
      S.turn = nextActive(c); S.left = per();
      if (NEU) {
        S.moved.add(c);
        if (seats.every(x => !alive[x] || S.moved.has(x))) { S.moved.clear(); S.nmoved.clear(); S.pending = true; }
      }
    };
    const over = () => S.drawn || liveTeams() <= 1;

    function pseudo(B, x, y, atk) {
      const p = B[idx(x, y)], out = [], def = defs[p.t];
      if (p.dead) return out;
      const add = (tx, ty, e) => out.push(Object.assign({ fx: x, fy: y, tx, ty }, e));
      // Gray (eliminated/inactive) pieces, kings too, can be captured by anyone; partners never.
      const can = t => t.dead || (teamOf(t.c) !== teamOf(p.c) && (atk || t.t !== 'k'));
      if (p.t === 'p') {
        const oc = p.c === 'n' ? (p.o || 'r') : p.c;
        const [dx, dy] = FWD[oc], pp = dx === 0 ? [1, 0] : [0, 1];
        const push = (tx, ty) => (!atk && rankOf(oc, tx, ty) === promoRank ? (p.c === 'n' ? ['q'] : STANDARD.promoteTo).forEach(t => add(tx, ty, { promo: t })) : add(tx, ty));
        const fx = x + dx, fy = y + dy;
        if (!atk && valid(fx, fy) && !B[idx(fx, fy)]) {
          push(fx, fy);
          if (rankOf(oc, x, y) === 1 && valid(fx + dx, fy + dy) && !B[idx(fx + dx, fy + dy)]) add(fx + dx, fy + dy);
        }
        for (const s of [-1, 1]) {
          const tx = fx + pp[0] * s, ty = fy + pp[1] * s;
          if (!valid(tx, ty)) continue;
          const t = B[idx(tx, ty)];
          if (atk || (t && can(t))) push(tx, ty);
        }
        return out;
      }
      for (const [lx, ly] of def.leap || []) {
        const tx = x + lx, ty = y + ly;
        if (valid(tx, ty)) { const t = B[idx(tx, ty)]; if (!t || can(t)) add(tx, ty); }
      }
      for (const [sx, sy] of def.slide || []) {
        let tx = x + sx, ty = y + sy, n = 1;
        while (valid(tx, ty) && (!def.max || n <= def.max)) {
          const t = B[idx(tx, ty)];
          if (!t) add(tx, ty); else { if (can(t)) add(tx, ty); break; }
          tx += sx; ty += sy; n++;
        }
      }
      if (p.t === 'k' && v.castling && !p.m && !atk && !sqAttacked(B, x, y, p.c)) {
        const pp = FWD[p.c][0] === 0 ? [1, 0] : [0, 1];
        for (const d of [1, -1]) {
          const dx = pp[0] * d, dy = pp[1] * d;
          let tx = x + dx, ty = y + dy, n = 1;
          while (valid(tx, ty) && !B[idx(tx, ty)]) { tx += dx; ty += dy; n++; }
          const r = valid(tx, ty) && B[idx(tx, ty)];
          if (!r || r.t !== 'r' || r.c !== p.c || r.m || r.dead || n < 3) continue;
          const k1x = x + dx, k1y = y + dy, k2x = x + 2 * dx, k2y = y + 2 * dy;
          if (!sqAttacked(B, k1x, k1y, p.c) && !sqAttacked(B, k2x, k2y, p.c))
            add(k2x, k2y, { castle: true, rx: tx, ry: ty, rtx: k1x, rty: k1y });
        }
      }
      return out;
    }

    function kingPos(c) {
      for (let i = 0; i < SZ; i++) { const p = b[i]; if (p && p.t === 'k' && p.c === c && !p.dead) return { x: i % BW, y: Math.floor(i / BW) }; }
      return null;
    }
    function sqAttacked(B, kx, ky, c) {
      for (let i = 0; i < SZ; i++) {
        const p = B[i];
        if (!p || p.dead || teamOf(p.c) === teamOf(c) || !alive[p.c]) continue;
        if (pseudo(B, i % BW, Math.floor(i / BW), true).some(m => m.tx === kx && m.ty === ky)) return true;
      }
      return false;
    }
    function kingAttacked(B, c) {
      for (let i = 0; i < SZ; i++) { const p = B[i]; if (p && p.t === 'k' && p.c === c && !p.dead) return sqAttacked(B, i % BW, Math.floor(i / BW), c); }
      return false;
    }
    function sim(m, p) {
      const B = b.slice();
      if (m.drop) { B[idx(m.tx, m.ty)] = { t: m.drop, c: m.c, m: true }; return B; }
      B[idx(m.tx, m.ty)] = { t: m.promo || p.t, c: p.c, m: true }; B[idx(m.fx, m.fy)] = null;
      if (m.castle) { B[idx(m.rx, m.ry)] = null; B[idx(m.rtx, m.rty)] = { t: 'r', c: p.c, m: true }; }
      return B;
    }
    function legalAt(x, y) {
      const p = b[idx(x, y)];
      if (!p || p.dead || !alive[p.c]) return [];
      return pseudo(b, x, y).filter(m => !kingAttacked(sim(m, p), p.c));
    }
    // Crazyhouse-style drops. dropZone 'own' = your own arm + the centre (cross) / your own half (wide).
    const inOwnZone = (c, x, y) => (wide ? rankOf(c, x, y) < BH / 2 : rankOf(c, x, y) < 3 || isCenter(x, y));
    function dropCands(c) {
      const out = [];
      if (!v.drops) return out;
      for (const t in hands[c]) {
        if (!(hands[c][t] > 0)) continue;
        for (let y = 0; y < BH; y++) for (let x = 0; x < BW; x++) {
          if (!valid(x, y) || b[idx(x, y)]) continue;
          if (v.dropZone === 'own' && !inOwnZone(c, x, y)) continue;
          if (v.dropZone === 'arm' && rankOf(c, x, y) >= 3) continue;
          if (t === 'p') { const rk = rankOf(c, x, y); if (rk === 0 || rk >= promoRank) continue; }
          out.push({ drop: t, c, tx: x, ty: y });
        }
      }
      return out;
    }
    const legalDrops = c => (alive[c] ? dropCands(c).filter(m => !kingAttacked(sim(m), c)) : []);
    function hasMove(c) {
      for (let i = 0; i < SZ; i++) { const p = b[i]; if (p && p.c === c && !p.dead && legalAt(i % BW, Math.floor(i / BW)).length) return true; }
      return dropCands(c).some(m => !kingAttacked(sim(m), c));
    }
    function eliminate(c, reason) {
      alive[c] = false;
      const fallen = NEU && !!v.fallen;
      for (let i = 0; i < SZ; i++) if (b[i] && b[i].c === c) {
        b[i] = fallen ? { t: b[i].t === 'k' ? 'c' : b[i].t, c: 'n', o: c, id: ++nid, m: true } : Object.assign({}, b[i], { dead: true });
      }
      events.push({ e: 'elim', c, reason, fallen });
    }
    // Checkmate eliminates a player. Being stalemated does NOT: the turn is simply skipped.
    // If every remaining player is stalemated in a row, nobody can ever move and the game is drawn.
    function settle() {
      let guard = 0, skipped = 0;
      while (liveTeams() > 1 && guard++ < 30) {
        if (!alive[S.turn]) { pass(S.turn); continue; }
        if (hasMove(S.turn)) return;
        if (kingAttacked(b, S.turn)) { eliminate(S.turn, 'checkmate'); pass(S.turn); skipped = 0; continue; }
        events.push({ e: 'skip', c: S.turn }); pass(S.turn);
        if (++skipped >= activeCount()) { S.drawn = true; return; }
      }
    }

    // ---- neutral phase: each neutral piece (by id) moves once after every full round ----
    function finishNeutral() {
      S.pending = false; S.nmoved.clear();
      if (S.needSettle) { S.needSettle = false; settle(); }
    }
    function nextNeutral() {
      if (!NEU || !S.pending) return null;
      if (over()) { finishNeutral(); return null; }
      const list = [];
      for (let i = 0; i < SZ; i++) { const p = b[i]; if (p && p.c === 'n' && !S.nmoved.has(p.id)) list.push([p.id, i]); }
      list.sort((a, c2) => a[0] - c2[0]);
      for (const [id, i] of list) {
        const x = i % BW, y = Math.floor(i / BW), moves = pseudo(b, x, y, false);
        if (moves.length) return { id, x, y, moves };
        S.nmoved.add(id);                         // no legal move: this neutral piece is skipped
      }
      finishNeutral();
      return null;
    }
    function neutralApply(m) {
      const nx = nextNeutral();
      if (!nx || nx.x !== m.fx || nx.y !== m.fy) return false;
      const ok = nx.moves.find(l => l.tx === m.tx && l.ty === m.ty && (l.promo || null) === (m.promo || null));
      if (!ok) return false;
      const p = b[idx(m.fx, m.fy)], vic = b[idx(ok.tx, ok.ty)];
      b[idx(ok.tx, ok.ty)] = { t: ok.promo || p.t, c: 'n', o: p.o, id: p.id, m: true }; b[idx(ok.fx, ok.fy)] = null;
      S.nmoved.add(p.id);
      hist.push({ c: 'n', fx: ok.fx, fy: ok.fy, tx: ok.tx, ty: ok.ty, promo: ok.promo || null, cap: vic ? vic.t : null, capc: vic ? vic.c : null });
      nextNeutral();
      return true;
    }

    return {
      w: BW, h: BH, multi: true, neutral: NEU, seats, teams: v.teams || null, wide,
      get turn() { return S.turn; },
      get left() { return S.left; },
      get neutralPending() { return NEU && S.pending && nextNeutral() !== null; },
      neutralNext: nextNeutral, neutralApply,
      valid, kingPos,
      at: (x, y) => b[idx(x, y)],
      moves: (x, y) => { const p = b[idx(x, y)]; return p && p.c === S.turn ? legalAt(x, y) : []; },
      hand: c => Object.assign({}, hands[c]),
      drops: () => legalDrops(S.turn),
      alive: c => !!alive[c],
      // Squares a seat's team can see (fog of war): its own pieces and every square they could move to or attack.
      sees(c) {
        const set = new Set();
        for (let i = 0; i < SZ; i++) {
          const p = b[i];
          if (!p || p.dead || teamOf(p.c) !== teamOf(c)) continue;
          set.add(i);
          const x = i % BW, y = Math.floor(i / BW);
          pseudo(b, x, y, false).concat(pseudo(b, x, y, true)).forEach(m => set.add(idx(m.tx, m.ty)));
        }
        return set;
      },
      winner: () => (!S.drawn && liveTeams() === 1 ? seats.find(c => alive[c]) : null),
      get drawn() { return S.drawn; },
      inCheck: c => !!alive[c] && kingAttacked(b, c),
      drainEvents() { const e = events.slice(); events.length = 0; return e; },
      history: () => hist.slice(),
      status: () => (over() ? 'over' : 'playing'),
      move(m) {
        if (over() || (NEU && S.pending && nextNeutral() !== null)) return false;
        const c = S.turn;
        if (m.drop) {
          if (!v.drops || !(hands[c][m.drop] > 0)) return false;
          const ok = legalDrops(c).find(l => l.drop === m.drop && l.tx === m.tx && l.ty === m.ty);
          if (!ok) return false;
          b[idx(ok.tx, ok.ty)] = { t: ok.drop, c, m: true }; hands[c][ok.drop]--;
          hist.push({ c, drop: ok.drop, tx: ok.tx, ty: ok.ty, cap: null });
        } else {
          if (!valid(m.fx, m.fy)) return false;
          const p = b[idx(m.fx, m.fy)];
          if (!p || p.c !== c) return false;
          const ok = legalAt(m.fx, m.fy).find(l => l.tx === m.tx && l.ty === m.ty && (l.promo || null) === (m.promo || null));
          if (!ok) return false;
          const vic = b[idx(ok.tx, ok.ty)];
          if (v.drops && vic && vic.t !== 'k' && (!NEU || vic.c === 'n')) hands[c][vic.pr ? 'p' : vic.t] = (hands[c][vic.pr ? 'p' : vic.t] || 0) + 1;
          b[idx(ok.tx, ok.ty)] = { t: ok.promo || p.t, c, m: true, pr: !!ok.promo || undefined }; b[idx(ok.fx, ok.fy)] = null;
          if (ok.castle) { b[idx(ok.rx, ok.ry)] = null; b[idx(ok.rtx, ok.rty)] = { t: 'r', c, m: true }; }
          hist.push({ c, fx: ok.fx, fy: ok.fy, tx: ok.tx, ty: ok.ty, promo: ok.promo || null, cap: vic ? vic.t : null, castle: !!ok.castle });
        }
        S.left--;
        if (S.left > 0 && alive[c] && hasMove(c)) return true;     // Marseillais: same player moves again
        pass(c);
        if (NEU && S.pending) S.needSettle = true; else settle();
        return true;
      },
      resign(c) {
        if (!alive[c]) return;
        const wasTurn = S.turn === c;
        eliminate(c, 'resign');
        if (wasTurn) pass(c);
        if (NEU && S.pending) S.needSettle = true; else settle();
      }
    };
  }


  /*
   * 4-player Alice chess: the cross board exists twice (layers 0 and 1). A piece moves using only the pieces on its
   * own layer, the destination must be EMPTY on the other layer, and after moving it appears on the other layer.
   * Check only counts on the king's own layer. No castling or drops. Everything else (teams, stalemate = skip,
   * checkmate = out, gray pieces capturable) works like the normal 4-player engine.
   */
  function createAlice4(v) {
    const { BW, BH, SZ, idx, valid, FWD, rankOf, promoRank, place } = multiGeom(v);
    const ORDER = ['r', 'b', 'y', 'g'], seats = v.seats, teamOf = c => (v.teams ? v.teams[c] : c);
    const defs = STANDARD.pieces, BACK = 'rnbqkbnr';
    const L = [new Array(SZ).fill(null), new Array(SZ).fill(null)], alive = {}, events = [], hist = [];
    ORDER.forEach(c => {
      if (!seats.includes(c) && !(v.dead || []).includes(c)) return;
      alive[c] = seats.includes(c);
      for (let k = 0; k < 8; k++) {
        const [bx, by] = place(c, k, 0), [px, py] = place(c, k, 1);
        L[0][idx(bx, by)] = { t: BACK[k], c, dead: !alive[c] };
        L[0][idx(px, py)] = { t: 'p', c, dead: !alive[c] };
      }
    });
    const S = { turn: seats[0], drawn: false };
    const activeCount = () => seats.filter(c => alive[c]).length;
    const liveTeams = () => new Set(seats.filter(c => alive[c]).map(teamOf)).size;
    function nextActive(c) {
      let i = seats.indexOf(c);
      for (let n = 0; n < seats.length; n++) { i = (i + 1) % seats.length; if (alive[seats[i]]) return seats[i]; }
      return c;
    }
    const pass = c => { S.turn = nextActive(c); };
    const over = () => S.drawn || liveTeams() <= 1;

    function pseudo(B, x, y, atk) {
      const p = B[idx(x, y)], out = [], def = defs[p.t];
      if (p.dead) return out;
      const add = (tx, ty, e) => out.push(Object.assign({ fx: x, fy: y, tx, ty }, e));
      const can = t => t.dead || (teamOf(t.c) !== teamOf(p.c) && (atk || t.t !== 'k'));
      if (p.t === 'p') {
        const [dx, dy] = FWD[p.c], pp = dx === 0 ? [1, 0] : [0, 1];
        const push = (tx, ty) => (!atk && rankOf(p.c, tx, ty) === promoRank ? STANDARD.promoteTo.forEach(t => add(tx, ty, { promo: t })) : add(tx, ty));
        const fx = x + dx, fy = y + dy;
        if (!atk && valid(fx, fy) && !B[idx(fx, fy)]) {
          push(fx, fy);
          if (rankOf(p.c, x, y) === 1 && valid(fx + dx, fy + dy) && !B[idx(fx + dx, fy + dy)]) add(fx + dx, fy + dy);
        }
        for (const sd of [-1, 1]) {
          const tx = fx + pp[0] * sd, ty = fy + pp[1] * sd;
          if (!valid(tx, ty)) continue;
          const t = B[idx(tx, ty)];
          if (atk || (t && can(t))) push(tx, ty);
        }
        return out;
      }
      for (const [lx, ly] of def.leap || []) {
        const tx = x + lx, ty = y + ly;
        if (valid(tx, ty)) { const t = B[idx(tx, ty)]; if (!t || can(t)) add(tx, ty); }
      }
      for (const [sx, sy] of def.slide || []) {
        let tx = x + sx, ty = y + sy;
        while (valid(tx, ty)) {
          const t = B[idx(tx, ty)];
          if (!t) add(tx, ty); else { if (can(t)) add(tx, ty); break; }
          tx += sx; ty += sy;
        }
      }
      return out;
    }
    function sqAttacked(B, kx, ky, c) {
      for (let i = 0; i < SZ; i++) {
        const p = B[i];
        if (!p || p.dead || teamOf(p.c) === teamOf(c) || !alive[p.c]) continue;
        if (pseudo(B, i % BW, Math.floor(i / BW), true).some(m => m.tx === kx && m.ty === ky)) return true;
      }
      return false;
    }
    function kingLoc(Ls, c) {
      for (let l = 0; l < 2; l++) for (let i = 0; i < SZ; i++) {
        const p = Ls[l][i];
        if (p && p.t === 'k' && p.c === c && !p.dead) return { x: i % BW, y: Math.floor(i / BW), l };
      }
      return null;
    }
    function kingAttacked(Ls, c) { const k = kingLoc(Ls, c); return k ? sqAttacked(Ls[k.l], k.x, k.y, c) : false; }
    function sim(m, p) {
      const Ls = [L[0].slice(), L[1].slice()];
      Ls[m.fl][idx(m.fx, m.fy)] = null; Ls[m.fl][idx(m.tx, m.ty)] = null;           // capture happens on the mover's layer
      Ls[1 - m.fl][idx(m.tx, m.ty)] = { t: m.promo || p.t, c: p.c, m: true };       // the piece lands on the other layer
      return Ls;
    }
    function legalAt(x, y, l) {
      const p = L[l][idx(x, y)];
      if (!p || p.dead || !alive[p.c]) return [];
      return pseudo(L[l], x, y).filter(m => !L[1 - l][idx(m.tx, m.ty)])
        .map(m => Object.assign({ fl: l }, m)).filter(m => !kingAttacked(sim(m, p), p.c));
    }
    function hasMove(c) {
      for (let l = 0; l < 2; l++) for (let i = 0; i < SZ; i++) {
        const p = L[l][i];
        if (p && p.c === c && !p.dead && legalAt(i % BW, Math.floor(i / BW), l).length) return true;
      }
      return false;
    }
    function eliminate(c, reason) {
      alive[c] = false;
      for (let l = 0; l < 2; l++) for (let i = 0; i < SZ; i++) if (L[l][i] && L[l][i].c === c) L[l][i] = Object.assign({}, L[l][i], { dead: true });
      events.push({ e: 'elim', c, reason });
    }
    function settle() {
      let guard = 0, skipped = 0;
      while (liveTeams() > 1 && guard++ < 30) {
        if (!alive[S.turn]) { pass(S.turn); continue; }
        if (hasMove(S.turn)) return;
        if (kingAttacked(L, S.turn)) { eliminate(S.turn, 'checkmate'); pass(S.turn); skipped = 0; continue; }
        events.push({ e: 'skip', c: S.turn }); pass(S.turn);
        if (++skipped >= activeCount()) { S.drawn = true; return; }
      }
    }
    return {
      w: BW, h: BH, multi: true, layers: 2, seats, teams: v.teams || null,
      get turn() { return S.turn; },
      valid,
      at: (x, y, l = 0) => L[l][idx(x, y)],
      moves: (x, y, l = 0) => { const p = L[l][idx(x, y)]; return p && p.c === S.turn ? legalAt(x, y, l) : []; },
      kingPos: c => kingLoc(L, c),
      alive: c => !!alive[c],
      winner: () => (!S.drawn && liveTeams() === 1 ? seats.find(c => alive[c]) : null),
      get drawn() { return S.drawn; },
      inCheck: c => !!alive[c] && kingAttacked(L, c),
      drainEvents() { const e = events.slice(); events.length = 0; return e; },
      history: () => hist.slice(),
      status: () => (over() ? 'over' : 'playing'),
      move(m) {
        if (over() || !(m.fl === 0 || m.fl === 1) || !valid(m.fx, m.fy)) return false;
        const c = S.turn, p = L[m.fl][idx(m.fx, m.fy)];
        if (!p || p.c !== c) return false;
        const ok = legalAt(m.fx, m.fy, m.fl).find(l => l.tx === m.tx && l.ty === m.ty && (l.promo || null) === (m.promo || null));
        if (!ok) return false;
        const vic = L[ok.fl][idx(ok.tx, ok.ty)];
        L[ok.fl][idx(ok.fx, ok.fy)] = null; L[ok.fl][idx(ok.tx, ok.ty)] = null;
        L[1 - ok.fl][idx(ok.tx, ok.ty)] = { t: ok.promo || p.t, c, m: true };
        hist.push({ c, fl: ok.fl, fx: ok.fx, fy: ok.fy, tx: ok.tx, ty: ok.ty, promo: ok.promo || null, cap: vic ? vic.t : null });
        pass(c); settle();
        return true;
      },
      resign(c) {
        if (!alive[c]) return;
        const wasTurn = S.turn === c;
        eliminate(c, 'resign');
        if (wasTurn) pass(c);
        settle();
      }
    };
  }

  /*
   * 3-player HEXAGONAL chess (Glinski-style pieces) on a 127-cell hexagon (radius 6).
   * Seats r (bottom corner), b (upper-left corner), y (upper-right corner); turns go clockwise r > b > y.
   * Cells use axial coordinates (q, r) stored as x = q + 6, y = r + 6.
   * Rook = 6 edge directions, bishop = 6 diagonals (stays on one of 3 cell colors), queen = both,
   * king = 12 neighbours, knight = 12 leaps. Pawns step 1 straight forward (2 from their start cell)
   * and capture to the two forward-side neighbours; they promote on the last cell of their file.
   * Elimination rules are the same as the 4-player version (no legal move or resign = out, pieces go gray).
   */
  function createHex(v) {
    const R = 6, N = 2 * R + 1, idx = (x, y) => y * N + x;
    const valid = (x, y) => x >= 0 && y >= 0 && x < N && y < N &&
      Math.max(Math.abs(x - R), Math.abs(y - R), Math.abs(x + y - 2 * R)) <= R;
    const seats = v.seats, ORDER = ['r', 'b', 'y'], KI = { r: 0, b: 1, y: 2 };
    const rot = (q, r) => [-q - r, q];                       // rotate 120 degrees
    const rotN = (k, q, r) => { for (let i = 0; i < k; i++) [q, r] = rot(q, r); return [q, r]; };
    const EDGE = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
    const DIAG = [[2, -1], [1, -2], [-1, -1], [-2, 1], [-1, 2], [1, 1]];
    const KN = [];
    [[1, 2, -3], [-1, -2, 3]].forEach(t => [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]]
      .forEach(pm => KN.push([t[pm[0]], t[pm[1]]])));
    const defs = {
      r: { slide: EDGE }, b: { slide: DIAG }, q: { slide: EDGE.concat(DIAG) },
      n: { leap: KN }, k: { leap: EDGE.concat(DIAG) }, p: {}
    };
    const FWD = {}, CAP = {};
    ORDER.forEach(c => {
      FWD[c] = rotN(KI[c], 0, -1);
      CAP[c] = [rotN(KI[c], -1, 0), rotN(KI[c], 1, -1)];
    });
    const PROMO = STANDARD.promoteTo;

    // Start position, written for the bottom seat then rotated for the others.
    const base = [];
    const colBottom = q => (q <= 0 ? R : R - q);
    const put = (k, j, t) => base.push([k, colBottom(k) - j, t]);
    [0, 1, 2].forEach(j => put(0, j, 'b'));
    put(-3, 0, 'r'); put(-2, 0, 'n'); put(-1, 0, 'n'); put(1, 0, 'q'); put(2, 0, 'k'); put(3, 0, 'r');
    for (let k = -4; k <= 4; k++) put(k, 4 - Math.abs(k), 'p');

    const b = new Array(N * N).fill(null), alive = {}, events = [], hist = [];
    ORDER.forEach(c => {
      if (!seats.includes(c) && !(v.dead || []).includes(c)) return;
      alive[c] = seats.includes(c);
      base.forEach(([q, r, t]) => { const [rq, rr] = rotN(KI[c], q, r); b[idx(rq + R, rr + R)] = { t, c, dead: !alive[c] }; });
    });
    const S = { turn: seats[0], drawn: false };
    const activeCount = () => seats.filter(c => alive[c]).length;
    function nextActive(c) {
      let i = seats.indexOf(c);
      for (let n = 0; n < seats.length; n++) { i = (i + 1) % seats.length; if (alive[seats[i]]) return seats[i]; }
      return c;
    }

    function pseudo(B, x, y, atk) {
      const p = B[idx(x, y)], out = [], def = defs[p.t];
      if (p.dead) return out;
      const add = (tx, ty, e) => out.push(Object.assign({ fx: x, fy: y, tx, ty }, e));
      const can = t => t.c !== p.c && (atk || t.t !== 'k' || t.dead);
      if (p.t === 'p') {
        const [fq, fr] = FWD[p.c];
        const push = (tx, ty) => (!atk && !valid(tx + fq, ty + fr) ? PROMO.forEach(t => add(tx, ty, { promo: t })) : add(tx, ty));
        const nx = x + fq, ny = y + fr;
        if (!atk && valid(nx, ny) && !B[idx(nx, ny)]) {
          push(nx, ny);
          const n2x = nx + fq, n2y = ny + fr;
          if (!p.m && valid(n2x, n2y) && !B[idx(n2x, n2y)]) push(n2x, n2y);
        }
        for (const [cq, cr] of CAP[p.c]) {
          const tx = x + cq, ty = y + cr;
          if (!valid(tx, ty)) continue;
          const t = B[idx(tx, ty)];
          if (atk || (t && can(t))) push(tx, ty);
        }
        return out;
      }
      for (const [lx, ly] of def.leap || []) {
        const tx = x + lx, ty = y + ly;
        if (valid(tx, ty)) { const t = B[idx(tx, ty)]; if (!t || can(t)) add(tx, ty); }
      }
      for (const [sx, sy] of def.slide || []) {
        let tx = x + sx, ty = y + sy;
        while (valid(tx, ty)) {
          const t = B[idx(tx, ty)];
          if (!t) add(tx, ty); else { if (can(t)) add(tx, ty); break; }
          tx += sx; ty += sy;
        }
      }
      return out;
    }

    function kingPos(c) {
      for (let i = 0; i < N * N; i++) { const p = b[i]; if (p && p.t === 'k' && p.c === c && !p.dead) return { x: i % N, y: Math.floor(i / N) }; }
      return null;
    }
    function kingAttacked(B, c) {
      let kx = -1, ky = -1;
      for (let i = 0; i < N * N; i++) { const p = B[i]; if (p && p.t === 'k' && p.c === c && !p.dead) { kx = i % N; ky = Math.floor(i / N); break; } }
      if (kx < 0) return false;
      for (let i = 0; i < N * N; i++) {
        const p = B[i];
        if (!p || p.dead || p.c === c || !alive[p.c]) continue;
        if (pseudo(B, i % N, Math.floor(i / N), true).some(m => m.tx === kx && m.ty === ky)) return true;
      }
      return false;
    }
    function legalAt(x, y) {
      const p = b[idx(x, y)];
      if (!p || p.dead || !alive[p.c]) return [];
      return pseudo(b, x, y).filter(m => {
        const B = b.slice();
        B[idx(m.tx, m.ty)] = { t: m.promo || p.t, c: p.c, m: true }; B[idx(x, y)] = null;
        return !kingAttacked(B, p.c);
      });
    }
    function hasMove(c) {
      for (let i = 0; i < N * N; i++) { const p = b[i]; if (p && p.c === c && !p.dead && legalAt(i % N, Math.floor(i / N)).length) return true; }
      return false;
    }
    function eliminate(c, reason) {
      alive[c] = false;
      for (let i = 0; i < N * N; i++) if (b[i] && b[i].c === c) b[i] = Object.assign({}, b[i], { dead: true });
      events.push({ e: 'elim', c, reason });
    }
    function settle() {
      let guard = 0, skipped = 0;
      while (activeCount() > 1 && guard++ < 30) {
        if (!alive[S.turn]) { S.turn = nextActive(S.turn); continue; }
        if (hasMove(S.turn)) return;
        if (kingAttacked(b, S.turn)) { eliminate(S.turn, 'checkmate'); S.turn = nextActive(S.turn); skipped = 0; continue; }
        events.push({ e: 'skip', c: S.turn }); S.turn = nextActive(S.turn);
        if (++skipped >= activeCount()) { S.drawn = true; return; }
      }
    }

    return {
      w: N, h: N, multi: true, hex: true, radius: R, seats,
      get turn() { return S.turn; },
      valid, kingPos,
      at: (x, y) => b[idx(x, y)],
      moves: (x, y) => { const p = b[idx(x, y)]; return p && p.c === S.turn ? legalAt(x, y) : []; },
      sees(c) {
        const set = new Set();
        for (let i = 0; i < N * N; i++) {
          const p = b[i];
          if (!p || p.dead || p.c !== c) continue;
          set.add(i);
          const x = i % N, y = Math.floor(i / N);
          pseudo(b, x, y, false).concat(pseudo(b, x, y, true)).forEach(m => set.add(idx(m.tx, m.ty)));
        }
        return set;
      },
      alive: c => !!alive[c],
      winner: () => (!S.drawn && activeCount() === 1 ? seats.find(c => alive[c]) : null),
      get drawn() { return S.drawn; },
      inCheck: c => !!alive[c] && kingAttacked(b, c),
      drainEvents() { const e = events.slice(); events.length = 0; return e; },
      history: () => hist.slice(),
      status: () => (activeCount() <= 1 || S.drawn ? 'over' : 'playing'),
      move(m) {
        if (activeCount() <= 1 || S.drawn || !valid(m.fx, m.fy)) return false;
        const p = b[idx(m.fx, m.fy)];
        if (!p || p.c !== S.turn) return false;
        const ok = legalAt(m.fx, m.fy).find(l => l.tx === m.tx && l.ty === m.ty && (l.promo || null) === (m.promo || null));
        if (!ok) return false;
        const vic = b[idx(ok.tx, ok.ty)];
        b[idx(ok.tx, ok.ty)] = { t: ok.promo || p.t, c: p.c, m: true }; b[idx(ok.fx, ok.fy)] = null;
        hist.push({ c: p.c, fx: ok.fx, fy: ok.fy, tx: ok.tx, ty: ok.ty, promo: ok.promo || null, cap: vic ? vic.t : null });
        S.turn = nextActive(S.turn); settle();
        return true;
      },
      resign(c) {
        if (!alive[c]) return;
        const wasTurn = S.turn === c;
        eliminate(c, 'resign');
        if (wasTurn) S.turn = nextActive(c);
        settle();
      }
    };
  }


  /*
   * Bughouse: two crazyhouse boards played at once by two teams of two.
   *   Board A: Red (White) vs Blue (Black).   Board B: Green (White) vs Yellow (Black).
   *   Teams: Red + Yellow  vs  Blue + Green.  A piece you capture goes to your PARTNER's hand (on the other board).
   * Both boards run at the same time (a player may move whenever it is their colour's turn on their board).
   * There are no clocks. Checkmate on either board ends the game; a player with no legal move (stalemate) simply
   * waits for a piece from their partner; if both boards are stuck like that the game is drawn.
   */
  function createBughouse() {
    const mk = () => create(Object.assign({}, CRAZYHOUSE, { bugBoard: true }));
    const bd = { A: mk(), B: mk() };
    const INFO = { r: ['A', 'w'], b: ['A', 'b'], g: ['B', 'w'], y: ['B', 'b'] };
    const PARTNER = { r: 'y', y: 'r', b: 'g', g: 'b' }, TEAMS = { r: 0, y: 0, b: 1, g: 1 };
    const seats = ['r', 'b', 'y', 'g'], S = { result: null, resigned: null }, hist = [];
    const seatOf = (board, color) => seats.find(c => INFO[c][0] === board && INFO[c][1] === color);
    function evaluate() {
      if (S.result) return;
      for (const k of ['A', 'B']) {
        if (bd[k].status() === 'checkmate') {
          const loser = seatOf(k, bd[k].turn);
          S.result = { team: 1 - TEAMS[loser], why: 'checkmate', loser, board: k };
          return;
        }
      }
      if (bd.A.status() === 'stalemate' && bd.B.status() === 'stalemate') S.result = { team: null, why: 'stalemate' };
    }
    return {
      bug: true, multi: true, seats, teams: TEAMS, boards: bd, info: INFO, partner: PARTNER, seatOf,
      get turn() { return null; },
      get result() { return S.result; },
      get drawn() { return !!S.result && S.result.team === null; },
      winner: () => (S.result && S.result.team !== null ? seats.find(c => TEAMS[c] === S.result.team) : null),
      alive: c => S.resigned !== c,
      status: () => (S.result ? 'over' : 'playing'),
      drainEvents: () => [],
      history: () => hist.slice(),
      canMove: seat => !S.result && !!INFO[seat] && bd[INFO[seat][0]].turn === INFO[seat][1],
      turnOf: board => bd[board].turn,
      inCheck: board => bd[board].inCheck(),
      stuck: board => bd[board].status() === 'stalemate',
      at: (board, x, y) => bd[board].at(x, y),
      moves: (board, x, y) => bd[board].moves(x, y),
      drops: board => bd[board].drops(),
      hand: seat => bd[INFO[seat][0]].hand(INFO[seat][1]),
      move(m) {
        const seat = m.seat;
        if (!INFO[seat] || S.result) return false;
        const [board, color] = INFO[seat], g = bd[board];
        if (g.turn !== color) return false;
        const mv = Object.assign({}, m); delete mv.seat;
        if (!g.move(mv)) return false;
        const h = g.history(), last = h[h.length - 1];
        hist.push(Object.assign({ seat, board }, last));
        if (last.cap) { const [pb, pc] = INFO[PARTNER[seat]]; bd[pb].addHand(pc, last.capPr ? 'p' : last.cap); }
        evaluate();
        return true;
      },
      resign(seat) {
        if (S.result || !INFO[seat]) return;
        S.resigned = seat;
        S.result = { team: 1 - TEAMS[seat], why: 'resign', loser: seat };
      }
    };
  }

  function create(v = STANDARD) {
    if (v.bug) return createBughouse();
    if (v.hex) return createHex(v);
    if (v.multi) return v.alice ? createAlice4(v) : createMulti(v);
    if (v.alice) return createAlice();
    const w = v.w, h = v.h;
    const inB = (x, y) => x >= 0 && y >= 0 && x < w && y < h;
    const idx = (x, y) => y * w + x;
    const opp = c => (c === 'w' ? 'b' : 'w');

    const b0 = new Array(w * h).fill(null);
    v.setup.forEach((row, i) => [...row].forEach((ch, x) => {
      if (ch !== '.') b0[idx(x, h - 1 - i)] = { t: ch.toLowerCase(), c: ch === ch.toUpperCase() ? 'w' : 'b', m: false };
    }));
    let S = { b: b0, turn: v.first || 'w', ep: null, hands: { w: {}, b: {} }, left: v.firstSingle ? 1 : (v.movesPerTurn || 1) };
    const hist = [], stCache = new WeakMap();

    function pseudo(S, x, y, attackOnly) {
      const p = S.b[idx(x, y)], out = [], def = v.pieces[p.t];
      const add = (tx, ty, extra) => out.push(Object.assign({ fx: x, fy: y, tx, ty }, extra));
      if (p.t === 'p') {
        const d = p.c === 'w' ? 1 : -1;
        const last = v.promoRank ? v.promoRank[p.c] : (p.c === 'w' ? h - 1 : 0);
        const start = v.pawnStart ? v.pawnStart[p.c] : (p.c === 'w' ? 1 : h - 2);
        const push = (tx, ty, extra) => {
          if (ty === last) v.promoteTo.forEach(t => add(tx, ty, { promo: t }));
          else add(tx, ty, extra);
        };
        if (inB(x, y + d) && !S.b[idx(x, y + d)]) {
          push(x, y + d);
          if (y === start && inB(x, y + 2 * d) && !S.b[idx(x, y + 2 * d)]) add(x, y + 2 * d, { dbl: true });
        }
        for (const dx of [-1, 1]) {
          const tx = x + dx, ty = y + d;
          if (!inB(tx, ty)) continue;
          const t = S.b[idx(tx, ty)];
          if (t && t.c !== p.c) push(tx, ty);
          else if (!t && S.ep && S.ep.c !== p.c && S.ep.x === tx && S.ep.y === ty) add(tx, ty, { ep: true });
        }
        return out;
      }
      for (const [dx, dy] of def.leap || []) {
        const tx = x + dx, ty = y + dy;
        if (inB(tx, ty)) { const t = S.b[idx(tx, ty)]; if (!t || t.c !== p.c) add(tx, ty); }
      }
      for (const [dx, dy] of def.slide || []) {
        let tx = x + dx, ty = y + dy;
        while (inB(tx, ty)) {
          const t = S.b[idx(tx, ty)];
          if (!t) add(tx, ty);
          else { if (t.c !== p.c) add(tx, ty); break; }
          tx += dx; ty += dy;
        }
      }
      if (p.t === 'k' && v.castling && !p.m && !attackOnly && !attacked(S, x, y, opp(p.c))) {
        for (const d of [1, -1]) {
          let rx = x + d;
          while (inB(rx, y) && !S.b[idx(rx, y)]) rx += d;
          const r = inB(rx, y) && S.b[idx(rx, y)];
          if (!r || r.t !== 'r' || r.c !== p.c || r.m || Math.abs(rx - x) < 3) continue;
          if (inB(x + 2 * d, y) && !attacked(S, x + d, y, opp(p.c)) && !attacked(S, x + 2 * d, y, opp(p.c)))
            add(x + 2 * d, y, { castle: d > 0 ? 'k' : 'q', rx, rtx: x + d });
        }
      }
      return out;
    }

    function attacked(S, x, y, by) {
      for (let i = 0; i < w * h; i++) {
        const p = S.b[i];
        if (!p || p.c !== by) continue;
        const px = i % w, py = (i - px) / w;
        if (p.t === 'p') {
          if (py + (by === 'w' ? 1 : -1) === y && Math.abs(px - x) === 1) return true;
        } else if (pseudo(S, px, py, true).some(m => m.tx === x && m.ty === y)) return true;
      }
      return false;
    }

    function inCheck(S, c) {
      for (let i = 0; i < w * h; i++) {
        const p = S.b[i];
        if (p && p.t === 'k' && p.c === c) { const x = i % w; return attacked(S, x, (i - x) / w, opp(c)); }
      }
      return false;
    }

    function apply(S, m) {
      const b = S.b.slice(), c = S.turn;
      let hands = S.hands;
      const copyHands = () => { hands = { w: Object.assign({}, hands.w), b: Object.assign({}, hands.b) }; };
      if (m.drop) {
        copyHands(); hands[c][m.drop]--;
        b[idx(m.tx, m.ty)] = { t: m.drop, c, m: true };
        return next(S, b, null, hands);
      }
      const p = b[idx(m.fx, m.fy)];
      const vx = m.ep ? idx(m.tx, m.fy) : idx(m.tx, m.ty), victim = b[vx];
      if (v.drops && !v.bugBoard && victim) { copyHands(); const k = victim.pr ? 'p' : victim.t; hands[c][k] = (hands[c][k] || 0) + 1; }
      b[idx(m.fx, m.fy)] = null;
      if (m.ep) b[vx] = null;
      b[idx(m.tx, m.ty)] = { t: m.promo || p.t, c: p.c, m: true, pr: !!m.promo || !!p.pr };
      if (m.castle) { b[idx(m.rx, m.fy)] = null; b[idx(m.rtx, m.fy)] = { t: 'r', c: p.c, m: true }; }
      return next(S, b, m.dbl ? { x: m.tx, y: (m.fy + m.ty) / 2, c: p.c } : null, hands);
    }

    // Decides whose turn it is after a move. Marseillais: giving check, or having no
    // legal second move, ends the turn early.
    function next(S, b, ep, hands) {
      const c = S.turn, N = { b, turn: c, ep, hands, left: S.left - 1 };
      if (N.left > 0 && inCheck(N, opp(c))) N.left = 0;
      if (N.left > 0 && all(N).length === 0) N.left = 0;
      if (N.left <= 0) { N.turn = opp(c); N.left = v.movesPerTurn || 1; }
      return N;
    }

    // Draw by insufficient material: bare kings, king + one minor piece, or only same-coloured bishops.
    function deadPosition(S) {
      const minors = [];
      for (let i = 0; i < w * h; i++) {
        const p = S.b[i];
        if (!p || p.t === 'k') continue;
        if (p.t !== 'b' && p.t !== 'n') return false;
        minors.push({ t: p.t, sq: ((i % w) + Math.floor(i / w)) % 2 });
      }
      if (minors.length <= 1) return true;
      return minors.every(m => m.t === 'b' && m.sq === minors[0].sq);
    }

    function drops(S) {
      const out = [], hand = S.hands[S.turn];
      for (const t in hand) {
        if (!(hand[t] > 0)) continue;
        for (let i = 0; i < w * h; i++) {
          if (S.b[i]) continue;
          const y = Math.floor(i / w);
          if (t === 'p' && (y === 0 || y === h - 1)) continue;
          if (v.dropZone === 'own' && (S.turn === 'w' ? y >= h / 2 : y < h / 2)) continue;
          out.push({ drop: t, tx: i % w, ty: y });
        }
      }
      return out.filter(m => !inCheck(apply(S, m), S.turn));
    }

    const legal = (S, x, y) => pseudo(S, x, y).filter(m => !inCheck(apply(S, m), S.turn));

    function all(S) {
      const out = [];
      for (let i = 0; i < w * h; i++) {
        const p = S.b[i];
        if (p && p.c === S.turn) { const x = i % w; out.push(...legal(S, x, (i - x) / w)); }
      }
      if (v.drops) out.push(...drops(S));
      return out;
    }

    function perft(S, d) {
      if (!d) return 1;
      let n = 0;
      for (const m of all(S)) n += d === 1 ? 1 : perft(apply(S, m), d - 1);
      return n;
    }

    return {
      w, h,
      get turn() { return S.turn; },
      get left() { return S.left; },
      at: (x, y) => S.b[idx(x, y)],
      moves: (x, y) => { const p = S.b[idx(x, y)]; return p && p.c === S.turn ? legal(S, x, y) : []; },
      // Fog of war: your own pieces plus every square they could move to or attack.
      sees(c) {
        const set = new Set();
        for (let i = 0; i < w * h; i++) {
          const p = S.b[i];
          if (!p || p.c !== c) continue;
          set.add(i);
          const x = i % w, y = Math.floor(i / w);
          pseudo(S, x, y, false).concat(pseudo(S, x, y, true)).forEach(m => set.add(idx(m.tx, m.ty)));
        }
        return set;
      },
      hand: c => Object.assign({}, S.hands[c]),
      // Bughouse: a piece captured on the partner's board arrives in this hand.
      addHand(c, t) {
        const hands = { w: Object.assign({}, S.hands.w), b: Object.assign({}, S.hands.b) };
        hands[c][t] = (hands[c][t] || 0) + 1;
        S = Object.assign({}, S, { hands });
      },
      drops: () => (v.drops ? drops(S) : []),
      move(m) {
        if (m.drop) {
          const d = v.drops && drops(S).find(l => l.drop === m.drop && l.tx === m.tx && l.ty === m.ty);
          if (!d) return false;
          S = apply(S, d); hist.push({ drop: m.drop, tx: m.tx, ty: m.ty });
          return true;
        }
        const src = inB(m.fx, m.fy) && S.b[idx(m.fx, m.fy)];
        if (!src || src.c !== S.turn) return false;
        const ok = legal(S, m.fx, m.fy).find(l => l.tx === m.tx && l.ty === m.ty && (l.promo || null) === (m.promo || null));
        if (!ok) return false;
        const vic = S.b[idx(ok.tx, ok.ty)] || (ok.ep ? S.b[idx(ok.tx, ok.fy)] : null);
        S = apply(S, ok); hist.push({ fx: m.fx, fy: m.fy, tx: m.tx, ty: m.ty, promo: m.promo || null, cap: vic ? vic.t : null, capPr: !!(vic && vic.pr) });
        return true;
      },
      inCheck: () => inCheck(S, S.turn),
      status() {
        if (stCache.has(S)) return stCache.get(S);
        if (!v.drops && deadPosition(S)) { stCache.set(S, 'draw'); return 'draw'; }
        const none = all(S).length === 0, c = inCheck(S, S.turn);
        const r = none ? (c ? 'checkmate' : 'stalemate') : (c ? 'check' : 'playing');
        stCache.set(S, r); return r;
      },
      history: () => hist.slice(),
      perft: d => perft(S, d)
    };
  }

  const CRAZYHOUSE = Object.assign({}, STANDARD, { drops: true });
  const MARSEILLAIS = Object.assign({}, STANDARD, { movesPerTurn: 2, firstSingle: true });

  // A big board with the standard army in the middle (a stand-in for a truly endless board).
  function bigVariant(W, H) {
    const ox = (W - 8) >> 1, oy = (H - 8) >> 1, rows = [];
    for (let y = H - 1; y >= 0; y--) {
      let row = '';
      for (let x = 0; x < W; x++) {
        const sx = x - ox, sy = y - oy;
        row += (sx >= 0 && sx < 8 && sy >= 0 && sy < 8) ? STANDARD.setup[7 - sy][sx] : '.';
      }
      rows.push(row);
    }
    return Object.assign({}, STANDARD, { w: W, h: H, setup: rows, castling: true,
      pawnStart: { w: oy + 1, b: oy + 6 }, promoRank: { w: oy + 7, b: oy } });
  }
  const INFINITE = bigVariant(32, 32);
  const ALICE = Object.assign({}, STANDARD, { alice: true, castling: false });
  const BUGHOUSE = { bug: true, multi: true };
  const FOUR = { multi: true, seats: ['r', 'b', 'y', 'g'], dead: [], castling: true };
  const THREE = { multi: true, hex: true, seats: ['r', 'b', 'y'], dead: [] };

  return { create, STANDARD, CRAZYHOUSE, MARSEILLAIS, INFINITE, ALICE, FOUR, THREE, BUGHOUSE, ROOK, BISHOP, ALL, KNIGHT };
})();

if (typeof module !== 'undefined') module.exports = Engine;
