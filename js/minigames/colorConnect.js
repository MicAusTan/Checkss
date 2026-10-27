import * as THREE from 'three';
import { sfx } from '../sfx.js';
import { scoreboard, jit, mix } from './util.js';
import { stage } from './stage.js';
// Color Connect (a Flow-style puzzle race): join every pair of same-coloured dots with a path. Paths can't cross - drawing over another path cuts it.
// Everyone gets the same seeded puzzle (it is generated from solved paths, so it always has a solution). Fastest to connect all pairs wins.
const PAL = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#ff8c1a', '#1abc9c', '#fd79a8', '#a0522d'];
const nb = (i, G) => { const x = i % G, y = i / G | 0, o = []; if (x > 0) o.push(i - 1); if (x < G - 1) o.push(i + 1); if (y > 0) o.push(i - G); if (y < G - 1) o.push(i + G); return o; };
function makePuzzle(r, G, minE, maxE) {
  for (let tries = 0; tries < 80; tries++) {
    const owner = Array(G * G).fill(-1), ends = []; const order = [...Array(G * G).keys()].sort(() => r() - .5);
    for (const s of order) {
      if (owner[s] >= 0 || ends.length >= maxE) continue; const path = [s], L = 3 + (r() * 5 | 0);
      while (path.length < L) { const c = nb(path[path.length - 1], G).filter(i => owner[i] < 0 && !path.includes(i)); if (!c.length) break; path.push(c[r() * c.length | 0]); }
      if (path.length >= 3) { path.forEach(i => owner[i] = ends.length); ends.push([path[0], path[path.length - 1]]); }
    }
    if (ends.length >= minE && owner.filter(o => o >= 0).length >= Math.floor(G * G * .7)) return ends;
  }
  return Array.from({ length: minE }, (_, y) => [y * G, y * G + G - 1]);     // fallback (always solvable: straight rows)
}
export default {
  tiers: [{ n: 'Normal', m: 1, pen: 0, d: '1 puzzle, 5x5.', def: true }, { n: 'Hard', m: 1.5, pen: 1, d: '2 puzzles in a row, 6x6, more colours.' }, { n: 'Insane', m: 2.2, pen: 3, d: '3 puzzles in a row, 7x7, even more colours.' }],
  emotes: false, name: 'Color Connect', desc: 'Connect each pair of same-coloured dots by dragging a path between them. Paths cannot cross - drawing over another path cuts it. Fastest to connect every pair wins!',
  create(ctx) {
    const D = ctx.diff ?? 0, G = [5, 6, 7][D], R = [1, 2, 3][D], puzzles = Array.from({ length: R }, () => makePuzzle(ctx.rng, G, [4, 5, 6][D], [7, 8, 9][D])), CP = G > 5 ? 48 : 56;
    let rd = 0, ends = puzzles[0], K = ends.length; const ids = Object.keys(ctx.players), n = ids.length, me = ctx.me, W = ctx.world;
    const sb = scoreboard(ctx, { timeout: [80, 170, 300][D], bot: s => { const T = jit(mix(55, 20, s), .2) * [1, 2.4, 4.2][D]; return { v: Math.round(T * 1000), t: T }; } });
    let dotAt, paths, cellOf, cur = -1, time = 0, done = false;
    const S = stage(ctx, { sky: 0x1b2a49, fog: { color: 0x1b2a49, near: 30, far: 70 }, light: 1, sun: { intensity: .9, pos: [3, 14, 8] }, cam: { pos: [0, 5, 13], look: [0, 3, 0] }, camFrom: [0, 9, 21], camT: 1.4 });
    S.cyl(40, 40, .5, 0x16203a, 0, -.5, 0, { seg: 40 });
    for (let k = 0; k < 9; k++) S.cone(1.4, 4 + k % 3 * 1.5, [0xe74c3c, 0x3498db, 0x2ecc71, 0xf1c40f, 0x9b59b6][k % 5], (k - 4) * 3.2, 0, -7, { seg: 4, em: 0x101020 });
    ids.forEach((id, k) => { const x = (k - (n - 1) / 2) * Math.min(1.9, 14 / n); W.put(id, x, 3, Math.PI); const e = W.m.get(id); if (e) e.g.scale.setScalar(.8); });
    const el = document.createElement('div'); el.className = 'mg'; el.style.pointerEvents = 'auto';
    el.innerHTML = '<h3 id="s"></h3><div id="g" style="display:grid;gap:3px;justify-content:center;user-select:none;touch-action:none"></div>'; ctx.hud.append(el);
    const grid = el.querySelector('#g'), s = el.querySelector('#s'), cells = [];
    const buildGrid = () => {                                          // (re)build the DOM board for the current puzzle
      grid.innerHTML = ''; cells.length = 0; grid.style.gridTemplateColumns = `repeat(${G},${CP}px)`;
      for (let i = 0; i < G * G; i++) { const d = document.createElement('div'); d.dataset.i = i; d.style.cssText = `width:${CP}px;height:${CP}px;background:#1c2540;border-radius:8px;display:flex;align-items:center;justify-content:center`; grid.append(d); cells.push(d); }
    };
    const loadRound = () => {
      ends = puzzles[rd]; K = ends.length; dotAt = Array(G * G).fill(-1); ends.forEach(([a, b], c) => { dotAt[a] = c; dotAt[b] = c; });
      paths = ends.map(() => []); cellOf = Array(G * G).fill(-1); cur = -1; buildGrid();
    };
    loadRound();
    const refresh = () => {
      cellOf.fill(-1); paths.forEach((p, c) => p.forEach(i => cellOf[i] = c)); let ok = 0;
      cells.forEach((d, i) => { const c = cellOf[i], dc = dotAt[i]; d.style.background = c >= 0 ? PAL[c] + '88' : '#1c2540'; d.innerHTML = dc >= 0 ? `<div style="width:${CP * .55 | 0}px;height:${CP * .55 | 0}px;border-radius:50%;background:${PAL[dc]};box-shadow:0 0 8px ${PAL[dc]}"></div>` : ''; });
      paths.forEach((p, c) => { if (p.length > 1 && dotAt[p[0]] === c && dotAt[p[p.length - 1]] === c && p[0] !== p[p.length - 1]) ok++; });
      return ok;
    };
    const connected = c => { const p = paths[c]; return p.length > 1 && dotAt[p[0]] === c && dotAt[p[p.length - 1]] === c && p[0] !== p[p.length - 1]; };
    const cellFromEvent = e => { const t = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('[data-i]'); return t && grid.contains(t) ? +t.dataset.i : -1; };
    const down = e => {
      if (done) return; const i = cellFromEvent(e); if (i < 0) return; e.preventDefault();
      if (dotAt[i] >= 0) { cur = dotAt[i]; paths[cur] = [i]; }
      else if (cellOf[i] >= 0) { cur = cellOf[i]; const p = paths[cur]; paths[cur] = p.slice(0, p.indexOf(i) + 1); }
      else return; sfx('click'); refresh();
    };
    const move = e => {
      if (cur < 0 || done) return; const i = cellFromEvent(e), p = paths[cur]; if (i < 0 || !p.length) return; const last = p[p.length - 1]; if (i === last || !nb(last, G).includes(i)) return;
      if (connected(cur)) return;
      const at = p.indexOf(i); if (at >= 0) { paths[cur] = p.slice(0, at + 1); refresh(); return; }
      if (dotAt[i] >= 0 && dotAt[i] !== cur) return;                                   // can't enter another colour's dot
      if (dotAt[i] === cur && i === p[0]) return;
      const o = cellOf[i]; if (o >= 0 && o !== cur) { const q = paths[o]; paths[o] = q.slice(0, q.indexOf(i)); }      // cut the other path
      p.push(i); const ok = refresh(); sfx('step'); if (dotAt[i] === cur) { sfx('coin'); }
      sb.prog((rd + ok / K) / R);
      if (ok >= K && !done) {
        cur = -1; sfx('win'); W.hop(me, .5);
        if (rd + 1 < R) { rd++; loadRound(); refresh(); sb.prog(rd / R); return; }                  // next puzzle in the series
        done = true; sb.report(Math.round(time * 1000)); W.emote(me, 'cheer');
      }
    };
    const up = () => { cur = -1; };
    grid.addEventListener('pointerdown', down); addEventListener('pointermove', move); addEventListener('pointerup', up);
    refresh();
    return {
      update(dt) { if (!done) time += dt; sb.tick(dt); const ok = paths.filter((_, c) => connected(c)).length; s.textContent = done ? `Solved in ${time.toFixed(1)}s - waiting for others...` : `${time.toFixed(1)}s   ${R > 1 ? 'Puzzle ' + (rd + 1) + '/' + R + '   ' : ''}Connected ${ok}/${K}`; },
      endNow() { sb.endNow(); },
      onMessage(m, from) { sb.onMessage(m, from); },
      cleanup() { removeEventListener('pointermove', move); removeEventListener('pointerup', up); el.remove(); S.cleanup(); },
    };
  },
};
