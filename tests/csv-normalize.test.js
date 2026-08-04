/**
 * tests/csv-normalize.test.js — Node thuần (không cần GAS)
 * Test: parseCsvToStaff, normalizeStaffName/Id, buildStaffIndex, filterStaffByGroup, distinctValues
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const CsvUtil = require('../CsvUtil.gs');

const FIXTURE = path.join(__dirname, '..', 'test-fixtures', 'Att.sample.csv');

test('normalizeStaffName: trim + gộp double-space', () => {
  assert.equal(CsvUtil.normalizeStaffName('  Đào   Quang  Hà  '), 'Đào Quang Hà');
  assert.equal(CsvUtil.normalizeStaffName(undefined), '');
  assert.equal(CsvUtil.normalizeStaffName(null), '');
});

test('normalizeStaffId: trim + uppercase', () => {
  assert.equal(CsvUtil.normalizeStaffId('  ops237511 '), 'OPS237511');
  assert.equal(CsvUtil.normalizeStaffId(undefined), '');
});

test('splitCsvLine: cơ bản + quoted', () => {
  assert.deepEqual(CsvUtil.splitCsvLine('a,b,"c,d",e'), ['a', 'b', 'c,d', 'e']);
  assert.deepEqual(CsvUtil.splitCsvLine('"a""b",c'), ['a"b', 'c']);
});

test('parseCsvToStaff: parse fixture Att.sample.csv (12 dòng data)', () => {
  const csvText = fs.readFileSync(FIXTURE, 'utf8');
  const staff = CsvUtil.parseCsvToStaff(csvText);
  assert.equal(staff.length, 12);
  // staffId đã uppercase + trim
  assert.equal(staff[0].staffId, 'OPS000001');
  // slotCode giữ nguyên text
  assert.equal(staff[0].slotCode, '08:00-17:00');
  assert.equal(staff[6].slotCode, '22:00-06:00');
  // station/team
  assert.equal(staff[0].station, 'HN2 SOC');
  assert.equal(staff[0].team, 'Outbound');
  // cardIn/cardOut
  assert.equal(staff[0].cardIn, '7:57:01');
  assert.equal(staff[0].cardOut, '');
  assert.equal(staff[7].cardOut, '6:03:03');
});

test('parseCsvToStaff: bỏ dòng trống + header-only', () => {
  assert.equal(CsvUtil.parseCsvToStaff('').length, 0);
  assert.equal(CsvUtil.parseCsvToStaff('No.,Date,Staff ID\n').length, 0);
});

test('buildStaffIndex: map theo header sheet', () => {
  const csvText = fs.readFileSync(FIXTURE, 'utf8');
  const staff = CsvUtil.parseCsvToStaff(csvText);
  // Mô phỏng getValues(): header + rows (chỉ cột cần thiết)
  const header = ['No.', 'Date', 'Staff ID', 'Staff Name', 'Staff Email', 'Agency', 'Contract Type', 'Event ID', 'Matching Type', 'Gender', 'Department', 'Clock In Time', 'Clock Out Time', 'Actual Hours', 'Clock In Remark', 'Clock Out Remark', 'Slot Code', 'Workstation', 'Team', 'Station'];
  const values = [header];
  staff.forEach((s) => {
    values.push([s.no, s.date, s.staffId, s.staffName, s.staffEmail, s.agency, s.contractType, s.eventId, s.matchingType, s.gender, s.department, s.cardIn, s.cardOut, s.actualHours, s.cardInRemark, s.cardOutRemark, s.slotCode, s.workstation, s.team, s.station]);
  });
  const index = CsvUtil.buildStaffIndex(values);
  assert.equal(Object.keys(index).length, 12);
  assert.equal(index['OPS000001'].staffName, 'NhanVien Mau 001');
  assert.equal(index['OPS000001'].station, 'HN2 SOC');
});

test('filterStaffByGroup: lọc theo station+slotCode+team', () => {
  const csvText = fs.readFileSync(FIXTURE, 'utf8');
  const staff = CsvUtil.parseCsvToStaff(csvText);
  const morning = CsvUtil.filterStaffByGroup(staff, { station: 'HN2 SOC', slotCode: '08:00-17:00', team: 'Outbound' });
  assert.equal(morning.length, 6); // dòng 1-6 (Ops000001..000006)
  const night = CsvUtil.filterStaffByGroup(staff, { station: 'HN2 SOC', slotCode: '22:00-06:00', team: 'Outbound' });
  assert.equal(night.length, 3); // dòng 8-10 (000008..000010) — dòng 7 (000007) team rỗng
  const receiving = CsvUtil.filterStaffByGroup(staff, { station: 'HN2 SOC', slotCode: '13:00-22:00', team: 'Inbound' });
  assert.equal(receiving.length, 2); // dòng 11-12
  const empty = CsvUtil.filterStaffByGroup(staff, { station: 'HN SOC', slotCode: '08:00-17:00', team: 'Outbound' });
  assert.equal(empty.length, 0);
});

test('buildStaffListFromValues: parse trực tiếp mảng 2D, giữ mọi dòng NV nhiều ca', () => {
  const header = ['No.', 'Date', 'Staff ID', 'Staff Name', 'Staff Email', 'Agency', 'Contract Type', 'Event ID', 'Matching Type', 'Gender', 'Department', 'Clock In Time', 'Clock Out Time', 'Actual Hours', 'Clock In Remark', 'Clock Out Remark', 'Slot Code', 'Workstation', 'Team', 'Station'];
  const values = [
    header,
    ['1', '8/1/2026', 'ops000001', 'Nguyen  Van A', '', 'GRG', 'OS', 'EV1', '', '', 'SOC', '7:57:01', '', '7.6', '', '', '08:00-17:00', 'OBLoading', 'Outbound', 'HN2 SOC'],
    ['2', '8/1/2026', 'OPS000001', 'Nguyen, Van A (2)', '', 'GRG', 'OS', 'EV2', '', '', 'SOC', '13:00:00', '', '7.6', '', '', '13:00-22:00', 'IBReceiving', 'Inbound', 'HN2 SOC'],
    ['3', '8/1/2026', '', 'NoId', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
  ];
  const list = CsvUtil.buildStaffListFromValues(values);
  assert.equal(list.length, 2); // dòng thiếu staffId bị bỏ
  // staffId normalize uppercase, tên chuẩn hóa
  assert.equal(list[0].staffId, 'OPS000001');
  assert.equal(list[0].staffName, 'Nguyen Van A');
  // Dòng 2 cùng staffId nhưng ca khác — KHÔNG bị mất (khác buildStaffIndex dedupe)
  assert.equal(list[1].staffId, 'OPS000001');
  assert.equal(list[1].slotCode, '13:00-22:00');
  assert.equal(list[1].team, 'Inbound');
  // Giá trị chứa dấu phẩy trong tên không làm hỏng parse
  assert.equal(list[1].staffName, 'Nguyen, Van A (2)');
});

test('buildStaffListFromValues: header sai → trả []', () => {
  assert.equal(CsvUtil.buildStaffListFromValues([['Wrong', 'Header']]).length, 0);
  assert.equal(CsvUtil.buildStaffListFromValues(null).length, 0);
});

test('distinctValues: distinct + sort + filter theo field', () => {
  const csvText = fs.readFileSync(FIXTURE, 'utf8');
  const staff = CsvUtil.parseCsvToStaff(csvText);
  const stations = CsvUtil.distinctValues(staff, 'station');
  assert.deepEqual(stations, ['HN2 SOC']);
  const slotCodes = CsvUtil.distinctValues(staff, 'slotCode');
  assert.deepEqual(slotCodes, ['08:00-17:00', '13:00-22:00', '22:00-06:00']);
  const teams = CsvUtil.distinctValues(staff, 'team', 'slotCode', '08:00-17:00');
  assert.deepEqual(teams, ['Outbound']);
});

test('isValidBarcodeId: chỉ chấp nhận mã bắt đầu "Ops" (case-insensitive)', () => {
  assert.equal(CsvUtil.isValidBarcodeId('ops229444'), true);
  assert.equal(CsvUtil.isValidBarcodeId('OPS229444'), true);
  assert.equal(CsvUtil.isValidBarcodeId('Ops 229444'), true);
  assert.equal(CsvUtil.isValidBarcodeId('229444'), false);
  assert.equal(CsvUtil.isValidBarcodeId('NV003'), false);
  assert.equal(CsvUtil.isValidBarcodeId(''), false);
  assert.equal(CsvUtil.isValidBarcodeId(null), false);
  assert.equal(CsvUtil.isValidBarcodeId(undefined), false);
});

test('dedupeStaffByGroup: dedupe theo staffId trong cùng tổ hợp, giữ dòng đầu', () => {
  const list = [
    { staffId: 'OPS196935', staffName: 'A', slotCode: '08:00-17:00', team: 'Outbound', station: 'HN2 SOC' },
    { staffId: 'OPS196935', staffName: 'A (dòng 2)', slotCode: '08:00-17:00', team: 'Outbound', station: 'HN2 SOC' },
    { staffId: 'OPS229444', staffName: 'B', slotCode: '08:00-17:00', team: 'Outbound', station: 'HN2 SOC' },
    { staffId: 'OPS229444', staffName: 'B (dòng 2)', slotCode: '08:00-17:00', team: 'Outbound', station: 'HN2 SOC' },
    { staffId: 'OPS127281', staffName: 'C', slotCode: '08:00-17:00', team: 'Outbound', station: 'HN2 SOC' },
  ];
  const deduped = CsvUtil.dedupeStaffByGroup(list);
  assert.equal(deduped.length, 3);
  assert.equal(deduped[0].staffId, 'OPS196935');
  assert.equal(deduped[0].staffName, 'A'); // giữ dòng đầu tiên
  assert.equal(deduped[1].staffId, 'OPS229444');
  assert.equal(deduped[2].staffId, 'OPS127281');
});

test('dedupeStaffByGroup: giữ NV nhiều ca khác nhau (không dedupe toàn cục)', () => {
  const list = [
    { staffId: 'OPS000001', slotCode: '08:00-17:00', team: 'Outbound', station: 'HN2 SOC' },
    { staffId: 'OPS000001', slotCode: '13:00-22:00', team: 'Inbound', station: 'HN2 SOC' },
    { staffId: 'OPS000002', slotCode: '08:00-17:00', team: 'Outbound', station: 'HN2 SOC' },
  ];
  // Flow thật: filterStaffByGroup trước (1 tổ hợp) → dedupe sau. NV 2 ca khác nhau
  // qua filter chỉ còn dòng đúng tổ hợp → dedupe không gộp nhầm ca khác.
  const filtered = CsvUtil.filterStaffByGroup(list, { station: 'HN2 SOC', slotCode: '08:00-17:00', team: 'Outbound' });
  assert.equal(filtered.length, 2);
  const deduped = CsvUtil.dedupeStaffByGroup(filtered);
  assert.equal(deduped.length, 2);
});

test('dedupeStaffByGroup: input null/empty → []', () => {
  assert.equal(CsvUtil.dedupeStaffByGroup(null).length, 0);
  assert.equal(CsvUtil.dedupeStaffByGroup([]).length, 0);
});

test('filterStaffByGroup: MULTI-select teams+slots (mảng)', () => {
  const staff = [
    { staffId: 'OPS000001', slotCode: '08:00-17:00', team: 'Inbound', station: 'HN2 SOC' },
    { staffId: 'OPS000002', slotCode: '13:00-22:00', team: 'Outbound', station: 'HN2 SOC' },
    { staffId: 'OPS000003', slotCode: '08:00-17:00', team: 'Outbound', station: 'HN2 SOC' },
    { staffId: 'OPS000004', slotCode: '18:00-02:00', team: 'Inbound', station: 'HN2 SOC' },
  ];
  const r = CsvUtil.filterStaffByGroup(staff, { station: 'HN2 SOC', slotCode: ['08:00-17:00', '13:00-22:00'], team: ['Inbound', 'Outbound'] });
  // Loại OPS000004 (slot 18:00 không chọn) — còn 3
  assert.equal(r.length, 3);
  // Chỉ team Inbound + cả slot
  const r2 = CsvUtil.filterStaffByGroup(staff, { station: 'HN2 SOC', slotCode: ['08:00-17:00', '18:00-02:00'], team: ['Inbound'] });
  assert.equal(r2.length, 2); // OPS000001 + OPS000004
});

test('normalizeStaffDate_: raw dd/mm/yyyy → yyyy-MM-dd (ISO)', () => {
  assert.equal(CsvUtil.normalizeStaffDate_('8/1/2026'), '2026-01-08');
  assert.equal(CsvUtil.normalizeStaffDate_('26-07-2026'), '2026-07-26');
  assert.equal(CsvUtil.normalizeStaffDate_('13/12/2026'), '2026-12-13');
  assert.equal(CsvUtil.normalizeStaffDate_(''), '');
  assert.equal(CsvUtil.normalizeStaffDate_(null), '');
  // đã chuẩn rồi → giữ nguyên (idempotent)
  assert.equal(CsvUtil.normalizeStaffDate_('2026-01-08'), '2026-01-08');
  // không match → trả nguyên
  assert.equal(CsvUtil.normalizeStaffDate_('abc'), 'abc');
});

test('buildStaffIndex/buildStaffListFromValues: date chuẩn hóa yyyy-MM-dd', () => {
  const values = [
    ['No.', 'Date', 'Staff ID', 'Staff Name', 'Slot Code', 'Team', 'Station'],
    ['1', '8/1/2026', 'OPS000001', 'Nguyen Van A', '08:00-17:00', 'Inbound', 'HN2 SOC'],
    ['2', '26-07-2026', 'OPS000002', 'Tran Thi B', '13:00-22:00', 'Outbound', 'HN2 SOC'],
  ];
  const idx = CsvUtil.buildStaffIndex(values);
  assert.equal(idx['OPS000001'].date, '2026-01-08');
  assert.equal(idx['OPS000002'].date, '2026-07-26');
  const list = CsvUtil.buildStaffListFromValues(values);
  assert.equal(list[0].date, '2026-01-08');
  assert.equal(list[1].date, '2026-07-26');
});
