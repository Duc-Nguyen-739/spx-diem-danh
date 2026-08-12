/**
 * Code.gs — Entry point + API endpoints (google.script.run).
 *
 * API (gọi từ client index.html):
 *   getMeta()                    → { appTitle, labels, tableHeaders }
 *   getFilterOptions()           → { stations, slotCodes, teams }
 *   createReconcileTask(input)   → { ok, taskId, count, message }
 *   getTaskList()                → [{ taskId, station, slotCode, team, status, createdAt }]
 *   getTaskDetail(taskId)        → { ok, task, log, counters }
 *   scanStaff(taskId, staffId, mode) → { ok, message, status, scanPhase, counters }
 *   createMealMoveTaskApi(input)     → { ok, taskId, count, message }
 *   pasteMealMoveScanApi(taskId, codes, mode) → { ok, message, summary, counters }
 *   completeTask(taskId)         → { ok, message }
 *   searchStaffApi(code)         → { ok, staff, tasks, taskCount } — NV + task đã điểm danh (header search)
 *   syncFromCsv()                → { ok, count, message } — gọi từ editor (Phase 0)
 *
 * HTTP GET (doGet) ngoài google.script.run:
 *   ?debug=1 / ?debug=createTask   → QA, editor-only (gate isEditor_)
 *   ?action=..&args=..&cb=..       → JSONP API cho trang STANDALONE tĩnh (whitelist —
 *                                    JsonpApi.gs). Trang standalone = serve top-level
 *                                    (serve.js preview / build-static hosting — inject
 *                                    __RC_STANDALONE__ + __RC_API_BASE__) → camera live
 *                                    trên iOS; GAS chỉ làm backend qua JSONP (GAS không
 *                                    CORS; ContentService HTML echo = text/plain, 2026-08-12)
 */

