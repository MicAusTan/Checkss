import * as THREE from 'three';
import { sfx } from '../sfx.js';
import { scoreboard, mix, rnd } from './util.js';
import { stage } from './stage.js';
// Target Time: unlike Stop the Clock the timer stays visible. 3 rounds, each with a random target time - press SPACE / click when the
// running timer hits it. Your score is the total miss in milliseconds (lowest wins). Targets come from the shared seeded rng.
const ROUNDS = 3;
export default {
  emotes: false, name: 'Target Time', desc: `A timer counts up and a random target time is shown. Press SPACE (or click) the moment the timer hits the target! ${ROUNDS} rounds, the smallest total miss wins.`,
  create(ctx) {
    const targets = Array.from({ length: ROUNDS }, () => +(2.5 + ctx.rng() * 7).toFixed(2)), ids = Object.keys(ctx.players), n = ids.length, me = ctx.me, W = ctx.world;
    const sb = scoreboard(ctx, { timeout: targets.reduce((a, b) => a + b, 0) + 30, grace: 2.5, bot: s => ({ v: Math.round(targets.reduce((a, _) => a + rnd(0, mix(900, 90, s)), 0)), t: targets.reduce((a, b) => a + b, 0) + ROUNDS * 1.6 + 1 }) });
    let r = 0, t = -1, phase = 'wait', total = 0, drawn = '', pause = 1.2; const errs = [];
    const S = stage(ctx, { sky: 0x1b1340, fog: { color: 0x1b1340, near: 30, far: 75 }, light: .95, sun: { intensity: .9, pos: [0, 14, 8] }, cam: { pos: [0, 5.2, 13], look: [0, 3.6, 0] }, camFrom: [0, 9, 21], camT: 1.4 });
    S.cyl(40, 40, .5, 0x241c52, 0, -.5, 0, { seg: 40 }); S.box(11, 5.6, .6, 0x15112e, 0, 1.2, -1.2); S.box(11.4, .3, .8, 0xffd93d, 0, 6.8, -1.1); S.box(11.4, .3, .8, 0xffd93d, 0, .9, -1.1);
    const disp = S.screen(10.4, 5, 512, 250); disp.mesh.position.set(0, 4, -.85);
    ids.forEach((id, k) => { const x = (k - (n - 1) / 2) * Math.min(1.8, 14 / n); W.put(id, x, 3.2, Math.PI); const e = W.m.get(id); if (e) e.g.scale.setScalar(.75); });
    for (let k = 0; k < 10; k++) { const a = k * .63; S.cone(1.2, 3 + k % 3, k % 2 ? 0x5a3fa0 : 0x3f5fa0, Math.sin(a) * 14, 0, -8 - Math.cos(a) * 4, { seg: 5, em: 0x120a2a }); }
    const draw = () => {
      const key = `${r}|${phase}|${t.toFixed(2)}|${errs.join()}`; if (key === drawn) return; drawn = key;
      disp.draw((c, w, h) => {
        c.fillStyle = '#0b0820'; c.fillRect(0, 0, w, h); c.textAlign = 'center'; c.fillStyle = '#ffd93d'; c.font = 'bold 34px sans-serif';
        c.fillText(r < ROUNDS ? `ROUND ${r + 1}/${ROUNDS}   TARGET` : 'DONE!', w / 2, 44);
        if (r < ROUNDS) { c.fillStyle = '#fff'; c.font = 'bold 64px monospace'; c.fillText(targets[r].toFixed(2) + 's', w / 2, 112); }
        c.fillStyle = phase === 'stopped' ? (errs[r] < 150 ? '#7cf08a' : '#ff8a5f') : '#7cf08a'; c.font = 'bold 84px monospace'; c.fillText(r < ROUNDS ? (t < 0 ? '0.00' : t.toFixed(2)) : `${Math.round(total)}ms`, w / 2, 202);
        c.fillStyle = '#9aa'; c.font = '24px sans-serif'; c.fillText(errs.map((e, i) => `R${i + 1}: ${e}ms`).join('   '), w / 2, 238);
      });
    };
    const press = () => {
      if (phase !== 'run' || r >= ROUNDS) return; const e = Math.round(Math.abs(t - targets[r]) * 1000); errs.push(e); total += e; phase = 'stopped'; pause = 1.4;
      sfx(e < 150 ? 'star' : 'click'); const g = W.m.get(me)?.g; if (e < 150 && g) { W.emote(me, 'cheer'); W.burst(g.position.x, 2.5, g.position.z, '#ffd93d', 12); } else W.hop(me, .4); sb.prog((r + 1) / ROUNDS);
      if (r + 1 >= ROUNDS) sb.report(Math.round(total));
    };
    const key = e => { if (e.code === 'Space' && !e.repeat) press(); };
    addEventListener('keydown', key); addEventListener('pointerdown', press);
    const el = document.createElement('div'); el.className = 'mg'; ctx.hud.append(el);
    return {
      update(dt) {
        sb.tick(dt);
        if (phase === 'wait') { if ((pause -= dt) <= 0) { phase = 'run'; t = 0; sfx('go'); } }
        else if (phase === 'run') { t += dt; if (t > targets[r] + 3) { errs.push(3000); total += 3000; phase = 'stopped'; pause = 1.2; sfx('lose'); if (r + 1 >= ROUNDS) sb.report(Math.round(total)); } }
        else if (phase === 'stopped' && (pause -= dt) <= 0) { r++; if (r < ROUNDS) { phase = 'wait'; t = -1; pause = 1; } else phase = 'done'; }
        draw();
        el.textContent = phase === 'done' ? `Total miss: ${Math.round(total)}ms - waiting for others...` : phase === 'run' ? 'Press at the target!' : '';
        el.style.display = el.textContent ? '' : 'none';
      },
      endNow() { sb.endNow(); },
      onMessage(m, from) { sb.onMessage(m, from); },
      cleanup() { removeEventListener('keydown', key); removeEventListener('pointerdown', press); el.remove(); S.cleanup(); },
    };
  },
};
