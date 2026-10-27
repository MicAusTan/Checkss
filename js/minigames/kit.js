import * as THREE from 'three';
import { fitDist } from './stage.js';
// Small shared helpers for the handcrafted minigame sets.

// pick(W, S.root, pointerEvent, meshes) -> the mesh under the pointer (nearest to the camera) or null. Works with any aspect ratio.
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
export function pick(W, root, e, meshes) {
  const dom = W.r?.domElement, rc = dom ? dom.getBoundingClientRect() : { left: 0, top: 0, width: innerWidth, height: innerHeight };
  ndc.set((e.clientX - rc.left) / rc.width * 2 - 1, -((e.clientY - rc.top) / rc.height) * 2 + 1);
  root.updateMatrixWorld(true); W.cam.updateMatrixWorld(); ray.setFromCamera(ndc, W.cam);
  return ray.intersectObjects(meshes, false)[0]?.object ?? null;
}

// share(ctx, 'k', onEvent): live, cosmetic progress sharing. emit({...numbers/booleans}) tells everyone about YOU; onEvent(ev)
// fires for everyone ELSE ({k, id, ...fields}). The host validates the sender and only relays numeric/boolean fields (clamped),
// so a client can never inject anything but numbers. Call handle(m, from) first thing in your onMessage; true = it was ours.
export function share(ctx, key, onEvent) {
  const ids = Object.keys(ctx.players);
  return {
    emit(data) { ctx.send({ k: key, id: ctx.me, ...data }); },
    handle(m, from) {
      if (m.k !== key) return false;
      if (ctx.isHost) {
        if (!ids.includes(from)) return true;
        const ev = { k: key, id: from };
        for (const f in m) if (f !== 'k' && f !== 'id') { const v = m[f]; if (typeof v === 'number' && isFinite(v)) ev[f] = Math.max(-9999, Math.min(9999, v)); else if (typeof v === 'boolean') ev[f] = v; }
        onEvent(ev); ctx.send(ev);
      } else if (m.id !== ctx.me && m.id in ctx.players) onEvent(m);
      return true;
    },
  };
}

// nameplate(S, ctx, id, w, h): a little canvas sign with the player's name (in their colour) and one line of status text.
export function nameplate(S, ctx, id, w = 1.9, h = .7) {
  const px = 256, py = Math.round(px * h / w), sc = S.screen(w, h, px, py); let last = null;
  const p = { mesh: sc.mesh, set(text, bad = false) {
    const k = text + (bad ? '!' : ''); if (k === last) return; last = k;
    sc.draw((c, W_, H_) => { c.fillStyle = bad ? '#4a1010dd' : '#000a'; c.fillRect(0, 0, W_, H_); c.textAlign = 'center'; c.fillStyle = ctx.players[id].color; c.font = `bold ${H_ * .34 | 0}px sans-serif`; c.fillText(String(ctx.players[id].name).slice(0, 12), W_ / 2, H_ * .4); c.fillStyle = '#fff'; c.font = `bold ${H_ * .42 | 0}px sans-serif`; c.fillText(text, W_ / 2, H_ * .88); });
  } };
  return p;
}

// ---- scenery helpers (cosmetic only: they use Math.random, never ctx.rng) ----
// Stage options for a tilted top-down arena camera that fits +-half world units across the screen.
export const topDown = (W, half = 14, min = 20, look = [0, 0, 0]) => { const d = fitDist(W, half, min); return { cam: { pos: [0, d * .82, d * .58], look }, camFrom: [0, d * 1.5, d * 1.05], camT: 1.4 }; };
export const ringPts = (n, r, a0 = 0) => Array.from({ length: n }, (_, i) => { const a = a0 + i / n * Math.PI * 2; return [Math.sin(a) * r, Math.cos(a) * r, a]; });
export function pine(S, x, z, s = 1, col = 0x2f7d3a, snow = false) {
  S.cyl(.22 * s, .3 * s, 1.2 * s, 0x6b4a2b, x, 0, z, { seg: 5 }); S.cone(1.5 * s, 3.4 * s, col, x, 1 * s, z, { seg: 6 }); if (snow) S.cone(.95 * s, 1.5 * s, 0xffffff, x, 3 * s, z, { seg: 6 });
}
// falling snow / ash: an instanced cloud of flakes that wraps around
export function flakes(S, n = 160, area = 28, top = 16, size = .12, color = 0xffffff) {
  const im = new THREE.InstancedMesh(new THREE.BoxGeometry(size, size, size), new THREE.MeshBasicMaterial({ color }), n), dm = new THREE.Object3D(), P = []; im.frustumCulled = false;
  for (let i = 0; i < n; i++) P.push({ x: (Math.random() - .5) * area, y: Math.random() * top, z: (Math.random() - .5) * area, v: .8 + Math.random() * 1.4, s: Math.random() * 6 });
  S.root.add(im);
  S.anim((dt, t) => { for (let i = 0; i < n; i++) { const p = P[i]; p.y -= p.v * dt; if (p.y < 0) p.y = top; dm.position.set(p.x + Math.sin(t * .8 + p.s) * .5, p.y, p.z); dm.updateMatrix(); im.setMatrixAt(i, dm.matrix); } im.instanceMatrix.needsUpdate = true; });
}
export function starfield(S, n = 260, r = 70, minY = -10) {
  const im = new THREE.InstancedMesh(new THREE.SphereGeometry(.18, 5, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }), n), dm = new THREE.Object3D();
  for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, b = Math.acos(Math.random() * 2 - 1), rr = r * (.8 + Math.random() * .4); dm.position.set(Math.sin(b) * Math.cos(a) * rr, Math.max(minY, Math.cos(b) * rr * .6), Math.sin(b) * Math.sin(a) * rr - 10); dm.scale.setScalar(.5 + Math.random() * 1.3); dm.updateMatrix(); im.setMatrixAt(i, dm.matrix); }
  S.root.add(im);
}
// crowd on stepped stands: rings = [[radius, height, count], ...]
export function crowdRing(S, rings, size = .38) {
  const tot = rings.reduce((a, r) => a + r[2], 0), im = new THREE.InstancedMesh(new THREE.SphereGeometry(size, 6, 5), new THREE.MeshStandardMaterial({ color: 0xffffff }), tot), dm = new THREE.Object3D(), c = new THREE.Color(); let i = 0;
  for (const [r, y, n] of rings) for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2 + Math.random() * .05; dm.position.set(Math.sin(a) * r, y + Math.random() * .1, Math.cos(a) * r); dm.updateMatrix(); im.setMatrixAt(i, dm.matrix); im.setColorAt(i++, c.setHSL(Math.random(), .6, .55)); }
  S.root.add(im);
}
