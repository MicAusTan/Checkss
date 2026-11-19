/* ============ GAME UI ============ */
function play(m) { if (replay || spectating) return; if (game.multi) return playMulti(m); if (!game.move(m)) { sel = null; render(); return; } send({ type: 'move', m }); sel = game.pend && game.turn === myColor ? { x: game.pend.x, y: game.pend.y } : null; announce(); render(); }

const promoHome = { parent: $('promo').parentNode, next: $('promo').nextSibling };
const promoMount = pop => { const p = $('promo'); if (pop) { if (p.parentNode !== document.body) document.body.appendChild(p); } else if (p.parentNode === document.body) promoHome.parent.insertBefore(p, promoHome.next); };
const promoKind = () => (game.imperial ? 'imp' : game.promotion ? 'promo' : game.oct ? 'oct' : MODES[mode] && MODES[mode].grand ? 'grand' : null);
const pieceName = t => PNAMES[t] || [PIECE_GUIDE, GRAND_GUIDE, OCT_GUIDE].reduce((r, L) => r || (L.find(e => e[0] === t) || [])[1], null) || t;      // (the names live in the piece guides)
const promoTips = new Map();
function promoTip(t) {                                      // a movement diagram for a custom piece (the usual four need none); built once per piece
  const kind = promoKind(); if (!kind || 'qrbn'.includes(t)) return null;
  const key = kind + '|' + mode + '|' + t; if (promoTips.has(key)) return promoTips.get(key);
  let node = null; try { node = diagramBlock(kind, t, glyphHTML(t), kind === 'grand' ? MODES[mode].v : undefined); } catch (e) { node = null; }
  promoTips.set(key, node); return node;
}
function showPromoPop(cands, onPick) {                      // returns false when the target square cannot be found (the old bar is used then)
  const m0 = cands[0], q = (x, y) => document.querySelector('#board .sq[data-x="' + x + '"][data-y="' + y + '"]');
  const sq = q(m0.tx, m0.ty); if (!sq) return false;
  const fromSp = (q(m0.fx, m0.fy) || document.createElement('div')).querySelector('span');
  const cls = fromSp ? fromSp.className : (game.multi ? 'pc-' + mySeat : myColor === 'w' ? 'w-piece' : '');
  const p = $('promo'); promoMount(true); p.innerHTML = ''; p.style.cssText = ''; p.className = 'pop';
  const r = sq.getBoundingClientRect(), S = Math.max(44, Math.min(72, Math.round(r.width))), br = $('board').getBoundingClientRect();
  const panel = cands.length > 5 || !!game.promotion || cands.some(m => m.px != null), down = (r.top - br.top) < br.height / 2;
  p.classList.toggle('panel', panel); p.classList.toggle('up', !down); p.style.setProperty('--s', S + 'px');
  const tipBox = document.createElement('div'); tipBox.className = 'ptipbox hidden'; p.appendChild(tipBox);
  const hide = () => { p.classList.add('hidden'); tipBox.classList.add('hidden'); };
  const showTip = (t, nm) => {
    const node = promoTip(t); if (!node) { tipBox.classList.add('hidden'); return; }
    tipBox.innerHTML = ''; const h = document.createElement('div'); h.className = 'pt-name'; h.textContent = nm; tipBox.appendChild(h); tipBox.appendChild(node); tipBox.classList.remove('hidden');
    const pr = p.getBoundingClientRect(), tw = tipBox.offsetWidth, th = tipBox.offsetHeight;
    tipBox.style.left = (pr.right + 8 + tw < innerWidth ? pr.width + 8 : -(tw + 8)) + 'px'; tipBox.style.top = Math.min(0, innerHeight - (pr.top + th) - 8) + 'px';
  };
  cands.forEach(m => {
    const b = document.createElement('button'); b.type = 'button';
    const ic = document.createElement('span'); setGlyph(ic, m.promo, game.multi ? mySeat : myColor); ic.className = cls; b.appendChild(ic);
    const nm = pieceName(m.promo) + (m.px != null ? ' → ' + sqName(m.px, m.py) : '');
    if (panel) { const s = document.createElement('small'); s.textContent = nm; b.appendChild(s); }
    b.title = 'Promote to ' + nm;
    b.onmouseenter = b.onfocus = () => showTip(m.promo, nm); b.onmouseleave = b.onblur = () => tipBox.classList.add('hidden');
    b.onclick = () => { hide(); if (onPick) onPick(m); else play(m); };
    p.appendChild(b);
  });
  const x = document.createElement('button'); x.type = 'button'; x.className = 'x'; x.textContent = panel ? '✕ Cancel' : '✕'; x.title = 'Cancel'; x.onclick = hide; p.appendChild(x);
  p.style.left = '0px'; p.style.top = '0px'; p.classList.remove('hidden');
  const pw = p.offsetWidth, ph = p.offsetHeight;
  let left = panel ? r.left + r.width / 2 - pw / 2 : r.left, top = panel ? (down ? r.bottom + 6 : r.top - ph - 6) : (down ? r.top : r.bottom - ph);
  if (ph > innerHeight - 12) { p.style.maxHeight = (innerHeight - 14) + 'px'; p.style.overflowY = 'auto'; top = 6; }      // never taller than the window
  p.style.left = Math.max(4, Math.min(innerWidth - p.offsetWidth - 4, left)) + 'px'; p.style.top = Math.max(4, Math.min(innerHeight - p.offsetHeight - 4, top)) + 'px';
  return true;
}
function showPromo(cands, onPick) {
  const p = $('promo');
  if (cands.length > 1 && cands.every(m => m.promo && m.tx === cands[0].tx && m.ty === cands[0].ty) && showPromoPop(cands, onPick)) return;
  promoMount(false); p.style.cssText = ''; p.className = ''; p.innerHTML = ''; p.classList.toggle('pc', !!game.promotion);
  cands.forEach(m => {
    const b = document.createElement('button');
    const big = t => art(t) || '<span style="font-size:2.1rem;line-height:1">' + GLYPH[t] + '</span>';
    b.innerHTML = game.promotion ? (m.promo ? big(m.promo) + '<span>' + (PNAMES[m.promo] || '') + (m.px != null ? ' → ' + sqName(m.px, m.py) : '') + '</span>' : (game.at(m.fx, m.fy) ? big(game.at(m.fx, m.fy).t) : '') + '<span>' + (m.shot ? 'Shoot (stay put)' : m.swap ? 'Swap' : m.exit ? 'Leave the board' : m.bump ? 'Bump (it holds)' : m.push ? 'Push it' : m.squish ? 'Squish it' : m.vx != null ? 'via ' + sqName(m.vx, m.vy) : cands.some(x => x.promo) ? 'Stay' : 'Move') + '</span>')
      : m.tt === 'tether' ? '🔗 Step + pull partner king to ' + sqName(m.px, m.py) : m.tt ? 'Move' : m.claim ? '⚔ Claim the Boss' : m.claim === false ? '☠ Kill it (then bring a fallen piece back)' : m.promo ? glyphHTML(m.promo, game.multi ? mySeat : myColor) : m.rev ? '↺ ' + glyphHTML(m.rev) : m.free ? 'Free step' : 'Move';
    b.title = m.promo && game.promotion ? 'Promote to ' + (PNAMES[m.promo] || '') + (m.px != null ? ', placed on ' + sqName(m.px, m.py) : '') : !m.promo && game.promotion ? (m.shot ? 'Capture it without moving' : m.swap ? 'Swap places' : m.exit ? 'Leave the board here: nothing can touch it while it is outside' : m.bump ? 'The Juggernaut survives the first capture attempt: you stop next to it and your turn is over' : m.push ? 'Push it one square' : m.squish ? 'Squish it (it has nowhere to go)' : m.vx != null ? 'First leg on ' + sqName(m.vx, m.vy) + ', then one more step' : cands.some(x => x.promo) ? 'Stay as it is (no promotion)' : 'Move there') : m.promo ? 'Promote' : m.rev ? 'Revive ' + PNAMES[m.rev] : m.free ? 'Herald: free step (your turn goes on)' : 'Normal move';
    b.onclick = () => { p.classList.add('hidden'); if (onPick) onPick(m); else play(m); };
    p.appendChild(b);
  });
  if (onPick) { const cb = document.createElement('button'); cb.textContent = 'Cancel'; cb.onclick = () => p.classList.add('hidden'); p.appendChild(cb); }
  p.classList.remove('hidden');
}

