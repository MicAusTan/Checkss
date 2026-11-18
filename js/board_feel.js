/* ============ BOARD FEEL: pieces slide, and can be dragged ============
   Slide: render() snapshots the pieces before it rebuilds the board and compares afterwards; whatever moved is flown across by a floating copy
   (castling, swaps, neutral monsters and so on come for free), captured pieces fade, shots fire a tracer.
   Drag: pressing your own piece and moving the mouse picks it up (a tilting copy follows the pointer); letting go on a square runs the very same
   click code a click would, so promotion pickers, hidden-move referees and friendly-fire checks all still work. Mouse only. */
const animLoad = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v !== '0'; } catch (e) { return d; } };
$('animChk').checked = animLoad('chessAnim', true); $('dragChk').checked = animLoad('chessDrag', true);
$('animChk').onchange = e => { try { localStorage.setItem('chessAnim', e.target.checked ? '1' : '0'); } catch (x) { /* ignore */ } };
$('dragChk').onchange = e => { try { localStorage.setItem('chessDrag', e.target.checked ? '1' : '0'); } catch (x) { /* ignore */ } };
const animOn = () => $('animChk').checked && !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
const boardSq = (x, y) => document.querySelector('#board .sq[data-x="' + x + '"][data-y="' + y + '"]:not(.ghost)');
let animGame = null, animLen = 0, animJob = null, animLive = [], animSkip = null;
function snapBoard() {
  const m = new Map();
  document.querySelectorAll('#board .sq[data-x]').forEach(sq => {
    if (sq.classList.contains('ghost')) return;
    const sp = sq.querySelector(':scope > span[data-pc]'); if (!sp) return;
    m.set(sq.dataset.x + ',' + sq.dataset.y, { key: sp.className + '|' + sp.innerHTML, node: sp.cloneNode(true), sp, sq });
  });
  return m;
}
function animCancel() { animLive.forEach(a => { try { a.anim && a.anim.cancel(); } catch (e) { /* done */ } if (a.el) a.el.remove(); if (a.show) a.show(); }); animLive = []; }
function animBefore() {
  animCancel(); animJob = null;
  if (!game || replay || draft || $('game').classList.contains('hidden')) return;
  const h = game.history(), n = h.length;
  if (game !== animGame) { animGame = game; animLen = n; arrows = []; circles = []; return; }
  if (n !== animLen) { arrows = []; circles = []; }                       // the position changed: the old plans no longer apply
  if (animOn() && n > animLen && n - animLen <= 3) animJob = { before: snapBoard(), m: h[n - 1] };
  animLen = n;
}
function mkFlyer(node, sq, cls) {
  const r = sq.getBoundingClientRect(), cs = getComputedStyle(sq), k = sq.offsetWidth ? r.width / sq.offsetWidth : 1;
  const d = document.createElement('div'); d.className = 'sq flyer' + (cls ? ' ' + cls : '');
  d.style.cssText = 'position:fixed;left:' + r.left + 'px;top:' + r.top + 'px;width:' + r.width + 'px;height:' + r.height + 'px;font-size:' + (parseFloat(cs.fontSize) * k) + 'px;pointer-events:none;z-index:40;background:none;overflow:visible;cursor:default';
  d.appendChild(node.cloneNode(true)); document.body.appendChild(d); return d;
}
function markFacing() {                                     // Imperial: a small marker on each Catapult showing where it is aimed
  document.querySelectorAll('#board span[data-face]').forEach(e => { delete e.dataset.face; });
  if (!game || !game.facings) return;
  game.facings().forEach(f => {
    const a = boardSq(f.x, f.y), sp = a && a.querySelector(':scope > span[data-pc]'); if (!sp) return;
    const ahead = boardSq(f.x + f.fx, f.y + f.fy), behind = boardSq(f.x - f.fx, f.y - f.fy), ra = a.getBoundingClientRect();
    let dx, dy; if (ahead) { const r = ahead.getBoundingClientRect(); dx = r.left - ra.left; dy = r.top - ra.top; } else if (behind) { const r = behind.getBoundingClientRect(); dx = ra.left - r.left; dy = ra.top - r.top; } else return;
    sp.dataset.face = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
  });
}
function animAfter() {
  clkEnsure(); clkSync(); clkRender();
  dragRefresh(); drawOverlay(); markFacing(); drawReward(); preRun();
  const job = animJob; animJob = null; if (!job) return;
  const after = snapBoard(), before = job.before, m = job.m, mk = (x, y) => x + ',' + y;
  const rem = [...before.keys()].filter(k => !after.has(k) || after.get(k).key !== before.get(k).key);
  const add = [...after.keys()].filter(k => !before.has(k) || before.get(k).key !== after.get(k).key);
  const used = new Set(), pairs = [], center = k => { const sq = boardSq(...k.split(',')); if (!sq) return [0, 0]; const r = sq.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
  if (m && m.fx !== undefined && !m.shot && !m.shoot) {                       // the move itself: from -> to, even if the piece changed (promotion)
    const a = mk(m.fx, m.fy), b = mk(m.tx, m.ty);
    if (rem.includes(a) && add.includes(b)) { pairs.push([a, b, true]); used.add(a); used.add(b); }
  }
  const ranged = !!(m && (m.shot || m.shoot));                                 // a ranged attack: the shooter stays, nothing slides
  if (!ranged) add.forEach(b => {                                                           // everything else that moved: match identical pieces, nearest first
    if (used.has(b)) return;
    let best = null, bd = 1e9; const [bx, by] = center(b);
    rem.forEach(a => { if (used.has(a) || before.get(a).key !== after.get(b).key) return; const [ax, ay] = center(a), d = Math.hypot(ax - bx, ay - by); if (d < bd) { bd = d; best = a; } });
    if (best) { pairs.push([best, b, false]); used.add(best); used.add(b); }
  });
  if (pairs.length > 6) return;                                                // mass changes: just show the result
  const skip = animSkip && performance.now() < animSkip.until ? animSkip.key : null; animSkip = null;
  const live = a => animLive.push(a);
  pairs.forEach(([a, b, main]) => {
    if (main && skip === b) return;                                            // you dropped it there yourself: it is already in place
    const to = after.get(b), fr = before.get(a), fSq = fr.sq.isConnected ? fr.sq : (boardSq(...a.split(',')) || fr.sq);
    const r0 = fSq.getBoundingClientRect(), r1 = to.sq.getBoundingClientRect();
    const dx = r1.left - r0.left, dy = r1.top - r0.top, cells = Math.hypot(dx, dy) / (r0.width || 1);
    if (!cells) return;
    const fl = mkFlyer(to.sp, fSq), ms = Math.round(Math.min(340, Math.max(130, 100 + 42 * Math.sqrt(cells))));
    to.sp.style.visibility = 'hidden';
    const anim = fl.animate([{ transform: 'translate(0,0)' }, { transform: 'translate(' + dx + 'px,' + dy + 'px)' }], { duration: ms, easing: 'cubic-bezier(.25,.8,.3,1)', fill: 'forwards' });
    const done = () => { to.sp.style.visibility = ''; fl.remove(); };
    anim.onfinish = done; live({ el: fl, anim, show: () => { to.sp.style.visibility = ''; } });
  });
  const hitKeys = new Set(); if (m && m.cap) hitKeys.add(mk(m.tx, m.ty)); if (m && m.hits) m.hits.forEach(q => hitKeys.add(mk(q.x, q.y)));
  const srcs = new Set(pairs.map(p => p[0])), dsts = new Set(pairs.map(p => p[1]));
  rem.forEach(k => {                                                           // captured pieces fade out where they stood
    if (!hitKeys.has(k) || (srcs.has(k) && !dsts.has(k))) return;
    const fr = before.get(k), sq = boardSq(...k.split(',')); if (!sq) return;
    const fl = mkFlyer(fr.node, sq); fl.style.zIndex = 39;
    const anim = fl.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.7)' }], { duration: 260, easing: 'ease-out', fill: 'forwards' });
    anim.onfinish = () => fl.remove(); live({ el: fl, anim });
  });
  if (m && (m.shot || m.shoot) && m.fx !== undefined) {                        // a shot: a tracer from the shooter to the target
    const a = boardSq(m.fx, m.fy), b = boardSq(m.tx, m.ty);
    if (a && b) {
      const r0 = a.getBoundingClientRect(), r1 = b.getBoundingClientRect(), dot = document.createElement('div'); dot.className = 'animdot';
      dot.style.left = (r0.left + r0.width / 2) + 'px'; dot.style.top = (r0.top + r0.height / 2) + 'px'; document.body.appendChild(dot);
      const anim = dot.animate([{ transform: 'translate(0,0)', opacity: 1 }, { transform: 'translate(' + (r1.left - r0.left) + 'px,' + (r1.top - r0.top) + 'px)', opacity: .9 }], { duration: 170, easing: 'ease-in', fill: 'forwards' });
      anim.onfinish = () => dot.remove(); live({ el: dot, anim });
    }
  }
  add.filter(k => !used.has(k)).slice(0, 4).forEach(k => {                      // pieces that simply appeared (drops, revivals): a little pop
    const sp = after.get(k).sp; if (!sp || !sp.animate) return;
    const anim = sp.animate([{ transform: 'scale(.4)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: 180, easing: 'ease-out' });
    live({ anim });
  });
}

let dg = null;
function dragEligible(x, y) {
  if (game && game.reward && game.reward()) return false;
  if (!$('dragChk').checked || !game || replay || spectating || draft || ended() || swapMode || abMode || (typeof pingMode !== 'undefined' && pingMode)) return false;
  if (!isMyTurn()) return preOn() && preMineAt(x, y);          // not your turn: dragging a piece queues a premove
  const p = game.at(x, y); if (!p || p.wall || p.dead) return false;
  if (!(game.multi ? p.c === mySeat && game.alive(mySeat) : p.c === myColor)) return false;
  return !(game.multi && game.neutralPending);
}
function dragStop(keepGhost) {
  const d = dg; if (!d) return; dg = null;
  removeEventListener('pointermove', dragMove); removeEventListener('pointerup', dragEnd); removeEventListener('pointercancel', dragEnd); removeEventListener('keydown', dragKey, true);
  if (d.raf) cancelAnimationFrame(d.raf);
  document.body.classList.remove('dragging'); if (d.over) d.over.classList.remove('dragover');
  if (d.sp) d.sp.style.opacity = ''; if (d.vg) d.vg.style.opacity = '';
  if (d.ghost && !keepGhost) d.ghost.remove();
}
function dragRefresh() {                                // the board was rebuilt while carrying a piece: find it again (or let go if it is gone)
  if (!dg || !dg.started || dg.pre) return;
  const sq = boardSq(dg.x, dg.y), sp = sq && sq.querySelector(':scope > span[data-pc]');
  if (!sp) { dragStop(); return; }
  sp.style.opacity = '.3'; dg.sp = sp;
}
function dragKey(e) { if (e.key === 'Escape') { e.stopPropagation(); dragSnap(); } }
function dragSnap() {                                   // glide the carried piece back to where it came from
  const d = dg; if (!d) return; const g = d.ghost;
  dragStop(true);
  if (!g) return;
  const sp = d.sp; if (sp) sp.style.opacity = '.3';
  const anim = g.animate([{ transform: g.style.transform }, { transform: 'translate(0,0) rotate(0deg) scale(1)' }], { duration: 150, easing: 'ease-out', fill: 'forwards' });
  anim.onfinish = () => { g.remove(); if (sp) sp.style.opacity = ''; };
}
function dragMove(e) {
  const d = dg; if (!d || e.pointerId !== d.id) return;
  if (!d.started) {
    if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 5) return;
    const sq0 = boardSq(d.x, d.y); if (!sq0) { dragStop(); return; }
    let sq = sq0, sp, node;
    if (isMyTurn()) {
      { const c0 = curSel(); if (!(c0 && c0.x === d.x && c0.y === d.y)) sq0.click(); }       // pick it up for real: the squares it can reach light up while you carry it
      sq = boardSq(d.x, d.y); sp = sq && sq.querySelector(':scope > span[data-pc]'); const c1 = curSel();
      if (!sp || !c1 || c1.x !== d.x || c1.y !== d.y) { dragStop(); return; }
      node = sp;
    } else {                                                         // a premove: nothing is selected, the piece just comes along (it may be one that an earlier premove will put there)
      const vnode = preProject().vir.get(d.x + ',' + d.y); sp = vnode ? null : sq0.querySelector(':scope > span[data-pc]'); node = vnode || sp; d.pre = true;
      if (!node) { dragStop(); return; }
      if (vnode) { const vg = document.querySelector('#board .preghost[data-k="' + d.x + ',' + d.y + '"]'); if (vg) { vg.style.opacity = '.25'; d.vg = vg; } }
    }
    const r = sq.getBoundingClientRect(); d.ox = r.left + r.width / 2; d.oy = r.top + r.height / 2; d.sp = sp || null; d.node = node.cloneNode(true);
    d.ghost = mkFlyer(node, sq, 'dragghost'); d.ghost.style.zIndex = 60; if (sp) sp.style.opacity = '.3'; d.started = true; d.vel = 0; d.tilt = 0;
    try { $('boardWrap').setPointerCapture(e.pointerId); } catch (x) { /* fine */ }
    document.body.classList.add('dragging'); addEventListener('keydown', dragKey, true);
    d.raf = requestAnimationFrame(dragFrame);
  }
  d.vel = d.vel * 0.6 + (e.clientX - d.lx) * 0.4; d.lx = e.clientX; d.px = e.clientX; d.py = e.clientY;
  const el = document.elementFromPoint(e.clientX, e.clientY), sq = el && el.closest ? el.closest('#board .sq[data-x]') : null;
  if (d.over !== sq) { if (d.over) d.over.classList.remove('dragover'); d.over = sq; if (sq) sq.classList.add('dragover'); }
}
function dragFrame() {                                  // the carried piece leans into the direction you shake it
  const d = dg; if (!d || !d.started) return;
  d.vel *= 0.82; d.tilt += (Math.max(-16, Math.min(16, d.vel * 1.7)) - d.tilt) * 0.25;
  d.ghost.style.transform = 'translate(' + (d.px - d.ox) + 'px,' + (d.py - d.oy) + 'px) rotate(' + d.tilt.toFixed(2) + 'deg) scale(1.18)';
  d.raf = requestAnimationFrame(dragFrame);
}
function dragEnd(e) {
  const d = dg; if (!d || e.pointerId !== d.id) return;
  if (!d.started) { dragStop(); return; }                            // never moved far enough: it was a plain click
  const swallow = ev => { ev.stopPropagation(); ev.preventDefault(); };      // (the browser's own click after the release must not toggle the selection)
  const arm = () => { addEventListener('click', swallow, { capture: true, once: true }); setTimeout(() => removeEventListener('click', swallow, true), 80); };
  const el = document.elementFromPoint(e.clientX, e.clientY), sq = e.type === 'pointercancel' || !el || !el.closest ? null : el.closest('#board .sq[data-x]');
  const tx = sq ? +sq.dataset.x : -1, ty = sq ? +sq.dataset.y : -1;
  if (!sq || (tx === d.x && ty === d.y)) { arm(); dragSnap(); return; }
  if (d.pre) {
    arm(); const node = d.node; dragStop();
    let pc = []; try { pc = ((game.movesFor || game.reach) ? (game.movesFor || game.reach).call(game, d.x, d.y) : []).filter(m => m.tx === tx && m.ty === ty && m.promo && !m.inplace); } catch (x) { pc = []; }
    const seen = new Set(); pc = pc.filter(m => !seen.has(m.promo) && seen.add(m.promo));
    const push = promo => { preQ.push({ fx: d.x, fy: d.y, tx, ty, node, promo }); preGame = game; drawOverlay(); preRun(); };
    if (pc.length > 1) showPromo(pc, m => push(m.promo)); else push(undefined);      // a premoved promotion asks WHICH piece right away
    return;
  }      // a premove joins the queue
  let legal = !isMyTurn();                                           // (a premove is checked when its turn comes, not now)
  if (!legal) { try { legal = MODES[mode].v.hidden || selMoves().some(m => m.tx === tx && m.ty === ty) || (game.oct && selMoves().some(m => m.inplace)); } catch (x) { legal = true; } }
  if (!legal) { arm(); dragSnap(); return; }
  animSkip = { key: tx + ',' + ty, until: performance.now() + 700 };
  dragStop(); sq.click(); arm();
}
$('boardWrap').addEventListener('pointerdown', e => {
  if (e.button !== 0 || e.pointerType === 'touch' || dg) return;
  const sq = e.target.closest ? e.target.closest('#board .sq[data-x]') : null; if (!sq || sq.classList.contains('ghost')) return;
  const x = +sq.dataset.x, y = +sq.dataset.y; if (!dragEligible(x, y)) return;
  e.stopPropagation();                                              // (so the zoom pan does not start from a piece)
  dg = { x, y, id: e.pointerId, sx: e.clientX, sy: e.clientY, lx: e.clientX, px: e.clientX, py: e.clientY, started: false };
  addEventListener('pointermove', dragMove); addEventListener('pointerup', dragEnd); addEventListener('pointercancel', dragEnd);
}, true);

/* ============ ARROWS, CIRCLES and PREMOVES (all drawn on one SVG layer inside the board) ============
   Arrows/circles: right-drag / right-click, only on your own screen, gone when the position changes or you click the board.
   Premove: click (or drag) one of your pieces and then a square while it is not your turn; it is played the moment your turn comes,
   if it is legal then, and dropped silently if not. */
const preLoad = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v !== '0'; } catch (e) { return d; } };
$('preChk').checked = preLoad('chessPremove', true);
$('preChk').onchange = e => { try { localStorage.setItem('chessPremove', e.target.checked ? '1' : '0'); } catch (x) { /* ignore */ } if (!e.target.checked) { preQ = []; drawOverlay(); } };
let arrows = [], circles = [], rcA = null, arrowPrev = null, preQ = [], preGame = null, preBusy = false;
const rewardMine = () => !!game && game.multi && !spectating && !replay && !!game.reward && !!game.reward() && game.reward().c === mySeat;
function drawReward() {                                       // the killer of a Boss: pick which fallen piece comes back (then click a square on your side)
  const box = $('rewardBox'), rw = game && game.multi && game.reward ? game.reward() : null;
  if (!rewardMine()) { rewardPick = null; box.classList.add('hidden'); return; }
  if (rewardPick && !rw.kinds.includes(rewardPick)) rewardPick = null;
  box.innerHTML = ''; box.classList.remove('hidden');
  const h = document.createElement('div'); h.innerHTML = '<b>The Boss is dead!</b> Bring one of your fallen pieces back. ' + (rewardPick ? 'Now click a highlighted square on your side.' : 'Which one?'); box.appendChild(h);
  rw.kinds.forEach(t => { const b = document.createElement('button'); b.type = 'button'; b.innerHTML = glyphHTML(t); b.title = 'Bring this piece back'; if (rewardPick === t) b.classList.add('sel'); b.onclick = () => { rewardPick = rewardPick === t ? null : t; render(); }; box.appendChild(b); });
  const sk = document.createElement('button'); sk.type = 'button'; sk.textContent = 'Skip'; sk.onclick = () => { rewardPick = null; playMulti({ reward: true, skip: true }); }; box.appendChild(sk);
}
const isMyTurn = () => !!game && (game.multi ? game.turn === mySeat && game.alive(mySeat) : game.turn === myColor);
const preOn = () => $('preChk').checked && !!game && !(MODES[mode].v && MODES[mode].v.hidden) && !game.bug && !ended() && !replay && !spectating && !draft;
const curSel = () => isMyTurn() ? sel : null;
const OV_COL = { g: '#3fae55', r: '#e04a4a', y: '#e6b800' };
function preProject() {                                     // where the queued premoves leave your pieces: vir = square -> the piece that will stand there, gone = real squares being left
  const vir = new Map(), gone = new Set();
  preQ.forEach(q => { const a = q.fx + ',' + q.fy, b = q.tx + ',' + q.ty; let node = vir.get(a); if (node) vir.delete(a); else { node = q.node; gone.add(a); } vir.set(b, node); });
  return { vir, gone };
}
function preMineAt(x, y) {
  const prj = preProject(), key = x + ',' + y; if (prj.vir.has(key)) return true;
  const p = game.at(x, y); return !!p && !p.wall && !p.dead && (game.multi ? p.c === mySeat : p.c === myColor) && !prj.gone.has(key);
}
function drawOverlay() {
  const board = $('board');
  board.querySelectorAll(':scope > svg.ov, :scope > .prelayer').forEach(e => e.remove());
  board.querySelectorAll('span[data-predim]').forEach(e => { e.style.opacity = ''; delete e.dataset.predim; });
  if (!game || $('game').classList.contains('hidden')) return;
  const prev = arrowPrev;
  const pingList = game.multi ? livePings() : [];
  if (!arrows.length && !circles.length && !prev && !preQ.length && !pingList.length && !pingPrev) return;
  const NS = 'http://www.w3.org/2000/svg', W = board.clientWidth, H = board.clientHeight;
  const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('class', 'ov'); svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  svg.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:7;overflow:visible';
  const geo = (x, y) => { const sq = boardSq(x, y); return sq ? { cx: sq.offsetLeft + sq.offsetWidth / 2, cy: sq.offsetTop + sq.offsetHeight / 2, w: sq.offsetWidth, h: sq.offsetHeight, l: sq.offsetLeft, t: sq.offsetTop } : null; };
  const add = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); svg.appendChild(e); return e; };
  const poly = sq => { const m = (getComputedStyle(sq).clipPath || '').match(/polygon\((.*)\)/); return m ? m[1].split(',').map(t => t.trim().split(/\s+/).map(v => parseFloat(v) / 100)) : null; };
  const rect = (x, y, fill) => {                             // a highlighted square, or a hexagon on hex boards
    const g = geo(x, y); if (!g) return; const pts = poly(boardSq(x, y));
    if (pts && pts.every(p => p.length === 2 && isFinite(p[0]) && isFinite(p[1]))) add('polygon', { points: pts.map(p => (g.l + p[0] * g.w) + ',' + (g.t + p[1] * g.h)).join(' '), fill });
    else add('rect', { x: g.l, y: g.t, width: g.w, height: g.h, fill });
  };
  const gcd = (m, n) => (n ? gcd(n, m % n) : m);
  const canGo = a => { try { return !!game.at(a.fx, a.fy) && typeof game.reach === 'function' && game.reach(a.fx, a.fy).some(m => m.tx === a.tx && m.ty === a.ty); } catch (e) { return false; } };
  const arrow = (a, col, op, dash) => {
    const p = geo(a.fx, a.fy), q = geo(a.tx, a.ty); if (!p || !q) return;
    const cs = (p.w + p.h) / 2, dx = q.cx - p.cx, dy = q.cy - p.cy, len = Math.hypot(dx, dy); if (!len) return;
    const ax = Math.abs(Math.round(dx / cs)), ay = Math.abs(Math.round(dy / cs));
    // Off every rank, file and diagonal, and not a longer run of a smaller step: it is a jump. A knight's jump always gets the L; any other jump
    // (camel, zebra, a custom leaper...) only when the piece standing there can really make it, so the engine decides, not a list of piece names.
    const bend = ax > 0 && ay > 0 && ax !== ay && gcd(ax, ay) === 1 && (Math.min(ax, ay) === 1 && Math.max(ax, ay) === 2 || canGo(a));
    const hl = cs * 0.42, hw = cs * 0.27, sw = cs * 0.16;
    let pts;
    if (bend) { const corner = ax > ay ? { x: q.cx, y: p.cy } : { x: p.cx, y: q.cy }; pts = [{ x: p.cx, y: p.cy }, corner, { x: q.cx, y: q.cy }]; }
    else pts = [{ x: p.cx, y: p.cy }, { x: q.cx, y: q.cy }];
    const n = pts.length, last = pts[n - 1], prev = pts[n - 2], ll = Math.hypot(last.x - prev.x, last.y - prev.y), ux = (last.x - prev.x) / ll, uy = (last.y - prev.y) / ll;
    const f0 = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y), vx = (pts[1].x - pts[0].x) / f0, vy = (pts[1].y - pts[0].y) / f0;
    const start = { x: pts[0].x + vx * cs * 0.18, y: pts[0].y + vy * cs * 0.18 }, tip = { x: last.x - ux * cs * 0.08, y: last.y - uy * cs * 0.08 }, base = { x: tip.x - ux * hl, y: tip.y - uy * hl };
    const path = [start].concat(pts.slice(1, -1), [{ x: base.x + ux * 2, y: base.y + uy * 2 }]).map((z, i) => (i ? 'L' : 'M') + z.x + ' ' + z.y).join(' ');
    add('path', Object.assign({ d: path, fill: 'none', stroke: col, 'stroke-width': sw, 'stroke-linecap': dash ? 'butt' : 'round', 'stroke-linejoin': 'round', opacity: op }, dash ? { 'stroke-dasharray': (dash[0] * cs) + ' ' + (dash[1] * cs) } : {}));
    add('polygon', { points: tip.x + ',' + tip.y + ' ' + (base.x - uy * hw) + ',' + (base.y + ux * hw) + ' ' + (base.x + uy * hw) + ',' + (base.y - ux * hw), fill: col, opacity: op });
  };
  if (preQ.length) {
    const prj = preProject(), layer = document.createElement('div'); layer.className = 'prelayer'; layer.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:6';
    prj.gone.forEach(k => { if (prj.vir.has(k)) return; const sq = boardSq(...k.split(',')), sp = sq && sq.querySelector(':scope > span[data-pc]'); if (sp) { sp.style.opacity = '.3'; sp.dataset.predim = '1'; } });
    prj.vir.forEach((node, k) => {
      const sq = boardSq(...k.split(',')); if (!sq) return;
      const d = document.createElement('div'); d.className = 'sq preghost'; d.dataset.k = k;
      d.style.cssText = 'position:absolute;left:' + sq.offsetLeft + 'px;top:' + sq.offsetTop + 'px;width:' + sq.offsetWidth + 'px;height:' + sq.offsetHeight + 'px;font-size:' + getComputedStyle(sq).fontSize + ';background:none;overflow:visible;opacity:.75;pointer-events:none;cursor:default;clip-path:none';
      d.appendChild(node.cloneNode(true)); layer.appendChild(d);
    });
    board.appendChild(layer);
    preQ.forEach(q => { rect(q.fx, q.fy, 'rgba(232,115,28,.45)'); rect(q.tx, q.ty, 'rgba(232,115,28,.45)'); });
    preQ.forEach((q, i) => {
      arrow({ fx: q.fx, fy: q.fy, tx: q.tx, ty: q.ty }, '#e8731c', .8);
      if (preQ.length > 1) { const g = geo(q.tx, q.ty); if (g) { const t = add('text', { x: g.l + g.w * 0.8, y: g.t + g.h * 0.28, 'font-size': g.h * 0.28, 'font-weight': 700, fill: '#fff', stroke: '#7a3a08', 'stroke-width': g.h * 0.03, 'text-anchor': 'middle' }); t.textContent = i + 1; } }
    });
  }
  circles.forEach(c => { const g = geo(c.x, c.y); if (g) add('circle', { cx: g.cx, cy: g.cy, r: (g.w + g.h) / 4 * 0.9, fill: 'none', stroke: OV_COL[c.c], 'stroke-width': (g.w + g.h) / 2 * 0.07, opacity: .85 }); });
  arrows.forEach(a => arrow(a, OV_COL[a.c], .82));
  pingList.forEach(pg => {
    const col = pingColor(pg);
    if (pg.mark) { const g = geo(pg.sx, pg.sy); if (g) { const r = (g.w + g.h) / 4; add('circle', { cx: g.cx, cy: g.cy, r: r * 1.02, fill: 'none', stroke: col, 'stroke-width': r * 0.2, opacity: .95 }); add('circle', { cx: g.cx, cy: g.cy, r: r * 0.6, fill: col, opacity: .3 }); } return; }
    const opp = !sameTeam(pg.owner, pg.from); arrow({ fx: pg.sx, fy: pg.sy, tx: pg.tx, ty: pg.ty }, col, .92, opp ? [0.09, 0.13] : [0.3, 0.17]);
  });      // dashed: a suggestion; dotted: what you expect an opponent to do
  if (pingPrev) arrow(pingPrev, seatCol(pingPrev.from), .55, pingPrev.opp ? [0.09, 0.13] : [0.3, 0.17]);
  if (prev) { if (prev.fx === prev.tx && prev.fy === prev.ty) { const g = geo(prev.fx, prev.fy); if (g) add('circle', { cx: g.cx, cy: g.cy, r: (g.w + g.h) / 4 * 0.9, fill: 'none', stroke: OV_COL[prev.c], 'stroke-width': (g.w + g.h) / 2 * 0.07, opacity: .5 }); } else arrow(prev, OV_COL[prev.c], .5); }
  board.appendChild(svg);
}
const ovCol = e => e.shiftKey ? 'r' : e.altKey ? 'y' : 'g';
$('board').addEventListener('mousedown', e => {
  if (e.button !== 2 || e.ctrlKey || e.metaKey || !game || $('game').classList.contains('hidden')) return;
  const c = cellXY(e); if (c) { rcA = { x: c.x, y: c.y, c: ovCol(e) }; arrowPrev = { fx: c.x, fy: c.y, tx: c.x, ty: c.y, c: rcA.c }; drawOverlay(); }
});
document.addEventListener('mousemove', e => {
  if (rcSrc && game && game.multi) {                         // Ctrl + right-drag: show the suggestion while it is being drawn
    const el = document.elementFromPoint(e.clientX, e.clientY), c = el && el.closest ? cellXY({ target: el }) : null, p = game.at(rcSrc.x, rcSrc.y);
    const np = c && p && canPing(p.c) && !(c.x === rcSrc.x && c.y === rcSrc.y) ? { fx: rcSrc.x, fy: rcSrc.y, tx: c.x, ty: c.y, from: mySeat, opp: !sameTeam(p.c, mySeat) } : null;
    if ((np && (!pingPrev || pingPrev.tx !== np.tx || pingPrev.ty !== np.ty)) || (!np && pingPrev)) { pingPrev = np; drawOverlay(); }
  }
  if (!rcA) return;
  const el = document.elementFromPoint(e.clientX, e.clientY), c = el && el.closest ? cellXY({ target: el }) : null;
  if (c && (!arrowPrev || arrowPrev.tx !== c.x || arrowPrev.ty !== c.y)) { arrowPrev = { fx: rcA.x, fy: rcA.y, tx: c.x, ty: c.y, c: rcA.c }; drawOverlay(); }
});
document.addEventListener('mouseup', e => {
  if (e.button !== 2 || !rcA) return;
  const a = rcA; rcA = null; arrowPrev = null;
  const el = document.elementFromPoint(e.clientX, e.clientY), d = el && el.closest ? cellXY({ target: el }) : null;
  if (d && game) {
    if (d.x === a.x && d.y === a.y) {
      const i = circles.findIndex(c => c.x === d.x && c.y === d.y), ends = q => (q.fx === d.x && q.fy === d.y) || (q.tx === d.x && q.ty === d.y);
      if (i >= 0 && circles[i].c === a.c) circles.splice(i, 1); else if (i >= 0) circles[i].c = a.c;
      else if (arrows.some(ends)) arrows = arrows.filter(q => !ends(q));      // right-click an end of an arrow to remove it
      else circles.push({ x: d.x, y: d.y, c: a.c });
    } else {
      const i = arrows.findIndex(q => q.fx === a.x && q.fy === a.y && q.tx === d.x && q.ty === d.y);
      if (i >= 0 && arrows[i].c === a.c) arrows.splice(i, 1); else if (i >= 0) arrows[i].c = a.c; else arrows.push({ fx: a.x, fy: a.y, tx: d.x, ty: d.y, c: a.c });
    }
  }
  drawOverlay();
});
$('boardWrap').addEventListener('pointerdown', e => { if (e.button === 0 && (arrows.length || circles.length)) { arrows = []; circles = []; drawOverlay(); } }, true);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && game && (arrows.length || circles.length || preQ.length || (game.multi && pings.some(q => q.from === mySeat)))) { arrows = []; circles = []; preQ = []; if (game.multi && pings.some(q => q.from === mySeat)) clearMyPings(null); else drawOverlay(); } });
function removePremove(i) {                                  // drop one premove, and the later ones that were chained onto its piece
  const dead = new Set([preQ[i].tx + ',' + preQ[i].ty]);
  preQ = preQ.filter((q, j) => { if (j < i) return true; if (j === i) return false; const f = q.fx + ',' + q.fy; if (dead.has(f)) { dead.add(q.tx + ',' + q.ty); return false; } return true; });
  drawOverlay();
}
$('boardWrap').addEventListener('click', e => {             // click a queued premove to remove it; Ctrl + click anywhere else removes them all
  if (!preQ.length) return;
  const sq = e.target.closest ? e.target.closest('#board .sq[data-x]') : null; if (!sq) return;
  const x = +sq.dataset.x, y = +sq.dataset.y, hit = preQ.findIndex(q => (q.fx === x && q.fy === y) || (q.tx === x && q.ty === y));
  if (hit >= 0) { removePremove(hit); e.stopPropagation(); e.preventDefault(); }
  else if (e.ctrlKey || e.metaKey) { preQ = []; drawOverlay(); e.stopPropagation(); e.preventDefault(); }
}, true);

