import * as THREE from 'three';
import { teams } from './util.js';
import { sfx } from '../sfx.js';
import { stage, fitDist } from './stage.js';
// TEAM game. Teams alternate by join order (red/blue). Only your team's current runner's presses count.
// Set: a stadium running track, one lane per team. Each teammate owns one leg: waiting runners stand at their start mark,
// the active runner sprints with the baton as presses come in, finished runners cheer at the hand-off. Winners break the tape.
// (This file also fixes a crash: a local `teams` array used to shadow the imported `teams()` helper, so the game threw on start.)
const LAP0 = 30, X0 = -16, X1 = 16, LZ = [-1.6, 1.6];       // presses per lap, track start/end, lane z for red / blue
const trackX = f => X0 + (X1 - X0) * f;
export default {
  team: true,
  tiers: [{ n: 'Short', m: .8, pen: 0, d: '20 presses per lap.' }, { n: 'Normal', m: 1, pen: 0, d: '30 presses per lap.', def: true }, { n: 'Long', m: 1.4, pen: 0, d: '45 presses per lap.' }],
  name: 'Relay Race', desc: `TEAM GAME! Only your team's current runner mashes SPACE (or click). ${LAP0} presses per lap (more or fewer by track length), then your teammate runs. First team done wins.`,
  create(ctx) {
    const LAP = [20, 30, 45][ctx.diff ?? 1];                         // track length (presses per lap)
    const ids = Object.keys(ctx.players), host = ctx.isHost, team = teams(ctx), roster = [0, 1].map(t => ids.filter(id => team(id) === t));
    let cur = [0, 0], prog = [0, 0], winner = null, time = 0, acc = 0, over = false, fin = null, tt = 0; const disp = [0, 0], kick = {};
    const W = ctx.world, el = document.createElement('div'); el.className = 'mg'; ctx.hud.append(el);
    const frac = t => roster[t].length ? (cur[t] + prog[t] / LAP) / roster[t].length : 0;
    const pull = id => { if (over) return; const t = team(id); if (roster[t][cur[t]] !== id) return; if (++prog[t] >= LAP) { prog[t] = 0; cur[t]++; if (cur[t] >= roster[t].length) winner = t; } };
    const press = () => { sfx('click'); kick[ctx.me] = 1; host ? pull(ctx.me) : ctx.send({ press: 1 }); };
    const key = e => { if (e.code === 'Space' && !e.repeat) press(); };
    addEventListener('keydown', key); addEventListener('pointerdown', press);

    // ---------- the set ----------
    const dist = fitDist(W, 18.5, 20);
    const S = stage(ctx, { light: 1.15, sun: { intensity: 1.2, pos: [-6, 16, 10] }, cam: { pos: [0, 8.5, dist], look: [0, .8, 0] }, camFrom: [0, 14, dist + 10], camT: 1.4 });
    S.box(110, .5, 70, 0x4f9a45, 0, -.5, 0); S.box(46, .12, 7.6, 0xb5523b, 0, 0, 0);
    for (const z of [-3.2, 0, 3.2]) S.box(46, .02, .12, 0xffffff, 0, .12, z, { basic: true });
    S.box(.3, .02, 7.6, 0xffffff, X0, .12, 0, { basic: true });
    for (let k = 0; k < 8; k++) for (let j = 0; j < 2; j++) S.box(.4, .02, .95, (k + j) % 2 ? 0x111111 : 0xffffff, X1 + (j - .5) * .4, .12, -3.4 + k * .95, { basic: true });    // finish line
    const tapes = LZ.map(z => S.box(.08, .08, 3, 0xffd93d, X1 - .3, 1.1, z, { basic: true }));
    const arrows = [0, 1].map(t => { const a = S.cone(.28, .6, t ? 0x3498db : 0xe74c3c, 0, 0, 0, { em: t ? 0x113355 : 0x551111 }); a.rotation.x = Math.PI; return a; });
    const batons = [0, 1].map(() => S.box(.9, .12, .12, 0xffd93d, 0, 0, 0, { em: 0x665500 }));
    for (let t = 0; t < 2; t++) for (let k = 1; k < roster[t].length; k++) S.cyl(.12, .12, .9, t ? 0x3498db : 0xe74c3c, trackX(k / roster[t].length), 0, LZ[t] + (t ? 1.1 : -1.1), { seg: 8 });   // hand-off markers
    for (let r = 0; r < 4; r++) { S.box(60, 1, 2.4, r % 2 ? 0x9aa0b8 : 0x8a8fa6, 0, r * 1.1, -8 - r * 2.4); }   // stands
    const crowd = new THREE.InstancedMesh(new THREE.SphereGeometry(.3, 6, 5), new THREE.MeshStandardMaterial({ color: 0xffffff }), 160), dm = new THREE.Object3D(), cc = new THREE.Color();
    for (let k = 0; k < 160; k++) { const r = k % 4; dm.position.set(-27 + (k * 7.3 % 54), r * 1.1 + 1.3, -8 - r * 2.4); dm.updateMatrix(); crowd.setMatrixAt(k, dm.matrix); crowd.setColorAt(k, cc.setHSL((k * .137) % 1, .6, .55)); }
    S.root.add(crowd);
    for (let k = 0; k < 6; k++) { S.cyl(.12, .15, 6, 0x666677, -26 + k * 10.4, 0, -4.5, { seg: 6 }); S.sph(.5, 0xfff2b0, -26 + k * 10.4, 6.2, -4.5, { basic: true }); }   // floodlights
    const sideZ = t => LZ[t] + (t ? 1.35 : -1.35);
    roster.forEach((r, t) => r.forEach((id, k) => W.put(id, trackX(k / r.length), sideZ(t), Math.PI / 2)));
    const startFin = w => { if (fin) return; fin = { win: w, t: 0 }; };

    S.anim((dt, tn) => {
      tt += dt; if (fin) fin.t += dt;
      for (let t = 0; t < 2; t++) {
        const r = roster[t], size = r.length; if (!size) continue;
        disp[t] += ((fin && fin.win === t ? 1 : frac(t)) - disp[t]) * Math.min(1, dt * 8);
        r.forEach((id, k) => {
          let x, z = sideZ(t), lean = 0;
          if (k === cur[t] && !(fin && fin.win === t)) { x = trackX(disp[t]); z = LZ[t]; lean = .38 + Math.sin(tn * 15 + k) * .08 + (kick[id] || 0) * .15; kick[id] = Math.max(0, (kick[id] || 0) - dt * 5); }
          else if (k > cur[t]) x = trackX(k / size);
          else x = trackX((k + 1) / size) + .6;
          if (fin && fin.win === t) { x = trackX(Math.min(1, (k + 1) / size)) + (k === size - 1 ? 0 : .6); z = k === size - 1 ? LZ[t] : sideZ(t); lean = 0; if (fin.t > .3 && !W.m.get(id)?.emo && !W.m.get(id)?.hop) W.emote(id, 'cheer'); }
          if (fin && fin.win !== t) { lean = 0; if (fin.t > .3 && !W.m.get(id)?.emo) W.emote(id, 'sad'); }
          W.warp(id, x, z); const e = W.m.get(id); if (e && !e.emo) W.lean(id, lean);
          if (!(fin && fin.win === t) && k === cur[t]) { arrows[t].position.set(x, 2.8 + Math.sin(tn * 5) * .15, z); batons[t].position.set(x + .5, 1, z); }
        });
        arrows[t].visible = batons[t].visible = !fin && cur[t] < size;
        if (fin && fin.win === t && tapes[t].visible) { tapes[t].visible = false; W.burst(X1, 1.2, LZ[t], '#ffd93d', 24); W.shake(.1, .25); }
      }
    });

    return {
      update(dt) {
        time += dt;
        if (host && !over) { const ba = ctx._ba ??= {}; for (const id of ids) if (ctx.players[id].bot) { const br = ctx._br ??= {}; br[id] ??= (2.4 + 5 * (ctx.skill?.(id) ?? .5)) * (.85 + Math.random() * .3); ba[id] = (ba[id] || 0) + dt * br[id]; while (ba[id] >= 1) { ba[id]--; pull(id); } } }
        if (host && !over) {
          if ((acc += dt) > .1) { acc = 0; ctx.send({ c: cur, p: prog }); }
          if (winner !== null || time > 70) {
            if (winner === null) winner = frac(0) >= frac(1) ? 0 : 1;
            over = true; ctx.send({ c: cur, p: prog, end: 1, win: winner }); startFin(winner);
            const pl = [...ids].sort((a, b) => (team(b) === winner) - (team(a) === winner));
            S.after(2.4, () => ctx.finish(pl, pl.map(id => team(id) === winner ? 0 : 1)));     // let everyone see the tape break
          }
        }
        const mt = team(ctx.me), mineRun = roster[mt][cur[mt]] === ctx.me;
        el.innerHTML = `<h3>${mineRun ? '🏃 YOU\'RE RUNNING - MASH!' : 'Cheer on your team!'}</h3>` + [0, 1].map(t => {
          const run = roster[t][cur[t]]; return `<div class="bar"><span style="width:${Math.min(100, frac(t) * 100)}%;background:${t ? '#3498db' : '#e74c3c'}"></span><b>${t ? '🔵' : '🔴'} ${run ? '▶ ' + ctx.esc(ctx.players[run].name) : roster[t].length ? 'Finished!' : '-'}</b></div>`; }).join('') +
          `<div style="font-size:13px">You are ${team(ctx.me) ? '🔵 Blue' : '🔴 Red'}</div>`;
      },
      onMessage(m, from) { if (host) { if (m.press) pull(from); } else if (m.c) { cur = m.c; prog = m.p; if (m.end) startFin(m.win | 0); } },
      cleanup() { removeEventListener('keydown', key); removeEventListener('pointerdown', press); el.remove(); S.cleanup(); },
    };
  },
};
