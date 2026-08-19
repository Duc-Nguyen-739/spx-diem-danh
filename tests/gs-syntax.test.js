/**
 * tests/gs-syntax.test.js — syntax-check TẤT CẢ file .gs (GAS server).
 *
 * BUG 2026-08-19: commit cf84ca9 đổi console.log → Logger.log(JSON.stringify(...))
 * bằng sed thiếu 1 dấu ngoặc đóng → GAS reject clasp push với "Syntax error:
 * missing ) after argument list file: ScanService.gs" → 2 workflow run deploy
 * FAIL (174, 175). npm test vẫn pass vì không test nào load nguyên file .gs.
 * GAS server code KHÔNG chạy được trên Node (phụ thuộc LockService/SpreadsheetApp)
 * → dùng new Function(src) để parse syntax (function body chấp nhận const/function).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const GS_FILES = [
  'Code.gs', 'Config.gs', 'Database.gs', 'JsonpApi.gs', 'ScanLogic.gs',
  'ScanService.gs', 'TaskService.gs', 'TaskSearch.gs', 'CsvUtil.gs', 'CacheLayer.gs',
];

test('mọi file .gs parse không lỗi syntax (regression bug 2026-08-19 clasp push)', () => {
  GS_FILES.forEach((f) => {
    const src = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    assert.doesNotThrow(() => new Function(src), `${f} có lỗi syntax — GAS sẽ reject clasp push`);
  });
});