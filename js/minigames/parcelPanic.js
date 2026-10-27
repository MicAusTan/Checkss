import * as THREE from 'three';
import { sfx } from '../sfx.js';
import { stage } from './stage.js';
import { nameplate } from './kit.js';
// CO-OP. Set: a busy parcel warehouse. Coloured parcels ride the conveyor towards the drop-off. Each player owns some of the colours
// (shown on the HUD): when a parcel of YOUR colour is in the green catch zone press its number key (or tap its tile) to grab it.
// Pressing with nothing to catch jams your hands for a moment. Everyone shares the result: how many parcels got delivered.
const COLS = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf1c40f, 0x9b59b6, 0xe67e22, 0x1abc9c, 0xfd79a8], CSS = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#e67e22', '#1abc9c', '#fd79a8'];
const TOTAL = 44, Z0 = .72, Z1 = .98, BX = 10, TIER = [.85, .65, .4], NAMES = ['GOLD', 'SILVER', 'BRONZE', 'Too many dropped'];
export default {
  coop: true,
  tiers: [{ n: 'Normal', m: 1, pen: 0, def: true }, { n: 'Hard', m: 1.3, pen: 0, d: 'One more colour, faster belt and parcels.' }, { n: 'Insane', m: 1.7, pen: 0, d: 'Two more colours, much faster.' }],
  name: 'Parcel Panic', desc: 'CO-OP! Every player owns some parcel colours (see the HUD). When a parcel of YOUR colour reaches the green zone, press its number key (1-8) or tap its tile! Mistimed presses jam your hands.',
  create(ctx) {
    const W = ctx.world, ids = Object.keys(ctx.players), n = ids.length, host = ctx.isHost, me = ctx.me, D = ctx.diff ?? 0, C = Math.min(8, (n <= 2 ? 4 : n === 3 ? 6 : Math.min(8, n)) + D);
    const owner = c => ids[c % n], mine = c => owner(c) === me;
    const el = document.createElement('div'); el.className = 'mg'; ctx.hud.append(el);

    // ---------- the set ----------
    const dist = 17, S = stage(ctx, { sky: 0x20242e, fog: { color: 0x20242e, near: 40, far: 95 }, light: .95, sun: { color: 0xfff0d0, intensity: 1.1, pos: [4, 16, 10] }, cam: { pos: [0, 10.5, dist], look: [0, 1, -.5] }, camFrom: [0, 18, dist + 12], camT: 1.3 });
    S.box(80, .5, 50, 0x6a6f7a, 0, -.5, -6); S.box(60, 14, .6, 0x4a5060, 0, 0, -16); S.box(.6, 14, 40, 0x4a5060, -30, 0, -6); S.box(.6, 14, 40, 0x4a5060, 30, 0, -6);
    for (let k = -1; k <= 1; k += 2) for (let j = 0; j < 3; j++) { S.box(8, .3, 2, 0x8a6a3a, k * 18, 2 + j * 2.4, -14); for (const sx of [-3.8, 3.8]) S.box(.3, 8, 2, 0x6b4a2b, k * 18 + sx, 0, -14); S.box(1.4, 1.2, 1.4, COLS[(j + (k > 0 ? 3 : 0)) % 8], k * 18 + (j - 1) * 2, 2.3 + j * 2.4, -14); }
    S.box(2 * BX + 2, .9, 2.2, 0x2b2f38, 0, 0, 0); S.box(2 * BX + 2, .12, 2.5, 0xf1c40f, 0, .9, 0, { op: 1 }); const belt = S.box(2 * BX + 1.4, .06, 1.7, 0x3a3f4a, 0, .95, 0);
    const stripes = Array.from({ length: 22 }, (_, k) => S.box(.18, .02, 1.7, 0x505664, -BX + k * (2 * BX / 21), 1.0, 0));
    for (let k = 0; k < 6; k++) { S.cyl(.14, .14, .9, 0x555a66, -BX + k * (2 * BX / 5), 0, 1.3, { seg: 5 }); S.cyl(.14, .14, .9, 0x555a66, -BX + k * (2 * BX / 5), 0, -1.3, { seg: 5 }); }
    const zx = -BX + (Z0 + Z1) / 2 * 2 * BX, zw = (Z1 - Z0) * 2 * BX, zone = S.box(zw, .05, 2.3, 0x2ecc71, zx, 1.0, 0, { basic: true, op: .35 });
    S.box(.2, 2.4, .2, 0x2ecc71, -BX + Z0 * 2 * BX, 0, 1.4, { basic: true }); S.box(.2, 2.4, .2, 0x2ecc71, -BX + Z1 * 2 * BX, 0, 1.4, { basic: true });
    S.box(4, 3, 3, 0x3a3f4a, BX + 3.2, -3, 0); S.box(4.2, .3, 3.2, 0xe74c3c, BX + 3.2, 0, 0);                              // the drop pit at the end
    S.box(10, 4.4, 5, 0xf5f0e0, BX + 8, 0, -4, { ry: .15 }); S.box(2.6, 3, 4.6, 0x3498db, BX + 11.8, 0, -4, { ry: .15 }); S.cyl(.8, .8, .5, 0x222222, BX + 6, 0, -1.4, { seg: 10 }); S.cyl(.8, .8, .5, 0x222222, BX + 10, 0, -1.4, { seg: 10 });   // the truck
    const lampL = [-20, 0, 20].map(x => { S.cyl(.1, .1, 6, 0x444444, x, 0, 4, { seg: 5 }); return S.sph(.4, 0xfff2a0, x, 6.2, 4, { basic: true, seg: 8 }); });
    const slotX = i => (i - (n - 1) / 2) * Math.min(3.4, 18 / n), plates = {};
    ids.forEach((id, i) => { W.put(id, slotX(i), -2.8, 0); plates[id] = nameplate(S, ctx, id, 2, .6); plates[id].mesh.position.set(slotX(i), 4.4, -2.8); plates[id].set(''); });
    const bGeo = new THREE.BoxGeometry(1.1, 1.1, 1.1), tGeo = new THREE.BoxGeometry(1.14, .2, 1.14), tMat = new THREE.MeshStandardMaterial({ color: 0xf5f0e0, flatShading: true });
    const pms = [];
    S.anim((dt, tn) => { stripes.forEach((s, k) => { s.position.x = -BX + ((k * (2 * BX / 21) + tn * 3.2) % (2 * BX)); }); zone.material.opacity = .25 + Math.sin(tn * 5) * .08; lampL.forEach((l, k) => l.scale.setScalar(1 + Math.sin(tn * 2 + k) * .08)); });

    // ---------- host simulation ----------
    let ps = [], nid = 0, spawned = 0, spawnT = 1.4, time = 0, caught = 0, missed = 0, acc = 0, over = false, rk = null, ended = false, evN = 0, evs = [], seenEv = 0;
    const lock = {}; ids.forEach(id => lock[id] = 0);
    const ev = (k, c, id) => { evs.push({ n: ++evN, k, c, id }); if (evs.length > 14) evs.shift(); };
    const pack = () => ({ ps: ps.map(p => [p.c, +p.x.toFixed(3)]), ev: evs, ca: caught, mi: missed, sp: spawned, o: rk, lk: Math.max(0, lock[me] || 0) > 0 ? 1 : 0 });
    let snap = pack();
    const finish = () => {
      if (over) return; over = true; const r = caught / TOTAL; rk = r >= TIER[0] ? 0 : r >= TIER[1] ? 1 : r >= TIER[2] ? 2 : 3;
      S.after(2.4, () => ctx.finish([...ids], ids.map(() => Math.min(rk, n - 1))));
    };
    function grab(id, c) {
      if (over || lock[id] > 0 || c < 0 || c >= C || owner(c) !== id) return;
      let best = null; for (const p of ps) if (p.c === c && p.x >= Z0 && p.x <= Z1 && (!best || p.x > best.x)) best = p;
      if (!best) { lock[id] = .6; ev('j', c, id); return; }
      ps.splice(ps.indexOf(best), 1); caught++; ev('c', c, id);
    }
    function step(dt) {
      time += dt; for (const id of ids) lock[id] -= dt;
      if (spawned < TOTAL && (spawnT -= dt) <= 0) { const f = spawned / TOTAL; spawnT = (1.2 - .6 * f) * [1, .88, .75][D] * (n === 1 ? 1.3 : 1) * (.85 + Math.random() * .3); ps.push({ c: Math.random() * C | 0, x: 0, bt: null }); spawned++; }
      const v = [1, 1.12, 1.25][D] / (4.6 - 1.2 * Math.min(1, spawned / TOTAL));
      for (const p of ps) {
        p.x += v * dt;
        const o = owner(p.c); if (ctx.players[o]?.bot && p.x >= Z0 && p.bt == null) { const sk = ctx.skill?.(o) ?? .5; p.bt = Math.random() < .1 + .85 * sk ? time + (.85 - .55 * sk) * (.5 + Math.random() * .9) * .9 : Infinity; }
        if (p.bt != null && time >= p.bt) { p.bt = null; grab(o, p.c); }
      }
      ps = ps.filter(p => { if (p.x > 1.02) { missed++; ev('m', p.c, ''); return false; } return true; });
      if (spawned >= TOTAL && !ps.length) finish();
    }
    const press = c => { if (over) return; sfx('click'); if (host) { grab(me, c); } else ctx.send({ k: c }); };
    const kd = e => { if (e.repeat) return; const m = /^(Digit|Numpad)([1-8])$/.exec(e.code); if (m && mine(+m[2] - 1)) press(+m[2] - 1); };
    addEventListener('keydown', kd);
    el.onpointerdown = e => { const t = e.target.closest('[data-c]'); if (t && mine(+t.dataset.c)) { e.stopPropagation(); press(+t.dataset.c); } };
    const px = x => -BX + x * 2 * BX;

    // ---------- rendering ----------
    return {
      update(dt) {
        if (host) { step(dt); snap = pack(); if ((acc += dt) >= .05) { acc = 0; ctx.send(snap); } }
        for (const v of snap.ev) if (v.n > seenEv) {
          seenEv = v.n;
          if (v.k === 'c') { W.burst(px((Z0 + Z1) / 2), 1.6, 0, CSS[v.c], 12); if (v.id) { W.hop(v.id, .4); plates[v.id]?.set('✔'); } sfx('coin'); }
          else if (v.k === 'm') { W.burst(BX + .5, 1, 0, '#ff3b30', 10); sfx('lose'); W.shake(.06, .15); }
          else if (v.id) { W.popIcon(v.id, '✋'); plates[v.id]?.set('jammed', true); }
        }
        while (pms.length < snap.ps.length) { const g = new THREE.Group(); g.add(new THREE.Mesh(bGeo, new THREE.MeshStandardMaterial({ flatShading: true })), new THREE.Mesh(tGeo, tMat)); S.root.add(g); pms.push(g); }
        pms.forEach((g, i) => { const p = snap.ps[i]; g.visible = !!p; if (!p) return; g.position.set(px(p[1]), 1.6, 0); g.children[0].material.color.setHex(COLS[p[0]]); g.rotation.y = Math.sin(i * 7 + p[1] * 9) * .15; });
        if (snap.o != null && !ended) { ended = true; ids.forEach(id => W.emote(id, snap.o < 3 ? 'cheer' : 'sad')); sfx(snap.o < 3 ? 'win' : 'lose'); }
        const tiles = Array.from({ length: C }, (_, c) => `<div data-c="${c}" style="display:inline-block;margin:2px;padding:6px 10px;border-radius:8px;background:${CSS[c]};color:#111;font-weight:800;opacity:${mine(c) ? 1 : .45};outline:${mine(c) ? '3px solid #fff' : 'none'}">${c + 1}<small style="display:block;font-size:10px">${ctx.esc(ctx.players[owner(c)].name)}</small></div>`).join('');
        el.innerHTML = snap.o != null ? `<h2>${snap.o < 3 ? '🏆 ' : ''}${NAMES[snap.o]}!</h2><div>Delivered ${snap.ca}/${TOTAL}</div>`
          : `<h3>Delivered ${snap.ca}/${TOTAL} &nbsp; Dropped ${snap.mi}</h3><div>${tiles}</div><div>${snap.lk ? '✋ jammed!' : 'Press your colour in the green zone'}</div>`;
      },
      onMessage(m, from) {
        if (host) { if (m.k != null && ids.includes(from)) grab(from, m.k | 0); }
        else if (m.ps) snap = m;
      },
      cleanup() { removeEventListener('keydown', kd); el.remove(); S.cleanup(); },
    };
  },
};
