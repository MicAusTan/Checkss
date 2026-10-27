import * as THREE from 'three';
import { sfx } from '../sfx.js';
import { scoreboard, jit, mix } from './util.js';
import { stage, fitDist } from './stage.js';
import { share, nameplate } from './kit.js';
// Click (or press 1-4) the INK COLOR of the word, not what it says! +1 correct, -1 wrong. 20 seconds. (HUD buttons are unchanged.)
// Set: a neon stage. A huge board shows your current word; four glowing floor pads match the four colours. Every answer anyone
// gives lights its pad (green ring = right, red = wrong) and makes that player hop (or flinch), with live scores over their heads.
const COLS = [['RED', '#e74c3c'], ['BLUE', '#3498db'], ['GREEN', '#2ecc71'], ['YELLOW', '#f1c40f']], HEX = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf1c40f];
export default {
  name: 'Color Clash', desc: 'Click (or press 1-4) the INK COLOR of the word, not what it says! +1 correct, -1 wrong. 20 seconds.',
  create(ctx) {
    const sb = scoreboard(ctx, { timeout: 30, lower: false, bot: s => ({ v: Math.round(jit(mix(5, 26, s), .2)), t: 20 }) }), rounds = Array.from({ length: 80 }, () => { const w = ctx.rng() * 4 | 0; return { w, c: ctx.rng() < .8 ? (w + 1 + (ctx.rng() * 3 | 0)) % 4 : w }; });
    let i = 0, score = 0, time = 0, done = false, shown = -2;
    const W = ctx.world, ids = Object.keys(ctx.players), n = ids.length, me = ctx.me, st = {}, np = {}; ids.forEach(id => st[id] = 0);
    const el = document.createElement('div'); el.className = 'mg';
    el.innerHTML = '<h3 id="s"></h3><h2 id="w"></h2><div>' + COLS.map((c, k) => `<button data-k="${k}" style="background:${c[1]};width:60px;height:44px;margin:3px">${k + 1}</button>`).join('') + '</div>'; ctx.hud.append(el);
    const s = el.querySelector('#s'), w = el.querySelector('#w');

    // ---------- the set ----------
    const dist = fitDist(W, 9.6, 14);
    const S = stage(ctx, { sky: 0x0a0618, fog: { color: 0x0a0618, near: 28, far: 65 }, light: .85, sun: { intensity: .7, pos: [0, 12, 8] }, cam: { pos: [0, 5.6, dist], look: [0, 2.6, 0] }, camFrom: [0, 10, dist + 9], camT: 1.4 });
    S.box(80, .5, 50, 0x110c26, 0, -.5, -6);
    for (let k = -6; k <= 6; k++) S.box(.08, .03, 40, k % 2 ? 0xff4dd8 : 0x4dd0e1, k * 2.2, .02, -8, { basic: true });                     // neon floor lines
    for (let k = 0; k < 9; k++) S.box(1.6, 8 + k % 3 * 2, .3, HEX[k % 4], (k - 4) * 3.4, 0, -9, { em: (HEX[k % 4] >> 1) & 0x7f7f7f });     // light bars
    const board = S.screen(8.4, 2.5, 512, 150); board.mesh.position.set(0, 7.6, -3);
    const drawBoard = () => { const r = rounds[Math.min(i, rounds.length - 1)]; board.draw((c, bw, bh) => { c.fillStyle = '#05030f'; c.fillRect(0, 0, bw, bh); c.strokeStyle = '#ff4dd8'; c.lineWidth = 8; c.strokeRect(6, 6, bw - 12, bh - 12); c.textAlign = 'center'; c.font = 'bold 104px sans-serif'; c.fillStyle = done ? '#fff' : COLS[r.c][1]; c.fillText(done ? 'DONE!' : COLS[r.w][0], bw / 2, 112); }); };
    const pads = COLS.map((_, k) => S.cyl(1.55, 1.65, .22, HEX[k], (k - 1.5) * 3.9, 0, 3.4, { em: (HEX[k] >> 1) & 0x7f7f7f }));
    const rings = pads.map(p => { const m = new THREE.Mesh(new THREE.RingGeometry(.9, 1, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.position.set(p.position.x, .3, p.position.z); m.userData.t = 0; S.root.add(m); return m; });
    const gap = Math.min(2.6, 14 / n);
    ids.forEach((id, k) => { const x = (k - (n - 1) / 2) * gap; W.put(id, x, 0, 0); np[id] = nameplate(S, ctx, id); np[id].mesh.position.set(x, 3.4, 0); np[id].set('0'); });
    const wall = S.screen(34, 11, 1024, 330); wall.mesh.position.set(0, 5.7, -8.6); const splats = []; let wdirty = true;           // the back wall gets PAINTED by every answer
    const paint = (id, k, ok) => {
      const col = Math.max(0, ids.indexOf(id)), cx = (.5 + (col - (n - 1) / 2) / Math.max(n, 3) * .9) * 1024 + (Math.random() - .5) * 120, cy = 40 + Math.random() * 250, r = ok ? 16 + Math.random() * 26 : 12 + Math.random() * 14;
      splats.push({ x: cx, y: cy, r, c: ok ? COLS[k][1] : '#15101f', dots: Array.from({ length: 6 }, () => [Math.random() * 6.283, r * (1 + Math.random() * 1.3), r * (.12 + Math.random() * .25)]), drip: ok && Math.random() < .6 ? r * (1.5 + Math.random() * 3) : 0 }); if (splats.length > 260) splats.shift(); wdirty = true;
    };
    const drawWall = () => wall.draw((c, w, h) => { c.fillStyle = '#0c0818'; c.fillRect(0, 0, w, h); for (const p of splats) { c.fillStyle = p.c; c.beginPath(); c.arc(p.x, p.y, p.r, 0, 6.283); c.fill(); for (const [a, d, rr] of p.dots) { c.beginPath(); c.arc(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, rr, 0, 6.283); c.fill(); } if (p.drip) { c.fillRect(p.x - p.r * .12, p.y, p.r * .24, p.drip); c.beginPath(); c.arc(p.x, p.y + p.drip, p.r * .2, 0, 6.283); c.fill(); } } });
    drawWall();
    const lightPad = (k, ok) => { const r = rings[k & 3]; r.userData.t = .45; r.material.color.setHex(ok ? 0x2ecc71 : 0xe74c3c); };
    S.anim(dt => {
      if (shown !== i + (done ? 100 : 0)) { shown = i + (done ? 100 : 0); drawBoard(); }
      if (wdirty) { wdirty = false; drawWall(); }
      rings.forEach(r => { r.userData.t = Math.max(0, r.userData.t - dt); const u = 1 - r.userData.t / .45; r.scale.setScalar(.7 + u * 1.6); r.material.opacity = r.userData.t > 0 ? r.userData.t / .45 : 0; });
      ids.forEach(id => np[id].set(String(id === me ? score : st[id])));
    });
    const net = share(ctx, 'c', ev => { if (!(ev.id in st)) return; st[ev.id] = ev.sc | 0; lightPad(ev.c | 0, ev.ok); paint(ev.id, ev.c & 3, ev.ok); if (ev.ok) W.hop(ev.id, .45); else { W.emote(ev.id, 'shake'); W.popIcon(ev.id, '❌'); } });

    // ---------- play ----------
    const answer = k => {
      if (done) return; const ok = k === rounds[i].c; if (ok) { score++; sfx('click'); W.hop(me, .45); } else { score--; sfx('lose'); W.emote(me, 'shake'); W.popIcon(me, '❌'); }
      lightPad(k, ok); paint(me, k, ok); net.emit({ c: k, ok, sc: score }); i++;
    };
    el.onpointerdown = e => { const b = e.target.closest('[data-k]'); if (b) { e.stopPropagation(); answer(+b.dataset.k); } };
    const key = e => { const k = '1234'.indexOf(e.key); if (k >= 0) answer(k); };
    addEventListener('keydown', key);
    return {
      update(dt) {
        for (const id of ids) if (ctx.players[id]?.bot) { const v = Math.round(sb.get(id)); if (v > st[id]) { paint(id, Math.random() * 4 | 0, true); lightPad(Math.random() * 4 | 0, true); W.hop(id, .3); } st[id] = v; }      // bots paint as their score climbs
        sb.prog(score), sb.tick(dt); time += dt; if (!done && time >= 20) { done = true; sb.report(score); W.emote(me, 'cheer'); }
        const r = rounds[i]; s.textContent = done ? `Final: ${score} - waiting for others...` : `${Math.ceil(20 - time)}s   Score: ${score}`;
        w.textContent = done ? '' : COLS[r.w][0]; w.style.color = done ? '' : COLS[r.c][1];
      },
      endNow() { sb.endNow(); },
      onMessage(m, from) { if (net.handle(m, from)) return; sb.onMessage(m, from); },
      cleanup() { removeEventListener('keydown', key); el.remove(); S.cleanup(); },
    };
  },
};
