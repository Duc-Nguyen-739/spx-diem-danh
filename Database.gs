/**
 * Database.gs — Lớp truy cập GAS (Spreadsheet + CacheService).
 *
 * Gọi GAS API — KHÔNG test Node trực tiếp (logic thuần nằm ở CsvUtil/ScanLogic).
 * Patterns (v1 lesson):
 * - Batch setValues() — KHÔNG appendRow trong loop
 * - Cache version-key (CACHE_KEYS.*_v1) để invalidate dễ
 * - Timezone cache 1 lần — KHÔNG gọi Session.getScriptTimeZone() trong loop
 */

/** Lấy sheet theo tên, tạo mới nếu chưa có (kèm header nếu chỉ định). */
function getSheet_(name, header) {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  // Tự set header khi sheet trống (mới tạo HOẶC đã tồn tại nhưng chưa có dữ liệu).
  // Phòng trường hợp sheet tồn tại từ trước nhưng thiếu header → đọc/write lệch dòng.
  if (header && header.length && sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold');
  }
  return sheet;
}

/**
 * Spreadsheet chứa dữ liệu.
 * Thứ tự ưu tiên: DEFAULT_SPREADSHEET_ID (Config) → Script Properties 'SPREADSHEET_ID'
 * → spreadsheet bind → tạo mới 'RollCall v2 DB'.
 */
function getSpreadsheet_() {
  if (DEFAULT_SPREADSHEET_ID) {
    try { return SpreadsheetApp.openById(DEFAULT_SPREADSHEET_ID); } catch (e) { /* fallthrough */ }
  }
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('SPREADSHEET_ID');
  if (id) {
    try { return SpreadsheetApp.openById(id); } catch (e) { /* fallthrough */ }
  }
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  // Standalone + chưa set ID → tạo sheet mới, lưu ID để dùng tiếp.
  const created = SpreadsheetApp.create('RollCall v2 DB');
  props.setProperty('SPREADSHEET_ID', created.getId());
  return created;
}

/** Đảm bảo toàn bộ sheet tồn tại (dùng khi khởi tạo). */
function ensureSheets_() {
  getSheet_(SHEETS.CONFIG, ['Key', 'Value']);
  getSheet_(SHEETS.STAFF_DATA, []); // header giữ nguyên như csv — syncFromCsv() sẽ ghi
  getSheet_(SHEETS.ATTENDANCE_TASK, [
    'taskId', 'taskType', 'station', 'slotCode', 'team', 'status', 'createdAt', 'createdBy', 'completedAt', 'note',
  ]);
  const logSheet = getSheet_(SHEETS.ATTENDANCE_LOG, [
    'taskId', 'staffId', 'staffName', 'slotCode', 'station', 'team', 'workstation',
    'timeRef', 'timeScan', 'status', 'date', 'timeRa', 'agency',
  ]);
  // Migration an toàn: sheet cũ tạo trước khi có cột date (LOG_COL_COUNT=11) vẫn còn
  // 10 cột → getSheet_ chỉ set header khi sheet trống, không tự thêm cột. Nếu thiếu,
  // thêm cột cuối + đặt header, nếu không batchInsertLogRows_ ghi 11 giá trị sẽ vỡ.
  // Migration: sheet cũ có thể thiếu cột date(11), timeRa(12), agency(13).
  // Tự thêm cột cuối + đặt header cho từng cột thiếu — an toàn với mọi phiên bản cũ.
  while (logSheet.getLastColumn() < LOG_COL_COUNT) {
    var nextCol = logSheet.getLastColumn() + 1;
    logSheet.insertColumnAfter(logSheet.getLastColumn());
    var headers = ['date', 'timeRa', 'agency']; // cột 11, 12, 13
    logSheet.getRange(1, nextCol).setValue(headers[nextCol - 11]);
  }
  // Migration AttendanceTask: sheet cũ thiếu cột note (10) — tự thêm + đặt header,
  // nếu không insertTask_ ghi 10 giá trị sẽ vỡ trên sheet 9 cột.
  const taskSheet = getSheet_(SHEETS.ATTENDANCE_TASK);
  if (taskSheet.getLastColumn() < TASK_COL_COUNT) {
    taskSheet.insertColumnAfter(taskSheet.getLastColumn());
    taskSheet.getRange(1, TASK_COL_COUNT).setValue('note');
  }
}

// ===== Cache wrapper + format Date: xem CacheLayer.gs (tách 2026-08-11) =====
// cache_() / cachedJson_() / getTimeZone_() / formatTime_() / formatDateTime_() /
// formatDateShort_() đã chuyển sang CacheLayer.gs — GAS share global scope nên
// các hàm dưới đây vẫn gọi được như trước (không đổi behavior).

// ===== Config =====

// ===== StaffData =====

/**
 * Đọc StaffData → index { staffId: staff } (cache 5m, version-key).
 * @returns {Object<string, Object>}
 */
