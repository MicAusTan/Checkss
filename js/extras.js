/* extras.js: captured pieces, copy / analyse a finished game, take-backs, keyboard shortcuts, quick chat phrases, connection dot, bot strength notes. */

/* ---- captured pieces (worked out from the move list, so it works in every mode with a plain board; hidden in fog / hidden-piece modes like the move list) ---- */
const CAPVAL = { p: 1, n: 3, b: 3, r: 5, q: 9 };
function capTally(g) {                                     // how many pieces of each kind each player has on the board right now (null when the board is not a plain grid)
  if (!g || g.bug || g.layers || !g.w) return null;
  const t = {};
  try { for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) { if (g.valid && !g.valid(x, y)) continue; const p = g.at(x, y); if (p && p.c && p.c !== 'n' && !p.dead) { const k = p.c + '|' + p.t; t[k] = (t[k] || 0) + 1; } } } catch (e) { return null; }
  return t;
}
function capDiff(before, after, mover) {                   // pieces that disappeared from the other players (a promotion changes the mover's own kinds, so it is not counted)
  const out = [];
  for (const k in before) { const [c, t] = k.split('|'); if (c === mover) continue; const n = before[k] - (after[k] || 0); for (let i = 0; i < n; i++) out.push({ c, t }); }
  return out;
}
function renderCaptured() {
  const box = $('capBox'), live = liveGame();
  if (!ml || !ml.caps || ml.tally === null || !live || live.bug || $('moveBox').classList.contains('hidden')) { box.classList.add('hidden'); return; }
  const upto = replay ? replay.ply : ml.caps.length, lost = {};
  ml.caps.slice(0, upto).forEach(list => list.forEach(({ c, t }) => { (lost[c] = lost[c] || {})[t] = (lost[c][t] || 0) + 1; }));
  const owners = live.multi ? live.seats : ['w', 'b'], body = $('capBody'); body.textContent = '';
  let any = false, plain = true; const val = {};
  owners.forEach(o => {
    const kinds = Object.keys(lost[o] || {}); val[o] = 0;
    kinds.forEach(t => { if (CAPVAL[String(t).toLowerCase()]) val[o] += CAPVAL[String(t).toLowerCase()] * lost[o][t]; else plain = false; });
    if (!kinds.length) return; any = true;
    kinds.sort((a, b) => (CAPVAL[String(b).toLowerCase()] || 0) - (CAPVAL[String(a).toLowerCase()] || 0) || lost[o][b] - lost[o][a]);
    const row = document.createElement('div'); row.className = 'caprow';
    const who = document.createElement('span'); who.className = 'capwho ' + (live.multi ? 'm-' + o : 'p-' + o); who.textContent = (live.multi ? CN[o] : o === 'w' ? 'White' : 'Black') + ' lost'; row.appendChild(who);
    kinds.slice(0, 12).forEach(t => { const c = document.createElement('span'); c.className = 'cp ' + (live.multi ? 'm-' + o : 'p-' + o); c.title = (PNAMES && PNAMES[t]) || t; c.innerHTML = (GLYPH[t] || t) + (lost[o][t] > 1 ? '<small>×' + lost[o][t] + '</small>' : ''); row.appendChild(c); });
    if (kinds.length > 12) { const m = document.createElement('span'); m.className = 'dim'; m.textContent = '+' + (kinds.length - 12) + ' more kinds'; row.appendChild(m); }
    body.appendChild(row);
  });
  if (!live.multi && plain && any && val.w !== val.b) { const lead = val.b > val.w ? 'White' : 'Black'; const d = document.createElement('div'); d.className = 'capdiff'; d.textContent = lead + ' is ahead by ' + Math.abs(val.w - val.b) + ' in material'; body.appendChild(d); }
  if (!any) { const d = document.createElement('div'); d.className = 'dim'; d.textContent = 'Nothing captured yet.'; body.appendChild(d); }
  box.classList.remove('hidden');
}

