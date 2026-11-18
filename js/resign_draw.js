/* resign_draw.js: Resign (arm, then confirm) and draw offers (banner with countdown, withdraw, decline, cooldown, bot answers), plus the "minor notes" chat switch. */
const DRAW_TTL = 30000, DRAW_LOCK = 3;                       // an offer lasts 30 s; after a decline you must wait 3 plies before offering again
let drawSt = { g: null, out: false, inc: false, until: 0, ply: 0, lock: 0 }, resignArm = null;
const plyNow = () => (game ? game.history().length : 0);
const resignText = c => (c === 'w' ? 'White' : 'Black') + ' resigned. ' + (c === 'w' ? 'Black' : 'White') + ' wins.';

/* ---- resign: first click arms the button, second click (within 3.5 s) resigns ---- */
const rbtn = $('resignBtn');
function resignDisarm() { clearTimeout(resignArm); resignArm = null; rbtn.textContent = 'Resign'; rbtn.classList.remove('armed'); }
function doResign() {
  if (game && game.multi) {
    if (ended() || !game.alive(mySeat)) return;
    if (isHost) { logResign(mySeat); game.resign(mySeat); broadcast({ type: 'mresign', seat: mySeat }); announceMulti(); render(); }
    else send({ type: 'tryResign' });
    return;
  }
  if (!inPlay() || ended()) return;
  over = resignText(myColor); addChat('', over, 'event');
  overRes = myColor === 'w' ? 'b' : 'w';
  send({ type: 'resign', color: myColor }); render();
}
rbtn.onclick = () => {
  const can = game && game.multi ? (!ended() && game.alive(mySeat)) : (inPlay() && !ended());
  if (!can) return;
  if (!resignArm) { rbtn.textContent = 'Click again to resign'; rbtn.classList.add('armed'); resignArm = setTimeout(resignDisarm, 3500); return; }
  resignDisarm(); doResign();
};
rbtn.onblur = resignDisarm;

/* ---- draws ---- */
function drawClear() { drawSt.out = drawSt.inc = false; }
function drawBotDecides() {                                   // the computer accepts when it is clearly worse off, or when a long game is level
  try {
    const val = { p: 1, n: 3, b: 3, r: 5, q: 9 }, bot = myColor === 'w' ? 'b' : 'w'; let diff = 0;
    for (let x = 0; x < game.w; x++) for (let y = 0; y < game.h; y++) { const p = game.at(x, y), v = p && val[String(p.t).toLowerCase()]; if (v) diff += p.c === bot ? v : -v; }
    return diff <= -3 || (plyNow() >= 80 && Math.abs(diff) <= 1);
  } catch (e) { return false; }
}
function drawGot(type) {
  if (spectating || !game || game.multi) return;
  if (type === 'drawOffer') {
    if (!inPlay() || ended()) return;
    drawSt = { g: game, out: false, inc: true, until: Date.now() + DRAW_TTL, ply: plyNow(), lock: drawSt.lock };
    addChat('', 'Your opponent offers a draw.', 'event'); try { sfx('ping'); } catch (e) { /* ignore */ }
  } else if (type === 'drawWithdraw') { if (drawSt.inc) { drawSt.inc = false; addChat('', 'Your opponent withdrew the draw offer.', 'event'); } }
  else if (type === 'drawDecline') { if (drawSt.out) { drawSt.out = false; drawSt.lock = plyNow() + DRAW_LOCK; addChat('', 'Your draw offer was declined.', 'event'); } }
  else if (type === 'drawAccept') { if (drawSt.out) { drawClear(); over = 'Draw by agreement.'; overRes = 'd'; addChat('', 'Draw by agreement.', 'event'); } }
  drawRefresh();
}
$('drawBtn').onclick = () => {
  if (game && game.multi) return mdClick();
  if (!inPlay() || ended() || spectating) return;
  if (drawSt.g !== game) drawSt = { g: game, out: false, inc: false, until: 0, ply: 0, lock: 0 };
  if (drawSt.out) { drawSt.out = false; send({ type: 'drawWithdraw' }); addChat('', 'You withdrew your draw offer.', 'event'); drawRefresh(); return; }
  if (drawSt.inc) return;
  if (plyNow() < drawSt.lock) return;
  drawSt = { g: game, out: true, inc: false, until: Date.now() + DRAW_TTL, ply: plyNow(), lock: drawSt.lock };
  send({ type: 'drawOffer' }); addChat('', 'You offered a draw.', 'event');
  if (bots2p) setTimeout(() => {
    if (!drawSt.out || drawSt.g !== game || ended()) return;
    if (drawBotDecides()) { drawClear(); over = 'Draw by agreement.'; overRes = 'd'; addChat('', 'The computer accepted the draw.', 'event'); }
    else { drawSt.out = false; drawSt.lock = plyNow() + DRAW_LOCK; addChat('', 'The computer declined the draw.', 'event'); }
    render();
  }, 1200 + Math.random() * 800);
  drawRefresh();
};
$('acceptDraw').onclick = () => { if (game && game.multi) return mdAnswer(true); if (!drawSt.inc) return; drawClear(); over = 'Draw by agreement.'; overRes = 'd'; addChat('', 'Draw by agreement.', 'event'); send({ type: 'drawAccept' }); render(); };
$('declineDraw').onclick = () => { if (game && game.multi) return mdAnswer(false); if (!drawSt.inc) return; drawClear(); send({ type: 'drawDecline' }); drawRefresh(); };

