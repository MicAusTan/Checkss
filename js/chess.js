import * as THREE from 'three';
import { resample } from './grove.js';
// Checkmate Court: a giant black-and-white chessboard (8x8 squares, 9 units each). The ring road runs round the edge squares; two straight shortcuts cut across:
// the Bishop's Diagonal (corner to corner) and the Rook's Row (edge to edge). Unique squares: ♞ knight (fork: coins from two rivals), ♛ queen (roll again),
// ♝ bishop (free shield), ♚ king (CHECK: take coins from the richest rival).
const N = 56, HALF = 31.5, SQ = 9, TOP = 1, ROWK = 11, ROWZ = 7.5;
const dense = Array.from({ length: 600 }, (_, i) => { const th = Math.PI / 2 + i / 600 * Math.PI * 2, c = Math.cos(th), s = Math.sin(th); return [HALF * Math.sign(c) * Math.abs(c) ** .3, HALF * Math.sign(s) * Math.abs(s) ** .3]; });
const ringXY = resample(dense, N, true);
const near = (x, z) => { let b = 0, bd = 1e9; ringXY.forEach(([px, pz], i) => { const d = Math.hypot(px - x, pz - z); if (d < bd) { bd = d; b = i; } }); return b; };
const RT = Array.from({ length: N }, (_, i) => ['blue', 'blue', 'green', 'blue', 'red', 'blue'][i % 6]);
const set = (t, ids) => ids.forEach(i => RT[i] = t);
set('shop', [6, 20, 34, 48]); set('duel', [10, 24, 38, 52]); set('warp', [14, 42]); set('dash', [4, 18, 32, 46]); set('thief', [12, 36]); set('swap', [26, 50]);
set('knight', [3, 17, 31, 45]); set('queen', [9, 29, 51]); set('bishop', [7, 21, 35, 55]); set('king', [15, 39]);
const DA = near(-HALF, HALF), DB = near(HALF, -HALF), RA = near(-HALF, ROWZ), RB = near(HALF, ROWZ);     // where the shortcuts leave and rejoin the ring
[DA, DB, RA, RB, 0].forEach(i => RT[i] = 'blue');
export const sp = ringXY.map(([x, z], i) => ({ x, z, y: TOP, type: RT[i], next: [(i + 1) % N] }));
const line = (a, b, k) => Array.from({ length: k }, (_, j) => [a.x + (b.x - a.x) * (j + 1) / (k + 1), a.z + (b.z - a.z) * (j + 1) / (k + 1)]);
const DT = ['green', 'knight', 'red', 'blue', 'queen', 'green', 'red', 'bishop', 'blue', 'king', 'green', 'red', 'knight', 'blue', 'green', 'red', 'bishop', 'green'];
const D0 = sp.length; line(sp[DA], sp[DB], 18).forEach(([x, z], k) => sp.push({ x, z, y: TOP, type: DT[k], next: [k < 17 ? D0 + k + 1 : DB] }));
const RTt = ['red', 'green', 'knight', 'blue', 'queen', 'red', 'green', 'bishop', 'blue', 'red', 'green', 'blue'];
const R0 = sp.length; line(sp[RA], sp[RB], ROWK).forEach(([x, z], k) => sp.push({ x, z, y: TOP, type: RTt[k % RTt.length], next: [k < ROWK - 1 ? R0 + k + 1 : RB] }));
sp[DA].next = [(DA + 1) % N, D0]; sp[RA].next = [(RA + 1) % N, R0];
sp[(DA + 1) % N].label = '♟ Edge road (safe, long)'; sp[D0].label = "♝ Bishop's Diagonal (corner to corner)"; sp[(RA + 1) % N].label = '🛤 Edge road'; sp[R0].label = "♜ Rook's Row (edge to edge)";

