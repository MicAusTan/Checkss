/* classes_ui.js: the screens for classes and traits: the draft (pick cards), the in-game class panel, the trait chip, and the Classes & traits guide in the Rules drawer. */
const CLS_ICON = { summoner: '🌀', rogue: '🗡️', mage: '🔮', engineer: '🛠️', glitch: '👾', illusioner: '🎭', warrior: '⚔️', cleric: '🩹' };
const CLS_ROLE = { summoner: 'Builder', rogue: 'Disruptor', mage: 'Control', engineer: 'Defender', glitch: 'Chaos', illusioner: 'Trickster', warrior: 'Attacker', cleric: 'Support' };
const TRAIT_TAGS = {
  Army: ['flanker', 'twinTowers', 'bishopBrigade', 'knightCavalry', 'rookery', 'overlord', 'archbishop', 'paladin'],
  Movement: ['glassCannon', 'longKing', 'steadfast', 'camelRiders', 'sidestepRooks', 'pushyBishops', 'amazonQueen', 'jumpingRooks', 'hoppingBishops', 'queenHop', 'knightKing', 'stags', 'loneWolf', 'juggernaut', 'empress'],
  Pawns: ['brawlers', 'pawnStorm', 'longMarch', 'wanderers', 'charge', 'knuckle', 'retreaters', 'earlyBloom', 'backstabbers', 'slingers', 'champions'],
  Defence: ['martyr', 'royalQueen', 'shieldWall', 'ironQueen', 'phalanx', 'bodyguard', 'boobyTrap'],
  Special: ['conqueror', 'lastStand', 'swap', 'friendlyFire', 'scout'],
  Team: ['inheritance', 'openRanks']
};
const traitTag = id => Object.keys(TRAIT_TAGS).find(k => TRAIT_TAGS[k].includes(id)) || 'Other';
const TAG_ICON = { Army: '🛡️', Movement: '👣', Pawns: '♟', Defence: '🧱', Special: '✨', Team: '🤝', Other: '🧬' };
const uiEl = (tag, cls, html) => { const d = document.createElement(tag); if (cls) d.className = cls; if (html != null) d.innerHTML = html; return d; };
const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const shortDesc = t => { const s = String(t).replace(/^Ultimate( \(replaces your move\))?: /, ''); const i = s.search(/[.:]\s/); return i > 0 && i < 90 ? s.slice(0, i + 1) : s.length > 90 ? s.slice(0, 87) + '…' : s; };

