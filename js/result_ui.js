/* result_ui.js: the top of the board. A finished game shows a result card (who won, why, and the next-step buttons) instead of one line of text, and the
   short "what you are doing right now" prompts (ability targets, swap, charge, "bot is thinking", your trait) move into a small hint pill under the turn line. */
function roundInfo() {                                                    // Austang 2-player: the card between rounds
  const me = myColor, opp = me === 'w' ? 'b' : 'w', r = M.lastRes, fin = M.round >= M.s.rounds;
  const score = 'Round ' + M.round + '/' + M.s.rounds + ' · Score: you ' + M.scores[me] + ' – ' + M.scores[opp] + ' opponent';
  const tail = fin ? (M.scores[me] > M.scores[opp] ? ' · You win the match!' : M.scores[me] < M.scores[opp] ? ' · You lose the match.' : ' · The match is drawn.') : ' · Press Continue to adjust your setup';
  const why = r === 'd' ? (M.why === 'stalemate' ? 'Stalemate' : M.why === 'draw' ? 'Not enough material' : over ? '' : '') : '';
  return { res: r === 'd' ? 'd' : r === me ? 'me' : 'opp', title: r === 'd' ? 'Round drawn' : r === me ? 'You won the round!' : 'You lost the round', sub: (why ? why + ' · ' : '') + score + tail };
}
function resultInfo() {
  if (M && M.phase === 'between' && game && !replay && M.lastRes) return roundInfo();
  if (!game || replay || draft || game.bug || M || !ended()) return null;
  const spec = spectating;
  if (game.multi) {
    if (over || (game.drawn && !game.winner())) {
      const why = over ? 'Everybody agreed to a draw' : (drawWhy() ? 'Only bare kings are left' : 'Nobody left can move');
      return { res: 'd', title: 'Draw', sub: why };
    }
    const w = game.winner(); if (!w) return null;
    const mine = !spec && sameSide(w, mySeat);
    return { res: mine ? 'me' : 'opp', title: spec ? teamNames(w) + (game.teams ? ' win' : ' wins') : mine ? 'You win!' : 'You lost', sub: spec || mine ? (game.teams ? 'Last team standing' : 'Last one standing') : teamNames(w) + (game.teams ? ' win' : ' wins') };
  }
  let wc = null, sub = '';                                              // wc: winning colour, or 'd'
  if (over) { wc = overRes || 'd'; sub = over; }
  else {
    const s = game.status();
    if (s === 'checkmate') { wc = game.turn === 'w' ? 'b' : 'w'; sub = 'Checkmate'; }
    else if (s === 'bare') { wc = game.loser === 'w' ? 'b' : 'w'; sub = 'Only the Imperials are left'; }
    else if (s === 'stalemate') { wc = 'd'; sub = 'Stalemate'; }
    else if (s === 'draw') { wc = 'd'; sub = 'Not enough material to checkmate'; }
    else return null;
  }
  const name = c => (c === 'w' ? 'White' : 'Black');
  if (wc === 'd') return { res: 'd', title: 'Draw', sub: sub.replace(/\.$/, '') };
  return { res: wc === myColor ? 'me' : 'opp', title: spec ? name(wc) + ' wins' : wc === myColor ? 'You win!' : 'You lost', sub: sub.replace(/\.$/, '') };
}
let rcKey = '';
function renderResult() {
  const info = resultInfo(), card = $('resultCard');
  card.classList.toggle('hidden', !info); $('status').style.display = info ? 'none' : '';
  if (!info) { rcKey = ''; return; }
  card.className = info.res === 'd' ? 'draw' : info.res === 'me' ? 'win' : spectating ? 'draw' : 'loss';
  $('rIcon').textContent = info.res === 'd' ? '🤝' : info.res === 'me' ? '🏆' : spectating ? '🏁' : '🏳️';
  $('rTitle').textContent = info.title; $('rSub').textContent = info.sub;
  const btns = [['Continue', 'nextBtn'], ['Rematch', 'rematchBtn'], ['Replay', 'replayBtn'], ['New game', 'newBtn']].filter(([, id]) => !$(id).classList.contains('hidden') && !$(id).closest('.hidden')).map(([l, id]) => [l, () => $(id).click()]);
  if (ml && ml.items && ml.items.length) btns.push(['Copy moves', copyMoves]);
  if (canAnalyse()) btns.push(['Analyse', analyseGame]);
  const key = info.title + '|' + info.sub + '|' + btns.map(b => b[0]).join();
  if (key === rcKey) return; rcKey = key;
  $('rBtns').textContent = '';
  btns.forEach(([label, fn]) => { const b = document.createElement('button'); b.textContent = label; b.onclick = fn; $('rBtns').appendChild(b); });
}
function splitHint() {
  const el = $('status'), hint = $('hint');
  let text = '';
  if (game && !spectating && !replay && !draft && !ended() && (!M || M.phase === 'play')) {
    let base = ''; try { base = statusText(); } catch (e) { base = ''; }
    const t = el.textContent;
    if (base && t !== base) {
      if (t.startsWith(base)) text = t.slice(base.length).replace(/^\s*·\s*/, '');
      else text = t;
      el.textContent = base;
    }
  }
  hint.textContent = text; hint.classList.toggle('hidden', !text); hint.classList.toggle('think', /thinking…/.test(text));
}
{ const baseRender = render; render = function () { baseRender.apply(this, arguments); splitHint(); renderResult(); }; }
