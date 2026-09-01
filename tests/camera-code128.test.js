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

// ---- camFastDecode: FAST PATH 1 config Quagga (2026-08-16 tối ưu tốc độ) ----
// Mỗi tick chạy 1 config mạnh nhất (full-res + x-large) — CHỈ nhận mã khớp NV đã biết
// (STAFF_INFO = nguồn chuẩn) → done NGAY, không chờ 3 config. NV lạ → null (full chain lo).
function fastEnv(quaggaImpl, staffInfo, fn) {
  const savedQ = ctx.window.Quagga;
  const savedS = ctx.STAFF_INFO;
  ctx.window.Quagga = quaggaImpl;
  ctx.STAFF_INFO = staffInfo;
  try { fn(); } finally { ctx.window.Quagga = savedQ; ctx.STAFF_INFO = savedS; }
}

function fastFrame() {
  return { canvas: { toDataURL() { return 'data:image/jpeg;base64,x'; } }, w: 1280, h: 960, data: {} };
}

test('camFastDecode: đọc đúng mã NV đã biết → trả mã (done ngay tick đầu)', () => {
  const cfg = [];
  fastEnv({ decodeSingle(c, cb) { cfg.push(c); cb({ codeResult: { code: 'Ops129481', format: 'code_128' } }); } }, { OPS129481: {} }, () => {
    let got = 'pending';
    ctx.camFastDecode(fastFrame(), (code) => { got = code; });
    assert.equal(got, 'Ops129481');
    assert.equal(cfg.length, 1, 'chỉ chạy 1 config — config đầu ra mã là dừng sớm');
    assert.equal(cfg[0].locator.patchSize, 'x-large', 'config đầu: x-large (mã to/dí sát)');
    assert.equal(cfg[0].inputStream.size, ctx.CAM_FAST_DECODE_SIZE, 'fast path decode 1280px ĐẦY ĐỦ — 800px làm vạch mỏng alias → miss frame (2026-08-17)');
  });
});

test('camFastDecode: thừa checksum digit → normalize về mã NV đã biết → vẫn nhận', () => {
  fastEnv({ decodeSingle(c, cb) { cb({ codeResult: { code: 'Ops1294814', format: 'code_128' } }); } }, { OPS129481: {} }, () => {
    let got = 'pending';
    ctx.camFastDecode(fastFrame(), (code) => { got = code; });
    assert.equal(got, 'Ops129481');
  });
});

test('camFastDecode: mã Ops chưa có trong StaffData (Dư) → vẫn nhận nhanh (không chờ full chain)', () => {
  fastEnv({ decodeSingle(c, cb) { cb({ codeResult: { code: 'Ops777777', format: 'code_128' } }); } }, { OPS129481: {} }, () => {
    let got = 'pending';
    ctx.camFastDecode(fastFrame(), (code) => { got = code; });
    // Quagga quirk +1 chiếm đa số → ưu tiên cắt 1 ký tự cuối (giống mọi mã NV lạ qua fast path)
    assert.equal(got, 'OPS77777');
  });
});

test('camFastDecode: NV lạ thừa 1 digit checksum (quirk) → cắt về mã đúng dạng', () => {
  fastEnv({ decodeSingle(c, cb) { cb({ codeResult: { code: 'Ops7777774', format: 'code_128' } }); } }, { OPS129481: {} }, () => {
    let got = 'pending';
    ctx.camFastDecode(fastFrame(), (code) => { got = code; });
    assert.equal(got, 'OPS777777');
  });
});

test('camFastDecode: reader số thuần (EAN) → bị lọc format → null', () => {
  fastEnv({ decodeSingle(c, cb) { cb({ codeResult: { code: '123456789012', format: 'ean_13' } }); } }, { OPS129481: {} }, () => {
    let got = 'pending';
    ctx.camFastDecode(fastFrame(), (code) => { got = code; });
    assert.equal(got, null);
  });
});

test('camFastDecode: không có Quagga → null (fail an toàn, không crash)', () => {
  fastEnv(undefined, { OPS129481: {} }, () => {
    let got = 'pending';
    ctx.camFastDecode(fastFrame(), (code) => { got = code; });
    assert.equal(got, null);
  });
});

test('camFastDecode: CAM_FAST_DECODE_SIZE mặc định 1280px (decode đầy đủ — không downscale)', () => {
  assert.equal(ctx.CAM_FAST_DECODE_SIZE, 1280);
});

test('camFastDecode: config 1 (x-large) fail → thử config 2 (medium) → nhận mã', () => {
  // decodeSingle lần 1 trả rỗng (x-large miss), lần 2 trả mã hợp lệ (medium bắt)
  const cfg = [];
  fastEnv({
    decodeSingle(c, cb) {
      cfg.push(c);
      cb(cfg.length === 1 ? { codeResult: null } : { codeResult: { code: 'Ops129481', format: 'code_128' } });
    },
  }, { OPS129481: {} }, () => {
    let got = 'pending';
    ctx.camFastDecode(fastFrame(), (code) => { got = code; });
    assert.equal(got, 'Ops129481');
    assert.equal(cfg.length, 2, 'chạy đúng 2 config: x-large → medium');
    assert.equal(cfg[0].locator.patchSize, 'x-large');
    assert.equal(cfg[1].locator.patchSize, 'medium');
  });
});

test('camFastDecode: cả 2 config fail → null (không crash)', () => {
  let calls = 0;
  fastEnv({
    decodeSingle(c, cb) { calls++; cb({ codeResult: null }); },
  }, { OPS129481: {} }, () => {
    let got = 'pending';
    ctx.camFastDecode(fastFrame(), (code) => { got = code; });
    assert.equal(got, null);
    assert.equal(calls, 2, 'đã thử đủ 2 config rồi mới trả null');
  });
});

// ---- camDownscaleFrame: frame 1920 → 1280 cho QUAGGA (2026-08-17; ZXing decode 1920 đầy đủ) ----
test('camDownscaleFrame: frame ≤ maxSide → trả frame gốc (không copy, không vẽ)', () => {
  const frame = { canvas: { toDataURL() { return 'x'; } }, w: 1280, h: 720, data: {} };
  assert.equal(ctx.camDownscaleFrame(frame, 1280), frame);
  assert.equal(ctx.camDownscaleFrame(frame, 1920), frame);
});

test('camDownscaleFrame: frame 1920 → cần downscale nhưng sandbox thiếu DOM canvas → trả frame gốc (fail-open)', () => {
  const frame = { canvas: {}, w: 1920, h: 1080, data: {} };
  assert.equal(ctx.camDownscaleFrame(frame, 1280), frame, 'không crash — decode vẫn chạy với frame gốc');
});