/* ---- trait diagrams: the engine itself is asked what the trait changes, so the pictures can never disagree with the rules ---- */
const NO_DIAGRAM = ['earlyBloom'], dgCache = {};
const dgHasBadge = id => ['Army', 'Movement', 'Pawns'].includes(traitTag(id)) && !NO_DIAGRAM.includes(id);
function dgCompute(id) {
  if (dgCache[id]) return dgCache[id];
  const out = { army: null, moves: [] }, V = MODES.standard.v;
  try {
    const a = Engine.create(Object.assign({}, V)), b = Engine.create(Object.assign({}, V, { traits: { w: id } })); let changed = false;
    const rows = [];
    for (let y = 1; y >= 0; y--) { const row = []; for (let x = 0; x < 8; x++) { const p = a.at(x, y), q = b.at(x, y), ch = (p && p.t) !== (q && q.t); changed = changed || ch; row.push({ t: q && q.t, ch }); } rows.push(row); }
    if (changed) out.army = rows;
  } catch (e) { /* no army picture */ }
  const side = (tt, enemies, trait) => {                  // reachable squares of one white piece on d4: on an empty board (moves) or among enemy pieces (captures)
    const rows = [];
    for (let r = 0; r < 8; r++) rows.push((enemies ? 'n' : '.').repeat(8));
    const set = (r, x, ch) => { rows[r] = rows[r].slice(0, x) + ch + rows[r].slice(x + 1); };
    set(7, 0, 'K'); set(0, 7, 'k'); set(4, 3, tt.toUpperCase()); if (tt === 'k') set(7, 0, '.');
    const g = Engine.create(Object.assign({}, V, { setup: rows, first: 'w', traits: trait ? { w: id } : undefined }));
    return new Set(g.reach(3, 3).map(m => m.tx + ',' + m.ty));
  };
  const same = (x, y) => x.size === y.size && [...x].every(v => y.has(v));
  ['k', 'q', 'r', 'b', 'n', 'p'].forEach(tt => {
    try {
      const m0 = side(tt, false, false), m1 = side(tt, false, true), c0 = side(tt, true, false), c1 = side(tt, true, true);
      if (!same(m0, m1) || !same(c0, c1)) out.moves.push({ t: tt, m0, m1, c0, c1 });
    } catch (e) { /* skip this piece */ }
  });
  return (dgCache[id] = out);
}
const dgGlyph = t => '<span class="dgp">' + (GLYPH[t] || t) + '</span>';
function dgMoveHTML(d) {
  let h = '<div class="dg-block"><div class="dg-title">' + esc(PNAMES[d.t] || d.t) + '</div><div class="dg">';
  for (let y = 7; y >= 0; y--) for (let x = 0; x < 8; x++) {
    const k = x + ',' + y, s1 = d.m1.has(k), s0 = d.m0.has(k), k1 = d.c1.has(k), k0 = d.c0.has(k);
    let inner = '', cls = '';
    if (x === 3 && y === 3) inner = dgGlyph(d.t);
    else if (s1) inner = '<i class="mv' + (s0 ? '' : ' new') + '"></i>';
    else if (s0) inner = '<i class="mv lost">✕</i>';
    else if (k1) inner = '<i class="cp' + (k0 ? '' : ' new') + '"></i>';
    else if (k0) inner = '<i class="cp lost">✕</i>';
    h += '<b class="' + ((x + y) % 2 ? 'dk' : 'lt') + '">' + inner + '</b>';
  }
  return h + '</div></div>';
}
function dgArmyHTML(rows) {
  let h = '<div class="dg-block"><div class="dg-title">Starting position</div><div class="dg army">';
  rows.forEach((row, r) => row.forEach((c, x) => { h += '<b class="' + ((x + r) % 2 ? 'lt' : 'dk') + (c.ch ? ' chg' : '') + '">' + (c.t ? dgGlyph(c.t) : '') + '</b>'; }));
  return h + '</div></div>';
}
function dgHTML(id) {
  const d = dgCompute(id); let h = '<div class="dg-head">' + esc(TRAIT(id).name) + '</div><div class="dg-row">';
  if (d.army) h += dgArmyHTML(d.army);
  d.moves.slice(0, 3).forEach(m => { h += dgMoveHTML(m); });
  h += '</div>';
  if (!d.army && !d.moves.length) return h + '<div class="dim">No picture for this one: the change is not about where pieces move.</div>';
  return h + '<div class="dg-legend"><span><i class="mv"></i> move</span><span><i class="cp"></i> capture only</span><span><i class="mv new"></i> new from the trait</span><span><i class="mv lost">✕</i> taken away</span></div>';
}
let dgPop = null, dgTimer = null;
function dgShow(badge) {
  clearTimeout(dgTimer); if (!dgPop) { dgPop = uiEl('div', 'dg-pop'); dgPop.onmouseenter = () => clearTimeout(dgTimer); dgPop.onmouseleave = dgHide; document.body.appendChild(dgPop); }
  dgPop.innerHTML = dgHTML(badge.dataset.trait); dgPop.style.display = 'block';
  const r = badge.getBoundingClientRect(), w = dgPop.offsetWidth, h = dgPop.offsetHeight;
  dgPop.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + 'px';
  dgPop.style.top = (r.bottom + h + 12 > innerHeight ? Math.max(8, r.top - h - 8) : r.bottom + 8) + 'px';
}
function dgHide() { dgTimer = setTimeout(() => { if (dgPop) dgPop.style.display = 'none'; }, 160); }
document.addEventListener('mouseover', e => { const b = e.target.closest && e.target.closest('.dc-q'); if (b) dgShow(b); });
document.addEventListener('mouseout', e => { if (e.target.closest && e.target.closest('.dc-q')) dgHide(); });
document.addEventListener('focusin', e => { const b = e.target.closest && e.target.closest('.dc-q'); if (b) dgShow(b); });
document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('.dc-q'); if (b) { e.stopPropagation(); e.preventDefault(); dgShow(b); } else if (dgPop && !e.target.closest('.dg-pop')) dgPop.style.display = 'none'; }, true);

