/**
 * tests/scan-logic.test.js — Node thuần (không cần GAS, không cần DOM)
 * Test logic tách mã dán/quét ở CLIENT (index.html): splitScanCodes,
 * isValidBarcodeId, planScanSubmit.
 *
 * Cách load: khối PURE-LOGIC trong index.html được đánh dấu bằng marker
 * "PURE-LOGIC-START"/"PURE-LOGIC-END". Test này trích khối đó và chạy trong
 * vm sandbox → test ĐÚNG code được deploy, không có bản sao lệch nhau
 * (nhất quán với cách repo test trực tiếp ScanLogic.gs).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// ---- Load logic từ index.html ----
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const m = html.match(/PURE-LOGIC-START([\s\S]*?)PURE-LOGIC-END/);
assert.ok(m, 'index.html phải chứa khối PURE-LOGIC (đánh dấu PURE-LOGIC-START/END)');
// Bỏ phần còn lại của dòng START (" =====") và dòng END → chỉ giữ code thuần.
const block = m[1].replace(/^[^\n]*\n/, '').replace(/\n\s*\/\/ ===== PURE-LOGIC-END.*$/, '');

// Chạy trong CÙNG realm (runInThisContext) để array/prototype khớp với assert/strict
// (vm.createContext tạo realm riêng → deepStrictEqual fail dù nội dung bằng nhau).
// Wrapper function → không ô nhiễm global.
const { splitScanCodes, isValidBarcodeId, planScanSubmit } = vm.runInThisContext(
  '(function () {\n' + block + '\nreturn { splitScanCodes, isValidBarcodeId, planScanSubmit };\n})()'
);

test('khối PURE-LOGIC không phụ thuộc DOM/server (giữ thuần để test được)', () => {
  assert.ok(!/document\.|google\.|window\./i.test(block), 'khối không được gọi DOM/server API');
});

// ===== splitScanCodes =====
test('splitScanCodes: tách theo khoảng trắng đơn', () => {
  assert.deepEqual(splitScanCodes('OPS1 OPS2 OPS3'), ['OPS1', 'OPS2', 'OPS3']);
});

test('splitScanCodes: tách theo tab / xuống dòng (paste nhiều dòng từ Excel)', () => {
  assert.deepEqual(splitScanCodes('OPS1\tOPS2\nOPS3\r\nOPS4'), ['OPS1', 'OPS2', 'OPS3', 'OPS4']);
});

test('splitScanCodes: tách theo phẩy / chấm phẩy', () => {
  assert.deepEqual(splitScanCodes('OPS1, OPS2;OPS3'), ['OPS1', 'OPS2', 'OPS3']);
});

test('splitScanCodes: trim 2 đầu + bỏ ô trống giữa các dấu phân tách', () => {
  assert.deepEqual(splitScanCodes('  OPS1   ,   OPS2\t\t'), ['OPS1', 'OPS2']);
});

test('splitScanCodes: chuỗi rỗng / toàn dấu phân tách → []', () => {
  assert.deepEqual(splitScanCodes(''), []);
  assert.deepEqual(splitScanCodes('   , ; \t \n'), []);
});

// ===== isValidBarcodeId =====
test('isValidBarcodeId: chấp nhận mọi case của tiền tố Ops', () => {
  for (const c of ['OPS123', 'ops123', 'Ops123', 'oPs123', 'OPS000001', 'ops']) {
    assert.equal(isValidBarcodeId(c), true, c);
  }
});

test('isValidBarcodeId: từ chối mã không bắt đầu bằng Ops', () => {
  for (const c of ['EMP123', '123OPS', 'xops1', 'OP1', 'os1', '', ' OPS1']) {
    assert.equal(isValidBarcodeId(c), false, c);
  }
});

// ===== planScanSubmit: quyết định đường xử lý 1 lần submit =====
test('planScanSubmit: chuỗi rỗng / toàn dấu phân tách → mode empty', () => {
  assert.equal(planScanSubmit('', false).mode, 'empty');
  assert.equal(planScanSubmit(' , ; ', true).mode, 'empty');
  assert.deepEqual(planScanSubmit('', false).codes, []);
});

test('planScanSubmit: meal-move + đúng 1 mã → single', () => {
  const p = planScanSubmit('OPS1', true);
  assert.equal(p.mode, 'single');
  assert.deepEqual(p.codes, ['OPS1']);
});

test('planScanSubmit: meal-move + nhiều mã → meal-move-batch (giữ nguyên mọi mã, không lọc)', () => {
  const p = planScanSubmit('OPS1 OPS2 EMP3', true);
  assert.equal(p.mode, 'meal-move-batch');
  assert.deepEqual(p.codes, ['OPS1', 'OPS2', 'EMP3']);
  assert.deepEqual(p.validCodes, ['OPS1', 'OPS2', 'EMP3']); // server tự quyết, client không lọc
  assert.equal(p.invalidCount, 0);
});

test('planScanSubmit: đối chiếu + đúng 1 mã → single (kể cả mã lạ — server quyết)', () => {
  assert.equal(planScanSubmit('OPS1', false).mode, 'single');
  assert.equal(planScanSubmit('EMP1', false).mode, 'single');
});

test('planScanSubmit: đối chiếu + nhiều mã → reconcile-batch, lọc mã rác, đếm invalidCount', () => {
  const p = planScanSubmit('OPS1 EMP2 OPS3\nOPS4,ops5', false);
  assert.equal(p.mode, 'reconcile-batch');
  assert.deepEqual(p.validCodes, ['OPS1', 'OPS3', 'OPS4', 'ops5']);
  assert.equal(p.invalidCount, 1);
  assert.deepEqual(p.codes, ['OPS1', 'EMP2', 'OPS3', 'OPS4', 'ops5']);
});

test('planScanSubmit: đối chiếu + toàn mã rác → reconcile-batch với validCodes rỗng', () => {
  const p = planScanSubmit('EMP1 EMP2', false);
  assert.equal(p.mode, 'reconcile-batch');
  assert.deepEqual(p.validCodes, []);
  assert.equal(p.invalidCount, 2);
});

// ===== REGRESSION (fix 2026-08-08): paste loạt vào task đối chiếu =====
test('REGRESSION: paste loạt nhiều dòng vào "Task điểm danh ca" → tách từng mã, KHÔNG còn 1 khối ngang', () => {
  const blob = 'OPS1001\nOPS1002\nOPS1003'; // dán từ Excel / danh sách, xuống dòng
  const p = planScanSubmit(blob, false);
  assert.equal(p.mode, 'reconcile-batch');
  assert.deepEqual(p.validCodes, ['OPS1001', 'OPS1002', 'OPS1003']); // 3 mã riêng biệt
  assert.equal(p.invalidCount, 0);
});

test('REGRESSION: paste loạt 1 cột ngang (tab) vào task đối chiếu → từng mã riêng biệt', () => {
  const blob = 'OPS2001\tOPS2002\tOPS2003';
  const p = planScanSubmit(blob, false);
  assert.equal(p.mode, 'reconcile-batch');
  assert.deepEqual(p.validCodes, ['OPS2001', 'OPS2002', 'OPS2003']);
});

test('REGRESSION: paste loạt có lẫn mã rác vào task đối chiếu → chỉ enqueue mã hợp lệ', () => {
  const blob = 'OPS3001 EMP900 OPS3002';
  const p = planScanSubmit(blob, false);
  assert.equal(p.mode, 'reconcile-batch');
  assert.deepEqual(p.validCodes, ['OPS3001', 'OPS3002']);
  assert.equal(p.invalidCount, 1); // EMP900 bị bỏ qua, báo 1 lần
});
