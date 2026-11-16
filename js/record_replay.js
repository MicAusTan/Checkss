// ================= game record: reconnect, spectators, replay =================
const onOpen = (c, fn) => { if (c.open) fn(); else c.on('open', fn); };
function getToken(code) {
  try {
    const k = 'chessTok_' + code; let t = localStorage.getItem(k);
    if (!t) { t = Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem(k, t); }
    return t;
  } catch (e) { return Math.random().toString(36).slice(2); }
}
const liveGame = () => (replay ? replay.live : game);
function buildRecord() {
  const g = liveGame();
  return { mode, gs: Object.assign({}, gs), seats: g.multi ? g.seats : null, a4: A4 ? a4Meta() : undefined, traits: gtraits, classes: gclasses, abils: g.abLog ? g.abLog() : [], moves: g.history(),
    resigns: resignLog.slice(), over: replay ? replay.saved.over : over, overRes: replay ? replay.saved.overRes : overRes };
}
function loadRecord(rec) {
  if (rec.a4) a4Load(rec.a4);
  newGame(rec.mode, null, { seats: rec.seats, gs: rec.gs, traits: rec.traits, classes: rec.classes, a4round: !!(rec.a4 && rec.a4.armies) });
  applyRecord(game, rec);
  resignLog = (rec.resigns || []).slice(); over = rec.over || null; overRes = rec.overRes || null;
}
const logResign = seat => resignLog.push({ seat, at: game.history().length });

// ---- replay ----
function enterReplay() {
  if (replay || !game || M || draft) return;
  if (nBusy || game.neutralPending) { addChat('', 'Wait for the neutral pieces to finish moving, then press Replay again.', true); return; }
  const rec = buildRecord();
  replay = { rec, live: game, total: rec.moves.length, ply: rec.moves.length, queue: [], saved: { over, overRes }, timer: null };
  sel = null; $('promo').classList.add('hidden');
  setReplayPly(replay.total);
}
function setReplayPly(k) {
  if (!replay) return;
  replay.ply = Math.max(0, Math.min(replay.total, k));
  game = buildGameFromRecord(replay.rec, replay.ply); over = null; overRes = null; sel = null;
  render();
}
function exitReplay() {
  if (!replay) return;
  clearInterval(replay.timer);
  const q = replay.queue;
  game = replay.live; over = replay.saved.over; overRes = replay.saved.overRes; replay = null; sel = null;
  render();
  q.forEach(it => (it.host ? hostRecv(it.c, it.msg) : handleMessage(it.msg)));      // moves that arrived while replaying
}
$('replayBtn').onclick = enterReplay;
$('rpExit').onclick = exitReplay;
$('rpStart').onclick = () => replay && setReplayPly(0);
$('rpEnd').onclick = () => replay && setReplayPly(replay.total);
$('rpBack').onclick = () => replay && setReplayPly(replay.ply - 1);
$('rpFwd').onclick = () => replay && setReplayPly(replay.ply + 1);
$('rpSlider').oninput = e => replay && setReplayPly(+e.target.value);
$('rpPlay').onclick = () => {
  if (!replay) return;
  if (replay.timer) { clearInterval(replay.timer); replay.timer = null; return; }
  if (replay.ply >= replay.total) setReplayPly(0);
  replay.timer = setInterval(() => {
    if (!replay || replay.ply >= replay.total) { if (replay) { clearInterval(replay.timer); replay.timer = null; } return; }
    setReplayPly(replay.ply + 1);
  }, 900);
};


