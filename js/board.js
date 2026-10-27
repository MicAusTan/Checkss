import * as THREE from 'three';
import { BOARDS } from './boards.js';
// Board layer. Host owns state `s` and broadcasts it in full on every change (it's tiny);
// clients just render it and send 'roll'. Minigames run between rounds via opts.playMg().
let B = BOARDS.classic; const setBoard = id => { B = BOARDS[id] || BOARDS.classic; };
const COL = { blue: 0x4aa3ff, red: 0xff5a5a, green: 0x58d68d, shop: 0xb06bff, duel: 0xff9f43, warp: 0x00cec9, toll: 0xc8a14a, slot: 0xff2d95, dash: 0xffe14d, thief: 0x7f8c8d, swap: 0xfd79a8, geyser: 0x5dade2, forge: 0xe67e22, vent: 0xc0392b, roulette: 0x16a085, jackpot: 0xf1c40f, metro: 0x3498db, knight: 0xa29bfe, queen: 0xfdcb6e, bishop: 0x55efc4, king: 0xd63031 }, REWARD = [10, 6, 3, 0];
const MAXI = 3;
const ITEMS = {
  big: { n: 'Big Die', e: '🎯', c: 8, d: 'Next roll is 4-8' },
  dbl: { n: 'Double Dice', e: '🎲', c: 6, d: 'Next roll is two dice' },
  shield: { n: 'Shield', e: '🛡️', c: 5, d: 'Passive: blocks the next theft, swap or pickpocket', p: true },
  magnet: { n: 'Star Magnet', e: '🧲', c: 10, d: 'The ⭐ jumps 5-8 spaces ahead of you' },
  swap: { n: 'Swap', e: '🔄', c: 9, d: 'Trade places with a random rival' },
  steal: { n: 'Coin Thief', e: '💰', c: 7, d: 'Steal 5 🪙 from the richest rival' },
};
const rand = n => Math.random() * n | 0;

