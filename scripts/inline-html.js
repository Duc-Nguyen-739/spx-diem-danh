/**
 * scripts/inline-html.js — Inline CSS/JS split files vào index.html (dùng chung).
 *
 * Lý do: GAS (HtmlService) KHÔNG serve file tĩnh `.css`/`.js` — clasp chỉ push
 * `.gs/.js/.html/.json`; và createHtmlOutput/setContent SẼ sanitize (strip <script>).
 * Nên CSS/JS giữ ở file đuôi `.html` (css.html / js.html, đã bọc <style>/<script>)
 * và được nhúng vào index.html qua SCRIPTLET chuẩn của GAS template:
 *   - index.html: `<?!= include('css') ?>` / `<?!= include('mobile') ?>` / `<?!= include('lib-jsqr') ?>`
 *     / `<?!= include('lib-quagga') ?>` / `<?!= include('camera-scan') ?>` / `<?!= include('js') ?>`
 *   - Code.gs doGet: createTemplateFromFile('index').evaluate() (GAS production)
 *   - scripts/serve.js + scripts/build-static.js: thay scriptlet bằng nội dung file
 *     (preview / hosting) — cùng transform này, output tự-chứa như trước khi tách.
 *
 * Không sửa logic/hình ảnh — chỉ di chuyển nội dung (wrapper <style>/<script> nằm
 * trong css.html/js.html, đúng layout gốc khi còn 1 file).
 */
'use strict';

const fs = require('node:fs');

const CSS_SCRIPTLET = "<?!= include('css') ?>";
const MOBILE_SCRIPTLET = "<?!= include('mobile') ?>";
const CAMERA_CSS_SCRIPTLET = "<?!= include('camera-css') ?>";
const LIB_JSQR_SCRIPTLET = "<?!= include('lib-jsqr') ?>";
const LIB_QUAGGA_SCRIPTLET = "<?!= include('lib-quagga') ?>";
const CAMERA_SCRIPTLET = "<?!= include('camera-scan') ?>";
const JS_SCRIPTLET = "<?!= include('js') ?>";

/**
 * Thay 2 scriptlet trong html bằng nội dung cssPath/jsPath.
 * @param {string} html nội dung index.html
 * @param {string} cssPath đường dẫn css.html
 * @param {string} jsPath  đường dẫn js.html
 * @param {string} mobilePath đường dẫn mobile.html (CSS mobile — có thể '' để bỏ qua)
 * @returns {string} html sau inline (tự chứa)
 */
function inlineHtml(html, cssPath, jsPath, mobilePath, libJsqrPath, libQuaggaPath, cameraPath, cameraCssPath) {
  if (!html.includes(CSS_SCRIPTLET)) throw new Error('inlineHtml: không tìm thấy ' + CSS_SCRIPTLET);
  if (!html.includes(JS_SCRIPTLET)) throw new Error('inlineHtml: không tìm thấy ' + JS_SCRIPTLET);
  if (!html.includes(MOBILE_SCRIPTLET)) throw new Error('inlineHtml: không tìm thấy ' + MOBILE_SCRIPTLET);
  if (!html.includes(CAMERA_CSS_SCRIPTLET)) throw new Error('inlineHtml: không tìm thấy ' + CAMERA_CSS_SCRIPTLET);
  if (!html.includes(LIB_JSQR_SCRIPTLET)) throw new Error('inlineHtml: không tìm thấy ' + LIB_JSQR_SCRIPTLET);
  if (!html.includes(LIB_QUAGGA_SCRIPTLET)) throw new Error('inlineHtml: không tìm thấy ' + LIB_QUAGGA_SCRIPTLET);
  if (!html.includes(CAMERA_SCRIPTLET)) throw new Error('inlineHtml: không tìm thấy ' + CAMERA_SCRIPTLET);
  const css = fs.readFileSync(cssPath, 'utf8');
  const js = fs.readFileSync(jsPath, 'utf8');
  const mobile = mobilePath ? fs.readFileSync(mobilePath, 'utf8') : '';
  const libJsqr = libJsqrPath ? fs.readFileSync(libJsqrPath, 'utf8') : '';
  const libQuagga = libQuaggaPath ? fs.readFileSync(libQuaggaPath, 'utf8') : '';
  const camera = cameraPath ? fs.readFileSync(cameraPath, 'utf8') : '';
  const cameraCss = cameraCssPath ? fs.readFileSync(cameraCssPath, 'utf8') : '';
  let out = html;
  out = out.split(CSS_SCRIPTLET).join(css);
  out = out.split(MOBILE_SCRIPTLET).join(mobile);
  out = out.split(CAMERA_CSS_SCRIPTLET).join(cameraCss);
  out = out.split(LIB_JSQR_SCRIPTLET).join(libJsqr);
  out = out.split(LIB_QUAGGA_SCRIPTLET).join(libQuagga);
  out = out.split(CAMERA_SCRIPTLET).join(camera);
  out = out.split(JS_SCRIPTLET).join(js);
  return out;
}