function readStaffIndex_() {
  return cachedJson_(CACHE_KEYS.STAFF_INDEX, function () {
    const sheet = getSheet_(SHEETS.STAFF_DATA);
    const values = sheet.getDataRange().getValues();
    return buildStaffIndex(values);
  }, CACHE_TTL.STAFF_INDEX);
}

/** Xóa cache StaffData (gọi sau syncFromCsv). */
function invalidateStaffIndex_() {
  cache_().remove(CACHE_KEYS.STAFF_INDEX);
  cache_().remove(CACHE_KEYS.FILTER_OPTIONS);
}

/** Đọc toàn bộ StaffData dạng mảng objects (cache 5m — version-key FILTER_OPTIONS). */
function readStaffList_() {
  return cachedJson_(CACHE_KEYS.FILTER_OPTIONS, function () {
    return readStaffListUncached_();
  }, CACHE_TTL.FILTER_OPTIONS);
}

/** Đọc StaffData trực tiếp từ sheet — bỏ qua cache (chỉ dùng khi cần data mới). */
function readStaffListUncached_() {
  const sheet = getSheet_(SHEETS.STAFF_DATA);
  const values = sheet.getDataRange().getValues();
  const header = values[0].map(function (h) { return String(h || '').trim(); });
  const fieldOf = {};
  for (let c = 0; c < header.length; c++) {
    const f = CSV_HEADER_FIELD[header[c]];
    if (f !== undefined) fieldOf[f] = c;
  }
  const out = [];
  for (let r = 1; r < values.length; r++) {
    const v = values[r];
    const staffId = normalizeStaffId(v[fieldOf.staffId]);
    if (!staffId) continue;
    out.push({
      staffId: staffId,
      staffName: normalizeStaffName(v[fieldOf.staffName]),
      station: String(v[fieldOf.station] || '').trim(),
      slotCode: String(v[fieldOf.slotCode] || '').trim(),
      team: String(v[fieldOf.team] || '').trim(),
      contractType: String(v[fieldOf.contractType] || '').trim(),
      workstation: String(v[fieldOf.workstation] || '').trim(),
      cardIn: String(v[fieldOf.cardIn] || '').trim(),
      cardOut: String(v[fieldOf.cardOut] || '').trim(),
      agency: String(v[fieldOf.agency] || '').trim(),  // Nhà Thầu (Vendor) — lấy từ cột Agency StaffData
      date: normalizeStaffDate_(v[fieldOf.date]),  // ngay vao lam (StaffData Date) — chuẩn yyyy-MM-dd
    });
  }
  return out;
}

// ===== AttendanceTask =====

/** Map 1 dòng sheet → object task (theo TASK_COLS). */
function taskFromRow_(row) {
  const createdAt = row[TASK_COLS.CREATED_AT] || null;
  const completedAt = row[TASK_COLS.COMPLETED_AT] || null;
  return {
    taskId: String(row[TASK_COLS.TASK_ID] || ''),
    taskType: String(row[TASK_COLS.TASK_TYPE] || ''),
    station: String(row[TASK_COLS.STATION] || ''),
    slotCode: String(row[TASK_COLS.SLOT_CODE] || ''),
    team: String(row[TASK_COLS.TEAM] || ''),
    status: String(row[TASK_COLS.STATUS] || ''),
    // KHÔNG trả Date qua google.script.run (serialize lỗi → null toàn bộ).
    // Chỉ trả text đã format; createdBy/createdAtText đủ cho UI.
    createdBy: String(row[TASK_COLS.CREATED_BY] || ''),
    createdAtText: formatDateTime_(createdAt),
    completedAtText: formatDateTime_(completedAt),
    note: String(row[TASK_COLS.NOTE] || ''),
  };
}

/** Đọc 1 task theo taskId (scan toàn bộ cột taskId — Phase 0 đơn giản). */
function readTask_(taskId) {
  const sheet = getSheet_(SHEETS.ATTENDANCE_TASK);
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][TASK_COLS.TASK_ID] || '').trim() === taskId) {
      const task = taskFromRow_(values[i]);
      task._rowIndex = i + 1; // 1-based cho update
      return task;
    }
  }
  return null;
}

/**
 * Đọc task có cache ngắn (15s) — ĐƯỜNG QUÉT (scanStaff/pasteMealMoveScan) không
 * getDataRange AttendanceTask mỗi lần quét (task read per scan = full-sheet read).
 * Bỏ _rowIndex (chỉ dùng khi GHI — mọi write path đọc tươi qua readTask_).
 * Invalidate qua insertTask_/updateTaskStatus_/updateTaskNote_ (invalidateTaskCache_).
 */
function readTaskCached_(taskId) {
  return cachedJson_(CACHE_KEYS.TASK + taskId, function () {
    const task = readTask_(taskId);
    if (task) delete task._rowIndex;
    return task;
  }, CACHE_TTL.TASK);
}