/* ---- copy the moves / analyse the game afterwards (standard chess only; only once the game is over) ---- */
function moveText() {
  if (!ml || !ml.items) return '';
  let n = 0; return ml.items.map((it, i) => (game.multi ? (i + 1) + '. ' : it.who === 'w' ? (++n) + '. ' : '') + it.text).join(' ');
}
function copyMoves(ev) {
  const txt = moveText(), b = ev && ev.currentTarget, done = () => { if (b) { const o = b.textContent; b.textContent = 'Copied ✓'; setTimeout(() => { b.textContent = o; }, 1500); } };
  const fallback = () => { const ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) { /* ignore */ } ta.remove(); done(); };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, fallback); else fallback();
}
const canAnalyse = () => !!(game && mode === 'standard' && !game.multi && !M && !draft && !replay && ended() && ml && ml.items && ml.items.length && !(gs && (gs.fog || gs.classes || gs.traits || gs.teamTrait || gs.c960)));      // custom starts (classes, traits, Chess960, fog) cannot be read by the standard-chess analysis
function analyseGame() {
  if (!canAnalyse()) return;
  reviewBack = true; $('game').classList.add('hidden');
  const err = Practice.reviewMoves(moveText(), spectating ? 'both' : myColor);
  if (err) addChat('', 'Could not read this game for analysis: ' + err, 'event');
}

/* ---- take-backs (2-player games with a plain rule set; the bot always allows it, a person is asked) ---- */
let tb = null, tbLock = 0; const TB_TTL = 30000;
function tbCount() {
  if (!game || !game.history) return 0; const h = game.history().length;
  if (MODES[mode].v.movesPerTurn > 1) return 0;
  return game.turn === myColor ? (h >= 2 ? 2 : 0) : (h >= 1 ? 1 : 0);
}
const tbAllowed = () => !!(game && !game.multi && !game.bug && !M && !gclasses && !gtraits && !spectating && !replay && !draft && inPlay() && !ended() && !(gs && gs.fog) && !MODES[mode].v.hidden && $('clkTopRow').classList.contains('hidden') && !game.pend && tbCount() > 0);
function tbApply(n) {
  if (!game || game.multi || n < 1 || n > game.history().length) return;
  const rec = buildRecord(); rec.moves = rec.moves.slice(0, rec.moves.length - n);
  try { if (typeof botBusy !== 'undefined' && botBusy) { clearTimeout(botBusy.to); botBusy = null; } } catch (e) { /* no bot thinking */ }
  game = buildGameFromRecord(rec, rec.moves.length); sel = null; over = null; overRes = null; tb = null;
  addChat('', n === 1 ? 'Last move taken back.' : 'Last two moves taken back.', 'event');
  if (isHost) sendSpecs({ type: 'tbDo', n });
  render();
}
function tbRefresh() {
  const btn = $('tbBtn'), ok = tbAllowed(), pend = tb && (tb.out || tb.inc);
  if (pend && (!game || game.history().length !== tb.ply || ended())) tb = null;
  if (tb && Date.now() > tb.until) { if (tb.out) { addChat('', 'Your take-back request ran out without an answer.', 'event'); tbLock = game.history().length + 2; } tb = null; }
  btn.classList.toggle('hidden', !ok && !(tb && tb.out));
  btn.textContent = tb && tb.out ? 'Cancel take-back request' : 'Take back';
  btn.disabled = !!(tb && tb.inc) || (!(tb && tb.out) && game && game.history && game.history().length < tbLock);
  $('tbBanner').classList.toggle('hidden', !(tb && tb.inc && ok === ok && !spectating));
  if (tb && tb.inc) $('tbTxt').textContent = 'Your opponent asks to take back ' + (tb.n === 1 ? 'their last move.' : 'their last move (and your reply).');
}
$('tbBtn').onclick = () => {
  if (tb && tb.out) { send({ type: 'tbCancel' }); tb = null; tbRefresh(); return; }
  if (!tbAllowed()) return;
  const n = tbCount();
  if (bots2p) { tbApply(n); return; }
  tb = { out: true, n, ply: game.history().length, until: Date.now() + TB_TTL };
  send({ type: 'tbReq', n, ply: tb.ply }); addChat('', 'You asked to take back your last move.', 'event'); tbRefresh();
};
$('tbAllow').onclick = () => { if (!tb || !tb.inc) return; const t = tb; send({ type: 'tbYes', n: t.n, ply: t.ply }); tbApply(t.n); };
$('tbRefuse').onclick = () => { if (!tb || !tb.inc) return; send({ type: 'tbNo' }); tb = null; tbRefresh(); };
setInterval(() => { if (game) tbRefresh(); }, 500);
function fightButtons() {                                    // resign / draw only exist while there is a fight (not while armies are built or between Austang rounds)
  const none = !!(M && M.phase !== 'play') || !!(A4 && A4.phase === 'setup');
  $('drawBtn').classList.toggle('hidden', none || !!(game && game.multi && game.bug)); $('resignBtn').classList.toggle('hidden', none);
}
{ const baseRender = render; render = function () { baseRender.apply(this, arguments); fightButtons(); tbRefresh(); netDotRefresh(); }; }

