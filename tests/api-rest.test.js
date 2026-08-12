'use strict';
// tests/api-rest.test.js — REST API (Api.gs): whitelist dispatch + parse body.
// Mục tiêu: AppSheet/webhook gọi POST /exec chạy ĐÚNG logic GAS hiện có —
// (1) whitelist chặn mọi hàm không duyệt (kể cả _private/editor-only),
// (2) truyền đúng thứ tự args, (3) lỗi hàm → JSON lỗi, không crash.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const Api = require(path.join(ROOT, 'Api.gs'));

// ===== Whitelist =====
test('apiDispatch_: action hợp lệ → gọi đúng hàm với đúng thứ tự args', () => {
  const calls = [];
  const res = Api.apiDispatch_('scanStaffApi', ['R20260802-0730', 'OPS229444', 'vao'], (fn, args) => {
    calls.push({ fn, args });
    return { ok: true };
  });
  assert.equal(res.ok, true);
  assert.deepEqual(calls, [{ fn: 'scanStaffApi', args: ['R20260802-0730', 'OPS229444', 'vao'] }]);
});

test('apiDispatch_: action lạ → {ok:false} + lỗi rõ ràng', () => {
  const res = Api.apiDispatch_('deleteEverything', [], () => ({ ok: true }));
  assert.equal(res.ok, false);
  assert.match(res.error, /Unknown action/);
});

test('apiDispatch_: KHÔNG cho gọi hàm ngoài whitelist (debug/editor/private)', () => {
  // Mọi hàm nguy hiểm phải BỊ CHẶN — nếu sau này thêm action mới phải sửa test này có chủ đích.
  ['debugState', 'syncFromCsv', 'setupSheets', 'include', 'doGet', 'doPost',
    'overwriteStaffData_', 'readStaffList_', 'apiCall_', 'getSpreadsheet_'].forEach((name) => {
    assert.ok(
      !Object.prototype.hasOwnProperty.call(Api.API_ACTIONS, name),
      name + ' KHÔNG được nằm trong whitelist REST'
    );
    const res = Api.apiDispatch_(name, [], () => ({ ok: true }));
    assert.equal(res.ok, false, name + ' phải bị reject');
  });
});

test('apiDispatch_: mọi hàm *Api mà client js.html gọi đều nằm trong whitelist', () => {
  // Chống lệch: UI dùng google.script.run.fn() mà REST không có → AppSheet làm việc
  // được đúng những gì UI làm được.
  const js = fs.readFileSync(path.join(ROOT, 'js.html'), 'utf8');
  const RE = /\.((?:getMeta|getFilterOptions|[A-Za-z][A-Za-z0-9]*Api))\(/g;
  const called = new Set();
  let m;
  while ((m = RE.exec(js)) !== null) called.add(m[1]);
  assert.ok(called.size >= 8, 'phải phát hiện được các hàm server mà UI gọi, thấy: ' + [...called].join(', '));
  for (const name of called) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(Api.API_ACTIONS, name),
      name + ' được UI gọi nhưng KHÔNG có trong whitelist REST'
    );
  }
});

test('apiDispatch_: args non-array → xử lý như []', () => {
  let seen = null;
  const res = Api.apiDispatch_('getTaskListApi', 'not-an-array', (fn, args) => { seen = args; return []; });
  assert.equal(res.ok, true);
  assert.deepEqual(seen, []);
});

test('apiDispatch_: hàm throw → {ok:false, error}, không crash', () => {
  const res = Api.apiDispatch_('getTaskDetailApi', ['X'], () => { throw new Error('boom'); });
  assert.equal(res.ok, false);
  assert.match(res.error, /boom/);
});

test('apiDispatch_: trả nguyên kết quả hàm nghiệp vụ (ok:false + message giữ nguyên)', () => {
  const res = Api.apiDispatch_('scanStaffApi', ['R1', 'OPS1', ''], () => ({
    ok: false,
    message: 'Đã điểm danh',
    status: null,
    counters: { scanned: 1 },
  }));
  assert.equal(res.ok, true, 'dispatch thành công — lỗi nghiệp vụ nằm trong result');
  assert.deepEqual(res.result, { ok: false, message: 'Đã điểm danh', status: null, counters: { scanned: 1 } });
});

// ===== parsePostRequest_ =====
test('parsePostRequest_: JSON body {"action","args"}', () => {
  const e = { postData: { contents: JSON.stringify({ action: 'scanStaffApi', args: ['R1', 'OPS1', 'vao'] }) } };
  assert.deepEqual(Api.parsePostRequest_(e), { action: 'scanStaffApi', args: ['R1', 'OPS1', 'vao'] });
});

test('parsePostRequest_: JSON body thiếu args → args []', () => {
  const e = { postData: { contents: JSON.stringify({ action: 'getTaskListApi' }) } };
  assert.deepEqual(Api.parsePostRequest_(e), { action: 'getTaskListApi', args: [] });
});

test('parsePostRequest_: body JSON hỏng → fallback e.parameter', () => {
  const e = {
    postData: { contents: '{not-json' },
    parameter: { action: 'getTaskListApi' },
  };
  assert.deepEqual(Api.parsePostRequest_(e), { action: 'getTaskListApi', args: [] });
});

test('parsePostRequest_: form-encoded args=<JSON string>', () => {
  const e = { parameter: { action: 'searchStaffApi', args: JSON.stringify(['OPS229444']) } };
  assert.deepEqual(Api.parsePostRequest_(e), { action: 'searchStaffApi', args: ['OPS229444'] });
});

test('parsePostRequest_: form-encoded arg0/arg1/…', () => {
  const e = { parameter: { action: 'scanStaffApi', arg0: 'R1', arg1: 'OPS1' } };
  assert.deepEqual(Api.parsePostRequest_(e), { action: 'scanStaffApi', args: ['R1', 'OPS1'] });
});

test('parsePostRequest_: e rỗng/undefined → mặc định {action:"", args:[]}', () => {
  assert.deepEqual(Api.parsePostRequest_(undefined), { action: '', args: [] });
  assert.deepEqual(Api.parsePostRequest_({}), { action: '', args: [] });
});
