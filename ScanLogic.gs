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
    classifyMealMoveScan: classifyMealMoveScan,
    buildMealMoveExtraRow: buildMealMoveExtraRow,
  };
}

/**
 * ScanLogic.gs — Bổ sung meal-move (2026-08-04)
 *
 * Meal-move: 2 mốc Ra (đi ra ngoài) → Vào (quay lại).
 * - Lần 1 (chưa có Ra) → ghi Ra, status OUT
 * - Lần 2 (có Ra, chưa Vào) → ghi Vào, status PRESENT + durationMinutes
 * - Trùng trong 10s (DUPLICATE_WINDOW_MS) → reject 'duplicate'
 * - Đã đủ Ra+Vào → reject 'already-scanned'
 * - Task đóng → reject 'task-closed'
 * - NV lạ (không trong roster) → append EXTRA (vẫn ghi giờ theo mode)
 */

/**
 * Phân loại 1 lần quét meal-move.
 * @param {Object} cfg — { STATUS, TASK_STATUS, DUPLICATE_WINDOW_MS }
 * @param {Object} task — { taskId, status, taskType }
 * @param {Array<Object>} logRows — dòng AttendanceLog của task
 * @param {string} staffId — mã NV đã normalize
 * @param {string} mode — 'ra' | 'vao' (từ client, server đã validate permission)
 * @param {number} nowMs — Date.now() (truyền vào để test được trên Node)
 * @param {Object|null} staffInfo — thông tin NV từ StaffData (lookup bên ngoài); null = không có trong DB
 * @returns {{action: 'update'|'append'|'reject', status: string|null, reason: string|null, row: Object|null, scanPhase: string|null}}
 *   scanPhase: 'ra' | 'vao' — mốc vừa ghi (cho server biết cột nào để update)
 */
function classifyMealMoveScan(cfg, task, logRows, staffId, mode, nowMs, staffInfo) {
  if (!task || task.status !== cfg.TASK_STATUS.OPEN) {
    return { action: 'reject', status: null, reason: 'task-closed', row: null, scanPhase: null };
  }
  if (!staffId) {
    return { action: 'reject', status: null, reason: 'empty-staff-id', row: null, scanPhase: null };
  }

  var row = findLogRow(logRows, staffId);
  var now = nowMs || Date.now();

  if (row) {
    // NV có trong roster — kiểm tra tình trạng Ra/Vào
    var hasRa = Number(row.timeRaEpoch) > 0;
    var hasVao = Number(row.timeScanEpoch) > 0;

    // Rule 10s: chống quét trùng — so với mốc cuối cùng (Ra hoặc Vào)
    var lastEpoch = Math.max(Number(row.timeRaEpoch) || 0, Number(row.timeScanEpoch) || 0);
    if (lastEpoch > 0 && (now - lastEpoch) < (cfg.DUPLICATE_WINDOW_MS || 10000)) {
      return { action: 'reject', status: null, reason: 'duplicate', row: row, scanPhase: null };
    }

    if (hasRa && hasVao) {
      // Đã đủ Ra + Vào
      return { action: 'reject', status: null, reason: 'already-scanned', row: row, scanPhase: null };
    }

    if (mode === 'ra') {
      if (!hasRa) {
        // Ghi Ra lần đầu
        return { action: 'update', status: cfg.STATUS.OUT, reason: null, row: row, scanPhase: 'ra' };
      }
      // Đã có Ra, mode vẫn Ra → reject (phải toutesing sang Vào)
      return { action: 'reject', status: null, reason: 'already-scanned', row: row, scanPhase: null };
    }

    // mode === 'vao'
    if (!hasRa) {
      // Quên quét Ra → đánh Thừa (yêu cầu user: Vào không khớp = Thừa)
      return { action: 'update', status: cfg.STATUS.EXTRA, reason: null, row: row, scanPhase: 'vao' };
    }
    // Có Ra, chưa Vào → ghi Vào → PRESENT
    return { action: 'update', status: cfg.STATUS.PRESENT, reason: null, row: row, scanPhase: 'vao' };
  }

  // NV không trong log — 2 trường hợp:
  //  - mode Ra → luôn OUT (ghi Ra) — kể cả NV không trong StaffData (quét Ra = luôn hợp lệ;
  //    nếu là NV lạ thì staffInfo=null → thông tin rỗng nhưng vẫn ghi Ra)
  //  - mode Vào + CHƯA có Ra → EXTRA (Dư) — quét Vào mà không trùng danh sách Ra = lạ
  //  - mode Vào + ĐÃ có Ra → đã xử lý ở nhánh update phía trên
  if (mode === 'ra') {
    // Paste/quét Ra → luôn ghi Ra (OUT), không bao giờ Dư
    return { action: 'append', status: cfg.STATUS.OUT, reason: null, row: null, scanPhase: 'ra', staffInfo: staffInfo || null };
  }
  // mode Vào, chưa có Ra → Dư (quét Vào mà không có trong danh sách Ra)
  return { action: 'append', status: cfg.STATUS.EXTRA, reason: null, row: null, scanPhase: 'vao', staffInfo: staffInfo || null };
}

/**
 * Tạo dòng mới cho NV quét lạ (meal-move append) — ghi giờ theo mode (Ra hoặc Vào).
 * @param {Object} cfg — { STATUS, DUPLICATE_WINDOW_MS }
 * @param {string} taskId
 * @param {string} staffId
 * @param {Object|null} staffInfo — từ staffIndex (có thể null)
 * @param {string} mode — 'ra' | 'vao'
 * @param {Date} now
 * @returns {Object} row theo LOG_COLS (có timeRa/timeScan tùy mode)
 */
function buildMealMoveExtraRow(cfg, taskId, staffId, staffInfo, mode, now, status) {
  var nowMs = now ? now.getTime() : Date.now();
  var rowStatus = status || cfg.STATUS.EXTRA;
  // mode Ra → ghi timeRa (Date + epoch); mode Vào → ghi timeScan (Date + epoch)
  var isRa = mode === 'ra';
  return {
    taskId: taskId,
    staffId: staffId,
    staffName: staffInfo ? staffInfo.staffName : '',
    slotCode: staffInfo ? staffInfo.slotCode : '',
    station: staffInfo ? staffInfo.station : '',
    team: staffInfo ? staffInfo.team : '',
    workstation: staffInfo ? staffInfo.workstation : '',
    agency: staffInfo ? staffInfo.agency : '',
    timeRef: null,
    timeRa: isRa ? now : null,
    timeRaEpoch: isRa ? nowMs : 0,
    timeScan: !isRa ? now : null,
    timeScanEpoch: !isRa ? nowMs : 0,
    status: rowStatus,
    durationMinutes: 0,
  };
}