/* ---- connection dot: guests ping the host every few seconds; the host sees when each guest was last heard ---- */
let rtt = null, lastPong = 0, lastSeen = 0;
function netDotRefresh() {
  const d = $('netDot'); if (!game || spectating || inRoom) { d.classList.add('hidden'); return; }
  let cls = '', tip = '';
  if (!isHost) {
    if (!lastPong) { d.classList.add('hidden'); return; }
    const age = Date.now() - lastPong; cls = age > 12000 ? 'bad' : rtt > 350 ? 'slow' : 'ok'; tip = age > 12000 ? 'No answer from the host for ' + Math.round(age / 1000) + ' s' : 'Connection to the host: ' + rtt + ' ms';
  } else {
    const seen = conns.filter(c => c.open).map(c => c.seen || lastSeen).filter(Boolean); if (!seen.length) { d.classList.add('hidden'); return; }
    const age = Date.now() - Math.min(...seen); cls = age > 12000 ? 'bad' : age > 7000 ? 'slow' : 'ok'; tip = age > 12000 ? 'A player has not been heard from for ' + Math.round(age / 1000) + ' s' : 'All players connected';
  }
  d.className = cls; d.title = tip;
}
setInterval(() => { if (typeof isHost !== 'undefined' && !isHost && game && !spectating) { try { send({ type: 'ping', t: Date.now() }); } catch (e) { /* not connected */ } } netDotRefresh(); }, 4000);
{ const baseHost = hostRecv; hostRecv = function (c, msg) {
    if (msg && msg.type === 'ping') { c.seen = Date.now(); try { c.send({ type: 'pong', t: msg.t }); } catch (e) { /* closed */ } return; }
    return baseHost.apply(this, arguments); };
  const baseHandle = handleMessage; handleMessage = function (msg) {
    if (msg && msg.type === 'ping') { lastSeen = Date.now(); try { send({ type: 'pong', t: msg.t }); } catch (e) { /* closed */ } return; }
    if (msg && msg.type === 'pong') { rtt = Date.now() - msg.t; lastPong = Date.now(); return; }
    if (msg && msg.type === 'tbDo') { if (spectating) tbApply(msg.n); return; }
    if (msg && msg.type === 'tbReq') {
      if (!game || game.multi || spectating || !tbAllowedFor(msg)) { send({ type: 'tbNo' }); return; }
      tb = { inc: true, n: msg.n, ply: msg.ply, until: Date.now() + TB_TTL }; addChat('', 'Your opponent asks to take back a move.', 'event'); try { sfx('ping'); } catch (e) { /* ignore */ } tbRefresh(); return;
    }
    if (msg && msg.type === 'tbCancel') { if (tb && tb.inc) { tb = null; tbRefresh(); } return; }
    if (msg && msg.type === 'tbNo') { if (tb && tb.out) { tbLock = game.history().length + 2; tb = null; addChat('', 'Your opponent refused the take-back.', 'event'); tbRefresh(); } return; }
    if (msg && msg.type === 'tbYes') { if (tb && tb.out && game && game.history().length === msg.ply) tbApply(msg.n); else tb = null; return; }
    return baseHandle.apply(this, arguments); }; }
