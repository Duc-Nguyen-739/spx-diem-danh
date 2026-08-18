/**
 * tests/scan-update-epoch.test.js — BUG 3 (2026-08-18): nhánh update/else của
 * scanStaff (ScanService.gs) chỉ set row.timeScan + row.status mà KHÔNG set
 * row.timeScanEpoch → computeCounters đọc logRows local (dòng PENDING còn
 * timeScanEpoch=0) đếm scanned thành absent, counter trả client sai ~15s.
 *
 * ScanService.gs không chạy được trên Node (phụ thuộc GAS) → static check:
 * nhánh update phải gán timeScanEpoch cùng lúc gán timeScan/status, khớp
 * pattern nhánh Ra (đã set timeRaEpoch đúng).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'ScanService.gs'), 'utf8');

test('scanStaff nhánh update (reconcile/meal-move Vào): set row.timeScanEpoch cùng timeScan (bug 2026-08-18)', () => {
  const i = src.indexOf('effectiveResult.row.timeScan = now;');
  assert.ok(i >= 0, 'phải có chỗ gán timeScan ở nhánh update');
  const block = src.slice(i, i + 220);
  assert.ok(block.indexOf('effectiveResult.row.timeScanEpoch = now.getTime();') >= 0,
    'phải set row.timeScanEpoch ngay sau row.timeScan — nếu không computeCounters (ScanLogic.gs ' +
    'đếm theo timeScanEpoch>0) đếm dòng vừa quét thành absent');
});

test('computeCounters đếm theo timeScanEpoch (nguồn bug) — regression giữ nguyên', () => {
  const logic = fs.readFileSync(path.join(__dirname, '..', 'ScanLogic.gs'), 'utf8');
  const i = logic.indexOf('function computeCounters');
  const block = logic.slice(i, i + 700);
  assert.ok(block.indexOf('Number(row.timeScanEpoch) > 0') >= 0,
    'computeCounters phải đọc epoch — nếu đổi sang text sẽ mất ngày xuyên nửa đêm');
});

// ===== BUG 9 (2026-08-18): scan không invalidate TASK_COUNTS → counters list lệch ~30s =====
test('Database.gs: mọi hàm ghi log scan phải invalidate task list cache (thiết bị khác thấy ngay)', () => {
  const db = fs.readFileSync(path.join(__dirname, '..', 'Database.gs'), 'utf8');
  // 5 hàm ghi log đều chỉ được gọi từ luồng scan (ScanService) → sau khi ghi phải
  // invalidateTaskListCache_() — nếu không TASK_COUNTS (TTL ~30s) giữ counter cũ trên
  // danh sách task của thiết bị khác dù poll 5s.
  const fns = ['updateLogRowScan_', 'updateLogRowRa_', 'appendLogRow_', 'batchMealMoveLogUpdates_', 'batchAppendLogRows_'];
  fns.forEach(function (fn) {
    const start = db.indexOf('function ' + fn + '(');
    assert.ok(start >= 0, 'phải có hàm ' + fn);
    const end = db.indexOf('\nfunction ', start + 1);
    const block = db.slice(start, end === -1 ? start + 2000 : end);
    assert.ok(block.indexOf('invalidateTaskListCache_()') >= 0,
      fn + ' phải gọi invalidateTaskListCache_() sau khi ghi (bug: counter list lệch ~30s)');
  });
});