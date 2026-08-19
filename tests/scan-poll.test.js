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

// ===== TASK LIST POLL — đồng bộ danh sách task nhiều người truy cập (2026-08-16) =====
// Người này tạo/kết thúc/mở lại task → người khác đang ở màn danh sách phải thấy NGAY
// (không cần bấm "⟳ Làm mới"). Poll getTaskListApi mỗi 3s khi viewList hiện; chỉ
// re-render khi signature đổi (tránh reset sort/filter/phân trang vô ích).

function listStub(tasks) {
  return {
    withSuccessHandler: function (fn) { this._ok = fn; return this; },
    withFailureHandler: function (fn) { this._err = fn; return this; },
    getTaskListApi: function () { if (this._ok) this._ok(tasks); },
  };
}

function taskA(status) {
  return { taskId: 'R1', status: status || 'open', total: 5, scanned: 2, extra: 0, createdAtText: '12:00', completedAtText: '', note: '' };
}

// ---- taskListSignature ----
test('taskListSignature: danh sách giống nhau → signature giống nhau (bỏ qua re-render)', () => {
  const sb = run(makeSandbox());
  const a = [taskA('open'), { taskId: 'R2', status: 'done', total: 3, scanned: 3, extra: 1, createdAtText: '11:00', completedAtText: '13:00', note: 'x' }];
  const b = JSON.parse(JSON.stringify(a));
  assert.equal(sb.ctx.taskListSignature(a), sb.ctx.taskListSignature(b));
});

test('taskListSignature: status/counter/note đổi → signature đổi (phải re-render)', () => {
  const sb = run(makeSandbox());
  const a = [taskA('open')];
  const b1 = [taskA('done')];                 // người khác kết thúc task
  const b2 = [taskA('open')]; b2[0].scanned = 3; // người khác quét thêm
  const b3 = [taskA('open')]; b3[0].note = 'ghi chú'; // đổi ghi chú
  const b4 = [taskA('open'), taskA('open')];  // thêm task mới
  assert.notEqual(sb.ctx.taskListSignature(a), sb.ctx.taskListSignature(b1));
  assert.notEqual(sb.ctx.taskListSignature(a), sb.ctx.taskListSignature(b2));
  assert.notEqual(sb.ctx.taskListSignature(a), sb.ctx.taskListSignature(b3));
  assert.notEqual(sb.ctx.taskListSignature(a), sb.ctx.taskListSignature(b4));
});

// ---- taskListPollTick: điều kiện gọi RPC ----
test('taskListPollTick: viewList ẩn (đang ở màn quét) → không gọi RPC', () => {
  const sb = run(makeSandbox({ els: { viewList: { classList: { contains: function (c) { return c === 'hidden'; } } } } }));
  let rpc = 0;
  sb.ctx.google.script.run = { withSuccessHandler: function () { return this; }, withFailureHandler: function () { return this; }, getTaskListApi: function () { rpc++; } };
  sb.ctx.taskListPollTick();
  assert.equal(rpc, 0, 'không ở màn danh sách → không poll');
});

test('taskListPollTick: đang lọc theo mã NV (header search) → không đè bộ lọc, không poll', () => {
  const sb = run(makeSandbox());
  sb.ctx._taskFilterStaff = 'Ops129481';
  let rpc = 0;
  sb.ctx.google.script.run = { withSuccessHandler: function () { return this; }, withFailureHandler: function () { return this; }, getTaskListApi: function () { rpc++; } };
  sb.ctx.taskListPollTick();
  assert.equal(rpc, 0, 'đang lọc mã Ops → poll không được đè bộ lọc');
});

test('taskListPollTick: đang "Làm mới" tay (_refreshLock) / RPC trước chưa về → không chồng', () => {
  const sb = run(makeSandbox());
  let rpc = 0;
  sb.ctx.google.script.run = { withSuccessHandler: function () { return this; }, withFailureHandler: function () { return this; }, getTaskListApi: function () { rpc++; } };
  sb.ctx._refreshLock = true;
  sb.ctx.taskListPollTick();
  assert.equal(rpc, 0, '_refreshLock → không poll (RPC Làm mới tay đang lo)');
  sb.ctx._refreshLock = false;
  sb.ctx.taskListPollInFlight = true;
  sb.ctx.taskListPollTick();
  assert.equal(rpc, 0, 'in-flight → không chồng RPC');
});

