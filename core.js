/* core.js: the mode table, game construction and record replay. Pure (no DOM): loaded by the page AND by the Hard-bot worker. */
/* ============ MODES ============ */
// Add a mode = add a variant object here (see engine.js for the format).
const MODES = {
  standard:   { name: 'Standard Chess', opts: ['fog', 'traits', 'classes', 'c960'], v: Engine.STANDARD },
  crazyhouse: { name: 'Crazyhouse',     opts: ['drop', 'fog', 'traits', 'classes', 'c960'], v: Engine.CRAZYHOUSE },
  marseillais: { name: 'Marseillais (2 moves per turn)', opts: ['fog', 'traits', 'classes', 'c960'], v: Engine.MARSEILLAIS },
  cylinder: { name: 'Cylinder Chess (the board wraps around)', cyl: true, opts: ['fog', 'traits', 'c960'], v: Engine.STANDARD },
  // hidden:true is read by the UI only: you see just your own pieces, the referee announces things
  kriegspiel: { opts: ['traits', 'c960'], name: 'Kriegspiel (hidden pieces)', v: Object.assign({}, Engine.STANDARD, { hidden: true }) },
  // The real game is built each round from both players' setups; v here only supplies flags.
  austang: { name: 'Austang (build your army)', match: true, opts: ['fog'], v: Object.assign({}, Engine.STANDARD, { castling: true }) },
  austangGrand: { name: 'Austang Grand (10×10 fairy army)', match: true, grand: true, opts: ['fog'], v: Engine.AUSTANG_GRAND },
  austang4: { name: 'Austang 4-Player (build your army, 20×20)', multi: true, match4: true, grand: true, all: ['r', 'b', 'y', 'g'], opts: ['teams'], v: Object.assign({}, Engine.AUSTANG4, { board: undefined }) },
  alice:    { name: 'Alice Chess (two boards)', v: Engine.ALICE },
  infinite: { name: 'Infinite Chess (32×32 board)', opts: ['fog'], v: Engine.INFINITE },
  // multi:true modes are hosted as a hub; `all` = every seat on that board, 2..n players may start.
  fourplayer:  { name: '4-Player Chess (cross board)', multi: true, opts: ['fog', 'teams', 'traits', 'classes', 'c960'], all: ['r', 'b', 'y', 'g'], v: Engine.FOUR },
  fourmars:    { name: '4-Player Marseillais (2 moves per turn)', multi: true, opts: ['fog', 'teams', 'traits', 'classes', 'c960'], all: ['r', 'b', 'y', 'g'], v: Object.assign({}, Engine.FOUR, { movesPerTurn: 2, firstSingle: true }) },
  fourcrazy:   { name: '4-Player Crazyhouse', multi: true, opts: ['drop', 'fog', 'teams', 'traits', 'classes', 'c960'], all: ['r', 'b', 'y', 'g'], v: Object.assign({}, Engine.FOUR, { drops: true }) },
  fourcyl:     { name: '4-Player Cylinder Chess (wide board wraps around)', multi: true, cyl: true, opts: ['fog', 'teams', 'traits', 'c960'], all: ['r', 'b', 'y', 'g'], v: Object.assign({}, Engine.FOUR, { board: 'wide' }) },
  fourkrieg:   { name: '4-Player Kriegspiel (hidden pieces)', multi: true, opts: ['teams', 'traits', 'c960'], all: ['r', 'b', 'y', 'g'], v: Object.assign({}, Engine.FOUR, { hidden: true }) },
  fourneutral: { name: '4-Player Neutral Pieces (centre monsters)', multi: true, all: ['r', 'b', 'y', 'g'], opts: ['fog', 'teams', 'neutral', 'traits', 'c960'], v: Object.assign({}, Engine.FOUR, { neutral: true, drops: true }) },
  bughouse:    { name: 'Bughouse (2v2, two boards, partner passes pieces)', multi: true, bug: true, all: ['r', 'b', 'y', 'g'], opts: [], v: Engine.BUGHOUSE },
  fouralice:   { name: '4-Player Alice Chess (two cross boards)', multi: true, all: ['r', 'b', 'y', 'g'], opts: ['teams'], v: Object.assign({}, Engine.FOUR, { alice: true, castling: false }) },
  fourinfinite: { name: '4-Player Infinite Chess (open 32×32 board)', multi: true, all: ['r', 'b', 'y', 'g'], opts: ['fog', 'teams', 'traits', 'c960'], v: Object.assign({}, Engine.FOUR, { board: 'infinite' }) },
  eight: { name: '8-Player Chess (24×24, two armies per side)', multi: true, oct: true, all: Engine.OCT_ORDER, opts: ['oct', 'neutral'], v: Engine.OCTO },
  threeplayer: { name: '3-Player Chess (hexagonal board)', multi: true, opts: ['fog'], all: ['r', 'b', 'y'], v: Engine.THREE },
  imperial: { name: 'Imperial Chess (17×16, destroy the army)', imperial: true, opts: [], v: { imperial: true } },
  promotion: { name: 'Promotion Chess (every piece can promote)', promotion: true, opts: [], v: { promotion: true } },
  imperial4: { name: 'Imperial Chess: 4-Player (29×29; free-for-all or 2v2)', imperial: true, multi: true, all: ['r', 'b', 'y', 'g'], opts: ['teams'], v: { imperial: true } },
};