function infoCardHTML(kind, id) {                         // one class or trait, as the inside of a card
  const d = DINFO(kind, id);
  if (kind === 'class') {
    const ab = d.abilities.map(a => '<i class="ab' + (a.ult ? ' ult' : '') + '" title="' + esc(a.desc) + '">' + (a.ult ? '★ ' : '') + esc(a.name) + ' <em>' + a.cost + '</em></i>').join('');
    return '<span class="dc-top"><span class="dc-ico">' + (CLS_ICON[id] || '✨') + '</span><span class="dc-name">' + esc(d.name) + '</span><span class="dc-tag">' + (d.secret ? 'Secret' : CLS_ROLE[id] || 'Class') + '</span></span>'
      + '<span class="dc-desc">' + esc(d.desc) + '</span><span class="dc-pas"><b>Passive</b> ' + esc(d.passive.desc) + '</span><span class="dc-abs">' + ab + '</span>';
  }
  const tag = traitTag(id);
  return '<span class="dc-top"><span class="dc-ico">' + TAG_ICON[tag] + '</span><span class="dc-name">' + esc(d.name) + '</span><span class="dc-tag">' + tag + '</span>' + (dgHasBadge(id) ? '<span class="dc-q" data-trait="' + id + '" tabindex="0" title="Show a picture of what changes">?</span>' : '') + '</span><span class="dc-desc">' + esc(d.desc) + '</span>';
}

