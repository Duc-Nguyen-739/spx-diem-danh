/**
 * tests/ocr-scan.test.js — Node thuần (không cần GAS, không cần DOM thật).
 * Test OCR FALLBACK đọc chữ "Ops…" khi mã vạch mờ (2026-08-16):
 * thẻ NV in Code128 + dòng chữ Ops… (Ops7562, Ops158392…); camera không decode được
 * vạch kẻ thì Tesseract.js (tải CDN lúc runtime) đọc chữ, chạy SONG SONG với barcode
 * decode — cái nào ra trước thì done.
 *
 * Test phần THUẦN (không cần mạng/Tesseract):
 * - normalizeOpsCode: chuẩn hóa chuỗi OCR (O↔0, p↔b, khoảng trắng/colon/gạch) → 'OPS…'
 * - pickOpsCandidate: tách mã từ text + words (confidence) + cổng NV đã biết/NV lạ
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

// isKnownCode giả lập STAFF_INFO: chỉ 'OPS129481' là mã NV có thật
function known(code) {
  return String(code || '').toUpperCase() === 'OPS129481';
}

// ---- normalizeOpsCode: chuẩn hóa chuỗi OCR → mã 'OPS…' ----
test('normalizeOpsCode: dạng chuẩn Ops + số → uppercase', () => {
  assert.equal(ctx.normalizeOpsCode('Ops7562'), 'OPS7562');
  assert.equal(ctx.normalizeOpsCode('Ops158392'), 'OPS158392');
  assert.equal(ctx.normalizeOpsCode('ops7562'), 'OPS7562');
});

test('normalizeOpsCode: OCR nhầm O→0 / p→b / dính khoảng trắng, colon, gạch → chuẩn hóa được', () => {
  assert.equal(ctx.normalizeOpsCode('0ps7562'), 'OPS7562');
  assert.equal(ctx.normalizeOpsCode('0PS 7562'), 'OPS7562');
  assert.equal(ctx.normalizeOpsCode('Ops: 158392'), 'OPS158392');
  assert.equal(ctx.normalizeOpsCode('Ops-7562'), 'OPS7562');
  assert.equal(ctx.normalizeOpsCode('obs7562'), 'OPS7562');
});

test('normalizeOpsCode: không phải dạng Ops+3..9 số → null (không nhận nhầm)', () => {
  assert.equal(ctx.normalizeOpsCode('abc123'), null);
  assert.equal(ctx.normalizeOpsCode('Ops'), null);
  assert.equal(ctx.normalizeOpsCode('Ops12'), null);           // < 3 số
  assert.equal(ctx.normalizeOpsCode('Ops1234567890'), null);   // > 9 số
  assert.equal(ctx.normalizeOpsCode(''), null);
  assert.equal(ctx.normalizeOpsCode(null), null);
  assert.equal(ctx.normalizeOpsCode('Ops7562A'), null);        // chữ sau số — không phải mã thuần
});

// ---- pickOpsCandidate: tách mã từ kết quả OCR (text + words) ----
// Object trả về sinh trong vm sandbox (prototype khác realm) — so từng field, không deepEqual
test('pickOpsCandidate: word confidence cao, NV đã biết → nhận luôn', () => {
  const hit = ctx.pickOpsCandidate('', [{ text: 'Ops129481', confidence: 88 }], known, 70);
  assert.equal(hit && hit.code, 'OPS129481');
  assert.equal(hit && hit.confidence, 88);
});

test('pickOpsCandidate: NV lạ (Dư) confidence đủ cao → nhận (đọc đúng chữ trên thẻ)', () => {
  const hit = ctx.pickOpsCandidate('', [{ text: 'Ops777777', confidence: 85 }], known, 70);
  assert.equal(hit && hit.code, 'OPS777777');
  assert.equal(hit && hit.confidence, 85);
});

test('pickOpsCandidate: NV lạ confidence thấp → null (tránh nhận nhầm chữ trên bảng/nền)', () => {
  assert.equal(ctx.pickOpsCandidate('', [{ text: 'Ops777777', confidence: 40 }], known, 70), null);
});

test('pickOpsCandidate: NV đã biết kể cả confidence thấp → vẫn nhận (STAFF_INFO là nguồn chuẩn)', () => {
  const hit = ctx.pickOpsCandidate('', [{ text: 'Ops129481', confidence: 25 }], known, 70);
  assert.equal(hit && hit.code, 'OPS129481');
  assert.equal(hit && hit.confidence, 25);
});

test('pickOpsCandidate: nhiều candidate — ưu tiên NV đã biết hơn confidence cao của NV lạ', () => {
  // OCR thấy 2 mã: Ops111111 (90 — không có trong STAFF_INFO) + Ops129481 (70 — có thật)
  const hit = ctx.pickOpsCandidate('', [
    { text: 'Ops111111', confidence: 90 },
    { text: 'Ops129481', confidence: 70 },
  ], known, 70);
  assert.equal(hit.code, 'OPS129481', 'phải chọn mã khớp NV đã biết');
});

test('pickOpsCandidate: fallback regex trên text thô (không có per-word confidence)', () => {
  // Tesseract trả text dính nhau; dùng confidence ước lượng 60 → cần khớp NV đã biết
  const hit = ctx.pickOpsCandidate('Mã: Ops129481 nhan vien', [], known, 70);
  assert.equal(hit.code, 'OPS129481');
  // NV lạ qua regex (60 < 70) → null — không nhận bừa
  assert.equal(ctx.pickOpsCandidate('Mã: Ops777777 abc', [], known, 70), null);
});

test('pickOpsCandidate: text rỗng / không có Ops → null', () => {
  assert.equal(ctx.pickOpsCandidate('', [], known, 70), null);
  assert.equal(ctx.pickOpsCandidate('khong co ma o day', [], known, 70), null);
  assert.equal(ctx.pickOpsCandidate('OpsXYZ', [], known, 70), null);
});
