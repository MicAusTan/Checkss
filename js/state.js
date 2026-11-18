const CN = { r: 'Red', b: 'Blue', y: 'Yellow', g: 'Green', o: 'Orange', p: 'Pink', t: 'Teal', m: 'Purple' };
const OCT_HEX = { r: '#ff5a5a', o: '#ff9a3c', y: '#ffd84d', g: '#5fd16a', t: '#3fd6cf', b: '#5aa0ff', p: '#ff7ac8', m: '#a66bff' };
const VIEW_SIDE = { r: 'r', o: 'r', b: 'b', p: 'b', y: 'y', t: 'y', g: 'g', m: 'g' }, viewSeat = c => VIEW_SIDE[c] || c;      // the 8-player board is turned like the 4-player one: your side at the bottom
function teamLook(on) { const oct = !!(game && game.oct); on = on && !oct; document.body.classList.toggle('teamsOn', !!on); CN.y = on ? 'Orange' : 'Yellow'; CN.g = on ? 'Teal' : 'Green'; }      // in 2v2 partners share a colour family

/* ============ STATE ============ */
const PREFIX = 'chessfriends-';
// c/i/w/o are the neutral-mode fairy pieces; they use the hollow glyphs so they never look like real pieces.
const GLYPH = { p:'♟', n:'♞', b:'♝', r:'♜', q:'♛', k:'♚', c:'♔', i:'♘', w:'♗', o:'♖', a:'A', l:'L', e:'♚' };      // e = the plain piece a king becomes under the Royal Queen trait (drawn as a king)
const FAIRY = Object.values(Engine.NEUTRAL_T).join('') + Object.values(Promotion.CODE).join('') + 'pnbrqkciwoalEXHRBNghustyzjdvmf#\u03b1\u03c7\u03c9\u03bd\u03b3\u03b6\u03b4\u03b7\u03ba\u03b2\u03c0\u03b8\u03c6\u03c8\u03be\u03c4\u03c1\u03bc\u03b9\u03b5\u03bb\u03c5\u03bf';
const SVG = inner => '<svg viewBox="0 0 24 24" aria-hidden="true">' + inner + '</svg>';
const FAIRY_SVG = {   // custom icons for the neutral / fairy pieces (they take the owner's colour)
  c: SVG('<path d="M12 2.5l8 3v6c0 5-3.4 8.2-8 10-4.6-1.8-8-5-8-10v-6z" fill="currentColor"/><path d="M12 7v9M8 11h8" stroke="#000a" stroke-width="1.6" fill="none"/>'),
  i: SVG('<path d="M4 3l4.5 4.5h7L20 3l-1 8a7.5 7.5 0 1 1-14 0z" fill="currentColor"/><circle cx="9" cy="13" r="1.4" fill="#000a"/><circle cx="15" cy="13" r="1.4" fill="#000a"/><path d="M9 17q3 2 6 0" stroke="#000a" stroke-width="1.3" fill="none"/>'),
  w: SVG('<path d="M12 2a7.5 7.5 0 0 0-7.5 7.5V22l3.2-2.4L12 22l4.3-2.4 3.2 2.4V9.5A7.5 7.5 0 0 0 12 2z" fill="currentColor"/><circle cx="9.3" cy="10" r="1.5" fill="#000a"/><circle cx="14.7" cy="10" r="1.5" fill="#000a"/>'),
  a: SVG('<path d="M12 2c3.5 3 6 6.5 6 10 0 2.5-1.7 4.3-3 5H9c-1.3-.7-3-2.5-3-5 0-3.5 2.5-7 6-10z" fill="currentColor"/><rect x="6.5" y="18" width="11" height="3.5" rx="1.2" fill="currentColor"/><path d="M12 6v7M8.8 9.5h6.4" stroke="#000a" stroke-width="1.6" fill="none"/>'),
  l: SVG('<path d="M12 2.5c4.5 0 8 3.2 8 7.8V15h-3v5H7v-5H4v-4.7C4 5.7 7.5 2.5 12 2.5z" fill="currentColor"/><path d="M7.5 10h9v2h-9z" fill="#000a"/><path d="M12 3.5v4" stroke="#000a" stroke-width="1.4"/>'),
  o: SVG('<path d="M2 4c0 5.5 3.2 8 5.5 8h9c2.3 0 5.5-2.5 5.5-8-2.2 2.2-4.2 2.4-5.3 1H7.3C6.2 6.4 4.2 6.2 2 4z" fill="currentColor"/><rect x="7" y="11" width="10" height="10" rx="4" fill="currentColor"/><circle cx="10.2" cy="17" r="1" fill="#000a"/><circle cx="13.8" cy="17" r="1" fill="#000a"/>')
};
{ const NT = Engine.NEUTRAL_T;
  Object.assign(FAIRY_SVG, {
    [NT.boar]: SVG('<path d="M2.5 15.5c0-5.5 4.2-10 9.5-10s9.5 4.5 9.5 10v3.5h-19z" fill="currentColor"/><path d="M6 7.5 4 3l5.5 2.5zM18 7.5 20 3l-5.5 2.5z" fill="currentColor"/><rect x="7.5" y="12.5" width="9" height="6.5" rx="3" fill="#000a"/><circle cx="10.3" cy="15.7" r="0.9" fill="currentColor"/><circle cx="13.7" cy="15.7" r="0.9" fill="currentColor"/><circle cx="7.6" cy="10.6" r="1.2" fill="#000a"/><circle cx="16.4" cy="10.6" r="1.2" fill="#000a"/><path d="M8 19.5 6 22.3M16 19.5l2 2.8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>'),
    [NT.hound]: SVG('<path d="M12 4c-3 0-5.5 2-6 5l-3.2 3.3 2.2 3.2 2-1.4C7.5 16.6 9.5 18.5 12 18.5s4.5-1.9 5-4.4l2 1.4 2.2-3.2L18 9c-.5-3-3-5-6-5z" fill="currentColor"/><ellipse cx="12" cy="15" rx="2.7" ry="2" fill="#000a"/><circle cx="9.2" cy="10.4" r="1.2" fill="#000a"/><circle cx="14.8" cy="10.4" r="1.2" fill="#000a"/><path d="M10 19.5v2.5M14 19.5v2.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>'),
    [NT.burrower]: SVG('<path d="M2 19c2-8 6-12 10-12s8 4 10 12z" fill="currentColor"/><ellipse cx="12" cy="19" rx="4.8" ry="1.9" fill="#000a"/><path d="M8 3.5 9.5 7M12 2.5V7M16 3.5 14.5 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'),
    [NT.golem]: SVG('<rect x="6" y="2.5" width="12" height="8.5" rx="2" fill="currentColor"/><rect x="2.5" y="12" width="19" height="9.5" rx="2" fill="currentColor"/><rect x="8.4" y="5.6" width="2.4" height="2.4" fill="#000a"/><rect x="13.2" y="5.6" width="2.4" height="2.4" fill="#000a"/><path d="M12 12v9.5M2.5 16.5h19" stroke="#000a" stroke-width="1.1"/>'),
    [NT.boss]: SVG('<path d="M3 20.5V8l4.6 4.2L12 3.5l4.4 8.7L21 8v12.5z" fill="currentColor"/><circle cx="9" cy="14.2" r="1.7" fill="#000a"/><circle cx="15" cy="14.2" r="1.7" fill="#000a"/><path d="M8.5 18.3h7" stroke="#000a" stroke-width="1.5"/>')
  });
  Object.assign(GLYPH, { [NT.boar]: 'B', [NT.hound]: 'H', [NT.burrower]: 'U', [NT.golem]: 'G', [NT.boss]: 'X' });
}
// The Boss is one big picture drawn across its 2x2 body: every cell shows its own quarter, so when a cell is taken that part of the picture is gone.
const BOSS_BIG = '<path d="M6 44V22C6 11 14 4 24 4s18 7 18 18v22H34v-6h-4v6h-4v-6h-4v6h-4v-6h-4v6z" fill="currentColor"/><path d="M4 18 1 4l10 7zM44 18 47 4l-10 7z" fill="currentColor"/><path d="M10 12 14 4l5 6 5-8 5 8 5-6 4 8z" fill="currentColor" opacity=".9"/><ellipse cx="17" cy="24" rx="4.6" ry="5.4" fill="#000b"/><ellipse cx="31" cy="24" rx="4.6" ry="5.4" fill="#000b"/><circle cx="17" cy="25" r="1.8" fill="#ff4d4d"/><circle cx="31" cy="25" r="1.8" fill="#ff4d4d"/><path d="M24 29l-3.4 7h6.8z" fill="#000b"/><path d="M14 38h20" stroke="#000b" stroke-width="1.6"/><path d="M18 38v3M22 38v3M26 38v3M30 38v3" stroke="#000b" stroke-width="1.4"/>';
const bossFull = '<svg viewBox="0 0 48 48" aria-hidden="true">' + BOSS_BIG + '</svg>';
const bossQuarter = (sx, sy) => '<svg viewBox="' + (sx * 24) + ' ' + (sy * 24) + ' 24 24" aria-hidden="true">' + BOSS_BIG + '</svg>';
