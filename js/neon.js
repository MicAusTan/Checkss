import * as THREE from 'three';
import { sstep } from './terrain.js';
import { catmull, resample } from './grove.js';
// Neon Strip: a big night-time city. A 44-space ring road circles the Grand Casino complex; shortcuts: the elevated Skybridge (12 spaces over the casino roof,
// high-roller squares) and a risky Back Alley (4 spaces, thieves and swaps). Unique squares: 🎡 roulette, 💰 jackpot (a shared pot that grows every round),
// 🚇 metro (ride to another station). Slots appear too.
const N = 44;
const RING_PTS = [[0, 30], [-14, 31], [-28, 28], [-38, 19], [-43, 6], [-42, -8], [-35, -19], [-22, -27], [-8, -30], [8, -31], [22, -27], [34, -20], [42, -8], [43, 6], [38, 19], [27, 28], [14, 31]];
const ringDense = catmull(RING_PTS, true, 30), ringXY = resample(ringDense, N, true);
const RT = Array.from({ length: N }, (_, i) => ['blue', 'blue', 'green', 'blue', 'red', 'blue'][i % 6]);
const set = (t, ids) => ids.forEach(i => RT[i] = t);
set('shop', [4, 15, 26, 37]); set('duel', [8, 21, 34]); set('metro', [6, 20, 35]); set('slot', [3, 13, 24, 39]); set('roulette', [9, 17, 28, 40]); set('jackpot', [14, 36]);
set('dash', [5, 19, 31]); set('thief', [11, 29]); set('swap', [23, 38]); RT[0] = 'blue'; RT[33] = 'blue'; RT[22] = 'red'; RT[41] = 'blue';
export const sp = ringXY.map(([x, z], i) => ({ x, z, y: 0, type: RT[i], next: [(i + 1) % N] }));
// Skybridge: straight over the casino roof, ramping up and down (y per sample)
const BEND = 22, SKY_H = 8.5, skyY = u => SKY_H * sstep(0, .3, u) * (1 - sstep(.7, 1, u));
const sDense = catmull([ringXY[0], [0, 21], [0, 8], [0, -8], [0, -21], ringXY[BEND]], false, 20).map(([x, z], i, a) => [x, z, skyY(i / (a.length - 1))]);
const ST = ['green', 'roulette', 'red', 'slot', 'jackpot', 'green', 'roulette', 'red', 'slot', 'green', 'red', 'blue'];
resample(sDense.map(p => [p[0], p[1]]), 12, false).forEach(([x, z], k) => sp.push({ x, z, y: +skyY((k + 1) / 13).toFixed(2), type: ST[k], bridge: true, next: [k < 11 ? N + k + 1 : BEND] }));
// Back alley: tucked inside the ring
const inward = ([x, z], k) => { const l = Math.hypot(x, z); return [x - x / l * k, z - z / l * k]; };
const AEND = 41, aDense = catmull([ringXY[33], inward(ringXY[35], 8), inward(ringXY[38], 8), ringXY[AEND]], false, 20), AT = ['thief', 'red', 'swap', 'green'], A0 = N + 12;
resample(aDense, 4, false).forEach(([x, z], k) => sp.push({ x, z, y: 0, type: AT[k], next: [k < 3 ? A0 + k + 1 : AEND] }));
sp[0].next = [1, N]; sp[33].next = [34, A0];
sp[1].label = '🎲 The Strip (safe, long)'; sp[N].label = '🌉 Skybridge (high-roller shortcut)'; sp[34].label = '🛣 Main road'; sp[A0].label = '🕶 Back alley (shortcut, shady)';

