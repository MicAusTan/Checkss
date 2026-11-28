/* ============ NETWORKING ============ */
// Every message is {type, ...}. Add new features by adding new types here.
function send(msg) {
  if (conn && conn.open) conn.send(msg);
  if (msg.type === 'chat') sendSpecs({ type: 'schat', who: myColor === 'w' ? 'White' : 'Black', text: msg.text });
  else sendSpecs(msg);
}

function readGS() {
  return { dropZone: $('dropSel').value, fog: $('fogChk').checked, teams: $('teamsChk').checked, board: $('boardSel').value, height: +$('heightSel').value,
    neutralSet: $('nsetSel').value, fallen: $('fallenChk').checked, neutralDrop: $('neutralDropChk').checked, impRoam: $('impRoamChk').checked, teamTrait: $('teamTraitChk').checked, traits: $('traitsChk').checked, offers: +$('offerSel').value, trShow: $('trShowChk').checked,
    c960: $('c960Chk').checked, back960: $('c960Chk').checked ? Engine.randomBack960() : null,
    classes: $('classesChk').checked, clStart: +$('clStart').value || 0, clGain: +$('clGain').value || 0, clCap: +$('clCap').value || 8, clPer: +$('clPer').value || 0,
    clSum: +$('clSum').value || 4, clUlt: $('clUlt').checked, clHide: $('clHide').checked, clFree: $('clFree').checked, clHideFx: $('clHideFx').checked,
    teams8: $('teams8Sel').value, holes8: $('holes8Sel').value, wild8: $('wild8Chk').checked, boss8: $('boss8Chk').checked, burrow: $('burrowChk').checked,
    foeMoves: $('foesChk').checked, seed: Math.floor(Math.random() * 2147483646) + 1, ...tcRead() };
}
const seatsFor = (m, n) => { const all = MODES[m].all; if (MODES[m].oct && n < all.length) return [...new Set(Array.from({ length: n }, (_, k) => Math.round(k * all.length / n)))].map(i => all[i]); return n >= all.length ? all.slice() : n === 2 ? (all.length === 4 ? ['r', 'y'] : ['r', 'b']) : all.slice(0, n); };

const FOES_MODES = ['standard', 'crazyhouse', 'marseillais', 'cylinder', 'infinite', 'fourplayer', 'fourmars', 'fourcrazy', 'fourcyl', 'fourneutral', 'fourinfinite', 'imperial', 'imperial4', 'promotion', 'eight', 'threeplayer'];      // modes where clicking an enemy piece can show its moves

function newGame(m, s, o) {
  connUI.lostClear();
  pings = []; advice = {}; advWait = null; pingMode = false; pingSrc = null;
  o = o || {};
  if (!MODES[m].match4) A4 = null;
  mode = m; sel = null; over = null; overRes = null; setupMsg = ''; pal = 'p'; centered = false; cylShift = 0;
  gs = Object.assign({}, GS_DEFAULTS, o.gs || gs);
  gtraits = o.traits || null; draft = null; revealedAll = false; revealedTeam = false; resignLog = []; timedOut = new Set();
  gclasses = o.classes || null; abMode = null; abFrom = null; mirageSeen = 0; foeSel = null; glitchSeen = 0; meteorSeen = 0; abSet = null; revealedCl = false; pendTraits = null;
  gs.traits = !!gs.traits && ((MODES[m].opts || []).includes('traits'));
  gs.classes = !!gs.classes && ((MODES[m].opts || []).includes('classes'));
  gs.foeMoves = !!gs.foeMoves && FOES_MODES.includes(m) && !gs.fog;      // enemy-move preview: off in hidden-information modes
  if (MODES[m].match) {
    const ac = AUST_CFG[m];
    s = s || Object.assign({}, ac.def, { lim: Object.assign({}, ac.lim), unlock: Object.assign({}, ac.unlock) });
    if (!s.lim) s.lim = {};
    if (!s.unlock) s.unlock = {};
    const mid = Math.floor(ac.w / 2);
    M = { mode: m, s, round: 1, scores: { w: 0, b: 0 }, pool: { w: s.start, b: s.start },
          setups: { w: { [mid + ',0']: 'k' }, b: { [mid + ',' + (ac.h - 1)]: 'k' } }, phase: 'setup', sentRound: 0, opp: null };
    game = null;
  } else if (MODES[m].match4 && !o.a4round) {      // Austang 4-player: no board until every player has built an army
    game = null; M = null; mseats = o.seats || mseats;
  } else {
    const r = makeEngine(m, o.seats || mseats, gs, gtraits, gclasses, o.a4round && A4 ? { armies: A4.armies, first: A4.first } : null);
    M = null; nBusy = false; game = r.game; gs = r.gs;
    if (MODES[m].multi) mseats = r.seats;
    if (gs.c960 && gs.back960) addChat('', 'Chess960 layout: ' + gs.back960.toUpperCase().split('').join(' ') + '. Castle by moving your king onto your own rook.', true);
  }
}

