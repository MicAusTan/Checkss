/* ================= PIECE SKINS (phase 1) =================
   A player can put one picture on each piece type (256px WebP, centre-cropped square). Per piece: "mask" (the picture is cut to the piece's shape) or "overlay"
   (the picture sits on top of the piece), plus move (x, y) and size (s, %). Presets live in IndexedDB; the active one is described to everybody as
   { type: { h: image hash, m: 0|1, x, y, s } } (tiny, sent with the profile) and the pictures themselves travel ONCE, keyed by hash, through the host
   (`skinPut` guest -> host, `skinData` host -> everybody, only what a connection has not got yet). Everything incoming is validated (`safeSkinImg`, hash check, `cleanSk`).
   Pieces with no owner (neutrals) and pieces whose owner has no skin for that type use the default art; a piece always shows its CURRENT owner's skin (drops, captures). */
const skLs = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } };
const skLsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } };
const SKIN = { show: skLs('cwfShowSkins', '1') !== '0', mine: {}, imgs: new Map(), css: null, doneImg: new Set(), maskIdx: new Map(), preset: null };
const skHash = s => { let a = 0x811c9dc5, b = 5381; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); a ^= c; a = Math.imul(a, 16777619) >>> 0; b = (Math.imul(b, 33) + c) >>> 0; } return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0'); };
const safeSkinImg = d => typeof d === 'string' && d.length <= 125000 && /^data:image\/(webp|png|jpeg);base64,[A-Za-z0-9+\/=]+$/.test(d);
const skNum = (v, lo, hi, d) => { v = +v; return isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : d; };
const SK_LAYERS = 6, SK_K = /^[pP]:\d{1,3},\d{1,3}( \d{1,3},\d{1,3}){2,47}$/, SK_UNIT = 0.72;      // SK_UNIT: how big a piece is compared with its square (about)
const skLayer = e => (e && typeof e.h === 'string' && /^[0-9a-f]{16}$/.test(e.h)) ? { h: e.h, x: skNum(e.x, -300, 300, 0), y: skNum(e.y, -300, 300, 0), s: skNum(e.s, 5, 1000, 100), r: skNum(e.r, -180, 180, 0), f: e.f ? 1 : 0, o: skNum(e.o, 10, 100, 100) } : null;
const skBaseSet = b => (b && typeof b === 'object') ? { v: b.v === 0 ? 0 : 1, x: skNum(b.x, -300, 300, 0), y: skNum(b.y, -300, 300, 0), s: skNum(b.s, 5, 1000, 100), r: skNum(b.r, -180, 180, 0) } : null;
const cleanSk = o => {      // { type: { v: 2, m: 1 cut | 0 free, c: tint, k: own mask shape, b: the original icon (free only), l: [ { h: picture hash, x, y, s (size %), r (deg), f (flip), o (opacity %) } ] } }; the older one-picture forms are still accepted
  const r = {}; if (!o || typeof o !== 'object') return r;
  Object.keys(o).slice(0, 80).forEach(t => { const e = o[t]; if (t === '__proto__' || t.length > 3 || !e || typeof e !== 'object') return;
    const l = (Array.isArray(e.l) ? e.l.slice(0, SK_LAYERS) : [e]).map(skLayer).filter(Boolean); if (!l.length) return;
    const m = e.m ? 1 : 0;
    if (!e.v && !m && t !== Engine.NEUTRAL_T.boss) l.forEach(L => { L.x = Math.round(L.x * SK_UNIT); L.y = Math.round(L.y * SK_UNIT); L.s = Math.max(5, Math.round(L.s * SK_UNIT)); });      // old "overlay" pictures were measured on the piece, free ones on the whole square
    const d = { v: 2, m, c: e.c ? 1 : 0, l }; if (m && typeof e.k === 'string' && SK_K.test(e.k)) d.k = e.k; if (!m) { const b = skBaseSet(e.b); if (b) d.b = b; }
    r[t] = d; });
  return r;
};
/* own mask shapes: "p:x,y x,y ..." (straight corners) or "P:..." (smoothed), points in a 0..100 square = the board square */
const skPts = k => k.slice(2).split(' ').map(q => q.split(',').map(Number));
function skPath(k) {
  const P = skPts(k), n = P.length; if (k[0] === 'p') return 'M' + P.map(q => q.join(' ')).join('L') + 'Z';
  let d = 'M' + P[0].join(' '); for (let i = 0; i < n; i++) { const a = P[(i - 1 + n) % n], b = P[i], c = P[(i + 1) % n], e = P[(i + 2) % n]; d += 'C' + [b[0] + (c[0] - a[0]) / 6, b[1] + (c[1] - a[1]) / 6, c[0] - (e[0] - b[0]) / 6, c[1] - (e[1] - b[1]) / 6, c[0], c[1]].map(v => +v.toFixed(2)).join(' '); }
  return d + 'Z';
}
function skinShapeClass(k) {
  const key = 'k' + k; if (SKIN.maskIdx.has(key)) return 'sm-' + SKIN.maskIdx.get(key);
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none"><path d="' + skPath(k) + '" fill="#000"/></svg>';
  const n = SKIN.maskIdx.size; SKIN.maskIdx.set(key, n); skinCss('.sm-' + n + '{--mk:url("data:image/svg+xml,' + encodeURIComponent(svg) + '")}'); return 'sm-' + n;
}
const skHashes = e => (e && e.l ? e.l.map(L => L.h) : []);
function skinCss(rule) { if (!SKIN.css) { SKIN.css = document.createElement('style'); document.head.appendChild(SKIN.css); } SKIN.css.appendChild(document.createTextNode(rule)); }
function skinImgClass(h) { const d = SKIN.imgs.get(h); if (!d) return null; if (!SKIN.doneImg.has(h)) { SKIN.doneImg.add(h); skinCss('.si-' + h + '{--im:url("' + d + '")}'); } return 'si-' + h; }
const skBase = t => (game && game.imperial && IMP_KQ[t]) || art(t) || null;
function skinMaskClass(t, baseSvg) {                          // the piece's own shape, all one colour, used as the mask for a "mask" skin
  if (SKIN.maskIdx.has(t)) return 'sm-' + SKIN.maskIdx.get(t);
  const base = baseSvg || skBase(t); if (!base) return null;
  const svg = base.replace(/currentColor/g, '#000').replace(/var\(--det[sS]?\)/g, '#000').replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
  const n = SKIN.maskIdx.size; SKIN.maskIdx.set(t, n); skinCss('.sm-' + n + '{--mk:url("data:image/svg+xml,' + encodeURIComponent(svg) + '")}'); return 'sm-' + n;
}
function ownerSk(owner) {
  if (!game || owner == null || owner === 'n') return null;
  const me = game.multi ? mySeat : myColor;
  if (owner === me) return SKIN.mine;
  if (!SKIN.show) return null;
  return game.multi ? (seatInfo[owner] && seatInfo[owner].k) || null : (peerInfo && peerInfo.k) || null;
}
function skinHTML(t, owner) { const k = ownerSk(owner); return k && k[t] ? skinEntryHTML(t, k[t]) : null; }      // null when this piece has no skin (then the default art is drawn)
const skLayerHTML = L => { const ic = skinImgClass(L.h); return ic ? '<span class="ly ' + ic + '" style="--x:' + L.x + ';--y:' + L.y + ';--s:' + L.s + ';--r:' + L.r + 'deg;--f:' + (L.f ? -1 : 1) + ';--o:' + (L.o / 100) + '"></span>' : ''; };
function skinEntryHTML(t, e) {
  const ly = (e.l || []).map(skLayerHTML).join(''); if (!ly) return null; const tc = e.c ? ' t' : '';
  if (e.m && e.k) return '<span class="skn f m' + tc + ' ' + skinShapeClass(e.k) + '">' + ly + '</span>';           // cut to an own shape: the whole square
  if (e.m) { const mc = skinMaskClass(t); return mc ? '<span class="skn m' + tc + ' ' + mc + '">' + ly + '</span>' : null; }      // cut to the piece's own shape
  const b = e.b || { v: 1, x: 0, y: 0, s: 100, r: 0 }, base = skBase(t) || '<span>' + (GLYPH[t] || '') + '</span>';          // free: the whole square, the original icon is optional and can be moved
  return '<span class="skn f' + tc + '">' + (b.v === 0 ? '' : '<span class="bse" style="--x:' + b.x + ';--y:' + b.y + ';--s:' + b.s + ';--r:' + b.r + 'deg">' + base + '</span>') + ly + '</span>';
}
/* The Boss is one set of pictures over its 2x2 cells: every cell shows its own quarter (qx, qy = 0/1 as the viewer sees it), so a lost cell simply stops being drawn. */
function skinBossHTML(e, qx, qy) {
  const parts = (e.l || []).map(L => { const ic = skinImgClass(L.h); if (!ic) return ''; const W = 2 * L.s / 100, Lf = (2 - W) / 2 + 2 * L.x / 100 - qx, T = (2 - W) / 2 + 2 * L.y / 100 - qy;
    return '<span class="bimg ' + ic + '" style="width:' + W * 100 + '%;height:' + W * 100 + '%;left:' + Lf * 100 + '%;top:' + T * 100 + '%;transform:rotate(' + L.r + 'deg) scaleX(' + (L.f ? -1 : 1) + ');opacity:' + (L.o / 100) + '"></span>'; }).join('');
  if (!parts) return null; const q = bossQuarter(qx, qy), tc = e.c ? ' t' : '';
  if (e.m && e.k) return '<span class="skn bc m2' + tc + ' ' + skinShapeClass(e.k) + '" style="-webkit-mask-size:200% 200%;mask-size:200% 200%;-webkit-mask-position:' + qx * 100 + '% ' + qy * 100 + '%;mask-position:' + qx * 100 + '% ' + qy * 100 + '%">' + parts + '</span>';
  if (e.m) { const mc = skinMaskClass('bq' + qx + qy, q); return '<span class="skn bc m2' + tc + ' ' + mc + '">' + parts + '</span>'; }
  return '<span class="skn bc' + tc + '">' + ((e.b && e.b.v === 0) ? '' : q) + parts + '</span>';
}
function skinBossPreview(e) {                                   // all four cells together (editor)
  const cell = (qx, qy) => '<span>' + ((e && skinBossHTML(e, qx, qy)) || bossQuarter(qx, qy)) + '</span>';
  return '<span class="b4">' + cell(0, 0) + cell(1, 0) + cell(0, 1) + cell(1, 1) + '</span>';
}
const glyphHTML = (t, owner) => (owner != null && skinHTML(t, owner)) || art(t) || GLYPH[t];
GLYPH['#'] = '▒'; GLYPH.f = 'Ⓙ';
Object.assign(GLYPH, { '\u03b1': 'Ca', '\u03c7': 'Ma', '\u03c9': 'Am', '\u03bd': 'Nr', '\u03b3': 'Cm', '\u03b6': 'Zb', '\u03b4': 'DK', '\u03b7': 'DH', '\u03ba': 'Ce', '\u03b2': 'Bi', '\u03c0': 'Cn', '\u03b8': 'Gh', '\u03c6': 'Fe', '\u03c8': 'Wz', '\u03be': 'Al', '\u03c4': 'Db', '\u03c1': 'Bp', '\u03bc': 'Sa', '\u03b9': 'Rv', '\u03b5': 'He', '\u03bb': 'Sn', '\u03c5': 'Mo', '\u03bf': 'Ba' });      // Austang Grand pieces (notation text; the board uses the icons below)
{
  const BASE = '<rect x="5" y="19.5" width="14" height="2.6" rx="1" fill="currentColor"/>', DK = 'style="stroke:var(--det)" stroke-width="1.5" fill="none"';
  const HORSE = '<path d="M7 21c0-4.7 1.6-7.6 3.8-9.6L9.8 8 12.2 6.6 13 3l2.4 2.2C18.6 6.8 20 10 20 14v7z" fill="currentColor"/>';
  Object.assign(FAIRY_SVG, {
    '\u03b1': SVG('<path d="M12 1.8c3.4 2.7 5.8 5.7 5.8 9.2 0 2.7-1.6 4.4-3 5.2H9.2c-1.4-.8-3-2.5-3-5.2 0-3.5 2.4-6.5 5.8-9.2z" fill="currentColor"/><path d="M9.5 8.5l5 4.5" ' + DK + '/><path d="M3 9.5l3.2 2-3.2 2zM21 9.5l-3.2 2 3.2 2z" fill="currentColor"/>' + BASE),
    '\u03c7': SVG('<path d="M5.5 3h3v2.3h2.2V3h2.6v2.3h2.2V3h3v6l-2.4 2.2v6.6h2.9v3.4H5.5v-3.4h2.9v-6.6L5.5 9z" fill="currentColor"/><path d="M10.2 12.5v4h3.6" ' + DK + '/>'),
    '\u03c9': SVG('<path d="M4 19.5L2.8 7.5l5 4.2L12 3.5l4.2 8.2 5-4.2L20 19.5z" fill="currentColor"/><rect x="4" y="19" width="16" height="2.8" rx="1" fill="currentColor"/><circle cx="2.8" cy="6.5" r="1.4" fill="currentColor"/><circle cx="12" cy="2.7" r="1.5" fill="currentColor"/><circle cx="21.2" cy="6.5" r="1.4" fill="currentColor"/><path d="M10.3 10.5v5h3.4" ' + DK + '/>'),
    '\u03bd': SVG(HORSE + '<circle cx="15" cy="9.5" r="1.1" style="fill:var(--det)"/><path d="M1.8 11h3.2M1.8 15h3.2M1.8 19h3.2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>'),
    '\u03b3': SVG('<path d="M4.8 21v-5.8c-1.6-.4-2.5-1.6-2.5-3.2V8.2l2.6-.8.6 2c.9 0 1.6.4 2.1 1.1C8.5 8.7 9.7 7.2 11.4 7.200c1.8 0 2.7 1.500 3.100 3 .8-1.300 2.100-2.100 3.400-1.800 1.600.4 2.400 1.900 2.400 3.600V21h-2.400v-5.200h-4.200V21H10.800v-5.200H7.200V21z" fill="currentColor"/><circle cx="4.4" cy="10.8" r=".9" style="fill:var(--det)"/>'),
    '\u03b6': SVG(HORSE + '<circle cx="15" cy="9.5" r="1.1" style="fill:var(--det)"/><path d="M10.2 12.5l4.6 1.2M9.4 16l7.600.8M9.2 19.5l8 .2" ' + DK + '/>'),
    '\u03b4': SVG('<path d="M3 19.5V8l4 3 2-6 3 4 3-4 2 6 4-3v11.5z" fill="currentColor"/><rect x="3" y="19" width="18" height="2.8" rx="1" fill="currentColor"/><path d="M12 11.5l2 2.3-2 2.3-2-2.3z" style="fill:var(--det)"/>'),
    '\u03b7': SVG(HORSE + '<circle cx="15" cy="9.5" r="1.1" style="fill:var(--det)"/><path d="M2 8.5c3 .2 5.500 1.500 7 4-3 .2-5.500-.8-7-4zM2.500 13c2.500-.1 4.500.9 6 3-2.600.2-4.600-.6-6-3z" fill="currentColor"/>'),
    '\u03ba': SVG(HORSE + '<circle cx="15" cy="9.5" r="1.1" style="fill:var(--det)"/><circle cx="6" cy="6.500" r="2.300" fill="currentColor"/><path d="M3 15c0-3 1.300-4.800 3-4.800s3 1.800 3 4.800z" fill="currentColor"/>'),
    '\u03b2': SVG('<path d="M2.500 9.500C2.500 6 5 4 7 5l1.200 2.200c1.200-1 2.800-1.500 4.800-1.500 3.600 0 6.500 1.700 7.500 4.800.600 1.800.5 4.400-.3 6.800V21h-3v-3H9.500v3h-3v-4.500C4 15.500 2.500 13 2.500 9.500z" fill="currentColor"/><path d="M4 7.500C2.500 6 2.500 3.500 3.500 2.500M9 6.500C8.500 4.500 9.500 3 11 2.500" stroke="currentColor" stroke-width="1.800" fill="none" stroke-linecap="round"/><circle cx="5.500" cy="10" r="1" style="fill:var(--det)"/>'),
    '\u03c0': SVG('<path d="M2.500 9.200l9-3.700 1.800 4.300-9 3.700z" fill="currentColor"/><circle cx="16" cy="15.500" r="5" fill="currentColor"/><circle cx="16" cy="15.500" r="1.800" style="fill:var(--det)"/><rect x="2.500" y="19.500" width="9" height="2.500" rx="1" fill="currentColor"/><path d="M19 3l.7 1.800 1.800.7-1.800.7L19 8l-.7-1.800-1.800-.7 1.800-.7z" fill="currentColor"/>'),
    '\u03b8': SVG('<ellipse cx="14" cy="11.500" rx="6.500" ry="3.800" fill="currentColor"/><circle cx="6" cy="9" r="2.600" fill="currentColor"/><circle cx="5.200" cy="8.500" r=".8" style="fill:var(--det)"/><path d="M5 6.500L3 3M7 6.500L9 3M11 14.500L7 21.500M14 15l1 6.500M17.500 14.500l4.500 7M12 8.500L10 3.500" ' + DK.replace('stroke:var(--det)','stroke:currentColor') + ' stroke-linecap="round"/>'),
    '\u03c6': SVG('<path d="M12 3l6.500 6.500L12 16 5.500 9.500z" fill="currentColor"/><rect x="5" y="18" width="14" height="3" rx="1.200" fill="currentColor"/><path d="M12 6.500v6M9 9.500h6" ' + DK + '/>'),
    '\u03c8': SVG('<rect x="9" y="2.500" width="6" height="6" rx="1" fill="currentColor"/><rect x="2.500" y="9" width="19" height="6" rx="1" fill="currentColor"/><rect x="9" y="15.500" width="6" height="6" rx="1" fill="currentColor"/>'),
    '\u03be': SVG('<path d="M12 2.500c2 2.500 3.500 5.500 3.500 9 0 1.500-.5 2.800-1.200 3.800H9.700c-.7-1-1.200-2.300-1.200-3.800 0-3.500 1.500-6.500 3.500-9z" fill="currentColor"/><path d="M5 20.500l3-4.500h8l3 4.500z" fill="currentColor"/><path d="M12 6.500l3 3-3 3-3-3z" style="fill:var(--det)"/>'),
    '\u03c4': SVG('<path d="M3 21V10c0-3 2-5 4.500-5h9C19 5 21 7 21 10v11h-4v-5H7v5z" fill="currentColor"/><path d="M8 10h8" ' + DK + '/><circle cx="12" cy="13" r="1.200" style="fill:var(--det)"/>'),
    '\u03c1': SVG('<circle cx="12" cy="7" r="3.800" fill="currentColor"/><path d="M12 11c-3 0-4.500 2.500-4.500 5H5v4.500h14V16h-2.500c0-2.500-1.500-5-4.500-5z" fill="currentColor"/><path d="M17.500 3.500l2.500 2.500M20 3.500V6h-2.500" ' + DK + '/>'),
    '\u03bc': SVG('<path d="M12 2.500c3 3.500 6 6 6 10a6 6 0 0 1-12 0c0-4 3-6.500 6-10z" fill="currentColor"/><rect x="5" y="19" width="14" height="3" rx="1.200" fill="currentColor"/><path d="M12 8.500v7M8.500 12h7" ' + DK + ' transform="rotate(45 12 12)"/>'),
    '\u03b9': SVG('<path d="M12 2.500l3 5.500h-6z" fill="currentColor"/><path d="M12 9c-3 0-5 2.200-5 5 0 2 1 3.500 2.500 4.500H14.500C16 17.500 17 16 17 14c0-2.800-2-5-5-5z" fill="currentColor"/><rect x="5" y="19" width="14" height="3" rx="1.200" fill="currentColor"/><path d="M9.500 14a2.500 2.500 0 1 1 1 2" ' + DK + '/><path d="M8.500 15.500l1.400-1.700 1.700 1.400" ' + DK + '/>'),
    '\u03b5': SVG('<path d="M5 20V9.500l7-6.500 7 6.500V20z" fill="currentColor"/><path d="M12 8v7M9 11h6" ' + DK + '/><path d="M3 20h18v2.200H3z" fill="currentColor"/>'),
    '\u03bb': SVG('<circle cx="12" cy="12" r="6.5" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M12 1.5v6.5M12 16v6.5M1.5 12H8M16 12h6.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="12" r="2.2" fill="currentColor"/>'),
    '\u03c5': SVG('<path d="M6.5 7.5l3.2-3.6 7.800 8.300-3.200 3.600z" fill="currentColor"/><path d="M6 21l4.500-6.500M18 21l-4.500-6.500" stroke="currentColor" stroke-width="2.200" stroke-linecap="round"/><path d="M3 21.500h18" stroke="currentColor" stroke-width="2.200" stroke-linecap="round"/><circle cx="18.500" cy="4.500" r="1.800" fill="currentColor"/>'),
    '\u03bf': SVG('<path d="M3.500 4.500c8.500 1 16 8.500 16 16" fill="none" stroke="currentColor" stroke-width="2.200" stroke-linecap="round"/><path d="M4 20L19 5M19 5h-6M19 5v6" fill="none" stroke="currentColor" stroke-width="2.200" stroke-linecap="round" stroke-linejoin="round"/>')
  });
}
Object.assign(GLYPH, { v:'♙', m:'ⓜ', R:'♖', B:'♗', N:'♘', j:'Ⓛ', d:'Ⓓ', E:'Ⓔ', X:'Ⓧ', H:'Ⓗ', g:'Ⓖ', h:'Ⓒ', u:'Ⓐ', s:'Ⓢ', t:'Ⓣ', });