/** Xoá cache task — gọi sau mọi ghi task (insert/update status/update note). */
function invalidateTaskCache_(taskId) {
  try { cache_().remove(CACHE_KEYS.TASK + taskId); }
  catch (e) { console.warn('invalidateTaskCache_ fail', taskId, e.message); }
}

/** Ghi task mới (append — tần suất thấp, chấp nhận appendRow). */
function insertTask_(task) {
  getSheet_(SHEETS.ATTENDANCE_TASK).appendRow([
    task.taskId, task.taskType, task.station, task.slotCode, task.team,
    task.status, task.createdAt, task.createdBy, task.completedAt || '', task.note || '',
  ]);
  invalidateTaskListCache_();
  invalidateTaskCache_(task.taskId);  // F8: phá negative-cache readTaskCached_ (taskId giờ-tạo có thể trùng)
  // F5: phá negative-cache (readTaskDetailCached_ cache null 15s nếu getTaskDetail gọi
  // trước khi task tồn tại — taskId dạng giờ-tạo có thể trùng giữa 2 lần create gần nhau).
  invalidateTaskDetailCache_(task.taskId);
}

/** Cập nhật ghi chú của task (cột NOTE). Gọi sau khi tạo (insertTask_ đã lưu note) để sửa. */
function updateTaskNote_(taskId, note, rowIndex) {
  const sheet = getSheet_(SHEETS.ATTENDANCE_TASK);
  const write = function (r) {
    sheet.getRange(r, TASK_COLS.NOTE + 1).setValue(note || '');
    invalidateTaskListCache_();
    invalidateTaskCache_(taskId);
    invalidateTaskDetailCache_(taskId);
    return true;
  };
  if (rowIndex) return write(rowIndex);
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][TASK_COLS.TASK_ID] || '').trim() === taskId) {
      return write(i + 1);
    }
  }
  return false;
}

/** Cập nhật trạng thái task (status, completedAt). */
function updateTaskStatus_(taskId, status, completedAt, rowIndex) {
  const sheet = getSheet_(SHEETS.ATTENDANCE_TASK);
  const write = function (r) {
    // P0 FIX: ghi 2 cột rời nhau (STATUS cột 6, COMPLETED_AT cột 9 — KHÔNG liền nhau,
    // TASK_COLS: STATUS=5, CREATED_AT=6, CREATED_BY=7, COMPLETED_AT=8).
    // Lỗi cũ: getRange(r, STATUS+1, 1, 2) ghi [status, completedAt] vào cột 6,7
    // → completedAt ĐÈ LÊN CREATED_AT (phá hủy thời điểm tạo), COMPLETED_AT không bao giờ ghi.
    sheet.getRange(r, TASK_COLS.STATUS + 1).setValue(status);
    sheet.getRange(r, TASK_COLS.COMPLETED_AT + 1).setValue(completedAt || '');
  };
  // F4: rowIndex optional — completeTask đã đọc task (có _rowIndex) → bỏ 1 lần
  // getDataRange + scan lại sheet (chỉ 1 caller duy nhất: TaskService.completeTask).
  if (rowIndex) {
    write(rowIndex);
    invalidateTaskListCache_();
    invalidateTaskCache_(taskId);
    invalidateTaskDetailCache_(taskId);
    return true;
  }
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][TASK_COLS.TASK_ID] || '').trim() === taskId) {
      write(i + 1);
      invalidateTaskListCache_();
      invalidateTaskCache_(taskId);
      invalidateTaskDetailCache_(taskId);
      return true;
    }
  }
  return false;
}

/** Danh sách task (cache 30s) — mới nhất lên đầu. */
function readTaskList_() {
  return cachedJson_(CACHE_KEYS.TASK_LIST, function () {
    const sheet = getSheet_(SHEETS.ATTENDANCE_TASK);
    const values = sheet.getDataRange().getValues();
    const out = [];
    for (let i = 1; i < values.length; i++) {
      const task = taskFromRow_(values[i]);
      if (task.taskId) out.push(task);
    }
    // Merge counters (total/scanned/extra) từ AttendanceLog — 1 lần đọc log + group,
    // không N+1 đọc log riêng từng task. (User yêu cầu cột đếm ở danh sách task.)
    const counters = taskCountersForList_();
    out.forEach(function (t) {
      const c = counters[t.taskId] || { total: 0, scanned: 0, extra: 0 };
      t.total = c.total; t.scanned = c.scanned; t.extra = c.extra;
    });
    return out.reverse(); // dòng mới nhất thường ở cuối → đưa lên đầu
  }, CACHE_TTL.TASK_LIST);
}

/** Đếm total/scanned/extra theo taskId cho DANH SÁCH task (cache 30s).
 * Đọc AttendanceLog 1 lần rồi group — tránh N+1. scanned theo epoch
 * (nguồn sự thật — khớp computeCounters). */
