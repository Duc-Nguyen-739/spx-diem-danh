/**
 * tests/camera-continuous.test.js — Node thuần (không cần GAS, không cần DOM thật).
 * Test QUÉT LIÊN TỤC (2026-08-17): camera KHÔNG đóng sau 1 mã — quét mã tiếp theo ngay;
 * kết quả hiện NGAY DƯỚI CAMERA (chia đôi màn hình: trên là camera, dưới là danh sách
 * thông tin vừa quét).
 *  - Dedup: cùng mã trong CAM_CODE_COOLDOWN_MS (10s) → onCameraDecoded bỏ qua, không
 *    submit trùng (thẻ vẫn nằm trong khung → không spam toast/danh sách).
 *  - Merge: optimistic + server response của CÙNG lượt quét (cùng mã trong
 *    CAM_RESULT_MERGE_MS = 2.5s) → cập nhật 1 dòng, không thêm dòng mới (server trả
 *    tên thật cho NV lạ). camShouldMergeResult là quyết định thuần.
 *  - camAppendResult: render danh sách trong modal (#camResultsBody) hoặc gửi
 *    {type:'rcScanInfo'} về popup GAS.
 *  - Popup: HTML có danh sách kết quả (#resultsBody) + nhận rcScanInfo; sendResult
 *    không tự đóng popup sau 1 mã.
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

// Node mock: đủ setAttribute/getAttribute/appendChild/children để test camAppendResult
function makeNode() {
  const attrs = {};
  const node = {
    style: {},
    className: '',
    innerHTML: '',
    textContent: '',
    children: [],
    setAttribute(k, v) { attrs[k] = String(v); },
    getAttribute(k) { return attrs[k] || null; },
    appendChild(c) { node.children.push(c); },
    removeChild() {},
    click() {},
  };
  return node;
}

function makeResultsBody() {
  const body = makeNode();
  body.lastElementChild = null;
  body.scrollTop = 0;
  body.scrollHeight = 100;
  const orig = body.appendChild.bind(body);
  body.appendChild = function (el) {
    orig(el);
    body.lastElementChild = el;
  };
  return body;
}

function makeSandbox(opts) {
  opts = opts || {};
  const els = {};
  const handlers = {};
  const scheduled = [];
  const opened = [];
  const doc = {
    getElementById(id) { return els[id] || null; },
    createElement() { return makeNode(); },
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
    submitScan() { ctx.__submitScanCalls = (ctx.__submitScanCalls || 0) + 1; },
  };
  ctx.window = win;
  vm.createContext(ctx);
  vm.runInContext(script, ctx);
  return { ctx, els, handlers, scheduled, opened };
}

// ===== camShouldMergeResult (thuần) =====
test('camShouldMergeResult: cùng mã trong mergeMs → merge (optimistic + server response)', () => {
  const sb = makeSandbox();
  assert.equal(sb.ctx.camShouldMergeResult('OPS1', 1000, 'OPS1', 1500, 2500), true);
});

test('camShouldMergeResult: khác mã → không merge (lượt quét mới)', () => {
  const sb = makeSandbox();
  assert.equal(sb.ctx.camShouldMergeResult('OPS1', 1000, 'OPS2', 1500, 2500), false);
});

test('camShouldMergeResult: quá mergeMs → không merge (cùng mã quét lại lần sau)', () => {
  const sb = makeSandbox();
  assert.equal(sb.ctx.camShouldMergeResult('OPS1', 1000, 'OPS1', 5000, 2500), false);
});

test('camShouldMergeResult: chưa có lượt trước (prevTs=0) → không merge', () => {
  const sb = makeSandbox();
  assert.equal(sb.ctx.camShouldMergeResult('', 0, 'OPS1', 1500, 2500), false);
});

// ===== camEsc / camResultRowHTML (thuần) =====
test('camEsc: escape & < > " (chống XSS trong dòng kết quả)', () => {
  const sb = makeSandbox();
  assert.equal(sb.ctx.camEsc('<b>&"x"</b>'), '&lt;b&gt;&amp;&quot;x&quot;&lt;/b&gt;');
  assert.equal(sb.ctx.camEsc(null), '');
});

test('camResultRowHTML: đủ mã + tên + giờ + badge ok; Dư → extra; lỗi → err', () => {
  const sb = makeSandbox();
  const ok = sb.ctx.camResultRowHTML({ code: 'OPS123', staffName: 'Nguyễn Văn A', time: '14:32:05', status: 'Có mặt', isError: false });
  assert.ok(ok.indexOf('OPS123') >= 0 && ok.indexOf('Nguyễn Văn A') >= 0 && ok.indexOf('14:32:05') >= 0, 'đủ mã/tên/giờ');
  assert.ok(ok.indexOf('cr-badge ok') >= 0, 'badge ok cho trạng thái thường');
  const extra = sb.ctx.camResultRowHTML({ code: 'OPS1', status: 'Dư', isError: false });
  assert.ok(extra.indexOf('cr-badge extra') >= 0, 'badge extra cho Dư');
  const err = sb.ctx.camResultRowHTML({ code: 'OPS1', status: 'Sai mã', isError: true });
  assert.ok(err.indexOf('cr-badge err') >= 0, 'badge err cho lỗi');
});

test('camResultRowHTML: staffName chứa HTML → được escape', () => {
  const sb = makeSandbox();
  const html = sb.ctx.camResultRowHTML({ code: 'OPS1', staffName: '<script>alert(1)</script>', status: 'Có mặt', isError: false });
  assert.ok(html.indexOf('<script>') === -1, 'không được chèn thẻ script');
  assert.ok(html.indexOf('&lt;script&gt;') >= 0, 'phải escape thẻ');
});

// ===== onCameraDecoded: dedup liên tục =====
test('onCameraDecoded: cùng mã trong cooldown → submit 1 lần (không spam)', () => {
  const sb = makeSandbox();
  sb.els.scanInput = { value: '' };
  sb.ctx.onCameraDecoded('OPS123');
  sb.ctx.onCameraDecoded('OPS123'); // cùng mã ngay sau đó (thẻ vẫn trong khung)
  sb.ctx.onCameraDecoded('OPS123');
  assert.equal(sb.ctx.__submitScanCalls, 1, 'chỉ submit 1 lần cho cùng mã trong 10s');
});

test('onCameraDecoded: mã khác → submit tiếp (quét liên tục không dừng)', () => {
  const sb = makeSandbox();
  sb.els.scanInput = { value: '' };
  sb.ctx.onCameraDecoded('OPS111');
  sb.ctx.onCameraDecoded('OPS222');
  sb.ctx.onCameraDecoded('OPS333');
  assert.equal(sb.ctx.__submitScanCalls, 3, 'mỗi mã khác nhau submit 1 lần');
  assert.equal(sb.ctx.camDecoding, false, 'reset cờ decode sau khi nhận (đường ảnh chụp)');
  assert.equal(sb.ctx.camSnapping, false, 'reset cờ snap sau khi nhận');
});

// ===== camAppendResult: render modal (#camResultsBody) =====
test('camAppendResult: append dòng + đếm header; merge optimistic/server thành 1 dòng', () => {
  const sb = makeSandbox();
  sb.els.camResultsBody = makeResultsBody();
  sb.els.camResultsHead = { textContent: '' };
  sb.els.cameraModal = { style: { display: 'flex' } }; // modal đang mở (top-level live)
  sb.ctx.camOpen = true;
  // Optimistic (tên "…" chưa biết)
  sb.ctx.camAppendResult('Dư', { staffId: 'OPS123', staffName: '…' }, false);
  assert.equal(sb.els.camResultsBody.children.length, 1, '1 dòng sau lượt quét đầu');
  assert.equal(sb.els.camResultsHead.textContent, 'Kết quả quét (1)');
  // Server response cùng lượt (trong 2.5s, cùng mã) → CẬP NHẬT dòng (tên thật), không thêm
  sb.ctx.camAppendResult('Dư', { staffId: 'OPS123', staffName: 'Nguyễn Văn A' }, false);
  assert.equal(sb.els.camResultsBody.children.length, 1, 'vẫn 1 dòng — merge thay vì thêm');
  const row = sb.els.camResultsBody.lastElementChild;
  assert.ok(row.innerHTML.indexOf('Nguyễn Văn A') >= 0, 'dòng được cập nhật tên thật');
  assert.equal(sb.els.camResultsHead.textContent, 'Kết quả quét (1)');
  // Lượt quét mã khác → thêm dòng mới
  sb.ctx.camAppendResult('Có mặt', { staffId: 'OPS456', staffName: 'Trần B' }, false);
  assert.equal(sb.els.camResultsBody.children.length, 2, 'mã khác → dòng mới');
  assert.equal(sb.els.camResultsHead.textContent, 'Kết quả quét (2)');
});

test('camAppendResult: camera KHÔNG mở → bỏ qua (quét tay không đụng danh sách)', () => {
  const sb = makeSandbox();
  sb.els.camResultsBody = makeResultsBody();
  sb.els.cameraModal = { style: { display: 'flex' } };
  sb.ctx.camOpen = false;
  sb.ctx.camAppendResult('Có mặt', { staffId: 'OPS123', staffName: 'A' }, false);
  assert.equal(sb.els.camResultsBody.children.length, 0, 'không thêm dòng khi không quét camera');
});

test('camAppendResult: modal ĐANG ĐÓNG (popup mode) → không tích dòng ẩn', () => {
  const sb = makeSandbox();
  sb.els.camResultsBody = makeResultsBody();
  sb.els.camResultsHead = { textContent: '' };
  sb.els.cameraModal = { style: { display: 'none' } }; // popup GAS: modal không bao giờ hiện
  sb.ctx.camOpen = true;
  sb.ctx.camAppendResult('Có mặt', { staffId: 'OPS123', staffName: 'A' }, false);
  assert.equal(sb.els.camResultsBody.children.length, 0, 'không thêm dòng khi modal ẩn (popup đã đóng)');
});

// ===== camAppendResult: popup GAS (gửi rcScanInfo về popup) =====
test('camAppendResult: popup đang mở → postMessage rcScanInfo (update=false rồi true)', () => {
  const sb = makeSandbox();
  const popup = { closed: false, msgs: [], postMessage(msg) { this.msgs.push(msg); } };
  sb.ctx.camOpen = true;
  sb.ctx.camPopupRef = popup;
  sb.ctx.camAppendResult('Dư', { staffId: 'OPS123', staffName: '…' }, false);
  sb.ctx.camAppendResult('Dư', { staffId: 'OPS123', staffName: 'Nguyễn Văn A' }, false); // server response
  assert.equal(popup.msgs.length, 2, 'popup nhận 2 message (optimistic + server)');
  assert.equal(popup.msgs[0].type, 'rcScanInfo');
  assert.equal(popup.msgs[0].update, false, 'lượt đầu = thêm dòng');
  assert.equal(popup.msgs[1].update, true, 'server response = cập nhật dòng');
  assert.equal(popup.msgs[1].staffName, 'Nguyễn Văn A', 'server trả tên thật');
});

// ===== Popup: HTML quét liên tục =====
test('popup: có danh sách kết quả dưới camera + nhận rcScanInfo; không tự đóng sau 1 mã', () => {
  const written = [];
  const sb = makeSandbox({ popupFactory: () => ({ closed: false, focus() {}, document: { open() {}, write(s) { written.push(s); }, close() {} } }) });
  sb.ctx.openCameraScan();
  assert.equal(written.length, 1, 'popup được ghi nội dung');
  const html = written[0];
  assert.ok(html.indexOf('id="results"') >= 0, 'popup có vùng danh sách kết quả');
  assert.ok(html.indexOf('id="resultsBody"') >= 0, 'popup có #resultsBody');
  assert.ok(html.indexOf('Kết quả quét') >= 0, 'popup có header kết quả');
  assert.ok(html.indexOf('rcScanInfo') >= 0, 'popup nhận rcScanInfo từ trang cha');
  assert.ok(html.indexOf('quét mã tiếp theo') >= 0, 'sendResult báo quét mã tiếp theo (không đóng)');
  assert.ok(html.indexOf('lastCodeTs < 10000') >= 0, 'popup dedup cùng mã 10s');
  assert.ok(html.indexOf('window.close(); } catch (e) {} }, 1000') === -1, 'KHÔNG còn auto-close 1s sau khi nhận mã');
});