function neonDecor(W, add, anim) {
  let sd = 9; const r = () => (sd = sd * 16807 % 2147483647) / 2147483647, rr = (a, b) => a + r() * (b - a);
  const M = (c, o) => new THREE.MeshStandardMaterial({ color: c, flatShading: true, ...o }), live = f => anim((dt, t) => { if (W.decoOn) f(dt, t); });
  const dm = new THREE.Object3D(), C = n => new THREE.Color(n), PAL = [0xff2d95, 0x00e5ff, 0xb388ff, 0xffe14d, 0x39ff88];
  const inst = (geo, mat, n) => { const m = new THREE.InstancedMesh(geo, mat, n); m.count = 0; m.frustumCulled = false; add(m); return m; };
  const put = (m, x, y, z, sx, sy, sz, ry = 0, col) => { if (m.count >= m.instanceMatrix.count) return; dm.position.set(x, y, z); dm.rotation.set(0, ry, 0); dm.scale.set(sx, sy, sz); dm.updateMatrix(); m.setMatrixAt(m.count, dm.matrix); if (col != null) m.setColorAt(m.count, C(col)); m.count++; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; };
  const roadPts = [...ringDense.map(([x, z]) => [x, z, 0]), ...sDense, ...aDense.map(([x, z]) => [x, z, 0])];
  const nearRoad = (x, z) => { let b = 1e9; for (const p of roadPts) { const d = Math.hypot(p[0] - x, p[1] - z); if (d < b) b = d; } return b; };
  const hue = [];                                                              // neon materials that slowly cycle colour
  const neon = (c, ph = r()) => { const m = new THREE.MeshBasicMaterial({ color: c }); hue.push([m, ph]); return m; };
  anim((dt, t) => hue.forEach(([m, ph]) => m.color.setHSL((ph + t * .12) % 1, 1, .58)));

  // ---- city floor
  const floor = add(new THREE.Mesh(new THREE.PlaneGeometry(260, 230), M(0x161a2b))); floor.rotation.x = -Math.PI / 2; floor.position.y = -.02;
  // roads as ribbons (with neon edges); the skybridge ribbon follows its own height
  const ribbon = (pts, half, color, dy, basic) => {
    const pos = [], idx = []; pts.forEach((p, i) => { const q = pts[Math.min(pts.length - 1, i + 1)], o = pts[Math.max(0, i - 1)], dx = q[0] - o[0], dz = q[1] - o[1], l = Math.hypot(dx, dz) || 1, nx = -dz / l * half, nz = dx / l * half, y = (p[2] || 0) + dy; pos.push(p[0] + nx, y, p[1] + nz, p[0] - nx, y, p[1] - nz); if (i < pts.length - 1) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); } });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, basic ? new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }) : new THREE.MeshStandardMaterial({ color, flatShading: true, side: THREE.DoubleSide })); m.frustumCulled = false; add(m); return m;
  };
  const edges = (pts, half, mat, y = .06) => { for (const s of [-1, 1]) { const off = pts.map((p, i) => { const q = pts[Math.min(pts.length - 1, i + 1)], o = pts[Math.max(0, i - 1)], dx = q[0] - o[0], dz = q[1] - o[1], l = Math.hypot(dx, dz) || 1; return [p[0] - dz / l * half * s, p[1] + dx / l * half * s, p[2] || 0]; }); const m = ribbon(off, .07, 0xffffff, y, true); m.material = mat; } };
  const ringPts = [...ringDense, ringDense[0]].map(([x, z]) => [x, z, 0]);
  ribbon(ringPts, 1.9, 0x2a2f48, .02); edges(ringPts, 1.9, neon(0xff2d95, .0));
  ribbon(sDense, 1.7, 0x3a3560, .05); edges(sDense, 1.7, neon(0x00e5ff, .5), .09);
  const aPts = aDense.map(([x, z]) => [x, z, 0]); ribbon(aPts, 1.4, 0x2a2f48, .02); edges(aPts, 1.4, neon(0xb388ff, .3));
  // skybridge pylons
  const pyl = inst(new THREE.CylinderGeometry(.3, .4, 1, 6), M(0x3b3f5c), 40);
  sDense.forEach((p, i) => { if (i % 6 === 0 && p[2] > .8) put(pyl, p[0], p[2] / 2, p[1], 1, p[2], 1); });

  // ---- the Grand Casino in the middle: big dark block with glowing windows, a gold dome, marquee lights and sweeping searchlights
  const bld = add(new THREE.Mesh(new THREE.BoxGeometry(24, 6, 16), M(0x20243a))); bld.position.set(0, 3, 0);
  for (let i = 0; i < 6; i++) { const w = add(new THREE.Mesh(new THREE.BoxGeometry(3, 1.1, .1), neon(PAL[i % 5]))); w.position.set(-10 + i * 4, 3.3, 8.06); const w2 = w.clone(); w2.position.z = -8.06; add(w2); }
  const dome = add(new THREE.Mesh(new THREE.SphereGeometry(5, 12, 7, 0, Math.PI * 2, 0, Math.PI / 2), M(0xffc83d, { emissive: 0x7a5200, emissiveIntensity: .6 }))); dome.position.y = 6;
  const marq = []; for (let i = 0; i < 40; i++) { const a = i / 40 * Math.PI * 2, m = add(new THREE.Mesh(new THREE.BoxGeometry(.4, .4, .4), neon(PAL[i % 5], i / 40))); m.position.set(Math.cos(a) * 12.4, 6.2, Math.sin(a) * 8.4); marq.push(m); }
  const beams = Array.from({ length: 4 }, (_, i) => { const m = add(new THREE.Mesh(new THREE.ConeGeometry(2.2, 40, 10, 1, true), new THREE.MeshBasicMaterial({ color: PAL[i], transparent: true, opacity: .13, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }))); m.userData = { a: i * 1.57 }; return m; });
  live((dt, t) => beams.forEach(m => { const a = m.userData.a + t * .5; m.position.set(Math.cos(a) * 9, 20 + 6, Math.sin(a) * 6); m.rotation.set(Math.sin(a) * .5, 0, Math.cos(a) * .5); }));
  const wheels = [];
  for (const sx of [-17, 17]) { const g = new THREE.Group(); for (let k = 0; k < 8; k++) g.add(new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, .3, 12, 1, false, k * Math.PI / 4, Math.PI / 4), M(k % 2 ? 0x111111 : 0xcc1122))); g.add(new THREE.Mesh(new THREE.CylinderGeometry(.6, .6, .5, 8), M(0xffd93d, { emissive: 0x665500 }))); g.position.set(sx, .5, 0); add(g); wheels.push([g, sx < 0 ? 1 : -1]); }
  anim(dt => wheels.forEach(([g, d]) => { g.rotation.y += dt * .7 * d; }));

  // ---- skyline outside the ring, palm trees and neon billboards along it
  const towers = inst(new THREE.BoxGeometry(1, 1, 1), M(0x1b2036), 130), caps = inst(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), 130);
  for (let t = 0; t < 900 && towers.count < 120; t++) { const x = rr(-100, 100), z = rr(-88, 84); if (nearRoad(x, z) < 7 || (Math.abs(x) < 52 && Math.abs(z) < 40)) continue; const h = rr(8, 34), w = rr(4, 9), d = rr(4, 9); put(towers, x, h / 2, z, w, h, d); put(caps, x, h + .25, z, w * .9, .5, d * .9, 0, PAL[r() * 5 | 0]); }
  const trunks = inst(new THREE.CylinderGeometry(.12, .18, 2.2, 5), M(0x6b4a2b), 70), fronds = inst(new THREE.ConeGeometry(1.1, .5, 6), M(0x2f9a4a), 70);
  for (let t = 0; t < 600 && trunks.count < 60; t++) { const x = rr(-50, 50), z = rr(-40, 40), d = nearRoad(x, z); if (d < 2.8 || d > 4.2 || (Math.abs(x) < 15 && Math.abs(z) < 11)) continue; put(trunks, x, 1.1, z, 1, 1, 1); put(fronds, x, 2.4, z, 1, 1, 1, r() * 3); }
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 + .3, x = Math.cos(a) * 52, z = Math.sin(a) * 38; const pole = add(new THREE.Mesh(new THREE.CylinderGeometry(.15, .2, 6, 5), M(0x2d3436))); pole.position.set(x, 3, z); const bb = add(new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.2, .2), neon(PAL[i % 5], i / 10))); bb.position.set(x, 6.6, z); bb.rotation.y = -a + Math.PI / 2; }
}

export const neonDef = {
  name: 'Neon Strip', sp, warps: [], monster: null, sky: true, skyFixed: .93, ground: true, decor: neonDecor,
  bounds: { x0: -52, x1: 52, z0: -42, z1: 40 }, cam: { h: 9.5, back: 8.5 },
  starSpots: [2, 7, 10, 12, 16, 18, 25, 27, 30, 32, 38, 42, N + 1, N + 3, N + 6, N + 8, A0 + 1],
};
