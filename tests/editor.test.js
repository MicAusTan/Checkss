const fs = require('fs'), path = require('path'), os = require('os');
exports.name = 'piece editor: layers, handles, shapes, free mode, undo/redo, drafts, export/import, boss';
exports.run = async t => {
  const p = await t.open(), pg = p.pg, tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cwf-'));
  const imgs = await pg.evaluate(() => [0, 1].map(i => { const cv = document.createElement('canvas'); cv.width = 600; cv.height = 400; const x = cv.getContext('2d'); x.fillStyle = i ? '#37d' : '#d33'; x.fillRect(0, 0, 600, 400); return cv.toDataURL('image/png'); }));
  imgs.forEach((d, i) => fs.writeFileSync(path.join(tmp, 'i' + i + '.png'), Buffer.from(d.split(',')[1], 'base64')));
  await pg.click('#palBtn'); await pg.click('#skinEditBtn'); await pg.waitForSelector('#skinEd .skp');
  await pg.click('.skp[data-t="n"]'); await pg.setInputFiles('#skFile', path.join(tmp, 'i0.png')); await pg.waitForSelector('#skLayers .skly');
  t.eq(await pg.locator('#skLayers .skly').count(), 1, 'a picture was added');
  await pg.check('input[name=skMode][value=free]');
  const rb = await pg.locator('#skSelBox .rot').boundingBox(); await pg.mouse.move(rb.x + 8, rb.y + 8); await pg.mouse.down(); await pg.mouse.move(rb.x + 80, rb.y + 40, { steps: 4 }); await pg.mouse.up();
  t.ok(+(await pg.inputValue('#skR')) !== 0, 'the round handle rotates');
  const hb = await pg.locator('#skSelBox .se').boundingBox(); await pg.mouse.move(hb.x + 7, hb.y + 7); await pg.mouse.down(); await pg.mouse.move(hb.x + 60, hb.y + 60, { steps: 4 }); await pg.mouse.up();
  const s1 = +(await pg.inputValue('#skS')); t.ok(s1 > 100, 'dragging a corner resizes (size ' + s1 + ')');
  await pg.fill('#skX2', '250'); await pg.dispatchEvent('#skX2', 'input'); t.eq(+(await pg.inputValue('#skX2')), 250, 'a picture can go far past the old edge');
  await pg.waitForTimeout(700); await pg.uncheck('#skLayers input[data-a=vis]'); t.eq(await pg.evaluate(() => !!document.querySelector('#skBig .bse')), false, 'the original icon can be hidden');
  await pg.click('#skUndo'); t.eq(await pg.evaluate(() => !!document.querySelector('#skBig .bse')), true, 'undo brings the original icon back'); await pg.click('#skRedo'); t.eq(await pg.evaluate(() => !!document.querySelector('#skBig .bse')), false, 'redo hides it again');
  await pg.waitForTimeout(700);
  await pg.check('input[name=skMode][value=shape]'); await pg.click('.shp[data-i="6"]');
  t.ok((await pg.evaluate(() => document.querySelector('#skBig .skn.f.m')) !== null), 'cut to an own shape (star)');
  await pg.click('#skEditShape'); const poly = await pg.locator('#skPoly').boundingBox(); const before = await pg.locator('#skPoly circle.pt').count();
  await pg.mouse.click(poly.x + poly.width * .55, poly.y + poly.height * .23); t.eq(await pg.locator('#skPoly circle.pt').count(), before + 1, 'clicking the outline adds a point');
  await pg.click('#skEditShape');
  // export -> import round trip
  const [dl] = await Promise.all([pg.waitForEvent('download'), pg.click('#skExp')]); const f = path.join(tmp, 'out.json'); await dl.saveAs(f);
  const data = JSON.parse(fs.readFileSync(f, 'utf8')); t.ok(data.cwfSkin === 1 && data.pieces.n && data.pieces.n.l.length === 1, 'export file looks right');
  await pg.click('#skSave2'); await pg.waitForTimeout(300);
  await pg.setInputFiles('#skImp', f); await pg.waitForFunction(() => /Imported/.test(document.getElementById('skMsg').textContent)); t.ok(true, 'import works');
  // drafts: change something, wait for the autosave, reopen
  await pg.fill('#skS', '40'); await pg.dispatchEvent('#skS', 'input'); await pg.waitForTimeout(1900);
  t.eq(await pg.evaluate(() => SkDB.drafts().then(d => d.length)), 1, 'a draft was auto-saved');
  // boss thumbnail
  const bossT = await pg.evaluate(() => Engine.NEUTRAL_T.boss); await pg.click('.skp[data-t="' + bossT + '"]');
  const sz = await pg.evaluate(t => { const ic = document.querySelector('.skp[data-t="' + t + '"] .ic'), a = ic.querySelector('.b4 svg').getBoundingClientRect(), b = ic.querySelector('.b4').getBoundingClientRect(); return Math.round(a.width * 2) <= Math.round(b.width) + 1; }, bossT);
  t.ok(sz, 'the Boss thumbnail quarters fit their grid'); t.eq(p.errs, [], 'no errors'); await pg.reload(); await pg.waitForFunction(() => typeof connUI !== 'undefined'); const p2 = { pg, close: () => p.close() }; await p2.pg.evaluate(() => { skinActivate(null); }); await p2.pg.click('#palBtn'); await p2.pg.click('#skinEditBtn');
  await p2.pg.waitForSelector('#dlgBack:not(.hidden)'); t.ok(/unsaved skin changes/.test(await p2.pg.textContent('#dlgMsg')), 'the draft is offered again after a reload');
  await p2.close();
};
