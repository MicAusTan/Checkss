// ================= profile (name + picture), drawers, copy buttons, turn strip, chat extras =================
let profile = { name: '', pfp: '' };
try { Object.assign(profile, JSON.parse(localStorage.getItem('chessProfile') || '{}')); } catch (e) { /* ignore */ }
const saveProfile = () => { try { localStorage.setItem('chessProfile', JSON.stringify(profile)); } catch (e) { /* ignore */ } };
const cleanName = n => String(n == null ? '' : n).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 24);
const myName = () => cleanName(profile.name) || 'Guest';
const safePfp = p => (typeof p === 'string' && p.length < 60000 && /^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+\/=]+$/.test(p)) ? p : '';
const initialOf = n => (cleanName(n) || '?').slice(0, 1).toUpperCase();
function fillAvatar(el, name, pfp, color) {
  pfp = safePfp(pfp);
  el.style.backgroundImage = pfp ? 'url("' + pfp + '")' : 'none'; el.style.backgroundColor = color || '#6b7f4e'; el.textContent = pfp ? '' : initialOf(name);
}
let seatInfo = {}, peerInfo = null;                         // seat -> { n, p, bot } for multiplayer; the other player for 2-player games
const cleanInfo = i => { const o = {}; Object.keys(i || {}).slice(0, 12).forEach(k => { const v = i[k] || {}; o[String(k).slice(0, 2)] = { n: cleanName(v.n), p: safePfp(v.p), bot: !!v.bot, k: cleanSk(v.k) }; }); return o; };
const seatName = c => (seatInfo[c] && seatInfo[c].n) || CN[c];
const seatCol = c => (game && game.oct ? OCT_HEX[c] : (document.body.classList.contains('teamsOn') ? SEAT_HEX[c] : OCT_HEX[c])) || '#888';
function buildSeatInfo() {
  const info = {};
  if (!game || !game.multi) return info;
  info[mySeat] = { n: myName(), p: safePfp(profile.pfp), k: SKIN.mine };
  conns.forEach(c => { if (c.seat) info[c.seat] = { n: cleanName(c.name) || CN[c.seat], p: safePfp(c.pfp), k: c.sk || undefined }; });
  Object.keys(bots).forEach(sd => { info[sd] = { n: 'Bot (' + bots[sd] + ')', p: '', bot: true }; });
  return info;
}
function pushSeatInfo() { if (!isHost || !game || !game.multi) return; seatInfo = buildSeatInfo(); broadcast({ type: 'info', info: seatInfo }); conns.forEach(sendSkins); specs.forEach(sendSkins); renderStrip(); setTimeout(sendSucc, 300); }
function refreshProfileUI() {
  fillAvatar($('profAv'), myName(), profile.pfp); fillAvatar($('profAv2'), myName(), profile.pfp);
  $('profName').textContent = myName(); if (document.activeElement !== $('nameIn')) $('nameIn').value = cleanName(profile.name);
}
function announceProfile() {
  refreshProfileUI();
  if (!isHost && conn && conn.open) { conn.send({ type: 'profile', name: cleanName(profile.name), pfp: safePfp(profile.pfp), sk: SKIN.mine }); guestSendSkins(); }
  else if (isHost && game && game.multi && mstarted) pushSeatInfo();
  else if (isHost && MODES[mode] && MODES[mode].multi) renderRoster();
  else if (isHost && conn && conn.open) { conn.send({ type: 'profile', name: cleanName(profile.name), pfp: safePfp(profile.pfp), sk: SKIN.mine }); sendSkins(conn); }
  if (game) render();
}
$('nameIn').addEventListener('input', () => { profile.name = cleanName($('nameIn').value); saveProfile(); announceProfile(); });
$('pfpClear').onclick = () => { profile.pfp = ''; saveProfile(); announceProfile(); };

