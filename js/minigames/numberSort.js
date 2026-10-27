import * as THREE from 'three';
import { sfx } from '../sfx.js';
import { scoreboard, jit, mix } from './util.js';
import { stage, fitDist } from './stage.js';
// Click the numbers in order (1 up to the last one), as fast as you can! A wrong click costs 1 second.
// Set: a giant game-show puzzle wall. The 16 tiles are real 3D (you click them with a ray from the camera); cleared tiles sink
// into the wall. Everyone else stands at the sides watching, with a live "next number" over their head (shared on every click).
export default {
  tiers: [{ n: '4x4', m: 1, pen: 0, d: 'Numbers 1-16.', def: true }, { n: '5x5', m: 1.4, pen: 1, d: 'Numbers 1-25.' }, { n: '6x6', m: 2, pen: 2, d: 'Numbers 1-36.' }],
  name: 'Number Sort', desc: 'Click the numbers in order (1 up to the last tile), as fast as you can! A wrong click costs 1 second.',
  create(ctx) {
    const G = [4, 5, 6][ctx.diff ?? 0], TOT = G * G, K = 4 / G, SP = 1.95 * K;                // grid size
    const sb = scoreboard(ctx, { timeout: [70, 110, 160][ctx.diff ?? 0], bot: s => { const T = jit(mix(42, 17, s), .15) * TOT / 16; return { v: Math.round(T * 1000), t: T }; } }), nums = Array.from({ length: TOT }, (_, i) => i + 1);
    for (let i = 15; i > 0; i--) { const j = ctx.rng() * (i + 1) | 0; [nums[i], nums[j]] = [nums[j], nums[i]]; }
    let next = 1, pen = 0, time = 0, done = false, lastT = '', shownNext = 0;
    const W = ctx.world, ids = Object.keys(ctx.players), n = ids.length, me = ctx.me, st = {}, dirty = {}; ids.forEach(id => { st[id] = { nx: 1, pen: 0 }; dirty[id] = true; });
    const el = document.createElement('div'); el.className = 'mg'; el.innerHTML = '<h3 id="t"></h3>'; ctx.hud.append(el); const tl = el.querySelector('#t');

    // ---------- the set ----------
    const dist = fitDist(W, 10.4, 15);
    const S = stage(ctx, { sky: 0x151a3a, fog: { color: 0x151a3a, near: 30, far: 70 }, light: 1, sun: { intensity: .9, pos: [3, 14, 10] }, cam: { pos: [0, 6.5, dist], look: [0, 5, 0] }, camFrom: [0, 10, dist + 9], camT: 1.4 });
    S.box(70, .5, 36, 0x20264d, 0, -.5, -6); S.box(9, 9, .5, 0x1d2750, 0, .8, -.2); S.box(9.4, .25, .7, 0xffd93d, 0, 9.8, -.1); S.box(9.4, .25, .7, 0xffd93d, 0, .6, -.1);
    [-1, 1].forEach(sd => S.box(.25, 9.2, .7, 0xffd93d, sd * 4.6, .7, -.1));
    const tiles = nums.map((nn, idx) => {
      const col = idx % G, row = idx / G | 0, x = (col - (G - 1) / 2) * SP, y = 5.575 + ((G - 1) / 2 - row) * SP;
      const box = S.box(1.7 * K, 1.7 * K, .45, (col + row) % 2 ? 0x3b5bdb : 0x4c6ef5, x, y - .85 * K, .3);
      const num = S.screen(1.5 * K, 1.5 * K, 128, 128); num.mesh.position.set(x, y, .3 + .27); num.mesh.material.transparent = true; num.mesh.material.depthWrite = false; num.mesh.renderOrder = 3;
      num.draw((c, w, h) => { c.fillStyle = '#fff'; c.font = 'bold 84px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(nn), w / 2, h / 2 + 6); });
      box.userData.n = nn; return { n: nn, box, num, z0: box.position.z, ts: 0 };
    });
    const banner = S.screen(4.4, 1.1, 256, 64); banner.mesh.position.set(0, 11.1, 0);
    const drawBanner = v => banner.draw((c, w, h) => { c.fillStyle = '#000a'; c.fillRect(0, 0, w, h); c.fillStyle = '#ffd93d'; c.font = 'bold 44px sans-serif'; c.textAlign = 'center'; c.fillText(v > TOT ? 'DONE!' : 'NEXT: ' + v, w / 2, 46); });
    const lab = {}, sideOf = i => i % 2 ? 1 : -1;
    ids.forEach((id, i) => { const sd = sideOf(i), z = 1.4 - (i >> 1) * 2.6; W.put(id, sd * 8.2, z, sd < 0 ? Math.PI / 2 : -Math.PI / 2); const l = S.screen(2, .7, 256, 90); l.mesh.position.set(sd * 8.2, 3.3, z); lab[id] = l; });
    const drawLab = id => lab[id].draw((c, w, h) => { c.fillStyle = '#000a'; c.fillRect(0, 0, w, h); c.textAlign = 'center'; c.fillStyle = ctx.players[id].color; c.font = 'bold 28px sans-serif'; c.fillText(String(ctx.players[id].name).slice(0, 12), w / 2, 32); c.fillStyle = '#fff'; c.font = 'bold 34px sans-serif'; c.fillText(st[id].nx > 16 ? 'DONE!' : 'next ' + st[id].nx + (st[id].pen ? '  x' + st[id].pen : ''), w / 2, 72); });
    S.anim(dt => {
      for (const tl_ of tiles) {                                      // cleared tiles sink into the wall and fade
        const gone = tl_.n < next, tz = gone ? tl_.z0 - .55 : tl_.z0; tl_.box.position.z += (tz - tl_.box.position.z) * Math.min(1, dt * 12); tl_.num.mesh.position.z = tl_.box.position.z + .23; tl_.num.mesh.material.opacity = gone ? .2 : 1;
        tl_.box.material.color.setHex(gone ? 0x1a2040 : tl_.box.userData.base ?? (tl_.box.userData.base = tl_.box.material.color.getHex()));
      }
      if (shownNext !== next) { shownNext = next; drawBanner(next); }
      ids.forEach(id => { if (dirty[id]) { dirty[id] = false; drawLab(id); } });
    });

    // ---------- play ----------
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    const emit = () => { st[me] = { nx: next, pen }; dirty[me] = true; ctx.send({ k: 'n', id: me, nx: next, pen }); };
    const onDown = e => {
      if (done) return;
      const dom = W.r?.domElement, rc = dom ? dom.getBoundingClientRect() : { left: 0, top: 0, width: innerWidth, height: innerHeight };
      ndc.set((e.clientX - rc.left) / rc.width * 2 - 1, -((e.clientY - rc.top) / rc.height) * 2 + 1);
      S.root.updateMatrixWorld(true); W.cam.updateMatrixWorld(); ray.setFromCamera(ndc, W.cam);
      const live = tiles.filter(x => x.n >= next), hit = ray.intersectObjects(live.map(x => x.box), false)[0]; if (!hit) return;
      const nn = hit.object.userData.n, tile = tiles.find(x => x.n === nn);
      if (nn === next) { next++; sfx('click'); W.hop(me, .35); W.burst(tile.box.position.x, tile.box.position.y + .85, 1, '#ffd93d', 8); emit(); if (next > TOT) { done = true; sb.report(Math.round(time * 1000 + pen * 1000)); W.emote(me, 'cheer'); } }
      else { pen++; sfx('lose'); W.shake(.1, .15); tile.box.material.emissive.setHex(0xaa0000); S.after(.25, () => tile.box.material.emissive.setHex(0)); emit(); }
    };
    addEventListener('pointerdown', onDown);
    return {
      update(dt) {
        sb.prog((next - 1) / TOT), sb.tick(dt); if (!done) time += dt;
        const t = done ? `Done! ${(time + pen).toFixed(1)}s - waiting for others...` : `${time.toFixed(1)}s   Next: ${next}   Penalty: ${pen}s`; if (t !== lastT) { tl.textContent = t; lastT = t; }
      },
      endNow() { sb.endNow(); },
      onMessage(m, from) {
        if (m.k === 'n') {
          if (ctx.isHost) { if (!(from in st)) return; const ev = { k: 'n', id: from, nx: Math.max(1, Math.min(17, m.nx | 0)), pen: Math.max(0, Math.min(99, m.pen | 0)) }; if (ev.nx > st[from].nx) W.hop(from, .35); st[from] = { nx: ev.nx, pen: ev.pen }; dirty[from] = true; ctx.send(ev); }
          else if (m.id !== me && m.id in st) { if (m.nx > st[m.id].nx) W.hop(m.id, .35); st[m.id] = { nx: m.nx | 0, pen: m.pen | 0 }; dirty[m.id] = true; }
          return;
        }
        sb.onMessage(m, from);
      },
      cleanup() { removeEventListener('pointerdown', onDown); el.remove(); S.cleanup(); },
    };
  },
};
