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

// ===== BUG 2026-08-19 (PC không có âm): AudioContext phải unlock tại user gesture =====
// Desktop autoplay policy chặn AudioContext tạo/resume NGOÀI user gesture — nhưng mọi
// playBeep chạy từ async callback (RPC google.script.run / camera auto-decode) → context
// tạo ra ở trạng thái suspended và resume() ngoài gesture bị chặn → câm vĩnh viễn trên
// Chrome/Edge/Firefox. Fix: tạo + resume context NGAY tại gesture đầu tiên của user.
test('js.html: phải unlock AudioContext tại user gesture (ensureAudioUnlocked + listeners)', () => {
  const i = src.indexOf('function ensureAudioUnlocked()');
  assert.ok(i >= 0, 'phải có hàm ensureAudioUnlocked');
  const block = src.slice(i, i + 700);
  assert.ok(block.indexOf("['keydown', 'mousedown', 'touchstart', 'pointerdown']") >= 0,
    'phải listen đủ keydown/mousedown/touchstart/pointerdown (capture phase)');
  assert.ok(block.indexOf('document.addEventListener(evt, unlockAudioOnGesture, true)') >= 0,
    'phải đăng ký gesture listener capture — unlock AudioContext ngay tại gesture đầu tiên');
});

test('js.html: playBeep phải dùng ensureAudioUnlocked (không tự new AudioContext trong async)', () => {
  const i = src.indexOf('function playBeep(type)');
  assert.ok(i >= 0, 'phải có playBeep');
  const block = src.slice(i, i + 160);
  assert.ok(block.indexOf('if (!ensureAudioUnlocked()) return;') >= 0,
    'playBeep phải gọi ensureAudioUnlocked — nếu tự new AudioContext trong async callback → suspended, không bao giờ phát trên PC');
});

test('js.html: toggleSound bật âm phải unlock audio ngay trong click gesture', () => {
  const i = src.indexOf('function toggleSound()');
  assert.ok(i >= 0, 'phải có toggleSound');
  const block = src.slice(i, i + 320);
  assert.ok(block.indexOf('if (SOUND_ON) ensureAudioUnlocked();') >= 0,
    'bật âm qua nút 🔊 (click = user gesture) phải unlock AudioContext ngay — không chờ lượt quét đầu');
});

// ===== BUG 2026-08-24 (review Muse B6): openScan thiếu scanBusy() guard =====
// backToList/finishTask đều chặn khi scanBusy() (queue đang xử lý) nhưng openScan không
// → bấm Quét task khác khi queue chạy → CURRENT_TASK đổi giữa chừng, response cũ render
// vào task mới (scan card/toast lệch task). Phải mirror backToList ở đầu openScan.
test('js.html: openScan phải chặn khi scanBusy() (mirror backToList)', () => {
  const i = src.indexOf('function openScan(taskId)');
  assert.ok(i >= 0, 'phải có openScan');
  const block = src.slice(i, i + 520);
  assert.ok(block.indexOf('if (scanBusy()) {') >= 0,
    'openScan phải check scanBusy() ở đầu — nếu không bấm mở task khác khi queue đang chạy sẽ render response cũ vào task sai');
  assert.ok(block.indexOf('showToast') >= 0,
    'openScan khi busy phải showToast báo user chờ');
  assert.ok(block.indexOf('return;') >= 0,
    'openScan khi busy phải return (không mở task khác)');
});