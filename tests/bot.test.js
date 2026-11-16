exports.name = 'hard bot: thinks in a worker (page stays alive) and falls back when workers are missing';
exports.run = async t => {
  for (const noWorker of [false, true]) {
    const p = await t.open({ noWorker }), pg = p.pg;
    await pg.evaluate(() => { $('modeSel').value = 'standard'; $('hostBtn').click(); $('botHard').click(); }); await pg.waitForTimeout(400);
    await pg.evaluate(() => { globalThis.BOT_MS = 2000; window.__t = 0; setInterval(() => window.__t++, 50); $('botSpeedSel').value = '0'; const m = game.moves(4, 1).find(m => m.ty === 3); game.move(m); send({ type: 'move', m }); announce(); render(); });
    const t0 = Date.now(), k0 = await pg.evaluate(() => window.__t); await pg.waitForFunction(() => game.history().length >= 2, null, { timeout: 15000 });
    const dt = Date.now() - t0, ticks = (await pg.evaluate(() => window.__t)) - k0;
    t.ok(true, (noWorker ? 'fallback' : 'worker') + ': the bot replied after ' + dt + ' ms');
    if (!noWorker) { t.ok(ticks > dt / 50 * 0.6, 'the page kept running while the bot thought (' + ticks + ' ticks)'); t.eq(await pg.evaluate(() => !!botWorker && !botWorkerDead), true, 'the worker was used'); }
    else t.eq(await pg.evaluate(() => botWorkerDead), true, 'worker marked unavailable');
    t.eq(p.errs, [], 'no errors'); await p.close();
  }
};
