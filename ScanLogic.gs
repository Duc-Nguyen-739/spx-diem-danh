/**
 * ScanLogic.gs — Logic THUẦN phân loại quét + đếm counters.
 *
 * KHÔNG gọi GAS API — test được trên Node (`node --test tests/scan-classify.test.js`).
 * ScanService.gs (wrapper GAS) gọi các hàm này sau khi lấy dữ liệu từ Database.
 *
 * Dùng hằng số STATUS/TASK_STATUS từ Config.gs (global trong GAS).
 * Để Node test chạy được, file này KHÔNG require Config — các hằng số được
 * truyền vào qua tham số `cfg` (xem chữ ký hàm).
 */

/**
 * Phân loại 1 lần quét.
 *
 * @param {Object} cfg — { STATUS: {...}, TASK_STATUS: {...} } (từ Config.gs)
 * @param {Object} task — { taskId, status }
 * @param {Array<Object>} logRows — các dòng AttendanceLog của task (đã map theo LOG_COLS)
 * @param {string} staffId — mã NV đã normalize
 * @returns {{action: 'update'|'append'|'reject', status: string|null, reason: string|null, row: Object|null}}
 *   - update: NV trong log + chưa quét → ghi timeScan, status PRESENT
 *   - append: NV không trong log → thêm dòng mới, status EXTRA
 *   - reject reason 'task-closed': task không mở
 *   - reject reason 'already-scanned': NV đã điểm danh rồi
 */
function classifyScan(cfg, task, logRows, staffId) {
  if (!task || task.status !== cfg.TASK_STATUS.OPEN) {
    return { action: 'reject', status: null, reason: 'task-closed', row: null };
  }
  if (!staffId) {
    return { action: 'reject', status: null, reason: 'empty-staff-id', row: null };
  }
  const row = findLogRow(logRows, staffId);
  if (row) {
    // P2: epoch là nguồn sự thật duy nhất (khớp computeCounters) — text mất ngày.
    if (Number(row.timeScanEpoch) > 0) {
      return { action: 'reject', status: null, reason: 'already-scanned', row: row };
    }
    return {
      action: 'update',
      status: cfg.STATUS.PRESENT,
      reason: null,
      row: row,
    };
  }
  // Không có trong danh sách chốt → Dư (Q6: danh sách chốt là tham chiếu cố định;
  // không phân biệt khác tổ hợp hay không có trong StaffData — gộp vào EXTRA)
  return { action: 'append', status: cfg.STATUS.EXTRA, reason: null, row: null };
}

/**
 * Tìm dòng NV trong log theo staffId (staffId đã normalize trước).
 * @param {Array<Object>} logRows
 * @param {string} staffId
 * @returns {Object|null}
 */
function findLogRow(logRows, staffId) {
  if (!logRows || !staffId) return null;
  const needle = String(staffId).trim().toUpperCase();
  for (let i = 0; i < logRows.length; i++) {
    if (String(logRows[i].staffId || '').trim().toUpperCase() === needle) return logRows[i];
  }
  return null;
}

/**
 * Tính counters từ danh sách dòng log của task.
 * Quy ước (đã chốt): Đã quét = timeScanEpoch > 0 (PRESENT + EXTRA); Vắng = pre-fill chưa quét;
 * Dư = status EXTRA.
 *
 * @param {Object} cfg — { STATUS: {...} }
 * @param {Array<Object>} logRows
 * @returns {{scanned: number, absent: number, extra: number, total: number}}
 */
function computeCounters(cfg, logRows) {
  let scanned = 0;
  let absent = 0;
  let extra = 0;
  const total = logRows ? logRows.length : 0;
  (logRows || []).forEach(function (row) {
    // P2: epoch là nguồn sự thật duy nhất (text mất ngày xuyên nửa đêm; slim cache
    // không còn field timeScan Date) — khớp hướng scanCard/restoreScanCard.
    var hasScan = Number(row.timeScanEpoch) > 0;
    if (hasScan) scanned++;
    if (row.status === cfg.STATUS.EXTRA) extra++;
    else if (!hasScan) absent++;
  });
  return { scanned: scanned, absent: absent, extra: extra, total: total };
}

/**
 * Tạo dòng mới cho NV quét lạ (append) — dùng dữ liệu từ staffIndex nếu có.
 * @param {Object} cfg — { STATUS: {...} }
 * @param {string} taskId
 * @param {string} staffId
 * @param {Object|null} staffInfo — từ staffIndex (có thể null nếu không tìm thấy)
 * @param {Date} now
 * @returns {Object} row theo LOG_COLS
 */
function buildExtraRow(cfg, taskId, staffId, staffInfo, now) {
  return {
    taskId: taskId,
    staffId: staffId,
    staffName: staffInfo ? staffInfo.staffName : '',
    slotCode: staffInfo ? staffInfo.slotCode : '',
    station: staffInfo ? staffInfo.station : '',
    team: staffInfo ? staffInfo.team : '',
    workstation: staffInfo ? staffInfo.workstation : '',
    timeRef: null,
    timeScan: now,
    // append cũng phải set timeScanEpoch (nguồn sự thật counters/sort) — nếu
    // không, computeCounters đếm scanned=0 và epoch sort đẩy NV mới xuống cuối.
    timeScanEpoch: now ? now.getTime() : 0,
    date: '',  // NV quét lạ không có trong StaffData → không có ngày vào làm
    status: cfg.STATUS.EXTRA,
  };
}

// ===== Node test support (GAS bỏ qua) =====
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    classifyScan: classifyScan,
    findLogRow: findLogRow,
    computeCounters: computeCounters,
    buildExtraRow: buildExtraRow,
  };
}
