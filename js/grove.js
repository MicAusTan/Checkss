import * as THREE from 'three';
import { heightfield, sstep } from './terrain.js';
// Twilight Grove (the big version): a ~150-unit valley with real terrain, a 52-space ring road that climbs a ridge and winds through
// six districts, a toll bridge over Mirror Lake (shortcut #1) and the Crystal Gorge (shortcut #2), warp stones in the mushroom grove and
// on the ridge, the Wanderer's ruins, and a day -> night cycle where windows, lanterns, mushrooms and crystals light up.
//
//   Village (south) -> Whispering Forest (west, mushroom-grove warp) -> Highland Ridge (north, windmill + standing-stone warp)
//   -> Old Ruins (east, the Wanderer) -> Farmland (south-east) -> back to the village. The lake sits in the middle.
const N = 52, TAU = Math.PI * 2;
const gauss = (x, z, cx, cz, sx, sz, a) => a * Math.exp(-.5 * (((x - cx) / sx) ** 2 + ((z - cz) / sz) ** 2));

// Landmark sites, picked so nothing overlaps the road (the ring and the shortcuts are asymmetrical, so these are fixed by hand):
const RUINS = [54, -2], FARM = [16, 10];

// ---------------- Mirror Lake: an irregular, tilted, off-centre pond (lakeR < 1 is water) ----------------
const LK = { x: -4, z: -2, a: 17, b: 10.5, rot: .3 }, lkC = Math.cos(LK.rot), lkS = Math.sin(LK.rot);
const lakeWob = th => 1 + .17 * Math.sin(2 * th + 1) + .11 * Math.sin(3 * th + .5) + .06 * Math.sin(5 * th);
export const lakeR = (x, z) => { const dx = x - LK.x, dz = z - LK.z, u = dx * lkC + dz * lkS, v = -dx * lkS + dz * lkC; return Math.hypot(u / LK.a, v / LK.b) / lakeWob(Math.atan2(v, u)); };
const lakePt = (phi, rho) => { const e = 1 / Math.hypot(Math.cos(phi) / LK.a, Math.sin(phi) / LK.b) * lakeWob(phi), u = e * Math.cos(phi) * rho, v = e * Math.sin(phi) * rho; return [LK.x + u * lkC - v * lkS, LK.z + u * lkS + v * lkC]; };

// ---------------- terrain ----------------
export function nat(x, z) {
  let h = .45 + .3 * Math.sin(x * .11 + 1) + .25 * Math.sin(z * .13) + .2 * Math.sin((x + z) * .19) + .15 * Math.sin(x * .27 - z * .21);     // (+.45 keeps dry land above the lake's waterline)
  h += gauss(x, z, 7, -33, 22, 8, 6) + gauss(x, z, -17, -37, 9, 6, 3.2) + gauss(x, z, -37, 6, 9, 17, 1.4) + gauss(x, z, 20, 4, 6, 5, 1.2)                       // ridge, ruins hill, forest mound
     + gauss(x, z, -35, -58, 12, 10, 20) + gauss(x, z, 17, -67, 18, 11, 27) + gauss(x, z, 52, -54, 9, 8, 17) + gauss(x, z, -63, -26, 10, 16, 13) + gauss(x, z, 60, -38, 12, 12, 17)   // mountains
     + gauss(x, z, 60, 14, 10, 12, 3.6) + gauss(x, z, -57, 26, 14, 9, 3.2) + gauss(x, z, -26, 38, 8, 6, 2)
     + gauss(x, z, 73, 5, 7, 52, 15) + gauss(x, z, -76, -8, 7, 66, 11) + gauss(x, z, 6, 67, 50, 7, 10) + gauss(x, z, -48, 62, 14, 8, 6);                                               // mountain walls close the valley on the east, west and south
  h -= 3.6 * (1 - sstep(.55, 1.2, lakeR(x, z)));                                                                   // Mirror Lake basin
  return h;
}

