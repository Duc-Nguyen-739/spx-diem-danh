/**
 * tests/cdp-helper.test.js — kiểm tra nhanh scripts/cdp-helper.js (dev tool CDP).
 * Lệnh 'select' phải đọc prefix từ args[1] (args[0] là tên lệnh "select") và phải
 * return sau khi chọn — bug 2026-08-18: đọc args[0] nên không bao giờ khớp tab,
 * thiếu return nên rơi xuống "Lệnh không biết: select".
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'cdp-helper.js'), 'utf8');

test('cdp-helper select: đọc prefix từ args[1] + có return', () => {
  const block = src.slice(src.indexOf("cmd === 'select'"), src.indexOf("cmd === 'list'"));
  assert.ok(block.indexOf('const prefix = args[1];') >= 0,
    'prefix phải lấy từ args[1] — args[0] là tên lệnh "select" (bug: args[0] không bao giờ khớp tab)');
  assert.ok(block.indexOf('return;') >= 0,
    'sau khi chọn tab phải return — nếu không rơi xuống "Lệnh không biết: select"');
});