function clickSq(x, y) {
  if (draft || replay || spectating) return;
  if (swapMode) return swapClick(x, y);
  if (abMode) return abClick(x, y);
  if (foeClick(x, y)) return;
  $('promo').classList.add('hidden');
  if (ended() || game.turn !== myColor) return;
  if (sel) {
    const cand = sel.drop
      ? game.drops().filter(m => m.drop === sel.drop && m.tx === x && m.ty === y)
      : selMoves().filter(m => m.tx === x && m.ty === y);
    if (friendlyPending(x, y, cand)) return;
    if (cand.length) { cand.length > 1 || (game.promotion && cand[0].bump) ? showPromo(cand.map(withCk)) : play(withCk(cand[0])); return; }
    const own = game.at(x, y) && game.at(x, y).c === myColor;
    if (MODES[mode].v.hidden && !sel.drop && !own && !(x === sel.x && y === sel.y)) {
      addChat('', 'Referee: illegal move, try again.', true); return;
    }
  }
  const p = game.at(x, y);
  sel = (p && !p.wall && p.c === myColor && !(sel && sel.x === x && sel.y === y)) ? { x, y } : null; selIdx = 0;
  render();
}

const hasReviveUnit = () => { for (let y = 0; y < game.h; y++) for (let x = 0; x < game.w; x++) { const p = game.at(x, y); if (p && p.c === (game.multi ? mySeat : myColor) && (p.t === '\u03bc' || p.t === '\u03b9')) return true; } return false; };
function renderHand(c, el) {
  el.innerHTML = '';
  if (!MODES[mode].v.drops) return;
  const hand = game.hand(c);
  'qrbnpciwoal'.split('').forEach(t => {
    if (!(hand[t] > 0)) return;
    const b = document.createElement('button');
    b.innerHTML = glyphHTML(t, game.multi ? mySeat : myColor) + '×' + hand[t];
    if (sel && sel.drop === t && c === myColor) b.className = 'on';
    b.onclick = () => {
      if (c !== myColor || ended() || game.turn !== myColor) return;
      sel = (sel && sel.drop === t) ? null : { drop: t }; render();
    };
    el.appendChild(b);
  });
}

