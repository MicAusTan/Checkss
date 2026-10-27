import { stepLobby, doPush, pushFx, applySnap, clearRag } from './shove.js';
import { Net } from './net.js';
import { World } from './world.js';
import { Board } from './board.js';
import { BOARDS } from './boards.js';
import { sfx, toggleMute, isMuted } from './sfx.js';
import { MINIGAMES } from './minigames/registry.js';
import { EMOTES, playEmote } from './emotes.js';
import { gems as gemBal, onGems, addGems, claimDaily, gemsFor, sanitizeLook, owns } from './wallet.js';
import { initWheel } from './wheel.js';
import { initShop } from './shopui.js';
import { showPodium } from './victory.js';
import { COLORS, ACCENTS, OPTS, DEFAULT_LOOK, cleanLook, randomLook } from './look.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const net = new Net(), world = new World($('c'));
const board = new Board({ net, world, esc, players: () => players, playMg: startRandomMg, onChange: () => lock(), fx: (t, a) => fx(t, a), onError: m => toast('⚠ ' + m + ' (please screenshot this!)', 8000) });
let players = {}, me = null, mg = null, look = { ...DEFAULT_LOOK };
const sim = {}, keys = {}; let cfg = { mode: 'board', rounds: 8, off: [], board: 'grove', partyN: 10, repeats: false, team: true, botSkill: 'mixed', fill: 0, turnT: 30 };   // sim: host-only free-roam positions

try { cfg = { ...cfg, ...JSON.parse(localStorage.getItem('pg-cfg') || '{}') }; } catch {}
try { look = { ...look, ...JSON.parse(localStorage.getItem('pg-look') || '{}') }; $('name').value = localStorage.getItem('pg-name') || ''; } catch {}
look = sanitizeLook(look);
addEventListener('keydown', e => { if (document.getElementById('shop')?.hidden === false) return; keys[e.code] = true; });
addEventListener('keyup', e => keys[e.code] = false);
const myName = () => {
  const n = $('name').value.trim() || 'Player' + (Math.random() * 90 + 10 | 0);
  try { localStorage.setItem('pg-name', n); } catch {}
  return n;
};
// ---- emotes: a small button (bottom-right) opens a row of emotes; everything is cosmetic and relayed by the host
const wheel = initWheel({ ok: () => emoOK(), send: i => sendEmote(i) });
const emoOK = () => { if (!me || document.getElementById('shop')?.hidden === false) return false; const d = mg && MINIGAMES[mg.key]; return !(d && d.emotes === false); };   // minigames opt out with `emotes: false`
const emoSync = () => wheel.sync();
let emoAt = 0; const lastEmo = {};
function relayEmote(id, i) {            // host: validate + rate-limit, play, tell everyone
  i |= 0; if (!EMOTES[i] || !players[id]) return;
  const t = performance.now(); if (t - (lastEmo[id] || 0) < 400) return; lastEmo[id] = t;
  playEmote(world, id, i, id === me); net.broadcast('emote', { id, e: i });
}
function sendEmote(i) {
  const t = performance.now(); if (t - emoAt < 600) return; emoAt = t;     // tiny cooldown, just a safety rail
  if (net.isHost) relayEmote(me, i); else { playEmote(world, me, i, true); net.send('emote', { e: i }); }
}
net.on('emote', (d, from) => { if (net.isHost) relayEmote(from, d.e); else if (d.id !== me && EMOTES[d.e | 0]) playEmote(world, d.id, d.e | 0, false); });