// ---- camFastPickCode: chọn mã nhanh từ 1 kết quả Quagga (nhận cả NV lạ → Dư) ----
test('camFastPickCode: NV đã biết → trả mã chính xác (STAFF_INFO là nguồn chuẩn)', () => {
  fastEnv(null, { OPS129481: {} }, () => {
    assert.equal(ctx.camFastPickCode('Ops129481'), 'Ops129481');
    // thừa checksum digit → normalize về mã NV đã biết
    assert.equal(ctx.camFastPickCode('Ops1294814'), 'Ops129481');
    // trailing FNC1 bị bỏ
    assert.equal(ctx.camFastPickCode('Ops129481' + String.fromCharCode(29)), 'Ops129481');
  });
});

test('camFastPickCode: NV lạ đúng dạng Ops… → nhận (Dư), ưu tiên cắt 1 ký tự cuối (quirk +1)', () => {
  fastEnv(null, {}, () => {
    assert.equal(ctx.camFastPickCode('Ops777777'), 'OPS77777');
    assert.equal(ctx.camFastPickCode('Ops7777774'), 'OPS777777');
    assert.equal(ctx.camFastPickCode('Ops7562'), 'OPS756');
    assert.equal(ctx.camFastPickCode('0ps 158392'), 'OPS15839'); // OCR-noise prefix cũng chuẩn hóa
  });
});

test('camFastPickCode: không phải dạng Ops + 3..9 số → null (không nhận nhầm EAN/rác)', () => {
  fastEnv(null, {}, () => {
    assert.equal(ctx.camFastPickCode('123456789012'), null);
    assert.equal(ctx.camFastPickCode('Ops'), null);
    assert.equal(ctx.camFastPickCode('Ops12'), null);
    assert.equal(ctx.camFastPickCode(''), null);
    assert.equal(ctx.camFastPickCode(null), null);
  });
});

// ---- runQuaggaConfigs: EARLY-EXIT khi đủ ≥2 config đồng thuận (2026-08-16 tối ưu) ----
// Full chain trước đây LUÔN chạy đủ 3 config dù 2 config đầu đã đồng thuận → thẻ nét phải
// chờ config thừa. Giờ sau mỗi config: nếu results.length ≥ 2 mà camPickQuaggaMajority(…, 2)
// ra mã → dừng sớm, onDone(results) ngay — majority vẫn giữ nguyên (caller gate ≥2).
function quaggaSeq(results) {
  let calls = 0;
  return {
    impl: {
      decodeSingle(opts, cb) {
        calls++;
        cb(results[Math.min(calls - 1, results.length - 1)]);
      },
    },
    calls() { return calls; },
  };
}

function withQuagga(q, fn) {
  const savedQ = ctx.window.Quagga;
  const savedS = ctx.STAFF_INFO;
  ctx.window.Quagga = q.impl;
  ctx.STAFF_INFO = { OPS129481: {} };
  try { fn(); } finally { ctx.window.Quagga = savedQ; ctx.STAFF_INFO = savedS; }
}

test('runQuaggaConfigs: 2 config đầu đồng thuận → dừng sớm, KHÔNG chạy config thứ 3', () => {
  const q = quaggaSeq([
    { codeResult: { code: 'Ops129481', format: 'code_128' } },
    { codeResult: { code: 'Ops129481', format: 'code_128' } },
    { codeResult: { code: 'Ops129481', format: 'code_128' } },
  ]);
  withQuagga(q, () => {
    let done = null;
    ctx.runQuaggaConfigs('data:image/jpeg;base64,x', ctx.CAM_QUAGGA_CONFIGS, 0, [], (results) => { done = results; });
    assert.ok(done, 'onDone phải được gọi (early-exit)');
    assert.equal(q.calls(), 2, 'decodeSingle chỉ chạy 2 lần — bỏ config thứ 3');
    assert.equal(done.length, 2);
    assert.equal(done[0], 'Ops129481');
  });
});

test('runQuaggaConfigs: 2 config khác nhau (chưa đồng thuận) → vẫn chạy tiếp config 3', () => {
  const q = quaggaSeq([
    { codeResult: { code: 'Ops111111', format: 'code_128' } },
    { codeResult: { code: 'Ops222222', format: 'code_128' } },
    { codeResult: { code: 'Ops129481', format: 'code_128' } },
  ]);
  withQuagga(q, () => {
    let done = null;
    ctx.runQuaggaConfigs('data:image/jpeg;base64,x', ctx.CAM_QUAGGA_CONFIGS, 0, [], (results) => { done = results; });
    assert.equal(q.calls(), 3, 'không đồng thuận ở 2 config đầu → chạy đủ 3');
    assert.equal(done.length, 3);
  });
});

test('runQuaggaConfigs: kết quả EAN numeric bị lọc format → không tính vào early-exit', () => {
  const q = quaggaSeq([
    { codeResult: { code: '123456789012', format: 'ean_13' } },
    { codeResult: { code: '123456789012', format: 'ean_13' } },
    { codeResult: { code: 'Ops129481', format: 'code_128' } },
  ]);
  withQuagga(q, () => {
    let done = null;
    ctx.runQuaggaConfigs('data:image/jpeg;base64,x', ctx.CAM_QUAGGA_CONFIGS, 0, [], (results) => { done = results; });
    assert.equal(q.calls(), 3, '2 kết quả numeric-only bị bỏ → phải chạy tới config có format hợp lệ');
    assert.equal(done.length, 1);
    assert.equal(done[0], 'Ops129481');
  });
});

// ===== ZXING-SCAN (2026-08-17): decode Code128 chính xác hơn Quagga — ImageData + TRY_HARDER =====
// ZXing-js decode SẠCH (không quirk thừa checksum như Quagga) → camZxingPickCode KHÔNG cắt
// ký tự cuối (cắt sẽ làm SAI mã NV lạ). Mock window.ZXing tối thiểu để test camZxingDecode.
function zxingFrame(w, h) {
  const data = new Uint8ClampedArray(w * h * 4);
  return { data: { data: data, width: w, height: h }, w: w, h: h, canvas: { toDataURL() { return 'x'; } } };
}

// decodeImpl: hàm trả {text} hoặc throw — set trước mỗi test (reader được cache trong camZxingReader)
let zxingDecodeImpl = function () { throw new Error('nf'); };

