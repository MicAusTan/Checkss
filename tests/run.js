// npm test: runs every tests/*.test.js. Each exports { name, run(t) } where t = { open, ok, eq, url }.
const fs = require('fs'), path = require('path'), harness = require('./harness.js');
(async () => {
  const h = await harness.start(); let fail = 0, pass = 0;
  const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.test.js')).sort(), only = process.argv[2];
  for (const f of files) {
    if (only && !f.includes(only)) continue;
    const T = require('./' + f); const checks = [];
    const t = { open: h.open, url: h.url, ok: (c, m) => checks.push([!!c, m]), eq: (a, b, m) => checks.push([JSON.stringify(a) === JSON.stringify(b), m + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')']) };
    try { await T.run(t); } catch (e) { checks.push([false, 'threw: ' + (e && e.stack || e)]); }
    const bad = checks.filter(c => !c[0]); fail += bad.length; pass += checks.length - bad.length;
    console.log((bad.length ? 'FAIL ' : 'ok   ') + T.name + ' (' + (checks.length - bad.length) + '/' + checks.length + ')'); bad.forEach(b => console.log('       - ' + b[1]));
  }
  await h.stop(); console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
})();