// ---- victory podium (cosmetic; blocks free-roam movement while it's up)
let podium = null;
const endPodium = () => { podium?.end(); podium = null; };
function podiumFor(order, ranks, o) { endPodium(); const me_ = podium = showPodium(world, players, order, ranks, { ...o, onEnd: () => { if (podium === me_) podium = null; } }); }
function finalPodium(order, ranks) { if (order.length) { podiumFor(order, ranks, { secs: 7 }); finalGems(order, ranks); } }
function finalGems(order, ranks) {
  const i = order.indexOf(me); if (i < 0 || practice) return;
  const r = ranks?.[i] ?? i; let g = r === 0 ? 20 : r === 1 ? 10 : r === 2 ? 5 : 0;
  if (cfg.mode === 'board') g += (board.s?.stars?.[me] || 0) * 4;
  if (g) { addGems(g); toast('+' + g + ' gems for the final standings', 2500); }
}
function awardGems(pl, rk, adj) {
  const i = pl.indexOf(me); if (i < 0 || practice) return 0;
  let g = gemsFor(rk[i], pl.length);
  if (board.active) { g += Math.max(0, Math.round(board.rewardFor(me, rk[i], adj, pl.length) / 5)); if (board.s?.mega && rk[i] === 0) g += 5; }
  g += claimDaily(); addGems(g); return g;
}
const rankBy = (ids, key) => { const o = [...ids].sort((a, b) => key(b) - key(a)); return [o, o.map(id => o.findIndex(x => key(x) === key(id)))]; };

const toast = (msg, ms = 1200) => { $('banner').innerHTML = `<div>${esc(msg)}</div>`; setTimeout(() => { if (!mg) $('banner').innerHTML = ''; }, ms); };
$('code').onkeydown = e => { if (e.key === 'Enter') $('join').click(); };
$('room').onclick = () => navigator.clipboard?.writeText($('room').textContent).then(() => toast('Room code copied!'));
const mulberry = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
let lookOpen = false, folded = false, party = null, partyState = null; const queued = [];   // party: host-only engine; partyState: what everyone renders
function lock() {
  const inMg = !!mg, inGame = board.active || !!partyState, lobby = !inMg && !inGame, host = net.isHost;
  const n = Object.keys(players).length, need = practice ? 1 : 2;
  $('panel').classList.toggle('compact', !lobby); $('panel').classList.toggle('folded', folded);
  $('fold').textContent = folded ? '+' : '–';
  $('players').hidden = !lobby; $('shopBtn2').hidden = !lobby;
  $('waitMsg').hidden = host || !lobby; $('hostCtl').hidden = !host; $('pushHint').hidden = !lobby;
  $('start').hidden = $('settingsBtn').hidden = !lobby;
  $('start').textContent = cfg.mode === 'party' ? '▶ Start minigame party' : '▶ Start board game'; $('start').disabled = n < need; $('startHint').hidden = !lobby || n >= need;
  $('startHint').textContent = `Waiting for players (${n}/${need} needed). Share the room code!`;
  $('leaveBtn').hidden = !(net.isHost || net.hostConn) || practice; $('botRow').hidden = !(host && lobby && !practice);
  $('stopMg').hidden = !inMg; $('endGame').hidden = !(inGame && (!inMg || !!partyState)); renderParty();
  $('practice').hidden = !practice; $('testRow').hidden = !lobby; emoSync();
}

function readInput() {
  if (mg || board.active) return { x: 0, z: 0 };
  const x = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
  const z = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0);
  const l = Math.hypot(x, z) || 1; return { x: x / l, z: z / l };
}

// ---- players & customization
const taken = (c, id) => Object.values(players).some(p => p.id !== id && p.color === c);
const pickColor = (want, id) => COLORS.includes(want) ? want : COLORS.find(c => !taken(c, id)) ?? COLORS[0];   // duplicates are allowed now
const mkLook = (want, id) => ({ color: pickColor(want?.color, id), ...cleanLook(want) });
let prevN = 0;
function setPlayers(p) {
  const n = Object.keys(p).length; if (prevN && n > prevN) sfx('join'); prevN = n;
  players = p; world.sync(players);
  $('players').innerHTML = Object.values(players).map(q => `<div style="color:${q.color}">${q.id === 'host' ? '👑' : '●'} ${esc(q.name)}${q.title && q.title !== 'none' ? `<small> ${OPTS.title.vals[q.title]}</small>` : ''} <b>${q.score || 0}</b></div>`).join('');
  lock();
}
const pushLobby = () => { setPlayers(players); net.broadcast('lobby', players); };
function setLook(patch, temp) {
  look = { ...look, ...patch }; if (!temp) try { localStorage.setItem('pg-look', JSON.stringify(look)); } catch {}
  if (!me) return;                       // customizing from the menu, before joining
  if (net.isHost) { Object.assign(players.host, mkLook(look, 'host')); pushLobby(); }
  else net.send('cust', look);
}
const shop = initShop({ cur: () => look, apply: p => setLook(p), toast, name: () => $('name').value.trim() || 'You' });
$('shopBtn').onclick = $('shopBtn2').onclick = () => shop.open();
const gemTxt = () => document.querySelectorAll('.gemchip').forEach(e => { if (!e.closest('#shop')) e.textContent = gemBal() + ' gems'; });
onGems(gemTxt); gemTxt();
$('fold').onclick = () => { folded = !folded; lock(); };