function withZxing(fn) {
  const savedZ = ctx.window.ZXing;
  const savedE = ctx.camZxingEnabled;
  const savedR = ctx.camZxingReader;
  ctx.window.ZXing = {
    MultiFormatReader: function () {
      this.decode = function () { return zxingDecodeImpl(); };
    },
    RGBLuminanceSource: function (b, w, h) { this.b = b; },
    BinaryBitmap: function (b) { this.b = b; },
    HybridBinarizer: function (s) { this.s = s; },
    GlobalHistogramBinarizer: function (s) { this.s = s; }, // 2026-08-17: fallback binarizer (mã nhạt/mờ)
    DecodeHintType: { POSSIBLE_FORMATS: 'PF', TRY_HARDER: 'TH' },
    BarcodeFormat: { CODE_128: 'CODE_128', CODE_39: 'CODE_39', CODE_93: 'CODE_93', CODABAR: 'CODABAR', QR_CODE: 'QR_CODE' },
  };
  ctx.camZxingEnabled = true;
  ctx.camZxingReader = null; // tạo mới mỗi lần — tránh cache reader của test trước
  try { fn(); } finally { ctx.window.ZXing = savedZ; ctx.camZxingEnabled = savedE; ctx.camZxingReader = savedR; }
}

test('camZxingPickCode: NV đã biết → giữ nguyên (nguồn chuẩn STAFF_INFO)', () => {
  fastEnv(null, { OPS129481: {} }, () => {
    assert.equal(ctx.camZxingPickCode('Ops129481'), 'Ops129481');
    // trailing FNC1 bị bỏ trước khi check
    assert.equal(ctx.camZxingPickCode('Ops129481' + String.fromCharCode(29)), 'Ops129481');
  });
});

test('camZxingPickCode: NV lạ dạng Ops → chuẩn hóa, KHÔNG cắt ký tự (khác Quagga fast path)', () => {
  fastEnv(null, {}, () => {
    assert.equal(ctx.camZxingPickCode('Ops777777'), 'OPS777777', 'giữ nguyên 6 số — ZXing không thừa checksum');
    assert.equal(ctx.camZxingPickCode('0ps 158392'), 'OPS158392');
  });
});

test('camZxingPickCode: không phải dạng Ops → null (không nhận nhầm EAN/rác)', () => {
  fastEnv(null, {}, () => {
    assert.equal(ctx.camZxingPickCode('123456789012'), null);
    assert.equal(ctx.camZxingPickCode('Ops12'), null);
    assert.equal(ctx.camZxingPickCode(''), null);
    assert.equal(ctx.camZxingPickCode(null), null);
  });
});

test('camZxingDecode: decode thành công → trả mã (chạy TRƯỚC Quagga)', () => {
  withZxing(() => {
    zxingDecodeImpl = function () { return { getText: function () { return 'Ops129481'; } }; };
    let got = 'pending';
    ctx.camZxingDecode(zxingFrame(4, 4), (code) => { got = code; });
    assert.equal(got, 'OPS129481', 'chuẩn hóa uppercase — không có STAFF_INFO trong test này');
  });
});

test('zxingDecodeImageData: tryHarder=true set TRY_HARDER hint; false thì không (2026-08-17)', () => {
  withZxing(() => {
    const seen = [];
    const savedR = ctx.camZxingReader;
    ctx.camZxingReader = {
      decode: function (b, hints) {
        seen.push(hints.get('TH'));
        return null; // zxingDecodeImageData phải tự nuốt throw/null — bậc kế vẫn chạy
      },
    };
    try {
      const img = { data: new Uint8ClampedArray(4 * 4 * 4), width: 4, height: 4 };
      ctx.zxingDecodeImageData(img, 4, 4, false); // bậc 1: nhanh, không TRY_HARDER
      ctx.zxingDecodeImageData(img, 4, 4, true);  // bậc 2: TRY_HARDER (mã xa/nghiêng)
      assert.deepEqual(seen, [undefined, true], 'bậc 1 không set TH (nhanh), bậc 2 set TH');
    } finally { ctx.camZxingReader = savedR; }
  });
});

test('camZxingDecode: full frame fail → BẬC 2 crop native (không TH) TRƯỚC BẬC 3 upscale+TH (2026-08-17)', () => {
  withZxing(() => {
    const thSeen = [];
    const scalesSeen = [];
    const savedR = ctx.camZxingReader;
    // FIX-01: mock decode THROW như ZXing thật (NotFoundException) — mock cũ `return null`
    // không mô phỏng đúng → không bắt được bug ladder chết.
    ctx.camZxingReader = { decode: function (b, hints) { thSeen.push(hints.get('TH')); throw new Error('NotFoundException'); } };
    const savedCrop = ctx.camZxingCrop;
    // Stub camZxingCrop: ghi nhận scale — trả img hợp lệ cho từng bậc (đều decode fail)
    ctx.camZxingCrop = function (frame, w, h, scale) {
      scalesSeen.push(scale);
      const s = scale || 1;
      const cw = Math.max(1, Math.round(w * s));
      const ch = Math.max(1, Math.round(h * s));
      return { img: { data: new Uint8ClampedArray(cw * ch * 4), width: cw, height: ch }, w: cw, h: ch };
    };
    try {
      let got = 'pending';
      ctx.camZxingDecode(zxingFrame(4, 4), (code) => { got = code; });
      assert.equal(got, null, 'cả 3 bậc fail → null');
      assert.deepEqual(scalesSeen, [1, 1.4], 'crop NATIVE chạy trước (rẻ, bắt mã xa nét nhanh), rồi mới upscale 1.4');
      assert.deepEqual(thSeen, [undefined, undefined, true, true], 'bậc 1+2 KHÔNG TRY_HARDER (nhanh), bậc 4+4b (upscale Hybrid + GlobalHistogram) có TRY_HARDER');
    } finally { ctx.camZxingReader = savedR; ctx.camZxingCrop = savedCrop; }
  });
});

