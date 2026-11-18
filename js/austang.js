/* ============ AUSTANG (match layer) ============ */
function readSettings(m) {
  const cfg = AUST_CFG[m || mode]; if (!cfg) return null;
  const n = (id, d) => { const v = parseInt($(id).value, 10); return isNaN(v) ? d : Math.max(0, v); };
  const lim = {};
  document.querySelectorAll('#austLimits input').forEach(i => { const v = parseInt(i.value, 10); if (!isNaN(v) && v >= 0) lim[i.dataset.t] = v; });
  const unlock = {};
  document.querySelectorAll('#austUnlock input').forEach(i => { const v = parseInt(i.value, 10); if (!isNaN(v) && v > 1) unlock[i.dataset.t] = v; });
  return { unlock, start: n('sStart', cfg.def.start), base: n('sBase', cfg.def.base), step: n('sStep', cfg.def.step), catchup: n('sCatch', cfg.def.catchup),
           cap: Math.max(1, n('sCap', cfg.def.cap)), rounds: Math.max(1, n('sRounds', cfg.def.rounds)), lim };
}
let austShown = null;
function syncAustSettings(v) {                  // switching between Austang modes loads that mode's default numbers and piece-limit boxes
  if (austShown === v) return; austShown = v;
  const c = AUST_CFG[v], d = c.def;
  [['sStart', 'start'], ['sBase', 'base'], ['sStep', 'step'], ['sCatch', 'catchup'], ['sCap', 'cap'], ['sRounds', 'rounds']].forEach(([id, k]) => { $(id).value = d[k]; });
  const box = $('austLimits'); box.innerHTML = '';
  c.palette.filter(t => t !== 'k').forEach(t => {
    const l = document.createElement('label'), i = document.createElement('input');
    i.type = 'number'; i.min = '0'; i.placeholder = '∞'; i.dataset.t = t; if (c.lim[t] != null) i.value = c.lim[t];
    l.innerHTML = PNAMES[t] + ' '; l.appendChild(i); box.appendChild(l);
  });
  const ub = $('austUnlock'); ub.innerHTML = ''; $('austUnlockBox').classList.toggle('hidden', !c.unlock);
  if (c.unlock) c.palette.filter(t => t !== 'k').forEach(t => {
    const l = document.createElement('label'), i = document.createElement('input');
    i.type = 'number'; i.min = '1'; i.placeholder = '1'; i.dataset.t = t; if (c.unlock[t] != null) i.value = c.unlock[t];
    l.innerHTML = PNAMES[t] + ' '; l.appendChild(i); ub.appendChild(l);
  });
}

