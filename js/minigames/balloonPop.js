import * as THREE from 'three';
import { sfx } from '../sfx.js';
import { scoreboard, jit, mix } from './util.js';
import { stage } from './stage.js';
// Same seeded balloons for everyone. Pop = +1, black bombs = -3, 15 seconds.
// Set: a funfair meadow. Balloons float up in real 3D and you click them with a ray cast from the camera. Everyone is in a row at the
// front looking up at the sky; others' pops (and bomb mishaps) are shared a few times a second, with a live score over each head.
const DUR = 15, RISE = .03;
export default {
  tiers: [{ n: 'Normal', m: 1, pen: 0, d: 'Pop balloons, avoid bombs.' }, { n: 'Hard', m: 1.5, pen: 2, d: 'More balloons, plus gold (+3) and spiky (-1) ones.' }],
  name: 'Balloon Pop', desc: 'Pop balloons for +1 - but DON\'T click the black bombs (-3)! 15 seconds. (Hard: gold balloons are +3, spiky dark-red ones -1.)',
  create(ctx) {
    const HARD = ctx.diff === 1, sb = scoreboard(ctx, { timeout: 25, lower: false, bot: s => ({ v: Math.round(jit(mix(8, 30, s), .18) * (HARD ? 1.2 : 1)), t: DUR }) });
    const K = ctx.team ? 1.5 : 1;       // team version: a wider sky with more balloons
    const bs = Array.from({ length: Math.round((HARD ? 115 : 80) * K) }, (_, i) => {
      const x = 25 + ctx.rng() * 410, sp = 70 + ctx.rng() * 70, r = ctx.rng(), pB = HARD ? .2 : .2, v = r < pB ? -3 : HARD && r < pB + .1 ? 3 : HARD && r < pB + .2 ? -1 : 1;       // hard: gold +3 and spiky -1 balloons too
      return { ts: i * (HARD ? .135 : .19) / K, x, sp: v === 3 ? sp * 1.25 : sp, v, bomb: v < 0, c: v === 3 ? new THREE.Color(0xffd23f) : new THREE.Color().setHSL(ctx.rng(), .8, .55), dead: false, i, y: 0 };
    });
    let time = 0, score = 0, done = false, pend = null, sendT = 0, tt = 0;
    const W = ctx.world, ids = Object.keys(ctx.players), n = ids.length, me = ctx.me, sc = {}, dirty = {}; ids.forEach(id => { sc[id] = 0; dirty[id] = true; });

    // ---------- the set ----------
    const S = stage(ctx, { sky: 0x8fd3ff, fog: { color: 0x8fd3ff, near: 40, far: 110 }, light: 1.2, sun: { intensity: 1.2, pos: [6, 16, 8] }, cam: { pos: [0, 2.6 + (K - 1) * 3, 16 * K], look: [0, 6, 0] }, camFrom: [0, 1.5, 26 * K], camT: 1.4 });
    S.box(160, .5, 120, 0x6fbf4a, 0, -.5, -40);
    for (let i = 0; i < 6; i++) S.cone(9 + i % 3 * 3, 6 + i % 4 * 2, i % 2 ? 0x4f9a45 : 0x5fae4c, -50 + i * 20, 0, -60, { seg: 7 });
    for (let i = 0; i < 4; i++) { const x = -22 + i * 15, c = [0xe74c3c, 0x3498db, 0xf1c40f, 0x9b59b6][i]; S.cyl(2.6, 2.6, 2.4, 0xfff4e0, x, 0, -22, { seg: 12 }); S.cone(3.2, 2.6, c, x, 2.4, -22, { seg: 12 }); S.box(1.2, 1.6, .1, 0x553311, x, 0, -19.4); }   // tents
    const wheel = new THREE.Group(); wheel.position.set(-14, 9.5, -34); S.root.add(wheel);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(8, .22, 6, 28), new THREE.MeshStandardMaterial({ color: 0xffffff })); wheel.add(rim);
    for (let k = 0; k < 6; k++) S.box(.12, 16, .12, 0xdddddd, 0, -8, 0, { p: wheel }).rotation.z = k / 6 * Math.PI;
    const gond = []; for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; const gd = new THREE.Group(); gd.position.set(Math.sin(a) * 8, Math.cos(a) * 8, 0); S.box(1.1, .9, .9, [0xe74c3c, 0xf1c40f, 0x3498db][k % 3], 0, -.9, 0, { p: gd }); wheel.add(gd); gond.push(gd); }
    S.box(.5, 10, .5, 0x777788, -14 - 3, 0, -34).rotation.z = .3; S.box(.5, 10, .5, 0x777788, -14 + 3, 0, -34).rotation.z = -.3;
    for (let i = 0; i < 6; i++) { const c = S.sph(1, 0xffffff, -45 + i * 18, 20 + i % 2 * 4, -70, { seg: 7 }); c.scale.set(4, 1, 1.6); }
    const sphG = new THREE.SphereGeometry(1, 14, 10), strG = new THREE.CylinderGeometry(.015, .015, 1.4, 4), knotG = new THREE.ConeGeometry(.18, .3, 6);
    bs.forEach(b => {
      const g = new THREE.Group(); g.visible = false; S.root.add(g);
      const body = new THREE.Mesh(sphG, new THREE.MeshStandardMaterial({ color: b.bomb ? (b.v === -1 ? 0x7a1030 : 0x1a1a1f) : b.c, flatShading: true })); body.scale.set(.72, .92, .72); g.add(body);
      const knot = new THREE.Mesh(knotG, body.material); knot.position.y = -.98; knot.rotation.x = Math.PI; g.add(knot);
      if (b.bomb) { const fuse = S.cyl(.04, .04, .45, 0x886644, 0, .85, 0, { p: g, seg: 5 }); b.spark = S.sph(.12, 0xff9f1a, 0, 1.38, 0, { p: g, basic: true, seg: 6 }); }
      else { const st = new THREE.Mesh(strG, new THREE.MeshBasicMaterial({ color: 0xffffff })); st.position.y = -1.8; g.add(st); }
      b.g = g; b.body = body; b.z = ((b.i * 37) % 7 - 3) * .7 - 1; b.bx = ((b.x - 25) / 410 * 16 - 8) * K;
    });
    const lab = {};
    ids.forEach((id, k) => { const x = (k - (n - 1) / 2) * Math.min(2.3, 15 / n); W.put(id, x, 3.2, Math.PI); const l = S.screen(1.7, .62, 256, 92); l.mesh.position.set(x, 3.4, 3.2); lab[id] = l; });
    const drawLab = id => lab[id].draw((c, w, h) => { c.fillStyle = '#000a'; c.fillRect(0, 0, w, h); c.textAlign = 'center'; c.fillStyle = ctx.players[id].color; c.font = 'bold 30px sans-serif'; c.fillText(String(ctx.players[id].name).slice(0, 12), w / 2, 34); c.fillStyle = '#fff'; c.font = 'bold 44px sans-serif'; c.fillText(String(sc[id]), w / 2, 80); });
    S.anim((dt, tn) => {
      tt += dt; wheel.rotation.z += dt * .12; gond.forEach(g => { g.rotation.z = -wheel.rotation.z; });
      for (const b of bs) {
        const live = !b.dead && time >= b.ts && b.y < 13; b.g.visible = live; if (!live) continue;
        b.y = .5 + (time - b.ts) * b.sp * RISE; const k = Math.min(1, (time - b.ts) * 4);
        b.g.position.set(b.bx + Math.sin(time * 2 + b.i) * .25, b.y, b.z); b.g.scale.setScalar(k); if (b.spark) b.spark.visible = ((tn * 8) | 0) % 2 === 0;
      }
      ids.forEach(id => { if (dirty[id]) { dirty[id] = false; drawLab(id); } });
    });

    // ---------- play ----------
    const el = document.createElement('div'); el.className = 'mg'; el.innerHTML = '<h3 id="s"></h3>'; ctx.hud.append(el); const s = el.querySelector('#s');
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    const onDown = e => {
      if (done) return;
      const dom = W.r?.domElement, rc = dom ? dom.getBoundingClientRect() : { left: 0, top: 0, width: innerWidth, height: innerHeight };
      ndc.set((e.clientX - rc.left) / rc.width * 2 - 1, -((e.clientY - rc.top) / rc.height) * 2 + 1);
      S.root.updateMatrixWorld(true); W.cam.updateMatrixWorld(); ray.setFromCamera(ndc, W.cam);
      const live = bs.filter(b => !b.dead && b.g.visible), hits = ray.intersectObjects(live.map(b => b.body), false); if (!hits.length) return;
      const b = live.find(x => x.body === hits[0].object); b.dead = true; b.g.visible = false;
      score += b.v; sc[me] = score; dirty[me] = true; sfx(b.bomb ? 'hit' : 'click'); pend = b.bomb ? 1 : 0;
      W.burst(b.g.position.x, b.g.position.y, b.g.position.z, b.bomb ? '#ff9f1a' : '#' + b.c.getHexString(), b.bomb ? 18 : 10);
      if (b.bomb) { W.shake(.2, .25); W.emote(me, 'sad'); W.popIcon(me, '💥'); } else W.hop(me, .35);
    };
    addEventListener('pointerdown', onDown);
    const apply = ev => { if (!(ev.id in sc)) return; sc[ev.id] = ev.sc; dirty[ev.id] = true; if (ev.b) { W.emote(ev.id, 'sad'); W.popIcon(ev.id, '💥'); } else W.hop(ev.id, .35); };
    return {
      update(dt) {
        for (const id of ids) if (ctx.players[id]?.bot) { const v = Math.round(sb.get(id)); if (v !== sc[id]) { sc[id] = v; dirty[id] = true; } }   // bots' live score from the shared scoreboard
        sb.prog(score), sb.tick(dt); time += dt; if (!done && time >= DUR) { done = true; sb.report(score); W.emote(me, 'cheer'); }
        if (pend !== null && (sendT -= dt) <= 0) { sendT = .12; ctx.send({ k: 'p', id: me, sc: score, b: pend }); pend = null; }      // throttled: coalesces fast clicking
        s.textContent = done ? `Final: ${score} - waiting for others...` : `${Math.ceil(DUR - time)}s   Score: ${score}`;
      },
      endNow() { sb.endNow(); },
      onMessage(m, from) {
        if (m.k === 'p') {
          if (ctx.isHost) { if (!(from in sc)) return; const ev = { k: 'p', id: from, sc: Math.max(-999, Math.min(999, m.sc | 0)), b: m.b ? 1 : 0 }; apply(ev); ctx.send(ev); }
          else if (m.id !== me) apply(m);
          return;
        }
        sb.onMessage(m, from);
      },
      cleanup() { removeEventListener('pointerdown', onDown); el.remove(); S.cleanup(); },
    };
  },
};