function drawRefresh() {
  if (game && game.multi) return mdRefresh();
  const btn = $('drawBtn');
  if (drawSt.g !== game) drawSt = { g: game, out: false, inc: false, until: 0, ply: 0, lock: 0 };
  if ((drawSt.out || drawSt.inc) && (ended() || plyNow() !== drawSt.ply)) drawClear();      // any move (or the end of the game) closes an open offer
  const live = !spectating && game && !game.multi && inPlay() && !ended();
  $('drawBanner').classList.toggle('hidden', !(live && drawSt.inc));
  const wait = Math.max(0, drawSt.lock - plyNow());
  btn.textContent = drawSt.out ? 'Withdraw draw offer' : wait > 0 ? 'Offer draw (in ' + wait + ' move' + (wait > 1 ? 's' : '') + ')' : 'Offer draw';
  btn.disabled = !!(drawSt.inc || (!drawSt.out && wait > 0)); btn.classList.toggle('pending', drawSt.out);
  btn.title = drawSt.out ? 'Click to take the offer back. It also ends when anybody moves, or after 30 seconds.' : wait > 0 ? 'Your last offer was declined: wait a few moves before offering again.' : 'Offer your opponent a draw';
  $('drawBar').style.width = drawSt.inc || drawSt.out ? Math.max(0, (drawSt.until - Date.now()) / DRAW_TTL * 100) + '%' : '0';
}
setInterval(() => {
  if (game && game.multi) return mdTick();
  if (!game || !(drawSt.out || drawSt.inc)) return;
  if (Date.now() > drawSt.until) {
    if (drawSt.out) { drawSt.lock = plyNow() + DRAW_LOCK; addChat('', 'Your draw offer ran out without an answer.', 'event'); }
    drawClear();
  }
  drawRefresh();
}, 500);
{ const baseRender = render; render = function () { baseRender.apply(this, arguments); drawRefresh(); }; }

/* ---- minor game notes in chat (off by default) ---- */
{ let on = false; try { on = localStorage.getItem('chessMinor') === '1'; } catch (e) { /* ignore */ }
  $('minorChk').checked = on; $('chatLog').classList.toggle('hideMinor', !on);
  $('minorChk').onchange = e => { try { localStorage.setItem('chessMinor', e.target.checked ? '1' : '0'); } catch (x) { /* ignore */ } $('chatLog').classList.toggle('hideMinor', !e.target.checked); $('chatLog').scrollTop = $('chatLog').scrollHeight; }; }