const PAWN = '<circle cx="12" cy="7" r="3.6" fill="currentColor"/><path d="M8.5 20c.3-4.5 1.6-6 3.5-7.5 1.9 1.5 3.2 3 3.5 7.5z" fill="currentColor"/><rect x="6.5" y="19.5" width="11" height="2.5" rx="1" fill="currentColor"/>';
const CROWN = '<rect x="4.5" y="18" width="15" height="3" rx="1" fill="currentColor"/>';
const STK = 'stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"';
Object.assign(FAIRY_SVG, {   // Imperial Chess icons
  E: SVG('<path d="M5 18l-1.5-9 4.7 3.6L12 6l3.8 6.6L20.5 9 19 18z" fill="currentColor"/>' + CROWN + '<path d="M12 1.5v4M10 3.2h4" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="13.5" r="1.5" style="fill:var(--det)"/>'),
  X: SVG('<path d="M5 18l1.2-8.5 3.3 3L12 6l2.5 6.5 3.3-3L19 18z" fill="currentColor"/>' + CROWN + '<circle cx="6" cy="8.5" r="1.5" fill="currentColor"/><circle cx="12" cy="4.6" r="1.6" fill="currentColor"/><circle cx="18" cy="8.5" r="1.5" fill="currentColor"/><path d="M9 15.5h6" style="stroke:var(--det)" stroke-width="1.4"/>'),
  H: SVG('<path d="M6 18l-1-7 4 2.8L12 8l3 5.8 4-2.8-1 7z" fill="currentColor"/>' + CROWN + '<path d="M12 2l1.6 3H10.4z" fill="currentColor"/><circle cx="12" cy="14" r="1.2" style="fill:var(--det)"/><path d="M9.5 16.2h5" style="stroke:var(--det)" stroke-width="1.2"/>'),
  R: SVG('<path d="M5 21h14v-2.5H5zM7 18.5V10h10v8.5zM5.5 10V4.5H8V7h2V4.5h4V7h2V4.5h2.5V10z" fill="currentColor"/><path d="M12 12l.9 1.9 2.1.3-1.5 1.5.4 2.1-1.9-1-1.9 1 .4-2.1L9 14.2l2.1-.3z" style="fill:var(--det)"/>'),
  B: SVG('<path d="M12 2c3.2 2.6 5.2 5.2 5.2 8.2 0 2-1.4 3.6-2.6 4.6V17H9.4v-2.2C8.2 13.8 6.8 12.2 6.8 10.2 6.8 7.2 8.8 4.6 12 2z" fill="currentColor"/><rect x="5.5" y="18.5" width="13" height="2.8" rx="1" fill="currentColor"/><path d="M12 5.5v5M9.5 8h5" style="stroke:var(--det)" stroke-width="1.5"/><path d="M4 13h3M17 13h3M12 17.2v1" stroke="currentColor" stroke-width="1.6"/>'),
  N: SVG('<path d="M6.5 21.5v-2.5c0-4 2.2-6.2 4.2-8.2L8.2 11.6 6 9l5.2-6.6 3 1.100c3.1 1.2 5.3 4.2 5.3 8.200v9.800z" fill="currentColor"/><circle cx="12.2" cy="7.5" r="1.1" style="fill:var(--det)"/><path d="M9.5 14l2.5 1" style="stroke:var(--det)" stroke-width="1.4"/><path d="M3.5 6l1 2 2 .6-1.5 1.5" stroke="currentColor" stroke-width="1.4" fill="none"/>'),
  g: SVG('<path d="M5 20.500V11a7 7 0 0 1 14 0v9.500z" fill="currentColor"/><path d="M7 10.500h10v2.600H7z" style="fill:var(--det)"/><path d="M12 2.500v5M12 13v7" style="stroke:var(--det)" stroke-width="1.5"/>'),
  h: SVG('<circle cx="12" cy="12" r="9.5" fill="currentColor"/><circle cx="12" cy="12" r="6.6" style="fill:var(--det)"/><path d="M12 5.500v13M5.5 12h13M7.4 7.400l9.2 9.200M16.6 7.400l-9.2 9.2" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="12" r="2.2" fill="currentColor"/>'),
  u: SVG('<path d="M6 2.500c9 3 9 16 0 19" ' + STK + ' stroke-width="2.2"/><path d="M6 2.500v19" stroke="currentColor" stroke-width="1"/><path d="M3 12h17" ' + STK + '/><path d="M21.5 12l-4.5-3.200v6.400z" fill="currentColor"/>'),
  s: SVG('<path d="M12 22V7" ' + STK + ' stroke-width="2.8"/><path d="M3 11.5C4.500 6 8 4 12 4s7.500 2 9 7.500c-3-2-5.500-2.500-9-2.500s-6 .5-9 2.500z" fill="currentColor"/><path d="M8.500 17h7" stroke="currentColor" stroke-width="2"/>'),
  t: SVG('<path d="M2.5 20.500h19" ' + STK + '/><circle cx="7" cy="18" r="3" fill="currentColor"/><circle cx="17" cy="18" r="3" fill="currentColor"/><path d="M6.5 16L17 5" ' + STK + ' stroke-width="2.6"/><path d="M13.5 3.500c1.5-1.3 5-.8 5.5 1.500l-2 2.500z" fill="currentColor"/>'),
  y: SVG('<path d="M12 1.800l6.2 6.700L12 22.2 5.8 8.500z" fill="currentColor"/><path d="M5.8 8.500h12.400M12 1.800l-2.6 6.700L12 22.200l2.6-13.700z" style="stroke:var(--det)" stroke-width="1.1" fill="none"/>'),
  z: SVG('<path d="M12 1.800l2.9 6.3 6.9.7-5.2 4.6 1.5 6.800L12 16.800l-6.1 3.4 1.5-6.800L2.2 8.800l6.9-.7z" fill="currentColor"/><circle cx="12" cy="11.2" r="1.8" style="fill:var(--det)"/>'),
  j: SVG('<path d="M12 1.500l-3.6 7.500h7.200z" fill="currentColor"/><path d="M12 8v14" ' + STK + ' stroke-width="2.2"/><path d="M7.5 11.500h9" ' + STK + '/><path d="M12 12l6 2.5-6 2.500z" fill="currentColor" opacity=".85"/>'),
  f: SVG('<path d="M3 17c.8-5 1.600-9 4.200-12 1 2.400 2.600 3.800 4.800 4.600 2.200-.8 3.800-2.200 4.800-4.600 2.600 3 3.400 7 4.200 12z" fill="currentColor"/><circle cx="3.500" cy="4.500" r="1.800" fill="currentColor"/><circle cx="12" cy="8.200" r="1.500" fill="currentColor"/><circle cx="20.500" cy="4.500" r="1.800" fill="currentColor"/><rect x="5" y="17.500" width="14" height="3.800" rx="1.500" fill="currentColor"/><path d="M12 10.500l2.300 3.200-2.300 3.200-2.300-3.200z" style="fill:var(--det)"/>'),
  d: SVG('<path d="M6 21.500L15 6" ' + STK + ' stroke-width="2.6"/><path d="M13 3.500c4.5-1.3 8.5 1 8.5 5-3.2.4-5.8-.8-7.2-3.200z" fill="currentColor"/><path d="M3 10h4M2 13h5" stroke="currentColor" stroke-width="1.6"/>'),
  v: SVG(PAWN + '<path d="M19 2.500v19" stroke="currentColor" stroke-width="1.7"/><path d="M19 1.200l-2 3.600h4z" fill="currentColor"/>'),
  m: SVG(PAWN + '<path d="M2.2 13.500h3.300M18.5 13.500h3.3" stroke="currentColor" stroke-width="1.8"/><path d="M1.5 13.500l2-1.800v3.600zM22.5 13.500l-2-1.800v3.600z" fill="currentColor"/>'),
  '#': SVG('<rect x="2.5" y="4.5" width="19" height="15" fill="currentColor" opacity=".75"/><path d="M2.5 9.500h19M2.5 14.500h19M8.5 4.500v5M15.5 9.500v5M8.5 14.500v5" style="stroke:var(--det)" stroke-width="1.3"/>')
});
const SVGF = inner => SVG(inner).replace('<svg ', '<svg style="filter:drop-shadow(0 0 1px #000)" ');
const IMP_KQ = {};   // King and Queen keep their normal glyphs
Object.assign(FAIRY_SVG, {   // Prince / Princess: same build as King / Queen (body + base) but a different top and a slimmer shape
  y: SVG('<path d="M12 9.500c-3.5 0-6 2.4-6 5.7 0 2.4 1.2 3.9 2.1 4.600h7.800c.9-.7 2.1-2.2 2.1-4.6 0-3.3-2.5-5.7-6-5.700z" fill="currentColor"/><rect x="5.5" y="19.5" width="13" height="2.6" rx="1" fill="currentColor"/><path d="M12 1.800l3 3.6-3 3.6-3-3.600z" fill="currentColor"/><path d="M12 12.500v4M10 14.500h4" style="stroke:var(--det)" stroke-width="1.3"/>'),
  z: SVG('<path d="M5.5 20L5 10.500l4.3 3.200L12 7.500l2.7 6.200L19 10.5 18.5 20z" fill="currentColor"/><rect x="5" y="19.5" width="14" height="2.6" rx="1" fill="currentColor"/><circle cx="5" cy="9" r="1.5" fill="currentColor"/><circle cx="12" cy="5.8" r="1.7" fill="currentColor"/><circle cx="19" cy="9" r="1.5" fill="currentColor"/><path d="M12 14.200l1.2 1.4-1.2 1.4-1.2-1.400z" style="fill:var(--det)"/>')
});
/* Promotion Chess icons (24x24, same style as FAIRY_SVG). Details use the SOLID colour --dets (CSS lines below set it: light on black pieces, dark on white pieces and on the bright seat colours).
   Courier and Vanguard started as the previous Claude's drafts. Still to draw: tier 2 (except Vanguard). */
