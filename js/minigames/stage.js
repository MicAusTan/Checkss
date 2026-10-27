import * as THREE from 'three';
// stage(ctx, opts): a handcrafted set for a minigame. Hides the board/floor, applies sky/fog/light/camera,
// puts the players on their marks, and puts EVERYTHING back in cleanup(). Purely cosmetic: no rng, no networking.
//
//   const S = stage(ctx, {
//     sky: 0x120f26, fog: { color, near, far }, light: .8 (ambient), sun: { color, intensity, pos: [x,y,z] },
//     cam: { pos: [x,y,z], look: [x,y,z], fov: 50 }, camFrom: [x,y,z] (optional fly-in, takes `camT` seconds),
//     slots: (i, n) => [x, z, ry],        // where player i of n stands (ry 0 = facing the camera at +z)
//   });
//   Build with the kit (all return the mesh, added to S.root unless o.p is given):
//     S.box(w,h,d, color, x,y,z, o)   S.cyl(rTop,rBot,h, color, x,y,z, o)   S.cone(r,h, color, x,y,z, o)   (y = BOTTOM of the shape)
//     S.sph(r, color, x,y,z, o)                                                                          (y = CENTRE)
//     o = { em: emissiveHex, basic: true (unlit), op: opacity, ry: rotationY, seg: radial segments, p: parent }
//   S.screen(w, h, px, py) -> { mesh, draw((c2d, w, h) => ...) } : a plane with a canvas texture (text, timers, scores)
//   S.anim((dt, t) => ...) per-frame callback, removed automatically.   S.after(sec, fn) one-shot timer.
//   S.cleanup() in your minigame's cleanup().
// Camera distance so that +-half world units fit across the screen (works for portrait phones too).
export const fitDist = (W, half, min = 0) => Math.max(min, half / (Math.tan(W.cam.fov * Math.PI / 360) * (W.cam.aspect || 16 / 9)));
export function stage(ctx, o = {}) {
  const W = ctx.world, scene = W.scene, ids = Object.keys(ctx.players), root = new THREE.Group(); scene.add(root);
  const saved = {
    bg: scene.background.clone(), fog: scene.fog, skyT: W.skyT, hemiT: W.hemiT, hemi: W.hemi.intensity,
    sun: [W.sun.color.getHex(), W.sun.intensity, W.sun.position.clone()], fov: W.cam.fov,
    camPos: W.camPos.clone(), camLook: W.camLook.clone(), pos: {},
  };
  for (const id of ids) { const e = W.m.get(id); if (e) { saved.pos[id] = [e.tx, e.tz, e.g.rotation.y, e.by || 0, e.ty]; e.ty = undefined; e.by = 0; e.g.position.y = 0; } }   // boards give players a height; minigames start on flat ground
  W.stageUp++;

  W.showDeco(false); W.skyT = null;
  scene.background.set(o.sky ?? 0x87ceeb);
  scene.fog = o.fog ? new THREE.Fog(o.fog.color, o.fog.near, o.fog.far) : null;
  W.hemiT = W.hemi.intensity = o.light ?? 1.2;
  if (o.sun) { if (o.sun.color != null) W.sun.color.set(o.sun.color); if (o.sun.intensity != null) W.sun.intensity = o.sun.intensity; if (o.sun.pos) W.sun.position.set(...o.sun.pos); }
  if (o.cam) {
    if (o.cam.fov) { W.cam.fov = o.cam.fov; W.cam.updateProjectionMatrix(); }
    if (o.camFrom) { W.setCam(o.camFrom, o.cam.look); W.setCam(o.cam.pos, o.cam.look, o.camT ?? 1.3); } else W.setCam(o.cam.pos, o.cam.look);
  }
  if (o.slots) ids.forEach((id, i) => { const [x, z, ry] = o.slots(i, ids.length); W.put(id, x, z, ry); });

  const fns = [], timers = [];
  const run = (dt, t) => {
    fns.forEach(f => f(dt, t));
    for (let i = timers.length - 1; i >= 0; i--) if ((timers[i].t -= dt) <= 0) timers.splice(i, 1)[0].f();
  };
  W.anim.push(run);

  const mk = (geo, col, x, y, z, op = {}) => {
    const m = new THREE.Mesh(geo, op.basic ? new THREE.MeshBasicMaterial({ color: col }) : new THREE.MeshStandardMaterial({ color: col, flatShading: true, emissive: op.em ?? 0 }));
    if (op.op != null) { m.material.transparent = true; m.material.opacity = op.op; m.material.depthWrite = false; }
    m.position.set(x, y, z); if (op.ry) m.rotation.y = op.ry; (op.p || root).add(m); return m;
  };
  const S = {
    root, ids, W,
    box: (w, h, d, c, x = 0, y = 0, z = 0, op) => mk(new THREE.BoxGeometry(w, h, d), c, x, y + h / 2, z, op),
    cyl: (rt, rb, h, c, x = 0, y = 0, z = 0, op) => mk(new THREE.CylinderGeometry(rt, rb, h, op?.seg ?? 16), c, x, y + h / 2, z, op),
    cone: (r, h, c, x = 0, y = 0, z = 0, op) => mk(new THREE.ConeGeometry(r, h, op?.seg ?? 16), c, x, y + h / 2, z, op),
    sph: (r, c, x = 0, y = 0, z = 0, op) => mk(new THREE.SphereGeometry(r, op?.seg ?? 14, 10), c, x, y, z, op),
    screen(w, h, px = 256, py = 128) {
      const cv = document.createElement('canvas'); cv.width = px; cv.height = py;
      const c = cv.getContext('2d'), tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })); root.add(mesh);
      return { mesh, draw(fn) { fn(c, px, py); tex.needsUpdate = true; } };
    },
    anim: f => { fns.push(f); },
    after: (sec, f) => { timers.push({ t: sec, f }); },
    cleanup() {
      const i = W.anim.indexOf(run); if (i >= 0) W.anim.splice(i, 1); fns.length = timers.length = 0;
      scene.remove(root);
      root.traverse(n => { n.geometry?.dispose(); const m = n.material; if (m) { m.map?.dispose(); m.dispose(); } });
      scene.background.copy(saved.bg); scene.fog = saved.fog; W.skyT = saved.skyT; W.hemiT = saved.hemiT; W.hemi.intensity = saved.hemi;
      W.sun.color.setHex(saved.sun[0]); W.sun.intensity = saved.sun[1]; W.sun.position.copy(saved.sun[2]);
      if (W.cam.fov !== saved.fov) { W.cam.fov = saved.fov; W.cam.updateProjectionMatrix(); }
      W.setCam(saved.camPos.toArray(), saved.camLook.toArray());
      W.showDeco(true); W.stageUp--;
      for (const id of ids) { const s = saved.pos[id]; if (s && W.m.has(id)) { W.put(id, s[0], s[1], s[2], s[3]); W.resetPose(id); W.face(id, null); W.m.get(id).by = s[3]; W.m.get(id).ty = s[4]; W.m.get(id).g.position.y = s[3]; } }
    },
  };
  return S;
}
