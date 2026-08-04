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
 * @param {{station: string, slotCode: string, team: string, createdBy: string}} input
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
  const createdBy = String((input && input.createdBy) || '').trim() || 'web';

  if (!station || !filterSlots.length || !filterTeams.length) {
    return { ok: false, taskId: null, count: 0, message: 'Thiếu station/slotCode/team' };
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const staffList = filterStaffByGroup(readStaffList_(), { station: station, slotCode: filterSlots, team: filterTeams, date: date });
    // P1: Att.csv thật có NV 2 dòng trong CÙNG tổ hợp → dedupe theo staffId (giữ dòng đầu).
    // Nếu không: log 2 dòng cùng staffId → phantom absent khi kết thúc + row-key client lệch.
    const deduped = dedupeStaffByGroup(staffList);

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
  lock.waitLock(10000);
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
    const absentCount = markUnscannedAbsent_(taskId);
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
  lock.waitLock(10000);
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

/** Lấy danh sách task (cho getTaskList API). */
function listTasks() {
  return readTaskList_();
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
