/**
 * tests/camera-autosnap.test.js — Node thuần (không cần GAS, không cần DOM thật).
 * Test AUTO-DECODE của camera-scan.html (2026-08-12): live loop iOS frame 800px/1 config
 * không bắt được mã vạch kẻ; auto-snap cũ gate theo độ rung (CAM_STABLE_MOTION=6/255)
 * quá nhạy với noise camera iPhone → không bao giờ kích hoạt (bug 2026-08-12). Giờ loop
 * TỰ ĐỘNG chạy ĐÚNG chain nút "📸 Chụp" (frame 1280px + jsQR + 3 config Quagga) theo nhịp
 * cố định — quyết định thuần nằm ở camShouldFullDecode(tickCount, interval).
 *
 * Cách load: trích toàn bộ <script> trong camera-scan.html (file thật deploy), chạy
 * trong vm sandbox có DOM mock tối thiểu → test ĐÚNG code được deploy (không bản sao).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// ---- Load script từ camera-scan.html (file thật) ----
const file = fs.readFileSync(path.join(__dirname, '..', 'camera-scan.html'), 'utf8');
const m = file.match(/^<script>([\s\S]*?)<\/script>$/);
assert.ok(m, 'camera-scan.html phải bọc đúng 1 khối <script>');
const script = m[1];

// ---- DOM mock tối thiểu (chỉ đủ để script eval + chạy hàm thuần) ----
function makeSandbox() {
  const win = {};
  const ctx = {
    console: console,
    Date: Date,
    Math: Math,
    JSON: JSON,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    setInterval: setInterval,
    clearInterval: clearInterval,
    requestAnimationFrame: function () { return 0; },
    cancelAnimationFrame: function () {},
    location: { search: '', href: 'https://example.test/app' },
    navigator: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15' },
    document: {
      getElementById: function () { return null; },
      createElement: function () {
        return { style: {}, setAttribute: function () {}, appendChild: function () {}, removeChild: function () {}, click: function () {} };
      },
      body: { classList: { add: function () {}, remove: function () {} } },
      addEventListener: function () {},
    },
    localStorage: { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {} },
    URL: { createObjectURL: function () { return 'blob:x'; }, revokeObjectURL: function () {} },
    Image: function () {},
  };
  win.self = win;
  win.top = win;
  win.addEventListener = function () {};
  ctx.window = win;
  return ctx;
}

const ctx = makeSandbox();
vm.createContext(ctx);
vm.runInContext(script, ctx);

// ---- camShouldFullDecode: quyết định thuần (nhịp full-chain decode) ----
test('camShouldFullDecode: đủ interval tick → run, reset tickCount', () => {
  // interval=2: tick 0 (đếm 1) chưa run; tick 1 → run
  const r1 = ctx.camShouldFullDecode(0, 2);
  assert.equal(r1.run, false);
  assert.equal(r1.tickCount, 1);
  const r2 = ctx.camShouldFullDecode(1, 2);
  assert.equal(r2.run, true);
  assert.equal(r2.tickCount, 0); // reset sau khi run
});

test('camShouldFullDecode: interval=1 → run ngay tick đầu (full chain mọi tick)', () => {
  const r = ctx.camShouldFullDecode(0, 1);
  assert.equal(r.run, true);
  assert.equal(r.tickCount, 0);
});

test('camShouldFullDecode: interval=3 → chạy đúng mỗi 3 tick, không phụ thuộc trạng thái khác', () => {
  let tick = 0;
  const runs = [];
  for (let i = 0; i < 8; i++) {
    const d = ctx.camShouldFullDecode(tick, 3);
    tick = d.tickCount;
    if (d.run) runs.push(i);
  }
  assert.deepEqual(runs, [2, 5]);    // 0,1 đếm; 2 run; 3,4 đếm; 5 run; 6,7 đếm tiếp
  assert.equal(tick, 2);             // đang đếm đến tick 3 (chưa run) — nhịp tiếp tục sau
});

test('camShouldFullDecode: không đọc biến toàn cục — nhịp ổn định bất kể chạy nền', () => {
  // Không có phụ thuộc camStableCount/motion/cooldown — xác nhận không còn motion gate
  const r = ctx.camShouldFullDecode(1, 2);
  assert.equal(r.run, true);
  assert.equal(typeof ctx.camShouldAutoSnap, 'undefined', 'camShouldAutoSnap (motion gate cũ) phải bị xoá');
  assert.equal(typeof ctx.camMotionScore, 'undefined', 'camMotionScore (motion gate cũ) phải bị xoá');
});

// ---- initScanModeIfNeeded: detect scan mode khi wrapper GAS nuốt query (bug 2026-08-12) ----
// Tab quét mở = URL ...userCodeAppPanel?scan=1&tk=... → wrapper GAS nạp app vào iframe
// qua document.write (URL app = /blank, location.search RỖNG) → phải detect qua referrer.
function makeScanSandbox(locationSearch, referrer) {
  const c = makeSandbox();
  c.location = { search: locationSearch, href: 'https://example.test/userCodeAppPanel' + (locationSearch ? '?' + locationSearch.replace(/^\?/, '') : '') };
  c.document = Object.assign({}, c.document, { referrer: referrer });
  vm.createContext(c);
  vm.runInContext(script, c);
  return c;
}

test('initScanModeIfNeeded: wrapper nuốt query (location.search rỗng) nhưng referrer có scan=1 → vào scan mode', () => {
  const c = makeScanSandbox('', 'https://example.test/userCodeAppPanel?scan=1&tk=rc123_456');
  assert.equal(c.camScanMode, true, 'phải vào scan mode qua referrer');
  assert.equal(c.window.__RC_SCAN_MODE__, true, 'phải đặt cờ cho js.html');
  assert.equal(c.camScanToken, 'rc123_456', 'token phải lấy được từ referrer');
});

test('initScanModeIfNeeded: scan=1 có trong location.search → vào scan mode (đường cũ)', () => {
  const c = makeScanSandbox('?scan=1&tk=rc456_789', '');
  assert.equal(c.camScanMode, true);
  assert.equal(c.window.__RC_SCAN_MODE__, true);
  assert.equal(c.camScanToken, 'rc456_789');
});

test('initScanModeIfNeeded: không có scan=1 ở đâu → KHÔNG vào scan mode, không set cờ', () => {
  const c = makeScanSandbox('', 'https://example.test/userCodeAppPanel');
  assert.equal(c.camScanMode, false);
  assert.notEqual(c.window.__RC_SCAN_MODE__, true);
});