function taskCountersForList_() {
  return cachedJson_(CACHE_KEYS.TASK_COUNTS + 'all', function () {
    const sheet = getSheet_(SHEETS.ATTENDANCE_LOG);
    const values = sheet.getDataRange().getValues();
    const out = {};
    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      const taskId = String(row[LOG_COLS.TASK_ID] || '').trim();
      if (!taskId) continue;
      const st = String(row[LOG_COLS.STATUS] || '');
      const hasScan = !!row[LOG_COLS.TIME_SCAN];
      if (!out[taskId]) out[taskId] = { total: 0, scanned: 0, extra: 0 };
      out[taskId].total++;
      if (hasScan) out[taskId].scanned++;
      if (st === STATUS.EXTRA) out[taskId].extra++;
    }
    return out;
  }, CACHE_TTL.TASK_COUNTS);
}

function invalidateTaskListCache_() {
  cache_().remove(CACHE_KEYS.TASK_LIST);
  // P3: counters list đọc 1 lần + cache riêng — phải xóa cùng TASK_LIST, nếu không
  // task mới/reopen hiển thị total/scanned sai đến 30s (2 key độc lập không sync).
  cache_().remove(CACHE_KEYS.TASK_COUNTS + 'all');
}

// ===== AttendanceLog =====

/** Map 1 dòng sheet → object log (theo LOG_COLS). */
function logFromRow_(taskId, row) {
  const timeRef = row[LOG_COLS.TIME_REF] || null;
  const timeScan = row[LOG_COLS.TIME_SCAN] || null;
  const timeRa = row[LOG_COLS.TIME_RA] || null;  // meal-move: giờ Ra
  return {
    taskId: taskId,
    staffId: String(row[LOG_COLS.STAFF_ID] || '').trim(),
    staffName: String(row[LOG_COLS.STAFF_NAME] || ''),
    slotCode: String(row[LOG_COLS.SLOT_CODE] || ''),
    station: String(row[LOG_COLS.STATION] || ''),
    team: String(row[LOG_COLS.TEAM] || ''),
    workstation: String(row[LOG_COLS.WORKSTATION] || ''),
    // meal-move: Nhà Thầu (agency copy từ StaffData)
    agency: String(row[LOG_COLS.AGENCY] || ''),
    // KHÔNG trả Date qua google.script.run (serialize lỗi → null toàn bộ).
    // Chỉ trả text đã format theo TZ script — client hiển thị trực tiếp.
    timeRefText: formatTime_(timeRef),
    timeScanText: formatTime_(timeScan),
    // Sort key số (epoch ms) — text "HH:mm:ss" mất ngày → sort chuỗi sai khi task
    // xuyên nửa đêm. Client sort theo con số này (chính xác tuyệt đối).
    timeScanEpoch: timeScan ? timeScan.getTime() : 0,
    // meal-move: giờ Ra + epoch (sort/counter cho Ra)
    timeRaText: formatTime_(timeRa),
    timeRaEpoch: timeRa ? timeRa.getTime() : 0,
    // meal-move: số phút giữa Ra→Vào (chỉ khi có cả 2)
    durationMinutes: (timeRa && timeScan) ? Math.round((timeScan.getTime() - timeRa.getTime()) / 60000) : 0,
    status: String(row[LOG_COLS.STATUS] || ''),
    // Date = ngay vao lam (copy tu StaffData) — format yyyy-MM-dd (ISO) cho hien thi
    dateText: formatDateShort_(row[LOG_COLS.DATE]),
  };
}
/** Đọc toàn bộ dòng log của task (đọc tươi từ sheet — không cache). */
function readLogRows_(taskId) {
  const sheet = getSheet_(SHEETS.ATTENDANCE_LOG);
  const values = sheet.getDataRange().getValues();
  const out = [];
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][LOG_COLS.TASK_ID] || '').trim() === taskId) {
      const row = logFromRow_(taskId, values[i]);
      row._rowIndex = i + 1; // 1-based cho update
      out.push(row);
    }
  }
  return out;
}

/**
 * Đọc log rows của task có cache (30s) — dành cho ĐƯỜNG QUÉT (U2/scanStaff).
 * V2 khác v1: update-in-place (không append-only) nên không áp dynamic tail-rows;
 * thay bằng cache ngắn hạn + INCREMENTAL update (updateLogRowCache_) — scan chạy
 * liên tiếp không chạm sheet log, chỉ 1 setValues cho dòng được quét.
 * F2 (simplify): cache SLIM — chỉ giữ field đường quét cần (staffId/staffName/
 * timeScanText/timeScanEpoch/status/_rowIndex), KHÔNG nhét 12 field: 66KB→32KB
 * (tránh chạm giới hạn 100KB/key khi task lớn, giảm eviction 500KB script cache).
 * _rowIndex giữ nguyên (cần cho update) — KHÔNG dùng bản này cho UI (dùng riêng
 * readTaskDetailCached_).
 */
