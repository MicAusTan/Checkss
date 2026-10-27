import { sfx } from '../sfx.js';
import * as THREE from 'three';
import { stage } from './stage.js';
import { driveBots } from './arena.js';
import { topDown, starfield } from './kit.js';
// Real-time test: host simulates everyone, clients send input and render snapshots.
// Shrinking platform; last one standing wins. WASD to move, SPACE to dash.
const TAU = Math.PI * 2;
// Set: a metal platform floating in deep space, edged with a glowing ring that shrinks with it. Stars, a ringed planet and drifting asteroids
// surround it; anyone shoved off tumbles into the void.
export default {
  emotes: false, name: 'Shove Off', desc: 'Knock everyone off the shrinking platform! WASD to move, SPACE to dash.',
  create(ctx) {
    const W = ctx.world, ids = Object.keys(ctx.players), host = ctx.isHost;
    const st = {}, out = [], held = {}, fall = {}, was = {};
    let time = 0, R = 8, acc = 1, over = false, lastIn = '', dashCd = 0, snap = {};
    ids.forEach((id, k) => { const a = k / ids.length * TAU; st[id] = { x: Math.sin(a) * 4, z: Math.cos(a) * 4, vx: 0, vz: 0, ix: 0, iz: 0, fx: 0, fz: 1, cd: 0, dash: false, alive: true }; });
    const S = stage(ctx, { ...topDown(W, 11, 17), sky: 0x04030f, light: .75, sun: { color: 0xcfd8ff, intensity: 1.1, pos: [6, 14, 8] } });
    starfield(S, 320, 80, -30);
    const ball = S.sph(9, 0x6a4bd8, -44, -12, -60, { seg: 18 }); const pr = new THREE.Mesh(new THREE.RingGeometry(12, 16, 48), new THREE.MeshBasicMaterial({ color: 0xc9b8ff, transparent: true, opacity: .5, side: THREE.DoubleSide })); pr.position.copy(ball.position); pr.rotation.x = 1.25; S.root.add(pr);
    S.sph(5, 0xe0724a, 36, 6, -52, { seg: 14 }); S.sph(30, 0x2a1a6a, 0, -40, -90, { basic: true, op: .25, seg: 10 });
    const rocks = Array.from({ length: 10 }, (_, k) => { const a = k / 10 * 6.283, r = 20 + k % 4 * 5, m = S.sph(1 + k % 3 * .7, 0x6b6f80, Math.sin(a) * r, -2 + k % 3 * 2, Math.cos(a) * r - 4, { seg: 5 }); m.userData.a = a; m.userData.r = r; return m; });
    S.anim((dt, tn) => rocks.forEach((m, k) => { const a = m.userData.a + tn * .03 * (k % 2 ? 1 : -1); m.position.x = Math.sin(a) * m.userData.r; m.position.z = Math.cos(a) * m.userData.r - 4; m.rotation.x += dt * .4; m.rotation.y += dt * .3; }));
    const plat = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, .4, 28), new THREE.MeshStandardMaterial({ color: 0x59608f, flatShading: true }));
    plat.position.y = -.2; S.root.add(plat);
    const rim = new THREE.Mesh(new THREE.RingGeometry(.94, 1, 64), new THREE.MeshBasicMaterial({ color: 0x4dd0e1, side: THREE.DoubleSide })); rim.rotation.x = -Math.PI / 2; rim.position.y = .03; S.root.add(rim);
    const el = document.createElement('div'); el.className = 'mg'; ctx.hud.append(el);

    const vec = () => {
      const x = (held.KeyD || held.ArrowRight ? 1 : 0) - (held.KeyA || held.ArrowLeft ? 1 : 0);
      const z = (held.KeyS || held.ArrowDown ? 1 : 0) - (held.KeyW || held.ArrowUp ? 1 : 0), l = Math.hypot(x, z) || 1;
      return { x: x / l, z: z / l };
    };
    const kd = e => {
      held[e.code] = true;
      if (e.code === 'Space' && !e.repeat && dashCd <= 0) { dashCd = 1.5; sfx('dash'); host ? st[ctx.me] && (st[ctx.me].dash = true) : ctx.send({ d: 1 }); }
    };
    const ku = e => { held[e.code] = false; };
    addEventListener('keydown', kd); addEventListener('keyup', ku);

    function step(dt) {
      R = Math.max(3.2, 8 - time * .13);
      driveBots(ctx, st, dt, (id, s, sk) => {
        if (Math.hypot(s.x, s.z) > R - 1.2 - 1.5 * sk) return [-s.x, -s.z];
        let b = null, bd = 1e9; for (const o of ids) { if (o === id || !st[o].alive) continue; const d = Math.hypot(st[o].x - s.x, st[o].z - s.z); if (d < bd) { bd = d; b = st[o]; } }
        if (!b) return null; if (bd < 2.8 && s.cd <= 0 && Math.random() < .35 + .5 * sk) s.dash = true;
        return [b.x - s.x, b.z - s.z];
      });
      const live = ids.filter(id => st[id].alive);
      for (const id of ids) {
        const s = st[id];
        if (!s.alive) { s.x += s.vx * dt; s.z += s.vz * dt; continue; }
        const l = Math.hypot(s.ix, s.iz); if (l > .01) { s.fx = s.ix / l; s.fz = s.iz / l; }
        s.vx += s.ix * 24 * dt; s.vz += s.iz * 24 * dt;
        s.cd -= dt; if (s.dash && s.cd <= 0) { s.vx += s.fx * 13; s.vz += s.fz * 13; s.cd = 1.5; } s.dash = false;
        const d = Math.exp(-3 * dt); s.vx *= d; s.vz *= d; s.x += s.vx * dt; s.z += s.vz * dt;
      }
      for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
        const a = st[live[i]], b = st[live[j]], dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
        if (d >= 1 || d < .001) continue;
        const nx = dx / d, nz = dz / d, o = (1 - d) / 2;
        a.x -= nx * o; a.z -= nz * o; b.x += nx * o; b.z += nz * o;
        const rel = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
        if (rel > 0) { const j2 = rel + 3; a.vx -= nx * j2; a.vz -= nz * j2; b.vx += nx * j2; b.vz += nz * j2; }
      }
      for (const id of live) if (Math.hypot(st[id].x, st[id].z) > R + .3) { st[id].alive = false; out.push(id); }
    }
    const pack = () => { const p = {}; ids.forEach(id => p[id] = [+st[id].x.toFixed(2), +st[id].z.toFixed(2), st[id].alive ? 1 : 0]); return { p, r: +R.toFixed(2) }; };

    return {
      update(dt) {
        time += dt; dashCd -= dt; const v = vec();
        if (host && !over) { const me = st[ctx.me]; if (me) { me.ix = v.x; me.iz = v.z; } step(dt); }
        else if (!host) { const k = v.x + ',' + v.z; if (k !== lastIn) { lastIn = k; ctx.send(v); } }
        let aliveN = 0;
        for (const id of ids) {
          let x, z, alive;
          if (host) { const s = st[id]; x = s.x; z = s.z; alive = s.alive; }
          else { const q = snap[id]; if (!q) continue; [x, z] = q; alive = q[2]; }
          if (was[id] && !alive) sfx('fall'); was[id] = alive ? 1 : 0; if (alive) aliveN++;
          W.set(id, x, z); const g = W.m.get(id)?.g; if (!g) continue;
          if (!alive) { fall[id] = (fall[id] || 0) + 30 * dt; g.position.y = Math.max(-40, g.position.y - fall[id] * dt); }
        }
        plat.scale.set(R, 1, R); rim.scale.set(R, R, 1);
        el.innerHTML = `<h3>Alive: ${aliveN}/${ids.length}</h3><div>Dash: ${dashCd <= 0 ? 'READY' : dashCd.toFixed(1) + 's'}</div>`;
        if (!host || over) return;
        if ((acc += dt) >= .05) { acc = 0; ctx.send(pack()); }
        const alive = ids.filter(id => st[id].alive);
        if (alive.length <= (ids.length > 1 ? 1 : 0) || time > 70) {
          over = true; ctx.send(pack());
          alive.sort((a, b) => Math.hypot(st[a].x, st[a].z) - Math.hypot(st[b].x, st[b].z));
          ctx.finish([...alive, ...out.reverse()]);
        }
      },
      onMessage(m, from) {
        if (host) {
          const s = st[from]; if (!s) return;
          if (m.d) s.dash = true;
          else if (m.x != null) { const x = +m.x || 0, z = +m.z || 0, l = Math.max(1, Math.hypot(x, z)); s.ix = x / l; s.iz = z / l; }
        } else if (m.p) { snap = m.p; R = m.r; }
      },
      cleanup() {
        removeEventListener('keydown', kd); removeEventListener('keyup', ku);
        el.remove(); S.cleanup();
        for (const id of ids) { const g = W.m.get(id)?.g; if (g) g.position.y = 0; }
      },
    };
  },
};