/* ---- the skin editor ---- */
function modeTypes() {                                          // the piece types this game can show (only their pictures are sent)
  const s = new Set(['p', 'n', 'b', 'r', 'q', 'k']); if (!game) return s;
  if (game.imperial) PIECE_GUIDE.forEach(e => s.add(e[0])); else if (game.promotion) Object.values(Promotion.CODE).forEach(c => s.add(c)); else if (game.oct) { OCT_GUIDE.forEach(e => s.add(e[0])); 'ciwoal'.split('').forEach(c => s.add(c)); } else if (MODES[mode] && MODES[mode].grand) GRAND_GUIDE.forEach(e => s.add(e[0]));
  return s;
}
function skinGroups() {
  const seen = new Set(), out = [], add = (name, list) => { const l = list.filter(([t]) => !seen.has(t) && String(t).length <= 3 && t !== '#' && t !== '__proto__'); l.forEach(([t]) => seen.add(t)); if (l.length) out.push({ name, list: l }); };
  add('Classic', [['p', 'Pawn'], ['n', 'Knight'], ['b', 'Bishop'], ['r', 'Rook'], ['q', 'Queen'], ['k', 'King']]);
  add('Imperial Chess', PIECE_GUIDE.map(e => [e[0], e[1]]));
  add('Austang Grand', GRAND_GUIDE.map(e => [e[0], e[1]]));
  add('Promotion Chess', Object.values(Promotion.CODE).map(c => [c, Promotion.NAME[c]]));
  add('8-player (neutral pieces you own)', OCT_GUIDE.filter(e => e[0] !== Engine.NEUTRAL_T.boss).map(e => [e[0], e[1]]).concat([[Engine.NEUTRAL_T.boss, 'Boss (2×2)'],['c', 'Shield'], ['i', 'Imp'], ['w', 'Wraith'], ['o', 'Ox'], ['a', 'Acolyte'], ['l', 'Legion']]));
  return out;
}
function skinImport(file, done) {                                  // any picture -> a square WebP (transparent where the picture does not reach), as sharp as the size limit allows (up to 768 px). The whole picture is kept: crop / zoom happens in the editor.
  const img = new Image(), url = URL.createObjectURL(file);
  img.onload = () => {
    URL.revokeObjectURL(url); const long = Math.max(img.width, img.height), tried = new Set();
    for (const S0 of [768, 640, 512, 384, 256, 192]) {
      const S = Math.min(S0, long); if (tried.has(S)) continue; tried.add(S);
      const cv = document.createElement('canvas'); cv.width = cv.height = S; const x = cv.getContext('2d'), k = S / long, w = img.width * k, h = img.height * k; x.imageSmoothingQuality = 'high'; x.drawImage(img, (S - w) / 2, (S - h) / 2, w, h);
      for (let q = 0.92; q >= 0.5; q -= 0.14) { const d = cv.toDataURL('image/webp', q); if (d.length <= 118000 && safeSkinImg(d)) return done(d); }
    }
    done(null);
  };
  img.onerror = () => { URL.revokeObjectURL(url); done(null); }; img.src = url;
}
$('skinShowChk').checked = SKIN.show; $('skinShowChk').onchange = () => { SKIN.show = $('skinShowChk').checked; skLsSet('cwfShowSkins', SKIN.show ? '1' : '0'); if (game) render(); };
$('skinEditBtn').onclick = openSkinEditor; refreshSkinNow();
$('skinReset').onclick = () => { skinActivate(null); setLook(false); refreshSkinNow(); };

