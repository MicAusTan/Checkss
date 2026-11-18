// ================= class traits: draft, reveal =================
const TRAIT = id => Engine.TRAITS[id];
const meId = () => (game.multi ? mySeat : myColor);
const partIds = () => (game.multi ? game.seats : ['w', 'b']);
const whoName = c => (game.multi ? CN[c] : c === 'w' ? 'White' : 'Black');
const traitLine = (who, id) => who + ' used their trait: ' + TRAIT(id).name + '. ' + TRAIT(id).desc;
const bcast = m => (game.multi ? broadcast(m) : send(m));

const CLS = id => Engine.CLASSES[id];
const DINFO = (kind, id) => (kind === 'class' ? CLS(id) : TRAIT(id));
const eligibleTraits = () => Object.keys(Engine.TRAITS).filter(id => { const t = TRAIT(id); return !(t.multi && !game.multi) && !(t.fog && !gs.fog) && !(t.noAlice && game.layers > 1) && !(t.multi && (game.layers > 1 || game.bug)) && !(t.noBug && game.bug) && !(t.only2p && game.multi) && !(t.noDrops && game.dropMode) && !t.team; });      // (team traits are not dealt in the random draft)      // (layers > 1 = Alice; game.bug = Bughouse: no elimination traits there)
const eligibleFor = (kind, all) => (kind === 'class' ? Object.keys(Engine.CLASSES).filter(id => all || !Engine.CLASSES[id].secret) : eligibleTraits());      // all = include secret classes (host's secret picker)
const needDraft = () => !!((gs.traits && !gtraits) || (gs.classes && !gclasses));
function rollOffers(kind) {
  const pool = eligibleFor(kind);
  if (kind === 'class' && gs.clFree) return pool;
  const out = [], n = Math.min(kind === 'class' ? 3 : (+gs.offers || 4), pool.length);
  while (out.length < n) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  return out;
}
function beginDraft(kind) {                                   // host only; traits first (if on), then classes (if on)
  kind = kind || ((gs.traits && !gtraits) ? 'trait' : 'class');
  const offers = {};
  partIds().forEach(p => { offers[p] = rollOffers(kind); });
  draft = { kind, offers, picks: {}, mine: offers[meId()], picked: null };
  partIds().forEach(pid => { if (isBotId(pid)) { const ok = offers[pid].filter(id => kind !== 'class' || !CLS(id).secret); draft.picks[pid] = ok[Math.floor(Math.random() * ok.length)]; } });      // (bots are never dealt a secret class)
  if (game.multi) conns.forEach(c => { if (!bots[c.seat]) c.send({ type: 'draft', kind, offers: offers[c.seat] }); });
  else if (!bots2p) send({ type: 'draft', kind, offers: offers[myColor === 'w' ? 'b' : 'w'] });
  render();
}
function choosePick(id) {
  if (!draft || draft.picked || !draft.mine || !(draft.mine.includes(id) || (isHost && draft.cheat))) return;
  draft.picked = id;
  if (isHost) { draft.picks[meId()] = id; checkDraft(); } else send({ type: 'pick', id });
  render();
}
function recvPick(who, id) {
  if (!draft || !draft.offers || !draft.offers[who] || !draft.offers[who].includes(id) || draft.picks[who]) return;
  draft.picks[who] = id; checkDraft();
}
function autoPickRest() {
  if (!draft || !draft.offers) return;
  partIds().forEach(p => { if (!draft.picks[p]) { const o = draft.offers[p].filter(id => !(draft.kind === 'class' && isBotId(p) && CLS(id).secret)); draft.picks[p] = o[Math.floor(Math.random() * o.length)]; } });
  if (draft.offers[meId()] && !draft.picked) draft.picked = draft.picks[meId()];
  checkDraft();
}
function checkDraft() {
  if (!draft || !draft.offers) return;
  if (!partIds().every(p => draft.picks[p])) { render(); return; }
  const map = draft.picks, kind = draft.kind || 'trait';
  draft = null;
  if (kind === 'trait') { pendTraits = map; if (gs.classes) { beginDraft('class'); return; } }
  const traits = kind === 'trait' ? map : (pendTraits || null), classes = kind === 'class' ? map : null;
  pendTraits = null;
  newGame(mode, null, { gs, seats: mseats, traits, classes });
  bcast({ type: 'traits', traits, classes, seats: mseats, gs, mode });
  announceTraitStart(); render();
}
const isMate = pid => !!(game.teams && game.teams[pid] === game.teams[meId()]);
function announceClassStart() {
  const me = meId();
  const mine = spectating ? null : gclasses[me];
  if (mine) addChat('', 'Your class: ' + CLS(mine).name + '. ' + CLS(mine).desc + ' Passive: ' + CLS(mine).passive.desc, true);
  partIds().forEach(pid => {
    if (pid === me && !spectating) return;
    if (gclasses[pid] && (spectating || !gs.clHide || isMate(pid))) addChat('', whoName(pid) + ' is a ' + CLS(gclasses[pid]).name + '.', true);
  });
}
function announceTraitStart() {
  if (game && gclasses) announceClassStart();
  if (!gtraits || !game) return;
  if (gs.trShow) { partIds().forEach(pid => { if (gtraits[pid]) addChat('', whoName(pid) + ' has the trait ' + TRAIT(gtraits[pid]).name + '. ' + TRAIT(gtraits[pid]).desc, true); }); return; }      // host option: all traits are public
  const mine = gtraits[meId()];
  if (mine) addChat('', 'Your trait (only you can see this): ' + TRAIT(mine).name + '. ' + TRAIT(mine).desc, true);
  if (game.teams && mine) partIds().forEach(pid => { if (pid !== meId() && game.teams[pid] === game.teams[meId()] && gtraits[pid]) addChat('', "Your teammate " + whoName(pid) + "'s trait: " + TRAIT(gtraits[pid]).name + '. ' + TRAIT(gtraits[pid]).desc, true); });
}
// ---- class abilities: points bar, targeting, announcements ----
const fxSeen = by => !gs.clHideFx || spectating || replay || ended() || by === meId() || isMate(by);      // protection glows can be hidden from opponents (host option)
const maskSeen = p => !(p.fx && p.fx.msk) || p.c === meId() || isMate(p.c) || ended();      // Missing Textures: only the owner's team (or everyone after the game) sees the real piece
const shownType = p => (p.fx && p.fx.msk && !maskSeen(p) ? p.fx.msk : (p.t === 'k' && gtraits && gtraits[p.c] === 'royalQueen' ? 'q' : p.t));      // (Royal Queen: the royal piece is drawn as a queen)
function foeClick(x, y) {                      // clicking an enemy piece (with nothing selected) previews where it can move
  if (!gs.foeMoves || !game || !game.reach || sel) { if (foeSel) { foeSel = null; render(); } return false; }
  const p = game.at(x, y);
  if (p && !p.wall && (p.c !== meId() || !isMyTurn())) { foeSel = foeSel && foeSel.x === x && foeSel.y === y ? null : { x, y, h: game.history().length }; render(); return true; }
  if (foeSel) { foeSel = null; render(); }
  return false;
}
const fxClass = p => (p.fx && p.fx.msk && maskSeen(p) ? ' fx-msk' : '') + (p.wall ? ' fx-wall' : '') + (p.fx ? (p.fx.frz ? ' fx-frz' : '') + (p.fx.dis ? ' fx-dis' : '') + (p.fx.jmp ? ' fx-jmp' : '') + (p.fx.shd && fxSeen(p.fx.shd) ? ' fx-shd' : '') + (p.fx.sct && fxSeen(p.fx.sct) ? ' fx-sct' : '') + (p.fx.phn ? ' fx-phn' : '') + (p.fx.dcy ? ' fx-dcy' : '') : '');
function markClip(d, x, y, visible) {              // Clipping: dashed outline on a clipped square, badge with the number of overlapping pieces
  const z = clipMap && clipMap[x + ',' + y];
  if (!z || !visible) return;
  d.classList.add('clip'); d.title = 'Clipped square' + (z.n ? ' (' + (z.n + 1) + ' pieces overlap)' : ' (' + z.ttl + ' turn' + (z.ttl === 1 ? '' : 's') + ' left)');
  if (z.n) { const b = document.createElement('b'); b.className = 'stk'; b.textContent = '×' + (z.n + 1); d.appendChild(b); }
}
function abValidate() {                          // drops a stale ability selection and computes the highlighted target squares
  abSet = null;
  mineSet = null; foeSet = null; rmarkSet = null; metSet = null; clipMap = null;
  rngSet = null; rngF = false; rewSet = null;
  if (rewardMine() && rewardPick) { rewSet = new Set(game.rewardFor(rewardPick).map(q => q.x + ',' + q.y)); }
  if (game && game.clips) { const cz = game.clips(); if (cz.length) { clipMap = {}; cz.forEach(z => { clipMap[z.x + ',' + z.y] = z; }); } }
  if (game && game.meteors) { const mt = game.meteors(); if (mt.length) { metSet = new Set(); mt.forEach(m => { for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) metSet.add((m.x + dx) + ',' + (m.y + dy)); }); } }      // pending Meteor areas
  if (game && game.markers) { const mk = game.markers(); if (mk.length) rmarkSet = new Set(mk.map(m => m.x + ',' + m.y)); }
  if (foeSel && game && game.reach && gs.foeMoves) {
    const fp = game.at(foeSel.x, foeSel.y);
    if (!fp || foeSel.h !== game.history().length) foeSel = null;
    else foeSet = new Map(game.reach(foeSel.x, foeSel.y, fp.fx && fp.fx.msk && !maskSeen(fp) ? fp.fx.msk : null).map(m => [m.tx + ',' + m.ty, !!game.at(m.tx, m.ty)]));      // (a masked piece shows the moves of its fake icon)
  } else foeSel = null;
  { const rs = sel && sel.drop === undefined && isMyTurn() ? sel : foeSel;                       // a shooter that is selected (or an enemy one being previewed) also shows its range
    if (rs && game && game.range && game.at(rs.x, rs.y) && !(rs === foeSel && game.at(rs.x, rs.y).fx && game.at(rs.x, rs.y).fx.msk && !maskSeen(game.at(rs.x, rs.y)))) {      // (a masked enemy piece never reveals its real shooting range)
    try { const lst = game.range(rs.x, rs.y); if (lst.length) { rngSet = new Set(lst.map(m => m.tx + ',' + m.ty)); rngF = rs === foeSel; } } catch (e) { rngSet = null; } } }
  if (game && game.mines) { const all = spectating || replay || ended(), arr = game.mines(all ? null : meId()); if (arr.length) mineSet = new Set(arr.map(m => m.x + ',' + m.y)); }
  chargeSq = game && game.chargeOf && !spectating && !replay && !draft ? (game.chargeOf(meId()) || (game.overrunOf ? game.overrunOf(meId()) : null)) : null;
  if (!abMode) { abFrom = null; return; }
  const ab = game && game.abilities && !spectating && !replay && !draft && !M && !ended() ? game.abilities(meId()).find(a => a.id === abMode) : null;
  if (!ab || ab.why) { abMode = null; abFrom = null; return; }
  const t = game.abTargets(meId(), abMode, abFrom || undefined);
  if (!t.length) { abFrom = null; abMode = null; return; }
  abSet = new Set(t.map(q => q.x + ',' + q.y));
}
function abClick(x, y) {
  const id = abMode;
  if (!abSet || !abSet.has(x + ',' + y)) { abMode = null; abFrom = null; sel = null; render(); return; }      // clicking elsewhere cancels
  if (game.abSteps(meId(), id) === 2 && !abFrom) { abFrom = { x, y }; sel = null; render(); return; }      // first click of a two-click ability
  const m = { ab: id, c: meId(), tx: x, ty: y };
  if (abFrom) { m.fx = abFrom.x; m.fy = abFrom.y; }
  abMode = null; abFrom = null; sel = null;
  play(m);
}
function announceAbilities() {
  if (!game || !game.abLog || replay) return;
  if (game.meteorLog) { const ml2 = game.meteorLog(); if (abSeenG === game) while (meteorSeen < ml2.length) { const e = ml2[meteorSeen++]; addChat('', 'Meteor! The strike on ' + sqName(e.x, e.y) + ' destroyed ' + e.n + ' piece' + (e.n === 1 ? '' : 's') + '.', 'event'); } else meteorSeen = ml2.length; }
  if (game.glitches) { const gl = game.glitches(); if (abSeenG === game) while (glitchSeen < gl.length) { const e = gl[glitchSeen++]; addChat('', e.kind === 'dup' ? 'Glitch! ' + whoName(e.c) + ' has a duplicated pawn on ' + sqName(e.x, e.y) + '.' : 'Restore Point: ' + whoName(e.c) + '\'s captured piece is back on ' + sqName(e.x, e.y) + '.', true); } else glitchSeen = gl.length; }
  if (game.mirages) { const ml2 = game.mirages(); if (abSeenG === game) while (mirageSeen < ml2.length) { const e = ml2[mirageSeen++]; addChat('', 'Mirage! ' + whoName(e.c) + ' was about to be checkmated, but that king was a decoy: the real king appears on ' + sqName(e.tx, e.ty) + '.', true); } else mirageSeen = ml2.length; }
  const log = game.abLog();
  if (abSeenG !== game) { abSeenG = game; abSeen = log.length; return; }      // loading a game/record: don't re-announce the past
  while (abSeen < log.length) {
    if (log[abSeen].ab === 'pick') { abSeen++; continue; }      // (Clipping: which stack member moves is not worth announcing)
    const e = log[abSeen++], k = CLS(game.cls[e.c]), a = e.ab === 'stop' ? { name: 'End Overrun' } : k.abilities.find(q => q.id === e.ab);
    const hide = gs.clHide && !spectating && e.c !== meId() && !isMate(e.c);
    const foeCast = !spectating && e.c !== meId() && !isMate(e.c), noWhere = foeCast && (e.ab === 'mine' || (gs.clHideFx && (e.ab === 'shield' || e.ab === 'sanctuary')));
    addChat('', whoName(e.c) + (hide ? '' : ' (' + k.name + ')') + ' used ' + a.name + (noWhere ? '' : e.fx != null ? ' from ' + sqName(e.fx, e.fy) + ' to ' + sqName(e.tx, e.ty) : e.tx != null ? ' at ' + sqName(e.tx, e.ty) : '') + '.', true);
  }
}
function specStatus() {
  if (ended()) return 'Spectating: ' + $('status').textContent.replace(/\s*\(you are [^)]*\)/, '');
  if (!game) return 'Spectating';
  if (game.bug) return 'Spectating: both boards are in play';
  return 'Spectating: ' + (game.multi ? CN[game.turn] : game.turn === 'w' ? 'White' : 'Black') + ' to move';
}
let promoHint = false;                           // Imperial: an original Rook/Bishop/Knight is selected -> tint the zone where it would become a Grand piece
function render() {
  teamLook(game ? game.teams : (A4 && A4.teams));
  promoHint = !!(game && game.imperial && game.inPromo && sel && !sel.drop && !replay && !spectating && (p => p && !p.dead && (p.o || 'pvm'.includes(p.t)) && 'rbnpvm'.includes(p.t) && p.c === meId())(game.at(sel.x, sel.y)));
  animBefore();
  renderCore();
  syncChrome();
  animAfter();
  renderDraft();
  renderClassBar(); renderTraitBar(); renderStackPick(); announceAbilities(); tidyHost();
  notifyTurn(); moveSounds();
  updateMoveList();
  scheduleBot();
  const canSwapNow = swapEligible();
  $('swapBtn').classList.toggle('hidden', !canSwapNow);
  if (!canSwapNow) { swapMode = false; swapFirst = null; }
  else $('swapBtn').textContent = swapMode ? 'Cancel swap' : 'Swap two pieces';
  if (!sel) pendingFriendly = null;
  if (pendingFriendly) $('status').textContent = 'Friendly Fire: click that piece again to capture your own piece, or choose something else.';
  if (abMode) { const ab = game.abilities(meId()).find(a => a.id === abMode); $('status').textContent = (ab ? ab.name : 'Ability') + (abFrom ? ': now click the destination/target square' : (ab && ab.steps === 2 ? ': first click the piece to use' : ': click a highlighted square')) + ' (click anywhere else to cancel).'; }
  if (game && !abMode && !replay && !spectating && game.overrunOf && game.overrunOf(meId()) && game.turn === meId() && !ended()) $('status').textContent = 'Overrun! Keep capturing with the marked piece' + (game.overrunOf(meId()).n ? ' or press End Overrun.' : '.');
  else if (!abMode && chargeSq && game.turn === meId() && !ended()) $('status').textContent = 'Charge! Move the marked piece' + (chargeSq.stage === 2 ? ' again (its second move).' : '.');
  if (swapMode) $('status').textContent = 'Swap: ' + (swapFirst ? 'now pick the second piece (first: ' + sqName(swapFirst.x, swapFirst.y) + ')' : 'pick the first of your two pieces') + '. Not kings or pawns. Once per game.';
  $('endRoundBtn').classList.toggle('hidden', !(isHost && M && M.phase === 'play' && !ended()));
  $('botTakeBtn').classList.toggle('hidden', !(isHost && game && game.multi && !game.bug));
  const botNow = botSeatToMove();
  if (botNow && !swapMode) $('status').textContent += ' · ' + (game.multi ? CN[botNow] : 'the bot') + ' (bot) is thinking…';
  document.body.classList.toggle('spec', spectating);
  if (spectating) $('status').textContent = specStatus();
  if (replay) {
    $('replayBar').classList.remove('hidden');
    $('rpSlider').max = replay.total; $('rpSlider').value = replay.ply;
    $('rpLabel').textContent = 'Move ' + replay.ply + ' / ' + replay.total;
    $('status').textContent = 'Replay: move ' + replay.ply + ' of ' + replay.total + (replay.queue.length ? ' (new moves are waiting)' : '');
    $('replayBtn').classList.add('hidden');
    return;
  }
  $('replayBar').classList.add('hidden');
  $('replayBtn').classList.toggle('hidden', !canReplay());
  if (game && !game.multi && game.drainEvents) game.drainEvents();      // trait events are not announced
  if (game && gclasses && !draft && !replay && ended() && !revealedCl) {
    revealedCl = true;
    addChat('', 'Classes this game: ' + partIds().map(p => whoName(p) + ': ' + CLS(gclasses[p]).name).join(', ') + '.', true);
  }
  if (game && gtraits && !draft && !replay) {
    const mine = spectating ? null : gtraits[meId()];
    if (ended() && !revealedAll) {
      revealedAll = true;
      addChat('', 'Traits this game: ' + partIds().map(p => whoName(p) + ': ' + TRAIT(gtraits[p]).name).join(', ') + '.', true);
    }
  }
}

