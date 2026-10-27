import { teams, teamCount, TEAM_ICON, TEAM_NAME } from './util.js';
// Turns any minigame into a TEAM version without touching the game: players are split into random teams (2 teams, or 3-4 for bigger lobbies:
// 2v2, 2v2v2, 2v2v2v2 ... same on every client), the game plays exactly as normal, and the final placements are averaged per team (average of
// squared placement points, so uneven teams stay fair and top finishers count more). Teams are ranked by that average; equal averages tie.
export function teamGame(base, { name, desc, tiers }) {
  return {
    ...base, ...(tiers ? { tiers } : {}), team: true, name, desc: `TEAM VERSION! ${desc} You're on a random team - the team with the best average placement wins.`,
    create(ctx) {
      const ids = Object.keys(ctx.players), n = ids.length, K = teamCount(n), team = teams(ctx, K), c2 = Object.create(ctx);
      c2.team = team; c2.teamCount = K;
      c2.finish = (order, ranks) => {                                    // `order` = best first (ranks may tie); individual results become team results
        const pts = {}; order.forEach((id, i) => pts[id] = (n - (ranks ? ranks[i] : i)) ** 2);
        const avg = k => { const m = ids.filter(id => team(id) === k); return m.length ? m.reduce((a, id) => a + (pts[id] ?? 0), 0) / m.length : -1; };
        const A = Array.from({ length: K }, (_, k) => avg(k)), order2 = A.map((v, k) => k).filter(k => A[k] >= 0).sort((x, y) => A[y] - A[x]);
        const place = {}; let r = -1, last = null; order2.forEach(k => { if (A[k] !== last) { r++; last = A[k]; } place[k] = r; });
        const sorted = [...ids].sort((x, y) => place[team(x)] - place[team(y)] || (pts[y] ?? 0) - (pts[x] ?? 0));
        ctx.finish(sorted, sorted.map(id => place[team(id)]));
      };
      const inst = base.create(c2), el = document.createElement('div'); el.className = 'tbar';
      const nm = k => ids.filter(id => team(id) === k).map(id => ctx.esc(ctx.players[id].name)).join(', ');
      el.innerHTML = Array.from({ length: K }, (_, k) => `<b>${TEAM_ICON[k]} ${nm(k)}</b>`).join('<br>') + `<br><small>You: ${TEAM_ICON[team(ctx.me)]} ${TEAM_NAME[team(ctx.me)]}</small>`; ctx.hud.append(el);
      let shown = false;
      return {
        ...inst,
        update(dt) { inst.update(dt); if (!shown && (shown = true)) ids.forEach(id => ctx.world.popIcon?.(id, TEAM_ICON[team(id)])); },
        cleanup() { el.remove(); inst.cleanup(); },
      };
    },
  };
}