function tbAllowedFor(m) {                                    // the receiver checks that the request fits the position it sees
  if (!(inPlay() && !ended() && !M && !gclasses && !gtraits && !(gs && gs.fog) && !MODES[mode].v.hidden && $('clkTopRow').classList.contains('hidden'))) return false;
  const h = game.history().length; return m.ply === h && (m.n === 1 || m.n === 2) && h >= m.n && MODES[mode].v.movesPerTurn <= 1;
}

/* ---- keyboard: ? rules, Esc cancel, arrows step through a finished game, / or C chat ---- */
document.addEventListener('keydown', e => {
  const t = e.target, typing = t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable);
  if (typing || e.ctrlKey || e.metaKey || e.altKey || $('game').classList.contains('hidden')) return;
  if (e.key === '?') { $('helpBtn').click(); e.preventDefault(); }
  else if (e.key === '/' || e.key === 'c' || e.key === 'C') { $('chatIn').focus(); e.preventDefault(); }
  else if (e.key === 'Escape') { if (sel || abMode || swapMode || tributeMode) { sel = null; abMode = null; swapMode = false; swapFirst = null; tributeMode = false; render(); } }
  else if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key) && game && !draft && (replay || (ended() && canReplay()))) {
    if (!replay) enterReplay(); if (!replay) return;
    const n = e.key === 'Home' ? 0 : e.key === 'End' ? replay.total : replay.ply + (e.key === 'ArrowRight' ? 1 : -1);
    setReplayPly(Math.max(0, Math.min(replay.total, n))); e.preventDefault();
  }
});

/* ---- quick phrases next to the emoji reactions ---- */
['gg', 'Good luck!', 'Nice move!', 'Oops…', 'Thinking…'].forEach(p => { const b = document.createElement('button'); b.type = 'button'; b.className = 'qt'; b.textContent = p; b.onclick = () => { $('chatIn').value = p; sendChat(); }; $('emojiRow').appendChild(b); });

/* ---- what the bot strengths mean ---- */
{ const D = { easy: 'Easy: takes a piece when it can (about 6 times in 10), otherwise moves at random.', normal: 'Normal: looks one move ahead. Avoids leaving pieces hanging, spots checks and mates, with a little randomness.', hard: 'Hard: searches several moves ahead (time limited, shallower on big boards). Plays the strongest.' };
  const row = document.querySelector('#botAdd .bprow'), note = document.createElement('div'); note.className = 'dim'; note.id = 'botLvlDesc'; note.style.margin = '0 0 6px'; row.after(note);
  const show = l => { note.textContent = D[l] || ''; };
  document.querySelectorAll('#botLvl button').forEach(b => { b.addEventListener('click', () => show(b.dataset.l)); b.title = D[b.dataset.l]; }); show('normal');
  [['botEasy', 'easy'], ['botNormal', 'normal'], ['botHard', 'hard']].forEach(([id, l]) => { $(id).title = D[l]; }); }

/* ---- a one-time pointer to the rules the first time a mode is played ---- */
{ const baseRender = render; let tipped = null; render = function () {
    baseRender.apply(this, arguments);
    if (game && mode !== 'standard' && tipped !== game && !replay) { tipped = game; try { const k = 'chessTip_' + mode; if (!localStorage.getItem(k)) { localStorage.setItem(k, '1'); addChat('', 'New mode? The “? Rules” button (top right, or press ?) explains how it works and what each piece does.', 'event'); } } catch (e) { /* ignore */ } }
  }; }
