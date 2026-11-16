exports.name = 'lobby: bot panel, round swatches, one place per browser, bans, bot timing';
exports.run = async t => {
  const p = await t.open(), pg = p.pg;
  await pg.evaluate(() => { $('modeSel').value = 'fourcrazy'; $('modeSel').dispatchEvent(new Event('change')); $('hostBtn').click(); }); await pg.waitForSelector('#addBotBtn:visible');
  await pg.click('#addBotBtn'); await pg.click('#botLvl button[data-l="hard"]'); await pg.click('#addBotBtn');
  t.eq(await pg.evaluate(() => lobbyBots.map(b => b.level)), ['normal', 'hard'], 'the strength selector picks the level');
  t.eq(await pg.evaluate(() => [...new Set([...document.querySelectorAll('#roster .swt')].map(e => { const r = e.getBoundingClientRect(); return Math.round(r.width) + 'x' + Math.round(r.height); }))]), ['18x18'], 'colour swatches are round');
  await pg.selectOption('#botAdd select[data-bot=think]', '2500'); t.eq(await pg.evaluate(() => globalThis.BOT_MS), 2500, 'thinking time setting reaches the bots');
  const r = await pg.evaluate(async () => {
    const mk = () => { const h = {}; return { open: true, sent: [], on(e, f) { (h[e] = h[e] || []).push(f); }, send(m) { this.sent.push(m.type); }, close() { this.closed = true; }, emit(e, d) { (h[e] || []).forEach(f => f(d)); } }; };
    lobbyBots.length = 0; const cs = [mk(), mk(), mk(), mk()]; cs.forEach((c, i) => { acceptConn(c); c.emit('data', { type: 'hello', token: i < 3 ? 'A' : 'B', name: 'P' + i }); }); await new Promise(r => setTimeout(r, 200));
    const o = { seats: conns.length, olderClosed: cs[0].closed && cs[1].closed && !cs[2].closed };
    const late = mk(); acceptConn(late); await new Promise(r => setTimeout(r, 1700)); late.emit('data', { type: 'hello', token: 'B' }); await new Promise(r => setTimeout(r, 100)); o.afterLate = conns.length;
    banned.add('A'); const bn = mk(); acceptConn(bn); bn.emit('data', { type: 'hello', token: 'A' }); await new Promise(r => setTimeout(r, 500)); o.bannedKicked = bn.sent.includes('kicked'); o.after = conns.length; return o;
  });
  t.eq(r.seats, 2, 'three joins from one browser take one seat'); t.ok(r.olderClosed, 'the older connections are closed'); t.eq(r.afterLate, 2, 'a late hello is merged too'); t.ok(r.bannedKicked && r.after === 2, 'a banned browser is refused');
  t.eq(p.errs, [], 'no errors'); await p.close();
};