const PROF = {
  pawn: [[0, 0], [1.4, 0], [1.4, .3], [.9, .6], [.6, 1.8], [1.1, 2], [1.1, 2.2], [.6, 2.4], [1, 3], [.9, 3.5], [.5, 3.9], [0, 4]],
  rook: [[0, 0], [1.5, 0], [1.5, .4], [1, .8], [.8, 2.8], [1.2, 3], [1.2, 3.4], [1.35, 3.4], [1.35, 4.4], [.9, 4.4], [.9, 4], [0, 4]],
  bishop: [[0, 0], [1.4, 0], [1.4, .35], [.9, .7], [.6, 2.2], [1.1, 2.5], [.8, 3.2], [.7, 4.2], [.25, 4.5], [.2, 4.8], [0, 4.8]],
  queen: [[0, 0], [1.5, 0], [1.5, .4], [1, .8], [.65, 2.6], [1.3, 3], [1, 3.4], [1.5, 4.2], [.9, 4.2], [.5, 4.5], [.3, 5.1], [0, 5.2]],
  king: [[0, 0], [1.5, 0], [1.5, .4], [1, .8], [.7, 2.8], [1.3, 3.2], [1.1, 3.8], [1.2, 4.6], [.5, 4.8], [.4, 5.2], [0, 5.2]],
  knight: [[0, 0], [1.5, 0], [1.5, .4], [1, .8], [.9, 1.6], [0, 1.7]],
};
function chessDecor(W, add, anim) {
  let sd = 21; const r = () => (sd = sd * 16807 % 2147483647) / 2147483647, rr = (a, b) => a + r() * (b - a);
  const M = (c, o) => new THREE.MeshStandardMaterial({ color: c, flatShading: true, ...o });
  const WHITE = 0xf2efe6, BLACK = 0x1b1b21, GOLD = 0xd4af37;
  // ---- the board: 64 squares on a dark wood frame, inside a big marble hall
  const hall = add(new THREE.Mesh(new THREE.PlaneGeometry(320, 280), M(0x2b2b33))); hall.rotation.x = -Math.PI / 2; hall.position.y = -.9;
  const frame = add(new THREE.Mesh(new THREE.BoxGeometry(8 * SQ + 6, 1.4, 8 * SQ + 6), M(0x3a2a1a))); frame.position.y = -.1;
  const trim = add(new THREE.Mesh(new THREE.BoxGeometry(8 * SQ + 1.2, .5, 8 * SQ + 1.2), M(GOLD, { emissive: 0x5a4300, emissiveIntensity: .4 }))); trim.position.y = .45;
  const sqs = new THREE.InstancedMesh(new THREE.BoxGeometry(SQ - .1, .6, SQ - .1), M(0xffffff), 64); sqs.frustumCulled = false; const dm = new THREE.Object3D(), tc = new THREE.Color();
  for (let i = 0; i < 64; i++) { const cx = i % 8, cz = i / 8 | 0; dm.position.set(-HALF + cx * SQ, TOP - .3, -HALF + cz * SQ); dm.updateMatrix(); sqs.setMatrixAt(i, dm.matrix); tc.setHex((cx + cz) % 2 ? BLACK : WHITE); sqs.setColorAt(i, tc); }
  add(sqs);
  // ---- gold ribbons marking the two shortcut lines
  const strip = (a, b, w) => { const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz), m = add(new THREE.Mesh(new THREE.BoxGeometry(w, .06, l), M(GOLD, { emissive: 0x7a5c00, emissiveIntensity: .5 }))); m.position.set((a.x + b.x) / 2, TOP + .02, (a.z + b.z) / 2); m.rotation.y = Math.atan2(dx, dz); };
  strip(sp[DA], sp[DB], 1.6); strip(sp[RA], sp[RB], 1.6);
  // ---- giant chess pieces standing on the inner squares, away from the roads
  const nearLine = (x, z) => Math.min(Math.abs(x + z) / Math.SQRT2, Math.abs(z - ROWZ), Math.max(Math.abs(x), Math.abs(z)) > 25 ? 0 : 99);
  const piece = (kind, col, x, z, s) => {
    const g = new THREE.Group(), mat = M(col, { roughness: .4 });
    const pts = PROF[kind].map(([rad, y]) => new THREE.Vector2(rad, y)); g.add(new THREE.Mesh(new THREE.LatheGeometry(pts, 12), mat));
    if (kind === 'king') { const a = new THREE.Mesh(new THREE.BoxGeometry(.4, 1.3, .4), mat), b = new THREE.Mesh(new THREE.BoxGeometry(1.1, .4, .4), mat); a.position.y = 5.8; b.position.y = 5.9; g.add(a, b); }
    if (kind === 'queen') for (let k = 0; k < 6; k++) { const c = new THREE.Mesh(new THREE.ConeGeometry(.25, .7, 4), mat), an = k / 6 * Math.PI * 2; c.position.set(Math.cos(an) * .8, 5.4, Math.sin(an) * .8); g.add(c); }
    if (kind === 'knight') { const h = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.4, 2.2), mat); h.position.set(0, 2.8, .3); h.rotation.x = -.35; const sn = new THREE.Mesh(new THREE.BoxGeometry(.9, .9, 1.4), mat); sn.position.set(0, 3.4, 1.6); sn.rotation.x = .3; const e1 = new THREE.Mesh(new THREE.ConeGeometry(.22, .6, 4), mat); e1.position.set(-.35, 4.3, -.4); const e2 = e1.clone(); e2.position.x = .35; g.add(h, sn, e1, e2); }
    g.position.set(x, TOP, z); g.scale.setScalar(s); g.rotation.y = r() * 6.28; add(g);
  };
  const kinds = ['pawn', 'rook', 'bishop', 'queen', 'king', 'knight', 'pawn', 'rook', 'knight', 'bishop', 'pawn', 'queen'];
  for (let t = 0, n = 0; t < 400 && n < 12; t++) { const x = rr(-22, 22), z = rr(-22, 22); if (nearLine(x, z) < 6.5 || Math.hypot(x, z) < 3) continue; piece(kinds[n], n % 2 ? WHITE : BLACK, x, z, rr(1.6, 2.4)); n++; }
  // ---- marble columns round the hall and a few captured pieces on the frame
  for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2, x = Math.cos(a) * 62, z = Math.sin(a) * 58, col = add(new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.9, 24, 12), M(i % 2 ? 0xe9e6dc : 0x23232b))); col.position.set(x, 11, z); const cap = add(new THREE.Mesh(new THREE.BoxGeometry(4.6, 1.2, 4.6), M(GOLD))); cap.position.set(x, 23.5, z); }
  const lamps = []; for (let i = 0; i < 4; i++) { const m = add(new THREE.Mesh(new THREE.SphereGeometry(1.2, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff1b8 }))); m.position.set(i % 2 ? 40 : -40, 14, i < 2 ? 40 : -40); lamps.push(m); }
  anim((dt, t) => lamps.forEach((m, i) => m.scale.setScalar(1 + .08 * Math.sin(t * 2 + i))));
}

export const chessDef = {
  name: 'Checkmate Court', sp, warps: [14, 42], monster: { start: 28 }, sky: true, skyFixed: .06, ground: true, decor: chessDecor,
  bounds: { x0: -46, x1: 46, z0: -42, z1: 44 }, cam: { h: 9.5, back: 8.5 },
  starSpots: [2, 5, 8, 11, 13, 16, 19, 23, 25, 28, 30, 33, 37, 40, 44, 47, 50, 53, D0 + 3, D0 + 8, D0 + 14, R0 + 3, R0 + 8],
};
