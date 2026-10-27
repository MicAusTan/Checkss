import * as THREE from 'three';
import { sfx } from '../sfx.js';
import { scoreboard, jit, mix } from './util.js';
import { stage, fitDist } from './stage.js';
import { pick, share, nameplate } from './kit.js';
// Click the targets as fast as you can! 15 seconds, most hits wins. A target you miss moves on after 1.2s.
// Set: a sci-fi shooting range. A holographic target pops up on the far wall (3D picking). Every hit anyone scores fires a laser
// from their avatar to that target, so you can watch the whole squad shooting; live hit counts float over their heads.
const LIFE = 1.2, tpos = p => [(p[0] / 86 - .5) * 15, 1.8 + p[1] / 78 * 7.2, -5.6];       // seeded [x%, y%] -> a point on the back wall
export default {
  tiers: [{ n: 'Normal', m: 1, pen: 0, d: 'One target at a time.' }, { n: 'Hard', m: 1.5, pen: 2, d: 'Several targets that vanish on their own. Missing a shot costs a point.' }],
  name: 'Target Practice', desc: 'Click the targets as fast as you can! 15 seconds, most hits wins. Missed targets move on.',
  create(ctx) {
    const HARD = ctx.diff === 1, LIFE = HARD ? .95 : 1.2;                              // hard: shorter-lived targets (several at once in solo, one extra per team in the team version)
    const botFn = s => ({ v: Math.round(jit(mix(7, 26, s), .15) * (HARD ? .85 : 1)), t: 15 }), sb = scoreboard(ctx, { timeout: 25, lower: false, bot: botFn }), pos = Array.from({ length: 300 }, () => [ctx.rng() * 86, ctx.rng() * 78]);
    const TM = !!ctx.team;
    let i = 0, hits = 0, time = 0, life = LIFE, done = false, born = 0;
    const W = ctx.world, ids = Object.keys(ctx.players), n = ids.length, me = ctx.me, st = {}, np = {}; ids.forEach(id => st[id] = 0);
    const el = document.createElement('div'); el.className = 'mg'; el.innerHTML = '<h3 id="s"></h3>'; ctx.hud.append(el); const s = el.querySelector('#s');

    // ---------- the set ----------
    const dist = fitDist(W, 10, 15);
    const S = stage(ctx, { sky: 0x050914, fog: { color: 0x050914, near: 26, far: 60 }, light: .8, sun: { intensity: .7, color: 0xb0d0ff, pos: [0, 14, 8] }, cam: { pos: [0, 3.4, dist], look: [0, 5, 0] }, camFrom: [0, 8, dist + 9], camT: 1.4 });
    S.box(80, .5, 60, 0x10131f, 0, -.5, -8); S.box(40, 16, .4, 0x0e1226, 0, 0, -6.4);
    for (let k = -9; k <= 9; k++) S.box(.05, 16, .05, 0x1f6fff, k * 2, 0, -6.15, { basic: true });
    for (let k = 0; k < 8; k++) S.box(40, .05, .05, 0x1f6fff, 0, 1 + k * 2, -6.15, { basic: true });
    for (let k = 0; k < 6; k++) { S.box(.5, .1, 30, 0x8fe3ff, (k % 2 ? 1 : -1) * (4 + (k >> 1) * 4), 10.5, -4, { basic: true }); }                                  // ceiling light strips
    S.box(.3, 1.3, 38, 0x2a3350, -9.5, 0, -4); S.box(.3, 1.3, 38, 0x2a3350, 9.5, 0, -4);
    const tg = new THREE.Group(); S.root.add(tg); tg.visible = false;
    const ring = (r, c, z) => { const m = new THREE.Mesh(new THREE.CircleGeometry(r, 32), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: .95 })); m.position.z = z; tg.add(m); return m; };
    const hit = ring(.95, 0xe74c3c, 0); ring(.66, 0xffffff, .01); ring(.36, 0xe74c3c, .02); ring(.12, 0xffffff, .03); const halo = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.12, 32), new THREE.MeshBasicMaterial({ color: 0x8fe3ff, transparent: true, opacity: .8, side: THREE.DoubleSide })); tg.add(halo);
    const gap = Math.min(2.4, 14 / n); ids.forEach((id, k) => { const x = (k - (n - 1) / 2) * gap; W.put(id, x, 2.4, Math.PI); const pe = W.m.get(id); if (pe) pe.g.scale.setScalar(.7); np[id] = nameplate(S, ctx, id); np[id].mesh.position.set(x, 2.6, 2.4); np[id].set('0'); });
    const beam = (id, ti) => {          // a short laser from a player's chest to the target position
      const g = W.m.get(id)?.g; if (!g) return; const a = new THREE.Vector3(g.position.x, 1.3, g.position.z), b = new THREE.Vector3(...tpos(pos[ti])), len = a.distanceTo(b);
      const m = S.box(.07, .07, 1, ctx.players[id].color, 0, 0, 0, { basic: true, op: .9 }); m.geometry.translate(0, 0, .5); m.position.copy(a); m.lookAt(b); m.scale.z = len;
      S.after(.12, () => { S.root.remove(m); m.geometry.dispose(); m.material.dispose(); });
    };
    S.anim((dt, tn) => {
      tg.visible = !done && !TM && !HARD; const p = tpos(pos[i]); tg.position.set(p[0], p[1], p[2]); const age = time - born, k = Math.min(1, age * 8), out = Math.min(1, life / .3);
      tg.scale.setScalar(Math.max(.01, k * out)); halo.scale.setScalar(1 + Math.sin(tn * 10) * .08);
      ids.forEach(id => np[id].set(String(id === me ? hits : ctx.players[id]?.bot ? Math.round(sb.get(id)) : st[id])));
    });
    const net = share(ctx, 't', ev => { if (!(ev.id in st)) return; st[ev.id] = ev.h | 0; beam(ev.id, Math.max(0, Math.min(299, ev.i | 0))); W.hop(ev.id, .25); });

    // ---------- TEAM VERSION: each team shares a pool of targets (one per teammate). Anyone on the team can shoot any of them; the host decides who claimed it ----------
    if (TM) {
      const team = ctx.team, K = ctx.teamCount || 2, myT = team(me), size = T => ids.filter(id => team(id) === T).length, hostSide = ctx.isHost;
      const slots = Array.from({ length: K }, (_, T) => Array.from({ length: size(T) + (HARD ? 1 : 0) }, (_, k) => ({ idx: T * 70 + k, life: LIFE, born: 0 }))), nxt = Array.from({ length: K }, (_, T) => T * 70 + size(T) + (HARD ? 1 : 0)), ts = Array(K).fill(0), hc = {}; ids.forEach(id => hc[id] = 0);
      const meshes = slots[myT].map(() => { const g = tg.clone(true); g.visible = true; S.root.add(g); return g; });
      const apply = ev => {
        const sl = slots[ev.T][ev.s]; if (!sl) return; sl.idx = ev.idx; sl.life = LIFE; sl.born = time; if (ev.ts != null) ts[ev.T] = ev.ts;
        if (ev.by) { hc[ev.by] = ev.h; if (ev.T === myT) { beam(ev.by, ev.old); W.hop(ev.by, .25); const p = tpos(pos[ev.old % 300]); W.burst(p[0], p[1], p[2] + .3, '#ffd93d', 10); } }
      };
      const claim = (by, T, c) => {                                    // host: first claim wins
        const T2 = team(by); if (T2 == null) return; const k = slots[T2].findIndex(x => x.idx === c); if (k < 0) return;
        hc[by]++; ts[T2]++; const sl = slots[T2][k]; sl.idx = nxt[T2]++; sl.life = LIFE; const ev = { k: 'tt', T: T2, s: k, old: c, idx: sl.idx, by, ts: ts[T2], h: hc[by] }; apply(ev); ctx.send(ev);
      };
      const myMesh = m => m.children[0];
      const onDownT = e => {
        if (done) return; const b = pick(W, S.root, e, meshes.map(myMesh)); if (!b) return;
        const k = meshes.findIndex(g => myMesh(g) === b); if (k < 0) return; const c = slots[myT][k].idx; sfx('click');
        if (hostSide) claim(me, myT, c); else ctx.send({ k: 'cl', c });
      };
      addEventListener('pointerdown', onDownT);
      botFn.live = id => ts[team(id)] * 100 + hc[id]; let botAcc = {};
      s.textContent = '';
      return {
        update(dt) {
          time += dt; sb.prog(hc[me]), sb.tick(dt);
          if (hostSide && !done) {
            for (let T = 0; T < K; T++) slots[T].forEach((sl, k) => { if ((sl.life -= dt) <= 0) { sl.idx = nxt[T]++; sl.life = LIFE; const ev = { k: 'tt', T, s: k, old: -1, idx: sl.idx, by: null }; apply(ev); ctx.send(ev); } });
            for (const id of ids) if (ctx.players[id]?.bot) { const sk = ctx.skill?.(id) ?? .5; botAcc[id] = (botAcc[id] ?? Math.random() * .8) - dt; if (botAcc[id] <= 0) { botAcc[id] = mix(1.5, .5, sk) * (.7 + Math.random() * .6); const T = team(id), k = Math.random() * slots[T].length | 0; if (slots[T][k] && Math.random() < .55 + .4 * sk) claim(id, T, slots[T][k].idx); } }
          }
          if (!done && time >= 15) { done = true; sb.report(ts[myT] * 100 + hc[me]); W.emote(me, 'cheer'); }
          meshes.forEach((g, k) => { const sl = slots[myT][k], p = tpos(pos[sl.idx % 300]), age = time - sl.born, u = Math.min(1, age * 8), out = Math.min(1, sl.life / .3); g.visible = !done; g.position.set(p[0], p[1], p[2]); g.scale.setScalar(Math.max(.01, u * out)); });
          ids.forEach(id => np[id].set(String(hc[id])));
          s.textContent = done ? `Team hits: ${ts[myT]} - waiting for others...` : `${Math.ceil(15 - time)}s   Team: ${ts[myT]}   You: ${hc[me]}`;
        },
        endNow() { sb.endNow(); },
        onMessage(m, from) {
          if (hostSide) { if (m.k === 'cl' && ids.includes(from)) claim(from, team(from), m.c | 0); else sb.onMessage(m, from); return; }
          if (m.k === 'tt') { if (m.T >= 0 && m.T < K) apply(m); return; } sb.onMessage(m, from);
        },
        cleanup() { removeEventListener('pointerdown', onDownT); el.remove(); S.cleanup(); },
      };
    }

    // ---------- HARD (solo): three targets at once, each vanishes after a moment (no penalty); clicking empty space costs a point ----------
    if (HARD && !TM) {
      let nx = 0; const hs = [0, 1, 2].map(() => { const g = tg.clone(true); g.visible = true; S.root.add(g); return { g, hit: g.children[0], idx: nx++, life: LIFE * (.5 + Math.random() * .5), born: 0 }; });
      const onDownH = e => {
        if (done) return; const b = pick(W, S.root, e, hs.map(h => h.hit)), k = hs.findIndex(h => h.hit === b);
        if (k < 0) { hits = Math.max(0, hits - 1); sfx('lose'); W.shake?.(.06, .12); net.emit({ h: hits, i: hs[0].idx }); return; }
        const h = hs[k]; hits++; sfx('click'); beam(me, h.idx); W.hop(me, .25); const p = tpos(pos[h.idx % 300]); W.burst(p[0], p[1], p[2] + .3, '#ffd93d', 10); net.emit({ h: hits, i: h.idx }); h.idx = nx++; h.life = LIFE; h.born = time;
      };
      addEventListener('pointerdown', onDownH);
      S.anim(() => hs.forEach(h => { const p = tpos(pos[h.idx % 300]), u = Math.min(1, (time - h.born) * 8), out = Math.min(1, h.life / .3); h.g.visible = !done; h.g.position.set(p[0], p[1], p[2]); h.g.scale.setScalar(Math.max(.01, u * out)); }));
      return {
        update(dt) {
          sb.prog(hits), sb.tick(dt); time += dt;
          if (!done) { for (const h of hs) if ((h.life -= dt) <= 0) { h.idx = nx++; h.life = LIFE; h.born = time; } if (time >= 15) { done = true; sb.report(hits); W.emote(me, 'cheer'); } }
          s.textContent = done ? `Hits: ${hits} - waiting for others...` : `${Math.ceil(15 - time)}s   Hits: ${hits}   (misses cost 1)`;
        },
        endNow() { sb.endNow(); },
        onMessage(m, from) { if (net.handle(m, from)) return; sb.onMessage(m, from); },
        cleanup() { removeEventListener('pointerdown', onDownH); el.remove(); S.cleanup(); },
      };
    }

    // ---------- play ----------
    const onDown = e => {
      if (done) return; const b = pick(W, S.root, e, [hit]); if (!b) return;
      hits++; sfx('click'); const hi = i; beam(me, hi); W.hop(me, .25); const p = tpos(pos[hi]); W.burst(p[0], p[1], p[2] + .3, '#ffd93d', 10); net.emit({ h: hits, i: hi }); i++; life = LIFE; born = time;
    };
    addEventListener('pointerdown', onDown);
    return {
      update(dt) {
        sb.prog(hits), sb.tick(dt); time += dt;
        if (!done) {
          if ((life -= dt) <= 0) { i++; life = LIFE; born = time; }
          if (time >= 15) { done = true; sb.report(hits); W.emote(me, 'cheer'); }
        }
        s.textContent = done ? `Hits: ${hits} - waiting for others...` : `${Math.ceil(15 - time)}s   Hits: ${hits}`;
      },
      endNow() { sb.endNow(); },
      onMessage(m, from) { if (net.handle(m, from)) return; sb.onMessage(m, from); },
      cleanup() { removeEventListener('pointerdown', onDown); el.remove(); S.cleanup(); },
    };
  },
};
