/**
 * tests/database-warm-merge.test.js — BUG: warmLogRowsCache_ put đè (transfer Chuyển Tiếp
 * chỉ hiện đợt chuyển gần nhất).
 *
 * Root cause: batchInsertLogRows_ gọi warmLogRowsCache_ sau mỗi lần ghi. Hàm này
 * cache_().put() NGUYÊN staffList vừa ghi — ghi đè (thay vì merge) LOG_ROWS đang có
 * → append vào task HIỆN CÓ (transfer delta lần 2..n) làm cache mất các dòng cũ →
 * UI (readTaskDetailCached_ ← readLogRowsCached_) chỉ hiện đợt mới nhất cho đến hết TTL.
 * Sheet vẫn đủ (append-only) — chỉ view sai, tự lành sau TTL.
 *
 * Test behavioral: trích warmLogRowsCache_ thật từ Database.gs, chạy trong vm với
 * cache_ stub — pre-seed dòng cũ, warm thêm dòng mới, assert merge (không mất cũ).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const db = fs.readFileSync(path.join(__dirname, '..', 'Database.gs'), 'utf8');

function loadWarm() {
  const start = db.indexOf('function warmLogRowsCache_');
  assert.ok(start >= 0, 'phải có hàm warmLogRowsCache_');
  const end = db.indexOf('\n}\n\n/**', start);
  assert.ok(end > start, 'tìm được hết hàm warmLogRowsCache_');
  const src = db.slice(start, end + 3);
  const store = {};
  const sandbox = {
    CACHE_KEYS: { LOG_ROWS: 'k_log_' },
    CACHE_TTL: { LOG_ROWS: 30 },
    STATUS: { OUT: 'Ra ngoài', PENDING: '-' },
    cache_: function () {
      return {
        get: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
        put: function (k, v) { store[k] = String(v); },
        remove: function (k) { delete store[k]; },
      };
    },
    formatTime_: function () { return ''; },
    formatDateShort_: function () { return ''; },
    Logger: { log: function () {} },
  };
  vm.createContext(sandbox);
  vm.runInContext(src + '\nthis.__warm = warmLogRowsCache_;', sandbox);
  return { warm: sandbox.__warm, store };
}

test('warmLogRowsCache_: append vào task hiện có phải MERGE — không xóa dòng cũ khỏi cache', () => {
  const ctx = loadWarm();
  // Pre-seed: target đã có 2 dòng từ đợt chuyển 1 (đúng schema slim của readLogRowsCached_)
  ctx.store['k_log_T1'] = JSON.stringify([
    { taskId: 'T1', staffId: 'OPS1', staffName: 'A', timeRaEpoch: 1000, timeScanEpoch: 0, status: 'Ra ngoài', _rowIndex: 2 },
    { taskId: 'T1', staffId: 'OPS2', staffName: 'B', timeRaEpoch: 2000, timeScanEpoch: 0, status: 'Ra ngoài', _rowIndex: 3 },
  ]);
  // Đợt chuyển 2: thêm 1 dòng mới (startRow = dòng sheet tiếp theo)
  const ok = ctx.warm('T1', [{ staffId: 'OPS3', staffName: 'C', timeRa: null, timeRaEpoch: 0, status: '-', date: '' }], 4);
  assert.equal(ok, true, 'warm thành công');
  const rows = JSON.parse(ctx.store['k_log_T1']);
  const ids = rows.map(function (r) { return r.staffId; }).sort();
  assert.deepEqual(ids, ['OPS1', 'OPS2', 'OPS3'], 'cache phải giữ cả dòng cũ + mới (bug: chỉ còn đợt mới nhất)');
});

test('warmLogRowsCache_: task mới (cache trống) vẫn warm bình thường', () => {
  const ctx = loadWarm();
  const ok = ctx.warm('TNEW', [{ staffId: 'OPS1', staffName: 'A', timeRa: null, timeRaEpoch: 0, status: '-', date: '' }], 2);
  assert.equal(ok, true);
  const rows = JSON.parse(ctx.store['k_log_TNEW']);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].staffId, 'OPS1');
});

test('Database.gs: batchInsertLogRows_ ghi append phải invalidate detail + list (parity batchAppend)', () => {
  const start = db.indexOf('function batchInsertLogRows_(');
  assert.ok(start >= 0, 'phải có hàm batchInsertLogRows_');
  const end = db.indexOf('\nfunction ', start + 1);
  const block = db.slice(start, end === -1 ? start + 3000 : end);
  assert.ok(block.indexOf('invalidateTaskDetailCache_(taskId)') >= 0,
    'batchInsertLogRows_ phải invalidate detail — nếu không mở target ngay sau chuyển thấy list cũ ~15s');
  assert.ok(block.indexOf('invalidateTaskListCache_()') >= 0,
    'batchInsertLogRows_ phải invalidate list — nếu không counter danh sách lệch ~30s');
});
