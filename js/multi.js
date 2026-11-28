/* ============ 3/4-PLAYER (host is the hub) ============ */
// Guests only talk to the host. The host validates every move, then broadcasts it to everyone.
const maxSeats = () => MODES[mode].all.length;
let hostTeam = 0;
const octMode = () => !!MODES[mode].oct, t8 = () => (octMode() ? $('teams8Sel').value : 'ffa');
const teamCount = () => TEAM_SLOTS().length, teamCap = () => Math.max(...TEAM_SLOTS().map(t => t.length)), normTeam = t => (t || 0) % teamCount();
const TEAM_SLOTS = () => {
  if (!octMode()) return [['r', 'y'], ['b', 'g']];
  const tm = Engine.OCT_TEAMS[t8()] || Engine.OCT_TEAMS.sides, out = [];
  Engine.OCT_ORDER.forEach(c => { (out[tm[c]] = out[tm[c]] || []).push(c); });
  return out.filter(Boolean);
};
const seatHex = c => (octMode() ? OCT_HEX[c] : SEAT_HEX[c]);
const teamCounts = () => { const cnt = Array(teamCount()).fill(0); cnt[normTeam(hostTeam)]++; conns.filter(x => x.ready).forEach(x => cnt[normTeam(x.team)]++); lobbyBots.forEach(b => cnt[normTeam(b.team)]++); return cnt; };
const lightestTeam = cnt => cnt.indexOf(Math.min(...cnt));
var teamMode = 'host', teamLock = false;                 // how teams are made: 'host' = only the host moves people, 'free' = players pick their own team, 'random' = shuffled by the host. Lobby only (never part of the game record).
const teamLabel = t => octMode() ? 'Team ' + (t + 1) + ': ' + TEAM_SLOTS()[t].map(c => CN[c]).join(', ') : 'Team ' + 'AB'[t] + ': ' + (t ? 'Blue & Teal' : 'Red & Orange');
function setTeam(p, t) {                                     // move one player to team t if it has room (the host's own buttons skip this check, the start button still validates)
  if (!Number.isInteger(t) || t < 0 || t >= teamCount() || normTeam(p.team) === t) return false;
  const cnt = Array(teamCount()).fill(0); lobbyPlayers().forEach(q => { if (q !== p) cnt[normTeam(q.team)]++; });
  if (cnt[t] >= teamCap()) return false;
  p.pref = null; p.team = t; return true;
}
function shuffleTeams() {                                    // everybody (bots too) is dealt to a random team, as evenly as possible
  const pl = lobbyPlayers(); for (let i = pl.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pl[i], pl[j]] = [pl[j], pl[i]]; }
  const off = Math.floor(Math.random() * teamCount());
  pl.forEach((q, i) => { q.pref = null; q.team = (i + off) % teamCount(); });
}
const teamsOn = () => !!MODES[mode].bug || (MODES[mode].oct ? $('teams8Sel').value !== 'ffa' : (!!(MODES[mode].opts || []).includes('teams') && $('teamsChk').checked));
var hostPref = null;                                         // the seat each player asked for (null = whatever is left)
const hostObj = { get team() { return hostTeam; }, set team(v) { hostTeam = v; }, get pref() { return hostPref; }, set pref(v) { hostPref = v; } };
const lobbyPlayers = () => [hostObj].concat(conns.filter(c => c.ready)).concat(lobbyBots);
function lobbySeats() {
  const players = lobbyPlayers(), order = octMode() ? Engine.OCT_ORDER : ['r', 'b', 'y', 'g'], by = Array(players.length), taken = new Set();
  if (teamsOn()) {                                           // a team's colours are fixed; within it everybody may pick a free one
    const slots = TEAM_SLOTS();
    players.forEach((p, k) => { const t = normTeam(p.team); if (p.pref && slots[t].includes(p.pref) && !taken.has(p.pref)) { by[k] = p.pref; taken.add(p.pref); } });
    players.forEach((p, k) => { if (by[k]) return; const s = slots[normTeam(p.team)].find(x => !taken.has(x)); by[k] = s; taken.add(s); });
    return { seats: order.filter(c => by.includes(c)), by };
  }
  const all = MODES[mode].all || order, def = seatsFor(mode, players.length);
  players.forEach((p, k) => { if (p.pref && all.includes(p.pref) && !taken.has(p.pref)) { by[k] = p.pref; taken.add(p.pref); } });
  const pool = def.filter(x => !taken.has(x)).concat(all.filter(x => !taken.has(x) && !def.includes(x)));
  players.forEach((p, k) => { if (!by[k]) { const x = pool.shift(); by[k] = x; taken.add(x); } });
  return { seats: all.filter(c => by.includes(c)), by };
}
const seatChoices = p => teamsOn() ? TEAM_SLOTS()[normTeam(p.team)].slice() : (MODES[mode].all || []).slice();
const seatLabel = c => (teamsOn() && !octMode() ? SEAT_NAME[c] : CN[c]) || c;
function setPref(p, seat, force) {                           // a free colour is simply taken; a taken one is swapped, but only when the host asks for it
  const ls = lobbySeats(), players = lobbyPlayers(), k = players.indexOf(p);
  if (k < 0 || !seatChoices(p).includes(seat) || MODES[mode].match4) return false;
  const holder = ls.by.indexOf(seat); if (holder === k) return true;
  if (holder >= 0) { if (!force) return false; players[holder].pref = ls.by[k]; }
  p.pref = seat; return true;
}
function pickSwatches(pl, ls) {
  const span = document.createElement('span'), k = lobbyPlayers().indexOf(pl); span.className = 'rpick';
  if (k < 0 || MODES[mode].match4 || seatChoices(pl).length < 2) return span;
  seatChoices(pl).forEach(sc => {
    const b = document.createElement('button'), holder = ls.by.indexOf(sc), mine = holder === k; b.type = 'button'; b.className = 'swt' + (mine ? ' mine' : holder >= 0 ? ' taken' : ''); b.style.background = seatHex(sc);
    b.title = seatLabel(sc) + (mine ? ' (current colour)' : holder >= 0 ? ' (taken: click to swap)' : ' (free)');
    b.onclick = () => { if (mine) return; setPref(pl, sc, true); renderRoster(); }; span.appendChild(b);
  });
  const dice = document.createElement('button'); dice.type = 'button'; dice.className = 'swt dice'; dice.textContent = '🎲'; dice.title = 'A random colour (the host may swap with someone)';
  dice.onclick = () => { rollPref(pl, true); renderRoster(); }; span.appendChild(dice);
  return span;
}
function rollPref(p, force) {                                // a random colour: a free one, or (the host only) one swapped with somebody
  const ls = lobbySeats(), k = lobbyPlayers().indexOf(p); if (k < 0) return false;
  const cands = seatChoices(p).filter(sc => sc !== ls.by[k] && (force || ls.by.indexOf(sc) < 0));
  return cands.length ? setPref(p, cands[Math.floor(Math.random() * cands.length)], force) : false;
}
function shuffleSeats() {                                    // everybody gets a random one of the colours currently in play (inside their team, if there are teams)
  const players = lobbyPlayers(), ls = lobbySeats(), groups = new Map();
  players.forEach((p, k) => { const g = teamsOn() ? normTeam(p.team) : 0; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(k); });
  groups.forEach(ks => { const seats = ks.map(k => ls.by[k]); for (let i = seats.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [seats[i], seats[j]] = [seats[j], seats[i]]; } ks.forEach((k, i) => { players[k].pref = seats[i]; }); });
}
function pickInfo(c, ls) {
  const k = lobbyPlayers().indexOf(c); if (k < 0) return null;
  const out = {};
  if (!MODES[mode].match4 && seatChoices(c).length >= 2) out.opts = seatChoices(c).map(sc => ({ s: sc, hex: seatHex(sc), name: seatLabel(sc), mine: ls.by[k] === sc, free: ls.by.indexOf(sc) < 0 }));
  if (teamsOn()) {                                           // guests only get team buttons when the host chose "players pick"
    const cnt = Array(teamCount()).fill(0); lobbyPlayers().forEach(q => { cnt[normTeam(q.team)]++; });
    out.tm = { how: teamMode, locked: teamLock, cur: normTeam(c.team), teams: Array.from({ length: teamCount() }, (_, t) => ({ name: teamLabel(t), n: cnt[t], cap: teamCap() })) };
  }
  return out.opts || out.tm ? out : null;
}
function drawSeatPick(p) {                                   // guests: pick a team (when the host allows it) and one of the colours nobody has yet
  const el = $('seatPick'); el.innerHTML = '';
  if (!p || (!p.opts && !p.tm)) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  if (p.tm) {
    const row = document.createElement('div'); row.className = 'tmPick'; row.style.flexBasis = '100%';
    const free = p.tm.how === 'free' && !p.tm.locked;
    row.appendChild(document.createTextNode('Your team: '));
    p.tm.teams.forEach((t, i) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'tmBtn' + (i === p.tm.cur ? ' mine' : ''); b.textContent = t.name + ' (' + t.n + '/' + t.cap + ')';
      const full = t.n >= t.cap && i !== p.tm.cur; b.disabled = !free || i === p.tm.cur || full;
      b.title = i === p.tm.cur ? 'Your team' : !free ? (p.tm.locked ? 'The host locked the teams' : p.tm.how === 'random' ? 'The host deals the teams at random' : 'The host picks the teams') : full ? 'That team is full' : 'Click to join this team';
      b.onclick = () => send({ type: 'pickteam', team: i }); row.appendChild(b);
    });
    const n = document.createElement('div'); n.className = 'dim'; n.textContent = p.tm.locked ? 'The host locked the teams.' : p.tm.how === 'free' ? 'Click a team to join it (full teams are greyed out). The host can also move you.' : p.tm.how === 'random' ? 'The host deals the teams at random.' : 'The host picks the teams.';
    row.appendChild(n); el.appendChild(row);
  }
  if (!p.opts) return;
  el.appendChild(document.createTextNode('Your colour:'));
  p.opts.forEach(o => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'swt' + (o.mine ? ' mine' : o.free ? '' : ' taken'); b.style.background = o.hex;
    b.title = o.name + (o.mine ? ' (yours)' : o.free ? ' (free: click to take it)' : ' (taken)');
    b.onclick = () => { if (o.mine || !o.free) return; send({ type: 'pickseat', seat: o.s }); }; el.appendChild(b);
  });
  const dice = document.createElement('button'); dice.type = 'button'; dice.className = 'swt dice'; dice.textContent = '🎲'; dice.title = 'Take a random free colour'; dice.onclick = () => send({ type: 'pickseat', seat: 'random' }); el.appendChild(dice);
  const n = document.createElement('div'); n.className = 'dim'; n.textContent = 'Click a free colour to take it. The host can also move you.'; el.appendChild(n);
}
const SEAT_HEX = { r: '#ff5a5a', y: '#ff9a3c', b: '#5aa0ff', g: '#3fd6cf' }, SEAT_NAME = { r: 'Red', y: 'Orange', b: 'Blue', g: 'Teal' };      // 2v2 look
const banned = new Set();                                  // tokens (one per browser) the host banned from this room
function renderRoster() {
  const r = $('roster'); r.innerHTML = '';
  const tOn = teamsOn(), ready = conns.filter(c => c.ready), bug = !!MODES[mode].bug;
  // everybody in lobby order: host, joined players, bots
  const rows = [{ name: myName() + ' (you, host)', pl: hostObj, pfp: profile.pfp, get team() { return hostTeam; }, flip: () => { hostPref = null; hostTeam = (normTeam(hostTeam) + 1) % teamCount(); } }]
    .concat(ready.map((c, i) => ({ name: cleanName(c.name) || 'Player ' + (i + 2), pl: c, pfp: c.pfp, get team() { return c.team; }, flip: () => { c.pref = null; c.team = (normTeam(c.team) + 1) % teamCount(); }, kick: () => kickConn(c) })))
    .concat(lobbyBots.map(b => ({ name: 'Bot (' + b.level + ')', pl: b, bot: true, get team() { return b.team; }, flip: () => { b.pref = null; b.team = (normTeam(b.team) + 1) % teamCount(); }, kick: () => { lobbyBots.splice(lobbyBots.indexOf(b), 1); renderRoster(); } })));
  const ls0 = lobbySeats(), n = rows.length, by = (tOn || octMode()) ? ls0.by : [], tNames = c => (octMode() ? CN[c] : SEAT_NAME[c]);
  const mk = (row, k) => {
    const d = document.createElement('div'); d.className = 'rrow';
    if ((tOn || octMode()) && by[k]) { const dot = document.createElement('span'); dot.className = 'rdot'; dot.style.background = seatHex(by[k]); dot.title = tNames(by[k]); d.appendChild(dot); }
    { const av = document.createElement('span'); av.className = 'av sm'; fillAvatar(av, row.name, row.pfp, row.bot ? '#555' : '#6b7f4e'); if (row.bot && !row.pfp) av.textContent = '🤖'; av.style.marginRight = '6px'; av.style.verticalAlign = 'middle'; d.appendChild(av); }
    d.appendChild(document.createTextNode(row.name + ' '));
    d.appendChild(pickSwatches(row.pl, ls0));
    if (tOn) { const t = document.createElement('button'); t.textContent = teamCount() === 2 ? 'Move to Team ' + 'AB'[normTeam(row.team) ^ 1] + ' ⇄' : 'Next team ⇄ (Team ' + (normTeam(row.team) + 1) + ')'; t.onclick = () => { row.flip(); renderRoster(); }; d.appendChild(t); d.appendChild(document.createTextNode(' ')); }
    if (row.kick && !row.bot) { const bb = document.createElement('button'); bb.textContent = 'Ban'; bb.title = 'Remove this player and stop them from coming back to this room'; bb.onclick = async () => { if (await askConfirm('Ban ' + row.name + ' from this room? They cannot rejoin until you close the room.', 'Ban', true)) { if (row.pl && row.pl.token) banned.add(row.pl.token); addChat('', row.name + ' was banned.', true); row.kick(); } }; d.appendChild(bb); }
    if (row.kick) { const kb = document.createElement('button'); kb.textContent = row.kick === undefined ? '' : (row.bot ? 'Remove' : 'Kick'); kb.onclick = row.kick; d.appendChild(kb); }
    return d;
  };
  if (tOn) {                                                 // who decides the teams
    const bar = document.createElement('div'); bar.id = 'teamHow'; bar.className = 'dim';
    const sel = document.createElement('select'); [['host', 'Host picks the teams'], ['free', 'Players pick their own team'], ['random', 'Random teams']].forEach(([v, t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; if (v === teamMode) o.selected = true; sel.appendChild(o); });
    sel.onchange = () => { teamMode = sel.value; if (teamMode === 'random') shuffleTeams(); renderRoster(); };
    bar.appendChild(document.createTextNode('Teams: ')); bar.appendChild(sel);
    if (teamMode === 'free') { const l = document.createElement('label'); l.style.marginLeft = '10px'; const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = teamLock; cb.onchange = () => { teamLock = cb.checked; renderRoster(); }; l.appendChild(cb); l.appendChild(document.createTextNode(' Lock teams')); bar.appendChild(l); }
    if (teamMode === 'random') { const sb = document.createElement('button'); sb.type = 'button'; sb.className = 'small'; sb.textContent = '🎲 Shuffle teams'; sb.onclick = () => { shuffleTeams(); renderRoster(); }; bar.appendChild(sb); }
    r.appendChild(bar);
  }
  if (tOn) {
    const cols = document.createElement('div'); cols.id = 'teamCols';
    Array.from({ length: teamCount() }, (_, t) => t).forEach(t => {
      const col = document.createElement('div'); col.className = 'tcol t' + t;
      const members = rows.map((row, k) => ({ row, k })).filter(o => normTeam(o.row.team) === t);
      const h = document.createElement('div'); h.className = 'thead';
      h.textContent = teamLabel(t) + ' (' + members.length + '/' + teamCap() + ')';
      col.appendChild(h);
      members.forEach(o => col.appendChild(mk(o.row, o.k)));
      if (!members.length) { const e = document.createElement('div'); e.className = 'dim'; e.textContent = '(empty)'; col.appendChild(e); }
      cols.appendChild(col);
    });
    r.appendChild(cols);
  } else rows.forEach((row, k) => r.appendChild(mk(row, k)));
  { const full = n >= maxSeats() || !!MODES[mode].match4, hardOk = !MODES[mode].bug && !MODES[mode].match && !MODES[mode].match4;      // every mode that has bots has a Hard bot except these
    const hb = $('lvlHard'); hb.disabled = !hardOk; hb.title = hardOk ? 'Looks several moves ahead (up to the thinking time set below)' : 'The hard bot is not available in this mode (Easy and Normal are)'; if (!hardOk && lobbyBotLvl === 'hard') { lobbyBotLvl = 'normal'; }
    document.querySelectorAll('#botLvl button').forEach(b => b.classList.toggle('on', b.dataset.l === lobbyBotLvl));
    $('addBotBtn').disabled = $('fillBotsBtn').disabled = full; $('addBotBtn').textContent = '+ Add bot'; $('addBotBtn').title = 'Adds a bot of the difficulty chosen next to this button (' + lobbyBotLvl + ')'; }
  let ok = n >= 2;
  if (tOn) {
    const cnt = Array(teamCount()).fill(0); rows.forEach(row => cnt[normTeam(row.team)]++);
    ok = cnt.filter(x => x > 0).length >= 2 && cnt.every(x => x <= teamCap());
    if (bug) ok = cnt[0] === 2 && cnt[1] === 2;
    const note = document.createElement('div'); note.className = 'dim';
    note.textContent = bug
      ? (ok ? 'Board A: Red (White) vs Blue (Black). Board B: Green (White) vs Yellow (Black). Team A = Red + Yellow, Team B = Blue + Green. No clocks.' : 'Bughouse needs exactly 2 players on each team (4 total). Use the “Move to Team” buttons.')
      : (ok ? 'Partners share a colour family and never capture or check each other. Teams alternate turns.' : octMode() ? 'Need at least two teams with players, at most ' + teamCap() + ' per team. Use the team buttons to rearrange (bots included).' : 'Each team needs 1–2 players. Use the “Move to Team” buttons to rearrange (bots included).');
    r.appendChild(note);
  } else if (n >= 2) {
    const note = document.createElement('div'); note.className = 'dim'; note.textContent = octMode() ? 'Everybody for themselves. Pick Teams in the 8-player options for 2v2v2v2 or 4v4.' : (MODES[mode].opts || []).includes('teams') ? 'Tick “2v2 teams” above to choose who plays with whom.' : 'Everybody plays for themselves.'; r.appendChild(note);
  }
  if (MODES[mode].multi && !MODES[mode].match4 && n > 1) { const sh = document.createElement('button'); sh.type = 'button'; sh.className = 'small'; sh.textContent = '🎲 Shuffle colours'; sh.title = 'Give everybody a random one of the colours in play'; sh.onclick = () => { shuffleSeats(); renderRoster(); }; r.appendChild(sh); }
  if (MODES[mode].match4 && lobbyBots.length) { ok = false; const nb = document.createElement('div'); nb.className = 'dim'; nb.textContent = 'Bots can’t build armies. Remove them to play Austang 4-Player.'; r.appendChild(nb); }
  if (n > maxSeats()) { ok = false; const nb = document.createElement('div'); nb.className = 'dim'; nb.textContent = MODES[mode].name + ' seats at most ' + maxSeats() + ' players. Remove some, or pick another mode.'; r.appendChild(nb); }
  $('startBtn').disabled = !ok;
  $('startBtn').textContent = 'Start game (' + n + ' player' + (n > 1 ? 's' : '') + ')';
  const info = roomSummary(), prev = previewData(); drawPreview(prev);
  ready.forEach((c, i) => c.send({ type: inRoom ? 'mroom' : 'mwait', prev, pick: pickInfo(c, ls0), text: (inRoom ? 'Back in the room.\n' : '') + info + '\nYou are player ' + (i + 2) + ' of ' + n + ' so far. Waiting for the host to start…' }));
}
// A small picture of the board as it will start (host builds it from the current room settings and sends the same data to the guests).
const previewSkip = m => !MODES[m].multi || MODES[m].bug || MODES[m].match4 || /alice/.test(m);
function boardData(g, isOct, two) {                         // a small picture of a board position, for the room preview and the mode cards
  const valid = (x, y) => (g.valid ? g.valid(x, y) : g.cut ? !g.cut(x, y) : true), rows = [], p = [], v = [];
  const holes = isOct && g.holeList ? new Set(g.holeList().map(h => h[1] * 24 + h[0])) : null;
  for (let y = 0; y < g.h; y++) { let row = ''; for (let x = 0; x < g.w; x++) { const ok = valid(x, y), q = ok || isOct ? g.at(x, y) : null; if (!ok && holes && holes.has(y * 24 + x)) v.push([x, y]); row += ok ? '.' : '#'; if (q && !q.wall) p.push([x, y, q.t, q.c, q.dead ? 1 : 0]); } rows.push(row); }
  return { w: g.w, h: g.h, rows, p, v, oct: !!isOct, two: !!two, note: '' };
}
function previewData() {
  if (!isHost || !peer || previewSkip(mode)) return null;
  try {
    const hole = $('holes8Sel').value, hidden = MODES[mode].oct && (hole === 'scatter' || hole === 'random'), g0 = readGS();
    if (hidden) g0.holes8 = 'none';
    const r = makeEngine(mode, lobbySeats().seats, g0, null, null, null), g = r.game;
    if (g.hex || !g.at) return null;
    const d = boardData(g, !!g.oct, false); d.note = hidden ? 'Random holes are revealed when the game starts.' : ''; return d;
  } catch (e) { return null; }
}
function paintBoard(cv, data, maxPx) {
  const cell = Math.max(3, Math.floor(maxPx / Math.max(data.w, data.h))), ctx = cv.getContext('2d');
  cv.width = cell * data.w; cv.height = cell * data.h; ctx.clearRect(0, 0, cv.width, cv.height);
  for (let y = 0; y < data.h; y++) for (let x = 0; x < data.w; x++) {
    if (data.rows[y][x] === '#') continue;
    ctx.fillStyle = ((x + y) & 1) ? '#b58863' : '#f0d9b5'; ctx.fillRect(x * cell, (data.h - 1 - y) * cell, cell, cell);
  }
  ctx.fillStyle = '#0b0e13'; data.v.forEach(([x, y]) => ctx.fillRect(x * cell, (data.h - 1 - y) * cell, cell, cell));
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = Math.floor(cell * 0.95) + 'px serif';
  data.p.forEach(([x, y, t, c, dead]) => {
    const cx = x * cell + cell / 2, cy = (data.h - 1 - y) * cell + cell / 2, bossT = t === Engine.NEUTRAL_T.boss, g = bossT ? '☠' : (GLYPH[t] || '•');
    if (cell < 7) { ctx.fillStyle = dead ? '#888' : c === 'n' ? '#c79bff' : data.two ? (c === 'w' ? '#fafafa' : '#222') : (OCT_HEX[c] || '#fff'); ctx.fillRect(x * cell + 0.5, (data.h - 1 - y) * cell + 0.5, cell - 1, cell - 1); return; }      // tiny cells: a coloured square per piece
    ctx.lineWidth = Math.max(1, cell / 9); ctx.strokeStyle = '#000a'; ctx.fillStyle = dead ? '#888' : c === 'n' ? '#c79bff' : data.two ? (c === 'w' ? '#fafafa' : '#222') : (OCT_HEX[c] || '#fff');
    if (data.two && c === 'b') ctx.strokeStyle = '#fffa';
    ctx.strokeText(g.slice(0, 1), cx, cy + 1); ctx.fillText(g.slice(0, 1), cx, cy + 1);
  });
}
function drawPreview(data) {
  const cv = $('roomPreview'), note = $('roomPreviewNote');
  cv.classList.toggle('hidden', !data); note.classList.toggle('hidden', !data || !data.note);
  if (!data) return;
  paintBoard(cv, data, Math.min(360, document.getElementById('lobby').clientWidth || 360)); note.textContent = data.note || '';
}
