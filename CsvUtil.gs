/**
 * CsvUtil.gs — Parse + normalize dữ liệu csv hệ thống (định dạng Att.csv)
 *
 * LOGIC THUẦN — KHÔNG gọi GAS API (SpreadsheetApp/CacheService...).
 * → Test được trên Node: `node --test tests/csv-normalize.test.js`
 * GAS bỏ qua khối `module.exports` (không có global `module` trong V8 runtime).
 */

/**
 * Map header cột csv → field tiếng Anh.
 * Dùng cho sheet StaffData (giữ nguyên header Att.csv) và parse raw csv.
 */
const CSV_HEADER_FIELD = {
  'No.': 'no',
  'Date': 'date',
  'Staff ID': 'staffId',
  'Staff Name': 'staffName',
  'Staff Email': 'staffEmail',
  'Agency': 'agency',
  'Contract Type': 'contractType',
  'Event ID': 'eventId',
  'Matching Type': 'matchingType',
  'Gender': 'gender',
  'Department': 'department',
  'Clock In Time': 'cardIn',
  'Clock Out Time': 'cardOut',
  'Actual Hours': 'actualHours',
  'Clock In Remark': 'cardInRemark',
  'Clock Out Remark': 'cardOutRemark',
  'Slot Code': 'slotCode',
  'Workstation': 'workstation',
  'Team': 'team',
  'Station': 'station',
};

/**
 * Chuẩn hóa tên NV: trim + gộp nhiều khoảng trắng (v1 bug: "Đào  Quang  Hà").
 * @param {string} name
 * @returns {string}
 */
function normalizeStaffName(name) {
  if (name === undefined || name === null) return '';
  return String(name).replace(/\s+/g, ' ').trim();
}

/**
 * Chuẩn hóa staffId: trim + uppercase (để so khớp case-insensitive).
 * @param {string} id
 * @returns {string}
 */
function normalizeStaffId(id) {
  if (id === undefined || id === null) return '';
  return String(id).trim().toUpperCase();
}

/**
 * Chuẩn hóa ngày vào làm (StaffData 'Date') về yyyy-MM-dd (ISO — sort string đúng
 * thứ tự). StaffData có 3 dạng:
 *  - Date object thật (cell sheet là ngày → getValues trả Date): "Mon Aug 03 2026..."
 *  - String "8/1/2026" / "26-07-2026"
 * normalize NGAY tại nguồn parse để dropdown/filter/log nhất quán.
 * KHÔNG dùng Utilities.formatDate (CsvUtil pure — Node test chạy được).
 * @param {*} date
 * @returns {string}
 */
function normalizeStaffDate_(date) {
  if (date === undefined || date === null) return '';
  // Dạng 1: Date object thật — format trực tiếp (getFullYear/getMonth/getDate local)
  if (date instanceof Date && !isNaN(date.getTime())) {
    return date.getFullYear() + '-'
      + ('0' + (date.getMonth() + 1)).slice(-2) + '-'
      + ('0' + date.getDate()).slice(-2);
  }
  const s = String(date).trim();
  // Dạng 2: "8/1/2026" / "26-07-2026" / "2026-01-08"
  const m = s.match(/^(\d{1,2})[/\-.]?(\d{1,2})[/\-.]?(\d{2,4})$/);
  if (m) {
    const dd = ('0' + m[1]).slice(-2);
    const mm = ('0' + m[2]).slice(-2);
    const yy = m[3].length === 2 ? '20' + m[3] : m[3];
    return yy + '-' + mm + '-' + dd;
  }
  // Dạng 3: string kiểu JS "Mon Aug 03 2026 00:00:00 GMT+0700 (Indochina Time)"
  const dt = new Date(s);
  if (!isNaN(dt.getTime())) {
    return dt.getFullYear() + '-'
      + ('0' + (dt.getMonth() + 1)).slice(-2) + '-'
      + ('0' + dt.getDate()).slice(-2);
  }
  return s;
}

/**
 * Chỉ chấp nhận mã barcode NV bắt đầu "Ops" (case-insensitive).
 * @param {string} id
 * @returns {boolean}
 */
function isValidBarcodeId(id) {
  if (id === undefined || id === null || id === '') return false;
  return /^ops/i.test(String(id).trim());
}

/**
 * Parse 1 dòng csv (split cơ bản, xử lý quoted field tối thiểu).
 * @param {string} line
 * @returns {string[]}
 */
function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(cur); cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

/**
 * Parse raw csv text → [{ header field: value }...] (bỏ dòng header).
 * Giá trị giữ nguyên text; riêng staffId/staffName được normalize.
 * @param {string} csvText
 * @returns {Array<Object>}
 */
