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
  // danh sách task của thiết bị khác dù poll 3s.
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

// ===== BUG (2026-08-19): batchInsertLogRows_ thiếu setNumberFormat TIME_RA =====
// Meal-move pre-fill timeRa ("Giờ Ra" = "Giờ điểm danh") — nếu không ép format,
// cell timeRa hiển thị datetime đầy đủ thay vì HH:mm:ss (append/update đã có format).
test('Database.gs: batchInsertLogRows_ phải setNumberFormat HH:mm:ss cho TIME_RA + TIME_SCAN', () => {
  const db = fs.readFileSync(path.join(__dirname, '..', 'Database.gs'), 'utf8');
  const start = db.indexOf('function batchInsertLogRows_(');
  assert.ok(start >= 0, 'phải có hàm batchInsertLogRows_');
  const end = db.indexOf('\nfunction ', start + 1);
  const block = db.slice(start, end === -1 ? start + 2000 : end);
  assert.ok(block.indexOf('LOG_COLS.TIME_SCAN + 1') >= 0, 'phải format cột TIME_SCAN');
  assert.ok(block.indexOf('LOG_COLS.TIME_RA + 1') >= 0, 'phải format cột TIME_RA');
  assert.ok(block.indexOf("setNumberFormat('HH:mm:ss')") >= 0,
    'phải setNumberFormat HH:mm:ss — pre-fill timeRa hiển thị datetime đầy đủ (bug 2026-08-19)');
});

// ===== P2 (2026-08-19): durationMinutes response/client phải clamp max(0) — khớp read path (B1) =====
// Read path đã clamp (Database.gs:347/605, Database.gs B1). Rule duplicate 1.5s đảm bảo
// now >= lastEpoch + 1.5s nên response hiện không thể âm — clamp = defense-in-depth cho
// mọi thay đổi tương lai + giữ nhất quán response/read path. Source check (không reachable
// qua API để test behavior — convention file này).
test('ScanService.gs: durationMinutes response phải clamp Math.max(0) — khớp read path B1', () => {
  const i = src.indexOf('Math.round((now.getTime() - effectiveResult.row.timeRaEpoch) / 60000)');
  assert.ok(i >= 0, 'phải có công thức durationMinutes ở nhánh update Vào');
  const lineStart = src.lastIndexOf('\n', i - 1) + 1;
  const line = src.slice(lineStart, src.indexOf('\n', i));
  assert.ok(line.indexOf('Math.max(0, Math.round(') >= 0,
    'response phải clamp Math.max(0, ...) — read path đã clamp (Database.gs B1)');
});

test('js.html: optimistic durationMinutes phải clamp Math.max(0) — khớp server (P2 2026-08-19)', () => {
  const js = fs.readFileSync(path.join(__dirname, '..', 'js.html'), 'utf8');
  const i = js.indexOf('Math.round((target.timeScanEpoch - target.timeRaEpoch) / 60000)');
  assert.ok(i >= 0, 'phải có công thức optimistic durationMinutes');
  const lineStart = js.lastIndexOf('\n', i - 1) + 1;
  const line = js.slice(lineStart, js.indexOf('\n', i));
  assert.ok(line.indexOf('Math.max(0, Math.round(') >= 0,
    'optimistic phải clamp Math.max(0, ...) — response server đã clamp, client phải khớp');
});

// ===== O5 (2026-08-20): TASK_DETAIL rebuild từ cache — không đọc full sheet mỗi miss =====
// Màn quét poll 3s + TTL detail 5s + invalidate sau mỗi scan → miss liên tục; trước
// đây mỗi miss getDataRange CẢ AttendanceLog + AttendanceTask (log phình → càng chậm).
// LOG_ROWS/TASK cache được mọi write path giữ đúng (scan → incremental, append/batch/
// transform → invalidate) → build từ cache là nguồn tươi tương đương sheet.
test('Database.gs: readTaskDetailCached_ build từ readTaskCached_ + readLogRowsCached_ (không đọc fresh sheet)', () => {
  const db = fs.readFileSync(path.join(__dirname, '..', 'Database.gs'), 'utf8');
  const start = db.indexOf('function readTaskDetailCached_(');
  assert.ok(start >= 0, 'phải có hàm readTaskDetailCached_');
  const end = db.indexOf('\nfunction ', start + 1);
  const block = db.slice(start, end === -1 ? start + 1600 : end);
  assert.ok(block.indexOf('readTaskCached_(taskId)') >= 0, 'detail phải dùng task cache');
  assert.ok(block.indexOf('readLogRowsCached_(taskId)') >= 0,
    'detail phải dùng log rows cache (incremental — scan kế không chạm sheet)');
  assert.ok(block.indexOf('readLogRows_(taskId)') === -1,
    'KHÔNG được đọc fresh full AttendanceLog khi miss (O5 2026-08-20)');
  assert.ok(block.indexOf('readTask_(taskId)') === -1,
    'KHÔNG được đọc fresh AttendanceTask khi miss (O5 2026-08-20)');
});

// ===== O6 (2026-08-20): STAFF_INDEX cache SLIM — tránh vượt 100KB/key → miss âm thầm =====
// buildStaffIndex đầy đủ (cardIn/cardOut/date) ~200B/NV → ~600+ NV vượt 100KB/key →
// CacheService.put THROW (F3) → cache không bao giờ có hiệu lực → MỌI scan NV lạ +
// getStaffIndexApi đọc lại CẢ StaffData. Cache chỉ cần field đường quét (verify:
// ScanLogic buildExtraRow/buildMealMoveExtraRow + Code.gs getStaffIndexApi).
test('Database.gs: readStaffIndex_ cache SLIM — không chứa cardIn/cardOut/date', () => {
  const db = fs.readFileSync(path.join(__dirname, '..', 'Database.gs'), 'utf8');
  const start = db.indexOf('function readStaffIndex_(');
  assert.ok(start >= 0, 'phải có hàm readStaffIndex_');
  const end = db.indexOf('\nfunction ', start + 1);
  const block = db.slice(start, end === -1 ? start + 1200 : end);
  assert.ok(block.indexOf('staffName: s.staffName') >= 0, 'cache phải giữ staffName');
  assert.ok(block.indexOf('cardIn: s.cardIn') === -1, 'cache KHÔNG chứa cardIn (thổi quá 100KB)');
  assert.ok(block.indexOf('cardOut: s.cardOut') === -1, 'cache KHÔNG chứa cardOut');
  assert.ok(block.indexOf('date: s.date') === -1,
    'cache KHÔNG chứa date (pre-fill dùng readStaffList_ đầy đủ — không ai đọc date từ index)');
});