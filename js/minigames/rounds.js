import * as THREE from 'three';
import { sfx } from '../sfx.js';
import { stage } from './stage.js';
import { starfield } from './kit.js';
// Set: neon rooftops at night. A layered skyline with lit windows behind the fighting platforms, a big moon, a glowing sign, and neon edges on every ledge.
// Rounds-style 2.5D shooter. Host simulates (fixed 60Hz), clients send input + render snapshots.
// First to NEED round wins. After every round everyone picks one of 3 random cards.
const CARDS = [
  { n: 'Big Rounds', d: '+40% damage, fires slower', f: s => { s.dmg *= 1.4; s.cd *= 1.15; } },
  { n: 'Rapid Fire', d: 'Much faster fire, -15% damage', f: s => { s.cd *= .65; s.dmg *= .85; } },
  { n: 'Tank', d: '+50% max health', f: s => { s.hp *= 1.5; } },
  { n: 'Speedy', d: '+25% move speed', f: s => { s.speed *= 1.25; } },
  { n: 'Double Jump', d: 'One extra jump', f: s => { s.jumps++; } },
  { n: 'Bouncy', d: 'Bullets bounce twice', f: s => { s.bn += 2; } },
  { n: 'Triple Shot', d: '+2 bullets, each weaker', f: s => { s.shots += 2; s.dmg *= .55; s.cd *= 1.2; } },
  { n: 'Vampire', d: 'Heal 50% of damage dealt', f: s => { s.ls += .5; } },
  { n: 'Fast Bullets', d: '+50% bullet speed', f: s => { s.bs *= 1.5; } },
  { n: 'Glass Cannon', d: '+80% damage, -40% health', f: s => { s.dmg *= 1.8; s.hp *= .6; } },
  { n: 'Sniper', d: '+100% bullet speed, +25% damage, slower fire', f: s => { s.bs *= 2; s.dmg *= 1.25; s.cd *= 1.3; } },
  { n: 'Featherweight', d: '+40% move speed, -25% health', f: s => { s.speed *= 1.4; s.hp *= .75; } },
  { n: 'Juggernaut', d: '+100% health, -20% move speed', f: s => { s.hp *= 2; s.speed *= .8; } },
  { n: 'Quick Hands', d: '20% faster fire', f: s => { s.cd *= .8; } },
  { n: 'Shotgun', d: '+4 bullets, much weaker each', f: s => { s.shots += 4; s.dmg *= .4; s.cd *= 1.4; } },
  { n: 'Leech', d: 'Heal 30% of damage, +15% health', f: s => { s.ls += .3; s.hp *= 1.15; } },
  { n: 'Hop Hop', d: '+2 jumps, -10% speed', f: s => { s.jumps += 2; s.speed *= .9; } },
  { n: 'Ricochet', d: 'Bullets bounce 4 more times, -20% damage', f: s => { s.bn += 4; s.dmg *= .8; } },
  { n: 'Berserker', d: '+25% damage, +15% speed, -20% health', f: s => { s.dmg *= 1.25; s.speed *= 1.15; s.hp *= .8; } },
  { n: 'Steady', d: '+25% health, 10% faster fire', f: s => { s.hp *= 1.25; s.cd *= .9; } },
];
// A wide rooftop: ground, two tiers of ledges (3.4 apart = one jump) and a small top perch.
const G0 = { x0: -22, x1: 22, top: 0, th: 3 };
const LAYOUTS = [                                                     // one is picked per game (shared seed, same on every client); ledges are 3.4 apart = one jump
  [{ x0: -22, x1: 22, top: 0, th: 3 }, { x0: -20, x1: -12, top: 3.4, th: .4 }, { x0: 12, x1: 20, top: 3.4, th: .4 }, { x0: -5, x1: 5, top: 3.4, th: .4 }, { x0: -13, x1: -6, top: 6.8, th: .4 }, { x0: 6, x1: 13, top: 6.8, th: .4 }, { x0: -3, x1: 3, top: 10.2, th: .4 }],
  [G0, { x0: -21, x1: -15, top: 3.4, th: .4 }, { x0: -14, x1: -8, top: 6.8, th: .4 }, { x0: -7, x1: -1, top: 10.2, th: .4 }, { x0: 15, x1: 21, top: 3.4, th: .4 }, { x0: 8, x1: 14, top: 6.8, th: .4 }, { x0: 1, x1: 7, top: 10.2, th: .4 }],     // staircases
  [G0, { x0: -18, x1: -11, top: 3.4, th: .4 }, { x0: 11, x1: 18, top: 3.4, th: .4 }, { x0: -8, x1: 8, top: 6.8, th: .4 }, { x0: -4, x1: 4, top: 10.2, th: .4 }, { x0: -22, x1: -17, top: 6.8, th: .4 }, { x0: 17, x1: 22, top: 6.8, th: .4 }],     // islands
  [G0, { x0: -21, x1: -16, top: 3.4, th: .4 }, { x0: -21, x1: -16, top: 6.8, th: .4 }, { x0: -21, x1: -16, top: 10.2, th: .4 }, { x0: 16, x1: 21, top: 3.4, th: .4 }, { x0: 16, x1: 21, top: 6.8, th: .4 }, { x0: 16, x1: 21, top: 10.2, th: .4 }, { x0: -5, x1: 5, top: 3.4, th: .4 }],   // towers
];
const NEED0 = 3, MAXR0 = 5;

