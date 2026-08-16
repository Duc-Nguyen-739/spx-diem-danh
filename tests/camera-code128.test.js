/**
 * tests/camera-code128.test.js — Node thuần (không cần GAS, không cần DOM thật).
 * Test ĐỘ CHÍNH XÁC decode Code128 (bug 2026-08-16 — camera nhận mã vạch nhưng SAI):
 *
 * Root cause (đã phân tích code thư viện vendored lib-quagga.html):
 * 1. code_128_reader của Quagga upstream (2016): checksum symbol ở CODE_C (mã SỐ) là
 *    symbol 2 ký tự (00-99) nhưng decode() chỉ v.splice(v.length-1, 1) → output CÒN THỪA
 *    1 digit checksum. Codeset kết thúc bằng special code (FNC1/switch) → checksum char
 *    không bị bỏ → thừa 1 char.
 * 2. runQuaggaConfigs cũ nhận kết quả config ĐẦU TIÊN đọc được — misread (config yếu
 *    800px+halfSample, hoặc reader EAN/UPC đọc nhầm) thắng decode đúng.
 *
 * Fix: normalizeQuaggaCode128 (dùng STAFF_INFO làm nguồn chuẩn — mã quét là mã NV) +
 * camPickQuaggaMajority (chỉ nhận mã được ≥2 config đồng thuận sau normalize).
 *
 * Cách load: trích toàn bộ <script> trong camera-scan.html (file thật deploy), chạy
 * trong vm sandbox → test ĐÚNG code được deploy (không bản sao).
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
    navigator: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' },
    document: {
      getElementById: function () { return null; },
      createElement: function () { return { style: {}, setAttribute: function () {}, appendChild: function () {}, removeChild: function () {}, click: function () {} }; },
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

// isKnownCode giả lập STAFF_INFO: chỉ 'Ops129481' là mã NV có thật
function known(code) {
  return String(code || '').toUpperCase() === 'OPS129481';
}

// ---- normalizeQuaggaCode128: bỏ checksum digit còn sót (Quagga quirk) ----
test('normalizeQuaggaCode128: mã đúng đã khớp NV → giữ nguyên', () => {
  assert.equal(ctx.normalizeQuaggaCode128('Ops129481', known), 'Ops129481');
});

test('normalizeQuaggaCode128: thừa 1 digit checksum (CODE_C splice bug) → cắt về mã NV', () => {
  // Quagga CODE_C: checksum 2 ký tự nhưng splice chỉ bỏ 1 → output = mã + 1 digit thừa
  assert.equal(ctx.normalizeQuaggaCode128('Ops1294814', known), 'Ops129481');
});

test('normalizeQuaggaCode128: thừa 2 digit (checksum nguyên vẹn — special code cuối) → cắt 2', () => {
  assert.equal(ctx.normalizeQuaggaCode128('Ops12948144', known), 'Ops129481');
});

test('normalizeQuaggaCode128: không khớp NV nào (NV lạ / Dư) → giữ nguyên raw', () => {
  const nvLa = ctx.normalizeQuaggaCode128('Ops7777777', known);
  assert.equal(nvLa, 'Ops7777777', 'NV lạ không được phép sửa');
});

test('normalizeQuaggaCode128: trailing FNC1 (chr 29) bị bỏ trước khi check', () => {
  const fnc1 = 'Ops129481' + String.fromCharCode(29);
  assert.equal(ctx.normalizeQuaggaCode128(fnc1, known), 'Ops129481');
});

test('normalizeQuaggaCode128: raw rỗng / toàn khoảng trắng → rỗng', () => {
  assert.equal(ctx.normalizeQuaggaCode128('', known), '');
  assert.equal(ctx.normalizeQuaggaCode128('   ', known), '');
});

// ---- camPickQuaggaMajority: chỉ nhận mã được ≥2 config đồng thuận (sau normalize) ----
test('camPickQuaggaMajority: 2/3 config cùng mã → nhận mã đó', () => {
  const res = ctx.camPickQuaggaMajority(['Ops129481', 'Ops129481', 'Ops000000'], known, 2);
  assert.equal(res, 'Ops129481');
});

test('camPickQuaggaMajority: 3 config khác nhau (misread ngẫu nhiên) → null, không nhận sai', () => {
  const res = ctx.camPickQuaggaMajority(['Ops111111', 'Ops222222', 'Ops333333'], known, 2);
  assert.equal(res, null, 'không đủ đồng thuận → coi như không đọc được, KHÔNG nhận mã sai');
});

test('camPickQuaggaMajority: config đọc thừa checksum digit vẫn đồng thuận với config đúng sau normalize', () => {
  // Config A đọc đúng 'Ops129481'; config B đọc 'Ops1294814' (thừa digit — Quagga quirk).
  // Cả 2 sau normalize đều = 'Ops129481' → có đồng thuận → nhận ĐÚNG mã.
  const res = ctx.camPickQuaggaMajority(['Ops129481', 'Ops1294814', 'Ops129481'], known, 2);
  assert.equal(res, 'Ops129481');
});

test('camPickQuaggaMajority: minAgree=1 → nhận kết quả đơn (chỉ 1 config chạy)', () => {
  const res = ctx.camPickQuaggaMajority(['Ops129481'], known, 1);
  assert.equal(res, 'Ops129481');
});

test('camPickQuaggaMajority: rỗng → null', () => {
  assert.equal(ctx.camPickQuaggaMajority([], known, 2), null);
});

test('camPickQuaggaMajority: minAgree mặc định 2 khi không truyền', () => {
  const one = ctx.camPickQuaggaMajority(['Ops129481'], known);
  assert.equal(one, null, 'mặc định phải cần ≥2 đồng thuận');
  const two = ctx.camPickQuaggaMajority(['Ops129481', 'Ops129481'], known);
  assert.equal(two, 'Ops129481');
});

test('camPickQuaggaMajority: không cần biến toàn cục STAFF_INFO — isKnownCode truyền vào, không throw', () => {
  // Sandbox không có STAFF_INFO (typeof guard trong camKnownStaffCode) — hàm thuần phải
  // chạy được; 2 config cho CÙNG mã thô vẫn đồng thuận kể cả không có staff check.
  const res = ctx.camPickQuaggaMajority(['Ops129481', 'Ops129481'], function () { return false; }, 2);
  assert.equal(res, 'Ops129481');
});

// ---- camQuaggaResultAllowed: loại reader SỐ THUẦN ngay tại nguồn ----
// Mã NV dạng 'Ops…' có CHỮ → EAN/UPC/i2of5 không bao giờ decode đúng; misread của chúng
// DETERMINISTIC (cùng ảnh + cùng reader → cùng số trên mọi config) → vẫn lọt cổng majority
// ≥2 config → submit mã SAI (bug 2026-08-16 còn sót sau cổng đồng thuận).
test('camQuaggaResultAllowed: EAN/UPC/i2of5 (numeric-only) → false', () => {
  ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'i2of5', '2of5'].forEach((f) => {
    assert.equal(ctx.camQuaggaResultAllowed({ code: '123456789012', format: f }), false, f);
  });
});

test('camQuaggaResultAllowed: format chứa được chữ (code_128/code_39/code_93/codabar) → true', () => {
  ['code_128', 'code_39', 'code_93', 'codabar', 'code_39_vin', 'unknown'].forEach((f) => {
    assert.equal(ctx.camQuaggaResultAllowed({ code: 'Ops129481', format: f }), true, f);
  });
});

test('camQuaggaResultAllowed: format hoa/thường không phân biệt (EAN_13 → ean_13)', () => {
  assert.equal(ctx.camQuaggaResultAllowed({ code: '123', format: 'EAN_13' }), false);
  assert.equal(ctx.camQuaggaResultAllowed({ code: 'Ops129481', format: 'Code_128' }), true);
});

test('camQuaggaResultAllowed: không có format → cho qua (không chặn nhầm reader lạ)', () => {
  assert.equal(ctx.camQuaggaResultAllowed({ code: 'Ops129481', format: '' }), true);
  assert.equal(ctx.camQuaggaResultAllowed({ code: 'Ops129481', format: null }), true);
  assert.equal(ctx.camQuaggaResultAllowed({ code: 'Ops129481' }), true);
});

test('camQuaggaResultAllowed: rỗng / không có code → false', () => {
  assert.equal(ctx.camQuaggaResultAllowed(null), false);
  assert.equal(ctx.camQuaggaResultAllowed({}), false);
  assert.equal(ctx.camQuaggaResultAllowed({ code: '', format: 'code_128' }), false);
});