function preToast(msg) { addChat('', msg, 'minor'); }
function preRun() {                                          // when your turn comes, the first queued premove is played if it is still legal; otherwise the whole queue is dropped
  if (!preQ.length || preBusy) return;
  if (game && game.reward && game.reward()) return;
  if (!game || game !== preGame || ended() || replay || draft || spectating || !preOn()) { preQ = []; drawOverlay(); return; }
  const q = preQ[0], p = game.at(q.fx, q.fy);
  if (!p || !(game.multi ? p.c === mySeat : p.c === myColor)) { preQ = []; drawOverlay(); preToast('Premove cancelled: that piece was taken or has moved.'); return; }
  if (!isMyTurn()) return;
  preQ.shift(); preBusy = true; drawOverlay();
  const g = game;
  setTimeout(() => {                                         // a beat after the last move, so you still see it
    preBusy = false;
    if (game !== g || !isMyTurn() || ended() || replay || draft) return;
    const t = game.at(q.tx, q.ty); let c = [];
    if (!(t && (game.multi ? t.c === mySeat : t.c === myColor))) { try { c = game.moves(q.fx, q.fy).filter(m => m.tx === q.tx && m.ty === q.ty && !m.inplace); } catch (e) { c = []; } }
    if (!c.length) { preQ = []; drawOverlay(); preToast('Premove cancelled: it was not legal when your turn came.'); return; }
    const q2 = q.promo ? c.find(z => z.promo === q.promo) : null;
    if (!q2 && c.length > 1 && c.every(z => z.promo)) { sel = null; const seen2 = new Set(); showPromo(c.filter(z => !seen2.has(z.promo) && seen2.add(z.promo)).map(withCk), m2 => (game.multi ? playMulti : play)(m2)); return; }      // several promotion choices and none was picked when it was queued (a chain of premoves, or an engine that cannot preview): ask now, never guess
    const m = q2 || c[0];
    sel = null; (game.multi ? playMulti : play)(withCk(m));
  }, 140);
}

