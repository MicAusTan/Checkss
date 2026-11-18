// ================= chat pictures and GIFs =================
const IMG_CAP = 2.5 * 1048576, GIF_CAP = 3 * 1048576, fmtMB = b => (b / 1048576).toFixed(1) + ' MB';
const safeImg = u => (typeof u === 'string' && u.length < 4500000 && /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+\/=]+$/.test(u)) ? u : '';
let showImg = true; try { showImg = localStorage.getItem('chessShowImg') !== '0'; } catch (e) { /* ignore */ }
$('showImgChk').checked = showImg; $('showImgChk').onchange = () => { showImg = $('showImgChk').checked; try { localStorage.setItem('chessShowImg', showImg ? '1' : '0'); } catch (e) { /* ignore */ } };
const readDataURL = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error('Could not read that file.')); r.readAsDataURL(blob); });
// Stills keep their quality (only shrunk when really big); GIFs are sent untouched, because re-encoding them would freeze the animation.
async function prepareImage(file) {
  if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) throw new Error('Only PNG, JPEG, WebP and GIF pictures can be sent.');
  if (file.type === 'image/gif') {
    if (file.size > GIF_CAP) throw new Error('That GIF is ' + fmtMB(file.size) + '. The limit is ' + fmtMB(GIF_CAP) + ' (a GIF cannot be shrunk without freezing it).');
    return { url: await readDataURL(file), name: file.name || 'image.gif' };
  }
  const obj = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Could not read that picture.')); i.src = obj; });
    if (Math.max(img.width, img.height) <= 1600 && file.size <= 1.5 * 1048576) return { url: await readDataURL(file), name: file.name || 'image' };
    for (const [side, q] of [[1600, 0.9], [1600, 0.8], [1280, 0.8], [1024, 0.75]]) {
      const k = Math.min(1, side / Math.max(img.width, img.height)), cv = document.createElement('canvas'); cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      let url = file.type === 'image/png' ? cv.toDataURL('image/png') : '';
      if (!url || url.length * 0.75 > IMG_CAP) url = cv.toDataURL('image/jpeg', q);
      if (url.length * 0.75 <= IMG_CAP) return { url, name: file.name || 'image' };
    }
    throw new Error('That picture is too big to send even after shrinking.');
  } finally { URL.revokeObjectURL(obj); }
}
let pendingImg = null, lastImgSent = 0;
function showAttPrev() {
  const el = $('attPrev'); el.innerHTML = ''; el.classList.toggle('hidden', !pendingImg); if (!pendingImg) return;
  const im = document.createElement('img'); im.src = pendingImg.url; el.appendChild(im);
  const t = document.createElement('span'); t.textContent = pendingImg.name + ' · ' + fmtMB(pendingImg.url.length * 0.75); el.appendChild(t);
  const x = document.createElement('button'); x.textContent = '✕'; x.title = 'Remove'; x.type = 'button'; x.onclick = () => { pendingImg = null; showAttPrev(); }; el.appendChild(x);
}
async function attachFile(file) {
  if (spectating) { addChat('', 'Spectators cannot send pictures.', true); return; }
  try { pendingImg = await prepareImage(file); showAttPrev(); $('chatIn').focus(); } catch (e) { addChat('', e.message, true); }
}
$('attBtn').onclick = () => $('attIn').click();
$('attIn').onchange = e => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) attachFile(f); };
$('chatIn').addEventListener('paste', e => { const it = [...(e.clipboardData && e.clipboardData.items || [])].find(i => i.kind === 'file' && /^image\//.test(i.type)); if (it) { e.preventDefault(); attachFile(it.getAsFile()); } });
['dragenter', 'dragover'].forEach(ev => $('chatBox').addEventListener(ev, e => { if ([...(e.dataTransfer && e.dataTransfer.types || [])].includes('Files')) { e.preventDefault(); $('chatBox').classList.add('dragover'); } }));
['dragleave', 'drop'].forEach(ev => $('chatBox').addEventListener(ev, () => $('chatBox').classList.remove('dragover')));
$('chatBox').addEventListener('drop', e => { const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) { e.preventDefault(); attachFile(f); } });
const openLightbox = src => { $('lightbox').querySelector('img').src = src; $('lightbox').classList.remove('hidden'); };
$('lightbox').onclick = () => $('lightbox').classList.add('hidden');
// pictures in a chat line: attached ones and pasted links to image files
function chatImage(src, remote) {
  const wrap = document.createElement('span'), mk = () => { const im = document.createElement('img'); im.className = 'cimg'; if (remote) im.referrerPolicy = 'no-referrer'; im.loading = 'lazy'; im.src = src; im.onclick = () => openLightbox(src); im.onerror = () => im.remove(); return im; };
  if (showImg) wrap.appendChild(mk());
  else { const ph = document.createElement('span'); ph.className = 'cimgph'; ph.textContent = '[picture hidden, click to show]'; ph.onclick = () => { ph.replaceWith(mk()); }; wrap.appendChild(ph); }
  return wrap;
}
const imgLinkIn = text => { const m = String(text).match(/https?:\/\/[^\s<>"']+\.(?:gif|png|jpe?g|webp)(?:\?[^\s<>"']*)?/i); return m ? m[0] : ''; };
const lastImgAt = new WeakMap();
const imgAllowed = c => { const now = Date.now(), last = lastImgAt.get(c) || 0; if (now - last < 2500) return false; lastImgAt.set(c, now); return true; };      // the host drops picture floods


// ================= pointing at squares: team suggestions, advice for bot teammates =================
let pings = [], pingMode = false, pingSrc = null, advice = {}, advWait = null, pingSeq = 0;
const sameTeam = (a, b) => a === b || !!(game && game.teams && game.teams[a] === game.teams[b]);
const canPing = owner => !!game && game.multi && !!owner && owner !== 'n' && game.alive(owner);
function cleanPing(p) {
  if (!game || !game.multi || !p) return null;
  const n = v => (Number.isInteger(v) ? v : -1);
  const o = { id: String(p.id || '').slice(0, 40), from: String(p.from || ''), owner: String(p.owner || ''), t: String(p.t || '').slice(0, 3), sx: n(p.sx), sy: n(p.sy), tx: n(p.tx), ty: n(p.ty), promo: p.promo ? String(p.promo).slice(0, 3) : null, born: Number.isInteger(p.born) ? p.born : 0, mark: !!p.mark };
  if (!game.seats.includes(o.from) || (!o.mark && !game.seats.includes(o.owner)) || [o.sx, o.sy, o.tx, o.ty].some(v => v < 0) || o.sx >= game.w || o.tx >= game.w || o.sy >= game.h || o.ty >= game.h) return null;
  return o;
}
// a suggestion lives until its piece's owner has moved (or the piece is gone)
function livePings() {
  if (!game || !game.multi || ended()) { pings = []; return pings; }
  const h = game.history();
  pings = pings.filter(pg => { if (pg.mark) return h.length === pg.born; const p = game.at(pg.sx, pg.sy); return p && p.c === pg.owner && p.t === pg.t && !h.slice(pg.born).some(m => m.c === pg.owner); });      // a marker lasts until the next move
  return pings;
}
const PING_MAX = 8, PING_SHADES = [0, 0.38, -0.32, 0.62, -0.5, 0.2, -0.18, 0.5];
function shadeHex(hex, f) {                                  // f > 0 mixes with white, f < 0 with black
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return hex; const n = parseInt(m[1], 16), c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.round(f >= 0 ? v + (255 - v) * f : v * (1 + f)));
  return '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
}
const pingColor = pg => seatCol(pg.from);      // always the sender's own colour (it used to vary the shade per suggestion, which was confusing)
const addPing = pg => {
  pings = pings.filter(q => !(q.from === pg.from && q.sx === pg.sx && q.sy === pg.sy && q.tx === pg.tx && q.ty === pg.ty && !!q.mark === !!pg.mark)); pings.push(pg);        // drawing the very same arrow again replaces it; a piece can have several
  const mine = pings.filter(q => q.from === pg.from); if (mine.length > PING_MAX) { const drop = new Set(mine.slice(0, mine.length - PING_MAX)); pings = pings.filter(q => !drop.has(q)); }
  render();
};
function relayPing(pg, except) {
  if (!game.teams) return;                                  // without teams a suggestion is private to whoever made it
  conns.forEach(c => { if (c !== except && c.open && c.seat && sameTeam(c.seat, pg.from)) c.send({ type: 'pinged', p: pg }); });
  adviseBot(pg);
}
function makePing(sx, sy, tx, ty, promo) {
  const p = game.at(sx, sy); if (!p || !canPing(p.c) || (sx === tx && sy === ty && !promo)) return;
  const pg = { id: mySeat + '-' + (++pingSeq) + '-' + Date.now().toString(36), from: mySeat, owner: p.c, t: p.t, sx, sy, tx, ty, promo: promo || null, born: game.history().length };
  addPing(pg);
  if (isHost) relayPing(pg, null); else if (game.teams) send({ type: 'ping', sx, sy, tx, ty, promo: pg.promo, id: pg.id });
}
function makeMark(x, y) {                                    // Ctrl + right-click a square: "look here" (at the piece standing there, if any)
  const p = game.at(x, y), piece = p && !p.wall ? p : null;
  const pg = { id: mySeat + '-' + (++pingSeq) + '-' + Date.now().toString(36), from: mySeat, owner: piece ? piece.c : '', t: piece ? piece.t : '', sx: x, sy: y, tx: x, ty: y, promo: null, mark: true, born: game.history().length };
  addPing(pg);
  if (isHost) relayPing(pg, null); else if (game.teams) send({ type: 'ping', mark: true, sx: x, sy: y, id: pg.id });
}
function hostPing(c, msg) {
  if (!c.seat || !game.alive(c.seat) || !game.teams) return;
  if (msg.mark) {
    const p = game.at(msg.sx, msg.sy), piece = p && !p.wall ? p : null;
    const mk = cleanPing({ id: msg.id, from: c.seat, owner: piece ? piece.c : '', t: piece ? piece.t : '', sx: msg.sx, sy: msg.sy, tx: msg.sx, ty: msg.sy, born: game.history().length, mark: true });
    if (!mk) return; if (sameTeam(c.seat, mySeat)) addPing(mk); relayPing(mk, c); return;
  }
  if (msg.clear) { const at = pingAt(msg.at); pings = pings.filter(q => !(q.from === c.seat && pingTouches(q, at))); conns.forEach(o => { if (o !== c && o.open && o.seat && sameTeam(o.seat, c.seat)) o.send({ type: 'pinged', clear: true, from: c.seat, at }); }); render(); return; }
  const p = game.at(msg.sx, msg.sy); if (!p) return;
  const pg = cleanPing({ id: msg.id, from: c.seat, owner: p.c, t: p.t, sx: msg.sx, sy: msg.sy, tx: msg.tx, ty: msg.ty, promo: msg.promo, born: game.history().length });
  if (!pg || !canPing(pg.owner)) return;
  if (sameTeam(c.seat, mySeat)) addPing(pg);
  relayPing(pg, c);
}
function adviseBot(pg) {                                    // host only: a teammate pointed at a bot's piece = advice for that bot's next turn
  if (pg.mark || !isHost || !bots[pg.owner] || pg.from === pg.owner || !sameTeam(pg.from, pg.owner) || !$('adviseChk').checked || !game.alive(pg.owner)) return;
  advice[pg.owner] = { sx: pg.sx, sy: pg.sy, tx: pg.tx, ty: pg.ty, promo: pg.promo, from: pg.from };
  addChat('', seatName(pg.from) + ' advised ' + seatName(pg.owner) + '.', 'minor');
  if (botTimer && botSeatToMove() === pg.owner) { clearTimeout(botTimer); botTimer = setTimeout(() => { botTimer = null; botStep(); }, 900); }
}
const pingBad = pg => { try { return !game.movesFor(pg.sx, pg.sy).some(m => m.tx === pg.tx && m.ty === pg.ty && (!pg.promo || m.promo === pg.promo)); } catch (e) { return false; } };
function pingBubble(pg) {
  const b = document.createElement('span'); b.className = 'pingbub'; b.style.setProperty('--pc', pingColor(pg));
  const sp = document.createElement('span'); setGlyph(sp, pg.t, pg.owner); sp.className = 'pc-' + pg.owner + (isFairy(pg.t) ? ' fairy' : ''); b.appendChild(sp);
  if (pg.promo) { const pr = document.createElement('span'); pr.className = 'pbadge'; const q = document.createElement('span'); setGlyph(q, pg.promo, pg.owner); q.className = 'pc-' + pg.owner + (isFairy(pg.promo) ? ' fairy' : ''); pr.appendChild(q); b.appendChild(pr); }
  b.title = seatName(pg.from) + ' suggests this ' + (PNAMES[pg.t] || 'piece') + ' goes here' + (pg.promo ? ', promoting to ' + (PNAMES[pg.promo] || pg.promo) : '');
  if (seatInfo[pg.owner] && seatInfo[pg.owner].bot && pingBad(pg)) { b.classList.add('bad'); b.title += ', but that is not a legal move right now'; }
  return b;
}
function startPing(s, d) {
  const p = game.at(s.x, s.y); if (!p || !canPing(p.c) || (s.x === d.x && s.y === d.y)) return;
  let cands = [];
  try {
    const ms = game.movesFor ? game.movesFor(s.x, s.y) : [];
    cands = ms.filter(m => m.tx === d.x && m.ty === d.y && m.promo);
    if (!cands.length && game.oct && game.fwd) { const f = game.fwd(p.c); if (d.x === s.x + f[0] && d.y === s.y + f[1]) cands = ms.filter(m => m.inplace); }      // a hole ahead: promote in place
  } catch (e) { cands = []; }
  const kinds = [...new Set(cands.map(m => m.promo))];
  if (kinds.length > 1) { showPromo(kinds.map(k => cands.find(m => m.promo === k)), m => makePing(s.x, s.y, d.x, d.y, m.promo)); return; }      // several promotion choices: ask which
  makePing(s.x, s.y, d.x, d.y, kinds[0] || null);
}
function pingClick(x, y) {                                  // the "Suggest a move" button: first click a piece, then the square
  const p = game.at(x, y);
  if (!pingSrc) { if (!p || !canPing(p.c)) { addChat('', 'Point at one of your own or your teammates\' pieces first.', true); return; } pingSrc = { x, y }; render(); return; }
  const s = pingSrc; pingSrc = null; pingMode = false; startPing(s, { x, y }); render();
}
const pingAt = a => (a && Number.isInteger(a.x) && Number.isInteger(a.y) ? { x: a.x, y: a.y } : null);
const pingTouches = (q, at) => !at || (q.sx === at.x && q.sy === at.y) || (q.tx === at.x && q.ty === at.y);
function clearMyPings(at) {                                  // Ctrl + right-click a square: remove my suggestions that touch it (all of mine if none does)
  const hit = at && pings.some(q => q.from === mySeat && pingTouches(q, at)); const a = hit ? at : null;
  pings = pings.filter(q => !(q.from === mySeat && pingTouches(q, a)));
  if (!isHost && game.teams) send({ type: 'ping', clear: true, at: a }); else if (isHost && game.teams) conns.forEach(o => { if (o.open && o.seat && sameTeam(o.seat, mySeat)) o.send({ type: 'pinged', clear: true, from: mySeat, at: a }); });
  render();
}
let rcSrc = null, pingPrev = null;
const cellXY = e => { const c = e.target.closest && e.target.closest('.sq'); return c && c.dataset.x != null ? { x: +c.dataset.x, y: +c.dataset.y } : null; };
$('board').addEventListener('contextmenu', e => { if (game) e.preventDefault(); });
$('board').addEventListener('mousedown', e => { if (e.button === 2 && (e.ctrlKey || e.metaKey) && game && game.multi && !spectating && !replay && !draft) rcSrc = cellXY(e); });
/* Ctrl + right-click OUTSIDE the board (anywhere on the page that is not the board or a control) removes all of my suggestions and markers */
document.addEventListener('mousedown', e => {
  if (e.button !== 2 || !(e.ctrlKey || e.metaKey) || !game || !game.multi || spectating || replay || draft || $('game').classList.contains('hidden')) return;
  if (e.target.closest && e.target.closest('#board, input, textarea, select, button, a, #chatLog')) return;
  e.preventDefault(); clearMyPings(null);
});
document.addEventListener('contextmenu', e => { if ((e.ctrlKey || e.metaKey) && game && game.multi && !$('game').classList.contains('hidden')) e.preventDefault(); });
document.addEventListener('mouseup', e => { if (e.button !== 2 || !rcSrc) return; const s = rcSrc; rcSrc = null; pingPrev = null; const d = cellXY(e); if (!d || !game || !game.multi) return; if (d.x === s.x && d.y === s.y) { const at = { x: d.x, y: d.y }; if (pings.some(q => q.from === mySeat && pingTouches(q, at))) clearMyPings(at); else makeMark(d.x, d.y); return; } startPing(s, d); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && (pingMode || pingSrc)) { pingMode = false; pingSrc = null; if (game) render(); } if (e.key === 'Escape' && $('promo').classList.contains('pop')) $('promo').classList.add('hidden'); });
document.addEventListener('pointerdown', e => { const p = $('promo'); if (p.classList.contains('pop') && !p.classList.contains('hidden') && !p.contains(e.target)) p.classList.add('hidden'); }, true);
addEventListener('resize', () => { const p = $('promo'); if (p.classList.contains('pop')) p.classList.add('hidden'); });


// ================= quick reactions: an emoji floats from the sender's own side of the board =================
const REACTS = ['👍', '😂', '😮', '😢', '😡', '🎉', '🔥', '🤝'];
const lastReactAt = new WeakMap();
let lastReactSent = 0;
REACTS.forEach(e => { const b = document.createElement('button'); b.textContent = e; b.type = 'button'; b.onclick = () => sendReact(e); $('emojiRow').appendChild(b); });
$('emoBtn').onclick = () => $('emojiRow').classList.toggle('hidden');
function reactAnchor(seat) {                                // where on screen the sender's army is (their king if they still have one)
  const bd = $('board'), r = bd.getBoundingClientRect();
  if (!game || !game.multi || game.hex || !bd.children.length || !seat || seat === 'me' || seat === 'opp') return { x: r.x + r.width / 2, y: seat === 'opp' ? r.y + 30 : r.y + r.height - 30, cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
  let best = null;
  for (let y = 0; y < game.h; y++) for (let x = 0; x < game.w; x++) { const p = game.valid(x, y) && game.at(x, y); if (p && p.c === seat && (!best || p.t === 'k')) best = [x, y]; }
  const side = viewSeat(mySeat), W = game.w;
  if (best) for (let i = 0; i < W * game.h; i++) { const c = i % W, rr = Math.floor(i / W), [bx, by] = fromView(side, c, game.h - 1 - rr, W); if (bx === best[0] && by === best[1]) { const b = bd.children[i].getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, cx: r.x + r.width / 2, cy: r.y + r.height / 2 }; } }
  return { x: r.x + r.width / 2, y: r.y + r.height / 2, cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
}
function showReaction(seat, emoji) {                       // a burst of about a dozen: different sizes, all drifting the same way, each wobbling sideways
  const a = reactAnchor(seat), el = document.createElement('div'); el.className = 'react';
  let dx = a.cx - a.x, dy = a.cy - a.y; const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;      // unit vector towards the middle of the board
  const px = -dy, py = dx;                                                                                // sideways
  el.style.left = a.x + 'px'; el.style.top = a.y + 'px'; el.dataset.dx = dx.toFixed(3); el.dataset.dy = dy.toFixed(3);
  const anims = [];
  for (let i = 0; i < 12; i++) {
    const e = document.createElement('span'); e.className = 're'; e.textContent = emoji; e.style.fontSize = (20 + Math.random() * 34).toFixed(0) + 'px'; el.appendChild(e);
    const dist = 160 + Math.random() * 140, amp = 12 + Math.random() * 28, cyc = 1.3 + Math.random() * 1.5, ph = Math.random() * Math.PI * 2, lane = (Math.random() - 0.5) * 70, spin = (Math.random() - 0.5) * 40, frames = [], steps = 18;
    for (let k = 0; k <= steps; k++) {
      const t = k / steps, along = dist * t, off = lane * t + amp * Math.sin(ph + cyc * 2 * Math.PI * t) * Math.min(1, t * 4);
      frames.push({ transform: 'translate(-50%, -50%) translate(' + (dx * along + px * off).toFixed(1) + 'px, ' + (dy * along + py * off).toFixed(1) + 'px) scale(' + (0.5 + 0.6 * Math.min(1, t * 3)).toFixed(2) + ') rotate(' + (spin * t).toFixed(1) + 'deg)', opacity: t < 0.08 ? t / 0.08 : t > 0.72 ? Math.max(0, 1 - (t - 0.72) / 0.28) : 1, offset: t });
    }
    anims.push(e.animate(frames, { duration: 2200 + Math.random() * 1500, delay: Math.random() * 450, easing: 'ease-out', fill: 'both' }));
  }
  const nm = seat === 'me' ? myName() : seat === 'opp' ? ((peerInfo && peerInfo.n) || 'Opponent') : seatName(seat);
  const sm = document.createElement('small'); sm.textContent = nm; el.appendChild(sm); anims.push(sm.animate([{ opacity: 1 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }], { duration: 2400, fill: 'both' }));
  const old = document.querySelectorAll('.react'); if (old.length > 5) old[0].remove();
  document.body.appendChild(el); Promise.all(anims.map(an => an.finished)).then(() => el.remove(), () => el.remove()); setTimeout(() => el.remove(), 6500); return el;
}
function sendReact(e) {
  if (!REACTS.includes(e) || Date.now() - lastReactSent < 900) return; lastReactSent = Date.now();
  if (spectating) return;
  if (game && game.multi) { showReaction(mySeat, e); if (isHost) { const m = { type: 'reacted', from: mySeat, e }; broadcast(m); } else send({ type: 'react', e }); }
  else { showReaction('me', e); send({ type: 'react', e }); }
}
function hostReact(c, msg) {
  if (!c.seat || !REACTS.includes(msg.e)) return;
  const now = Date.now(); if (now - (lastReactAt.get(c) || 0) < 800) return; lastReactAt.set(c, now);
  showReaction(c.seat, msg.e); const m = { type: 'reacted', from: c.seat, e: msg.e };
  conns.forEach(o => { if (o !== c && o.open) o.send(m); }); sendSpecs(m);
}

// ---- reconnecting players, spectators ----
function acceptConn(c) {
  let decided = false;
  const decide = hello => { if (decided) return; decided = true; classify(c, hello || {}); };
  c.on('data', msg => {
    if (!msg || msg.type !== 'hello') return;
    if (!decided) decide(msg); else if (!c.token && msg.token) { c.token = String(msg.token).slice(0, 80); dropTwins(c); }      // a late hello still counts: the same browser never holds two places
  });
  onOpen(c, () => setTimeout(() => decide({}), 1500));      // pages without hello are treated as new players
}
function dropTwins(c) {                                    // one browser = one place: an older connection from the same token (a refresh, a double click, spam) is replaced
  if (!c.token) return;
  const twin = x => x !== c && x.token && x.token === c.token && !x.replaced;
  if (MODES[mode].multi && !mstarted) conns.filter(twin).forEach(o => { o.replaced = true; conns = conns.filter(x => x !== o); try { o.close(); } catch (e) { /* already closed */ } if (c.team === undefined && o.team !== undefined) c.team = o.team; if (o.pref !== undefined && c.pref === undefined) c.pref = o.pref; });
  specs.filter(twin).forEach(o => { o.replaced = true; specs = specs.filter(x => x !== o); try { o.close(); } catch (e) { /* already closed */ } });
  if (MODES[mode].multi && !mstarted) renderRoster();
}
function classify(c, hello) {
  c.token = hello.token ? String(hello.token).slice(0, 80) : null;
  if (c.token && banned.has(c.token)) { try { c.send({ type: 'kicked' }); } catch (e) { /* closed */ } diagNote('banned join refused'); setTimeout(() => { try { c.close(); } catch (e) { /* closed */ } }, 300); return; }
  dropTwins(c); c.name = cleanName(hello.name); c.pfp = safePfp(hello.pfp); c.sk = cleanSk(hello.sk);
  if (!MODES[mode].multi) peerInfo = { n: c.name, p: c.pfp, k: c.sk };
  if (hello.spectate) return addSpectator(c);
  if (c.token) {
    if (game && game.multi && mstarted) { const old = conns.find(x => x.token === c.token); if (old) return rebindMulti(c, old); }
    else if (!MODES[mode].multi && everJoined && c.token === peerToken) return rebind2p(c);
  }
  if (MODES[mode].multi) { if (mstarted || conns.length + lobbyBots.length >= maxSeats() - 1) return addSpectator(c); return hostMultiConn(c); }
  if (everJoined || bots2p || (conn && conn.open)) return addSpectator(c);
  setupConn(c);
}
const draftFor = seat => (draft && draft.offers && draft.offers[seat] ? { kind: draft.kind, offers: draft.offers[seat], picked: draft.picks[seat] || null } : null);
function rebindMulti(c, old) {
  setTimeout(pushSeatInfo, 500);
  c.seat = old.seat; c.team = old.team; c.ready = true; c.token = old.token; old.replaced = true;
  conns[conns.indexOf(old)] = c;
  try { if (old.open) old.close(); } catch (e) { /* already closed */ }
  c.on('data', msg => hostRecv(c, msg));
  c.on('close', () => { if (!c.replaced) { addChat('', CN[c.seat] + ' disconnected. They can rejoin with the same link.', true); connUI.lostAdd(CN[c.seat]); } });
  onOpen(c, () => {
    connUI.lostDel(CN[c.seat]);
    if (A4 && !game) a4SendResume(c);
    else c.send({ type: 'resume', rec: buildRecord(), seat: c.seat, draft: draftFor(c.seat), a4x: A4 ? a4Extra(c.seat) : undefined, clk: clkSnap() });
    addChat('', CN[c.seat] + ' reconnected.', true);
  });
}
function rebind2p(c) {
  const old = conn;
  if (old && old !== c) { old.replaced = true; try { old.close(); } catch (e) { /* already closed */ } }
  conn = c;
  c.on('data', handleMessage);
  c.on('close', () => { if (!c.replaced) { $('status').textContent = 'Opponent disconnected. They can rejoin with the same link.'; connUI.lostAdd('your opponent'); } });
  onOpen(c, () => {
    connUI.lostDel('your opponent');
    c.send({ type: 'resume', rec: buildRecord(), color: myColor === 'w' ? 'b' : 'w', draft: draftFor(myColor === 'w' ? 'b' : 'w'), clk: clkSnap() });
    addChat('', 'Opponent reconnected.', true);
  });
}
function addSpectator(c) {
  const early = (MODES[mode].multi && !mstarted) || (!MODES[mode].multi && !everJoined && !bots2p);
  if (M || A4 || !game || early) {
    onOpen(c, () => { c.send({ type: 'mwait', text: (M || A4) ? "Spectating isn't available in Austang." : 'The game has not started yet. Try the link again in a moment.' }); setTimeout(() => c.close(), 300); });
    return;
  }
  c.spec = true; specs.push(c);
  c.on('data', msg => {                                   // spectators can only send chat, and only if the host allows it
    if (msg && msg.type === 'resync') { c.send({ type: 'spec', rec: buildRecord(), chat: specChatOn, clk: clkSnap() }); return; }
    if (!msg || msg.type !== 'specChat' || !specChatOn || typeof msg.text !== 'string') return;
    const t = msg.text.trim().slice(0, 300), who = 'Spectator ' + (specs.indexOf(c) + 1);
    if (!t) return;
    addChat(who, t);
    if (game && game.multi) broadcast({ type: 'schat', who, text: t }); else send({ type: 'schat', who, text: t });
  });
  onOpen(c, () => { c.send({ type: 'spec', rec: buildRecord(), chat: specChatOn, clk: clkSnap() }); addChat('', 'A spectator joined (' + specs.filter(x => x.open).length + ' watching).', 'minor'); });
  c.on('close', () => { specs = specs.filter(x => x !== c); addChat('', 'A spectator left.', 'minor'); });
}
/* ---- host migration (multi-seat games in progress) ----
   The host tells every guest who would take over (`order`, by seat) and gives the first two a private kit (everybody's reconnect token + team, the bots).
   If the host is gone for good (about 16 s of failed reconnects), the first successor starts a NEW room with the deterministic id <old code>-<its index>,
   everybody else (guests and spectators) tries those ids in turn and reconnects with its usual token, exactly like a normal reconnect, and the old host's
   seat is played by a Normal bot. Not available: Austang (hidden armies), secret classes, trait/class drafts, bughouse, 2-player games. */
const migOK = () => !!(succ && game && game.multi && !A4 && !M && !game.bug && !draft && !game.seats.some(secretSeat));
function cleanSucc(m) {
  if (!m || !game || !game.multi || !Array.isArray(m.order)) return null;
  const order = m.order.filter(s => typeof s === 'string' && game.seats.includes(s)).slice(0, 8); let kit = null;
  if (m.kit && m.kit.seats && typeof m.kit.seats === 'object' && game.seats.includes(m.kit.hostSeat)) {
    kit = { hostSeat: m.kit.hostSeat, seats: {}, bots: {} };
    for (const sd in m.kit.seats) { const v = m.kit.seats[sd]; if (game.seats.includes(sd) && v && typeof v.token === 'string') kit.seats[sd] = { token: v.token.slice(0, 60), team: v.team, name: cleanName(v.name), pfp: safePfp(v.pfp) }; }
    for (const sd in (m.kit.bots || {})) if (game.seats.includes(sd) && ['easy', 'normal', 'hard'].includes(m.kit.bots[sd])) kit.bots[sd] = m.kit.bots[sd];
  }
  return { order, kit };
}
function sendSucc() {
  if (!isHost || !game || !game.multi || !mstarted || A4 || M || game.bug || draft) return;
  const live = conns.filter(c => c.open && c.seat), order = game.seats.filter(sd => live.some(c => c.seat === sd));
  live.forEach(c => {
    const msg = { type: 'succ', order }, k = order.indexOf(c.seat);
    if (k >= 0 && k < 2) { msg.kit = { hostSeat: mySeat, seats: {}, bots: Object.assign({}, bots) }; conns.forEach(o => { if (o !== c && o.seat && o.token) msg.kit.seats[o.seat] = { token: o.token, team: o.team, name: o.name, pfp: o.pfp }; }); }
    try { c.send(msg); } catch (e) { /* the connection just closed */ }
  });
  specs.forEach(s => { try { if (s.open) s.send({ type: 'succ', order }); } catch (e) { /* closed */ } });
}
setInterval(() => { if (isHost) sendSucc(); }, 15000);      // (also sent when a seat is rebound, the info is pushed or a game starts)
function becomeHost(k) {
  const kit = succ.kit, code = roomCode + '-' + k;
  stopRetry(); isHost = true;      // (set first: closing the old peer fires its 'close' handler, which must not start another reconnect loop)
  try { if (peer) peer.destroy(); } catch (e) { /* ignore */ }
  peer = new Peer(PREFIX + code);
  peer.on('error', e => { if (e.type === 'unavailable-id') { isHost = false; retries = 5 + 3 * k; keepRetries = true; startRetry(); } });      // somebody else got there first: just follow them
  peer.on('open', () => {
    isHost = true; roomCode = code; retryCode = null; mstarted = true; inRoom = false; lobbyBots = []; specs = []; hostPref = null; mseats = null; succ = null; spectating = false;
    conns = Object.keys(kit.seats).map(sd => ({ seat: sd, team: kit.seats[sd].team, token: kit.seats[sd].token, name: kit.seats[sd].name, pfp: kit.seats[sd].pfp, ready: true, open: false, close() { }, send() { }, on() { } }));
    bots = Object.assign({}, kit.bots); if (kit.hostSeat !== mySeat && game.alive(kit.hostSeat)) bots[kit.hostSeat] = 'normal';
    peer.on('connection', acceptConn);
    $('hostCtl').classList.remove('hidden'); $('roomBtn').classList.remove('hidden'); $('modeSel2').value = mode;
    $('status').textContent = '';
    addChat('', 'The host left, so you are the host now. The others are reconnecting. ' + CN[kit.hostSeat] + ' is played by a bot. New room link: ' + location.origin + location.pathname + '?join=' + code, true);
    pushSeatInfo(); clkSync(); scheduleBot(); maybeRunNeutral(); render();
  });
}
function startRetry() {
  if (retryTimer || isHost || !roomCode) return;
  if (keepRetries) keepRetries = false; else retries = 0;
  $('status').textContent = 'Connection lost. Trying to reconnect…';
  const leave = () => { location.href = location.pathname; };
  const attempt = () => {
    if (isHost) { clearInterval(retryTimer); retryTimer = null; return; }
    if (retries++ > 25 + (migOK() ? 20 : 0)) { clearInterval(retryTimer); retryTimer = null; connUI.retryNow = null; $('status').textContent = 'Could not reconnect. Reload the page or open the link again.'; connUI.set('bad', 'Could not reconnect.', [['Try again', () => { retries = 0; startRetry(); }], ['Reload page', () => location.reload()], ['Leave', leave]]); return; }
    connUI.set('warn', 'Connection lost. Reconnecting… (try ' + retries + ')', [['Retry now', () => { attempt(); }], ['Leave', leave]]);
    let code = roomCode;
    if (migOK() && retries > 4 && succ.order.length) {                      // the host is gone for good: follow the planned successors
      const o = succ.order.slice(0, 2), k = succ.order.indexOf(mySeat);
      if (!spectating && succ.kit && k >= 0 && k < 2 && retries === 5 + 3 * k) { clearInterval(retryTimer); retryTimer = null; becomeHost(k); return; }
      code = roomCode + '-' + ((retries - 5) % o.length);
      $('status').textContent = 'The host is gone. Looking for the new host…'; connUI.set('warn', 'The host is gone. Looking for the new host…', [['Leave', leave]]);
    }
    retryCode = code;
    try { if (peer) peer.destroy(); } catch (e) { /* ignore */ }
    peer = new Peer();
    peer.on('open', () => setupConn(peer.connect(PREFIX + code)));
    peer.on('error', () => { /* keep trying */ });
  };
  retryTimer = setInterval(attempt, 4000); connUI.retryNow = () => { if (retryTimer) attempt(); }; attempt();
}
const stopRetry = () => { if (retryTimer) { clearInterval(retryTimer); retryTimer = null; } };

// ================= polish: themes, quiet turn notification, clickable move list =================
(function initPrefs() {
  let th = 'classic', snd = true;
  try { th = localStorage.getItem('chessTheme') || 'classic'; snd = localStorage.getItem('chessSound') !== '0'; } catch (e) { /* storage unavailable */ }
  const applyTheme = t => { if (t === 'classic') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t; };
  applyTheme(th); $('themeSel').value = th; $('soundChk').checked = snd;
  $('themeSel').onchange = e => { applyTheme(e.target.value); try { localStorage.setItem('chessTheme', e.target.value); } catch (x) { /* ignore */ } };
  $('soundChk').onchange = e => { try { localStorage.setItem('chessSound', e.target.checked ? '1' : '0'); } catch (x) { /* ignore */ } };
})();


// ================= interface theme + piece colour palette =================
function applyPalette(p) {
  document.documentElement.dataset.pal = p === 'cb' ? 'cb' : 'std';
  const cs = getComputedStyle(document.documentElement), v = n => cs.getPropertyValue(n).trim();
  Object.assign(OCT_HEX, { r: v('--sr'), o: v('--so'), y: v('--sy'), g: v('--sg'), t: v('--st'), b: v('--sb'), p: v('--sp'), m: v('--sm') });
  Object.assign(SEAT_HEX, { r: v('--sr'), y: v('--sty'), b: v('--sb'), g: v('--stg') });
  if (typeof game !== 'undefined' && game) { try { render(); } catch (e) { /* not ready yet */ } }
  if (typeof isHost !== 'undefined' && isHost && !mstarted && peer) { try { renderRoster(); } catch (e) { /* ignore */ } }
}
(function () {
  const load = (k, d) => { try { return localStorage.getItem(k) || d; } catch (e) { return d; } };
  const ui = load('chessUI', 'dark'), pal = load('chessPal', 'std');
  const setUI = u => { if (u === 'dark') delete document.documentElement.dataset.ui; else document.documentElement.dataset.ui = u; };
  setUI(ui); $('uiSel').value = ui; $('palSel').value = pal;
  $('uiSel').onchange = e => { setUI(e.target.value); try { localStorage.setItem('chessUI', e.target.value); } catch (x) { /* ignore */ } };
  $('palSel').onchange = e => { applyPalette(e.target.value); try { localStorage.setItem('chessPal', e.target.value); } catch (x) { /* ignore */ } };
  window.addEventListener('load', () => applyPalette(pal));      // after every table of colours exists
})();
let audioCtx = null, lastMyTurn = false, flashTimer = null;

// ================= sounds (all synthesized in the browser: short wooden taps and chimes) =================
(function () {
  const load = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } };
  $('pieceSndChk').checked = load('chessPieceSnd', '1') !== '0'; $('chimeChk').checked = load('chessChime', '1') !== '0'; $('volRange').value = load('chessVol', '100');
  const save = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } };
  $('pieceSndChk').onchange = e => save('chessPieceSnd', e.target.checked ? '1' : '0'); $('chimeChk').onchange = e => save('chessChime', e.target.checked ? '1' : '0');
  $('volRange').oninput = e => { save('chessVol', e.target.value); if (master) master.gain.value = e.target.value / 100; };
  $('sndTest').onclick = () => { sfx('capture'); setTimeout(() => sfx('check'), 380); };
})();
var master = null, noiseBuf = null;
function sndOut() { if (!master) { master = audioCtx.createGain(); const lim = audioCtx.createWaveShaper(), cv = new Float32Array(2049); for (let i = 0; i < cv.length; i++) { const x = i / 1024 - 1, a = Math.abs(x); cv[i] = a < 0.5 ? x : Math.sign(x) * (0.5 + 0.5 * Math.tanh((a - 0.5) / 0.5)); } lim.curve = cv; master.connect(lim); lim.connect(audioCtx.destination); }      // (soft peak guard: layered sounds can never get harsh or clip)
  master.gain.value = (+$('volRange').value || 0) / 100; return master; }
