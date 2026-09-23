/**
 * tests/task-hide.test.js — Nut "An Danh" (mau 1: cong tac) trong modal Diem Danh Ca.
 *
 * Luat: TAT (mac dinh) = logic binh thuong, ai cung thay task; BAT = task an
 * khoi danh sach chung, chi thiet bi da tao thay (localStorage rc_myHiddenTasks).
 *
 * Cach load: khoi TASK-HIDE trong js.html duoc danh dau "TASK-HIDE-START"/
 * "TASK-HIDE-END". Test trich khoi do, chay trong vm voi DOM stub toi thieu
 * → test DUNG code duoc deploy, khong co ban sao lech nhau.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// ---- Load khoi TASK-HIDE tu js.html ----
const html = fs.readFileSync(path.join(__dirname, '..', 'js.html'), 'utf8');
const m = html.match(/TASK-HIDE-START([\s\S]*?)TASK-HIDE-END/);
assert.ok(m, 'js.html phai chua khoi TASK-HIDE (danh dau TASK-HIDE-START/END)');
const block = m[1].replace(/^[^\n]*\n/, '').replace(/\n\s*\/\/ ===== TASK-HIDE-END.*$/, '');

// ---- Static: markup + wiring dung code deploy ----
const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

test('index.html: hang cong tac An Danh nam giua Ghi chu va nut Tao task', () => {
  const note = indexHtml.indexOf('id="noteSectionReconcile"');
  const hide = indexHtml.indexOf('id="hideRow"');
  const actions = indexHtml.indexOf('onclick="closeCreateModal()">Hu');
  assert.ok(note >= 0 && hide > note && actions > hide, 'thu tu: Ghi chu -> hideRow -> actions');
  assert.ok(indexHtml.includes('role="switch"'), 'hideRow co role=switch');
  assert.ok(indexHtml.includes('id="hideHint"'), 'co hint text');
});

test('js.html: createTask gui isHidden + nho task an khi tao xong', () => {
  assert.ok(html.includes('isHidden: isHideRowOn()'), 'payload tao task phai co isHidden');
  assert.ok(html.includes('rememberHiddenTask(res.taskId)'), 'tao task an xong phai nho vao may minh');
});

test('js.html: mo modal reset TAT + dashboard loc task an', () => {
  assert.ok(html.includes('setHideRow(false)'), 'openCreateModal phai reset cong tac ve TAT');
  assert.ok(html.includes('_dashTasks = visibleTasks(tasks)'), 'renderDash phai loc truoc khi gan _dashTasks');
});

test('js.html: badge An cho task an cua minh (bang + card mobile)', () => {
  const hits = html.split("badge hidden").length - 1;
  assert.ok(hits >= 2, 'phai co badge An o ca renderTaskList lan taskCardHTML, thay ' + hits);
});

test('khoi TASK-HIDE chi phu thuoc DOM/localStorage (khong goi google/window/fetch)', () => {
  assert.ok(!/google\.|window\.|fetch\(/i.test(block), 'khoi khong duoc goi google/window/fetch');
});

// ---- Behavioral: trich ham that, chay voi stub ----
function makeRowEl() {
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
    textContent: '',
    setAttribute: (k, v) => { el.attrs[k] = v; },
  };
  return el;
}

let rowEl, hintEl, store;
function resetStubs() {
  rowEl = makeRowEl();
  hintEl = { textContent: '' };
  store = {};
  global.document = {
    getElementById: (id) => ({ hideRow: rowEl, hideHint: hintEl }[id] || null),
  };
  global.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
}

const ctx = vm.runInThisContext(
  '(function () {\n' + block + '\nreturn { toggleHideRow, isHideRowOn, setHideRow, getMyHiddenTasks, rememberHiddenTask, visibleTasks };\n})()'
);

test('toggleHideRow: mac dinh TAT -> bat 1 lan -> ON + aria + hint', () => {
  resetStubs();
  assert.equal(ctx.isHideRowOn(), false, 'mac dinh TAT');
  ctx.toggleHideRow();
  assert.equal(ctx.isHideRowOn(), true, 'bat sau 1 lan bam');
  assert.equal(rowEl.attrs['aria-checked'], 'true');
  assert.ok(hintEl.textContent.indexOf('Bật') >= 0 || hintEl.textContent.indexOf('bật') >= 0, 'hint bao dang bat');
});

test('toggleHideRow: bam lan 2 -> ve TAT + hint binh thuong', () => {
  resetStubs();
  ctx.toggleHideRow();
  ctx.toggleHideRow();
  assert.equal(ctx.isHideRowOn(), false, 've TAT');
  assert.equal(rowEl.attrs['aria-checked'], 'false');
  assert.ok(hintEl.textContent.indexOf('tắt') >= 0 || hintEl.textContent.indexOf('Tắt') >= 0, 'hint bao logic binh thuong');
});

test('rememberHiddenTask/getMyHiddenTasks: nho dung 1 lan, khong trung', () => {
  resetStubs();
  ctx.rememberHiddenTask('R1');
  ctx.rememberHiddenTask('R1');
  ctx.rememberHiddenTask('R2');
  assert.deepEqual(ctx.getMyHiddenTasks(), ['R2', 'R1'], 'moi nhat len dau, khong trung');
});

test('visibleTasks: an task la cua nguoi khac, giu task minh + task thuong', () => {
  resetStubs();
  ctx.rememberHiddenTask('RMINE');
  const tasks = [
    { taskId: 'R1', isHidden: false },
    { taskId: 'R2', isHidden: true },
    { taskId: 'RMINE', isHidden: true },
    { taskId: 'R3' }, // du lieu cu thieu field -> hien thi (fail-open)
  ];
  const out = ctx.visibleTasks(tasks).map((t) => t.taskId);
  assert.deepEqual(out, ['R1', 'RMINE', 'R3'], 'loc R2 (an cua nguoi khac), giu lai 3');
});

test('visibleTasks: localStorage hong -> khong crash, task an deu bi loc', () => {
  resetStubs();
  store.rc_myHiddenTasks = 'khong-phai-json{{{';
  const out = ctx.visibleTasks([{ taskId: 'R1' }, { taskId: 'R2', isHidden: true }]);
  assert.deepEqual(out.map((t) => t.taskId), ['R1'], 'storage hong van loc an toan');
});

// ---- Static: server mirror co cot isHidden ----
const dbGs = fs.readFileSync(path.join(__dirname, '..', 'Database.gs'), 'utf8');
const taskSvc = fs.readFileSync(path.join(__dirname, '..', 'TaskService.gs'), 'utf8');
const cfgGs = fs.readFileSync(path.join(__dirname, '..', 'Config.gs'), 'utf8');
const pyCfg = fs.readFileSync(path.join(__dirname, '..', 'api', 'config.py'), 'utf8');
const pyDb = fs.readFileSync(path.join(__dirname, '..', 'api', 'database.py'), 'utf8');
const pySvc = fs.readFileSync(path.join(__dirname, '..', 'api', 'services.py'), 'utf8');

test('server GAS + Python: schema isHidden mirror nhau', () => {
  assert.ok(cfgGs.includes('IS_HIDDEN: 11'), 'Config.gs co IS_HIDDEN=11');
  assert.ok(cfgGs.includes('TASK_COL_COUNT = 12'), 'Config.gs COUNT=12');
  assert.ok(dbGs.includes('isHidden: row[TASK_COLS.IS_HIDDEN]'), 'taskFromRow_ parse isHidden');
  assert.ok(dbGs.includes('task.isHidden === true'), 'insertTask_ ghi isHidden');
  assert.ok(taskSvc.includes('input.isHidden'), 'createReconcileTask doc isHidden');
  assert.ok(pyCfg.includes('"IS_HIDDEN": 11'), 'api/config.py mirror IS_HIDDEN');
  assert.ok(pyDb.includes('"isHidden"'), 'api/database.py doc/ghi isHidden');
  assert.ok(pySvc.includes('inp.get("isHidden")'), 'api/services.py doc isHidden');
});