function readLogRowsCached_(taskId) {
  return cachedJson_(CACHE_KEYS.LOG_ROWS + taskId, function () {
    return readLogRows_(taskId).map(function (r) {
      return {
        taskId: taskId,          // update log row write cần (invalidate detail/update cache)
        staffId: r.staffId,
        staffName: r.staffName,
        slotCode: r.slotCode,
        station: r.station,
        team: r.team,
        agency: r.agency,          // meal-move: Nhà Thầu
        timeRaText: r.timeRaText,  // meal-move: giờ Ra
        timeRaEpoch: r.timeRaEpoch, // meal-move: epoch Ra (sort + duplicate check)
        timeScanText: r.timeScanText,
        timeScanEpoch: r.timeScanEpoch,
        durationMinutes: r.durationMinutes, // meal-move: số phút Ra→Vào
        status: r.status,
        dateText: r.dateText,
        _rowIndex: r._rowIndex,
      };
    });
  }, CACHE_TTL.LOG_ROWS);
}

/** Xoá cache log rows của task (gọi khi ghi batch/append mới — không cần cho scan update). */
function invalidateLogRows_(taskId) {
  try { cache_().remove(CACHE_KEYS.LOG_ROWS + taskId); }
  catch (e) { console.warn('invalidateLogRows_ fail', taskId, e.message); }  // F6: không giấu lỗi âm thầm (cache sống tiếp → duplicate Dư)
}

/**
 * Pre-fill log batch 1 lần (createReconcileTask) — KHÔNG appendRow trong loop.
 * @param {string} taskId
 * @param {Array<Object>} staffList — NV khớp tổ hợp
 * @param {Date} createdAt
 */
function batchInsertLogRows_(taskId, staffList, createdAt) {
  if (!staffList || !staffList.length) return 0;
  const sheet = getSheet_(SHEETS.ATTENDANCE_LOG);
  const startRow = sheet.getLastRow() + 1;
  const rows = staffList.map(function (s) {
    return [
      taskId, s.staffId, s.staffName, s.slotCode, s.station, s.team, s.workstation,
      createdAt, '', STATUS.PENDING, s.date || '',
      '', s.agency || '',  // timeRa (trống), agency (Nhà Thầu — meal-move)
    ];
  });
  sheet.getRange(startRow, 1, rows.length, LOG_COL_COUNT).setValues(rows);
  // Yêu cầu 2026-08-10: tạo task xong → PRE-WARM cache log (LOG_ROWS) NGAY để lần scan
  // đầu tiên có sẵn thông tin NV (tên/ca/team/station/vender) — không phải đọc lại cả
  // sheet AttendanceLog (lần đầu cold = chậm). Dùng ĐÚNG slim schema readLogRowsCached_
  // (kể cả _rowIndex khớp sheet) nên updateLogRowCache_ (quét tiếp theo) vẫn hoạt động.
  // Task quá lớn (cache >100KB) → warm fail → invalidate như cũ (cold lần đầu, an toàn).
  if (!warmLogRowsCache_(taskId, staffList, startRow)) invalidateLogRows_(taskId);
  return rows.length;
}

/**
 * Pre-warm cache LOG_ROWS sau khi tạo task (batchInsertLogRows_) — scan lần đầu
 * (readLogRowsCached_) có sẵn thông tin NV không cần đọc lại cả sheet AttendanceLog.
 * Slim schema GIỐNG HỆT readLogRowsCached_ (status = PENDING, giờ trống, _rowIndex
 * khớp vị trí sheet) — updateLogRowCache_ tìm theo _rowIndex vẫn cập nhật được.
 * @param {string} taskId
 * @param {Array<Object>} staffList — NV vừa pre-fill (staffId/staffName/slotCode/station/team/agency/date)
 * @param {number} startRow — dòng đầu tiên vừa ghi trong sheet log (1-based)
 * @returns {boolean} true nếu put cache thành công; false → caller invalidate (fallback cold)
 */
function warmLogRowsCache_(taskId, staffList, startRow) {
  try {
    const rows = staffList.map(function (s, i) {
      return {
        taskId: taskId,
        staffId: s.staffId,
        staffName: s.staffName || '',
        slotCode: s.slotCode || '',
        station: s.station || '',
        team: s.team || '',
        agency: s.agency || '',
        timeRaText: '',
        timeRaEpoch: 0,
        timeScanText: '',
        timeScanEpoch: 0,
        durationMinutes: 0,
        status: STATUS.PENDING,
        dateText: formatDateShort_(s.date),
        _rowIndex: startRow + i,
      };
    });
    cache_().put(CACHE_KEYS.LOG_ROWS + taskId, JSON.stringify(rows), CACHE_TTL.LOG_ROWS);
    return true;
  } catch (e) {
    console.warn('warmLogRowsCache_ fail (task quá lớn cho cache?)', taskId, e.message);  // F3: log để biết đang fallback cold
    return false;
  }
}