const PROMO_ICONS = (() => {
  const SVG = i => '<svg viewBox="0 0 24 24" aria-hidden="true">' + i + '</svg>';
  const BASE = '<rect x="5" y="19.5" width="14" height="2.6" rx="1" fill="currentColor"/>';
  const DK = 'style="stroke:var(--dets)" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"';
  const DKS = 'style="stroke:var(--detS,var(--dets))" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"';   // solid (opaque) arrow colour
  const FIL = 'style="fill:var(--dets)"';
  const ST = 'stroke="currentColor" stroke-width="1.6" stroke-linecap="round"';
  const HORSE = '<path d="M7 21c0-4.7 1.6-7.6 3.8-9.6L9.8 8 12.2 6.6 13 3l2.4 2.2C18.6 6.8 20 10 20 14v7z" fill="currentColor"/>';
  const EYE = '<circle cx="15" cy="9.5" r="1.1" ' + FIL + '/>';
  const PAWN = '<circle cx="12" cy="7.2" r="3.3" fill="currentColor"/><rect x="8" y="10.8" width="8" height="1.9" rx=".95" fill="currentColor"/><path d="M7.6 19.5c0-3.4 1-5.4 2.3-6.8h4.2c1.3 1.4 2.3 3.4 2.3 6.8z" fill="currentColor"/>';
  // bishop family: mitre body + base
  const MITRE = '<path d="M12 5.2c3.3 2.5 5.6 5.3 5.6 8.5 0 2.3-1.5 3.8-2.8 4.5H9.2C7.9 17.5 6.4 16 6.4 13.7 6.4 10.5 8.7 7.7 12 5.2z" fill="currentColor"/><rect x="7" y="17" width="10" height="2.3" rx="1" fill="currentColor"/>' + BASE;
  // rook family: tower; spurs = the diagonal step
  const TOWER = '<path d="M4 3.5h3.4v2.4h2.4V3.5h4.4v2.4h2.4V3.5H20v6.2l-2.6 1.8V17H20v2.5H4V17h2.6v-5.5L4 9.7z" fill="currentColor"/><rect x="4.5" y="19.3" width="15" height="2.6" rx="1" fill="currentColor"/>';
  const SPURS = '<path d="M2 21.8l3.2-3.2v3.2zM22 21.8l-3.2-3.2v3.2z" fill="currentColor"/>';
  // queen family: crown (three points with balls) + band
  const CROWN = '<path d="M4.5 19L3 8l4.6 3.8L12 4l4.4 7.8L21 8l-1.5 11z" fill="currentColor"/><circle cx="3" cy="6.6" r="1.4" fill="currentColor"/><circle cx="12" cy="2.8" r="1.5" fill="currentColor"/><circle cx="21" cy="6.6" r="1.4" fill="currentColor"/><rect x="4" y="18.5" width="16" height="3.3" rx="1.2" fill="currentColor"/>';
  // king family: orb body + band + base
  const ORB = '<path d="M6 19.5C5.5 14 7.5 10.5 12 8.5c4.5 2 6.5 5.5 6 11z" fill="currentColor"/><rect x="5" y="17.3" width="14" height="2.2" rx="1" fill="currentColor"/>' + BASE;
  return {
    // ---- Bishop forms
    abbot:       SVG('<path d="M12 1.4v4M10 3.2h4" ' + ST + '/>' + MITRE + '<path d="M10 10l4 3.4" ' + DK + '/>'),                                             // cross on top: bishop + a quiet orthogonal step
    inquisitor:  SVG('<path d="M12 .8l1.8 3.8h-3.6z" fill="currentColor"/>' + MITRE + '<path d="M14 10l-4 3.4" ' + DK + '/><circle cx="12" cy="15.2" r=".9" ' + FIL + '/>'),   // spear tip: orthogonal step that only captures
    zealot:      SVG('<path d="M12 .8c2 1.6 2.6 3 1.7 4.5-.5.8-1.7 1-1.7 1s-1.2-.2-1.7-1C9.4 3.8 10 2.4 12 .8z" fill="currentColor"/>' + MITRE + '<path d="M8.6 11.4h6.8M8.6 14.2h6.8" ' + DK + ' stroke-dasharray="1.6 1.6"/>'),   // flame + dashed lines: slides through its own pieces
    // ---- Knight forms
    paladin:     SVG(HORSE + '<circle cx="15" cy="9.5" r="1.1" ' + FIL + '/><path d="M12 14.2v4.2M9.9 16.3h4.2" ' + DK + '/>'),
    outrider:    SVG(HORSE + EYE + '<path d="M9.4 18l4.6-4.6M14 13.4v3M14 13.4h-3" ' + DK + '/>'),                                                              // spear-point: diagonal step that only captures
    hussar:      SVG(HORSE + EYE + '<path d="M15.6 5.4c2.4-1.8 4.6-1.4 5.8.2-1.8.1-3.4.8-4.6 2z" fill="currentColor"/><path d="M9.6 18.2c1.2-2.2 3.2-2.8 5-1.6" ' + DK + '/>'),   // plume + a long leap
    // ---- Rook forms
    bulwark:     SVG(TOWER.replace('<rect', SPURS + '<rect') + '<path d="M9.8 11.8l4.4 4.4M14.2 11.8l-4.4 4.4" ' + DK + '/>'),
    warden:      SVG(TOWER.replace('<rect', SPURS + '<rect') + '<path d="M9.6 11.4h4.8v3.2c0 1.3-1.4 2.2-2.4 2.7-1-.5-2.4-1.4-2.4-2.7z" ' + DK + '/>'),   // shield: the diagonal step captures
    ferry:       SVG(TOWER + '<path d="M6.8 12.2c1.2-1.2 2.3-1.2 3.4 0s2.3 1.2 3.4 0 2.3-1.2 3.4 0M6.8 15.2c1.2-1.2 2.3-1.2 3.4 0s2.3 1.2 3.4 0 2.3-1.2 3.4 0" ' + DK + '/>'),   // waves: crosses over a friendly piece
    // ---- Queen forms
    regent:      SVG(CROWN + '<path d="M12 11l1.9 2.1-1.9 2.1-1.9-2.1z" ' + FIL + '/>'),
    archon:      SVG(CROWN + '<path d="M12 9.8l1.1 2.6 2.6 1.1-2.6 1.1-1.1 2.6-1.1-2.6-2.6-1.1 2.6-1.1z" ' + FIL + '/>'),                                         // 4-point star: knight leaps that only capture
    vizier:      SVG(CROWN + '<path d="M9.2 11.2l2.8 2.2 2.8-2.2M9.2 14.6l2.8 2.2 2.8-2.2" ' + DK + '/>'),                                                          // double chevron: the 2-square leap
    // ---- King forms
    sovereign:   SVG('<rect x="10.7" y="1" width="2.6" height="6.8" rx=".6" fill="currentColor"/><rect x="8.6" y="3" width="6.8" height="2.6" rx=".6" fill="currentColor"/>' + ORB + '<path d="M9 15v-2.5h2.4M15 15v-2.5h-2.4" ' + DK + '/>'),
    warlord:     SVG('<path d="M12 .6l1.7 2.8v4.6h-3.4V3.4z" fill="currentColor"/><rect x="8.4" y="7" width="7.2" height="1.8" rx=".6" fill="currentColor"/>' + ORB + '<path d="M9.6 11.6l4.8 4.4M14.4 11.6L9.6 16" ' + DK + '/>'),   // blade on top
    chamberlain: SVG('<circle cx="12" cy="3.7" r="2.4" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M12 6.1v2.4" ' + ST + '/>' + ORB + '<path d="M9 12.6h6l-1.9-1.9M15 15.6H9l1.9 1.9" ' + DK + '/>'),   // key + swap arrows
    // ---- tier 2
    primate:     SVG('<path d="M12 .8v5.2M10.4 2.2h3.2M10.8 3.9h2.4" ' + ST + '/>' + MITRE + '<path d="M9.8 9.8l4.4 3.6M9.8 12.8l4.4 3.6" ' + DK + '/>'),
    crusader:    SVG(HORSE + EYE + '<path d="M9 19.2l5.2-5.2M12.2 13.4l3 3" ' + DK + '/>'),
    vaulter:     SVG(HORSE + EYE + '<path d="M8.6 18.4c1-2.2 2.6-2.8 3.8-1.8M12 15.8c1-2.2 2.6-2.8 3.8-1.8" ' + DK + '/>'),
    citadel:     SVG(TOWER.replace('<rect', SPURS + '<rect') + '<path d="M9.8 17v-2.6a2.2 2.2 0 0 1 4.4 0V17" ' + DK + '/>'),
    ruler:       SVG(TOWER + '<path d="M7.6 13.4h8.8M9.2 11.6v3.6M12 11.6v3.6M14.8 11.6v3.6" ' + DK + '/>'),
    paragon:     SVG(CROWN + '<circle cx="12" cy="13" r="2.4" fill="none" style="stroke:var(--dets)" stroke-width="1.5"/><circle cx="12" cy="13" r=".8" ' + FIL + '/>'),
    switch:      SVG(CROWN + '<path d="M9 12.6h6l-1.9-1.9M15 15.6H9l1.9 1.9" ' + DK + '/>'),
    monarch:     SVG('<path d="M8.8 7.8l.8-4.4 2.4 2.4 2.4-2.4.8 4.4z" fill="currentColor"/><circle cx="12" cy="2.2" r="1.3" fill="currentColor"/>' + ORB + '<path d="M9 15v-2.5h2.4M15 15v-2.5h-2.4" ' + DK + '/><circle cx="12" cy="14.2" r=".8" ' + FIL + '/>'),
    tyrant:      SVG('<path d="M8.4 8.4L9.2 2.4l2.2 3 .6-4.2.6 4.2 2.2-3 .8 6z" fill="currentColor"/>' + ORB + '<circle cx="10.4" cy="13.2" r=".95" ' + FIL + '/><circle cx="13.6" cy="13.2" r=".95" ' + FIL + '/><path d="M10.2 16.2h3.6" ' + DK + '/>'),
    pinwheel:    SVG(HORSE + EYE + '<path d="M12 14.4v-2.6M12 14.4h2.6M12 14.4v2.6M12 14.4h-2.6" ' + DK + '/>'),
    valkyrie:    SVG(CROWN + '<path d="M12 9.4v7.4M10.2 11.4l1.8-2 1.8 2" ' + DK + '/>'),
    tower:       SVG(TOWER + '<path d="M8.6 11.2v5.4M15.4 11.2v5.4M7.2 13l1.4-1.8 1.4 1.8M14 13l1.4-1.8 1.4 1.8" ' + DK + '/>'),
    tarzan:      SVG('<path d="M12 2v5.4M9.6 4.2h4.8" ' + ST + '/>' + ORB + '<path d="M8.6 16.2c1.2-4.6 5.6-4.6 6.8 0M13.4 11.8l2 .6-.6 2" ' + DK + '/>'),
    ricochet:    SVG(MITRE + '<path d="M8.4 16.6l3.2-3.8 1.6 2 2.6-3.6M14.4 10.8h1.6v1.6" ' + DK + '/>'),
    phantom:     SVG(MITRE + '<circle cx="10.4" cy="11.4" r=".95" ' + FIL + '/><circle cx="13.6" cy="11.4" r=".95" ' + FIL + '/><path d="M8.8 15.4c.8.9 1.6.9 2.4 0s1.6-.9 2.4 0 1.6.9 2.4 0" ' + DK + '/>'),
    juggernaut:  SVG(PAWN + BASE + '<path d="M9.4 13.4h5.2v2.2c0 1.1-1.2 1.9-2.6 2.3-1.4-.4-2.6-1.2-2.6-2.3z" ' + DKS + '/>'),
    gemini:      SVG('<g transform="translate(-4.6 2.4) scale(.74)">' + PAWN + '</g><g transform="translate(6.6 2.4) scale(.74)">' + PAWN + '</g>' + BASE),
    titan:       SVG(PAWN + BASE + '<path d="M8.6 13.2h6.8v2.6c0 1.4-1.5 2.4-3.4 2.9-1.9-.5-3.4-1.5-3.4-2.9z" ' + DKS + '/><path d="M10 15.2l2 1.4 2-1.4" ' + DK + '/>'),
    mirror:      SVG('<g transform="translate(-4.6 2.4) scale(.74)">' + PAWN + '</g><g transform="translate(6.6 2.4) scale(.74)">' + PAWN + '</g>' + BASE + '<path d="M12 3.4v13" ' + DK + ' stroke-dasharray="1.4 1.6"/>'),
    // ---- pawn forms (Courier and Vanguard are the previous Claude's drafts)
    strafer:   SVG(PAWN + BASE + '<path d="M10 15.6h4M11.2 14.4l-1.2 1.2 1.2 1.2M12.8 14.4l1.2 1.2-1.2 1.2" ' + DKS + '/>'),                       // double arrow: sideways steps
    brawler:   SVG(PAWN + BASE + '<path d="M12 12.8v1.8M10.2 13.6l1.2 1.2M13.8 13.6l-1.2 1.2M10 16.6h1.6M12.4 16.6H14" ' + DKS + '/>'),                    // burst: captures ahead, diagonally and sideways
    courier:   SVG(PAWN + BASE + '<path d="M9.8 16l2.2-1.8 2.2 1.8M9.8 18.4l2.2-1.8 2.2 1.8" ' + DKS + '/>'),                                              
    vanguard:  SVG(PAWN + BASE + '<path d="M7.2 5a5.7 5.7 0 0 1 9.6 0" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linecap="round"/><path d="M10 15.2l2-1.3 2 1.3M10 17.1l2-1.3 2 1.3M10 19l2-1.3 2 1.3" ' + DKS.replace('1.5', '1.1') + '/>')
  };
})();
Object.keys(Promotion.CODE).forEach(k => { const c = Promotion.CODE[k]; GLYPH[c] = Promotion.NAME[c].slice(0, 2); if (PROMO_ICONS[k]) FAIRY_SVG[c] = PROMO_ICONS[k]; });      // Promotion Chess forms
/* ---- SKINS: the CLASSIC piece art, frozen exactly as it is today (copies made after every icon above has been defined).
   Nothing reads SKIN_CLASSIC yet: the live look is still drawn from GLYPH / FAIRY_SVG / IMP_KQ. When the icon remake lands, the new set becomes the
   default and this one stays selectable as the "Classic" skin (one skin per player, sent in hello/info). Do not edit these copies. */
