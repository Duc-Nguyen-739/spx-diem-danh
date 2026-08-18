/**
 * tests/meal-create.test.js — Node thuần (không cần GAS, không cần browser)
 * Test modal tạo task "Điểm danh Ra/Vào" (meal-move) ở CLIENT (index.html):
 *   - canSubmitMealCreate / buildMealCreateInput (logic thuần — BẮT BUỘC Station + ≥1 Team)
 *   - updateMealSubmitState (nút submit chỉ bấm được khi đủ điều kiện)
 *   - openCreateMealModal (mở modal + load options + reset)
 *   - updateMealPreview (idle khi thiếu; gọi previewStaffApi với {station, team} khi đủ)
 *   - createMealMoveTask (chặn khi thiếu; gửi input đúng station/team khi đủ)
 *
 * Cách load: khối hàm meal trong index.html được đánh dấu bằng marker
 * "MEAL-CREATE-START"/"MEAL-CREATE-END". Test trích khối đó, chạy trong vm
 * (cùng realm) với DOM stub + google.script.run stub → test ĐÚNG code deploy.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// ---- Load khối meal-create từ index.html ----
const html = fs.readFileSync(path.join(__dirname, '..', 'js.html'), 'utf8');
const m = html.match(/MEAL-CREATE-START([\s\S]*?)MEAL-CREATE-END/);
assert.ok(m, 'js.html phải chứa khối MEAL-CREATE (đánh dấu MEAL-CREATE-START/END)');
const block = m[1].replace(/^[^\n]*\n/, '').replace(/\n\s*\/\/ MEAL-CREATE-END.*$/, '');
// transferPresentListToMealMove gọi buildTransferMealInput (PURE-LOGIC) — nạp kèm
// khối PURE-LOGIC vào cùng context để test đúng code deploy (không stub).
const pm = html.match(/PURE-LOGIC-START([\s\S]*?)PURE-LOGIC-END/);
assert.ok(pm, 'js.html phải chứa khối PURE-LOGIC (đánh dấu PURE-LOGIC-START/END)');
const pureBlock = pm[1].replace(/^[^\n]*\n/, '').replace(/\n\s*\/\/ ===== PURE-LOGIC-END.*$/, '');

// ---- Stub state chung ----
let lastCall = null;        // lần gọi google.script.run cuối (fn + args)
let openedModal = null;
let toastMsg = null;
let openedScanId = null;
let filterOptions = { ok: true, stations: ['HN2 SOC', 'SG1 HUB'], teams: ['Inbound', 'Outbound'] };

// ---- DOM stub (đủ cho khối meal-create) ----
function makeClassList() {
  const set = new Set();
  return {
    contains: (c) => set.has(c),
    add: (c) => set.add(c),
    remove: (c) => set.delete(c),
    toggle: (c, force) => {
      if (force === undefined) { if (set.has(c)) { set.delete(c); return false; } set.add(c); return true; }
      if (force) set.add(c); else set.delete(c);
      return force;
    },
  };
}
function makeEl(init) {
  const el = Object.assign({
    _classes: new Set(),
    classList: null,
    attrs: {},
    value: '',
    textContent: '',
    disabled: false,
    innerHTML: '',
    children: [],
    chips: [],
    focusCount: 0,
    setAttribute(k, v) { el.attrs[k] = v; },
    getAttribute(k) { return el.attrs[k] ?? null; },
    focus() { el.focusCount++; },
    appendChild(c) { el.children.push(c); if (c && c.dataset && c.dataset.value) el.chips.push(c); return c; },
    querySelectorAll(sel) {
      if (sel === '.chip.selected') return el.chips.filter((c) => c.classList.contains('selected'));
      return [];
    },
  }, init || {});
  el.classList = el.classList || makeClassList();
  return el;
}
function makeChipButton(value) {
  const b = makeEl({ dataset: { value } });
  b._click = null;
  b.addEventListener = (ev, fn) => { if (ev === 'click') b._click = fn; };
  b.click = () => { if (b._click) b._click(); };
  return b;
}

let els = {};
let scanBusyResult = false;
function resetEls() {
  els = {
    createMealModal: makeEl(),
    mealStation: makeEl(),
    mealTeam: makeEl(),
    countMealTeam: makeEl(),
    mealPreview: makeEl(),
    mealPreviewCount: makeEl(),
    mealPreviewHint: makeEl(),
    btnMealSubmit: makeEl(),
    btnCreateTask: makeEl(),
    noteMealInput: makeEl(),
  };
  els.mealTeam.querySelectorAll = function (sel) {
    if (sel === '.chip.selected') return els.mealTeam.chips.filter((c) => c.classList.contains('selected'));
    return [];
  };
  lastCall = null;
  openedModal = null;
  toastMsg = null;
  openedScanId = null;
  global.CURRENT_TASK = null;
  global.CURRENT_LOG = [];
  scanBusyResult = false;
  if (typeof apiResults !== 'undefined') delete apiResults.completeTaskApi;
}
resetEls();

global.document = {
  getElementById: (id) => els[id] || null,
  createElement: (tag) => (tag === 'button' ? makeChipButton('') : makeEl()),
};
global.BUSY = false;
global.getSelectedChips = (id) => (els[id] ? els[id].chips.filter((c) => c.classList.contains('selected')).map((c) => c.dataset.value) : []);
global.fillSelect = (id, values) => { if (els[id]) els[id]._options = values || []; };
global.showToast = (msg) => { toastMsg = msg; };
global.loadTaskList = () => {};
global.loadStaffIndex = () => {};  // refresh staff cache sau khi tạo task (không liên quan input)
global.openScan = (taskId) => { openedScanId = taskId; };
global.markServerFail = () => {};
global.markServerOk = () => {};
// ---- Stub cho transferPresentListToMealMove (Chuyển Danh Sách) ----
global.STATUS_C = { PENDING: '-', PRESENT: 'Có mặt', ABSENT: 'Vắng', EXTRA: 'Dư', OUT: 'Ra ngoài' };
global.TASK_STATUS_C = { OPEN: 'open', DONE: 'done' };
global.CURRENT_TASK = null;
global.CURRENT_LOG = [];
global.scanBusy = () => scanBusyResult;
global.byId = () => null;

// Handler kết quả cho từng API — có thể override trong test (apiResults)
var apiResults = {};

// ---- google.script.run stub: chain đồng bộ + ghi lại lần gọi cuối ----
// LƯU Ý: withSuccessHandler/withFailureHandler phải trả về CHÍNH proxy (không phải
// target) để chain tiếp .getFilterOptions()/.previewStaffApi()/... hoạt động.
function makeRunStub() {
  const target = { _success: null, _failure: null };
  const proxy = new Proxy(target, {
    get(t, fn) {
      if (fn === 'withSuccessHandler') return (h) => { t._success = h; return proxy; };
      if (fn === 'withFailureHandler') return (h) => { t._failure = h; return proxy; };
      return function (...args) {
        lastCall = { fn: String(fn), args };
        const result = fnHandler(fn, ...args);
        if (result && result.__failure) { if (t._failure) t._failure(result.__failure); }
        else if (t._success) t._success(result);
        return proxy;
      };
    },
  });
  return proxy;
}
global.google = {
  script: { run: makeRunStub() },
};
function fnHandler(fn, ...args) {
  if (apiResults[fn] !== undefined) return typeof apiResults[fn] === 'function' ? apiResults[fn](...args) : apiResults[fn];
  if (fn === 'getFilterOptions') return filterOptions;
  if (fn === 'previewStaffApi') return { ok: true, count: 12 };
  if (fn === 'createMealMoveTaskApi') {
    const inp = args[0] || {};
    if (!inp.station || !inp.team || !inp.team.length) return { ok: false, message: 'Vui lòng chọn Station và Team để tạo task' };
    return { ok: true, taskId: 'M-TEST-1', count: 0, message: 'Tạo task Điểm danh Ra/Vào: M-TEST-1' };
  }
  return { ok: true };
}

// ---- Chạy khối trong CÙNG realm (runInThisContext) ----
const api = vm.runInThisContext(
  '(function () {\n' + pureBlock + '\n' + block +
  '\nreturn { openCreateMealModal, closeCreateMealModal, canSubmitMealCreate, buildMealCreateInput, updateMealSubmitState, updateMealPreview, createMealMoveTask, fillMealOptions, fillMealTeamChips, resetMealCreate, transferPresentListToMealMove, buildTransferMealInput };\n})()'
);

// ================= TESTS =================

test('logic thuần: canSubmitMealCreate bắt buộc Station + ≥1 Team', () => {
  assert.equal(api.canSubmitMealCreate('', ['Outbound']), false, 'thiếu Station → false');
  assert.equal(api.canSubmitMealCreate('HN2 SOC', []), false, 'thiếu Team → false');
  assert.equal(api.canSubmitMealCreate('HN2 SOC', null), false);
  assert.equal(api.canSubmitMealCreate('HN2 SOC', ['Outbound']), true);
  assert.equal(api.canSubmitMealCreate('HN2 SOC', ['Inbound', 'Outbound']), true);
});

test('buildMealCreateInput: trả đúng payload {station, team, staffIds, createdBy, note}', () => {
  const inp = api.buildMealCreateInput('HN2 SOC', ['Outbound']);
  assert.equal(inp.station, 'HN2 SOC');
  assert.deepEqual(inp.team, ['Outbound']);
  assert.deepEqual(inp.staffIds, []);
  assert.equal(inp.createdBy, '');
  assert.equal(inp.note, '');
});

test('buildMealCreateInput: giữ và trim ghi chú khi truyền vào', () => {
  const inp = api.buildMealCreateInput('HN2 SOC', ['Outbound'], '  Ca đặc biệt  ');
  assert.equal(inp.note, 'Ca đặc biệt');
});

test('updateMealSubmitState: nút submit disabled khi thiếu Station/Team, enabled khi đủ', () => {
  resetEls();
  api.updateMealSubmitState();
  assert.equal(els.btnMealSubmit.disabled, true, 'chưa chọn gì → disabled');

  els.mealStation.value = 'HN2 SOC';
  api.updateMealSubmitState();
  assert.equal(els.btnMealSubmit.disabled, true, 'chỉ Station → vẫn disabled');

  const chip = makeChipButton('Outbound');
  els.mealTeam.appendChild(chip);
  chip.classList.add('selected');
  api.updateMealSubmitState();
  assert.equal(els.btnMealSubmit.disabled, false, 'Station + ≥1 Team → enabled');
});

test('openCreateMealModal: mở modal, load options, reset submit', () => {
  resetEls();
  api.openCreateMealModal();
  assert.ok(els.createMealModal.classList.contains('open'), 'modal mở');
  assert.equal(els.createMealModal.attrs['aria-hidden'], 'false');
  assert.equal(lastCall && lastCall.fn, 'getFilterOptions', 'load options qua getFilterOptions');
  assert.equal(els.btnMealSubmit.disabled, true, 'submit reset về disabled');
  assert.equal(els.mealPreview.attrs['data-state'], 'idle');
  assert.equal(els.mealPreviewCount.textContent, 'Chọn Station và Team để xem số NV');
});

test('openCreateMealModal với options đã cache: fill station + team chips', () => {
  resetEls();
  global._mealFilterOptions = null;  // đảm bảo nhánh load
  // Mô phỏng cache đã có: gọi fillMealOptions trực tiếp rồi mở lại
  api.fillMealOptions(filterOptions);
  assert.ok(els.mealStation._options.length >= 2, 'station đã fill');
  assert.ok(els.mealTeam.chips.length >= 2, 'team chips đã fill');
});

test('updateMealPreview: chưa đủ → idle + hint liệt kê thiếu', () => {
  resetEls();
  api.updateMealPreview();
  assert.equal(els.mealPreview.attrs['data-state'], 'idle');
  assert.equal(els.mealPreviewCount.textContent, 'Chưa đủ bộ lọc để xem số NV');
  assert.ok(els.mealPreviewHint.textContent.includes('Station'));
  assert.ok(els.mealPreviewHint.textContent.includes('Team'));
  assert.equal(lastCall, null, 'chưa đủ → KHÔNG gọi previewStaffApi');
});

test('updateMealPreview: đủ Station + Team → loading + gọi previewStaffApi với {station, team}', async (t) => {
  resetEls();
  els.mealStation.value = 'HN2 SOC';
  const chip = makeChipButton('Outbound');
  els.mealTeam.appendChild(chip);
  chip.classList.add('selected');
  api.updateMealPreview();
  assert.equal(els.mealPreview.attrs['data-state'], 'loading');
  // preview có debounce 400ms → đợi RPC thật chạy
  await new Promise((r) => setTimeout(r, 460));
  assert.equal(lastCall.fn, 'previewStaffApi');
  assert.deepEqual(lastCall.args[0], { station: 'HN2 SOC', team: ['Outbound'] });
  assert.equal(els.mealPreview.attrs['data-state'], 'ok');
  assert.ok(els.mealPreviewCount.textContent.includes('12'));
});

test('createMealMoveTask: thiếu Station/Team → chặn, toast, KHÔNG gọi API', () => {
  resetEls();
  api.createMealMoveTask();
  assert.equal(toastMsg, 'Vui lòng chọn đủ Station và Team');
  assert.equal(lastCall, null, 'không gọi createMealMoveTaskApi');
});

test('createMealMoveTask: đủ điều kiện → gửi input {station, team, staffIds:[], createdBy:""} + mở scan', () => {
  resetEls();
  els.mealStation.value = 'HN2 SOC';
  els.noteMealInput.value = '  Ca đặc biệt  ';
  const chip = makeChipButton('Outbound');
  els.mealTeam.appendChild(chip);
  chip.classList.add('selected');
  api.createMealMoveTask();
  assert.equal(lastCall.fn, 'createMealMoveTaskApi');
  assert.deepEqual(lastCall.args[0], { station: 'HN2 SOC', team: ['Outbound'], staffIds: [], createdBy: '', note: 'Ca đặc biệt' });
  assert.equal(openedScanId, 'M-TEST-1', 'thành công → openScan task mới');
  assert.ok(!els.createMealModal.classList.contains('open'), 'modal đóng sau khi tạo');
});

test('createMealMoveTask: server từ chối thiếu điều kiện → toast lỗi, không mở scan', () => {
  resetEls();
  apiResults.createMealMoveTaskApi = { ok: false, message: 'Vui lòng chọn Station và Team để tạo task' };
  els.mealStation.value = 'HN2 SOC';
  const chip = makeChipButton('Outbound');
  els.mealTeam.appendChild(chip);
  chip.classList.add('selected');
  api.createMealMoveTask();
  assert.equal(toastMsg, 'Vui lòng chọn Station và Team để tạo task');
  assert.equal(openedScanId, null, 'không mở scan khi server từ chối');
  apiResults.createMealMoveTaskApi = undefined;
});

test('closeCreateMealModal: đóng modal + trả focus về nút +Task', () => {
  resetEls();
  els.createMealModal.classList.add('open');
  const before = els.btnCreateTask.focusCount;
  api.closeCreateMealModal();
  assert.ok(!els.createMealModal.classList.contains('open'));
  assert.equal(els.createMealModal.attrs['aria-hidden'], 'true');
  assert.equal(els.btnCreateTask.focusCount, before + 1);
});

// ===== transferPresentListToMealMove (Chuyển Danh Sách) — 2026-08-18 =====
function setupTransferTask() {
  resetEls();
  global.CURRENT_TASK = { taskId: 'RC-1', taskType: 'reconcile', station: 'HN2 SOC', team: 'Outbound, Inbound', status: 'open' };
  global.CURRENT_LOG = [
    { staffId: 'OPS1', status: 'Có mặt', timeScanEpoch: 1700000000000 },
    { staffId: 'OPS2', status: 'Vắng', timeScanEpoch: 0 },
    { staffId: 'OPS3', status: 'Có mặt', timeScanEpoch: 1700000001000 },
  ];
}

test('transferPresentListToMealMove: tạo task Ra/Vào thành công → tự HOÀN THÀNH task cũ + chuyển sang task mới', () => {
  setupTransferTask();
  apiResults.createMealMoveTaskApi = { ok: true, taskId: 'M-NEW-1', message: 'ok' };
  apiResults.completeTaskApi = { ok: true, message: 'done' };
  api.transferPresentListToMealMove();
  // Chain 2 RPC: tạo task mới → completeTask task cũ (không confirm)
  assert.equal(lastCall.fn, 'completeTaskApi', 'bước cuối chain là completeTaskApi task cũ');
  assert.equal(lastCall.args[0], 'RC-1', 'completeTask chạy trên task Điểm Danh Ca hiện tại');
  assert.equal(openedScanId, 'M-NEW-1', 'tự chuyển sang tab task Ra/Vào vừa tạo');
  assert.ok(!global.BUSY, 'BUSY reset sau khi xong');
});

test('transferPresentListToMealMove: gửi kèm timeRaByStaff — "Giờ điểm danh" → "Giờ Ra"', () => {
  setupTransferTask();
  let capturedInput = null;
  apiResults.createMealMoveTaskApi = (input) => { capturedInput = input; return { ok: true, taskId: 'M-NEW-1', message: 'ok' }; };
  apiResults.completeTaskApi = { ok: true, message: 'done' };
  api.transferPresentListToMealMove();
  assert.ok(capturedInput, 'createMealMoveTaskApi được gọi với input');
  assert.deepEqual(capturedInput.staffIds, ['OPS1', 'OPS3'], 'staffIds = NV Có mặt');
  assert.deepEqual(capturedInput.timeRaByStaff, {
    OPS1: 1700000000000,
    OPS3: 1700000001000,
  }, 'timeRaByStaff = map staffId → "Giờ điểm danh" (epoch) của NV Có mặt');
});

test('transferPresentListToMealMove: create fail → KHÔNG completeTask, không chuyển tab', () => {
  setupTransferTask();
  apiResults.createMealMoveTaskApi = { ok: false, message: 'Lỗi tạo task' };
  api.transferPresentListToMealMove();
  assert.equal(lastCall.fn, 'createMealMoveTaskApi', 'chỉ gọi create (fail)');
  assert.equal(openedScanId, null, 'không chuyển tab khi tạo thất bại');
  assert.equal(toastMsg, 'Lỗi tạo task');
});

test('transferPresentListToMealMove: complete fail → vẫn chuyển sang task mới + toast lỗi', () => {
  setupTransferTask();
  apiResults.createMealMoveTaskApi = { ok: true, taskId: 'M-NEW-1', message: 'ok' };
  apiResults.completeTaskApi = { ok: false, message: 'Đã kết thúc' };
  api.transferPresentListToMealMove();
  assert.equal(lastCall.fn, 'completeTaskApi');
  assert.equal(openedScanId, 'M-NEW-1', 'task mới đã tạo — vẫn chuyển sang nó dù complete lỗi');
  assert.ok(toastMsg.includes('M-NEW-1'), 'toast nhắc đã tạo task mới');
});

test('transferPresentListToMealMove: không phải task reconcile → bỏ qua im lặng', () => {
  resetEls();
  global.CURRENT_TASK = { taskId: 'M-1', taskType: 'meal-move', station: 'HN2 SOC', team: 'Outbound', status: 'open' };
  api.transferPresentListToMealMove();
  assert.equal(lastCall, null, 'không gọi API');
});

test('transferPresentListToMealMove: task đã kết thúc → toast + không gọi API', () => {
  setupTransferTask();
  global.CURRENT_TASK.status = 'done';
  api.transferPresentListToMealMove();
  assert.equal(toastMsg, 'Task đã kết thúc — không chuyển được');
  assert.equal(lastCall, null);
});

test('transferPresentListToMealMove: không có NV Có mặt → toast + không gọi API', () => {
  resetEls();
  global.CURRENT_TASK = { taskId: 'RC-1', taskType: 'reconcile', station: 'HN2 SOC', team: 'Outbound', status: 'open' };
  global.CURRENT_LOG = [{ staffId: 'OPS2', status: 'Vắng' }];
  api.transferPresentListToMealMove();
  assert.equal(toastMsg, 'Chưa có nhân viên nào Có mặt để chuyển');
  assert.equal(lastCall, null);
});

test('transferPresentListToMealMove: scan đang bận → chặn, không gọi API', () => {
  setupTransferTask();
  scanBusyResult = true;
  api.transferPresentListToMealMove();
  assert.equal(toastMsg, 'Đang xử lý lượt quét — chờ xong rồi chuyển');
  assert.equal(lastCall, null);
});