function fillBots() {   // top the table up with bots to the host's 'fill seats' target (previous fill bots are replaced)
  for (const id of Object.keys(players)) if (players[id].fill) { delete players[id]; delete sim[id]; board.onLeave(id); }
  while (Object.keys(players).length < (+cfg.fill || 0)) addDummy(true);
  pushLobby();
}
function startGame() {
  if (!net.isHost || mg || board.active || partyState) return;
  fillBots(); if (Object.keys(players).length < (practice ? 1 : 2)) return;
  if (cfg.mode === 'party') return startParty();
  board.start(cfg.rounds, cfg.board === 'random' ? Object.keys(BOARDS)[Math.random() * Object.keys(BOARDS).length | 0] : cfg.board, cfg.turnT);
}
const saveCfg = () => { try { localStorage.setItem('pg-cfg', JSON.stringify(cfg)); } catch {} };
function syncModeUI() {
  $('boardOpts').hidden = cfg.mode !== 'board'; $('partyOpts').hidden = cfg.mode !== 'party';
  $('repeats').disabled = cfg.partyN === 'all'; $('repeatRow').style.opacity = cfg.partyN === 'all' ? .4 : 1;
}
// ---- minigame party: random minigames back to back, scores add up (host runs it, everyone renders partyState)
const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
// Minigames allowed by the host's pool + the team-games switch (falls back to everything if that leaves nothing)
function poolKeys() {
  const all = Object.keys(MINIGAMES), on = all.filter(k => !cfg.off.includes(k) && (cfg.team !== false || !MINIGAMES[k].team));
  return on.length ? on : all;
}
function buildQueue() {
  const pool = poolKeys();
  if (cfg.partyN === 'all') return shuffle(pool);
  const n = +cfg.partyN || 10; if (!cfg.repeats) return shuffle(pool).slice(0, n);
  const q = []; while (q.length < n) { const k = pool[Math.random() * pool.length | 0]; if (pool.length > 1 && k === q[q.length - 1]) continue; q.push(k); } return q;
}
function setParty(s) { if (s?.over) partyFinal(); partyState = s; net.broadcast('party', s || { off: true }); lock(); }
function startParty() {
  const queue = buildQueue(); party = { queue, i: 0 };
  for (const id in players) players[id].score = 0; pushLobby();
  setParty({ n: 0, total: queue.length, over: false }); nextParty();
}
function nextParty() {
  if (!party || mg) return;
  if (party.i >= party.queue.length) {
    const mine = party; setParty({ n: party.i, total: party.queue.length, over: true }); sfx('win');
    setTimeout(() => { if (party === mine) stopParty(); }, 12000); return;
  }
  const key = party.queue[party.i++]; setParty({ n: party.i, total: party.queue.length, over: false }); startRandomMg(key);
}
function stopParty() { party = null; setParty(null); if (mg) mg.finish?.([]); }
function renderParty() {
  const el = $('party'); el.hidden = !partyState; if (!partyState) return;
  const ps = Object.values(players).sort((a, b) => (b.score || 0) - (a.score || 0)), top = ps[0]?.score || 0;
  const wins = ps.filter(p => (p.score || 0) === top).map(p => esc(p.name)).join(' & ');
  el.innerHTML = `<b>🎉 Minigame party · ${Math.max(1, partyState.n)} / ${partyState.total}</b>` +
    ps.map(p => `<div style="color:${p.color}">${esc(p.name)} <b>${p.score || 0}</b></div>`).join('') +
    (partyState.over ? `<h3>🏆 ${wins} ${ps.filter(p => (p.score || 0) === top).length > 1 ? 'win' : 'wins'}!</h3>` : '');
}
net.on('party', d => { if (net.isHost) return; if (d.over && !partyState?.over) partyFinal(); partyState = d.off ? null : d; lock(); });
function partyFinal() { const ids = Object.keys(players), [o, r] = rankBy(ids, id => players[id].score || 0); finalPodium(o, r); }

