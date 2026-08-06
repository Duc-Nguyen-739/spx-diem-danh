/**
 * tests/batch-meal-move.test.js — Test off-by-one bug trong batchMealMoveLogUpdates_
 *
 * Bug: _rowIndex là 1-based sheet row (2,3,4...) nhưng loop dùng i (0-based values index).
 *      byRow[u._rowIndex] = u → key nhỏ nhất = 2.
 *      Loop: byRow[i] với i=1 → byRow[1] KHÔNG TỒN TẠI → first data row bị MISS.
 *      → timeScan rỗng → markUnscannedAbsent_ → ABSENT (Vắng).
 *
 * Fix: byRow[i] → byRow[i + 1] (i 0-based → +1 = 1-based sheet row = _rowIndex)
 */
const test = require('node:test');
const assert = require('node:assert/strict');

// ===== Mock LOG_COLS / STATUS (từ Config.gs) =====
const LOG_COLS = {
  TASK_ID: 0, STAFF_ID: 1, STAFF_NAME: 2, SLOT_CODE: 3, STATION: 4,
  TEAM: 5, WORKSTATION: 6, TIME_REF: 7, TIME_SCAN: 8, STATUS: 9,
  DATE: 10, TIME_RA: 11, AGENCY: 12,
};
const STATUS = {
  PENDING: '-', PRESENT: 'Có mặt', ABSENT: 'Vắng', EXTRA: 'Dư', OUT: 'Ra ngoài',
};
const LOG_COL_COUNT = 13;

// ===== Mock Sheet (mô phỏng GAS Sheet) =====
function makeMockSheet(values) {
  return {
    _values: values.map(r => [...r]), // deep copy
    getDataRange() {
      return {
        getValues: () => this._values.map(r => [...r]),
      };
    },
    getRange(row, col, numRows, numCols) {
      // row/col 1-based
      return {
        setValues: (data) => {
          for (let r = 0; r < data.length; r++) {
            for (let c = 0; c < data[r].length; c++) {
              this._values[row - 1 + r][col - 1 + c] = data[r][c];
            }
          }
        },
        setNumberFormat: () => {},
      };
    },
  };
}

// ===== Logic thuần trích từ Database.gs batchMealMoveLogUpdates_ =====
// Phiên bản BUG (original)
function batchMealMoveLogUpdates_BUG(sheet, updates) {
  if (!updates || !updates.length) return 0;
  const values = sheet.getDataRange().getValues();
  const byRow = {};
  updates.forEach(function (u) { byRow[u._rowIndex] = u; });
  let anyChanged = false;
  for (let i = 1; i < values.length; i++) {
    const u = byRow[i];                    // ⚠️ BUG: byRow[i] — i là 0-based, _rowIndex 1-based
    if (!u) continue;
    if (u.timeRa) { values[i][LOG_COLS.TIME_RA] = u.timeRa; anyChanged = true; }
    if (u.timeScan) { values[i][LOG_COLS.TIME_SCAN] = u.timeScan; anyChanged = true; }
    if (u.status && values[i][LOG_COLS.STATUS] !== u.status) {
      values[i][LOG_COLS.STATUS] = u.status; anyChanged = true;
    }
  }
  if (anyChanged) {
    [LOG_COLS.STATUS, LOG_COLS.TIME_RA, LOG_COLS.TIME_SCAN].forEach(function (colIdx) {
      const col = [];
      for (let r = 1; r < values.length; r++) col.push([values[r][colIdx]]);
      const colRange = sheet.getRange(2, colIdx + 1, values.length - 1, 1);
      colRange.setValues(col);
    });
  }
  return anyChanged ? updates.length : 0;
}

// Phiên bản FIX
function batchMealMoveLogUpdates_FIXED(sheet, updates) {
  if (!updates || !updates.length) return 0;
  const values = sheet.getDataRange().getValues();
  const byRow = {};
  updates.forEach(function (u) { byRow[u._rowIndex] = u; });
  let anyChanged = false;
  for (let i = 1; i < values.length; i++) {
    const u = byRow[i + 1];                // ✅ FIX: i+1 = 1-based sheet row = _rowIndex
    if (!u) continue;
    if (u.timeRa) { values[i][LOG_COLS.TIME_RA] = u.timeRa; anyChanged = true; }
    if (u.timeScan) { values[i][LOG_COLS.TIME_SCAN] = u.timeScan; anyChanged = true; }
    if (u.status && values[i][LOG_COLS.STATUS] !== u.status) {
      values[i][LOG_COLS.STATUS] = u.status; anyChanged = true;
    }
  }
  if (anyChanged) {
    [LOG_COLS.STATUS, LOG_COLS.TIME_RA, LOG_COLS.TIME_SCAN].forEach(function (colIdx) {
      const col = [];
      for (let r = 1; r < values.length; r++) col.push([values[r][colIdx]]);
      const colRange = sheet.getRange(2, colIdx + 1, values.length - 1, 1);
      colRange.setValues(col);
    });
  }
  return anyChanged ? updates.length : 0;
}

// ===== Helper: tạo sheet có 10 NV đã quét Ra (status OUT, có timeRa) =====
function makeSheetWith10RaStaff(taskId) {
  const header = Array(LOG_COL_COUNT).fill('');
  header[LOG_COLS.TASK_ID] = 'TASK_ID';
  header[LOG_COLS.STAFF_ID] = 'STAFF_ID';
  const values = [header];
  for (let n = 1; n <= 10; n++) {
    const row = Array(LOG_COL_COUNT).fill('');
    row[LOG_COLS.TASK_ID] = taskId;
    row[LOG_COLS.STAFF_ID] = 'OPS' + String(100000 + n).padStart(6, '0');
    row[LOG_COLS.STATUS] = STATUS.OUT;
    row[LOG_COLS.TIME_RA] = new Date('2026-08-06T12:00:00');
    row[LOG_COLS.TIME_SCAN] = ''; // chưa quét Vào
    values.push(row);
  }
  return values;
}