$('pfpIn').onchange = e => {
  const f = e.target.files && e.target.files[0]; e.target.value = ''; if (!f) return;
  const img = new Image(), url = URL.createObjectURL(f);
  img.onload = () => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128; const x = cv.getContext('2d'), m = Math.min(img.width, img.height);
    x.drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, 128, 128); URL.revokeObjectURL(url);
    profile.pfp = cv.toDataURL('image/jpeg', 0.85); saveProfile(); announceProfile();
  };
  img.onerror = () => URL.revokeObjectURL(url); img.src = url;
};
// drawers
const drawers = ['settingsDrawer', 'helpDrawer', 'pieceDrawer'];
function toggleDrawer(id) { const open = $(id).classList.contains('hidden'); drawers.forEach(d => $(d).classList.add('hidden')); if (open) { $(id).classList.remove('hidden'); if (id === 'helpDrawer') refreshHelp(true); } }
$('palBtn').onclick = () => { toggleDrawer('pieceDrawer'); refreshSkinNow(); }; document.querySelectorAll('input[name=lookSel]').forEach(r => { r.checked = (r.value === 'classic') === LOOK.classic; r.onchange = () => setLook(r.value === 'classic'); });
$('gearBtn').onclick = () => toggleDrawer('settingsDrawer'); $('profBtn').onclick = () => toggleDrawer('settingsDrawer'); $('helpBtn').onclick = () => toggleDrawer('helpDrawer');
document.querySelectorAll('[data-close]').forEach(b => { b.onclick = () => $(b.dataset.close).classList.add('hidden'); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') drawers.forEach(d => $(d).classList.add('hidden')); });
['grandBox', 'octBox', 'promoBox', 'promoGuide', 'rulesBox'].forEach(id => $('helpBody').appendChild($(id)));      // the per-mode guides live in the help drawer now
function refreshHelp(opening) {
  const shown = [...$('helpBody').children].filter(d => !d.classList.contains('hidden'));
  $('helpNone').classList.toggle('hidden', shown.length > 0);
  if (opening) shown.forEach(d => { d.open = true; });
}
// copy buttons
function copyText(text, btn, label) {
  const done = () => { const o = label; btn.textContent = 'Copied ✓'; setTimeout(() => { btn.textContent = o; }, 1500); };
  try { navigator.clipboard.writeText(text).then(done, () => { window.prompt('Copy this:', text); }); } catch (e) { window.prompt('Copy this:', text); }
}
const joinUrl = () => location.origin + location.pathname + '?join=' + roomCode, watchUrl = () => location.origin + location.pathname + '?watch=' + roomCode;
$('copyCodeBtn').onclick = () => copyText(roomCode, $('copyCodeBtn'), 'Copy code');
$('copyLinkBtn').onclick = () => copyText(joinUrl(), $('copyLinkBtn'), 'Copy link');
$('copySpecBtn').onclick = () => copyText(watchUrl(), $('copySpecBtn'), 'Copy spectator link');
// turn strip: who is playing now and who is next
function strip2p(el) {                       // 2-player games: opponent and you, with names / pictures; the side to move is lit
  const me = myColor, opp = me === 'w' ? 'b' : 'w', fin = !!ended();
  el.innerHTML = ''; el.classList.remove('hidden', 'compact');
  [opp, me].forEach(c => {
    const mine = c === me, nameTxt = mine ? myName() : (bots2p ? 'Computer' : (peerInfo && peerInfo.n) || 'Opponent'), pfp = mine ? profile.pfp : (peerInfo && peerInfo.p);
    const d = document.createElement('div'); d.className = 'tchip' + (game.turn === c && !fin ? ' now' : ''); d.style.setProperty('--c', c === 'w' ? '#f2f2f2' : '#222'); d.title = (c === 'w' ? 'White' : 'Black');
    const av = document.createElement('span'); av.className = 'av'; fillAvatar(av, nameTxt, pfp, bots2p && !mine ? '#555' : (c === 'w' ? '#9a9a9a' : '#333')); if (bots2p && !mine && !pfp) av.textContent = '\u{1F916}'; d.appendChild(av);
    const nm = document.createElement('span'); nm.className = 'tn'; nm.style.maxWidth = '220px'; nm.textContent = nameTxt + (mine ? ' (you)' : ''); d.appendChild(nm);
    const ct = document.createElement('span'); ct.className = 'tag'; ct.textContent = c === 'w' ? 'White' : 'Black'; d.appendChild(ct);
    if (game.turn === c && !fin) { const t = document.createElement('span'); t.className = 'tag'; t.textContent = 'to move'; d.appendChild(t); }
    try { if (game.turn === c && !fin && !gs.fog && game.inCheck()) { const t = document.createElement('span'); t.className = 'chk'; t.textContent = '+'; t.title = 'in check'; d.appendChild(t); } } catch (e) { /* ignore */ }
    el.appendChild(d);
  });
}
function renderStrip() {
  const el = $('turnStrip');
  if (game && !game.multi && (game.turn === 'w' || game.turn === 'b') && !spectating && !replay && !(M && M.phase === 'setup')) { strip2p(el); return; }
  if (!game || !game.multi || !game.seats || game.bug || A4 && !game) { el.classList.add('hidden'); return; }
  const seats = game.seats, k = Math.max(0, seats.indexOf(game.turn)), order = seats.map((_, i) => seats[(k + i) % seats.length]);
  el.innerHTML = ''; el.classList.remove('hidden');
  const showCheck = !gs.fog;
  el.classList.toggle('compact', seats.length > 4);      // (8 seats on one slim row: only the player to move and the next one show a name; hover the others)
  order.forEach((c, i) => {
    const d = document.createElement('div'), alive = game.alive(c);
    d.className = 'tchip' + (i === 0 ? ' now' : i === 1 ? ' next' : '') + (alive ? '' : ' dead') + (game.teams ? ' tm' + game.teams[c] : '');
    d.style.setProperty('--c', seatCol(c)); d.title = CN[c] + (game.teams ? ', team ' + (game.teams[c] + 1) : '') + (alive ? '' : ' (out)');
    const av = document.createElement('span'); av.className = 'av'; fillAvatar(av, seatName(c), seatInfo[c] && seatInfo[c].p, seatInfo[c] && seatInfo[c].bot ? '#555' : seatCol(c)); if (seatInfo[c] && seatInfo[c].bot && !seatInfo[c].p) av.textContent = '🤖'; d.appendChild(av);
    const nm = document.createElement('span'); nm.className = 'tn'; nm.textContent = seatName(c) + (c === mySeat ? ' (you)' : ''); d.appendChild(nm);
    if (alive && i === 0 && !ended()) { const t = document.createElement('span'); t.className = 'tag'; t.textContent = 'now'; d.appendChild(t); }
    if (alive && advWait === c) { const t = document.createElement('span'); t.className = 'tag adv'; t.textContent = 'waiting for advice'; t.title = 'A bot teammate waits a few seconds for advice: point at one of its pieces and then at the square'; d.appendChild(t); }
    else if (alive && i === 1 && !ended() && seats.length > 2) { const t = document.createElement('span'); t.className = 'tag'; t.textContent = 'next'; d.appendChild(t); }
    if (clk && !(seatInfo[c] && seatInfo[c].bot)) { const k = document.createElement('span'); k.className = 'tclk'; k.dataset.id = c; k.textContent = clkFmt(clkNow(c)); d.appendChild(k); }
    try { if (alive && showCheck && game.inCheck(c)) { const t = document.createElement('span'); t.className = 'chk'; t.textContent = '+'; t.title = 'in check'; d.appendChild(t); } } catch (e) { /* ignore */ }
    el.appendChild(d);
  });
}
// chat: unread badge, a short popup near the board, and a soft ping when you are not looking at the chat
let unread = 0;
function chatInView() { if (document.hidden) return false; const r = $('chatLog').getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; }
function chatNotify(name, text, seat) {
  if (document.hidden || !chatInView()) { unread++; $('chatBadge').textContent = unread; $('chatBadge').classList.remove('hidden'); document.title = '(' + unread + ') ' + baseTitle; }
  if (document.activeElement !== $('chatIn')) {
    const t = document.createElement('div'); t.className = 'toast'; t.style.setProperty('--c', seat ? seatCol(seat) : '#ffe26a');
    const av = document.createElement('span'); av.className = 'av sm'; fillAvatar(av, name, seat && seatInfo[seat] && seatInfo[seat].p, seat ? seatCol(seat) : '#6b7f4e'); t.appendChild(av);
    const b = document.createElement('div'); const n = document.createElement('b'); n.textContent = name + ': '; b.appendChild(n); b.appendChild(document.createTextNode(String(text).slice(0, 140))); t.appendChild(b);
    $('toasts').appendChild(t); while ($('toasts').children.length > 4) $('toasts').firstChild.remove();
    setTimeout(() => t.classList.add('out'), 5500); setTimeout(() => t.remove(), 6100);
    sfx('ping');
  }
}
const clearUnread = () => { if (unread) { unread = 0; $('chatBadge').classList.add('hidden'); document.title = baseTitle; } };
document.addEventListener('visibilitychange', () => { if (!document.hidden && chatInView()) clearUnread(); });
$('chatBox').addEventListener('pointerdown', clearUnread); $('chatIn').addEventListener('focus', clearUnread);
refreshProfileUI();


