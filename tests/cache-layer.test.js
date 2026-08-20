/**
 * tests/cache-layer.test.js — Node thuần (không cần GAS runtime).
 * Test CacheLayer.gs (tách từ Database.gs 2026-08-11): cache_/cachedJson_/
 * getTimeZone_/formatTime_/formatDateTime_/formatDateShort_.
 *
 * CacheLayer gọi GAS API (CacheService/Session/Utilities) + hằng số từ Config.gs
 * (CACHE_KEYS/CACHE_TTL) + normalizeStaffDate_ (CsvUtil). Test mock toàn bộ global
 * này trước khi require — test ĐÚNG code được deploy (không bản sao).
 */
const test = require('node:test');
const assert = require('node:assert/strict');

// ===== Mock GAS + Config globals (trước khi require CacheLayer) =====
const store = new Map(); // cache store: key -> { value, ttl }

global.CacheService = {
  getScriptCache: function () {
    return {
      get: function (k) { const e = store.get(k); return e ? e.value : null; },
      put: function (k, v, ttl) { store.set(k, { value: v, ttl: ttl }); },
      remove: function (k) { store.delete(k); },
    };
  },
};

let tzCalls = 0;
global.Session = {
  getScriptTimeZone: function () { tzCalls++; return 'Asia/Ho_Chi_Minh'; },
};

const logCalls = [];
global.Logger = {
  log: function (msg) { logCalls.push(String(msg)); },
  warn: function () {},
  error: function () {},
};

const fmtCalls = [];
global.Utilities = {
  formatDate: function (date, tz, pattern) {
    fmtCalls.push({ tz: tz, pattern: pattern });
    // Giả lập: trả pattern đã thay thế theo giờ cố định 08:30:45
    if (pattern === 'HH:mm:ss') return '08:30:45';
    return '2026-08-02 08:30:45';
  },
};

global.CACHE_KEYS = { TZ: 'rc2_tz_v2', STAFF_INDEX: 'rc2_staffIndex_v1' };
global.CACHE_TTL = { TZ: 86400, STAFF_INDEX: 300, TASK_LIST: 10 };

// CsvUtil.normalizeStaffDate_ — giả lập đúng hành vi (Date → yyyy-MM-dd)
global.normalizeStaffDate_ = function (date) {
  if (date instanceof Date && !isNaN(date.getTime())) {
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  }
  return String(date || '').trim();
};

const CacheLayer = require('../CacheLayer.gs');

// Cleanup global sau test (không làm ô nhiễm các test khác)
test.after(() => {
  delete global.CacheService;
  delete global.Session;
  delete global.Utilities;
  delete global.CACHE_KEYS;
  delete global.CACHE_TTL;
  delete global.normalizeStaffDate_;
});

// ===== cachedJson_ =====
test('cachedJson_: cache hit → trả giá trị parse từ cache, KHÔNG gọi load', () => {
  store.set('k-hit', { value: JSON.stringify({ a: 1 }), ttl: 30 });
  let loaded = 0;
  const v = CacheLayer.cachedJson_('k-hit', function () { loaded++; return { a: 999 }; }, 30);
  assert.deepEqual(v, { a: 1 });
  assert.equal(loaded, 0, 'cache hit không gọi load');
});

test('cachedJson_: cache miss → gọi load + put cache', () => {
  store.delete('k-miss');
  let loaded = 0;
  const v = CacheLayer.cachedJson_('k-miss', function () { loaded++; return { b: 2 }; }, 30);
  assert.deepEqual(v, { b: 2 });
  assert.equal(loaded, 1);
  assert.equal(store.get('k-miss').value, JSON.stringify({ b: 2 }));
  assert.equal(store.get('k-miss').ttl, 30);
});

test('cachedJson_: cache hỏng (JSON invalid) → rebuild + log, không crash', () => {
  store.set('k-bad', { value: '{not-json', ttl: 30 });
  let loaded = 0;
  const v = CacheLayer.cachedJson_('k-bad', function () { loaded++; return { c: 3 }; }, 30);
  assert.deepEqual(v, { c: 3 });
  assert.equal(loaded, 1, 'cache parse fail → rebuild');
});

test('cachedJson_: put fail (quota) → vẫn trả value (fallback an toàn)', () => {
  store.delete('k-putfail');
  const origPut = CacheService.getScriptCache().put;
  CacheService.getScriptCache().put = function () { throw new Error('Exceeded quota'); };
  const v = CacheLayer.cachedJson_('k-putfail', function () { return { d: 4 }; }, 30);
  CacheService.getScriptCache().put = origPut;
  assert.deepEqual(v, { d: 4 }, 'put fail không chặn kết quả');
});

// ===== cachedJsonRev_ (O4 2026-08-20: invalidate bằng version thay vì remove) =====
const REV = 'rc2_taskListRev_v1';
const LST = 'rc2_taskList_v1';

test('cachedJsonRev_: lần đầu (chưa có rev) → load + self-heal rev=1', () => {
  store.delete(REV); store.delete(LST);
  let loaded = 0;
  const v = CacheLayer.cachedJsonRev_(LST, REV, function () { loaded++; return [{ id: 1 }]; }, 10);
  assert.deepEqual(v, [{ id: 1 }]);
  assert.equal(loaded, 1);
  assert.equal(store.get(REV).value, '1', 'self-heal: tạo rev key khi chưa có');
  assert.deepEqual(JSON.parse(store.get(LST).value), { v: '1', d: [{ id: 1 }] });
});

