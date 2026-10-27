import * as THREE from 'three';
import { stage } from './stage.js';
import { sfx } from '../sfx.js';
const TAU = Math.PI * 2;
// Host-side bot steering shared by every arena-style game. fn(id, s, skill) returns a direction [dx, dz] (or null to stand still);
// bots only "think" every ~0.12-0.5s (faster when skilled) and steer a little off-line when unskilled. Math.random only.
const thinkers = new WeakMap();
// Bot personalities (each bot gets one, stable for the game): 'reactive' only moves when the game gives it a direction (danger / a goal),
// 'restless' never stops wandering, 'bursty' wanders in short bursts with rests in between, 'lazy' reacts late and idles. Math.random only.
export const STYLES = ['reactive', 'restless', 'bursty', 'lazy'];
export function driveBots(ctx, st, dt, fn) {
  if (!ctx.isHost) return; let th = thinkers.get(st); if (!th) thinkers.set(st, th = {});
  for (const id in st) {
    if (!ctx.players[id]?.bot) continue; const s = st[id];
    if (s.alive === false) { s.ix = s.iz = 0; continue; }
    const b = th[id] ??= { t: Math.random() * .3, ix: 0, iz: 0, style: STYLES[Math.random() * STYLES.length | 0], aggr: Math.random(), burst: Math.random() * 1.2, go: Math.random() < .5, wx: 0, wz: 0 };
    s.style = b.style; s.aggr = b.aggr;
    if (b.style === 'bursty' && (b.burst -= dt) <= 0) { b.go = !b.go; b.burst = b.go ? .5 + Math.random() * 1.1 : .5 + Math.random() * 1.4; const a = Math.random() * Math.PI * 2; b.wx = Math.sin(a); b.wz = Math.cos(a); }
    if ((b.t -= dt) <= 0) {
      const sk = ctx.skill?.(id) ?? .5; b.t = (.5 - .38 * sk) * (.7 + Math.random() * .6) * (b.style === 'lazy' ? 1.8 : 1);
      const v = fn(id, s, sk), l = v ? Math.hypot(v[0], v[1]) : 0;
      if (l < .3) {                                                     // the game has nothing to say: personality decides
        if (b.style === 'restless') { const a = Math.random() * Math.PI * 2; b.ix = Math.sin(a) * .8; b.iz = Math.cos(a) * .8; }
        else if (b.style === 'bursty' && b.go) { b.ix = b.wx; b.iz = b.wz; } else b.ix = b.iz = 0;
      } else { const a = Math.atan2(v[0], v[1]) + (Math.random() - .5) * (1 - sk) * .9; b.ix = Math.sin(a); b.iz = Math.cos(a); }
    }
    s.ix = b.ix; s.iz = b.iz;
  }
}
// Shared top-down arena for host-simulated minigames: disc floor, WASD, input sync, positions.
//   const A = arena(ctx);  A.input() each frame; host: A.move(dt); A.pack() -> snapshot positions;
//   A.show(packed) renders; A.onInput(m, from) in onMessage (returns true if it was movement input).
//   A.st[id] = { x, z, alive, sp (speed multiplier) }
//   { shove: true } adds F / Shift / left-click to shove the nearest player (knockback, 0.9s cooldown); { grab: true } adds hold E to grip the nearest player
//   (they move slower; you get dragged along by them). Bots shove/grab by personality.
//   Pass { set: <stage() options> } to build a themed 3D set instead of the plain green disc: A.S is then the stage (add scenery with
//   A.S.box/cyl/..., A.S.root.add(mesh), A.S.anim(fn)), and A.cleanup() restores everything.
export function arena(ctx, { radius = 11.5, disc: withDisc = true, set, shove = false, grab = false, range = 2.2 } = {}) {
  const W = ctx.world, ids = Object.keys(ctx.players), host = ctx.isHost, held = {}, st = {}; let last = '';
  const S = set ? stage(ctx, set) : null; if (!S) W.showDeco(false);
  let first = true;
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(12, 12, .4, 16), new THREE.MeshStandardMaterial({ color: 0x6fcf97, flatShading: true }));
  disc.position.y = -.2; if (withDisc && !S) W.scene.add(disc);
  ids.forEach((id, k) => { const a = k / ids.length * TAU; st[id] = { x: Math.sin(a) * 5, z: Math.cos(a) * 5, ix: 0, iz: 0, alive: true, sp: 1, kx: 0, kz: 0, cd: 0, hit: 0, lunge: 0, held: null }; });
  const kd = e => { held[e.code] = true; }, ku = e => { held[e.code] = false; };
  const doShove = id => {
    const s = st[id]; if (!s || !s.alive || s.cd > 0) return; s.cd = .9; s.lunge = .18; let o = null, bd = range;
    for (const k of ids) { const t = st[k]; if (k === id || !t.alive) continue; const d = Math.hypot(t.x - s.x, t.z - s.z); if (d < bd) { bd = d; o = t; } }
    if (!o) { s.cd = .35; return; }
    const dx = o.x - s.x, dz = o.z - s.z, l = Math.hypot(dx, dz) || 1; o.kx += dx / l * 15; o.kz += dz / l * 15; o.hit = .3; s.kx -= dx / l * 2; s.kz -= dz / l * 2;
  };
  const setGrab = (id, on) => {
    const s = st[id]; if (!s) return; if (!on || !s.alive) { s.held = null; return; } if (s.held) return; let o = null, bd = range - .1;
    for (const k of ids) { const t = st[k]; if (k === id || !t.alive) continue; const d = Math.hypot(t.x - s.x, t.z - s.z); if (d < bd) { bd = d; o = k; } }
    s.held = o;
  };
  const fire = () => { if (host) doShove(ctx.me); else ctx.send({ sh: 1 }); };
  const kd2 = e => { if (shove && !e.repeat && (e.code === 'KeyF' || e.code === 'ShiftLeft' || e.code === 'ShiftRight')) fire(); if (grab && !e.repeat && e.code === 'KeyE') { if (host) setGrab(ctx.me, true); else ctx.send({ gr: 1 }); } };
  const ku2 = e => { if (grab && e.code === 'KeyE') { if (host) setGrab(ctx.me, false); else ctx.send({ gr: 0 }); } };
  const pd = e => { if (shove && e.button === 0 && !e.target.closest?.('button,input,select')) fire(); };
  addEventListener('keydown', kd); addEventListener('keyup', ku); addEventListener('keydown', kd2); addEventListener('keyup', ku2); addEventListener('pointerdown', pd);
  const links = {}; let prevHit = {};
  return {
    ids, st, S,
    input() {
      const x = (held.KeyD || held.ArrowRight ? 1 : 0) - (held.KeyA || held.ArrowLeft ? 1 : 0), z = (held.KeyS || held.ArrowDown ? 1 : 0) - (held.KeyW || held.ArrowUp ? 1 : 0), l = Math.hypot(x, z) || 1, v = { x: x / l, z: z / l };
      if (host) { const s = st[ctx.me]; if (s) { s.ix = v.x; s.iz = v.z; } }
      else { const k = v.x + ',' + v.z; if (k !== last) { last = k; ctx.send(v); } }
    },
    shove: doShove, grab: setGrab,
    bots(dt, fn) {
      driveBots(ctx, st, dt, fn); if (!host || !(shove || grab)) return;
      for (const id of ids) {
        const s = st[id]; if (!ctx.players[id]?.bot || !s.alive || s.aggr == null) continue;
        s.bt = (s.bt ?? Math.random() * .5) - dt; if (s.bt > 0) continue; s.bt = .35 + Math.random() * .4;
        let near = null, bd = range; for (const k of ids) { const t = st[k]; if (k === id || !t.alive) continue; const d = Math.hypot(t.x - s.x, t.z - s.z); if (d < bd) { bd = d; near = k; } }
        if (shove && near && Math.random() < .12 + .5 * s.aggr * s.aggr) doShove(id);
        if (grab) { if (s.held) { if (Math.random() < .3) setGrab(id, false); } else if (near && s.aggr > .6 && Math.random() < .35) setGrab(id, true); }
      }
    },
    move(dt) {
      const drag = {}; for (const id of ids) { const h = st[id].held; if (h) drag[h] = 1; }
      for (const id of ids) {
        const s = st[id]; if (!s.alive) continue; s.cd = Math.max(0, s.cd - dt); s.hit = Math.max(0, s.hit - dt); s.lunge = Math.max(0, s.lunge - dt);
        const mul = s.sp * (drag[id] ? .6 : 1) * (s.held ? .85 : 1), f = Math.pow(.02, dt);
        s.x += (s.ix * 8 * mul + s.kx) * dt; s.z += (s.iz * 8 * mul + s.kz) * dt; s.kx *= f; s.kz *= f; const r = Math.hypot(s.x, s.z); if (r > radius) { s.x *= radius / r; s.z *= radius / r; }
      }
      for (const id of ids) {                                            // a grip: the holder is dragged after the one they hold (they are weaker)
        const s = st[id]; if (!s.held) continue; const t = st[s.held];
        if (!t || !t.alive || !s.alive) { s.held = null; continue; }
        const dx = t.x - s.x, dz = t.z - s.z, d = Math.hypot(dx, dz); if (d > 3.4) { s.held = null; continue; }
        if (d > 1.4) { const k = (d - 1.4) * Math.min(1, dt * 7) / d; s.x += dx * k; s.z += dz * k; }
      }
    },
    onInput(m, from) {
      if (host && m.sh) { doShove(from); return true; }
      if (host && m.gr != null) { setGrab(from, !!m.gr); return true; }
      if (!host || m.x == null) return false;
      const s = st[from]; if (s) { const x = +m.x || 0, z = +m.z || 0, l = Math.max(1, Math.hypot(x, z)); s.ix = x / l; s.iz = z / l; }
      return true;
    },
    pack() { const p = {}; ids.forEach(id => p[id] = [+st[id].x.toFixed(2), +st[id].z.toFixed(2), st[id].alive ? 1 : 0, st[id].hit > 0 ? 1 : 0, st[id].held ? ids.indexOf(st[id].held) : -1, st[id].lunge > 0 ? 1 : 0]); return p; },
    show(p) {
      for (const id of ids) {
        const q = p[id], e = W.m.get(id); if (!q || !e) continue; if (first) W.warp(id, q[0], q[1]); else W.set(id, q[0], q[1]); e.g.visible = q[2] !== 0;
        if (q[3] && !prevHit[id]) { sfx('shove'); W.hop(id, .35); W.burst?.(q[0], .8, q[1], '#ffffff', 8); } prevHit[id] = q[3];
        if (q[5]) W.lean(id, .5);
        const k = q[4] >= 0 && q[2] ? ids[q[4]] : null, T = k && p[k];                      // grip line between holder and held
        if (T) { const m = links[id] ??= (() => { const b = new THREE.Mesh(new THREE.BoxGeometry(.1, .1, 1), new THREE.MeshBasicMaterial({ color: 0xff9f1a })); W.scene.add(b); return b; })(); const dx = T[0] - q[0], dz = T[1] - q[1], d = Math.hypot(dx, dz) || .01; m.visible = true; m.position.set((q[0] + T[0]) / 2, .8, (q[1] + T[1]) / 2); m.scale.z = d; m.rotation.y = Math.atan2(dx, dz); }
        else if (links[id]) links[id].visible = false;
      }
      first = false;
    },
    cleanup() {
      removeEventListener('keydown', kd); removeEventListener('keyup', ku); removeEventListener('keydown', kd2); removeEventListener('keyup', ku2); removeEventListener('pointerdown', pd); Object.values(links).forEach(m => { W.scene.remove(m); m.geometry.dispose(); m.material.dispose(); }); if (S) S.cleanup(); else { W.scene.remove(disc); W.showDeco(true); }
      ids.forEach(id => { const g = W.m.get(id)?.g; if (g) g.visible = true; });
    },
  };
}