let gsRoomState = null, roomKind = null;
function updateAustUI() {
  if (typeof refreshModeBtn === 'function' && $('modeSel').options.length) refreshModeBtn();
  const room = !$('game').classList.contains('hidden');
  if (room !== gsRoomState) { gsRoomState = room; $('gsBox').open = !room; $('gsNote').textContent = room ? 'Applies from the next game: press New game' + (isHost && MODES[mode].multi ? ', or Back to room to change who plays too' : '') + '.' : ''; }
  { const gb = $('gsBox'), hc = $('hostCtl');                  // in a game the options live in the Host controls panel instead of above the board
    if (room && !hc.classList.contains('hidden')) { if (gb.parentNode !== hc) hc.appendChild(gb); }
    else if (gb.parentNode !== $('lobby').parentNode) $('lobby').after(gb); }
  // In a room the mode picker only lists modes this room can actually switch to.
  if (room && isHost && game) {
    const kind = roomFamily(MODES[mode]);
    if (roomKind !== kind) {
      roomKind = kind;
      const sel2 = $('modeSel2'); sel2.innerHTML = '';
      Object.keys(MODES).forEach(k => {
        if (roomFamily(MODES[k]) === kind) sel2.add(new Option(MODES[k].name, k));
      });
      sel2.value = mode; sel2.classList.toggle('hidden', sel2.options.length < 2);
    }
    $('swapLbl').classList.toggle('hidden', !!game.multi);
  }
  const v = room ? (isHost ? $('modeSel2').value : '') : $('modeSel').value;
  $('austSettings').classList.toggle('hidden', !AUST_CFG[v]); if (AUST_CFG[v]) syncAustSettings(v);
  const op = (MODES[v] && MODES[v].opts) || [];
  tcAllowed = clkOk(v); $('gsClock').classList.toggle('hidden', !tcAllowed); fillClockSel(v);
  const colOk = !!MODES[v] && !MODES[v].multi && !room; $('gsColor').classList.toggle('hidden', !colOk);      // (a guest has no mode picker: v is empty)
  $('gsBox').classList.toggle('hidden', !op.length && !tcAllowed && !colOk);
  $('gsDrop').classList.toggle('hidden', !op.includes('drop'));
  $('gsFog').classList.toggle('hidden', !op.includes('fog'));
  $('gsTeams').classList.toggle('hidden', !op.includes('teams'));
  $('gsNeutral').classList.toggle('hidden', !op.includes('neutral'));
  $('gsOct').classList.toggle('hidden', !op.includes('oct')); $('nsetWrap').classList.toggle('hidden', !!(MODES[v] && MODES[v].oct));
  $('gsTraits').classList.toggle('hidden', !op.includes('traits'));
  $('gsClasses').classList.toggle('hidden', !op.includes('classes'));
  $('classWrap').classList.toggle('hidden', !$('classesChk').checked);
  $('gsC960').classList.toggle('hidden', !op.includes('c960'));
  $('offerWrap').classList.toggle('hidden', !$('traitsChk').checked);
  const mv = (MODES[v] && MODES[v].v) || {}, fixedWide = mv.board === 'wide';
  const teamBoard = op.includes('teams') && $('teamsChk').checked && !op.includes('neutral') && !(mv.alice || mv.board);
  $('gsBoard').classList.toggle('hidden', !(teamBoard || fixedWide));
  const wideNo = op.includes('teams') && $('teamsChk').checked && !(teamBoard || fixedWide);
  $('wideNote').classList.toggle('hidden', !wideNo);
  $('boardKindWrap').classList.toggle('hidden', fixedWide);
  $('heightWrap').classList.toggle('hidden', !(fixedWide || $('boardSel').value === 'wide') || !!(MODES[v] && MODES[v].match4));      // (Austang 4-player wide board is always 20 x 14)
  $('gsFoes').classList.toggle('hidden', !FOES_MODES.includes(v) || $('fogChk').checked);
  $('impRoamLbl').classList.toggle('hidden', $('nsetSel').value !== 'mixed' || !!(MODES[v] && MODES[v].oct));            // imps only exist in the Mixed set
  $('specLinkBtn').classList.toggle('hidden', !!(M || A4)); $('specChatLbl').classList.toggle('hidden', !!(M || A4));      // Austang has no spectators
  const noFight = !!(M && M.phase !== 'play') || !!(A4 && A4.phase === 'setup');      // while armies are being built (or between rounds) there is nothing to resign or draw
  $('drawBtn').classList.toggle('hidden', !!(game && game.multi && game.bug) || noFight); $('resignBtn').classList.toggle('hidden', noFight);
  const hostMulti = !!(game && game.multi && isHost);
  $('removeSel').classList.toggle('hidden', !hostMulti); $('removeBtn').classList.toggle('hidden', !hostMulti);
  if (game && game.multi) $('rematchBtn').classList.add('hidden');
  $('readyBtn').classList.toggle('hidden', !((M && M.phase === 'setup' && M.sentRound !== M.round) || (A4 && A4.phase === 'setup' && A4.sent !== A4.round)));
  $('nextBtn').classList.toggle('hidden', !((M && M.phase === 'between' && M.round < M.s.rounds) || (A4 && isHost && A4.phase === 'between' && A4.round < A4.s.rounds)));
  tidyHost();
}
function tidyHost() {                           // hide option groups / host rows that have nothing to show
  document.querySelectorAll('#hostCtl .hrow').forEach(r => r.classList.toggle('hidden', ![...r.children].some(c => !c.classList.contains('hl') && !c.classList.contains('hidden'))));
  document.querySelectorAll('#gsBox .optgrp').forEach(g2 => g2.classList.toggle('hidden', ![...g2.children].some(c => !c.classList.contains('gh') && !c.classList.contains('hidden'))));
}

function mineStats() {
  let s = 0, n = 0; const m = M.setups[myColor], cost = AC().cost;
  for (const k in m) { s += cost[m[k]]; n++; }
  return { s, n };
}
const countOf = (setup, t) => Object.values(setup).filter(u => u === t).length;
const unlockMsg = (st, t, round) => (st && st.unlock && st.unlock[t] > round ? PNAMES[t] + ' unlocks in round ' + st.unlock[t] + '.' : '');
let paintMode = null;                                   // hold left = place pieces, hold right = erase them
['pointerup', 'pointercancel', 'blur'].forEach(ev => window.addEventListener(ev, () => { paintMode = null; }));
function paintBind(d, act) {
  d.onpointerdown = e => { if (e.button !== 0 && e.button !== 2) return; e.preventDefault(); paintMode = e.button === 2 ? 'erase' : 'place'; act(paintMode === 'erase', false); };
  d.onpointerenter = () => { if (paintMode) act(paintMode === 'erase', true); };
  d.oncontextmenu = e => e.preventDefault();
}
const limTxt = t => { const l = M.s.lim && M.s.lim[t]; return l != null ? ' (max ' + l + ')' : ''; };
function setupProblem(color, setup) {          // everything a legal army has to satisfy (also used on the opponent's army when it arrives)
  const c = AC(), W = c.w, H = c.h; let pts = 0, n = 0, kings = 0;
  if (!setup || typeof setup !== 'object') return 'Invalid army.';
  for (const key in setup) {
    const xy = key.split(',').map(Number), x = xy[0], y = xy[1], t = setup[key];
    if (!(x >= 0 && x < W && y >= 0 && y < H) || !(t in c.cost)) return 'Invalid piece placement.';
    if (color === 'w' ? y >= H / 2 : y < H / 2) return 'A piece is outside its own half.';
    if ((t === 'p' || t === '\u03c1') && (y === 0 || y === H - 1)) return "Pawns can't start on the back rank.";
    pts += c.cost[t]; n++; if (t === 'k') kings++;
  }
  if (kings !== 1) return 'You need exactly one king.';
  if (pts > M.pool[color]) return 'Not enough points.';
  if (n > M.s.cap) return 'Piece cap reached.';
  for (const t in (M.s.unlock || {})) if (countOf(setup, t) > 0 && M.s.unlock[t] > M.round) return unlockMsg(M.s, t, M.round);
  for (const t in (M.s.lim || {})) if (countOf(setup, t) > M.s.lim[t]) return 'At most ' + M.s.lim[t] + ' ' + PNAMES[t].toLowerCase() + (M.s.lim[t] === 1 ? '' : 's') + ' allowed.';
  return '';
}