test('camZxingDecode: full 1920 fail → BẬC 2 downscale 1280 decode (đa phân giải) TRƯỚC crop (2026-08-17)', () => {
  withZxing(() => {
    let call = 0;
    const savedR = ctx.camZxingReader;
    ctx.camZxingReader = {
      decode: function (b, hints) {
        call++;
        if (call === 1) throw new Error('NotFoundException'); // bậc 1: full 1920 throw như ZXing thật
        return { getText: function () { return 'Ops777777'; } }; // bậc 2: bản 1280 ra mã
      },
    };
    const savedDs = ctx.camDownscaleFrame;
    // frame 4x4 nhưng camDownscaleFrame trả bản 8x8 (giả lập downscale 1920→1280) → bậc 2 chạy
    ctx.camDownscaleFrame = function (frame, maxSide) {
      return { data: { data: new Uint8ClampedArray(8 * 8 * 4), width: 8, height: 8 }, w: 8, h: 8, canvas: frame.canvas };
    };
    try {
      let got = 'pending';
      ctx.camZxingDecode(zxingFrame(4, 4), (code) => { got = code; });
      assert.equal(got, 'OPS777777', 'bản 1280 bắt được mã — không chờ crop/upscale');
      assert.equal(call, 2, 'dừng ngay ở bậc 2 (đa phân giải)');
    } finally { ctx.camZxingReader = savedR; ctx.camDownscaleFrame = savedDs; }
  });
});

// FIX-01 regression: bậc 1 THROW (ZXing thật throw NotFoundException, không trả null)
// → ladder KHÔNG được chết ở bậc 1; bậc 3/4/4b vẫn phải chạy.
test('FIX-01: decode throw NotFoundException → camZxingDecode nuốt được, ladder vẫn đi hết các bậc', () => {
  withZxing(() => {
    const scalesSeen = [];
    const savedR = ctx.camZxingReader;
    ctx.camZxingReader = { decode: function () { throw new Error('NotFoundException'); } };
    const savedCrop = ctx.camZxingCrop;
    ctx.camZxingCrop = function (frame, w, h, scale) {
      scalesSeen.push(scale);
      const s = scale || 1;
      const cw = Math.max(1, Math.round(w * s));
      const ch = Math.max(1, Math.round(h * s));
      return { img: { data: new Uint8ClampedArray(cw * ch * 4), width: cw, height: ch }, w: cw, h: ch };
    };
    try {
      let got = 'pending';
      ctx.camZxingDecode(zxingFrame(4, 4), (code) => { got = code; });
      assert.equal(got, null, 'tất cả bậc fail → null (không crash ra ngoài)');
      assert.deepEqual(scalesSeen, [1, 1.4], 'bậc 3 (crop native) + bậc 4/4b (upscale) vẫn chạy dù bậc 1 throw — ladder không chết');
    } finally { ctx.camZxingReader = savedR; ctx.camZxingCrop = savedCrop; }
  });
});

test('camZxingDecode: frame ≤ 1280 → camDownscaleFrame trả frame gốc → SKIP bậc 2 (không decode trùng) (2026-08-17)', () => {
  withZxing(() => {
    let call = 0;
    const savedR = ctx.camZxingReader;
    // FIX-01: mock THROW như ZXing thật
    ctx.camZxingReader = { decode: function (b, hints) { call++; throw new Error('NotFoundException'); } };
    const savedCrop = ctx.camZxingCrop;
    // camZxingCrop stub hợp lệ — để bậc 3/4 chạy tới được (assert số decode)
    ctx.camZxingCrop = function (frame, w, h, scale) {
      const s = scale || 1;
      const cw = Math.max(1, Math.round(w * s));
      const ch = Math.max(1, Math.round(h * s));
      return { img: { data: new Uint8ClampedArray(cw * ch * 4), width: cw, height: ch }, w: cw, h: ch };
    };
    try {
      let got = 'pending';
      ctx.camZxingDecode(zxingFrame(4, 4), (code) => { got = code; });
      assert.equal(got, null, 'cả 5 bậc fail → null');
      // camDownscaleFrame thật với frame 4x4: scale = min(1, 1280/4) = 1 → trả frame gốc → skip
      assert.equal(call, 4, 'decode: bậc 1 full + bậc 3 crop native + bậc 4 upscale(Hybrid) + bậc 4b (GlobalHistogram) — KHÔNG có bậc 2');
    } finally { ctx.camZxingReader = savedR; ctx.camZxingCrop = savedCrop; }
  });
});

test('camZxingDecode: bậc 4 Hybrid fail → bậc 4b GlobalHistogram ra mã (mã nhạt/mờ 1 góc — 2026-08-17)', () => {
  withZxing(() => {
    // Frame 4x4 → bậc 2 (1280) skip. Thứ tự decode: bậc 1 (Hybrid) → bậc 3 (Hybrid) →
    // bậc 4 (Hybrid) → bậc 4b (GlobalHistogram) = 4 lần; bậc 4b trả mã.
    let call = 0;
    const used = [];
    const savedB = ctx.window.ZXing.BinaryBitmap;
    ctx.window.ZXing.BinaryBitmap = function (b) { used.push(b.constructor ? b.constructor.name : '?'); return { b: b }; };
    const savedR = ctx.camZxingReader;
    ctx.camZxingReader = {
      decode: function (b, hints) {
        call++;
        // FIX-01: fail = THROW như ZXing thật; bậc 4b trả mã
        if (call === 4) return { getText: function () { return 'Ops777777'; } };
        throw new Error('NotFoundException');
      },
    };
    const savedCrop = ctx.camZxingCrop;
    ctx.camZxingCrop = function (frame, w, h, scale) {
      const s = scale || 1;
      const cw = Math.max(1, Math.round(w * s));
      const ch = Math.max(1, Math.round(h * s));
      return { img: { data: new Uint8ClampedArray(cw * ch * 4), width: cw, height: ch }, w: cw, h: ch };
    };
    try {
      let got = 'pending';
      ctx.camZxingDecode(zxingFrame(4, 4), (code) => { got = code; });
      assert.equal(got, 'OPS777777', 'GlobalHistogram bắt mã mà Hybrid miss');
      assert.equal(call, 4, 'chạy đủ bậc 1+3+4 Hybrid rồi mới tới bậc 4b GlobalHistogram');
      assert.equal(used[3], 'GlobalHistogramBinarizer', 'bậc 4b dùng GlobalHistogramBinarizer');
      assert.equal(used[0], 'HybridBinarizer', 'bậc 1 vẫn dùng HybridBinarizer (nhanh)');
    } finally { ctx.camZxingReader = savedR; ctx.camZxingCrop = savedCrop; ctx.window.ZXing.BinaryBitmap = savedB; }
  });
});

