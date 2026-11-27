/* Chess Royale screen. All rules live in royale.js; this file draws, reads input and runs the 0.25 s tick. Network play: the host runs the sim and sends the
   guest a state every tick (js/royale_net.js); the guest's copy only loads those states and sends commands. Your own side is always drawn at the bottom.
   Layout: top bar (Options and Quit are always there), then three columns: LEFT = Material + your hand, CENTRE = the board, RIGHT = towers, inspector, orders, King, chat.
   The side columns only exist during a match; the menus use the whole screen. Quit ends the MATCH and returns to the Chess Royale menu; going back to classic chess
   is done through the Games button (js/hub.js), the same way you came in.
   Cards: Q/W/E/R, click, or DRAG a card onto the board. Pieces: click, shift-click, drag a box, double-click (same type), Select all (A),
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
    p: 'Cheap swarm piece. Marches forward and hits diagonally forward. It cannot attack an enemy standing right in front of it.',
    n: 'Charges for the Fortress, leaping over everything. Strikes from where it stands. Takes no orders.',
    b: 'Zig-zags up the board along diagonals. To attack it slides next to its target (up to 3 squares away) and hits it; a kill puts it on the target\u2019s square.',
    r: 'Goes straight for the towers along files and ranks. It slides next to its target and hits it; a kill puts it on the target\u2019s square. Takes no orders.',
    q: 'The big hunter: goes after the most valuable piece, then the towers. Slides next to its target before it hits.',
    '\u03b3': 'Fast flanker: leaps (3,1) along the edge files, picks off weak pieces, then hits towers. Strikes from where it stands. Takes no orders.',
    ph: 'Three pawns side by side on one rank. If one of the three squares would be out of bounds or blocked, the formation slides one square over so all three fit.',
    surge: 'Every friendly piece in a 3x3 area gets one free action right away (its cooldown is not reset).',
    stampede: 'Like Surge, but a 5x5 area.',
    zug: 'Freezes enemy pieces in a 3x3 area for 2.5 s. Frozen pieces can still be hit.',
    barr: 'Blocks 3 squares in a row for 8 s. It blocks your own pieces too; leapers jump over it.'
  };
  // What each piece goes for, in order, and what it does when stuck. Shown on the card details.
  const PRIORITY = {
    p: 'The weakest (lowest Health) piece in reach, then a tower. If an enemy blocks it head-on it sidesteps to a square nobody can hit; with the river ahead it walks to the nearest bridge; a tower or Barricade in the way is walked around.',
    n: 'Only the enemy Fortress. It ignores pieces and Bastions. With no Fortress left it hunts the enemy King.',
    b: 'The piece with the highest Damage on its diagonals, then a tower; otherwise it zig-zags toward the Fortress.',
    r: 'Towers: the Fortress first, then Bastions. It only hits pieces that block its way. With no towers left it hunts the enemy King.',
    q: 'The most valuable piece (highest Material cost) in reach, then towers; otherwise the nearest enemy, then the Fortress.',
    '\u03b3': 'Weak pieces (Health 1 or 2) first, then towers; otherwise it runs along the edge files to the Fortress.',
    k: 'The weakest piece next to him, then an adjacent tower; otherwise he walks to the square you sent him to.',
    fortress: 'The most valuable piece in range (highest Material cost; the King counts as most valuable). Ties: lowest Health, then nearest.',
    bastion: 'The most valuable piece in range (highest Material cost). Ties: lowest Health, then nearest.'
  };
  // Move / attack pattern of each card for the mini diagram ('mv' = moves and attacks, 'at' = attack only, 'dep' = what the card puts down or covers). dy > 0 is forward.
  const ORTH = [[1, 0], [-1, 0], [0, 1], [0, -1]], DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]], KN_ = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]], CAM_ = [[1, 3], [3, 1], [-1, 3], [-3, 1], [1, -3], [3, -1], [-1, -3], [-3, -1]];
  const rays = (dirs, n) => { const o = []; dirs.forEach(d => { for (let k = 1; k <= n; k++) o.push([d[0] * k, d[1] * k]); }); return o; };
  const block = r => { const o = []; for (let x = -r; x <= r; x++) for (let y = -r; y <= r; y++) o.push([x, y]); return o; };
  const PATTERN = {
    p: { mv: [[0, 1]], at: [[1, 1], [-1, 1]] }, n: { mv: KN_ }, b: { mv: rays(DIAG, 3) }, r: { mv: rays(ORTH, 3) }, q: { mv: rays(ORTH.concat(DIAG), 3) }, '\u03b3': { mv: CAM_ },
    k: { mv: ORTH.concat(DIAG) }, ph: { dep: [[-1, 0], [0, 0], [1, 0]] }, surge: { dep: block(1) }, stampede: { dep: block(2) }, zug: { dep: block(1) }, barr: { dep: [[-1, 0], [0, 0], [1, 0]] }
  };
  const DEFAULT_SETTINGS = { cd: false, hp: true, flash: true, nums: true, sound: true, lowWarn: true, boardTheme: 'same' };      // YOUR options: how the screen looks and sounds on this device
  const DEFAULT_GAME = { orderCd: 2, fb: true, autoRecall: false, kingHeal: 'normal' };                                          // GAME options: rules of the matches you start (set on the Play screen)
  const SETTING_TEXT = {
    cd: ['Cooldown bars under pieces', 'Shows how soon each piece acts again. Off by default.'], hp: ['Health bars', 'Black-and-white health bars on pieces with more than 1 Health.'],
    flash: ['Attack effects', 'Slashes, shots, flashes and rings where things are hit or destroyed.'], nums: ['Damage numbers', 'Small numbers float up when something takes damage.'],
    sound: ['Sounds', 'Uses the game sound setting too.'], lowWarn: ['Low-health warning', 'Flashes the screen when your Fortress drops to 30%.']
  };
  const GAME_TEXT = {
    orderCd: ['Order cooldown', 'How long a piece must wait between orders (2 s or none).'], fb: ['Promotion fall-back', 'ON: a pawn whose chosen piece is already alive takes the best available one. OFF: it waits on the back rank.'],
    autoRecall: ['Auto-recall the King', 'Safe mode: the King is recalled by himself when your Fortress or he drops to 30%. A recall can still be interrupted.'],
    kingHeal: ['King healing', 'A King at home heals once his Fortress has not been hit for a few seconds: Off, Normal (1 Health per second) or Fast (3 per second).']
  };
  const BOARD_THEMES = [['same', 'Same as chess'], ['classic', 'Classic', '#f0d9b5', '#b58863'], ['green', 'Green', '#eeeed2', '#769656'], ['blue', 'Blue', '#dee3e6', '#8ca2ad'], ['slate', 'Slate', '#c9c9c9', '#6f6f6f'], ['rose', 'Rose', '#f3dede', '#b86f7a']];
  let root = null, visible = false, low = false, canvas = null, ctx = null, wrapEl = null, panel = null, panelBody = null, timerEl = null, msgEl = null, infoEl = null, hand = [], nextEl = null, pauseBtn = null, quitBtn = null, optBtn = null;
  let selInfo = null, ordBtns = {}, promoRow = null, kingBtn = null, allBtn = null, matNum = null, matPips = [], matRateEl = null, towerRows = null, overlay = null, overlayBody = null, dragGhost = null, toastTimer = null;
  let sim = null, bot = null, timer = null, raf = 0, sel = -1, kingMode = false, level = 'normal', paused = false, cell = 20, lastTime = 0, before = {}, fx = [], mode = 'menu', optPaused = false, overlayOn = false;
  let deck = null, picked = new Set(), groups = {}, hover = null, drag = null, cardDrag = null, suppressAt = -1e9, lastClick = null, settings = null, me = 'w', net = null, netRole = null, netInfo = '', rid = 0, stats = null, sideOf = {}, unitOf = {}, lowWarned = false, autoRecallAt = -99;
  let spec = false, specN = 0, names = { w: '', b: '' }, chat = [], lastRoom = null, matchTok = '', graceTimer = null, graceLeft = 0, reconTimer = null, reconTries = 0, reconnecting = false, byeSeen = false, roomShown = '', chatWrap = null, chatEl = null, chatIn = null, oppEl = null, lastChatAt = 0, hostChatAt = {}, guestHello = null;
  let focusCard = 'p', tipOpen = false, lastFinal = null, game = null, decks = [], activeDeck = 'default', pfps = { w: '', b: '' }, drawer = null, drawerBody = null, drawerOn = false, profChip = null, guideBtn = null, palette = null, paletteAt = -1e9, towerPlayers = {}, kingBars = {}, ghostTilt = 0, ghostLast = null, deployAt = {}, deckDelConfirm = '';
  const icons = new Map(), hitAt = {}, towerHitAt = {}, shakeAt = {};
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const later = (f, ms) => (typeof setTimeout === 'function' ? setTimeout(f, ms) : 0);
  const TICK = () => Royale.CONSTANTS.TICK_MS;
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const secs = ticks => (ticks * TICK() / 1000).toFixed(ticks * TICK() % 1000 ? 2 : 1).replace(/\.?0+$/, '') + ' s';
  const mineUnits = () => sim.st.units.filter(u => u.side === me);
  const other = s => (s === 'w' ? 'b' : 'w');
  const sfxSafe = n => { if (settings && settings.sound && typeof sfx === 'function') { try { sfx(n); } catch (e) { /* no sound */ } } };
  const nameOf = id => (id === 'k' ? 'King' : id === 'fortress' ? 'Fortress' : id === 'bastion' ? 'Bastion' : Royale.CARDS[id] ? Royale.CARDS[id].name : id);
  // The small message at the top of the board (errors and notices only). The element is msgEl so tests and old code can read its text.
  function toast(text, sticky) {
    if (!msgEl) return; msgEl.textContent = text || ''; msgEl.className = 'rmsg' + (text ? ' show' : '');
    if (toastTimer) clearTimeout(toastTimer); toastTimer = null; if (text && !sticky) toastTimer = later(() => { if (msgEl) { msgEl.className = 'rmsg'; } }, 2600);
  }

  // ---- settings (kept on this device). v2: the cooldown bars are off by default, so an older saved "on" is ignored once.
  function loadSettings() {
    const s = Object.assign({}, DEFAULT_SETTINGS);
    try { const raw = JSON.parse(localStorage.getItem('cwfRoyale') || '{}'); Object.keys(DEFAULT_SETTINGS).forEach(k => { if (typeof raw[k] === typeof DEFAULT_SETTINGS[k] && !(k === 'cd' && raw.v !== 2)) s[k] = raw[k]; }); if (!BOARD_THEMES.some(t => t[0] === s.boardTheme)) s.boardTheme = 'same'; } catch (e) { /* no storage or bad data: defaults */ }
    return s;
  }
  const saveSettings = () => { try { localStorage.setItem('cwfRoyale', JSON.stringify(Object.assign({ v: 2 }, settings))); } catch (e) { /* private mode: not remembered */ } };
  function loadGame() {                                                  // game options live apart from your options; older saves kept them together, so they are carried over once
    const g = Object.assign({}, DEFAULT_GAME);
    try {
      const raw = JSON.parse(localStorage.getItem('cwfRoyaleGame') || 'null'), old = JSON.parse(localStorage.getItem('cwfRoyale') || '{}'), src = raw || old;
      if (src.orderCd === 0 || src.orderCd === 2) g.orderCd = src.orderCd; if (typeof src.fb === 'boolean') g.fb = src.fb; if (typeof src.autoRecall === 'boolean') g.autoRecall = src.autoRecall; if (['off', 'normal', 'fast'].indexOf(src.kingHeal) >= 0) g.kingHeal = src.kingHeal;
    } catch (e) { /* defaults */ }
    return g;
  }
  const saveGame = () => { try { localStorage.setItem('cwfRoyaleGame', JSON.stringify(Object.assign({ v: 1 }, game))); } catch (e) { /* not remembered */ } };
  // ---- saved decks: a built-in Default deck (cannot be edited) and your own named decks (kept on this device)
  const DECK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="12" height="13" rx="2"/><path d="M8 5h10a2 2 0 0 1 2 2v11"/><path d="M7 15l3-3 3 3"/></svg>';
  const DECK_KEY = 'cwfRoyaleDecks', MAX_DECKS = 12;
  const deckEntries = () => [{ id: 'default', name: 'Default deck', cards: Royale.DEFAULT_DECK.slice(), locked: true }].concat(decks);
  const activeEntry = () => deckEntries().find(d => d.id === activeDeck) || deckEntries()[0];
  function syncDeck() { const e = activeDeck === 'default' ? null : decks.find(d => d.id === activeDeck); if (!e) activeDeck = 'default'; deck = e ? e.cards : Royale.DEFAULT_DECK.slice(); }
  function loadDecks() {
    try {
      const raw = JSON.parse(localStorage.getItem(DECK_KEY) || '{}'); decks = (Array.isArray(raw.list) ? raw.list : []).filter(d => d && typeof d.id === 'string' && Array.isArray(d.cards) && d.id !== 'default').slice(0, MAX_DECKS)
        .map(d => ({ id: String(d.id).slice(0, 24), name: cleanTxt(d.name, 20) || 'My deck', cards: d.cards.filter(c => typeof c === 'string' && Royale.CARDS[c]).slice(0, 8) })); activeDeck = typeof raw.active === 'string' ? raw.active : 'default';
    } catch (e) { decks = []; activeDeck = 'default'; }
    syncDeck();
  }
  const saveDecks = () => { try { localStorage.setItem(DECK_KEY, JSON.stringify({ v: 1, active: activeDeck, list: decks.filter(d => d.id !== '_test') })); } catch (e) { /* not remembered */ } };
  function newDeck(name, cards) { if (decks.length >= MAX_DECKS) return null; const d = { id: 'd' + Math.floor(now()).toString(36) + Math.floor(Math.random() * 1e6).toString(36), name: cleanTxt(name, 20) || 'My deck', cards: (cards || []).slice(0, 8) }; decks.push(d); activeDeck = d.id; syncDeck(); saveDecks(); return d; }
  function renameDeck(id, name) { const d = decks.find(x => x.id === id); if (d) { d.name = cleanTxt(name, 20) || d.name; saveDecks(); } }
  function deleteDeck(id) { decks = decks.filter(d => d.id !== id); if (activeDeck === id) activeDeck = 'default'; syncDeck(); saveDecks(); }
  const cleanPfp = v => { try { return typeof safePfp === 'function' ? safePfp(v) : ''; } catch (e) { return ''; } };
  const myPfp = () => { try { return typeof profile !== 'undefined' && profile ? cleanPfp(profile.pfp) : ''; } catch (e) { return ''; } };
  function copyLink(text, btn, label) {                                  // the classic game's copyText when it exists, else the clipboard directly
    const done = () => { const o = label; btn.textContent = 'Copied \u2713'; later(() => { btn.textContent = o; }, 1500); };
    try { if (typeof copyText === 'function') return copyText(text, btn, label); navigator.clipboard.writeText(text).then(done, () => { if (typeof window.prompt === 'function') window.prompt('Copy this:', text); }); } catch (e) { try { window.prompt('Copy this:', text); } catch (e2) { /* no clipboard */ } }
  }

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
    settings = loadSettings(); game = loadGame(); loadDecks(); const K = Royale.CONSTANTS;
    root = el('div'); root.id = 'royaleUI';
    // top bar: Options and Quit are always reachable. The first element leaves room for the hub's "Games" button, which stays on top while this screen is open.
    const bar = el('div', 'rbar'); bar.appendChild(el('span', 'rgap')); bar.appendChild(el('span', 'rspacer')); oppEl = el('span', 'ropp', ''); timerEl = el('span', 'rtimer', '3:00');
    bar.appendChild(oppEl); bar.appendChild(timerEl);
    pauseBtn = el('button', 'rpause', 'Pause'); pauseBtn.addEventListener('click', togglePause); bar.appendChild(pauseBtn);
    profChip = el('div', 'rprof'); profChip.av = el('span', 'rav'); profChip.nm = el('span', 'rprofname'); profChip.appendChild(profChip.av); profChip.appendChild(profChip.nm); profChip.title = 'Your name and picture come from your profile in classic chess'; bar.appendChild(profChip);
    guideBtn = el('button', 'rguide', '?'); guideBtn.title = 'Guide: how to play'; guideBtn.addEventListener('click', () => (drawerOn ? closeDrawer() : openGuide())); bar.appendChild(guideBtn);
    optBtn = el('button', 'ropt', '\u2699'); optBtn.title = 'Options'; optBtn.addEventListener('click', () => (overlayOn ? closeOverlay() : openOptions())); bar.appendChild(optBtn);
    quitBtn = el('button', 'rquit', 'Quit match'); quitBtn.title = 'End this match and go back to the Chess Royale menu'; quitBtn.addEventListener('click', quit); bar.appendChild(quitBtn); root.appendChild(bar);
    const main = el('div', 'rmain');
    // LEFT: Material and the hand
    const left = el('div', 'rside rleft'), mat = el('div', 'rmat'), mh = el('div', 'rmathead'); mh.appendChild(el('span', 'rmatlabel', 'MATERIAL')); matRateEl = el('span', 'rmatrate', 'x1'); mh.appendChild(matRateEl); mat.appendChild(mh);
    const big = el('div', 'rmatbig'); matNum = el('b', 'rmatnum', '5'); big.appendChild(matNum); big.appendChild(el('small', '', ' / ' + K.MAT_MAX)); mat.appendChild(big);
    const pips = el('div', 'rpips'); matPips = []; for (let i = 0; i < K.MAT_MAX; i++) { const p = el('div', 'rpip'), f = el('div', 'rpipfill'); p.appendChild(f); pips.appendChild(p); matPips.push(f); } mat.appendChild(pips); left.appendChild(mat);
    const row = el('div', 'rhand');
    for (let i = 0; i < 4; i++) {
      const b = el('button', 'rcard'), g = el('span', 'g'), tx = el('span', 'rcardtxt'), n = el('b', 'n'), k = el('small', 'k'), c = el('span', 'c');
      tx.appendChild(n); tx.appendChild(k); b.appendChild(g); b.appendChild(tx); b.appendChild(c);
      b.addEventListener('pointerdown', e => cardDown(i, e)); b.addEventListener('pointermove', cardMove); b.addEventListener('pointerup', cardUp); b.addEventListener('pointercancel', cardCancel);
      b.addEventListener('click', () => { if (now() - suppressAt < 350) { suppressAt = -1e9; return; } pick(i); });          // the click the browser sends right after a drag is ignored
      hand.push({ b, g, n, c, k, card: null }); row.appendChild(b);
    }
    left.appendChild(row); nextEl = el('div', 'rnext'); nextEl.appendChild(el('small', '', 'NEXT')); const ng = el('span', 'g'); nextEl.appendChild(ng); nextEl.g = ng; nextEl.nm = el('span', 'nn'); nextEl.appendChild(nextEl.nm); left.appendChild(nextEl);
    left.appendChild(el('p', 'rhint', 'Click a card, or drag it onto the board. Keys: Q W E R.'));
    // CENTRE: the board
    wrapEl = el('div', 'rwrap'); canvas = el('canvas');
    canvas.addEventListener('pointerdown', onDown); canvas.addEventListener('pointermove', onMove); canvas.addEventListener('pointerup', onUp); canvas.addEventListener('pointerleave', () => { hover = null; });
    wrapEl.appendChild(canvas); msgEl = el('div', 'rmsg'); wrapEl.appendChild(msgEl);
    panel = el('div', 'rpanel'); panelBody = el('div', 'rpanelbody'); panel.appendChild(panelBody); wrapEl.appendChild(panel);
    // RIGHT: towers, inspector, orders, King, chat
    const right = el('div', 'rside rright'); right.appendChild(el('h4', 'rh', 'Players')); towerRows = {};
    ['top', 'bottom'].forEach(s => {
      const r = el('div', 'rtow'), head = el('div', 'rtowhead'), av = el('span', 'rav'), lab = el('b', 'rtowlab', s === 'top' ? 'Enemy' : 'You'); head.appendChild(av); head.appendChild(lab); r.appendChild(head); const o = { lab, av };
      ['fortress', 'bl', 'br', 'king'].forEach(k => { const bar_ = el('div', 'rtbar' + (k === 'fortress' ? ' big' : '') + (k === 'king' ? ' kingbar' : '')), fl = el('div', 'rtfill'), tx = el('span', 'rtnum'); bar_.appendChild(fl); bar_.appendChild(tx); bar_.title = k === 'fortress' ? 'Fortress' : k === 'king' ? 'King' : 'Bastion'; r.appendChild(bar_); o[k] = { fl, tx }; });
      towerRows[s] = o; right.appendChild(r);
    });
    right.appendChild(el('h4', 'rh', 'Inspector')); infoEl = el('div', 'rinspect', ''); right.appendChild(infoEl);
    right.appendChild(el('h4', 'rh', 'Orders')); selInfo = el('div', 'rinfo', 'Nothing selected'); right.appendChild(selInfo);
    const ords = el('div', 'rords'); allBtn = el('button', 'rbtn', 'Select all'); allBtn.title = 'Select every piece you have (A)'; allBtn.addEventListener('click', selectAll); ords.appendChild(allBtn);
    const OT = { attack: 'Back to normal behaviour', hold: 'Stay in your half and guard', promote: 'Pawns: run for the enemy back rank' };
    ['attack', 'hold', 'promote'].forEach(o => { const b = el('button', 'rbtn off', cap(o)); b.title = OT[o]; b.addEventListener('click', () => sendOrder(o)); ordBtns[o] = b; ords.appendChild(b); });
    right.appendChild(ords);
    promoRow = el('div', 'rpromo hidden'); promoRow.appendChild(el('span', '', 'Promote to:'));
    [['auto', 'Auto'], ['n', 'n'], ['b', 'b'], ['r', 'r'], ['q', 'q']].forEach(p => { const b = el('button', 'rbtn'); if (p[0] === 'auto') b.textContent = 'Auto'; else { const g = el('span', 'g'); setIcon(g, p[1]); b.appendChild(g); b.title = Royale.DEFS[p[1]].name; } b.addEventListener('click', () => sendPromoteTo(p[0])); promoRow.appendChild(b); });
    right.appendChild(promoRow);
    kingBtn = el('button', 'rbtn rking', 'Send King'); kingBtn.title = 'Send your King out to fight for free (the Fortress goes quiet while he is away)'; kingBtn.addEventListener('click', kingButton); right.appendChild(kingBtn);
    chatWrap = el('div', 'rchat'); chatEl = el('div', 'rchatlines'); chatIn = el('input', 'rchatin'); chatIn.placeholder = 'Chat (Enter to send)'; chatIn.maxLength = 200;
    chatIn.addEventListener('keydown', e => { if (e.key === 'Enter') { if (sendChat(chatIn.value)) chatIn.value = ''; } e.stopPropagation(); });
    chatWrap.appendChild(chatEl); chatWrap.appendChild(chatIn); chatWrap.style.display = 'none'; right.appendChild(chatWrap);
    main.appendChild(left); main.appendChild(wrapEl); main.appendChild(right); root.appendChild(main);
    overlay = el('div', 'rover hidden'); overlayBody = el('div', 'roverbox'); overlay.appendChild(overlayBody); overlay.addEventListener('click', e => { if (e.target === overlay) closeOverlay(); }); root.appendChild(overlay);
    drawer = el('div', 'rdrawer hidden'); const dh = el('div', 'rdrawerhead'); dh.appendChild(el('b', '', 'Guide')); const dx = el('button', 'rsmall', '\u2715'); dx.title = 'Close'; dx.addEventListener('click', () => closeDrawer()); dh.appendChild(dx); drawer.appendChild(dh); drawerBody = el('div', 'rdrawerbody'); drawer.appendChild(drawerBody); root.appendChild(drawer);
    dragGhost = el('div', 'rdragghost hidden'); const dg = el('span', 'g'); dragGhost.appendChild(dg); dragGhost.g = dg; root.appendChild(dragGhost);
    document.body.appendChild(root); syncRoot();
    if (typeof window !== 'undefined' && window.addEventListener) { window.addEventListener('resize', resize); window.addEventListener('keydown', onKey, true); }
    if (typeof ResizeObserver !== 'undefined') { try { new ResizeObserver(() => resize()).observe(wrapEl); } catch (e) { /* the window resize event still works */ } }
  }
  function syncRoot() {
    const menuish = mode !== 'play' && mode !== 'over';
    root.className = (visible ? '' : 'hidden') + (low ? ' rlow' : '') + (spec ? ' rspec' : '') + (menuish ? ' rmenu' : '') + (mode === 'over' ? ' rover_' : '');
    if (quitBtn) quitBtn.textContent = mode === 'over' ? 'Back to menu' : 'Quit match';
  }
  // A panel covers the board area. Buttons: { label, go, on (green = the main action), danger, title }.
  function showPanel(title, text, extras, buttons, opts) {
    opts = opts || {}; panelBody.innerHTML = '';
    if (opts.back) { const h = el('div', 'rphead'), bk = el('button', 'rback', '\u2039 ' + opts.back.label); bk.addEventListener('click', opts.back.go); h.appendChild(bk); if (title) h.appendChild(el('h2', '', title)); panelBody.appendChild(h); }
    else if (title) panelBody.appendChild(el('h2', '', title));
    if (text) panelBody.appendChild(el('p', '', text)); extras.forEach(x => panelBody.appendChild(x));
    if (buttons.length) { const r = el('div', 'rrow'); buttons.forEach(b => { const x = el('button', b.on ? 'primary' : b.danger ? 'danger' : '', b.label); if (b.title) x.title = b.title; x.addEventListener('click', b.go); r.appendChild(x); }); panelBody.appendChild(r); }
    panel.className = 'rpanel' + (mode === 'menu' || mode === 'wait' ? ' solid' : ''); syncRoot();
  }
  const hidePanel = () => { panel.className = 'rpanel hidden'; syncRoot(); };
  const section = t => el('h3', 'rsec', t);
  const backBtn = go => ({ label: 'Back', go: go || menu });

  // ---- the little diagram of what a card does
  function pattern(code, N0) {
    const K = Royale.CONSTANTS, tower = code === 'fortress' || code === 'bastion', N = tower ? (code === 'fortress' ? 11 : 8) : (N0 || 7), c = (N - 1) / 2, g = el('div', 'rpat'), cells = {}, icons = {};
    g.style.gridTemplateColumns = 'repeat(' + N + ', 1fr)';
    const P = tower ? null : PATTERN[code], put = (dx, dy, cls) => { const i = c + dx, j = c - dy; if (i >= 0 && i < N && j >= 0 && j < N && !(cells[j * N + i] && cls === 'at')) cells[j * N + i] = cls; };
    const at = (dx, dy, ic) => { const i = c + dx, j = c - dy; if (i >= 0 && i < N && j >= 0 && j < N) icons[j * N + i] = ic; };
    let fp = null;
    if (tower) {                                                           // an even board for the Bastion (8 wide), 11 wide for the Fortress; the icon covers the squares the tower covers
      fp = code === 'fortress' ? [4, 6] : [3, 4]; const R = code === 'fortress' ? K.FORTRESS_RANGE : K.TOWER_RANGE;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const gx = Math.max(fp[0] - i, 0, i - fp[1]), gy = Math.max(fp[0] - j, 0, j - fp[1]); if (gx === 0 && gy === 0) cells[j * N + i] = 'ft'; else if (Math.max(gx, gy) <= R) cells[j * N + i] = 'at'; }
    } else {
      (P.mv || []).forEach(d => put(d[0], d[1], 'mv')); (P.at || []).forEach(d => put(d[0], d[1], 'at')); (P.dep || []).forEach(d => put(d[0], d[1], 'dep'));
      if (!P.dep) at(0, 0, code);
      else if (code === 'ph') [-1, 0, 1].forEach(d => at(d, 0, 'p'));                      // the three pawns
      else if (code === 'barr') [-1, 0, 1].forEach(d => at(d, 0, 'barr'));                 // the three barricades
      else at(0, 0, code);                                                                  // a spell: its icon in the middle of the area
    }
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const k = cells[j * N + i], d = el('div', 'rg' + ((i + j) % 2 ? ' d' : '') + (k ? ' ' + k : '')); if (icons[j * N + i]) setIcon(d, icons[j * N + i]); g.appendChild(d); }
    if (tower) { const o = el('div', 'rpaticon'); o.style.left = (100 * fp[0] / N) + '%'; o.style.top = (100 * fp[0] / N) + '%'; o.style.width = (100 * (fp[1] - fp[0] + 1) / N) + '%'; o.style.height = (100 * (fp[1] - fp[0] + 1) / N) + '%'; setIcon(o, code); g.appendChild(o); g.className = 'rpat tower' + N; }
    return g;
  }
  const KIND = { piece: 'Piece', phalanx: 'Formation', spell: 'Spell' };
  function cardFacts(id) {                                              // rows for the details panel, built from the real numbers
    const K = Royale.CONSTANTS, C = Royale.CARDS[id], rows = [];
    if (id === 'fortress') return { name: 'Fortress', tag: 'Tower \u00B7 3x3', rows: [['Health', K.FORTRESS_HP], ['Damage', K.FORTRESS_DMG], ['Fires every', secs(K.FORTRESS_CD)], ['Range', K.FORTRESS_RANGE + ' squares from its edge (the edge files too)'], ['While the King is out', 'It stops firing'], ['If it falls', 'You lose, unless the King is out: then the match goes on until he is defeated']], prio: PRIORITY.fortress, text: 'Your main tower. Destroy the enemy Fortress to win. The King lives inside it and heals there.', pat: 'fortress', legend: 'Red dots: the squares it can hit.' };
    if (id === 'bastion') return { name: 'Bastion', tag: 'Tower \u00B7 2x2', rows: [['Health', K.BASTION_HP], ['Damage', K.BASTION_DMG], ['Fires every', secs(K.BASTION_CD)], ['Range', K.TOWER_RANGE + ' squares from its edge']], prio: PRIORITY.bastion, text: 'Each side has two, guarding the bridges. Destroying them wins on towers at time up and opens the way to the Fortress.', pat: 'bastion', legend: 'Red dots: the squares it can hit.' };
    if (id === 'k') return { name: 'King', tag: 'Your King', rows: [['Health', K.KING_HP + ' (his own once he is out; at home he shares the Fortress\u2019s)'], ['Damage', Royale.KING.dmg], ['Acts every', secs(Royale.KING.cd)], ['Reach', 'The 8 squares next to him'], ['Steps', 'One square per action'], ['Goes out after', secs(K.KING_DELAY)], ['Recall', secs(K.KING_RECALL) + ', not in the first ' + secs(K.KING_OUT_LOCK) + ' (unless he is below 30%)'], ['Rests for', secs(K.KING_COOLDOWN) + ' after coming home'], ['Heals at home', '1 Health per second once the Fortress has been left alone for ' + secs(K.KING_REGEN_IDLE) + ' (a game option)']], prio: PRIORITY.k, text: 'Tough and hard-hitting, but he only covers the 3x3 around him. If your Fortress falls while he is out the match goes on until he is dead; he can no longer come home or heal.', pat: 'k', legend: 'Green: where he can step and hit.' };
    rows.push(['Cost', C.cost + ' Material']);
    if (C.kind === 'piece') {
      const D = Royale.DEFS[id], ord = Royale.ORDERS[id], reach = { p: 'One step forward, hits diagonally forward', n: 'Leaps (2,1) over anything', b: 'Diagonals, up to ' + K.SLIDE_REACH + ' squares', r: 'Files and ranks, up to ' + K.SLIDE_REACH + ' squares', q: 'Any direction, up to ' + K.SLIDE_REACH + ' squares', '\u03b3': 'Leaps (3,1) over anything' }[id];
      rows.push(['Health', D.hp], ['Damage', D.dmg], ['Acts every', secs(D.cd)], ['Arrives after', secs(D.delay)], ['Reach', reach], ['Orders', ord ? ord.map(cap).join(', ') : 'None (it follows its own plan)']);
      if (['b', 'r', 'q'].indexOf(id) >= 0) rows.push(['When it hits', 'Slides next to the target first']);
    } else if (C.kind === 'phalanx') rows.push(['Makes', '3 Pawns side by side'], ['Arrives after', secs(C.delay)]);
    else { rows.push(['Area', id === 'barr' ? '3 squares in a row' : (2 * C.r + 1) + 'x' + (2 * C.r + 1) + ' squares'], ['Lands after', secs(C.delay)]); if (C.freeze) rows.push(['Freezes for', secs(C.freeze)]); if (C.life) rows.push(['Lasts', secs(C.life)]); }
    return { name: C.name, tag: KIND[C.kind] + ' \u00B7 ' + C.cost + ' Material', rows, prio: PRIORITY[id] || '', text: CARD_TEXT[id] || '', pat: id, legend: C.kind === 'piece' ? (id === 'p' ? 'Green: where it steps. Red: where it hits.' : 'Green: squares it can move to and attack.') : 'Gold: the squares it covers.' };
  }
  // ---- the main menu: a few clear choices, nothing else
  function menu() {
    mode = 'menu'; stopLoop(); leaveNet(); me = 'w'; low = false; closeOverlay(true); closeDrawer(true); chatWrap.style.display = 'none'; toast(''); updateOpp(); paused = false; pauseBtn.textContent = 'Pause'; updateProfile();
    const hero = el('div', 'rhero'); hero.appendChild(el('div', 'rlogo', '\u265B')); hero.appendChild(el('h1', '', 'Chess Royale')); hero.appendChild(el('p', 'rsub', 'Real-time chess. Spend Material, deploy pieces, break the Fortress.'));
    // your deck, like Clash Royale: click a card to read it in the Deck screen
    const ds = el('div', 'rdeckstrip'), dh = el('div', 'rdeckhead'); dh.appendChild(el('b', '', activeEntry().name)); dh.appendChild(el('small', deck.length === 8 ? '' : 'bad', deck.length + '/8 cards')); ds.appendChild(dh);
    const cards = el('div', 'rstripcards'); for (let i = 0; i < 8; i++) { const id = deck[i], t = el('button', 'rstripcard' + (id ? '' : ' empty')); if (id) { const g = el('span', 'g'); setIcon(g, id); t.appendChild(g); t.appendChild(el('span', 'cs', String(Royale.CARDS[id].cost))); t.title = Royale.CARDS[id].name + ': click for details'; } t.addEventListener('click', () => { if (id) focusCard = id; deckPanel(); }); cards.appendChild(t); } ds.appendChild(cards);
    const row = el('div', 'rplayrow'), playB = el('button', 'rbig primary', 'Play'); playB.title = 'Play against the bot or a friend'; playB.addEventListener('click', playPanel);
    const deckB = el('button', 'rdeckicon'); deckB.title = 'Deck: choose and edit your cards'; deckB.innerHTML = DECK_ICON; if (deck.length !== 8) deckB.appendChild(el('i', 'bad', '!')); deckB.addEventListener('click', () => deckPanel());
    row.appendChild(playB); row.appendChild(deckB);
    showPanel('', '', [hero, ds, row, el('p', 'rnetmsg', netInfo)], []);
  }
  function optionsBox(kind) {                                            // the list of option rows: kind 'user' (how it looks on this device) or 'game' (rules of the matches you start)
    const isGame = kind === 'game', store = isGame ? game : settings, TEXT = isGame ? GAME_TEXT : SETTING_TEXT, save = isGame ? saveGame : saveSettings, DEF = isGame ? DEFAULT_GAME : DEFAULT_SETTINGS, wrap = el('div', 'roptwrap'), box = el('div', 'rsettings');
    const draw = () => {
      box.innerHTML = '';
      Object.keys(TEXT).forEach(k => {
        const row = el('div', 'rsetrow'), tx = el('span', 'rsettext'), seg = el('div', 'rseg2'); tx.appendChild(el('b', '', TEXT[k][0])); tx.appendChild(el('small', '', TEXT[k][1])); row.appendChild(tx);
        const ch = k === 'orderCd' ? [[2, '2 s'], [0, 'None']] : k === 'kingHeal' ? [['off', 'Off'], ['normal', 'Normal'], ['fast', 'Fast']] : [[true, 'On'], [false, 'Off']];
        ch.forEach(c => { const b = el('button', store[k] === c[0] ? 'on' : '', c[1]); b.addEventListener('click', () => { store[k] = c[0]; save(); draw(); }); seg.appendChild(b); }); row.appendChild(seg); box.appendChild(row);
      });
      if (!isGame) {                                                      // board colours, like the themes in classic chess
        const row = el('div', 'rsetrow'), tx = el('span', 'rsettext'), sw = el('div', 'rswatches'); tx.appendChild(el('b', '', 'Board colours')); tx.appendChild(el('small', '', '\u201CSame as chess\u201D follows the board colours chosen in classic chess.')); row.appendChild(tx);
        BOARD_THEMES.forEach(t => { const b = el('button', 'rswatch' + (settings.boardTheme === t[0] ? ' on' : '')); b.title = t[1]; if (t[2]) { const l = el('i'), d = el('i'); l.style.background = t[2]; d.style.background = t[3]; b.appendChild(l); b.appendChild(d); } else b.textContent = 'Auto'; b.addEventListener('click', () => { settings.boardTheme = t[0]; saveSettings(); palette = null; boardColors(); draw(); }); sw.appendChild(b); }); row.appendChild(sw); box.appendChild(row);
      }
    };
    draw(); wrap.appendChild(box); const reset = el('button', 'rsmall', 'Reset to default'); reset.title = 'Put every option back to how it started'; reset.addEventListener('click', () => { Object.keys(DEF).forEach(k => { store[k] = DEF[k]; }); save(); palette = null; boardColors(); draw(); }); wrap.appendChild(reset); return wrap;
  }
  let hostDraft = '';
  function playPanel() {                                                 // Play: a bot match or a friend match, and the game options for it
    mode = 'menu'; const cols = el('div', 'rplaycols'), left = el('div', 'rplayleft'), right = el('div', 'rplayright');
    const dk = el('p', 'rdecknote'); dk.appendChild(el('span', '', 'Deck: ' + activeEntry().name + ' (' + deck.length + '/8) ')); const ch = el('button', 'rsmall', 'Change'); ch.addEventListener('click', () => deckPanel()); dk.appendChild(ch);
    const botBox = el('div', 'rcardbox'); botBox.appendChild(el('h3', 'rsec', 'Play vs Bot')); const seg = el('div', 'rseg2'), segB = {};
    ['easy', 'normal'].forEach(l => { const b = el('button', level === l ? 'on' : '', cap(l)); b.title = 'Bot difficulty'; b.addEventListener('click', () => { level = l; Object.keys(segB).forEach(k => { segB[k].className = k === level ? 'on' : ''; }); }); segB[l] = b; seg.appendChild(b); });
    const brow = el('div', 'rrow rline'); brow.appendChild(el('span', 'rlabel', 'Difficulty')); brow.appendChild(seg); botBox.appendChild(brow);
    const startB = el('button', 'primary', 'Start match'); startB.addEventListener('click', () => { if (deck.length === 8) startBot(); else toast('Pick exactly 8 cards in your deck first'); }); if (deck.length !== 8) startB.className += ' off'; botBox.appendChild(startB);
    const fixedIn = el('input', 'rcode'); fixedIn.placeholder = 'Optional'; fixedIn.maxLength = 20; fixedIn.value = hostDraft || savedCode(); fixedIn.addEventListener('input', () => { hostDraft = fixedIn.value; });
    const tip = el('button', 'rtipbtn', '?'); tip.title = 'About room codes';
    const tipText = el('p', 'rtip' + (tipOpen ? '' : ' hidden'), 'Hosting: leave the code empty for a random room each time, or type your own (7 or more letters or digits is safer) to keep the SAME room every time, so friends can bookmark one link. It is remembered on this device. Joining: type a friend\u2019s code, or Watch to spectate.');
    tip.addEventListener('click', () => { tipOpen = !tipOpen; tipText.className = 'rtip' + (tipOpen ? '' : ' hidden'); });
    const hostRow = el('div', 'rrow rline'); hostRow.appendChild(el('span', 'rlabel', 'Your room code')); hostRow.appendChild(fixedIn); hostRow.appendChild(tip);
    const hostB = el('button', 'primary', 'Host a match'); hostB.addEventListener('click', () => { if (deck.length === 8) hostMatch(fixedIn.value); else { netInfo = 'Pick exactly 8 cards in your deck first.'; playPanel(); } });
    const joinRow = el('div', 'rrow rline'), codeIn = el('input', 'rcode'); codeIn.placeholder = 'Room code'; codeIn.maxLength = 20; codeIn.value = '';
    const joinBtn = el('button', 'primary', 'Join'), watchBtn = el('button', '', 'Watch'); joinBtn.addEventListener('click', () => joinRoom(codeIn.value, false)); watchBtn.addEventListener('click', () => joinRoom(codeIn.value, true)); watchBtn.title = 'Watch their match without playing';
    joinRow.appendChild(el('span', 'rlabel', 'Friend\u2019s code')); joinRow.appendChild(codeIn); joinRow.appendChild(joinBtn); joinRow.appendChild(watchBtn);
    const friendBox = el('div', 'rcardbox'); friendBox.appendChild(el('h3', 'rsec', 'Play with a friend')); friendBox.appendChild(hostRow); friendBox.appendChild(tipText); friendBox.appendChild(hostB); friendBox.appendChild(el('hr', 'rhr')); friendBox.appendChild(joinRow);
    left.appendChild(dk); left.appendChild(botBox); left.appendChild(friendBox);
    const gbox = el('div', 'rcardbox'); gbox.appendChild(el('h3', 'rsec', 'Game options')); gbox.appendChild(el('p', 'rsmallp', 'The rules for matches you start. When you host, they apply to your friend\u2019s match too.')); gbox.appendChild(optionsBox('game')); right.appendChild(gbox);
    cols.appendChild(left); cols.appendChild(right);
    showPanel('Play', '', [cols, el('p', 'rnetmsg', netInfo)], [], { back: { label: 'Back', go: menu } });
  }
  function deckPanel(msg) {
    mode = 'menu'; boardColors(); const E = activeEntry(), wrap = el('div', 'rdeckscreen');
    const lib = el('div', 'rdecklib');                                     // your saved decks
    deckEntries().forEach(d => { const b = el('button', 'rdeckchip' + (d.id === activeDeck ? ' on' : ''), (d.locked ? '\u2605 ' : '') + d.name); b.title = d.cards.length + ' cards'; b.addEventListener('click', () => { activeDeck = d.id; syncDeck(); saveDecks(); deckDelConfirm = ''; deckPanel(); }); lib.appendChild(b); });
    const nw = el('button', 'rdeckchip rnew', '+ New deck'); if (decks.length >= MAX_DECKS) { nw.className += ' off'; nw.title = 'You can keep up to ' + MAX_DECKS + ' decks'; } nw.addEventListener('click', () => { if (newDeck('My deck ' + (decks.length + 1), [])) deckPanel(); }); lib.appendChild(nw); wrap.appendChild(lib);
    const nr = el('div', 'rdeckname');
    if (E.locked) nr.appendChild(el('span', 'rdecknamefixed', 'The Default deck is built in and cannot be changed. Duplicate it, or just edit it: you get a copy.'));
    else { const ni = el('input', 'rname'); ni.value = E.name; ni.maxLength = 20; ni.placeholder = 'Deck name'; ni.title = 'Click to rename this deck'; ni.addEventListener('change', () => { renameDeck(E.id, ni.value); deckPanel(); }); ni.addEventListener('keydown', ev => { if (ev.key === 'Enter' && ni.blur) ni.blur(); ev.stopPropagation(); }); nr.appendChild(el('span', 'rlabel', 'Name')); nr.appendChild(ni); }
    const dup = el('button', 'rsmall', 'Duplicate'); dup.addEventListener('click', () => { if (newDeck(E.name + ' copy', E.cards)) deckPanel(); else deckPanel('You can keep up to ' + MAX_DECKS + ' decks.'); }); nr.appendChild(dup);
    if (!E.locked) { const del = el('button', 'rsmall danger', deckDelConfirm === E.id ? 'Really delete?' : 'Delete'); del.addEventListener('click', () => { if (deckDelConfirm === E.id) { deckDelConfirm = ''; deleteDeck(E.id); } else deckDelConfirm = E.id; deckPanel(); }); nr.appendChild(del); }
    wrap.appendChild(nr);
    const top = el('div', 'rdecktop'), slots = el('div', 'rslots');
    for (let i = 0; i < 8; i++) { const id = deck[i], sl = el('button', 'rslot' + (id ? ' full' : '')); if (id) { const g = el('span', 'g'); setIcon(g, id); sl.appendChild(g); sl.appendChild(el('small', '', Royale.CARDS[id].cost)); sl.title = Royale.CARDS[id].name + ' (click to remove)'; sl.addEventListener('click', () => { focusCard = id; toggleDeck(id); }); } else sl.title = 'Empty slot'; slots.appendChild(sl); }
    top.appendChild(el('b', 'rdeckcount' + (deck.length === 8 ? ' ok' : ''), 'Cards ' + deck.length + '/8')); top.appendChild(slots); wrap.appendChild(top);
    const body = el('div', 'rdeckbody'), grid = el('div', 'rdeck');
    const tile = (id, ref) => { const inDeck = deck.indexOf(id) >= 0, b = el('button', 'rdeckcard' + (inDeck ? ' on' : '') + (focusCard === id ? ' focus' : '') + (ref ? ' ref' : '')), g = el('span', 'g'); setIcon(g, id); b.appendChild(g); b.appendChild(el('span', 'nm', nameOf(id))); if (!ref) b.appendChild(el('small', 'cs', String(Royale.CARDS[id].cost))); if (inDeck) b.appendChild(el('i', 'tick', '\u2713'));
      b.setAttribute('data-card', id); b.addEventListener('click', () => { if (focusCard === id && !ref) { toggleDeck(id); return; } focusCard = id; deckPanel(); }); return b; };
    Royale.CARD_IDS.forEach(id => grid.appendChild(tile(id, false)));
    const refRow = el('div', 'rdeck rref'); ['fortress', 'bastion', 'k'].forEach(id => refRow.appendChild(tile(id, true)));
    const left = el('div', 'rdeckleft'); left.appendChild(el('h3', 'rsec', 'Cards')); left.appendChild(grid); left.appendChild(el('h3', 'rsec', 'Always in play')); left.appendChild(refRow);
    const f = cardFacts(focusCard), det = el('div', 'rdetail'), hd = el('div', 'rdethead'), hg = el('span', 'g'); setIcon(hg, focusCard); hd.appendChild(hg); const ht = el('div', ''); ht.appendChild(el('b', 'rdetname', f.name)); ht.appendChild(el('small', '', f.tag)); hd.appendChild(ht); det.appendChild(hd);
    if (Royale.CARDS[focusCard]) { const inD = deck.indexOf(focusCard) >= 0, ab = el('button', inD ? 'danger' : 'primary', inD ? 'Remove from deck' : 'Add to deck'); if (!inD && deck.length >= 8) { ab.className += ' off'; ab.title = 'Your deck is full: remove a card first'; } ab.addEventListener('click', () => toggleDeck(focusCard)); det.appendChild(ab); }
    const tbl = el('div', 'rfacts'); f.rows.forEach(r => { const row = el('div', 'rfact'); row.appendChild(el('span', 'rfl', r[0])); row.appendChild(el('span', 'rfv', String(r[1]))); tbl.appendChild(row); }); det.appendChild(tbl);
    if (f.prio) { const pr = el('div', 'rprio'); pr.appendChild(el('b', '', 'Priority')); pr.appendChild(el('span', '', f.prio)); det.appendChild(pr); }
    const pg = el('div', 'rpatwrap'); pg.appendChild(pattern(f.pat)); pg.appendChild(el('small', '', f.legend)); det.appendChild(pg); det.appendChild(el('p', 'rdettext', f.text));
    body.appendChild(left); body.appendChild(det); wrap.appendChild(body);
    if (msg) wrap.appendChild(el('p', 'rnetmsg', msg));
    showPanel('Deck', '', [wrap], [], { back: { label: 'Done', go: menu } });
  }
  function toggleDeck(id) {
    let note = ''; if (activeDeck === 'default') { if (!newDeck('Custom deck', Royale.DEFAULT_DECK)) return deckPanel('You can keep up to ' + MAX_DECKS + ' decks.'); note = 'The Default deck cannot be changed, so this is a copy called \u201CCustom deck\u201D (rename it any time).'; }
    const i = deck.indexOf(id); if (i >= 0) deck.splice(i, 1); else if (deck.length < 8) deck.push(id); focusCard = id; saveDecks(); deckPanel(note);
  }
  function guideBlocks() {
    const K = Royale.CONSTANTS, P = (h, t) => { const d = el('div', 'rhelpblock'); d.appendChild(el('b', '', h)); d.appendChild(el('p', 'rhelp', t)); return d; };
    return [P('The goal', 'Break the enemy Fortress (the big tower at the far end) before yours falls. At time up the side with more towers, then more tower health, wins; a tie goes to sudden death.'),
      P('Material and cards', 'Cards cost Material, which refills over time and speeds up as the match goes on: x1.5 after 1:00, x2 after 2:00 and x3 in overtime. Pieces then fight on their own; spells, orders and the King are yours to aim.'),
      P('Playing a card', 'Press Q, W, E or R, or click a card, then click a lit square on your half. Or drag the card onto the board. A ghost shows where it will land. Spells can go anywhere.'),
      P('How pieces attack', 'Pawns, knights and the Camel hit from where they stand. Bishops, rooks and queens slide next to their target and then hit it. Each piece has a Priority (see it in the Deck screen). Towers shoot the most valuable piece in range. A slash or shot line shows who is hitting whom (gold = yours, red = theirs).'),
      P('Selecting pieces', 'Click, shift-click to add, drag a box over empty squares, double-click a piece to select every piece of that type, A for all. Ctrl+1 to 5 saves a group, 1 to 5 brings it back, Escape clears.'),
      P('Orders', 'Attack, Hold (guard your half) and Promote (pawns run for the back rank). Knights, rooks and the Camel follow their own plan and take no orders.'),
      P('The King', 'Send King, then click a square. He has his own Health once he is out (at home he shares the Fortress\u2019s), hits the 8 squares around him, and heals at home. After going out he cannot be recalled for ' + secs(K.KING_OUT_LOCK) + ' (unless he is below 30%). While he is out your Fortress stops shooting. If your Fortress falls while he is out, the match goes on until he is defeated.'),
      P('Friends', 'Host a match, send the link, and press Start when they have joined. If someone drops, the match waits up to a minute. Spectators can use the Watch link. Chat appears on the right in friend matches. Use the Games button (top left) to go back to classic chess.')];
  }
  function openGuide() { holdForOverlay(); drawerBody.innerHTML = ''; guideBlocks().forEach(n => drawerBody.appendChild(n)); drawer.className = 'rdrawer'; drawerOn = true; }
  // ---- the options overlay: on top of whatever you are doing, any time
  function openOverlay(nodes) { overlayBody.innerHTML = ''; nodes.forEach(n => overlayBody.appendChild(n)); overlay.className = 'rover'; overlayOn = true; }
  function closeOverlay(quiet) { if (overlay) overlay.className = 'rover hidden'; overlayOn = false; releaseHold(quiet); }
  function releaseHold(quiet) {
    if (quiet) { optPaused = false; return; }
    if (optPaused && !overlayOn && !drawerOn) { optPaused = false; if (mode === 'play') { paused = false; pauseBtn.textContent = 'Pause'; } }
  }
  function closeDrawer(quiet) { if (drawer) drawer.className = 'rdrawer hidden'; drawerOn = false; releaseHold(quiet); }
  function holdForOverlay() { if (mode === 'play' && bot && !net && !paused) { paused = true; optPaused = true; pauseBtn.textContent = 'Resume'; } }
  function openOptions() {                                               // YOUR options (looks and sounds on this device). The rules of a match are game options on the Play screen.
    holdForOverlay(); const done = el('button', 'primary', mode === 'play' && bot && !net ? 'Resume' : 'Done'); done.addEventListener('click', () => closeOverlay());
    const r = el('div', 'rrow'); r.appendChild(done); if (mode === 'play') { const q = el('button', 'danger', 'Quit match'); q.addEventListener('click', quit); r.appendChild(q); }
    openOverlay([el('h2', '', 'Options'), el('p', 'rsmallp', (mode === 'play' && bot && !net ? 'The match is paused while this is open. ' : '') + 'Saved on this device. Rules for a match are on the Play screen.'), optionsBox('user'), r]);
  }
  function quit() {                                                     // ends the MATCH only: you land on the Chess Royale menu, never in classic chess
    if (mode === 'play') {
      holdForOverlay(); const what = netRole === 'host' ? 'This ends the match for your friend too.' : netRole === 'guest' ? 'You will leave the room.' : netRole === 'spec' ? 'You will stop watching.' : 'The match is not saved.';
      const r = el('div', 'rrow'), keep = el('button', 'primary', netRole === 'spec' ? 'Keep watching' : 'Keep playing'), q = el('button', 'danger', netRole === 'spec' ? 'Stop watching' : 'Quit match');
      keep.addEventListener('click', () => closeOverlay()); q.addEventListener('click', () => { closeOverlay(true); menu(); }); r.appendChild(keep); r.appendChild(q);
      openOverlay([el('h2', '', 'Quit this match?'), el('p', '', what), r]);
    } else { closeOverlay(true); menu(); }
  }

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
  function fillAv(e, name, pfp, color) {                                 // a round picture or initial, the same helper classic chess uses when it exists
    const k = name + '|' + (pfp ? pfp.length : 0) + '|' + color; if (e._k === k) return; e._k = k;
    try { if (typeof fillAvatar === 'function') { fillAvatar(e, name, pfp, color); return; } } catch (err) { /* fall through */ }
    e.textContent = (name || '?').slice(0, 1).toUpperCase(); e.style.backgroundColor = color || '#6b7f4e';
  }
  function updateProfile() { if (!profChip) return; const nm = myNameSafe(); profChip.nm.textContent = nm; fillAv(profChip.av, nm, myPfp(), '#6b7f4e'); }
  function playerInfo(side) {
    if (spec) return { name: names[side] || (side === 'w' ? 'White' : 'Black'), pfp: pfps[side] || '' };
    if (side === me) return { name: names[me] || myNameSafe(), pfp: (net && pfps[me]) || myPfp() };
    if (bot) return { name: 'Bot (' + cap(level) + ')', pfp: '', bot: true };
    return { name: names[side] || 'Opponent', pfp: pfps[side] || '' };
  }
  function boardColors() {                                               // the board's two square colours: your chosen theme, or whatever classic chess is using
    const t = now(); if (palette && t - paletteAt < 1000) return palette; paletteAt = t; let l = '#f0d9b5', d = '#b58863'; const th = BOARD_THEMES.find(x => x[0] === settings.boardTheme);
    if (th && th[2]) { l = th[2]; d = th[3]; } else { try { const cs = getComputedStyle(document.documentElement); l = cs.getPropertyValue('--light').trim() || l; d = cs.getPropertyValue('--dark').trim() || d; } catch (e) { /* classic defaults */ } }
    palette = { l, d }; try { root.style.setProperty('--rl', l); root.style.setProperty('--rd', d); } catch (e) { /* no style API */ } return palette;
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


  // ---- starting games
  function resetUi() {
    sel = -1; kingMode = false; picked = new Set(); groups = {}; hover = null; drag = null; cardDrag = null; lastClick = null; fx = []; before = {}; paused = false; optPaused = false; pauseBtn.textContent = 'Pause'; toast(''); infoEl.textContent = '';
    [hitAt, towerHitAt, shakeAt, deployAt].forEach(m => Object.keys(m).forEach(k => { delete m[k]; })); closeOverlay(true); dragGhost.className = 'rdragghost hidden';
    stats = newStats(); sideOf = {}; unitOf = {}; low = false; lowWarned = false; autoRecallAt = -99; mode = 'play'; lastTime = now(); hidePanel(); chatWrap.style.display = net ? '' : 'none'; resize();
  }
  const kingCfg = () => (game.kingHeal === 'off' ? { KING_REGEN: 0 } : game.kingHeal === 'fast' ? { KING_REGEN: 3, KING_REGEN_IDLE: 4 } : {});
  const matchCfg = oppFb => Object.assign({ PROMO_FALLBACK: { w: game.fb, b: oppFb }, ORDER_COOLDOWN: game.orderCd * 4 }, kingCfg());
  function newSeed() { return (Math.floor(now() * 1000) % 65535) + 1; }
  function startBot() {
    leaveNet(); const seed = newSeed(); me = 'w'; names = { w: '', b: '' }; pfps = { w: '', b: '' }; sim = Royale.create({ seed, decks: { w: deck.slice(), b: Royale.DEFAULT_DECK.slice() }, cfg: matchCfg(true) }); bot = Royale.bot(level, seed + 1);
    pauseBtn.style.display = ''; resetUi(); updateOpp(); hud(); startLoop(true);
  }
  // The viewers (guest and spectators) get no decks and no seed: with those they could work out the host's hand order. They get the settings and the names only.
  const startMsg = resume => ({ type: 'ry_start', cfg: { PROMO_FALLBACK: sim.K.PROMO_FALLBACK, ORDER_COOLDOWN: sim.K.ORDER_COOLDOWN, KING_REGEN: sim.K.KING_REGEN, KING_REGEN_IDLE: sim.K.KING_REGEN_IDLE }, names: { w: names.w, b: names.b }, pfps: { w: pfps.w, b: pfps.b }, resume: !!resume });
  function startHosted() {                                              // host: a friend has joined and the host pressed Start (or Rematch)
    if (!net || !net.connected || !guestHello) { toast('Your friend has left, so there is nobody to play.'); return; }
    clearGrace(); const seed = newSeed(), hello = guestHello, cfg = matchCfg(hello.fb !== false), oppDeck = validDeck(hello.deck) ? hello.deck.slice() : Royale.DEFAULT_DECK.slice();
    matchTok = typeof hello.tok === 'string' ? hello.tok.slice(0, 40) : ''; me = 'w'; spec = false; bot = null; names.w = myNameSafe();
    sim = Royale.create({ seed, decks: { w: deck.slice(), b: oppDeck }, cfg }); pauseBtn.style.display = 'none'; resetUi(); updateOpp(); hud();
    net.send(startMsg(false)); net.send({ type: 'ry_state', st: sim.view('b'), ev: [] }); net.sendSpecs(startMsg(false)); net.sendSpecs({ type: 'ry_state', st: sim.view('s'), ev: [] }); startLoop(true);
  }
  function resumeHosted(m) {                                            // the guest came back (same token) while the match was waiting for them
    clearGrace(); guestHello = m; names.b = cleanTxt(m.name, 24) || names.b; pfps.b = cleanPfp(m.pfp) || pfps.b; net.send(startMsg(true)); net.send({ type: 'ry_state', st: sim.view('b'), ev: [] });
    hidePanel(); updateOpp(); toast((names.b || 'Your friend') + ' is back.'); startLoop(true);
  }
  function showRoom(code) {
    roomShown = code; mode = 'menu'; const base = (typeof location !== 'undefined' ? location.origin + location.pathname : ''), joinUrl = base + '?royale=' + code, watchUrl = base + '?watch=' + code;
    const btnOf = e => (e && (e.currentTarget || e.target)) || { textContent: '' };
    showPanel('Your room', 'Share this room code or the link. When a friend joins you choose when to start.', [el('p', 'rcodebig', code), el('p', 'rlinkline', 'Join: ' + joinUrl), el('p', 'rlinkline', 'Watch: ' + watchUrl), el('p', 'rnetmsg', specN ? specN + ' watching' : '')],
      [{ label: 'Copy link', on: true, title: 'Copy the invite link', go: e => copyLink(joinUrl, btnOf(e), 'Copy link') }, { label: 'Copy watch link', title: 'Copy a link for spectators', go: e => copyLink(watchUrl, btnOf(e), 'Copy watch link') }, { label: 'Close room', go: menu }]);
  }
  function lobbyPanel() {
    showPanel((names.b || 'A friend') + ' joined', 'Press Start when you are ready.', [el('p', 'rnetmsg', specN ? specN + ' watching' : '')],
      [{ label: 'Start match', on: true, go: startHosted }, { label: 'Send away', go: () => { if (net) net.kick(); guestHello = null; names.b = ''; showRoom(roomShown); } }, { label: 'Close room', go: menu }]);
  }
  function hostMatch(raw) {
    leaveNet(); netInfo = ''; guestHello = null; names = { w: myNameSafe(), b: '' }; pfps = { w: myPfp(), b: '' }; chat = []; hostChatAt = {};
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
        guestHello = m; names.b = cleanTxt(m.name, 24) || 'Guest'; pfps.b = cleanPfp(m.pfp); net.send({ type: 'ry_wait', name: names.w, pfp: pfps.w }); lobbyPanel(); return true;
      },
      onSpectator: () => { specN = net.specCount; updateOpp(); if (sim && mode === 'play') { net.sendSpecs(startMsg(false)); net.sendSpecs({ type: 'ry_state', st: sim.view('s'), ev: [] }); } else net.sendSpecs({ type: 'ry_wait', name: names.w, pfp: pfps.w }); },
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
    } else if (mode === 'over') toast('Your friend left.');
    else if (guestHello) { guestHello = null; names.b = ''; showRoom(roomShown); }          // they left while the lobby was waiting for Start
  }
  function endGrace(text) { clearGrace(); mode = 'over'; guestHello = null; if (net) net.kick(); showPanel('Match ended', text, [], [{ label: 'Menu', on: true, go: menu }]); }
  function cleanCmd(c) {                                                // never trust a command from the network: whitelist the fields
    const o = { type: String(c.type) }; ['slot', 'x', 'y'].forEach(k => { if (typeof c[k] === 'number' && isFinite(c[k])) o[k] = c[k]; });
    if (typeof c.order === 'string') o.order = c.order.slice(0, 12); if (typeof c.piece === 'string') o.piece = c.piece.slice(0, 8); if (Array.isArray(c.ids)) o.ids = c.ids.filter(n => typeof n === 'number').slice(0, 200); return o;
  }
  // ---- guest and spectator side
  function joinRoom(rawCode, asSpec) {
    leaveNet(); netInfo = ''; names = { w: '', b: '' }; pfps = { w: '', b: '' }; chat = []; spec = !!asSpec; netRole = asSpec ? 'spec' : 'guest'; me = asSpec ? 'w' : 'b'; lastRoom = { code: RoyaleNet.cleanCode(rawCode), spec: !!asSpec };
    showPanel('Joining\u2026', 'Connecting to the room. If nothing happens in a few seconds, check the code.', [], [{ label: 'Cancel', go: menu }]); connect();
  }
  function connect() {
    net = RoyaleNet.join(lastRoom.code, {
      onOpen: () => { if (net) net.send({ type: 'ry_hello', deck: deck.slice(), fb: game.fb, name: myNameSafe(), pfp: myPfp(), tok: myTok(), spec: lastRoom.spec }); },
      onMsg: onNetMsg, onClose: () => connLost(),
      onError: e => { if (reconnecting) { scheduleRecon(e); return; } leaveNet(); netInfo = e; me = 'w'; menu(); } });
  }
  function connLost() {
    if (netRole !== 'guest' && netRole !== 'spec') return;
    if (byeSeen) { leaveNet(); mode = 'over'; showPanel('Room closed', 'The host closed the room.', [], [{ label: 'Menu', on: true, go: menu }]); return; }
    if (mode === 'play') { reconnecting = true; reconTries = 0; net = null; attemptRecon(); }
    else if (mode === 'over') { leaveNet(); toast('The connection was lost.'); }
    else { leaveNet(); netInfo = 'The connection was lost.'; me = 'w'; menu(); }
  }
  function attemptRecon() { reconTries++; showPanel('Connection lost', 'Reconnecting\u2026 (attempt ' + reconTries + ' of 20). The match waits for you for a minute.', [], [{ label: 'Give up', go: menu }]); connect(); }
  function scheduleRecon(e) { if (reconTries >= 20) { leaveNet(); netInfo = 'Could not reconnect (' + e + ').'; me = 'w'; menu(); return; } reconTimer = setTimeout(attemptRecon, 3000); }
  function onNetMsg(m) {
    if (netRole !== 'guest' && netRole !== 'spec') return;
    if (m.type === 'ry_wait') { reconnecting = false; names.w = cleanTxt(m.name, 24); pfps.w = cleanPfp(m.pfp); mode = 'wait'; showPanel(netRole === 'spec' ? 'Watching' : 'Connected', (names.w || 'The host') + ' has not started the match yet. It begins as soon as they press Start.', [], [{ label: 'Leave', go: menu }]); }
    else if (m.type === 'ry_start') {
      reconnecting = false; names = { w: cleanTxt(m.names && m.names.w, 24), b: cleanTxt(m.names && m.names.b, 24) }; pfps = { w: cleanPfp(m.pfps && m.pfps.w), b: cleanPfp(m.pfps && m.pfps.b) };
      if (m.resume && sim && mode === 'play') { hidePanel(); updateOpp(); toast('Reconnected.'); return; }
      me = netRole === 'spec' ? 'w' : 'b'; spec = netRole === 'spec'; bot = null;
      sim = Royale.create({ decks: { w: Royale.DEFAULT_DECK, b: Royale.DEFAULT_DECK }, shuffle: false, cfg: { PROMO_FALLBACK: m.cfg ? m.cfg.PROMO_FALLBACK : true, ORDER_COOLDOWN: Number(m.cfg && m.cfg.ORDER_COOLDOWN) || 0 } });
      pauseBtn.style.display = 'none'; resetUi(); updateOpp(); hud(); startLoop(false);
    } else if (m.type === 'ry_state' && sim && mode === 'play' && m.st && typeof m.st === 'object') {
      before = {}; const pos = {}; sim.st.units.forEach(u => { before[u.id] = [u.x, u.y]; pos[u.id] = [u.x, u.y]; });
      noteSides(); sim.loadState(m.st); lastTime = now(); handleEvents(Array.isArray(m.ev) ? m.ev : [], pos); afterStep();
    } else if (m.type === 'ry_res' && m.ok === false) toast(cap(String(m.reason || 'That did not work')));
    else if (m.type === 'ry_chat' && typeof m.text === 'string') addChat(['w', 'b', 's'].indexOf(m.who) >= 0 ? m.who : 's', cleanTxt(m.name, 24), cleanTxt(m.text, 200));
    else if (m.type === 'ry_bye') byeSeen = true;
  }


  // ---- the game loop
  function startLoop(ticking) { stopLoop(); if (ticking) timer = setInterval(tick, TICK()); const f = () => { render(); raf = requestAnimationFrame(f); }; raf = requestAnimationFrame(f); }
  function stopLoop() { if (timer) clearInterval(timer); timer = null; if (raf && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(raf); raf = 0; }
  function togglePause() { if (mode !== 'play' || net) return; paused = !paused; optPaused = false; pauseBtn.textContent = paused ? 'Resume' : 'Pause'; toast(paused ? 'Paused' : '', paused); }
  const towerCentre = id => { const t = sim.st.towers.find(v => v.id === id); return t ? [t.x0 + (t.w - 1) / 2, t.y0 + (t.h - 1) / 2] : null; };
  const noteSides = () => { sideOf = {}; unitOf = {}; sim.st.units.forEach(u => { sideOf[u.id] = u.side; unitOf[u.id] = { side: u.side, t: u.king ? 'k' : u.t }; }); };
  const perSide = () => ({ cards: 0, pieces: 0, spells: 0, spent: 0, lost: 0, kills: 0, towerKills: 0, towersDown: 0, dmgUnits: 0, dmgTowers: 0, dmgFire: 0, promos: 0, full: 0, byCard: {}, byPiece: {} });
  const newStats = () => ({ w: perSide(), b: perSide(), tickSeen: -1 });
  function tick() {                                                     // local and host games only
    if (!sim || paused || graceTimer || mode !== 'play') return;
    before = {}; const pos = {}; sim.st.units.forEach(u => { before[u.id] = [u.x, u.y]; pos[u.id] = [u.x, u.y]; }); noteSides();
    if (bot) bot.think(sim, 'b'); const evs = sim.step(); lastTime = now();
    if (net && netRole === 'host') { net.send({ type: 'ry_state', st: sim.view('b'), ev: evs }); if (net.specCount) net.sendSpecs({ type: 'ry_state', st: sim.view('s'), ev: evs }); }
    handleEvents(evs, pos); afterStep();
  }
  // Every event does three things: counts towards the end-of-match report, starts a visual cue, and (for a few) plays a sound.
  function handleEvents(evs, pos) {
    const fl = settings.flash, t0 = lastTime, curU = id => sim.st.units.find(u => u.id === id), twr = id => sim.st.towers.find(v => v.id === id);
    const at = id => (pos[id] ? pos[id] : (curU(id) ? [curU(id).x, curU(id).y] : null));        // where a unit was before this step
    const nowAt = id => (curU(id) ? [curU(id).x, curU(id).y] : at(id));
    const push = o => { o.t0 = t0; fx.push(o); };
    evs.forEach(e => {
      const st = n => stats[n];
      if (e.e === 'deploy') { unitOf[e.id] = { side: e.side, t: e.t }; sideOf[e.id] = e.side; st(e.side).pieces++; deployAt[e.id] = t0; if (fl) push({ k: 'ring', x: e.x, y: e.y, col: '255,255,255', small: true }); }
      else if (e.e === 'play') { const a = st(e.side); a.cards++; a.spent += e.cost; a.byCard[e.card] = (a.byCard[e.card] || 0) + 1; }
      else if (e.e === 'cast') st(e.side).spells++;
      else if (e.e === 'promote' && e.id != null) { const u = curU(e.id); if (u) { st(u.side).promos++; if (unitOf[e.id]) unitOf[e.id].t = e.to; if (fl) push({ k: 'promo', x: u.x, y: u.y }); if (u.side === me) sfxSafe('ping'); } }
      else if (e.e === 'towerDown') { const tw = twr(e.tower), c = towerCentre(e.tower); if (tw) st(other(tw.side)).towersDown++; if (c && fl) push({ k: 'boom', x: c[0], y: c[1] }); }
      else if (e.e === 'kingHome' && e.side === me) toast('Your King is home.');
      if (e.e === 'hit' || e.e === 'kill' || e.e === 'towerHit' || e.e === 'towerFire') {
        const a = e.tower && e.e !== 'towerHit' ? null : unitOf[e.id], tw = e.tower ? twr(e.tower) : null, tgtU = e.target != null ? (unitOf[e.target] || (curU(e.target) ? { side: curU(e.target).side } : null)) : null;
        const dmg = e.dmg || 0, A = e.e === 'towerFire' || (e.e === 'kill' && e.tower != null) ? (towerCentre(e.tower)) : (e.id != null ? at(e.id) : null);
        const T = e.e === 'towerHit' ? towerCentre(e.tower) : (e.target != null ? at(e.target) : null);
        const attSide = a ? a.side : tw ? tw.side : null, tgtSide = e.e === 'towerHit' ? (tw ? tw.side : null) : (tgtU ? tgtU.side : null);
        // report
        if (attSide) {
          const S = st(attSide);
          if (e.e === 'towerHit') { S.dmgTowers += dmg; if (a) S.byPiece[a.t] = (S.byPiece[a.t] || 0) + dmg; }
          else if (e.e === 'towerFire') S.dmgFire += dmg;
          else { if (e.tower != null) S.dmgFire += dmg; else { S.dmgUnits += dmg; if (a) S.byPiece[a.t] = (S.byPiece[a.t] || 0) + dmg; } if (e.e === 'kill') { if (e.tower != null) S.towerKills++; else S.kills++; } }
        }
        if (e.e === 'kill') { if (tgtSide) st(tgtSide).lost++; sfxSafe('capture'); }
        // visuals
        if (fl && T) {
          const mine = attSide === me, col = mine ? '255,210,74' : '255,77,77';
          if (e.e === 'towerFire') { if (A) push({ k: 'shot', from: A, to: T, col }); if (A) push({ k: 'ring', x: A[0], y: A[1], col, small: true }); }
          else if (A) { push({ k: 'slash', from: A, to: T, col }); if (e.id != null) { const d = [T[0] - A[0], T[1] - A[1]], n = Math.hypot(d[0], d[1]) || 1; shakeAt[e.id] = { t0, dx: d[0] / n, dy: d[1] / n }; } }
          if (e.e === 'towerHit' && e.tower != null) towerHitAt[e.tower] = t0; else if (e.target != null) hitAt[e.target] = t0;
          if (e.e === 'kill') push({ k: 'ring', x: T[0], y: T[1], kill: true, col: '255,60,60' }); else push({ k: 'ring', x: T[0], y: T[1], col });
        }
        if (settings.nums && T && dmg) push({ k: 'num', x: T[0], y: T[1], text: '-' + dmg, mine: tgtSide === me });
      }
      if (e.e === 'spell' && fl) { push({ k: 'spell', x: e.x, y: e.y, spell: e.card }); if (e.card === 'zug') push({ k: 'freeze', x: e.x, y: e.y }); }
    });
  }
  function afterStep() {
    picked.forEach(id => { if (!sim.st.units.some(u => u.id === id)) picked.delete(id); });
    hud(); if (sim.st.over && mode === 'play') over();
  }
  const barsOf = (s, side) => { const f = s.towers.find(t => t.side === side && t.kind === 'fortress'), b = s.towers.filter(t => t.side === side && t.kind === 'bastion').sort((p, q) => p.x0 - q.x0); return { f, b }; };
  function over() {
    mode = 'over'; stopTicking(); closeOverlay(true); syncRoot(); const w = sim.st.winner, r = sim.st.reason, viewer = netRole === 'spec', A = viewer ? 'w' : me, B = other(A), s = sim.snapshot(), sa = stats[A], sb = stats[B];
    const dur = Math.round(sim.st.tick * TICK() / 1000), mm = Math.floor(dur / 60) + ':' + String(dur % 60).padStart(2, '0'), who = viewer ? { A: 'White', B: 'Black' } : { A: 'You', B: 'Opponent' };
    sfxSafe(w === me ? 'ping' : 'check');
    const title = viewer ? (w === 'w' ? 'White wins' : w === 'b' ? 'Black wins' : 'Draw') : (w === me ? 'You win!' : w == null ? 'Draw' : 'You lose');
    const rep = el('div', 'rreport ' + (viewer ? '' : w === me ? 'won' : w == null ? '' : 'lost'));
    rep.appendChild(el('p', 'rrsub', cap(r) + ' \u00B7 ' + mm));
    // final towers
    const tw = el('div', 'rrtowers'); [[A, who.A], [B, who.B]].forEach(p => {
      const col = el('div', 'rrtcol'), { f, b } = barsOf(s, p[0]); col.appendChild(el('b', '', p[1]));
      [[f, 'Fortress', 'big'], [b[0], 'Bastion', ''], [b[1], 'Bastion', '']].forEach(q => { const tt = q[0]; if (!tt) return; const bar = el('div', 'rtbar ' + q[2] + (tt.hp <= 0 ? ' dead' : '')), fl = el('div', 'rtfill'), tx = el('span', 'rtnum', tt.hp > 0 ? tt.hp + '/' + tt.maxhp : 'Destroyed'); fl.style.width = Math.max(0, Math.round(100 * tt.hp / tt.maxhp)) + '%'; bar.appendChild(fl); bar.appendChild(tx); bar.title = q[1]; col.appendChild(bar); });
      tw.appendChild(col);
    }); rep.appendChild(tw);
    const rows = [['Cards played', x => x.cards, 1], ['Pieces deployed', x => x.pieces, 1], ['Spells cast', x => x.spells, 1], ['Material spent', x => x.spent, 1], ['Pieces destroyed', x => x.kills + x.towerKills, 1], ['Pieces lost', x => x.lost, -1],
      ['Towers destroyed', x => x.towersDown, 1], ['Damage to pieces', x => x.dmgUnits + x.dmgFire, 1], ['Damage to towers', x => x.dmgTowers, 1], ['Promotions', x => x.promos, 1], ['Time at full Material', x => secs(x.full), -1, x => x.full]];
    const tb = el('div', 'rstats'), head = el('div', 'rstatrow head'); head.appendChild(el('span', '', '')); head.appendChild(el('span', 'v', who.A)); head.appendChild(el('span', 'v', who.B)); tb.appendChild(head);
    rows.forEach(rw => { const va = rw[3] ? rw[3](sa) : rw[1](sa), vb = rw[3] ? rw[3](sb) : rw[1](sb), da = rw[1](sa), db = rw[1](sb), row = el('div', 'rstatrow'), better = da === db ? 0 : (da > db ? 1 : -1) * rw[2];
      row.appendChild(el('span', 'l', rw[0])); row.appendChild(el('span', 'v' + (better > 0 ? ' best' : ''), String(rw[3] ? rw[1](sa) : va))); row.appendChild(el('span', 'v' + (better < 0 ? ' best' : ''), String(rw[3] ? rw[1](sb) : vb))); tb.appendChild(row); });
    rep.appendChild(tb);
    const top = (obj, f) => Object.keys(obj).sort((p, q) => obj[q] - obj[p] || (p < q ? -1 : 1)).map(k => f(k, obj[k]))[0], hl = el('div', 'rhighs');
    const fav = top(sa.byCard, (k, v) => nameOf(k) + ' (x' + v + ')'), mvp = top(sa.byPiece, (k, v) => nameOf(k) + ' (' + v + ' damage)');
    if (fav) hl.appendChild(el('span', 'rchip', (viewer ? 'White\u2019s' : 'Your') + ' favourite card: ' + fav)); if (mvp) hl.appendChild(el('span', 'rchip', (viewer ? 'White\u2019s' : 'Your') + ' top piece: ' + mvp));
    if (hl.children.length) rep.appendChild(hl);
    const viewerRole = netRole === 'guest' || netRole === 'spec';
    const btns = viewerRole ? [{ label: 'Menu', on: true, go: menu }] : [{ label: netRole === 'host' ? 'Rematch' : 'Play again', on: true, go: () => (netRole === 'host' ? startHosted() : startBot()) }, { label: 'Menu', go: menu }];
    showPanel(title, netRole === 'guest' ? 'The host can start a rematch.' : '', [rep], btns);
  }
  const stopTicking = () => { if (timer) clearInterval(timer); timer = null; };
  const fail = res => { toast(res.ok ? '' : cap(res.reason)); return res.ok; };
  function submit(cmd) {                                                // the one place a command leaves the UI: straight into the sim, or over the network
    if (netRole === 'spec') return { ok: false, reason: 'Spectators cannot play' };
    if (netRole === 'guest') { const why = sim.can(me, cmd); if (why) return { ok: false, reason: why }; if (net) net.send({ type: 'ry_cmd', cmd, rid: ++rid }); return { ok: true }; }
    return sim.command(me, cmd);
  }
  function pick(i) { if (mode !== 'play' || spec) return; sel = sel === i ? -1 : i; kingMode = false; toast(''); hud(); }
  function kingButton() {
    if (mode !== 'play' || paused) return; const k = sim.snapshot().king[me];
    if (k.out) { fail(submit({ type: 'recall' })); } else if (sim.st.tick < k.cd) { toast('The King is still recovering'); } else { kingMode = !kingMode; sel = -1; toast(kingMode ? 'Click a lit square to send the King out' : ''); }
    hud();
  }
  // ---- dragging a card onto the board (a plain click still just selects it)
  const overCanvas = e => { const r = canvas.getBoundingClientRect(); return e.clientX >= r.left && e.clientX < r.left + r.width && e.clientY >= r.top && e.clientY < r.top + r.height && r.width > 0; };
  function cardDown(i, e) {
    if (mode !== 'play' || paused || spec || (e.button != null && e.button !== 0)) return;
    cardDrag = { i, x0: e.clientX, y0: e.clientY, on: false }; const b = hand[i].b; if (b.setPointerCapture && e.pointerId != null) { try { b.setPointerCapture(e.pointerId); } catch (err) { /* not fatal */ } }
  }
  function cardMove(e) {
    const d = cardDrag; if (!d) return;
    if (!d.on && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > 7) { d.on = true; ghostLast = null; ghostTilt = 0; sel = d.i; kingMode = false; toast(''); setIcon(dragGhost.g, hand[d.i].card); dragGhost.className = 'rdragghost' + (me === 'b' ? ' dark' : ''); hud(); }
    if (d.on) {
      const vx = ghostLast == null ? 0 : e.clientX - ghostLast; ghostLast = e.clientX; ghostTilt = Math.max(-28, Math.min(28, ghostTilt * 0.5 + vx * 1.6));   // it sways with the pointer, like dragging a piece in classic chess
      dragGhost.style.left = e.clientX + 'px'; dragGhost.style.top = e.clientY + 'px'; dragGhost.style.width = dragGhost.style.height = Math.round(cell * 1.15) + 'px'; dragGhost.style.transform = 'translate(-50%, -55%) rotate(' + ghostTilt.toFixed(1) + 'deg) scale(1.08)';
      hover = overCanvas(e) ? cellAt(e) : null;
    }
  }
  function cardUp(e) {
    const d = cardDrag; cardDrag = null; if (!d) return; dragGhost.className = 'rdragghost hidden'; if (!d.on) return;      // a click: the click handler selects the card
    suppressAt = now();
    if (mode === 'play' && !paused && overCanvas(e)) { const c = cellAt(e); if (fail(submit({ type: 'deploy', slot: d.i, x: c.x, y: c.y }))) sel = -1; } else sel = -1;       // dropped off the board: cancelled
    hover = null; hud();
  }
  function cardCancel() { if (cardDrag && cardDrag.on) { sel = -1; hover = null; hud(); } cardDrag = null; dragGhost.className = 'rdragghost hidden'; }
  // ---- selection and orders
  const selIds = () => Array.from(picked).filter(id => sim.st.units.some(u => u.id === id));
  function selectAll() { if (mode !== 'play') return; picked = new Set(mineUnits().filter(u => !u.king).map(u => u.id)); hud(); }
  function saveGroup(n) { groups[n] = selIds(); toast('Group ' + n + ' saved (' + groups[n].length + ')'); }
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
    if (!root || !visible) return; const k = (e.key || '').toLowerCase();
    if (overlayOn || drawerOn) { if (k === 'escape') { if (overlayOn) closeOverlay(); else closeDrawer(); e.stopPropagation(); } return; }
    if (mode !== 'play' || (e.target && e.target.tagName === 'INPUT')) return; const hot = HOT.map(h => h.toLowerCase()).indexOf(k);
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
    if (kingMode) { if (fail(submit({ type: 'kingOut', x: c.x, y: c.y }))) { kingMode = false; toast(''); } hud(); return; }
    drag = { x0: c.x, y0: c.y, x1: c.x, y1: c.y, shift: !!e.shiftKey };
  }
  function inspect(x, y) {
    const u = sim.st.units.find(v => v.x === x && v.y === y), K = Royale.CONSTANTS;
    if (u) { const nm = u.king ? 'King' : Royale.DEFS[u.t].name; return nm + ' (' + (u.side === me ? 'yours' : 'enemy') + '): Health ' + u.hp + '/' + u.maxhp + ', Damage ' + u.dmg + ', acts every ' + secs(u.cd) + (u.stance && u.stance !== 'attack' ? ', ' + u.stance : '') + ((u.frozenUntil || 0) > sim.st.tick ? ', frozen' : ''); }
    const w = sim.st.towers.find(v => v.hp > 0 && x >= v.x0 && x < v.x0 + v.w && y >= v.y0 && y < v.y0 + v.h);
    if (w) { const f = w.kind === 'fortress'; return (w.side === me ? 'Your ' : 'Enemy ') + (f ? 'Fortress' : 'Bastion') + ': Health ' + w.hp + '/' + w.maxhp + '. Hits the weakest piece within ' + K.TOWER_RANGE + ' squares for ' + (f ? K.FORTRESS_DMG : K.BASTION_DMG) + ' every ' + secs(f ? K.FORTRESS_CD : K.BASTION_CD) + (f ? ' (silent while its King is out)' : '') + '.'; }
    return '';
  }
  function onMove(e) { if (!sim) return; hover = cellAt(e); if (drag) { drag.x1 = hover.x; drag.y1 = hover.y; } infoEl.textContent = inspect(hover.x, hover.y); }
  function onUp(e) {
    if (!drag || mode !== 'play') { drag = null; return; } const c = cellAt(e), d = drag; drag = null; d.x1 = c.x; d.y1 = c.y;
    if (d.x0 !== d.x1 || d.y0 !== d.y1) boxSelect(d, d.shift); else clickCell(c.x, c.y, d.shift);
  }
  // ---- HUD
  function hud() {
    if (!sim) return; const s = sim.snapshot(), K = Royale.CONSTANTS, h = s.hands[me], top = other(me);
    matNum.textContent = String(s.mat[me]); const full = s.mat[me] >= K.MAT_MAX; matNum.className = 'rmatnum' + (full ? ' full' : '');
    matPips.forEach((f, i) => { const fr = Math.max(0, Math.min(1, s.matPts[me] / K.MAT_PTS - i)); f.style.width = Math.round(fr * 100) + '%'; f.className = 'rpipfill' + (fr >= 1 ? ' on' : ''); });
    const mult = sim.matRate(s.tick) / K.REGEN; matRateEl.textContent = 'x' + mult; matRateEl.className = 'rmatrate' + (mult > 1 ? ' hot' : ''); matRateEl.title = 'Material income speed (' + (mult > 1 ? 'it speeds up as the match goes on' : 'speeds up after 1:00') + ')';
    if (stats && stats.tickSeen !== s.tick) { stats.tickSeen = s.tick; ['w', 'b'].forEach(x => { if (s.mat[x] >= K.MAT_MAX) stats[x].full++; }); }
    hand.forEach((c, i) => { const id = h.hand[i]; if (!id) return; const d = Royale.CARDS[id];
      if (c.card !== id) { c.card = id; setIcon(c.g, id); c.n.textContent = d.name; c.b.title = d.name + ' (cost ' + d.cost + '). ' + (CARD_TEXT[id] || '') + (d.kind === 'piece' ? ' Health ' + d.hp + ', Damage ' + d.dmg + ', acts every ' + secs(d.cd) + '.' : ''); }
      c.c.textContent = String(d.cost); c.k.textContent = HOT[i] + ' \u00B7 ' + KIND[d.kind]; c.b.className = 'rcard' + (sel === i ? ' sel' : '') + (s.mat[me] < d.cost ? ' poor' : ''); });
    if (h.next) { if (nextEl.card !== h.next) { nextEl.card = h.next; setIcon(nextEl.g, h.next); nextEl.nm.textContent = Royale.CARDS[h.next].name; } }
    const left = s.tick < K.REGULAR ? Math.ceil((K.REGULAR - s.tick) * K.TICK_MS / 1000) : 0;
    timerEl.textContent = s.tick < K.REGULAR ? Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0') : 'OVERTIME';
    const ids = selIds(), us = ids.map(id => s.units.find(u => u.id === id)).filter(Boolean), counts = {};
    us.forEach(u => { const n = u.king ? 'King' : Royale.DEFS[u.t].name; counts[n] = (counts[n] || 0) + 1; });
    selInfo.textContent = us.length ? 'Selected: ' + Object.keys(counts).map(n => counts[n] + ' ' + n).join(', ') : 'Nothing selected (drag a box, click, or Select all)';
    ['attack', 'hold', 'promote'].forEach(o => { const ok = us.some(u => Royale.ORDERS[u.t] && Royale.ORDERS[u.t].indexOf(o) >= 0); ordBtns[o].className = 'rbtn' + (ok ? '' : ' off') + (us.some(u => u.stance === o) && ok ? ' on' : ''); });
    promoRow.className = 'rpromo' + (us.some(u => u.t === 'p') ? '' : ' hidden');
    const kg = s.king[me], myF = s.towers.find(t => t.side === me && t.kind === 'fortress'), kUnit = s.units.find(u => u.king && u.side === me), locked = kg.out && kUnit && s.tick < kg.lock && kUnit.hp > K.KING_LOW * kUnit.maxhp;
    kingBtn.textContent = kg.dead ? 'King has fallen' : kg.out ? (!myF || myF.hp <= 0 ? 'No Fortress to return to' : locked ? 'Recall in ' + Math.ceil((kg.lock - s.tick) * K.TICK_MS / 1000) + ' s' : 'Recall King') : s.tick < kg.cd ? 'King resting ' + Math.ceil((kg.cd - s.tick) * K.TICK_MS / 1000) + 's' : kingMode ? 'Cancel King' : 'Send King';
    kingBtn.className = 'rbtn rking' + (kingMode ? ' on' : '') + (kg.dead || locked || (kg.out && (!myF || myF.hp <= 0)) || (!kg.out && s.tick < kg.cd) ? ' off' : '');
    // the players panel: the enemy on top, you below (spectators: Black above White), each with name, picture, towers and King
    ['top', 'bottom'].forEach(pos => {
      const side = pos === 'top' ? top : me, R = towerRows[pos], { f, b } = barsOf(s, side), pi = playerInfo(side);
      R.lab.textContent = pi.name; fillAv(R.av, pi.name, pi.pfp, side === me ? '#6b7f4e' : '#7a5a5a'); if (pi.bot) R.av.textContent = '\u2699';
      [[f, R.fortress], [b[0], R.bl], [b[1], R.br]].forEach(p => { const tt = p[0], B = p[1]; if (!tt) return; B.fl.style.width = Math.max(0, Math.round(100 * tt.hp / tt.maxhp)) + '%'; B.tx.textContent = tt.hp > 0 ? String(tt.hp) : '\u2715'; B.fl.parentNode.className = 'rtbar' + (B === R.fortress ? ' big' : '') + (tt.hp <= 0 ? ' dead' : '') + (tt.hp > 0 && tt.hp / tt.maxhp <= 0.3 ? ' crit' : ''); });
      const kk = s.king[side], KB = R.king, kHp = Math.max(0, kk.hp), kLow = !kk.dead && kHp <= K.KING_LOW * K.KING_HP;
      KB.fl.style.width = Math.round(100 * kHp / K.KING_HP) + '%'; KB.tx.textContent = 'King ' + (kk.dead ? '\u2715' : kHp + (kk.out ? ' (out)' : '')); KB.fl.parentNode.className = 'rtbar kingbar' + (kk.dead ? ' dead' : '') + (kLow ? ' crit' : '');
    });
    // low-health warning and the optional safe mode (auto-recall)
    const F = s.towers.find(t => t.side === me && t.kind === 'fortress'), danger = !!F && F.hp > 0 && F.hp / F.maxhp <= 0.3;
    if (danger !== low) { low = danger && settings.lowWarn; syncRoot(); }
    if (danger && !lowWarned) { lowWarned = true; if (settings.lowWarn) { toast('Your Fortress is in danger!'); sfxSafe('check'); } }
    const kingLow = !!kUnit && kUnit.hp <= K.KING_LOW * kUnit.maxhp;
    if ((danger || kingLow) && game.autoRecall && kg.out && mode === 'play' && s.tick - autoRecallAt >= 8) { const ku = kUnit; if (ku && !ku.recalling) { autoRecallAt = s.tick; submit({ type: 'recall' }); } }
  }
  function resize() {
    if (!canvas || !wrapEl) return; const r = wrapEl.getBoundingClientRect(), K = Royale.CONSTANTS, pad = 20;
    cell = Math.max(10, Math.floor(Math.min((r.width - pad) / K.W, (r.height - pad) / K.H))); const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    canvas.style.width = cell * K.W + 'px'; canvas.style.height = cell * K.H + 'px'; canvas.width = cell * K.W * dpr; canvas.height = cell * K.H * dpr; ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  // ---- drawing
  const FX_MS = { freeze: 750, ring: 380, num: 750, slash: 340, shot: 340, promo: 950, boom: 800, spell: 380 };
  function render() {
    if (cardDrag && cardDrag.on && dragGhost) { ghostTilt *= 0.9; dragGhost.style.transform = 'translate(-50%, -55%) rotate(' + ghostTilt.toFixed(1) + 'deg) scale(1.08)'; }
    if (!sim || !ctx) return; const K = Royale.CONSTANTS, s = sim.st, t = now(), f = Math.min(1, (t - lastTime) / TICK());
    const X = x => (me === 'w' ? x : K.W - 1 - x) * cell, Y = y => (me === 'w' ? K.H - 1 - y : y) * cell;           // top-left pixel of the square (x, y); works for fractions too
    const RX = (x0, w) => (me === 'w' ? x0 : K.W - x0 - w) * cell, RY = (y0, h) => (me === 'w' ? K.H - y0 - h : y0) * cell;      // top-left pixel of a w x h block of squares starting at (x0, y0)
    const CX = x => X(x) + cell / 2, CY = y => Y(y) + cell / 2;
    const card = sel >= 0 ? s.hands[me].hand[sel] : null, info = card ? Royale.CARDS[card] : null, playing = mode === 'play';
    const text = (str, x, y, size, fill, stroke, align) => { ctx.font = 'bold ' + Math.floor(size) + 'px sans-serif'; ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle'; if (stroke) { ctx.lineWidth = Math.max(2, size / 4); ctx.strokeStyle = stroke; ctx.lineJoin = 'round'; ctx.strokeText(str, x, y); } ctx.fillStyle = fill; ctx.fillText(str, x, y); };
    const iconDraw = (code, col, cx, cy, sz) => { const img = iconImage(code, col); if (!img) return false; try { ctx.drawImage(img, cx - sz / 2, cy - sz / 2, sz, sz); return true; } catch (e) { return false; } };
    const edgeOf = (side, king) => (king ? '#ffd24a' : side === 'w' ? DARK : LIGHT);
    const outlined = (code, col, edge, cx, cy, sz) => { let ok = false; [[-1.5, 0], [1.5, 0], [0, -1.5], [0, 1.5], [-1.1, -1.1], [1.1, 1.1], [-1.1, 1.1], [1.1, -1.1]].forEach(o => { ok = iconDraw(code, edge, cx + o[0], cy + o[1], sz) || ok; }); return iconDraw(code, col, cx, cy, sz) || ok; };
    const badge = (cx, cy, r, code, side, king) => {                       // just the icon, no circle: the side's colour with an outline (gold for the King)
      const col = side === 'w' ? LIGHT : DARK, edge = edgeOf(side, king), sz = r * 2.4;
      if (!outlined(code, col, edge, cx, cy, sz)) { ctx.font = Math.floor(r * 1.9) + 'px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.strokeStyle = edge; ctx.strokeText(GLYPH[code] || '?', cx, cy + 1); ctx.fillStyle = col; ctx.fillText(GLYPH[code] || '?', cx, cy + 1); }
    };
    const dragging = !!(cardDrag && cardDrag.on);
    const spellIcon = (code, x, y, alpha) => {                              // the spell's icon in the middle of where it lands (the Barricade: one per square)
      ctx.globalAlpha = alpha == null ? 0.92 : alpha;
      if (code === 'barr') [-1, 0, 1].forEach(d => outlined('barr', '#f1dfae', '#3a2410', CX(x + d), CY(y), cell * 0.95)); else outlined(code, '#ffffff', 'rgb(' + SPELL_COL[code] + ')', CX(x), CY(y), cell * (Royale.SPELLS[code].r >= 2 ? 1.9 : 1.5));
      ctx.globalAlpha = 1;
    };
    // a black-and-white health bar: black trough, white border, white fill, one notch per Health point when there are few
    const hpBar = (x, y, w, h, hp, max) => {
      ctx.fillStyle = '#000'; ctx.fillRect(x, y, w, h); ctx.fillStyle = '#fff'; ctx.fillRect(x + 1, y + 1, Math.max(0, (w - 2) * hp / max), h - 2);
      if (max > 1 && max <= 24 && (w - 2) / max >= 3) { ctx.fillStyle = '#000'; for (let i = 1; i < max; i++) ctx.fillRect(x + 1 + (w - 2) * i / max - 0.5, y + 1, 1, h - 2); }
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    };
    // ---- the board: your chosen colours (or classic chess's), a moving river, planked bridges, file and rank letters
    const PAL = boardColors();
    for (let y = 0; y < K.H; y++) for (let x = 0; x < K.W; x++) {
      const river = y === K.RIVER_Y, bridge = river && K.BRIDGE_X.indexOf(x) >= 0;
      ctx.fillStyle = river ? (bridge ? '#a87b43' : '#3b78bb') : ((x + y) % 2 ? PAL.d : PAL.l); ctx.fillRect(X(x), Y(y), cell, cell);
      if (bridge) { ctx.fillStyle = 'rgba(60,35,10,.35)'; for (let k = 1; k < 4; k++) ctx.fillRect(X(x), Y(y) + k * cell / 4 - 1, cell, 2); ctx.fillStyle = '#6b4620'; ctx.fillRect(X(x), Y(y), 3, cell); ctx.fillRect(X(x) + cell - 3, Y(y), 3, cell); }
    }
    { const ry = Y(K.RIVER_Y); ctx.save(); ctx.beginPath(); for (let wx = 0; wx < K.W; wx++) if (K.BRIDGE_X.indexOf(wx) < 0) ctx.rect(X(wx), ry, cell, cell); ctx.clip();      // water only: the waves never run over a bridge
      ctx.strokeStyle = 'rgba(255,255,255,.28)'; ctx.lineWidth = 2;
      for (let k = 0; k < 3; k++) { ctx.beginPath(); for (let px = 0; px <= K.W * cell; px += 4) { const py = ry + cell * (0.2 + 0.3 * k) + Math.sin(px / cell * 3 + t / 500 + k * 2) * cell * 0.05; if (px === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); } ctx.stroke(); }
      ctx.restore(); K.BRIDGE_X.forEach(bx => { ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(X(bx), ry - 1, cell, 1); }); }
    ctx.globalAlpha = 0.6; for (let x = 0; x < K.W; x++) { const xx = me === 'w' ? x : K.W - 1 - x; text(String.fromCharCode(97 + x), X(x) + cell - 5, cell * K.H - 6, cell * 0.2, (xx + (me === 'w' ? 0 : K.H - 1)) % 2 ? PAL.l : PAL.d, null, 'right'); }
    for (let y = 0; y < K.H; y++) if (y !== K.RIVER_Y) text(String(y + 1), 4, Y(y) + 8, cell * 0.2, (y) % 2 ? PAL.l : PAL.d, null, 'left'); ctx.globalAlpha = 1;
    // lit squares for the card or King being placed
    const lit = (x, y) => (playing && !spec && ((info && info.kind !== 'spell' && !sim.check(me, sel, x, y)) || (kingMode && !sim.can(me, { type: 'kingOut', x, y }))));
    if (playing) for (let y = 0; y < K.H; y++) for (let x = 0; x < K.W; x++) {
      if (info && info.kind === 'spell') { ctx.fillStyle = 'rgba(255,215,0,.10)'; ctx.fillRect(X(x), Y(y), cell, cell); }
      else if (lit(x, y)) { ctx.fillStyle = 'rgba(120,255,120,.26)'; ctx.fillRect(X(x), Y(y), cell, cell); ctx.fillStyle = 'rgba(30,120,30,.55)'; ctx.beginPath(); ctx.arc(CX(x), CY(y), cell * 0.07, 0, Math.PI * 2); ctx.fill(); }
    }
    s.barr.forEach(b => { ctx.fillStyle = '#5a3b1a'; ctx.fillRect(X(b.x) + 1, Y(b.y) + 1, cell - 2, cell - 2); ctx.fillStyle = '#8a5d2b'; ctx.fillRect(X(b.x) + 4, Y(b.y) + cell / 2 - 2, cell - 8, 4); });
    // ---- towers: just their shape, as big as the squares they cover, in their side's colour with an outline (no filled square)
    s.towers.forEach(w => {
      if (w.hp <= 0) return; const rx = RX(w.x0, w.w), ry = RY(w.y0, w.h), pw = w.w * cell, ph = w.h * cell, away = w.kind === 'fortress' && s.king[w.side].out, col = w.side === 'w' ? LIGHT : DARK, edge = w.side === 'w' ? DARK : LIGHT;
      const flash = towerHitAt[w.id] && t - towerHitAt[w.id] < 320 ? 1 - (t - towerHitAt[w.id]) / 320 : 0, sh = flash ? Math.sin(t / 22) * cell * 0.04 : 0, cx = rx + pw / 2 + sh, cy = ry + ph / 2 - cell * 0.12, sz = Math.min(pw, ph) * 0.96;
      ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.beginPath(); ctx.ellipse(rx + pw / 2, ry + ph * 0.78, pw * 0.36, ph * 0.09, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = away ? 0.4 : 1; let ok = false; [[-1.6, 0], [1.6, 0], [0, -1.6], [0, 1.6], [-1.2, -1.2], [1.2, 1.2], [-1.2, 1.2], [1.2, -1.2]].forEach(o => { ok = iconDraw(w.kind, edge, cx + o[0], cy + o[1], sz) || ok; });
      if (!iconDraw(w.kind, col, cx, cy, sz)) text(GLYPH[w.kind], cx, cy, sz * 0.8, col, edge); ctx.globalAlpha = 1;
      if (flash) { ctx.strokeStyle = 'rgba(255,70,70,' + flash + ')'; ctx.lineWidth = 3; ctx.strokeRect(rx + 2, ry + 2, pw - 4, ph - 4); }
      if (away) text('King away', rx + pw / 2, ry + ph * 0.45, Math.max(9, cell * 0.3), '#fff', '#000');
      const bw = pw * 0.84, bh = Math.max(7, cell * 0.16), bx = rx + (pw - bw) / 2, by = ry + ph - bh - 2; hpBar(bx, by, bw, bh, w.hp, w.maxhp); text(w.hp + '/' + w.maxhp, rx + pw / 2, by - Math.max(7, cell * 0.14), Math.max(9, cell * 0.28), '#fff', '#000');
    });
    // ---- pieces
    s.units.forEach(u => {
      const b = before[u.id] || [u.x, u.y], x = b[0] + (u.x - b[0]) * f, y = b[1] + (u.y - b[1]) * f; let cx = CX(x), cy = CY(y); const r = cell * 0.42;
      const lg = shakeAt[u.id]; if (lg && t - lg.t0 < 240) { const k = (t - lg.t0) / 240, a = Math.sin(Math.PI * k) * cell * 0.3; cx += (me === 'w' ? lg.dx : -lg.dx) * a; cy += (me === 'w' ? -lg.dy : lg.dy) * a; }
      const ht = hitAt[u.id] && t - hitAt[u.id] < 280 ? 1 - (t - hitAt[u.id]) / 280 : 0; if (ht) cx += Math.sin(t / 18) * cell * 0.05 * ht;
      const pk = deployAt[u.id] && t - deployAt[u.id] < 280 ? (t - deployAt[u.id]) / 280 : 1, sc = pk < 1 ? 1 + 2.70158 * Math.pow(pk - 1, 3) + 1.70158 * Math.pow(pk - 1, 2) : 1;      // a little pop when it is placed
      ctx.save(); ctx.translate(cx, cy); ctx.scale(sc, sc); ctx.translate(-cx, -cy);
      badge(cx, cy, r, u.t, u.side, u.king);
      if ((u.frozenUntil || 0) > s.tick) { const iw = cell * 0.92; ctx.fillStyle = 'rgba(150,215,255,.42)'; ctx.strokeStyle = 'rgba(230,248,255,.95)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.rect(cx - iw / 2, cy - iw / 2, iw, iw); ctx.fill(); ctx.stroke();      // frozen: an ice block
        ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(cx - iw * 0.32, cy - iw * 0.4); ctx.lineTo(cx - iw * 0.4, cy - iw * 0.1); ctx.moveTo(cx + iw * 0.1, cy - iw * 0.44); ctx.lineTo(cx + iw * 0.38, cy - iw * 0.2); ctx.moveTo(cx - iw * 0.1, cy + iw * 0.42); ctx.lineTo(cx + iw * 0.3, cy + iw * 0.18); ctx.stroke(); text('\u2744', cx + iw * 0.34, cy - iw * 0.36, cell * 0.3, '#e8f8ff', '#2a6a9a'); }
      if (ht) { ctx.globalAlpha = 0.85 * ht; iconDraw(u.t, '#ffffff', cx, cy, r * 2.4); ctx.globalAlpha = 1; }
      if (s.tick < u.arrive && u.arrive > u.dep) { const dp = Math.max(0, Math.min(1, ((s.tick + f) - u.dep) / (u.arrive - u.dep)));      // still arriving: a clock sweeps clear
        ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r * 1.08, -Math.PI / 2 + 2 * Math.PI * dp, Math.PI * 1.5); ctx.closePath(); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, r * 1.08, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * dp); ctx.stroke(); }
      ctx.restore();
      if (u.stance === 'hold' || u.stance === 'promote') text(u.stance === 'hold' ? 'H' : 'P', cx - r * 0.8, cy - r * 0.8, cell * 0.3, '#d33', '#fff');
      if (settings.cd) { const wait = u.ready - s.tick, frac = wait <= 0 ? 1 : 1 - wait / Math.max(u.cd, wait); ctx.fillStyle = '#000'; ctx.fillRect(cx - r, cy + r + 1, 2 * r, 3); ctx.fillStyle = '#fff'; ctx.fillRect(cx - r, cy + r + 1, 2 * r * frac, 3); }
      if (settings.hp && u.maxhp > 1) hpBar(cx - r, cy - r - 7, 2 * r, 6, u.hp, u.maxhp);
      if (u.recallAt) { ctx.beginPath(); ctx.arc(cx, cy, r + 5, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(180,120,255,.95)'; ctx.lineWidth = 2; ctx.stroke(); }
      if (u.side === me && picked.has(u.id)) { ctx.beginPath(); ctx.arc(cx, cy, r + 4, 0, Math.PI * 2); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); }
    });
    // ---- spell areas, and the placement preview (a see-through copy of what you are about to put down)
    const area = (cx, cy, rr, col, lw) => { ctx.strokeStyle = col; ctx.lineWidth = lw; if (rr == null) ctx.strokeRect(RX(cx - 1, 3) + 2, RY(cy, 1) + 2, cell * 3 - 4, cell - 4); else ctx.strokeRect(RX(cx - rr, 2 * rr + 1) + 2, RY(cy - rr, 2 * rr + 1) + 2, cell * (2 * rr + 1) - 4, cell * (2 * rr + 1) - 4); };
    s.spells.forEach(p => { const sp = Royale.SPELLS[p.card]; area(p.x, p.y, p.card === 'barr' ? null : sp.r, 'rgba(' + SPELL_COL[p.card] + ',.95)', 3); spellIcon(p.card, p.x, p.y, 0.6 + 0.3 * Math.sin(t / 90)); });
    if (playing && !spec && hover) {
      if (info && info.kind === 'spell') { area(hover.x, hover.y, card === 'barr' ? null : info.r, 'rgba(' + SPELL_COL[card] + ',.9)', 2); if (!dragging) spellIcon(card, hover.x, hover.y); }
      else if (info || kingMode) {
        const ok = kingMode ? !sim.can(me, { type: 'kingOut', x: hover.x, y: hover.y }) : !sim.check(me, sel, hover.x, hover.y), col = ok ? 'rgba(90,255,90,.95)' : 'rgba(255,80,80,.95)';
        const spots = []; if (!kingMode && info.kind === 'phalanx') { const c0 = sim.phalanxX(me, hover.x, hover.y), cc = c0 == null ? hover.x : c0; [-1, 0, 1].forEach(d => spots.push([cc + d, hover.y])); } else spots.push([hover.x, hover.y]);
        spots.forEach(p => { if (!dragging) { ctx.globalAlpha = 0.6; badge(CX(p[0]), CY(p[1]), cell * 0.42, kingMode ? 'k' : (info.kind === 'phalanx' ? 'p' : card), me, kingMode); ctx.globalAlpha = 1; } ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.strokeRect(X(p[0]) + 2, Y(p[1]) + 2, cell - 4, cell - 4); if (!ok) { ctx.beginPath(); ctx.moveTo(X(p[0]) + cell * 0.25, Y(p[1]) + cell * 0.25); ctx.lineTo(X(p[0]) + cell * 0.75, Y(p[1]) + cell * 0.75); ctx.moveTo(X(p[0]) + cell * 0.75, Y(p[1]) + cell * 0.25); ctx.lineTo(X(p[0]) + cell * 0.25, Y(p[1]) + cell * 0.75); ctx.stroke(); } });
      }
    }
    if (drag && (drag.x0 !== drag.x1 || drag.y0 !== drag.y1)) { const x0 = Math.min(drag.x0, drag.x1), x1 = Math.max(drag.x0, drag.x1), y0 = Math.min(drag.y0, drag.y1), y1 = Math.max(drag.y0, drag.y1); ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 2; ctx.strokeRect(RX(x0, x1 - x0 + 1), RY(y0, y1 - y0 + 1), cell * (x1 - x0 + 1), cell * (y1 - y0 + 1)); }
    // ---- effects: slashes and shots show who is hitting whom (gold = your side, red = theirs)
    fx = fx.filter(e => t - e.t0 < FX_MS[e.k]);
    fx.forEach(e => {
      const k = (t - e.t0) / FX_MS[e.k];
      if (e.k === 'num') { const nx = CX(e.x), ny = Y(e.y) + cell * 0.2 - k * cell * 0.7; ctx.globalAlpha = 1 - k; text(e.text, nx, ny, cell * 0.5, e.mine ? '#ff6b6b' : '#fff', '#000'); ctx.globalAlpha = 1; return; }
      if (e.k === 'slash') {
        const ax = CX(e.from[0]), ay = CY(e.from[1]), bx = CX(e.to[0]), by = CY(e.to[1]), p = Math.min(1, k * 2.4), ex = ax + (bx - ax) * p, ey = ay + (by - ay) * p;
        ctx.globalAlpha = 1 - k; ctx.strokeStyle = 'rgba(' + e.col + ',1)'; ctx.lineCap = 'round'; ctx.lineWidth = Math.max(2, cell * 0.16 * (1 - k)); ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ex, ey); ctx.stroke();
        const nx = -(by - ay), ny = bx - ax, nl = Math.hypot(nx, ny) || 1, ux = nx / nl * cell * 0.22, uy = ny / nl * cell * 0.22, dx = (bx - ax) / (nl) * cell * 0.1, dy = (by - ay) / nl * cell * 0.1;
        ctx.lineWidth = Math.max(2, cell * 0.07); [-1, 0, 1].forEach(m => { ctx.beginPath(); ctx.moveTo(bx + ux * m - ux * 0.9 - dx, by + uy * m - uy * 0.9 - dy); ctx.lineTo(bx + ux * m + ux * 0.9 + dx, by + uy * m + uy * 0.9 + dy); ctx.stroke(); });
        ctx.lineCap = 'butt'; ctx.globalAlpha = 1; return;
      }
      if (e.k === 'shot') {
        const ax = CX(e.from[0]), ay = CY(e.from[1]), bx = CX(e.to[0]), by = CY(e.to[1]), p = Math.min(1, k / 0.7), px = ax + (bx - ax) * p, py = ay + (by - ay) * p, tp = Math.max(0, p - 0.25), qx = ax + (bx - ax) * tp, qy = ay + (by - ay) * tp;
        ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3; ctx.strokeStyle = 'rgba(' + e.col + ',.9)'; ctx.lineWidth = cell * 0.1; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(qx, qy); ctx.lineTo(px, py); ctx.stroke(); ctx.lineCap = 'butt';
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(px, py, cell * 0.11, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = 'rgba(' + e.col + ',1)'; ctx.lineWidth = 2; ctx.stroke(); ctx.globalAlpha = 1; return;
      }
      if (e.k === 'promo') {
        const cx = CX(e.x), cy = CY(e.y); ctx.globalAlpha = 1 - k; ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 3; [0, 0.25].forEach(d => { const kk = Math.max(0, k - d) / (1 - d); ctx.beginPath(); ctx.arc(cx, cy, cell * (0.4 + 1.1 * kk), 0, Math.PI * 2); ctx.stroke(); });
        ctx.fillStyle = '#ffd24a'; ctx.strokeStyle = '#7a5a00'; ctx.lineWidth = 2; const ay = cy - cell * 0.15 - k * cell * 0.45, aw = cell * 0.26; ctx.beginPath(); ctx.moveTo(cx, ay - aw); ctx.lineTo(cx + aw, ay + aw * 0.7); ctx.lineTo(cx + aw * 0.35, ay + aw * 0.7); ctx.lineTo(cx + aw * 0.35, ay + aw * 1.6); ctx.lineTo(cx - aw * 0.35, ay + aw * 1.6); ctx.lineTo(cx - aw * 0.35, ay + aw * 0.7); ctx.lineTo(cx - aw, ay + aw * 0.7); ctx.closePath(); ctx.fill(); ctx.stroke();
        for (let i = 0; i < 6; i++) { const an = i * Math.PI / 3 + k * 2, rr = cell * (0.5 + 0.9 * k); ctx.beginPath(); ctx.arc(cx + Math.cos(an) * rr, cy + Math.sin(an) * rr, cell * 0.06 * (1 - k), 0, Math.PI * 2); ctx.fillStyle = '#fff3b0'; ctx.fill(); } ctx.globalAlpha = 1; return;
      }
      if (e.k === 'freeze') { const cx = CX(e.x), cy = CY(e.y), R = cell * (0.6 + 2.0 * k); ctx.globalAlpha = 1 - k; ctx.strokeStyle = 'rgba(160,225,255,1)'; ctx.fillStyle = 'rgba(150,215,255,' + (0.25 * (1 - k)) + ')'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        for (let i = 0; i < 8; i++) { const an = i * Math.PI / 4; ctx.beginPath(); ctx.moveTo(cx + Math.cos(an) * R * 0.4, cy + Math.sin(an) * R * 0.4); ctx.lineTo(cx + Math.cos(an) * R * 0.95, cy + Math.sin(an) * R * 0.95); ctx.stroke(); } text('\u2744', cx, cy, cell * (0.8 + k * 0.5), '#e8f8ff', '#2a6a9a'); ctx.globalAlpha = 1; return; }
      if (e.k === 'boom') { const cx = CX(e.x), cy = CY(e.y); ctx.globalAlpha = 1 - k; ctx.fillStyle = 'rgba(255,170,60,' + (0.5 * (1 - k)) + ')'; ctx.beginPath(); ctx.arc(cx, cy, cell * (0.6 + 2.2 * k), 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(cx, cy, cell * (0.4 + 2.8 * k), 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1; return; }
      const cx = CX(e.x), cy = CY(e.y); ctx.beginPath(); ctx.arc(cx, cy, cell * (e.spell ? 0.8 + 1.4 * k : e.small ? 0.2 + 0.35 * k : 0.3 + 0.55 * k), 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(' + (e.spell ? SPELL_COL[e.spell] : e.col || '255,220,80') + ',' + (1 - k) + ')'; ctx.lineWidth = 3; ctx.stroke();
      if (e.kill) { ctx.strokeStyle = 'rgba(255,255,255,' + (1 - k) + ')'; ctx.lineWidth = 2; for (let i = 0; i < 8; i++) { const an = i * Math.PI / 4, r0 = cell * (0.25 + 0.4 * k), r1 = r0 + cell * 0.22; ctx.beginPath(); ctx.moveTo(cx + Math.cos(an) * r0, cy + Math.sin(an) * r0); ctx.lineTo(cx + Math.cos(an) * r1, cy + Math.sin(an) * r1); ctx.stroke(); } }
    });
  }
  function open() { if (!root) build(); visible = true; updateProfile(); if (typeof Hub !== 'undefined' && Hub.setCurrent) Hub.setCurrent('royale'); syncRoot(); menu(); }
  function close() { stopLoop(); leaveNet(); closeOverlay(true); chat = []; mode = 'menu'; me = 'w'; low = false; visible = false; if (root) syncRoot(); if (typeof Hub !== 'undefined' && Hub.setCurrent) Hub.setCurrent('classic'); }
  if (typeof Hub !== 'undefined' && Hub.register) Hub.register({ id: 'royale', tag: 'Beta: bot or friend', start: open, stop: close });
  function autoJoin() {                                                 // a link like ?royale=abcde opens the screen and joins that room
    try { const m = /[?&]royale=([a-z0-9]{4,20})/i.exec(location.search), w = /[?&]watch=([a-z0-9]{4,20})/i.exec(location.search); if (m) { open(); joinRoom(m[1], false); } else if (w) { open(); joinRoom(w[1], true); } } catch (e) { /* no location: not a browser */ }
  }
  if (typeof document !== 'undefined' && typeof location !== 'undefined' && document.readyState) setTimeout(autoJoin, 0);
  return { open, close, quit, _: { get sim() { return sim; }, get mode() { return mode; }, get msg() { return msgEl.textContent; }, get panelOpen() { return panel.className.indexOf('hidden') < 0; }, get rootOpen() { return visible; }, get cell() { return cell; }, get me() { return me; }, get netRole() { return netRole; }, get canvas() { return canvas; }, get panelEl() { return panel; }, get overlayEl() { return overlay; }, get overlayOn() { return overlayOn; }, get paused() { return paused; }, get ghost() { return dragGhost; }, get hand() { return hand; },
    get picked() { return Array.from(picked); }, get deck() { return deck.slice(); }, get kingMode() { return kingMode; }, get sel() { return sel; }, get selText() { return selInfo.textContent; }, get kingText() { return kingBtn.textContent; }, get info() { return infoEl.textContent; }, get settings() { return settings; }, get lowFlag() { return low; }, get stats() { return stats; }, get names() { return names; }, get chat() { return chat.slice(); }, get specN() { return specN; }, get spec() { return spec; }, get opp() { return oppEl.textContent; }, get chatShown() { return chatWrap.style.display !== 'none'; }, get panelText() { return panelBody.textContent || ''; }, get hover() { return hover; }, get fx() { return fx.slice(); },
    get root() { return root; }, start: startBot, startBot, hostMatch, joinRoom, tick, render, pick, menu, settingsPanel: openOptions, openOptions, closeOverlay, helpPanel: openGuide, openGuide, closeDrawer, deckPanel, friendsPanel: playPanel, playPanel, quit, togglePause, cellAt, key: onKey, selectAll, sendOrder, sendPromoteTo, kingButton, onNetMsg, cleanCmd, sendChat, cardDown, cardMove, cardUp, setLevel: l => { level = l; }, setDeck: d => { decks = decks.filter(x => x.id !== '_test'); decks.push({ id: '_test', name: 'Test deck', cards: d.slice() }); activeDeck = '_test'; syncDeck(); }, setSetting: (k, v) => { settings[k] = v; }, setGame: (k, v) => { game[k] = v; }, get game() { return game; }, get drawerOn() { return drawerOn; }, get decks() { return decks.slice(); }, get activeDeck() { return activeDeck; }, get pfps() { return pfps; }, get palette() { return boardColors(); }, newDeck, renameDeck, deleteDeck, toggleDeck, optionsBox, gameOptionsText: GAME_TEXT, userOptionsText: SETTING_TEXT } };
})();