test('cachedJsonRev_: hit khi rev khớp → KHÔNG gọi load', () => {
  store.set(REV, { value: '1', ttl: 10 });
  store.set(LST, { value: JSON.stringify({ v: '1', d: [{ id: 1 }] }), ttl: 10 });
  let loaded = 0;
  const v = CacheLayer.cachedJsonRev_(LST, REV, function () { loaded++; return [{ id: 999 }]; }, 10);
  assert.deepEqual(v, [{ id: 1 }]);
  assert.equal(loaded, 0, 'rev khớp → serve cache (không rebuild)');
});

test('cachedJsonRev_: bump rev → rebuild (value cũ KHÔNG được serve)', () => {
  store.set(REV, { value: '1', ttl: 10 });
  store.set(LST, { value: JSON.stringify({ v: '1', d: [{ id: 1 }] }), ttl: 10 });
  CacheLayer.bumpCacheRev_(REV);
  assert.equal(store.get(REV).value, '2', 'bump: 1 → 2');
  assert.ok(store.get(LST), 'bump KHÔNG remove value cache');
  let loaded = 0;
  const v = CacheLayer.cachedJsonRev_(LST, REV, function () { loaded++; return [{ id: 2 }]; }, 10);
  assert.deepEqual(v, [{ id: 2 }]);
  assert.equal(loaded, 1, 'rev lệch → rebuild');
  assert.deepEqual(JSON.parse(store.get(LST).value), { v: '2', d: [{ id: 2 }] });
});

test('cachedJsonRev_: rev key mất (hết hạn) → rebuild, không serve value cũ', () => {
  store.delete(REV);
  store.set(LST, { value: JSON.stringify({ v: '1', d: [{ id: 1 }] }), ttl: 10 });
  let loaded = 0;
  const v = CacheLayer.cachedJsonRev_(LST, REV, function () { loaded++; return [{ id: 3 }]; }, 10);
  assert.deepEqual(v, [{ id: 3 }]);
  assert.equal(loaded, 1);
  assert.equal(store.get(REV).value, '1', 'self-heal lại rev sau khi mất');
});

test('cachedJsonRev_: put fail (quota) → vẫn trả value (fallback an toàn)', () => {
  store.delete(REV); store.delete(LST);
  const origPut = CacheService.getScriptCache().put;
  CacheService.getScriptCache().put = function () { throw new Error('Exceeded quota'); };
  const v = CacheLayer.cachedJsonRev_(LST, REV, function () { return [{ id: 4 }]; }, 10);
  CacheService.getScriptCache().put = origPut;
  assert.deepEqual(v, [{ id: 4 }], 'put fail không chặn kết quả');
});

test('bumpCacheRev_: lần đầu → 1, tăng dần', () => {
  store.delete(REV);
  CacheLayer.bumpCacheRev_(REV);
  assert.equal(store.get(REV).value, '1');
  CacheLayer.bumpCacheRev_(REV);
  assert.equal(store.get(REV).value, '2');
});

// ===== getTimeZone_ =====
test('getTimeZone_: cache 1 lần — không gọi Session.getScriptTimeZone lặp lại', () => {
  store.delete(CACHE_KEYS.TZ);
  tzCalls = 0;
  const tz1 = CacheLayer.getTimeZone_();
  const tz2 = CacheLayer.getTimeZone_();
  assert.equal(tz1, 'Asia/Ho_Chi_Minh');
  assert.equal(tz2, 'Asia/Ho_Chi_Minh');
  assert.equal(tzCalls, 1, 'timezone cache 1 lần (tránh gọi trong loop)');
});

// ===== format* =====
test('formatTime_: rỗng → \'\', có Date → HH:mm:ss qua Utilities', () => {
  assert.equal(CacheLayer.formatTime_(null), '');
  assert.equal(CacheLayer.formatTime_(undefined), '');
  const s = CacheLayer.formatTime_(new Date('2026-08-02T08:30:45'));
  assert.equal(s, '08:30:45');
  const last = fmtCalls[fmtCalls.length - 1];
  assert.equal(last.pattern, 'HH:mm:ss');
  assert.equal(last.tz, 'Asia/Ho_Chi_Minh');
});

test('formatDateTime_: rỗng → \'\', có Date → yyyy-MM-dd HH:mm:ss', () => {
  assert.equal(CacheLayer.formatDateTime_(null), '');
  const s = CacheLayer.formatDateTime_(new Date('2026-08-02T08:30:45'));
  assert.equal(s, '2026-08-02 08:30:45');
});

test('formatDateShort_: rỗng → \'\', Date → yyyy-MM-dd (ủy quyền normalizeStaffDate_)', () => {
  assert.equal(CacheLayer.formatDateShort_(null), '');
  assert.equal(CacheLayer.formatDateShort_(new Date(2026, 7, 3)), '2026-08-03');
  assert.equal(CacheLayer.formatDateShort_('8/1/2026'), '8/1/2026'); // string → giữ nguyên (normalize xử lý)
});
