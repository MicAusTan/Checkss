import * as THREE from 'three';
import { groveDef } from './grove.js';
import { emberDef } from './ember.js';
import { neonDef } from './neon.js';
import { chessDef } from './chess.js';
// Boards are data: spaces {x, z, y?, type, next:[indices], label?, bridge?} plus extras.
//   ground: true = the board brings its own terrain (hides the green lobby island) | bounds / cam: overview framing and follow-camera offsets
//   warps: [a, b] paired warp spaces | monster: {start} roaming Wanderer | sky: day/night cycle by round
//   starSpots: where the star may appear | decor(world, add, anim): animated scenery
const TAU = Math.PI * 2, T = { b: 'blue', r: 'red', g: 'green', s: 'shop', d: 'duel', w: 'warp', t: 'toll', x: 'slot' };
// Sprinkle new squares over plain blue spaces, spread evenly around the board: picks = [[type, count], ...]
const sprinkle = (B, picks) => { let o = .07; for (const [t, k] of picks) for (let j = 0; j < k; j++) { const i = Math.round((j + o) / k * B.n) % B.n; for (let d = 0; d < B.n; d++) { const c = (i + d) % B.n, p = B.sp[c]; if (p.type === 'blue' && !p.bridge && !(B.warps || []).includes(c)) { p.type = t; break; } } o += .27; } return B; };
const finish = def => {
  def.n = def.sp.length; def.type = i => def.sp[i].type; def.spot = i => [def.sp[i].x, def.sp[i].z]; def.y = i => def.sp[i].y || 0;     // y = ground height of a space (boards with terrain)
  if (!def.bounds) { let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const p of def.sp) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); } def.bounds = { x0: x0 - 5, x1: x1 + 5, z0: z0 - 5, z1: z1 + 4 }; }   // what the map-overview camera frames
  return def;
};

// ---- Classic Ring: the original barebones board
const CT = ['blue', 'blue', 'red', 'blue', 'green', 'blue'];
const classic = finish({
  name: 'Classic Ring', warps: [], monster: null, sky: false, starSpots: Array.from({ length: 21 }, (_, i) => i + 2),
  sp: Array.from({ length: 24 }, (_, i) => ({ x: Math.sin(i / 24 * TAU) * 10, z: Math.cos(i / 24 * TAU) * 10, type: i % 12 === 9 ? 'shop' : i % 12 === 3 ? 'duel' : CT[i % 6], next: [(i + 1) % 24] })),
});
sprinkle(classic, [['dash', 2], ['thief', 1], ['swap', 1]]);

// ---- Twilight Grove: the big handcrafted valley lives in grove.js (terrain, 52-space ring road, two shortcuts, six districts)
const grove = finish(groveDef);
const ember = finish(emberDef), neonStrip = finish(neonDef), chess = finish(chessDef);

// ---- Ember Caldera (ember.js), Neon Strip (neon.js) and Checkmate Court (chess.js) are the big handcrafted boards; Classic Ring stays as the barebones original.

export const BOARDS = { grove, ember, neon: neonStrip, chess, classic };
