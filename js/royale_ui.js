/* Chess Royale screen. All rules live in royale.js; this file draws, reads input and runs the 0.25 s tick. Network play: the host runs the sim and sends the
   guest a state every tick (js/royale_net.js); the guest's copy only loads those states and sends commands. Your own side is always drawn at the bottom.
   Cards: Q/W/E/R or click, then a highlighted square (spells: anywhere). Pieces: click, shift-click, drag a box, double-click (same type), Select all (A),
   Ctrl+1..5 saves a group, 1..5 recalls it. King: Send / Recall. Built so a stub DOM can drive it (tests/royale_ui.test.js): elements come from createElement
   and are kept in variables, no innerHTML templates (innerHTML is only used to drop an icon SVG into a span). */
const RoyaleUI = (() => {
  const GLYPH = { p: '\u265F', n: '\u265E', b: '\u265D', r: '\u265C', q: '\u265B', k: '\u265A', '\u03b3': '\u03b3', ph: '\u265F\u265F\u265F', surge: '\u26A1', stampede: '\u2733', zug: '\u2744', barr: '\u25A6', fortress: '\u265A', bastion: '\u2656' };
  const HOT = ['Q', 'W', 'E', 'R'], SPELL_COL = { surge: '255,210,60', stampede: '255,140,40', zug: '90,200,255', barr: '150,100,50' };
  const CAMEL = '\u03b3', LIGHT = '#f4f1e6', DARK = '#222';
  // Icons for the cards and towers that no other mode has (24x24, currentColor, same style as the existing set). Pieces use the existing icons through art() in js/skins.js.
  const NEW_ICONS = {
    ph: '<svg viewBox="0 0 24 24" aria-hidden="true">' + [5, 12, 19].map(x => '<circle cx="' + x + '" cy="7" r="2.3" fill="currentColor"/><path d="M' + (x - 3) + ' 18c.2-3.4 1.1-4.6 3-5.8 1.9 1.2 2.8 2.4 3 5.8z" fill="currentColor"/><rect x="' + (x - 3.4) + '" y="18" width="6.8" height="2.4" rx="1" fill="currentColor"/>').join('') + '</svg>',
    surge: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.6 1.8L5 13.4h5.6L9.4 22.2 19 9.6h-5.8z" fill="currentColor"/></svg>',
    stampede: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.5l2.5 6.4 6.8-.5-5.2 4.5 3.2 6-6.4-2.3L12 22.5l-.9-6.9-6.4 2.3 3.2-6L2.700 7.400l6.800.5z" fill="currentColor"/></svg>',
    zug: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2v20M3.4 7l17.200 10M3.400 17L20.600 7M9 3.800l3 2.600 3-2.600M9 20.200l3-2.600 3 2.600" stroke="currentColor" stroke-width="1.9" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    barr: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.500 21V8.500L6 6l2.500 2.500V21zM10.800 21V8.500L13.300 6l2.500 2.500V21zM18 21V8.500L20.500 6 23 8.500V21z" fill="currentColor" transform="translate(-1.5 0)"/><path d="M1.500 12.500h21M1.500 17h21" stroke="#000a" stroke-width="1.400"/></svg>',
    fortress: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.500 21.500V7h3.600v3h2V4h2.800v3h2.200V4h2.800v6h2V7h3.600v14.500z" fill="currentColor"/><path d="M9.800 21.500v-5.200a2.200 2.200 0 0 1 4.400 0v5.200z" fill="#000a"/></svg>',
    bastion: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.500 21.500V8.500H8V5.500h2.500v3h3v-3H16v3h2.500v13z" fill="currentColor"/><path d="M10.200 21.500v-4a1.800 1.800 0 0 1 3.600 0v4z" fill="#000a"/></svg>'
  };
  const CARD_TEXT = {
    p: 'Cheap swarm piece. Marches forward, hits diagonally, and cannot attack while an enemy blocks it head-on. Can be told to Hold or Promote.',
    n: 'Charges for the Fortress, leaping over everything. Ignores the King. Locked: takes no orders.',
    b: 'Zig-zags up the board, hitting along its diagonals (up to 3 squares).',
    r: 'Goes straight for the towers along files and ranks. Locked: takes no orders.',
    q: 'Hunts the most valuable piece in reach, then the towers.',
    '\u03b3': 'Fast flanker: leaps (3,1), goes for weak pieces, then towers. Locked: takes no orders.',
    ph: 'Three pawns side by side on one rank (needs three free squares).',
    surge: 'Every friendly piece in a 3x3 area gets one free action right away (its cooldown is not reset).',
    stampede: 'Like Surge, but a 5x5 area.',
    zug: 'Freezes enemy pieces in a 3x3 area for 2.5 s. Frozen pieces can still be hit.',
    barr: 'Blocks 3 squares in a row for 8 s. It blocks your own pieces too; leapers jump over it.'
  };
  const DEFAULT_SETTINGS = { cd: true, hp: true, flash: true, nums: true, sound: true, fb: true, orderCd: 2, autoRecall: false, lowWarn: true };
  const SETTING_TEXT = {
    cd: ['Cooldown bars under pieces', 'Shows how soon each piece acts again.'], hp: ['Health bars', 'Health bars over pieces with more than 1 Health.'],
    flash: ['Hit flashes', 'A ring flashes where something is hit or destroyed.'], nums: ['Damage numbers', 'Small numbers float up when something takes damage.'],
    sound: ['Sounds', 'Uses the game sound setting too.'], fb: ['Promotion fall-back', 'ON: a pawn whose chosen piece is already alive takes the best available one. OFF: it waits on the back rank.'],
    orderCd: ['Order cooldown', 'How long a piece must wait between orders (2 s or none). Applies to matches you host or play against the bot.'],
    autoRecall: ['Auto-recall the King', 'Safe mode: the King is recalled by himself when your Fortress drops to 30%. A recall can still be interrupted.'], lowWarn: ['Low-health warning', 'Flashes the screen when your Fortress drops to 30%.']
  };
  let root = null, visible = false, low = false, canvas = null, ctx = null, panel = null, panelBody = null, matFill = null, matText = null, timerEl = null, msgEl = null, infoEl = null, hand = [], nextEl = null, pauseBtn = null;
  let selInfo = null, ordBtns = {}, promoRow = null, kingBtn = null, allBtn = null;
  let sim = null, bot = null, timer = null, raf = 0, sel = -1, kingMode = false, level = 'normal', paused = false, cell = 20, lastTime = 0, before = {}, fx = [], mode = 'menu';
  let deck = null, picked = new Set(), groups = {}, hover = null, drag = null, lastClick = null, settings = null, me = 'w', net = null, netRole = null, netInfo = '', rid = 0, stats = null, sideOf = {}, lowWarned = false, autoRecallAt = -99;
  let spec = false, specN = 0, names = { w: '', b: '' }, chat = [], lastRoom = null, matchTok = '', graceTimer = null, graceLeft = 0, reconTimer = null, reconTries = 0, reconnecting = false, byeSeen = false, roomShown = '', chatWrap = null, chatEl = null, chatIn = null, oppEl = null, lastChatAt = 0, hostChatAt = {}, guestHello = null;
  const icons = new Map();
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const TICK = () => Royale.CONSTANTS.TICK_MS;
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const secs = ticks => (ticks * TICK() / 1000).toFixed(ticks * TICK() % 1000 ? 2 : 1).replace(/\.?0+$/, '') + ' s';
  const mineUnits = () => sim.st.units.filter(u => u.side === me);
  const other = s => (s === 'w' ? 'b' : 'w');
  const sfxSafe = n => { if (settings && settings.sound && typeof sfx === 'function') { try { sfx(n); } catch (e) { /* no sound */ } } };

  // ---- settings (kept on this device)
  function loadSettings() {
    const s = Object.assign({}, DEFAULT_SETTINGS);
    try { const raw = JSON.parse(localStorage.getItem('cwfRoyale') || '{}'); Object.keys(DEFAULT_SETTINGS).forEach(k => { if (typeof raw[k] === typeof DEFAULT_SETTINGS[k]) s[k] = raw[k]; }); if (s.orderCd !== 0 && s.orderCd !== 2) s.orderCd = 2; } catch (e) { /* no storage or bad data: defaults */ }
    return s;
  }
  const saveSettings = () => { try { localStorage.setItem('cwfRoyale', JSON.stringify(settings)); } catch (e) { /* private mode: not remembered */ } };

  // ---- icons: the existing piece icons (art() in js/skins.js) plus the new ones above; the unicode glyph is the fallback
  function iconSvg(code) {
    if (NEW_ICONS[code]) return NEW_ICONS[code];
    try { if (typeof art === 'function') { const a = art(code); if (a) return a; } } catch (e) { /* fall back to the glyph */ }
    return null;
  }
  function setIcon(e, code) { const svg = iconSvg(code); if (svg) e.innerHTML = svg; else e.textContent = GLYPH[code] || '?'; }
  function iconImage(code, color) {                           // an <img> of the icon in one colour, for the canvas; null until it has loaded (or if there is no icon)
    if (typeof Image === 'undefined') return null; const key = code + '|' + color; let rec = icons.get(key);
    if (rec) return rec.ok ? rec.img : null;
    const svg0 = iconSvg(code); rec = { ok: false, img: null }; icons.set(key, rec); if (!svg0) return null;
    const det = color === DARK ? LIGHT : DARK, svg = svg0.replace(/currentColor/g, color).replace(/var\(--dets?\)/g, det).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" ');
    try { const img = new Image(); rec.img = img; img.onload = () => { rec.ok = true; }; img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); } catch (e) { /* no icon */ }
    return null;
  }

  // ---- building the page
  function build() {
    deck = Royale.DEFAULT_DECK.slice(); settings = loadSettings();
    root = el('div'); root.id = 'royaleUI';
    const bar = el('div', 'rbar'); bar.appendChild(el('b', '', 'Chess Royale (beta)')); timerEl = el('span', 'rtimer', '3:00');
    pauseBtn = el('button', '', 'Pause'); pauseBtn.addEventListener('click', togglePause);
    const quit = el('button', '', 'Quit'); quit.addEventListener('click', close);
    oppEl = el('span', 'ropp', ''); bar.appendChild(oppEl); bar.appendChild(timerEl); bar.appendChild(pauseBtn); bar.appendChild(quit); root.appendChild(bar);
    const wrap = el('div', 'rwrap'); canvas = el('canvas');
    canvas.addEventListener('pointerdown', onDown); canvas.addEventListener('pointermove', onMove); canvas.addEventListener('pointerup', onUp); wrap.appendChild(canvas);
    panel = el('div', 'rpanel'); panelBody = el('div', 'rpanelbody'); panel.appendChild(panelBody); wrap.appendChild(panel); root.appendChild(wrap);
    const hud_ = el('div', 'rhud'), mat = el('div', 'rmat'); mat.appendChild(el('span', '', 'Material'));
    const bar2 = el('div', 'rmatbar'); matFill = el('div', 'rmatfill'); bar2.appendChild(matFill); mat.appendChild(bar2); matText = el('b', '', '5'); mat.appendChild(matText); hud_.appendChild(mat);
    const ords = el('div', 'rords'); selInfo = el('span', 'rinfo', 'Nothing selected'); ords.appendChild(selInfo);
    allBtn = el('button', 'rbtn', 'Select all'); allBtn.title = 'Select every piece you have (A)'; allBtn.addEventListener('click', selectAll); ords.appendChild(allBtn);
    const OT = { attack: 'Back to normal behaviour', hold: 'Stay in your half and guard', promote: 'Pawns: run for the enemy back rank' };
    ['attack', 'hold', 'promote'].forEach(o => { const b = el('button', 'rbtn off', cap(o)); b.title = OT[o]; b.addEventListener('click', () => sendOrder(o)); ordBtns[o] = b; ords.appendChild(b); });
    promoRow = el('span', 'rpromo hidden'); promoRow.appendChild(el('span', '', 'Promote to:'));
    [['auto', 'Auto'], ['n', 'n'], ['b', 'b'], ['r', 'r'], ['q', 'q']].forEach(p => { const b = el('button', 'rbtn'); if (p[0] === 'auto') b.textContent = 'Auto'; else { const g = el('span', 'g'); setIcon(g, p[1]); b.appendChild(g); b.title = Royale.DEFS[p[1]].name; } b.addEventListener('click', () => sendPromoteTo(p[0])); promoRow.appendChild(b); });
    ords.appendChild(promoRow);
    kingBtn = el('button', 'rbtn', 'Send King'); kingBtn.title = 'Send your King out to fight for free (the Fortress goes quiet while he is away)'; kingBtn.addEventListener('click', kingButton); ords.appendChild(kingBtn); hud_.appendChild(ords);
    const row = el('div', 'rhand');
    for (let i = 0; i < 4; i++) { const b = el('button', 'rcard'), g = el('span', 'g'), n = el('small', 'n'), c = el('small', 'c'); b.appendChild(g); b.appendChild(n); b.appendChild(c); b.addEventListener('click', () => pick(i)); hand.push({ b, g, n, c, card: null }); row.appendChild(b); }
    nextEl = el('div', 'rnext'); nextEl.appendChild(el('small', '', 'next')); const ng = el('span', 'g'); nextEl.appendChild(ng); nextEl.g = ng; row.appendChild(nextEl); hud_.appendChild(row);
    infoEl = el('div', 'rinfoline', ''); hud_.appendChild(infoEl); msgEl = el('div', 'rmsg'); hud_.appendChild(msgEl);
    chatWrap = el('div', 'rchat'); chatEl = el('div', 'rchatlines'); chatIn = el('input', 'rchatin'); chatIn.placeholder = 'Chat (press Enter to send)'; chatIn.maxLength = 200;
    chatIn.addEventListener('keydown', e => { if (e.key === 'Enter') { if (sendChat(chatIn.value)) chatIn.value = ''; } e.stopPropagation(); });
    chatWrap.appendChild(chatEl); chatWrap.appendChild(chatIn); chatWrap.style.display = 'none'; hud_.appendChild(chatWrap); root.appendChild(hud_); document.body.appendChild(root); syncRoot();
    if (typeof window !== 'undefined' && window.addEventListener) { window.addEventListener('resize', resize); window.addEventListener('keydown', onKey, true); }
  }
  const syncRoot = () => { root.className = (visible ? '' : 'hidden') + (low ? ' rlow' : '') + (spec ? ' rspec' : ''); };
  function showPanel(title, text, extras, buttons) {
    panelBody.innerHTML = ''; const r = el('div', 'rrow');
    panelBody.appendChild(el('h2', '', title)); if (text) panelBody.appendChild(el('p', '', text)); extras.forEach(x => panelBody.appendChild(x));
    buttons.forEach(b => { const x = el('button', b.on ? 'on' : '', b.label); if (b.title) x.title = b.title; x.addEventListener('click', b.go); r.appendChild(x); });
    panelBody.appendChild(r); panel.className = 'rpanel';
  }
  const hidePanel = () => { panel.className = 'rpanel hidden'; };
  const section = t => el('h3', 'rsec', t);

  // ---- helpers for the network screens
  const savedCode = () => { try { return localStorage.getItem('cwfRoyaleCode') || ''; } catch (e) { return ''; } };
  const saveCode = c => { try { localStorage.setItem('cwfRoyaleCode', c); } catch (e) { /* not remembered */ } };
  const myTok = () => { try { let k = localStorage.getItem('cwfRoyaleTok'); if (!k) { k = Math.random().toString(36).slice(2, 12); localStorage.setItem('cwfRoyaleTok', k); } return k; } catch (e) { return 'tok' + Math.floor(Math.random() * 1e9); } };
  const myNameSafe = () => { try { return cleanTxt(typeof myName === 'function' ? myName() : 'Guest', 24) || 'Guest'; } catch (e) { return 'Guest'; } };
  const cleanTxt = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
  const validDeck = d => Array.isArray(d) && d.length === 8 && d.every(c => typeof c === 'string' && Royale.CARDS[c]);
  const clearGrace = () => { if (graceTimer) clearInterval(graceTimer); graceTimer = null; };
  const clearRecon = () => { if (reconTimer) clearTimeout(reconTimer); reconTimer = null; reconnecting = false; };
  const leaveNet = () => { clearGrace(); clearRecon(); if (net) { try { net.close(); } catch (e) { /* closed */ } } net = null; netRole = null; spec = false; specN = 0; matchTok = ''; byeSeen = false; };
  function updateOpp() {
    if (!oppEl) return; const w = specN ? ' \u00B7 ' + specN + ' watching' : '';
    oppEl.textContent = netRole === 'spec' ? (names.w || 'White') + ' vs ' + (names.b || 'Black') : net ? 'vs ' + (names[other(me)] || 'friend') + w : bot ? 'vs ' + (level === 'easy' ? 'Easy bot' : 'Normal bot') : '';
  }
  function renderChat() {
    chatEl.innerHTML = ''; chat.slice(-5).forEach(c => { const d = el('div', 'rchatline ' + c.who); d.textContent = c.name + ': ' + c.text; chatEl.appendChild(d); });
  }
  function addChat(who, name, text) { chat.push({ who, name: name || (who === 's' ? 'Spectator' : 'Friend'), text }); if (chat.length > 50) chat.shift(); renderChat(); }
  function broadcastChat(who, name, text) { addChat(who, name, text); if (net) net.sendAll({ type: 'ry_chat', who, name, text }); }
  function sendChat(raw) {
    const text = cleanTxt(raw, 200), t = now(); if (!text || !net || t - lastChatAt < 500) return false; lastChatAt = t;
    if (netRole === 'host') broadcastChat('w', names.w || myNameSafe(), text); else net.send({ type: 'ry_chat', text }); return true;
  }

  // ---- menus
  function menu() {
    mode = 'menu'; stopLoop(); leaveNet(); me = 'w'; low = false; syncRoot(); chatWrap.style.display = 'none'; updateOpp();
    const lv = l => ({ label: l === 'easy' ? 'Easy bot' : 'Normal bot', on: level === l, go: () => { level = l; menu(); } });
    const grid = el('div', 'rdeck');
    Royale.CARD_IDS.forEach(id => { const c = Royale.CARDS[id], b = el('button', 'rdeckcard' + (deck.indexOf(id) >= 0 ? ' on' : '')), g = el('span', 'g'); setIcon(g, id); b.appendChild(g); b.appendChild(el('span', '', c.name + ' (' + c.cost + ')')); b.title = CARD_TEXT[id] || '';
      b.setAttribute('data-card', id); b.addEventListener('click', () => { const i = deck.indexOf(id); if (i >= 0) deck.splice(i, 1); else if (deck.length < 8) deck.push(id); menu(); }); grid.appendChild(b); });
    const info = el('p', '', 'Your deck: ' + deck.length + ' / 8 cards' + (deck.length === 8 ? '.' : ' (pick exactly 8 to start).'));
    const joinRow = el('div', 'rrow'), codeIn = el('input', 'rcode'); codeIn.placeholder = "Friend's room code"; codeIn.maxLength = 20; codeIn.value = '';
    const joinBtn = el('button', '', 'Join'), watchBtn = el('button', '', 'Watch'); joinBtn.addEventListener('click', () => joinRoom(codeIn.value, false)); watchBtn.addEventListener('click', () => joinRoom(codeIn.value, true)); watchBtn.title = 'Watch their match without playing';
    joinRow.appendChild(codeIn); joinRow.appendChild(joinBtn); joinRow.appendChild(watchBtn);
    const hostRow = el('div', 'rrow'), fixedIn = el('input', 'rcode'); fixedIn.placeholder = 'Your own room code'; fixedIn.maxLength = 20; fixedIn.value = savedCode(); hostRow.appendChild(el('span', '', 'Your room code:')); hostRow.appendChild(fixedIn);
    const netLine = el('p', 'rnetmsg', netInfo);
    showPanel('Chess Royale', 'Cards cost Material and refill over time. Pieces fight on their own; spells, orders and the King are yours to aim. Break the enemy Fortress (the big tower at the top) before yours falls.',
      [section('Your deck'), info, grid, section('Play a friend'), el('p', '', 'Hosting: leave the code empty for a random room each time, or type your own (7 or more letters or digits is safer) to keep the SAME room every time, so friends can bookmark one link. It is remembered on this device. Joining: type a friend\'s code, or Watch to spectate.'), hostRow, joinRow, netLine],
      [lv('easy'), lv('normal'), { label: 'Start vs bot', on: deck.length === 8, go: () => { if (deck.length === 8) startBot(); }, title: 'Play against the computer' },
       { label: 'Host a match', go: () => { if (deck.length === 8) hostMatch(fixedIn.value); else { netInfo = 'Pick exactly 8 cards first.'; menu(); } } },
       { label: 'Default deck', go: () => { deck = Royale.DEFAULT_DECK.slice(); menu(); } }, { label: 'Settings', go: settingsPanel }, { label: 'How to play', go: helpPanel }, { label: 'Close', go: close }]);
  }
  function settingsPanel() {
    const list = el('div', 'rsettings');
    Object.keys(SETTING_TEXT).forEach(k => {
      const row = el('div', 'rsetrow'), v = settings[k], on = k === 'orderCd' ? v === 2 : v, b = el('button', on ? 'on' : '', k === 'orderCd' ? (v === 2 ? '2 s' : 'None') : (v ? 'On' : 'Off'));
      b.addEventListener('click', () => { if (k === 'orderCd') settings.orderCd = settings.orderCd === 2 ? 0 : 2; else settings[k] = !settings[k]; saveSettings(); settingsPanel(); });
      const tx = el('span', 'rsettext'); tx.appendChild(el('b', '', SETTING_TEXT[k][0])); tx.appendChild(el('small', '', SETTING_TEXT[k][1])); row.appendChild(tx); row.appendChild(b); list.appendChild(row);
    });
    showPanel('Settings', 'Saved on this device.', [list], [{ label: 'Back', on: true, go: () => (mode === 'play' ? hidePanel() : menu()) }]);
  }
  function helpPanel() {
    const L = ['Deploy: press Q, W, E or R (or click a card), then click a green square on your half. Spells can go anywhere.',
      'Select pieces: click, shift-click to add, drag a box over empty squares, double-click a piece to select every piece of that type, A for all.',
      'Groups: Ctrl+1 to 5 saves the selection, 1 to 5 brings it back. Escape clears.', 'Orders: Attack, Hold (guard your half) and Promote (pawns run for the back rank). Knights, rooks and the Camel follow their own behaviour and take no orders.',
      'King: Send King, click a square. Select him and click a square to walk him; Recall brings him home (a hit interrupts it). While he is out your Fortress stops shooting, and any damage he takes is damage to the Fortress.',
      'Win by destroying the enemy Fortress. At time up the side with more towers, then more tower health, wins; a tie goes to sudden death.',
      'Friends: host a match (optionally with your own permanent room code), send the link, and press Start when they have joined. If someone drops, the match waits up to a minute for them. Spectators can watch with the Watch link. Chat appears under the board in friend matches.'];
    showPanel('How to play', '', L.map(x => el('p', 'rhelp', x)), [{ label: 'Back', on: true, go: () => (mode === 'play' ? hidePanel() : menu()) }]);
  }

  // ---- starting games
  function resetUi() { sel = -1; kingMode = false; picked = new Set(); groups = {}; hover = null; drag = null; lastClick = null; fx = []; before = {}; paused = false; pauseBtn.textContent = 'Pause'; msgEl.textContent = ''; infoEl.textContent = '';
    stats = { dep: { w: 0, b: 0 }, lost: { w: 0, b: 0 }, towers: { w: 0, b: 0 }, casts: { w: 0, b: 0 } }; sideOf = {}; low = false; lowWarned = false; autoRecallAt = -99; syncRoot(); mode = 'play'; lastTime = now(); hidePanel(); chatWrap.style.display = net ? '' : 'none'; resize(); }
  const matchCfg = oppFb => ({ PROMO_FALLBACK: { w: settings.fb, b: oppFb }, ORDER_COOLDOWN: settings.orderCd * 4 });
  function newSeed() { return (Math.floor(now() * 1000) % 65535) + 1; }
  function startBot() {
    leaveNet(); const seed = newSeed(); me = 'w'; names = { w: '', b: '' }; sim = Royale.create({ seed, decks: { w: deck.slice(), b: Royale.DEFAULT_DECK.slice() }, cfg: matchCfg(true) }); bot = Royale.bot(level, seed + 1);
    pauseBtn.style.display = ''; resetUi(); updateOpp(); hud(); startLoop(true);
  }
  // The viewers (guest and spectators) get no decks and no seed: with those they could work out the host's hand order. They get the settings and the names only.
  const startMsg = resume => ({ type: 'ry_start', cfg: { PROMO_FALLBACK: sim.K.PROMO_FALLBACK, ORDER_COOLDOWN: sim.K.ORDER_COOLDOWN }, names: { w: names.w, b: names.b }, resume: !!resume });
  function startHosted() {                                              // host: a friend has joined and the host pressed Start (or Rematch)
    if (!net || !net.connected || !guestHello) { msgEl.textContent = 'Your friend has left, so there is nobody to play.'; return; }
    clearGrace(); const seed = newSeed(), hello = guestHello, cfg = matchCfg(hello.fb !== false), oppDeck = validDeck(hello.deck) ? hello.deck.slice() : Royale.DEFAULT_DECK.slice();
    matchTok = typeof hello.tok === 'string' ? hello.tok.slice(0, 40) : ''; me = 'w'; spec = false; bot = null; names.w = myNameSafe();
    sim = Royale.create({ seed, decks: { w: deck.slice(), b: oppDeck }, cfg }); pauseBtn.style.display = 'none'; resetUi(); updateOpp(); hud();
    net.send(startMsg(false)); net.send({ type: 'ry_state', st: sim.view('b'), ev: [] }); net.sendSpecs(startMsg(false)); net.sendSpecs({ type: 'ry_state', st: sim.view('s'), ev: [] }); startLoop(true);
  }
  function resumeHosted(m) {                                            // the guest came back (same token) while the match was waiting for them
    clearGrace(); guestHello = m; names.b = cleanTxt(m.name, 24) || names.b; net.send(startMsg(true)); net.send({ type: 'ry_state', st: sim.view('b'), ev: [] });
    hidePanel(); updateOpp(); msgEl.textContent = (names.b || 'Your friend') + ' is back.'; startLoop(true);
  }
  function showRoom(code) {
    roomShown = code; mode = 'menu'; const base = (typeof location !== 'undefined' ? location.origin + location.pathname : '');
    showPanel('Your room', 'Share this room code or the link. When a friend joins you choose when to start.', [el('p', 'rcodebig', code), el('p', 'rlinkline', 'Join: ' + base + '?royale=' + code), el('p', 'rlinkline', 'Watch: ' + base + '?watch=' + code), el('p', 'rnetmsg', specN ? specN + ' watching' : '')], [{ label: 'Close room', go: menu }]);
  }
  function lobbyPanel() {
    showPanel((names.b || 'A friend') + ' joined', 'Press Start when you are ready.', [el('p', 'rnetmsg', specN ? specN + ' watching' : '')],
      [{ label: 'Start match', on: true, go: startHosted }, { label: 'Send away', go: () => { if (net) net.kick(); guestHello = null; names.b = ''; showRoom(roomShown); } }, { label: 'Close room', go: menu }]);
  }
  function hostMatch(raw) {
    leaveNet(); netInfo = ''; guestHello = null; names = { w: myNameSafe(), b: '' }; chat = []; hostChatAt = {};
    if (!RoyaleNet.available()) { netInfo = 'Network play is not available (PeerJS did not load).'; return menu(); }
    const typed = RoyaleNet.cleanCode(raw);
    if (String(raw || '').trim() && typed.length < 4) { netInfo = 'A room code needs at least 4 letters or digits. Leave it empty for a random one.'; return menu(); }
    if (typed) saveCode(typed);
    netRole = 'host';
    net = RoyaleNet.host({
      onCode: showRoom,
      onRetry: n => showPanel('Claiming your room code', 'That code is still held by the connection server (your last room?). Trying again (' + n + ' of 8)\u2026', [], [{ label: 'Cancel', go: menu }]),
      sameGuest: tok => !!matchTok && tok === matchTok,
      onGuest: m => {
        if (netRole !== 'host') return false;
        if (graceTimer && matchTok && m.tok === matchTok) { resumeHosted(m); return true; }
        if (mode === 'play') return false;                              // a running match: nobody else comes in
        guestHello = m; names.b = cleanTxt(m.name, 24) || 'Guest'; net.send({ type: 'ry_wait', name: names.w }); lobbyPanel(); return true;
      },
      onSpectator: () => { specN = net.specCount; updateOpp(); if (sim && mode === 'play') { net.sendSpecs(startMsg(false)); net.sendSpecs({ type: 'ry_state', st: sim.view('s'), ev: [] }); } else net.sendSpecs({ type: 'ry_wait', name: names.w }); },
      onSpecClose: () => { specN = net ? net.specCount : 0; updateOpp(); },
      onCmd: m => { if (!sim || mode !== 'play' || graceTimer || !m.cmd || typeof m.cmd !== 'object') return; const res = sim.command('b', cleanCmd(m.cmd)); if (net) net.send({ type: 'ry_res', rid: m.rid, ok: res.ok, reason: res.reason || '' }); },
      onChat: (m, who) => { const t = now(), txt = cleanTxt(m.text, 200); if (!txt || (hostChatAt[who] && t - hostChatAt[who] < 600)) return; hostChatAt[who] = t; broadcastChat(who === 'guest' ? 'b' : 's', who === 'guest' ? (names.b || 'Guest') : 'Spectator', txt); },
      onClose: () => guestDropped(), onError: e => { netInfo = e; menu(); } }, { code: typed });
    if (!net) { netInfo = netInfo || 'Could not open a room.'; menu(); }
  }
  function guestDropped() {                                             // the guest's link died
    if (mode === 'play') {
      stopTicking(); graceLeft = 60;
      const show = () => showPanel('Waiting for ' + (names.b || 'your friend'), 'They lost the connection. The match picks up exactly where it was if they come back within ' + graceLeft + ' s.', [], [{ label: 'End match', go: () => endGrace('You ended the match.') }]);
      show(); graceTimer = setInterval(() => { graceLeft--; if (graceLeft <= 0) endGrace('Your friend did not come back in time.'); else show(); }, 1000);
    } else if (mode === 'over') msgEl.textContent = 'Your friend left.';
    else if (guestHello) { guestHello = null; names.b = ''; showRoom(roomShown); }          // they left while the lobby was waiting for Start
  }
  function endGrace(text) { clearGrace(); mode = 'over'; guestHello = null; if (net) net.kick(); showPanel('Match ended', text, [], [{ label: 'Menu', on: true, go: menu }, { label: 'Close', go: close }]); }
  function cleanCmd(c) {                                                // never trust a command from the network: whitelist the fields
    const o = { type: String(c.type) }; ['slot', 'x', 'y'].forEach(k => { if (typeof c[k] === 'number' && isFinite(c[k])) o[k] = c[k]; });
    if (typeof c.order === 'string') o.order = c.order.slice(0, 12); if (typeof c.piece === 'string') o.piece = c.piece.slice(0, 8); if (Array.isArray(c.ids)) o.ids = c.ids.filter(n => typeof n === 'number').slice(0, 200); return o;
  }
  // ---- guest and spectator side
  function joinRoom(rawCode, asSpec) {
    leaveNet(); netInfo = ''; names = { w: '', b: '' }; chat = []; spec = !!asSpec; netRole = asSpec ? 'spec' : 'guest'; me = asSpec ? 'w' : 'b'; lastRoom = { code: RoyaleNet.cleanCode(rawCode), spec: !!asSpec };
    showPanel('Joining\u2026', 'Connecting to the room. If nothing happens in a few seconds, check the code.', [], [{ label: 'Cancel', go: menu }]); connect();
  }
  function connect() {
    net = RoyaleNet.join(lastRoom.code, {
      onOpen: () => { if (net) net.send({ type: 'ry_hello', deck: deck.slice(), fb: settings.fb, name: myNameSafe(), tok: myTok(), spec: lastRoom.spec }); },
      onMsg: onNetMsg, onClose: () => connLost(),
      onError: e => { if (reconnecting) { scheduleRecon(e); return; } leaveNet(); netInfo = e; me = 'w'; menu(); } });
  }
  function connLost() {
    if (netRole !== 'guest' && netRole !== 'spec') return;
    if (byeSeen) { leaveNet(); mode = 'over'; showPanel('Room closed', 'The host closed the room.', [], [{ label: 'Menu', on: true, go: menu }, { label: 'Close', go: close }]); return; }
    if (mode === 'play') { reconnecting = true; reconTries = 0; net = null; attemptRecon(); }
    else if (mode === 'over') { leaveNet(); msgEl.textContent = 'The connection was lost.'; }
    else { leaveNet(); netInfo = 'The connection was lost.'; me = 'w'; menu(); }
  }
  function attemptRecon() { reconTries++; showPanel('Connection lost', 'Reconnecting\u2026 (attempt ' + reconTries + ' of 20). The match waits for you for a minute.', [], [{ label: 'Give up', go: menu }]); connect(); }
  function scheduleRecon(e) { if (reconTries >= 20) { leaveNet(); netInfo = 'Could not reconnect (' + e + ').'; me = 'w'; menu(); return; } reconTimer = setTimeout(attemptRecon, 3000); }
  function onNetMsg(m) {
    if (netRole !== 'guest' && netRole !== 'spec') return;
    if (m.type === 'ry_wait') { reconnecting = false; names.w = cleanTxt(m.name, 24); mode = 'wait'; showPanel(netRole === 'spec' ? 'Watching' : 'Connected', (names.w || 'The host') + ' has not started the match yet. It begins as soon as they press Start.', [], [{ label: 'Leave', go: menu }]); }
    else if (m.type === 'ry_start') {
      reconnecting = false; names = { w: cleanTxt(m.names && m.names.w, 24), b: cleanTxt(m.names && m.names.b, 24) };
      if (m.resume && sim && mode === 'play') { hidePanel(); updateOpp(); msgEl.textContent = 'Reconnected.'; return; }
      me = netRole === 'spec' ? 'w' : 'b'; spec = netRole === 'spec'; bot = null;
      sim = Royale.create({ decks: { w: Royale.DEFAULT_DECK, b: Royale.DEFAULT_DECK }, shuffle: false, cfg: { PROMO_FALLBACK: m.cfg ? m.cfg.PROMO_FALLBACK : true, ORDER_COOLDOWN: Number(m.cfg && m.cfg.ORDER_COOLDOWN) || 0 } });
      pauseBtn.style.display = 'none'; resetUi(); updateOpp(); hud(); startLoop(false);
    } else if (m.type === 'ry_state' && sim && mode === 'play' && m.st && typeof m.st === 'object') {
      before = {}; const pos = {}; sim.st.units.forEach(u => { before[u.id] = [u.x, u.y]; pos[u.id] = [u.x, u.y]; });
      noteSides(); sim.loadState(m.st); lastTime = now(); handleEvents(Array.isArray(m.ev) ? m.ev : [], pos); afterStep();
    } else if (m.type === 'ry_res' && m.ok === false) msgEl.textContent = cap(String(m.reason || 'That did not work'));
    else if (m.type === 'ry_chat' && typeof m.text === 'string') addChat(['w', 'b', 's'].indexOf(m.who) >= 0 ? m.who : 's', cleanTxt(m.name, 24), cleanTxt(m.text, 200));
    else if (m.type === 'ry_bye') byeSeen = true;
  }

  // ---- the game loop
  function startLoop(ticking) { stopLoop(); if (ticking) timer = setInterval(tick, TICK()); const f = () => { render(); raf = requestAnimationFrame(f); }; raf = requestAnimationFrame(f); }
  function stopLoop() { if (timer) clearInterval(timer); timer = null; if (raf && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(raf); raf = 0; }
  function togglePause() { if (mode !== 'play' || net) return; paused = !paused; pauseBtn.textContent = paused ? 'Resume' : 'Pause'; msgEl.textContent = paused ? 'Paused' : ''; }
  const towerCentre = id => { const t = sim.st.towers.find(v => v.id === id); return t ? [t.x0 + (t.w - 1) / 2, t.y0 + (t.h - 1) / 2] : null; };
  const noteSides = () => { sideOf = {}; sim.st.units.forEach(u => { sideOf[u.id] = u.side; }); };
  function tick() {                                                     // local and host games only
    if (!sim || paused || graceTimer || mode !== 'play') return;
    before = {}; const pos = {}; sim.st.units.forEach(u => { before[u.id] = [u.x, u.y]; pos[u.id] = [u.x, u.y]; }); noteSides();
    if (bot) bot.think(sim, 'b'); const evs = sim.step(); lastTime = now();
    if (net && netRole === 'host') { net.send({ type: 'ry_state', st: sim.view('b'), ev: evs }); if (net.specCount) net.sendSpecs({ type: 'ry_state', st: sim.view('s'), ev: evs }); }
    handleEvents(evs, pos); afterStep();
  }
  function handleEvents(evs, pos) {
    evs.forEach(e => {
      const p = e.target != null && pos[e.target] ? pos[e.target] : e.tower ? towerCentre(e.tower) : (e.x != null ? [e.x, e.y] : null);
      if (e.e === 'deploy') stats.dep[e.side]++; else if (e.e === 'cast') stats.casts[e.side]++;
      else if (e.e === 'kill' && sideOf[e.target]) { stats.lost[sideOf[e.target]]++; sfxSafe('capture'); }
      else if (e.e === 'towerDown') { const tw = sim.st.towers.find(v => v.id === e.tower); if (tw) stats.towers[tw.side]++; }
      if (p && settings.flash && (e.e === 'hit' || e.e === 'kill' || e.e === 'towerHit' || e.e === 'towerFire')) fx.push({ x: p[0], y: p[1], t0: lastTime, kill: e.e === 'kill' });
      if (p && settings.nums && e.dmg && (e.e === 'hit' || e.e === 'towerHit' || e.e === 'towerFire')) fx.push({ x: p[0], y: p[1], t0: lastTime, text: '-' + e.dmg, num: true });
      if (e.e === 'spell' && settings.flash) fx.push({ x: e.x, y: e.y, t0: lastTime, spell: e.card });
      if (e.e === 'promote' && e.id != null) { const u = sim.st.units.find(v => v.id === e.id); if (u && u.side === me) { msgEl.textContent = 'A pawn promoted to a ' + Royale.DEFS[e.to].name + '!'; sfxSafe('ping'); } }
      if (e.e === 'kingHome' && e.side === me) msgEl.textContent = 'Your King is home.';
    });
  }
  function afterStep() {
    picked.forEach(id => { if (!sim.st.units.some(u => u.id === id)) picked.delete(id); });
    hud(); if (sim.st.over && mode === 'play') over();
  }
  function over() {
    mode = 'over'; stopTicking(); const w = sim.st.winner, r = sim.st.reason, o = other(me), pre = netRole === 'spec' ? '' : '';
    const lines = [cap(r) + ' after ' + Math.round(sim.st.tick * TICK() / 1000) + ' s.', 'Cards played: ' + (netRole === 'spec' ? 'White ' : 'you ') + (stats.dep[me] + stats.casts[me]) + ', ' + (netRole === 'spec' ? 'Black ' : 'opponent ') + (stats.dep[o] + stats.casts[o]) + '. Pieces lost: ' + stats.lost[me] + ' and ' + stats.lost[o] + '. Towers destroyed: ' + stats.towers[o] + ' and ' + stats.towers[me] + '.'];
    const extras = lines.slice(1).map(x => el('p', '', x)); sfxSafe(w === me ? 'ping' : 'check');
    const viewer = netRole === 'guest' || netRole === 'spec';
    const btns = viewer ? [{ label: 'Menu', go: menu }, { label: 'Close', go: close }] : [{ label: netRole === 'host' ? 'Rematch' : 'Play again', on: true, go: () => (netRole === 'host' ? startHosted() : startBot()) }, { label: 'Menu', go: menu }, { label: 'Close', go: close }];
    const title = netRole === 'spec' ? (w === 'w' ? 'White wins' : w === 'b' ? 'Black wins' : 'Draw') : (w === me ? 'You win!' : w == null ? 'Draw' : 'You lose');
    showPanel(title, lines[0] + (netRole === 'guest' ? ' The host can start a rematch.' : ''), extras, btns);
  }
  const stopTicking = () => { if (timer) clearInterval(timer); timer = null; };
  const fail = res => { msgEl.textContent = res.ok ? '' : cap(res.reason); return res.ok; };
  function submit(cmd) {                                                // the one place a command leaves the UI: straight into the sim, or over the network
    if (netRole === 'spec') return { ok: false, reason: 'Spectators cannot play' };
    if (netRole === 'guest') { const why = sim.can(me, cmd); if (why) return { ok: false, reason: why }; if (net) net.send({ type: 'ry_cmd', cmd, rid: ++rid }); return { ok: true }; }
    return sim.command(me, cmd);
  }
  function pick(i) { if (mode !== 'play' || spec) return; sel = sel === i ? -1 : i; kingMode = false; msgEl.textContent = ''; hud(); }
  function kingButton() {
    if (mode !== 'play' || paused) return; const k = sim.snapshot().king[me];
    if (k.out) { fail(submit({ type: 'recall' })); } else if (sim.st.tick < k.cd) { msgEl.textContent = 'The King is still recovering'; } else { kingMode = !kingMode; sel = -1; msgEl.textContent = kingMode ? 'Click a green square to send the King out' : ''; }
    hud();
  }
  // ---- selection and orders
  const selIds = () => Array.from(picked).filter(id => sim.st.units.some(u => u.id === id));
  function selectAll() { if (mode !== 'play') return; picked = new Set(mineUnits().filter(u => !u.king).map(u => u.id)); hud(); }
  function saveGroup(n) { groups[n] = selIds(); msgEl.textContent = 'Group ' + n + ' saved (' + groups[n].length + ')'; }
  function recallGroup(n) { if (!groups[n]) return; picked = new Set(groups[n].filter(id => sim.st.units.some(u => u.id === id))); hud(); }
  function onlyKing() { if (picked.size !== 1) return null; const u = sim.st.units.find(v => v.id === Array.from(picked)[0]); return u && u.king ? u : null; }
  function boxSelect(d, add) {
    const x0 = Math.min(d.x0, d.x1), x1 = Math.max(d.x0, d.x1), y0 = Math.min(d.y0, d.y1), y1 = Math.max(d.y0, d.y1), ids = mineUnits().filter(u => u.x >= x0 && u.x <= x1 && u.y >= y0 && u.y <= y1).map(u => u.id);
    picked = add ? new Set(Array.from(picked).concat(ids)) : new Set(ids); hud();
  }
  function clickCell(x, y, shift) {
    const u = mineUnits().find(v => v.x === x && v.y === y), t = now();
    if (u) {
      if (lastClick && lastClick.id === u.id && t - lastClick.t < 350 && !u.king) picked = new Set(mineUnits().filter(v => v.t === u.t && !v.king).map(v => v.id));
      else if (shift) { if (picked.has(u.id)) picked.delete(u.id); else picked.add(u.id); } else picked = new Set([u.id]);
      lastClick = { id: u.id, t };
    } else if (onlyKing()) { fail(submit({ type: 'kingOrder', x, y })); }
    else if (!shift) picked = new Set();
    hud();
  }
  function sendOrder(o) { if (mode !== 'play' || paused) return; fail(submit({ type: 'order', ids: selIds(), order: o })); hud(); }
  function sendPromoteTo(p) { if (mode !== 'play' || paused) return; fail(submit({ type: 'promoteTo', ids: selIds(), piece: p })); hud(); }
  // ---- input
  function onKey(e) {
    if (!root || !visible || mode !== 'play' || (e.target && e.target.tagName === 'INPUT')) return; const k = (e.key || '').toLowerCase(), hot = HOT.map(h => h.toLowerCase()).indexOf(k);
    if (hot >= 0) { pick(hot); e.stopPropagation(); }
    else if (k >= '1' && k <= '5') { if (e.ctrlKey || e.metaKey) saveGroup(Number(k)); else recallGroup(Number(k)); if (e.preventDefault) e.preventDefault(); e.stopPropagation(); }
    else if (k === 'a' && !e.ctrlKey && !e.metaKey) { selectAll(); e.stopPropagation(); }
    else if (k === 'escape') { sel = -1; kingMode = false; picked = new Set(); hud(); e.stopPropagation(); }
  }
  function cellAt(e) {                                                  // screen position -> board square (your side is at the bottom)
    const r = canvas.getBoundingClientRect(), W = Royale.CONSTANTS.W, H = Royale.CONSTANTS.H;
    const cx = Math.max(0, Math.min(W - 1, Math.floor((e.clientX - r.left) / (r.width / W)))), cy = Math.max(0, Math.min(H - 1, Math.floor((e.clientY - r.top) / (r.height / H))));
    return me === 'w' ? { x: cx, y: H - 1 - cy } : { x: W - 1 - cx, y: cy };
  }
  function onDown(e) {
    if (mode !== 'play' || paused || spec) return; const c = cellAt(e);
    if (canvas.setPointerCapture && e.pointerId != null) { try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* not fatal */ } }
    if (sel >= 0) { if (fail(submit({ type: 'deploy', slot: sel, x: c.x, y: c.y }))) sel = -1; hud(); return; }
    if (kingMode) { if (fail(submit({ type: 'kingOut', x: c.x, y: c.y }))) { kingMode = false; msgEl.textContent = ''; } hud(); return; }
    drag = { x0: c.x, y0: c.y, x1: c.x, y1: c.y, shift: !!e.shiftKey };
  }
  function onMove(e) {
    if (!sim) return; hover = cellAt(e); if (drag) { drag.x1 = hover.x; drag.y1 = hover.y; }
    const u = sim.st.units.find(v => v.x === hover.x && v.y === hover.y);
    if (u) { const nm = u.king ? 'King' : Royale.DEFS[u.t].name; infoEl.textContent = nm + ' (' + (u.side === me ? 'yours' : 'enemy') + '): Health ' + u.hp + '/' + u.maxhp + ', Damage ' + u.dmg + ', acts every ' + secs(u.cd) + (u.stance && u.stance !== 'attack' ? ', ' + u.stance : '') + ((u.frozenUntil || 0) > sim.st.tick ? ', frozen' : ''); } else infoEl.textContent = '';
  }
  function onUp(e) {
    if (!drag || mode !== 'play') { drag = null; return; } const c = cellAt(e), d = drag; drag = null; d.x1 = c.x; d.y1 = c.y;
    if (d.x0 !== d.x1 || d.y0 !== d.y1) boxSelect(d, d.shift); else clickCell(c.x, c.y, d.shift);
  }
  // ---- HUD
  function hud() {
    if (!sim) return; const s = sim.snapshot(), K = Royale.CONSTANTS, h = s.hands[me];
    matFill.style.width = Math.round(100 * s.matPts[me] / (K.MAT_MAX * K.MAT_PTS)) + '%'; matText.textContent = String(s.mat[me]);
    hand.forEach((c, i) => { const id = h.hand[i]; if (!id) return; const d = Royale.CARDS[id];
      if (c.card !== id) { c.card = id; setIcon(c.g, id); c.n.textContent = d.name; c.b.title = d.name + ' (cost ' + d.cost + '). ' + (CARD_TEXT[id] || '') + (d.kind === 'piece' ? ' Health ' + d.hp + ', Damage ' + d.dmg + ', acts every ' + secs(d.cd) + '.' : ''); }
      c.c.textContent = HOT[i] + '  \u00B7  ' + d.cost; c.b.className = 'rcard' + (sel === i ? ' sel' : '') + (s.mat[me] < d.cost ? ' poor' : ''); });
    if (h.next) { if (nextEl.card !== h.next) { nextEl.card = h.next; setIcon(nextEl.g, h.next); } }
    const left = s.tick < K.REGULAR ? Math.ceil((K.REGULAR - s.tick) * K.TICK_MS / 1000) : 0;
    timerEl.textContent = s.tick < K.REGULAR ? Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0') : 'OVERTIME';
    const ids = selIds(), us = ids.map(id => s.units.find(u => u.id === id)).filter(Boolean), counts = {};
    us.forEach(u => { const n = u.king ? 'King' : Royale.DEFS[u.t].name; counts[n] = (counts[n] || 0) + 1; });
    selInfo.textContent = us.length ? 'Selected: ' + Object.keys(counts).map(n => counts[n] + ' ' + n).join(', ') : 'Nothing selected (drag a box, click, or Select all)';
    ['attack', 'hold', 'promote'].forEach(o => { const ok = us.some(u => Royale.ORDERS[u.t] && Royale.ORDERS[u.t].indexOf(o) >= 0); ordBtns[o].className = 'rbtn' + (ok ? '' : ' off') + (us.some(u => u.stance === o) && ok ? ' on' : ''); });
    promoRow.className = 'rpromo' + (us.some(u => u.t === 'p') ? '' : ' hidden');
    const kg = s.king[me]; kingBtn.textContent = kg.out ? 'Recall King' : s.tick < kg.cd ? 'King resting ' + Math.ceil((kg.cd - s.tick) * K.TICK_MS / 1000) + 's' : kingMode ? 'Cancel King' : 'Send King';
    kingBtn.className = 'rbtn' + (kingMode ? ' on' : '') + (!kg.out && s.tick < kg.cd ? ' off' : '');
    // low-health warning and the optional safe mode (auto-recall)
    const F = s.towers.find(t => t.side === me && t.kind === 'fortress'), danger = !!F && F.hp > 0 && F.hp / F.maxhp <= 0.3;
    if (danger !== low) { low = danger && settings.lowWarn; syncRoot(); }
    if (danger && !lowWarned) { lowWarned = true; if (settings.lowWarn) { msgEl.textContent = 'Your Fortress is in danger!'; sfxSafe('check'); } }
    if (danger && settings.autoRecall && kg.out && mode === 'play' && s.tick - autoRecallAt >= 8) { const ku = s.units.find(u => u.king && u.side === me); if (ku && !ku.recalling) { autoRecallAt = s.tick; submit({ type: 'recall' }); } }
  }
  function resize() {
    if (!canvas) return; const wrap = canvas.parentNode, r = wrap.getBoundingClientRect(), K = Royale.CONSTANTS;
    cell = Math.max(10, Math.floor(Math.min(r.width / K.W, r.height / K.H))); const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    canvas.style.width = cell * K.W + 'px'; canvas.style.height = cell * K.H + 'px'; canvas.width = cell * K.W * dpr; canvas.height = cell * K.H * dpr; ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  // ---- drawing
  function render() {
    if (!sim || !ctx) return; const K = Royale.CONSTANTS, s = sim.st, t = now(), f = Math.min(1, (t - lastTime) / TICK());
    const X = x => (me === 'w' ? x : K.W - 1 - x) * cell, Y = y => (me === 'w' ? K.H - 1 - y : y) * cell;           // top-left pixel of the square (x, y); works for fractions too
    const RX = (x0, w) => (me === 'w' ? x0 : K.W - x0 - w) * cell, RY = (y0, h) => (me === 'w' ? K.H - y0 - h : y0) * cell;      // top-left pixel of a w x h block of squares starting at (x0, y0)
    const card = sel >= 0 ? s.hands[me].hand[sel] : null, info = card ? Royale.CARDS[card] : null;
    const badge = (cx, cy, r, code, side, king) => {
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = side === 'w' ? LIGHT : '#2b2b2b'; ctx.fill(); ctx.lineWidth = king ? 3 : 2; ctx.strokeStyle = king ? '#ffd24a' : side === 'w' ? DARK : '#eee'; ctx.stroke();
      const col = side === 'w' ? DARK : LIGHT, sz = r * 1.7;
      if (!iconDraw(code, col, cx, cy, sz)) { ctx.fillStyle = col; ctx.font = Math.floor(r * 1.45) + 'px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(GLYPH[code] || '?', cx, cy + 1); }
    };
    const iconDraw = (code, col, cx, cy, sz) => { const img = iconImage(code, col); if (!img) return false; try { ctx.drawImage(img, cx - sz / 2, cy - sz / 2, sz, sz); return true; } catch (e) { return false; } };
    for (let y = 0; y < K.H; y++) for (let x = 0; x < K.W; x++) {
      ctx.fillStyle = y === K.RIVER_Y ? (K.BRIDGE_X.indexOf(x) >= 0 ? '#c9a66b' : '#4f8fd6') : ((x + y) % 2 ? '#b58863' : '#e8d9b5'); ctx.fillRect(X(x), Y(y), cell, cell);
      let tint = null;
      if (mode === 'play') {
        if (info && info.kind === 'spell') tint = 'rgba(255,215,0,.12)';
        else if (info && !sim.check(me, sel, x, y)) tint = 'rgba(120,255,120,.35)';
        else if (kingMode && !sim.can(me, { type: 'kingOut', x, y })) tint = 'rgba(120,255,120,.35)';
      }
      if (tint) { ctx.fillStyle = tint; ctx.fillRect(X(x), Y(y), cell, cell); }
    }
    s.barr.forEach(b => { ctx.fillStyle = '#5a3b1a'; ctx.fillRect(X(b.x) + 1, Y(b.y) + 1, cell - 2, cell - 2); ctx.fillStyle = '#8a5d2b'; ctx.fillRect(X(b.x) + 4, Y(b.y) + cell / 2 - 2, cell - 8, 4); });
    s.towers.forEach(w => {
      if (w.hp <= 0) return; const rx = RX(w.x0, w.w), ry = RY(w.y0, w.h), pw = w.w * cell, ph = w.h * cell, away = w.kind === 'fortress' && s.king[w.side].out;
      ctx.fillStyle = w.side === me ? '#2e7d4f' : '#8e2f2f'; ctx.fillRect(rx + 2, ry + 2, pw - 4, ph - 4); ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 2; ctx.strokeRect(rx + 3, ry + 3, pw - 6, ph - 6);
      const sz = Math.min(pw, ph) * 0.62;
      if (!away) { if (!iconDraw(w.kind, '#ffffff', rx + pw / 2, ry + ph / 2 - 3, sz)) { ctx.fillStyle = '#fff'; ctx.font = Math.floor(sz) + 'px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(GLYPH[w.kind], rx + pw / 2, ry + ph / 2 - 3); } }
      else { ctx.fillStyle = '#fff'; ctx.font = Math.floor(cell * 0.7) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('King away', rx + pw / 2, ry + ph / 2 - 3); }
      ctx.fillStyle = '#000'; ctx.fillRect(rx + 4, ry + ph - 9, pw - 8, 6); ctx.fillStyle = w.hp / w.maxhp <= 0.3 ? '#ff5c5c' : '#7CFC00'; ctx.fillRect(rx + 4, ry + ph - 9, (pw - 8) * w.hp / w.maxhp, 6);
    });
    s.units.forEach(u => {
      const b = before[u.id] || [u.x, u.y], x = b[0] + (u.x - b[0]) * f, y = b[1] + (u.y - b[1]) * f, cx = X(x) + cell / 2, cy = Y(y) + cell / 2, r = cell * 0.42;
      badge(cx, cy, r, u.t, u.side, u.king);
      if (u.stance === 'hold' || u.stance === 'promote') { ctx.font = 'bold ' + Math.floor(cell * 0.3) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#d33'; ctx.fillText(u.stance === 'hold' ? 'H' : 'P', cx - r * 0.8, cy - r * 0.8); }
      if (settings.cd) { const wait = u.ready - s.tick, frac = wait <= 0 ? 1 : 1 - wait / Math.max(u.cd, wait); ctx.fillStyle = '#000'; ctx.fillRect(cx - r, cy + r + 1, 2 * r, 3); ctx.fillStyle = wait <= 0 ? '#7CFC00' : '#ffd24a'; ctx.fillRect(cx - r, cy + r + 1, 2 * r * frac, 3); }
      if (settings.hp && u.maxhp > 1) { ctx.fillStyle = '#000'; ctx.fillRect(cx - r, cy - r - 4, 2 * r, 3); ctx.fillStyle = '#ff5c5c'; ctx.fillRect(cx - r, cy - r - 4, 2 * r * u.hp / u.maxhp, 3); }
      if ((u.frozenUntil || 0) > s.tick) { ctx.beginPath(); ctx.arc(cx, cy, r + 3, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(120,220,255,.95)'; ctx.lineWidth = 3; ctx.stroke(); }
      if (u.recallAt) { ctx.beginPath(); ctx.arc(cx, cy, r + 5, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(180,120,255,.95)'; ctx.lineWidth = 2; ctx.stroke(); }
      if (u.side === me && picked.has(u.id)) { ctx.beginPath(); ctx.arc(cx, cy, r + 4, 0, Math.PI * 2); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); }
    });
    const area = (cx, cy, rr, col, lw) => { ctx.strokeStyle = col; ctx.lineWidth = lw; if (rr == null) ctx.strokeRect(RX(cx - 1, 3) + 2, RY(cy, 1) + 2, cell * 3 - 4, cell - 4); else ctx.strokeRect(RX(cx - rr, 2 * rr + 1) + 2, RY(cy - rr, 2 * rr + 1) + 2, cell * (2 * rr + 1) - 4, cell * (2 * rr + 1) - 4); };
    s.spells.forEach(p => { const sp = Royale.SPELLS[p.card]; area(p.x, p.y, p.card === 'barr' ? null : sp.r, 'rgba(' + SPELL_COL[p.card] + ',.95)', 3); });
    if (info && info.kind === 'spell' && hover) area(hover.x, hover.y, card === 'barr' ? null : info.r, 'rgba(' + SPELL_COL[card] + ',.9)', 2);
    if (info && info.kind === 'phalanx' && hover) area(hover.x, hover.y, null, 'rgba(255,255,255,.9)', 2);
    if (drag && (drag.x0 !== drag.x1 || drag.y0 !== drag.y1)) { const x0 = Math.min(drag.x0, drag.x1), x1 = Math.max(drag.x0, drag.x1), y0 = Math.min(drag.y0, drag.y1), y1 = Math.max(drag.y0, drag.y1); ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 2; ctx.strokeRect(RX(x0, x1 - x0 + 1), RY(y0, y1 - y0 + 1), cell * (x1 - x0 + 1), cell * (y1 - y0 + 1)); }
    fx = fx.filter(e => t - e.t0 < (e.num ? 700 : 350));
    fx.forEach(e => {
      const k = (t - e.t0) / (e.num ? 700 : 350);
      if (e.num) { ctx.globalAlpha = 1 - k; ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 3; ctx.font = 'bold ' + Math.floor(cell * 0.5) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.strokeText(e.text, X(e.x) + cell / 2, Y(e.y) + cell * 0.2 - k * cell * 0.7); ctx.fillText(e.text, X(e.x) + cell / 2, Y(e.y) + cell * 0.2 - k * cell * 0.7); ctx.globalAlpha = 1; return; }
      ctx.beginPath(); ctx.arc(X(e.x) + cell / 2, Y(e.y) + cell / 2, cell * (e.spell ? 0.8 + 1.4 * k : 0.3 + 0.5 * k), 0, Math.PI * 2);
      ctx.strokeStyle = e.spell ? 'rgba(' + SPELL_COL[e.spell] + ',' + (1 - k) + ')' : e.kill ? 'rgba(255,60,60,' + (1 - k) + ')' : 'rgba(255,220,80,' + (1 - k) + ')'; ctx.lineWidth = 3; ctx.stroke();
    });
  }
  function open() { if (!root) build(); visible = true; syncRoot(); menu(); }
  function close() { stopLoop(); leaveNet(); chat = []; mode = 'menu'; me = 'w'; low = false; visible = false; if (root) syncRoot(); }
  if (typeof Hub !== 'undefined' && Hub.register) Hub.register({ id: 'royale', tag: 'Beta: bot or friend', start: open });
  function autoJoin() {                                                 // a link like ?royale=abcde opens the screen and joins that room
    try { const m = /[?&]royale=([a-z0-9]{4,20})/i.exec(location.search), w = /[?&]watch=([a-z0-9]{4,20})/i.exec(location.search); if (m) { open(); joinRoom(m[1], false); } else if (w) { open(); joinRoom(w[1], true); } } catch (e) { /* no location: not a browser */ }
  }
  if (typeof document !== 'undefined' && typeof location !== 'undefined' && document.readyState) setTimeout(autoJoin, 0);
  return { open, close, _: { get sim() { return sim; }, get mode() { return mode; }, get msg() { return msgEl.textContent; }, get panelOpen() { return panel.className.indexOf('hidden') < 0; }, get rootOpen() { return visible; }, get cell() { return cell; }, get me() { return me; }, get netRole() { return netRole; },
    get picked() { return Array.from(picked); }, get deck() { return deck.slice(); }, get kingMode() { return kingMode; }, get sel() { return sel; }, get selText() { return selInfo.textContent; }, get kingText() { return kingBtn.textContent; }, get info() { return infoEl.textContent; }, get settings() { return settings; }, get lowFlag() { return low; }, get stats() { return stats; }, get names() { return names; }, get chat() { return chat.slice(); }, get specN() { return specN; }, get spec() { return spec; }, get opp() { return oppEl.textContent; }, get chatShown() { return chatWrap.style.display !== 'none'; },
    get root() { return root; }, start: startBot, startBot, hostMatch, joinRoom, tick, render, pick, menu, settingsPanel, helpPanel, togglePause, cellAt, key: onKey, selectAll, sendOrder, sendPromoteTo, kingButton, onNetMsg, cleanCmd, sendChat, setLevel: l => { level = l; }, setDeck: d => { deck = d.slice(); }, setSetting: (k, v) => { settings[k] = v; } } };
})();
