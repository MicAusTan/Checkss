import * as THREE from 'three';
import { sfx } from '../sfx.js';
import { scoreboard, mix, rnd } from './util.js';
import { stage } from './stage.js';
// Set: a giant clock dial laid into a moonlit plaza. One lap of the hand = 10 seconds (12 o'clock = 10.00).
// The hand is only visible for the first 3 seconds. When you stop, the hand reappears where you stopped, and the pegs of
// everyone else who stopped are revealed -- but only AFTER you've stopped yourself, so nobody can peek at their timing.
const R = 4.6, TAU = Math.PI * 2, ang = ts => (ts % 10) / 10 * TAU;
export default {
  name: 'Stop the Clock', desc: 'A timer starts, then vanishes after a few seconds (shorter on higher difficulty). Press SPACE (or click) when you think it hits exactly 10.00!',
  create(ctx) {
    const HIDE = [4, 3, 2][ctx.diff ?? 1];                         // difficulty: seconds the timer stays visible
    const sb = scoreboard(ctx, { timeout: 20, grace: 3.5, bot: s => ({ v: Math.round(rnd(0, mix(1100, 120, s))), t: rnd(10, 11.5) }) }), W = ctx.world, ids = Object.keys(ctx.players), n = ids.length, me = ctx.me;
    let t = 0, stopped = false, stopT = 0, drawn = '', pegN = 0; const pend = [], pegs = [];
    const S = stage(ctx, { sky: 0x241f4d, fog: { color: 0x241f4d, near: 30, far: 75 }, light: .9, sun: { color: 0xffe8c0, intensity: .9, pos: [-4, 14, 8] }, cam: { pos: [0, 13.5, 11], look: [0, 0, .8] }, camFrom: [0, 24, 20], camT: 1.4 });
    S.cyl(46, 46, .5, 0x2c2a55, 0, -.5, 0, { seg: 48 }); S.cyl(9.4, 9.4, .1, 0x3a3870, 0, 0, 0, { seg: 40 }); S.cyl(R + .5, R + .5, .25, 0x15142b, 0, 0, 0, { seg: 40 });
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + .3, x = Math.sin(a) * 10, z = -Math.cos(a) * 10; S.cyl(.12, .15, 3, 0x2a2a3a, x, 0, z, { seg: 6 }); S.sph(.35, 0xffe8a0, x, 3.1, z, { basic: true }); }   // lamp posts
    // dial face: painted on a canvas (12 o'clock = top)
    const cv = document.createElement('canvas'); cv.width = cv.height = 512; const c = cv.getContext('2d');
    c.fillStyle = '#0f0e24'; c.beginPath(); c.arc(256, 256, 250, 0, TAU); c.fill(); c.strokeStyle = '#ffd93d'; c.lineWidth = 8; c.stroke();
    for (let k = 0; k < 20; k++) { const a = k / 20 * TAU, major = k % 2 === 0, r0 = major ? 200 : 220; c.lineWidth = major ? 7 : 3; c.strokeStyle = major ? '#fff' : '#889'; c.beginPath(); c.moveTo(256 + Math.sin(a) * r0, 256 - Math.cos(a) * r0); c.lineTo(256 + Math.sin(a) * 236, 256 - Math.cos(a) * 236); c.stroke(); }
    c.font = 'bold 40px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    for (let k = 0; k < 10; k++) { const a = k / 10 * TAU; c.fillStyle = k === 0 ? '#ffd93d' : '#fff'; c.fillText(k === 0 ? '10' : String(k), 256 + Math.sin(a) * 165, 256 - Math.cos(a) * 165); }
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const face = new THREE.Mesh(new THREE.CircleGeometry(R, 64), new THREE.MeshBasicMaterial({ map: tex })); face.rotation.x = -Math.PI / 2; face.position.y = .27; S.root.add(face);
    S.cone(.32, .8, 0xffd93d, 0, .27, -(R + .2), { em: 0x886600 }).rotation.x = Math.PI;      // target marker at 12 o'clock
    const hand = new THREE.Group(); hand.position.y = .32; S.root.add(hand);
    const handBar = S.box(.18, .07, R * .92, 0xff5a5f, 0, 0, -R * .46, { p: hand }); S.sph(.35, 0xffd93d, 0, .38, 0);
    const dig = S.screen(3.2, 1.2, 256, 96); dig.mesh.rotation.x = -Math.PI / 2; dig.mesh.position.set(0, .34, 2.2);
    ids.forEach((id, k) => { const a = Math.PI + k * TAU / n, x = Math.sin(a) * (R + 1.5), z = -Math.cos(a) * (R + 1.5); W.put(id, x, z, Math.atan2(-x, -z)); });   // around the rim, facing the dial

    const makePeg = (id, ts) => {
      const a = ang(ts), rr = R * .9 - (pegN++ % 3) * .38, grp = new THREE.Group(); grp.position.set(Math.sin(a) * rr, .27, -Math.cos(a) * rr); grp.scale.setScalar(.01); grp.userData.t = 0; S.root.add(grp);
      const col = ctx.players[id].color; S.cyl(.06, .06, .8, col, 0, 0, 0, { p: grp }); S.sph(.22, col, 0, .9, 0, { p: grp }); pegs.push(grp);
    };
    const reveal = ev => {
      makePeg(ev.id, ev.ts); const off = Math.abs(ev.ts - 10), gg = W.m.get(ev.id)?.g;
      if (off < .15) { W.emote(ev.id, 'cheer'); if (gg) W.burst(gg.position.x, 1.5, gg.position.z, '#ffd93d', 14); } else if (off > 2) W.emote(ev.id, 'sad'); else W.hop(ev.id, .5);
    };
    const stop = (ts, auto) => { stopped = true; stopT = ts; if (!auto) sfx('click'); sb.report(auto ? 5000 : Math.round(Math.abs(ts - 10) * 1000)); const ev = { k: 's', id: me, ts: +ts.toFixed(3) }; ctx.send(ev); reveal(ev); pend.splice(0).forEach(reveal); };
    const press = () => { if (!stopped) stop(t); };
    const key = e => { if (e.code === 'Space' && !e.repeat) press(); };
    addEventListener('keydown', key); addEventListener('pointerdown', press);
    const el = document.createElement('div'); el.className = 'mg'; ctx.hud.append(el);

    S.anim((dt, tt) => {
      hand.visible = stopped || t < HIDE; hand.rotation.y = -ang(stopped ? stopT : t); handBar.material.color.setHex(stopped ? 0xffd93d : 0xff5a5f);
      for (const p of pegs) { p.userData.t = Math.min(1, p.userData.t + dt * 4); const u = p.userData.t; p.scale.setScalar(u < 1 ? 1 + 2.7 * Math.pow(u - 1, 3) + 1.7 * Math.pow(u - 1, 2) : 1); }
      const main = stopped ? stopT.toFixed(2) : t < HIDE ? t.toFixed(2) : '?.??', sub = stopped ? `off by ${Math.round(Math.abs(stopT - 10) * 1000)}ms` : 'target 10.00', key2 = main + sub;
      if (key2 !== drawn) { drawn = key2; dig.draw((cc, w, h) => { cc.fillStyle = '#000b'; cc.fillRect(0, 0, w, h); cc.textAlign = 'center'; cc.fillStyle = stopped ? '#ffd93d' : '#7cf08a'; cc.font = 'bold 58px monospace'; cc.fillText(main, w / 2, 56); cc.fillStyle = '#fff'; cc.font = 'bold 26px sans-serif'; cc.fillText(sub, w / 2, 86); }); }
    });
    return {
      update(dt) {
        t += dt; sb.prog(0), sb.tick(dt);
        if (!stopped && t >= 15) stop(t, true);
        el.innerHTML = `<h2>${stopped ? stopT.toFixed(2) : t < HIDE ? t.toFixed(2) : '?.??'}</h2>` + (stopped ? `<div>Off by ${Math.round(Math.abs(stopT - 10) * 1000)}ms. Waiting for others...</div>` : '<div>Target: 10.00</div>');
      },
      endNow() { sb.endNow(); },
      onMessage(m, from) {
        if (m.k === 's') {
          if (ctx.isHost) { if (!ids.includes(from) || !(m.ts >= 0 && m.ts <= 16)) return; const ev = { k: 's', id: from, ts: +m.ts }; (stopped ? reveal : x => pend.push(x))(ev); ctx.send(ev); }
          else if (m.id !== me && m.ts >= 0 && m.ts <= 16) (stopped ? reveal : x => pend.push(x))(m);
          return;
        }
        sb.onMessage(m, from);
      },
      cleanup() { removeEventListener('keydown', key); removeEventListener('pointerdown', press); el.remove(); S.cleanup(); },
    };
  },
};
