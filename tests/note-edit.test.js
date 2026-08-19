/**
 * tests/note-edit.test.js — A2 (2026-08-19): sửa ghi chú task KHÔNG bị poll phá,
 * cache byId KHÔNG giữ node detach.
 *  - byId: node bị thay qua innerHTML → document.contains trả false → query lại
 *    (trước: cache vĩnh viễn node detach → saveTaskNote đọc .value trên textarea cũ).
 *  - renderTaskNote: đang sửa ghi chú (#taskNoteEdit trong DOM) → giữ editor,
 *    không re-render (poll đồng bộ giữa lúc gõ sẽ xóa textarea → mất nội dung).
 *  - cancel/save phải truyền force=true (render lại chắc chắn, không kẹt editor).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'js.html'), 'utf8');

// ===== byId =====
function extractById() {
  const m = src.match(/  var _byIdCache = \{\};\n([\s\S]*?)\n  \}\n/);
  assert.ok(m, 'phải tìm thấy khối var _byIdCache');
  return 'var _byIdCache = {};\n' + m[1] + '\n}';
}

function runById(doc) {
  const ctx = {
    document: doc,
  };
  vm.createContext(ctx);
  vm.runInContext(extractById(), ctx);
  return ctx;
}

test('byId: node còn trong document → cache (chỉ query 1 lần)', () => {
  let queries = 0;
  const els = { foo: { tagName: 'DIV' } };
  const doc = {
    getElementById(id) { queries++; return els[id] || null; },
    contains(node) { return node === els.foo; },
  };
  const ctx = runById(doc);
  assert.equal(ctx.byId('foo'), els.foo);
  assert.equal(ctx.byId('foo'), els.foo);
  assert.equal(queries, 1, 'node còn trong document → dùng cache, không query lại');
});

test('byId: node bị detach (thay qua innerHTML) → query lại (không đọc node cũ)', () => {
  let queries = 0;
  const els = { foo: { tagName: 'DIV' } };
  const doc = {
    getElementById(id) { queries++; return els[id] || null; },
    contains() { return false; }, // node đã bị gỡ khỏi document
  };
  const ctx = runById(doc);
  ctx.byId('foo');
  ctx.byId('foo');
  assert.equal(queries, 2, 'node detach → cache bị bỏ, query lại mỗi lần');
});

test('byId: document không có contains (mock cũ) → fallback cache, không crash', () => {
  let queries = 0;
  const els = { foo: { tagName: 'DIV' } };
  const doc = {
    getElementById(id) { queries++; return els[id] || null; },
    // không có contains — mock test scan-poll
  };
  const ctx = runById(doc);
  assert.equal(ctx.byId('foo'), els.foo);
  assert.equal(ctx.byId('foo'), els.foo);
  assert.equal(queries, 1, 'không có contains → giữ hành vi cũ (cache)');
});

test('byId: id không tồn tại → null, không crash, query lại mỗi lần', () => {
  let queries = 0;
  const doc = {
    getElementById() { queries++; return null; },
    contains() { return false; },
  };
  const ctx = runById(doc);
  assert.equal(ctx.byId('missing'), null);
  assert.equal(ctx.byId('missing'), null);
  assert.ok(queries >= 2, 'null không cache (query lại)');
});

// ===== renderTaskNote =====
function extractRenderTaskNote() {
  const m = src.match(/function renderTaskNote\(task, force\) \{[\s\S]*?\n  \}\n/);
  assert.ok(m, 'phải tìm thấy function renderTaskNote(task, force)');
  return m[0];
}

function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function runRenderTaskNote(els) {
  const ctx = {
    esc: esc,
    byId: (id) => els[id] || null,
    document: { getElementById: (id) => els[id] || null },
  };
  vm.createContext(ctx);
  vm.runInContext(extractRenderTaskNote(), ctx);
  return ctx;
}

test('renderTaskNote: đang sửa ghi chú (textarea trong DOM) → KHÔNG phá editor', () => {
  const wrap = { innerHTML: '' };
  const els = {
    taskNoteWrap: wrap,
    taskNoteEdit: { tagName: 'TEXTAREA' }, // user đang gõ
  };
  const ctx = runRenderTaskNote(els);
  ctx.renderTaskNote({ note: 'nội dung từ thiết bị khác' });
  assert.equal(wrap.innerHTML, '', 'poll re-render không được đụng wrap khi đang sửa ghi chú');
});

test('renderTaskNote: không sửa ghi chú → render bình thường', () => {
  const wrap = { innerHTML: '' };
  const els = { taskNoteWrap: wrap, taskNoteEdit: null };
  const ctx = runRenderTaskNote(els);
  ctx.renderTaskNote({ note: 'ghi chú abc' });
  assert.ok(wrap.innerHTML.indexOf('ghi chú abc') >= 0, 'note được render');
});

test('renderTaskNote: đang sửa nhưng force=true (Lưu/Huỷ) → render lại chắc chắn', () => {
  const wrap = { innerHTML: '' };
  const els = {
    taskNoteWrap: wrap,
    taskNoteEdit: { tagName: 'TEXTAREA' },
  };
  const ctx = runRenderTaskNote(els);
  ctx.renderTaskNote({ note: 'nội dung mới' }, true);
  assert.ok(wrap.innerHTML.indexOf('nội dung mới') >= 0, 'force render bỏ qua trạng thái sửa');
});

// ===== Lưu/Huỷ ghi chú truyền force =====
test('cancelTaskNote/saveTaskNote truyền force=true; renderScanView giữ không force (poll không phá editor)', () => {
  assert.ok(src.indexOf('renderTaskNote(CURRENT_TASK, true);') >= 0,
    'Lưu/Huỷ ghi chú phải gọi renderTaskNote với force=true (không kẹt editor)');
  assert.ok(/renderTaskNote\(data\.task\);/.test(src),
    'đường poll (renderScanView) phải gọi renderTaskNote KHÔNG force — giữ editor khi đang sửa');
});