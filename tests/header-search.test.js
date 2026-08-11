/**
 * tests/header-search.test.js — Node thuần (không cần GAS, không cần browser)
 * Test CLIENT (index.html): renderSearchResult, renderSearchMessage, hideSearchResult,
 * clearHeaderSearch, applyTaskFilter — lọc "Danh Sách Task" theo mã Ops tìm ở
 * header search. Nút ✕ duy nhất trong ô tìm kiếm xoá toàn bộ (ô + lọc),
 * không có badge/thanh lọc riêng.
 *
 * Cách load: khối header-search trong index.html được đánh dấu bằng marker
 * "HEADER-SEARCH-START"/"HEADER-SEARCH-END". Test trích khối đó, chạy trong vm
 * (cùng realm — tránh lỗi prototype của vm.createContext) với DOM stub tối thiểu
 * → test ĐÚNG code được deploy, không có bản sao lệch nhau.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// ---- Load khối header-search từ index.html ----
const html = fs.readFileSync(path.join(__dirname, '..', 'js.html'), 'utf8');
const m = html.match(/HEADER-SEARCH-START([\s\S]*?)HEADER-SEARCH-END/);
assert.ok(m, 'js.html phải chứa khối HEADER-SEARCH (đánh dấu HEADER-SEARCH-START/END)');
const block = m[1].replace(/^[^\n]*\n/, '').replace(/\n\s*\/\/ ===== HEADER-SEARCH-END.*$/, '');

// ---- DOM stub tối thiểu ----
function makeEl() {
  const el = {
    hidden: false,
    innerHTML: '',
    textContent: '',
    value: '',
    style: {},
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
    focusCount: 0,
    focus() { this.focusCount++; },
  };
  return el;
}

const SEARCH_IDS = [
  'headerSearchResult', 'taskSkeleton', 'headerSearchInput', 'headerSearchClear',
];
let els = {};
let renderedTasks = null;      // spy: renderTaskList(tasks)
let loadTaskListCalls = 0;     // spy: loadTaskList()

function resetStubs() {
  els = {};
  SEARCH_IDS.forEach(function (id) { els[id] = makeEl(); });
  els.headerSearchResult.hidden = true;
  renderedTasks = null;
  loadTaskListCalls = 0;
  global.document = { getElementById: (id) => els[id] || null };
}
global.renderTaskList = (tasks) => { renderedTasks = tasks; };
global.loadTaskList = () => { loadTaskListCalls++; };
global.esc = (s) => (s === null || s === undefined ? '' : String(s));

// Chạy khối trong CÙNG realm → hàm thấy document/renderTaskList/loadTaskList/esc ở global.
const { renderSearchResult, renderSearchMessage, hideSearchResult, clearHeaderSearch, applyTaskFilter, onSearchInputCleared } =
  vm.runInThisContext(
    '(function () {\n' + block + '\nreturn { renderSearchResult, renderSearchMessage, hideSearchResult, clearHeaderSearch, applyTaskFilter, onSearchInputCleared };\n})()'
  );

test('khối HEADER-SEARCH không phụ thuộc google/window/fetch (giữ test được)', () => {
  assert.ok(!/google\.|window\.|fetch\(/i.test(block), 'khối không được gọi google/window/fetch');
});

// ===== applyTaskFilter =====
test('applyTaskFilter: code + tasks → renderTaskList nhận đúng tasks, ẩn skeleton', () => {
  resetStubs();
  const t1 = { taskId: 'R1' }, t2 = { taskId: 'R2' };
  applyTaskFilter('Ops237511', [t1, t2]);
  assert.deepEqual(renderedTasks, [t1, t2], 'renderTaskList nhận đúng danh sách task đã lọc');
  assert.equal(els.taskSkeleton.style.display, 'none');
});

test('applyTaskFilter: code chỉ trong log (NV Dư) → vẫn lọc theo mã', () => {
  resetStubs();
  applyTaskFilter('Ops999999', [{ taskId: 'R1' }]);
  assert.deepEqual(renderedTasks, [{ taskId: 'R1' }]);
});

test('applyTaskFilter: tasks rỗng → renderTaskList([])', () => {
  resetStubs();
  applyTaskFilter('Ops237511', []);
  assert.deepEqual(renderedTasks, []);
});

test('applyTaskFilter: code rỗng + tasks undefined → không crash', () => {
  resetStubs();
  applyTaskFilter('', undefined);
  assert.deepEqual(renderedTasks, []);
});

// ===== clearHeaderSearch (thay nút "Xoá lọc" cũ — bấm badge/✕/Esc) =====
test('clearHeaderSearch: không có filter → chỉ xoá ô, KHÔNG gọi loadTaskList', () => {
  resetStubs();
  els.headerSearchInput.value = 'Ops237511';
  els.headerSearchClear.classList.add('show');
  clearHeaderSearch();
  assert.equal(els.headerSearchInput.value, '');
  assert.equal(els.headerSearchClear.classList.contains('show'), false);
  assert.equal(els.headerSearchResult.hidden, true);
  assert.equal(loadTaskListCalls, 0, 'không lọc thì không phải tải lại list');
});

test('clearHeaderSearch: đang lọc → xoá ô + tải lại list ĐÚNG 1 lần', () => {
  resetStubs();
  applyTaskFilter('Ops237511', [{ taskId: 'R1' }]);
  clearHeaderSearch();
  assert.equal(loadTaskListCalls, 1);
  // Lần 2: filter đã reset → không gọi loadTaskList nữa (tránh spam RPC)
  clearHeaderSearch();
  assert.equal(loadTaskListCalls, 1, 'không gọi loadTaskList lần 2');
});

// ===== onSearchInputCleared — xoá ô/backspace phải trả "Danh Sách Task" đầy đủ (bug user báo) =====
test('onSearchInputCleared: đang lọc → bỏ lọc + tải lại list ĐÚNG 1 lần', () => {
  resetStubs();
  applyTaskFilter('Ops237511', [{ taskId: 'R1' }]);
  onSearchInputCleared();
  assert.equal(loadTaskListCalls, 1, 'trả danh sách đầy đủ');
  assert.equal(els.headerSearchResult.hidden, true, 'đóng dropdown');
  // Lần 2: filter đã reset → không gọi loadTaskList nữa (tránh spam RPC)
  onSearchInputCleared();
  assert.equal(loadTaskListCalls, 1, 'không gọi loadTaskList lần 2');
});

test('onSearchInputCleared: chưa lọc → chỉ ẩn dropdown, KHÔNG gọi loadTaskList', () => {
  resetStubs();
  onSearchInputCleared();
  assert.equal(loadTaskListCalls, 0);
  assert.equal(els.headerSearchResult.hidden, true);
});

test('onSearchInputCleared: gọi sau khi clearHeaderSearch (đã bỏ lọc) → không tải lại lần nữa', () => {
  resetStubs();
  applyTaskFilter('Ops237511', [{ taskId: 'R1' }]);
  clearHeaderSearch();
  assert.equal(loadTaskListCalls, 1);
  onSearchInputCleared();
  assert.equal(loadTaskListCalls, 1, 'không spam loadTaskList khi đã sạch');
});

// ===== renderSearchResult =====
test('renderSearchResult: ok + staff + tasks → card NV + badge lọc hiện', () => {
  resetStubs();
  renderSearchResult(
    { ok: true, staff: { staffId: 'Ops237511', staffName: 'NV001', slotCode: '08:00-17:00', team: 'Outbound', station: 'HN2 SOC' }, tasks: [{ taskId: 'R1' }, { taskId: 'R2' }] },
    'Ops237511'
  );
  assert.equal(els.headerSearchResult.hidden, false);
  assert.ok(els.headerSearchResult.innerHTML.indexOf('Ops237511') >= 0, 'hiện mã NV');
  assert.equal(renderedTasks.length, 2);
});

test('renderSearchResult: staff có nhưng CHƯA điểm danh task nào → card không báo đếm, KHÔNG lọc list', () => {
  resetStubs();
  renderSearchResult({ ok: true, staff: { staffId: 'Ops237511', staffName: 'NV001' }, tasks: [] }, 'Ops237511');
  assert.equal(els.headerSearchResult.innerHTML.indexOf('Chưa điểm danh ở task nào'), -1, 'không còn dòng đếm trong card');
  assert.equal(renderedTasks, null, 'applyTaskFilter không được gọi khi không có task');
});

test('renderSearchResult: staff = null (chỉ trong log) + tasks → card mã + badge với mã gõ vào', () => {
  resetStubs();
  renderSearchResult({ ok: true, staff: null, tasks: [{ taskId: 'R1' }] }, 'Ops999999');
  assert.ok(els.headerSearchResult.innerHTML.indexOf('Không có trong dữ liệu NV') >= 0);
  assert.equal(renderedTasks.length, 1);
});

test('renderSearchResult: res.ok = false → hiện message lỗi, KHÔNG đụng list', () => {
  resetStubs();
  renderSearchResult({ ok: false, message: 'Không tìm thấy mã OPSXXX' }, 'OPSXXX');
  assert.ok(els.headerSearchResult.innerHTML.indexOf('Không tìm thấy mã OPSXXX') >= 0);
  assert.equal(renderedTasks, null);
});

test('renderSearchResult: ok=false khi ĐANG lọc → bỏ lọc cũ + tải lại list đầy đủ (không giữ badge)', () => {
  resetStubs();
  applyTaskFilter('Ops237511', [{ taskId: 'R1' }]);
  renderSearchResult({ ok: false, message: 'Không tìm thấy mã OPSXXX' }, 'OPSXXX');
  assert.equal(loadTaskListCalls, 1, 'tải lại danh sách đầy đủ');
});

// ===== renderSearchMessage / hideSearchResult =====
test('renderSearchMessage: isErr=true → class sc-err; false → sc-empty', () => {
  resetStubs();
  renderSearchMessage('Lỗi mạng', true);
  assert.ok(els.headerSearchResult.innerHTML.indexOf('sc-err') >= 0);
  assert.equal(els.headerSearchResult.hidden, false);
  renderSearchMessage('Chưa có kết quả', false);
  assert.ok(els.headerSearchResult.innerHTML.indexOf('sc-empty') >= 0);
});

test('hideSearchResult: ẩn box kết quả', () => {
  resetStubs();
  els.headerSearchResult.hidden = false;
  hideSearchResult();
  assert.equal(els.headerSearchResult.hidden, true);
});
