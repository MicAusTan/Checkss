import * as THREE from 'three';
import { World } from './world.js';
import { OPTS } from './look.js';
import { pedestal, createFx, buildStage, bannerMesh, STAGES, SPOTS } from './victory.js';
import { playEmote } from './emotes.js';
// Shop preview: a second, small World drawn into its own canvas. Character view (plain platform) or podium view
// (pedestal + spotlight + stage colours + win effect). Drag to rotate, wheel to zoom. update(look, name, podium) rebuilds it.
export function createPreview(canvas) {
  const w = new World(canvas); w.setIsland(false);
  const grp = new THREE.Group(); w.scene.add(grp);
  let dec = null, spd = 0, idle = 9, podium = false, look = {}, name = 'You', fx = null, yaw = .45, pitch = .2, zoom = 1, auto = true, walking = false, drag = null, raf = 0, last = 0, tt = 0, pose = 'cheer', poseT = 0, wa = 0;
  const mesh = (geo, col, x, y, z, basic, op) => {
    const m = new THREE.Mesh(geo, basic ? new THREE.MeshBasicMaterial({ color: col, transparent: op != null, opacity: op ?? 1, depthWrite: op == null }) : new THREE.MeshStandardMaterial({ color: col, flatShading: true }));
    m.position.set(x, y, z); grp.add(m); return m;
  };
  const box = (bw, bh, bd, c, x = 0, y = 0, z = 0, o) => mesh(new THREE.BoxGeometry(bw, bh, bd), c, x, y + bh / 2, z, o?.basic);
  const cyl = (rt, rb, h, c, x = 0, y = 0, z = 0, o) => mesh(new THREE.CylinderGeometry(rt, rb, h, 12), c, x, y + h / 2, z, o?.basic);
  const cone = (r, h, c, x = 0, y = 0, z = 0, o) => mesh(new THREE.ConeGeometry(r, h, 8), c, x, y + h / 2, z, o?.basic);
  function build() {
    for (const c of [...grp.children]) { grp.remove(c); c.geometry?.dispose?.(); }
    fx = null; dec = null;
    if (podium) {
      const ST = STAGES[look.stage] || STAGES.night;
      w.scene.background = new THREE.Color(ST.sky);
      mesh(new THREE.CylinderGeometry(7, 7, .6, 36), ST.d1, 0, -.3, 0);
      mesh(new THREE.CylinderGeometry(4.6, 4.6, .05, 36), ST.d2, 0, .02, 0);
      pedestal({ box, cyl, cone }, look.ped, { h: 1.8, c: 0xf1c40f }, 0, 2.4);
      mesh(new THREE.ConeGeometry(2.4, 10, 24, 1, true), SPOTS[look.spot] ?? SPOTS.gold, 0, 5, 0, true, .12);
      fx = createFx(look.fx, grp, 0, 4, w); fx.show(true); dec = buildStage(look.stage in STAGES ? look.stage : 'night', grp, 0, 2.4);
      const cr = (OPTS.crest.vals[look.crest] || OPTS.crest.vals.trophy).split(' ')[0], bn = bannerMesh(name, cr, 6); bn.position.set(0, 4.9, -1); grp.add(bn);
    } else {
      w.scene.background = new THREE.Color(0x2a2458);
      mesh(new THREE.CylinderGeometry(1.9, 2.1, .3, 28), 0x3d3580, 0, -.15, 0);
      mesh(new THREE.TorusGeometry(1.95, .04, 4, 28), 0xffd93d, 0, .02, 0, true).rotation.x = Math.PI / 2;
    }
    w.sync({ me: { id: 'me', name, ...look } });
    w.put('me', 0, 0, .4, podium ? 1.8 : 0); poseT = .3;
  }
  function step(dt) {
    tt += dt;
    idle += dt; spd += ((auto && !drag && idle > 2 ? .6 : 0) - spd) * Math.min(1, dt * 2.2);
    if (!podium) yaw += dt * spd;
    const y = yaw + (podium ? Math.sin(tt * .5) * .55 * (spd / .6) : 0), d = (podium ? 9.5 : 5.2) * zoom, cy = podium ? 2.6 : 1.1;
    w.setCam([Math.sin(y) * Math.cos(pitch) * d, cy + Math.sin(pitch) * d, Math.cos(y) * Math.cos(pitch) * d], [0, cy, 0]);
    if (podium && (poseT -= dt) <= 0) { poseT = 2.6; w.emote('me', pose); }
    if (walking && !podium) { wa += dt * 1.5; w.set('me', Math.cos(wa) * 1.3, Math.sin(wa) * 1.3); }
    fx?.update(dt, tt); dec?.update(dt, tt);
    w.frame(dt);
  }
  const tick = now => { raf = requestAnimationFrame(tick); const dt = Math.min(.05, (now - last) / 1000); last = now; step(dt); };
  const c = canvas, up = () => { drag = null; idle = 0; };
  c.addEventListener?.('pointerdown', e => { idle = 0; drag = { x: e.clientX, y: e.clientY, yaw, pitch }; c.setPointerCapture?.(e.pointerId); });
  c.addEventListener?.('pointermove', e => { if (!drag) return; idle = 0; yaw = drag.yaw - (e.clientX - drag.x) * .01; pitch = Math.max(-.1, Math.min(1, drag.pitch + (e.clientY - drag.y) * .006)); });
  c.addEventListener?.('pointerup', up); c.addEventListener?.('pointercancel', up);
  c.addEventListener?.('wheel', e => { idle = 0; zoom = Math.max(.6, Math.min(1.6, zoom + e.deltaY * .001)); e.preventDefault(); }, { passive: false });
  return {
    update(l, n, pod) { look = l; name = n || 'You'; podium = !!pod; pose = look.vpose in OPTS.vpose.vals ? look.vpose : 'cheer'; walking = false; build(); },
    walk(v) { if (walking && !v) w.put('me', 0, 0, .4, podium ? 1.8 : 0); walking = !!v && !podium; },
    setAuto(v) { auto = v; },
    emote(i) { playEmote(w, 'me', i, false); },
    start() { if (!raf && typeof requestAnimationFrame === 'function') { last = performance.now(); raf = requestAnimationFrame(tick); } setTimeout(() => w.resize(), 0); },
    stop() { if (raf) cancelAnimationFrame(raf); raf = 0; },
    step,
  };
}