function placeAt(x, y, erase, drag) {
  if (M.sentRound === M.round) return;
  const H = AC().h, key = x + ',' + y, bak = Object.assign({}, M.setups[myColor]);
  setupMsg = '';
  if (pal === 'x' || erase) { if (M.setups[myColor][key] && !(drag && M.setups[myColor][key] === 'k')) { delete M.setups[myColor][key]; render(); } return; }
  if (M.setups[myColor][key] === pal) return;
  { const um = unlockMsg(M.s, pal, M.round); if (um) { setupMsg = um; return render(); } }
  if ((pal === 'p' || pal === '\u03c1') && (y === 0 || y === H - 1)) { setupMsg = "Pawns can't start on the back rank."; return render(); }
  const m = M.setups[myColor];
  if (pal === 'k') for (const k in m) if (m[k] === 'k') delete m[k];
  m[key] = pal;
  const st = mineStats(), lim = M.s.lim && M.s.lim[pal];
  if (st.s > M.pool[myColor]) { M.setups[myColor] = bak; setupMsg = 'Not enough points.'; }
  else if (st.n > M.s.cap) { M.setups[myColor] = bak; setupMsg = 'Piece cap reached.'; }
  else if (lim != null && countOf(m, pal) > lim) { M.setups[myColor] = bak; setupMsg = 'Limit reached: at most ' + lim + ' ' + PNAMES[pal].toLowerCase() + (lim === 1 ? '' : 's') + '.'; }
  render();
}

// Piece picker for the army builders: pieces grouped by kind, wrapping onto several rows instead of one endless line.
// o = { cfg, lim (limit table), count (type -> how many placed), onPick }
function buildPicker(hb, o) {
  const c = o.cfg, mk = t => {
    const b = document.createElement('button');
    const lim = o.lim && o.lim[t], n = o.count(t);
    b.innerHTML = glyphHTML(t) + '<span class="pc">' + (c.cost[t] ? c.cost[t] : '') + '</span>' + (lim != null ? '<small>' + n + '/' + lim + '</small>' : '');
    b.title = PNAMES[t] + ': ' + c.cost[t] + ' point' + (c.cost[t] === 1 ? '' : 's') + (lim != null ? ' (max ' + lim + ')' : '');
    if (lim != null && n >= lim) b.classList.add('full');
    const ul = o.unlock && o.unlock[t] > o.round;
    if (ul) { b.classList.add('full', 'locked'); b.insertAdjacentHTML('beforeend', '<em class="lk">🔒 R' + o.unlock[t] + '</em>'); b.title += ' (unlocks in round ' + o.unlock[t] + ')'; }
    if (pal === t) b.classList.add('on');
    b.onclick = () => { pal = t; render(); };
    return b;
  };
  const used = new Set(), groups = c.palette.length > 8 ? GRAND_GROUPS.map(([n, l]) => [n, l.filter(t => c.palette.includes(t))]) : [['', c.palette]];
  groups.forEach(([name, list]) => list.forEach(t => used.add(t)));
  const rest = c.palette.filter(t => !used.has(t)); if (rest.length) groups.push(['Other', rest]);
  hb.classList.add('picker');
  groups.filter(g => g[1].length).forEach(([name, list]) => {
    const g = document.createElement('div'); g.className = 'pkg';
    if (name) { const l = document.createElement('span'); l.className = 'pkl'; l.textContent = name; g.appendChild(l); }
    list.forEach(t => g.appendChild(mk(t)));
    if (name === 'Standard' || !name) { const x = document.createElement('button'); x.textContent = '✖'; x.title = 'Remove a piece'; if (pal === 'x') x.className = 'on'; x.onclick = () => { pal = 'x'; render(); }; g.appendChild(x); }
    hb.appendChild(g);
  });
}
function renderPieceDemo(ctx) {                    // what the selected piece does, drawn on a tiny board, before you place it
  const box = $('pieceDemo'); box.innerHTML = '';
  ctx = ctx || { cfg: AC(), locked: M.sentRound === M.round, s: M.s, v: MODES[M.mode].v };
  const c = ctx.cfg, locked = ctx.locked;
  if (locked || pal === 'x' || !(pal in c.cost)) { box.classList.add('hidden'); return; }
  const info = GRAND_GUIDE.find(e => e[0] === pal) || [pal, PNAMES[pal], ''];
  const lim = ctx.s.lim && ctx.s.lim[pal];
  const left = document.createElement('div'); left.className = 'dgstate';
  const g = Diagrams.grid2p(Engine, ctx.v, pal, Object.assign({ R: 5 }, Diagrams.states('grand', pal)[0].o));
  left.appendChild(diagramEl(g, glyphHTML(pal)));
  const right = document.createElement('div'); right.className = 'pdtxt';
  right.innerHTML = '<b>' + PNAMES[pal] + '</b>: ' + c.cost[pal] + ' point' + (c.cost[pal] === 1 ? '' : 's') + (lim != null ? ' · max ' + lim : '') + '<br>' + info[2];
  const lg = document.createElement('div'); lg.className = 'dgl'; const seen = new Set();
  g.rows.forEach(r => [...r].forEach(ch => { if (MARK_TXT[ch]) seen.add(ch); }));
  ['m', 'c', 'b', 's', 'x'].filter(k => seen.has(k)).forEach(k => { const sp = document.createElement('span'); sp.innerHTML = '<i class="mk ' + k + '"></i>' + MARK_TXT[k]; lg.appendChild(sp); });
  auraLegend(lg, g.aura); right.appendChild(lg);
  box.appendChild(left); box.appendChild(right); box.classList.remove('hidden');
}
function renderSetup() {
  const el = $('board'); el.innerHTML = '';
  const c = AC(), W = c.w, H = c.h;
  el.style.gridTemplateColumns = 'repeat(' + W + ',minmax(0,1fr))'; el.style.aspectRatio = '1'; el.style.width = '100%';
  $('board2Wrap').classList.add('hidden'); $('capA').classList.add('hidden');
  el.style.fontSize = (boardPx() / W * 0.7) + 'px';
  const m = M.setups[myColor], locked = M.sentRound === M.round;
  for (let i = 0; i < W * H; i++) {
    const r = Math.floor(i / W), cc = i % W;
    const x = myColor === 'w' ? cc : W - 1 - cc, y = myColor === 'w' ? H - 1 - r : r;
    const own = myColor === 'w' ? y < H / 2 : y >= H / 2;
    const d = document.createElement('div');
    d.className = 'sq ' + ((x + y) % 2 === 1 ? 'l' : 'd');
    if (!own) d.style.opacity = '.3';
    const t = own && m[x + ',' + y];
    if (t) {
      const s = document.createElement('span');
      setGlyph(s, t, myColor); s.className = (myColor === 'w' ? 'w-piece' : '') + (isFairy(t) ? ' fairy' : '');
      d.appendChild(s);
    }
    if (own && !locked) paintBind(d, (er, dr) => placeAt(x, y, er, dr));
    el.appendChild(d);
  }
  const st = mineStats();
  $('status').textContent = 'Round ' + M.round + '/' + M.s.rounds + ': build your army. Points ' + st.s + '/' + M.pool[myColor] +
    ' · pieces ' + st.n + '/' + M.s.cap + (setupMsg ? ' · ' + setupMsg : '') +
    (locked ? ' · waiting for opponent…' : (M.opp && M.opp.round === M.round ? ' · opponent is ready' : ''));
  $('handTop').innerHTML = '';
  const hb = $('handBot'); hb.innerHTML = ''; hb.classList.remove('picker');
  if (!locked) buildPicker(hb, { unlock: M.s.unlock, round: M.round, cfg: c, lim: M.s.lim, count: t => countOf(m, t) });
  renderPieceDemo();
  const opp = myColor === 'w' ? 'b' : 'w';
  $('history').textContent = 'Score: you ' + M.scores[myColor] + ' – ' + M.scores[opp] + ' opponent';
}

