/**
 * scripts/build-static.js — Build tĩnh cho Freebuff hosting (Node-only image).
 *
 * Dự án không có build step (vanilla HTML/JS, không framework). Script này copy
 * đúng các file runtime cần thiết vào `dist/`:
 *   - index.html        → trang chính (1 file chứa toàn bộ UI)
 *   - mock/mock-google.js → mock tự nạp khi chạy ngoài GAS (xem index.html)
 *
 * Luôn exit 0 khi thành công — KHÔNG start server (đó là việc của preview command).
 *
 * Usage: node scripts/build-static.js
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

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

console.log(`[build] OK → ${OUT}`);
