import { sfx } from '../sfx.js';
import { stage, fitDist } from './stage.js';
// Same seeded questions for everyone. First to GOAL correct answers wins. Wrong answer = short lockout.
// Set: a mountain staircase. Every correct answer climbs one step toward the golden summit; a wrong answer makes you stumble.
const GOAL = 8, SX = 2.5, SY = 1.1;
export default {
  emotes: false, name: 'Math Race', desc: `Pick a difficulty (Easy / Normal / Hard / Insane), then solve ${GOAL} sums before anyone else! Harder = bigger coin rewards, but finishing in the bottom half costs coins.`,
  create(ctx) {
    const ids = Object.keys(ctx.players), host = ctx.isHost, r = ctx.rng;
    const gen = lv => Array.from({ length: GOAL + 4 }, () => {
      const ri = (a, b) => a + (r() * (b - a + 1) | 0);
      if (lv === 0) { const add = r() < .6, a = ri(2, 20), b = ri(2, 20); return add ? { t: `${a} + ${b}`, a: a + b } : { t: `${Math.max(a, b)} - ${Math.min(a, b)}`, a: Math.abs(a - b) }; }
      if (lv === 1) { const op = ['+', '-', '×'][r() * 3 | 0], big = op === '×' ? 11 : 49; let a = 2 + r() * big | 0, b = 2 + r() * big | 0; if (op === '-' && b > a) [a, b] = [b, a]; return { t: `${a} ${op} ${b}`, a: op === '+' ? a + b : op === '-' ? a - b : a * b }; }
      if (lv === 2) { const k = r() * 4 | 0, a = ri(20, 99), b = ri(11, 49); if (k === 0) return { t: `${a} + ${b}`, a: a + b }; if (k === 1) return { t: `${a} - ${b}`, a: a - b }; if (k === 2) { const x = ri(6, 19), y = ri(6, 15); return { t: `${x} × ${y}`, a: x * y }; } const x = ri(3, 9), y = ri(3, 12); return { t: `${x * y} ÷ ${x}`, a: y }; }
      const k = r() * 5 | 0;
      if (k === 0) { const x = ri(12, 25), y = ri(3, 9); return { t: `${x} × ${y}`, a: x * y }; }
      if (k === 1) { const x = ri(3, 16); return { t: `${x}²`, a: x * x }; }
      if (k === 2) { const x = ri(5, 30), y = ri(2, 9), z = ri(2, 9); return { t: `${x} + ${y} × ${z}`, a: x + y * z }; }
      if (k === 3) { const x = ri(4, 13), y = ri(4, 15); return { t: `${x * y} ÷ ${x}`, a: y }; }
      const x = ri(20, 90), y = ri(30, 99); return { t: `${x} - ${y}`, a: x - y };
    });
    const QS = [0, 1, 2, 3].map(gen), LV = ['Easy', 'Normal', 'Hard', 'Insane'], ADJ = [{ m: .7, pen: 0 }, { m: 1, pen: 1 }, { m: 1.5, pen: 3 }, { m: 2.2, pen: 5 }], lvOf = {}; let qs = QS[1], lv = 1, picked = false, pick = 7;
    const bot = {}, botLv = id => { const k = ctx.skill?.(id) ?? .5, x = k + (Math.random() - .5) * .5; return x > .85 ? 3 : x > .6 ? 2 : x > .3 ? 1 : 0; }, nextQ = id => { const s = ctx.skill?.(id) ?? .5; return (7 - 4.4 * s) * (.75 + Math.random() * .5) * (1 + .35 * ((lvOf[id] ?? 1) - 1)); };
    const prog = {}, reach = {}, disp = {}, seen = {}; ids.forEach(id => { prog[id] = 0; disp[id] = 0; seen[id] = 0; });
    let n = 0, lock = 0, time = 0, acc = 0, over = false, fin = false;
    const W = ctx.world, cnt = ids.length, me = ctx.me;
    const el = document.createElement('div'); el.className = 'mg';
    el.innerHTML = '<h2 id="q"></h2><input id="a" inputmode="numeric" autocomplete="off" style="width:120px;text-align:center;font-size:22px"><div id="bars"></div><div id="lv"></div>';
    ctx.hud.append(el); const q = el.querySelector('#q'), inp = el.querySelector('#a'), bars = el.querySelector('#bars');
    const lvEl = el.querySelector('#lv'); lvEl.style.pointerEvents = 'auto';
    const choose = k => { if (picked) return; picked = true; lv = k; qs = QS[k]; lvOf[me] = k; if (!host) ctx.send({ lv: k }); lvEl.innerHTML = ''; inp.focus(); };
    lvEl.innerHTML = '<div style="margin:6px 0">Choose your difficulty:</div>' + LV.map((nme, k) => `<button data-k="${k}" style="margin:2px;font-size:16px">${nme}<br><small>x${ADJ[k].m} coins${ADJ[k].pen ? ', -' + ADJ[k].pen + ' if bottom half' : ''}</small></button>`).join('');
    lvEl.onclick = e => { const b = e.target.closest('button'); if (b) choose(+b.dataset.k); };
    lvOf[me] = 1;
    setTimeout(() => inp.focus(), 50);

    // ---------- the set ----------
    const dist = fitDist(W, 14.5, 24), depth = cnt * 1.6 + 2, lz = i => (i - (cnt - 1) / 2) * 1.6;
    const S = stage(ctx, { sky: 0x9fd8ff, fog: { color: 0x9fd8ff, near: 55, far: 130 }, light: 1.15, sun: { intensity: 1.2, pos: [8, 18, 12] }, cam: { pos: [0, 8.2, dist], look: [0, 4.4, 0] }, camFrom: [0, 4, dist + 12], camT: 1.4 });
    S.box(140, .5, 60, 0x5fae4c, 0, -.5, -10);
    for (let k = 0; k <= GOAL; k++) {
      const x = -10 + k * SX, top = .3 + k * SY, gold = k === GOAL;
      S.box(SX, top, depth, gold ? 0xffd93d : k % 2 ? 0xb9c2cc : 0xa7b1bd, x, 0, 0);
      S.cyl(.05, .05, 1.6, 0xffffff, x, top, -depth / 2 + .3, { seg: 5 }); S.box(.7, .4, .05, gold ? 0xffd93d : 0xe74c3c, x + .4, top + 1.2, -depth / 2 + .3);
    }
    const sign = S.screen(3.4, .9, 256, 68); sign.mesh.position.set(-10 + GOAL * SX, .3 + GOAL * SY + 3, -depth / 2 + .3);
    sign.draw((c, w, h) => { c.fillStyle = '#b8860b'; c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; c.font = 'bold 48px sans-serif'; c.textAlign = 'center'; c.fillText('SUMMIT', w / 2, 52); });
    [[-30, 14, 10], [-8, 18, 12], [16, 15, 11], [38, 17, 12]].forEach(([x, h, rd]) => { S.cone(rd, h, 0x8e9aaa, x, 0, -26, { seg: 6 }); S.cone(rd * .38, h * .3, 0xffffff, x, h * .7, -26, { seg: 6 }); });   // snowy peaks
    for (let k = 0; k < 14; k++) { const x = (k < 7 ? -1 : 1) * (14 + k % 7 * 2.2), z = -2 - k * 1.3 % 7; S.cyl(.2, .26, 1.2, 0x6b4a2b, x, 0, z, { seg: 5 }); S.cone(1.2, 3.2, 0x2f7d3a, x, 1, z, { seg: 6 }); }
    ids.forEach((id, i) => W.put(id, -10, lz(i), Math.PI / 2, .3));
    S.anim(dt => {
      ids.forEach((id, i) => {
        const p = prog[id] || 0, d = disp[id] += (p - disp[id]) * Math.min(1, dt * 7); W.warp(id, -10 + d * SX, lz(i)); W.lift(id, .3 + d * SY);
        if (!W.m.get(id)?.emo) W.lean(id, Math.abs(p - d) > .05 ? .3 : 0);
        if (p > seen[id]) { seen[id] = p; if (!fin) W.hop(id, .5); }
      });
    });
    const startFin = () => { if (fin) return; fin = true; ids.forEach(id => { if (prog[id] >= GOAL) { W.emote(id, 'cheer'); const g = W.m.get(id)?.g; if (g) W.burst(g.position.x, g.position.y + 1.6, g.position.z, '#ffd93d', 24); } }); };

    // ---------- play ----------
    const setP = (id, v) => { prog[id] = v; if (v >= GOAL && !(id in reach)) reach[id] = time; };
    inp.onkeydown = e => {
      e.stopPropagation(); if (e.key !== 'Enter' || lock > 0 || over || n >= GOAL || pick > 0) return;
      if (+inp.value.trim() === qs[n].a && inp.value.trim() !== '') { n++; sfx('click'); host ? setP(ctx.me, n) : ctx.send({ p: n }); }
      else { lock = .8; sfx('lose'); W.emote(me, 'sad'); W.popIcon(me, '❌'); }
      inp.value = '';
    };
    const finish = () => {
      over = true; ctx.send({ pr: prog, end: 1 }); startFin();
      const order = [...ids].sort((a, b) => prog[b] - prog[a] || (reach[a] ?? 1e9) - (reach[b] ?? 1e9));
      const adj = {}; ids.forEach(id => adj[id] = ADJ[lvOf[id] ?? 1]);
      S.after(2.2, () => ctx.finish(order, undefined, adj));            // let everyone see who reached the summit
    };
    return {
      update(dt) {
        if (pick > 0) { pick -= dt; if (pick <= 0) { if (!picked) choose(1); lvEl.innerHTML = ''; ids.forEach(id => { if (host && ctx.players[id]?.bot) lvOf[id] = botLv(id); }); } q.textContent = `Pick a difficulty (${Math.ceil(pick)}s)`; inp.disabled = true; return; }
        time += dt; lock -= dt; prog[ctx.me] = Math.max(prog[ctx.me], n);
        q.textContent = n >= GOAL ? 'Done!' : lock > 0 ? '✗ wait...' : qs[n].t + ' = ?' + (lv !== 1 ? ' (' + LV[lv] + ')' : '');
        inp.disabled = n >= GOAL; if (!inp.disabled && lock <= 0 && document.activeElement !== inp) inp.focus();
        bars.innerHTML = ids.map(id => `<div class="bar"><span style="width:${prog[id] / GOAL * 100}%;background:${ctx.players[id].color}"></span><b>${ctx.esc(ctx.players[id].name)} ${prog[id]}/${GOAL}</b></div>`).join('');
        if (!host || over) return;
        for (const id of ids) if (ctx.players[id]?.bot && prog[id] < GOAL) {     // bots: a skill-based time per question, the odd wrong answer costs .8s
          const b = bot[id] ??= { t: 0, q: 0 }; if (!b.q) b.q = nextQ(id); if ((b.t += dt) >= b.q) { b.t = 0; b.q = nextQ(id); if (Math.random() < .12 - .08 * (ctx.skill?.(id) ?? .5)) b.q += .8; else setP(id, prog[id] + 1); }
        }
        if ((acc += dt) > .2) { acc = 0; ctx.send({ pr: prog }); }
        if (ids.some(id => prog[id] >= GOAL) || time > 75) finish();
      },
      onMessage(m, from) {
        if (host) { if (m.lv != null && from in prog && pick > 0) lvOf[from] = Math.max(0, Math.min(3, m.lv | 0)); if (m.p != null && from in prog) setP(from, Math.min(GOAL, m.p | 0)); }
        else if (m.pr) { for (const id in m.pr) if (id !== ctx.me) prog[id] = m.pr[id]; if (m.end) startFin(); }
      },
      cleanup() { el.remove(); S.cleanup(); },
    };
  },
};
