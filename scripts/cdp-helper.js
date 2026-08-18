/**
 * scripts/cdp-helper.js — Điều khiển Chrome qua CDP (Chrome DevTools Protocol).
 * Dùng global WebSocket (Node 22+), không cần thư viện.
 *
 * Usage:
 *   node scripts/cdp-helper.js open <url>            → mở tab mới, chờ load, in tiêu đề + text
 *   node scripts/cdp-helper.js eval <expr>           → chạy JS trong page đang active, in JSON kết quả
 *   node scripts/cdp-helper.js shot <file.png>       → chụp screenshot page đang active
 *   node scripts/cdp-helper.js list                  → danh sách tab
 *   node scripts/cdp-helper.js close                 → đóng tab đang active (do chính ta mở)
 */
const http = require('node:http');
const fs = require('node:fs');

const CDP_HTTP = 'http://127.0.0.1:9222';
const args = process.argv.slice(2);
const cmd = args[0] || 'list';

function httpGet(path, method) {
  return new Promise((resolve, reject) => {
    const req = http.request(CDP_HTTP + path, { method: method || 'GET' }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(new Error('Bad JSON: ' + data.slice(0, 80))); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

let msgId = 0;
const pending = new Map();
let selectedTabId = null;

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    ws.onopen = () => resolve(ws);
    ws.onerror = (e) => reject(new Error('WS error: ' + (e && e.message)));
  });
}

function send(ws, method, params) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params: params || {} }));
  });
}

function setupListener(ws) {
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error.message));
      else p.resolve(msg.result);
    }
  };
}

async function getActiveTab() {
  const tabs = await httpGet('/json');
  if (selectedTabId) {
    const sel = tabs.find((t) => t.type === 'page' && t.id === selectedTabId);
    if (sel) return sel;
  }
  // Ưu tiên tab do ta mở (title chứa "RollCall" hoặc URL chứa macros)
  const target = tabs.find((t) => t.type === 'page' && /macros|rollcall|scripts\.google/i.test(t.url))
    || tabs.find((t) => t.type === 'page');
  if (!target) throw new Error('Không có tab page nào');
  return target;
}