/** WebApp: trả về index.html. */
function doGet(e) {
  // Tự khởi tạo mọi sheet (kèm header) — không cần chạy setupSheets() tay.
  // getSheet_() chỉ set header khi sheet trống, nên gọi mỗi lần load rất rẻ.
  ensureSheets_();
  // Debug: URL?debug=1 → trả JSON cấu trúc sheet (QA/verify — KHÔNG dùng production)
  // P2: gate editor-only — kiosk anonymous, ai cũng gọi URL này → leak cấu trúc
  // sheet + taskId + mẫu log. Session.getActiveUser() rỗng khi anonymous truy cập.
  if (e && e.parameter && e.parameter.debug === '1') {
    if (!isEditor_()) {
      return ContentService.createTextOutput(JSON.stringify({
        error: 'debug=1 chỉ chạy từ Script Editor',
      })).setMimeType(ContentService.MimeType.JSON);
    }
    return ContentService.createTextOutput(JSON.stringify(debugState()))
      .setMimeType(ContentService.MimeType.JSON);
  }
  // Debug: URL?debug=createTask&station=..&slotCode=..&team=.. → tạo task thật + trả detail
  // (CHỈ dùng QA — mở khóa khi cần test luồng end-to-end không qua UI)
  // P1: gate editor-only — kiosk anonymous, ai cũng gọi URL này → tạo task rác.
  // Session.getActiveUser() rỗng khi anonymous truy cập webapp.
  if (e && e.parameter && e.parameter.debug === 'createTask') {
    if (!isEditor_()) {
      return ContentService.createTextOutput(JSON.stringify({
        error: 'debug=createTask chỉ chạy từ Script Editor',
      })).setMimeType(ContentService.MimeType.JSON);
    }
    try {
      const input = {
        station: e.parameter.station || '',
        slotCode: e.parameter.slotCode || '',
        team: e.parameter.team || '',
      };
      const created = createReconcileTask(input);
      const detail = created.ok ? getTaskDetail(created.taskId) : null;
      return ContentService.createTextOutput(JSON.stringify({
        create: created,
        detail: detail ? {
          ok: detail.ok,
          taskId: detail.task ? detail.task.taskId : null,
          logLen: detail.log ? detail.log.length : 0,
          logFirst: detail.log && detail.log.length ? detail.log[0] : null,
          counters: detail.counters,
        } : null,
      })).setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({ error: String(err) }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }
  // JSONP API cho trang STANDALONE tĩnh (preview/hosting): trang top-level không có
  // google.script.run → js.html shim (cờ __RC_STANDALONE__ do serve.js/build-static.js
  // inject) gọi về đây bằng script tag (xem JsonpApi.gs).
  // LƯU Ý (2026-08-12, đã verify): KHÔNG thể serve trang standalone trực tiếp từ GAS —
  // (1) HtmlService luôn bọc iframe wrapper → iOS chặn camera; (2) ContentService trả
  // HTML qua URL echo một-lần với Content-Type text/plain → trình duyệt hiện source,
  // không render. Đường đúng: serve app ở host top-level bất kỳ + gọi GAS qua JSONP.
  if (e && e.parameter && e.parameter.action) {
    return handleJsonpRequest_(e);
  }
  // index.html chứa HTML thuần + scriptlet <?!= include('css') ?> / <?!= include('js') ?>.
  // createTemplateFromFile().evaluate() là cơ chế CHUẨN của GAS để nhúng file .html
  // khác (css.html/js.html) — KHÔNG bị sanitize như createHtmlOutput/setContent
  // (sanitize sẽ strip <script> → app xoay tròn không load được, bug 2026-08-11).
  // serve.js / build-static.js thay cùng scriptlet bằng nội dung file (scripts/inline-html.js).
  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle(WEB_APP.PAGE_TITLE)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

/**
 * Helper include cho template: trả nội dung file .html (đuôi .html là implicit).
 * Dùng trong index.html: <?!= include('css') ?> → nội dung css.html (đã bọc <style>),
 * <?!= include('js') ?> → nội dung js.html (đã bọc <script>).
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/** Debug: cấu trúc toàn bộ sheet (chạy qua ?debug=1). */
function debugState() {
  // P1: gate editor-only NGAY ĐẦU hàm — debugState() là function public, ai cũng gọi
  // qua google.script.run.debugState() từ console kiosk anonymous (gate trong doGet
  // chỉ bảo vệ đường ?debug=1). Leak: spreadsheetId + cấu trúc sheet + mẫu log.
  if (!isEditor_()) {
    return { error: 'debugState chỉ chạy từ Script Editor' };
  }
  const ss = getSpreadsheet_();
  const out = { spreadsheetId: ss.getId(), sheets: {} };
  ['Config', 'StaffData', 'AttendanceTask', 'AttendanceLog'].forEach(function (name) {
    const s = ss.getSheetByName(name);
    if (!s) { out.sheets[name] = 'MISSING'; return; }
    const v = s.getDataRange().getValues();
    const rows = [];
    for (let i = 0; i < Math.min(v.length, 4); i++) {
      rows.push((v[i] || []).map(function (c) {
        return String(c === undefined ? '' : c).slice(0, 18);
      }).join(' | ').slice(0, 220));
    }
    out.sheets[name] = {
      rows: v.length,
      cols: v[0] ? v[0].length : 0,
      first: rows[0] || '',
      sample: rows,
    };
  });
  // Test getTaskDetail trực tiếp (verify API không throw)
  const tlist = readTaskList_();
  out.tasks = tlist.map(function (t) { return t.taskId; });
  if (tlist.length) {
    try {
      out.taskDetailProbe = getTaskDetail(tlist[0].taskId);
      const td = out.taskDetailProbe;
      out.taskDetailProbe.task = td.task ? { taskId: td.task.taskId, status: td.task.status } : null;
      out.taskDetailProbe.logLen = td.log ? td.log.length : 0;
      if (td.log && td.log.length) {
        out.taskDetailProbe.logFirst = td.log[0];
      }
    } catch (e) {
      out.taskDetailProbeError = String(e);
    }
  }
  return out;
}

/** Meta cho UI: title + email người dùng hiện tại (phân quyền chuyển Ra/Vào meal-move). */
function getMeta() {
  let currentUser = '';
  try {
    currentUser = String(Session.getActiveUser().getEmail() || '').trim();
  } catch (e) { /* anonymous web app → '' → client fallback + server tự ép quyền */ }
  return {
    ok: true,
    appTitle: UI_LABELS.APP_TITLE,
    currentUser: currentUser,
  };
}

/** Distinct values cho dropdown. */
function getFilterOptions() {
  const staffList = readStaffList_();
  // Yêu cầu 2026-08-12: "Loại hợp đồng" đọc THẬT từ cột G (Contract Type) StaffData
  // thay vì hardcode FTE/BPO/OS — distinctValues đã lọc rỗng + sort. Fallback hằng số
  // CONTRACT_TYPES khi sheet không có dữ liệu (tránh dropdown rỗng).
  const contractTypes = distinctValues(staffList, 'contractType');
  return {
    ok: true,
    stations: distinctValues(staffList, 'station'),
    slotCodes: distinctValues(staffList, 'slotCode'),
    teams: distinctValues(staffList, 'team'),
    dates: distinctValues(staffList, 'date'),  // ngay vao lam — dropdown modal
    contractTypes: contractTypes.length ? contractTypes : CONTRACT_TYPES,
  };
}

/** Xem truoc so NV khop bo loc truoc khi tao task (modal) — khong tao gi ca. */
function previewStaffApi(input) {
  const staffList = readStaffList_();
  const filtered = filterStaffByGroup(staffList, {
    station: input && input.station,
    slotCode: input && input.slotCode,
    team: input && input.team,
    date: input && input.date,
    contractType: input && input.contractType,
  });
  // Tái dùng dedupeStaffByGroup (đã test) — đảm bảo count preview khớp count tạo task thật.
  const deduped = dedupeStaffByGroup(filtered);
  return {
    ok: true,
    count: deduped.length,  // chi tra count — khong gui sample (user bo hien thi 10 NV dau)
  };
}

/**
 * Tra cứu nhanh NV theo mã Ops (header search).
 * Trả hồ sơ NV + các task mà mã này ĐÃ điểm danh (AttendanceLog có timeScan/timeRa)
 * → client lọc "Danh Sách Task" theo danh sách task này. Không tạo gì cả.
 * staff = null khi mã chỉ xuất hiện trong log (NV Dư) mà không có trong StaffData.
 */
function searchStaffApi(code) {
  const q = String(code || '').trim().toUpperCase();
  if (!q) return { ok: false, message: 'Nhập mã Ops để tìm' };
  const staffList = readStaffList_();
  const matches = staffList.filter(function (s) {
    return String(s.staffId || '').toUpperCase() === q;
  });
  const staff = matches.length ? (function () {
    const s = matches[0];
    const o = { staffId: s.staffId, staffName: s.staffName, slotCode: s.slotCode, team: s.team, station: s.station };
    if (s.agency) o.agency = s.agency;
    if (s.date) o.date = s.date;
    if (s.contractType) o.contractType = s.contractType;
    return o;
  })() : null;

  // Task mà NV đã từng điểm danh: đọc AttendanceLog 1 lần (batch), lọc theo mã
  // + đã quét. Reuse readTaskList_ (đã có counters total/scanned/extra + cache 30s)
  // → danh sách lọc khớp định dạng list chính.
  const logValues = getSheet_(SHEETS.ATTENDANCE_LOG).getDataRange().getValues().slice(1);
  const taskIds = collectTaskIdsByStaffLog_(logValues, q, LOG_COLS);
  const tasks = taskIds.length
    ? readTaskList_().filter(function (t) { return taskIds.indexOf(t.taskId) >= 0; })
    : [];

  if (!staff && !tasks.length) return { ok: false, message: 'Không tìm thấy mã ' + q };
  return { ok: true, staff: staff, tasks: tasks, taskCount: tasks.length };
}

/**
 * Staff index COMPACT cho CLIENT — scan mã Ops hiện thông tin NGAY từ cache client
 * (Tên/Ca/Team/Station/Vender), không chờ server round-trip cho NV lạ (Dư).
 * Server đã cache STAFF_INDEX 5m (readStaffIndex_) → RPC rẻ; client cache thêm localStorage.
 */
function getStaffIndexApi() {
  const index = readStaffIndex_();
  const out = {};
  Object.keys(index).forEach(function (id) {
    const s = index[id] || {};
    out[id] = {
      staffName: s.staffName || '',
      slotCode: s.slotCode || '',
      station: s.station || '',
      team: s.team || '',
      workstation: s.workstation || '',
      agency: s.agency || '',
    };
  });
  return { ok: true, staff: out, count: Object.keys(out).length };
}

/** Tạo task đối chiếu + pre-fill. */
function createReconcileTaskApi(input) {
  return createReconcileTask(input);
}

/** Tạo task Đi ăn + Move — roster từ danh sách mã Ops (paste/quét); createdBy lấy server-side. */
function createMealMoveTaskApi(input) {
  return createMealMoveTask(input);
}

/** Paste hàng loạt mã Ops cho task meal-move — ghi Ra/Vào cả danh sách (tối đa 200 mã). */
function pasteMealMoveScanApi(taskId, codes, mode) {
  return pasteMealMoveScan(taskId, codes, mode);
}

/** Danh sách task. */
function getTaskListApi() {
  return listTasks();
}

/** Chi tiết task + log + counters. */
function getTaskDetailApi(taskId) {
  return getTaskDetail(taskId);
}

/** Quét NV — meal-move: truyền mode 'ra'|'vao' (server tự validate permission, không tin client). */
function scanStaffApi(taskId, staffId, mode) {
  return scanStaff(taskId, staffId, mode);
}

/** Kết thúc task. */
function completeTaskApi(taskId) {
  return completeTask(taskId);
}

/** Mở lại task đã đóng (reset NV Vắng → Chưa điểm danh, cho quét tiếp). */
function reopenTaskApi(taskId) {
  return reopenTask(taskId);
}

/** Cập nhật ghi chú của task (sửa trong task — open/done đều được). */
function updateTaskNoteApi(taskId, note) {
  return updateTaskNote(taskId, note);
}

/**
 * Gate editor-only — kiosk anonymous.
 * USER_DEPLOYING: getEffectiveUser() = deployer (user sở hữu script); getActiveUser()
 * trả email người truy cập webapp NẾU đã đăng nhập Google (bất kỳ tài khoản nào),
 * rỗng nếu anonymous. Chỉ deployer được chạy thao tác nguy hiểm (debug/sync/setup).
 * Dùng chung cho mọi thao tác nguy hiểm — 1 nơi sửa logic.
 */
function isEditor_() {
  try {
    const active = Session.getActiveUser().getEmail();
    const effective = Session.getEffectiveUser().getEmail();
    // fail-closed: phải có active user VÀ là deployer
    return !!(active && active.toLowerCase() === effective.toLowerCase());
  } catch (e) {
    return false; // lỗi quyền → chặn (không fail-open)
  }
}

/**
 * Đồng bộ StaffData từ csv (Phase 0: gọi từ editor; Phase 2+: trigger tự động).
 * Mở sheet StaffData, dán csv, chạy hàm này — sheet sẽ được ghi đè.
 * @returns {{ok: boolean, count: number, message: string}}
 */
function syncFromCsv() {
  // P1: kiosk anonymous — KHÔNG cho chạy từ webapp (ai cũng gọi được qua
  // google.script.run từ console → ghi đè/xóa StaffData).
  // Chỉ cho chạy từ Editor: Session.getActiveUser() rỗng khi anonymous truy cập.
  if (!isEditor_()) {
    return { ok: false, count: 0, message: 'syncFromCsv chỉ chạy từ Script Editor' };
  }
  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName(SHEETS.STAFF_DATA);
  if (!sheet) {
    return { ok: false, count: 0, message: 'Không tìm thấy sheet ' + SHEETS.STAFF_DATA };
  }
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) {
    return { ok: false, count: 0, message: 'Sheet ' + SHEETS.STAFF_DATA + ' không có dữ liệu (cần header + ít nhất 1 dòng)' };
  }
  // Parse trực tiếp từ mảng 2D — an toàn với dấu phẩy/nháy trong giá trị.
  const staff = buildStaffListFromValues(values);
  if (!staff.length) {
    return { ok: false, count: 0, message: 'Không parse được dữ liệu — kiểm tra header khớp Att.csv (20 cột)' };
  }
  const overwritten = overwriteStaffData_(staff);
  return { ok: true, count: overwritten, message: 'Đã đồng bộ ' + overwritten + ' nhân viên' };
}

/** Khởi tạo sheet lần đầu (chạy 1 lần từ editor sau khi deploy). */
function setupSheets() {
  // P3: gate editor-only — kiosk anonymous, không cho gọi qua google.script.run console
  if (!isEditor_()) return 'Chỉ chạy từ Script Editor';
  ensureSheets_();
  return 'OK: sheets đã sẵn sàng';
}
