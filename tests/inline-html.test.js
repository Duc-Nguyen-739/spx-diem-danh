'use strict';
// tests/inline-html.test.js — Transform inline css.html/js.html vào index.html
// qua scriptlet GAS template (<?!= include('css') ?> / <?!= include('js') ?> v.v.).
// Đảm bảo: (1) index.html chỉ chứa scriptlet, không khối <style>/<script> inline;
// (2) bản inline chứa đúng nội dung các file (đã bọc wrapper);
// (3) lỗi rõ khi thiếu scriptlet/file.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { inlineHtml, CSS_SCRIPTLET, MOBILE_SCRIPTLET, CAMERA_CSS_SCRIPTLET, LIB_JSQR_SCRIPTLET, LIB_QUAGGA_SCRIPTLET, CAMERA_SCRIPTLET, JS_SCRIPTLET } = require('../scripts/inline-html.js');

const ROOT = path.resolve(__dirname, '..');
const CSS = path.join(ROOT, 'css.html');
const JS = path.join(ROOT, 'js.html');
const MOBILE = path.join(ROOT, 'mobile.html');
const CAMERA_CSS = path.join(ROOT, 'camera-css.html');
const LIB_JSQR = path.join(ROOT, 'lib-jsqr.html');
const LIB_QUAGGA = path.join(ROOT, 'lib-quagga.html');
const CAMERA = path.join(ROOT, 'camera-scan.html');

test('file UI bọc wrapper đúng (style/script), lib là script riêng', () => {
  const css = fs.readFileSync(CSS, 'utf8');
  const js = fs.readFileSync(JS, 'utf8');
  const mobile = fs.readFileSync(MOBILE, 'utf8');
  const cameraCss = fs.readFileSync(CAMERA_CSS, 'utf8');
  const libJsqr = fs.readFileSync(LIB_JSQR, 'utf8');
  const libQuagga = fs.readFileSync(LIB_QUAGGA, 'utf8');
  const camera = fs.readFileSync(CAMERA, 'utf8');
  assert.ok(css.startsWith('<style>') && css.endsWith('</style>'), 'css.html thiếu wrapper <style>');
  assert.ok(mobile.startsWith('<style>') && mobile.endsWith('</style>'), 'mobile.html thiếu wrapper <style>');
  assert.ok(cameraCss.startsWith('<style>') && cameraCss.endsWith('</style>'), 'camera-css.html thiếu wrapper <style>');
  assert.ok(js.startsWith('<script>') && js.endsWith('</script>'), 'js.html thiếu wrapper <script>');
  assert.ok(libJsqr.startsWith('<script>') && libJsqr.endsWith('</script>'), 'lib-jsqr.html thiếu wrapper <script>');
  assert.ok(libQuagga.startsWith('<script>') && libQuagga.endsWith('</script>'), 'lib-quagga.html thiếu wrapper <script>');
  assert.ok(camera.startsWith('<script>') && camera.endsWith('</script>'), 'camera-scan.html thiếu wrapper <script>');
  // wrapper chỉ 1 cặp — không bọc lồng
  assert.strictEqual((css.match(/<style>/g) || []).length, 1, 'css.html lồng <style>');
  assert.strictEqual((mobile.match(/<style>/g) || []).length, 1, 'mobile.html lồng <style>');
  assert.strictEqual((cameraCss.match(/<style>/g) || []).length, 1, 'camera-css.html lồng <style>');
  assert.strictEqual((js.match(/<script>/g) || []).length, 1, 'js.html lồng <script>');
  assert.strictEqual((libJsqr.match(/<script>/g) || []).length, 1, 'lib-jsqr.html lồng <script>');
  assert.strictEqual((libQuagga.match(/<script>/g) || []).length, 1, 'lib-quagga.html lồng <script>');
  assert.strictEqual((camera.match(/<script>/g) || []).length, 1, 'camera-scan.html lồng <script>');
});

test('index.html chỉ chứa scriptlet — không khối <style>/<script> inline', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  for (const sc of [CSS_SCRIPTLET, MOBILE_SCRIPTLET, CAMERA_CSS_SCRIPTLET, LIB_JSQR_SCRIPTLET, LIB_QUAGGA_SCRIPTLET, CAMERA_SCRIPTLET, JS_SCRIPTLET]) {
    assert.ok(html.includes(sc), 'thiếu scriptlet: ' + sc);
  }
  assert.ok(!html.includes('<style>'), 'index.html vẫn còn <style>');
  assert.ok(!html.includes('</style>'), 'index.html vẫn còn </style>');
  assert.ok(!html.includes('<script'), 'index.html vẫn còn <script');
  assert.ok(!html.includes('href="css.html"') && !html.includes('src="js.html"'), 'còn tag link/script src cũ');
});