// ---------------- paths ----------------
const RING_PTS = [[2, 27], [-11, 25], [-22, 24], [-31, 16], [-40, 8], [-43, -3], [-36, -10], [-30, -20], [-19, -25], [-8, -24], [-1, -31], [11, -33], [22, -26], [31, -24], [38, -15], [34, -5], [42, 3], [40, 12], [31, 17], [22, 23], [12, 28]];
export function catmull(pts, closed, per = 24) {
  const n = pts.length, out = [], segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = closed ? pts[(i - 1 + n) % n] : pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = closed ? pts[(i + 2) % n] : pts[Math.min(n - 1, i + 2)];
    for (let k = 0; k < per; k++) { const t = k / per, t2 = t * t, t3 = t2 * t; out.push([0, 1].map(d => .5 * (2 * p1[d] + (-p0[d] + p2[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2 + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t3))); }
  }
  if (!closed) out.push(pts[n - 1]);
  return out;
}
export function resample(dense, count, closed) {          // equal arc-length points (open paths: interior points only)
  const pts = closed ? [...dense, dense[0]] : dense, cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = cum[cum.length - 1], out = []; let j = 1;
  for (let k = 0; k < count; k++) {
    const s = closed ? k / count * total : (k + 1) / (count + 1) * total;
    while (j < cum.length - 1 && cum[j] < s) j++;
    const u = (s - cum[j - 1]) / Math.max(1e-9, cum[j] - cum[j - 1]);
    out.push([pts[j - 1][0] + (pts[j][0] - pts[j - 1][0]) * u, pts[j - 1][1] + (pts[j][1] - pts[j - 1][1]) * u]);
  }
  return out;
}
const ringDense = catmull(RING_PTS, true, 30), ringXY = resample(ringDense, N, true);
const RT = Array.from({ length: N }, (_, i) => ['blue', 'blue', 'green', 'blue', 'red', 'blue'][i % 6]);
[4, 10, 24, 32, 41, 49].forEach(i => RT[i] = 'shop'); [9, 18, 35, 46].forEach(i => RT[i] = 'duel'); [12, 28].forEach(i => RT[i] = 'warp'); RT[0] = 'blue';
[7, 21, 33, 47].forEach(i => RT[i] = 'dash'); [15, 39].forEach(i => RT[i] = 'thief'); [19, 43].forEach(i => RT[i] = 'swap'); [13, 37].forEach(i => RT[i] = 'slot');     // (all picked from plain blue spaces)
const BT = ['toll', 'red', 'green', 'blue', 'green', 'blue', 'red', 'green', 'blue', 'red', 'blue', 'green', 'blue'], GT = ['green', 'duel', 'green'];
export const sp = ringXY.map(([x, z], i) => ({ x, z, y: nat(x, z), type: RT[i], next: [(i + 1) % N] }));
const BEND = 25, GEND = 40, bDense = catmull([ringXY[0], [4, 18], [-1, 9], [-6, 0], [-3, -9], [3, -17], [5, -23], ringXY[BEND]], false, 24), bXY = resample(bDense, 13, false);
bXY.forEach(([x, z], k) => { const n0 = nat(x, z), over = n0 < .3; sp.push({ x, z, y: over ? .75 : n0, type: BT[k], bridge: over, next: [k < 12 ? N + k + 1 : BEND] }); });
const pull = ([x, z], k) => { const dx = 6 - x, dz = -6 - z, d = Math.hypot(dx, dz); return [x + dx / d * k, z + dz / d * k]; };
const gDense = catmull([ringXY[30], pull(ringXY[33], 10), pull(ringXY[37], 9), ringXY[GEND]], false, 24), gXY = resample(gDense, 3, false);
gXY.forEach(([x, z], k) => sp.push({ x, z, y: nat(x, z), type: GT[k], next: [k < 2 ? N + 14 + k : GEND] }));
sp[0].next = [1, N]; sp[30].next = [31, N + 13];
sp[1].label = '🌲 Ring road (safe, long)'; sp[N].label = '🌉 Bridge shortcut (toll 3🪙)'; sp[31].label = '🏔 Ridge trail (the long way)'; sp[N + 13].label = '💎 Crystal Gorge (shortcut, risky)';

// road samples flatten the terrain under the paths (cross-slope), except over the lake where the bridge floats
const road = [];
const addRoad = (dense, aware) => dense.forEach(([x, z]) => { const n0 = nat(x, z), over = aware && n0 < .3; road.push({ x, z, y: over ? .75 : n0, br: over }); });
addRoad(ringDense, false); addRoad(bDense, true); addRoad(gDense, false);
export const nearest = (x, z) => { let bd = 1e9, b = null; for (const s of road) { const d = (s.x - x) ** 2 + (s.z - z) ** 2; if (d < bd) { bd = d; b = s; } } return [Math.sqrt(bd), b]; };
export const hgt = (x, z) => { const n0 = nat(x, z), [d, s] = nearest(x, z); if (s.br) return n0; const w = 1 - sstep(1.4, 4.6, d); return n0 * (1 - w) + s.y * w; };
export const roadSamples = road;

// ---------------- scenery ----------------
function groveDecor(W, add, anim) {
  let sd = 7; const r = () => (sd = sd * 16807 % 2147483647) / 2147483647, rr = (a, b) => a + r() * (b - a);       // seeded: every client builds the same valley
  const dm = new THREE.Object3D(), tc = new THREE.Color(), C = n => new THREE.Color(n);
  const M = (c, o) => new THREE.MeshStandardMaterial({ color: c, flatShading: true, ...o });
  const night = () => sstep(.5, .85, W.dark || 0), live = f => anim((dt, t) => { if (W.decoOn) f(dt, t); });
  const glows = [], glowMat = (c, em, max = 1.3) => { const m = M(c, { emissive: em, emissiveIntensity: 0 }); glows.push([m, max]); return m; };
  anim(() => { const k = night(); glows.forEach(([m, mx]) => { m.emissiveIntensity = k * mx; }); });
  const BX = (w, h, d) => new THREE.BoxGeometry(w, h, d), CY = (a, b, h, s = 8) => new THREE.CylinderGeometry(a, b, h, s), CO = (rad, h, s = 6) => new THREE.ConeGeometry(rad, h, s), IC = (rad, d = 0) => new THREE.IcosahedronGeometry(rad, d);
  const mesh = (geo, mat, x, y, z, parent) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent?.add(m); return m; };
  const inst = (geo, mat, n) => { const m = new THREE.InstancedMesh(geo, mat, n); m.count = 0; add(m); return m; };
  const put = (m, x, y, z, sx, sy, sz, ry = 0, color) => { if (m.count >= m.instanceMatrix.count) return; dm.position.set(x, y, z); dm.rotation.set(0, ry, 0); dm.scale.set(sx, sy, sz); dm.updateMatrix(); m.setMatrixAt(m.count, dm.matrix); if (color != null) m.setColorAt(m.count, tc.set(color)); m.count++; };
  const far = (x, z, d) => nearest(x, z)[0] > d, inward = (i, d, tx, tz) => { const p = sp[i], dx = tx - p.x, dz = tz - p.z, l = Math.hypot(dx, dz); return [p.x + dx / l * d, p.z + dz / l * d]; };
  const group = (x, z, ry = 0, y) => { const g = new THREE.Group(); g.position.set(x, y ?? hgt(x, z), z); g.rotation.y = ry; add(g); return g; };
  const winM = glowMat(0x6b5a3a, 0xffcc55, 1.6), lampM = glowMat(0xfff0b0, 0xffc040, 2);

  // ---- ground
  const cols = { grass: C(0x6fbf4a), forest: C(0x3f8a3a), stone: C(0x9a9aa5), crop: C(0xc9b45a), sand: C(0xe8d9a8), bed: C(0x5a7f8a), rock: C(0x8a8f9a), snow: C(0xf4f8ff), dirt: C(0xd9c9a3) };
  add(heightfield({ x0: -78, x1: 78, z0: -72, z1: 62, nx: 156, nz: 134, h: hgt, color: (x, z, y, c) => {
    const [d, s] = nearest(x, z), rw = s.br ? 0 : 1 - sstep(1.1, 2.4, d);
    c.copy(cols.grass).offsetHSL(0, 0, Math.sin(x * .7) * Math.sin(z * .6) * .035);
    c.lerp(cols.forest, Math.min(.9, 1.1 * Math.exp(-(((x + 33) / 14) ** 2 + ((z - 2) / 24) ** 2))));
    c.lerp(cols.stone, Math.min(.85, Math.exp(-(((x - 37) / 9) ** 2 + ((z + 8) / 9) ** 2)) + .5 * Math.exp(-((x / 9) ** 2 + ((z - 26) / 5) ** 2))));
    c.lerp(cols.crop, Math.min(.8, 1.1 * Math.exp(-(((x - FARM[0] - 11) / 8) ** 2 + ((z - FARM[1] - 2) / 7) ** 2))));
    if (lakeR(x, z) < 1.6) { c.lerp(cols.sand, sstep(.4, -.1, y)); c.lerp(cols.bed, sstep(-.6, -2.6, y)); }
    c.lerp(cols.rock, sstep(3.4, 6.5, y) * .85); c.lerp(cols.snow, sstep(11, 15, y)); c.lerp(cols.dirt, rw * .85);
  } }));

  // ---- Mirror Lake: gently waving low-poly water, lily pads, two little boats, a willow island, and the bridge
  const lakeGeo = new THREE.RingGeometry(.001, 1, 48, 12); lakeGeo.rotateX(-Math.PI / 2); { const q = lakeGeo.attributes.position; for (let i = 0; i < q.count; i++) { const [wx, wz] = lakePt(Math.atan2(q.getZ(i), q.getX(i)), Math.hypot(q.getX(i), q.getZ(i))); q.setX(i, wx); q.setZ(i, wz); } }
  const lake = new THREE.Mesh(lakeGeo, M(0x3aa0d8, { transparent: true, opacity: .86 })); lake.position.y = -.35; add(lake);
  const lp = lakeGeo.attributes.position;
  live((dt, t) => { lake.material.color.setHSL(.56, .7, .5 + .05 * Math.sin(t * 1.6) - .27 * night()); for (let i = 0; i < lp.count; i++) lp.setY(i, Math.sin(t * 1.4 + lp.getX(i) * 5 + lp.getZ(i) * 4) * .07); lp.needsUpdate = true; });
  const pads = inst(CY(.55, .55, .06, 8), M(0xffffff), 34), blooms = inst(IC(.16, 0), M(0xffffff), 34);
  for (let t = 0; t < 400 && pads.count < 30; t++) { const x = rr(-24, 18), z = rr(-14, 12); if (lakeR(x, z) > .82 || nearest(x, z)[0] < 2.6) continue; put(pads, x, -.28, z, rr(.7, 1.3), 1, rr(.7, 1.3), r() * 3, [0x3f9a45, 0x4cae52, 0x2f8a3c][pads.count % 3]); if (r() < .4) put(blooms, x, -.2, z, 1, 1, 1, 0, [0xffffff, 0xff9ad8, 0xffe066][blooms.count % 3]); }
  const boatMat = [M(0x8a5a2b), M(0xc0504d)], boats = [[4, -3.5, 5, 2.8, .5], [-12, 1.5, 3.4, 1.8, -.4]].map(([cx, cz, ax, az, sp_], k) => {
    const g = new THREE.Group(); mesh(BX(2.6, .45, 1.1), boatMat[k], 0, .2, 0, g); mesh(CO(.55, 1, 4), boatMat[k], 1.7, .2, 0, g).rotation.z = -Math.PI / 2; mesh(CY(.05, .05, 2.2, 5), M(0x6b4a2b), 0, 1.3, 0, g); mesh(BX(.05, 1.4, 1.1), M(0xffffff), .05, 1.5, 0, g);
    add(g); return { g, cx, cz, ax, az, sp: sp_ };
  });
  live((dt, t) => boats.forEach(b => { const a = t * b.sp * .5; b.g.position.set(b.cx + Math.cos(a) * b.ax, -.3 + Math.sin(t * 1.3 + b.cx) * .05, b.cz + Math.sin(a) * b.az); b.g.rotation.y = -a - Math.PI / 2 * Math.sign(b.sp); b.g.rotation.z = Math.sin(t * 1.1) * .04; }));
  { const ig = group(-13, -5, 0, -.4); mesh(CY(2.3, 2.9, 1, 10), M(0xe8d9a8), 0, .2, 0, ig); mesh(CY(.2, .3, 2.2, 5), M(0x7b5230), 0, 1.5, 0, ig); mesh(IC(1.9, 1), M(0x7fcf6a), 0, 3.2, 0, ig).scale.set(1.2, .8, 1.2); for (let k = 0; k < 6; k++) mesh(CY(.03, .03, 1.6, 4), M(0x5fb04a), Math.cos(k) * 1.9, 2.3, Math.sin(k) * 1.9, ig); }

  const BR = sp.slice(N, N + 13), woodM = M(0x8a5a2b);
  BR.forEach((p, k) => {
    if (!p.bridge) return;
    for (const sg of [-1, 1]) { const post = mesh(BX(.15, 1.1, .15), woodM, p.x + sg * 1.0, p.y + .55, p.z); add(post); if (k % 2 === 0) add(mesh(IC(.22, 1), lampM, p.x + sg * 1.0, p.y + 1.3, p.z)); }
    add(mesh(CY(.35, .45, p.y + 3.6, 6), M(0x6b4a2b), p.x, (p.y - 3.6) / 2, p.z));
    const q = BR[k + 1]; if (!q?.bridge) return;
    const dx = q.x - p.x, dz = q.z - p.z, l = Math.hypot(dx, dz), px = -dz / l, pz = dx / l;
    for (const sg of [-1, 1]) { const rail = mesh(BX(.1, .12, l), woodM, (p.x + q.x) / 2 + px * sg, (p.y + q.y) / 2 + 1, (p.z + q.z) / 2 + pz * sg); rail.lookAt(q.x + px * sg, q.y + 1, q.z + pz * sg); add(rail); }
  });

  // ---- trees (instanced): dense in the Whispering Forest, scattered on slopes, never on roads, lake, village, ruins or farm
  const NP = 320, NB = 120, GREENS = [0x2e8b57, 0x3fa34d, 0x2a7a4a, 0x4cae52], AUT = [0xe0a030, 0xd06a2a, 0xb85a2a];
  const pT = inst(CY(.18, .26, 1.2, 5), M(0x7b5230), NP), pA = inst(CO(1.15, 2.3, 6), M(0xffffff), NP), pB = inst(CO(.8, 1.8, 6), M(0xffffff), NP), bT = inst(CY(.2, .28, 1.3, 5), M(0x7b5230), NB), bC = inst(IC(1.25, 0), M(0xffffff), NB);
  for (let t = 0; t < 14000 && (pT.count < NP || bT.count < NB); t++) {
    const x = rr(-74, 74), z = rr(-68, 58), y = hgt(x, z); if (y < .15 || y > 9.5) continue;
    const forest = Math.exp(-(((x + 33) / 15) ** 2 + ((z - 2) / 26) ** 2)), slope = sstep(1.5, 4, y) * (1 - sstep(8, 10, y)), ruins = Math.exp(-(((x - RUINS[0]) / 11) ** 2 + ((z - RUINS[1]) / 11) ** 2)), farm = Math.exp(-(((x - FARM[0] - 8) / 12) ** 2 + ((z - FARM[1]) / 10) ** 2));
    const dens = .03 + forest * .95 + slope * .22 - ruins * .9 - farm; if (r() > dens || (Math.abs(x) < 20 && z > 13 && z < 38) || !far(x, z, 3.2)) continue;
    const s = rr(.8, 1.5);
    if (r() < .72 && pT.count < NP) { const c = y > 6.5 ? 0xdfe8f0 : GREENS[pT.count % 4]; put(pT, x, y + .6 * s, z, s, s, s); put(pA, x, y + 2.05 * s, z, s, s, s, r() * 3, c); put(pB, x, y + 3.1 * s, z, s, s, s, r() * 3, c); }
    else if (bT.count < NB) { put(bT, x, y + .65 * s, z, s, s, s); put(bC, x, y + 2.3 * s, z, s * 1.1, s * .9, s * 1.1, r() * 3, y > 2.5 && r() < .5 ? AUT[bT.count % 3] : GREENS[bT.count % 4]); }
  }
  const rocks = inst(IC(1, 0), M(0xffffff), 240);
  for (let t = 0; t < 5000 && rocks.count < 220; t++) { const x = rr(-74, 74), z = rr(-68, 58), y = hgt(x, z); if (y < 1.2 || (y < 3 && r() < .85) || !far(x, z, 2.4)) continue; const s = rr(.4, 1.6); put(rocks, x, y + s * .3, z, s, s * .7, s, r() * 3, [0x8a8f9a, 0x7a7f88, 0x9aa0aa][rocks.count % 3]); }
  const fl = inst(IC(.13, 0), M(0xffffff), 520), gt = inst(CO(.13, .5, 4), M(0xffffff), 700);
  for (let t = 0; t < 9000 && (fl.count < 500 || gt.count < 680); t++) { const x = rr(-60, 60), z = rr(-56, 54), y = hgt(x, z); if (y < .2 || y > 3.5 || !far(x, z, 1.5) || Math.exp(-(((x + 33) / 15) ** 2 + ((z - 2) / 26) ** 2)) > .5) continue; if (r() < .45) put(fl, x, y + .15, z, 1, 1, 1, 0, [0xff6b9d, 0xffd93d, 0xffffff, 0xb28dff][fl.count % 4]); else put(gt, x, y + .2, z, 1, rr(.7, 1.4), 1, 0, [0x5fae4c, 0x4f9a3c, 0x7fcf5a][gt.count % 3]); }

  // ---- Village (south): cottages with smoke, market stalls, fountain, well, lamp posts
  const chimneys = [];
  const house = (x, z, ry, wall, roof) => {
    const g = group(x, z, ry); mesh(BX(3.2, 2.2, 2.8), M(wall), 0, 1.1, 0, g); const rf = mesh(CO(2.7, 1.7, 4), M(roof), 0, 3.05, 0, g); rf.rotation.y = Math.PI / 4; rf.scale.set(1, 1, .9);
    mesh(BX(.7, 1.3, .1), M(0x5a3a1a), 0, .65, 1.42, g); mesh(BX(.6, .6, .1), winM, -1, 1.35, 1.42, g); mesh(BX(.6, .6, .1), winM, 1, 1.35, 1.42, g); mesh(BX(.5, 1.2, .5), M(0x8a5a44), 1, 3.3, -.5, g);
    const h = hgt(x, z); chimneys.push([x + Math.cos(ry) - .5 * Math.sin(ry), h + 4.1, z - Math.sin(ry) - .5 * Math.cos(ry)]);
  };
  [[-10, 21.5, Math.PI, 0xf2e3c0, 0xc0504d], [-5.5, 31, 0, 0xe8d0a0, 0x8a5a44], [-2.4, 21, Math.PI, 0xf5ead0, 0x4f81bd], [8, 31, 0, 0xf2e3c0, 0xc0504d], [11.5, 21.5, Math.PI, 0xe8d0a0, 0x6a9a4a], [-16, 31.5, 0, 0xf5ead0, 0xd8a24a], [16.5, 31, 0, 0xe8d0a0, 0x8a5a44], [-19, 21, Math.PI, 0xf2e3c0, 0x4f81bd]]
    .forEach(([x, z, ry, w, rf]) => { if (far(x, z, 3.2)) house(x, z, ry, w, rf); });
  [[-12, 22.5], [-7, 22.5], [13, 22.4], [18, 22.8]].forEach(([x, z], k) => {
    if (!far(x, z, 2.6)) return; const g = group(x, z, Math.PI); mesh(BX(2.4, .9, 1), M(0x8a5a2b), 0, .45, 0, g);
    for (let i = 0; i < 6; i++) { const a = mesh(BX(.42, .1, 1.7), M(i % 2 ? 0xffffff : [0xc0504d, 0x4f81bd, 0x6a9a4a, 0xd8a24a][k]), -1 + i * .4 + .2, 1.9 - (i % 1) * 0, .2, g); a.rotation.x = .35; }
    for (const sg of [-1, 1]) mesh(CY(.05, .05, 1.9, 4), M(0x6b4a2b), sg * 1.1, .95, .7, g); mesh(BX(.5, .4, .5), M(0xc9a25a), .6, 1.05, -.1, g); mesh(CY(.25, .25, .5, 8), M(0x8a5a2b), -.7, 1.15, 0, g);
  });
  { const g = group(6, 23.5, 0); mesh(CY(2.4, 2.6, .35, 18), M(0xa8a8b0), 0, .17, 0, g); mesh(CY(1.9, 2.1, .5, 18), M(0x4aa3d8, { transparent: true, opacity: .9 }), 0, .3, 0, g); mesh(CY(.35, .5, 1.4, 8), M(0xc0c0c8), 0, .9, 0, g); const jet = mesh(IC(.45, 1), M(0xbfe9ff, { transparent: true, opacity: .8 }), 0, 1.8, 0, g); live((dt, t) => jet.scale.set(1, .8 + Math.abs(Math.sin(t * 3)) * .6, 1)); }
  { const g = group(-15, 28.5, 0); mesh(CY(.9, .9, .9, 10), M(0x9a9aa5), 0, .45, 0, g); mesh(CY(.7, .7, .1, 10), M(0x2a6a9a), 0, .85, 0, g); for (const sg of [-1, 1]) mesh(BX(.12, 1.6, .12), M(0x6b4a2b), sg * .8, 1.2, 0, g); const rf = mesh(CO(1.3, .8, 4), M(0xc0504d), 0, 2.2, 0, g); rf.rotation.y = Math.PI / 4; }
  [0, 2, 46, 49, 51, 3, 5].forEach(i => { const p = sp[i], px = p.x + 1.7, pz = p.z + (i % 2 ? 1.7 : -1.7); const g = group(px, pz, 0); mesh(CY(.08, .1, 2.4, 5), M(0x333333), 0, 1.2, 0, g); mesh(IC(.3, 1), lampM, 0, 2.5, 0, g); });

  // ---- Whispering Forest (west): the mushroom-grove warp stone, glowing mushrooms, a hollow log, fireflies
  const mushM = glowMat(0xd96bd0, 0xff55ee, 1.5), mushM2 = glowMat(0x58c8ff, 0x33bbff, 1.5), wp1 = sp[12];
  for (let k = 0; k < 9; k++) { const a = k / 9 * TAU, x = wp1.x + Math.cos(a) * 4, z = wp1.z + Math.sin(a) * 4, g = group(x, z, 0), s = rr(.8, 1.5);
    mesh(CY(.28 * s, .38 * s, 1.5 * s, 7), M(0xf2ead8), 0, .75 * s, 0, g); mesh(IC(1.05 * s, 1), k % 2 ? mushM : mushM2, 0, 1.6 * s, 0, g).scale.set(1.2, .65, 1.2); }
  const beam1 = mesh(CO(1.4, 9, 12), new THREE.MeshBasicMaterial({ color: 0x66fff0, transparent: true, opacity: .16, depthWrite: false }), wp1.x, wp1.y + 4.5, wp1.z); beam1.rotation.x = Math.PI; add(beam1);
  const smM = inst(CY(.12, .15, .5, 6), M(0xf2ead8), 70), smC = inst(IC(.32, 0), mushM, 70);
  for (let t = 0; t < 500 && smM.count < 60; t++) { const x = rr(-48, -16), z = rr(-22, 22), y = hgt(x, z); if (y < .2 || !far(x, z, 2)) continue; put(smM, x, y + .25, z, 1, 1, 1); put(smC, x, y + .55, z, 1, .6, 1); }
  { const g = group(-30, 14, .6); const lg = mesh(CY(.9, .9, 4.5, 10), M(0x6b4a2b), 0, .9, 0, g); lg.rotation.z = Math.PI / 2; mesh(CY(.62, .62, .1, 10), M(0x1a0e08), 2.26, .9, 0, g).rotation.z = Math.PI / 2; }

  // ---- Highland Ridge (north): the standing-stone warp circle and a spinning windmill
  const wp2 = sp[28], runeM = glowMat(0x2a4a4a, 0x33ffe0, 2);
  for (let k = 0; k < 8; k++) { const a = k / 8 * TAU, x = wp2.x + Math.cos(a) * 3.6, z = wp2.z + Math.sin(a) * 3.6, g = group(x, z, -a), s = rr(.9, 1.3); mesh(BX(.7, 2.4 * s, .5), M(0x8a8f9a), 0, 1.2 * s, 0, g).rotation.z = rr(-.08, .08); mesh(BX(.35, .8, .05), runeM, 0, 1.4 * s, .27, g); }
  const beam2 = mesh(CO(1.5, 10, 12), new THREE.MeshBasicMaterial({ color: 0x66fff0, transparent: true, opacity: .16, depthWrite: false }), wp2.x, wp2.y + 5, wp2.z); beam2.rotation.x = Math.PI; add(beam2);
  live((dt, t) => { const o = .12 + .08 * Math.sin(t * 2) + .12 * night(); beam1.material.opacity = beam2.material.opacity = o; });
  { const wx = sp[27].x - 1, wz = sp[27].z - 9, g = group(wx, wz, 0); mesh(CY(1.4, 2.1, 5.5, 10), M(0xf2e3c0), 0, 2.75, 0, g); mesh(CO(2.0, 2, 10), M(0x8a5a44), 0, 6.5, 0, g); mesh(BX(.7, 1.1, .1), M(0x5a3a1a), 0, .55, 2, g); mesh(BX(.5, .6, .1), winM, 0, 3.6, 1.75, g);
    const hub = new THREE.Group(); hub.position.set(0, 5.4, 2.2); g.add(hub); for (let k = 0; k < 4; k++) { const b = mesh(BX(.5, 4.6, .12), M(0xf5f0e0), 0, 2.4, 0, new THREE.Group()); const arm = new THREE.Group(); arm.rotation.z = k * Math.PI / 2; arm.add(b); mesh(BX(.12, 4.6, .14), M(0x6b4a2b), 0, 2.4, 0, arm); hub.add(arm); }
    live(dt => { hub.rotation.z += dt * .9; }); }

  // ---- Old Ruins (east): broken columns, arches, the temple steps, purple crystals, torches
  const ruinC = RUINS, crysM = glowMat(0x8a4ad8, 0xb060ff, 2.2), torchM = glowMat(0xff9f1a, 0xff7a00, 2.6);
  for (let k = 0; k < 11; k++) { const a = k / 11 * TAU + .3, rad = 5 + (k % 3) * 1.2, x = ruinC[0] + Math.cos(a) * rad, z = ruinC[1] + Math.sin(a) * rad; if (!far(x, z, 2.4)) continue; const g = group(x, z, 0), h = k % 3 === 0 ? rr(1, 1.8) : rr(2.6, 4.2); mesh(CY(.55, .62, h, 9), M(0xc9c3b0), 0, h / 2, 0, g); mesh(BX(1.3, .3, 1.3), M(0xb8b2a0), 0, .15, 0, g); if (h > 2.5) mesh(BX(1.2, .3, 1.2), M(0xb8b2a0), 0, h + .15, 0, g); else for (let q = 0; q < 3; q++) mesh(BX(.5, .4, .5), M(0xb8b2a0), rr(-1.4, 1.4), .2, rr(-1.4, 1.4), g); }
  { const g = group(ruinC[0], ruinC[1], 0); [[9, .5], [7, .5], [5, .5]].forEach(([w, h], i) => mesh(BX(w, h, w), M(0xb8b2a0), 0, h * (i + .5), 0, g)); mesh(BX(1.6, 1.4, 1.6), M(0x8a8478), 0, 1.5 + .7, 0, g);
    for (let k = 0; k < 6; k++) { const c = mesh(IC(.5 + (k % 3) * .25, 0), crysM, Math.cos(k * 1.05) * 1.1, 2.2 + (k % 2) * .5, Math.sin(k * 1.05) * 1.1, g); c.scale.set(.6, 1.7 + (k % 3) * .4, .6); } }
  for (let k = 0; k < 4; k++) { const a = k * TAU / 4 + .8, x = ruinC[0] + Math.cos(a) * 8, z = ruinC[1] + Math.sin(a) * 8, g = group(x, z, 0); mesh(CY(.1, .14, 1.6, 5), M(0x4a3a2a), 0, .8, 0, g); const f = mesh(CO(.28, .7, 5), torchM, 0, 1.9, 0, g); live((dt, t) => f.scale.set(1, .85 + Math.sin(t * 11 + k) * .2, 1)); }
  { const g = group(ruinC[0] + 6.5, ruinC[1] - 7, .5); for (const sg of [-1, 1]) mesh(CY(.6, .7, 4.4, 9), M(0xc9c3b0), sg * 1.7, 2.2, 0, g); mesh(BX(4.6, .8, 1.3), M(0xb8b2a0), 0, 4.6, 0, g); }          // a standing arch

  // ---- Crystal Gorge (shortcut): boulder walls and glowing crystals along the path
  const gb = inst(IC(1, 0), M(0xffffff), 90);
  for (let i = 0; i < gDense.length; i += 4) { const [x, z] = gDense[i], [nx2, nz2] = gDense[Math.min(gDense.length - 1, i + 1)], dx = nx2 - x, dz = nz2 - z, l = Math.hypot(dx, dz) || 1, px = -dz / l, pz = dx / l;
    for (const sg of [-1, 1]) { const off = rr(3, 4) * sg, bx = x + px * off, bz = z + pz * off, by = hgt(bx, bz), s = rr(1.1, 2.4); if (nearest(bx, bz)[0] < s * .75 + 1.1) continue;     // (never on or against any road, including where the gorge meets the ring)
      put(gb, bx, by + s * .4, bz, s, s * 1.2, s, r() * 3, [0x6a6f7a, 0x7a7f88, 0x5a5f6a][i % 3]);
      if (i % 12 === 0) { const c = mesh(IC(.5, 0), crysM, bx - px * sg * .6, by + s * 1.1, bz - pz * sg * .6); c.scale.set(.6, 1.9, .6); add(c); } } }

  // ---- Farmland (south-east): barn, silo, hay bales, crop rows, fences
  const farmC = FARM;
  { const g = group(farmC[0], farmC[1], -.4); mesh(BX(5, 3.3, 6.5), M(0xb03a2e), 0, 1.65, 0, g); const rf = mesh(CO(4.6, 2.2, 4), M(0x6b3a2a), 0, 4.4, 0, g); rf.rotation.y = Math.PI / 4; rf.scale.set(1.05, 1, 1.28); mesh(BX(1.8, 2.4, .1), M(0xf5ead0), 0, 1.2, 3.27, g); mesh(BX(.7, .7, .1), winM, 1.6, 2.4, 3.27, g);
    mesh(CY(1.1, 1.2, 5.5, 10), M(0xc9ccd2), 4.4, 2.75, -1, g); mesh(IC(1.1, 1), M(0xaeb2ba), 4.4, 5.5, -1, g).scale.y = .6; }
  [[-.8, 6], [2, 6.6], [4.5, 5.2], [-3.8, 4.2]].forEach(([dx, dz], k) => { const x = farmC[0] + dx + 4, z = farmC[1] + dz; if (far(x, z, 2.2)) { const b = mesh(CY(.7, .7, .9, 10), M(0xd8b24a), x, hgt(x, z) + .5, z); b.rotation.z = Math.PI / 2; b.rotation.y = k; add(b); } });
  for (let f = 0; f < 3; f++) { const g = group(farmC[0] + 11 + f * 0, farmC[1] - 4 + f * 4.4, 0); for (let row = 0; row < 5; row++) mesh(BX(7, .35 + (f % 2) * .2, .5), M([0x6aa84a, 0xc9a43a, 0x4f8a3c][f]), 0, .2, -1.6 + row * .8, g); }
  for (let k = 0; k < 14; k++) { const x = farmC[0] + 8 + k * 1.2, z = farmC[1] - 7; if (far(x, z, 1.8)) { add(mesh(BX(.1, 1, .1), M(0x8a5a2b), x, hgt(x, z) + .5, z)); } }

  // ---- ambient life: clouds, birds, butterflies (day) / fireflies (night), chimney smoke
  const dyn = m => { m.frustumCulled = false; return m; };        // animated instanced meshes change their extents every frame: never cull them
  const cl = dyn(inst(IC(1, 0), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .88 }), 70)), clouds = Array.from({ length: 14 }, () => ({ x: rr(-80, 80), y: rr(24, 42), z: rr(-70, 24), s: rr(2.5, 4.5), v: rr(.5, 1.4) }));
  live(dt => { cl.count = 0; clouds.forEach(c => { c.x += c.v * dt; if (c.x > 90) c.x = -90; for (let k = 0; k < 4; k++) put(cl, c.x + k * c.s * .9, c.y + (k % 2) * .8, c.z, c.s * (1.2 - k * .12), c.s * .5, c.s * .8); }); cl.instanceMatrix.needsUpdate = true; cl.material.color.setHSL(.6, .1, 1 - .62 * night()); });
  const wings = dyn(inst(BX(.9, .05, .35), new THREE.MeshBasicMaterial({ color: 0x2a2a35 }), 16)), birds = Array.from({ length: 8 }, (_, k) => ({ cx: rr(-30, 30), cz: rr(-40, -10), rad: rr(14, 26), sp: rr(.2, .4), y: rr(16, 24), ph: k }));
  live((dt, t) => { wings.count = 0; if (night() > .6) return; birds.forEach(b => { const a = t * b.sp + b.ph, x = b.cx + Math.cos(a) * b.rad, z = b.cz + Math.sin(a) * b.rad * .6, fl = Math.sin(t * 9 + b.ph) * .6; for (const sg of [-1, 1]) { dm.position.set(x - Math.sin(a) * sg * .5, b.y, z + Math.cos(a) * sg * .5); dm.rotation.set(0, -a, sg * fl); dm.scale.set(1, 1, 1); dm.updateMatrix(); wings.setMatrixAt(wings.count++, dm.matrix); } }); wings.instanceMatrix.needsUpdate = true; });
  const bw = dyn(inst(BX(.3, .03, .3), new THREE.MeshBasicMaterial({ color: 0xffffff }), 28)), flies = Array.from({ length: 14 }, (_, k) => ({ cx: rr(-24, 24), cz: rr(8, 28), ph: k * 1.7, col: [0xff9f1a, 0xffd93d, 0xff6b9d, 0x66d0ff][k % 4] }));
  live((dt, t) => { bw.count = 0; if (night() > .5) return; flies.forEach(f => { const x = f.cx + Math.sin(t * .5 + f.ph) * 5, z = f.cz + Math.cos(t * .4 + f.ph * 1.3) * 4, y = hgt(x, z) + 1 + Math.sin(t * 1.3 + f.ph) * .5, fl = Math.sin(t * 14 + f.ph) * .8; for (const sg of [-1, 1]) { dm.position.set(x + sg * .15, y, z); dm.rotation.set(0, f.ph, sg * fl); dm.scale.set(1, 1, 1); dm.updateMatrix(); bw.setMatrixAt(bw.count, dm.matrix); bw.setColorAt(bw.count++, tc.set(f.col)); } }); bw.instanceMatrix.needsUpdate = true; if (bw.instanceColor) bw.instanceColor.needsUpdate = true; });
  const ff = dyn(inst(IC(.12, 0), new THREE.MeshBasicMaterial({ color: 0xfff176 }), 90)), fireflies = Array.from({ length: 90 }, (_, k) => { const a = rr(-1, 1) > 0 ? 1 : 0, x = a ? rr(-45, -15) : rr(-20, 24), z = a ? rr(-20, 22) : rr(-12, 24); return { x, z, ph: r() * 6 }; });
  live((dt, t) => { ff.count = 0; if (night() < .35) return; fireflies.forEach(f => { put(ff, f.x + Math.sin(t * .8 + f.ph) * .9, hgt(f.x, f.z) + 1.2 + Math.sin(t * 1.7 + f.ph) * .45, f.z + Math.cos(t * .7 + f.ph) * .9, 1, 1, 1); }); ff.instanceMatrix.needsUpdate = true; });
  const smoke = dyn(inst(IC(.3, 0), new THREE.MeshBasicMaterial({ color: 0xcfcfd6, transparent: true, opacity: .6 }), Math.max(1, chimneys.length * 5)));
  live((dt, t) => { smoke.count = 0; chimneys.forEach(([x, y, z], i) => { for (let k = 0; k < 5; k++) { const u = ((t * .35 + k / 5 + i * .13) % 1); put(smoke, x + u * 1.2 + Math.sin(u * 6 + i) * .2, y + u * 3.2, z, .5 + u, .5 + u, .5 + u); } }); smoke.instanceMatrix.needsUpdate = true; });

  // ---- sun, moon, stars, light and fog follow the day/night progress
  const sunM = new THREE.Mesh(IC(4.5, 1), new THREE.MeshBasicMaterial({ color: 0xfff3b0, fog: false })), moonM = new THREE.Mesh(IC(3.2, 1), new THREE.MeshBasicMaterial({ color: 0xe8eeff, fog: false })); add(sunM); add(moonM);
  const stars = inst(IC(.35, 0), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }), 220);
  for (let i = 0; i < 220; i++) { const az = r() * TAU, el = .15 + r() * 1.2; put(stars, Math.cos(az) * Math.cos(el) * 120, Math.sin(el) * 120, Math.sin(az) * Math.cos(el) * 120 - 30, 1, 1, 1); }
  const fog = new THREE.Fog(0x87ceeb, 85, 215); W.scene.fog = fog; const sun0 = { pos: W.sun.position.clone(), col: W.sun.color.clone(), int: W.sun.intensity };
  const warm = C(0xffb070), white = C(0xffffff), moon = C(0x8fa8ff);
  anim(() => {
    if (W.stageUp > 0) return;
    fog.color.copy(W.scene.background);
    const p = W.dark || 0, day = Math.min(1, p / .85), e = Math.sin(day * Math.PI), nk = night();
    sunM.position.set(Math.cos(day * Math.PI) * 85, Math.max(-6, e * 70) + 2, -45); sunM.visible = p < .9 && e > .03; moonM.position.set(-40 + p * 50, 40 + Math.sin(p * 3) * 8, -60); moonM.visible = nk > .3; stars.visible = nk > .55;
    W.sun.position.set(sunM.position.x * .25, 8 + e * 14, 10); W.sun.color.copy(white).lerp(warm, (1 - sstep(.1, .5, e)) * (1 - nk)).lerp(moon, nk); W.sun.intensity = ((.45 + e * .95) * (1 - nk) + .5 * nk);
  });
  return () => { W.scene.fog = null; W.sun.position.copy(sun0.pos); W.sun.color.copy(sun0.col); W.sun.intensity = sun0.int; };
}

export const groveDef = {
  name: 'Twilight Grove', sp, warps: [12, 28], monster: { start: 38 }, sky: true, ground: true, decor: groveDecor,
  bounds: { x0: -50, x1: 50, z0: -42, z1: 38 }, cam: { h: 9.5, back: 8.5 },
  starSpots: [2, 6, 8, 14, 16, 20, 22, 25, 31, 33, 37, 39, 43, 45, 49, 51, N + 5, N + 14],
};
