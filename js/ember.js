import * as THREE from 'three';
import { heightfield, sstep } from './terrain.js';
import { catmull, resample } from './grove.js';
// Ember Caldera: a big volcano island in a sea of lava. The outer ring road circles the foothills; two shortcuts: the Crater Crossing (over the rim and
// through the crater, packed with unique squares) and the Magma Bridge (toll). Each round the volcano erupts and scorches a few tiles (hazard).
// Unique squares here: 💨 geyser (blasts you 2-6 spaces), 🔨 forge (5🪙 -> random item), 🌋 vent (eruption + ash rain on rivals).
const N = 48, VX = -4, VZ = -6;                                           // ring spaces; volcano centre
const gauss = (x, z, cx, cz, sx, sz, a) => a * Math.exp(-(((x - cx) / sx) ** 2 + ((z - cz) / sz) ** 2));

export function nat(x, z) {
  const dx = x - VX, dz = z - VZ, d = Math.hypot(dx, dz), ang = Math.atan2(dz, dx), coast = 58 + 5 * Math.sin(ang * 3 + 1) + 3 * Math.sin(ang * 5 + 2);
  let h = 1.7 - 5.4 * sstep(coast - 9, coast + 2, d);                                        // island that sinks into the lava sea
  h += 17 * Math.pow(1 - sstep(0, 27, d), 1.5) - 12.5 * (1 - sstep(3, 10.5, d));            // the cone, with a crater bowl carved into it
  h += gauss(x, z, 30, 20, 9, 8, 3.6) + gauss(x, z, -38, -24, 10, 9, 4.4) + gauss(x, z, 38, -28, 9, 10, 5) + gauss(x, z, -34, 22, 8, 7, 3) + gauss(x, z, 4, 44, 10, 6, 2.6);
  h -= gauss(x, z, 22, -5, 7, 9, 5.5);                                                          // the magma pool under the bridge
  h += .28 * Math.sin(x * .9) * Math.sin(z * .8) * sstep(2, 8, h);
  return h;
}
const RING_PTS = [[4, 30], [-8, 31], [-20, 28], [-31, 20], [-40, 10], [-44, -2], [-40, -14], [-32, -24], [-20, -31], [-6, -34], [8, -33], [20, -29], [31, -22], [40, -12], [44, 0], [40, 12], [32, 22], [22, 29], [12, 32]];
const ringDense = catmull(RING_PTS, true, 30), ringXY = resample(ringDense, N, true);
const RT = Array.from({ length: N }, (_, i) => ['blue', 'blue', 'green', 'blue', 'red', 'blue'][i % 6]);
const set = (t, ids) => ids.forEach(i => RT[i] = t);
set('shop', [5, 17, 29, 41]); set('duel', [9, 22, 36, 45]); set('warp', [10, 34]); set('dash', [7, 19, 31]); set('thief', [15, 39]); set('swap', [20, 44]);
set('geyser', [3, 12, 27, 40]); set('forge', [16, 30, 43]); set('vent', [13, 25, 37, 47]); RT[0] = 'blue'; RT[32] = 'green'; RT[24] = 'blue';
export const sp = ringXY.map(([x, z], i) => ({ x, z, y: nat(x, z), type: RT[i], next: [(i + 1) % N] }));
const CEND = 24, CT = ['red', 'geyser', 'green', 'vent', 'red', 'forge', 'green', 'red', 'geyser', 'vent', 'red', 'green', 'blue'];
const cDense = catmull([ringXY[0], [3, 20], [0, 11], [-3, 3], [-4, -6], [-4, -15], [-3, -24], ringXY[CEND]], false, 24), cXY = resample(cDense, 13, false);
cXY.forEach(([x, z], k) => sp.push({ x, z, y: nat(x, z), type: CT[k], next: [k < 12 ? N + k + 1 : CEND] }));
const BEND = 42, BT = ['toll', 'red', 'geyser', 'green', 'blue'];
const bDense = catmull([ringXY[32], [28, -14], [23, -8], [20, -2], [24, 5], ringXY[BEND]], false, 24), bXY = resample(bDense, 5, false);
bXY.forEach(([x, z], k) => { const n0 = nat(x, z), over = n0 < .3; sp.push({ x, z, y: over ? .8 : n0, type: BT[k], bridge: over, next: [k < 4 ? N + 14 + k : BEND] }); });
sp[0].next = [1, N]; sp[32].next = [33, N + 13];
sp[1].label = '🌋 Lava road (safe, long)'; sp[N].label = '🔥 Crater Crossing (shortcut, risky)'; sp[33].label = '🛤 Foothill road'; sp[N + 13].label = '🌉 Magma Bridge (toll 3🪙)';

