import * as THREE from 'three';
import { sfx } from '../sfx.js';
import { arena } from './arena.js';
import { topDown, ringPts, crowdRing } from './kit.js';
// Set: a colosseum. A sand arena ringed by stepped stands full of cheering spectators, banners on the wall, and a tall beam of light
// over the zone (gold = empty, green = one player scoring, red = contested).
// King of the hill: the zone moves every 7s. Only a player ALONE in the zone scores (2/s). Shove rivals out!
export default {
  name: 'Hill Hold', desc: 'Stand alone in the glowing zone to score. If two players share it, nobody scores! The zone moves. WASD to move. F / Shift / click shoves nearby players out of the zone.',
  create(ctx) {
    const W = ctx.world, A = arena(ctx, { shove: true, set: { ...topDown(W, 15.5, 21), sky: 0xe8c58a, fog: { color: 0xe8c58a, near: 55, far: 120 }, light: 1.1, sun: { color: 0xfff0d0, intensity: 1.2, pos: [-6, 16, 8] } } }), { ids, st, S } = A, host = ctx.isHost;
    const el = document.createElement('div'); el.className = 'mg'; ctx.hud.append(el);
    S.cyl(13.2, 13.2, .5, 0xe3c88f, 0, -.5, 0, { seg: 40 }); S.cyl(11.4, 11.4, .03, 0xd2b077, 0, 0, 0, { seg: 40 }); S.cyl(6.2, 6.2, .035, 0xe9d3a0, 0, 0, 0, { seg: 40 });
    S.root.add(new THREE.Mesh(new THREE.LatheGeometry([[13.2, -.5], [13.2, 2], [15.6, 2], [15.6, 4], [18, 4], [18, 6], [20.4, 6], [20.4, -.5]].map(p => new THREE.Vector2(...p)), 48), new THREE.MeshStandardMaterial({ color: 0xc9b48c, flatShading: true, side: THREE.DoubleSide })));
    crowdRing(S, [[14.4, 2.4, 56], [16.8, 4.4, 66], [19.2, 6.4, 76]]);
    ringPts(10, 13.1).forEach(([x, z, a], k) => S.box(.9, 1.7, .08, [0xc0392b, 0x2980b9, 0xf1c40f][k % 3], x, .4, z, { ry: a }));
    ringPts(4, 13.3, .78).forEach(([x, z]) => { S.cyl(.35, .4, 2.6, 0x555555, x, 0, z, { seg: 8 }); S.cone(.5, 1, 0xff9f1a, x, 2.6, z, { basic: true, seg: 6 }); });   // braziers
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, .06, 24), new THREE.MeshBasicMaterial({ color: 0xffd93d, transparent: true, opacity: .55 })); ring.position.y = .06; S.root.add(ring);
    const beam = S.cone(2.8, 9, 0xffd93d, 0, 0, 0, { basic: true, op: .16, seg: 20 });
    const score = {}; ids.forEach(id => score[id] = 0);
    let zone = { x: 0, z: 0, t: 7 }, time = 0, acc = 0, over = false, prev = 0, state = 0;
    const pack = () => ({ p: A.pack(), z: [+zone.x.toFixed(2), +zone.z.toFixed(2)], s: score, t: +time.toFixed(1), c: state });
    let snap = pack();
    function step(dt) {
      time += dt; zone.t -= dt;
      A.bots(dt, (id, s, sk) => { const dx = zone.x - s.x, dz = zone.z - s.z, d = Math.hypot(dx, dz); if (d < 1.2 && sk < .6) return null; return d < 1.2 ? [-dz * .02, dx * .02 + .1] : [dx, dz]; });
      A.move(dt);
      const al = ids.filter(id => st[id].alive);
      for (let i = 0; i < al.length; i++) for (let j = i + 1; j < al.length; j++) {            // soft bumping so zone fights matter
        const a = st[al[i]], b = st[al[j]], dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
        if (d < 1.1 && d > .001) { const o = (1.1 - d) / 2 + .05; a.x -= dx / d * o; a.z -= dz / d * o; b.x += dx / d * o; b.z += dz / d * o; }
      }
      if (zone.t <= 0) { const a = Math.random() * 6.28, r = Math.sqrt(Math.random()) * 8; zone = { x: Math.sin(a) * r, z: Math.cos(a) * r, t: 7 }; }
      const inside = ids.filter(id => Math.hypot(st[id].x - zone.x, st[id].z - zone.z) < 3);
      state = inside.length === 1 ? 1 : inside.length > 1 ? 2 : 0;
      if (inside.length === 1) score[inside[0]] += 2 * dt;
      if (time >= 40 || ids.some(id => score[id] >= 40)) { over = true; snap = pack(); ctx.send(snap); ctx.finish([...ids].sort((a, b) => score[b] - score[a])); }
    }
    return {
      update(dt) {
        A.input();
        if (host) { if (!over) step(dt); snap = pack(); if ((acc += dt) >= .05) { acc = 0; ctx.send(snap); } }
        A.show(snap.p); ring.position.x = snap.z[0]; ring.position.z = snap.z[1]; beam.position.set(snap.z[0], 4.5, snap.z[1]);
        ring.material.color.set(snap.c === 1 ? 0x2ecc71 : snap.c === 2 ? 0xff3b30 : 0xffd93d); beam.material.color.copy(ring.material.color);
        const mine = Math.floor(snap.s[ctx.me]); if (mine > prev) sfx('click'); prev = mine;
        el.innerHTML = `<h2>${Math.max(0, Math.ceil(40 - snap.t))}</h2>` + ids.map(id => `<div class="bar"><span style="width:${Math.min(100, snap.s[id] / 40 * 100)}%;background:${ctx.players[id].color}"></span><b>${ctx.esc(ctx.players[id].name)} ${Math.floor(snap.s[id])}</b></div>`).join('');
      },
      onMessage(m, from) { if (A.onInput(m, from)) return; if (!host && m.p) snap = m; },
      cleanup() { A.cleanup(); W.scene.remove(ring); el.remove(); },
    };
  },
};