function matchLine() {
  const me = myColor, opp = me === 'w' ? 'b' : 'w', r = M.lastRes, fin = M.round >= M.s.rounds;
  const outcome = r === 'd' ? (M.why === 'stalemate' ? 'Round drawn by stalemate.' : M.why === 'draw' ? 'Round drawn: not enough material.' : 'Round drawn.') : (r === me ? 'You won the round!' : 'You lost the round.');
  const sc = 'Score: you ' + M.scores[me] + ' – ' + M.scores[opp] + ' opponent.';
  const tail = fin
    ? (M.scores[me] > M.scores[opp] ? ' You win the match!' : M.scores[me] < M.scores[opp] ? ' You lose the match.' : ' The match is drawn.')
    : ' Press Continue to adjust your setup.';
  return 'Round ' + M.round + '/' + M.s.rounds + ': ' + outcome + ' ' + sc + tail;
}

function bugStatus() {
  const g = game, r = g.result;
  if (r) {
    if (r.team === null) return 'Game drawn. Both boards are stuck.';
    const w = g.winner();
    return 'Game over: ' + teamNames(w) + (sameSide(w, mySeat) ? ' (you) win!' : ' win.') + (r.why === 'checkmate' ? ' (checkmate on Board ' + r.board + ')' : ' (' + CN[r.loser] + ' resigned)');
  }
  const [bd, col] = g.info[mySeat], mine = g.canMove(mySeat), opp = g.seatOf(bd, col === 'w' ? 'b' : 'w');
  let t = (mine ? 'Your move' : 'Waiting for ' + CN[opp]) + ' (you are ' + CN[mySeat] + ', Board ' + bd + ', partner ' + CN[g.partner[mySeat]] + ')';
  if (g.inCheck(bd)) t += mine ? ' · You are in check!' : ' · ' + CN[opp] + ' is in check';
  if (g.stuck(bd)) t += mine ? ' · No legal move: wait for a piece from your partner' : ' · They have no legal move and must wait for a piece';
  return t;
}

function multiStatus() {
  if (game.bug) return bugStatus();
  { const rw = game.reward && game.reward(); if (rw && !game.winner()) return rw.c === mySeat ? 'The Boss is dead! Choose a fallen piece to bring back, then a square on your side.' : CN[rw.c] + ' killed the Boss and is choosing a piece to bring back.'; }
  if (game.drawn) return 'Game drawn: ' + (drawWhy() || 'nobody left can move') + '.';
  const w = game.winner();
  if (w) return 'Game over: ' + teamNames(w) + (sameSide(w, mySeat) ? ' (you) win!' : game.teams ? ' win.' : ' wins.');
  if (!game.alive(mySeat)) return 'You are eliminated and spectating. ' + CN[game.turn] + "'s turn.";
  const hidK = MODES[mode].v.hidden;
  if (game.pend) return game.turn === mySeat ? 'Sapper: click it, then a highlighted square for a wall (or click the Sapper itself to skip).' : CN[game.turn] + ' is placing a wall…';
  if (game.neutralPending) return 'Neutral pieces are moving…';
  return (game.turn === mySeat ? 'Your turn' : CN[game.turn] + "'s turn") + ' (you are ' + CN[mySeat] + (game.teams ? ', partner: ' + (game.seats.filter(c => c !== mySeat && game.teams[c] === game.teams[mySeat]).map(c => CN[c]).join('') || 'none') : '') + ')' +
         (MODES[mode].v.movesPerTurn > 1 ? ' · ' + game.left + ' move' + (game.left > 1 ? 's' : '') + ' left' : '') +
         (!hidK && game.inCheck(game.turn) ? ' · ' + CN[game.turn] + ' is in check!' : '');
}

