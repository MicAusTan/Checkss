/* Promotion Chess rules engine (separate from Engine/Imperial, same API shape as Imperial's 2-player engine).
   Standard 8x8 chess where EVERY piece type can promote. Done here: the 15 tier-1 piece forms and their conditions, optional promotion,
   the pawn path (stay a pawn on the last rank, Courier / Strafer / Brawler, tier-1 pawns -> piece forms, promote-then-move from the last rank),
   movement diagrams. Not here yet (see the design document): tier 2 and the special mechanics.

   Piece object: { t: code, c: 'w'|'b', m: moved?, o: base type ('p','n','b','r','q','k'), tier: 0|1|2, fin: true for a pawn that became a plain Q/R/B/N,
                   cnt: { cap, sl, chk, st } counters since the piece (last) promoted }.
   Moves: { fx, fy, tx, ty, promo?, px?, py?, late?, castle?, swap?, ep? }.
     px, py = where a pawn form is PLACED after the pawn reached the last rank at (tx, ty) (arrival promotion).
     late = a pawn already standing on the last rank promotes and moves in one action (promote-then-move): tx, ty = where the promoted piece goes.  `promo` = code of the form chosen; a move that EARNS a promotion comes
   in several versions with the same squares: promo:null (stay as it is) and one per form, so the UI's chooser appears (it must not auto-play a single choice).
   History entries replay with move() (they carry fx, fy, tx, ty, promo, castle, swap, ep). */
