exports.name = 'smoke: starting a game in many modes raises no errors';
exports.run = async t => {
  for (const m of ['standard', 'crazyhouse', 'imperial', 'promotion', 'austangGrand', 'fourplayer', 'eight', 'imperial4', 'fourcrazy', 'alice']) {
    const p = await t.open();
    await p.pg.evaluate(m => { $('modeSel').value = m; $('modeSel').dispatchEvent(new Event('change')); $('hostBtn').click(); const b = $('botNormal'); if (b && b.offsetParent) b.click(); }, m);
    await p.pg.waitForTimeout(400);
    await p.pg.evaluate(() => { setLook(true); setLook(false); });
    t.eq(p.errs, [], m + ': no errors'); await p.close();
  }
};