$('promoGuide') && $('promoGuide').addEventListener('toggle', () => { if ($('promoGuide').open) fillPromoGuide(); });
const promoT3Text = () => {      // the tier-3 pawn conditions as text (from Promotion.COND2.pawnT3)
  const T = Promotion.COND2.pawnT3, sv = 'survives ' + T.survive + ' of your turns after promoting';
  return { j: 'pushes or squishes ' + T.jugPush + ' piece' + (T.jugPush > 1 ? 's' : '') + ', or ' + sv, g: T.gemDouble + ' double-move turns (both actions used), or ' + T.gemCaps + ' capture' + (T.gemCaps > 1 ? 's' : '') + ', or ' + sv };
};
const promoT2Text = () => {      // the tier-2 conditions as text (they come from Promotion.COND2, so this never goes stale)
  const X = Promotion.COND2, pl = (n, w) => n + ' ' + w + (n > 1 ? 's' : ''), z = X.kingAllyRadius * 2 + 1;
  return {
    b: pl(X.bishopCaps, 'more capture') + (X.bishopBackRank ? ', or a move ending on the opponent\'s back rank' : ''),
    n: pl(X.knightCaps, 'capture') + ' ending in the enemy half' + (X.knightChecks ? ', or giving check' + (X.knightChecks > 1 ? ' ' + X.knightChecks + ' times' : '') : ''),
    r: pl(X.rookCaps, 'more capture') + ', or ' + X.rookSlide + ' more squares slid',
    q: X.queenChecks + ' checks given by moves ending in the enemy half, or capturing a Rook',
    k: pl(X.kingCaps, 'capture') + ' by the King, or ' + X.kingEnemyHalfMoves + ' non-forced King moves ending in the enemy half, or a friendly capture within ' + z + '\u00d7' + z + ' squares of the King (credited at once; offered on the King\'s next move)'
  };
};
function fillPromoRules() {
  const el = $('promoBody'); if (el.dataset.done) return; el.dataset.done = '1';
  const C = Promotion.COND, X = Promotion.COND2, t2text = promoT2Text();
  el.innerHTML = '<h4>Goal</h4><ul><li>Normal chess (checkmate the enemy King), but <b>every piece type can promote</b> once it has done something special. Promoted pieces keep their old moves and gain new ones. Every form, with a "Show moves" diagram and notes, is in the <b>Piece guide</b>.</li></ul>'
    + '<h4>How a promotion works</h4><ul><li>When the piece you just moved has met its condition, a chooser appears: pick a form, or <b>Stay</b> as you are. Staying costs nothing, and the chooser comes back after any later move of that piece that adds to its count.</li><li>Select one of your pieces to see its progress in the status line.</li><li>When a piece promotes, its count starts again from zero for the next promotion.</li></ul>'
    + '<h4>Conditions (first promotion)</h4><ul><li><b>Bishop</b>: makes ' + C.bishopCaps + ' captures in total.</li><li><b>Knight</b>: ' + C.knightStreak + ' moves of that Knight in a row, each ending in the enemy half (a move ending outside resets the count).</li><li><b>Rook</b>: slides ' + C.rookSlide + ' squares in total.</li><li><b>Queen</b>: gives ' + C.queenChecks + ' checks (a discovered check counts, but the Queen must be the piece that moved).</li><li><b>King</b>: ' + C.kingMoves + ' of your first ' + C.kingWindow + ' moves are King moves (castling and moves made while in check do not count).</li></ul>'
    + '<h4>Second promotion (tier 2)</h4><ul><li>A tier-1 form can promote again (but not one a pawn became: those are final) once it has done more, counted from the moment it promoted. Any tier-1 form of a piece type can go to any tier-2 form of that type.</li><li><b>Bishop forms</b>: ' + t2text.b + '.</li><li><b>Knight forms</b>: ' + t2text.n + '.</li><li><b>Rook forms</b>: ' + t2text.r + '.</li><li><b>Queen forms</b>: ' + t2text.q + '.</li><li><b>King forms</b>: ' + t2text.k + '.</li></ul>'
    + '<h4>Third promotion (tier 3, pawns only for now)</h4><ul><li>A tier-2 <b>Juggernaut</b> can become a <b>Titan</b> when it ' + promoT3Text().j + '.</li><li>A tier-2 <b>Gemini</b> can become a <b>Mirror</b> when it ' + promoT3Text().g + '.</li><li>The Vanguard has no tier-3 form yet. Tier-3 forms are final.</li></ul>'
    + '<h4>Pawns</h4><ul><li>A pawn reaching the last rank may <b>stay a pawn</b>, become a Queen, Rook, Bishop or Knight (final: that piece never promotes again), or become a <b>tier-1 pawn</b> (Courier, Strafer, Brawler), which is placed straight away on the square(s) described in the guide.</li><li><b>Piece limits:</b> a pawn can only become a Queen-type piece if you have fewer than ' + X.promoCaps.q + ' Queen-type piece(s) (the Queen and her promoted forms count), and a Rook-, Bishop- or Knight-type piece if you have fewer than ' + X.promoCaps.r + ' of that type. Pieces outside the board (Phantom) count. If a type is full, that choice does not appear. Lose a piece and the slot opens again.</li><li>A tier-1 pawn becomes a tier-1 piece form or a tier-2 pawn (same limits). A piece form a pawn became is <b>final</b>: it never promotes again.</li><li>A pawn that stays on the last rank can promote later: select it and click where it should go. It <b>promotes and moves in one action</b> (the promoted piece must make a move that turn; a pawn form\'s placement is that move).</li><li>A tier-1 pawn reaching the last rank may stay, or become any tier-1 piece form except the royal ones, or a tier-2 pawn (Vanguard, Gemini or Juggernaut, which never promote).</li><li>The new pawns never capture, or get captured, en passant.</li></ul>'
    + '<h4>Special rules</h4><ul><li><b>Royal forms</b> (Sovereign, Warlord, Chamberlain, Monarch, Tyrant, Tarzan) are still your King: a royal piece only gives check from the 8 squares around it, and is never captured. Tarzan: you lose if it is your only piece left.</li><li><b>Phantom</b>: after it leaves the board it is outside for at most ' + X.phantomTurns + ' of your turns. When it is your turn, a "Bring it back" row appears above the board; on its last turn it must come back (if it can), otherwise it is lost. It never captures a King, so it never gives check.</li><li><b>Juggernaut</b>: attacks on it from the front (straight ahead, diagonally ahead and in between) are simply blocked. From the sides or behind it survives the FIRST capture attempt: a sliding attacker stops on the square next to it, a leaping attacker stays where it is, and the turn is spent; after that it is an ordinary target from those sides. Enemy pieces cannot land on the squares in front of and beside it (so they cannot capture or check there). It steps 1 forward, left or right, and can walk into an enemy piece only in the 3 squares in front of it: the piece is pushed one square, or squished when there is no room. It never moves onto a King.</li><li><b>Gemini</b>: two moves in one turn; each is up to 2 squares forward or a diagonal capture; the second one is optional; never two captures; a first move that gives check ends the turn. Click the final square (the chooser shows the route if there are several).</li><li><b>Two-part moves</b> (Pinwheel, Valkyrie) are one move: click the square she ends on; the chooser shows "via ..." when two routes lead there.</li></ul>';
}

