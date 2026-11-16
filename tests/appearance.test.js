exports.name = 'appearance: board colour swatches and custom colours';
exports.run = async t => {
  const p = await t.open(), pg = p.pg; await pg.click('#palBtn');
  await pg.click('#themeSw button[data-t="green"]'); t.eq(await pg.evaluate(() => document.documentElement.dataset.theme), 'green', 'a swatch applies the theme');
  await pg.click('#themeSw button[data-t="custom"]'); await pg.fill('#cDark', '#336699'); await pg.dispatchEvent('#cDark', 'input');
  t.eq(await pg.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--dark').trim()), '#336699', 'custom colours reach the board');
  t.ok(await pg.evaluate(() => !!document.getElementById('palSel')), 'the colour-blind piece palette is in the drawer'); t.eq(p.errs, [], 'no errors'); await p.close();
};
