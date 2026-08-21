/**
 * tests/camera-continuous.test.js — Node thuần (không cần GAS, không cần DOM thật).
 * Test QUÉT LIÊN TỤC (2026-08-17): camera KHÔNG đóng sau 1 mã — quét mã tiếp theo ngay;
 * kết quả hiện NGAY DƯỚI CAMERA (chia đôi màn hình: trên là camera, dưới là danh sách
 * thông tin vừa quét).
 *  - Dedup: cùng mã trong CAM_CODE_COOLDOWN_MS (1.5s — giảm từ 10s 2026-08-17) →
 *    onCameraDecoded bỏ qua, không submit trùng (thẻ vẫn nằm trong khung → không spam
 *    toast/danh sách; server DUPLICATE_WINDOW_MS 1.5s vẫn chặn duplicate ghi).
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
    querySelector(sel) {
      const cls = String(sel || '').replace(/^\./, '');
      return node.children.find((c) => String(c.className).split(' ').indexOf(cls) >= 0) || null;
    },
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
    location: { origin: 'https://example.test' },  // postMessage targetOrigin (2026-08-19)
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

// ===== camShouldMergeAny (thuần, hàng chờ optimistic — 2026-08-19) =====
test('camShouldMergeAny: cùng mã trong mergeMs → merge (optimistic + server response)', () => {
  const sb = makeSandbox();
  assert.equal(sb.ctx.camShouldMergeAny([{ code: 'OPS1', ts: 1000 }], 'OPS1', 1500, 2500), true);
});

test('camShouldMergeAny: khác mã → không merge (lượt quét mới)', () => {
  const sb = makeSandbox();
  assert.equal(sb.ctx.camShouldMergeAny([{ code: 'OPS1', ts: 1000 }], 'OPS2', 1500, 2500), false);
});

test('camShouldMergeAny: quá mergeMs → không merge (cùng mã quét lại lần sau)', () => {
  const sb = makeSandbox();
  assert.equal(sb.ctx.camShouldMergeAny([{ code: 'OPS1', ts: 1000 }], 'OPS1', 5000, 2500), false);
});

test('camShouldMergeAny: chưa có lượt trước (rỗng) → không merge', () => {
  const sb = makeSandbox();
  assert.equal(sb.ctx.camShouldMergeAny([], 'OPS1', 1500, 2500), false);
});

test('camShouldMergeAny: response trễ >2.5s của lượt TRƯỚC trong hàng chờ vẫn merge (bug 2026-08-19 backlog)', () => {
  const sb = makeSandbox();
  const pending = [
    { code: 'OPS2', ts: 1000 },   // lượt mới hơn, hết hạn
    { code: 'OPS1', ts: 900 },    // lượt cũ — response của lượt này về trễ
  ];
  assert.equal(sb.ctx.camShouldMergeAny(pending, 'OPS1', 2000, 2500), true);
});

test('camRecordOptimistic: push + giới hạn 8 phần tử', () => {
  const sb = makeSandbox();
  const ctx = sb.ctx;
  for (let i = 0; i < 10; i++) ctx.camRecordOptimistic('OPS' + i, 1000 + i);
  assert.equal(ctx.camResultPending.length, 8, 'giới hạn queue');
  assert.equal(ctx.camResultPending[0].code, 'OPS2', 'shift phần tử cũ nhất');
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
  assert.equal(sb.ctx.__submitScanCalls, 1, 'chỉ submit 1 lần cho cùng mã trong 1.5s');
});

test('onCameraDecoded: hết cooldown 1.5s → cùng mã submit lại (quét nhanh liên tục)', () => {
  const sb = makeSandbox();
  sb.els.scanInput = { value: '' };
  // Giả lập thời gian: lần 1 lúc t=0, lần 2 lúc t=1600 (> 1.5s) → submit lại
  const realNow = Date.now;
  let fakeNow = 0;
  Date.now = () => fakeNow;
  try {
    sb.ctx.onCameraDecoded('OPS123');
    assert.equal(sb.ctx.__submitScanCalls, 1, 'lần đầu submit');
    fakeNow = 1600;
    sb.ctx.onCameraDecoded('OPS123');
    assert.equal(sb.ctx.__submitScanCalls, 2, 'sau 1.6s cùng mã được submit lại');
  } finally {
    Date.now = realNow;
  }
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

test('camCooldownFailed: submit fail → xoá cooldown, quét lại cùng mã NGAY (bug 2026-08-19)', () => {
  const sb = makeSandbox();
  sb.els.scanInput = { value: '' };
  sb.ctx.onCameraDecoded('OPS123');        // decode → cooldown 1.5s được đặt
  assert.equal(sb.ctx.camLastCode, 'OPS123');
  assert.equal(sb.ctx.__submitScanCalls, 1);
  sb.ctx.camCooldownFailed('OPS123');      // js.html gọi khi rollback (server reject/mạng)
  sb.ctx.onCameraDecoded('OPS123');        // không cần chờ hết 1.5s
  assert.equal(sb.ctx.__submitScanCalls, 2, 'submit lại ngay sau khi fail');
  assert.equal(sb.ctx.camLastCode, 'OPS123', 'cooldown mới được đặt lại cho lượt thử');
});

test('camCooldownFailed: mã khác → không ảnh hưởng cooldown đang chờ', () => {
  const sb = makeSandbox();
  sb.els.scanInput = { value: '' };
  sb.ctx.onCameraDecoded('OPS123');
  sb.ctx.camCooldownFailed('OPS999');
  sb.ctx.onCameraDecoded('OPS123');        // vẫn trong 1.5s, cooldown chưa bị xoá
  assert.equal(sb.ctx.__submitScanCalls, 1);
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

test('camAppendResult: quét đan xen A→B→A trong cửa sổ merge → CẬP NHẬT dòng A (không tạo dòng trùng) (2026-08-19)', () => {
  const sb = makeSandbox();
  const body = makeResultsBody();
  sb.els.camResultsBody = body;
  sb.els.camResultsHead = { textContent: '' };
  sb.els.cameraModal = { style: { display: 'flex' } };
  sb.ctx.camOpen = true;
  // Optimistic A → optimistic B (A không còn là dòng cuối)
  sb.ctx.camAppendResult('Dư', { staffId: 'OPS123', staffName: '…' }, false);
  sb.ctx.camAppendResult('Có mặt', { staffId: 'OPS456', staffName: 'Trần B' }, false);
  assert.equal(body.children.length, 2, '2 dòng sau 2 lượt quét');
  // Server response của A về sau (trong 2.5s) → phải CẬP NHẬT dòng A, không thêm dòng 3
  sb.ctx.camAppendResult('Dư', { staffId: 'OPS123', staffName: 'Nguyễn Văn A' }, false);
  assert.equal(body.children.length, 2, 'vẫn 2 dòng — không tạo dòng trùng cho A');
  assert.ok(body.children[0].innerHTML.indexOf('Nguyễn Văn A') >= 0, 'dòng A (không phải dòng cuối) được cập nhật tên thật');
  assert.ok(body.children[1].innerHTML.indexOf('Trần B') >= 0, 'dòng B không bị đụng');
});

test('camAppendResult: scroll CONTAINER #camResults xuống dòng mới + row có class new (2026-08-17)', () => {
  const sb = makeSandbox();
  const body = makeResultsBody();
  sb.els.camResultsBody = body;
  sb.els.camResults = { scrollTop: 0, scrollHeight: 999 }; // scroll container thật (.camera-results)
  sb.els.camResultsHead = { textContent: '' };
  sb.els.cameraModal = { style: { display: 'flex' } };
  sb.ctx.camOpen = true;
  sb.ctx.camAppendResult('Có mặt', { staffId: 'OPS123', staffName: 'A' }, false);
  assert.equal(sb.els.camResults.scrollTop, 999, 'scroll container cuộn xuống dòng mới (trước set trên body con — vô tác dụng)');
  assert.ok(body.lastElementChild.className.indexOf('new') >= 0, 'dòng mới có class new (highlight)');
  // Lượt quét mã khác → vẫn scroll xuống dòng mới
  sb.els.camResults.scrollTop = 0;
  sb.ctx.camAppendResult('Dư', { staffId: 'OPS456', staffName: 'B' }, false);
  assert.equal(sb.els.camResults.scrollTop, 999, 'mã mới → scroll lại xuống dưới');
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

// ===== BUG 10 (2026-08-18): cập nhật tên dòng Dư theo mã khi response về sau lượt quét khác =====
test('camUpdateName: modal — tìm dòng theo code (không phải dòng cuối) và điền tên thật', () => {
  const sb = makeSandbox();
  const body = makeResultsBody();
  sb.els.camResultsBody = body;
  sb.els.cameraModal = { style: { display: 'flex' } };
  sb.ctx.camOpen = true;
  // Dòng Dư (NV lạ) — tên "…" chưa biết
  sb.ctx.camAppendResult('Dư', { staffId: 'OPS123', staffName: '…' }, false);
  // Rồi quét tiếp NV khác → dòng Dư KHÔNG còn là dòng cuối
  sb.ctx.camAppendResult('Có mặt', { staffId: 'OPS456', staffName: 'Trần B' }, false);
  // Server response của OPS123 về sau → camUpdateName tìm theo code OPS123, không đụng dòng cuối
  const nameEl = { textContent: '…' };
  body.children[0].querySelector = function (sel) {
    assert.equal(sel, '.cr-name');
    return nameEl;
  };
  sb.ctx.camUpdateName('OPS123', 'Nguyễn Văn A');
  assert.equal(nameEl.textContent, 'Nguyễn Văn A', 'dòng OPS123 (không phải dòng cuối) được điền tên thật');
  // Lượt quét thường (không Dư) không được gọi camUpdateName ở js.html — nhưng nếu gọi,
  // vẫn tìm đúng dòng theo code (không đổi dòng khác)
  const nameEl2 = { textContent: 'Trần B' };
  body.children[1].querySelector = function () { return nameEl2; };
  sb.ctx.camUpdateName('OPS456', 'Trần B');
  assert.equal(nameEl2.textContent, 'Trần B');
});

test('camUpdateName: không mở camera / không có mã / không tên → no-op (không crash)', () => {
  const sb = makeSandbox();
  sb.els.camResultsBody = makeResultsBody();
  sb.ctx.camOpen = false;
  sb.ctx.camUpdateName('OPS1', 'X');  // camera tắt
  sb.ctx.camOpen = true;
  sb.ctx.camUpdateName('', 'X');       // mã rỗng
  sb.ctx.camUpdateName('OPS1', '');    // tên rỗng
  assert.equal(sb.els.camResultsBody.children.length, 0, 'không thêm dòng, không crash');
});

// ===== rAF loop: quét liên tục KHÔNG chết sau mã đầu (bug 2026-08-17) =====
test('rAF loop: decode thành công vẫn lên lịch frame kế tiếp (quét liên tục)', () => {
  // Nhánh BarcodeDetector ra mã phải requestAnimationFrame(loop) TRƯỚC return —
  // nếu không, thiết bị có BarcodeDetector chỉ quét được 1 mã rồi đứng.
  const seg = script.split('camDetector.detect(video).then')[1] || '';
  assert.ok(seg.indexOf('requestAnimationFrame(loop)') >= 0, 'nhánh decode thành công phải rAF tiếp');
  const successBlock = seg.slice(0, seg.indexOf('})')).replace(/\/\/[^\n]*\n/g, '');
  const rafIdx = successBlock.indexOf('requestAnimationFrame(loop)');
  const retIdx = successBlock.indexOf('return;');
  assert.ok(rafIdx !== -1 && retIdx !== -1 && rafIdx < retIdx,
    'requestAnimationFrame(loop) phải đứng TRƯỚC return trong nhánh ra mã');
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
  assert.ok(html.indexOf('lastCodeTs < 1500') >= 0, 'popup dedup cùng mã 1.5s');
  assert.ok(html.indexOf('popWorkerStatus') === -1, 'KHÔNG còn indicator worker (đã tắt — user yêu cầu 2026-08-17)');
  assert.ok(html.indexOf('window.close(); } catch (e) {} }, 1000') === -1, 'KHÔNG còn auto-close 1s sau khi nhận mã');
});

// ===== Popup addResultRow: update chỉ mang tên → giữ badge/giờ cũ =====
function extractPopupFn(popupHtml, fnName) {
  const m = popupHtml.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(m, 'popup phải có khối <script>');
  const src = m[1];
  const start = src.indexOf('function ' + fnName + '(');
  assert.ok(start >= 0, 'popup phải có ' + fnName);
  let depth = 0;
  let end = start;
  for (let i = start; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  return src.slice(start, end);
}

test('popup addResultRow: update chỉ mang tên → giữ badge trạng thái + giờ cũ (bug 2026-08-19)', () => {
  const written = [];
  const sb = makeSandbox({ popupFactory: () => ({ closed: false, focus() {}, document: { open() {}, write(s) { written.push(s); }, close() {} } }) });
  sb.ctx.openCameraScan();
  const html = written[0];
  const fnSrc = extractPopupFn(html, 'addResultRow');
  assert.ok(fnSrc.indexOf('querySelector(".rbadge")') >= 0, 'update phải bảo tồn badge cũ');
  const body = makeResultsBody();
  const head = makeNode();
  const els = {
    resultsBody: body,
    resultsHead: head,
    results: { scrollTop: 0, scrollHeight: 50 },
  };
  const ctx = {
    document: {
      getElementById(id) { return els[id] || null; },
      createElement() { return makeNode(); },
    },
    flashResult() {},
    popSound: false,
  };
  vm.createContext(ctx);
  vm.runInContext(fnSrc, ctx);
  // Lượt 1: thêm dòng Dư 09:02 (optimistic — update=false)
  vm.runInContext('addResultRow({ code: "OPS123", status: "Dư", time: "09:02", staffName: "…", update: false });', ctx);
  // Lượt 2: camUpdateName — server trả tên thật, KHÔNG kèm status/time (update=true)
  vm.runInContext('addResultRow({ code: "OPS123", staffName: "Nguyễn Văn A", update: true });', ctx);
  assert.equal(body.children.length, 1, 'update không thêm dòng mới');
  const badge = body.children[0].children.find((c) => c.className.indexOf('rbadge') === 0);
  const time = body.children[0].children.find((c) => c.className === 'rtime');
  assert.equal(badge.textContent, 'Dư', 'badge trạng thái phải giữ nguyên (trước đây bị xóa trắng)');
  assert.equal(time.textContent, '09:02', 'giờ phải giữ nguyên');
  assert.ok(body.children[0].children.some((c) => c.textContent === 'Nguyễn Văn A'), 'tên thật phải được cập nhật');
});

test('decodeCameraImage: revoke objectURL trên cả onload/onerror + timeout safety (#13)', () => {
  const sb = makeSandbox();
  // Mock URL + Image để đếm revoke
  let revokeCalls = 0;
  let lastUrl = null;
  let timeoutFn = null;
  sb.ctx.URL = {
    createObjectURL: (f) => { lastUrl = 'blob:test-' + f.name; return lastUrl; },
    revokeObjectURL: (u) => { revokeCalls++; assert.equal(u, lastUrl); },
  };
  let imgOnload = null;
  let imgOnerror = null;
  sb.ctx.Image = function () {
    return {
      set src(v) {
        // src set triggers async load — test gọi tay
      },
      get src() { return ''; },
      set onload(fn) { imgOnload = fn; },
      get onload() { return imgOnload; },
      set onerror(fn) { imgOnerror = fn; },
      get onerror() { return imgOnerror; },
    };
  };
  // Override setTimeout để bắt timeout 15s
  const origSetTimeout = sb.ctx.setTimeout;
  sb.ctx.setTimeout = (fn, ms) => {
    if (ms === 15000) timeoutFn = fn;
    return origSetTimeout(fn, ms);
  };
  // Gọi decodeCameraImage với file mock
  vm.runInContext('decodeCameraImage({ name: "test.jpg" });', sb.ctx);
  assert.equal(revokeCalls, 0, 'chưa revoke ngay sau khi tạo URL');
  assert.ok(typeof imgOnload === 'function', 'phải set onload');
  assert.ok(typeof imgOnerror === 'function', 'phải set onerror');
  assert.ok(typeof timeoutFn === 'function', 'phải setTimeout 15s safety');
  // onload → revoke 1 lần
  imgOnload();
  assert.equal(revokeCalls, 1, 'onload phải revoke');
  // gọi lại onload (idempotent) → không revoke thêm
  imgOnload();
  assert.equal(revokeCalls, 1, 'revoke idempotent, không gọi lại');
  // timeout safety sau khi đã revoke → không revoke thêm
  timeoutFn();
  assert.equal(revokeCalls, 1, 'timeout sau khi đã revoke không gọi thêm');
  // reset và test onerror path
  revokeCalls = 0;
  lastUrl = null;
  timeoutFn = null;
  sb.ctx.camDecoding = false;
  vm.runInContext('decodeCameraImage({ name: "bad.jpg" });', sb.ctx);
  imgOnerror();
  assert.equal(revokeCalls, 1, 'onerror phải revoke');
});
