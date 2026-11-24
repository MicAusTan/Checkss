// ---- Swap trait: pick two of your pieces ----
let swapMode = false, swapFirst = null, pendingFriendly = null, tributeMode = false;
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
  const tg = game.at(x, y), lc = !!(cand.length && cand[0].tt === 'lcastle');      // a long castle (Crown Link) is once per game: it asks for a second click on the rook, whoever owns it
  if (!sel || !cand.length || !tg || (!lc && (tg.c !== meId() || cand[0].castle || cand[0].swap || cand[0].ward || cand[0].join || cand[0].rev || cand[0].tt))) return false;      // (a Sacrificer's own square is not a friendly-fire target)
  const from = sel.x + ',' + sel.y;
  if (pendingFriendly && pendingFriendly.x === x && pendingFriendly.y === y && pendingFriendly.from === from) { pendingFriendly = null; return false; }
  pendingFriendly = { x, y, from, lc }; render(); return true;
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
// Tribute (team trait): sacrifice one of your pieces; your next teammate gets an extra move
function tributeEligible() { return !!(game && game.multi && game.canTribute && !spectating && !replay && !draft && !M && !ended() && myTurnNow() && game.canTribute(meId())); }
async function tributeClick(x, y) {
  const p = game.at(x, y); if (!p || p.c !== meId() || !game.tributeOk(meId(), x, y)) { addChat('', p && p.t === 'k' ? 'Tribute: the king cannot be sacrificed.' : 'Tribute: pick one of your own pieces (it must not leave your king in check).', true); return; }
  if (!(await askConfirm('Sacrifice your ' + (PNAMES[p.t] || 'piece') + ' on ' + sqName(x, y) + '? This is your move, and your next teammate gets an extra move.', 'Sacrifice', true))) return;
  if (!tributeMode || !tributeEligible()) return;
  tributeMode = false; sel = null; playMulti({ tt: 'tribute', fx: x, fy: y, tx: x, ty: y });
}
$('tributeBtn').onclick = () => { tributeMode = !tributeMode; swapMode = false; swapFirst = null; sel = null; render(); };
const ttText = (e, sq) => {                       // the move list for team trait actions
  const A = sq(e.fx, e.fy), Z = sq(e.tx, e.ty), pr = e.promo ? '=' + (GLYPH[e.promo] || e.promo) : '';
  return e.tt === 'switch' ? A + '⇄' + Z + pr + ' (switch)' : e.tt === 'double' ? 'K' + A + '⇄' + Z + ' (body double)' : e.tt === 'anchor' ? A + '⚓' + Z
    : e.tt === 'lcastle' ? 'K' + A + '⇄' + Z + ' (long castle)' : e.tt === 'tether' ? 'K' + A + '–' + Z + ' +🔗 ' + sq(e.qx, e.qy) + '–' + sq(e.px, e.py) : e.tt === 'tribute' ? 'tribute ' + A + ' ✝' : '';
};
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
  ['k', 'King', 'One step any direction, or onto any square next to a friendly piece within 2 squares of it (captures there only inside its own 5×5). Aura (7×7): friendly pawns walk one step further (and keep that for one more turn after leaving it); Guards, Archers, Chariots, Sappers, Catapults and Jesters can’t be captured by pawns. An original King that reaches the promotion zone becomes the High King.'],
  ['q', 'Queen', 'Moves like a standard queen. Aura (5×5): Pawns also capture straight; Rooks, Bishops, Knights, Grands, Lancers and Raiders can’t be captured by pawns. An original Queen that reaches the promotion zone becomes the High Queen.'],
  ['y', 'Prince', 'Captures on the 5×5 around it (no corners); also steps to the 4 corners and 3 squares straight. Blockable. Pawns, Pikemen and Skirmishers can never take it. While the Princess/Archduchess is within 2 squares it also can’t be shot, nor captured from more than 3 squares away. One at a time, promotion only. On the last rank it becomes the Archduke.'],
  ['z', 'Princess', 'Steps 1 any direction; shoots the outer ring of the 5×5 and 3 straight without moving. Pawns, Pikemen and Skirmishers can never take her. While the Prince/Archduke is within 2 squares she can’t be captured by ordinary moves (she can still be shot). One at a time, promotion only. On the last rank she becomes the Archduchess.'],
  ['r', 'Rook', 'Slides along ranks and files.'], ['b', 'Bishop', 'Slides diagonally.'], ['n', 'Knight', 'Leaps in an L.'],
  ['R', 'Grand Rook', 'Rook plus knight jumps that move AND capture (a Rook near your Emperor gets the jumps as moves only). Promoted from an original Rook at the zone.'],
  ['B', 'Grand Bishop', 'Bishop plus 1–3 squares straight (a Bishop near your Empress gets 1–2).'],
  ['N', 'Grand Knight', 'Leaps to any square on the outer ring of the 5×5.'],
  ['g', 'Guard', 'King moves and captures; also steps 2 straight or onto empty squares around a nearby friend. Archers can’t hit it or its neighbours. An original Guard in the promotion zone becomes a Grand Guard.'],
  ['h', 'Chariot', 'Slides 2 straight plus the knight squares beside each lane (a blocker cuts them off). An original Chariot in the promotion zone becomes a Grand Chariot.'],
  ['f', 'Jester', 'Never captures by itself. Hops to the opposite-colour squares of its 5×5 (light ↔ dark). Also copies the moves (and captures) of any FRIENDLY piece within its 3×3 (never enemy pieces) except other Jesters, Imperials and ranged pieces. An original Jester in the promotion zone becomes a Grand Jester.'],
  ['u', 'Archer', 'Steps 1–2 straight. Shoots 12 squares around it (the 5×5 ring without corners and without the squares right beside it) without moving, can’t be blocked. An original Archer in the promotion zone becomes a Grand Archer.'],
  ['s', 'Sapper', 'Leaps 1 diagonal or 2 straight; never captures. If the landing square is occupied it hops on to the next one in that line. After moving it may place a wall next to itself (once per 2 turns). An original Sapper in the promotion zone becomes a Grand Sapper.'],
  ['t', 'Catapult', 'Walks 1 in any direction or 1–3 straight. It faces one way (a small marker shows which; it starts facing forward) and turns to face the direction of every straight walk; a diagonal step keeps its facing. Fires on 7 squares ahead of where it faces; hitting the middle of the far row splashes both sides. Reloads for 2 turns after firing, and can’t move on the turn right after. An original Catapult in the promotion zone becomes a Grand Catapult.'],
  ['p', 'Pawn', 'Steps 1 (up to 3 on its first move), captures diagonally. In the king’s aura it steps 2. On the 4-player cross board pawns walk 2 after their first move and 3 in the aura (the wide 2v2 board is like the 2-player board).'],
  ['v', 'Pikeman', 'Pawn that also captures straight ahead. Promotes to a Lancer too.'],
  ['m', 'Skirmisher', 'Pawn that can also step sideways. Promotes to a Raider too.'],
  ['j', 'Lancer', 'Faces one way (a small marker shows which; it starts facing forward). Walks 1–3 straight ahead (move only); thrusts at any of the 4 squares ahead, and at the two diagonal-forward squares (1 ahead) when something stands there, without moving; nothing can block a thrust. Lunges to capture at 5–6 ahead; steps 1–2 forward-diagonally and jumps (±1,3); retreats or captures 1–2 straight back; steps 1–2 sideways (move only), which turns it to face that way. On the last rank it becomes the Champion.'],
  ['d', 'Raider', 'Slides sideways up to 5 and may hop over ONE piece (beyond it, capture only); 3 forward or back; (±3,±1) leaps. “Sideways” is across its own seat’s board. On the last rank it becomes the Marauder.'],
  ['א', 'Grand Guard', 'Like the Guard, but rallies onto squares around any friend within 3. No ranged piece can hit it or the pieces beside it.'],
  ['ב', 'Grand Chariot', 'Slides 1–3 straight and may hop over one piece (it may land on any empty square beyond, or capture); knight squares at distance 2 and the (3,±1) squares at distance 3; a blocked long leg may hold one piece.'],
  ['ג', 'Grand Archer', 'Steps to its 3×3 (move only) and 1–2 straight. Shoots 24 squares without moving, can’t be blocked: the 12 of the Archer, the 4 (2,2) corners and the straight lines at 3 and 4.'],
  ['ד', 'Grand Sapper', 'Like the Sapper, plus (2,2) leaps and single steps in the four straight directions (still never captures). After EVERY move it gets up to TWO actions (no cooldown), each a wall on an empty neighbouring square OR a WARD on a friendly piece in its 3×3 (or itself; never an Imperial). A warded piece (blue ring) cannot be taken: the first capture attempt on it before its owner’s next turn fails and is used up. Sliders stop on the square before it, steps and leaps stay put, a shot is wasted (a Catapult still reloads). Its walls look different and last one round longer. Two Grand walls touching diagonally seal the gap: no diagonal step or slide passes through it (leapers do).'],
  ['ה', 'Grand Catapult', 'Like the Catapult but fires on 11 squares ahead, and EVERY shot splashes the squares orthogonally next to the target, but only those it could itself reach (never friends or Imperials).'],
  ['ו', 'Grand Jester', 'Like the Jester, but also copies friends on the opposite-colour squares of its 5×5, and an adjacent friendly Imperial (from the Imperial’s square, opposite-colour squares only).'],
  ['ז', 'High Queen', 'Queen plus knight moves (move and capture); slides may hop over one piece (captures only beyond it). Aura 7×7. Pawns can never take her.'],
  ['ח', 'High King', 'Like the King with rally radius 3 (captures only inside radius 3). Aura 9×9, and pawns remember it for 2 turns. Pawns can never take him.'],
  ['ט', 'Champion', 'Lancer’s second form. Thrusts 1–5 ahead and impales: also hits the enemy directly behind the target. Flank squares (±1,1) and (±1,2) are thrusts; jumps (±1,3) and (±1,4); lunge 6–7; walks 1–4 ahead, 1–3 sideways (move only) and 1–3 back (move or capture).'],
  ['י', 'Marauder', 'Raider’s second form. Slides 7 sideways hopping up to TWO pieces (captures only beyond the first), 4 forward or back, leaps (±3,±1) and (±4,±1).'],
  ['כ', 'Archduke', 'Prince’s second form. Moves and captures on the full 5×5, the (3,1)-type squares and 3 straight; 4 straight is move only. Blockable. Pawns can never take him. While a Princess/Archduchess is within 3 he can’t be shot, nor captured from more than 3 away.'],
  ['ל', 'Archduchess', 'Princess’s second form. Steps 1 and jumps (2,2) (move only). Shoots everything the Princess does plus the diagonal arm out to (4,4) (line of sight) and the (3,2)-type squares: 36 squares. Pawns can never take her. While a Prince/Archduke is within 3 she can’t be captured by ordinary moves.'],
  ['#', 'Wall', 'Blocks movement and lines. Belongs to the Sapper’s player (shown in their colour): only enemies can capture it, by moving onto it. Ranged shots pass over it.'],
  ['#g', 'Grand wall', 'Raised by a Grand Sapper (up to two per move, no cooldown). Lasts one round longer than a normal wall. Two Grand walls touching diagonally seal the gap between them: no diagonal step or slide passes through it (leapers do). Otherwise it behaves like a wall.']
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
    let g; try { g = kind === 'promo' ? Promotion.diagram(t, Object.assign({ R: 5 }, st.o)) : kind === 'imp' ? Diagrams.gridImp(Imperial, t, Object.assign({ R: '\u05d8\u05d9'.includes(t) ? 7 : 5 }, st.o)) : kind === 'oct' ? Diagrams.gridOct(Engine, t, Object.assign({ R: 5 }, st.o)) : Diagrams.grid2p(Engine, variant, t, Object.assign({ R: 5 }, st.o)); } catch (e) { return; }
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
  $('pieceGuide').innerHTML = PIECE_GUIDE.map(([t, n, d]) => guideRow(t, n, d, IMP_KQ[t] || glyphHTML(t), t[0] !== '#')).join('');
  wireGuide($('pieceGuide'), 'imp');
}
const IMP_NAMES = { p:'Pawn', v:'Pikeman', m:'Skirmisher', r:'Rook', b:'Bishop', n:'Knight', q:'Queen', k:'King', R:'Grand Rook', B:'Grand Bishop', N:'Grand Knight', E:'Emperor', X:'Empress', H:'Heir', g:'Guard', h:'Chariot', u:'Archer', f:'Jester', s:'Sapper', t:'Catapult', y:'Prince', z:'Princess', j:'Lancer', d:'Raider', '#':'wall', '#g':'Grand wall', 'א':'Grand Guard', 'ב':'Grand Chariot', 'ג':'Grand Archer', 'ד':'Grand Sapper', 'ה':'Grand Catapult', 'ו':'Grand Jester', 'ז':'High Queen', 'ח':'High King', 'ט':'Champion', 'י':'Marauder', 'כ':'Archduke', 'ל':'Archduchess' };
function impText(g, e) {
  const A = sqName(e.fx, e.fy), Z = sqName(e.tx, e.ty), P = GLYPH[e.by] || '';
  if (e.skip) return P + A + ' done';
  if (e.wall) return P + ' wall ' + Z;
  if (e.ward) return P + ' ward ' + (e.tx === e.fx && e.ty === e.fy ? 'self' : Z);
  if (e.bump) return P + A + '⊘' + Z + ' (warded)';
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
  if (e.tt) return ttText(e, sq);
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

