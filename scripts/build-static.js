/**
 * scripts/build-static.js — Build tĩnh cho Freebuff hosting (Node-only image).
 *
 * Dự án không có build step (vanilla HTML/JS, không framework). Script này copy
 * đúng các file runtime cần thiết vào `dist/`:
 *   - index.html        → trang chính (HTML thuần; CSS/JS được INLINE từ
 *                         css.html/js.html → dist tự-chứa như trước khi tách)
 *   - mock/mock-google.js → mock tự nạp khi chạy ngoài GAS (xem js.html)
 *
 * Luôn exit 0 khi thành công — KHÔNG start server (đó là việc của preview command).
 *
 * Usage: node scripts/build-static.js
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { inlineHtml } = require('./inline-html.js');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(ROOT, 'dist');

// Các mục runtime cần có trong bản tĩnh (mock có subdir — cp recursive).
const ENTRIES = ['index.html', 'mock'];

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

for (const entry of ENTRIES) {
  const src = path.resolve(ROOT, entry);
  if (!fs.existsSync(src)) {
    console.error(`[build] Thiếu file runtime: ${entry}`);
    process.exit(1);
  }
  fs.cpSync(src, path.resolve(OUT, entry), { recursive: true });
  console.log(`[build] Copied: ${entry}`);
}

// index.html: inline css.html/mobile.html/js.html → bản tĩnh TỰ CHỨA (như trước khi tách),
// hosting chỉ cần serve 1 file index.html + mock (không phụ thuộc MIME css/js).
const indexPath = path.resolve(OUT, 'index.html');
try {
  const html = inlineHtml(fs.readFileSync(indexPath, 'utf8'),
    path.resolve(ROOT, 'css.html'), path.resolve(ROOT, 'js.html'), path.resolve(ROOT, 'mobile.html'),
    path.resolve(ROOT, 'lib-jsqr.html'), path.resolve(ROOT, 'lib-quagga.html'), path.resolve(ROOT, 'camera-scan.html'),
    path.resolve(ROOT, 'camera-css.html'));
  fs.writeFileSync(indexPath, html);
  console.log('[build] index.html: inlined css.html + js.html');
} catch (e) {
  console.error('[build] inlineHtml fail:', e.message);
  process.exit(1);
}

console.log(`[build] OK → ${OUT}`);
