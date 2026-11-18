// ---- Swap trait: pick two of your pieces ----
let swapMode = false, swapFirst = null, pendingFriendly = null;
// Glitch 'Clipping': a square can hold a stack of the owner's pieces. selIdx = which member of the selected stack moves (0 = the piece on top).
function selMoves() {
  if (!(game.memberMoves && sel && !sel.drop)) return game.moves(sel.x, sel.y);
  const st = game.stackAt && game.stackAt(sel.x, sel.y);
  if (!st || selIdx >= st.length) selIdx = 0;
  return selIdx > 0 ? game.memberMoves(sel.x, sel.y, selIdx) : game.moves(sel.x, sel.y);
}
const withCk = m => (selIdx > 0 && sel && !sel.drop ? Object.assign({}, m, { ck: selIdx }) : m);
function renderStackPick() {
  const box = $('stackPick'); if (!box) return;
  const st = game && game.stackAt && sel && !sel.drop && !replay && !spectating && !draft && !M && !ended() && game.turn === meId() ? game.stackAt(sel.x, sel.y) : null;
  box.innerHTML = '';
  if (!st) { box.classList.add('hidden'); return; }
  if (selIdx >= st.length) selIdx = 0;
  const lab = document.createElement('span'); lab.className = 'dim'; lab.textContent = 'Overlapping pieces: choose which one moves'; box.appendChild(lab);
  st.forEach((p, i) => {
    const b = document.createElement('button'); b.innerHTML = glyphHTML(shownType(p), p.c); b.title = i === 0 ? 'Top piece' : 'Piece sharing the square';
    if (i === selIdx) b.className = 'on';
    b.onclick = () => { selIdx = i; render(); };
    box.appendChild(b);
  });
  box.classList.remove('hidden');
}
function friendlyPending(x, y, cand) {            // returns true while waiting for the confirming second click
  const tg = game.at(x, y);
  if (!sel || !cand.length || !tg || tg.c !== meId() || cand[0].castle || cand[0].swap || cand[0].join || cand[0].rev) return false;      // (a Sacrificer's own square is not a friendly-fire target)
  const from = sel.x + ',' + sel.y;
  if (pendingFriendly && pendingFriendly.x === x && pendingFriendly.y === y && pendingFriendly.from === from) { pendingFriendly = null; return false; }
  pendingFriendly = { x, y, from }; render(); return true;
}
function swapEligible() {
  return !!(game && gtraits && !spectating && !replay && !draft && !M && !ended() && myTurnNow() && gtraits[meId()] === 'swap' && game.canSwap && game.canSwap(meId()));
}
function swapClick(x, y) {
  const p = game.at(x, y);
  if (!p || p.c !== meId() || p.dead || p.t === 'k' || p.t === 'p') return;
  if (!swapFirst) { swapFirst = { x, y }; render(); return; }
  if (swapFirst.x === x && swapFirst.y === y) { swapFirst = null; render(); return; }
  const m = { swap: true, fx: swapFirst.x, fy: swapFirst.y, tx: x, ty: y };
  swapMode = false; swapFirst = null; sel = null;
  play(m);
}
$('swapBtn').onclick = () => { swapMode = !swapMode; swapFirst = null; sel = null; render(); };
$('endRoundBtn').onclick = async () => {                 // Austang: the host can call a round a draw if something goes wrong
  if (!isHost || !M || M.phase !== 'play' || ended()) return;
  if (!(await askConfirm('End this round as a draw?', 'End round', true)) || !M || M.phase !== 'play' || ended()) return;
  over = 'Round ended by the host.'; overRes = 'd'; send({ type: 'endRound' }); render();
};

// ---- move list ----
let ml = null;      // { src, g, applied, ri, items: [{ text, cls }], drawn }
const mlLetter = t => ({ k: 'K', q: 'Q', r: 'R', b: 'B', n: 'N', p: '', c: 'C', i: 'I', w: 'W', o: 'O', a: 'A', l: 'L' }[t] || '');