test('camZxingDecode: BẬC 2 crop native ra mã → trả NGAY, không chờ bậc 3 (2026-08-17)', () => {
  withZxing(() => {
    // bậc 1 full frame fail; bậc 2 (crop native) decode thành công
    let call = 0;
    const savedR = ctx.camZxingReader;
    ctx.camZxingReader = {
      decode: function (b, hints) {
        call++;
        if (call === 1) return null;            // bậc 1: full frame fail
        return { getText: function () { return 'Ops777777'; } }; // bậc 2: crop native ra mã
      },
    };
    const savedCrop = ctx.camZxingCrop;
    ctx.camZxingCrop = function (frame, w, h, scale) {
      const s = scale || 1;
      const cw = Math.max(1, Math.round(w * s));
      const ch = Math.max(1, Math.round(h * s));
      return { img: { data: new Uint8ClampedArray(cw * ch * 4), width: cw, height: ch }, w: cw, h: ch };
    };
    try {
      let got = 'pending';
      ctx.camZxingDecode(zxingFrame(4, 4), (code) => { got = code; });
      assert.equal(got, 'OPS777777', 'crop native bắt được mã — không chờ bậc upscale+TH chậm');
      assert.equal(call, 2, 'dừng ngay ở bậc 2');
    } finally { ctx.camZxingReader = savedR; ctx.camZxingCrop = savedCrop; }
  });
});

test('camZxingDecode: NotFound (throw) → null (Quagga fallback)', () => {
  withZxing(() => {
    zxingDecodeImpl = function () { throw new Error('nf'); };
    let got = 'pending';
    ctx.camZxingDecode(zxingFrame(4, 4), (code) => { got = code; });
    assert.equal(got, null);
  });
});

test('camZxingDecode: không có ZXing / chưa enabled → null (fail an toàn)', () => {
  const savedZ = ctx.window.ZXing;
  const savedE = ctx.camZxingEnabled;
  ctx.window.ZXing = undefined;
  ctx.camZxingEnabled = false;
  try {
    let got = 'pending';
    ctx.camZxingDecode(zxingFrame(4, 4), (code) => { got = code; });
    assert.equal(got, null);
  } finally { ctx.window.ZXing = savedZ; ctx.camZxingEnabled = savedE; }
});

// ===== WORKER SCAN (2026-08-17): ZXing TRY_HARDER decode trong Web Worker — fail-open =====
test('camWorkerOnMessage: worker trả mã Ops → onCameraDecoded với mã chuẩn hóa; rác/null bỏ qua', () => {
  fastEnv(null, { OPS129481: {} }, () => {
    const calls = [];
    const saved = ctx.onCameraDecoded;
    ctx.onCameraDecoded = (code) => { calls.push(code); };
    try {
      ctx.camWorkerOnMessage({ text: 'Ops129481' });
      assert.deepEqual(calls, ['Ops129481'], 'mã NV đã biết giữ nguyên');
      ctx.camWorkerOnMessage({ text: '123456789012' });
      assert.deepEqual(calls, ['Ops129481'], 'rác/EAN không được submit (pickCode null)');
      ctx.camWorkerOnMessage({ text: null });
      ctx.camWorkerOnMessage({});
      assert.deepEqual(calls, ['Ops129481'], 'null/rỗng không được submit');
    } finally { ctx.onCameraDecoded = saved; }
  });
});

test('camWorkerOnMessage: đang camSnapping (full chain/chụp) → bỏ qua (không đè)', () => {
  fastEnv(null, {}, () => {
    const calls = [];
    const saved = ctx.onCameraDecoded;
    const savedSnap = ctx.camSnapping;
    ctx.onCameraDecoded = (code) => { calls.push(code); };
    ctx.camSnapping = true;
    try {
      ctx.camWorkerOnMessage({ text: 'Ops777777' });
      assert.equal(calls.length, 0, 'worker ra mã khi đang chụp → bỏ qua');
    } finally { ctx.onCameraDecoded = saved; ctx.camSnapping = savedSnap; }
  });
});

test('camWorkerSend: gửi COPY buffer (frame gốc KHÔNG bị detach) + chỉ gửi khi worker rảnh (1-at-a-time)', () => {
  const posts = [];
  const savedW = ctx.camWorker;
  const savedIdle = ctx.camWorkerIdle;
  const savedFailed = ctx.camWorkerFailed;
  ctx.camWorker = { postMessage: (m) => { posts.push(m); } };
  ctx.camWorkerIdle = true;
  ctx.camWorkerFailed = false;
  try {
    const buf = new Uint8ClampedArray(4 * 4 * 4);
    const frame = { data: { data: buf }, w: 4, h: 4 };
    ctx.camWorkerSend(frame);
    assert.equal(posts.length, 1, 'worker rảnh → gửi 1 frame');
    assert.ok(posts[0].buf && typeof posts[0].buf.byteLength === 'number', 'gửi ArrayBuffer');
    assert.equal(posts[0].w, 4);
    // B1 (2026-08-23): offload RGBA→gray SANG WORKER — main gửi thẳng RGBA (64B), worker
    // decodeOne tự convert. Copy đúng byteOffset/len (không gửi buffer đệm thừa).
    assert.equal(posts[0].buf.byteLength, 64, 'gửi RGBA nguyên bản (4x4x4=64) — worker tự convert (B1)');
    assert.equal(buf.length, 64, 'frame gốc KHÔNG bị detach (copy thay vì transfer)');
    ctx.camWorkerSend(frame);
    assert.equal(posts.length, 1, 'idle=false → không gửi tiếp cho tới khi worker trả kết quả');
    // worker trả kết quả → idle lại → gửi được frame mới
    ctx.camWorkerOnMessage({ text: null });
    ctx.camWorkerSend(frame);
    assert.equal(posts.length, 2, 'sau khi worker trả (dù null) → gửi frame mới');
  } finally { ctx.camWorker = savedW; ctx.camWorkerIdle = savedIdle; ctx.camWorkerFailed = savedFailed; }
});

test('ensureZxingWorker: không có Worker/Blob API → failed, không crash (fail-open)', () => {
  const savedW = ctx.Worker;
  const savedB = ctx.Blob;
  const savedF = ctx.camWorkerFailed;
  const savedWk = ctx.camWorker;
  ctx.Worker = undefined;
  ctx.Blob = undefined;
  ctx.camWorkerFailed = false;
  ctx.camWorker = null;
  try {
    ctx.ensureZxingWorker();
    assert.equal(ctx.camWorkerFailed, true, 'không có Worker API → failed (im lặng dùng main decode)');
    assert.equal(ctx.camWorker, null);
  } finally { ctx.Worker = savedW; ctx.Blob = savedB; ctx.camWorkerFailed = savedF; ctx.camWorker = savedWk; }
});

