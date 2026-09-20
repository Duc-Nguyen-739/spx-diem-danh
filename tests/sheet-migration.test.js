/**
 * tests/sheet-migration.test.js — BUG P0: migration AttendanceTask sơn ~200 cột "note".
 *
 * Root cause: migration loop theo `while (sheet.getLastColumn() < COUNT)` —
 * cột mới chèn TRỐNG chưa có content nên getLastColumn() không tiến triển
 * (đọc stale) → loop lặp hàng trăm lần; header-write
 * `getRange(1, added[0], 1, added.length)` với added toàn số 10 → sơn "note"
 * hàng loạt (map {10:'note', 11:'sourceTaskId'} khớp đúng header user thấy:
 * note×~200 + sourceTaskId cuối). Sheet dữ liệu vẫn nguyên (chỉ sơn hàng 1).
 *
 * Fix: helper ensureSheetColumns_ dùng getMaxColumns() (grid thật, tăng chắc
 * chắn sau mỗi insert) + guard + chỉ ghi header TRONG [1..colCount] (không bao
 * giờ ghi đè ngoài phạm vi) + repairTaskSheetColumns() (editor-only) dọn sheet
 * đã dính (chỉ xóa cột phụ khi toàn bộ dưới-header trống, abort khi còn data).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const db = fs.readFileSync(path.join(__dirname, '..', 'Database.gs'), 'utf8');

// ---- Static: cấm pattern migration nguy hiểm ----
test('Database.gs: không còn loop migration theo getLastColumn()', () => {
  const re = /while\s*\([^)]*getLastColumn\(\)[^)]*\)/g;
  const hits = db.match(re) || [];
  assert.equal(hits.length, 0,
    'cấm while(...getLastColumn()...) — cột mới trống làm getLastColumn stale → loop vô hạn + sơn header hàng loạt, dùng ensureSheetColumns_ (getMaxColumns)');
});

test('Database.gs: ensureSheetColumns_ dùng getMaxColumns + guard + header bounded', () => {
  const i = db.indexOf('function ensureSheetColumns_');
  assert.ok(i >= 0, 'phải có helper ensureSheetColumns_ (SSOT cho mọi migration cột)');
  const j = db.indexOf('function repairTaskSheetColumns', i);
  const block = db.slice(i, j > i ? j : i + 2500);
  const codeOnly = block.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(codeOnly.indexOf('getMaxColumns()') >= 0, 'phải chèn theo getMaxColumns (grid thật)');
  assert.ok(codeOnly.indexOf('getLastColumn()') === -1, 'CODE helper KHÔNG được phụ thuộc getLastColumn');
});

// ---- Behavioral: trích hàm thật, chạy với sheet giả lập đúng semantics GAS ----
function extractFn(name) {
  const start = db.indexOf('function ' + name);
  assert.ok(start >= 0, 'phải có hàm ' + name);
  // brace matching (hàm chứa block lồng nhau)
  let depth = 0;
  let i = db.indexOf('{', start);
  assert.ok(i > start);
  for (; i < db.length; i++) {
    if (db[i] === '{') depth++;
    else if (db[i] === '}') {
      depth--;
      if (depth === 0) return db.slice(start, i + 1);
    }
  }
  throw new Error('không đóng brace được ' + name);
}

function makeSheet(opts) {
  // opts: {maxCols, headers (mảng hàng 1), forbidLastColumn}
  const sheet = {
    _max: opts.maxCols,
    inserts: 0,
    writes: [],
    deletes: [],
    getMaxColumns: function () { return sheet._max; },
    getLastColumn: function () {
      if (opts.forbidLastColumn) throw new Error('helper không được gọi getLastColumn');
      return opts.lastCol;
    },
    getLastRow: function () { return opts.lastRow == null ? 1 : opts.lastRow; },
    insertColumnAfter: function () { sheet.inserts++; sheet._max++; },
    deleteColumns: function (start, count) { sheet.deletes.push([start, count]); },
    getRange: function (r, c, nr, nc) {
      return {
        getValues: function () {
          const out = [];
          for (let ri = 0; ri < nr; ri++) {
            const row = [];
            for (let k = 0; k < nc; k++) {
              if (r === 1) row.push(opts.headers[c - 1 + k] || '');
              else row.push((opts.data && opts.data[ri] && opts.data[ri][k]) || '');
            }
            out.push(row);
          }
          return out;
        },
        setValues: function (vals) { sheet.writes.push({ r, c, nr, nc, vals }); },
      };
    },
  };
  return sheet;
}

function loadHelper() {
  const src = extractFn('ensureSheetColumns_');
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(src + '\nthis.__fn = ensureSheetColumns_;', sandbox);
  return sandbox.__fn;
}

const TASK_H = ['taskId', 'taskType', 'station', 'slotCode', 'team', 'status', 'createdAt', 'createdBy', 'completedAt', 'note', 'sourceTaskId'];

test('ensureSheetColumns_: sheet 10 cột → thêm đúng 1 cột + header K chuẩn', () => {
  const fn = loadHelper();
  const sheet = makeSheet({ maxCols: 10, lastCol: 10, headers: TASK_H.slice(0, 10) });
  fn(sheet, 11, TASK_H);
  assert.equal(sheet.inserts, 1, 'chỉ thêm đúng số cột thiếu');
  assert.equal(sheet._max, 11);
  assert.equal(sheet.writes.length, 1, 'ghi header 1 lần duy nhất');
  const w = sheet.writes[0];
  assert.deepEqual([w.r, w.c, w.nr, w.nc], [1, 1, 1, 11], 'chỉ ghi TRONG [1..11]');
  assert.equal(w.vals[0][10], 'sourceTaskId', 'điền header cột mới');
  assert.equal(w.vals[0][9], 'note', 'giữ header cũ');
});

test('ensureSheetColumns_: sheet đã đủ cột → không insert, không ghi', () => {
  const fn = loadHelper();
  const sheet = makeSheet({ maxCols: 11, lastCol: 11, headers: TASK_H.slice() });
  fn(sheet, 11, TASK_H);
  assert.equal(sheet.inserts, 0);
  assert.equal(sheet.writes.length, 0, 'header đủ thì không ghi RPC thừa');
});

test('ensureSheetColumns_: sheet dính 200 cột note (prod hiện tại) → KHÔNG thêm, KHÔNG sơn thêm', () => {
  const fn = loadHelper();
  const messy = TASK_H.slice(0, 10).concat(new Array(200).fill('note'), ['sourceTaskId']);
  const sheet = makeSheet({ maxCols: 211, lastCol: 211, headers: messy, forbidLastColumn: true });
  fn(sheet, 11, TASK_H);
  assert.equal(sheet.inserts, 0, 'đủ grid thì không chèn thêm');
  assert.equal(sheet.writes.length, 0, 'không ghi đè header ngoài [1..11] (giữ nguyên để repair xử lý)');
});

test('ensureSheetColumns_: getLastColumn stale (luôn 10) vẫn terminate', () => {
  const fn = loadHelper();
  const sheet = makeSheet({
    maxCols: 10, lastCol: 10, headers: TASK_H.slice(0, 10),
    forbidLastColumn: false,
  });
  // Giả lập GAS stale: getLastColumn luôn 10 dù đã insert — helper không được dùng nó
  sheet.getLastColumn = function () { return 10; };
  fn(sheet, 11, TASK_H);
  assert.ok(sheet.inserts <= 6, 'terminate sau ít insert (guard), không loop vô hạn, inserts=' + sheet.inserts);
  assert.equal(sheet._max, 11);
});

// ---- repairTaskSheetColumns: editor-gated + chỉ xóa cột phụ toàn-trống ----
function loadRepair() {
  const src = extractFn('repairTaskSheetColumns');
  const sandbox = {
    SHEETS: { ATTENDANCE_TASK: 'AttendanceTask' },
    TASK_COL_COUNT: 11,
    getSheet_: function () { return sandbox.__sheet; },
    isEditor_: function () { return sandbox.__editor; },
  };
  vm.createContext(sandbox);
  vm.runInContext(src + '\nthis.__fn = repairTaskSheetColumns;', sandbox);
  return sandbox;
}

test('repairTaskSheetColumns: chặn anonymous (fail-closed)', () => {
  const sb = loadRepair();
  sb.__editor = false;
  sb.__sheet = makeSheet({ maxCols: 11, lastCol: 11, headers: TASK_H.slice() });
  const res = sb.__fn();
  assert.ok(String(res).indexOf('Script Editor') >= 0, 'anonymous chỉ nhận message, không động vào sheet');
  assert.equal(sb.__sheet.deletes.length, 0);
});

test('repairTaskSheetColumns: xóa 1 lệnh khối cột phụ toàn-trống + viết lại header chuẩn', () => {
  const sb = loadRepair();
  sb.__editor = true;
  const messy = TASK_H.slice(0, 10).concat(new Array(200).fill('note'), ['sourceTaskId']);
  sb.__sheet = makeSheet({ maxCols: 211, lastCol: 211, lastRow: 50, headers: messy });
  const res = sb.__fn();
  assert.deepEqual(sb.__sheet.deletes, [[12, 200]], 'xóa khối L.. (200 cột) bằng 1 lệnh duy nhất, giữ K=sourceTaskId');
  const hdrWrite = sb.__sheet.writes.filter((w) => w.r === 1);
  assert.equal(hdrWrite.length, 1, 'viết lại header chuẩn 1 lần');
  assert.equal(JSON.stringify(hdrWrite[0].vals[0]), JSON.stringify(TASK_H), 'header về đúng 11 cột chuẩn');
  assert.ok(String(res).indexOf('OK') >= 0);
});

test('repairTaskSheetColumns: cột phụ còn data → ABORT, không xóa gì', () => {
  const sb = loadRepair();
  sb.__editor = true;
  const messy = TASK_H.slice(0, 10).concat(new Array(200).fill('note'), ['sourceTaskId']);
  const data = [];
  for (let r = 0; r < 49; r++) data.push(new Array(200).fill(''));
  data[5][3] = 'x'; // dữ liệu lạ ở cột phụ → không được xóa
  sb.__sheet = makeSheet({ maxCols: 211, lastCol: 211, lastRow: 50, headers: messy, data });
  const res = sb.__fn();
  assert.equal(sb.__sheet.deletes.length, 0, 'còn data thì tuyệt đối không xóa');
  assert.ok(String(res).indexOf('KHÔNG xóa') >= 0);
});