/* ---- draws in games with 3+ seats: everyone still alive must accept (the host counts the votes; bots answer for themselves) ---- */
let md = null, mdLock = 0, mdSeen = null;                                     // md: { g, from, yes: [seats], need: [seats], until, ply }
const mdAlive = () => game.seats.filter(s => game.alive(s));
const mdNames = list => list.map(s => CN[s]).join(', ');
function mdBotWants(seat) {                                    // a bot accepts unless it is the one in front on material (or the game is very long)
  try {
    const val = { p: 1, n: 3, b: 3, r: 5, q: 9 }, mat = {};
    mdAlive().forEach(s => { mat[s] = 0; });
    for (let x = 0; x < game.w; x++) for (let y = 0; y < game.h; y++) { const p = game.at(x, y), v = p && val[String(p.t).toLowerCase()]; if (v && mat[p.c] !== undefined) mat[p.c] += v; }
    return plyNow() >= 150 || mat[seat] < Math.max(...Object.values(mat));
  } catch (e) { return false; }
}
function mdPush() { broadcast({ type: 'mdraw', from: md.from, yes: md.yes.slice(), need: mdAlive(), left: Math.max(0, md.until - Date.now()) }); mdApply({ from: md.from, yes: md.yes, need: mdAlive(), left: Math.max(0, md.until - Date.now()) }); }
function mdEnd(how, by) { const m = { type: 'mdrawEnd', how, by, from: md && md.from }; broadcast(m); mdEndApply(m); }
function mdCheck() {                                           // host: everybody alive said yes?
  if (!md) return;
  const need = mdAlive(); if (need.length && need.every(s => md.yes.includes(s))) mdEnd('agreed');
}
function mdStart(from) {
  if (!isHost || !game || !game.multi || game.bug || ended() || md || !game.alive(from)) return;
  md = { g: game, from, yes: [from], need: mdAlive(), until: Date.now() + DRAW_TTL, ply: plyNow() };
  mdAlive().filter(s => s !== from && bots[s]).forEach(s => setTimeout(() => { if (md && md.g === game) mdVote(s, mdBotWants(s)); }, 1000 + Math.random() * 1500));
  mdPush(); mdCheck();
}
function mdVote(seat, yes) {
  if (!isHost || !md || !game.alive(seat) || md.yes.includes(seat)) return;
  if (!yes) return mdEnd('declined', seat);
  md.yes.push(seat); mdPush(); mdCheck();
}
function mdWithdraw(seat) { if (isHost && md && md.from === seat) mdEnd('withdrawn'); }
function mdApply(m) {                                          // everybody: show the vote
  if (spectating || !game || !game.multi) return;
  const first = !mdSeen || mdSeen.g !== game || mdSeen.from !== m.from; mdSeen = { g: game, from: m.from };
  md = { g: game, from: m.from, yes: m.yes.slice(), need: m.need.slice(), until: Date.now() + m.left, ply: plyNow() };
  if (first) { addChat('', CN[m.from] + ' offers a draw. Everybody still in the game has to accept.', 'event'); try { sfx('ping'); } catch (e) { /* ignore */ } }
  mdRefresh();
}
function mdEndApply(m) {
  const wasMine = m.from === mySeat; md = null; mdSeen = null;
  if (m.how === 'agreed') { over = 'Draw by agreement. Everyone accepted.'; overRes = 'd'; addChat('', 'Draw by agreement: everybody accepted.', 'event'); }
  else if (m.how === 'declined') { addChat('', CN[m.by] + ' declined the draw.', 'event'); if (wasMine) mdLock = plyNow() + DRAW_LOCK; }
  else if (m.how === 'withdrawn') addChat('', CN[m.from] + ' withdrew the draw offer.', 'event');
  else if (m.how === 'expired') { addChat('', 'The draw offer ran out without everybody answering.', 'event'); if (wasMine) mdLock = plyNow() + DRAW_LOCK; }
  render();
}
function mdClick() {
  if (spectating || ended() || !game.alive(mySeat) || game.bug) return;
  if (md) { if (md.from === mySeat) { if (isHost) mdWithdraw(mySeat); else send({ type: 'mDrawWithdraw' }); } return; }
  if (plyNow() < mdLock) return;
  if (isHost) mdStart(mySeat); else send({ type: 'mDrawOffer' });
}
function mdAnswer(yes) { if (!md || spectating || !game.alive(mySeat) || md.yes.includes(mySeat)) return; if (isHost) mdVote(mySeat, yes); else send({ type: 'mDrawVote', yes }); }
function mdRefresh() {
  const btn = $('drawBtn'), live = !spectating && !game.bug && !ended() && game.alive(mySeat);
  if (md && md.g !== game) md = null;
  const mine = md && md.from === mySeat, voted = md && md.yes.includes(mySeat), wait = Math.max(0, mdLock - plyNow());
  $('drawBanner').classList.toggle('hidden', !(live && md));
  if (live && md) {
    const waiting = md.need.filter(s => !md.yes.includes(s));
    $('drawTxt').textContent = (mine ? 'You offered a draw.' : CN[md.from] + ' offers a draw.') + ' Accepted: ' + mdNames(md.yes) + (waiting.length ? ' · waiting for: ' + mdNames(waiting) : '');
    document.querySelector('#drawBanner .dbtns').style.display = voted ? 'none' : '';
    $('drawBar').style.width = Math.max(0, (md.until - Date.now()) / DRAW_TTL * 100) + '%';
  }
  btn.textContent = mine ? 'Withdraw draw offer' : wait > 0 ? 'Offer draw (in ' + wait + ' move' + (wait > 1 ? 's' : '') + ')' : 'Offer draw';
  btn.disabled = !!((md && !mine) || (!md && wait > 0)); btn.classList.toggle('pending', !!mine);
  btn.title = mine ? 'Take the offer back. It also ends when anybody moves, or after 30 seconds.' : 'Offer a draw. Every player still in the game has to accept.';
}
function mdTick() {
  if (isHost && md) {
    if (md.g !== game || plyNow() !== md.ply) { if (md.g === game) mdEnd('moved'); else md = null; }
    else if (Date.now() > md.until) mdEnd('expired');
    else mdCheck();
  } else if (md && (md.g !== game || plyNow() !== md.ply)) md = null;
  if (md || $('drawBtn').textContent !== 'Offer draw') mdRefresh();
}
{ const baseHost = hostRecv; hostRecv = function (c, msg) {
    if (msg && typeof msg.type === 'string' && msg.type.startsWith('mDraw') && game && game.multi) {
      if (msg.type === 'mDrawOffer') mdStart(c.seat); else if (msg.type === 'mDrawVote') mdVote(c.seat, !!msg.yes); else if (msg.type === 'mDrawWithdraw') mdWithdraw(c.seat);
      return;
    }
    return baseHost.apply(this, arguments); };
  const baseHandle = handleMessage; handleMessage = function (msg) {
    if (msg && msg.type === 'mdraw' && !replay) { if (game && game.multi) mdApply(msg); return; }
    if (msg && msg.type === 'mdrawEnd' && !replay) { if (game && game.multi && (md || spectating || msg.how === 'agreed')) mdEndApply(msg); return; }
    return baseHandle.apply(this, arguments); }; }
