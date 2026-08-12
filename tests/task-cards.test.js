/**
 * tests/task-cards.test.js — Node thuần (không cần GAS, không cần DOM thật).
 * Test DANH SÁCH TASK dạng CARD trên mobile (2026-08-12): bảng 13 cột quá chật trên
 * điện thoại → renderTaskList (js.html) đổi sang card khi matchMedia <=600px. HTML card
 * do hàm thuần taskCardHTML(t) sinh ra — test ĐÚNG code được deploy (trích từ js.html).
 *
 * Đảm bảo: card cùng dữ liệu + action với bảng desktop; task đóng hiện "Xem" thay "Quét";
 * meal-move (không có Ca) không để dấu · rỗng; taskId/creator được escape (chống XSS).
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

// ---- Sandbox: chạy toàn bộ js.html (như js-scanmode.test.js) ----
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

test('taskCardHTML: task đang mở reconcile → mã, badge Đang Mở, loại ca, scope đủ, counts, nút Quét', () => {
  const html = ctx.taskCardHTML({
    taskId: 'R20260812-0900', taskType: 'reconcile',
    station: 'HN2 SOC', slotCode: '08:00-17:00', team: 'Outbound',
    total: 12, scanned: 5, extra: 1, status: 'open',
    createdAtText: '2026-08-12 09:00:00', createdBy: 'duc.nguyenvan05@spxexpress.com',
  });
  assert.ok(html.indexOf('R20260812-0900') >= 0, 'phải hiện mã task');
  assert.ok(html.indexOf('badge open') >= 0 && html.indexOf('Đang Mở') >= 0, 'phải hiện trạng thái Đang Mở');
  assert.ok(html.indexOf('Điểm danh ca') >= 0, 'phải hiện loại task');
  assert.ok(html.indexOf('HN2 SOC') >= 0 && html.indexOf('08:00-17:00') >= 0 && html.indexOf('Outbound') >= 0, 'phải hiện Station/Ca/Team');
  assert.ok(html.indexOf('>12<') >= 0 && html.indexOf('>5<') >= 0 && html.indexOf('>1<') >= 0, 'phải hiện Tổng/Đã quét/Dư');
  assert.ok(html.indexOf('Quét') >= 0 && html.indexOf('Xem') < 0, 'task mở → nút Quét, không phải Xem');
  assert.ok(html.indexOf('duc.nguyenvan05') >= 0, 'phải hiện người tạo (phần tên)');
});

test('taskCardHTML: task đã kết thúc meal-move (không Ca) → badge Kết Thúc, nút Xem, bỏ phần rỗng', () => {
  const html = ctx.taskCardHTML({
    taskId: 'M20260812-0930', taskType: 'meal-move',
    station: 'HN2 SOC', slotCode: '', team: 'Inbound',
    total: 8, scanned: 8, extra: 0, status: 'done',
    createdAtText: '2026-08-12 09:30:00', createdBy: 'admin@spxexpress.com',
  });
  assert.ok(html.indexOf('badge done') >= 0 && html.indexOf('Kết Thúc') >= 0, 'task đóng → badge Kết Thúc');
  assert.ok(html.indexOf('Điểm danh Ra/Vào') >= 0, 'phải hiện loại meal-move');
  assert.ok(html.indexOf('Xem') >= 0 && html.indexOf('Quét') < 0, 'task đóng → nút Xem');
  assert.ok(!/·\s*·/.test(html), 'Ca rỗng không được tạo dấu · kép: ' + html);
  assert.ok(html.indexOf('08:00-17:00') < 0, 'không được hiện Ca rỗng');
});

test('taskCardHTML: không có thời gian/người tạo → footer chỉ còn phần có (không crash, không dấu · thừa)', () => {
  const html = ctx.taskCardHTML({
    taskId: 'T1', taskType: 'reconcile', station: 'A', slotCode: 'B', team: 'C',
    total: 0, scanned: 0, extra: 0, status: 'open',
  });
  assert.ok(html.indexOf('task-card') >= 0);
  assert.ok(html.indexOf('T1') >= 0);
  assert.ok(!/·\s*$/.test(html), 'footer không được kết thúc bằng dấu ·');
});

test('taskCardHTML: escape taskId/creator (chống XSS qua onclick + text)', () => {
  const html = ctx.taskCardHTML({
    taskId: 'R<1>&"', taskType: 'reconcile', station: 'A', slotCode: 'B', team: 'C',
    total: 0, scanned: 0, extra: 0, status: 'open', createdBy: 'a<b@spxexpress.com',
  });
  assert.ok(html.indexOf('<1>') < 0, 'taskId thô không được lọt vào HTML');
  assert.ok(html.indexOf('&lt;1&gt;') >= 0, 'taskId phải được escape');
  assert.ok(html.indexOf('a<b@') < 0, 'creator thô không được lọt vào HTML');
  assert.ok(html.indexOf('a&lt;b') >= 0, 'creator phải được escape (creatorName bỏ domain → không có @)');
});
