/**
 * tests/formula-injection.test.js — A1 (2026-08-23): chống formula injection.
 *
 * Chuỗi text client (note/station/team/createdBy — kiosk anonymous, ai cũng POST được)
 * bắt đầu bằng ký tự công thức (`= + - @ \t \r`) → Sheets parse thành công thức thực thi
 * khi ghi USER_ENTERED (vd `=IMPORTXML(...)` exfil dữ liệu sheet). Fix: prefix `'` để
 * Sheets coi là text thuần — áp dụng tại write boundary (sanitizeCellText_ GAS +
 * sanitize_cell_text Python, mirror nhau).
 *
 * Test này trích đúng hàm sanitizeCellText_ từ Database.gs (nơi GAS production chạy) và
 * chạy trong vm — verify behavior giữ nguyên khi chỉnh hàm. Test Python mirror nằm ở
 * api/test_database.py (test_formula_injection_sanitized_on_write).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'Database.gs'), 'utf8');

function extractSanitize() {
  const m = src.match(/function sanitizeCellText_\(value\) \{[\s\S]*?\n\}/);
  assert.ok(m, 'Database.gs phải chứa hàm sanitizeCellText_');
  return m[0];
}

function run(value) {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(extractSanitize(), ctx);
  return ctx.sanitizeCellText_(value);
}

test('A1: chuỗi bắt đầu = + - @ \t \r → prefix `\'`', () => {
  assert.equal(run('=1+2'), "'=1+2");
  assert.equal(run('+SUM(1,2)'), "'+SUM(1,2)");
  assert.equal(run('-cmd'), "'-cmd");
  assert.equal(run('@evil'), "'@evil");
  assert.equal(run('\tTAB'), "'\tTAB");
  assert.equal(run('\rCR'), "'\rCR");
});

test('A1: chuỗi bình thường → giữ nguyên (không đổi behavior)', () => {
  assert.equal(run('HN2 SOC'), 'HN2 SOC');
  assert.equal(run('Outbound'), 'Outbound');
  assert.equal(run('ghi chú thường'), 'ghi chú thường');
  assert.equal(run('=này thì ok?'), "'=này thì ok?");
  assert.equal(run(''), '');
  assert.equal(run(null), '');
  assert.equal(run(undefined), '');
});

test('A1: ký tự `=` không phải đầu chuỗi → không đổi', () => {
  assert.equal(run('a=b'), 'a=b');
  assert.equal(run('nhóm = Outbound'), 'nhóm = Outbound');
});
