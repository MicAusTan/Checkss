import { sfx } from '../sfx.js';
import { scoreboard, jit, mix, rnd } from './util.js';
import { stage } from './stage.js';
// 3 rounds; wait for GO then react. Jumping the gun costs 1000ms. Lowest total wins.
// Set: a game-show stage. Everyone has a podium + buzzer; the big signal board shows YOUR round state
// (each client plays its own timeline), and other players' presses show up on their podiums as they happen.
const COL = { wait: [0xff2020, '#b3201f'], go: [0x30ff60, '#1fa84a'], rest: [0x666666, '#333a4a'], done: [0x4aa3ff, '#2563a8'] };

export default {
  name: 'Quick Draw', desc: 'Press SPACE (or click) the instant it says GO! 3 rounds, lowest total time wins. Don\'t jump the gun!',
  create(ctx) {
    const sb = scoreboard(ctx, { timeout: 40, bot: s => ({ v: Math.round(3 * jit(mix(520, 230, s), .15)), t: rnd(10, 13) }) }), delays = [0, 1, 2].map(() => 1.5 + ctx.rng() * 3);   // rng first: must match on every client
    let r = 0, t = delays[0], state = 'wait', ms = 0, total = 0, done = false, lastMsg = '', drawn = '';
    const times = [], W = ctx.world, ids = Object.keys(ctx.players), n = ids.length, me = ctx.me;
    const gap = Math.min(3.2, 17 / n), px = i => (i - (n - 1) / 2) * gap;

    // ---------- the set ----------
    const S = stage(ctx, {
      sky: 0x120f26, fog: { color: 0x120f26, near: 26, far: 62 }, light: .8, sun: { intensity: .9, pos: [4, 14, 10] },
      cam: { pos: [0, 5.4, 13.4], look: [0, 2.3, -1] }, camFrom: [0, 10, 24], camT: 1.4,
      slots: i => [px(i), .55, 0],
    });
    S.box(26, .6, 14, 0x7a4b24, 0, -.6, -.5);                       // stage deck
    S.box(24.4, .02, 12.4, 0x9a6232, 0, 0, -.5);                    // lighter inset
    S.box(26, 11, .4, 0x2a1f5c, 0, 0, -6.6);                        // back wall
    for (const side of [-1, 1]) {                                   // curtains
      for (let k = 0; k < 6; k++) S.box(.6, 10, .5, k % 2 ? 0x8f0f22 : 0xb0152b, side * (10.2 + k * .6), 0, -5.9);
    }
    S.box(27, 1.4, .8, 0xb0152b, 0, 9.4, -5.9); S.box(27, .2, .9, 0xe0b040, 0, 9.3, -5.9);   // valance + gold trim
    S.box(8.6, 4.8, .5, 0x15151c, 0, 2.5, -6.1);                    // signal board frame
    const board = S.screen(8.2, 4.4, 512, 256); board.mesh.position.set(0, 4.9, -5.82);
    const beacons = [-1, 1].map(s => { S.cyl(.12, .12, 3.4, 0x333333, s * 5.6, 0, -6.1); return S.sph(.55, 0xff2020, s * 5.6, 3.9, -6.1, { em: 0x550000 }); });
    const foot = [];                                                // chasing footlights along the front edge
    for (let i = 0; i < 17; i++) foot.push(S.box(.5, .12, .5, 0x554400, -8 + i, 0, 6.3, { basic: true }));

    // ---------- podiums ----------
    const pod = {};
    ids.forEach((id, i) => {
      const x = px(i), col = ctx.players[id].color;
      S.box(1.7, 1.1, 1.1, 0x2b2b3d, x, 0, 1.5);
      S.box(1.8, .12, 1.2, col, x, 1.1, 1.5);
      const btn = S.cyl(.42, .46, .14, 0xe02020, x, 1.22, 1.55, { em: 0x400000 });
      const scr = S.screen(1.5, .56, 256, 96); scr.mesh.position.set(x, .55, 2.06);
      S.cone(1.3, 9, col, x, 0, .9, { basic: true, op: .1, seg: 20 });   // spotlight beam in the player's colour
      pod[id] = { x, btn, scr, res: '...', bad: false, pressT: 0, dirty: true };
    });
    const drawPod = id => {
      const P = pod[id], p = ctx.players[id];
      P.scr.draw((c, w, h) => {
        c.fillStyle = P.bad ? '#5a1010' : '#101820'; c.fillRect(0, 0, w, h); c.textAlign = 'center';
        c.fillStyle = p.color; c.font = 'bold 30px sans-serif'; c.fillText(String(p.name).slice(0, 12), w / 2, 32);
        c.fillStyle = '#fff'; c.font = 'bold 40px sans-serif'; c.fillText(P.res, w / 2, 78);
      });
    };
    S.anim((dt, tt) => {
      for (const id of ids) {
        const P = pod[id]; if (P.dirty) { P.dirty = false; drawPod(id); }
        P.pressT = Math.max(0, P.pressT - dt);
        P.btn.position.y += (((P.pressT > 0 ? 1.15 : 1.22) + .07) - P.btn.position.y) * Math.min(1, dt * 30);
      }
      foot.forEach((m, i) => m.material.color.setHex((i + (tt * 4 | 0)) % 3 === 0 ? 0xffe066 : 0x554400));
      const c = COL[state];
      beacons.forEach(b => { b.material.color.setHex(c[0]); b.material.emissive.setHex(state === 'go' ? 0x108030 : state === 'wait' ? 0x550000 : 0x111111); });
      const mine = pod[me]; if (mine) { mine.btn.material.color.setHex(state === 'go' ? 0x30e060 : 0xe02020); mine.btn.material.emissive.setHex(state === 'go' ? 0x108030 : 0x400000); }
    });
    const drawBoard = () => {
      const key = state + r + lastMsg + (state === 'done' ? Math.round(total) : ''); if (key === drawn) return; drawn = key;
      const big = state === 'go' ? 'GO!' : state === 'wait' ? 'WAIT' : state === 'done' ? 'TOTAL' : lastMsg;
      const sub = state === 'go' ? 'PRESS NOW!' : state === 'wait' ? `ROUND ${r + 1} / 3` : state === 'done' ? `${Math.round(total)} ms  -  waiting for others` : 'get ready...';
      board.draw((c, w, h) => {
        c.fillStyle = COL[state][1]; c.fillRect(0, 0, w, h); c.fillStyle = 'rgba(255,255,255,.12)'; c.fillRect(0, 0, w, 14); c.fillRect(0, h - 14, w, 14);
        c.textAlign = 'center'; c.fillStyle = '#fff'; c.font = `bold ${big.length > 6 ? 84 : 130}px sans-serif`; c.fillText(big, w / 2, 150);
        c.font = 'bold 36px sans-serif'; c.fillStyle = 'rgba(255,255,255,.85)'; c.fillText(sub, w / 2, 215);
      });
    };

    // ---------- presses (local + remote) ----------
    const show = ev => {
      const P = pod[ev.id]; if (!P) return;
      P.pressT = .18;
      if (ev.ms == null) { P.res = 'FALSE START'; P.bad = true; W.emote(ev.id, 'sad'); }
      else {
        P.res = ev.ms + 'ms'; P.bad = false; W.lean(ev.id, .45); S.after(.18, () => W.lean(ev.id, 0));
        if (ev.ms < 300) W.burst(P.x, 1.8, .6, ctx.players[ev.id].color, 10);
      }
      if (ev.done) { P.res = 'TOTAL ' + ev.tot; P.bad = false; }
      P.dirty = true;
    };
    const rest = () => { r++; if (r >= 3) { done = true; state = 'done'; sb.report(Math.round(total)); } else { state = 'rest'; t = .9; } };
    const press = () => {
      if (done || state === 'rest') return;
      let m;
      if (state === 'wait') { total += 1000; times.push('x +1000'); sfx('lose'); m = null; lastMsg = 'TOO EARLY!'; }
      else { m = Math.round(ms); total += ms; times.push(m + 'ms'); sfx('click'); lastMsg = m + ' ms'; }
      rest();
      const ev = { k: 'p', id: me, ms: m, tot: Math.round(total), done }; show(ev); ctx.send(ev);
    };
    const key = e => { if (e.code === 'Space' && !e.repeat) press(); };
    addEventListener('keydown', key); addEventListener('pointerdown', press);
    const hud = document.createElement('div'); hud.className = 'mg'; ctx.hud.append(hud);

    return {
      update(dt) {
        sb.prog(r / 3), sb.tick(dt);
        if (state === 'rest' && (t -= dt) <= 0) { state = 'wait'; t = delays[r]; }
        else if (state === 'wait' && (t -= dt) <= 0) { state = 'go'; ms = 0; sfx('go'); }
        else if (state === 'go') ms += dt * 1000;
        drawBoard();
        hud.textContent = times.join('  |  ');
      },
      endNow() { sb.endNow(); },
      onMessage(m, from) {
        if (m.k === 'p') {
          if (ctx.isHost) {                         // host validates the sender, then relays to everyone
            if (!pod[from]) return;
            const ev = { k: 'p', id: from, ms: m.ms == null ? null : (+m.ms || 0), tot: +m.tot || 0, done: !!m.done };
            show(ev); ctx.send(ev);
          } else if (m.id !== me) show(m);
          return;
        }
        sb.onMessage(m, from);
      },
      cleanup() { removeEventListener('keydown', key); removeEventListener('pointerdown', press); hud.remove(); S.cleanup(); },
    };
  },
};
