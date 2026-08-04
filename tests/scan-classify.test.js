/**
 * tests/scan-classify.test.js — Node thuần (không cần GAS)
 * Test: classifyScan, computeCounters, buildExtraRow (ScanLogic.gs)
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const ScanLogic = require('../ScanLogic.gs');

const CFG = {
  STATUS: { PRESENT: 'Có mặt', ABSENT: 'Vắng', EXTRA: 'Dư' },
  TASK_STATUS: { OPEN: 'open', DONE: 'done' },
};

function makeRow(overrides) {
  return Object.assign({
    taskId: 'R20260802-0730',
    staffId: 'OPS000001',
    staffName: 'NhanVien Mau 001',
    slotCode: '08:00-17:00',
    station: 'HN2 SOC',
    team: 'Outbound',
    workstation: 'OBLoading',
    cardIn: '7:57:01',
    cardOut: '',
    timeRef: new Date('2026-08-02T07:30:00'),
    timeScan: null,
    timeScanEpoch: 0,   // P2: epoch là nguồn sự thật — scanned khi >0
    status: CFG.STATUS.ABSENT,
  }, overrides || {});
}

test('classifyScan: task closed → reject task-closed', () => {
  const task = { taskId: 'R1', status: CFG.TASK_STATUS.DONE };
  const res = ScanLogic.classifyScan(CFG, task, [makeRow()], 'OPS000001');
  assert.equal(res.action, 'reject');
  assert.equal(res.reason, 'task-closed');
});

test('classifyScan: empty staffId → reject', () => {
  const task = { taskId: 'R1', status: CFG.TASK_STATUS.OPEN };
  const res = ScanLogic.classifyScan(CFG, task, [makeRow()], '');
  assert.equal(res.action, 'reject');
  assert.equal(res.reason, 'empty-staff-id');
});

test('classifyScan: NV trong log + chưa quét → update PRESENT', () => {
  const task = { taskId: 'R1', status: CFG.TASK_STATUS.OPEN };
  const res = ScanLogic.classifyScan(CFG, task, [makeRow()], 'ops000001');
  assert.equal(res.action, 'update');
  assert.equal(res.status, CFG.STATUS.PRESENT);
  assert.equal(res.row.staffId, 'OPS000001');
});

test('classifyScan: NV trong log + đã quét → reject already-scanned', () => {
  const task = { taskId: 'R1', status: CFG.TASK_STATUS.OPEN };
  const scanned = makeRow({ timeScan: new Date('2026-08-02T07:45:00'), timeScanEpoch: 1783082700000, status: CFG.STATUS.PRESENT });
  const res = ScanLogic.classifyScan(CFG, task, [scanned], 'OPS000001');
  assert.equal(res.action, 'reject');
  assert.equal(res.reason, 'already-scanned');
});

test('classifyScan: NV không trong log → append EXTRA (khớp tổ hợp nhưng chưa pre-fill)', () => {
  const task = { taskId: 'R1', status: CFG.TASK_STATUS.OPEN };
  const rows = [makeRow()]; // chỉ có OPS000001
  const res = ScanLogic.classifyScan(CFG, task, rows, 'OPS000099');
  assert.equal(res.action, 'append');
  assert.equal(res.status, CFG.STATUS.EXTRA);
});

test('classifyScan: NV không trong log + khác tổ hợp → append EXTRA (không còn Trễ)', () => {
  const task = { taskId: 'R1', status: CFG.TASK_STATUS.OPEN };
  const res = ScanLogic.classifyScan(CFG, task, [makeRow()], 'OPS000050');
  assert.equal(res.action, 'append');
  assert.equal(res.status, CFG.STATUS.EXTRA);
});

test('findLogRow: case-insensitive', () => {
  const rows = [makeRow()];
  assert.ok(ScanLogic.findLogRow(rows, 'ops000001'));
  assert.ok(ScanLogic.findLogRow(rows, 'OPS000001'));
  assert.equal(ScanLogic.findLogRow(rows, 'OPS999999'), null);
});

test('computeCounters: quy ước đã chốt', () => {
  const rows = [
    makeRow({ staffId: 'OPS000001', timeScanEpoch: 1700000000000, status: CFG.STATUS.PRESENT }), // scanned
    makeRow({ staffId: 'OPS000002', timeScanEpoch: 0, status: CFG.STATUS.ABSENT }),       // absent
    makeRow({ staffId: 'OPS000003', timeScanEpoch: 1700000000001, status: CFG.STATUS.EXTRA }), // scanned + extra
    makeRow({ staffId: 'OPS000004', timeScanEpoch: 0, status: CFG.STATUS.ABSENT }),       // absent
  ];
  const c = ScanLogic.computeCounters(CFG, rows);
  assert.equal(c.scanned, 2);   // Có mặt + Dư
  assert.equal(c.absent, 2);    // pre-fill chưa quét
  assert.equal(c.extra, 1);     // status EXTRA
  assert.equal(c.total, 4);
});

test('buildExtraRow: tạo dòng Dư với thông tin staff nếu có', () => {
  const now = new Date('2026-08-02T08:00:00');
  const staffInfo = {
    staffName: 'NhanVien Mau 099', slotCode: '13:00-22:00', station: 'HN2 SOC',
    team: 'Inbound', workstation: 'IBReceiving', cardIn: '12:00:00', cardOut: '',
  };
  const row = ScanLogic.buildExtraRow(CFG, 'R1', 'OPS000099', staffInfo, now);
  assert.equal(row.status, CFG.STATUS.EXTRA);
  assert.equal(row.staffName, 'NhanVien Mau 099');
  assert.equal(row.timeScan, now);
  assert.equal(row.timeScanEpoch, now.getTime());  // simplify: append phải có epoch → counter scanned=1
  assert.equal(row.timeRef, null);
  // computeCounters phải đếm NV vừa append là scanned=1 (không phải 0)
  const c = ScanLogic.computeCounters(CFG, [row]);
  assert.equal(c.scanned, 1);
  assert.equal(c.extra, 1);
  // Không có staffInfo → các trường rỗng, không crash
  const row2 = ScanLogic.buildExtraRow(CFG, 'R1', 'OPS999999', null, now);
  assert.equal(row2.staffName, '');
  assert.equal(row2.status, CFG.STATUS.EXTRA);
});
