/* Chess Royale network transport. Its own PeerJS peers (ids chessfriends-ry<code>), completely separate from the classic lobby in js/network.js, so it
   cannot disturb it. The host runs the simulation and sends a state every tick; the guest sends commands. This file only moves messages:
     ry_hello {deck, fb, name, tok, spec}  first message (spec: true = a spectator)   ry_cmd {cmd, rid}  guest -> host   ry_chat {text}   ry_full / ry_busy / ry_bye  host -> others
   (ry_start / ry_state / ry_res are sent by the UI through api.send). Nothing here has been run over a real network yet: tests use a fake Peer. */
const RoyaleNet = (() => {
  const prefix = () => (typeof PREFIX !== 'undefined' ? PREFIX : 'chessfriends-') + 'ry';
  const CHARS = 'abcdefghijkmnpqrstuvwxyz23456789';
  const makeCode = () => { let c = ''; for (let i = 0; i < 5; i++) c += CHARS[Math.floor(Math.random() * CHARS.length)]; return c; };
  const cleanCode = v => String(v || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
  const available = () => typeof Peer !== 'undefined';
  const NO_PEER = 'Network play is not available (PeerJS did not load).';

  const RETRY_MS = 4000, MAX_TRIES = 8, MAX_SPECS = 8;
  // host(h, {code}): with opts.code the room keeps that fixed code (like the classic game's own room code) and, if the signalling server still holds it from a
  // previous room, retries every RETRY_MS up to MAX_TRIES times; without it a random code is drawn. h.onGuest(hello) may return false to refuse a player.
  function host(h, opts) {
    if (!available()) { if (h.onError) h.onError(NO_PEER); return null; }
    opts = opts || {}; const fixed = !!opts.code;
    let peer = null, player = null, specs = [], closed = false, tries = 0, code = '';
    const safe = (c, m) => { try { if (c && c.open) c.send(m); } catch (e) { /* the link is going down: its close event follows */ } };
    const refuse = (c, type) => { safe(c, { type }); setTimeout(() => { try { c.close(); } catch (e) { /* ignore */ } }, 300); };
    const api = {
      get code() { return code; }, get connected() { return !!(player && player.open); }, get specCount() { return specs.filter(c => c.open).length; },
      send(m) { safe(player, m); }, sendSpecs(m) { specs.forEach(c => safe(c, m)); }, sendAll(m) { safe(player, m); specs.forEach(c => safe(c, m)); },
      kick() { const c = player; player = null; try { if (c) c.close(); } catch (e) { /* gone */ } },
      close() { closed = true; [player].concat(specs).forEach(c => { safe(c, { type: 'ry_bye' }); try { if (c) c.close(); } catch (e) { /* gone */ } }); try { if (peer) peer.destroy(); } catch (e) { /* gone */ } }
    };
    const openPeer = () => {
      code = fixed ? opts.code : makeCode(); const p = peer = new Peer(prefix() + code);
      p.on('open', () => { if (h.onCode && p === peer) h.onCode(code); });
      p.on('connection', c => {
        let role = null;
        c.on('data', m => {
          if (!m || typeof m !== 'object') return;
          if (!role) {
            if (m.type !== 'ry_hello') return;
            if (m.spec) { if (api.specCount >= MAX_SPECS) { refuse(c, 'ry_full'); return; } role = 'spec'; specs.push(c); if (h.onSpectator) h.onSpectator(m); return; }
            const prev = player;
            if (prev && prev.open) {                                     // a room holds one player; the same guest coming back before we noticed the old link died is let in
              if (!(m.tok && h.sameGuest && h.sameGuest(m.tok))) { refuse(c, 'ry_full'); return; }
              player = null; try { prev.close(); } catch (e) { /* gone */ }
            }
            role = 'guest'; player = c;
            if (h.onGuest && h.onGuest(m) === false) { player = null; role = null; refuse(c, 'ry_busy'); }
            return;
          }
          if (role === 'guest' && c === player) { if (m.type === 'ry_cmd' && h.onCmd) h.onCmd(m); else if (m.type === 'ry_chat' && h.onChat) h.onChat(m, 'guest'); else if (m.type === 'ry_react' && h.onReact) h.onReact(m); else if (m.type === 'ry_rematch' && h.onRematch) h.onRematch(m); }
          else if (role === 'spec' && m.type === 'ry_chat' && h.onChat) h.onChat(m, 'spec');
        });
        c.on('close', () => {
          if (role === 'guest' && c === player) { player = null; if (!closed && h.onClose) h.onClose(); }
          else if (role === 'spec') { specs = specs.filter(x => x !== c); if (!closed && h.onSpecClose) h.onSpecClose(); }
        });
        c.on('error', () => { /* the close event follows */ });
      });
      p.on('error', e => {
        if (closed || p !== peer) return;
        if (e.type === 'unavailable-id') {
          if (fixed) {                                                   // our own code is still held by the server (last room): keep trying for a while
            if (++tries <= MAX_TRIES) { if (h.onRetry) h.onRetry(tries, MAX_TRIES); try { p.destroy(); } catch (x) { /* gone */ } setTimeout(() => { if (!closed && p === peer) openPeer(); }, RETRY_MS); return; }
            if (h.onError) h.onError('That room code is taken. Is another tab or device hosting it, or is your last room still closing? Try again in a minute.'); return;
          }
          if (tries < 6) { tries++; try { p.destroy(); } catch (x) { /* gone */ } openPeer(); return; }   // a random code was taken: draw another
        }
        if (h.onError) h.onError('Could not open a room (' + e.type + ').');
      });
      p.on('disconnected', () => setTimeout(() => { try { if (!closed && p === peer && p.disconnected && !p.destroyed) p.reconnect(); } catch (e) { /* ignore */ } }, 1500));      // the signalling server dropped us: new friends could not join until we reconnect
    };
    openPeer(); return api;
  }

  function join(rawCode, h) {
    if (!available()) { if (h.onError) h.onError(NO_PEER); return null; }
    const code = cleanCode(rawCode); if (code.length < 4) { if (h.onError) h.onError('Type the room code first.'); return null; }
    let peer = null, conn = null, closed = false, opened = false, timer = null;
    const api = {
      send(m) { try { if (conn && conn.open) conn.send(m); } catch (e) { /* the link is going down */ } },
      close() { closed = true; clearTimeout(timer); try { if (conn) conn.close(); } catch (e) { /* gone */ } try { if (peer) peer.destroy(); } catch (e) { /* gone */ } }
    };
    const fail = msg => { if (closed) return; if (h.onError) h.onError(msg); api.close(); };
    peer = new Peer();
    peer.on('open', () => {
      conn = peer.connect(prefix() + code, { reliable: true });
      timer = setTimeout(() => { if (!opened) fail('Could not connect: the room did not answer.'); }, 12000);
      conn.on('open', () => { opened = true; clearTimeout(timer); if (h.onOpen) h.onOpen(); });
      conn.on('data', m => { if (!m || typeof m !== 'object' || closed) return; if (m.type === 'ry_full') fail('That room is full.'); else if (m.type === 'ry_busy') fail('The host is in a match with someone else right now.'); else if (h.onMsg) h.onMsg(m); });
      conn.on('close', () => { clearTimeout(timer); if (!closed) { closed = true; if (h.onClose) h.onClose(); } });
      conn.on('error', () => { /* the close event follows */ });
    });
    peer.on('error', e => fail(e.type === 'peer-unavailable' ? 'Room not found. Check the code.' : 'Could not connect (' + e.type + ').'));
    return api;
  }
  return { host, join, cleanCode, available };
})();
