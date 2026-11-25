/* "Other Games" hub (R0 of ROYALE_SPEC.md). A top-left button opens a list of games. Classic Chess is everything that existed before and simply
   closes the hub. Other entries are greyed until their game exists. Later games plug in with Hub.register({ id, icon, name, desc, tag, start }):
   an entry with a start() function becomes clickable. A game that takes over the screen also gives a stop() function: choosing another game (or Classic Chess) in this
   list calls it, which is how you leave that game. Hub.setCurrent(id) tells the hub which game is on screen. Wrapped in try/catch on purpose: the hub must never be able to break the main game. */
const Hub = (() => {
  const games = [
    { id: 'classic', icon: '\u265E', name: 'Classic Chess', desc: 'Normal chess and all its variants (what you have been playing).', tag: 'You are here', here: true },
    { id: 'royale', icon: '\u265B', name: 'Chess Royale', desc: 'Real-time: spend Material, deploy pieces that fight on their own, break the enemy Fortress.', tag: 'In development' },
    { id: 'coop', icon: '\u2620', name: 'Co-op vs Evil Pieces', desc: 'Team up against waves of enemy pieces.', tag: 'Planned' }
  ];
  let modal = null, list = null, current = 'classic', topLeft = null;
  const isOpen = () => !!modal && !modal.classList.contains('hidden');
  function close() { if (modal) modal.classList.add('hidden'); }
  function render() {
    list.innerHTML = '';
    games.forEach(g => {
      const here = g.id === current, b = document.createElement('button'); b.type = 'button'; b.className = 'hubgame' + (here ? ' here' : ''); b.dataset.game = g.id;
      const playable = !!g.start || g.id === 'classic'; b.setAttribute('aria-disabled', playable ? 'false' : 'true');
      b.innerHTML = '<span class="hubicon"></span><span class="hubtext"><b></b><small></small></span><span class="hubtag"></span>';
      b.querySelector('.hubicon').textContent = g.icon; b.querySelector('b').textContent = g.name; b.querySelector('small').textContent = g.desc; b.querySelector('.hubtag').textContent = here ? 'You are here' : g.id === 'classic' ? 'Back to chess' : (g.tag || '');
      b.addEventListener('click', () => { if (here) return close(); if (!g.start && g.id !== 'classic') return; close(); const prev = games.find(x => x.id === current); current = g.id; layer(); if (prev && prev.stop) { try { prev.stop(); } catch (err) { /* leaving must never fail */ } } current = g.id; layer(); if (g.start) g.start(); });
      list.appendChild(b);
    });
  }
  // While another game covers the screen the Games button (and its list) must stay on top of it, or there would be no way back.
  function layer() { const up = current !== 'classic'; if (topLeft) topLeft.style.zIndex = up ? '95' : ''; if (modal) modal.style.zIndex = up ? '100' : ''; }
  function setCurrent(id) { current = id; layer(); if (isOpen()) render(); }
  function open() { if (modal) { render(); modal.classList.remove('hidden'); } }
  function register(g) { const i = games.findIndex(x => x.id === g.id); if (i >= 0) games[i] = Object.assign(games[i], g); else games.push(g); if (list) render(); }
  function init() {
    const wrap = document.createElement('div'); wrap.id = 'topLeft';
    const btn = document.createElement('button'); btn.id = 'hubBtn'; btn.type = 'button'; btn.className = 'iconbtn'; btn.title = 'Other games'; btn.textContent = '\u265F Games';
    btn.addEventListener('click', () => (isOpen() ? close() : open())); wrap.appendChild(btn); document.body.appendChild(wrap); topLeft = wrap;
    modal = document.createElement('div'); modal.id = 'hubModal'; modal.className = 'hidden';
    modal.innerHTML = '<div id="hubBox"><div class="hubhead"><b>Games</b><button type="button" class="iconbtn" id="hubClose" aria-label="Close">\u2715</button></div><div id="hubList"></div></div>';
    document.body.appendChild(modal); list = modal.querySelector('#hubList');
    modal.addEventListener('click', e => { if (e.target === modal) close(); }); modal.querySelector('#hubClose').addEventListener('click', close);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && isOpen()) { e.stopPropagation(); close(); } }, true);
  }
  try { if (typeof document !== 'undefined') init(); } catch (err) { if (typeof console !== 'undefined') console.error('hub failed to start (the game still works):', err); }
  return { open, close, register, isOpen, setCurrent, games, get current() { return current; } };
})();
