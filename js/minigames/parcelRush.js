import * as THREE from 'three';
import { sfx } from '../sfx.js';
import { scoreboard, jit, mix } from './util.js';
import { stage } from './stage.js';
// Parcel Rush: the free-for-all, much harder cousin of Parcel Panic. Everyone works their OWN conveyor, but all conveyors carry the same
// seeded parcel stream, so it is fair. You juggle 5 parcel colours (keys 1-5 / 1-7 or tap) and the belt keeps speeding up. A parcel caught in the
// green zone = +1 (+ streak bonus); pressing a colour that isn't there = -1 and jams your hands for a moment.
const COLS7 = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf1c40f, 0x9b59b6, 0xe67e22, 0x1abc9c], CSS7 = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#e67e22', '#1abc9c'], DUR = 30, Z0 = .7, Z1 = .97, BX = 10;
export default {
  tiers: [{ n: 'Normal', m: 1, pen: 0, d: '5 colours.', def: true }, { n: 'Hard', m: 1.4, pen: 1, d: '6 colours, faster belt, more parcels.' }, { n: 'Insane', m: 2, pen: 2, d: '7 colours, much faster belt.' }],
  emotes: false, name: 'Parcel Rush', desc: 'FREE FOR ALL! Parcels of 5 colours ride your conveyor, faster and faster. When one reaches the green zone press its number key (1-5) or tap its tile. Streaks score bonus points; wrong presses cost a point and jam your hands. 30 seconds.',
  create(ctx) {
    const D = ctx.diff ?? 0, C = [5, 6, 7][D], COLS = COLS7.slice(0, C), CSS = CSS7.slice(0, C), SPD = [1, 1.15, 1.3][D], GAP = [1, .88, .78][D];
    const W = ctx.world, ids = Object.keys(ctx.players), n = ids.length, me = ctx.me;
    const stream = []; { let t = .8; for (let k = 0; k < 120; k++) { stream.push({ t, c: ctx.rng() * C | 0 }); t += Math.max(.28, .95 - k * .016) * GAP * (.7 + ctx.rng() * .6); } }     // the same for everyone
    const sb = scoreboard(ctx, { timeout: DUR + 10, lower: false, grace: 1.5, bot: s => ({ v: Math.round(jit(mix(10, 40, s), .15)), t: DUR }) });
    let time = 0, score = 0, streak = 0, jam = 0, nextS = 0, done = false, ps = []; const pms = [];
    const el = document.createElement('div'); el.className = 'mg';
    el.innerHTML = '<h3 id="s"></h3><div>' + CSS.map((c, k) => `<button data-c="${k}" style="background:${c};width:52px;height:44px;margin:3px">${k + 1}</button>`).join('') + '</div>'; ctx.hud.append(el); const s = el.querySelector('#s');
    const S = stage(ctx, { sky: 0x20242e, fog: { color: 0x20242e, near: 40, far: 95 }, light: .95, sun: { color: 0xfff0d0, intensity: 1.1, pos: [4, 16, 10] }, cam: { pos: [0, 9.5, 15], look: [0, 1, -.5] }, camFrom: [0, 17, 26], camT: 1.3 });
    S.box(80, .5, 50, 0x6a6f7a, 0, -.5, -6); S.box(60, 14, .6, 0x4a5060, 0, 0, -16);
    S.box(2 * BX + 2, .9, 2.2, 0x2b2f38, 0, 0, 0); S.box(2 * BX + 2, .12, 2.5, 0xf1c40f, 0, .9, 0); S.box(2 * BX + 1.4, .06, 1.7, 0x3a3f4a, 0, .95, 0);
    const stripes = Array.from({ length: 22 }, (_, k) => S.box(.18, .02, 1.7, 0x505664, -BX + k * (2 * BX / 21), 1.0, 0));
    const zx = -BX + (Z0 + Z1) / 2 * 2 * BX, zone = S.box((Z1 - Z0) * 2 * BX, .05, 2.3, 0x2ecc71, zx, 1.0, 0, { basic: true, op: .35 });
    S.box(4, 3, 3, 0x3a3f4a, BX + 3.2, -3, 0); S.box(4.2, .3, 3.2, 0xe74c3c, BX + 3.2, 0, 0);
    ids.forEach((id, k) => { const x = (k - (n - 1) / 2) * Math.min(2.4, 16 / n); W.put(id, x, -3.2, 0); });
    const bGeo = new THREE.BoxGeometry(1.1, 1.1, 1.1);
    S.anim((dt, tn) => { stripes.forEach((st, k) => { st.position.x = -BX + ((k * (2 * BX / 21) + tn * (3 + time * .12)) % (2 * BX)); }); zone.material.opacity = (jam > 0 ? .1 : .25) + Math.sin(tn * 5) * .08; zone.material.color.setHex(jam > 0 ? 0xe74c3c : 0x2ecc71); });
    const press = c => {
      if (done || jam > 0 || c < 0 || c >= C) return; let best = null; for (const p of ps) if (p.c === c && p.x >= Z0 && p.x <= Z1 && (!best || p.x > best.x)) best = p;
      if (best) { ps.splice(ps.indexOf(best), 1); streak++; score += 1 + Math.min(3, streak >> 2); sfx('coin'); W.burst(-BX + (Z0 + Z1) / 2 * 2 * BX, 1.6, 0, CSS[c], 10); W.hop(me, .35); }
      else { score = Math.max(0, score - 1); streak = 0; jam = .55; sfx('lose'); W.popIcon(me, '✋'); }
      sb.prog(score);
    };
    const kd = e => { if (e.repeat) return; const m = /^(Digit|Numpad)([1-7])$/.exec(e.code); if (m) press(+m[2] - 1); };
    addEventListener('keydown', kd); el.onpointerdown = e => { const t = e.target.closest('[data-c]'); if (t) { e.stopPropagation(); press(+t.dataset.c); } };
    return {
      update(dt) {
        sb.tick(dt);
        if (!done) {
          time += dt; jam -= dt; while (nextS < stream.length && stream[nextS].t <= time) ps.push({ c: stream[nextS++].c, x: 0 });
          const v = SPD / (4.2 - 2.2 * Math.min(1, time / DUR)); for (const p of ps) p.x += v * dt;
          ps = ps.filter(p => { if (p.x > 1.02) { streak = 0; sfx('hit'); return false; } return true; });
          if (time >= DUR) { done = true; sb.report(score); W.emote(me, 'cheer'); }
        }
        while (pms.length < ps.length) { const g = new THREE.Mesh(bGeo, new THREE.MeshStandardMaterial({ flatShading: true })); S.root.add(g); pms.push(g); }
        pms.forEach((g, i) => { const p = ps[i]; g.visible = !!p; if (!p) return; g.position.set(-BX + p.x * 2 * BX, 1.55, 0); g.material.color.setHex(COLS[p.c]); g.material.emissive.setHex(p.x >= Z0 && p.x <= Z1 ? (COLS[p.c] >> 2) & 0x3f3f3f : 0); });
        s.textContent = done ? `Final: ${score} - waiting for others...` : `${Math.max(0, Math.ceil(DUR - time))}s   Score: ${score}   Streak: ${streak}${jam > 0 ? '   ✋ jammed' : ''}`;
      },
      endNow() { sb.endNow(); },
      onMessage(m, from) { sb.onMessage(m, from); },
      cleanup() { removeEventListener('keydown', kd); el.remove(); S.cleanup(); },
    };
  },
};
