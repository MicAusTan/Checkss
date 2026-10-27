import * as THREE from 'three';
import { sfx } from '../sfx.js';
import { scoreboard, jit, mix } from './util.js';
import { stage, fitDist } from './stage.js';
// Set: a TV game-show studio. Simon is a big puppet on a podium: he points with his arm, a 3D arrow shows the direction, and the
// SIMON SAYS sign only lights up when he really said it. Everyone is in an arc facing him and physically reacts to their own
// presses (up = jump, left/right = turn, down = duck); other players see those reactions and a tick or a cross over the head.
const AR = ['⬅', '⬆', '➡', '⬇'], KEYS = { ArrowLeft: 0, KeyA: 0, ArrowUp: 1, KeyW: 1, ArrowRight: 2, KeyD: 2, ArrowDown: 3, KeyS: 3 }, LEN = 1.6;
const ROT = [Math.PI / 2, 0, -Math.PI / 2, Math.PI];      // arrow sign rotation (z) for left / up / right / down
export default {
  name: 'Simon Says', desc: 'Press the arrow ONLY when Simon says! If the command has no "Simon says", don\'t touch anything. 14 commands.',
  create(ctx) {
    const LEN = 1.6 * [1.35, 1, .75][ctx.diff ?? 1];                // difficulty: time per step
    const sb = scoreboard(ctx, { timeout: 35, lower: false, bot: s => ({ v: Math.round(jit(mix(3, 13, s), .2)), t: 22 }) }), cmds = Array.from({ length: 14 }, () => ({ says: ctx.rng() < .65, k: ctx.rng() * 4 | 0 }));
    let i = 0, t = 0, resolved = false, score = 0, fb = '', done = false, shown = -1;
    const W = ctx.world, ids = Object.keys(ctx.players), n = ids.length, me = ctx.me, base = {};
    const el = document.createElement('div'); el.className = 'mg'; ctx.hud.append(el);

    // ---------- the set ----------
    const dist = fitDist(W, 9.5, 13), SIM = [0, -5];
    const S = stage(ctx, { sky: 0x14123a, fog: { color: 0x14123a, near: 30, far: 70 }, light: .95, sun: { intensity: .9, pos: [3, 14, 8] }, cam: { pos: [0, 5.4, dist], look: [0, 3.2, -3] }, camFrom: [0, 10, dist + 10], camT: 1.4 });
    S.cyl(15, 15, .5, 0x1f1d4a, 0, -.5, -3, { seg: 40 }); S.cyl(10, 10, .04, 0x2b2863, 0, 0, -3, { seg: 40 });
    S.box(34, 14, .5, 0x1c1850, 0, 0, -12.5);
    [0xff4d6d, 0xffd93d, 0x4dd0e1, 0x7cf08a, 0xb28dff, 0xff9f1a, 0xff4d6d].forEach((c, k) => S.box(2, 7, .3, c, (k - 3) * 3.6, 1, -12.1, { em: (c >> 1) & 0x7f7f7f }));
    S.cyl(2.3, 2.7, 1.2, 0xd4a017, SIM[0], 0, SIM[1], { seg: 24 });
    const sim = new THREE.Group(); sim.position.set(SIM[0], 1.2, SIM[1]); sim.scale.setScalar(1.3); S.root.add(sim);
    S.cyl(.55, .66, 1.5, 0x2e86de, 0, 0, 0, { p: sim }); S.cyl(.67, .67, .14, 0xffd93d, 0, .6, 0, { p: sim });
    S.sph(.5, 0xffd7b0, 0, 2, 0, { p: sim }); S.sph(.07, 0x111111, -.17, 2.08, .45, { p: sim, seg: 6 }); S.sph(.07, 0x111111, .17, 2.08, .45, { p: sim, seg: 6 });
    const mouth = S.box(.26, .1, .05, 0x7a1f1f, 0, 1.82, .48, { p: sim });
    S.cyl(.46, .46, .7, 0xe74c3c, 0, 2.38, 0, { p: sim }); S.cyl(.76, .76, .08, 0xe74c3c, 0, 2.35, 0, { p: sim }); const band = S.cyl(.47, .47, .14, 0x884400, 0, 2.4, 0, { p: sim, em: 0x000000 });
    const arms = [-1, 1].map(sd => { const g = new THREE.Group(); g.position.set(sd * .82, 1.45, 0); sim.add(g); S.box(.22, .9, .22, 0x2e86de, 0, -.9, 0, { p: g }); S.sph(.17, 0xffd7b0, 0, -.95, 0, { p: g, seg: 8 }); g.rotation.z = sd * .3; return g; });
    const arrow = new THREE.Group(); arrow.position.set(0, 6.5, SIM[1]); S.root.add(arrow);
    S.box(.55, 1.3, .35, 0xffffff, 0, -.9, 0, { p: arrow, em: 0x333333 }); S.cone(.85, 1, 0xffffff, 0, .4, 0, { p: arrow, em: 0x333333, seg: 3 }).scale.z = .45;
    const sign = S.screen(6, 1.3, 512, 110); sign.mesh.position.set(0, 8.5, SIM[1]); const bar = S.box(4, .16, .16, 0xffd93d, 0, 5.15, SIM[1] + .1, { basic: true });
    const drawSign = says => sign.draw((c, w, h) => { c.fillStyle = says ? '#b8860b' : '#2a2a3a'; c.fillRect(0, 0, w, h); c.strokeStyle = says ? '#ffe9a0' : '#555'; c.lineWidth = 8; c.strokeRect(6, 6, w - 12, h - 12); c.fillStyle = says ? '#fff' : '#777'; c.font = 'bold 66px sans-serif'; c.textAlign = 'center'; c.fillText(says ? 'SIMON SAYS' : '(...)', w / 2, 80); });
    ids.forEach((id, k) => { const a = n === 1 ? 0 : (k / (n - 1) - .5) * 2.2, x = SIM[0] + Math.sin(a) * 7.5, z = SIM[1] + Math.cos(a) * 7.5, ry = Math.atan2(SIM[0] - x, SIM[1] - z); base[id] = ry; W.put(id, x, z, ry); });
    S.anim(dt => {
      const c = cmds[Math.min(i, cmds.length - 1)];
      if (shown !== i) { shown = i; sfx(c.says ? 'n' + (2 + c.k) : 'lose'); drawSign(c.says); arrow.rotation.z = ROT[c.k]; band.material.emissive.setHex(c.says ? 0xffaa00 : 0); mouth.scale.y = c.says ? 2.4 : .6; sim.position.y = 1.2;
        const [L, R] = arms; L.rotation.z = -.3; R.rotation.z = .3; if (c.k === 0) L.rotation.z = -Math.PI / 2; else if (c.k === 2) R.rotation.z = Math.PI / 2; else if (c.k === 1) R.rotation.z = Math.PI; else { L.rotation.z = -.05; R.rotation.z = .05; } }
      bar.scale.x = done ? .001 : Math.max(.001, 1 - t / LEN); bar.material.color.setHex(t > LEN * .7 ? 0xff5a5f : 0xffd93d);
      sim.position.y = 1.2 + Math.max(0, Math.sin(Math.min(1, t * 6) * Math.PI)) * .25;
    });

    // ---------- play ----------
    const react = (id, d, ok) => {          // d: 0 left, 1 up, 2 right, 3 down
      if (d === 1) W.hop(id, .8); else if (d === 3) { W.lean(id, .55); S.after(.3, () => W.lean(id, 0)); }
      else { W.face(id, base[id] + (d === 0 ? 1 : -1) * .9); S.after(.35, () => W.face(id, base[id])); }
      W.popIcon(id, ok ? '✅' : '❌');
    };
    const key = e => {
      const k = KEYS[e.code]; if (k == null || done || resolved) return; e.preventDefault(); resolved = true; const c = cmds[i], ok = c.says && k === c.k;
      if (ok) { score++; fb = '✓'; sfx('click'); } else { score -= c.says ? 1 : 2; fb = c.says ? '✗ wrong arrow' : '✗ Simon didn\'t say!'; sfx('lose'); }
      react(me, k, ok); ctx.send({ k: 'r', id: me, d: k, ok: ok ? 1 : 0 });
    };
    addEventListener('keydown', key);
    return {
      update(dt) {
        sb.prog(score), sb.tick(dt); if (!done && (t += dt) >= LEN) {
          if (!resolved) { const c = cmds[i]; if (!c.says) { score++; fb = '✓ good restraint'; } else { score--; fb = '✗ too slow'; } }
          i++; t = 0; resolved = false; if (i >= cmds.length) { done = true; sb.report(score); W.emote(me, 'cheer'); }
        }
        const c = cmds[Math.min(i, cmds.length - 1)];
        el.innerHTML = done ? `<h3>Final: ${score} - waiting for others...</h3>` : `<h2>${c.says ? 'Simon says:' : 'Press:'} ${AR[c.k]}</h2><div>Score ${score}   ${fb}</div>`;
      },
      endNow() { sb.endNow(); },
      onMessage(m, from) {
        if (m.k === 'r') {
          if (ctx.isHost) { if (!(from in base)) return; const ev = { k: 'r', id: from, d: m.d & 3, ok: m.ok ? 1 : 0 }; react(from, ev.d, ev.ok); ctx.send(ev); }
          else if (m.id !== me && m.id in base) react(m.id, m.d & 3, m.ok);
          return;
        }
        sb.onMessage(m, from);
      },
      cleanup() { removeEventListener('keydown', key); el.remove(); S.cleanup(); },
    };
  },
};