async function main() {
  if (cmd === 'select') {
    // select <tabIdPrefix> — chọn tab theo prefix id để các lệnh sau dùng.
    // args[0] là tên lệnh "select" → prefix phải ở args[1] (bug 2026-08-18:
    // đọc nhầm args[0] nên không bao giờ khớp tab).
    const prefix = args[1];
    if (!prefix) { console.log('Cần tabId prefix (xem list)'); process.exit(1); }
    const tabs = await httpGet('/json');
    const tab = tabs.find((t) => t.type === 'page' && t.id.startsWith(prefix));
    if (!tab) { console.log('Không tìm thấy tab ' + prefix); process.exit(1); }
    selectedTabId = tab.id;
    console.log('Selected: ' + tab.id);
    return;
  }
  if (cmd === 'list') {
    const tabs = await httpGet('/json');
    tabs.filter((t) => t.type === 'page').forEach((t) => {
      console.log(`[${t.id}] ${t.title} — ${t.url.slice(0, 110)}`);
    });
    return;
  }

  if (cmd === 'open') {
    const url = args[1];
    if (!url) throw new Error('Thiếu URL');
    const target = await httpGet('/json/new?' + encodeURIComponent(url), 'PUT');
    console.log('Opened:', target.id, target.url);
    return;
  }

  if (cmd === 'eval') {
    const expr = args.slice(1).join(' ');
    const tab = await getActiveTab();
    const ws = await connect(tab.webSocketDebuggerUrl);
    setupListener(ws);
    await send(ws, 'Runtime.enable');
    const res = await send(ws, 'Runtime.evaluate', {
      expression: expr,
      returnByValue: true,
      awaitPromise: true,
    });
    console.log(JSON.stringify(res.result && res.result.value !== undefined ? res.result.value : res, null, 2));
    ws.close();
    return;
  }

  if (cmd === 'shot') {
    const file = args[1] || 'shot.png';
    const tab = await getActiveTab();
    const ws = await connect(tab.webSocketDebuggerUrl);
    setupListener(ws);
    await send(ws, 'Page.enable');
    const res = await send(ws, 'Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(file, Buffer.from(res.data, 'base64'));
    console.log('Saved:', file);
    ws.close();
    return;
  }

  if (cmd === 'clearcookies') {
    const tab = await getActiveTab();
    const ws = await connect(tab.webSocketDebuggerUrl);
    setupListener(ws);
    await send(ws, 'Network.enable');
    await send(ws, 'Network.clearBrowserCookies');
    console.log('Cookies cleared');
    ws.close();
    return;
  }

  if (cmd === 'reload') {
    const tab = await getActiveTab();
    const ws = await connect(tab.webSocketDebuggerUrl);
    setupListener(ws);
    await send(ws, 'Page.enable');
    await send(ws, 'Page.reload', { ignoreCache: true });
    console.log('Reloaded:', tab.id);
    ws.close();
    return;
  }

  if (cmd === 'evalframe') {
    const expr = args.slice(1).join(' ');
    const tab = await getActiveTab();
    const ws = await connect(tab.webSocketDebuggerUrl);
    setupListener(ws);
    await send(ws, 'Page.enable');
    const tree = await send(ws, 'Page.getFrameTree');
    // Tìm frame sandbox (userCodeAppPanel / sandboxFrame)
    let targetId = null;
    const walk = (node) => {
      if (!node) return;
      if (/userCode|sandbox|usercontent/i.test(node.frame.url)) targetId = node.frame.id;
      (node.childFrames || []).forEach(walk);
    };
    walk(tree.frameTree);
    if (!targetId) { console.log('Không tìm thấy frame app'); ws.close(); return; }
    await send(ws, 'Runtime.enable');
    const ctx = await send(ws, 'Page.createIsolatedWorld', { frameId: targetId, worldName: 'rollcall-qa' });
    const res = await send(ws, 'Runtime.evaluate', {
      expression: expr,
      contextId: ctx.executionContextId,
      returnByValue: true,
      awaitPromise: true,
    });
    console.log(JSON.stringify(res.result && res.result.value !== undefined ? res.result.value : res, null, 2));
    ws.close();
    return;
  }

  if (cmd === 'click') {
    // click <x> <y> — click chuột tại tọa độ viewport (qua OOPIF vì Input.dispatchMouseEvent ở cấp page)
    const x = parseFloat(args[1]);
    const y = parseFloat(args[2]);
    if (isNaN(x) || isNaN(y)) { console.log('Cần tọa độ: click <x> <y>'); process.exit(1); }
    const tab = await getActiveTab();
    const ws = await connect(tab.webSocketDebuggerUrl);
    setupListener(ws);
    await send(ws, 'Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await send(ws, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    console.log('Clicked:', x, y);
    ws.close();
    return;
  }

  if (cmd === 'evaliframe') {
    // evaliframe <expr> — eval trong iframe GAS (OOPIF target riêng trong /json)
    // Chọn iframe MỚI NHẤT (cuối danh sách) — iframe cũ/chết nằm đầu, tab vừa mở nằm cuối.
    const expr = args.slice(1).join(' ');
    const tabs = await httpGet('/json');
    const candidates = tabs.filter((t) => t.type === 'iframe' && /userCodeAppPanel|googleusercontent/.test(t.url));
    const iframe = candidates[candidates.length - 1];
    if (!iframe) { console.log('Không thấy iframe app — mở app trước'); process.exit(1); }
    const ws = await connect(iframe.webSocketDebuggerUrl);
    setupListener(ws);
    await send(ws, 'Runtime.enable');
    const res = await send(ws, 'Runtime.evaluate', {
      expression: expr,
      returnByValue: true,
      awaitPromise: true,
    });
    console.log(JSON.stringify(res.result && res.result.value !== undefined ? res.result.value : res, null, 2));
    ws.close();
    return;
  }

  if (cmd === 'close') {
    const tab = await getActiveTab();
    const tabs = await httpGet('/json');
    const t = tabs.find((x) => x.id === tab.id && /macros|rollcall|scripts\.google/i.test(x.url));
    if (!t) { console.log('Tab đang active không phải do ta mở — không đóng'); return; }
    await httpGet('/json/close/' + tab.id);
    console.log('Closed:', tab.id);
    return;
  }

  console.log('Lệnh không biết:', cmd);
}

main().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