function tryStart() {
  if (!M || M.phase !== 'setup' || M.sentRound !== M.round || !M.opp || M.opp.round !== M.round) return;
  M.setups[myColor === 'w' ? 'b' : 'w'] = M.opp.setup;
  startRound(); render();
}

function startRound() {
  const rows = [], W = AC().w, H = AC().h;
  for (let y = H - 1; y >= 0; y--) {
    let row = '';
    for (let x = 0; x < W; x++) {
      const t = (y < H / 2 ? M.setups.w : M.setups.b)[x + ',' + y];
      row += t ? (y < H / 2 ? t.toUpperCase() : t) : '.';
    }
    rows.push(row);
  }
  const mk = f => Engine.create(Object.assign({}, MODES[M.mode].v, { setup: rows, first: f }));
  const f = M.round % 2 === 1 ? 'w' : 'b', other = f === 'w' ? 'b' : 'w';
  game = mk(f);
  const o = mk(other);
  if (o.inCheck()) game = o;   // the side not due to move is already in check, so it must move first
  M.phase = 'play'; over = null; overRes = null; sel = null;
  addChat('', 'Round ' + M.round + ' begins. ' + (game.turn === 'w' ? 'White' : 'Black') + ' moves first.', 'minor');
}

function finishRound() {
  const res = over ? overRes : (game.status() === 'checkmate' ? (game.turn === 'w' ? 'b' : 'w') : game.status() === 'bare' ? (game.loser === 'w' ? 'b' : 'w') : 'd');
  if (res === 'w' || res === 'b') M.scores[res] += 1; else { M.scores.w += 0.5; M.scores.b += 0.5; }
  const gain = M.s.base + M.s.step * (M.round - 1);
  M.pool.w += gain; M.pool.b += gain;
  if (res === 'w' || res === 'b') M.pool[res === 'w' ? 'b' : 'w'] += M.s.catchup;
  M.phase = 'between'; M.lastRes = res; M.why = over ? '' : (['stalemate', 'draw'].includes(game.status()) ? game.status() : '');
  $('drawBanner').classList.add('hidden');
  addChat('', 'Round ' + M.round + ' over. Everyone gains ' + gain + ' points' + (res === 'd' ? '.' : ', loser +' + M.s.catchup + '.') +
    ' Now you have ' + M.pool[myColor] + ' to spend.', true);
}

