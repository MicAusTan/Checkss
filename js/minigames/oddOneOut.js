import * as THREE from 'three';
import { sfx } from '../sfx.js';
import { scoreboard, jit, mix } from './util.js';
import { stage, fitDist } from './stage.js';
import { pick, share, nameplate } from './kit.js';
const SETS = [['😀', '😃'], ['😄', '😁'], ['😂', '🤣'], ['🙂', '🙃'], ['😠', '😡'], ['😢', '😭'], ['😮', '😯'], ['😐', '😑'], ['🍎', '🍏'], ['🍎', '🍅'], ['🍊', '🥭'], ['🍒', '🍓'], ['🎃', '🍊'], ['🌕', '🌝'], ['🌙', '🌛'], ['⭐', '🌟'], ['🔵', '🟦'], ['🔴', '🟥'], ['🟢', '🟩'], ['🟡', '🟨'], ['🧡', '💛'], ['💙', '💜'], ['🐶', '🐺'], ['🐱', '🐯'], ['🐭', '🐹'], ['🐻', '🐨'], ['🐷', '🐗'], ['🐔', '🐥'], ['🦆', '🦢'], ['🐢', '🐊'], ['🐍', '🦎'], ['🐝', '🐞'], ['🌸', '🌺'], ['🌻', '🌼'], ['🌲', '🌳'], ['🍔', '🥪'], ['🍩', '🍪'], ['⚽', '🏀'], ['🎾', '🥎'], ['⚾', '🏐'], ['🚗', '🚕'], ['🚓', '🚑'], ['🚀', '🛸'], ['💎', '🔷'], ['🐴', '🦄'], ['🐮', '🐃']];
// Find the one emoji that's different in each of 8 grids. Wrong click = +1s. Fastest total wins.
// Set: an art gallery. The 5x5 grid is a wall of gold picture frames lit by spotlights; click the odd one out (3D picking). Wrong
// frames flash red. Everyone else strolls at the sides with a live "grid / penalty" sign over their head.
const LIKE = [['😠', '😡'], ['😴', '😪'], ['🥰', '😍'], ['😀', '😃'], ['🙂', '😊'], ['🐭', '🐹'], ['🐕', '🐶'], ['🌕', '🌖'], ['🕐', '🕑'], ['🔶', '🔸'], ['🍊', '🍑'], ['🐱', '🐈']];   // look-alike pairs for the harder tiers
export default {
  tiers: [{ n: 'Normal', m: 1, pen: 0, d: '5x5 grid.', def: true }, { n: 'Hard', m: 1.4, pen: 1, d: '9x9 grid, look-alike emoji.' }, { n: 'Insane', m: 2, pen: 3, d: '14x14 grid - tiny, look-alike emoji.' }],
  name: 'Odd One Out', desc: 'Find the one emoji that\'s different! 8 grids, fastest wins. A wrong click costs 1 second.',
  create(ctx) {
    const D = ctx.diff ?? 0, G = [5, 9, 14][D], SP = D ? 12 / G : 1.75, KF = SP / 1.75, CY = D ? 6.4 : 6.7;                 // big grids fill the whole wall
    const sb = scoreboard(ctx, { timeout: [70, 110, 170][D], bot: s => { const T = jit(mix(40, 15, s), .15) * [1, 1.7, 2.8][D]; return { v: Math.round(T * 1000), t: T }; } }), bag = D ? [...LIKE] : [...SETS];
    for (let k = bag.length - 1; k > 0; k--) { const j = ctx.rng() * (k + 1) | 0; [bag[k], bag[j]] = [bag[j], bag[k]]; }   // shuffled: no repeated sets in a game
    const rounds = Array.from({ length: 8 }, (_, k) => ({ s: bag[k], odd: ctx.rng() * G * G | 0 }));
    let i = 0, pen = 0, time = 0, done = false, lastT = '', shownG = -1;
    const W = ctx.world, ids = Object.keys(ctx.players), n = ids.length, me = ctx.me, st = {}, np = {}; ids.forEach(id => st[id] = { g: 0, p: 0 });
    const el = document.createElement('div'); el.className = 'mg'; el.innerHTML = '<h3 id="t"></h3>'; ctx.hud.append(el); const tl = el.querySelector('#t');

    // ---------- the set ----------
    const dist = fitDist(W, 10, 15) * 1.12;
    const S = stage(ctx, { sky: 0x2b2a33, fog: { color: 0x2b2a33, near: 34, far: 80 }, light: 1.05, sun: { intensity: .8, pos: [2, 14, 10] }, cam: { pos: [0, 5.6, dist], look: [0, 6.2, 0] }, camFrom: [0, 9, dist + 9], camT: 1.4 });
    S.box(80, .5, 40, 0xcfd2d8, 0, -.5, -4); S.box(16, 12.6, .5, 0xeae6dc, 0, 0, -.35); S.box(16.4, .35, .8, 0x7a5a3a, 0, 0, -.1); S.box(16.4, .35, .8, 0x7a5a3a, 0, 12.4, -.1);
    for (let k = 0; k < 5; k++) S.cone(1.3, 11, 0xfff2c8, (k - 2) * 1.9, 0, 3, { basic: true, op: .07, seg: 14 });                                                    // spotlight shafts
    for (const sd of [-1, 1]) { S.box(3, .5, 1, 0x7a5a3a, sd * 11, 0, 1); S.box(.2, 1, .2, 0x4a3a2a, sd * 11 - 1.1, 0, 1); S.box(.2, 1, .2, 0x4a3a2a, sd * 11 + 1.1, 0, 1); }   // benches
    const frames = Array.from({ length: G * G }, (_, k) => {
      const col = k % G, row = k / G | 0, x = (col - (G - 1) / 2) * SP, y = CY + ((G - 1) / 2 - row) * SP;
      const box = S.box(1.5 * KF, 1.5 * KF, .18, 0xd4a017, x, y - .75 * KF, .05); box.userData.k = k;
      const pic = S.screen(1.2 * KF, 1.2 * KF, 128, 128); pic.mesh.position.set(x, y, .15); return { box, pic, x, y };
    });
    const drawGrid = () => frames.forEach((f, k) => f.pic.draw((c, w, h) => { const r = rounds[i]; c.fillStyle = '#fffdf2'; c.fillRect(0, 0, w, h); c.font = '84px serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(r.s[k === r.odd ? 1 : 0], w / 2, h / 2 + 6); }));
    ids.forEach((id, k) => { const sd = k % 2 ? 1 : -1, z = 1.4 - (k >> 1) * 2.6, x = sd * 7.4; W.put(id, x, z, sd < 0 ? Math.PI / 2 : -Math.PI / 2); np[id] = nameplate(S, ctx, id, 2.1, .72); np[id].mesh.position.set(x, 3.4, z); np[id].set('Grid 1/8'); });
    S.anim(() => {
      if (shownG !== i && !done) { shownG = i; drawGrid(); }
      if (done && shownG !== 99) { shownG = 99; frames.forEach(f => f.pic.draw((c, w, h) => { c.fillStyle = '#fffdf2'; c.fillRect(0, 0, w, h); c.fillStyle = '#2ecc71'; c.font = 'bold 80px sans-serif'; c.textAlign = 'center'; c.fillText('✓', w / 2, h / 2 + 28); })); }
      ids.forEach(id => { const q = id === me ? { g: i, p: pen } : st[id]; np[id].set(q.g >= 8 ? 'DONE!' : `Grid ${q.g + 1}/8${q.p ? '  x' + q.p : ''}`); });
    });
    const net = share(ctx, 'o', ev => { const q = st[ev.id]; if (!q) return; if ((ev.g | 0) > q.g) W.hop(ev.id, .4); else if ((ev.p | 0) > q.p) W.popIcon(ev.id, '❌'); st[ev.id] = { g: ev.g | 0, p: ev.p | 0 }; });

    // ---------- play ----------
    const onDown = e => {
      if (done) return; const b = pick(W, S.root, e, frames.map(f => f.box)); if (!b) return; const f = frames[b.userData.k];
      if (b.userData.k === rounds[i].odd) { i++; sfx('click'); W.hop(me, .4); W.burst(f.x, f.y, .5, '#ffd93d', 14); net.emit({ g: i, p: pen }); if (i >= rounds.length) { done = true; sb.report(Math.round(time * 1000 + pen * 1000)); W.emote(me, 'cheer'); } }
      else { pen++; sfx('lose'); W.shake(.1, .15); b.material.emissive.setHex(0xaa0000); S.after(.25, () => b.material.emissive.setHex(0)); W.popIcon(me, '❌'); net.emit({ g: i, p: pen }); }
    };
    addEventListener('pointerdown', onDown);
    return {
      update(dt) {
        sb.prog(i / rounds.length), sb.tick(dt); if (!done) time += dt;
        const t = done ? `Done! ${(time + pen).toFixed(1)}s - waiting for others...` : `Grid ${i + 1}/8   ${time.toFixed(1)}s   Penalty: ${pen}s`; if (t !== lastT) { tl.textContent = t; lastT = t; }
      },
      endNow() { sb.endNow(); },
      onMessage(m, from) { if (net.handle(m, from)) return; sb.onMessage(m, from); },
      cleanup() { removeEventListener('pointerdown', onDown); el.remove(); S.cleanup(); },
    };
  },
};