export default {
  tiers: [{ n: 'Quick', m: .8, pen: 0, d: 'First to 2 wins (3 rounds max).' }, { n: 'Normal', m: 1, pen: 0, d: 'First to 3 wins (5 rounds max).', def: true }, { n: 'Marathon', m: 1.5, pen: 0, d: 'First to 5 wins (9 rounds max).' }],
  emotes: false, name: 'Rounds', desc: 'First to 3 round wins by default (5 rounds max; the vote can make it shorter or longer). After every round EVERYONE picks an upgrade card! A/D move, W/Space jump, mouse aims, click shoots.',
  create(ctx) {
    const NEED = [2, 3, 5][ctx.diff ?? 1], MAXR = [3, 5, 9][ctx.diff ?? 1];                  // chosen by the table vote
    const PL = LAYOUTS[ctx.rng() * LAYOUTS.length | 0];
    const W = ctx.world, ids = Object.keys(ctx.players), host = ctx.isHost, me = ctx.me, scene = W.scene;
    const S = stage(ctx, { sky: 0x0b0c24, fog: { color: 0x0b0c24, near: 45, far: 110 }, light: .8, sun: { color: 0xb0c0ff, intensity: .9, pos: [4, 14, 12] }, cam: { pos: [0, 7, 35], look: [0, 5.5, 0] }, camFrom: [0, 12, 54], camT: 1.4 });
    const objs = [], bm = [], vv = new THREE.Vector3();
    PL.forEach((p, i) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(p.x1 - p.x0, p.th, 3), new THREE.MeshStandardMaterial({ color: i ? 0x4b3f6b : 0x39405a, emissive: i ? 0x150a2a : 0x0a0d1a, flatShading: true }));
      m.position.set((p.x0 + p.x1) / 2, p.top - p.th / 2, 0); S.root.add(m); objs.push(m);
    });
    PL.forEach((p, i) => S.box(p.x1 - p.x0 + .05, .09, 3.05, i % 2 ? 0xff4dd8 : 0x4dd0e1, (p.x0 + p.x1) / 2, p.top - .05, 0, { basic: true }));               // neon ledge edges
    S.box(44.6, 14, 3.2, 0x151832, 0, -14, 0); for (let k = 0; k < 10; k++) { S.box(1.6, 1.1, 1.2, 0x2a2f55, -19.8 + k * 4.4, 0, -.7); if (k % 2) { S.cyl(.05, .05, 2.4, 0x8a90b0, -19.8 + k * 4.4, 1.1, -.7, { seg: 4 }); S.sph(.12, 0xff3b30, -19.8 + k * 4.4, 3.5, -.7, { basic: true, seg: 5 }); } }   // rooftop clutter
    S.sph(3.4, 0xfff2c0, 22, 22, -45, { basic: true }); starfield(S, 160, 75, 8);
    const skyline = (z, w, h, y, dark, seed) => {
      const sc = S.screen(w, h, 1024, 512); sc.mesh.position.set(0, y, z); sc.mesh.material.transparent = true; let s0 = seed; const r = () => (s0 = (s0 * 16807) % 2147483647) / 2147483647;
      sc.draw((c, cw, ch) => { c.clearRect(0, 0, cw, ch); let x = 0; while (x < cw) { const bw = 50 + r() * 90, bh = 120 + r() * 340; c.fillStyle = dark; c.fillRect(x, ch - bh, bw, bh); for (let wy = ch - bh + 14; wy < ch - 16; wy += 22) for (let wx = x + 8; wx < x + bw - 12; wx += 18) if (r() < .4) { c.fillStyle = ['#ffe9a0', '#7fe9ff', '#ff9ad8'][r() * 3 | 0]; c.fillRect(wx, wy, 8, 11); } x += bw + 4 + r() * 12; } });
    };
    skyline(-38, 130, 36, 16, '#0d0f2b', 7); skyline(-24, 100, 30, 12, '#161a40', 19);
    const sign = S.screen(8, 2, 512, 128); sign.mesh.position.set(-16, 14, -22); sign.draw((c, w, h) => { c.fillStyle = '#12020c'; c.fillRect(0, 0, w, h); c.strokeStyle = '#ff4dd8'; c.lineWidth = 8; c.strokeRect(8, 8, w - 16, h - 16); c.fillStyle = '#ff4dd8'; c.font = 'bold 76px sans-serif'; c.textAlign = 'center'; c.fillText('ROUNDS', w / 2, 92); });
    const aim = new THREE.Mesh(new THREE.SphereGeometry(.15, 4, 3), new THREE.MeshBasicMaterial({ color: 0xffffff })); S.root.add(aim);
    const el = document.createElement('div'); el.className = 'mg'; ctx.hud.append(el);

    // shared view state
    const hpPrev = {}; let prevBl = 0, phase = 'fight', round = 1, intro = 1.4, offers = {}, myPicked = 0, snap = null, bl = [], lastH = '', last = '', sendT = 0, acc = 0, simAcc = 0;
    const wins = {}; ids.forEach(id => wins[id] = 0);
    // host-only state
    const st = {}; let bullets = [], freeze = 1.4, ft = 0, picked = {}, pickT = 0, over = false;
    const mk = () => ({ hp: 100, dmg: 20, cd: .4, bs: 22, speed: 1, jumps: 0, bn: 0, shots: 1, ls: 0 });
    ids.forEach(id => st[id] = { st: mk(), x: 0, y: 0, vx: 0, vy: 0, hp: 100, alive: true, cd: 0, jl: 0, gr: false, inp: { x: 0, j: 0, a: 0, f: 0 }, jprev: 0, jumpReq: false, dealt: 0 });
    const spawn = () => ids.forEach((id, k) => { const s = st[id]; s.hp = s.st.hp; s.alive = true; s.x = -17 + 34 * (k + .5) / ids.length; s.y = 0; s.vx = s.vy = 0; s.cd = .3; s.jl = s.st.jumps; });
    spawn();

    // input
    const held = {}; let mx = 0, my = 0, fire = false;
    const kd = e => { held[e.code] = true; }, ku = e => { held[e.code] = false; };
    const pm = e => { mx = e.clientX / innerWidth * 2 - 1; my = -(e.clientY / innerHeight * 2 - 1); };
    const pd = e => { if (e.button === 0) fire = true; }, pu = () => { fire = false; };
    addEventListener('keydown', kd); addEventListener('keyup', ku); addEventListener('pointermove', pm); addEventListener('pointerdown', pd); addEventListener('pointerup', pu); addEventListener('blur', pu);
    el.onpointerdown = e => {
      const b = e.target.closest('[data-c]'); if (!b) return; e.stopPropagation();
      const c = +b.dataset.c; myPicked = round; host ? pick(me, c) : ctx.send({ k: 'pick', c });
    };
    const aimAngle = () => {
      const g = W.m.get(me)?.g; if (!g) return 0;
      vv.set(g.position.x, g.position.y + 1, 0).project(W.cam);
      return Math.atan2((my - vv.y) * innerHeight / 2, (mx - vv.x) * innerWidth / 2);
    };
    function applyInput(id, m) {
      const s = st[id]; if (!s) return;
      const j = m.j ? 1 : 0; if (j && !s.jprev) s.jumpReq = true; s.jprev = j;
      s.inp = { x: Math.max(-1, Math.min(1, +m.x || 0)), j, a: +m.a || 0, f: m.f ? 1 : 0 };
    }

    // ---- host logic
    function startRound() {
      phase = 'fight'; freeze = 1.4; intro = 1.4; ft = 0; bullets = []; picked = {}; offers = {}; spawn();
      ctx.send({ k: 'ph', phase, round, wins, offers });
    }
    function endRound(w) {
      if (w) wins[w]++;
      if ((w && wins[w] >= NEED) || round >= MAXR) {
        over = true; ctx.send(pack());
        return ctx.finish([...ids].sort((a, b) => wins[b] - wins[a] || st[b].dealt - st[a].dealt));
      }
      round++; const pickers = [...ids];                 // everyone picks a card after every round (winners too)
      if (!pickers.length) return startRound();
      phase = 'pick'; pickT = 14; picked = {}; offers = {};
      pickers.forEach(id => offers[id] = [...CARDS.keys()].sort(() => ctx.rng() - .5).slice(0, 3));
      ctx.send({ k: 'ph', phase, round, wins, offers });
    }
    function pick(id, c) {
      if (phase !== 'pick' || !offers[id] || picked[id] || !offers[id].includes(c)) return;
      CARDS[c].f(st[id].st); picked[id] = true;
      if (Object.keys(offers).every(k => picked[k])) startRound();
    }
    // bots (host only, Math.random): pick a target, keep ~8 away, jump toward higher ledges, aim with skill-based error
    const bb = {};
    function botThink(dt) {
      for (const id of ids) {
        if (!ctx.players[id]?.bot) continue; const s = st[id], sk = ctx.skill?.(id) ?? .5, b = bb[id] ??= { t: 0, dir: 0, j: 0, err: 0, pk: 0, burst: 0 };
        if (phase === 'pick') { if (offers[id] && !picked[id] && (b.pk += dt) > .8 + Math.random() * 2) { const o = offers[id]; pick(id, o[Math.random() * o.length | 0]); b.pk = 0; } continue; }
        if (phase !== 'fight' || !s.alive) continue;
        let tg = null, td = 1e9; for (const o of ids) { if (o === id || !st[o].alive) continue; const d = Math.hypot(st[o].x - s.x, st[o].y - s.y); if (d < td) { td = d; tg = st[o]; } }
        if (!tg) { applyInput(id, { x: 0, j: 0, a: 0, f: 0 }); continue; }
        if ((b.t -= dt) <= 0) {
          b.t = (.45 - .3 * sk) * (.7 + Math.random() * .6); const dx = tg.x - s.x, want = Math.abs(dx) > 11 ? Math.sign(dx) : Math.abs(dx) < 6 ? -Math.sign(dx) : (Math.random() < .5 ? 0 : Math.sign(dx) * (Math.random() < .5 ? 1 : -1));
          b.dir = want; b.j = (tg.y - s.y > 2 || (Math.random() < .12 + .1 * sk)) ? 1 : 0; b.err = (Math.random() - .5) * (1 - sk) * .7;
          b.burst = Math.random() < .5 + .4 * sk ? .5 + Math.random() * .6 : 0;
        }
        if (s.x > 20.2 && b.dir > 0) b.dir = -1; if (s.x < -20.2 && b.dir < 0) b.dir = 1;
        b.burst -= dt;
        const a = Math.atan2(tg.y - s.y, tg.x - s.x) + b.err;
        applyInput(id, { x: b.dir, j: b.j && !s.gr ? 0 : b.j, a: +a.toFixed(2), f: b.burst > 0 ? 1 : 0 });
        if (b.j) b.j = 0;
      }
    }
    function step(dt) {
      if (phase !== 'fight' || over) return;
      if (freeze > 0) { freeze -= dt; return; }
      ft += dt;
      for (const id of ids) {
        const s = st[id]; if (!s.alive) continue; const i = s.inp, k = s.st;
        s.vx = i.x * 8 * k.speed;
        if (s.jumpReq) { if (s.gr) { s.vy = 17; s.jl = k.jumps; } else if (s.jl > 0) { s.vy = 15; s.jl--; } s.jumpReq = false; }
        s.vy -= 40 * dt; const py = s.y; s.x = Math.max(-20.5, Math.min(20.5, s.x + s.vx * dt)); s.y += s.vy * dt; s.gr = false;
        if (s.vy <= 0) for (const p of PL) if (s.x >= p.x0 - .3 && s.x <= p.x1 + .3 && py >= p.top - .05 && s.y <= p.top) { s.y = p.top; s.vy = 0; s.gr = true; s.jl = k.jumps; }
        s.cd -= dt;
        if (i.f && s.cd <= 0) {
          s.cd = k.cd;
          for (let n = 0; n < k.shots; n++) { const a = i.a + (n - (k.shots - 1) / 2) * .14; bullets.push({ o: id, x: s.x + Math.cos(a) * .7, y: s.y + 1 + Math.sin(a) * .7, vx: Math.cos(a) * k.bs, vy: Math.sin(a) * k.bs, life: 2.5, bn: k.bn, dmg: k.dmg }); }
        }
      }
      for (let n = bullets.length - 1; n >= 0; n--) {
        const b = bullets[n], ox = b.x, oy = b.y; b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt; let dead = b.life <= 0;
        for (const p of PL) {
          const th = Math.max(p.th, .7);
          if (!dead && b.x >= p.x0 && b.x <= p.x1 && b.y <= p.top && b.y >= p.top - th) {
            if (b.bn > 0) { b.bn--; if (oy > p.top || oy < p.top - th) { b.vy = -b.vy; b.y = oy; } else { b.vx = -b.vx; b.x = ox; } } else dead = true;
          }
        }
        if (!dead && Math.abs(b.x) > 23.5) { if (b.bn > 0) { b.bn--; b.vx = -b.vx; b.x = ox; } else dead = true; }
        if (!dead) for (const id of ids) {
          const s = st[id]; if (!s.alive || id === b.o) continue;
          if (Math.abs(b.x - s.x) < .55 && Math.abs(b.y - (s.y + .9)) < 1) {
            s.hp -= b.dmg; const o = st[b.o]; if (o) { o.dealt += b.dmg; o.hp = Math.min(o.st.hp, o.hp + b.dmg * o.st.ls); }
            if (s.hp <= 0) s.alive = false; dead = true; break;
          }
        }
        if (dead) bullets.splice(n, 1);
      }
      const al = ids.filter(id => st[id].alive);
      if (al.length <= (ids.length > 1 ? 1 : 0) || ft > 30) endRound(al.length ? al.sort((a, b) => st[b].hp - st[a].hp)[0] : null);
    }
    const pack = () => {
      const p = {}; ids.forEach(id => { const s = st[id]; p[id] = [+s.x.toFixed(2), +s.y.toFixed(2), Math.max(0, Math.round(s.hp)), Math.round(s.st.hp), s.alive ? 1 : 0]; });
      return { k: 's', p, b: bullets.map(b => [+b.x.toFixed(2), +b.y.toFixed(2), +b.vx.toFixed(1), +b.vy.toFixed(1)]) };
    };

    return {
      update(dt) {
        intro -= dt;
        const inp = { x: (held.KeyD || held.ArrowRight ? 1 : 0) - (held.KeyA || held.ArrowLeft ? 1 : 0), j: (held.Space || held.KeyW || held.ArrowUp) ? 1 : 0, a: +aimAngle().toFixed(2), f: fire && phase === 'fight' ? 1 : 0 };
        if (host) {
          applyInput(me, inp); botThink(dt); simAcc = Math.min(.1, simAcc + dt);
          while (simAcc >= 1 / 60) { step(1 / 60); simAcc -= 1 / 60; }
          // (iterate a snapshot: pick() can start the next round and replace `offers`)
          if (phase === 'pick' && !over && (pickT -= dt) <= 0) { for (const [id, o] of Object.entries(offers)) if (!picked[id]) pick(id, o[0]); }
          const sn = pack(); snap = sn.p; bl = sn.b;
          if ((acc += dt) >= .05) { acc = 0; ctx.send(sn); }
        } else {
          const key = JSON.stringify(inp); sendT -= dt;
          if (key !== last && sendT <= 0) { last = key; sendT = .05; ctx.send({ k: 'in', ...inp }); }
          bl.forEach(b => { b[0] += b[2] * dt; b[1] += b[3] * dt; });
        }
        if (snap) for (const id of ids) {
          const q = snap[id], e = W.m.get(id); if (!q || !e) continue;
          if (hpPrev[id] > q[2]) sfx('hit'); hpPrev[id] = q[2]; W.set(id, q[0], 0); e.g.visible = !!q[4]; e.g.position.y += (q[1] - e.g.position.y) * Math.min(1, dt * 20);
        }
        const g = W.m.get(me)?.g; aim.visible = !!snap?.[me]?.[4];
        if (g) aim.position.set(g.position.x + Math.cos(inp.a) * 2, g.position.y + 1 + Math.sin(inp.a) * 2, 0);
        if (bl.length > prevBl) sfx('shoot'); prevBl = bl.length;
        while (bm.length < bl.length) { const m = new THREE.Mesh(new THREE.SphereGeometry(.18, 4, 3), new THREE.MeshBasicMaterial({ color: 0xffee58 })); S.root.add(m); bm.push(m); }
        bm.forEach((m, i) => { const b = bl[i]; m.visible = !!b; if (b) m.position.set(b[0], b[1], 0); });
        // HUD (only rewritten when changed, so card buttons stay clickable)
        const mine = offers?.[me];
        let h = `<h3>${phase === 'pick' ? `Round ${round - 1} over - pick a card` : intro > 0 ? `Round ${round} - get ready!` : `Round ${round}`}</h3>` +
          ids.map(id => { const q = snap?.[id] || [0, 0, 100, 100, 1], p = ctx.players[id];
            return `<div class="bar"><span style="width:${q[2] / q[3] * 100}%;background:${p.color}"></span><b>${ctx.esc(p.name)} ${'●'.repeat(wins[id] || 0)}</b></div>`; }).join('');
        if (phase === 'pick') h += mine && myPicked < round
          ? '<div class="tiles">' + mine.map(c => `<button class="card" data-c="${c}"><b>${CARDS[c].n}</b><br><small>${CARDS[c].d}</small></button>`).join('') + '</div>'
          : '<div>Waiting for others to pick...</div>';
        if (h !== lastH) { el.innerHTML = h; lastH = h; }
      },
      onMessage(m, from) {
        if (host) { if (m.k === 'in') applyInput(from, m); else if (m.k === 'pick') pick(from, m.c | 0); }
        else if (m.k === 's') { snap = m.p; bl = m.b.map(a => a.slice()); }
        else if (m.k === 'ph') { phase = m.phase; round = m.round; Object.assign(wins, m.wins); offers = m.offers || {}; if (phase === 'fight') intro = 1.4; }
      },
      cleanup() {
        removeEventListener('keydown', kd); removeEventListener('keyup', ku); removeEventListener('pointermove', pm);
        removeEventListener('pointerdown', pd); removeEventListener('pointerup', pu); removeEventListener('blur', pu);
        el.remove(); S.cleanup();
        for (const id of ids) { const g = W.m.get(id)?.g; if (g) { g.position.y = 0; g.visible = true; } }
      },
    };
  },
};