const SKIN_CLASSIC = Object.freeze({ id: 'classic', name: 'Classic', glyph: Object.freeze(Object.assign({}, GLYPH)), svg: Object.freeze(Object.assign({}, FAIRY_SVG)), impKQ: Object.freeze(Object.assign({}, typeof IMP_KQ !== 'undefined' ? IMP_KQ : {})), promo: Object.freeze(Object.assign({}, PROMO_ICONS)) });
/* ---- NEW DEFAULT PIECE ART (drawn in the same language as the Imperial / custom pieces: solid body, small base, details cut out in --det).
   Defined AFTER SKIN_CLASSIC on purpose, so the old classic look (text glyphs + the old neutral art) stays available as that skin. ---- */
const CL_BASE = '<rect x="5.5" y="19.5" width="13" height="2.6" rx="1" fill="currentColor"/>', CL_DET = 'style="stroke:var(--det)" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"';
const SKIN_NEW = {
  p: SVG('<circle cx="12" cy="7.2" r="3.4" fill="currentColor"/><path d="M8.2 11.6h7.6l-.4 1.5c-.5 2 .7 3.200 1.800 4.400V19.500H6.800V17.500c1.100-1.200 2.300-2.400 1.800-4.400z" fill="currentColor"/>' + CL_BASE),
  r: SVG('<path d="M5.500 10V4.500H8V7h2V4.500h4V7h2V4.500h2.500V10l-1.500 1.500.8 8H6.200l.8-8z" fill="currentColor"/>' + CL_BASE + '<path d="M9.500 14.500v3.500M14.500 14.500v3.500" ' + CL_DET + '/>'),
  n: SVG('<path d="M6.500 19.500c0-4.200 1.600-6.800 4-9L8 9.600 6.200 7.200 10.800 2.800l1.400 1.400C16.600 5 19.500 8.200 19.500 12.600v6.900z" fill="currentColor"/>' + CL_BASE + '<circle cx="12.600" cy="8.400" r="1.150" style="fill:var(--det)"/><path d="M8.200 11.700l2 .9" ' + CL_DET + '/>'),
  b: SVG('<path d="M12 3.600c3.200 2.400 5 5 5 8 0 2-1.200 3.600-2.400 4.600V19.800H9.400v-3.600C8.200 15.200 7 13.600 7 11.600c0-3 1.800-5.600 5-8z" fill="currentColor"/><circle cx="12" cy="2.600" r="1.400" fill="currentColor"/>' + CL_BASE + '<path d="M13.800 6.500l-3.400 5.200" ' + CL_DET + '/>'),
  q: SVG('<path d="M5.500 19.500L3.800 8.500l4.300 3.600L12 5.400l3.900 6.700 4.300-3.600-1.700 11z" fill="currentColor"/><circle cx="3.600" cy="7" r="1.500" fill="currentColor"/><circle cx="8" cy="4.200" r="1.500" fill="currentColor"/><circle cx="12" cy="3.200" r="1.700" fill="currentColor"/><circle cx="16" cy="4.200" r="1.500" fill="currentColor"/><circle cx="20.400" cy="7" r="1.500" fill="currentColor"/>' + CL_BASE + '<path d="M8.500 15.800h7" ' + CL_DET + '/>'),
  k: SVG('<path d="M12 8.600c-3.900 0-7 2.600-7 6.200 0 1.800.8 3.300 2 4.700h10c1.200-1.400 2-2.900 2-4.700 0-3.600-3.100-6.200-7-6.200z" fill="currentColor"/>' + CL_BASE + '<path d="M12 1.400v6M9.200 4h5.600" stroke="currentColor" stroke-width="2.100" stroke-linecap="round"/><path d="M8.500 15.600h7" ' + CL_DET + '/>')
};
const SKIN_NEW_NEUTRAL = {
  boar: SVG('<path d="M3.600 9.500L5.800 3.200l3.700 3.300h5L18.200 3.200l2.200 6.300c.2 5.700-2.800 10.300-8.400 10.300S3.400 15.200 3.600 9.500z" fill="currentColor"/><ellipse cx="12" cy="15" rx="4" ry="3" style="fill:var(--det)"/><circle cx="10.400" cy="15" r=".9" fill="currentColor"/><circle cx="13.600" cy="15" r=".9" fill="currentColor"/><circle cx="8" cy="10.200" r="1.200" style="fill:var(--det)"/><circle cx="16" cy="10.200" r="1.200" style="fill:var(--det)"/><path d="M8.600 17.600C6 18 3.600 16.200 3 13.400M15.400 17.600c2.600.4 5-1.400 5.600-4.200" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>'),
  hound: SVG('<path d="M4.200 2.800l4.600 4.200h6.400l4.600-4.200 1 9.200c0 4.800-3.600 8.600-8.800 9.800C6.800 20.600 3.200 16.800 3.200 12z" fill="currentColor"/><path d="M7.200 10.400l3 1M16.800 10.400l-3 1" ' + CL_DET + '/><path d="M12 12.800v3.400" ' + CL_DET + '/><path d="M9.800 14.600h4.400l-2.200 2.800z" style="fill:var(--det)"/><path d="M9.800 18.400c1.400 1 3 1 4.400 0" ' + CL_DET + '/>'),
  burrower: SVG('<ellipse cx="12" cy="19.500" rx="9.500" ry="2.800" fill="currentColor"/><ellipse cx="12" cy="19.300" rx="6" ry="1.500" style="fill:var(--det)"/><path d="M12 19c-.3-4.500-4.500-5.500-4-9.500.4-3 3.600-5 6.500-3.500" stroke="currentColor" stroke-width="4.200" fill="none" stroke-linecap="round"/><circle cx="12.600" cy="5.800" r="3.400" fill="currentColor"/><circle cx="11.400" cy="5.200" r=".9" style="fill:var(--det)"/><circle cx="14.200" cy="5.200" r=".9" style="fill:var(--det)"/>')
};
Object.assign(FAIRY_SVG, SKIN_NEW);
{ const NTn = Engine.NEUTRAL_T; FAIRY_SVG[NTn.boar] = SKIN_NEW_NEUTRAL.boar; FAIRY_SVG[NTn.hound] = SKIN_NEW_NEUTRAL.hound; FAIRY_SVG[NTn.burrower] = SKIN_NEW_NEUTRAL.burrower; }