const sndEnv = (g, t0, a, d, peak) => { g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + a); g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d); };
function sTone(f, t0, d, peak, type, f2) { const o = audioCtx.createOscillator(), g = audioCtx.createGain(); o.type = type || 'sine'; o.frequency.setValueAtTime(f, t0); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + d); sndEnv(g, t0, 0.006, d, peak); o.connect(g); g.connect(sndOut()); o.start(t0); o.stop(t0 + d + 0.06); }
function sNoise(t0, d, peak, type, freq, q) {
  if (!noiseBuf) { noiseBuf = audioCtx.createBuffer(1, Math.floor(audioCtx.sampleRate * 0.5), audioCtx.sampleRate); const dd = noiseBuf.getChannelData(0); for (let i = 0; i < dd.length; i++) dd[i] = Math.random() * 2 - 1; }
  const src = audioCtx.createBufferSource(), f = audioCtx.createBiquadFilter(), g = audioCtx.createGain(); src.buffer = noiseBuf; f.type = type; f.frequency.value = freq; f.Q.value = q || 1; sndEnv(g, t0, 0.002, d, peak);
  src.connect(f); f.connect(g); g.connect(sndOut()); src.start(t0); src.stop(t0 + d + 0.05);
}
const PIECE_SOUNDS = ['move', 'capture', 'promo', 'castle', 'crush'];
function sfx(name, base) {
  if (!audioCtx || !$('soundChk').checked || (PIECE_SOUNDS.includes(name) && !$('pieceSndChk').checked)) return;
  if (audioCtx.state === 'suspended') return;
  try {
    const t = audioCtx.currentTime + 0.01;
    const tap = (t0, big) => { sNoise(t0, big ? 0.09 : 0.05, big ? 0.62 : 0.5, 'bandpass', big ? 850 : 1100, 1.1); sTone(big ? 150 : 175, t0, big ? 0.12 : 0.08, big ? 0.38 : 0.32, 'sine', big ? 95 : 120); if (big) sNoise(t0, 0.012, 0.08, 'highpass', 2600, 0.7); };      // (a capture sits a little above a move: no long low thump, no bright click)
    if (name === 'move') tap(t, false);
    else if (name === 'capture') tap(t, true);
    else if (name === 'castle') { tap(t, false); tap(t + 0.13, false); }
    else if (name === 'promo') [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => sTone(f, t + i * 0.07, 0.25, 0.14, 'triangle'));
    else if (name === 'crush') { sTone(75, t, 0.5, 0.55, 'sawtooth', 38); sNoise(t, 0.45, 0.5, 'lowpass', 500, 0.8); }
    else if (name === 'check') { if (base) sfx(base); [[659.25, 0.14], [987.77, 0.3]].forEach(([f, d]) => sTone(f, t + 0.1 + (f > 700 ? 0.12 : 0), d + 0.2, 0.16, 'sine')); }
    else if (name === 'elim') [440, 349.23, 293.66].forEach((f, i) => sTone(f, t + i * 0.16, 0.3, 0.2, 'triangle'));
    else if (name === 'end') [523.25, 659.25, 783.99].forEach(f => sTone(f, t, 0.9, 0.12, 'sine'));
    else if (name === 'ping') sTone(880, t, 0.18, 0.12, 'sine');
  } catch (e) { /* ignore */ }
}
// which sound does the newest move deserve?
let sndGame = null, sndLen = 0, sndAlive = 0, sndEnded = false;
function moveSounds() {
  if (!game || replay || draft) return;
  const h = game.history(), n = h.length, alive = game.multi && game.seats ? game.seats.filter(c => game.alive(c)).length : 0;
  if (game !== sndGame) { sndGame = game; sndLen = n; sndAlive = alive; sndEnded = ended(); return; }
  if (n > sndLen && n - sndLen <= 4) {
    const m = h[n - 1]; let name = 'move';
    if (m.boss && m.cap) name = 'crush'; else if (m.cap) name = 'capture'; else if (m.promo || m.inplace) name = 'promo'; else if (m.castle) name = 'castle';
    let chk = false; try { chk = !gs.fog && (game.multi ? game.seats.some(c => game.alive(c) && game.inCheck(c)) : game.status() === 'check'); } catch (e) { chk = false; }
    if (chk && name !== 'crush') sfx('check', name); else sfx(name);
  }
  if (alive < sndAlive) setTimeout(() => sfx('elim'), 250);
  if (!sndEnded && ended()) { sndEnded = true; setTimeout(() => sfx('end'), 400); }
  sndLen = n; sndAlive = alive;
}

