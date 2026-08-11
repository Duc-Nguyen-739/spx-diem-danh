'use strict';
// tests/code-doget.test.js — Simulation đường serve GAS: doGet trả HTML TỰ CHỨA
// (css.html + js.html đã nhúng qua template include), không còn scriptlet/tag ngoài.
//
// Mock HtmlService.createTemplateFromFile('index').evaluate() mô phỏng ĐÚNG cơ chế
// GAS template: đọc file thật, thay scriptlet <?!= include('css') ?> /
// <?!= include('js') ?> bằng nội dung css.html / js.html (include() đọc file thật
// qua createHtmlOutputFromFile, đuôi .html implicit). Phần còn lại mock rỗng.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');

// ---- mock GAS API ----
const sheets = {};
function mockSheet(rows) {
  return {
    getLastRow: () => rows.length,
    getLastColumn: () => (rows[0] ? rows[0].length : 0),
    getDataRange: () => ({ getValues: () => rows.map((r) => r || []) }),
    getRange: (r, c, nr, nc) => ({
      getValues: () => rows.slice(r - 1, r - 1 + (nr || 1)).map((row) => (row ? row.slice(c - 1, c - 1 + (nc || 1)) : [])),
      setValues: (vals) => { for (let i = 0; i < vals.length; i++) rows[r - 1 + i] = vals[i]; return { setFontWeight: () => {} }; },
      setFontWeight: () => {},
    }),
    appendRow: (row) => { rows.push(row); },
  };
}

const store = {};
let lastHtmlContent = '';

// Mô phỏng template evaluate: thay scriptlet bằng nội dung file include
const CSS_SC = "<?!= include('css') ?>";
const MOBILE_SC = "<?!= include('mobile') ?>";
const JS_SC = "<?!= include('js') ?>";
function evaluateTemplate(html) {
  const css = fs.readFileSync(path.join(ROOT, 'css.html'), 'utf8');
  const mobile = fs.readFileSync(path.join(ROOT, 'mobile.html'), 'utf8');
  const js = fs.readFileSync(path.join(ROOT, 'js.html'), 'utf8');
  return html.split(CSS_SC).join(css).split(MOBILE_SC).join(mobile).split(JS_SC).join(js);
}

const context = {
  console, JSON, Date, Math, Object, Array, String, Number, Boolean, isNaN, parseFloat, parseInt,
  HtmlService: {
    XFrameOptionsMode: { DEFAULT: 0 },
    // include() trong Code.gs gọi hàm này (đuôi .html implicit) — trả nội dung thật
    createHtmlOutputFromFile: (name) => {
      const content = fs.readFileSync(path.join(ROOT, name + '.html'), 'utf8');
      return { getContent: () => content };
    },
    // doGet gọi createTemplateFromFile('index').evaluate() — mô phỏng GAS evaluate
    createTemplateFromFile: (name) => ({
      evaluate: () => {
        const raw = fs.readFileSync(path.join(ROOT, name + '.html'), 'utf8');
        const content = evaluateTemplate(raw);
        const out = {
          getContent: () => content,
          setTitle: () => out,
          addMetaTag: () => out,
          setXFrameOptionsMode: () => out,
        };
        return out;
      },
    }),
  },
  ContentService: { createTextOutput: () => ({ setMimeType: () => ({}) }), MimeType: {} },
  SpreadsheetApp: {
    getActiveSpreadsheet: () => ({
      getSheetByName: (n) => (sheets[n] ? mockSheet(sheets[n].rows) : null),
      insertSheet: (n) => { sheets[n] = { rows: [] }; return mockSheet(sheets[n].rows); },
    }),
  },
  CacheService: {
    getScriptCache: () => ({
      get: (k) => (store[k] !== undefined ? store[k] : null),
      put: (k, v) => { store[k] = String(v); return true; },
      remove: (k) => { delete store[k]; },
    }),
  },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => null, setProperty: () => {} }) },
  LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
  Session: { getScriptTimeZone: () => 'Asia/Ho_Chi_Minh', getActiveUser: () => ({ getEmail: () => '' }) },
  Utilities: { formatDate: (d, tz, fmt) => '2026-08-11', sleep: () => {} },
  Logger: { log: () => {}, warn: () => {}, error: () => {} },
};
context.globalThis = context;
vm.createContext(context);

// nạp theo thứ tự phụ thuộc (như GAS share global scope)
for (const f of ['Config.gs', 'CacheLayer.gs', 'ScanLogic.gs', 'Database.gs', 'Code.gs']) {
  try {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), context, { filename: f });
  } catch (e) {
    console.error('FAIL nạp ' + f + ':', e.message);
    process.exit(1);
  }
}

test('doGet trả HTML tự chứa: css + js nhúng đầy đủ, không scriptlet/tag ngoài', () => {
  const out = context.doGet({});
  assert.ok(out, 'doGet không trả output');
  const content = out.getContent();
  assert.ok(content, 'output không có content');

  const css = fs.readFileSync(path.join(ROOT, 'css.html'), 'utf8');
  const js = fs.readFileSync(path.join(ROOT, 'js.html'), 'utf8');

  // cấu trúc + mock loader + marker
  assert.ok(content.startsWith('<!DOCTYPE html>'), 'mất DOCTYPE');
  assert.ok(content.includes('</html>'), 'mất </html>');
  assert.ok(content.includes('<!-- ================= VIEW 1: Tạo task / danh sách ================='), 'mất VIEW 1');
  assert.ok(content.includes("document.write('<script src=\"mock/mock-google.js?v='"), 'mất mock loader');

  // CSS + mobile + JS nguyên bản (wrapper nằm trong css.html/mobile.html/js.html)
  assert.ok(content.includes(css), 'CSS thiếu/khác');
  const mobile = fs.readFileSync(path.join(ROOT, 'mobile.html'), 'utf8');
  assert.ok(content.includes(mobile), 'mobile CSS thiếu/khác');
  assert.ok(content.includes(js), 'JS thiếu/khác');

  // không còn scriptlet / tag ngoài
  assert.ok(!content.includes(CSS_SC) && !content.includes(MOBILE_SC) && !content.includes(JS_SC), 'còn scriptlet');
  assert.ok(!content.includes('href="css.html"') && !content.includes('src="js.html"') && !content.includes('src="mobile.html"'), 'còn tag ngoài');

  // cân bằng tag
  const count = (re) => (content.match(re) || []).length;
  assert.strictEqual(count(/<style>/g), count(/<\/style>/g), 'style mất cân bằng');
  assert.strictEqual(count(/<script>/g), count(/<\/script>/g), 'script mất cân bằng');

  // thứ tự css trước js
  assert.ok(content.indexOf('<style>') < content.indexOf('<script>'), 'thứ tự css/js sai');
});

test('include() trả nội dung file .html (đuôi implicit)', () => {
  const css = fs.readFileSync(path.join(ROOT, 'css.html'), 'utf8');
  assert.strictEqual(context.include('css'), css, 'include(css) khác nội dung css.html');
});
