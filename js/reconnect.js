/* reconnect.js: a visible connection banner (connecting / reconnecting / could not connect / back online) with buttons, and "who is missing" for the host.
   connUI.set(kind, text, [[label, fn], ...])  kind: info | warn | bad | ok.  The retry logic itself stays in network.js / social.js and reports here. */
const connUI = (() => {
  const COL = { info: '#26394d', warn: '#4d3d1f', bad: '#4d2020', ok: '#1f4d2b' };
  let bar = null, cur = null, hideT = null; const lost = new Set();
  const el = () => {
    if (bar) return bar;
    bar = document.createElement('div'); bar.id = 'connBar'; bar.setAttribute('role', 'status');
    bar.style.cssText = 'position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:9500;max-width:min(560px,calc(100vw - 16px));border:1px solid rgba(255,255,255,.25);border-radius:10px;padding:8px 12px;color:#fff;font:14px/1.35 system-ui,sans-serif;box-shadow:0 6px 22px rgba(0,0,0,.55);display:none;align-items:center;gap:10px;flex-wrap:wrap;justify-content:center';
    document.body.appendChild(bar); return bar;
  };
  const api = {
    joined: false, kicked: false, retryNow: null,
    set(kind, text, btns) {
      clearTimeout(hideT); const b = el(); cur = { kind, text }; b.style.background = COL[kind] || COL.info; b.innerHTML = '';
      const sp = document.createElement('span'); sp.textContent = (kind === 'ok' ? '✓ ' : kind === 'bad' ? '⚠ ' : kind === 'warn' ? '⟳ ' : '… ') + text; b.appendChild(sp);
      (btns || []).forEach(([l, f]) => { const x = document.createElement('button'); x.type = 'button'; x.textContent = l; x.style.cssText = 'padding:3px 10px;border:0;border-radius:6px;background:#7a9b57;color:#fff;cursor:pointer;font-size:13px'; x.onclick = f; b.appendChild(x); });
      b.style.display = 'flex'; diagNote('conn: ' + kind + ' ' + text);
    },
    clear() { clearTimeout(hideT); cur = null; if (bar) bar.style.display = 'none'; if (lost.size) api.showLost(); },
    ok(text) { api.set('ok', text); hideT = setTimeout(() => api.clear(), 2500); },
    got() { api.joined = true; api.retryNow = null; if (cur && (cur.kind === 'warn' || cur.kind === 'bad')) api.ok('Connected again.'); else if (cur && cur.kind === 'info') api.clear(); },      // (a guest received something from the host)
    showLost() { if (!lost.size) { if (cur && cur.host) api.clear(); return; } api.set('warn', 'Waiting for ' + [...lost].join(', ') + ' to reconnect (they can reopen the same link)…'); cur.host = true; },
    lostAdd(n) { lost.add(n); api.showLost(); },
    lostDel(n) { if (lost.delete(n)) { if (lost.size) api.showLost(); else { api.ok(n + ' is back.'); } } },
    lostClear() { lost.clear(); if (cur && cur.host) api.clear(); }
  };
  addEventListener('offline', () => api.set('warn', 'You are offline. Reconnecting as soon as the internet is back…'));
  addEventListener('online', () => { if (api.retryNow) api.retryNow(); else if (cur && cur.kind === 'warn' && !cur.host) api.clear(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && api.retryNow) api.retryNow(); });          // coming back to the tab: try right away
  return api;
})();