/* ============ CLOCKS (optional, set by the host in Game options) ============
   The host owns the clock: whenever the turn changes it re-sends everybody's remaining time, and every screen just counts down locally in between.
   Bots never use time. Running out of time is handled exactly like resigning (so "fallen armies" and friends apply). */
var clk = null, clkGame = null, tcAllowed = false, timedOut = new Set();
const clkOk = v => !!MODES[v] && !AUST_CFG[v] && !MODES[v].bug && !MODES[v].match && !MODES[v].match4;
const TC_DUO = [['1+0', 'Bullet 1+0'], ['3+2', 'Blitz 3+2'], ['5+0', 'Blitz 5+0'], ['10+0', 'Rapid 10+0'], ['15+10', 'Rapid 15+10']];
const TC_MULTI = [['3+3', 'Fast 3+3'], ['5+5', 'Quick 5+5'], ['10+5', 'Standard 10+5'], ['15+10', 'Long 15+10']];
const TC_MODES = { duo: ['standard', 'crazyhouse', 'marseillais', 'cylinder', 'kriegspiel', 'alice', 'promotion'], multi: ['fourplayer', 'fourmars', 'fourcrazy', 'fourcyl', 'fourkrieg'] };
let tcFor = null;
function fillClockSel(v) {                                   // presets for the classic-like modes, a custom time for all of them
  if (tcFor === v) return; tcFor = v;
  const sel = $('tcSel'), keep = sel.value, list = TC_MODES.duo.includes(v) ? TC_DUO : TC_MODES.multi.includes(v) ? TC_MULTI : [];
  sel.innerHTML = ''; sel.add(new Option('No clock', '')); list.forEach(([k, n]) => sel.add(new Option(n, k))); sel.add(new Option('Custom…', 'custom'));
  sel.value = [...sel.options].some(o => o.value === keep) ? keep : ''; $('tcCustom').classList.toggle('hidden', sel.value !== 'custom');
}
$('tcSel').onchange = () => $('tcCustom').classList.toggle('hidden', $('tcSel').value !== 'custom');
function tcRead() {
  if (!tcAllowed) return { tcMin: 0, tcInc: 0 };
  const v = $('tcSel').value; if (!v) return { tcMin: 0, tcInc: 0 };
  if (v === 'custom') return { tcMin: Math.max(0, +$('tcMin').value || 0), tcInc: Math.max(0, Math.min(60, +$('tcInc').value || 0)) };
  const p = v.split('+').map(Number); return { tcMin: p[0], tcInc: p[1] };
}
const clkBot = id => game.multi ? !!bots[id] : (!!bots2p && id !== myColor);
function clkInit() {
  clk = null;
  if (!game || !(gs.tcMin > 0) || !clkOk(mode)) return;
  const base = gs.tcMin * 60000, t = {}; (game.multi ? game.seats : ['w', 'b']).forEach(id => { t[id] = base; });
  clk = { inc: (gs.tcInc || 0) * 1000, t, turn: game.turn, run: false, at: performance.now(), len: game.history().length, over: false };
}
function clkEnsure() { if (game !== clkGame) { clkGame = game; clkInit(); } }
const clkNow = id => !clk || clk.t[id] === undefined ? 0 : (clk.run && clk.turn === id ? Math.max(0, clk.t[id] - (performance.now() - clk.at)) : clk.t[id]);
function clkSnap() { if (!clk) return undefined; const t = {}; for (const id in clk.t) t[id] = Math.round(clkNow(id)); return { t, turn: clk.turn, run: clk.run }; }
function clkApplySnap(sn) { clkEnsure(); if (!clk || !sn || !sn.t) return; clk.t = sn.t; clk.turn = sn.turn; clk.run = !!sn.run; clk.at = performance.now(); clk.len = game ? game.history().length : 0; }
const clkShouldRun = () => !!clk && !!game && !draft && !ended() && clk.t[game.turn] !== undefined && !clkBot(game.turn) && !(game.multi && (game.neutralPending || !game.alive(game.turn)));
function clkSend() { const msg = { type: 'clock', t: clk.t, turn: clk.turn, run: clk.run }; if (game.multi) broadcast(msg); else { send(msg); sendSpecs(msg); } }
function clkSync() {                                          // host only: the turn changed, so settle the books and tell everyone
  if (!clk || !isHost || !game || replay) return;
  const n = game.history().length, now = performance.now(), run = clkShouldRun(), ov = !!ended();
  if (n === clk.len && game.turn === clk.turn && run === clk.run && ov === clk.over) return;
  const prev = clk.turn, wasRun = clk.run;
  if (wasRun && clk.t[prev] !== undefined) clk.t[prev] = Math.max(0, clk.t[prev] - (now - clk.at));
  if (wasRun && n > clk.len && game.turn !== prev && !ov && clk.t[prev] > 0) clk.t[prev] += clk.inc;
  clk.turn = game.turn; clk.len = n; clk.at = now; clk.run = run; clk.over = ov;
  clkSend();
}
function clkFlag(id) {                                        // the host saw this player's time run out
  if (!clk || !game || ended()) return;
  clk.t[id] = 0; clk.run = false;
  if (game.multi) { if (!game.alive(id)) return; timedOut.add(id); logResign(id); game.resign(id); broadcast({ type: 'mtimeout', seat: id }); announceMulti(); }
  else { over = (id === 'w' ? 'White' : 'Black') + ' ran out of time.'; overRes = id === 'w' ? 'b' : 'w'; send({ type: 'timeout', color: id }); sendSpecs({ type: 'timeout', color: id }); }
  render();
}
function clkFmt(ms) {
  ms = Math.max(0, ms);
  if (ms < 10000) return Math.floor(ms / 1000) + '.' + Math.floor((ms % 1000) / 100);
  const sec = Math.ceil(ms / 1000); return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
}
function clkRender() {
  const top = $('clkTopRow'), bot = $('clkBotRow');
  $('gameMain').classList.toggle('hasclk2', !!clk && !!game && !game.multi);
  if (!clk || !game) { top.classList.add('hidden'); bot.classList.add('hidden'); return; }
  if (game.multi) {
    top.classList.add('hidden'); bot.classList.add('hidden');
    document.querySelectorAll('#turnStrip .tclk').forEach(e => { const id = e.dataset.id, ms = clkNow(id); e.textContent = clkFmt(ms); e.classList.toggle('low', ms > 0 && ms < 30000); e.classList.toggle('out', ms <= 0); });
    return;
  }
  const row = (el, id, label) => {
    const ms = clkNow(id), on = clk.run && clk.turn === id && !ended();
    el.innerHTML = '<span class="clkp' + (on ? ' on' : '') + (ms > 0 && ms < 30000 ? ' low' : '') + (ms <= 0 ? ' out' : '') + '"><b>' + label + '</b>' + clkFmt(ms) + '</span>';
    el.classList.remove('hidden');
  };
  const me = myColor, opp = me === 'w' ? 'b' : 'w', nm = c => c === 'w' ? 'White' : 'Black';
  row(bot, me, nm(me) + (spectating ? '' : ' (you)'));
  if (bots2p) top.classList.add('hidden'); else row(top, opp, nm(opp));
}
setInterval(() => {
  clkEnsure(); if (!clk) { clkRender(); return; }
  clkRender();
  if (isHost && game && !replay && clk.run) { const id = clk.turn; if (clkNow(id) <= 0) clkFlag(id); }
}, 200);