/* ---- the draft ---- */
function renderDraft() {
  const box = $('draftBox');
  if (!draft) { box.classList.add('hidden'); return; }
  box.classList.remove('hidden'); box.innerHTML = '';
  const kind = draft.kind || 'trait', both = !!(gs.traits && gs.classes);
  const h = uiEl('div', 'dr-head', '<div class="dr-step">' + (both ? 'Step ' + (kind === 'trait' ? '1' : '2') + ' of 2 · ' : '') + (kind === 'class' ? 'Class' : 'Trait') + '</div><h3>' + (kind === 'class' ? 'Choose your class' : 'Choose your trait') + '</h3><p>'
    + (kind === 'class' ? 'A passive power plus abilities you pay for with points. Hover an ability for details.' : 'A permanent twist for your army. It stays secret until it matters.') + '</p>');
  box.appendChild(h);
  // Host-only hidden extra: click this heading 5 times quickly to unlock the full list for your own pick.
  h.onclick = () => {
    if (!isHost || !draft || draft.picked || !draft.mine) return;
    const now = Date.now();
    draft.taps = (draft.taps || []).filter(t => now - t < 3000).concat(now);
    if (draft.taps.length >= 5) { draft.cheat = true; draft.taps = []; render(); }
  };
  if (!draft.mine) { box.appendChild(uiEl('div', 'dr-wait', 'Waiting for the host to deal the offers…')); return; }
  const progress = () => {
    if (!isHost || !draft.picks) return;
    const row = uiEl('div', 'dr-prog', '<span class="dim">Chosen:</span>');
    partIds().forEach(p => row.appendChild(uiEl('span', 'dr-chip' + (draft.picks[p] ? ' done' : ''), esc(whoName(p)) + ' ' + (draft.picks[p] ? '✓' : '…'))));
    box.appendChild(row);
  };
  if (draft.picked) {
    const c = uiEl('div', 'dcard on locked', infoCardHTML(kind, draft.picked)); box.appendChild(c);
    box.appendChild(uiEl('div', 'dr-wait', 'Locked in. Waiting for the others…'));
    progress();
    if (isHost) { const b = uiEl('button', null, 'Pick randomly for anyone who is still deciding'); b.onclick = autoPickRest; box.appendChild(b); }
    return;
  }
  const card = id => {
    const b = uiEl('button', 'dcard' + (draft.sel === id ? ' on' : '') + (DINFO(kind, id).secret ? ' secret' : ''), infoCardHTML(kind, id)); b.type = 'button';
    b.onclick = () => { draft.sel = id; renderDraft(); }; b.ondblclick = () => choosePick(id); return b;
  };
  const grid = uiEl('div', 'dr-grid' + (kind === 'class' ? ' cls' : '')); draft.mine.forEach(id => grid.appendChild(card(id)));
  if (isHost && draft.cheat) {                            // the hidden host menu: one panel with tabs, a search box and filters (it replaces the dealt cards instead of stacking under them)
    draft.view = draft.view || 'all'; draft.q = draft.q || ''; draft.tag = draft.tag || '';
    const panel = uiEl('div', 'dr-host'); panel.appendChild(uiEl('div', 'dr-hostlabel', '🔑 Host menu'));
    const tabs = uiEl('div', 'dr-tabs');
    [['all', 'Everything'], ['dealt', 'Dealt to you (' + draft.mine.length + ')']].forEach(([v, label]) => { const t2 = uiEl('button', 'dr-tab' + (draft.view === v ? ' on' : ''), label); t2.type = 'button'; t2.onclick = () => { draft.view = v; renderDraft(); }; tabs.appendChild(t2); });
    panel.appendChild(tabs);
    const body = uiEl('div', 'dr-hostbody');
    if (draft.view === 'dealt') { body.appendChild(grid); }
    else {
      const tools = uiEl('div', 'dr-tools'), q = uiEl('input'); q.type = 'search'; q.placeholder = 'Search by name or text…'; q.value = draft.q; tools.appendChild(q);
      const list = uiEl('div', 'dr-hostlist'), count = uiEl('span', 'dim');
      const chips = uiEl('div', 'dr-chips');
      if (kind === 'trait') ['', ...Object.keys(TRAIT_TAGS), 'Other'].forEach(tg => { const c2 = uiEl('button', 'dr-fchip' + (draft.tag === tg ? ' on' : ''), tg ? TAG_ICON[tg] + ' ' + tg : 'All'); c2.type = 'button'; c2.onclick = () => { draft.tag = tg; chips.querySelectorAll('.dr-fchip').forEach(x => x.classList.toggle('on', x === c2)); fill(); }; chips.appendChild(c2); });
      const fill = () => {                                // only this list is rebuilt while typing, so the search box keeps focus
        list.textContent = ''; const needle = draft.q.trim().toLowerCase();
        const ids = eligibleFor(kind, true).filter(id => { const d = DINFO(kind, id); return (!draft.tag || (kind === 'trait' && traitTag(id) === draft.tag)) && (!needle || (d.name + ' ' + d.desc).toLowerCase().includes(needle)); });
        count.textContent = ids.length + ' option' + (ids.length === 1 ? '' : 's');
        const groups = kind === 'trait' && !needle && !draft.tag ? Object.keys(TRAIT_TAGS).concat(['Other']) : [null];
        groups.forEach(g2 => {
          const sub = ids.filter(id => g2 == null || traitTag(id) === g2); if (!sub.length) return;
          if (g2) list.appendChild(uiEl('div', 'dr-sub', TAG_ICON[g2] + ' ' + g2));
          const gr = uiEl('div', 'dr-grid' + (kind === 'class' ? ' cls' : '')); sub.forEach(id => { const cd = card(id); if (draft.mine.includes(id)) cd.insertAdjacentHTML('afterbegin', '<span class="dc-dealt">dealt to you</span>'); gr.appendChild(cd); }); list.appendChild(gr);
        });
        if (!ids.length) list.appendChild(uiEl('div', 'dim', 'Nothing matches.'));
      };
      q.oninput = () => { draft.q = q.value; fill(); };
      tools.appendChild(count); body.appendChild(tools); if (kind === 'trait') body.appendChild(chips); body.appendChild(list); fill();
    }
    panel.appendChild(body); box.appendChild(panel);
  } else box.appendChild(grid);
  const go = uiEl('button', 'dr-go', draft.sel ? 'Lock in ' + esc(DINFO(kind, draft.sel).name) : 'Pick one of the cards'); go.disabled = !draft.sel; go.onclick = () => choosePick(draft.sel); box.appendChild(go);
  progress();
}

