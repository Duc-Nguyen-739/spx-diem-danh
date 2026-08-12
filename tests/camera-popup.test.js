/**
 * tests/camera-popup.test.js — Node thuần (không cần GAS, không cần DOM thật).
 * Test POPUP QUÉT LIVE (2026-08-12, hướng A): bấm "📷 Quét Camera" trong iframe GAS →
 * mở popup top-level (window.open) chứa màn hình quét live tự nhận mã → gửi kết quả
 * về iframe qua postMessage {type:'rcScanResult', code} → onCameraDecoded → Done.
 * Fallback: popup bị chặn (window.open null) hoặc popup báo camera fail
 * ({type:'rcScanPopup', state:'failed'}) → camera native (pickCameraImage).
 *
 * Cách load: trích toàn bộ <script> trong camera-scan.html (file thật deploy), chạy
 * trong vm sandbox có DOM mock tối thiểu → test ĐÚNG code được deploy (không bản sao).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const file = fs.readFileSync(path.join(__dirname, '..', 'camera-scan.html'), 'utf8');
const m = file.match(/^<script>([\s\S]*?)<\/script>$/);
assert.ok(m, 'camera-scan.html phải bọc đúng 1 khối <script>');
const script = m[1];

function makeSandbox(opts) {
  opts = opts || {};
  const els = {};
  const handlers = {};
  const scheduled = [];
  const opened = [];
  const doc = {
    getElementById(id) { return els[id] || null; },
    createElement() {
      return { style: {}, setAttribute() {}, appendChild() {}, removeChild() {}, click() {} };
    },
    body: { classList: { add() {}, remove() {} } },
    addEventListener(type, fn) { handlers[type] = fn; },
  };
  const win = {
    self: {},   // ≠ top → openCameraScan xem như đang trong iframe GAS
    top: {},
    addEventListener(type, fn) { handlers[type] = fn; },
    open(url, name) {
      opened.push({ url, name });
      return opts.popupFactory ? opts.popupFactory(url, name) : null;
    },
  };
  const ctx = {
    console: console,
    Date: Date,
    Math: Math,
    JSON: JSON,
    setTimeout(fn) { scheduled.push(fn); return scheduled.length; },
    clearTimeout() {},
    setInterval() { return 1; },
    clearInterval() {},
    requestAnimationFrame() { return 0; },
    cancelAnimationFrame() {},
    location: { search: '', href: 'https://example.test/app' },
    navigator: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' },
    document: doc,
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    URL: { createObjectURL() { return 'blob:x'; }, revokeObjectURL() {} },
    Image: function () {},
    CURRENT_TASK: null,
    // js.html định nghĩa submitScan — test này chỉ cần stub (camera-scan gọi sau khi
    // js.html load trong app thật). Đếm số lần gọi để verify wiring kết quả → submit.
    submitScan() { ctx.__submitScanCalls = (ctx.__submitScanCalls || 0) + 1; },
  };
  ctx.window = win;
  vm.createContext(ctx);
  vm.runInContext(script, ctx);
  return { ctx, els, handlers, scheduled, opened };
}

function fakePopup(writtenLog) {
  return {
    closed: false,
    focus() {},
    document: {
      open() {},
      write(s) { writtenLog.push(s); },
      close() {},
    },
  };
}

test('openCameraScan trong iframe → mở popup quét live (window.open + document.write)', () => {
  const written = [];
  const sb = makeSandbox({ popupFactory: () => fakePopup(written) });
  sb.ctx.openCameraScan();
  assert.equal(sb.opened.length, 1, 'phải gọi window.open 1 lần');
  assert.equal(sb.opened[0].name, 'rcCamScanPopup', 'tên popup đúng');
  assert.equal(written.length, 1, 'phải document.write nội dung popup');
  const html = written[0];
  assert.ok(html.indexOf('getUserMedia') >= 0, 'popup gọi getUserMedia');
  assert.ok(html.indexOf('rcScanResult') >= 0, 'popup gửi kết quả rcScanResult qua postMessage');
  assert.ok(html.indexOf('BarcodeDetector') >= 0, 'popup có chain decode');
  assert.ok(html.indexOf('Quagga') >= 0, 'popup decode vạch 1D bằng Quagga');
  assert.ok(html.indexOf('Đưa mã vào khung') >= 0, 'popup có hướng dẫn tự nhận');
  assert.equal(sb.ctx.camPopupBusy, true, 'cờ busy được bật khi popup mở');
});

test('window.open trả null (popup bị chặn) → fallback camera native (camFile.click)', () => {
  const sb = makeSandbox({ popupFactory: () => null });
  let clicked = 0;
  sb.els.camFile = { value: 'x', click() { clicked++; } };
  sb.ctx.openCameraScan();
  assert.equal(clicked, 1, 'phải mở camera native khi popup bị chặn');
});

test('popup báo camera fail → fallback camera native (qua setTimeout)', () => {
  const sb = makeSandbox({ popupFactory: () => null });
  let clicked = 0;
  sb.els.camFile = { value: 'x', click() { clicked++; } };
  assert.ok(sb.handlers.message, 'phải đăng ký message listener');
  sb.handlers.message({ data: { type: 'rcScanPopup', state: 'failed' } });
  assert.ok(sb.scheduled.length >= 1, 'phải lên lịch fallback (setTimeout)');
  sb.scheduled.forEach(function (fn) { fn(); });
  assert.equal(clicked, 1, 'fallback phải mở camera native');
});

test('sau khi popup fail → mở popup mới được (không kẹt cờ busy)', () => {
  const written = [];
  const sb = makeSandbox({ popupFactory: () => fakePopup(written) });
  sb.handlers.message({ data: { type: 'rcScanPopup', state: 'failed' } });
  assert.equal(sb.ctx.camPopupBusy, false, 'cờ busy phải được reset khi popup fail');
  sb.ctx.openScanPopup();
  assert.equal(written.length, 1, 'popup mới phải ghi nội dung (không bị kẹt ở focus)');
});

test('popup gửi rcScanResult → onCameraDecoded (điền mã vào scanInput)', () => {
  const sb = makeSandbox({ popupFactory: () => null });
  sb.els.scanInput = { value: '' };
  sb.handlers.message({ data: { type: 'rcScanResult', code: 'Ops123' } });
  assert.equal(sb.els.scanInput.value, 'Ops123', 'mã phải được điền vào ô quét');
});
