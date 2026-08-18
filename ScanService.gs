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
 * @param {string} mode — 'ra' | 'vao' (chỉ meal-move; server tự validate permission)
 * @returns {{ok: boolean, message: string, status: string|null, counters: Object, scanPhase: string|null}}
 */
function scanStaff(taskId, rawStaffId, mode) {
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
  try {
    lock.waitLock(10000);
  } catch (e) {
    console.log({ bench: 'scanStaff', taskId: taskId, staffId: staffId, phase: 'lock-timeout' });
    return {
      ok: false,
      message: 'Hệ thống đang bận — thử lại sau giây lát',
      status: null,
      counters: { scanned: 0, absent: 0, extra: 0, total: 0 },
    };
  }
  try {
    const t1 = Date.now();
    // F8: task read CACHE (15s) — trước đây full AttendanceTask sheet read mỗi scan.
    // Chỉ đọc tươi (readTask_) ở write path (complete/reopen/note) — scan chỉ cần status/type/createdBy.
    const task = readTaskCached_(taskId);
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
    // Meal-move: branch riêng — 2 mốc Ra/Vào + mode + permission
    const isMealMove = task && task.taskType === TASK_TYPE.MEAL_MOVE;
    // Tối ưu 2026-08-11: KHÔNG đọc staffIndex sớm cho meal-move — nhánh update không
    // cần staffInfo (classifyMealMoveScan chỉ trả staffInfo ở kết quả append), và nhánh
    // append bên dưới đã tự lookup 1 lần. Trước đây mỗi scan meal-move parse 52KB JSON
    // staffIndex thừa (giống F1 của reconcile).
    const resultMM = isMealMove ? classifyMealMoveScan(
      { STATUS: STATUS, TASK_STATUS: TASK_STATUS, DUPLICATE_WINDOW_MS: DUPLICATE_WINDOW_MS },
      task,
      logRows,
      staffId,
      resolveMealMoveMode_(task, mode),
      Date.now(),
      null
    ) : null;
    const effectiveResult = isMealMove ? resultMM : result;

    if (effectiveResult.action === 'reject') {
      // F: lookup thay ternary 3 tầng — lý do reject → message
      const REJECT_MSG = {
        'task-closed': UI_LABELS.TASK_CLOSED,
        'already-scanned': UI_LABELS.ALREADY_SCANNED,
        'duplicate': UI_LABELS.DUPLICATE_SCAN,
      };
      // P2 benchmark: reject path KHÔNG log — quét trùng/task đóng chiếm phần lớn
      // lượt quét, log chúng sẽ drown các warn thật (cache fail) trong Stackdriver.
      return {
        ok: false,
        message: REJECT_MSG[effectiveResult.reason] || UI_LABELS.STAFF_NOT_FOUND,
        status: null,
        scanPhase: null,
        counters: computeCounters({ STATUS: STATUS }, logRows),
      };
    }

    let timeScanText = '';
    let timeScanEpoch = 0;
    let timeRaText = '';
    let timeRaEpoch = 0;
    let durationMinutes = 0;
    let scannedName = null;
    // Info NV cho dòng Dư/append — trả về client để điền NGAY cột Tên/Ca/Team/Station/Vender
    // (không chờ Kết Thúc mới hiện). null = không có trong staffIndex → client giữ trống.
    let scannedInfo = { agency: null, slotCode: null, station: null, team: null, workstation: null };
    if (effectiveResult.action === 'update') {
      const now = new Date();
      if (isMealMove && effectiveResult.scanPhase === 'ra') {
        // Meal-move: ghi Ra (cột TIME_RA) + status OUT
        updateLogRowRa_(effectiveResult.row, now, effectiveResult.status);
        effectiveResult.row.timeRa = now;
        effectiveResult.row.timeRaEpoch = now.getTime();
        effectiveResult.row.status = effectiveResult.status;
        timeRaText = formatTime_(now);
        timeRaEpoch = now.getTime();
      } else {
        // Reconcile: ghi timeScan + status PRESENT
        // Meal-move Vào: ghi timeScan (cột TIME_SCAN) + status PRESENT/EXTRA
        updateLogRowScan_(effectiveResult.row, now, effectiveResult.status);
        effectiveResult.row.timeScan = now;
        effectiveResult.row.timeScanEpoch = now.getTime();
        effectiveResult.row.status = effectiveResult.status;
        timeScanText = formatTime_(now);
        timeScanEpoch = now.getTime();
        if (effectiveResult.row.timeRaEpoch > 0) {
          durationMinutes = Math.round((now.getTime() - effectiveResult.row.timeRaEpoch) / 60000);
          effectiveResult.row.durationMinutes = durationMinutes;
        }
      }
      scannedName = effectiveResult.row.staffName || null;
      scannedInfo = {
        agency: effectiveResult.row.agency || null,
        slotCode: effectiveResult.row.slotCode || null,
        station: effectiveResult.row.station || null,
        team: effectiveResult.row.team || null,
        workstation: effectiveResult.row.workstation || null,
      };
    } else if (effectiveResult.action === 'append') {
      const now = new Date();
      // F1: đọc staffIndex CHỈ ở đây (append) — lazy thay vì mỗi scan
      const staffInfo = (readStaffIndex_())[staffId] || null;
      let extraRow;
      if (isMealMove) {
        // status từ classify: OUT (Ra hợp lệ) hoặc EXTRA (Dư/thiếu Ra)
        extraRow = buildMealMoveExtraRow({ STATUS: STATUS }, taskId, staffId, staffInfo, effectiveResult.scanPhase || 'ra', now, effectiveResult.status);
      } else {
        extraRow = buildExtraRow({ STATUS: STATUS }, taskId, staffId, staffInfo, now);
      }
      appendLogRow_(extraRow);
      logRows.push(extraRow);
      timeScanText = formatTime_(extraRow.timeScan);
      timeScanEpoch = extraRow.timeScanEpoch || 0;
      timeRaText = formatTime_(extraRow.timeRa);
      timeRaEpoch = extraRow.timeRaEpoch || 0;
      scannedName = extraRow.staffName || null;
      scannedInfo = {
        agency: extraRow.agency || null,
        slotCode: extraRow.slotCode || null,
        station: extraRow.station || null,
        team: extraRow.team || null,
        workstation: extraRow.workstation || null,
      };
    }

    const counters = computeCounters({ STATUS: STATUS }, logRows);
    // P2 benchmark: tổng + tách giai đoạn — QA prod đọc Stackdriver biết ngay
    // bottleneck (read sheet vs write). Phân tích: t1→t2 = đọc task+log (full sheet),
    // t2→t3 = classify + write. Nếu read > 1.5s → cần index log (xem Database.gs).
    const t3 = Date.now();
    console.log({ bench: 'scanStaff', taskId: taskId, staffId: staffId, action: effectiveResult.action, scanPhase: effectiveResult.scanPhase || null, totalMs: t3 - t0, readMs: t2 - t1, writeMs: t3 - t2 });
    return {
      ok: true,
      message: effectiveResult.status,
      status: effectiveResult.status,
      scanPhase: effectiveResult.scanPhase || null,
      timeScanText: timeScanText,
      timeScanEpoch: timeScanEpoch,
      timeRaText: timeRaText,
      timeRaEpoch: timeRaEpoch,
      durationMinutes: durationMinutes,
      staffName: scannedName,
      agency: scannedInfo.agency,
      slotCode: scannedInfo.slotCode,
      station: scannedInfo.station,
      team: scannedInfo.team,
      workstation: scannedInfo.workstation,
      counters: counters,
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Quyết định mode hiệu lực cho scan meal-move — permission server-side.
 * Chỉ email tạo task (createdBy) được dùng mode 'ra'; mọi người khác bị ép 'vao'.
 * @param {Object} task — task đã đọc (có createdBy)
 * @param {string} mode — client gửi ('ra' | 'vao' | undefined)
 * @returns {string}
 */
function resolveMealMoveMode_(task, mode) {
  if (mode !== 'ra') return 'vao';
  if (!task) return 'vao';
  var createdBy = String(task.createdBy || '').trim().toLowerCase();
  if (!createdBy) return 'vao';
  try {
    var active = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
    if (active && active === createdBy) return 'ra';
  } catch (e) { /* fail-closed → vao */ }
  return 'vao';
}

/**
 * Paste hàng loạt mã Ops cho task meal-move — ghi Ra hoặc Vào cho cả danh sách.
 * 1 RPC duy nhất: server đọc log 1 lần, phân loại từng mã trong bộ nhớ, ghi batch.
 * @param {string} taskId
 * @param {string[]} codes — mảng mã Ops thô (chưa normalize)
 * @param {string} mode — 'ra' | 'vao' (client chọn; server validate permission)
 * @returns {{ok: boolean, message: string, summary: Object, counters: Object}}
 */
function pasteMealMoveScan(taskId, codes, mode) {
  var list = Array.isArray(codes) ? codes : [];
  if (!taskId) return { ok: false, message: 'Thiếu taskId', summary: null, counters: null };
  if (list.length > 200) return { ok: false, message: UI_LABELS.PASTE_TOO_MANY, summary: null, counters: null };

  // Chuẩn hóa + dedupe + bỏ mã không hợp lệ
  var seen = {};
  var normCodes = [];
  list.forEach(function (c) {
    var id = normalizeStaffId(c);
    if (!id || !isValidBarcodeId(id)) return;
    if (seen[id]) return;
    seen[id] = true;
    normCodes.push(id);
  });
  if (!normCodes.length) return { ok: false, message: UI_LABELS.MEAL_NO_OPS, summary: null, counters: null };

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    console.log({ bench: 'pasteMealMoveScan', taskId: taskId, phase: 'lock-timeout' });
    return { ok: false, message: 'Hệ thống đang bận — thử lại sau giây lát', summary: null, counters: null };
  }
  try {
    const task = readTaskCached_(taskId);
    if (!task) return { ok: false, message: 'Không tìm thấy task', summary: null, counters: null };
    if (task.taskType !== TASK_TYPE.MEAL_MOVE) {
      return { ok: false, message: 'Task không phải Đi ăn + Move', summary: null, counters: null };
    }
    if (task.status !== TASK_STATUS.OPEN) {
      return { ok: false, message: UI_LABELS.TASK_CLOSED, summary: null, counters: null };
    }
    const effMode = resolveMealMoveMode_(task, mode);
    // Đọc TƯƠI từ sheet (cần _rowIndex cho batch write) — không qua cache
    const logRows = readLogRows_(taskId);
    const now = new Date();
    const nowMs = now.getTime();
    const updates = [];   // dòng tồn tại cần cập nhật
    const newRows = [];   // NV lạ cần append
    var summary = { total: normCodes.length, ra: 0, vao: 0, extra: 0, duplicate: 0, already: 0 };

    // Lookup staffIndex 1 lần cho cả batch (cache 5m)
    const staffIndex = readStaffIndex_();
    // Phân loại TUẦN TỰ — mỗi mã nhìn vào state đã cập nhật của các mã trước trong batch
    normCodes.forEach(function (id) {
      const staffInfo = staffIndex[id] || null;
      const r = classifyMealMoveScan(
        { STATUS: STATUS, TASK_STATUS: TASK_STATUS, DUPLICATE_WINDOW_MS: DUPLICATE_WINDOW_MS },
        task,
        logRows,
        id,
        effMode,
        nowMs,
        staffInfo
      );
      if (r.action === 'reject') {
        if (r.reason === 'duplicate') summary.duplicate++;
        else if (r.reason === 'already-scanned') summary.already++;
        return;
      }
      if (r.action === 'update') {
        if (r.scanPhase === 'ra') {
          r.row.timeRa = now;
          r.row.timeRaEpoch = nowMs;
          r.row.status = r.status;
          updates.push({ _rowIndex: r.row._rowIndex, status: r.status, timeRa: now });
          summary.ra++;
        } else {
          r.row.timeScan = now;
          r.row.timeScanEpoch = nowMs;
          r.row.status = r.status;
          updates.push({ _rowIndex: r.row._rowIndex, status: r.status, timeScan: now });
          if (r.status === STATUS.EXTRA) summary.extra++;
          else summary.vao++;
        }
      } else if (r.action === 'append') {
        // staffInfo đã lookup ở đầu forEach — dùng r.staffInfo nếu có
        const si = r.staffInfo || staffInfo || null;
        // build row với status đúng: Ra→OUT, Vào(thiếu Ra)→EXTRA
        const appendStatus = (r.scanPhase || effMode) === 'ra' ? STATUS.OUT : STATUS.EXTRA;
        const extraRow = buildMealMoveExtraRow({ STATUS: STATUS }, taskId, id, si, r.scanPhase || effMode, now, appendStatus);
        newRows.push(extraRow);
        logRows.push(extraRow); // để mã sau trong batch nhìn thấy
        if (appendStatus === STATUS.OUT) summary.ra++;
        else summary.extra++;
      }
    });

    if (updates.length) batchMealMoveLogUpdates_(taskId, updates);
    if (newRows.length) batchAppendLogRows_(newRows);

    const counters = computeCounters({ STATUS: STATUS }, logRows);
    return {
      ok: true,
      message: 'Đã ghi ' + summary.ra + ' Ra / ' + summary.vao + ' Vào / ' + summary.extra + ' Thừa — trùng ' + summary.duplicate + ', đã điểm danh ' + summary.already,
      summary: summary,
      counters: counters,
    };
  } finally {
    lock.releaseLock();
  }
}
