import * as THREE from 'three';
import { sfx } from '../sfx.js';
import { arena } from './arena.js';
import { topDown } from './kit.js';
// Set: a sunny field with a giant guard robot at the finish line. On GREEN it faces away; on RED it spins round with glowing eyes and the
// sky flushes red. Traffic lights on both sides repeat the signal.
// Cross the field to the finish line. GREEN = run, RED = freeze (moving on red sends you back to the start).
export default {
  tiers: [{ n: 'Normal', m: 1, pen: 0 }, { n: 'Sudden', m: 1.5, pen: 2, d: 'Lights switch fast and without much warning; tiny grace time.' }],
  name: 'Red Light, Green Light', desc: 'Run the long course to the white line! On RED you must stand still - moving sends you back to the start. First across wins. WASD to move.',
  create(ctx) {
    const CD = 4, FIN = -118, CZ = (10 + FIN) / 2 - 2, LL = 10 - FIN + 14, ZD = FIN - 4.3;           // long course: start z = 8.5, finish line z = FIN
    const W = ctx.world, A = arena(ctx, { shove: true, radius: 90, set: { ...topDown(W, 13.5, 22, [0, 0, -1]), sky: 0x87ceeb, light: 1.15, sun: { intensity: 1.2, pos: [6, 16, 8] } } }), { ids, st, S } = A, host = ctx.isHost;
    const el = document.createElement('div'); el.className = 'mg'; ctx.hud.append(el);
    const line = new THREE.Mesh(new THREE.BoxGeometry(14, .05, .4), new THREE.MeshBasicMaterial({ color: 0xffffff })); line.position.set(0, .05, FIN); S.root.add(line);
    S.box(70, .5, LL + 24, 0x6fbf4a, 0, -.5, CZ); S.box(24, .04, LL - 4, 0x86d05a, 0, 0, CZ); S.box(24, .05, .3, 0xffffff, 0, .02, 9.8);
    for (let k = -2; k <= 2; k++) for (let j = 0; j < 52; j++) S.box(.1, .03, 1.4, 0xffffff, k * 4.4, .03, 6.5 - j * 2.4);                                                                  // lane dashes
    for (let k = 0; k < 40; k++) { const z = 11.5 - k * 3.5; [-13, 13].forEach(x => S.box(.2, 1.4, .2, 0x8a6a3a, x, 0, z)); } S.box(.15, .15, LL + 12, 0x8a6a3a, -13, .9, CZ + 1); S.box(.15, .15, LL + 12, 0x8a6a3a, 13, .9, CZ + 1);
    for (let k = 0; k < 8; k++) { const z = 3 - k * 18; S.cyl(.4, .5, 3, 0x8a6a3a, -15.5, 0, z, { seg: 6 }); S.sph(1.6, 0x3f9a3a, -15.5, 4, z); S.cyl(.4, .5, 3, 0x8a6a3a, 15.5, 0, z - 9, { seg: 6 }); S.sph(1.6, 0x3f9a3a, 15.5, 4, z - 9); }
    S.box(3.6, 3.2, 2.4, 0x9aa3b2, 0, 0, ZD); S.box(.9, 1.2, .9, 0x6b7280, -1, 0, ZD); S.box(.9, 1.2, .9, 0x6b7280, 1, 0, ZD); S.box(4.4, .5, 2.8, 0x6b7280, 0, 3.2, ZD);
    const headG = new THREE.Group(); headG.position.set(0, 5.2, ZD); S.root.add(headG); S.sph(1.35, 0xcfd6e0, 0, 0, 0, { p: headG }); S.box(1.9, .5, .3, 0x222831, 0, .1, 1.15, { p: headG });
    const eyes = [-.5, .5].map(x => S.sph(.2, 0x330000, x, .2, 1.25, { p: headG, basic: true, seg: 8 })); S.cyl(.06, .06, .8, 0x6b7280, 0, 1.3, 0, { p: headG }); const bulb = S.sph(.2, 0xff3b30, 0, 2.2, 0, { p: headG, basic: true, seg: 8 });
    const lamps = [-1, 1].map(sd => { S.cyl(.12, .14, 5, 0x333333, sd * 9.5, 0, (FIN - .5), { seg: 6 }); S.box(1, 2.2, .8, 0x1a1a1a, sd * 9.5, 5, (FIN - .5)); return [S.sph(.32, 0xff3b30, sd * 9.5, 6, (FIN - .1), { basic: true, seg: 8 }), S.sph(.32, 0x2ecc71, sd * 9.5, 5.2, (FIN - .1), { basic: true, seg: 8 })]; });
    ids.forEach((id, k) => { st[id].x = -5 + 10 * (k + .5) / ids.length; st[id].z = 8.5; });
    const home = {}; ids.forEach(id => home[id] = st[id].x);
    let cz = 0, ct = 0, redAt = 0, red = false, phaseT = 2.5, grace = 0, fin = [], time = 0, acc = 0, over = false, back = 0, prevBack = 0, prevRed = false;
    const pack = () => ({ c: Math.max(0, Math.ceil(CD - time)), p: A.pack(), r: red ? 1 : 0, f: fin, b: back });
    let snap = pack();
    function step(dt) {
      time += dt; if (time < CD) { for (const id of ids) st[id].ix = st[id].iz = 0; return; }       // 3-2-1 countdown: nobody can move yet
      phaseT -= dt;
      A.bots(dt, (id, s, sk) => red || fin.includes(id) ? null : [(home[id] - s.x) * .2, -1]);
      for (const id of ids) {                                            // bots: each has its own pace and reaction time to the light (slow ones get caught)
        const s = st[id]; if (!ctx.players[id]?.bot || fin.includes(id)) continue; const sk = ctx.skill?.(id) ?? .5;
        s.sp = (.7 + .3 * (s.aggr ?? .5)) * (.8 + .25 * sk);
        if (red && time - redAt > (s.rt ??= (.08 + Math.random() * .75) * (1.3 - sk))) s.ix = s.iz = 0;
        if (!red) s.rt = null;
      }
      A.move(dt);
      for (const id of ids) { const s = st[id]; s.x = Math.max(-12, Math.min(12, s.x)); s.z = Math.min(10, s.z); }
      if (phaseT <= 0) { red = !red; const H = ctx.diff === 1; if (red) { phaseT = H ? 1 + Math.random() * 1.3 : 1.4 + Math.random() * 1.6; grace = H ? .2 : .4; redAt = time; } else phaseT = H ? (Math.random() < .25 ? .35 + Math.random() * .4 : .9 + Math.random() * 1.9) : 1.8 + Math.random() * 2.5; }
      if (red) grace -= dt;
      for (const id of ids) {
        const s = st[id]; if (fin.includes(id)) { s.ix = s.iz = 0; s.sp = 0; continue; }
        if (red && grace <= 0 && Math.abs(s.ix) + Math.abs(s.iz) > .1) { s.x = home[id]; s.z = 8.5; back++; }
        else if (s.z < FIN) fin.push(id);
      }
      if (fin.length >= ids.length || time > CD + 150) { over = true; snap = pack(); ctx.send(snap); ctx.finish([...fin, ...ids.filter(id => !fin.includes(id)).sort((a, b) => st[a].z - st[b].z)]); }
    }
    return {
      update(dt) {
        A.input();
        if (host) { if (!over) step(dt); snap = pack(); if ((acc += dt) >= .05) { acc = 0; ctx.send(snap); } }
        A.show(snap.p);
        if ((ct += dt) > 1.5) {                                          // camera follows YOU (after you finish: whoever is still in front of the pack)
          const left = ids.filter(id => !snap.f.includes(id)), tid = !snap.f.includes(ctx.me) || !left.length ? ctx.me : left.reduce((a, b) => (snap.p[a]?.[1] ?? 9) < (snap.p[b]?.[1] ?? 9) ? a : b), q = snap.p[tid] || [0, 8], tz = q[1] - 3;
          cz = ct < 1.6 ? tz : cz + (tz - cz) * Math.min(1, dt * 4); W.setCam([q[0] * .3, 11.5, cz + 12], [q[0] * .3, 0, cz - 2]);
        }
        if (snap.b > prevBack) sfx('lose'); prevBack = snap.b; if (!!snap.r !== prevRed) { prevRed = !!snap.r; sfx(snap.r ? 'hit' : 'go'); }
        W.scene.background.set(snap.r ? 0xd96b6b : 0x87ceeb);
        headG.rotation.y += ((snap.r ? 0 : Math.PI) - headG.rotation.y) * Math.min(1, dt * 9); eyes.forEach(e => e.material.color.setHex(snap.r ? 0xff2020 : 0x330000)); bulb.material.color.setHex(snap.r ? 0xff3b30 : 0x2ecc71);
        lamps.forEach(([r, g]) => { r.material.color.setHex(snap.r ? 0xff3b30 : 0x3a0f0f); g.material.color.setHex(snap.r ? 0x0f3a1a : 0x2ecc71); });
        el.innerHTML = snap.c > 0 ? `<h2>Get ready... ${snap.c}</h2><div>Stand still until GO!</div>` : `<h2 style="background:${snap.r ? '#e74c3c' : '#2ecc71'};border-radius:10px;padding:6px 20px">${snap.r ? '🛑 RED - FREEZE' : '🟢 GREEN - RUN'}</h2><div>Finished: ${snap.f.length}/${ids.length}</div>`;
      },
      onMessage(m, from) { if (A.onInput(m, from)) return; if (!host && m.p) snap = m; },
      cleanup() { A.cleanup(); el.remove(); },
    };
  },
};