function enter(code) {
  $('menu').hidden = true; $('panel').hidden = false; $('room').textContent = code; lookOpen = false; folded = false;
  if (net.isHost) {
    $('start').onclick = startGame;
    $('stopMg').onclick = async () => { if (await ask('End this minigame?', 'It ends right now. Score-based games rank everyone by what they have so far; other games just stop with no points.', 'End it')) { if (mg?.inst?.endNow) mg.inst.endNow(); else mg?.finish?.([]); } };
    $('endGame').onclick = async () => { if (await ask('End the game?', 'This ends the game for everyone and sends you all back to the lobby.', 'End game')) { endPodium(); if (partyState) stopParty(); else board.quit(); } };
    $('botRow').onclick = e => { const b = e.target.dataset.b; if (b === 'add') addDummy(); else if (b === 'rem') removeDummy(); };
    $('settingsBtn').onclick = () => $('settings').hidden = false;
    $('settingsClose').onclick = () => $('settings').hidden = true;
    $('boardSel').innerHTML = Object.entries(BOARDS).map(([k, b]) => `<option value="${k}">${b.name}</option>`).join('') + '<option value="random">🎲 Random board</option>';
    $('boardSel').value = cfg.board; $('modeSel').value = cfg.mode; $('partyN').value = cfg.partyN; $('repeats').checked = !!cfg.repeats; $('team').checked = cfg.team !== false; $('botSkill').value = cfg.botSkill; $('turnT').value = cfg.turnT; $('fill').value = cfg.fill; syncModeUI();
    $('rounds').innerHTML = [[4, 10], [8, 20], [12, 30], [16, 40], [20, 50], [30, 75]].map(([n, m]) => `<option value="${n}">${n} rounds (~${m} min)</option>`).join(''); $('rounds').value = cfg.rounds;
    $('pool').innerHTML = Object.entries(MINIGAMES).map(([k, g]) => `<label><input type="checkbox" data-mg="${k}"${cfg.off.includes(k) ? '' : ' checked'}> ${esc(g.name)}</label>`).join('');
    $('settings').onchange = e => {
      if (e.target.id === 'modeSel') cfg.mode = e.target.value;
      else if (e.target.id === 'partyN') cfg.partyN = e.target.value === 'all' ? 'all' : +e.target.value;
      else if (e.target.id === 'repeats') cfg.repeats = e.target.checked;
      else if (e.target.id === 'boardSel') cfg.board = e.target.value;
      else if (e.target.id === 'rounds') cfg.rounds = +e.target.value;
      else if (e.target.id === 'turnT') cfg.turnT = +e.target.value;
      else if (e.target.id === 'team') cfg.team = e.target.checked;
      else if (e.target.id === 'botSkill') cfg.botSkill = e.target.value;
      else if (e.target.id === 'fill') cfg.fill = +e.target.value;
      else if (e.target.dataset.mg) { const k = e.target.dataset.mg; cfg.off = cfg.off.filter(x => x !== k); if (!e.target.checked) cfg.off.push(k); }
      saveCfg(); syncModeUI(); lock();
    };
    const setPool = on => { cfg.off = on ? [] : Object.keys(MINIGAMES); document.querySelectorAll('#pool input').forEach(i => i.checked = on); saveCfg(); };
    $('poolAll').onclick = () => setPool(true); $('poolNone').onclick = () => setPool(false);
    $('testSel').innerHTML = Object.entries(MINIGAMES).map(([k, g]) => `<option value="${k}">${esc(g.name)}</option>`).join('');
    $('testGo').onclick = () => { if (practice && !mg && !board.active) startRandomMg($('testSel').value); };
  }
  setPlayers(players);
}