/* ---------- Promotion Chess piece guide: hand-written notes per form (the rules text and the diagrams come from the engine) ---------- */
const PROMO_TIPS = {
  pawn: 'On the last rank it may stay a pawn, become a plain Q/R/B/N (final, and only if you hold fewer than the cap: 1 Queen, 2 of each other piece) or one of the three tier-1 pawns. A pawn that stays can still promote later.',
  courier: 'Moves 1 or 2 forward EVERY time, so it is hard to stop and wins tempo. It is placed on the first three ranks of its own file, so a promoted pawn can go straight back home and run again.',
  strafer: 'Its sideways steps (move only) let it change file and dodge pawn captures. It can be placed on any empty square of its starting rank: you pick the file you want to attack on.',
  brawler: 'Captures straight ahead, so enemy pieces in front of it are not safe, and it also hits the squares beside it. It returns to its own start square, capturing whatever is there (even your own piece, never a King).',
  vanguard: 'Reaches 3 squares ahead and beside, and it WRAPS: a Vanguard on the last rank looks at the enemy\'s ranks from the other side. Its attacks wrap too, so it can give check across the edge of the board.',
  titan: 'The wall that wins: nothing hits it from the front or the sides, so the only way to kill it is from behind (the first attempt fails and costs the turn). It pushes whole chains of up to 3 pieces, which squishes whatever is at the back against the edge or another piece. Slow, so keep it near walls.',
  mirror: 'Two actions a turn and both may capture. Swapping with a friendly piece within 3 lets you bring a piece to a new square or file, then step or capture with the Mirror. It never captures with its forward double step. Like the tier-2 pawns, the squares ahead wrap past the last rank (backward steps do not).',
  gemini: 'Two moves a turn: capture then step away, or step then capture. It can never capture twice, and a first move that gives check ends the turn.',
  juggernaut: 'Nothing can hurt it from the front, so attack it from the sides or behind (the first attempt fails and costs you the turn). It cannot capture, but it pushes or squishes pieces in the 3 squares ahead, and enemy pieces cannot land beside or in front of it: a moving wall.',
  abbot: 'The quiet orthogonal step lets a bishop change square colour without a capture.',
  inquisitor: 'Its orthogonal step only captures: it attacks the four squares next to it, and changes square colour by capturing there.',
  zealot: 'Your own pieces never block it: it slides straight through your pawn chain. It still stops at, and can capture, the first enemy piece.',
  primate: 'Step orthogonally (move or capture) and also leap 2 squares straight over anything (move only). A very flexible bishop that jumps over pawn walls.',
  phantom: 'Leave the board through an edge square (diagonally); nothing can touch it outside. Come back within 2 of your turns on an edge square next to where it left, capturing any piece there except a King. It never gives check.',
  ricochet: 'One bounce off a wall (or one of your own pieces) lets it hit pieces hiding off its diagonals. Capturing ends its move.',
  paladin: 'A knight that always has a step: it can capture or move to any of the four squares next to it.',
  outrider: 'Its diagonal step only captures, so it attacks all squares diagonally next to it as well as the knight squares.',
  hussar: 'The extra (3,1) leap can only move to empty squares, but it reaches far quiet squares no knight could.',
  crusader: 'Knight jump plus a straight slide of up to 2. The slide cannot jump over pieces.',
  vaulter: 'Two knight leaps in the same direction as ONE move, landing on (2,4) or (4,2) squares, over anything. The second leap can only land on an empty square.',
  pinwheel: 'A knight jump that can capture; if it lands next to an enemy piece, it may take one more king step onto an empty square. Capture and slip away.',
  bulwark: 'A rook with a quiet diagonal step: it can sidestep without leaving its file or rank for long.',
  warden: 'The diagonal step only captures, so it guards the four diagonal squares next to it.',
  ferry: 'It can pass over ONE friendly piece along a line; squares beyond the piece are move-only. Your own pawns stop being walls.',
  citadel: 'Rook lines plus short diagonal slides (up to 2): it covers the squares around it much better.',
  ruler: 'On each line, after 3 and after 6 squares, it can also use the squares beside that point (the line must be clear up to there). A rook that hits squares off its file.',
  tower: 'It never moves along its own file or rank. It slides in the lanes right beside them (up to 4 squares), as long as its own line is clear up to that point. The lane squares beside a blocking piece are covered too, so a crowded board hurts it less than a Rook. It can also capture the first enemy piece on its own file or rank (up to 4 squares), but never move along them.',
  regent: 'A queen with extra quiet knight leaps: it can land on squares no queen reaches, but only to move.',
  archon: 'A queen whose knight leaps only capture: it forks from a distance.',
  vizier: 'Queen moves plus a 2-square leap in all 8 directions, over anything, to move or capture.',
  paragon: 'Queen moves, knight leaps, and a hop over exactly one piece along a queen line, landing right behind it (capturing there if it is an enemy).',
  switch: 'Swap places with the first friendly piece on any queen line. Great for rescuing an attacked piece or repositioning your army in one move.',
  valkyrie: 'A queen that, after a capture, may step one square like a king (move only): capture and retreat in the same turn. She cannot capture twice.',
  sovereign: 'Your King with quiet knight leaps: more ways to run. It still gives check only from the 8 squares next to it.',
  warlord: 'Your King with capture-only knight leaps. It can take pieces from a distance, but never a King, and it never gives check from afar.',
  chamberlain: 'Your King can swap places with an adjacent friendly piece: tuck it behind a defender, or pull a piece out of danger.',
  monarch: 'King step, knight leaps (move or capture) and 8 quiet two-square jumps: very hard to trap.',
  tyrant: 'Captures an adjacent enemy piece without moving (never a King): it can remove an attacker without leaving its shelter.',
  tarzan: 'Jumps to any empty square within 4 (never captures). It can be checked but is very hard to mate; you lose if it is your only piece left, so keep an army.'
};
function fillPromoGuide() {
  const el = $('promoGuideBody'); if (el.dataset.done) return; el.dataset.done = '1';
  const C = Promotion.COND, X = Promotion.COND2, F = Promotion.FORMS;
  const row = k => guideRow(F[k].t, F[k].name, F[k].desc + '<div class="ptip">' + (PROMO_TIPS[k] || '') + '</div>', glyphHTML(F[k].t), true);
  const forms = (o, tier) => Object.keys(F).filter(k => F[k].o === o && (F[k].tier || 1) === tier).map(row).join('');
  const names = (o, tier) => Object.keys(F).filter(k => F[k].o === o && (F[k].tier || 1) === tier).map(k => F[k].name).join(', ');
  const T2 = promoT2Text();
  const fam = [
    ['b', 'Bishop', 'makes ' + C.bishopCaps + ' captures in total', T2.b],
    ['n', 'Knight', C.knightStreak + ' moves of that Knight in a row, each ending in the enemy half', T2.n],
    ['r', 'Rook', 'slides ' + C.rookSlide + ' squares in total', T2.r],
    ['q', 'Queen', 'gives ' + C.queenChecks + ' checks (discovered checks count if the Queen moved)', T2.q],
    ['k', 'King', C.kingMoves + ' of your first ' + C.kingWindow + ' moves are King moves (castling and forced moves do not count)', T2.k]
  ];
  let h = '<p>Every piece type climbs a ladder: <b>piece \u2192 tier 1 \u2192 tier 2</b>. Each form below has its own moves (use <b>Show moves</b>), and a short note on how to use it. All numbers are placeholders and can change.</p>';
  h += '<h4>Pawn</h4>' + guideRow('p', 'Pawn', 'Moves and captures as usual. ' + PROMO_TIPS.pawn, glyphHTML('p'), true);
  h += '<h5>Tier-1 pawns <span class="pcond">(from a pawn reaching the last rank)</span></h5>' + forms('p', 1);
  h += '<h5>Tier-2 pawns <span class="pcond">(from a tier-1 pawn reaching the last rank; the Vanguard never promotes)</span></h5>' + forms('p', 2);
  h += '<h5>Tier-3 pawns <span class="pcond">(Juggernaut \u2192 Titan, Gemini \u2192 Mirror)</span></h5><div class="pcond">Juggernaut: ' + promoT3Text().j + '.<br>Gemini: ' + promoT3Text().g + '.</div>' + forms('p', 3);
  fam.forEach(([o, nm, c1, c2]) => {
    h += '<h4>' + nm + '</h4><div class="pcond">Tier 1: ' + c1 + '.</div>' + forms(o, 1) + '<div class="pcond">Tier 2 (from any tier-1 ' + nm + ' form): ' + c2 + '.</div>' + forms(o, 2);
  });
  el.innerHTML = h;
  wireGuide(el, 'promo');
}
const voidNote = () => {
  if (!game || !game.promotion) return '';
  const mine = game.offBoard(myColor), theirs = game.offBoard(myColor === 'w' ? 'b' : 'w'), nm = a => a.map(e => Promotion.NAME[e.t]).join(', ');
  return (mine.length ? ' · Your ' + nm(mine) + ' is outside the board (' + Math.min(...mine.map(e => e.left)) + ' turn' + (Math.min(...mine.map(e => e.left)) > 1 ? 's' : '') + ' left to come back)' : '') + (theirs.length ? ' · The opponent\'s ' + nm(theirs) + ' is outside the board' : '');
};
function updateVoidTray() {
  const el = $('voidTray'); if (!el) return;
  const ms = game && game.promotion && !ended() && !replay && !spectating && game.turn === myColor ? game.voidMoves() : [];
  if (!ms.length) { el.classList.add('hidden'); el.innerHTML = ''; return; }
  const big = t => art(t) || GLYPH[t];
  el.innerHTML = '<span class="vt">Bring it back:</span>';
  ms.forEach(m => {
    const e = game.offBoard(myColor)[m.ei], t = game.at(m.tx, m.ty), b = document.createElement('button');
    b.innerHTML = big(e.t) + '<span>' + sqName(m.tx, m.ty) + (t ? ' ×' + (Promotion.NAME[t.t] || '') : '') + (e.left === 1 ? ' (must)' : '') + '</span>';
    b.title = 'Re-enter on ' + sqName(m.tx, m.ty) + (t ? ', capturing the ' + (Promotion.NAME[t.t] || 'piece') : '');
    b.onclick = () => { el.classList.add('hidden'); play(m); };
    el.appendChild(b);
  });
  el.classList.remove('hidden');
}
const promoNote = () => {
  if (!game || !game.promotion || !sel || sel.drop) return '';
  const p = game.at(sel.x, sel.y); if (!p) return '';
  if (game.onLast(sel.x, sel.y)) return ' · Pawn on the last rank: click a square to promote and move there (or pick another piece to leave it)';
  const pr = game.progress(sel.x, sel.y), nm = Promotion.NAME[p.t] || '';
  return pr ? ' · ' + nm + ': ' + pr.have + '/' + pr.need + ' ' + pr.label : p.tier > 0 ? ' · ' + nm : '';
};
function statusText() {
  if (game && game.multi) return multiStatus();
  if (M && M.phase === 'between') return matchLine();
  if (over) return over;
  const s = game.status();
  if (s === 'checkmate') return 'Checkmate! ' + (game.turn === 'w' ? 'Black' : 'White') + ' wins.';
  if (game.pend) return game.turn === myColor ? 'Sapper: click it, then a highlighted square for a wall (or click the Sapper itself to skip).' : 'Opponent is placing a wall…';
  if (s === 'bare') return 'Only Imperials left: ' + (game.loser === 'w' ? 'Black' : 'White') + ' wins.';
  if (s === 'stalemate') return 'Stalemate: draw.';
  if (s === 'draw') return 'Draw: not enough material to checkmate.';
  return (M ? 'Round ' + M.round + '/' + M.s.rounds + ' · ' : '') + (game.turn === myColor ? 'Your turn' : "Opponent's turn") + ' (you are ' + (myColor === 'w' ? 'White' : 'Black') +
         ', ' + MODES[mode].name + ')' + (s === 'check' ? ' · Check!' : '') + promoNote() + voidNote() +
         (MODES[mode].v.movesPerTurn > 1 ? ' · ' + game.left + ' move' + (game.left > 1 ? 's' : '') + ' left' : '') +
         (M && game.yard && game.yard(myColor).length && game.yard(myColor).length < 40 && hasReviveUnit() ? ' · Fallen: ' + game.yard(myColor).map(t => GLYPH[t] || t).join(' ') : '') +
         (game.turn === myColor && game.freeLeft && game.freeLeft() > 0 && game.freeLeft() < 5 ? ' · Herald: ' + game.freeLeft() + ' free step' + (game.freeLeft() > 1 ? 's' : '') + ' left' : '');
}

