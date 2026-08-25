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
const { inlineHtml, injectStandaloneFlags, injectDemoFlag } = require('./inline-html.js');

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
// DENY: file/thư mục hệ thống — trước chỉ chặn traversal nên .git/appsscript.json
// (chứa scriptId)/Code.gs bị serve công khai khi bind 0.0.0.0 (bug 2026-08-18).
const DENY_SEGMENTS = [
  '.git', '.clasp.json', 'appsscript.json', '.claspignore', 'node_modules',
  '.npm', '.config', 'package-lock.json',
];
function isDenied(rel) {
  if (/\.gs$/i.test(rel)) return true;  // source GAS (scriptId/URL deployment) — preview không cần serve
  return rel.split(/[\\/]/).some((seg) => DENY_SEGMENTS.indexOf(seg) >= 0);
}
// T4 whitelist (2026-08-23): preview bind 0.0.0.0 public — chỉ serve file cần cho UI,
// không lộ source/docs/api/tests. Denylist trước vẫn lộ README.md/docs/api/*.py.
const ALLOW_RE = /^(index\.html|mock\/.+\.(js|json)|favicon\.ico)$/;
function isAllowed(rel) {
  if (rel === 'index.html') return true;
  return ALLOW_RE.test(rel);
}
function safeResolve(urlPath) {
  let clean;
  try {
    clean = decodeURIComponent(String(urlPath).split('?')[0].split('#')[0]);
  } catch {
    return null; // URL encode lỗi
  }
  const rel = clean === '/' ? 'index.html' : clean.replace(/^\/+/, '');
  if (!isAllowed(rel)) return null;
  if (isDenied(rel)) return null;
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
          path.join(ROOT, 'lib-jsqr.html'), path.join(ROOT, 'lib-quagga.html'), path.join(ROOT, 'camera-scan.html'),
          path.join(ROOT, 'camera-css.html'));
        // STANDALONE (2026-08-12): preview = trang top-level thật (không iframe GAS) →
        // camera live hoạt động. Chèn cờ để js.html shim gọi GAS qua JSONP thay
        // google.script.run (không có trong trang ngoài GAS).
        // DEMO (?demo=1): không gọi GAS — load mock-google.js (task/staff giả) để test
        // UI + camera với dữ liệu có sẵn (GAS access DOMAIN chặn JSONP anonymous).
        const isDemo = /[?&]demo=1\b/.test(req.url);
        res.end(isDemo ? injectDemoFlag(html) : injectStandaloneFlags(html));
        return;
      } catch (e) {
        console.error('[serve] inlineHtml fail:', e.message);
        res.statusCode = 500;
        res.end('500 inlineHtml fail: ' + e.message);
        return;
      }
    }
    const stream = fs.createReadStream(abs);
    stream.on('error', () => {
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('500 Read error');
    });
    stream.pipe(res);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`[serve] Điểm Danh HN2 SOC static server: http://${HOST}:${PORT} (root ${ROOT})`);
});