test('taskListPollTick: dữ liệu không đổi → KHÔNG re-render (giữ sort/filter/phân trang)', () => {
  const sb = run(makeSandbox({ runStub: function () { return listStub([taskA('open')]); } }));
  sb.ctx._taskFilterStaff = null;
  sb.ctx.lastTaskListSig = sb.ctx.taskListSignature([taskA('open')]);
  let dashCalls = 0;
  sb.ctx.renderDash = function () { dashCalls++; };
  sb.ctx.taskListPollTick();
  assert.equal(dashCalls, 0, 'signature giống nhau → không được render lại');
});

test('taskListPollTick: người khác kết thúc task (signature đổi) → renderDash cập nhật', () => {
  const sb = run(makeSandbox({ runStub: function () { return listStub([taskA('done')]); } }));
  sb.ctx._taskFilterStaff = null;
  sb.ctx.lastTaskListSig = sb.ctx.taskListSignature([taskA('open')]);
  let dashCalls = 0;
  sb.ctx.renderDash = function () { dashCalls++; };
  sb.ctx.taskListPollTick();
  assert.equal(dashCalls, 1, 'có thay đổi từ thiết bị khác → phải render lại');
});

test('startTaskListPolling: ghi signature hiện tại + interval; demo mode → không poll', () => {
  const sb = run(makeSandbox());
  sb.ctx._taskPageList = [taskA('open')];
  sb.ctx.startTaskListPolling();
  assert.equal(sb.timers.filter(function (t) { return t.kind === 'interval'; }).length, 1, 'phải có 1 interval poll danh sách');
  assert.equal(sb.ctx.lastTaskListSig, sb.ctx.taskListSignature([taskA('open')]), 'signature phải khớp list đang hiển thị');

  const sbDemo = run(makeSandbox({ demo: true }));
  sbDemo.ctx._taskPageList = [taskA('open')];
  sbDemo.ctx.startTaskListPolling();
  assert.equal(sbDemo.timers.filter(function (t) { return t.kind === 'interval'; }).length, 0, 'demo mode không cần poll');
});

// ===== Bug 6 (2026-08-18): anyModalOpen không nhận camera → auto-focus loop giật focus =====
test('anyModalOpen: camera đang mở (popup/__RC_CAM_OPEN__) → coi là có modal', () => {
  const sb = run(makeSandbox());
  assert.equal(sb.ctx.anyModalOpen(), false, 'không mở gì → không có modal');
  sb.win.__RC_CAM_OPEN__ = true;
  assert.equal(sb.ctx.anyModalOpen(), true, 'camera mở (popup) → phải trả true (trước trả false → loop focus phá camera)');
});

test('anyModalOpen: camera modal live (display flex) → coi là có modal', () => {
  const sb = run(makeSandbox({ els: { cameraModal: { style: { display: 'flex' } } } }));
  assert.equal(sb.ctx.anyModalOpen(), true, 'camera modal live đang hiện → phải trả true');
});

// ===== Bug 1 (2026-08-18): anyModalOpen bỏ sót create/confirm/createMealModal =====
test('anyModalOpen: create/confirm/createMealModal mở (class open) → coi là có modal', () => {
  const sb = run(makeSandbox());
  ['createModal', 'confirmModal', 'createMealModal'].forEach(function (id) {
    // anyModalOpen dùng document.querySelector — mock trả về modal khi selector có id này.
    sb.ctx.document.querySelector = function (sel) {
      return sel.indexOf('#' + id + '.open') >= 0 ? { id: id } : null;
    };
    assert.equal(sb.ctx.anyModalOpen(), true, id + ' đang mở → phải trả true (auto-focus loop không giật focus)');
  });
});

test('auto-focus loop: camera mở → KHÔNG input.focus() (không bật bàn phím che camera)', () => {
  const sb = run(makeSandbox());
  let focusCalls = 0;
  const scanView = sb.ctx.byId('viewScan');
  const input = sb.ctx.byId('scanInput');
  input.disabled = false;
  input.focus = function () { focusCalls++; };
  scanView.classList.contains = function () { return false; }; // viewScan đang hiện
  sb.ctx.startAutoFocusLoop();
  sb.win.__RC_CAM_OPEN__ = true;
  const interval = sb.timers.filter(function (t) { return t.kind === 'interval'; }).find(function (t) { return t.ms === 30000; });
  assert.ok(interval, 'phải có auto-focus interval 30s (yêu cầu 2026-08-18 — trước 3s giật focus quá thường xuyên)');
  interval.fn();
  assert.equal(focusCalls, 0, 'camera mở → loop không được gọi input.focus()');
});