export class Board {
  constructor(o) {
    this.o = o; this.active = false; this.s = null; this.objs = []; this.anims = []; this.monT = null; this.mon = null; this.hot = []; this.mapView = false; this.undo = null; this.camInit = false; this.starY = 0;
    o.net.on('board', d => this.apply(d));
    o.net.on('roll', (_, from) => this.roll(from));
    o.net.on('act', (d, from) => this.act(from, d));
    addEventListener('keydown', e => { if (e.code === 'Space' && !e.repeat && !/INPUT|SELECT/.test(e.target.tagName)) this.tryRoll(); });
    addEventListener('keydown', e => { if (e.code === 'KeyV' && !e.repeat && this.active && !/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) { this.mapView = !this.mapView; this.render(); } });   // V = toggle the whole-map camera
    document.getElementById('board').onclick = e => {
      const b = e.target.closest('button'); if (!b || b.disabled) return;
      if (b.id === 'roll') this.tryRoll();
      else if (b.dataset.a === 'force') { if (o.net.isHost) this.force(); }
      else if (b.dataset.a) o.net.isHost ? this.act('host', { a: b.dataset.a, k: b.dataset.k }) : o.net.send('act', { a: b.dataset.a, k: b.dataset.k });
    };
  }
  // ---- robustness: a cosmetic exception must never freeze the turn flow or stop the HUD from drawing
  later(f, ms) { setTimeout(() => { try { f(); } catch (e) { this.fail('turn', e); } }, ms); }
  safe(tag, f) { try { return f(); } catch (e) { this.fail(tag, e); } }
  fail(tag, e) {
    console.error('[board ' + tag + ']', e); this.o.onError?.(tag + ': ' + (e?.message || e));
    if (tag === 'turn' && this.active && this.o.net.isHost) { try { this.nextTurn(); } catch (e2) { console.error(e2); } }     // a broken turn is skipped instead of hanging the game
  }
  // ---- turn timer (every client shows it, the host enforces it) + host override
  clock(dt) {
    if (this.tl == null || !this.active || this.o.world.stageUp > 0) return;
    this.tl -= dt;
    const el = document.getElementById('board'), sp = el?.querySelector?.('#tl'); if (sp) sp.textContent = Math.max(0, Math.ceil(this.tl));
    if (this.tl <= 0) { this.tl = null; if (this.o.net.isHost) this.safe('force', () => this.force()); }
  }
  force() {              // host: do the default action for whoever is up (roll / random path / leave the shop)
    const s = this.s, id = s?.order[s.turn]; if (!this.active || !this.o.net.isHost || !id) return;
    if (s.phase === 'roll') this.roll(id);
    else if (s.phase === 'choose') this.act(id, { a: 'go', k: s.opts[rand(s.opts.length)] });
    else if (s.phase === 'shop' || s.phase === 'slot') this.act(id, { a: 'leave' });
  }
  // ---- both sides
  tryRoll() {
    const { net } = this.o, s = this.s;
    if (!this.active || s.phase !== 'roll' || s.order[s.turn] !== net.id) return;
    net.isHost ? this.roll('host') : net.send('roll');
  }
  apply(d) {
    if (d.off) return this.teardown();
    if (d.board) setBoard(d.board);
    const pv = this.prev; this.s = d;
    if (!this.active) { this.active = true; this.safe('build', () => this.build()); }
    this.safe('place', () => { if (!(this.o.world.stageUp > 0)) for (const id of d.order) this.o.world.set(id, ...this.place(id)); });      // (a minigame stage owns the players' positions while it's up)
    this.safe('star', () => { const [sx, sz] = B.spot(d.star); this.star.position.x = sx; this.star.position.z = sz; this.starY = B.y(d.star); if (d.mon >= 0 && this.mon) this.monT = [...B.spot(d.mon), B.y(d.mon)]; });
    this.hot = d.hot || [];
    this.safe('sky', () => this.o.world.setSky(B.sky ? (B.skyFixed ?? (Math.min(d.round, d.rounds) - 1) / Math.max(1, d.rounds - 1)) : null));
    if (pv) this.safe('fx', () => this.diff(pv, d)); this.prev = JSON.parse(JSON.stringify(d));
    { const live = ['roll', 'choose', 'shop', 'slot'].includes(d.phase) && d.limit && !this.o.players()[d.order[d.turn]]?.bot; this.tl = live ? d.limit : null; }
    this.safe('hud', () => this.render()); this.safe('change', () => this.o.onChange());
  }
  diff(a, b) {
    const f = this.o.fx; if (!f) return;
    if (b.phase === 'moving' && a.phase !== 'moving') f('roll', b.roll);
    for (const id of b.order) {
      if (a.pos[id] !== undefined && a.pos[id] !== b.pos[id] && b.phase === 'moving') { f('step', id); this.o.world.hop(id, .4); }      // every step is a little hop
      if (a.coins[id] === undefined) continue;
      if (b.stars[id] > a.stars[id]) { f('star', id); this.o.world.emote(id, 'cheer'); this.o.world.popIcon(id, '⭐'); }
      else if (b.coins[id] > a.coins[id]) { f('coin', id); this.o.world.popIcon(id, '🪙'); }
      else if (b.coins[id] < a.coins[id]) { f(b.phase === 'shop' ? 'click' : 'lose', id); if (b.phase !== 'shop') this.o.world.popIcon(id, '💸'); }
    }
    if (b.phase === 'end' && a.phase !== 'end') f('win', b.winner);
    if (b.hot?.length && JSON.stringify(a.hot) !== JSON.stringify(b.hot)) f('erupt');
    if (b.phase === 'minigame' && a.phase !== 'minigame' && b.mega) f('mega');
  }
  place(id) {
    const s = this.s, i = s.pos[id], [x, z] = B.spot(i), at = s.order.filter(k => s.pos[k] === i), k = at.indexOf(id);
    const a = k / at.length * Math.PI * 2, off = at.length > 1 ? .7 : 0;
    return [x + Math.cos(a) * off, z + Math.sin(a) * off, B.y(i)];
  }
  build() {
    const W = this.o.world, sc = W.scene, add = m => { sc.add(m); this.objs.push(m); W.deco.push(m); return m; }, anim = f => { W.anim.push(f); this.anims.push(f); };
    const std = (c, o) => new THREE.MeshStandardMaterial({ color: c, flatShading: true, ...o });
    if (B.ground) W.setIsland(false);        // the board brings its own terrain: no green lobby island underneath
    B.sp.forEach(p => p.next.forEach(j => {   // paths: 3D ribbons that follow the terrain (wooden planks on bridges)
      const q = B.sp[j], py = p.y || 0, qy = q.y || 0, dx = q.x - p.x, dz = q.z - p.z, br = p.bridge || q.bridge;
      const m = add(new THREE.Mesh(new THREE.BoxGeometry(br ? 1.7 : .7, .08, Math.hypot(dx, qy - py, dz)), std(br ? 0x9a6b3a : 0xd9c9a3)));
      m.position.set((p.x + q.x) / 2, (py + qy) / 2 + .07, (p.z + q.z) / 2); m.lookAt(q.x, qy + .07, q.z);
    }));
    const tiles = B.sp.map(p => {
      const g = new THREE.Group(), hex = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, .3, 6), std(COL[p.type])); hex.position.y = .15; g.add(hex); g.userData.hex = hex;
      const ic = this.icon(p.type, std); if (ic) { g.add(ic); g.userData.ic = ic; }
      g.position.set(p.x, p.y || 0, p.z); return add(g);
    });
    anim((dt, t) => tiles.forEach((g, i) => {
      g.position.y = (B.sp[i].y || 0) + Math.sin(t * 2 + i * .7) * .04 + .02; const ic = g.userData.ic; if (ic?.userData.spin) ic.rotation.y += dt * 2;
      const hot = this.hot.includes(i), m = g.userData.hex.material; m.emissive.setHex(hot ? 0xff3300 : 0); m.emissiveIntensity = hot ? .6 + .4 * Math.sin(t * 7) : 0;
    }));
    this.star = add(new THREE.Mesh(new THREE.IcosahedronGeometry(.6, 0), std(0xffd93d, { emissive: 0x665500 })));
    anim((dt, t) => { this.star.position.y = this.starY + 1.8 + Math.sin(t * 3) * .2; this.star.rotation.y += dt * 2; });
    this.undo = B.decor?.(W, add, anim) || null;
    if (B.monster) {
      const g = new THREE.Group(), body = new THREE.Mesh(new THREE.IcosahedronGeometry(.9, 0), std(0x6c3483)); body.position.y = 1; g.add(body);
      for (const k of [-1, 1]) {
        const e = new THREE.Mesh(new THREE.IcosahedronGeometry(.18, 0), new THREE.MeshBasicMaterial({ color: 0xffffff })); e.position.set(k * .3, 1.2, .7); g.add(e);
        const h = new THREE.Mesh(new THREE.ConeGeometry(.15, .5, 4), std(0xf1c40f)); h.position.set(k * .5, 1.9, 0); g.add(h);
      }
      this.mon = add(g); const [mx, mz] = B.spot(B.monster.start), my = B.y(B.monster.start); g.position.set(mx, my, mz); this.monT = [mx, mz, my]; this.monY = my;
      anim((dt, t) => { const k = Math.min(1, dt * 2), m = this.mon; if (!m || !this.monT) return; m.position.x += (this.monT[0] - m.position.x) * k; m.position.z += (this.monT[1] - m.position.z) * k; this.monY += (this.monT[2] - this.monY) * k; m.position.y = this.monY + Math.abs(Math.sin(t * 5)) * .25; m.rotation.y = Math.sin(t) * .4; });
    }
    // fork markers: bobbing arrows above each way you can choose
    const arrows = [0, 1, 2].map(() => { const a = add(new THREE.Mesh(new THREE.ConeGeometry(.5, 1.2, 4), std(0xffd93d, { emissive: 0x886600 }))); a.visible = false; return a; });
    anim((dt, t) => { const s = this.s, show = s?.phase === 'choose' && s.opts; arrows.forEach((a, k) => { const o = show ? s.opts[k] : undefined; a.visible = o !== undefined && W.decoOn; if (o !== undefined) { const [x, z] = B.spot(o); a.position.set(x, B.y(o) + 2.7 + Math.sin(t * 5 + k) * .25, z); a.rotation.set(Math.PI, t * 2, 0); } }); });
    // follow camera
    this.camInit = false; const cam = dt => this.camStep(dt); W.anim.push(cam); this.anims.push(cam);
  }
  icon(t, std) {
    const g = new THREE.Group(); g.position.y = .3;
    if (t === 'shop') { const b = new THREE.Mesh(new THREE.BoxGeometry(.7, .5, .7), std(0xffe0b2)); b.position.y = .25; const r = new THREE.Mesh(new THREE.ConeGeometry(.65, .45, 4), std(0xc0392b)); r.position.y = .72; r.rotation.y = Math.PI / 4; g.add(b, r); }
    else if (t === 'green') { const o = new THREE.Mesh(new THREE.OctahedronGeometry(.35), std(0xffffff, { emissive: 0x2ecc71 })); o.position.y = .7; g.add(o); g.userData.spin = 1; }
    else if (t === 'warp') { const o = new THREE.Mesh(new THREE.TorusGeometry(.45, .1, 6, 12), std(0xffffff, { emissive: 0x00cec9 })); o.position.y = .7; o.rotation.x = Math.PI / 2.4; g.add(o); g.userData.spin = 1; }
    else if (t === 'toll') { for (const k of [-.5, .5]) { const p = new THREE.Mesh(new THREE.BoxGeometry(.15, .8, .15), std(0x6d4c1d)); p.position.set(k, .4, 0); g.add(p); } const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, .12, .12), std(0xffffff)); bar.position.y = .8; g.add(bar); }
    else if (t === 'dash') { for (const k of [-.3, .3]) { const c = new THREE.Mesh(new THREE.ConeGeometry(.3, .6, 4), std(0xffffff, { emissive: 0xffc800 })); c.rotation.z = -Math.PI / 2; c.position.set(k, .5, 0); g.add(c); } }
    else if (t === 'thief') { const sk = new THREE.Mesh(new THREE.SphereGeometry(.36, 10, 8), std(0x2d3436)); sk.position.y = .36; sk.scale.y = 1.1; const tie = new THREE.Mesh(new THREE.ConeGeometry(.16, .3, 6), std(0x2d3436)); tie.position.y = .85; const co = new THREE.Mesh(new THREE.CylinderGeometry(.18, .18, .05, 10), std(0xffd93d, { emissive: 0x886600 })); co.position.set(0, .45, .36); co.rotation.x = Math.PI / 2; g.add(sk, tie, co); }
    else if (t === 'swap') { for (const [c, r] of [[0xfd79a8, 0], [0x00cec9, Math.PI / 2]]) { const o = new THREE.Mesh(new THREE.TorusGeometry(.38, .09, 6, 14), std(0xffffff, { emissive: c })); o.position.y = .65; o.rotation.set(Math.PI / 2.4, r, 0); g.add(o); } g.userData.spin = 1; }
    else if (t === 'geyser') { const v = new THREE.Mesh(new THREE.CylinderGeometry(.3, .5, .3, 8), std(0x7f8c8d)); v.position.y = .15; g.add(v); for (let k = 0; k < 3; k++) { const p = new THREE.Mesh(new THREE.IcosahedronGeometry(.22 - k * .04, 0), std(0xffffff, { emissive: 0x5dade2, transparent: true, opacity: .75 })); p.position.y = .5 + k * .38; g.add(p); } g.userData.spin = 1; }
    else if (t === 'forge') { const a = new THREE.Mesh(new THREE.BoxGeometry(.75, .3, .45), std(0x2d3436)); a.position.y = .15; const top = new THREE.Mesh(new THREE.BoxGeometry(.95, .2, .4), std(0x4a4f55)); top.position.y = .42; const gl = new THREE.Mesh(new THREE.BoxGeometry(.5, .08, .3), std(0xffffff, { emissive: 0xff6a00 })); gl.position.y = .55; g.add(a, top, gl); }
    else if (t === 'vent') { const c = new THREE.Mesh(new THREE.ConeGeometry(.5, .8, 6), std(0x3a2f2f)); c.position.y = .4; const m = new THREE.Mesh(new THREE.CylinderGeometry(.18, .18, .1, 8), std(0xffffff, { emissive: 0xff3300 })); m.position.y = .78; g.add(c, m); }
    else if (t === 'knight' || t === 'queen' || t === 'bishop' || t === 'king') {       // little chess pieces: white with a glow in the square's colour
      const pm = std(0xf4f4f0, { emissive: COL[t], emissiveIntensity: .35 }), base = new THREE.Mesh(new THREE.CylinderGeometry(.34, .4, .12, 10), pm); base.position.y = .06; g.add(base);
      const body = new THREE.Mesh(new THREE.ConeGeometry(.28, t === 'queen' || t === 'king' ? .85 : .65, 10), pm); body.position.y = .5; g.add(body);
      if (t === 'knight') { const h = new THREE.Mesh(new THREE.BoxGeometry(.22, .4, .5), pm); h.position.set(0, .88, .1); h.rotation.x = -.5; g.add(h); }
      else if (t === 'bishop') { const h = new THREE.Mesh(new THREE.SphereGeometry(.2, 8, 6), pm); h.position.y = .95; g.add(h); }
      else { const h = new THREE.Mesh(new THREE.SphereGeometry(.2, 8, 6), pm); h.position.y = 1; g.add(h); if (t === 'king') { const a = new THREE.Mesh(new THREE.BoxGeometry(.1, .3, .1), pm), b = new THREE.Mesh(new THREE.BoxGeometry(.28, .1, .1), pm); a.position.y = 1.3; b.position.y = 1.3; g.add(a, b); } else for (let k = 0; k < 5; k++) { const c = new THREE.Mesh(new THREE.ConeGeometry(.05, .2, 4), pm), an = k / 5 * Math.PI * 2; c.position.set(Math.cos(an) * .17, 1.2, Math.sin(an) * .17); g.add(c); } }
    }
    else if (t === 'roulette') { const w = new THREE.Mesh(new THREE.CylinderGeometry(.5, .55, .18, 14), std(0x0b6e4f)); w.position.y = .12; const r = new THREE.Mesh(new THREE.TorusGeometry(.34, .06, 6, 14), std(0xffd93d, { emissive: 0x665500 })); r.rotation.x = Math.PI / 2; r.position.y = .25; const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(.07, 0), std(0xffffff, { emissive: 0xffffff })); ball.position.set(.3, .3, 0); g.add(w, r, ball); g.userData.spin = 1; }
    else if (t === 'jackpot') { for (let k = 0; k < 3; k++) { const c = new THREE.Mesh(new THREE.CylinderGeometry(.3, .3, .07, 10), std(0xffd93d, { emissive: 0xaa7a00 })); c.position.y = .1 + k * .1; c.position.x = (k - 1) * .05; g.add(c); } const st = new THREE.Mesh(new THREE.OctahedronGeometry(.3), std(0xffffff, { emissive: 0xffd000 })); st.position.y = .9; g.add(st); g.userData.spin = 1; }
    else if (t === 'metro') { const b = new THREE.Mesh(new THREE.BoxGeometry(.9, .12, .6), std(0x34495e)); b.position.y = .06; const roof = new THREE.Mesh(new THREE.BoxGeometry(.9, .1, .6), std(0x3498db, { emissive: 0x0b4a8a })); roof.position.y = .9; for (const k of [-.4, .4]) { const p = new THREE.Mesh(new THREE.BoxGeometry(.08, .85, .08), std(0x95a5a6)); p.position.set(k, .48, 0); g.add(p); } g.add(b, roof); }
    else if (t === 'slot') {
      const b = new THREE.Mesh(new THREE.BoxGeometry(.7, .9, .5), std(0xff2d95, { emissive: 0x660033 })); b.position.y = .45;
      const l = new THREE.Mesh(new THREE.CylinderGeometry(.04, .04, .5, 5), std(0xdddddd)); l.position.set(.45, .55, 0); l.rotation.z = -.4;
      const sc = new THREE.Mesh(new THREE.BoxGeometry(.5, .25, .05), std(0xffffff, { emissive: 0x888888 })); sc.position.set(0, .6, .27); g.add(b, l, sc);
    }
    else if (t === 'duel') { for (const k of [-1, 1]) { const w = new THREE.Mesh(new THREE.BoxGeometry(.12, .9, .12), std(0xdfe6e9)); w.position.y = .5; w.rotation.z = k * .6; g.add(w); } }
    else return null;
    return g;
  }
  teardown() {
    const W = this.o.world;
    this.prev = null; W.anim = W.anim.filter(f => !this.anims.includes(f)); this.anims = []; this.mon = null; W.setSky(null); this.undo?.(); this.undo = null;
    this.objs.forEach(m => { W.scene.remove(m); m.traverse(n => { n.geometry?.dispose(); (Array.isArray(n.material) ? n.material : [n.material]).forEach(x => x?.dispose()); }); });
    W.deco = W.deco.filter(o => !this.objs.includes(o)); this.objs = []; this.active = false; this.s = null; this.mapView = false;
    W.setIsland(true); W.resetCam(); for (const e of W.m.values()) { e.ty = undefined; e.by = 0; e.g.position.y = 0; }       // back to the flat lobby
    this.render(); this.o.onChange();
  }
  // Camera: follows whoever is acting (zooming out at forks to show every way), and shows the whole map between rounds / when V is held on.
  camStep(dt) {
    this.clock(dt);
    const W = this.o.world, s = this.s; if (!s || !B || W.stageUp > 0) return;
    const tn = Math.tan(W.cam.fov * Math.PI / 360), asp = W.cam.aspect || 16 / 9, b = B.bounds;
    const overview = () => { const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, d = Math.max((b.x1 - b.x0) / 2 / (tn * asp), (b.z1 - b.z0) / 2 * .85 / tn) * 1.05; return [[cx, d * .8, cz + d * .6], [cx, 0, cz]]; };
    const cur = s.order[s.turn], e = W.m.get(cur), acting = ['roll', 'moving', 'choose', 'shop', 'slot'].includes(s.phase) && e && !this.mapView;
    let P, L;
    if (acting) {
      const H = B.cam?.h ?? 9.5, K = B.cam?.back ?? 8; let fx = e.g.position.x, fz = e.g.position.z, spread = 0; const fy = e.by || 0;
      if (s.phase === 'choose' && s.opts) { const pts = [[fx, fz], ...s.opts.map(i => B.spot(i))]; const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cz = pts.reduce((a, p) => a + p[1], 0) / pts.length; spread = Math.max(...pts.map(p => Math.hypot(p[0] - cx, p[1] - cz))); fx = cx; fz = cz; }
      P = [fx, fy + H + spread * .9, fz + K + spread * .7]; L = [fx, fy + .6, fz - 1.2];
    } else [P, L] = overview();
    if (!this.camInit) { const [P0, L0] = overview(); W.camPos.set(...P0); W.camLook.set(...L0); this.camInit = true; }      // start from the overview, then swoop in
    W.camTw = null; const kp = 1 - Math.exp(-dt * 2.4), kl = 1 - Math.exp(-dt * 3.4);
    W.camPos.x += (P[0] - W.camPos.x) * kp; W.camPos.y += (P[1] - W.camPos.y) * kp; W.camPos.z += (P[2] - W.camPos.z) * kp;
    W.camLook.x += (L[0] - W.camLook.x) * kl; W.camLook.y += (L[1] - W.camLook.y) * kl; W.camLook.z += (L[2] - W.camLook.z) * kl;
  }
  render() {
    const el = document.getElementById('board'), s = this.s; el.hidden = !this.active; if (!this.active) return;
    const ps = this.o.players(), cur = s.order[s.turn], me = this.o.net.id, esc = this.o.esc, mine = cur === me;
    const nm = id => esc(ps[id]?.name ?? '?'), inv = s.items[me] || [], coins = s.coins[me];
    let act = '';
    if (mine && s.phase === 'roll') act = '<button id="roll">🎲 Roll (Space)</button>' + inv.filter(k => !ITEMS[k].p).map(k => `<button data-a="use" data-k="${k}">${ITEMS[k].e} Use ${ITEMS[k].n}</button>`).join('');
    if (mine && s.phase === 'shop') act = '<b>🛒 Shop</b>' + (s.stock || []).map(k => { const t = ITEMS[k]; return `<button data-a="buy" data-k="${k}"${coins < t.c || inv.length >= MAXI ? ' disabled' : ''}>${t.e} ${t.n} (${t.c}🪙)<br><small>${t.d}</small></button>`; }).join('') + '<button data-a="leave">Leave shop</button>';
    if (mine && s.phase === 'slot') act = '<b>🎰 Slot machine</b>' + [3, 6, 10].map(b => `<button data-a="bet" data-k="${b}"${coins < b ? ' disabled' : ''}>Bet ${b} 🪙</button>`).join('') + '<button data-a="leave">Walk away</button>';
    if (mine && s.phase === 'choose') act = '<b>🔀 Choose your path</b>' + s.opts.map(k => `<button data-a="go" data-k="${k}">${B.sp[k].label || 'Go this way'}</button>`).join('');
    if (this.o.net.isHost && !mine && ['roll', 'choose', 'shop', 'slot'].includes(s.phase) && !ps[cur]?.bot) act = `<button data-a="force">⏩ ${s.phase === 'roll' ? 'Roll for' : 'Skip'} ${nm(cur)}</button>`;     // host override: nobody has to wait for an AFK player
    el.innerHTML = `<b>${B.name} · Round ${Math.min(s.round, s.rounds)} / ${s.rounds}</b>${B.sp.some(p => p.type === 'jackpot') ? ' · 💰 Jackpot ' + (s.pot ?? 0) : ''} <small style="opacity:.7">[V] ${this.mapView ? 'follow player' : 'map view'}</small>` + (this.tl != null ? ` <b>⏱ <span id="tl">${Math.max(0, Math.ceil(this.tl))}</span>s</b>` : '') +
      s.order.map(id => `<div style="color:${ps[id]?.color}">${id === cur && (s.phase === 'roll' || s.phase === 'shop' || s.phase === 'choose' || s.phase === 'slot') ? '▶ ' : ''}${nm(id)} 🪙${s.coins[id]} ⭐${s.stars[id]} ${(s.items[id] || []).map(k => ITEMS[k].e).join('')}</div>`).join('') +
      `<div>${s.log}</div>` + (s.phase === 'end' ? `<h3>🏆 ${nm(s.winner)} wins!</h3>` : '') + act +
      `<div style="font-size:11px;opacity:.65;margin-top:6px">🔵+3 🔴−3 🟢event 🟣shop 🟠duel ⚡dash 🦹thief 🔄swap 🎰slots${B.sp.some(p => p.type === 'vent') ? ' 💨geyser 🔨forge 🌋vent' : ''}${B.sp.some(p => p.type === 'jackpot') ? ' 🎡roulette 💰jackpot 🚇metro' : ''}${B.sp.some(p => p.type === 'king') ? ' ♞fork ♛roll-again ♝shield ♚check' : ''} · ⭐ = walk onto it with 20🪙 to buy</div>`;
  }
  // ---- host only
  push() { this.apply(this.s); this.o.net.broadcast('board', this.s); this.safe('bot', () => this.botTurn()); }
  botTurn() {
    const s = this.s, id = s?.order[s.turn]; if (!this.active || !this.o.players()[id]?.bot) return;
    if (s.phase === 'roll') this.later(() => this.roll(id), 900); else if (s.phase === 'shop') this.later(() => this.act(id, { a: 'leave' }), 700);
    else if (s.phase === 'slot') this.later(() => this.act(id, s.coins[id] >= 15 ? { a: 'bet', k: 3 } : { a: 'leave' }), 800);
    else if (s.phase === 'choose') { const o = s.opts; this.later(() => this.act(id, { a: 'go', k: o[rand(o.length)] }), 700); }
  }
  start(rounds, board = 'grove', limit = 0) {
    setBoard(board); const ps = this.o.players(), order = Object.keys(ps), s = { board, pot: 8, rounds, limit: +limit || 0, round: 1, turn: 0, order, pos: {}, coins: {}, stars: {}, items: {}, next: {}, phase: 'roll', star: B.starSpots[rand(B.starSpots.length)], mon: B.monster ? B.monster.start : -1, hot: [], log: 'Game start!' };
    order.forEach(id => { s.pos[id] = 0; s.coins[id] = 10; s.stars[id] = 0; s.items[id] = []; s.next[id] = null; });
    this.s = s; this.push();
  }
  quit() { this.o.net.broadcast('board', { off: true }); this.apply({ off: true }); }
  name(id) { return this.o.esc(this.o.players()[id]?.name ?? '?'); }
  roll(id) {
    const s = this.s; if (!this.active || !this.o.net.isHost || s.phase !== 'roll' || s.order[s.turn] !== id) return;
    const m = s.next[id]; s.next[id] = null;
    let left = m === 'big' ? 4 + rand(5) : m === 'dbl' ? 2 + rand(6) + rand(6) : 1 + rand(6);
    s.roll = left; s.phase = 'moving'; s.log = `${this.name(id)} rolled ${left}!`; this.push();
    this.later(() => this.walk(id, left), 500);
  }
  walk(id, left) {       // advance one space at a time; forks pause for a choice
    const s = this.s; if (!this.active) return;
    if (left <= 0) return void this.later(() => this.land(id), 450);
    const nx = B.sp[s.pos[id]].next;
    if (nx.length > 1) { s.phase = 'choose'; s.opts = nx; s.left = left; s.log = `${this.name(id)} reached a fork!`; return this.push(); }
    this.stepTo(id, nx[0], left);
  }
  stepTo(id, to, left) {
    const s = this.s, me = this.name(id); s.pos[id] = to;
    if (B.type(to) === 'toll') { const n = Math.min(3, s.coins[id]); s.coins[id] -= n; s.log = `${me} paid the bridge toll: -${n} 🪙`; }
    if (to === s.star && s.coins[id] >= 20) { s.coins[id] -= 20; s.stars[id]++; s.star = this.newStar(to); s.log = `${me} bought a ⭐!`; }
    this.push(); this.later(() => this.walk(id, left - 1), 400);
  }
  newStar(cur) { const l = B.starSpots.filter(i => i !== cur); return l[rand(l.length)]; }
  ahead(p, n) { while (n-- > 0) p = B.sp[p].next[0]; return p; }
  heat() {             // volcano boards: each round a few tiles become scorching hot (landing costs coins)
    const s = this.s; if (!B.hazard) return '';
    const ok = B.sp.map((p, i) => ['blue', 'red', 'green'].includes(p.type) ? i : -1).filter(i => i >= 0); s.hot = [];
    while (s.hot.length < B.hazard.count) { const i = ok[rand(ok.length)]; if (!s.hot.includes(i)) s.hot.push(i); }
    return `🌋 The volcano erupts! ${B.hazard.count} tiles are scorching hot. `;
  }
  wander() {             // the Wanderer (grove only) stomps whoever it lands on at the end of each round
    const s = this.s; if (s.mon < 0) return '';
    for (let i = 0; i < 5; i++) s.mon = B.sp[s.mon].next[0];
    const hit = s.order.filter(id => s.pos[id] === s.mon); if (!hit.length) return '👹 The Wanderer lurks... ';
    return `👹 The Wanderer stomped ${hit.map(id => this.guard(id) ? `${this.name(id)} (🛡️ blocked)` : `${this.name(id)} (${this.addCoins(id, -5)} 🪙)`).join(', ')}! `;
  }
  land(id) {
    const s = this.s; if (!this.active) return;
    const t = B.type(s.pos[id]), me = this.name(id);
    if (s.hot?.includes(s.pos[id])) { const n = this.addCoins(id, -(B.hazard?.dmg || 6)); s.log = `🔥 ${me} landed on scorching lava! ${n} 🪙`; return this.nextTurn(); }
    if (t === 'green') s.log = this.event(id);
    else if (t === 'duel') s.log = this.duel(id);
    else if (t === 'shop') s.log = `${me} entered the shop`;
    else if (t === 'slot') s.log = `${me} sits down at the slot machine`;
    else if (t === 'toll') s.log = `${me} is crossing the bridge`;
    else if (t === 'dash') { s.log = `${me} hit a ⚡ dash pad: 3 free spaces!`; s.phase = 'moving'; this.push(); return void this.later(() => this.walk(id, 3), 600); }
    else if (t === 'geyser') { const n = 2 + rand(5); s.log = `💨 ${me} was blasted ${n} spaces forward by a geyser!`; s.phase = 'moving'; this.push(); return void this.later(() => this.walk(id, n), 600); }
    else if (t === 'forge') s.log = this.forge(id);
    else if (t === 'knight') s.log = this.fork(id);
    else if (t === 'queen') { s.log = `♛ ${me} makes the queen's move: roll again!`; s.phase = 'roll'; return this.push(); }
    else if (t === 'bishop') s.log = this.bless(id);
    else if (t === 'king') s.log = this.check(id);
    else if (t === 'roulette') s.log = this.roulette(id);
    else if (t === 'jackpot') s.log = this.jackpot(id);
    else if (t === 'metro') s.log = this.metro(id);
    else if (t === 'vent') s.log = this.vent(id);
    else if (t === 'thief') s.log = this.thief(id);
    else if (t === 'swap') s.log = this.swapPlaces(id);
    else if (t === 'warp') { const o = B.warps.find(k => k !== s.pos[id]); s.pos[id] = o; s.log = `${me} was warped across the island!`; }
    else { const d = Math.max(t === 'blue' ? 3 : -3, -s.coins[id]); s.coins[id] += d; s.log = `${me} landed on ${t}: ${d >= 0 ? '+' : ''}${d} 🪙`; }
    if (t === 'shop') { s.stock = Object.keys(ITEMS).sort(() => Math.random() - .5).slice(0, 3); s.phase = 'shop'; return this.push(); }
    if (t === 'slot') { s.phase = 'slot'; return this.push(); }
    this.nextTurn();
  }
  rival(id) { const o = this.s.order.filter(k => k !== id); return o.length ? o[rand(o.length)] : null; }
  fork(id) {             // ♞ a knight's fork: take up to 2 coins from each of two random rivals (shields block)
    const s = this.s, me = this.name(id), rv = s.order.filter(k => k !== id).sort(() => Math.random() - .5).slice(0, 2); if (!rv.length) return `♞ ${me} forks... nobody.`;
    let got = 0; const out = rv.map(v => { if (this.guard(v)) return `${this.name(v)} 🛡️`; const n = Math.min(2, s.coins[v]); s.coins[v] -= n; got += n; return this.name(v); }); s.coins[id] += got;
    return `♞ ${me} forks ${out.join(' and ')}: +${got} 🪙`;
  }
  bless(id) {            // ♝ the bishop blesses you with a shield (or 3 coins if your bag is full)
    const s = this.s, me = this.name(id), inv = s.items[id] ??= []; if (inv.length >= MAXI) { s.coins[id] += 3; return `♝ ${me}'s bag is full, so the bishop gives +3 🪙 instead.`; }
    inv.push('shield'); return `♝ ${me} was blessed with a 🛡️ shield!`;
  }
  check(id) {            // ♚ CHECK! take up to 4 coins from the richest rival (a shield blocks it)
    const s = this.s, me = this.name(id), rv = s.order.filter(k => k !== id).sort((a, b) => s.coins[b] - s.coins[a])[0]; if (rv == null) return `♚ ${me} declares check... on nobody.`;
    if (this.guard(rv)) return `♚ ${me} puts ${this.name(rv)} in check, but 🛡️ blocked it!`;
    const n = Math.min(4, s.coins[rv]); s.coins[rv] -= n; s.coins[id] += n; return `♚ CHECK! ${me} takes ${n} 🪙 from the richest rival, ${this.name(rv)}.`;
  }
  roulette(id) {         // 🎡 spin: mostly small wins, sometimes a loss, rarely a big one
    const s = this.s, me = this.name(id), r = Math.random(), d = r < .08 ? 12 : r < .4 ? 6 : r < .6 ? 0 : r < .9 ? -4 : -8, n = Math.max(d, -s.coins[id]); s.coins[id] += n;
    return `🎡 ${me} spins the roulette wheel... ${n > 0 ? 'wins +' + n : n < 0 ? 'loses ' + n : 'the ball lands on zero'}${n ? ' 🪙' : '!'}`;
  }
  jackpot(id) {          // 💰 the shared pot grows every round; whoever lands here takes it all
    const s = this.s, me = this.name(id), pot = s.pot ?? 0; s.pot = 0; s.coins[id] += pot; return `💰 JACKPOT! ${me} wins the pot: +${pot} 🪙 (it starts growing again)`;
  }
  metro(id) {            // 🚇 ride to another metro station
    const s = this.s, me = this.name(id), st = B.sp.map((p, i) => p.type === 'metro' ? i : -1).filter(i => i >= 0 && i !== s.pos[id]); if (!st.length) return `${me} waits for a train that never comes.`;
    s.pos[id] = st[rand(st.length)]; return `🚇 ${me} rode the metro to another station!`;
  }
  forge(id) {            // 🔨 pay 5 coins, get a random item (needs room in the inventory)
    const s = this.s, me = this.name(id), inv = s.items[id] ??= [];
    if (s.coins[id] < 5) return `🔨 ${me} found a forge, but can't afford the 5🪙 fee.`; if (inv.length >= MAXI) return `🔨 ${me} found a forge, but their bag is full.`;
    const k = Object.keys(ITEMS)[rand(Object.keys(ITEMS).length)]; s.coins[id] -= 5; inv.push(k); return `🔨 ${me} paid 5🪙 at the forge and got ${ITEMS[k].e} ${ITEMS[k].n}!`;
  }
  vent(id) {             // 🌋 the vent erupts: scorching tiles re-roll, and the ash rains on every rival (-2 each, the lander keeps it)
    const s = this.s, me = this.name(id); let got = 0; const hit = [];
    for (const v of s.order) { if (v === id) continue; if (this.guard(v)) { hit.push(`${this.name(v)} 🛡️`); continue; } const n = Math.min(2, s.coins[v]); s.coins[v] -= n; got += n; hit.push(this.name(v)); }
    s.coins[id] += got; const h = this.heat(); return `🌋 ${me} set off an eruption vent! ${h}Ash rains on ${hit.join(', ') || 'nobody'}: +${got} 🪙 for ${me}.`;
  }
  thief(id) {            // 🦹 steal up to 5 coins from a random rival (a shield blocks it)
    const me = this.name(id), v = this.rival(id); if (!v) return `${me} found a thief's den, but nobody to rob.`;
    if (this.guard(v)) return `${me} tried to rob ${this.name(v)}, but 🛡️ blocked it!`;
    const n = Math.min(5, this.s.coins[v]); this.s.coins[v] -= n; this.s.coins[id] += n; return `🦹 ${me} robbed ${this.name(v)}! +${n} 🪙`;
  }
  swapPlaces(id) {       // 🔄 trade places with a random rival (a shield blocks it)
    const s = this.s, me = this.name(id), v = this.rival(id); if (!v) return `${me} stepped on a swap pad, but nobody to swap with.`;
    if (this.guard(v)) return `${me} tried to swap with ${this.name(v)}, but 🛡️ blocked it!`;
    [s.pos[id], s.pos[v]] = [s.pos[v], s.pos[id]]; return `🔄 ${me} swapped places with ${this.name(v)}!`;
  }
  addCoins(id, n) { const s = this.s; n = Math.max(n, -s.coins[id]); s.coins[id] += n; return n; }
  guard(v) { const i = this.s.items[v].indexOf('shield'); if (i < 0) return false; this.s.items[v].splice(i, 1); return true; }
  event(id) {
    const s = this.s, me = this.name(id), C = n => `${n >= 0 ? '+' : ''}${n} 🪙`, keys = Object.keys(ITEMS);
    const evs = [
      () => `${me} found treasure! ${C(this.addCoins(id, 8))}`,
      () => `${me} paid taxes. ${C(this.addCoins(id, -4))}`,
      () => `${me} got a bonus! ${C(this.addCoins(id, 5))}`,
      () => { const inv = s.items[id]; if (inv.length >= MAXI) return `${me} found a gift but had no room!`; const k = keys[rand(keys.length)]; inv.push(k); return `${me} found a gift: ${ITEMS[k].e} ${ITEMS[k].n}!`; },
      () => { s.order.forEach(k => this.addCoins(k, 3)); return 'Festival! Everyone gets +3 🪙'; },
      () => { s.pos[id] = rand(B.n); return `${me} was teleported!`; },
      () => { s.star = this.newStar(s.star); return 'The ⭐ was shuffled to a new space!'; },
      () => this.guard(id) ? `${me}'s 🛡️ stopped a pickpocket!` : `${me} was pickpocketed! ${C(this.addCoins(id, -5))}`,
    ];
    return evs[rand(evs.length)]();
  }
  duel(id) {
    const s = this.s, me = this.name(id), rivals = s.order.filter(k => k !== id), v = rivals[rand(rivals.length)];
    if (v === undefined) return `${me} found no one to duel.`;
    let a, b, tries = 0; do { a = 1 + rand(6); b = 1 + rand(6); } while (a === b && ++tries < 5);
    if (a === b) return `${me} and ${this.name(v)} tied a duel!`;
    const [w, l] = a > b ? [id, v] : [v, id], n = Math.min(5, s.coins[l]); s.coins[l] -= n; s.coins[w] += n;
    return `⚔️ ${me} (${a}) vs ${this.name(v)} (${b}): ${this.name(w)} wins ${n} 🪙`;
  }
  nextTurn() {
    const s = this.s; if (++s.turn >= s.order.length) return this.endRound();
    s.phase = 'roll'; this.push();
  }
  act(id, d) {
    const s = this.s; if (!this.active || !this.o.net.isHost || s.order[s.turn] !== id) return;
    const inv = s.items[id], t = ITEMS[d.k];
    if (d.a === 'leave' && (s.phase === 'shop' || s.phase === 'slot')) return this.nextTurn();
    if (d.a === 'bet' && s.phase === 'slot' && [3, 6, 10].includes(+d.k) && s.coins[id] >= +d.k) {
      const b = +d.k, r = Math.random(), mult = r < .55 ? -1 : r < .85 ? 1 : r < .97 ? 2 : 5, p = ['🍒', '🍋', '🔔', '⭐', '7️⃣'].sort(() => Math.random() - .5);
      const reel = mult === 5 ? '7️⃣7️⃣7️⃣' : mult === 2 ? p[0].repeat(3) : mult === 1 ? p[0] + p[0] + p[1] : p[0] + p[1] + p[2];
      s.coins[id] += b * mult; s.log = `🎰 ${this.name(id)} bet ${b} 🪙 ${reel} → ${mult > 0 ? '+' : ''}${b * mult} 🪙${mult === 5 ? ' JACKPOT!' : ''}`; return this.nextTurn();
    }
    if (d.a === 'go' && s.phase === 'choose' && s.opts.includes(+d.k)) { const left = s.left; s.phase = 'moving'; s.opts = null; return this.stepTo(id, +d.k, left); }
    if (d.a === 'buy' && s.phase === 'shop' && t && s.stock?.includes(d.k) && s.coins[id] >= t.c && inv.length < MAXI) {
      s.coins[id] -= t.c; inv.push(d.k); s.log = `${this.name(id)} bought ${t.n}`; return this.push();
    }
    if (d.a === 'use' && s.phase === 'roll' && inv.includes(d.k) && !t.p) {
      inv.splice(inv.indexOf(d.k), 1); const me = this.name(id), rivals = s.order.filter(k => k !== id);
      if (d.k === 'steal') {
        const v = rivals.filter(k => s.coins[k] > 0).sort((a, b) => s.coins[b] - s.coins[a])[0];
        if (!v) s.log = 'Nobody had coins to steal!';
        else if (this.guard(v)) s.log = `${me}'s theft was blocked by ${this.name(v)}'s 🛡️!`;
        else { const n = Math.min(5, s.coins[v]); s.coins[v] -= n; s.coins[id] += n; s.log = `${me} stole ${n} 🪙 from ${this.name(v)}!`; }
      } else if (d.k === 'magnet') { s.star = this.ahead(s.pos[id], 5 + rand(4)); s.log = `${me} pulled the ⭐ closer!`; }
      else if (d.k === 'swap') {
        const v = rivals[rand(rivals.length)];
        if (v === undefined) s.log = 'Nobody to swap with!';
        else if (this.guard(v)) s.log = `${me}'s swap was blocked by ${this.name(v)}'s 🛡️!`;
        else { [s.pos[id], s.pos[v]] = [s.pos[v], s.pos[id]]; s.log = `${me} swapped places with ${this.name(v)}!`; }
      } else { s.next[id] = d.k; s.log = `${me} used ${t.n}`; }
      this.push();
    }
  }
  endRound() {
    const s = this.s; s.turn = 0; s.phase = 'minigame'; s.mega = s.round % 4 === 0 || s.round === s.rounds; if (B.sp.some(p => p.type === 'jackpot')) s.pot = (s.pot ?? 0) + 4; const w = this.wander() + this.heat(); s.log = w + (s.mega ? '⭐ MEGA MINIGAME! The winner earns a star!' : 'Minigame time!'); this.push();
    this.later(() => { if (this.active) this.o.playMg(); }, 2000);
  }
  reward(i) { return this.s?.mega ? [20, 12, 6, 2][i] ?? 0 : REWARD[i] ?? 0; }
  addPlayer(id) {   // late join (host only): slots in at the end of the turn order with the average coin count
    if (!this.active || !this.o.net.isHost) return; const s = this.s;
    if (s.phase === 'end') return this.o.net.sendTo(id, 'board', s);
    if (s.order.includes(id)) return;
    const cs = s.order.map(k => s.coins[k]), avg = cs.length ? Math.round(cs.reduce((a, c) => a + c, 0) / cs.length) : 10;
    s.order.push(id); s.pos[id] = 0; s.coins[id] = Math.max(10, avg); s.stars[id] = 0; s.items[id] = []; s.next[id] = null;
    s.log = this.name(id) + ' joined the game!'; this.push();
  }
  onLeave(id) {
    if (!this.active || !this.o.net.isHost) return;
    const s = this.s, i = s.order.indexOf(id); if (i < 0) return;
    const wasCur = i === s.turn; s.order.splice(i, 1); if (i < s.turn) s.turn--;
    if (!s.order.length) return this.quit();
    if (s.phase === 'roll' || s.phase === 'shop' || s.phase === 'choose' || s.phase === 'slot') { if (s.turn >= s.order.length) return this.endRound(); if (wasCur) s.phase = 'roll'; }
    this.push();
  }
  // adj = { id: { m: reward multiplier, pen: coins lost when finishing in the bottom half } } (optional, e.g. Math Race difficulty)
  rewardFor(id, r, adj, n) { const a = adj?.[id], base = this.reward(r); if (!a) return base; return Math.round(base * (a.m ?? 1)) - (r >= Math.ceil((n || 4) / 2) ? (a.pen || 0) : 0); }
  onMgEnd(pl, rk = pl.map((_, i) => i), adj) {
    if (!this.active || !this.o.net.isHost) return; const s = this.s;
    pl.forEach((id, i) => { if (id in s.coins) { s.coins[id] = Math.max(0, s.coins[id] + this.rewardFor(id, rk[i], adj, pl.length)); if (s.mega && rk[i] === 0) s.stars[id]++; } });
    this.later(() => {
      if (!this.active) return;
      s.round++; s.mega = false; s.log = 'Minigame rewards paid!';
      if (s.round > s.rounds) {
        s.phase = 'end'; s.winner = [...s.order].sort((a, b) => s.stars[b] - s.stars[a] || s.coins[b] - s.coins[a])[0]; s.round = s.rounds;
      } else s.phase = 'roll';
      this.push();
    }, 4500);
  }
}
