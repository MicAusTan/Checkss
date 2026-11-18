// ================= bots (host only) =================
const isBotId = pid => (game.multi ? !!bots[pid] : !!(bots2p && pid !== myColor));
const secretSeat = sd => !!(game && game.cls && game.cls[sd] && Engine.CLASSES[game.cls[sd]] && Engine.CLASSES[game.cls[sd]].secret);      // bots never play a secret class (Glitch)
function botSeatToMove() {
  if (!isHost || !game || spectating || replay || draft || M || ended() || inRoom) return null;
  if (game.bug) return game.seats.find(s => bots[s] && game.alive(s) && game.canMove(s) && !game.stuck(game.info[s][0])) || null;      // Bughouse: the two boards run side by side, so any bot whose board is waiting for its colour can go
  if (game.multi) { if (game.neutralPending) return null; const sd = game.turn; return bots[sd] && game.alive(sd) && !secretSeat(sd) ? sd : null; }
  return bots2p && game.turn !== myColor && !secretSeat(game.turn) ? game.turn : null;
}
function scheduleBot() {
  const sd = botSeatToMove();
  if (botTimer || botBusy || !sd) return;
  let extra = 0; const wait = +$('botWaitSel').value || 0;
  if (game.multi && !game.bug && wait > 0 && !advice[sd] && game.teams && game.seats.some(c => c !== sd && sameTeam(c, sd) && !bots[c] && game.alive(c))) { extra = wait * 1000; advWait = sd; renderStrip(); }      // give a human teammate a few seconds to advise
  const base = +$('botSpeedSel').value; botTimer = setTimeout(() => { botTimer = null; botStep(); }, (base ? base + Math.random() * base * 0.7 : 0) + extra);      // a short pause so you can follow (the host picks how short)
}
function botStep() {
  const sd = botSeatToMove();
  if (!sd) return;
  let m = null;
  advWait = null;
  if (game.multi && !game.bug && advice[sd]) {                           // a teammate pointed at one of this bot's pieces: play it if it is legal now
    const adv = advice[sd]; delete advice[sd];
    const c = game.moves(adv.sx, adv.sy).filter(q => q.tx === adv.tx && q.ty === adv.ty);
    m = c.find(q => (q.promo || null) === (adv.promo || null)) || (adv.promo ? null : (c.find(q => !q.promo) || c.find(q => q.promo === 'q') || c[0])) || null;
    addChat('', m ? seatName(sd) + ' followed ' + seatName(adv.from) + '\'s advice.' : seatName(sd) + ' couldn\'t play ' + seatName(adv.from) + '\'s advice (it is not legal now) and chose its own move.', 'minor');
  }
  if (!m) {
    const lvl = game.multi ? bots[sd] : bots2p;
    if (lvl === 'hard' && botAsk(sd, lvl)) return;                  // the Hard bot thinks in a worker (the page stays alive)
    m = botChooseHere(sd, lvl);
  }
  botPlay(m);
}
const botChooseHere = (sd, lvl) => { try { return game.promotion ? Promotion.botChoose(game, lvl) : game.imperial ? Imperial.botChoose(game, lvl) : Engine.botChoose(game, sd, lvl); } catch (e) { return null; } };
function botPlay(m) {
  if (!m) return;
  if (game.multi) { if (game.move(m)) { broadcast(mmoveMsg(m)); announceMulti(); render(); } }
  else if (game.move(m)) { send({ type: 'move', m }); announce(); render(); }
}
/* ---- the Hard bot in a Web Worker (js/bot_worker.js). If workers are not available (e.g. the page is opened from a file) it quietly thinks on the page as before. ---- */
let botBusy = null, botWorker = null, botWorkerDead = false, botReqId = 0;
function botThinkLabel(on) {
  let el = document.getElementById('botThink');
  if (!el) { const st = document.getElementById('status'); if (!st) return; el = document.createElement('div'); el.id = 'botThink'; el.className = 'dim'; el.style.cssText = 'font-size:.85rem;margin:2px 0'; el.textContent = '🤖 The bot is thinking…'; st.insertAdjacentElement('afterend', el); }
  el.style.display = on ? '' : 'none';
}
function botWorkerGet() {
  if (botWorkerDead) return null; if (botWorker) return botWorker;
  try { botWorker = new Worker('js/bot_worker.js'); botWorker.onmessage = botWorkerMsg; botWorker.onerror = ev => { diagNote('bot worker error: ' + (ev.message || '')); botWorkerFail(); }; }
  catch (e) { botWorkerDead = true; botWorker = null; diagNote('bot worker unavailable: ' + e.message); }
  return botWorker;
}
function botWorkerFail() {                                          // give up on the worker: finish this move on the page and keep thinking there from now on
  botWorkerDead = true; try { if (botWorker) botWorker.terminate(); } catch (e) { /* gone */ } botWorker = null;
  const b = botBusy; botBusy = null; botThinkLabel(false); if (b && b.game === game) { const sd = botSeatToMove(); if (sd === b.sd) { const m = botChooseHere(sd, b.lvl); botPlay(m); } }
}
function botAsk(sd, lvl) {
  const w = botWorkerGet(); if (!w) return false;
  let rec; try { rec = buildRecord(); } catch (e) { return false; }
  const id = ++botReqId, ms = globalThis.BOT_MS || 1200; botBusy = { id, sd, lvl, game, n: game.history().length, to: setTimeout(() => { if (botBusy && botBusy.id === id) { diagNote('bot worker timed out'); botWorkerFail(); } }, ms * 4 + 8000) };
  try { w.postMessage({ id, rec, sd, level: lvl, ms }); } catch (e) { clearTimeout(botBusy.to); botBusy = null; botWorkerDead = true; return false; }
  botThinkLabel(true); return true;
}
function botWorkerMsg(ev) {
  const d = ev.data || {}, b = botBusy; if (!b || b.id !== d.id) return;
  clearTimeout(b.to); botBusy = null; botThinkLabel(false);
  if (b.game !== game || game.history().length !== b.n || botSeatToMove() !== b.sd) { scheduleBot(); return; }      // the game moved on meanwhile: forget this answer
  let m = d.err ? null : d.m;
  if (d.err) diagNote('bot worker: ' + d.err);
  if (m && !(game.multi ? game.move(m) && (broadcast(mmoveMsg(m)), announceMulti(), render(), true) : game.move(m) && (send({ type: 'move', m }), announce(), render(), true))) m = null;      // (an illegal answer falls back to the page's own search)
  else if (m) return;
  botPlay(botChooseHere(b.sd, b.lvl));
}
function drawColPick() {
  const box = $('colPick'); box.innerHTML = ''; const cur = $('colSel').value;
  [['w', '#f2f2f2', 'White'], ['b', '#1d1d1d', 'Black'], ['r', null, 'Random']].forEach(([v, col, name]) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'swt big' + (v === 'r' ? ' dice' : '') + (cur === v ? ' mine' : ''); if (col) b.style.background = col; else b.textContent = '🎲'; b.title = name;
    b.onclick = () => { $('colSel').value = v; drawColPick(); }; box.appendChild(b);
  });
}
drawColPick();
function applyColorPref() { const v = $('colSel').value; myColor = v === 'b' ? 'b' : v === 'r' ? (Math.random() < 0.5 ? 'w' : 'b') : 'w'; }
function startVsBot(level) {
  if (!isHost || !game || MODES[mode].multi || M) return;
  bots2p = level; applyColorPref();
  $('lobby').classList.add('hidden'); $('game').classList.remove('hidden');
  $('hostCtl').classList.remove('hidden'); $('modeSel2').value = mode;
  addChat('', 'You are playing against a bot (' + level + ').', 'minor');
  if (needDraft()) beginDraft();
  render();
}
$('leaveRoomBtn').onclick = () => { location.href = location.origin + location.pathname; };
$('botEasy').onclick = () => startVsBot('easy');
$('botNormal').onclick = () => startVsBot('normal');
$('botHard').onclick = () => startVsBot('hard');
const addLobbyBot = level => {
  if (!isHost || mstarted || !MODES[mode].multi) return;
  if (1 + conns.length + lobbyBots.length >= maxSeats()) return;
  { const cnt = teamCounts(); lobbyBots.push({ level, team: lightestTeam(cnt) }); } renderRoster();
};
let lobbyBotLvl = 'normal';
document.querySelectorAll('#botLvl button').forEach(b => { b.onclick = () => { if (b.disabled) return; lobbyBotLvl = b.dataset.l; document.querySelectorAll('#botLvl button').forEach(x => x.classList.toggle('on', x === b)); }; });
$('addBotBtn').onclick = () => addLobbyBot(lobbyBotLvl);
$('fillBotsBtn').onclick = () => { while (isHost && !mstarted && 1 + conns.length + lobbyBots.length < maxSeats() && !$('addBotBtn').disabled) { const n = lobbyBots.length; addLobbyBot(lobbyBotLvl); if (lobbyBots.length === n) break; } };
/* bot timing: the pause before a bot moves (Easy / Normal / Hard) and how long the Hard bot may think; every copy of the two selects stays in step and the choice is remembered */
const BOT_SPEEDS = [[0, 'instant'], [250, 'fast'], [700, 'normal'], [1600, 'slow']], BOT_THINK = [[300, '0.3 s'], [600, '0.6 s'], [1200, '1.2 s'], [2500, '2.5 s'], [5000, '5 s']];
function botTimeSetup() {
  const sp = skLs('cwfBotSpeed', '700'), th = skLs('cwfBotThink', '1200');
  document.querySelectorAll('.bptime').forEach(box => { if (box.firstChild) return; box.innerHTML = '<label>Pause before each move <select data-bot="speed"></select></label><label>Hard bot thinking time <select data-bot="think"></select></label>'; });
  document.querySelectorAll('select[data-bot]').forEach(sel => {
    const list = sel.dataset.bot === 'speed' ? BOT_SPEEDS : BOT_THINK; if (!sel.options.length) list.forEach(([v, n]) => { const o = document.createElement('option'); o.value = v; o.textContent = n; sel.appendChild(o); });
    sel.value = sel.dataset.bot === 'speed' ? sp : th;
    sel.onchange = () => { const v = sel.value; skLsSet(sel.dataset.bot === 'speed' ? 'cwfBotSpeed' : 'cwfBotThink', v); document.querySelectorAll('select[data-bot="' + sel.dataset.bot + '"]').forEach(o => { o.value = v; }); if (sel.dataset.bot === 'think') globalThis.BOT_MS = +v; };
  });
  globalThis.BOT_MS = +th || 1200;
}
botTimeSetup();
$('botTakeBtn').onclick = () => {
  const sd = $('removeSel').value;
  if (!isHost || !game || !game.multi || !sd || !game.alive(sd) || sd === mySeat) return;
  if (secretSeat(sd)) { addChat('', 'A bot can\'t take over that seat.', true); return; }      // (generic wording: it must not reveal a secret class)
  bots[sd] = 'normal'; addChat('', CN[sd] + ' is now played by a bot (Normal).', true); render();
};

