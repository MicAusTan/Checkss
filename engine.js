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

  /*
   * 3/4-player chess on a 14x14 cross-shaped board (3x3 corners removed).
   * Colors r (bottom), b (left), y (top), g (right); turns go clockwise r > b > y > g.
   * A player with no legal move (checkmate or stalemate) or who resigns is eliminated:
   * their pieces turn into gray, inert blockers that anyone can capture. Last player standing wins.
   * Kings can never be captured; no castling or en passant. Pawns promote on their 11th rank.
   * 3-player: the unused seat starts as a gray wall.
   */
  function createMulti(v) {
    const N = 14, idx = (x, y) => y * N + x;
    const valid = (x, y) => x >= 0 && y >= 0 && x < N && y < N && !((x < 3 || x > 10) && (y < 3 || y > 10));
    const ORDER = ['r', 'b', 'y', 'g'], seats = v.seats;
    const FWD = { r: [0, 1], b: [1, 0], y: [0, -1], g: [-1, 0] };
    const rankOf = (c, x, y) => (c === 'r' ? y : c === 'b' ? x : c === 'y' ? 13 - y : 13 - x);
    const ROT = { r: (x, y) => [x, y], b: (x, y) => [y, 13 - x], y: (x, y) => [13 - x, 13 - y], g: (x, y) => [13 - y, x] };
    const defs = STANDARD.pieces, BACK = 'rnbqkbnr';
    const b = new Array(N * N).fill(null), alive = {}, events = [], hist = [];
    ORDER.forEach(c => {
      if (!seats.includes(c) && !(v.dead || []).includes(c)) return;
      alive[c] = seats.includes(c);
      for (let k = 0; k < 8; k++) {
        const [bx, by] = ROT[c](3 + k, 0), [px, py] = ROT[c](3 + k, 1);
        b[idx(bx, by)] = { t: BACK[k], c, dead: !alive[c] };
        b[idx(px, py)] = { t: 'p', c, dead: !alive[c] };
      }
    });
    const S = { turn: seats[0] };
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
      const can = t => t.c !== p.c && (atk || t.t !== 'k');
      if (p.t === 'p') {
        const [dx, dy] = FWD[p.c], pp = dx === 0 ? [1, 0] : [0, 1];
        const push = (tx, ty) => (rankOf(p.c, tx, ty) === 10 ? STANDARD.promoteTo.forEach(t => add(tx, ty, { promo: t })) : add(tx, ty));
        const fx = x + dx, fy = y + dy;
        if (!atk && valid(fx, fy) && !B[idx(fx, fy)]) {
          push(fx, fy);
          if (rankOf(p.c, x, y) === 1 && valid(fx + dx, fy + dy) && !B[idx(fx + dx, fy + dy)]) add(fx + dx, fy + dy);
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
        B[idx(m.tx, m.ty)] = { t: m.promo || p.t, c: p.c }; B[idx(x, y)] = null;
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
      let guard = 0;
      while (activeCount() > 1 && guard++ < 10) {
        if (!alive[S.turn]) { S.turn = nextActive(S.turn); continue; }
        if (hasMove(S.turn)) return;
        eliminate(S.turn, kingAttacked(b, S.turn) ? 'checkmate' : 'stalemate');
        S.turn = nextActive(S.turn);
      }
    }

    return {
      w: N, h: N, multi: true, seats,
      get turn() { return S.turn; },
      valid, kingPos,
      at: (x, y) => b[idx(x, y)],
      moves: (x, y) => { const p = b[idx(x, y)]; return p && p.c === S.turn ? legalAt(x, y) : []; },
      alive: c => !!alive[c],
      winner: () => (activeCount() === 1 ? seats.find(c => alive[c]) : null),
      inCheck: c => !!alive[c] && kingAttacked(b, c),
      drainEvents() { const e = events.slice(); events.length = 0; return e; },
      history: () => hist.slice(),
      status: () => (activeCount() <= 1 ? 'over' : 'playing'),
      move(m) {
        if (activeCount() <= 1 || !valid(m.fx, m.fy)) return false;
        const p = b[idx(m.fx, m.fy)];
        if (!p || p.c !== S.turn) return false;
        const ok = legalAt(m.fx, m.fy).find(l => l.tx === m.tx && l.ty === m.ty && (l.promo || null) === (m.promo || null));
        if (!ok) return false;
        const vic = b[idx(ok.tx, ok.ty)];
        b[idx(ok.tx, ok.ty)] = { t: ok.promo || p.t, c: p.c }; b[idx(ok.fx, ok.fy)] = null;
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

  function create(v = STANDARD) {
    if (v.multi) return createMulti(v);
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
          const rx = d > 0 ? w - 1 : 0, r = S.b[idx(rx, y)];
          if (!r || r.t !== 'r' || r.c !== p.c || r.m) continue;
          let clear = true;
          for (let cx = x + d; cx !== rx; cx += d) if (S.b[idx(cx, y)]) clear = false;
          if (clear && inB(x + 2 * d, y) && !attacked(S, x + d, y, opp(p.c)) && !attacked(S, x + 2 * d, y, opp(p.c)))
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
      if (v.drops && victim) { copyHands(); const k = victim.pr ? 'p' : victim.t; hands[c][k] = (hands[c][k] || 0) + 1; }
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

    function drops(S) {
      const out = [], hand = S.hands[S.turn];
      for (const t in hand) {
        if (!(hand[t] > 0)) continue;
        for (let i = 0; i < w * h; i++) {
          if (S.b[i]) continue;
          const y = Math.floor(i / w);
          if (t === 'p' && (y === 0 || y === h - 1)) continue;
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
      hand: c => Object.assign({}, S.hands[c]),
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
        S = apply(S, ok); hist.push({ fx: m.fx, fy: m.fy, tx: m.tx, ty: m.ty, promo: m.promo || null, cap: vic ? vic.t : null });
        return true;
      },
      inCheck: () => inCheck(S, S.turn),
      status() {
        if (stCache.has(S)) return stCache.get(S);
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
    return Object.assign({}, STANDARD, { w: W, h: H, setup: rows, castling: false,
      pawnStart: { w: oy + 1, b: oy + 6 }, promoRank: { w: oy + 7, b: oy } });
  }
  const INFINITE = bigVariant(32, 32);
  const ALICE = Object.assign({}, STANDARD, { alice: true, castling: false });
  const FOUR = { multi: true, seats: ['r', 'b', 'y', 'g'], dead: [] };
  const THREE = { multi: true, seats: ['r', 'b', 'y'], dead: ['g'] };

  return { create, STANDARD, CRAZYHOUSE, MARSEILLAIS, INFINITE, ALICE, FOUR, THREE, ROOK, BISHOP, ALL, KNIGHT };
})();

if (typeof module !== 'undefined') module.exports = Engine;
