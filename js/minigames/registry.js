// To add a minigame: create a file exporting { name, desc, create(ctx) } and add it here.
// create(ctx) returns { update(dt), onMessage(msg, from), cleanup() }.
// ctx: { players, me, isHost, hud, esc, rng (seeded, identical on all clients),
//        world (Three.js scene access, showDeco(false) hides the floor),
//        finish(ids, ranks?): ranks[i] = place of ids[i]; equal ranks tie (use for teams / co-op).
//        send(msg): client -> host, or host -> everyone; finish(idsBestFirst): host only }
import buttonMash from './buttonMash.js';
import memoryRun from './memoryRun.js';
import shoveOff from './shoveOff.js';
import rounds from './rounds.js';
import quickDraw from './quickDraw.js';
import stopClock from './stopClock.js';
import mathRace from './mathRace.js';
import coinGrab from './coinGrab.js';
import dodgeRain from './dodgeRain.js';
import hotPotato from './hotPotato.js';
import targetClick from './targetClick.js';
import colorFloor from './colorFloor.js';
import mazeRace from './mazeRace.js';
import memoryMatch from './memoryMatch.js';
import tugOfWar from './tugOfWar.js';
import higherLower from './higherLower.js';
import typingRace from './typingRace.js';
import rhythmRush from './rhythmRush.js';
import hillHold from './hillHold.js';
import relayRace from './relayRace.js';
import towerStack from './towerStack.js';
import syncPulse from './syncPulse.js';
import snowballFight from './snowballFight.js';
import simonSays from './simonSays.js';
import numberSort from './numberSort.js';
import colorClash from './colorClash.js';
import balloonPop from './balloonPop.js';
import oddOneOut from './oddOneOut.js';
import redLight from './redLight.js';
import flagRush from './flagRush.js';
import lastStand from './lastStand.js';
import colorFloor2 from './colorFloor2.js';
import targetTime from './targetTime.js';
import parcelRush from './parcelRush.js';
import colorConnect from './colorConnect.js';
import parkour from './parkour.js';
import { teamGame } from './teamGame.js';
import tiltTable from './tiltTable.js';
import parcelPanic from './parcelPanic.js';
import echoChain from './echoChain.js';
export const MINIGAMES = { buttonMash, memoryRun, shoveOff, rounds, quickDraw, stopClock, mathRace, coinGrab, dodgeRain, hotPotato, targetClick, colorFloor, mazeRace, memoryMatch, tugOfWar, higherLower, typingRace, rhythmRush, hillHold, relayRace, towerStack, syncPulse, snowballFight, simonSays, numberSort, colorClash, balloonPop, oddOneOut, redLight, flagRush, lastStand, tiltTable, parcelPanic, echoChain };

// Team versions of existing games (random teams, averaged placements -- see teamGame.js)
Object.assign(MINIGAMES, { colorFloor2, targetTime, parcelRush, colorConnect, parkour,
  teamBalloonPop: teamGame(balloonPop, { name: 'Team Balloon Pop', desc: balloonPop.desc }),
  teamTargetClick: teamGame(targetClick, { name: 'Team Target Click', desc: targetClick.desc, tiers: [{ n: 'Normal', m: 1, pen: 0 }, { n: 'Hard', m: 1.5, pen: 2, d: 'One extra target per team that vanishes faster.' }] }),
  teamCoinGrab: teamGame(coinGrab, { name: 'Team Coin Grab', desc: coinGrab.desc }),
});