let practice = false, botN = 0;
$('solo').onclick = () => {
  practice = true; net.isHost = true; net.id = 'host'; me = 'host'; sim.host = { x: 0, z: 0, ix: 0, iz: 0 };
  players = {}; players.host = { id: 'host', name: myName(), ...mkLook(look, 'host') };
  enter('PRACTICE');
};
function addDummy(fill) {
  const n = Object.keys(players).length; if (n >= 8) return; const id = 'bot' + (++botN);
  const free = COLORS.filter(c => !taken(c, id));
  players[id] = { id, name: 'Bot ' + botN, fill: !!fill, ...mkLook({ ...randomLook(), color: free[Math.random() * free.length | 0] ?? COLORS[n % COLORS.length] }, id), bot: true };
  sim[id] = { x: (n % 5) * 2 - 4, z: 2, ix: 0, iz: 0 }; if (partyState) players[id].score = 0; pushLobby(); if (board.active) board.addPlayer(id);
}
function removeDummy() {
  const id = Object.keys(players).reverse().find(k => players[k].bot); if (!id) return;
  delete players[id]; delete sim[id]; board.onLeave(id); pushLobby();
}
$('practice').onclick = e => { const p = e.target.dataset.p; if (p === 'add') addDummy(); else if (p === 'rem') removeDummy(); else if (p === 'exit') ask('Exit practice?', 'You will leave practice mode.', 'Exit').then(y => y && location.reload()); };
$('leaveBtn').onclick = async () => { if (await ask('Leave the game?', net.isHost ? 'You are the host: everyone will be disconnected.' : 'You will disconnect from the room.', 'Leave')) { try { net.hostConn?.close(); net.peer?.destroy(); } catch {} location.reload(); } };

$('host').onclick = async () => {
  try {
    const code = await net.host(); me = 'host'; sim.host = { x: 0, z: 0, ix: 0, iz: 0 };
    players = {}; players.host = { id: 'host', name: myName(), ...mkLook(look, 'host') };
    enter(code);
  } catch (e) { alert('Could not host: ' + (e.type || e)); }
};
$('join').onclick = async () => {
  try {
    await net.join($('code').value.trim()); me = net.id;
    net.send('hello', { name: myName(), ...look }); enter($('code').value.toUpperCase());
  } catch (e) { alert('Could not join: ' + (e.type || e)); }
};

