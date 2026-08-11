/**
 * scripts/serve.js — Static file server cho preview local (không framework, không dependency).
 *
 * - Cổng đọc từ env `PORT` (Freebuff inject cổng đúng cho workspace) — fallback 4173.
 * - Bind `0.0.0.0` (yêu cầu của Freebuff preview).
 * - Chỉ serve file tĩnh trong thư mục project, chặn path traversal.
 *
 * Usage: node scripts/serve.js
 */
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { inlineHtml } = require('./inline-html.js');

const ROOT = path.resolve(__dirname, '..');
const HOST = '0.0.0.0';
const PORT = Number(process.env.PORT) || 4173;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

// Giải URL thành đường dẫn tuyệt đối an toàn trong ROOT; null nếu thoát ra ngoài.
function safeResolve(urlPath) {
  let clean;
  try {
    clean = decodeURIComponent(String(urlPath).split('?')[0].split('#')[0]);
  } catch {
    return null; // URL encode lỗi
  }
  const rel = clean === '/' ? 'index.html' : clean.replace(/^\/+/, '');
  const abs = path.resolve(ROOT, rel);
  if (abs !== ROOT && !abs.startsWith(ROOT + path.sep)) return null;
  return abs;
}

const server = http.createServer((req, res) => {
  const abs = safeResolve(req.url || '/');
  if (!abs) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 Forbidden');
    return;
  }
  fs.stat(abs, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    const type = MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': type,
      'Cache-Control': 'no-store',
    });
    // index.html: inline css.html/mobile.html/js.html lúc serve (khớp GAS doGet) — bản serve ra
    // tự chứa như trước khi tách, trình duyệt không cần fetch thêm asset nào.
    if (path.basename(abs) === 'index.html') {
      try {
        const html = inlineHtml(fs.readFileSync(abs, 'utf8'),
          path.join(ROOT, 'css.html'), path.join(ROOT, 'js.html'), path.join(ROOT, 'mobile.html'),
          path.join(ROOT, 'lib-jsqr.html'), path.join(ROOT, 'lib-quagga.html'), path.join(ROOT, 'camera-scan.html'));
        res.end(html);
        return;
      } catch (e) {
        console.error('[serve] inlineHtml fail:', e.message);
        res.statusCode = 500;
        res.end('500 inlineHtml fail: ' + e.message);
        return;
      }
    }
    fs.createReadStream(abs).pipe(res);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`[serve] RollCall v2 static server: http://${HOST}:${PORT} (root ${ROOT})`);
});
