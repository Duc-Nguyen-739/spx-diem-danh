/**
 * tests/submit-scan-guard.test.js — kiểm tra nhánh batch của submitScan (js.html):
 * mọi input.focus() trong luồng quét/paste phải có guard `!window.__RC_CAM_OPEN__`
 * để không bật bàn phím che camera khi đang quét. Bug 2026-08-18: 2 nhánh batch
 * (meal-move-batch, reconcile-batch) gọi input.focus() thiếu guard — các nhánh
 * khác (scan single) đã có sẵn.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'js.html'), 'utf8');

test('submitScan: nhánh meal-move-batch focus có guard camera', () => {
  const i = src.indexOf("submitPasteMealMoveBatch(plan.codes)");
  assert.ok(i >= 0, 'phải có nhánh meal-move-batch');
  const before = src.slice(i - 160, i);
  assert.ok(before.indexOf('input.focus()') >= 0, 'nhánh meal-move-batch phải có input.focus()');
  assert.ok(before.indexOf('if (!window.__RC_CAM_OPEN__) input.focus()') >= 0,
    'input.focus() trong nhánh meal-move-batch phải có guard !__RC_CAM_OPEN__ (trước không có → bật bàn phím che camera)');
});

test('submitScan: nhánh reconcile-batch focus có guard camera', () => {
  const i = src.indexOf("if (!plan.validCodes.length) return;");
  assert.ok(i >= 0, 'phải có nhánh reconcile-batch');
  const before = src.slice(i - 160, i);
  assert.ok(before.indexOf('input.focus()') >= 0, 'nhánh reconcile-batch phải có input.focus()');
  assert.ok(before.indexOf('if (!window.__RC_CAM_OPEN__) input.focus()') >= 0,
    'input.focus() trong nhánh reconcile-batch phải có guard !__RC_CAM_OPEN__');
});

test('submitScan: nhánh task đã kết thúc focus có guard camera (bug 2026-08-18)', () => {
  const i = src.indexOf("showToast('Task đã kết thúc', true);\n      playBeep('error');");
  assert.ok(i >= 0, 'phải có nhánh task đã kết thúc trong submitScan');
  const block = src.slice(i, i + 320);
  assert.ok(block.indexOf("if (!window.__RC_CAM_OPEN__) byId('scanInput').focus();") >= 0,
    'input.focus() ở nhánh task đã kết thúc phải có guard !__RC_CAM_OPEN__ (trước không có → bật bàn phím che camera)');
});