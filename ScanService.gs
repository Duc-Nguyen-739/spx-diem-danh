/**
 * ScanService.gs — Nghiệp vụ quét (wrapper GAS quanh ScanLogic thuần).
 *
 * Quy trình: validate task open → lấy log + staffIndex → classifyScan →
 * update/append trên sheet (LockService) → tính counters → trả kết quả.
 */

/**
 * Xử lý 1 lần quét NV.
 * @param {string} taskId
 * @param {string} rawStaffId — mã từ barcode (chưa normalize)
 * @returns {{ok: boolean, message: string, status: string|null, counters: Object}}
 */
function scanStaff(taskId, rawStaffId) {
  // P2 benchmark (QA prod): đo latency thật từng giai đoạn → Stackdriver.
  // Kiosk queue 2.5s/item — cần số liệu thật trước khi tối ưu thêm.
  const t0 = Date.now();
  const staffId = normalizeStaffId(rawStaffId);
  // Chỉ chấp nhận mã barcode NV bắt đầu "Ops" (case-insensitive).
  if (!isValidBarcodeId(staffId)) {
    console.log({ bench: 'scanStaff', taskId: taskId, staffId: staffId, phase: 'reject-format', ms: Date.now() - t0 });
    return {
      ok: false,
      message: 'Mã phải bắt đầu bằng "Ops"',
      status: null,
      counters: { scanned: 0, absent: 0, extra: 0, total: 0 },
    };
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const t1 = Date.now();
    const task = readTask_(taskId);
    // U2: dùng cache log rows (30s + incremental) — scan liên tiếp không getDataRange
    // full sheet log mỗi lần (v1 lesson: dynamic tail → v2 cache vì update-in-place).
    const logRows = readLogRowsCached_(taskId);
    const t2 = Date.now();
    // F1 (simplify): KHÔNG đọc staffIndex mỗi scan — chỉ cần ở nhánh append (NV lạ,
    // hiếm). 52KB JSON.parse + 1 full-read StaffData mỗi 5 phút là thừa với 99% scan.

    const result = classifyScan(
      { STATUS: STATUS, TASK_STATUS: TASK_STATUS },
      task,
      logRows,
      staffId
    );

    if (result.action === 'reject') {
      // F: lookup thay ternary 3 tầng — lý do reject → message (reason không có → STAFF_NOT_FOUND)
      const REJECT_MSG = {
        'task-closed': UI_LABELS.TASK_CLOSED,
        'already-scanned': UI_LABELS.ALREADY_SCANNED,
      };
      // P2 benchmark: reject path KHÔNG log — quét trùng/task đóng chiếm phần lớn
      // lượt quét, log chúng sẽ drown các warn thật (cache fail) trong Stackdriver.
      return {
        ok: false,
        message: REJECT_MSG[result.reason] || UI_LABELS.STAFF_NOT_FOUND,
        status: null,
        counters: computeCounters({ STATUS: STATUS }, logRows),
      };
    }

    let timeScanText = '';
    let timeScanEpoch = 0;
    let scannedName = null;
    if (result.action === 'update') {
      const now = new Date();
      updateLogRowScan_(result.row, now, result.status);
      result.row.timeScan = now;
      result.row.status = result.status;
      timeScanText = formatTime_(now);
      timeScanEpoch = now.getTime();  // sort key số — client sort chính xác theo epoch
      scannedName = result.row.staffName || null;
    } else if (result.action === 'append') {
      const now = new Date();
      // F1: đọc staffIndex CHỈ ở đây (append) — lazy thay vì mỗi scan
      const staffInfo = (readStaffIndex_())[staffId] || null;
      const extraRow = buildExtraRow({ STATUS: STATUS }, taskId, staffId, staffInfo, now);
      appendLogRow_(extraRow);
      logRows.push(extraRow);
      timeScanText = formatTime_(now);
      timeScanEpoch = now.getTime();
      scannedName = extraRow.staffName || null;
    }

    const counters = computeCounters({ STATUS: STATUS }, logRows);
    // P2 benchmark: tổng + tách giai đoạn — QA prod đọc Stackdriver biết ngay
    // bottleneck (read sheet vs write). Phân tích: t1→t2 = đọc task+log (full sheet),
    // t2→t3 = classify + write. Nếu read > 1.5s → cần index log (xem Database.gs).
    const t3 = Date.now();
    console.log({ bench: 'scanStaff', taskId: taskId, staffId: staffId, action: result.action, totalMs: t3 - t0, readMs: t2 - t1, writeMs: t3 - t2 });
    return {
      ok: true,
      message: result.status,
      status: result.status,
      timeScanText: timeScanText,
      timeScanEpoch: timeScanEpoch,
      staffName: scannedName,
      counters: counters,
    };
  } finally {
    lock.releaseLock();
  }
}
