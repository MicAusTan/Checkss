import * as THREE from 'three';
import { sfx } from '../sfx.js';
import { arena } from './arena.js';
import { topDown } from './kit.js';
// Set: a desert canyon plateau at dusk. The red circles are real shadows: each boulder visibly falls from the sky and lands (dust + shake).
export default {
  tiers: [{ n: 'Normal', m: 1, pen: 0 }, { n: 'Heavy Start', m: 1.3, pen: 1, d: 'Boulders fall much faster from the start.' }, { n: 'Hunted', m: 1.7, pen: 2, d: 'Boulders mostly drop right where players stand (a little off).' }],
  name: 'Dodge Rain', desc: 'Red circles mark where boulders land. Stay out of them! Last one standing wins. WASD to move. Hold E near someone to grab and slow them (but they drag YOU along).',
  create(ctx) {
    const W = ctx.world, A = arena(ctx, { grab: true, set: { ...topDown(W, 13.5, 21), sky: 0xf0a868, fog: { color: 0xf0a868, near: 50, far: 120 }, light: 1.05, sun: { color: 0xffc080, intensity: 1.25, pos: [-8, 14, 6] } } }), { ids, st, S } = A, host = ctx.isHost, rings = [], was = {}, boul = [], bGeo = new THREE.IcosahedronGeometry(1.1, 1); let prevKeys = new Set();
    const el = document.createElement('div'); el.className = 'mg'; ctx.hud.append(el);
    S.cyl(12.4, 12.9, .5, 0xb7835a, 0, -.5, 0, { seg: 28 }); S.cyl(30, 30, .5, 0x9c6b46, 0, -1.4, 0, { seg: 28 });
    for (let k = 0; k < 18; k++) { const a = k / 18 * 6.283, r = 21 + k % 3 * 3; S.box(5 + k % 3 * 2, 7 + k % 5 * 3, 4 + k % 2 * 2, k % 2 ? 0xc0693f : 0xa9562f, Math.sin(a) * r, -1, Math.cos(a) * r, { ry: -a }); }    // canyon walls
    for (let k = 0; k < 10; k++) { const a = k * 2.3 + .4, r = 14 + k % 4 * 1.7, x = Math.sin(a) * r, z = Math.cos(a) * r; S.cyl(.22, .28, 2, 0x4f8a3c, x, 0, z, { seg: 6 }); S.cyl(.14, .14, .9, 0x4f8a3c, x + .45, .9, z, { seg: 5 }); }   // cacti
    let hz = [], out = [], time = 0, spawnT = 1, acc = 0, over = false;
    const pack = () => ({ p: A.pack(), h: hz.map(h => [+h.x.toFixed(2), +h.z.toFixed(2), +h.t.toFixed(2), h.r]) });
    let snap = pack();
    function step(dt) {
      time += dt;
      A.bots(dt, (id, s, sk) => { let fx = 0, fz = 0, hit = false; const m = 1.2 + 2.4 * sk; for (const h of hz) { const dx = s.x - h.x, dz = s.z - h.z, d = Math.hypot(dx, dz); if (d < h.r + m) { hit = true; const w = (h.r + m - d) / (h.r + m); fx += dx / (d || 1) * w; fz += dz / (d || 1) * w; } } if (hit) { const r = Math.hypot(s.x, s.z); if (r > 9.5) { fx -= s.x / r * .8; fz -= s.z / r * .8; } return [fx, fz]; } return Math.hypot(s.x, s.z) > 8 ? [-s.x, -s.z] : null; });
      A.move(dt);
      if ((spawnT -= dt) <= 0) {
        spawnT = [Math.max(.25, .9 - time * .015), Math.max(.22, .5 - time * .012), Math.max(.3, .85 - time * .015)][ctx.diff ?? 0];
        const al = ids.filter(id => st[id].alive), tg = al.length && Math.random() < [.5, .5, .92][ctx.diff ?? 0] ? st[al[Math.random() * al.length | 0]] : null, a = Math.random() * 6.28, r = Math.sqrt(Math.random()) * 10.5;
        hz.push({ x: tg ? tg.x + (Math.random() - .5) * [3, 3, 2][ctx.diff ?? 0] : Math.sin(a) * r, z: tg ? tg.z + (Math.random() - .5) * [3, 3, 2][ctx.diff ?? 0] : Math.cos(a) * r, t: 1.2, r: 1.8 });
      }
      hz = hz.filter(h => {
        if ((h.t -= dt) > 0) return true;
        for (const id of ids) { const s = st[id]; if (s.alive && Math.hypot(s.x - h.x, s.z - h.z) < h.r + .4) { s.alive = false; out.push(id); } }
        return false;
      });
      const al = ids.filter(id => st[id].alive);
      if (al.length <= (ids.length > 1 ? 1 : 0) || time > 60) { over = true; ctx.send(pack()); ctx.finish([...al, ...out.reverse()]); }
    }
    return {
      update(dt) {
        A.input();
        if (host) { if (!over) step(dt); snap = pack(); if ((acc += dt) >= .05) { acc = 0; ctx.send(snap); } }
        A.show(snap.p); let n = 0;
        for (const id of ids) {
          const q = snap.p[id]; if (q[2]) n++;
          if (was[id] && !q[2]) { sfx('fall'); W.burst(q[0], 1, q[1], '#ff3b30', 20); } was[id] = q[2];
        }
        while (rings.length < snap.h.length) { const m = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, .05, 20), new THREE.MeshBasicMaterial({ color: 0xff3b30, transparent: true })); S.root.add(m); rings.push(m); const b = new THREE.Mesh(bGeo, new THREE.MeshStandardMaterial({ color: 0x7a5238, flatShading: true })); S.root.add(b); boul.push(b); }
        rings.forEach((m, i) => { const h = snap.h[i]; m.visible = !!h; boul[i].visible = !!h; if (h) { m.position.set(h[0], .05, h[1]); m.scale.set(h[3], 1, h[3]); m.material.opacity = .2 + .55 * (1 - h[2] / 1.2); boul[i].position.set(h[0], .9 + Math.pow(Math.max(0, h[2]) / 1.2, 1.4) * 15, h[1]); boul[i].rotation.x += dt * 3; } });
        const keys = new Set(snap.h.map(h => h[0] + ',' + h[1]));          // a boulder that disappeared this frame has landed
        for (const k of prevKeys) if (!keys.has(k)) { const [bx, bz] = k.split(',').map(Number); W.burst(bx, .6, bz, '#c9a27a', 14); W.shake(.05, .1); } prevKeys = keys;
        el.innerHTML = `<h3>Alive: ${n}/${ids.length}</h3>`;
      },
      onMessage(m, from) { if (A.onInput(m, from)) return; if (!host && m.p) snap = m; },
      cleanup() { A.cleanup(); rings.forEach(m => W.scene.remove(m)); el.remove(); },
    };
  },
};