// ===== WORKER CODE THẬT (2026-08-17): chạy decodeOne trong vm — verify worker code không lỗi =====
test('CAM_WORKER_SRC: worker code NGUYÊN BẢN chạy đúng — ready + onmessage decode + try/catch (2026-08-17)', () => {
  // Lấy worker source THẬT (đang deploy), chạy trong vm với ZXing mock — bỏ importScripts
  // (vm không có) nhưng GIỮ NGUYÊN decodeOne + onmessage + postMessage ready → verify toàn
  // bộ logic bên trong worker hoạt động (không lỗi cú pháp/ref, không crash khi decode fail).
  let src = String(ctx.CAM_WORKER_SRC).replace(/importScripts\([^)]*\);\s*/, '');
  const posted = [];
  const wctx = {
    ZXing: {
      MultiFormatReader: function () { this.decode = function () { return { getText: function () { return 'Ops129481'; } }; }; },
      RGBLuminanceSource: function (b, w, h) { this.b = b; },
      BinaryBitmap: function (b) { this.b = b; },
      HybridBinarizer: function (s) { this.s = s; },
      GlobalHistogramBinarizer: function (s) { this.s = s; }, // 2026-08-17: fallback binarizer
      DecodeHintType: { POSSIBLE_FORMATS: 'PF', TRY_HARDER: 'TH' },
      BarcodeFormat: { CODE_128: 1, CODE_39: 2, CODE_93: 3, CODABAR: 4, QR_CODE: 5 },
    },
    self: { postMessage: function (m) { posted.push(m); } },
  };
  wctx.buf = new Uint8ClampedArray(4 * 4 * 4).buffer;
  vm.createContext(wctx);
  vm.runInContext(src, wctx);
  assert.equal(posted.length, 1, 'worker postMessage đúng 1 tín hiệu ready');
  assert.equal(posted[0].ready, true, 'worker postMessage ready sau khi load xong');
  // onmessage decode thành công → trả text
  vm.runInContext('self.onmessage({ data: { buf: buf, w: 4, h: 4 } });', wctx);
  assert.equal(posted[posted.length - 1].text, 'Ops129481', 'worker decode trả text');
  // decode throw (NotFound) → onmessage try/catch → trả null (worker không crash)
  vm.runInContext('reader = null; ZXing.MultiFormatReader = function () { this.decode = function () { throw new Error("nf"); }; }; self.onmessage({ data: { buf: buf, w: 4, h: 4 } });', wctx);
  assert.equal(posted[posted.length - 1].text, null, 'decode lỗi → null (không crash worker)');
  // LUÂN PHIÊN chiến lược (2026-08-17, mã mất góc/mờ màu): reset strat+prev → frame 1 = Hybrid,
  // frame 2 = GlobalHistogram → ra mã (mã nhạt/mờ 1 góc). prev=null giữa các message: tách
  // PASS 2 (test riêng bên dưới) khỏi test xoay chiến lược — mỗi frame đúng 1 decode.
  vm.runInContext('strat = 0; prev = null; reader = null; var dc = 0; ZXing.MultiFormatReader = function () { this.decode = function () { dc++; if (dc === 2) return { getText: function () { return "Ops55555"; } }; return null; }; }; self.onmessage({ data: { buf: buf, w: 4, h: 4 } }); prev = null; self.onmessage({ data: { buf: buf, w: 4, h: 4 } });', wctx);
  assert.equal(posted[posted.length - 1].text, 'Ops55555', 'frame 2 (GlobalHistogram) bắt mã nhạt/mờ 1 góc');
  // frame 3 = Normalized+Hybrid — mã MỜ MÀU/tương phản thấp (normalize min-max trước decode)
  vm.runInContext('strat = 0; prev = null; reader = null; var dc2 = 0; ZXing.MultiFormatReader = function () { this.decode = function () { dc2++; if (dc2 === 3) return { getText: function () { return "Ops33333"; } }; return null; }; }; self.onmessage({ data: { buf: buf, w: 4, h: 4 } }); prev = null; self.onmessage({ data: { buf: buf, w: 4, h: 4 } }); prev = null; self.onmessage({ data: { buf: buf, w: 4, h: 4 } });', wctx);
  assert.equal(posted[posted.length - 1].text, 'Ops33333', 'frame 3 (Normalized+Hybrid) bắt mã mờ màu');
  // normalizeInPlace: stretch min-max về 0-255 (mã mờ màu); range hẹp → no-op (tránh nhiễu)
  vm.runInContext('var g1 = new Uint8ClampedArray([50, 100, 150, 200]); normalizeInPlace(g1); this.r1 = Array.prototype.slice.call(g1); var g2 = new Uint8ClampedArray([120, 130, 140]); normalizeInPlace(g2); this.r2 = Array.prototype.slice.call(g2);', wctx);
  assert.deepEqual(Array.from(wctx.r1), [0, 85, 170, 255], 'stretch min-max về 0-255');
  assert.deepEqual(Array.from(wctx.r2), [120, 130, 140], 'range < 40 → giữ nguyên (không tạo nhiễu)');
  // frame 4 = Sharpen+Normalize+Hybrid — ảnh MỜ/blur (mờ cả dải vạch). prev=null như trên.
  vm.runInContext('strat = 0; prev = null; reader = null; var dc3 = 0; ZXing.MultiFormatReader = function () { this.decode = function () { dc3++; if (dc3 === 4) return { getText: function () { return "Ops44444"; } }; return null; }; }; self.onmessage({ data: { buf: buf, w: 4, h: 4 } }); prev = null; self.onmessage({ data: { buf: buf, w: 4, h: 4 } }); prev = null; self.onmessage({ data: { buf: buf, w: 4, h: 4 } }); prev = null; self.onmessage({ data: { buf: buf, w: 4, h: 4 } });', wctx);
  assert.equal(posted[posted.length - 1].text, 'Ops44444', 'frame 4 (Sharpen+Normalize+Hybrid) bắt mã mờ/blur');
  // sharpenInPlace: unsharp 3x3 — cạnh vạch sắc hơn (pixel vạch tối hơn, nền sáng hơn)
  vm.runInContext('var g3 = new Uint8ClampedArray([200, 100, 200, 200, 100, 200, 200, 100, 200]); sharpenInPlace(g3, 3, 3); this.r3 = Array.prototype.slice.call(g3);', wctx);
  assert.deepEqual(Array.from(wctx.r3), [255, 0, 255, 255, 0, 255, 255, 0, 255], 'sharpen: vạch (100) → 0, nền (200) → 255');
});

