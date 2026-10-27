import * as THREE from 'three';
import { sfx } from '../sfx.js';
import { scoreboard, jit, mix } from './util.js';
import { stage, fitDist } from './stage.js';
import { pick, share, nameplate } from './kit.js';
// Same seeded deck for everyone. Score = time + 1.5s per miss (lower wins).
// Set: a sunny picnic. The 16 cards lie on a blanket and really flip over when you click them (3D picking). Everyone else sits at
// the sides with a live "pairs / misses" sign over their head; their matches are shared as they happen.
export default {
  tiers: [{ n: '4x4', m: 1, pen: 0, d: '8 pairs, 1.5s per miss.', def: true }, { n: '5x5', m: 1.4, pen: 1, d: '12 pairs + a free star, 1.1s per miss.' }, { n: '6x6', m: 2, pen: 2, d: '18 pairs, 0.8s per miss.' }],
  name: 'Memory Match', desc: 'Find all the pairs as fast as you can! Every wrong guess costs a little time (less on bigger boards).',
  create(ctx) {
    const D = ctx.diff ?? 0, COLS = [4, 5, 6][D], CNT = COLS * COLS, PAIRS = [8, 12, 18][D], PEN = [1.5, 1.1, .8][D], KF = [1, .8, .66][D], J = CNT - PAIRS * 2, PM = PAIRS / 8;       // J = 1 free star card on the 5x5
    const sb = scoreboard(ctx, { timeout: [80, 130, 200][D], bot: s => { const T = jit(mix(46, 22, s), .15) * PM, miss = Math.round(jit(mix(13, 3, s), .25) * PM); return { v: Math.round((T + miss * PEN) * 1000), t: T }; } }), pool = ['🍎', '🍌', '🍇', '🍒', '🍋', '🥝', '🍉', '🍓', '🍑', '🍍', '🥥', '🥕', '🌽', '🍄', '🍕', '🍔', '🍩', '🍪', '🎂', '🍿', '🐶', '🐱', '🐸', '🐵', '🐧', '🦊', '🐼', '🐙', '🦋', '🐢', '🦄', '🐝', '⚽', '🏀', '🎸', '🎲', '🚀', '🚗', '⭐', '🌈', '🔥', '💎', '🎈', '🎁', '🔔', '🌻', '🌵', '🍀'];
    for (let i = pool.length - 1; i > 0; i--) { const j = ctx.rng() * (i + 1) | 0; [pool[i], pool[j]] = [pool[j], pool[i]]; }   // random symbols per game
    pool.push('🍩', '🍪', '🍦', '🥨', '🍔', '🌮', '🍰', '🥑');
    for (let i = pool.length - 1; i > 0; i--) { const j = ctx.rng() * (i + 1) | 0; [pool[i], pool[j]] = [pool[j], pool[i]]; }
    const syms = pool.slice(0, PAIRS), deck = [...syms, ...syms];
    for (let i = deck.length - 1; i > 0; i--) { const j = ctx.rng() * (i + 1) | 0; [deck[i], deck[j]] = [deck[j], deck[i]]; }
    if (J) deck.splice(CNT >> 1, 0, '⭐');
    let open = [], matched = new Set(), busy = 0, miss = 0, time = 0, done = false, lastT = '';
    const W = ctx.world, ids = Object.keys(ctx.players), n = ids.length, me = ctx.me, st = {}, np = {}; ids.forEach(id => st[id] = { p: 0, m: 0 });
    const el = document.createElement('div'); el.className = 'mg'; el.innerHTML = '<h3 id="t"></h3>'; ctx.hud.append(el); const tl = el.querySelector('#t');

    // ---------- the set ----------
    const dist = fitDist(W, 9.6, 17);
    const S = stage(ctx, { sky: 0x9fd8ff, fog: { color: 0x9fd8ff, near: 60, far: 140 }, light: 1.2, sun: { intensity: 1.2, pos: [6, 18, 8] }, cam: { pos: [0, dist * .9, dist * .72], look: [0, 0, .4] }, camFrom: [0, dist * 1.6, dist * 1.2], camT: 1.4 });
    S.box(160, .5, 120, 0x6fbf4a, 0, -.5, 0); S.box(11.6, .1, 13.4, 0xd94f4f, 0, 0, 0);
    for (let j = 0; j < 7; j++) S.box(11.6, .02, .55, 0xffffff, 0, .1, -6 + j * 2, { op: .5 }); for (let j = 0; j < 6; j++) S.box(.55, .03, 13.4, 0xffffff, -5 + j * 2, .1, 0, { op: .35 });   // gingham
    S.box(1.4, 1, 1.1, 0xb07a3a, -7.2, 0, -7); S.box(1.5, .12, 1.2, 0xc99250, -7.2, 1, -7);                                                                                                // basket
    for (let k = 0; k < 40; k++) { const a = k * 2.4, r = 9 + k % 9 * 2, c = [0xff6b9d, 0xffd93d, 0xffffff, 0xb28dff][k % 4]; S.sph(.14, c, Math.sin(a) * r, .14, Math.cos(a) * r * .9, { seg: 5 }); }   // flowers
    for (let k = 0; k < 5; k++) { const x = -22 + k * 11, z = -16 - k % 2 * 4; S.cyl(.5, .7, 3.4, 0x6b4a2b, x, 0, z, { seg: 6 }); S.sph(3, 0x3f9a45, x, 5, z, { seg: 7 }); }
    const backTex = (() => { const cv = document.createElement('canvas'); cv.width = 128; cv.height = 180; const c = cv.getContext('2d'); c.fillStyle = '#2f6fd0'; c.fillRect(0, 0, 128, 180); c.strokeStyle = '#ffffffaa'; c.lineWidth = 5; for (let k = -2; k < 8; k++) { c.beginPath(); c.moveTo(0, k * 36); c.lineTo(128, k * 36 + 128); c.stroke(); c.beginPath(); c.moveTo(0, k * 36 + 128); c.lineTo(128, k * 36); c.stroke(); } const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; })();
    const cards = deck.map((sym, idx) => {
      const x = ((idx % COLS) - (COLS - 1) / 2) * 2.1 * KF, z = ((idx / COLS | 0) - (COLS - 1) / 2) * 2.7 * KF, g = new THREE.Group(); g.position.set(x, .12, z); g.scale.setScalar(KF); S.root.add(g);
      const body = S.box(1.6, .1, 2.2, 0xfaf6e8, 0, -.05, 0, { p: g }); body.userData.i = idx;
      const back = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2), new THREE.MeshBasicMaterial({ map: backTex })); back.rotation.x = -Math.PI / 2; back.position.y = .006; g.add(back);
      const cv = document.createElement('canvas'); cv.width = 128; cv.height = 180; const c = cv.getContext('2d'); c.fillStyle = '#fffdf2'; c.fillRect(0, 0, 128, 180); c.font = '84px serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(sym, 64, 96);
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; const front = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2), new THREE.MeshBasicMaterial({ map: tex })); front.rotation.x = Math.PI / 2; front.position.y = -.106; g.add(front);
      return { g, body, rot: 0 };
    });
    ids.forEach((id, k) => { const sd = k % 2 ? 1 : -1, z = -2.6 + (k >> 1) * 2.8; W.put(id, sd * 7.7, z, sd < 0 ? Math.PI / 2 : -Math.PI / 2); np[id] = nameplate(S, ctx, id); np[id].mesh.rotation.x = -.5; np[id].mesh.position.set(sd * 7.7, 3.3, z); np[id].set('0/' + PAIRS); });
    S.anim(dt => {
      cards.forEach((c, i) => {
        const up = open.includes(i) || matched.has(i); c.rot += ((up ? Math.PI : 0) - c.rot) * Math.min(1, dt * 12); c.g.rotation.x = c.rot;
        c.g.position.y = .12 + Math.sin(Math.min(1, c.rot / Math.PI) * Math.PI) * .7 * KF; if (matched.has(i) && c.rot > 3) c.body.material.color.setHex(0x9be3a5);
      });
      ids.forEach(id => np[id].set(`${st[id].p}/${PAIRS}${st[id].m ? '  x' + st[id].m : ''}`));
    });
    if (J) matched.add(CNT >> 1);                                          // the free star starts face-up
    const net = share(ctx, 'm', ev => { const q = st[ev.id]; if (!q) return; if ((ev.p | 0) > q.p) { W.hop(ev.id, .5); W.popIcon(ev.id, '✅'); } else if ((ev.m | 0) > q.m) W.popIcon(ev.id, '❌'); st[ev.id] = { p: ev.p | 0, m: ev.m | 0 }; });

    // ---------- play ----------
    const onDown = e => {
      if (done || busy > 0) return; const b = pick(W, S.root, e, cards.map(c => c.body)); if (!b) return;
      const i = b.userData.i; if (open.includes(i) || matched.has(i)) return;
      open.push(i); sfx('click');
      if (open.length === 2) {
        if (deck[open[0]] === deck[open[1]]) { open.forEach(k => matched.add(k)); open = []; sfx('coin'); st[me].p = (matched.size - J) / 2; W.hop(me, .6); const c = cards[i].g.position; W.burst(c.x, 1, c.z, '#ffd93d', 12); net.emit({ p: st[me].p, m: miss }); if (matched.size === CNT) { done = true; sb.report(Math.round(time * 1000 + miss * PEN * 1000)); W.emote(me, 'cheer'); } }
        else { miss++; busy = .7; sfx('lose'); st[me].m = miss; W.popIcon(me, '❌'); net.emit({ p: st[me].p, m: miss }); }
      }
    };
    addEventListener('pointerdown', onDown);
    return {
      update(dt) {
        sb.prog((matched.size - J) / (CNT - J)), sb.tick(dt); if (!done) time += dt;
        if (busy > 0 && (busy -= dt) <= 0) open = [];
        const t = done ? `Done! ${(time + miss * PEN).toFixed(1)}s - waiting for others...` : `${time.toFixed(1)}s  Misses: ${miss}`; if (t !== lastT) { tl.textContent = t; lastT = t; }
      },
      endNow() { sb.endNow(); },
      onMessage(m, from) { if (net.handle(m, from)) return; sb.onMessage(m, from); },
      cleanup() { removeEventListener('pointerdown', onDown); el.remove(); S.cleanup(); },
    };
  },
};