// ===== Bug 7 (2026-08-18): renderDash reset hết filter dashboard mỗi chu kỳ poll =====
function dashSandbox(initial) {
  // Mock DOM bộ lọc dashboard: checkbox theo name + radio dashSt + ô dựng động (dyn*)
  const els = initial.els || {};
  const boxes = {};   // các checkbox/radio hiện hữu: { name + '|' + value: {checked} }
  function ensureInput(name, value, checked) {
    const key = name + '|' + value;
    if (!boxes[key]) boxes[key] = { name: name, value: value, checked: checked };
    boxes[key].checked = checked;
  }
  ['dashType', 'dashStn', 'dashCa', 'dashTeam'].forEach(function (n) {
    (initial[n] || []).forEach(function (v) { ensureInput(n, v, true); });
  });
  ensureInput('dashSt', 'all', true);
  const stubEl = {
    style: {}, classList: { contains: function () { return false; }, add: function () {}, remove: function () {} },
    addEventListener: function () {}, appendChild: function () {}, focus: function () {},
    querySelectorAll: function () { return []; },
  };
  const doc = {
    readyState: 'complete', visibilityState: 'visible',
    getElementById: function (id) { return els[id] || stubEl; },
    querySelector: function (sel) {
      const m = sel.match(/input\[name="(dashSt)"\]\[value="([^"]+)"\]/);
      if (m) return boxes[m[1] + '|' + m[2]] || null;
      const all = sel.match(/input\[name="([^"]+)"\]:checked/);
      if (all) {
        const list = Object.keys(boxes).filter(function (k) { return boxes[k].name === all[1] && boxes[k].checked; });
        if (list.length) return boxes[list[0]];
      }
      return null;
    },
    querySelectorAll: function (sel) {
      const all = sel.match(/input\[name="([^"]+)"\]:checked/);
      if (all) return Object.keys(boxes).filter(function (k) { return boxes[k].name === all[1] && boxes[k].checked; }).map(function (k) { return boxes[k]; });
      const box = sel.match(/input\[name="([^"]+)"\]/);
      if (box) return Object.keys(boxes).filter(function (k) { return boxes[k].name === box[1]; }).map(function (k) { return boxes[k]; });
      return [];
    },
    createElement: function () { return { style: {}, setAttribute: function () {}, appendChild: function () {}, removeChild: function () {}, click: function () {} }; },
    body: { classList: { add: function () {}, remove: function () {} } },
    addEventListener: function () {},
    activeElement: { id: '' },
  };
  const win = { self: {}, top: {} };
  const ctx = {
    console: console, Date: Date, Math: Math, JSON: JSON,
    setTimeout: function (fn) { return 0; }, clearTimeout: function () {},
    setInterval: function () { return 1; }, clearInterval: function () {},
    location: { search: '', href: 'https://example.test/app' },
    navigator: { userAgent: 'Mozilla/5.0' },
    document: doc,
    localStorage: { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {} },
    URL: { createObjectURL: function () { return 'blob:x'; }, revokeObjectURL: function () {} },
    Image: function () {},
    google: { script: { run: { withSuccessHandler: function (f) { return this; }, withFailureHandler: function (f) { return this; } } } },
  };
  ctx.window = win;
  vm.createContext(ctx);
  vm.runInContext(script, ctx);
  ctx.__boxes = boxes;
  return ctx;
}

test('renderDash: user đang lọc (ca khác all) → poll KHÔNG reset radio lọc', () => {
  const tasks = [
    { taskId: 'A', status: 'open', taskType: 'reconcile', station: 'Kho A', slotCode: 'Ca1', team: 'T1' },
    { taskId: 'B', status: 'done', taskType: 'meal-move', station: 'Kho B', slotCode: 'Ca2', team: 'T2' },
  ];
  const ctx = dashSandbox({ els: { dynType: { querySelectorAll: function () { return []; } }, dynStn: { querySelectorAll: function () { return []; } }, dynCa: { querySelectorAll: function () { return []; } }, dynTeam: { querySelectorAll: function () { return []; } }, dKpiTotal: {}, dKpiOpen: {}, dKpiDone: {}, dKpiScan: {}, dSt_open: {}, dSt_done: {}, dFilterBadge: {} }, dashStn: ['Kho A', 'Kho B'], dashType: ['reconcile', 'meal-move'], dashCa: ['Ca1', 'Ca2'], dashTeam: ['T1', 'T2'] });
  // User chọn lọc: radio "done" + bỏ chọn loại reconcile → chỉ còn meal-move
  const stDone = ctx.__boxes['dashSt|done'] = { name: 'dashSt', value: 'done', checked: true };
  ctx.__boxes['dashSt|all'] = { name: 'dashSt', value: 'all', checked: false };
  const rec = ctx.__boxes['dashType|reconcile'] = { name: 'dashType', value: 'reconcile', checked: false };
  ctx.__boxes['dashType|meal-move'].checked = true;
  ctx.renderDash(tasks);
  assert.equal(ctx.__boxes['dashSt|done'].checked, true, 'radio "done" phải được giữ sau renderDash (trước ép về all)');
  assert.equal(ctx.__boxes['dashSt|all'].checked, false, 'radio all không được tự bật');
  assert.equal(ctx.__boxes['dashType|reconcile'].checked, false, 'loại reconcile đã bỏ chọn phải giữ nguyên');
  assert.equal(ctx.__boxes['dashType|meal-move'].checked, true, 'loại meal-move đã chọn phải giữ nguyên');
});

