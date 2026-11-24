/* skin_editor.js: the piece editor (🎨 > Open the piece editor) and the "using / sets" list in the drawer. */
function openSkinEditor() {
  if (document.getElementById('skinEd')) return;
  SkDB.all().then(list => {
    list.forEach(p => { const np = {}; Object.keys(p.pieces || {}).forEach(t => { const e = skMig(p.pieces[t], t); if (e && e.l.length) np[t] = e; }); p.pieces = np; });
    const st = { list, cur: null, sel: 'p', li: 0, groups: skinGroups(), dirty: false, edit: false };
    const mk = () => ({ id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name: 'My skin ' + (st.list.length + 1), pieces: {}, fresh: true });
    st.cur = st.list.find(p => SKIN.preset && p.id === SKIN.preset.id) || st.list[0] || (st.list.push(mk()), st.list[0]);
    const root = document.createElement('div'); root.id = 'skinEd';
    root.innerHTML = '<div class="sked"><div class="skh"><b>Piece editor</b><select id="skSel"></select><button id="skNew" type="button">New set</button><button id="skRen" type="button">Rename</button><button id="skDel" type="button">Delete set</button><button id="skUndo" type="button" class="iconbtn" title="Undo (Ctrl+Z)" aria-label="Undo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg></button><button id="skRedo" type="button" class="iconbtn" title="Redo (Ctrl+Y)" aria-label="Redo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/></svg></button><span style="flex:1"></span><button id="skX" type="button" title="Close" aria-label="Close">✕</button></div>' +
      '<div class="skb"><div class="skl" id="skList"></div>' +
      '<div class="skm"><div class="skbigw" id="skW"><div class="skbig" id="skBig"></div><svg class="skpoly" id="skPoly" viewBox="0 0 100 100" preserveAspectRatio="none"></svg><div class="sksel" id="skSelBox"><i class="h nw" data-h="nw"></i><i class="h ne" data-h="ne"></i><i class="h sw" data-h="sw"></i><i class="h se" data-h="se"></i><i class="h rot" data-h="rot"></i></div></div>' +
      '<div class="dim skhint" id="skHint"></div>' +
      '<div class="sksm"><div id="skS1" style="background:#b58863;color:#e8e0d0"></div><div id="skS2" style="background:#f0d9b5;color:#222"></div><div id="skS3" style="background:#b58863;color:#e8e0d0"></div><span class="dim">how it looks on the board</span></div><div class="skcols" id="skCols"></div></div>' +
      '<div class="skr"><div id="skName" style="font-weight:700;font-size:1.02rem"></div>' +
      '<h4>Look</h4><label class="row"><input type="radio" name="skMode" value="piece"> Cut to the piece\'s own shape</label><label class="row"><input type="radio" name="skMode" value="shape"> Cut to a shape of my own</label><label class="row"><input type="radio" name="skMode" value="free"> Free: the whole square, nothing cut</label>' +
      '<div id="skShapeBox"><div class="skshapes" id="skShapes"></div><div class="skbt"><button id="skEditShape" type="button" class="small">Edit the outline</button><label class="row"><input type="checkbox" id="skSmooth"> Smooth corners</label></div></div>' +
      '<h4>Pictures</h4><div id="skLayers"></div><div class="skadd"><label class="btnlike" style="cursor:pointer"><span id="skAddTxt">+ Add a picture…</span><input type="file" id="skFile" accept="image/*" hidden></label></div>' +
      '<div id="skCtl"><h4 id="skCtlT">Selected picture</h4>' +
      '<label class="row">Left / right <input type="range" id="skX2" min="-300" max="300" step="1" value="0"><output id="oX"></output></label><label class="row">Up / down <input type="range" id="skY2" min="-300" max="300" step="1" value="0"><output id="oY"></output></label>' +
      '<label class="row">Size <input type="range" id="skS" min="5" max="1000" step="1" value="100"><output id="oS"></output></label><label class="row">Rotate <input type="range" id="skR" min="-180" max="180" step="1" value="0"><output id="oR"></output></label>' +
      '<label class="row" id="skORow">Opacity <input type="range" id="skO" min="10" max="100" value="100"><output id="oO"></output></label>' +
      '<div class="skbt"><label class="row" id="skFlipRow"><input type="checkbox" id="skFlip"> Flip left/right</label><button id="skLReset" type="button" class="small">Reset position and size</button><button id="skCover" type="button" class="small" title="Make this picture exactly as big as the square">Fill the square</button></div></div>' +
      '<h4>Colour</h4><label class="row"><input type="checkbox" id="skTint"> Colour with my piece colour</label><div class="skbt"><button id="skTintGrp" type="button" class="small">Apply to the whole group</button></div>' +
      '<details class="skdanger"><summary>Reset…</summary><div class="skbt"><button id="skPReset" type="button" class="small danger">Reset this piece to the default</button><button id="skAReset" type="button" class="small danger">Reset every piece in this set</button></div></details>' +
      '<div class="dim" style="margin-top:6px">Nothing is saved until you press Save. Pictures keep up to 768 px, as sharp as the size limit allows. Other players see your skin on your pieces (they can switch that off). Neutral pieces keep the default look.</div></div></div>' +
      '<div class="skf"><button id="skSave" class="primary" type="button">Save and use</button><button id="skSave2" type="button">Save</button><button id="skOff" type="button" title="Stop using any skin (your sets stay saved)">Use the default pieces</button><button id="skExp" type="button" title="Save this set as a file you can share">Export set</button><label class="btnlike" style="cursor:pointer" title="Load a set from a file">Import set…<input type="file" id="skImp" accept=".json,application/json" hidden></label><span class="dim" id="skMsg"></span></div></div>';
    document.body.appendChild(root); const q = id => root.querySelector('#' + id);
    const BOSS = Engine.NEUTRAL_T.boss, isBoss = t => t === BOSS, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const defHTML = t => skBase(t) || '<span>' + (GLYPH[t] || t) + '</span>';
    const ent = () => st.cur.pieces[st.sel], ensure = () => ent() || (st.cur.pieces[st.sel] = { v: 2, mode: 'piece', c: 0, k: null, b: { v: 1, x: 0, y: 0, s: 100, r: 0 }, l: [] });
    const modeOf = () => { const e = ent(); return e ? e.mode : 'piece'; }, unit = () => (modeOf() === 'piece' && !isBoss(st.sel) ? SK_UNIT : 1);
    const cur = () => { const e = ent(); if (!e) return null; return st.li === -1 && e.mode === 'free' && !isBoss(st.sel) ? e.b : (e.l[st.li] || null); };
    const hasPics = t => { const e = st.cur.pieces[t]; return !!(e && e.l.length); };
    const dsc = t => { const p = st.cur.pieces[t]; return p && p.l.length ? skDesc(p) : null; };
    const html = t => { const d = dsc(t); return isBoss(t) ? skinBossPreview(d) : (d && skinEntryHTML(t, d)) || defHTML(t); };
    const nameOf = t => (st.groups.flatMap(g => g.list).find(x => x[0] === t) || [0, t])[1];
    /* ---- undo / redo (pictures are kept once in a table, snapshots only hold numbers) and automatic drafts ---- */
    const imgTab = [], imgIdx = new Map(), hist = [], fut = []; let lastT = 0, draftT = null;
    const snap = () => JSON.stringify({ n: st.cur.name, p: st.cur.pieces }, (k, v) => { if (k === 'h') return undefined; if (k === 'img' && typeof v === 'string') { let i = imgIdx.get(v); if (i === undefined) { i = imgTab.length; imgTab.push(v); imgIdx.set(v, i); } return i; } return v; });
    const restore = str => { const o = JSON.parse(str); Object.values(o.p).forEach(e => e.l.forEach(L => { L.img = imgTab[L.img]; })); st.cur.pieces = o.p; st.cur.name = o.n; };
    const updUndo = () => { const u = q('skUndo'), r = q('skRedo'); if (u) { u.disabled = !hist.length; r.disabled = !fut.length; } };
    const resetHist = () => { hist.length = 0; fut.length = 0; st.last = snap(); lastT = 0; updUndo(); };
    const draftDel = () => { clearTimeout(draftT); SkDB.del('__draft__' + st.cur.id); };
    const draftSave = () => { if (!document.getElementById('skinEd') || !st.dirty) return; const p = st.cur, copy = JSON.parse(JSON.stringify(p.pieces, (k, v) => (k === 'h' ? undefined : v))); SkDB.put({ id: '__draft__' + p.id, draft: true, setId: p.id, name: p.name, pieces: copy, t: Date.now() }); };
    const mark = () => { st.dirty = true; const now = Date.now(); if (now - lastT > 500) { hist.push(st.last); if (hist.length > 60) hist.shift(); } lastT = now; fut.length = 0; st.last = snap(); updUndo(); clearTimeout(draftT); draftT = setTimeout(draftSave, 1500); q('skMsg').textContent = 'Unsaved changes: press Save to keep them.'; };
    const undoRedo = (from, to) => { if (!from.length) return; to.push(snap()); restore(from.pop()); st.last = snap(); lastT = 0; st.dirty = true; st.edit = false; st.li = Math.max(-1, Math.min(st.li, (ent() ? ent().l.length : 0) - 1)); sel(); grid(); all(); updUndo(); clearTimeout(draftT); draftT = setTimeout(draftSave, 1500); };
    const paintCell = () => { const c = q('skList').querySelector('.skp[data-t="' + st.sel + '"]'); if (!c) return; c.querySelector('.ic').innerHTML = html(st.sel); const has = hasPics(st.sel); let i = c.querySelector('i'); if (has && !i) c.appendChild(document.createElement('i')); if (!has && i) i.remove(); };
    const big = q('skBig'), polyEl = q('skPoly');
    const frame = () => { const b = q('skSelBox'), o = cur(); if (!o || st.edit) { b.style.display = 'none'; return; }
      const base = st.li === -1, u = base ? SK_UNIT : unit(), ux = base ? 1 : u;
      b.style.cssText = 'display:block;left:calc(50% + ' + o.x * ux + '%);top:calc(50% + ' + o.y * ux + '%);width:' + o.s * u + '%;height:' + o.s * u + '%;transform:translate(-50%,-50%) rotate(' + o.r + 'deg)'; };
    /* ---- own shape: outline + point editing on the stage ---- */
    const kOf = e => (e && e.k) || null, ptsOf = e => skPts(e.k), smoothOf = e => e.k[0] === 'P';
    const setPts = (e, P, smooth) => { e.k = (smooth ? 'P' : 'p') + ':' + P.slice(0, 48).map(a => clamp(Math.round(a[0]), 0, 100) + ',' + clamp(Math.round(a[1]), 0, 100)).join(' '); };
    const ngon = (n, r, a0) => Array.from({ length: n }, (_, i) => [50 + r * Math.cos(a0 + i * 2 * Math.PI / n), 50 + r * Math.sin(a0 + i * 2 * Math.PI / n)]);
    const star = () => Array.from({ length: 10 }, (_, i) => { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 17 : 40; return [50 + r * Math.cos(a), 50 + r * Math.sin(a)]; });
    const SHAPES = [['Circle', true, ngon(14, 38, 0)], ['Square', false, [[14, 14], [86, 14], [86, 86], [14, 86]]], ['Rounded square', false, [[26, 14], [74, 14], [86, 26], [86, 74], [74, 86], [26, 86], [14, 74], [14, 26]]], ['Diamond', false, [[50, 8], [92, 50], [50, 92], [8, 50]]], ['Triangle', false, [[50, 12], [90, 84], [10, 84]]], ['Hexagon', false, ngon(6, 40, 0)], ['Star', false, star()], ['Heart', true, [[50, 88], [26, 64], [14, 42], [22, 22], [40, 16], [50, 30], [60, 16], [78, 22], [86, 42], [74, 64]]], ['Shield', false, [[16, 14], [84, 14], [84, 50], [72, 72], [50, 90], [28, 72], [16, 50]]], ['Cross', false, [[38, 12], [62, 12], [62, 38], [88, 38], [88, 62], [62, 62], [62, 88], [38, 88], [38, 62], [12, 62], [12, 38], [38, 38]]], ['Pawn-ish blob', true, [[50, 10], [66, 20], [66, 38], [58, 48], [72, 60], [84, 88], [16, 88], [28, 60], [42, 48], [34, 38], [34, 20]]]];
    const shapeBtns = () => { q('skShapes').innerHTML = SHAPES.map(([nm, sm, P], i) => { const k = (sm ? 'P' : 'p') + ':' + P.map(a => Math.round(a[0]) + ',' + Math.round(a[1])).join(' '); return '<button type="button" class="shp" data-i="' + i + '" title="' + nm + '"><svg viewBox="0 0 100 100"><path d="' + skPath(k) + '" fill="currentColor"/></svg></button>'; }).join('');
      q('skShapes').querySelectorAll('.shp').forEach(b => { b.onclick = () => { const e = ensure(), S = SHAPES[+b.dataset.i]; e.mode = 'shape'; setPts(e, S[2], S[1]); mark(); all(); }; }); };
    const polyUI = () => { const e = ent(), on = !!(e && e.mode === 'shape' && e.k);
      if (!on) { polyEl.style.display = 'none'; polyEl.innerHTML = ''; return; }
      polyEl.style.display = 'block'; polyEl.style.pointerEvents = st.edit ? 'auto' : 'none';
      const P = ptsOf(e); polyEl.innerHTML = '<path d="' + skPath(e.k) + '" fill="' + (st.edit ? 'rgba(143,193,90,.18)' : 'none') + '" stroke="#2e7d32" stroke-width="0.9" stroke-dasharray="2.4 1.6" vector-effect="non-scaling-stroke"/>' + (st.edit ? P.map((a, i) => '<circle class="pt" data-i="' + i + '" cx="' + a[0] + '" cy="' + a[1] + '" r="2.3" fill="#fff" stroke="#2e7d32" stroke-width="0.8" vector-effect="non-scaling-stroke"/>').join('') : ''); };
    const toXY = ev => { const R = polyEl.getBoundingClientRect(); return [clamp((ev.clientX - R.left) / R.width * 100, 0, 100), clamp((ev.clientY - R.top) / R.height * 100, 0, 100)]; };
    polyEl.addEventListener('pointerdown', ev => {
      const e = ent(); if (!st.edit || !e || !e.k) return; ev.preventDefault(); ev.stopPropagation(); let P = ptsOf(e), idx = ev.target.dataset && ev.target.dataset.i != null ? +ev.target.dataset.i : -1;
      if (idx < 0) { const [x, y] = toXY(ev); let best = 1e9, at = 0; P.forEach((a, i) => { const b = P[(i + 1) % P.length], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1, t = clamp(((x - a[0]) * dx + (y - a[1]) * dy) / L2, 0, 1), d = Math.hypot(x - (a[0] + t * dx), y - (a[1] + t * dy)); if (d < best) { best = d; at = i; } }); if (P.length >= 48) return; P.splice(at + 1, 0, [x, y]); idx = at + 1; setPts(e, P, smoothOf(e)); mark(); polyUI(); stage(); paintCell(); }
      polyEl.setPointerCapture(ev.pointerId);
      const mv = m => { const [x, y] = toXY(m); P = ptsOf(e); P[idx] = [x, y]; setPts(e, P, smoothOf(e)); polyUI(); stage(); paintCell(); mark(); };
      const up = () => { polyEl.removeEventListener('pointermove', mv); polyEl.removeEventListener('pointerup', up); polyEl.removeEventListener('pointercancel', up); polyUI(); }; polyEl.addEventListener('pointermove', mv); polyEl.addEventListener('pointerup', up); polyEl.addEventListener('pointercancel', up); });
    polyEl.addEventListener('dblclick', ev => { const e = ent(); if (!st.edit || !e || !e.k || !ev.target.dataset || ev.target.dataset.i == null) return; const P = ptsOf(e); if (P.length <= 3) return; P.splice(+ev.target.dataset.i, 1); setPts(e, P, smoothOf(e)); mark(); polyUI(); stage(); paintCell(); });
    /* ---- preview colour: see the piece in every seat colour / on both sides (preview only, nothing is saved) ---- */
    const SK_COLS = [['', 'Default (light on dark, dark on light)'], ['w', 'White pieces'], ['k', 'Black pieces'], ['r', 'Red'], ['b', 'Blue'], ['y', 'Yellow / Orange'], ['g', 'Green / Teal'], ['o', 'Orange (8-player)'], ['p', 'Pink (8-player)'], ['t', 'Teal (8-player)'], ['m', 'Purple (8-player)'], ['x', 'Fallen army (grey)']];
    const SK_CV = { w: ['#fff', 'rgba(0,0,0,.5)', '#3a3a3a', 'skc-d'], k: ['#1a1a1a', 'rgba(255,255,255,.8)', '#e6e6e6', 'skc-l'], r: ['var(--sr)'], b: ['var(--sb)'], y: ['var(--sy)'], g: ['var(--sg)'], o: ['var(--so)'], p: ['var(--sp)'], t: ['var(--st)'], m: ['var(--sm)'], x: ['#8a8a8a'] };
    const SK_ORIG = { skW: '#222', skS1: '#e8e0d0', skS2: '#222', skS3: '#e8e0d0' };
    st.col = '';
    const paintCol = () => { const c = st.col || '', v = SK_CV[c];
      Object.keys(SK_ORIG).forEach(id => { const d = q(id); d.classList.remove('skc-d', 'skc-l');
        if (!v) { d.style.color = SK_ORIG[id]; d.style.removeProperty('--det'); d.style.removeProperty('--dets'); return; }
        d.style.color = v[0]; d.style.setProperty('--det', v[1] || 'rgba(0,0,0,.55)'); d.style.setProperty('--dets', v[2] || '#222'); d.classList.add(v[3] || 'skc-d'); });
      root.querySelectorAll('.skcb').forEach(b => b.classList.toggle('sel', b.dataset.k === c)); };
    q('skCols').innerHTML = SK_COLS.map(([k, n]) => '<button type="button" class="skcb" data-k="' + k + '" title="' + n + '" style="background:' + (k === '' ? 'linear-gradient(135deg,#f0d9b5 50%,#b58863 50%)' : SK_CV[k][0]) + '"></button>').join('') + '<span class="dim">preview colour</span>';
    q('skCols').onclick = ev => { const b = ev.target.closest && ev.target.closest('.skcb'); if (!b) return; st.col = b.dataset.k; paintCol(); };
    /* ---- the stage ---- */
    const stage = () => { const boss = isBoss(st.sel), h = html(st.sel), fs = boss ? 360 : Math.round(360 * SK_UNIT);
      big.style.fontSize = fs + 'px'; big.innerHTML = h; frame();
      [['skS1', 64], ['skS2', 64], ['skS3', 40]].forEach(([id, px]) => { const d = q(id); d.style.width = d.style.height = px + 'px'; d.style.fontSize = Math.round(px * (boss ? 1 : SK_UNIT)) + 'px'; d.innerHTML = boss ? '<span style="display:block;width:' + px + 'px;height:' + px + 'px">' + h + '</span>' : h; }); paintCol(); };
    const layersUI = () => { const e = ent(), ls = e ? e.l : [], free = !!(e && e.mode === 'free');
      let out = ls.length ? ls.map((L, i) => i).reverse().map(i => { const L = ls[i]; return '<div class="skly' + (i === st.li ? ' sel' : '') + '" data-i="' + i + '"><span class="th" style="background-image:url(' + L.img + ')"></span><span class="nm">Picture ' + (i + 1) + (i === ls.length - 1 && ls.length > 1 ? ' (top)' : '') + '</span><button type="button" data-a="up" title="Bring forward" aria-label="Bring forward"' + (i === ls.length - 1 ? ' disabled' : '') + '>▲</button><button type="button" data-a="dn" title="Send back" aria-label="Send back"' + (i === 0 ? ' disabled' : '') + '>▼</button><button type="button" data-a="del" title="Remove" aria-label="Remove">✕</button></div>'; }).join('') : '<div class="dim">None yet: this piece uses the default art.</div>';
      if (free) out += '<div class="skly orig' + (st.li === -1 ? ' sel' : '') + '" data-i="-1"><span class="th" style="background:#999;display:flex;align-items:center;justify-content:center;font-size:24px">' + (isBoss(st.sel) ? '' : defHTML(st.sel)) + '</span><span class="nm">The original icon</span><label class="row" style="margin:0" title="Show or hide the original icon"><input type="checkbox" data-a="vis"' + (e.b.v !== 0 ? ' checked' : '') + '> show</label></div>';
      q('skLayers').innerHTML = out;
      q('skLayers').querySelectorAll('.skly').forEach(r => { const i = +r.dataset.i; r.onclick = ev => { const a = ev.target.dataset && ev.target.dataset.a;
        if (a === 'vis') { e.b.v = ev.target.checked ? 1 : 0; mark(); all(); return; }
        if (i === -1) { if (!isBoss(st.sel)) st.li = -1; all(); return; }
        if (a === 'del') { ls.splice(i, 1); st.li = Math.min(st.li, ls.length - 1); mark(); } else if (a === 'up' && i < ls.length - 1) { [ls[i], ls[i + 1]] = [ls[i + 1], ls[i]]; st.li = i + 1; mark(); } else if (a === 'dn' && i > 0) { [ls[i], ls[i - 1]] = [ls[i - 1], ls[i]]; st.li = i - 1; mark(); } else st.li = i; all(); }; });
      q('skAddTxt').textContent = ls.length >= SK_LAYERS ? 'At most ' + SK_LAYERS + ' pictures' : '+ Add a picture…'; q('skFile').disabled = ls.length >= SK_LAYERS; };
    const ctl = () => { const e = ent(), o = cur(), base = st.li === -1 && !!o && e && e.mode === 'free', md = e ? e.mode : 'piece';
      q('skName').textContent = nameOf(st.sel) + (hasPics(st.sel) ? '' : ' (default art)');
      root.querySelectorAll('input[name=skMode]').forEach(r => { r.checked = r.value === md; });
      q('skShapeBox').style.display = md === 'shape' ? '' : 'none'; q('skEditShape').textContent = st.edit ? 'Done editing' : 'Edit the outline'; q('skSmooth').checked = !!(e && e.k && smoothOf(e)); q('skSmooth').disabled = !(e && e.k);
      q('skCtl').style.display = o ? '' : 'none'; q('skCtlT').textContent = base ? 'The original icon' : 'Selected picture';
      q('skORow').style.display = base ? 'none' : ''; q('skFlipRow').style.display = base ? 'none' : ''; q('skCover').style.display = base ? 'none' : '';
      if (o) { [['skX2', 'x', 'oX'], ['skY2', 'y', 'oY'], ['skS', 's', 'oS'], ['skR', 'r', 'oR'], ['skO', 'o', 'oO']].forEach(([id, k, out]) => { if (o[k] === undefined) return; q(id).value = o[k]; q(out).textContent = Math.round(o[k]) + (k === 'r' ? '°' : k === 's' || k === 'o' ? '%' : ''); }); q('skFlip').checked = !!o.f; }
      q('skTint').checked = !!(e && e.c); ['skTint', 'skTintGrp', 'skPReset'].forEach(i => { q(i).disabled = !e; });
      q('skHint').textContent = st.edit ? 'Editing the outline: click the edge to add a point, drag a point to move it, double-click a point to delete it.' : o ? 'Drag to move · drag a corner to resize · drag the round handle to rotate (Shift = steps of 15°) · mouse wheel = size' : 'Add a picture to start.'; };
    const all = () => { layersUI(); ctl(); polyUI(); stage(); paintCell(); };
    const grid = () => { q('skList').innerHTML = st.groups.map(g => '<h4>' + g.name + '</h4><div class="skg">' + g.list.map(([t, nm]) => '<button type="button" class="skp' + (t === st.sel ? ' sel' : '') + '" data-t="' + t + '"><span class="ic">' + html(t) + '</span>' + nm + (hasPics(t) ? '<i></i>' : '') + '</button>').join('') + '</div>').join('');
      q('skList').querySelectorAll('.skp').forEach(b => { b.onclick = () => { st.sel = b.dataset.t; st.edit = false; const e = ent(); st.li = e && e.l.length ? e.l.length - 1 : 0; q('skList').querySelectorAll('.skp').forEach(x => x.classList.toggle('sel', x === b)); all(); }; }); };
    const sel = () => { q('skSel').innerHTML = st.list.map(p => '<option value="' + p.id + '"' + (p === st.cur ? ' selected' : '') + '>' + p.name.replace(/</g, '&lt;') + (SKIN.preset && SKIN.preset.id === p.id ? ' (in use)' : '') + '</option>').join(''); };
    const setO = (k, v) => { const o = cur(); if (!o) return; o[k] = v; mark(); ctl(); stage(); paintCell(); layersUI(); };
    const guard = async () => { if (!st.dirty) return true; const ok = await askConfirm('You have changes that are not saved. Leave them behind?', 'Discard changes', true); if (ok) draftDel(); return ok; };
    q('skSel').onchange = async () => { const id = q('skSel').value; if (!(await guard())) { sel(); return; } await reloadFromDb(); st.cur = st.list.find(p => p.id === id) || st.list[0]; st.li = 0; st.edit = false; st.dirty = false; resetHist(); q('skMsg').textContent = ''; sel(); grid(); all(); };
    const reloadFromDb = () => SkDB.all().then(fresh => { const have = new Set(fresh.map(p => p.id)); st.list = st.list.filter(p => p.fresh && !have.has(p.id)).concat(fresh.map(p => { const np = {}; Object.keys(p.pieces || {}).forEach(t => { const e = skMig(p.pieces[t], t); if (e && e.l.length) np[t] = e; }); p.pieces = np; return p; })); });
    q('skNew').onclick = async () => { if (!(await guard())) return; st.cur = mk(); st.list.push(st.cur); st.li = 0; st.edit = false; st.dirty = false; resetHist(); q('skMsg').textContent = ''; sel(); grid(); all(); };
    q('skRen').onclick = async () => { const n = await askText('Name this skin set', st.cur.name, 'Rename', 30); if (n) { st.cur.name = n.slice(0, 30); mark(); sel(); } };
    q('skDel').onclick = async () => { if (!(await askConfirm('Delete the set "' + st.cur.name + '" for good?', 'Delete set', true))) return; SkDB.del(st.cur.id); if (SKIN.preset && SKIN.preset.id === st.cur.id) skinActivate(null); st.list = st.list.filter(p => p !== st.cur); if (!st.list.length) st.list.push(mk()); st.cur = st.list[0]; st.li = 0; st.edit = false; st.dirty = false; resetHist(); q('skMsg').textContent = ''; sel(); grid(); all(); refreshSkinNow(); };
    q('skFile').onchange = ev => { const f = ev.target.files && ev.target.files[0]; ev.target.value = ''; if (!f) return;
      q('skMsg').textContent = 'Reading the picture…';
      skinImport(f, d => { if (!d) { q('skMsg').textContent = 'That picture could not be used.'; return; } const e = ensure(); if (e.l.length >= SK_LAYERS) return; e.l.push({ img: d, x: 0, y: 0, s: 100, r: 0, f: 0, o: 100 }); st.li = e.l.length - 1; mark(); all(); }); };
    [['skX2', 'x'], ['skY2', 'y'], ['skS', 's'], ['skR', 'r'], ['skO', 'o']].forEach(([id, k]) => { q(id).oninput = () => setO(k, +q(id).value); });
    q('skFlip').onchange = () => setO('f', q('skFlip').checked ? 1 : 0);
    q('skLReset').onclick = () => { const o = cur(); if (!o) return; Object.assign(o, { x: 0, y: 0, s: 100, r: 0 }); if (o.f !== undefined) { o.f = 0; o.o = 100; } mark(); all(); };
    q('skCover').onclick = () => { const o = cur(); if (!o || st.li < 0) return; Object.assign(o, { x: 0, y: 0, r: 0, s: Math.round(100 / unit()) }); mark(); all(); };
    root.querySelectorAll('input[name=skMode]').forEach(r => { r.onchange = () => { const e = ensure(); e.mode = r.value; st.edit = false; if (e.mode === 'shape' && !e.k) { const S = SHAPES[0]; setPts(e, S[2], S[1]); } if (e.mode !== 'free' && st.li === -1) st.li = Math.max(0, e.l.length - 1); mark(); all(); }; });
    q('skEditShape').onclick = () => { st.edit = !st.edit; all(); };
    q('skSmooth').onchange = () => { const e = ent(); if (!e || !e.k) return; setPts(e, ptsOf(e), q('skSmooth').checked); mark(); all(); };
    q('skTint').onchange = () => { const e = ent(); if (!e) return; e.c = q('skTint').checked ? 1 : 0; mark(); all(); };
    q('skTintGrp').onclick = () => { const g = st.groups.find(g => g.list.some(x => x[0] === st.sel)), on = q('skTint').checked ? 1 : 0; (g ? g.list : []).forEach(([t]) => { const e = st.cur.pieces[t]; if (e && e.l.length) e.c = on; }); mark(); grid(); all(); q('skMsg').textContent = 'Colour setting applied to the whole group (not saved yet).'; };
    q('skPReset').onclick = async () => { if (!(await askConfirm('Put ' + nameOf(st.sel) + ' back to the default art? (This set only changes when you press Save.)', 'Reset piece', true))) return; delete st.cur.pieces[st.sel]; st.li = 0; st.edit = false; mark(); all(); };
    q('skAReset').onclick = async () => { if (!(await askConfirm('Remove EVERY picture and setting from the set "' + st.cur.name + '"? (It only changes when you press Save, so closing without saving brings it back.)', 'Reset all pieces', true))) return; st.cur.pieces = {}; st.li = 0; st.edit = false; mark(); grid(); all(); };
    /* ---- direct manipulation on the stage: move, resize (corners), rotate (round handle) ---- */
    const gesture = (ev, kind, el) => { const o = cur(); if (!o || st.edit) return; ev.preventDefault(); ev.stopPropagation(); el.setPointerCapture(ev.pointerId);
      const R = big.getBoundingClientRect(), W = R.width, base = st.li === -1, ux = base ? 1 : unit(), cx = R.left + W / 2 + o.x * ux / 100 * W, cy = R.top + W / 2 + o.y * ux / 100 * W;
      const x0 = ev.clientX, y0 = ev.clientY, o0 = { x: o.x, y: o.y, s: o.s, r: o.r }, d0 = Math.hypot(x0 - cx, y0 - cy) || 1, a0 = Math.atan2(y0 - cy, x0 - cx);
      const mv = m => { if (kind === 'move') { o.x = clamp(Math.round(o0.x + (m.clientX - x0) / (W * ux) * 100), -300, 300); o.y = clamp(Math.round(o0.y + (m.clientY - y0) / (W * ux) * 100), -300, 300); }
        else if (kind === 'scale') o.s = clamp(Math.round(o0.s * Math.hypot(m.clientX - cx, m.clientY - cy) / d0), 5, 1000);
        else { let r = o0.r + (Math.atan2(m.clientY - cy, m.clientX - cx) - a0) * 180 / Math.PI; if (m.shiftKey) r = Math.round(r / 15) * 15; o.r = Math.round(((r + 180) % 360 + 360) % 360 - 180); }
        mark(); ctl(); stage(); paintCell(); };
      const up = () => { el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); layersUI(); };
      el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); };
    big.addEventListener('pointerdown', ev => gesture(ev, 'move', big));
    q('skSelBox').querySelectorAll('.h').forEach(h => { h.addEventListener('pointerdown', ev => gesture(ev, h.dataset.h === 'rot' ? 'rotate' : 'scale', h)); });
    big.addEventListener('wheel', ev => { const o = cur(); if (!o || st.edit) return; ev.preventDefault(); if (ev.shiftKey) { let r = o.r - Math.sign(ev.deltaY || ev.deltaX) * 5; if (r > 180) r -= 360; if (r < -180) r += 360; o.r = r; } else o.s = clamp(Math.round(o.s * (ev.deltaY < 0 ? 1.06 : 1 / 1.06)), 5, 1000); mark(); ctl(); stage(); paintCell(); }, { passive: false });
    const save = use => { const p = st.cur; delete p.fresh; const copy = JSON.parse(JSON.stringify(p)); Object.keys(copy.pieces).forEach(t => { const e = copy.pieces[t]; if (!e.l.length) { delete copy.pieces[t]; return; } e.l.forEach(L => { delete L.h; }); });
      SkDB.put(copy).then(() => { st.dirty = false; draftDel(); if (use) skinActivate(p); else if (SKIN.preset && SKIN.preset.id === p.id) skinActivate(p); q('skMsg').textContent = use ? 'Saved. Your pieces now use this set.' : 'Saved.'; sel(); refreshSkinNow(); }); };
    q('skSave').onclick = () => save(true); q('skSave2').onclick = () => save(false);
    q('skOff').onclick = () => { skinActivate(null); q('skMsg').textContent = 'You are using the default pieces again (your sets are still saved).'; sel(); refreshSkinNow(); };
    const close = async () => { if (!(await guard())) return; clearTimeout(draftT); document.removeEventListener('keydown', esc); root.remove(); refreshSkinNow(); };
    const esc = ev => { if (!$('dlgBack').classList.contains('hidden') || (ev.target && ev.target.id === 'dlgIn')) return; const k = ev.key.toLowerCase();
      if (k === 'escape') { if (st.edit) { st.edit = false; all(); } else close(); }
      else if ((ev.ctrlKey || ev.metaKey) && k === 'z') { ev.preventDefault(); if (ev.shiftKey) undoRedo(fut, hist); else undoRedo(hist, fut); }
      else if ((ev.ctrlKey || ev.metaKey) && k === 'y') { ev.preventDefault(); undoRedo(fut, hist); } };
    q('skUndo').onclick = () => undoRedo(hist, fut); q('skRedo').onclick = () => undoRedo(fut, hist);
    document.addEventListener('keydown', esc); q('skX').onclick = close; root.addEventListener('pointerdown', ev => { if (ev.target === root) close(); });
    q('skExp').onclick = () => { const copy = JSON.parse(JSON.stringify(st.cur.pieces, (k, v) => (k === 'h' ? undefined : v))); const blob = new Blob([JSON.stringify({ cwfSkin: 1, name: st.cur.name, pieces: copy })], { type: 'application/json' }), a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = (st.cur.name.replace(/[^\w-]+/g, '_') || 'skin') + '.cwfskin.json'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); q('skMsg').textContent = 'Exported "' + st.cur.name + '" (' + Object.keys(copy).length + ' pieces).'; };
    q('skImp').onchange = async ev => { const f = ev.target.files && ev.target.files[0]; ev.target.value = ''; if (!f) return;
      if (f.size > 40e6) { q('skMsg').textContent = 'That file is too big to be a skin set.'; return; }
      let o; try { o = JSON.parse(await f.text()); } catch (e) { q('skMsg').textContent = 'That is not a skin file.'; return; }
      if (!o || o.cwfSkin !== 1 || !o.pieces || typeof o.pieces !== 'object') { q('skMsg').textContent = 'That is not a skin file from this game.'; return; }
      if (!(await guard())) return; const np = {}; Object.keys(o.pieces).slice(0, 120).forEach(t => { if (t.length > 3 || t === '__proto__') return; const e = skMig(o.pieces[t], t); if (e && e.l.length) np[t] = e; });
      const n = Object.keys(np).length; if (!n) { q('skMsg').textContent = 'No usable pieces in that file.'; return; }
      const p = mk(); p.name = String(o.name || 'Imported').replace(/[<>]/g, '').slice(0, 24) + ' (imported)'; p.pieces = np; st.list.push(p); st.cur = p; st.li = 0; st.edit = false; resetHist(); sel(); grid(); all(); mark(); q('skMsg').textContent = 'Imported ' + n + ' pieces. Press Save to keep this set.'; };
    sel(); shapeBtns(); grid(); all(); resetHist();
    SkDB.drafts().then(async ds => { const d = ds.sort((a, b) => b.t - a.t)[0]; if (!d || !document.getElementById('skinEd')) return;
      if (!(await askConfirm('You have unsaved skin changes from an earlier session ("' + d.name + '"). Restore them?', 'Restore', false))) { ds.forEach(x => SkDB.del(x.id)); return; }
      const np = {}; Object.keys(d.pieces || {}).forEach(t => { const e = skMig(d.pieces[t], t); if (e && e.l.length) np[t] = e; });
      let p = st.list.find(x => x.id === d.setId); if (!p) { p = { id: d.setId, name: d.name, pieces: {}, fresh: true }; st.list.push(p); }
      p.pieces = np; p.name = d.name; st.cur = p; st.li = 0; st.edit = false; resetHist(); sel(); grid(); all(); mark(); q('skMsg').textContent = 'Restored your unsaved changes. Press Save to keep them.'; });
  });
}
function refreshSkinNow() {
  $('skinNow').textContent = SKIN.preset ? 'Using: ' + SKIN.preset.name + ' (' + Object.keys(SKIN.mine).length + ' pieces)' : 'Using the default pieces.';
  SkDB.all().then(list => { const box = $('skinSets'); if (!box) return; box.innerHTML = '';
    const row = (id, label) => { const l = document.createElement('label'), r = document.createElement('input'); r.type = 'radio'; r.name = 'skSetSel'; r.checked = (SKIN.preset ? SKIN.preset.id : '') === id; r.onchange = () => { skinActivate(id ? list.find(p => p.id === id) : null); refreshSkinNow(); }; l.appendChild(r); l.appendChild(document.createTextNode(' ' + label)); box.appendChild(l); };
    row('', 'No skin (default pieces)'); list.forEach(p => row(p.id, p.name)); });
}
