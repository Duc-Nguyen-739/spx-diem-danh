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

// ===== Meal-move tests (2026-08-04) =====
// classifyMealMoveScan: 2 mốc Ra→Vào, rule 10s chống trùng, NV lạ=Thừa

const MM_CFG = {
  STATUS: { PENDING: '-', PRESENT: 'Có mặt', ABSENT: 'Vắng', EXTRA: 'Dư', OUT: 'Ra ngoài' },
  TASK_STATUS: { OPEN: 'open', DONE: 'done' },
  DUPLICATE_WINDOW_MS: 10000,
};

function mmRow(overrides) {
  return Object.assign({
    taskId: 'M20260804-1200',
    staffId: 'OPS000001',
    staffName: 'NhanVien Mau 001',
    slotCode: '08:00-17:00',
    station: 'HN2 SOC',
    team: 'Outbound',
    agency: 'SPX',
    timeRaEpoch: 0,
    timeScanEpoch: 0,
    status: MM_CFG.STATUS.PENDING,
  }, overrides || {});
}

test('meal-move: lần 1 mode Ra → ghi Ra, status OUT', () => {
  const task = { taskId: 'M1', status: 'open', taskType: 'meal-move' };
  const rows = [mmRow()];
  const r = ScanLogic.classifyMealMoveScan(MM_CFG, task, rows, 'OPS000001', 'ra', 1000000);
  assert.equal(r.action, 'update');
  assert.equal(r.status, MM_CFG.STATUS.OUT);
  assert.equal(r.scanPhase, 'ra');
  assert.equal(r.reason, null);
});

test('meal-move: trùng trong 10s → reject duplicate', () => {
  const task = { taskId: 'M1', status: 'open', taskType: 'meal-move' };
  // Đã có Ra lúc t=1000000, quét lại lúc t=1000000+5000 (5s < 10s)
  const rows = [mmRow({ timeRaEpoch: 1000000, status: MM_CFG.STATUS.OUT })];
  const r = ScanLogic.classifyMealMoveScan(MM_CFG, task, rows, 'OPS000001', 'ra', 1000000 + 5000);
  assert.equal(r.action, 'reject');
  assert.equal(r.reason, 'duplicate');
});

test('meal-move: sau 10s mode Vào → ghi Vào, status PRESENT', () => {
  const task = { taskId: 'M1', status: 'open', taskType: 'meal-move' };
  // Ra lúc t=1000000, Vào lúc t=1000000+15000 (15s > 10s)
  const rows = [mmRow({ timeRaEpoch: 1000000, status: MM_CFG.STATUS.OUT })];
  const r = ScanLogic.classifyMealMoveScan(MM_CFG, task, rows, 'OPS000001', 'vao', 1000000 + 15000);
  assert.equal(r.action, 'update');
  assert.equal(r.status, MM_CFG.STATUS.PRESENT);
  assert.equal(r.scanPhase, 'vao');
});

test('meal-move: đã đủ Ra+Vào → reject already-scanned', () => {
  const task = { taskId: 'M1', status: 'open', taskType: 'meal-move' };
  const rows = [mmRow({ timeRaEpoch: 1000000, timeScanEpoch: 2000000, status: MM_CFG.STATUS.PRESENT })];
  const r = ScanLogic.classifyMealMoveScan(MM_CFG, task, rows, 'OPS000001', 'vao', 3000000);
  assert.equal(r.action, 'reject');
  assert.equal(r.reason, 'already-scanned');
});

test('meal-move: quên quét Ra, mode Vào → đánh Thừa (EXTRA)', () => {
  const task = { taskId: 'M1', status: 'open', taskType: 'meal-move' };
  // NV trong roster nhưng chưa có Ra, quét Vào → Thừa
  const rows = [mmRow({ timeRaEpoch: 0, timeScanEpoch: 0, status: MM_CFG.STATUS.PENDING })];
  const r = ScanLogic.classifyMealMoveScan(MM_CFG, task, rows, 'OPS000001', 'vao', 1000000);
  assert.equal(r.action, 'update');
  assert.equal(r.status, MM_CFG.STATUS.EXTRA);
  assert.equal(r.scanPhase, 'vao');
});

