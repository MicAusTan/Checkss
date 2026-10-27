import * as THREE from 'three';
import { stage } from './minigames/stage.js';
import { OPTS } from './look.js';
// Victory podium: a short celebration set shown after each minigame (secs ~4) and at the end of a game (secs ~7).
//   const pod = showPodium(world, players, orderBestFirst, ranks, { secs, title, onEnd }); pod.end();
// Tied ranks share a tier. Tiers 1-3 stand on the podium, everyone else stands to the sides and sulks.
const SKINS = { marble: { c: 0xe8eaf0, strip: 0xb0b8c8 }, candy: { c: 0xff8fc7, strip: 0xffffff }, ice: { c: 0x9fdcff, glow: 0xe6f9ff }, neon: { c: 0x16102e, glow: 0x00e5ff }, lava: { c: 0x3a0d0d, glow: 0xff6a00 }, gold: { c: 0xffc400, glow: 0xfff3a0 },
  rainbow: { c: 0xffffff, bands: [0xff4d6d, 0xff9f1a, 0xffd93d, 0x7cf08a, 0x4dd0e1, 0xb28dff] }, void: { c: 0x050505, glow: 0xff00ff }, matrix: { c: 0x04140a, glow: 0x00ff66, strip: 0x0a3a1a },
  brick: { c: 0x9b3d2e, strip: 0x6b2a20 }, hologram: { c: 0x061a22, glow: 0x00e5ff }, ruby: { c: 0x7a0c1e, glow: 0xff4d6d }, emerald: { c: 0x0b5b3a, glow: 0x5dffb0 }, moonrock: { c: 0x9e9e9e, strip: 0x757575 },
  gift: { c: 0xe53935 }, arcade: { c: 0x141233, strip: 0x2a2766 }, cloud: { c: 0xf4f8ff }, checker: { c: 0xeeeeee },
  wood: { c: 0x8b5a2b, strip: 0x5a3a1a }, steel: { c: 0x8d949e, strip: 0xcfd8dc }, copper: { c: 0xb87333, strip: 0xe0a070 }, pearl: { c: 0xf5f0ff, strip: 0xffc8e8 },
  obsidian: { c: 0x1a1224, glow: 0x9b59b6 }, bubblegum: { c: 0xff77c8, glow: 0x77eaff }, sandstone: { c: 0xdcc59a, strip: 0xc2a878 } };
