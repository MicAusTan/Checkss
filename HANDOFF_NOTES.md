# Chess with Friends — handoff notes for the next Claude

## What this is
A browser chess-variant game for a small group of friends, hosted on GitHub Pages (static files only, no server).
Two files do everything: `index.html` (UI, networking, ~1900 lines) and `engine.js` (all game rules, ~1600 lines).
Networking is peer-to-peer with PeerJS (CDN script tag). One player is the HOST, the others join by link
(`?join=ROOMCODE`) or watch (`?watch=ROOMCODE`). The host runs everything; guests send moves, the host validates and broadcasts.
The user is a casual chess player (not an expert). The user wants fun/chaotic variants, plays with friends (not competitive).
The user asked me to keep things optional (bots, classes, traits, etc. are all host options), and to keep the UI uncluttered
(only show options that apply to the current mode).

Please ask the user to upload the two files (`index.html`, `engine.js`). Always edit copies, run tests, and re-deliver BOTH files
(they must be uploaded together).

## Modes (keys in MODES inside index.html)
2-player: standard, crazyhouse, marseillais (2 moves/turn), kriegspiel (hidden pieces), austang (build your army, rounds + points),
alice (two boards), infinite (32x32, zoom/pan view).
3-4 players: fourplayer (14x14 cross board, corners cut), fourmars, fourcrazy, fourkrieg, fourneutral (centre "neutral monsters"),
fouralice (two cross boards), fourinfinite (cross inside an open 32x32), threeplayer (hexagonal 127-cell board), bughouse (2v2, two boards).
Seat colours: r (red, bottom), b (blue), y (yellow), g (green); 2-player colours are 'w'/'b'. 3-4 player games can start with 2, 3 or 4 players
(unused sides are gray inert pieces; 2 players sit opposite). Gray/eliminated kings CAN be captured. Checkmate eliminates a player;
stalemate just skips the turn (draw only if everyone is stuck). Insufficient material = draw (2-player engine).