// ---- cylinder chess view: a tilted, shaded barrel with faded 'beyond the edge' files that you can spin ----
let cylShift = 0, cylBusy = false;
const cylMod = (n, m) => ((n % m) + m) % m;
function cylSetup(on) {
  const wr = $('boardWrap'), el = $('board');
  wr.classList.toggle('cylv', on); el.classList.toggle('cylb', on);
  $('cylCtl').classList.toggle('hidden', !on); $('cylNote').classList.toggle('hidden', !on);
  if (on) { el.style.transform = 'rotateX(14deg)'; initCylEvents(); }
}
function spinCyl(dir) {
  if (cylBusy || !game || !game.cyl) return;
  cylBusy = true;
  const el = $('board'), cellW = el.clientWidth / (game.w + 0.7) || 40;
  el.style.transition = 'transform .22s ease'; el.style.transform = 'rotateX(14deg) translateX(' + (-dir * cellW) + 'px)';
  setTimeout(() => { el.style.transition = 'none'; cylShift = cylMod(cylShift + dir, game.w); cylBusy = false; render(); }, 230);
}
function initCylEvents() {
  const wr = $('boardWrap');
  if (wr._cylReady) return;
  wr._cylReady = true; initZoomEvents();            // also installs the 'ignore the click after a drag' guard
  let down = null;
  wr.addEventListener('pointerdown', e => { if (!wr.classList.contains('cylv') || e.target.closest('#cylCtl')) return; down = { x: e.clientX }; dragMoved = false; });
  window.addEventListener('pointermove', e => {
    if (!down || !game || !game.cyl) return;
    const dx = e.clientX - down.x, cellW = $('board').clientWidth / (game.w + 0.7);
    if (Math.abs(dx) > 8) dragMoved = true;
    if (Math.abs(dx) >= cellW) { down.x = e.clientX; spinCyl(dx < 0 ? 1 : -1); }
  });
  const up = () => { down = null; };
  window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  $('cylL').onclick = () => spinCyl(-1); $('cylR').onclick = () => spinCyl(1);
  $('cylReset').onclick = () => { cylShift = 0; render(); };
}

