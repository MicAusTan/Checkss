import * as THREE from 'three';
import { sfx } from '../sfx.js';
import { stage } from './stage.js';
// Simon-style: everyone gets the same seeded sequence and plays at their own pace.
// A wrong press knocks you out. Most rounds wins; ties go to whoever survived longer.
// Set: a torch-lit temple with four rune pads. YOUR avatar stands in the middle of your pads (they light up for the pattern and when
// you press them). Everyone else is in the back row with their own little pads that flash as they play, a round counter over their
// head, and a skull if they're out. (The HUD tiles stay: they are still the click targets.)
const COLS = ['#e74c3c', '#3498db', '#f1c40f', '#2ecc71'], HEX = [0xe74c3c, 0x3498db, 0xf1c40f, 0x2ecc71], PX = [[-2.7, 0], [0, -2.7], [2.7, 0], [0, 2.7]];
export default {
  name: 'Memory Run', desc: 'Watch the pattern, repeat it with keys 1-4 or clicks. One mistake and you\'re out.',
  create(ctx) {
    const rng = ctx.rng, seq = Array.from({ length: 40 }, () => rng() * 4 | 0);
    const bot = {}; let prog = {}; for (const id in ctx.players) prog[id] = { r: 0, out: false, t: 0 };
    let round = 1, step = 0, phase = 'show', t = .8, lit = -1, pr = -1, prT = 0, time = 0, acc = 0, over = false;
    const W = ctx.world, ids = Object.keys(ctx.players), me = ctx.me, others = ids.filter(id => id !== me), flash = {}, shownR = {}, wasOut = {}, lab = {};
    const el = document.createElement('div'); el.className = 'mg'; ctx.hud.append(el);

    // ---------- the set ----------
    const S = stage(ctx, { sky: 0x061a1f, fog: { color: 0x061a1f, near: 26, far: 60 }, light: .85, sun: { intensity: .8, color: 0xffe0b0, pos: [3, 14, 6] }, cam: { pos: [0, 10, 11.5], look: [0, .5, -1.8] }, camFrom: [0, 17, 19], camT: 1.4 });
    S.cyl(15, 15, .5, 0x12302f, 0, -.5, -2, { seg: 40 }); S.cyl(5.6, 5.6, .12, 0x1c4a47, 0, 0, 0, { seg: 40 });
    for (let k = 0; k < 7; k++) { S.cyl(.55, .65, 7, 0x2c5b57, (k - 3) * 3.4, 0, -11, { seg: 10 }); S.box(1.5, .5, 1.5, 0x3b7a74, (k - 3) * 3.4, 7, -11); }   // temple columns
    S.box(24, .7, 1.6, 0x2c5b57, 0, 7.5, -11);
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2 + .5, x = Math.sin(a) * 9, z = -Math.cos(a) * 9 - 1; S.cyl(.12, .16, 2.2, 0x6b4a2b, x, 0, z, { seg: 6 }); S.sph(.38, 0xffa040, x, 2.4, z, { basic: true, seg: 8 }); }   // torches
    const pads = PX.map(([x, z], i) => {
      const p = S.cyl(1.45, 1.5, .3, HEX[i], x, 0, z, { em: 0 }); p.material.color.setHex((HEX[i] >> 1) & 0x7f7f7f);
      const nr = S.screen(1.1, 1.1, 128, 128); nr.mesh.rotation.x = -Math.PI / 2; nr.mesh.position.set(x, .33, z); nr.draw((c, w, h) => { c.fillStyle = '#fffb'; c.font = 'bold 90px sans-serif'; c.textAlign = 'center'; c.fillText(String(i + 1), w / 2, 98); });
      return p;
    });
    W.put(me, 0, 0, 0);
    const gap = Math.min(3.2, 16 / Math.max(1, others.length));
    others.forEach((id, k) => {
      const x = (k - (others.length - 1) / 2) * gap; W.put(id, x, -5.6, 0); flash[id] = [0, 0, 0, 0];
      flash[id].m = [0, 1, 2, 3].map(i => S.cyl(.3, .32, .12, (HEX[i] >> 1) & 0x7f7f7f, x + (i - 1.5) * .8, 0, -4.3, { seg: 12, em: 0 }));
      const l = S.screen(1.8, .6, 256, 86); l.mesh.position.set(x, 3.5, -5.6); lab[id] = l; shownR[id] = -1;
    });
    const drawLab = id => { const q = prog[id] || { r: 0, out: false }; lab[id].draw((c, w, h) => { c.fillStyle = q.out ? '#4a1010dd' : '#000a'; c.fillRect(0, 0, w, h); c.textAlign = 'center'; c.fillStyle = ctx.players[id].color; c.font = 'bold 28px sans-serif'; c.fillText(String(ctx.players[id].name).slice(0, 12), w / 2, 32); c.fillStyle = '#fff'; c.font = 'bold 40px sans-serif'; c.fillText(q.out ? 'OUT  R' + q.r : 'R' + q.r, w / 2, 74); }); };
    S.anim(dt => {
      pads.forEach((p, i) => { const on = lit === i || pr === i; p.material.emissive.setHex(on ? HEX[i] : 0); p.material.color.setHex(on ? HEX[i] : (HEX[i] >> 1) & 0x7f7f7f); p.position.y = .15 + (on ? .14 : 0); });
      for (const id of others) {
        const f = flash[id]; for (let i = 0; i < 4; i++) { f[i] = Math.max(0, f[i] - dt); const m = f.m[i]; m.material.emissive.setHex(f[i] > 0 ? HEX[i] : 0); m.material.color.setHex(f[i] > 0 ? HEX[i] : (HEX[i] >> 1) & 0x7f7f7f); }
        const q = prog[id]; if (q) { const key = q.r + (q.out ? 'x' : ''); if (shownR[id] !== key) { shownR[id] = key; drawLab(id); } if (q.out && !wasOut[id]) { wasOut[id] = 1; W.emote(id, 'sad'); W.popIcon(id, '💀'); } }
      }
    });

    // ---------- play ----------
    const apply = (id, r, out) => { const p = prog[id]; if (!p || p.out) return; p.r = Math.max(p.r, r | 0); if (out) { p.out = true; p.t = time; } };
    const report = (r, out) => ctx.isHost ? apply(ctx.me, r, out) : ctx.send({ r, out });
    const press = i => {
      if (phase !== 'input' || over) return;
      pr = i; prT = .15; const good = i === seq[step]; sfx(good ? 'click' : 'lose'); W.hop(me, .35); ctx.send({ k: 'm', id: me, i });
      if (!good) { phase = 'out'; report(round - 1, true); W.emote(me, 'sad'); W.popIcon(me, '❌'); return; }
      if (++step === round) { report(round, false); round++; phase = 'show'; step = 0; lit = -1; t = .8; W.hop(me, .9); }
    };
    const key = e => { const i = '1234'.indexOf(e.key); if (i >= 0 && !e.repeat) press(i); };
    el.onpointerdown = e => { const i = e.target.dataset.i; if (i != null) press(+i); };
    addEventListener('keydown', key);

    const status = () => phase === 'show' ? 'Watch...' : phase === 'input' ? `Your turn (${step}/${round})` : 'Out! Waiting for others...';
    const render = () => {
      el.innerHTML = `<h3>${status()}</h3><div class="tiles">${COLS.map((c, i) =>
        `<div class="tile${lit === i || pr === i ? ' on' : ''}" data-i="${i}" style="background:${c}">${i + 1}</div>`).join('')}</div>` +
        Object.values(ctx.players).map(p => { const q = prog[p.id] || { r: 0 };
          return `<div class="bar"><span style="width:${Math.min(100, q.r * 2.5)}%;background:${p.color}"></span><b>${ctx.esc(p.name)} - ${q.r}${q.out ? ' (out)' : ''}</b></div>`; }).join('');
    };
    const mirror = (id, i) => { const f = flash[id]; if (f) { f[i & 3] = .22; W.hop(id, .25); } };
    return {
      update(dt) {
        time += dt; if (prT > 0 && (prT -= dt) <= 0) pr = -1;
        if (phase === 'show' && (t -= dt) <= 0) {
          if (lit >= 0) { lit = -1; t = .25; }
          else if (step < round) { lit = seq[step++]; sfx('tick'); t = .55; }
          else { phase = 'input'; step = 0; }
        }
        render();
        if (!ctx.isHost || over) return;
        for (const id of ids) if (ctx.players[id]?.bot && !prog[id].out) {      // bots: survive about M rounds (more when skilled), at a human-ish pace
          const sk = ctx.skill?.(id) ?? .5, b = bot[id] ??= { c: 0, M: Math.max(3, Math.round((4 + 14 * sk) * (.7 + Math.random() * .6))), r: 0 };
          const C = r => .9 * r + .4 * r * (r + 1) / 2 + r * (1 - sk * .5) * .5 * r / 2 + r * .6; b.c += dt;
          while (b.r < b.M && b.c >= C(b.r + 1)) apply(id, ++b.r, false);
          if (b.r >= b.M && b.c >= C(b.M + 1)) apply(id, b.M, true);
          if (ids.filter(o => !ctx.players[o]?.bot).every(o => prog[o]?.out)) { if (b.r < b.M) b.r = b.M; apply(id, b.r, true); }       // all humans are out: the bots don't make anyone wait
        }
        if ((acc += dt) > .2) { acc = 0; ctx.send({ p: prog }); }
        const all = Object.keys(prog);
        if (time > 90 || all.every(id => prog[id].out) || all.some(id => prog[id].r >= 40)) {
          over = true; ctx.send({ p: prog }); const surv = id => prog[id].out ? prog[id].t : Infinity;
          const order = all.sort((a, b) => prog[b].r - prog[a].r || surv(b) - surv(a)); S.after(1.2, () => ctx.finish(order));
        }
      },
      onMessage(m, from) {
        if (m.k === 'm') {                                    // cosmetic: someone pressed pad i (host validates + relays)
          if (ctx.isHost) { if (!(from in prog)) return; const ev = { k: 'm', id: from, i: m.i & 3 }; mirror(from, ev.i); ctx.send(ev); }
          else if (m.id !== me) mirror(m.id, m.i);
          return;
        }
        if (ctx.isHost) { if (m.r != null) apply(from, m.r, !!m.out); }
        else if (m.p) prog = m.p;
      },
      cleanup() { removeEventListener('keydown', key); el.remove(); S.cleanup(); },
    };
  },
};
