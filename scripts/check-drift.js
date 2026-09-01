/**
 * scripts/check-drift.js — Drift checker dual runtime (FIX-23, 2026-08-29).
 *
 * Dual runtime: GAS (*.gs) là webapp chính + backend Python (api/*.py) song song —
 * cùng domain logic PHẢI mirror nhau. Trước đây không có gate tự động → mirror drift
 * (vd resolveMealMoveMode_ đổi behavior mà docstring Python không theo kịp).
 *
 * So sánh cấu trúc (không so text từng dòng — 2 ngôn ngữ):
 *   1. ScanLogic.gs   ↔ api/scanlogic.py  : tên hàm (camel↔snake) + reason strings
 *   2. Config.gs      ↔ api/config.py     : DUPLICATE_WINDOW_MS, STATUS/TASK_STATUS/UI_LABELS keys
 *
 * Exit 1 khi có drift. Cũng dùng làm test: tests/drift.test.js require `checkDrift()`.
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function snakeToCamel(s) {
  return s.replace(/_([a-z0-9])/g, (m, c) => c.toUpperCase());
}

function extractGasFunctions(src) {
  const out = new Set();
  const re = /^function ([A-Za-z0-9_]+)\s*\(/gm;
  let m;
  while ((m = re.exec(src))) out.add(m[1]);
  return out;
}

function extractPyFunctions(src) {
  const out = new Set();
  const re = /^def ([a-z0-9_]+)\s*\(/gm;
  let m;
  while ((m = re.exec(src))) out.add(snakeToCamel(m[1]));
  return out;
}

function extractPyStringConstants(src, key) {
  // api/config.py: module-level dict — ^KEY = { "ENTRY": "giá trị", ... }
  // (KHÔNG khớp quoted key "STATUS" trong TASK_COLS — phải anchor ^KEY = {)
  const out = new Map();
  const re = new RegExp('^' + key + '\\s*=\\s*\\{([\\s\\S]*?)\\n\\}', 'm');
  const m = src.match(re);
  if (!m) return out;
  const inner = m[1];
  const reEntry = /"([A-Z_0-9]+)"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
  let e;
  while ((e = reEntry.exec(inner))) out.set(e[1], e[2]);
  return out;
}

function extractGsStringConstants(src, varName) {
  // const STATUS = { PENDING: '-', ... } — GAS object literal
  const out = new Map();
  const re = new RegExp('const ' + varName + '\\s*=\\s*\\{([\\s\\S]*?)\\n\\};', 'm');
  const m = src.match(re);
  if (!m) return out;
  const inner = m[1];
  const reEntry = /([A-Z_0-9]+)\s*:\s*'((?:[^'\\]|\\.)*)'/g;
  let e;
  while ((e = reEntry.exec(inner))) out.set(e[1], e[2]);
  return out;
}

function extractReasons(src) {
  // reject reason strings — cả 2 runtime dùng cùng chuỗi kebab-case
  const out = new Set();
  const re = /['"]([a-z]+(?:-[a-z]+)+)['"]/g;
  const KNOWN_PREFIX = ['task', 'already', 'empty', 'stale'];
  let m;
  while ((m = re.exec(src))) {
    if (KNOWN_PREFIX.some((p) => m[1].startsWith(p))) out.add(m[1]);
  }
  return out;
}

function compareSet(a, b, label, drifts) {
  for (const x of a) if (!b.has(x)) drifts.push(label + ': CHỈ bên GAS thiếu mirror Python → "' + x + '"');
  for (const x of b) if (!a.has(x)) drifts.push(label + ': CHỈ bên Python thiếu mirror GAS → "' + x + '"');
}

function compareConstMap(gsMap, pyMap, label, drifts) {
  for (const [k, v] of gsMap) {
    if (!pyMap.has(k)) { drifts.push(label + ': key ' + k + ' thiếu ở api/config.py'); continue; }
    if (String(pyMap.get(k)) !== String(v)) drifts.push(label + ': ' + k + ' lệch giá trị — GAS="' + v + '" vs Python="' + pyMap.get(k) + '"');
  }
  for (const k of pyMap.keys()) {
    if (!gsMap.has(k)) drifts.push(label + ': key ' + k + ' chỉ có ở api/config.py (thiếu Config.gs)');
  }
}

function checkDrift() {
  const drifts = [];

  // ===== 1. ScanLogic.gs ↔ api/scanlogic.py =====
  const gsLogic = read('ScanLogic.gs');
  const pyLogic = read('api/scanlogic.py');

  // Chỉ so các hàm domain cốt lõi (GAS có thêm helper chỉ-GAS như hàm wrapper)
  const CORE = ['classifyScan', 'classifyMealMoveScan', 'computeCounters', 'findLogRow', 'buildExtraRow', 'buildMealMoveExtraRow'];
  const gsFns = extractGasFunctions(gsLogic);
  const pyFns = extractPyFunctions(pyLogic);
  for (const fn of CORE) {
    if (!gsFns.has(fn)) drifts.push('ScanLogic: GAS thiếu hàm ' + fn);
    if (!pyFns.has(fn)) drifts.push('ScanLogic: api/scanlogic.py thiếu mirror ' + fn);
  }

  // Reason strings — contract client phụ thuộc
  compareSet(extractReasons(gsLogic), extractReasons(pyLogic), 'ScanLogic reject reason', drifts);

  // ===== 2. Config.gs ↔ api/config.py =====
  const gsCfg = read('Config.gs');
  const pyCfg = read('api/config.py');

  const gsDup = gsCfg.match(/DUPLICATE_WINDOW_MS\s*=\s*(\d+)/);
  const pyDup = pyCfg.match(/DUPLICATE_WINDOW_MS\s*=\s*(\d+)/);
  if (!gsDup || !pyDup) drifts.push('Config: DUPLICATE_WINDOW_MS không tìm thấy ở 1 trong 2 runtime');
  else if (gsDup[1] !== pyDup[1]) drifts.push('Config: DUPLICATE_WINDOW_MS lệch — GAS=' + gsDup[1] + ' vs Python=' + pyDup[1]);

  compareConstMap(extractGsStringConstants(gsCfg, 'STATUS'), extractPyStringConstants(pyCfg, 'STATUS'), 'Config.STATUS', drifts);
  compareConstMap(extractGsStringConstants(gsCfg, 'TASK_STATUS'), extractPyStringConstants(pyCfg, 'TASK_STATUS'), 'Config.TASK_STATUS', drifts);
  compareConstMap(extractGsStringConstants(gsCfg, 'UI_LABELS'), extractPyStringConstants(pyCfg, 'UI_LABELS'), 'Config.UI_LABELS', drifts);
  compareConstMap(extractGsStringConstants(gsCfg, 'TASK_TYPE'), extractPyStringConstants(pyCfg, 'TASK_TYPE'), 'Config.TASK_TYPE', drifts);

  // ===== 3. Client mirrors — KHỚP server marker + cooldown sync =====
  try {
    const jsHtml = read('js.html');
    if (!jsHtml.includes('KHỚP server')) drifts.push('KHỚP server marker thiếu — js.html không có comment KHỚP server cho hàm mirror');
  } catch (e) { drifts.push('KHỚP server check: không đọc được js.html'); }
  try {
    const gsLogic2 = read('ScanLogic.gs');
    if (!gsLogic2.includes('KHỚP server')) drifts.push('KHỚP server marker thiếu — ScanLogic.gs không có comment');
  } catch (e) {}
  try {
    const camHtml = read('camera-scan.html');
    const camCool = camHtml.match(/CAM_CODE_COOLDOWN_MS\s*=\s*(\d+)/);
    if (gsDup && camCool && gsDup[1] !== camCool[1]) drifts.push('Cooldown lệch — Config.gs DUPLICATE_WINDOW_MS=' + gsDup[1] + ' vs camera-scan.html CAM_CODE_COOLDOWN_MS=' + camCool[1]);
    if (!camCool) drifts.push('Cooldown check: không tìm thấy CAM_CODE_COOLDOWN_MS trong camera-scan.html');
  } catch (e) { drifts.push('Cooldown check: không đọc được camera-scan.html'); }

  return { ok: drifts.length === 0, drifts };
}

module.exports = { checkDrift };

if (require.main === module) {
  const res = checkDrift();
  if (res.ok) {
    console.log('Drift check OK — ScanLogic.gs ↔ api/scanlogic.py + Config.gs ↔ api/config.py đồng bộ');
    process.exit(0);
  }
  console.error('DRIFT PHÁT HIỆN (' + res.drifts.length + '):');
  for (const d of res.drifts) console.error('  - ' + d);
  process.exit(1);
}
