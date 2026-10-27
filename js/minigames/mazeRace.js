import * as THREE from 'three';
import { sfx } from '../sfx.js';
import { scoreboard, jit, mix } from './util.js';
import { stage, fitDist } from './stage.js';
// Same seeded maze for everyone; WASD/arrows to reach the bottom-right. Fastest time wins.
// Set: a hedge maze seen from above. Everyone's avatar is in the maze for real; positions are shared a few times a second.
const CS = 2, WT = .4, WH = 1.15;
export default {
  tiers: [{ n: 'Normal', m: 1, pen: 0, d: '12x12 maze.', def: true }, { n: 'Large', m: 1.4, pen: 1, d: '18x18 maze, longer clock.' }, { n: 'Huge', m: 2, pen: 2, d: '26x26 maze, much longer clock.' }],
  name: 'Maze Race', desc: 'Reach the green square first! WASD / arrows to move through the maze. Everyone has the same maze.',
  create(ctx) {
    const D = ctx.diff ?? 0, N = [12, 18, 26][D], DIRS = { KeyW: ['n', -N], ArrowUp: ['n', -N], KeyS: ['s', N], ArrowDown: ['s', N], KeyD: ['e', 1], ArrowRight: ['e', 1], KeyA: ['w', -1], ArrowLeft: ['w', -1] };
    const cx = i => ((i % N) - (N - 1) / 2) * CS, cz = i => ((i / N | 0) - (N - 1) / 2) * CS;
    const sb = scoreboard(ctx, { timeout: [75, 130, 210][D], bot: s => { const T = jit(mix(52, 24, s), .15) * [1, 1.9, 3.6][D]; return { v: Math.round(T * 1000), t: T }; } }), g = Array.from({ length: N * N }, () => ({ n: 1, e: 1, s: 1, w: 1, v: 0 }));
    const stack = [0]; g[0].v = 1;
    while (stack.length) {                                      // maze generation: only ctx.rng here, so every client builds the same maze
      const c = stack[stack.length - 1], x = c % N, y = c / N | 0, nb = [];
      if (y > 0 && !g[c - N].v) nb.push([c - N, 'n', 's']); if (y < N - 1 && !g[c + N].v) nb.push([c + N, 's', 'n']);
      if (x < N - 1 && !g[c + 1].v) nb.push([c + 1, 'e', 'w']); if (x > 0 && !g[c - 1].v) nb.push([c - 1, 'w', 'e']);
      if (!nb.length) { stack.pop(); continue; }
      const [d, a, b] = nb[ctx.rng() * nb.length | 0]; g[c][a] = 0; g[d][b] = 0; g[d].v = 1; stack.push(d);
    }
    const W = ctx.world, ids = Object.keys(ctx.players), me = ctx.me, GOAL = N * N - 1;
    const prev = { 0: -1 }, q = [0], D4 = [['n', -N], ['s', N], ['e', 1], ['w', -1]];                 // shortest route start -> goal: bots are drawn walking along it
    while (q.length) { const c = q.shift(); for (const [d, dd] of D4) if (!g[c][d] && !(c + dd in prev)) { prev[c + dd] = c; q.push(c + dd); } }
    const route = []; for (let c = GOAL; c !== -1; c = prev[c]) route.unshift(c);
    let pos = 0, time = 0, done = false, sentPos = 0, sendT = 0, tt = 0;
    const cell = {}, off = {}, fin = {}; ids.forEach((id, i) => { cell[id] = 0; const a = i / ids.length * Math.PI * 2; off[id] = [Math.cos(a) * .42, Math.sin(a) * .42]; });

    // ---------- the set ----------
    const dist = fitDist(W, N * CS / 2 + 2.5, 30);
    const S = stage(ctx, { light: 1.15, sun: { intensity: 1.2, pos: [-8, 20, 10] }, cam: { pos: [0, dist * .96, dist * .28], look: [0, 0, .6] }, camFrom: [0, dist * 1.4, dist * .5], camT: 1.4 });
    S.box(120, .3, 120, 0x4f9a45, 0, -.6, 0); S.box(N * CS + 1.2, .3, N * CS + 1.2, 0xe8dcb0, 0, -.3, 0);   // lawn + sandy paths
    const segs = [];
    g.forEach((k, i) => {
      const x = cx(i), z = cz(i);
      if (k.n) segs.push([x, z - CS / 2, CS + WT, WT]); if (k.w) segs.push([x - CS / 2, z, WT, CS + WT]);
      if (i % N === N - 1 && k.e) segs.push([x + CS / 2, z, WT, CS + WT]); if ((i / N | 0) === N - 1 && k.s) segs.push([x, z + CS / 2, CS + WT, WT]);
    });
    const hedge = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true }), segs.length), dm = new THREE.Object3D(), col = new THREE.Color();
    segs.forEach(([x, z, w, d], i) => { dm.position.set(x, WH / 2, z); dm.scale.set(w, WH, d); dm.updateMatrix(); hedge.setMatrixAt(i, dm.matrix); hedge.setColorAt(i, col.setHSL(.3 + Math.random() * .04, .55, .26 + Math.random() * .08)); });
    S.root.add(hedge);
    S.cyl(.8, .8, .06, 0x4dabf7, cx(0), 0, cz(0), { em: 0x113355 });                                  // start pad
    const gp = S.cyl(.85, .85, .08, 0x2ecc71, cx(GOAL), 0, cz(GOAL), { em: 0x16a34a });               // goal pad + beam + flag
    const beam = S.cone(.8, 9, 0x7cf08a, cx(GOAL), 0, cz(GOAL), { basic: true, op: .22, seg: 16 });
    S.cyl(.05, .05, 2.6, 0xffffff, cx(GOAL) + .5, 0, cz(GOAL) - .5); S.box(.8, .5, .06, 0x2ecc71, cx(GOAL) + .9, 2.05, cz(GOAL) - .5);
    const ring = S.cyl(.6, .6, .05, ctx.players[me]?.color || '#f1c40f', 0, 0, 0, { basic: true, op: .8, seg: 20 });   // "this is you" ring
    ids.forEach(id => { W.put(id, cx(0) + off[id][0], cz(0) + off[id][1], 0); const e = W.m.get(id); if (e) e.g.scale.setScalar(.62); });
    S.anim(dt => {
      tt += dt;
      for (const id of ids) { const e = W.m.get(id); if (!e) continue; if (ctx.players[id]?.bot) cell[id] = route[Math.min(route.length - 1, Math.round(sb.get(id) * (route.length - 1)))]; W.set(id, cx(cell[id]) + off[id][0], cz(cell[id]) + off[id][1]); }
      const m = W.m.get(me); if (m) ring.position.set(m.g.position.x, .04, m.g.position.z);
      beam.material.opacity = .16 + Math.sin(tt * 3) * .07; gp.scale.setScalar(1 + Math.sin(tt * 4) * .06);
    });

    // ---------- play ----------
    const el = document.createElement('div'); el.className = 'mg'; el.innerHTML = '<h3 id="t"></h3>'; ctx.hud.append(el); const tl = el.querySelector('#t');
    const cheer = id => { if (fin[id]) return; fin[id] = 1; S.after(.5, () => { W.emote(id, 'cheer'); const gg = W.m.get(id)?.g; if (gg) W.burst(gg.position.x, 1, gg.position.z, ctx.players[id].color, 18); }); };
    const apply = ev => { if (ev.id in cell) { cell[ev.id] = ev.p; if (ev.done) cheer(ev.id); } };
    const emit = ev => { ev.id = me; ctx.send(ev); };
    const key = e => {
      const d = DIRS[e.code]; if (!d || done) return; e.preventDefault();
      if (!g[pos][d[0]]) { pos += d[1]; cell[me] = pos; sfx('click'); if (pos === GOAL) { done = true; sb.report(Math.round(time * 1000)); emit({ k: 'm', p: pos, done: 1 }); sentPos = pos; cheer(me); } }
    };
    addEventListener('keydown', key);
    return {
      update(dt) {
        if (!done) time += dt; sb.prog(pos / GOAL), sb.tick(dt);
        if (pos !== sentPos && (sendT -= dt) <= 0) { sendT = .1; sentPos = pos; emit({ k: 'm', p: pos }); }   // throttled: at most ~10 messages/s even when holding a key
        tl.textContent = done ? `Done in ${time.toFixed(1)}s - waiting for others...` : time.toFixed(1) + 's';
      },
      endNow() { sb.endNow(); },
      onMessage(m, from) {
        if (m.k === 'm') {
          if (ctx.isHost) { if (!(from in cell) || !(m.p >= 0 && m.p < N * N)) return; const ev = { k: 'm', id: from, p: m.p | 0, done: !!m.done }; apply(ev); ctx.send(ev); }
          else if (m.id !== me) apply(m);
          return;
        }
        sb.onMessage(m, from);
      },
      cleanup() { removeEventListener('keydown', key); el.remove(); ids.forEach(id => W.m.get(id)?.g.scale.setScalar(1)); S.cleanup(); },
    };
  },
};
