/**
 * tests/task-menu.test.js — Node thuần (không cần GAS, không cần browser)
 * Test nút "+Task" (menu chọn loại task) ở CLIENT (index.html): toggleTaskMenu,
 * closeTaskMenu, chooseTaskType.
 *
 * Cách load: khối hàm menu trong index.html được đánh dấu bằng marker
 * "TASK-MENU-START"/"TASK-MENU-END". Test trích khối đó, chạy trong vm
 * (cùng realm — tránh lỗi prototype của vm.createContext) với DOM stub
 * tối thiểu → test ĐÚNG code được deploy, không có bản sao lệch nhau.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// ---- Load khối menu từ index.html ----
const html = fs.readFileSync(path.join(__dirname, '..', 'js.html'), 'utf8');
const m = html.match(/TASK-MENU-START([\s\S]*?)TASK-MENU-END/);
assert.ok(m, 'js.html phải chứa khối TASK-MENU (đánh dấu TASK-MENU-START/END)');
const block = m[1].replace(/^[^\n]*\n/, '').replace(/\n\s*\/\/ ===== TASK-MENU-END.*$/, '');

// ---- DOM stub tối thiểu (chỉ đủ cho 3 hàm menu) ----
function makeEl() {
  const el = {
    _classes: new Set(),
    classList: {
      contains: (c) => el._classes.has(c),
      add: (c) => el._classes.add(c),
      remove: (c) => el._classes.delete(c),
      toggle: (c, force) => {
        if (force === undefined) {
          if (el._classes.has(c)) { el._classes.delete(c); return false; }
          el._classes.add(c); return true;
        }
        if (force) el._classes.add(c); else el._classes.delete(c);
        return force;
      },
    },
    attrs: {},
    setAttribute: (k, v) => { el.attrs[k] = v; },
    focusCount: 0,
    focus() { this.focusCount++; },
    querySelector() { return firstItemEl; },
  };
  return el;
}

let menuEl, btnEl, backEl, firstItemEl, openedModal;
function resetStubs() {
  menuEl = makeEl(); btnEl = makeEl(); backEl = makeEl(); firstItemEl = makeEl();
  openedModal = null;
  global.document = {
    getElementById: (id) => ({ taskMenu: menuEl, btnCreateTask: btnEl, taskMenuBackdrop: backEl }[id]),
  };
}
global.openCreateModal = () => { openedModal = 'reconcile'; };
global.openCreateMealModal = () => { openedModal = 'meal-move'; };

// Chạy khối trong CÙNG realm (runInThisContext) → hàm thấy document/openCreate* ở global.
const { toggleTaskMenu, closeTaskMenu, chooseTaskType } = vm.runInThisContext(
  '(function () {\n' + block + '\nreturn { toggleTaskMenu, closeTaskMenu, chooseTaskType };\n})()'
);

test('khối TASK-MENU chỉ phụ thuộc DOM (không gọi google.script — test được)', () => {
  assert.ok(!/google\.|window\.|fetch\(/i.test(block), 'khối không được gọi google/window/fetch');
});

test('toggleTaskMenu: mở menu → show + aria + backdrop + focus mục đầu', () => {
  resetStubs();
  toggleTaskMenu({ stopPropagation: () => {} });
  assert.ok(menuEl.classList.contains('show'), 'menu mở');
  assert.equal(menuEl.attrs['aria-hidden'], 'false');
  assert.equal(btnEl.attrs['aria-expanded'], 'true');
  assert.ok(backEl.classList.contains('show'), 'backdrop hiện');
  assert.equal(firstItemEl.focusCount, 1, 'focus vào mục đầu tiên');
});

test('toggleTaskMenu: bấm lần 2 → đóng menu', () => {
  resetStubs();
  toggleTaskMenu({});
  toggleTaskMenu({});
  assert.ok(!menuEl.classList.contains('show'), 'menu đóng');
  assert.equal(btnEl.attrs['aria-expanded'], 'false');
  assert.ok(!backEl.classList.contains('show'));
});

test('chooseTaskType(meal-move): đóng menu + mở modal Đi ăn + Move', () => {
  resetStubs();
  toggleTaskMenu({});
  chooseTaskType('meal-move');
  assert.equal(openedModal, 'meal-move', 'mở modal meal-move');
  assert.ok(!menuEl.classList.contains('show'), 'menu đã đóng');
  assert.ok(!backEl.classList.contains('show'));
});

test('chooseTaskType(reconcile): đóng menu + mở modal Điểm danh ca', () => {
  resetStubs();
  toggleTaskMenu({});
  chooseTaskType('reconcile');
  assert.equal(openedModal, 'reconcile', 'mở modal tạo task điểm danh');
  assert.ok(!menuEl.classList.contains('show'));
});

test('closeTaskMenu(): đóng menu + trả focus về nút +Task', () => {
  resetStubs();
  toggleTaskMenu({});
  const before = btnEl.focusCount;
  closeTaskMenu();
  assert.ok(!menuEl.classList.contains('show'));
  assert.equal(btnEl.attrs['aria-expanded'], 'false');
  assert.equal(btnEl.focusCount, before + 1, 'focus quay về nút +Task');
});

test('closeTaskMenu(false): không cướp focus (khi chọn task rồi vào modal)', () => {
  resetStubs();
  toggleTaskMenu({});
  const before = btnEl.focusCount;
  closeTaskMenu(false);
  assert.ok(!menuEl.classList.contains('show'));
  assert.equal(btnEl.focusCount, before, 'không focus khi returnFocus=false');
});

test('bấm backdrop (onclick="closeTaskMenu()") → đóng menu + trả focus', () => {
  resetStubs();
  toggleTaskMenu({});
  const before = btnEl.focusCount;
  closeTaskMenu(); // tương đương onclick backdrop
  assert.ok(!menuEl.classList.contains('show'));
  assert.ok(!backEl.classList.contains('show'));
  assert.equal(btnEl.focusCount, before + 1);
});