// ---- host-side lobby handling
net.on('hello', (d, from) => {
  if (!net.isHost) return;
  if (mg) { queued.push([from, d]); net.sendTo(from, 'queued'); return; }   // joins as soon as this minigame ends
  admit(from, d);
});
function admit(from, d) {
  const n = Object.keys(players).length;
  players[from] = { id: from, name: String(d.name).slice(0, 12), ...mkLook(d, from) };
  sim[from] = { x: (n % 5) * 2 - 4, z: 2, ix: 0, iz: 0 }; if (partyState) players[from].score = 0; pushLobby();
  if (partyState) net.sendTo(from, 'party', partyState);
  if (board.active) board.addPlayer(from);
}
const admitQueued = () => queued.splice(0).forEach(([f, d]) => net.conns.has(f) && admit(f, d));
net.on('cust', (d, from) => { const p = players[from]; if (p) { Object.assign(p, mkLook(d, from)); pushLobby(); } });
net.on('leave', (_, from) => { const qi = queued.findIndex(q => q[0] === from); if (qi >= 0) queued.splice(qi, 1); delete players[from]; delete sim[from]; board.onLeave(from); pushLobby(); });
net.on('input', (d, from) => { if (sim[from]) { sim[from].ix = +d.x || 0; sim[from].iz = +d.z || 0; } });
net.on('queued', () => toast('A minigame is in progress — you\'ll join when it ends!', 4000));
net.on('closed', () => alert('Host disconnected'));
// ---- client-side
net.on('lobby', d => setPlayers(d));
net.on('snap', d => { if (!net.isHost && !board.active && !mg && !podium) applySnap(world, d); });
// ---- confirmation dialog (promise-based): `if (await ask('Title', 'Explain', 'Do it')) ...`
function ask(title, text, yes = 'Yes') {
  return new Promise(res => {
    const el = $('confirm'); $('cfTitle').textContent = title; $('cfText').textContent = text; $('cfYes').textContent = yes; el.hidden = false;
    const done = v => { el.hidden = true; $('cfYes').onclick = $('cfNo').onclick = el.onclick = null; removeEventListener('keydown', kd); res(v); };
    const kd = e => { if (e.code === 'Escape') done(false); else if (e.code === 'Enter') done(true); };
    addEventListener('keydown', kd); $('cfYes').onclick = () => done(true); $('cfNo').onclick = () => done(false); el.onclick = e => { if (e.target === el) done(false); }; $('cfNo').focus();
  });
}
// ---- lobby shoving (left click / F): hands do a shove motion, knocked players tumble, can fall off the island and drop back from the sky
const canPush = () => me && !board.active && !mg && !podium;
function showPush(d) { pushFx(world, players[d.id], d.id, d.dx, d.dz); sfx(d.hit?.length ? 'hit' : 'click'); for (const h of d.hit || []) burstAt(h, '#ffffff', 10); }
function hostPush(id) { if (!canPush() || !sim[id]) return; const r = doPush(sim, id); if (!r) return; const d = { id, dx: +r.dx.toFixed(2), dz: +r.dz.toFixed(2), hit: r.hit }; net.broadcast('pushfx', d); showPush(d); }
function tryPush() { if (!canPush()) return; net.isHost ? hostPush('host') : net.send('push'); }
net.on('push', (_, from) => { if (net.isHost) hostPush(from); });
net.on('pushfx', d => { if (!net.isHost && canPush()) showPush(d); });
addEventListener('pointerdown', e => { if (e.button === 0 && e.target === world.r?.domElement) tryPush(); });
addEventListener('keydown', e => { if (e.code === 'KeyF' && !e.repeat && !/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) tryPush(); });

