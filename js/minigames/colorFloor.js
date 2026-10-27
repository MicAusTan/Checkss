import * as THREE from 'three';
import { sfx } from '../sfx.js';
import { arena } from './arena.js';
import { topDown } from './kit.js';
// Set: a lava cave. The tiles are stone slabs over a glowing lava lake; slabs that vanish drop you into the lava with a splash.
const G = 6, S = 3.6, H = G * S / 2;
export default {
  emotes: false, name: 'Crumbling Floor', desc: 'Tiles flash red, then vanish - but they grow back a few seconds later! Keep moving and stay on solid ground. Last one standing wins. WASD to move, F / Shift / click to shove.',
  create(ctx) {
    const W = ctx.world, A = arena(ctx, { shove: true, disc: false, radius: 10.5, set: { ...topDown(W, 13, 20), sky: 0x1a0a08, fog: { color: 0x1a0a08, near: 34, far: 82 }, light: .9, sun: { color: 0xffb070, intensity: 1, pos: [4, 14, 8] } } }), { ids, st, S: SET } = A, host = ctx.isHost, fall = {}, was = {}, splashed = {}, tiles = [];
    const el = document.createElement('div'); el.className = 'mg'; ctx.hud.append(el);
    const lava = SET.box(140, .5, 140, 0xd8350a, 0, -7.5, 0, { em: 0x8a2200 }); SET.anim((dt, tn) => lava.material.emissive.setRGB(.5 + Math.sin(tn * 1.7) * .08, .12, .02));
    for (let k = 0; k < 16; k++) { const a = k / 16 * 6.283 + .2, r = 17 + k % 3 * 4; SET.cone(2.2 + k % 4, 7 + k % 5 * 2.6, 0x2a1a17, Math.sin(a) * r, -7.5, Math.cos(a) * r, { seg: 5 }); }       // rock spires
    const bub = Array.from({ length: 12 }, (_, k) => SET.sph(.45, 0xff7a1a, Math.sin(k * 2.1) * (9 + k % 4 * 4), -7, Math.cos(k * 2.1) * (9 + k % 4 * 4), { basic: true, seg: 6 }));
    SET.anim((dt, tn) => bub.forEach((b, k) => { const u = Math.abs(Math.sin(tn * 1.1 + k * 1.7)); b.position.y = -7.2 + u * .9; b.scale.setScalar(.4 + u * .9); }));
    for (let i = 0; i < G * G; i++) {
      const base = (i + (i / G | 0)) % 2 ? 0x6f7384 : 0x8c90a3;
      const m = new THREE.Mesh(new THREE.BoxGeometry(S - .15, .4, S - .15), new THREE.MeshStandardMaterial({ color: base, flatShading: true }));
      m.position.set(-H + S * (i % G + .5), -.2, -H + S * ((i / G | 0) + .5)); m.userData.base = base; SET.root.add(m); tiles.push(m);
    }
    const ts = Array(G * G).fill(1), warn = Array(G * G).fill(0), gone = Array(G * G).fill(0); let time = 0, spawnT = 2, out = [], acc = 0, over = false, lt = 0;
    const tileAt = (x, z) => { const cx = Math.floor((x + H) / S), cz = Math.floor((z + H) / S); return cx < 0 || cx >= G || cz < 0 || cz >= G ? -1 : cz * G + cx; };
    const pack = () => ({ p: A.pack(), t: ts.join('') });
    let snap = pack();
    function step(dt) {
      time += dt;
      A.bots(dt, (id, s, sk) => { const i = tileAt(s.x, s.z); if (i >= 0 && ts[i] === 1) return null; let b = null, bd = 1e9; for (let k = 0; k < ts.length; k++) { if (ts[k] !== 1) continue; const cx = -H + S * (k % G + .5), cz = -H + S * ((k / G | 0) + .5), d = Math.hypot(cx - s.x, cz - s.z); if (d < bd) { bd = d; b = [cx - s.x, cz - s.z]; } } return b; });
      A.move(dt);
      if ((spawnT -= dt) <= 0) {
        spawnT = Math.max(.8, 2.2 - time * .04); const free = ts.map((v, i) => v === 1 ? i : -1).filter(i => i >= 0);
        for (let n = 0; n < 2 + (time / 12 | 0) && free.length; n++) { const k = free.splice(Math.random() * free.length | 0, 1)[0]; ts[k] = 2; warn[k] = 1.6; }
      }
      for (let i = 0; i < ts.length; i++) { if (ts[i] === 2 && (warn[i] -= dt) <= 0) { ts[i] = 0; gone[i] = (3.2 + Math.random() * 1.6) * [.7, 1, 1.5][ctx.diff ?? 1]; } else if (ts[i] === 0 && (gone[i] -= dt) <= 0) ts[i] = 1; }   // slabs grow back
      for (const id of ids) { const s = st[id]; if (!s.alive) continue; const i = tileAt(s.x, s.z); if (i < 0 || ts[i] === 0) { s.alive = false; out.push(id); } }
      const al = ids.filter(id => st[id].alive);
      if (al.length <= (ids.length > 1 ? 1 : 0) || time > 90) { over = true; ctx.send(pack()); ctx.finish([...al, ...out.reverse()]); }
    }
    return {
      update(dt) {
        A.input(); lt += dt;
        if (host) { if (!over) step(dt); snap = pack(); if ((acc += dt) >= .05) { acc = 0; ctx.send(snap); } }
        A.show(snap.p); let n = 0;
        for (const id of ids) {
          const q = snap.p[id], g = W.m.get(id)?.g; if (q[2]) n++;
          if (!q[2] && g) { g.visible = true; fall[id] = (fall[id] || 0) + 30 * dt; g.position.y = Math.max(-40, g.position.y - fall[id] * dt); if (g.position.y < -6.5 && !splashed[id]) { splashed[id] = 1; W.burst(q[0], -6.5, q[1], '#ff7a1a', 26); W.shake(.1, .2); } }
          if (was[id] && !q[2]) sfx('fall'); was[id] = q[2];
        }
        tiles.forEach((m, i) => { const c = snap.t[i]; m.visible = c !== '0'; m.material.color.set(c === '2' ? (Math.sin(lt * 20) > 0 ? 0xff3b30 : 0xffffff) : m.userData.base); });
        el.innerHTML = `<h3>Alive: ${n}/${ids.length}</h3>`;
      },
      onMessage(m, from) { if (A.onInput(m, from)) return; if (!host && m.p) snap = m; },
      cleanup() { tiles.forEach(m => W.scene.remove(m)); ids.forEach(id => { const g = W.m.get(id)?.g; if (g) g.position.y = 0; }); A.cleanup(); el.remove(); },
    };
  },
};