// ---- zoomable board (used by both Infinite boards) ----
const boardPx = () => { const m = $('gameMain'), w = m ? m.clientWidth : 0; return w > 100 ? w : Math.min(innerWidth - 32, 480); };      // pixel width of the board column
$('menuBtn').onclick = async () => { const live = game && !ended() && !spectating; if (live && !(await askConfirm('Leave this game and go back to the main menu? The game will be abandoned.', 'Leave game', true))) return; location.href = location.pathname; };
new MutationObserver(() => { if (!$('game').classList.contains('hidden')) requestAnimationFrame(() => { if (game) render(); }); }).observe($('game'), { attributes: true, attributeFilter: ['class'] });
let rzT = 0; addEventListener('resize', () => { clearTimeout(rzT); rzT = setTimeout(() => { if (game && !$('game').classList.contains('hidden')) render(); }, 150); });
function layoutGame() {                         // tells CSS how tall the board is relative to its width, so it can fill the window height
  const m = $('gameMain'); if (!m || !game) return;
  let asp = 1;
  if (!game.hex && game.w && game.h) asp = game.h / game.w;
  const mm = MODES[mode] || {};
  if (mm.bug || (mm.v && mm.v.alice)) asp *= 2;
  if ($('boardWrap').classList.contains('zoomable') || (game.w === 32 && game.h === 32) || (!game.hex && !game.layers && (game.multi ? game.w >= 29 : game.imperial && game.w > 12))) asp = 0.62;
  m.style.setProperty('--asp', String(Math.max(0.4, asp)));
}
const view = { k: 1, x: 0, y: 0 };
function handsOn() { const V = (MODES[mode] && MODES[mode].v) || {}; return !!(game && (game.bug || (V.neutral ? gs.neutralDrop : V.drops))); }
function fitBigBoard() {                           // the zoomable board always ends inside the window, whatever sits above it
  const wr = $('boardWrap'); if (!wr || !wr.classList.contains('zoomable') || $('game').classList.contains('hidden')) return;
  const r = wr.getBoundingClientRect(), below = Math.max(0, $('gameMain').getBoundingClientRect().bottom - r.bottom);      // (a hand row etc. under the board)
  const h = Math.max(320, Math.round(innerHeight - r.top - 12 - below));
  if (wr.style.height !== h + 'px') { wr.style.height = h + 'px'; applyView(); }
}
function syncChrome() { $('gameMain').classList.toggle('nohands', !handsOn()); fitBigBoard(); requestAnimationFrame(fitBigBoard); }
addEventListener('resize', () => fitBigBoard());
let dragMoved = false, focusPx = 400;
function viewMetrics() { const wr = $('boardWrap'), el = $('board'); return { vw: wr.clientWidth, vh: wr.clientHeight, bw: el.offsetWidth, bh: el.offsetHeight }; }
function applyView() {
  const { vw, vh, bw, bh } = viewMetrics(), w = bw * view.k, h = bh * view.k;
  view.x = Math.min(vw * 0.75, Math.max(vw * 0.25 - w, view.x));
  view.y = Math.min(vh * 0.75, Math.max(vh * 0.25 - h, view.y));
  const el = $('board'); el.style.transformOrigin = '0 0'; el.style.transform = 'translate(' + view.x + 'px,' + view.y + 'px) scale(' + view.k + ')';
}
function zoomAt(px, py, factor) {
  const { vw, vh, bw, bh } = viewMetrics(), minK = Math.min(vw / bw, vh / bh);
  const nk = Math.max(minK * 0.9, Math.min(3, view.k * factor)), f = nk / view.k;
  view.x = px - (px - view.x) * f; view.y = py - (py - view.y) * f; view.k = nk; applyView();
}
function fitView(px) {
  const { vw, vh, bw, bh } = viewMetrics();
  view.k = px ? Math.min(vw, vh) / px : Math.min(vw / bw, vh / bh);
  view.x = (vw - bw * view.k) / 2; view.y = (vh - bh * view.k) / 2; applyView();
}
function setupBigBoard(cellPx, focusCells) {
  const wr = $('boardWrap');
  wr.classList.add('zoomable'); $('zoomCtl').classList.remove('hidden');
  wr.style.height = Math.max(320, Math.round(innerHeight - wr.getBoundingClientRect().top - 12)) + 'px';
  if (innerWidth > 900) document.body.classList.add('nopagescroll');      // the Infinite board fills the window: no page scrollbar
  focusPx = focusCells * cellPx;
  initZoomEvents();
  if (!centered) { fitView(focusPx); centered = true; } else applyView();
}
function initZoomEvents() {
  const wr = $('boardWrap');
  if (wr._zoomReady) return;
  wr._zoomReady = true;
  const ptrs = new Map(); let startDist = 1, startK = 1, downX = 0, downY = 0;
  wr.addEventListener('pointerdown', e => {
    if (!wr.classList.contains('zoomable') || e.target.closest('#zoomCtl') || e.button === 2) return;      // (right-drag draws arrows, it must not pan)
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); dragMoved = false; downX = e.clientX; downY = e.clientY;
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; startDist = Math.hypot(a.x - b.x, a.y - b.y) || 1; startK = view.k; }
  });
  window.addEventListener('pointermove', e => {
    const p = ptrs.get(e.pointerId); if (!p) return;
    if (ptrs.size === 1) {
      if (Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY) > 8) dragMoved = true;
      if (dragMoved) { view.x += e.clientX - p.x; view.y += e.clientY - p.y; applyView(); }
      p.x = e.clientX; p.y = e.clientY;
    } else if (ptrs.size === 2) {
      p.x = e.clientX; p.y = e.clientY;
      const [a, b] = [...ptrs.values()], r = wr.getBoundingClientRect(), d = Math.hypot(a.x - b.x, a.y - b.y);
      dragMoved = true;
      zoomAt((a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top, (startK * d / startDist) / view.k);
    }
  });
  const up = e => { ptrs.delete(e.pointerId); if (ptrs.size === 1) { const p = [...ptrs.values()][0]; downX = p.x; downY = p.y; } };
  window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  wr.addEventListener('click', e => { if (dragMoved) { e.stopPropagation(); e.preventDefault(); dragMoved = false; } }, true);
  wr.addEventListener('wheel', e => {
    if (!wr.classList.contains('zoomable')) return;
    e.preventDefault(); const r = wr.getBoundingClientRect();
    if (e.ctrlKey || $('wheelSel').value === 'zoom') zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)));      // zoom around the cursor (Ctrl + wheel / trackpad pinch always zooms)
    else { if (e.shiftKey) view.x -= (e.deltaX || e.deltaY); else { view.x -= e.deltaX; view.y -= e.deltaY; } applyView(); }      // wheel = up/down, Shift + wheel = sideways
  }, { passive: false });
  $('zIn').onclick = () => zoomAt(wr.clientWidth / 2, wr.clientHeight / 2, 1.35);
  $('zOut').onclick = () => zoomAt(wr.clientWidth / 2, wr.clientHeight / 2, 1 / 1.35);
  $('zFit').onclick = () => fitView(null);
  $('zMid').onclick = () => fitView(focusPx);
}