function handleMessage(msg) {
  if (!isHost && msg) { connUI.got(); clearTimeout(joinTimer); joinTries = 0; }
  if (!isHost && msg && (msg.type === 'init' || msg.type === 'minit' || msg.type === 'resume')) setTimeout(guestSendSkins, 500);
  if (replay && !['chat', 'mchat', 'schat'].includes(msg.type)) { replay.queue.push({ msg }); return; }
  if (isHost && (msg.type === 'move' || msg.type === 'resign' || msg.type === 'drawAccept')) sendSpecs(msg);
  switch (msg.type) {
    case 'a4resume':
      stopRetry(); newGame(msg.mode, null, { seats: msg.seats, gs: msg.gs }); a4Load(msg.a4); mySeat = msg.seat; a4Apply(msg.x);
      $('lobby').classList.add('hidden'); $('game').classList.remove('hidden');
      addChat('', 'Reconnected. You are back in the match.', true); render(); break;
    case 'a4status': if (A4 && msg.round === A4.round) { A4.ready = {}; (msg.ready || []).forEach(c => { A4.ready[c] = true; }); render(); } break;
    case 'a4mate': if (A4 && A4.teams && A4.phase === 'setup' && msg.setup && typeof msg.setup === 'object') { A4.mate[msg.seat] = msg.setup; render(); } break;
    case 'a4reject': if (A4) { A4.sent = 0; setupMsg = String(msg.text || 'Your army was rejected.'); render(); } break;
    case 'a4start': if (A4 && A4.phase === 'setup' && msg.round === A4.round) startRound4(msg.armies, msg.first); break;
    case 'a4next': if (A4 && A4.phase === 'between') { a4Next(); render(); } break;
    case 'a4new':
      newGame(msg.mode, null, { seats: msg.seats, gs: msg.gs }); initA4(msg.seats, msg.a4.s, msg.gs); $('modeSel2').value = mode;
      addChat('', 'New match: ' + MODES[mode].name + '. Build your army!', true); render(); break;
    case 'resume':
      if (retryCode) { roomCode = retryCode; retryCode = null; succ = null; }
      stopRetry(); loadRecord(msg.rec); clkApplySnap(msg.clk);
      if (msg.seat) mySeat = msg.seat;
      if (msg.a4x && A4) a4Apply(msg.a4x);
      if (msg.color) myColor = msg.color;
      draft = msg.draft && msg.draft.offers ? { kind: msg.draft.kind || 'trait', mine: msg.draft.offers, picked: msg.draft.picked, vote: msg.draft.vote || null, mates: msg.draft.mates || {}, final: msg.draft.final || null, deadline: Date.now() + (+msg.draft.left || 0) } : null;
      $('lobby').classList.add('hidden'); $('game').classList.remove('hidden');
      if (game && game.multi) $('rematchBtn').classList.add('hidden'); else $('rematchBtn').classList.remove('hidden');
      addChat('', msg.resync ? 'Board refreshed from the host.' : 'Reconnected. You are back in the game.', true); render(); break;
    case 'spec':
      if (retryCode) { roomCode = retryCode; retryCode = null; succ = null; }
      stopRetry(); spectating = true; specChatAllowed = !!msg.chat; loadRecord(msg.rec); clkApplySnap(msg.clk);
      myColor = 'w'; if (game && game.multi) mySeat = game.seats[0];
      $('lobby').classList.add('hidden'); $('game').classList.remove('hidden');
      addChat('', 'You are watching this game as a spectator.', 'minor'); render(); break;
    case 'schat': addChat(String(msg.who), String(msg.text).slice(0, 300)); break;
    case 'specChatSetting': specChatAllowed = !!msg.on; addChat('', specChatAllowed ? 'The host has switched spectator chat on.' : 'The host has switched spectator chat off.', true); break;
    case 'init':
      if (msg.hostColor) myColor = msg.hostColor === 'w' ? 'b' : 'w';
      if (msg.from) peerInfo = { n: cleanName(msg.from.n), p: safePfp(msg.from.p), k: cleanSk(msg.from.sk) };
      newGame(msg.mode, msg.settings, { gs: msg.gs }); if (game) msg.moves.forEach(m => game.move(m));
      if (wantsDraft()) draft = { kind: firstDraftKind(), mine: null, picked: null };
      $('lobby').classList.add('hidden'); $('game').classList.remove('hidden');
      $('rematchBtn').classList.remove('hidden'); render(); break;
    case 'move': if (game.move(msg.m)) { sel = null; announce(); render(); } else if (isHost) hostRefreshGuest(); else askResync(); break;       // a move that does not fit means the boards have drifted apart: refresh from the host
    case 'resync': case 'mcount':                          // the guest asks to be refreshed, or reports how many moves it has: the host answers with the whole game if the counts differ
      if (isHost && game && !game.multi && !M && !A4 && (msg.type === 'resync' || (ml && ml.items && msg.n !== ml.items.length))) hostRefreshGuest(); break;
    case 'resign':
      over = resignText(msg.color); addChat('', over, 'event');
      overRes = msg.color === 'w' ? 'b' : 'w'; render(); break;
    case 'newgame':
      newGame(msg.mode || mode, msg.settings, { gs: msg.gs, seats: msg.seats });
      if (msg.swap && !spectating) myColor = myColor === 'w' ? 'b' : 'w';
      if (wantsDraft() && !spectating) draft = { kind: firstDraftKind(), mine: null, picked: null };
      $('modeSel2').value = mode; $('promo').classList.add('hidden'); $('drawBanner').classList.add('hidden');
      addChat('', 'New game: ' + MODES[mode].name + (MODES[mode].multi ? '.' : '. You are ' + (myColor === 'w' ? 'White' : 'Black') + '.'), true);
      render(); break;
    case 'info': seatInfo = cleanInfo(msg.info); renderStrip(); break;
    case 'succ': succ = cleanSucc(msg); break;
    case 'reacted': if (game && game.multi && REACTS.includes(msg.e) && msg.from !== mySeat && game.seats.includes(msg.from)) showReaction(msg.from, msg.e); break;
    case 'react': if (REACTS.includes(msg.e)) showReaction('opp', msg.e); break;
    case 'pinged': if (msg.clear) { const at = pingAt(msg.at); pings = pings.filter(q => !(q.from === msg.from && pingTouches(q, at))); render(); } else { const pg = cleanPing(msg.p); if (pg && game && game.multi && sameTeam(pg.from, mySeat)) addPing(pg); } break;
    case 'profile': if (peerInfo || !game || !game.multi) { peerInfo = { n: cleanName(msg.name), p: safePfp(msg.pfp), k: cleanSk(msg.sk) }; if (game) render(); } break;
    case 'skinData': takeSkins(msg.imgs); break;
    case 'skinPut': if (isHost && !(game && game.multi)) { takeSkins(msg.imgs); if (conn) sendSkins(conn); } break;
    case 'minit':
      newGame(msg.mode, null, { seats: msg.seats, gs: msg.gs }); mySeat = msg.seat; seatInfo = cleanInfo(msg.info);
      if (MODES[msg.mode].match4) {
        initA4(msg.seats, msg.a4.s, msg.gs);
        $('lobby').classList.add('hidden'); $('game').classList.remove('hidden');
        addChat('', 'You are ' + CN[mySeat] + '. Build your army in your own arm. Nobody sees it until everyone is ready' + (A4.teams ? ' (your partner can watch you build).' : '.'), true);
        render(); break;
      }
      if (wantsDraft()) draft = { kind: firstDraftKind(), mine: null, picked: null };
      $('lobby').classList.add('hidden'); $('game').classList.remove('hidden');
      if (game.teams) addChat('', 'Teams: ' + teamNames('r') + ' vs ' + teamNames('b') + '.', 'minor');
  Object.keys(bots).forEach(sd => addChat('', CN[sd] + ' is a bot (' + bots[sd] + ').', 'minor'));
  addChat('', game.bug ? 'You are ' + CN[mySeat] + ' (Board ' + game.info[mySeat][0] + ', ' + (game.info[mySeat][1] === 'w' ? 'White' : 'Black') + '). Your partner is ' + CN[game.partner[mySeat]] + '. Both boards play at the same time.' : 'You are ' + CN[mySeat] + '. Turn order: ' + game.seats.map(c => CN[c]).join(' → ') + '.', 'minor');
      render(); break;
    case 'nmove': if (game && game.neutralApply && game.neutralApply(msg.m)) { noteNeutral(msg.m); render(); if (!game.neutralPending) announceMulti(); } break;
    case 'draft': draft = { kind: msg.kind || 'trait', mine: msg.offers, picked: null, mates: {}, vote: null, final: null, deadline: Date.now() + (+msg.ms || 0) }; render(); break;
    case 'tvoted': if (draft && draft.kind === 'team' && draft.mine && game && game.teams && game.teams[msg.seat] !== undefined && game.teams[msg.seat] === game.teams[mySeat] && msg.seat !== mySeat && draft.mine.includes(msg.id)) { draft.mates[msg.seat] = msg.id; render(); } break;
    case 'tdone': if (draft && draft.kind === 'team' && draft.mine && draft.mine.includes(msg.id)) { draft.final = msg.id; render(); } break;
    case 'pick': if (isHost && !game.multi) recvPick(myColor === 'w' ? 'b' : 'w', msg.id); break;
    case 'traits':
      newGame(msg.mode || mode, null, { seats: msg.seats, gs: msg.gs, traits: msg.traits, classes: msg.classes }); draft = null;
      announceTraitStart(); render(); break;
    case 'mwait': $('lobbyMsg').textContent = msg.text; drawPreview(msg.prev || null); drawSeatPick(msg.pick); break;
    case 'mroom': $('lobbyMsg').textContent = msg.text; drawPreview(msg.prev || null); drawSeatPick(msg.pick); $('game').classList.add('hidden'); $('lobby').classList.remove('hidden'); break;
    case 'kicked': connUI.kicked = true; stopRetry(); connUI.set('bad', 'The host removed you from the room.'); $('lobbyMsg').textContent = 'The host removed you from the room.'; $('lobby').classList.remove('hidden'); $('game').classList.add('hidden'); break;
    case 'mmove': {
      const ok = !!(game && game.move(msg.m));
      if (ok) { sel = game.imperial && game.pend && game.turn === mySeat ? { x: game.pend.x, y: game.pend.y } : null; announceMulti(); render(); }
      let bad = !ok;                                  // the host says how many moves have been played and whose turn it is now: any disagreement = we drifted
      if (ok && msg.n !== undefined) { try { bad = game.history().length !== msg.n || game.turn !== msg.t; } catch (e) { bad = false; } }
      if (bad) askResync();
      break;
    }
    case 'mresign': if (game) { logResign(msg.seat); game.resign(msg.seat); announceMulti(); render(); } break;
    case 'mtimeout': if (game && game.multi && game.alive(msg.seat)) { timedOut.add(msg.seat); logResign(msg.seat); game.resign(msg.seat); announceMulti(); render(); } break;
    case 'timeout': if (game && !game.multi && !ended()) { over = (msg.color === 'w' ? 'White' : 'Black') + ' ran out of time.'; overRes = msg.color === 'w' ? 'b' : 'w'; render(); } break;
    case 'clock': if (!isHost && game) { clkEnsure(); if (clk) { clk.t = msg.t || clk.t; clk.turn = msg.turn; clk.run = !!msg.run; clk.at = performance.now(); clk.len = game.history().length; clkRender(); } } break;
    case 'mchat': addChat(msg.from === mySeat ? 'You' : CN[msg.from], String(msg.text || '').slice(0, 300), false, msg.from, safeImg(msg.img)); break;
    case 'rematchReq': addChat('', 'Opponent wants a rematch.', true); break;
    case 'drawOffer': case 'drawWithdraw': case 'drawDecline': case 'drawAccept': drawGot(msg.type); break;
    case 'endRound': over = 'Round ended by the host.'; overRes = 'd'; render(); break;
    case 'ready':
      if (M) {
        const prob = setupProblem(myColor === 'w' ? 'b' : 'w', msg.setup);       // an army that breaks the rules (e.g. a modified client ignoring the piece limits) is not accepted
        if (prob) { addChat('', "Opponent's army was rejected (" + prob + '). Ask them to rebuild it, or end the round.', true); render(); break; }
        M.opp = { round: msg.round, setup: msg.setup }; addChat('', 'Opponent is ready.', 'minor'); tryStart(); render();
      }
      break;
    case 'chat':
      addChat('Opponent', String(msg.text || '').slice(0, 300), false, undefined, safeImg(msg.img));
      if (isHost) sendSpecs({ type: 'schat', who: myColor === 'w' ? 'Black' : 'White', text: String(msg.text).slice(0, 300) });
      break;
  }
}

