/**
 * Api.gs — REST API (HTTP POST) cho client NGOÀI GAS (AppSheet webhook, curl, …).
 *
 * Vì sao có file này (2026-08-12):
 * - Web app kiosk chạy trong iframe GAS → getUserMedia bị chặn trên iOS → KHÔNG
 *   thể quét live auto-detect trong trang GAS (xem AGENTS.md §20). AppSheet (app
 *   người dùng đang dùng) có scanner NATIVE: bấm vào ô quét → camera mở ngay →
 *   TỰ nhận mã vạch → điền mã → bấm Điểm danh → done. Đúng UX mong muốn.
 * - AppSheet gọi webhook HTTP tới GAS để chạy ĐÚNG logic hiện có (scanStaff, tạo
 *   task, list task…) — không viết lại gì, không cần cấp quyền vào Google Sheets
 *   cho từng user (app làm proxy qua quyền của người sở hữu).
 *
 * Cách gọi:
 *   POST https://script.google.com/macros/s/<SCRIPT_ID>/exec
 *   Content-Type: application/json
 *   {"action":"scanStaffApi","args":["R20260802-0730","OPS229444",""]}
 *   → {"ok":true,"result":{"ok":true,"message":"…","status":"present",…}}
 *
 * Whitelist action (CHỈ cho gọi các hàm này — không dispatch hàm tuỳ ý, chặn mọi
 * hàm _private / editor-only):
 *   getMeta, getFilterOptions, previewStaffApi, createReconcileTaskApi,
 *   createMealMoveTaskApi, pasteMealMoveScanApi, getTaskListApi, getTaskDetailApi,
 *   scanStaffApi, completeTaskApi, reopenTaskApi, updateTaskNoteApi, searchStaffApi,
 *   getStaffIndexApi
 *
 * Bảo mật: web app chạy anonymous (không cần đăng nhập) — API này cùng năng lực
 * với UI kiosk, KHÔNG thêm quyền nào. syncFromCsv/setupSheets/debugState/… không
 * nằm trong whitelist (editor-only, gate isEditor_() giữ nguyên).
 *
 * KHÔNG hỗ trợ CORS (GAS không set được Access-Control-Allow-Origin) → chỉ dùng
 * cho client server-to-server (AppSheet webhook, curl, backend khác) — không dùng
 * fetch từ trình duyệt khác origin.
 */

/** Whitelist action — mỗi action map 1:1 tới hàm GAS public đã duyệt. */
var API_ACTIONS = {
  getMeta: 'getMeta',
  getFilterOptions: 'getFilterOptions',
  previewStaffApi: 'previewStaffApi',
  createReconcileTaskApi: 'createReconcileTaskApi',
  createMealMoveTaskApi: 'createMealMoveTaskApi',
  pasteMealMoveScanApi: 'pasteMealMoveScanApi',
  getTaskListApi: 'getTaskListApi',
  getTaskDetailApi: 'getTaskDetailApi',
  scanStaffApi: 'scanStaffApi',
  completeTaskApi: 'completeTaskApi',
  reopenTaskApi: 'reopenTaskApi',
  updateTaskNoteApi: 'updateTaskNoteApi',
  searchStaffApi: 'searchStaffApi',
  getStaffIndexApi: 'getStaffIndexApi',
};

/**
 * Parse request → {action, args}.
 * Hỗ trợ 2 dạng body:
 *   1) JSON: {"action":"…","args":[…]}
 *   2) form-encoded / query: action=..&args=<JSON string> hoặc action=..&arg0=..&arg1=..
 */
function parsePostRequest_(e) {
  var out = { action: '', args: [] };
  if (!e) return out;
  if (e.postData && e.postData.contents) {
    try {
      var body = JSON.parse(e.postData.contents);
      if (body && typeof body === 'object') {
        out.action = String(body.action || '').trim();
        if (Array.isArray(body.args)) out.args = body.args;
        return out;
      }
    } catch (err) {
      /* JSON hỏng → fallback e.parameter */
    }
  }
  if (e.parameter) {
    out.action = String(e.parameter.action || '').trim();
    if (e.parameter.args !== undefined) {
      try { out.args = JSON.parse(e.parameter.args); } catch (err) { out.args = []; }
    } else {
      out.args = [];
      var i = 0;
      while (e.parameter['arg' + i] !== undefined) {
        out.args.push(e.parameter['arg' + i]);
        i++;
      }
    }
  }
  return out;
}

/**
 * Dispatch theo whitelist — test được trên Node (call được inject).
 * @param {string} action
 * @param {*} args — mảng tham số (non-array → [])
 * @param {Function} call — call(fnName, argsArray) → kết quả hàm GAS
 * @returns {{ok: boolean, result?: *, error?: string}}
 */
function apiDispatch_(action, args, call) {
  var fnName = Object.prototype.hasOwnProperty.call(API_ACTIONS, action)
    ? API_ACTIONS[action]
    : null;
  if (!fnName) {
    return { ok: false, error: 'Unknown action: ' + action };
  }
  var argArray = Array.isArray(args) ? args : [];
  try {
    return { ok: true, result: call(fnName, argArray) };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
}

/** GAS: gọi hàm thật qua global scope (mọi .gs share 1 không gian hàm). */
function apiCall_(fnName, args) {
  return globalThis[fnName].apply(null, args);
}

/** Entry: POST /exec → JSON. */
function doPost(e) {
  var req = parsePostRequest_(e);
  var out = apiDispatch_(req.action, req.args, apiCall_);
  return ContentService.createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
}

// ===== Node test support (GAS bỏ qua) =====
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    API_ACTIONS: API_ACTIONS,
    parsePostRequest_: parsePostRequest_,
    apiDispatch_: apiDispatch_,
  };
}