test('inline thay scriptlet bằng nội dung file (cả lib + camera)', () => {
  const html = '<html><head>' + CSS_SCRIPTLET + MOBILE_SCRIPTLET + CAMERA_CSS_SCRIPTLET + '</head><body>' +
    LIB_JSQR_SCRIPTLET + LIB_QUAGGA_SCRIPTLET + CAMERA_SCRIPTLET + JS_SCRIPTLET + '</body></html>';
  const css = fs.readFileSync(CSS, 'utf8');
  const js = fs.readFileSync(JS, 'utf8');
  const mobile = fs.readFileSync(MOBILE, 'utf8');
  const cameraCss = fs.readFileSync(CAMERA_CSS, 'utf8');
  const libJsqr = fs.readFileSync(LIB_JSQR, 'utf8');
  const libQuagga = fs.readFileSync(LIB_QUAGGA, 'utf8');
  const camera = fs.readFileSync(CAMERA, 'utf8');
  const out = inlineHtml(html, CSS, JS, MOBILE, LIB_JSQR, LIB_QUAGGA, CAMERA, CAMERA_CSS);
  assert.ok(out.includes(css), 'CSS không khớp nguyên bản');
  assert.ok(out.includes(mobile), 'mobile CSS không khớp nguyên bản');
  assert.ok(out.includes(cameraCss), 'camera-css không khớp nguyên bản');
  assert.ok(out.includes(libJsqr), 'lib-jsqr không khớp nguyên bản');
  assert.ok(out.includes(libQuagga), 'lib-quagga không khớp nguyên bản');
  assert.ok(out.includes(camera), 'camera-scan không khớp nguyên bản');
  assert.ok(out.includes(js), 'JS không khớp nguyên bản');
  const leftover = [CSS_SCRIPTLET, MOBILE_SCRIPTLET, CAMERA_CSS_SCRIPTLET, LIB_JSQR_SCRIPTLET, LIB_QUAGGA_SCRIPTLET, CAMERA_SCRIPTLET, JS_SCRIPTLET].filter((s) => out.includes(s));
  assert.deepStrictEqual(leftover, [], 'còn sót scriptlet: ' + leftover.join(', '));
});