function parseCsvToStaff(csvText) {
  const lines = String(csvText || '').split(/\r?\n/).filter(function (l) { return l.trim() !== ''; });
  if (lines.length < 2) return [];
  const header = splitCsvLine(lines[0]).map(function (h) { return h.trim(); });
  const fields = header.map(function (h) {
    return CSV_HEADER_FIELD[h] || h.toLowerCase().replace(/\s+/g, '');
  });
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const row = {};
    for (let c = 0; c < fields.length; c++) {
      row[fields[c]] = cells[c] !== undefined ? cells[c].trim() : '';
    }
    row.staffId = normalizeStaffId(row.staffId);
    row.staffName = normalizeStaffName(row.staffName);
    if (row.staffId) rows.push(row);
  }
  return rows;
}

/**
 * Đọc sheet StaffData (mảng 2D từ getValues) → map { staffId: staff }.
 * Skip dòng header; duplicate staffId → dòng sau thắng (dữ liệu mới nhất).
 * KHÁC dedupeStaffByGroup (giữ dòng đầu): index dùng cho staffInfo của NV lạ
 * (extra) — muốn thông tin mới nhất; dedupe dùng cho log pre-fill — chốt theo
 * dòng UI đã chọn. Hai mục đích, hai thứ tự — cố ý, không phải bug.
 * @param {Array<Array<*>>} values
 * @returns {Object<string, Object>}
 */
function buildStaffIndex(values) {
  const index = {};
  if (!values || values.length < 2) return index;
  const header = values[0].map(function (h) { return String(h === null || h === undefined ? '' : h).trim(); });
  const col = {};
  for (let c = 0; c < header.length; c++) {
    const f = CSV_HEADER_FIELD[header[c]];
    if (f) col[f] = c;
  }
  for (let r = 1; r < values.length; r++) {
    const v = values[r];
    const staffId = normalizeStaffId(v[col.staffId]);
    if (!staffId) continue;
    index[staffId] = {
      staffId: staffId,
      staffName: normalizeStaffName(v[col.staffName]),
      station: String(v[col.station] || '').trim(),
      slotCode: String(v[col.slotCode] || '').trim(),
      team: String(v[col.team] || '').trim(),
      workstation: String(v[col.workstation] || '').trim(),
      cardIn: String(v[col.cardIn] || '').trim(),
      cardOut: String(v[col.cardOut] || '').trim(),
      agency: String(v[col.agency] || '').trim(),
      date: normalizeStaffDate_(v[col.date]),  // ngày vào làm (StaffData 'Date' col) — chuẩn yyyy-MM-dd
    };
  }
  return index;
}

/**
 * Build staff list từ mảng 2D của sheet (getValues) — KHÔNG qua trung gian CSV text.
 * An toàn với giá trị chứa dấu phẩy/nháy (khác parseCsvToStaff phải join lại).
 * Trả list đầy đủ field (không dedupe theo staffId) để giữ mọi dòng NV nhiều ca.
 * @param {Array<Array<*>>} values — dòng 0 = header
 * @returns {Array<Object>}
 */
function buildStaffListFromValues(values) {
  const out = [];
  if (!values || values.length < 2) return out;
  const header = values[0].map(function (h) { return String(h === null || h === undefined ? '' : h).trim(); });
  const col = {};
  for (let c = 0; c < header.length; c++) {
    const f = CSV_HEADER_FIELD[header[c]];
    if (f) col[f] = c;
  }
  if (col.staffId === undefined) return out;
  for (let r = 1; r < values.length; r++) {
    const v = values[r];
    const staffId = normalizeStaffId(v[col.staffId]);
    if (!staffId) continue;
    out.push({
      no: String(v[col.no] || '').trim(),
      date: normalizeStaffDate_(v[col.date]),
      staffId: staffId,
      staffName: normalizeStaffName(v[col.staffName]),
      staffEmail: String(v[col.staffEmail] || '').trim(),
      agency: String(v[col.agency] || '').trim(),
      contractType: String(v[col.contractType] || '').trim(),
      eventId: String(v[col.eventId] || '').trim(),
      matchingType: String(v[col.matchingType] || '').trim(),
      gender: String(v[col.gender] || '').trim(),
      department: String(v[col.department] || '').trim(),
      cardIn: String(v[col.cardIn] || '').trim(),
      cardOut: String(v[col.cardOut] || '').trim(),
      actualHours: String(v[col.actualHours] || '').trim(),
      cardInRemark: String(v[col.cardInRemark] || '').trim(),
      cardOutRemark: String(v[col.cardOutRemark] || '').trim(),
      slotCode: String(v[col.slotCode] || '').trim(),
      workstation: String(v[col.workstation] || '').trim(),
      team: String(v[col.team] || '').trim(),
      station: String(v[col.station] || '').trim(),
    });
  }
  return out;
}

