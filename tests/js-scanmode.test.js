/**
 * tests/js-scanmode.test.js — Node thuần (không cần GAS, không cần DOM thật).
 * Test mock loader của js.html KHÔNG được XÓA TRẮNG trang (bug 2026-08-11 + 2026-08-12):
 *
 * Tab quét (?scan=1) mở thẳng URL content GAS → wrapper GAS nạp app vào iframe qua
 * document.write (URL app = /blank, location.search RỖNG, google.script có thể chưa
 * inject kịp). js.html cũ nếu thấy !google.script && !scan=1 trong location → gọi
 * document.write → document đã load xong → XÓA TRẮNG toàn trang (tab trắng).
 *
 * Fix: (1) skip mock khi window.__RC_SCAN_MODE__ (camera-scan.html đặt trước js.html);
 * (2) document.write CHỈ khi document.readyState === 'loading' (an toàn), còn lại dùng
 * DOM injection (appendChild) — không bao giờ xoá trang.
 *
 * Cách load: trích <script> đầu tiên trong js.html (file thật deploy), chạy trong vm
 * sandbox có DOM mock — test ĐÚNG code được deploy (không bản sao).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const file = fs.readFileSync(path.join(__dirname, '..', 'js.html'), 'utf8');
const m = file.match(/^<script>([\s\S]*?)<\/script>$/);
assert.ok(m, 'js.html phải bọc đúng 1 khối <script>');
const script = m[1];

function makeSandbox(opts) {
  opts = opts || {};
  const writes = [];
  const appends = [];
  const win = { __RC_SCAN_MODE__: !!opts.scanMode };
  const ctx = {
    console: console,
    Date: Date,
    Math: Math,
    JSON: JSON,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    setInterval: setInterval,
    clearInterval: clearInterval,
    location: opts.location || { search: '', href: 'https://example.test/app' },
    document: {
      readyState: opts.readyState || 'complete',
      write: function (s) { writes.push(s); },
      createElement: function () { return { setAttribute: function () {} }; },
      head: { appendChild: function (el) { appends.push(el); } },
      body: {},
      addEventListener: function () {},
    },
  };
  win.self = win;
  win.top = win;
  ctx.window = win;
  return { ctx: ctx, writes: writes, appends: appends };
}

function run(sb) {
  vm.createContext(sb.ctx);
  vm.runInContext(script, sb.ctx);
  return sb;
}

test('scan mode (cờ __RC_SCAN_MODE__): không nạp mock, không document.write — không bao giờ trắng', () => {
  const sb = run(makeSandbox({ scanMode: true, readyState: 'complete', location: { search: '', href: 'https://example.test/userCodeAppPanel' } }));
  assert.equal(sb.writes.length, 0, 'scan mode không được document.write');
  assert.equal(sb.appends.length, 0, 'scan mode không được nạp mock');
});

test('không có google.script + document đã load xong → dùng DOM injection, KHÔNG document.write (không xoá trang)', () => {
  const sb = run(makeSandbox({ scanMode: false, readyState: 'complete', location: { search: '', href: 'https://example.test/app' } }));
  assert.equal(sb.writes.length, 0, 'readyState=complete tuyệt đối không document.write (sẽ xoá trang)');
  assert.equal(sb.appends.length, 1, 'phải nạp mock bằng appendChild');
  assert.ok(/mock\/mock-google\.js/.test(sb.appends[0].src), 'appendChild phải trỏ mock/mock-google.js, got: ' + sb.appends[0].src);
});

test('không có google.script + document còn parse (readyState=loading) → document.write an toàn (chèn khi parse)', () => {
  const sb = run(makeSandbox({ scanMode: false, readyState: 'loading', location: { search: '', href: 'https://example.test/app' } }));
  assert.equal(sb.appends.length, 0);
  assert.equal(sb.writes.length, 1, 'lúc parse vẫn document.write cho sync load (an toàn — chỉ thêm nội dung)');
  assert.ok(/mock\/mock-google\.js/.test(sb.writes[0]), 'write phải trỏ mock/mock-google.js');
});

test('có google.script (chạy thật trên GAS) → không nạp mock, không document.write', () => {
  const sb = makeSandbox({ scanMode: false, readyState: 'complete' });
  sb.ctx.google = { script: {} };
  vm.createContext(sb.ctx);
  vm.runInContext(script, sb.ctx);
  assert.equal(sb.writes.length, 0);
  assert.equal(sb.appends.length, 0);
});