/**
 * Đọc chi tiết task + log có cache (giảm đọc sheet khi chuyển task qua lại).
 * Invalidate bằng invalidateTaskDetailCache_(taskId) mỗi khi ghi log/đổi status.
 * Lưu ý: task/log chỉ chứa text (formatTime_) — cache JSON an toàn (không Date).
 */
function readTaskDetailCached_(taskId) {
  return cachedJson_(CACHE_KEYS.TASK_DETAIL + taskId, function () {
    const task = readTask_(taskId);
    if (!task) return null;
    const log = readLogRows_(taskId);
    const counters = computeCounters({ STATUS: STATUS }, log);
    // P3: strip _rowIndex khỏi cache — rowIndex chỉ dùng khi GHI (updateLogRowScan_/
    // updateTaskStatus_ luôn đọc tươi qua readLogRows_/readTask_, không qua cache).
    // Cache giữ _rowIndex → stale nếu log/task bị xóa/chèn giữa chừng.
    delete task._rowIndex;
    log.forEach(function (r) { delete r._rowIndex; });
    return { task: task, log: log, counters: counters };
  }, CACHE_TTL.TASK_DETAIL);
}

/** Xoá cache chi tiết task — gọi sau mọi ghi log/đổi status. */
function invalidateTaskDetailCache_(taskId) {
  try { cache_().remove(CACHE_KEYS.TASK_DETAIL + taskId); }
  catch (e) { console.warn('cache remove fail', CACHE_KEYS.TASK_DETAIL + taskId, e.message); }
}

/**
 * Chuyển status hàng loạt cho 1 task — batch setValues 1 lần cả cột status.
 * Dùng chung cho markUnscannedAbsent_ (kết thúc) và resetAbsentToPending_ (mở lại).
 * P1: batch setValues — KHÔNG setValue trong loop (241 NV = 241 calls → timeout risk).
 * P1: ghi 1 lần CẢ CỘT status từ values đã sửa trong memory — thay vì N RPC setValues
 * (worst case 241 NV quét xen kẽ = ~240 RPC → 12-24s). Idempotent: dòng không thuộc
 * task được ghi lại đúng giá trị vừa đọc. An toàn vì caller giữ LockService.
 * @param {string} taskId
 * @param {function(string, any): string|null} mutate — (status, timeScan) => status mới
 *   hoặc null (không đổi)
 * @returns {number} số dòng đã đổi
 */
function transformLogStatuses_(taskId, mutate) {
  const sheet = getSheet_(SHEETS.ATTENDANCE_LOG);
  const values = sheet.getDataRange().getValues();
  let done = 0;
  let anyChanged = false;
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (String(row[LOG_COLS.TASK_ID] || '').trim() !== taskId) continue;
    const timeScan = row[LOG_COLS.TIME_SCAN];
    const status = String(row[LOG_COLS.STATUS] || '');
    const next = mutate(status, timeScan);
    if (next !== null && next !== status) {
      values[i][LOG_COLS.STATUS] = next;
      done++;
      anyChanged = true;
    }
  }
  if (anyChanged) {
    const statusCol = LOG_COLS.STATUS + 1;
    // P2: ghi từ row 2 — values[0] là header, không được ghi đè (dù idempotent hôm nay,
    // fragile nếu đổi tên header); col.slice(1) bỏ header khỏi payload.
    const col = [];
    for (let r = 1; r < values.length; r++) col.push([values[r][LOG_COLS.STATUS]]);
    sheet.getRange(2, statusCol, values.length - 1, 1).setValues(col);
    invalidateTaskDetailCache_(taskId);
    invalidateLogRows_(taskId); // U2: status hàng loạt đổi → cache log rows cũ lệch, xoá
  }
  return done;
}

/** Khi kết thúc task: chuyển dòng chưa quét (timeScan rỗng, status '-') thành 'Vắng'. */
function markUnscannedAbsent_(taskId, taskType) {
  // meal-move: thiếu Vào (timeScan rỗng) = Vắng — bất kể đã có Ra hay chưa
  var isMealMove = taskType === TASK_TYPE.MEAL_MOVE;
  return transformLogStatuses_(taskId, function (status, timeScan) {
    if (timeScan && status === STATUS.PENDING) {
      // P1: insurance data-repair — dòng có timeScan nhưng status còn '-' (data legacy/
      // sửa tay; mọi write path đều ghi 2 cột trong 1 setValues atomic dưới LockService
      // nên luồng bình thường không sinh ra state này). KHÔNG đánh Vắng — chuẩn hóa
      // thành Có mặt.
      return STATUS.PRESENT;
    }
    if (!timeScan) {
      // Chưa có Vào — Vắng (cả reconcile lẫn meal-move)
      // meal-move: NV đã Ra (OUT) nhưng chưa Vào cũng thành Vắng
      if (status === STATUS.PENDING || (isMealMove && status === STATUS.OUT)) return STATUS.ABSENT;
    }
    return null;
  });
}

