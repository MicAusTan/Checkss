import { sfx } from '../sfx.js';
import { scoreboard, jit, mix } from './util.js';
import * as THREE from 'three';
import { stage, fitDist } from './stage.js';
import { share, nameplate } from './kit.js';
// Parkour Dash: everyone runs the same seeded course of floating platforms, each in their own lane. Jump the gaps, fall = back to the last checkpoint (+1.5s).
// Movement is simulated locally (like Maze Race); positions are shared ~12x/s. Bots are drawn running along the course from the scoreboard's progress.
const G = 30, JV = 11.2, SPD = 7.2, N_PL = 16, LANE = 1.7;
export default {
  tiers: [{ n: 'Normal', m: 1, pen: 0 }, { n: 'Hard', m: 1.5, pen: 2, d: 'Longer course, wider gaps, narrower platforms.' }],
  emotes: false, name: 'Parkour Dash', desc: 'Race across the floating platforms! A / D (or arrows) to run, SPACE / W to jump. Fall off and you restart at the last green checkpoint (+1.5s). Fastest time wins.',
  create(ctx) {
    const HARD = ctx.diff === 1, N_PL = HARD ? 21 : 16, ids = Object.keys(ctx.players), n = ids.length, me = ctx.me, W = ctx.world;
    const pl = [{ x0: -3, x1: 3, top: 0 }]; let cx = 3, cy = 0;                         // course: only ctx.rng here, so every client builds the same one
    for (let i = 1; i < N_PL; i++) {
      const gap = (1.5 + ctx.rng() * 2.2) * (HARD ? 1.1 : 1), w = i === N_PL - 1 ? 6 : (2.1 + ctx.rng() * 2.7) * (HARD ? .8 : 1), dy = (ctx.rng() - .5) * 2.6;
      cy = Math.max(0, Math.min(6, cy + Math.max(-1.7, Math.min(1.2, dy)))); pl.push({ x0: cx + gap, x1: cx + gap + w, top: cy }); cx += gap + w;
    }
    const XS = 0, XE = pl[N_PL - 1].x0 + 2.5, lane = k => (k - (n - 1) / 2) * LANE, depth = n * LANE + 1.4;
    const sb = scoreboard(ctx, { timeout: 100, bot: s => { const T = jit(mix(62, 27, s), .15) * (HARD ? 1.3 : 1); return { v: Math.round(T * 1000), t: T }; } });
    const topAt = x => { let t = 0; for (const p of pl) { if (x >= p.x0 - .3) t = p.top; } return t; };
    const platUnder = x => pl.findIndex(p => x >= p.x0 - .3 && x <= p.x1 + .3);

    const S = stage(ctx, { sky: 0x7ec8f5, fog: { color: 0x7ec8f5, near: 40, far: 110 }, light: 1.1, sun: { intensity: 1.2, pos: [8, 20, 12] }, cam: { pos: [3, 5, 17], look: [3, 2.5, 0] }, camFrom: [3, 10, 28], camT: 1.4 });
    pl.forEach((p, i) => {
      const cp = i % 3 === 0, col = i === N_PL - 1 ? 0xf1c40f : cp ? 0x2ecc71 : 0x8a6a3a;
      S.box(p.x1 - p.x0, .6, depth, col, (p.x0 + p.x1) / 2, p.top - .6, 0); S.box(p.x1 - p.x0 + .06, .12, depth + .06, i % 2 ? 0x6fcf5a : 0x5fbf4a, (p.x0 + p.x1) / 2, p.top - .08, 0);
      S.cone(Math.max(.8, (p.x1 - p.x0) * .35), 2.6 + i % 3, 0x6b5a4a, (p.x0 + p.x1) / 2, p.top - 3.4, 0, { seg: 5 });
    });
    S.box(.3, 3.2, .3, 0xffffff, XE + 3, pl[N_PL - 1].top, 0); S.box(1.6, 1, .1, 0xe74c3c, XE + 3.9, pl[N_PL - 1].top + 2.2, 0);   // finish flag
    for (let k = 0; k < 14; k++) S.sph(2.2 + k % 3, 0xffffff, k * 9 - 6, 12 + k % 4 * 2.5, -14 - k % 3 * 4, { basic: true, op: .85, seg: 8 });            // clouds
    const np = {}, cur = {}, disp = {}; ids.forEach((id, k) => { cur[id] = { x: XS, y: 0, d: 0 }; disp[id] = { x: XS, y: 0 }; W.put(id, XS, lane(k), Math.PI / 2); np[id] = nameplate(S, ctx, id); np[id].set(id === me ? 'YOU' : ''); });

    // ---------- play ----------
    const el = document.createElement('div'); el.className = 'mg'; el.innerHTML = '<h3 id="t"></h3>'; ctx.hud.append(el); const tl = el.querySelector('#t');
    const held = {}, kd = e => { held[e.code] = true; if ((e.code === 'Space' || e.code === 'KeyW' || e.code === 'ArrowUp') && !e.repeat) jumpQ = .12; if (e.code === 'Space') e.preventDefault(); }, ku = e => { held[e.code] = false; };
    addEventListener('keydown', kd); addEventListener('keyup', ku);
    const pd = e => { if (e.button === 0 && !e.target.closest?.('button,input')) jumpQ = .12; }; addEventListener('pointerdown', pd);
    let jumpQ = 0, px = XS, py = 0, vy = 0, gr = true, coy = 0, cp = 0, falls = 0, time = 0, done = false, sendT = 0, tt = 0, camX = 3;
    const net = share(ctx, 'pk', ev => { const c = cur[ev.id]; if (!c) return; c.x = ev.x; c.y = ev.y; c.d = ev.d ? 1 : 0; });
    const myK = ids.indexOf(me);
    function simMe(dt) {
      const dir = (held.KeyD || held.ArrowRight ? 1 : 0) - (held.KeyA || held.ArrowLeft ? 1 : 0);
      px += dir * SPD * dt; px = Math.max(XS - 3, px); jumpQ -= dt; coy -= dt;
      if (gr) coy = .1;
      if (jumpQ > 0 && coy > 0) { vy = JV; gr = false; coy = 0; jumpQ = 0; sfx('click'); W.hop(me, .2); }
      vy -= G * dt; const ny = py + vy * dt;
      if (vy <= 0) { const i = platUnder(px); if (i >= 0 && py >= pl[i].top - .05 && ny <= pl[i].top) { py = pl[i].top; vy = 0; if (!gr && i % 3 === 0 && i > cp) { cp = i; W.popIcon(me, '🚩'); } if (!gr) sfx('click'); gr = true; if (i === N_PL - 1 && !done) finish(); return dir; } }
      py = ny; gr = false;
      if (py < -9) { falls++; px = (pl[cp].x0 + pl[cp].x1) / 2; py = pl[cp].top + .2; vy = 0; sfx('lose'); W.shake?.(.1, .2); W.popIcon(me, '😵'); }
      return dir;
    }
    function finish() { done = true; sb.report(Math.round(time * 1000 + falls * 1500)); W.emote(me, 'cheer'); net.emit({ x: px, y: py, d: 1 }); }
    S.anim((dt, tn) => {
      tt += dt;
      ids.forEach((id, k) => {
        const bot = ctx.players[id]?.bot, d = disp[id]; let tx, ty;
        if (id === me) { tx = px; ty = py; } else if (bot) { const f = sb.get(id); tx = XS + (XE - XS) * Math.min(1, f); ty = topAt(tx); const pi = platUnder(tx); if (pi !== d.pi) { d.pi = pi; W.hop(id, .3); } } else { tx = cur[id].x; ty = cur[id].y; }
        const a = id === me ? 1 : Math.min(1, dt * 10); d.x += (tx - d.x) * a; d.y += (ty - d.y) * a;
        W.warp(id, d.x, lane(k)); W.lift(id, d.y); W.face(id, Math.PI / 2); np[id].mesh.position.set(d.x, d.y + 2.9, lane(k)); np[id].set(id === me ? 'YOU' : ctx.players[id]?.bot ? '🤖' : '');
        if (!W.m.get(id)?.emo) W.lean(id, Math.abs(tx - d.x) > .08 || (id === me && (held.KeyD || held.KeyA || held.ArrowRight || held.ArrowLeft)) ? .25 : 0);
      });
      if (tt > 1.5) { camX += ((disp[me].x + 3) - camX) * Math.min(1, dt * 5); W.setCam([camX, disp[me].y * .6 + 5.2, 17], [camX, disp[me].y * .6 + 2.4, 0]); }
    });
    return {
      update(dt) {
        if (!done) { time += dt; simMe(dt); }
        sb.prog(Math.min(1, Math.max(0, px / XE))); sb.tick(dt);
        if ((sendT -= dt) <= 0) { sendT = .08; net.emit({ x: +px.toFixed(2), y: +py.toFixed(2), d: done ? 1 : 0 }); }
        tl.textContent = done ? `Done in ${(time + falls * 1.5).toFixed(1)}s - waiting for others...` : `${time.toFixed(1)}s   Falls: ${falls}   ${Math.round(Math.min(1, px / XE) * 100)}%`;
      },
      endNow() { sb.endNow(); },
      onMessage(m, from) { if (net.handle(m, from)) return; sb.onMessage(m, from); },
      cleanup() { removeEventListener('keydown', kd); removeEventListener('keyup', ku); removeEventListener('pointerdown', pd); el.remove(); S.cleanup(); },
    };
  },
};
