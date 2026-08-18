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

test('cdp-helper: connect/send không treo vĩnh viễn (timeout + onclose) — bug 2026-08-18', () => {
  assert.match(src, /WS_CONNECT_TIMEOUT_MS/, 'phải có hằng số timeout connect');
  assert.match(src, /WS_SEND_TIMEOUT_MS/, 'phải có hằng số timeout send');
  // connect(): onclose phải reject mọi promise đang chờ (tab đóng giữa chừng).
  const connectBlock = src.slice(src.indexOf('function connect('), src.indexOf('function send('));
  assert.ok(connectBlock.indexOf('ws.onclose') >= 0,
    'connect() phải set onclose — nếu WS đóng, promise connect/pending không bao giờ resolve → treo');
  // send(): timeout reject + clear khỏi pending.
  const sendBlock = src.slice(src.indexOf('function send('), src.indexOf('function setupListener('));
  assert.ok(sendBlock.indexOf('setTimeout') >= 0 && sendBlock.indexOf('pending.delete(id)') >= 0,
    'send() phải có timeout reject và xóa khỏi pending');
});