const baseTitle = document.title;
document.addEventListener('pointerdown', () => {
  try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); if (audioCtx.state === 'suspended') audioCtx.resume(); } catch (e) { /* no audio */ }
}, { passive: true });
function softChime() {
  if (!$('soundChk').checked || !$('chimeChk').checked || !audioCtx) return;
  try {
    const t0 = audioCtx.currentTime;
    [[523.25, 0], [659.25, 0.14]].forEach(([f, d]) => {            // two short, quiet sine notes
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0 + d);
      g.gain.exponentialRampToValueAtTime(0.035, t0 + d + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.3);
      o.connect(g); g.connect(sndOut()); o.start(t0 + d); o.stop(t0 + d + 0.32);
    });
  } catch (e) { /* ignore */ }
}
function stopFlash() { if (flashTimer) { clearInterval(flashTimer); flashTimer = null; } document.title = baseTitle; }
function startFlash() {
  if (flashTimer) return;
  let on = false;
  flashTimer = setInterval(() => { on = !on; document.title = on ? '🔔 Your turn!' : baseTitle; }, 1000);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) stopFlash(); });
window.addEventListener('focus', stopFlash);
function myTurnNow() {
  if (!game || spectating || replay || draft || M || ended()) return false;
  if (game.bug) return game.canMove(mySeat);
  if (game.multi) return game.alive(mySeat) && game.turn === mySeat && !game.neutralPending;
  return game.turn === myColor;
}
function notifyTurn() {
  const mine = myTurnNow();
  if (mine && !lastMyTurn && game.history().length > 0) { softChime(); if ((document.hidden || !document.hasFocus()) && $('chimeChk').checked) startFlash(); }
  lastMyTurn = mine;
}

