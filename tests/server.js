// A tiny static file server for the tests (workers and fetches need http, not file://).
const http = require('http'), fs = require('fs'), path = require('path');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
exports.start = root => new Promise(res => {
  const srv = http.createServer((req, rsp) => {
    const p = path.join(root, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+$/, '/index.html'));
    if (!p.startsWith(root)) { rsp.writeHead(403); return rsp.end(); }
    fs.readFile(p, (e, d) => { if (e) { rsp.writeHead(404); return rsp.end('not found'); } rsp.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); rsp.end(d); });
  }).listen(0, () => res({ url: 'http://localhost:' + srv.address().port + '/', close: () => srv.close() }));
});