/** Mở lại task: reset NV Vắng (ABSENT) về Chưa điểm danh (PENDING). NV Có mặt giữ nguyên. */
function resetAbsentToPending_(taskId) {
  const n = transformLogStatuses_(taskId, function (status) {
    return status === STATUS.ABSENT ? STATUS.PENDING : null;
  });
  // Reopen đổi status task → danh sách cần refresh counters (khác mark: completeTask
  // tự gọi updateTaskStatus_ → invalidateTaskListCache_ kế đó, nên mark không cần ở đây).
  if (n > 0) invalidateTaskListCache_();
  return n;
}

/**
 * Cập nhật timeScan + status cho 1 dòng (theo _rowIndex) — 1 setValues batch.
 * @param {Object} row — từ readLogRows_/readLogRowsCached_ (luôn có _rowIndex, taskId)
 */
function updateLogRowScan_(row, timeScan, status) {
  const sheet = getSheet_(SHEETS.ATTENDANCE_LOG);
  sheet.getRange(row._rowIndex, LOG_COLS.TIME_SCAN + 1, 1, 2).setValues([[timeScan, status]]);
  invalidateTaskDetailCache_(row.taskId);
  // U2: cập nhật row trong LOG_ROWS cache (incremental) — scan kế không chạm sheet.
  // KHÔNG nhét Date timeScan vào cache: JSON→string; schema slim chỉ có text+epoch.
  updateLogRowCache_(row.taskId, row._rowIndex, function (r) {
    r.status = status;
    r.timeScanText = formatTime_(timeScan);
    r.timeScanEpoch = timeScan.getTime();
    // meal-move: nếu có timeRa → cập nhật durationMinutes
    if (r.timeRaEpoch > 0 && r.timeScanEpoch > 0) {
      r.durationMinutes = Math.round((r.timeScanEpoch - r.timeRaEpoch) / 60000);
    }
  });
  return true;
}

/**
 * Cập nhật 1 dòng trong LOG_ROWS cache sau khi ghi sheet (incremental).
 * Chỉ chạm cache NẾU đang có (cache hit) — miss thì dòng sau sẽ rebuild. Tránh
 * getDataRange full sheet log mỗi scan liên tiếp.
 * @param {string} taskId
 * @param {number} rowIndex 1-based
 * @param {Function} mutate(r) — sửa object row trong cache tại chỗ
 */
function updateLogRowCache_(taskId, rowIndex, mutate) {
  try {
    const key = CACHE_KEYS.LOG_ROWS + taskId;
    const cached = cache_().get(key);
    if (cached === null) return; // miss — không xây cache trong luồng ghi
    const rows = JSON.parse(cached);
    for (let i = 0; i < rows.length; i++) {
      if (rows[i]._rowIndex === rowIndex) { mutate(rows[i]); break; }
    }
    cache_().put(key, JSON.stringify(rows), CACHE_TTL.LOG_ROWS);
  } catch (e) { console.warn('updateLogRowCache_ fail', taskId, e.message); }
}

/** Append dòng mới (quét lạ → Dư). */
function appendLogRow_(row) {
  getSheet_(SHEETS.ATTENDANCE_LOG).appendRow([
    row.taskId, row.staffId, row.staffName, row.slotCode, row.station, row.team, row.workstation,
    row.timeRef || '', row.timeScan || '', row.status, row.date || '',
    row.timeRa || '', row.agency || '',  // timeRa, agency (meal-move)
  ]);
  invalidateTaskDetailCache_(row.taskId);
  invalidateLogRows_(row.taskId); // U2: dòng mới append cuối — cache cũ thiếu dòng → xoá (tần suất thấp)
}

/** Ghi đè toàn bộ StaffData từ dữ liệu csv đã parse (syncFromCsv). */
function overwriteStaffData_(staffList) {
  const sheet = getSheet_(SHEETS.STAFF_DATA);
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, STAFF_DATA_COL_COUNT).clearContent();
  if (!staffList || !staffList.length) return 0;
  const rows = staffList.map(function (s) {
    return [
      s.no, s.date, s.staffId, s.staffName, s.staffEmail, s.agency, s.contractType, s.eventId,
      s.matchingType, s.gender, s.department, s.cardIn, s.cardOut, s.actualHours,
      s.cardInRemark, s.cardOutRemark, s.slotCode, s.workstation, s.team, s.station,
    ];
  });
  sheet.getRange(2, 1, rows.length, STAFF_DATA_COL_COUNT).setValues(rows);
  invalidateStaffIndex_();
  return rows.length;
}

// ===== Meal-move (2026-08-04) =====

/**
 * Cập nhật timeRa + status cho 1 dòng (theo _rowIndex) — ghi 2 ô riêng lẻ.
 * TIME_RA (cột 12) và STATUS (cột 10) KHÔNG liền nhau → 2 setValue (tần suất thấp).
 * @param {Object} row — từ readLogRows_/readLogRowsCached_ (có _rowIndex, taskId)
 * @param {Date} timeRa
 * @param {string} status — STATUS.OUT (Ra ngoài) hoặc STATUS.EXTRA
 */
