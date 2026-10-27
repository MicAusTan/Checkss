import * as THREE from 'three';
// Heightfield terrain: a flat-shaded mesh whose vertex heights and colours come from functions, so a board can sculpt real hills, lakes and mountains.
export const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// heightfield({ x0, x1, z0, z1, nx, nz, h(x,z) -> y, color(x,z,y,THREE.Color) }) -> THREE.Mesh
export function heightfield({ x0, x1, z0, z1, nx, nz, h, color }) {
  const geo = new THREE.PlaneGeometry(x1 - x0, z1 - z0, nx, nz); geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color(), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + cx, z = pos.getZ(i) + cz, y = h(x, z); pos.setXYZ(i, x, y, z); color(x, z, y, c); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.computeVertexNormals();
  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true }));
}