$('readyBtn').onclick = () => {
  if (A4) return a4Ready();
  const prob = setupProblem(myColor, M.setups[myColor]);
  if (prob) { setupMsg = prob; return render(); }
  M.sentRound = M.round; setupMsg = '';
  send({ type: 'ready', round: M.round, setup: M.setups[myColor] });
  tryStart(); render();
};
$('nextBtn').onclick = () => {
  if (A4) { if (isHost && A4.phase === 'between') { broadcast({ type: 'a4next' }); a4Next(); a4HostSendMates(); render(); } return; }
  M.round++; M.phase = 'setup'; M.sentRound = 0; setupMsg = ''; sel = null;
  render();
};
$('modeSel').onchange = updateAustUI;
$('traitsChk').onchange = updateAustUI;
$('classesChk').onchange = updateAustUI;
$('nsetSel').onchange = updateAustUI; $('fogChk').onchange = updateAustUI; $('boardSel').onchange = updateAustUI;
try { $('wheelSel').value = localStorage.getItem('chessWheel') || 'zoom'; } catch (e) {}
$('wheelSel').onchange = () => { try { localStorage.setItem('chessWheel', $('wheelSel').value); } catch (e) {} };
$('boardSel').onchange = updateAustUI;
$('teamsChk').onchange = () => { updateAustUI(); if (isHost && !mstarted) renderRoster(); };
$('gsBox').addEventListener('change', () => { if (isHost && !mstarted && peer && MODES[mode].multi) renderRoster(); });
$('teams8Sel').onchange = () => {
  if (isHost && !mstarted && peer && MODES[mode].oct) {
    const ps = [v => { hostTeam = v; }].concat(conns.filter(c => c.ready).map(c => v => { c.team = v; }), lobbyBots.map(b => v => { b.team = v; }));
    ps.forEach((set, i) => set(i % teamCount()));
  }
  updateAustUI(); if (isHost && !mstarted && peer) renderRoster();
};
['holes8Sel', 'wild8Chk', 'boss8Chk', 'burrowChk', 'fallenChk', 'neutralDropChk'].forEach(id => $(id).addEventListener('change', () => { if (isHost && !mstarted && peer && MODES[mode].multi) renderRoster(); }));
$('modeSel2').onchange = updateAustUI;