export const SPOTS = { amber: 0xffbf47, sky: 0x7fb8ff, crimson: 0xff3b5c, mint: 0xa8ffd8, orange: 0xffb066, teal: 0x7fffe0, white: 0xffffff, magenta: 0xff66e0, gold: 0xffe9a0, rose: 0xff9ecb, ice: 0x9fe8ff, lime: 0xb6ff8a, violet: 0xc9a8ff, blood: 0xff5a5a };
export const STAGES = { city: { sky: 0x0a0f2a, d1: 0x151a3a, d2: 0x24305a }, haunted: { sky: 0x1a1230, d1: 0x2a2040, d2: 0x3b2f5a }, castle: { sky: 0x6a8ac0, d1: 0x6b6f7a, d2: 0x8e93a0 }, storm: { sky: 0x1a2030, d1: 0x2a3040, d2: 0x3d4a66 }, desert: { sky: 0xd98f4e, d1: 0xc9a06a, d2: 0xe0c080 }, arctic: { sky: 0x9fc5e8, d1: 0xdfeaf2, d2: 0xffffff }, lava: { sky: 0x2a0a05, d1: 0x4a1208, d2: 0x8a2a10 }, cosmos: { sky: 0x08051a, d1: 0x1a1050, d2: 0x3a2a90 }, meadow: { sky: 0x87ceeb, d1: 0x4f9a3f, d2: 0x7ac36a }, night: { sky: 0x1b1340, d1: 0x2a2060, d2: 0x3b2f8a }, sunset: { sky: 0x4a1d3d, d1: 0x6b2a3a, d2: 0x8a3b3b }, ocean: { sky: 0x0b2a4a, d1: 0x0e3d66, d2: 0x14598f }, forest: { sky: 0x0f2a1a, d1: 0x174d2b, d2: 0x1f6b3a }, candy: { sky: 0x5a2a5a, d1: 0x7a3a7a, d2: 0xa04ea0 }, void: { sky: 0x050505, d1: 0x111111, d2: 0x2a0a3a } };
// Win effects (the 1st-place player's choice plays for everyone): falling or rising instanced bits, or timed firework bursts.
const FXS = {
  confetti: { cols: [0xff4d6d, 0xffd93d, 0x4dd0e1, 0x7cf08a, 0xb28dff, 0xff9f1a], geo: () => new THREE.BoxGeometry(.18, .02, .11), dir: 1, sp: 1 },
  snow: { cols: [0xffffff, 0xdff3ff], geo: () => new THREE.SphereGeometry(.07, 6, 5), dir: 1, sp: .5 },
  bubbles: { cols: [0x9be7ff, 0xffffff, 0x7fd8ff], geo: () => new THREE.SphereGeometry(.13, 8, 6), dir: -1, sp: .6 },
  stars: { cols: [0xfff176, 0xffd93d, 0xffffff], geo: () => new THREE.OctahedronGeometry(.14), dir: 1, sp: .8 },
  gold: { cols: [0xffd700, 0xffe97a, 0xffb300], geo: () => new THREE.CylinderGeometry(.11, .11, .03, 10), dir: 1, sp: 1.3 },
  lanterns: { cols: [0xffb347, 0xffd27f, 0xff8c42], geo: () => new THREE.BoxGeometry(.16, .2, .16), dir: -1, sp: .5 },
  rain: { cols: [0x6fa8ff, 0xa8c8ff], geo: () => new THREE.BoxGeometry(.02, .35, .02), dir: 1, sp: 3 },
  embers: { cols: [0xff6a00, 0xffa500, 0xff3d00], geo: () => new THREE.SphereGeometry(.06, 5, 4), dir: -1, sp: 1.2 },
  hearts: { cols: [0xff6b9d, 0xff4d6d, 0xffb3c6], geo: () => new THREE.IcosahedronGeometry(.12, 0), dir: 1, sp: .6 },
  butterflies: { cols: [0xffd93d, 0xff8fab, 0x4dd0e1, 0xb28dff], geo: () => new THREE.BoxGeometry(.22, .02, .12), dir: -1, sp: .5 },
  ash: { cols: [0x9e9e9e, 0x757575], geo: () => new THREE.SphereGeometry(.06, 5, 4), dir: 1, sp: .4 },
  prism: { cols: [0xff4d6d, 0xffd93d, 0x4dd0e1, 0x7cf08a, 0xb28dff], geo: () => new THREE.OctahedronGeometry(.15), dir: 1, sp: .9 },
  petals: { cols: [0xffb3c6, 0xff8fab, 0xffd6e0], geo: () => new THREE.BoxGeometry(.14, .02, .1), dir: 1, sp: .5 },
  leaves: { cols: [0x7cb342, 0xffa726, 0xc0392b], geo: () => new THREE.BoxGeometry(.16, .02, .1), dir: 1, sp: .6 },
  sparks: { cols: [0xffffff, 0xfff176, 0xffa726], geo: () => new THREE.BoxGeometry(.05, .05, .05), dir: -1, sp: 2 },
  diamonds: { cols: [0x7fe9ff, 0xffffff, 0xb2f5ff], geo: () => new THREE.OctahedronGeometry(.12), dir: 1, sp: 1 },
  fireworks: { cols: [0xffffff], geo: () => new THREE.BoxGeometry(.1, .1, .1), dir: 1, sp: 1, fw: true },
};
export const SKIN_IDS = Object.keys(SKINS), FX_IDS = Object.keys(FXS), SPOT_IDS = Object.keys(SPOTS), STAGE_IDS = Object.keys(STAGES);
const TIER = [{ h: 1.8, c: 0xf1c40f, t: '1ST' }, { h: 1.2, c: 0xc0c8d0, t: '2ND' }, { h: .7, c: 0xcd7f32, t: '3RD' }];
// Stage scenery: static + animated props behind/around the podium. Returns { update(dt, tt) }. Works under any scene root (podium or shop preview).
export function buildStage(id, root, mid = 0, total = 4) {
  const ups = [], R = total / 2 + 10, rnd = (a, b) => a + Math.random() * (b - a), pick = a => a[Math.random() * a.length | 0];
  const mk = (geo, col, x, y, z, basic = true, o = 1) => { const m = new THREE.Mesh(geo, basic ? new THREE.MeshBasicMaterial({ color: col, transparent: o < 1, opacity: o, depthWrite: o >= 1 }) : new THREE.MeshStandardMaterial({ color: col, flatShading: true })); m.position.set(mid + x, y, z); root.add(m); return m; };
  const back = (n, f) => { for (let i = 0; i < n; i++) { const a = Math.PI * (.12 + .76 * i / Math.max(1, n - 1)); f(i, Math.cos(a) * R * 1.3, -Math.sin(a) * R * .9 - 3, a); } };
  const stars = (n, cols) => { const sg = new THREE.SphereGeometry(.12, 4, 3), L = []; for (let i = 0; i < n; i++) L.push(mk(sg, pick(cols), rnd(-32, 32), rnd(5, 22), rnd(-36, -14))); ups.push((dt, tt) => L.forEach((m, i) => m.scale.setScalar(.6 + .5 * Math.sin(tt * 2 + i)))); };
  const clouds = (n, col, y0, y1) => { const L = []; for (let i = 0; i < n; i++) { const g = new THREE.Group(); for (let k = 0; k < 3; k++) { const s = new THREE.Mesh(new THREE.SphereGeometry(rnd(1.2, 2), 6, 5), new THREE.MeshBasicMaterial({ color: col })); s.position.set(k * 1.6 - 1.6, rnd(-.3, .3), 0); s.scale.y = .6; g.add(s); } g.position.set(mid + rnd(-30, 30), rnd(y0, y1), rnd(-34, -16)); root.add(g); L.push(g); } ups.push(dt => L.forEach(g => { g.position.x += dt * .7; if (g.position.x > mid + 32) g.position.x = mid - 32; })); };
  const bob = (L, amp = .4, sp = 1.5) => ups.push((dt, tt) => L.forEach((m, i) => { m.position.y = m.userData.y0 + Math.sin(tt * sp + i * 1.7) * amp; }));
  const keep = L => { L.forEach(m => m.userData.y0 = m.position.y); return L; };
  if (id === 'night') { stars(70, [0xffffff, 0xcfe3ff, 0xfff3c4]); mk(new THREE.SphereGeometry(2.4, 14, 10), 0xfff3c4, 13, 14, -32); }
  else if (id === 'sunset') { mk(new THREE.SphereGeometry(6.5, 18, 12), 0xffb347, 0, 3, -34); mk(new THREE.SphereGeometry(8.5, 18, 12), 0xff8a50, 0, 3, -35, true, .35); clouds(6, 0xffc2d6, 8, 15); }
  else if (id === 'ocean') {
    const bg = new THREE.SphereGeometry(.2, 6, 5), L = []; for (let i = 0; i < 40; i++) L.push(mk(bg, 0xbfefff, rnd(-16, 16), rnd(0, 12), rnd(-16, 2), true, .6));
    ups.push(dt => L.forEach((m, i) => { m.position.y += dt * (.8 + i % 3 * .3); if (m.position.y > 13) m.position.y = 0; }));
    back(9, (i, x, z) => { const w = mk(new THREE.BoxGeometry(.3, rnd(3, 6), .3), 0x2ecc71, x, 2.5, z, false); w.userData.p = i; ups.push((dt, tt) => w.rotation.z = Math.sin(tt * 1.3 + i) * .18); });
    const fish = []; for (let i = 0; i < 5; i++) { const f = new THREE.Group(), b = new THREE.Mesh(new THREE.SphereGeometry(.45, 6, 5), new THREE.MeshBasicMaterial({ color: pick([0xff9f43, 0xfeca57, 0xff6b81]) })), t = new THREE.Mesh(new THREE.ConeGeometry(.3, .5, 4), b.material); b.scale.x = 1.6; t.rotation.z = Math.PI / 2; t.position.x = -.9; f.add(b, t); f.position.set(mid + rnd(-20, 20), rnd(2, 9), rnd(-22, -10)); root.add(f); fish.push(f); }
    ups.push(dt => fish.forEach((f, i) => { f.position.x += dt * (1.5 + i * .4); if (f.position.x > mid + 22) f.position.x = mid - 22; }));
  }
  else if (id === 'forest') {
    back(11, (i, x, z) => { const s = rnd(.9, 1.4); mk(new THREE.CylinderGeometry(.25 * s, .3 * s, 1.8 * s, 6), 0x6d4c2f, x, .9 * s, z, false); mk(new THREE.ConeGeometry(1.5 * s, 2.6 * s, 6), 0x2e7d32, x, 3 * s, z, false); mk(new THREE.ConeGeometry(1.1 * s, 2.1 * s, 6), 0x388e3c, x, 4.4 * s, z, false); });
    const ff = keep(Array.from({ length: 26 }, () => mk(new THREE.IcosahedronGeometry(.1, 0), 0xfff176, rnd(-16, 16), rnd(1, 5), rnd(-14, -3)))); bob(ff, .5, 1.2);
  }
  else if (id === 'candy') {
    back(8, (i, x, z) => { mk(new THREE.CylinderGeometry(.12, .12, 4, 6), 0xffffff, x, 2, z, false); const d = mk(new THREE.CylinderGeometry(1.3, 1.3, .3, 16), [0xff6b9d, 0x4dd0e1, 0xffd93d, 0x7cf08a][i % 4], x, 4.3, z, false); d.rotation.x = Math.PI / 2; ups.push((dt, tt) => d.rotation.z = tt * .3); });
    const gd = keep(Array.from({ length: 14 }, () => mk(new THREE.SphereGeometry(.5, 8, 6), pick([0xff6b9d, 0x4dd0e1, 0xffd93d, 0x7cf08a, 0xb28dff]), rnd(-15, 15), rnd(1, 7), rnd(-16, -4), false))); bob(gd, .5, 1.1);
  }
  else if (id === 'void') {
    const cubes = Array.from({ length: 18 }, () => mk(new THREE.BoxGeometry(.8, .8, .8), pick([0xff00ff, 0x00e5ff, 0x9b59b6]), rnd(-16, 16), rnd(1, 12), rnd(-22, -4), true, .8)); keep(cubes); bob(cubes, .6, 1);
    ups.push(dt => cubes.forEach((c, i) => { c.rotation.x += dt * (.4 + i % 3 * .2); c.rotation.y += dt * .6; }));
    const p1 = mk(new THREE.TorusGeometry(5, .18, 6, 36), 0xff00ff, 0, 8, -28), p2 = mk(new THREE.TorusGeometry(3.4, .12, 6, 30), 0x00e5ff, 0, 8, -28); ups.push((dt, tt) => { p1.rotation.z = tt * .4; p2.rotation.z = -tt * .6; });
  }
  else if (id === 'storm') {
    clouds(9, 0x2c3547, 11, 17);
    const flash = mk(new THREE.PlaneGeometry(90, 45), 0xffffff, 0, 10, -37, true, .01); flash.material.opacity = 0; const bolt = new THREE.Group(); for (let i = 0; i < 4; i++) { const sg = new THREE.Mesh(new THREE.BoxGeometry(.3, 3.4, .2), new THREE.MeshBasicMaterial({ color: 0xfff6b0 })); sg.position.set((i % 2 ? .6 : -.4), 14 - i * 3, 0); sg.rotation.z = i % 2 ? .35 : -.35; bolt.add(sg); } bolt.visible = false; bolt.position.set(mid, 0, -30); root.add(bolt);
    let ft = rnd(1, 3), fl = 0; ups.push(dt => { ft -= dt; if (ft <= 0) { ft = rnd(2, 4.5); fl = .35; bolt.position.x = mid + rnd(-12, 12); } fl = Math.max(0, fl - dt); flash.material.opacity = fl > 0 ? .55 * (fl / .35) * (Math.random() < .5 ? 1 : .5) : 0; bolt.visible = fl > .1; });
  }
  else if (id === 'desert') {
    back(5, (i, x, z) => { const d = mk(new THREE.SphereGeometry(8, 12, 8), 0xd9b26f, x, -2.2, z - 2, false); d.scale.y = .4; });
    back(8, (i, x, z) => { const s = rnd(.8, 1.3); mk(new THREE.CylinderGeometry(.35 * s, .35 * s, 2.6 * s, 6), 0x3f9b4a, x * .8, 1.3 * s, z + 4, false); const a = mk(new THREE.CylinderGeometry(.2 * s, .2 * s, 1.1 * s, 6), 0x3f9b4a, x * .8 + .6 * s, 1.9 * s, z + 4, false); a.rotation.z = -.6; });
    mk(new THREE.SphereGeometry(4, 14, 10), 0xffe082, 14, 12, -34);
  }
  else if (id === 'arctic') {
    back(12, (i, x, z) => mk(new THREE.ConeGeometry(.9 + rnd(0, 1), 3 + rnd(0, 4), 5), 0xcfeeff, x, 2, z, false));
    const au = [0x4dffb0, 0x4dd0e1, 0xb28dff].map((c, i) => mk(new THREE.PlaneGeometry(36, 7), c, (i - 1) * 6, 14 + i, -34, true, .22)); ups.push((dt, tt) => au.forEach((p, i) => { p.rotation.z = Math.sin(tt * .5 + i) * .12; p.material.opacity = .16 + .1 * Math.sin(tt * .8 + i * 2); }));
    back(5, (i, x, z) => { const m = mk(new THREE.SphereGeometry(4, 10, 8), 0xffffff, x * .9, -1.2, z + 3, false); m.scale.y = .4; });
  }
  else if (id === 'lava') {
    back(9, (i, x, z) => { const h = 4 + rnd(0, 4); mk(new THREE.ConeGeometry(1.3, h, 6), 0x2a1a1a, x, h / 2, z, false); mk(new THREE.ConeGeometry(.5, 1, 6), 0xff6a00, x, h + .3, z); });
    const pools = [-1, 1].map(k => mk(new THREE.CircleGeometry(3.2, 20), 0xff6a00, k * (total / 2 + 8), .05, -2, true, .85)); pools.forEach(p => p.rotation.x = -Math.PI / 2); ups.push((dt, tt) => pools.forEach((p, i) => p.material.opacity = .6 + .3 * Math.sin(tt * 2 + i * 2)));
  }
  else if (id === 'city') {
    const wins = [];
    back(14, (i, x, z) => { const bw = rnd(2, 3.5), bh = rnd(6, 16); mk(new THREE.BoxGeometry(bw, bh, bw), 0x1a2240, x, bh / 2, z, false); for (let k = 0; k < 8; k++) wins.push(mk(new THREE.BoxGeometry(.35, .45, .1), pick([0xffd93d, 0x4dd0e1, 0xff6b9d]), x + rnd(-bw / 2 + .4, bw / 2 - .4), rnd(1.5, bh - .8), z + bw / 2 + .06)); });
    let bt = 0; ups.push(dt => { bt -= dt; if (bt <= 0) { bt = .5; wins.forEach(m => m.visible = Math.random() < .8); } });
  }
  else if (id === 'haunted') {
    back(10, (i, x, z) => { const t = mk(new THREE.BoxGeometry(.9, 1.4, .25), 0x8d949e, x * .85, .7, z + 5, false); t.rotation.z = rnd(-.15, .15); });
    mk(new THREE.SphereGeometry(3, 14, 10), 0xd4f5b0, -12, 13, -34);
    const gh = keep(Array.from({ length: 3 }, (_, i) => mk(new THREE.SphereGeometry(.7, 8, 6), 0xffffff, -8 + i * 8, rnd(3, 6), rnd(-18, -10), true, .5))); bob(gh, .7, 1);
    const bats = Array.from({ length: 6 }, () => mk(new THREE.BoxGeometry(.7, .08, .25), 0x14101f, rnd(-20, 20), rnd(6, 14), rnd(-24, -8)));
    ups.push((dt, tt) => bats.forEach((b, i) => { b.position.x += dt * (2 + i * .3); if (b.position.x > mid + 22) b.position.x = mid - 22; b.rotation.z = Math.sin(tt * 14 + i) * .5; }));
  }
  else if (id === 'castle') {
    back(5, (i, x, z) => { mk(new THREE.CylinderGeometry(1.6, 1.8, 9, 8), 0x9aa0ad, x, 4.5, z, false); mk(new THREE.ConeGeometry(2.1, 2.6, 8), 0xc0392b, x, 10.3, z, false); mk(new THREE.BoxGeometry(.05, 1.2, .05), 0x5d4037, x, 12.6, z, false); mk(new THREE.BoxGeometry(.8, .4, .05), 0xffd93d, x + .4, 12.9, z); });
    mk(new THREE.BoxGeometry(60, 5, 1.4), 0x80858f, 0, 2.5, -30, false); clouds(4, 0xffffff, 12, 17);
  }
  else if (id === 'cosmos') {
    stars(110, [0xffffff, 0xb28dff, 0x4dd0e1, 0xffd93d]);
    const pl = [[0x7e57c2, -14, 11, -32, 3.2], [0x26c6da, 12, 15, -34, 2.2], [0xff8a65, 3, 7, -36, 4]].map(([c, x, y, z, r]) => mk(new THREE.SphereGeometry(r, 14, 10), c, x, y, z, false));
    const ring = mk(new THREE.TorusGeometry(5, .25, 3, 36), 0xe0c3ff, 3, 7, -36, true, .7); ring.rotation.x = 1.25; ups.push(dt => pl.forEach((p, i) => p.rotation.y += dt * (.1 + i * .05)));
  }
  else if (id === 'meadow') {
    back(5, (i, x, z) => { const m = mk(new THREE.SphereGeometry(8, 10, 8), 0x5fae4a, x, -2.5, z - 2, false); m.scale.y = .45; });
    for (let i = 0; i < 30; i++) { const x = (Math.random() < .5 ? -1 : 1) * rnd(total / 2 + 3, 17), z = rnd(-12, -2); mk(new THREE.CylinderGeometry(.04, .04, .9, 4), 0x2e7d32, x, .45, z, false); mk(new THREE.SphereGeometry(.2, 6, 5), pick([0xff6b9d, 0xffd93d, 0xffffff, 0xb28dff]), x, 1, z, false); }
    clouds(5, 0xffffff, 9, 15); mk(new THREE.SphereGeometry(3, 14, 10), 0xffee58, -14, 13, -34);
  }
  return { update(dt, tt) { for (const f of ups) f(dt, tt); } };
}
// Flat banner (crest + label) as a textured plane, same look as the podium banner. For the shop preview.
export function bannerMesh(label, crest, w = 6) {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 100; const c = cv.getContext('2d');
  c.fillStyle = '#000b'; c.fillRect(0, 0, 512, 100); c.fillStyle = '#ffd93d'; c.font = 'bold 58px sans-serif'; c.textAlign = 'center'; c.fillText((crest + ' ' + label).slice(0, 26), 256, 70);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, w * 100 / 512), new THREE.MeshBasicMaterial({ map: t, transparent: true }));
}
// Pedestal for one player. P = { box, cyl, cone } (the stage S, or a shim in the shop preview); sizes are (w,h,d,color,x,y,z,opts) with y = bottom.
// Every skin = base + (plinth & cap frame, or glow strips) + per-skin decoration (DECOR). Nothing is coplanar with the base box (no z-fighting)
// and nothing at plate height sticks out past z = 1.22 (the name plate sits at z 1.34).
const sh = (c, k) => new THREE.Color(c).multiplyScalar(k).getHex(), lt = (c, k) => new THREE.Color(c).lerp(new THREE.Color(0xffffff), k).getHex();
const F = 1.212;
const DECOR = {
  marble: (P, px, pw, H) => { for (const k of [-1, 1]) { P.cyl(.12, .12, H - .2, 0xf4f4fa, px + k * (pw / 2 - .16), .1, 1.2); P.cyl(.16, .16, .06, 0xd4af37, px + k * (pw / 2 - .16), H - .12, 1.2); } P.box(pw - .12, .03, 2.5, 0xd4af37, px, H + .04, 0, { basic: true }); },
  candy: (P, px, pw, H) => { for (let i = 0; i < 5; i++) { const len = .15 + (i * 7 % 4) * .1; P.box(.16, len, .05, 0xffffff, px + (i - 2) * (pw / 5.5), H - len, F); } for (let i = 0; i < 9; i++) P.box(.07, .02, .13, [0xff4d6d, 0x4dd0e1, 0xffd93d, 0x7cf08a][i % 4], px + (i % 4 - 1.5) * .3, H + .05, (i % 3 - 1) * .5); P.cyl(.14, .14, .14, 0xe53935, px + .35, H + .04, -.4); },
  ice: (P, px, pw, H) => { P.box(pw - .1, .04, 2.4, 0xffffff, px, H + .04, 0); [[-.5, .5, .9], [-.2, .8, -.8], [.15, .55, .6], [.5, .75, -.4], [.7, .4, .9]].forEach(([x, h, z]) => P.cone(.13, h, 0xdff7ff, px + x * pw / 2, H + .08, z)); },
  neon: (P, px, pw, H) => { for (const k of [-1, 1]) P.box(.04, H, .03, 0x00e5ff, px + k * (pw / 2 - .05), 0, F, { basic: true }); P.box(pw - .3, .03, .03, 0x00e5ff, px, H * .85, F, { basic: true }); },
  lava: (P, px, pw, H) => { for (const k of [-1, 1]) { P.box(.05, H * .35, .03, 0xff6a00, px + k * .35, H * .08, F, { basic: true }); P.box(.28, .05, .03, 0xff6a00, px + k * .22, H * .43, F, { basic: true }); P.box(.05, H * .3, .03, 0xff6a00, px + k * .08, H * .43, F, { basic: true }); P.cone(.2, .45, 0x2a1a1a, px + k * .5, H + .04, .4 * k); P.cone(.07, .15, 0xff6a00, px + k * .5, H + .34, .4 * k, { basic: true }); } },
  gold: (P, px, pw, H) => { for (const k of [-1, 1]) for (const z of [-1, 1]) P.cone(.1, .35, 0xfff3a0, px + k * (pw / 2 - .18), H + .06, z * .95); P.box(pw - .3, .05, .03, 0xfff3a0, px, H * .1, F, { basic: true }); },
  rainbow: (P, px, pw, H) => { for (const k of [-1, 1]) { P.box(.5, .2, .5, 0xffffff, px + k * .4, H + .04, 0); P.box(.34, .22, .36, 0xf1f6ff, px + k * .6, H + .04, .2); P.box(.3, .18, .3, 0xffffff, px + k * .2, H + .24, -.1); } },
  void: (P, px, pw, H) => { [[-.6, .8, .3, .14, 1], [.5, 1.1, -.3, .2, 0], [.1, 1.5, .5, .12, 1], [-.3, 1.3, -.5, .18, 0]].forEach(([x, y, z, s, g]) => P.box(s, s, s, g ? 0xff00ff : 0x0a0014, px + x * pw / 2, H + y, z, g ? { basic: true } : undefined)); },
  matrix: (P, px, pw, H) => { for (let i = 0; i < 7; i++) { const len = .15 + (i * 5 % 4) * .1; P.box(.05, len, .03, 0x00ff66, px + (i - 3) * pw / 8, H * .12 + (i % 3) * .1, F, { basic: true }); P.box(.05, .05, .03, 0xb5ffd0, px + (i - 3) * pw / 8, H * .12 + (i % 3) * .1 + len + .08, F, { basic: true }); } },
  wood: (P, px, pw, H) => { for (const y of [H * .3, H * .62]) P.box(pw - .1, .03, .03, 0x4a2e14, px, y, F); for (const k of [-1, 1]) for (const y of [.18, H - .18]) P.box(.06, .06, .03, 0x1b1209, px + k * (pw / 2 - .12), y, F); },
  steel: (P, px, pw, H) => { const n = 6, w = (pw - .1) / n; for (let i = 0; i < n; i++) P.box(w, .1, .03, i % 2 ? 0x212121 : 0xffc107, px - (pw - .1) / 2 + (i + .5) * w, .16, F); for (const k of [-1, 1]) for (const y of [.35, H - .2]) P.box(.07, .07, .03, 0xdfe6ee, px + k * (pw / 2 - .12), y, F); },
  copper: (P, px, pw, H) => { P.box(.12, .3, .03, 0x3fb8a0, px - .5, H - .35, F); P.box(.1, .2, .03, 0x3fb8a0, px + .25, H - .26, F); P.box(.16, .12, .03, 0x3fb8a0, px + .5, H * .3, F); for (const k of [-1, 1]) P.box(.07, .07, .03, 0x6b3d1b, px + k * (pw / 2 - .12), H * .2, F); },
  pearl: (P, px, pw, H) => { P.cyl(.2, .2, .2, 0xfff5fb, px, H + .04, 0); for (let i = 0; i < 5; i++) P.cyl(.1, .1, .1, 0xffffff, px - .6 + i * .3, H + .04, .9); },
  obsidian: (P, px, pw, H) => { [[-.4, .2, .9, .2], [.3, -.2, .6, .15], [.05, .6, .45, .12]].forEach(([x, z, h, r]) => { P.cone(r, h, 0x1a1224, px + x, H + .04, z); P.cone(r * .4, h * .25, 0x9b59b6, px + x, H + .04 + h * .78, z, { basic: true }); }); },
  bubblegum: (P, px, pw, H) => { for (let i = 0; i < 8; i++) P.box(.12, .12, .03, 0x77eaff, px + (i % 4 - 1.5) * .38, H * (i < 4 ? .2 : .72) - .06, F); P.cyl(.03, .03, .5, 0xffffff, px + .5, H + .04, 0); P.cyl(.2, .2, .06, 0xff4da6, px + .5, H + .54, 0); },
  sandstone: (P, px, pw, H) => { P.box(pw - .04, .08, 2.9, 0xcdb67f, px, 0, 0); P.box(pw - .04, .16, 2.66, 0xd9c28f, px, 0, 0); P.cone(.55, .65, 0xe2cc9c, px, H + .04, 0); P.box(.3, .05, .03, 0x7a6a40, px, H * .6, F); P.box(.05, .25, .03, 0x7a6a40, px - .15, H * .5, F); P.box(.05, .25, .03, 0x7a6a40, px + .15, H * .5, F); },
  brick: (P, px, pw, H) => { const rows = Math.max(3, Math.round(H / .3)); for (let r = 1; r < rows; r++) { const y = H * r / rows; P.box(pw - .06, .025, .03, 0xcfcfcf, px, y, F); for (let j = -1; j <= 1; j++) P.box(.025, H / rows, .03, 0xcfcfcf, px + j * .5 + (r % 2 ? .25 : 0), y - H / rows, F); } },
  hologram: (P, px, pw, H) => { for (let i = 1; i < 9; i++) P.box(pw - .06, .015, .03, 0x00e5ff, px, H * i / 9, F, { basic: true }); P.box(.05, H, .03, 0x00e5ff, px - pw / 2 + .1, 0, F, { basic: true }); P.box(.05, H, .03, 0x00e5ff, px + pw / 2 - .1, 0, F, { basic: true }); },
  ruby: (P, px, pw, H) => { P.cyl(.45, .3, .22, 0xff4d6d, px, H + .04, 0, { basic: true }); P.cone(.45, .5, 0xff9db0, px, H + .26, 0, { basic: true }); },
  emerald: (P, px, pw, H) => { P.cyl(.45, .3, .22, 0x3fd68f, px, H + .04, 0, { basic: true }); P.cone(.45, .5, 0xb5ffd8, px, H + .26, 0, { basic: true }); },
  moonrock: (P, px, pw, H) => { P.cyl(.18, .18, .02, 0x616161, px - .4, H + .04, .2); P.cyl(.12, .12, .02, 0x616161, px + .2, H + .04, -.3); P.cyl(.09, .09, .02, 0x616161, px - .1, H + .04, -.6); P.box(.03, .7, .03, 0xeeeeee, px + .6, H + .04, -.5); P.box(.3, .2, .02, 0xe53935, px + .76, H + .54, -.5); },
  gift: (P, px, pw, H) => { P.box(.22, H, .03, 0xffd93d, px, 0, F); P.box(.22, .05, 2.46, 0xffd93d, px, H + .04, 0); P.box(.3, .2, .22, 0xffd93d, px - .2, H + .09, 0); P.box(.3, .2, .22, 0xffd93d, px + .2, H + .09, 0); P.box(.12, .12, .12, 0xe5a800, px, H + .09, 0); },
  arcade: (P, px, pw, H) => { for (let i = 0; i < 9; i++) P.box(.13, .13, .03, [0xff4d6d, 0x4dd0e1, 0xffd93d][i % 3], px + (i % 3 - 1) * .28, H * .5 + (i / 3 | 0) * .17 - .3, F, { basic: true }); P.cyl(.04, .04, .35, 0x222222, px - .3, H + .04, 0); P.cyl(.14, .14, .14, 0xff4d6d, px - .3, H + .39, 0); P.cyl(.1, .1, .05, 0xffd93d, px + .3, H + .04, .2); P.cyl(.1, .1, .05, 0x4dd0e1, px + .5, H + .04, -.1); },
  cloud: (P, px, pw, H) => { P.box(.6, .3, .3, 0xffffff, px - .5, H * .2, 1.12); P.box(.5, .26, .3, 0xf1f6ff, px + .45, H * .55, 1.12); P.box(.5, .26, .3, 0xffffff, px - .35, H * .85, 1.12); P.box(.7, .3, .7, 0xffffff, px - .3, H + .04, 0); P.box(.55, .3, .55, 0xf1f6ff, px + .3, H + .04, .2); P.box(.4, .25, .4, 0xffffff, px, H + .3, 0); },
  checker: (P, px, pw, H) => { const rows = Math.max(2, Math.round(H / .35)), w = (pw - .1) / 4, h = H / rows; for (let r = 0; r < rows; r++) for (let c = 0; c < 4; c++) P.box(w, h, .03, (r + c) % 2 ? 0x111111 : 0xffffff, px - (pw - .1) / 2 + (c + .5) * w, r * h, F); },
};
export function pedestal(P, skinId, T, px, pw) {
  const sk = SKINS[skinId], base = sk ? sk.c : T.c, H = T.h;
  if (sk?.bands) sk.bands.forEach((bc, bi) => P.box(pw, H / sk.bands.length, 2.4, bc, px, bi * H / sk.bands.length, 0));
  else P.box(pw, H, 2.4, base, px, 0, 0);
  // overlays are inset sideways (never overlap a neighbour) and stick out past the base box, so no two faces are coplanar
  if (sk?.glow) { P.box(pw - .04, .1, 2.46, sk.glow, px, H - .08, 0, { basic: true }); P.box(pw - .04, .08, 2.46, sk.glow, px, 0, 0, { basic: true }); }
  else { P.box(pw - .04, .14, 2.56, sh(base, .7), px, 0, 0); P.box(pw - .04, .1, 2.56, lt(base, .25), px, H - .06, 0); }
  if (sk?.strip) P.box(pw - .04, .14, 2.44, sk.strip, px, H * .5 - .07, 0);
  DECOR[skinId]?.(P, px, pw, H);
}
// Win-effect particles (instanced). show(true) starts them, update(dt, tt, active) each frame. Works in any scene root.
export function createFx(id, root, mid, total, W) {
  const FX = FXS[id] || FXS.confetti, FW = ['#ff4d6d', '#ffd93d', '#4dd0e1', '#7cf08a', '#b28dff', '#ff9f1a'], N = 150, cols = FX.cols, P = [], dm = new THREE.Object3D();
  const im = new THREE.InstancedMesh(FX.geo(), new THREE.MeshBasicMaterial({ color: 0xffffff }), N); root.add(im);
  let fwT = 0, on = false;
  for (let i = 0; i < N; i++) { P.push({ x: mid + (Math.random() - .5) * (total + 8), y: 3 + Math.random() * 9, z: (Math.random() - .5) * 8, v: 1 + Math.random() * 1.5, r: Math.random() * 6, rs: 2 + Math.random() * 5, sw: Math.random() * 6 }); im.setColorAt(i, new THREE.Color(cols[i % cols.length])); }
  im.visible = false; im.frustumCulled = false;
  return {
    show(v) { on = v; im.visible = v && !FX.fw; },
    update(dt, tt, active = true) {
      if (FX.fw && on && active && (fwT -= dt) <= 0) { fwT = .3 + Math.random() * .4; W.burst(mid + (Math.random() - .5) * total, 3 + Math.random() * 5, (Math.random() - .5) * 4, FW[Math.random() * FW.length | 0], 26); }
      for (let i = 0; i < N; i++) {
        const p = P[i]; p.y -= p.v * dt * FX.dir * FX.sp; p.r += p.rs * dt;
        if (FX.dir > 0 ? p.y < 0 : p.y > 12) { p.y = FX.dir > 0 ? 9 + Math.random() * 3 : 0; p.x = mid + (Math.random() - .5) * (total + 8); }
        dm.position.set(p.x + Math.sin(tt * 1.5 + p.sw) * .6, p.y, p.z); dm.rotation.set(p.r, p.r * .7, 0); dm.updateMatrix(); im.setMatrixAt(i, dm.matrix);
      }
      im.instanceMatrix.needsUpdate = true;
    },
  };
}
export function showPodium(world, players, order, ranks, o = {}) {
  const ctx = { world, players }, ids = order.filter(id => players[id]);
  for (const id of Object.keys(players)) if (!ids.includes(id)) ids.push(id);
  const rk = id => { const i = order.indexOf(id); return i < 0 ? 99 : (ranks?.[i] ?? i); };
  // group by rank value -> tiers
  const vals = [...new Set(ids.map(rk))].sort((a, b) => a - b), tiers = vals.map(v => ids.filter(id => rk(id) === v));
  const top = tiers.slice(0, 3), rest = tiers.slice(3).flat(), SP = 1.7;
  const wOf = g => Math.max(2.4, g.length * SP);
  const wid = top.map(wOf), left = top[1] ? wid[1] : 0, right = top[2] ? wid[2] : 0;
  const sideN = Math.ceil(rest.length / 2), sideW = sideN ? 1.2 + (sideN - 1) * 1.5 + .8 : 0;
  const L = wid[0] / 2 + left + sideW, R = wid[0] / 2 + right + sideW, total = L + R, mid = (R - L) / 2;
  const dist = Math.max(10.5, (total + 4) / 1.5);
  const P1 = players[(top[0] || [])[0]] || {}, ST = STAGES[P1.stage] || STAGES.night, SPOT = SPOTS[P1.spot] ?? SPOTS.gold;
  const CR = (OPTS.crest.vals[P1.crest] || OPTS.crest.vals.trophy).split(' ')[0], vp = id => (players[id]?.vpose in OPTS.vpose.vals) ? players[id].vpose : 'cheer';
  const S = stage(ctx, {
    sky: ST.sky, fog: { color: ST.sky, near: 30, far: 70 }, light: .95, sun: { intensity: 1, pos: [3, 14, 10] },
    cam: { pos: [mid, 4.2, dist], look: [mid, 1.9, 0] }, camFrom: [mid, 8, dist + 9], camT: 1.2,
  });
  const W = world, win = top[0] || [];
  S.cyl(total / 2 + 8, total / 2 + 8, .6, ST.d1, mid, -.6, 0, { seg: 40 }); S.cyl(total / 2 + 3, total / 2 + 3, .04, ST.d2, mid, 0, 0, { seg: 40 });
  // tier x-centres: [2nd][1st][3rd]
  const cx = [0, -(wid[0] / 2 + left / 2), wid[0] / 2 + right / 2];
  top.forEach((g, ti) => {
    const T = TIER[ti], w = wOf(g), x = cx[ti];
    g.forEach((id, k) => pedestal(S, players[id]?.ped, T, x + (k - (g.length - 1) / 2) * SP, g.length === 1 ? 2.4 : SP));
    const pl = S.screen(Math.min(w - .7, 1.7), .6, 256, 70); pl.mesh.position.set(x, T.h / 2, 1.34);
    pl.draw((c, pw, ph) => { c.fillStyle = '#0006'; c.fillRect(0, 0, pw, ph); c.fillStyle = '#fff'; c.font = 'bold 48px sans-serif'; c.textAlign = 'center'; c.fillText(T.t, pw / 2, 52); });
    g.forEach((id, k) => W.put(id, x + (k - (g.length - 1) / 2) * SP, 0, 0, T.h));
    if (ti === 0) S.cone(w * .8 + .6, 11, SPOT, x, 0, 0, { basic: true, op: .12, seg: 24 });   // spotlight on the winner(s)
  });
  rest.forEach((id, k) => { const n = k >> 1; W.put(id, k % 2 ? wid[0] / 2 + right + 1.2 + n * 1.5 : -(wid[0] / 2 + left + 1.2 + n * 1.5), .3, 0); });
  // banner over the podium
  const nm = win.map(id => String(players[id]?.name ?? '?'));
  const label = (o.title ?? '') || (nm.length === 1 ? nm[0] : nm.length <= 3 ? nm.join(' & ') : nm.length + ' WINNERS');
  const ban = S.screen(Math.min(9, 3 + label.length * .45), 1.2, 512, 100); ban.mesh.position.set(0, TIER[0].h + 3.1, -1);
  ban.draw((c, w, h) => { c.fillStyle = '#000b'; c.fillRect(0, 0, w, h); c.fillStyle = '#ffd93d'; c.font = 'bold 58px sans-serif'; c.textAlign = 'center'; c.fillText((CR + ' ' + label).slice(0, 26), w / 2, 70); });
  // confetti
  const fxs = createFx(P1.fx, S.root, mid, total, W), dec = buildStage(P1.stage in STAGES ? P1.stage : 'night', S.root, mid, total);
  let t = 0, ended = false, cheerT = 0;
  const reveal = () => { fxs.show(true); win.forEach(id => W.emote(id, vp(id))); top.slice(1).flat().forEach(id => W.emote(id, 'wiggle')); rest.forEach(id => W.emote(id, 'sad')); W.shake(.15, .3); };
  S.after(1.3, reveal);
  S.anim((dt, tt) => {
    t += dt;
    if (t > 1.3 && (cheerT -= dt) <= 0) { cheerT = 2.6; if (t > 1.5) win.forEach(id => W.emote(id, vp(id))); }
    if (t > 1.4) W.setCam([mid + Math.sin(tt * .5) * 1.4, 4.2, dist], [mid, 1.9, 0]);
    fxs.update(dt, tt, t > 1.4); dec.update(dt, tt);
  });
  const end = () => { if (ended) return; ended = true; S.cleanup(); o.onEnd?.(); };
  S.after(o.secs ?? 4, end);
  return { end };
}