// ===== Helper: tạo 10 updates cho mode Vào (giống paste 10 mã) =====
function make10VaoUpdates() {
  const updates = [];
  const now = new Date('2026-08-06T13:00:00');
  for (let rowIndex = 2; rowIndex <= 11; rowIndex++) {
    updates.push({
      _rowIndex: rowIndex, // 1-based sheet row (2,3,4...11)
      status: STATUS.PRESENT,
      timeScan: now,
    });
  }
  return updates;
}

// ===== Tests =====

test('RED: BUG version — first data row (row 2) bị skip, timeScan rỗng → ABSENT', () => {
  const taskId = 'MR20260806-TEST';
  const values = makeSheetWith10RaStaff(taskId);
  const sheet = makeMockSheet(values);
  const updates = make10VaoUpdates();

  const result = batchMealMoveLogUpdates_BUG(sheet, updates);
  assert.equal(result, 10, 'BUG version vẫn return 10 (anyChanged=true từ các row khác)');

  // Đọc lại sheet sau khi BUG version ghi
  const after = sheet.getDataRange().getValues();
  // Row 2 (index 1) = OPS100001 — mã đầu tiên
  const firstRow = after[1];
  assert.equal(firstRow[LOG_COLS.STATUS], STATUS.OUT,
    'BUG: row 2 status vẫn OUT (không được update thành PRESENT)');
  assert.equal(firstRow[LOG_COLS.TIME_SCAN], '',
    'BUG: row 2 timeScan rỗng (không được update) → markUnscannedAbsent_ → ABSENT');

  // Row 3 (index 2) = OPS100002 — mã thứ 2 (được update OK)
  const secondRow = after[2];
  assert.equal(secondRow[LOG_COLS.STATUS], STATUS.PRESENT,
    'BUG: row 3 status = PRESENT (được update OK — chỉ row đầu bị skip)');
});

test('GREEN: FIXED version — tất cả 10 row đều được update, first row PRESENT', () => {
  const taskId = 'MR20260806-TEST';
  const values = makeSheetWith10RaStaff(taskId);
  const sheet = makeMockSheet(values);
  const updates = make10VaoUpdates();

  const result = batchMealMoveLogUpdates_FIXED(sheet, updates);
  assert.equal(result, 10, 'FIXED version return 10');

  const after = sheet.getDataRange().getValues();
  // Tất cả 10 row phải được update
  for (let r = 1; r <= 10; r++) {
    const row = after[r];
    assert.equal(row[LOG_COLS.STATUS], STATUS.PRESENT,
      `FIXED: row ${r + 1} status phải = PRESENT (Có mặt)`);
    assert.ok(row[LOG_COLS.TIME_SCAN] instanceof Date,
      `FIXED: row ${r + 1} timeScan phải có giá trị Date (không rỗng)`);
  }
  // Đặc biệt check first data row
  assert.equal(after[1][LOG_COLS.STATUS], STATUS.PRESENT,
    'FIXED: first data row (row 2) status = PRESENT ✅');
  assert.ok(after[1][LOG_COLS.TIME_SCAN] instanceof Date,
    'FIXED: first data row (row 2) timeScan có giá trị ✅');
});

test('EDGE: chỉ 1 NV — fix vẫn hoạt động (first row không bị skip)', () => {
  const taskId = 'MR20260806-TEST';
  const header = Array(LOG_COL_COUNT).fill('');
  const values = [header];
  const row = Array(LOG_COL_COUNT).fill('');
  row[LOG_COLS.TASK_ID] = taskId;
  row[LOG_COLS.STAFF_ID] = 'OPS100001';
  row[LOG_COLS.STATUS] = STATUS.OUT;
  row[LOG_COLS.TIME_RA] = new Date('2026-08-06T12:00:00');
  row[LOG_COLS.TIME_SCAN] = '';
  values.push(row);

  const sheet = makeMockSheet(values);
  const now = new Date('2026-08-06T13:00:00');
  const updates = [{ _rowIndex: 2, status: STATUS.PRESENT, timeScan: now }];

  batchMealMoveLogUpdates_FIXED(sheet, updates);
  const after = sheet.getDataRange().getValues();
  assert.equal(after[1][LOG_COLS.STATUS], STATUS.PRESENT,
    'FIXED: single NV row 2 status = PRESENT');
  assert.ok(after[1][LOG_COLS.TIME_SCAN] instanceof Date,
    'FIXED: single NV row 2 timeScan có giá trị');
});

test('EDGE: Updates không liền kề — row 2 và row 10 (bỏ row 3-9)', () => {
  const taskId = 'MR20260806-TEST';
  const values = makeSheetWith10RaStaff(taskId);
  const sheet = makeMockSheet(values);
  const now = new Date('2026-08-06T13:00:00');
  const updates = [
    { _rowIndex: 2, status: STATUS.PRESENT, timeScan: now },
    { _rowIndex: 11, status: STATUS.PRESENT, timeScan: now },
  ];

  batchMealMoveLogUpdates_FIXED(sheet, updates);
  const after = sheet.getDataRange().getValues();
  assert.equal(after[1][LOG_COLS.STATUS], STATUS.PRESENT, 'FIXED: row 2 (first) được update');
  assert.equal(after[10][LOG_COLS.STATUS], STATUS.PRESENT, 'FIXED: row 11 (last) được update');
  // Row giữa (index 3) không được update — giữ nguyên
  assert.equal(after[2][LOG_COLS.STATUS], STATUS.OUT, 'FIXED: row 3 giữ nguyên OUT');
});
