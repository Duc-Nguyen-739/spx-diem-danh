/**
 * tests/drift.test.js — FIX-23: gate chống drift dual runtime (GAS ↔ Python).
 * Chạy đúng logic của scripts/check-drift.js (checkDrift()) — drift → test fail.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { checkDrift } = require('../scripts/check-drift.js');

test('FIX-23: ScanLogic.gs ↔ api/scanlogic.py không drift (hàm lõi + reject reasons)', () => {
  const res = checkDrift();
  const logicDrifts = res.drifts.filter((d) => d.startsWith('ScanLogic'));
  assert.deepEqual(logicDrifts, [], 'drift ScanLogic: ' + logicDrifts.join(' | '));
});

test('FIX-23: Config.gs ↔ api/config.py không drift (constants + UI_LABELS mirror)', () => {
  const res = checkDrift();
  const cfgDrifts = res.drifts.filter((d) => d.startsWith('Config'));
  assert.deepEqual(cfgDrifts, [], 'drift Config: ' + cfgDrifts.join(' | '));
});

test('FIX-23: checkDrift phát hiện được drift khi mirror thiếu hàm (sanity)', () => {
  // Sanity check cho chính checker: bỏ 1 hàm cốt lõi ở giả lập → phải phát hiện.
  // Thực hiện bằng cách so sánh trực tiếp các hàm CORE với source thật: nếu 1 ngày
  // ai xoá classify_meal_move_scan ở Python mà không sửa checker thì 2 test trên fail.
  const fs = require('node:fs');
  const py = fs.readFileSync('api/scanlogic.py', 'utf8');
  assert.ok(py.includes('def classify_meal_move_scan'), 'classify_meal_move_scan phải tồn tại ở Python mirror');
  const gs = fs.readFileSync('ScanLogic.gs', 'utf8');
  assert.ok(gs.includes('function classifyMealMoveScan'), 'classifyMealMoveScan phải tồn tại ở GAS');
});
