'use strict';
// tests/code-doget.test.js — Simulation đường serve GAS: doGet phải trả về HTML
// TỰ CHỨA (css.html + js.html đã inline), không còn tag link/script src ngoài.
//
// Nạp Code.gs vào vm với mock GAS API (giống môi trường thật nhất có thể):
// HtmlService.createHtmlOutputFromFile('index'|'css'|'js') đọc file thật từ đĩa
// (đuôi .html implicit), phần còn lại (SpreadsheetApp/CacheService/...) mock rỗng.

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
const context = {
  console, JSON, Date, Math, Object, Array, String, Number, Boolean, isNaN, parseFloat, parseInt,
  // HtmlService: createHtmlOutputFromFile đọc file thật (đuôi .html implicit)
  HtmlService: {
    XFrameOptionsMode: { DEFAULT: 0 },
    createHtmlOutputFromFile: (name) => {
      const file = path.join(ROOT, name + '.html');
      const content = fs.readFileSync(file, 'utf8');
      const out = {
        getContent: () => content,
        setContent: (c) => { lastHtmlContent = c; return out; },
        setTitle: () => out,
        addMetaTag: () => out,
        setXFrameOptionsMode: () => out,
      };
      return out;
    },
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

test('doGet trả HTML tự chứa: CSS + JS inline, không còn asset ngoài', () => {
  const out = context.doGet({});
  assert.ok(out, 'doGet không trả output');
  assert.ok(lastHtmlContent, 'setContent chưa được gọi (mock lỗi)');

  const css = fs.readFileSync(path.join(ROOT, 'css.html'), 'utf8');
  const js = fs.readFileSync(path.join(ROOT, 'js.html'), 'utf8');
  const html = lastHtmlContent;

  // cấu trúc + mock loader + marker
  assert.ok(html.startsWith('<!DOCTYPE html>'), 'mất DOCTYPE');
  assert.ok(html.includes('</html>'), 'mất </html>');
  assert.ok(html.includes('<!-- ================= VIEW 1: Tạo task / danh sách ================='), 'mất VIEW 1');
  assert.ok(html.includes("document.write('<script src=\"mock/mock-google.js?v='"), 'mất mock loader');

  // CSS + JS nguyên bản
  assert.ok(html.includes('<style>' + css + '</style>'), 'CSS thiếu/khác');
  assert.ok(html.includes('<script>' + js + '</script>'), 'JS thiếu/khác');

  // không còn asset ngoài
  assert.ok(!html.includes('href="css.html"'), 'còn link css.html');
  assert.ok(!html.includes('src="js.html"'), 'còn script src js.html');

  // cân bằng tag
  const count = (re) => (html.match(re) || []).length;
  assert.strictEqual(count(/<style>/g), count(/<\/style>/g), 'style mất cân bằng');
  assert.strictEqual(count(/<script>/g), count(/<\/script>/g), 'script mất cân bằng');

  // không lẫn nội dung css vào js (thứ tự giữ nguyên: css trước, js sau)
  assert.ok(html.indexOf('<style>') < html.indexOf('<script>'), 'thứ tự css/js sai');
});

test('inlineInclude_ giữ nguyên html khi thiếu tag (không crash)', () => {
  const html = '<html>không có tag</html>';
  const out = context.inlineInclude_(html, '<link rel="stylesheet" href="css.html">', '<style>', '</style>', 'css');
  assert.strictEqual(out, html, 'phải giữ nguyên khi thiếu tag');
});

test('inlineInclude_ giữ nguyên html khi file thiếu (không crash)', () => {
  const html = '<html><link rel="stylesheet" href="css.html"></html>';
  const out = context.inlineInclude_(html, '<link rel="stylesheet" href="css.html">', '<style>', '</style>', 'khong-ton-tai');
  assert.strictEqual(out, html, 'phải giữ nguyên khi thiếu file');
});
