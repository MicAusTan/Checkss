/* Practice mode: standard chess against Stockfish, purely to help the player improve.
   - Stockfish (lite, single-threaded WASM) runs in a Web Worker from ./stockfish/ and does BOTH jobs: it plays the bot's moves
     (weakened to the chosen Elo) and analyses every position (full strength) for the eval bar, hints and move ratings.
   - The existing Engine (standard rules) supplies legal moves, check / mate / stalemate and the UI board.
   - Every help is its own switch (changeable at any time): ratings, eval bar, hints, takebacks, explanations, opening names, hanging-piece warnings.
     Analysis keeps running in the background either way, so switching a help on mid-game instantly shows everything so far.
   Move ratings follow Chess.com's published expected-points table (Best 0, Excellent <=.02, Good <=.05, Inaccuracy <=.10, Mistake <=.20, Blunder above).
   Brilliant / Great are deliberately STRICT (the high-rated version of Chess.com's rules) at every Elo. */
const Practice = (() => {
  'use strict';
  const SF_PATH = 'stockfish/stockfish-19-lite-single.js';
  const PREF_KEY = 'practicePrefs';
  const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  const FILES = 'abcdefgh';
  const RATE = {
    brilliant: { sym: '!!', col: '#1baca6', name: 'Brilliant' }, great: { sym: '!', col: '#5c8bb0', name: 'Great' },
    best: { sym: '★', col: '#7fa650', name: 'Best' }, excellent: { sym: '✓', col: '#96bc4b', name: 'Excellent' },
    good: { sym: '✓', col: '#97af8b', name: 'Good' }, inaccuracy: { sym: '?!', col: '#f7c631', name: 'Inaccuracy' },
    mistake: { sym: '?', col: '#e58f2a', name: 'Mistake' }, miss: { sym: '✕', col: '#ff7769', name: 'Miss' },
    blunder: { sym: '??', col: '#ca3431', name: 'Blunder' }, book: { sym: '📖', col: '#a88865', name: 'Book' }
  };
  const PRESETS = [['Beginner', 600], ['Casual', 1000], ['Improver', 1400], ['Club', 1800], ['Strong', 2200], ['Max', 3200]];
  let E = null, glyph = null, onExit = null, root = null, built = false, ask = m => Promise.resolve(window.confirm(m));
  const HELPS = [['ratings', 'Move ratings'], ['bar', 'Evaluation bar'], ['hint', 'Hints (💡 button)'], ['takeback', 'Take backs'], ['explain', 'Explain mistakes (best move + why)'], ['opening', 'Opening names'], ['warn', 'Warn about my hanging pieces'], ['free', 'Show the opponent’s hanging pieces']];
  let prefs = { elo: 1000, pick: 'w', clock: null, help: { ratings: true, bar: true, hint: true, takeback: true, explain: true, opening: true, warn: true, free: false } };
  try { const o = JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); if (o.elo) prefs.elo = o.elo; if (o.pick) prefs.pick = o.pick; if (o.help) Object.assign(prefs.help, o.help); if (o.clock) prefs.clock = o.clock; } catch (e) { /* no storage: fine */ }
  const H = k => !!prefs.help[k];
  const savePrefs = () => { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (e) { /* ignore */ } };

  // ====================== Stockfish wrapper (one worker, serial commands) ======================
  const SF = (() => {
    let w = null, ready = null, cur = null, chain = Promise.resolve();
    const onLine = l => { if (cur && cur.line(l)) { const c = cur; cur = null; c.done(); } };
    function start() {
      if (ready) return ready;
      ready = new Promise((res, rej) => {
        try { w = new Worker(SF_PATH); } catch (e) { rej(new Error('Could not start the Stockfish worker. Practice mode must be opened from the website (or a local web server), not directly from a file.')); return; }
        w.onerror = () => rej(new Error('Stockfish failed to load. Check that the "stockfish" folder sits next to index.html.'));
        w.onmessage = ev => onLine(String(ev.data));
        run(['uci'], l => l.startsWith('uciok')).then(() => run(['isready'], l => l.startsWith('readyok'))).then(res, rej);
      });
      return ready;
    }
    // run(cmds, isDone) -> resolves with every output line once isDone(line) is true
    function run(cmds, isDone) {
      const p = chain.then(() => new Promise(resolve => {
        const out = [];
        cur = { line: l => { out.push(l); return isDone(l); }, done: () => resolve(out) };
        cmds.forEach(c => w.postMessage(c));
      }));
      chain = p.catch(() => { });
      return p;
    }
    // search a position (UCI move list from the start). opts: multipv, depth | movetime, elo (null = full strength)
    function search(moves, o) {
      const cmds = ['setoption name MultiPV value ' + (o.multipv || 1)];
      if (o.elo) cmds.push('setoption name UCI_LimitStrength value true', 'setoption name UCI_Elo value ' + o.elo);
      else cmds.push('setoption name UCI_LimitStrength value false');
      cmds.push('position startpos' + (moves.length ? ' moves ' + moves.join(' ') : ''));
      cmds.push((o.depth ? 'go depth ' + o.depth : 'go movetime ' + (o.movetime || 300)) + (o.searchmoves && o.searchmoves.length ? ' searchmoves ' + o.searchmoves.join(' ') : ''));
      const stmWhite = moves.length % 2 === 0;
      return start().then(() => run(cmds, l => l.startsWith('bestmove'))).then(out => {
        const best = {}; let bm = null;
        out.forEach(l => {
          if (l.startsWith('bestmove')) { bm = l.split(' ')[1]; return; }
          if (!l.startsWith('info') || l.indexOf(' score ') < 0 || l.indexOf(' pv ') < 0) return;
          const mp = +((l.match(/ multipv (\d+)/) || [0, 1])[1]), sc = l.match(/ score (cp|mate) (-?\d+)/), pv = l.split(' pv ')[1].trim().split(/\s+/);
          if (!sc) return;
          let v = sc[1] === 'cp' ? +sc[2] : (+sc[2] > 0 ? 10000 - +sc[2] : -10000 - +sc[2]);      // score for the side to move (mate in n -> +-10000)
          best[mp] = { mpv: mp, stm: v, cp: stmWhite ? v : -v, mate: sc[1] === 'mate' ? (stmWhite ? +sc[2] : -sc[2]) : null, pv };
        });
        const lines = Object.keys(best).map(k => best[k]).sort((a, b) => a.mpv - b.mpv);
        return { lines, best: bm };
      });
    }
    return { start, search, stop: () => { if (w && cur) w.postMessage('stop'); } };
  })();

  // ====================== small chess helpers (on top of Engine) ======================
  const newGame = () => E.create(E.STANDARD);
  const uciOf = m => FILES[m.fx] + (m.fy + 1) + FILES[m.tx] + (m.ty + 1) + (m.promo || '');
  function findUci(g, u) {
    const fx = FILES.indexOf(u[0]), fy = +u[1] - 1, tx = FILES.indexOf(u[2]), ty = +u[3] - 1, pr = u[4] || null;
    return g.moves(fx, fy).find(m => m.tx === tx && m.ty === ty && (m.promo || null) === pr) || null;
  }
  function material(g, c) { let s = 0; for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const p = g.at(x, y); if (p) s += (p.c === c ? 1 : -1) * (VAL[p.t] || 0); } return s; }
  function sanOf(g, m) {
    const p = g.at(m.fx, m.fy), t = p.t, tgt = g.at(m.tx, m.ty), cap = !!tgt || (t === 'p' && m.fx !== m.tx), sq = FILES[m.tx] + (m.ty + 1);
    if (t === 'k' && Math.abs(m.tx - m.fx) === 2) return m.tx > m.fx ? 'O-O' : 'O-O-O';
    let s = '';
    if (t === 'p') { if (cap) s += FILES[m.fx] + 'x'; s += sq; if (m.promo) s += '=' + m.promo.toUpperCase(); return s; }
    s = t.toUpperCase();
    const others = [];
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const q = g.at(x, y);
      if (q && q.c === p.c && q.t === t && (x !== m.fx || y !== m.fy) && g.moves(x, y).some(z => z.tx === m.tx && z.ty === m.ty)) others.push([x, y]);
    }
    if (others.length) { if (!others.some(o => o[0] === m.fx)) s += FILES[m.fx]; else if (!others.some(o => o[1] === m.fy)) s += (m.fy + 1); else s += FILES[m.fx] + (m.fy + 1); }
    return s + (cap ? 'x' : '') + sq;
  }
  function posKey(g) {      // placement + side to move + castling-relevant "has moved" flags (good enough for threefold repetition)
    let k = g.turn;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const p = g.at(x, y); k += p ? p.c + p.t + ((p.t === 'k' || p.t === 'r') && p.m ? 'm' : '') : '.'; }
    return k;
  }
  const wpOf = cp => 1 / (1 + Math.exp(-0.00368208 * Math.max(-3000, Math.min(3000, cp))));      // winning chances 0..1 from a centipawn score (Lichess curve)
  const fmtEval = l => l.mate != null ? (l.mate > 0 ? 'M' : '-M') + Math.abs(l.mate) : (l.cp >= 0 ? '+' : '−') + (Math.abs(l.cp) / 100).toFixed(1);


  // ====================== opening book (names for the most common lines; a move that stays inside it is rated "Book") ======================
  const BOOK_TXT = `King's Pawn Opening|e4
Sicilian Defense|e4 c5
Sicilian Defense: Alapin Variation|e4 c5 c3
Sicilian Defense: Closed|e4 c5 Nc3
Sicilian Defense: Open|e4 c5 Nf3
Sicilian Defense: Old Sicilian|e4 c5 Nf3 Nc6
Sicilian Defense: Najdorf Variation|e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6
Sicilian Defense: Dragon Variation|e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6
French Defense|e4 e6
French Defense: Normal Variation|e4 e6 d4 d5
French Defense: Winawer Variation|e4 e6 d4 d5 Nc3 Bb4
French Defense: Classical Variation|e4 e6 d4 d5 Nc3 Nf6
French Defense: Advance Variation|e4 e6 d4 d5 e5
French Defense: Exchange Variation|e4 e6 d4 d5 exd5
French Defense: Tarrasch Variation|e4 e6 d4 d5 Nd2
Caro-Kann Defense|e4 c6
Caro-Kann Defense: Main Line|e4 c6 d4 d5
Caro-Kann Defense: Advance Variation|e4 c6 d4 d5 e5
Caro-Kann Defense: Exchange Variation|e4 c6 d4 d5 exd5 cxd5
Caro-Kann Defense: Classical Variation|e4 c6 d4 d5 Nc3 dxe4 Nxe4
Scandinavian Defense|e4 d5
Scandinavian Defense: Main Line|e4 d5 exd5 Qxd5
Pirc Defense|e4 d6 d4 Nf6 Nc3 g6
Alekhine's Defense|e4 Nf6
Modern Defense|e4 g6
Nimzowitsch Defense|e4 Nc6
Owen's Defense|e4 b6
King's Pawn Game|e4 e5
King's Gambit|e4 e5 f4
King's Gambit Accepted|e4 e5 f4 exf4
Center Game|e4 e5 d4
Vienna Game|e4 e5 Nc3
Bishop's Opening|e4 e5 Bc4
King's Knight Opening|e4 e5 Nf3
Latvian Gambit|e4 e5 Nf3 f5
Philidor Defense|e4 e5 Nf3 d6
Petrov's Defense|e4 e5 Nf3 Nf6
Petrov's Defense: Classical Attack|e4 e5 Nf3 Nf6 Nxe5 d6 Nf3 Nxe4
Three Knights Game|e4 e5 Nf3 Nc6 Nc3
Four Knights Game|e4 e5 Nf3 Nc6 Nc3 Nf6
Ponziani Opening|e4 e5 Nf3 Nc6 c3
Scotch Game|e4 e5 Nf3 Nc6 d4
Scotch Game: Main Line|e4 e5 Nf3 Nc6 d4 exd4 Nxd4
Italian Game|e4 e5 Nf3 Nc6 Bc4
Italian Game: Giuoco Piano|e4 e5 Nf3 Nc6 Bc4 Bc5
Evans Gambit|e4 e5 Nf3 Nc6 Bc4 Bc5 b4
Italian Game: Two Knights Defense|e4 e5 Nf3 Nc6 Bc4 Nf6
Ruy Lopez|e4 e5 Nf3 Nc6 Bb5
Ruy Lopez: Morphy Defense|e4 e5 Nf3 Nc6 Bb5 a6
Ruy Lopez: Berlin Defense|e4 e5 Nf3 Nc6 Bb5 Nf6
Ruy Lopez: Exchange Variation|e4 e5 Nf3 Nc6 Bb5 a6 Bxc6
Ruy Lopez: Closed|e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7
Queen's Pawn Opening|d4
Queen's Pawn Game: London System|d4 d5 Bf4
London System|d4 Nf6 Bf4
Queen's Pawn Game|d4 d5
Queen's Gambit|d4 d5 c4
Queen's Gambit Accepted|d4 d5 c4 dxc4
Queen's Gambit Declined|d4 d5 c4 e6
Queen's Gambit Declined: Orthodox Defense|d4 d5 c4 e6 Nc3 Nf6 Bg5 Be7
Slav Defense|d4 d5 c4 c6
Indian Defense|d4 Nf6
Trompowsky Attack|d4 Nf6 Bg5
Indian Defense: Normal|d4 Nf6 c4
Catalan Opening|d4 Nf6 c4 e6 g3
Nimzo-Indian Defense|d4 Nf6 c4 e6 Nc3 Bb4
Queen's Indian Defense|d4 Nf6 c4 e6 Nf3 b6
Benoni Defense|d4 Nf6 c4 c5 d5
King's Indian Defense|d4 Nf6 c4 g6
King's Indian Defense: Classical|d4 Nf6 c4 g6 Nc3 Bg7 e4 d6
Grünfeld Defense|d4 Nf6 c4 g6 Nc3 d5
Dutch Defense|d4 f5
English Opening|c4
English Opening: Symmetrical|c4 c5
English Opening: Reversed Sicilian|c4 e5
Réti Opening|Nf3
Réti Opening: Main Line|Nf3 d5 c4
Bird's Opening|f4
Larsen's Opening|b3
Zukertort Opening|Nf3 Nf6
Zukertort: Queen's Pawn Lines|Nf3 d5 d4
King's Indian Attack|Nf3 d5 g3`;
  const BOOK = new Map(); BOOK_TXT.split('\n').forEach(l => { const i = l.lastIndexOf('|'); BOOK.set(l.slice(i + 1), l.slice(0, i)); });
  const sanKey = n => S.moves.slice(0, n).map(m => m.san.replace(/[+#]/g, '')).join(' ');
  const inBook = n => n > 0 && BOOK.has(sanKey(n));
  function openingAt(n) { for (let i = n; i > 0; i--) { const k = sanKey(i); if (BOOK.has(k)) return BOOK.get(k); } return null; }

  // ====================== session ======================
  let S = null;      // current game
  let sid = 0;
  function startSession(elo, pick) {
    const human = pick === 'r' ? (Math.random() < 0.5 ? 'w' : 'b') : pick;
    const tc = prefs.clock ? { base: Math.round(prefs.clock.base * 60000), inc: Math.round((prefs.clock.inc || 0) * 1000) } : null;      // optional time control (off by default)
    S = { id: ++sid, elo, human, both: false, game: newGame(), moves: [], ana: [], rate: [], over: null, sel: null, hint: null, busy: false, pendingPromo: null, thinking: false, keys: [], clocks: [0], msg: '', tc, t: tc ? { w: tc.base, b: tc.base } : null, tsnap: tc ? [{ w: tc.base, b: tc.base }] : null, tlast: performance.now() };
    S.keys.push(posKey(S.game)); S.ana[0] = null;
    startTicker(); paintAll(); requestAna(0); botMaybe();
  }
  const botTurn = () => S && !S.over && !S.both && S.game.turn !== S.human;
  const mine = c => !!S && (S.both || c === S.human);      // do ratings / review apply to this colour's moves?

  // ---------- clocks (only when a time control was chosen) ----------
  let ticker = null;
  function startTicker() { stopTicker(); ticker = setInterval(tick, 200); }
  function stopTicker() { if (ticker) { clearInterval(ticker); ticker = null; } }
  const remaining = c => S.t[c] - (S.game.turn === c && !S.over ? performance.now() - S.tlast : 0);
  function tick() {
    if (!S || !S.tc || S.over || S.imported) return;
    const c = S.game.turn;
    if (remaining(c) <= 0) {
      S.t[c] = 0; S.over = { text: (c === 'w' ? 'White' : 'Black') + ' ran out of time', win: c === 'w' ? 'b' : 'w', time: true };
      S.thinking = false; SF.stop(); S.view = null; for (let i = 0; i <= S.moves.length; i++) requestAna(i); paintAll(); return;
    }
    paintClocks();
  }
  const fmtClock = ms => { ms = Math.max(0, ms); const s = ms / 1000; if (s < 10) return '0:0' + s.toFixed(1); const m = Math.floor(s / 60), r = Math.floor(s % 60); return m + ':' + (r < 10 ? '0' : '') + r; };
  function paintClocks() { if (!root || !S || !S.tc) return; root.querySelectorAll('.prclk').forEach(d => { const c = d.dataset.c; d.textContent = fmtClock(remaining(c)); d.classList.toggle('run', !S.over && S.game.turn === c); d.classList.toggle('low', remaining(c) < 10000); }); }
  const gameAt = n => { const g = newGame(); for (let i = 0; i < n; i++) g.move(S.moves[i].m); return g; };


  // ====================== hanging pieces / threats ======================
  function cloneWith(g, mut, toMove) {      // a copy of the board (castling and en passant forgotten) with `toMove` to play, after optional edits mut(rows)
    const rows = []; for (let y = 7; y >= 0; y--) { const r = []; for (let x = 0; x < 8; x++) { const q = g.at(x, y); r.push(q ? (q.c === 'w' ? q.t.toUpperCase() : q.t) : '.'); } rows.push(r); }
    if (mut) mut(rows);
    return E.create(Object.assign({}, E.STANDARD, { setup: rows.map(r => r.join('')), castling: false, first: toMove }));
  }
  const rowSet = (rows, x, y, ch) => { rows[7 - y][x] = ch; };
  function hangingOf(g, X) {      // squares of X's pieces (not kings) that the opponent can win material on: attacked and undefended, or attacked by something cheaper
    const O = X === 'w' ? 'b' : 'w', key = posKey(g) + '|' + X; if (hangCache.has(key)) return hangCache.get(key);
    const out = [];
    try {
      const gg = g.turn === O ? g : cloneWith(g, null, O), hit = new Map();
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
        const q = gg.at(x, y); if (!q || q.c !== O) continue;
        gg.moves(x, y).forEach(m => { const t = gg.at(m.tx, m.ty); if (t && t.c === X && t.t !== 'k') { const k = m.tx + ',' + m.ty, v = VAL[q.t === 'k' ? 'p' : q.t]; const cur = hit.get(k); if (!cur || v < cur.v) hit.set(k, { v, from: [x, y], at: q.t, tx: m.tx, ty: m.ty, tt: t.t }); } });
      }
      hit.forEach(h => {
        let defended = false;
        const g2 = cloneWith(gg, rows => { rowSet(rows, h.from[0], h.from[1], '.'); rowSet(rows, h.tx, h.ty, X === 'w' ? h.at : h.at.toUpperCase()); }, X);      // (the capturer now stands on the target; can X take it back?)
        for (let y = 0; y < 8 && !defended; y++) for (let x = 0; x < 8 && !defended; x++) { const q = g2.at(x, y); if (q && q.c === X && g2.moves(x, y).some(m => m.tx === h.tx && m.ty === h.ty)) defended = true; }
        if (!defended || h.v < VAL[h.tt]) out.push([h.tx, h.ty]);
      });
    } catch (e) { /* ignore: warnings are only a bonus */ }
    hangCache.set(key, out); if (hangCache.size > 300) hangCache.clear();
    return out;
  }
  const hangCache = new Map();

  // ====================== "why" text, accuracy, review ======================
  const pname = t => ({ p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' }[t] || 'piece');
  function whyText(k, rt) {      // short template explanations (no deep chess understanding: engine facts only)
    const A = S.ana[k], B = S.ana[k + 1]; if (!A || !B) return '';
    const mover = S.moves[k].c, white = mover === 'w', bm = A.lines[0].pv[0] && findUciIn(k, A.lines[0].pv[0]);
    const mateFor = l => l && l.mate != null && ((l.mate > 0) === white);
    if (B.lines[0].mate != null && !mateFor(B.lines[0])) return 'This allows checkmate in ' + Math.abs(B.lines[0].mate) + '.';
    if (A.lines[0].mate != null && mateFor(A.lines[0]) && rt !== 'best') return 'You had a forced checkmate in ' + Math.abs(A.lines[0].mate) + (bm ? ' (' + bm + ')' : '') + '.';
    try {
      const g = gameAt(k + 1), pv = B.lines[0].pv, u = pv[0], m = u && findUci(g, u), t = m && g.at(m.tx, m.ty);
      if (m && t && t.c === mover && t.t !== 'k') {
        const M0 = material(gameAt(k), mover); g.move(m); const g3 = g, m1 = pv[1] && findUci(g3, pv[1]); if (m1) g3.move(m1);
        if (material(g3, mover) - M0 <= -2) return 'This loses your ' + pname(t.t) + '.';
      }
      const g0 = gameAt(k), b0 = A.lines[0].pv[0] && findUci(g0, A.lines[0].pv[0]), tt = b0 && g0.at(b0.tx, b0.ty);
      if (tt && VAL[tt.t] >= 3 && ['mistake', 'blunder', 'miss'].includes(rt)) return 'You could have won a ' + pname(tt.t) + ' with ' + bm + '.';
    } catch (e) { /* fall through */ }
    return '';      // (no specific reason found: the feedback line already names the best move)
  }
  const accOf = d => Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * d * 100) - 3.1669));      // accuracy of one move from the expected points it lost
  function reviewStats(c) {
    let n = 0, sum = 0; const cnt = {};
    S.moves.forEach((m, k) => { if (m.c !== c) return; const L = lossOf(k); if (!L) return; n++; sum += accOf(L.loss); const r = S.rate[k]; if (r) cnt[r] = (cnt[r] || 0) + 1; });
    return { n, acc: n ? sum / n : null, cnt };
  }
  const allAnalysed = () => S.moves.every((m, k) => S.ana[k] && S.ana[k + 1]) && !!S.ana[S.moves.length];
  const vply = () => (S.view == null ? S.moves.length : S.view);
  function vgame() { if (S.view == null) return S.game; if (!S._vg || S._vg.n !== S.view) S._vg = { n: S.view, g: gameAt(S.view) }; return S._vg.g; }
  const RETRY_CLS = ['miss', 'mistake', 'blunder'];
  const retryList = () => S.moves.map((m, k) => k).filter(k => mine(S.moves[k].c) && RETRY_CLS.includes(S.rate[k]));
  function startRetry(k) { S.retry = { k, tries: 0, shown: false, last: null, solved: false, note: '' }; S.view = k; S.viewBest = false; S.sel = null; S.hint = null; paintAll(); }
  function stopRetry() { S.retry = null; goView(S.moves.length); }
  function retryMove(m) {      // no limit: try as many moves as you like, even after finding the engine's choice
    const rt = S.retry, A = S.ana[rt.k]; S.sel = null;
    if (!A) { rt.note = 'Still analysing, try again in a moment.'; paintAll(); return; }
    const white = rt.k % 2 === 0, pw = c => (white ? wpOf(c) : 1 - wpOf(c)), best = pw(A.lines[0].cp);
    const good = A.lines.filter(l => best - pw(l.cp) <= 0.02).map(l => l.pv[0]), ok = good.includes(uciOf(m));
    rt.tries++; rt.note = ''; rt.last = { san: sanOf(vgame(), m), ok }; if (ok) rt.solved = true;
    paintAll();
  }
  function goView(n, best) { S.retry = null; n = Math.max(0, Math.min(S.moves.length, n)); S.view = n === S.moves.length ? null : n; S.viewBest = !!best && S.view != null; S.sel = null; paintAll(); }

  // ---------- analysis ----------
  function requestAna(i) {
    const s = S; if (!s || s.ana[i] || s.anaQ && s.anaQ.has(i)) return;
    (s.anaQ = s.anaQ || new Set()).add(i);
    const terminal = i === s.moves.length ? s.over : null;
    if (i === s.moves.length && s.over && (s.over.mate || s.over.rule)) { s.ana[i] = termAna(s.over, i); s.anaQ.delete(i); onAna(); return; }
    SF.search(s.moves.slice(0, i).map(x => uciOf(x.m)), { multipv: s.both || (i % 2 === 0) === (s.human === 'w') ? 3 : 1, depth: 12 }).then(r => {
      s.anaQ.delete(i); if (S !== s || !r.lines.length) return;
      s.ana[i] = { lines: r.lines }; onAna();
    }).catch(fail);
  }
  function termAna(over, i) { const cp = over.win === 'w' ? 10000 : over.win === 'b' ? -10000 : 0; return { lines: [{ mpv: 1, stm: 0, cp, mate: null, pv: [] }], term: true, res: over.win === 'w' ? '1–0' : over.win === 'b' ? '0–1' : '½–½' }; }
  function onAna() {
    if (!S) return;
    for (let k = 0; k < S.moves.length; k++) if (S.rate[k] === undefined && S.ana[k] && S.ana[k + 1]) S.rate[k] = classify(k);
    paintAll();
  }

  // ---------- move rating ----------
  function lossOf(k, from) {      // expected points lost by the move at ply k (mover's point of view); null if not analysed yet
    const A = S.ana[k], B = S.ana[k + 1]; if (!A || !B) return null;
    const white = k % 2 === 0, pw = c => (white ? wpOf(c) : 1 - wpOf(c)), mv = uciOf(S.moves[k].m);
    const best = pw(A.lines[0].cp), mine = A.lines.find(l => l.pv[0] === mv);
    const after = mine ? pw(mine.cp) : pw(B.lines[0].cp);
    return { best, after, loss: Math.max(0, best - after), isBest: A.lines[0].pv[0] === mv, white, mine };
  }
  function classify(k) {
    const L = lossOf(k); if (!L) return undefined;
    if (inBook(k + 1)) return 'book';
    const A = S.ana[k], B = S.ana[k + 1], pw = c => (L.white ? wpOf(c) : 1 - wpOf(c));
    let cls;
    if (L.isBest || L.loss <= 0.0005) cls = 'best';
    else if (L.loss <= 0.02) cls = 'excellent'; else if (L.loss <= 0.05) cls = 'good';
    else if (L.loss <= 0.10) cls = 'inaccuracy'; else if (L.loss <= 0.20) cls = 'mistake'; else cls = 'blunder';
    if (cls === 'best' || cls === 'excellent') {
      const alt = A.lines.filter(l => l.pv[0] !== uciOf(S.moves[k].m))[0];
      const altWp = alt ? pw(alt.cp) : null;
      // BRILLIANT (strict): (nearly) the best move + a real piece sacrifice, not worse afterwards, and NOT already completely winning without it
      if (altWp != null && L.after >= 0.45 && altWp < 0.85 && isSacrifice(k)) verifyBrilliant(k);      // (cheap tests passed: confirm asynchronously by forcing the engine to ACCEPT the sacrifice; a forced win after it is fine, what must not be true is that the best alternative was already winning)
      // GREAT: the only good move - every alternative loses a lot, yet the position isn't a trivial win
      else if (cls === 'best' && altWp != null && L.best - altWp >= 0.20 && L.best < 0.92 && L.best > 0.15 && !isRecapture(k)) cls = 'great';
    } else if ((cls === 'inaccuracy' || cls === 'mistake') && k > 0 && S.ana[k - 1]) {      // MISS: the opponent just slipped and you let the win go
      const P = lossOf(k - 1);
      if (P && P.loss >= 0.10 && L.best >= 0.7 && L.after <= L.best - 0.10) cls = 'miss';
    }
    return cls;
  }
  function isRecapture(k) { const m = S.moves[k].m, pm = k > 0 ? S.moves[k - 1].m : null; return !!pm && pm.tx === m.tx && pm.ty === m.ty; }
  function verifyBrilliant(k) {      // force Stockfish to take the offered piece; it is only a sacrifice if you are still >= 2 points down a few moves later AND still doing fine
    const s = S, c = s.moves[k].c;
    try {
      const g0 = gameAt(k), g1 = gameAt(k + 1), before = new Set(hangingOf(g0, c).map(q => q.join(',')));
      const offered = new Set(hangingOf(g1, c).filter(q => { const t = g1.at(q[0], q[1]); return t && VAL[t.t] >= 3 && !before.has(q.join(',')); }).map(q => q.join(',')));
      const M0 = material(g0, c), groups = [...offered].map(sq => { const caps = []; for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const q = g1.at(x, y); if (q && q.c !== c) g1.moves(x, y).forEach(m => { if (m.tx + ',' + m.ty === sq) caps.push(uciOf(m)); }); } return caps; }).filter(c2 => c2.length);
      const base = s.moves.slice(0, k + 1).map(x => uciOf(x.m));
      let chain = Promise.resolve(false);      // try each offered piece in turn: the move is brilliant if ACCEPTING any one of the offers leaves you >= 2 points down a few moves later while still doing fine
      groups.forEach(caps => { chain = chain.then(done => done ? true : SF.search(base, { multipv: 1, depth: 12, searchmoves: caps }).then(r => {
        if (S !== s || !r.lines.length) return false;
        const l = r.lines[0], g = gameAt(k + 1); let ok = true;
        for (const u of l.pv.slice(0, 5)) { const m = findUci(g, u); if (!m || !g.move(m)) { ok = false; break; } }
        const wpMover = c === 'w' ? wpOf(l.cp) : 1 - wpOf(l.cp);
        return ok && material(g, c) - M0 <= -2 && wpMover >= 0.45;
      })); });
      chain.then(yes => { if (yes && S === s && s.rate[k] && ['best', 'excellent'].includes(s.rate[k])) { s.rate[k] = 'brilliant'; paintAll(); } }).catch(() => { });
    } catch (e) { /* no upgrade */ }
  }
  function isSacrifice(k) {      // the move leaves a piece worth 3+ en prise that was NOT en prise before it (attacked and undefended, or attacked by something cheaper) - and the engine still rates the move (nearly) best
    try {
      const c = S.moves[k].c, g0 = gameAt(k), g1 = gameAt(k + 1), before = new Set(hangingOf(g0, c).map(q => q.join(',')));
      return hangingOf(g1, c).some(q => { const t = g1.at(q[0], q[1]); return t && VAL[t.t] >= 3 && !before.has(q.join(',')); });
    } catch (e) { return false; }
  }

  // ---------- playing ----------
  function applyMove(m) {      // m = a legal move object of the current position; records it, detects the end of the game
    const g = S.game, c = g.turn, p = g.at(m.fx, m.fy), cap = !!g.at(m.tx, m.ty) || (p.t === 'p' && m.fx !== m.tx);
    let san = sanOf(g, m); const mm = { fx: m.fx, fy: m.fy, tx: m.tx, ty: m.ty, promo: m.promo };
    if (!g.move(mm)) return false;
    const st = g.status(); san += st === 'checkmate' ? '#' : st === 'check' ? '+' : '';
    S.moves.push({ m: mm, c, san, t: p.t });
    if (S.tc && !S.imported) { const now = performance.now(); S.t[c] = S.t[c] - (now - S.tlast) + S.tc.inc; S.tlast = now; S.tsnap[S.moves.length] = { w: S.t.w, b: S.t.b }; }
    S.clocks.push(cap || p.t === 'p' ? 0 : S.clocks[S.clocks.length - 1] + 1);
    const key = posKey(g); S.keys.push(key); S.ana.length = S.moves.length + 1;
    S.sel = null; S.hint = null;
    if (st === 'checkmate') S.over = { text: 'Checkmate — ' + (c === 'w' ? 'White' : 'Black') + ' wins', win: c, mate: true };
    else if (st === 'stalemate') S.over = { text: 'Stalemate — draw', win: null, rule: true };
    else if (st === 'draw') S.over = { text: 'Draw (insufficient material)', win: null, rule: true };
    else if (S.keys.filter(k => k === key).length >= 3) S.over = { text: 'Draw by threefold repetition', win: null, rule: true };
    else if (S.clocks[S.clocks.length - 1] >= 100) S.over = { text: 'Draw by the fifty-move rule', win: null, rule: true };
    return true;
  }
  function humanMove(m) {
    if (!S || S.over || botTurn() || S.thinking) return;
    if (!applyMove(m)) return;
    afterMove();
  }
  function afterMove() {
    if (S.over) for (let i = 0; i <= S.moves.length; i++) requestAna(i);      // the review needs every position analysed
    requestAna(S.moves.length);
    paintAll();
    botMaybe();
  }
  function botMaybe() {
    const s = S; if (!botTurn() || s.thinking) return;
    s.thinking = true; paintAll();
    const mv = s.moves.map(x => uciOf(x.m)), elo = s.elo;
    const low = elo < 1320, max = elo >= 3190;
    const botC = s.game.turn, cap = s.tc ? Math.max(40, remaining(botC) / 25) : 1e9;      // with a clock, never think for more than ~1/25 of the time left
    const job = low ? SF.search(mv, { multipv: 5, depth: s.tc && cap < 150 ? 4 : 7, elo: 1320 })
      : SF.search(mv, { multipv: 1, movetime: Math.round(Math.min(cap, max ? 1000 : elo >= 2000 ? 600 : 300)), elo: max ? null : elo });
    job.then(r => {
      if (S !== s || !s.thinking) return;
      let u = r.best;
      if (low && r.lines.length) u = pickWeak(r.lines, elo) || u;
      const m = u && findUci(s.game, u);
      s.thinking = false;
      if (!m) { s.msg = 'Stockfish returned no move.'; paintAll(); return; }
      applyMove(m); afterMove();
    }).catch(fail);
  }
  function pickWeak(lines, elo) {      // below Stockfish's own Elo floor (1320): look at its top lines and sometimes pick a worse one, more often the lower the Elo
    const t = Math.max(0, Math.min(1, (1320 - elo) / 920));      // 0 at 1320 .. 1 at 400
    const T = 70 + 280 * t, bl = 0.32 * t * t + 0.06 * t;      // softness (centipawns) and extra chance of a plain "random one of the top lines"
    const top = lines[0].stm;
    if (Math.random() < bl) return lines[Math.floor(Math.random() * lines.length)].pv[0];
    const w = lines.map(l => Math.exp(-(Math.max(-1500, top) - Math.max(-1500, Math.min(l.stm, top + 1500))) / T));
    let r = Math.random() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < lines.length; i++) { r -= w[i]; if (r <= 0) return lines[i].pv[0]; }
    return lines[0].pv[0];
  }
  function rewindTo(n) {      // go back to the position after n plies and play on from there (used by Take back and "Play from here")
    const s = S; n = Math.max(0, Math.min(s.moves.length, n));
    s.view = null; s.viewBest = false; s.retry = null; s.thinking = false; s.imported = false; SF.stop();
    s.moves.length = n; s.keys.length = n + 1; s.clocks.length = n + 1; s.ana.length = n + 1; s.rate.length = n; s.anaQ = new Set(); s._vg = null;
    s.game = gameAt(n); s.over = null; s.sel = null; s.hint = null; s.msg = ''; s.pendingPromo = null;
    if (s.tc) { const t = s.tsnap[n] || s.tsnap[s.tsnap.length - 1]; s.t = { w: t.w, b: t.b }; s.tsnap.length = n + 1; s.tlast = performance.now(); }
    for (let i = 0; i <= n; i++) requestAna(i);
    paintAll(); botMaybe();
  }
  function takeback() {
    if (!S || !H('takeback') || S.both || !S.moves.length) return;
    const s = S, n = s.over ? s.moves.length - (s.moves[s.moves.length - 1].c === s.human ? 1 : 2)      // game ended: undo down to your last move
      : s.game.turn === s.human ? s.moves.length - 2 : s.moves.length - 1;      // bot already replied -> undo 2 plies; still thinking -> undo 1
    rewindTo(n);
  }
  function playFromHere() {      // from any earlier position you are looking at: throw away the rest and play on (the bot moves if it is its turn)
    if (!S || !H('takeback') || S.both || S.view == null) return;
    rewindTo(S.view);
  }
  function resign() { if (!S || S.over) return; S.over = { text: 'You resigned', win: S.human === 'w' ? 'b' : 'w' }; S.thinking = false; SF.stop(); for (let i = 0; i <= S.moves.length; i++) requestAna(i); paintAll(); }
  function fail(e) { if (S) { S.thinking = false; S.msg = (e && e.message) || 'Stockfish error'; } paintAll(); }

  // ====================== UI ======================
  const el = (tag, cls, html) => { const d = document.createElement(tag); if (cls) d.className = cls; if (html != null) d.innerHTML = html; return d; };
  const css = `
  #practice { max-width:980px; margin:0 auto; }
  #practice .prrow { display:flex; flex-wrap:wrap; gap:14px; align-items:flex-start; }
  #practice .prleft { display:flex; gap:6px; flex:1 1 360px; max-width:600px; min-width:260px; }
  #practice .prbar { width:34px; flex:none; background:#1b1a18; border:2px solid #111; position:relative; border-radius:3px; overflow:hidden; }
  #practice .prbar .wf { position:absolute; left:0; right:0; background:#eee; transition:height .35s; }
  #practice .prbar span { position:absolute; left:0; right:0; font-size:.6rem; white-space:nowrap; text-align:center; font-weight:bold; }
  #practice .prboard { flex:1; display:grid; grid-template-columns:repeat(8,minmax(0,1fr)); grid-auto-rows:minmax(0,1fr); aspect-ratio:1; border:2px solid #111; box-sizing:border-box; }
  #practice .sq.pbest { box-shadow:inset 0 0 0 4px #3fbf5f; }
  #practice .badge { position:absolute; top:1px; right:1px; z-index:3; min-width:1.35em; height:1.35em; border-radius:50%; font-size:.5em; font-weight:bold; display:flex; align-items:center; justify-content:center; color:#fff; box-shadow:0 0 2px #000; padding:0 2px; box-sizing:border-box; }
  #practice .prside { flex:1 1 280px; min-width:250px; }
  #practice .prcoach { background:#2c2926; border-radius:8px; padding:8px 10px; margin-bottom:8px; }
  #practice .prcoach label { display:block; margin:3px 0; font-size:.9rem; } #practice .prcoach label.dis { opacity:.45; }
  #practice .prsw { font-size:1rem; font-weight:bold; }
  #practice .prfb { min-height:2.6em; margin:6px 0; padding:6px 8px; background:#2c2926; border-radius:8px; font-size:.92rem; }
  #practice .prml { max-height:260px; overflow:auto; background:#2c2926; border-radius:8px; padding:6px 8px; font-size:.9rem; }
  #practice .prml div { display:grid; grid-template-columns:2.2em 1fr 1fr; gap:4px; } #practice .prml .mv { white-space:nowrap; }
  #practice .rt { display:inline-block; min-width:1.4em; text-align:center; border-radius:4px; font-size:.75em; font-weight:bold; color:#fff; padding:0 3px; margin-left:3px; }
  #practice .prset input[type=range] { width:min(420px,90%); padding:0; } #practice .prset .pre button { padding:6px 10px; font-size:.85rem; }
  #practice .prset .on { background:#4d6a30; outline:2px solid #aac07c; }
  #practice .prpro { display:flex; gap:6px; margin:6px 0; } #practice .prpro button { font-size:1.6rem; padding:2px 12px; background:#3a3733; }
  #practice .sq.pbad { box-shadow:inset 0 0 0 3px #e03030, inset 0 0 14px 2px rgba(224,48,48,.75); } #practice .sq.pfree { box-shadow:inset 0 0 0 3px #3fa0ff, inset 0 0 14px 2px rgba(63,160,255,.7); }
  #practice .prcoach summary { cursor:pointer; margin-bottom:4px; } #practice .prall button { padding:3px 10px; font-size:.8rem; background:#555; }
  #practice .prnav button { padding:4px 10px; font-size:.85rem; background:#3a3733; } #practice .prml .mv { cursor:pointer; } #practice .prml .mv.cur { background:#4a463f; border-radius:3px; }
  #practice .prrev { background:#2c2926; border-radius:8px; padding:8px 10px; margin:8px 0; font-size:.9rem; } #practice .prrev div { margin:3px 0; }
  #practice .prkey { cursor:pointer; padding:2px 4px; border-radius:4px; } #practice .prkey:hover { background:#3a3733; }
  #practice .prcol { flex:1; min-width:0; display:flex; flex-direction:column; gap:4px; } #practice .prcol .prboard { flex:none; width:100%; }
  #practice .prbw { display:flex; gap:6px; align-items:stretch; } #practice .prcol .prbw .prboard { flex:1; width:auto; min-width:0; }
  #practice .prclk { font-variant-numeric:tabular-nums; font-weight:bold; font-size:1.15rem; background:#2c2926; border-radius:6px; padding:3px 12px; align-self:flex-start; } #practice .prclk.run { background:#4d6a30; } #practice .prclk.low { color:#ff9a9a; }
  #practice textarea { width:100%; max-width:560px; min-height:170px; background:#1d1b19; color:inherit; border:1px solid #555; border-radius:6px; padding:8px; font-family:monospace; font-size:.85rem; box-sizing:border-box; }
  #practice .prerr { color:#ff9a9a; margin:6px 0; } #practice .prchips button { padding:5px 10px; font-size:.85rem; } #practice .prchips input { width:4.2em; padding:4px; }
  #practice .prbtn button { padding:7px 12px; font-size:.9rem; } #practice button:disabled { opacity:.4; cursor:default; }
  `;
  function build() {
    if (built) return; built = true;
    const st = el('style'); st.textContent = css; document.head.appendChild(st);
    new ResizeObserver(() => fit()).observe(root);
  }
  function fit() { const b = root.querySelector('.prboard'); if (b) b.style.fontSize = (b.clientWidth / 8 * 0.72) + 'px'; }

  function paintSetup() {
    root.innerHTML = '';
    const d = el('div', 'prset');
    d.appendChild(el('h2', null, 'Practice vs Stockfish'));
    d.appendChild(el('p', 'dim', 'Standard chess against Stockfish, only here to help you improve. During the game you can switch each help (ratings, evaluation bar, hints, …) on or off whenever you like.'));
    const eloBox = el('div'); const lab = el('div', null, ''); const rng = el('input'); rng.type = 'range'; rng.min = 400; rng.max = 3200; rng.step = 50; rng.value = prefs.elo;
    const upd = () => { prefs.elo = +rng.value; lab.innerHTML = 'Bot strength: <b>' + prefs.elo + ' Elo' + (prefs.elo >= 3200 ? ' (maximum: full strength)' : '') + '</b>'; pre.querySelectorAll('button').forEach(b => b.classList.toggle('on', +b.dataset.e === prefs.elo)); savePrefs(); };
    const pre = el('div', 'pre'); PRESETS.forEach(([n, e]) => { const b = el('button', null, n + ' (' + (e >= 3200 ? 'max' : e) + ')'); b.dataset.e = e; b.onclick = () => { rng.value = e; upd(); }; pre.appendChild(b); });
    rng.oninput = upd; eloBox.append(lab, rng, pre); d.appendChild(eloBox); upd();
    const col = el('div', null, '<p style="margin:12px 0 4px">You play:</p>');
    [['w', 'White'], ['b', 'Black'], ['r', 'Random']].forEach(([v, n]) => { const b = el('button', prefs.pick === v ? 'on' : '', n); b.onclick = () => { prefs.pick = v; savePrefs(); paintSetup(); }; col.appendChild(b); });
    d.appendChild(col);
    const ck = el('div', 'prchips', '<p style="margin:12px 0 4px">Clock <span class="dim">(optional, off by default):</span></p>');
    [[null, 'Off'], [[1, 0], '1+0'], [[3, 2], '3+2'], [[5, 0], '5+0'], [[10, 0], '10+0'], [[15, 10], '15+10']].forEach(([v, n]) => {
      const on = v ? !!prefs.clock && prefs.clock.base === v[0] && prefs.clock.inc === v[1] : !prefs.clock;
      const b = el('button', on ? 'on' : '', n); b.title = v ? v[0] + ' minute(s) each, +' + v[1] + ' s per move' : 'No clock'; b.onclick = () => { prefs.clock = v ? { base: v[0], inc: v[1] } : null; savePrefs(); paintSetup(); }; ck.appendChild(b);
    });
    const cm = el('input'), ci = el('input'); cm.type = ci.type = 'number'; cm.min = 0.1; cm.step = 0.5; ci.min = 0; ci.max = 60; cm.value = prefs.clock ? prefs.clock.base : ''; ci.value = prefs.clock ? prefs.clock.inc : '';
    const setCustom = () => { const m = parseFloat(cm.value), i = parseFloat(ci.value) || 0; prefs.clock = m > 0 ? { base: Math.min(180, m), inc: Math.max(0, Math.min(60, i)) } : null; savePrefs(); };
    cm.onchange = ci.onchange = () => { setCustom(); paintSetup(); };
    ck.append(document.createTextNode('  custom: '), cm, document.createTextNode(' min + '), ci, document.createTextNode(' s'));
    d.appendChild(ck);
    const go = el('button', null, 'Start game'); go.style.marginTop = '14px'; go.onclick = () => { savePrefs(); startSession(prefs.elo, prefs.pick); };
    const back = el('button', null, 'Back to menu'); back.style.background = '#555'; back.onclick = () => close();
    const imp = el('button', null, '📋 Review a game…'); imp.title = 'Paste a PGN or a list of moves and get the full analysis'; imp.onclick = () => { screen = 'import'; paintAll(); };
    d.append(el('br'), go, imp, back, el('div', 'dim', '<p>Below about 1300 Elo, Stockfish plays its normal moves most of the time but deliberately picks weaker ones now and then (more often the lower you set it). Those low settings are approximate.</p>'));
    root.appendChild(d);
  }

  let screen = 'setup';
  function paintAll() { if (!root) return; if (!S) { screen === 'import' ? paintImport() : paintSetup(); return; } paintGame(); }
  function paintGame() {
    const s = S, v = vply(), g = vgame(), live = s.view == null, rt = s.retry; root.innerHTML = '';
    const row = el('div', 'prrow'), left = el('div', 'prleft');
    const curAna = s.ana[v], last = v ? s.moves[v - 1] : null; let barEl = null;
    // ---- eval bar
    if (H('bar')) {
      const bar = el('div', 'prbar'), wf = el('div', 'wf'), lab = el('span'); bar.append(wf, lab);
      let wp = 0.5, txt = '…';
      if (curAna) { const l = curAna.lines[0]; wp = wpOf(l.cp); txt = curAna.term ? curAna.res : fmtEval(l); }
      const whiteBottom = s.human === 'w';
      wf.style.height = (wp * 100) + '%'; wf.style[whiteBottom ? 'bottom' : 'top'] = '0';
      lab.textContent = txt; lab.style[whiteBottom ? 'bottom' : 'top'] = '2px';
      lab.style.color = wp > 0.1 ? '#222' : '#ddd';      // (the label sits at YOUR end of the bar, which is the white part unless white is nearly lost)
      barEl = bar;
    }
    // ---- board
    const board = el('div', 'prboard'), col = el('div', 'prcol');
    const clk = c => { const d = el('div', 'prclk'); d.dataset.c = c; d.textContent = s.tc ? fmtClock(remaining(c)) : ''; return d; };
    if (s.tc) col.appendChild(clk(s.human === 'w' ? 'b' : 'w')); const bw = el('div', 'prbw'); if (barEl) bw.appendChild(barEl); bw.appendChild(board); col.appendChild(bw); if (s.tc) col.appendChild(clk(s.human));
    let kingSq = null; if (g.inCheck()) for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const p = g.at(x, y); if (p && p.t === 'k' && p.c === g.turn) kingSq = x + ',' + y; }
    const hints = s.sel && (live || rt) ? g.moves(s.sel.x, s.sel.y) : [];
    const hintMv = ((live && s.hint && H('hint')) || (!live && (s.viewBest || (rt && rt.shown)))) && curAna && curAna.lines[0] && curAna.lines[0].pv[0];
    const lk = s.both ? v - 1 : v - 1 - (last && last.c !== s.human ? 1 : 0), lmine = lk >= 0 ? s.moves[lk] : null;      // your latest move (as of the position shown) gets the badge unless the bot just moved onto that square
    const lastRate = lmine && mine(lmine.c) && H('ratings') && !(last !== lmine && last.m.tx === lmine.m.tx && last.m.ty === lmine.m.ty) ? s.rate[lk] : undefined;
    const myTurn = !s.over && live && g.turn === s.human;
    const bad = H('warn') && !s.over && (live ? myTurn : true) ? hangingOf(g, s.human).map(q => q.join(',')) : [], free = H('free') && !s.over && (live ? myTurn : true) ? hangingOf(g, s.human === 'w' ? 'b' : 'w').map(q => q.join(',')) : [];
    for (let i = 0; i < 64; i++) {
      const r = i >> 3, c = i & 7, x = s.human === 'w' ? c : 7 - c, y = s.human === 'w' ? 7 - r : r, key = x + ',' + y;
      const d = el('div', 'sq ' + ((x + y) % 2 === 1 ? 'l' : 'd')), p = g.at(x, y);
      if (s.sel && (live || rt) && s.sel.x === x && s.sel.y === y) d.classList.add('sel');
      if (last && ((last.m.tx === x && last.m.ty === y) || (last.m.fx === x && last.m.fy === y))) d.classList.add('last');
      if (kingSq === key) d.classList.add('check');
      const hm = hints.find(m => m.tx === x && m.ty === y); if (hm) { d.classList.add('hint'); if (p || (g.at(s.sel.x, s.sel.y).t === 'p' && s.sel.x !== x)) d.classList.add('cap'); }
      if (hintMv && (hintMv.slice(0, 2) === FILES[x] + (y + 1) || hintMv.slice(2, 4) === FILES[x] + (y + 1))) d.classList.add('pbest');
      if (bad.includes(key)) d.classList.add('pbad'); if (free.includes(key)) d.classList.add('pfree');
      if (p) { const sp = el('span'); glyph(sp, p.t); sp.className = p.c === 'w' ? 'w-piece' : ''; d.appendChild(sp); }
      if (lastRate && lmine.m.tx === x && lmine.m.ty === y) { const b = el('span', 'badge', RATE[lastRate].sym); b.style.background = RATE[lastRate].col; d.appendChild(b); }
      d.onclick = () => clickSq(x, y);
      board.appendChild(d);
    }
    left.appendChild(col); row.appendChild(left);
    // ---- side panel
    const side = el('div', 'prside');
    const status = s.over ? (s.imported ? 'Imported game — ' : '') + s.over.text + '.' : s.thinking ? 'Stockfish is thinking…' : g.turn === s.human && live ? 'Your move (' + (s.human === 'w' ? 'White' : 'Black') + ')' + (g.inCheck() ? ' — check!' : '') : live ? '…' : 'Looking at move ' + v + ' of ' + s.moves.length;
    side.appendChild(el('div', null, '<b>' + status + '</b> ' + (s.imported ? '<span class="dim">(analysis)</span>' : '<span class="dim">vs Stockfish ' + (s.elo >= 3200 ? '(max)' : s.elo) + '</span>')));
    if (rt) {
      const mv = s.moves[rt.k], R = RATE[s.rate[rt.k]], A = s.ana[rt.k], bm = A && A.lines[0] && findUciIn(rt.k, A.lines[0].pv[0]), nx = retryList().find(k => k > rt.k);
      const box = el('div', 'prfb prretry');
      let html = '🎯 <b>Retry:</b> in the game you played <b>' + mv.san + '</b> here (<span class="rt" style="background:' + R.col + '">' + R.sym + '</span> ' + R.name + '). Can you find a better move?';
      if (rt.last) html += '<br>' + (rt.last.ok ? '✅ <b>' + rt.last.san + '</b>: the engine agrees. Keep exploring other moves if you like.' : '✗ <b>' + rt.last.san + '</b> is not what the engine prefers. Try another move.');
      if (rt.shown) html += '<br>The engine\u2019s choice: <b>' + (bm || '?') + '</b> (marked on the board).';
      if (rt.note) html += '<br><span class="dim">' + rt.note + '</span>';
      box.innerHTML = html;
      const bb = el('div', 'prbtn');
      const sb = el('button', null, rt.shown ? 'Hide answer' : 'Show answer'); sb.onclick = () => { rt.shown = !rt.shown; paintAll(); }; bb.appendChild(sb);
      if (nx != null) { const b2 = el('button', null, 'Next mistake →'); b2.onclick = () => startRetry(nx); bb.appendChild(b2); }
      const st2 = el('button', null, 'Done'); st2.style.background = '#555'; st2.onclick = stopRetry; bb.appendChild(st2);
      box.appendChild(bb); side.appendChild(box);
    }
    if (H('opening')) { const on = openingAt(v); if (on) side.appendChild(el('div', 'dim', '📖 ' + on)); }
    if (s.msg) side.appendChild(el('div', 'dim', s.msg));
    // ---- help switches (each one independent)
    const cp = el('details', 'prcoach'); cp.open = s.helpOpen !== false; cp.ontoggle = () => { s.helpOpen = cp.open; };
    cp.appendChild(el('summary', null, '<b>Help</b> <span class="dim">(' + HELPS.filter(h => H(h[0])).length + ' of ' + HELPS.length + ' on)</span>'));
    const allb = el('div', 'prall'); [['All on', true], ['All off', false]].forEach(([n, val]) => { const b = el('button', null, n); b.onclick = () => { HELPS.forEach(h => { prefs.help[h[0]] = val; }); s.hint = null; savePrefs(); paintAll(); }; allb.appendChild(b); });
    cp.appendChild(allb);
    HELPS.forEach(([k, n]) => {
      const l = el('label'); const c = el('input'); c.type = 'checkbox'; c.checked = H(k);
      c.onchange = () => { prefs.help[k] = c.checked; if (k === 'hint') s.hint = null; savePrefs(); paintAll(); };
      l.append(c, document.createTextNode(' ' + n)); cp.appendChild(l);
    });
    side.appendChild(cp);
    // ---- feedback on your latest move
    if (H('ratings')) {
      let fb = '';
      if (lk >= 0 && mine(s.moves[lk].c)) {
        const rt = s.rate[lk], mv = s.moves[lk];
        if (rt) {
          const R = RATE[rt], A = s.ana[lk], bm = A && A.lines[0] && A.lines[0].pv[0] && findUciIn(lk, A.lines[0].pv[0]);
          fb = '<b>' + mv.san + '</b> <span class="rt" style="background:' + R.col + '">' + R.sym + '</span> ' + R.name;
          if (H('explain') && rt !== 'book') { const w = whyText(lk, rt); const bad = ['good', 'inaccuracy', 'mistake', 'miss', 'blunder'].includes(rt); fb += (bad && bm ? ' — the best move was <b>' + bm + '</b>' : '') + (bad && w ? '<br><span class="dim">' + w + '</span>' : ''); }
        } else fb = '<b>' + mv.san + '</b> — checking…';
      }
      side.appendChild(el('div', 'prfb', fb || '<span class="dim">Your move ratings appear here.</span>'));
    }
    // ---- promotion picker
    if (s.pendingPromo) {
      const pp = el('div', 'prpro'); ['q', 'r', 'b', 'n'].forEach(t => { const b = el('button'); const sp = el('span'); glyph(sp, t); sp.className = s.human === 'w' ? 'w-piece' : ''; b.appendChild(sp); b.onclick = () => { const m = s.pendingPromo.find(z => z.promo === t); s.pendingPromo = null; humanMove(m); }; pp.appendChild(b); });
      side.appendChild(pp);
    }
    // ---- buttons (a help that is off has no button at all)
    const bt = el('div', 'prbtn');
    const mk = (txt, fn, dis, bg) => { const b = el('button', null, txt); b.disabled = !!dis; b.onclick = fn; if (bg) b.style.background = bg; bt.appendChild(b); };
    if (H('hint') && !s.imported) mk('💡 Hint', () => { s.hint = true; requestAna(s.moves.length); paintAll(); }, s.over || !live || botTurn() || s.thinking);
    if (H('takeback') && !s.both) mk('↶ Take back', takeback, !s.moves.length);
    const inProgress = !s.over && s.moves.length > 0 && !s.imported;      // only a game in progress needs a "are you sure?"
    const leave = (msg, okLabel, fn) => async () => { if (inProgress && !(await ask(msg, okLabel, true))) return; fn(); };
    if (!s.imported) mk('Resign', async () => { if (await ask('Resign this game? You will lose it.', 'Resign', true)) resign(); }, s.over, '#8b3a3a');
    mk('New game', leave('Start a new game? The current game will be abandoned.', 'New game', () => { S = null; sid++; screen = 'setup'; SF.stop(); paintAll(); }), false, '#555');
    mk(s.imported ? 'Back' : 'Menu', leave('Leave this game and go back to the menu? The game will be abandoned.', 'Leave game', () => close()), false, '#555');
    side.appendChild(bt);
    // ---- browsing arrows + post-game review
    const nav = el('div', 'prnav'); [['⏮', 0], ['◀', v - 1], ['▶', v + 1], ['⏭', s.moves.length]].forEach(([t, n]) => { const b = el('button', null, t); b.onclick = () => goView(n); nav.appendChild(b); });
    if (!live) { const b = el('button', null, 'Back to game'); b.onclick = () => goView(s.moves.length); nav.appendChild(b); }
    if (!live && !rt && H('takeback') && !s.both) { const b = el('button', null, '↩ Play from here'); b.title = 'Continue playing from this position (later moves are discarded)'; b.onclick = async () => { if (!s.over && !(await ask('Play on from this position? The moves after it will be discarded.', 'Play from here', true))) return; playFromHere(); }; nav.appendChild(b); }
    side.appendChild(nav);
    if (s.over && s.moves.length) side.appendChild(reviewPanel());
    // ---- move list (click a move to look at that position)
    const ml = el('div', 'prml');
    for (let i = 0; i < s.moves.length; i += 2) {
      const d = el('div'); d.appendChild(el('span', 'dim', (i / 2 + 1) + '.'));
      [i, i + 1].forEach(j => {
        const m = s.moves[j], c = el('span', 'mv' + (m && j + 1 === v ? ' cur' : ''), m ? m.san : '');
        if (m && H('ratings') && mine(m.c) && s.rate[j]) { const R = RATE[s.rate[j]]; c.innerHTML += ' <span class="rt" style="background:' + R.col + '" title="' + R.name + '">' + R.sym + '</span>'; }
        if (m) c.onclick = () => goView(j + 1); d.appendChild(c);
      });
      ml.appendChild(d);
    }
    side.appendChild(ml); ml.scrollTop = ml.scrollHeight;
    row.appendChild(side); root.appendChild(row); fit();
  }
  function reviewPanel() {
    const s = S, box = el('div', 'prrev'), done = s.ana.filter(Boolean).length, total = s.moves.length + 1;
    box.appendChild(el('div', null, '<b>Game review</b>' + (allAnalysed() ? '' : ' <span class="dim">(analysing… ' + done + '/' + total + ')</span>')));
    const order = ['brilliant', 'great', 'best', 'excellent', 'good', 'book', 'inaccuracy', 'mistake', 'miss', 'blunder'];
    const tallyOf = st => order.filter(k => st.cnt[k]).map(k => '<span class="rt" style="background:' + RATE[k].col + '">' + RATE[k].sym + '</span> ' + st.cnt[k]).join(' &nbsp; ');
    const sides = s.both ? [['w', 'White'], ['b', 'Black']] : [[s.human, 'You'], [s.human === 'w' ? 'b' : 'w', s.imported ? 'Opponent' : 'Stockfish']];
    sides.forEach(([c, name], i) => {
      const st = reviewStats(c); if (st.acc == null) return;
      box.appendChild(el('div', null, name + ' — accuracy <b>' + st.acc.toFixed(0) + '%</b>' + (s.both || i === 0 ? '<br><span style="font-size:.9em">' + tallyOf(st) + '</span>' : '')));
    });
    const key = []; s.moves.forEach((m, k) => { if (mine(m.c) && ['brilliant', 'great', 'miss', 'mistake', 'blunder'].includes(s.rate[k])) key.push(k); });
    if (key.length) {
      box.appendChild(el('div', 'dim', 'Key moments (click a mistake to retry it, or a great move to see the best move):'));
      key.forEach(k => { const R = RATE[s.rate[k]], d = el('div', 'prkey'); d.innerHTML = (Math.floor(k / 2) + 1) + (k % 2 ? '…' : '.') + ' <b>' + s.moves[k].san + '</b> <span class="rt" style="background:' + R.col + '">' + R.sym + '</span> ' + R.name; d.onclick = () => (RETRY_CLS.includes(s.rate[k]) ? startRetry(k) : goView(k, true)); box.appendChild(d); });
    }
    return box;
  }
  function findUciIn(k, u) { try { const g = gameAt(k), m = findUci(g, u); return m ? sanOf(g, m) : null; } catch (e) { return null; } }
  function clickSq(x, y) {
    const s = S; if (!s) return;
    if (s.retry) {      // retry mode: you move in the position BEFORE your mistake; nothing is actually played
      const g = vgame();
      if (s.sel) { const ms = g.moves(s.sel.x, s.sel.y).filter(m => m.tx === x && m.ty === y); if (ms.length) { retryMove(ms.find(m => m.promo === 'q') || ms[0]); return; } }
      const q = g.at(x, y); s.sel = q && q.c === g.turn ? { x, y } : null; paintAll(); return;
    }
    if (s.over || s.view != null || botTurn() || s.thinking || s.pendingPromo) return;
    const g = s.game;
    if (s.sel) {
      const ms = g.moves(s.sel.x, s.sel.y).filter(m => m.tx === x && m.ty === y);
      if (ms.length) { if (ms.length > 1 && ms[0].promo) { s.pendingPromo = ms; paintAll(); return; } humanMove(ms[0]); return; }
    }
    const p = g.at(x, y);
    s.sel = p && p.c === s.human ? { x, y } : null; paintAll();
  }


  // ====================== review a pasted game ======================
  function parseGameText(text) {      // PGN (headers, comments, variations, NAGs are ignored) or a plain list of SAN / UCI moves -> { moves:[move objects], meta } or { error }
    const meta = {}; String(text).replace(/\[(\w+)\s+"([^"]*)"\]/g, (m, k, v) => { meta[k] = v; return ''; });
    if (meta.FEN || meta.SetUp === '1') return { error: 'Games that start from a custom position (FEN) are not supported yet.' };
    let t = String(text).replace(/\[[^\]]*\]/g, ' ').replace(/\{[^}]*\}/g, ' ').replace(/;[^\n]*/g, ' ');
    for (let i = 0; i < 8; i++) t = t.replace(/\([^()]*\)/g, ' ');
    t = t.replace(/\$\d+/g, ' ').replace(/\d+\s*\.(\.\.)?/g, ' ').replace(/1\/2-1\/2|1-0|0-1|\*/g, ' ');
    const toks = t.split(/\s+/).filter(Boolean);
    if (!toks.length) return { error: 'No moves found. Paste a PGN or a move list like "1. e4 e5 2. Nf3 Nc6".' };
    const g = newGame(), out = [], norm = s => s.replace(/[+#!?]/g, '').replace(/=/g, '').replace(/^[0O]-[0O]-[0O]$/, 'O-O-O').replace(/^[0O]-[0O]$/, 'O-O');
    for (let i = 0; i < toks.length; i++) {
      const tok = toks[i]; let found = null;
      if (/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(tok)) found = findUci(g, tok);
      else {
        const want = norm(tok);
        for (let y = 0; y < 8 && !found; y++) for (let x = 0; x < 8 && !found; x++) { const q = g.at(x, y); if (q && q.c === g.turn) found = g.moves(x, y).find(m => norm(sanOf(g, m)) === want) || null; }
      }
      if (!found) return { error: 'Could not read move ' + (Math.floor(out.length / 2) + 1) + (out.length % 2 ? '…' : '.') + ' "' + tok + '" (is it legal in that position?).' };
      const mm = { fx: found.fx, fy: found.fy, tx: found.tx, ty: found.ty, promo: found.promo }; if (!g.move(mm)) return { error: 'Illegal move "' + tok + '".' };
      out.push(mm);
      if (g.status() === 'checkmate' || g.status() === 'stalemate') { if (i < toks.length - 1) return { error: 'The game is already over after "' + tok + '", but more moves follow.' }; }
    }
    return { moves: out, meta };
  }
  function loadImported(moves, side, meta) {
    SF.stop(); stopTicker();
    S = { id: ++sid, elo: prefs.elo, human: side === 'b' ? 'b' : 'w', both: side === 'both', imported: true, game: newGame(), moves: [], ana: [null], rate: [], over: null, sel: null, hint: null, pendingPromo: null, thinking: false, keys: [], clocks: [0], msg: '', tc: null, t: null, tsnap: null, tlast: performance.now(), anaQ: new Set() };
    S.keys.push(posKey(S.game));
    moves.forEach(m => applyMove(m));
    if (!S.over) { const r = meta && meta.Result; S.over = { text: r === '1-0' ? 'White won (1-0)' : r === '0-1' ? 'Black won (0-1)' : r === '1/2-1/2' ? 'Drawn (½-½)' : 'End of the moves', win: r === '1-0' ? 'w' : r === '0-1' ? 'b' : null }; }
    const nm = meta && (meta.White || meta.Black) ? (meta.White || '?') + ' vs ' + (meta.Black || '?') : '';
    if (nm) S.msg = nm;
    for (let i = 0; i <= S.moves.length; i++) requestAna(i);
    paintAll();
  }
  function paintImport() {
    root.innerHTML = '';
    const d = el('div', 'prset'); d.appendChild(el('h2', null, 'Review a game'));
    d.appendChild(el('p', 'dim', 'Paste a game as PGN or as a plain list of moves (e.g. <i>1. e4 e5 2. Nf3 Nc6</i>). Stockfish analyses every move with all the usual ratings, accuracy and retries. Standard chess from the normal starting position only.'));
    const ta = el('textarea'); ta.placeholder = '[Event "…"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 …'; ta.value = importDraft.text; ta.oninput = () => { importDraft.text = ta.value; };
    d.appendChild(ta);
    const side = el('div', null, '<p style="margin:10px 0 4px">Show the ratings for:</p>');
    [['w', 'White'], ['b', 'Black'], ['both', 'Both sides']].forEach(([v, n]) => { const b = el('button', importDraft.side === v ? 'on' : '', n); b.onclick = () => { importDraft.side = v; paintImport(); }; side.appendChild(b); });
    d.appendChild(side);
    const err = el('div', 'prerr'); err.textContent = importDraft.err || ''; d.appendChild(err);
    const go = el('button', null, 'Analyse'); go.onclick = () => { const r = parseGameText(ta.value); if (r.error) { importDraft.err = r.error; paintImport(); return; } importDraft.err = ''; loadImported(r.moves, importDraft.side, r.meta); };
    const back = el('button', null, 'Back'); back.style.background = '#555'; back.onclick = () => { screen = 'setup'; paintAll(); };
    d.append(go, back); root.appendChild(d);
  }
  const importDraft = { text: '', side: 'w', err: '' };

  // ====================== public ======================
  function init(o) { if (o.confirm) ask = o.confirm; E = o.Engine; glyph = o.glyph; onExit = o.onExit; root = document.getElementById('practice'); build(); }
  function open() { root.classList.remove('hidden'); S = null; sid++; screen = 'setup'; paintAll(); SF.start().catch(e => { root.insertBefore(el('p', null, '⚠ ' + e.message), root.firstChild); }); }
  function close() { if (S) { S = null; sid++; } stopTicker(); SF.stop(); root.classList.add('hidden'); if (onExit) onExit(); }
  function _load(uci, human, elo) {      // test hook: load a finished game from UCI moves and analyse every position
    startSession(elo || 1000, human); S.thinking = false; SF.stop(); S.moves.length = 0; S.game = newGame(); S.keys = [posKey(S.game)]; S.clocks = [0]; S.ana = [null]; S.rate = []; S.anaQ = new Set();
    uci.forEach(u => { if (!applyMove(findUci(S.game, u))) throw new Error('bad move ' + u); });
    if (!S.over) S.over = { text: 'Loaded game', win: null };
    for (let i = 0; i <= S.moves.length; i++) requestAna(i); paintAll(); return S;
  }
  return { init, open, close, _load, _s: () => S, _SF: SF, _wp: wpOf, _pickWeak: pickWeak, _t: { parseGameText, isSacrifice, lossOf, cloneWith, hangingOf, rowSet, openingAt, inBook, whyText } };
})();
if (typeof module !== 'undefined') module.exports = Practice;