/* ============ AUSTANG 4-PLAYER (build-your-army match for 2–4 players; the host is the hub) ============ */
// (A4 itself is declared with the other state variables near the top)
// A4 = { s settings, teams, seats, round, phase 'setup'|'play'|'between', scores{seat}, pool{seat}, setups{seat:{'u,r':type}} (the host holds everyone's), mate{seat:setup} (your partner's live build), ready{seat:true}, sent (round you pressed Ready), counted, armies, first }
const A4W = 10, A4H = 5, A4PARTNER = { r: 'y', y: 'r', b: 'g', g: 'b' };
const a4cfg = () => AUST_CFG.austang4;
const a4Partner = c => (A4 && A4.teams && A4.seats.includes(A4PARTNER[c]) ? A4PARTNER[c] : null);
function initA4(seats, s, gsIn) {
  const T = { r: 0, y: 0, b: 1, g: 1 };
  A4 = { s, teams: !!(gsIn && gsIn.teams) && new Set(seats.map(c => T[c])).size === 2, seats: seats.slice(), round: 1, phase: 'setup', scores: {}, pool: {}, setups: {}, mate: {}, ready: {}, sent: 0, counted: 0, armies: null, first: null };
  seats.forEach(c => { A4.scores[c] = 0; A4.pool[c] = s.start; A4.setups[c] = { '4,0': 'k' }; });
  game = null; M = null; over = null; overRes = null; sel = null; setupMsg = ''; pal = 'p';
}
const a4Meta = () => ({ s: A4.s, teams: A4.teams, seats: A4.seats, round: A4.round, phase: A4.phase, scores: A4.scores, pool: A4.pool, armies: A4.armies, first: A4.first, counted: A4.counted });
function a4Load(meta) {
  A4 = Object.assign({ setups: {}, mate: {}, ready: {}, sent: 0 }, JSON.parse(JSON.stringify(meta)));
  A4.seats.forEach(c => { if (!A4.setups[c]) A4.setups[c] = { '4,0': 'k' }; });
}
function a4Extra(seat) {
  const p = a4Partner(seat);
  return { setup: A4.setups[seat], ready: Object.keys(A4.ready).filter(c => A4.ready[c]), mate: p ? { [p]: A4.setups[p] } : {} };
}
function a4Apply(x) {
  if (!A4 || !x) return;
  if (x.setup) A4.setups[mySeat] = x.setup;
  A4.ready = {}; (x.ready || []).forEach(c => { A4.ready[c] = true; });
  A4.sent = A4.ready[mySeat] ? A4.round : 0;
  if (x.mate) A4.mate = x.mate;
}
function a4SendResume(c) { c.send({ type: 'a4resume', mode, seat: c.seat, seats: A4.seats, gs, a4: a4Meta(), x: a4Extra(c.seat) }); }
const a4Stats = setup => { let s = 0, n = 0; const cost = a4cfg().cost; for (const k in setup) { s += cost[setup[k]] || 0; n++; } return { s, n }; };
function a4Problem(setup, pool) {                    // everything a legal army has to satisfy (the host checks every army again)
  const c = a4cfg(); let pts = 0, n = 0, kings = 0;
  if (!setup || typeof setup !== 'object') return 'Invalid army.';
  for (const key in setup) {
    const xy = key.split(',').map(Number), u = xy[0], r = xy[1], t = setup[key];
    if (!(Number.isInteger(u) && Number.isInteger(r) && u >= 0 && u < A4W && r >= 0 && r < A4H) || typeof t !== 'string' || !Object.prototype.hasOwnProperty.call(c.cost, t)) return 'Invalid piece placement.';
    if ((t === 'p' || t === '\u03c1') && r === 0) return "Pawns can't start on the back rank.";
    pts += c.cost[t]; n++; if (t === 'k') kings++;
  }
  if (kings !== 1) return 'You need exactly one king.';
  if (pts > pool) return 'Not enough points (' + pts + '/' + pool + ').';
  if (n > A4.s.cap) return 'Too many pieces (max ' + A4.s.cap + ').';
  for (const t in (A4.s.unlock || {})) if (countOf(setup, t) > 0 && A4.s.unlock[t] > A4.round) return unlockMsg(A4.s, t, A4.round);
  for (const t in (A4.s.lim || {})) if (countOf(setup, t) > A4.s.lim[t]) return 'At most ' + A4.s.lim[t] + ' ' + PNAMES[t] + '.';
  return '';
}
function a4Share() {                                  // guests tell the host about every change (for reconnects and so the host can show a partner); the host tells its partner directly
  if (!isHost) { send({ type: 'a4build', round: A4.round, setup: A4.setups[mySeat] }); return; }
  const p = a4Partner(mySeat), pc = p && conns.find(x => x.seat === p);
  if (pc && pc.open) pc.send({ type: 'a4mate', seat: mySeat, setup: A4.setups[mySeat] });
}
function a4HostSendMates() {                          // (host) give every player a look at their partner's current build
  if (!A4.teams) return;
  A4.seats.forEach(sd => {
    const p = a4Partner(sd); if (!p) return;
    if (p === mySeat) A4.mate[sd] = A4.setups[sd];
    else { const pc = conns.find(x => x.seat === p); if (pc && pc.open) pc.send({ type: 'a4mate', seat: sd, setup: A4.setups[sd] }); }
  });
}
function a4Place(u, r, erase, drag) {
  if (A4.sent === A4.round) return;
  const key = u + ',' + r, mine = A4.setups[mySeat], bak = Object.assign({}, mine); setupMsg = '';
  if (pal === 'x' || erase) { if (mine[key] && !(drag && mine[key] === 'k')) { delete mine[key]; a4Share(); render(); } return; }
  if (mine[key] === pal) return;
  { const um = unlockMsg(A4.s, pal, A4.round); if (um) { setupMsg = um; return render(); } }
  if ((pal === 'p' || pal === '\u03c1') && r === 0) { setupMsg = "Pawns can't start on the back rank."; return render(); }
  if (pal === 'k') for (const k in mine) if (mine[k] === 'k') delete mine[k];
  mine[key] = pal;
  const st = a4Stats(mine), lim = A4.s.lim && A4.s.lim[pal];
  if (st.s > A4.pool[mySeat]) { A4.setups[mySeat] = bak; setupMsg = 'Not enough points.'; }
  else if (st.n > A4.s.cap) { A4.setups[mySeat] = bak; setupMsg = 'Piece cap reached (' + A4.s.cap + ').'; }
  else if (lim != null && countOf(mine, pal) > lim) { A4.setups[mySeat] = bak; setupMsg = 'Limit reached: at most ' + lim + ' ' + PNAMES[pal] + '.'; }
  else a4Share();
  render();
}
function a4Ready() {
  if (!A4 || A4.phase !== 'setup' || A4.sent === A4.round) return;
  const prob = a4Problem(A4.setups[mySeat], A4.pool[mySeat]);
  if (prob) { setupMsg = prob; return render(); }
  A4.sent = A4.round; setupMsg = '';
  if (isHost) a4HostReady(mySeat, A4.setups[mySeat], null); else send({ type: 'a4ready', round: A4.round, setup: A4.setups[mySeat] });
  render();
}
function a4HostReady(seat, setup, cn) {
  const prob = a4Problem(setup, A4.pool[seat]);
  if (prob) {
    if (seat === mySeat) { A4.sent = 0; setupMsg = prob; render(); } else if (cn && cn.open) cn.send({ type: 'a4reject', text: prob });
    return;
  }
  A4.setups[seat] = setup; A4.ready[seat] = true;
  broadcast({ type: 'a4status', round: A4.round, ready: Object.keys(A4.ready).filter(c => A4.ready[c]) });
  addChat('', CN[seat] + ' is ready.', 'minor');
  if (A4.seats.every(c => A4.ready[c])) a4HostStart(); else render();
}
function a4HostStart() {
  const armies = {};
  A4.seats.forEach(c => { armies[c] = Object.entries(A4.setups[c]).map(([k, t]) => { const xy = k.split(',').map(Number); return { u: xy[0], r: xy[1], t }; }); });
  const first = A4.seats[(A4.round - 1) % A4.seats.length];
  broadcast({ type: 'a4start', round: A4.round, armies, first });
  startRound4(armies, first);
}
function hostRecvA4(c, msg) {
  if (!A4 || !c.seat) return;
  if (msg.type !== 'a4build' && msg.type !== 'a4ready') return;
  if (A4.phase !== 'setup' || msg.round !== A4.round || A4.ready[c.seat] || !msg.setup || typeof msg.setup !== 'object') return;
  if (msg.type === 'a4ready') return a4HostReady(c.seat, msg.setup, c);
  if (Object.keys(msg.setup).length > 60) return;
  A4.setups[c.seat] = msg.setup;
  const p = a4Partner(c.seat);
  if (p === mySeat) { A4.mate[c.seat] = msg.setup; render(); }
  else if (p) { const pc = conns.find(x => x.seat === p); if (pc && pc.open) pc.send({ type: 'a4mate', seat: c.seat, setup: msg.setup }); }
}
function startRound4(armies, first) {
  A4.armies = armies; A4.first = first; A4.phase = 'play'; A4.counted = 0;
  newGame(mode, null, { seats: A4.seats, gs, a4round: true });
  sel = null; $('promo').classList.add('hidden');
  addChat('', 'Round ' + A4.round + '/' + A4.s.rounds + ' begins. ' + CN[first] + ' moves first. All armies are revealed!', true);
  render();
}
function finishRound4() {
  if (!A4 || A4.counted === A4.round) return;
  A4.counted = A4.round;
  const w = game.winner(), T = c => (game.teams ? game.teams[c] : c);
  A4.seats.forEach(c => { if (w) { if (T(c) === T(w)) A4.scores[c] += 1; } else A4.scores[c] += 0.5; });
  const gain = A4.s.base + A4.s.step * (A4.round - 1);
  A4.seats.forEach(c => { A4.pool[c] += gain; if (w && T(c) !== T(w)) A4.pool[c] += A4.s.catchup; });
  A4.phase = 'between';
  addChat('', 'Round ' + A4.round + ' over. Everyone gains ' + gain + ' points' + (w ? ', everyone who didn’t win +' + A4.s.catchup + '.' : '.') + ' You will have ' + A4.pool[mySeat] + ' to spend.', true);
  if (A4.round >= A4.s.rounds) {
    const best = Math.max(...A4.seats.map(c => A4.scores[c])), top = A4.seats.filter(c => A4.scores[c] === best);
    addChat('', 'Match over! ' + (A4.teams ? top.map(c => CN[c]).join(' & ') + ' win' : top.map(c => CN[c]).join(' & ') + (top.length > 1 ? ' tie' : ' wins')) + ' with ' + best + ' point' + (best === 1 ? '' : 's') + '. The host can start a new match with “New game”.', true);
  }
}
function a4Next() {
  A4.round++; A4.phase = 'setup'; A4.sent = 0; A4.ready = {}; A4.mate = {}; A4.armies = null;
  game = null; over = null; overRes = null; sel = null; setupMsg = ''; $('promo').classList.add('hidden');
  addChat('', 'Round ' + A4.round + '/' + A4.s.rounds + ': build your army. You have ' + A4.pool[mySeat] + ' points.', true);
}
function a4ScoreLine() {
  const parts = A4.teams
    ? [['r', 'y'], ['b', 'g']].map(g2 => g2.filter(c => A4.seats.includes(c))).filter(g2 => g2.length).map(g2 => g2.map(c => CN[c]).join(' & ') + ' ' + A4.scores[g2[0]])
    : A4.seats.map(c => CN[c] + ' ' + A4.scores[c]);
  return 'Round ' + A4.round + '/' + A4.s.rounds + ' · Score: ' + parts.join(' · ');
}
function a4StatusExtra() {
  let t = '';
  if (A4.phase === 'between') t += A4.round < A4.s.rounds ? (isHost ? ' · Press “Continue to next round”.' : ' · Waiting for the host to continue.') : ' · Match over.';
  if (game && game.yard && game.yard(mySeat).length && game.yard(mySeat).length < 40 && hasReviveUnit()) t += ' · Fallen: ' + game.yard(mySeat).map(x => GLYPH[x] || x).join(' ');
  if (game && game.turn === mySeat && game.freeLeft && game.freeLeft() > 0 && game.freeLeft() < 5 && !ended()) t += ' · Herald: ' + game.freeLeft() + ' free step' + (game.freeLeft() > 1 ? 's' : '') + ' left';
  return t;
}
function a4Arm(el, setup, seat, onclick) {            // one player's 10x5 arm, own back rank at the bottom
  el.innerHTML = ''; el.classList.remove('hexb');
  const w = Math.min(boardPx(), 640);
  el.style.gridTemplateColumns = 'repeat(' + A4W + ',minmax(0,1fr))'; el.style.aspectRatio = A4W + '/' + A4H; el.style.width = w + 'px'; el.style.height = ''; el.style.fontSize = (w / A4W * 0.72) + 'px';
  for (let r = A4H - 1; r >= 0; r--) for (let u = 0; u < A4W; u++) {
    const d = document.createElement('div'); d.className = 'sq ' + ((u + r) % 2 === 1 ? 'l' : 'd');
    const t = setup && setup[u + ',' + r];
    if (t) { const sp = document.createElement('span'); setGlyph(sp, t, seat); sp.className = 'pc-' + seat + (isFairy(t) ? ' fairy' : ''); d.appendChild(sp); }
    if (onclick) paintBind(d, (er, dr) => onclick(u, r, er, dr));
    el.appendChild(d);
  }
}
function renderSetup4() {
  const c = a4cfg(), locked = A4.sent === A4.round, m = A4.setups[mySeat], mate = a4Partner(mySeat);
  $('capA').classList.add('hidden');
  a4Arm($('board'), m, mySeat, locked ? null : a4Place);
  const w2 = $('board2Wrap');
  if (mate) { w2.classList.remove('hidden'); w2.querySelector('.lbl').textContent = CN[mate] + ' (your partner): live view of their build'; a4Arm($('board2'), A4.mate[mate] || {}, mate, null); }
  else w2.classList.add('hidden');
  const st = a4Stats(m), rd = A4.seats.filter(sd => A4.ready[sd]).map(sd => CN[sd]);
  $('status').textContent = 'Round ' + A4.round + '/' + A4.s.rounds + ': build your army (you are ' + CN[mySeat] + '). Points ' + st.s + '/' + A4.pool[mySeat] + ' · pieces ' + st.n + '/' + A4.s.cap +
    (setupMsg ? ' · ' + setupMsg : '') + (locked ? ' · waiting for the others…' : '') + (rd.length ? ' · Ready: ' + rd.join(', ') : '');
  $('handTop').innerHTML = '';
  const hb = $('handBot'); hb.innerHTML = ''; hb.classList.remove('picker');
  if (!locked) buildPicker(hb, { unlock: A4.s.unlock, round: A4.round, cfg: c, lim: A4.s.lim, count: t => countOf(m, t) });
  renderPieceDemo({ cfg: c, locked, s: A4.s, v: Engine.AUSTANG_GRAND });
  $('history').textContent = a4ScoreLine();
}

