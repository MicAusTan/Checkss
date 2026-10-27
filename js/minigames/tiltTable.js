import * as THREE from 'three';
import { sfx } from '../sfx.js';
import { arena } from './arena.js';
// CO-OP. Set: a round wooden table balanced on one pillar in a calm sunset sea. A big ball rolls on it, and the table tips toward the
// side where the crowd is standing (the ball rolls downhill = towards your centre of mass). Walk to the OPPOSITE side to bring it back.
// Everyone shares the result: survive the whole time for gold, less for silver / bronze.
const R = 10, DUR = 40, TIER = [DUR, 28, 16], NAMES = ['GOLD', 'SILVER', 'BRONZE', 'It fell!'], K = .2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export default {
  coop: true,
  name: 'Tilt Table', desc: 'CO-OP! The table tips toward where you stand, and the ball rolls that way too. Spread out and walk to the OPPOSITE side to keep it on the table. WASD to move.',
  create(ctx) {
    const W = ctx.world, A = arena(ctx, { radius: 9.4, set: { sky: 0xffb48a, fog: { color: 0xffb48a, near: 55, far: 130 }, light: 1.05, sun: { color: 0xffd2a0, intensity: 1.2, pos: [-10, 14, 8] }, cam: { pos: [0, 15.5, 19], look: [0, 0, 0] }, camFrom: [0, 28, 32], camT: 1.4 } }), { ids, st, S } = A, host = ctx.isHost, n = ids.length;
    const el = document.createElement('div'); el.className = 'mg'; ctx.hud.append(el);

    // ---------- the set ----------
    S.cyl(90, 90, .5, 0x3f9fc9, 0, -9, 0, { seg: 40 }); S.cyl(1.6, 2.4, 8.6, 0x7a5a3a, 0, -8.6, 0, { seg: 10 }); S.cyl(2.8, 2.8, .5, 0x5a4028, 0, -.9, 0, { seg: 10 });
    const rock = S.cone(7, 6, 0x6b7280, 36, -8.5, -34, { seg: 6 }); S.cyl(1.6, 2, 9, 0xf3f0e8, 36, -3, -34, { seg: 10 }); S.cone(2.2, 2, 0xd9534f, 36, 6, -34, { seg: 10 }); S.sph(.8, 0xfff2a0, 36, 5.4, -34, { basic: true, seg: 8 });   // lighthouse
    S.sph(5, 0xfff2a0, -30, 12, -70, { basic: true });
    const buoys = []; for (let k = 0; k < 8; k++) { const a = k * 2.4 + .5, r = 22 + k % 3 * 7, x = Math.sin(a) * r, z = Math.cos(a) * r - 4; buoys.push(S.cyl(.5, .7, 1.3, k % 2 ? 0xe74c3c : 0xffffff, x, -9.2, z, { seg: 8 })); }
    const gulls = []; for (let k = 0; k < 5; k++) gulls.push(S.box(1.4, .08, .4, 0xffffff, 0, 8 + k, 0));
    S.anim((dt, tn) => { buoys.forEach((b, k) => { b.position.y = -8.6 + Math.sin(tn * 1.3 + k) * .25; b.rotation.z = Math.sin(tn + k * 2) * .15; }); gulls.forEach((g, k) => { const a = tn * .35 + k * 1.3, r = 20 + k * 3; g.position.set(Math.sin(a) * r, 9 + k * .9 + Math.sin(tn * 3 + k) * .3, Math.cos(a) * r - 8); g.rotation.y = a; g.rotation.z = Math.sin(tn * 6 + k) * .4; }); });
    const table = new THREE.Group(); S.root.add(table);
    S.cyl(R + .4, R + .4, .7, 0xb98a55, 0, -.7, 0, { seg: 40, p: table }); S.cyl(R, R, .06, 0xd7b078, 0, 0, 0, { seg: 40, p: table });
    for (const r of [3, 6.5, R - 1]) S.cyl(r + .15, r + .15, .08, 0xa4733f, 0, 0, 0, { seg: 40, p: table });
    for (let k = 0; k < 8; k++) S.box(R * 2 - 1, .07, .2, 0xa4733f, 0, .01, 0, { ry: k * Math.PI / 8, p: table });
    S.cyl(.9, .9, .1, 0xe74c3c, 0, .02, 0, { seg: 16, p: table });
    for (let k = 0; k < 24; k++) { const a = k / 24 * 6.283; S.box(.5, .5, .5, k % 2 ? 0xe74c3c : 0xf5f0e0, Math.sin(a) * (R + .3), 0, Math.cos(a) * (R + .3), { ry: a, p: table }); }   // rim blocks: the ball rolls over them and off
    const ball = S.sph(.9, 0xff5a5f, 0, 1, 0, { seg: 16 }); S.sph(.3, 0xffffff, .5, .5, .6, { p: ball, seg: 6 });

    // ---------- host simulation ----------
    ids.forEach(id => st[id].sp = .8);
    let b = { x: 1.6, z: -1.2, vx: 0, vz: 0 }, tilt = [0, 0], time = 0, nudgeT = 3, acc = 0, over = false, rk = null, ended = false, nudges = 0, seenN = 0;
    const wind = { a: 0, warn: 0, dur: 0 }; let windT = 6 + Math.random() * 3;
    const pack = () => ({ p: A.pack(), b: [+b.x.toFixed(2), +b.z.toFixed(2)], t: tilt.map(v => +v.toFixed(2)), s: +Math.min(DUR, time).toFixed(1), o: rk, nn: nudges, w: [+Math.sin(wind.a).toFixed(2), +Math.cos(wind.a).toFixed(2), wind.warn > 0 ? 1 : wind.dur > 0 ? 2 : 0] });
    let snap = pack();
    const wel = document.createElement('div'); wel.style.cssText = 'font-size:22px;font-weight:700;color:#7fdcff;text-shadow:0 2px 6px #000;margin-top:6px'; ctx.hud.append(wel); let prevW = 0;
    const tier = s => s >= TIER[0] ? 0 : s >= TIER[1] ? 1 : s >= TIER[2] ? 2 : 3;
    function finish(r) { if (over) return; over = true; rk = r; A.S.after(2.6, () => ctx.finish([...ids], ids.map(() => Math.min(r, n - 1)))); }
    function step(dt) {
      time += dt;
      A.bots(dt, (id, s, sk) => {
        if (Math.random() < .12 * (1.1 - sk)) return [Math.random() - .5, Math.random() - .5];          // bots slip up now and then
        const bl = Math.hypot(b.x, b.z), sp = Math.hypot(b.vx, b.vz);
        if (bl < 1.3 && sp < 1.6) { const a = ids.indexOf(id) / n * 6.283; return [Math.sin(a) * 3 - s.x, Math.cos(a) * 3 - s.z]; }      // ball is calm: spread out evenly
        const px = b.x + b.vx * .7, pz = b.z + b.vz * .7, pl = Math.hypot(px, pz) || 1, d = Math.min(7, 1.5 + pl * 1.1);
        return [-px / pl * d - s.x, -pz / pl * d - s.z];                                                                                  // stand opposite where the ball is heading
      });
      A.move(dt);
      let mx = 0, mz = 0; for (const id of ids) { mx += st[id].x; mz += st[id].z; } mx /= n; mz /= n;
      tilt = [clamp(mx / 5, -1.2, 1.2), clamp(mz / 5, -1.2, 1.2)];
      b.vx += (15 * tilt[0] - .8 * b.vx) * dt; b.vz += (15 * tilt[1] - .8 * b.vz) * dt;
      if (!over && (nudgeT -= dt) <= 0) { nudgeT = (2.2 + Math.random() * 1.8) * [1.3, 1, .75][ctx.diff ?? 1]; const a = Math.random() * 6.283, m = 3 + Math.min(2.5, time * .07); b.vx += Math.sin(a) * m; b.vz += Math.cos(a) * m; nudges++; }
      if (!wind.warn && !wind.dur && (windT -= dt) <= 0) { wind.a = Math.random() * 6.283; wind.warn = 1.2; }          // occasional gusts: a warning, then a steady shove on the ball
      else if (wind.warn > 0) { if ((wind.warn -= dt) <= 0) wind.dur = 1.6 + Math.random() * 1.6; }
      else if (wind.dur > 0) { const g = 8 + Math.min(6, time * .12); b.vx += Math.sin(wind.a) * g * dt; b.vz += Math.cos(wind.a) * g * dt; if ((wind.dur -= dt) <= 0) windT = 5 + Math.random() * 5; }
      b.x += b.vx * dt; b.z += b.vz * dt;
      if (!over) { if (Math.hypot(b.x, b.z) > R + .6) finish(tier(time)); else if (time >= DUR) finish(0); }
    }

    // ---------- rendering ----------
    const disp = [0, 0], surf = (x, z) => -(disp[0] * x + disp[1] * z) * K;
    return {
      update(dt) {
        A.input();
        if (host) { if (!over) step(dt); snap = pack(); if ((acc += dt) >= .05) { acc = 0; ctx.send(snap); } }
        A.show(snap.p);
        { const wv = snap.w?.[2] || 0; if (wv !== prevW) { prevW = wv; if (wv === 1) sfx('tick'); if (wv === 2) sfx('dash'); } const ar = ['⬆️', '↗️', '➡️', '↘️', '⬇️', '↙️', '⬅️', '↖️'][Math.round((Math.atan2(snap.w?.[0] ?? 0, -(snap.w?.[1] ?? 1)) / 6.283 * 8 + 8)) % 8]; wel.textContent = wv === 1 ? '💨 Wind incoming ' + ar : wv === 2 ? '💨 WIND ' + ar : ''; }
        disp[0] += (snap.t[0] - disp[0]) * Math.min(1, dt * 9); disp[1] += (snap.t[1] - disp[1]) * Math.min(1, dt * 9);
        table.rotation.set(K * disp[1], 0, -K * disp[0]);
        for (const id of ids) { const q = snap.p[id]; if (q) W.lift(id, surf(q[0], q[1])); }
        const r = Math.hypot(snap.b[0], snap.b[1]), fall = r > R ? (r - R) * (r - R) * .9 : 0;
        ball.position.set(snap.b[0], surf(snap.b[0], snap.b[1]) + .9 - fall, snap.b[1]); ball.rotation.x += dt * 3 * snap.b[1] * .1; ball.rotation.z -= dt * 3 * snap.b[0] * .1;
        if (snap.nn > seenN) { seenN = snap.nn; sfx('tick'); W.shake(.05, .15); }
        if (snap.o != null && !ended) { ended = true; ids.forEach(id => W.emote(id, snap.o < 3 ? 'cheer' : 'sad')); sfx(snap.o < 3 ? 'win' : 'lose'); if (snap.o === 3) W.burst(snap.b[0], -2, snap.b[1], '#9fd8ff', 24); }
        const edge = Math.min(1, r / R);
        el.innerHTML = snap.o != null ? `<h2>${snap.o < 3 ? '🏆 ' : ''}${NAMES[snap.o]}!</h2><div>Kept it up for ${snap.s}s</div>`
          : `<h2>${Math.max(0, Math.ceil(DUR - snap.s))}</h2><div class="bar"><span style="width:${edge * 100}%;background:${edge > .75 ? '#ff5a5f' : edge > .5 ? '#ffd166' : '#6fcf97'}"></span><b>Ball: ${edge > .75 ? 'DANGER' : edge > .5 ? 'drifting' : 'steady'}</b></div><div>Stand opposite the ball!</div>`;
      },
      onMessage(m, from) { if (A.onInput(m, from)) return; if (!host && m.p) snap = m; },
      cleanup() { wel.remove(); A.cleanup(); el.remove(); },
    };
  },
};
