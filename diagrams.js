/* Movement diagrams for the piece guides (Austang Grand + Imperial Chess).
   Nothing is drawn by hand: every diagram is computed by asking the real engine what the piece can do, so it can never disagree with the rules
   and a NEW piece gets its diagram automatically as soon as the engine knows it.

   Diagrams.grid2p(variant, type, opts)   2-player engine (Engine.create); `variant` = the mode's variant object (it carries the piece table)
   Diagrams.gridImp(type, opts)           Imperial engine (Imperial.create)
   Both return { N, R, rows } where rows[0] is the TOP row (the side the piece moves towards) and every character is one square:
     .  nothing     o  the piece itself     m  can move there but not capture (e.g. a pawn's step, Grand Rook's knight squares)
     c  can only capture there (e.g. a pawn's diagonal)     b  can move there or capture there     s  shoots it (captures without moving)
   Method: put the piece on an otherwise empty board (kings / Imperials far outside the window so they never interfere) and ask for its moves;
   then, for every square of the window, put one enemy piece there and ask again - a move onto that square is a capture / a shot. */
const Diagrams = (() => {
  const cache = new Map();
  const classify = (empty, withTarget, shot) => (withTarget ? (shot ? 's' : (empty ? 'b' : 'c')) : (empty ? 'm' : '.'));

  function grid2p(Engine, V, t, o) {
    o = o || {};
    const R = o.R || 5, N = 2 * R + 1, B = N + 4, cx = R + 2, pawn = (t === 'p' || t === '\u03c1') && !o.mid, cy = pawn ? 1 : R + 2, ox = cx - R, oy = pawn ? 0 : cy - R;
    const key = '2p|' + V.w + 'x' + V.h + '|' + Object.keys(V.pieces || {}).length + '|' + t + '|' + JSON.stringify(o) + '|' + R;
    if (cache.has(key)) return cache.get(key);
    const build = target => {
      const rows = Array.from({ length: B }, () => Array(B).fill('.'));
      const put = (x, y, ch) => { rows[B - 1 - y][x] = ch; };
      if (t !== 'k') put(0, 0, 'K');
      put(B - 1, B - 1, 'k'); put(cx, cy, t.toUpperCase());
      (o.extra || []).forEach(e => put(cx + e.dx, cy + e.dy, e.c === 'w' ? e.t.toUpperCase() : e.t));
      if (target) put(target[0], target[1], 'n');
      return Engine.create(Object.assign({}, V, { w: B, h: B, setup: rows.map(r => r.join('')), castling: false, first: 'w' }));
    };
    const tos = g => { const s = new Set(); g.moves(cx, cy).forEach(m => s.add(m.tx + ',' + m.ty)); return s; };
    const empty = tos(build(null)), out = [];
    for (let j = N - 1; j >= 0; j--) {                    // top row first
      let row = '';
      for (let i = 0; i < N; i++) {
        const x = ox + i, y = oy + j;
        if (x === cx && y === cy) { row += 'o'; continue; }
        if ((o.extra || []).some(e => cx + e.dx === x && cy + e.dy === y)) { row += 'e'; continue; }      // a helper piece stands here (drawn by the page)
        const hit = tos(build([x, y])).has(x + ',' + y);
        row += classify(empty.has(x + ',' + y), hit, false);
      }
      out.push(row);
    }
    const res = { N, R, rows: out, extras: extrasOf(o, cx - ox, N - 1 - (cy - oy)) }; cache.set(key, res); return res;
  }
  const extrasOf = (o, ic, jc) => (o.extra || []).map(e => ({ i: ic + e.dx, j: jc - e.dy, t: e.t, c: e.c }));

  // Imperial: `state` lists which of the piece's own Imperials stay on the board ('EXH' by default); the diagram is for the full army-less position
  function gridImp(Imperial, t, o) {
    o = o || {};
    const R = o.R || 6, N = 2 * R + 1, cx = 8, pawnLike = 'pvm'.includes(t), cy = pawnLike ? 2 : 7, oy = pawnLike ? 0 : cy - R, ox = cx - R;
    const keep = o.keep === undefined ? 'EXH' : o.keep;
    const key = 'imp|' + t + '|' + keep + '|' + JSON.stringify(o) + '|' + R;
    if (cache.has(key)) return cache.get(key);
    const build = target => {
      const ps = [];
      [['E', 5], ['X', 8], ['H', 11]].forEach(([k, x]) => { if (keep.includes(k) && k !== t) ps.push({ t: k, c: 'w', x, y: 0 }); ps.push({ t: k, c: 'b', x, y: 15 }); });
      ps.push({ t, c: 'w', x: cx, y: cy, m: !!o.moved });
      (o.extra || []).forEach(e => ps.push({ t: e.t, c: e.c, x: cx + e.dx, y: cy + e.dy, m: true }));
      if (target) ps.push({ t: 'b', c: 'b', x: target[0], y: target[1] });      // a plain black bishop: no Imperial immunity, no aura or Guard protection, so every attacker can take it
      return Imperial.create({ pieces: ps });
    };
    const info = g => { const s = new Map(); g.moves(cx, cy).forEach(m => { const k = m.tx + ',' + m.ty; if (!s.has(k) || !m.shoot) s.set(k, !!m.shoot); }); return s; };
    const empty = info(build(null)), out = [];
    for (let j = N - 1; j >= 0; j--) {
      let row = '';
      for (let i = 0; i < N; i++) {
        const x = ox + i, y = oy + j;
        if (x === cx && y === cy) { row += 'o'; continue; }
        if ((o.extra || []).some(e => cx + e.dx === x && cy + e.dy === y)) { row += 'e'; continue; }
        if (build(null).cut(x, y)) { row += '#'; continue; }
        if (t === 'f' && Math.max(Math.abs(x - cx), Math.abs(y - cy)) <= 1) { row += empty.has(x + ',' + y) ? 'm' : '.'; continue; }      // (a Jester borrows from whatever stands next to it - including the probe piece - so don't probe its neighbours)
        const k = x + ',' + y, tg = info(build([x, y])), hit = tg.has(k);
        row += classify(empty.has(k), hit, hit && tg.get(k));
      }
      out.push(row);
    }
    const res = { N, R, rows: out, extras: extrasOf(o, cx - ox, N - 1 - (cy - oy)) }; cache.set(key, res); return res;
  }

  // The different situations worth drawing for a piece: [{ label, o }] (o = options for grid2p / gridImp). The first one is the plain piece.
  function states(kind, t) {
    const st = [{ label: '', o: {} }];
    if (kind === 'grand') {
      if (t === 'p' || t === '\u03c1') st.push({ label: 'Anywhere except its starting rank', o: { mid: true } });
      const scr = ds => ds.map(([dx, dy]) => ({ t: 'p', c: 'w', dx, dy }));      // friendly pawns used as hurdles / screens
      if (t === '\u03c0') { st[0].label = 'Moves (it cannot capture this way)'; st.push({ label: 'Captures: hops over exactly one piece (here friendly pawns)', o: { extra: scr([[2, 0], [-2, 0], [0, 2], [0, -2]]) } }); }
      if (t === '\u03b8') { st[0] = { label: 'Hops over a piece (here friendly pawns) and lands right behind it', o: { extra: scr([[2, 0], [-2, 0], [0, 2], [0, -2], [2, 2], [-2, 2], [2, -2], [-2, -2]]) } }; }
      return st;
    }
    if (t === 'E') st.push({ label: 'After the Empress is lost', o: { keep: 'H' } });
    if (t === 'X') st.push({ label: 'After the Emperor is lost', o: { keep: 'H' } });
    if (t === 'H') st.push({ label: 'After the Emperor and Empress are lost', o: { keep: '' } });
    if (t === 'k') st.push({ label: 'With a friendly piece next to it (here a Pawn up-right)', o: { extra: [{ t: 'p', c: 'w', dx: 1, dy: 1 }] } });
    if ('pvm'.includes(t)) { st[0].label = 'First move'; st.push({ label: 'Later moves', o: { moved: true } }); st.push({ label: 'Later moves, near a friendly King (aura)', o: { moved: true, extra: [{ t: 'k', c: 'w', dx: 0, dy: -1 }] } }); }
    if (t === 'f') st.push({ label: 'With a Knight next to it (it borrows its moves)', o: { extra: [{ t: 'n', c: 'b', dx: 1, dy: 0 }] } });
    return st;
  }
  return { grid2p, gridImp, states, clear: () => cache.clear() };
})();
if (typeof module !== 'undefined') module.exports = Diagrams;
