import * as THREE from 'three';
import { sfx } from '../sfx.js';
import { arena } from './arena.js';
import { topDown, ringPts, pine, flakes } from './kit.js';
// Set: a frozen pond in the mountains. A shiny ice rink inside a snowbank, igloos, snowmen and snowy pines around it, and snow falling over everything.
export default {
  name: 'Snowball Fight', desc: 'Throw snowballs with SPACE or a left-click in the direction you\'re facing (move to aim). 3 hits and you\'re out. Last one standing wins. WASD to move.',
  create(ctx) {
    const W = ctx.world, A = arena(ctx, { set: { ...topDown(W, 13.5, 21), sky: 0xcfe8ff, fog: { color: 0xcfe8ff, near: 48, far: 115 }, light: 1.15, sun: { intensity: 1.15, pos: [5, 16, 8] } } }), { ids, st, S } = A, host = ctx.isHost, bm = [], was = {}, hpPrev = {};
    const el = document.createElement('div'); el.className = 'mg'; ctx.hud.append(el);
    S.cyl(12.4, 12.7, .5, 0xdff3ff, 0, -.5, 0, { seg: 32 }); S.cyl(10, 10, .02, 0xbfe6ff, 0, 0, 0, { seg: 32 }); S.cyl(14.5, 14.5, .9, 0xffffff, 0, -.9, 0, { seg: 32 }); S.cyl(40, 40, .5, 0xf4faff, 0, -.9, 0, { seg: 32 });
    ringPts(16, 21, .1).forEach(([x, z], k) => pine(S, x + (k % 3 - 1) * 1.4, z + (k % 2) * 1.5, 1.1 + k % 4 * .2, 0x2a6e4a, true));
    ringPts(3, 17.5, .6).forEach(([x, z, a]) => { S.sph(2.6, 0xf4fbff, x, 0, z, { seg: 10 }); S.box(1.4, 1.2, 1.6, 0x35495e, x * .88, 0, z * .88, { ry: a }); });                  // igloos
    ringPts(5, 15.6, 1.4).forEach(([x, z]) => { S.sph(.7, 0xffffff, x, .7, z, { seg: 8 }); S.sph(.5, 0xffffff, x, 1.7, z, { seg: 8 }); S.sph(.36, 0xffffff, x, 2.45, z, { seg: 8 }); S.cone(.08, .5, 0xff8a1a, x, 2.4, z + .35, { seg: 5 }).rotation.x = Math.PI / 2; S.cyl(.28, .28, .3, 0x222222, x, 2.75, z, { seg: 8 }); });   // snowmen
    flakes(S, 220, 44, 16, .13);
    const hp = {}, cd = {}; ids.forEach(id => { hp[id] = [4, 3, 2][ctx.diff ?? 1]; cd[id] = 0; st[id].fx = 0; st[id].fz = -1; st[id].fire = false; });
    let balls = [], out = [], time = 0, acc = 0, over = false;
    const kd = e => { if (e.code === 'Space' && !e.repeat) host ? st[ctx.me] && (st[ctx.me].fire = true) : ctx.send({ f: 1 }); };
    addEventListener('keydown', kd); const pd = e => { if (e.button === 0 && !e.target.closest?.('button,input')) kd({ code: 'Space' }); }; addEventListener('pointerdown', pd);
    const pack = () => ({ p: A.pack(), b: balls.map(b => [+b.x.toFixed(2), +b.z.toFixed(2)]), h: hp });
    let snap = pack();
    function step(dt) {
      time += dt;
      A.bots(dt, (id, s, sk) => {
        let b = null, bd = 1e9; for (const o of ids) { if (o === id || !st[o].alive) continue; const d = Math.hypot(st[o].x - s.x, st[o].z - s.z); if (d < bd) { bd = d; b = st[o]; } }
        if (!b) return null; if (bd < 4 + 7 * sk && Math.random() < .35 + .55 * sk) s.fire = true;
        return Math.hypot(s.x, s.z) > 10 ? [-s.x, -s.z] : bd < 4 ? [s.x - b.x + (s.z - b.z) * .6, s.z - b.z - (s.x - b.x) * .6] : [b.x - s.x, b.z - s.z];
      });
      A.move(dt);
      for (const id of ids) {
        const s = st[id]; if (!s.alive) continue; cd[id] -= dt;
        if (Math.hypot(s.ix, s.iz) > .1) { s.fx = s.ix; s.fz = s.iz; }
        if (s.fire && cd[id] <= 0) { cd[id] = .5; balls.push({ o: id, x: s.x + s.fx, z: s.z + s.fz, vx: s.fx * 16, vz: s.fz * 16, t: 1.3 }); }
        s.fire = false;
      }
      balls = balls.filter(b => {
        b.x += b.vx * dt; b.z += b.vz * dt; if ((b.t -= dt) <= 0 || Math.hypot(b.x, b.z) > 12.5) return false;
        for (const id of ids) { const s = st[id]; if (s.alive && id !== b.o && Math.hypot(s.x - b.x, s.z - b.z) < .8) { if (--hp[id] <= 0) { s.alive = false; out.push(id); } return false; } }
        return true;
      });
      const al = ids.filter(id => st[id].alive);
      if (al.length <= (ids.length > 1 ? 1 : 0) || time > 60) { over = true; ctx.send(pack()); ctx.finish([...al, ...out.reverse()]); }
    }
    return {
      update(dt) {
        A.input();
        if (host) { if (!over) step(dt); snap = pack(); if ((acc += dt) >= .05) { acc = 0; ctx.send(snap); } }
        A.show(snap.p);
        for (const id of ids) {
          const q = snap.p[id]; if (hpPrev[id] > snap.h[id]) { sfx('hit'); W.burst(q[0], 1, q[1], '#ffffff', 12); } hpPrev[id] = snap.h[id];
          if (was[id] && !q[2]) sfx('fall'); was[id] = q[2];
        }
        while (bm.length < snap.b.length) { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(.3, 0), new THREE.MeshBasicMaterial({ color: 0xffffff })); S.root.add(m); bm.push(m); }
        bm.forEach((m, i) => { const b = snap.b[i]; m.visible = !!b; if (b) m.position.set(b[0], 1, b[1]); });
        el.innerHTML = ids.map(id => `<div style="color:${ctx.players[id].color}">${ctx.esc(ctx.players[id].name)} ${'❤'.repeat(Math.max(0, snap.h[id]))}</div>`).join('');
      },
      onMessage(m, from) { if (A.onInput(m, from)) return; if (host) { if (m.f && st[from]) st[from].fire = true; } else if (m.p) snap = m; },
      cleanup() { removeEventListener('keydown', kd); removeEventListener('pointerdown', pd); A.cleanup(); bm.forEach(m => W.scene.remove(m)); el.remove(); },
    };
  },
};
