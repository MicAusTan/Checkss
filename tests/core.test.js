// core.js must work without a browser (the Hard-bot worker relies on it)
const vm = require('vm'), fs = require('fs'), path = require('path');
exports.name = 'core.js runs headless: every mode builds, a record replays, the bots choose';
exports.run = async t => {
  const root = path.join(__dirname, '..'), ctx = vm.createContext({ console, Math, Date, JSON }); ctx.globalThis = ctx;
  for (const f of ['engine.js', 'imperial.js', 'promotion.js', 'core.js']) vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
  const r = JSON.parse(vm.runInContext(`JSON.stringify(Object.keys(MODES).map(m => { try { return [m, !!makeEngine(m).game]; } catch (e) { return [m, e.message]; } }))`, ctx));
  r.forEach(([m, v]) => t.eq(v, true, 'mode ' + m + ' builds'));
  t.eq(vm.runInContext(`(() => { const e = makeEngine('standard'), g = e.game, m = Engine.botChoose(g, g.turn, 'hard'); const g2 = buildGameFromRecord({ mode: 'standard', gs: e.gs, seats: null, moves: [m], resigns: [], abils: [] }); return [!!m, g2.history().length]; })()`, ctx), [true, 1], 'hard bot move replays from a record');
  t.eq(vm.runInContext(`(() => { const e = makeEngine('imperial'), g = e.game; const m = Imperial.botChoose(g, 'normal'); return !!m; })()`, ctx), true, 'imperial bot chooses');
};
