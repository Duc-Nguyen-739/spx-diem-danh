'use strict';
// tests/jsonp-api.test.js — JSONP API (JsonpApi.gs) cho trang standalone ?app=1.
// Trang top-level không có google.script.run → shim js.html gọi GET /exec?action=..&cb=..
// về đây. Test: (1) whitelist chặn mọi hàm không duyệt, (2) truyền đúng thứ tự args,
// (3) lỗi hàm → JSON lỗi không crash, (4) cb sanitize chống XSS phản chiếu.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const Api = require(path.join(ROOT, 'JsonpApi.gs'));

// ===== apiDispatchJsonp_ =====
test('apiDispatchJsonp_: action hợp lệ → gọi đúng hàm với đúng thứ tự args', () => {
  const calls = [];
  const res = Api.apiDispatchJsonp_('scanStaffApi', ['R20260802-0730', 'OPS229444', 'vao'], (fn, args) => {
    calls.push({ fn, args });
    return { ok: true };
  });
  assert.equal(res.ok, true);
  assert.deepEqual(calls, [{ fn: 'scanStaffApi', args: ['R20260802-0730', 'OPS229444', 'vao'] }]);
});

test('apiDispatchJsonp_: action lạ → {ok:false} + lỗi rõ ràng', () => {
  const res = Api.apiDispatchJsonp_('deleteEverything', [], () => ({ ok: true }));
  assert.equal(res.ok, false);
  assert.match(res.error, /Unknown action/);
});

test('apiDispatchJsonp_: KHÔNG cho gọi hàm ngoài whitelist (debug/editor/private)', () => {
  ['debugState', 'syncFromCsv', 'setupSheets', 'include', 'doGet', 'doPost',
    'overwriteStaffData_', 'readStaffList_', 'jsonpApiCall_', 'getSpreadsheet_'].forEach((name) => {
    assert.ok(
      !Object.prototype.hasOwnProperty.call(Api.API_ACTIONS_, name),
      name + ' KHÔNG được nằm trong whitelist JSONP'
    );
    const res = Api.apiDispatchJsonp_(name, [], () => ({ ok: true }));
    assert.equal(res.ok, false, name + ' phải bị reject');
  });
});

test('apiDispatchJsonp_: mọi hàm *Api mà client js.html gọi đều nằm trong whitelist', () => {
  const js = fs.readFileSync(path.join(ROOT, 'js.html'), 'utf8');
  const RE = /\.((?:getMeta|getFilterOptions|[A-Za-z][A-Za-z0-9]*Api))\(/g;
  const called = new Set();
  let m;
  while ((m = RE.exec(js)) !== null) called.add(m[1]);
  assert.ok(called.size >= 8, 'phải phát hiện được các hàm server mà UI gọi, thấy: ' + [...called].join(', '));
  for (const name of called) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(Api.API_ACTIONS_, name),
      name + ' được UI gọi nhưng KHÔNG có trong whitelist JSONP'
    );
  }
});

test('apiDispatchJsonp_: args non-array → xử lý như []', () => {
  let seen = null;
  const res = Api.apiDispatchJsonp_('getTaskListApi', 'not-an-array', (fn, args) => { seen = args; return []; });
  assert.equal(res.ok, true);
  assert.deepEqual(seen, []);
});

test('apiDispatchJsonp_: hàm throw → {ok:false, error}, không crash', () => {
  const res = Api.apiDispatchJsonp_('getTaskDetailApi', ['X'], () => { throw new Error('boom'); });
  assert.equal(res.ok, false);
  assert.match(res.error, /boom/);
});

test('apiDispatchJsonp_: trả nguyên kết quả hàm nghiệp vụ (ok:false + message giữ nguyên)', () => {
  const res = Api.apiDispatchJsonp_('scanStaffApi', ['R1', 'OPS1', ''], () => ({
    ok: false,
    message: 'Đã điểm danh',
    status: null,
    counters: { scanned: 1 },
  }));
  assert.equal(res.ok, true, 'dispatch thành công — lỗi nghiệp vụ nằm trong result');
  assert.deepEqual(res.result, { ok: false, message: 'Đã điểm danh', status: null, counters: { scanned: 1 } });
});

// ===== sanitizeCallback_ =====
test('sanitizeCallback_: tên cb hợp lệ giữ nguyên', () => {
  ['__rcJsonp1_1786455000000', 'myCb', 'a.b$c_1', 'callback'].forEach((cb) => {
    assert.equal(Api.sanitizeCallback_(cb), cb);
  });
});

test('sanitizeCallback_: tên nguy hiểm/trống → fallback "callback" (chống XSS phản chiếu)', () => {
  ['alert(1)', 'a;alert(1)//', 'x</script><script>alert(1)', 'a b', '()=>{}', '', null, undefined].forEach((cb) => {
    assert.equal(Api.sanitizeCallback_(cb), 'callback', 'phải fallback với: ' + String(cb));
  });
});
