import * as THREE from 'three';
// Lobby shoving: host-simulated free-roam + knock-back + a little ragdoll (tumble, fall off the island, drop back from the sky).
// Cosmetic physics only -- nothing here touches game rules. Sim entries are {x, z, ix, iz}; the extra fields are added lazily.
const R_WALK = 12, R_FLOOR = 12.6, G = 30, RESPAWN_Y = 22, rnd = (a, b) => a + Math.random() * (b - a);
const ensure = s => { if (s.y === undefined) Object.assign(s, { y: 0, vy: 0, vx: 0, vz: 0, rx: 0, rz: 0, wx: 0, wz: 0, st: 0, cd: 0, fx: 0, fz: 1, settle: 0 }); return s; };
const knock = (t, dx, dz) => { t.st = 1; t.vx = dx * rnd(9, 12) + rnd(-1, 1); t.vz = dz * rnd(9, 12) + rnd(-1, 1); t.vy = rnd(6, 8.5); t.wx = rnd(-10, 10); t.wz = rnd(-10, 10); t.settle = 0; };

// One simulation step for everyone (host). Returns the snapshot to broadcast: id -> [x, z, y, rx, rz, ragdoll?1:0, scale]
// st: 0 standing | 1 ragdoll (knocked / falling) | 2 getting up | 3 drifting down from the sky after a fall
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
export function stepLobby(sim, world, dt) {
  const snap = {};
  for (const id in sim) {
    const s = ensure(sim[id]); s.cd = Math.max(0, s.cd - dt);
    if (s.mvx === undefined) { s.mvx = 0; s.mvz = 0; s.sc = 1; s.gu = 0; }
    if (!s.st) {
      if (Math.hypot(s.ix, s.iz) > .1) { s.fx = s.ix; s.fz = s.iz; }
      const k = Math.min(1, dt * 12); s.mvx += (s.ix * 7 - s.mvx) * k; s.mvz += (s.iz * 7 - s.mvz) * k;          // eased acceleration: no instant snapping
      s.x += s.mvx * dt; s.z += s.mvz * dt;
      if (Math.hypot(s.x, s.z) > R_FLOOR) { s.st = 1; s.vx = s.mvx * .9; s.vz = s.mvz * .9; s.vy = 1.5; s.wx = rnd(-4, 4); s.wz = rnd(-4, 4); s.settle = 0; }   // you can walk off the edge on purpose
      else { world.set(id, s.x, s.z); if (world.m.get(id)?.rag) world.rag(id, null); }
    }
    if (s.st === 1) {
      s.vy -= G * dt; s.y += s.vy * dt; s.x += s.vx * dt; s.z += s.vz * dt; s.rx += s.wx * dt; s.rz += s.wz * dt;
      const onFloor = Math.hypot(s.x, s.z) < R_FLOOR;
      if (onFloor && s.y <= 0 && s.vy < 0) {                               // landed: bounce / slide / settle
        s.y = 0;
        if (s.vy < -5) { s.vy = -s.vy * .38; s.vx *= .65; s.vz *= .65; s.wx *= .6; s.wz *= .6; }
        else { s.vy = 0; const f = Math.max(0, 1 - dt * 7); s.vx *= f; s.vz *= f; s.wx *= f; s.wz *= f; }
      }
      if (onFloor && s.y <= 0 && Math.hypot(s.vx, s.vz) < 1.2) { if ((s.settle += dt) > .5) { s.st = 2; s.gu = 0; s.rx = wrap(s.rx); s.rz = wrap(s.rz); s.vx = s.vz = s.wx = s.wz = 0; } } else s.settle = 0;
      s.sc = s.y < -6 ? Math.max(0, (s.y + 16) / 10) : 1;                  // shrinks away into the void instead of popping out of view
      if (s.y < -16) { const a = rnd(0, 6.283), r = rnd(0, 6); s.x = Math.sin(a) * r; s.z = Math.cos(a) * r; s.y = 14; s.vy = 0; s.vx = s.vz = 0; s.wx = s.wz = 0; s.rx = wrap(s.rx); s.rz = wrap(s.rz); s.sc = 0; s.st = 3; s.mvx = s.mvz = 0; }
    } else if (s.st === 2) {                                                // getting up: ease upright with a little hop
      s.gu += dt; const k = Math.min(1, dt * 7); s.rx += (0 - s.rx) * k; s.rz += (0 - s.rz) * k; s.y = Math.sin(Math.min(1, s.gu / .55) * Math.PI) * .3;
      if (s.gu >= .55) { s.st = 0; s.rx = s.rz = 0; s.y = 0; world.rag(id, null); }
    } else if (s.st === 3) {                                                // re-entry: fade in high above and float gently down (parachute-style)
      s.sc = Math.min(1, s.sc + dt * 2.2); s.vy = Math.max(-7, s.vy - 12 * dt); s.y += s.vy * dt; const k = Math.min(1, dt * 5); s.rx += (0 - s.rx) * k; s.rz += (0 - s.rz) * k;
      if (s.y <= 0) { s.y = 0; s.vy = 0; s.sc = 1; s.rx = s.rz = 0; s.st = 0; world.rag(id, null); world.hop(id, .35); }
    }
    if (s.st) { world.set(id, s.x, s.z); world.rag(id, { y: s.y, rx: s.rx, rz: s.rz, sc: s.sc }); }
    snap[id] = [+s.x.toFixed(2), +s.z.toFixed(2), +s.y.toFixed(2), +s.rx.toFixed(2), +s.rz.toFixed(2), s.st ? 1 : 0, +(s.sc ?? 1).toFixed(2)];
  }
  return snap;
}

