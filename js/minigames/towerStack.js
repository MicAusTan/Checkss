import * as THREE from 'three';
import { sfx } from '../sfx.js';
import { stage, fitDist } from './stage.js';
// CO-OP: everyone shares one tower and takes turns dropping the swinging block. Reward tier by height.
// Set: a construction site. The block hangs from a crane cable (a pendulum), the current player steps up to the controls,
// overhang slices tumble off, and the camera climbs with the tower. (Game logic is unchanged: x/w are in the original 140/120 units, 40 per world unit.)
const R = 140, BW = 120, LH = 22, U = 40, LT = LH / U, D = 3, LC = 7;
const Y = i => .4 + i * LT, hue = i => new THREE.Color().setHSL((i * 28 % 360) / 360, .7, .55).getHex();
export default {
  name: 'Tower Stack', desc: 'Take turns dropping the swinging block (SPACE / click) onto a shared tower. Miss the tower and YOU are out - last builder standing wins. Perfect drops keep the block wide!',
  create(ctx) {
    const ids = Object.keys(ctx.players), host = ctx.isHost, W = ctx.world, n = ids.length;
    let elim = [], score = {}, layers = [{ x: 0, w: BW }], ph = 0, turn = 0, pos = 0, time = 0, acc = 0, over = false, msg = '', tt = 0;
    ids.forEach(id => score[id] = 0);
    const whose = () => { for (let k = 0; k < n; k++) { const id = ids[(turn + k) % n]; if (!elim.includes(id)) return id; } return ids[turn % n]; };      // skips eliminated players
    const el = document.createElement('div'); el.className = 'mg'; el.innerHTML = '<h3 id="s"></h3>'; ctx.hud.append(el); const s = el.querySelector('#s');

    // ---------- the set ----------
    const dist = fitDist(W, 9.5, 15);
    const S = stage(ctx, { light: 1.1, sun: { intensity: 1.2, pos: [-8, 16, 10] }, cam: { pos: [0, 5.5, dist], look: [0, 3, 0] }, camFrom: [0, 9, dist + 11], camT: 1.4 });
    S.box(90, 1, 50, 0xc9b48a, 0, -1, 0); S.box(8, .4, 5, 0x7d7d86, 0, 0, 0);                                    // dirt + foundation slab
    for (let i = 0; i < 9; i++) { const x = -30 + i * 8 + (i % 2) * 3; S.cone(5 + i % 3 * 2, 3 + i % 3 * 2, 0xa8977a, x, 0, -16, { seg: 5 }); }       // dirt piles
    S.box(.8, 70, .8, 0xf1c40f, 8.7, 0, 0); const jib = S.box(11, .5, .6, 0xf1c40f, 3.2, 0, 0), trol = S.box(.8, .4, .8, 0x333333, 0, 0, 0);       // crane
    const cable = S.cyl(.04, .04, 1, 0x222222, 0, 0, 0, { seg: 5 }); cable.geometry.translate(0, -.5, 0);     // pivots at its top end
    for (let i = 0; i < 4; i++) { S.cyl(.05, .05, 2.2, 0xffffff, -2 + i * 1.2, 0, 4, { seg: 5 }); S.box(.9, .2, .03, i % 2 ? 0xff9f1a : 0xffffff, -2 + i * 1.2 + .4, 1.2, 4); }   // barrier posts
    const consol = S.box(.9, 1, .9, 0x444455, -4.2, 0, 0); S.cyl(.26, .3, .12, 0xe02020, -4.2, 1, 0, { em: 0x550000 });
    for (const [h, c, nm] of [[3, 0xcd7f32, '3'], [7, 0xc0c8d0, '7'], [12, 0xf1c40f, '12']]) {       // reward lines: bronze / silver / gold
      S.box(10, .04, .04, c, 0, Y(h + 1), -1.8, { basic: true }); const lb = S.screen(1, .5, 128, 64); lb.mesh.position.set(5.6, Y(h + 1) + .1, -1.8);
      lb.draw((cc, w, hh) => { cc.fillStyle = '#' + c.toString(16).padStart(6, '0'); cc.font = 'bold 44px sans-serif'; cc.textAlign = 'center'; cc.fillText(nm, w / 2, 48); });
    }
    const blk = S.box(1, LT - .03, D, 0xffffff, 0, 0, 0), lm = [], deb = [];
    const arrow = S.cone(.3, .6, 0xffd93d, 0, 0, 0, { em: 0x665500 }); arrow.rotation.x = Math.PI;
    const addLayer = (i, fall) => { const l = layers[i], m = S.box(l.w / U, LT - .03, D, hue(i), l.x / U, Y(i), 0); m.userData = { ty: m.position.y, f: fall ? 0 : 1 }; if (fall) m.position.y += 2.2; lm.push(m); };
    addLayer(0, false);
    const slot = i => [-8.6, (i - (n - 1) / 2) * 1.35], stand = [-5.6, 0];
    ids.forEach((id, i) => W.put(id, slot(i)[0], slot(i)[1], Math.PI / 2));                                     // watching from the left, facing the tower
    let py = Y(1) + 1.4 + LC, cy = 3.2, ended = false;
    const debris = (cxw, w, i, color, dir) => { const m = S.box(Math.max(.05, w / U), LT - .03, D, color, cxw / U, Y(i), 0); m.userData = { vx: dir * 2.2, vy: 0, rz: dir * (1 + Math.random() * 2) }; deb.push(m); };
    const onDrop = (top, dropX, ok, who) => {            // cosmetic reaction to a drop (called on every client)
      const dx = dropX - top.x;
      if (!ok) debris(dropX, top.w, layers.length, hue(layers.length), dx >= 0 ? 1 : -1);
      else if (Math.abs(dx) >= 6) debris(dx > 0 ? top.x + top.w / 2 + dx / 2 : top.x - top.w / 2 + dx / 2, Math.abs(dx), layers.length - 1, hue(layers.length - 1), dx > 0 ? 1 : -1);
      if (who) { W.lean(who, .45); S.after(.2, () => W.lean(who, 0)); if (!ok) W.emote(who, 'sad'); }
    };
    const startEnd = () => {
      if (ended) return; ended = true; ids.forEach(id => W.emote(id, elim.includes(id) ? 'sad' : 'cheer')); W.burst(0, Y(layers.length) + 1, 0, '#ffd93d', 30);
      const top = Y(layers.length); W.setCam([0, top * .5 + 3, dist + top * .9], [0, top * .5, 0], 1.8);       // pull back to show the finished tower
    };
    const end = () => {
      if (over) return; over = true;
      ctx.send({ L: layers, t: turn, x: pos, end: 1, msg, el: elim }); startEnd();
      const alive = ids.filter(id => !elim.includes(id)).sort((a, b) => score[b] - score[a]);
      S.after(2.6, () => ctx.finish([...alive, ...[...elim].reverse()]));       // let everyone see the result on the site before the podium
    };
    let turnT = 0;
    const drop = () => {
      turnT = 0;
      const top = layers[layers.length - 1], dx = pos - top.x, ov = top.w - Math.abs(dx), who = whose();
      if (Math.abs(dx) < 6) { layers.push({ x: top.x, w: top.w }); score[who] += 2; msg = 'PERFECT!'; sfx('star'); onDrop(top, pos, true, who); }
      else if (ov < 8) {
        msg = `${ctx.players[who]?.name} missed - OUT!`; sfx('lose'); onDrop(top, pos, false, who); elim.push(who); turn++;
        if (ids.length - elim.length <= (n > 1 ? 1 : 0)) return end(); return void ctx.send({ L: layers, t: turn, x: pos, msg, el: elim });
      }
      else { layers.push({ x: top.x + dx / 2, w: ov }); score[who]++; msg = 'Nice'; sfx('click'); onDrop(top, pos, true, who); }
      turn++; ctx.send({ L: layers, t: turn, x: pos, msg, el: elim }); if (layers.length > 24) end();
    };
    const press = () => { if (over || whose() !== ctx.me) return; host ? drop() : ctx.send({ d: 1 }); };
    const key = e => { if (e.code === 'Space' && !e.repeat) press(); };
    addEventListener('keydown', key); addEventListener('pointerdown', press);

    S.anim((dt, t) => {
      tt += dt;
      while (lm.length < layers.length) addLayer(lm.length, true);                                           // new layers drop in
      for (const m of lm) { const u = m.userData; if (u.f < 1) { u.f = Math.min(1, u.f + dt * 4.5); m.position.y = u.ty + (1 - u.f * u.f) * 2.2; if (u.f >= 1) W.shake(.05, .12); } }
      for (let i = deb.length - 1; i >= 0; i--) { const m = deb[i], u = m.userData; u.vy -= 22 * dt; m.position.x += u.vx * dt; m.position.y += u.vy * dt; m.rotation.z += u.rz * dt; if (m.position.y < -8) { S.root.remove(m); m.geometry.dispose(); m.material.dispose(); deb.splice(i, 1); } }
      const top = layers[layers.length - 1], topY = Y(layers.length);
      py += (topY + 1.4 + LC - py) * Math.min(1, dt * 3);
      const bx = pos / U, by = py - Math.sqrt(LC * LC - Math.min(bx * bx, LC * LC * .9));
      blk.visible = !over; blk.scale.x = top.w / U; blk.position.set(bx, by - (LT - .03) / 2, 0); blk.material.color.setHex(hue(layers.length));
      jib.position.y = py + .45 + .25; trol.position.y = py + .2;
      cable.position.set(0, py, 0); cable.scale.y = Math.hypot(bx, py - by); cable.rotation.z = Math.atan2(bx, -(by - py)); cable.visible = !over;
      const w = W.m.get(whose())?.g; arrow.visible = !over && !!w; if (w) arrow.position.set(w.position.x, 2.9 + Math.sin(tt * 4) * .15, w.position.z);
      for (let i = 0; i < n; i++) { const [x, z] = ids[i] === whose() && !over ? stand : slot(i), e = W.m.get(ids[i]); if (e) W.set(ids[i], x, z); }   // current player steps up to the console
      if (!ended) { cy += (Math.max(3.2, topY - 2.5) - cy) * Math.min(1, dt * 3); if (tt > 1.45) W.setCam([0, cy + 2.5, dist], [0, cy, 0]); }   // (waits for the stage's fly-in to finish)
    });
    return {
      update(dt) {
        time += dt; if (host && !over && !ctx.players[whose()]?.bot && (turnT += dt) > 7) drop();      // AFK players still have to drop
        if (host && !over && ctx.players[whose()]?.bot) { const sk = ctx.skill?.(whose()) ?? .5, top = layers[layers.length - 1]; ctx._bt = (ctx._bt || 0) + dt; if (ctx._bt > .8 && (Math.abs(pos - top.x) < top.w * (.45 - .41 * sk) || ctx._bt > 4.5)) { ctx._bt = 0; drop(); } }
        if (host && !over) { ph += dt * (1.5 + .1 * (layers.length - 1)); pos = Math.sin(ph) * R; if ((acc += dt) > .05) { acc = 0; ctx.send({ L: layers, t: turn, x: +pos.toFixed(1), msg, el: elim }); } if (time > 80) end(); }
        const w = whose(); s.textContent = `Height ${layers.length - 1}  |  ${w === ctx.me ? 'YOUR TURN - press!' : ctx.players[w]?.name + "'s turn"}  ${msg}`;
      },
      onMessage(m, from) {
        if (host) { if (m.d && from === whose() && !over) drop(); }
        else if (m.L) {
          const prev = layers[layers.length - 1], grew = m.L.length > layers.length, wasTurn = turn, wasEl = elim.length; if (m.el) elim = m.el;
          layers = m.L; turn = m.t; pos = m.x; if (m.msg != null) msg = m.msg;
          if (grew) onDrop(prev, m.x, true, ids[(m.t - 1 + n * 1000) % n]); else if (elim.length > wasEl) onDrop(prev, m.x, false, elim[elim.length - 1]);
          if (m.end) startEnd();
        }
      },
      cleanup() { removeEventListener('keydown', key); removeEventListener('pointerdown', press); el.remove(); S.cleanup(); },
    };
  },
};
