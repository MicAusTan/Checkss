import * as THREE from 'three';
import { sfx } from '../sfx.js';
import { scoreboard, jit, mix } from './util.js';
import { stage } from './stage.js';
// CO-OP: a beat only counts if EVERY player hits it. Reward tier by number of full-team beats.
// Set: a neon dance floor seen from above. A ring shrinks onto the centre circle every beat; players stand around the edge and
// hop when they hit (hits are relayed to everyone). A circle of 24 lights around the floor shows each beat: green = whole team
// nailed it, red = someone missed, grey = still to come.
const T0 = 1.5, N = 28, R0 = 2.2, TAU = Math.PI * 2;
// FREE FOR ALL: the beats come at changing speeds (slow, fast, quick pairs). Press as the ring closes onto the circle: closer = more points. Mistimed presses cost a point.
export default {
  name: 'Sync Pulse', desc: 'Press SPACE (or click) exactly as the ring closes onto the circle! The beat speeds up, slows down and doubles up to mess with you. Closer to the beat = more points; spamming costs points. Highest score wins.',
  create(ctx) {
    const ids = Object.keys(ctx.players), host = ctx.isHost, n = ids.length, me = ctx.me, W = ctx.world;
    const bt = [T0]; { let iv = .9; for (let k = 1; k < N; k++) { if (k % 6 === 1) iv = [.62, .8, 1, 1.25, 1.5][ctx.rng() * 5 | 0]; bt.push(bt[k - 1] + (ctx.rng() < .18 ? iv * .5 : iv)); } }    // seeded: identical beat map for everyone
    const END = bt[N - 1] + 1.2;
    const sb = scoreboard(ctx, { timeout: END + 4, lower: false, bot: sk => ({ v: Math.max(0, Math.round(N * jit(mix(.7, 2.5, sk), .18))), t: END }) });
    let time = 0, fb = '', pts = 0, lastB = -1, fin = false, pulse = 0, reported = false; const res = {}, mine = new Set();
    const el = document.createElement('div'); el.className = 'mg'; el.innerHTML = '<h3 id="s"></h3>'; ctx.hud.append(el); const s = el.querySelector('#s');
    // ---------- the set ----------
    const S = stage(ctx, { sky: 0x0b0820, fog: { color: 0x0b0820, near: 30, far: 70 }, light: .85, sun: { intensity: .7, pos: [0, 14, 6] }, cam: { pos: [0, 14.5, 10.5], look: [0, 0, .6] }, camFrom: [0, 26, 18], camT: 1.4 });
    S.cyl(13, 13, .4, 0x161033, 0, -.4, 0, { seg: 48 }); S.cyl(10.4, 10.4, .05, 0x241a55, 0, 0, 0, { seg: 48 });
    for (let k = 0; k < 24; k++) { const a = k / 24 * TAU; S.box(1.9, .06, 1.9, k % 2 ? 0x2b2070 : 0x1d1650, Math.sin(a) * 5.6, .05, -Math.cos(a) * 5.6, { ry: -a, em: k % 2 ? 0x0c0830 : 0 }); }     // floor tiles
    S.cyl(1.4, 1.4, .3, 0x2a2a5a, 0, 0, 0, { seg: 32 }); const orb = S.sph(.8, 0xffd93d, 0, 1.1, 0, { em: 0x886600 });
    const target = new THREE.Mesh(new THREE.RingGeometry(R0 - .12, R0, 64), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })); target.rotation.x = -Math.PI / 2; target.position.y = .38; S.root.add(target);
    const ring = new THREE.Mesh(new THREE.RingGeometry(.94, 1, 64), new THREE.MeshBasicMaterial({ color: 0xffd93d, side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.y = .4; S.root.add(ring);
    const lights = Array.from({ length: N }, (_, k) => { const a = k / N * TAU; return S.sph(.3, 0x555566, Math.sin(a) * 9.1, .35, -Math.cos(a) * 9.1, { basic: true, seg: 10 }); });
    ids.forEach((id, k) => { const a = k / n * TAU + Math.PI, x = Math.sin(a) * 7, z = -Math.cos(a) * 7; W.put(id, x, z, Math.atan2(-x, -z)); });
    const show = id => { W.hop(id, .5); const g = W.m.get(id)?.g; if (g) W.burst(g.position.x, 1, g.position.z, ctx.players[id].color, 6); };
    const nextB = () => { for (let k = 0; k < N; k++) if (bt[k] >= time - .15) return k; return -1; };
    S.anim(dt => {
      const nb = nextB(); let r = 0.001;
      if (nb >= 0) { const prev = nb > 0 ? bt[nb - 1] : bt[0] - 1.1, u = Math.max(0, Math.min(1, (bt[nb] - time) / (bt[nb] - prev))); r = time < bt[0] - 1.1 ? .001 : R0 + u * 3.1; }
      ring.scale.setScalar(r); pulse = Math.max(0, pulse - dt * 4);
      orb.scale.setScalar(1 + pulse * .5); orb.material.emissive.setHex(pulse > .1 ? 0xcc9900 : 0x886600);
      lights.forEach((l, k) => { const q = res[k]; l.material.color.setHex(q === 3 ? 0x2ecc71 : q === 2 ? 0xbfe83a : q === 1 ? 0xf1c40f : q === 0 ? 0xe74c3c : 0x555566); });
    });

    // ---------- play ----------
    const press = () => {
      if (fin) return; let k = -1, bd = 9; bt.forEach((b, i) => { const d = Math.abs(time - b); if (d < bd) { bd = d; k = i; } });
      if (k >= 0 && bd < .3 && !mine.has(k)) {
        mine.add(k); const q = bd < .07 ? 3 : bd < .14 ? 2 : 1; res[k] = q; pts += q; fb = ['', 'Early/late', 'Good!', 'PERFECT!'][q]; sfx(q === 3 ? 'star' : 'click'); show(me); if (!host) ctx.send({ k: 'h' }); else ctx.send({ k: 'h', id: me });
      } else { pts = Math.max(0, pts - 1); fb = 'Miss -1'; sfx('lose'); }
      sb.prog(pts);
    };
    const key = e => { if (e.code === 'Space' && !e.repeat) press(); };
    addEventListener('keydown', key); addEventListener('pointerdown', press);
    return {
      update(dt) {
        time += dt;
        for (let k = 0; k < N; k++) if (res[k] == null && bt[k] + .3 < time && !mine.has(k)) { res[k] = 0; mine.add(k); }        // a beat nobody pressed = red light
        const bk = bt.findIndex((b, i) => b <= time && (i === N - 1 || bt[i + 1] > time)); if (bk !== lastB && bk >= 0 && time - bt[bk] < .3) { lastB = bk; sfx('tick'); pulse = 1; }
        if (!reported && time > END) { reported = true; fin = true; sb.report(pts); W.emote(me, 'cheer'); }
        sb.tick(dt);
        s.textContent = `Score: ${pts}   ${fb}`;
      },
      onMessage(m, from) {
        if (host && m.k === 'h' && ids.includes(from)) { show(from); ctx.send({ k: 'h', id: from }); return; }
        if (!host && m.k === 'h') { if (m.id && m.id !== me && m.id in ctx.players) show(m.id); return; }
        sb.onMessage(m, from);
      },
      endNow() { sb.endNow(); },
      cleanup() { removeEventListener('keydown', key); removeEventListener('pointerdown', press); el.remove(); S.cleanup(); },
    };
  },
};