test('thiếu scriptlet → throw rõ lỗi (thứ tự check: css → js → mobile → camera-css → lib-jsqr → lib-quagga → camera)', () => {
  assert.throws(() => inlineHtml('<html>no scriptlets</html>', CSS, JS, MOBILE, LIB_JSQR, LIB_QUAGGA, CAMERA, CAMERA_CSS), /css'/);
  assert.throws(() => inlineHtml('<html>' + CSS_SCRIPTLET + '</html>', CSS, JS, MOBILE, LIB_JSQR, LIB_QUAGGA, CAMERA, CAMERA_CSS), /js'/);
  assert.throws(() => inlineHtml('<html>' + CSS_SCRIPTLET + JS_SCRIPTLET + '</html>', CSS, JS, MOBILE, LIB_JSQR, LIB_QUAGGA, CAMERA, CAMERA_CSS), /mobile'/);
  assert.throws(() => inlineHtml('<html>' + CSS_SCRIPTLET + MOBILE_SCRIPTLET + JS_SCRIPTLET + '</html>', CSS, JS, MOBILE, LIB_JSQR, LIB_QUAGGA, CAMERA, CAMERA_CSS), /camera-css'/);
  assert.throws(() => inlineHtml('<html>' + CSS_SCRIPTLET + MOBILE_SCRIPTLET + CAMERA_CSS_SCRIPTLET + JS_SCRIPTLET + '</html>', CSS, JS, MOBILE, LIB_JSQR, LIB_QUAGGA, CAMERA, CAMERA_CSS), /lib-jsqr'/);
  assert.throws(() => inlineHtml('<html>' + CSS_SCRIPTLET + MOBILE_SCRIPTLET + CAMERA_CSS_SCRIPTLET + LIB_JSQR_SCRIPTLET + JS_SCRIPTLET + '</html>', CSS, JS, MOBILE, LIB_JSQR, LIB_QUAGGA, CAMERA, CAMERA_CSS), /lib-quagga'/);
  assert.throws(() => inlineHtml('<html>' + CSS_SCRIPTLET + MOBILE_SCRIPTLET + CAMERA_CSS_SCRIPTLET + LIB_JSQR_SCRIPTLET + LIB_QUAGGA_SCRIPTLET + JS_SCRIPTLET + '</html>', CSS, JS, MOBILE, LIB_JSQR, LIB_QUAGGA, CAMERA, CAMERA_CSS), /camera-scan'/);
});

test('thiếu file (css/mobile/camera-css/js/lib/camera) → throw', () => {
  const all = CSS_SCRIPTLET + MOBILE_SCRIPTLET + CAMERA_CSS_SCRIPTLET + LIB_JSQR_SCRIPTLET + LIB_QUAGGA_SCRIPTLET + CAMERA_SCRIPTLET + JS_SCRIPTLET;
  const html = '<html>' + all + '</html>';
  assert.throws(() => inlineHtml(html, '/nonexistent/css.html', JS, MOBILE, LIB_JSQR, LIB_QUAGGA, CAMERA, CAMERA_CSS), /ENOENT/);
  assert.throws(() => inlineHtml(html, CSS, '/nonexistent/js.html', MOBILE, LIB_JSQR, LIB_QUAGGA, CAMERA, CAMERA_CSS), /ENOENT/);
  assert.throws(() => inlineHtml(html, CSS, JS, '/nonexistent/mobile.html', LIB_JSQR, LIB_QUAGGA, CAMERA, CAMERA_CSS), /ENOENT/);
  assert.throws(() => inlineHtml(html, CSS, JS, MOBILE, LIB_JSQR, LIB_QUAGGA, CAMERA, '/nonexistent/camera-css.html'), /ENOENT/);
  assert.throws(() => inlineHtml(html, CSS, JS, MOBILE, '/nonexistent/lib-jsqr.html', LIB_QUAGGA, CAMERA, CAMERA_CSS), /ENOENT/);
  assert.throws(() => inlineHtml(html, CSS, JS, MOBILE, LIB_JSQR, '/nonexistent/lib-quagga.html', CAMERA, CAMERA_CSS), /ENOENT/);
  assert.throws(() => inlineHtml(html, CSS, JS, MOBILE, LIB_JSQR, LIB_QUAGGA, '/nonexistent/camera-scan.html', CAMERA_CSS), /ENOENT/);
});

test('index.html THẬT: bản inline tự-chứa hoàn chỉnh (css + mobile + libs + camera + js)', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const css = fs.readFileSync(CSS, 'utf8');
  const js = fs.readFileSync(JS, 'utf8');
  const mobile = fs.readFileSync(MOBILE, 'utf8');
  const cameraCss = fs.readFileSync(CAMERA_CSS, 'utf8');
  const libJsqr = fs.readFileSync(LIB_JSQR, 'utf8');
  const libQuagga = fs.readFileSync(LIB_QUAGGA, 'utf8');
  const camera = fs.readFileSync(CAMERA, 'utf8');
  const out = inlineHtml(html, CSS, JS, MOBILE, LIB_JSQR, LIB_QUAGGA, CAMERA, CAMERA_CSS);

  // cấu trúc gốc còn nguyên
  assert.ok(out.startsWith('<!DOCTYPE html>'), 'mất DOCTYPE');
  assert.ok(out.includes('</html>'), 'mất </html>');
  assert.ok(out.includes('<base target="_top">'), 'mất base');
  assert.ok(out.includes('<!-- ================= VIEW 1: Tạo task / danh sách ================='), 'mất VIEW 1');

  // mock document.write còn nguyên (nạp mock khi chạy ngoài GAS)
  assert.ok(out.includes("document.write('<script src=\"mock/mock-google.js?v='"), 'mất mock loader');

  // CSS + mobile + JS + libs + camera đầy đủ (wrapper + nội dung)
  assert.ok(out.includes(css), 'CSS không đầy đủ');
  assert.ok(out.includes(mobile), 'mobile CSS không đầy đủ');
  assert.ok(out.includes(cameraCss), 'camera-css không đầy đủ');
  assert.ok(out.includes(libJsqr), 'lib-jsqr không đầy đủ');
  assert.ok(out.includes(libQuagga), 'lib-quagga không đầy đủ');
  assert.ok(out.includes(camera), 'camera-scan không đầy đủ');
  assert.ok(out.includes(js), 'JS không đầy đủ');
  for (const marker of ['--primary', '.task-pagin', 'STAFF-CACHE-START', 'function dashScrollTop', 'function submitScanMealMove', 'function openCameraScan', 'function onCameraDecoded', 'function startCameraLive', 'window.jsQR', 'window.Quagga']) {
    assert.ok(out.includes(marker), 'thiếu marker: ' + marker);
  }

  // thứ tự: css trước js
  assert.ok(out.indexOf('<style>') < out.indexOf('<script>'), 'thứ tự css/js sai');

  // không còn scriptlet / asset ngoài
  const leftover = [CSS_SCRIPTLET, MOBILE_SCRIPTLET, CAMERA_CSS_SCRIPTLET, LIB_JSQR_SCRIPTLET, LIB_QUAGGA_SCRIPTLET, CAMERA_SCRIPTLET, JS_SCRIPTLET].filter((s) => out.includes(s));
  assert.deepStrictEqual(leftover, [], 'còn scriptlet: ' + leftover.join(', '));
  assert.ok(!out.includes('href="css.html"') && !out.includes('src="js.html"') && !out.includes('src="mobile.html"'), 'còn tag ngoài');

  // cân bằng tag: 3 cặp <style> (css + mobile + camera-css), 4 cặp <script> (jsQR, quagga, camera, js)
  const count = (re) => (out.match(re) || []).length;
  assert.strictEqual(count(/<style>/g), 3, 'style phải là 3 cặp (css + mobile + camera-css)');
  assert.strictEqual(count(/<\/style>/g), 3, 'style đóng phải là 3');
  assert.strictEqual(count(/<script>/g), 4, 'script phải là 4 cặp (jsQR, quagga, camera, js)');
  assert.strictEqual(count(/<\/script>/g), 4, 'script đóng phải là 4');
});
