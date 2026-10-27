import * as THREE from 'three';
import { sfx } from '../sfx.js';
import { scoreboard, jit, mix } from './util.js';
import { stage, fitDist } from './stage.js';
import { share, nameplate } from './kit.js';
// Is the next card higher or lower? +1 correct, -1 wrong, tie = no change. 20 seconds. (HUD buttons / W-S keys are unchanged.)
// Set: a night-time casino. A giant card on a stand flips to each new value; neon ▲ / ▼ signs flash green or red for your answer.
// Everyone else stands behind the felt table with a live score over their head and a tick or a cross for each guess they make.
const RANK = r => r === 1 ? 'A' : r === 11 ? 'J' : r === 12 ? 'Q' : r === 13 ? 'K' : String(r), SUITS = ['♠', '♥', '♦', '♣'];
export default {
  name: 'Higher or Lower', desc: 'Is the next card higher or lower? W/Up = higher, S/Down = lower. +1 correct, -1 wrong. 20 seconds!',
  create(ctx) {
    const sb = scoreboard(ctx, { timeout: 30, lower: false, bot: s => ({ v: Math.round(jit(mix(2, 13, s), .25)), t: 20 }) }), cards = Array.from({ length: 80 }, () => 1 + ctx.rng() * 13 | 0);
    let i = 0, score = 0, time = 0, done = false, note = '', shown = -1, flip = null, flashT = 0, flashSide = 0, flashCol = 0;
    const W = ctx.world, ids = Object.keys(ctx.players), n = ids.length, me = ctx.me, st = {}, np = {}; ids.forEach(id => st[id] = 0);
    const el = document.createElement('div'); el.className = 'mg';
    el.innerHTML = '<h3 id="s"></h3><h2 id="c"></h2><div><button data-d="1">▲ Higher</button> <button data-d="0">▼ Lower</button></div><div id="n"></div>';
    ctx.hud.append(el); const s = el.querySelector('#s'), c = el.querySelector('#c'), nn = el.querySelector('#n');

    // ---------- the set ----------
    const dist = fitDist(W, 10.6, 14);
    const S = stage(ctx, { sky: 0x14050f, fog: { color: 0x14050f, near: 30, far: 70 }, light: .85, sun: { intensity: .8, color: 0xffd9b0, pos: [3, 14, 10] }, cam: { pos: [0, 6.2, dist], look: [0, 3, -1] }, camFrom: [0, 11, dist + 9], camT: 1.4 });
    S.box(80, .5, 50, 0x4a0f1f, 0, -.5, -8); S.box(36, 15, .5, 0x2a0a1a, 0, 0, -10);
    const sign = S.screen(8.6, 1.3, 512, 80); sign.mesh.position.set(0, 10.8, -9.6); sign.draw((c_, w, h) => { c_.fillStyle = '#12020c'; c_.fillRect(0, 0, w, h); c_.fillStyle = '#ff4dd8'; c_.font = 'bold 52px sans-serif'; c_.textAlign = 'center'; c_.fillText('HIGHER or LOWER', w / 2, 60); });
    for (const sd of [-1, 1]) for (let k = 0; k < 2; k++) { const x = sd * (11.5 + k * 2.4); S.box(1.8, 3.4, 1.5, 0x333344, x, 0, -7.5); const sc_ = S.screen(1.3, 1.1, 64, 64); sc_.mesh.position.set(x, 2.5, -6.72); sc_.draw((c_, w, h) => { c_.fillStyle = ['#ff4dd8', '#ffd93d', '#4dd0e1', '#7cf08a'][(k + (sd > 0 ? 2 : 0)) % 4]; c_.fillRect(0, 0, w, h); }); }   // slot machines
    S.cyl(7.3, 7.3, .9, 0x5a3a1a, 0, 0, 1.4, { seg: 40 }); S.cyl(7, 7, .14, 0x0d6b3f, 0, .88, 1.4, { seg: 40 });
    [[-3.6, 3.2, 0xe74c3c], [3.6, 3.2, 0x3498db], [-5, 1.2, 0xf1c40f], [5, 1.2, 0x2ecc71]].forEach(([x, z, col]) => { for (let k = 0; k < 5; k++) S.cyl(.34, .34, .1, col, x, 1 + k * .11, z, { seg: 10 }); });   // chip stacks
    for (let k = 0; k < 5; k++) { const x = -8 + k * 4; S.cyl(.1, .12, 1.4, 0xd4a017, x, 0, 6, { seg: 6 }); S.sph(.2, 0xd4a017, x, 1.45, 6, { seg: 6 }); }                                                    // rope posts
    const cardG = new THREE.Group(); cardG.position.set(0, 3.7, -.6); S.root.add(cardG); S.box(3.5, 4.7, .12, 0xfdfdf5, 0, -2.35, -.07, { p: cardG });
    const face = S.screen(3.2, 4.4, 256, 352); face.mesh.position.z = .01; cardG.add(face.mesh); S.box(1.9, .18, .8, 0x3a2a1a, 0, -2.6, -.3, { p: cardG });
    const drawCard = (rank, k) => face.draw((c_, w, h) => { const red = k % 2 === 1 || k === 2, col = red ? '#d62828' : '#1a1a1a'; c_.fillStyle = '#fffdf2'; c_.fillRect(0, 0, w, h); c_.strokeStyle = '#ccc'; c_.lineWidth = 6; c_.strokeRect(5, 5, w - 10, h - 10); c_.fillStyle = col; c_.textAlign = 'center'; c_.font = 'bold 150px serif'; c_.fillText(RANK(rank), w / 2, 205); c_.font = 'bold 56px serif'; c_.fillText(SUITS[k], w / 2, 290); c_.font = 'bold 46px serif'; c_.fillText(RANK(rank), 44, 56); c_.fillText(RANK(rank), w - 44, h - 22); });
    const mkArrow = (sd, down) => { const g = new THREE.Group(); g.position.set(sd * 4.6, 4, -.6); S.root.add(g); const b = S.box(.7, 1.3, .3, 0xffffff, 0, -1.4, 0, { p: g }), cone = S.cone(1.1, 1.2, 0xffffff, 0, -.1, 0, { p: g, seg: 3 }); cone.scale.z = .3; if (down) g.rotation.z = Math.PI; return [b, cone]; };
    const arrows = [mkArrow(-1, false), mkArrow(1, true)];      // left = higher, right = lower
    ids.forEach((id, k) => { const sd = k % 2 ? 1 : -1, x = sd * (4.4 + (k >> 1) * 1.7); W.put(id, x, -4, 0); np[id] = nameplate(S, ctx, id); np[id].mesh.position.set(x, 3.4, -4); np[id].set('0'); });
    S.anim(dt => {
      if (shown !== i && !flip) { if (shown < 0) { shown = i; drawCard(cards[i], i * 7 % 4); } else flip = { t: 0, to: i }; }
      if (flip) { flip.t += dt * 4.5; if (flip.t >= .5 && shown !== flip.to) { shown = flip.to; drawCard(cards[shown], shown * 7 % 4); } cardG.rotation.y = flip.t < .5 ? flip.t * Math.PI : (flip.t - 1) * Math.PI; if (flip.t >= 1) { cardG.rotation.y = 0; flip = null; } }
      flashT = Math.max(0, flashT - dt); arrows.forEach((p, sd) => p.forEach(m => m.material.color.setHex(flashT > 0 && flashSide === sd ? flashCol : 0xffffff)));
      ids.forEach(id => np[id].set(String(id === me ? score : st[id])));
    });
    const net = share(ctx, 's', ev => { if (!(ev.id in st)) return; st[ev.id] = ev.sc | 0; W.popIcon(ev.id, ev.ok ? '✅' : '❌'); if (ev.ok) W.hop(ev.id, .4); });

    // ---------- play ----------
    const guess = up => {
      if (done) return; const a = cards[i], b = cards[i + 1]; i++; let ok = false;
      if (a === b) { note = 'Tie - no change'; flashCol = 0xffd93d; } else if ((b > a) === up) { score++; ok = true; note = '✓ Correct'; sfx('click'); flashCol = 0x2ecc71; } else { score--; note = '✗ Wrong'; sfx('lose'); flashCol = 0xe74c3c; }
      flashT = .5; flashSide = up ? 0 : 1; if (a !== b) { W.popIcon(me, ok ? '✅' : '❌'); if (ok) W.hop(me, .4); net.emit({ sc: score, ok }); }
    };
    el.onpointerdown = e => { const b = e.target.closest('[data-d]'); if (b) { e.stopPropagation(); guess(b.dataset.d === '1'); } };
    const key = e => { if (e.code === 'KeyW' || e.code === 'ArrowUp') guess(true); else if (e.code === 'KeyS' || e.code === 'ArrowDown') guess(false); };
    addEventListener('keydown', key);
    return {
      update(dt) {
        sb.prog(score), sb.tick(dt); time += dt; if (!done && time >= 20) { done = true; sb.report(score); W.emote(me, 'cheer'); }
        s.textContent = done ? `Final score: ${score} - waiting for others...` : `${Math.ceil(20 - time)}s   Score: ${score}`;
        c.textContent = done ? '' : cards[i]; nn.textContent = note;
      },
      endNow() { sb.endNow(); },
      onMessage(m, from) { if (net.handle(m, from)) return; sb.onMessage(m, from); },
      cleanup() { removeEventListener('keydown', key); el.remove(); S.cleanup(); },
    };
  },
};
