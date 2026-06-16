const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 8787;
const ROOT = __dirname;
const FILES = new Map([
  ['/','content_screener_v4.html']
]);

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    ...headers
  });
  res.end(body);
}

function fetchText(targetUrl, cb) {
  const client = targetUrl.startsWith('https:') ? https : http;
  client.get(targetUrl, (resp) => {
    if (resp.statusCode >= 300 && resp.statusCode < 400 && resp.headers.location) {
      const next = new url.URL(resp.headers.location, targetUrl).toString();
      return fetchText(next, cb);
    }
    let data = '';
    resp.setEncoding('utf8');
    resp.on('data', chunk => data += chunk);
    resp.on('end', () => cb(null, resp, data));
  }).on('error', err => cb(err));
}

const server = http.createServer((req, res) => {
  const parsed = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'OPTIONS') {
    return send(res, 204, '');
  }

  if (parsed.pathname === '/api/ping') {
    return send(res, 200, 'ok', { 'Content-Type': 'text/plain; charset=utf-8' });
  }

  if (parsed.pathname === '/api/fetch') {
    const target = parsed.searchParams.get('url');
    if (!target) return send(res, 400, 'Missing url');
    return fetchText(target, (err, upstream, body) => {
      if (err) return send(res, 500, String(err));
      const ct = upstream.headers['content-type'] || 'text/plain; charset=utf-8';
      send(res, upstream.statusCode || 200, body, { 'Content-Type': ct });
    });
  }

  const fileName = FILES.get(parsed.pathname) || 'content_screener_v4.html';
  const filePath = path.join(ROOT, fileName);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = ext === '.html' ? 'text/html; charset=utf-8' : 'application/octet-stream';
    return send(res, 200, fs.readFileSync(filePath), { 'Content-Type': contentType });
  }

  send(res, 404, 'Not found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Content Screener helper running at http://127.0.0.1:${PORT}`);
});
