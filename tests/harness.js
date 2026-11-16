const path = require('path'), { chromium } = require(process.env.PW || 'playwright'), server = require('./server.js');
// The real PeerJS comes from a CDN; the tests replace it with a stub that "opens" immediately and never connects (network is simulated by the tests).
const STUB = "window.Peer=function(){var s=this;this.on=function(e,cb){if(e==='open')setTimeout(function(){cb('stub')},30);return s};this.connect=function(){return {on:function(){},send:function(){},close:function(){},open:false}};this.destroy=function(){};this.id='stub'}";
exports.start = async () => {
  const srv = await server.start(path.join(__dirname, '..')), browser = await chromium.launch();
  const open = async (opts = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true }), pg = await ctx.newPage(), errs = [];
    pg.on('pageerror', e => errs.push(String(e))); pg.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
    await pg.route(/^(?!http:\/\/localhost)/, r => (r.request().url().includes('peerjs') ? r.fulfill({ contentType: 'text/javascript', body: STUB }) : r.abort()));
    if (opts.noWorker) await pg.addInitScript(() => { window.Worker = function () { throw new Error('workers disabled for this test'); }; });
    await pg.goto(srv.url + (opts.query || '')); await pg.waitForFunction(() => typeof connUI !== 'undefined' && typeof Engine !== 'undefined');
    return { pg, errs, close: () => ctx.close() };
  };
  return { open, url: srv.url, stop: async () => { await browser.close(); srv.close(); } };
};