const PIECE_GUIDE = [
  ['E', 'Emperor (Imperial)', 'Rook lines plus the squares beside the line; a piece on the line blocks the side squares at and beyond it. Reach 3 if the Empress dies. Immune to pawns and Rooks. Can castle over a Rook.'],
  ['X', 'Empress (Imperial)', 'Diagonals plus the 4 orthogonal neighbours of each line square. Reach 3 if the Emperor dies. Immune to pawns and Bishops. Can castle over a Bishop.'],
  ['H', 'Heir (Imperial)', 'Leaps to the 16 knight and camel squares (28 once Emperor and Empress are gone: also 2-4 / 4-2 squares and the 4 squares 2 away diagonally). Immune to pawns and Knights. Can swap with a friendly Knight.'],
  ['k', 'King', 'One step any direction, or onto any square next to a friendly piece within 2 squares of it. It can capture there only inside its own 5×5; further out it can only move there. Aura (7×7): friendly pawns walk one step further (and keep that for one more turn after leaving it); Rooks, Bishops, Knights and Grands can’t be captured by pawns.'],
  ['q', 'Queen', 'Moves like a standard queen. Aura (5×5): Pawns also capture straight; Archers, Guards, Chariots, Sappers, Catapults can’t be captured by pawns.'],
  ['y', 'Prince', 'Captures on the 5×5 around it (no corners); also steps to the 4 corners and 3 squares straight. Blockable. One at a time, promotion only.'],
  ['z', 'Princess', 'Steps 1 any direction; shoots the outer ring of the 5×5 and 3 straight without moving. Can’t be captured while the Prince is adjacent. One at a time, promotion only.'],
  ['r', 'Rook', 'Slides along ranks and files.'], ['b', 'Bishop', 'Slides diagonally.'], ['n', 'Knight', 'Leaps in an L.'],
  ['R', 'Grand Rook', 'Rook plus knight moves (moves only, can’t capture or check with them).'],
  ['B', 'Grand Bishop', 'Bishop plus 1–2 squares straight.'],
  ['N', 'Grand Knight', 'Leaps to any square on the outer ring of the 5×5.'],
  ['g', 'Guard', 'King moves and captures; also steps 2 straight or onto empty squares around a nearby friend. Archers can’t hit it or its neighbours.'],
  ['h', 'Chariot', 'Slides 2 straight plus the knight squares beside each lane (a blocker cuts them off).'],
  ['f', 'Jester', 'Never captures by itself. Hops to the opposite-colour squares of its 5×5 (light ↔ dark). Also copies the moves (and captures) of any FRIENDLY piece within its 3×3 (never enemy pieces) except Imperials, other Jesters and ranged pieces (Archer, Catapult, Lancer thrust, Princess shots). Pawns can promote to it.'],
  ['u', 'Archer', 'Steps 1–2 straight. Shoots 12 squares around it (the 5×5 ring without corners and without the squares right beside it) without moving, can’t be blocked.'],
  ['s', 'Sapper', 'Leaps 1 diagonal or 2 straight; never captures. After moving it may place a wall next to itself (once per 2 turns).'],
  ['t', 'Catapult', 'Walks 1 in any direction (all 8 around it) or 1–3 straight. It faces one way (a small marker shows which; it starts facing forward) and turns to face the direction of every straight walk (up, down, left or right); a diagonal step keeps its facing. Fires on 7 squares ahead of where it faces; hitting the middle of the far row splashes both sides. Reloads for 2 turns after firing, and can’t move at all on the first turn after firing.'],
  ['p', 'Pawn', 'Steps 1 (up to 3 on its first move), captures diagonally. In the king’s aura it steps 2. On the 4-player cross board pawns walk 2 after their first move and 3 in the aura (the wide 2v2 board is like the 2-player board).'],
  ['v', 'Pikeman', 'Pawn that also captures straight ahead. Promotes to a Lancer too.'],
  ['m', 'Skirmisher', 'Pawn that can also step sideways. Promotes to a Raider too.'],
  ['j', 'Lancer', 'Thrusts at 3 squares straight ahead without moving; slides to capture at 4–5; unblockable 3-wide front; moves only sideways.'],
  ['d', 'Raider', 'Slides sideways up to 5 (captures within 3), 2 vertically, plus (±3,±1) leaps.'],
  ['#', 'Wall', 'Blocks movement and lines. Belongs to the Sapper’s player (shown in their colour): only enemies can capture it, by moving onto it. Ranged shots pass over it.']
];
const GRAND_GUIDE = [
  ['k', 'King', 'Steps 1 in any direction. Castles with a rook that hasn’t moved.'],
  ['q', 'Queen', 'Slides any distance along ranks, files and diagonals.'],
  ['r', 'Rook', 'Slides along ranks and files.'],
  ['b', 'Bishop', 'Slides along diagonals.'],
  ['n', 'Knight', 'Leaps in an L.'],
  ['p', 'Pawn', 'Steps 1 (2 from its 2nd rank), captures diagonally, promotes on the last rank.'],
  ['\u03b1', 'Cardinal', 'Bishop + knight.'],
  ['\u03c7', 'Marshal', 'Rook + knight.'],
  ['\u03c9', 'Amazon', 'Queen + knight. The strongest piece; pawns can’t promote to it.'],
  ['\u03b4', 'Dragon King', 'Rook + a 1-step diagonal.'],
  ['\u03b7', 'Dragon Horse', 'Bishop + a 1-step orthogonal.'],
  ['\u03ba', 'Centaur', 'King + knight.'],
  ['\u03bd', 'Nightrider', 'Repeats the knight jump in a straight line until something blocks it.'],
  ['\u03b3', 'Camel', 'Leaps (3,1). Always stays on the same square colour.'],
  ['\u03b6', 'Zebra', 'Leaps (3,2). Changes square colour every move.'],
  ['\u03b2', 'Bison', 'Camel + zebra: leaps (3,1) or (3,2).'],
  ['\u03be', 'Alfil', 'Leaps exactly 2 squares diagonally, over anything.'],
  ['\u03c4', 'Dabbaba', 'Leaps exactly 2 squares straight, over anything.'],
  ['\u03c6', 'Ferz', 'Steps 1 square diagonally.'],
  ['\u03c8', 'Wazir', 'Steps 1 square straight.'],
  ['\u03c1', 'Berolina Pawn', 'Steps diagonally forward (2 from its 2nd rank) but captures straight ahead. Promotes on the last rank. Can’t start on your back rank.'],
  ['\u03c0', 'Cannon', 'Slides like a rook but can’t capture that way. It captures by jumping over exactly one piece (any colour) and taking the next piece behind it.'],
  ['\u03b8', 'Grasshopper', 'Along any queen line, hops over the first piece and lands right behind it: an empty square is a move, an enemy is a capture.'],
  ['\u03bb', 'Sniper', 'Ranged. Steps 1 diagonally. Shoots the first piece along any rank or file, at any distance, without moving. Any piece in between blocks the shot.'],
  ['\u03c5', 'Mortar', 'Ranged. Leaps 2 squares straight. Lobs a shell onto the 8 squares exactly 3 away (straight and diagonal) without moving. Can’t be blocked.'],
  ['\u03bf', 'Ballista', 'Ranged. Leaps 2 squares diagonally (moves only). Shoots the first piece along any diagonal, up to 4 squares, without moving.'],
  ['\u03bc', 'Sacrificer', 'Walks like a king (not royal). Instead of moving, it can turn itself into one of your captured pieces: select it, click it again, pick the piece. Ends your turn.'],
  ['\u03b9', 'Reviver', 'Walks like a king (not royal). Instead of moving, it can bring back a captured piece of yours onto an empty square next to it, then recharges for 4 of your turns.'],
  ['\u03b5', 'Herald', 'Walks like a king (not royal) and can step 2 straight forward. Aura: your pawns within 2 squares can’t capture or give check, but may take up to 5 free single steps before your move (select a pawn, click its forward square, choose “Free step”).']
];
// how the piece picker groups the Austang Grand pieces (anything not listed lands in "Other")
const GRAND_GROUPS = [
  ['Standard', ['k', 'p', 'n', 'b', 'r', 'q']],
  ['Compound', ['\u03b1', '\u03c7', '\u03c9', '\u03b4', '\u03b7', '\u03ba']],
  ['Leapers & riders', ['\u03bd', '\u03b3', '\u03b6', '\u03b2', '\u03be', '\u03c4', '\u03c6', '\u03c8']],
  ['Ranged', ['\u03bb', '\u03c5', '\u03bf']],
  ['Special', ['\u03c1', '\u03c0', '\u03b8', '\u03bc', '\u03b9', '\u03b5']]
];
const OCT_GUIDE = [
  [Engine.NEUTRAL_T.boar, 'Boar', 'Wild: wanders, then now and then stops and <b>aims</b> (a red arrow shows the direction). Next round it <b>charges</b> that way until it hits a wall, a hole or a piece, capturing what it hits (never a king). You get one turn to dodge, block or capture it. Owned (dropped): see the diagram.', true],
  [Engine.NEUTRAL_T.hound, 'Hound', 'Wild: hunts the nearest piece, up to 2 squares a round, capturing what it reaches (never a king). With neutral drops on you can capture it into your hand and drop it: then it is yours but <b>moves by itself</b>. You can never move it, and it never leaves your king in check. If it is captured again it is gone for good.', false],
  [Engine.NEUTRAL_T.burrower, 'Burrower', 'Wild: steps like a king, and every square it leaves becomes a <b>hole for 3 rounds</b>. A host option lets those holes also promote pawns. Owned: see the diagram.', true],
  [Engine.NEUTRAL_T.golem, 'Golem', 'Wild: steps like a king but only every second round. <b>Only rooks, queens and other straight sliders can capture it</b> (not pawns, knights, bishops or kings). Owned: see the diagram.', true],
  [Engine.NEUTRAL_T.boss, 'Boss', 'A 2×2 monster. See the rules above: crushes what it rolls over (kings are safe), and the piece that takes a cell survives. It can be killed or claimed on its last cell. It is drawn as one picture across its four cells: capture a cell and that part of the picture is gone.', false]
];
let octDone = false;
function fillOctGuide() {
  if (octDone) return; octDone = true;
  $('octGuide').innerHTML = OCT_GUIDE.map(([t, n, d, diag]) => guideRow(t, n, d, t === Engine.NEUTRAL_T.boss ? bossFull : glyphHTML(t), diag)).join('');
  wireGuide($('octGuide'), 'oct');
}
let grandDone = false;
function fillGrandGuide() {
  if (grandDone) return; grandDone = true;
  $('grandGuide').innerHTML = GRAND_GUIDE.map(([t, n, d]) => guideRow(t, n, d, glyphHTML(t), true)).join('');
  wireGuide($('grandGuide'), 'grand', Engine.AUSTANG_GRAND);
}
// ---- movement diagrams: tiny boards with the squares a piece reaches, computed from the real engines (diagrams.js) ----
const MARK_TXT = { m: 'moves there (can’t capture)', c: 'captures only', b: 'moves or captures', s: 'shoots (captures without moving)', x: 'moves there, or shoots a piece there' };
function diagramEl(grid, iconHtml) {
  const d = document.createElement('div'); d.className = 'dg'; d.style.setProperty('--n', grid.N);
  const ex = {}; (grid.extras || []).forEach(e => { ex[e.j + ',' + e.i] = e; });
  let oi = 0, oj = 0; grid.rows.forEach((row, j) => { const k = row.indexOf('o'); if (k >= 0) { oi = k; oj = j; } });
  const au = grid.aura ? grid.aura.r : -1;
  grid.rows.forEach((row, j) => [...row].forEach((ch, i) => {
    const c = document.createElement('div'); c.className = 'dgc ' + (((i + j) & 1) ? 'd' : 'l') + (ch === '#' ? ' cut' : '') + (ch === 'o' ? ' me' : '') + (ch !== '#' && Math.max(Math.abs(i - oi), Math.abs(j - oj)) <= au ? ' au' : '');
    if (ch === 'o') c.innerHTML = '<span class="dgp">' + iconHtml + '</span>';
    else if (ch === 'e' && ex[j + ',' + i]) c.innerHTML = '<span class="dgp dgx ' + (ex[j + ',' + i].c === 'w' ? '' : 'xb') + '">' + glyphHTML(ex[j + ',' + i].t) + '</span>';
    else if (ch !== '.' && ch !== '#' && ch !== 'e') c.innerHTML = '<i class="mk ' + ch + '"></i>';
    d.appendChild(c);
  }));
  return d;
}
const auraLegend = (lg, seenAura) => { if (seenAura) { const sp = document.createElement('span'); sp.innerHTML = '<i class="mk au"></i>' + seenAura.label; lg.appendChild(sp); } };
function diagramBlock(kind, t, iconHtml, variant) {          // kind 'imp' | 'grand'; returns a node with one diagram per situation worth showing, plus a legend
  const box = document.createElement('div'); box.className = 'dgwrap'; const seen = new Set(); let aura = null;
  (kind === 'promo' ? Promotion.states(t) : Diagrams.states(kind === 'imp' ? 'imp' : kind === 'oct' ? 'oct' : 'grand', t, Engine)).forEach(st => {
    let g; try { g = kind === 'promo' ? Promotion.diagram(t, Object.assign({ R: 5 }, st.o)) : kind === 'imp' ? Diagrams.gridImp(Imperial, t, Object.assign({ R: 5 }, st.o)) : kind === 'oct' ? Diagrams.gridOct(Engine, t, Object.assign({ R: 5 }, st.o)) : Diagrams.grid2p(Engine, variant, t, Object.assign({ R: 5 }, st.o)); } catch (e) { return; }
    g.rows.forEach(r => [...r].forEach(ch => { if (MARK_TXT[ch]) seen.add(ch); })); if (g.aura) aura = g.aura;
    const w = document.createElement('div'); w.className = 'dgstate';
    const cap = document.createElement('div'); cap.className = 'dgcap'; cap.textContent = st.label; w.appendChild(cap);
    w.appendChild(diagramEl(g, iconHtml)); box.appendChild(w);
  });
  const lg = document.createElement('div'); lg.className = 'dgl';
  ['m', 'c', 'b', 's', 'x'].filter(k => seen.has(k)).forEach(k => { const sp = document.createElement('span'); sp.innerHTML = '<i class="mk ' + k + '"></i>' + MARK_TXT[k]; lg.appendChild(sp); });
  auraLegend(lg, aura); box.appendChild(lg);
  return box;
}
function wireGuide(container, kind, variant) {                // 'Show moves' buttons under each guide row (diagrams are built on first click)
  container.querySelectorAll('.dgbtn').forEach(b => {
    b.onclick = () => {
      const row = b.closest('.pg'), slot = row.querySelector('.dgslot');
      if (!slot.firstChild) slot.appendChild(diagramBlock(kind, row.dataset.t, row.querySelector('.pgi').innerHTML, variant));
      const open = slot.classList.toggle('hidden') === false; b.textContent = open ? 'Hide moves ▴' : 'Show moves ▦';
    };
    b.closest('.pg').querySelector('.dgslot').classList.add('hidden');
  });
}
const guideRow = (t, n, d, icon, diag) => '<div class="pg" data-t="' + t.replace(/"/g, '') + '"><span class="pgi">' + icon + '</span><div><b>' + n + '</b>: ' + d + (diag ? '<div><button class="dgbtn">Show moves ▦</button><div class="dgslot"></div></div>' : '') + '</div></div>';
let pgDone = false;
function fillPieceGuide() {
  if (pgDone) return; pgDone = true;
  $('pieceGuide').innerHTML = PIECE_GUIDE.map(([t, n, d]) => guideRow(t, n, d, IMP_KQ[t] || glyphHTML(t), t !== '#')).join('');
  wireGuide($('pieceGuide'), 'imp');
}
const IMP_NAMES = { p:'Pawn', v:'Pikeman', m:'Skirmisher', r:'Rook', b:'Bishop', n:'Knight', q:'Queen', k:'King', R:'Grand Rook', B:'Grand Bishop', N:'Grand Knight', E:'Emperor', X:'Empress', H:'Heir', g:'Guard', h:'Chariot', u:'Archer', f:'Jester', s:'Sapper', t:'Catapult', y:'Prince', z:'Princess', j:'Lancer', d:'Raider', '#':'wall' };
function impText(g, e) {
  const A = sqName(e.fx, e.fy), Z = sqName(e.tx, e.ty), P = GLYPH[e.by] || '';
  if (e.skip) return P + A + ' no wall';
  if (e.wall) return P + ' wall ' + Z;
  if (e.swap) return 'swap ' + A + '⇄' + Z;
  if (e.castle) return P + A + ' hops→' + Z;
  if (e.shoot) return P + A + '⌖' + Z + (e.hits && e.hits.length > 1 ? ' (+' + (e.hits.length - 1) + ')' : '');
  return P + A + (e.cap ? 'x' : '–') + Z + (e.ep ? ' e.p.' : '') + (e.promo ? '=' + GLYPH[e.promo] : '');
}
function promoText(g, e) {
  const A = sqName(e.fx, e.fy), Z = sqName(e.tx, e.ty), nm = t => (t === 'p' ? '' : t.length === 1 && t === t.toLowerCase() && 'kqrbn'.includes(t) ? t.toUpperCase() : (Promotion.ABBR[t] || (PNAMES[t] || '').slice(0, 2))), pre = t => (nm(t).length > 1 ? nm(t) + '·' : nm(t));
  if (e.castle) return e.castle === 'k' ? 'O-O' : 'O-O-O';
  if (e.swap) return pre(e.by) + A + '⇄' + Z;
  if (e.reenter) return pre(e.by) + '↙' + Z + (e.cap ? 'x' : '');
  if (e.exit) return pre(e.by) + A + '↗out';
  if (e.bump) return pre(e.by) + A + '⊘' + Z;
  if (e.push) return pre(e.by) + A + '→' + Z + ' (pushes)';
  if (e.squish) return pre(e.by) + A + '✕' + Z;
  if (e.shot) return pre(e.by) + A + '⌖' + Z;
  if (e.vx != null) return pre(e.by) + A + (e.cap ? 'x' : '–') + sqName(e.vx, e.vy) + '›' + Z;
  return pre(e.by) + A + (e.cap ? 'x' : '–') + Z + (e.ep ? ' e.p.' : '') + (e.promo ? '=' + nm(e.promo) + (e.px != null ? '→' + sqName(e.px, e.py) : '') : '');
}
function mlText(g, e) {
  if (g.promotion) return promoText(g, e);
  if (g.imperial) return impText(g, e);
  const sq = (x, y) => (g.hex ? (x - g.radius) + ',' + (y - g.radius) : sqName(x, y));
  if (e.swap) return 'swap ' + sq(e.fx, e.fy) + '⇄' + sq(e.tx, e.ty);
  if (e.drop) return mlLetter(e.drop) + '@' + sq(e.tx, e.ty);
  if (e.rev) return 'revive ' + (GLYPH[e.rev] || '') + '@' + sq(e.tx, e.ty);
  if (e.free) return 'free ' + sq(e.fx, e.fy) + '→' + sq(e.tx, e.ty);
  if (e.reward) return e.skip ? 'boss reward: skipped' : 'boss reward ' + (GLYPH[e.t] || '') + '@' + sq(e.tx, e.ty);
  const at = (x, y) => (g.bug ? g.at(e.board, x, y) : g.layers ? g.at(x, y, e.fl) : g.at(x, y));
  const p = at(e.fx, e.fy), t = p ? (p.fx && p.fx.msk && !maskSeen(p) ? p.fx.msk : p.t) : '', dest = at(e.tx, e.ty);
  if (t === 'k' && (e.castle || (e.ty === e.fy && Math.abs(e.tx - e.fx) === 2) || (dest && dest.t === 'r' && dest.c === p.c))) return 'castle';
  return mlLetter(t) + sq(e.fx, e.fy) + (e.shot ? '⌖' : e.cap ? 'x' : '–') + sq(e.tx, e.ty) + (e.promo ? '=' + mlLetter(e.promo) : '');
}
function canReplay() { return !!(game && !M && !draft && game.history().length > 0 && (ended() || !(gs.fog || MODES[mode].v.hidden))); }
function updateMoveList() {
  const box = $('moveBox'), live = liveGame();
  if (!live || M || !(replay || canReplay())) { box.classList.add('hidden'); $('capBox').classList.add('hidden'); return; }
  box.classList.remove('hidden');
  const hist = live.history(), list = $('moveList');
  if (!ml || ml.src !== live || ml.applied > hist.length) {
    ml = { src: live, g: makeEngine(mode, live.multi ? live.seats : null, gs, gtraits, gclasses).game, applied: 0, ri: 0, ai: 0, items: [], drawn: 0 };
    list.innerHTML = '';
  }
  ml.caps = ml.caps || [];
  while (ml.applied < hist.length) {
    while (ml.ri < resignLog.length && resignLog[ml.ri].at <= ml.applied) { ml.g.resign(resignLog[ml.ri].seat); ml.ri++; }
    const abs = live.abLog ? live.abLog() : [];
    while (ml.ai < abs.length && abs[ml.ai].at <= ml.applied) { ml.g.move(abs[ml.ai]); ml.ai++; }
    const e = hist[ml.applied], who = ml.g.multi || ml.g.bug ? null : ml.g.turn;
    let text = '?', cls = '';
    try {
      text = mlText(ml.g, e);
      const p = ml.g.bug ? ml.g.at(e.board, e.fx, e.fy) : ml.g.layers ? ml.g.at(e.fx, e.fy, e.fl) : ml.g.at(e.fx, e.fy);
      cls = ml.g.bug ? 'm-' + e.seat : ml.g.multi ? 'm-' + (e.c || (p && p.c)) : 'p-' + (p ? p.c : 'w');
      if (e.c === 'n') text = '◆' + text;
    } catch (x) { /* keep placeholder */ }
    let mover = who; try { if (e.c === 'n') mover = 'n'; else if (ml.g.multi) mover = e.c || (ml.g.at(e.fx, e.fy) || {}).c; } catch (x) { /* unknown mover */ }
    if (ml.tally === undefined) ml.tally = capTally(ml.g);
    if (e.c === 'n') ml.g.neutralApply(e); else ml.g.move(e);
    { const aft = capTally(ml.g); ml.caps.push(ml.tally && aft ? capDiff(ml.tally, aft, mover) : []); ml.tally = aft; }
    ml.items.push({ text, cls, who }); ml.applied++;
  }
  for (; ml.drawn < ml.items.length; ml.drawn++) {
    const i = ml.drawn, it = ml.items[i];
    let num = null;
    if (!live.multi) { if (it.who == null) { if (i % 2 === 0) num = i / 2 + 1; } else if (it.who === 'w' && (i === 0 || ml.items[i - 1].who !== 'w')) num = ml.mn = (ml.mn || 0) + 1; }
    if (num) { const n = document.createElement('span'); n.className = 'mn'; n.textContent = num + '.'; list.appendChild(n); }
    const c = document.createElement('span'); c.className = 'mv ' + it.cls; c.textContent = it.text; c.dataset.i = i;
    c.onclick = () => { if (!replay) enterReplay(); if (replay) setReplayPly(i + 1); };
    list.appendChild(c);
  }
  const cur = replay ? replay.ply : -1;
  list.querySelectorAll('.mv').forEach(c => c.classList.toggle('cur', +c.dataset.i === cur - 1));
  $('moveCount').textContent = '(' + hist.length + ')';
  if (!replay && ml.scrolled !== hist.length) { list.scrollTop = list.scrollHeight; ml.scrolled = hist.length; }
  renderCaptured();
}

