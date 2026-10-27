import * as THREE from 'three';
import { teams } from './util.js';
import { sfx } from '../sfx.js';
import { stage, fitDist } from './stage.js';
// Teams alternate by join order (red / blue). Mash to pull the rope to your side. Host owns the rope.
// Set: two grassy cliffs with a mud pit between them. Red stands on the right, blue on the left; the whole line
// slides toward the winner, and when the rope is decided the losing team gets dragged into the mud.
const SHIFT = 4;   // how far the teams slide at r = +-1
export default {
  team: true,
  name: 'Tug of War', desc: 'Two teams! Mash SPACE (or click) to pull the rope to your side.',
  create(ctx) {
    const ids = Object.keys(ctx.players), host = ctx.isHost, team = teams(ctx), size = [0, 1].map(t => ids.filter(id => team(id) === t).length);   // teams() first: it uses the shared rng
    const W = ctx.world, presses = {}; ids.forEach(id => presses[id] = 0);
    let r = 0, time = 0, acc = 0, over = false, fin = null, tt = 0; const kick = {};
    const el = document.createElement('div'); el.className = 'mg'; ctx.hud.append(el);
    const pull = id => { if (over || !(id in presses)) return; presses[id]++; r = Math.max(-1, Math.min(1, r + (team(id) ? -1 : 1) * .04 / Math.max(1, size[team(id)]))); };
    const press = () => { if (over) return; sfx('click'); kick[ctx.me] = 1; host ? pull(ctx.me) : ctx.send({ press: 1 }); };
    const key = e => { if (e.code === 'Space' && !e.repeat) press(); };
    addEventListener('keydown', key); addEventListener('pointerdown', press);
    const names = t => ids.filter(id => team(id) === t).map(id => ctx.esc(ctx.players[id].name)).join(', ') || '-';

    // ---------- the set ----------
    const dist = fitDist(W, 14.8, 17.5);
    const S = stage(ctx, { light: 1.1, sun: { intensity: 1.2, pos: [6, 14, 8] }, cam: { pos: [0, 6, dist], look: [0, .6, 0] }, camFrom: [0, 11, dist + 11], camT: 1.4 });
    for (const sd of [-1, 1]) { S.box(40, .8, 40, 0x6fa34a, sd * 23, -.8, 0); S.box(40, 3, 40, 0x7a5a3a, sd * 23, -3.8, 0); }          // the two cliffs (inner edges at x = +-3)
    S.box(6, .8, 14.5, 0x6fa34a, 0, -.8, -12.75); S.box(6, .8, 14.5, 0x6fa34a, 0, -.8, 12.75);                                     // ground behind / in front of the pit
    S.box(6, 3.8, .6, 0x6b4d30, 0, -3.8, -5.2); S.box(6, 3.8, .6, 0x6b4d30, 0, -3.8, 5.2); S.box(6, .2, 10, 0x5b3d22, 0, -2, 0);   // pit walls + mud
    const bub = []; for (let i = 0; i < 8; i++) bub.push(S.sph(.22, 0x7a5430, (i - 3.5) * .6, -1.75, (i % 3 - 1) * 1.6, { seg: 6 }));
    for (let i = 0; i < 7; i++) S.cone(7 + i % 3 * 2, 5 + i % 4 * 2, i % 2 ? 0x4f8a3a : 0x5a9a42, -42 + i * 14, 0, -34, { seg: 7 });   // hills
    for (let i = 0; i < 16; i++) { const x = -34 + i * 4.6 + (i % 3), z = -12 - (i * 7 % 11); S.cyl(.25, .3, 1.4, 0x6b4a2b, x, 0, z, { seg: 6 }); S.cone(1.5, 3.4, 0x2f7d3a, x, 1.2, z, { seg: 7 }); }
    for (let i = 0; i < 5; i++) { const c = S.sph(1, 0xffffff, -24 + i * 12, 14 + i % 2 * 3, -26, { seg: 7 }); c.scale.set(3.2, .9, 1.4); }
    S.box(.18, 3.2, .18, 0xffffff, 4, 0, 2); S.box(1, .6, .08, 0xe74c3c, 4.5, 2.5, 2); S.box(.18, 3.2, .18, 0xffffff, -4, 0, 2); S.box(1, .6, .08, 0x3498db, -4.5, 2.5, 2);   // win posts
    S.box(8, .02, .5, 0xe74c3c, 9, 0, 2.6, { op: .5 }); S.box(8, .02, .5, 0x3498db, -9, 0, 2.6, { op: .5 });                        // team-coloured ground strips
    const rope = S.box(1, .14, .14, 0xb07a3a, 0, .75, 0), flagG = new THREE.Group(); S.root.add(flagG);
    S.cyl(.04, .04, 1, 0xffffff, 0, .9, 0, { p: flagG }); S.box(.5, .3, .05, 0xffffff, .25, 1.55, 0, { p: flagG });

    const byTeam = [[], []], idx = {}; ids.forEach(id => byTeam[team(id)].push(id)); byTeam.forEach(a => a.forEach((id, i) => idx[id] = i));
    const baseX = id => (team(id) ? -1 : 1) * (5 + idx[id] * 1.5), faceY = id => team(id) ? Math.PI / 2 : -Math.PI / 2;     // red (team 0) right, blue left
    ids.forEach(id => W.put(id, baseX(id), -.55, faceY(id)));
    const lf = {}; let splashed = false;
    const startFin = win => { if (fin) return; fin = { win, t: 0, cheered: -9 }; };

    S.anim(dt => {
      tt += dt; const sh = r * SHIFT;
      const xr = 5 + (Math.max(1, byTeam[0].length) - 1) * 1.5 + .7 + sh, xb = -(5 + (Math.max(1, byTeam[1].length) - 1) * 1.5 + .7) + sh;
      rope.scale.x = Math.max(.1, xr - xb); rope.position.x = (xr + xb) / 2; flagG.position.x = sh;
      bub.forEach((b, i) => { const k = Math.abs(Math.sin(tt * 1.3 + i * 1.7)); b.position.y = -1.75 + k * .3; b.scale.setScalar(.5 + k * .8); });
      if (fin) fin.t += dt;
      for (const id of ids) {
        if (!W.m.has(id)) continue;
        const loser = fin && team(id) !== fin.win;
        if (!loser) {
          W.warp(id, baseX(id) + sh, -.55);
          if (fin) { W.lean(id, 0); if (fin.t > .4 && tt - fin.cheered > 2.4) { W.emote(id, 'cheer'); if (idx[id] === 0) fin.cheered = tt; } }
          else { const adv = team(id) ? -r : r; W.lean(id, -.28 - .15 * adv + Math.sin(tt * 11 + idx[id] * 1.7) * .1 - (kick[id] || 0) * .25); kick[id] = Math.max(0, (kick[id] || 0) - dt * 6); }
        } else {                                                    // dragged into the pit one by one, then sinks in the mud
          const L = lf[id] ??= { x: baseX(id) + sh, y: 0, vy: 0, landed: false }, g = W.m.get(id).g;
          if (fin.t > .3 + idx[id] * .12) {
            const cnt = byTeam[team(id)].length, tx = (idx[id] - (cnt - 1) / 2) * .9;
            L.x += (tx - L.x) * Math.min(1, dt * 4);
            if (Math.abs(L.x) < 2.4 && !L.landed) { L.vy += 28 * dt; L.y -= L.vy * dt; if (L.y <= -1.75) { L.y = -1.75; L.landed = true; W.burst(L.x, -1.6, -.55, '#6b4a2b', 14); if (!splashed) { splashed = true; sfx('lose'); W.shake(.14, .22); } } }
            else if (L.landed) L.y = Math.max(-2.1, L.y - .5 * dt);
          }
          W.warp(id, L.x, -.55); g.position.y = L.y; W.lean(id, .5);
        }
      }
    });

    return {
      update(dt) {
        time += dt;
        if (host && !over) { const ba = ctx._ba ??= {}; for (const id of ids) if (ctx.players[id].bot) { const br = ctx._br ??= {}; br[id] ??= (2.4 + 5 * (ctx.skill?.(id) ?? .5)) * (.85 + Math.random() * .3); ba[id] = (ba[id] || 0) + dt * br[id]; while (ba[id] >= 1) { ba[id]--; pull(id); } } }
        if (host && !over) {
          if ((acc += dt) > .1) { acc = 0; ctx.send({ r }); }
          if (Math.abs(r) >= 1 || time > 25) {
            over = true;
            const sum = t => ids.filter(id => team(id) === t).reduce((a, id) => a + presses[id], 0);
            const win = r > 0 ? 0 : r < 0 ? 1 : (sum(0) >= sum(1) ? 0 : 1);
            ctx.send({ r, end: 1, win }); startFin(win);
            const order = [...ids].sort((a, b) => (team(b) === win) - (team(a) === win) || presses[b] - presses[a]);
            S.after(2.6, () => ctx.finish(order));                  // let everyone watch the losers take a mud bath
          }
        }
        el.innerHTML = `<h3>You: Team ${team(ctx.me) ? '🔵 Blue' : '🔴 Red'}</h3>` +
          `<div style="position:relative;height:26px;border-radius:13px;background:linear-gradient(90deg,#3498db,#e74c3c)"><i style="position:absolute;top:-4px;left:calc(${(r + 1) * 50}% - 6px);width:12px;height:34px;background:#fff;border-radius:4px"></i></div>` +
          `<div style="display:flex;justify-content:space-between;font-size:13px"><span>🔵 ${names(1)}</span><span>🔴 ${names(0)}</span></div><div>MASH!</div>`;
      },
      onMessage(m, from) { if (host) { if (m.press) pull(from); } else if (m.r != null) { r = m.r; if (m.end) startFin(m.win | 0); } },
      cleanup() { removeEventListener('keydown', key); removeEventListener('pointerdown', press); el.remove(); S.cleanup(); },
    };
  },
};
