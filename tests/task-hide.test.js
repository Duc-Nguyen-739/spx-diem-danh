/**
 * tests/task-hide.test.js — Nut "An Danh" (mau 1: cong tac) trong modal Diem Danh Ca.
 *
 * Luat: TAT (mac dinh) = logic binh thuong, ai cung thay task; BAT = task an
 * khoi danh sach chung, chi thiet bi da tao thay (localStorage rc_myHiddenTasks)
 * — ke ca sau Ket Thuc van an voi may khac.
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

test('js.html: badge An cho task an cua minh (bang + card mobile), giu ca sau Ket Thuc', () => {
  const hits = html.split("badge hidden").length - 1;
  assert.ok(hits >= 2, 'phai co badge An o ca renderTaskList lan taskCardHTML, thay ' + hits);
  const guards = html.split("if (t.isHidden)").length - 1;
  assert.ok(guards >= 2, 'badge An hien ca sau Ket Thuc (ca 2 noi render), thay ' + guards);
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

let rowEl, hintEl, topBtn, topTx, store;
function resetStubs() {
  rowEl = makeRowEl();
  hintEl = { textContent: '' };
  topBtn = makeRowEl();
  topBtn.hidden = true;
  topTx = { textContent: '' };
  store = {};
  global.CURRENT_USER_EMAIL = '';
  global.OWNER_EMAIL = '';
  global.document = {
    getElementById: (id) => ({ hideRow: rowEl, hideHint: hintEl, btnHideTask: topBtn, hideTopbarTx: topTx }[id] || null),
  };
  global.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
}

global.TASK_STATUS_C = { OPEN: 'open', DONE: 'done' };
const ctx = vm.runInThisContext(
  '(function () {\n' + block + '\nreturn { toggleHideRow, isHideRowOn, setHideRow, getMyHiddenTasks, rememberHiddenTask, forgetHiddenTask, isHiddenFromMe, visibleTasks, setHideTopbar, syncHideTopbar };\n})()'
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

test('visibleTasks: task an DA KET THUC van an voi may khac, chi may minh thay', () => {
  resetStubs(); // may khac: khong co taskId trong may minh
  const tasks = [
    { taskId: 'R1', isHidden: true, status: 'open' },
    { taskId: 'R2', isHidden: true, status: 'done' },
    { taskId: 'R3', isHidden: false, status: 'done' },
  ];
  const out = ctx.visibleTasks(tasks).map((t) => t.taskId);
  assert.deepEqual(out, ['R3'], 'loc ca task an DA KET THUC cua nguoi khac');
  ctx.rememberHiddenTask('R2');
  const out2 = ctx.visibleTasks(tasks).map((t) => t.taskId);
  assert.deepEqual(out2, ['R2', 'R3'], 'may minh van thay task an DA KET THUC');
});

test('isHiddenFromMe: task an -> chan may khac (ke ca DONE); may minh -> qua', () => {
  resetStubs();
  assert.equal(ctx.isHiddenFromMe({ taskId: 'R1', isHidden: true, status: 'open' }), true, 'an cua nguoi khac -> chan');
  ctx.rememberHiddenTask('R1');
  assert.equal(ctx.isHiddenFromMe({ taskId: 'R1', isHidden: true, status: 'open' }), false, 'may minh -> qua');
  assert.equal(ctx.isHiddenFromMe({ taskId: 'R2', isHidden: true, status: 'done' }), true, 'an DA KET THUC cua nguoi khac -> chan');
  ctx.rememberHiddenTask('R2');
  assert.equal(ctx.isHiddenFromMe({ taskId: 'R2', isHidden: true, status: 'done' }), false, 'an DA KET THUC cua may minh -> qua');
  assert.equal(ctx.isHiddenFromMe({ taskId: 'R3', isHidden: false, status: 'open' }), false, 'khong an -> qua');
  assert.equal(ctx.isHiddenFromMe(null), false, 'null -> qua');
});

test('isHiddenFromMe: email tao task (createdBy) thay moi trang thai, moi thiet bi', () => {
  resetStubs();
  global.CURRENT_USER_EMAIL = 'me@spxexpress.com';
  assert.equal(ctx.isHiddenFromMe({ taskId: 'R1', isHidden: true, status: 'open', createdBy: 'Me@SpxExpress.com' }), false, 'creator thay task mo');
  assert.equal(ctx.isHiddenFromMe({ taskId: 'R2', isHidden: true, status: 'done', createdBy: 'me@spxexpress.com' }), false, 'creator thay task da ket thuc');
  const out = ctx.visibleTasks([
    { taskId: 'R1', isHidden: true, status: 'open', createdBy: 'me@spxexpress.com' },
    { taskId: 'R2', isHidden: true, status: 'done', createdBy: 'me@spxexpress.com' },
  ]).map((t) => t.taskId);
  assert.deepEqual(out, ['R1', 'R2'], 'creator thay het, khong can nho thiet bi');
});

test('isHiddenFromMe: email chu script (OWNER_EMAIL) thay moi task an, moi trang thai', () => {
  resetStubs();
  global.CURRENT_USER_EMAIL = 'owner@spxexpress.com';
  global.OWNER_EMAIL = 'owner@spxexpress.com';
  assert.equal(ctx.isHiddenFromMe({ taskId: 'R1', isHidden: true, status: 'open', createdBy: 'khac@spxexpress.com' }), false, 'owner thay task mo cua nguoi khac');
  assert.equal(ctx.isHiddenFromMe({ taskId: 'R2', isHidden: true, status: 'done', createdBy: 'khac@spxexpress.com' }), false, 'owner thay task ket thuc cua nguoi khac');
  assert.equal(ctx.isHiddenFromMe({ taskId: 'R3', isHidden: true, status: 'done', createdBy: 'web' }), false, 'owner thay ca task kiosk anonymous');
});

test('isHiddenFromMe: email la van bi loc theo thiet bi cu (open + done)', () => {
  resetStubs();
  global.CURRENT_USER_EMAIL = 'la@spxexpress.com';
  global.OWNER_EMAIL = 'owner@spxexpress.com';
  assert.equal(ctx.isHiddenFromMe({ taskId: 'R1', isHidden: true, status: 'open', createdBy: 'khac@spxexpress.com' }), true, 'email la -> chan task mo');
  assert.equal(ctx.isHiddenFromMe({ taskId: 'R2', isHidden: true, status: 'done', createdBy: 'khac@spxexpress.com' }), true, 'email la -> chan ca task ket thuc');
  ctx.rememberHiddenTask('R1');
  assert.equal(ctx.isHiddenFromMe({ taskId: 'R1', isHidden: true, status: 'open', createdBy: 'khac@spxexpress.com' }), false, 'may tung tao/mo task (da nho taskId) van thay — giu logic thiet bi cu');
});

test('forgetHiddenTask: tat An Danh -> xoa khoi may minh', () => {
  resetStubs();
  ctx.rememberHiddenTask('R1');
  ctx.forgetHiddenTask('R1');
  assert.deepEqual(ctx.getMyHiddenTasks(), [], 'da xoa');
  assert.equal(ctx.isHiddenFromMe({ taskId: 'R1', isHidden: true, status: 'open' }), true, 'xoa xong -> lai bi chan');
});

test('setHideTopbar/syncHideTopbar: nut chi hien khi task DANG MO', () => {
  resetStubs();
  ctx.syncHideTopbar({ taskId: 'R1', isHidden: false, status: 'open' });
  assert.equal(topBtn.hidden, false, 'task mo -> co nut');
  assert.equal(topTx.textContent, 'Ẩn Danh: Tắt');
  ctx.syncHideTopbar({ taskId: 'R1', isHidden: true, status: 'open' });
  assert.ok(topBtn.classList.contains('on'), 'dang an -> nut ON');
  assert.equal(topTx.textContent, 'Ẩn Danh: Bật');
  assert.equal(topBtn.attrs['aria-pressed'], 'true');
  ctx.syncHideTopbar({ taskId: 'R1', isHidden: true, status: 'done' });
  assert.equal(topBtn.hidden, true, 'Ket Thuc -> an nut');
  ctx.syncHideTopbar(null);
  assert.equal(topBtn.hidden, true, 'null -> an nut');
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

test('index.html: nut An Danh topbar nam giua Chuyen Tiep va Hoan Thanh', () => {
  const t = indexHtml.indexOf('id="btnTransferList"');
  const h = indexHtml.indexOf('id="btnHideTask"');
  const f = indexHtml.indexOf('id="btnFinish"');
  assert.ok(t >= 0 && h > t && f > h, 'thu tu: Chuyen Tiep -> btnHideTask -> Hoan Thanh');
  assert.ok(indexHtml.includes('onclick="toggleTaskHidden()"'), 'nut goi toggleTaskHidden');
  assert.ok(indexHtml.includes('id="hideTopbarTx"'), 'co nhan trang thai topbar');
});

test('js.html: gate chan mo task an + dong bo nut + RPC doi co', () => {
  assert.ok(html.includes('isHiddenFromMe(res.task)'), 'loadTaskDetail gate truoc renderScanView');
  assert.ok(html.includes('Task đang Ẩn Danh'), 'toast chan ro rang');
  assert.ok(html.includes('syncHideTopbar(data.task)'), 'renderScanView dong bo nut');
  assert.ok(html.includes('renderTaskList(visibleTasks(tasks))'), 'ket qua tim kiem loc task an');
  assert.ok(html.includes('.updateTaskHiddenApi(t.taskId, to)'), 'toggleTaskHidden goi RPC doi co');
  assert.ok(html.includes('!isHiddenFromMe(CURRENT_TASK)'), 'nhanh cache openScan cung gate task an');
});

test('server GAS + Python: API doi co An Danh mirror nhau + whitelist', () => {
  const codeGs = fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8');
  const jsonpGs = fs.readFileSync(path.join(__dirname, '..', 'JsonpApi.gs'), 'utf8');
  const pyMain = fs.readFileSync(path.join(__dirname, '..', 'api', 'main.py'), 'utf8');
  assert.ok(codeGs.includes('function updateTaskHiddenApi(taskId, isHidden)'), 'Code.gs co API');
  assert.ok(taskSvc.includes('function updateTaskHidden(taskId, isHidden)'), 'TaskService.gs co nghiep vu');
  assert.ok(taskSvc.includes('Task đã kết thúc'), 'chi task OPEN doi duoc');
  assert.ok(jsonpGs.includes('updateTaskHiddenApi'), 'whitelist JSONP co API moi');
  assert.ok(pyMain.includes('"updateTaskHiddenApi"'), 'whitelist Python co API moi');
});

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
