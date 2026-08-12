/**
 * tests/scan-poll.test.js — Node thuần (không cần GAS, không cần DOM thật).
 * Test ĐỒNG BỘ REAL-TIME 2 THIẾT BỊ (2026-08-12): mobile + PC cùng mở 1 task —
 * thiết bị này quét → thiết bị kia phải cập nhật NGAY (không cần F5). GAS không có
 * push → client poll getTaskDetailApi định kỳ khi ở màn quét. Server cache detail 15s
 * invalidate mọi khi ghi log/đổi status → poll trúng cache (rẻ), đọc lại sheet ngay
 * sau ghi từ thiết bị khác.
 *
 * Các hàm thuần được test (trích từ js.html — file thật deploy):
 *   - scanDetailSignature(data)     — signature so sánh: bằng nhau = không có gì đổi
 *   - scanPollBehind(...)           — poll trả data "cũ hơn" state local? (chống race)
 *   - scanPollTick(taskId)          — 1 chu kỳ poll (bỏ qua khi ẩn tab/modal/đang quét)
 *   - startScanPolling / applyPolledScanDetail (early-return không chạm DOM)
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

// ---- Sandbox: chạy toàn bộ js.html (như js-scanmode.test.js) + fake timers + RPC stub ----
function makeSandbox(opts) {
  opts = opts || {};
  const timers = [];
  const calls = [];
  let timerId = 0;
  const win = { __RC_DEMO__: !!opts.demo, self: {}, top: {} };
  const els = opts.els || {};
  const ctx = {
    console: console,
    Date: Date,
    Math: Math,
    JSON: JSON,
    setTimeout: function (fn) { timers.push({ fn: fn, kind: 'timeout' }); return ++timerId; },
    clearTimeout: function () {},
    setInterval: function (fn, ms) { timers.push({ fn: fn, ms: ms, kind: 'interval' }); return ++timerId; },
    clearInterval: function () {},
    location: { search: '', href: 'https://example.test/app' },
    navigator: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' },
    document: {
      readyState: 'complete',
      visibilityState: 'visible',
      getElementById: function (id) {
        if (els[id]) return els[id];
        // stub phổ quát — đủ cho scanPollTick / early-return path chạy qua
        return {
          id: id,
          classList: { contains: function () { return false; }, add: function () {}, remove: function () {} },
          style: {}, value: '', textContent: '', innerHTML: '', hidden: false, disabled: false,
          addEventListener: function () {}, appendChild: function () {}, focus: function () {},
        };
      },
      querySelector: function () { return null; },
      querySelectorAll: function () { return []; },
      createElement: function () {
        return { style: {}, setAttribute: function () {}, appendChild: function () {}, removeChild: function () {}, click: function () {} };
      },
      body: { classList: { add: function () {}, remove: function () {} } },
      addEventListener: function () {},
      activeElement: opts.activeElement || { id: '' },
    },
    localStorage: { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {} },
    URL: { createObjectURL: function () { return 'blob:x'; }, revokeObjectURL: function () {} },
    Image: function () {},
    google: {
      script: {
        run: (opts.runStub || function () {
          return {
            withSuccessHandler: function (fn) { this._ok = fn; return this; },
            withFailureHandler: function (fn) { this._err = fn; return this; },
            getTaskDetailApi: function (id) { calls.push(id); },
          };
        })(),
      },
    },
  };
  ctx.window = win;
  return { ctx: ctx, timers: timers, calls: calls, win: win };
}

function run(sb) {
  vm.createContext(sb.ctx);
  vm.runInContext(script, sb.ctx);
  return sb;
}

// ---- scanDetailSignature ----
test('scanDetailSignature: dữ liệu giống nhau → signature giống nhau (bỏ qua re-render)', () => {
  const sb = run(makeSandbox());
  const d = {
    task: { taskId: 'R20260812-0900', status: 'open' },
    counters: { scanned: 3, absent: 10, extra: 1 },
    log: [
      { staffId: 'Ops001', status: 'Có mặt', timeScanEpoch: 1000, timeRaEpoch: 0 },
      { staffId: 'Ops002', status: 'Vắng', timeScanEpoch: 0, timeRaEpoch: 0 },
    ],
  };
  const d2 = JSON.parse(JSON.stringify(d));
  assert.equal(sb.ctx.scanDetailSignature(d), sb.ctx.scanDetailSignature(d2));
});

test('scanDetailSignature: 1 NV vừa quét (status + timeScanEpoch đổi) → signature đổi', () => {
  const sb = run(makeSandbox());
  const d = {
    task: { status: 'open' }, counters: { scanned: 1, absent: 10, extra: 0 },
    log: [{ staffId: 'Ops001', status: 'Có mặt', timeScanEpoch: 1000, timeRaEpoch: 0 }],
  };
  const d2 = JSON.parse(JSON.stringify(d));
  d2.log[0].status = 'Có mặt';
  d2.log[0].timeScanEpoch = 5000;
  d2.counters.scanned = 1;
  assert.notEqual(sb.ctx.scanDetailSignature(d), sb.ctx.scanDetailSignature(d2));
});

test('scanDetailSignature: thêm NV Dư (log dài hơn) → signature đổi', () => {
  const sb = run(makeSandbox());
  const d = {
    task: { status: 'open' }, counters: { scanned: 1, absent: 10, extra: 0 },
    log: [{ staffId: 'Ops001', status: 'Có mặt', timeScanEpoch: 1000, timeRaEpoch: 0 }],
  };
  const d2 = JSON.parse(JSON.stringify(d));
  d2.log.push({ staffId: 'Ops999', status: 'Dư', timeScanEpoch: 2000, timeRaEpoch: 0 });
  d2.counters.extra = 1;
  assert.notEqual(sb.ctx.scanDetailSignature(d), sb.ctx.scanDetailSignature(d2));
});

test('scanDetailSignature: counters đổi → signature đổi', () => {
  const sb = run(makeSandbox());
  const d = { task: { status: 'open' }, counters: { scanned: 1, absent: 10, extra: 0 }, log: [] };
  const d2 = JSON.parse(JSON.stringify(d));
  d2.counters.scanned = 2;
  assert.notEqual(sb.ctx.scanDetailSignature(d), sb.ctx.scanDetailSignature(d2));
});

// ---- scanPollBehind ----
test('scanPollBehind: poll cũ hơn local (scanned/extra/out nhỏ hơn) → bỏ qua', () => {
  const sb = run(makeSandbox());
  const cur = { taskId: 'T1', status: 'open' };
  // scanned thấp hơn local
  assert.equal(sb.ctx.scanPollBehind(
    { task: { taskId: 'T1', status: 'open' }, counters: { scanned: 1, extra: 0, out: 0 } },
    cur, { scanned: 2, extra: 0, out: 0 }), true);
  // extra thấp hơn local
  assert.equal(sb.ctx.scanPollBehind(
    { task: { taskId: 'T1', status: 'open' }, counters: { scanned: 2, extra: 1, out: 0 } },
    cur, { scanned: 2, extra: 2, out: 0 }), true);
  // out thấp hơn local (meal-move Ra)
  assert.equal(sb.ctx.scanPollBehind(
    { task: { taskId: 'T1', status: 'open' }, counters: { scanned: 2, extra: 0, out: 0 } },
    cur, { scanned: 2, extra: 0, out: 1 }), true);
});

test('scanPollBehind: local đã DONE nhưng poll vẫn OPEN → response cũ, bỏ qua', () => {
  const sb = run(makeSandbox());
  const cur = { taskId: 'T1', status: 'done' };
  assert.equal(sb.ctx.scanPollBehind(
    { task: { taskId: 'T1', status: 'open' }, counters: { scanned: 2, extra: 0 } },
    cur, { scanned: 2, extra: 0 }), true);
});

test('scanPollBehind: poll bằng hoặc mới hơn local → áp dụng được; task khác → bỏ qua', () => {
  const sb = run(makeSandbox());
  const cur = { taskId: 'T1', status: 'open' };
  // bằng
  assert.equal(sb.ctx.scanPollBehind(
    { task: { taskId: 'T1', status: 'open' }, counters: { scanned: 2, extra: 1, out: 0 } },
    cur, { scanned: 2, extra: 1, out: 0 }), false);
  // poll mới hơn (thiết bị khác quét thêm)
  assert.equal(sb.ctx.scanPollBehind(
    { task: { taskId: 'T1', status: 'open' }, counters: { scanned: 3, extra: 1, out: 0 } },
    cur, { scanned: 2, extra: 1, out: 0 }), false);
  // thiết bị khác kết thúc task → poll DONE, local OPEN → áp dụng (đóng nút quét)
  assert.equal(sb.ctx.scanPollBehind(
    { task: { taskId: 'T1', status: 'done' }, counters: { scanned: 2, extra: 1 } },
    cur, { scanned: 2, extra: 1 }), false);
  // task KHÁC → bỏ qua (response của task cũ)
  assert.equal(sb.ctx.scanPollBehind(
    { task: { taskId: 'T2', status: 'open' }, counters: { scanned: 99, extra: 99 } },
    cur, { scanned: 2, extra: 1 }), true);
});

// ---- scanPollTick: điều kiện gọi RPC ----
test('scanPollTick: đang xử lý queue quét (scanBusy) → không gọi RPC poll', () => {
  const sb = run(makeSandbox());
  sb.ctx.SCAN_QUEUE.push({ staffId: 'Ops001' });
  sb.ctx.scanPollTick('T1');
  assert.equal(sb.calls.length, 0, 'còn queue → không poll');
});

test('scanPollTick: hết queue → gọi getTaskDetailApi(taskId đang xem)', () => {
  const sb = run(makeSandbox());
  sb.ctx.scanPollInFlight = false;
  sb.ctx.scanPollTick('T1');
  assert.equal(sb.calls.length, 1, 'idle → poll 1 lần');
  assert.equal(sb.calls[0], 'T1', 'phải poll đúng taskId đang xem');
});

test('scanPollTick: viewScan ẩn (đã về danh sách) → không gọi RPC', () => {
  const sb = run(makeSandbox({ els: { viewScan: { classList: { contains: function (c) { return c === 'hidden'; } } } } }));
  sb.ctx.scanPollInFlight = false;
  sb.ctx.scanPollTick('T1');
  assert.equal(sb.calls.length, 0, 'không ở màn quét → không poll');
});

test('scanPollTick: RPC trước chưa về (in-flight) → không chồng RPC', () => {
  const sb = run(makeSandbox());
  sb.ctx.scanPollInFlight = true;
  sb.ctx.scanPollTick('T1');
  assert.equal(sb.calls.length, 0, 'đang có RPC poll → không gửi thêm');
});

// ---- startScanPolling / applyPolledScanDetail ----
test('startScanPolling: tạo interval poll + ghi signature hiện tại; demo mode → không poll', () => {
  const sb = run(makeSandbox());
  sb.ctx.CURRENT_TASK = { taskId: 'T1', status: 'open' };
  sb.ctx.CURRENT_LOG = [];
  sb.ctx.CURRENT_COUNTERS = { scanned: 0, absent: 0, extra: 0 };
  sb.ctx.startScanPolling('T1');
  assert.equal(sb.timers.filter(function (t) { return t.kind === 'interval'; }).length, 1, 'phải có 1 interval poll');
  assert.equal(typeof sb.ctx.lastScanPollSig, 'string', 'phải ghi signature hiện tại');

  const sbDemo = run(makeSandbox({ demo: true }));
  sbDemo.ctx.CURRENT_TASK = { taskId: 'T1', status: 'open' };
  sbDemo.ctx.startScanPolling('T1');
  assert.equal(sbDemo.timers.filter(function (t) { return t.kind === 'interval'; }).length, 0, 'demo mode không cần poll');
});

test('applyPolledScanDetail: signature không đổi → không re-render (không chạm DOM)', () => {
  const sb = run(makeSandbox());
  sb.ctx.CURRENT_TASK = { taskId: 'T1', status: 'open', taskType: 'reconcile' };
  sb.ctx.CURRENT_LOG = [];
  sb.ctx.CURRENT_COUNTERS = { scanned: 0, absent: 0, extra: 0 };
  sb.ctx.startScanPolling('T1'); // lastScanPollSig = signature của state hiện tại
  const data = {
    ok: true,
    task: { taskId: 'T1', status: 'open' },
    log: [],
    counters: { scanned: 0, absent: 0, extra: 0 },
  };
  assert.equal(sb.ctx.scanDetailSignature(data), sb.ctx.lastScanPollSig, 'signature phải khớp để test early-return');
  let domTouched = false;
  const orig = sb.ctx.document.getElementById;
  sb.ctx.document.getElementById = function (id) { domTouched = true; return orig.call(this, id); };
  sb.ctx.applyPolledScanDetail(data);
  assert.equal(domTouched, false, 'không có gì đổi → không được chạm DOM');
});

test('applyPolledScanDetail: poll cũ hơn local (behind) → bỏ qua, không re-render', () => {
  const sb = run(makeSandbox());
  sb.ctx.CURRENT_TASK = { taskId: 'T1', status: 'open', taskType: 'reconcile' };
  sb.ctx.CURRENT_COUNTERS = { scanned: 2, absent: 5, extra: 0 };
  let domTouched = false;
  const orig = sb.ctx.document.getElementById;
  sb.ctx.document.getElementById = function (id) { domTouched = true; return orig.call(this, id); };
  sb.ctx.applyPolledScanDetail({
    ok: true,
    task: { taskId: 'T1', status: 'open' },
    log: [],
    counters: { scanned: 1, absent: 5, extra: 0 }, // scanned thấp hơn local
  });
  assert.equal(domTouched, false, 'response cũ hơn → không được chạm DOM');
});
