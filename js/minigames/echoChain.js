import * as THREE from 'three';
import { sfx } from '../sfx.js';
import { stage } from './stage.js';
import { nameplate } from './kit.js';
// CO-OP. Set: a glowing crystal cave. A pattern of crystal pads plays out (each step is marked with the colour of whoever must repeat it),
// then the group repeats it IN ORDER: every step is pressed by its owner (steps are dealt round-robin, so you need each other's memory and timing).
// A wrong pad or a step that takes too long costs one of 3 lives, and the same pattern replays. Everyone shares the result: the longest pattern cleared.
const PAL = [0xe74c3c, 0x3498db, 0xf1c40f, 0x2ecc71, 0x9b59b6, 0xff8c1a, 0x1abc9c, 0xff6fb5], CNAME = ['Red', 'Blue', 'Yellow', 'Green', 'Purple', 'Orange', 'Teal', 'Pink'];
const L0 = 3, LMAX = 12, LIVES = 3, STEP_T = 7, MAXT = 110, TIER = [9, 7, 5], NAMES = ['GOLD', 'SILVER', 'BRONZE', 'Keep practising!'];
export default {
  coop: true,
  name: 'Echo Chain', desc: 'CO-OP! Watch the crystal pattern - each step shows WHO must repeat it (their colour ring + name appear). Then repeat it in order, each person pressing their own steps (number keys or tap). There are always at least 4 colours, more with more players. 3 mistakes and it ends.',
  create(ctx) {
    const W = ctx.world, ids = Object.keys(ctx.players), n = ids.length, host = ctx.isHost, me = ctx.me, owner = k => ids[k % n];
    const NC = Math.max(4, Math.min(8, n)), COLS = PAL.slice(0, NC), CSS = COLS.map(c => '#' + c.toString(16).padStart(6, '0')), PR = NC <= 4 ? 3 : 5.2, PX = COLS.map((_, i) => [Math.sin(i / NC * 6.283 + (NC <= 4 ? 1.571 : 0)) * PR, -Math.cos(i / NC * 6.283 + (NC <= 4 ? 1.571 : 0)) * PR]);
    const el = document.createElement('div'); el.className = 'mg'; ctx.hud.append(el);

    // ---------- the set ----------
    const S = stage(ctx, { sky: 0x0b0716, fog: { color: 0x0b0716, near: 22, far: 58 }, light: .75, sun: { color: 0xc8b0ff, intensity: .7, pos: [3, 14, 6] }, cam: { pos: [0, 12 * (PR + 4.2) / 7.2, 11.5 * (PR + 4.2) / 7.2], look: [0, .5, 0] }, camFrom: [0, 20 * (PR + 4.2) / 7.2, 20 * (PR + 4.2) / 7.2], camT: 1.3 });
    S.cyl(24, 24, .5, 0x1b1530, 0, -.5, 0, { seg: 40 }); S.cyl(PR + 3.4, PR + 3.4, .1, 0x2a2150, 0, 0, 0, { seg: 40 }); S.cyl(PR + 2.6, PR + 2.6, .12, 0x1c1638, 0, 0, 0, { seg: 40 });
    const pads = PX.map(([x, z], i) => { S.cyl(1.7, 1.9, .3, 0x2a2442, x, 0, z, { seg: 6 }); return S.cyl(1.3, 1.4, .5, COLS[i], x, .3, z, { seg: 6, em: 0 }); });
    const rings = PX.map(([x, z]) => { const r = new THREE.Mesh(new THREE.TorusGeometry(1.9, .12, 6, 20), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 })); r.rotation.x = Math.PI / 2; r.position.set(x, .45, z); S.root.add(r); return r; });
    for (let k = 0; k < 22; k++) { const a = k / 22 * 6.283 + .1, r = 13 + k % 4 * 2.5, h = 3 + k % 5 * 1.6; S.cone(1 + k % 3 * .5, h, k % 2 ? 0x5a3fa0 : 0x3f5fa0, Math.sin(a) * r, 0, Math.cos(a) * r, { seg: 5, em: 0x120a2a }); }              // crystal spires
    for (let k = 0; k < 16; k++) { const a = k * 2.1, r = 9 + k % 5 * 2, st = S.cone(.8, 3 + k % 3, 0x2a2442, Math.sin(a) * r, 11 - k % 3, Math.cos(a) * r - 3, { seg: 5 }); st.rotation.x = Math.PI; }   // stalactites
    const shrooms = Array.from({ length: 16 }, (_, k) => { const a = k * 2.4 + .3, r = 8 + k % 4 * 1.6; return S.sph(.35 + k % 3 * .12, [0x66e0ff, 0xff7ad9, 0x9dff7a][k % 3], Math.sin(a) * r, .3, Math.cos(a) * r, { basic: true, seg: 6 }); });
    const fl = Array.from({ length: 26 }, () => S.sph(.07, 0xfff2a0, 0, 0, 0, { basic: true, seg: 4 }));
    S.anim((dt, tn) => { shrooms.forEach((m, k) => m.scale.setScalar(.9 + Math.sin(tn * 1.6 + k) * .15)); fl.forEach((f, k) => f.position.set(Math.sin(tn * .3 + k * 1.7) * (5 + k % 6), 1.2 + Math.sin(tn * .8 + k) * .8 + k % 4 * .6, Math.cos(tn * .25 + k * 2.3) * (5 + k % 5))); });
    const ringR = PR + 4.2, slot = i => { const a = (i / n) * Math.PI * 2 + Math.PI; return [Math.sin(a) * ringR, Math.cos(a) * ringR, a + Math.PI]; }, plates = {};
    ids.forEach((id, i) => { const [x, z, a] = slot(i); W.put(id, x, z, a); plates[id] = nameplate(S, ctx, id, 2, .62); plates[id].mesh.position.set(x, 3.9, z); plates[id].set(''); });

    // ---------- host state machine ----------
    const seq = Array.from({ length: LMAX + 2 }, () => Math.random() * NC | 0);
    let ph = 'pause', t = 1.6, L = L0, k = 0, gap = true, lit = -1, litK = -1, idx = 0, lives = LIVES, best = 0, time = 0, acc = 0, over = false, rk = null, evN = 0, evs = [], seenEv = 0, ended = false, seenLit = -2, seenTurn = '', botT = 0, stepT = STEP_T;
    const ev = (kk, pad, id) => { evs.push({ n: ++evN, k: kk, pad, id }); if (evs.length > 12) evs.shift(); };
    const pack = () => ({ ph, L, idx, lit, lk: litK, lives, best, st: +Math.max(0, stepT).toFixed(1), ev: evs, o: rk });
    let snap = pack();
    const finish = () => {
      if (over) return; over = true; ph = 'end'; rk = best >= TIER[0] ? 0 : best >= TIER[1] ? 1 : best >= TIER[2] ? 2 : 3;
      S.after(2.6, () => ctx.finish([...ids], ids.map(() => Math.min(rk, n - 1))));
    };
    const strike = id => { lives--; ev('bad', -1, id); if (lives <= 0) { finish(); return; } ph = 'pause'; t = 1.5; };
    function press(from, pad) {
      if (ph !== 'in' || over) return;
      if (from !== owner(idx)) return;                                       // only the step's owner may press it
      if (pad === seq[idx]) { ev('ok', pad, from); idx++; stepT = STEP_T; botT = 0; if (idx >= L) { best = Math.max(best, L); if (L >= LMAX) { finish(); return; } L++; ph = 'pause'; t = 1.3; ev('round', -1, ''); } }
      else strike(from);
    }
    function step(dt) {
      if (over) return; time += dt; if (time > MAXT) return finish();
      if (ph === 'pause') { lit = -1; litK = -1; if ((t -= dt) <= 0) { ph = 'show'; k = 0; gap = true; t = .5; } }
      else if (ph === 'show') {
        if ((t -= dt) <= 0) {
          if (gap) { if (k >= L) { ph = 'in'; idx = 0; stepT = STEP_T; botT = 0; lit = -1; } else { lit = seq[k]; litK = k; gap = false; t = Math.max(.32, .55 - L * .02); } }
          else { lit = -1; k++; gap = true; t = .2; }
        }
      } else if (ph === 'in') {
        stepT -= dt; if (stepT <= 0) return strike('');
        const o = owner(idx); if (ctx.players[o]?.bot) {
          const sk = ctx.skill?.(o) ?? .5; if (botT === 0) botT = (1.4 - .9 * sk) * (.7 + Math.random() * .7);
          if ((botT -= dt) <= 0) { botT = 0; const ok = Math.random() < Math.max(.35, Math.min(.99, .985 - Math.max(0, L - 3) * .045 * (1.35 - sk))); press(o, ok ? seq[idx] : (seq[idx] + 1 + Math.random() * (NC - 1) | 0) % NC); }
        }
      }
    }
    const send = pad => { sfx('click'); if (host) press(me, pad); else ctx.send({ k: pad }); };
    const kd = e => { if (e.repeat) return; const m = /^(Digit|Numpad)([1-8])$/.exec(e.code); if (m && +m[2] <= NC) send(+m[2] - 1); };
    addEventListener('keydown', kd);
    el.onpointerdown = e => { const tl = e.target.closest('[data-i]'); if (tl) { e.stopPropagation(); send(+tl.dataset.i); } };
    const flash = [0, 0, 0, 0];

    // ---------- rendering ----------
    return {
      update(dt) {
        if (host) { step(dt); snap = pack(); if ((acc += dt) >= .06) { acc = 0; ctx.send(snap); } }
        for (const v of snap.ev) if (v.n > seenEv) {
          seenEv = v.n;
          if (v.k === 'ok') { flash[v.pad] = .3; sfx('click'); if (v.id) W.hop(v.id, .35); } else if (v.k === 'bad') { sfx('lose'); W.shake(.1, .25); if (v.id) { W.emote(v.id, 'sad'); W.popIcon(v.id, '❌'); } else ids.forEach(id => W.popIcon(id, '⏰')); }
          else if (v.k === 'round') { sfx('win'); ids.forEach(id => W.hop(id, .5)); }
        }
        if (snap.lit !== seenLit) { seenLit = snap.lit; if (snap.lit >= 0) { flash[snap.lit] = .5; sfx('tick'); const o = owner(snap.lk); W.hop(o, .3); rings[snap.lit].material.color.set(ctx.players[o].color); rings[snap.lit].userData.t = .55; } }
        pads.forEach((p, i) => { flash[i] = Math.max(0, flash[i] - dt); const on = flash[i] > 0 || snap.lit === i; p.material.emissive.setHex(on ? COLS[i] : 0); p.material.color.setHex(on ? COLS[i] : (COLS[i] >> 1) & 0x7f7f7f); p.position.y = .55 + (on ? .15 : 0); rings[i].userData.t = Math.max(0, (rings[i].userData.t || 0) - dt); rings[i].material.opacity = snap.lit === i ? .95 : Math.min(.9, rings[i].userData.t * 2); });
        const turn = snap.ph === 'in' ? owner(snap.idx) : '';
        if (turn !== seenTurn) { seenTurn = turn; if (turn) W.popIcon(turn, '👉'); }
        ids.forEach(id => plates[id].set(id === turn ? '▶ YOUR STEP' : ''));
        if (snap.o != null && !ended) { ended = true; ids.forEach(id => W.emote(id, snap.o < 3 ? 'cheer' : 'sad')); sfx(snap.o < 3 ? 'win' : 'lose'); }
        const tiles = COLS.map((c, i) => `<div class="tile" data-i="${i}" style="display:inline-block;margin:3px;padding:10px 16px;border-radius:10px;background:${CSS[i]};color:#111;font-weight:800">${i + 1}</div>`).join('');
        const lo = snap.lk >= 0 ? owner(snap.lk) : null, status = snap.ph === 'show' ? (lo ? (lo === me ? `⭐ MEMORIZE - step ${snap.lk + 1}/${snap.L} is YOURS: ${CNAME[snap.lit] ?? ''}` : `Step ${snap.lk + 1}/${snap.L} belongs to ${ctx.esc(ctx.players[lo]?.name ?? '')}`) : 'Watch the pattern...') : snap.ph === 'in' ? (turn === me ? `YOUR STEP (${snap.idx + 1}/${snap.L}) - ${snap.st}s` : `${ctx.esc(ctx.players[turn]?.name ?? '')}'s step (${snap.idx + 1}/${snap.L})`) : snap.ph === 'pause' ? 'Get ready...' : '';
        el.innerHTML = snap.o != null ? `<h2>${snap.o < 3 ? '🏆 ' : ''}${NAMES[snap.o]}!</h2><div>Longest pattern cleared: ${snap.best}</div>`
          : `<h3>${status}</h3><div>${tiles}</div><div>Pattern ${snap.L} &nbsp; ${'❤'.repeat(Math.max(0, snap.lives))}${'🖤'.repeat(Math.max(0, LIVES - snap.lives))} &nbsp; Best ${snap.best || '-'}</div>`;
      },
      onMessage(m, from) {
        if (host) { if (m.k != null && ids.includes(from)) press(from, (m.k | 0) % NC); }
        else if (m.ph) snap = m;
      },
      cleanup() { removeEventListener('keydown', kd); el.remove(); S.cleanup(); },
    };
  },
};
