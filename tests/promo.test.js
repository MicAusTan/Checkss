exports.name = 'promotion picker: tiles in board colours, bounded size';
exports.run = async t => {
  const p = await t.open(), pg = p.pg;
  await pg.evaluate(() => { $('modeSel').value = 'standard'; $('hostBtn').click(); $('botNormal').click(); }); await pg.waitForTimeout(300);
  await pg.evaluate(() => { game = Engine.create(Object.assign({}, MODES.standard.v, { setup: ['.......k', '....P...', '........', '........', '........', '........', '........', 'K.......'], castling: false, first: 'w' })); myColor = 'w'; sel = null; render(); });
  await pg.evaluate(() => { clickSq(4, 6); clickSq(4, 7); }); await pg.waitForTimeout(200);
  const d = await pg.evaluate(() => { const pr = $('promo'), r = pr.getBoundingClientRect(), b = [...pr.querySelectorAll('button')]; return { cls: pr.className, n: b.length, w: r.width, h: r.height, inView: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth, bgs: b.slice(0, 2).map(x => getComputedStyle(x).backgroundColor) }; });
  t.ok(/pop/.test(d.cls) && !/hidden/.test(d.cls), 'picker is shown'); t.eq(d.n, 5, 'four pieces + cancel'); t.ok(d.inView && d.w < 140, 'picker is on screen and not huge'); t.ok(d.bgs[0] !== d.bgs[1], 'tiles alternate light/dark');
  t.eq(p.errs, [], 'no errors'); await p.close();
};
