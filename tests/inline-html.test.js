'use strict';
// tests/inline-html.test.js — Transform inline css.html/js.html vào index.html.
// Đảm bảo: (1) inline đúng nội dung, (2) lỗi rõ khi thiếu tag/file,
// (3) bản inline trên index.html THẬT tự chứa (không còn link/script src ngoài).

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { inlineHtml, CSS_TAG, JS_TAG } = require('../scripts/inline-html.js');

const ROOT = path.resolve(__dirname, '..');
const CSS = path.join(ROOT, 'css.html');
const JS = path.join(ROOT, 'js.html');

test('inline thay 2 tag bằng nội dung file', () => {
  const html = '<html><head>' + CSS_TAG + '</head><body>' + JS_TAG + '</body></html>';
  const out = inlineHtml(html, CSS, JS);
  assert.ok(out.includes('<style>'), 'thiếu <style>');
  assert.ok(out.includes('</style>'), 'thiếu </style>');
  assert.ok(out.includes('<script>'), 'thiếu <script>');
  assert.ok(out.includes('</script>'), 'thiếu </script>');
  assert.ok(!out.includes(CSS_TAG), 'còn sót CSS_TAG');
  assert.ok(!out.includes(JS_TAG), 'còn sót JS_TAG');
});

test('nội dung inline chính là nội dung css.html/js.html', () => {
  const html = '<html><head>' + CSS_TAG + '</head><body>' + JS_TAG + '</body></html>';
  const css = fs.readFileSync(CSS, 'utf8');
  const js = fs.readFileSync(JS, 'utf8');
  const out = inlineHtml(html, CSS, JS);
  assert.ok(out.includes('<style>' + css + '</style>'), 'CSS không khớp nguyên bản');
  assert.ok(out.includes('<script>' + js + '</script>'), 'JS không khớp nguyên bản');
});

test('thiếu tag → throw rõ lỗi', () => {
  assert.throws(() => inlineHtml('<html>no tags</html>', CSS, JS), /css\.html/);
  const htmlNoJs = '<html>' + CSS_TAG + '</html>';
  assert.throws(() => inlineHtml(htmlNoJs, CSS, JS), /js\.html/);
});

test('thiếu file css/js → throw', () => {
  const html = '<html>' + CSS_TAG + JS_TAG + '</html>';
  assert.throws(() => inlineHtml(html, '/nonexistent/css.html', JS), /ENOENT/);
  assert.throws(() => inlineHtml(html, CSS, '/nonexistent/js.html'), /ENOENT/);
});

test('index.html THẬT: sau inline là bản tự chứa hoàn chỉnh', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const css = fs.readFileSync(CSS, 'utf8');
  const js = fs.readFileSync(JS, 'utf8');
  const out = inlineHtml(html, CSS, JS);

  // cấu trúc gốc còn nguyên
  assert.ok(out.startsWith('<!DOCTYPE html>'), 'mất DOCTYPE');
  assert.ok(out.includes('</html>'), 'mất </html>');
  assert.ok(out.includes('<base target="_top">'), 'mất base');
  assert.ok(out.includes('<!-- ================= VIEW 1: Tạo task / danh sách ================='), 'mất VIEW 1');

  // mock document.write còn nguyên (nạp mock khi chạy ngoài GAS)
  assert.ok(out.includes("document.write('<script src=\"mock/mock-google.js?v='"), 'mất mock loader');

  // CSS + JS đầy đủ (marker đầu/giữa/cuối)
  assert.ok(out.includes('<style>' + css + '</style>'), 'CSS không đầy đủ');
  assert.ok(out.includes('<script>' + js + '</script>'), 'JS không đầy đủ');
  for (const marker of ['--primary', '.task-pagin', 'STAFF-CACHE-START', 'function dashScrollTop', 'function submitScanMealMove']) {
    assert.ok(out.includes(marker), 'thiếu marker: ' + marker);
  }

  // không còn asset ngoài (GAS không serve file tĩnh)
  assert.ok(!out.includes('href="css.html"'), 'còn link css.html');
  assert.ok(!out.includes('src="js.html"'), 'còn script src js.html');

  // cân bằng tag
  const count = (re) => (out.match(re) || []).length;
  assert.strictEqual(count(/<style>/g), count(/<\/style>/g), 'style mất cân bằng');
  assert.strictEqual(count(/<script>/g), count(/<\/script>/g), 'script mất cân bằng');
});

test('index.html CHỈ chứa tag ngoài — không có khối <style>/<script> inline (tách đúng)', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(html.includes(CSS_TAG), 'thiếu <link css.html>');
  assert.ok(html.includes(JS_TAG), 'thiếu <script src js.html>');
  assert.ok(!html.includes('<style>'), 'index.html vẫn còn khối <style> inline');
  assert.ok(!html.includes('</style>'), 'index.html vẫn còn </style>');
  // <script> chỉ tồn tại dưới dạng <script src=...> hoặc thẻ mở của JS_TAG — không có <script> inline trống
  const inlineScripts = (html.match(/<script(?! src=)/g) || []);
  assert.strictEqual(inlineScripts.length, 0, 'index.html còn <script> inline: ' + inlineScripts.length);
});

test('BẢN INLINE tự-chứa đầy đủ: css/js từ file, thứ tự css trước js, không sót asset ngoài', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const css = fs.readFileSync(CSS, 'utf8');
  const js = fs.readFileSync(JS, 'utf8');
  const out = inlineHtml(html, CSS, JS);
  assert.ok(out.includes('<style>' + css + '</style>'), 'CSS inline không khớp nguyên bản');
  assert.ok(out.includes('<script>' + js + '</script>'), 'JS inline không khớp nguyên bản');
  assert.ok(out.indexOf('<style>') < out.indexOf('<script>'), 'thứ tự css/js sai');
  assert.ok(!out.includes(CSS_TAG) && !out.includes(JS_TAG), 'còn sót tag ngoài');
  const count = (re) => (out.match(re) || []).length;
  assert.strictEqual(count(/<style>/g), count(/<\/style>/g), 'style mất cân bằng');
  assert.strictEqual(count(/<script>/g), count(/<\/script>/g), 'script mất cân bằng');
});
