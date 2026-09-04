/**
 * tests/task-list-slotcode.test.js — Cột "Ca" của task Điểm danh Ra/Vào.
 *
 * Task meal-move lưu slotCode '' ở sheet AttendanceTask → cột Ca trống.
 * Fix: readTaskList_ derive Ca từ slotCode các dòng log (distinct sort join),
 * chỉ fill khi task.slotCode trống (reconcile giữ nguyên).
 * Dual runtime: Database.gs taskSlotCodesForList_ + api/database.py mirror.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const gs = fs.readFileSync(path.join(__dirname, '..', 'Database.gs'), 'utf8');
const py = fs.readFileSync(path.join(__dirname, '..', 'api', 'database.py'), 'utf8');
const mock = fs.readFileSync(path.join(__dirname, '..', 'mock', 'mock-google.js'), 'utf8');

test('Database.gs: có taskSlotCodesForList_ đọc batch A2:D, group distinct sort join', () => {
  const start = gs.indexOf('function taskSlotCodesForList_(');
  assert.ok(start >= 0, 'phải có taskSlotCodesForList_');
  const block = gs.slice(start, gs.indexOf('\nfunction ', start + 1));
  assert.ok(block.indexOf('getRange(2, 1,') >= 0, 'đọc từ dòng 2 (bỏ header)');
  assert.ok(block.indexOf('LOG_COLS.SLOT_CODE') >= 0, 'đọc cột SLOT_CODE theo hằng số');
  assert.ok(block.indexOf('.sort().join(') >= 0, 'distinct sort join deterministic');
  assert.ok(block.indexOf('CACHE_KEYS.TASK_LIST_REV') >= 0, 'chung rev với list/counters');
  assert.ok(block.indexOf('getValue(') < 0 && block.indexOf('setValue(') < 0, 'batch, không loop cell');
});

test('Database.gs: readTaskList_ chỉ fill Ca khi task.slotCode trống', () => {
  const start = gs.indexOf('function readTaskList_(');
  assert.ok(start >= 0);
  const block = gs.slice(start, gs.indexOf('\nfunction ', start + 1));
  assert.ok(block.indexOf('taskSlotCodesForList_()') >= 0, 'readTaskList_ phải gọi taskSlotCodesForList_');
  assert.ok(block.indexOf('if (!t.slotCode') >= 0, 'chỉ fill khi trống — reconcile giữ nguyên');
});

test('api/database.py: mirror task_slot_codes_for_list + fill khi trống', () => {
  assert.ok(py.indexOf('def task_slot_codes_for_list(') >= 0, 'phải có task_slot_codes_for_list');
  assert.ok(py.indexOf('def _task_slot_codes_uncached(') >= 0, 'phải có _task_slot_codes_uncached');
  assert.ok(py.indexOf('range_="A2:D"') >= 0, 'đọc batch A2:D như GAS');
  assert.ok(py.indexOf('", ".join(sorted(s))') >= 0, 'distinct sort join như GAS');
  const listStart = py.indexOf('def _read_task_list_uncached(');
  assert.ok(listStart >= 0);
  const listBlock = py.slice(listStart, py.indexOf('\ndef ', listStart + 1));
  assert.ok(listBlock.indexOf('task_slot_codes_for_list()') >= 0, 'list phải merge slot_map');
  assert.ok(listBlock.indexOf('if not t["slotCode"]') >= 0, 'chỉ fill khi trống');
});

test('mock-google.js: getTaskListApi + searchStaffApi derive Ca cho task trống', () => {
  assert.ok(mock.indexOf('function mockTaskSlotCode(taskId)') >= 0, 'phải có helper mockTaskSlotCode');
  const listStart = mock.indexOf('getTaskListApi: function ()');
  assert.ok(listStart >= 0);
  const listBlock = mock.slice(listStart, mock.indexOf('getTaskDetailApi', listStart));
  assert.ok(listBlock.indexOf('mockTaskSlotCode') >= 0, 'getTaskListApi phải derive Ca');
  assert.ok(mock.indexOf('if (!merged.slotCode) merged.slotCode = mockTaskSlotCode') >= 0,
    'searchStaffApi phải derive Ca cho task lọc');
});

test('contract derive: distinct + trim + bỏ rỗng + sort + join ", "', () => {
  function derive(slots) {
    const seen = {};
    (slots || []).forEach(function (s) {
      const v = String(s || '').trim();
      if (v) seen[v] = true;
    });
    return Object.keys(seen).sort().join(', ');
  }
  assert.equal(derive(['08:00-17:00', '08:00-17:00', '18:00-02:00']), '08:00-17:00, 18:00-02:00');
  assert.equal(derive([' 18:00-02:00 ', '', '08:00-17:00']), '08:00-17:00, 18:00-02:00');
  assert.equal(derive([]), '');
  assert.equal(derive(['', '  ']), '');
  assert.equal(derive(['22:00-06:00']), '22:00-06:00');
});
