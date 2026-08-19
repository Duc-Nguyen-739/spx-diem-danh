/**
 * JsonpApi.gs — JSONP API cho trang STANDALONE (?app=1) + helper dispatch dùng chung.
 *
 * Vì sao có file này (2026-08-12):
 * - GAS serve web app trong IFRAME WRAPPER → iOS chặn getUserMedia trong cross-origin
 *   iframe → không bao giờ có quét live auto-detect trong trang GAS iframe.
 * - Giải pháp: doGet nhánh ?app=1 trả CÙNG app (index.html đã dựng) qua
 *   ContentService (MimeType HTML) → GAS serve NGUYÊN trang top-level, KHÔNG iframe →
 *   camera live hoạt động trên iOS (xem Code.gs doGet + AGENTS.md §20).
 * - Trang top-level KHÔNG có google.script.run (chỉ wrapper iframe mới inject) → js.html
 *   cài shim: google.script.run → JSONP GET tới chính deployment này. File này là đầu
 *   nhận JSONP: GET /exec?action=<fn>&args=<JSON>&cb=<name> → trả cb(<JSON>).
 * - JSONP là cơ chế GAS hỗ trợ CHÍNH THỨC (Content Service docs: "Serve JSONP in web
 *   pages") — script tag không bị CORS chặn nên gọi chéo origin được.
 *
 * Bảo mật:
 * - Whitelist action (API_ACTIONS_) — CHỈ cho gọi các hàm *Api đã duyệt (cùng năng lực
 *   với UI kiosk anonymous). Chặn mọi hàm khác (kể cả _private, editor-only).
 * - cb (tên hàm callback) phải khớp /^[A-Za-z0-9_$.]+$/ — chống phản chiếu script tùy ý.
 */

/** Whitelist action — mỗi action map 1:1 tới hàm GAS public đã duyệt. */
var API_ACTIONS_ = {
  getMeta: 'getMeta',
  getFilterOptions: 'getFilterOptions',
  previewStaffApi: 'previewStaffApi',
  createReconcileTaskApi: 'createReconcileTaskApi',
  createMealMoveTaskApi: 'createMealMoveTaskApi',
  transferPresentListToMealMoveApi: 'transferPresentListToMealMoveApi',
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
 * Dispatch theo whitelist — test được trên Node (call được inject).
 * @param {string} action
 * @param {*} args — mảng tham số (non-array → [])
 * @param {Function} call — call(fnName, argsArray) → kết quả hàm GAS
 * @returns {{ok: boolean, result?: *, error?: string}}
 */
function apiDispatchJsonp_(action, args, call) {
  var fnName = Object.prototype.hasOwnProperty.call(API_ACTIONS_, action)
    ? API_ACTIONS_[action]
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

/**
 * Sanitize tên hàm callback JSONP — chỉ cho ký tự định danh JS an toàn.
 * Chống XSS: cb được phản chiếu nguyên văn vào output JS.
 */
function sanitizeCallback_(cb) {
  var s = String(cb || '').trim();
  return /^[A-Za-z0-9_$.]+$/.test(s) ? s : 'callback';
}

/** GAS: gọi hàm thật qua global scope (mọi .gs share 1 không gian hàm). */
function jsonpApiCall_(fnName, args) {
  return globalThis[fnName].apply(null, args);
}

/**
 * Xử lý GET JSONP — gọi từ Code.gs doGet khi có e.parameter.action.
 * Trả ContentService output (MimeType.JAVASCRIPT): cb(<JSON>);
 */
function handleJsonpRequest_(e) {
  var action = String(e.parameter.action || '').trim();
  var args = [];
  if (e.parameter.args) {
    try { args = JSON.parse(e.parameter.args); } catch (err) { args = []; }
  }
  var out = apiDispatchJsonp_(action, args, jsonpApiCall_);
  var cb = sanitizeCallback_(e.parameter.cb);
  // JSON.stringify result có thể throw (vòng tham chiếu/giá trị không serialize được)
  // → trả cb({ok:false,error}) thay vì 500 (bug 2026-08-18).
  var json;
  try {
    json = JSON.stringify(out);
  } catch (err) {
    json = JSON.stringify({ ok: false, error: 'Cannot serialize result: ' + String((err && err.message) || err) });
  }
  return ContentService.createTextOutput(cb + '(' + json + ');')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

// ===== Node test support (GAS bỏ qua) =====
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    API_ACTIONS_: API_ACTIONS_,
    apiDispatchJsonp_: apiDispatchJsonp_,
    sanitizeCallback_: sanitizeCallback_,
  };
}