test('meal-move: NV lạ (không trong roster, không trong StaffData) → append EXTRA', () => {
  const task = { taskId: 'M1', status: 'open', taskType: 'meal-move' };
  const rows = [mmRow({ staffId: 'OPS000001' })];
  // Quét mã khác không có trong rows + KHÔNG trong StaffData (staffInfo=null)
  const r = ScanLogic.classifyMealMoveScan(MM_CFG, task, rows, 'OPS999999', 'ra', 1000000, null);
  assert.equal(r.action, 'append');
  assert.equal(r.status, MM_CFG.STATUS.EXTRA);
  assert.equal(r.scanPhase, 'ra');
});

test('meal-move: NV hợp lệ (trong StaffData) paste Ra vào task trống → append OUT (ghi Ra)', () => {
  const task = { taskId: 'M1', status: 'open', taskType: 'meal-move' };
  const rows = [];  // task trống — log rỗng
  const staffInfo = { staffId: 'OPS7562', staffName: 'NGUYỄN VĂN ĐỨC', slotCode: '13:00-22:00', station: 'HN2 SOC', team: 'Inbound', agency: 'SPX' };
  const r = ScanLogic.classifyMealMoveScan(MM_CFG, task, rows, 'OPS7562', 'ra', 1000000, staffInfo);
  assert.equal(r.action, 'append');
  assert.equal(r.status, MM_CFG.STATUS.OUT);  // Ra hợp lệ → OUT, KHÔNG phải EXTRA
  assert.equal(r.scanPhase, 'ra');
  assert.equal(r.staffInfo, staffInfo);
});

test('meal-move: NV hợp lệ paste Vào vào task trống (chưa có Ra) → append EXTRA (thiếu Ra)', () => {
  const task = { taskId: 'M1', status: 'open', taskType: 'meal-move' };
  const rows = [];
  const staffInfo = { staffId: 'OPS123', staffName: 'NV Test', agency: 'SPX' };
  const r = ScanLogic.classifyMealMoveScan(MM_CFG, task, rows, 'OPS123', 'vao', 1000000, staffInfo);
  assert.equal(r.action, 'append');
  assert.equal(r.status, MM_CFG.STATUS.EXTRA);  // thiếu Ra → Thừa
  assert.equal(r.scanPhase, 'vao');
});

test('meal-move: task đóng → reject task-closed', () => {
  const task = { taskId: 'M1', status: 'done', taskType: 'meal-move' };
  const rows = [mmRow()];
  const r = ScanLogic.classifyMealMoveScan(MM_CFG, task, rows, 'OPS000001', 'ra', 1000000);
  assert.equal(r.action, 'reject');
  assert.equal(r.reason, 'task-closed');
});

test('meal-move: đã có Ra, mode vẫn Ra → reject already-scanned', () => {
  const task = { taskId: 'M1', status: 'open', taskType: 'meal-move' };
  const rows = [mmRow({ timeRaEpoch: 1000000, status: MM_CFG.STATUS.OUT })];
  // Sau 10s, mode vẫn Ra → không cho quét Ra lần 2
  const r = ScanLogic.classifyMealMoveScan(MM_CFG, task, rows, 'OPS000001', 'ra', 1000000 + 15000);
  assert.equal(r.action, 'reject');
  assert.equal(r.reason, 'already-scanned');
});

test('meal-move: buildMealMoveExtraRow mode Ra + status OUT → có timeRa, không timeScan', () => {
  const now = new Date('2026-08-04T12:00:00');
  const staffInfo = { staffName: 'NV Test', slotCode: '08:00-17:00', station: 'HN2 SOC', team: 'T1', agency: 'SPX' };
  const row = ScanLogic.buildMealMoveExtraRow(MM_CFG, 'M1', 'OPS099', staffInfo, 'ra', now, MM_CFG.STATUS.OUT);
  assert.equal(row.status, MM_CFG.STATUS.OUT);
  assert.equal(row.timeRa, now);
  assert.equal(row.timeRaEpoch, now.getTime());
  assert.equal(row.timeScan, null);
  assert.equal(row.timeScanEpoch, 0);
  assert.equal(row.agency, 'SPX');
});

test('meal-move: buildMealMoveExtraRow mode Vào → có timeScan, không timeRa', () => {
  const now = new Date('2026-08-04T13:00:00');
  const row = ScanLogic.buildMealMoveExtraRow(MM_CFG, 'M1', 'OPS099', null, 'vao', now);
  assert.equal(row.status, MM_CFG.STATUS.EXTRA);
  assert.equal(row.timeScan, now);
  assert.equal(row.timeScanEpoch, now.getTime());
  assert.equal(row.timeRaEpoch, 0);
  assert.equal(row.staffName, '');
});
