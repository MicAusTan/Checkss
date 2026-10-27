import * as THREE from 'three';
import { sfx } from '../sfx.js';
import { arena } from './arena.js';
import { topDown } from './kit.js';
// Color Floor: the floor is a grid of random colours. A colour flashes on screen - when the timer ends every other colour drops away.
// Host simulates (arena); everyone renders the same snapshot. Shove is on, edges are deadly. Math.random only (host-side), never ctx.rng.
const G = 5, S = 3.2, H = G * S / 2, COLS = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf1c40f, 0x9b59b6], NAMES = ['RED', 'BLUE', 'GREEN', 'YELLOW', 'PURPLE'], MAXR = 16;
export default {
  emotes: false, name: 'Color Floor', desc: 'A colour flashes on screen - run and stand on a tile of that colour before time runs out! Every other tile drops away. Falling = out. WASD to move, F / Shift / click to shove. Last one standing wins.',
  create(ctx) {
    const W = ctx.world, A = arena(ctx, { shove: true, disc: false, radius: 8.6, set: { ...topDown(W, 12, 19), sky: 0x120a2a, fog: { color: 0x120a2a, near: 36, far: 85 }, light: 1, sun: { intensity: 1, pos: [4, 14, 8] } } }), { ids, st, S: SET } = A, host = ctx.isHost, fall = {}, was = {}, splashed = {}, tiles = [];
    const el = document.createElement('div'); el.className = 'mg'; ctx.hud.append(el);
    SET.box(120, .5, 120, 0x0a0618, 0, -9, 0);
    for (let i = 0; i < G * G; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(S - .15, .4, S - .15), new THREE.MeshStandardMaterial({ color: 0x888888, flatShading: true })); m.position.set(-H + S * (i % G + .5), -.2, -H + S * ((i / G | 0) + .5)); SET.root.add(m); tiles.push(m); }
    const tileAt = (x, z) => { const cx = Math.floor((x + H) / S), cz = Math.floor((z + H) / S); return cx < 0 || cx >= G || cz < 0 || cz >= G ? -1 : cz * G + cx; };
    let col = [], gone = false, target = 0, ph = 'show', pt = 1.6, round = 0, out = [], acc = 0, over = false, rt = 0, T = 3, lt = 0;
    const deal = () => { col = Array.from({ length: G * G }, () => Math.random() * COLS.length | 0); target = Math.random() * COLS.length | 0; let n = col.filter(c => c === target).length; while (n < 5) { const k = Math.random() * col.length | 0; if (col[k] !== target) { col[k] = target; n++; } } };
    deal(); round = 1; T = 3.4; pt = T;
    const pack = () => ({ p: A.pack(), c: col.join(''), g: gone ? 1 : 0, tg: target, ph, tl: +Math.max(0, pt).toFixed(2), r: round });
    let snap = pack();
    function step(dt) {
      rt += dt;
      A.bots(dt, (id, s, sk) => {
        if (ph !== 'show' || rt < (s.dl ??= Math.random() * 1.5 * (1.15 - sk))) return null;
        const i = tileAt(s.x, s.z); if (i >= 0 && col[i] === target) return null;
        let b = null, bd = 1e9; for (let k = 0; k < col.length; k++) { if (col[k] !== target) continue; const cx = -H + S * (k % G + .5), cz = -H + S * ((k / G | 0) + .5), d = Math.hypot(cx - s.x, cz - s.z); if (d < bd) { bd = d; b = [cx - s.x, cz - s.z]; } } return b;
      });
      A.move(dt); pt -= dt;
      if (ph === 'show' && pt <= 0) { ph = 'drop'; gone = true; pt = 1.7; for (const id of ids) { const s = st[id]; if (!s.alive) continue; const i = tileAt(s.x, s.z); if (i < 0 || col[i] !== target) { s.alive = false; out.push(id); } } }
      else if (ph === 'drop' && pt <= 0) { round++; deal(); gone = false; ph = 'show'; T = Math.max(1.25, 3.4 - round * .2); pt = T; rt = 0; for (const id of ids) delete st[id].dl; }
      if (ph === 'show') for (const id of ids) { const s = st[id]; if (s.alive && tileAt(s.x, s.z) < 0) { s.alive = false; out.push(id); } }   // shoved off the edge
      const al = ids.filter(id => st[id].alive);
      if (al.length <= (ids.length > 1 ? 1 : 0) || round > MAXR) { over = true; ctx.send(pack()); ctx.finish([...al, ...out.reverse()]); }
    }
    let prevPh = '', prevR = 0;
    return {
      update(dt) {
        A.input(); lt += dt;
        if (host) { if (!over) step(dt); snap = pack(); if ((acc += dt) >= .05) { acc = 0; ctx.send(snap); } }
        A.show(snap.p); let n = 0;
        for (const id of ids) {
          const q = snap.p[id], g = W.m.get(id)?.g; if (q[2]) n++;
          if (!q[2] && g) { g.visible = true; fall[id] = (fall[id] || 0) + 30 * dt; g.position.y = Math.max(-40, g.position.y - fall[id] * dt); if (g.position.y < -6.5 && !splashed[id]) { splashed[id] = 1; W.burst(q[0], -6.5, q[1], '#aa66ff', 26); W.shake(.1, .2); } }
          if (was[id] && !q[2]) sfx('fall'); was[id] = q[2];
        }
        const tc = COLS[snap.tg];
        tiles.forEach((m, i) => { const c = +snap.c[i], hit = c === snap.tg; m.visible = !(snap.g && !hit); m.material.color.setHex(COLS[c]); m.material.emissive.setHex(snap.ph === 'show' && hit && Math.sin(lt * 14) > 0 ? 0x444444 : 0); });
        if (snap.r !== prevR) { prevR = snap.r; sfx('go'); }
        if (snap.ph !== prevPh) { prevPh = snap.ph; if (snap.ph === 'drop') { sfx('hit'); W.shake(.15, .3); } }
        const flash = snap.ph === 'show' && Math.sin(lt * 10) > -.2; W.scene.background.setHex(snap.ph === 'show' ? (flash ? tc : 0x120a2a) : 0x120a2a);
        const hex = '#' + tc.toString(16).padStart(6, '0');
        el.innerHTML = `<h2 style="background:${hex};border-radius:10px;padding:6px 22px;color:#fff;text-shadow:0 2px 4px #000">STAND ON ${NAMES[snap.tg]}</h2><div>${snap.ph === 'show' ? '⏱ ' + snap.tl.toFixed(1) + 's' : 'DROP!'} &nbsp; Round ${snap.r} &nbsp; Alive: ${n}/${ids.length}</div>`;
      },
      onMessage(m, from) { if (A.onInput(m, from)) return; if (!host && m.p) snap = m; },
      cleanup() { tiles.forEach(m => W.scene.remove(m)); ids.forEach(id => { const g = W.m.get(id)?.g; if (g) g.position.y = 0; }); A.cleanup(); el.remove(); },
    };
  },
};
