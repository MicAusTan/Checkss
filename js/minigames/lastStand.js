import * as THREE from 'three';
import { sfx } from '../sfx.js';
import { arena } from './arena.js';
import { topDown, ringPts, starfield } from './kit.js';
// CO-OP. Set: a moonlit stone courtyard around a glowing crystal. Goblins pour in from the dark and march on it; everyone shoots them
// (SPACE, move to aim -- same controls as Snowball Fight). Nobody can be hurt; the crystal's health left at the end is the shared prize.
const HP0 = 10, DUR = 45, TIER = [8, 5, 2], NAMES = ['GOLD', 'SILVER', 'BRONZE', 'No prize'];
const gGeo = new THREE.IcosahedronGeometry(.5, 0), hGeo = new THREE.ConeGeometry(.12, .4, 4), bGeo = new THREE.IcosahedronGeometry(.28, 0);
export default {
  coop: true,
  tiers: [{ n: 'Easy', m: .8, pen: 0, d: 'Aim with the MOUSE: click where you want to shoot.' }, { n: 'Normal', m: 1, pen: 0, def: true }, { n: 'Hard', m: 1.4, pen: 0, d: 'More goblins; you shoot a bit faster to compensate.' }],
  name: 'Last Stand', desc: 'CO-OP! Goblins march on the crystal. Shoot them with SPACE or a left-click (move to aim; on Easy click where you want to shoot) - nobody can be hurt, but every goblin that reaches the crystal chips it. Keep it healthy for a better prize, shared by everyone.',
  create(ctx) {
    const W = ctx.world, A = arena(ctx, { set: { ...topDown(W, 13.5, 21), sky: 0x10163a, fog: { color: 0x10163a, near: 40, far: 100 }, light: .8, sun: { color: 0xa8b8ff, intensity: .9, pos: [-6, 16, 8] } } }), { ids, st, S } = A, host = ctx.isHost;
    const el = document.createElement('div'); el.className = 'mg'; ctx.hud.append(el);

    // ---------- the set ----------
    S.cyl(12.6, 13, .5, 0x4a4f63, 0, -.5, 0, { seg: 36 }); S.cyl(10, 10, .03, 0x5a6078, 0, 0, 0, { seg: 36 }); S.cyl(40, 40, .5, 0x1c2140, 0, -.9, 0, { seg: 36 });
    S.cyl(4.4, 4.4, .06, 0x2b3a7a, 0, .02, 0, { seg: 24, em: 0x0a1440 }); S.cyl(3.4, 3.4, .08, 0x35498f, 0, .03, 0, { seg: 24, em: 0x0a1a55 });   // rune circle
    S.cyl(1.7, 2, .8, 0x6b7088, 0, 0, 0, { seg: 8 });
    const crystal = S.cone(1.1, 3.2, 0x66e0ff, 0, .8, 0, { basic: true, seg: 6 }), crystal2 = S.cone(1.1, 1.4, 0x66e0ff, 0, .8, 0, { basic: true, seg: 6 }); crystal2.rotation.x = Math.PI; crystal2.position.y = .8 + 3.2 + 1.4;
    const glow = S.sph(2.6, 0x66e0ff, 0, 2.6, 0, { basic: true, seg: 10 }); glow.material.transparent = true; glow.material.opacity = .1;
    const flames = []; ringPts(8, 13.4, .2).forEach(([x, z]) => { S.cyl(.18, .24, 1.8, 0x3a3a48, x, 0, z, { seg: 6 }); flames.push(S.cone(.34, .8, 0xffa733, x, 1.8, z, { basic: true, seg: 6 })); });
    ringPts(3, 15.6, .5).forEach(([x, z, a]) => { S.box(1.2, 5, 1.2, 0x555a70, x + Math.cos(a) * 1.6, 0, z - Math.sin(a) * 1.6, { ry: a }); S.box(1.2, 5, 1.2, 0x555a70, x - Math.cos(a) * 1.6, 0, z + Math.sin(a) * 1.6, { ry: a }); S.box(4.4, 1, 1.3, 0x606680, x, 5, z, { ry: a }); });   // goblin gates
    ringPts(14, 21, .3).forEach(([x, z], k) => { S.cyl(.3, .4, 2.2 + k % 3, 0x2a2438, x, 0, z, { seg: 5 }); S.cone(1.5, 3.4, 0x1d3a2e, x, 2 + k % 3, z, { seg: 5 }); });   // dead-dark pines
    starfield(S, 200, 70, 6);
    S.sph(3.2, 0xfff2c0, -26, 26, -42, { basic: true });
    S.anim((dt, tn) => { flames.forEach((f, k) => f.scale.set(1, .8 + Math.abs(Math.sin(tn * 7 + k * 2)) * .5, 1)); glow.material.opacity = .08 + Math.sin(tn * 2) * .03; });
    const gm = new THREE.MeshStandardMaterial({ color: 0x5fae3c, flatShading: true }), gt = new THREE.MeshStandardMaterial({ color: 0xa04040, flatShading: true });
    const hm = new THREE.MeshStandardMaterial({ color: 0xe8e0c0, flatShading: true }), bm = new THREE.MeshBasicMaterial({ color: 0xbfefff });
    const gobs = [], bms = [];

    // ---------- host simulation ----------
    for (const id of ids) { st[id].fx = 0; st[id].fz = -1; st[id].fire = false; st[id].aim = null; }
    const cd = {}; ids.forEach(id => cd[id] = 0);
    let en = [], bl = [], hp = HP0, time = 0, spawnT = 1.5, acc = 0, over = false, kills = 0, evN = 0, evs = [], rk = null, seenEv = 0, prevHp = HP0, ended = false;
    const EASY = ctx.diff === 0, rc = new THREE.Raycaster(), gp = new THREE.Plane(new THREE.Vector3(0, 1, 0), -.8), hitP = new THREE.Vector3();
    const mouseAim = e => {                                            // easy tier: aim at the mouse (ray -> ground plane), relative to my position
      const me_ = host ? st[ctx.me] : snap?.p?.[ctx.me] && { x: snap.p[ctx.me][0], z: snap.p[ctx.me][1] }; if (!me_ || !W.cam) return null;
      rc.setFromCamera({ x: e.clientX / innerWidth * 2 - 1, y: -(e.clientY / innerHeight) * 2 + 1 }, W.cam); if (!rc.ray.intersectPlane(gp, hitP)) return null;
      const dx = hitP.x - me_.x, dz = hitP.z - me_.z, l = Math.hypot(dx, dz); return l > .2 ? [dx / l, dz / l] : null;
    };
    const kd = e => { if (e.code === 'Space' && !e.repeat) host ? st[ctx.me] && (st[ctx.me].fire = true) : ctx.send({ f: 1 }); };
    addEventListener('keydown', kd); const pd = e => {
      if (e.button !== 0 || e.target.closest?.('button,input')) return; const a = EASY ? mouseAim(e) : null;
      if (!a) return kd({ code: 'Space' }); if (host) { if (st[ctx.me]) { st[ctx.me].aim = a; st[ctx.me].fire = true; } } else ctx.send({ f: 1, ax: +a[0].toFixed(3), az: +a[1].toFixed(3) });
    }; addEventListener('pointerdown', pd);
    const ev = (k, x, z) => { evs.push({ n: ++evN, k, x: +x.toFixed(1), z: +z.toFixed(1) }); if (evs.length > 12) evs.shift(); };
    const pack = () => ({ p: A.pack(), e: en.map(e => [+e.x.toFixed(2), +e.z.toFixed(2), e.hp]), b: bl.map(b => [+b.x.toFixed(2), +b.z.toFixed(2)]), h: Math.max(0, hp), t: +Math.max(0, DUR - time).toFixed(1), ev: evs, k: kills, o: rk });
    let snap = pack();
    const n = ids.length, load = [1.4, 1.15, .85, .68][Math.min(n, 4) - 1] * (n > 4 ? .85 : 1) * [1.25, 1, .8][ctx.diff ?? 1];   // more players -> more goblins
    function finish(r) {
      if (over) return; over = true; rk = Math.min(r, n - 1);
      A.S.after(2.4, () => ctx.finish([...ids], ids.map(() => rk)));       // let everyone see the result on the courtyard before the podium
    }
    function step(dt) {
      time += dt;
      A.bots(dt, (id, s, sk) => {
        let t = null, td = 1e9; for (const e of en) { const d = Math.hypot(e.x, e.z); if (d < td) { td = d; t = e; } }       // the goblin closest to the crystal
        if (!t) return Math.hypot(s.x, s.z) > 8 ? [-s.x, -s.z] : null;
        const off = ((id.charCodeAt(id.length - 1) % 5) - 2) * .3, ang = Math.atan2(t.x, t.z) + off, px = Math.sin(ang) * 6, pz = Math.cos(ang) * 6, dx = t.x - s.x, dz = t.z - s.z;
        if (Math.hypot(dx, dz) < 13 && Math.random() < .16 + .44 * sk) { const a = Math.atan2(dx, dz) + (Math.random() - .5) * ((1 - sk) * .8 + .22); s.aim = [Math.sin(a), Math.cos(a)]; s.fire = true; }
        return Math.hypot(px - s.x, pz - s.z) > 2.5 ? [px - s.x, pz - s.z] : null;
      });
      A.move(dt);
      for (const id of ids) {
        const s = st[id]; cd[id] -= dt;
        if (s.aim) { s.fx = s.aim[0]; s.fz = s.aim[1]; s.aim = null; } else if (Math.hypot(s.ix, s.iz) > .1) { s.fx = s.ix; s.fz = s.iz; }
        if (s.fire && cd[id] <= 0 && !over) { cd[id] = ctx.players[id]?.bot ? [.9, .85, .7][ctx.diff ?? 1] : [.46, .42, .33][ctx.diff ?? 1]; bl.push({ x: s.x + s.fx, z: s.z + s.fz, vx: s.fx * 18, vz: s.fz * 18, t: 1.1 }); }
        s.fire = false;
      }
      if (!over && (spawnT -= dt) <= 0) {
        spawnT = (1.3 - Math.min(.85, time * .02)) * load * (.75 + Math.random() * .5);
        const a = Math.random() * 6.283, tough = Math.random() < .14 + time * .006;
        en.push({ x: Math.sin(a) * 14, z: Math.cos(a) * 14, hp: tough ? 2 : 1, sp: tough ? 1.5 + time * .012 : 2.1 + time * .03 });
      }
      for (const e of en) { const d = Math.hypot(e.x, e.z) || 1, v = e.sp * dt; e.x -= e.x / d * v; e.z -= e.z / d * v; }
      bl = bl.filter(b => {
        b.x += b.vx * dt; b.z += b.vz * dt; if ((b.t -= dt) <= 0 || Math.hypot(b.x, b.z) > 15) return false;
        for (const e of en) if (e.hp > 0 && Math.hypot(e.x - b.x, e.z - b.z) < (e.hp > 1 ? .95 : .8)) { e.hp--; if (e.hp <= 0) { kills++; ev('d', e.x, e.z); } else ev('h', e.x, e.z); return false; }
        return true;
      });
      en = en.filter(e => {
        if (e.hp <= 0) return false;
        if (Math.hypot(e.x, e.z) < 1.8) { if (!over) { hp--; ev('t', e.x, e.z); } return false; }
        return true;
      });
      if (!over) { if (hp <= 0) finish(3); else if (time >= DUR) finish(hp >= TIER[0] ? 0 : hp >= TIER[1] ? 1 : hp >= TIER[2] ? 2 : 3); }
    }

    // ---------- rendering (every client, from the snapshot) ----------
    return {
      update(dt) {
        A.input();
        if (host) { step(dt); snap = pack(); if ((acc += dt) >= .05) acc = 0, ctx.send(snap); }
        A.show(snap.p);
        for (const v of snap.ev) if (v.n > seenEv) {
          seenEv = v.n;
          if (v.k === 'd') { W.burst(v.x, .8, v.z, '#7fd13b', 10); sfx('click'); } else if (v.k === 'h') W.burst(v.x, .8, v.z, '#ffffff', 4);
          else { W.burst(v.x, 1, v.z, '#66e0ff', 16); W.shake(.12, .2); sfx('hit'); }
        }
        while (gobs.length < snap.e.length) {
          const g = new THREE.Group(), body = new THREE.Mesh(gGeo, gm); body.position.y = .5; g.add(body);
          for (const sd of [-1, 1]) { const h = new THREE.Mesh(hGeo, hm); h.position.set(sd * .3, .95, 0); h.rotation.z = -sd * .4; g.add(h); }
          S.root.add(g); gobs.push(g);
        }
        gobs.forEach((g, i) => { const e = snap.e[i]; g.visible = !!e; if (!e) return; g.position.set(e[0], Math.abs(Math.sin(i * 3 + performance.now() / 120)) * .15, e[1]); g.rotation.y = Math.atan2(-e[0], -e[1]); g.children[0].material = e[2] > 1 ? gt : gm; g.scale.setScalar(e[2] > 1 ? 1.4 : 1); });
        while (bms.length < snap.b.length) { const m = new THREE.Mesh(bGeo, bm); S.root.add(m); bms.push(m); }
        bms.forEach((m, i) => { const b = snap.b[i]; m.visible = !!b; if (b) m.position.set(b[0], 1, b[1]); });
        const f = Math.max(.25, snap.h / HP0); crystal.scale.set(f, f, f); crystal2.scale.set(f, f, f); crystal.material.color.setHex(snap.h > 5 ? 0x66e0ff : snap.h > 2 ? 0xffd166 : 0xff5a5f); crystal2.material.color.copy(crystal.material.color); glow.material.color.copy(crystal.material.color);
        if (snap.o != null && !ended) { ended = true; ids.forEach(id => W.emote(id, snap.o < 3 ? 'cheer' : 'sad')); sfx(snap.o < 3 ? 'win' : 'lose'); }
        el.innerHTML = snap.o != null ? `<h2>${snap.o < 3 ? '🏆 ' : ''}${NAMES[snap.o]}!</h2><div>Crystal ${snap.h}/${HP0} • ${snap.k} goblins</div>`
          : `<h2>${Math.ceil(snap.t)}</h2><div class="bar"><span style="width:${snap.h / HP0 * 100}%;background:${snap.h > 5 ? '#66e0ff' : snap.h > 2 ? '#ffd166' : '#ff5a5f'}"></span><b>Crystal ${snap.h}/${HP0}</b></div><div>Goblins stopped: ${snap.k}</div>`;
      },
      onMessage(m, from) { if (A.onInput(m, from)) return; if (host) { if (m.f && st[from]) { st[from].fire = true; if (typeof m.ax === 'number' && typeof m.az === 'number') { const l = Math.hypot(m.ax, m.az); if (l > .1) st[from].aim = [m.ax / l, m.az / l]; } } } else if (m.p) snap = m; },
      cleanup() { removeEventListener('keydown', kd); removeEventListener('pointerdown', pd); A.cleanup(); el.remove(); },
    };
  },
};
