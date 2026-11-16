const bp = require('peerjs-js-binarypack');
exports.name = 'skins: validation, migration, null-prototype crash, reset';
exports.run = async t => {
  const p = await t.open();
  const r = await p.pg.evaluate(() => {
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', hh = skHash(png), o = {};
    o.legacy = cleanSk({ n: { h: hh, m: 1, x: 5, y: -3, s: 120 } }); o.bad = cleanSk({ n: { l: [{ h: 'zz' }] }, p: 5 });
    o.cap = cleanSk({ n: { m: 1, l: Array.from({ length: 9 }, () => ({ h: hh })) } }).n.l.length;
    o.shapeOk = !!cleanSk({ n: { v: 2, m: 1, k: 'p:10,10 90,10 50,90', l: [{ h: hh }] } }).n.k; o.shapeBad = 'k' in cleanSk({ n: { v: 2, m: 1, k: 'p:evil', l: [{ h: hh }] } }).n;
    skinActivate({ id: 'o', name: 'o', pieces: { n: { img: png, m: 0, c: 1, x: 10, y: 0, s: 150 } } }); o.mig = SKIN.mine.n; o.proto = Object.getPrototypeOf(SKIN.mine) === Object.prototype && Object.getPrototypeOf(cleanSk({})) === Object.prototype;
    o.wire = JSON.parse(JSON.stringify(SKIN.mine));
    $('modeSel').value = 'standard'; $('hostBtn').click(); $('botNormal').click(); o.withSkin = 0;
    return o;
  });
  t.eq(r.legacy.n.v, 2, 'old wire form accepted'); t.eq(r.bad, {}, 'bad input dropped'); t.eq(r.cap, 6, 'at most 6 layers');
  t.ok(r.shapeOk && !r.shapeBad, 'own shapes are validated'); t.eq([r.mig.m, r.mig.l[0].x, r.mig.l[0].s], [0, 7, 108], 'old overlay rescaled to square units'); t.ok(r.proto, 'skin objects are plain (PeerJS cannot send null-prototype objects)');
  t.ok(r.wire.n && (() => { try { bp.pack({ type: 'hello', sk: r.wire }); return true; } catch (e) { return false; } })(), 'a skin packs with the real PeerJS serializer');
  await p.pg.waitForTimeout(300);
  t.ok((await p.pg.evaluate(() => document.querySelectorAll('#board .skn').length)) >= 2, 'skin shows on the board');
  await p.pg.evaluate(() => { skinActivate(null); setLook(false); }); await p.pg.waitForTimeout(150);
  t.eq(await p.pg.evaluate(() => document.querySelectorAll('#board .skn').length), 0, 'reset to default removes the skin');
  t.eq(p.errs, [], 'no errors'); await p.close();
};
