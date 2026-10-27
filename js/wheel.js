import { EMOTES } from './emotes.js';
import { getSet } from './wallet.js';
// Radial emote wheel. Hold G, move the mouse toward a slice, release G to play it. Tap G (or the 😀 button) to keep it open and click.
// 1-8 pick a slice, scroll / arrow keys / the arrows in the middle turn the page. Mouse movement is accumulated (works under pointer lock).
export function initWheel({ ok, send }) {
  const root = document.createElement('div'); root.id = 'wheel'; root.hidden = true;
  root.innerHTML = '<div id="wring"></div><div id="whub"><b id="wname"></b><div><button data-p="-1" tabindex="-1">◂</button> <small id="wpage"></small> <button data-p="1" tabindex="-1">▸</button></div></div>';
  const btn = document.createElement('button'); btn.id = 'emoBtn'; btn.tabIndex = -1; btn.title = 'Emotes (hold G)'; btn.textContent = '😀'; btn.hidden = true;
  document.body.append(root, btn);
  const ring = root.querySelector('#wring'), nm = root.querySelector('#wname'), pg = root.querySelector('#wpage');
  let page = 0, open = false, sticky = false, vx = 0, vy = 0, hov = -1, downAt = 0, slots = [];
  const pages = () => Math.max(1, Math.ceil(getSet().length / 8)), R = 118;
  function mark() {
    ring.querySelectorAll('button').forEach((b, k) => b.classList.toggle('on', k === hov));
    const e = slots[hov] != null ? EMOTES[slots[hov]] : null; nm.textContent = e ? e.ch + ' ' + e.n : 'Emotes';
  }
  function draw() {
    slots = getSet().slice(page * 8, page * 8 + 8);
    ring.innerHTML = slots.map((id, k) => { const a = k * Math.PI / 4;
      return `<button data-k="${k}" tabindex="-1" style="left:calc(50% + ${(Math.sin(a) * R).toFixed(1)}px);top:calc(50% + ${(-Math.cos(a) * R).toFixed(1)}px);animation-delay:${k * 18}ms">${EMOTES[id].ch}<i>${k + 1}</i></button>`; }).join('');
    pg.textContent = pages() > 1 ? (page + 1) + '/' + pages() : '';
    root.querySelectorAll('[data-p]').forEach(b => b.hidden = pages() < 2);
    hov = -1; mark();
  }
  const flip = d => { if (pages() < 2) return; page = (page + d + pages()) % pages(); draw(); };
  function openW(st) { if (!ok()) return; open = true; sticky = st; page = 0; vx = vy = 0; root.hidden = false; draw(); }
  function close() { open = false; sticky = false; root.hidden = true; hov = -1; }
  function pick() { if (hov >= 0 && slots[hov] != null) send(slots[hov]); close(); }
  const typing = e => /INPUT|SELECT|TEXTAREA/.test(e.target.tagName);
  addEventListener('keydown', e => {
    if (typing(e)) return;
    if (e.code === 'KeyG' && !e.repeat) { if (open) { sticky ? close() : 0; return; } openW(false); downAt = performance.now(); return; }
    if (!open) return;
    if (e.code === 'Escape') close();
    else if (e.code === 'ArrowLeft') { flip(-1); e.preventDefault(); } else if (e.code === 'ArrowRight') { flip(1); e.preventDefault(); }
    else if (/^(Digit|Numpad)[1-8]$/.test(e.code)) { hov = +e.code.slice(-1) - 1; pick(); }
  });
  addEventListener('keyup', e => { if (e.code === 'KeyG' && open && !sticky) { if (performance.now() - downAt < 220) sticky = true; else pick(); } });
  addEventListener('mousemove', e => {
    if (!open) return; vx += e.movementX || 0; vy += e.movementY || 0;
    const l = Math.hypot(vx, vy); if (l > 150) { vx *= 150 / l; vy *= 150 / l; }
    if (l < 36) hov = -1; else { const a = (Math.atan2(vx, -vy) + 2 * Math.PI) % (2 * Math.PI), k = Math.round(a / (Math.PI / 4)) % 8; hov = k < slots.length ? k : -1; }
    mark();
  });
  addEventListener('wheel', e => { if (open) flip(e.deltaY > 0 ? 1 : -1); }, { passive: true });
  addEventListener('blur', close);
  root.addEventListener('pointerdown', e => e.stopPropagation());
  root.addEventListener('mouseover', e => { const b = e.target.closest('#wring button'); if (b) { hov = +b.dataset.k; mark(); } });
  root.addEventListener('click', e => {
    const p = e.target.closest('[data-p]'); if (p) { flip(+p.dataset.p); return; }
    const b = e.target.closest('#wring button'); if (b) { hov = +b.dataset.k; pick(); }
  });
  btn.addEventListener('pointerdown', e => e.stopPropagation());
  btn.addEventListener('click', () => { btn.blur(); open ? close() : openW(true); });
  return { sync() { btn.hidden = !ok(); if (btn.hidden && open) close(); } };
}