// ---- minigames
function startRandomMg(key) {
  if (mg || voting || !net.isHost) return;
  const ks = poolKeys(); key ||= ks[Math.random() * ks.length | 0];
  const seed = Math.random() * 2 ** 31 | 0, def = MINIGAMES[key];
  if (!def?.tiers || typeof document === 'undefined' || !document.body?.append) { net.broadcast('mg:start', { key, seed, diff: 1 }); startMg(key, seed, 1); return; }
  // Games with `tiers` start with a table-wide vote: everyone plays the winning tier (ties: random). Humans only; no votes = tier 0.
  voting = { key, seed, votes: {} }; net.broadcast('mg:vote', { key }); showVote(key);
  const mine = voting; setTimeout(() => { if (voting === mine) resolveVote(); }, 9000);
}
let voting = null, voteEl = null;
function hideVote() { voteEl?.remove(); voteEl = null; }
function showVote(key) {
  hideVote(); const def = MINIGAMES[key]; if (!def?.tiers) return; const el = document.createElement('div'); el.className = 'box'; el.id = 'vote';
  el.style.cssText = 'top:50%;left:50%;transform:translate(-50%,-50%);z-index:20;text-align:center;max-width:92vw;align-items:center';
  el.innerHTML = `<h2 style="margin:0">${esc(def.name)}</h2><div>Vote for the difficulty - everyone plays the winning one.</div><div style="display:flex;flex-wrap:wrap;justify-content:center">` +
    def.tiers.map((t, i) => `<button data-i="${i}" style="margin:4px;padding:10px 14px;min-width:120px">${esc(t.n)}<br><small>${t.m !== 1 ? 'x' + t.m + ' coins' : 'normal coins'}${t.pen ? ', -' + t.pen + ' if bottom half' : ''}</small>${t.d ? '<br><small style="font-weight:400">' + esc(t.d) + '</small>' : ''}</button>`).join('') + '<div></div></div><small id="vt"></small>';
  el.onclick = e => { const b = e.target.closest('button[data-i]'); if (!b) return; el.querySelectorAll('button').forEach(x => x.style.outline = ''); b.style.outline = '3px solid #fff'; if (net.isHost) castVote(me, +b.dataset.i); else net.send('mg:pick', { i: +b.dataset.i }); };
  document.body.append(el); voteEl = el; let t = 9; const iv = setInterval(() => { if (!voteEl || voteEl !== el) return clearInterval(iv); t--; const v = el.querySelector('#vt'); if (v) v.textContent = Math.max(0, t) + 's'; }, 1000);
}
function castVote(id, i) {
  if (!voting || !players[id] || players[id].bot || !(i >= 0 && i < MINIGAMES[voting.key].tiers.length)) return;
  voting.votes[id] = i | 0; if (Object.keys(players).filter(k => !players[k].bot).every(k => k in voting.votes)) resolveVote();
}
function resolveVote() {
  const v = voting; if (!v) return; voting = null; hideVote(); const n = MINIGAMES[v.key].tiers.length, c = Array(n).fill(0);
  Object.values(v.votes).forEach(i => c[i]++); const top = Math.max(...c), tied = c.map((x, i) => x === top ? i : -1).filter(i => i >= 0), tier = top ? tied[Math.random() * tied.length | 0] : Math.max(0, MINIGAMES[v.key].tiers.findIndex(t => t.def));
  net.broadcast('mg:start', { key: v.key, seed: v.seed, diff: tier }); startMg(v.key, v.seed, tier);
}
net.on('mg:pick', (d, from) => { if (net.isHost) castVote(from, +d?.i); });
net.on('mg:vote', d => { if (!net.isHost && MINIGAMES[d.key]) showVote(d.key); });
// Bot skill 0..1 (host's setting + a stable per-bot wobble so bots differ). Host-only; never use ctx.rng for bots.
// Every bot has its own talent (stable for the whole session) and a specialty per minigame (stable hash of bot + game), so some bots are
// great at one game and bad at another. 'Mixed' spreads the talents wide; the other levels shift everybody up or down.
const SKILL = { easy: .3, normal: .5, hard: .75, mixed: .5 }, skTal = {}, skSpec = {};
const hash01 = str => { let h = 2166136261; for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619); return ((h >>> 0) % 1000) / 1000; };
const botSkill = id => {
  const k = id + '|' + (mg?.key ?? ''), tal = skTal[id] ??= (Math.random() - .5) * (cfg.botSkill === 'mixed' ? .7 : .4), spec = skSpec[k] ??= (hash01(k) - .5) * .5;
  return Math.max(.05, Math.min(.97, (SKILL[cfg.botSkill] ?? .5) + tal + spec));
};
function startMg(key, seed, diff = 1) {
  endPodium(); const def = MINIGAMES[key]; $('hud').innerHTML = ''; mg = { key, inst: null }; lock();
  const ctx = {
    players, me, world, isHost: net.isHost, hud: $('hud'), esc, rng: mulberry(seed), skill: botSkill, diff,           // diff: 0 easy / 1 normal / 2 hard (same on every client; games scale their own rules with it)
    send: m => net.isHost ? net.broadcast('mg:msg', m) : net.send('mg:msg', m),
    finish: (pl, rk, adj) => {
      const T = def.tiers?.[diff]; if (T && !adj) { adj = {}; Object.keys(players).forEach(id => adj[id] = { m: T.m ?? 1, pen: T.pen ?? 0 }); }       // tier payout: bigger rewards, bottom-half penalty
      rk ||= pl.map((_, i) => i);
      if (board.active) board.onMgEnd(pl, rk, adj);
      else pl.forEach((id, i) => { if (players[id]) players[id].score = (players[id].score || 0) + pl.length - rk[i]; });
      net.broadcast('mg:end', { placements: pl, ranks: rk, adj }); net.broadcast('lobby', players); endMg(pl, rk, adj); setPlayers(players);
      if (net.isHost) { admitQueued(); if (party) { const mine = party; setTimeout(() => { if (party === mine) nextParty(); }, 6000); } }
    },
  };
  mg.finish = ctx.finish;
  let n = 3;
  const tick = () => {
    if (!mg || mg.key !== key || mg.inst) return;
    if (n === 0) { sfx('go'); $('banner').innerHTML = ''; mg.inst = def.create(ctx); return; }
    $('banner').innerHTML = `<small>${esc(def.name)}</small><div>${esc(def.desc)}</div><h2>${n--}</h2>`;
    sfx('tick'); setTimeout(tick, 1000);
  };
  tick();
}
function endMg(pl, rk = pl.map((_, i) => i), adj) {
  sfx(rk[pl.indexOf(me)] === 0 ? 'win' : 'click');
  const gg = awardGems(pl, rk, adj);
  mg?.inst?.cleanup(); mg = null; lock();
  if (pl.length) podiumFor(pl, rk, { secs: 4 });
  const pts = i => board.active ? `🪙${board.rewardFor(pl[i], rk[i], adj, pl.length)}${board.s?.mega && rk[i] === 0 ? ' +⭐' : ''}` : `+${pl.length - rk[i]}`;
  $('hud').innerHTML = `<div class="mg res"><h2>${pl.length ? 'Results' : 'Stopped'}</h2>${pl.map((id, i) => `<div>${rk[i] + 1}. ${esc(players[id]?.name ?? '?')} <b>${pts(i)}</b></div>`).join('')}${gg ? `<div style="color:#7df;margin-top:4px">+${gg} gems</div>` : ''}</div>`;
  setTimeout(() => { if (!mg) $('hud').innerHTML = ''; }, 4000);
}
net.on('mg:start', d => { hideVote(); if (!net.isHost && MINIGAMES[d.key]) startMg(d.key, d.seed, d.diff ?? 1); });
net.on('mg:msg', (d, from) => mg?.inst?.onMessage(d, from));
net.on('mg:end', d => { if (!net.isHost && mg) endMg(d.placements, d.ranks, d.adj); });