/* ---- ICON FIXES (defined after SKIN_CLASSIC so the frozen Classic copies keep the old art) ---- */
{
  const CB = '<rect x="5.5" y="19.5" width="13" height="2.6" rx="1" fill="currentColor"/>', D = 'style="stroke:var(--det)" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round"', DF = 'style="fill:var(--det)"';
  // Knight head, facing left. One shape shared by the Knight and the Zebra.
  const KN = '<path d="M6.5 19.5c.1-3 1.3-5.2 3.2-7.1L6.4 13c-1.800.1-2.900-.9-2.900-2.300l.4-1.900 4.400-3.900L9.500 2.300l2.400 1.700c4.300.6 7.300 4.300 7.300 9.200v6.300z" fill="currentColor"/>';
  const KEY = (id => id)('n');
  Object.assign(FAIRY_SVG, {
    n: SVG(KN + CB + '<circle cx="9" cy="8.300" r="1" ' + DF + '/><path d="M4.800 10.800l.9.4" ' + D + '/><path d="M12.500 6.200c2.400 1 4 3.600 4.200 6.600" ' + D + '/>'),
    '\u03c6': SVG('<path d="M12 1.800l3.200 3.600-3.200 3.600-3.200-3.600z" fill="currentColor"/><path d="M10.400 8.200h3.200l.5 4.500c.2 1.800 2.300 3.100 3.100 6.800H6.800c.8-3.700 2.900-5 3.100-6.800z" fill="currentColor"/>' + CB + '<path d="M10.200 15.200l3.600 2.600M13.800 15.200l-3.600 2.600" ' + D + '/>'),
    '\u03b1': SVG('<path d="M12 1.800c3 2.300 5.200 4.900 5.200 7.900 0 1.900-1 3.200-2.100 4.100v1.300H9v-1.300c-1.100-.9-2.200-2.200-2.200-4.100 0-3 2.200-5.600 5.200-7.900z" fill="currentColor"/><path d="M6.800 8.800L3 11.200l3.800 2.200zM17.200 8.800L21 11.200l-3.800 2.200z" fill="currentColor"/><path d="M8 16.200h8l1.200 2.200H6.800z" fill="currentColor"/>' + CB + '<path d="M13.600 6.200l-3.200 4.600" ' + D + '/>'),
    '\u03b6': SVG('<clipPath id="zbclip"><path d="M7 21c0-4.7 1.6-7.6 3.8-9.6L9.8 8 12.2 6.6 13 3l2.4 2.2C18.6 6.8 20 10 20 14v7z"/></clipPath><path d="M7 21c0-4.7 1.6-7.6 3.8-9.6L9.8 8 12.2 6.6 13 3l2.4 2.2C18.6 6.8 20 10 20 14v7z" fill="currentColor"/><g clip-path="url(#zbclip)" ' + D + ' stroke-width="1.7" stroke-linecap="butt"><path d="M6 13.6l15-3.8M6 16.9l15-3.8M6 20.2l15-3.8"/></g><circle cx="15" cy="9.5" r="1.1" ' + DF + '/>' + CB.replace('x="5.5"','x="5"').replace('width="13"','width="14"')),
    '\u03c0': SVG('<g transform="rotate(-38 10.500 14)"><rect x="3.500" y="10.700" width="15" height="6.200" rx="2.400" fill="currentColor"/><rect x="16.800" y="9.700" width="3.600" height="8.200" rx="1.400" fill="currentColor"/><path d="M6 13.800h8.500" ' + D + '/></g><circle cx="9.500" cy="16.200" r="4.100" fill="currentColor"/><circle cx="9.500" cy="16.200" r="1.500" ' + DF + '/>' + CB.replace('x="5.5"', 'x="3.500"').replace('width="13"', 'width="14"')),
    '\u03c5': SVG('<path d="M10 14.500L6 19.500M14 14.500l4 5" stroke="currentColor" stroke-width="1.900" stroke-linecap="round"/><g transform="rotate(14 12 18)"><path d="M7.600 3.600h8.800l-1 3.200H8.600z" fill="currentColor"/><path d="M8.800 6.800h6.400l1.200 11.700H7.600z" fill="currentColor"/><path d="M8.200 11.200h7.600M7.900 14.200h8.200" ' + D + '/></g>' + CB + '<circle cx="19" cy="4.200" r="1.800" fill="currentColor"/>'),
    z: SVG('<path d="M12 8.600c1.500 0 2.600 1.100 2.600 2.600 0 1-.5 1.800-1.200 2.200l.7 1.600c2.800.9 4.100 2.800 4.800 4.500H5.100c.7-1.700 2-3.600 4.800-4.500l.7-1.600c-.7-.4-1.200-1.200-1.200-2.200 0-1.500 1.100-2.600 2.600-2.600z" fill="currentColor"/><path d="M8.200 7.800L9.300 3.400 12 5.600l2.700-2.200 1.100 4.400z" fill="currentColor"/>' + CB + '<circle cx="12" cy="5.900" r=".8" ' + DF + '/>')
  });
  // twin pawns: symmetrical about the centre line, bases level
  const PW = '<circle cx="12" cy="7.200" r="3.300" fill="currentColor"/><rect x="8" y="10.800" width="8" height="1.900" rx=".95" fill="currentColor"/><path d="M7.600 19.500c0-3.400 1-5.400 2.300-6.800h4.200c1.300 1.400 2.300 3.400 2.300 6.800z" fill="currentColor"/>';
  const TW = (x, s) => '<g transform="translate(' + x + ' ' + (19.500 * (1 - s)).toFixed(2) + ') scale(' + s + ') translate(-12 0)">' + PW + '</g>';
  const BS = '<rect x="4" y="19.500" width="16" height="2.600" rx="1" fill="currentColor"/>';
  const dk = 'style="stroke:var(--dets)" stroke-width="1.4" fill="none" stroke-linecap="round"';
  PROMO_ICONS.gemini = SVG(TW(7.200, .72) + TW(16.800, .72) + '<rect x="9.600" y="14.200" width="4.800" height="1.800" rx=".9" fill="currentColor"/>' + BS);
  PROMO_ICONS.mirror = SVG(TW(7.200, .72) + TW(16.800, .72) + BS + '<path d="M12 3.200v13.800" ' + dk + ' stroke-dasharray="1.500 1.700"/>');
  FAIRY_SVG[Promotion.CODE.gemini] = PROMO_ICONS.gemini; FAIRY_SVG[Promotion.CODE.mirror] = PROMO_ICONS.mirror;
}

