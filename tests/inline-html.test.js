'use strict';
// tests/inline-html.test.js — Transform inline css.html/js.html vào index.html
// qua scriptlet GAS template (<?!= include('css') ?> / <?!= include('js') ?>).
// Đảm bảo: (1) index.html chỉ chứa scriptlet, không khối <style>/<script> inline;
// (2) bản inline chứa đúng nội dung css.html/js.html (đã bọc wrapper);
// (3) lỗi rõ khi thiếu scriptlet/file.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { inlineHtml, CSS_SCRIPTLET, JS_SCRIPTLET } = require('../scripts/inline-html.js');

const ROOT = path.resolve(__dirname, '..');
const CSS = path.join(ROOT, 'css.html');
const JS = path.join(ROOT, 'js.html');

test('css.html/js.html đã bọc wrapper <style>/<script> (đúng layout gốc)', () => {
  const css = fs.readFileSync(CSS, 'utf8');
  const js = fs.readFileSync(JS, 'utf8');
  assert.ok(css.startsWith('<style>') && css.endsWith('</style>'), 'css.html thiếu wrapper <style>');
  assert.ok(js.startsWith('<script>') && js.endsWith('</script>'), 'js.html thiếu wrapper <script>');
  // wrapper chỉ 1 cặp — không bọc lồng
  assert.strictEqual((css.match(/<style>/g) || []).length, 1, 'css.html lồng <style>');
  assert.strictEqual((js.match(/<script>/g) || []).length, 1, 'js.html lồng <script>');
});

test('index.html chỉ chứa scriptlet — không khối <style>/<script> inline', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(html.includes(CSS_SCRIPTLET), 'thiếu scriptlet css');
  assert.ok(html.includes(JS_SCRIPTLET), 'thiếu scriptlet js');
  assert.ok(!html.includes('<style>'), 'index.html vẫn còn <style>');
  assert.ok(!html.includes('</style>'), 'index.html vẫn còn </style>');
  assert.ok(!html.includes('<script'), 'index.html vẫn còn <script');
  assert.ok(!html.includes('href="css.html"') && !html.includes('src="js.html"'), 'còn tag link/script src cũ');
});

test('inline thay scriptlet bằng nội dung file', () => {
  const html = '<html><head>' + CSS_SCRIPTLET + '</head><body>' + JS_SCRIPTLET + '</body></html>';
  const css = fs.readFileSync(CSS, 'utf8');
  const js = fs.readFileSync(JS, 'utf8');
  const out = inlineHtml(html, CSS, JS);
  assert.ok(out.includes(css), 'CSS không khớp nguyên bản');
  assert.ok(out.includes(js), 'JS không khớp nguyên bản');
  assert.ok(!out.includes(CSS_SCRIPTLET) && !out.includes(JS_SCRIPTLET), 'còn sót scriptlet');
});

test('thiếu scriptlet → throw rõ lỗi', () => {
  assert.throws(() => inlineHtml('<html>no scriptlets</html>', CSS, JS), /css'/);
  assert.throws(() => inlineHtml('<html>' + CSS_SCRIPTLET + '</html>', CSS, JS), /js'/);
});

test('thiếu file css/js → throw', () => {
  const html = '<html>' + CSS_SCRIPTLET + JS_SCRIPTLET + '</html>';
  assert.throws(() => inlineHtml(html, '/nonexistent/css.html', JS), /ENOENT/);
  assert.throws(() => inlineHtml(html, CSS, '/nonexistent/js.html'), /ENOENT/);
});

test('index.html THẬT: bản inline tự-chứa hoàn chỉnh', () => {
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

  // CSS + JS đầy đủ (wrapper + nội dung)
  assert.ok(out.includes(css), 'CSS không đầy đủ');
  assert.ok(out.includes(js), 'JS không đầy đủ');
  for (const marker of ['--primary', '.task-pagin', 'STAFF-CACHE-START', 'function dashScrollTop', 'function submitScanMealMove']) {
    assert.ok(out.includes(marker), 'thiếu marker: ' + marker);
  }

  // thứ tự: css trước js
  assert.ok(out.indexOf('<style>') < out.indexOf('<script>'), 'thứ tự css/js sai');

  // không còn scriptlet / asset ngoài
  assert.ok(!out.includes(CSS_SCRIPTLET) && !out.includes(JS_SCRIPTLET), 'còn scriptlet');
  assert.ok(!out.includes('href="css.html"') && !out.includes('src="js.html"'), 'còn tag ngoài');

  // cân bằng tag (wrapper 1 cặp mỗi loại)
  const count = (re) => (out.match(re) || []).length;
  assert.strictEqual(count(/<style>/g), count(/<\/style>/g), 'style mất cân bằng');
  assert.strictEqual(count(/<script>/g), count(/<\/script>/g), 'script mất cân bằng');
});