function renderCore() {
  layoutGame();
  $('handBot').classList.remove('picker');
  $('rulesBox').classList.toggle('hidden', !MODES[mode].imperial); if (MODES[mode].imperial) fillPieceGuide();
  $('octBox').classList.toggle('hidden', !MODES[mode].oct || !game); if (MODES[mode].oct) fillOctGuide();
  renderStrip(); refreshHelp(false);
  $('promoBox').classList.toggle('hidden', !MODES[mode].promotion); if (MODES[mode].promotion) fillPromoRules();
  $('promoGuide').classList.toggle('hidden', !MODES[mode].promotion);
  $('grandBox').classList.toggle('hidden', !MODES[mode].grand || !game); if (MODES[mode].grand) fillGrandGuide();      // (during army building the picker below the board already shows every piece)
  cylSetup(false);
  abValidate();
  $('boardWrap').classList.remove('zoomable'); $('boardWrap').style.height = ''; document.body.classList.remove('nopagescroll'); $('zoomCtl').classList.add('hidden'); $('board').style.transform = '';
  $('board').classList.remove('hexb'); $('board').style.height = ''; $('board2').style.width = '';
  if (M && M.phase === 'play' && game && ended()) finishRound();
  if (A4 && A4.phase === 'play' && game && ended()) finishRound4();
  updateAustUI();
  if (M && M.phase === 'setup') return renderSetup();
  if (A4 && A4.phase === 'setup') return renderSetup4();
  if (game && game.bug) return renderBug();
  if (game && game.multi && game.layers) return renderAlice4();
  if (game && game.multi) return renderMulti();
  if (game && game.layers) return renderAlice();
  const g = game, W = g.w, H = g.h, el = $('board');
  el.innerHTML = '';
  const big = W > 12, cylOn = !!g.cyl, Wd = cylOn ? W + 2 : W;
  el.style.gridTemplateColumns = cylOn ? 'minmax(0,.5fr) minmax(0,.85fr) ' + 'minmax(0,1fr) '.repeat(W - 2) + 'minmax(0,.85fr) minmax(0,.5fr)' : 'repeat(' + W + ',minmax(0,1fr))';
  el.style.aspectRatio = cylOn ? (W + 0.7) + '/' + H : W + '/' + H;
  el.style.width = big ? (W * 34) + 'px' : '100%';
  el.style.fontSize = big ? '24px' : (boardPx() / W * 0.7) + 'px';
  $('board2Wrap').classList.add('hidden'); $('capA').classList.add('hidden');
  const hist = g.history(), last = hist[hist.length - 1];
  const hid = MODES[mode].v.hidden && !ended() && !replay && !spectating;
  const hints = sel && !hid ? (sel.drop ? g.drops().filter(m => m.drop === sel.drop) : selMoves()) : [];
  let kingSq = null;
  if (g.inCheck()) {
    if ((g.imperial || g.promotion) && g.kingPos) { const kp0 = g.kingPos(g.turn); if (kp0) kingSq = kp0.x + ',' + kp0.y; }      // Imperial Chess: the lone Imperial under attack glows like a King in check
    else for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const p = g.at(x, y); if (p && p.t === 'k' && p.c === g.turn) kingSq = x + ',' + y; }
  }
  const seen = gs.fog && !ended() && !replay && !spectating ? g.sees(myColor) : null;
  for (let i = 0; i < Wd * H; i++) {
    const r = Math.floor(i / Wd), c = i % Wd, cc = cylOn ? c - 1 : c;
    const bx = myColor === 'w' ? cc : W - 1 - cc, x = cylOn ? cylMod(bx + cylShift, W) : bx, y = myColor === 'w' ? H - 1 - r : r;
    const p0 = g.at(x, y), fogged = !!seen && !seen.has(y * W + x), p = ((hid && p0 && p0.c !== myColor) || fogged) ? null : p0, d = document.createElement('div');
    d.className = 'sq ' + ((x + y) % 2 === 1 ? 'l' : 'd'); d.dataset.x = x; d.dataset.y = y;
    if (g.cut && g.cut(x, y)) { d.classList.add('cut'); el.appendChild(d); continue; }
    if (cylOn && (c === 0 || c === Wd - 1)) d.classList.add('ghost');
    if (sel && sel.x === x && sel.y === y) d.classList.add('sel');
    if (last && last.hits && last.hits.some(q => q.x === x && q.y === y)) d.classList.add('splash');
    if (last && !hid && ((last.tx === x && last.ty === y) || (last.fx === x && last.fy === y))) d.classList.add('last');
    if (fogged) d.classList.add('fog');
    if (kingSq === x + ',' + y) d.classList.add('check');
    { const hm = hints.find(m => m.tx === x && m.ty === y); if (hm) { d.classList.add('hint'); if (p) d.classList.add('cap'); if (hm.shot) d.classList.add('shot'); } }
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
    if (p) {
      const s = document.createElement('span');
      setGlyph(s, shownType(p), p.c); if (p.wall && g.wallLife) addWallNum(s, g.wallLife(x, y)); if (p.rc > 0) addWallNum(s, p.rc);      // (Reviver recharge countdown)
      s.className = (p.c === 'w' ? 'w-piece' : '') + (isFairy(p.t) ? ' fairy' : '') + (p.champ && p.c === myColor ? ' champ' : '') + fxClass(p);
      s.dataset.pc = '1'; d.appendChild(s);
    }
    d.onclick = () => clickSq(x, y);
    el.appendChild(d);
  }
  if (big) setupBigBoard(34, g.imperial ? Math.max(W, H) : 12);
  if (cylOn) cylSetup(true);
  renderHand(myColor === 'w' ? 'b' : 'w', $('handTop'));
  renderHand(myColor, $('handBot'));
  $('status').textContent = statusText();
  updateVoidTray();
  if (ended()) $('drawBanner').classList.add('hidden');
  $('history').textContent = '';
}