/* ---- LOOK: "Default" = the new SVG figures; "Classic" = the original text figures for p n b r q k and the old neutral-piece art (SKIN_CLASSIC) ---- */
const LOOK = { classic: skLs('cwfClassic', '0') === '1' };
const CLASSIC_ONLY = new Set(['p', 'n', 'b', 'r', 'q', 'k', Engine.NEUTRAL_T.boar, Engine.NEUTRAL_T.hound, Engine.NEUTRAL_T.burrower]), CLASSIC_TXT = new Set(['p', 'n', 'b', 'r', 'q', 'k']);
const art = t => (LOOK.classic && CLASSIC_ONLY.has(t)) ? SKIN_CLASSIC.svg[t] : FAIRY_SVG[t];
const isFairy = t => FAIRY.includes(t) && !(LOOK.classic && CLASSIC_TXT.has(t));
function setLook(classic) {
  LOOK.classic = !!classic; skLsSet('cwfClassic', classic ? '1' : '0'); document.querySelectorAll('input[name=lookSel]').forEach(r => { r.checked = (r.value === 'classic') === !!classic; });
  if (typeof Practice !== 'undefined' && Practice.refresh) { try { Practice.refresh(); } catch (e) { /* ignore */ } }
  if (game) render();
}

function takeSkins(imgs) {
  if (!imgs || typeof imgs !== 'object') return 0; let n = 0;
  for (const hh of Object.keys(imgs).slice(0, 40)) { const d = imgs[hh]; if (!/^[0-9a-f]{16}$/.test(hh) || SKIN.imgs.has(hh) || !safeSkinImg(d) || skHash(d) !== hh) continue; if (SKIN.imgs.size >= 600) break; SKIN.imgs.set(hh, d); n++; }
  if (n && game) render(); return n;
}
function skinWanted() {                                       // the pictures the current players actually refer to (mine only for the pieces this mode can show)
  const w = new Set(), used = modeTypes(), add = k => { if (k) for (const t in k) skHashes(k[t]).forEach(h => w.add(h)); };
  for (const t in SKIN.mine) if (used.has(t)) skHashes(SKIN.mine[t]).forEach(h => w.add(h));
  Object.keys(seatInfo || {}).forEach(s => add(seatInfo[s] && seatInfo[s].k)); add(peerInfo && peerInfo.k); (conns || []).forEach(c => add(c.sk)); return w;
}
function sendSkins(c) {                                       // host -> one connection: every wanted picture it has not been sent yet, in small batches
  if (!c || !c.open || !c.send) return; c.skinSent = c.skinSent || new Set(); let batch = {}, n = 0; const want = skinWanted();
  for (const [hh, d] of SKIN.imgs) { if (c.skinSent.has(hh) || !want.has(hh)) continue; c.skinSent.add(hh); batch[hh] = d; if (++n % 6 === 0) { c.send({ type: 'skinData', imgs: batch }); batch = {}; } }
  if (Object.keys(batch).length) c.send({ type: 'skinData', imgs: batch });
}
let skSentToHost = new Set();
function guestSendSkins() {                                   // guest -> host: my own pictures, once
  if (isHost || !conn || !conn.open) return; let batch = {}, n = 0;
  const used = modeTypes(); for (const t in SKIN.mine) { if (!used.has(t)) continue; for (const hh of skHashes(SKIN.mine[t])) { if (skSentToHost.has(hh) || !SKIN.imgs.has(hh)) continue; skSentToHost.add(hh); batch[hh] = SKIN.imgs.get(hh); if (++n % 6 === 0) { conn.send({ type: 'skinPut', imgs: batch }); batch = {}; } } }
  if (Object.keys(batch).length) conn.send({ type: 'skinPut', imgs: batch });
}
const SkDB = (() => {                                         // presets: { id, name, pieces: { type: { img, m, x, y, s } } }; falls back to memory when IndexedDB is not available
  let db = null; const mem = new Map();
  const open = () => new Promise(res => { if (db) return res(db); try { const rq = indexedDB.open('cwf-skins', 1); rq.onupgradeneeded = () => rq.result.createObjectStore('presets', { keyPath: 'id' }); rq.onsuccess = () => { db = rq.result; res(db); }; rq.onerror = () => res(null); } catch (e) { res(null); } });
  const run = (mode, fn) => open().then(d => d ? new Promise(res => { try { const tx = d.transaction('presets', mode), os = tx.objectStore('presets'), rq = fn(os); tx.oncomplete = () => res(rq && rq.result); tx.onerror = () => res(null); } catch (e) { res(null); } }) : null);
  return {
    raw: () => run('readonly', os => os.getAll()).then(r => (r === null ? [...mem.values()] : r || [])),
    all: () => SkDB.raw().then(l => l.filter(p => !p.draft)),
    drafts: () => SkDB.raw().then(l => l.filter(p => p.draft)),
    put: p => { mem.set(p.id, p); return run('readwrite', os => os.put(p)); },
    del: id => { mem.delete(id); return run('readwrite', os => os.delete(id)); }
  };
})();
const skMig = (e, t) => {      // a stored preset piece -> { v: 2, mode: 'piece' | 'shape' | 'free', c, k, b, l: [ { img, x, y, s, r, f, o } ] } (older presets: one picture on the piece itself, or m: 0 | 1)
  if (!e || typeof e !== 'object') return null; let l;
  if (Array.isArray(e.l)) l = e.l.filter(L => L && safeSkinImg(L.img)).slice(0, SK_LAYERS).map(L => Object.assign({ x: 0, y: 0, s: 100, r: 0, f: 0, o: 100 }, L));
  else if (safeSkinImg(e.img)) l = [{ img: e.img, x: e.x || 0, y: e.y || 0, s: e.s || 100, r: 0, f: 0, o: 100 }]; else return null;
  const k = typeof e.k === 'string' && SK_K.test(e.k) ? e.k : null, md = e.mode === 'shape' && k ? 'shape' : e.mode === 'free' || (!e.mode && e.m === 0) ? 'free' : 'piece';
  if (e.v !== 2 && md === 'free' && t !== Engine.NEUTRAL_T.boss) l.forEach(L => { L.x = Math.round(L.x * SK_UNIT); L.y = Math.round(L.y * SK_UNIT); L.s = Math.max(5, Math.round(L.s * SK_UNIT)); });
  return { v: 2, mode: md, c: e.c ? 1 : 0, k, b: Object.assign({ v: 1, x: 0, y: 0, s: 100, r: 0 }, e.b || {}), l };
};
const skDesc = e => {
  const l = (e.l || []).map(L => { if (!L.h) L.h = skHash(L.img); if (!SKIN.imgs.has(L.h)) SKIN.imgs.set(L.h, L.img); return skLayer(L); }).filter(Boolean); if (!l.length) return null;
  const md = e.mode || 'piece', d = { v: 2, m: md === 'free' ? 0 : 1, c: e.c ? 1 : 0, l };
  if (md === 'shape' && e.k && SK_K.test(e.k)) d.k = e.k; if (md === 'free') { const b = skBaseSet(e.b); if (b) d.b = b; }
  return d;
};
function skinActivate(p) {                                    // make a preset the one everybody sees (null = none)
  SKIN.preset = p || null; SKIN.mine = {};
  if (p) Object.keys(p.pieces || {}).forEach(t => { const e = skMig(p.pieces[t], t), d = e && skDesc(e); if (d && t.length <= 3 && t !== '__proto__') SKIN.mine[t] = d; });
  skLsSet('cwfSkinActive', p ? p.id : '');
  if (typeof announceProfile === 'function') announceProfile(); else if (game) render();
}
SkDB.all().then(list => { const id = skLs('cwfSkinActive', ''), p = list.find(q => q.id === id); if (p) skinActivate(p); });
const setGlyph = (el, t, owner) => { const sk = owner != null ? skinHTML(t, owner) : null; if (sk) el.innerHTML = sk; else if (game && game.imperial && IMP_KQ[t]) el.innerHTML = IMP_KQ[t]; else if (art(t)) el.innerHTML = art(t); else el.textContent = GLYPH[t]; };
const $ = id => document.getElementById(id);
// In-page confirmation dialog (replaces the browser's confirm box). askConfirm(text, okLabel, danger) -> Promise<boolean>
function askConfirm(text, okLabel, danger) {
  return new Promise(res => {
    const back = $('dlgBack'), ok = $('dlgOk'), no = $('dlgNo'), prevFocus = document.activeElement;
    $('dlgMsg').textContent = text; ok.textContent = okLabel || 'OK'; ok.classList.toggle('danger', !!danger);
    const done = v => { back.classList.add('hidden'); document.removeEventListener('keydown', key, true); ok.onclick = no.onclick = back.onclick = null; if (prevFocus && prevFocus.focus) prevFocus.focus(); res(v); };
    const key = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false); } else if (e.key === 'Enter' && document.activeElement !== no) { e.preventDefault(); e.stopPropagation(); done(true); } };
    ok.onclick = () => done(true); no.onclick = () => done(false); back.onclick = e => { if (e.target === back) done(false); };
    document.addEventListener('keydown', key, true); back.classList.remove('hidden'); (danger ? no : ok).focus();
  });
}
// In-page text box (replaces the browser's prompt box). askText(text, value, okLabel, maxLength) -> Promise<string | null>
function askText(text, value, okLabel, max) {
  return new Promise(res => {
    const back = $('dlgBack'), ok = $('dlgOk'), no = $('dlgNo'), inp = $('dlgIn'), prevFocus = document.activeElement;
    $('dlgMsg').textContent = text; ok.textContent = okLabel || 'OK'; ok.classList.remove('danger'); inp.classList.remove('hidden'); inp.value = value || ''; inp.maxLength = max || 40;
    const done = v => { back.classList.add('hidden'); inp.classList.add('hidden'); document.removeEventListener('keydown', key, true); ok.onclick = no.onclick = back.onclick = null; if (prevFocus && prevFocus.focus) prevFocus.focus(); res(v); };
    const take = () => { const t = inp.value.trim(); done(t || null); };
    const key = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(null); } else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); take(); } };
    ok.onclick = take; no.onclick = () => done(null); back.onclick = e => { if (e.target === back) done(null); };
    document.addEventListener('keydown', key, true); back.classList.remove('hidden'); inp.focus(); inp.select();
  });
}
let mode = 'standard', game = null, peer, conn, myColor = 'w', isHost = false, sel = null, over = null;
let overRes = null, M = null, A4 = null, pal = 'p', setupMsg = '', centered = false;   // M = Austang match state
const COST = { k: 0, p: 1, n: 3, b: 3, r: 5, q: 9 };
// Austang modes: board size, army palette, prices, default settings and default piece limits (the host can change every limit; an empty box = no limit)
const PNAMES = { k: 'King', p: 'Pawn', n: 'Knight', b: 'Bishop', r: 'Rook', q: 'Queen', '\u03b1': 'Cardinal', '\u03c7': 'Marshal', '\u03c9': 'Amazon', '\u03bd': 'Nightrider', '\u03b3': 'Camel', '\u03b6': 'Zebra', '\u03b4': 'Dragon King', '\u03b7': 'Dragon Horse', '\u03ba': 'Centaur', '\u03b2': 'Bison', '\u03c0': 'Cannon', '\u03b8': 'Grasshopper', '\u03c6': 'Ferz', '\u03c8': 'Wazir', '\u03be': 'Alfil', '\u03c4': 'Dabbaba', '\u03c1': 'Berolina Pawn', '\u03bc': 'Sacrificer', '\u03b9': 'Reviver', '\u03b5': 'Herald', '\u03bb': 'Sniper', '\u03c5': 'Mortar', '\u03bf': 'Ballista' };
Object.assign(PNAMES, Promotion.NAME, { [Engine.NEUTRAL_T.boar]: 'Boar', [Engine.NEUTRAL_T.hound]: 'Hound', [Engine.NEUTRAL_T.burrower]: 'Burrower', [Engine.NEUTRAL_T.golem]: 'Golem', [Engine.NEUTRAL_T.boss]: 'Boss' });
const AUST_CFG = {
  austang: { w: 8, h: 8, palette: ['k', 'p', 'n', 'b', 'r', 'q'], cost: COST,
             def: { start: 20, base: 8, step: 2, catchup: 3, cap: 24, rounds: 5 }, lim: { q: 2 } },
  austangGrand: { w: 10, h: 10, palette: ['k', 'p', 'n', 'b', 'r', 'q', '\u03b1', '\u03c7', '\u03c9', '\u03bd', '\u03b3', '\u03b6', '\u03b4', '\u03b7', '\u03ba', '\u03b2', '\u03c0', '\u03b8', '\u03c6', '\u03c8', '\u03be', '\u03c4', '\u03c1', '\u03bc', '\u03b9', '\u03b5', '\u03bb', '\u03c5', '\u03bf'],
                  cost: { k: 0, p: 1, n: 3, b: 3, r: 5, q: 9, '\u03b1': 7, '\u03c7': 8, '\u03c9': 13, '\u03bd': 5, '\u03b3': 2, '\u03b6': 2, '\u03b4': 7, '\u03b7': 5, '\u03ba': 6, '\u03b2': 5, '\u03c0': 5, '\u03b8': 4, '\u03c6': 1, '\u03c8': 2, '\u03be': 2, '\u03c4': 2, '\u03c1': 2, '\u03bc': 6, '\u03b9': 10, '\u03b5': 8, '\u03bb': 6, '\u03c5': 5, '\u03bf': 4 },
                  unlock: { q: 4, '\u03c9': 4, '\u03b9': 4, '\u03c7': 4, '\u03b5': 4 },      // strongest pieces: not available before this round (host-editable)
                  def: { start: 25, base: 10, step: 2, catchup: 4, cap: 30, rounds: 5 }, lim: { q: 2, '\u03c9': 1, '\u03b1': 2, '\u03c7': 2, '\u03b4': 2, '\u03ba': 2, '\u03c0': 2, '\u03bc': 2, '\u03b9': 1, '\u03b5': 1, '\u03bb': 2, '\u03c5': 2, '\u03bf': 2 } }
};
const AC = () => AUST_CFG[M.mode];
AUST_CFG.austang4 = Object.assign({}, AUST_CFG.austangGrand, { w: 10, h: 5 });      // 4-player Austang: every player builds in their own 10x5 arm (same pieces, prices and limits as Austang Grand)
const LET = 'abcdefghijklmnopqrstuvwxyz';
const sqName = (x, y) => (x < 26 ? LET[x] : LET[Math.floor(x / 26) - 1] + LET[x % 26]) + (y + 1);
let mySeat = 'r', conns = [], mstarted = false, lobbyBase = '', mseats = null, gs = { dropZone: 'any', fog: false, teams: false, board: 'cross', height: 10, neutralSet: 'commoner', fallen: false };
let nBusy = false, gtraits = null, draft = null, revealedAll = false;
let rewardPick = null, rewSet = null, rngSet = null, rngF = false, foeSel = null, foeSet = null, rmarkSet = null, clipMap = null, selIdx = 0, glitchSeen = 0, mirageSeen = 0, mineSet = null, gclasses = null, abFrom = null, chargeSq = null, abMode = null, abSet = null, revealedCl = false, pendTraits = null, abSeenG = null, abSeen = 0;
let myToken = null, roomCode = null, spectateMode = false, spectating = false, specs = [], everJoined = false, peerToken = null;
let resignLog = [], replay = null, retryTimer = null, retries = 0;
let succ = null, retryCode = null, keepRetries = false;      // host migration (guests): the host's list of successors (+ a private kit for the first two), and the room id the current reconnect attempt aims at
let bots = {}, bots2p = null, lobbyBots = [], botTimer = null, inRoom = false;      // inRoom: the host sent everybody back to the room between games
let specChatOn = false, specChatAllowed = false;            // spectators may chat only if the host switches it on      // optional bot players (host only)   // multiplayer (3/4 players): host is the hub
function drawWhy() {                             // multiplayer draw reason: only bare kings left, or nobody can move
  if (!game || !game.drawn || game.imperial) return '';
  const [W, H] = [game.w, game.h];
  for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) { if (game.valid && !game.valid(x, y)) continue; const p = game.at(x, y); if (p && !p.dead && p.t !== 'k' && game.seats.includes(p.c)) return ''; }
  return 'only bare kings are left (checkmate is impossible)';
}
const ended = () => over || (game && (game.multi ? (!!game.winner() || game.drawn) : ['checkmate', 'stalemate', 'draw', 'bare'].includes(game.status())));
const SPEC_OK = new Set(['clock', 'timeout', 'mtimeout', 'move', 'resign', 'drawAccept', 'newgame', 'traits', 'mmove', 'nmove', 'mresign', 'mchat', 'schat', 'specChatSetting']);
function sendSpecs(msg) {
  if (!isHost || !specs.length || !SPEC_OK.has(msg.type)) return;
  specs.forEach(c => c.open && c.send(msg));
}
const mmoveMsg = m => { let n = -1; try { n = game.history().length; } catch (e) { /* no history */ } return { type: 'mmove', m, n, t: game.turn }; };      // (built after the host applied the move)
let lastResync = 0;
function askResync() {                           // a guest noticed it no longer matches the host: ask for the whole game again
  if (isHost || Date.now() - lastResync < 2500) return; lastResync = Date.now();
  addChat('', 'Your board was out of step with the host, refreshing it…', true);
  send({ type: 'resync' });
}
const broadcast = msg => { conns.forEach(c => c.open && c.send(msg)); sendSpecs(msg); };
const inPlay = () => game && (!M || M.phase === 'play');

