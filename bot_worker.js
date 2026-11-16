/* bot_worker.js: the Hard bot thinks here, so the page never freezes. It rebuilds the position from the game record (core.js) and returns the move. */
importScripts('../engine.js', '../imperial.js', '../promotion.js', '../core.js');
onmessage = ev => {
  const d = ev.data || {};
  try {
    globalThis.BOT_MS = d.ms || 1200;
    const g = buildGameFromRecord(d.rec);
    const m = g.promotion ? Promotion.botChoose(g, d.level) : g.imperial ? Imperial.botChoose(g, d.level) : Engine.botChoose(g, d.sd, d.level);
    postMessage({ id: d.id, m: m || null });
  } catch (e) { postMessage({ id: d.id, err: String(e && e.message || e) }); }
};
