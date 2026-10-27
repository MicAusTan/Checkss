import * as THREE from 'three';
import { sfx } from '../sfx.js';
import { arena } from './arena.js';
import { topDown, ringPts, pine } from './kit.js';
import { teams } from './util.js';
// Set: a medieval battlefield. A castle tower and banner wall stand behind each team's base (red left, blue right), with tents, haystacks
// and trees around the field and a stone plinth under the flag in the middle.
// TEAM capture the flag: grab the center flag and carry it to your base (red = left, blue = right).
// Touching an enemy carrier sends the flag back to the center and stuns them. First to 3 captures.
const BASE = [{ x: -9, z: 0 }, { x: 9, z: 0 }];
export default {
  team: true,
  name: 'Flag Rush', desc: 'TEAM GAME! Grab the flag (it respawns somewhere random) and carry it to your base (🔴 left / 🔵 right). Touch an enemy carrier to knock the flag loose. First to 3! WASD to move, F / Shift / click to shove.',
  create(ctx) {
    const team = teams(ctx), W = ctx.world, A = arena(ctx, { shove: true, set: { ...topDown(W, 17, 22), sky: 0x9fd8ff, fog: { color: 0x9fd8ff, near: 55, far: 125 }, light: 1.15, sun: { intensity: 1.2, pos: [-6, 16, 8] } } }), { ids, st, S } = A, host = ctx.isHost;
    const el = document.createElement('div'); el.className = 'mg'; ctx.hud.append(el);
    const mk = (col, x, z, r) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, .06, 20), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: .5 })); m.position.set(x, .06, z); S.root.add(m); return m; };
    const objs = [mk(0xe74c3c, BASE[0].x, 0, 2.5), mk(0x3498db, BASE[1].x, 0, 2.5)];
    S.cyl(12.4, 12.8, .5, 0x6fae4c, 0, -.5, 0, { seg: 32 }); S.cyl(34, 34, .5, 0x5a9a40, 0, -.9, 0, { seg: 32 }); S.cyl(1.5, 1.7, .3, 0x8a8a95, 0, 0, 0, { seg: 12 });
    [[-1, 0xc0392b], [1, 0x2980b9]].forEach(([sd, col]) => {
      const x = sd * 16.5; S.cyl(2.3, 2.6, 7, 0x9a9aa5, x, 0, 0, { seg: 10 }); S.cyl(2.8, 2.8, .8, 0x8a8a95, x, 7, 0, { seg: 10 }); S.cone(3.1, 3.2, col, x, 7.8, 0, { seg: 10 });
      S.cyl(.06, .06, 2, 0x555555, x, 11, 0, { seg: 5 }); S.box(1.4, .9, .06, col, x + .75, 12, 0);
      for (const z of [-6.5, 6.5]) { S.box(1.4, 3.2, 6, 0x9a9aa5, x, 0, z); for (let k = 0; k < 3; k++) S.box(1.4, .7, 1, 0x9a9aa5, x, 3.2, z - 2 + k * 2); }
      for (let k = 0; k < 4; k++) S.box(.1, 2.2, 1.1, col, x - sd * .8, 3, -4.5 + k * 3, { ry: sd * .15 });
    });
    ringPts(6, 14.8, .45).forEach(([x, z], k) => { if (Math.abs(x) > 9) return; S.cone(2.2, 2.4, [0xd8a24a, 0xc0504d, 0x6a9a4a][k % 3], x, 0, z, { seg: 6 }); });
    ringPts(7, 13.8, .2).forEach(([x, z]) => S.cyl(.9, .9, .9, 0xd8b24a, x, 0, z, { seg: 10 }));
    ringPts(18, 24, .2).forEach(([x, z], k) => pine(S, x, z, 1.2 + k % 3 * .2, 0x2f7d3a));
    const flagM = new THREE.Mesh(new THREE.ConeGeometry(.5, 1.2, 4), new THREE.MeshBasicMaterial({ color: 0xffd93d })); S.root.add(flagM); objs.push(flagM);
    const cnt = [0, 0]; ids.forEach(id => { const t = team(id), n = ids.filter(k => team(k) === t).length, k = cnt[t]++; st[id].x = t ? 6 : -6; st[id].z = (k - (n - 1) / 2) * 2.5; });
    const stun = {}; ids.forEach(id => stun[id] = 0);
    const spawn = () => { const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 7; return { x: Math.sin(a) * r, z: Math.cos(a) * r, by: null }; };   // random spot each time: nobody can camp the middle
    let flag = spawn(), score = [0, 0], time = 0, acc = 0, over = false, ev = [0, 0], prevEv = [0, 0], lt = 0;
    const pack = () => ({ p: A.pack(), f: [+flag.x.toFixed(2), +flag.z.toFixed(2), flag.by], s: score, e: ev });
    let snap = pack();
    function step(dt) {
      time += dt;
      for (const id of ids) { stun[id] -= dt; st[id].sp = stun[id] > 0 ? 0 : id === flag.by ? .85 : 1; }
      A.bots(dt, (id, s, sk) => {
        const t = team(id), toward = (x, z) => [x - s.x, z - s.z];
        if (flag.by === id) return toward(BASE[t].x, BASE[t].z);
        if (!flag.by) {
          const mates = ids.filter(o => team(o) === t && o !== id), nearer = mates.some(o => ctx.players[o]?.bot && Math.hypot(st[o].x - flag.x, st[o].z - flag.z) < Math.hypot(s.x - flag.x, s.z - flag.z) - 1.5);
          return nearer && sk > .4 ? toward(flag.x * .5 + BASE[1 - t].x * .3, flag.z * .5) : toward(flag.x, flag.z);   // smarter bots let a nearer teammate fetch it
        }
        const c = st[flag.by];
        if (team(flag.by) === t) return toward(c.x + (BASE[1 - t].x - c.x) * .25, c.z * .6);   // escort: run interference ahead of the carrier
        return toward(c.x, c.z);
      });
      A.move(dt);
      if (flag.by && st[flag.by].hit > .2) { stun[flag.by] = .8; flag = { x: st[flag.by].x, z: st[flag.by].z, by: null }; ev[0]++; }   // a good shove knocks the flag loose
      if (flag.by) {
        const c = st[flag.by], t = team(flag.by); flag.x = c.x; flag.z = c.z;
        const tagger = ids.find(id => team(id) !== t && stun[id] <= 0 && Math.hypot(st[id].x - c.x, st[id].z - c.z) < 1.1);
        if (tagger || c.hit > .1) { stun[flag.by] = tagger ? 1.2 : .7; flag = { x: c.x, z: c.z, by: null }; ev[0]++; }       // tagged or shoved: the flag drops where it happened
        else if (Math.hypot(c.x - BASE[t].x, c.z - BASE[t].z) < 2.5) { score[t]++; flag = spawn(); ev[1]++; }
      } else { const g = ids.find(id => stun[id] <= 0 && Math.hypot(st[id].x - flag.x, st[id].z - flag.z) < 1.2); if (g) flag.by = g; }
      if (score[0] >= 3 || score[1] >= 3 || time > 50) {
        over = true; snap = pack(); ctx.send(snap); const w = score[0] > score[1] ? 0 : score[1] > score[0] ? 1 : -1;
        const pl = [...ids].sort((a, b) => (team(b) === w) - (team(a) === w)); ctx.finish(pl, pl.map(id => w < 0 ? 0 : team(id) === w ? 0 : 1));
      }
    }
    return {
      update(dt) {
        A.input(); lt += dt;
        if (host) { if (!over) step(dt); snap = pack(); if ((acc += dt) >= .05) { acc = 0; ctx.send(snap); } }
        A.show(snap.p);
        if (snap.e[0] > prevEv[0]) sfx('hit'); if (snap.e[1] > prevEv[1]) sfx('star'); prevEv = [...snap.e];
        const g = snap.f[2] && W.m.get(snap.f[2])?.g; flagM.position.set(g ? g.position.x : snap.f[0], g ? 2.6 + Math.sin(lt * 6) * .1 : 1 + Math.sin(lt * 3) * .15, g ? g.position.z : snap.f[1]); flagM.rotation.y += dt * 3;
        const mine = team(ctx.me), names = t => ids.filter(id => team(id) === t).map(id => ctx.esc(ctx.players[id].name)).join(', ');
        el.innerHTML = `<h3>🔴 ${snap.s[0]} - ${snap.s[1]} 🔵</h3><div style="font-size:13px">🔴 ${names(0)}<br>🔵 ${names(1)}</div><div>You: ${mine ? '🔵 Blue (base right)' : '🔴 Red (base left)'}</div>`;
      },
      onMessage(m, from) { if (A.onInput(m, from)) return; if (!host && m.p) snap = m; },
      cleanup() { A.cleanup(); objs.forEach(m => W.scene.remove(m)); el.remove(); },
    };
  },
};
