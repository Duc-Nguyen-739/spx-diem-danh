/**
 * tests/camera-autosnap.test.js — Node thuần (không cần GAS, không cần DOM thật).
 * Test AUTO-SNAP của camera-scan.html (2026-08-11): iOS live loop frame 800px/1 config
 * không bắt được mã vạch kẻ → đo độ rung frame (camMotionScore) + quyết định tự chụp
 * frame 1280px decode đầy đủ (camShouldAutoSnap) → Done không cần bấm "📸 Chụp".
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

// ---- camShouldAutoSnap: quyết định thuần ----
test('camShouldAutoSnap: đủ ổn định 2 lần liên tiếp → snap', () => {
  const r = ctx.camShouldAutoSnap(2, 1, 5000, 1000, 0); // motion 2 < 6, lần stable thứ 2, qua cooldown 1800
  assert.equal(r.snap, true);
  assert.equal(r.stableCount, 0); // reset sau khi snap
});

test('camShouldAutoSnap: frame chuyển động → không snap, reset stableCount', () => {
  const r = ctx.camShouldAutoSnap(30, 1, 5000, 1000, 0);
  assert.equal(r.snap, false);
  assert.equal(r.stableCount, 0);
});

test('camShouldAutoSnap: ổn định nhưng chưa đủ 2 lần → chờ', () => {
  const r = ctx.camShouldAutoSnap(2, 1, 5000, 1000, 0);
  assert.equal(r.snap, true); // lần 2
  const r1 = ctx.camShouldAutoSnap(2, 0, 6000, 1000, 0);
  assert.equal(r1.snap, false); // mới 1 lần
  assert.equal(r1.stableCount, 1);
});

test('camShouldAutoSnap: tôn trọng cooldown (không snap liên tục)', () => {
  // vừa snap xong (lastAutoSnap = now) → chưa qua 1800ms
  const r = ctx.camShouldAutoSnap(2, 1, 2000, 1900, 0);
  assert.equal(r.snap, false);
  assert.equal(r.stableCount, 2); // vẫn đếm ổn định, chỉ chờ cooldown
});

test('camShouldAutoSnap: fail nhiều → cooldown tăng (tránh snap liên tục khi cảnh tĩnh)', () => {
  // fail=3 → cooldown 1800 + 3000 = 4800ms
  const r = ctx.camShouldAutoSnap(2, 1, 5000, 1000, 3);
  assert.equal(r.snap, false); // 5000-1000=4000 < 4800
  const r2 = ctx.camShouldAutoSnap(2, 1, 7000, 1000, 3);
  assert.equal(r2.snap, true); // 7000-1000=6000 > 4800
});

// ---- camMotionScore: đo độ rung trên frame downscale 20x15 ----
test('camMotionScore: frame y hệt nhau → điểm thấp (ổn định)', () => {
  // Tạo sandbox riêng để camTinyCanvas/camPrevFrame sạch
  const c2 = makeSandbox();
  vm.createContext(c2);
  vm.runInContext(script, c2);
  let framePixels = new Uint8ClampedArray(20 * 15 * 4); // toàn 0
  c2.document.createElement = function () {
    return {
      width: 0, height: 0,
      getContext: function () {
        return {
          drawImage: function () {},
          // getImageData thật trả MẢNG MỚI mỗi lần gọi → mock phải copy, không trả cùng tham chiếu
          getImageData: function () { return { data: framePixels.slice() }; },
        };
      },
    };
  };
  const canvas = {};
  assert.equal(c2.camMotionScore(canvas, 800, 600), 0); // frame đầu: lưu mốc, trả 0
  const score = c2.camMotionScore(canvas, 800, 600);     // y hệt → 0
  assert.ok(score < 6, 'frame y hệt phải ổn định, score=' + score);
});

test('camMotionScore: sáng đổi nhẹ đều → vẫn ổn định; đổi mạnh → chuyển động', () => {
  const c3 = makeSandbox();
  vm.createContext(c3);
  vm.runInContext(script, c3);
  let px = new Uint8ClampedArray(20 * 15 * 4);
  const fill = (v) => { for (let i = 0; i < px.length; i++) px[i] = v; };
  fill(100);
  c3.document.createElement = function () {
    return { width: 0, height: 0, getContext: function () { return { drawImage: function () {}, getImageData: function () { return { data: px.slice() }; } }; } };
  };
  const canvas = {};
  c3.camMotionScore(canvas, 800, 600);   // mốc: 100
  fill(103);                             // lệch 3/255 → ổn định
  assert.ok(c3.camMotionScore(canvas, 800, 600) < 6, 'lệch nhẹ phải ổn định');
  fill(200);                             // lệch ~97/255 → chuyển động
  assert.ok(c3.camMotionScore(canvas, 800, 600) >= 6, 'lệch mạnh phải phát hiện chuyển động');
});
