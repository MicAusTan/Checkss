/* appearance.js: board colours as clickable swatches (plus your own two colours), kept in the 🎨 drawer. The <select> in the drawer stays the source of truth (social.js saves it). */
(function () {
  const sel = document.getElementById('themeSel'), sw = document.getElementById('themeSw'); if (!sel || !sw) return;
  const THEMES = [['classic', 'Classic', '#f0d9b5', '#b58863'], ['green', 'Green', '#eeeed2', '#769656'], ['blue', 'Blue', '#dee3e6', '#8ca2ad'], ['slate', 'Slate', '#c9c9c9', '#6f6f6f'], ['rose', 'Rose', '#f3dede', '#b86f7a']];
  let custom = { l: '#f0d9b5', d: '#b58863' }; try { custom = Object.assign(custom, JSON.parse(localStorage.getItem('cwfBoardCustom') || '{}')); } catch (e) { /* ignore */ }
  const hex = c => /^#[0-9a-f]{6}$/i.test(c) ? c : '#808080', mix = (a, b) => '#' + [1, 3, 5].map(i => Math.round((parseInt(a.substr(i, 2), 16) + parseInt(b.substr(i, 2), 16)) / 2).toString(16).padStart(2, '0')).join('');
  const root = document.documentElement;
  function paint() {
    if (sel.value === 'custom') { const l = hex(custom.l), d = hex(custom.d); root.style.setProperty('--light', l); root.style.setProperty('--dark', d); root.style.setProperty('--mid', mix(l, d)); }
    else ['--light', '--dark', '--mid'].forEach(k => root.style.removeProperty(k));
    document.getElementById('customCols').classList.toggle('hidden', sel.value !== 'custom');
    sw.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.t === sel.value));
  }
  const all = THEMES.concat([['custom', 'Your own', custom.l, custom.d]]);
  all.forEach(([k, nm, l, d]) => { const b = document.createElement('button'); b.type = 'button'; b.dataset.t = k; b.title = nm; b.setAttribute('aria-label', nm + ' board colours'); b.innerHTML = '<i style="background:' + l + '"></i><i style="background:' + d + '"></i><i style="background:' + d + '"></i><i style="background:' + l + '"></i><span>' + nm + '</span>'; if (k === 'custom') b.id = 'themeCustomSw'; b.onclick = () => { sel.value = k; sel.dispatchEvent(new Event('change')); paint(); }; sw.appendChild(b); });
  const cl = document.getElementById('cLight'), cd = document.getElementById('cDark'); cl.value = hex(custom.l); cd.value = hex(custom.d);
  const upd = () => { custom = { l: cl.value, d: cd.value }; try { localStorage.setItem('cwfBoardCustom', JSON.stringify(custom)); } catch (e) { /* ignore */ } const s = document.getElementById('themeCustomSw'); if (s) { const i = s.querySelectorAll('i'); i[0].style.background = i[3].style.background = custom.l; i[1].style.background = i[2].style.background = custom.d; } paint(); };
  cl.oninput = cd.oninput = upd; sel.addEventListener('change', paint); upd();
})();
