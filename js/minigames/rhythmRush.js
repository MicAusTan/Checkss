import { sfx } from '../sfx.js';
import { scoreboard, mix } from './util.js';
import { stage, fitDist } from './stage.js';
// Same seeded notes for everyone. Lanes: D F J K (or 1 2 3 4). Perfect = 10, good = 5, stray press = -2.
// Set: a neon concert highway. Your notes slide down the lanes in 3D; everyone else is the crowd on the sides, hopping when
// they hit notes, with a live score under each avatar (hits are shared a few times a second -- scoring is still per-client).
const K4 = { KeyD: 0, KeyF: 1, KeyJ: 2, KeyK: 3, Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3 }, C4 = ['#e74c3c', '#f1c40f', '#2ecc71', '#3498db'];
const K6 = { KeyS: 0, KeyD: 1, KeyF: 2, KeyJ: 3, KeyK: 4, KeyL: 5, Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Digit5: 4, Digit6: 5 }, C6 = ['#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#3498db', '#9b59b6'];
const HZ = 3;     // note speed (units/s), hit-line z, lane width
export default {
  tiers: [{ n: 'Normal', m: 1, pen: 0, d: '4 keys: D F J K', def: true }, { n: 'Hard', m: 1.4, pen: 1, d: '4 keys, faster and denser notes.' }, { n: 'Expert', m: 2, pen: 3, d: '6 keys: S D F J K L, fast and dense.' }],
  name: 'Rhythm Rush', desc: 'Hit the notes as they cross the line! Keys D F J K (or 1 2 3 4); on Expert S D F J K L (or 1-6). Highest score wins.',
  create(ctx) {
    const D = ctx.diff ?? 0, L = D === 2 ? 6 : 4, V = [14, 16.5, 17.5][D], LANE = L === 6 ? 1.25 : 1.5, laneX = l => (l - (L - 1) / 2) * LANE;           // tier: note speed, lane count
    const KEYS = L === 6 ? K6 : K4, COLS = L === 6 ? C6 : C4, HEX = COLS.map(c => parseInt(c.slice(1), 16)), LBL = L === 6 ? 'SDFJKL' : 'DFJK';
    const sb = scoreboard(ctx, { timeout: 40, lower: false, bot: s => { const n = notes.length, hit = mix(.45, .95, s), perf = mix(.2, .75, s); return { v: Math.round(n * hit * (5 + 5 * perf) - n * (1 - hit) * 1.5), t: endT }; } }), notes = []; let t = 2;
    while (t < 17) { notes.push({ t, l: ctx.rng() * L | 0, hit: 0 }); t += [.35, .28, .27][D] + ctx.rng() * [.4, .33, .3][D]; }
    const endT = notes[notes.length - 1].t + 1; let time = 0, score = 0, done = false, fb = '', fl = Array(L).fill(0), pendQ = null, sendT = 0, tt = 0;
    const W = ctx.world, ids = Object.keys(ctx.players), n = ids.length, me = ctx.me, sc = {}, dirty = {}; ids.forEach(id => { sc[id] = 0; dirty[id] = true; });

    // ---------- the set ----------
    const dist = fitDist(W, 8.2, 10);
    const S = stage(ctx, { sky: 0x07050f, fog: { color: 0x07050f, near: 28, far: 62 }, light: .75, sun: { intensity: .5, pos: [0, 10, 5] }, cam: { pos: [0, dist * .58, dist], look: [0, .4, -6], fov: 58 }, camFrom: [0, 12, 18], camT: 1.4 });
    S.box(70, .5, 100, 0x120c24, 0, -.5, -28);
    S.box(LANE * L + .4, .1, 72, 0x1a1530, 0, 0, -30);
    for (let l = 0; l < L; l++) S.box(LANE - .12, .02, 72, 0x241d45, laneX(l), .1, -30);
    for (let l = 0; l <= L; l++) S.box(.06, .05, 72, 0x6b5cff, (l - L / 2) * LANE, .1, -30, { em: 0x3a2f99 });
    S.box(LANE * L + .4, .08, .18, 0xffffff, 0, .12, HZ, { basic: true });
    const flash = Array.from({ length: L }, (_, l) => { S.cyl(.55, .55, .05, HEX[l], laneX(l), .12, HZ, { basic: true, op: .55 }); return S.box(LANE - .12, .03, 7, HEX[l], laneX(l), .13, HZ - 3.2, { basic: true, op: 0 }); });
    const keys = S.screen(LANE * L, .8, 512, 100); keys.mesh.rotation.x = -Math.PI / 2; keys.mesh.position.set(0, .05, HZ + 1.3);
    keys.draw((c, w, h) => { c.font = `bold ${L === 6 ? 50 : 60}px sans-serif`; c.textAlign = 'center'; for (let l = 0; l < L; l++) { c.fillStyle = COLS[l]; c.fillText(LBL[l], w / (2 * L) + l * w / L, 70); } });
    const meshes = notes.map(nt => S.box(LANE - .35, .28, .7, HEX[nt.l], laneX(nt.l), .15, -99, { em: (HEX[nt.l] >> 1) & 0x7f7f7f }));
    for (let z = -2; z > -50; z -= 8) for (const sd of [-1, 1]) { S.cyl(.18, .22, 3.2, 0x2a2250, sd * 3.7, 0, z, { seg: 8 }); S.sph(.32, HEX[(z / -8 | 0) % 4], sd * 3.7, 3.4, z, { basic: true }); }   // light pylons
    const eq = []; for (let i = 0; i < 15; i++) eq.push(S.box(1, 1, 1, HEX[i % 4], (i - 7) * 1.5, 0, -50, { em: (HEX[i % 4] >> 1) & 0x7f7f7f }));   // equalizer on the horizon
    const lab = {}, side = i => i % 2 ? 1 : -1;
    ids.forEach((id, i) => {                                         // the crowd: two columns beside the highway, facing it
      const sd = side(i), z = 1 - (i >> 1) * 3.2; W.put(id, sd * 6.6, z, sd < 0 ? Math.PI / 2 : -Math.PI / 2);
      S.cone(1.3, 8, HEX[i % 4], sd * 6.6, 0, z, { basic: true, op: .09, seg: 16 });
      const l = S.screen(2.2, .8, 256, 96); l.mesh.rotation.x = -Math.PI / 2; l.mesh.position.set(sd * 4.8, .05, z); lab[id] = l;
    });
    const drawLab = id => lab[id].draw((c, w, h) => { c.fillStyle = '#000a'; c.fillRect(0, 0, w, h); c.textAlign = 'center'; c.fillStyle = ctx.players[id].color; c.font = 'bold 30px sans-serif'; c.fillText(String(ctx.players[id].name).slice(0, 12), w / 2, 34); c.fillStyle = '#fff'; c.font = 'bold 44px sans-serif'; c.fillText(String(sc[id]), w / 2, 82); });
    S.anim((dt, tn) => {
      tt += dt;
      notes.forEach((nt, i) => { const z = HZ - (nt.t - time) * V, m = meshes[i]; m.visible = !nt.hit && z > -48 && z < HZ + 2.5; m.position.z = z; });
      flash.forEach((f, l) => { f.material.opacity = Math.max(0, fl[l]) / .12 * .45; });
      eq.forEach((b, i) => { const h = .6 + Math.abs(Math.sin(tn * 3 + i * 1.3)) * 3.2; b.scale.y = h; b.position.y = h / 2; });
      ids.forEach((id, i) => { if (dirty[id]) { dirty[id] = false; drawLab(id); } const e = W.m.get(id); if (e && !e.emo) W.lean(id, Math.sin(tn * 5 + i) * .07); });
    });

    // ---------- play ----------
    const el = document.createElement('div'); el.className = 'mg'; el.innerHTML = '<h3 id="s"></h3>'; ctx.hud.append(el); const s = el.querySelector('#s');
    const react = (id, q) => { if (q === 2) W.hop(id, .6); else if (q === 1) W.hop(id, .3); };
    const key = e => {
      const l = KEYS[e.code]; if (l == null || e.repeat || done) return; fl[l] = .12; let q = 0;
      const nt = notes.find(k => !k.hit && k.l === l && Math.abs(k.t - time) < .18);
      if (nt) { nt.hit = 1; const d = Math.abs(nt.t - time); q = d < .07 ? 2 : 1; score += q === 2 ? 10 : 5; fb = q === 2 ? 'PERFECT!' : 'Good'; sfx('click'); if (q === 2) W.burst(laneX(l), .7, HZ, COLS[l], 8); }
      else { score -= 2; fb = 'Miss'; sfx('lose'); }
      sc[me] = score; dirty[me] = true; react(me, q); pendQ = q;
    };
    addEventListener('keydown', key);
    const apply = ev => { if (ev.id in sc) { sc[ev.id] = ev.sc; dirty[ev.id] = true; react(ev.id, ev.q); } };
    return {
      update(dt) {
        sb.prog(score), sb.tick(dt); time += dt; fl = fl.map(v => Math.max(0, v - dt));
        if (!done && time >= endT) { done = true; sb.report(score); sc[me] = score; dirty[me] = true; ctx.send({ k: 'h', id: me, q: -1, sc: score }); W.emote(me, 'cheer'); }
        if (pendQ !== null && (sendT -= dt) <= 0) { sendT = .12; ctx.send({ k: 'h', id: me, q: pendQ, sc: score }); pendQ = null; }     // at most ~8 messages/s per player
        s.textContent = done ? `Final: ${score} - waiting for others...` : `Score: ${score}   ${fb}`;
      },
      endNow() { sb.endNow(); },
      onMessage(m, from) {
        if (m.k === 'h') {
          if (ctx.isHost) { if (!(from in sc)) return; const ev = { k: 'h', id: from, q: Math.max(-1, Math.min(2, m.q | 0)), sc: Math.max(-999, Math.min(999, m.sc | 0)) }; apply(ev); ctx.send(ev); }
          else if (m.id !== me) apply(m);
          return;
        }
        sb.onMessage(m, from);
      },
      cleanup() { removeEventListener('keydown', key); el.remove(); S.cleanup(); },
    };
  },
};
