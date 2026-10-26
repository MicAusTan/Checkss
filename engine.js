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




  // ================= simple bots (run by the host) =================
  // Easy: mostly random, sometimes grabs the biggest piece it can. Normal: picks the move with the best
  // "what I take, minus the most the opponents could take back next" score; takes checks and mates when it sees them.
  const BOT_VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0, c: 2, i: 3, w: 3, o: 3, a: 6, l: 6 };
  const bv = t => BOT_VAL[t] || 0;
  function botChoose(game, seat, level) {
    if (game.cls && CLASSES[game.cls[seat]] && CLASSES[game.cls[seat]].secret) return null;      // bots never play a secret class (Glitch)
    const rand = a => a[Math.floor(Math.random() * a.length)];
    let cands;
    if (game.evalMoves) cands = game.evalMoves(seat);
    else {                                         // hex / Alice boards: no look-ahead, just captures and randomness
      cands = [];
      for (let l = 0; l < (game.layers || 1); l++) for (let y = 0; y < game.h; y++) for (let x = 0; x < game.w; x++) {
        if (game.valid && !game.valid(x, y)) continue;
        for (const m of (game.layers ? game.moves(x, y, l) : game.moves(x, y))) {
          const t = game.layers ? game.at(m.tx, m.ty, m.fl) : game.at(m.tx, m.ty);
          cands.push({ m, cap: t && t.c !== seat ? t.t : null, threat: 0, check: false, mate: false, pos: 0 });
        }
      }
      if (game.drops) game.drops().forEach(m => cands.push({ m, cap: null, threat: 0, check: false, mate: false, pos: 0 }));
    }
    if (!cands.length) return null;
    if (level === 'easy') {
      const caps = cands.filter(x => x.cap);
      if (caps.length && Math.random() < 0.6) { const best = Math.max(...caps.map(x => bv(x.cap))); return rand(caps.filter(x => bv(x.cap) === best)).m; }
      return rand(cands).m;
    }
    let best = -1e9, pool = [];
    for (const x of cands) {
      const m = x.m;
      let sc = bv(x.cap) - 0.95 * x.threat + (x.check ? 0.4 : 0) + (x.mate ? 100 : 0) + 0.08 * x.pos + Math.random() * 0.35;
      if (m.promo) sc += m.promo === 'q' ? 8 : 1.5;
      if (m.drop) sc += 0.3;
      if (m.castle) sc += 0.3;
      if (sc > best + 1e-9) { best = sc; pool = [m]; } else if (Math.abs(sc - best) <= 1e-9) pool.push(m);
    }
    return rand(pool);
  }

  // ================= class traits =================
  // Each player secretly picks one trait before the game (see the draft in index.html). A trait can change the starting
  // set-up (setup), piece movement (defs), pawn rules (pawn flags) or add a special rule handled inside the engines.
  const EDGE8 = ROOK.concat(BISHOP);
  const FIVE = [];
  for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) if (dx || dy) FIVE.push([dx, dy]);
  const CAMEL = [[3, 1], [3, -1], [-3, 1], [-3, -1], [1, 3], [1, -3], [-1, 3], [-1, -3]];
  const KN8 = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
  const HOP4 = [[2, 0], [-2, 0], [0, 2], [0, -2]];
  const HOP8 = [[2, 0], [-2, 0], [0, 2], [0, -2], [2, 2], [2, -2], [-2, 2], [-2, -2]];
  const ZEBRA = [[3, 2], [3, -2], [-3, 2], [-3, -2], [2, 3], [2, -3], [-2, 3], [-2, -3]];
  // Piece types only created by traits: a = Archbishop, l = Paladin.
  const EXTRA_PIECES = {
    a: { slide: BISHOP, leap: KN8.concat(HOP8) },
    l: { leap: KN8.concat(CAMEL, ZEBRA) }
  };
  // ---- Austang Grand (10x10 fairy army). Own piece codes (Greek letters: they keep upper/lower case for the two colours and can't clash with the class/Imperial letters) ----
  const GRAND_PIECES = {
    '\u03b1': { slide: BISHOP, leap: KN8 },        // Cardinal: bishop + knight
    '\u03c7': { slide: ROOK, leap: KN8 },          // Marshal: rook + knight (captures with both)
    '\u03c9': { slide: EDGE8, leap: KN8 },         // Amazon: queen + knight
    '\u03bd': { slide: KN8 },                      // Nightrider: repeats the knight jump along a line (stops at the first piece on it)
    '\u03b3': { leap: CAMEL },                     // Camel: (3,1) leaper
    '\u03b6': { leap: ZEBRA },                     // Zebra: (3,2) leaper
    '\u03b4': { slide: ROOK, leap: BISHOP },       // Dragon King: rook + one diagonal step
    '\u03b7': { slide: BISHOP, leap: ROOK },       // Dragon Horse: bishop + one orthogonal step
    '\u03ba': { leap: EDGE8.concat(KN8) },         // Centaur: king + knight
    '\u03b2': { leap: CAMEL.concat(ZEBRA) },       // Bison: camel + zebra leaps
    '\u03c0': { slideNC: ROOK, hop: ROOK },        // Cannon: slides like a rook without capturing; captures by hopping exactly one piece
    '\u03b8': { grass: EDGE8 },                    // Grasshopper: along a queen line, hops over the first piece and lands right behind it
    '\u03c6': { leap: BISHOP },                    // Ferz: one step diagonally
    '\u03c8': { leap: ROOK },                      // Wazir: one step orthogonally
    '\u03be': { leap: [[2, 2], [2, -2], [-2, 2], [-2, -2]] },   // Alfil: leaps exactly 2 diagonally
    '\u03c4': { leap: HOP4 },                      // Dabbaba: leaps exactly 2 orthogonally
    '\u03c1': {},                                  // Berolina pawn (own rule in the move generator: steps diagonally, captures straight ahead)
    '\u03bc': { leap: EDGE8 },                     // Sacrificer: king-step walker; instead of moving it can turn itself into one of your captured pieces (own rule)
    '\u03b9': { leap: EDGE8 },                     // Reviver: king-step walker; can place a captured piece on an empty square next to it, then recharges (own rule)
    '\u03b5': { leap: EDGE8 }                      // Herald: king-step walker; pawns near it can't capture/attack but may take free steps (own rule)
  };
  const GRAND_RULES = { sac: '\u03bc', rev: '\u03b9', her: '\u03b5', revCd: 4, herR: 2, herN: 5 };   // revCd = own turns a Reviver must wait after reviving; herR = Herald radius (2 = a 5x5 area); herN = free pawn steps per turn (total, any pawns)
  const AUSTANG_GRAND = Object.assign({}, STANDARD, {
    w: 10, h: 10,
    pieces: Object.assign({}, STANDARD.pieces, GRAND_PIECES),
    setup: ['rnb\u03b1qk\u03c7bnr', 'pppppppppp', '..........', '..........', '..........', '..........', '..........', '..........', 'PPPPPPPPPP', 'RNB\u0391QK\u03a7BNR'],
    promoteTo: ['q', 'r', 'b', 'n', '\u03b1', '\u03c7', '\u03bd'],
    castling: true
  });
  const knightOffsets = () => STANDARD.pieces.n.leap;
  const ROAM5 = []; for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) if (dx || dy) ROAM5.push([dx, dy]);      // every square of the 5x5 around a piece
  // class passives like "knights can also jump 2 straight": append leaps to whatever the piece's definition currently is
  const withAdd = (defs, add) => { const o = Object.assign({}, defs); for (const k in add) o[k] = Object.assign({}, o[k], { leap: ((o[k] && o[k].leap) || []).concat(add[k].leap) }); return o; };
  const TRAITS = {
    // ---- starting set-up ----
    flanker:       { name: 'Flanker', desc: 'Your edge pawns are replaced by a bishop and a knight.', setup: (back, pawns) => { pawns[0] = 'b'; pawns[7] = 'n'; } },
    twinTowers:    { name: 'Twin Towers', desc: 'Both of your knights are replaced by rooks.', setup: back => back.forEach((t, i) => { if (t === 'n') back[i] = 'r'; }) },
    bishopBrigade: { name: 'Bishop Brigade', desc: 'Both of your knights are replaced by bishops.', setup: back => back.forEach((t, i) => { if (t === 'n') back[i] = 'b'; }) },
    knightCavalry: { name: 'Knight Cavalry', desc: 'Both of your bishops are replaced by knights.', setup: back => back.forEach((t, i) => { if (t === 'b') back[i] = 'n'; }) },
    // ---- piece movement ----
    longKing:      { name: 'Long Reach King', desc: 'Your king reaches every square in the 5×5 around it except the four corners, but it cannot jump: a square 2 away in a straight line needs the square between to be empty, and a knight-shaped square needs at least one of its two connecting squares to be empty.', defs: () => ({ k: { slide: ROOK, max: 2, leap: BISHOP, kwalk: true } }) },
    steadfast:     { name: 'Steadfast Knights', desc: 'Your knights can also step 1 square: straight steps can capture, diagonal steps can only move to empty squares.', defs: () => ({ n: { leap: knightOffsets().concat(ROOK), leapNC: BISHOP } }) },
    camelRiders:   { name: 'Camel Riders', desc: 'Your knights can also make the long 3-and-1 jump.', defs: () => ({ n: { leap: knightOffsets().concat(CAMEL) } }) },
    sidestepRooks: { name: 'Sidestep Rooks', desc: 'Your rooks can also step 1 square diagonally.', defs: () => ({ r: { slide: ROOK, leap: BISHOP } }) },
    pushyBishops:  { name: 'Pushy Bishops', desc: 'Your bishops can also step 1 square straight.', defs: () => ({ b: { slide: BISHOP, leap: ROOK } }) },
    amazonQueen:   { name: 'Amazon Queen', desc: 'Your queen can also jump like a knight.', defs: () => ({ q: { slide: EDGE8, leap: knightOffsets() } }) },
    jumpingRooks:  { name: 'Hurdling Rooks', desc: 'Your rooks can also jump exactly 2 squares straight, over anything.', defs: () => ({ r: { slide: ROOK, leap: [[2, 0], [-2, 0], [0, 2], [0, -2]] } }) },
    hoppingBishops:{ name: 'Hopping Bishops', desc: 'Your bishops can also jump exactly 2 squares diagonally, over anything.', defs: () => ({ b: { slide: BISHOP, leap: [[2, 2], [2, -2], [-2, 2], [-2, -2]] } }) },
    queenHop:      { name: 'Dancing Queen', desc: 'Your queen can also jump exactly 2 squares in any of the 8 directions, over anything.', defs: () => ({ q: { slide: EDGE8, leap: [[2, 0], [-2, 0], [0, 2], [0, -2], [2, 2], [2, -2], [-2, 2], [-2, -2]] } }) },
    knightKing:    { name: 'Knightly King', desc: 'Your king can also move like a knight, jumping over pieces.', defs: () => ({ k: { leap: STANDARD.pieces.k.leap.concat(knightOffsets()) } }) },
    stags:         { name: 'Stag Knights', desc: 'Your knights can also jump exactly 2 squares straight in any direction.', defs: () => ({ n: { leap: knightOffsets().concat([[2, 0], [-2, 0], [0, 2], [0, -2]]) } }) },
    // ---- pawns ----
    brawlers:      { name: 'Brawlers', desc: 'Your pawns can also capture straight ahead.', pawn: { brawl: true } },
    wanderers:     { name: 'Wanderers', desc: 'Your pawns can also step 1 square sideways.', pawn: { side: true } },
    charge:        { name: 'Charge', desc: 'Your pawns can jump 2 squares forward from any rank, not just their first move.', pawn: { charge: true } },
    knuckle:       { name: 'Knuckle Pawns', desc: 'Your pawns can also capture sideways.', pawn: { sidecap: true } },
    retreaters:    { name: 'Retreaters', desc: 'Your pawns can also step 1 square backwards.', pawn: { back: true } },
    earlyBloom:    { name: 'Early Bloom', desc: 'Your pawns promote one rank sooner.', pawn: { promoShift: -1 } },
    // ---- special rules ----
    martyr:        { name: 'Martyr', desc: 'If your queen is captured (by anything but a king), the capturing piece is destroyed too.' },
    conqueror:     { name: 'Conqueror', desc: 'When you checkmate someone, their pieces become yours (their king becomes a commoner).', multi: true },
    lastStand:     { name: 'Last Stand', desc: 'If you are knocked out, your pieces turn neutral and keep attacking on their own.', multi: true },
    backstabbers:  { name: 'Backstabbers', desc: 'Your pawns can also capture diagonally backward.', pawn: { backcap: true } },
    slingers:      { name: 'Slingers', desc: 'Your pawns can also capture 2 squares straight ahead, jumping the square in front.', pawn: { sling: true } },
    shieldWall:    { name: 'Shield Wall', desc: 'Your pawns cannot be captured by knights.' },
    bodyguard:     { name: 'Bodyguard', desc: 'Your other pieces standing next to your king cannot be captured by pawns.' },
    boobyTrap:     { name: 'Booby Trap', desc: 'The first piece that gives check to your king is destroyed.' },
    swap:          { name: 'Swap', desc: 'Once per game, instead of moving, swap two of your pieces (not kings or pawns).' },
    loneWolf:      { name: 'Lone Wolf', desc: 'Your king reaches every square in the full 5×5 around it: it jumps to the knight-shaped squares, and the other squares need the square between to be empty. Your rooks move at most 3 squares and your bishops at most 4.', defs: () => ({ k: { slide: EDGE8, max: 2, leap: KN8 }, r: { slide: ROOK, max: 3 }, b: { slide: BISHOP, max: 4 } }) },
    glassCannon:   { name: 'Glass Cannon', desc: 'Your queen can also jump like a knight, but you start without one knight.', setup: back => { const i = back.indexOf('n'); if (i >= 0) back[i] = '.'; }, defs: () => ({ q: { slide: EDGE8, leap: knightOffsets() } }) },
    overlord:      { name: 'Overlord', desc: 'You start with a second queen in place of an edge pawn, but your pawns move 1 square at a time and can never capture.', setup: (back, pawns) => { pawns[0] = 'q'; }, pawn: { nocap: true, single: true } },
    friendlyFire:  { name: 'Friendly Fire', desc: 'Your pieces can capture your own pieces (never your king). Click the target twice to confirm.' },
    archbishop:    { name: 'Archbishop', desc: 'One of your bishops becomes an Archbishop (it also jumps like a knight and jumps to the 2nd square in every direction), but your other bishop is gone.', setup: back => { const a = back.indexOf('b'), z = back.lastIndexOf('b'); if (a >= 0) back[a] = 'a'; if (z > a) back[z] = '.'; } },
    paladin:       { name: 'Paladin', desc: 'One of your knights becomes a Paladin (it also makes the long 3-and-1 and 3-and-2 jumps), but your other knight is gone.', setup: back => { const a = back.indexOf('n'), z = back.lastIndexOf('n'); if (a >= 0) back[a] = 'l'; if (z > a) back[z] = '.'; } },
    juggernaut:    { name: 'Juggernauts', desc: 'Your rooks can also move up to 3 squares along a line and 1 square to either side of it (the line must be clear), but your bishops move at most 3 squares and your knights cannot jump (they need a free connecting square).', defs: () => ({ r: { slide: ROOK, plus: 3 }, b: { slide: BISHOP, max: 3 }, n: { kwalk: true } }) },
    empress:       { name: 'Empress', desc: 'Your queen also jumps like a knight and jumps to the 2nd square in every direction, but your rooks and bishops move at most 4 squares and your knights cannot jump.', defs: () => ({ q: { slide: EDGE8, leap: KN8.concat(HOP8) }, r: { slide: ROOK, max: 4 }, b: { slide: BISHOP, max: 4 }, n: { kwalk: true } }) },
    champions:     { name: 'Champion Pawns', desc: 'Your d- and e-pawns are Champions: they step and capture 1 square in any of the 8 directions, can also jump exactly 2 squares straight (moves only, over anything), and still promote. Your other six pawns can no longer promote.', setup: (back, pawns) => { pawns[3] = 'h'; pawns[4] = 'h'; }, pawn: { nopromo: true } },
    scout:         { name: 'Scout', desc: 'Fog of war: you can also see every square next to any of your pieces.', fog: true }
  };
  // Chess960: random back rank with bishops on opposite colours and the king between the rooks.
  function randomBack960() {
    const sq = new Array(8).fill(null), pick = a => a[Math.floor(Math.random() * a.length)];
    sq[pick([0, 2, 4, 6])] = 'b'; sq[pick([1, 3, 5, 7])] = 'b';
    let free = sq.map((x, i) => (x ? -1 : i)).filter(i => i >= 0);
    for (const t of ['q', 'n', 'n']) { const i = pick(free); sq[i] = t; free = free.filter(j => j !== i); }
    sq[free[0]] = 'r'; sq[free[1]] = 'k'; sq[free[2]] = 'r';
    return sq.join('');
  }
  const layoutFor = (id, back960) => {
    const back = (back960 || 'rnbqkbnr').split(''), pawns = new Array(8).fill('p'), t = TRAITS[id];
    if (t && t.setup) t.setup(back, pawns);
    return { back, pawns };
  };

  // Geometry shared by the 4-seat engines. 'wide' = 16 x height team board, 'infinite' = the 14x14 cross sitting in
  // the middle of an open 32x32 board (corners are no longer cut off), otherwise the plain cross board.
  function multiGeom(v) {
    const aus = v.board === 'austang';                    // Austang 4-player: 20x20 cross, 5x5 corners cut = 10x10 centre + four 10x5 arms
    const wide = v.board === 'wide', inf = v.board === 'infinite';
    const BW = aus ? 20 : wide ? (v.width || 16) : inf ? 32 : 14, BH = aus ? 20 : wide ? (v.height || 10) : inf ? 32 : 14, SZ = BW * BH, O = inf ? 9 : 0;
    const CUT = aus ? 5 : 3, LAST = aus ? 19 : 13;       // corner size / last file of the cross
    const cyl = wide && !!v.cylinder;                     // cylinder chess: the left and right edges of the wide board touch
    const idx = (x, y) => y * BW + (cyl ? ((x % BW) + BW) % BW : x);
    const valid = (x, y) => y >= 0 && y < BH && (cyl || (x >= 0 && x < BW)) && (wide || inf || !((x < CUT || x > LAST - CUT) && (y < CUT || y > LAST - CUT)));
    const FWD = wide ? { r: [0, 1], y: [0, 1], b: [0, -1], g: [0, -1] } : { r: [0, 1], b: [1, 0], y: [0, -1], g: [-1, 0] };
    const rankOf = wide
      ? (c, x, y) => (c === 'r' || c === 'y' ? y : BH - 1 - y)
      : (c, x, y) => { x -= O; y -= O; return c === 'r' ? y : c === 'b' ? x : c === 'y' ? LAST - y : LAST - x; };
    const promoRank = wide ? BH - 1 : LAST - CUT;
    // place(c, u, r): own-frame file u (0..7 along the back rank; 0..9 on the Austang boards) and rank r -> board square
    const HALF = BW / 2;
    const place = wide
      ? (c, u, r) => (c === 'r' ? [u, r] : c === 'y' ? [HALF + u, r] : c === 'b' ? [BW - 1 - u, BH - 1 - r] : [HALF - 1 - u, BH - 1 - r])
      : (c, u, r) => {
        const q = ({ r: (x, y) => [x, y], b: (x, y) => [y, LAST - x], y: (x, y) => [LAST - x, LAST - y], g: (x, y) => [LAST - y, x] })[c](CUT + u, r);
        return [q[0] + O, q[1] + O];
      };
    const isCenter = (x, y) => x - O >= CUT && x - O <= LAST - CUT && y - O >= CUT && y - O <= LAST - CUT;
    return { wide, inf, cyl, BW, BH, SZ, idx, valid, FWD, rankOf, promoRank, place, isCenter };
  }

  /*
   * 4-seat engine used for the cross board (14x14, corners cut) and the "wide" team board
   * (16 x v.height, teams face each other across the middle). Options (all in the variant object):
   *   seats/dead, castling, drops (+dropZone), movesPerTurn/firstSingle, board:'wide', height, teams {seat:team}.
   * Teammates never capture or check each other. A player who is checkmated or resigns is out (pieces turn gray and
   * can be captured, kings included); a stalemated player just skips. The game ends when one team is left.
   */
  function createMulti(v) {
    const { wide, cyl, BW, BH, SZ, idx, valid, FWD, rankOf, promoRank, place, isCenter } = multiGeom(v);
    const dX = (a, b) => { const d = Math.abs(a - b); return cyl ? Math.min(d, BW - d) : d; };      // file distance (wraps on a cylinder)
    const ORDER = ['r', 'b', 'y', 'g'], seats = v.seats, per = () => v.movesPerTurn || 1;
    const teamOf = c => (v.teams ? v.teams[c] : c);
    // Neutral-piece fairy types: c commoner (king step), i imp (knight leap), w wraith (<=2 diagonal), o ox (<=2 straight).
    const baseDefs = Object.assign({}, STANDARD.pieces, {
      c: { leap: STANDARD.pieces.k.leap }, i: v.impRoam ? { leap: STANDARD.pieces.n.leap, leapNC: ROAM5 } : { leap: STANDARD.pieces.n.leap },
      w: { slide: BISHOP, max: 2 }, o: { slide: ROOK, max: 2 }
    }, EXTRA_PIECES, v.austang ? GRAND_PIECES : {});
    const TR = v.traits || {}, traitOf = c => TRAITS[TR[c]] || null, rev = new Set(), dcache = {}, trapUsed = new Set(), swapUsed = new Set();
    const D = (c, nt) => {
      if (nt) return baseDefs;
      if (dcache[c]) return dcache[c];
      const t = traitOf(c), cp = v.cpass && v.cpass[c];
      let d = t && t.defs ? Object.assign({}, baseDefs, t.defs(FWD[c])) : baseDefs;
      if (cp && cp.add) d = withAdd(d, cp.add);
      return t || (cp && cp.add) ? (dcache[c] = d) : d;
    };
    const HAUNT = !!(v.cpass && Object.keys(v.cpass).some(k => v.cpass[k] && v.cpass[k].haunt));
    const hauntMax = (B, x, y, p, max) => {          // Spook: an enemy slider next to one of an Illusioner's ghosts moves at most 2 squares
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        if ((!dx && !dy) || !valid(x + dx, y + dy)) continue;
        const q = B[idx(x + dx, y + dy)], o = q && q.fx && (q.fx.dcy || q.fx.phn);
        if (o && o !== p.c && v.cpass[o] && v.cpass[o].haunt && teamOf(o) !== teamOf(p.c)) return max ? Math.min(max, 2) : 2;
      }
      return max;
    };
    let rescueFn = null;                                // class layer hook: may save a player who is about to be checkmated
    const CPm = c => (v.cpass && v.cpass[c]) || null;
    const guarded = (B, p, t, tx, ty) => {              // class effects that stop a capture: Shield (any capturer), Sanctuary / Cleric king guard (pawns only)
      if (t.fx && (t.fx.shd || t.fx.phn)) return true;
      if (p.t !== 'p') return false;
      if (t.fx && t.fx.sct) return true;
      const cp = v.cpass && v.cpass[t.c];
      if (!cp || !cp.kingGuard || t.t === 'k') return false;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        if ((!dx && !dy) || !valid(tx + dx, ty + dy)) continue;
        const k = B[idx(tx + dx, ty + dy)]; if (k && k.t === 'k' && k.c === t.c && !k.dead) return true;
      }
      return false;
    };
    const pflags = (c, nt) => (nt || c === 'n' ? {} : CPm(c) && CPm(c).pawn ? Object.assign({}, traitOf(c) ? traitOf(c).pawn : null, CPm(c).pawn) : (traitOf(c) ? traitOf(c).pawn || {} : {}));
    const NEU = !!v.neutral || Object.values(TR).includes('lastStand');
    const b = new Array(SZ).fill(null), alive = {}, events = [], hist = [], hands = {};
    ORDER.forEach(c => {
      hands[c] = {};
      if (!seats.includes(c) && !(v.dead || []).includes(c)) return;
      alive[c] = seats.includes(c);
      if (v.armies) {                                  // Austang: every player's army is given square by square in the player's own frame ({u: file, r: rank, t: piece})
        (v.armies[c] || []).forEach(a => { const [ax, ay] = place(c, a.u, a.r); b[idx(ax, ay)] = { t: a.t, c, dead: !alive[c] }; });
        return;
      }
      const LY = layoutFor(TR[c], v.back960);
      for (let k = 0; k < 8; k++) {
        const [bx, by] = place(c, k, 0), [px, py] = place(c, k, 1);
        if (LY.back[k] !== '.') b[idx(bx, by)] = { t: LY.back[k], c, dead: !alive[c] };
        if (LY.pawns[k] !== '.') b[idx(px, py)] = LY.pawns[k] === 'h' ? { t: 'p', champ: true, c, dead: !alive[c] } : { t: LY.pawns[k], c, dead: !alive[c] };
      }
    });
    // Neutral pieces (colour 'n') belong to nobody. They move by themselves after every full round of turns.
    let nid = 0;
    if (NEU) alive.n = true;
    if (v.neutral) {
      const orbits = [[[5, 5], [5, 8], [8, 8], [8, 5]], [[6, 4], [4, 7], [7, 9], [9, 6]]];
      const kinds = v.neutralSet === 'mixed' ? ['w', 'i'] : v.neutralSet === 'oxen' ? ['o', 'c'] : ['c', 'c'];
      orbits.forEach((orb, k) => orb.forEach(([x, y]) => { b[idx(x, y)] = { t: kinds[k], c: 'n', id: ++nid }; }));
    }
    const S = { turn: (v.first && seats.includes(v.first)) ? v.first : seats[0], left: v.firstSingle ? 1 : per(), drawn: false, moved: new Set(), nmoved: new Set(), pending: false, needSettle: false, fr: null, fn: 0 };
    // ---- Austang pieces (v.austang): captured-piece lists (Sacrificer / Reviver), Herald aura and free steps. Same rules as the 2-player engine, with every seat's own "forward".
    const yard = { r: [], b: [], y: [], g: [] };
    const PAWNLIKE = t => t === 'p' || t === '\u03c1', HERALD = !!v.austang, promoList = v.promoteTo || STANDARD.promoteTo;
    const aura = (B, x, y, c) => {                     // a friendly Herald within herR squares quiets this pawn
      for (let dx = -GRAND_RULES.herR; dx <= GRAND_RULES.herR; dx++) for (let dy = -GRAND_RULES.herR; dy <= GRAND_RULES.herR; dy++) {
        if (!valid(x + dx, y + dy)) continue;
        const q = B[idx(x + dx, y + dy)];
        if (q && q.c === c && q.t === GRAND_RULES.her && !q.dead) return true;
      }
      return false;
    };
    const hushedAt = (B, x, y, c) => aura(B, x, y, c) || !!(S.fr && c === S.turn && S.fr.includes(idx(x, y)));      // (a pawn that took a free step this turn stays "enlisted")
    const tick = (c, skip) => { for (let i = 0; i < SZ; i++) { const q = b[i]; if (q && q.c === c && q.rc > 0 && i !== skip) b[i] = Object.assign({}, q, { rc: q.rc - 1 }); } };      // Reviver recharge counts the owner's own turns
    const activeCount = () => seats.filter(c => alive[c]).length;
    const liveTeams = () => new Set(seats.filter(c => alive[c]).map(teamOf)).size;
    function nextActive(c) {
      let i = seats.indexOf(c);
      for (let n = 0; n < seats.length; n++) { i = (i + 1) % seats.length; if (alive[seats[i]]) return seats[i]; }
      return c;
    }
    const pass = c => {
      S.fr = null; S.fn = 0;
      S.turn = nextActive(c); S.left = per();
      if (NEU) {
        S.moved.add(c);
        if (seats.every(x => !alive[x] || S.moved.has(x))) { S.moved.clear(); S.nmoved.clear(); S.pending = true; }
      }
    };
    const over = () => S.drawn || liveTeams() <= 1;

    function pseudo(B, x, y, atk, nt) {
      const r = pseudoRaw(B, x, y, atk, nt);
      if (!HERALD) return r;
      const p = B[idx(x, y)];
      if (!p || !PAWNLIKE(p.t) || !hushedAt(B, x, y, p.c)) return r;      // Herald: quieted pawns can neither capture nor attack
      return atk ? [] : r.filter(m => !B[idx(m.tx, m.ty)]);
    }
    function pseudoRaw(B, x, y, atk, nt) {
      // Kings never give check beyond their normal 3x3 (so extended-reach kings can't check or box in other kings).
      const p = B[idx(x, y)], out = [], def = (atk && p.t === 'k') ? baseDefs.k : D(p.c, nt)[p.t];
      if (p.dead) return out;
      if (p.fx && p.fx.frz) return out;                 // frozen (class ability): can't move or attack
      const mx = HAUNT ? hauntMax(B, x, y, p, def.max) : def.max;
      const add = (tx, ty, e) => { if (cyl) tx = ((tx % BW) + BW) % BW; if (!out.some(o => o.tx === tx && o.ty === ty && (o.promo || null) === ((e && e.promo) || null) && (o.rev || null) === ((e && e.rev) || null))) out.push(Object.assign({ fx: x, fy: y, tx, ty }, e)); };
      // Gray (eliminated/inactive) pieces, kings too, can be captured by anyone; partners never.
      // Shield Wall (knights can't take pawns) and Bodyguard (pawns can't take pieces next to the king) are checked here.
      const blocked = (t, tx, ty) => {
        if (t.dead || nt) return false;
        if (p.t === 'n' && t.t === 'p' && TR[t.c] === 'shieldWall') return true;
        if (p.t === 'p' && t.t !== 'k' && TR[t.c] === 'bodyguard') {
          for (let i = 0; i < SZ; i++) { const k = B[i]; if (k && k.t === 'k' && k.c === t.c && !k.dead) { return dX(i % BW, tx) <= 1 && Math.abs(Math.floor(i / BW) - ty) <= 1; } }
        }
        return false;
      };
      const can = (t, tx, ty) => !t.wall && !(p.fx && (p.fx.dis || p.fx.phn)) && !(!atk && guarded(B, p, t, tx, ty)) && (t.dead || (teamOf(t.c) !== teamOf(p.c) && (atk || t.t !== 'k') && !blocked(t, tx, ty)) ||
        (!atk && !nt && t.c === p.c && t.t !== 'k' && TR[p.c] === 'friendlyFire'));      // Friendly Fire trait (a disarmed piece can't capture)
      if (p.t === '\u03c1') {                              // Berolina pawn: steps diagonally forward (2 diagonal squares from its own 2nd rank), captures straight ahead, promotes on the promotion rank
        const [dx, dy] = FWD[p.c], pp = dx === 0 ? [1, 0] : [0, 1];
        const push = (tx, ty) => (rankOf(p.c, tx, ty) === promoRank ? promoList.forEach(t => add(tx, ty, { promo: t })) : add(tx, ty));
        if (atk) { if (valid(x + dx, y + dy)) add(x + dx, y + dy); return out; }
        for (const sd of [-1, 1]) {
          const tx = x + dx + pp[0] * sd, ty = y + dy + pp[1] * sd;
          if (!valid(tx, ty) || B[idx(tx, ty)]) continue;
          push(tx, ty);
          const t2x = x + 2 * (dx + pp[0] * sd), t2y = y + 2 * (dy + pp[1] * sd);
          if (rankOf(p.c, x, y) === 1 && valid(t2x, t2y) && !B[idx(t2x, t2y)]) add(t2x, t2y);
        }
        if (valid(x + dx, y + dy)) { const t = B[idx(x + dx, y + dy)]; if (t && can(t, x + dx, y + dy)) push(x + dx, y + dy); }
        return out;
      }
      if (p.t === 'p') {
        const oc = p.c === 'n' ? (p.o || 'r') : p.c, F = pflags(p.c, nt);
        const [dx, dy] = FWD[oc], pp = dx === 0 ? [1, 0] : [0, 1], promoAt = promoRank + (F.promoShift || 0);
        const push0 = (tx, ty) => (!atk && rankOf(oc, tx, ty) === promoAt ? (p.c === 'n' ? ['q'] : promoList).forEach(t => add(tx, ty, { promo: t })) : add(tx, ty));
        const push = (F.nopromo && !p.champ) ? ((tx, ty) => add(tx, ty)) : push0;     // Champion Pawns: the other pawns can't promote
        if (p.champ) {                                     // a Champion: king-step moves and captures, plus 2-square straight jumps (moves only)
          for (const [cx2, cy2] of EDGE8) {
            const tx = x + cx2, ty = y + cy2;
            if (!valid(tx, ty)) continue;
            const t = B[idx(tx, ty)];
            if (atk || !t || can(t, tx, ty)) push(tx, ty);
          }
          if (!atk) for (const [jx, jy] of HOP4) { const tx = x + jx, ty = y + jy; if (valid(tx, ty) && !B[idx(tx, ty)]) push(tx, ty); }
          return out;
        }
        const fx = x + dx, fy = y + dy;
        if (!atk && valid(fx, fy) && !B[idx(fx, fy)]) {
          push(fx, fy);
          if (((rankOf(oc, x, y) === 1 || F.charge) && !F.single) && valid(fx + dx, fy + dy) && !B[idx(fx + dx, fy + dy)]) add(fx + dx, fy + dy);
        } else if (F.brawl && valid(fx, fy)) {
          const t = B[idx(fx, fy)];
          if (atk || (t && can(t, fx, fy))) push(fx, fy);
        }
        if (!atk && F.side) for (const sd of [-1, 1]) {
          const tx = x + pp[0] * sd, ty = y + pp[1] * sd;
          if (valid(tx, ty) && !B[idx(tx, ty)]) add(tx, ty);
        }
        if (!atk && F.back && valid(x - dx, y - dy) && !B[idx(x - dx, y - dy)]) add(x - dx, y - dy);
        if (F.sidecap) for (const sd of [-1, 1]) {
          const tx = x + pp[0] * sd, ty = y + pp[1] * sd;
          if (!valid(tx, ty)) continue;
          const t = B[idx(tx, ty)];
          if (atk || (t && can(t, tx, ty))) add(tx, ty);
        }
        if (F.backcap) for (const sd of [-1, 1]) {
          const tx = x - dx + pp[0] * sd, ty = y - dy + pp[1] * sd;
          if (!valid(tx, ty)) continue;
          const t = B[idx(tx, ty)];
          if (atk || (t && can(t, tx, ty))) add(tx, ty);
        }
        if (F.sling && valid(x + 2 * dx, y + 2 * dy)) {
          const t = B[idx(x + 2 * dx, y + 2 * dy)];
          if (atk || (t && can(t, x + 2 * dx, y + 2 * dy))) push(x + 2 * dx, y + 2 * dy);
        }
        for (const s of F.nocap ? [] : [-1, 1]) {
          const tx = fx + pp[0] * s, ty = fy + pp[1] * s;
          if (!valid(tx, ty)) continue;
          const t = B[idx(tx, ty)];
          if (atk || (t && can(t, tx, ty))) push(tx, ty);
        }
        return out;
      }
      for (const [lx, ly] of def.leap || []) {
        const tx = x + lx, ty = y + ly;
        if (valid(tx, ty)) { const t = B[idx(tx, ty)]; if (!t || can(t, tx, ty)) add(tx, ty); }
      }
      if (!atk) for (const [lx, ly] of def.leapNC || []) {            // moves only (never captures)
        const tx = x + lx, ty = y + ly;
        if (valid(tx, ty) && !B[idx(tx, ty)]) add(tx, ty);
      }
      if (def.kwalk) for (const [lx, ly] of STANDARD.pieces.n.leap) {  // knight-shaped squares, reached by walking: one connecting square must be free
        const tx = x + lx, ty = y + ly;
        if (!valid(tx, ty)) continue;
        const sgx = Math.sign(lx), sgy = Math.sign(ly), m1 = Math.abs(lx) === 2 ? [sgx, 0] : [0, sgy], m2 = [sgx, sgy];
        const free = m => valid(x + m[0], y + m[1]) && !B[idx(x + m[0], y + m[1])];
        if (!free(m1) && !free(m2)) continue;
        const t = B[idx(tx, ty)];
        if (!t || can(t, tx, ty)) add(tx, ty);
      }
      if (def.plus) {                    // rooks of Juggernauts: along a line (clear) and 1 square to either side of it
        const seen = new Set();
        for (const [dx, dy] of ROOK) {
          const px = -dy, py = dx;
          for (let d = 1; d <= def.plus; d++) {
            const lx = x + dx * d, ly = y + dy * d;
            if (!valid(lx, ly) || B[idx(lx, ly)]) break;
            for (const sg of [-1, 1]) {
              const tx = lx + px * sg, ty = ly + py * sg, key = tx + ',' + ty;
              if (!valid(tx, ty) || seen.has(key)) continue;
              seen.add(key);
              const t = B[idx(tx, ty)];
              if (!t || can(t, tx, ty)) add(tx, ty);
            }
          }
        }
      }
      for (const [sx, sy] of def.slide || []) {
        let tx = x + sx, ty = y + sy, n = 1;
        while (valid(tx, ty) && (!mx || n <= mx) && (!cyl || n < BW)) {
          const t = B[idx(tx, ty)];
          if (!t) add(tx, ty); else { if (can(t, tx, ty)) add(tx, ty); if (!(p.fx && p.fx.jmp)) break; }
          tx += sx; ty += sy; n++;
        }
      }
      if (!atk) for (const [sx, sy] of def.slideNC || []) {           // Cannon: slides over empty squares, never captures
        let tx = x + sx, ty = y + sy;
        while (valid(tx, ty) && !B[idx(tx, ty)]) { add(tx, ty); tx += sx; ty += sy; }
      }
      for (const [sx, sy] of def.hop || []) {                         // Cannon capture: jump exactly one piece, take the first piece behind it
        let tx = x + sx, ty = y + sy;
        while (valid(tx, ty) && !B[idx(tx, ty)]) { tx += sx; ty += sy; }
        if (!valid(tx, ty)) continue;
        tx += sx; ty += sy;
        while (valid(tx, ty) && !B[idx(tx, ty)]) { tx += sx; ty += sy; }
        if (valid(tx, ty)) { const t = B[idx(tx, ty)]; if (t && can(t, tx, ty)) add(tx, ty); }
      }
      for (const [sx, sy] of def.grass || []) {                       // Grasshopper: lands right behind the first piece on a queen line (empty = move, enemy = capture)
        let tx = x + sx, ty = y + sy;
        while (valid(tx, ty) && !B[idx(tx, ty)]) { tx += sx; ty += sy; }
        if (!valid(tx, ty)) continue;
        tx += sx; ty += sy;
        if (!valid(tx, ty)) continue;
        const t = B[idx(tx, ty)];
        if (!t) { if (!atk) add(tx, ty); } else if (can(t, tx, ty)) add(tx, ty);
      }
      if (!atk && v.austang && p.t === GRAND_RULES.her) {             // Herald: also 2 squares straight forward (both empty, no capture)
        const [dx, dy] = FWD[p.c];
        if (valid(x + dx, y + dy) && !B[idx(x + dx, y + dy)] && valid(x + 2 * dx, y + 2 * dy) && !B[idx(x + 2 * dx, y + 2 * dy)]) add(x + 2 * dx, y + 2 * dy);
      }
      if (!atk && v.austang && yard[p.c] && (p.t === GRAND_RULES.sac || (p.t === GRAND_RULES.rev && !(p.rc > 0)))) {      // Sacrificer / Reviver: bring back one of your captured pieces
        const kinds = [...new Set(yard[p.c])], okAt = (t, tx, ty) => !(PAWNLIKE(t) && (rankOf(p.c, tx, ty) === 0 || rankOf(p.c, tx, ty) >= promoRank));
        if (p.t === GRAND_RULES.sac) kinds.forEach(t => { if (okAt(t, x, y)) add(x, y, { rev: t }); });
        else for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
          const tx = x + dx, ty = y + dy;
          if ((dx || dy) && valid(tx, ty) && !B[idx(tx, ty)]) kinds.forEach(t => { if (okAt(t, tx, ty)) add(tx, ty, { rev: t }); });
        }
      }
      if (p.t === 'k' && v.castling && !p.m && !atk && v.back960 && !sqAttacked(B, x, y, p.c)) {
        // Chess960 castling: the king ends on the c/g file and the rook on d/f of its own back rank (own-frame files 2/6 and 3/5).
        let uk = -1;
        for (let u = 0; u < 8; u++) { const q = place(p.c, u, 0); if (q[0] === x && q[1] === y) { uk = u; break; } }
        if (uk >= 0) for (const sgn of [1, -1]) {
          let ur = -1;
          for (let u = uk + sgn; u >= 0 && u < 8; u += sgn) {
            const q = place(p.c, u, 0), r = B[idx(q[0], q[1])];
            if (r && r.t === 'r' && r.c === p.c && !r.m && !r.dead) { ur = u; break; }
          }
          if (ur < 0) continue;
          const uk2 = sgn > 0 ? 6 : 2, ur2 = sgn > 0 ? 5 : 3;
          let ok = true;
          const lo = Math.min(uk, uk2, ur, ur2), hi = Math.max(uk, uk2, ur, ur2);
          for (let u = lo; u <= hi && ok; u++) {
            if (u === uk || u === ur) continue;
            const inK = u >= Math.min(uk, uk2) && u <= Math.max(uk, uk2), inR = u >= Math.min(ur, ur2) && u <= Math.max(ur, ur2);
            const q = place(p.c, u, 0);
            if ((inK || inR) && B[idx(q[0], q[1])]) ok = false;
          }
          for (let u = Math.min(uk, uk2); ok && u <= Math.max(uk, uk2); u++) { const q = place(p.c, u, 0); if (sqAttacked(B, q[0], q[1], p.c)) ok = false; }
          if (ok) {
            const rq = place(p.c, ur, 0), kq = place(p.c, uk2, 0), rq2 = place(p.c, ur2, 0);
            add(rq[0], rq[1], { castle: true, c960: true, kx: kq[0], ky: kq[1], rx: rq[0], ry: rq[1], rtx: rq2[0], rty: rq2[1] });   // click target = your own rook
          }
        }
      } else if (p.t === 'k' && v.castling && !p.m && !atk && !v.back960 && !sqAttacked(B, x, y, p.c)) {
        const pp = FWD[p.c][0] === 0 ? [1, 0] : [0, 1];
        for (const d of [1, -1]) {
          const dx = pp[0] * d, dy = pp[1] * d;
          let tx = x + dx, ty = y + dy, n = 1;
          while (valid(tx, ty) && !B[idx(tx, ty)] && n <= BW && (!cyl || (tx >= 0 && tx < BW))) { tx += dx; ty += dy; n++; }
          const r = valid(tx, ty) && (!cyl || (tx >= 0 && tx < BW)) && B[idx(tx, ty)];
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
    let xHook = null;                               // class layer: stacked (Clipping) pieces (see the 2-player engine)
    function sqAttacked(B, kx, ky, c) {
      let X = null;
      if (xHook) { X = xHook(B, idx); if (X) { B = B.slice(); X.put.forEach(([i, p]) => { B[i] = p; }); } }
      for (let i = 0; i < SZ; i++) {
        const p = B[i];
        if (!p || p.dead || teamOf(p.c) === teamOf(c) || !alive[p.c] || (p.fx && (p.fx.dis || p.fx.frz || p.fx.phn || p.fx.dcy))) continue;
        if (pseudo(B, i % BW, Math.floor(i / BW), true).some(m => m.tx === kx && m.ty === ky)) return true;
      }
      if (X) for (const [i, q] of X.extra) {
        if (q.dead || teamOf(q.c) === teamOf(c) || !alive[q.c] || (q.fx && (q.fx.dis || q.fx.frz || q.fx.phn || q.fx.dcy))) continue;
        const B2 = B.slice(); B2[i] = q;
        if (pseudo(B2, i % BW, Math.floor(i / BW), true).some(m => m.tx === kx && m.ty === ky)) return true;
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
      if (m.c960) {
        B[idx(m.fx, m.fy)] = null; B[idx(m.rx, m.ry)] = null;
        B[idx(m.kx, m.ky)] = { t: 'k', c: p.c, m: true }; B[idx(m.rtx, m.rty)] = { t: 'r', c: p.c, m: true };
        return B;
      }
      B[idx(m.tx, m.ty)] = { t: m.promo || p.t, c: p.c, m: true, champ: m.promo ? undefined : p.champ, fx: p.fx }; B[idx(m.fx, m.fy)] = null;
      if (m.castle) { B[idx(m.rx, m.ry)] = null; B[idx(m.rtx, m.rty)] = { t: 'r', c: p.c, m: true }; }
      return B;
    }
    function freeSteps(x, y) {                         // Herald: free single steps for quieted pawns (moves only, no promotion, may not give check; herN steps per turn in total)
      const p = b[idx(x, y)];
      if (!HERALD || !p || p.dead || !alive[p.c] || p.c !== S.turn || !PAWNLIKE(p.t) || (S.fn || 0) >= GRAND_RULES.herN || !hushedAt(b, x, y, p.c)) return [];
      const [dx, dy] = FWD[p.c], pp = dx === 0 ? [1, 0] : [0, 1], out = [];
      const tos = p.t === 'p' ? [[x + dx, y + dy]] : [-1, 1].map(sd => [x + dx + pp[0] * sd, y + dy + pp[1] * sd]);
      for (const [tx, ty] of tos) {
        if (!valid(tx, ty) || b[idx(tx, ty)] || rankOf(p.c, tx, ty) >= promoRank) continue;
        const B2 = b.slice(), from = idx(x, y), to = idx(tx, ty); B2[to] = Object.assign({}, p, { m: true }); B2[from] = null;
        const saved = S.fr; S.fr = (saved || []).filter(i => i !== from).concat(to);      // (the stepping pawn counts as enlisted while we test it)
        const bad = kingAttacked(B2, p.c) || seats.some(s2 => alive[s2] && teamOf(s2) !== teamOf(p.c) && kingAttacked(B2, s2));
        S.fr = saved;
        if (!bad) out.push({ fx: x, fy: y, tx, ty, free: true });
      }
      return out;
    }
    function legalAt(x, y, withFree) {
      const p = b[idx(x, y)];
      if (!p || p.dead || !alive[p.c]) return [];
      const ms = pseudo(b, x, y);       // (an extended-reach king in check may use its full reach: the 'must not end attacked' test below is enough)
      const out = ms.filter(m => !kingAttacked(sim(m, p), p.c));
      return withFree ? out.concat(freeSteps(x, y)) : out;      // (free Herald steps never count as "having a move")
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
    function attackerColors(c) {
      let kx = -1, ky = -1;
      for (let i = 0; i < SZ; i++) { const p = b[i]; if (p && p.t === 'k' && p.c === c && !p.dead) { kx = i % BW; ky = Math.floor(i / BW); break; } }
      const out = new Set();
      if (kx < 0) return [];
      const X = xHook ? xHook(b, idx) : null;
      if (X) for (const [i, q] of X.extra) {
        if (q.dead || teamOf(q.c) === teamOf(c) || !alive[q.c]) continue;
        const B2 = b.slice(); B2[i] = q;
        if (pseudo(B2, i % BW, Math.floor(i / BW), true).some(m => m.tx === kx && m.ty === ky)) out.add(q.c);
      }
      for (let i = 0; i < SZ; i++) {
        const p = b[i];
        if (!p || p.dead || teamOf(p.c) === teamOf(c) || !alive[p.c]) continue;
        if (pseudo(b, i % BW, Math.floor(i / BW), true).some(m => m.tx === kx && m.ty === ky)) out.add(p.c);
      }
      return [...out];
    }
    function eliminate(c, reason, takers) {
      alive[c] = false;
      const taker = reason === 'checkmate' ? (takers || []).find(t => t !== 'n' && TR[t] === 'conqueror' && alive[t]) : null;
      const fallen = !taker && NEU && (!!v.fallen || TR[c] === 'lastStand');
      for (let i = 0; i < SZ; i++) if (b[i] && b[i].c === c) {
        b[i] = taker ? { t: b[i].t === 'k' ? 'c' : b[i].t, c: taker, m: true }
          : fallen ? { t: b[i].t === 'k' ? 'c' : b[i].t, c: 'n', o: c, id: ++nid, m: true } : Object.assign({}, b[i], { dead: true });
      }
      events.push({ e: 'elim', c, reason, fallen, taken: taker || null });
      if (taker) { rev.add(taker); events.push({ e: 'trait', c: taker, id: 'conqueror' }); }
      if (fallen && TR[c] === 'lastStand') { rev.add(c); events.push({ e: 'trait', c, id: 'lastStand' }); }
    }
    // Checkmate eliminates a player. Being stalemated does NOT: the turn is simply skipped.
    // If every remaining player is stalemated in a row, nobody can ever move and the game is drawn.
    // Nobody can ever checkmate anybody when every living side is down to its bare king (gray / fallen pieces are inert; active neutral pieces still count): draw.
    const bareKingsOnly = () => { for (let i = 0; i < SZ; i++) { const p = b[i]; if (p && !p.dead && p.t !== 'k' && (alive[p.c] || p.c === 'n')) return false; } return true; };
    function settle() {
      let guard = 0, skipped = 0;
      if (liveTeams() > 1 && bareKingsOnly()) { S.drawn = true; return; }
      while (liveTeams() > 1 && guard++ < 30) {
        if (!alive[S.turn]) { pass(S.turn); continue; }
        if (hasMove(S.turn)) return;
        if (kingAttacked(b, S.turn)) { if (rescueFn && rescueFn(S.turn)) continue; eliminate(S.turn, 'checkmate', attackerColors(S.turn)); pass(S.turn); skipped = 0; continue; }
        events.push({ e: 'skip', c: S.turn }); pass(S.turn);
        if (++skipped >= activeCount()) { S.drawn = true; return; }
      }
    }

    // Booby Trap: the first piece that checks the owner's king is destroyed.
    function trapCheck() {
      for (const t of seats) {
        if (!alive[t] || TR[t] !== 'boobyTrap' || trapUsed.has(t) || !kingAttacked(b, t)) continue;
        let kx = -1, ky = -1;
        for (let i = 0; i < SZ; i++) { const p = b[i]; if (p && p.t === 'k' && p.c === t && !p.dead) { kx = i % BW; ky = Math.floor(i / BW); break; } }
        const kill = [];
        for (let i = 0; i < SZ; i++) {
          const p = b[i];
          if (!p || p.dead || teamOf(p.c) === teamOf(t) || !alive[p.c]) continue;
          if (pseudo(b, i % BW, Math.floor(i / BW), true).some(m => m.tx === kx && m.ty === ky)) kill.push(i);
        }
        kill.forEach(i => { b[i] = null; });
        trapUsed.add(t); rev.add(t); events.push({ e: 'trait', c: t, id: 'boobyTrap' });
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
      trapCheck();
      nextNeutral();
      return true;
    }

    return {
      w: BW, h: BH, multi: true, neutral: NEU, cyl, seats, teams: v.teams || null, wide,
      get turn() { return S.turn; },
      get left() { return S.left; },
      perTurn: v.movesPerTurn || 1,
      get neutralPending() { return NEU && S.pending && nextNeutral() !== null; },
      neutralNext: nextNeutral, neutralApply,
      valid, kingPos,
      at: (x, y) => b[idx(x, y)],
      moves: (x, y) => { const p = b[idx(x, y)]; return p && p.c === S.turn ? legalAt(x, y, true) : []; },
      yard: c => (yard[c] || []).slice(),
      freeLeft: () => (HERALD ? Math.max(0, GRAND_RULES.herN - (S.fn || 0)) : 0),
      reach: (x, y, asType) => { const p = b[idx(x, y)]; if (!p) return []; if (!asType || asType === p.t) return pseudo(b, x, y, false); const B = b.slice(); B[idx(x, y)] = Object.assign({}, p, { t: asType }); return pseudo(B, x, y, false); },
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
        if (TR[c] === 'scout') [...set].forEach(i => {
          const x = i % BW, y = Math.floor(i / BW);
          for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if (valid(x + dx, y + dy)) set.add(idx(x + dx, y + dy));
        });
        return set;
      },
      get traits() { return TR; },
      // For the bots: every legal move with what it captures and the most the opponents could take back afterwards.
      evalMoves(c) {
        if (over() || c !== S.turn || (NEU && S.pending && nextNeutral() !== null)) return [];
        const cands = [], out = [], cx = (BW - 1) / 2, cy = (BH - 1) / 2;
        for (let i = 0; i < SZ; i++) { const p = b[i]; if (p && p.c === c && !p.dead) legalAt(i % BW, Math.floor(i / BW)).forEach(m => cands.push(m)); }
        legalDrops(c).forEach(m => cands.push(m));
        const enemyOf = s2 => teamOf(s2) !== teamOf(c), dummySeat = seats.find(s2 => alive[s2] && enemyOf(s2)) || 'n';
        for (const m of cands) {
          const p = m.drop ? null : b[idx(m.fx, m.fy)], B2 = sim(m, p);
          const vic = m.drop || m.c960 ? null : b[idx(m.tx, m.ty)];
          let threat = 0;
          for (let i = 0; i < SZ; i++) {
            const q = B2[i];
            if (!q || q.dead || !alive[q.c] || teamOf(q.c) === teamOf(c)) continue;
            const qx = i % BW, qy = Math.floor(i / BW);
            for (const mv of pseudo(B2, qx, qy, false)) {
              const tg = B2[idx(mv.tx, mv.ty)];
              if (!tg || tg.dead || teamOf(tg.c) !== teamOf(c) || tg.t === 'k') continue;
              const nb = B2.slice(); nb[idx(mv.tx, mv.ty)] = { t: 'q', c: dummySeat, m: true };
              let defended = false;
              for (let j = 0; j < SZ && !defended; j++) {
                const f = nb[j];
                if (!f || f.dead || teamOf(f.c) !== teamOf(c) || !alive[f.c]) continue;
                defended = pseudo(nb, j % BW, Math.floor(j / BW), true).some(r => r.tx === mv.tx && r.ty === mv.ty);
              }
              const net = defended ? bv(tg.t) - bv(q.t) : bv(tg.t);
              if (net > threat) threat = net;
            }
          }
          const check = seats.some(s2 => alive[s2] && enemyOf(s2) && kingAttacked(B2, s2));
          const pos = (m.drop || (p && p.t === 'k')) ? 0 : Math.hypot(m.fx - cx, m.fy - cy) - Math.hypot(m.tx - cx, m.ty - cy);
          const own = !!vic && vic.c === c;
          out.push({ m, cap: vic && !own ? vic.t : null, threat: threat + (own ? bv(vic.t) + 1 : 0), check, mate: false, pos });
        }
        return out;
      },
      canSwap: c => TR[c] === 'swap' && !!alive[c] && !swapUsed.has(c),
      winner: () => (!S.drawn && liveTeams() === 1 ? seats.find(c => alive[c]) : null),
      get drawn() { return S.drawn; },
      inCheck: c => !!alive[c] && kingAttacked(b, c),
      // Low-level hooks used by the class layer (withClasses). Not for normal play.
      raw: {
        snap: () => b.slice(), restore: s0 => { for (let i = 0; i < SZ; i++) b[i] = s0[i]; },
        put: (x, y, p) => { b[idx(x, y)] = p; },
        pass: () => { const c0 = S.turn; pass(c0); if (NEU && S.pending) S.needSettle = true; else settle(); },
        check: c => kingAttacked(b, c),
        foeCheck: c => seats.some(s2 => alive[s2] && teamOf(s2) !== teamOf(c) && kingAttacked(b, s2)),
        home: c => { const out = []; for (let r = 0; r < 2; r++) for (let u = 0; u < 8; u++) out.push(place(c, u, r)); return out; },
        ok: c => !over() && !!alive[c],
        scan: () => { const out = []; for (let i = 0; i < SZ; i++) if (b[i]) out.push({ x: i % BW, y: Math.floor(i / BW), p: b[i] }); return out; },
        valid: (x, y) => valid(x, y) && x >= 0 && x < BW, size: [BW, BH], depth: BH,
        foe: (c, p) => !!p && !p.dead && p.c !== 'n' && !!alive[p.c] && teamOf(p.c) !== teamOf(c),
        rank: (c, x, y) => rankOf(c, x, y),
        promo: c => promoRank + (pflags(c).promoShift || 0),
        remove: (x, y) => { b[idx(x, y)] = null; },
        take: (x, y, by) => {
          const vic = b[idx(x, y)];
          if (v.drops && vic && vic.t !== 'k' && (!NEU || vic.c === 'n')) { const k = vic.pr ? 'p' : ((vic.fx && vic.fx.xt) || vic.t); hands[by][k] = (hands[by][k] || 0) + 1; }
          b[idx(x, y)] = null;
        },
        clearEp: () => {},
        setRescue: f => { rescueFn = f; }, setStacks: f => { xHook = f; },
        fwd: c => FWD[c],
        setTurn: c => { S.turn = c; S.left = per(); },
        spend: () => { const c0 = S.turn; S.left--; if (S.left > 0 && alive[c0] && hasMove(c0)) return; pass(c0); if (NEU && S.pending) S.needSettle = true; else settle(); },
        ally: (c, p) => !!p && !p.dead && p.c !== 'n' && !!alive[p.c] && teamOf(p.c) === teamOf(c)
      },
      drainEvents() { const e = events.slice(); events.length = 0; return e; },
      history: () => hist.slice(),
      status: () => (over() ? 'over' : 'playing'),
      move(m) {
        if (over() || (NEU && S.pending && nextNeutral() !== null)) return false;
        const c = S.turn;
        if (m.swap) {
          if (TR[c] !== 'swap' || swapUsed.has(c) || !valid(m.fx, m.fy) || !valid(m.tx, m.ty) || (m.fx === m.tx && m.fy === m.ty)) return false;
          const A = b[idx(m.fx, m.fy)], B2 = b[idx(m.tx, m.ty)];
          if (!A || !B2 || A.c !== c || B2.c !== c || A.dead || B2.dead || A.t === 'k' || A.t === 'p' || B2.t === 'k' || B2.t === 'p') return false;
          const NB = b.slice(); NB[idx(m.fx, m.fy)] = Object.assign({}, B2, { m: true }); NB[idx(m.tx, m.ty)] = Object.assign({}, A, { m: true });
          if (kingAttacked(NB, c)) return false;
          b[idx(m.fx, m.fy)] = NB[idx(m.fx, m.fy)]; b[idx(m.tx, m.ty)] = NB[idx(m.tx, m.ty)];
          swapUsed.add(c); rev.add(c); events.push({ e: 'trait', c, id: 'swap' });
          hist.push({ c, swap: true, fx: m.fx, fy: m.fy, tx: m.tx, ty: m.ty, cap: null });
        } else if (m.drop) {
          if (!v.drops || !(hands[c][m.drop] > 0)) return false;
          const ok = legalDrops(c).find(l => l.drop === m.drop && l.tx === m.tx && l.ty === m.ty);
          if (!ok) return false;
          b[idx(ok.tx, ok.ty)] = { t: ok.drop, c, m: true }; hands[c][ok.drop]--;
          hist.push({ c, drop: ok.drop, tx: ok.tx, ty: ok.ty, cap: null });
        } else {
          if (!valid(m.fx, m.fy)) return false;
          const p = b[idx(m.fx, m.fy)];
          if (!p || p.c !== c) return false;
          const ok = legalAt(m.fx, m.fy, true).find(l => l.tx === m.tx && l.ty === m.ty && (l.promo || null) === (m.promo || null) && (l.rev || null) === (m.rev || null) && !!l.free === !!m.free);
          if (!ok) return false;
          if (ok.free) {                                // Herald free step: the turn does not pass
            const from = idx(ok.fx, ok.fy), to = idx(ok.tx, ok.ty);
            b[to] = Object.assign({}, p, { m: true }); b[from] = null;
            S.fr = (S.fr || []).filter(i => i !== from).concat(to); S.fn = (S.fn || 0) + 1;
            hist.push({ c, fx: ok.fx, fy: ok.fy, tx: ok.tx, ty: ok.ty, free: true, cap: null });
            return true;
          }
          if (ok.rev) {                                 // Sacrificer (target = own square) / Reviver (empty neighbouring square, then it recharges)
            const yl = yard[c], k = yl.indexOf(ok.rev); if (k >= 0) yl.splice(k, 1);
            const self = ok.fx === ok.tx && ok.fy === ok.ty;
            b[idx(ok.tx, ok.ty)] = { t: ok.rev, c, m: true };
            if (!self) b[idx(ok.fx, ok.fy)] = Object.assign({}, p, { rc: GRAND_RULES.revCd });
            tick(c, self ? -1 : idx(ok.fx, ok.fy));
            hist.push({ c, fx: ok.fx, fy: ok.fy, tx: ok.tx, ty: ok.ty, rev: ok.rev, cap: null });
          } else {
          const vic = ok.c960 ? null : b[idx(ok.tx, ok.ty)];
          if (vic && vic.t !== 'k' && v.austang && yard[vic.c]) yard[vic.c].push(vic.pr ? (vic.pt || 'p') : vic.t);
          if (traitOf(c) && !rev.has(c) && !traitOf(c).setup) {     // first move that only the trait allows reveals it
            const baseMs = pseudo(b, ok.fx, ok.fy, false, true);
            if (!baseMs.some(l => l.tx === ok.tx && l.ty === ok.ty && (l.promo || null) === (ok.promo || null))) { rev.add(c); events.push({ e: 'trait', c, id: TR[c] }); }
          }
          if (v.drops && vic && vic.t !== 'k' && (!NEU || vic.c === 'n')) hands[c][vic.pr ? 'p' : ((vic.fx && vic.fx.xt) || vic.t)] = (hands[c][vic.pr ? 'p' : ((vic.fx && vic.fx.xt) || vic.t)] || 0) + 1;
          if (ok.c960) {
            b[idx(ok.fx, ok.fy)] = null; b[idx(ok.rx, ok.ry)] = null;
            b[idx(ok.kx, ok.ky)] = { t: 'k', c, m: true }; b[idx(ok.rtx, ok.rty)] = { t: 'r', c, m: true };
          } else { b[idx(ok.tx, ok.ty)] = { t: ok.promo || p.t, c, m: true, pr: !!ok.promo || undefined, pt: ok.promo ? p.t : p.pt, rc: p.rc, champ: ok.promo ? undefined : p.champ, fx: p.fx }; b[idx(ok.fx, ok.fy)] = null; }
          if (vic && vic.t === 'q' && !vic.dead && TR[vic.c] === 'martyr' && p.t !== 'k') {
            b[idx(ok.tx, ok.ty)] = null; rev.add(vic.c); events.push({ e: 'trait', c: vic.c, id: 'martyr' });
          }
          if (ok.castle && !ok.c960) { b[idx(ok.rx, ok.ry)] = null; b[idx(ok.rtx, ok.rty)] = { t: 'r', c, m: true }; }
          hist.push({ c, fx: ok.fx, fy: ok.fy, tx: ok.tx, ty: ok.ty, promo: ok.promo || null, cap: vic ? vic.t : null, castle: !!ok.castle });
          if (v.austang) tick(c, -1);
          }
        }
        trapCheck();
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
    const bareKingsOnly = () => { for (let l = 0; l < 2; l++) for (let i = 0; i < SZ; i++) { const p = L[l][i]; if (p && !p.dead && p.t !== 'k' && alive[p.c]) return false; } return true; };
    function settle() {
      let guard = 0, skipped = 0;
      if (liveTeams() > 1 && bareKingsOnly()) { S.drawn = true; return; }
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
    const bareKingsOnly = () => { for (let i = 0; i < N * N; i++) { const p = b[i]; if (p && !p.dead && p.t !== 'k' && alive[p.c]) return false; } return true; };
    function settle() {
      let guard = 0, skipped = 0;
      if (activeCount() > 1 && bareKingsOnly()) { S.drawn = true; return; }
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
    // Cylinder chess (v.cyl): the left and right edges touch, so everything that moves sideways wraps around.
    const cyl = !!v.cyl;
    const inB = (x, y) => y >= 0 && y < h && (cyl || (x >= 0 && x < w));
    const inRow = (x, y) => x >= 0 && y >= 0 && x < w && y < h;          // plain board bounds (castling never wraps)
    const idx = (x, y) => y * w + (cyl ? ((x % w) + w) % w : x);
    const distX = (a, b) => { const d = Math.abs(a - b); return cyl ? Math.min(d, w - d) : d; };
    const opp = c => (c === 'w' ? 'b' : 'w');

    const b0 = new Array(w * h).fill(null);
    // Chess960: replace the standard back ranks by the shuffled one (same for both sides)
    const setupRows = v.back960 && w === 8 && h === 8 && v.setup[0] === 'rnbqkbnr' && v.setup[h - 1] === 'RNBQKBNR'
      ? v.setup.map((r, i) => (i === 0 ? v.back960 : i === h - 1 ? v.back960.toUpperCase() : r)) : v.setup;
    setupRows.forEach((row, i) => [...row].forEach((ch, x) => {
      if (ch !== '.') b0[idx(x, h - 1 - i)] = { t: ch.toLowerCase(), c: ch === ch.toUpperCase() ? 'w' : 'b', m: false };
    }));
    // class traits (hidden picks, see index.html); only set-ups that are plain 8x8 are modified
    const TR = v.traits || {}, traitOf = c => TRAITS[TR[c]] || null, rev = new Set(), events = [], dcache = {}, trapUsed = new Set(), swapUsed = new Set();
    const PCS = Object.assign({}, v.pieces, EXTRA_PIECES);
    const D2 = (c, nt) => {
      if (nt) return PCS;
      if (dcache[c]) return dcache[c];
      const t = traitOf(c), cp = v.cpass && v.cpass[c];
      let d = t && t.defs ? Object.assign({}, PCS, t.defs(c === 'w' ? [0, 1] : [0, -1])) : PCS;
      if (cp && cp.add) d = withAdd(d, cp.add);
      return t || (cp && cp.add) ? (dcache[c] = d) : d;
    };
    const HAUNT = !!(v.cpass && Object.keys(v.cpass).some(k => v.cpass[k] && v.cpass[k].haunt));
    const hauntMax = (B, x, y, p, max) => {          // Spook: an enemy slider next to one of an Illusioner's ghosts moves at most 2 squares
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        if ((!dx && !dy) || x + dx < 0 || x + dx >= w || y + dy < 0 || y + dy >= h) continue;
        const q = B[(y + dy) * w + x + dx], o = q && q.fx && (q.fx.dcy || q.fx.phn);
        if (o && o !== p.c && v.cpass[o] && v.cpass[o].haunt) return max ? Math.min(max, 2) : 2;
      }
      return max;
    };
    let curB = null;                                   // the board pseudo() is currently looking at
    const guardedFrom = (p, t) => {                    // class effects that stop a capture: Shield (any capturer), Sanctuary / Cleric king guard (pawns only)
      if (t.fx && (t.fx.shd || t.fx.phn)) return true;
      if (p.t !== 'p') return false;
      if (t.fx && t.fx.sct) return true;
      const cp = v.cpass && v.cpass[t.c];
      if (!cp || !cp.kingGuard || t.t === 'k' || !curB) return false;
      const i = curB.indexOf(t); if (i < 0) return false;
      const tx = i % w, ty = Math.floor(i / w);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        if ((!dx && !dy) || tx + dx < 0 || tx + dx >= w || ty + dy < 0 || ty + dy >= h) continue;
        const k = curB[(ty + dy) * w + tx + dx]; if (k && k.t === 'k' && k.c === t.c) return true;
      }
      return false;
    };
    const foe = (p, t, atk) => !t.wall && !(p.fx && (p.fx.dis || p.fx.phn)) && !(!atk && guardedFrom(p, t)) && (t.c !== p.c || (!atk && TR[p.c] === 'friendlyFire' && t.t !== 'k'));      // a disarmed piece (class ability) can't capture      // Friendly Fire trait
    const CP = c => (v.cpass && v.cpass[c]) || null;
    const pf2 = (c, nt) => (nt ? {} : CP(c) && CP(c).pawn ? Object.assign({}, traitOf(c) ? traitOf(c).pawn : null, CP(c).pawn) : (traitOf(c) ? traitOf(c).pawn || {} : {}));
    // Shield Wall (knights can't take pawns) / Bodyguard (pawns can't take pieces beside their king)
    const blocked2 = (S, p, t, tx, ty) => {
      if (p.t === 'n' && t.t === 'p' && TR[t.c] === 'shieldWall') return true;
      if (p.t === 'p' && t.t !== 'k' && TR[t.c] === 'bodyguard') {
        for (let i = 0; i < w * h; i++) { const k = S.b[i]; if (k && k.t === 'k' && k.c === t.c) { const kx = i % w, ky = (i - kx) / w; return Math.abs(kx - tx) <= 1 && Math.abs(ky - ty) <= 1; } }
      }
      return false;
    };
    if (w === 8 && h === 8) ['w', 'b'].forEach(c => {
      const t = traitOf(c);
      if (!t || !t.setup) return;
      const yb = c === 'w' ? 0 : h - 1, yp = c === 'w' ? 1 : h - 2, back = [], pawns = [];
      for (let x = 0; x < 8; x++) { back.push(b0[idx(x, yb)] ? b0[idx(x, yb)].t : '.'); pawns.push(b0[idx(x, yp)] ? b0[idx(x, yp)].t : '.'); }
      t.setup(back, pawns);
      for (let x = 0; x < 8; x++) {
        b0[idx(x, yb)] = back[x] === '.' ? null : Object.assign({ c, m: false }, b0[idx(x, yb)], { t: back[x] });
        b0[idx(x, yp)] = pawns[x] === '.' ? null : pawns[x] === 'h' ? Object.assign({ c, m: false }, b0[idx(x, yp)], { t: 'p', champ: true }) : Object.assign({ c, m: false }, b0[idx(x, yp)], { t: pawns[x] });
      }
    });
    let S = { b: b0, turn: v.first || 'w', ep: null, hands: { w: {}, b: {} }, left: v.firstSingle ? 1 : (v.movesPerTurn || 1), yard: { w: [], b: [] }, fr: null, fn: 0 };
    const hist = [], stCache = new WeakMap();

    const HERALD = !!(v.pieces && v.pieces[GRAND_RULES.her]), PAWNLIKE = t => t === 'p' || t === '\u03c1';
    const hushed = (B, x, y, c) => {                 // Herald: friendly pawns within herR squares of a Herald can't capture or attack
      for (let dx = -GRAND_RULES.herR; dx <= GRAND_RULES.herR; dx++) for (let dy = -GRAND_RULES.herR; dy <= GRAND_RULES.herR; dy++) {
        if (!inB(x + dx, y + dy)) continue;
        const q = B[idx(x + dx, y + dy)];
        if (q && q.c === c && q.t === GRAND_RULES.her) return true;
      }
      return false;
    };
    const hushedS = (S, x, y, c) => hushed(S.b, x, y, c) || !!(S.fr && c === S.turn && S.fr.includes(idx(x, y)));      // (a pawn that took a free step this turn stays "enlisted": still quieted after leaving the aura)
    function pseudo(S, x, y, attackOnly, nt) {
      const r = pseudoRaw(S, x, y, attackOnly, nt);
      if (!HERALD) return r;
      const p = S.b[idx(x, y)];
      if (!p || !PAWNLIKE(p.t) || !hushedS(S, x, y, p.c)) return r;
      return attackOnly ? [] : r.filter(m => !S.b[idx(m.tx, m.ty)] && !m.ep);
    }
    function pseudoRaw(S, x, y, attackOnly, nt) {
      // Kings never give check beyond their normal 3x3 (so extended-reach kings can't check or box in other kings).
      const p = S.b[idx(x, y)], out = [], def = (attackOnly && p.t === 'k') ? v.pieces.k : D2(p.c, nt)[p.t];
      curB = S.b;
      if (p.fx && p.fx.frz) return out;                 // frozen (class ability): can't move or attack
      const mx = HAUNT ? hauntMax(S.b, x, y, p, def.max) : def.max;
      const add = (tx, ty, extra) => { if (cyl) tx = ((tx % w) + w) % w; if (!out.some(o => o.tx === tx && o.ty === ty && (o.promo || null) === ((extra && extra.promo) || null) && (o.rev || null) === ((extra && extra.rev) || null))) out.push(Object.assign({ fx: x, fy: y, tx, ty }, extra)); };
      if (p.t === '\u03c1') {                             // Berolina pawn (Austang Grand): moves 1 step diagonally forward (2 from its own 2nd rank), captures straight ahead; promotes on the last rank; no en passant
        const d = p.c === 'w' ? 1 : -1, last = p.c === 'w' ? h - 1 : 0, start = p.c === 'w' ? 1 : h - 2;
        const push = (tx, ty) => (ty === last ? v.promoteTo.forEach(t => add(tx, ty, { promo: t })) : add(tx, ty));
        if (attackOnly) { if (inB(x, y + d)) add(x, y + d); return out; }
        for (const dx of [-1, 1]) {
          const tx = x + dx, ty = y + d;
          if (!inB(tx, ty) || S.b[idx(tx, ty)]) continue;
          push(tx, ty);
          if (y === start && inB(x + 2 * dx, y + 2 * d) && !S.b[idx(x + 2 * dx, y + 2 * d)]) add(x + 2 * dx, y + 2 * d);
        }
        if (inB(x, y + d)) { const t = S.b[idx(x, y + d)]; if (t && foe(p, t, attackOnly) && !blocked2(S, p, t, x, y + d)) push(x, y + d); }
        return out;
      }
      if (p.t === 'p') {
        const d = p.c === 'w' ? 1 : -1, F = pf2(p.c, nt);
        const last = (v.promoRank ? v.promoRank[p.c] : (p.c === 'w' ? h - 1 : 0)) + (F.promoShift ? F.promoShift * d : 0);
        const start = v.pawnStart ? v.pawnStart[p.c] : (p.c === 'w' ? 1 : h - 2);
        const push = (tx, ty, extra) => {
          if (ty === last && !(F.nopromo && !p.champ)) v.promoteTo.forEach(t => add(tx, ty, { promo: t }));
          else add(tx, ty, extra);
        };
        if (p.champ) {                                     // a Champion: king-step moves and captures, plus 2-square straight jumps (moves only)
          for (const [cx2, cy2] of EDGE8) {
            const tx = x + cx2, ty = y + cy2;
            if (!inB(tx, ty)) continue;
            const t = S.b[idx(tx, ty)];
            if (attackOnly) add(tx, ty);
            else if (!t || (foe(p, t, attackOnly) && !blocked2(S, p, t, tx, ty))) push(tx, ty);
          }
          if (!attackOnly) for (const [jx, jy] of HOP4) { const tx = x + jx, ty = y + jy; if (inB(tx, ty) && !S.b[idx(tx, ty)]) push(tx, ty); }
          return out;
        }
        if (inB(x, y + d) && !S.b[idx(x, y + d)]) {
          push(x, y + d);
          if (((y === start || F.charge) && !F.single) && inB(x, y + 2 * d) && !S.b[idx(x, y + 2 * d)]) add(x, y + 2 * d, { dbl: true });
        } else if (F.brawl && inB(x, y + d)) {
          const t = S.b[idx(x, y + d)];
          if (t && foe(p, t, attackOnly) && !blocked2(S, p, t, x, y + d)) push(x, y + d);
        }
        if (F.side) for (const dx of [-1, 1]) if (inB(x + dx, y) && !S.b[idx(x + dx, y)]) add(x + dx, y);
        if (F.back && inB(x, y - d) && !S.b[idx(x, y - d)]) add(x, y - d);
        if (F.sidecap) for (const dx of [-1, 1]) { const t = inB(x + dx, y) && S.b[idx(x + dx, y)]; if (t && foe(p, t, attackOnly) && !blocked2(S, p, t, x + dx, y)) add(x + dx, y); }
        if (F.backcap) for (const dx of [-1, 1]) { const t = inB(x + dx, y - d) && S.b[idx(x + dx, y - d)]; if (t && foe(p, t, attackOnly) && !blocked2(S, p, t, x + dx, y - d)) add(x + dx, y - d); }
        if (F.sling && inB(x, y + 2 * d)) { const t = S.b[idx(x, y + 2 * d)]; if (t && foe(p, t, attackOnly) && !blocked2(S, p, t, x, y + 2 * d)) push(x, y + 2 * d); }
        for (const dx of F.nocap ? [] : [-1, 1]) {
          const tx = cyl ? ((x + dx) % w + w) % w : x + dx, ty = y + d;
          if (!inB(tx, ty)) continue;
          const t = S.b[idx(tx, ty)];
          if (t && foe(p, t, attackOnly) && !blocked2(S, p, t, tx, ty)) push(tx, ty);
          else if (!t && S.ep && S.ep.c !== p.c && S.ep.x === tx && S.ep.y === ty && !(p.fx && (p.fx.dis || p.fx.phn)) && !(S.b[idx(tx, y)] && S.b[idx(tx, y)].fx && (S.b[idx(tx, y)].fx.shd || S.b[idx(tx, y)].fx.sct || S.b[idx(tx, y)].fx.phn))) add(tx, ty, { ep: true });
        }
        return out;
      }
      for (const [dx, dy] of def.leap || []) {
        const tx = x + dx, ty = y + dy;
        if (inB(tx, ty)) { const t = S.b[idx(tx, ty)]; if (!t || (foe(p, t, attackOnly) && !blocked2(S, p, t, tx, ty))) add(tx, ty); }
      }
      if (!attackOnly) for (const [lx, ly] of def.leapNC || []) {      // moves only (never captures)
        const tx = x + lx, ty = y + ly;
        if (inB(tx, ty) && !S.b[idx(tx, ty)]) add(tx, ty);
      }
      if (def.kwalk) for (const [lx, ly] of v.pieces.n.leap) {          // knight-shaped squares, reached by walking: one connecting square must be free
        const tx = x + lx, ty = y + ly;
        if (!inB(tx, ty)) continue;
        const sgx = Math.sign(lx), sgy = Math.sign(ly), m1 = Math.abs(lx) === 2 ? [sgx, 0] : [0, sgy], m2 = [sgx, sgy];
        const free = m => inB(x + m[0], y + m[1]) && !S.b[idx(x + m[0], y + m[1])];
        if (!free(m1) && !free(m2)) continue;
        const t = S.b[idx(tx, ty)];
        if (!t || (foe(p, t, attackOnly) && !blocked2(S, p, t, tx, ty))) add(tx, ty);
      }
      if (def.plus) {                    // rooks of Juggernauts: along a line (clear) and 1 square to either side of it
        const seen = new Set();
        for (const [dx, dy] of ROOK) {
          const px = -dy, py = dx;
          for (let d = 1; d <= def.plus; d++) {
            const lx = x + dx * d, ly = y + dy * d;
            if (!inB(lx, ly) || S.b[idx(lx, ly)]) break;
            for (const sg of [-1, 1]) {
              const tx = lx + px * sg, ty = ly + py * sg, key = tx + ',' + ty;
              if (!inB(tx, ty) || seen.has(key)) continue;
              seen.add(key);
              const t = S.b[idx(tx, ty)];
              if (!t || (foe(p, t, attackOnly) && !blocked2(S, p, t, tx, ty))) add(tx, ty);
            }
          }
        }
      }
      for (const [dx, dy] of def.slide || []) {
        let tx = x + dx, ty = y + dy, n = 1;
        while (inB(tx, ty) && (!mx || n <= mx) && (!cyl || n < w)) {
          const t = S.b[idx(tx, ty)];
          if (!t) add(tx, ty);
          else { if (foe(p, t, attackOnly) && !blocked2(S, p, t, tx, ty)) add(tx, ty); if (!(p.fx && p.fx.jmp)) break; }      // jumping pieces slide through blockers
          tx += dx; ty += dy; n++;
        }
      }
      // Cannon / Grasshopper (Austang Grand): a hurdle is the first piece of either colour on the line
      const ok = (t, tx, ty) => foe(p, t, attackOnly) && !blocked2(S, p, t, tx, ty);
      if (!attackOnly) for (const [dx, dy] of def.slideNC || []) {      // moves only: slides over empty squares, never captures
        let tx = x + dx, ty = y + dy;
        while (inB(tx, ty) && !S.b[idx(tx, ty)]) { add(tx, ty); tx += dx; ty += dy; }
      }
      for (const [dx, dy] of def.hop || []) {                           // Cannon capture: jump exactly one piece, take the first piece behind it
        let tx = x + dx, ty = y + dy;
        while (inB(tx, ty) && !S.b[idx(tx, ty)]) { tx += dx; ty += dy; }
        if (!inB(tx, ty)) continue;
        tx += dx; ty += dy;
        while (inB(tx, ty) && !S.b[idx(tx, ty)]) { tx += dx; ty += dy; }
        if (inB(tx, ty) && ok(S.b[idx(tx, ty)], tx, ty)) add(tx, ty);
      }
      for (const [dx, dy] of def.grass || []) {                         // Grasshopper: lands right behind the first piece on the line (empty = move, enemy = capture)
        let tx = x + dx, ty = y + dy;
        while (inB(tx, ty) && !S.b[idx(tx, ty)]) { tx += dx; ty += dy; }
        if (!inB(tx, ty)) continue;
        tx += dx; ty += dy;
        if (!inB(tx, ty)) continue;
        const t = S.b[idx(tx, ty)];
        if (!t) { if (!attackOnly) add(tx, ty); } else if (ok(t, tx, ty)) add(tx, ty);
      }
      if (!attackOnly && p.t === GRAND_RULES.her) {                    // Herald: also moves 2 squares straight forward (like a pawn's double step, but from any square; both squares must be empty, no capture)
        const d = p.c === 'w' ? 1 : -1;
        if (inB(x, y + d) && !S.b[idx(x, y + d)] && inB(x, y + 2 * d) && !S.b[idx(x, y + 2 * d)]) add(x, y + 2 * d);
      }
      if (!attackOnly && S.yard && (p.t === GRAND_RULES.sac || (p.t === GRAND_RULES.rev && !(p.rc > 0)))) {      // Sacrificer / Reviver: bring back one of your captured pieces
        const kinds = [...new Set(S.yard[p.c])], okAt = (t, ty) => !(PAWNLIKE(t) && (ty === 0 || ty === h - 1));
        if (p.t === GRAND_RULES.sac) kinds.forEach(t => { if (okAt(t, y)) add(x, y, { rev: t }); });          // turns itself into the piece (target = its own square)
        else for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
          const tx = x + dx, ty = y + dy;
          if ((dx || dy) && inB(tx, ty) && !S.b[idx(tx, ty)]) kinds.forEach(t => { if (okAt(t, ty)) add(tx, ty, { rev: t }); });
        }
      }
      if (p.t === 'k' && v.castling && !p.m && !attackOnly && v.back960 && !attacked(S, x, y, opp(p.c))) {
        // Chess960: king ends on c/g, rook on d/f; click target = your own rook
        for (const d of [1, -1]) {
          let rx = x + d;
          while (inRow(rx, y)) { const r = S.b[idx(rx, y)]; if (r && r.t === 'r' && r.c === p.c && !r.m) break; rx += d; }
          if (!inRow(rx, y)) continue;
          const kx2 = d > 0 ? 6 : 2, rx2 = d > 0 ? 5 : 3;
          let ok = true;
          const lo = Math.min(x, kx2, rx, rx2), hi = Math.max(x, kx2, rx, rx2);
          for (let sx = lo; sx <= hi && ok; sx++) {
            if (sx === x || sx === rx) continue;
            const inK = sx >= Math.min(x, kx2) && sx <= Math.max(x, kx2), inR = sx >= Math.min(rx, rx2) && sx <= Math.max(rx, rx2);
            if ((inK || inR) && S.b[idx(sx, y)]) ok = false;
          }
          for (let sx = Math.min(x, kx2); ok && sx <= Math.max(x, kx2); sx++) if (attacked(S, sx, y, opp(p.c))) ok = false;
          if (ok) add(rx, y, { castle: d > 0 ? 'k' : 'q', c960: true, kx2, rx, rtx: rx2 });
        }
      } else if (p.t === 'k' && v.castling && !p.m && !attackOnly && !v.back960 && !attacked(S, x, y, opp(p.c))) {
        for (const d of [1, -1]) {
          let rx = x + d;
          while (inRow(rx, y) && !S.b[idx(rx, y)]) rx += d;
          const r = inRow(rx, y) && S.b[idx(rx, y)];
          if (!r || r.t !== 'r' || r.c !== p.c || r.m || Math.abs(rx - x) < 3) continue;
          if (inRow(x + 2 * d, y) && !attacked(S, x + d, y, opp(p.c)) && !attacked(S, x + 2 * d, y, opp(p.c)))
            add(x + 2 * d, y, { castle: d > 0 ? 'k' : 'q', rx, rtx: x + d });
        }
      }
      return out;
    }

    let xHook = null;                               // class layer: stacked (Clipping) pieces. xHook(b, idx) -> null | { put: [[i, piece]] (revealed on vacated squares), extra: [[i, piece]] (overlapping attackers) }
    function hits(S, i, p, x, y, by) {              // does piece p (standing on square i of S) attack (x, y)?
      if (p.fx && (p.fx.dis || p.fx.frz || p.fx.phn || p.fx.dcy)) return false;      // disarmed/frozen pieces give no check
      const px = i % w, py = (i - px) / w;
      if (p.t === 'p') {
        if (HERALD && hushedS(S, px, py, p.c)) return false;
        const Fp = pf2(by), dir = by === 'w' ? 1 : -1;
        if (p.champ) return Math.max(distX(px, x), Math.abs(py - y)) === 1;
        if (Fp.nocap) return false;
        if (py + dir === y && (distX(px, x) === 1 || (px === x && Fp.brawl))) return true;
        if (py === y && distX(px, x) === 1 && Fp.sidecap) return true;
        if (Fp.backcap && py - dir === y && distX(px, x) === 1) return true;
        if (Fp.sling && px === x && py + 2 * dir === y) return true;
        return false;
      }
      return pseudo(S, px, py, true).some(m => m.tx === x && m.ty === y);
    }
    function attacked(S, x, y, by) {
      let X = null;
      if (xHook) { X = xHook(S.b, idx); if (X) { const nb = S.b.slice(); X.put.forEach(([i, p]) => { nb[i] = p; }); S = Object.assign({}, S, { b: nb }); } }
      for (let i = 0; i < w * h; i++) {
        const p = S.b[i];
        if (p && p.c === by && hits(S, i, p, x, y, by)) return true;
      }
      if (X) for (const [i, q] of X.extra) {          // pieces overlapping with another piece on the same square attack from there
        if (q.c !== by) continue;
        const nb = S.b.slice(); nb[i] = q;
        if (hits(Object.assign({}, S, { b: nb }), i, q, x, y, by)) return true;
      }
      return false;
    }

    // Booby Trap: the first piece(s) giving check to the owner's king are destroyed.
    function trapCheck2() {
      for (const tc of ['w', 'b']) {
        if (TR[tc] !== 'boobyTrap' || trapUsed.has(tc) || !inCheck(S, tc)) continue;
        let kx = -1, ky = -1;
        for (let i = 0; i < w * h; i++) { const k = S.b[i]; if (k && k.t === 'k' && k.c === tc) { kx = i % w; ky = (i - kx) / w; break; } }
        const by = opp(tc), kill = [];
        for (let i = 0; i < w * h; i++) {
          const p = S.b[i];
          if (!p || p.c !== by) continue;
          const px = i % w, py = (i - px) / w, dir = by === 'w' ? 1 : -1;
          let hit;
          if (p.t === 'p') {
            const Fp = pf2(by);
            hit = p.champ ? Math.max(distX(px, kx), Math.abs(py - ky)) === 1 : !Fp.nocap && ((py + dir === ky && (distX(px, kx) === 1 || (px === kx && Fp.brawl))) || (py === ky && distX(px, kx) === 1 && Fp.sidecap) || (Fp.backcap && py - dir === ky && distX(px, kx) === 1) || (Fp.sling && px === kx && py + 2 * dir === ky));
          } else hit = pseudo(S, px, py, true).some(mv => mv.tx === kx && mv.ty === ky);
          if (hit) kill.push(i);
        }
        if (!kill.length) continue;
        const nb = S.b.slice(); kill.forEach(i => { nb[i] = null; });
        S = Object.assign({}, S, { b: nb });
        trapUsed.add(tc); rev.add(tc); events.push({ e: 'trait', c: tc, id: 'boobyTrap' });
      }
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
      if (m.c960) {
        b[idx(m.fx, m.fy)] = null; b[idx(m.rx, m.fy)] = null;
        b[idx(m.kx2, m.fy)] = { t: 'k', c: p.c, m: true }; b[idx(m.rtx, m.fy)] = { t: 'r', c: p.c, m: true };
        return next(S, b, null, hands);
      }
      if (m.free) {                                    // Herald free step: the turn does not pass
        b[idx(m.fx, m.fy)] = null; b[idx(m.tx, m.ty)] = Object.assign({}, p, { m: true });
        const from = idx(m.fx, m.fy), fr = (S.fr || []).filter(i => i !== from).concat(idx(m.tx, m.ty));      // the marching pawn stays enlisted on its new square
        return { b, turn: c, ep: S.ep, hands, left: S.left, yard: S.yard, fr, fn: (S.fn || 0) + 1 };
      }
      if (m.rev) {                                     // Sacrificer (target = own square: it becomes the piece) / Reviver (piece appears on an empty adjacent square, Reviver recharges)
        const yard = { w: S.yard.w.slice(), b: S.yard.b.slice() }, k = yard[c].indexOf(m.rev); if (k >= 0) yard[c].splice(k, 1);
        const self = m.fx === m.tx && m.fy === m.ty;
        b[idx(m.tx, m.ty)] = { t: m.rev, c, m: true };
        if (!self) b[idx(m.fx, m.fy)] = Object.assign({}, p, { rc: GRAND_RULES.revCd });
        return next(S, b, null, hands, { yard, skip: self ? -1 : idx(m.fx, m.fy) });
      }
      const vx = m.ep ? idx(m.tx, m.fy) : idx(m.tx, m.ty), victim = b[vx];
      let yard = S.yard;
      if (victim && victim.t !== 'k' && !victim.wall) { yard = { w: S.yard.w.slice(), b: S.yard.b.slice() }; yard[victim.c].push(victim.pr ? (victim.pt || 'p') : victim.t); }
      if (v.drops && !v.bugBoard && victim) { copyHands(); const k = victim.pr ? 'p' : victim.t; hands[c][k] = (hands[c][k] || 0) + 1; }
      b[idx(m.fx, m.fy)] = null;
      if (m.ep) b[vx] = null;
      b[idx(m.tx, m.ty)] = { t: m.promo || p.t, c: p.c, m: true, pr: !!m.promo || !!p.pr, pt: m.promo ? p.t : p.pt, rc: p.rc, champ: m.promo ? undefined : p.champ, fx: p.fx };
      if (victim && victim.t === 'q' && TR[victim.c] === 'martyr' && p.t !== 'k') b[idx(m.tx, m.ty)] = null;
      if (m.castle) { b[idx(m.rx, m.fy)] = null; b[idx(m.rtx, m.fy)] = { t: 'r', c: p.c, m: true }; }
      return next(S, b, m.dbl ? { x: m.tx, y: (m.fy + m.ty) / 2, c: p.c } : null, hands, { yard });
    }

    // Decides whose turn it is after a move. Marseillais: giving check, or having no
    // legal second move, ends the turn early.
    function next(S, b, ep, hands, extra) {
      const c = S.turn, N = { b, turn: c, ep, hands, left: S.left - 1, yard: (extra && extra.yard) || S.yard, fr: null, fn: 0 };
      for (let i = 0; i < b.length; i++) { const q = b[i]; if (q && q.c === c && q.rc > 0 && !(extra && extra.skip === i)) b[i] = Object.assign({}, q, { rc: q.rc - 1 }); }      // Reviver recharge: counts the owner's own turns
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

    function freeSteps(S, x, y) {                    // Herald: a pawn near a friendly Herald (or one already marching this turn) may take a free single step (moves only, no promotion); at most herN steps per turn in total, and a step may not give check
      const p = S.b[idx(x, y)];
      if (!HERALD || !p || !PAWNLIKE(p.t) || p.c !== S.turn || (S.fn || 0) >= GRAND_RULES.herN || !hushedS(S, x, y, p.c)) return [];
      const d = p.c === 'w' ? 1 : -1, last = p.c === 'w' ? h - 1 : 0, out = [];
      for (const dx of p.t === 'p' ? [0] : [-1, 1]) {
        const tx = x + dx, ty = y + d;
        if (inB(tx, ty) && ty !== last && !S.b[idx(tx, ty)]) out.push({ fx: x, fy: y, tx, ty, free: true });
      }
      return out.filter(m => { const N = apply(S, m); return !inCheck(N, S.turn) && !inCheck(N, opp(S.turn)); });
    }
    const legal = (S, x, y) => {
      const ms = pseudo(S, x, y);       // (an extended-reach king in check may use its full reach: the 'must not end attacked' test below is enough)
      return ms.filter(m => !inCheck(apply(S, m), S.turn)).concat(freeSteps(S, x, y));
    };

    function all(S) {
      const out = [];
      for (let i = 0; i < w * h; i++) {
        const p = S.b[i];
        if (p && p.c === S.turn) { const x = i % w; out.push(...legal(S, x, (i - x) / w).filter(m => !m.free)); }      // (free Herald steps never count as "having a move")
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

    const api = {
      w, h, cyl,
      get turn() { return S.turn; },
      get left() { return S.left; },
      yard: c => (S.yard ? S.yard[c].slice() : []),                         // captured pieces that a Sacrificer / Reviver could bring back
      freeLeft: () => (HERALD ? Math.max(0, GRAND_RULES.herN - (S.fn || 0)) : 0),
      at: (x, y) => S.b[idx(x, y)],
      moves: (x, y) => { const p = S.b[idx(x, y)]; return p && p.c === S.turn ? legal(S, x, y) : []; },
      reach: (x, y, asType) => { const p = S.b[idx(x, y)]; if (!p) return []; if (!asType || asType === p.t) return pseudo(S, x, y, false); const nb = S.b.slice(); nb[idx(x, y)] = Object.assign({}, p, { t: asType }); return pseudo(Object.assign({}, S, { b: nb }), x, y, false); },
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
        if (TR[c] === 'scout') [...set].forEach(i => {
          const x = i % w, y = Math.floor(i / w);
          for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if (inB(x + dx, y + dy)) set.add(idx(x + dx, y + dy));
        });
        return set;
      },
      get traits() { return TR; },
      // For the bots: every legal move with what it captures and the most the opponent could take back afterwards.
      evalMoves() {
        const c = S.turn, o = opp(c), out = [], cands = [], cx = (w - 1) / 2, cy = (h - 1) / 2;
        for (let i = 0; i < w * h; i++) { const q = S.b[i]; if (q && q.c === c) { const x = i % w; legal(S, x, (i - x) / w).filter(m => !m.free).forEach(m => cands.push(m)); } }
        if (v.drops) drops(S).forEach(m => cands.push(m));
        for (const m of cands) {
          const S2 = apply(S, m), src = m.drop ? null : S.b[idx(m.fx, m.fy)];
          const vic = m.drop || m.c960 ? null : (S.b[idx(m.tx, m.ty)] || (m.ep ? S.b[idx(m.tx, m.fy)] : null));
          let threat = 0;
          for (let i = 0; i < w * h; i++) {
            const q = S2.b[i];
            if (!q || q.c !== o) continue;
            const qx = i % w, qy = (i - qx) / w;
            for (const mv of pseudo(S2, qx, qy, false)) {
              const tg = S2.b[idx(mv.tx, mv.ty)];
              if (!tg || tg.c !== c || tg.t === 'k') continue;
              const nb = S2.b.slice(); nb[idx(mv.tx, mv.ty)] = { t: 'q', c: o, m: true };
              const defended = attacked(Object.assign({}, S2, { b: nb }), mv.tx, mv.ty, c);
              const net = defended ? bv(tg.t) - bv(q.t) : bv(tg.t);
              if (net > threat) threat = net;
            }
          }
          const check = inCheck(S2, o), mate = check && S2.turn === o && all(S2).length === 0;
          const pos = (m.drop || !src || src.t === 'k') ? 0 : Math.hypot(m.fx - cx, m.fy - cy) - Math.hypot(m.tx - cx, m.ty - cy);
          const own = !!vic && vic.c === c;
          out.push({ m, cap: vic && !own ? vic.t : null, threat: threat + (own ? bv(vic.t) + 1 : 0), check, mate, pos });
        }
        return out;
      },
      canSwap: c => TR[c] === 'swap' && !swapUsed.has(c),
      drainEvents() { const e = events.slice(); events.length = 0; return e; },
      hand: c => Object.assign({}, S.hands[c]),
      // Bughouse: a piece captured on the partner's board arrives in this hand.
      addHand(c, t) {
        const hands = { w: Object.assign({}, S.hands.w), b: Object.assign({}, S.hands.b) };
        hands[c][t] = (hands[c][t] || 0) + 1;
        S = Object.assign({}, S, { hands });
      },
      drops: () => (v.drops ? drops(S) : []),
      move(m) {
        if (m.swap) {
          const c = S.turn;
          if (TR[c] !== 'swap' || swapUsed.has(c) || !inB(m.fx, m.fy) || !inB(m.tx, m.ty) || (m.fx === m.tx && m.fy === m.ty)) return false;
          const A = S.b[idx(m.fx, m.fy)], B2 = S.b[idx(m.tx, m.ty)];
          if (!A || !B2 || A.c !== c || B2.c !== c || A.t === 'k' || A.t === 'p' || B2.t === 'k' || B2.t === 'p') return false;
          const nb = S.b.slice(); nb[idx(m.fx, m.fy)] = Object.assign({}, B2, { m: true }); nb[idx(m.tx, m.ty)] = Object.assign({}, A, { m: true });
          if (inCheck(Object.assign({}, S, { b: nb }), c)) return false;
          swapUsed.add(c); rev.add(c); events.push({ e: 'trait', c, id: 'swap' });
          S = next(S, nb, null, S.hands); hist.push({ swap: true, fx: m.fx, fy: m.fy, tx: m.tx, ty: m.ty, cap: null }); trapCheck2();
          return true;
        }
        if (m.drop) {
          const d = v.drops && drops(S).find(l => l.drop === m.drop && l.tx === m.tx && l.ty === m.ty);
          if (!d) return false;
          S = apply(S, d); hist.push({ drop: m.drop, tx: m.tx, ty: m.ty }); trapCheck2();
          return true;
        }
        const src = inB(m.fx, m.fy) && S.b[idx(m.fx, m.fy)];
        if (!src || src.c !== S.turn) return false;
        const ok = legal(S, m.fx, m.fy).find(l => l.tx === m.tx && l.ty === m.ty && (l.promo || null) === (m.promo || null) && (l.rev || null) === (m.rev || null) && !!l.free === !!m.free);
        if (!ok) return false;
        const vic = ok.c960 ? null : (S.b[idx(ok.tx, ok.ty)] || (ok.ep ? S.b[idx(ok.tx, ok.fy)] : null));
        const mover = S.turn;
        if (traitOf(mover) && !rev.has(mover) && !traitOf(mover).setup) {
          const baseMs = pseudo(S, ok.fx, ok.fy, false, true);
          if (!baseMs.some(l => l.tx === ok.tx && l.ty === ok.ty && (l.promo || null) === (ok.promo || null))) { rev.add(mover); events.push({ e: 'trait', c: mover, id: TR[mover] }); }
        }
        if (vic && vic.t === 'q' && TR[vic.c] === 'martyr' && src.t !== 'k') { rev.add(vic.c); events.push({ e: 'trait', c: vic.c, id: 'martyr' }); }
        S = apply(S, ok); hist.push({ fx: m.fx, fy: m.fy, tx: m.tx, ty: m.ty, promo: m.promo || null, rev: ok.rev || null, free: !!ok.free, cap: vic ? vic.t : null, capPr: !!(vic && vic.pr) });
        trapCheck2();
        return true;
      },
      inCheck: () => inCheck(S, S.turn),
      status() {
        if (stCache.has(S)) return stCache.get(S);
        if (!v.drops && !(xHook && xHook(S.b, idx)) && deadPosition(S)) { stCache.set(S, 'draw'); return 'draw'; }      // (a stack hides pieces: no insufficient-material draw while one exists)
        const none = all(S).length === 0, c = inCheck(S, S.turn);
        const r = none ? (c ? 'checkmate' : 'stalemate') : (c ? 'check' : 'playing');
        stCache.set(S, r); return r;
      },
      history: () => hist.slice(),
      perTurn: v.movesPerTurn || 1,
      perft: d => perft(S, d),
      // Low-level hooks used by the class layer (withClasses). Not for normal play.
      raw: {
        snap: () => S, restore: s0 => { S = s0; }, setStacks: f => { xHook = f; },
        put: (x, y, p) => { const nb = S.b.slice(); nb[idx(x, y)] = p; S = Object.assign({}, S, { b: nb }); },
        pass: () => { S = Object.assign({}, S, { turn: opp(S.turn), left: v.movesPerTurn || 1, ep: null }); },
        check: c => inCheck(S, c),
        foeCheck: c => inCheck(S, opp(c)),
        home: c => { const out = []; for (const y of c === 'w' ? [0, 1] : [h - 1, h - 2]) for (let x = 0; x < w; x++) out.push([x, y]); return out; },
        ok: () => !['checkmate', 'stalemate', 'draw'].includes(api.status()),
        scan: () => { const out = []; for (let i = 0; i < w * h; i++) if (S.b[i]) out.push({ x: i % w, y: Math.floor(i / w), p: S.b[i] }); return out; },
        valid: (x, y) => inRow(x, y), size: [w, h], depth: h,
        foe: (c, p) => !!p && !p.wall && p.c !== c,
        rank: (c, x, y) => (c === 'w' ? y : h - 1 - y),
        promo: c => h - 1 + (pf2(c).promoShift || 0),
        remove: (x, y) => { const nb = S.b.slice(); nb[idx(x, y)] = null; S = Object.assign({}, S, { b: nb }); },
        take: (x, y, by) => {                       // remove a captured piece; Crazyhouse: it goes to the capturer's hand
          const vic = S.b[idx(x, y)], nb = S.b.slice(); nb[idx(x, y)] = null;
          let hands = S.hands;
          if (v.drops && !v.bugBoard && vic) { hands = { w: Object.assign({}, hands.w), b: Object.assign({}, hands.b) }; const k = vic.pr ? 'p' : ((vic.fx && vic.fx.xt) || vic.t); hands[by][k] = (hands[by][k] || 0) + 1; }
          S = Object.assign({}, S, { b: nb, hands });
        },
        clearEp: () => { S = Object.assign({}, S, { ep: null }); },
        fwd: c => (c === 'w' ? [0, 1] : [0, -1]),
        setTurn: c => { S = Object.assign({}, S, { turn: c, left: 1, ep: null }); },
        spend: () => { S = S.left > 1 ? Object.assign({}, S, { left: S.left - 1, ep: null }) : Object.assign({}, S, { turn: opp(S.turn), left: v.movesPerTurn || 1, ep: null }); },
        ally: (c, p) => !!p && p.c === c
      }
    };
    return api;
  }


  /* ===== Classes (spell-chess style) =====
   * A class = passive + abilities + one ultimate. Points are earned each turn and spent on abilities.
   * withClasses(game, {classes:{seat:id}, cfg}) wraps a 2-player or 4-seat cross/wide engine. An ability is cast with
   * game.move({ab:id, c, [fx,fy,] tx, ty}) (fx,fy = first click of a two-click ability, tx,ty = the last click).
   * Most abilities are cast BEFORE the normal move; `replace:true` abilities use up the whole turn.
   * Casts are kept in game.abLog() (`at` = number of normal moves played before the cast) so records/replays can rebuild them.
   * Status effects live on piece objects as p.fx = { frz|dis|jmp: casterSeat }; they expire when that caster's next turn starts. */
  const CLASS_DEFAULTS = { start: 2, gain: 1, cap: 8, ultRepeat: false, perTurn: 0, summonCap: 4 };
  const ORTH1 = [[0, 1], [0, -1], [1, 0], [-1, 0]], ORTH2 = [[0, 2], [0, -2], [2, 0], [-2, 0]];
  const CLASSES = {
    summoner: {
      name: 'Summoner',
      desc: 'Calls new pieces onto empty squares of your first two ranks.',
      passive: { desc: 'Pawns promote one rank sooner.', pawn: { promoShift: -1 } },
      abilities: [
        { id: 'sumP', name: 'Summon Pawn', cost: 2, kind: 'summon', piece: 'p', desc: 'Place a pawn on an empty square of your first two ranks.' },
        { id: 'sumN', name: 'Summon Knight', cost: 4, kind: 'summon', piece: 'n', desc: 'Place a knight on an empty square of your first two ranks.' },
        { id: 'sumB', name: 'Summon Bishop', cost: 4, kind: 'summon', piece: 'b', desc: 'Place a bishop on an empty square of your first two ranks.' },
        { id: 'sumR', name: 'Summon Rook', cost: 5, kind: 'summon', piece: 'r', desc: 'Place a rook on an empty square of your first two ranks.' },
        { id: 'sumQ', name: 'Summon Queen', cost: 8, ult: true, kind: 'summon', piece: 'q', desc: 'Ultimate: place a queen on an empty square of your first two ranks.' }
      ]
    },
    rogue: {
      name: 'Rogue',
      desc: 'A sneaky class that turns the enemy\'s pieces against them.',
      passive: { desc: 'Bishops can also step 1 square straight.', add: { b: { leap: ORTH1 } } },
      abilities: [
        { id: 'steal', name: 'Steal', cost: 4, kind: 'steal', desc: 'An enemy pawn changes sides.' },
        { id: 'backstab', name: 'Backstab', cost: 3, kind: 'backstab', replace: true, desc: 'REPLACES one of your moves (your whole turn, or one of the two in Marseillais): one of your pieces captures any adjacent enemy piece (not a king), however it normally moves.' },
        { id: 'disarm', name: 'Disarm', cost: 3, kind: 'disarm', desc: 'An enemy piece (not a king) can\'t capture or give check until your next turn.' },
        { id: 'assassinate', name: 'Assassinate', cost: 8, ult: true, kind: 'assassinate', desc: 'Ultimate: destroy any enemy piece except a king.' }
      ]
    },
    mage: {
      name: 'Mage',
      desc: 'Bends the board with spells.',
      passive: { desc: 'Knights can also jump 2 squares straight.', add: { n: { leap: ORTH2 } } },
      abilities: [
        { id: 'freeze', name: 'Freeze', cost: 3, kind: 'freeze', desc: 'An enemy piece (not a king) can\'t move or give check until your next turn.' },
        { id: 'blink', name: 'Blink', cost: 2, kind: 'blink', desc: 'Move one of your pieces (not the king) to an empty square within 2 squares. Doesn\'t use your turn.' },
        { id: 'jump', name: 'Jump', cost: 4, kind: 'jump', desc: 'One of your rooks, bishops or queens ignores blockers (also for check) until your next turn.' },
        { id: 'meteor', name: 'Meteor', cost: 8, ult: true, kind: 'meteor', desc: 'Ultimate: every piece in a 3x3 area is destroyed, kings excepted (your own pieces too).' }
      ]
    },
    engineer: {
      name: 'Engineer',
      desc: 'Builds walls, rewires the army and lays secret mines.',
      passive: { desc: 'Rooks can also step 1 square diagonally.', add: { r: { leap: [[1, 1], [1, -1], [-1, 1], [-1, -1]] } } },
      abilities: [
        { id: 'wall', name: 'Wall', cost: 3, kind: 'wall', desc: 'Build a blocking wall on an empty square for 2 turns. Nothing can pass through, land on or capture it (knights jump over it).' },
        { id: 'rewire', name: 'Rewire', cost: 3, kind: 'rewire', replace: true, desc: 'REPLACES one of your moves: swap two of your pieces (not kings).' },
        { id: 'mine', name: 'Mine', cost: 5, kind: 'laymine', desc: 'Secretly mine an empty square in your half for 2 turns. The first enemy non-king piece that lands there is destroyed. Only you and your teammates can see it.' },
        { id: 'fortress', name: 'Fortress', cost: 8, ult: true, kind: 'fortress', desc: 'Ultimate: walls on every empty square around your king for 3 turns (knights and adjacent pawns can still reach it).' }
      ]
    },
    glitch: {
      name: 'Glitch', secret: true,
      desc: 'SECRET CLASS (unbalanced on purpose): a video-game-bug class that breaks the normal rules.',
      passive: { desc: 'Duplication Bug: at the start of each of your turns there is a 12% chance that a random pawn of yours with an empty square in front is copied onto that square (max 3 per game).', glitchDup: true },
      abilities: [
        { id: 'wires', name: 'Crossed Wires', cost: 4, kind: 'wires', desc: 'Pick two of your pieces (not kings) of different types: for 2 turns they swap movement types. It ends early if either is captured or destroyed, or if a swapped pawn promotes.' },
        { id: 'restore', name: 'Restore Point', cost: 3, kind: 'restore', desc: 'Cast right after one of your pieces was captured: mark that square. At the start of your turn, if the square is empty, the captured piece is revived there.' },
        { id: 'clip', name: 'Clipping', cost: 4, kind: 'clip', desc: 'Pick a square (empty, or holding one of your pieces, not a king). For 3 of your turns your pieces (not kings) may also move ONTO that square even if one of your pieces is already there: they overlap as a stack. Click a stack to choose which piece to move; one piece steps out, the others stay (and still attack from there). A stack is captured as a whole. While pieces overlap the square stays clipped; with no overlap it expires after 3 of your turns.' },
        { id: 'masks', name: 'Missing Textures', cost: 6, ult: true, kind: 'masks', desc: 'Ultimate: for 4 turns every piece of yours shows a fake icon to the other players. (Selecting it shows the moves of the icon, not the real piece.)' },
        { id: 'corrupt', name: 'Corrupted Save', cost: 8, ult: true, kind: 'corrupt', desc: 'Ultimate: every enemy piece (not kings) is shuffled onto its own side of the board (or within 1 square if it is on the far side). No king may end up in check; if no valid shuffle is found nothing happens and the points are refunded.' }
      ]
    },
    illusioner: {
      name: 'Illusioner',
      desc: 'Fools the enemy with ghosts and decoys.',
      passive: { desc: 'Mirage: the first time you would be checkmated, that king was a decoy: it vanishes and your real king appears on an empty square of your first two ranks (once per game). Spook: enemy sliders standing next to one of your ghosts can move at most 2 squares.', mirage: true, haunt: true },
      abilities: [
        { id: 'decoyP', name: 'Decoy Pawn', cost: 2, kind: 'decoy', piece: 'p', desc: 'A ghost pawn appears on an empty square in your half for 3 turns. It can be captured and never gives check.' },
        { id: 'decoyN', name: 'Decoy Knight', cost: 2, kind: 'decoy', piece: 'n', desc: 'A ghost knight appears on an empty square in your half for 3 turns. It can be captured and never gives check.' },
        { id: 'phantom', name: 'Phantom', cost: 4, kind: 'phantom', desc: 'One of your pieces (not the king) becomes a ghost for 2 turns: it can\'t be captured, but it can\'t capture or give check either.' },
        { id: 'mirror', name: 'Mirror', cost: 3, kind: 'mirror', desc: 'Swap places between one of your ghosts and another of your pieces (not the king).' },
        { id: 'haunt', name: 'Haunt', cost: 3, kind: 'haunt', desc: 'One of your ghosts haunts its neighbours: every enemy piece (not a king) next to it is frozen until your next turn.' },
        { id: 'hall', name: 'Hall of Mirrors', cost: 8, ult: true, kind: 'hall', desc: 'Ultimate: every ghost of yours is duplicated once onto an adjacent empty square (the copies are temporary decoys).' }
      ]
    },
    warrior: {
      name: 'Warrior',
      desc: 'A front-line fighter: pushes pawns, protects pieces, moves one piece twice and chain-captures.',
      passive: { desc: 'Pawns can jump 2 squares forward from any rank.', pawn: { charge: true } },
      abilities: [
        { id: 'charge', name: 'Charge', cost: 4, kind: 'charge', desc: 'Pick a piece: it makes two moves in a row this turn (both with that piece). If the first move gives check, your turn ends. Not available with 2 moves per turn.' },
        { id: 'shield', name: 'Shield', cost: 3, kind: 'shield', desc: 'One of your pieces (or a teammate\'s), not a king, can\'t be captured until your next turn.' },
        { id: 'rally', name: 'Rally', cost: 4, kind: 'rally', desc: 'Every pawn of yours on your 2nd-4th rank steps one square forward (if the square is empty).' },
        { id: 'overrun', name: 'Overrun', cost: 8, ult: true, kind: 'overrun', desc: 'Ultimate (replaces your move): pick a piece and chain-capture with it as long as it can. A capture that gives check ends the chain; the checked player responds, then control returns to you (in 4-player this overrides turn order). Not available with 2 moves per turn.' }
      ]
    },
    cleric: {
      name: 'Cleric',
      desc: 'Protects and restores your army.',
      passive: { desc: 'Your pieces next to your king can\'t be captured by pawns.', kingGuard: true },
      abilities: [
        { id: 'cleanse', name: 'Cleanse', cost: 2, kind: 'cleanse', desc: 'Removes Freeze/Disarm from your (and teammates\') pieces; the cleansed pieces can\'t be captured until your next turn.' },
        { id: 'revive', name: 'Revive', cost: 6, kind: 'revive', desc: 'Your most recently captured piece (not a queen) returns on an empty square of your first two ranks.' },
        { id: 'sanctuary', name: 'Sanctuary', cost: 3, kind: 'sanctuary', desc: 'Two of your pieces (or teammates\', not kings) can\'t be captured by pawns until your next turn.' },
        { id: 'resurrect', name: 'Resurrection', cost: 8, ult: true, kind: 'resurrect', desc: 'Ultimate: your last 2 captured pieces (a queen is allowed) return on empty squares of your first two ranks.' }
      ]
    }
  };
  const classPass = map => { const out = {}; for (const c in map || {}) if (CLASSES[map[c]] && CLASSES[map[c]].passive) out[c] = CLASSES[map[c]].passive; return out; };
  function withClasses(game, o) {
    const cls = o.classes || {}, cfg = Object.assign({}, CLASS_DEFAULTS, o.cfg), raw = game.raw;
    const ids = game.multi ? game.seats : ['w', 'b'];
    const pts = {}, ults = {}, summoned = {}, casts = {}, log = [];
    ids.forEach(c => { pts[c] = +cfg.start; ults[c] = 0; summoned[c] = 0; casts[c] = 0; });
    let lastTurn = game.turn;
    const grave = {}, g = Object.create(game);
    ids.forEach(c => { grave[c] = []; });
    const recent = {}, markers = [], clips = [], stacks = {}, maskTurns = {}, glitchLog = [], dupUsed = {}, ultSeen = {};
    const DUP_CHANCE = 0.12, DUP_CAP = 3, MASK_TURNS = 4, CORRUPT_TRIES = 300, MARKER_TURNS = 3, CLIP_TURNS = 3;      // MARKER_TURNS: how many of the Glitch player's turns a Restore Point lasts
    let seedState = (+cfg.seed || 1) >>> 0;       // one seedable RNG for everything random (mulberry32), so replays/reconnects match exactly
    const rnd = () => { seedState = (seedState + 0x6D2B79F5) >>> 0; let t = seedState; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; };
    let chg = null;                                // Charge in progress: {c, x, y, stage:1|2}
    let ovr = null;                                // Overrun: {c, x, y, n, locked} while chain-capturing, {resume, c, responder} while the checked player answers
    const mirageUsed = {}, mirageLog = [];
    let mines = [];                                // secret mines {x, y, c, ttl} (kept off the board; the UI shows them only to the owner's team)
    const stepsOf = (c, a) => { const st = KINDS[a.kind].steps; return typeof st === 'function' ? st(c, a) : st; };
    const tyOf = q => (q.pr ? 'p' : ((q.fx && q.fx.xt) || q.t));
    const noteCapture = (t, x, y) => {
      if (t && !t.dead && t.t !== 'k' && grave[t.c]) {
        const ty = tyOf(t); grave[t.c].push({ t: ty });
        const st = x != null ? stacks[x + ',' + y] : null, pass = st && st.c === t.c ? st.pass.filter(q => q && q.t !== 'k' && !q.dead) : [];      // a captured stack: the pieces overlapping with it were captured too
        pass.forEach(q => { if (grave[q.c]) grave[q.c].push({ t: tyOf(q) }); });
        if (cls[t.c] === 'glitch' && x != null) recent[t.c] = { x, y, t: ty, stk: pass.map(tyOf) };
      }
    };
    // NOTE: stored history entries lose flags like `castle` / `ep`, so these are detected from the board only (live play and replay must agree)
    const isCastle = m => { const p = m && !m.drop && game.at(m.fx, m.fy), t = p && game.at(m.tx, m.ty); return !!(p && p.t === 'k' && (Math.abs(m.tx - m.fx) >= 2 || (t && t.c === p.c))); };
    const isEp = m => { const p = m && !m.drop && game.at(m.fx, m.fy); if (!p || p.t !== 'p' || p.champ || m.tx === m.fx || game.at(m.tx, m.ty)) return false; const v = game.at(m.tx, m.fy); return !!(v && v.t === 'p' && v.c !== p.c); };
    const victimOf = m => (!m || m.drop || m.ab || isCastle(m) ? null : (isEp(m) ? game.at(m.tx, m.fy) : game.at(m.tx, m.ty)));
    const setFx = (p, drop, add) => {             // copy of piece p with some status effects removed and/or added
      const f = Object.assign({}, p.fx); (drop || []).forEach(k => { delete f[k]; });
      return Object.assign({}, p, { fx: Object.keys(Object.assign(f, add)).length ? f : undefined });
    };
    const isCap = m => isEp(m) || (!isCastle(m) && !!(game.at(m.tx, m.ty) && !game.at(m.tx, m.ty).wall));
    const ghostsOf = c => raw.scan().filter(({ p }) => p.fx && (p.fx.dcy === c || p.fx.phn === c));
    const alive = c => (game.alive ? !!game.alive(c) : true);
    function tryMirage(c) {                        // Illusioner passive: the king about to be checkmated was a decoy
      if (cls[c] !== 'illusioner' || mirageUsed[c]) return false;
      const k = raw.scan().find(({ p }) => p.t === 'k' && p.c === c && !p.dead);
      if (!k) return false;
      for (const [x, y] of raw.home(c)) {
        if (game.at(x, y)) continue;
        const s0 = raw.snap(); raw.remove(k.x, k.y); raw.put(x, y, Object.assign({}, k.p, { m: true }));
        const nearKing = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]].some(([dx, dy]) => { const t = raw.valid(x + dx, y + dy) && game.at(x + dx, y + dy); return t && t.t === 'k' && raw.foe(c, t); });
        if (!raw.check(c) && !nearKing) { mirageUsed[c] = true; mirageLog.push({ at: game.history().length, c, fx: k.x, fy: k.y, tx: x, ty: y }); return true; }
        raw.restore(s0);
      }
      return false;
    }
    if (raw.setRescue) raw.setRescue(tryMirage);
    const afterAction = () => { if (!game.multi && cls[game.turn] === 'illusioner' && game.status() === 'checkmate') tryMirage(game.turn); };   // (4-player: handled inside the engine's elimination step)
    const WALL = (c, ttl) => ({ t: '#', c: 'x', wall: true, by: c, ttl });
    const empties = () => { const out = [], [W, H] = raw.size; for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) if (raw.valid(x, y) && !game.at(x, y)) out.push({ x, y }); return out; };
    const fortressSquares = c => { const k = raw.scan().find(({ p }) => p.t === 'k' && p.c === c && !p.dead); return k ? [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]].map(([dx, dy]) => ({ x: k.x + dx, y: k.y + dy })).filter(q => raw.valid(q.x, q.y) && !game.at(q.x, q.y)) : []; };
    const cheap = (list, c, a) => (raw.check(c) ? list.filter(q => legalCast(c, a, undefined, undefined, q.x, q.y)).map(q => sq(q.x, q.y)) : list.map(q => sq(q.x, q.y)));   // walls/mines can't endanger the own king: only test while in check
    function triggerMines() {                      // an enemy non-king piece standing on a mine is destroyed (unless that would expose its own king)
      for (let i = mines.length - 1; i >= 0; i--) {
        const m = mines[i], p = game.at(m.x, m.y);
        if (!p || p.t === 'k' || p.wall || !raw.foe(m.c, p)) continue;
        const s0 = raw.snap(); raw.remove(m.x, m.y);
        if (raw.check(p.c)) { raw.restore(s0); continue; }
        mines.splice(i, 1); raw.clearEp();
      }
    }
    const allies = (c, f) => raw.scan().filter(({ x, y, p }) => raw.ally(c, p) && p.t !== 'k' && f(p, x, y));
    const at = (x, y) => game.at(x, y);
    const sq = (x, y) => ({ x, y });
    const withFx = (p, k, by) => Object.assign({}, p, { fx: Object.assign({}, p.fx, { [k]: by }) });
    const around = (x, y, r) => { const out = []; for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) if ((dx || dy) && raw.valid(x + dx, y + dy)) out.push([x + dx, y + dy]); return out; };
    const foes = (c, f) => raw.scan().filter(({ x, y, p }) => raw.foe(c, p) && p.t !== 'k' && f(p, x, y));
    const mine = (c, f) => raw.scan().filter(({ x, y, p }) => p.c === c && !p.dead && p.t !== 'k' && f(p, x, y));
    // trial: would the cast leave the caster's own king attacked? (the board is restored afterwards)
    const legalCast = (c, a, fx, fy, tx, ty) => {
      const s0 = raw.snap(); KINDS[a.kind].run(c, a, fx, fy, tx, ty, true);
      const bad = raw.check(c); raw.restore(s0); return !bad;
    };
    const oneClick = (cands, c, a) => cands.filter(q => legalCast(c, a, undefined, undefined, q.x, q.y)).map(q => sq(q.x, q.y));
    const KINDS = {
      summon: {
        steps: 1,
        first: (c, a) => oneClick(raw.home(c).filter(([x, y]) => !at(x, y)).map(([x, y]) => sq(x, y)), c, a),
        run: (c, a, fx, fy, tx, ty) => raw.put(tx, ty, { t: a.piece, c, m: true })
      },
      steal: {
        steps: 1,
        first: (c, a) => oneClick(foes(c, p => p.t === 'p'), c, a),
        run: (c, a, fx, fy, tx, ty) => { raw.put(tx, ty, Object.assign({}, at(tx, ty), { c, fx: undefined })); raw.clearEp(); }
      },
      assassinate: {
        steps: 1,
        first: (c, a) => oneClick(foes(c, () => true), c, a),
        run: (c, a, fx, fy, tx, ty) => { raw.remove(tx, ty); raw.clearEp(); }
      },
      disarm: {
        steps: 1,
        first: (c, a) => oneClick(foes(c, p => !(p.fx && p.fx.dis)), c, a),
        run: (c, a, fx, fy, tx, ty) => raw.put(tx, ty, withFx(at(tx, ty), 'dis', c))
      },
      freeze: {
        steps: 1,
        first: (c, a) => oneClick(foes(c, p => !(p.fx && p.fx.frz)), c, a),
        run: (c, a, fx, fy, tx, ty) => raw.put(tx, ty, withFx(at(tx, ty), 'frz', c))
      },
      jump: {
        steps: 1,
        first: (c, a) => oneClick(mine(c, p => 'rbqa'.includes(p.t) && !(p.fx && p.fx.jmp)), c, a),
        run: (c, a, fx, fy, tx, ty) => raw.put(tx, ty, withFx(at(tx, ty), 'jmp', c))
      },
      meteor: {
        steps: 1,
        first: (c, a) => {
          const cands = [], [W, H] = raw.size;
          for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) {
            if (!raw.valid(x, y)) continue;
            if ([[0, 0]].concat(around(x, y, 1).map(q => [q[0] - x, q[1] - y])).some(([dx, dy]) => { const p = raw.valid(x + dx, y + dy) && at(x + dx, y + dy); return p && p.t !== 'k'; })) cands.push(sq(x, y));
          }
          return oneClick(cands, c, a);
        },
        run: (c, a, fx, fy, tx, ty) => {
          [[tx, ty]].concat(around(tx, ty, 1)).forEach(([x, y]) => { const p = at(x, y); if (p && p.t !== 'k') raw.remove(x, y); });
          raw.clearEp();
        }
      },
      wall: {
        steps: 1,
        first: (c, a) => cheap(empties(), c, a),
        run: (c, a, fx, fy, tx, ty) => raw.put(tx, ty, WALL(c, 2))
      },
      fortress: {
        steps: 0,
        first: (c, a) => (fortressSquares(c).length && legalCast(c, a, 0, 0, 0, 0) ? [sq(0, 0)] : []),
        run: (c, a) => { fortressSquares(c).forEach(q => raw.put(q.x, q.y, WALL(c, 3))); }
      },
      laymine: {
        steps: 1,
        first: (c, a) => cheap(empties().filter(q => raw.rank(c, q.x, q.y) < Math.floor(raw.depth / 2) && !mines.some(m => m.x === q.x && m.y === q.y)), c, a),
        run: (c, a, fx, fy, tx, ty, dry) => { if (!dry) mines.push({ x: tx, y: ty, c, ttl: 2 }); }
      },
      rewire: {
        steps: 2,
        first: (c, a) => mine(c, () => true).filter(({ x, y }) => KINDS.rewire.second(c, a, sq(x, y)).length).map(q => sq(q.x, q.y)),
        second: (c, a, from) => {
          const p1 = at(from.x, from.y), pawnOk = (p, x, y) => p.t !== 'p' || (raw.rank(c, x, y) >= 1 && raw.rank(c, x, y) < raw.promo(c));
          return mine(c, (p, x, y) => (x !== from.x || y !== from.y) && pawnOk(p1, x, y) && pawnOk(p, from.x, from.y))
            .filter(q => legalCast(c, a, from.x, from.y, q.x, q.y)).map(q => sq(q.x, q.y));
        },
        run: (c, a, fx, fy, tx, ty) => { const p1 = at(fx, fy), p2 = at(tx, ty); raw.put(fx, fy, Object.assign({}, p2, { m: true })); raw.put(tx, ty, Object.assign({}, p1, { m: true })); }
      },
      haunt: {
        steps: 1,
        first: (c, a) => oneClick(ghostsOf(c).filter(({ x, y }) => around(x, y, 1).some(([qx, qy]) => { const t = at(qx, qy); return t && raw.foe(c, t) && t.t !== 'k'; })), c, a),
        run: (c, a, fx, fy, tx, ty) => { around(tx, ty, 1).forEach(([qx, qy]) => { const t = at(qx, qy); if (t && raw.foe(c, t) && t.t !== 'k') raw.put(qx, qy, withFx(t, 'frz', c)); }); }
      },
      wires: {
        steps: 2,
        first: (c, a) => mine(c, p => !(p.fx && p.fx.xw)).filter(({ x, y }) => KINDS.wires.second(c, a, sq(x, y)).length).map(q => sq(q.x, q.y)),
        second: (c, a, from) => {
          const p1 = at(from.x, from.y), okType = (t, x, y) => t !== 'p' || raw.rank(c, x, y) < raw.promo(c);      // (a pawn-type piece just may not sit on the promotion rank)
          return mine(c, (p, x, y) => (x !== from.x || y !== from.y) && !(p.fx && p.fx.xw) && p.t !== p1.t && okType(p.t, from.x, from.y) && okType(p1.t, x, y))
            .filter(q => legalCast(c, a, from.x, from.y, q.x, q.y)).map(q => sq(q.x, q.y));
        },
        run: (c, a, fx, fy, tx, ty) => {
          const p1 = at(fx, fy), p2 = at(tx, ty), id = 'w' + log.length + '_' + game.history().length;
          raw.put(fx, fy, Object.assign({}, p1, { t: p2.t, fx: Object.assign({}, p1.fx, { xw: id, xt: p1.t, xn: p2.t, xg: 2, xc: c }) }));
          raw.put(tx, ty, Object.assign({}, p2, { t: p1.t, fx: Object.assign({}, p2.fx, { xw: id, xt: p2.t, xn: p1.t, xg: 2, xc: c }) }));
        }
      },
      restore: {
        steps: 0,
        first: (c, a) => (recent[c] && legalCast(c, a, 0, 0, 0, 0) ? [sq(0, 0)] : []),
        run: (c, a, fx, fy, tx, ty, dry) => { if (!dry && recent[c]) { markers.push({ x: recent[c].x, y: recent[c].y, c, t: recent[c].t, stk: recent[c].stk || [], ttl: MARKER_TURNS }); recent[c] = null; } }
      },
      clip: {
        steps: 1,
        first: (c, a) => empties().map(q => sq(q.x, q.y)).concat(mine(c, p => !(p.fx && p.fx.xw)).map(q => sq(q.x, q.y))).filter(q => !clips.some(z => z.x === q.x && z.y === q.y)),
        run: (c, a, fx, fy, tx, ty, dry) => { if (!dry) clips.push({ x: tx, y: ty, c, ttl: CLIP_TURNS }); }      // (a clip never changes the board, so it can't endanger a king)
      },
      masks: {
        steps: 0,
        first: (c, a) => (raw.scan().some(({ p }) => p.c === c && !p.dead && !p.wall) && legalCast(c, a, 0, 0, 0, 0) ? [sq(0, 0)] : []),
        run: (c, a, fx, fy, tx, ty, dry) => {
          if (dry) return;
          const own = raw.scan().filter(({ p }) => p.c === c && !p.dead && !p.wall), types = shuffle(own.map(({ p }) => p.t));
          own.forEach(({ p }, i) => { for (let j = 0; j < own.length && types[i] === p.t; j++) { const k = (i + 1 + j) % own.length; if (types[k] !== p.t && types[i] !== own[k].p.t) { const tt = types[i]; types[i] = types[k]; types[k] = tt; } } });
          own.forEach(({ x, y, p }, i) => raw.put(x, y, Object.assign({}, p, { fx: Object.assign({}, p.fx, { msk: types[i] }) })));
          maskTurns[c] = MASK_TURNS;
        }
      },
      corrupt: {
        steps: 0,
        first: (c, a) => (foes(c, () => true).length && !raw.check(c) ? [sq(0, 0)] : []),
        run: (c, a, fx, fy, tx, ty, dry) => {
          if (dry) return true;
          const enemies = foes(c, () => true), s0 = raw.snap(), half = Math.floor(raw.depth / 2), [W, H] = raw.size;
          for (let tries = 0; tries < CORRUPT_TRIES; tries++) {
            raw.restore(s0);
            enemies.forEach(({ x, y }) => raw.remove(x, y));
            const taken = new Set(raw.scan().map(({ x, y }) => x + ',' + y));
            let ok = true;
            for (const { x, y, p } of shuffle(enemies.slice())) {
              let cand = [];
              if (raw.rank(p.c, x, y) < half) { for (let qx = 0; qx < W; qx++) for (let qy = 0; qy < H; qy++) if (raw.valid(qx, qy) && raw.rank(p.c, qx, qy) < half && !taken.has(qx + ',' + qy)) cand.push([qx, qy]); }
              else cand = around(x, y, 1).concat([[x, y]]).filter(([qx, qy]) => !taken.has(qx + ',' + qy));
              if (p.t === 'p') cand = cand.filter(([qx, qy]) => raw.rank(p.c, qx, qy) >= 1 && raw.rank(p.c, qx, qy) < raw.promo(p.c));
              if (!cand.length) { ok = false; break; }
              const [qx, qy] = cand[Math.floor(rnd() * cand.length)];
              taken.add(qx + ',' + qy); raw.put(qx, qy, Object.assign({}, p, { m: true }));
            }
            if (ok && ids.every(sc => !raw.check(sc))) { raw.clearEp(); return true; }
          }
          raw.restore(s0); return false;
        }
      },
      decoy: {
        steps: 1,
        first: (c, a) => cheap(empties().filter(q => raw.rank(c, q.x, q.y) < Math.floor(raw.depth / 2)), c, a),
        run: (c, a, fx, fy, tx, ty) => raw.put(tx, ty, { t: a.piece, c, m: true, fx: { dcy: c, gt: 3, dec: true } })
      },
      phantom: {
        steps: 1,
        first: (c, a) => cheap(mine(c, p => !(p.fx && (p.fx.phn || p.fx.dcy))), c, a),
        run: (c, a, fx, fy, tx, ty) => raw.put(tx, ty, Object.assign({}, at(tx, ty), { fx: Object.assign({}, at(tx, ty).fx, { phn: c, gt: 2 }) }))
      },
      mirror: {
        steps: 2,
        first: (c, a) => ghostsOf(c).filter(({ p }) => p.t !== 'k').filter(({ x, y }) => KINDS.mirror.second(c, a, sq(x, y)).length).map(q => sq(q.x, q.y)),
        second: (c, a, from) => {
          const p1 = at(from.x, from.y), pawnOk = (p, x, y) => p.t !== 'p' || (raw.rank(c, x, y) >= 1 && raw.rank(c, x, y) < raw.promo(c));
          return mine(c, (p, x, y) => (x !== from.x || y !== from.y) && pawnOk(p1, x, y) && pawnOk(p, from.x, from.y))
            .filter(q => legalCast(c, a, from.x, from.y, q.x, q.y)).map(q => sq(q.x, q.y));
        },
        run: (c, a, fx, fy, tx, ty) => { const p1 = at(fx, fy), p2 = at(tx, ty); raw.put(fx, fy, Object.assign({}, p2, { m: true })); raw.put(tx, ty, Object.assign({}, p1, { m: true })); }
      },
      hall: {
        steps: 0,
        first: (c, a) => { const s0 = raw.snap(), n = KINDS.hall.run(c, a), bad = raw.check(c); raw.restore(s0); return n > 0 && !bad ? [sq(0, 0)] : []; },
        run: (c, a) => {                           // every ghost makes ONE temporary decoy copy on an adjacent empty square
          let n = 0;
          ghostsOf(c).filter(({ p }) => p.t !== 'k').forEach(({ x, y, p }) => {
            for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
              const tx = x + dx, ty = y + dy;
              if (!raw.valid(tx, ty) || at(tx, ty)) continue;
              if (p.t === 'p' && (raw.rank(c, tx, ty) < 1 || raw.rank(c, tx, ty) >= raw.promo(c))) continue;
              raw.put(tx, ty, { t: p.t, c, m: true, fx: { dcy: c, gt: p.fx.gt || 2, dec: true } }); n++; break;
            }
          });
          return n;
        }
      },
      overrun: {
        steps: 1,
        first: (c, a) => game.perTurn > 1 ? [] : oneClick(raw.scan().filter(({ x, y, p }) => p.c === c && !p.dead && game.moves(x, y).some(isCap)), c, a),
        run: (c, a, fx, fy, tx, ty, dry) => { if (!dry) ovr = { c, x: tx, y: ty, n: 0, locked: true }; }
      },
      charge: {
        steps: 1,
        first: (c, a) => game.perTurn > 1 ? [] : oneClick(raw.scan().filter(({ x, y, p }) => p.c === c && !p.dead && game.moves(x, y).length), c, a),
        run: (c, a, fx, fy, tx, ty, dry) => { if (!dry) chg = { c, x: tx, y: ty, stage: 1 }; }
      },
      shield: {
        steps: 1,
        first: (c, a) => oneClick(allies(c, p => !(p.fx && p.fx.shd)), c, a),
        run: (c, a, fx, fy, tx, ty) => raw.put(tx, ty, withFx(at(tx, ty), 'shd', c))
      },
      rally: {
        steps: 0,
        first: (c, a) => { const s0 = raw.snap(), n = KINDS.rally.run(c, a, 0, 0, 0, 0, true), bad = raw.check(c); raw.restore(s0); return n > 0 && !bad ? [sq(0, 0)] : []; },
        run: (c, a) => {                           // pawns on own ranks 2-4 step forward (front pawns first); a step that would leave the king attacked is skipped
          const [dx, dy] = raw.fwd(c); let n = 0;
          mine(c, (p, x, y) => p.t === 'p' && raw.rank(c, x, y) >= 1 && raw.rank(c, x, y) <= 3)
            .sort((u, w2) => raw.rank(c, w2.x, w2.y) - raw.rank(c, u.x, u.y)).forEach(({ x, y, p }) => {
              const tx = x + dx, ty = y + dy;
              if (!raw.valid(tx, ty) || at(tx, ty) || raw.rank(c, tx, ty) >= raw.promo(c)) return;
              const s1 = raw.snap(); raw.remove(x, y); raw.put(tx, ty, Object.assign({}, p, { m: true }));
              if (raw.check(c)) raw.restore(s1); else n++;
            });
          if (n) raw.clearEp();
          return n;
        }
      },
      cleanse: {
        steps: 0,
        first: (c, a) => (allies(c, p => p.fx && (p.fx.frz || p.fx.dis)).length && legalCast(c, a, 0, 0, 0, 0) ? [sq(0, 0)] : []),
        run: (c, a) => { allies(c, p => p.fx && (p.fx.frz || p.fx.dis)).forEach(({ x, y, p }) => raw.put(x, y, setFx(p, ['frz', 'dis'], { shd: c }))); }
      },
      sanctuary: {
        steps: 2,
        first: (c, a) => allies(c, () => true).filter(({ x, y }) => KINDS.sanctuary.second(c, a, sq(x, y)).length).map(q => sq(q.x, q.y)),
        second: (c, a, from) => allies(c, (p, x, y) => (x !== from.x || y !== from.y) && !(p.fx && p.fx.sct)).map(q => sq(q.x, q.y)).filter(q => legalCast(c, a, from.x, from.y, q.x, q.y)),
        run: (c, a, fx, fy, tx, ty) => { [[fx, fy], [tx, ty]].forEach(([x, y]) => raw.put(x, y, withFx(at(x, y), 'sct', c))); }
      },
      revive: {
        steps: 1,
        first: (c, a) => (KINDS.revive.pick(c) < 0 ? [] : oneClick(raw.home(c).filter(([x, y]) => !at(x, y)).map(([x, y]) => sq(x, y)), c, a)),
        pick: c => { for (let i = grave[c].length - 1; i >= 0; i--) if (grave[c][i].t !== 'q') return i; return -1; },
        run: (c, a, fx, fy, tx, ty, dry) => { const i = KINDS.revive.pick(c); raw.put(tx, ty, { t: grave[c][i].t, c, m: true }); if (!dry) grave[c].splice(i, 1); }
      },
      resurrect: {
        steps: c => (grave[c].length >= 2 ? 2 : 1),
        first: (c, a) => {
          if (!grave[c].length) return [];
          const empty = raw.home(c).filter(([x, y]) => !at(x, y)).map(([x, y]) => sq(x, y));
          return grave[c].length >= 2 ? empty.filter(q => KINDS.resurrect.second(c, a, q).length) : oneClick(empty, c, a);
        },
        second: (c, a, from) => raw.home(c).filter(([x, y]) => !at(x, y) && (x !== from.x || y !== from.y)).map(([x, y]) => sq(x, y)).filter(q => legalCast(c, a, from.x, from.y, q.x, q.y)),
        run: (c, a, fx, fy, tx, ty, dry) => {
          const gv = grave[c], n = Math.min(2, gv.length);
          if (n === 2) { raw.put(fx, fy, { t: gv[gv.length - 1].t, c, m: true }); raw.put(tx, ty, { t: gv[gv.length - 2].t, c, m: true }); }
          else if (n === 1) raw.put(tx, ty, { t: gv[gv.length - 1].t, c, m: true });
          if (!dry) gv.splice(gv.length - n, n);
        }
      },
      blink: {
        steps: 2,
        first: (c, a) => mine(c, p => !(p.fx && p.fx.frz)).filter(({ x, y }) => KINDS.blink.second(c, a, sq(x, y)).length).map(q => sq(q.x, q.y)),
        second: (c, a, from) => {
          const p = at(from.x, from.y), out = [];
          if (!p) return out;
          around(from.x, from.y, 2).forEach(([x, y]) => {
            if (at(x, y)) return;
            if (p.t === 'p') { const r = raw.rank(c, x, y); if (r < 1 || r >= raw.promo(c)) return; }
            if (legalCast(c, a, from.x, from.y, x, y)) out.push(sq(x, y));
          });
          return out;
        },
        run: (c, a, fx, fy, tx, ty) => { const p = at(fx, fy); raw.remove(fx, fy); raw.put(tx, ty, Object.assign({}, p, { m: true })); }
      },
      backstab: {
        steps: 2,
        first: (c, a) => mine(c, p => !(p.fx && (p.fx.frz || p.fx.dis))).filter(({ x, y }) => KINDS.backstab.second(c, a, sq(x, y)).length).map(q => sq(q.x, q.y)),
        second: (c, a, from) => around(from.x, from.y, 1).filter(([x, y]) => { const t = at(x, y); return t && raw.foe(c, t) && t.t !== 'k' && legalCast(c, a, from.x, from.y, x, y); }).map(([x, y]) => sq(x, y)),
        run: (c, a, fx, fy, tx, ty, dry) => {
          const p = at(fx, fy);
          if (dry) raw.remove(tx, ty); else { noteCapture(at(tx, ty), tx, ty); raw.take(tx, ty, c); }
          raw.remove(fx, fy);
          const np = Object.assign({}, p, { m: true });
          if (p.t === 'p' && raw.rank(c, tx, ty) >= raw.promo(c)) { np.t = 'q'; np.pr = true; np.champ = undefined; }
          raw.put(tx, ty, np); raw.clearEp();
        }
      }
    };
    // ---- Clipping: a clipped square lets its owner's pieces overlap. The piece on the board is the 'primary'; the others (passengers) wait in stacks[key].pass ----
    const kk = (x, y) => x + ',' + y;
    const stackOk = p => !!p && !p.wall && !p.dead && p.t !== 'k' && !(p.fx && p.fx.xw);
    function swapIn(x, y, i) {                     // exchange the board piece with passenger i-1 (so that passenger is the one that moves)
      const st = stacks[kk(x, y)], p = at(x, y);
      if (!st || !p || p.c !== st.c || !st.pass[i - 1]) return false;
      const q = st.pass[i - 1]; st.pass[i - 1] = p; raw.put(x, y, q); return true;
    }
    function doPick(x, y, i, c) {                  // choose a stack member for the next move (logged, so replays and reconnects match)
      const p = at(x, y);
      if (!(i > 0) || !p || p.c !== c || !swapIn(x, y, i)) return false;
      log.push({ at: game.history().length, ab: 'pick', c, tx: x, ty: y, i });
      return true;
    }
    function withMember(x, y, i, fn) {             // run fn() with passenger i on the board (swapped in), then swap back
      if (!i) return fn();
      if (!swapIn(x, y, i)) return [];
      try { return fn(); } finally { swapIn(x, y, i); }
    }
    function joinMoves(x, y, i) {                  // moves of a member that end on one of the owner's clipped squares holding an own piece (overlap)
      if (!clips.length) return [];
      const p = i ? (stacks[kk(x, y)] || { pass: [] }).pass[i - 1] : at(x, y);
      if (!stackOk(p) || game.turn !== p.c) return [];
      const out = [];
      clips.forEach(z => {
        if (z.c !== p.c || (z.x === x && z.y === y)) return;
        const t = at(z.x, z.y);
        if (!stackOk(t) || t.c !== p.c) return;
        if (p.t === 'p') { const r = raw.rank(p.c, z.x, z.y); if (r < 1 || r >= raw.promo(p.c)) return; }
        const s0 = raw.snap();
        try {
          if (i) swapIn(x, y, i);
          raw.remove(z.x, z.y);
          game.moves(x, y).forEach(m => { if (m.tx === z.x && m.ty === z.y && !m.castle && !m.ep && !m.promo) out.push(Object.assign({}, m, { join: true })); });
        } finally { if (i) swapIn(x, y, i); raw.restore(s0); }
      });
      return out;
    }
    // engine hook: stacked pieces attack too. A passenger attacks from the square it shares (as if it stood there); if the top piece left a square (a move being tried), the next passenger is revealed there
    const stkHook = (b, idx) => {
      const keys = Object.keys(stacks);
      if (!keys.length) return null;
      const put = [], extra = [];
      keys.forEach(k => {
        const st = stacks[k]; if (!st.pass.length) return;
        const xy = k.split(',').map(Number), i = idx(xy[0], xy[1]), o = b[i];
        if (!o) { put.push([i, st.pass[st.pass.length - 1]]); st.pass.slice(0, -1).forEach(q => extra.push([i, q])); }
        else if (o.c === st.c && !o.wall && !o.dead && o.t !== 'k') st.pass.forEach(q => extra.push([i, q]));
      });
      return put.length || extra.length ? { put, extra } : null;
    };
    if (raw.setStacks) raw.setStacks(stkHook);
    function syncStacks() {                        // keep stacks/clips consistent with the board (after moves, abilities, expiry)
      Object.keys(stacks).forEach(k => {
        const st = stacks[k], xy = k.split(',').map(Number), p = at(xy[0], xy[1]);
        if (p && !p.wall && !p.dead && p.c === st.c && p.t !== 'k') { if (!st.pass.length) delete stacks[k]; return; }
        if (!p && st.pass.length) raw.put(xy[0], xy[1], st.pass.pop());      // the primary left: the next piece is revealed on the square
        else if (p) st.pass.length = 0;                                      // captured / destroyed / converted: the whole stack is gone
        if (!st.pass.length) delete stacks[k];
      });
      for (let i = clips.length - 1; i >= 0; i--) {
        const z = clips[i], p = at(z.x, z.y), st = stacks[kk(z.x, z.y)];
        if (p && !p.wall && p.c !== z.c) { clips.splice(i, 1); continue; }   // somebody else holds the square now
        if (st && st.pass.length) z.ttl = CLIP_TURNS;                        // overlapping pieces keep the clip alive (the timer restarts when they separate)
      }
    }
    const find = (c, id) => { const k = CLASSES[cls[c]]; return k ? k.abilities.find(a => a.id === id) || null : null; };
    const wireGroups = () => { const gr = {}; raw.scan().forEach(({ x, y, p }) => { if (p.fx && p.fx.xw) (gr[p.fx.xw] = gr[p.fx.xw] || []).push({ x, y, p }); }); return gr; };
    const unwire = (x, y, p, revert) => {          // end Crossed Wires on a piece (optionally giving back its real type; a pawn left on the promotion rank becomes a queen)
      const f = Object.assign({}, p.fx); ['xw', 'xt', 'xn', 'xg', 'xc'].forEach(k => { delete f[k]; });
      const np = Object.assign({}, p, { fx: Object.keys(f).length ? f : undefined });
      if (revert) { np.t = p.fx.xt; if (np.t === 'p' && raw.rank(p.c, x, y) >= raw.promo(p.c)) { np.t = 'q'; np.pr = true; } }
      raw.put(x, y, np);
    };
    function checkWires(strict) {                  // Crossed Wires ends when a partner is gone or a swapped pawn promoted
      const grs = wireGroups();                    // (strict = after a normal move: the revert waits if it would let the side to move capture a king)
      Object.keys(grs).forEach(id => {
        const gr = grs[id], s0 = raw.snap();
        if (gr.length < 2) gr.forEach(({ x, y, p }) => unwire(x, y, p, true));
        else if (gr.some(({ p }) => p.t !== p.fx.xn)) gr.forEach(({ x, y, p }) => unwire(x, y, p, p.t === p.fx.xn));
        else return;
        if (strict && raw.foeCheck(game.turn)) raw.restore(s0);
      });
    }
    function glitchStart(c) {                      // Glitch turn start: Restore Points trigger, then the Duplication Bug may strike. Returns true if the board changed
      let changed = false;
      for (let i = markers.length - 1; i >= 0; i--) {
        const m = markers[i];
        if (m.c !== c) continue;
        if (at(m.x, m.y)) { if (--m.ttl <= 0) markers.splice(i, 1); continue; }      // an occupied square makes the marker wait, but it only lasts MARKER_TURNS of your turns
        raw.put(m.x, m.y, { t: m.t, c, m: true }); markers.splice(i, 1); changed = true;
        if (m.stk && m.stk.length) {                                              // a whole stack comes back
          stacks[kk(m.x, m.y)] = { c, pass: m.stk.map(t => ({ t, c, m: true })) };
          const z = clips.find(q => q.x === m.x && q.y === m.y);
          if (z) { z.c = c; z.ttl = CLIP_TURNS; } else clips.push({ x: m.x, y: m.y, c, ttl: CLIP_TURNS });
        }
        glitchLog.push({ at: game.history().length, c, kind: 'revive', x: m.x, y: m.y, t: m.t });
      }
      dupUsed[c] = dupUsed[c] || 0;
      if (dupUsed[c] < DUP_CAP && rnd() < DUP_CHANCE) {
        const [dx, dy] = raw.fwd(c);
        const cands = raw.scan().filter(({ x, y, p }) => p.c === c && p.t === 'p' && !p.dead && !(p.fx && p.fx.xw) && raw.valid(x + dx, y + dy) && !at(x + dx, y + dy) && raw.rank(c, x + dx, y + dy) < raw.promo(c));
        if (cands.length) {
          const q = cands[Math.floor(rnd() * cands.length)];
          raw.put(q.x + dx, q.y + dy, { t: 'p', c, m: false }); dupUsed[c]++; changed = true;
          glitchLog.push({ at: game.history().length, c, kind: 'dup', x: q.x + dx, y: q.y + dy, t: 'p' });
        }
      }
      return changed;
    }
    const TIMED = { frz: 1, dis: 1, jmp: 1, shd: 1, sct: 1 };
    function expire() {                            // status effects end when their caster's next turn begins (or the caster is out)
      raw.scan().forEach(({ x, y, p }) => {
        if (!p.fx) return;
        const nf = {}; let ch = false;
        for (const k in p.fx) { const by = p.fx[k]; if (!TIMED[k]) { nf[k] = by; continue; } if (by === game.turn || (game.alive && !game.alive(by))) ch = true; else nf[k] = by; }
        if (ch) raw.put(x, y, Object.assign({}, p, { fx: Object.keys(nf).length ? nf : undefined }));
      });
      raw.scan().forEach(({ x, y, p }) => {         // walls vanish after their turns run out (kept one more turn if removal would leave an enemy king attacked)
        if (!p.wall) return;
        const gone = game.alive && !game.alive(p.by);
        if (p.by !== game.turn && !gone) return;
        const ttl = gone ? 0 : p.ttl - 1;
        if (ttl > 0) { raw.put(x, y, Object.assign({}, p, { ttl })); return; }
        const s0 = raw.snap(); raw.remove(x, y);
        if (raw.foeCheck(game.turn)) { raw.restore(s0); raw.put(x, y, Object.assign({}, p, { ttl: 0 })); }
      });
      raw.scan().forEach(({ x, y, p }) => {         // ghosts: decoys vanish and phantoms turn solid after their turns run out (postponed if that would leave an enemy king attacked)
        if (!p.fx || p.fx.gt == null) return;
        const by = p.fx.dcy || p.fx.phn, gone = game.alive && !game.alive(by);
        if (by !== game.turn && !gone) return;
        const gt = gone ? 0 : p.fx.gt - 1;
        if (gt > 0) { raw.put(x, y, Object.assign({}, p, { fx: Object.assign({}, p.fx, { gt }) })); return; }
        const s0 = raw.snap();
        if (p.fx.dec) raw.remove(x, y); else { const f = Object.assign({}, p.fx); delete f.phn; delete f.gt; raw.put(x, y, Object.assign({}, p, { fx: Object.keys(f).length ? f : undefined })); }
        if (raw.foeCheck(game.turn)) { raw.restore(s0); raw.put(x, y, Object.assign({}, p, { fx: Object.assign({}, p.fx, { gt: 0 }) })); }
      });
      const wg = wireGroups();                      // Crossed Wires: 2 turns of the caster, postponed if undoing it would leave an enemy king attacked
      Object.keys(wg).forEach(id => {
        const gr = wg[id], by = gr[0].p.fx.xc, gone = game.alive && !game.alive(by);
        if (by !== game.turn && !gone) return;
        const left = gone ? 0 : gr[0].p.fx.xg - 1;
        if (left > 0) { gr.forEach(({ x, y, p }) => raw.put(x, y, Object.assign({}, p, { fx: Object.assign({}, p.fx, { xg: left }) }))); return; }
        const s0 = raw.snap(); gr.forEach(({ x, y, p }) => unwire(x, y, p, true));
        if (raw.foeCheck(game.turn)) { raw.restore(s0); gr.forEach(({ x, y, p }) => raw.put(x, y, Object.assign({}, p, { fx: Object.assign({}, p.fx, { xg: 0 }) }))); }
      });
      if (maskTurns[game.turn] && --maskTurns[game.turn] <= 0) {      // Missing Textures wears off
        delete maskTurns[game.turn];
        raw.scan().forEach(({ x, y, p }) => { if (p.c === game.turn && p.fx && p.fx.msk) { const f = Object.assign({}, p.fx); delete f.msk; raw.put(x, y, Object.assign({}, p, { fx: Object.keys(f).length ? f : undefined })); } });
      }
      clips.splice(0, clips.length, ...clips.filter(z => {      // Clipping: lasts while pieces overlap; otherwise it expires after CLIP_TURNS of the caster's turns
        if (game.alive && !game.alive(z.c)) return false;
        const st = stacks[kk(z.x, z.y)];
        return (st && st.pass.length) || z.c !== game.turn || --z.ttl > 0;
      }));
      mines = mines.filter(m => !(game.alive && !game.alive(m.c)) && !(m.c === game.turn && --m.ttl <= 0));
    }
    function turnChanged() {                       // a new turn starts: that player earns points
      if (game.turn === lastTurn) return;
      lastTurn = game.turn;
      expire(); syncStacks();
      if (pts[lastTurn] != null) { pts[lastTurn] = Math.max(pts[lastTurn], Math.min(+cfg.cap, pts[lastTurn] + +cfg.gain)); casts[lastTurn] = 0; }
      if (cls[lastTurn] === 'glitch' && raw.ok(lastTurn) && glitchStart(lastTurn) && raw.foeCheck(lastTurn)) { raw.pass(); turnChanged(); }      // a revival/duplicate that gives check ends the turn
    }
    const base = (c, a) => {                       // reasons an ability can't be cast right now (not counting targets)
      if (game.turn !== c) return 'Not your turn';
      if (!raw.ok(c)) return 'Game over';
      if (chg && chg.c === c) return 'Finish your Charge first';
      if (ovr && ovr.locked && ovr.c === c) return 'Finish your Overrun first';
      if ((a.kind === 'charge' || a.kind === 'overrun') && game.perTurn > 1) return 'Not available with 2 moves per turn';
      if (pts[c] < a.cost) return 'Needs ' + a.cost + ' points';
      if (a.ult && ultSeen[c + a.id] && !cfg.ultRepeat) return 'Ultimate already used';
      if (+cfg.perTurn && casts[c] >= +cfg.perTurn) return 'Ability limit reached this turn';
      if (a.kind === 'summon' && summoned[c] >= +cfg.summonCap) return 'Summon limit reached';
      return '';
    };
    const why = (c, a) => base(c, a) || (KINDS[a.kind].first(c, a).length ? '' : 'No valid target');
    function cast(m) {
      const c = game.turn;
      if (m.c && m.c !== c) return false;
      if (m.ab === 'stop') {                       // end an Overrun chain voluntarily (after at least one capture)
        if (!(ovr && ovr.locked && ovr.c === c && ovr.n > 0)) return false;
        log.push({ at: game.history().length, ab: 'stop', c }); ovr = null; raw.pass(); afterAction(); turnChanged(); return true;
      }
      if (m.ab === 'pick') return doPick(m.tx, m.ty, m.i, c);      // choosing a stack member (written by move() itself, replayed from the log)
      const a = find(c, m.ab);
      if (!a || why(c, a)) return false;
      const K = KINDS[a.kind], st = stepsOf(c, a);
      if (st === 2) {
        if (!K.first(c, a).some(q => q.x === m.fx && q.y === m.fy) || !K.second(c, a, sq(m.fx, m.fy)).some(q => q.x === m.tx && q.y === m.ty)) return false;
      } else if (st === 1) { if (!K.first(c, a).some(q => q.x === m.tx && q.y === m.ty)) return false; }
      else if (!K.first(c, a).length) return false;
      const failed = K.run(c, a, m.fx, m.fy, m.tx, m.ty, false) === false;      // (Corrupted Save can fail: then nothing is charged)
      if (a.kind === 'summon') summoned[c]++;
      if (!failed) { pts[c] -= a.cost; casts[c]++; if (a.ult) ultSeen[c + a.id] = 1; }
      const e = { at: game.history().length, ab: a.id, c };
      if (st >= 1) { e.tx = m.tx; e.ty = m.ty; }
      if (st === 2) { e.fx = m.fx; e.fy = m.fy; }
      log.push(e);
      triggerMines(); checkWires(); syncStacks();
      if (raw.foeCheck(c)) raw.pass();                // giving check ends your turn
      else if (a.replace) raw.spend();                // a replacing ability uses up one move (the whole turn unless you have 2 moves per turn)
      if (game.turn !== c) chg = null;
      afterAction();
      turnChanged();
      return true;
    }
    g.move = m => {
      if (m && m.ab) return cast(m);
      let picked = false;
      if (m && m.ck > 0 && !m.drop) { if (!doPick(m.fx, m.fy, m.ck, game.turn)) return false; picked = true; }      // m.ck = which member of a stack moves (0/absent = the top piece)
      const ok = moveCore(m);
      if (!ok && picked) { swapIn(m.fx, m.fy, m.ck); log.pop(); }
      return ok;
    };
    const moveCore = m => {
      const mover = game.turn;
      if (chg && chg.c === mover && (m.drop || m.fx !== chg.x || m.fy !== chg.y)) return false;     // a Charge must be finished with the chosen piece
      const jp = !m.drop && at(m.fx, m.fy), jt = jp && at(m.tx, m.ty);      // overlap move: onto an own piece standing on one of the player's clipped squares
      const isJoin = !!(jp && jt && jt !== jp && stackOk(jp) && stackOk(jt) && jp.c === jt.c && clips.some(z => z.x === m.tx && z.y === m.ty && z.c === jp.c));
      if (isJoin && !joinMoves(m.fx, m.fy, 0).some(q => q.tx === m.tx && q.ty === m.ty)) return false;
      const chain = ovr && ovr.locked && ovr.c === mover;
      if (chain && (m.drop || isJoin || m.fx !== ovr.x || m.fy !== ovr.y || !isCap(m))) return false;      // an Overrun chain only continues with captures by the chosen piece
      const resume = ovr && ovr.resume && ovr.responder === mover;
      const vic = isJoin ? null : victimOf(m), vsq = isEp(m) ? [m.tx, m.fy] : [m.tx, m.ty], castled = isCastle(m), stage = chg && chg.c === mover ? chg.stage : 0;
      const lifted = isJoin ? jt : null;
      const jk = kk(m.tx, m.ty), prevStack = stacks[jk];
      if (lifted) { raw.remove(m.tx, m.ty); stacks[jk] = { c: lifted.c, pass: [lifted].concat(prevStack ? prevStack.pass : []) }; }      // (the engine moves onto what looks like an empty square; the piece that was there joins the stack)
      if (!game.move(m)) { if (lifted) { raw.put(m.tx, m.ty, lifted); if (prevStack) stacks[jk] = prevStack; else delete stacks[jk]; } return false; }
      recent[mover] = null; noteCapture(vic, vsq[0], vsq[1]);
      triggerMines(); checkWires(true); syncStacks();
      if (chain) {
        ovr.n++;
        if (!raw.ok(mover) || game.turn === mover) ovr = null;
        else if (raw.foeCheck(mover)) {            // a capture that gives check ends the chain: the checked player answers, then control returns to the Overrun player
          const order = ids.slice(ids.indexOf(mover) + 1).concat(ids.slice(0, ids.indexOf(mover)));
          const r = order.find(s0 => alive(s0) && raw.check(s0) && s0 !== mover);
          ovr = r ? { resume: true, c: mover, responder: r } : null;
          if (r) raw.setTurn(r);
        } else {
          raw.setTurn(mover);
          if (game.moves(m.tx, m.ty).some(isCap)) { ovr.x = m.tx; ovr.y = m.ty; } else { ovr = null; raw.pass(); }
        }
      } else if (resume) {
        const c0 = ovr.c; ovr = null;
        if (alive(c0) && raw.ok(c0) && game.turn !== c0) raw.setTurn(c0);      // control returns to the Overrun player (a normal new turn, even in 4-player)
      }
      if (stage) {
        chg = null;
        if (stage === 1 && !castled && !raw.foeCheck(mover) && raw.ok(mover) && game.turn !== mover) {   // first Charge move done: same player moves the same piece again
          raw.setTurn(mover);
          if (game.moves(m.tx, m.ty).length) chg = { c: mover, x: m.tx, y: m.ty, stage: 2 }; else raw.pass();
        }
      }
      afterAction();
      turnChanged();
      return true;
    };
    g.moves = (x, y, ...r) => {
      if (chg && chg.c === game.turn && (x !== chg.x || y !== chg.y)) return [];
      if (ovr && ovr.locked && ovr.c === game.turn) return x === ovr.x && y === ovr.y ? game.moves(x, y, ...r).filter(isCap) : [];
      const ms = game.moves(x, y, ...r);
      return clips.length ? ms.concat(joinMoves(x, y, 0)) : ms;
    };
    g.memberMoves = (x, y, i) => {                 // moves of member i of a stack (0 = the piece on top)
      if (!i) return g.moves(x, y);
      if ((chg && chg.c === game.turn) || (ovr && ovr.locked && ovr.c === game.turn)) return [];
      return withMember(x, y, i, () => game.moves(x, y)).concat(joinMoves(x, y, i));
    };
    g.stackAt = (x, y) => { const st = stacks[kk(x, y)], p = at(x, y); return st && st.pass.length && p && p.c === st.c ? [p].concat(st.pass) : null; };      // [top piece, ...passengers] or null
    g.clips = () => clips.map(z => ({ x: z.x, y: z.y, c: z.c, ttl: z.ttl, n: (stacks[kk(z.x, z.y)] || { pass: [] }).pass.length }));
    if (game.drops) g.drops = (...r) => ((chg && chg.c === game.turn) || (ovr && ovr.locked && ovr.c === game.turn) ? [] : game.drops(...r));
    g.overrunOf = c => (ovr && ovr.locked && ovr.c === c ? { x: ovr.x, y: ovr.y, n: ovr.n } : null);
    g.mirages = () => mirageLog.slice();
    g.markers = () => markers.map(m => ({ x: m.x, y: m.y, c: m.c, t: m.t, n: (m.stk || []).length, ttl: m.ttl }));      // Restore Point markers (visible to everyone)
    g.glitches = () => glitchLog.slice();
    g.mines = c => mines.filter(m => c == null || m.c === c || raw.ally(c, { c: m.c })).map(m => ({ x: m.x, y: m.y, c: m.c, ttl: m.ttl }));   // c = viewer (their team's mines); null = all
    g.chargeOf = c => (chg && chg.c === c ? { x: chg.x, y: chg.y, stage: chg.stage } : null);
    if (game.resign) g.resign = c => { game.resign(c); turnChanged(); };
    g.cls = cls; g.cfg = cfg;
    g.abLog = () => log.slice();
    g.pts = c => pts[c];
    g.abilities = c => { const k = CLASSES[cls[c]]; return k ? k.abilities.map(a => ({ id: a.id, name: a.name, cost: a.cost, ult: !!a.ult, replace: !!a.replace, steps: stepsOf(c, a), desc: a.desc, why: why(c, a) })) : []; };
    g.abSteps = (c, id) => { const a = find(c, id); return a ? stepsOf(c, a) : 0; };
    g.abTargets = (c, id, from) => {               // squares to click: the first click, or (with `from`) the second click of a two-click ability
      const a = find(c, id); if (!a || base(c, a)) return [];
      const K = KINDS[a.kind];
      const st = stepsOf(c, a);
      return st === 0 ? [] : from ? (st === 2 ? K.second(c, a, from) : []) : K.first(c, a);
    };
    return g;
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
  // Austang 4-player (armies are filled in by the match layer through `armies`): 'austang' = 20x20 cross free-for-all, wide = 20 x 14 (use with teams {r:0,y:0,b:1,g:1})
  const AUSTANG4 = Object.assign({}, FOUR, { castling: false, austang: true, board: 'austang', promoteTo: AUSTANG_GRAND.promoteTo });
  const AUSTANG4_WIDE = Object.assign({}, FOUR, { castling: false, austang: true, board: 'wide', width: 20, height: 14, promoteTo: AUSTANG_GRAND.promoteTo });

  return { create, STANDARD, AUSTANG_GRAND, AUSTANG4, AUSTANG4_WIDE, GRAND_PIECES, CRAZYHOUSE, MARSEILLAIS, INFINITE, ALICE, FOUR, THREE, BUGHOUSE, TRAITS, randomBack960, botChoose, CLASSES, CLASS_DEFAULTS, withClasses, classPass, ROOK, BISHOP, ALL, KNIGHT };
})();

if (typeof module !== 'undefined') module.exports = Engine;
