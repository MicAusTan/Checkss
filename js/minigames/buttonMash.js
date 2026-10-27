import { sfx } from '../sfx.js';
import { stage, fitDist } from './stage.js';
// Mash SPACE (or click) as fast as you can! Host counts presses and broadcasts the totals.
// Set: a race to the sky. Everyone stands on their own pillar in a sea of clouds; every press makes it grow, so the leader is
// simply the highest. The camera climbs with the leader and the winner(s) celebrate on top when time runs out.
const HS = .4;
export default {
  name: 'Button Mash', desc: 'Mash SPACE (or click) as fast as you can - there is no limit! Highest tower wins.',
  create(ctx) {
    const bot = {}, counts = {}; for (const id in ctx.players) counts[id] = 0;
    let t = 8, acc = 0, over = false, fin = false, tt = 0, mine = 0, cy = 5, cx = 0;
    const W = ctx.world, ids = Object.keys(ctx.players), n = ids.length, me = ctx.me, disp = {}, seen = {}, pil = {};
    const el = document.createElement('div'); el.className = 'mg'; ctx.hud.append(el);
    const cnt = id => id === me ? Math.max(counts[id] || 0, mine) : (counts[id] || 0);       // your own presses show instantly, before the host echoes them back
    const hOf = id => 1.2 + cnt(id) * HS;       // no cap: every press counts

    // ---------- the set ----------
    const gap = Math.min(3.2, 16 / n), px = i => (i - (n - 1) / 2) * gap, dist = fitDist(W, (n - 1) / 2 * gap + 3.5, 20);
    const S = stage(ctx, { sky: 0x7ec8ff, fog: { color: 0x7ec8ff, near: 70, far: 150 }, light: 1.2, sun: { intensity: 1.2, pos: [8, 18, 10] }, cam: { pos: [0, 6, dist], look: [0, 5, 0] }, camFrom: [0, 2, dist + 10], camT: 1.2 });
    for (let i = 0; i < 30; i++) { const c = S.sph(1, 0xffffff, -34 + i * 2.4 + (i % 3), -.4 + (i % 4) * .3, (i * 7 % 9) - 5, { seg: 8 }); c.scale.set(2.4 + i % 3, .9, 1.6); }   // the cloud sea
    for (let i = 0; i < 14; i++) { const c = S.sph(1, 0xffffff, (i % 2 ? 1 : -1) * (14 + i * 1.7), 3 + i * 1.9, -10 - i % 4 * 3, { seg: 8 }); c.scale.set(3 + i % 3, 1, 1.6); }   // altitude clouds
    for (let i = 0; i < 70; i++) { const y = 6 + i * 1.05, x0 = (i * 53 % 61) - 30, z0 = -6 - (i * 17 % 20), k = 1 + i % 3 * .5; for (let j = 0; j < 3; j++) { const c = S.sph(1, 0xffffff, x0 + j * 1.6 * k, y + (j === 1 ? .5 : 0), z0 + (j - 1) * .6, { seg: 8 }); c.scale.set(2.2 * k, .95 * k, 1.5 * k); } }   // clouds all the way up
    for (let i = 0; i < 6; i++) S.cone(9 + i * 2, 16 + i * 5, 0x7aa0c8, -60 + i * 24, -14, -70, { seg: 5 });
    S.sph(5, 0xfff2a0, 22, 26, -60, { basic: true });
    ids.forEach((id, i) => {
      const col = ctx.players[id].color; disp[id] = 0; seen[id] = 0;
      pil[id] = { box: S.box(1.9, 1, 1.9, col, px(i), 0, 0), cap: S.box(2.3, .2, 2.3, 0xffffff, px(i), 0, 0, { em: 0x222222 }) };
      W.put(id, px(i), 0, 0);
    });
    S.anim((dt, tn) => {
      tt += dt; let top = 0, second = 0, lead = 0;
      ids.forEach(id => {
        disp[id] += (hOf(id) - disp[id]) * Math.min(1, dt * 10); const h = disp[id], p = pil[id];
        p.box.scale.y = h; p.box.position.y = h / 2; p.cap.position.y = h + .1; W.lift(id, h + .2); if (h > top) { second = top; top = h; lead = ids.indexOf(id); } else if (h > second) second = h;
        const c = cnt(id); if (c > seen[id]) { seen[id] = c; if (!fin) W.hop(id, .3); }
      });
      const f = Math.max(0, Math.min(1, (top - second - 2) / 8)), low = Math.min(...ids.map(id => disp[id])), ty = Math.max(5, (1 - f) * (top + low) / 2 + f * top * .85 + 2.4), cxT = f * px(lead) * .8;
      cy += (ty - cy) * Math.min(1, dt * 2.5); cx += (cxT - cx) * Math.min(1, dt * 2.5); if (tt > 1.25) W.setCam([cx, cy + 1.2, dist * (1 - .25 * f)], [cx, cy, 0]);   // frames everyone; when someone pulls away it focuses on them   // (waits for the stage's fly-in to finish)
    });
    const startFin = () => {
      if (fin) return; fin = true; const best = Math.max(...ids.map(cnt));
      ids.forEach(id => { if (cnt(id) === best && best > 0) { W.emote(id, 'cheer'); const g = W.m.get(id)?.g; if (g) W.burst(g.position.x, g.position.y + 1.5, 0, '#ffd93d', 26); } });
      sfx('win');
    };

    // ---------- play ----------
    const press = () => {
      if (over || fin) return;
      sfx('click'); mine++;
      if (ctx.isHost) counts[ctx.me]++; else ctx.send({ press: 1 });
    };
    const key = e => { if (e.code === 'Space' && !e.repeat) press(); };
    addEventListener('keydown', key); addEventListener('pointerdown', press);
    const render = () => {
      el.innerHTML = `<h2>${Math.max(0, Math.ceil(t))}</h2><div>MASH SPACE / TAP!</div>` +
        Object.values(ctx.players).map(p => `<div class="bar"><span style="width:${Math.round((counts[p.id] || 0) / Math.max(10, ...Object.values(counts)) * 100)}%;background:${p.color}"></span><b>${ctx.esc(p.name)} ${counts[p.id] || 0}</b></div>`).join('');
    };
    return {
      update(dt) {
        t -= dt; render();
        if (!ctx.isHost || over) return;
        for (const id of ids) if (ctx.players[id]?.bot) { const b = bot[id] ??= { cps: (4 + 4 * (ctx.skill?.(id) ?? .5)) * (.85 + Math.random() * .3), f: 0 }; b.f += b.cps * (.8 + Math.random() * .4) * dt; while (b.f >= 1) { b.f--; counts[id]++; } }   // bots mash 4-8 times a second
        acc += dt; if (acc > .1) { acc = 0; ctx.send({ c: counts }); }
        if (t <= 0) { over = true; ctx.send({ c: counts, end: 1 }); startFin(); S.after(2.4, () => ctx.finish(Object.keys(counts).sort((a, b) => counts[b] - counts[a]))); }   // linger so everyone sees the finish
      },
      onMessage(m, from) {
        if (ctx.isHost) { if (m.press && !over && from in counts) counts[from]++; }
        else if (m.c) { Object.assign(counts, m.c); if (m.end) startFin(); }
      },
      cleanup() { removeEventListener('keydown', key); removeEventListener('pointerdown', press); el.remove(); S.cleanup(); },
    };
  },
};