function setupConn(c) {
  conn = c;
  onOpen(c, () => {
    if (isHost) {
      everJoined = true; peerToken = c.token || null;
      $('lobby').classList.add('hidden'); $('game').classList.remove('hidden');
      $('hostCtl').classList.remove('hidden'); $('modeSel2').value = mode;
      applyColorPref();
      send({ type: 'init', mode, hostColor: myColor, moves: game ? game.history() : [], settings: M && M.s, gs, from: { n: myName(), p: safePfp(profile.pfp), sk: SKIN.mine } });
      sendSkins(conn);
      if (needDraft()) beginDraft();
      render();
    } else {
      c.send({ type: 'hello', token: myToken, spectate: spectateMode, name: cleanName(profile.name), pfp: safePfp(profile.pfp), sk: SKIN.mine });
    }
  });
  c.on('data', handleMessage);
  if (!isHost) {
    const to = setTimeout(() => { if (!c.open && !retryTimer && !connUI.joined) joinFail('timeout'); }, 12000); c.on('open', () => clearTimeout(to));          // a connection that never opens
    onOpen(c, () => { const pc = c.peerConnection; if (pc && pc.addEventListener) pc.addEventListener('iceconnectionstatechange', () => {
      if (pc.iceConnectionState === 'disconnected') connUI.set('warn', 'The connection is unstable…');
      else if (pc.iceConnectionState === 'failed') { try { c.close(); } catch (e) { /* closed */ } }
      else if ((pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') && connUI.joined) connUI.clear(); }); });
  }
  c.on('close', () => {
    if (c.replaced) return;
    $('status').textContent = 'Opponent disconnected.';
    if (!isHost && !connUI.kicked && (connUI.joined || !$('game').classList.contains('hidden'))) startRetry();
  });
}

// A room code you choose yourself (kept on this device). Letters and digits only: a PeerJS id may not end in '-' or '_'.
const cleanRoomCode = v => String(v || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
const saveFixedCode = c => { try { localStorage.setItem('chessFixedCode', c); } catch (e) { /* private mode: it is simply not remembered */ } };
let hostAttempt = 0, HOST_RETRY_MS = 4000;
function host() {
  { const raw = $('fixedCodeIn').value.trim(); if (raw && cleanRoomCode(raw).length < 4) { $('lobbyMsg').textContent = 'A room code needs at least 4 letters or digits (7 or more is safer: a short code is easy to guess). Leave it empty for a random code.'; return; } }
  const attempt = ++hostAttempt;
  banned.clear(); teamMode = 'host'; teamLock = false; isHost = true; myColor = 'w'; hostPref = null; mseats = null; bots = {}; bots2p = null; lobbyBots = []; specChatOn = false; $('specChatChk').checked = false; newGame($('modeSel').value, readSettings($('modeSel').value), { gs: readGS() });
  const typed = cleanRoomCode($('fixedCodeIn').value), code = typed || Math.random().toString(36).slice(2, 7);
  if (typed) saveFixedCode(typed);
  let tries = 0, opened = false;
  const openPeer = () => {
  peer = new Peer(PREFIX + code);
  peer.on('open', () => {
    opened = true; const url = location.origin + location.pathname + '?join=' + code;
    roomCode = code; $('copyRow').classList.remove('hidden'); $('lobby').classList.add('hosting');
    lobbyBase = '<div class="rcode"><span class="rl">Room code</span><b>' + code + '</b></div>' +
      '<div class="rlink">Friends join with: <span id="link">' + url + '</span></div>' +
      '<div class="rlink">Spectators watch with: <span>' + location.origin + location.pathname + '?watch=' + code + '</span></div>';
    $('lobbyMsg').innerHTML = lobbyBase + (MODES[mode].multi ? '' : '<div class="rwait">Waiting for them to join…</div>');
    $('botLobby').classList.toggle('hidden', !!(MODES[mode].multi || MODES[mode].match));
    { const hb = $('botHard'), ok = !!(game && game.search); hb.disabled = !ok; hb.title = ok ? 'Looks several moves ahead (about a second per move)' : 'The hard bot is not available in this mode (Easy and Normal are)'; }
    if (MODES[mode].multi) { $('lobbyCtl').classList.remove('hidden'); $('botAdd').classList.toggle('hidden', !!MODES[mode].bug); renderRoster(); }
  });
  peer.on('connection', acceptConn);
  peer.on('error', e => {
    if (e.type === 'unavailable-id' && typed && tries < 8) {      // a code you chose may still be held by the last room you closed: wait a little and try again
      tries++; $('lobbyMsg').textContent = 'The code “' + code + '” is still busy (maybe your last room is closing). Trying again (' + tries + '/8)…';
      try { peer.destroy(); } catch (x) { /* gone */ } setTimeout(() => { if (isHost && !opened && attempt === hostAttempt) openPeer(); }, HOST_RETRY_MS); return;
    }
    $('lobbyMsg').textContent = e.type === 'unavailable-id' && typed ? 'The code “' + code + '” is taken by another room. Pick a different code (or leave it empty for a random one) and press Create game again.' : 'Error: ' + e.type;
  });
  peer.on('disconnected', () => setTimeout(() => { try { if (peer && peer.disconnected && !peer.destroyed) peer.reconnect(); } catch (e) { /* ignore */ } }, 1500));      // the signalling server dropped us: new friends could not join until we reconnect
  };
  openPeer();
}

function join(code, asSpec) {
  isHost = false; myColor = 'b'; roomCode = code.trim().toLowerCase(); spectateMode = !!asSpec; myToken = getToken(roomCode);
  joinTries = 0; connUI.joined = false; connUI.kicked = false; joinPeer();
  $('lobbyMsg').textContent = 'Connecting…'; connUI.set('info', 'Connecting to the room…');
}
let joinTries = 0, joinTimer = null;
function joinPeer() {
  peer = new Peer();
  peer.on('open', () => setupConn(peer.connect(PREFIX + roomCode)));
  peer.on('error', e => { if (!retryTimer && !connUI.joined) joinFail(e.type); });
  peer.on('disconnected', () => setTimeout(() => { try { if (peer && peer.disconnected && !peer.destroyed) peer.reconnect(); } catch (e) { /* ignore */ } }, 1500));
}
function joinAgain() { clearTimeout(joinTimer); try { if (peer) peer.destroy(); } catch (e) { /* ignore */ } joinPeer(); connUI.set('info', 'Connecting to the room…'); }
function joinFail(type) {                                         // the first connection did not work: try a few times, then say clearly what to do
  clearTimeout(joinTimer); const n = ++joinTries, nf = type === 'peer-unavailable'; connUI.retryNow = joinAgain;
  if (n <= 5) { connUI.set('warn', (nf ? 'Room not found yet' : 'Could not connect') + ': trying again (' + n + '/5)…', [['Try now', joinAgain]]); joinTimer = setTimeout(joinAgain, 3000); }
  else { connUI.retryNow = null; connUI.set('bad', nf ? 'That room was not found. Check the code, or ask the host to send the link again.' : 'Could not connect (' + type + ').', [['Try again', () => { joinTries = 0; joinAgain(); }]]); }
  $('lobbyMsg').textContent = nf ? 'Room not found.' : 'Could not connect: ' + type;
}


// ---- keeping two players in step: the host is the truth. Every few seconds the guest tells the host how many moves it has; a difference (a lost message, a missed move) gets the whole game re-sent.
function hostRefreshGuest() { try { if (conn && conn.open) conn.send({ type: 'resume', rec: buildRecord(), color: myColor === 'w' ? 'b' : 'w', draft: draftFor(myColor === 'w' ? 'b' : 'w'), clk: clkSnap(), resync: true }); } catch (e) { /* the connection is closing */ } }
setInterval(() => { try { if (!isHost && conn && conn.open && game && !game.multi && !M && !A4 && !ended() && !replay && !draft && ml && ml.items) conn.send({ type: 'mcount', n: ml.items.length }); } catch (e) { /* not connected */ } }, 5000);
