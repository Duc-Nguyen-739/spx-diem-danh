/**
 * scripts/inline-html.js — Inline CSS/JS split files vào index.html (dùng chung).
 *
 * Lý do: GAS (HtmlService) KHÔNG serve file tĩnh `.css`/`.js` — clasp chỉ push
 * `.gs/.js/.html/.json`. Nên CSS/JS được giữ ở file đuôi `.html` (css.html / js.html)
 * và ĐƯỢC INLINE vào lúc serve bởi 3 nơi, cùng transform này:
 *   - Code.gs doGet   (GAS production) — createHtmlOutputFromFile('css').getContent()
 *   - scripts/serve.js (preview local)
 *   - scripts/build-static.js (hosting) → dist/index.html tự-chứa (như trước khi tách)
 *
 * Output sau inline phải byte-identical với index.html cũ (1 file tự chứa).
 * Không sửa logic/hình ảnh — chỉ di chuyển nội dung.
 */
'use strict';

const fs = require('node:fs');

const CSS_TAG = '<link rel="stylesheet" href="css.html">';
const JS_TAG = '<script src="js.html"></script>';

/**
 * Thay 2 tag trong html bằng nội dung inline từ cssPath/jsPath.
 * @param {string} html nội dung index.html
 * @param {string} cssPath đường dẫn css.html
 * @param {string} jsPath  đường dẫn js.html
 * @returns {string} html sau inline (tự chứa)
 */
function inlineHtml(html, cssPath, jsPath) {
  if (!html.includes(CSS_TAG)) throw new Error('inlineHtml: không tìm thấy ' + CSS_TAG);
  if (!html.includes(JS_TAG)) throw new Error('inlineHtml: không tìm thấy ' + JS_TAG);
  const css = fs.readFileSync(cssPath, 'utf8');
  const js = fs.readFileSync(jsPath, 'utf8');
  // KHÔNG thêm newline bao quanh: nội dung css/js đã có sẵn newline đầu/cuối
  // (đúng layout gốc khi còn 1 file) → output serve byte-identical với bản cũ.
  let out = html;
  out = out.split(CSS_TAG).join('<style>' + css + '</style>');
  out = out.split(JS_TAG).join('<script>' + js + '</script>');
  return out;
}

module.exports = { inlineHtml, CSS_TAG, JS_TAG };