/* ---- the class panel during the game ---- */
function renderClassBar() {
  const box = $('classBar');
  if (!game || !game.cls || draft || M || replay) { box.classList.add('hidden'); return; }
  box.classList.remove('hidden'); box.innerHTML = '';
  const me = meId(), mine = spectating ? null : game.cls[me];
  if (mine) {
    const k = CLS(mine), pts = game.pts(me), cap = +game.cfg.cap, lap = game.overlap ? game.overlap(me) : 0;
    const head = uiEl('div', 'cb-head'); head.appendChild(uiEl('span', 'cb-ico', CLS_ICON[mine] || '✨')); head.appendChild(uiEl('b', 'cb-name', esc(k.name)));
    const pips = uiEl('span', 'cb-pips'); pips.title = pts + ' of ' + cap + ' points';
    if (cap <= 12) for (let i = 0; i < cap; i++) pips.appendChild(uiEl('i', 'pip' + (i < pts ? ' on' : ''))); else { const bar = uiEl('i', 'pbar'); bar.innerHTML = '<u style="width:' + Math.min(100, pts / cap * 100) + '%"></u>'; pips.appendChild(bar); }
    head.appendChild(pips); head.appendChild(uiEl('span', 'cb-num', '<b>' + pts + '</b>/' + cap + ' <span class="dim">+' + game.cfg.gain + (lap ? ' +' + lap + ' overlap' : '') + ' next turn</span>'));
    box.appendChild(head);
    const pas = uiEl('details', 'cb-pas'); pas.innerHTML = '<summary>Passive: ' + esc(shortDesc(k.passive.desc)) + '</summary><div>' + esc(k.passive.desc) + '</div>'; box.appendChild(pas);
    const row = uiEl('div', 'cb-abs');
    game.abilities(me).forEach(a => {
      const b = uiEl('button', 'abx' + (a.ult ? ' ult' : '') + (a.replace ? ' rep' : '') + (abMode === a.id ? ' on' : ''));
      b.type = 'button'; b.disabled = !!a.why || ended(); b.title = a.desc + (a.why ? ' · ' + a.why : '');
      b.innerHTML = '<span class="ab-top"><span class="ab-name">' + (a.ult ? '★ ' : '') + esc(a.name) + '</span><span class="ab-cost">' + a.cost + '</span></span><small>' + esc(a.why || shortDesc(a.desc)) + '</small>' + (a.replace ? '<em class="ab-rep">replaces your move</em>' : '');
      b.onclick = () => {
        if (a.steps === 0) { abMode = null; abFrom = null; sel = null; play({ ab: a.id, c: me }); return; }      // no target to click: cast right away
        abMode = abMode === a.id ? null : a.id; abFrom = null; sel = null; render();
      };
      row.appendChild(b);
    });
    const ov = game.overrunOf ? game.overrunOf(me) : null;
    if (ov && ov.n > 0 && game.turn === me) { const b = uiEl('button', 'abx on', '<span class="ab-top"><span class="ab-name">End Overrun</span></span>'); b.onclick = () => { abMode = null; abFrom = null; sel = null; play({ ab: 'stop', c: me }); }; row.appendChild(b); }
    box.appendChild(row);
    const how = uiEl('details', 'cb-how'); how.innerHTML = '<summary>How abilities work</summary><div>Cast an ability first, then make your normal move. An ability that gives check ends your turn, and one marked “replaces your move” uses the whole turn. Glows: frozen = blue, disarmed = grey, jumping = gold, shielded = green, sanctuary = purple. Brown blocks are walls; red-dashed squares are Restore Points; dashed squares with ×N are Clipping stacks.</div>'; box.appendChild(how);
  }
  const others = partIds().filter(p => p !== me || spectating).filter(p => game.cls[p] && (spectating || !gs.clHide || isMate(p)));
  if (others.length) { const o = uiEl('div', 'cb-others'); others.forEach(p => o.appendChild(uiEl('span', 'dr-chip', (CLS_ICON[game.cls[p]] || '') + ' ' + esc(whoName(p)) + ': ' + esc(CLS(game.cls[p]).name) + ' · ' + game.pts(p) + ' pts'))); box.appendChild(o); }
}

