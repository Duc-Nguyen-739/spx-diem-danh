/**
 * tests/task-search.test.js — Node thuần (không cần GAS)
 * Test: collectTaskIdsByStaffLog_ (TaskSearch.gs) — tìm task mà mã NV đã từng
 * điểm danh (dùng cho ô tìm kiếm mã Ops ở header → lọc "Danh Sách Task").
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { collectTaskIdsByStaffLog_ } = require('../TaskSearch.gs');

// Giả lập LOG_COLS (index cột thật trong Config.gs)
const COLS = { TASK_ID: 0, STAFF_ID: 1, TIME_SCAN: 8, TIME_RA: 11 };

// Tạo 1 dòng AttendanceLog thô (mảng 2D) — chỉ điền cột cần test
function rawRow(overrides) {
  const r = ['', '', '', '', '', '', '', '', '', '', '', '', ''];
  Object.keys(overrides || {}).forEach(function (k) { r[COLS[k]] = overrides[k]; });
  return r;
}

test('rỗng / null / không có log → []', () => {
  assert.deepEqual(collectTaskIdsByStaffLog_([], 'OPS1', COLS), []);
  assert.deepEqual(collectTaskIdsByStaffLog_(null, 'OPS1', COLS), []);
  assert.deepEqual(collectTaskIdsByStaffLog_([], '', COLS), []);
});

test('không khớp mã → []', () => {
  const rows = [rawRow({ STAFF_ID: 'OPS000002', TIME_SCAN: '09:02:15' })];
  assert.deepEqual(collectTaskIdsByStaffLog_(rows, 'OPS000001', COLS), []);
});

test('khớp mã nhưng CHƯA quét (pre-fill "-") → bỏ qua', () => {
  const rows = [rawRow({ TASK_ID: 'R20260802-0900', STAFF_ID: 'OPS000001', TIME_SCAN: '', TIME_RA: '' })];
  assert.deepEqual(collectTaskIdsByStaffLog_(rows, 'OPS000001', COLS), []);
});

test('khớp mã + có TIME_SCAN (reconcile đã quét / meal-move đã Vào) → trả taskId (case-insensitive)', () => {
  const rows = [rawRow({ TASK_ID: 'R20260802-0900', STAFF_ID: 'OPS000001', TIME_SCAN: '09:02:15' })];
  assert.deepEqual(collectTaskIdsByStaffLog_(rows, 'ops000001', COLS), ['R20260802-0900']);
});

test('khớp mã + chỉ có TIME_RA (meal-move đã Ra, chưa Vào) → vẫn tính là đã điểm danh', () => {
  const rows = [rawRow({ TASK_ID: 'M20260804-1200', STAFF_ID: 'OPS000002', TIME_RA: '11:40:00' })];
  assert.deepEqual(collectTaskIdsByStaffLog_(rows, 'OPS000002', COLS), ['M20260804-1200']);
});

test('nhiều dòng cùng task (quét nhiều ca / nhiều lần) → dedupe 1 taskId, giữ thứ tự', () => {
  const rows = [
    rawRow({ TASK_ID: 'R20260802-0900', STAFF_ID: 'OPS000001', TIME_SCAN: '09:02:15' }),
    rawRow({ TASK_ID: 'R20260802-0900', STAFF_ID: 'OPS000001', TIME_SCAN: '09:05:00' }),
    rawRow({ TASK_ID: 'R20260803-0900', STAFF_ID: 'OPS000001', TIME_SCAN: '09:10:00' }),
  ];
  assert.deepEqual(collectTaskIdsByStaffLog_(rows, 'OPS000001', COLS), ['R20260802-0900', 'R20260803-0900']);
});

test('dòng rỗng / thiếu taskId → bỏ qua, không crash', () => {
  const rows = [rawRow({}), [], rawRow({ TASK_ID: '', STAFF_ID: 'OPS000001', TIME_SCAN: '09:00:00' })];
  assert.deepEqual(collectTaskIdsByStaffLog_(rows, 'OPS000001', COLS), []);
});

test('lẫn mã khác trong log → chỉ trả task của đúng mã', () => {
  const rows = [
    rawRow({ TASK_ID: 'R20260802-0900', STAFF_ID: 'OPS000001', TIME_SCAN: '09:02:15' }),
    rawRow({ TASK_ID: 'R20260802-0900', STAFF_ID: 'OPS000099', TIME_SCAN: '09:03:00' }),
    rawRow({ TASK_ID: 'R20260804-0900', STAFF_ID: 'OPS000001', TIME_SCAN: '09:04:00' }),
  ];
  assert.deepEqual(collectTaskIdsByStaffLog_(rows, 'OPS000001', COLS), ['R20260802-0900', 'R20260804-0900']);
});