/**
 * URL mặc định của deployment GAS (JSONP endpoint) cho bản standalone tĩnh.
 * GAS không set CORS → trang top-level (preview/hosting) gọi GAS qua JSONP
 * (script tag — không bị CORS chặn), endpoint = chính deployment /exec này.
 * Override bằng env RC_API_BASE nếu deploy sang script khác.
 */
const RC_API_BASE_DEFAULT =
  'https://script.google.com/macros/s/AKfycbz421TMJ_dh5isHjbQJTGrmnJR-nX3y5Ikl3pBra4gFwZ5JFWGCGT1kctIpaH-EarNu/exec';

/**
 * Chèn cờ STANDALONE vào HTML (bản tĩnh preview/hosting) trước </head>.
 * js.html shim đọc window.__RC_STANDALONE__ + window.__RC_API_BASE__ để kích hoạt
 * google.script.run → JSONP (xem js.html đầu file). Idempotent — chèn 1 lần.
 * KHÔNG dùng marker __RC_STANDALONE__ (js.html có chứa chuỗi đó) — dùng đúng chuỗi
 * gán `window.__RC_STANDALONE__=true` làm marker.
 * @param {string} html — HTML đã inline (hoặc bất kỳ)
 * @param {string} [apiBase] — URL JSONP endpoint; mặc định RC_API_BASE_DEFAULT
 * @returns {string}
 */
function injectStandaloneFlags(html, apiBase, apiToken) {
  if (html.indexOf('window.__RC_STANDALONE__=true') >= 0) return html;
  const base = String(apiBase || process.env.RC_API_BASE || RC_API_BASE_DEFAULT);
  // 2026-08-19 (NEW-1): token API tùy chọn — env RC_API_TOKEN → chèn __RC_API_TOKEN__
  // cho shim gửi kèm mỗi JSONP/fetch request (backend Python bắt buộc khi chạy với
  // ROLLCALL_API_TOKEN — Điểm Danh HN2 SOC). Rỗng = không dùng (preview/demo không đổi hành vi).
  const token = apiToken === undefined ? (process.env.RC_API_TOKEN || '') : apiToken;
  const tag = '<script>window.__RC_STANDALONE__=true;window.__RC_API_BASE__='
    + JSON.stringify(base) + ';window.__RC_API_TOKEN__='
    + JSON.stringify(String(token || '')) + ';</script>';
  if (html.indexOf('</head>') >= 0) return html.replace('</head>', tag + '</head>');
  return tag + html;
}

/**
 * Chèn cờ DEMO vào HTML trước </head> — chế độ test UI/camera KHÔNG cần GAS:
 * js.html shim JSONP skip khi __RC_DEMO__ → khối mock load mock-google.js (task/staff giả).
 * Chỉ dùng cho preview (?demo=1) — production/hosting KHÔNG chèn cờ này.
 * @param {string} html
 * @returns {string}
 */
function injectDemoFlag(html) {
  if (html.indexOf('window.__RC_DEMO__=true') >= 0) return html;
  const tag = '<script>window.__RC_DEMO__=true;</script>';
  if (html.indexOf('</head>') >= 0) return html.replace('</head>', tag + '</head>');
  return tag + html;
}

module.exports = {
  inlineHtml,
  injectStandaloneFlags,
  injectDemoFlag,
  CSS_SCRIPTLET,
  MOBILE_SCRIPTLET,
  CAMERA_CSS_SCRIPTLET,
  LIB_JSQR_SCRIPTLET,
  LIB_QUAGGA_SCRIPTLET,
  CAMERA_SCRIPTLET,
  JS_SCRIPTLET,
};

