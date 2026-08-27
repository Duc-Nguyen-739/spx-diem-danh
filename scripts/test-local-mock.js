/**
 * scripts/test-local-mock.js — Tự động test UI trên LOCAL MOCK (file://) qua CDP.
 *
 * Port từ attendance-portal/scripts/test-local-mock.js (2026-08-13) sang spx-diem-danh
 * (Điểm Danh HN2 SOC kiosk) — giữ cùng cơ chế Chrome headless + CDP WebSocket (Node 22+,
 * không cần thư viện). Khác biệt chính:
 *   - build-local.js dùng inline-html.js (index.html → index.local.html) thay vì regex 9 module
 *   - DOM IDs: viewList/viewScan, taskListTable/scanTable, cScanned/cAbsent/cExtra, scanInput
 *   - Counters: mock spx-diem-danh buildLog = 6 dòng (2 Có mặt / 3 '-' / 1 Dư) → S:3 A:3 E:1
 *
 * Usage:
 *   node scripts/test-local-mock.js
 *
 * Yêu cầu: Chrome đang chạy với --remote-debugging-port=9222 (hoặc script tự spawn
 * headless riêng). Mở tab file://.../index.local.html → mock-google.js tự nạp (LOCAL).
 * Chạy chuỗi test rồi in PASS/FAIL, exit code 0/1.
 */
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
try { if (typeof WebSocket === 'undefined') globalThis.WebSocket = require('ws'); } catch (e) {}
const { build } = require('./build-local.js');

build();

const CDP_PORT = 9222;
const CDP_HTTP = 'http://127.0.0.1:' + CDP_PORT;
const INDEX_FILE = 'file:///' + path.resolve(__dirname, '..', 'index.local.html').replace(/\\/g, '/');
const SETTLE_MS = 600;
const LOAD_WAIT_MS = 2800;

let chromeProc = null;
async function ensureCdp() {
  try {
    await httpGet('/json/version');
    return;
  } catch (e) { /* chưa mở */ }
  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'diem-danh-hn2-soc-mock-'));
  const exe = process.env.CHROME_PATH || [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium',
  ].find((p) => fs.existsSync(p)) || 'google-chrome';
  console.log('Boot Chrome headless (CDP port ' + CDP_PORT + ')...');
  chromeProc = spawn(exe, [
    '--headless=new',
    '--remote-debugging-port=' + CDP_PORT,
    '--user-data-dir=' + userDataDir,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    // Container/CI cần --no-sandbox; máy thường no-op an toàn
    '--no-sandbox',
    'about:blank',
  ], { stdio: 'ignore' });
  for (let i = 0; i < 20; i++) {
    await sleep(500);
    try { await httpGet('/json/version'); return; } catch (e) { /* retry */ }
  }
  throw new Error('Không mở được CDP port sau 10s');
}

function httpGet(p, method) {
  return new Promise((resolve, reject) => {
    const req = http.request(CDP_HTTP + p, { method: method || 'GET' }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(new Error('Bad JSON: ' + data.slice(0, 80))); } });
    });
    req.on('error', reject);
    req.end();
  });
}

let msgId = 0;
const pending = new Map();
const WS_CONNECT_TIMEOUT_MS = 10000;
const WS_SEND_TIMEOUT_MS = 15000;
let userDataDir = null;
function rejectAllPending(err) {
  pending.forEach((p) => {
    if (p.timeout) clearTimeout(p.timeout);
    p.reject(err);
  });
  pending.clear();
}
function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    let ws;
    const to = setTimeout(() => {
      try { ws && ws.close(); } catch (e) {}
      reject(new Error('WS connect timeout'));
    }, WS_CONNECT_TIMEOUT_MS);
    ws = new WebSocket(wsUrl);
    ws.onopen = () => { clearTimeout(to); resolve(ws); };
    ws.onerror = (e) => { clearTimeout(to); reject(new Error('WS error: ' + (e && e.message))); };
    ws.onclose = () => { clearTimeout(to); rejectAllPending(new Error('WS closed')); };
  });
}
function send(ws, method, params) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    const to = setTimeout(() => {
      pending.delete(id);
      reject(new Error('CDP timeout: ' + method));
    }, WS_SEND_TIMEOUT_MS);
    pending.set(id, { resolve, reject, timeout: to });
    ws.send(JSON.stringify({ id, method, params: params || {} }));
  });
}
function setupListener(ws) {
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      if (p.timeout) clearTimeout(p.timeout);
      if (msg.error) p.reject(new Error(msg.error.message));
      else p.resolve(msg.result);
    }
  };
  ws.onclose = () => rejectAllPending(new Error('WS closed'));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