/* ============ ALICE CHESS (two boards) ============ */
// Click a piece on either board, then a destination square on the SAME board; the piece
// then appears on the other board.
function clickAlice(x, y, l) {
  $('promo').classList.add('hidden');
  if (ended() || game.turn !== myColor) return;
  if (sel && sel.l === l) {
    const cand = game.moves(sel.x, sel.y, sel.l).filter(m => m.tx === x && m.ty === y);
    if (cand.length) { cand.length > 1 && cand[0].promo ? showPromo(cand) : play(cand[0]); return; }
  }
  const p = game.at(x, y, l);
  sel = (p && p.c === myColor && !(sel && sel.l === l && sel.x === x && sel.y === y)) ? { x, y, l } : null;
  render();
}

function renderAlice() {
  const g = game, hist = g.history(), last = hist[hist.length - 1];
  const hints = sel ? g.moves(sel.x, sel.y, sel.l) : [];
  const k = g.inCheck() ? g.kingPos(g.turn) : null;
  const size = Math.min(innerWidth - 32, 340);
  [0, 1].forEach(l => {
    const el = l ? $('board2') : $('board'); el.innerHTML = '';
    el.style.gridTemplateColumns = 'repeat(8,minmax(0,1fr))'; el.style.aspectRatio = '1';
    el.style.width = size + 'px'; el.style.fontSize = (size / 8 * 0.7) + 'px';
    for (let i = 0; i < 64; i++) {
      const r = Math.floor(i / 8), c = i % 8;
      const x = myColor === 'w' ? c : 7 - c, y = myColor === 'w' ? 7 - r : r;
      const p = g.at(x, y, l), d = document.createElement('div');
      d.className = 'sq ' + ((x + y) % 2 === 1 ? 'l' : 'd');
      if (sel && sel.l === l && sel.x === x && sel.y === y) d.classList.add('sel');
      if (last && ((last.fl === l && last.fx === x && last.fy === y) || (last.fl !== l && last.tx === x && last.ty === y))) d.classList.add('last');
      if (k && k.l === l && k.x === x && k.y === y) d.classList.add('check');
      if (sel && sel.l === l && hints.some(m => m.tx === x && m.ty === y)) { d.classList.add('hint'); if (p) d.classList.add('cap'); }
      if (p) {
        const s = document.createElement('span');
        setGlyph(s, p.t, p.c); s.className = (p.c === 'w' ? 'w-piece' : '') + (isFairy(p.t) ? ' fairy' : '');
        d.appendChild(s);
      }
      d.onclick = () => clickAlice(x, y, l);
      el.appendChild(d);
    }
  });
  $('board2Wrap').classList.remove('hidden'); $('capA').classList.remove('hidden');
  $('handTop').innerHTML = ''; $('handBot').innerHTML = '';
  $('status').textContent = statusText();
  if (ended()) $('drawBanner').classList.add('hidden');
  $('history').textContent = hist.map(m => (m.fl ? 'B:' : 'A:') + sqName(m.fx, m.fy) + sqName(m.tx, m.ty)).join(' ');
}