test('renderDash: user bỏ chọn 1 station → renderDash KHÔNG check lại station đó', () => {
  const tasks = [
    { taskId: 'A', status: 'open', taskType: 'reconcile', station: 'Kho A', slotCode: 'Ca1', team: 'T1' },
    { taskId: 'B', status: 'open', taskType: 'reconcile', station: 'Kho B', slotCode: 'Ca2', team: 'T2' },
  ];
  const ctx = dashSandbox({ els: { dynType: { querySelectorAll: function () { return []; } }, dynStn: { querySelectorAll: function () { return []; } }, dynCa: { querySelectorAll: function () { return []; } }, dynTeam: { querySelectorAll: function () { return []; } }, dKpiTotal: {}, dKpiOpen: {}, dKpiDone: {}, dKpiScan: {}, dSt_open: {}, dSt_done: {}, dFilterBadge: {} }, dashStn: ['Kho A', 'Kho B'], dashType: ['reconcile'], dashCa: ['Ca1', 'Ca2'], dashTeam: ['T1', 'T2'] });
  ctx.__boxes['dashSt|all'] = { name: 'dashSt', value: 'all', checked: true };
  ctx.__boxes['dashStn|Kho B'] = { name: 'dashStn', value: 'Kho B', checked: false }; // user lọc chỉ Kho A
  ctx.__boxes['dashStn|Kho A'] = { name: 'dashStn', value: 'Kho A', checked: true };
  ctx.renderDash(tasks);
  assert.equal(ctx.__boxes['dashStn|Kho B'].checked, false, 'station đã bỏ chọn phải giữ nguyên (trước check lại hết → filter bị reset)');
  assert.equal(ctx.__boxes['dashStn|Kho A'].checked, true, 'station đang chọn phải giữ');
});

// ===== B2 (2026-08-19): poll KHÔNG reset phân trang khi filter không đổi =====
test('applyDashFilters: poll cùng filter GIỮ trang; đổi filter reset về 1 (B2)', () => {
  const many = [];
  for (let i = 1; i <= 31; i++) { // 31 task → 2 trang (TASK_PAGE_SIZE=30)
    many.push({ taskId: 'T' + i, status: 'open', taskType: 'reconcile', station: 'Kho A', slotCode: 'Ca1', team: 'T1' });
  }
  const ctx = dashSandbox({ els: { dynType: { querySelectorAll: function () { return []; } }, dynStn: { querySelectorAll: function () { return []; } }, dynCa: { querySelectorAll: function () { return []; } }, dynTeam: { querySelectorAll: function () { return []; } }, dKpiTotal: {}, dKpiOpen: {}, dKpiDone: {}, dKpiScan: {}, dSt_open: {}, dSt_done: {}, dFilterBadge: {} }, dashStn: ['Kho A'], dashType: ['reconcile'], dashCa: ['Ca1'], dashTeam: ['T1'] });
  ctx.renderDash(many);
  ctx.goTaskPage(2);
  assert.equal(ctx._taskPage, 2, 'user phải sang được trang 2');
  // Poll lặp lại với CÙNG filter (dữ liệu giống — nhưng renderDash chạy lại)
  ctx.renderDash(many);
  assert.equal(ctx._taskPage, 2, 'poll cùng filter phải GIỮ trang (trước reset về 1)');
  // User đổi filter → phải reset về trang 1
  ctx.__boxes['dashSt|all'].checked = false;
  ctx.__boxes['dashSt|done'] = { name: 'dashSt', value: 'done', checked: true };
  ctx.applyDashFilters();
  assert.equal(ctx._taskPage, 1, 'đổi filter phải reset về trang 1');
});