function check(name, cond, detail) {
  results.push({ name, pass: !!cond, detail });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

async function evalIn(ws, expression) {
  const res = await send(ws, 'Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (res.exceptionDetails) return { err: (res.exceptionDetails.exception && res.exceptionDetails.exception.description) || 'exception' };
  return { value: res.result && res.result.value };
}

async function main() {
  let target = null;
  let ws = null;
  try {
  console.log('INDEX:', INDEX_FILE);
  await ensureCdp();

  target = await httpGet('/json/new?' + encodeURIComponent(INDEX_FILE), 'PUT');
  console.log('Opened tab:', target.id);
  await sleep(LOAD_WAIT_MS);

  ws = await connect(target.webSocketDebuggerUrl);
  setupListener(ws);
  await send(ws, 'Runtime.enable');

  const load = await evalIn(ws, `JSON.stringify({
    title: document.title,
    hasMock: !!(window.google && window.google.script && window.google.script.run),
    metaLoaded: !!(window.META && window.META.appTitle),
    appTitle: window.META ? window.META.appTitle : null,
    hasViewList: !!document.getElementById('viewList'),
    hasScanTable: !!document.getElementById('scanTable'),
    hasTaskList: !!document.getElementById('taskListTable'),
  })`);
  const L = load.err ? null : JSON.parse(load.value);
  check('App load + mock nạp (google.script.run)', !!(L && L.hasMock && L.metaLoaded), L ? L.appTitle + ' / ' + L.title : load.err);
  check('Meta appTitle = LOCAL MOCK', !!(L && L.metaLoaded && /LOCAL MOCK/.test(L.appTitle)), L && L.appTitle);
  check('DOM đủ: viewList + scanTable + taskListTable', !!(L && L.hasViewList && L.hasScanTable && L.hasTaskList));

  const tl = await evalIn(ws, `JSON.stringify((function(){
    var rows = document.querySelectorAll('#taskListBody tr');
    if (!rows.length) {
      var cards = document.querySelectorAll('.task-card');
      return { count: cards.length, first: cards[0] ? cards[0].innerText.slice(0,120) : '', mode: 'cards' };
    }
    return { count: rows.length, first: rows[0] ? rows[0].innerText.slice(0,120) : '', mode: 'table' };
  })())`);
  const TL = tl.err ? null : JSON.parse(tl.value);
  check('Task list render ≥ 1 dòng', !!(TL && TL.count >= 1), TL ? TL.count + ' rows (' + TL.mode + ')' : tl.err);

  const open = await evalIn(ws, `(function(){
    if (typeof openScan !== 'function') return 'no-openScan';
    var first = document.querySelector('#taskListBody tr');
    var id = first && first.getAttribute('data-task-id');
    if (!id) { var card = document.querySelector('.task-card'); id = card && card.getAttribute('data-id'); }
    if (!id) { var m = document.body.innerText.match(/R\\d{8}-\\d{4}/); id = m ? m[0] : null; }
    if (!id) return 'no-task-id';
    openScan(id);
    return 'opened:' + id;
  })()`);
  await sleep(SETTLE_MS);
  const vs = await evalIn(ws, `JSON.stringify((function(){
    var view = document.getElementById('viewScan');
    var visible = view && !view.classList.contains('hidden');
    var rows = document.querySelectorAll('#scanTableBody tr');
    var cards = document.querySelectorAll('.scan-cards .scan-card');
    var count = rows.length || cards.length;
    return {
      visible: !!visible,
      rows: count,
      cScanned: document.getElementById('cScanned') ? document.getElementById('cScanned').innerText : null,
      cAbsent: document.getElementById('cAbsent') ? document.getElementById('cAbsent').innerText : null,
      cExtra: document.getElementById('cExtra') ? document.getElementById('cExtra').innerText : null,
      scanInput: !!document.getElementById('scanInput'),
      taskId: window.CURRENT_TASK ? window.CURRENT_TASK.taskId : null,
    };
  })())`);
  const VS = vs.err ? null : JSON.parse(vs.value);
  check('openScan → viewScan hiển thị', !!(VS && VS.visible), open.value || open.err);
  check('scanTable có dòng log', !!(VS && VS.rows >= 1), VS ? VS.rows + ' rows task=' + VS.taskId : vs.err);
  // Mock spx-diem-danh: 6 dòng (2 Có mặt + 1 Dư có scan + 3 chưa) → S:3 A:3 E:1
  // Tổng quét = S đã bao gồm Dư (hasScan), absent = chưa quét không phải Dư.
  const initOk = VS && VS.cScanned === '3' && VS.cAbsent === '3' && VS.cExtra === '1';
  check('Counter ban đầu (mock 6 dòng: 3 có mặt/Dư / 3 chưa / 1 Dư) → S:3 A:3 E:1', initOk, VS ? 'S:' + VS.cScanned + ' A:' + VS.cAbsent + ' E:' + VS.cExtra : vs.err);

  const s0 = await evalIn(ws, `JSON.stringify({
    cScanned: document.getElementById('cScanned').innerText,
    cAbsent: document.getElementById('cAbsent').innerText,
    cExtra: document.getElementById('cExtra').innerText,
  })`);
  const S0 = s0.err ? null : JSON.parse(s0.value);
  const scan1 = await evalIn(ws, `(function(){
    var input = document.getElementById('scanInput');
    input.value = 'Ops229444';
    if (typeof submitScan === 'function') submitScan();
    return 'submitted';
  })()`);
  await sleep(SETTLE_MS);
  const s1 = await evalIn(ws, `JSON.stringify({
    cScanned: document.getElementById('cScanned').innerText,
    cAbsent: document.getElementById('cAbsent').innerText,
    cExtra: document.getElementById('cExtra').innerText,
    toast: document.getElementById('toast') ? document.getElementById('toast').innerText : '',
  })`);
  const S1 = s1.err ? null : JSON.parse(s1.value);
  const scan1Ok = S1 && S0 && String(Number(S0.cScanned) + 1) === S1.cScanned && String(Number(S0.cAbsent) - 1) === S1.cAbsent;
  check('Quét Ops229444 (chưa quét) → S+1, A-1', scan1Ok, S1 ? 'before S:' + S0.cScanned + ' A:' + S0.cAbsent + ' → after S:' + S1.cScanned + ' A:' + S1.cAbsent : s1.err);

  const s1b = await evalIn(ws, `JSON.stringify({ cScanned: document.getElementById('cScanned').innerText })`);
  const S1b = s1b.err ? null : JSON.parse(s1b.value);
  const scan2 = await evalIn(ws, `(function(){
    var input = document.getElementById('scanInput');
    input.value = 'Ops237511';
    submitScan();
    return 'submitted';
  })()`);
  await sleep(SETTLE_MS);
  const s2 = await evalIn(ws, `JSON.stringify({
    cScanned: document.getElementById('cScanned').innerText,
    toast: document.getElementById('toast') ? document.getElementById('toast').innerText : '',
  })`);
  const S2 = s2.err ? null : JSON.parse(s2.value);
  check('Quét trùng Ops237511 (đã Có mặt) → S không tăng', !!(S2 && S1b && S2.cScanned === S1b.cScanned), S2 ? 'cScanned=' + S2.cScanned + ' toast=' + S2.toast.slice(0,40) : s2.err);

  const s2b = await evalIn(ws, `JSON.stringify({ cExtra: document.getElementById('cExtra').innerText })`);
  const S2b = s2b.err ? null : JSON.parse(s2b.value);
  const scan3 = await evalIn(ws, `(function(){
    var input = document.getElementById('scanInput');
    input.value = 'Ops777777';
    submitScan();
    return 'submitted';
  })()`);
  await sleep(SETTLE_MS);
  const s3 = await evalIn(ws, `JSON.stringify({
    cExtra: document.getElementById('cExtra').innerText,
    cScanned: document.getElementById('cScanned').innerText,
  })`);
  const S3 = s3.err ? null : JSON.parse(s3.value);
  const extraOk = S3 && S2b && String(Number(S2b.cExtra) + 1) === S3.cExtra;
  check('Quét NV lạ Ops777777 → Dư +1 (E+1), S+1', extraOk, S3 ? 'before E:' + S2b.cExtra + ' → after E:' + S3.cExtra + ' S:' + S3.cScanned : s3.err);

  // 8. Back về danh sách
  const back = await evalIn(ws, `(function(){
    if (typeof backToList === 'function') { backToList(); return 'back'; }
    return 'no-back';
  })()`);
  await sleep(SETTLE_MS);
  const bv = await evalIn(ws, `JSON.stringify({
    listVisible: !!(document.getElementById('viewList') && !document.getElementById('viewList').classList.contains('hidden')),
    scanHidden: !!(document.getElementById('viewScan') && document.getElementById('viewScan').classList.contains('hidden')),
  })`);
  const BV = bv.err ? null : JSON.parse(bv.value);
  check('backToList → về danh sách task', !!(BV && BV.listVisible && BV.scanHidden), back.value || back.err);

  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  console.log('\n===== SUMMARY =====');
  console.log(`PASS: ${passed} / ${results.length}  FAIL: ${failed}`);
  var _exitCode = failed > 0 ? 1 : 0;
  } catch (e) {
    console.error('ERR:', e.message);
    var _exitCode = 1;
  } finally {
    try { if (ws) ws.close(); } catch (e) {}
    try { if (target) await httpGet('/json/close/' + target.id).catch(() => {}); } catch (e) {}
    try { if (chromeProc) { chromeProc.kill(); chromeProc = null; } } catch (e) {}
    try { if (userDataDir) { fs.rmSync(userDataDir, { recursive: true, force: true }); userDataDir = null; } } catch (e) {}
    process.exit(typeof _exitCode !== 'undefined' ? _exitCode : 1);
  }
}

main().catch((e) => { console.error('ERR:', e.message); try { if (chromeProc) chromeProc.kill(); } catch(e){} try { if (userDataDir) fs.rmSync(userDataDir, {recursive:true, force:true}); } catch(e){} process.exit(1); });