// road samples flatten the terrain under the paths
const road = [];
const addRoad = (dense, aware) => dense.forEach(([x, z]) => { const n0 = nat(x, z), over = aware && n0 < .3; road.push({ x, z, y: over ? .8 : n0, br: over }); });
addRoad(ringDense, false); addRoad(cDense, false); addRoad(bDense, true);
const nearest = (x, z) => { let bd = 1e9, b = null; for (const s of road) { const d = (s.x - x) ** 2 + (s.z - z) ** 2; if (d < bd) { bd = d; b = s; } } return [Math.sqrt(bd), b]; };
export const hgt = (x, z) => { const n0 = nat(x, z), [d, s] = nearest(x, z); if (s.br) return n0; const w = 1 - sstep(1.4, 4.6, d); return n0 * (1 - w) + s.y * w; };

function emberDecor(W, add, anim) {
  let sd = 5; const r = () => (sd = sd * 16807 % 2147483647) / 2147483647, rr = (a, b) => a + r() * (b - a);
  const M = (c, o) => new THREE.MeshStandardMaterial({ color: c, flatShading: true, ...o }), live = f => anim((dt, t) => { if (W.decoOn) f(dt, t); });
  const dm = new THREE.Object3D(), C = n => new THREE.Color(n);
  const inst = (geo, mat, n) => { const m = new THREE.InstancedMesh(geo, mat, n); m.count = 0; m.frustumCulled = false; add(m); return m; };
  const put = (m, x, y, z, sx, sy, sz, ry = 0, col) => { if (m.count >= m.instanceMatrix.count) return; dm.position.set(x, y, z); dm.rotation.set(0, ry, 0); dm.scale.set(sx, sy, sz); dm.updateMatrix(); m.setMatrixAt(m.count, dm.matrix); if (col != null) m.setColorAt(m.count, C(col)); m.count++; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; };
  const far = (x, z, d) => nearest(x, z)[0] > d;
  const cols = { ash: C(0x4a4244), basalt: C(0x2a2526), rock: C(0x5d5252), ember: C(0xff5a1f), path: C(0x7a6355), char: C(0x1c1718), moss: C(0x5a6b3a) };

  // ---- ground
  add(heightfield({ x0: -72, x1: 72, z0: -66, z1: 60, nx: 144, nz: 126, h: hgt, color: (x, z, y, c) => {
    const [d, s] = nearest(x, z), rw = s.br ? 0 : 1 - sstep(1.1, 2.4, d), vd = Math.hypot(x - VX, z - VZ);
    c.copy(cols.ash).offsetHSL(0, 0, Math.sin(x * .7) * Math.sin(z * .6) * .03);
    c.lerp(cols.moss, Math.max(0, .55 * sstep(-.2, 1.2, y) * (1 - sstep(1.2, 3, y)) * (1 - sstep(30, 50, vd))));
    c.lerp(cols.rock, sstep(3, 8, y) * .8); c.lerp(cols.basalt, sstep(8, 12, y) * .8 + sstep(.4, -1.5, y));
    const crack = Math.abs(Math.sin(x * .55 + Math.sin(z * .32) * 2.2)) < .05 && y > 1 && y < 12; if (crack) c.lerp(cols.ember, .75);
    if (vd < 4.2 && y < 7.5) c.lerp(cols.ember, .85); c.lerp(cols.path, rw * .9);
  } }));

  // ---- the lava sea around the island, and the pool in the crater
  const sea = add(new THREE.Mesh(new THREE.PlaneGeometry(400, 400, 1, 1), M(0xff4d0f, { emissive: 0xff3300, emissiveIntensity: .7 }))); sea.rotation.x = -Math.PI / 2; sea.position.y = -.6;
  const cf = nat(VX, VZ), pool = add(new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, .12, 18), M(0xff7a1f, { emissive: 0xff4400, emissiveIntensity: .9 }))); pool.position.set(VX, cf + .12, VZ);
  anim((dt, t) => { sea.material.emissiveIntensity = .6 + .25 * Math.sin(t * 1.3); pool.material.emissiveIntensity = .8 + .3 * Math.sin(t * 2.4); sea.material.color.setHSL(.04 + .01 * Math.sin(t * .9), 1, .5); });

  // ---- smoke plume and rising embers over the crater
  const smoke = Array.from({ length: 9 }, (_, i) => { const m = add(new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), M(0x3a3434, { transparent: true, opacity: .5 }))); m.userData = { ph: i / 9 }; return m; });
  live((dt, t) => smoke.forEach(m => { const k = (t * .06 + m.userData.ph) % 1; m.position.set(VX + Math.sin(k * 5 + m.userData.ph * 9) * 2 + k * 5, 9 + k * 24, VZ + Math.cos(k * 4 + m.userData.ph * 7) * 2); m.scale.setScalar(1.6 + k * 4.5); m.material.opacity = .55 * (1 - k); }));
  const em = Array.from({ length: 46 }, (_, i) => { const m = add(new THREE.Mesh(new THREE.IcosahedronGeometry(.16, 0), new THREE.MeshBasicMaterial({ color: i % 2 ? 0xff7a1f : 0xffd93d }))); m.userData = { ph: r() * 9, sp: .8 + r() * 1.4, dx: r() - .5, dz: r() - .5 }; return m; });
  live((dt, t) => em.forEach(m => { const u = m.userData, k = (t * u.sp * .35 + u.ph) % 1; m.position.set(VX + u.dx * k * 14, cf + 2 + k * 16, VZ + u.dz * k * 14); m.scale.setScalar(1 - k * .85); }));

  // ---- scenery: dead trees, rock spires, obsidian crystals, scorched boulders
  const trees = inst(new THREE.ConeGeometry(.5, 2.2, 5), M(0x2b2222), 90), trunk = inst(new THREE.CylinderGeometry(.1, .14, 1.2, 5), M(0x1c1515), 90);
  for (let t = 0; t < 900 && trees.count < 80; t++) { const x = rr(-62, 62), z = rr(-56, 52), y = nat(x, z); if (y < .5 || y > 6 || !far(x, z, 3.2) || Math.hypot(x - VX, z - VZ) < 16) continue; const s = rr(.7, 1.5); put(trunk, x, y + .5 * s, z, s, s, s); put(trees, x, y + 1.9 * s, z, s, s * 1.2, s, r() * 3); }
  const spires = inst(new THREE.ConeGeometry(1, 1, 5), M(0x3a3232), 70);
  for (let t = 0; t < 700 && spires.count < 60; t++) { const x = rr(-66, 66), z = rr(-60, 56), y = nat(x, z); if (y < -.3 || !far(x, z, 3.5)) continue; const h = rr(1.6, 5); put(spires, x, y + h / 2, z, rr(.5, 1.1), h, rr(.5, 1.1), r() * 3); }
  const crys = inst(new THREE.OctahedronGeometry(.6, 0), M(0x241a33, { emissive: 0x6d28d9, emissiveIntensity: .35 }), 40);
  for (let t = 0; t < 500 && crys.count < 34; t++) { const a = r() * 6.28, rad = rr(10, 22), x = VX + Math.cos(a) * rad, z = VZ + Math.sin(a) * rad, y = nat(x, z); if (!far(x, z, 2.6)) continue; put(crys, x, y + .6, z, rr(.5, 1), rr(1, 2.4), rr(.5, 1), r() * 3); }
  const rocks = inst(new THREE.IcosahedronGeometry(1, 0), M(0x4a3f3f), 90);
  for (let t = 0; t < 800 && rocks.count < 80; t++) { const x = rr(-64, 64), z = rr(-58, 54), y = nat(x, z); if (y < -.2 || !far(x, z, 2.4)) continue; const s = rr(.4, 1.3); put(rocks, x, y + s * .3, z, s, s * .7, s, r() * 3); }

  // ---- steam puffs above every geyser tile, bridge posts over the magma
  const gey = sp.filter(p => p.type === 'geyser'), puffs = gey.flatMap(p => Array.from({ length: 3 }, (_, i) => { const m = add(new THREE.Mesh(new THREE.IcosahedronGeometry(.4, 0), M(0xffffff, { transparent: true, opacity: .6 }))); m.userData = { p, ph: i / 3 }; return m; }));
  live((dt, t) => puffs.forEach(m => { const k = (t * .55 + m.userData.ph) % 1, p = m.userData.p; m.position.set(p.x, p.y + .6 + k * 3.2, p.z); m.scale.setScalar(.6 + k * 1.3); m.material.opacity = .65 * (1 - k); }));
  sp.filter(p => p.bridge).forEach(p => { for (const sg of [-1, 1]) { const post = new THREE.Mesh(new THREE.BoxGeometry(.15, 1.1, .15), M(0x2d3436)); post.position.set(p.x + sg * 1, p.y + .55, p.z); add(post); } const leg = new THREE.Mesh(new THREE.CylinderGeometry(.35, .45, p.y + 3.6, 6), M(0x1c1718)); leg.position.set(p.x, (p.y - 3.6) / 2, p.z); add(leg); });
}

export const emberDef = {
  name: 'Ember Caldera', sp, warps: [10, 34], monster: { start: 20 }, sky: true, skyFixed: .8, ground: true, hazard: { count: 6, dmg: 5 }, decor: emberDecor,
  bounds: { x0: -52, x1: 52, z0: -46, z1: 42 }, cam: { h: 9.5, back: 8.5 },
  starSpots: [2, 6, 8, 14, 18, 21, 23, 26, 28, 33, 35, 38, 42, 46, N + 2, N + 5, N + 9, N + 12],
};
