/**
 * scripts/inline-html.js — Inline CSS/JS split files vào index.html (dùng chung).
 *
 * Lý do: GAS (HtmlService) KHÔNG serve file tĩnh `.css`/`.js` — clasp chỉ push
 * `.gs/.js/.html/.json`; và createHtmlOutput/setContent SẼ sanitize (strip <script>).
 * Nên CSS/JS giữ ở file đuôi `.html` (css.html / js.html, đã bọc <style>/<script>)
 * và được nhúng vào index.html qua SCRIPTLET chuẩn của GAS template:
 *   - index.html: `<?!= include('css') ?>` / `<?!= include('js') ?>`
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
const JS_SCRIPTLET = "<?!= include('js') ?>";

/**
 * Thay 2 scriptlet trong html bằng nội dung cssPath/jsPath.
 * @param {string} html nội dung index.html
 * @param {string} cssPath đường dẫn css.html
 * @param {string} jsPath  đường dẫn js.html
 * @returns {string} html sau inline (tự chứa)
 */
function inlineHtml(html, cssPath, jsPath) {
  if (!html.includes(CSS_SCRIPTLET)) throw new Error('inlineHtml: không tìm thấy ' + CSS_SCRIPTLET);
  if (!html.includes(JS_SCRIPTLET)) throw new Error('inlineHtml: không tìm thấy ' + JS_SCRIPTLET);
  const css = fs.readFileSync(cssPath, 'utf8');
  const js = fs.readFileSync(jsPath, 'utf8');
  let out = html;
  out = out.split(CSS_SCRIPTLET).join(css);
  out = out.split(JS_SCRIPTLET).join(js);
  return out;
}

module.exports = { inlineHtml, CSS_SCRIPTLET, JS_SCRIPTLET };