// ---- main loop: host simulates free-roam at 60fps, broadcasts snapshots at 20Hz
let last = performance.now(), acc = 0, lastIn = '';
function loop(t) {
  const dt = Math.min(.05, (t - last) / 1000); last = t;
  if (me) {
    const i = readInput();
    if (net.isHost) {
      if (!board.active && !mg && !podium) {
        sim.host.ix = i.x; sim.host.iz = i.z;
        const snap = stepLobby(sim, world, dt);
        if ((acc += dt) >= .05) { acc = 0; net.broadcast('snap', snap); }
      } else clearRag(world, sim);
    } else {
      if (board.active || mg || podium) clearRag(world);
      const k = i.x + ',' + i.z;
      if (k !== lastIn) { lastIn = k; net.send('input', i); }
    }
    mg?.inst?.update(dt);
  }
  world.frame(dt); requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// ---- effects & sound
function burstAt(id, c, n) { const g = world.m.get(id)?.g; if (g) world.burst(g.position.x, g.position.y + 1, g.position.z, c, n); }
function popup(t) { $('banner').innerHTML = `<h2>${t}</h2>`; setTimeout(() => { if (!mg) $('banner').innerHTML = ''; }, 900); }
function fx(t, a) {
  if (t === 'roll') { sfx('roll'); popup('🎲 ' + a); return; }
  if (t === 'win' && board.s) { const s = board.s, ids = s.order.filter(id => players[id]), [o, r] = rankBy(ids, id => s.stars[id] * 1e6 + s.coins[id]); finalPodium(o, r); }
  if (t === 'mega') { sfx('star'); popup('⭐ MEGA MINIGAME ⭐'); return; }
  sfx(t);
  if (t === 'coin') burstAt(a, '#ffd93d'); else if (t === 'lose') burstAt(a, '#e74c3c', 10);
  else if (t === 'star') burstAt(a, '#fff176', 30); else if (t === 'win') burstAt(a, '#ffd93d', 40);
}
const setMute = () => $('mute').textContent = isMuted() ? '🔇 Sound off (M)' : '🔊 Sound on (M)';
$('mute').onclick = () => { toggleMute(); setMute(); }; setMute();
addEventListener('keydown', e => { if (e.code === 'KeyM' && !/INPUT|SELECT/.test(e.target.tagName)) { toggleMute(); setMute(); } });
