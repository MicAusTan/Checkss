/* ============ CHAT ============ */
function addChat(who, text, system, seat, img) {
  const d = document.createElement('div');
  if (system) {
    d.className = 'sys' + (system === 'minor' ? ' minor' : system === 'event' ? ' evt' : ''); d.textContent = text;
    const last = $('chatLog').lastElementChild;                       // the same note twice in a row becomes "note ×2"
    if (last && last.className === d.className && last.dataset.t === text) { const n = (+last.dataset.n || 1) + 1; last.dataset.n = n; last.textContent = text + '  ×' + n; $('chatLog').scrollTop = $('chatLog').scrollHeight; return; }
    d.dataset.t = text;
  }
  else {
    const info = seat && seatInfo[seat], name = info && info.n ? info.n : (who === 'Opponent' && peerInfo && peerInfo.n ? peerInfo.n : who), pfp = info ? info.p : (who === 'Opponent' && peerInfo ? peerInfo.p : (who === 'You' ? safePfp(profile.pfp) : '')), col = seat ? seatCol(seat) : '#6b7f4e';
    d.className = 'cm'; const av = document.createElement('span'); av.className = 'av sm'; fillAvatar(av, name, pfp, col); d.appendChild(av);
    const b = document.createElement('div'); b.className = 'cb'; const n = document.createElement('span'); n.className = 'cn'; n.textContent = name; if (seat) n.style.color = col; b.appendChild(n); b.appendChild(document.createTextNode(text ? ': ' + text : ': ')); if (img) b.appendChild(chatImage(img, false)); else { const lk = imgLinkIn(text); if (lk) b.appendChild(chatImage(lk, true)); } d.appendChild(b);
    if (who !== 'You') chatNotify(name, text || (img ? '📷 sent a picture' : ''), seat);
  }
  $('chatLog').appendChild(d);
  $('chatLog').scrollTop = $('chatLog').scrollHeight;
}
function sendChat() {
  const t = $('chatIn').value.trim(), img = pendingImg && pendingImg.url;
  if (!t && !img) return;
  const clearAtt = () => { pendingImg = null; showAttPrev(); };
  if (img && Date.now() - lastImgSent < 2600) { addChat('', 'One picture every few seconds, please. Your picture is still attached, press Send again in a moment.', true); return; }
  if (img) lastImgSent = Date.now();
  if (spectating) {
    if (!specChatAllowed) { addChat('', 'The host has not switched spectator chat on.', true); return; }
    send({ type: 'specChat', text: t }); $('chatIn').value = ''; return;
  }
  if ((game && game.multi) || A4) {
    if (isHost) { addChat('You', t, false, mySeat, img); broadcast({ type: 'mchat', from: mySeat, text: t, img: img || undefined }); }
    else send({ type: 'chat', text: t, img: img || undefined });
    $('chatIn').value = ''; clearAtt(); return;
  }
  send({ type: 'chat', text: t, img: img || undefined }); addChat('You', t, false, undefined, img); $('chatIn').value = ''; clearAtt();
}

/* ============ BUTTONS ============ */
$('hostBtn').onclick = host;
let reviewBack = false;                                          // true while Practice is showing the review of the game that just ended here
Practice.init({ confirm: askConfirm, Engine, glyph: (el, t) => { setGlyph(el, t); }, onExit: () => { if (reviewBack) { reviewBack = false; $('game').classList.remove('hidden'); } else $('lobby').classList.remove('hidden'); } });
$('practiceBtn').onclick = () => { $('lobby').classList.add('hidden'); Practice.open(); };
$('joinBtn').onclick = () => $('codeIn').value && join($('codeIn').value);
$('chatBtn').onclick = sendChat;
$('chatIn').onkeydown = e => { if (e.key === 'Enter') sendChat(); };
$('newBtn').onclick = () => {
  if (replay) exitReplay();
  const m = $('modeSel2').value, swap = $('swapChk').checked;
  if (roomFamily(MODES[mode]) !== roomFamily(MODES[m]) || (MODES[m].multi && MODES[m].all.length < (mseats || []).length)) {
    addChat('', "A room keeps its board: you can't switch between 2-player, 4-player, 8-player, hexagonal and Bughouse modes. Create a new room.", true); $('modeSel2').value = mode; return;
  }
  if (MODES[m].match4) {                                    // Austang 4-player: a brand-new match, everybody builds again
    newGame(m, null, { gs: readGS(), seats: mseats }); sel = null;
    initA4(mseats, readSettings(m), gs); a4HostSendMates();
    broadcast({ type: 'a4new', mode: m, seats: mseats, gs, a4: { s: A4.s, teams: A4.teams } });
    addChat('', 'New match: ' + MODES[m].name + '. Build your army!', true);
    render(); return;
  }
  if (MODES[m].multi) {                                     // another multiplayer mode (same people, same seats): restart the room in it
    newGame(m, null, { gs: readGS(), seats: mseats }); sel = null;
    broadcast({ type: 'newgame', mode: m, seats: mseats, gs });
    addChat('', 'New game: ' + MODES[m].name + '.', true);
    if (needDraft()) beginDraft();
    render(); return;
  }
  newGame(m, readSettings(m), { gs: readGS() });
  if (swap) myColor = myColor === 'w' ? 'b' : 'w';
  send({ type: 'newgame', mode: m, swap, settings: M && M.s, gs });
  $('promo').classList.add('hidden'); $('drawBanner').classList.add('hidden');
  addChat('', 'New game: ' + MODES[m].name + '. You are ' + (myColor === 'w' ? 'White' : 'Black') + '.', true);
  if (needDraft()) beginDraft();
  render();
};
$('specLinkBtn').onclick = () => {
  const url = location.origin + location.pathname + '?watch=' + roomCode;
  try { navigator.clipboard.writeText(url); } catch (e) { /* ignore */ }
  addChat('', 'Spectator link (copied if your browser allows): ' + url, true);
};
$('specChatChk').onchange = e => { specChatOn = e.target.checked; sendSpecs({ type: 'specChatSetting', on: specChatOn }); addChat('', 'Spectator chat is ' + (specChatOn ? 'on' : 'off') + '.', 'minor'); };
$('rematchBtn').onclick = () => { send({ type: 'rematchReq' }); addChat('', 'You asked for a rematch.', 'minor'); };
window.onresize = () => game && render();

// Auto-join from a shared link like ?join=abc12
const code = new URLSearchParams(location.search).get('join'), watchCode = new URLSearchParams(location.search).get('watch');
if (code) join(code); else if (watchCode) join(watchCode, true);
