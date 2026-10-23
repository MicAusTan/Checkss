/* Imperial Chess engine (2-player 17x16 and 4-player 29x29 free-for-all). Same API shape as Engine.create() so index.html can drive it.
   Piece codes: p pawn, v pikeman, m skirmisher | r b n q k | R B N = Grand Rook/Bishop/Knight
   E emperor, X empress, H heir | g guard, h chariot, u archer, s sapper, t catapult | y prince, z princess
   x = 0..16 (files), y = 0..15. White starts at y=0 (back) and moves +y; Black mirrors. */
const Imperial = (() => {
  const PF = 'pvm', IMP = 'EXH';
  // Geometry. rot(c,a,b): a = to the seat's right, b = forward, returned as a board offset. rank/promo decide promotion.
  const G2 = { w: 17, h: 16, valid: (x, y) => x >= 0 && y >= 0 && x < 17 && y < 16 && !((y < 3 || y > 12) && (x < 2 || x > 14)),
    place: (c, u, r) => [u + 2, c === 'w' ? r : 15 - r], rot: (c, a, b) => (c === 'w' ? [a, b] : [a, -b]), rank: (c, x, y) => (c === 'w' ? y : 15 - y), promo: 12 };
  const arm = (x, y) => (y < 4 || y > 24) ? x >= 8 && x <= 20 : (x < 4 || x > 24) ? y >= 8 && y <= 20 : true;   // 4-player cross: 21x21 centre + four 13x4 arms
  const G4 = { w: 29, h: 29, valid: (x, y) => x >= 0 && y >= 0 && x < 29 && y < 29 && arm(x, y) && !((x < 4 || x > 24) && (y < 4 || y > 24)),
    place: (c, u, r) => c === 'r' ? [8 + u, r] : c === 'b' ? [r, 20 - u] : c === 'y' ? [20 - u, 28 - r] : [28 - r, 8 + u],
    rot: (c, a, b) => c === 'r' ? [a, b] : c === 'b' ? [b, -a] : c === 'y' ? [-a, -b] : [-b, a],
    rank: (c, x, y) => c === 'r' ? y : c === 'b' ? x : c === 'y' ? 28 - y : 28 - x, promo: 24 };
  const OR = [[1, 0], [-1, 0], [0, 1], [0, -1]], DG = [[1, 1], [1, -1], [-1, 1], [-1, -1]], K8 = OR.concat(DG);
  const sym = a => { const o = [], seen = new Set(); for (const [x, y] of a) for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { const k = [x * sx, y * sy], s = k + ''; if (!seen.has(s)) { seen.add(s); o.push(k); } } return o; };
  const KN = sym([[1, 2], [2, 1]]), CAM = sym([[1, 3], [3, 1]]), EXT = sym([[2, 4], [4, 2]]);
  const RING = []; for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) if (Math.max(Math.abs(a), Math.abs(b)) === 2) RING.push([a, b]);
  const SQ5 = []; for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) if (a || b) SQ5.push([a, b]);
  const ARCH = SQ5.filter(([a, b]) => !(Math.abs(a) === 2 && Math.abs(b) === 2) && Math.abs(a) + Math.abs(b) !== 1);          // 16
  const PR_CAP = SQ5.filter(([a, b]) => !(Math.abs(a) === 2 && Math.abs(b) === 2));                                           // 20
  const PR_MOV = [[2, 2], [2, -2], [-2, 2], [-2, -2], [3, 0], [-3, 0], [0, 3], [0, -3]];
  const PRS_CAP = RING.concat([[3, 0], [-3, 0], [0, 3], [0, -3]]);
  const NEAR = K8.concat([[2, 0], [-2, 0], [0, 2], [0, -2]]).concat([[0, 0]]);
  const CAT = [[3, 2], [-3, 2], [2, 3], [-2, 3], [-1, 4], [0, 4], [1, 4]];
  const FRONT = 'hmpmpvvvpmpmh', R2 = 'sagnbqgkbngas', BACK = 'rnbtrXHErtbnr';
  const GRAND = { r: 'R', b: 'B', n: 'N' }, MINOR = ['r', 'b', 'n', 'g', 'h', 'u', 's', 't'];
  const CMAX = 6;   // castle: max landing distance. TUNE ME (cooldown = 3 own turns, see CCDp)
  const VAL = { p: 1, v: 1.4, m: 1.3, r: 5, b: 3.3, n: 3, q: 9, k: 3, R: 7, B: 5, N: 5, E: 7, X: 7, H: 6, g: 3, h: 4, u: 3.2, s: 2, t: 4, y: 5, z: 5, j: 4.5, d: 4, '#': 0.2 };

  // 2v2 "wide" board: each team's two armies sit side by side (26 files), the middle ranks are 30 wide (2 extra files each side, like the 2-player board)
  const wideGeom = H => ({ w: 30, h: H, valid: (x, y) => x >= 0 && y >= 0 && x < 30 && y < H && ((y < 3 || y > H - 4) ? x >= 2 && x <= 27 : true),
    place: (c, u, r) => c === 'r' ? [2 + u, r] : c === 'y' ? [15 + u, r] : c === 'g' ? [14 - u, H - 1 - r] : [27 - u, H - 1 - r],
    rot: (c, a, b) => (c === 'r' || c === 'y' ? [a, b] : [-a, -b]), rank: (c, x, y) => (c === 'r' || c === 'y' ? y : H - 1 - y), promo: H - 4 });
  function create(o) {
    o = o || {};
    const G = o.four ? (o.wide ? wideGeom(Math.max(16, o.height | 0)) : G4) : G2, W = G.w, H = G.h, MULTI = !!o.four, rot = G.rot, cut = (x, y) => !G.valid(x, y);
    const SEATS = MULTI ? ['r', 'b', 'y', 'g'] : ['w', 'b'], active = MULTI && o.seats && o.seats.length > 1 ? o.seats : SEATS, NS = active.length;
    const TEAMS = MULTI && o.teams ? o.teams : null, team = c => (TEAMS ? TEAMS[c] : c);
    const WLIFE = NS * 3 + 1, WCD = NS * 2, CCDp = NS * 3;   // wall lifetime / Sapper wall cooldown / castle cooldown, in plies (2 seats: 7 / 4 / 6)
    const alive0 = {}; SEATS.forEach(c => { alive0[c] = active.includes(c); });
    const nextSeat = (c, al) => { for (let i = 1; i <= SEATS.length; i++) { const d = SEATS[(SEATS.indexOf(c) + i) % SEATS.length]; if (al[d]) return d; } return c; };
    const B0 = new Array(W * H).fill(null);
    const put = (row, r, c) => { for (let i = 0; i < 13; i++) { const [x, y] = G.place(c, i, r), q = { t: row[i], c, m: false, o: true }; if (!alive0[c]) q.dead = true; B0[y * W + x] = q; } };
    SEATS.forEach(c => { put(BACK, 0, c); put(R2, 1, c); put(FRONT, 2, c); });
    if (o.pieces) { B0.fill(null); for (const q of o.pieces) B0[q.y * W + q.x] = { t: q.t, c: q.c, m: !!q.m, o: !!q.o }; }
    let S = { B: B0, turn: active[0], ply: 0, alive: alive0 }; const hist = [], cache = new Map(); let events = [];

    const at = (B, x, y) => (cut(x, y) ? null : B[y * W + x]);
    const empty = (B, x, y) => !cut(x, y) && !B[y * W + x];
    function info(B) {                                   // alive Imperials / Prince / Princess per seat (gray pieces and walls don't count)
      const o = {}; SEATS.forEach(c => { o[c] = { E: 0, X: 0, H: 0, y: 0, z: 0, n: 0 }; });
      for (const p of B) if (p && !p.wall && !p.dead) { const q = o[p.c]; if (q[p.t] !== undefined) q[p.t]++; if (!IMP.includes(p.t)) q.n++; }
      return o;
    }
    const nImp = q => q.E + q.X + q.H;
    const near = (B, x, y, c, ts, r) => { for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) { const p = at(B, x + a, y + b); if (p && !p.dead && p.c === c && ts.includes(p.t)) return true; } return false; };
    const kingAura = (B, x, y, c) => near(B, x, y, c, 'k', 2), queenAura = (B, x, y, c) => near(B, x, y, c, 'q', 2);

    function pathClear(B, x, y, dx, dy) {                // Prince: some shortest king-step path is empty
      const m = Math.max(Math.abs(dx), Math.abs(dy)), sx = Math.sign(dx), sy = Math.sign(dy);
      const go = (cx, cy, k) => {
        if (k === m) return cx === dx && cy === dy;
        for (const stx of (sx ? [0, sx] : [0])) for (const sty of (sy ? [0, sy] : [0])) {
          if (!stx && !sty) continue;
          const nx = cx + stx, ny = cy + sty;
          if (Math.abs(dx - nx) > m - k - 1 || Math.abs(dy - ny) > m - k - 1) continue;
          if (k + 1 < m && !empty(B, x + nx, y + ny)) continue;
          if (go(nx, ny, k + 1)) return true;
        }
        return false;
      };
      return go(0, 0, 0);
    }

    // can attacker p (at ax,ay) take target t on (tx,ty)?  (all immunities live here; also used for check)
    function canTake(B, p, t, inf) {
      if (!t || (!t.dead && team(t.c) === team(p.c))) return false;     // teammates never capture each other
      if (t.dead) return true;                           // gray pieces (eliminated / unused seats) have no immunities, Imperials included
      const me = inf[t.c];
      if (IMP.includes(t.t)) {
        if (PF.includes(p.t)) return false;
        if (p.t === 'r' && t.t === 'E' && me.X) return false;
        if (p.t === 'b' && t.t === 'X' && me.E) return false;
        if (p.t === 'n' && t.t === 'H' && (me.E || me.X)) return false;
      }
      return true;
    }
    function protectedFrom(B, p, t, tx, ty, inf) {       // aura / guard / princess protections
      if (t.dead) return false;
      if (PF.includes(p.t)) {
        if ('rbnRBN'.includes(t.t) && kingAura(B, tx, ty, t.c)) return true;
        if ('guhst'.includes(t.t) && queenAura(B, tx, ty, t.c)) return true;
      }
      if (p.t === 'u') { if (t.t === 'g' || near(B, tx, ty, t.c, 'g', 1)) return true; }
      if (t.t === 'z' && near(B, tx, ty, t.c, 'y', 1)) return true;
      return false;
    }

    // raw reach of a piece: [{tx,ty,mv,cap,shoot}] (occupancy / immunity resolved later)
    function gen(B, x, y, inf) {
      const p = B[y * W + x], c = p.c, me = inf[c], out = [], R = (a, b) => rot(c, a, b);
      const add = (dx, dy, o) => out.push(Object.assign({ tx: x + dx, ty: y + dy, mv: true, cap: true }, o));
      const addR = (a, b, o) => { const [d, e] = R(a, b); add(d, e, o); };
      const emptyR = (a, b) => { const [d, e] = R(a, b); return empty(B, x + d, y + e); };
      const leap = (l, o) => l.forEach(([a, b]) => add(a, b, o));
      const slide = (dirs, max, o) => {
        for (const [a, b] of dirs) for (let i = 1; i <= max; i++) {
          const tx = x + a * i, ty = y + b * i; if (cut(tx, ty)) break;
          out.push(Object.assign({ tx, ty, mv: true, cap: true }, o)); if (B[ty * W + tx]) break;
        }
      };
      const castle = (dirs, ts) => {
        if (p.cd !== undefined && S.ply - p.cd < CCDp) return;
        for (const [a, b] of dirs) {
          let i = 1; while (i < CMAX && empty(B, x + a * i, y + b * i)) i++;
          const q = at(B, x + a * i, y + b * i); if (i >= CMAX || !q || q.c !== c || !ts.includes(q.t)) continue;
          for (let j = i + 1; j <= CMAX && empty(B, x + a * j, y + b * j); j++) add(a * j, b * j, { cap: false, castle: true });
        }
      };
      const imperial = (dirs, bandOf, R) => {
        for (const [a, b] of dirs) for (let i = 1; i <= R; i++) {
          const lx = x + a * i, ly = y + b * i; if (cut(lx, ly)) break;
          const q = B[ly * W + lx], pass = q && q.c === c && IMP.includes(q.t);
          out.push({ tx: lx, ty: ly, mv: true, cap: true });
          if (q && !pass) break;
          for (const [bx, by] of bandOf(a, b)) out.push({ tx: lx + bx, ty: ly + by, mv: true, cap: true });
        }
      };
      switch (p.t) {
        case 'p': case 'v': case 'm': {
          if (emptyR(0, 1)) {
            addR(0, 1, { cap: false });
            const n = !p.m ? 3 : kingAura(B, x, y, c) ? 2 : 1;
            for (let i = 2; i <= n; i++) { if (!emptyR(0, i) || !emptyR(0, i - 1)) break; addR(0, i, { cap: false }); }
          }
          addR(1, 1, { mv: false }); addR(-1, 1, { mv: false });
          if (p.t === 'v' || (p.t === 'p' && queenAura(B, x, y, c))) addR(0, 1, { mv: false });
          if (p.t === 'm') { addR(1, 0, { cap: false }); addR(-1, 0, { cap: false }); }
          if (S.ep && S.ep.c !== c) for (const dx of [1, -1]) { const [d, e] = R(dx, 1); if (S.ep.passed.some(q => q.x === x + d && q.y === y + e)) add(d, e, { cap: false, ep: true }); }
          break;
        }
        case 'k': leap(K8); break;
        case 'q': slide(K8, 16); break;
        case 'r': slide(OR, 16); break;
        case 'b': slide(DG, 16); break;
        case 'n': leap(KN); break;
        case 'R': slide(OR, 16); leap(KN, { cap: false }); break;
        case 'B': slide(DG, 16); slide(OR, 2); break;
        case 'N': leap(RING); break;
        case 'E': imperial(OR, (a, b) => [[b, a], [-b, -a]], me.X ? 16 : 3); castle(OR, 'rR'); break;
        case 'X': imperial(DG, (a, b) => [[1, 0], [-1, 0], [0, 1], [0, -1]], me.E ? 16 : 3); castle(DG, 'bB'); break;
        case 'H': { const L = KN.concat(CAM, me.E || me.X ? [] : EXT); leap(L); leap(L, { swap: true }); break; }
        case 'g': {
          leap(K8); leap([[2, 0], [-2, 0], [0, 2], [0, -2]], { cap: false });
          for (const [a, b] of NEAR) { const q = at(B, x + a, y + b); if (q && q.c === c && (a || b)) for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) add(a + i, b + j, { cap: false }); }
          break;
        }
        case 'h': {
          for (const [a, b] of OR) {
            if (!empty(B, x + a, y + b)) { add(a, b); continue; }
            add(a, b); add(2 * a, 2 * b);
            if (empty(B, x + 2 * a, y + 2 * b)) { add(2 * a + b, 2 * b + a); add(2 * a - b, 2 * b - a); }
          }
          break;
        }
        case 'u': OR.forEach(([a, b]) => add(a, b, { cap: false })); ARCH.forEach(([a, b]) => add(a, b, { mv: false, shoot: true })); break;
        case 's': leap(DG.concat([[2, 0], [-2, 0], [0, 2], [0, -2]]), { cap: false }); break;
        case 't': {
          slide(OR, 2, { cap: false });
          if (p.fired === undefined || S.ply - p.fired > NS) CAT.forEach(([a, b]) => addR(a, b, { mv: false, shoot: true }));
          break;
        }
        case 'j': {                                       // Lancer
          for (const dx of [-1, 1]) for (const d of [1, 2]) addR(dx, d, { mv: true, cap: true });
          for (let d = 1; d <= 3; d++) { let ok = true; for (let i = 1; i < d; i++) if (!emptyR(0, i)) ok = false; if (ok) addR(0, d, { mv: false, shoot: true }); }
          for (const d of [4, 5]) { let ok = true; for (let i = 1; i < d; i++) if (!emptyR(0, i)) ok = false; if (ok) addR(0, d, { cap: true, mv: false }); }
          for (const d of [1, 2]) { if (!emptyR(0, -(d - 1)) && d === 2) break; addR(0, -d, { mv: false }); }
          for (const sx of [1, -1]) for (const d of [1, 2]) { if (d === 2 && !empty(B, x + sx, y)) break; add(sx * d, 0, { cap: false }); }
          break;
        }
        case 'd': {                                       // Raider
          for (const sx of [1, -1]) for (let i = 1; i <= 5; i++) {
            const tx = x + sx * i; if (cut(tx, y)) break;
            out.push({ tx, ty: y, mv: true, cap: i <= 3 }); if (B[y * W + tx]) break;
          }
          slide([[0, 1], [0, -1]], 2);
          for (const sx of [1, -1]) for (const sy of [1, -1]) add(3 * sx, sy);
          break;
        }
        case 'y':
          PR_CAP.forEach(([a, b]) => pathClear(B, x, y, a, b) && add(a, b));
          PR_MOV.forEach(([a, b]) => pathClear(B, x, y, a, b) && add(a, b, { cap: false }));
          break;
        case 'z': {
          K8.forEach(([a, b]) => add(a, b, { cap: false }));
          for (const [a, b] of PRS_CAP) {
            const straight = !a || !b, d = Math.max(Math.abs(a), Math.abs(b));
            if (straight) { const sx = Math.sign(a), sy = Math.sign(b); let ok = true; for (let i = 1; i < d; i++) if (!empty(B, x + sx * i, y + sy * i)) ok = false; if (!ok) continue; }
            add(a, b, { mv: false, shoot: true });
          }
          break;
        }
      }
      return out;
    }

    function pseudo(St, x, y) {
      const B = St.B, p = at(B, x, y); if (!p || p.dead) return [];
      const inf = info(B), seen = new Set(), out = [], inZone = (tx, ty) => G.rank(p.c, tx, ty) >= G.promo;
      const saveS = S; S = St;
      let list; try { list = gen(B, x, y, inf); } finally { S = saveS; }
      for (const r of list) {
        if (cut(r.tx, r.ty) || r.tx === x && r.ty === y) continue;
        const t = B[r.ty * W + r.tx], key = r.tx + ',' + r.ty + (r.shoot ? 's' : '') + (r.ep ? 'e' : '') + (r.castle ? 'c' : '') + (r.swap ? 'w' : ''); if (seen.has(key)) continue;
        if (r.swap) { if (t && t.c === p.c && 'nN'.includes(t.t)) { seen.add(key); out.push({ fx: x, fy: y, tx: r.tx, ty: r.ty, swap: true }); } continue; }
        if (t && t.wall) { if (!r.shoot) { seen.add(key); out.push({ fx: x, fy: y, tx: r.tx, ty: r.ty }); } continue; }
        if (t ? !(r.cap && canTake(B, p, t, inf) && !protectedFrom(B, p, t, r.tx, r.ty, inf)) : !r.mv) continue;
        seen.add(key);
        const m = { fx: x, fy: y, tx: r.tx, ty: r.ty }; if (r.shoot) m.shoot = true; if (r.ep) m.ep = true; if (r.castle) m.castle = true;
        if (!r.shoot && inZone(r.tx, r.ty)) {
          if (PF.includes(p.t)) {
            for (const q of MINOR.concat(p.t === 'v' ? ['j'] : p.t === 'm' ? ['d'] : [])) out.push(Object.assign({ promo: q }, m));
            for (const q of ['y', 'z']) if (!inf[p.c][q]) out.push(Object.assign({ promo: q }, m));
            continue;
          }
          if (p.o && GRAND[p.t]) { m.promo = GRAND[p.t]; }
        }
        out.push(m);
      }
      return out;
    }

    function fin(B, St, cap, extra) {                    // end of a turn (or a pending wall step)
      if (extra && extra.pend) return { B, turn: St.turn, ply: St.ply, pend: extra.pend, cap, alive: St.alive };
      const ply = St.ply + 1;
      for (let i = 0; i < B.length; i++) if (B[i] && B[i].wall && B[i].wp + WLIFE <= ply) B[i] = null;   // walls: gone at the start of the 4th enemy turn (2 seats)
      return { B, turn: nextSeat(St.turn, St.alive), ply, cap, ep: extra && extra.ep, alive: St.alive };
    }
    function apply(St, m) {
      const B = St.B.slice(), p = B[m.fy * W + m.fx], inf = info(St.B), [Fx, Fy] = rot(p.c, 0, 1);
      if (m.skip || m.wall) {
        if (m.wall) { B[m.ty * W + m.tx] = { t: '#', c: 'x', wall: true, wp: St.ply }; B[m.fy * W + m.fx] = Object.assign({}, p, { wp: St.ply }); }
        return fin(B, St, null);
      }
      const dead = B[m.ty * W + m.tx];
      if (m.swap) { const q = B[m.ty * W + m.tx]; B[m.ty * W + m.tx] = Object.assign({}, p, { m: true }); B[m.fy * W + m.fx] = Object.assign({}, q, { m: true }); return fin(B, St, null); }
      if (m.shoot) {
        const hits = [{ x: m.tx, y: m.ty, t: dead.t }];
        if (p.t === 't') {
          B[m.fy * W + m.fx] = Object.assign({}, p, { fired: St.ply });
          if (m.tx - m.fx === 4 * Fx && m.ty - m.fy === 4 * Fy) for (const s of [-1, 1]) {
            const [sdx, sdy] = rot(p.c, s, 0), sx = m.tx + sdx, sy = m.ty + sdy, q = at(St.B, sx, sy);
            if (q && !q.wall && canTake(St.B, p, q, inf) && !IMP.includes(q.t) && !protectedFrom(St.B, p, q, sx, sy, inf)) { B[sy * W + sx] = null; hits.push({ x: sx, y: sy, t: q.t }); }
          }
        }
        B[m.ty * W + m.tx] = null;
        const r = fin(B, St, dead); r.hits = hits; return r;
      }
      B[m.fy * W + m.fx] = null;
      let cap = dead;
      if (m.ep && St.ep) { cap = B[St.ep.ly * W + St.ep.lx]; B[St.ep.ly * W + St.ep.lx] = null; }
      B[m.ty * W + m.tx] = Object.assign({}, p, { t: m.promo || p.t, m: true, o: m.promo && !GRAND[p.t] ? false : p.o, cd: m.castle ? St.ply : p.cd });
      if (p.t === 's' && (p.wp === undefined || St.ply - p.wp >= WCD)) {
        let free = false; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if ((a || b) && empty(B, m.tx + a, m.ty + b)) free = true;
        if (free) return fin(B, St, cap, { pend: { x: m.tx, y: m.ty } });
      }
      let ep; const dx = m.tx - m.fx, dyy = m.ty - m.fy, dd = dx * Fx + dyy * Fy;
      if (PF.includes(p.t) && !dead && dd >= 2 && dx === dd * Fx && dyy === dd * Fy) { ep = { c: p.c, lx: m.tx, ly: m.ty, passed: [] }; for (let k = 1; k < dd; k++) ep.passed.push({ x: m.fx + Fx * k, y: m.fy + Fy * k }); }
      return fin(B, St, cap, { ep });
    }

    function loneAttacked(B, c, ply) {
      const inf = info(B); if (nImp(inf[c]) !== 1) return false;
      let tx = -1, ty = -1, t = null;
      for (let i = 0; i < B.length; i++) if (B[i] && B[i].c === c && !B[i].dead && IMP.includes(B[i].t)) { tx = i % W; ty = (i / W) | 0; t = B[i]; }
      const St = { B, turn: c, ply: ply === undefined ? S.ply : ply, ep: null };
      for (let i = 0; i < B.length; i++) {
        const q = B[i]; if (!q || team(q.c) === team(c) || q.wall || q.dead) continue;
        const saveS = S; S = St; let list; try { list = gen(B, i % W, (i / W) | 0, inf); } finally { S = saveS; }
        if (list.some(r => r.cap && r.tx === tx && r.ty === ty && canTake(B, q, t, inf) && !protectedFrom(B, q, t, tx, ty, inf))) return true;
      }
      return false;
    }
    function legal(St, x, y) {
      const p = at(St.B, x, y); if (!p || p.dead || p.c !== St.turn) return [];
      if (St.pend) {
        if (x !== St.pend.x || y !== St.pend.y) return [];
        const o = [{ fx: x, fy: y, tx: x, ty: y, skip: true }];
        for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if ((a || b) && empty(St.B, x + a, y + b)) o.push({ fx: x, fy: y, tx: x + a, ty: y + b, wall: true });
        return o;
      }
      const pre = loneAttacked(St.B, p.c, St.ply);
      return pseudo(St, x, y).filter(m => { if (m.castle && pre) return false; const n = apply(St, m); return !loneAttacked(n.B, p.c, n.ply); });
    }
    function anyLegal(St) {
      for (let i = 0; i < St.B.length; i++) { const p = St.B[i]; if (p && !p.dead && p.c === St.turn && legal(St, i % W, (i / W) | 0).length) return true; }
      return false;
    }
    function all(St) {
      const o = []; for (let i = 0; i < St.B.length; i++) { const p = St.B[i]; if (p && !p.dead && p.c === St.turn) o.push(...legal(St, i % W, (i / W) | 0)); }
      return o;
    }
    function status() {
      if (cache.has(S)) return cache.get(S);
      const inf = info(S.B); let r = 'playing', loser = null;
      const bare = c => inf[c].n === 0;                // only Imperials (or nothing) left: immediate loss, beats stalemate
      if (bare('w') || bare('b')) { r = 'bare'; loser = bare(S.turn) ? S.turn : SEATS.find(c => c !== S.turn); if (bare('w') && bare('b')) { r = 'draw'; loser = null; } }
      else {
        const chk = loneAttacked(S.B, S.turn, S.ply);
        if (!anyLegal(S)) r = chk ? 'checkmate' : 'stalemate'; else if (chk) r = 'check';
        if (r === 'checkmate') loser = S.turn;
      }
      const v = { r, loser }; cache.set(S, v); return v;
    }

    // ---- 4-player (free-for-all): knock out bare / checkmated seats, skip stalemated ones ----
    const liveCount = St => SEATS.filter(c => St.alive[c]).length, liveTeams = St => new Set(SEATS.filter(c => St.alive[c]).map(team)).size;
    function kill(N, c, why) {                           // seat out: its pieces turn gray (capturable, Imperials included)
      N.alive = Object.assign({}, N.alive, { [c]: false });
      for (let i = 0; i < N.B.length; i++) if (N.B[i] && N.B[i].c === c && !N.B[i].wall) N.B[i] = Object.assign({}, N.B[i], { dead: true });
      if (N.turn === c) N.pend = null;
      events.push({ e: 'elim', c, reason: why });
    }
    function settle(N) {
      let skips = 0;
      for (let guard = 0; guard < 16; guard++) {
        const inf = info(N.B);
        for (const c of SEATS) if (N.alive[c] && inf[c].n === 0) kill(N, c, 'bare');
        if (liveTeams(N) < 2) return;
        if (!N.alive[N.turn]) { N.turn = nextSeat(N.turn, N.alive); continue; }
        if (N.pend || anyLegal(N)) return;
        if (loneAttacked(N.B, N.turn, N.ply)) { kill(N, N.turn, 'checkmate'); skips = 0; }
        else { events.push({ e: 'skip', c: N.turn }); if (++skips >= liveCount(N)) { N.drawn = true; return; } }
        N.turn = nextSeat(N.turn, N.alive);
      }
    }
    const over = () => (MULTI ? liveTeams(S) < 2 || !!S.drawn : false);
    const lonePos = c => { const B = S.B; for (let i = 0; i < B.length; i++) if (B[i] && B[i].c === c && !B[i].dead && IMP.includes(B[i].t) && nImp(info(B)[c]) === 1) return { x: i % W, y: (i / W) | 0 }; return null; };

    return {
      w: W, h: H, imperial: true, multi: MULTI, seats: active, teams: TEAMS, wide: !!(MULTI && o.wide), cyl: false, perTurn: 1, left: 1, neutral: false, neutralPending: false,
      get turn() { return S.turn; },
      get pend() { return S.pend || null; },
      get loser() { return status().loser; },
      get drawn() { return !!S.drawn; },
      alive: c => !!S.alive[c],
      winner: () => (MULTI && !S.drawn && liveTeams(S) === 1 ? SEATS.find(c => S.alive[c]) : null),
      wallLife: (x, y) => { const p = at(S.B, x, y); return p && p.wall ? Math.max(1, Math.ceil((p.wp + WLIFE - S.ply) / NS)) : 0; },   // rounds of play the wall still stands
      valid: (x, y) => !cut(x, y), kingPos: lonePos,
      at: (x, y) => at(S.B, x, y), cut,
      moves: (x, y) => legal(S, x, y),
      allMoves: () => all(S),
      reach(x, y) { const p = at(S.B, x, y); return !p || p.wall || p.dead ? [] : pseudo({ B: S.B, turn: p.c, ply: S.ply, ep: S.ep }, x, y); },   // enemy-move preview: pseudo-legal, ignores whose turn it is
      move(m) {
        if (!m || over() || (!MULTI && ['bare', 'checkmate', 'stalemate', 'draw'].includes(status().r))) return false;
        const same = l => l.tx === m.tx && l.ty === m.ty && (l.promo || null) === (m.promo || null);
        const ok = legal(S, m.fx, m.fy).find(l => same(l) && !!l.shoot === !!m.shoot && !!l.ep === !!m.ep && !!l.castle === !!m.castle && !!l.swap === !!m.swap && !!l.wall === !!m.wall && !!l.skip === !!m.skip)
                || legal(S, m.fx, m.fy).find(l => same(l));
        if (!ok) return false;
        const ns = apply(S, ok);
        hist.push({ c: S.turn, fx: ok.fx, fy: ok.fy, tx: ok.tx, ty: ok.ty, promo: ok.promo || null, shoot: !!ok.shoot, ep: !!ok.ep, castle: !!ok.castle, swap: !!ok.swap, wall: !!ok.wall, skip: !!ok.skip, cap: ns.cap ? ns.cap.t : null, capc: ns.cap ? ns.cap.c : null, hits: ns.hits || null, by: S.B[ok.fy * W + ok.fx].t });
        S = { B: ns.B, turn: ns.turn, ply: ns.ply, pend: ns.pend, ep: ns.ep, alive: ns.alive };
        if (MULTI) settle(S);
        return true;
      },
      resign(c) {
        if (!MULTI || !S.alive[c] || over()) return;
        const N = { B: S.B.slice(), turn: S.turn, ply: S.ply, pend: S.pend, ep: S.ep, alive: S.alive };
        kill(N, c, 'resigned'); if (N.turn === c) N.turn = nextSeat(c, N.alive);
        S = N; settle(S);
      },
      drainEvents() { const e = events; events = []; return e; },
      inCheck: c => { const seat = c === undefined ? S.turn : c; return (!MULTI || !!S.alive[seat]) && loneAttacked(S.B, seat, S.ply); },
      status: () => status().r,
      history: () => hist.slice(), hand: () => ({}), drops: () => [], sees: () => null, canSwap: () => false, traits: MULTI ? {} : null,
      evalMoves() {                                    // for bots: every legal move with its material gain and the best enemy reply capture
        const ms = all(S), me = S.turn;
        return ms.map(m => {
          const n = apply(S, m), hits = n.hits || (n.cap ? [{ t: n.cap.t, dead: n.cap.dead }] : []);
          let gain = hits.reduce((a, h) => a + (VAL[h.t] || 0) * (h.dead ? 0.35 : 1), 0), loss = 0, bonus = 0;
          if (m.wall) bonus = 0.25;
          if (m.promo) bonus += GRAND[S.B[m.fy * W + m.fx].t] === m.promo ? 2 : 3;
          const p = S.B[m.fy * W + m.fx]; if (p && PF.includes(p.t)) bonus += 0.06 * G.rank(me, m.tx, m.ty) * 12 / G.promo;
          if (!n.pend && !m.skip) {
            for (let i = 0; i < n.B.length; i++) { const q = n.B[i]; if (!q || q.wall || q.dead || team(q.c) === team(me)) continue;
              const St = { B: n.B, turn: q.c, ply: n.ply, ep: n.ep };
              for (const r of pseudo(St, i % W, (i / W) | 0)) { const t = n.B[r.ty * W + r.tx]; if (t && team(t.c) === team(me) && !t.wall && !t.dead) loss = Math.max(loss, VAL[t.t] || 0); } }
          }
          return { m, gain, loss, bonus };
        });
      },
      counts: () => info(S.B)
    };
  }
  function botChoose(g, level) {
    const ev = g.evalMoves(); if (!ev.length) return null;
    const pick = a => a[Math.random() * a.length | 0];
    if (level === 'easy') { const caps = ev.filter(e => e.gain > 0); return pick(caps.length && Math.random() < 0.6 ? caps : ev).m; }
    let best = null, bs = -1e9;
    for (const e of ev) { const sc = e.gain - 0.9 * e.loss + e.bonus + Math.random() * 0.4; if (sc > bs) { bs = sc; best = e; } }
    return best.m;
  }
  return { create, cut: (x, y) => !G2.valid(x, y), botChoose, G2, G4 };
})();
if (typeof module !== 'undefined') module.exports = Imperial;
