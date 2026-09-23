/**
 * tests/transfer-auto.test.js — Node thuan (khong can GAS, khong can browser)
 * Tu dong don delta Chuyen Tiep: sau lan an dau tien, moi 20s tu dong chuyen
 * NV "Co mat"/"Du" chua chuyen sang task Ra/Vao (js.html).
 *   - transferPresentListToMealMove(isAuto): che do tu dong chay im lang
 *   - startTransferAutoPoll/stopTransferAutoPoll/transferAutoTick (20s, chi goi
 *     RPC khi con delta chua chuyen)
 * Cach load: giong meal-create.test.js — trich khoi MEAL-CREATE + PURE-LOGIC tu
 * js.html, chay trong vm (cung realm) voi DOM stub + google.script.run stub.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'js.html'), 'utf8');
const m = html.match(/MEAL-CREATE-START([\s\S]*?)MEAL-CREATE-END/);
assert.ok(m, 'js.html phai chua khoi MEAL-CREATE');
const block = m[1].replace(/^[^\n]*\n/, '').replace(/\n\s*\/\/ MEAL-CREATE-END.*$/, '');
const pm = html.match(/PURE-LOGIC-START([\s\S]*?)PURE-LOGIC-END/);
assert.ok(pm, 'js.html phai chua khoi PURE-LOGIC');
const pureBlock = pm[1].replace(/^[^\n]*\n/, '').replace(/\n\s*\/\/ ===== PURE-LOGIC-END.*$/, '');

// ---- Fake timers (capture, khong chay that) ----
let intervalCalls = [];
let clearCalls = [];
const realSetInterval = setInterval;
const realClearInterval = clearInterval;
global.setInterval = (fn, ms) => { intervalCalls.push({ fn, ms }); return 1000 + intervalCalls.length; };
global.clearInterval = (id) => { clearCalls.push(id); };

// ---- State stub ----
let lastCall = null;
let toastMsg = null;
let callCount = 0;
let scanBusyResult = false;
let viewScanHidden = false;
global.document = {
  getElementById: () => null,
  createElement: () => null,
  visibilityState: 'visible',
};
global.BUSY = false;
global.STATUS_C = { PENDING: '-', PRESENT: 'Có mặt', ABSENT: 'Vắng', EXTRA: 'Dư', OUT: 'Ra ngoài' };
global.TASK_STATUS_C = { OPEN: 'open', DONE: 'done' };
global.CURRENT_TASK = null;
global.CURRENT_LOG = [];
global.scanBusy = () => scanBusyResult;
global.byId = (id) => {
  if (id === 'viewScan') {
    return { classList: { contains: (c) => (c === 'hidden' ? viewScanHidden : false) } };
  }
  return null;
};
global.showToast = (msg) => { toastMsg = msg; };
global.loadTaskList = () => {};
global.updateFinishBtnState = () => {};
global.renderTransferBanner = () => {};
global.getSelectedChips = () => [];
global.fillSelect = () => {};
global.markServerFail = () => {};

var apiResults = {};
function makeRunStub() {
  const target = { _success: null, _failure: null };
  const proxy = new Proxy(target, {
    get(t, fn) {
      if (fn === 'withSuccessHandler') return (h) => { t._success = h; return proxy; };
      if (fn === 'withFailureHandler') return (h) => { t._failure = h; return proxy; };
      return function (...args) {
        callCount++;
        lastCall = { fn: String(fn), args };
        const result = typeof apiResults[fn] === 'function' ? apiResults[fn](...args) : apiResults[fn];
        if (result !== undefined && t._success) t._success(result);
        return proxy;
      };
    },
  });
  return proxy;
}
global.google = { script: { run: makeRunStub() } };

const api = vm.runInThisContext(
  '(function () {\n' + pureBlock + '\n' + block +
  '\nreturn { transferPresentListToMealMove, buildTransferMealInput, getTransferTarget, clearTransferTargets, getTransferredIds, startTransferAutoPoll, stopTransferAutoPoll, transferAutoTick, TRANSFER_AUTO_MS };\n})()'
);

function setupTask() {
  api.clearTransferTargets();
  try { api.stopTransferAutoPoll(); } catch (e) {}
  intervalCalls = [];
  clearCalls = [];
  lastCall = null;
  toastMsg = null;
  callCount = 0;
  scanBusyResult = false;
  viewScanHidden = false;
  global.BUSY = false;
  global.CURRENT_TASK = { taskId: 'RC-1', taskType: 'reconcile', station: 'HN2 SOC', team: 'Outbound, Inbound', status: 'open' };
  global.CURRENT_LOG = [
    { staffId: 'OPS1', status: 'Có mặt', timeScanEpoch: 1700000000000 },
    { staffId: 'OPS2', status: 'Vắng', timeScanEpoch: 0 },
    { staffId: 'OPS3', status: 'Có mặt', timeScanEpoch: 1700000001000 },
  ];
  delete apiResults.transferPresentListToMealMoveApi;
}

test('TRANSFER_AUTO_MS = 20000', () => {
  assert.equal(api.TRANSFER_AUTO_MS, 20000);
});

test('manual success starts auto poll (setInterval 20s, 1 lan)', () => {
  setupTask();
  apiResults.transferPresentListToMealMoveApi = { ok: true, taskId: 'M-NEW-1', added: 2, skipped: 0, created: true, count: 2, message: 'ok' };
  api.transferPresentListToMealMove();
  assert.equal(lastCall.fn, 'transferPresentListToMealMoveApi');
  assert.equal(intervalCalls.length, 1, 'start 1 interval sau lan an dau');
  assert.equal(intervalCalls[0].ms, 20000, 'chu ky 20s');
  api.transferPresentListToMealMove();
  assert.equal(intervalCalls.length, 1, 'goi tiep khong tao timer thu 2');
});

test('auto tick chuyen delta moi (OPS4) sau khi quet them', () => {
  setupTask();
  apiResults.transferPresentListToMealMoveApi = { ok: true, taskId: 'M-NEW-1', added: 2, skipped: 0, created: true, count: 2, message: 'ok' };
  api.transferPresentListToMealMove();
  const before = callCount;
  global.CURRENT_LOG.push({ staffId: 'OPS4', status: 'Có mặt', timeScanEpoch: 1700000002000 });
  apiResults.transferPresentListToMealMoveApi = { ok: true, taskId: 'M-NEW-1', added: 1, skipped: 2, created: false, count: 1, message: 'delta ok' };
  api.transferAutoTick();
  assert.equal(callCount, before + 1, 'tick goi 1 RPC delta');
  assert.equal(lastCall.fn, 'transferPresentListToMealMoveApi');
  assert.deepEqual(lastCall.args[0].staffIds, ['OPS1', 'OPS3', 'OPS4'], 'gui full list, server dedupe');
  assert.equal(lastCall.args[1], 'RC-1');
  assert.equal(lastCall.args[2], 'M-NEW-1', 'kem hint target');
});

test('auto tick bo qua RPC khi khong con gi moi', () => {
  setupTask();
  apiResults.transferPresentListToMealMoveApi = { ok: true, taskId: 'M-NEW-1', added: 2, skipped: 0, created: true, count: 2, message: 'ok' };
  api.transferPresentListToMealMove();
  const before = callCount;
  api.transferAutoTick();
  assert.equal(callCount, before, 'khong goi RPC khi delta rong');
});

test('auto im lang khi scan busy / BUSY (khong toast, khong RPC)', () => {
  setupTask();
  apiResults.transferPresentListToMealMoveApi = { ok: true, taskId: 'M-NEW-1', added: 2, skipped: 0, created: true, count: 2, message: 'ok' };
  api.transferPresentListToMealMove();
  global.CURRENT_LOG.push({ staffId: 'OPS9', status: 'Có mặt', timeScanEpoch: 1700000003000 });
  scanBusyResult = true;
  const before = callCount;
  api.transferAutoTick();
  assert.equal(callCount, before, 'scan busy -> bo tick');
  assert.equal(toastMsg, 'ok', 'khong toast them');
  scanBusyResult = false;
  global.BUSY = true;
  api.transferAutoTick();
  assert.equal(callCount, before, 'BUSY -> bo tick');
  global.BUSY = false;
});

test('transferPresentListToMealMove(true) im lang khi rong; manual van toast', () => {
  setupTask();
  global.CURRENT_LOG = [{ staffId: 'OPS2', status: 'Vắng', timeScanEpoch: 0 }];
  api.transferPresentListToMealMove(true);
  assert.equal(lastCall, null, 'auto rong -> khong RPC');
  assert.equal(toastMsg, null, 'auto rong -> khong toast');
  api.transferPresentListToMealMove();
  assert.equal(toastMsg, 'Chưa có nhân viên nào Có mặt/Dư để chuyển', 'manual rong -> toast nhu cu');
  assert.equal(lastCall, null);
});

test('auto success added=0 khong toast; added>0 co toast', () => {
  setupTask();
  apiResults.transferPresentListToMealMoveApi = { ok: true, taskId: 'M-NEW-1', added: 0, skipped: 2, created: false, count: 0, message: 'du roi' };
  global.CURRENT_LOG.push({ staffId: 'OPS5', status: 'Dư', timeScanEpoch: 1700000004000 });
  toastMsg = null;
  api.transferPresentListToMealMove(true);
  assert.equal(toastMsg, null, 'added=0 -> im lang');
  apiResults.transferPresentListToMealMoveApi = { ok: true, taskId: 'M-NEW-1', added: 1, skipped: 2, created: false, count: 1, message: 'them 1' };
  global.CURRENT_LOG.push({ staffId: 'OPS6', status: 'Có mặt', timeScanEpoch: 1700000005000 });
  api.transferPresentListToMealMove(true);
  assert.equal(toastMsg, 'them 1', 'added>0 -> toast bao da chuyen');
});

test('auto tick dung khi roi man quet / task ket thuc / chua co target', () => {
  setupTask();
  viewScanHidden = true;
  api.transferAutoTick();
  assert.equal(lastCall, null, 'khong o man quet -> bo qua');
  viewScanHidden = false;
  api.transferAutoTick();
  assert.equal(lastCall, null, 'chua co target (chua an lan 1) -> bo qua');
  apiResults.transferPresentListToMealMoveApi = { ok: true, taskId: 'M-NEW-1', added: 2, skipped: 0, created: true, count: 2, message: 'ok' };
  api.transferPresentListToMealMove();
  global.CURRENT_TASK.status = 'done';
  const before = callCount;
  api.transferAutoTick();
  assert.equal(callCount, before, 'task done -> bo qua');
});

test('stopTransferAutoPoll xoa timer', () => {
  setupTask();
  api.startTransferAutoPoll();
  assert.equal(intervalCalls.length, 1);
  api.stopTransferAutoPoll();
  assert.deepEqual(clearCalls.length, 1, 'clearInterval duoc goi');
  api.startTransferAutoPoll();
  assert.equal(intervalCalls.length, 2, 'start lai sau stop');
  api.stopTransferAutoPoll();
});

test('teardown: tra timer that, dung timer auto', () => {
  try { api.stopTransferAutoPoll(); } catch (e) {}
  global.setInterval = realSetInterval;
  global.clearInterval = realClearInterval;
});