## Host options ("Game options" box, shown per mode via `opts` lists in MODES)
`fog` Fog of War; `teams` 2v2 (cross board or wide 16xN board, partners can't capture/check each other); `drop` Crazyhouse drop zone;
`neutral` (neutral piece set + fallen armies); `traits` class traits; `c960` Chess960; `cyl` Cylinder chess (2-player modes, or 4-player wide team board).
Options are read when a game STARTS (use New game after changing). Settings object is `gs`; `makeEngine(mode, seats, gs, traits)` builds an
engine from plain settings (also used for replay). `GS_DEFAULTS` lists the defaults.

## Engine API (engine.js) — three engine families
- 2-player engine `create(variant)` (STANDARD, CRAZYHOUSE, MARSEILLAIS, INFINITE...). State S is replaced on each move (pure `apply`). Methods: at(x,y), moves(x,y),
  move(m), drops(), hand(c), status(), turn, history(), inCheck(), sees(c) (fog), evalMoves() (bots), canSwap(c), drainEvents(), traits getter.
- `createMulti` (4-seat cross/wide/infinite boards; teams, drops, Marseillais, neutral pieces, castling incl. Chess960, traits, cylinder on wide board). Similar API plus
  seats, alive(c), winner(), drawn, kingPos(c), neutralPending/neutralNext/neutralApply, sees(c), evalMoves(c), canSwap(c).
- `createHex` (3-player hex), `createAlice4` (4-player Alice), 2-player Alice, `createBughouse` (wrapper over two 2-player crazyhouse boards).
- Moves are plain objects {fx,fy,tx,ty,promo,castle,...}; drops {drop,tx,ty}; swap {swap:true,fx,fy,tx,ty}. History entries replay with `move()`; neutral moves have c:'n' and replay with neutralApply.
- Exports: create, STANDARD, CRAZYHOUSE, MARSEILLAIS, INFINITE, ALICE, FOUR, THREE, BUGHOUSE, TRAITS, randomBack960, botChoose.
- Piece types: p n b r q k; fairy types c (commoner), i (imp), w (wraith), o (ox) for neutral pieces; a (Archbishop) and l (Paladin) created by traits.
  Piece objects: {t, c, m (has moved), dead (gray), pr (promoted), champ (Champion pawn), id (neutral)}.
- Hidden-information modes (Kriegspiel, fog) are UI-only (every client holds the full game).

## Key features already built (all tested with simulated pages + engine playouts)
- Lobby: kick players, manual start (+ optional auto-start), team assignment buttons, add bots, spectator link.
- Game record layer: `buildRecord()` / `applyRecord()` / `loadRecord()` => reconnect (token in localStorage; host recognises returning player and sends `resume`),
  spectators (`spec` message, read-only, optional spectator chat via a host checkbox), replay (step/auto-play; incoming moves are queued while replaying), clickable move list.
- Replay/move list hidden in fog/Kriegspiel until the game ends.
- Bots (host-side only): Easy (random, 60% greedy capture) and Normal (best of: capture value − biggest recapture threat, checks, promotions, centre). `Engine.botChoose`.
  Hex/Alice boards use a plain capture-greedy fallback. No bots in bughouse/Austang. Bots auto-pick traits. Host can let a bot take over a seat.
- Turn notification: quiet 2-note sine chime + flashing tab title; "Soft turn sound" checkbox. Board colour themes (Classic/Green/Blue/Slate/Rose).
- Zoom/pan for Infinite boards. Cylinder chess view (tilted barrel, faded wrap-around files, drag/spin) — flat playable board, not true 3D.
- Austang: host "End round (draw)" button; Austang has no spectators/replay/bots/traits.
- Class traits (see below), Chess960 (castle by moving king onto own rook), neutral pieces mode, Friendly Fire two-click confirm, Swap button.

## Traits (40) — "class traits" option; each player secretly picks 1 of 3-4 random offers
Draft screen: host-only secret: click the "Choose your class trait" heading 5 times quickly to reveal ALL eligible traits for their own pick.
Traits stay hidden from opponents during play (no mid-game reveals); everyone's traits are listed in chat at game end. Teammates see each other's traits.
Defined in `TRAITS` in engine.js (fields: name, desc, setup(back,pawns), defs(fwd), pawn flags, multi:true (4-player only), fog:true (only with fog)).
Per-colour piece defs override base moves; defs support `slide` (+`max`), `leap`, `leapNC` (non-capturing steps), `kwalk` (knight squares reached by a free connecting square), `plus` (rook side-step shape),
`walk`. Kings never attack beyond their 3x3 (so extended kings never check kings). An extended king in check may only step 1 square but can still capture at full range.
IDs: flanker, twinTowers, bishopBrigade, knightCavalry, longKing, steadfast, camelRiders, sidestepRooks, pushyBishops, amazonQueen, jumpingRooks, hoppingBishops, queenHop, knightKing, stags,
brawlers, wanderers, charge, knuckle, retreaters, earlyBloom, martyr, conqueror, lastStand, backstabbers, slingers, shieldWall, bodyguard, boobyTrap, swap, loneWolf, glassCannon,
overlord, friendlyFire, archbishop, paladin, juggernaut, empress, champions, scout.
Design decisions made with the user: Lone Wolf = full 5x5 king (jumps knight squares, other squares need the middle empty) but rooks max 3 squares, bishops max 4;
Long Reach King = 5x5 minus corners, cannot jump; Empress queen (eased: rooks/bishops max 4, knights can't jump); Champion Pawns (d/e pawns king-like + 2-square jumps, still promote;
other pawns can't promote; owner/teammates see a gold glow); "peak" traits exist for king/bishop/knight/rook/queen/pawn.

## Tooling/testing approach (nothing from /tmp persists — recreate)
- Engine tests: plain node scripts `require('./engine.js')` with scripted positions (custom `setup` rows, `first`, `traits`) and random playouts (assert no illegal moves).
- Page tests: `npm i jsdom` in a scratch folder; load index.html, inline engine.js, stub `Peer`, queue `setTimeout` callbacks (bots/neutral phases use timers; jsdom also keeps node alive, so run with `timeout`).
  Call internal functions via `window.eval(...)` (e.g. newGame, render, clickSq, startMulti, buildRecord).
- Always syntax-check the inline script after edits (extract the `<script>` body and run `node --check`).
- Always say in replies that tests ran in simulated pages, not real browsers/real P2P sessions.

## CLASSES — IMPLEMENTATION STATUS: ALL 7 CLASSES DONE (Summoner, Rogue, Mage, Warrior, Cleric, Engineer, Illusioner). Bots with classes: the user said it is too complicated and "probably won't happen" (bots just ignore abilities). Remaining ideas: playtest balance, user may want more classes / per-ability in-check rules.
Build stages: 1 Summoner (DONE) -> 2 Rogue + Mage (DONE) -> 3 Warrior + Cleric (DONE) -> 4 Engineer + Illusioner + Overrun (DONE) -> 5 bots with classes (dropped by the user).
User chose: defaults start 2 / +1 per turn / cap 8, all numbers host-editable (done), build in the staged order above. The user wants to keep going until THEY say the chat is too long, then they ask for the handoff note again.
### Balance/design decisions made while building (tell the user, tweakable)
USER FEEDBACK so far: agreed that kings should be excluded from Disarm/Blink ("adjacent kings is a mess"). Said Backstab must NOT take the whole turn in Marseillais: in Marseillais the turn only ends early when you give check, so a `replace:true` ability uses ONE move (`raw.spend()`), the whole turn only when the mode has 1 move per turn. The user asked whether the strict "no ability while in check unless it resolves the check" rule is intended; it is my literal reading of the notes' "abilities can never leave your own king in check" — offer to relax it (cast anything, but the normal move must still resolve the check) if they prefer.
Warrior: Charge (4) = pick a piece, it makes two moves in a row (forced to be the same piece; a check on the 1st move ends the turn; not available in Marseillais modes; implemented by `raw.setTurn(c)` giving the turn back, with `chg` state + `g.moves`/`g.drops` overrides; other casts are blocked while charging); Shield (3) own/teammate non-king piece can't be captured by anything until the caster's next turn (does NOT stop Assassinate/Meteor); Rally (4) no click: own pawns on own ranks 2-4 step forward (front pawns first, a step that would expose the king is skipped). Passive = trait `charge` pawn flag. Ultimate Overrun (8) NOT built yet (spec below).
Cleric: passive `kingGuard` = pawns can't capture the cleric's non-king pieces adjacent to the cleric's king; Cleanse (2) no click: removes Freeze/Disarm from own/teammates' pieces and shields those pieces (my reading of "protect until your next turn"); Revive (6) most recent captured non-queen piece returns on an empty square of the first two ranks; Sanctuary (3) two own/teammate non-king pieces immune to PAWN captures until the caster's next turn (two clicks); Resurrection (8, ult) last 2 captured pieces incl. queen (1 or 2 clicks depending on how many are in the graveyard — `steps` can be a function). Captures are tracked by the class layer (`grave[c]`, from normal moves and Backstab; destroyed pieces are NOT revivable; promoted pawns come back as pawns).
Rogue: Steal (4) takes an enemy pawn; Backstab (3) is `replace:true` = uses the WHOLE turn (even in Marseillais), captures an adjacent non-king enemy with any own piece (not frozen/disarmed), pawns landing on the promotion rank become queens, Crazyhouse gives the captured piece to the hand; Disarm (3) non-king only; Assassinate (8, ult) any non-king enemy, destroyed (no hand credit).
Mage: Freeze (3) non-king; Blink (2) own non-king piece (not frozen) to an empty square within 2 (Chebyshev; pawns can't land on rank 1 or on/after the promotion rank); Jump (4) own rook/bishop/queen/archbishop slides through blockers (also attacks through them) until next turn; Meteor (8, ult) destroys every non-king piece in a 3x3 (own pieces too).
"Enemy" = pieces of alive opposing seats (not teammates, not gray/dead/neutral pieces). Ability targets are filtered so the caster's own king is never left attacked; an ability that gives an enemy king check ends the turn.
USER FEEDBACK (latest): asked whether abilities should be usable while in check. Current rule = an ability may be cast in check only if it resolves the check (so Assassinate/Meteor/Freeze/Disarm on the checking piece, or Blink/Wall to block, all work). The user floated per-ability exceptions (e.g. Meteor never in check but Assassinate allowed) — NOT decided; a per-ability flag (e.g. `notInCheck:true` checked in `base()`) would be easy. Asked for a host option to hide Shield/Sanctuary protection from opponents: DONE (`gs.clHideFx`, default visible).
Engineer (done): passive rooks step 1 diagonally; Wall (3) blocking wall on any empty square for 2 of the caster's turns (a wall is a board piece `{t:'#', c:'x', wall:true, by, ttl}`: blocks sliding, can't be landed on or captured (`foe`/`can` check `t.wall`), knights jump over, Meteor/Fortress interplay: Meteor destroys walls; a wall whose removal would leave an enemy king attacked is kept one more turn); Rewire (3, replace) swap two own non-king pieces (two clicks; pawns can't be swapped onto rank 1 / the promotion rank); Mine (5) secret mine on an empty square in the caster's half (own-frame rank < depth/2), 2 turns, destroys the first enemy non-king piece that lands (not if that would expose its own king); mines live in the wrapper (`mines`, `g.mines(viewer|null)`), only shown to the owner's team (UI-only secrecy, like fog); Fortress (8, ult) walls on every empty square around the king for 3 turns.
Illusioner (done): passive Mirage = the first time the Illusioner would be checkmated the king was a decoy: it relocates to the first empty first-two-ranks square that is not attacked and not next to an enemy king (once per game; `mirageUsed`, `g.mirages()` log, UI announces it). 2-player: checked in the wrapper (`afterAction`, status()==='checkmate'); 4-player: engine hook `raw.setRescue(fn)` called inside createMulti `settle()` before a checkmate elimination. Decoy Pawn / Decoy Knight (2 each, two abilities) = temporary ghost piece in the caster's HALF (own-frame rank < depth/2 — my choice, the notes didn't say where) for 3 caster turns: gives no check (flag `fx.dcy`), can be captured, removed at expiry; Phantom (4) own non-king, non-ghost piece for 2 turns: uncapturable, can't capture, gives no check (`fx.phn`; shows as see-through cyan); Mirror (3) two clicks: swap one of your ghosts with another of your non-king pieces (pawns can't be swapped onto rank 1 / promotion rank); Hall of Mirrors (8, ult) every ghost makes ONE temporary decoy copy on the first free adjacent square (copies are decoys even for phantoms, so no permanent extra material). Ghost countdown lives in `fx.gt` (+ `fx.dec` = decoy piece); expiry is postponed one turn if it would leave an enemy king attacked.
Overrun (done, Warrior ult 8, `replace` semantics = it IS the move): cast on a piece that has a capture; then ONLY captures by that piece are legal (`ovr` state, `g.moves` filters, turn handed back with `raw.setTurn`); the chain ends when no capture is left, when the player presses "End Overrun" (`{ab:'stop', c}` entry in abLog) or when a capture gives check. A check-giving capture hands control to the checked player (first checked alive enemy in seat order, `raw.setTurn(r)`), and after their move control returns to the Overrun player for a NORMAL new turn (2-player = natural order; in 4-player it skips the seats in between). Not available with 2 moves per turn (Marseillais).
### How it is built (read before extending)
- **engine.js**: `CLASSES` (name, desc, `passive:{desc, pawn?:{...}, add?:{pieceType:{leap:[...]}}}`, `abilities:[{id,name,cost,ult?,replace?,kind,piece?,desc}]`), `CLASS_DEFAULTS`, `classPass(map)`, `withClasses(game,{classes:{seat:id},cfg})` = wrapper (`Object.create(game)`) for the 2-player engine and createMulti (cross + wide-team).
  Wrapper API: `cls`, `cfg`, `pts(c)`, `abilities(c)` (each {id,name,cost,ult,replace,steps,desc,why}; why='' = castable), `chargeOf(c)`, `overrunOf(c)`, `mirages()`, `mines(viewer)`, `abSteps(c,id)` (0, 1 or 2 clicks; 0 = cast immediately with `{ab, c}`), `abTargets(c,id,from?)` (squares for the 1st click, or with `from` the 2nd click), `abLog()`, overrides `move()` / `resign()`.
  Cast = `game.move({ab:id, c, [fx,fy,] tx, ty})` (fx,fy = first click of a two-click ability; tx,ty = last click). It travels through the normal move/mmove/tryMove messages, so host validation, spectators, reconnect work unchanged.
  Casts are NOT in `history()`; they are in `abLog()` entries `{at, ab, c, [fx,fy,] tx, ty}` (`at` = number of normal moves before the cast). Records store `rec.abils`; `applyRecord` (`doAbs`) and the move-list shadow engine replay them.
  **Ability kinds** are a table `KINDS` inside `withClasses`: each has `steps`, `first(c,a)` (+ `second(c,a,from)` for two-click), and `run(c,a,fx,fy,tx,ty,dry)`. Candidates are filtered by `legalCast` (trial: snapshot -> run(dry=true) -> own king attacked? -> restore). `dry` must NOT touch hands/counters (multi engine state isn't fully snapshotted: only the board). To add an ability: add a def to a class in `CLASSES` + a `KINDS` entry.
  **Status effects** are stored on piece objects: `p.fx = {frz|dis|jmp|shd|sct|phn|dcy: casterSeat, gt?: ghost turns left, dec?: decoy piece}` (phn/dcy/gt/dec are NOT in the generic one-turn expiry; see `TIMED`) (shd = Shield: can't be captured at all; sct = Sanctuary: can't be captured by pawns; both checked in `foe` (2-player, via `guardedFrom`/`curB`) and `can` (multi, via `guarded`)); they expire when that caster's next turn begins (`expire()` in `turnChanged`, also if the caster is dead). Engine support: frozen = no moves and gives no check; disarmed = no captures (incl. e.p.) and gives no check; jmp = sliders pass through pieces. `fx` is copied when a piece moves (apply/move/sim). New effects (shield, immune-to-pawns, walls, mines, ghosts) should follow this pattern (add checks in pseudo/foe/attacked of BOTH engines).
  Points: everyone starts with `cfg.start`; the player whose turn begins gains `cfg.gain` (capped at `cfg.cap`, never reduced below current) — detected by comparing `game.turn` after each move.
- **Low-level hooks** `game.raw` (2-player engine + createMulti ONLY): `snap, restore, put, pass, spend (use one move), setTurn, setRescue (4-player only), check, foeCheck, home, ok, scan, valid, size, depth, foe (never walls), ally (own/teammate piece), fwd, rank, promo, remove, take, clearEp`. The engines also expose `perTurn` (moves per turn). Add more if an ability needs them. Multi `raw.restore` only restores the board array.
- **Passives**: `v.cpass[c]` (from `classPass`) is merged in `pf2`/`pflags` for pawn flags, and in `D2`/`D` (via `withAdd`) for `add:{type:{leap}}` piece-shape additions on top of any trait defs. Passive flag `kingGuard` is read in `guardedFrom`/`guarded`. Engineer's rook diagonal step is just another `add` (easy).
- **index.html**: host option block `#gsClasses` (flat `gs` keys classes, clStart, clGain, clCap, clPer, clSum, clUlt, clHide, clFree); mode opt `'classes'` for standard, crazyhouse, marseillais, fourplayer, fourmars, fourcrazy (NOT kriegspiel, alice, infinite, neutral, hex, bughouse, austang).
  `makeEngine(mode, seats, gs, traits, classes)` wraps the game. Draft is generic with `draft.kind` ('trait' | 'class'): traits first (if on), then classes; ONE final `traits` message carries `{traits, classes}`. `needDraft()` replaces old `gs.traits && !gtraits` checks. Class offers = 3 random (all with free pick); host secret = click the heading 5 times.
  UI: `#classBar` (points, passive, ability buttons — ★ = replaces your move — opponents' class/points unless hidden), `abMode`/`abFrom`/`abSet` (ability being targeted, first click, highlighted squares via the 'hint' class; first click gets the 'sel' class), `abClick`, `abValidate`, `fxClass` (CSS .fx-frz blue / .fx-dis grey / .fx-jmp gold / .fx-shd green / .fx-sct purple glow, shd/sct hidden from opponents via `fxSeen` when `gs.clHideFx`; .fx-wall walls; `mineSet` -> .sq.mine red outline for the owner's team; `chargeSq` marks the Charge piece, applied in the 2-player and cross/wide renderers only), `announceAbilities` (chat line per cast), class reveal at game end, `gclasses` global, `buildRecord` stores `classes` + `abils`.
- Bots ignore classes (they still earn points).
### Testing notes for classes
- Engine tests (recreate): `Engine.withClasses(Engine.create({...Engine.STANDARD, cpass: Engine.classPass(map)}), {classes: map, cfg})`; scripted positions via `setup` rows listed from rank 8 (top) down to rank 1 (row index 0 = y 7!); random playouts casting random castable abilities (use two-step `abTargets(c,id,firstClick)`), assert `raw.check(c)` false after each cast, and replay determinism (apply abLog entries with `at <= i` before move i). For 4-player pass `seats`, `dead:[]` (wide: `board:'wide', height:10, teams:{r:0,y:0,b:1,g:1}`). Test files used while building (recreate if needed): t1..t6 engine playout suites and pt..pt6 jsdom page tests (see below). 2-player playouts assert the invariant `!game.raw.foeCheck(game.turn)` (the side to move never faces an attacked enemy king) — keep it. Long random playout suites exceed the 300 s tool limit: run them in the background (`nohup ... &`, output to a file, poll) with fewer iterations (env N2/N4); never `pkill -f` a pattern that matches your own shell command. Page tests: the draft offers 3 random classes, so tests must use free pick (`$('clFree').checked = true`) or pick from `draft.mine`.
- Page tests (jsdom): `runScripts:'dangerously'` with engine.js inlined as a <script> (so top-level const/let like `$`, `game`, `Engine` are visible to later `window.eval`); stub `Peer` and `setTimeout` in `beforeParse`. Click squares with `ev('clickSq(x,y)')`; opponents' moves in host tests via `game.move(...)`.

## ORIGINAL DESIGN SPEC for classes (stage 1 implemented only the Summoner; numbers are now host-editable defaults)
Separate host option from traits (both can be on; user plays them separately). Only 2-player modes and the 4-player cross + wide-team boards.
Selection: 3 random class offers per player, hidden-by-default behaviour like traits' draft (secret: click the title 5 times to pick any class manually), plus a host option "free pick".
Host settings: points per turn + cap (suggested default: start 2, +1/turn, cap 8), abilities per turn (default unlimited, limited only by points), ultimate once per game or repeatable,
option to hide classes from opponents (default: visible; teammates always see yours). Helpful abilities may target partners' pieces in team games.
Each class = 1 passive (mini-trait) + 3 abilities + 1 ultimate (cost ~8). Most abilities are cast BEFORE your normal move (like Spell Chess); some REPLACE the move.
Universal rules: an ability that leaves an enemy king in check ends your turn (no normal move); abilities can never leave your own king in check or destroy kings.
Needed engine/UI pieces: point meter, ability buttons with cost + targeting, effect timers (freeze, shield, walls, mines…), history/replay entries for abilities, bot handling (bots may ignore classes at first), record/replay compatibility.
Suggested build order: Summoner, Rogue, Mage easy abilities, Warrior, Cleric, Engineer, then Overrun (hardest).
Draft class list (numbers still tweakable):
- Mage (passive: knights can also jump 2 straight): Freeze 3 (enemy non-king piece can't move or give check until your next turn); Blink 2 (move one of your pieces to an empty square within 2, doesn't use the turn);
  Jump 4 (chosen piece ignores blockers, also for check, until your next turn); Ult Meteor 8 (3x3 around a square destroyed, kings excepted).
- Warrior (passive: pawns can jump 2 forward from any rank): Charge 4 (same piece moves twice; check on first move ends the turn); Shield 3 (a piece can't be captured until your next turn);
  Rally 4 (pawns on your ranks 2-4 step forward); Ult Overrun 8 (one piece chain-captures; if a capture gives check the checked player responds, then control returns to the Overrun player; in 4-player this overrides turn order).
- Rogue (passive: bishops can also step 1 straight): Steal 4 (enemy pawn changes sides); Backstab 3 (REPLACES move: your piece captures any adjacent enemy piece however it normally moves);
  Disarm 3 (enemy piece can't capture or give check until your next turn); Ult Assassinate 8 (destroy any enemy non-king piece).
- Cleric (passive: your pieces next to your king can't be captured by pawns): Cleanse 2 (remove freeze/disarm from your pieces + protect until your next turn; replaces the redundant "Mend");
  Revive 6 (last captured piece back on your back two ranks, not a queen); Sanctuary 3 (two pieces immune to pawn captures this turn and next); Ult Resurrection 8 (up to 2 captured pieces, queen allowed).
- Engineer (passive: rooks can also step 1 diagonally): Wall 3 (blocking wall on an empty square for 2 turns); Rewire 3 (REPLACES move: swap two of your pieces except kings);
  Mine 5 (secret mine on an empty square in your half, lasts 2 turns, destroys the first enemy non-king piece that lands); Ult Fortress 8 (walls on empty squares around your king for 3 turns; knights/adjacent pawns can still reach it).
- Summoner (passive: pawns promote one rank sooner): Summon Pawn 2, Summon Minor 4, Summon Rook 5 (all on empty squares of your first two ranks); Ult Summon Queen 8. Suggested cap: 4 summons per game.
- Illusioner (idea from the user, draft): passive Mirage (first time you'd be checkmated, your king was a decoy: it vanishes and your real king appears on an empty square of your first two ranks, once);
  Decoy 2 (ghost pawn/knight for 3 turns, can't give check); Phantom 4 (a piece becomes a ghost for 2 turns: uncapturable, can't capture); Mirror 3 (swap places with a ghost); Ult Hall of Mirrors 8 (every ghost duplicates once).
The user is still thinking of more classes and wants to review the final numbers.

## Other open ideas (not started)
Cylinder tweaks (tilt/shade strength), "peak" traits for pawn were built (Champions); more neutral piece types; bots with classes; the user may add more game modes later (ask for suggestions if they want).