// A shove by `id`. Returns { dx, dz, hit: [ids] } or null (cooling down / ragdolling).
export function doPush(sim, id) {
  const s = sim[id] && ensure(sim[id]); if (!s || s.st || s.cd > 0) return null; s.cd = .6;
  let dx = s.fx, dz = s.fz; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
  const near = []; let best = null, bs = -9;
  for (const o in sim) {
    if (o === id) continue; const t = ensure(sim[o]); if (t.st) continue;
    const ex = t.x - s.x, ez = t.z - s.z, d = Math.hypot(ex, ez); if (d > 2.8 || d < .01) continue;
    const c = (ex * dx + ez * dz) / d; if (c < .3) continue; near.push([o, t, ex / d, ez / d]); const sc = c - d * .1; if (sc > bs) { bs = sc; best = [ex / d, ez / d]; }
  }
  if (best) { dx = best[0]; dz = best[1]; }                                // gentle auto-aim at the best target
  for (const [, t] of near) knock(t, dx, dz);
  s.fx = dx; s.fz = dz; s.mvx += dx * 3; s.mvz += dz * 3;
  return { dx, dz, hit: near.map(n => n[0]) };
}

// Two floating "hands" shaped like the player's body type do a quick shove motion (cosmetic, every client).
export function pushFx(W, p, id, dx, dz) {
  const e = W.m.get(id); if (!e) return;
  const geo = { round: new THREE.SphereGeometry(.26, 10, 8), tall: new THREE.BoxGeometry(.26, .42, .26), pyramid: new THREE.ConeGeometry(.28, .45, 4) }[p?.body] || new THREE.BoxGeometry(.38, .38, .38);
  const mat = new THREE.MeshStandardMaterial({ color: p?.accent || p?.color || '#fff', flatShading: true, transparent: true });
  const hands = [0, 1].map(() => { const m = new THREE.Mesh(geo, mat); W.scene.add(m); return m; }), px = -dz, pz = dx; let t = 0, dead = false;
  W.lean(id, .5);
  const f = dt => {
    if (dead) return; t += dt; const k = t < .14 ? t / .14 : t < .3 ? 1 : Math.max(0, 1 - (t - .3) / .22), ease = 1 - (1 - k) * (1 - k), d = .4 + 1.6 * ease;
    hands.forEach((m, i) => { const sd = i ? 1 : -1, w = .55 * (1 - .35 * ease); m.position.set(e.g.position.x + dx * d + px * sd * w, e.g.position.y + 1.25, e.g.position.z + dz * d + pz * sd * w); m.rotation.y = Math.atan2(dx, dz); m.scale.setScalar(.6 + .6 * ease); });
    mat.opacity = Math.min(1, (.52 - t) * 8);
    if (t >= .52) { dead = true; hands.forEach(m => W.scene.remove(m)); geo.dispose(); mat.dispose(); W.lean(id, 0); setTimeout(() => { const j = W.anim.indexOf(f); if (j >= 0) W.anim.splice(j, 1); }, 0); }
  };
  W.anim.push(f);
}

// Client: apply a host snapshot of the lobby.
export function applySnap(world, d) {
  for (const id in d) { const q = d[id]; world.set(id, q[0], q[1]); if (q[5]) world.rag(id, { y: q[2], rx: q[3], rz: q[4], sc: q[6] ?? 1 }); else if (world.m.get(id)?.rag) world.rag(id, null); }
}
// Leaving the lobby (board / minigame / podium starts): everybody stands up again.
export function clearRag(world, sim) {
  for (const [id, e] of world.m) if (e.rag) world.rag(id, null);
  if (sim) for (const id in sim) { const s = sim[id]; if (s.st) { s.st = 0; s.y = 0; s.sc = 1; s.vx = s.vz = s.vy = s.rx = s.rz = s.mvx = s.mvz = 0; const r = Math.hypot(s.x, s.z); if (r > R_WALK) { s.x *= R_WALK / r; s.z *= R_WALK / r; } } }
}
