// ---------- mode cards ----------
const MODE_DESC = {
  standard: 'The classic game. Optional traits, classes, Chess960 and fog of war.', crazyhouse: 'Captured pieces go to your hand and can be dropped back on the board.', marseillais: 'Every turn you make two moves.',
  cylinder: 'The board wraps around: the a-file touches the h-file.', kriegspiel: 'You cannot see enemy pieces. You only hear what happened.', austang: 'Build your own army from a budget, then play.',
  austangGrand: 'Austang on 10×10 with a big set of fairy pieces.', austang4: 'Four players build armies, then fight on a 20×20 cross.', alice: 'Two boards: after every move the piece hops to the other board.',
  infinite: 'A huge 32×32 board with room to roam.', fourplayer: 'The classic cross-shaped four-player board. Free-for-all or 2v2.', fourmars: 'Four players, two moves per turn.', fourcrazy: 'Four players with Crazyhouse drops.',
  fourcyl: 'Four players on a wide board that wraps around.', fourkrieg: 'Four players, hidden pieces.', fourneutral: 'Neutral monsters roam the centre; capture one to tame it.', bughouse: '2v2 on two boards: pass captured pieces to your partner.',
  fouralice: 'Four-player Alice chess on two cross boards.', fourinfinite: 'Four players on an open 32×32 board.', eight: 'Eight armies on a 24×24 cross: two per side, holes, wild neutrals, a Boss, teams.',
  threeplayer: 'Three players on a hexagonal board.', imperial: 'A 17×16 board with new pieces: destroy the whole army to win.', promotion: 'Every piece can promote into many different forms.', imperial4: 'Imperial Chess for four on a 29×29 board.'
};
const MODE_ICON = { alice: '🪞', fouralice: '🪞', bughouse: '♞♞', threeplayer: '⬢', austang4: '🏰' };
const modeCount = k => (MODES[k].multi ? (MODES[k].all ? MODES[k].all.length : 4) : 2);
const thumbCache = {};
function thumbData(k) {
  if (k in thumbCache) return thumbCache[k];
  let d = null;
  try { if (!MODE_ICON[k]) { const g = makeEngine(k, null, null, null, null, null).game; if (g && g.w && g.at && !g.hex) d = boardData(g, !!g.oct, !MODES[k].multi); } } catch (e) { d = null; }
  return (thumbCache[k] = d);
}
const roomFamily = m => m.bug ? 'bug' : (m.v && m.v.hex) ? 'hex' : m.oct ? 'oct' : m.multi ? 'm4' : '2p';      // modes a room can switch between: same board family only
function modeBlocked(k) {                                  // inside a multiplayer room: only multiplayer modes that can seat everybody
  if (!(isHost && peer && !mstarted && MODES[mode] && MODES[mode].multi)) return '';
  if (!MODES[k].multi) return 'This room is for multiplayer modes. Make a new room for a 2-player game.';
  if (roomFamily(MODES[k]) !== roomFamily(MODES[mode])) return 'A room keeps its board. Make a new room to switch between 4-player, 8-player, hexagonal and Bughouse games.';
  const n = 1 + conns.filter(c => c.ready).length + lobbyBots.length;
  return modeCount(k) < n ? 'Seats ' + modeCount(k) + ' players, but ' + n + ' are in the room.' : '';
}
function modeTags(k) { const o = MODES[k].opts || [], t = []; if (o.includes('teams') || MODES[k].bug) t.push('teams'); if (o.includes('neutral')) t.push('neutral'); if (k === 'kriegspiel' || k === 'fourkrieg') t.push('hidden pieces'); if (MODES[k].imperial || MODES[k].promotion || /austang|oct/.test(k) || MODES[k].oct) t.push('custom pieces'); return t.slice(0, 3); }
function renderModeCards() {
  const q = $('modeSearch').value.trim().toLowerCase(), box = $('modeGroups'); box.innerHTML = '';
  const groups = {}; Object.keys(MODES).forEach(k => { const hay = (MODES[k].name + ' ' + (MODE_DESC[k] || '')).toLowerCase(); if (!q || hay.includes(q)) (groups[modeCount(k)] = groups[modeCount(k)] || []).push(k); });
  Object.keys(groups).map(Number).sort((a, b) => a - b).forEach(n => {
    const h = document.createElement('div'); h.className = 'mgroup'; h.textContent = n + (n === 1 ? ' player' : ' players'); box.appendChild(h);
    const grid = document.createElement('div'); grid.className = 'mgrid'; box.appendChild(grid);
    groups[n].forEach(k => {
      const card = document.createElement('div'), why = modeBlocked(k); card.className = 'mcard' + (k === $('modeSel').value ? ' sel' : '') + (why ? ' off' : ''); card.dataset.mode = k; if (why) card.title = why;
      const d = thumbData(k);
      if (d) { const cv = document.createElement('canvas'); paintBoard(cv, d, 120); card.appendChild(cv); } else { const ph = document.createElement('div'); ph.className = 'mph'; ph.textContent = MODE_ICON[k] || '♞'; card.appendChild(ph); }
      const nm = document.createElement('div'); nm.className = 'mn'; nm.textContent = MODES[k].name; card.appendChild(nm);
      const ds = document.createElement('div'); ds.className = 'md'; ds.textContent = MODE_DESC[k] || ''; card.appendChild(ds);
      const tg = modeTags(k); if (tg.length) { const w = document.createElement('div'); w.className = 'mtags'; tg.forEach(t => { const e = document.createElement('span'); e.className = 'mtag'; e.textContent = t; w.appendChild(e); }); card.appendChild(w); }
      if (why) { const wy = document.createElement('div'); wy.className = 'mwhy'; wy.textContent = why; card.appendChild(wy); }
      card.onclick = () => { if (why) return; $('modeSel').value = k; $('modeSel').dispatchEvent(new Event('change')); $('modeModal').classList.add('hidden'); };
      grid.appendChild(card);
    });
  });
  if (!box.children.length) { const e = document.createElement('div'); e.className = 'dim'; e.textContent = 'No mode matches “' + q + '”.'; box.appendChild(e); }
}
function refreshModeBtn() {
  const k = $('modeSel').value, b = $('modeBtn'); if (!MODES[k]) return; b.innerHTML = '';
  const d = thumbData(k), box = document.createElement('span');
  if (d) { const cv = document.createElement('canvas'); paintBoard(cv, d, 46); b.appendChild(cv); } else { const ph = document.createElement('span'); ph.textContent = MODE_ICON[k] || '♞'; ph.style.cssText = 'font-size:1.6rem;width:46px;text-align:center'; b.appendChild(ph); }
  const t = document.createElement('span'); t.className = 'mbt'; const n = document.createElement('div'); n.textContent = MODES[k].name; t.appendChild(n); const sub = document.createElement('div'); sub.className = 'mbs'; sub.textContent = modeCount(k) + ' players · ' + (MODE_DESC[k] || ''); t.appendChild(sub); b.appendChild(t);
  const c = document.createElement('span'); c.className = 'mbc'; c.textContent = 'Change ▾'; b.appendChild(c);
}
$('modeBtn').onclick = () => { $('modeSearch').value = ''; renderModeCards(); $('modeModal').classList.remove('hidden'); $('modeSearch').focus(); };
$('modeSearch').oninput = renderModeCards; $('modeClose').onclick = () => $('modeModal').classList.add('hidden');
$('modeModal').addEventListener('click', e => { if (e.target === $('modeModal')) $('modeModal').classList.add('hidden'); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') $('modeModal').classList.add('hidden'); });
window.addEventListener('load', refreshModeBtn);
function roomSummary() {
  const g = readGS(), op = MODES[mode].opts || [], bits = [];
  if (teamsOn() && !MODES[mode].bug && !MODES[mode].oct) bits.push('2v2 teams');
  if (op.includes('fog') && g.fog) bits.push('fog of war');
  if (MODES[mode].oct) {
    if (g.teams8 === 'sides' || g.teams8 === 'pairs') bits.push('2v2v2v2'); else if (g.teams8 === 'halves' || g.teams8 === 'wings') bits.push('4v4');
    bits.push({ none: 'no holes', four: 'four holes', big: 'one big hole', scatter: 'random mirrored holes (revealed at start)', random: 'random holes (revealed at start)' }[g.holes8]);
    if (g.wild8) bits.push('wild neutrals'); if (g.boss8) bits.push('Boss'); if (g.fallen) bits.push('fallen armies');
  } else if (op.includes('neutral')) bits.push('neutral pieces: ' + g.neutralSet + (g.fallen ? ', fallen armies' : ''));
  if (op.includes('traits') && g.traits) bits.push('traits');
  if (g.tcMin > 0) bits.push('clock ' + g.tcMin + '+' + g.tcInc);
  if (op.includes('classes') && g.classes) bits.push('classes');
  if (op.includes('c960') && g.c960) bits.push('Chess960');
  return 'Mode: ' + MODES[mode].name + (bits.length ? ' (' + bits.join(', ') + ')' : '');
}
// The host sends everybody back to the room: same people, same connections, but teams, mode and options can all be changed before the next Start.
async function backToRoom() {
  if (!isHost || !MODES[mode].multi || !mstarted) return;
  if (game && !ended() && !(await askConfirm('Go back to the room? The current game will be abandoned.', 'Back to room', true))) return;
  clearTimeout(botTimer); botTimer = null;
  inRoom = true; mstarted = false; sel = null;
  conns = conns.filter(c => c.open !== false);
  $('game').classList.add('hidden'); $('lobby').classList.remove('hidden'); $('lobbyCtl').classList.remove('hidden');
  $('botAdd').classList.toggle('hidden', !!MODES[mode].bug);
  $('modeSel').value = mode; updateAustUI(); renderRoster();
}
$('roomBtn').onclick = backToRoom;
// Changing the mode in the room (host, before Start): any multiplayer mode will do, the people stay.
$('modeSel').addEventListener('change', () => {
  if (!isHost || !peer || mstarted || !MODES[mode] || !MODES[mode].multi) return;
  const m = $('modeSel').value;
  if (!MODES[m].multi) { $('modeSel').value = mode; $('lobbyMsg').innerHTML = lobbyBase + '<br><b>This room is for multiplayer modes. Create a new room for a 2-player mode.</b>'; return; }
  mode = m; $('lobbyMsg').innerHTML = lobbyBase; $('botAdd').classList.toggle('hidden', !!MODES[m].bug); renderRoster();
});
function kickConn(c) {
  if (c.open) c.send({ type: 'kicked' });
  setTimeout(() => c.close(), 150);
  conns = conns.filter(x => x !== c); renderRoster();
}
function hostMultiConn(c) {
  conns.push(c);
  { const cnt = Array(teamCount()).fill(0); cnt[normTeam(hostTeam)]++; conns.filter(x => x !== c && x.ready).forEach(x => cnt[normTeam(x.team)]++); lobbyBots.forEach(b => cnt[normTeam(b.team)]++); c.team = lightestTeam(cnt); }
  onOpen(c, () => {
    c.ready = true; renderRoster();
    if ($('autoChk').checked && conns.filter(x => x.ready).length + lobbyBots.length === maxSeats() - 1) startMulti();
  });
  c.on('data', msg => { if (msg && msg.type === 'pickseat') { if (!mstarted) { if (String(msg.seat) === 'random') rollPref(c, false); else setPref(c, String(msg.seat), false); renderRoster(); } return; } if (msg && msg.type === 'skinPut') { takeSkins(msg.imgs); conns.forEach(sendSkins); specs.forEach(sendSkins); return; } if (msg && msg.type === 'profile') { c.name = cleanName(msg.name); c.pfp = safePfp(msg.pfp); c.sk = cleanSk(msg.sk); if (mstarted) pushSeatInfo(); else renderRoster(); return; } hostRecv(c, msg); });
  c.on('close', () => {
    if (c.replaced) return;
    if (!mstarted) { conns = conns.filter(x => x !== c); renderRoster(); }
    else { addChat('', CN[c.seat] + ' disconnected. They can rejoin with the same link.', true); connUI.lostAdd(CN[c.seat]); }
  });
}

function startMulti() {
  const players = conns.filter(c => c.ready);
  if (mstarted || (players.length < 1 && !lobbyBots.length)) return;
  if ($('startBtn').disabled) return;
  conns = players; mstarted = true; inRoom = false;
  const { seats, by } = lobbySeats();
  mySeat = by[0];
  conns.forEach((c, i) => { c.seat = by[i + 1]; });
  bots = {};
  lobbyBots.forEach((b, j) => { bots[by[1 + players.length + j]] = b.level; });
  newGame(mode, null, { seats, gs: readGS() });
  seatInfo = buildSeatInfo();
  if (MODES[mode].match4) initA4(seats, readSettings(mode), gs);
  conns.forEach(c => c.send({ type: 'minit', mode, seat: c.seat, seats, gs, info: seatInfo, a4: A4 ? { s: A4.s, teams: A4.teams } : undefined }));
  if (needDraft()) beginDraft();
  $('lobby').classList.add('hidden'); $('game').classList.remove('hidden');
  $('hostCtl').classList.remove('hidden'); $('modeSel2').value = mode; $('roomBtn').classList.remove('hidden');
  if (A4) { a4HostSendMates(); addChat('', 'You are ' + CN[mySeat] + '. Build your army in your own arm. Nobody sees it until everyone is ready' + (A4.teams ? ' (your partner can watch you build).' : '.'), 'minor'); render(); return; }
  addChat('', 'You are ' + CN[mySeat] + '. Turn order: ' + game.seats.map(c => CN[c]).join(' → ') + '.', 'minor');
  setTimeout(sendSucc, 1500);
  render();
}
$('startBtn').onclick = startMulti;
function teamNames(s) { return game.teams ? game.seats.filter(c => game.teams[c] === game.teams[s]).map(c => CN[c]).join(' & ') : CN[s]; }
const sameSide = (a, b) => a === b || !!(game && game.teams && game.teams[a] === game.teams[b]);

function hostRecv(c, msg) {
  if (A4 && msg && typeof msg.type === 'string' && msg.type.startsWith('a4')) return hostRecvA4(c, msg);
  if (A4 && !game) {                                         // chat and resync while the armies are being built
    if (msg.type === 'chat') { const t = String(msg.text || '').slice(0, 300); let im = safeImg(msg.img); if (im && !imgAllowed(c)) im = ''; if (!t && !im) return; addChat(CN[c.seat], t, false, c.seat, im); broadcast({ type: 'mchat', from: c.seat, text: t, img: im || undefined }); }
    else if (msg.type === 'resync') a4SendResume(c);
    return;
  }
  if (!game || !game.multi) return;
  if (inRoom && msg.type !== 'chat') return;                 // between games nothing on the board can change
  if (msg.type === 'ping') { hostPing(c, msg); return; }
  if (msg.type === 'react') { hostReact(c, msg); return; }
  if (replay && msg.type !== 'chat') { replay.queue.push({ host: true, c, msg }); return; }
  if (msg.type === 'tryMove') {
    if (game.bug && msg.m) msg.m.seat = c.seat;
    if (!draft && !bots[c.seat] && !ended() && (game.bug ? game.canMove(c.seat) : game.turn === c.seat) && game.move(msg.m)) { broadcast(mmoveMsg(msg.m)); announceMulti(); render(); }
  } else if (msg.type === 'resync') {
    c.send({ type: 'resume', rec: buildRecord(), seat: c.seat, draft: draftFor(c.seat), resync: true, a4x: A4 ? a4Extra(c.seat) : undefined, clk: clkSnap() });
  } else if (msg.type === 'pick') {
    recvPick(c.seat, msg.id);
  } else if (msg.type === 'tryResign') {
    if (!ended() && game.alive(c.seat)) { logResign(c.seat); game.resign(c.seat); broadcast({ type: 'mresign', seat: c.seat }); announceMulti(); render(); }
  } else if (msg.type === 'chat') {
    const t = String(msg.text || '').slice(0, 300); let im = safeImg(msg.img); if (im && !imgAllowed(c)) im = '';
    if (!t && !im) return;
    addChat(CN[c.seat], t, false, c.seat, im); broadcast({ type: 'mchat', from: c.seat, text: t, img: im || undefined });
  }
}

const addWallNum = (sp, n) => { if (!n) return; sp.style.position = 'relative'; sp.insertAdjacentHTML('beforeend', '<b class="wl">' + n + '</b>'); };
function announceMulti() {
  if (game && game.imperial) impAnnounce();
  if (MODES[mode].v.hidden) {
    const h = game.history(), m = h[h.length - 1];
    if (m) {
      const parts = [CN[m.c] + (m.drop ? ' dropped a piece.' : ' moved.')];
      if (m.cap) parts.push('Capture on ' + sqName(m.tx, m.ty) + ' (' + (m.cap === 'p' ? 'pawn' : 'piece') + ').');
      game.seats.filter(c => game.alive(c) && game.inCheck(c)).forEach(c => parts.push('Check on ' + CN[c] + '!'));
      addChat('', 'Referee: ' + parts.join(' '), true);
    }
  }
  if (game.oct) {                                                           // the Boss and its cells
    const h = game.history(), m = h[h.length - 1], bossT = Engine.NEUTRAL_T.boss;
    if (m && m.c !== 'n' && m.cap === bossT) { let left = 0; for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) { const q = game.at(x, y); if (q && q.t === bossT) left++; }
      addChat('', CN[m.c] + ' took a cell of the Boss' + (left ? ' (' + left + ' cell' + (left > 1 ? 's' : '') + ' left).' : '. The Boss is dead or claimed!'), true); }
    if (m && m.boss && m.c !== 'n') addChat('', CN[m.c] + ' moved their Boss' + (m.cap ? ' and crushed ' + m.cap.length + ' piece' + (m.cap.length > 1 ? 's' : '') + '!' : '.'), 'minor');
  }
  game.drainEvents().forEach(e => {
    if (e.e === 'trait') return;      // traits stay hidden until the end of the game
    if (e.e === 'skip') { addChat('', CN[e.c] + ' has no legal move (stalemate) and is skipped.', true); return; }
    const why = e.reason === 'crush' ? 'was crushed by a Boss' : e.reason === 'checkmate' ? 'was checkmated' : e.reason === 'stalemate' ? 'was stalemated' : e.reason === 'bare' ? 'was left with only Imperials' : (timedOut.has(e.c) ? 'ran out of time' : 'resigned');
    addChat('', CN[e.c] + ' ' + why + ' and is out. ' + (e.taken ? 'Their pieces now belong to ' + CN[e.taken] + '!' : e.fallen ? 'Their pieces are now neutral!' : 'Their pieces turn gray.'), true);
  });
  if (game.drawn) addChat('', (drawWhy() ? 'Only bare kings are left' : 'Nobody left can move') + '. The game is a draw.', true);
  const w = game.winner();
  if (w) addChat('', teamNames(w) + (game.teams ? ' win!' : ' wins!'), true);
  maybeRunNeutral();
}

// ---- neutral pieces: the host picks each move (captures first, otherwise random) and broadcasts it ----
const NVAL = { q: 9, r: 5, b: 3, n: 3, i: 3, w: 3, o: 3, c: 2, p: 1, k: 0 };
function pickNeutral(nx) {
  const val = m => { const t = game.at(m.tx, m.ty); return t ? 1 + (NVAL[t.t] || 0) : 0; };
  const best = Math.max(...nx.moves.map(val));
  const pool = best > 0 ? nx.moves.filter(m => val(m) === best) : nx.moves;
  return pool[Math.floor(Math.random() * pool.length)];
}
function noteNeutral(m) {
  const h = game.history(), last = h[h.length - 1];
  if (m && m.aim) addChat('', 'A Boar on ' + sqName(m.fx, m.fy) + ' is aiming. It charges that way next round!', 'minor');
  if (last && last.boss && last.c === 'n') addChat('', 'The Boss moved' + (last.cap ? ' and crushed ' + last.cap.length + ' piece' + (last.cap.length > 1 ? 's' : '') + '!' : '.'), 'minor');
  if (last && last.c === 'n' && last.cap && !last.boss) { const mv = game.at(last.tx, last.ty), who = mv && PNAMES[mv.t] && game.oct ? 'A ' + PNAMES[mv.t] : 'A neutral piece', what = ({ p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', c: 'commoner', i: 'imp', w: 'wraith', o: 'ox', k: 'king' }[last.cap] || (PNAMES[last.cap] || 'piece').toLowerCase()); addChat('', who + (mv && mv.t === Engine.NEUTRAL_T.boar ? ' charged and' : '') + ' captured a ' + (CN[last.capc] || '') + ' ' + what + ' on ' + sqName(last.tx, last.ty) + '!', 'minor'); }
  game.drainEvents().forEach(e => {
    if (e.e === 'elim') addChat('', CN[e.c] + ' was ' + (e.reason === 'checkmate' ? 'checkmated' : e.reason === 'crush' ? 'crushed by a Boss' : 'knocked out') + '.' + (e.fallen ? ' Their pieces are now neutral!' : '') + (e.heir ? ' Their pieces pass to ' + CN[e.heir] + '.' : ''), true);
  });
}
function maybeRunNeutral() {
  if (!isHost || nBusy || !game || !game.neutral || !game.neutralPending) return;
  nBusy = true; stepNeutral(game);
}
function stepNeutral(g) {
  setTimeout(() => {
    if (game !== g) { nBusy = false; return; }
    const nx = g.neutralNext();
    if (!nx) { nBusy = false; render(); return; }
    const m = pickNeutral(nx);
    if (!g.neutralApply(m)) { nBusy = false; return; }
    broadcast({ type: 'nmove', m }); noteNeutral(m); render();
    if (g.neutralPending) stepNeutral(g); else { nBusy = false; render(); announceMulti(); }
  }, 750);
}

// Host-only: knock out a player who left or is stalling. Their pieces turn gray like any elimination.
$('removeBtn').onclick = async () => {
  const c = $('removeSel').value;
  if (!isHost || !game || !game.multi || ended() || !c || !game.alive(c)) return;
  if (!(await askConfirm('Remove ' + CN[c] + ' from the game? Their pieces turn gray.', 'Remove', true)) || ended() || !game.alive(c)) return;
  logResign(c); game.resign(c); broadcast({ type: 'mresign', seat: c });
  addChat('', 'Host removed ' + CN[c] + '.', true);
  announceMulti(); render();
};

function playMulti(m) {
  if (replay || spectating) return;
  sel = null;
  if (game.bug) m = Object.assign({}, m, { seat: mySeat });
  if (isHost) {
    if (game.move(m)) { broadcast(mmoveMsg(m)); announceMulti(); }
  } else send({ type: 'tryMove', m });
  if (game.imperial && game.pend && game.turn === mySeat) sel = { x: game.pend.x, y: game.pend.y };
  render();
}

// Board is rotated so your own side is always at the bottom.
function fromView(c, X, Y, N = 14) {
  const m = N - 1;
  return c === 'r' ? [X, Y] : c === 'b' ? [Y, m - X] : c === 'y' ? [m - X, m - Y] : [m - Y, X];
}

function clickMulti(x, y) {
  $('promo').classList.add('hidden');
  if (draft || replay || spectating) return;
  if (rewardMine()) { if (rewardPick && rewSet && rewSet.has(x + ',' + y)) { const t = rewardPick; rewardPick = null; playMulti({ reward: true, t, tx: x, ty: y }); } return; }
  if (pingMode) return pingClick(x, y);
  if (swapMode) return swapClick(x, y);
  if (abMode) return abClick(x, y);
  if (foeClick(x, y)) return;
  if (ended() || game.neutralPending || game.turn !== mySeat || !game.alive(mySeat)) return;
  const hid = MODES[mode].v.hidden;
  if (sel) {
    let cand = sel.drop
      ? game.drops().filter(m => m.drop === sel.drop && m.tx === x && m.ty === y)
      : selMoves().filter(m => m.tx === x && m.ty === y && !m.inplace);
    if (!cand.length && !sel.drop && game.oct) { const f = game.fwd(mySeat); if (x === sel.x + f[0] && y === sel.y + f[1]) cand = selMoves().filter(m => m.inplace); }
    if (friendlyPending(x, y, cand)) return;
    if (cand.length) { cand.length > 1 ? showPromo(cand.map(withCk)) : playMulti(withCk(cand[0])); return; }
    const own = game.at(x, y) && game.at(x, y).c === mySeat;
    if (hid && !sel.drop && !own && !(x === sel.x && y === sel.y)) { addChat('', 'Referee: illegal move, try again.', true); return; }
  }
  const p = game.at(x, y);
  sel = (p && !p.wall && p.c === mySeat && !p.dead && !(sel && sel.x === x && sel.y === y)) ? { x, y } : null; selIdx = 0;
  render();
}

function renderMultiHands() {
  const g = game, V = MODES[mode].v, top = $('handTop'), bot = $('handBot');
  top.innerHTML = ''; bot.innerHTML = ''; top.classList.remove('others');
  if (!(V.neutral ? gs.neutralDrop : V.drops)) return;
  const txt = h => 'qrbnpciwoal'.split('').filter(t => h[t] > 0).map(t => GLYPH[t] + '×' + h[t]).join(' ') || 'none';
  top.classList.add('others');
  top.textContent = 'Hands: ' + g.seats.filter(c => c !== mySeat).map(c => CN[c] + ' ' + txt(g.hand(c))).join(' · ');
  const hand = g.hand(mySeat);
  'qrbnpciwo'.split('').forEach(t => {            // (the neutral fairy pieces c/i/w/o can be in your hand too)
    if (!(hand[t] > 0)) return;
    const b = document.createElement('button');
    b.innerHTML = glyphHTML(t, game.multi ? mySeat : myColor) + '×' + hand[t];
    if (sel && sel.drop === t) b.className = 'on';
    b.onclick = () => {
      if (ended() || game.turn !== mySeat || !game.alive(mySeat)) return;
      sel = (sel && sel.drop === t) ? null : { drop: t }; render();
    };
    bot.appendChild(b);
  });
}

function clickAlice4(x, y, l) {
  $('promo').classList.add('hidden');
  if (draft || replay || spectating) return;
  if (ended() || game.turn !== mySeat || !game.alive(mySeat)) return;
  if (sel && sel.l === l) {
    const cand = game.moves(sel.x, sel.y, sel.l).filter(m => m.tx === x && m.ty === y);
    if (cand.length) { cand.length > 1 && cand[0].promo ? showPromo(cand) : playMulti(cand[0]); return; }
  }
  const p = game.at(x, y, l);
  sel = (p && p.c === mySeat && !p.dead && !(sel && sel.x === x && sel.y === y && sel.l === l)) ? { x, y, l } : null;
  render();
}

function renderAlice4() {
  const g = game, hist = g.history(), last = hist[hist.length - 1];
  const hints = sel ? g.moves(sel.x, sel.y, sel.l) : [];
  const k = g.alive(g.turn) && g.inCheck(g.turn) ? g.kingPos(g.turn) : null;
  const size = Math.min(innerWidth - 32, 420);
  $('board').classList.remove('hexb');
  [0, 1].forEach(l => {
    const el = l ? $('board2') : $('board'); el.innerHTML = '';
    el.style.gridTemplateColumns = 'repeat(14,minmax(0,1fr))'; el.style.aspectRatio = '1';
    el.style.width = size + 'px'; el.style.fontSize = (size / 14 * 0.72) + 'px';
    for (let r = 0; r < 14; r++) for (let c = 0; c < 14; c++) {
      const [x, y] = fromView(mySeat, c, 13 - r), d = document.createElement('div');
      if (!g.valid(x, y)) { d.style.visibility = 'hidden'; el.appendChild(d); continue; }
      const p = g.at(x, y, l);
      d.className = 'sq ' + ((x + y) % 2 === 1 ? 'l' : 'd');
      if (sel && sel.l === l && sel.x === x && sel.y === y) d.classList.add('sel');
      if (last && ((last.fl === l && last.fx === x && last.fy === y) || (last.fl !== l && last.tx === x && last.ty === y))) d.classList.add('last');
      if (k && k.l === l && k.x === x && k.y === y) d.classList.add('check');
      if (sel && sel.l === l && hints.some(m => m.tx === x && m.ty === y)) { d.classList.add('hint'); if (p) d.classList.add('cap'); }
      if (p) { const sp = document.createElement('span'); setGlyph(sp, p.t); sp.className = (p.dead ? 'pc-dead' : 'pc-' + p.c) + (isFairy(p.t) ? ' fairy' : ''); d.appendChild(sp); }
      d.onclick = () => clickAlice4(x, y, l);
      el.appendChild(d);
    }
  });
  $('board2Wrap').classList.remove('hidden'); $('capA').classList.remove('hidden');
  $('capA').textContent = 'Board A'; $('board2Wrap').querySelector('.lbl').textContent = 'Board B';
  $('handTop').innerHTML = ''; $('handBot').innerHTML = '';
  $('status').textContent = statusText();
  $('drawBanner').classList.add('hidden');
  if (isHost) {
    const rs = $('removeSel'), prev = rs.value;
    rs.innerHTML = '';
    g.seats.filter(c => c !== mySeat && g.alive(c)).forEach(c => rs.add(new Option(CN[c], c)));
    if (prev) rs.value = prev;
  }
  $('history').textContent = 'Order: ' + g.seats.map(c => CN[c] + (g.alive(c) ? '' : ' ✖')).join(' → ') +
    '   |   Alice rules: a piece moves on its own board, the square must be empty on the other board, and it then jumps to the other board. Check only counts on the king\'s own board.';
}

function clickBug(x, y) {
  $('promo').classList.add('hidden');
  if (draft || replay || spectating) return;
  if (ended() || !game.canMove(mySeat)) return;
  const [bd, col] = game.info[mySeat];
  if (sel) {
    const cand = sel.drop
      ? game.drops(bd).filter(m => m.drop === sel.drop && m.tx === x && m.ty === y)
      : game.moves(bd, sel.x, sel.y).filter(m => m.tx === x && m.ty === y);
    if (cand.length) { cand.length > 1 && cand[0].promo ? showPromo(cand) : playMulti(cand[0]); return; }
  }
  const p = game.at(bd, x, y);
  sel = (p && p.c === col && !(sel && sel.x === x && sel.y === y)) ? { x, y } : null;
  render();
}

function drawBugBoard(el, bd, color, interactive, cellPx) {
  const g = game;
  el.innerHTML = '';
  el.style.gridTemplateColumns = 'repeat(8,minmax(0,1fr))'; el.style.aspectRatio = '1'; el.style.fontSize = (cellPx * 0.75) + 'px';
  const hist = g.history().filter(h => h.board === bd), last = hist[hist.length - 1];
  let kingSq = null;
  if (g.inCheck(bd)) for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const p = g.at(bd, x, y); if (p && p.t === 'k' && p.c === g.turnOf(bd)) kingSq = x + ',' + y; }
  const hints = interactive && sel && !ended() && g.canMove(mySeat)
    ? (sel.drop ? g.drops(bd).filter(m => m.drop === sel.drop) : g.moves(bd, sel.x, sel.y)) : [];
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const x = color === 'w' ? c : 7 - c, y = color === 'w' ? 7 - r : r;
    const p = g.at(bd, x, y), d = document.createElement('div');
    d.className = 'sq ' + ((x + y) % 2 === 1 ? 'l' : 'd');
    if (interactive && sel && sel.x === x && sel.y === y) d.classList.add('sel');
    if (last && ((last.tx === x && last.ty === y) || (last.fx === x && last.fy === y))) d.classList.add('last');
    if (kingSq === x + ',' + y) d.classList.add('check');
    { const hm = hints.find(m => m.tx === x && m.ty === y); if (hm) { d.classList.add('hint'); if (p) d.classList.add('cap'); if (hm.shot) d.classList.add('shot'); } }
    if (p) { const sp = document.createElement('span'); setGlyph(sp, p.t); sp.className = (p.c === 'w' ? 'w-piece' : '') + (isFairy(p.t) ? ' fairy' : ''); d.appendChild(sp); }
    if (interactive) d.onclick = () => clickBug(x, y);
    el.appendChild(d);
  }
}

function renderBug() {
  const g = game, [bd, col] = g.info[mySeat], ob = bd === 'A' ? 'B' : 'A', partner = g.partner[mySeat], pcol = g.info[partner][1];
  const cell = boardPx() / 8, nm = c => (c === 'w' ? 'White' : 'Black');
  $('board').classList.remove('hexb'); $('board').style.width = '100%';
  drawBugBoard($('board'), bd, col, true, cell);
  $('board2Wrap').classList.remove('hidden'); $('capA').classList.remove('hidden');
  $('capA').textContent = 'Your board (Board ' + bd + '): you play ' + nm(col) + ' vs ' + CN[g.seatOf(bd, col === 'w' ? 'b' : 'w')];
  $('board2Wrap').querySelector('.lbl').textContent = "Partner's board (Board " + ob + '): ' + CN[partner] + ' plays ' + nm(pcol);
  const b2 = $('board2'); b2.style.width = '62%';
  drawBugBoard(b2, ob, pcol, false, cell * 0.62);
  const top = $('handTop'), bot = $('handBot'), txt = h => 'qrbnp'.split('').filter(t => h[t] > 0).map(t => GLYPH[t] + '×' + h[t]).join(' ') || 'none';
  top.innerHTML = ''; bot.innerHTML = ''; top.classList.add('others');
  top.textContent = 'Hands: partner ' + CN[partner] + ': ' + txt(g.hand(partner)) + '  ·  opponents: ' +
    g.seats.filter(c => g.teams[c] !== g.teams[mySeat]).map(c => CN[c] + ' ' + txt(g.hand(c))).join(', ');
  const hand = g.hand(mySeat);
  'qrbnp'.split('').forEach(t => {
    if (!(hand[t] > 0)) return;
    const b = document.createElement('button');
    b.innerHTML = glyphHTML(t, game.multi ? mySeat : myColor) + '×' + hand[t];
    if (sel && sel.drop === t) b.className = 'on';
    b.onclick = () => { if (ended() || !g.canMove(mySeat)) return; sel = (sel && sel.drop === t) ? null : { drop: t }; render(); };
    bot.appendChild(b);
  });
  $('status').textContent = bugStatus();
  $('drawBanner').classList.add('hidden');
  if (isHost) {
    const rs = $('removeSel'), prev = rs.value;
    rs.innerHTML = '';
    g.seats.filter(c => c !== mySeat && g.alive(c)).forEach(c => rs.add(new Option(CN[c], c)));
    if (prev) rs.value = prev;
  }
  $('history').textContent = 'Board A: Red (White) vs Blue (Black) · Board B: Green (White) vs Yellow (Black) · Teams: Red & Yellow vs Blue & Green. A piece you capture goes to your partner. No clocks.';
}

// Rotate a hex cell (axial q,r) in 120-degree steps so that `seat`'s corner ends up at the bottom.
function viewRot(seat, q, r) {
  const k = { r: 0, b: 1, y: 2 }[seat];
  for (let i = 0; i < (3 - k) % 3; i++) [q, r] = [-q - r, q];
  return [q, r];
}

// Which arrow to draw on a Boar that is aiming, given how the board is turned for the viewer (side = 'r','b','y','g').
function aimArrow(side, [dx, dy]) {
  const [X, Y] = side === 'r' ? [dx, dy] : side === 'b' ? [-dy, dx] : side === 'y' ? [-dx, -dy] : [dy, -dx];
  return ['→', '↗', '↑', '↖', '←', '↙', '↓', '↘'][(Math.round(Math.atan2(Y, X) / (Math.PI / 4)) + 8) % 8];
}
function renderMulti() {
  const g = game, el = $('board'), V = MODES[mode].v, hex = !!g.hex;
  const hid = !!V.hidden && !ended() && !replay && !spectating && g.alive(mySeat);
  const seen = gs.fog && !ended() && !replay && !spectating && g.alive(mySeat) ? g.sees(mySeat) : null;
  el.innerHTML = '';
  $('board2Wrap').classList.add('hidden'); $('capA').classList.add('hidden');
  const hist = g.history(), last = hist[hist.length - 1];
  const hints = sel && !hid ? (sel.drop ? g.drops().filter(m => m.drop === sel.drop) : selMoves()) : [];
  const kp = g.alive(g.turn) && g.inCheck(g.turn) && (!hid || g.turn === mySeat) ? g.kingPos(g.turn) : null;

  const livePg = livePings();
  const decorate = (d, x, y) => {
    d.dataset.x = x; d.dataset.y = y;
    const p = g.at(x, y), fogged = !!seen && !seen.has(y * g.w + x);
    const shown = p && !(hid && !p.dead && !sameSide(p.c, mySeat)) && !fogged;
    if (fogged) d.classList.add('fog');
    if (sel && sel.x === x && sel.y === y) d.classList.add('sel');
    if (last && !hid && last.fx !== undefined && ((last.fx === x && last.fy === y) || (last.tx === x && last.ty === y))) d.classList.add('last');
    if (last && !hid && last.drop && last.tx === x && last.ty === y) d.classList.add('last');
    if (kp && kp.x === x && kp.y === y) d.classList.add('check');
    if (last && last.hits && last.hits.some(q => q.x === x && q.y === y)) d.classList.add('splash');
    { const hm = hints.find(m => m.tx === x && m.ty === y && !m.inplace); if (hm) { d.classList.add('hint'); if (shown) d.classList.add('cap'); if (hm.shot) d.classList.add('shot'); }
      if (g.oct && sel && !sel.drop && hints.some(m => m.inplace)) { const f = g.fwd(mySeat); if (x === sel.x + f[0] && y === sel.y + f[1]) d.classList.add('hint'); } }      // a pawn facing a hole: the hole is where you click to promote
    if (abSet && abSet.has(x + ',' + y)) d.classList.add('hint');
    if (mineSet && mineSet.has(x + ',' + y)) d.classList.add('mine');
    if (foeSet && foeSet.has(x + ',' + y)) { d.classList.add('foe'); if (foeSet.get(x + ',' + y)) d.classList.add('foec'); }
    if (rewSet && rewSet.has(x + ',' + y)) { d.classList.add('hint'); d.classList.add('rew'); }
    if (rngSet && rngSet.has(x + ',' + y)) { d.classList.add('rng'); if (rngF) d.classList.add('rngf'); if (!d.title) d.title = 'In range: it can shoot here if something stands on it'; }
    if (rmarkSet && rmarkSet.has(x + ',' + y)) d.classList.add('rmark');
    if (metSet && metSet.has(x + ',' + y)) d.classList.add('met');
    markClip(d, x, y, !fogged);
    if (promoHint && game.inPromo(x, y, meId())) d.classList.add('promoz');
    if ((abFrom && abFrom.x === x && abFrom.y === y) || (chargeSq && chargeSq.x === x && chargeSq.y === y) || (foeSel && foeSel.x === x && foeSel.y === y)) d.classList.add('sel');
    if (shown) {
      const sp = document.createElement('span');
      setGlyph(sp, shownType(p), p.c); if (p.wall && g.wallLife) addWallNum(sp, g.wallLife(x, y)); if (p.rc > 0) addWallNum(sp, p.rc); sp.className = (p.dead ? 'pc-dead' : 'pc-' + p.c) + (isFairy(p.t) ? ' fairy' : '') + (p.champ && sameSide(p.c, mySeat) ? ' champ' : '') + fxClass(p);
      if (p.c === 'n') d.classList.add('neu');
      if (p.t === Engine.NEUTRAL_T.boss) {
        d.classList.add('bossc');
        if (p.part) {                                                         // which quarter of the picture is this cell, as the board is turned for this viewer?
          const side = viewSeat(mySeat), dx = p.part[0] * 2 - 1, dy = p.part[1] * 2 - 1;
          const [X, Y] = side === 'r' ? [dx, dy] : side === 'b' ? [-dy, dx] : side === 'y' ? [-dx, -dy] : [dy, -dx];
          const qx = X > 0 ? 1 : 0, qy = Y > 0 ? 0 : 1, bk = ownerSk(p.c), be = bk && bk[p.t];
          sp.innerHTML = (be && skinBossHTML(be, qx, qy)) || bossQuarter(qx, qy);
        }
      }
      sp.dataset.pc = '1'; d.appendChild(sp);
      if (p.t === Engine.NEUTRAL_T.boss && p.c !== 'n' && g.bossCooldown && g.bossCooldown(p.bid) > 0 && g.moves(x, y).length === 0) { d.classList.add('bcd'); const cd = document.createElement('span'); cd.className = 'cd'; cd.textContent = '⏳'; cd.title = 'Your Boss is resting: it can move again after your next turn'; d.appendChild(cd); }
      if (p.aim) { const a = document.createElement('span'); a.className = 'aim'; a.textContent = aimArrow(viewSeat(mySeat), p.aim); a.title = 'Aiming: it charges this way next round'; d.appendChild(a); }
    }
    livePg.forEach(pg => { if (!pg.mark && pg.tx === x && pg.ty === y) d.appendChild(pingBubble(pg)); });
    if (pingSrc && pingSrc.x === x && pingSrc.y === y) { d.classList.add('pingsrc'); d.style.setProperty('--pc', seatCol(mySeat)); }
    d.onclick = () => clickMulti(x, y);
  };

  if (hex) {
    const R = g.radius, s = boardPx() / (3 * R + 2), hh = Math.sqrt(3) * s;
    const W = s * (3 * R + 2), H = hh * (2 * R + 1);
    el.classList.add('hexb'); el.style.aspectRatio = 'auto'; el.style.width = W + 'px'; el.style.height = H + 'px';
    el.style.fontSize = (hh * 0.72) + 'px';
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
      if (!g.valid(x, y)) continue;
      const q = x - R, r = y - R, [Q, Rr] = viewRot(mySeat, q, r), d = document.createElement('div');
      d.className = 'sq hx' + (((q - r) % 3) + 3) % 3;
      d.style.width = (2 * s) + 'px'; d.style.height = hh + 'px';
      d.style.left = (W / 2 + s * 1.5 * Q - s) + 'px';
      d.style.top = (H / 2 + hh * (Rr + Q / 2) - hh / 2) + 'px';
      decorate(d, x, y); el.appendChild(d);
    }
  } else {
    const W = g.w, H = g.h, inf = W >= 29 || !!g.oct, cell = boardPx() / W, north = mySeat === 'b' || mySeat === 'g';
    const voidSet = g.oct ? new Set(g.holeList().map(h => h[1] * 24 + h[0])) : null, tempMap = g.oct ? new Map(g.tempHoles().map(h => [h.y * 24 + h.x, h.left])) : null;
    const cylOn = !!g.cyl, Wd = cylOn ? W + 2 : W;
    el.style.gridTemplateColumns = cylOn ? 'minmax(0,.5fr) minmax(0,.85fr) ' + 'minmax(0,1fr) '.repeat(W - 2) + 'minmax(0,.85fr) minmax(0,.5fr)' : 'repeat(' + W + ',minmax(0,1fr))';
    el.style.aspectRatio = cylOn ? (W + 0.7) + '/' + H : W + '/' + H;
    el.style.width = inf ? (W * 34) + 'px' : '100%';
    el.style.fontSize = inf ? '24px' : (cell * 0.75) + 'px';
    for (let r = 0; r < H; r++) for (let c = 0; c < Wd; c++) {
      const cc = cylOn ? c - 1 : c;
      const [bx, y] = g.wide ? (north ? [W - 1 - cc, r] : [cc, H - 1 - r]) : fromView(viewSeat(mySeat), c, H - 1 - r, W), x = cylOn ? cylMod(bx + cylShift, W) : bx, d = document.createElement('div');
      if (!g.valid(x, y)) {
        const k = y * 24 + x, isVoid = !!voidSet && (voidSet.has(k) || tempMap.has(k));
        if (!isVoid && !g.at(x, y)) { d.style.visibility = 'hidden'; el.appendChild(d); continue; }          // outside the board (corners, notches)
        d.className = 'sq void';                                                                            // a hole (or the Boss's nest): drawn dark; temporary holes count down
        if (tempMap.has(k)) { const vn = document.createElement('span'); vn.className = 'vn'; vn.textContent = tempMap.get(k); d.appendChild(vn); }
        decorate(d, x, y); el.appendChild(d); continue;
      }
      d.className = 'sq ' + ((x + y) % 2 === 1 ? 'l' : 'd') + (cylOn && (c === 0 || c === Wd - 1) ? ' ghost' : '');
      decorate(d, x, y); el.appendChild(d);
    }
    if (inf) setupBigBoard(34, g.imperial ? Math.max(W, H) : g.oct ? 24.5 : 18);
    if (cylOn) cylSetup(true);
  }
  renderMultiHands();
  $('status').textContent = statusText() + (A4 ? a4StatusExtra() : '');
  $('drawBanner').classList.add('hidden');
  if (isHost) {
    const rs = $('removeSel'), prev = rs.value;
    rs.innerHTML = '';
    g.seats.filter(c => c !== mySeat && g.alive(c)).forEach(c => rs.add(new Option(CN[c], c)));
    if (prev) rs.value = prev;
  }
  $('history').textContent = 'Order: ' + g.seats.map(c => CN[c] + (g.alive(c) ? '' : ' ✖')).join(' → ') +
    (g.oct && g.neutral ? '   |   Wild neutrals (dashed ring): Boar: aims (arrow), then charges; Hound: hunts the nearest piece; Burrower: leaves a hole behind; Golem: only rooks/queens can take it; Boss: 2×2, crushes what it rolls over. The piece that takes a Boss cell survives.' : g.neutral ? '   |   Neutral (purple, dashed ring): shield = commoner (1 step any way), horned face = imp (knight jump), ghost = wraith (up to 2 diagonally), bull = ox (up to 2 straight). They always capture when they can. Capture one to tame it: drop it on your own arm.' : '');
  if (A4) $('history').textContent = a4ScoreLine() + '   |   ' + $('history').textContent;
}