test('camWorkerOnMessage: nhận {ready:true} → KHÔNG decode, chỉ cập nhật trạng thái worker', () => {
  fastEnv(null, {}, () => {
    const calls = [];
    const saved = ctx.onCameraDecoded;
    ctx.onCameraDecoded = (code) => { calls.push(code); };
    try {
      ctx.camWorkerOnMessage({ ready: true });
      assert.equal(calls.length, 0, 'ready không phải mã — không submit');
      assert.equal(ctx.camWorkerIdle, true, 'ready cũng reset idle (worker rảnh)');
    } finally { ctx.onCameraDecoded = saved; }
  });
});

test('camFastDecode: ZXing enabled + ra mã → nhận mã ZXing, Quagga KHÔNG chạy', () => {
  withZxing(() => {
    zxingDecodeImpl = function () { return { getText: function () { return 'Ops777777'; } }; };
    let quaggaCalls = 0;
    const savedQ = ctx.window.Quagga;
    ctx.window.Quagga = { decodeSingle(c, cb) { quaggaCalls++; cb({ codeResult: null }); } };
    try {
      let got = 'pending';
      ctx.camFastDecode(zxingFrame(4, 4), (code) => { got = code; });
      assert.equal(got, 'OPS777777', 'ZXing ra mã trước → không cần Quagga');
      assert.equal(quaggaCalls, 0, 'Quagga không được gọi khi ZXing ra mã');
    } finally { ctx.window.Quagga = savedQ; }
  });
});

test('camFastDecode: ZXing fail → Quagga fallback chạy (không mất khả năng nhận)', () => {
  withZxing(() => {
    zxingDecodeImpl = function () { throw new Error('nf'); };
    let quaggaCalls = 0;
    const savedQ = ctx.window.Quagga;
    const savedS = ctx.STAFF_INFO;
    ctx.window.Quagga = {
      decodeSingle(c, cb) {
        quaggaCalls++;
        cb(quaggaCalls === 1 ? { codeResult: null } : { codeResult: { code: 'Ops129481', format: 'code_128' } });
      },
    };
    ctx.STAFF_INFO = { OPS129481: {} }; // normalize Quagga quirk (cắt checksum) về mã NV đúng
    try {
      let got = 'pending';
      ctx.camFastDecode(zxingFrame(4, 4), (code) => { got = code; });
      assert.equal(got, 'Ops129481', 'ZXing fail → Quagga 2 config bắt');
      assert.ok(quaggaCalls >= 1, 'Quagga phải chạy khi ZXing fail');
    } finally { ctx.window.Quagga = savedQ; ctx.STAFF_INFO = savedS; }
  });
});

// ===== ZOOM + WORKER PASS 2 + SYNC FIND MODE (2026-08-31: bắt mã nhanh hơn nữa) =====

test('camShouldAutoZoom: đã tắt tự zoom (2026-09-01) — luôn false, chỉ zoom thủ công', () => {
  fastEnv(null, {}, () => {
    const saved = { find: ctx.camFindMode, zoom: ctx.camZoomCurrent, started: ctx.camStartedAt, lastTs: ctx.camLastCodeTs, max: ctx.CAM_ZOOM_MAX, stream: ctx.camStream };
    try {
      ctx.camStream = { getVideoTracks: () => [{ getCapabilities: () => ({}), applyConstraints: () => {} }] };
      ctx.camFindMode = false;
      ctx.camZoomCurrent = 1.0;
      ctx.camLastCodeTs = 0;
      ctx.camStartedAt = 1000;
      assert.equal(ctx.camShouldAutoZoom(1000 + ctx.CAM_AUTO_ZOOM_MS), false, 'đã tắt tự zoom → luôn false dù đủ thời gian');
      assert.equal(ctx.camShouldAutoZoom(1000 + ctx.CAM_AUTO_ZOOM_MS - 1), false, 'chưa đủ thời gian → false');
      ctx.camLastCodeTs = 2000;
      assert.equal(ctx.camShouldAutoZoom(1000 + ctx.CAM_AUTO_ZOOM_MS), false, 'đã có mã → false');
      ctx.camLastCodeTs = 0;
      ctx.camZoomCurrent = ctx.CAM_ZOOM_MAX;
      assert.equal(ctx.camShouldAutoZoom(1000 + ctx.CAM_AUTO_ZOOM_MS), false, 'đạt trần zoom → false');
      ctx.camZoomCurrent = 1.0;
      ctx.camFindMode = true;
      assert.equal(ctx.camShouldAutoZoom(1000 + ctx.CAM_AUTO_ZOOM_MS), false, 'find mode → false');
      ctx.camStream = null;
      assert.equal(ctx.camShouldAutoZoom(99999), false, 'chưa mở camera (camStream null) → false');
      ctx.camStream = { getVideoTracks: () => [] };
      ctx.camStartedAt = 0;
      assert.equal(ctx.camShouldAutoZoom(99999), false, 'chưa mở camera (startedAt=0) → false');
    } finally {
      ctx.camFindMode = saved.find; ctx.camZoomCurrent = saved.zoom;
      ctx.camStartedAt = saved.started; ctx.camLastCodeTs = saved.lastTs; ctx.CAM_ZOOM_MAX = saved.max; ctx.camStream = saved.stream;
    }
  });
});

test('camZoomStep: tăng/giảm đúng bậc 0.6, clamp [1.0, 3.0], clamp vào khoảng track hỗ trợ', () => {
  fastEnv(null, {}, () => {
    const saved = { stream: ctx.camStream, zoom: ctx.camZoomCurrent };
    try {
      ctx.camStream = null;
      ctx.camZoomCurrent = 1.0;
      ctx.camZoomStep(1);
      assert.equal(ctx.camZoomCurrent, 1.0, 'chưa có stream → không đổi (tránh drift)');
      ctx.camStream = { getVideoTracks: () => [{ applyConstraints: () => {} }] };
      ctx.camZoomCurrent = 1.0;
      ctx.camZoomStep(1);
      assert.equal(ctx.camZoomCurrent, 1.6, 'có stream → bấm + → 1.6x');
      ctx.camZoomStep(1);
      assert.equal(ctx.camZoomCurrent, 2.2, 'bấm + nữa → 2.2x');
      ctx.camZoomCurrent = 3.0;
      ctx.camZoomStep(1);
      assert.equal(ctx.camZoomCurrent, 3.0, 'đạt trần 3.0 → giữ nguyên');
      ctx.camZoomStep(-1);
      assert.equal(ctx.camZoomCurrent, 2.4, 'bấm − → giảm về 2.4x');
      ctx.camZoomCurrent = 1.0;
      ctx.camZoomStep(-1);
      assert.equal(ctx.camZoomCurrent, 1.0, 'đạt sàn 1.0 → giữ nguyên');
      // track mock có getCapabilities zoom 1..2.5 → target vượt max track bị clamp
      ctx.camStream = { getVideoTracks: () => [{ getCapabilities: () => ({ zoom: { min: 1, max: 2.5 } }), applyConstraints: () => {} }] };
      ctx.camZoomCurrent = 2.0;
      ctx.camZoomStep(1); // target 2.6 > max track 2.5 → clamp 2.5
      assert.equal(ctx.camZoomCurrent, 2.5, 'clamp vào max của track (2.5)');
    } finally { ctx.camStream = saved.stream; ctx.camZoomCurrent = saved.zoom; }
  });
});