const GS_DEFAULTS = { teams8: 'ffa', holes8: 'four', wild8: false, boss8: false, burrow: false, dropZone: 'any', fog: false, teams: false, board: 'cross', height: 10, neutralSet: 'commoner', fallen: false, neutralDrop: false, impRoam: false, traits: false, offers: 4, c960: false, back960: null, cyl: false,
  foeMoves: true, seed: 1, classes: false, clStart: 2, clGain: 1, clCap: 8, clPer: 0, clSum: 4, clUlt: false, clHide: false, clFree: false, clHideFx: false, tcMin: 0, tcInc: 0 };
// Builds an engine for a mode from plain settings, without touching any globals (also used to rebuild games for replay).
function makeEngine(m, seatsIn, gsIn, traits, classes, a4) {
  const g2 = Object.assign({}, GS_DEFAULTS, gsIn || {}), op = MODES[m].opts || [];
  g2.traits = !!g2.traits && op.includes('traits');
  g2.fog = !!g2.fog && op.includes('fog');
  g2.c960 = !!g2.c960 && op.includes('c960');
  if (MODES[m].imperial && !MODES[m].multi) return { game: Imperial.create(), gs: g2, seats: null };
  if (MODES[m].promotion) return { game: Promotion.create(), gs: g2, seats: null };
  g2.cyl = !!MODES[m].cyl;                      // Cylinder is a mode, not an option
  g2.classes = !!g2.classes && op.includes('classes');
  const cl = g2.classes && classes ? classes : null, cpass = cl ? Engine.classPass(cl) : undefined;
  const ccfg = { seed: +g2.seed || 1, start: +g2.clStart, gain: +g2.clGain, cap: +g2.clCap, perTurn: +g2.clPer, ultRepeat: !!g2.clUlt, summonCap: +g2.clSum };
  const wrap = gm => (cl ? Engine.withClasses(gm, { classes: cl, cfg: ccfg }) : gm);
  if (g2.c960 && !g2.back960) g2.back960 = Engine.randomBack960();
  if (!g2.c960) g2.back960 = null;
  if (MODES[m].multi) {
    const all = MODES[m].all;
    let seats = (seatsIn || all).filter(c => all.includes(c));
    if (seats.length < 2) seats = all.slice();
    if (MODES[m].oct) {                            // 8-player board: its own seats, team layouts, holes (from the shared seed) and neutral options
      const sOct = (seatsIn || all).filter(c => all.includes(c)), seats8 = sOct.length < 2 ? all.slice() : sOct;
      const tm = Engine.OCT_TEAMS[g2.teams8] || null;
      const teams8 = tm && new Set(seats8.map(c => tm[c])).size >= 2 ? tm : null; g2.teams = !!teams8;
      const hp = g2.holes8 || 'four', seed = +g2.seed || 1, neu = !!g2.wild8 || !!g2.boss8;
      return { game: Engine.create(Object.assign({}, Engine.OCTO, { seats: seats8, dead: [], teams: teams8, seed, holes: { preset: hp === 'random' ? 'scatter' : hp, seed, balanced: hp !== 'random' },
        neutral: !!g2.wild8, neutralSet: g2.wild8 ? 'wild' : 'none', boss: !!g2.boss8, fallen: !!g2.fallen, drops: neu && !!g2.neutralDrop, burrowPromote: !!g2.burrow })), gs: g2, seats: seats8 };
    }
    let teams = g2.teams && op.includes('teams') ? { r: 0, y: 0, b: 1, g: 1 } : null;
    if (teams && new Set(seats.map(c => teams[c])).size < 2) teams = null;
    g2.teams = !!teams;
    if (MODES[m].match4) {                         // Austang 4-player: 20x20 cross (or the 20x14 wide team board); the armies come from the match layer
      const base = teams && g2.board === 'wide' ? Engine.AUSTANG4_WIDE : Engine.AUSTANG4;
      return { game: Engine.create(Object.assign({}, base, { seats, dead: all.filter(c => !seats.includes(c)), teams, armies: a4 ? a4.armies : undefined, first: a4 ? a4.first : undefined })), gs: g2, seats };
    }
    if (MODES[m].imperial) return { game: Imperial.create({ four: true, seats, teams, wide: !!teams && g2.board === 'wide', height: +g2.height || 0 }), gs: g2, seats };
    const dead = all.filter(c => !seats.includes(c)), neu = !!MODES[m].v.neutral;
    const game = Engine.create(Object.assign({}, MODES[m].v, { seats, dead, dropZone: neu ? 'arm' : g2.dropZone, teams,
      board: MODES[m].v.board || (teams && g2.board === 'wide' && !neu && !MODES[m].v.alice ? 'wide' : undefined), height: +g2.height || 10,
      neutralSet: g2.neutralSet, fallen: !!g2.fallen, impRoam: !!g2.impRoam, drops: neu ? !!g2.neutralDrop : MODES[m].v.drops, traits, back960: g2.back960 || undefined, cylinder: g2.cyl, cpass }));
    return { game: wrap(game), gs: g2, seats };
  }
  return { game: wrap(Engine.create(Object.assign({}, MODES[m].v, { dropZone: g2.dropZone, traits, back960: g2.back960 || undefined, cyl: g2.cyl, cpass }))), gs: g2, seats: null };
}

function applyRecord(g, rec, k) {
  const n = k == null ? rec.moves.length : k; let ri = 0, applied = 0, ai = 0;
  const abs = rec.abils || [];
  const doAbs = lim => { while (ai < abs.length && abs[ai].at <= lim) { g.move(abs[ai]); ai++; } };
  const doResigns = lim => { while (ri < rec.resigns.length && rec.resigns[ri].at <= lim) { g.resign(rec.resigns[ri].seat); ri++; } };
  for (const e of rec.moves) {
    if (applied >= n) break;
    doAbs(applied); doResigns(applied);
    if (e.c === 'n') g.neutralApply(e); else g.move(e);
    applied++;
  }
  if (applied >= rec.moves.length) { doAbs(Infinity); doResigns(Infinity); }
  return g;
}
const buildGameFromRecord = (rec, k) => applyRecord(makeEngine(rec.mode, rec.seats, rec.gs, rec.traits, rec.classes, rec.a4 && rec.a4.armies ? { armies: rec.a4.armies, first: rec.a4.first } : null).game, rec, k);