/**
 * Lọc danh sách NV theo tổ hợp (station, slotCode, team).
 * @param {Array<Object>} staffList — mảng từ parseCsvToStaff hoặc Object.values(staffIndex)
 * @param {{station: string, slotCode: string|string[], team: string|string[], date: string}} group
 * @returns {Array<Object>}
 */
// Chuẩn hóa giá trị filter thành mảng chuỗi (accept string|string[]|Array|undefined).
function toFilterArray_(val) {
  if (val === undefined || val === null) return [];
  if (Array.isArray(val)) {
    return val.map(function (v) { return String(v || '').trim(); }).filter(function (v) { return v; });
  }
  const s = String(val).trim();
  return s ? [s] : [];
}

function filterStaffByGroup(staffList, group) {
  const station = String((group && group.station) || '').trim();
  // Multi-select: teams/slots nhận mảng (mới) HOẶC string (tương thích cũ).
  const slots = toFilterArray_(group && group.slotCode);
  const teams = toFilterArray_(group && group.team);
  const date = String((group && group.date) || '').trim();  // ngay vao lam (optional)
  const contractTypes = toFilterArray_(group && group.contractType);
  return staffList.filter(function (s) {
    if (String(s.station || '').trim() !== station) return false;
    const sSlot = String(s.slotCode || '').trim();
    const sTeam = String(s.team || '').trim();
    const sContract = String(s.contractType || '').trim();
    if (slots.length && slots.indexOf(sSlot) === -1) return false;
    if (teams.length && teams.indexOf(sTeam) === -1) return false;
    if (date && String(s.date || '').trim() !== date) return false;
    if (contractTypes.length && contractTypes.indexOf(sContract) === -1) return false;
    return true;
  });
}

/**
 * P1: dedupe theo staffId trong 1 tổ hợp — giữ dòng ĐẦU TIÊN.
 * Att.csv thật có NV xuất hiện 2 dòng trong CÙNG tổ hợp (multi-line cùng ca/team/station).
 * Nếu không dedupe: log có 2 dòng cùng staffId → server chỉ update dòng đầu, dòng 2 bị
 * đánh 'Vắng' nhầm khi kết thúc (phantom absent); client row-key cũng đổ 2 dòng vào 1 <tr>.
 * KHÔNG dedupe toàn cục — NV có nhiều ca hợp lệ phải giữ nguyên.
 * KHÁC buildStaffIndex (dòng sau thắng — staffInfo mới nhất cho NV lạ):
 * dedupe giữ dòng ĐẦU vì log pre-fill chốt theo dòng UI đã chọn. Cố ý.
 * @param {Array<Object>} staffList — kết quả filterStaffByGroup (cùng tổ hợp)
 * @returns {Array<Object>}
 */
function dedupeStaffByGroup(staffList) {
  const seen = {};
  const out = [];
  (staffList || []).forEach(function (s) {
    if (!seen[s.staffId]) {
      seen[s.staffId] = true;
      out.push(s);
    }
  });
  return out;
}

/**
 * Lấy danh sách giá trị distinct của 1 cột (cho dropdown UI).
 * @param {Array<Object>} staffList
 * @param {string} field — 'station' | 'slotCode' | 'team'
 * @param {string} [filterField] — field lọc trước (vd 'station')
 * @param {string} [filterValue] — giá trị lọc
 * @returns {string[]}
 */
function distinctValues(staffList, field, filterField, filterValue) {
  const seen = {};
  const out = [];
  staffList.forEach(function (s) {
    if (filterField && String(s[filterField] || '').trim() !== String(filterValue || '').trim()) return;
    const val = String(s[field] || '').trim();
    if (val && !seen[val]) { seen[val] = true; out.push(val); }
  });
  return out.sort();
}

// ===== Node test support (GAS bỏ qua) =====
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CSV_HEADER_FIELD: CSV_HEADER_FIELD,
    normalizeStaffName: normalizeStaffName,
    normalizeStaffId: normalizeStaffId,
    normalizeStaffDate_: normalizeStaffDate_,
    isValidBarcodeId: isValidBarcodeId,
    splitCsvLine: splitCsvLine,
    parseCsvToStaff: parseCsvToStaff,
    buildStaffListFromValues: buildStaffListFromValues,
    buildStaffIndex: buildStaffIndex,
    filterStaffByGroup: filterStaffByGroup,
    dedupeStaffByGroup: dedupeStaffByGroup,
    distinctValues: distinctValues,
  };
}
