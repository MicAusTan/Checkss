/* diag.js: shows errors on screen instead of only in the console, with a "Copy debug info" button. Loaded FIRST so it also sees errors from every other script.
   diagNote('text') adds a line to the log that goes into the debug info (connections, joins, ...). */
const DIAG = { errors: [], log: [], bar: null, hidden: false };
function diagNote(t) { try { DIAG.log.push(new Date().toISOString().slice(11, 23) + ' ' + String(t).slice(0, 200)); if (DIAG.log.length > 60) DIAG.log.shift(); } catch (e) { /* never throw from the logger */ } }
function diagState() {
  const g = k => { try { return eval('typeof ' + k + " === 'undefined' ? undefined : " + k); } catch (e) { return undefined; } };      // the page's globals are `let`s, so ask by name
  const gm = g('game'), st = {};
  st.mode = g('mode'); st.host = g('isHost'); st.room = (location.search || '').slice(0, 60); st.players = (g('conns') || []).length;
  try { st.moves = gm && gm.history ? gm.history().length : null; st.turn = gm ? gm.turn : null; } catch (e) { st.moves = '?'; }
  st.bots2p = g('bots2p') || null; st.started = g('mstarted'); st.look = typeof LOOK !== 'undefined' ? (LOOK.classic ? 'classic' : 'default') : undefined;
  return st;
}
function diagReport() {
  const lines = ['Chess with Friends debug info', 'time: ' + new Date().toISOString(), 'page: ' + location.href.split('?')[0], 'browser: ' + navigator.userAgent, 'screen: ' + innerWidth + 'x' + innerHeight, 'state: ' + JSON.stringify(diagState()), '', 'errors (' + DIAG.errors.length + '):'];
  DIAG.errors.slice(-8).forEach(e => { lines.push('- ' + e.msg + (e.count > 1 ? ' (x' + e.count + ')' : '') + (e.where ? ' @ ' + e.where : '')); if (e.stack) lines.push('  ' + String(e.stack).split('\n').slice(0, 4).join('\n  ')); });
  lines.push('', 'recent events:'); DIAG.log.slice(-30).forEach(l => lines.push('  ' + l));
  return lines.join('\n');
}
function diagCopy() {
  const t = diagReport(), done = ok => { const b = document.getElementById('diagCopy'); if (b) { b.textContent = ok ? 'Copied!' : 'Select and copy'; setTimeout(() => { b.textContent = 'Copy debug info'; }, 1800); } };
  const fallback = () => { const ta = document.createElement('textarea'); ta.value = t; ta.style.cssText = 'position:fixed;left:8px;bottom:60px;width:min(560px,90vw);height:200px;z-index:100001'; document.body.appendChild(ta); ta.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; } if (ok) ta.remove(); done(ok); };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(() => done(true), fallback); else fallback();
}
function diagShow() {
  if (!document.body) { addEventListener('DOMContentLoaded', diagShow, { once: true }); return; }
  let b = DIAG.bar;
  if (!b) {
    b = DIAG.bar = document.createElement('div'); b.id = 'diagBar'; b.setAttribute('role', 'alert');
    b.style.cssText = 'position:fixed;left:10px;bottom:10px;z-index:100000;max-width:min(520px,calc(100vw - 20px));background:#3a1f1f;color:#fff;border:1px solid #c05050;border-radius:10px;padding:10px 12px;font:13px/1.35 system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.6)';
    b.innerHTML = '<div style="font-weight:700;margin-bottom:3px">Something went wrong</div><div id="diagMsg" style="opacity:.9;word-break:break-word"></div><div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap"><button id="diagCopy" type="button">Copy debug info</button><button id="diagReload" type="button">Reload page</button><button id="diagX" type="button">Dismiss</button></div>';
    document.body.appendChild(b);
    b.querySelectorAll('button').forEach(x => { x.style.cssText = 'padding:4px 10px;font-size:12px;border-radius:6px;border:0;background:#7a9b57;color:#fff;cursor:pointer'; });
    b.querySelector('#diagCopy').onclick = diagCopy; b.querySelector('#diagReload').onclick = () => location.reload(); b.querySelector('#diagX').onclick = () => { b.style.display = 'none'; DIAG.hidden = true; };
  }
  const last = DIAG.errors[DIAG.errors.length - 1]; b.querySelector('#diagMsg').textContent = last.msg + (last.count > 1 ? '  (x' + last.count + ')' : '') + (last.where ? '  [' + last.where + ']' : '');
  b.style.display = 'block'; DIAG.hidden = false;
}
function diagError(msg, where, stack) {
  msg = String(msg || 'Unknown error').slice(0, 300);
  if (/ResizeObserver loop|^Script error\.?$/.test(msg)) return;             // browser noise, not a bug
  diagNote('ERROR ' + msg);
  const prev = DIAG.errors[DIAG.errors.length - 1];
  if (prev && prev.msg === msg && prev.where === where) prev.count++; else DIAG.errors.push({ msg, where, stack, count: 1 });
  if (DIAG.errors.length > 30) DIAG.errors.shift();
  diagShow();
}
addEventListener('error', ev => diagError(ev.message || (ev.error && ev.error.message), ev.filename ? ev.filename.split('/').pop() + ':' + ev.lineno + ':' + ev.colno : '', ev.error && ev.error.stack));
addEventListener('unhandledrejection', ev => { const r = ev.reason; diagError('Unhandled promise error: ' + (r && r.message ? r.message : r), '', r && r.stack); });
