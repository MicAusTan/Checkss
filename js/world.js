import * as THREE from 'three';
// Low-poly arena + player meshes (boxes/icospheres, flat shaded, no assets).
const TR = { sparkle: ['#ffffff', '#ffd93d', '#a5f3fc'], flame: ['#ff9f1a', '#ff3b30', '#ffd93d'], bubbles: ['#bfefff', '#e6fbff', '#8fdcff'], hearts: ['#ff6b9d', '#ff9ecb', '#ff4d6d'], stars: ['#fff176', '#ffd93d', '#ffffff'], smoke: ['#555555', '#777777', '#999999'], toxic: ['#7cf08a', '#b5ff3d', '#2ecc71'], ice: ['#a5f3fc', '#e0faff', '#7fd3ff'], void: ['#b28dff', '#7e57c2', '#2a1a4a'], confetti: ['#ff4d6d', '#ffd93d', '#4dd0e1', '#7cf08a', '#b28dff'], leaves: ['#7cb342', '#ffa726', '#c0392b'], coins: ['#ffd700', '#ffe97a', '#ffb300'], lightning: ['#ffffff', '#7fdcff', '#fff6b0'], ink: ['#111111', '#2b2b3a', '#4a3a6a'], petals: ['#ffb3c6', '#ff8fab', '#ffd6e0'] };
const COATS = new Map();
// Patterned body colours (canvas textures, cached). Base colour comes from the player's colour, details from accent.
function coatTex(kind, color, accent) {
  const key = kind + color + accent; if (COATS.has(key)) return COATS.get(key);
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; const c = cv.getContext('2d'), base = new THREE.Color(color);
  const shade = k => '#' + base.clone().multiplyScalar(k).getHexString(), lite = '#' + base.clone().lerp(new THREE.Color(0xffffff), .45).getHexString();
  let sd = 7; const r = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  c.fillStyle = color; c.fillRect(0, 0, 64, 64);
  if (kind === 'tiger') { c.fillStyle = shade(.35); for (let i = 0; i < 6; i++) { c.beginPath(); c.moveTo(i * 11, 0); c.lineTo(i * 11 + 6, 0); c.lineTo(i * 11 + 2 + (i % 2) * 5, 64); c.lineTo(i * 11 - 3, 64); c.fill(); } }
  else if (kind === 'zebra') { c.fillStyle = '#ffffff'; for (let i = 0; i < 8; i++) c.fillRect(i * 8 + 2, 0, 3, 64); }
  else if (kind === 'checker') { c.fillStyle = shade(.6); for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) if ((x + y) % 2) c.fillRect(x * 16, y * 16, 16, 16); }
  else if (kind === 'polka') { c.fillStyle = accent; for (let i = 0; i < 9; i++) { c.beginPath(); c.arc((i % 3) * 24 + 10 + ((i / 3 | 0) % 2) * 8, (i / 3 | 0) * 22 + 8, 5, 0, 7); c.fill(); } }
  else if (kind === 'gradient') { const g = c.createLinearGradient(0, 0, 0, 64); g.addColorStop(0, lite); g.addColorStop(1, shade(.45)); c.fillStyle = g; c.fillRect(0, 0, 64, 64); }
  else if (kind === 'camo') for (let i = 0; i < 14; i++) { c.fillStyle = i % 2 ? shade(.55) : lite; c.beginPath(); c.ellipse(r() * 64, r() * 64, 6 + r() * 8, 4 + r() * 6, r() * 3, 0, 7); c.fill(); }
  else if (kind === 'galaxy') { c.fillStyle = '#120a2e'; c.fillRect(0, 0, 64, 64); c.fillStyle = color; c.globalAlpha = .45; c.beginPath(); c.ellipse(32, 30, 26, 12, .6, 0, 7); c.fill(); c.globalAlpha = 1; c.fillStyle = '#ffffff'; for (let i = 0; i < 22; i++) c.fillRect(r() * 62, r() * 62, 2, 2); }
  else if (kind === 'rainbow') ['#ff4d6d', '#ff9f1a', '#ffd93d', '#7cf08a', '#4dd0e1', '#b28dff'].forEach((col, i) => { c.fillStyle = col; c.fillRect(0, i * 10.7, 64, 11); })
  else if (kind === 'leopard') { for (let i = 0; i < 9; i++) { const x = (i % 3) * 22 + 8 + (i / 3 | 0) * 4, y = (i / 3 | 0) * 22 + 8; c.strokeStyle = shade(.3); c.lineWidth = 3; c.beginPath(); c.arc(x, y, 5, .4, 5.6); c.stroke(); c.fillStyle = lite; c.fillRect(x - 1, y - 1, 3, 3); } }
  else if (kind === 'plaid') { c.fillStyle = shade(.5); c.globalAlpha = .55; for (let i = 0; i < 4; i++) { c.fillRect(i * 16 + 4, 0, 6, 64); c.fillRect(0, i * 16 + 4, 64, 6); } c.globalAlpha = 1; c.fillStyle = accent; for (let i = 0; i < 4; i++) { c.fillRect(i * 16 + 12, 0, 1, 64); c.fillRect(0, i * 16 + 12, 64, 1); } }
  else if (kind === 'hearts') { c.fillStyle = accent; c.font = '20px sans-serif'; for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) c.fillText('\u2665', x * 22 + (y % 2) * 10, y * 22 + 18); }
  else if (kind === 'waves') { c.strokeStyle = lite; c.lineWidth = 3; for (let y = 0; y < 5; y++) { c.beginPath(); for (let x = 0; x <= 64; x += 4) c.lineTo(x, y * 14 + 6 + Math.sin(x / 6 + y) * 4); c.stroke(); } }
  else if (kind === 'circuit') { c.fillStyle = shade(.25); c.fillRect(0, 0, 64, 64); c.strokeStyle = accent; c.lineWidth = 2; c.beginPath(); c.moveTo(0, 16); c.lineTo(24, 16); c.lineTo(24, 40); c.lineTo(48, 40); c.lineTo(48, 8); c.lineTo(64, 8); c.moveTo(8, 64); c.lineTo(8, 52); c.lineTo(36, 52); c.stroke(); c.fillStyle = accent; for (const [x, y] of [[24, 16], [24, 40], [48, 40], [48, 8], [36, 52]]) c.fillRect(x - 2, y - 2, 5, 5); }
  else if (kind === 'giraffe') { c.fillStyle = shade(.45); let s2 = 11; const r2 = () => (s2 = (s2 * 16807) % 2147483647) / 2147483647; for (let i = 0; i < 9; i++) { c.save(); c.translate((i % 3) * 22 + 10, (i / 3 | 0) * 22 + 10); c.rotate(r2() * 1.5); c.fillRect(-7, -6, 14, 12); c.restore(); } }
  else if (kind === 'lava') { c.fillStyle = '#2a0d0d'; c.fillRect(0, 0, 64, 64); c.strokeStyle = '#ff6a00'; c.lineWidth = 2; for (let i = 0; i < 5; i++) { c.beginPath(); c.moveTo(r() * 64, 0); c.lineTo(r() * 64, 22); c.lineTo(r() * 64, 44); c.lineTo(r() * 64, 64); c.stroke(); } }
  else if (kind === 'scales') { c.strokeStyle = shade(.5); c.lineWidth = 2; for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) { c.beginPath(); c.arc(x * 16 + (y % 2) * 8, y * 14, 8, 0, Math.PI); c.stroke(); } }
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace; COATS.set(key, t); return t;
}
// Particle auras (spawned around a player each frame-ish): c = colours, vy = rise speed, r = radius, y0/h = height band
const AU = {
  flames: { c: TR.flame, vy: 2.4, life: .8, r: .6, y0: 0, h: 1.2, rate: .05 }, sparkles: { c: TR.sparkle, vy: .5, life: 1.1, r: .8, y0: .1, h: 1.7, rate: .08 },
  electric: { c: ['#ffffff', '#7fdcff', '#c9f1ff'], vy: 0, life: .22, r: .7, y0: .1, h: 1.7, rate: .03, jit: 5 }, mist: { c: TR.smoke, vy: .8, life: 1.2, r: .7, y0: 0, h: .6, rate: .09, sc: 1.8 },
  bubbles: { c: TR.bubbles, vy: 1.3, life: 1.3, r: .75, y0: 0, h: 1.2, rate: .1, sc: 1 }, hearts: { c: TR.hearts, vy: 1, life: 1.2, r: .6, y0: .3, h: 1.4, rate: .1 },
  snow: { c: ['#ffffff', '#dff3ff'], vy: -.7, life: 1.5, r: .9, y0: 1.8, h: .6, rate: .06 }, embers: { c: ['#ff6a00', '#ffa500', '#ff3d00'], vy: 2.8, life: 1, r: .5, y0: 0, h: .6, rate: .06, sc: .6 },
  petals: { c: TR.petals, vy: -.6, life: 1.6, r: .9, y0: 1.8, h: .6, rate: .07 }, leaves: { c: TR.leaves, vy: -.7, life: 1.6, r: .9, y0: 1.8, h: .6, rate: .07 },
  confetti: { c: TR.confetti, vy: 1.2, life: 1, r: .8, y0: 0, h: 1.6, rate: .05 }, fireflies: { c: ['#fff176', '#e6ee9c'], vy: .15, life: 1.6, r: 1, y0: .2, h: 1.6, rate: .12, sc: .5 },
  stardust: { c: ['#ffd93d', '#fff3b0', '#ffffff'], vy: 1.5, life: 1, r: .5, y0: 0, h: .8, rate: .05, sc: .6 }, rain: { c: ['#6fa8ff', '#a8c8ff'], vy: -4, life: .5, r: .8, y0: 2.2, h: .4, rate: .03, sc: .5 },
  matrix: { c: ['#00ff66', '#7dffb0', '#00b34a'], vy: -2.5, life: .7, r: .7, y0: 2, h: .6, rate: .04, sc: .6 }, toxic: { c: TR.toxic, vy: .9, life: 1.1, r: .6, y0: 0, h: 1, rate: .07, sc: 1 },
  void: { c: TR.void, vy: .4, life: 1.1, r: .8, y0: .2, h: 1.6, rate: .07, sc: 1.2 },
};
const SPINK = ['cool', 'spin', 'tornado', 'float', 'breakdance'];
export class World {
  constructor(canvas) {
    this.r = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0x87ceeb);
    this.cam = new THREE.PerspectiveCamera(50, 1, .1,200);
    this.cam.position.set(0, 18, 14); this.cam.lookAt(0, 0, 0);
    // logical camera: setCam() tweens camPos/camLook; frame() applies them (plus shake) every frame
    this.camPos = new THREE.Vector3(0, 18, 14); this.camLook = new THREE.Vector3(); this.camTw = null; this.shk = 0; this.shkD = 1; this.shkA = 0;
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x556677, 1.2); this.scene.add(this.hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 1.2); sun.position.set(5, 12, 6); this.scene.add(sun); this.sun = sun;
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(13, 13, 1, 12),
      new THREE.MeshStandardMaterial({ color: 0x7ac36a, flatShading: true }));
    floor.position.y = -.5; this.scene.add(floor); this.deco = [floor]; this.floor = floor; this.islandOn = true; this.stageUp = 0;   // stageUp > 0 while a minigame stage/podium owns the camera
    this.m = new Map(); this.parts = []; this.t = 0; this.anim = []; this.dark = 0; this.skyT = null; this.hemiT = 1.2; this.decoOn = true;
    const rs = () => { const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight; this.r.setSize(w, h, false); this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); };
    this.resize = rs; addEventListener('resize', rs); rs();
  }
  mat(c) { return new THREE.MeshStandardMaterial({ color: c, flatShading: true }); }
  add(p) {
    const g = new THREE.Group(), mat = this.mat(p.color), ac = p.accent || '#ffd93d', am = () => this.mat(ac), dark = () => this.mat(0x222222);
    const body = p.body || 'box'; let b, dy = 0;
    if (body === 'round') { b = new THREE.Mesh(new THREE.IcosahedronGeometry(.6, 1), mat); b.scale.set(1, .95, .85); b.position.y = .55; dy = -.1; }
    else if (body === 'tall') { b = new THREE.Mesh(new THREE.CylinderGeometry(.35, .42, 1.35, 8), mat); b.position.y = .68; dy = .3; }
    else if (body === 'pyramid') { b = new THREE.Mesh(new THREE.ConeGeometry(.65, 1.1, 4), mat); b.position.y = .55; b.rotation.y = Math.PI / 4; }
    else if (body === 'bean') { b = new THREE.Mesh(new THREE.CapsuleGeometry(.4, .55, 3, 8), mat); b.position.y = .66; dy = .08; }
    else if (body === 'diamond') { b = new THREE.Mesh(new THREE.OctahedronGeometry(.75), mat); b.scale.y = 1.15; b.position.y = .75; dy = .25; }
    else if (body === 'barrel') { b = new THREE.Group(); b.add(new THREE.Mesh(new THREE.CylinderGeometry(.5, .5, .95, 10), mat)); for (const yy of [-.3, .3]) { const r = new THREE.Mesh(new THREE.TorusGeometry(.5, .04, 4, 12), this.mat(ac)); r.rotation.x = Math.PI / 2; r.position.y = yy; b.add(r); } b.position.y = .5; }
    else if (body === 'chunky') { b = new THREE.Mesh(new THREE.BoxGeometry(1.25, .9, .7), mat); b.position.y = .45; dy = -.05; }
    else if (body === 'ico') { b = new THREE.Mesh(new THREE.IcosahedronGeometry(.62, 0), mat); b.position.y = .6; dy = -.05; }
    else if (body === 'hexa') { b = new THREE.Mesh(new THREE.CylinderGeometry(.5, .5, 1, 6), mat); b.position.y = .5; }
    else if (body === 'top') { b = new THREE.Mesh(new THREE.ConeGeometry(.6, 1, 8), mat); b.rotation.x = Math.PI; b.position.y = .55; }
    else if (body === 'snowman') { b = new THREE.Group(); const s1 = new THREE.Mesh(new THREE.IcosahedronGeometry(.5, 1), mat), s2 = new THREE.Mesh(new THREE.IcosahedronGeometry(.36, 1), mat); s1.position.y = .5; s2.position.y = 1.1; b.add(s1, s2); dy = .2; }
    else if (body === 'egg') { b = new THREE.Mesh(new THREE.IcosahedronGeometry(.55, 1), mat); b.scale.set(1, 1.25, .9); b.position.y = .65; dy = .15; }
    else if (body === 'can') { b = new THREE.Mesh(new THREE.CylinderGeometry(.55, .55, .9, 12), mat); b.position.y = .45; dy = -.05; }
    else { b = new THREE.Mesh(new THREE.BoxGeometry(.9, 1, .6), mat); b.position.y = .5; }
    if (p.coat && p.coat !== 'none') { mat.map = coatTex(p.coat, p.color, ac); mat.color.set(0xffffff); }
    const up = new THREE.Group(); up.position.y = dy;           // head, face and hat ride on top of the body
    const BOXY = ['box', 'tall', 'chunky', 'hexa', 'pyramid', 'barrel'].includes(body), head = new THREE.Mesh(BOXY ? new THREE.BoxGeometry(.78, .78, .78) : new THREE.IcosahedronGeometry(.4, 0), mat); head.position.y = 1.4; up.add(head);
    const box = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); return o; };
    const white = () => new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true });
    const face = p.face || 'eyes';
    if (['eyes', 'mustache', 'happy', 'angry', 'cat', 'blush', 'surprised', 'monocle', 'vampire', 'clown', 'tears'].includes(face)) for (const k of [-1, 1]) up.add(box(.12, .14, .06, white(), k * .15, 1.46, .37), box(.06, .08, .06, dark(), k * .15, 1.45, .4));
    if (face === 'mustache') up.add(box(.32, .07, .06, this.mat(0x5a3a1a), 0, 1.3, .37));
    if (face === 'cyclops') { const eye = new THREE.Mesh(new THREE.IcosahedronGeometry(.15, 0), white()); eye.position.set(0, 1.45, .35); up.add(eye, box(.07, .07, .05, dark(), 0, 1.45, .49)); }
    if (face === 'glasses') { for (const k of [-1, 1]) { const r = new THREE.Mesh(new THREE.TorusGeometry(.1, .025, 4, 8), dark()); r.position.set(k * .16, 1.46, .38); up.add(r); } up.add(box(.1, .03, .03, dark(), 0, 1.47, .38)); }
    if (face === 'shades') up.add(box(.2, .12, .06, dark(), -.16, 1.46, .38), box(.2, .12, .06, dark(), .16, 1.46, .38), box(.1, .03, .05, dark(), 0, 1.48, .38));
    if (face === 'happy') up.add(box(.1, .05, .05, dark(), -.12, 1.27, .38), box(.14, .05, .05, dark(), 0, 1.24, .38), box(.1, .05, .05, dark(), .12, 1.27, .38));
    if (face === 'angry') for (const k of [-1, 1]) { const br = box(.2, .05, .05, dark(), k * .15, 1.58, .38); br.rotation.z = k * .45; up.add(br); }
    if (face === 'sleepy') for (const k of [-1, 1]) up.add(box(.16, .04, .05, dark(), k * .15, 1.45, .38));
    if (face === 'cat') { up.add(box(.07, .05, .05, this.mat(0xff8fa3), 0, 1.36, .4)); for (const k of [-1, 1]) for (const j of [-1, 0, 1]) { const w = box(.22, .015, .02, dark(), k * .3, 1.34 + j * .04, .36); w.rotation.z = k * j * .15; up.add(w); } }
    if (face === 'eyepatch') up.add(box(.12, .14, .06, white(), .15, 1.46, .37), box(.06, .08, .06, dark(), .15, 1.45, .4), box(.2, .18, .05, dark(), -.15, 1.46, .38));
    if (face === 'visor') up.add(box(.5, .14, .07, new THREE.MeshBasicMaterial({ color: 0x4dd0ff }), 0, 1.46, .38));
    if (face === 'blush') for (const k of [-1, 1]) up.add(box(.11, .06, .04, this.mat(0xff8fa3), k * .24, 1.34, .38));
    if (face === 'surprised') up.add(box(.1, .12, .05, dark(), 0, 1.25, .38));
    if (face === 'wink') up.add(box(.12, .14, .06, white(), -.15, 1.46, .37), box(.06, .08, .06, dark(), -.15, 1.45, .4), box(.16, .04, .05, dark(), .15, 1.46, .38), box(.14, .04, .05, dark(), 0, 1.27, .38));
    if (face === 'monocle') { const r = new THREE.Mesh(new THREE.TorusGeometry(.12, .025, 4, 10), this.mat(0xffd93d)); r.position.set(.15, 1.46, .4); up.add(r); }
    if (face === 'bigeyes') for (const k of [-1, 1]) up.add(box(.2, .22, .06, white(), k * .16, 1.46, .37), box(.1, .12, .06, dark(), k * .16, 1.45, .4));
    if (face === 'robot') { const rm = new THREE.MeshBasicMaterial({ color: 0xff3b30 }); for (const k of [-1, 1]) up.add(box(.13, .13, .06, rm, k * .16, 1.46, .38)); for (let i = -1; i <= 1; i++) up.add(box(.28, .03, .05, dark(), 0, 1.27 + i * .05, .38)); }
    if (face === 'stareyes') for (const k of [-1, 1]) { const s = new THREE.Mesh(new THREE.OctahedronGeometry(.1, 0), new THREE.MeshBasicMaterial({ color: 0xffd93d })); s.position.set(k * .15, 1.46, .4); s.scale.z = .4; up.add(s); }
    if (face === 'hearteyes') for (const k of [-1, 1]) { const rm = new THREE.MeshBasicMaterial({ color: 0xff4d6d }), a = box(.1, .1, .05, rm, k * .15, 1.45, .39); a.rotation.z = Math.PI / 4; up.add(a, box(.06, .06, .05, rm, k * .15 - .04, 1.5, .39), box(.06, .06, .05, rm, k * .15 + .04, 1.5, .39)); }
    if (face === 'dizzy') for (const k of [-1, 1]) for (const r of [-.78, .78]) { const x = box(.17, .035, .04, dark(), k * .15, 1.46, .39); x.rotation.z = r; up.add(x); }
    if (face === 'vampire') for (const k of [-1, 1]) up.add(box(.04, .1, .04, white(), k * .08, 1.25, .39), box(.1, .04, .05, dark(), k * .12, 1.3, .38));
    if (face === 'clown') { const nose = new THREE.Mesh(new THREE.IcosahedronGeometry(.08, 0), new THREE.MeshBasicMaterial({ color: 0xff3b30 })); nose.position.set(0, 1.37, .42); up.add(nose, box(.24, .04, .05, new THREE.MeshBasicMaterial({ color: 0xff3b30 }), 0, 1.24, .38)); }
    if (face === 'tears') for (const k of [-1, 1]) up.add(box(.05, .16, .04, new THREE.MeshBasicMaterial({ color: 0x4dc3ff }), k * .17, 1.33, .39));
    if (face === 'pixelshades') up.add(box(.5, .12, .06, dark(), 0, 1.47, .38), box(.12, .07, .06, dark(), -.19, 1.4, .38), box(.12, .07, .06, dark(), .19, 1.4, .38), box(.05, .05, .07, white(), -.15, 1.5, .4));
    const hat = p.hat; let h;
    if (hat === 'cone') { h = new THREE.Mesh(new THREE.ConeGeometry(.3, .6, 5), am()); h.position.y = 2; }
    else if (hat === 'top') { h = new THREE.Group(); const a = new THREE.Mesh(new THREE.CylinderGeometry(.25, .25, .5, 6), dark()); a.position.y = .25;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(.26, .26, .1, 6), am()); band.position.y = .1;
      h.add(a, band, new THREE.Mesh(new THREE.CylinderGeometry(.42, .42, .06, 6), dark())); h.position.y = 1.75; }
    else if (hat === 'ears') { h = new THREE.Group(); for (const k of [-1, 1]) { const e = new THREE.Mesh(new THREE.BoxGeometry(.14, .6, .14), mat); e.position.set(k * .2, .3, 0); h.add(e); } h.position.y = 1.7; }
    else if (hat === 'halo') { h = new THREE.Mesh(new THREE.TorusGeometry(.3, .05, 4, 8), new THREE.MeshBasicMaterial({ color: ac })); h.rotation.x = Math.PI / 2; h.position.y = 2.05; }
    else if (hat === 'crown') { h = new THREE.Group(); h.add(new THREE.Mesh(new THREE.CylinderGeometry(.32, .3, .22, 5), am()));
      for (let i = 0; i < 5; i++) { const t = new THREE.Mesh(new THREE.ConeGeometry(.07, .2, 4), am()); const a = i / 5 * Math.PI * 2; t.position.set(Math.cos(a) * .27, .2, Math.sin(a) * .27); h.add(t); } h.position.y = 1.85; }
    else if (hat === 'wizard') { h = new THREE.Group(); const c = new THREE.Mesh(new THREE.ConeGeometry(.34, .95, 8), am()); c.position.y = .45; c.rotation.z = .12;
      h.add(c, new THREE.Mesh(new THREE.CylinderGeometry(.55, .55, .05, 8), am())); h.position.y = 1.75; }
    else if (hat === 'cap') { h = new THREE.Group(); h.add(new THREE.Mesh(new THREE.SphereGeometry(.43, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), am()), box(.42, .04, .3, am(), 0, .02, .4)); h.position.y = 1.55; }
    else if (hat === 'horns') { h = new THREE.Group(); for (const k of [-1, 1]) { const c = new THREE.Mesh(new THREE.ConeGeometry(.09, .4, 4), am()); c.position.set(k * .3, .2, 0); c.rotation.z = -k * .5; h.add(c); } h.position.y = 1.7; }
    else if (hat === 'propeller') { h = new THREE.Group(); h.add(new THREE.Mesh(new THREE.CylinderGeometry(.04, .04, .15, 4), dark()));
      const sp = new THREE.Group(); sp.position.y = .1; sp.add(box(.8, .03, .12, am(), 0, 0, 0), box(.12, .03, .8, am(), 0, 0, 0)); h.add(sp); h.position.y = 1.85; var spinner = sp; }
    else if (hat === 'antenna') { h = new THREE.Group(); const r = new THREE.Mesh(new THREE.CylinderGeometry(.02, .02, .5, 4), dark()); r.position.y = .25;
      const t = new THREE.Mesh(new THREE.IcosahedronGeometry(.09, 0), new THREE.MeshBasicMaterial({ color: ac })); t.position.y = .55; h.add(r, t); h.position.y = 1.78; }
    else if (hat === 'pirate') { h = new THREE.Group(); h.add(box(.95, .1, .5, dark(), 0, 0, 0), new THREE.Mesh(new THREE.ConeGeometry(.3, .3, 4), dark()), box(.5, .05, .52, am(), 0, .06, 0)); h.children[1].position.y = .2; h.children[1].rotation.y = Math.PI / 4; h.position.y = 1.72; }
    else if (hat === 'chef') { h = new THREE.Group(); const c = new THREE.Mesh(new THREE.CylinderGeometry(.28, .26, .25, 8), new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true })); c.position.y = .12; const p2 = new THREE.Mesh(new THREE.IcosahedronGeometry(.32, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true })); p2.position.y = .4; h.add(c, p2); h.position.y = 1.72; }
    else if (hat === 'beanie') { h = new THREE.Group(); h.add(new THREE.Mesh(new THREE.SphereGeometry(.43, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), am()), new THREE.Mesh(new THREE.CylinderGeometry(.44, .44, .08, 8), this.mat(0xffffff))); const pom = new THREE.Mesh(new THREE.IcosahedronGeometry(.1, 0), this.mat(0xffffff)); pom.position.y = .45; h.add(pom); h.children[1].position.y = .02; h.position.y = 1.55; }
    else if (hat === 'sombrero') { h = new THREE.Group(); h.add(new THREE.Mesh(new THREE.CylinderGeometry(.85, .85, .05, 10), am()), new THREE.Mesh(new THREE.CylinderGeometry(.2, .3, .35, 8), am())); h.children[1].position.y = .18; h.position.y = 1.72; }
    else if (hat === 'viking') { h = new THREE.Group(); h.add(new THREE.Mesh(new THREE.SphereGeometry(.43, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), this.mat(0x8d949e))); for (const k of [-1, 1]) { const c = new THREE.Mesh(new THREE.ConeGeometry(.09, .4, 5), this.mat(0xffffff)); c.position.set(k * .42, .15, 0); c.rotation.z = -k * .9; h.add(c); } h.position.y = 1.58; }
    else if (hat === 'flower') { h = new THREE.Group(); for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2, pe = new THREE.Mesh(new THREE.IcosahedronGeometry(.09, 0), am()); pe.position.set(Math.cos(a) * .13, 0, Math.sin(a) * .13); h.add(pe); } h.add(new THREE.Mesh(new THREE.IcosahedronGeometry(.08, 0), this.mat(0xffd93d))); h.position.set(.2, 1.83, .05); }
    else if (hat === 'catears') { h = new THREE.Group(); for (const k of [-1, 1]) { const e = new THREE.Mesh(new THREE.ConeGeometry(.15, .3, 3), mat); e.position.set(k * .24, .12, 0); e.rotation.z = -k * .2; h.add(e); } h.position.y = 1.72; }
    else if (hat === 'mohawk') { h = new THREE.Group(); for (let i = 0; i < 5; i++) h.add(box(.08, .3 - Math.abs(i - 2) * .05, .12, am(), 0, .1, (i - 2) * .17)); h.position.y = 1.72; }
    else if (hat === 'tiara') { h = new THREE.Group(); h.add(new THREE.Mesh(new THREE.TorusGeometry(.36, .03, 4, 12, Math.PI), am())); for (let i = -1; i <= 1; i++) { const a = Math.PI / 2 + i * .55, gm = new THREE.Mesh(new THREE.IcosahedronGeometry(.06, 0), new THREE.MeshBasicMaterial({ color: 0x7fffd4 })); gm.position.set(Math.cos(a) * .36, Math.sin(a) * .36, 0); h.add(gm); } h.position.y = 1.72; }
    else if (hat === 'bow') { h = new THREE.Group(); for (const k of [-1, 1]) { const c = new THREE.Mesh(new THREE.ConeGeometry(.13, .28, 4), am()); c.rotation.z = k * Math.PI / 2; c.position.x = k * .15; h.add(c); } h.add(new THREE.Mesh(new THREE.IcosahedronGeometry(.07, 0), am())); h.position.set(.22, 1.82, .05); }
    else if (hat === 'headphones') { h = new THREE.Group(); h.add(new THREE.Mesh(new THREE.TorusGeometry(.44, .035, 4, 12, Math.PI), dark())); for (const k of [-1, 1]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(.14, .14, .12, 8), am()); c.rotation.z = Math.PI / 2; c.position.x = k * .44; h.add(c); } h.position.y = 1.4; }
    else if (hat === 'santa') { h = new THREE.Group(); const wh = this.mat(0xffffff), c = new THREE.Mesh(new THREE.ConeGeometry(.38, .75, 7), this.mat(0xd32f2f)), pom = new THREE.Mesh(new THREE.IcosahedronGeometry(.1, 0), wh); c.position.set(.08, .4, 0); c.rotation.z = -.2; pom.position.set(.2, .78, 0); h.add(c, new THREE.Mesh(new THREE.CylinderGeometry(.43, .43, .12, 8), wh), pom); h.position.y = 1.65; }
    else if (hat === 'cowboy') { h = new THREE.Group(); h.add(new THREE.Mesh(new THREE.CylinderGeometry(.7, .7, .05, 10), am()), box(.5, .3, .5, am(), 0, .17, 0), box(.52, .06, .52, dark(), 0, .08, 0)); h.position.y = 1.72; }
    else if (hat === 'jester') { h = new THREE.Group(); h.add(new THREE.Mesh(new THREE.CylinderGeometry(.42, .42, .1, 8), dark())); for (const k of [-1, 1]) { const c = new THREE.Mesh(new THREE.ConeGeometry(.14, .6, 4), k < 0 ? am() : this.mat(0xe74c3c)), bell = new THREE.Mesh(new THREE.IcosahedronGeometry(.08, 0), this.mat(0xffd93d)); c.position.set(k * .3, .3, 0); c.rotation.z = -k * .8; bell.position.set(k * .52, .52, 0); h.add(c, bell); } h.position.y = 1.7; }
    else if (hat === 'helmet') { h = new THREE.Group(); h.add(new THREE.Mesh(new THREE.SphereGeometry(.46, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), this.mat(0x8d949e)), box(.4, .07, .06, dark(), 0, .02, .44), box(.08, .25, .32, am(), 0, .5, 0)); h.position.y = 1.38; }
    else if (hat === 'ufo') { h = new THREE.Group(); const dome = new THREE.Mesh(new THREE.SphereGeometry(.25, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x7fffd4 })); dome.position.y = .05; h.add(new THREE.Mesh(new THREE.CylinderGeometry(.55, .55, .1, 10), this.mat(0x8d949e)), dome); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2, l = new THREE.Mesh(new THREE.IcosahedronGeometry(.05, 0), new THREE.MeshBasicMaterial({ color: ac })); l.position.set(Math.cos(a) * .5, 0, Math.sin(a) * .5); h.add(l); } h.position.y = 1.85; }
    else if (hat === 'bucket') { h = new THREE.Group(); const cr = new THREE.Mesh(new THREE.CylinderGeometry(.34, .42, .35, 8), am()); cr.position.y = .17; h.add(cr, new THREE.Mesh(new THREE.CylinderGeometry(.6, .6, .04, 8), am())); h.position.y = 1.6; }
    else if (hat === 'duck') { h = new THREE.Group(); const yl = this.mat(0xffd93d), hd = new THREE.Mesh(new THREE.IcosahedronGeometry(.13, 0), yl); hd.position.set(0, .2, .1); h.add(new THREE.Mesh(new THREE.IcosahedronGeometry(.22, 0), yl), hd, box(.1, .04, .1, this.mat(0xff9f1a), 0, .18, .25), box(.04, .04, .04, dark(), .06, .24, .2), box(.04, .04, .04, dark(), -.06, .24, .2)); h.position.y = 1.82; }
    else if (hat === 'pumpkin') { h = new THREE.Group(); const o = new THREE.Mesh(new THREE.IcosahedronGeometry(.3, 1), this.mat(0xff8c1a)); o.scale.y = .8; h.add(o, box(.07, .14, .07, this.mat(0x2e7d32), 0, .27, 0)); h.position.y = 1.85; }
    else if (hat === 'mushroom') { h = new THREE.Group(); h.add(new THREE.Mesh(new THREE.SphereGeometry(.5, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), this.mat(0xe53935))); for (let i = 0; i < 5; i++) { const a = i * 1.26, d = new THREE.Mesh(new THREE.IcosahedronGeometry(.07, 0), white()); d.position.set(Math.cos(a) * .3, .3 + (i % 2) * .08, Math.sin(a) * .3); h.add(d); } h.position.y = 1.7; }
    else if (hat === 'traffic') { h = new THREE.Group(); const c = new THREE.Mesh(new THREE.ConeGeometry(.28, .7, 8), this.mat(0xff6d00)), bd = new THREE.Mesh(new THREE.CylinderGeometry(.19, .2, .08, 8), white()); c.position.y = .35; bd.position.y = .3; h.add(c, bd, box(.5, .05, .5, this.mat(0xff6d00), 0, 0, 0)); h.position.y = 1.78; }
    else if (hat === 'unicorn') { h = new THREE.Group(); const horn = new THREE.Mesh(new THREE.ConeGeometry(.1, .6, 6), this.mat(0xffd1f0)); horn.position.y = .3; h.add(horn); for (const k of [-1, 1]) { const e = new THREE.Mesh(new THREE.ConeGeometry(.09, .22, 4), this.mat(0xffffff)); e.position.set(k * .25, .02, 0); e.rotation.z = -k * .3; h.add(e); } h.position.y = 1.82; }
    else if (hat === 'astronaut') { h = new THREE.Group(); h.add(new THREE.Mesh(new THREE.SphereGeometry(.56, 10, 8), new THREE.MeshStandardMaterial({ color: 0xbfe9ff, transparent: true, opacity: .3, depthWrite: false })), new THREE.Mesh(new THREE.CylinderGeometry(.5, .5, .12, 10), white())); h.children[1].position.y = -.42; h.position.y = 1.4; }
    else if (hat === 'frog') { h = new THREE.Group(); const gr = this.mat(0x5cb85c); for (const k of [-1, 1]) { const e = new THREE.Mesh(new THREE.IcosahedronGeometry(.15, 0), gr), p1 = new THREE.Mesh(new THREE.IcosahedronGeometry(.07, 0), dark()); e.position.set(k * .2, 0, 0); p1.position.set(k * .2, .02, .12); h.add(e, p1); } h.position.y = 1.82; }
    else if (hat === 'shark') { h = new THREE.Mesh(new THREE.ConeGeometry(.25, .65, 3), this.mat(0x78909c)); h.scale.z = .3; h.position.y = 2.05; }
    else if (hat === 'laurel') { h = new THREE.Group(); for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2, l = box(.12, .06, .22, this.mat(0x4caf50), Math.cos(a) * .42, 0, Math.sin(a) * .42); l.rotation.y = -a; h.add(l); } h.position.y = 1.65; }
    else if (hat === 'hardhat') { h = new THREE.Group(); h.add(new THREE.Mesh(new THREE.SphereGeometry(.44, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), this.mat(0xffc107)), box(.1, .06, .9, this.mat(0xffb300), 0, .4, 0), new THREE.Mesh(new THREE.CylinderGeometry(.55, .55, .04, 8), this.mat(0xffc107))); h.position.y = 1.58; }
    else if (hat === 'cake') { h = new THREE.Group(); const fl = new THREE.Mesh(new THREE.IcosahedronGeometry(.06, 0), new THREE.MeshBasicMaterial({ color: 0xff9f1a })); fl.position.y = .46; h.add(new THREE.Mesh(new THREE.CylinderGeometry(.32, .34, .25, 10), this.mat(0xff9ecb)), box(.64, .06, .64, white(), 0, .12, 0), box(.05, .2, .05, this.mat(0xffd93d), 0, .3, 0), fl); h.position.y = 1.75; }
    if (h) up.add(h);
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
    const x = cv.getContext('2d'); x.font = 'bold 36px sans-serif'; x.textAlign = 'center';
    x.fillStyle = '#fff'; x.strokeStyle = '#000'; x.lineWidth = 6;
    x.strokeText(p.name, 128, 44); x.fillText(p.name, 128, 44);
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv) }));
    tag.scale.set(3, .75, 1); tag.position.y = 2.8 + dy;
    g.add(b, up, tag);
    // body pattern, back item and ground aura (all sit on the body, so they need its size: br = radius, by = middle height)
    const BR = { box: .55, round: .62, tall: .39, pyramid: .5, bean: .42, diamond: .8, barrel: .52, chunky: .72, ico: .6, hexa: .5, top: .55, snowman: .5, egg: .55, can: .55 }, BYM = { box: .5, round: .55, tall: .68, pyramid: .3, bean: .66, diamond: .75, barrel: .5, chunky: .45, ico: .6, hexa: .5, top: .62, snowman: .55, egg: .65, can: .45 };
    const ZH = { box: .3, chunky: .35, round: .51, ico: .55, hexa: .43, tall: .4, barrel: .5, bean: .4, egg: .5, can: .55 }, WH = { box: .45, chunky: .625, round: .6, ico: .58, hexa: .5, tall: .4, barrel: .5, bean: .4, egg: .55, can: .55 };
    const zf = y => body === 'pyramid' ? Math.max(.06, .46 * (1 - y / 1.1)) : body === 'diamond' ? Math.max(.08, .75 * (1 - Math.abs(y - .75) / .86)) : body === 'top' ? Math.max(.05, .55 * (y - .05)) : body === 'snowman' ? Math.sqrt(Math.max(.01, y < .95 ? .25 - (y - .5) ** 2 : .13 - (y - 1.1) ** 2)) : (ZH[body] ?? .35);
    const wf = y => WH[body] ?? zf(y);
    const br = BR[body] ?? .55, by = BYM[body] ?? .5, rr = y => body === 'pyramid' ? Math.max(.1, .65 * (1 - y / 1.1)) + .03 : body === 'diamond' || body === 'top' || body === 'snowman' ? wf(y) + .04 : br, fz = y => zf(y) + .03;   // zf/wf = half depth/width of the body at height y; fz = front surface for flat decals
    const ringAt = (y, r, t, m, fit = true) => { const o = new THREE.Mesh(new THREE.TorusGeometry(r, t, 4, 14), m || am()); o.rotation.x = Math.PI / 2; o.position.y = y; if (fit && body !== 'pyramid') o.scale.set(Math.max(.2, (wf(y) + .04) / r), Math.max(.2, (zf(y) + .04) / r), 1); return o; };
    const pat = p.pattern || 'none';
    if (pat === 'stripes') g.add(ringAt(by - .22, rr(by - .22), .05), ringAt(by, rr(by), .05), ringAt(by + .22, rr(by + .22), .05));
    else if (pat === 'belt') { g.add(ringAt(by - .1, rr(by - .1), .09, dark())); g.add(box(.18, .18, .06, am(), 0, by - .1, fz(by - .1))); }
    else if (pat === 'dots') for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, d = new THREE.Mesh(new THREE.IcosahedronGeometry(.07, 0), am()); const yy = by + (i % 2 ? .15 : -.1); d.position.set(Math.sin(a) * (wf(yy) + .02), yy, Math.cos(a) * (zf(yy) + .02)); g.add(d); }
    else if (pat === 'sash') { const s = box(.16, 1.05, .05, am(), 0, by + .05, fz(by)); s.rotation.z = .75; g.add(s); }
    else if (pat === 'bowtie') { const z = Math.max(.3, zf(.95) + .04), y = 1.0 + dy; for (const k of [-1, 1]) { const c = new THREE.Mesh(new THREE.ConeGeometry(.1, .2, 4), am()); c.rotation.z = k * Math.PI / 2; c.position.set(k * .1, y, z); g.add(c); } g.add(box(.07, .07, .06, dark(), 0, y, z)); }
    else if (pat === 'badge') { const z = fz(by + .2), d1 = box(.2, .2, .04, am(), -.2, by + .22, z); d1.rotation.z = Math.PI / 4; g.add(d1, box(.07, .07, .05, dark(), -.2, by + .22, z + .02)); }
    else if (pat === 'checker') { for (let i = 0; i < 6; i++) g.add(box(.15, .15, .04, i % 2 ? dark() : this.mat(0xffffff), ((i % 3) - 1) * .15, by + .15 - (i / 3 | 0) * .15, fz(by))); }
    else if (pat === 'scarf') { g.add(ringAt(1.05 + dy, Math.max(.3, br * .75), .1, null, false)); g.add(box(.14, .4, .05, am(), .24, .85 + dy, Math.max(.3, br * .75))); }
    else if (pat === 'buttons') for (let i = 0; i < 3; i++) g.add(box(.08, .08, .04, dark(), 0, by + .22 - i * .2, fz(by + .22 - i * .2)));
    else if (pat === 'tie') { const z = fz(by + .35); g.add(box(.1, .1, .05, am(), 0, by + .4, z), box(.13, .5, .05, am(), 0, by + .1, z)); }
    else if (pat === 'overalls') { for (const k of [-1, 1]) g.add(box(.08, .6, .05, am(), k * .2, by + .2, fz(by + .2))); g.add(box(.4, .3, .05, am(), 0, by - .15, fz(by - .15))); }
    else if (pat === 'emblem') { const z = fz(by + .15); for (let i = 0; i < 3; i++) { const s = box(.14, .14, .04, am(), (i - 1) * .17, by + .15 + (i === 1 ? .08 : 0), z); s.rotation.z = Math.PI / 4; g.add(s); } }
    const bz = -(zf(by) + .05), back = p.back || 'none';
    if (back === 'cape') { const c = box(Math.min(1.3, Math.max(.7, wf(by) * 2 - .05)), 1.1, .06, am(), 0, by + .25, bz); c.rotation.x = .12; g.add(c); }
    else if (back === 'wings') for (const k of [-1, 1]) { const w1 = box(.7, .4, .05, this.mat(0xffffff), k * (wf(by) * .5 + .3), by + .35, bz), w2 = box(.5, .3, .05, this.mat(0xeeeeee), k * (wf(by) * .5 + .25), by + .02, bz); w1.rotation.z = k * .45; w2.rotation.z = k * .3; g.add(w1, w2); }
    else if (back === 'backpack') g.add(box(.6, .7, .3, am(), 0, by + .1, bz - .12), box(.5, .15, .32, dark(), 0, by + .3, bz - .12));
    else if (back === 'tail') for (let i = 0; i < 4; i++) { const t = new THREE.Mesh(new THREE.IcosahedronGeometry(.14 - i * .015, 0), mat); t.position.set(0, .3 + i * .22 - (i === 3 ? .04 : 0), bz - .08 - Math.sin(i * .9) * .25); g.add(t); }
    else if (back === 'jetpack') { for (const k of [-1, 1]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(.12, .12, .65, 8), this.mat(0x8d949e)); c.position.set(k * .2, by + .2, bz - .1); const f = new THREE.Mesh(new THREE.ConeGeometry(.1, .3, 6), new THREE.MeshBasicMaterial({ color: 0xff9f1a })); f.rotation.x = Math.PI; f.position.set(k * .2, by - .28, bz - .1); g.add(c, f); } }
    else if (back === 'shell') { const sh = new THREE.Mesh(new THREE.SphereGeometry(.55, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), am()); sh.rotation.x = -Math.PI / 2; sh.position.set(0, by + .1, bz + .05); g.add(sh); }
    else if (back === 'bat') { const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(.35, .5); sh.lineTo(.95, .62); sh.lineTo(.8, .35); sh.lineTo(.9, .12); sh.lineTo(.62, .18); sh.lineTo(.5, -.12); sh.lineTo(.3, .06); sh.lineTo(.12, -.3); sh.closePath(); const bm = new THREE.MeshStandardMaterial({ color: 0x3a2a52, flatShading: true, side: THREE.DoubleSide }); for (const k of [-1, 1]) { const w1 = new THREE.Mesh(new THREE.ShapeGeometry(sh), bm); w1.scale.x = k; w1.position.set(k * (wf(by) * .3 + .08), by + .15, bz); w1.rotation.y = k * .35; const bone = box(.9, .03, .03, dark(), k * (wf(by) * .3 + .5), by + .45, bz - .01); bone.rotation.z = k * .35; g.add(w1, bone); } }
    else if (back === 'angel') for (const k of [-1, 1]) for (let i = 0; i < 6; i++) { const fh = .55 + (i < 3 ? i : 5 - i) * .12, f = box(.14, fh, .035, this.mat(i % 2 ? 0xffffff : 0xfff3d6), 0, 0, 0); f.geometry.translate(0, fh / 2, 0); f.position.set(k * (wf(by) * .35 + .1), by + .2, bz); f.rotation.z = -k * (.25 + i * .22); f.rotation.x = -.12; g.add(f); }
    else if (back === 'balloon') { const st = new THREE.Mesh(new THREE.CylinderGeometry(.012, .012, 1.6, 4), dark()), bl = new THREE.Mesh(new THREE.IcosahedronGeometry(.34, 1), am()); st.position.set(0, by + .8, bz - .12); bl.position.set(0, by + 1.85, bz - .12); g.add(st, bl); }
    else if (back === 'flag') { const pole = new THREE.Mesh(new THREE.CylinderGeometry(.025, .025, 1.7, 5), dark()); pole.position.set(.3, by + .85, bz - .1); g.add(pole, box(.55, .34, .03, am(), .58, by + 1.5, bz - .1)); }
    else if (back === 'sword') { const grp = new THREE.Group(); grp.add(box(.12, 1.3, .05, this.mat(0xcfd8dc), 0, 0, 0), box(.34, .07, .08, am(), 0, -.5, 0), box(.07, .22, .07, dark(), 0, -.65, 0)); grp.position.set(0, by + .2, bz - .04); grp.rotation.z = .8; g.add(grp); }
    else if (back === 'guitar') { const grp = new THREE.Group(), bd = new THREE.Mesh(new THREE.CylinderGeometry(.28, .28, .08, 10), am()); bd.rotation.x = Math.PI / 2; bd.position.y = -.35; grp.add(bd, box(.06, .8, .05, dark(), 0, .2, 0), box(.1, .18, .05, dark(), 0, .65, 0)); grp.position.set(0, by + .1, bz - .06); grp.rotation.z = -.5; g.add(grp); }
    else if (back === 'umbrella') { const grp = new THREE.Group(), cp = new THREE.Mesh(new THREE.ConeGeometry(.75, .35, 8), am()); cp.position.y = .95; grp.add(cp, box(.04, 1.3, .04, dark(), 0, .45, 0)); grp.position.set(.2, by - .1, bz - .06); grp.rotation.z = -.35; g.add(grp); }
    else if (back === 'quiver') { const grp = new THREE.Group(); grp.add(new THREE.Mesh(new THREE.CylinderGeometry(.12, .1, .7, 6), this.mat(0x6d4c2f))); for (let i = 0; i < 3; i++) grp.add(box(.03, .3, .03, this.mat(0xffffff), (i - 1) * .06, .45, 0)); grp.position.set(.18, by + .15, bz - .05); grp.rotation.z = -.3; g.add(grp); }
    const aura = p.ring || 'none';
    if (aura === 'ring' || aura === 'twin') { const r1 = new THREE.Mesh(new THREE.TorusGeometry(.85, .04, 4, 20), new THREE.MeshBasicMaterial({ color: ac })); r1.rotation.x = Math.PI / 2; r1.position.y = .06; g.add(r1); if (aura === 'twin') { const r2 = r1.clone(); r2.scale.set(1.35, 1.35, 1); r2.position.y = .04; g.add(r2); } }
    else if (aura === 'disc') { const d = new THREE.Mesh(new THREE.CircleGeometry(.9, 20), new THREE.MeshBasicMaterial({ color: ac, transparent: true, opacity: .4, depthWrite: false })); d.rotation.x = -Math.PI / 2; d.position.y = .04; g.add(d); }
    else if (aura === 'dotring') for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2, d = new THREE.Mesh(new THREE.IcosahedronGeometry(.07, 0), new THREE.MeshBasicMaterial({ color: ac })); d.position.set(Math.cos(a) * .95, .1, Math.sin(a) * .95); g.add(d); }
    else if (aura === 'hex') { const r1 = new THREE.Mesh(new THREE.TorusGeometry(.9, .04, 4, 6), new THREE.MeshBasicMaterial({ color: ac })); r1.rotation.x = Math.PI / 2; r1.position.y = .06; g.add(r1); }
    else if (aura === 'beam') { const bm = new THREE.Mesh(new THREE.CylinderGeometry(.8, .8, 3.2, 16, 1, true), new THREE.MeshBasicMaterial({ color: ac, transparent: true, opacity: .16, depthWrite: false, side: THREE.DoubleSide })); bm.position.y = 1.6; g.add(bm); }
    g.rotation.order = 'YXZ'; this.scene.add(g);   // YXZ: yaw first, so lean tilts along the facing direction
    this.m.set(p.id, { g, tx: 0, tz: 0, trail: p.trail || 'none', aura: p.aura || 'none', spinner, lean: 0, leanT: 0, face: null, hop: false, hv: 0, hy: 0, emo: null });
  }
  sync(players) {
    for (const id of [...this.m.keys()]) if (!players[id]) { this.scene.remove(this.m.get(id).g); this.m.delete(id); }
    for (const id in players) {
      const p = players[id], sig = [p.color, p.accent, p.hat, p.body, p.face, p.back, p.pattern, p.aura, p.ring, p.coat, p.name].join('|'), e = this.m.get(id);
      if (e && e.sig === sig) { e.trail = p.trail || 'none'; continue; }      // (trail isn't part of the look signature: update it in place)
      if (e) this.scene.remove(e.g);
      this.add(p); const n = this.m.get(id); n.sig = sig;
      n.trail = p.trail || 'none'; if (e) { n.g.position.copy(e.g.position); n.tx = e.tx; n.tz = e.tz; }
    }
  }
  rag(id, o) { const e = this.m.get(id); if (!e) return; if (o) { e.rag = o; if (!e.ragOn) { e.ragOn = true; e.hop = false; } } else if (e.rag) { e.rag = null; e.ragOn = false; this.resetPose(id); e.g.scale.setScalar(1); e.g.position.y = e.by || 0; } }   // ragdoll: o = { y, rx, rz } (tumble); null = stand up
  burst(x, y, z, color, n = 14) {
    this.pg ??= new THREE.BoxGeometry(.18, .18, .18);
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(this.pg, new THREE.MeshBasicMaterial({ color, transparent: true })); m.position.set(x, y, z); this.scene.add(m);
      this.parts.push({ m, vx: (Math.random() - .5) * 8, vy: Math.random() * 7 + 2, vz: (Math.random() - .5) * 8, life: .8 });
    }
  }
  fxBit(e, kind) { const ka = e.aura; e.aura = kind; this.auraBit(e); e.aura = ka; }
  dust(e, col = '#ffffff', n = 8) { const p = e.g.position; this.burst(p.x, (e.by || 0) + .1, p.z, col, n); }
  auraBit(e) {
    const a = AU[e.aura]; if (!a) return; this.pg ??= new THREE.BoxGeometry(.18, .18, .18);
    const ang = Math.random() * 6.283, rad = a.r * (.5 + Math.random() * .5), p = e.g.position, j = a.jit || .4;
    const m = new THREE.Mesh(this.pg, new THREE.MeshBasicMaterial({ color: new THREE.Color(a.c[Math.random() * a.c.length | 0]), transparent: true }));
    m.scale.setScalar((a.sc ?? .8) * (.6 + Math.random() * .6)); m.position.set(p.x + Math.cos(ang) * rad, p.y + a.y0 + Math.random() * a.h, p.z + Math.sin(ang) * rad); this.scene.add(m);
    this.parts.push({ m, vx: (Math.random() - .5) * j - Math.sin(ang) * .3, vy: a.vy, vz: (Math.random() - .5) * j + Math.cos(ang) * .3, life: a.life, l0: a.life, g: 0 });
  }
  trailBit(p, kind) {
    this.pg ??= new THREE.BoxGeometry(.18, .18, .18);
    const T = TR[kind] || TR.sparkle, col = kind === 'rainbow' ? new THREE.Color().setHSL((this.t * .8) % 1, 1, .6) : new THREE.Color(T[Math.random() * T.length | 0]);
    const m = new THREE.Mesh(this.pg, new THREE.MeshBasicMaterial({ color: col, transparent: true })); m.position.set(p.x, .25, p.z); m.scale.setScalar(kind === 'flame' ? 1.2 : kind === 'smoke' ? 1.6 : .8); this.scene.add(m);
    this.parts.push({ m, vx: (Math.random() - .5) * 1.5, vy: kind === 'flame' ? 5 : kind === 'bubbles' || kind === 'smoke' ? 1.8 : 3, vz: (Math.random() - .5) * 1.5, life: .6 });
  }
  showDeco(v) { this.decoOn = v; this.deco.forEach(o => o.visible = v); if (this.floor) this.floor.visible = v && this.islandOn; }
  setIsland(v) { this.islandOn = v; if (this.floor) this.floor.visible = this.decoOn && v; }   // the green lobby island; boards with their own ground turn it off
  setSky(p) {   // p in [0,1] = progress through the game (dawn -> day -> dusk -> night); null = plain day
    if (p == null) { this.skyT = null; this.dark = 0; this.hemiT = 1.2; this.scene.background.set(0x87ceeb); return; }
    const st = [0xffc58a, 0x87ceeb, 0x87ceeb, 0xe58a6e, 0x1b2440], f = Math.min(.999, Math.max(0, p)) * (st.length - 1), i = f | 0;
    this.skyT = new THREE.Color(st[i]).lerp(new THREE.Color(st[i + 1]), f - i); this.dark = p; this.hemiT = 1.2 - .75 * Math.max(0, (p - .6) / .4);
  }
  // ---- camera: setCam([x,y,z], [lx,ly,lz], seconds) tweens; resetCam() returns to the default board view; shake(amount, seconds)
  setCam(pos, look, dur = 0) {
    const p1 = new THREE.Vector3(...pos), l1 = new THREE.Vector3(...look);
    if (dur <= 0) { this.camPos.copy(p1); this.camLook.copy(l1); this.camTw = null; return; }
    this.camTw = { p0: this.camPos.clone(), l0: this.camLook.clone(), p1, l1, t: 0, d: dur };
  }
  resetCam(dur = 0) { this.setCam([0, 18, 14], [0, 0, 0], dur); }
  shake(a = .4, d = .35) { this.shkA = a; this.shk = this.shkD = d; }
  // ---- player poses (all cosmetic; safe to call on every client)
  put(id, x, z, ry, y = 0) {                // teleport (no sliding); ry = facing (0 = toward the default camera / +z); y = standing height
    const e = this.m.get(id); if (!e) return; this.resetPose(id);
    if (e.rag) { e.rag = null; e.ragOn = false; } e.hop = false; e.hv = 0; e.leanT = 0; e.g.visible = true; e.g.scale.setScalar(1); e.g.rotation.x = 0; e.g.rotation.z = 0;
    e.tx = x; e.tz = z; e.by = y; e.ty = undefined; e.g.position.set(x, y, z); if (ry != null) { e.g.rotation.y = ry; e.face = ry; }
  }
  lift(id, y) { const e = this.m.get(id); if (e) { e.by = y; if (!e.hop) e.g.position.y = y; } }   // set standing height (hops/emotes stack on top of it)
  warp(id, x, z) { const e = this.m.get(id); if (e) { e.tx = x; e.tz = z; e.g.position.x = x; e.g.position.z = z; } }   // move instantly without touching pose/facing
  hop(id, h = 1) { const e = this.m.get(id); if (e) { e.hop = true; e.hv = Math.sqrt(2 * 26 * h); } }
  lean(id, a = .4) { const e = this.m.get(id); if (e) e.leanT = a; }          // radians, + = forward (toward its facing)
  face(id, ry) { const e = this.m.get(id); if (e) e.face = ry; }                // turn in place while standing still (null = free)
  emote(id, kind) {   // 'cheer' | 'sad' | 'wiggle' | 'giggle' | 'shake' | 'tilt' | 'love' | 'cool'
    const e = this.m.get(id); if (!e) return;
    const D = { rocket: 1.5, roar: 1, breakdance: 2.2, shimmy: 1.8, drop: 1.2, spin: 1.5, flip: 1.1, bounce: 2.4, float: 2.6, tornado: 1.7, sway: 2.2, bow: 1.4, cheer: 2.2, sad: 1.4, wiggle: 1.3, giggle: 1.1, shake: 1, tilt: 1.5, love: 1.2, cool: 1.5 };
    e.emo = { k: kind, t: 0, n: 0, g: 0, d: D[kind] || 1 };
    e.leanT = kind === 'sad' ? .6 : kind === 'shake' ? .3 : kind === 'cool' ? -.25 : 0;
  }
  emoStep(e, dt) {
    const m = e.emo, k = m.k, t = m.t += dt, g = e.g, fade = Math.max(0, 1 - t / m.d), every = (st, f) => { if ((m.x = (m.x || 0) - dt) <= 0) { m.x = st; f(); } }, p0 = g.position;
    if (k === 'cheer') { m.g -= dt; if (!e.hop && m.n < 3 && m.g <= 0) { e.hop = true; e.hv = 7.5; m.n++; m.g = .08; } }
    else if (k === 'giggle') { if (t >= m.n * .22 && m.n < 4 && !e.hop) { e.hop = true; e.hv = Math.sqrt(2 * 26 * .3); m.n++; } g.rotation.z = Math.sin(t * 30) * .08 * fade; }
    else if (k === 'love') { if (!m.n) { m.n = 1; e.hop = true; e.hv = Math.sqrt(2 * 26 * .9); } }
    else if (k === 'wiggle') g.rotation.z = Math.sin(t * 14) * .3 * fade;
    else if (k === 'shake') g.rotation.z = Math.sin(t * 45) * .22 * fade;
    else if (k === 'tilt') g.rotation.z = .35 * Math.min(1, t * 6) * Math.min(1, fade * 4);
    else if (k === 'cool' && t < .7) g.rotation.y += dt * Math.PI * 2 / .7;
    else if (k === 'spin') { g.rotation.y += dt * Math.PI * 4; every(.07, () => this.fxBit(e, 'sparkles')); if (!m.l) { m.l = 1; this.dust(e, '#4dd0e1', 10); } }
    else if (k === 'flip') { if (!m.n) { m.n = 1; e.hop = true; e.hv = Math.sqrt(2 * 26 * 1.1); this.dust(e, '#ffd93d', 10); } g.rotation.x = -Math.min(1, t / .85) * Math.PI * 2; if (t < .85) every(.05, () => this.fxBit(e, 'stardust')); else if (!m.l) { m.l = 1; this.dust(e, '#e0e0e0', 16); this.shake(.12, .2); } }
    else if (k === 'bounce') { if (!e.hop && m.n < 7) { e.hop = true; e.hv = Math.sqrt(2 * 26 * .45); m.n++; this.dust(e, '#ffffff', 6); if (m.n % 3 === 0) this.burst(p0.x, p0.y + 1.2, p0.z, '#ffd93d', 8); } }
    else if (k === 'float') { g.position.y = (e.by || 0) + (t < m.d - .3 ? .7 * Math.min(1, t * 3) : 0) + Math.sin(t * 3) * .12; g.rotation.y += dt * 1.6; every(.05, () => this.fxBit(e, m.n++ % 2 ? 'stardust' : 'sparkles')); }
    else if (k === 'tornado') { const s = Math.min(1, t * 4); g.rotation.y += dt * Math.PI * 9; g.scale.set(1 - .25 * s, 1 + .35 * s, 1 - .25 * s); every(.03, () => this.fxBit(e, m.n++ % 3 ? 'mist' : 'leaves')); }
    else if (k === 'sway') { g.rotation.z = Math.sin(t * 5) * .4 * Math.min(1, fade * 3); if (!m.l && t > .2) { m.l = 1; e.hop = true; e.hv = 5; } every(.12, () => this.fxBit(e, 'hearts')); }
    else if (k === 'shimmy') { g.rotation.z = Math.sin(t * 22) * .18; g.rotation.y = Math.sin(t * 9) * .5; if (!m.l && t > .1) { m.l = 1; e.hop = true; e.hv = 6; } every(.04, () => this.fxBit(e, 'confetti')); }
    else if (k === 'drop') { if (t < .25) g.scale.y = 1 - t * 2; else { g.scale.y = 1; if (!m.l) { m.l = 1; e.hop = true; e.hv = Math.sqrt(2 * 26 * 1.3); this.dust(e, '#ffffff', 18); this.shake(.2, .25); } } if (t > .25 && t < .9) every(.05, () => this.fxBit(e, 'embers')); }
    else if (k === 'bow') { g.rotation.x = Math.sin(Math.min(1, t / 1.2) * Math.PI) * .75; if (t > .55 && !m.l) { m.l = 1; this.burst(p0.x, p0.y + 1.8, p0.z, '#ff6b9d', 18); } if (t > .55 && t < 1) every(.06, () => this.fxBit(e, 'petals')); }
    else if (k === 'rocket') { g.position.y = (e.by || 0) + 5 * Math.sin(Math.min(1, t / 1.4) * Math.PI); every(.02, () => { this.fxBit(e, 'embers'); this.fxBit(e, 'embers'); }); if (!m.l) { m.l = 1; this.dust(e, '#ff9f1a', 16); this.shake(.2, .3); } }
    else if (k === 'roar') { g.scale.setScalar(1 + .35 * Math.sin(Math.min(1, t / .5) * Math.PI)); if (!m.l && t > .2) { m.l = 1; this.shake(.3, .4); for (let n = 0; n < 3; n++) this.burst(p0.x, p0.y + .6 + n * .5, p0.z, '#ff9f1a', 22); } }
    else if (k === 'breakdance') { g.rotation.x = -1.35; g.rotation.y += dt * 10; g.position.y = (e.by || 0) + .35; every(.05, () => this.fxBit(e, 'sparkles')); }
    if (t >= m.d) { e.leanT = 0; if (k === 'flip' || k === 'bow' || k === 'breakdance') g.rotation.x = 0; if (k === 'shimmy') g.rotation.z = 0; if (k === 'tornado' || k === 'drop' || k === 'roar') g.scale.setScalar(1); if (k === 'float' || k === 'rocket' || k === 'breakdance') g.position.y = e.by || 0; e.emo = null; }
  }
  // floating emoji above a player's head (cached glyph textures); rises and fades
  icon(ch) {
    this.ic ??= new Map(); let t = this.ic.get(ch);
    if (!t) { const cv = document.createElement('canvas'); cv.width = cv.height = 96; const c = cv.getContext('2d'); c.font = '68px serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(ch, 48, 52); t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; this.ic.set(ch, t); }
    return t;
  }
  popIcon(id, ch) {
    const e = this.m.get(id); if (!e) return;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.icon(ch), transparent: true, depthTest: false })); sp.renderOrder = 5; sp.scale.set(.01, .01, 1); this.scene.add(sp);
    (this.pops ??= []).push({ sp, e, t: 0 });
  }
  resetPose(id) {
    const e = this.m.get(id); if (!e) return;
    e.face = null; e.lean = e.leanT = 0; e.emo = null; e.hop = false; e.hv = e.hy = 0;
    e.g.rotation.x = 0; e.g.rotation.z = 0; e.by = 0; e.g.position.y = 0; e.g.visible = true;
  }
  set(id, x, z, y) { const e = this.m.get(id); if (e) { e.tx = x; e.tz = z; if (y !== undefined) e.ty = y; } }   // y (optional) = standing height, eased toward; games that never pass y keep full control of it
  frame(dt) {
    this.t += dt;
    if (this.camTw) {
      const w = this.camTw; w.t += dt; const k = Math.min(1, w.t / w.d), s = k * k * (3 - 2 * k);
      this.camPos.lerpVectors(w.p0, w.p1, s); this.camLook.lerpVectors(w.l0, w.l1, s); if (k >= 1) this.camTw = null;
    }
    this.cam.position.copy(this.camPos);
    if (this.shk > 0) { this.shk = Math.max(0, this.shk - dt); const a = this.shkA * this.shk / this.shkD; this.cam.position.x += (Math.random() - .5) * a; this.cam.position.y += (Math.random() - .5) * a; }
    this.cam.lookAt(this.camLook);
    if (this.pops?.length) for (let i = this.pops.length - 1; i >= 0; i--) {
      const q = this.pops[i]; q.t += dt; const u = Math.min(1, q.t * 6), sc = 1.3 * (u < 1 ? 1 + 2.7 * Math.pow(u - 1, 3) + 1.7 * Math.pow(u - 1, 2) : 1);
      q.sp.position.set(q.e.g.position.x, q.e.g.position.y + 3 + q.t * .7, q.e.g.position.z); q.sp.scale.set(sc, sc, 1);
      q.sp.material.opacity = Math.min(1, (1.7 - q.t) * 3);
      if (q.t >= 1.7) { this.scene.remove(q.sp); q.sp.material.dispose(); this.pops.splice(i, 1); }
    }
    for (const f of this.anim) f(dt, this.t);
    if (this.skyT) this.scene.background.lerp(this.skyT, Math.min(1, dt * .8));
    this.hemi.intensity += (this.hemiT - this.hemi.intensity) * Math.min(1, dt * .8);
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const q = this.parts[i]; q.vy -= (q.g ?? 20) * dt; q.m.position.x += q.vx * dt; q.m.position.y += q.vy * dt; q.m.position.z += q.vz * dt;
      q.life -= dt; q.m.material.opacity = Math.max(0, q.life / (q.l0 || .8));
      if (q.life <= 0) { this.scene.remove(q.m); q.m.material.dispose(); this.parts.splice(i, 1); }
    }
    for (const e of this.m.values()) {
      if (e.rag) { const kk = Math.min(1, dt * 20); e.g.position.x += (e.tx - e.g.position.x) * kk; e.g.position.z += (e.tz - e.g.position.z) * kk; e.g.position.y += (e.rag.y - e.g.position.y) * kk; e.g.rotation.x += (e.rag.rx - e.g.rotation.x) * kk; e.g.rotation.z += (e.rag.rz - e.g.rotation.z) * kk; const sc = e.rag.sc ?? 1; e.g.scale.x += (sc - e.g.scale.x) * kk; e.g.scale.y = e.g.scale.z = e.g.scale.x; continue; }
      const dx = e.tx - e.g.position.x, dz = e.tz - e.g.position.z, k = Math.min(1, dt * 15);
      const mv = Math.hypot(dx, dz) > .02; if (mv) { let da = Math.atan2(dx, dz) - e.g.rotation.y; da = Math.atan2(Math.sin(da), Math.cos(da)); e.g.rotation.y += da * Math.min(1, dt * 14); } e.g.rotation.z = mv ? Math.sin(this.t * 16) * .12 : e.g.rotation.z * .8;
      e.g.position.x += dx * k; e.g.position.z += dz * k;
      if (!mv && e.face != null && !SPINK.includes(e.emo?.k)) { let d = e.face - e.g.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); e.g.rotation.y += d * Math.min(1, dt * 12); }
      if (e.emo) this.emoStep(e, dt);
      if (e.lean !== e.leanT) { e.lean += (e.leanT - e.lean) * Math.min(1, dt * 14); if (Math.abs(e.leanT - e.lean) < .002) e.lean = e.leanT; e.g.rotation.x = e.lean; }
      if (e.ty !== undefined) { e.by = (e.by || 0) + (e.ty - (e.by || 0)) * k; if (!e.hop) e.g.position.y = e.by; }
      if (e.hop) { e.hv -= 26 * dt; e.hy += e.hv * dt; if (e.hy <= 0) { e.hy = 0; e.hv = 0; e.hop = false; } e.g.position.y = (e.by || 0) + e.hy; }
      if (e.spinner) e.spinner.rotation.y += dt * 14;
      if (mv && e.trail !== 'none' && ((e.tt = (e.tt || 0) - dt) <= 0)) { e.tt = .06; this.trailBit(e.g.position, e.trail); }
      if (e.aura && e.aura !== 'none' && e.g.visible && ((e.at = (e.at || 0) - dt) <= 0)) { e.at = AU[e.aura]?.rate ?? .08; this.auraBit(e); }
    }
    this.r.render(this.scene, this.cam);
  }
}