/* ---- the trait chip during the game ---- */
let traitOpen = false;
function renderTraitBar() {
  const box = $('traitBar');
  if (!game || !gtraits || draft || replay || M) { box.classList.add('hidden'); return; }
  const me = meId(), mine = spectating ? null : gtraits[me];
  const all = !!gs.trShow || ended();
  if (!mine && !all) { box.classList.add('hidden'); return; }
  box.classList.remove('hidden'); box.innerHTML = '';
  const d = uiEl('details', 'tb'); d.open = traitOpen; d.ontoggle = () => { traitOpen = d.open; };
  if (all) {
    d.innerHTML = '<summary>🧬 ' + (ended() ? 'Traits this game' : 'Everyone\'s traits') + '</summary>'; const body = uiEl('div', 'tb-body');
    partIds().forEach(p => { if (gtraits[p]) body.appendChild(uiEl('div', null, '<b>' + esc(whoName(p)) + ':</b> ' + esc(TRAIT(gtraits[p]).name) + ' <span class="dim">' + esc(TRAIT(gtraits[p]).desc) + '</span>')); });
    d.appendChild(body);
  } else {
    d.innerHTML = '<summary>🧬 Your trait: <b>' + esc(TRAIT(mine).name) + '</b> <span class="dim">(only you can see this)</span></summary>';
    const body = uiEl('div', 'tb-body', esc(TRAIT(mine).desc));
    if (game.teams) partIds().forEach(p => { if (p !== me && game.teams[p] === game.teams[me] && gtraits[p]) body.appendChild(uiEl('div', null, '<b>Teammate ' + esc(whoName(p)) + ':</b> ' + esc(TRAIT(gtraits[p]).name) + ' <span class="dim">' + esc(TRAIT(gtraits[p]).desc) + '</span>')); });
    d.appendChild(body);
  }
  box.appendChild(d);
}

/* ---- the guide in the Rules drawer ---- */
let clsGuideBuilt = false;
function fillClsGuide() {
  const g = $('clsGuide'), on = !!(gs && (gs.classes || gs.traits)) && !!game;
  g.classList.toggle('hidden', !on); if (!on || clsGuideBuilt) return; clsGuideBuilt = true;
  const body = $('clsGuideBody'); body.innerHTML = '';
  body.appendChild(uiEl('h4', null, 'Classes'));
  Object.keys(Engine.CLASSES).filter(id => !Engine.CLASSES[id].secret).forEach(id => { const d = uiEl('div', 'dcard flat', infoCardHTML('class', id)); body.appendChild(d); });
  body.appendChild(uiEl('h4', null, 'Traits'));
  Object.keys(TRAIT_TAGS).concat(['Other']).forEach(tag => {
    const ids = Object.keys(Engine.TRAITS).filter(id => traitTag(id) === tag); if (!ids.length) return;
    body.appendChild(uiEl('div', 'dr-sub', TAG_ICON[tag] + ' ' + tag));
    ids.forEach(id => body.appendChild(uiEl('div', 'dcard flat', infoCardHTML('trait', id))));
  });
}
{ const baseRender = render; render = function () { baseRender.apply(this, arguments); try { fillClsGuide(); } catch (e) { /* guide is optional */ } }; }
