import * as THREE from 'three';
import { sfx } from '../sfx.js';
import { arena } from './arena.js';
import { topDown, pine, ringPts } from './kit.js';
// Set: a night campsite. Braziers glow around the edge, tents and pines sit beyond them, fireflies drift over the clearing.
export default {
  name: 'Hot Potato', desc: 'Don\'t be holding the potato when it blows! Touch someone to pass it on. WASD to move.',
  create(ctx) {
    const W = ctx.world, A = arena(ctx, { set: { ...topDown(W, 13, 20), sky: 0x0a1030, fog: { color: 0x0a1030, near: 38, far: 90 }, light: .6, sun: { color: 0x8fa8ff, intensity: .55, pos: [-6, 14, 8] } } }), { ids, st, S } = A, host = ctx.isHost, was = {};
    const el = document.createElement('div'); el.className = 'mg'; ctx.hud.append(el);
    S.cyl(12.5, 12.9, .5, 0x3d2f22, 0, -.5, 0, { seg: 28 }); S.cyl(24, 24, .5, 0x23401f, 0, -.9, 0, { seg: 28 });
    const flames = []; ringPts(8, 13.4, .2).forEach(([x, z], k) => { S.cyl(.4, .3, 1.3, 0x333333, x, 0, z, { seg: 8 }); flames.push(S.cone(.5, 1, 0xff9f1a, x, 1.3, z, { basic: true, seg: 6 })); if (k % 2 === 0) { const L = new THREE.PointLight(0xff8a30, 1.3, 17); L.position.set(x, 2.4, z); S.root.add(L); } });
    ringPts(5, 19, .5).forEach(([x, z, a], k) => { S.cone(2.6, 3, [0xc0504d, 0xd8a24a, 0x4f81bd, 0x9b59b6, 0x6a9a4a][k], x, 0, z, { seg: 6 }); S.box(1, 1.5, .1, 0x1a1a1a, x * .9, 0, z * .9); });     // tents
    ringPts(18, 24, .1).forEach(([x, z], k) => pine(S, x + (k % 3 - 1), z, 1.1 + k % 3 * .2, 0x1f5a34));
    ringPts(7, 12.2, .9).forEach(([x, z, a]) => S.cyl(.35, .35, 2, 0x6b4a2b, x, 0, z, { ry: a, seg: 6 }).rotation.z = Math.PI / 2);                // log seats
    const flies = Array.from({ length: 14 }, (_, k) => S.sph(.12, 0xfff08a, 0, 1, 0, { basic: true, seg: 5 }));
    S.anim((dt, tn) => { flames.forEach((f, k) => f.scale.set(.8 + Math.sin(tn * 9 + k) * .2, .9 + Math.sin(tn * 13 + k * 2) * .3, .8 + Math.sin(tn * 9 + k) * .2)); flies.forEach((f, k) => f.position.set(Math.sin(tn * .4 + k * 1.9) * (6 + k % 5), 1.2 + Math.sin(tn * 1.3 + k) * .6, Math.cos(tn * .35 + k * 2.3) * (6 + k % 4))); });
    const potato = new THREE.Mesh(new THREE.IcosahedronGeometry(.45, 0), new THREE.MeshBasicMaterial({ color: 0xff3b30 })); S.root.add(potato);
    const timer = S.screen(2, .9, 160, 72); let tkT = 0, lastTxt = '';
    let holder = host ? ids[Math.random() * ids.length | 0] : null, fuse = 4 + Math.random() * 4, cool = 1, out = [], time = 0, acc = 0, over = false, lt = 0, prevH = null;
    const pack = () => ({ p: A.pack(), h: holder, f: +fuse.toFixed(1) });
    let snap = pack();
    function step(dt) {
      time += dt; cool -= dt; fuse -= dt;
      A.bots(dt, (id, s, sk) => {
        const r = Math.hypot(s.x, s.z); let b = null, bd = 1e9;
        for (const o of ids) { if (o === id || !st[o].alive) continue; const d = Math.hypot(st[o].x - s.x, st[o].z - s.z); if (d < bd) { bd = d; b = st[o]; } }
        if (!b) return null;
        if (id === holder) return [b.x - s.x, b.z - s.z];
        const h = st[holder], dh = Math.hypot(h.x - s.x, h.z - s.z);
        if (dh < 3 + 5 * sk) { let fx = s.x - h.x, fz = s.z - h.z; if (r > 9.5) { fx -= s.x * .25; fz -= s.z * .25; } return [fx, fz]; }
        return r > 8 ? [-s.x, -s.z] : null;
      });
      for (const id of ids) st[id].sp = id === holder ? 1.1 : .95;
      A.move(dt);
      if (cool <= 0) { const h = st[holder]; for (const id of ids) if (id !== holder && st[id].alive && Math.hypot(h.x - st[id].x, h.z - st[id].z) < 1.3) { holder = id; cool = .9; break; } }
      if (fuse <= 0) {
        st[holder].alive = false; out.push(holder);
        const al = ids.filter(id => st[id].alive);
        if (al.length <= (ids.length > 1 ? 1 : 0)) { over = true; snap = pack(); ctx.send(snap); return ctx.finish([...al, ...out.reverse()]); }
        holder = al[Math.random() * al.length | 0]; fuse = (4 + Math.random() * 4) * [1.3, 1, .75][ctx.diff ?? 1]; cool = 1.2;
      }
      if (time > 90) { over = true; const al = ids.filter(id => st[id].alive); ctx.finish([...al, ...out.reverse()]); }
    }
    return {
      update(dt) {
        A.input(); lt += dt;
        if (host) { if (!over) step(dt); snap = pack(); if ((acc += dt) >= .05) { acc = 0; ctx.send(snap); } }
        A.show(snap.p);
        for (const id of ids) { const q = snap.p[id]; if (was[id] && !q[2]) { sfx('fall'); W.burst(q[0], 1, q[1], '#ff9f1a', 30); W.shake(.18, .3); } was[id] = q[2]; }
        if (snap.h !== prevH) { if (prevH) sfx('click'); prevH = snap.h; }
        const g = W.m.get(snap.h)?.g; potato.visible = !!g && !!snap.p[snap.h]?.[2];
        if (g) { potato.position.set(g.position.x, 2.7 + Math.sin(lt * 8) * .1, g.position.z); potato.material.color.set(Math.sin(lt * 25 / (snap.f + 1)) > 0 ? 0xff3b30 : 0xffd93d); }
        timer.mesh.visible = potato.visible; if (g) timer.mesh.position.set(g.position.x, 3.9, g.position.z);
        const txt = Math.max(0, snap.f).toFixed(1); if (txt !== lastTxt) { lastTxt = txt; timer.draw((c, w, h) => { c.fillStyle = snap.f < 2 ? '#c0392b' : '#000b'; c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; c.font = 'bold 52px sans-serif'; c.textAlign = 'center'; c.fillText('💣 ' + txt, w / 2, 56); }); }
        if ((tkT -= dt) <= 0 && potato.visible) { sfx('tick'); tkT = Math.max(.12, Math.min(.7, snap.f * .12)); }      // ticking speeds up as the fuse burns down
        el.innerHTML = `<h3>🥔 ${ctx.esc(ctx.players[snap.h]?.name ?? '')} has it!</h3><div>Alive: ${ids.filter(id => snap.p[id][2]).length}/${ids.length}</div>`;
      },
      onMessage(m, from) { if (A.onInput(m, from)) return; if (!host && m.p) snap = m; },
      cleanup() { A.cleanup(); W.scene.remove(potato); el.remove(); },
    };
  },
};