function updateLogRowRa_(row, timeRa, status) {
  const sheet = getSheet_(SHEETS.ATTENDANCE_LOG);
  sheet.getRange(row._rowIndex, LOG_COLS.TIME_RA + 1).setValue(timeRa);
  sheet.getRange(row._rowIndex, LOG_COLS.STATUS + 1).setValue(status);
  invalidateTaskDetailCache_(row.taskId);
  updateLogRowCache_(row.taskId, row._rowIndex, function (r) {
    r.status = status;
    r.timeRaText = formatTime_(timeRa);
    r.timeRaEpoch = timeRa.getTime();
  });
  return true;
}

/**
 * Ghi hàng loạt cập nhật log cho 1 task (paste meal-move) — batch setValues 1 lần.
 * Chỉ chạm 3 cột: STATUS, TIME_RA, TIME_SCAN. Đọc toàn bộ values → sửa trong
 * memory → ghi cả cột (idempotent — dòng không thuộc update được ghi lại đúng).
 * @param {string} taskId
 * @param {Array<{_rowIndex:number, status:string, timeRa?:Date, timeScan?:Date}>} updates
 * @returns {number} số dòng đã đổi
 */
function batchMealMoveLogUpdates_(taskId, updates) {
  if (!updates || !updates.length) return 0;
  const sheet = getSheet_(SHEETS.ATTENDANCE_LOG);
  const values = sheet.getDataRange().getValues();
  const byRow = {};
  updates.forEach(function (u) { byRow[u._rowIndex] = u; });
  let anyChanged = false;
  for (let i = 1; i < values.length; i++) {
    const u = byRow[i + 1]; // FIX: off-by-one — _rowIndex 1-based, i 0-based → i+1 = sheet row
    if (!u) continue;
    if (u.timeRa) { values[i][LOG_COLS.TIME_RA] = u.timeRa; anyChanged = true; }
    if (u.timeScan) { values[i][LOG_COLS.TIME_SCAN] = u.timeScan; anyChanged = true; }
    if (u.status && values[i][LOG_COLS.STATUS] !== u.status) {
      values[i][LOG_COLS.STATUS] = u.status; anyChanged = true;
    }
  }
  if (anyChanged) {
    [LOG_COLS.STATUS, LOG_COLS.TIME_RA, LOG_COLS.TIME_SCAN].forEach(function (colIdx) {
      const col = [];
      for (let r = 1; r < values.length; r++) col.push([values[r][colIdx]]);
      const colRange = sheet.getRange(2, colIdx + 1, values.length - 1, 1);
      colRange.setValues(col);
      // Ép format HH:mm:ss cho cột thời gian (Date object hiển thị đúng)
      if (colIdx === LOG_COLS.TIME_RA || colIdx === LOG_COLS.TIME_SCAN) {
        colRange.setNumberFormat('HH:mm:ss');
      }
    });
    invalidateTaskDetailCache_(taskId);
    invalidateLogRows_(taskId);
  }
  return anyChanged ? updates.length : 0;
}

/**
 * Append nhiều dòng log trong 1 batch (paste meal-move NV lạ) — KHÔNG appendRow loop.
 * @param {Array<Object>} rows — mảng row object (buildMealMoveExtraRow)
 * @returns {number}
 */
function batchAppendLogRows_(rows) {
  if (!rows || !rows.length) return 0;
  const sheet = getSheet_(SHEETS.ATTENDANCE_LOG);
  const startRow = sheet.getLastRow() + 1;
  const payload = rows.map(function (row) {
    return [
      row.taskId, row.staffId, row.staffName, row.slotCode, row.station, row.team, row.workstation,
      row.timeRef || '', row.timeScan || '', row.status, row.date || '',
      row.timeRa || '', row.agency || '',
    ];
  });
  const range = sheet.getRange(startRow, 1, payload.length, LOG_COL_COUNT);
  range.setValues(payload);
  // Meal-move: ép format HH:mm:ss cho cột TIME_SCAN(8) + TIME_RA(12) — đảm bảo
  // Date object hiển thị đúng (cell Text format → Date bị serialize thành string ≠ HH:mm:ss).
  var fmtRange = sheet.getRange(startRow, LOG_COLS.TIME_SCAN + 1, payload.length, 1);
  fmtRange.setNumberFormat('HH:mm:ss');
  var fmtRangeRa = sheet.getRange(startRow, LOG_COLS.TIME_RA + 1, payload.length, 1);
  fmtRangeRa.setNumberFormat('HH:mm:ss');
  const seen = {};
  rows.forEach(function (r) {
    if (!seen[r.taskId]) { seen[r.taskId] = true; invalidateTaskDetailCache_(r.taskId); invalidateLogRows_(r.taskId); }
  });
  return rows.length;
}