const Promotion = (() => {
  const ROOK = [[1, 0], [-1, 0], [0, 1], [0, -1]], BISHOP = [[1, 1], [1, -1], [-1, 1], [-1, -1]], ALL = ROOK.concat(BISHOP),
        KNIGHT = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]],
        CAMEL = [[3, 1], [3, -1], [-3, 1], [-3, -1], [1, 3], [1, -3], [-1, 3], [-1, -3]],
        TWO8 = [[2, 0], [-2, 0], [0, 2], [0, -2], [2, 2], [2, -2], [-2, 2], [-2, -2]],
        TWO4 = [[2, 0], [-2, 0], [0, 2], [0, -2]], VAULT = [[2, 4], [4, 2], [-2, 4], [-4, 2], [2, -4], [4, -2], [-2, -4], [-4, -2]];
  const opp = c => (c === 'w' ? 'b' : 'w');

  /* Codes for the new forms. PLACEHOLDER letters (Cyrillic, so they can never collide with Latin/Greek codes used elsewhere; all names are placeholders too).
     Nothing outside this table should hard-code a character. Case conversion is never applied to these. */
  const FORMS = {
    //            code  name           base   moves
    abbot:       { t: '\u0431', name: 'Abbot',       o: 'b' , desc: 'Bishop moves, plus 1 step straight (move only).' },
    inquisitor:  { t: '\u0433', name: 'Inquisitor',  o: 'b' , desc: 'Bishop moves, plus 1 step straight that can only capture.' },
    zealot:      { t: '\u0434', name: 'Zealot',      o: 'b' , desc: 'Slides like a Bishop but through its own pieces (never through enemies).' },
    paladin:     { t: '\u0436', name: 'Paladin',     o: 'n' , desc: 'Knight jump, plus 1 step straight (move or capture).' },
    outrider:    { t: '\u0437', name: 'Outrider',    o: 'n' , desc: 'Knight jump, plus 1 diagonal step that can only capture.' },
    hussar:      { t: '\u0438', name: 'Hussar',      o: 'n' , desc: 'Knight jump, plus the (3,1) leap (move only).' },
    bulwark:     { t: '\u043b', name: 'Bulwark',     o: 'r' , desc: 'Rook moves, plus 1 diagonal step (move only).' },
    warden:      { t: '\u043f', name: 'Warden',      o: 'r' , desc: 'Rook moves, plus 1 diagonal step that can only capture.' },
    ferry:       { t: '\u0444', name: 'Ferry',       o: 'r' , desc: 'Rook moves; may also pass over one friendly piece (the squares beyond it are move only).' },
    regent:      { t: '\u0446', name: 'Regent',      o: 'q' , desc: 'Queen moves, plus Knight leaps (move only).' },
    archon:      { t: '\u0447', name: 'Archon',      o: 'q' , desc: 'Queen moves, plus Knight leaps that can only capture.' },
    vizier:      { t: '\u0448', name: 'Vizier',      o: 'q' , desc: 'Queen moves, plus a 2-square leap in any of the 8 directions, over anything (move or capture).' },
    sovereign:   { t: '\u044d', name: 'Sovereign',   o: 'k' , desc: 'King step, plus Knight leaps (move only). Royal.' },
    warlord:     { t: '\u044e', name: 'Warlord',     o: 'k' , desc: 'King step, plus Knight leaps that can only capture. Royal.' },
    courier:     { t: '\u044b', name: 'Courier',     o: 'p', desc: 'A pawn that moves 1 or 2 squares forward every time (not only from its start square); captures diagonally. Placed on one of the first 3 ranks of its file.' },
    strafer:     { t: '\u044a', name: 'Strafer',     o: 'p', desc: 'Moves 1 forward and captures diagonally; may also step 1 or 2 squares sideways (move only, not through pieces). Placed on any empty square of its starting rank.' },
    brawler:     { t: '\u0449', name: 'Brawler',     o: 'p', desc: 'Moves 1 forward. Captures straight ahead, diagonally forward and 1 square sideways (capture only). Placed on its own starting square, capturing whatever is there (even your own piece; never a King).' },
    primate:     { t: '\u043a', name: 'Primate',     o: 'b', tier: 2, desc: 'Bishop moves, plus 1 step straight (move or capture) and a 2-square straight leap over anything (move only).' },
    crusader:    { t: '\u043c', name: 'Crusader',    o: 'n', tier: 2, desc: 'Knight jump, plus a straight slide of up to 2 squares (move or capture, blocked by pieces).' },
    vaulter:     { t: '\u043d', name: 'Vaulter',     o: 'n', tier: 2, desc: 'Knight jump, or two Knight leaps in the same direction as ONE move (to the (2,4) and (4,2) squares); the second leap can only land on an empty square.' },
    citadel:     { t: '\u0442', name: 'Citadel',     o: 'r', tier: 2, desc: 'Rook moves, plus a diagonal slide of up to 2 squares (move or capture, blocked by pieces).' },
    ruler:       { t: '\u0443', name: 'Ruler',       o: 'r', tier: 2, desc: 'Rook moves. At 3 and at 6 squares along each line (with the line clear up to that point) it can also move or capture on the two squares beside that point.' },
    paragon:     { t: '\u0445', name: 'Paragon',     o: 'q', tier: 2, desc: 'Queen moves, Knight leaps (move or capture), and a hop over exactly one piece along any Queen line, landing directly behind it.' },
    switch:      { t: '\u0439', name: 'Switch',      o: 'q', tier: 2, desc: 'Queen moves, plus swapping places with the first friendly piece along any Queen line (move only).' },
    monarch:     { t: '\u044c', name: 'Monarch',     o: 'k', tier: 2, desc: 'King step, Knight leaps (move or capture) and 8 two-square jumps (move only). Royal.' },
    tyrant:      { t: '\u0451', name: 'Tyrant',      o: 'k', tier: 2, desc: 'King step, and it can capture an adjacent enemy piece without moving (never a King). Royal.' },
    pinwheel:    { t: '\u0432', name: 'Pinwheel',    o: 'n', tier: 2, desc: 'Knight jump (move or capture). If it lands next to an enemy piece it may then take one more step like a King, onto an empty square.' },
    valkyrie:    { t: '\u0441', name: 'Valkyrie',    o: 'q', tier: 2, desc: 'Queen moves. After a capture she may step 1 square like a King (move only) in the same turn. She cannot capture twice.' },
    tower:       { t: '\u0440', name: 'Tower',       o: 'r', tier: 2, desc: 'Cannot move along its own file or rank. Instead it moves along the lanes right beside them (up to 4 squares), as long as its own line is clear up to that point. The lane squares beside a blocking piece are covered too (move or capture). It may also capture the first enemy piece on its own file or rank (up to 4 squares away), but never move along them.' },
    tarzan:      { t: '\u043e', name: 'Tarzan',      o: 'k', tier: 2, desc: 'King step, plus a jump to any empty square within 4 (never capturing). It can be checked but is very hard to checkmate. You lose if all your other pieces are gone. Royal.' },
    vanguard:    { t: '\u0430', name: 'Vanguard',    o: 'p', tier: 2, desc: 'A pawn that moves or captures up to 3 squares ahead, and on the squares beside each of those (a side square is reachable only if the straight squares before it are clear). It wraps: past the last rank it carries on from rank 1, and its attacks wrap too. Never promotes.' },
    phantom:     { t: '\u0452', name: 'Phantom',     o: 'b', tier: 2, desc: 'Bishop moves. It can also leave the board through an edge square (diagonally), where nothing can touch it, and must re-enter within 2 of your turns on an edge square diagonally next to where it left; the re-entry may capture any piece there except a King. It never gives check.' },
    ricochet:    { t: '\u0454', name: 'Ricochet',    o: 'b', tier: 2, desc: 'Bishop moves, but its path can reflect ONCE off a wall (or off one of your own pieces) and keep going. It can stop on any square along the way; a capture ends the move.' },
    juggernaut:  { t: '\u0455', name: 'Juggernaut',  o: 'p', tier: 2, desc: 'A pawn that steps 1 forward, left or right and cannot capture. It can walk into an enemy piece standing in the 3 squares in front of it, pushing it one square (or squishing it if it has no room). Attacks on it from the front are blocked outright; from the sides or behind it survives the first capture attempt (the attacker bumps into it and loses its turn). Enemy pieces cannot land on the squares in front of and beside it. It wraps like the other tier-2 pawns.' },
    gemini:      { t: '\u0456', name: 'Gemini',      o: 'p', tier: 2, desc: 'A pawn with two moves per turn: each up to 2 squares forward (wrapping), capturing diagonally. It may move then capture, or capture then move, never capture twice. A first move that gives check ends the turn.' },
    titan:       { t: '\u0457', name: 'Titan',       o: 'p', tier: 3, desc: 'A Juggernaut that has grown: it steps up to 2 squares forward, left or right (path clear) and cannot capture. Walking into an enemy in the 3 squares ahead it pushes a whole CHAIN of up to 3 enemy pieces one square, and squishes the last one if it has no room. Nothing can capture it from the front or the sides; from behind the first attempt fails and the second kills it.' },
    mirror:      { t: '\u0458', name: 'Mirror',      o: 'p', tier: 3, desc: 'A Gemini that has grown: two actions per turn, and BOTH may capture. An action is a King step (move or capture), 2 squares straight forward (move only, every time), or a swap with any friendly non-royal piece within 3 squares. The squares ahead wrap past the last rank, like the tier-2 pawns. A first action that gives check ends the turn.' },
    chamberlain: { t: '\u044f', name: 'Chamberlain', o: 'k' , desc: 'King step, or swap places with an adjacent friendly piece. Royal.' }
  };
  const CODE = {}, NAME = {}, ORIGIN = {}, TIER3 = { p: [] }, TIER1 = { b: [], n: [], r: [], q: [], k: [], p: [] }, TIER2 = { b: [], n: [], r: [], q: [], k: [], p: [] };      // TIER2 = only the forms built so far (Phantom, Ricochet, Pinwheel, Tower, Valkyrie, Tarzan and the tier-2 pawns need special mechanics)
  Object.keys(FORMS).forEach(k => { const f = FORMS[k]; CODE[k] = f.t; NAME[f.t] = f.name; ORIGIN[f.t] = f.o; (f.tier === 3 ? TIER3 : f.tier === 2 ? TIER2 : TIER1)[f.o].push(f.t); });
  const FORMS_BY_CODE = {}; Object.keys(FORMS).forEach(k => { FORMS_BY_CODE[FORMS[k].t] = FORMS[k]; });
  const LINEAGE3 = { [CODE.juggernaut]: [CODE.titan], [CODE.gemini]: [CODE.mirror] };      // tier-2 pawn -> its tier-3 forms (the Vanguard has none yet)
  const isJug = q => !!q && (q.t === CODE.juggernaut || q.t === CODE.titan);
  const PAWN_MENU = [];      // what a tier-1 pawn may become on the last rank (filled below)
  const PAWN_PIECE_FORMS = [].concat(TIER1.b, TIER1.n, TIER1.r, TIER1.q);      // what a tier-1 pawn may become on the last rank (royal forms excluded: no second royal piece)
  PAWN_MENU.push(...PAWN_PIECE_FORMS, ...TIER2.p);
  const ABBR = {};      // shortest unique abbreviation (at least 2 letters) of each form's name, for move lists
  Object.keys(FORMS).forEach(k => { const f = FORMS[k]; let n = 2; while (n < f.name.length && Object.keys(FORMS).some(k2 => k2 !== k && FORMS[k2].name.startsWith(f.name.slice(0, n)))) n++; ABBR[f.t] = f.name.slice(0, n); });
  Object.assign(NAME, { p: 'Pawn', n: 'Knight', b: 'Bishop', r: 'Rook', q: 'Queen', k: 'King' });

  /* Movement atoms. slide: { s: dirs, thru: 'friend' (pass through own pieces, never land on them) | 'over1' (may pass ONE friendly piece; squares after it are move-only), mode }
                     leap:  { l: offsets, mode }      mode: 'b' move and capture (default), 'm' move only, 'c' capture only
                     swap:  adjacent friendly piece (move only) */
  const D = {
    r: [{ s: ROOK }], b: [{ s: BISHOP }], q: [{ s: ALL }], n: [{ l: KNIGHT }], k: [{ l: ALL }],
    [CODE.abbot]:       [{ s: BISHOP }, { l: ROOK, mode: 'm' }],
    [CODE.inquisitor]:  [{ s: BISHOP }, { l: ROOK, mode: 'c' }],
    [CODE.zealot]:      [{ s: BISHOP, thru: 'friend' }],
    [CODE.paladin]:     [{ l: KNIGHT }, { l: ROOK }],
    [CODE.outrider]:    [{ l: KNIGHT }, { l: BISHOP, mode: 'c' }],
    [CODE.hussar]:      [{ l: KNIGHT }, { l: CAMEL, mode: 'm' }],
    [CODE.bulwark]:     [{ s: ROOK }, { l: BISHOP, mode: 'm' }],
    [CODE.warden]:      [{ s: ROOK }, { l: BISHOP, mode: 'c' }],
    [CODE.ferry]:       [{ s: ROOK, thru: 'over1' }],
    [CODE.regent]:      [{ s: ALL }, { l: KNIGHT, mode: 'm' }],
    [CODE.archon]:      [{ s: ALL }, { l: KNIGHT, mode: 'c' }],
    [CODE.vizier]:      [{ s: ALL }, { l: TWO8 }],
    [CODE.sovereign]:   [{ l: ALL }, { l: KNIGHT, mode: 'm' }],
    [CODE.warlord]:     [{ l: ALL }, { l: KNIGHT, mode: 'c' }],
    [CODE.chamberlain]: [{ l: ALL }, { swap: true }],
    // ---- tier 2 (plain-rule forms)
    [CODE.primate]:     [{ s: BISHOP }, { l: ROOK }, { l: TWO4, mode: 'm' }],
    [CODE.crusader]:    [{ l: KNIGHT }, { s: ROOK, max: 2 }],
    [CODE.vaulter]:     [{ l: KNIGHT }, { l: VAULT, mode: 'm' }],
    [CODE.citadel]:     [{ s: ROOK }, { s: BISHOP, max: 2 }],
    [CODE.ruler]:       [{ s: ROOK }, { side: [3, 6] }],
    [CODE.paragon]:     [{ s: ALL }, { l: KNIGHT }, { hop: ALL }],
    [CODE.switch]:      [{ s: ALL }, { swapline: ALL }],
    [CODE.monarch]:     [{ l: ALL }, { l: KNIGHT }, { l: TWO8, mode: 'm' }],
    [CODE.tyrant]:      [{ l: ALL }, { shot: ALL }],
    // ---- tier 2 (special mechanics)
    [CODE.pinwheel]:    [{ l: KNIGHT }, { pin: true }],
    [CODE.valkyrie]:    [{ s: ALL }, { valk: true }],
    [CODE.tower]:       [{ tower: true }, { towerline: true }],
    [CODE.tarzan]:      [{ l: ALL }, { jump: true }],
    [CODE.ricochet]:    [{ bounce: true }],
    [CODE.phantom]:     [{ s: BISHOP }, { phantom: true }]
  };

  /* ---------- promotion conditions (all numbers are tunable) ---------- */
  const COND = { bishopCaps: 2, knightStreak: 2, rookSlide: 12, queenChecks: 3, kingMoves: 2, kingWindow: 12 };
  /* tier 2: counted from the moment the piece promoted to a tier-1 form. All placeholders. */
  const COND2 = { promoCaps: { q: 1, r: 2, b: 2, n: 2 }, towerLineCapture: true, towerBeyondBlock: true, ricochetBouncesFriends: true, phantomTurns: 2, towerCap: 4, tarzanRange: 4,
    bishopCaps: 1, bishopBackRank: true,                         // Bishop forms: 1 more capture, OR a move ending on the opponent's back rank
    knightCaps: 1, knightChecks: 1,                              // Knight forms: 1 capture ending in the enemy half, OR giving check
    rookCaps: 1, rookSlide: 12,                                  // Rook forms: 1 more capture, OR 12 more squares slid
    queenChecks: 3, queenRookCaps: 1,                            // Queen forms: 3 checks by moves ending in the enemy half, OR capturing a Rook
    pawnT3: { jugPush: 1, gemDouble: 3, gemCaps: 1, survive: 6 },    // tier-2 pawn -> tier 3: Juggernaut pushes/squishes 1 piece; Gemini 3 double-move turns OR 1 capture; both OR survive this many of your turns
    kingCaps: 1, kingEnemyHalfMoves: 3, kingAllyCaps: 1, kingAllyRadius: 2 };   // King forms: a capture by the King, OR 3 non-forced King moves ending in the enemy half, OR a friendly capture within the King's (2 = 5x5, 1 = 3x3) zone
  const ZERO = { ps: 0, dt: 0, sv: 0, cap: 0, sl: 0, chk: 0, st: 0, cw: 0, cr: 0, ch2: 0, km: 0, kh: 0, ac: 0 };      // since the piece last promoted: captures, squares slid, checks, knight streak, captures ending in the enemy half, Rooks captured, checks ending in the enemy half, King moves, King moves ending in the enemy half, friendly captures near the King
  
  const startRows = ['rnbqkbnr', 'pppppppp', '........', '........', '........', '........', 'PPPPPPPP', 'RNBQKBNR'];
  const mk = (ch, x, y) => { const c = ch === ch.toUpperCase() ? 'w' : 'b', t = ch.toLowerCase(); return { t, c, m: false, o: t, tier: 0, cnt: ZERO, hx: x, hy: y }; };      // hx, hy = home square (a pawn form is placed there)

  function create(opts) {
    opts = opts || {};
    const W = opts.w || 8, H = opts.h || 8, inOppHalf = (c, y) => (c === 'w' ? y >= H / 2 : y < H / 2), lastRank = c => (c === 'w' ? H - 1 : 0);
    const idx = (x, y) => y * W + x, inB = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
    const b0 = new Array(W * H).fill(null);
    (opts.setup || startRows).forEach((row, i) => [...row].forEach((ch, x) => { if (ch !== '.') b0[idx(x, H - 1 - i)] = mk(ch, x, H - 1 - i); }));
    // per-player counters: n = own moves made, k = king moves that count towards the king's promotion (first kingWindow moves, not castling, not forced)
    (opts.put || []).forEach(q => { b0[idx(q.x, q.y)] = { t: q.t, c: q.c, m: q.m !== false, o: ORIGIN[q.t] || q.t, tier: ORIGIN[q.t] ? (FORMS_BY_CODE[q.t].tier || 1) : 0, cnt: Object.assign({}, ZERO, q.cnt), hx: q.hx != null ? q.hx : q.x, hy: q.hy != null ? q.hy : q.y, sh: q.t === CODE.juggernaut || q.t === CODE.titan ? q.sh !== false : undefined }; });      // test hook: place any piece (base letter or form code)
    let S = { b: b0, hj: b0.some(q => isJug(q)), turn: opts.first || 'w', ep: null, own: { w: { n: 0, k: 0 }, b: { n: 0, k: 0 } }, off: { w: [], b: [] } };      // off = pieces outside the board (Phantoms): { p, ox, oy, left }
    const hist = [], stCache = new WeakMap(), zoneCache = new WeakMap(), voidCache = new WeakMap();
    const wrapY = yy => ((yy % H) + H) % H;
    const royal = p => p.o === 'k';

    /* pseudo-legal moves of the piece on (x, y). atk = squares it attacks (for check): capture-capable squares, whoever stands there. */
    function pseudo(S, x, y, atk) {
      const p = S.b[idx(x, y)], out = [];
      if (!p) return out;
      const add = (tx, ty, e) => out.push(Object.assign({ fx: x, fy: y, tx, ty }, e));
      if (p.o === 'p') {                                   // the plain pawn and the three tier-1 pawn forms
        const d = p.c === 'w' ? 1 : -1, start = p.c === 'w' ? 1 : H - 2, f = p.t, at = (tx, ty) => (inB(tx, ty) ? S.b[idx(tx, ty)] : null);
        const free = (tx, ty) => inB(tx, ty) && !S.b[idx(tx, ty)];
        if (f === CODE.juggernaut || f === CODE.titan) {                    // steps 1 forward / left / right (Titan: up to 2); never captures: it pushes, or squishes when the piece has nowhere to go (Titan: a chain of up to 3)
          if (atk) return out;
          const fd = p.c === 'w' ? 1 : -1;
          for (const [dx, dy, front] of [[0, fd, true], [-1, 0, false], [1, 0, false], [-1, fd, true], [1, fd, true]]) {      // empty squares: forward / left / right. It only walks INTO a piece when it is in one of the 3 squares in front
            const tx = x + dx, ty = wrapY(y + dy);
            if (!inB(tx, ty)) continue;
            const t = S.b[idx(tx, ty)];
            if (!t) {
              if (dx === 0 || dy === 0) { add(tx, ty); if (f === CODE.titan) { const sx = x + 2 * dx, sy = wrapY(y + 2 * dy); if (inB(sx, sy) && !S.b[idx(sx, sy)]) add(sx, sy); } }
              continue;
            }
            if (!front || t.c === p.c || t.o === 'k' || isJug(t)) continue;
            let n = 1;                                                       // Titan: how many enemy pieces in a row get pushed together (max 3)
            if (f === CODE.titan) while (n < 3) { const nx = tx + n * dx, ny = wrapY(ty + n * dy), u = inB(nx, ny) ? S.b[idx(nx, ny)] : null; if (u && u.c !== p.c && u.o !== 'k' && !isJug(u)) n++; else break; }
            const qx = tx + n * dx, qy = wrapY(ty + n * dy), room = inB(qx, qy) && !S.b[idx(qx, qy)];
            const ch = n > 1 ? { chain: n, cd: [dx, dy] } : {};
            if (room) add(tx, ty, Object.assign({ push: [qx, qy] }, ch)); else add(tx, ty, Object.assign({ squish: true }, ch));
          }
          return out;
        }
        if (f === CODE.mirror) {                        // two actions per turn (both may capture): King step / 2 forward (move only) / swap with a friendly non-royal piece within 3; an action that gives check ends the turn
          const dir = p.c === 'w' ? 1 : -1;
          const wy = (yy, dy) => (dy === dir ? wrapY(yy) : yy);      // the squares ahead wrap past the last rank, like the tier-2 pawns
          if (atk) { for (const [dx, dy] of ALL) { const ay = wy(y + dy, dy); if (inB(x + dx, ay)) add(x + dx, ay); } return out; }
          const legs = (B, fx, fy) => {
            const r = [];
            for (const [dx, dy] of ALL) { const tx = fx + dx, ty = wy(fy + dy, dy); if (!inB(tx, ty)) continue; const t = B[idx(tx, ty)]; if (!t || t.c !== p.c) r.push([tx, ty, false]); }
            { const e1 = wrapY(fy + dir), e2 = wrapY(fy + 2 * dir); if (!B[idx(fx, e1)] && !B[idx(fx, e2)]) r.push([fx, e2, false]); }
            for (let dx = -3; dx <= 3; dx++) for (let dy = -3; dy <= 3; dy++) { if (!dx && !dy) continue; const tx = fx + dx, ty = fy + dy; if (!inB(tx, ty)) continue; const t = B[idx(tx, ty)]; if (t && t.c === p.c && !royal(t)) r.push([tx, ty, true]); }
            return r;
          };
          const after = (B, fx, fy, tx, ty, sw) => { const B1 = B.slice(), q = B[idx(tx, ty)]; B1[idx(fx, fy)] = sw ? Object.assign({}, q, { m: true }) : null; B1[idx(tx, ty)] = p; return B1; };
          for (const [ax, ay, sw1] of legs(S.b, x, y)) {
            add(ax, ay, sw1 ? { swap: true } : {});
            const c1 = !sw1 && S.b[idx(ax, ay)];
            if (c1 && royal(c1)) continue;
            const B1 = after(S.b, x, y, ax, ay, sw1);
            if (inCheck({ b: B1, hj: S.hj, turn: opp(p.c), ep: null, own: S.own, off: S.off }, opp(p.c))) continue;      // the first action gives check: the turn ends
            for (const [bx, by] of legs(B1, ax, ay)) { if (bx === x && by === y) continue; add(bx, by, { gem: true, vx: ax, vy: ay }); }
          }
          return out;
        }
        if (f === CODE.gemini) {                        // two legs per turn (each: 1 or 2 forward, or a diagonal capture; wraps); never two captures; a leg that gives check ends the turn
          const dir = p.c === 'w' ? 1 : -1;
          const legs = (B, fx, fy, canCap) => {
            const r = [];
            const e1 = wrapY(fy + dir), e2 = wrapY(fy + 2 * dir);
            if (!B[idx(fx, e1)]) { r.push([fx, e1, false]); if (!B[idx(fx, e2)]) r.push([fx, e2, false]); }
            if (canCap) for (const dx of [-1, 1]) { const tx = fx + dx; if (inB(tx, e1)) { const t = B[idx(tx, e1)]; if (t && t.c !== p.c) r.push([tx, e1, true]); } }
            return r;
          };
          if (atk) { for (const dx of [-1, 1]) if (inB(x + dx, wrapY(y + dir))) add(x + dx, wrapY(y + dir)); return out; }
          const singles = new Set();
          for (const [ax, ay, cap1] of legs(S.b, x, y, true)) { add(ax, ay); if (!cap1) singles.add(ax + ',' + ay); }
          for (const [ax, ay, cap1] of legs(S.b, x, y, true)) {
            const B1 = S.b.slice(); B1[idx(x, y)] = null; B1[idx(ax, ay)] = p;
            if (cap1 && B1[idx(ax, ay)] && S.b[idx(ax, ay)] && S.b[idx(ax, ay)].o === 'k') continue;
            if (inCheck({ b: B1, hj: S.hj, turn: opp(p.c), ep: null, own: S.own, off: S.off }, opp(p.c))) continue;      // the first leg gives check: the turn ends
            for (const [bx, by, cap2] of legs(B1, ax, ay, !cap1)) {
              if (!cap1 && !cap2 && singles.has(bx + ',' + by)) continue;       // same result as one longer leg
              if (bx === x && by === y) continue;
              add(bx, by, { gem: true, vx: ax, vy: ay });
              if (!cap1 && !cap2) singles.add(bx + ',' + by);
            }
          }
          return out;
        }
        if (f === CODE.vanguard) {                       // up to 3 ahead and beside each; wraps past the last rank; a side square needs the straight squares before it clear
          for (let d = 1; d <= 3; d++) {
            const ty = (((y + d * (p.c === 'w' ? 1 : -1)) % H) + H) % H;
            for (const sx of [0, -1, 1]) {
              if (!inB(x + sx, ty)) continue;
              const t = S.b[idx(x + sx, ty)];
              if (atk || !t || t.c !== p.c) add(x + sx, ty);
            }
            if (S.b[idx(x, ty)]) break;
          }
          return out;
        }
        const take = (tx, ty) => { if (!inB(tx, ty)) return; const t = S.b[idx(tx, ty)]; if (atk) add(tx, ty); else if (t && t.c !== p.c) add(tx, ty); };      // a capture square (or, for attacks, any square)
        if (!atk) {
          if (f === 'p') { if (free(x, y + d)) { add(x, y + d); if (y === start && free(x, y + 2 * d)) add(x, y + 2 * d, { dbl: true }); } }      // only the plain pawn can be captured en passant
          else if (f === CODE.courier) { if (free(x, y + d)) { add(x, y + d); if (free(x, y + 2 * d)) add(x, y + 2 * d); } }
          else if (f === CODE.strafer) {
            if (free(x, y + d)) add(x, y + d);
            for (const dx of [-1, 1]) for (let n = 1; n <= 2 && free(x + dx * n, y); n++) add(x + dx * n, y);
          } else if (f === CODE.brawler) { if (free(x, y + d)) add(x, y + d); }
        }
        if (f === CODE.brawler) { take(x, y + d); take(x - 1, y); take(x + 1, y); }
        for (const dx of [-1, 1]) {
          take(x + dx, y + d);
          if (!atk && f === 'p' && !at(x + dx, y + d) && S.ep && S.ep.c !== p.c && S.ep.x === x + dx && S.ep.y === y + d) add(x + dx, y + d, { ep: true });
        }
        return out;
      }
      for (const a of D[p.t] || []) {
        const mode = a.mode || 'b';
        if (a.l) {
          for (const [dx, dy] of a.l) {
            const tx = x + dx, ty = y + dy;
            if (!inB(tx, ty)) continue;
            const t = S.b[idx(tx, ty)];
            if (atk) { if (mode !== 'm') add(tx, ty); }
            else if (!t) { if (mode !== 'c') add(tx, ty); }
            else if (t.c !== p.c && mode !== 'm') add(tx, ty);
          }
        } else if (a.s) {
          for (const [dx, dy] of a.s) {
            let tx = x + dx, ty = y + dy, over = 0, n = 0;
            while (inB(tx, ty) && n++ < (a.max || 99)) {
              const t = S.b[idx(tx, ty)], quiet = over > 0;           // after a Ferry's hop the squares are move-only
              if (!t) { if (!quiet || !atk) add(tx, ty, { dir: [dx, dy] }); }
              else if (t.c !== p.c) { if (!quiet) add(tx, ty, { dir: [dx, dy] }); break; }
              else {                                                   // a friendly piece
                if (a.thru === 'friend') { tx += dx; ty += dy; continue; }                   // Zealot: slides through its own pieces
                if (a.thru === 'over1' && over === 0) { over = 1; tx += dx; ty += dy; continue; }      // Ferry: may pass ONE friendly piece
                if (atk && !quiet) add(tx, ty, { dir: [dx, dy] });      // (a defended square)
                break;
              }
              tx += dx; ty += dy;
            }
          }
        } else if (a.bounce) {                                            // Ricochet: ONE slide whose path reflects ONCE off a wall (or a friendly piece); a capture ends it
          const seen = new Set(), blockedAt = (qx, qy) => !inB(qx, qy) || (COND2.ricochetBouncesFriends && !(qx === x && qy === y) && S.b[idx(qx, qy)] && S.b[idx(qx, qy)].c === p.c);
          for (const [dx0, dy0] of BISHOP) {
            let cx = x, cy = y, dx = dx0, dy = dy0, bounced = false;
            for (let steps = 0; steps < 64; steps++) {
              let nx = cx + dx, ny = cy + dy;
              if (blockedAt(nx, ny)) {                                    // reflect (ONCE): the blocked side(s) flip the direction
                if (bounced) break;
                bounced = true;
                const bx = blockedAt(cx + dx, cy), by = blockedAt(cx, cy + dy);
                if (bx && !by) dx = -dx; else if (by && !bx) dy = -dy; else { dx = -dx; dy = -dy; }
                nx = cx + dx; ny = cy + dy;
                if (blockedAt(nx, ny)) break;
              }
              const t = (nx === x && ny === y) ? null : S.b[idx(nx, ny)], key = nx + ',' + ny;
              if (t && t.c === p.c) { if (atk && !seen.has(key)) { seen.add(key); add(nx, ny); } break; }
              if (!(nx === x && ny === y) && !seen.has(key)) { seen.add(key); add(nx, ny); }
              if (t) break;                                               // an enemy piece: captured, the move ends
              cx = nx; cy = ny;
            }
          }
        } else if (a.phantom && !atk) {                                   // Phantom: leave the board through an edge square, if a re-entry will exist
          for (const [dx, dy] of BISHOP) {
            let cx = x, cy = y, ok = true;
            while (inB(cx + dx, cy + dy)) { cx += dx; cy += dy; if (S.b[idx(cx, cy)]) { ok = false; break; } }
            if (!ok) continue;
            const ox = cx + dx, oy = cy + dy;
            let any = false;
            for (const [ax, ay] of BISHOP) { const rx = ox + ax, ry = oy + ay; if (inB(rx, ry)) { const q = S.b[idx(rx, ry)]; if ((!q || q.c !== p.c || (rx === x && ry === y)) && !(q && q.o === 'k')) any = true; } }
            if (any) add(cx, cy, { exit: true, ox, oy });
          }
        } else if (a.pin && !atk) {                                       // Pinwheel: knight jump; landing next to an enemy allows one more king step
          for (const [dx, dy] of KNIGHT) {
            const ix = x + dx, iy = y + dy;
            if (!inB(ix, iy)) continue;
            const t = S.b[idx(ix, iy)];
            if (t && t.c === p.c) continue;
            const near = [];
            for (const [ax, ay] of ALL) { const qx = ix + ax, qy = iy + ay; if (inB(qx, qy)) { const q = S.b[idx(qx, qy)]; if (q && q.c !== p.c && !(qx === ix && qy === iy)) near.push(q); } }
            if (!near.length) continue;
            for (const [ax, ay] of ALL) {
              const fx = ix + ax, fy = iy + ay;
              if (!inB(fx, fy) || (S.b[idx(fx, fy)] && !(fx === x && fy === y))) continue;
              add(fx, fy, { vx: ix, vy: iy });
            }
          }
        } else if (a.valk && !atk) {                                      // Valkyrie: after a capture she may step 1 square like a King (move only)
          for (const [dx, dy] of ALL) {
            let cx = x + dx, cy = y + dy;
            while (inB(cx, cy) && !S.b[idx(cx, cy)]) { cx += dx; cy += dy; }
            if (!inB(cx, cy) || S.b[idx(cx, cy)].c === p.c) continue;
            for (const [ax, ay] of ALL) {
              const fx = cx + ax, fy = cy + ay;
              if (!inB(fx, fy) || (S.b[idx(fx, fy)] && !(fx === x && fy === y))) continue;
              add(fx, fy, { vx: cx, vy: cy });
            }
          }
        } else if (a.tower) {                                             // Tower: the lanes beside its lines, while its own line is clear up to that point
          for (const [dx, dy] of ROOK) {
            for (let d = 1; d <= COND2.towerCap; d++) {
              const lx = x + dx * d, ly = y + dy * d;
              if (!inB(lx, ly)) break;
              const blocked = !!S.b[idx(lx, ly)];
              if (blocked && !COND2.towerBeyondBlock) break;                  // (option: the lane squares beside the BLOCKING square are still covered)
              for (const [sx, sy] of [[dy, dx], [-dy, -dx]]) {
                const tx = lx + sx, ty = ly + sy;
                if (!inB(tx, ty)) continue;
                const t = S.b[idx(tx, ty)];
                if (atk || !t || t.c !== p.c) add(tx, ty);
              }
              if (blocked) break;
            }
          }
        } else if (a.towerline && COND2.towerLineCapture) {                // option: it may capture the FIRST piece on its own line (no quiet moves along the line)
          for (const [dx, dy] of ROOK) for (let d = 1; d <= COND2.towerCap; d++) {
            const lx = x + dx * d, ly = y + dy * d;
            if (!inB(lx, ly)) break;
            const t = S.b[idx(lx, ly)];
            if (t) { if (t.c !== p.c) add(lx, ly); break; }
          }
        } else if (a.jump && !atk) {                                      // Tarzan: jump to any empty square within range (never captures)
          for (let tx = x - COND2.tarzanRange; tx <= x + COND2.tarzanRange; tx++) for (let ty = y - COND2.tarzanRange; ty <= y + COND2.tarzanRange; ty++)
            if (inB(tx, ty) && !S.b[idx(tx, ty)] && (tx !== x || ty !== y)) add(tx, ty);
        } else if (a.side) {                                              // Ruler: beside the point 3 / 6 squares along a line (line clear up to the point)
          for (const [dx, dy] of ROOK) for (const d of a.side) {
            let clear = true;
            for (let k = 1; k <= d && clear; k++) clear = inB(x + dx * k, y + dy * k) && !S.b[idx(x + dx * k, y + dy * k)];
            if (!clear) continue;
            for (const [sx, sy] of [[dy, dx], [-dy, -dx]]) {
              const tx = x + dx * d + sx, ty = y + dy * d + sy;
              if (!inB(tx, ty)) continue;
              const t = S.b[idx(tx, ty)];
              if (atk || !t || t.c !== p.c) add(tx, ty);
            }
          }
        } else if (a.hop) {                                               // Paragon: over exactly one piece, landing right behind it
          for (const [dx, dy] of a.hop) {
            let tx = x + dx, ty = y + dy;
            while (inB(tx, ty) && !S.b[idx(tx, ty)]) { tx += dx; ty += dy; }
            if (!inB(tx, ty)) continue;
            const lx = tx + dx, ly = ty + dy;
            if (!inB(lx, ly)) continue;
            const t = S.b[idx(lx, ly)];
            if (atk || !t || t.c !== p.c) add(lx, ly);
          }
        } else if (a.swapline && !atk) {                                  // Switch: swap with the first piece along a line if it is friendly
          for (const [dx, dy] of a.swapline) {
            let tx = x + dx, ty = y + dy;
            while (inB(tx, ty) && !S.b[idx(tx, ty)]) { tx += dx; ty += dy; }
            if (inB(tx, ty) && S.b[idx(tx, ty)].c === p.c) add(tx, ty, { swap: true });
          }
        } else if (a.shot && !atk) {                                      // Tyrant: capture an adjacent enemy without moving
          for (const [dx, dy] of a.shot) {
            const t = inB(x + dx, y + dy) && S.b[idx(x + dx, y + dy)];
            if (t && t.c !== p.c) add(x + dx, y + dy, { shot: true });
          }
        } else if (a.swap && !atk) {
          for (const [dx, dy] of ALL) {
            const tx = x + dx, ty = y + dy;
            if (inB(tx, ty) && S.b[idx(tx, ty)] && S.b[idx(tx, ty)].c === p.c) add(tx, ty, { swap: true });
          }
        }
      }
      if (p.t === 'k' && !p.m && !atk && !attacked(S, x, y, opp(p.c))) {      // castling (the plain King only)
        for (const d of [1, -1]) {
          let rx = x + d;
          while (inB(rx, y) && !S.b[idx(rx, y)]) rx += d;
          const r = inB(rx, y) && S.b[idx(rx, y)];
          if (!r || r.t !== 'r' || r.c !== p.c || r.m || Math.abs(rx - x) < 3) continue;
          if (!attacked(S, x + d, y, opp(p.c)) && !attacked(S, x + 2 * d, y, opp(p.c))) add(x + 2 * d, y, { castle: d > 0 ? 'k' : 'q', rx, rtx: x + d });
        }
      }
      return out;
    }
    /* does colour `by` attack (x, y)?  A royal piece only ever attacks its 3x3 (so it can't check from afar, as in the other modes). */
    const NOZONE = new Set();
    function zoneFor(S, c) {                          // squares where pieces of colour c may not LAND: in front of and beside enemy Juggernauts
      if (!S.hj) return NOZONE;                       // (no Juggernaut has ever been on the board: nothing to compute)
      let z = zoneCache.get(S);
      if (!z) {
        z = { w: new Set(), b: new Set() };
        for (let i = 0; i < W * H; i++) {
          const q = S.b[i];
          if (!isJug(q)) continue;
          const qx = i % W, qy = (i - qx) / W, d = q.c === 'w' ? 1 : -1;
          [[qx, wrapY(qy + d)], [qx - 1, qy], [qx + 1, qy]].forEach(([ax, ay]) => { if (inB(ax, ay)) z[opp(q.c)].add(idx(ax, ay)); });
        }
        zoneCache.set(S, z);
      }
      return z[c];
    }
    function attacked(S, x, y, by) {
      if (zoneFor(S, by).has(idx(x, y))) return false;                // by can not land there, so it does not attack it
      for (let i = 0; i < W * H; i++) {
        const p = S.b[i];
        if (!p || p.c !== by || p.t === CODE.phantom) continue;       // a Phantom never captures a King, so it never gives check
        const px = i % W, py = (i - px) / W;
        if (royal(p) && Math.max(Math.abs(px - x), Math.abs(py - y)) > 1) continue;
        if (pseudo(S, px, py, true).some(m => m.tx === x && m.ty === y)) return true;
      }
      return false;
    }
    function inCheck(S, c) {
      for (let i = 0; i < W * H; i++) { const p = S.b[i]; if (p && p.c === c && royal(p)) { const x = i % W; return attacked(S, x, (i - x) / W, opp(c)); } }
      return false;
    }

    function creditKing(b, c, vx, vy) {              // a friendly capture within the King's zone: count it for a promoted (tier-1) King
      for (let i = 0; i < W * H; i++) {
        const q = b[i];
        if (!q || q.c !== c || q.o !== 'k' || q.tier !== 1 || q.t === q.o) continue;
        const kx = i % W, ky = (i - kx) / W;
        if (Math.max(Math.abs(kx - vx), Math.abs(ky - vy)) <= COND2.kingAllyRadius) b[i] = Object.assign({}, q, { cnt: Object.assign({}, q.cnt, { ac: q.cnt.ac + 1 }) });
        return;
      }
    }
    /* apply a move (a plain move, or one that also promotes); returns the next state and what happened */
    function step(S, m) {
      if (m.reenter) {                                                // a Phantom comes back onto the board
        const c0 = S.turn, ent = S.off[c0][m.ei], b0 = S.b.slice(), victim0 = b0[idx(m.tx, m.ty)];
        b0[idx(m.tx, m.ty)] = Object.assign({}, ent.p, { m: true });
        if (victim0) creditKing(b0, c0, m.tx, m.ty);
        const off0 = { w: S.off.w, b: S.off.b };
        off0[c0] = S.off[c0].filter((e, i) => i !== m.ei).map(e => Object.assign({}, e, { left: e.left - 1 })).filter(e => e.left > 0);
        const own0 = { w: Object.assign({}, S.own.w), b: Object.assign({}, S.own.b) }; own0[c0].n++;
        return { N: { b: b0, hj: S.hj, turn: opp(c0), ep: null, own: own0, off: off0 }, earns: false, victim: victim0, gaveCheck: false };
      }
      const b = S.b.slice(), c = S.turn, p = b[idx(m.fx, m.fy)], wasCheck = p.o === 'k' && inCheck(S, c);
      const ex = m.shot ? m.fx : m.px != null ? m.px : m.tx, ey = m.shot ? m.fy : m.px != null ? m.py : m.ty;          // where the piece ends up (a placed pawn form ends away from the square it reached)
      const vx = m.ep ? idx(m.tx, m.fy) : m.vx != null ? idx(m.vx, m.vy) : idx(m.tx, m.ty);
      let victim = m.swap || m.push || m.bump ? null : b[vx];
      let vpos = m.ep ? [m.tx, m.fy] : m.vx != null ? [m.vx, m.vy] : [m.tx, m.ty];
      if (m.gem && !victim) { victim = b[idx(m.tx, m.ty)]; vpos = [m.tx, m.ty]; }
      const real = !m.bump && !m.exit;
      const np = Object.assign({}, p, { m: true });
      const cnt = Object.assign({}, p.cnt);
      let victim2 = null;
      if (m.swap) { const q = b[idx(m.tx, m.ty)]; b[idx(m.fx, m.fy)] = Object.assign({}, q, { m: true }); b[idx(m.tx, m.ty)] = np; }
      else if (m.shot) { b[idx(m.tx, m.ty)] = null; b[idx(m.fx, m.fy)] = np; }                  // captures without moving
      else if (m.exit) { b[idx(m.fx, m.fy)] = null; }                                           // a Phantom leaves the board
      else if (p.t === CODE.mirror && m.gem) {                                                  // a Mirror's two actions: each is a step / capture, or a swap with a friendly piece
        let cx = m.fx, cy = m.fy; victim = null;
        [[m.vx, m.vy], [m.tx, m.ty]].forEach(([lx, ly]) => { const q = b[idx(lx, ly)]; if (q && q.c === c) b[idx(cx, cy)] = Object.assign({}, q, { m: true }); else { b[idx(cx, cy)] = null; if (q && !victim) { victim = q; vpos = [lx, ly]; } } b[idx(lx, ly)] = np; cx = lx; cy = ly; });
      }
      else if (m.bump) { const j = b[idx(m.tx, m.ty)]; b[idx(m.fx, m.fy)] = null; b[idx(m.px, m.py)] = np; b[idx(m.tx, m.ty)] = Object.assign({}, j, { sh: false }); if (m.px === m.fx && m.py === m.fy) np.m = p.m; }      // a failed capture attempt on a Juggernaut
      else {
        b[idx(m.fx, m.fy)] = null; if (m.ep || m.vx != null) b[vx] = null;
        if (m.chain) {                                                                         // a Titan pushes a whole chain one square (the last piece is squished when there is no room)
          for (let i = m.chain - 1; i >= 0; i--) { const sx = m.tx + i * m.cd[0], sy = wrapY(m.ty + i * m.cd[1]), dx2 = m.tx + (i + 1) * m.cd[0], dy2 = wrapY(m.ty + (i + 1) * m.cd[1]); if (i === m.chain - 1 && !m.push) { b[idx(sx, sy)] = null; continue; } b[idx(dx2, dy2)] = b[idx(sx, sy)]; b[idx(sx, sy)] = null; }
        } else if (m.push) b[idx(m.push[0], m.push[1])] = b[idx(m.tx, m.ty)];                  // a Juggernaut pushes the piece one square
        b[idx(m.tx, m.ty)] = null;
        if (ex !== m.tx || ey !== m.ty) victim2 = b[idx(ex, ey)];                       // a Brawler placed on an occupied square captures it
        b[idx(ex, ey)] = np;
        if (m.castle) { b[idx(m.rx, m.fy)] = null; b[idx(m.rtx, m.fy)] = Object.assign({}, S.b[idx(m.rx, m.fy)], { m: true }); }
      }
      const dist = Math.max(Math.abs(m.tx - m.fx), Math.abs(m.ty - m.fy));
      const endHalf = inOppHalf(c, ey);
      if (victim) { cnt.cap++; if (endHalf) cnt.cw++; if (victim.o === 'r') cnt.cr++; }
      if (p.o === 'r' && !m.castle && !m.shot && real) cnt.sl += dist;
      if (p.o === 'n' && !m.shot && real) cnt.st = inOppHalf(c, m.ty) ? cnt.st + 1 : 0;
      if (p.o === 'k' && !m.castle && !m.shot && !wasCheck && real) { cnt.km++; if (endHalf) cnt.kh++; }
      if (p.o === 'p' && p.tier === 2 && real) { cnt.sv++; if (m.push || m.squish) cnt.ps++; if (m.gem) cnt.dt++; }      // tier-2 pawn counters towards tier 3: turns survived, pushes, double-move turns
      np.cnt = cnt;
      for (let i = 0; i < b.length; i++) { const q = b[i]; if (q && q !== np && q.c === c && q.o === 'p' && q.tier === 2 && LINEAGE3[q.t] && real) b[i] = Object.assign({}, q, { cnt: Object.assign({}, q.cnt, { sv: q.cnt.sv + 1 }) }); }      // every other tier-2 pawn of yours survived one more turn
      const own = { w: Object.assign({}, S.own.w), b: Object.assign({}, S.own.b) };
      own[c].n++;
      let kcount = false;
      if (p.o === 'k' && !m.castle && !wasCheck && own[c].n <= COND.kingWindow) { own[c].k++; kcount = true; }
      const off = { w: S.off.w, b: S.off.b };
      off[c] = S.off[c].map(e => Object.assign({}, e, { left: e.left - 1 })).filter(e => e.left > 0);       // a Phantom that is still outside loses a turn of its time
      if (m.exit) off[c] = off[c].concat([{ p: np, ox: m.ox, oy: m.oy, left: COND2.phantomTurns }]);
      const N = { b, hj: S.hj || m.promo === CODE.juggernaut || m.promo === CODE.titan, turn: opp(c), ep: m.dbl ? { x: m.tx, y: (m.fy + m.ty) / 2, c } : null, own, off };
      const gaveCheck = (p.o === 'q' || p.o === 'n') && real && inCheck(N, opp(c));          // (only Queen and Knight checks are counted)
      if (p.o === 'q' && gaveCheck) { cnt.chk++; if (endHalf) cnt.ch2++; }
      if (p.o === 'n' && gaveCheck) cnt.chk++;
      if (victim && p.o !== 'k') creditKing(b, c, vpos[0], vpos[1]);                      // a friendly capture near a promoted King counts for its second promotion
      // does this move EARN a promotion? (plain, unpromoted, non-final pieces only; counted on the moves that add to the counter)
      let earns = null;
      if (real && !m.promo && p.tier === 0 && !p.fin && p.t === p.o && p.o !== 'p') {
        if (p.o === 'b') earns = !!victim && cnt.cap >= COND.bishopCaps;
        else if (p.o === 'n') earns = inOppHalf(c, m.ty) && cnt.st >= COND.knightStreak;
        else if (p.o === 'r') earns = !m.castle && cnt.sl >= COND.rookSlide;
        else if (p.o === 'q') earns = gaveCheck && cnt.chk >= COND.queenChecks;
        else if (p.o === 'k') earns = kcount && own[c].k >= COND.kingMoves;
      }
      if (real && !m.promo && p.tier === 1 && !p.fin && p.t !== p.o && p.o !== 'p' && TIER2[p.o].length) {      // second promotion (from a tier-1 form)
        const X = COND2, cap = !!victim;
        if (p.o === 'b') earns = (cap && cnt.cap >= X.bishopCaps) || (X.bishopBackRank && ey === lastRank(c));
        else if (p.o === 'n') earns = (cap && endHalf && cnt.cw >= X.knightCaps) || (gaveCheck && cnt.chk >= X.knightChecks);
        else if (p.o === 'r') earns = (cap && cnt.cap >= X.rookCaps) || (!m.castle && dist > 0 && cnt.sl >= X.rookSlide);
        else if (p.o === 'q') earns = (gaveCheck && endHalf && cnt.ch2 >= X.queenChecks) || (cap && victim.o === 'r' && cnt.cr >= X.queenRookCaps);
        else if (p.o === 'k') earns = (cap || (!m.shot && !m.castle && !wasCheck)) && (cnt.cap >= X.kingCaps || cnt.kh >= X.kingEnemyHalfMoves || cnt.ac >= X.kingAllyCaps);      // (friendly captures near the King are credited earlier; the offer comes on the King's next move)
      }
      if (real && !m.promo && p.o === 'p' && p.tier === 2 && LINEAGE3[p.t]) {                  // third promotion (tier-2 pawn -> tier 3)
        const T = COND2.pawnT3;
        earns = cnt.sv >= T.survive || (p.t === CODE.juggernaut ? cnt.ps >= T.jugPush : (cnt.dt >= T.gemDouble || cnt.cap >= T.gemCaps));
      }
      if (m.promo) {                                                    // the piece becomes the chosen form (counters restart)
        const F = m.promo;
        if (F.length === 1 && 'qrbn'.includes(F)) { np.t = F; np.o = F; np.fin = true; np.tier = 0; }      // plain Q/R/B/N: final
        else { const fromPawn = p.o === 'p' && ORIGIN[F] !== 'p'; np.t = F; np.o = ORIGIN[F]; np.tier = FORMS_BY_CODE[F].tier || 1; if (fromPawn) np.fin = true; }      // a piece form a pawn became is final: it never promotes again
        if (F === CODE.juggernaut || F === CODE.titan) np.sh = true; else delete np.sh;
        np.cnt = ZERO;
      }
      return { N, earns: !!earns, victim: victim || victim2, gaveCheck };
    }
    const apply = (S, m) => step(S, m).N;

    /* squares a pawn form can be placed on when its pawn promotes (fileX = the file the pawn reached the last rank on) */
    function placeSquares(S, p, F, fileX) {
      const out = [];
      if (F === CODE.courier) for (let k = 0; k < 3; k++) { const yy = p.c === 'w' ? k : H - 1 - k; if (!S.b[idx(fileX, yy)]) out.push([fileX, yy]); }      // first 3 ranks of its own file, empty squares only
      else if (F === CODE.strafer) { for (let xx = 0; xx < W; xx++) if (!S.b[idx(xx, p.hy)]) out.push([xx, p.hy]); }                                      // any empty square of its original rank
      else if (F === CODE.brawler) { const q = S.b[idx(p.hx, p.hy)]; if (!(q && q.o === 'k')) out.push([p.hx, p.hy]); }                                  // its start square: captures whatever is there, but never a King
      return out;
    }
    function legal(S, x, y) {
      const p = S.b[idx(x, y)];
      if (!p || p.c !== S.turn || forcedVoid(S)) return [];
      const out = [], last = lastRank(p.c), zone = zoneFor(S, p.c);
      const capOK = F => {                                                  // a pawn may only become a piece of a family you hold fewer than the cap of (pawn forms are never capped)
        const fam = F.length === 1 ? F : ORIGIN[F], cap = COND2.promoCaps[fam]; if (cap === undefined) return true;
        let n = 0; for (let i = 0; i < W * H; i++) { const q = S.b[i]; if (q && q.c === p.c && q.o === fam) n++; }
        (S.off[p.c] || []).forEach(e => { if (e.p.o === fam) n++; });
        return n < cap;
      };
      const tryM = m => { const r = step(S, m); return inCheck(r.N, p.c) ? null : r; };
      const royalHit = m => {                         // a royal piece is never captured (a Warlord's far leap must not take a King that could not check it)
        const q = (X, Y) => { const t = S.b[idx(X, Y)]; return !!(t && royal(t) && !(X === m.fx && Y === m.fy)); };
        return (m.vx != null ? q(m.vx, m.vy) : !m.swap && !m.ep && q(m.tx, m.ty)) || (m.gem && q(m.tx, m.ty)) || (m.px != null && q(m.px, m.py));
      };
      for (const m of pseudo(S, x, y, false)) {
        if (royalHit(m)) continue;
        const isJ = (X, Y) => { const q = S.b[idx(X, Y)]; return !!(isJug(q) && q.c !== p.c); };
        if ((m.vx != null && isJ(m.vx, m.vy)) || (m.gem && isJ(m.tx, m.ty)) || (m.px != null && isJ(m.px, m.py))) continue;      // two-part moves can never capture a Juggernaut
        const jt = (m.vx == null && !m.swap && !m.ep && !m.castle && m.px == null && !m.gem && !m.exit && !m.push && !m.squish) ? S.b[idx(m.tx, m.ty)] : null;
        if (jt && isJug(jt) && jt.c !== p.c) {
          const fwd = (m.fy - m.ty) * (jt.c === 'w' ? 1 : -1);                    // how far in front of the Juggernaut the attacker stands
          if (jt.t === CODE.titan ? fwd >= 0 : (fwd > 0 && Math.abs(m.fx - m.tx) <= fwd)) continue;      // (a Titan is also safe from the sides)                      // an attack from the front (straight ahead, diagonal ahead and in between) is simply blocked
        }
        if (jt && isJug(jt) && jt.sh && jt.c !== p.c) {                // a capture attempt on a shielded Juggernaut (from a side or behind): the attacker is stopped and loses the turn
          const end = m.dir ? [m.tx - m.dir[0], m.ty - m.dir[1]] : [m.fx, m.fy];
          const bm = { fx: m.fx, fy: m.fy, tx: m.tx, ty: m.ty, bump: true, px: end[0], py: end[1] };
          if (tryM(bm)) out.push(bm);
          continue;
        }
        if (!m.exit && !m.shot && zone.has(idx(m.px != null ? m.px : m.tx, m.px != null ? m.py : m.ty))) continue;       // can not land in front of / beside an enemy Juggernaut
        const r = tryM(m);
        if (r) { out.push(m); if (r.earns) (p.o === 'p' && p.tier === 2 ? LINEAGE3[p.t] || [] : (p.tier === 0 ? TIER1 : TIER2)[p.o]).forEach(code => out.push(Object.assign({}, m, { promo: code }))); }      // `m` itself = stay as it is
        if (p.o === 'p' && p.tier < 2 && m.ty === last && m.fy !== m.ty) {                    // a pawn reaches the last rank: it may stay a pawn (m), or promote right now
          (p.t === 'p' ? ['q', 'r', 'b', 'n'] : PAWN_MENU).filter(capOK).forEach(F => { const mv = Object.assign({}, m, { promo: F }); if (tryM(mv)) out.push(mv); });
          if (p.t === 'p') TIER1.p.forEach(F => placeSquares(S, p, F, m.tx).filter(([px, py]) => !zone.has(idx(px, py))).forEach(([px, py]) => { const mv = Object.assign({}, m, { promo: F, px, py }); if (!royalHit(mv) && tryM(mv)) out.push(mv); }));
        }
      }
      if (p.o === 'p' && p.tier < 2 && y === last) {                             // a pawn already standing on the last rank: promote and move in one action
        (p.t === 'p' ? ['q', 'r', 'b', 'n'] : PAWN_MENU).filter(capOK).forEach(F => {
          const fp = { t: F, c: p.c, m: true, o: ORIGIN[F] || F, tier: ORIGIN[F] ? 1 : 0, cnt: ZERO };
          const S2 = Object.assign({}, S, { b: S.b.map((q, i) => (i === idx(x, y) ? fp : q)) });
          pseudo(S2, x, y, false).forEach(mv => { const lm = { fx: x, fy: y, tx: mv.tx, ty: mv.ty, promo: F, late: true }; if (mv.castle || royalHit(lm)) return; if (tryM(lm)) out.push(lm); });
        });
        if (p.t === 'p') TIER1.p.forEach(F => placeSquares(S, p, F, x).filter(([px, py]) => !zone.has(idx(px, py))).forEach(([px, py]) => { const lm = { fx: x, fy: y, tx: px, ty: py, promo: F, late: true }; if (!royalHit(lm) && tryM(lm)) out.push(lm); }));
      }
      return out;
    }
    function voidMoves(S) {                           // a Phantom outside the board comes back in on an edge square diagonally next to where it left
      if (voidCache.has(S)) return voidCache.get(S);
      const c = S.turn, out = [];
      (S.off[c] || []).forEach((e, ei) => {
        for (const [ax, ay] of BISHOP) {
          const rx = e.ox + ax, ry = e.oy + ay;
          if (!inB(rx, ry)) continue;
          const q = S.b[idx(rx, ry)];
          if (q && (q.c === c || royal(q))) continue;
          if (zoneFor(S, c).has(idx(rx, ry))) continue;
          const m = { fx: e.ox, fy: e.oy, tx: rx, ty: ry, reenter: true, ei };
          if (!inCheck(step(S, m).N, c)) out.push(m);
        }
      });
      voidCache.set(S, out);
      return out;
    }
    const forcedVoid = S => (S.off[S.turn] || []).some((e, ei) => e.left === 1 && voidMoves(S).some(m => m.ei === ei));      // on its last turn a Phantom MUST come back (if it can)
    const all = S => { const out = voidMoves(S).slice(); for (let i = 0; i < W * H; i++) if (S.b[i] && S.b[i].c === S.turn) out.push(...legal(S, i % W, (i - i % W) / W)); return out; };
    const hasMove = S => { if (voidMoves(S).length) return true; for (let i = 0; i < W * H; i++) if (S.b[i] && S.b[i].c === S.turn && legal(S, i % W, (i - i % W) / W).length) return true; return false; };

    function dead(S) {                                    // insufficient material: only plain Bishops/Knights, as in the normal modes
      if (S.off.w.length || S.off.b.length) return false;      // a piece outside the board (Phantom) still counts
      const minors = [];
      for (let i = 0; i < W * H; i++) {
        const p = S.b[i];
        if (!p || p.t === 'k') continue;
        if (p.t !== 'b' && p.t !== 'n') return false;
        if (p.o !== p.t && !p.fin) return false;
        minors.push({ t: p.t, sq: ((i % W) + Math.floor(i / W)) % 2 });
      }
      return minors.length <= 1 || minors.every(q => q.t === 'b' && q.sq === minors[0].sq);
    }
    function status() {
      if (stCache.has(S)) return stCache.get(S);
      let r;
      let bare = false;
      for (const c of [S.turn]) { let tz = 0, other = 0; for (let i = 0; i < W * H; i++) { const q = S.b[i]; if (q && q.c === c) (q.t === CODE.tarzan ? tz++ : other++); } if (tz && !other) bare = true; }
      if (bare) r = 'checkmate';      // Tarzan loses when all its side's other pieces are gone (shown as a mate)
      else if (dead(S)) r = 'draw';
      else { const chk = inCheck(S, S.turn), has = hasMove(S); r = !has ? (chk ? 'checkmate' : 'stalemate') : (chk ? 'check' : 'playing'); }
      stCache.set(S, r); return r;
    }

    const api = {
      w: W, h: H, promotion: true, multi: false, perTurn: 1, left: 1, cyl: false, neutral: false, neutralPending: false,
      get turn() { return S.turn; },
      at: (x, y) => (inB(x, y) ? S.b[idx(x, y)] : null),
      valid: (x, y) => inB(x, y),
      moves: (x, y) => legal(S, x, y),
      allMoves: () => all(S),
      reach: (x, y) => { const p = S.b[idx(x, y)]; return p ? pseudo(Object.assign({}, S, { turn: p.c }), x, y, false) : []; },      // enemy-move preview (ignores check and whose turn it is)
      move(m) {
        if (!m || ['checkmate', 'stalemate', 'draw'].includes(status())) return false;
        const key = l => [l.tx, l.ty, l.promo || '', l.px == null ? -1 : l.px, l.py == null ? -1 : l.py, l.vx == null ? -1 : l.vx, l.vy == null ? -1 : l.vy, l.late ? 1 : 0, l.castle ? 1 : 0, l.swap ? 1 : 0, l.shot ? 1 : 0, l.gem ? 1 : 0, l.bump ? 1 : 0, l.squish ? 1 : 0, l.exit ? 1 : 0, l.reenter ? 1 : 0, l.push ? l.push.join('/') : ''].join('|');
        let ok, src;
        if (m.reenter) { ok = voidMoves(S).find(l => l.tx === m.tx && l.ty === m.ty && (m.ei == null || l.ei === m.ei)); if (!ok) return false; src = S.off[S.turn][ok.ei].p; }
        else {
          if (!inB(m.fx, m.fy)) return false;
          src = S.b[idx(m.fx, m.fy)];
          if (!src || src.c !== S.turn) return false;
          const km = key(Object.assign({}, m, { push: m.push || null }));
          ok = legal(S, m.fx, m.fy).find(l => key(l) === km || (key(Object.assign({}, l, { push: null })) === key(Object.assign({}, m, { push: null })) && !m.push));
          if (!ok) return false;
        }
        const vic = src.t === CODE.mirror && ok.gem ? [S.b[idx(ok.vx, ok.vy)], S.b[idx(ok.tx, ok.ty)]].find(q => q && q.c !== src.c) || null : ok.reenter || ok.gem ? S.b[idx(ok.tx, ok.ty)] || (ok.gem ? S.b[idx(ok.vx, ok.vy)] : null) : ok.swap || ok.bump || ok.push || ok.exit ? null : (ok.vx != null ? S.b[idx(ok.vx, ok.vy)] : S.b[idx(ok.tx, ok.ty)] || (ok.ep ? S.b[idx(ok.tx, ok.fy)] : null));
        hist.push({ c: S.turn, fx: ok.fx, fy: ok.fy, tx: ok.tx, ty: ok.ty, promo: ok.promo || null, px: ok.px != null ? ok.px : null, py: ok.py != null ? ok.py : null, late: !!ok.late, vx: ok.vx != null ? ok.vx : null, vy: ok.vy != null ? ok.vy : null, shot: !!ok.shot, swap: !!ok.swap, gem: !!ok.gem, bump: !!ok.bump, squish: !!ok.squish, push: ok.push || null, exit: !!ok.exit, ox: ok.ox != null ? ok.ox : null, oy: ok.oy != null ? ok.oy : null, reenter: !!ok.reenter, ei: ok.ei != null ? ok.ei : null, castle: ok.castle || null, ep: !!ok.ep, cap: vic ? vic.t : null, by: src.t });
        S = apply(S, ok);
        return true;
      },
      /* a modest bot: 2-ply (its move, the opponent's best material reply) on material, forms counting extra */
      bestMove(level) {
        const ms = all(S); if (!ms.length) return null;
        const VALP = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }, val = q => (VALP[q.o] != null ? VALP[q.o] : 3) * (q.tier === 3 ? 1.5 : q.tier === 2 ? 1.25 : q.tier === 1 ? 1.12 : 1) + (q.t === CODE.tarzan ? 3 : 0) + (q.o === 'p' && q.tier ? 0.3 * q.tier : 0);
        const mat = (T, c) => { let v = 0; for (let i = 0; i < W * H; i++) { const q = T.b[i]; if (q) v += q.c === c ? val(q) : -val(q); } for (const e of T.off.w) v += c === 'w' ? val(e.p) : -val(e.p); for (const e of T.off.b) v += c === 'b' ? val(e.p) : -val(e.p); return v; };
        const c = S.turn, pick = a => a[(Math.random() * a.length) | 0];
        if (level === 'easy') { const caps = ms.filter(m => !m.reenter && !m.exit && !m.bump && S.b[idx(m.tx, m.ty)] && !m.swap); return pick(caps.length && Math.random() < 0.6 ? caps : ms); }
        let best = null, bs = -1e9;
        for (const m of ms) {
          const N = apply(S, m), rs = all(N); let sc;
          if (!rs.length) sc = inCheck(N, N.turn) ? 1000 : 0;
          else { sc = 1e9; for (const r of rs) { const R = apply(N, r); let v = mat(R, c); if (v < sc && inCheck(R, c) && !hasMove(R)) v = -1000; if (v < sc) sc = v; } }
          sc += Math.random() * 0.3;
          if (sc > bs) { bs = sc; best = m; }
        }
        return best;
      },
      voidMoves: () => voidMoves(S),
      offBoard: c => (S.off[c || S.turn] || []).map(e => ({ t: e.p.t, ox: e.ox, oy: e.oy, left: e.left })),
      inCheck: () => inCheck(S, S.turn),
      onLast: (x, y) => { const p = inB(x, y) && S.b[idx(x, y)]; return !!p && p.o === 'p' && y === lastRank(p.c); },      // a pawn (of either kind) standing on the last rank: it can still promote and move
      kingPos: c => { const seat = c === undefined ? S.turn : c; for (let i = 0; i < W * H; i++) { const q = S.b[i]; if (q && q.c === seat && royal(q)) return { x: i % W, y: (i / W) | 0 }; } return null; },
      status,
      history: () => hist.slice(),
      drainEvents: () => [], hand: () => ({}), drops: () => [], sees: () => null, canSwap: () => false, traits: null,
      /* progress of a piece towards its promotion, for the UI: [{ label, have, need }] or null */
      progress(x, y) {
        const p = S.b[idx(x, y)];
        if (p && p.o === 'p' && p.tier === 2 && LINEAGE3[p.t]) {
          const T = COND2.pawnT3, c = p.cnt;
          return p.t === CODE.juggernaut ? { label: 'pushes or squishes, or ' + c.sv + '/' + T.survive + ' of your turns survived, for the third promotion', have: c.ps, need: T.jugPush }
            : { label: 'double-move turns, or 1 capture, or ' + c.sv + '/' + T.survive + ' of your turns survived, for the third promotion', have: c.dt, need: T.gemDouble };
        }
        if (!p || p.o === 'p' || p.fin || p.t === 'p') return null;
        const o = S.own[p.c], X = COND2;
        if (p.tier === 0 && p.t === p.o) {
          return p.o === 'b' ? { label: 'captures', have: p.cnt.cap, need: COND.bishopCaps }
            : p.o === 'n' ? { label: 'moves in a row ending in the enemy half', have: p.cnt.st, need: COND.knightStreak }
            : p.o === 'r' ? { label: 'squares slid', have: p.cnt.sl, need: COND.rookSlide }
            : p.o === 'q' ? { label: 'checks given', have: p.cnt.chk, need: COND.queenChecks }
            : { label: 'king moves among your first ' + COND.kingWindow, have: o.k, need: COND.kingMoves };
        }
        if (p.tier !== 1 || !TIER2[p.o].length) return null;
        const c = p.cnt;
        return p.o === 'b' ? { label: 'captures since promoting (or reach the enemy back rank) for the second promotion', have: c.cap, need: X.bishopCaps }
          : p.o === 'n' ? { label: 'captures in the enemy half since promoting (or give check) for the second promotion', have: c.cw, need: X.knightCaps }
          : p.o === 'r' ? { label: 'captures since promoting, or ' + c.sl + '/' + X.rookSlide + ' squares slid, for the second promotion', have: c.cap, need: X.rookCaps }
          : p.o === 'q' ? { label: 'checks given in the enemy half, or capture a Rook, for the second promotion', have: c.ch2, need: X.queenChecks }
          : { label: 'King captures, or ' + c.kh + '/' + X.kingEnemyHalfMoves + ' King moves ending in the enemy half, or ' + c.ac + '/' + X.kingAllyCaps + ' friendly captures near the King, for the second promotion', have: c.cap, need: X.kingCaps };
      },
      perft(d) { const go = (S, d) => (d === 0 ? 1 : all(S).reduce((n, m) => n + go(apply(S, m), d - 1), 0)); return go(S, d); },
      sig() { return JSON.stringify([S.off.w.map(e => [e.p.t, e.ox, e.oy, e.left]), S.off.b.map(e => [e.p.t, e.ox, e.oy, e.left]), S.b.map(p => p && [p.sh ? 1 : 0, p.t, p.c, p.m ? 1 : 0, p.tier, p.cnt.cap, p.cnt.sl, p.cnt.chk, p.cnt.st, p.cnt.cw, p.cnt.cr, p.cnt.ch2, p.cnt.km, p.cnt.ps, p.cnt.dt, p.cnt.sv]), S.turn, S.ep, S.own]); }
    };
    return api;
  }
  /* beginner bot: capture value, small bonus for promoting, random tie-break */
  const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  function botChoose(g, level) {
    if (g.bestMove) return g.bestMove(level);
    const ms = g.allMoves(); if (!ms.length) return null;
    const pick = a => a[(Math.random() * a.length) | 0];
    const val = t => VAL[t] != null ? VAL[t] : (VAL[ORIGIN[t]] || 3) + 1;
    const score = m => { const v = g.at(m.tx, m.ty); return (v && !m.swap ? val(v.t) : 0) + (m.promo ? Math.max(1.5, val(m.promo) - 1) : 0) + Math.random() * 0.4; };
    if (level === 'easy') { const caps = ms.filter(m => g.at(m.tx, m.ty) && !m.swap); return pick(caps.length && Math.random() < 0.6 ? caps : ms); }
    return ms.reduce((best, m) => (score(m) > score(best) ? m : best), ms[0]);
  }

  /* ---------- movement diagrams (same format as diagrams.js: { N, R, rows, aura, extras }, rows[0] = top) ----------
     . nothing   o the piece   e helper piece   m moves there but can't capture   c can only capture there   b moves or captures
     Method (as in diagrams.js): the piece alone on an empty board asks for its moves; then for every square an enemy pawn is put there and it asks again. */
  function diagram(t, o) {
    o = o || {};
    const full = !!o.board;                                       // o.board = n: draw a whole small n x n board (to show walls), the piece at o.at
    const R = o.R || 5, N = full ? o.board : 2 * R + 1, B = full ? o.board : N + 4, cx = full ? o.at[0] : R + 2, pawnLike = t === 'p' || ORIGIN[t] === 'p', cy = full ? o.at[1] : pawnLike ? (o.mid ? 2 : 1) : R + 2, ox = full ? 0 : cx - R, oy = full ? 0 : pawnLike ? 0 : cy - R;
    const rowsE = Array.from({ length: B }, () => '.'.repeat(B));
    const build = target => {
      const put = [{ x: cx, y: cy, t, c: 'w', m: !(t === 'p' && !o.mid) }];
      if (!full) { put.push({ x: B - 1, y: B - 1, t: 'k', c: 'b' }); if (t !== 'k' && ORIGIN[t] !== 'k') put.push({ x: 0, y: 0, t: 'k', c: 'w' }); }
      (o.extra || []).forEach(e => put.push({ x: cx + e.dx, y: cy + e.dy, t: e.t, c: e.c || 'w' }));
      if (target) put.push({ x: target[0], y: target[1], t: 'p', c: 'b' });
      return create({ w: B, h: B, setup: rowsE, put, first: 'w' });
    };
    const tos = g => { const r = new Map(); g.reach(cx, cy).forEach(m => { const k = m.tx + ',' + m.ty; if (!r.has(k) || !m.shot) r.set(k, !!m.shot); }); return r; };
    const empty = tos(build(null)), rows = [];
    for (let j = N - 1; j >= 0; j--) {
      let row = '';
      for (let i = 0; i < N; i++) {
        const x = ox + i, y = oy + j;
        if (x === cx && y === cy) { row += 'o'; continue; }
        if ((o.extra || []).some(e => cx + e.dx === x && cy + e.dy === y)) { row += 'e'; continue; }
        const tg = tos(build([x, y])), k = x + ',' + y, hit = tg.has(k), em = empty.has(k);
        row += hit ? (tg.get(k) ? (em ? 'x' : 's') : (em ? 'b' : 'c')) : (em ? 'm' : '.');
      }
      rows.push(row);
    }
    return { N, R, rows, aura: null, extras: (o.extra || []).map(e => ({ i: cx - ox + e.dx, j: N - 1 - (cy - oy) - e.dy, t: e.t, c: e.c || 'w' })) };
  }
  /* the situations worth drawing for a piece: [{ label, o }] (o = options for diagram()); the first is the plain piece */
  function states(t) {
    const pawn = (dx, dy) => ({ t: 'p', dx, dy });
    if (t === 'p') return [{ label: 'First move', o: {} }, { label: 'Later moves', o: { mid: true } }];
    if (t === CODE.zealot) return [{ label: '', o: {} }, { label: 'With friendly pieces in the way (here Pawns): it slides through them', o: { extra: [pawn(2, 2), pawn(-1, 0)] } }];
    if (t === CODE.ferry) return [{ label: '', o: {} }, { label: 'With a friendly piece in the way (here a Pawn): it may pass over ONE; the squares beyond are move only', o: { extra: [pawn(0, 2)] } }];
    if (t === CODE.chamberlain) return [{ label: '', o: {} }, { label: 'With a friendly piece next to it (here a Pawn): it can swap places with it', o: { extra: [pawn(1, 0)] } }];
    if (t === CODE.paragon) return [{ label: '', o: {} }, { label: 'Hops over exactly one piece (here Pawns) and lands directly behind it', o: { extra: [pawn(2, 0), pawn(-1, 0), pawn(0, -3), pawn(3, 3)] } }];
    if (t === CODE.switch) return [{ label: '', o: {} }, { label: 'With friendly pieces on its lines (here Pawns): it can swap places with the first one on each line', o: { extra: [pawn(3, 0), pawn(0, 2), pawn(-2, -2)] } }];
    const foe = (dx, dy) => ({ t: 'p', c: 'b', dx, dy });
    if (t === CODE.pinwheel) return [{ label: 'First leg: the Knight jump', o: {} }, { label: 'If it lands next to an enemy (here a Pawn): it may then take one more step like a King', o: { extra: [foe(3, 1)] } }];
    if (t === CODE.valkyrie) return [{ label: '', o: {} }, { label: 'After capturing (here a Pawn two squares up): she may step 1 square like a King (move only)', o: { extra: [foe(0, 2)] } }];
    if (t === CODE.ricochet) return [{ label: 'Its path reflects once off a wall (shown on an 8x8 board; a capture ends the move)', o: { board: 8, at: [2, 2] } }, { label: 'It also reflects off one of your own pieces (here a Pawn)', o: { board: 8, at: [2, 2], extra: [pawn(2, 1)] } }];
    if (t === CODE.titan) return [{ label: 'Steps up to 2 forward / left / right (move only). It pushes chains in the 3 squares ahead (see notes)', o: {} }];
    if (t === CODE.mirror) return [{ label: 'Both actions together: King steps, 2 forward (move only), or a swap with a friendly piece', o: {} }, { label: 'With a friendly piece within 3 (here a Pawn): it can swap places with it', o: { extra: [pawn(2, 1)] } }];
    if (t === CODE.gemini) return [{ label: 'Both moves together (1 or 2 forward each; it can also capture diagonally with either)', o: {} }];
    if (t === CODE.tyrant) return [{ label: '', o: {} }];
    return [{ label: '', o: {} }];
  }
  return { create, botChoose, diagram, states, ABBR, FORMS, CODE, NAME, TIER1, TIER2, PAWN_PIECE_FORMS, COND, COND2, ORIGIN };
})();
if (typeof module !== 'undefined') module.exports = Promotion;
