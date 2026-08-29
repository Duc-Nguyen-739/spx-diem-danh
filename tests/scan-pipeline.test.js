/**
 * tests/scan-pipeline.test.js — FIX-07: behavioral test pipeline quét server-side.
 *
 * Trước đây ScanService.gs/TaskService.gs chỉ có dispatch-test + static check —
 * không test nào chạy read → classify → write TRÊN mock sheet → regression kiểu
 * FIX-03 (ghi sai dòng qua cache) không bị test bắt.
 *
 * Cách load: nạp .gs THẬT được deploy (Config/CacheLayer/CsvUtil/ScanLogic/Database/
 * TaskService/ScanService) vào vm sandbox với mock GAS (SpreadsheetApp/CacheService/
 * LockService/Utilities/Session/PropertiesService/Logger) — pattern tests/cache-layer.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
function loadGs(ctx, file) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  vm.runInContext(src, ctx, { filename: file });
}

// ===== Mock GAS Spreadsheet (grid 2D đơn giản, đủ cho Database/Task/ScanService) =====
function makeRange(grid, row, col, numRows, numCols) {
  numRows = numRows === undefined ? 1 : numRows;
  numCols = numCols === undefined ? 1 : numCols;
  function clamp() {
    while (grid.length < row + numRows - 1) grid.push([]);
    for (const r of grid) while (r.length < col + numCols - 1) r.push('');
  }
  return {
    getValues() {
      clamp();
      const out = [];
      for (let r = row - 1; r < row - 1 + numRows; r++) {
        out.push(grid[r].slice(col - 1, col - 1 + numCols));
      }
      return out;
    },
    getValue() { return this.getValues()[0][0]; },
    setValues(values) {
      clamp();
      for (let r = 0; r < values.length; r++) {
        for (let c = 0; c < values[r].length; c++) {
          grid[row - 1 + r][col - 1 + c] = values[r][c];
        }
      }
    },
    setValue(v) { this.setValues([[v]]); },
    setNumberFormat() {}, // format cosmetic — pipeline không phụ thuộc
    setFontWeight() {},
    clearContent() {
      clamp();
      for (let r = row - 1; r < row - 1 + numRows; r++) {
        for (let c = col - 1; c < col - 1 + numCols; c++) grid[r][c] = '';
      }
    },
  };
}

function makeSheet(rows) {
  const grid = rows.map((r) => [...r]);
  return {
    _grid: grid,
    getLastRow() {
      let last = 0;
      for (let i = 0; i < grid.length; i++) if (grid[i].some((c) => c !== '' && c !== undefined)) last = i + 1;
      return last;
    },
    getLastColumn() {
      let last = 0;
      for (const r of grid) for (let i = r.length - 1; i >= 0; i--) if (r[i] !== '' && r[i] !== undefined) { if (i + 1 > last) last = i + 1; break; }
      return last;
    },
    getRange(row, col, numRows, numCols) { return makeRange(grid, row, col, numRows, numCols); },
    getDataRange() {
      return makeRange(grid, 1, 1, Math.max(this.getLastRow(), 1), Math.max(this.getLastColumn(), 1));
    },
    appendRow(row) { grid.push([...row]); return makeRange(grid, grid.length, 1); },
    insertColumnAfter(col) { for (const r of grid) r.splice(col, 0, ''); },
    getSheetId() { return 1; },
    getName() { return 'mock'; },
  };
}

function makeSandbox() {
  const sheets = {
    StaffData: makeSheet([
      ['No.', 'Date', 'Staff ID', 'Staff Name', 'Staff Email', 'Agency', 'Contract Type', 'Event ID', 'Matching Type', 'Gender', 'Department', 'Clock In Time', 'Clock Out Time', 'Actual Hours', 'Clock In Remark', 'Clock Out Remark', 'Slot Code', 'Workstation', 'Team', 'Station'],
      [1, '2026-08-01', 'OPS222', 'NV222', '', 'GRG', 'FTE', '', '', '', '', '', '', '', '', '', '08:00-17:00', 'OB', 'Outbound', 'HN2 SOC'],
    ]),
    AttendanceTask: makeSheet([
      ['taskId', 'taskType', 'station', 'slotCode', 'team', 'status', 'createdAt', 'createdBy', 'completedAt', 'note'],
      ['T1', 'reconcile', 'HN2 SOC', '08:00-17:00', 'Outbound', 'open', '2026-08-02 09:00:00', 'qa@spx', '', ''],
      ['T2', 'reconcile', 'HN2 SOC', '08:00-17:00', 'Outbound', 'done', '2026-08-02 08:00:00', 'qa@spx', '2026-08-02 17:00:00', ''],
    ]),
    AttendanceLog: makeSheet([
      ['taskId', 'staffId', 'staffName', 'slotCode', 'station', 'team', 'workstation', 'timeRef', 'timeScan', 'status', 'date', 'timeRa', 'agency'],
      ['T1', 'OPS111', 'NV111', '08:00-17:00', 'HN2 SOC', 'Outbound', 'OB', '', '', '-', '2026-08-01', '', ''],
      ['T1', 'OPS222', 'NV222', '08:00-17:00', 'HN2 SOC', 'Outbound', 'OB', '', '', '-', '2026-08-01', '', ''],
      ['T1', 'OPS333', 'NV333', '08:00-17:00', 'HN2 SOC', 'Outbound', 'OB', '', new Date('2026-08-02T02:00:00Z'), 'Có mặt', '2026-08-01', '', ''],
      ['T2', 'OPS111', 'NV111', '08:00-17:00', 'HN2 SOC', 'Outbound', 'OB', '', '', 'Vắng', '2026-08-01', '', ''],
    ]),
  };
  const ss = { getSheetByName: (name) => sheets[name] || null, insertSheet: () => makeSheet([[]]) };

  const cacheStore = new Map();
  const ctx = {
    console,
    Date,
    JSON,
    Math,
    Logger: { log: function () {} },
    Session: { getScriptTimeZone: () => 'Asia/Ho_Chi_Minh', getActiveUser: () => ({ getEmail: () => 'qa@spx' }) },
    Utilities: { formatDate: (d) => '09:00:00' },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'mock-id', setProperty: () => {} }) },
    LockService: { getScriptLock: () => ({ waitLock: () => true, releaseLock: () => {} }) },
    CacheService: {
      getScriptCache: () => ({
        get: (k) => (cacheStore.has(k) ? cacheStore.get(k) : null),
        put: (k, v) => cacheStore.set(k, v),
        remove: (k) => cacheStore.delete(k),
      }),
    },
    // getSpreadsheet_: DEFAULT_SPREADSHEET_ID rỗng → Properties → openById
    SpreadsheetApp: { openById: () => ss, getActiveSpreadsheet: () => ss, create: () => ss },
  };
  ctx.window = ctx;
  vm.createContext(ctx);

  // Nạp .gs THẬT theo thứ tự phụ thuộc
  ['Config.gs', 'CacheLayer.gs', 'CsvUtil.gs', 'ScanLogic.gs', 'Database.gs', 'TaskService.gs', 'ScanService.gs']
    .forEach((f) => loadGs(ctx, f));
  ctx.__sheets = sheets;
  ctx.__cacheStore = cacheStore;
  return ctx;
}

function sheetRow(ctx, sheetName, rowIdx) {
  return ctx.__sheets[sheetName]._grid[rowIdx - 1].slice();
}

test('FIX-07 pipeline: scanStaff NV chưa quét → ghi timeScan + Có mặt ĐÚNG DÒNG, counters +1', () => {
  const ctx = makeSandbox();
  const res = vm.runInContext("scanStaff('T1', 'Ops222')", ctx);
  assert.equal(res.ok, true, 'scan phải thành công: ' + JSON.stringify(res));
  assert.equal(res.status, 'Có mặt');
  const row = sheetRow(ctx, 'AttendanceLog', 3); // OPS222 ở dòng sheet 3
  assert.ok(row[8] instanceof Date, 'timeScan phải ghi Date vào dòng 3 (cột I)');
  assert.equal(row[9], 'Có mặt', 'status phải ghi Có mặt');
  // dòng NV khác không bị đụng
  assert.equal(sheetRow(ctx, 'AttendanceLog', 2)[9], '-');
  assert.equal(res.counters.scanned, 2, 'OPS333 đã quét + OPS222 vừa quét');
});

test('FIX-03 regression: sheet bị sửa tay trong cửa sổ cache → scan trả STALE_ROW, KHÔNG ghi đè dòng NV khác', () => {
  const ctx = makeSandbox();
  // 1) Prime cache LOG_ROWS/TASK 15-30s (như kiosk quét liên tục)
  vm.runInContext("readTaskCached_('T1'); readLogRowsCached_('T1')", ctx);
  // 2) Ai đó insert/sort tay AttendanceLog: dòng 3 giờ là dữ liệu task KHÁC
  ctx.__sheets.AttendanceLog._grid[2][0] = 'T9';
  // 3) Scan tiếp OPS222 — cache trả row _rowIndex=3 → verify thấy taskId T9 ≠ T1
  const res = vm.runInContext("scanStaff('T1', 'Ops222')", ctx);
  assert.equal(res.ok, false, 'phải từ chối ghi (ok:false)');
  assert.equal(res.message, 'Dữ liệu đã thay đổi — quét lại');
  assert.equal(ctx.__sheets.AttendanceLog._grid[2][9], '-', 'dòng đích KHÔNG được ghi (giữ nguyên trạng thái cũ)');
  assert.equal(ctx.__sheets.AttendanceLog._grid[2][8], '', 'timeScan KHÔNG được ghi vào dòng của task khác');
});

test('FIX-07 pipeline: completeTask → dòng chưa quét thành Vắng + task DONE + completedAt có giá trị (FIX-05)', () => {
  const ctx = makeSandbox();
  const res = vm.runInContext("completeTask('T1')", ctx);
  assert.equal(res.ok, true, JSON.stringify(res));
  const taskRow = sheetRow(ctx, 'AttendanceTask', 2); // T1 dòng 2
  assert.equal(taskRow[5], 'done', 'status DONE');
  assert.ok(String(taskRow[8]) !== '', 'completedAt PHẢI có giá trị — nếu rỗng = regression FIX-05 (2 RPC rời)');
  assert.equal(taskRow[6], '2026-08-02 09:00:00', 'CREATED_AT giữ nguyên (filler không đè)');
  assert.equal(taskRow[7], 'qa@spx', 'CREATED_BY giữ nguyên');
  // 2 dòng chưa quét → Vắng; dòng Có mặt giữ nguyên
  assert.equal(sheetRow(ctx, 'AttendanceLog', 2)[9], 'Vắng');
  assert.equal(sheetRow(ctx, 'AttendanceLog', 3)[9], 'Vắng');
  assert.equal(sheetRow(ctx, 'AttendanceLog', 4)[9], 'Có mặt');
  assert.equal(res.message.indexOf('2 NV chưa quét') >= 0, true, 'message đếm đủ 2 Vắng: ' + res.message);
});

test('FIX-07 pipeline: reopenTask task DONE → OPEN + dòng Vắng về Chưa điểm danh', () => {
  const ctx = makeSandbox();
  const res = vm.runInContext("reopenTask('T2')", ctx);
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.equal(sheetRow(ctx, 'AttendanceTask', 3)[5], 'open', 'task T2 OPEN lại');
  assert.equal(sheetRow(ctx, 'AttendanceLog', 5)[9], '-', 'dòng Vắng reset về Chưa điểm danh');
  // reopen task đang mở → từ chối
  const res2 = vm.runInContext("reopenTask('T2')", ctx);
  assert.equal(res2.ok, false);
  assert.equal(res2.message, 'Task đang mở — không cần mở lại');
});

test('FIX-02 regression: overwriteStaffData_ có lock — LockService hỏng → throw, KHÔNG xoá trắng StaffData', () => {
  const ctx = makeSandbox();
  ctx.LockService = {
    getScriptLock: () => ({ waitLock: () => { throw new Error('timeout'); }, releaseLock: () => {} }),
  };
  let threw = null;
  try {
    vm.runInContext('overwriteStaffData_([{ no: 1, staffId: "OPS999", staffName: "X" }])', ctx);
  } catch (e) { threw = e; }
  assert.ok(threw, 'phải throw khi không lấy được lock (chặn sync âm thầm)');
  // StaffData vẫn còn header + dòng cũ (không bị xoá trắng trước khi throw)
  assert.equal(ctx.__sheets.StaffData._grid[1][2], 'OPS222', 'dữ liệu cũ phải còn nguyên khi không lấy được lock');
});

test('FIX-29 regression: paste meal-move vượt trần PASTE_LOG_ROWS_MAX → từ chối sớm', () => {
  const ctx = makeSandbox();
  // Tạo task meal-move mở + log dài — paste 200 mã vào task đã ~990 dòng log
  ctx.__sheets.AttendanceTask._grid.push(['M1', 'meal-move', 'HN2 SOC', '', 'Outbound', 'open', '2026-08-02 09:00:00', 'qa@spx', '', '']);
  const longLog = [];
  for (let i = 0; i < 990; i++) {
    longLog.push(['M1', 'OPSX' + i, 'X' + i, '', 'HN2 SOC', 'Outbound', '', '', '', '-', '', '', '']);
  }
  ctx.__sheets.AttendanceLog._grid.push(...longLog);
  const rowsBefore = ctx.__sheets.AttendanceLog._grid.length; // 996 (header + 5 mẫu + 990)
  const codes = [];
  for (let i = 0; i < 200; i++) codes.push('Ops9' + String(i).padStart(5, '0'));
  const res = vm.runInContext(`pasteMealMoveScan('M1', ${JSON.stringify(codes)}, 'vao')`, ctx);
  assert.equal(res.ok, false);
  assert.equal(res.message, 'Quá nhiều dòng log — chia nhỏ danh sách paste');
  assert.equal(ctx.__sheets.AttendanceLog._grid.length, rowsBefore, 'không được append thêm dòng nào');
});