test('worker CAM_WORKER_SRC: PASS 2 — frame hiện tại fail → decode lại frame TRƯỚC (Global+TH)', () => {
  let src = String(ctx.CAM_WORKER_SRC).replace(/importScripts\([^)]*\);\s*/, '');
  const posted = [];
  // Mock ZXing: decode chỉ THÀNH CÔNG khi (a) binarizer = GlobalHistogramBinarizer (đường
  // pass 2 / strat 1) VÀ (b) gray[0] trong khoảng 5..20 (frame TRƯỚC — bufA=10; frame hiện
  // tại bufB=200). Khoảng giá trị vì grayscale nhân hệ số 0.299/0.587/0.114 rồi |0 —
  // 10*(tổng hệ số) tính float = 9.999... → |0 = 9 (so chính xác 10 sẽ MISS).
  // → trả mã ở pass 2 chứng minh: pass 1 (frame hiện tại) fail, pass 2 (prev) thành công.
  // lastBin = closure (KHÔNG dùng self — hàm mock chạy lexical scope outer trong vm).
  let lastBin = '?';
  const wctx = {
    ZXing: {
      MultiFormatReader: function () { this.decode = function (bitmap) { const v = bitmap.b && bitmap.b.s && bitmap.b.s.b ? bitmap.b.s.b[0] : -1; if (lastBin === 'Global' && v >= 5 && v <= 20) return { getText: function () { return 'Ops129481'; } }; throw new Error('NotFoundException'); }; },
      RGBLuminanceSource: function (b, w, h) { this.b = b; this.w = w; this.h = h; },
      BinaryBitmap: function (b) { this.b = b; },
      HybridBinarizer: function (s) { this.s = s; lastBin = 'Hybrid'; },
      GlobalHistogramBinarizer: function (s) { this.s = s; lastBin = 'Global'; },
      DecodeHintType: { POSSIBLE_FORMATS: 'PF', TRY_HARDER: 'TH' },
      BarcodeFormat: { CODE_128: 1, CODE_39: 2, CODE_93: 3, CODABAR: 4, QR_CODE: 5 },
    },
    self: { postMessage: function (m) { posted.push(m); } },
  };
  wctx.bufA = new Uint8ClampedArray(4 * 4 * 4).fill(10).buffer;   // "frame trước" — decode được
  wctx.bufB = new Uint8ClampedArray(4 * 4 * 4).fill(200).buffer;  // "frame hiện tại" — fail
  vm.createContext(wctx);
  vm.runInContext(src, wctx);
  // Frame 1 (bufA): strat 0 Hybrid → throw; pass 2 chưa có prev → null. prev = frame 1.
  vm.runInContext('self.onmessage({ data: { buf: bufA, w: 4, h: 4 } });', wctx);
  assert.equal(posted[posted.length - 1].text, null, 'frame 1 (Hybrid) fail → null');
  // Frame 2 (bufB): strat 1 Global + bufB(200) → throw; PASS 2: prev = frame 1 (bufA=10)
  // qua GlobalHistogram → RA MÃ (mã chỉ "đúng nét" ở frame bị bỏ lỡ).
  vm.runInContext('self.onmessage({ data: { buf: bufB, w: 4, h: 4 } });', wctx);
  assert.equal(posted[posted.length - 1].text, 'Ops129481', 'pass 2 nhặt lại frame trước → ra mã');
  // Decode được mã → prev clear: frame 3 fail mà không có prev → không pass 2
  vm.runInContext('self.onmessage({ data: { buf: bufB, w: 4, h: 4 } });', wctx);
  assert.equal(posted[posted.length - 1].text, null, 'đã clear prev sau khi nhận mã → không decode frame cũ vô ích');
  // prev được cập nhật lại sau frame fail → frame kế pass 2 kích hoạt lần nữa
  // msg 4 (bufA): pass 1 Hybrid fail; pass 2 trên prev (msg 3 = bufB) vẫn fail → null
  vm.runInContext('self.onmessage({ data: { buf: bufA, w: 4, h: 4 } });', wctx);
  assert.equal(posted[posted.length - 1].text, null, 'pass 2 decode prev KHÔNG đọc được → null (không nhầm)');
  // msg 5 (bufA): pass 1 fail; pass 2 trên prev (msg 4 = bufA) → RA MÃ lần nữa
  vm.runInContext('self.onmessage({ data: { buf: bufA, w: 4, h: 4 } });', wctx);
  assert.equal(posted[posted.length - 1].text, 'Ops129481', 'frame sau fail → pass 2 trên prev ra mã lần nữa');
});

test('camIsFindMode: trả trạng thái camFindMode hiện tại (popup sync qua opener)', () => {
  fastEnv(null, {}, () => {
    const saved = ctx.camFindMode;
    try {
      ctx.camFindMode = true;
      assert.equal(ctx.camIsFindMode(), true);
      ctx.camFindMode = false;
      assert.equal(ctx.camIsFindMode(), false);
    } finally { ctx.camFindMode = saved; }
  });
});

test('index.html: camera-head có 2 nút zoom − / + gọi camZoomStep', () => {
  const idx = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.ok(idx.includes('id="camZoomOut"'), 'có nút zoom out');
  assert.ok(idx.includes('id="camZoomIn"'), 'có nút zoom in');
  assert.ok(/id="camZoomOut"[^>]*onclick="camZoomStep\(-1\)"/.test(idx), 'zoom out gọi camZoomStep(-1)');
  assert.ok(/id="camZoomIn"[^>]*onclick="camZoomStep\(1\)"/.test(idx), 'zoom in gọi camZoomStep(1)');
});

test('camera-css.html: có style cho nút zoom', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'camera-css.html'), 'utf8');
  assert.ok(css.includes('.cam-zoom-btn'), 'có class cam-zoom-btn');
});
