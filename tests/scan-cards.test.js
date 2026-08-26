/**
 * tests/scan-cards.test.js — Node thuần (không cần GAS, không cần DOM thật).
 * Test BẢNG NV TRONG TASK dạng CARD trên mobile (2026-08-13): bảng 8–10 cột kéo dài
 * ngang quá khổ màn hình điện thoại → renderScanTable (js.html) đổi sang card khi
 * matchMedia <=600px. HTML card do hàm thuần scanRowCardHTML(r) sinh ra — test ĐÚNG
 * code được deploy (trích từ js.html), giống tests/task-cards.test.js cho danh sách task.
 *
 * Đảm bảo: card cùng dữ liệu với bảng desktop (Mã NV + Tên + badge + chips thông tin);
 * reconcile hiện Vender/Ca/Team/Station + Giờ; meal-move hiện Ca/Team/Station/Ra/Vào/Vender/Phút;
 * NV Dư thêm class extra + badge Dư; staffId/staffName được escape (chống XSS) — cả text
 * lẫn data-id.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const file = fs.readFileSync(path.join(__dirname, '..', 'js.html'), 'utf8');
const m = file.match(/^<script>([\s\S]*?)<\/script>$/);
assert.ok(m, 'js.html phải bọc đúng 1 khối <script>');
const script = m[1];

// ---- Sandbox: chạy toàn bộ js.html (như task-cards.test.js) ----
function makeSandbox() {
  const win = { __RC_DEMO__: false, self: {}, top: {} };
  const ctx = {
    console: console,
    Date: Date,
    Math: Math,
    JSON: JSON,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    setInterval: function () { return 0; },
    clearInterval: function () {},
    location: { search: '', href: 'https://example.test/app' },
    navigator: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' },
    document: {
      readyState: 'complete',
      getElementById: function () { return null; },
      querySelector: function () { return null; },
      querySelectorAll: function () { return []; },
      createElement: function () {
        return { style: {}, setAttribute: function () {}, appendChild: function () {}, removeChild: function () {}, click: function () {} };
      },
      body: { classList: { add: function () {}, remove: function () {} } },
      addEventListener: function () {},
      activeElement: { id: '' },
    },
    localStorage: { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {} },
    URL: { createObjectURL: function () { return 'blob:x'; }, revokeObjectURL: function () {} },
    Image: function () {},
    google: { script: { run: { withSuccessHandler: function () { return this; }, withFailureHandler: function () { return this; }, getTaskDetailApi: function () {} } } },
  };
  ctx.window = win;
  return ctx;
}

const ctx = makeSandbox();
vm.createContext(ctx);
vm.runInContext(script, ctx);

test('scanRowCardHTML: reconcile → Mã NV + Tên + badge Chưa điểm danh + chips đủ (Vender/Ca/Team/Station/Giờ)', () => {
  ctx.CURRENT_TASK = { taskType: 'reconcile' };
  const html = ctx.scanRowCardHTML({
    staffId: 'OPS12345', staffName: 'Nguyễn Văn A', status: '-',
    agency: 'Thầu X', slotCode: '08:00-17:00', team: 'Outbound', station: 'HN2 SOC',
    timeScanText: '09:05:12',
  });
  assert.ok(html.indexOf('scan-row-card') >= 0, 'phải có class card');
  assert.ok(html.indexOf('OPS12345') >= 0, 'phải hiện mã NV');
  assert.ok(html.indexOf('Nguyễn Văn A') >= 0, 'phải hiện tên NV');
  assert.ok(html.indexOf('badge pending') >= 0 && html.indexOf('Chưa điểm danh') >= 0, 'badge phải là Chưa điểm danh');
  assert.ok(html.indexOf('<i>Vender</i>') >= 0 && html.indexOf('Thầu X') >= 0, 'phải hiện Vender');
  assert.ok(html.indexOf('<i>Ca</i>') >= 0 && html.indexOf('08:00-17:00') >= 0, 'phải hiện Ca');
  assert.ok(html.indexOf('<i>Team</i>') >= 0 && html.indexOf('Outbound') >= 0, 'phải hiện Team');
  assert.ok(html.indexOf('<i>Station</i>') >= 0 && html.indexOf('HN2 SOC') >= 0, 'phải hiện Station');
  assert.ok(html.indexOf('<i>Giờ</i>') >= 0 && html.indexOf('09:05:12') >= 0, 'phải hiện Giờ điểm danh');
  assert.ok(html.indexOf('data-id="OPS12345"') >= 0, 'data-id phải đúng mã NV');
  assert.ok(html.indexOf('extra') < 0, 'NV thường không được có class extra');
});

test('scanRowCardHTML: reconcile chưa quét → chip Giờ hiện — (không crash, không trống)', () => {
  ctx.CURRENT_TASK = { taskType: 'reconcile' };
  const html = ctx.scanRowCardHTML({
    staffId: 'OPS1', staffName: 'A', status: '-',
    slotCode: '08:00-17:00', team: 'T', station: 'S',
  });
  assert.ok(html.indexOf('—') >= 0, 'chưa quét → Giờ hiện —');
});

test('scanRowCardHTML: meal-move → chip Ca/Team/Station/Ra/Vào/Vender/Phút; không hiện chip Giờ reconcile', () => {
  ctx.CURRENT_TASK = { taskType: 'meal-move' };
  const html = ctx.scanRowCardHTML({
    staffId: 'OPS2', staffName: 'B', status: 'Có mặt',
    slotCode: '08:00-17:00', team: 'Inbound', station: 'HN3', agency: 'Thầu Y',
    timeRaText: '11:30:00', timeScanText: '11:45:20', durationMinutes: 15,
  });
  assert.ok(html.indexOf('badge present') >= 0 && html.indexOf('Có mặt') >= 0, 'badge phải là Có mặt');
  assert.ok(html.indexOf('<i>Ca</i>') >= 0 && html.indexOf('08:00-17:00') >= 0, 'phải hiện Ca');
  assert.ok(html.indexOf('<i>Team</i>') >= 0 && html.indexOf('Inbound') >= 0, 'phải hiện Team');
  assert.ok(html.indexOf('<i>Station</i>') >= 0 && html.indexOf('HN3') >= 0, 'phải hiện Station');
  assert.ok(html.indexOf('<i>Ra</i>') >= 0 && html.indexOf('11:30:00') >= 0, 'phải hiện Giờ Ra');
  assert.ok(html.indexOf('<i>Vào</i>') >= 0 && html.indexOf('11:45:20') >= 0, 'phải hiện Giờ Vào');
  assert.ok(html.indexOf('<i>Vender</i>') >= 0 && html.indexOf('Thầu Y') >= 0, 'phải hiện Vender');
  assert.ok(html.indexOf('<i>Phút</i>') >= 0 && html.indexOf('>15<') >= 0, 'phải hiện số phút');
  assert.ok(html.indexOf('<i>Giờ</i>') < 0, 'meal-move không dùng chip Giờ reconcile');
  assert.ok(html.indexOf('>—<') < 0, 'meal-move có đủ Ra/Vào → không có chip — thay thế');
});

test('scanRowCardHTML: NV Dư → class extra + badge Dư', () => {
  ctx.CURRENT_TASK = { taskType: 'reconcile' };
  const html = ctx.scanRowCardHTML({
    staffId: 'OPS3', staffName: 'C', status: 'Dư',
    agency: '', slotCode: '', team: '', station: '', timeScanText: '10:00:00',
  });
  assert.ok(html.indexOf('scan-row-card extra') >= 0, 'NV Dư phải có class extra');
  assert.ok(html.indexOf('badge extra') >= 0 && html.indexOf('>Dư<') >= 0, 'badge phải là Dư');
});

test('scanRowCardHTML: escape staffId/staffName (chống XSS — cả text lẫn data-id)', () => {
  ctx.CURRENT_TASK = { taskType: 'reconcile' };
  const html = ctx.scanRowCardHTML({
    staffId: 'OPS<1>&"', staffName: 'X <script>alert(1)</script>', status: '-',
    agency: 'A', slotCode: 'B', team: 'C', station: 'D',
  });
  assert.ok(html.indexOf('<1>') < 0, 'staffId thô không được lọt vào HTML');
  assert.ok(html.indexOf('&lt;1&gt;') >= 0, 'staffId text phải được escape');
  assert.ok(html.indexOf('<script>') < 0, 'staffName thô không được lọt vào HTML');
  assert.ok(html.indexOf('&lt;script&gt;') >= 0, 'staffName phải được escape');
  assert.ok(html.indexOf('data-id="OPS&lt;1&gt;&amp;&quot;"') >= 0, 'data-id phải được escape attribute');
});