Object.keys(MODES).forEach(k => {
  $('modeSel').add(new Option(MODES[k].name, k));
  $('modeSel2').add(new Option(MODES[k].name, k));
});

// Kriegspiel referee: both browsers print the same public announcement after each move.
const GRAND_UP = 'RBN';                           // Imperial: the Grand pieces
function impAnnounce() {
  const h = game.history(), e = h[h.length - 1]; if (!e) return;
  const who = game.multi ? CN[e.c] : e.c === 'w' ? 'White' : 'Black', n = IMP_NAMES[e.by] || 'piece';
  let t = '';
  if (e.shoot && e.hits) t = who + ' ' + n + ' fired and destroyed ' + e.hits.length + ' piece' + (e.hits.length > 1 ? 's' : '') + ': ' + e.hits.map(x => IMP_NAMES[x.t] || x.t).join(', ') + '.';
  else if (e.ep) t = who + ' captured en passant.';
  else if (e.castle) t = who + ' ' + n + ' hopped over its partner.';
  else if (e.swap) t = who + ' Heir swapped with a Knight.';
  else if (e.wall) t = who + ' Sapper raised a wall at ' + sqName(e.tx, e.ty) + '.';
  if (e.promo) t += (t ? ' ' : '') + who + ' ' + n + (GRAND_UP.includes(e.promo) ? ' was promoted into a ' + IMP_NAMES[e.promo] + '!' : ' was promoted to ' + (IMP_NAMES[e.promo] || 'a new piece') + '.');
  if (e.cap && e.cap !== '#' && 'EXH'.includes(e.cap)) t += ' ' + IMP_NAMES[e.cap] + ' destroyed!';
  if (t) addChat('', t.trim(), true);
}
function announce() {
  if (game && game.imperial) impAnnounce();
  if (!MODES[mode].v.hidden) return;
  const h = game.history(), m = h[h.length - 1];
  const parts = [(game.turn === 'w' ? 'Black' : 'White') + ' moved.'];
  if (m.cap) parts.push('Capture on ' + sqName(m.tx, m.ty) + ' (' + (m.cap === 'p' ? 'pawn' : 'piece') + ').');
  const s = game.status();
  if (s === 'checkmate') parts.push('Checkmate!');
  else if (s === 'stalemate') parts.push('Stalemate.');
  else if (s === 'draw') parts.push('Draw: not enough material.');
  else if (s === 'check') parts.push('Check!');
  addChat('', 'Referee: ' + parts.join(' '), true);
}

