/**
 * TaskService.gs — Nghiệp vụ task (tạo/đóng) + pre-fill log.
 *
 * Luồng 2 (MVP): tạo task từ tổ hợp (station, slotCode, team) →
 * pre-fill AttendanceLog batch 1 lần (timeRef = createdAt, status = Vắng)
 * → quét đối chiếu → Kết thúc (done).
 */

/** Tạo taskId có thứ tự đọc được: R20260824-143015482 (giờ tạo HN + millisecond —
 * ms giúp 2 kiosk tạo CÙNG GIÂY vẫn khác ID, tránh vòng suffix -2/-3 tốn thêm RPC
 * readTask_ trong lock khi cao điểm; while-readTask_ giữ làm backstop). */
function makeTaskId_(now) {
  const d = now || new Date();
  const pad = function (n) { return String(n).padStart(2, '0'); };
  const datePart = d.getFullYear()
    + pad(d.getMonth() + 1)
    + pad(d.getDate());
  const msPart = String(d.getMilliseconds()).padStart(3, '0');
  const timePart = pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds()) + msPart;
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
    // P2-7 (2026-08-25): cap số lượng NV để tránh vượt quota/timeout 6 phút khi StaffData lớn
    if (deduped.length > 1000) {
      return { ok: false, taskId: null, count: 0, message: 'Quá nhiều nhân viên (' + deduped.length + '), giới hạn 1000' };
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
    // P2-7: nguyên tử — nếu pre-fill fail, đóng task vừa tạo để không để lại task ma OPEN 0 dòng
    try {
      insertTask_(task);
      const count = batchInsertLogRows_(taskId, deduped, now);
      return { ok: true, taskId: taskId, count: count, message: 'Tạo task thành công: ' + taskId };
    } catch (e) {
      try { updateTaskStatus_(taskId, TASK_STATUS.DONE, new Date(), task._rowIndex); } catch (e2) {}
      throw e;
    }
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
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    return { ok: false, message: 'Hệ thống đang bận — thử lại sau giây lát' };
  }
  try {
    return completeTaskCore_(taskId);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Thân completeTask KHÔNG lock — dùng chung bên trong lock ngoài
 * (transferPresentListToMealMoveApi) để tránh deadlock (lock không reentrant).
 */
function completeTaskCore_(taskId) {
  if (!taskId) return { ok: false, message: 'Thiếu taskId' };
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
}

/**
 * Chuyển danh sách NV Có mặt từ task Điểm Danh Ca → task Ra/Vào mới (A4 2026-08-19).
 * 1 RPC + 1 lock duy nhất cho CẢ 2 bước (tạo task mới + đóng task cũ) — trước đây
 * client gọi 2 RPC riêng createMealMoveTaskApi → completeTaskApi: cửa sổ giữa 2 RPC
 * fail (mất mạng/server lỗi) → task mới tồn tại mà task cũ vẫn MỞ → danh sách NV
 * trùng ở 2 task. Giờ cả 2 bước nằm trong 1 lock — không có cửa sổ giữa chừng.
 * partial=true: task mới ĐÃ tạo nhưng đóng task cũ fail (không rollback được — không
 * có xoá task) → client vẫn mở task mới, user tự xử lý task cũ (hiếm: chỉ ghi sheet fail).
 * @param {Object} input — input tạo task Ra/Vào (giống createMealMoveTask: station/team/staffIds/timeRaByStaff/note)
 * @param {string} oldTaskId — task Điểm Danh Ca cần đóng
 * @returns {{ok: boolean, taskId: string|null, count: number, message: string, partial?: boolean}}
 */
function transferPresentListToMealMoveApi(input, oldTaskId) {
  if (!oldTaskId) return { ok: false, taskId: null, count: 0, message: 'Thiếu taskId task cũ' };
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    return { ok: false, taskId: null, count: 0, message: 'Hệ thống đang bận — thử lại sau giây lát' };
  }
  try {
    const oldTask = readTask_(oldTaskId);
    if (!oldTask) return { ok: false, taskId: null, count: 0, message: 'Không tìm thấy task ' + oldTaskId };
    if (oldTask.status !== TASK_STATUS.OPEN) {
      return { ok: false, taskId: null, count: 0, message: 'Task đã kết thúc — không chuyển được' };
    }
    const created = createMealMoveTaskCore_(input);
    if (!created.ok) return { ok: false, taskId: null, count: 0, message: created.message };
    const fin = completeTaskCore_(oldTaskId);
    if (!fin.ok) {
      return {
        ok: false, taskId: created.taskId, count: created.count, partial: true,
        message: 'Đã tạo ' + created.taskId + ' nhưng không hoàn thành được ' + oldTaskId + ': ' + fin.message,
      };
    }
    return {
      ok: true, taskId: created.taskId, count: created.count,
      message: 'Đã tạo ' + created.taskId + ' và hoàn thành ' + oldTaskId,
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
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    return { ok: false, taskId: null, count: 0, message: 'Hệ thống đang bận — thử lại sau giây lát' };
  }
  try {
    return createMealMoveTaskCore_(input);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Thân createMealMoveTask KHÔNG lock — dùng chung bên trong lock ngoài
 * (transferPresentListToMealMoveApi) để tránh deadlock (lock không reentrant).
 */
function createMealMoveTaskCore_(input) {
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
  // P2-7: cap danh sách mã — tránh batchInsertLogRows_ 50k dòng vượt quota/timeout 6 phút
  if (raw.length > 1000) {
    return { ok: false, taskId: null, count: 0, message: 'Quá nhiều mã (' + raw.length + '), giới hạn 1000' };
  }
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
    let taskId = 'M' + makeTaskId_(now).slice(1);  // prefix M phân biệt meal-move (R = reconcile)
    let suffix = 2;
    while (readTask_(taskId)) {
      taskId = 'M' + makeTaskId_(now).slice(1) + '-' + suffix;
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
    // P2-7: nguyên tử — nếu pre-fill fail, đóng task vừa tạo
    try {
      insertTask_(task);
      // Pre-fill log: 1 dòng / NV, status PENDING, chưa có Ra/Vào
      const count = batchInsertLogRows_(taskId, staffList, now);
      return { ok: true, taskId: taskId, count: count, message: 'Tạo task Điểm danh Ra/Vào: ' + taskId };
    } catch (e) {
      try { updateTaskStatus_(taskId, TASK_STATUS.DONE, new Date(), task._rowIndex); } catch (e2) {}
      throw e;
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
