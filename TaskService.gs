/**
 * TaskService.gs — Nghiệp vụ task (tạo/đóng) + pre-fill log.
 *
 * Luồng 2 (MVP): tạo task từ tổ hợp (station, slotCode, team) →
 * pre-fill AttendanceLog batch 1 lần (timeRef = createdAt, status = Vắng)
 * → quét đối chiếu → Kết thúc (done).
 */

/** Tạo taskId có thứ tự đọc được: R20260802-0730 (giờ tạo). */
function makeTaskId_(now) {
  const d = now || new Date();
  const pad = function (n) { return String(n).padStart(2, '0'); };
  const datePart = d.getFullYear()
    + pad(d.getMonth() + 1)
    + pad(d.getDate());
  const timePart = pad(d.getHours()) + pad(d.getMinutes());
  return 'R' + datePart + '-' + timePart;
}

/**
 * Tạo task đối chiếu (reconcile) + pre-fill log.
 * @param {{station: string, slotCode: string, team: string, createdBy: string, note?: string}} input
 * @returns {{ok: boolean, taskId: string|null, count: number, message: string}}
 */
function createReconcileTask(input) {
  const station = String((input && input.station) || '').trim();
  // Multi-select: slotCode/team có thể là mảng (từ modal) — task sheet chỉ có 1 cột,
  // nối ", " để lưu hiển thị; filter vẫn dùng mảng gốc (dòng NV khớp BẤT KỲ team/slot chọn).
  const slotCode = Array.isArray(input && input.slotCode)
    ? (input.slotCode).map(String).join(', ')
    : String((input && input.slotCode) || '').trim();
  const team = Array.isArray(input && input.team)
    ? (input.team).map(String).join(', ')
    : String((input && input.team) || '').trim();
  const filterSlots = Array.isArray(input && input.slotCode) ? input.slotCode : (slotCode ? [slotCode] : []);
  const filterTeams = Array.isArray(input && input.team) ? input.team : (team ? [team] : []);
  const date = String((input && input.date) || '').trim();  // ngày vào làm (optional — lọc theo StaffData Date)
  // Loại hợp đồng (multi-select) — mảng từ modal; không bắt buộc chọn.
  const contractType = Array.isArray(input && input.contractType)
    ? (input.contractType).map(String).join(', ')
    : String((input && input.contractType) || '').trim();
  const filterContractTypes = Array.isArray(input && input.contractType) ? input.contractType : (contractType ? [contractType] : []);
  let createdBy = 'web';
  try {
    const active = String(Session.getActiveUser().getEmail() || '').trim();
    if (active) createdBy = active;
  } catch (e) { /* fallback */ }
  if (createdBy === 'web') createdBy = String((input && input.createdBy) || '').trim() || 'web';
  // Ghi chú (optional) — người tạo thêm khi tạo task; sửa được sau qua updateTaskNote.
  const note = String((input && input.note) || '').trim();

  if (!station || !filterSlots.length || !filterTeams.length) {
    return { ok: false, taskId: null, count: 0, message: 'Thiếu station/slotCode/team' };
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    return { ok: false, taskId: null, count: 0, message: 'Hệ thống đang bận — thử lại sau giây lát' };
  }
  try {
    const staffList = filterStaffByGroup(readStaffList_(), { station: station, slotCode: filterSlots, team: filterTeams, date: date, contractType: filterContractTypes });
    // P1: Att.csv thật có NV 2 dòng trong CÙNG tổ hợp → dedupe theo staffId (giữ dòng đầu).
    // Nếu không: log 2 dòng cùng staffId → phantom absent khi kết thúc + row-key client lệch.
    const deduped = dedupeStaffByGroup(staffList);
    // Yêu cầu 2026-08-10: warm STAFF_INDEX cache ngay khi tạo task — scan dòng Dư (NV lạ)
    // lookup readStaffIndex_ có thông tin luôn, không phải đọc StaffData lần đầu giữa ca quét.
    readStaffIndex_();

    if (!deduped.length) {
      return { ok: false, taskId: null, count: 0, message: UI_LABELS.CREATE_FAILED_EMPTY };
    }

    const now = new Date();
    let taskId = makeTaskId_(now);
    // Tránh trùng taskId cùng phút — suffix số tăng dần (-2, -3, ...) thay vì -x-x
    let suffix = 2;
    while (readTask_(taskId)) {
      taskId = makeTaskId_(now) + '-' + suffix;
      suffix++;
    }

    const task = {
      taskId: taskId,
      taskType: TASK_TYPE.RECONCILE,
      station: station,
      slotCode: slotCode,
      team: team,
      status: TASK_STATUS.OPEN,
      createdAt: now,
      createdBy: createdBy,
      completedAt: null,
      note: note,
    };
    insertTask_(task);
    const count = batchInsertLogRows_(taskId, deduped, now);

    return { ok: true, taskId: taskId, count: count, message: 'Tạo task thành công: ' + taskId };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Đóng task (Kết thúc) — khóa quét.
 * @param {string} taskId
 * @returns {{ok: boolean, message: string}}
 */
function completeTask(taskId) {
  if (!taskId) return { ok: false, message: 'Thiếu taskId' };

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    return { ok: false, message: 'Hệ thống đang bận — thử lại sau giây lát' };
  }
  try {
    const task = readTask_(taskId);
    if (!task) return { ok: false, message: 'Không tìm thấy task' };
    if (task.status !== TASK_STATUS.OPEN) {
      return { ok: false, message: 'Task đã kết thúc' };
    }
    // P1 (audit): markUnscannedAbsent_ TRƯỚC, updateTaskStatus_(DONE) SAU — fail-safe.
    // Nếu mark fail (quota/timeout): task vẫn OPEN → user retry được.
    // Nếu updateTaskStatus_ fail: task vẫn OPEN → retry, mark idempotent (dòng đã
    // ABSENT/PRESENT không chạm lại). Thứ tự cũ (DONE trước) → mark fail = task đã
    // đóng nhưng log chưa chuyển Vắng, retry bị chặn "Task đã kết thúc".
    // meal-move: taskType truyền vào để markUnscannedAbsent_ biết NV OUT (đã Ra, chưa Vào) cũng thành Vắng
    const absentCount = markUnscannedAbsent_(taskId, task.taskType);
    updateTaskStatus_(taskId, TASK_STATUS.DONE, new Date(), task._rowIndex);
    return {
      ok: true,
      message: 'Đã kết thúc task ' + taskId + (absentCount > 0 ? ' — ' + absentCount + ' NV chưa quét đánh dấu Vắng' : ''),
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Mở lại task đã đóng (Reopen) — cho phép quét tiếp.
 * Reset NV bị đánh Vắng (ABSENT) về Chưa điểm danh (PENDING) để quét lại;
 * NV đã Có mặt giữ nguyên timeScan/status (không reset).
 * @param {string} taskId
 * @returns {{ok: boolean, message: string}}
 */
function reopenTask(taskId) {
  if (!taskId) return { ok: false, message: 'Thiếu taskId' };

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    return { ok: false, message: 'Hệ thống đang bận — thử lại sau giây lát' };
  }
  try {
    const task = readTask_(taskId);
    if (!task) return { ok: false, message: 'Không tìm thấy task' };
    if (task.status !== TASK_STATUS.DONE) {
      return { ok: false, message: 'Task đang mở — không cần mở lại' };
    }
    // Reset Vắng → Chưa điểm danh TRƯỚC (batch 1 lần), sau đó mở status task.
    // Thứ tự fail-safe giống completeTask: reset fail → task vẫn DONE, retry được.
    const resetCount = resetAbsentToPending_(taskId);
    updateTaskStatus_(taskId, TASK_STATUS.OPEN, null, task._rowIndex);
    return {
      ok: true,
      message: 'Đã mở lại task ' + taskId + (resetCount > 0 ? ' — ' + resetCount + ' NV Vắng được đặt lại Chưa điểm danh' : ''),
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Tạo task Đi ăn + Move (meal-move) — roster từ danh sách mã Ops (paste hoặc quét).
 * KHÁC createReconcileTask: không lọc từ StaffData theo station/slot/team; nhận thẳng
 * danh sách mã Ops do người tạo cung cấp, lookup staffIndex để lấy tên/agency.
 * createdBy = EMAIL THẬT (Session.getActiveUser) — dùng để phân quyền Ra/Vào (3.2).
 * @param {{staffIds: string[], createdBy?: string, note?: string}} input
 * @returns {{ok: boolean, taskId: string|null, count: number, message: string}}
 */
function createMealMoveTask(input) {
  // 2026-08-08: task Điểm danh Ra/Vào GIỜ BẮT BUỘC chọn Station + Team (kiosk biết
  // task thuộc khu nào / nhóm nào). Giống createReconcileTask: team nhận mảng → nối ', '
  // cho cột task sheet; filter dùng mảng gốc.
  const station = String((input && input.station) || '').trim();
  const team = Array.isArray(input && input.team)
    ? (input.team).map(String).join(', ')
    : String((input && input.team) || '').trim();
  if (!station || !team) {
    return { ok: false, taskId: null, count: 0, message: 'Vui lòng chọn Station và Team để tạo task' };
  }
  const raw = Array.isArray(input && input.staffIds) ? input.staffIds : [];
  // 2026-08-18: map staffId → epoch ms "Giờ điểm danh" của task reconcile — ghi vào
  // cột "Giờ Ra" (TIME_RA) khi pre-fill log, để NV có sẵn giờ Ra (không phải quét lại).
  const timeRaByStaff = (input && input.timeRaByStaff) || {};

  // Chuẩn hóa + dedupe + bỏ mã không hợp lệ (chỉ nhận mã Ops)
  // Cho phép danh sách rỗng — tạo task trống, paste/quét mã bên trong task
  const seen = {};
  const ids = [];
  raw.forEach(function (c) {
    const id = normalizeStaffId(c);
    if (!id || !isValidBarcodeId(id)) return;
    if (seen[id]) return;
    seen[id] = true;
    ids.push(id);
  });

  // Email người tạo — ưu tiên Session (server tự lấy, KHÔNG tin client)
  let createdBy = 'web';
  try {
    const active = String(Session.getActiveUser().getEmail() || '').trim();
    if (active) createdBy = active;
  } catch (e) { /* fallback */ }
  if (createdBy === 'web') createdBy = String((input && input.createdBy) || '').trim() || 'web';
  // Ghi chú (optional) — người tạo thêm khi tạo task; sửa được sau qua updateTaskNote.
  const note = String((input && input.note) || '').trim();

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    return { ok: false, taskId: null, count: 0, message: 'Hệ thống đang bận — thử lại sau giây lát' };
  }
  try {
    // Lookup thông tin NV từ staffIndex (cache 5m) — lấy tên, agency, station...
    const index = readStaffIndex_();
    const staffList = ids.map(function (id) {
      const info = index[id] || {};
      // timeRaByStaff[id] = epoch "Giờ điểm danh" từ task reconcile — NV Có mặt
      // đã được điểm danh → coi như đã Ra (giờ Ra = giờ điểm danh), status OUT.
      const raEpoch = Number(timeRaByStaff[id]) || 0;
      const timeRa = raEpoch > 0 ? new Date(raEpoch) : null;
      return {
        staffId: id,
        staffName: info.staffName || '',
        slotCode: info.slotCode || '',
        station: info.station || '',
        team: info.team || '',
        workstation: info.workstation || '',
        agency: info.agency || '',
        date: info.date || '',
        timeRa: timeRa,              // meal-move: giờ Ra pre-fill từ "Giờ điểm danh"
        timeRaEpoch: raEpoch,        // epoch cho counters/warm cache
        status: timeRa ? STATUS.OUT : STATUS.PENDING,  // đã Ra → OUT, chưa → PENDING
      };
    });

    const now = new Date();
    let taskId = 'M' + makeTaskId_(now);  // prefix M phân biệt meal-move (R = reconcile)
    let suffix = 2;
    while (readTask_(taskId)) {
      taskId = 'M' + makeTaskId_(now) + '-' + suffix;
      suffix++;
    }

    const task = {
      taskId: taskId,
      taskType: TASK_TYPE.MEAL_MOVE,
      station: station,
      slotCode: '',
      team: team,
      status: TASK_STATUS.OPEN,
      createdAt: now,
      createdBy: createdBy,
      completedAt: null,
      note: note,
    };
    insertTask_(task);
    // Pre-fill log: 1 dòng / NV, status PENDING, chưa có Ra/Vào
    const count = batchInsertLogRows_(taskId, staffList, now);

    return { ok: true, taskId: taskId, count: count, message: 'Tạo task Điểm danh Ra/Vào: ' + taskId };
  } finally {
    lock.releaseLock();
  }
}

/** Lấy danh sách task (cho getTaskList API). */
function listTasks() {
  return readTaskList_();
}

/**
 * Cập nhật ghi chú của task (sửa trong task — mọi trạng thái open/done đều được).
 * @param {string} taskId
 * @param {string} note
 * @returns {{ok: boolean, message: string}}
 */
function updateTaskNote(taskId, note) {
  if (!taskId) return { ok: false, message: 'Thiếu taskId' };
  const clean = String(note || '').trim();

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    return { ok: false, message: 'Hệ thống đang bận — thử lại sau giây lát' };
  }
  try {
    const task = readTask_(taskId);
    if (!task) return { ok: false, message: 'Không tìm thấy task' };
    updateTaskNote_(taskId, clean, task._rowIndex);
    return { ok: true, message: clean ? 'Đã lưu ghi chú' : 'Đã xoá ghi chú' };
  } finally {
    lock.releaseLock();
  }
}

/** Lấy chi tiết task + toàn bộ log (cho getTaskDetail API) — có cache 15s. */
function getTaskDetail(taskId) {
  if (!taskId) return detailError_('Thiếu taskId');
  const detail = readTaskDetailCached_(taskId);
  if (!detail || !detail.task) return detailError_('Không tìm thấy task');
  return { ok: true, task: detail.task, log: detail.log, counters: detail.counters };
}

/** F: object lỗi dùng chung cho getTaskDetail. */
function detailError_(message) {
  return { ok: false, message: message, task: null, log: [] };
}
